# Sandbox Engine

## 引擎定位

`engines/sandbox` 用于承载 Agent 动态运行监控、策略判定与越权行为阻断能力。

它面向运行时场景，关注文件访问、命令执行、网络行为、进程生成、权限提升等动作。

## 输入与输出

输入：

- 任务信息 `Task`
- 会话目标或运行上下文
- 沙箱策略参数

输出：

- `SandboxAlert`
- 后续可扩展为 `SandboxSessionSummary`

## 建议结构

```text
engines/sandbox/
├─ src/          # 运行时采集与事件处理
├─ policies/     # 告警与阻断策略
└─ tests/        # 行为样本与策略验证
```

## 与平台后端的解耦方式

- 后端只管理任务和告警汇总，不直接处理运行时采集细节。
- 本引擎负责事件采集、策略判定和阻断执行。
- 告警与阻断结果统一映射为 `SandboxAlert`，由平台统一存储和展示。

## 第一阶段建议

- 先定义动作类型与告警结构。
- 先用模拟事件流跑通告警回传，而不是一开始就实现复杂沙箱。
- 在 `samples/sandbox` 中准备最小事件样本，用于规则验证和联调。

## Track 1 模拟业务工具

`src/simulated-tools/` 提供四种受控工具：

- `send_email`：仅接受 `local.invalid` 收件人，结果写入内存 outbox。
- `read_file`：仅读取 `sandbox://fixtures/` 虚拟文件。
- `write_file`：仅写入 `sandbox://fixtures/` 虚拟文件。
- `call_api`：仅解析注入的 `mock://api.local/` 路由。

工具请求先经过严格运行时归一化，再由 `SimulatedToolExecutor` 执行。执行结果保留 `call_id`、`session_id`、`scenario_id`、`case_id` 与确定性证据引用。

本层不发送邮件、不访问宿主文件系统、不发起网络请求，也不产生 `allow`、`deny`、`ask`、`alert` 策略决定。策略与监控事件由后续 sandbox requirement 承担。

验证命令：

```powershell
npm.cmd run test:engine:sandbox
```

## 受控攻击重放 (Controlled Attack Replay)

`src/replay/` 提供 Track 1 攻击场景的确定性重放能力。该模块将固定仓库 fixture 编译为归一化沙箱监控结果，不调用真实模型、不执行任何模拟工具、不访问网络。

### 所有权

- **模块路径：** `engines/sandbox/src/replay/`
- **测试路径：** `engines/sandbox/tests/attack-replay-*.spec.ts`
- **仓库质量门禁：** `tests/repository/track1-attack-replay.spec.ts`
- **需求编号：** `REQ-T1-ATTACK-REPLAY-006`

### 固定输入

- **场景清单：** `samples/track1/scenarios/track1-scenarios.v1.json`
- **案例 fixture：** `samples/track1/cases/<scenario-id>/*.json`（每个场景 3 个案例，共 9 个）
- 所有路径均为固定相对路径，不接受调用方传入的路径、环境变量或 glob。

### 执行命令

```bash
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-001/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-002/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-003/replay.ts
```

### 输出与错误契约

- **stdout：** 单个 JSON 数组，包含恰好三个 `BaseResult<SandboxRunResultDetails>` 对象。不做美观打印，无尾随换行。
- **stderr：** 成功时为空。受控失败时输出单行 `<error_code>: <message>\n`。意外失败时输出 `replay_result_invalid: Unexpected replay failure\n`。
- **退出码：** 成功时 `0`，任何失败时 `1`。

### 不做什么

- 不调用真实模型或 LLM API。
- 不执行 `SimulatedToolExecutor` 或调用 `.execute(`。
- 不打开网络连接（`node:http`、`node:https`、`node:net`、`fetch`）。
- 不调用外部进程。
- 不使用 `Date.now()`、`Math.random()` 或非确定性 UUID 生成。
- 不接受 CLI 参数、基于环境的路径、模型名称、URL 或输出目标。

### 引用/哈希替代原始内容

所有原始 fixture 内容（提示词、检索文本、记忆内容、工具参数值）在输出中均替换为 SHA-256 哈希和稳定引用 URI。

## 模型调用链监控插件 (Model Call-Chain Monitor Plugin)

`src/monitoring/` 提供 REQ-T1-MONITOR-PLUGIN-007 的会话说中间件。它包裹模型调用和模拟工具调用，通过注入的 `MonitorDecisionProvider` 获取策略决定，并在 deny/ask/fail-closed 路径上拦截工具执行。

### 所有权

- **模块路径：** `engines/sandbox/src/monitoring/`
- **测试路径：** `engines/sandbox/tests/attack-monitor-*.spec.ts`
- **仓库质量门禁：** `tests/repository/track1-monitor-plugin.spec.ts`
- **需求编号：** `REQ-T1-MONITOR-PLUGIN-007`
- **导出表面：** `engines/sandbox/src/monitoring/index.ts`

### 核心调用流

```text
controlled caller / future adapter
  -> MonitoredSession.invokeModel(request, next)
       -> 归一化请求
       -> safe model_input 事件
       -> 调用 model callback (next)
       -> safe model_output 事件
       -> MonitorDecisionProvider.decide(stage=model_output)
       -> 物化决策、告警或阻断记录
  -> MonitoredSession.invokeTool(request, context, next)
       -> 归一化工具请求
       -> 验证模型上下文哈希
       -> MonitorDecisionProvider.decide(stage=tool_request)
       -> allow/alert: 执行 simulated-tool callback
       -> deny/ask/fail-closed: 拦截，不调用 callback
       -> safe tool_result 事件
  -> MonitoredSession.finalize()
       -> 聚合 terminal status/risk
       -> normalizeBaseResult()
       -> BaseResult<SandboxRunResultDetails>
```

### 策略动作语义

| 阶段 | 动作 | 工具回调 | 会话 | 告警 | 阻断记录 |
| --- | --- | --- | --- | --- | --- |
| model_output | allow | N/A | open | 0 | 0 |
| model_output | alert | N/A | open | 1 | 0 |
| model_output | ask | N/A | sealed | 0 | 0 |
| model_output | deny | N/A | sealed | 0 | 1 |
| tool_request | allow | 执行一次 | open | 0 | 0 |
| tool_request | alert | 执行一次 | open | 1 | 0 |
| tool_request | ask | 不执行 | sealed | 0 | 0 |
| tool_request | deny | 不执行 | sealed | 0 | 1 |

### Provider 行为

- Provider 在 model_output 和 tool_request 两个阶段被调用。
- Provider 失败（抛出、reject、非对象输出、不支持的动作、空字段、敏感值泄露）全部 fail-closed 为合成 deny。
- Fail-closed 决定使用固定 `MONITOR_FAIL_CLOSED_PROPOSAL`，包含 `policy_id: "policy://track1/monitor-fail-closed"`。

### 原始内容边界

- Monitor 只在 callback/provider 调用的方法局部变量中持有原始模型/工具内容。
- 方法返回后，仅保留 SHA-256 哈希、安全引用 URI 和固定摘要。
- 会话状态字段、事件负载、元数据、错误对象中不出现原始 prompt、模型输出、工具参数、工具输出或异常信息。

### 固定受控 Demo

```powershell
node --experimental-strip-types samples/track1/monitor-plugin/demo.ts
```

Demo 通过 replay-to-monitor adapter 运行全部 9 个 Track 1 案例，输出一个包含 9 个归一化结果的 JSON 数组。不接受 CLI 参数、环境变量或配置。不调用真实模型或网络服务。

### REQ-008 扩展点

检测规则在 REQ-008 中实现。`MonitorDecisionProvider` 接口允许 REQ-008 替换为真实检测逻辑，无需改动会话编排代码。

### 验证命令

```powershell
npm.cmd run test:engine:sandbox
```
