# 当前最高优先级阻塞项（REQ-T1-DEMO-010 真实凭据验证）

**状态更新时间：** 2026-07-09（晚）
**负责需求：** REQ-T1-DEMO-010（详见 `docs/sprint-current.md`）
**用户明确要求：** 真实凭据运行、基线提升和最新镜像构建尚未发生前，不得将 REQ-010 标记为完成。

## 结论先说

真实 9-case campaign 仍未 9/9。已连续修复并推送：

| Commit | 内容 |
| --- | --- |
| `977db54c` | Bug #11：tool-before-output + deny intercept 终态 |
| `5678ddfb` | Bug #12/#13：proposed_tool_call 恢复 + failed mediation 可恢复 |

**当前稳定通过：**
- SC-001 三案 `passed`（deny/deny/allow）
- SC-002-C001 `passed`（deny）

**当前阻塞：SC-002-C002（expected `ask`）**
- 真实模型经常不按 fixture 调用 `read_file(protected path)`，或调用失败
- 插件已能在某些路径上终态，但最新一轮仍出现：
  - attempt 完全不出现（timeout，`attempts=0`）
  - 或终态但 `actual_action=allow`（expected ask）导致 retry 后 case failed
- 根因候选：
  1. 真实 tool path 先 ingest 了非终态/错误动作 snapshot，后续 proposed-tool 评估被事件链约束挡住
  2. `sensitive-capability-observed`(alert) 与 `protected-file-read`(ask) 条件未同时命中
  3. `awaitAttempt` 在 invoke 失败/无 snapshot 时 10 分钟超时

在完整 9/9 + acceptance + baseline 提升完成前，**不得**将 REQ-010 标记为完成。

## 本轮修复摘要

### Bug #11（已合入）
- tool 早到时合成 provisional model pair
- deny/ask intercept 只 ingest 终态 finalize 结果
- late hooks no-op

### Bug #12/#13（已合入，`5678ddfb`）
- 保存 envelope `proposed_tool_call` + filter context
- `agent_end` 在无终态时评估 proposed tool
- failed mediation **不再**永久 end session
- `after_tool_call` 无 pending 时 no-op（不再 throw）
- 仅 genesis（无 snapshot）允许重建 monitor session，避免破坏 event-prefix 链

### 测试
- `integrations/openclaw/tests/plugin-hooks.spec.ts`：**30/30 pass**
- 新增：
  - multi-turn deny terminal
  - protected-file ask intercept terminal
  - allow tool path finalizes
  - proposed tool evaluated when model never calls tools
  - before_tool failure still allows recovery
  - after_tool without pending is no-op

## 下一步（未完成）

1. **聚焦 SC-002-C002 动作正确性**
   - 保证 fixture proposed tool 在真实 tool 已发生 alert/allow 后仍能形成 **ask 终态**
   - 可能需要：真实错误 tool 不写入 attempt 决策、或在同 session 事件链上追加 proposed tool 评估
2. 降低 `awaitAttempt` 在 invoke 失败时的超时成本（可选）
3. 用 `--no-cache` 重建 gateway 后重跑完整 9-case
4. acceptance validator → baseline 提升 → 全门禁
5. 全部通过后才标记 REQ-010 完成

## 运维注意

- 修改 `integrations/openclaw/src` 后必须：
  ```powershell
  docker-compose.exe -f deploy/track1/compose.track1.yml --profile track1 build --no-cache openclaw-gateway
  docker-compose.exe -f deploy/track1/compose.track1.yml --profile track1 up -d --force-recreate backend frontend openclaw-gateway
  ```
- 普通 `build` 可能命中缓存，导致容器仍是旧插件

## 安全约束

真实 API key / base url **不得**写入任何 git 追踪文件，只能通过 git-ignored `.env` 或 shell 环境变量传递。
