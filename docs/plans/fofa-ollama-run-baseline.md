# FOFA Ollama 执行基线（v1）

更新时间：2026-05-25
适用 requirement：REQ-ASSET-SCAN-PORT-007

## 1. 默认执行模板

- 主模板（默认）：`app="Ollama" && is_domain=false && country="CN" && port="11434"`
- 用途：在当前样本质量与转化表现下，作为唯一默认提纯模板。

对照模板（仅用于回退/对照）：
- `app="Ollama" && is_domain=false && country="CN"`

已淘汰模板：
- `app="Ollama" && is_domain=false && country="CN" && protocol="http"`
- 淘汰原因：在 round1 中 `fetched=0`。

## 2. 默认运行规模

- 当前默认规模：`size=100`
- 判定依据：
  - round13：`high_rate=94%`
  - round14：`high_rate=92%`
  - 两轮均 `keep_size_100=true`

关键证据：
- `docs/temp/fofa-ollama-query-ab-b2-round13-size100-compare.json`
- `docs/temp/fofa-ollama-query-ab-b2-round14-size100-compare.json`

## 3. 失败回退链路（运行时）

执行链路：
1. `naabu` 端口探测（首选）
2. 若 `naabu` 受 `ipinfo` 初始化失败影响：跳过后续重复 `naabu`，直接走 `nmap --open`
3. `nmap` 证据不足或超时：走 `/api/tags` HTTP 补证
4. `/api/tags` 命中 `models` 结构时可判定为有效 Ollama 证据

说明：
- `timeout` 代表本次证据获取超时，不直接等于 negative。
- `timeout` 目标可进入可选重试 playbook，但不作为默认第二遍。

## 4. 判定与门禁口径

### 4.1 A/B 收敛口径

- 主指标：`high_rate_among_finished_pct`
- 次指标：`fetched/created/finished` 是否稳定、是否出现 `fetched=0`

### 4.2 升级门禁口径

- 升级到 `size=100` 的门槛：
  - 连续轮次高风险命中均值 >= 80%
  - 运输失败占比 <= 50%

门禁判定文件：
- `docs/temp/fofa-ollama-gate-decision-round12.json`

## 5. 样本口径（当前基线）

固定评测集：
- 文件：`docs/temp/fofa-ollama-eval-benchmark-v1.json`
- 当前计数：
  - `positive=4`
  - `negative=10`
  - `transport_failure=10`

最新运行轮次（round14）info 分层：
- 文件：`docs/temp/fofa-ollama-negative-harvest-round14-size100.json`
- 当前计数：
  - `strong_positive=3`
  - `strong_negative=2`
  - `transport_failure=3`

## 6. 当前执行建议

1. 保持 `query_b2 + size=100` 作为默认执行基线。
2. 每轮固定产出：task-scan、batch-report、size100-compare、negative-harvest。
3. 周度汇总至少跟踪：
   - `high_rate` 趋势
   - `transport_failure` 占比趋势
   - `strong_negative` 净增量
