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

当前 focus：第一阶段扫描（阶段 A）执行与复盘。

- Focus-1：继续完成首批 query 批次（Q1/Q2 已执行，待 Q4/Q3/Q5）
- Focus-2：固定 S 档参数，控制规模与超时
- Focus-3：按批归档 task_id、状态分布、中断原因
- Focus-4：形成可复跑模板（query + 参数 + 退出门槛）

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

- Q1（ollama）：port="11434" && protocol="http"
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

## 6. 当前已完成成果（仅 FOFA 相关）

- FOFA API 到 POST /api/tasks 已打通
- FOFA 凭据自动加载链路可用
- FOFA 批量结果汇总脚本可用
- execution_context 与 interruption_reason 已贯通至结果层
- finished / partial_success / failed 状态回填语义已收口
- 第一阶段扫描蓝图已完成（Go/No-Go、query 包、参数、验收）
- Day 1 已执行 Q1/Q2 各 20 条，共 40 条任务，当前汇总结果为 `finished=40`

## 7. 执行清单（下一步）

1. 完成工作流脚本文档化：naabu 与 nmap 的职责边界、输入输出、失败路径
2. 按 TDD 进入 RED：新增脚本级测试用例（端口分层、命中约束、样本分层）
3. 实现统一工作流脚本并输出三类 JSON：候选、已验证、原始证据
4. 复跑 Day 2 批次（Q4、Q3、Q5）并验证脚本输出与现有探针格式一致
5. 更新 API/架构/进度文档，收口本 requirement

## 8. 当前阻塞与处理

- 阻塞：backend 3000 端口冲突
	- 处理：释放占用进程或改用空闲端口并同步 backend 参数
- 阻塞：node 命令不可用或版本不一致
	- 处理：先 source nvm，再使用固定 node 路径执行
- 阻塞：taskIds 格式错误导致 batch-report 404
	- 处理：仅使用英文逗号分隔，校验 task_id 完整性
- 阻塞：`size=200` 的 FOFA task-scan 执行出现过 `fetch failed`
	- 处理：先用 `size=20` 建立成功基线，再逐步放大批次验证极限

## 9. 只保留这 3 份联动文档

- 当前 requirement：docs/sprint-current.md
- 扫描设计与参数细节：docs/temp/asset-scan-port-scan-v1.md
- 进度记录：docs/progress.md

补充：当前执行总览页为本文件 `docs/plans/plan-overview.md`。

## 10. 维护规则

- 只更新 FOFA 扫描相关内容
- 每次批次执行后至少更新“当前 focus、已完成成果、执行清单”
- 非 FOFA 事项不要写入本页
