# 当前最高优先级阻塞项（REQ-T1-DEMO-010 真实凭据验证）

**状态更新时间：** 2026-07-05
**负责需求：** REQ-T1-DEMO-010（详见 `docs/sprint-current.md`）
**用户明确要求：** 真实凭据运行、基线提升和最新镜像构建尚未发生前，不得将 REQ-010 标记为完成。

## 结论先说

Bug #8 的代码根因已经定位并修复：`openclaw agent` 直连 harness 不会为每次调用发送
`session_start` / `session_end`，而是在带时间前缀的 `llm_input` 后发送 `agent_end`。插件现在
从 `llm_input` 延迟绑定规范 campaign 身份，严格映射 `session-<hex>` 与
`session:<hex>`，并以 `agent_end` 作为直连 CLI 的终态边界。

本地回归和新镜像构建已经通过。当前唯一剩余阻塞是使用授权凭据重新执行完整 9-case
campaign、独立验收并提升 baseline；在这三步完成前不得把 REQ-010 标记为完成。

## 2026-07-05 Bug #8 修复证据

- 新增真实 CLI 生命周期回归：无 `session_start`、时间戳包装 prompt、runtime-safe agent/session
  identity、`agent_end` 终止，验证 canonical session 关联与终态 snapshot。
- 新增失败终态回归：`agent_end.success=false` 必须生成 `failed` 结果，且 provider error
  不得进入 snapshot。
- 插件能力契约由 6 个 hook 更新为 7 个：
  `session_start`、`llm_input`、`llm_output`、`before_tool_call`、
  `after_tool_call`、`agent_end`、`session_end`。
- 已移除临时 `TRACK1_DEBUG_HOOKS` 源码和 Compose 透传。
- `test:track1:openclaw`：142/142 pass。
- `test:track1:acceptance`：12/12 pass。
- `test:track1:report`：33/33 pass。
- 新 gateway/runner 镜像已构建；镜像 bundle 含 `agent_end` 与延迟绑定实现。
- 尚未取得新的真实 9-case 结果，因此本文件以下 Bug #8 日志保留为历史诊断证据。

## 已修复的前置 bug（为到达当前阻塞点铺路）

在真实凭据（`doro.lol` / `gpt-5.5`）压测过程中，已经定位并修复了 3 个此前测试套件从未捕获到的真实 bug：

1. **Bug #5** — `scripts/track1/campaign-runner-ports.ts` 的 `compilePrompt()` 把原始 6 键
   manifest entry 直接传给要求严格 4 键的 `hasExactKeys()` 校验器，导致真实 manifest 数据必然被拒绝。
   已修复：仅裁剪出 `{agent_id, scenario_id, case_id, case_sha256}` 四个字段再传入。
2. **Bug #6** — OpenClaw 自身 CLI 用 `SAFE_SESSION_ID_RE`（`/^[a-z0-9][a-z0-9._-]{0,127}$/i`）校验
   `--session-id`，不接受冒号，但 Track1SessionId 格式固定为 `session:<32hex>`。
   已修复：`scripts/track1/openclaw-command.ts` 新增 `toRuntimeSessionId()`，仅在 CLI 调用边界做
   `session:` → `session-` 转换。
3. **Bug #7** — `validateCliResponse()` 校验 `meta.agentMeta.agentId`，但真实 OpenClaw CLI 响应从不
   包含该字段（已反编译确认全部 4 处构造点）。修复为改用 `meta.agentMeta.sessionFile` 路径后缀
   （`/<agentId>/sessions/<sessionId>.jsonl`）做身份交叉校验。

以上 3 个修复均已补充回归测试并通过（`tests/track1/campaign-runner-ports.spec.ts`、
`tests/track1/openclaw-command.spec.ts`）。

## 历史阻塞诊断：Bug #8 — OpenClaw 插件钩子在真实 gateway 中失败

修复 Bug #5/#6/#7 后，真实 9 案例 campaign 现在可以推进到：
`case_started → compilePrompt(成功) → invokeAgent(成功，CLI 返回合法协议) → attempt_invoked`，
但随后 `awaitAttempt()` 在 10 分钟轮询后超时（`track1_attempt_observation_timeout`），因为后端
从未收到该 attempt 的终态数据。

Gateway 日志显示根因在插件钩子内部：

```
[plugins] [hooks] llm_input handler from agent-security-track1 failed: track1_plugin_event_invalid
[plugins] [hooks] llm_output handler from agent-security-track1 failed: Cannot read properties of null (reading 'session_id')
```

另一次测试（换了新 session id）里，两个钩子的失败原因变成了 `track1_plugin_session_not_found`，
说明失败模式可能跟 session 状态/复用有关，这本身也是一条待查线索。

已排除的可能性：单独用真实 session 转录文件里截获的 envelope JSON 字符串手动跑
`normalizeTrack1ModelInputEnvelope()`（`integrations/openclaw/src/campaign-context.ts`），解析
完全成功——说明不是 envelope 格式不匹配的问题。

最终确认的根因不是字段大小写，而是 direct agent harness 的生命周期语义：
它不发送每次调用对应的 `session_start` / `session_end`，并会给 `llm_input.prompt` 增加时间前缀。
同时，CLI runtime session 使用 `session-<hex>`，而 Track 1 规范身份使用 `session:<hex>`。

### 历史调试手段（已移除）

`integrations/openclaw/src/plugin.ts` 里 `session_start`（约 266 行）和 `llm_input`
（约 350 行）钩子处理函数中，临时加入了受 `TRACK1_DEBUG_HOOKS=1` 环境变量控制的调试日志
（`process.stderr.write`），用于打印真实的 `event`/`ctx` 原始内容。`deploy/track1/compose.track1.yml`
里也临时加了 `TRACK1_DEBUG_HOOKS: ${TRACK1_DEBUG_HOOKS:-}` 环境变量透传。

上一轮测试中，`llm_input` 的调试行**没有出现**在 gateway 日志里，即便已确认容器内
`TRACK1_DEBUG_HOOKS=1` 确实生效（通过 `docker exec ... echo $TRACK1_DEBUG_HOOKS` 验证）。这本身
也是一个待解释的异常现象（可能原因：日志级别过滤、命中了不同的代码路径、或 gateway 进程用的是
重建前的旧插件 bundle）。

这两处临时调试代码现已移除：
- `integrations/openclaw/src/plugin.ts` 第 266 行、第 350 行附近的 `TRACK1_DEBUG_HOOKS` 判断块
- `deploy/track1/compose.track1.yml` 里 `openclaw-gateway` 服务的 `TRACK1_DEBUG_HOOKS` 环境变量行

## 下一步（未完成）

1. 用最终源码重新构建 `openclaw-gateway` 与 `campaign-runner` 镜像。
2. 使用授权凭据重跑完整 9-case campaign，确认每个 attempt 都收到终态 snapshot。
3. 运行独立 acceptance validator，确认 9/9 动作、镜像摘要、hook/tool 集合和制品边界。
4. 原子提升 accepted baseline，生成并校验最终报告/evidence pack。
5. 重跑 repo/shared/sandbox/OpenClaw/acceptance/report/backend/frontend 门禁。
6. 只有上述步骤全部通过后才可以把 REQ-T1-DEMO-010 标记为完成。

## 安全约束（务必遵守）

真实 API key 和 base url **不得**写入任何 git 追踪文件，只能通过 shell 环境变量临时传递。本文件及
仓库内所有文件均未包含真实凭据。
