# 01 · Sandbox Engine 相关文件清单（GATE 1 产出）

审计基线：分支 `sandbox`，HEAD `daa38c3`，审计日期 2026-08-09。
统计口径：`engines/sandbox/src` 共 26,435 行；`backend/src/modules/sandbox-security` 共 10,057 行；前端 sandbox-security 相关 32 个文件；spec/plan 文档约 60 份。

重要度定义：
- **P0** = 决定"作品是什么"的核心实现与其证据（必须逐文件读完）
- **P1** = 支撑调用链、接口、UI 展示、测试证据（必须读完）
- **P2** = 外围、历史、规划类（抽样阅读，仅用于识别 spec > impl 风险）

---

## 一、引擎核心：`engines/sandbox/src/security/`（P0，8,479 行）

| 路径 | 行数 | 类型 | 级别 | 说明 |
|---|---|---|---|---|
| `security/engine.ts` | 1494 | 实现 | P0 | 唯一编排入口 `evaluate()`：权威绑定 → 输入边界 → profile → 三段检测器 → 发布 → 归约 → 语义校验 |
| `security/policy-reducer.ts` | 326 | 实现 | P0 | 纯函数归约器：findings + runs + 未决信号 + 引擎故障 → `{verdict, action, risk_level}` |
| `security/policy-profiles.ts` | 440 | 实现 | P0 | 两个冻结 profile（balanced/strict）、信任分级规则、动作矩阵、3 个检测器槽位；import 期自校验 |
| `security/escalation-state.ts` | 545 | 实现 | P0 | 升级状态机（collecting → obligations_materialized → judge_applied → closed） |
| `security/finding-qualification.ts` | 607 | 实现 | P0 | 阈值分流（accepted/routing/discarded）、finding ID 哈希、公开 token 铸造、确定性排序 |
| `security/detector-output-boundary.ts` | 411 | 实现 | P0 | 本地检测器输出校验：精确键、枚举、句柄绑定、定位符校验、去重、泄漏扫描 |
| `security/sanitized-boundary.ts` | 829 | 实现 | P0 | `etok:` 外部令牌注册表、脱敏载荷校验、Judge 输出反向映射回私有句柄 |
| `security/source-authority.ts` | 596 | 实现 | P0 | 提交内容与权威上下文逐字段比对；symbol 品牌化冻结请求 |
| `security/semantic-validator.ts` | 650 | 实现 | P0 | 事后重算（qualification/escalation/publication/reducer）并与决策比对 |
| `security/input-boundary.ts` | 347 | 实现 | P0 | nonce + `hsrc:`/`hcall:` 句柄铸造、规范化投影、sha256、512 KiB 上限 |
| `security/run-ledger.ts` | 399 | 实现 | P0 | 逐槽位状态机 → `SandboxDetectorRun[]` |
| `security/runtime-deadline.ts` | 205 | 实现 | P0 | 预算控制器 + 检测器租约 `min(slot_timeout, remaining)`、中止原因优先级 |
| `security/detector-registry.ts` | 161 | 实现 | P0 | 校验并冻结 `{rule, local?, judge?}` 注册表 |
| `security/detector-contract.ts` | 195 | 实现 | P0 | 检测器/脱敏器/载荷类型 + 尺寸上限常量 |
| `security/canonical-json.ts` | 182 | 实现 | P0 | JCS 规范序列化：拒绝异常原型、`__proto__`、孤立代理项、环、非有限数 |
| `security/canonical-fingerprint.ts` | 133 | 实现 | P0 | 权威校验后的规范投影 → 外部 HMAC 端口，输出须匹配 `hmac-sha256:<64hex>` |
| `security/locator.ts` | 233 | 实现 | P1 | 内容定位符（整体/字节区间/JSON pointer）与工具定位符校验 |
| `security/subject-scope.ts` | 114 | 实现 | P1 | 作用域规范化去重 + UTF-16 排序 → `subject_key` |
| `security/index.ts` | 68 | 实现 | P1 | 公共出口（刻意不导出内部边界与 unsupported error） |
| `security/adapters/track1-rule-matches.ts` | 415 | 实现 | P1 | 将 Track1 base-filter 规则目录包装为 `RawLocalDetector`（硬编码 4 种工具形态） |
| `security/adapters/monitor-decision-provider.ts` | 129 | 实现 | P1 | 决策 → 无内容监控提案；任何抛出即 fail-closed |

## 二、生产检测器层：`engines/sandbox/src/security-production/`（P0，9,983 行）

| 路径 | 行数 | 类型 | 级别 | 说明 |
|---|---|---|---|---|
| `security-production/composition.ts` | 426 | 实现 | P0 | 三种模式装配 `rule_only` / `local` / `local_and_judge`；资格计时器 + AbortController |
| `security-production/deterministic-sanitizer.ts` | 1270 | 实现 | P0 | Judge 边界确定性脱敏器：NFKC 归一 + 10 类脱敏 + 资源护栏 + 回泄验证 |
| `security-production/rule-detector.ts` | 668 | 实现 | P0 | 确定性匹配器：快照→投影，9 类条件算子，跨来源序列 |
| `security-production/rule-catalog.ts` | 727 | 实现 | P0 | 9 条冻结规则描述符 + 严格校验器（形态/枚举/固定置信度/ID 唯一） |
| `security-production/ollama-local-detector.ts` | 696 | 实现 | P0 | 本地模型资格握手（inventory digest → prewarm → 时延闸门）+ 本地检测 |
| `security-production/ollama-contract.ts` | 408 | 实现 | P0 | 本地模型线协议：系统提示、JSON Schema 响应格式、解析器；模型锁定 `qwen3:8b` |
| `security-production/openai-judge-detector.ts` | 518 | 实现 | P0 | Judge 检测器：绑定 obligation、按协议分派、解析、映射为候选/清除 |
| `security-production/openai-judge-contract.ts` | 1265 | 实现 | P0 | Responses API 判定契约：v2/v3 两套提示、strict json_schema、信封校验 |
| `security-production/openai-chat-judge-contract.ts` | 473 | 实现 | P1 | Chat Completions 变体契约 |
| `security-production/judge-protocol-adapter.ts` | 220 | 实现 | P0 | 两项协议白名单 + HTTPS/FQDN 端点策略 |
| `security-production/http-transport.ts` | 985 | 实现 | P0 | 基于 `node:http`/`node:https` 的真实 HTTP（无 fetch）；digest 用 `timingSafeEqual` 校验 |
| `security-production/production-config.ts` | 264 | 配置 | P0 | 环境变量归一化与校验；WeakMap 私有态存密钥；一次性交接 |
| `security-production/benchmark-composition.ts` | 1243 | 实现 | P0 | 实况采集 + 密闭重放两套装配、sealed-config 校验、无内容采集汇 |
| `security-production/provider-outcomes.ts` | 653 | 实现 | P1 | 重放结果归一化器（Ollama inventory/chat、OpenAI responses） |
| `security-production/external-pipeline.ts` | 136 | 实现 | P1 | 将真实脱敏器 + Judge 检测器配对进引擎外部槽位 |
| `security-production/p6-live-capture-profile.ts` | 10 | 配置 | P1 | P6 实况采集时序常量（40000/60000/300000/360000 ms） |
| `security-production/index.ts` | 21 | 实现 | P0 | 公共出口 `createSandboxSecurityProductionEngine({runtime, mode})` |

## 三、后端 API 与治理：`backend/src/modules/sandbox-security/`（P0/P1，10,057 行）

| 路径 | 行数 | 类型 | 级别 | 说明 |
|---|---|---|---|---|
| `sandbox-security.controller.ts` | 753 | 实现 | P0 | 公开控制器 `evaluate` + `listAuditEvents`；有序准入管线 |
| `evaluation.service.ts` | 504 | 实现 | P0 | 评估编排：授权→指纹→幂等占用→并发→引擎→审计→完成 |
| `capability-authorizer.ts` | 594 | 实现 | P0 | 令牌认证（摘要查表）、scope/stage/profile 授权、管理令牌比对 |
| `capability.service.ts` | 659 | 实现 | P0 | 能力令牌签发（含 enforcement 审计能力）与吊销 |
| `http-admission.ts` | 774 | 实现 | P0 | 头部/分帧/正文准入、重复 JSON 键拒绝、查询解析、错误映射 |
| `hmac.ts` | 362 | 实现 | P0 | 域分隔 HMAC-SHA256 帧、游标 MAC、不透明令牌铸造 |
| `audit.service.ts` | 356 | 实现 | P0 | 审计分页（HMAC 游标）+ 90 天保留期清理 |
| `audit-projector.ts` | 199 | 实现 | P1 | 类型化审计事件的纯投影 |
| `adapters/production-evaluation.gateway.ts` | 99 | 实现 | P0 | **后端 → 引擎的唯一桥接点**（import `engines/sandbox`） |
| `adapters/sqlite/sqlite-migrations.ts` | 517 | 实现 | P0 | v1 schema、v1→v2 迁移、定义精确性断言 |
| `adapters/sqlite/sqlite-audit.repository.ts` | 356 | 实现 | P0 | 审计追加 / 列表+读取记录 / 清理 |
| `adapters/sqlite/sqlite-idempotency.repository.ts` | 764 | 实现 | P1 | 幂等占用/完成/中断 + 维护循环 |
| `adapters/sqlite/sqlite-capability.repository.ts` | 863 | 实现 | P1 | 能力持久化（两类） |
| `adapters/sqlite/sqlite-enforcement-audit.repository.ts` | 254 | 实现 | P1 | 执行事件追加 + 重放/冲突检测 |
| `adapters/sqlite/sqlite-database.ts` | 248 | 实现 | P1 | DB 打开、POSIX 权限加固、WAL、quick_check |
| `sandbox-security-admin.controller.ts` | 280 | 实现 | P1 | 内部管理面：签发/吊销/清理 |
| `sandbox-security-enforcement-audit.controller.ts` | 278 | 实现 | P1 | OpenClaw 执行事件**摄入**（仅写审计） |
| `enforcement-audit.service.ts` | 100 | 实现 | P1 | 执行候选 + 身份 → 仓储追加 → ack |
| `token-bucket.ts` | 199 | 实现 | P1 | 令牌桶 + 按能力限流注册表 |
| `simulation-authority.ts` | 102 | 实现 | P0 | 构造 `evaluation_mode:"simulation"` 权威上下文 |
| `engine-concurrency.ts` | 27 | 实现 | P1 | 进程内信号量，容量硬钉 4 |
| `sandbox-security.config.ts` | 170 | 配置 | P1 | 环境配置加载校验 + Node 运行时端口 |
| `sandbox-security.module.ts` | 466 | 配置 | P0 | 组合根 + 仅注入工厂 |
| `sandbox-security.types.ts` / `.errors.ts` | 491 / 168 | 实现 | P1 | 边界类型 / 服务错误描述符 |
| `ports/*.ts`（8 个） | 152 | 实现 | P1 | 端口接口声明（依赖倒置） |
| `dto/capability.ts` / `dto/enforcement-audit-capability.ts` | 191 / 131 | 实现 | P1 | 签发请求归一化器 |

## 四、共享契约（P0/P1，2,730 行）

| 路径 | 行数 | 级别 | 说明 |
|---|---|---|---|
| `shared/contracts/sandbox-security.ts` | 697 | P0 | 决策 schema `sandbox-security-decision.v1` 归一化/校验 |
| `shared/contracts/sandbox-security-api.ts` | 600 | P0 | API 层契约（审计页、响应信封） |
| `shared/contracts/sandbox-security-request.ts` | 482 | P0 | 请求 schema `sandbox-security-request.v1` |
| `shared/contracts/sandbox-security-enforcement-audit.ts` | 479 | P1 | 执行审计事件契约 |
| `shared/contracts/sandbox.ts` | 472 | P2 | Track1 早期 Sandbox 契约（历史） |

## 五、前端（P1，32 个文件）

| 路径 | 行数 | 类型 | 级别 | 说明 |
|---|---|---|---|---|
| `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx` | 251 | 前端 | P0 | 评估工作台：唯一证明真实后端往返的界面 |
| `frontend/src/pages/SandboxSecurityAuditPage.tsx` | 139 | 前端 | P1 | 审计事件只读列表 + 游标翻页 |
| `frontend/src/pages/SandboxSecurityShowcasePage.tsx` | 270 | 前端 | P1 | **未跟踪**；三幕动画演示，数据为预置 fixture |
| `frontend/src/services/sandbox-security-service.ts` | 117 | 前端 | P0 | 唯一 API 调用层（2 个端点） |
| `frontend/src/utils/sandbox-security-limits.ts` | 149 | 前端 | P1 | 客户端预检，对齐引擎边界 |
| `frontend/src/content/sandbox-security-copy.ts` | 226 | 前端 | P1 | 15 个错误码 + 8 条违规规则的中文文案 |
| `frontend/src/content/sandbox-security-showcase.ts` | 253 | 前端 | P1 | **未跟踪**；演示用预置决策 fixture |
| `frontend/src/components/sandbox-security/*.tsx`（12 个） | ~1000 | 前端 | P1 | 决策摘要、findings 表、检测器执行表、能力会话面板、限额计量器等 |
| `frontend/src/components/sandbox-security/showcase/*`（6 个） | ~780 | 前端 | P2 | **未跟踪**；演示动画组件 |
| `frontend/src/pages/SandboxAlertsPage.tsx` | 861 | 前端 | P2 | Track1 监管台，**默认 mock 数据源**，不属本引擎 |

## 六、测试（P0 证据来源）

| 路径 | 数量 | 级别 | 说明 |
|---|---|---|---|
| `engines/sandbox/tests/sandbox-security-*.spec.ts` | 8 个核心 | P0 | authority/input/detector/detector-boundary/sanitized-boundary/policy/engine/track1-adapter |
| `engines/sandbox/tests/sandbox-security-production-*.spec.ts` | 17 个 | P0 | 生产检测器、脱敏器、传输、契约、装配、benchmark |
| `backend/tests/sandbox-security-*.spec.ts` | 15 个 | P0 | 路由/控制器/能力/限流/审计/幂等/SQLite/执行审计 |
| `frontend/src/**/*sandbox-security*.spec.*` | 13 个 | P1 | 页面、组件、服务、隐私哨兵、可访问性 |
| `tests/repository/sandbox-security-*.spec.ts` | 9 个 | P1 | 文档-实现一致性门禁 |
| `tests/integration/backend-sandbox-security*.api.spec.ts` | 2 个 | P1 | 后端 API 集成 |
| `shared/tests/sandbox-security-*.spec.ts` | 3 个 | P1 | 契约测试 |
| `engines/sandbox/tests/fixtures/`、`helpers/`、`types/` | 5 个 | P2 | 测试夹具与类型锚点 |

## 七、基准语料与脚本（P0 证据来源）

| 路径 | 级别 | 说明 |
|---|---|---|
| `samples/sandbox-security-benchmark/v1/inputs/`（300 个） | P0 | 300 条基准输入 |
| `samples/sandbox-security-benchmark/v1/truth/`（300 个） | P0 | 独立标签树，含 `fixture_sha256` 绑定 |
| `samples/sandbox-security-benchmark/v1/manifest.json` | P0 | 输入树/标签树分离哈希 |
| `samples/sandbox-security-benchmark/v1/sources.lock.json` | P0 | 246 条上游记录锁定（4 个公开研究数据集） |
| `samples/sandbox-security-benchmark/v1/ATTRIBUTION.md` | P0 | 323 行来源与许可证证据 + 复现配方 |
| `scripts/benchmark/sandbox-security/validate-corpus.ts` | P0 | 语料校验器（可运行，exit 0） |
| `scripts/benchmark/sandbox-security/evaluate.ts` | P0 | 评测器与验收阈值定义 |
| `scripts/benchmark/sandbox-security/replay-hermetic.ts` | P1 | 密闭重放门禁（需 Linux `unshare --net`） |
| `scripts/dev/*.sh`（5 个） | P1 | **均未跟踪**；WSL/Ollama 联调脚本 |
| `docs/track1/evidence/openclaw-baseline/manifest.json` | P1 | Track1 真实封存运行（9 案例，另一引擎） |

## 八、集成层（P1）

| 路径 | 级别 | 说明 |
|---|---|---|
| `integrations/openclaw/general-security/src/**` | P0 | 四道 await 屏障插件、动作映射、审计客户端、权威构造 |
| `integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch` | P0 | 84 KB / 1343 行 / 46 hunk / 13 文件 |
| `integrations/openclaw/general-security/tests/**` | P1 | 拦截断言测试（当前无法运行，见 04） |
| `deploy/Dockerfile.openclaw`、`scripts/apply-general-security-patch.mjs` | P1 | 打补丁镜像构建与校验 |

## 九、文档（P2，仅用于识别 spec > impl 风险）

| 路径 | 级别 | 说明 |
|---|---|---|
| `README.md`（22 KB） | P1 | 项目自述；**部分表述与实现不符，见 08** |
| `engines/sandbox/README.md` | P1 | 引擎自述；**开头段落为历史遗留，与实现不符** |
| `metadata.md` | P2 | 仅规范与护栏，无能力主张 |
| `docs/superpowers/specs/*sandbox*`（约 20 份） | P2 | 设计规范与修正案 |
| `docs/superpowers/plans/*sandbox*`（约 40 份） | P2 | 分阶段实施计划 |
| `.superpowers/sdd/2026-08-06-...-004-master/progress.md` | P1 | 当前进度台账（GENERAL-004 仍在 P4） |
| `docs/智能体安全/Paper/usenixsecurity25-pasquini.pdf` | P2 | LLMmap 论文，属资产测绘方向，**未实现** |
