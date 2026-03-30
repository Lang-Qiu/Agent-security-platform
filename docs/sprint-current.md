# Sprint Current

后续可以把当前唯一 requirement 写在这里，Codex 会按 `AGENTS.md` 中的规则逐条处理，一次只处理一个 requirement。

## Requirement ID
REQ-ASSET-DISCOVERY-001

## Requirement Name
智能体资产测绘与指纹识别查找产物落地（非引擎实现）

## Background
当前仓库已具备 asset_scan 类型、基础结果契约与后端适配入口，但缺少可执行的查找产物（探针定义、指纹样本表、结果归并规范），导致无法进入下一阶段测试先行实现。

## Goal
在不实现生产扫描引擎的前提下，交付可直接进入 TDD 的查找资产：
- Probe Catalog v1（探针清单）
- Fingerprint Sample Table v1（指纹样本表）
- Result Collation Spec v1（识别结果归并规范）

## In Scope
- 冻结目标识别范围与合规扫描边界
- 定义端口、HTTP、API、鉴权行为探针
- 建设指纹规则与正反样本索引
- 定义多信号打分、冲突处理、unknown 降级
- 将产物映射到现有 shared result contract

## Acceptance Criteria
- docs/plans 中存在细化执行计划，且每阶段包含输入、改动文件、流程、产出
- engines/asset-scan/rules/probes.v1.yaml 已创建并含字段模板
- engines/asset-scan/rules/fingerprints.v1.yaml 已创建并含字段模板
- samples/assets/fingerprint-positive 和 samples/assets/fingerprint-negative 目录已创建并含填写说明
- 产物可被下一阶段 RED 测试直接消费（不要求本 requirement 编写实现代码）

## Out of Scope
- 不实现真实网络扫描执行器
- 不实现后端生产逻辑与并发调度
- 不实现前端新增可视化能力
- 不接入真实外部引擎执行

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 当前 requirement 属于文档/规则建模类任务，可不强制先写失败测试
- 下一 requirement 必须回到 TDD 流程，从失败测试开始
- 输入不足时先补齐目标清单、边界与样本，再推进规则细化

## Related Plan
- docs/plans/agent-asset-fingerprinting-discovery-plan.md

