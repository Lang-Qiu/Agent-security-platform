# Sprint Current

后续可以把当前唯一 requirement 写在这里，Codex 会按 `AGENTS.md` 中的规则逐条处理，一次只处理一个 requirement。

## Requirement ID
REQ-ASSET-EVIDENCE-003

## Requirement Name
证据补强与样本回归矩阵完善

## Background
当前仓库已经完成离线样本匹配基线，backend 能消费规则 YAML 和样本 JSON 并输出初始识别结果。`openclaw-gateway` 正样本端口证据已补强并达到 `direct`，但 P0 的负样本回归矩阵仍不够完整，样本可解释性和稳健性还需要继续提升。

## Goal
在不进入真实探针执行器开发的前提下，先把当前 matcher 的证据和回归质量抬稳：
- 固化 `openclaw-gateway` 补强后的样本结论并补回归断言
- 将 P0 负样本从 synthetic/mock 逐步提升为 verified-capture
- 为每个 P0 增补更有区分度的负样本
- 用失败测试驱动样本回归矩阵完善

## In Scope
- 补强 `samples/assets/fingerprint-positive` 和 `samples/assets/fingerprint-negative`
- 必要时微调 `engines/asset-scan/rules/fingerprints.v1.yaml` 的证据引用或权重
- 先写 matcher 回归失败测试，再补最小修正
- 更新进度、计划和 beginner 文档

## Acceptance Criteria
- `backend/tests/asset-fingerprint.service.spec.ts` 先 RED 后 GREEN
- `openclaw-gateway` 保持 `direct`，且回归测试稳定通过
- 每个 P0 至少新增 1 个可解释的负样本回归用例
- 每个 P0 至少有 1 条 `verified-capture` 负样本
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
- `openclaw-gateway` 已补端口证据，后续如分数回落必须通过样本与断言回归定位原因

## Latest Execution Checkpoint (2026-03-31)
- 已完成：`openclaw-gateway` 正样本保持 `direct`
- 已完成：`autogpt`、`openclaw-gateway`、`ollama`、`langflow` 均已具备至少 1 条 `verified-capture` 负样本
- 已完成：`backend/tests/asset-fingerprint.service.spec.ts` 已纳入上述新增负样本回归，采用先 RED（样本缺失）后 GREEN（补齐样本）流程
- 已完成：第二轮近似路由负样本（`openclaw_gateway.neg.n006`、`ollama.neg.n006`、`langflow.neg.n006`、`autogpt.neg.n005`）已接入回归
- 已完成：AutoGPT 固定 mock 脚本与命令（`scripts/dev/autogpt-negative-mock.py`、`mock:autogpt:start`/`mock:autogpt:stop`）已落地，并新增 `autogpt.neg.n006`
- 已完成：P0 固定 mock 脚本与命令（`scripts/dev/p0-negative-mock.py`、`mock:p0:start`/`mock:p0:stop`）已落地
- 已完成：代理头污染/中间件注入负样本（`openclaw_gateway.neg.n007`、`ollama.neg.n007`、`langflow.neg.n007`、`autogpt.neg.n007`）已接入回归
- 当前结论：`REQ-ASSET-EVIDENCE-003` 的核心验收项已达成，且“路径近似 + 404 + 代理头污染 + 固定容器采样链路”均已覆盖，下一步可扩展跨产品字段复用（交叉污染）类负样本

## Related Plan
- docs/plans/agent-asset-fingerprinting-discovery-plan.md

