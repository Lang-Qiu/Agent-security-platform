# Progress

Update this file after each completed requirement.

Recommended fields:
- requirement name or id
- change scope
- tests added or updated
- test result
- docs updated
- current conclusion and next blocker

## 2026-05-28 - 阶段总结报告提交版整理（纯文档）
- requirement: 整合现有阶段性报告与 FOFA/Ollama 分层扫描补充说明，形成可提交给老师的阶段总结报告
- scope:
  - 将原阶段总结整理为”阶段目标、完成工作、工程结构、FOFA 闭环、测试评估、边界问题、下一步计划”的提交版结构
  - 融合 FOFA 查询模板、task-scan、naabu、nmap、HTTP `/api/tags` 补证、正负样本与执行基线说明
- tests added: none（纯文档整理）
- test result: not run（无业务代码变更）
- docs updated:
  - `docs/李珮莹阶段总结报告-提交版.md`
  - `docs/progress.md`
- notes:
  - 本次未进入业务实现阶段，属于文档更新对完整 TDD 的允许例外

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 执行基线文档固化（doc-only）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将当前稳定执行口径整理为单页基线文档（模板、规模、回退链路、门禁、样本口径）
  - 作为后续周度滚动批次的标准执行参考
- tests added: none（纯文档更新）
- test result: not run（无代码变更）
- docs updated:
  - `docs/plans/fofa-ollama-run-baseline.md`
  - `docs/progress.md`
- notes:
  - 文档已固化当前默认基线：`query_b2 + size=100`
  - 本次为文档/配置例外，不涉及业务实现改动

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 size=100 稳定性复测（round14）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `size=100` 下执行 round14（query_b2）验证升级后稳定性
  - 产出相对 round13 的质量对比与 info 组负样本分层结果
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - task-scan：`docs/temp/fofa-ollama-query-ab-b2-round14-size100.json`
    - `fetched=100`
    - `created=100`
  - batch-report：`docs/temp/fofa-ollama-query-ab-b2-round14-size100-batch-report.json`
    - `finished=100`
    - `high=92`
    - `info=8`
    - `high_rate=92%`
  - 对比文件：`docs/temp/fofa-ollama-query-ab-b2-round14-size100-compare.json`
    - `baseline_round13_high_rate=94%`
    - `delta=-2%`
    - `keep_size_100=true`
  - info 分层：`docs/temp/fofa-ollama-negative-harvest-round14-size100.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - `size=100` 连续两轮（round13/round14）均保持高命中且无退化到门禁线以下，当前可继续维持
  - 下一步建议开始“周度滚动批次”并保留同口径对比文件，持续监控运输失败与 strong_negative 净增

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 size=100 升级轮执行与验证（round13）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按门禁判定执行 `query_b2` 的 `size=100` 受控升级轮
  - 产出 task-scan、batch-report 与相对 round12 的质量对比
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - task-scan：`docs/temp/fofa-ollama-query-ab-b2-round13-size100.json`
    - `fetched=100`
    - `created=100`
  - batch-report：`docs/temp/fofa-ollama-query-ab-b2-round13-size100-batch-report.json`
    - `finished=100`
    - `high=94`
    - `info=6`
    - `high_rate=94%`
  - 对比文件：`docs/temp/fofa-ollama-query-ab-b2-round13-size100-compare.json`
    - `baseline_round12_b2_high_rate=75%`
    - `delta=+19%`
    - `keep_size_100=true`
- docs updated:
  - `docs/progress.md`
- notes:
  - 本轮升级后质量未下降且显著提升，`size=100` 可继续保持为当前执行规模
  - 下一步建议在 `size=100` 下继续跟踪运输失败占比与 strong_negative 净增，防止只提升高命中而丢失覆盖面

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 门禁升级判定（round12）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 基于 round11/round12 的 query_b2 收敛结果与 `eval-benchmark-v1` 生成门禁判定
  - 输出是否可从 `size=50` 升级到 `size=100` 的结论文件
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - 判定文件：`docs/temp/fofa-ollama-gate-decision-round12.json`
  - 关键指标：
    - `b2_high_rate_round11=90%`
    - `b2_high_rate_round12=75%`
    - `b2_high_rate_avg=82.5%`
    - `benchmark_transport_ratio=41.67%`
  - 判定结论：`can_upgrade_to_size_100=true`
- docs updated:
  - `docs/progress.md`
- notes:
  - 当前满足门禁阈值（高风险命中均值 >= 80%、运输失败占比 <= 50%）
  - 下一步建议按 `query_b2` 执行一次 `size=100` 受控升级轮，并复用现有审计与分层产物口径

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 跨目标 strong_negative 补采成功与评测集 v1 固化
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 从旁线历史批次（langflow/autogpt/openclaw）提取非 11434 候选进行 `/api/tags` 定向复核
  - 形成跨目标 strong_negative 样本增量
  - 基于 round10/11/12 补采结果固化评测集 `v1`（positive/negative/transport_failure）
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - 跨目标补采：`docs/temp/fofa-ollama-negative-harvest-round12-cross-target.json`
    - `total_targets=30`
    - `strong_positive=0`
    - `strong_negative=14`
    - `transport_failure=16`
  - 固定评测集：`docs/temp/fofa-ollama-eval-benchmark-v1.json`
    - `positive=4`
    - `negative=10`
    - `transport_failure=10`
- docs updated:
  - `docs/progress.md`
- notes:
  - “strong_negative 样本不足”阻塞已解除，已形成可复用负样本集
  - 当前下一步可进入门禁升级判定（基于 `query_b2` 与 `eval-benchmark-v1` 做连续轮次回归）

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 强负样本专项补采（round10/round11）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 基于 Query A/B round3 的 info 目标执行 `/api/tags` 直连复核
  - 按规则输出 strong_positive / strong_negative / transport_failure 分层
  - 产出负样本补采文件并确认是否形成 strong_negative 增量
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - round10（来源：B2 info 组）：`docs/temp/fofa-ollama-negative-harvest-round10.json`
    - `total_info_targets=5`
    - `strong_positive=3`
    - `strong_negative=0`
    - `transport_failure=2`
  - round11（来源：A info 组）：`docs/temp/fofa-ollama-negative-harvest-round11.json`
    - `total_info_targets=7`
    - `strong_positive=2`
    - `strong_negative=0`
    - `transport_failure=5`
- docs updated:
  - `docs/progress.md`
- notes:
  - 本轮未获得 strong_negative 样本增量，当前阻塞为“可达但非 Ollama 响应”目标不足
  - 现有 info 目标主要分化为“可达后转 strong_positive”或“运输失败”，下一步需引入非 11434 旁线可达目标做定向负样本补采

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 Query A/B 收敛第三轮复核（winner 稳定）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 执行 Query A/B 收敛 round3（A=主模板；B2=port=11434 提纯模板）
  - 验证 round2 的 winner（query_b2）是否在下一轮保持稳定
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - round3 对比：`docs/temp/fofa-ollama-query-ab-compare-round12.json`
    - query_a：`fetched=20`、`finished=20`、`high=13`、`high_rate=65%`
    - query_b2（`port="11434"`）：`fetched=20`、`finished=20`、`high=15`、`high_rate=75%`
    - 决策：`winner=query_b2`
- artifacts:
  - `docs/temp/fofa-ollama-query-ab-a-round3.json`
  - `docs/temp/fofa-ollama-query-ab-b2-round3.json`
  - `docs/temp/fofa-ollama-query-ab-a-round3-batch-report.json`
  - `docs/temp/fofa-ollama-query-ab-b2-round3-batch-report.json`
  - `docs/temp/fofa-ollama-query-ab-compare-round12.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - query_b2 已连续两轮胜出（round2 与 round3），当前可作为默认提纯模板
  - query_a 仍保留为召回基线模板，用于并行对照与回退

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 Query A/B 收敛首轮与二轮结果
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 执行 Query A/B 收敛 round1（A=主模板；B=protocol=http 模板）
  - 在 round1 的 B=0 命中后，执行 round2（B2=port=11434 提纯模板）
  - 产出两轮 task-scan、batch-report 与对比决策文件
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - round1 对比：`docs/temp/fofa-ollama-query-ab-compare-round10.json`
    - query_a：`fetched=20`、`finished=20`、`high=15`、`high_rate=75%`
    - query_b（`protocol="http"`）：`fetched=0`
    - 决策：`winner=query_a`
  - round2 对比：`docs/temp/fofa-ollama-query-ab-compare-round11.json`
    - query_a：`fetched=20`、`finished=20`、`high=15`、`high_rate=75%`
    - query_b2（`port="11434"`）：`fetched=20`、`finished=20`、`high=18`、`high_rate=90%`
    - 决策：`winner=query_b2`
- artifacts:
  - round1:
    - `docs/temp/fofa-ollama-query-ab-a-round1.json`
    - `docs/temp/fofa-ollama-query-ab-b-round1.json`
    - `docs/temp/fofa-ollama-query-ab-a-round1-batch-report.json`
    - `docs/temp/fofa-ollama-query-ab-b-round1-batch-report.json`
    - `docs/temp/fofa-ollama-query-ab-compare-round10.json`
  - round2:
    - `docs/temp/fofa-ollama-query-ab-a-round2.json`
    - `docs/temp/fofa-ollama-query-ab-b2-round2.json`
    - `docs/temp/fofa-ollama-query-ab-a-round2-batch-report.json`
    - `docs/temp/fofa-ollama-query-ab-b2-round2-batch-report.json`
    - `docs/temp/fofa-ollama-query-ab-compare-round11.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - `protocol=http` 过滤在本轮样本中召回为 0，不适合作为默认 B 模板
  - `port=11434` 提纯模板在保持召回的同时提升 high 占比，当前可作为收敛优先候选

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 timeout 定向重试首轮执行与决策
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按计划文档 8.4 执行 timeout 桶定向重试（仅重试 timeout 目标）
  - 产出重试工作流结果与“重试前后对比”决策报告
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - 重试输入：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry.json`（`tasks=7`）
  - 重试输出：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry-workflow/workflow-summary.json`
    - `total_targets=7`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=6`
    - `verified_count=5`
    - `failed_count=0`
  - 对比报告：`docs/temp/fofa-ollama-naabu-nmap-smoke10-timeout-retry-compare.json`
    - `timeout_drop_pct=28.57`
    - `verified_delta_vs_timeout_subset=-2`
    - `timeout_to_verified_conversion_rate_pct=71.43`
    - `recommend_default_timeout_retry=false`
- docs updated:
  - `docs/progress.md`
- notes:
  - timeout 定向重试可降低 timeout 数量，但在本轮未提升 timeout 子集 verified 产出
  - 结论为“保留为可选 playbook，不纳入默认第二遍”；下一步进入 query A/B 收敛与模板收紧

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 扩展小批次（smoke10/实际8）复跑与失败分桶
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按既定下一步计划执行扩展小批次复跑（目标 smoke10；可用样本 8 条）
  - 输出标准时延与快速时延两组工作流结果
  - 基于 `raw-evidence.json` 生成失败分桶报告（timeout / tls / refused / other）
- tests added: none（本次为执行与证据分析，不涉及实现改动）
- test result: not run（无代码变更）
- execution result:
  - 输入：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable.json`（`tasks=8`）
  - 标准时延输出：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable-workflow/workflow-summary.json`
    - `total_targets=8`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=7`
    - `verified_count=7`
    - `failed_count=0`
  - 快速时延输出：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable-workflow-fast/workflow-summary.json`
    - `total_targets=8`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=5`
    - `verified_count=5`
    - `failed_count=0`
- failure bucketing:
  - 报告：`docs/temp/fofa-ollama-naabu-nmap-smoke10-reachable-failure-buckets.json`
  - 统计：`timeout=7`、`tls_or_cert=0`、`refused_or_reset=0`、`other=1`、`none=0`
- docs updated:
  - `docs/progress.md`
- notes:
  - 在当前网络条件下，`naabu` 仍稳定受 `ipinfo` 依赖影响，但工作流已可通过 nmap + `/api/tags` 回退稳定产出 verified
  - 同一批次在更宽松 nmap 超时下（20s）产出显著高于快速参数（8s），后续建议保留双档参数并按场景选择

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 naabu ipinfo 跳过优化回归修复与案例复跑
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 优化：检测到 `naabu` 的 `ipinfo` 初始化失败后，后续目标不再重复执行 naabu
  - 回归修复：确保“跳过 naabu”后，后续目标仍执行 `nmap --open`，避免只扫描首个目标
  - 执行两组小量案例复跑并验证结果
- tests updated:
  - `tests/repository/fofa-portscan-workflow.spec.ts`
    - 新增用例：`workflow skips repeated naabu runs after ipinfo runner init failure is detected`
    - 扩展断言：跳过 naabu 后，`nmap --open` 仍应对每个目标执行
- test result: pass（两次 RED -> GREEN）
  - RED-1：naabu 仍重复调用（`2 !== 1`）
  - GREEN-1：实现全局 skip 后通过
  - RED-2：发现回归，仅首个目标执行 open-check（`1 !== 2`）
  - GREEN-2：修复后通过
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-portscan-workflow.spec.ts tests/repository/fofa-mainline-portscan.spec.ts`
    - `npm run test:repo`
- implementation:
  - 更新：`scripts/dev/intel/fofa-portscan-workflow.ts`
    - 新增 `skipNaabuDueToRunnerInitFailure` 状态
    - 首次识别 ipinfo runner 初始化失败后，后续目标跳过 naabu
    - 修复回归：在 skip 模式下仍对每个目标执行 `nmap --open`
- execution result:
  - 对照批次复跑：`docs/temp/fofa-ollama-naabu-nmap-smoke5-workflow-rerun/workflow-summary.json`
    - `total_targets=5`
    - `nmap_attempted_targets=1`
    - `verified_count=1`
    - `failed_count=0`
  - 可达批次复跑（修复前）：`docs/temp/fofa-ollama-naabu-nmap-smoke5-reachable-workflow-rerun/workflow-summary.json`
    - `nmap_attempted_targets=1`
    - `verified_count=1`
  - 可达批次复跑（修复后）：`docs/temp/fofa-ollama-naabu-nmap-smoke5-reachable-workflow-rerun2/workflow-summary.json`
    - `total_targets=5`
    - `nmap_attempted_targets=4`
    - `verified_count=4`
    - `failed_count=0`
- docs updated:
  - `docs/progress.md`
- notes:
  - 当前已完成“发现新问题 -> 定位 -> 修复 -> 复跑验证”闭环
  - 现阶段瓶颈主要仍是目标批次质量差异，不是工作流卡死

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 naabu+nmap 根因分析与有效跑通（smoke5-reachable）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 对 smoke5 失败样本做 raw-evidence 根因分析
  - 在 workflow 中增加 `/api/tags` 回退补证能力（nmap 失败或证据不足时）
  - 以历史强正可达目标执行 smoke5-reachable 验证“有效跑通”
- root cause:
  - `naabu` 在当前环境受 `ipinfo.io` 外联失败影响，经常触发 runner 初始化错误
  - 回退到 `nmap --open` 后可推进流程，但 full nmap 在短超时下经常退出 `124`，只留下启动行证据
  - 原流程对 verified 过度依赖 nmap 输出关键词，导致可达 Ollama 目标未被确认
- tests updated:
  - `tests/repository/fofa-portscan-workflow.spec.ts`
    - 新增用例：`workflow verifies via /api/tags fallback when nmap evidence times out`
- test result: pass（先 RED 后 GREEN）
  - RED：新增用例失败（`http probe fallback should be triggered once`）
  - GREEN：
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-portscan-workflow.spec.ts tests/repository/fofa-mainline-portscan.spec.ts`
    - `npm run test:repo`
- implementation:
  - 更新：`scripts/dev/intel/fofa-portscan-workflow.ts`
    - 新增 `enableHttpProbeFallback` 开关（默认关闭）
    - 新增可注入 `httpProbe`，默认使用 `fetch` + 超时控制
    - 新增 `/api/tags` URL 构建与响应判定（`status=200` 且含 `"models"/ollama`）
    - 当 nmap 非零退出或证据不足时，执行 `/api/tags` 补证并可写入 verified
  - 更新：`scripts/dev/intel/fofa-mainline-portscan.ts`
    - CLI 新增 `--enableHttpProbeFallback`（默认 `true`）
    - 主线运行默认启用补证路径
- execution result:
  - 失败对照批次（旧 smoke5）：`docs/temp/fofa-ollama-naabu-nmap-smoke5-workflow/workflow-summary.json`
    - `verified_count=0`、`failed_count=4`
  - 有效跑通批次（smoke5-reachable）：
    - 输入：`docs/temp/fofa-ollama-naabu-nmap-smoke5-reachable.json`
    - 输出：`docs/temp/fofa-ollama-naabu-nmap-smoke5-reachable-workflow/workflow-summary.json`
    - summary：
      - `total_targets=5`
      - `naabu_success_targets=0`
      - `nmap_attempted_targets=4`
      - `verified_count=4`
      - `candidate_count=5`
      - `failed_count=0`
- docs updated:
  - `docs/progress.md`
- notes:
  - 本次已验证“在 naabu 受限场景下仍可有效产出 verified”的可行路径
  - 下一步建议对新批次继续做目标质量筛选和失败分桶，避免样本中非 11434 噪声目标拉低产出

## 2026-05-25 - REQ-ASSET-SCAN-PORT-007 naabu+nmap 测试门禁补齐与 smoke5 实跑
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将 naabu+nmap workflow 仓库测试纳入根级 `test:repo` 质量门禁
  - 通过 TDD 完成一次 RED -> GREEN（先新增断言，再修复脚本配置）
  - 基于现有 FOFA 候选执行一次 `size=5` 小量实跑并落盘结果
- tests updated:
  - `tests/repository/root-test-entry.spec.ts`
    - 新增断言：`test:repo` 必须包含 `tests/repository/fofa-portscan-workflow.spec.ts`
- test result: pass（先 RED 后 GREEN）
  - RED：`root-test-entry.spec.ts` 失败，提示 `test:repo` 未覆盖 `fofa-portscan-workflow.spec.ts`
  - GREEN：更新后通过
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts tests/repository/fofa-mainline-portscan.spec.ts tests/repository/fofa-portscan-workflow.spec.ts`
    - `npm run test:repo`
- implementation:
  - 更新：`package.json`
    - `test:repo` 新增 `tests/repository/fofa-portscan-workflow.spec.ts`
- execution result (smoke5):
  - 输入：`docs/temp/fofa-ollama-naabu-nmap-smoke5.json`（由 round2 候选裁剪 5 条）
  - 输出目录：`docs/temp/fofa-ollama-naabu-nmap-smoke5-workflow/`
  - summary:
    - `total_targets=5`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=4`
    - `verified_count=0`
    - `candidate_count=5`
    - `failed_count=4`
  - summary file: `docs/temp/fofa-ollama-naabu-nmap-smoke5-workflow/workflow-summary.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - 小量实跑确认工作流可从 naabu 失败分支继续推进到 nmap（回退生效）
  - 当前瓶颈仍在 nmap 阶段失败率与 verified 转化率，下一步应继续做 query 收敛与 nmap 参数治理

## 2026-05-22 - REQ-ASSET-SCAN-PORT-007 样本治理阶段计划文档更新
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将主计划从“继续扩样”明确切换为“先治理后扩容”
  - 补充失败分桶分析、query A/B 收敛、strong_negative 补采、固定评测集与升级门禁
  - 同步修正“正在进行”状态为 `size=50` 受控扩样
- tests added: none（纯文档更新）
- test result: not run（无业务代码变更）
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - round5 到 round9 的核心瓶颈是运输失败占比偏高，当前先执行治理计划，不直接升到 `size=100`

## 2026-05-22 - REQ-ASSET-SCAN-PORT-007 naabu+nmap 接入试运行计划先行更新
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按“先计划后执行”补充 naabu+nmap 接入主线脚本的完整执行方案
  - 明确 Design/Test/Implement/Document/Stop 顺序与 size=50 试运行口径
  - 明确阻塞处理：工具缺失时保留审计证据，不回滚现有主线
- tests added: none（纯文档更新）
- test result: not run（无业务代码变更）
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - 已完成计划先行，下一步进入 TDD 接入实现与 size=50 实测

## 2026-05-22 - REQ-ASSET-SCAN-PORT-007 naabu+nmap 接入主线脚本并完成 size=50 试跑
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 新增主线编排脚本，支持将 task-scan 结果直接接入 naabu+nmap 工作流
  - 通过 TDD 完成接入实现（RED -> GREEN）
  - 执行一次 `size=50` 真实试跑并记录产物
- tests added:
  - `tests/repository/fofa-mainline-portscan.spec.ts`
    - 混合日志输出中的 JSON 解析
    - workflow target 构建与 `target_value` 回退解析
- test result: pass（先 RED 后 GREEN）
  - RED：`ERR_MODULE_NOT_FOUND`（目标接入脚本不存在）
  - GREEN：`node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-mainline-portscan.spec.ts`
- implementation:
  - 新增：`scripts/dev/intel/fofa-mainline-portscan.ts`
    - 读取 task-scan 文件
    - 构建 `runFofaPortscanWorkflow` 目标
    - 提供 shell runner（naabu/nmap 超时控制与退出码落盘）
  - 更新：`package.json`
    - 新增运行命令：`run:fofa:mainline:portscan`
    - `test:repo` 纳入 `fofa-mainline-portscan.spec.ts`
- execution result (size=50):
  - 候选输入：`docs/temp/fofa-ollama-naabu-nmap-round1.json`
  - 工作流摘要：`docs/temp/fofa-ollama-naabu-nmap-round1-workflow-summary.json`
  - summary:
    - `total_targets=50`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=0`
    - `verified_count=0`
    - `candidate_count=50`
- artifacts:
  - `docs/temp/fofa-ollama-naabu-nmap-round1-workflow/exposure-candidates.json`
  - `docs/temp/fofa-ollama-naabu-nmap-round1-workflow/raw-evidence.json`
  - `docs/temp/fofa-ollama-naabu-nmap-round1-workflow/verified-fingerprints.json`
  - `docs/temp/fofa-ollama-naabu-nmap-round1-workflow/workflow-summary.json`
- notes:
  - 当前阻塞来自 naabu 运行环境外部依赖（`Could not create runner: Get https://ipinfo.io/... connection reset by peer`），导致 naabu 全量退出码 `1`，未进入 nmap 阶段
  - 现有主线未回滚；下一步需先解决 naabu 外联依赖/参数策略，再开展 query 收敛对比

## 2026-05-22 - REQ-ASSET-SCAN-PORT-007 naabu ipinfo 外联失败回退修复（TDD）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 修复 naabu 在 `ipinfo` 外联失败时导致工作流无法前进的问题
  - 在不破坏 naabu-first 边界下增加降级回退：
    - 当识别到 `Could not create runner` + `ipinfo.io` 失败时，先用 `nmap --open` 做端口开放检查
    - 命中开放后再执行完整 nmap 证据采集
- tests updated:
  - `tests/repository/fofa-portscan-workflow.spec.ts`
    - 新增用例：`workflow falls back when naabu runner init fails due ipinfo lookup`
- test result: pass（先 RED 后 GREEN）
  - RED：新增回退用例失败（nmap 调用次数为 0）
  - GREEN：`node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-portscan-workflow.spec.ts`
- implementation:
  - 更新：`scripts/dev/intel/fofa-portscan-workflow.ts`
    - 新增 `isNaabuRunnerInitFailure`
    - 新增 `detectOpenPortFromNmapOpenCheck`
    - 新增 naabu 失败后的 nmap open-check 回退路径及计数逻辑
- notes:
  - 代码级回退已生效并通过测试；`size=50` 全量实跑仍需完整跑完后输出最终对比指标

## 2026-05-22 - REQ-ASSET-SCAN-PORT-007 修复后 size=50 round2 实跑结果落盘
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 naabu 回退修复后，完成 `size=50` round2 实跑并读取 workflow summary
- execution result:
  - 输入：`docs/temp/fofa-ollama-naabu-nmap-round2.json`
  - summary:
    - `total_targets=50`
    - `naabu_success_targets=0`
    - `nmap_attempted_targets=46`
    - `verified_count=0`
    - `candidate_count=50`
    - `failed_count=43`
- artifacts:
  - `docs/temp/fofa-ollama-naabu-nmap-round2-workflow-summary.json`
  - `docs/temp/fofa-ollama-naabu-nmap-round2-workflow/workflow-summary.json`
  - `docs/temp/fofa-ollama-naabu-nmap-round2-workflow/raw-evidence.json`
- notes:
  - 回退修复已将流程从“naabu 全量阻断”推进到“可进入 nmap 阶段”（`nmap_attempted_targets=46`）
  - 当前主要瓶颈转为 nmap 阶段失败占比高（`failed_count=43`），下一步应进入 query 收敛与 nmap 超时/并发策略治理

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round4 稳定批次执行
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 继续沿 Ollama 主线执行 size=50 稳定批次
  - 记录本轮 task-scan 与 batch-report 结果作为后续复核输入
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `info=34`、`high=16`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round4.json`
  - `docs/temp/fofa-ollama-smallsize-round4-batch-report.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - 本轮继续证明 Ollama 主模板可稳定产出高风险候选，下一步优先围绕 high 风险任务做 `/api/tags` 复核与样本分层

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round4 high 风险复核与样本扩充
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 仅针对 round4 的 `high` 风险任务执行 `/api/tags` 复核
  - 将满足强正条件的目标继续写入 Ollama 正样本库
- execution result:
  - 复核目标：`16`（来自 round4 的全部 high 风险任务）
  - 强正样本：`16`
  - 强负样本：`0`
  - 运输失败：`0`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round4-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round4-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round4-high-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round4-high-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=16`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s027.json` 到 `samples/assets/fingerprint-positive/ollama.s042.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - round4 的 high 风险任务在本轮复核中全部回证为 Ollama 强正样本，主模板对高风险候选的真阳性质量稳定

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round5 受控扩样执行（high 全量 + info 抽样）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按计划文档新增策略执行 round5（`size=50`）
  - 对 `high` 风险任务做全量 `/api/tags` 复核
  - 对 `info` 风险任务做 10 条抽样复核，用于监控噪声与运输失败占比
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `high=16`、`info=34`
  - review 总量: `26`（high 16 + info 抽样 10）
  - review 分层: `strong_positive=18`、`strong_negative=0`、`transport_failure=8`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round5.json`
  - `docs/temp/fofa-ollama-smallsize-round5-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round5-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round5-info-sample-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round5-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round5-info-sample-review.json`
  - `docs/temp/fofa-ollama-smallsize-round5-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round5-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=18`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s043.json` 到 `samples/assets/fingerprint-positive/ollama.s060.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - high 组强正率 100%（16/16）；info 抽样运输失败占比 80%（8/10），当前不满足放大到 `size=100` 的门槛，应继续保持 `size=50` 并收紧查询或抽样策略

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round6 受控扩样复验（high 全量 + info 抽样）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 延续 round5 策略执行 round6（`size=50`）
  - 保持 high 全量复核 + info 抽样 10 条复核
  - 继续以三分类准入规则执行样本同步
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `high=16`、`info=34`
  - review 总量: `26`（high 16 + info 抽样 10）
  - review 分层: `strong_positive=18`、`strong_negative=0`、`transport_failure=8`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round6.json`
  - `docs/temp/fofa-ollama-smallsize-round6-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round6-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round6-info-sample-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round6-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round6-info-sample-review.json`
  - `docs/temp/fofa-ollama-smallsize-round6-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round6-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=18`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s061.json` 到 `samples/assets/fingerprint-positive/ollama.s078.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - 连续两轮结果一致：high 组强正率稳定为 100%，但 info 抽样运输失败占比仍为 80%，当前仍不满足升到 `size=100` 的门槛

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round7 受控扩样延续（high 全量 + info 抽样）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 继续按 round5/round6 的受控策略执行 round7（`size=50`）
  - 保持 high 全量复核 + info 抽样 10 条
  - 仅同步 strong_positive/strong_negative，运输失败不入库
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `high=16`、`info=34`
  - review 总量: `26`（high 16 + info 抽样 10）
  - review 分层: `strong_positive=17`、`strong_negative=0`、`transport_failure=9`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round7.json`
  - `docs/temp/fofa-ollama-smallsize-round7-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round7-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round7-info-sample-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round7-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round7-info-sample-review.json`
  - `docs/temp/fofa-ollama-smallsize-round7-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round7-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=17`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s079.json` 到 `samples/assets/fingerprint-positive/ollama.s095.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - 与 round6 相比，strong_positive 由 18 降至 17，运输失败由 8 升至 9，当前质量门槛仍不足以放大到 `size=100`

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round8 受控扩样延续（high 全量 + info 抽样）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按既定策略继续执行 round8（`size=50`）
  - high 全量复核 + info 抽样 10 条复核
  - 按三分类准入规则同步样本
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `high=16`、`info=34`
  - review 总量: `26`（high 16 + info 抽样 10）
  - review 分层: `strong_positive=17`、`strong_negative=0`、`transport_failure=9`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round8.json`
  - `docs/temp/fofa-ollama-smallsize-round8-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round8-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round8-info-sample-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round8-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round8-info-sample-review.json`
  - `docs/temp/fofa-ollama-smallsize-round8-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round8-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=17`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s096.json` 到 `samples/assets/fingerprint-positive/ollama.s112.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - round7 与 round8 均为 `17/26` strong_positive、`9/26` transport_failure，当前仍不满足升到 `size=100` 的门槛

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round9 受控扩样延续（high 全量 + info 抽样）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 延续受控扩样策略执行 round9（`size=50`）
  - high 全量复核 + info 抽样 10 条复核
  - 按三分类准入执行样本同步
- execution result:
  - query: `app="Ollama" && is_domain=false && country="CN"`
  - task-scan: `fetched=50`、`created=50`
  - batch-report: `finished=50`、`failed=0`
  - byRiskLevel: `high=16`、`info=34`
  - review 总量: `26`（high 16 + info 抽样 10）
  - review 分层: `strong_positive=16`、`strong_negative=0`、`transport_failure=10`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round9.json`
  - `docs/temp/fofa-ollama-smallsize-round9-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round9-high-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round9-info-sample-targets.json`
  - `docs/temp/fofa-ollama-smallsize-round9-high-review.json`
  - `docs/temp/fofa-ollama-smallsize-round9-info-sample-review.json`
  - `docs/temp/fofa-ollama-smallsize-round9-verified.json`
  - `docs/temp/fofa-ollama-smallsize-round9-negative-review.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 同步结果：`verifiedWritten=16`、`negativeWritten=0`
  - 正样本新增范围：`samples/assets/fingerprint-positive/ollama.s113.json` 到 `samples/assets/fingerprint-positive/ollama.s128.json`
- docs updated:
  - `docs/progress.md`
- notes:
  - 相比 round7/round8，round9 强正数继续下降、运输失败继续上升，扩样质量未改善，仍不满足升到 `size=100` 的门槛

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 三目标旁线验证收口，恢复 Ollama 主线
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将 Langflow / AutoGPT / OpenClaw 的 query 验证明确标记为旁线实验
  - 恢复 Ollama 为当前唯一主线，避免后续继续分叉推进
  - 保持现有 Ollama 样本库与小批次验证节奏
- tests added: none（纯文档更新）
- test result: not run（无业务代码变更）
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - 本轮旁线复核显示三目标均未产出 strong_positive，后续优先回到 Ollama 专项收紧 query 与复核门槛

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 非 Ollama Query 设计文档化
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将工作重点从 Ollama 扩展到 Langflow/AutoGPT/OpenClaw 的 query 设计
  - 固化 T1/T2/T3 分层模板和切换门槛
  - 明确每轮输出文件命名规范，保证可复盘
- tests added: none（纯文档更新）
- test result: not run（无业务代码变更）
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/temp/asset-scan-port-scan-v1.md`
  - `docs/progress.md`
- notes:
  - 当前输出为首版查询草案，后续将通过小批次 round1 实测再收敛

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama size=50 扩容与强正样本入库
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将主模板从 size=20 提升到 size=50 做扩容验证
  - 对 batch-report 中的 info 风险任务继续做 `/api/tags` 复核
  - 将满足强正条件的样本写入长期样本库
- execution result:
  - 扩容批次：`fetched=50`、`created=50`、`finished=50`、`failed=0`
  - 风险分布：`info=34`、`high=16`
  - info 复核：`34` 个目标中 `12` 条强正、`0` 条强负、`22` 条运输失败
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round3.json`
  - `docs/temp/fofa-ollama-smallsize-round3-batch-report.json`
  - `docs/temp/fofa-ollama-smallsize-round3-info-review.json`
  - `docs/temp/fofa-ollama-smallsize-round3-verified.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 已将 12 条强正样本同步到 `samples/assets/fingerprint-positive/`
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - size=50 仍然稳定，可继续使用该区间做 Ollama 强正样本扩容；强负样本仍未形成，需要后续专门补采

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round2 强正样本复核并入库
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 对 round2 中非 11434 的命中目标做 `/api/tags` 复核
  - 将满足三分类强正条件的样本写入长期样本库
- execution result:
  - 复核目标：`12`
  - 强正样本：`5`
  - 强负样本：`0`
  - 运输失败：`7`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round2-negative-review.json`
  - `docs/temp/fofa-ollama-smallsize-round2-verified.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 已将 5 条强正样本同步到 `samples/assets/fingerprint-positive/`
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - round2 进一步证明小批量主模板可稳定产出可用强正样本，但强负样本仍需后续专门补采

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round1 强正样本复核并入库
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 对 round1 主模板结果中 11434 目标做 `/api/tags` 复核
  - 将满足三分类强正条件的样本写入长期样本库
- execution result:
  - 复核目标：`8`
  - 强正样本：`8`
  - 强负样本：`0`
  - 运输失败：`0`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round1-verified.json`
- implementation:
  - `scripts/dev/intel/fofa-fingerprint-library-sync.ts` 已将 8 条强正样本同步到 `samples/assets/fingerprint-positive/`
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - round1 说明主模板可稳定拿到 Ollama 强正样本，但强负样本还需通过后续轮次继续采集

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama 主模板小批次执行 round1（size=20）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按计划执行 Ollama 主模板小批次任务创建与批量结果汇总
  - 记录 round1 运行结果作为后续强样本复核输入
- execution result:
  - query：`app="Ollama" && is_domain=false && country="CN"`
  - task-scan：`fetched=20`、`created=20`
  - batch-report：`finished=20`、`failed=0`
  - byRiskLevel：`info=12`、`high=8`
- artifacts:
  - `docs/temp/fofa-ollama-smallsize-round1.json`
  - `docs/temp/fofa-ollama-smallsize-round1-batch-report.json`
- docs updated:
  - `docs/plans/fofa-scan-plan.md`
  - `docs/progress.md`
- notes:
  - 本轮仅执行主模板与结果汇总，下一步进入强样本复核与入库

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 强样本准入规则执行（仅 Ollama）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在样本入库同步脚本中落实三分类准入：强正样本、强负样本、运输失败样本
  - 明确运输失败样本（timeout/refused/tls）不得进入正负样本库
  - 强正样本必须满足非空 `response_body_excerpt`
- tests updated:
  - `tests/repository/fofa-fingerprint-library-sync.spec.ts`
    - 新增用例：仅写入强样本并排除运输失败
    - 调整旧用例夹具以满足新准入规则
- test result: pass（先 RED 后 GREEN）
  - RED: 新增用例失败，实测出现弱样本被写入（`3 !== 1`）
  - GREEN:
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-fingerprint-library-sync.spec.ts`
- implementation:
  - 更新 `scripts/dev/intel/fofa-fingerprint-library-sync.ts`
    - 增加 `isStrongPositive`、`isStrongNegative`、`isTransportFailure` 过滤
    - 正负样本写入前先按准入规则筛选
    - 正样本 `response_body_excerpt` 从输入透传并截断到 512
    - 负样本优先使用 `exclusion_reason`
- docs updated:
  - `docs/progress.md`
- notes:
  - 本次仅执行规则准入，不扩展到其他 probeTargetId

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama 样本库入库同步（naabu+nmap 复核产物）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 新增 Ollama 样本库同步脚本，将 verified/negative_or_pending 结果写入标准样本库目录
  - 仅处理 Ollama，保持现有最小闭环，不扩展到其他 probeTargetId
- tests added:
  - `tests/repository/fofa-fingerprint-library-sync.spec.ts`
- test result: pass（先 RED 后 GREEN）
  - RED: 目标脚本不存在（`ERR_MODULE_NOT_FOUND`）
  - GREEN:
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-fingerprint-library-sync.spec.ts`
- implementation:
  - 新增 `scripts/dev/intel/fofa-fingerprint-library-sync.ts`
  - 执行同步：verified 写入 16 条，negative 写入 4 条
  - 产出目录：
    - `samples/assets/fingerprint-positive/`（新增 `ollama.s002.json` 到 `ollama.s017.json`）
    - `samples/assets/fingerprint-negative/`（新增 `ollama.neg.n010.json` 到 `ollama.neg.n013.json`）
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 之前未开始“入库”是因为此前阶段聚焦查询稳定性与候选转化验证，工作流仅导出到 `docs/temp/`，尚未实现样本库同步脚本

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama 样本分层落盘（仅 Ollama）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 仅处理 Ollama app 查询复核结果，拆分 verified 与 negative_or_pending 样本
  - 产出可直接用于后续规则/样本维护的分层文件
- execution result:
  - source report：`docs/temp/fofa-day2-q5-ollama-verify-report.json`
  - total checked：20
  - verified：16
  - negative_or_pending：4
  - conversion_rate：80.0%
- artifacts:
  - `docs/temp/fofa-ollama-verified-candidates.json`
  - `docs/temp/fofa-ollama-negative-or-pending.json`
  - `docs/temp/fofa-ollama-processing-summary.json`
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 当前阶段仅聚焦 Ollama；未推进其他 probeTargetId

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama 下一轮查询模板固化（仅 Ollama）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 基于 verified 与 negative_or_pending 样本统计，生成下一轮 Ollama 查询模板
  - 明确主模板/稳定模板/回溯模板的使用方式
- analysis basis:
  - verified 端口分布：11434 为主（10/16），其余为少量离散端口
  - verified 协议分布：http 13、https 3
  - negative_or_pending：4 条，均为连接失败类（timeout 或 refused）
- artifacts:
  - `docs/temp/fofa-ollama-next-query-templates.md`
  - `docs/temp/fofa-ollama-verified-candidates.json`
  - `docs/temp/fofa-ollama-negative-or-pending.json`
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 当前样本量下不引入硬编码端口黑名单，先采用协议分批模板验证稳定性

## 2026-05-09 - REQ-ASSET-SCAN-PORT-007 Ollama round2 试跑与回退决策（仅 Ollama）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按新模板执行 Ollama round2 小批次
  - 记录 protocol 分拆模板与主模板重试结果
- execution result:
  - protocol 分拆模板：
    - `app="Ollama" && is_domain=false && country="CN" && protocol="http"` -> fetched 0
    - `app="Ollama" && is_domain=false && country="CN" && protocol="https"` -> fetched 0
  - 主模板重试 3 次：均为 `fetch failed`
- diagnostics:
  - FOFA 主站连通性正常（`https://en.fofa.info` 可访问）
  - Node 直连 FOFA API 主机可达（状态 200）
- artifacts:
  - `docs/temp/fofa-ollama-round2-http.json`
  - `docs/temp/fofa-ollama-round2-https.json`
  - `docs/temp/fofa-ollama-round2-http-verify.json`
  - `docs/temp/fofa-ollama-round2-https-verify.json`
  - `docs/temp/fofa-ollama-round2-comparison.json`
  - `docs/temp/fofa-ollama-round2-baseline.retry1.json`
  - `docs/temp/fofa-ollama-round2-baseline.retry2.json`
  - `docs/temp/fofa-ollama-round2-baseline.retry3.json`
- decision:
  - 回退到 app 主模板作为唯一默认路径
  - protocol 分拆模板暂不默认启用，待 FOFA 返回稳定后再评估

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 Day 2 批次执行完成（Q4/Q3/Q5 + app 查询策略）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 将 Ollama FOFA 默认查询切换为 `app="Ollama" && is_domain=false`
  - 执行 Day 2 三个批次：Q4（openclaw-gateway）、Q3（autogpt）、Q5（ollama refined）
  - 生成批次汇总并落盘到 `docs/temp/`
- tests updated:
  - `tests/repository/fofa-api-task-scan.spec.ts`（默认查询断言对齐 app 查询）
- test result: pass（FOFA 脚本与查询基线）
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-api-task-scan.spec.ts`
- execution result: pass
  - Day 2 共创建任务 60 条（Q4/Q3/Q5 各 20）
  - batch-report：`finished=60`
  - 风险分布：`info=50`、`high=10`
  - Q5 `/api/tags` 复核：20 个 candidate 中 16 个满足 `status=200 + models`
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- artifacts:
  - `docs/temp/fofa-day2-q4-openclaw.json`
  - `docs/temp/fofa-day2-q3-autogpt.json`
  - `docs/temp/fofa-day2-q5-ollama-refined.json`
  - `docs/temp/fofa-day2-batch-report.json`
  - `docs/temp/fofa-day2-q5-ollama-verify-report.json`
- notes:
  - 3000 端口由现有 backend 实例占用，复用健康实例继续执行
  - 后续需进入“候选 -> 已验证”复核阶段（`/api/tags` + `models`）

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 Ollama 查询策略对比（仅 Ollama）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 仅针对 Ollama 比较端口查询与 app 查询的 candidate -> verified 转化效果
  - 统一使用 `/api/tags` + `models` 作为 verified 判定标准
- execution result:
  - 端口查询 `port="11434" && protocol="http"`：verified 0/20（0.0%）
  - app 查询 `app="Ollama" && is_domain=false && country="CN"`：verified 16/20（80.0%）
- artifacts:
  - `docs/temp/fofa-day1-q1-ollama-verify-report.json`
  - `docs/temp/fofa-day2-q5-ollama-verify-report.json`
  - `docs/temp/fofa-ollama-query-comparison.json`
- decision:
  - 后续 Ollama 主查询固定为 app 查询路径；端口查询不再作为主入口

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 工作流脚本 RED->GREEN（naabu+nmap + 样本分层导出）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 新增统一工作流脚本 `fofa-portscan-workflow`，落地 naabu-first 与 nmap-on-hit-only 执行边界
  - 新增样本导出脚本 `fofa-sample-export`，落地候选/已验证/原始证据三层分离
  - 新增 repository 级测试，覆盖执行分层、失败审计与样本分层写盘
- tests added:
  - `tests/repository/fofa-portscan-workflow.spec.ts`
  - `tests/repository/fofa-sample-export.spec.ts`
- test result: pass（先 RED 后 GREEN）
  - RED: `ERR_MODULE_NOT_FOUND`（目标脚本未实现）
  - GREEN:
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-portscan-workflow.spec.ts tests/repository/fofa-sample-export.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - 当前实现为 requirement 最小闭环，不扩展到分布式调度、数据库迁移与前端改造
  - 下一步执行应继续按当前 requirement 计划推进批次复跑与证据复核

## 2026-04-30 - REQ-ASSET-INTEL-006 六步流程最小实现收敛版
- requirement: 基于现有 FOFA CSV 数据实现资产测绘六步流程最小可测试模型，并输出符合 `资产测绘_指纹整理` 的最小结构
- scope:
  - 保留 `scripts/dev/intel/fofa-six-step-minimal.ts`，实现 Step1~Step6 的最小闭环
  - 复用 `scripts/dev/intel/oss-port-collector.ts` 做 Naabu 验活
  - 删除与当前最小 requirement 无关的新增 FOFA 辅助脚本与简单测试
- tests added:
  - `tests/repository/fofa-six-step-minimal.spec.ts`
- test result: pass
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-six-step-minimal.spec.ts`
  - `npm run test:repo`
- docs updated:
  - `docs/progress.md`
- notes:
  - 实际 CSV 跑批受网络可达性影响，可能出现 `step2_live_targets=0`
  - 该版本定位为最小模型，便于后续接入真实探针编排与风险规则扩展

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 文档修改阶段收口（计划对齐）
- requirement: 先完善对应文档，清理矛盾与不需要项
- scope:
  - 在主计划文档中新增 naabu+nmap 工作流脚本的完整实施计划（Design/Test/Implement/Document/Stop）
  - 补充统一 JSON 样本输出规范与拟修改文件清单
  - 清理 `sprint-current` 中失效的 Related Plan 路径引用
  - 更新 FOFA 总览页的下一步执行清单，切换到“文档完善 -> RED 测试 -> 实现”阶段
- tests added: none（纯文档变更）
- test result: not run（无业务代码改动）
- docs updated:
  - `docs/temp/asset-scan-port-scan-v1.md`
  - `docs/sprint-current.md`
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 已删除失效计划路径与职责冲突描述，后续可直接进入脚本 RED 用例编写

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 Day 1 扫描执行启动（运行记录）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 按第一阶段扫描计划启动 Day 1 批次执行
  - 实际完成 Q1（ollama）与 Q2（langflow）两个批次
  - 保存批次结果到 `docs/temp/` 并完成 batch-report 汇总
- tests added: none（运行执行记录）
- test result: execution pass（Day 1 已执行部分）
  - Q1：20 fetched / 20 created
  - Q2：20 fetched / 20 created
  - batch-report：40 total / 40 finished / 0 findings
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 计划基线为 `size=200`，但实际执行中 `size=200` 出现过 `fetch failed`
  - 当前先以 `size=20` 建立稳定基线，后续再逐步提升到 100 或 200

## 2026-05-08 - FOFA 扫描总览文档去无关重构（文档）
- requirement: 仅保留当前 FOFA 扫描全计划总览，删除无关信息
- scope:
  - 将 `docs/plans/plan-overview.md` 重构为 FOFA 扫描专项总览
  - 删除泛项目阶段、前端/架构等非当前扫描执行信息
  - 对齐当前扫描设计文档路径为 `docs/temp/asset-scan-port-scan-v1.md`
- tests added: none（纯文档变更）
- test result: not run（无业务代码改动）
- docs updated:
  - `docs/plans/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 本页后续仅维护 FOFA 批次执行、验收、阻塞与回退规则

## 2026-05-08 - 计划总览文档重构（文档）
- requirement: 为当前仓库重构一份简洁的计划总览与当前 focus 文档
- scope:
  - 新增单页总览文档，统一收口“全局计划、当前 requirement、当前 focus、阶段成果、下一步、风险”
  - 作为计划入口，减少在多个文档之间来回切换的成本
- tests added: none（纯文档变更）
- test result: not run（无业务代码改动）
- docs updated:
  - `docs/plan-overview.md`
  - `docs/progress.md`
- notes:
  - 本次重构不改变现有 requirement 与执行策略，仅优化项目管理可读性

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 第一阶段扫描设计蓝图（文档）
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 基于项目总计划与当前 requirement 约束，新增第一阶段扫描执行蓝图
  - 固化 Go/No-Go 准备完成定义、首批 query 包、S 档参数基线、2 天执行节奏与验收指标
  - 保持当前阶段不引入分布式扫描与数据库迁移的边界
- tests added: none（纯文档设计变更）
- test result: not run（无业务代码改动）
- docs updated:
  - `docs/plans/asset-scan-port-scan-v1.md`
  - `docs/progress.md`
- notes:
  - 第一阶段采用“小批量、强留痕、可复跑”策略，为后续受控扩容提供参数与 query 基线

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 资产扫描公网治理参数最小落地
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `asset_scan` 任务创建路径加入治理参数规范化：预算、限速、审计字段
  - 保持 `static_analysis` 与 `sandbox_run` 的参数行为不变
  - API 集成层补充 `POST /api/tasks` 后可回读规范化参数的契约校验
- tests added:
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern="backend task center normalizes asset-scan governance and audit fields through POST /api/tasks" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - 预算字段在创建阶段执行最小值与上限归一化，避免无效输入直接进入执行链路
  - 审计字段自动补齐 `requested_at`，并映射 `requested_by/query/source`
  - 全量 integration 套件中仍存在 semgrep 环境依赖项（`semgrep` 二进制缺失）导致的非本变更失败

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 执行上下文与中断原因结果落盘
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `asset_scan` 任务参数中归一化 `audit.interruption_reason`
  - 在 `asset_scan` 结果 `details.execution_context` 中持久化预算、限速与审计快照
  - 共享契约层补充 `execution_context` 与 `interruption_reason` 的标准化保留规则
- tests added:
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- tests updated:
  - `shared/tests/result-contract.spec.ts`
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern="backend task center persists asset-scan execution context and interruption reason in result details" tests/integration/backend-task-center.api.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/result-contract.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `interruption_reason` 枚举：`none` / `budget` / `timeout` / `manual_stop`
  - 当输入缺失或非法时，默认落盘为 `none`

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 asset_scan 失败回填与 bridge 执行上下文打通
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `TaskCenterService` 中为 `asset_scan` 增加初始执行失败回填，避免直接抛错中断任务记录
  - 在 `TaskEngineService` 中新增 `createFailedAssetScanArtifacts`，统一 `failed` 结果壳与风险汇总
  - 在 `engines/asset-scan` bridge 中导出并启用 `buildExecutionContextFromTask`，使引擎输出链路原生携带 `execution_context`
- tests added:
  - `tests/repository/asset-scan-bridge.execution-context.spec.ts`
  - `backend/tests/task-center.service.spec.ts`（新增 asset_scan 初始失败回填场景）
- tests updated:
  - `package.json`（`test:repo` 纳入 bridge execution_context 测试）
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern='backend task center persists asset-scan execution context and interruption reason in result details|backend task center normalizes asset-scan governance and audit fields through POST /api/tasks' tests/integration/backend-task-center.api.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/result-contract.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/asset-scan-bridge.execution-context.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `asset_scan` 初始执行失败将回填 `failed` 任务壳，且保留 `execution_context.audit.interruption_reason`
  - bridge 侧默认将非法中断原因归一化为 `none`
  - 当参数中的中断原因为默认 `none` 时，平台会优先基于错误语义推断（如 `timeout`、`budget`）

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 asset_scan partial_success 状态回填
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 为 `asset_scan` completed 工件增加 `finished` / `partial_success` 状态派生
  - 当 `details.execution_context.audit.interruption_reason` 为非 `none` 时，将 `task/result/risk-summary` 统一回填为 `partial_success`
  - 保持 `failed` 回填与纯完成态 `finished` 语义不变
- tests added:
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern='backend task center persists asset-scan execution context and interruption reason in result details|backend task center normalizes asset-scan governance and audit fields through POST /api/tasks|partial_success asset-scan result' tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - 当前 `partial_success` 的判定依赖 `execution_context.audit.interruption_reason`
  - 这一步先收口平台回填语义，尚未继续下沉到 L1/L2/L3 执行层的中断事件源

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 执行层 interruption_reason 下沉到 runtime/bridge
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `engines/asset-scan` runtime 中根据 `execution_context.audit.interruption_reason` 派生 `finished` / `partial_success`
  - 在 bridge 中合并 task 参数与 runtime `execution_context` 时，保留 runtime 产生的非 `none` 中断原因
  - 在 task-center 中避免参数默认 `none` 覆盖引擎返回的 `timeout`/`budget` 语义
- tests added:
  - `tests/repository/asset-scan-runtime.interruption-reason.spec.ts`
  - `tests/repository/asset-scan-bridge.execution-context.spec.ts`（新增 runtime 保留场景）
  - `backend/tests/task-center.service.spec.ts`（新增引擎侧中断原因保留场景）
- tests updated:
  - `package.json`（`test:repo` 纳入 runtime interruption-reason 测试）
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/asset-scan-runtime.interruption-reason.spec.ts tests/repository/asset-scan-bridge.execution-context.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern='preserves engine-derived interruption reason|partial_success asset-scan result|persists asset-scan execution context and interruption reason' backend/tests/task-center.service.spec.ts tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - 当前已打通 runtime -> bridge -> task-center 的 interruption_reason 传递链路
  - 这一步仍是最小语义下沉，尚未在真实 naabu/nmap/L3 probe 中细分不同步骤的预算耗尽或局部超时事件

## 2026-05-08 - REQ-ASSET-SCAN-PORT-007 runtime 异常错误处理与脚本测试执行
- requirement: 端口扫描执行策略与结果落盘闭环（阶段 H）
- scope:
  - 在 `runAssetScanTask` 的异常分支中将错误语义映射到 `execution_context.audit.interruption_reason`
  - 支持最小映射：`timeout`、`budget`，其余错误回退 `none`
  - 继续保持 runtime -> bridge -> task-center 的 interruption_reason 合并与回填一致性
  - 按照当前阶段要求执行 dev 脚本入口验证与测试回归
- tests added:
  - `tests/repository/asset-scan-runtime.interruption-reason.spec.ts`（新增 runtime 抛错映射场景）
- test result: pass（本 requirement 聚焦验证集）
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/asset-scan-runtime.interruption-reason.spec.ts tests/repository/asset-scan-bridge.execution-context.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern='marks asset-scan as partial_success|preserves engine-derived interruption reason|partial_success asset-scan result|persists asset-scan execution context and interruption reason|runtime records timeout interruption reason when pipeline throws timeout error' backend/tests/task-center.service.spec.ts tests/integration/backend-task-center.api.spec.ts tests/repository/asset-scan-runtime.interruption-reason.spec.ts`
  - `npm run test:repo`
- scripts run:
  - `npm run run:fofa:api:task-scan -- --help`
  - `npm run run:fofa:task-batch-report -- --help`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - runtime 抛错测试会打印预期的 `[Engine Error]` 日志，这是当前测试夹具用于触发异常分支的正常现象

## 2026-04-11 - REQ-ASSET-PROBE-004 backend probe/scoring migration to engine
- requirement: keep backend as orchestrator and migrate asset-scan probe/scoring execution to engine runtime with process bridge invocation
- scope:
  - migrated backend source-of-truth logic into `engines/asset-scan/src/runtime/*`
  - added engine bridge entry `engines/asset-scan/src/bridge/scan-task.ts`
  - switched backend `AssetScanTaskAdapter` to engine-client delegation only
  - added process engine client in backend adapter layer
- tests added:
  - `backend/tests/asset-scan.engine-client.spec.ts`
  - `engines/asset-scan/tests/scan-task.bridge.spec.ts`
- tests updated:
  - `backend/tests/task-engine.service.spec.ts` (asset result target assertion aligned to bridge JSON behavior)
- test result: pass
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/asset-scan.engine-client.spec.ts engines/asset-scan/tests/scan-task.bridge.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-engine.service.spec.ts tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/progress.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/sprint-current.md`
- notes:
  - migration keeps `sample_ref` and `live probe` external behavior unchanged while moving execution into engine
  - conflict resolution policy followed: backend behavior precedence on probe/scoring semantics
  - backend runtime path now orchestrates and delegates to engine bridge; no local probe/scoring execution in `AssetScanTaskAdapter`

## 2026-04-13 - REQ-ASSET-PROBE-005 probe test ownership relocation to engine suite
- requirement: move dynamic probe behavior tests to engine-owned test suite while keeping backend tests focused on orchestration and contract boundaries
- scope:
  - added `engines/asset-scan/tests/asset-probe.runtime.spec.ts` with live HTTP/WS probe coverage for langflow, ollama (port hint), and openclaw-gateway
  - removed duplicated live probe behavior tests from `backend/tests/task-engine.service.spec.ts`
  - updated root script `test:engine:asset-scan` to include the new probe runtime test file
- tests added:
  - `engines/asset-scan/tests/asset-probe.runtime.spec.ts`
- tests updated:
  - `backend/tests/task-engine.service.spec.ts`
  - `package.json`
- test result: pass
  - `npm run test:engine:asset-scan`
  - `npm run test:backend`
  - `npm run test`
- docs updated:
  - `docs/progress.md`
- notes:
  - engine now owns probe behavior verification; backend keeps delegation/orchestration checks and API integration checks
  - no probe algorithm change was introduced in this requirement; this is a test-layer ownership correction

## 2026-04-01 - skills-static platform-compatible DTO / interface and minimal adapter mapping skeleton
- requirement: add `skills-static`-compatible shared DTOs/interfaces and the smallest backend adapter mapping boundary without changing the public task-center API
- scope: introduce shared `skills-static` result/parameter/target/rule-hit types, narrow `static_analysis.details.rule_hits[]`, add a backend mapper from placeholder engine output into shared details, and keep `POST /api/tasks` as the only public creation entry
- tests:
  - `shared/tests/result-contract.spec.ts`
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass for the requirement-focused verification set:
  - `npm.cmd run test:shared`
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "engine adapters expose stable dispatch placeholders|skills-static adapter maps engine output into base-result compatible details without introducing risk_score|task engine service maps tasks into initial result and risk summary shells without leaking engine internals" backend/tests/task-engine.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - public API routes remain unchanged; `static_analysis` still enters through `POST /api/tasks`
  - shared now provides named `skills-static` contract types instead of leaving `static_analysis.rule_hits` as `unknown[]`
  - backend `skills-static` adapter now owns a minimal engine-result-to-details mapper but still does not execute real scans
  - while verifying, the workspace initially lacked the locked `yaml` dependency in `node_modules`; it was restored with `corepack pnpm install --frozen-lockfile` before rerunning tests

## 2026-03-26 - metadata baseline template
- requirement: add a root-level `metadata.md` template
- scope: define project positioning, architecture boundaries, directory ownership, TDD baseline, skill usage rules, and change guardrails
- tests: none; this was a documentation/configuration requirement with no business logic
- result: created `metadata.md` and recorded this requirement in `docs/progress.md`
- docs updated:
  - `metadata.md`
  - `docs/progress.md`
- notes:
  - future business requirements can now follow both `AGENTS.md` and `metadata.md`
  - `package manager`, `Node.js version`, `database/storage`, and `auth/authz` are still pending decisions

## 2026-03-26 - REQ-01 shared contracts and test baseline
- requirement: `REQ-01` 共享契约与测试基线
- scope: add root workspace baseline, freeze the first shared-engineering baseline, and implement shared task/result/api-response contracts with runtime normalization
- tests:
  - `shared/tests/task-contract.spec.ts`
  - `shared/tests/api-response.contract.spec.ts`
  - `shared/tests/result-contract.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/task-contract.spec.ts shared/tests/api-response.contract.spec.ts shared/tests/result-contract.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - shared now provides the first source of truth for `Task`, `BaseResult`, `RiskSummary`, and `ApiResponse`
  - current skeleton baseline is frozen as `pnpm workspace`, `Node.js 22.17.0`, and `TypeScript strict`
  - next requirement should build on these contracts instead of redefining local DTOs in `backend` or `frontend`

## 2026-03-26 - REQ-02 minimal backend task center
- requirement: `REQ-02` 后端最小任务中枢
- scope: add a NestJS-style backend skeleton with controller/service/repository separation, in-memory task storage, health check, generic task creation, task query, result query, risk summary query, and engine adapter placeholders
- tests:
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - backend now exposes `GET /health`, `POST /api/tasks`, `GET /api/tasks`, `GET /api/tasks/:taskId`, `GET /api/tasks/:taskId/result`, and `GET /api/tasks/:taskId/risk-summary`
  - task center keeps `module/controller/service/repository` boundaries while staying decoupled from real engine execution
  - current implementation materializes initial `BaseResult` and `RiskSummary` placeholders in memory when a task is created

## 2026-03-26 - REQ-03 frontend console shell and overview
- requirement: `REQ-03` 前端最小后台 layout 与 Overview page
- scope: add a React + TypeScript + Ant Design frontend shell, stable admin-console routing, overview workspace panels, placeholder pages for future task/result routes, and frontend rendering tests
- tests:
  - `frontend/src/app/app-shell.spec.tsx`
  - `frontend/src/layouts/console-menu.spec.tsx`
  - `frontend/src/pages/overview.page.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend`
- docs updated:
  - `README.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - frontend now exposes a stable control-plane shell for future Tasks and Task Detail work
  - overview, task queue, task detail, and result routes all sit behind one reusable layout
  - overview uses shared `TaskStatus` and `RiskLevel` driven mock view models instead of introducing frontend-private enums

## 2026-03-26 - REQ-04 frontend tasks page
- requirement: `REQ-04` frontend Tasks page
- scope: replace the `/tasks` placeholder with a minimal queue workspace, add a thin frontend task service, keep the list aligned to shared task contracts, and preserve a stable entry into `/tasks/:taskId`
- tests:
  - `frontend/src/pages/tasks.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - Tasks page now renders a minimal operator-facing table with `task_id`, `task_type`, `status`, `risk_level`, and `created_at`
  - the frontend service prefers the existing `GET /api/tasks` contract and falls back to local mock rows when the backend is unavailable
  - each row now exposes a stable detail-route entry point so the next requirement can deepen `/tasks/:taskId` without rewriting the list shell

## 2026-03-26 - REQ-05 frontend task detail page
- requirement: `REQ-05` frontend Task detail page
- scope: replace the `/tasks/:taskId` placeholder with a stable detail workspace, add a shared task overview section, map `task_type` to three result sections, and fall back cleanly when result details are missing
- tests:
  - `frontend/src/pages/task-detail.page.spec.tsx`
  - `frontend/src/pages/tasks.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - Task detail now has one shared information area plus three task-type-specific result placeholders: asset scan, static analysis, and sandbox alerts
  - the detail service fetches `/api/tasks/:taskId` and `/api/tasks/:taskId/result` in parallel, then falls back to local mocks when the backend is unavailable
  - missing or empty `details` no longer breaks the page; the result region stays structurally stable and shows a unified fallback message instead

## 2026-03-26 - REQ-06 frontend-backend task integration loop
- requirement: `REQ-06` frontend Tasks page and Task detail page backend integration
- scope: connect frontend services to the existing backend tasks API, normalize API payloads through shared contracts, add a visible backend-vs-mock data source indicator, and extend Task detail to read `result` plus `risk-summary`
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the frontend list route now reads `GET /api/tasks` through a shared-contract-aware service instead of depending only on static page mocks
  - the frontend detail route now reads `GET /api/tasks/:taskId`, `GET /api/tasks/:taskId/result`, and `GET /api/tasks/:taskId/risk-summary`
  - local frontend development now proxies `/api` to the backend on `127.0.0.1:3000`, while service-level fallback keeps isolated frontend work possible when the backend is offline

## 2026-03-26 - backend engine adapter baseline
- requirement: backend engine adapter/service integration points
- scope: keep the public task-center API unchanged, add a stable internal handoff from `Task` to engine adapters, and centralize initial `BaseResult` / `RiskSummary` creation behind a dedicated service
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
- test result: pass; `cmd /c npm run test:backend` and `cmd /c npm run test`
- docs updated:
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - backend now uses `TaskEngineService` as the stable platform-to-engine handoff point instead of letting `TaskCenterService` manage adapter details directly
  - each adapter now reserves both dispatch-payload creation and initial result-detail creation for `asset-scan`, `skills-static`, and `sandbox`
  - future engine submit/poll/callback logic can extend `TaskEngineService` and adapter implementations without changing the current public task APIs

## 2026-03-26 - frontend data source state refinement
- requirement: refine frontend integration state from `api/mock` into `api/degraded/mock`
- scope: keep the existing tasks pages and backend API unchanged, but make partial contract failures visible instead of silently presenting them as healthy backend data
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/services/task-service.spec.ts src/pages/tasks.page.spec.tsx src/pages/task-detail.page.spec.tsx` and `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - frontend services now distinguish between fully valid backend responses, partially degraded backend responses, and pure mock fallback
  - invalid rows in `GET /api/tasks` now keep valid rows but surface a degraded state instead of silently claiming full backend health
  - task detail now marks the page as degraded when `task` exists but `result` or `risk-summary` must be synthesized locally

## 2026-03-26 - frontend integration error visibility
- requirement: fix the must-fix review issue where contract-invalid backend responses were still shown as healthy backend integration
- scope: keep the current backend routes and page structure unchanged, but distinguish contract-invalid API responses from backend-unavailable mock fallback
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/services/task-service.spec.ts src/pages/tasks.page.spec.tsx src/pages/task-detail.page.spec.tsx`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `integration-error` now means the backend answered but failed shared contract normalization on one or more required payloads
  - `degraded` remains reserved for pages that can still render from a valid backend `Task` while synthesizing missing dependent payloads
  - frontend mock fallback no longer masquerades as healthy backend API data when the backend response shape drifts from the shared contract

## 2026-03-26 - repository full-stack test gate
- requirement: fix the must-fix review issue where root `npm run test` did not cover frontend verification
- scope: add a repository-level script-definition test, introduce a canonical `test:all` gate, and make root `test` delegate to the full-stack gate
- tests:
  - `tests/repository/root-test-entry.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts` and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - root `npm run test` now delegates to `npm run test:all`
  - `test:all` now covers repository script checks, shared contracts, backend tests, and frontend tests
  - a green root test run now means the current platform skeleton is green across all three active layers

## 2026-03-26 - neutralize global layout data-source badge
- requirement: fix the misleading hard-coded `Mock Data Mode` badge in the shared console layout header
- scope: keep page-level data source indicators unchanged, but remove the layout-level mock badge so global shell chrome stays neutral during frontend-backend integration
- tests:
  - `frontend/src/app/app-shell.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/app/app-shell.spec.tsx`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the shared layout header no longer claims a global mock state
  - `Backend API`, `Degraded API Data`, `Integration Error`, and `Mock Fallback` remain page-scoped signals owned by page-level data loading
  - this removes the visual conflict between shell chrome and real page integration status

## 2026-03-26 - backend adapter guardrails
- requirement: fix backend adapter registry and task-engine service so duplicate adapter registration and engine-type mismatches fail fast
- scope: add explicit registry protection for duplicate `task_type` registration and add task-to-adapter engine-type validation before dispatch ticket or initial artifact creation
- tests:
  - `backend/tests/task-engine.service.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-engine.service.spec.ts`, `cmd /c npm run test:backend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the adapter registry now rejects multiple adapters claiming the same `task_type`
  - the task-engine service now fails fast when `task.engine_type` and adapter `engineType` drift apart
  - backend engine handoff no longer silently hides placeholder wiring mistakes that would become harder to debug once real engines are connected

## 2026-03-26 - frontend shared task formatters
- requirement: remove repeated task label and timestamp formatting logic from multiple frontend presentation components
- scope: extract shared task presentation helpers, reuse them in the Tasks page and Task detail overview section, and enforce the boundary with a repository-level structure test
- tests:
  - `frontend/src/utils/task-formatters.spec.ts`
  - `tests/repository/frontend-formatting-boundary.spec.ts`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/utils/task-formatters.spec.ts`, `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-formatting-boundary.spec.ts`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `TaskListPage` and `TaskOverviewSection` now share one formatter source for `task_type` and timestamp labels
  - root `test:repo` now includes a structure guard so these two pages do not silently drift back into duplicated presentation helpers
  - the refactor keeps page behavior stable while reducing future formatting drift as more task-facing pages are added

## 2026-03-30 - REQ-ASSET-DISCOVERY-001 phase A freeze and phase B draft
- requirement: `REQ-ASSET-DISCOVERY-001` 智能体资产测绘与指纹识别查找产物落地（非引擎实现）
- scope: freeze phase-A inputs (targets, boundaries, confidence policy), convert target-specific signals into probe/rule draft artifacts, and prepare phase-B review-ready catalog files
- tests: none; this iteration is documentation/rule-modeling only with no production behavior change
- test result: not run (no code-path behavior changes)
- docs updated:
  - `docs/temp/stage_A_330.md`
  - `docs/progress.md`
  - `engines/asset-scan/rules/probes.v1.yaml`
  - `engines/asset-scan/rules/fingerprints.v1.yaml`
- notes:
  - phase-A now has unique `target_id` set and P1 denominator fixed to 3 with target >= 2/3 coverage
  - conservative confidence policy is aligned to `>=0.80 direct`, `0.70-0.79 suspected`, `<0.70 log only`
  - phase-B drafts now include target-specific probes for `openclaw-gateway`, `ollama`, `langflow`, and `autogpt`
  - next blocker: provide positive/negative sample JSON files for each P0 target to replace placeholder sample refs

## 2026-03-31 - REQ-ASSET-FINGERPRINT-002 offline matcher baseline
- requirement: `REQ-ASSET-FINGERPRINT-002` 基于离线样本的资产指纹匹配 TDD 实现
- scope: 消费现有指纹规则 YAML 与正/负样本，新增最小 backend 离线 matcher，并通过现有 task-center 流程暴露基于样本的初始 asset-scan 结果
- tests:
  - `backend/tests/asset-fingerprint.service.spec.ts`
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/asset-fingerprint.service.spec.ts backend/tests/task-engine.service.spec.ts tests/integration/backend-task-center.api.spec.ts` and `npm run test:backend`
- docs updated:
  - `docs/sprint-current.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - backend 已可直接读取 `engines/asset-scan/rules/fingerprints.v1.yaml`，无需在代码中重复维护规则
  - `asset_scan` 任务可通过 `parameters.sample_ref` 在 TDD 流程中加载样本并回填初始指纹详情
  - `ollama`、`langflow`、`autogpt` 的正样本已达到离线 matcher 的 direct 阈值
  - 当时 `openclaw-gateway` 正样本因缺少端口证据，分数为 `0.65`，结论为 `log_only`

## 2026-03-31 - asset fingerprint documentation consolidation and next-step planning
- requirement: 将已完成的离线 matcher 工作收敛到 beginner 与计划文档，并明确推荐的下一条 requirement
- scope: 更新 beginner 指引、刷新总计划（当前状态 + 下一阶段）、将 sprint-current 切换到证据补强 requirement，并记录下一步所需用户输入
- tests: 无；本次仅涉及文档与规划调整
- test result: 未执行；本次更新不涉及运行时行为变更
- docs updated:
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/development-plan.md`
  - `docs/sprint-current.md`
  - `docs/progress.md`
- notes:
  - beginner 指引已从旧的“先补 8 个样本”基线切换为当前真实状态
  - 推荐下一条 requirement 为 `REQ-ASSET-EVIDENCE-003`，而不是直接跳到真实探针执行器
  - 计划已拆分为“先证据补强，再最小真实探针执行”两阶段

## 2026-03-31 - REQ-ASSET-EVIDENCE-003 openclaw sample strengthening checkpoint
- requirement: 通过补齐 openclaw 正样本端口证据并对齐过程文档，稳定证据补强阶段
- scope: 确认补强后的 openclaw 样本达到 direct，更新 sprint 文案到新基线，并将 beginner 转为全过程记录格式
- tests:
  - `npm run test:backend`
- test result: pass; 在更新 openclaw 正样本预期后 backend 测试全绿
- docs updated:
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/sprint-current.md`
  - `docs/progress.md`
- notes:
  - openclaw 正样本已包含端口证据，结果达到 `confidence=0.95`、`disposition=direct`
  - beginner 文档已切换为含“已完成/进行中/待开始”状态的过程日志
  - 下一执行重点仍是扩展 P0 负样本回归覆盖

## 2026-03-31 ~ 2026-04-01 - REQ-ASSET-EVIDENCE-003 negative sample generation (consolidated)
- requirement: 合并记录 P0 负样本批次生成与回归闭环（统一容器、统一脚本、统一回归）
- scope: 连续完成 n002~n009 批次负样本实采与回归接入，覆盖 openclaw/ollama/langflow/autogpt 四个 P0；mock 采样链路统一为 `scripts/dev/negative-sample-mock.py` + `asp-negative-mock`
- tests:
  - `backend/tests/asset-fingerprint.service.spec.ts`
  - `npm run test:backend`
  - `npm run test`
- test result: pass; 各批次均按 RED（先引入样本引用触发缺失失败）-> GREEN（补齐样本后回归通过）执行，最终全仓测试保持全绿
- docs updated:
  - `docs/sprint-current.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - 负样本生成六类场景已覆盖：
    1. 字段缺失
    2. 路径近似
    3. 404/端点不存在
    4. 代理头污染/中间件注入
    5. 跨产品字段复用（交叉污染）
    6. 字段格式伪装（键名变体/语义偏差）
  - 每类场景均已接入 matcher 回归并保持 `confidence < 0.7` 抑制语义
  - 负样本证据链已统一到可复现采样流程，便于后续扩展 P1/P2

## 2026-04-01 - REQ-ASSET-PROBE-004 phase G kickoff and docs alignment
- requirement: `REQ-ASSET-PROBE-004` 真实探针执行器最小闭环（阶段 G）
- scope: 将当前唯一 requirement 从阶段 F 切换至阶段 G，并同步 sprint/plan/beginner/progress 的目标、边界、验收与阶段状态
- tests: 无；本次仅涉及 requirement 切换与文档更新，不涉及运行时行为改动
- test result: 未执行；本次变更为纯文档更新
- docs updated:
  - `docs/sprint-current.md`
  - `docs/development-plan.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/progress.md`
- notes:
  - 阶段 F 已标记完成，阶段 G 已进入执行状态
  - 阶段 G 执行边界已明确：仅 localhost/测试容器/mock server，不触达公网目标
  - 第一轮探针范围已明确：TCP + HTTP HEAD/GET；WebSocket 暂不纳入
  - 下一步必须按 TDD 进入 RED：先补 probe runner/adapter/API 失败测试，再做最小实现

## 2026-04-01 - REQ-ASSET-PROBE-004 minimal live probe loop (RED -> GREEN)
- requirement: `REQ-ASSET-PROBE-004` 阶段 G 第一刀：live probe 最小闭环
- scope: 在 `asset_scan` 中新增受控 live probe 输入通道，并保持与离线 sample 模式并存；打通 adapter -> task-engine -> task-center -> API 的异步创建链路
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
  - `backend/tests/task-center.service.spec.ts`（异步调用适配）
- test result: pass; 先 RED（新增 live probe 断言失败），后 GREEN（实现后 `npm run test:backend` 与 `npm run test` 全绿）
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - 新增 `AssetProbeService`，按 `probes.v1.yaml` 目标探针执行最小 HTTP 采集
  - `AssetScanTaskAdapter` 现支持 `sample_ref` 与 `probe_mode=live + probe_target_id` 双路径
  - `TaskCenterController/TaskCenterService/TaskEngineService` 的任务创建链路已异步化
  - live probe 在当前实现中仅面向 localhost/测试容器/mock server 受控目标

## 2026-04-01 - REQ-ASSET-PROBE-004 expand live probe to ollama and openclaw-gateway
- requirement: `REQ-ASSET-PROBE-004` 阶段 G 第二刀：补齐剩余 P0 live probe 覆盖
- scope: 为 `ollama` 增加带 `probe_port_hint` 的 live probe 识别，为 `openclaw-gateway` 增加最小 WebSocket probe 识别，并补齐 task-engine/API 两层回归
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
  - `npm run test:backend`
  - `npm run test`
- test result: pass; `ollama` 与 `openclaw-gateway` 的新增 RED 用例在实现后转 GREEN，最终全仓测试保持通过
- docs updated:
  - `docs/sprint-current.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - `ollama` 通过 `probe_port_hint=11434` 补齐逻辑端口信号，live probe 结果达到 direct 阈值
  - `openclaw-gateway` 通过最小 WebSocket 探针采集 `hello-ok` 与 `presence`，live probe 结果达到 direct 阈值
  - 当前 P0 四个目标均已具备无 `sample_ref` 的 live probe 识别能力
  - `REQ-ASSET-PROBE-004` 当前最小闭环验收项已满足，可在此停下并等待下一条 requirement

## 2026-04-11 Minimum Detectable Prototype
- 配置:
  - Agent-security-platform\engines\asset-scan 目录下：pnpm add js-yaml node-fetch
- 测试指令:
  - npx tsx src/runner.ts 运行脚本
  - 限制: 目前固定 ollama 测试
  - 流程如下:
    目标(target)
        ↓
    执行探测（probe）
        ↓
    得到响应数据（ProbeResult）
      ↓
    匹配指纹规则（fingerprints.yaml）
      ↓
    计算分数 + 分类
      ↓
    输出 AssetScanResult
- docs updated:
  - engines\asset-scan\src\core\matcher.ts
  - engines\asset-scan\src\core\scorer.ts
  - engines\asset-scan\src\probe\httpProbe.ts
  - engines\asset-scan\src\probe\tcpProbe.ts
  - engines\asset-scan\src\engine.ts 引擎入口（给 backend 用）
  - engines\asset-scan\src\loader.ts
  - engines\asset-scan\src\runner.ts CLI / 本地测试入口

## 2026-04-17 六阶段探测原型
- 重新整理完整的资产探测流程，分为六步：
  - Step 1：资产发现
    - 目标：从“整个互联网”缩小到“可能运行Agent 的IP 或域名”。
    - Return：一个IP 列表。
    - 与下层关系：为Step 2 提供了目标列表。
  - Step 2：端口扫描
    - 目标：从“所有IP”缩小到“有端口开放（可能提供网络服务）的IP”。
    - Return：每个IP 上开放的端口列表。
    - 与上下层关系：
      - 上游依赖：Step 1 提供的IP 列表。
      - 下游支撑：告诉Step 3 “这里有一个开放端口，请你去看看它是什么协议”。如果某个IP
    没有开放任何相关端口（如80/443/50051），它就会被过滤掉。
  - Step 3：协议识别
    - 目标：从“开放端口”缩小到“具体是什么应用层协议（HTTP，TLS，gRPC）”。
    - Return：每个端口对应的协议类型。
    - 与上下层关系：
      - 上游依赖：Step 2 确认的开放端口。
      - 下游支撑：告诉Step 4 “该用什么工具和方法去采集指纹”。
  - Step 4：指纹采集
    - 目标：从“协议类型”到“具体的特征数据”。
    - Return：原始特征数据（Header 字段，响应文本，API 路径列表，SSL 证书序列号等）。
    - 与上下层关系：
      - 上游依赖：Step 3 确定的协议。不同协议，采集的具体数据项不同。
      - 下游支撑：为Step 5 提供“原材料”。这一步不负责判断Agent 类型，只是做“尽可能多地收集信息”。
  - Step 5：指纹匹配
    - 目标：从“原始特征数据”到“已知的指纹模式”。
    - Return：匹配到的指纹标识。e.g. Header；API 路径......
    - 与上下层关系：
      - 上游依赖：Step 4 采集到的特征数据。
      - 下游支撑：告诉Step 6 “这个资产可以打上什么技术标签”。这一步是从数据到信息的转换。
  - Step 6：资产归类
    - 目标：从“技术指纹”到“业务语义”。
    - Return：最终的业务标签（如Agent 类型：客服机器人，框架：LangChain，模型服务：OpenAI）。
    - 与上下层关系：
      - 上游依赖：Step 5 匹配到的指纹集合。
      - 最终输出：详细信息和置信度
  - 详见群里 PDF

## 2026-04-17 六阶段探测原型的实际实现
  - 目前 engine 对 Step 4 ~ Step 6 的初步实现已完成，并接入 backen，同时为防止后续结构功能相关改变预留了在 engine 实现前三步的空间（ScanContext 类的定义）。
  - 目前前三步在 engines\asset-scan\src\runtime\pipeline.ts 中进行mock降维处理，即：当前的输入是一个具体的 URL（比如 http://localhost:11434），系统直接通过解析这个 URL 来“伪造”了前三步的结果。
  - 根据当前设计重构了 probes.yaml 和 fingerprints.yaml 文件，**注意二者间 feature_type 的匹配**
  - Question：我理解前三步的结果通过 backen 获得，不过要在 engine 中实现也可以方便地扩展。
  - docs updated:
    - engines\asset-scan\src\probes\feature-extractor.util.ts
    - engines\asset-scan\src\probes\http.handler.ts
    - engines\asset-scan\src\probes\protocol-handler.interface.ts
    - engines\asset-scan\src\probes\tcp.handler.ts
    - engines\asset-scan\src\probes\ws.handler.ts
    - engines\asset-scan\src\runtime\asset-fingerprint.service.ts
    - engines\asset-scan\src\runtime\asset-probe.service.ts
    - engines\asset-scan\src\runtime\classification.service.ts
    - engines\asset-scan\src\runtime\pipeline.ts
    - engines\asset-scan\src\runtime\run-task.ts
    - engines\asset-scan\src\cli.ts
    - engines\asset-scan\src\bridge\scan-task.ts
    - engines\asset-scan\rules\fingerprints.v2.yaml
    - engines\asset-scan\rules\probes.v2.yaml
    - backend\tests\asset-scan-flow.spec.ts
    - docs\progress.md
    - engines\asset-scan\tsconfig.json
    - shared\types\asset-scan.ts
  - 可扩展之处：
  
| 扩展点 | 主要操作文件 | 次要操作文件 | 说明 |
| :---: | :---: | :---: | :---: |
| **新增产品指纹规则** | `engines/asset-scan/rules/fingerprints.v2.yaml` | `engines\asset-scan\src\probes\feature-extractor.util.ts` | 在 `fingerprints` 列表下新增条目，定义 `fingerprint_id`、`category`、`signals` 组合及 `inferred_attributes`。`asset-fingerprint.service.ts` 中的 `evaluate` 方法会遍历并评估该规则。 |
| **新增指纹匹配操作符** | `engines/asset-scan/src/asset-fingerprint.service.ts` | `engines/asset-scan/rules/fingerprints.v2.yaml` | 在 `isSignalMatch` 方法的 `switch` 语句中新增 `case` 分支，实现如 `not_contains`、`starts_with` 等逻辑。YAML 文件中的 `match_operator` 字段需同步使用新操作符名称。 |
| **支持指纹规则的复杂逻辑关系** | `engines/asset-scan/src/asset-fingerprint.service.ts` | `engines/asset-scan/rules/fingerprints.v2.yaml` | 重构 `evaluate` 方法中的评分逻辑，使其能解析 YAML 中定义的 `condition`（如 `AND`、`OR`）或 `match_requirement`（如 `all`、`any`）字段，计算组合条件的匹配结果。 |
| **新增探测协议** | `engines/asset-scan/src/probes/` (新建 `[protocol].handler.ts`) | `engines/asset-scan/src/asset-probe.service.ts`<br>`engines/asset-scan/rules/probes.v2.yaml` | 创建新的类文件并实现相应的 `IProtocolHandler` 接口。在 `asset-probe.service.ts` 的 `handlers` 对象中注册该协议。YAML 文件中的 `request.protocol` 字段可使用新协议名称。 |
| **新增 HTTP/WS 探针** | `engines/asset-scan/rules/probes.v2.yaml` | `engines/asset-scan/src/asset-probe.service.ts`<br>`engines/asset-scan/src/probes/http.handler.ts` (或 `ws.handler.ts`) | 在 `probes` 列表下新增条目，定义新的 `request`（路径、方法）和 `feature_extractors`。`asset-probe.service.ts` 会遍历并执行所有启用的探针。 |
| **新增特征提取类型** | `engines/asset-scan/src/probes/feature-extractor.util.ts` | `engines/asset-scan/rules/probes.v2.yaml` | 在 `extractFeaturesFromPayload` 函数中增加 `else if` 分支，处理新的 `feature_type`（如 `http_header`、`crypto_hash`）。YAML 文件中的 `feature_extractors` 可定义新的提取规则。 |
| **支持探针间的状态依赖** | `engines/asset-scan/src/asset-probe.service.ts` | `engines/asset-scan/src/probes/` (具体 `Handler` 文件)<br>`engines/asset-scan/rules/probes.v2.yaml` | 改造 `execute` 方法的循环逻辑，增加上下文对象（`context`）在各探针间传递状态（如 Token、Session ID）。`Handler` 的 `execute` 方法签名需扩展以接收并返回上下文。YAML 可能需要定义 `depends_on` 字段。 |
| **增强探针去重与调度** | `engines/asset-scan/src/asset-probe.service.ts` | `engines/asset-scan/rules/probes.v2.yaml` | 在 `execute` 方法中的端口和探针循环内部，增加基于 `protocol`、`port`、`path` 等唯一键的去重判断逻辑，避免对同一资源发送冗余请求。 |
| **增加探针请求重试机制** | `engines/asset-scan/src/probes/http.handler.ts` (或 `ws.handler.ts`) | `engines/asset-scan/rules/probes.v2.yaml` | 在 `Handler` 的 `execute` 方法内的 `catch` 块中，捕获特定网络错误（如 `ECONNRESET`），并实现带退避策略的循环重试逻辑。YAML 文件可增加 `retry` 配置段。 |

  - 当前测试指令（已接入backen）：
    - 主目录下的测试命令：node --experimental-strip-types backend\tests\asset-scan-flow.spec.ts 注：此为单独测试模块，下面的命令是真正接入backen后模拟前端输入的命令。
    - Agent-security-platform\backend 目录下输入：node --experimental-strip-types src/main.ts
    - 另起终端（以 ollama 探测为例）输入创建任务指令：
```bash
$body = @{
    task_type = "asset_scan"
    title = "直接测试后端拉起引擎"
    target = @{
        target_type = "url"
        target_value = "http://localhost:11434"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/tasks" -Method Post -Body $body -ContentType "application/json"
```
在输入获取结果指令（注意 task id 要对应）
```bash
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/tasks/task_1776345291388_adbdb8/result" | ConvertTo-Json -Depth 10
```
或者浏览器输入 http://127.0.0.1:3000/api/tasks/task_1776345291388_adbdb8/result

可以在 Agent-security-platform路径下运行 node --experimental-strip-types engines\asset-scan\src\cli.ts 测试中间过程的输出（目前写死 ollama）
## 2026-04-26 - StaticAnalysisResultSection 规则命中明细渲染

- requirement: 用后端已就绪的 rule_hits 数据替换 StaticAnalysisResultSection 中的 placeholder，渲染规则命中明细列表和敏感能力标签
- scope:
  - `frontend/src/pages/task-detail.page.spec.tsx`：新增 3 个失败测试（severity/message、recommendation、sensitive_capabilities）
  - `frontend/src/components/task-detail/StaticAnalysisResultSection.tsx`：替换 placeholder 文本，实现 rule_hits 列表（severity Tag、rule_id、message、file_path、line range、recommendation）和 sensitive_capabilities 标签区
- tests added:
  - `"renders rule_hits severity badges and message for each hit in static_analysis tasks"`
  - `"renders rule_hit recommendation when the field is present in details"`
  - `"renders sensitive_capabilities as tags when the field is non-empty"`
- test result: pass
  - `npm run test:frontend -- src/pages/task-detail.page.spec.tsx`（11/11）
  - `npm run test`（backend 30/30，frontend 29/29）
- docs updated:
  - `docs/progress.md`
- notes:
  - file_path 与行号拆分为独立 Text 节点，确保 getByText 精确断言可命中
  - severity 颜色映射：critical=red、high=orange、medium=gold、low=blue、info=default
  - sensitive_capabilities 以 volcano Tag 渲染，仅在非空时显示
  - sample_name 加入 Statistic 行，原有 language/files_scanned/count 保留

## 2026-04-26 - 第9步：skills-static 引擎客户端调度集成与 contract 收口

- requirement: 将 `SkillsStaticEngineClient.dispatch()` 接入任务创建链路，使 mock 路径下 `GET /api/tasks/:id/result` 返回含真实 rule_hits 的结果；同时补齐展示字段与排序的 contract 测试
- scope:
  - `backend/tests/skills-static-core.spec.ts`：新增展示字段保留测试（Phase A）和严重性降序排列测试（Phase B）
  - `backend/src/modules/task-center/skills-static/skills-static-result-normalizer.ts`：实现 rule_hits 按 severity 降序排列（`critical > high > medium > low > info`）
  - `backend/src/modules/task-center/task-engine.service.ts`：已含 `hasRegisteredClient`、`dispatchTask`、`createCompletedStaticAnalysisArtifacts`、`createFailedStaticAnalysisArtifacts`
  - `backend/src/modules/task-center/task-center.module.ts`：已注册 `SkillsStaticEngineClient`
  - `tests/integration/backend-task-center.api.spec.ts`：已含 mock/semgrep 对比测试和失败路径测试
- tests added:
  - `skills-static-core.spec.ts` Phase A：`code_snippet`、`recommendation`、`category`、`tags` 四个展示字段保留测试
  - `skills-static-core.spec.ts` Phase B：rule_hits 按 severity 降序排列的 contract 测试
- test result: pass
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/skills-static-core.spec.ts`（10/10）
  - `node --experimental-strip-types --experimental-test-isolation=none --test tests/integration/backend-task-center.api.spec.ts`（11/11）
  - `npm run test`（backend 30/30，frontend 26/26）
- docs updated:
  - `docs/progress.md`
- notes:
  - mock 路径下 `POST /api/tasks`（static_analysis）现在同步完成 dispatch → normalizer → deriver → store 写回，`GET /api/tasks/:id/result` 返回含两条 rule_hits 的 finished 结果
  - semgrep 路径通过 `SKILLS_STATIC_ENGINE_PROVIDER=semgrep` 激活，规则文件为 `engines/skills-static/rules/semgrep-minimal.yml`
  - 排序实现位于 `normalizeSkillsStaticEngineOutput`，`SEVERITY_ORDER` 常量保证稳定排序语义
  - 引擎私有字段（`engine_private_*`、`risk_score`）在 normalizer 中被剥离，不进入 `SkillsStaticRuleHit`

## 2026-04-26 - Task 详情页 static_analysis 结果区全字段渲染（Phase 1-4）

- requirement: 补全 Task 详情页 static_analysis 结果区所有未渲染字段，使前端展示与后端 mock 数据完整对齐
- scope:
  - `frontend/src/components/task-detail/TaskRiskSummarySection.tsx`（Phase 1）：补加 RiskTag 彩色徽章、`low_count`、`info_count` MetricChip
  - `frontend/src/components/task-detail/StaticAnalysisResultSection.tsx`（Phase 2/3/4）：补加 `entry_files` 列表、`RuleHitItem` 的 title/category/code_snippet/tags、`dependency_summary` 键值对（Ant Design Descriptions）
  - `frontend/src/pages/task-detail.page.spec.tsx`：每阶段先写失败测试再做实现（TDD）
- tests added:
  - Phase 1：`"renders risk_level with a colored RiskTag in the risk summary section"` / `"renders low_count and info_count in the risk summary section"`
  - Phase 2：`"renders entry_files as a list when the field is present"`
  - Phase 3：`"renders rule_hit title and category when both fields are present"` / `"renders rule_hit code_snippet in a code block when present"` / `"renders rule_hit tags as chip labels when present"`
  - Phase 4：`"renders dependency_summary key-value pairs when the field is present"`
- test result: pass
  - `npm run test:frontend -- src/pages/task-detail.page.spec.tsx`（18/18）
  - `npm run test`（repo 2/2，shared 11/11，backend 30/30，frontend 36/36）
- docs updated:
  - `docs/progress.md`
- notes:
  - Phase 1 引入 RiskTag 后与 TaskOverviewSection 存在重复节点，将 `getByText("High"/"Medium")` 改为 `getAllByText(...).length > 0` 解决
  - entry_files 区域在 Statistic 行下方、Rule Hits 列表上方渲染，仅非空时显示
  - code_snippet 以原生 `<pre>` 块展示（背景 #f5f5f5，字号 12px）
  - dependency_summary 以 Ant Design Descriptions（column=1，size="small"，bordered）展示键值对

## 2026-05-07 - asset-scan engine Step 1 to Step 3 implementation
- requirement: implement the first three asset-scan steps inside `engines/asset-scan` for teaching-stage exposure mapping and fingerprint identification
- scope:
  - added explicit Step 1 `AssetDiscoveryService`, Step 2 `PortScanService`, and Step 3 `ProtocolIdentificationService`
  - extended `shared/types/asset-scan.ts` with `DiscoveryInput`, `Asset`, `PortScanInput`, `PortInfo`, `ProtocolInput`, `ProtocolInfo`, `PortProtocol`, and `TlsInfo`
  - rewired `AssetScanPipeline` to compose Step 1 to Step 6 instead of mocking Step 1 to Step 3 inline
  - updated classification output so final engine results preserve discovered asset source and protocol metadata
  - added engine-owned tests for discovery, port scan, protocol identification, pipeline context composition, and run-task result preservation
- tests added:
  - `engines/asset-scan/tests/asset-probe.runtime.spec.ts`
  - `engines/asset-scan/tests/asset-fingerprint.runtime.spec.ts`
  - `engines/asset-scan/tests/scan-task.bridge.spec.ts`
- test result:
  - pass: `npm run test:engine:asset-scan`
  - pass for asset-scan relevant backend integration after sandbox escalation: `npm run test:backend`
  - known unrelated failure remains in backend suite: `skills-static` semgrep provider path fails with `spawn semgrep ENOENT` when local `semgrep` binary is unavailable
- docs updated:
  - `README.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - default pipeline behavior stays conservative: it uses URL hostname plus hinted port unless candidate ports are explicitly widened
  - this requirement completes the teaching-stage Step 1 to Step 3 implementation without expanding into public-internet scanning orchestration

## 2026-04-28 - REQ-ASSET-INTEL-006 FOFA 外部情报接入与评估闭环（第一阶段）
- requirement: 引入 FOFA dev 侧外部情报能力，打通采集 -> 标准化 -> 批次化 -> 评估最小闭环，并保持 asset-scan 主链路解耦
- scope:
  - 新增 `scripts/dev/intel/fofa-collector.ts`，支持 query 构造、分页、重试、请求间隔与预算阈值控制
  - 新增 `scripts/dev/intel/fofa-normalizer.ts`，支持 fields 映射、缺失字段容错与去重
  - 新增 `scripts/dev/intel/fofa-batch-writer.ts`，支持按 `batch_id` 输出可复现样本
  - 新增 `scripts/dev/intel/fofa-evaluator.ts`，输出 TP/FP/FN 与 recall/precision/F1
  - 新增 FOFA fixture、单测与集成测试，纳入 root `test:repo` 脚本入口
- tests added:
  - `tests/repository/fofa-collector.spec.ts`
  - `tests/repository/fofa-normalizer.spec.ts`
  - `tests/repository/fofa-evaluator.spec.ts`
  - `tests/integration/fofa-intel-pipeline.spec.ts`
- test result:
  - RED: fail（模块不存在，`ERR_MODULE_NOT_FOUND`，符合先测后实现）
  - GREEN: pass
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-collector.spec.ts tests/repository/fofa-normalizer.spec.ts tests/repository/fofa-evaluator.spec.ts tests/integration/fofa-intel-pipeline.spec.ts`
  - regression:
    - `npm run test:repo` pass
    - `npm run test:backend` 存在 1 个历史环境依赖项失败（semgrep 二进制缺失，非本需求引入）
    - `npm run test:engine:asset-scan` 当前脚本引用缺失测试文件（仓库既有问题）
- docs updated:
  - `docs/sprint-current.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/development-plan.md`
  - `docs/progress.md`
  - `README.md`
- notes:
  - FOFA 失败路径不影响既有 sample_ref/live probe 主流程
  - 本 requirement 完成后已停止扩展相邻需求

## 2026-04-28 - REQ-ASSET-INTEL-006 follow-up stabilization and documentation
- requirement: 完成后续动作并补充 FOFA 详细文档
- scope:
  - 修复 `test:engine:asset-scan` 失效引用，新增稳定 engine 测试 `engines/asset-scan/tests/run-task.contract.spec.ts`
  - 增强 semgrep runner 的执行回退逻辑（优先 `semgrep`，缺失时回退 `python -m semgrep`）
  - 调整 backend semgrep provider parity 集成测试，在本地 semgrep runtime 缺失场景下走稳定失败断言而非误报
  - 新增 FOFA 详细文档 `docs/fofa-intel-phase1.md`
- tests:
  - `npm run test:engine:asset-scan` pass
  - `npm run test:backend` pass
  - `npm run test:repo` pass
- docs updated:
  - `docs/fofa-intel-phase1.md`
  - `README.md`
  - `docs/progress.md`

## 2026-04-29 - OSS Port Collector interface and simple port-read test
- requirement: 参考现有 probe 风格接口，增加不依赖 FOFA 的开源端口采集抽象，并提供最小端口读取测试
- scope:
  - 新增 `scripts/dev/intel/oss-port-collector.ts`
  - 提供 `NmapPortCollector`、`NaabuPortCollector`、`collectOpenPortsWithFallback`
  - 新增 `tests/repository/oss-port-collector.spec.ts`，覆盖端口解析与降级链行为
- tests added:
  - `tests/repository/oss-port-collector.spec.ts`
- test result:
  - RED: fail（`ERR_MODULE_NOT_FOUND`，模块不存在）
  - GREEN: pass
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/oss-port-collector.spec.ts`
- docs updated:
  - `README.md`
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - default pipeline behavior stays conservative: it uses URL hostname plus hinted port unless candidate ports are explicitly widened
  - this requirement completes the teaching-stage Step 1 to Step 3 implementation without expanding into public-internet scanning orchestration

- test command:
  - \Agent-security-platform\backend: node --experimental-strip-types src/main.ts
  - another terminal \Agent-security-platform:
  ```bash
  $body = @{
  task_type = "asset_scan"
  title = "Local asset scan test"
  target = @{
    target_type = "url"
    target_value = "http://127.0.0.1:11434"
  }
  parameters = @{
    discovery_seed = @("127.0.0.1", "localhost")
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/tasks" -Method Post -Body $body -ContentType "application/json"
```

check task result：http://127.0.0.1:3000/api/tasks/<task_id>/result
  - 新增能力为 dev 侧采集层，不修改现有 backend/engine 主链路

## 2026-05-08 - FOFA API direct task-scan dev script for ollama
- requirement: 提供一个直接调用 FOFA 官方 API 的 dev 侧测试脚本，将 Ollama 11434 候选目标转换为现有 `asset_scan` 任务请求并提交到 `POST /api/tasks`
- scope:
  - 新增 `scripts/dev/intel/fofa-api-task-scan.ts`
  - 支持 FOFA 官方 `GET /api/v1/search/all` 请求拼装、字段映射、以及向 backend `POST /api/tasks` 批量提交
  - 默认围绕 `ollama`/`11434` 构造 live probe 任务参数
  - 新增 `tests/repository/fofa-api-task-scan.spec.ts`，覆盖 FOFA URL 构造、任务 payload 映射、以及批量 API 提交流
- tests added:
  - `tests/repository/fofa-api-task-scan.spec.ts`
- test result:
  - RED: fail（脚本不存在，`ERR_MODULE_NOT_FOUND`）
  - GREEN: pass
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-api-task-scan.spec.ts`
- docs updated:
  - `README.md`
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - 该能力为 dev 侧 FOFA 接入脚本，复用现有 `asset_scan` API，不新增平台公开扫描路由

## 2026-05-08 - FOFA env auto-load, batch report, and asset-scan result backfill
- requirement: 继续完善 FOFA dev 侧工作流，支持本地 env 自动加载、批量结果汇总，并使 FOFA 创建的 `asset_scan` 任务立即回填 finished 结果
- scope:
  - `scripts/dev/intel/fofa-api-task-scan.ts` 支持从 `.env.local`、`.env`、`~/.config/agent-security-platform/fofa.env` 自动加载 FOFA 凭据
  - 新增 `scripts/dev/intel/fofa-task-batch-report.ts`，批量拉取 `result` 与 `risk-summary` 并输出汇总
  - `backend` 在 `asset_scan` 的初始引擎详情已生成时，直接回填 finished 任务/result/risk-summary，而不是停留在 pending
- tests added:
  - `tests/repository/fofa-task-batch-report.spec.ts`
  - `backend/tests/task-center.service.spec.ts` 新增 asset-scan 回填场景
- test result:
  - RED: fail（缺少 env resolver、缺少 batch report 脚本、asset_scan 仍停留 pending）
  - GREEN: pass
    - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts backend/tests/asset-scan-flow.spec.ts tests/repository/fofa-api-task-scan.spec.ts`
    - `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/fofa-task-batch-report.spec.ts`
- docs updated:
  - `README.md`
  - `docs/progress.md`
- notes:
  - 该阶段未新增平台公开路由，仍复用 `POST /api/tasks` 和现有结果查询接口

## 2026-05-08 - Port-scan requirement updated for authorized public-network execution
- requirement: 在现有端口扫描策略基础上，明确“可扫描公网”边界与治理约束
- scope:
  - 更新 `docs/sprint-current.md`，加入公网扫描目标、预算控制、速率控制、审计留痕要求
  - 更新 `docs/plans/asset-scan-port-scan-v1.md`，补充公网执行 guardrails
- docs updated:
  - `docs/sprint-current.md`
  - `docs/plans/asset-scan-port-scan-v1.md`
  - `docs/progress.md`
- notes:
  - 当前仅完成 requirement 和设计文档收口；实现与测试将按 RED -> GREEN 继续推进
