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
