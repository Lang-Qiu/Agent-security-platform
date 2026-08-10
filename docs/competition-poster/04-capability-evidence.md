# 04 — 能力证据账本

状态取值：`IMPLEMENTED` / `PARTIALLY_IMPLEMENTED` / `EXPERIMENTAL` / `SPEC_ONLY` / `PLANNED` / `TODO`

测试证据均为**本次审计实际执行结果**，非引用 README。

---

## A. 引擎核心机制

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 判官前置确定性脱敏 + **atom 回泄验证** | IMPLEMENTED | `security-production/deterministic-sanitizer.ts` 1270 行；10 类脱敏管线 `:678-738`；`assertNoSensitiveAtoms` `:1102-1135`（脱敏后再经 NFKC/百分号解码/base64 解码三重复查，原子重现即硬失败）；占位符反伪造 `:675` | `sandbox-security-production-sanitizer.spec.ts` **48/48 pass**；external-pipeline spec 第 4 例 + integration 第 6 例证明脱敏失败 → **0 次判官调用** | 资源上限硬编码（128KiB/串、384KiB 总量、深度 4） | **可，且应为首要卖点** |
| 外部判官令牌边界（`etok:`，判官永不见原文） | IMPLEMENTED | `security/sanitized-boundary.ts` 829 行；令牌派生 `:211-287`；反向映射校验 `:551-648`；禁止原始元数据键扫描 `:289-532` | `sandbox-security-sanitized-boundary.spec.ts` **56/56 pass** | — | **可** |
| LLM 输出三层收束（不信任模型输出） | IMPLEMENTED | ① provider 端强 schema：`ollama-contract.ts:23-60`（`additionalProperties:false` + 闭合枚举）、`openai-judge-contract.ts:556-558`（`strict:true`）；② 解析端复验 `openai-judge-detector.ts:466`；③ **obligation 绑定表校验** `:399`——未知 id 整份作废，category/subject_refs **取自本地绑定而非模型** `:404-411` | `openai-detector.spec.ts` 12/12、`openai-contract.spec.ts` 26/26、`openai-chat-contract.spec.ts` 15/15、`ollama-contract.spec.ts` 10/10 **全 pass** | 模型仍可提供 outcome/severity/confidence（三词映射为固定 0.6/0.8/0.9） | **可，第二卖点** |
| 决策后语义自校验（重新推导并比对） | IMPLEMENTED | `security/semantic-validator.ts` 650 行；重算 qualification/escalation/publication/reducer 并与决策比对 `:330-650`；拒绝伪造信号与 etok 泄漏 | 由 `sandbox-security-engine.spec.ts` 覆盖（264 例中 250 pass） | `assertUnresolvedSignals` `:255-265` 近乎空操作；judge 路径的 unresolved 校验弱于非 judge 路径（`:479-492` 只查伪造、不查丢失） | **可，但表述为「决策一致性复核」** |
| 检测器输出隔离边界（本地检测器不可越界） | IMPLEMENTED | `security/detector-output-boundary.ts` 411 行；精确键形状、枚举/置信度校验、`reason_code === sandbox_security_<category>`、handle+nonce 绑定、locator 校验、64KiB 上限、candidate/clearance 冲突拒绝 | `sandbox-security-detector-boundary.spec.ts` **41/41 pass** | 「内容泄漏检测」仅 3–5 个硬编码字面量（`raw_content`/`PROMPT_SECRET`/`password=` + `hsrc:`/`hcall:` 前缀），**不是通用泄漏检测器** | **可，但不得称「内容泄漏检测」** |
| fail-closed 策略归约 | IMPLEMENTED | `security/policy-reducer.ts:292-323`：engine_failure → `indeterminate`；unresolved 抬升 action 并给风险下限；末位守卫「`risk_detected` + `allow` → `alert`」`:321-323` | `sandbox-security-policy.spec.ts` 57 例中 **56 pass**（1 红为预算断言漂移） | 风险下限 `tool_request?high:medium` 硬编码在 3 处，绕过 action_matrix | **可** |
| 双 profile 单调性 import 期数学校验（strict ≥ balanced） | IMPLEMENTED | `security/policy-profiles.ts:306-348`；`assertStrictNotLessRestrictive` 在模块加载时执行 `:386-388` | 同上 spec | 两 profile 是**硬编码常量**，非从 `engines/sandbox/policies/` 加载；slot 固定 3 个 | **可，措辞为「两档策略档位」不可称「策略系统」** |
| 权威来源绑定（提交内容 vs 权威上下文逐字段比对） | IMPLEMENTED | `security/source-authority.ts:464-596`；JSON 用 JCS 等价比较；输出 symbol-branded 冻结对象 `:56-74` | `sandbox-security-authority.spec.ts` **18/18 pass** | `provenance_ref` 仅校验非空，无格式校验 | **可** |
| 确定性可复现（canonical JSON + 确定性发布排序） | IMPLEMENTED | `canonical-json.ts:51-165`（拒绝非纯原型/`__proto__`/孤立代理对/循环/非有限数）；`finding-qualification.ts:354-424` 主体令牌序数化 + findings 确定性排序；`finding_id = sha256(decision_id+uniqueness_key+severity+confidence)` `:189-202` | `sandbox-security-input.spec.ts` **60/60**、`sandbox-security-detector.spec.ts` **38/38 pass** | — | **可** |
| 单预算锚点 + 逐阶段复查 + slot 租约 | IMPLEMENTED（但其断言测试当前红） | `runtime-deadline.ts:82` `min(slot_timeout, remaining)`；abort 原因优先级 `:137-155`；`engine.ts` 11 阶段各自复查 | **14 red** in `sandbox-security-engine.spec.ts` + 1 red in policy spec | 红灯根因：commit `b2f5132` 将 work budget 5000→360000ms、判官槽 4000→300000ms，未同步测试。**当前 360s 预算下的行为基本未被测试覆盖** | **不建议单独宣传** |
| 升级/降级状态机（escalation FSM 4 态） | IMPLEMENTED | `escalation-state.ts:218-545`；一次性 obligation 与 outcome | 由 engine spec 覆盖 | `__materialized` 标志通过**变更返回对象**实现（`:308,:357`），外部可写；`decision_id` 中 `:`→`-` 重写（`:338-345`）存在理论碰撞 | 可，但不必细讲 |
| 三 slot 严格串行 + 高危短路 | IMPLEMENTED | `engine.ts:662-670` slot 顺序 rule→local→judge；`shouldShortCircuit` `:217,:684`；短路后跳过 local/judge `:702-777` | 2 red（254/255，同预算漂移根因） | 串行意味着延迟叠加（观测：本地约 5s、判官约 60s，来自 commit body 自述） | 可 |

---

## B. 检测器实现

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 9 类别确定性规则检测器 | IMPLEMENTED | `rule-detector.ts:650` 工厂；条件算子解释器（9 种算子含 `cross_source_ordered_sequence`）；`rule-catalog.ts:576-724` 9 条规则冻结，validator 强制固定置信度集合 `{0.6,0.8,1}` `:489` | `rule-detector.spec.ts` **26/26**、`rule-catalog.spec.ts` **35/35 pass** | **命中条件极窄**：prompt injection 需同时含 `ignore`+`previous`+`instructions`；unsafe side effect 只匹配工具名 `delete_file`；privilege escalation 只匹配参数键 `sudo`。属**演示级规则集**，非广覆盖 | 可写「9 类攻击面各配确定性规则基线」，**不得写「规则覆盖全面」** |
| 本地模型检测器（Ollama `qwen3:8b`，digest 双校验） | IMPLEMENTED（运行需本地模型） | `ollama-local-detector.ts`；资格握手：inventory GET → digest 比对 → 预热 → 时延闸 `:348,:434`；**每次响应重校 digest** `:611-621`；`temperature 0, seed 0` 固定 `ollama-contract.ts:95-99` | `ollama-detector.spec.ts` 28 例中 **26 pass**（2 红为预算漂移） | 需 WSL 内自装 Ollama（Windows 侧不可达，NAT 限制）；模型硬钉 `qwen3:8b` | 可 |
| 外部判官（仅两种协议白名单 + HTTPS/FQDN 端点策略） | IMPLEMENTED（运行需外部端点与密钥） | `judge-protocol-adapter.ts:1-13` 两项白名单；端点策略 `:15,:157`；`openai-judge-detector.ts:472` | `judge-protocol-adapter.spec.ts` **68/68 pass** | 无检测器内重试、无 fallback（全仓 `retry` 0 命中于生产目录）；判官槽 300s | 可 |
| 密钥零留痕配置（env-only + WeakMap + 首次构造即删除） | IMPLEMENTED | `production-config.ts`：仅 own-property 读取 `:60-82`；WeakMap 存放 `:49-52`；构造 transport 后**删除条目** `:241`，`finally` 中置空局部变量 `:259-263`；`summary` 永不含密钥 `:16-25`；源码内无任何 provider URL（硬编码 URL 仅 localhost Ollama） | `config.spec.ts` **34/34 pass**；`http-transport.spec.ts` **35/35 pass**（用 `node:http`/`node:https`，无 `fetch`） | 判官默认值被刻意移除，缺一项即 fail-closed | **可** |
| 三部署模式（rule_only / local / local_and_judge） | IMPLEMENTED | `production-config.ts:11-14`；`composition.ts:301-318,347,359,402` 分模式装配 | `composition.spec.ts` 24 例中 **21 pass**（3 红为预算漂移）；`index.spec.ts` **6/6** | `rule_only` 不读任何 provider 配置 | 可 |

---

## C. 后端与平台

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 有序准入管线（限流先于鉴权，鉴权先于读体） | IMPLEMENTED | `sandbox-security.controller.ts`：全局桶 `:365` → bearer 解析 `:368` → 令牌鉴权 `:373` → scope `:396` → 存储健康 `:420` → 每能力桶 `:443` → 幂等键 `:462` → 读体 `:480` → schema `:499` → stage/profile 授权 `:511` | `sandbox-security-controller.spec.ts` **71/71**、`routes.spec.ts` **7/7**、`limits.spec.ts` **14/14 pass** | 限流与并发闸均为**进程内**，水平扩容会成倍放大上限 | 可 |
| 极严输入准入 | IMPLEMENTED | `http-admission.ts`：单值头强制、`Content-Length`+`Transfer-Encoding` 冲突拒绝、`Content-Encoding` 拒绝、UTF-8 fatal 解码、**重复 JSON 键拒绝** + 128 层嵌套上限、声明长度与实际字节相等校验、5s 读体死线 | 同上 71/71 | — | 可 |
| 能力令牌（作用域 / 有效期 / 吊销） | IMPLEMENTED | `hmac.ts:346-362` 32 随机字节 → `sbxcap_v1.<43 b64url>`，仅存 `sha256:` 摘要，明文只返回一次；scope/stage/profile 白名单 `capability-authorizer.ts:476-509`；TTL 60–3600s；吊销 `capability.service.ts:574-657` | `capability.spec.ts` **16/16**、`admin.controller.spec.ts` **23/23**、`hmac.spec.ts` **10/10 pass** | **不是 HMAC 令牌**、比对**非 constant-time**（摘要→SQL 等值）；无 nonce/重放窗口；管理员 bootstrap token 为单一共享静态密钥 | 可写「作用域化能力令牌」，**不得写「HMAC 认证令牌」** |
| 幂等与重放（指纹绑定） | IMPLEMENTED | `evaluation.service.ts:261-366`；canonical fingerprint HMAC；`(scope_id, idempotency_key_hmac)` 主键；指纹不符 → 409 冲突；同指纹已完成 → 重放存储决策 | `evaluation.service.spec.ts` **21/21 pass**；`idempotency.spec.ts` 20 例中仅 5 pass（15 例被 Windows 权限门阻断，未执行断言） | SQLite 层在本机未验证 | 可 |
| 审计事件日志（仅追加 + 读取本身入审 + 游标 MAC） | PARTIALLY_IMPLEMENTED | `sqlite-audit.repository.ts`：仅暴露 append/listAndRecordRead/purge（无 update 方法）；行↔JSON 七列交叉校验 `:47-81`；`audit_read` 与列表**同事务**写入 `:291-300`；游标 `sbxcur_v1.<payload>.<mac>` + `timingSafeEqual` `hmac.ts:310-341`；90 天保留 | `audit.spec.ts` **20/20 pass** | **无哈希链、无签名、无触发器**，`DELETE` 存在于 purge 路径 `:339`。拥有 DB 写权限者可一致性改写而不留密码学痕迹 | 可写「仅追加、读取可审计、分页防伪」，**严禁写「防篡改账本」** |
| simulation 权威强制 | IMPLEMENTED | `simulation-authority.ts:74-100` 硬编码 `evaluation_mode:"simulation"`、每来源 `authority_kind:"simulation_observation"`、深拷贝；服务层拒绝任何非 simulation 决策 → 500 `evaluation.service.ts:62-77` | `simulation-authority.spec.ts` **4/4 pass** | 意味着**本模块不存在 live 执行路径**（这是安全设计，但也限制了「实战阻断」表述） | 可，且是诚实性加分项 |
| 存储加固（0600 / 目录权限 / 符号链接拒绝 / WAL / quick_check / schema 钉死） | IMPLEMENTED（本机未验证） | `sqlite-database.ts:12-95`；`sqlite-migrations.ts:247-325,401-408` 逐表定义字节比对 + deployment-key 绑定 + `foreign_key_check` | `sqlite.spec.ts` 40 例中仅 **6 pass**——34 例被 Windows POSIX 权限门（`sqlite-database.ts:29-31`，Windows 下目录恒报 0777）阻断 | 持久层行为在本机**未被验证** | 可写「存储加固」，需注明验证于 POSIX |

---

## D. 前端

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 评估工作台（真实后端往返，无 mock 回退） | IMPLEMENTED | `SandboxSecurityWorkbenchPage.tsx`（251 行）；`sandbox-security-service.ts` 仅两个 API 调用者；normalizer 拒绝 → `{kind:"invalid"}` 而非渲染 | 前端全量 **115/115 pass**（vitest/jsdom） | 无后端时无法呈现结果（设计如此） | 可 |
| 隐私泄漏哨兵测试 | IMPLEMENTED | `sandbox-security-privacy.spec.tsx` 209 行：植入 canary，断言其**在出站 body 中**、且**不在 10 个信道**（URL/localStorage/sessionStorage/history.state/document.title/console 5 级/DOM 文本/全部 DOM 属性）；令牌仅以 `Bearer` 出现在 Authorization 头 | 3 tests pass | 第 3 例（卸载后清理）近乎恒真 | 可 |
| 无障碍可操作性 | IMPLEMENTED | 单一 `role="status"` + `aria-live="polite"`；全部控件有可及名称；字节计量表 `aria-valuenow/valuemax` + `aria-invalid` 而非仅靠颜色 | 由工作台/审计/showcase spec 覆盖 | — | 可（作工程完成度佐证） |
| 演示展示页（三幕动效） | EXPERIMENTAL（数据为手写 fixture） | `SandboxSecurityShowcasePage.tsx` 270 行 + `showcase/` 6 组件；数据源 `content/sandbox-security-showcase.ts:189-213` **手写**（含 `elapsed_ms` 与 2884ms 总耗时）；页面自带「演示数据…不来自任何一次真实评估」标注 `:113-116` | `showcase.page.spec.tsx` pass；测试强制保留该标注 | **全部 showcase 文件 + app.css 改动为未跟踪/未提交** | 图可用；**配文不得称为真实运行捕获** |

---

## E. 执行链（OpenClaw）

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 四屏障执行插件（`before_agent_run` / `before_model_output_delivery` / `before_tool_execution` / `before_message_delivery`） | EXPERIMENTAL — 代码真实，**本 checkout 未激活** | `general-security/src/general-security/plugin.ts:41-46` 冻结元组、注册 `:705-715`；`action-mapper.ts:42-52,176-180` deny→`{outcome:"replace"}`；宿主补丁在 `execute()` 前返回 blocked `patch:158-181,1328-1340`；缺插件时 deny 兜底 `patch:125` | 阻断断言测试存在（`executions.length===0`）但 fixture 前置断言（存在 `general-security/node_modules/openclaw` 且版本 `2026.6.34`）**不成立**，测试无法运行。**未观测到通过运行** | 补丁目标 `2026.6.34`，实装 `2026.6.10`；抽查 4 个补丁目标文件全部缺失；补丁从未在本 checkout 应用；补丁另有一处 hunk 删除了整个出站投递队列（`patch:314-359`），与安全屏障无关 | **只能写为「面向宿主运行时的执行链设计与实现」，不得写「已部署/已生效阻断」** |
| 执行 fail-closed / 审计 fail-open 分离 | IMPLEMENTED（代码层） | 执行侧 deny 兜底 `action-mapper.ts:120-133,209-220`；health failed 覆盖结果 `plugin.ts:499-505`；审计侧不可达 → `degraded` 不改变屏障 `audit-client.ts:216-225`, `patch:610,673` | 同上，未观测运行 | **allow 决策在审计后端不可达时无记录留存** | 可作设计取舍陈述 |
| 后端执行审计接收端 | IMPLEMENTED | `POST /internal/sandbox/security/enforcement-events`；`internal-router.ts:60`；能力 scope 必须恰为 `["sandbox_security:enforcement:audit:write"]`；replay/conflict 检测 `sqlite-enforcement-audit.repository.ts:200-243`；`occurred_at` 由服务端赋值 | `enforcement-audit-controller.spec.ts` **17/17 pass**；repository spec 8 例中 1 pass（7 例被 Windows 权限门阻断） | 它**记录**执行结果，不做执行决策 | 可 |

---

## F. 语料与度量

| 能力/创新点 | 状态 | 代码证据 | 测试/运行证据 | 风险/限制 | 可否写进海报 |
|---|---|---|---|---|---|
| 300 例 9 类别基准语料 + 标签树独立哈希 + 上游 revision 锁定 | IMPLEMENTED | `samples/sandbox-security-benchmark/v1/` 605 文件；300 inputs + 300 truth（每条 `fixture_sha256` 绑定输入）；`manifest.json` 分别记 `inputs_tree_sha256` 与 `truth_tree_sha256`；`sources.lock.json` 锁定 246 条上游记录（OASST1 140 / ToolEmu 77 / deepset 49 / AgentDojo 34，均 revision + per-record SHA-256 + 许可证证据）；`ATTRIBUTION.md` 323 行含独立复现配方 | `npm run benchmark:sandbox-security:validate` **exit 0**，实测输出：total 300 / risk 180 / safe 120 / zh 150 / en 150 / transformed 54 / 9 类别各 20 / 三 stage 各 100 | 无任何手工编写样例（全部源自公开研究数据集） | **可，学术可复现性是强项** |
| 密封 benchmark 工具链（live capture + 隔离网络重放） | PARTIALLY_IMPLEMENTED | `benchmark-composition.ts` 1243 行；sealed-config 精确字段清单 `:190-193`；拒绝 proxy/撤销/带访问器的配置对象；内容无关捕获槽 | `benchmark-composition.spec.ts` 31 例中 22 pass（9 红）；**隔离重放门在本机无法运行**（脚本用 Linux `unshare --net`） | **9 红中 8 红因 `benchmark-composition.ts:1056` 硬要求 `qualification_timeout_ms===1000`，而 `composition.ts:311` 现传 40000 → 隔离重放路径当前在普通装配下不可用** | 只能写「工具链已实现且 fail-closed」 |
| 检测质量度量 | **无已接受结果** | 阈值定义 `scripts/benchmark/sandbox-security/evaluate.ts:57-64`（unsafe recall ≥0.90、high/critical ≥0.95、safe FP ≤0.05、transformed ≥0.85、coverage ≥0.95、每类别 ≥0.80） | 全仓**无** `seal.json` / `receipt-chain.json` / `evaluation-report.json`。仅 `docs/progress.md` 散文记录三次运行，**全部 FAILED**：最佳一次（2026-08-02 v4-02）unsafe recall **152/180=0.8444 < 0.90 未达标**、high/critical 57/60=0.95 达标、transformed 48/54=0.8889 达标、safe FP 0/120=0 达标、jailbreak **12/20=0.60**、instruction_override **13/20=0.65**（阈值 0.80）均未达标；结论 `evaluation_not_accepted`，`progress.md:9063` 自述「evidence root has zero entries」 | 当前状态字面为 `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE` | **不可作为效果宣传**。若必须提指标，只能诚实标注未达标 |
| Track1 九例受控实验（准确率 1 / 召回 1 / FPR 0） | IMPLEMENTED（但**属另一引擎**） | `docs/track1/evidence/openclaw-baseline/manifest.json`：`case_count 9, final_pass 9, deny 5, ask 2, allow 2, real_side_effect 0, exact_action_accuracy 1` | 真实密封运行记录存在 | **9 个用例 + Track1 base-filter 9 条规则，不是 sandbox-security 引擎、不是 300 例语料、不含 LLM**。原文档已自带「指标仅适用于受控数据集」caveat | **严禁与 sandbox-security 检测能力混用** |

---

## G. 明确的 DOC_ONLY / 不得使用

| 声称 | 状态 | 判定依据 |
|---|---|---|
| 「监控文件访问、命令执行、网络行为、进程生成、权限提升」（`engines/sandbox/README.md:5-7`） | **DOC_ONLY** | 全仓无 OS 级插桩；`samples/sandbox/` 仅 `.gitkeep` |
| 「动态沙箱监控与阻断引擎」（`README.md:121`） | **DOC_ONLY（措辞层面）** | 「阻断」仅为决策语义 + 未激活的宿主补丁 |
| 输出 `SandboxSessionSummary`（`engines/sandbox/README.md:19-20`） | **SPEC_ONLY（过期文档）** | 真实输出为 `sandbox-security-decision.v1` |
| LLMmap / Pasquini USENIX'25 论文方法 | **未实现** | 全仓 grep `pasquini|llmmap|usenix` 仅命中一份参考文献 md，源码 0 命中；该文献属 asset-scan 赛道背景 |
| `npm run test:engine:sandbox` 作为「验证通过」 | **CONTRADICTED** | 实际 exit 1，1030 例中 15 红 |
