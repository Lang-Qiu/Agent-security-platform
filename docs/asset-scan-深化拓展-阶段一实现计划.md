# Asset-Scan 引擎深化拓展 — 阶段一实现计划

## Context

当前 asset-scan 引擎已实现完整的六步资产发现流水线（发现 → 端口扫描 → 协议识别 → 探针执行 → 指纹匹配 → 分类判定），但分类判定阶段（`ClassificationService.inferFindings()`）仅包含一条规则：检测 LLM API / Agent Framework 的未认证暴露端点。研究文档《Agent资产可利用性分析.md》提出了从"发现资产"到"风险判定链"的深化目标：**是否暴露 → 是否可利用 → 攻破后最高权限 → 可达攻击路径 → 最终安全等级 → 修复建议**。

本计划聚焦**阶段一：纯内部改造**，不引入外部工具依赖，基于现有探针和指纹数据，实现多维度风险评估体系。

---

## 现状分析

### 已有能力
- 6 种探针（TCP、HTTP、WS）和 7 条指纹规则（OpenClaw、Ollama、LangFlow、AutoGPT、MCP、Dify、AnythingLLM）
- `FindingType` 枚举已定义 5 种类型，但仅使用 `exposed_api`
- `RiskLevel` 已定义 5 级（info/low/medium/high/critical），但仅输出 `high`
- `FindingEvidence` 结构已有，但字段单一

### 核心差距
| 维度 | 现状 | 目标 |
|------|------|------|
| 发现类型 | 1 种 (exposed_api) | 5+ 种全覆盖 |
| 风险评分 | 二元判定 (high 或无) | 0-100 复合评分 |
| 权限映射 | 无 | L0-L8 八级权限体系 |
| 可利用性评估 | 无 | 5 级状态判定 |
| 证据结构 | 简单端点列表 | 多维度结构化证据 |

---

## 实现方案

### 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `shared/types/asset-scan.ts` | **修改** | 新增权限等级、风险维度、可利用性等类型定义 |
| `engines/asset-scan/src/runtime/classification.service.ts` | **重写** | 多规则推断引擎 + 复合评分 + 权限映射 |
| `engines/asset-scan/rules/risk-rules.v1.yaml` | **新建** | 风险推断规则配置（YAML 格式，与 probes/fingerprints 风格一致） |
| `shared/types/result.ts` | **修改** | `AssetScanResultDetails` 增加新字段 |
| `backend/src/modules/task-center/task-engine.service.ts` | **修改** | 适配新的 finding 结构 |

---

### Step 1: 扩展类型定义 (`shared/types/asset-scan.ts`)

新增以下类型：

```typescript
/** 权限等级 L0-L8 */
export type PrivilegeLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7" | "L8";

/** 可利用性状态 */
export type ExploitabilityStatus = "none" | "theoretical" | "plausible" | "reproducible" | "deterministic";

/** 风险维度分数 */
export interface RiskDimensionScores {
  exposure: number;          // 0.00 - 1.00
  exploitability: number;    // 0.00 - 1.00
  privilege_impact: number;  // 0.00 - 1.00
  path_reachability: number; // 0.00 - 1.00
  control_gap: number;       // 0.00 - 1.00
}

/** 最高权限评估 */
export interface MaxPrivilegeAssessment {
  level: PrivilegeLevel;
  score: number;             // 0-10
  identity_scope: string;    // e.g. "agent-runtime", "browser-session"
  blast_radius: string;      // e.g. "单 Agent", "用户会话", "内网一跳"
}

/** 可利用性评估 */
export interface ExploitabilityAssessment {
  status: ExploitabilityStatus;
  preconditions: string[];   // 前置条件列表
  control_gaps: string[];    // 缺失的控制措施
}

/** 暴露面评估 */
export interface ExposureAssessment {
  reachable_from: string[];  // e.g. ["user_prompt", "plugin_input", "public"]
  auth_required: boolean;
  cross_boundary: boolean;
  notes: string;
}
```

扩展 `Finding` 接口：

```typescript
export interface Finding {
  // ... 现有字段保持不变 ...
  finding_id: string;
  type: FindingType;
  title: string;
  risk_level: RiskLevel;
  reason: string;
  evidence: FindingEvidence[];
  related_fingerprints: string[];
  recommendation: string;

  // === 新增字段 ===
  exposure?: ExposureAssessment;
  exploitability?: ExploitabilityAssessment;
  max_privilege?: MaxPrivilegeAssessment;
  risk_dimensions?: RiskDimensionScores;
  composite_risk_score?: number;  // 0-100
}
```

扩展 `AssetScanResult`：

```typescript
export interface AssetScanResult {
  // ... 现有字段保持不变 ...

  // === 新增字段 ===
  overall_risk_score?: number;           // 0-100 复合总分
  overall_risk_level?: RiskLevel;        // 基于总分映射的等级
  max_privilege?: MaxPrivilegeAssessment; // 全局最高权限评估
}
```

---

### Step 2: 定义风险规则 YAML 格式 (`risk-rules.v1.yaml`)

新建 `engines/asset-scan/rules/risk-rules.v1.yaml`，与 probes/fingerprints 规则文件风格一致：

```yaml
# 风险推断规则配置
version: "1.0"
description: "Agent 资产可利用性判定规则"

# 权限映射表
privilege_map:
  llm_api:
    level: "L7"
    score: 9
    identity_scope: "llm-service-account"
    blast_radius: "外部系统/API"
  agent_framework:
    level: "L6"
    score: 8
    identity_scope: "agent-runtime"
    blast_radius: "受限执行容器"
  agent_application:
    level: "L5"
    score: 7
    identity_scope: "application-context"
    blast_radius: "单业务域"
  agent_gateway:
    level: "L6"
    score: 8
    identity_scope: "gateway-proxy"
    blast_radius: "所有下游 Agent"
  mcp_server:
    level: "L5"
    score: 7
    identity_scope: "mcp-context"
    blast_radius: "工具调用链"
  web_framework:
    level: "L4"
    score: 6
    identity_scope: "web-service"
    blast_radius: "单服务"
  middleware:
    level: "L4"
    score: 6
    identity_scope: "middleware-service"
    blast_radius: "依赖服务"
  cloud_service:
    level: "L7"
    score: 9
    identity_scope: "cloud-identity"
    blast_radius: "云资源"

# 评分权重
scoring_weights:
  exposure: 0.20
  exploitability: 0.25
  privilege_impact: 0.30
  path_reachability: 0.15
  control_gap: 0.10

# 阶段一：路径可达性固定值（等 Neo4j 图谱就绪后改为动态）
path_reachability_default: 0.50

# 风险等级映射
risk_level_thresholds:
  critical: 75
  high: 50
  medium: 25
  low: 0

# 推断规则列表
rules:
  - rule_id: "exposed_api_critical"
    name: "LLM API 未认证暴露"
    finding_type: "exposed_api"
    conditions:
      fingerprint_category_in: ["llm_api"]
      has_unauthenticated_endpoints: true
    risk_level: "critical"
    exposure_score: 1.0
    exploitability_status: "reproducible"
    control_gap_score: 1.0
    remediation:
      - "限制网络访问，仅允许可信 IP"
      - "强制启用 API Key 认证"
      - "启用请求速率限制"

  - rule_id: "exposed_api_high"
    name: "Agent 框架/应用未认证暴露"
    finding_type: "exposed_api"
    conditions:
      fingerprint_category_in: ["agent_framework", "agent_application", "mcp_server", "agent_gateway"]
      has_unauthenticated_endpoints: true
    risk_level: "high"
    exposure_score: 0.75
    exploitability_status: "plausible"
    control_gap_score: 0.75
    remediation:
      - "收紧 API 访问控制"
      - "启用认证机制"
      - "审计敏感端点调用日志"

  - rule_id: "info_leak_version"
    name: "版本信息泄露"
    finding_type: "info_leak"
    conditions:
      feature_patterns:
        - feature_type: "http_header"
          key_pattern: "Server"
          version_regex: true
        - feature_type: "http_header"
          key_pattern: "X-Powered-By"
    risk_level: "low"
    exposure_score: 0.50
    exploitability_status: "theoretical"
    control_gap_score: 0.50
    remediation:
      - "移除或混淆 Server/X-Powered-By 头"

  - rule_id: "info_leak_debug"
    name: "调试信息泄露"
    finding_type: "info_leak"
    conditions:
      feature_patterns:
        - feature_type: "http_body"
          value_contains_any: ["traceback", "stack trace", "debug=true", "/debug/", "Exception"]
        - feature_type: "error_message"
    risk_level: "medium"
    exposure_score: 0.75
    exploitability_status: "plausible"
    control_gap_score: 0.75
    remediation:
      - "关闭调试模式"
      - "配置自定义错误页面"
      - "禁止在生产环境输出堆栈信息"

  - rule_id: "misconfiguration_cors"
    name: "CORS 全开"
    finding_type: "misconfiguration"
    conditions:
      feature_patterns:
        - feature_type: "http_header"
          key: "Access-Control-Allow-Origin"
          value_equals: "*"
    risk_level: "medium"
    exposure_score: 0.75
    exploitability_status: "plausible"
    control_gap_score: 0.50
    remediation:
      - "限制 CORS AllowOrigin 为可信域名"

  - rule_id: "misconfiguration_http_sensitive"
    name: "HTTP 明文传输敏感 API"
    finding_type: "misconfiguration"
    conditions:
      protocol_is: "http"
      path_matches_any: ["/api/", "/v1/", "/v2/"]
    risk_level: "medium"
    exposure_score: 0.75
    exploitability_status: "plausible"
    control_gap_score: 0.50
    remediation:
      - "启用 HTTPS"
      - "强制 HTTP → HTTPS 重定向"

  - rule_id: "weak_auth_basic"
    name: "使用弱认证 (Basic Auth)"
    finding_type: "weak_auth"
    conditions:
      feature_patterns:
        - feature_type: "http_header"
          key: "WWW-Authenticate"
          value_contains: "Basic"
    risk_level: "medium"
    exposure_score: 0.50
    exploitability_status: "plausible"
    control_gap_score: 0.50
    remediation:
      - "升级为 Token/Bearer 认证"
      - "确保使用 HTTPS 传输"

  - rule_id: "unauthorized_sensitive_endpoint"
    name: "敏感端点未授权访问"
    finding_type: "unauthorized_access"
    conditions:
      sensitive_paths: ["/api/v1/flows", "/api/tags", "/api/agent/status", "/api/models", "/api/v1/models"]
      has_unauthenticated_endpoints: true
    risk_level: "high"
    exposure_score: 0.75
    exploitability_status: "reproducible"
    control_gap_score: 1.0
    remediation:
      - "为敏感端点添加认证"
      - "实施最小权限原则"
      - "启用访问审计日志"
```

在 `ClassificationService` 构造函数中加载此 YAML 文件（与 ProbeService/FingerprintService 模式一致）。

### Step 3: 重构 `classification.service.ts` — 多规则推断 + 复合评分

将 `inferFindings()` 从单规则改为**YAML 驱动的策略链模式**，每条规则独立评估，可产生多个 findings。

#### 3.1 构造函数变更

```typescript
constructor(workspaceRoot?: string) {
  // 加载 risk-rules.v1.yaml（与 ProbeService/FingerprintService 模式一致）
  this.riskRules = loadYaml(workspaceRoot, "engines/asset-scan/rules/risk-rules.v1.yaml");
}
```

#### 3.2 新增私有方法：`evaluateRiskRules()`

```typescript
private evaluateRiskRules(
  matches: FingerprintMatchItem[],
  endpoints: EndpointInfo[],
  features: ExtractedFeature[],
  context: ScanContext
): Finding[]
```

遍历 YAML 中的 `rules` 列表，对每条规则：
1. 检查 `conditions.fingerprint_category_in` — 匹配 top match 的 category
2. 检查 `conditions.has_unauthenticated_endpoints` — 过滤未认证端点
3. 检查 `conditions.feature_patterns` — 匹配 features 中的特定模式
4. 检查 `conditions.protocol_is` — 匹配协议类型
5. 检查 `conditions.sensitive_paths` — 匹配敏感路径
6. 如果所有条件满足，生成一个 `Finding`，附带完整的 `exposure`/`exploitability`/`max_privilege`/`risk_dimensions` 评估

#### 3.3 各规则匹配逻辑

| 规则 ID | 匹配逻辑 |
|---------|----------|
| `exposed_api_critical` | top match category === "llm_api" + 有未认证端点 |
| `exposed_api_high` | top match category in [agent_framework, agent_application, mcp_server, agent_gateway] + 有未认证端点 |
| `info_leak_version` | features 中有 http_header 的 Server/X-Powered-By 且值含版本号模式 (数字.数字) |
| `info_leak_debug` | features 中有 http_body/error_message 且值含 "traceback"/"stack trace"/"debug=true" 等 |
| `misconfiguration_cors` | features 中有 http_header key="Access-Control-Allow-Origin" value="*" |
| `misconfiguration_http_sensitive` | protocol 为 "http" + 有路径匹配 /api/ 或 /v1/ 或 /v2/ |
| `weak_auth_basic` | features 中有 http_header key="WWW-Authenticate" 且值含 "Basic" |
| `unauthorized_sensitive_endpoint` | endpoints 中有敏感路径 + auth_required === false |

#### 3.4 权限映射

从 YAML 的 `privilege_map` 中读取，按 top match 的 `category` 查表：

```typescript
const privilegeConfig = this.riskRules.privilege_map[topMatch.category];
```

#### 3.5 复合评分计算

新增私有方法 `calculateCompositeScore()`：

```typescript
private calculateCompositeScore(
  exposure: number,
  exploitability: number,
  privilegeImpact: number,
  controlGap: number
): number {
  const weights = this.riskRules.scoring_weights;
  const pathReach = this.riskRules.path_reachability_default; // 固定 0.50
  return Math.round(100 * (
    weights.exposure * exposure +
    weights.exploitability * exploitability +
    weights.privilege_impact * privilegeImpact +
    weights.path_reachability * pathReach +
    weights.control_gap * controlGap
  ));
}
```

---

### Step 4: 更新 `buildResult()` 组装逻辑

新增私有方法：

```typescript
private calculateCompositeScore(finding: Finding): number {
  // FinalRisk = 100 × (
  //   0.20 × ExposureScore +
  //   0.25 × ExploitabilityScore +
  //   0.30 × PrivilegeImpactScore +
  //   0.15 × PathReachabilityScore +
  //   0.10 × ControlGapScore
  // )
}
```

各维度取值逻辑：

| 维度 | 取值规则 |
|------|----------|
| ExposureScore | 公网/跨租户=1.0, 用户输入可触达=0.75, 需认证=0.50, 仅本地=0.25, 不可达=0.00 |
| ExploitabilityScore | deterministic=1.0, reproducible=0.75, plausible=0.50, theoretical=0.25, none=0.00 |
| PrivilegeImpactScore | max_privilege.score / 10 |
| PathReachabilityScore | **阶段一固定 0.50**（单高价值占位），等阶段三接入 Neo4j 图谱后再动态计算 |
| ControlGapScore | 无控制=1.0, 部分可绕过=0.50, 有效控制=0.00 |

总分映射：

| 总分 | RiskLevel |
|------|-----------|
| 75-100 | critical |
| 50-74 | high |
| 25-49 | medium |
| 0-24 | low |

---

### Step 5: 更新 `buildResult()` 组装逻辑

在 `buildResult()` 中：
1. 调用新的 `evaluateRiskRules()` 替代原有 `inferFindings()`
2. 为每个 finding 计算 `composite_risk_score`（通过 `calculateCompositeScore()`）
3. 计算全局 `overall_risk_score`（取所有 finding 中的最高分）
4. 推导 `overall_risk_level`（基于 overall_risk_score 映射，阈值从 YAML 读取）
5. 提取全局 `max_privilege`（取所有 finding 中的最高权限级别）

---

### Step 6: 更新结果类型 (`shared/types/result.ts`)

扩展 `AssetScanResultDetails`：

```typescript
export interface AssetScanResultDetails {
  // ... 现有字段 ...
  target?: TaskTarget;
  fingerprint?: Record<string, unknown>;
  confidence?: number;
  matched_features?: unknown[];
  open_ports?: unknown[];
  http_endpoints?: unknown[];
  auth_detected?: boolean;
  findings?: unknown[];
  execution_context?: AssetScanExecutionContext;

  // === 新增字段 ===
  overall_risk_score?: number;
  overall_risk_level?: RiskLevel;
  max_privilege?: MaxPrivilegeAssessment;
}
```

---

### Step 7: 适配后端 (`task-engine.service.ts`)

`deriveAssetScanRiskSummary()` 已有逻辑按 `finding.risk_level` 计数，无需改动——新增的 findings 会自动被计入。

但需要确认：新增的 `overall_risk_score` 字段能正确传递到 API 响应中。当前 `AssetScanResultDetails` 使用 `unknown[]` 做 loosely typed 存储，新增字段需要在 bridge 层（`scan-task.ts`）正确序列化。

---

## 验证方案

### 单元测试
为每个新增策略编写测试：
1. **`checkExposedApi`**：构造 LLM API 未认证端点 → 应产出 critical finding
2. **`checkInfoLeak`**：构造含版本号的 HTTP 头 → 应产出 low/medium finding
3. **`checkMisconfiguration`**：构造缺少安全头的端点 → 应产出 medium finding
4. **`checkWeakAuth`**：构造 Basic Auth 端点 → 应产出 medium finding
5. **`checkUnauthorizedAccess`**：构造未认证敏感路径 → 应产出 high finding
6. **复合评分**：验证各维度输入 → 总分计算正确
7. **权限映射**：验证各 category → 正确的 L 级别

### 集成测试
使用 CLI 对已知目标运行：
```bash
npx tsx engines/asset-scan/src/cli.ts http://127.0.0.1:11434
```
验证输出包含多个 findings、正确的 risk_score 和 privilege level。

### 端到端验证
通过 API 创建 asset_scan task，验证 `GET /api/tasks/:taskId/result` 返回的 findings 包含新字段。

---

## 实施顺序

1. **Step 1** — 扩展类型定义（无破坏性，纯新增）
2. **Step 2** — 新建 risk-rules.v1.yaml 配置文件
3. **Step 3** — 重构 classification.service.ts（核心改动：多规则推断 + 复合评分）
4. **Step 4** — 更新 buildResult() 组装逻辑
5. **Step 5** — 更新结果类型 AssetScanResultDetails
6. **Step 6** — 后端适配（确认新字段正确传递到 API）
7. **Step 7** — 单元测试 + 集成测试

## 范围说明

- **包含**：后端引擎改造 + API 响应扩展
- **不包含**：前端 UI 改动（留到后续阶段）
- **不包含**：外部工具集成（Semgrep/Gitleaks/Trivy，属于阶段二）
- **不包含**：攻击路径图谱（Neo4j，属于阶段三）

预计工时：**40-60 小时**（单人开发）
