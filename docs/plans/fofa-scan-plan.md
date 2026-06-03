# FOFA 扫描全计划总览（当前唯一）

## 1. 适用范围

本页只记录当前 FOFA 扫描计划，覆盖：

- FOFA 候选资产拉取与任务创建
- asset_scan 执行与结果回读
- 批次治理、审计留痕、阶段验收

不包含前端开发、三引擎长期路线、泛项目里程碑。

## 2. 当前 Requirement

来源：docs/sprint-current.md

- Requirement ID：REQ-ASSET-SCAN-PORT-007
- 名称：端口扫描执行策略与结果落盘闭环（阶段 H）
- 当前目标：在授权范围内完成 FOFA -> task-scan -> batch-report 的可复跑闭环

## 3. 当前 Focus（仅扫描）

当前 focus：仅 Ollama 扫描与验证（阶段 A 的 Ollama 专项）。

- Focus-1：仅保留 Ollama 查询链路（app 查询 + 候选验证）
- Focus-2：固定 S 档参数，控制规模与超时
- Focus-3：按批归档 Ollama candidate/verified/negative 样本
- Focus-4：基于转化率数据固化 Ollama 查询模板
- 旁线验证：Langflow / AutoGPT / OpenClaw 的 query 设计仅作为辅助对照，当前不作为主线推进对象。

阶段 A 退出门槛：

- 完成至少 3 个 probeTargetId 的有效批次
- finished + partial_success >= 85%
- 每批都有 query、requested_by、时间窗口、中断原因

## 4. FOFA 扫描全计划（A/B/C）

### 阶段 A：基线验证（当前）

- 规模：每个 query 50 到 200 目标
- 目的：验证链路稳定性与 query 命中质量
- 输出：任务成功率、状态分布、误报样本

### 阶段 B：受控扩容

- 规模：每个 query 500 到 2000 目标
- 目的：验证预算和限速在扩容下仍稳定
- 输出：端口族命中率、超时率、中断原因分布

### 阶段 C：常态化滚动扫描

- 规模：单轮 5000 到 50000（按批次切片）
- 目的：形成周度扫描与指纹增量更新机制
- 输出：可复跑批次清单、指纹增量、趋势报告

## 5. 首批执行包（阶段 A）

### Query 包

- Q1（ollama）：app="Ollama" && is_domain=false
- Q2（langflow）：(port="3000" || port="8080" || port="9090") && protocol="http"
- Q3（autogpt）：port="8000" && protocol="http"
- Q4（openclaw-gateway）：(port="18789" || port="18791" || port="18793")
- Q5（提纯）：在 Q1~Q4 上增加授权边界过滤（country/org/asn/domain）

执行顺序：Q1 -> Q2 -> Q4 -> Q3 -> Q5。

### 参数基线（S 档）

- size=200
- max_targets=200
- max_ports_per_target=12
- max_runtime_seconds=1200
- 目标级 HTTP RPS：1 到 2
- 目标级 TCP 并发：10 到 20

回退规则：

- timeout > 25%：size 降到 100，再降并发
- failed > 20%：收紧 query（优先 T2）后重跑

当前执行说明：

- 计划基线仍为 `size=200`
- 实际 Day 1 已先用 `size=20` 跑通 Q1/Q2，作为安全启动批次
- 直接执行 `size=200` 时出现过 `fetch failed`，当前先按小批量建立稳定基线，再决定是否恢复到 200

## 6. 已完成

- FOFA API 到 POST /api/tasks 已打通。
- FOFA 凭据自动加载与批量结果汇总脚本已可用。
- Day 1（Q1/Q2）与 Day 2（Q4/Q3/Q5）批次执行完成，形成可复盘结果。
- Ollama 主查询已切换为 app 查询：`app="Ollama" && is_domain=false`。
- `/api/tags` 复核链路已跑通，已完成一次候选分层与样本归档。
- 已清理弱证据样本，当前保留基线样本：
  - 正样本：`samples/assets/fingerprint-positive/ollama.s001.json`
  - 负样本：`samples/assets/fingerprint-negative/ollama.neg.n002.json` 到 `samples/assets/fingerprint-negative/ollama.neg.n009.json`
- 已执行主模板小批次 round1（size=20）：
  - task-scan：`fetched=20`、`created=20`
  - batch-report：`finished=20`、`failed=0`
  - 风险分布：`info=12`、`high=8`
  - 结果文件：
    - `docs/temp/fofa-ollama-smallsize-round1.json`
    - `docs/temp/fofa-ollama-smallsize-round1-batch-report.json`
- round1 已完成强正样本复核并入库：
  - 复核结果：`8` 条强正、`0` 条强负、`0` 条运输失败
  - 复核文件：`docs/temp/fofa-ollama-smallsize-round1-verified.json`
  - 入库结果：`samples/assets/fingerprint-positive/ollama.s002.json` 到 `samples/assets/fingerprint-positive/ollama.s009.json`
- round2 已完成非 11434 命中复核并入库：
  - 复核结果：`5` 条强正、`0` 条强负、`7` 条运输失败
  - 复核文件：`docs/temp/fofa-ollama-smallsize-round2-negative-review.json`
  - 入库结果：`samples/assets/fingerprint-positive/ollama.s010.json` 到 `samples/assets/fingerprint-positive/ollama.s014.json`
- round3 已完成 size=50 复核并入库：
  - 复核结果：`12` 条强正、`0` 条强负、`22` 条运输失败
  - 复核文件：`docs/temp/fofa-ollama-smallsize-round3-info-review.json`
  - 入库结果：`samples/assets/fingerprint-positive/ollama.s015.json` 到 `samples/assets/fingerprint-positive/ollama.s026.json`

## 7. 正在进行

- 仅针对 Ollama 执行受控扩样稳定性验证（size=50）。
- 按三分类准入规则收敛样本质量：
  - 强正样本：`status=200` + `json_parse_ok=true` + `has_models_key=true` + 非空 `response_body_excerpt`
  - 强负样本：有可读响应但不满足 `models` 结构，且 `exclusion_reason` 必填
  - 运输失败样本：只保留运行证据，不进入正负样本库
- protocol 分拆模板暂不作为默认路径，待主模板稳定后再评估。
- round1 结果显示强正样本可稳定获取，但强负样本仍需继续采集。
- round2 结果显示除 11434 外，其他 Ollama 暴露面也可提供可用强正样本；强负样本仍未形成。
- round3 结果显示 size=50 仍然可稳定产出强正样本，但强负样本仍需单独采集。
- round5 到 round9 复核显示：high 组真阳性稳定，但 info 抽样运输失败占比持续偏高（80% 到 100%），扩样质量门槛未达标。

## 8. 下一步

1. 先执行 timeout 定向重试治理（只重试 timeout 桶，不做全量重跑）。
2. 固化双档参数：快扫（短超时）与复核（长超时）并行保留。
3. 只围绕 Ollama 继续做 query A/B 收敛与候选验证，优先提高真命中率。
4. 在可达但非 Ollama 响应目标中补采 strong_negative，并保持运输失败不入库。
5. 每轮必须产出 query 模板版本、batch-report、样本分层结果。
6. Langflow / AutoGPT / OpenClaw 暂停继续推进，除非后续再次明确要求。

### 8.1 Ollama 受控扩样执行方案（先质量后规模）

执行顺序：
1. 维持主模板 `size=50` 连续执行 2 轮（round5、round6），不先放大到 100/200。
2. 每轮复核分两组：
  - high 组：全部复核 `/api/tags`。
  - info 组：抽样 10 条复核 `/api/tags`，用于监控噪声与运输失败。
3. 复核分层后执行样本同步：
  - strong_positive 入正样本库；
  - strong_negative 入负样本库；
  - transport_failure 仅保留证据，不入库。

放大门槛（满足后再升到 `size=100`）：
- 连续两轮 high 组强正率 >= 80%。
- 连续两轮 info 抽样运输失败占比 <= 50%。
- 每轮都输出完整审计与分层产物（query、requested_by、批次文件、分类汇总）。

回退规则：
- 任一轮 high 强正率 < 60% 或 info 抽样运输失败 > 70%，保持 `size=50` 并收紧 query 后重跑。

### 8.2 样本治理与收敛执行方案（当前优先）

目标：在不盲目扩样的前提下，降低运输失败占比并形成可复跑质量基线。

执行步骤：
1. 失败分桶分析（先做）
  - 输入：`round5` 到 `round9` 的 high/info 复核文件。
  - 输出：按 `timeout`、`fetch_failed`、`tls/refused` 分桶占比；按端口与协议分组的失败热区。
  - 文件：`docs/temp/fofa-ollama-transport-failure-analysis-round5-9.json`。
2. Query 收敛实验（A/B）
  - 保持 `size=50`，拆分 2 到 3 个候选模板并行小批量。
  - 每轮仅比较：`high` 强正率、`info` 运输失败占比、强样本净增量。
  - 只保留最优模板进入下一轮。
3. 强负样本专项补采
  - 从“可达但非 Ollama 响应”目标补采 strong_negative。
  - 强制要求 `status` 为数值且 `exclusion_reason` 非空，运输失败仍不入负样本库。
4. 固定评测集建立
  - 从现有样本中冻结正/负/运输失败三类评测集，用于每次规则或查询变更后的回归对比。
5. 门禁升级判定
  - 连续两轮满足门槛后才允许升到 `size=100`。
  - 若连续两轮未改善（运输失败不下降或真阳性下降），暂停扩样并继续收敛 query。

阶段产物（新增）：
- `docs/temp/fofa-ollama-transport-failure-analysis-round5-9.json`
- `docs/temp/fofa-ollama-query-ab-compare-roundX.json`
- `docs/temp/fofa-ollama-negative-harvest-roundX.json`
- `docs/temp/fofa-ollama-eval-benchmark-v1.json`

阶段完成定义（DoD）：
- 至少 2 轮 A/B 对比结果可复盘；
- `info` 抽样运输失败占比稳定下降并达到门槛；
- 新增 strong_negative 样本形成可用规模；
- 升级门禁结论写入 `docs/progress.md`。

最新执行检查点（2026-05-25）：
- round1（A vs B=protocol=http）：
  - `docs/temp/fofa-ollama-query-ab-compare-round10.json`
  - 结果：`query_b fetched=0`，winner=`query_a`
- round2（A vs B2=port=11434）：
  - `docs/temp/fofa-ollama-query-ab-compare-round11.json`
  - 结果：`query_a high_rate=75%`，`query_b2 high_rate=90%`，winner=`query_b2`
- round3（A vs B2=port=11434）：
  - `docs/temp/fofa-ollama-query-ab-compare-round12.json`
  - 结果：`query_a high_rate=65%`，`query_b2 high_rate=75%`，winner=`query_b2`
- strong_negative 补采（跨目标 round12）：
  - `docs/temp/fofa-ollama-negative-harvest-round12-cross-target.json`
  - 结果：`strong_negative=14`，`transport_failure=16`
- 固定评测集（v1）：
  - `docs/temp/fofa-ollama-eval-benchmark-v1.json`
  - 结果：`positive=4`、`negative=10`、`transport_failure=10`
- round13（query_b2, size=100 升级轮）：
  - `docs/temp/fofa-ollama-query-ab-b2-round13-size100-compare.json`
  - 结果：`finished=100`、`high=94`、`high_rate=94%`、`keep_size_100=true`
- round14（query_b2, size=100 稳定性复测）：
  - `docs/temp/fofa-ollama-query-ab-b2-round14-size100-compare.json`
  - 结果：`finished=100`、`high=92`、`high_rate=92%`、`keep_size_100=true`
- 当前收敛建议：`query_b2` 作为默认提纯模板，`query_a` 作为召回基线与回退模板并行保留。

### 8.3 naabu+nmap 接入主线脚本试运行计划（size=50）

目标：
- 在不替换现有 FOFA 主链路的前提下，将 naabu+nmap 工作流接入为主线可执行脚本，并完成一次 `size=50` 试运行。

执行顺序（严格按 Design -> Test -> Implement -> Document -> Stop）：
1. Design
  - 明确最小接入范围：
    - 保留 `run:fofa:api:task-scan` 作为候选拉取入口；
    - 新增主线编排脚本（读取 task-scan 结果 -> 调用 `runFofaPortscanWorkflow`）；
    - 新增 npm 命令用于一键试跑。
  - 拟修改文件：
    - `scripts/dev/intel/fofa-mainline-portscan.ts`（新增）
    - `package.json`（新增运行命令）
    - `tests/repository/fofa-mainline-portscan.spec.ts`（新增测试）
2. Test (RED)
  - 先新增测试覆盖：
    - task-scan 输出解析（兼容前置日志 + JSON）
    - 目标映射规则（`source_ip/source_port` 缺失时从 `target_value` 回退解析）
  - 先运行新增测试，预期 RED。
3. Implement (GREEN)
  - 实现主线编排脚本并通过测试。
  - 保持最小接入，不改动现有样本入库准入规则。
4. Execute Trial
  - 先做环境检查：`naabu`、`nmap` 二进制可用性。
  - 执行 `size=50` 试运行并输出：
    - `docs/temp/fofa-ollama-naabu-nmap-round1.json`（候选）
    - `docs/temp/fofa-ollama-naabu-nmap-round1-workflow-summary.json`（工作流摘要）
  - 若工具缺失或超时，保留失败证据并记录为环境阻塞，不回滚主线。
5. Document
  - 在 `docs/progress.md` 记录：
    - 是否接入成功；
    - 工具可用性；
    - `size=50` 试运行结果；
    - 与现有主链路的差异结论。
6. Stop
  - 本 requirement 内完成一次接入试跑后停止；query 收敛留待下一步 requirement。

试运行验收口径：
- 脚本可执行并产出 workflow summary；
- 至少记录 `total_targets`、`naabu_success_targets`、`nmap_attempted_targets`、`verified_count`；
- 失败场景具备可审计输出（原始命令输出和退出码）。

### 8.4 timeout 定向重试治理计划（按顺序第一优先）

目标：
- 以最小执行成本降低 timeout 占比，并验证 `verified_count` 是否可稳定提升。

输入：
- 基线批次：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable-workflow/`。
- timeout 桶：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable-failure-buckets.json` 中 `bucket=timeout` 的目标。

执行顺序：
1. 从 timeout 桶提取目标，生成重试输入文件（仅包含 timeout 目标）。
2. 使用“复核档参数”执行一次重试：
  - `naabuTimeoutMs` 维持当前值；
  - `nmapTimeoutMs` 使用长超时档（不低于 20s）；
  - `enableHttpProbeFallback=true`。
3. 产出重试批次的 `workflow-summary.json` 与 `raw-evidence.json`。
4. 生成“重试前后对比”报告，至少比较：
  - `verified_count` 变化；
  - timeout 数量变化；
  - 单目标重试转化率（timeout -> verified）。

产物路径（本轮固定）：
- 重试输入：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry.json`
- 重试输出目录：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry-workflow/`
- 对比报告：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry-compare.json`

验收标准（本小节 DoD）：
- 成功完成 1 轮 timeout 定向重试并产出上述 3 类文件。
- 对比报告中明确给出“是否建议将定向重试纳入默认流程”的结论。
- 若 timeout 仍无明显下降（下降 < 20%），则保持双档参数并转入 query A/B 收敛，不继续扩大样本规模。

## 9. 非 Ollama Query 设计计划（旁线记录）

### 9.1 目标与原则

- 目标：保留 `langflow`、`autogpt`、`openclaw-gateway` 的旁线 query 记录，便于后续需要时快速恢复。
- 原则：先召回再提纯；候选与验证分层；任何模板都可回退到上一层。
- 状态：当前不作为主线推进，仅保留实验记录和可回溯模板。

### 9.2 模板分层定义

- T1（高召回）：端口 + 协议 + 授权边界（country/org/asn）。
- T2（平衡）：在 T1 基础上增加 1 到 2 个产品特征（title/body/header/path 关键词）。
- T3（高精度）：在 T2 基础上增加强约束（更窄关键词组合或额外边界）。

### 9.2.1 模板优先级（先旧后新）

- 优先级 P0（默认）：优先使用本仓库之前已采用的“旧版设计”查询（以第 5 节 Query 包风格为准）。
- 优先级 P1（回退）：若旧版设计在当前目标上出现以下任一情况，则切换到本节“当前版本”模板：
  - 查询语义已失效（命中显著不足，连续两轮 `fetched=0` 或接近 0）
  - 运输失败占比过高（`info` 中运输失败占比 > 50%）
  - 样本增量不足（连续两轮无稳定强样本增量）
- 执行要求：每次从旧版切换到当前版本时，必须在 `docs/progress.md` 记录切换原因与对应批次文件。

### 9.3 目标级 query 草案

1. Langflow
- 旧版优先（先跑）
  - T1-old：`(port="3000" || port="8080" || port="9090") && protocol="http"`
  - T2-old：`((port="3000" || port="8080" || port="9090") && protocol="http") && country="CN"`
- 当前版回退（后跑）
  - T1-new：`(port="3000" || port="8080" || port="9090") && protocol="http"`
  - T2-new：`((port="3000" || port="8080" || port="9090") && protocol="http") && (title="langflow" || body="langflow")`
  - T3-new：`((port="3000" || port="8080" || port="9090") && protocol="http") && (title="langflow" || body="langflow") && country="CN"`

2. AutoGPT
- 旧版优先（先跑）
  - T1-old：`port="8000" && protocol="http"`
  - T2-old：`(port="8000" && protocol="http") && country="CN"`
- 当前版回退（后跑）
  - T1-new：`port="8000" && protocol="http"`
  - T2-new：`(port="8000" && protocol="http") && (title="autogpt" || body="autogpt" || body="agent")`
  - T3-new：`(port="8000" && protocol="http") && (title="autogpt" || body="autogpt") && country="CN"`

3. OpenClaw Gateway
- 旧版优先（先跑）
  - T1-old：`(port="18789" || port="18791" || port="18793")`
  - T2-old：`((port="18789" || port="18791" || port="18793")) && country="CN"`
- 当前版回退（后跑）
  - T1-new：`(port="18789" || port="18791" || port="18793")`
  - T2-new：`((port="18789" || port="18791" || port="18793")) && (title="openclaw" || body="openclaw" || header="openclaw")`
  - T3-new：`((port="18789" || port="18791" || port="18793")) && (title="openclaw" || body="openclaw") && country="CN"`

### 9.4 执行顺序与门槛

执行顺序：Langflow -> AutoGPT -> OpenClaw Gateway。

每个目标按以下顺序执行：
1. 先跑 T1（size=20），记录 fetched/created/finished。
2. 若 `0 findings` 比例过高或运输失败过多，切换到 T2。
3. 若 T2 仍噪声高，切换到 T3。

切换门槛（单目标）：
- 从 T1 到 T2：`high` 占比 < 20% 且 `info` 中运输失败占比 > 50%。
- 从 T2 到 T3：两轮后仍无稳定强样本增量。

模板切换顺序（先旧后新）：
1. 先跑旧版 T1/T2（沿用第 5 节思路）。
2. 旧版无效时再跑当前版 T1/T2/T3。
3. 当前版若命中不足，可回退旧版并收紧授权边界后重跑。

### 9.5 每轮输出物

- task-scan 原始输出：`docs/temp/fofa-<target>-<template>-roundX.json`
- batch-report：`docs/temp/fofa-<target>-<template>-roundX-batch-report.json`
- 样本分层：`docs/temp/fofa-<target>-<template>-roundX-review.json`
- 进度记录：在 `docs/progress.md` 记录模板版本与选择原因。
