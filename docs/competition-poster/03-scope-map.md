# 03 — Sandbox Engine 边界与模块图

## 一、边界定义（必须先讲清楚，否则海报会写错）

**Sandbox Engine 在本仓库中 = 一个确定性的「内容评估 + 策略归约」引擎**，输入是被注入的内容记录（用户输入 / 模型输出 / 工具调用请求），输出是版本化决策 `sandbox-security-decision.v1`（verdict / action / risk_level / findings / detector_runs / evidence_refs）。

**它不是操作系统级沙箱。** 仓库内不存在 syscall / 进程 / 文件 / 网络 拦截代码；`samples/sandbox/` 只有 `.gitkeep`。`engines/sandbox/README.md:5-7` 声称监控「文件访问、命令执行、网络行为、进程生成、权限提升」——该表述**无实现支撑**，属 DOC_ONLY，禁止写入海报。

「阻断」在本仓库的真实含义有且仅有两层：
1. 引擎返回 `action: deny | ask`（决策语义上的阻断建议）；
2. OpenClaw 插件在 `before_tool_execution` 屏障返回 `{outcome:"replace"}`，由被打补丁的宿主在 `execute()` **之前**返回 blocked 结果。第 2 层代码真实存在，但**在本 checkout 中未生效**（补丁目标 2026.6.34，实际安装 2026.6.10，补丁从未应用）。

## 二、核心 / 外围 / 规划三层划分

### A. 核心（Sandbox Engine 本体，8,479 行）
`engines/sandbox/src/security/` 21 个文件。这是唯一可称为「引擎」的部分：
- 编排层：`engine.ts`（1494 行，单一 `evaluate()`）
- 策略层：`policy-profiles.ts`（两个硬编码 profile）、`policy-reducer.ts`（纯归约）
- 权威与规范化层：`source-authority.ts`、`input-boundary.ts`、`canonical-json.ts`、`canonical-fingerprint.ts`、`subject-scope.ts`、`locator.ts`
- 边界层：`detector-output-boundary.ts`（本地检测器输出隔离）、`sanitized-boundary.ts`（`etok:` 外部令牌边界）
- 状态层：`escalation-state.ts`（4 态 FSM）、`run-ledger.ts`（每 slot 状态机）、`finding-qualification.ts`、`runtime-deadline.ts`
- 自校验层：`semantic-validator.ts`（650 行，决策后重新推导全链并比对）

### B. 核心检测器实现（生产组合，9,983 行）
`engines/sandbox/src/security-production/` 17 个文件。三个具体检测器 + 判官边界：
- `rule-detector.ts` + `rule-catalog.ts`：9 条确定性规则（9 类别各 1 条）
- `ollama-local-detector.ts` + `ollama-contract.ts`：本地 `qwen3:8b`，digest 双重校验
- `openai-judge-detector.ts` + 两个协议契约：外部判官，仅两种协议进白名单
- `deterministic-sanitizer.ts`（1270 行）：判官前置脱敏，10 类脱敏 + atom 回泄验证
- `composition.ts` / `production-config.ts`：三模式 `rule_only | local | local_and_judge`，env-only 配置、WeakMap 存密钥、首次构造后删除

### C. 外围依赖（消费引擎，不属于引擎本体）
- `backend/src/modules/sandbox-security/`（10,057 行，34 文件）：能力令牌、幂等、限流、并发、SQLite 审计、6 条路由。**它调用引擎，不实现检测逻辑**。
- `shared/contracts/sandbox-security*.ts`（2,730 行）：跨层 schema 与规范化函数。
- `frontend/src/{pages,components,services}/sandbox-security*`（32 文件）：工作台、审计页、演示页。
- `integrations/openclaw/general-security/`：四屏障执行插件 + 84KB 宿主补丁。**未激活**。
- `engines/sandbox/src/{base-filter,monitoring,replay,simulated-tools}/`：Track1 早期赛道产物，与 sandbox-security 是**不同引擎**，指标不可混用。

### D. 仅规划 / 仅文档（禁止当实现写）
- `docs/superpowers/plans/` 45 份、`specs/` 15 份。无任何一份记录终态 `VERIFIED` 或 `COMPLETE`。
- 各系列声明状态：core-001 `APPROVED`(spec)；production-002 `IMPLEMENTATION_PENDING_FORMAL_P6_EVIDENCE`；backend-api-003 `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`；openclaw-004 P4 进行中（余 9 任务）；frontend-005 `PLAN_DRAFT_PENDING_REVIEW` + 执行授权 **NOT GRANTED**（但代码已合并，属文档滞后）。
- `docs/智能体安全/Paper/usenixsecurity25-pasquini.pdf`（LLMmap）：全仓库 0 处引用，**背景阅读，非实现依据**。

## 三、层次结构（文字模块图）

```
                    HTTP 客户端 / 前端工作台
                              │
        ┌─────────────────────▼──────────────────────┐
        │  backend/src/modules/sandbox-security       │  ← 外围（非引擎）
        │  admission → 能力令牌鉴权 → 限流 → 幂等     │
        │  → 并发闸(4) → simulation authority 构造    │
        │  → 指纹 HMAC → [引擎调用] → 审计落库        │
        └─────────────────────┬──────────────────────┘
                              │ engine.evaluate(request, signal)
        ┌─────────────────────▼──────────────────────┐
        │  security-production/composition.ts         │  ← 检测器装配
        │  三模式：rule_only / local / local_and_judge │
        └─────────────────────┬──────────────────────┘
                              │
        ┌─────────────────────▼──────────────────────┐
        │  security/engine.ts  单一 evaluate()        │  ← 引擎核心
        │                                             │
        │  ① 权威绑定 source-authority                │
        │  ② 输入边界 input-boundary（nonce+handle）  │
        │  ③ profile 解析 + deadline 控制器            │
        │  ④ 串行三 slot：rule → local → judge        │
        │      每 slot：lease → detect → 输出边界      │
        │      → qualification → escalation           │
        │  ⑤ judge 前：etok 令牌注册表 + 脱敏 + 校验   │
        │  ⑥ 发布：主体令牌 + 确定性排序 + evidence    │
        │  ⑦ policy-reducer 归约（fail-closed）        │
        │  ⑧ semantic-validator 决策后自校验          │
        └─────────────────────────────────────────────┘
```

## 四、关键边界不变量（可写进海报的机制性事实）
- 三 slot **严格串行**，从不并行；rule 命中高危可短路跳过 local/judge。
- 外部判官**永不接触原文**：只见 `etok:` 令牌 + 已脱敏 obligation；脱敏失败 → 零次判官调用。
- 判官返回的 **category / subject_refs 取自本地绑定表**，模型只能提供 outcome/severity/confidence；未知 obligation_id → 整份结果作废。
- 单一预算锚点：`min(slot_timeout, remaining)`，11 个阶段各自复查剩余预算。
- `evaluation_mode` 在后端硬编码为 `simulation`，任何非 simulation 决策被服务层拒绝 → 500。
