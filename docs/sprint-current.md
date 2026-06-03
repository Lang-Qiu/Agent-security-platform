# Sprint Current

## Requirement ID
REQ-ASSET-SCAN-SCANNER-002

## Requirement Name
asset-scan 引擎外部扫描器集成（阶段二）

## Background
阶段一已完成多维度风险评估体系（YAML 驱动规则、L0-L8 权限映射、复合评分）。当前引擎仅依赖自身探针（HTTP/WS/TCP）采集特征，无法发现泄露密钥、已知 CVE 漏洞等深层风险。本 requirement 接入 Gitleaks 和 Trivy 两个外部扫描器，在远程资产发现场景下扩展证据来源。

## Goal
- 接入 Gitleaks：扫描 HTTP 响应中的泄露密钥/Token
- 接入 Trivy：扫描远程 URL 的已知 CVE 漏洞
- 统一扫描器接口（IScannerAdapter），便于后续扩展
- 扫描器输出转化为 ExtractedFeature[] + Finding[]，流入现有指纹匹配和分类引擎

## In Scope
- 新增 `shared/types/asset-scan.ts` 中的 FeatureType 值（secret_leak, cve_vulnerability, misconfig_finding, dependency_risk）
- 新建 `engines/asset-scan/src/scanners/` 目录：
  - `scanner.interface.ts` — IScannerAdapter 接口 + ScannerConfig 类型
  - `gitleaks.adapter.ts` — Gitleaks CLI 适配器（扫描 HTTP 响应文本）
  - `trivy.adapter.ts` — Trivy CLI 适配器（扫描远程 URL）
  - `runner.ts` — ScannerRunner 并行编排器
- 修改 `pipeline.ts`：在 Step 4 和 Step 5 之间插入扫描器增强
- 扩展 `risk-rules.v1.yaml`：新增基于扫描器输出的风险规则
- 版本锁定与供应链安全（固定工具版本）

## Acceptance Criteria
- 新增测试遵循 RED -> GREEN
- Gitleaks 适配器可从 HTTP 响应中检测泄露密钥并产出 secret_leak feature + finding
- Trivy 适配器可扫描远程目标并产出 cve_vulnerability feature + finding
- ScannerRunner 支持并行执行、错误容错（工具未安装时跳过）
- 扫描器输出正确流入指纹匹配和分类引擎
- 版本校验机制正常工作
- `npm run test:engine:asset-scan` 全绿

## Out of Scope
- 不实现 Semgrep 适配器（需要源码访问，留到仓库扫描场景）
- 不实现 Promptfoo（Agent/LLM 红队，留到阶段三）
- 不新增前端页面或 UI 改动
- 不实现攻击路径图谱（Neo4j，属于阶段三）
- 不修改现有 API 路由

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 必须遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
- 假设 Gitleaks/Trivy 已安装在 PATH 中，未安装时自动跳过
- 远程响应分析模式：Gitleaks 扫描 HTTP 响应文本，Trivy 扫描远程 URL
- 工具版本固定，不使用 floating tag
- 若发生 `node` 环境缺失，必须先 `nvm use` 再执行 backend/dev 脚本

## Related Plan
- docs/asset-scan-深化拓展-阶段二实现计划.md
