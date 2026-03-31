# Sprint Current

后续可以把当前唯一 requirement 写在这里，Codex 会按 `AGENTS.md` 中的规则逐条处理，一次只处理一个 requirement。

## Requirement ID
REQ-ASSET-EVIDENCE-003

## Requirement Name
证据补强与样本回归矩阵完善

## Background
当前仓库已经完成离线样本匹配基线，backend 能消费规则 YAML 和样本 JSON 并输出初始识别结果。但现有证据强度仍不均衡，最典型的是 `openclaw-gateway` 正样本缺少端口证据，导致当前只能 `log_only`，同时 P0 的负样本回归矩阵还不够完整。

## Goal
在不进入真实探针执行器开发的前提下，先把当前 matcher 的证据和回归质量抬稳：
- 补强 `openclaw-gateway` 的正样本证据
- 为每个 P0 增补更有区分度的负样本
- 用失败测试驱动样本回归矩阵完善

## In Scope
- 补强 `samples/assets/fingerprint-positive` 和 `samples/assets/fingerprint-negative`
- 必要时微调 `engines/asset-scan/rules/fingerprints.v1.yaml` 的证据引用或权重
- 先写 matcher 回归失败测试，再补最小修正
- 更新进度、计划和 beginner 文档

## Acceptance Criteria
- `backend/tests/asset-fingerprint.service.spec.ts` 先 RED 后 GREEN
- `openclaw-gateway` 至少达到 `suspected`，目标达到 `direct`
- 每个 P0 至少新增 1 个可解释的负样本回归用例
- 不引入真实网络探针执行逻辑
- 现有 `npm run test` 保持全绿

## Out of Scope
- 不实现真实 TCP/HTTP/WebSocket 探针执行器
- 不实现后台任务轮询、异步执行或状态推进
- 不新增前端页面或可视化能力
- 不扩展为 P1/P2 的完整识别实现

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 必须遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
- 仅允许消费仓库内现有规则与样本文件
- 样本优先于调权重；没有新证据时不要用“硬调分数”掩盖证据不足
- `openclaw-gateway` 当前正样本缺少显式端口证据，按现有规则只到 `log_only`，不得伪造直出结论

## Related Plan
- docs/plans/agent-asset-fingerprinting-discovery-plan.md

