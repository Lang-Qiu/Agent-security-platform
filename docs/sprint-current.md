# Sprint Current

后续可以把当前唯一 requirement 写在这里，Codex 会按 `AGENTS.md` 中的规则逐条处理，一次只处理一个 requirement。

## Requirement ID
REQ-ASSET-SCAN-PORT-007

## Requirement Name
端口扫描执行策略与结果落盘闭环（阶段 H）

## Background
当前仓库已具备 FOFA 候选目标导入、asset_scan 任务创建、基础 live probe 识别能力。当前缺口是扫描策略没有以 requirement 形式固化，且端口扫描（naabu）与深度识别（nmap）在执行边界、接口探针顺序、结果保存规范上尚未形成统一闭环。

## Goal
- 固化分层扫描策略：L1 端口存活（naabu） -> L2 服务识别（nmap） -> L3 协议探针（HTTP/WS）
- 明确当前阶段针对的目标端口、接口路径、重试和超时策略
- 明确扫描证据保存与任务状态回填规则（pending/running/finished/partial_success/failed）
- 在授权前提下支持公网目标扫描，并补齐预算控制与审计约束
- 保持现有 FOFA task-scan 与离线 matcher 回归能力不被破坏

## In Scope
- 规则基线固化（以 `engines/asset-scan/rules/probes.v2.yaml` 为主）：
	- critical: 18789, 18791, 18793
	- high: 11434, 3000, 8080, 9090
	- medium: 8000, 5000, 3001
	- low: 80, 443, 8081
- 扫描执行方法固化：
	- naabu 仅负责端口开放探测，不做服务判定
	- nmap 仅对 naabu 命中端口执行 `http-title,ssl-cert,http-enum`
	- HTTP/WS 探针仅对规则中目标接口执行（如 `/api/tags`, `/api/v1/flows`, `/api/agent/status`）
- 结果保存策略固化：
	- 保存结构化证据（open_ports/http_endpoints/findings）
	- 保存扫描原始输出（naabu_output/nmap_output）
	- 统一回填任务状态与风险汇总
- 公网扫描执行边界固化：
	- 允许 FOFA 导入的公网目标进入扫描链路
	- 仅在授权目标范围执行，不做无条件全网扩散
	- 补充任务级预算参数（`max_targets`、`max_ports_per_target`、`max_runtime_seconds`）
	- 补充基础速率控制（目标级 RPS/并发上限）
- 审计与可追溯性：
	- 记录 query、发起人、时间窗口、扫描预算与中断原因
	- 保留关键原始输出用于复核（naabu/nmap）
- 测试范围：
	- repository：FOFA task-scan / batch-report
	- backend：task-center/task-engine 状态推进与回填

## Acceptance Criteria
- 新增测试遵循 RED -> GREEN
- 端口扫描分层策略在文档与实现中一致
- 目标端口、探针接口和保存字段有明确契约定义
- FOFA 创建任务后可通过结果接口稳定读取扫描结果汇总
- 公网目标扫描在预算与速率约束下可稳定执行并可审计追踪
- `npm run test:repo` 全绿；`npm run test:backend` 仅允许已知环境依赖失败（若存在）

## Out of Scope
- 不新增前端页面
- 不扩展 P1/P2 目标的完整识别链路
- 不引入数据库迁移（当前阶段可维持内存仓库 + 可选文件证据）
- 不做未授权资产的主动扩散扫描
- 不做分布式扫描调度平台化改造

## Constraints / Notes
- 严格一次只处理当前 requirement，不扩展相邻需求
- 必须遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`
- 优先目标：`ollama`、`langflow`、`autogpt`、`openclaw-gateway`
- 允许公网扫描，但必须满足“授权范围 + 预算控制 + 审计留痕”三项约束
- 样本模式与真实探针模式并存，不能破坏既有离线回归
- 若发生 `node` 环境缺失，必须先 `nvm use` 再执行 backend/dev 脚本

## Latest Execution Checkpoint (2026-05-08)
- 已完成：FOFA API -> POST /api/tasks 的 dev 侧接入
- 已完成：FOFA 凭据自动加载（支持 `.env.fofa.local`）
- 已完成：FOFA 批量任务结果汇总脚本
- 已完成：asset_scan 任务从初始扫描结果回填 finished 的后端路径
- 当前状态：扫描策略文档与实现边界需要在本 requirement 内统一收口

## Related Plan
- docs/plans/plan-overview.md
- docs/temp/asset-scan-port-scan-v1.md

