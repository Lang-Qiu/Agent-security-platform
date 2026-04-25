# Sprint Current

后续可以把当前唯一 requirement 写在这里，Codex 会按 `AGENTS.md` 中的规则逐条处理，一次只处理一个 requirement。

## Requirement ID
REQ-ASSET-PROBE-004

## Requirement Name
真实探针执行器最小闭环（阶段 G）

## Background
当前仓库已经完成离线样本匹配基线，并完成阶段 F 的证据补强与负样本六类场景回归。下一步进入阶段 G：在可控本地环境内接入真实探针最小执行闭环，验证“真实信号 + 样本信号并存”能力。

## Goal
在不扩展为生产级扫描器的前提下，完成真实探针执行最小闭环：
- 先通过 RED 测试定义 probe runner、adapter 和 API 联调边界
- 支持最小探针集合：TCP connect + HTTP HEAD/GET + OpenClaw 专用 WebSocket 探针
- 在 localhost/测试容器/mock server 约束内验证 P0 目标 live probe 闭环
- 保持离线 matcher 既有样本回归基线不被破坏

## In Scope
- 在 backend 新增/补齐真实探针执行最小能力（仅本地可控目标）
- 打通 probe runner -> signal adapter -> matcher 输入通道
- 补充并执行失败测试：probe runner 单测、task-engine/adapter 单测、task-center API 集成测试
- 校准 `engines/asset-scan/rules/probes.v1.yaml` 的最小执行集与参数
- 同步更新进度、计划和 beginner 文档

## Acceptance Criteria
- 与阶段 G 相关的新增测试必须先 RED 后 GREEN
- 不依赖 `parameters.sample_ref`，也能跑通 P0 目标的真实探针识别流程
- 新增真实探针能力后，既有离线 matcher 回归测试保持通过
- 执行边界限定在 localhost/测试容器/mock server，不触达公网目标
- 现有 `npm run test` 保持全绿

## Out of Scope
- 不实现生产级扫描调度、分布式执行或公网扩散
- 不新增前端页面或可视化能力
- 不扩展为 P1/P2 的完整识别实现

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 必须遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
- 真实探针仅允许对本地受控目标执行，禁止引入不受控扫描目标
- 本轮默认优先目标为 `ollama` 与 `langflow`，其余目标在最小闭环稳定后再扩展
- 样本模式与真实探针模式并存，任何新实现不能破坏现有离线回归语义

## Latest Execution Checkpoint (2026-04-11)
- 已完成：`REQ-ASSET-EVIDENCE-003` 核心验收项达成，负样本六类场景已覆盖并固化到回归
- 已完成：`scripts/dev/negative-sample-mock.py` + `scripts/dev/mock-containers.sh` 的统一采样链路稳定可复用
- 已完成：最近 `npm run test:backend` 与 `npm run test` 持续全绿
- 已完成：阶段 G 第一刀 RED -> GREEN，`asset_scan` 已支持 `probe_mode=live + probe_target_id` 的最小真实探针闭环
- 已完成：`ollama` 已支持带 `probe_port_hint` 的 live probe 识别
- 已完成：`openclaw-gateway` 已支持最小 WebSocket live probe 识别
- 已完成：backend 中 `asset-scan` 的 probe/scoring 执行逻辑已迁移到 `engines/asset-scan`，并通过进程桥接调用
- 已完成：新增迁移专项测试（adapter engine-client delegation + engine bridge contract）并通过
- 当前状态：P0 四个目标（`langflow`、`autogpt`、`ollama`、`openclaw-gateway`）均可在无 `sample_ref` 前提下通过本地 live probe 路径产出识别结果；本轮最小闭环验收项已完成

## Related Plan
- docs/plans/agent-asset-fingerprinting-discovery-plan.md

