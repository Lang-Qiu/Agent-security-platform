# 资产扫描端口扫描 V1 设计

## 1. 范围

本设计定义了当前 P0 目标的资产扫描执行方式，采用分层策略：

1. L1：端口存活探测（naabu / tcp connect）
2. L2：服务指纹证据采集（nmap）
3. L3：协议探针（HTTP / WebSocket）

本方案聚焦当前阶段可稳定落地的实现边界，允许在授权前提下进行公网扫描，但不引入分布式扫描能力。

## 2. 目标端口与优先级

事实来源：`engines/asset-scan/rules/probes.v2.yaml`

- critical：18789, 18791, 18793
- high：11434, 3000, 8080, 9090
- medium：8000, 5000, 3001
- low：80, 443, 8081

当前 tcp connect 执行端口列表：
- 18789, 18791, 18793, 11434, 3000, 8080, 9090, 8000, 5000, 3001, 80, 443

待决事项：
- 是否将 `8081` 加入 `tcp_connect_priority_ports.request.ports`。

## 3. 分层扫描方法

### 3.1 L1 端口存活（naabu）

目标：
- 仅快速判定端口是否开放。

规则：
- 仅扫描规则定义端口（可附加可选 `probe_port_hint`）。
- 本阶段不推断服务类型。
- 使用较低超时和较少重试。
- 对公网目标强制执行任务预算与目标级限速。

建议默认值：
- timeout：800ms 到 1200ms
- retry：1
- 目标并发：遵守 `max_tcp_concurrency_per_target`

输出：
- `open_ports`
- `naabu_output`（原始输出）
- 执行元数据（如可用：耗时/退出码）

### 3.2 L2 服务证据（nmap）

目标：
- 对通过 L1 的端口采集服务级证据。

执行边界：
- 仅对 L1 判定为开放的 ip:port 运行 nmap。

建议命令模板：
- `-Pn -sV --script http-title,ssl-cert,http-enum -p <port> <ip>`

输出：
- 解析后证据：
  - `http_title`
  - `tls_subject`
  - `api_routes`
- `nmap_output`（原始输出）

### 3.3 L3 协议探针（HTTP/WS）

目标：
- 确认产品特征接口与信号。

当前 P0 探针：
- `ollama`：在 11434 上请求 GET `/api/tags`
- `langflow`：在 3000/8080/9090 上请求 GET `/api/v1/flows`
- `autogpt`：在 8000 上请求 GET `/api/agent/status`
- `openclaw-gateway`：在 18789/18791/18793 上进行 ws 连接与消息校验

特征提取：
- `http_status`、`http_header`、`api_path`、`json_key`、`ws_message`、`open_port`

## 4. 与指纹规则映射

事实来源：`engines/asset-scan/rules/fingerprints.v2.yaml`

- 使用加权信号与置信度阈值。
- 保持保守输出模式。
- 避免由单一弱信号直接产出结论。

产出工件：
- `fingerprint`
- `matched_features`
- `findings`
- `risk_level`

## 5. 持久化与结果回填

## 5.1 最小持久化数据

每个任务：
- 任务壳（`task`）
- 结果壳（`result`）
- 风险汇总（`risk-summary`）

扫描证据：
- 结构化字段：
  - `open_ports`
  - `http_endpoints`
  - `findings`
- 原始字段：
  - `naabu_output`
  - `nmap_output`

## 5.2 任务状态策略

建议状态流转：
- `pending` -> `running` -> `finished`
- `pending` -> `running` -> `partial_success`
- `pending` -> `running` -> `failed`

当前实现说明：
- 某些路径可能在初始扫描明细物化后直接回填为 `finished`。在保证结果一致性的前提下，这在当前阶段可接受。

## 6. 运行治理边界

- 遵守 `probes.v2.yaml` 中的探针策略限制。
- 仅允许在授权目标范围内进行公网扫描。
- 为每个任务增加强制预算控制：
  - `max_targets`
  - `max_ports_per_target`
  - `max_runtime_seconds`
- 增加强制限流控制：
  - 目标级 HTTP RPS 上限
  - 目标级 TCP 并发上限
- 为每次执行保留可审计元数据：
  - query/source
  - operator/requested_by
  - start/end timestamps
  - interruption reason（budget/timeout/manual stop）
- 本 requirement 不扩展到分布式大规模扫描。

## 7. 测试计划（RED -> GREEN）

1. 仓库层测试
- FOFA 任务创建与映射
- FOFA 批量报告聚合

2. 后端层测试
- `asset_scan` 的 task-center 回填行为
- 状态与风险汇总一致性

3. 集成测试
- POST `/api/tasks` -> GET `/api/tasks/:id/result` 契约一致性
- P0 目标探针路径返回预期结构化明细

## 8. 交付物

- 更新后的 requirement 文档：`docs/sprint-current.md`
- 本设计文档
- 后续以小步、requirement 范围内变更推进实现与测试

## 9. 脚本启动与可抓取目标

### 9.1 启动后端（先决条件）

先启动 backend（默认 3000 端口），再执行 FOFA 脚本提交任务：

```bash
cd /home/chartte/work/Agent-security-platform/backend
PORT=3000 ~/.nvm/versions/node/v22.17.0/bin/node --experimental-strip-types src/main.ts
```

### 9.2 启动 FOFA task-scan 脚本

方式 A：通过环境变量

```bash
cd /home/chartte/work/Agent-security-platform
FOFA_EMAIL='your_email' FOFA_KEY='your_key' \
npm run run:fofa:api:task-scan -- \
  --backend http://127.0.0.1:3000 \
  --query='port="11434" && protocol="http"' \
  --probeTargetId ollama \
  --requestedBy sec-ops \
  --size 20
```

方式 B：本地 env 文件自动加载（脚本会按顺序尝试）

1. `.env.fofa.local`
2. `.env.local`
3. `.env`
4. `~/.config/agent-security-platform/fofa.env`

```bash
npm run run:fofa:api:task-scan -- \
  --backend http://127.0.0.1:3000 \
  --query='port="11434" && protocol="http"' \
  --probeTargetId ollama \
  --requestedBy sec-ops \
  --size 20
```

批量看结果（把上一步返回的 task_id 填进去）
```bash
npm run run:fofa:task-batch-report -- \
  --backend http://127.0.0.1:3000 \
  --taskIds task_a,task_b,task_c
```

命令注意事项：
- `--size` 必须和 `npm run ... --` 在同一条命令中；不要落在新的一行单独执行。
- `--taskIds` 里的分隔符必须是英文逗号 `,`，不能使用中文逗号 `，`。
- 若 `task-batch-report` 返回某个 task 404，优先检查该 task_id 是否真实存在且完整复制。

### 9.3 现在可以抓起什么 IP

脚本本质是：
- 调用 FOFA `search/all`
- 按 query 返回的候选资产行提取 `host/ip/port/protocol`
- 转换成平台 `asset_scan` 任务并提交到 `POST /api/tasks`

因此，当前能抓起的 IP 范围 = 你在 query 中筛出的 FOFA 结果集中的公网 IP。

建议起步 query（P0 目标）

- Ollama：`port="11434" && protocol="http"`
- Langflow（常见）：`(port="3000" || port="8080" || port="9090") && protocol="http"`
- AutoGPT（常见）：`port="8000" && protocol="http"`
- OpenClaw Gateway（WS 相关端口）：`(port="18789" || port="18791" || port="18793")`

注意：
- 必须只扫描授权目标，禁止未授权扩散扫描。
- query 中可增加组织、地区、网段等过滤，先缩小到可控范围再跑。

### 9.4 批量结果汇总脚本

当 task-scan 返回 task_id 列表后，可用 batch-report 拉取结果与风险汇总：

```bash
cd /home/chartte/work/Agent-security-platform
npm run run:fofa:task-batch-report -- \
  --backend http://127.0.0.1:3000 \
  --taskIds task_a,task_b,task_c
```

## 10. 进一步扩展路线

### 10.1 采集层扩展（FOFA query）

- 增加按资产归属过滤：组织、ASN、地区、业务域名关键字。
- 增加按时间窗口过滤：优先采集近期变化资产。
- 增加按协议特征过滤：减少误报目标，提升任务有效密度。

### 10.2 执行层扩展（L1/L2/L3）

- L1：引入真实 naabu 输出的原始证据留存（`naabu_output`），并记录退出码/耗时。
- L2：引入 nmap 原始证据留存（`nmap_output`），补齐 `http_title`/`tls_subject` 解析映射。
- L3：将 timeout、budget、manual-stop 在 probe 级别细分来源并统一上送 `execution_context.audit.interruption_reason`。

### 10.3 状态与治理扩展

- 将 `partial_success` 判定从“单一中断原因”扩展为“分步骤成功率 + 中断原因”联合判定。
- 增加任务级执行统计：扫描端口数、命中接口数、超时数、跳过数。
- 增加审计字段：执行窗口、操作者、查询快照 hash、证据归档位置。

### 10.4 测试扩展（保持 TDD）

- repository：新增 query 过滤组合、空结果集、异常返回、速率限制场景。
- backend：新增 `partial_success` 与 `failed` 的风险汇总一致性断言。
- integration：新增“真实脚本创建任务 -> API 读取结果”的端到端冒烟链路。

## 11. 项目级大规模扫描执行计划（Design First）

本节基于项目启动说明中的总目标约束：
- 统一接口与统一输出外层字段。
- 一次只推进当前 requirement，不引入分布式重型基础设施。
- 在授权范围内执行公网扫描，并保留预算与审计留痕。

### 11.1 执行阶段划分

阶段 A（基线验证，1-2 天）
- 目标：验证 query 命中质量和链路稳定性。
- 输入规模：每个 query 50 到 200 条目标。
- 输出要求：任务创建成功率、finished/partial_success 比例、误报样本列表。

阶段 B（受控扩容，3-5 天）
- 目标：按端口优先级扩大覆盖，验证预算控制可用性。
- 输入规模：每个 query 500 到 2000 条目标。
- 输出要求：按端口族和 probeTargetId 的命中率、超时率、中断原因分布。

阶段 C（项目级常态化）
- 目标：形成按周滚动扫描和指纹表增量更新。
- 输入规模：单轮累计 5000 到 50000 条目标（按批次切片执行）。
- 输出要求：可复跑任务清单、指纹增量、风险趋势与回归报告。

### 11.2 扫描端口池设计

P0（当前 requirement 强制）
- critical：18789, 18791, 18793
- high：11434, 3000, 8080, 9090
- medium：8000, 5000, 3001
- low：80, 443, 8081

P1（项目级扩展建议，按授权增量引入）
- AI 应用常见端口：7860, 8501
- 管理与代理常见端口：8888, 5601
- 约束：P1 只在 P0 结果稳定后启用，不与 P0 首次覆盖混跑。

端口执行顺序
1. 先跑 critical + high，优先完成高价值识别。
2. 再跑 medium，补齐常见编排/服务入口。
3. low 仅在预算充足时追加，用于补充 web 外露面证据。

### 11.3 Query 设计方法（FOFA）

采用三层 query 结构，避免“大而泛”导致任务质量下降：

第一层（端口/协议基线）
- 例：port="11434" && protocol="http"
- 例：(port="18789" || port="18791" || port="18793")

第二层（授权范围收敛）
- 组织、网段、地域、ASN、业务域名关键字。
- 例：第一层 && country="CN" && org="example"

第三层（框架特征增强）
- 基于标题、证书、header、body 关键字增加精度。
- 例：第一层 && (header="OpenClaw" || body="/api/v1/flows")

Query 模板集建议
- 模板 T1（高召回）：只包含端口 + 协议 + 授权边界。
- 模板 T2（平衡）：在 T1 上加 1 到 2 个产品特征。
- 模板 T3（高精度）：在 T2 上叠加证书或响应关键字。

执行建议
- 先用 T1 建立候选池，再用 T2/T3 分批提纯。
- 每次批次固定保留 query 快照，写入 execution_context.audit.query。

### 11.4 参数量与批次规模建议

推荐使用“固定模板 + 分级阈值”，避免每次人工调参漂移。

级别 S（启动阶段）
- size：100 到 300
- max_targets：100 到 300
- max_ports_per_target：12（与 P0 端口池一致）
- max_runtime_seconds：600 到 1200
- 目标级 HTTP RPS：1 到 2
- 目标级 TCP 并发：10 到 20

级别 M（受控扩容）
- size：1000 到 3000
- max_targets：1000
- max_ports_per_target：12 到 16
- max_runtime_seconds：1800 到 3600
- 目标级 HTTP RPS：2 到 4
- 目标级 TCP 并发：20 到 40

级别 L（项目级批量）
- size：5000 到 20000（单批）
- max_targets：2000 到 5000（每批）
- max_ports_per_target：16
- max_runtime_seconds：3600 到 7200
- 目标级 HTTP RPS：3 到 5
- 目标级 TCP 并发：40 到 80

批次切片公式
- 批次数 = ceil(候选目标总数 / max_targets)
- 单日执行上限 = 批次数 × max_runtime_seconds（按窗口分配）

中断治理建议
- timeout 与 budget_exceeded 视为 partial_success 的优先候选。
- manual_stop 独立归档，用于区分人为中断与系统瓶颈。

### 11.5 指纹表与证据存储设计

在当前阶段不引入数据库迁移，采用“任务结果 + 文件归档”双轨存储。

层次化存储
- Raw 层：按任务保存 naabu_output、nmap_output、原始 HTTP/WS 响应摘要。
- Normalized 层：统一映射 open_ports、http_endpoints、findings、risk_level。
- Fingerprint 层：从 Normalized 层抽取稳定指纹行，形成可增量更新的样本表。

指纹主键建议
- fingerprint_key = hash(probe_target_id + target_ip + target_port + protocol + signature_digest)

fingerprint-samples 建议字段
- fingerprint_key
- framework_id
- asset_category
- target_ip
- target_port
- protocol
- matched_features
- specificity_score
- confidence
- risk_baseline
- first_seen_at
- last_seen_at
- source_query_hash
- latest_task_id

落盘规范
- 任务级证据继续通过 result.details 输出，保持现有契约。
- 指纹样本表建议落盘至 docs 或 samples 的固定目录，并保留版本号（如 v0.2, v0.3）。
- 同一 fingerprint_key 新增命中时仅更新 last_seen_at、latest_task_id 和证据引用。

### 11.6 项目级执行闭环

1. 准备阶段
- 明确授权资产范围与扫描窗口。
- 固化本轮 query 模板、参数级别（S/M/L）和预算上限。

2. 执行阶段
- 先跑 T1 建候选，再跑 T2/T3 提纯。
- 按批提交 task-scan，结束后统一跑 batch-report。

3. 归档阶段
- 归档任务结果与关键原始输出。
- 生成指纹增量表并更新 first_seen/last_seen。

4. 复盘阶段
- 统计 finished、partial_success、failed。
- 分析 interruption_reason 和端口命中分布，反向修正 query 与参数模板。

### 11.7 与当前 requirement 的对应关系

- 端口池：与 REQ-ASSET-SCAN-PORT-007 的 P0 端口完全对齐。
- 预算控制：覆盖 max_targets、max_ports_per_target、max_runtime_seconds。
- 审计留痕：覆盖 query、requested_by、时间窗口、中断原因。
- 存储闭环：覆盖结构化证据、原始输出、指纹样本增量。
