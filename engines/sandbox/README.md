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
