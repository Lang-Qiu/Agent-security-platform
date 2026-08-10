# 02 · 阅读证明台账（GATE 2 产出）

阅读方式：主审 + 5 个并行子审计（引擎核心 / 生产检测器 / 后端 / 前端 / 文档对账）。
"完整"= 逐行读完；"结构化"= 读完全部声明、常量、导出与被引用区段，但未逐行读完（大文件）；未读区段一律在备注中标明。

---

## A. 引擎核心 `engines/sandbox/src/security/`（21 个文件，8,479 行，全部读完）

| 文件 | 读完 | 核心作用 | 与 Sandbox Engine 的关系 | 备注 |
|---|---|---|---|---|
| `engine.ts` | ✅ 完整 | `evaluate()` 单一编排：入口取消检查 → 权威归一 → 输入边界 → profile → ledger → 规则/本地/Judge 顺序执行 → 发布 → 归约 → 语义校验 | **引擎本体** | 检测器严格顺序执行，从不并行（L662-670）；11 个预算相位每相位复检剩余预算 |
| `policy-reducer.ts` | ✅ 完整 | 纯归约：最高已采纳严重度 → 动作矩阵；未决信号抬升动作并抬高风险底；引擎故障强制 `indeterminate` | **最终决策产生点** | 兜底守卫：`risk_detected + allow → alert`（L321-323） |
| `policy-profiles.ts` | ✅ 完整 | 两个冻结 profile、8 条信任分级规则、动作矩阵、3 槽位定义 | 决定引擎行为的策略常量 | import 期 `validateManifest` + `assertStrictNotLessRestrictive`；profile 为硬编码常量，非从 `policies/` 加载 |
| `escalation-state.ts` | ✅ 完整 | 4 态生命周期；信号按严重度/置信度合并；一次性铸造 obligation 与应用 Judge 结果 | 规则/本地 → Judge 的升级中枢 | L338-345 将 `decision_id` 中的 `:` 改写为 `-` 以满足 obligation 正则（工作绕过） |
| `finding-qualification.ts` | ✅ 完整 | 阈值分流、`finding_id` 哈希、公开 token 铸造、确定性排序 | 决定"哪条发现算成立" | 规则槽位置信度被限制为 `{0.6, 0.8, 1.0}`；重复候选直接抛出 |
| `detector-output-boundary.ts` | ✅ 完整 | 本地检测器输出精确键校验、枚举/区间、`reason_code` 必须等于 `sandbox_security_<category>`、句柄+nonce 绑定、64 KiB 上限 | **不信任检测器输出的边界** | "内容泄漏检测"实为 3 个硬编码字面量扫描（L255-262），能力弱于错误码暗示 |
| `sanitized-boundary.ts` | ✅ 完整 | 派生 `etok:` 令牌注册表、校验脱敏载荷（精确键/禁止原始元数据键/256 KiB/深度 8）、Judge 输出反向映射 | **外部 Judge 的双向隔离层** | 私有上下文用 WeakMap 持有 |
| `source-authority.ts` | ✅ 完整 | 提交 vs 权威上下文逐字段比对，JSON 用 JCS 等价性；输出 symbol 品牌化冻结 | 防"自证来源"的信任根 | `provenance_ref` 仅校验非空，无格式校验（L320-322） |
| `semantic-validator.ts` | ✅ 完整 | 重算 qualification/escalation/publication/reducer 并与决策比对；拒绝伪造信号与 etok 泄漏 | **决策自校验（可审计性核心）** | L255-265 `assertUnresolvedSignals` 近乎空实现；Judge 路径的未决校验弱于非 Judge 路径 |
| `input-boundary.ts` | ✅ 完整 | nonce + `hsrc:`/`hcall:` 句柄铸造、规范投影、sha256、NFKC 比较值、512 KiB 上限 | 内容进入引擎的唯一入口 | 最多 64 个来源（由正则约束） |
| `run-ledger.ts` | ✅ 完整 | 逐槽位 FSM（not_started→running→终态）、一次性挂载 findings | 产出 `detector_runs[]` 可审计轨迹 | 拒绝向非 matched 槽位挂载 findings |
| `runtime-deadline.ts` | ✅ 完整 | 入口锚定预算、`min(slot_timeout, remaining)` 租约、中止原因优先级 | 时间预算与取消传播 | 平局解析为 `work_budget`（L137-155） |
| `detector-registry.ts` | ✅ 完整 | 校验并冻结检测器注册表，按 profile 槽位解析 | 检测器装配点 | 仅允许 3 个槽位 |
| `detector-contract.ts` | ✅ 完整 | 检测器/脱敏器/载荷类型 + `AdapterUnsupportedError` + 尺寸常量 | 类型契约 | — |
| `canonical-json.ts` | ✅ 完整 | JCS 序列化，拒绝异常原型/`__proto__`/孤立代理项/环/非有限数 | 确定性与可复算基础 | — |
| `canonical-fingerprint.ts` | ✅ 完整 | 权威校验后的规范投影 → 外部 HMAC 端口 | 请求指纹（幂等与审计绑定） | HMAC 实现委托调用方端口，本文件不持密钥 |
| `locator.ts` | ✅ 完整 | 内容/工具定位符校验，UTF-8 边界 + pointer 存在性 | 证据定位（只给位置不给内容） | — |
| `subject-scope.ts` | ✅ 完整 | 作用域去重 + UTF-16 排序 → `subject_key` | 跨检测器同主体归并键 | — |
| `index.ts` | ✅ 完整 | 公共出口 | 对外 API 面 | 刻意不导出内部边界 |
| `adapters/track1-rule-matches.ts` | ✅ 完整 | Track1 规则目录 → `RawLocalDetector` | 唯一"自带"本地检测器实现 | 仅处理 4 种工具形态；拒绝 `user_input` 阶段；置信度硬编码 0.8 |
| `adapters/monitor-decision-provider.ts` | ✅ 完整 | 决策 → 无内容监控提案 | Track1 集成点 | 任何抛出 → `deny`(tool_request)/`ask`，fail-closed |

## B. 生产检测器层 `engines/sandbox/src/security-production/`（17 个文件，9,983 行）

| 文件 | 读完 | 核心作用 | 关系 | 备注 |
|---|---|---|---|---|
| `index.ts` | ✅ 完整 | 公共出口 `createSandboxSecurityProductionEngine` | 生产装配入口 | — |
| `production-config.ts` | ✅ 完整 | 环境变量归一化 + 正则校验 + WeakMap 存密钥 + 一次性交接 | 唯一凭证入口 | 密钥于首次构造 transport 后从 WeakMap 删除（L241） |
| `composition.ts` | 🔶 结构化 | 三模式装配、资格计时器、AbortController | 决定"哪些检测器在线" | 完整读 L1-90、L295-400；`rule_only` 完全不读 provider 配置 |
| `rule-catalog.ts` | 🔶 结构化 | 9 条冻结规则 + 严格校验器 | 确定性检测的规则源 | 完整读 L560-726 描述符块；触发字面量很窄（见 04） |
| `rule-detector.ts` | 🔶 结构化 | 快照→投影，9 类条件算子，跨来源有序序列 | **唯一无外部依赖的检测器** | 读完全部 33 个声明；未逐行读每个算子体 |
| `deterministic-sanitizer.ts` | 🔶 结构化 | NFKC 归一 + 10 类脱敏 + 键名脱敏 + 资源护栏 + **原子回泄验证** | Judge 永不见原文的执行者 | 完整读 L1-200、L674-740、L1102-1140；回泄检查含去占位符/NFKC/百分号解码/base64 解码四路复检 |
| `ollama-contract.ts` | 🔶 结构化 | 本地模型提示、JSON Schema 响应格式、解析器 | 本地模型线协议 | 完整读 L1-60；提示含 `BEGIN/END_UNTRUSTED_SNAPSHOT` 不可信数据框 |
| `ollama-local-detector.ts` | 🔶 结构化 | 资格握手（digest→prewarm→时延闸门）+ 检测 | 本地模型检测器 | 每次 chat 复验 digest（L611-621） |
| `openai-judge-detector.ts` | 🔶 结构化 | 绑定 obligation、按协议分派、解析、映射 | 外部 Judge 检测器 | 完整读 L382-518；类别与 `subject_refs` 取自本地绑定而非模型输出（L404-411） |
| `openai-judge-contract.ts` | 🔶 结构化 | Responses API 契约，v2/v3 提示，strict json_schema | Judge 协议实现 | **最大文件（1265 行），仅读结构锚点**；其 spec 26/26 通过 |
| `openai-chat-judge-contract.ts` | ⬜ 仅结构 | Chat Completions 变体 | Judge 协议实现 | 未读实体；其 spec 15/15 通过 |
| `judge-protocol-adapter.ts` | 🔶 结构化 | 两项协议白名单 + HTTPS/FQDN 端点策略 | 协议选择闸门 | spec 68/68 通过 |
| `http-transport.ts` | 🔶 结构化 | `node:http`/`node:https` 真实 HTTP；digest `timingSafeEqual` | 唯一出网点 | 全仓 `security-production/` 无 `fetch`；测试注入 `request_factory` 不开真实 socket |
| `external-pipeline.ts` | ⬜ 未读 | 脱敏器 + Judge 配对进外部槽位 | 外部槽位装配 | 行为由其 spec 推断（8/8 通过，4 取消） |
| `provider-outcomes.ts` | 🔶 结构化 | 重放结果归一化 | 密闭重放支撑 | 仅读导出 |
| `benchmark-composition.ts` | 🔶 结构化 | 实况采集 + 密闭重放、sealed-config 精确字段校验 | 基准工具链 | 完整读 L190-215、L1045-1070 与失败路径 |
| `p6-live-capture-profile.ts` | ✅ 完整 | P6 时序常量 | 实况采集时序 | 40000/60000/300000/360000 ms |

## C. 后端模块 `backend/src/modules/sandbox-security/`（34 个文件，10,057 行）

| 文件 | 读完 | 核心作用 | 关系 | 备注 |
|---|---|---|---|---|
| `sandbox-security.controller.ts` | ✅ 完整 | 公开控制器；有序准入（全局限流→鉴权→scope→存储健康→按能力限流→幂等头→正文→schema→授权） | HTTP 入口 | 全局限流**先于**鉴权，未认证洪泛也被节流 |
| `evaluation.service.ts` | ✅ 完整 | 评估编排 28 跳；失败路径写 `evaluation_interrupted` | **后端 → 引擎的编排者** | 拒绝任何 `evaluation_mode !== "simulation"` 的决策 |
| `capability-authorizer.ts` | ✅ 完整 | 令牌摘要查表、scope/stage/profile 授权、管理令牌 `timingSafeEqual` | 授权中枢 | 令牌为不透明随机值 + SHA-256 摘要索引比对，**非 HMAC 签名**、非常量时间 |
| `capability.service.ts` | ✅ 完整 | 能力签发（两类）与吊销 | 令牌生命周期 | 明文令牌仅返回一次 |
| `http-admission.ts` | ✅ 完整 | 头部单值、`Content-Length`/`Transfer-Encoding` 冲突、严格媒体类型、UTF-8 fatal 解码、**重复 JSON 键拒绝**、128 层嵌套上限、5s 期限 | 准入硬化 | 声明长度与实际字节数须相等 |
| `hmac.ts` | ✅ 完整 | 域分隔长度前缀二进制帧、6 个域、游标 MAC、不透明令牌铸造 | 派生值完整性 | **无 nonce、无时间窗、无签名请求方案** |
| `audit.service.ts` | ✅ 完整 | 审计分页 + 90 天保留清理 | 审计读路径 | 读操作本身在同一事务内写 `audit_read` 事件 |
| `audit-projector.ts` | ✅ 完整 | 类型化事件纯投影 | 审计写路径 | — |
| `simulation-authority.ts` | ✅ 完整 | 构造仿真权威上下文，深拷贝 | **仿真/实况闸门** | 全部来源硬编码 `authority_kind:"simulation_observation"` |
| `adapters/production-evaluation.gateway.ts` | ✅ 完整 | 桥接生产引擎 + 指纹 | **后端↔引擎唯一接缝** | 运行时被窄化为 4 个能力（now/nextDecisionId/monotonicNowMs/scheduleTimeout） |
| `adapters/sqlite/sqlite-migrations.ts` | ✅ 完整 | v1 schema、v1→v2 迁移、定义逐字节比对断言、部署密钥绑定 | schema 钉死 | 不同 HMAC 密钥下拒绝打开 DB |
| `adapters/sqlite/sqlite-audit.repository.ts` | ✅ 完整 | 追加/列表+记录读取/清理 | 审计持久化 | 读时行↔JSON 7 列交叉校验；无 UPDATE 方法 |
| `adapters/sqlite/sqlite-enforcement-audit.repository.ts` | ✅ 完整 | 执行事件追加 + 重放/冲突检测 | 执行审计持久化 | 与公开审计共表，靠 `event_schema` 隔离 |
| `adapters/sqlite/sqlite-idempotency.repository.ts` | 🔶 结构化 | 幂等占用/完成/中断 | 幂等 | 读入口 + 关键查询 |
| `adapters/sqlite/sqlite-capability.repository.ts` | 🔶 结构化 | 能力持久化 | 令牌存储 | 读入口 + 关键查询 |
| `adapters/sqlite/sqlite-database.ts` | 🔶 部分 | DB 打开、POSIX 权限加固、WAL、quick_check | 存储加固 | 读 L1-140；`mode & 0o077 !== 0` 在 Windows 上不可满足（见 04） |
| `sandbox-security-admin.controller.ts` | ✅ 完整 | 内部管理面 3 路由 | 运维面 | 管理令牌为单一共享静态密钥 |
| `sandbox-security-enforcement-audit.controller.ts` | ✅ 完整 | 执行事件摄入 | OpenClaw 回传口 | 用能力令牌而非管理令牌；scope 必须精确等于单元素数组 |
| `enforcement-audit.service.ts` | ✅ 完整 | 候选+身份 → 追加 → ack | 执行审计服务 | `occurred_at` 由服务端赋值 |
| `token-bucket.ts` | ✅ 完整 | 令牌桶 + 按能力注册表 + 清扫 | 限流 | 进程内内存态 |
| `engine-concurrency.ts` | ✅ 完整 | 进程内信号量 | 并发闸门 | 容量硬钉 4，无跨实例协调 |
| `sandbox-security.module.ts` | ✅ 完整 | 组合根 | 依赖注入 | 仅注入工厂 |
| `sandbox-security.config.ts` | ✅ 完整 | 环境配置校验 | 启动闸门 | 4 项必需配置，绑定前 fail-closed |
| `sandbox-security.errors.ts` | ✅ 完整 | 服务错误 + 描述符校验 | 错误映射 | — |
| `sandbox-security.types.ts` | 🔶 类型 | 边界类型声明 | 类型面 | 仅类型 |
| `ports/*.ts`（8 个） | ✅ 完整 | 端口接口 | 依赖倒置 | — |
| `dto/capability.ts`、`dto/enforcement-audit-capability.ts` | ✅ 完整 | 签发请求归一化 | 入参校验 | — |

## D. 前端（读完 27 个 / 32 个）

| 文件 | 读完 | 核心作用 | 关系 | 备注 |
|---|---|---|---|---|
| `pages/SandboxSecurityWorkbenchPage.tsx` | ✅ 完整 | 评估工作台，双栏，1100px 以下重排但 DOM/Tab 顺序不变 | **唯一真实往返界面** | 无 fixture 通路，无后端即无结果 |
| `pages/SandboxSecurityAuditPage.tsx` | ✅ 完整 | 审计列表 + 游标翻页 | 审计界面 | `limit=50` 固定，仅向前翻页 |
| `pages/SandboxSecurityShowcasePage.tsx` | ✅ 完整 | 三幕动画演示 | **演示页（预置数据）** | 未跟踪；页面上有"演示数据"标签且有测试强制该标签 |
| `services/sandbox-security-service.ts` | ✅ 完整 | 2 个端点调用 + 客户端预检 | 前后端接缝 | 预检失败直接 fail-closed，不发请求 |
| `utils/sandbox-security-limits.ts` | ✅ 完整 | 客户端边界对齐 | 预检 | — |
| `content/sandbox-security-copy.ts` | ✅ 完整 | 15 错误码 + 8 违规规则中文文案 | 可用性 | — |
| `content/sandbox-security-showcase.ts` | ✅ 完整 | 演示决策 fixture | 演示数据源 | 未跟踪；`elapsed_ms` 与 2884ms 总计均为手写 |
| `components/sandbox-security/*.tsx`（12 个） | ✅ 完整 | 决策摘要/findings/检测器执行/审计表/能力面板/限额计量器等 | 决策可视化 | FindingsTable 只渲染位置引用，不渲染内容 |
| `components/sandbox-security/showcase/*`（6 个） | ✅ 完整 | 演示动画 | 演示 | 全部未跟踪 |
| `app/routes.tsx`、`app/navigation.tsx` | ✅ 完整 | 3 条路由 + 导航 | 挂载点 | — |
| `pages/SandboxAlertsPage.tsx` | 🔶 部分 | Track1 监管台 | **不属本引擎** | 读 L1-180 + 定向 grep；默认 mock 数据源，海报不得使用其截图作为本引擎证据 |

## E. 文档与基准（对账用，P1/P2）

| 文件 | 读完 | 用途 | 备注 |
|---|---|---|---|
| `README.md` | ✅ 完整 | 项目自述对账 | 发现 1 处矛盾、5 处需改写（见 08） |
| `engines/sandbox/README.md` | ✅ 完整 | 引擎自述对账 | 开头"进程生成、权限提升"等表述**无实现支撑** |
| `metadata.md` | ✅ 完整 | 规范对账 | 无能力主张，非风险源 |
| `.superpowers/sdd/...-004-master/progress.md` | 🔶 定向 | 进度真实状态 | GENERAL-004 仍在 P4，9 个任务未完成 |
| `docs/superpowers/specs/*sandbox*`（约 20 份） | 🔶 定向读状态行 | 状态与"非目标"段 | 无任何一份记为 `VERIFIED`/`COMPLETE` |
| `docs/superpowers/plans/*sandbox*`（约 40 份） | 🔶 定向读状态行 | 同上 | GENERAL-005 计划写"执行授权：未授予"，但代码已合并 |
| `samples/sandbox-security-benchmark/v1/**` | ✅ 关键文件完整 | 语料证据 | manifest / sources.lock / ATTRIBUTION 全读 |
| `.runtime/**`（20 个文件） | ✅ 完整清点 | 运行证据核查 | **无任何引擎运行证据**；`.runtime/sandbox-security/` 为空目录 |
| `docs/智能体安全/智能体参考文献.md` | 🔶 定向 | 学术依据核查 | LLMmap 论文属资产测绘方向，全仓无实现引用 |

## F. 未读或仅结构化阅读的清单（诚实声明）

1. `openai-judge-contract.ts`（1265 行）、`openai-chat-judge-contract.ts`（473 行）：仅结构与关键常量，未逐行审信封校验器。
2. `external-pipeline.ts`（136 行）：未读实体，行为由其 spec 推断。
3. `sqlite-capability.repository.ts`、`sqlite-idempotency.repository.ts`：入口与关键 SQL 已读，未逐行。
4. `sqlite-database.ts` L140-248 未读。
5. `SandboxAlertsPage.tsx` L180-861 未读（不属本引擎范围）。
6. `docs/superpowers/` 下约 60 份文档未逐行读完，仅定向提取状态行、"Out of Scope"与"非目标"段落。
7. `engines/sandbox/src/{base-filter,monitoring,replay,simulated-tools}/`：属 Track1 早期沙箱链路，本次仅确认其存在与测试通过状态，未纳入 Sandbox Security Engine 核心阅读范围（见 03 边界说明）。
