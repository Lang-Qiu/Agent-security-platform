# 智能体资产测绘与指纹识别查找计划

## 文档信息
- 状态：Active
- 日期：2026-04-01
- 适用阶段：阶段 F 已完成，进入阶段 G 最小真实探针闭环
- 目标读者：需求方、后端负责人、规则维护人、测试负责人

## 1. 总目标与边界

### 1.1 总目标
在现有仓库骨架内，形成可落地的查找产物，供下一步 TDD 实现直接使用：
1. Probe Catalog（探针清单）
2. Fingerprint Sample Table（指纹样本表）
3. Result Collation Spec（识别结果归并规范）

### 1.2 本阶段边界
1. 做：暴露面调研、特征提取、规则建模、证据整理、输出格式定义。
2. 不做：真实扫描执行器、并发调度器、生产级网络探测、前端复杂交互实现。

### 1.3 执行原则
1. 规则必须可追溯证据来源。
2. 每条规则必须含误报说明与反特征条件。
3. 输出必须可映射现有 shared contract。
4. 产物必须能被下一步 RED 测试直接消费。

### 1.4 当前进度快照（截至 2026-04-01）
1. 阶段 A：完成。输入边界、目标清单、端口优先级、保守阈值已冻结。
2. 阶段 B：完成。`probes.v1.yaml` 已落地。
3. 阶段 C：完成最小基线。P0 正反样本已入库，规则与证据来源可追溯。
4. 阶段 D：完成最小基线。离线评分与结果映射已经在 backend 中跑通。
5. 阶段 E：完成第一段交付。已形成可执行的离线 matcher baseline，并通过单测与 API 集成测试。
6. 阶段 F：完成。证据补强与负样本六类场景回归已闭环，`openclaw-gateway` 正样本保持 `direct`。
7. 当前阶段：阶段 G 已启动，进入“真实探针执行器最小闭环”TDD。

## 2. 全流程逻辑（端到端）

1. 输入约束确认：目标清单、合规边界、成功判据。
2. 基线盘点：确认仓库现有契约和可挂载点。
3. 探针设计：定义端口、HTTP、API、鉴权行为探针。
4. 样本建设：把目标特征录入统一样本表并绑定证据。
5. 归并规范：定义多信号打分、冲突处理、unknown 降级。
6. 产物交付：输出规范文档、样本数据、下一阶段测试清单。
7. Sprint 固化：将单一 requirement 写入 sprint-current 并进入 TDD。

## 3. 阶段化计划（每阶段含输入、改动文件、步骤、产出）

### 阶段 A：输入与基线冻结

目标：冻结查找范围，避免后续规则扩散。

你需要提供：
1. 目标识别清单（Top N，建议 10，含优先级 P0/P1/P2）。
2. 允许扫描边界（域名/IP 段/端口范围）。
3. 禁扫边界（资产、网段、时段、请求强度限制）。
4. 误报容忍策略（偏保守或偏召回）。
5. 成功判据（覆盖率、最低置信度、可接受漏报率）。

需要修改的文件及位置：
1. docs/sprint-current.md
  - 位置：Requirement ID/Name/Goal/In Scope/Acceptance Criteria。
  - 操作：把本次查找任务固化为唯一 requirement。
2. docs/progress.md
  - 位置：当前阶段进展记录区。
  - 操作：记录“阶段 A 完成，输入已冻结”。
3. docs/plans/agent-asset-fingerprinting-discovery-plan.md
  - 位置：文档信息区与阶段 A 输入表。
  - 操作：填写输入快照版本号与更新时间。

详细步骤：
1. 收集输入并归一化为一份目标表。
2. 校验输入冲突（例如目标在禁扫边界内）。
3. 形成冻结清单并签入文档。

明确产出：
1. Scope Freeze 清单（目标、边界、限制、判据）。
2. Sprint 单一 requirement 条目。

验收标准：
1. 所有后续阶段均可基于同一输入版本执行。
2. 无边界冲突项。

### 阶段 B：探针清单建模

目标：形成可执行的 Probe Catalog v1。

你需要提供：
1. 已知有效端口和常见路由线索（若有历史经验）。
2. 目标环境访问限制（是否允许 HEAD，是否限制 UA，是否限制频率）。
3. 最长探测时延预算（单目标可接受总时长）。

需要修改的文件及位置：
1. engines/asset-scan/rules/probes.v1.yaml（新增）
  - 位置：文件整体。
  - 操作：定义探针条目（端口、HTTP、API、鉴权）。
2. docs/api-contract.md
  - 位置：资产扫描输入/输出说明区。
  - 操作：补充探针类别与结果字段映射说明。
3. docs/architecture.md
  - 位置：引擎职责与数据流章节。
  - 操作：补充 Probe -> Rule Match -> Result 流程。

详细步骤：
1. 定义探针分层：
  - L1 低成本：TCP connect、HEAD /
  - L2 中成本：GET /、常见健康检查路径
  - L3 高成本：候选 API 路由、鉴权行为判断
2. 为每条探针定义参数：超时、重试、并发建议、失败回退。
3. 标注每条探针误报风险与适用范围。

明确产出：
1. probes.v1.yaml
2. Probe Catalog 文档节（可读版）

验收标准：
1. 每条探针都具备请求模板和异常策略。
2. P0 目标至少可由 L1+L2 覆盖到基础信号。

### 阶段 C：指纹样本表建设

目标：形成 Fingerprint Sample Table v1，支持规则匹配。

你需要提供：
1. 脱敏响应样本（建议每个 P0 目标至少 3 份）。
2. 已知版本信息（若无法提供，至少提供部署时间窗口）。
3. 历史误判样本（可匿名）。

需要修改的文件及位置：
1. engines/asset-scan/rules/fingerprints.v1.yaml（新增）
  - 位置：文件整体。
  - 操作：按统一字段录入指纹规则。
2. samples/assets/fingerprint-positive/（新增目录）
  - 位置：目录下每个目标一个样本文件。
  - 操作：存放正样本。
3. samples/assets/fingerprint-negative/（新增目录）
  - 位置：目录下每个目标一个反样本文件。
  - 操作：存放反样本。
4. docs/plans/agent-asset-fingerprinting-discovery-plan.md
  - 位置：阶段 C 规则字段区。
  - 操作：维护字段字典与约束说明。

详细步骤：
1. 统一字段：
  - product_name
  - product_version
  - signal_type
  - match_operator
  - match_value
  - weight
  - confidence_hint
  - false_positive_notes
  - evidence_source
2. 每个目标最小规则集：1 强特征 + 2 弱特征 + 1 反特征。
3. 为每条规则绑定至少一条证据来源。

明确产出：
1. fingerprints.v1.yaml
2. 正反样本索引表
3. 规则证据登记表

验收标准：
1. 每个 P0 目标满足最小规则集。
2. 每条规则具备证据链接和误报备注。

### 阶段 D：识别结果归并规范

目标：定义多信号合并逻辑并映射到现有 contract。

你需要提供：
1. 业务偏好：误报优先控制还是召回优先。
2. 置信度阈值（例如：0.70/0.85）。
3. 冲突优先级偏好（端口优先或 HTTP 内容优先）。

需要修改的文件及位置：
1. docs/api-contract.md
  - 位置：AssetScanResultDetails 对应章节。
  - 操作：补充 fingerprint、open_ports、http_endpoints、auth_detected 映射规则。
2. shared/types/result.ts（如需最小补充）
  - 位置：AssetScanResultDetails 类型定义。
  - 操作：仅在必要时补充可选字段，不破坏兼容性。
3. docs/architecture.md
  - 位置：规则命中与结果归并章节。
  - 操作：补充评分与冲突处理流程。

详细步骤：
1. 定义评分公式：
  - 总分 = 命中信号权重和 - 冲突惩罚分
  - 达阈值则输出候选
2. 定义冲突策略：
  - 强特征冲突时优先保留证据更完整者
  - 不足阈值输出 unknown
3. 定义输出结构：主结果 + 候选列表 + 证据摘要 + 未命中原因。

明确产出：
1. Result Collation Spec v1 文档
2. 置信度分级表（high/medium/low）

验收标准：
1. 归并规则可解释且可复现。
2. 输出可直接映射 shared 结果契约。

### 阶段 E：交付打包与 TDD 前置

目标：将查找产物转为下一 requirement 的测试输入。

你需要提供：
1. 最终确认的 P0/P1 目标列表。
2. 哪些目标优先进入首轮实现。
3. 测试环境约束（可否访问外网、是否仅离线样本）。

需要修改的文件及位置：
1. docs/progress.md
  - 位置：本次 requirement 进度条目。
  - 操作：记录阶段 B/C/D/E 完成状态与遗留项。
2. docs/sprint-current.md
  - 位置：下一阶段 requirement 定义区。
  - 操作：写入“规则命中 -> 结果输出”的单一实现 requirement。
3. backend/tests/task-engine.service.spec.ts（下一阶段将新增/补充）
  - 位置：资产识别行为测试分组。
  - 操作：先写失败测试（RED）。
4. tests/integration/backend-task-center.api.spec.ts（下一阶段将新增/补充）
  - 位置：资产扫描 API 返回校验。
  - 操作：先写失败测试（RED）。

详细步骤：
1. 打包交付：探针、规则、样本、归并规范。
2. 评审确认：覆盖率、误报风险、输入完整性。
3. 生成测试清单：单测 + 集成测试场景矩阵。

明确产出：
1. 查找交付包 v1
2. 下一阶段 TDD 用例列表（RED 清单）

验收标准：
1. 交付包可独立阅读并直接驱动测试编写。
2. 下一阶段 requirement 可在 1 次评审内启动。

### 阶段 F：证据补强与样本回归矩阵

目标：把当前离线 matcher 从“能跑通”提升到“结论更稳、更可回归”。

你需要提供：
1. `openclaw-gateway` 的端口证据或其可信来源。
2. 每个 P0 至少 1 个新增负样本，最好覆盖“路径像但字段不对”的场景。
3. 每个新增样本的来源说明和采集时间。
4. 是否优先把 `mcp-server` 纳入 P1 首批样本建设。

需要修改的文件及位置：
1. `samples/assets/fingerprint-positive/*`
  - 位置：对应目标样本文件。
  - 操作：补强正样本字段和证据备注。
2. `samples/assets/fingerprint-negative/*`
  - 位置：对应目标反样本文件。
  - 操作：增加回归负样本。
3. `engines/asset-scan/rules/fingerprints.v1.yaml`
  - 位置：对应目标规则条目。
  - 操作：仅在证据充分时微调规则或补充 evidence_source。
4. `backend/tests/asset-fingerprint.service.spec.ts`
  - 位置：离线 matcher 回归测试分组。
  - 操作：新增正负样本断言，先 RED 再 GREEN。
5. `docs/progress.md`
  - 位置：阶段进度记录区。
  - 操作：记录证据补强结果与遗留项。

详细步骤：
1. 先补证据，不急着调规则。
2. 用新样本把 matcher 回归矩阵补齐。
3. 只在样本已经充分时再讨论权重调整。

阶段 F 建议优先覆盖的六类负样本场景：
1. 字段缺失
2. 路径近似
3. 404/端点不存在
4. 代理头污染/中间件注入
5. 跨产品字段复用（交叉污染）
6. 字段格式伪装（键名变体/语义偏差）

明确产出：
1. P0 扩展样本集。
2. 更稳的 matcher 回归测试。
3. `openclaw-gateway` 证据补强结论。

验收标准：
1. `openclaw-gateway` 至少达到 `suspected`，目标是 `direct`。
2. 每个 P0 都有新增负样本参与回归。
3. 样本新增后，离线 matcher 仍保持全绿。

### 阶段 G：真实探针执行器最小闭环

目标：从“样本驱动”走向“真实信号驱动”，但只做最小闭环，不扩成生产扫描器。

你需要提供：
1. 允许范围：仅在 `localhost`、测试容器或 mock server 上进行真实探针执行（已确认）。
2. WebSocket 探针：本轮不纳入（已确认）。
3. 本轮目标建议：优先 `ollama`、`langflow`，在最小闭环稳定后再扩展到 `autogpt`、`openclaw-gateway`。

需要修改的文件及位置：
1. `backend/src/modules/task-center/asset-fingerprint/*`
  - 位置：信号收集与 matcher 接口。
  - 操作：把真实探针结果转成 matcher 可消费的信号结构。
2. `backend/tests/*.spec.ts`
  - 位置：probe runner、adapter、API 集成测试。
  - 操作：先补失败测试，再写最小实现。
3. `engines/asset-scan/rules/probes.v1.yaml`
  - 位置：实际被执行的探针条目。
  - 操作：校准最小执行集。
4. `docs/api-contract.md`
  - 位置：asset-scan 输入输出说明。
  - 操作：补充真实探针模式下的输入与结果说明。

详细步骤：
1. 先做 TCP connect 与 HTTP HEAD/GET。
2. 先只覆盖 `ollama`、`langflow`、`autogpt` 的本地/授权验证。
3. WebSocket 放在可控范围内再纳入。

明确产出：
1. 最小 probe runner。
2. 样本模式与真实探针模式并存的 matcher 输入通道。
3. 本地/测试环境真实信号验证用例。

验收标准：
1. 不依赖 `sample_ref` 也能跑通至少 2 个 P0 目标。
2. 新实现不破坏现有离线 matcher 测试基线。
3. 仍然不引入生产级扫描调度与公网扩散。

## 4. 文件改动总表（本计划建议）

1. docs/sprint-current.md：固定当前/下一阶段唯一 requirement。
2. docs/progress.md：记录阶段完成状态、阻塞项、决策。
3. docs/architecture.md：补充资产探针与归并流程图。
4. docs/api-contract.md：补充规则命中到结果字段映射。
5. engines/asset-scan/rules/probes.v1.yaml：探针定义。
6. engines/asset-scan/rules/fingerprints.v1.yaml：指纹规则定义。
7. samples/assets/fingerprint-positive/*：正样本集。
8. samples/assets/fingerprint-negative/*：反样本集。
9. backend/tests/task-engine.service.spec.ts：下一阶段 RED 单测入口。
10. tests/integration/backend-task-center.api.spec.ts：下一阶段 RED 集成测试入口。

## 5. 输入模板（建议你按此提供）

### 5.1 目标清单模板
1. target_id
2. product_name
3. priority（P0/P1/P2）
4. known_ports
5. known_routes
6. known_headers
7. constraints

### 5.2 样本模板
1. sample_id
2. target_id
3. request_summary
4. response_status
5. response_headers
6. response_body_excerpt
7. is_positive_sample
8. source
9. collected_at

## 6. 质量门槛（DoD）

1. 结构完整：探针、规则、样本、归并四类产物齐全。
2. 可追溯：每条规则均有证据来源。
3. 可测试：每个 P0 目标至少 1 正样本 + 1 反样本。
4. 可落地：文档可直接转换为 RED 测试清单。
5. 可演进：规则含版本边界和 unknown 回退策略。

## 7. 里程碑与时间建议

1. M1（0.5 天）：阶段 A 完成，范围冻结。
2. M2（1 天）：阶段 B 完成，探针清单定稿。
3. M3（1 天）：阶段 C 完成，样本与规则初版。
4. M4（0.5 天）：阶段 D 完成，归并规范定稿。
5. M5（0.5 天）：阶段 E 完成，进入 TDD 前置评审。

## 8. 风险与应对

1. 风险：目标特征高度重叠导致误报。
2. 应对：提升反特征权重，引入鉴权行为特征。
3. 风险：版本迭代使规则失效。
4. 应对：维护版本边界与定期样本回归。
5. 风险：样本质量不足。
6. 应对：强制最小样本标准并记录采集可信度。

## 9. 执行顺序建议

1. 先补齐阶段 A 输入，不要直接跳到规则编写。
2. 阶段 B 与阶段 C 可并行，但阶段 D 必须在 B/C 后进行。
3. 阶段 E 已完成第一段交付，当前建议先做阶段 F，再进入阶段 G。

## 10. 当前建议的下一步顺序

1. 先做 `REQ-ASSET-EVIDENCE-003`：证据补强与样本回归矩阵。
2. 再做 `REQ-ASSET-PROBE-004`：真实探针执行器最小闭环。
3. 最后再扩 P1 和候选归并增强。

这样做的原因：
1. 当前最大的真实问题不是“完全没有执行器”，而是“已有规则里还有证据不足的点”。
2. 先把样本和证据抬稳，能减少后面真实探针实现时的误判和返工。
3. 这也更符合 TDD：先让断言更可靠，再扩大执行范围。
