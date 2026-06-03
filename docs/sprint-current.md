# Sprint Current

## Requirement ID
REQ-ASSET-SCAN-RISK-001

## Requirement Name
asset-scan 引擎多维度风险评估深化（阶段一）

## Background
当前 asset-scan 引擎的 `ClassificationService.inferFindings()` 仅包含一条规则：检测 LLM API / Agent Framework 的未认证暴露端点，只产出 `exposed_api` 类型的 `high` 级 finding。研究文档《Agent资产可利用性分析.md》提出了从"发现资产"到"风险判定链"的深化目标。本 requirement 聚焦纯内部改造，不引入外部工具依赖。

## Goal
- 扩展 finding 类型覆盖：从 1 种（exposed_api）扩展到 5 种（+info_leak, misconfiguration, weak_auth, unauthorized_access）
- 引入 L0-L8 八级权限映射体系
- 实现 0-100 复合风险评分（五维加权）
- 风险规则以 YAML 配置文件驱动，便于扩展

## In Scope
- 扩展 `shared/types/asset-scan.ts` 中的类型定义（PrivilegeLevel, ExploitabilityStatus, RiskDimensionScores, MaxPrivilegeAssessment, ExploitabilityAssessment, ExposureAssessment）
- 扩展 Finding 和 AssetScanResult 接口（新增可选字段）
- 新建 `engines/asset-scan/rules/risk-rules.v1.yaml` 风险规则配置
- 重构 `ClassificationService`：YAML 驱动的多规则推断 + 复合评分
- 更新 pipeline.ts 传递 features 和 risk rules 路径
- 扩展 `AssetScanResultDetails`（result.ts）新增字段
- 更新 bridge 层（scan-task.ts）和 run-task.ts 透传新字段

## Acceptance Criteria
- 新增测试遵循 RED -> GREEN
- 5 种 FindingType 均可通过对应规则产出 finding
- L0-L8 权限映射按 FingerprintCategory 正确判定
- 复合风险评分公式正确（五维加权，0-100）
- 风险等级映射正确（critical≥75, high≥50, medium≥25, low≥0）
- YAML 规则可被正确加载和匹配
- `npm run test:repo` 全绿

## Out of Scope
- 不新增前端页面或 UI 改动
- 不引入外部工具集成（Semgrep/Gitleaks/Trivy，属于阶段二）
- 不实现攻击路径图谱（Neo4j，属于阶段三）
- 不修改现有 API 路由
- 路径可达性维度暂固定为 0.50

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 必须遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
- 风险规则以 YAML 配置文件形式维护，与 probes/fingerprints 风格一致
- 新增字段均为可选（optional），不破坏现有契约
- 若发生 `node` 环境缺失，必须先 `nvm use` 再执行 backend/dev 脚本

## Related Plan
- docs/asset-scan-深化拓展-阶段一实现计划.md
