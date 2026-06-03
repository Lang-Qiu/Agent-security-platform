# Asset-Scan 引擎深化拓展 — 阶段二实现计划

## Context

阶段一已完成：ClassificationService 支持 YAML 驱动的多规则推断、L0-L8 权限映射、0-100 复合风险评分，覆盖 5 种 FindingType。但当前引擎仅依赖自身探针（HTTP/WS/TCP）采集特征，无法发现泄露密钥、已知 CVE 漏洞等深层风险。

阶段二目标：**接入外部扫描器**，在远程资产发现场景下，将 Gitleaks 和 Trivy 的输出转化为引擎可消费的 `ExtractedFeature[]` 和 `Finding[]`，扩展风险评估的证据来源。

**关键约束**：当前引擎是远程资产发现（IP:Port），Semgrep 需要源码访问故暂不纳入。Gitleaks 扫描 HTTP 响应中的泄露密钥，Trivy 扫描远程 URL 的已知漏洞。

研究文档《Agent资产可利用性分析.md》Phase B 定义：建单资产判定引擎，输出 finding JSON + Markdown 报告 + 风险分布表 + 修复建议清单。

---

## 现状分析

### 当前流水线（6 步）

```
Step 1: Discovery → Asset[]
Step 2: PortScan → open ports
Step 3: ProtocolID → port-protocol map
Step 4: ProbeService.execute() → FeatureData { features[], endpoints[], probe_hits[] }
  ↓ 注入 open_port features
Step 5: FingerprintService.evaluate(featureData) → FingerprintMatchItem[]
Step 6: ClassificationService.buildResult() → AssetScanResult
```

### 集成方案：Parallel Enrichment（并行增强）

在 Step 4 和 Step 5 之间注入外部扫描器输出：

```
Step 4: ProbeService.execute() → FeatureData (含 HTTP 响应 features)
  ↓
Step 4.5: ScannerRunner.runAll(targetUrl, featureData) → ScannerResult[]
  - Gitleaks: 扫描 HTTP 响应中的泄露密钥
  - Trivy: 扫描远程 URL 的已知漏洞
  ↓ 合并 features + findings
Step 5: FingerprintService.evaluate(enrichedFeatureData)
Step 6: ClassificationService.buildResult() + 合并外部 findings
```

理由：
- 不修改现有 ProbeService 和 IProtocolHandler 接口
- 外部扫描器复用 Step 4 已采集的 HTTP 响应数据
- 输出自然流入现有指纹匹配和分类引擎

---

## 实现方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `shared/types/asset-scan.ts` | **修改** | 新增 FeatureType 值（secret_leak, cve_vulnerability） |
| `engines/asset-scan/src/scanners/` | **新建目录** | 外部扫描器适配层 |
| `engines/asset-scan/src/scanners/scanner.interface.ts` | **新建** | 统一扫描器接口 + 配置类型 |
| `engines/asset-scan/src/scanners/gitleaks.adapter.ts` | **新建** | Gitleaks CLI 适配器（扫描响应文本） |
| `engines/asset-scan/src/scanners/trivy.adapter.ts` | **新建** | Trivy CLI 适配器（扫描远程 URL） |
| `engines/asset-scan/src/scanners/runner.ts` | **新建** | 扫描器并行执行编排器 |
| `engines/asset-scan/src/runtime/pipeline.ts` | **修改** | 在 Step 4 和 Step 5 之间插入扫描器增强 |
| `engines/asset-scan/rules/risk-rules.v1.yaml` | **修改** | 新增基于扫描器输出的风险规则 |
| `engines/asset-scan/tests/scanners/` | **新建目录** | 扫描器适配器测试 |

---

### Step 1: 定义扫描器接口与类型

#### 1.1 扩展 `FeatureType`

```typescript
// shared/types/asset-scan.ts
export type FeatureType =
  | "http_header" | "http_body" | "http_status" | "api_path"
  | "response_time" | "tls_cert" | "banner" | "favicon_hash"
  | "html_title" | "cookie" | "js_variable" | "error_message"
  | "open_port" | "ws_message" | "json_key"
  // === 阶段二新增 ===
  | "secret_leak"       // Gitleaks: 泄露的密钥/Token
  | "cve_vulnerability" // Trivy: CVE 漏洞
  | "misconfig_finding" // Trivy: 配置错误
  | "dependency_risk";  // Trivy: 有风险的依赖
```

#### 1.2 新增扫描器接口

```typescript
// engines/asset-scan/src/scanners/scanner.interface.ts
export interface ScannerResult {
  tool: string;                    // "gitleaks" | "trivy"
  features: ExtractedFeature[];    // 转化为统一特征
  findings: Finding[];             // 直接产出的 findings
  raw_output?: unknown;            // 原始输出，用于审计
  execution_ms: number;            // 执行耗时
  error?: string;                  // 错误信息（非致命）
}

export interface IScannerAdapter {
  readonly name: string;

  /** 检查工具是否可用（PATH 中存在、版本正确） */
  isAvailable(): Promise<boolean>;

  /**
   * 执行扫描
   * @param target 目标 URL（如 http://127.0.0.1:11434）
   * @param featureData Step 4 采集的特征数据（含 HTTP 响应）
   * @param context 扫描上下文
   */
  scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult>;
}

export interface ScannerConfig {
  gitleaks?: {
    enabled: boolean;
    binary_path?: string;     // 默认 "gitleaks"
    timeout_ms?: number;      // 默认 30000
  };
  trivy?: {
    enabled: boolean;
    binary_path?: string;     // 默认 "trivy"
    severity?: string[];      // 默认 ["CRITICAL", "HIGH", "MEDIUM"]
    timeout_ms?: number;      // 默认 60000
  };
}
```

---

### Step 2: 实现 Gitleaks 适配器（远程响应模式）

**优先级最高**（集成难度 1，直接提升权限判定能力）

Gitleaks 在远程模式下不扫描文件系统，而是扫描 Step 4 采集的 HTTP 响应文本：

```typescript
// engines/asset-scan/src/scanners/gitleaks.adapter.ts
export class GitleaksAdapter implements IScannerAdapter {
  readonly name = "gitleaks";

  async isAvailable(): Promise<boolean> {
    // 执行 gitleaks version 检查
  }

  async scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult> {
    // 1. 从 featureData 中提取 HTTP 响应文本
    //    - http_header features: Server, X-Powered-By, 自定义头
    //    - http_body features: 响应体内容
    //    - error_message features: 错误信息
    // 2. 将响应文本写入临时文件
    // 3. 执行: gitleaks detect --source <tmpdir> --report-format json
    // 4. 解析 JSON 输出
    // 5. 将每条 leak 转化为:
    //    feature: { feature_type: "secret_leak", key: leak.RuleID, value: leak.Secret }
    //    finding: { type: "info_leak" 或 "unauthorized_access", ... }
  }
}
```

**输出映射**：
- 泄露的 API Key/Token → `unauthorized_access` finding，risk_level: critical
- 泄露的密码/凭据 → `info_leak` finding，risk_level: high
- 权限影响：泄露的 token 类型映射到 L7（API Key）或 L5（低权限凭据）

---

### Step 3: 实现 Trivy 适配器（远程 URL 模式）

**优先级高**（集成难度 2，覆盖面最广）

Trivy 可以扫描远程 URL 的已知漏洞：

```typescript
// engines/asset-scan/src/scanners/trivy.adapter.ts
export class TrivyAdapter implements IScannerAdapter {
  readonly name = "trivy";

  async scan(target: string, featureData: FeatureData, context: ScanContext): Promise<ScannerResult> {
    // 1. 从 featureData 中提取已发现的服务信息
    //    - fingerprint matches: 服务类型（ollama, langflow 等）
    //    - http_header: Server 版本号
    //    - api_path: 已发现的 API 路径
    // 2. 构造 Trivy 扫描目标：
    //    - 如果识别出服务版本，用 trivy fs 扫描对应的已知 CVE
    //    - 或用 trivy 的 PURL (Package URL) 扫描已知依赖漏洞
    // 3. 执行: trivy fs --format json --severity CRITICAL,HIGH,MEDIUM <target>
    // 4. 解析 JSON 输出
    // 5. 将每个漏洞转化为:
    //    feature: { feature_type: "cve_vulnerability", key: CVE-ID, value: description }
    //    finding: { type: "unauthorized_access" (critical/high), ... }
  }
}
```

**输出映射**：
- CRITICAL CVE → `unauthorized_access` finding，risk_level: critical
- HIGH CVE → `unauthorized_access` finding，risk_level: high
- MEDIUM CVE → `misconfiguration` finding，risk_level: medium

---

### Step 4: 实现扫描器并行编排器

```typescript
// engines/asset-scan/src/scanners/runner.ts
export class ScannerRunner {
  private readonly scanners: IScannerAdapter[];

  constructor(config: ScannerConfig) {
    // 根据 config 初始化 enabled 的适配器
  }

  async runAll(
    target: string,
    featureData: FeatureData,
    context: ScanContext
  ): Promise<{
    mergedFeatures: ExtractedFeature[];
    mergedFindings: Finding[];
    scannerResults: ScannerResult[];
  }> {
    // 1. 检查各扫描器可用性 (isAvailable)
    // 2. 并行执行所有可用扫描器 (Promise.all)
    // 3. 合并 features 和 findings
    // 4. 返回合并结果
  }
}
```

---

### Step 5: 集成到流水线

修改 `pipeline.ts`，在 Step 4 和 Step 5 之间插入扫描器增强：

```typescript
// pipeline.ts 的 run() 方法中
const featureData = await this.probeService.execute(context);

// 注入 open_port features（现有逻辑）
for (const port of context.discoveredPorts) {
  featureData.features.push({ feature_type: "open_port", value: String(port), confidence: 1.0 });
}

// === 阶段二新增：外部扫描器增强 ===
let scannerMergedFindings: Finding[] = [];
if (this.scannerRunner) {
  const scannerOutput = await this.scannerRunner.runAll(targetUrl, featureData, context);
  featureData.features.push(...scannerOutput.mergedFeatures);
  scannerMergedFindings = scannerOutput.mergedFindings;
}

const matches = this.fingerprintService.evaluate(featureData);
const result = this.classificationService.buildResult(targetUrl, context, matches, featureData.endpoints, featureData.features);

// 合并外部扫描器直接产出的 findings
if (scannerMergedFindings.length > 0) {
  result.findings = [...(result.findings ?? []), ...scannerMergedFindings];
}
```

---

### Step 6: 扩展风险规则

在 `risk-rules.v1.yaml` 中新增基于扫描器输出的规则：

```yaml
  # === 阶段二：基于外部扫描器的规则 ===
  - rule_id: "cve_critical"
    name: "关键 CVE 漏洞"
    finding_type: "unauthorized_access"
    conditions:
      feature_patterns:
        - feature_type: "cve_vulnerability"
          value_contains_any: ["CRITICAL"]
    risk_level: "critical"
    exposure_score: 0.75
    exploitability_status: "reproducible"
    control_gap_score: 1.0
    remediation:
      - "升级受影响依赖到修复版本"
      - "若无修复版本，评估缓解措施或替换依赖"

  - rule_id: "secret_api_key"
    name: "API Key 泄露"
    finding_type: "unauthorized_access"
    conditions:
      feature_patterns:
        - feature_type: "secret_leak"
          value_contains_any: ["api-key", "token", "secret", "password", "Bearer"]
    risk_level: "critical"
    exposure_score: 1.0
    exploitability_status: "deterministic"
    control_gap_score: 1.0
    remediation:
      - "立即轮换泄露的凭据"
      - "从代码/配置中移除硬编码密钥"
      - "使用环境变量或密钥管理服务"

  - rule_id: "secret_generic"
    name: "通用密钥泄露"
    finding_type: "info_leak"
    conditions:
      feature_patterns:
        - feature_type: "secret_leak"
    risk_level: "high"
    exposure_score: 0.75
    exploitability_status: "plausible"
    control_gap_score: 0.75
    remediation:
      - "检查泄露凭据的权限范围"
      - "轮换受影响凭据"
```

---

### Step 7: 版本锁定与供应链安全

```typescript
// engines/asset-scan/src/scanners/version-check.ts
const PINNED_VERSIONS: Record<string, string> = {
  gitleaks: "8.18.4",   // 固定版本
  trivy: "0.52.0"       // 固定版本，避免 2026 供应链事件影响
};

export async function verifyToolVersion(tool: string, binaryPath: string): Promise<{
  ok: boolean;
  expected: string;
  actual: string | null;
}> {
  // 执行 <binaryPath> --version
  // 比对 PINNED_VERSIONS[tool]
  // 返回校验结果
}
```

---

## 验证方案

### 单元测试（每个适配器）

1. **Gitleaks 适配器**：mock HTTP 响应含 API Key → 验证产出 secret_leak feature + critical finding
2. **Trivy 适配器**：mock trivy JSON 输出 → 验证 CVE 映射
3. **ScannerRunner**：验证并行执行、错误容错、结果合并

### 集成测试

使用本地已安装的工具对测试目标运行：
```bash
# 测试 Gitleaks 扫描响应文本
echo "api_key: sk-1234567890abcdef" > /tmp/test-secret.txt
gitleaks detect --source /tmp --report-format json

# 测试 Trivy 扫描 URL
trivy fs --format json ./samples
```

### 端到端验证

通过 CLI 运行完整流水线，验证新 findings 出现在输出中：
```bash
npx tsx engines/asset-scan/src/cli.ts --target http://127.0.0.1:11434
```

---

## 实施顺序

| 步骤 | 内容 | 预计工时 |
|------|------|----------|
| Step 1 | 定义扫描器接口与类型扩展 | 4h |
| Step 2 | 实现 Gitleaks 适配器 + 测试 | 10h |
| Step 3 | 实现 Trivy 适配器 + 测试 | 12h |
| Step 4 | 实现 ScannerRunner 编排器 + 测试 | 8h |
| Step 5 | 集成到流水线 + 测试 | 8h |
| Step 6 | 扩展风险规则 + 测试 | 4h |
| Step 7 | 版本锁定与供应链安全 | 4h |
| **合计** | | **50h** |

## 范围说明

- **包含**：Gitleaks + Trivy 两个扫描器的 CLI 适配（远程响应模式）
- **不包含**：Semgrep（需要源码访问，留到仓库扫描场景）
- **不包含**：Promptfoo（Agent/LLM 红队，复杂度较高，留到阶段三）
- **不包含**：Syft/Grype（SBOM 生成，可后续补充）
- **不包含**：Joern（CPG 分析，需要独立部署）
- **不包含**：前端 UI 改动
- **不包含**：攻击路径图谱（Neo4j，属于阶段三）

## 依赖与风险

| 风险 | 缓解措施 |
|------|----------|
| 工具未安装 | `isAvailable()` 检查，未安装时跳过并记录 warning |
| 工具版本不兼容 | 版本锁定 + 启动时校验 |
| Trivy 供应链风险 | 固定版本、校验来源、最小权限执行 |
| 扫描超时 | 每个扫描器独立 timeout，超时返回空结果 |
| 输出格式变化 | 适配器层隔离，仅解析器需要更新 |
| 远程模式扫描深度有限 | 阶段三引入仓库扫描 + Semgrep 补充 |
