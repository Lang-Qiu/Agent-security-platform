# API Contract v1

## 1. 文档范围

本文档定义 `agent-security-platform` 第一版 API 契约，目标是支撑以下三类协作场景：

- 前端与后端联调
- 后端与三个检测引擎集成
- 平台对任务、结果、日志、风险摘要进行统一存储与展示

当前版本聚焦“最小可联调闭环”，不追求一次覆盖完整业务系统。核心设计原则是以 `Task` 为中心组织任务流，以统一外层结果结构承载三类引擎输出。

## 2. 设计原则

### 2.1 为什么采用 Task 驱动

平台的核心不是直接暴露某个引擎能力，而是统一管理检测任务的生命周期。采用 `Task` 驱动有以下好处：

- 前端调用方式统一。无论是资产测绘、静态分析还是动态沙箱，前端都先创建任务，再查询状态和结果。
- 后端编排方式统一。后端只需要围绕任务创建、调度、状态更新、结果归档来组织主流程。
- 引擎接入方式统一。不同引擎只要能接收任务上下文并返回标准结果，就可以被平台编排。
- 平台展示方式统一。任务列表、执行日志、结果详情、风险摘要都可以围绕 `task_id` 聚合。

### 2.2 为什么三个引擎要统一外层结构

三个引擎的内部实现可以完全不同，但外层结构必须统一，原因如下：

- 前端不需要理解不同引擎的私有协议。
- 后端可以用统一的任务中心、日志中心、结果中心承接不同能力。
- 风险等级、任务状态、时间字段、摘要字段可以跨引擎统一展示和统计。
- 后续如果某个引擎重构、拆服务或替换语言，只要外层契约不变，平台层改动成本就会显著降低。

### 2.3 为什么先统一输出格式，再逐步细化调用方式

在项目第一阶段，最容易阻塞协作的并不是“调用方式是否完美”，而是“结果格式是否一致”。因此本版契约优先统一：

- 任务对象结构
- 结果对象结构
- 风险等级和状态枚举
- 平台统一响应格式

对于引擎与后端的具体调用方式，例如 HTTP 同步调用、异步队列、内部 SDK、回调上报、轮询拉取，本阶段暂不强绑定。这样做可以让 3 人团队先跑通主流程，再根据实际性能和部署要求细化接入模式。

当前 `asset_scan` 已在实现层采用“backend 进程桥接 engine”方式：backend 将 `Task` payload 传给 engine bridge（stdin JSON），engine 返回标准 `details`（stdout JSON）。该实现细节不改变现有平台对外 HTTP API，只影响 backend 与 engine 的内部执行边界。

## 3. 通用枚举与约定

### 3.1 命名与格式约定

- API 请求与响应中的 JSON 字段统一使用 `snake_case`
- 枚举值统一使用小写英文和下划线
- 时间字段统一使用 ISO 8601 字符串，例如 `2026-04-01T09:30:00Z`
- 所有 ID 字段统一使用字符串，不在 API 层暴露自增整数
- 第一版接口不引入分页、排序、筛选等复杂协议，先保证主流程稳定
- 当前第一版共享契约以 `shared/` 中的 TypeScript 定义和运行时规范化函数为准，文档与代码应保持一致
- 当前工程基线先冻结为 `pnpm workspace`、`Node.js 22.19.0`、`TypeScript strict`，用于支撑平台骨架阶段的契约开发与测试

### 3.2 TaskType

| 枚举值 | 含义 | 说明 |
| --- | --- | --- |
| `asset_scan` | 资产测绘任务 | 用于 Agent 资产识别、开放面探测、指纹识别 |
| `static_analysis` | 静态分析任务 | 用于 Skills 包、脚本、依赖和配置的静态安全检测 |
| `sandbox_run` | 动态沙箱任务 | 用于运行时监控、越权行为检测和阻断 |

### 3.3 TaskStatus

| 枚举值 | 含义 | 说明 |
| --- | --- | --- |
| `pending` | 待执行 | 任务已创建，尚未开始执行 |
| `running` | 执行中 | 已分发至引擎，正在执行 |
| `finished` | 已完成 | 任务执行完成，结果可查询 |
| `failed` | 执行失败 | 引擎执行失败或平台处理失败 |
| `blocked` | 已阻断 | 主要用于动态沙箱中触发高危动作后的阻断状态 |
| `partial_success` | 部分成功 | 部分结果已产出，但存在步骤失败或数据缺失 |

### 3.4 EngineType

| 枚举值 | 含义 | 说明 |
| --- | --- | --- |
| `asset_scan` | 资产扫描引擎 | 对应 `engines/asset-scan` |
| `skills_static` | Skills 静态分析引擎 | 对应 `engines/skills-static` |
| `sandbox` | 沙箱引擎 | 对应 `engines/sandbox` |

### 3.5 RiskLevel

| 枚举值 | 含义 | 说明 |
| --- | --- | --- |
| `info` | 提示信息 | 仅提示，不构成直接风险 |
| `low` | 低风险 | 风险较低，建议关注 |
| `medium` | 中风险 | 需要进入排查和修复流程 |
| `high` | 高风险 | 需要优先处理 |
| `critical` | 严重风险 | 需要立即处理或阻断 |

## 4. 通用对象

### 4.1 Task

`Task` 是平台层统一的任务对象。前端创建任务、后端调度执行、引擎返回结果、平台查询展示，全部围绕 `task_id` 展开。

当前 `Task` 契约还要求 `task_type` 与 `engine_type` 之间满足固定映射关系：

- `asset_scan` -> `asset_scan`
- `static_analysis` -> `skills_static`
- `sandbox_run` -> `sandbox`

#### 字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `task_id` | string | 是 | 平台生成的任务唯一标识 |
| `task_type` | string | 是 | 任务类型，取值见 `TaskType` |
| `engine_type` | string | 是 | 执行引擎类型，取值见 `EngineType` |
| `status` | string | 是 | 任务状态，取值见 `TaskStatus` |
| `title` | string | 是 | 任务标题，面向页面展示和日志定位 |
| `requested_by` | string | 否 | 任务发起人标识 |
| `target` | object | 是 | 任务目标对象 |
| `parameters` | object | 否 | 任务参数，按任务类型扩展 |
| `risk_level` | string | 否 | 当前任务汇总风险等级 |
| `summary` | string | 否 | 任务摘要说明 |
| `result_ref` | object | 否 | 任务结果引用信息 |
| `error_message` | string | 否 | 任务失败或异常说明 |
| `created_at` | string | 是 | 创建时间 |
| `updated_at` | string | 是 | 最近更新时间 |
| `started_at` | string | 否 | 实际开始执行时间 |
| `finished_at` | string | 否 | 实际完成时间 |
| `metadata` | object | 否 | 平台保留扩展字段 |

补充说明：

- 当前离线 TDD 阶段，`asset_scan` 允许通过 `parameters.sample_ref` 指向仓库内 `samples/assets/` 下的样本 JSON。
- 该参数仅用于规则消费与测试闭环，不代表已经接入真实扫描执行器。
- 当前执行边界：`sample_ref` 与 `probe_mode=live` 两条路径均由 `engines/asset-scan` 执行，backend 仅做编排与结果壳聚合。
- 阶段 G 起，`asset_scan` 还支持最小 live probe 参数：
  - `parameters.probe_mode = "live"`
  - `parameters.probe_target_id`（如 `langflow`、`autogpt`）
  - `parameters.probe_port_hint`（可选；用于受控测试环境下补齐逻辑端口信号，如 `11434`、`18789`）
- 阶段 H 起，`asset_scan` 在授权前提下支持公网目标治理参数：
  - 预算控制：`parameters.max_targets`、`parameters.max_ports_per_target`、`parameters.max_runtime_seconds`
  - 速率控制：`parameters.target_http_rps_cap`、`parameters.max_tcp_concurrency_per_target`
  - 审计留痕：`parameters.audit`（包含 `query`、`source`、`requested_by`、`requested_at`）
  - backend 在创建 `asset_scan` 任务时会对上述预算/速率字段做最小值与上限归一化
  - 中断原因：`parameters.audit.interruption_reason`（`none`/`budget`/`timeout`/`manual_stop`）
  - 若未显式提供中断原因，backend 会归一化为 `none`
- 当前 live probe 已覆盖：
  - HTTP: `langflow`、`autogpt`、`ollama`
  - WebSocket: `openclaw-gateway`
- live probe 允许在授权范围内覆盖公网目标；本阶段仍不包含分布式调度。
- dev 侧可通过 FOFA 官方 `search/all` API 采集候选 `host/ip/port/protocol`，再转换成既有 `POST /api/tasks` 请求；该接入方式不新增平台公开路由，只复用现有 `asset_scan` 契约。

#### target 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `target_type` | string | 是 | 目标类型，例如 `url`、`repo`、`skill_package`、`session` |
| `target_value` | string | 是 | 目标标识值 |
| `display_name` | string | 否 | 展示名称 |
| `location` | string | 否 | 目标位置，例如文件路径、仓库地址、环境标识 |
| `metadata` | object | 否 | 与目标相关的补充上下文 |

#### result_ref 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `result_type` | string | 是 | 结果类型，例如 `asset_scan_result` |
| `result_id` | string | 是 | 结果唯一标识 |

#### JSON 示例

```json
{
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "engine_type": "asset_scan",
  "status": "running",
  "title": "Scan demo public agent",
  "requested_by": "alice",
  "target": {
    "target_type": "url",
    "target_value": "https://demo-agent.example.com",
    "display_name": "Demo Agent",
    "location": "public-internet"
  },
  "parameters": {
    "enable_http_probe": true,
    "enable_port_scan": true,
    "timeout_seconds": 60
  },
  "risk_level": "medium",
  "summary": "Target discovered and fingerprinting is in progress",
  "created_at": "2026-04-01T09:30:00Z",
  "updated_at": "2026-04-01T09:31:10Z",
  "started_at": "2026-04-01T09:30:08Z",
  "metadata": {
    "workspace": "default"
  }
}
```

### 4.2 BaseResult

`BaseResult` 是三类结果对象的公共外层结构。第一版共享契约要求所有结果先收敛成统一外层，再通过 `details` 承载任务类型对应的细节字段。这样前端和后端都可以先依赖稳定的结果壳，再逐步细化三类任务的详情结构。

#### 字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `task_id` | string | 是 | 关联任务 ID |
| `task_type` | string | 是 | 关联任务类型 |
| `engine_type` | string | 是 | 产生结果的引擎类型 |
| `status` | string | 是 | 结果对应的执行状态 |
| `risk_level` | string | 是 | 结果汇总风险等级 |
| `summary` | string | 是 | 结果摘要 |
| `details` | object | 是 | 结果细节对象，按 `task_type` 承载不同结构 |
| `created_at` | string | 是 | 结果创建时间 |
| `updated_at` | string | 是 | 最近更新时间 |
| `result_id` | string | 否 | 结果对象唯一标识，后续落库或归档时可补齐 |
| `started_at` | string | 否 | 该结果对应执行开始时间 |
| `finished_at` | string | 否 | 该结果对应执行完成时间 |
| `metadata` | object | 否 | 保留扩展字段 |

#### JSON 示例

```json
{
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "engine_type": "asset_scan",
  "status": "finished",
  "risk_level": "high",
  "summary": "Detected 2 open management endpoints and missing authentication",
  "details": {
    "target": {
      "target_type": "url",
      "target_value": "https://demo-agent.example.com",
      "display_name": "Demo Agent"
    },
    "findings": [
      {
        "title": "Management endpoint exposed",
        "risk_level": "high"
      }
    ]
  },
  "created_at": "2026-04-01T09:30:12Z",
  "updated_at": "2026-04-01T09:31:30Z"
}
```

#### details 细化约定

- `asset_scan`：`details` 主要承载 `target`、`fingerprint`、`matched_features`、`open_ports`、`http_endpoints`、`auth_detected`、`findings`，以及执行治理快照 `execution_context`
  - `execution_context` 当前包含：
    - `max_targets`
    - `max_ports_per_target`
    - `max_runtime_seconds`
    - `target_http_rps_cap`
    - `max_tcp_concurrency_per_target`
    - `audit`（`query`、`source`、`requested_by`、`requested_at`、`interruption_reason`）
  - 当 `asset_scan` 在初始执行阶段失败时，平台会回填 `status=failed` 的结果壳，并保留 `execution_context.audit.interruption_reason`
  - 当引擎 runtime 在流水线阶段抛出异常时，会将错误语义映射到 `execution_context.audit.interruption_reason`（如 `timeout`、`budget`）；映射失败时回退为 `none`
  - 当 `asset_scan` 已产出结果壳，但 `execution_context.audit.interruption_reason` 为非 `none` 时，平台会将 `task/result/risk-summary` 统一回填为 `partial_success`
  - `execution_context.audit.interruption_reason` 可来自两类来源：
    - 任务参数审计字段（平台创建阶段归一化）
    - 引擎执行层 runtime/bridge 产生的中断语义（如 probe timeout）
  - 若任务参数中的中断原因仅为默认 `none`，平台会优先保留引擎执行层返回的非 `none` 原因，避免执行语义在 bridge 或 task-center 合并阶段被覆盖
  - `interruption_reason` 优先取任务参数中的审计值；若缺失则根据错误语义推断（如 timeout/budget），否则为 `none`
- `static_analysis`：`details` 主要承载 `sample_name`、`language`、`entry_files`、`files_scanned`、`rule_hits`、`sensitive_capabilities`、`dependency_summary`
- `sandbox_run`：`details` 主要承载 `session_id`、`target`、`events`、`policy_decisions`、`alerts`、`blocked_records`、`blocked`、`event_count`

第一版共享规范化逻辑会剥离结果外层和 `details` 中未声明的私有字段，避免把引擎内部调试数据直接泄露到平台 API 或前端页面。

#### 与具体结果对象的关系

本文件第 5 章中保留三类结果对象的业务字段说明，用于解释各任务类型的细节结构；在实际共享契约中，这些细节字段都应投影到 `BaseResult.details` 下，而不是各自再定义一套不同的结果外层。

```json
{
  "result_id": "result_asset_0001",
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "engine_type": "asset_scan",
  "status": "finished",
  "risk_level": "high",
  "summary": "Detected 2 open management endpoints and missing authentication",
  "details": {
    "target": {
      "target_type": "url",
      "target_value": "https://demo-agent.example.com",
      "display_name": "Demo Agent"
    },
    "fingerprint": {
      "agent_name": "demo-agent",
      "framework": "langchain"
    },
    "findings": [
      {
        "title": "Management endpoint exposed",
        "risk_level": "high"
      }
    ]
  },
  "started_at": "2026-04-01T09:30:08Z",
  "finished_at": "2026-04-01T09:31:28Z"
}
```

### 4.3 RiskSummary

`RiskSummary` 用于统一描述任务级风险汇总，供任务详情页、统计卡片和汇总列表直接使用。

#### 字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `task_id` | string | 是 | 关联任务 ID |
| `task_type` | string | 是 | 任务类型 |
| `status` | string | 是 | 当前任务状态 |
| `risk_level` | string | 是 | 汇总后的任务风险等级 |
| `summary` | string | 是 | 风险摘要 |
| `total_findings` | number | 是 | 总发现数或总告警数 |
| `info_count` | number | 是 | 信息级数量 |
| `low_count` | number | 是 | 低风险数量 |
| `medium_count` | number | 是 | 中风险数量 |
| `high_count` | number | 是 | 高风险数量 |
| `critical_count` | number | 是 | 严重风险数量 |
| `blocked_count` | number | 否 | 阻断数量，主要用于沙箱任务 |
| `top_risks` | string[] | 否 | 重点风险摘要列表 |
| `updated_at` | string | 是 | 最近更新时间 |

#### JSON 示例

```json
{
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "status": "finished",
  "risk_level": "high",
  "summary": "1 high risk finding and 2 medium risk findings detected",
  "total_findings": 3,
  "info_count": 0,
  "low_count": 0,
  "medium_count": 2,
  "high_count": 1,
  "critical_count": 0,
  "blocked_count": 0,
  "top_risks": [
    "Management endpoint exposed without authentication",
    "Debug interface is publicly reachable"
  ],
  "updated_at": "2026-04-01T09:31:30Z"
}
```

## 5. 三类核心结果对象

### 5.1 AssetScanResult

`AssetScanResult` 用于描述资产测绘与指纹识别的输出结果。

#### 字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `result_id` | string | 是 | 结果唯一标识 |
| `task_id` | string | 是 | 关联任务 ID |
| `task_type` | string | 是 | 固定为 `asset_scan` |
| `engine_type` | string | 是 | 固定为 `asset_scan` |
| `status` | string | 是 | 结果状态 |
| `risk_level` | string | 是 | 汇总风险等级 |
| `summary` | string | 是 | 结果摘要 |
| `target` | object | 是 | 资产目标信息 |
| `fingerprint` | object | 是 | 指纹识别信息 |
| `confidence` | number | 是 | 指纹识别置信度，范围建议为 `0` 到 `1` |
| `matched_features` | string[] | 否 | 命中的指纹特征列表 |
| `open_ports` | array | 否 | 探测到的开放端口 |
| `http_endpoints` | array | 否 | 探测到的 HTTP 接口或路径 |
| `auth_detected` | boolean | 是 | 是否识别到认证机制 |
| `findings` | array | 否 | 资产风险发现列表 |
| `created_at` | string | 是 | 结果创建时间 |
| `updated_at` | string | 是 | 最近更新时间 |
| `started_at` | string | 否 | 执行开始时间 |
| `finished_at` | string | 否 | 执行完成时间 |
| `metadata` | object | 否 | 资产扫描扩展字段 |

补充说明：

- 当前 backend 在 `asset_scan` 任务创建阶段不会执行真实探测，但如果任务参数提供 `sample_ref`，初始结果会基于离线样本预填 `fingerprint`、`confidence`、`matched_features`、`open_ports` 与 `http_endpoints`。
- 当规则命中分数低于 `0.70` 时，结果仍会保留 `confidence` 与辅助线索，但不会输出 `fingerprint` 直出结论。

#### fingerprint 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `agent_name` | string | 否 | 识别出的 Agent 名称 |
| `framework` | string | 否 | 识别出的框架 |
| `model_provider` | string | 否 | 模型供应商 |
| `runtime` | string | 否 | 运行时环境 |
| `version` | string | 否 | 版本信息 |

#### open_ports 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `port` | number | 是 | 端口号 |
| `protocol` | string | 是 | 协议，例如 `tcp` |
| `service` | string | 否 | 识别出的服务名 |
| `status` | string | 否 | 端口状态，例如 `open` |

#### http_endpoints 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `method` | string | 是 | 请求方法 |
| `path` | string | 是 | 路径 |
| `status_code` | number | 否 | 探测返回状态码 |
| `auth_required` | boolean | 否 | 是否需要认证 |
| `description` | string | 否 | 说明 |

#### findings 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `title` | string | 是 | 风险标题 |
| `risk_level` | string | 是 | 风险等级 |
| `reason` | string | 是 | 风险原因 |
| `evidence` | string[] | 否 | 证据列表 |
| `recommendation` | string | 否 | 修复建议 |

#### JSON 示例

```json
{
  "result_id": "result_asset_0001",
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "engine_type": "asset_scan",
  "status": "finished",
  "risk_level": "high",
  "summary": "Detected exposed management endpoints and missing authentication",
  "target": {
    "target_type": "url",
    "target_value": "https://demo-agent.example.com",
    "display_name": "Demo Agent"
  },
  "fingerprint": {
    "agent_name": "demo-agent",
    "framework": "langchain",
    "model_provider": "openai",
    "runtime": "nodejs",
    "version": "0.9.3"
  },
  "confidence": 0.93,
  "matched_features": [
    "x-agent-framework: langchain",
    "/api/agent/status endpoint detected",
    "OpenAI compatible response pattern"
  ],
  "open_ports": [
    {
      "port": 80,
      "protocol": "tcp",
      "service": "http",
      "status": "open"
    },
    {
      "port": 443,
      "protocol": "tcp",
      "service": "https",
      "status": "open"
    }
  ],
  "http_endpoints": [
    {
      "method": "GET",
      "path": "/health",
      "status_code": 200,
      "auth_required": false,
      "description": "Health check endpoint"
    },
    {
      "method": "GET",
      "path": "/api/admin/config",
      "status_code": 200,
      "auth_required": false,
      "description": "Management configuration endpoint"
    }
  ],
  "auth_detected": false,
  "findings": [
    {
      "title": "Management endpoint exposed",
      "risk_level": "high",
      "reason": "Sensitive management endpoint is reachable without authentication",
      "evidence": [
        "GET /api/admin/config -> 200",
        "No authentication challenge observed"
      ],
      "recommendation": "Restrict management endpoints and enforce authentication"
    }
  ],
  "created_at": "2026-04-01T09:30:12Z",
  "updated_at": "2026-04-01T09:31:30Z",
  "started_at": "2026-04-01T09:30:08Z",
  "finished_at": "2026-04-01T09:31:28Z"
}
```

### 5.2 StaticAnalysisResult

`StaticAnalysisResult` 用于描述 Skills 静态安全检测结果。

#### 字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `result_id` | string | 是 | 结果唯一标识 |
| `task_id` | string | 是 | 关联任务 ID |
| `task_type` | string | 是 | 固定为 `static_analysis` |
| `engine_type` | string | 是 | 固定为 `skills_static` |
| `status` | string | 是 | 结果状态 |
| `risk_level` | string | 是 | 汇总风险等级 |
| `summary` | string | 是 | 结果摘要 |
| `sample_name` | string | 是 | 样本或 Skills 包名称 |
| `language` | string | 是 | 主语言类型 |
| `entry_files` | string[] | 否 | 入口文件列表 |
| `files_scanned` | number | 否 | 已扫描文件数 |
| `rule_hits` | array | 是 | 规则命中列表 |
| `sensitive_capabilities` | string[] | 否 | 检测到的敏感能力列表 |
| `dependency_summary` | object | 否 | 依赖统计摘要 |
| `created_at` | string | 是 | 结果创建时间 |
| `updated_at` | string | 是 | 最近更新时间 |
| `started_at` | string | 否 | 执行开始时间 |
| `finished_at` | string | 否 | 执行完成时间 |
| `metadata` | object | 否 | 静态分析扩展字段 |

#### rule_hits 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `rule_id` | string | 是 | 规则唯一标识 |
| `rule_name` | string | 是 | 规则名称 |
| `severity` | string | 是 | 风险严重度，建议与 `RiskLevel` 对齐 |
| `file` | string | 是 | 命中文件路径 |
| `line_start` | number | 否 | 起始行号 |
| `line_end` | number | 否 | 结束行号 |
| `reason` | string | 是 | 命中原因 |
| `snippet` | string | 否 | 相关代码片段摘要 |
| `recommendation` | string | 否 | 修复建议 |

#### dependency_summary 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `total_dependencies` | number | 否 | 总依赖数量 |
| `risky_dependencies` | number | 否 | 风险依赖数量 |
| `unknown_dependencies` | number | 否 | 未识别依赖数量 |

#### JSON 示例

```json
{
  "result_id": "result_static_0001",
  "task_id": "task_20260401_0002",
  "task_type": "static_analysis",
  "engine_type": "skills_static",
  "status": "finished",
  "risk_level": "critical",
  "summary": "Detected command execution and unrestricted file write behaviors",
  "sample_name": "demo-email-skill",
  "language": "typescript",
  "entry_files": [
    "src/index.ts"
  ],
  "files_scanned": 12,
  "rule_hits": [
    {
      "rule_id": "SK001",
      "rule_name": "dangerous-command-execution",
      "severity": "critical",
      "file": "src/index.ts",
      "line_start": 18,
      "line_end": 21,
      "reason": "User-controlled input is passed into shell execution",
      "snippet": "exec(userInput)",
      "recommendation": "Remove shell execution or strictly validate command input"
    },
    {
      "rule_id": "SK014",
      "rule_name": "unrestricted-file-write",
      "severity": "high",
      "file": "src/utils/export.ts",
      "line_start": 42,
      "line_end": 48,
      "reason": "Arbitrary file path is accepted without allowlist restriction",
      "recommendation": "Restrict writable directories and validate file path"
    }
  ],
  "sensitive_capabilities": [
    "command_execution",
    "file_write",
    "outbound_network"
  ],
  "dependency_summary": {
    "total_dependencies": 18,
    "risky_dependencies": 1,
    "unknown_dependencies": 2
  },
  "created_at": "2026-04-01T10:10:00Z",
  "updated_at": "2026-04-01T10:10:30Z",
  "started_at": "2026-04-01T10:09:58Z",
  "finished_at": "2026-04-01T10:10:28Z"
}
```

### 5.3 SandboxRunResult (沙箱运行结果)

`SandboxRunResult` 在第一版中通过 `BaseResult.details` 承载沙箱会话的完整监督数据，包含事件流、策略决策、告警和阻断记录。

#### 通用事件信封字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `event_id` | string | 是 | 事件唯一标识 |
| `session_id` | string | 是 | 沙箱会话 ID |
| `sequence` | number | 是 | 事件序号（正整数，严格递增） |
| `event_type` | string | 是 | 事件类型，见下方七类事件 |
| `occurred_at` | string | 是 | 事件发生时间（ISO 8601） |
| `source` | string | 是 | 事件来源：`model` / `agent` / `tool` / `policy` / `memory` / `monitor` |
| `scenario_id` | string | 否 | 关联场景 ID |
| `case_id` | string | 否 | 关联案例 ID |
| `evidence_refs` | string[] | 是 | 证据引用列表 |
| `payload` | object | 是 | 按事件类型承载不同负载 |

#### 七类事件类型

| 事件类型 | 含义 | payload 关键字段 |
| --- | --- | --- |
| `model_input` | 模型输入事件 | `model_ref`, `content_ref`, `content_sha256`, `summary` |
| `model_output` | 模型输出事件 | `model_ref`, `content_ref`, `content_sha256` |
| `tool_request` | 工具请求事件 | `call_id`, `tool_name`, `target_ref`, `arguments_ref` |
| `tool_result` | 工具结果事件 | `call_id`, `tool_name`, `status`, `result_ref`, `state_change` |
| `policy_decision` | 策略决策事件 | `decision_id`, `subject_event_id`, `policy_id`, `action`, `reason_code`, `reason`, `decided_at` |
| `memory_write` | 记忆写入事件 | `memory_entry_id`, `content_ref`, `content_sha256`, `summary` |
| `memory_read` | 记忆读取事件 | `memory_entry_id`, `content_ref`, `content_sha256` |

`tool_result.payload.state_change` is a closed set: `none`,
`outbox_append`, `virtual_file_write`, or `simulated`.

原始模型内容不直接跨越 shared 边界，而是通过 `content_ref`（内容引用）、`content_sha256`（SHA-256 摘要）和可选的 `summary` 字段表示。

#### 四类策略动作

| 动作 | 含义 | 说明 |
| --- | --- | --- |
| `allow` | 放行 | 允许操作继续执行 |
| `deny` | 拒绝 | 拒绝操作并生成阻断记录 |
| `ask` | 询问 | 需要人工或上级策略进一步判定 |
| `alert` | 告警 | 允许操作但生成告警记录 |

旧版 `action: "block"` 已废弃，替换为 `deny` 决策加关联 `blocked_records` 条目。

#### PolicyDecision 字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `decision_id` | string | 是 | 决策唯一标识 |
| `subject_event_id` | string | 是 | 被裁决的事件 ID |
| `policy_id` | string | 是 | 命中的策略 ID |
| `action` | string | 是 | 策略动作，取值见上表 |
| `reason_code` | string | 是 | 决策原因代码 |
| `reason` | string | 是 | 决策原因描述 |
| `evidence_refs` | string[] | 是 | 证据引用 |
| `decided_at` | string | 是 | 决策时间（ISO 8601） |

#### SandboxAlert 字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `alert_id` | string | 是 | 告警唯一标识 |
| `subject_event_id` | string | 是 | 被裁决的事件 ID |
| `decision_id` | string | 是 | 关联决策 ID（action 必须为 `alert`） |
| `risk_level` | string | 是 | 告警风险等级：`info` / `low` / `medium` / `high` / `critical` |
| `category` | string | 是 | 告警分类 |
| `title` | string | 是 | 告警标题 |
| `reason` | string | 是 | 告警原因 |
| `evidence_refs` | string[] | 是 | 证据引用 |
| `occurred_at` | string | 是 | 告警时间（ISO 8601） |

#### SandboxBlockedRecord 字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `blocked_record_id` | string | 是 | 阻断记录唯一标识 |
| `subject_event_id` | string | 是 | 被裁决的事件 ID |
| `decision_id` | string | 是 | 关联决策 ID（action 必须为 `deny`） |
| `resource_ref` | string | 否 | 被阻断的资源引用 |
| `reason` | string | 是 | 阻断原因 |
| `evidence_refs` | string[] | 是 | 证据引用 |
| `occurred_at` | string | 是 | 阻断时间（ISO 8601） |

#### 终态约束

- 终态结果（`status` 为 `finished` 或 `blocked`）必须包含完整的 `events`、`policy_decisions`、`alerts`、`blocked_records` 集合。
- `event_count` 必须等于 `events` 数组长度。
- `blocked` 为 `true` 当且仅当 `blocked_records` 非空。
- 每个 `alert` 决策必须至少有一个关联告警记录；每个 `deny` 决策必须至少有一个关联阻断记录。
- `pending` 状态的沙箱结果壳子保持兼容，不要求完整监督数据。

#### JSON 示例（blocked 结果）

```json
{
  "task_id": "task_sandbox_001",
  "task_type": "sandbox_run",
  "engine_type": "sandbox",
  "status": "blocked",
  "risk_level": "critical",
  "summary": "Sandbox blocked a tool request targeting an unapproved recipient",
  "details": {
    "session_id": "session_001",
    "events": [
      {
        "event_id": "event_tool_001",
        "session_id": "session_001",
        "sequence": 1,
        "event_type": "tool_request",
        "occurred_at": "2026-06-27T08:00:01Z",
        "source": "agent",
        "evidence_refs": ["evidence://tool/request/001"],
        "payload": {
          "call_id": "call_001",
          "tool_name": "send_email",
          "target_ref": "recipient://outside.example",
          "arguments_ref": "fixture://cases/T1-SC-002-C01/tool-request"
        }
      },
      {
        "event_id": "event_decision_001",
        "session_id": "session_001",
        "sequence": 2,
        "event_type": "policy_decision",
        "occurred_at": "2026-06-27T08:00:02Z",
        "source": "policy",
        "evidence_refs": ["evidence://decision/001"],
        "payload": {
          "decision_id": "decision_001",
          "subject_event_id": "event_tool_001",
          "policy_id": "policy_tool_target",
          "action": "deny",
          "reason_code": "target_not_approved",
          "reason": "Target is outside the approved fixture set",
          "evidence_refs": ["evidence://decision/001"],
          "decided_at": "2026-06-27T08:00:02Z"
        }
      }
    ],
    "policy_decisions": [
      {
        "decision_id": "decision_001",
        "subject_event_id": "event_tool_001",
        "policy_id": "policy_tool_target",
        "action": "deny",
        "reason_code": "target_not_approved",
        "reason": "Target is outside the approved fixture set",
        "evidence_refs": ["evidence://decision/001"],
        "decided_at": "2026-06-27T08:00:02Z"
      }
    ],
    "alerts": [],
    "blocked_records": [
      {
        "blocked_record_id": "blocked_001",
        "subject_event_id": "event_tool_001",
        "decision_id": "decision_001",
        "resource_ref": "recipient://outside.example",
        "reason": "Policy denied the target",
        "evidence_refs": ["evidence://blocked/001"],
        "occurred_at": "2026-06-27T08:00:02Z"
      }
    ],
    "blocked": true,
    "event_count": 2
  },
  "created_at": "2026-06-27T08:00:00Z",
  "updated_at": "2026-06-27T08:00:01Z"
}
```

## 6. 第一版 REST API

### 6.1 统一说明

当前仓库已落地的第一版 REST API 只定义平台对前端暴露的最小联调接口，默认由后端对三个引擎完成内部调度。

约定如下：

- 当前 `REQ-02` 已实现的接口包括：
  - `GET /health`
  - `POST /api/tasks`
  - `GET /api/tasks`
  - `GET /api/tasks/:taskId`
  - `GET /api/tasks/:taskId/result`
  - `GET /api/tasks/:taskId/risk-summary`
- 创建任务接口在任务成功写入内存仓库后立即返回 `Task`
- 创建成功后默认返回 HTTP `201`
- 查询成功返回 HTTP `200`
- 参数错误返回 HTTP `400`
- 未找到任务返回 HTTP `404`
- 服务内部异常返回 HTTP `500`
- 当前最小任务中枢会在创建任务时同步生成初始 `BaseResult` 与初始 `RiskSummary` 占位对象，因此 `GET /result` 与 `GET /risk-summary` 在 `pending` 状态下也返回 `200`

### 6.2 GET /health

#### 用途

健康检查，用于本地联调与后续部署探活。

#### 返回结构

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "ok"
  },
  "error_code": null,
  "request_id": "req_000001"
}
```

### 6.3 POST /api/tasks

#### 用途

创建统一任务。当前通过 `task_type` 区分 `asset_scan`、`static_analysis`、`sandbox_run` 三类任务。

#### 请求参数

```json
{
  "task_type": "asset_scan",
  "title": "Scan demo public agent",
  "requested_by": "alice",
  "target": {
    "target_type": "url",
    "target_value": "https://demo-agent.example.com",
    "display_name": "Demo Agent"
  },
  "parameters": {
    "sample_ref": "samples/assets/fingerprint-positive/ollama.s001.json"
  }
}
```

FOFA dev 侧接入示例：

```json
{
  "task_type": "asset_scan",
  "title": "FOFA ollama scan http://47.113.241.78:11434",
  "requested_by": "fofa-dev-script",
  "target": {
    "target_type": "url",
    "target_value": "http://47.113.241.78:11434",
    "display_name": "ollama candidate http://47.113.241.78:11434",
    "metadata": {
      "intel_source": "fofa_api",
      "source_ip": "47.113.241.78",
      "source_port": 11434,
      "source_protocol": "http"
    }
  },
  "parameters": {
    "probe_mode": "live",
    "probe_target_id": "ollama",
    "probe_port_hint": 11434,
    "intel_source": "fofa_api"
  }
}
```

#### 返回结构

- `data` 返回 `Task`

#### 成功示例

```json
{
  "success": true,
  "message": "Task created successfully",
  "data": {
    "task_id": "task_20260401_0001",
    "task_type": "asset_scan",
    "engine_type": "asset_scan",
    "status": "pending",
    "title": "Scan demo public agent",
    "requested_by": "alice",
    "target": {
      "target_type": "url",
      "target_value": "https://demo-agent.example.com",
      "display_name": "Demo Agent"
    },
    "parameters": {
      "enable_http_probe": true,
      "enable_port_scan": true,
      "timeout_seconds": 60
    },
    "risk_level": "info",
    "summary": "Task accepted and waiting for engine dispatch",
    "created_at": "2026-04-01T09:30:00Z",
    "updated_at": "2026-04-01T09:30:00Z"
  },
  "error_code": null,
  "request_id": "req_9aef001"
}
```

#### 失败示例

```json
{
  "success": false,
  "message": "Invalid task creation request",
  "data": null,
  "error_code": "INVALID_REQUEST",
  "request_id": "req_9aef002"
}
```

### 6.4 GET /api/tasks

#### 用途

查询当前内存仓库中的任务列表。

#### 返回结构

- `data` 返回 `Task[]`

#### 成功示例

```json
{
  "success": true,
  "message": "Tasks fetched successfully",
  "data": [
    {
      "task_id": "task_20260401_0001",
      "task_type": "asset_scan",
      "engine_type": "asset_scan",
      "status": "pending",
      "title": "Scan demo public agent",
      "target": {
        "target_type": "url",
        "target_value": "https://demo-agent.example.com",
        "display_name": "Demo Agent"
      },
      "risk_level": "info",
      "summary": "Task accepted and waiting for engine dispatch",
      "created_at": "2026-04-01T09:30:00Z",
      "updated_at": "2026-04-01T09:30:00Z"
    },
    {
      "task_id": "task_20260401_0002",
      "task_type": "static_analysis",
      "engine_type": "skills_static",
      "status": "pending",
      "title": "Analyze demo email skill",
      "target": {
        "target_type": "skill_package",
        "target_value": "samples/skills/demo-email-skill",
        "display_name": "demo-email-skill"
      },
      "risk_level": "info",
      "summary": "Task accepted and waiting for engine dispatch",
      "created_at": "2026-04-01T10:00:00Z",
      "updated_at": "2026-04-01T10:00:00Z"
    }
  ],
  "error_code": null,
  "request_id": "req_9aef010"
}
```

### 6.5 GET /api/tasks/:taskId

查询任务详情与当前状态。

#### 路径参数

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `taskId` | string | 是 | 任务 ID |

#### 返回结构

- `data` 返回 `Task`

#### 成功示例

```json
{
  "success": true,
  "message": "Task fetched successfully",
  "data": {
    "task_id": "task_20260401_0002",
    "task_type": "static_analysis",
    "engine_type": "skills_static",
    "status": "pending",
    "title": "Analyze demo email skill",
    "requested_by": "alice",
    "target": {
      "target_type": "skill_package",
      "target_value": "samples/skills/demo-email-skill",
      "display_name": "demo-email-skill"
    },
    "parameters": {
      "language": "typescript",
      "rule_pack": "default-v1",
      "include_dependencies": true
    },
    "risk_level": "info",
    "summary": "Task accepted and waiting for engine dispatch",
    "created_at": "2026-04-01T10:00:00Z",
    "updated_at": "2026-04-01T10:00:00Z"
  },
  "error_code": null,
  "request_id": "req_9aef100"
}
```

#### 失败示例

```json
{
  "success": false,
  "message": "Task not found",
  "data": null,
  "error_code": "TASK_NOT_FOUND",
  "request_id": "req_9aef101"
}
```

### 6.6 GET /api/tasks/:taskId/result

#### 用途

查询任务结果详情。当前最小后端骨架会在创建任务时同步生成统一 `BaseResult` 外层，并将任务细节放入 `details`。

#### 路径参数

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `taskId` | string | 是 | 任务 ID |

#### 返回结构

```json
{
  "task_id": "task_20260401_0001",
  "task_type": "asset_scan",
  "engine_type": "asset_scan",
  "status": "pending",
  "risk_level": "info",
  "summary": "Task accepted and waiting for engine dispatch",
  "details": {}
}
```

#### 成功示例

```json
{
  "success": true,
  "message": "Task result fetched successfully",
  "data": {
    "task_id": "task_20260401_0001",
    "task_type": "asset_scan",
    "engine_type": "asset_scan",
    "status": "pending",
    "risk_level": "info",
    "summary": "Task accepted and waiting for engine dispatch",
    "details": {
      "target": {
        "target_type": "url",
        "target_value": "https://demo-agent.example.com",
        "display_name": "Demo Agent"
      },
      "findings": [
      ]
    },
    "created_at": "2026-04-01T09:30:12Z",
    "updated_at": "2026-04-01T09:30:12Z"
  },
  "error_code": null,
  "request_id": "req_9aef110"
}
```

#### 失败示例

```json
{
  "success": false,
  "message": "Task not found",
  "data": null,
  "error_code": "TASK_NOT_FOUND",
  "request_id": "req_9aef111"
}
```

### 6.7 GET /api/tasks/:taskId/risk-summary

#### 用途

查询任务级风险汇总，便于前端在列表页和详情页快速展示风险概况。

#### 路径参数

| 参数 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `taskId` | string | 是 | 任务 ID |

#### 返回结构

- `data` 返回 `RiskSummary`

#### 成功示例

```json
{
  "success": true,
  "message": "Risk summary fetched successfully",
  "data": {
    "task_id": "task_20260401_0001",
    "task_type": "asset_scan",
    "status": "pending",
    "risk_level": "info",
    "summary": "Task accepted and waiting for engine dispatch",
    "total_findings": 0,
    "info_count": 0,
    "low_count": 0,
    "medium_count": 0,
    "high_count": 0,
    "critical_count": 0,
    "updated_at": "2026-04-01T09:30:12Z"
  },
  "error_code": null,
  "request_id": "req_9aef130"
}
```

#### 失败示例

```json
{
  "success": false,
  "message": "Task not found",
  "data": null,
  "error_code": "TASK_NOT_FOUND",
  "request_id": "req_9aef131"
}
```

### 6.8 保留接口：GET /api/tasks/:taskId/logs

当前该接口仍处于文档保留状态，尚未在 `REQ-02` 中实现。后续如果任务中心开始接入真实调度与执行日志，再补充日志对象契约与接口测试。

## 7. 统一返回格式

### 7.1 返回结构

平台对前端暴露的第一版接口统一采用如下外层返回格式：

```json
{
  "success": true,
  "message": "Task fetched successfully",
  "data": {},
  "error_code": null,
  "request_id": "req_9aef100"
}
```

### 7.2 字段说明

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `success` | boolean | 是 | 是否成功 |
| `message` | string | 是 | 面向调用方的简要说明 |
| `data` | object \| array \| null | 是 | 实际返回数据 |
| `error_code` | string \| null | 是 | 统一错误码，成功时为 `null` |
| `request_id` | string | 是 | 请求追踪 ID，用于日志定位和排障 |

### 7.3 推荐原因

- 前端处理成本低，所有接口都有统一的成功与失败外层结构。
- 后端便于接入统一日志与错误码体系。
- 出现联调问题时，可以通过 `request_id` 快速关联平台日志和引擎日志。
- 后续扩展国际化消息、错误码映射、审计记录时，外层协议不需要变更。

### 7.4 推荐错误码

| 错误码 | 说明 |
| --- | --- |
| `INVALID_REQUEST` | 请求格式不合法 |
| `INVALID_TARGET` | 目标参数不合法 |
| `UNSUPPORTED_RULE_PACK` | 不支持的规则集 |
| `MISSING_SANDBOX_PROFILE` | 缺少沙箱策略配置 |
| `TASK_NOT_FOUND` | 任务不存在 |
| `RESULT_NOT_READY` | 结果尚未生成 |
| `RISK_SUMMARY_NOT_AVAILABLE` | 风险摘要尚不可用 |
| `ENGINE_DISPATCH_FAILED` | 引擎分发失败 |
| `INTERNAL_ERROR` | 内部服务错误 |

## 8. 字段字典

### 8.1 通用字段

| 字段 | 含义 |
| --- | --- |
| `task_id` | 任务唯一标识 |
| `task_type` | 任务类型 |
| `engine_type` | 引擎类型 |
| `status` | 任务或结果状态 |
| `risk_level` | 风险等级 |
| `summary` | 摘要描述 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |
| `started_at` | 开始时间 |
| `finished_at` | 完成时间 |
| `metadata` | 扩展字段 |

### 8.2 资产测绘字段

| 字段 | 含义 |
| --- | --- |
| `target` | 资产目标对象 |
| `fingerprint` | 指纹识别结果 |
| `confidence` | 指纹识别置信度 |
| `matched_features` | 命中的特征列表 |
| `open_ports` | 开放端口列表 |
| `http_endpoints` | HTTP 端点列表 |
| `auth_detected` | 是否检测到认证机制 |
| `findings` | 风险发现列表 |

### 8.3 静态分析字段

| 字段 | 含义 |
| --- | --- |
| `sample_name` | 样本或 Skills 包名称 |
| `language` | 主语言 |
| `entry_files` | 入口文件列表 |
| `files_scanned` | 已扫描文件数量 |
| `rule_hits` | 规则命中明细 |
| `rule_id` | 规则 ID |
| `rule_name` | 规则名称 |
| `severity` | 命中严重度 |
| `file` | 命中文件 |
| `line_start` | 起始行号 |
| `line_end` | 结束行号 |
| `reason` | 命中原因 |
| `sensitive_capabilities` | 敏感能力集合 |
| `dependency_summary` | 依赖摘要 |

### 8.4 动态沙箱字段

| 字段 | 含义 |
| --- | --- |
| `session_id` | 沙箱执行会话 ID |
| `events` | 行为事件列表（七类事件） |
| `event_id` | 事件唯一标识 |
| `sequence` | 事件序号 |
| `event_type` | 运行时事件类型（七类） |
| `source` | 事件来源（model/agent/tool/policy/memory/monitor） |
| `evidence_refs` | 证据引用列表 |
| `payload` | 事件负载（按类型区分） |
| `policy_decisions` | 策略决策列表 |
| `decision_id` | 决策唯一标识 |
| `subject_event_id` | 被裁决的事件 ID |
| `action` | 策略动作（allow/deny/ask/alert） |
| `reason_code` | 决策原因代码 |
| `decided_at` | 决策时间 |
| `alerts` | 告警记录列表 |
| `alert_id` | 告警 ID |
| `blocked_records` | 阻断记录列表 |
| `blocked_record_id` | 阻断记录 ID |
| `resource_ref` | 被阻断资源引用 |
| `blocked` | 是否发生阻断（blocked_records 非空时为 true） |
| `event_count` | 会话内事件总数（须等于 events.length） |

## 9. 后续演进建议

### 9.1 当前第一版契约解决了什么问题

- 明确了以 `Task` 为核心的主流程，便于前后端和引擎先围绕同一生命周期协作。
- 统一了三类任务的状态枚举、风险等级和结果外层结构。
- 为前端页面联调提供了稳定的查询对象和响应格式。
- 为后端任务中心、结果中心、日志中心提供了第一版数据边界。

### 9.2 当前版本暂时不做什么

- 不定义复杂筛选、分页和排序协议
- 不定义权限系统和多租户模型
- 不定义批量任务和批量结果下载协议
- 不固定引擎回调接口或消息队列协议
- 不设计报表导出、通知中心、工作流审批等平台扩展能力

### 9.3 后续可扩展方向

- WebSocket 或 SSE 实时日志推送
- 引擎回调机制和异步结果上报接口
- 批量任务创建与批量结果查询
- 报告导出接口
- 权限系统、审计系统和操作留痕
- 任务取消、重试、重新执行接口
- 风险标签体系、规则管理体系和基线对比能力
- 分页查询任务列表与结果列表

## 10. 实施建议

为了尽快把本契约落到代码中，建议按以下顺序推进：

1. 在 `shared/contracts` 中定义本文件对应的 TypeScript 接口与运行时规范化函数。该步骤已在 `REQ-01` 中完成第一版落地。
2. 在 `backend` 中先实现任务创建、任务查询和结果查询的 mock API。
3. 在 `engines/*` 中为三类结果各准备一份样例 JSON。
4. 在前端先基于 `Task`、`RiskSummary` 和三类结果对象完成静态页面联调。

以上步骤完成后，再进入引擎实际接入与状态流转细化阶段。
## REQ-06 Frontend Integration Baseline

当前前端最小联调闭环已经消费以下后端路径：

- `GET /api/tasks`
- `GET /api/tasks/:taskId`
- `GET /api/tasks/:taskId/result`
- `GET /api/tasks/:taskId/risk-summary`

前端 service 层默认采用 `api-preferred` 模式：

- 优先请求 backend tasks API
- 若接口不可用、响应不合法或本地未启动后端，则回退到 frontend mock 数据
- 测试或纯前端隔离场景可使用 `mock-only` 模式，避免真实网络请求

页面数据流约定如下：

- Tasks page 通过 `GET /api/tasks` 获取任务列表，并使用 `shared` 契约规范化为 `Task[]`
- Task detail page 并行获取任务详情、统一结果外壳和风险摘要，并在前端合成为稳定页面模型
- 所有联调数据都必须先经过 `shared/contracts/*` 归一化，再进入 React 页面和组件

本地开发环境下，frontend dev server 通过 Vite proxy 将 `/api` 与 `/health` 转发到 `http://127.0.0.1:3000`。
## REQ-07 Backend Engine Adapter Baseline

本 requirement 不新增新的对外 HTTP 路由，但补充 backend 内部稳定的引擎接入边界，供后续真实引擎实现复用。

当前 backend 内部保留的稳定 handoff 对象为：

- `EngineDispatchTicket`
  - `task_id`
  - `task_type`
  - `engine_type`
  - `payload`

当前三类任务预留的 dispatch payload 形状如下：

- `asset_scan` -> `{ target, scan_parameters }`
- `static_analysis` -> `{ target, analysis_parameters }`
- `sandbox_run` -> `{ target, runtime_parameters }`

平台在真实引擎输出返回前，仍以统一壳子持有初始状态：

- `Task`
- `BaseResult`
- `RiskSummary`

`TaskEngineService.createInitialArtifacts(task)` 会基于 adapter 生成三类任务的初始结果细节，但这些 adapter payload 属于 backend 内部契约，不应直接暴露给 frontend。

## REQ-SKILLS-STATIC DTO Boundary Baseline

当前 `skills-static` 接入仍保持平台骨架阶段的最小边界，不新增新的 public API，也不引入真实扫描执行逻辑。

- 公共入口保持 `POST /api/tasks`
- `task_type = static_analysis` 固定映射到 `engine_type = skills_static`
- 请求中的 `parameters` 继续作为现有唯一明确的 engine options 插槽，在 adapter 内部映射为 `analysis_parameters`
- 结果仍统一收敛到 `BaseResult` 外壳：`status` / `risk_level` / `summary` / `details`
- `static_analysis` 的规则命中明细继续承载在 `details.rule_hits[]`

当前 shared 层已经补齐以下 skills-static 兼容类型：

- `SkillsStaticTarget`
- `SkillsStaticAnalysisParameters`
- `SkillsStaticRuleHit`
- `SkillsStaticResultDetails`
- `SkillsStaticBaseResult`

其中 `SkillsStaticRuleHit` 的最小兼容字段包括：

- `rule_id`
- `title`
- `category`
- `severity`
- `message`
- `file_path`
- `line_start`
- `line_end`
- `code_snippet`
- `evidence`
- `recommendation`
- `source_type`
- `sink_type`
- `trace`
- `tags`
- `metadata`

当前规范化约束保持保守：

- 只收敛 `static_analysis` 这一条结果细节路径
- 未声明的 rule-hit 私有调试字段不会透传到 shared `BaseResult.details`
- 不新增 `projectId`、`assetId`、`tenantId`、`risk_score`、上传、压缩包、对象存储、回调、重试等平台强约束字段
## REQ-08 Frontend Contract Health States

The frontend integration layer uses four source states when reading the existing tasks API:

- `api`: every payload required by the current page passed shared contract normalization.
- `degraded`: the backend returned a valid `Task`, but dependent payloads such as `result` or `risk-summary` had to be synthesized locally.
- `integration-error`: the backend responded, but at least one required payload failed shared contract normalization, so the UI fell back to mock-backed data instead of claiming a healthy backend connection.
- `mock`: the frontend is intentionally running in `mock-only` mode, or the backend is unavailable.

This distinction is part of the local integration contract because contract-invalid responses must stay visible during platform skeleton development instead of being misreported as healthy backend API data.
## REQ-09 Repository Contract Verification Gate

The repository-level contract verification gate now has one canonical full-stack entry:

- `npm run test`
- `npm run test:all`

Both commands are expected to cover all current contract consumers:

- repository script-definition checks
- shared contract tests
- backend unit and integration tests
- frontend rendering and integration tests

This rule exists so a green root test run means the current platform skeleton is green across shared, backend, and frontend boundaries instead of only across a subset of the repository.

## REQ-10 Frontend Data Source Indicator Scope

Frontend data-source indicators are page-scoped status signals, not global layout state.

- `Backend API`
- `Degraded API Data`
- `Integration Error`
- `Mock Fallback`

These labels should only appear inside pages or page-level sections that have actually resolved their own data source. The shared console layout header must stay neutral so it does not conflict with page-specific integration state.

## REQ-11 Backend Adapter Registration Guards

The backend engine handoff layer now enforces two internal consistency rules before a task is dispatched or mapped into initial artifacts:

- only one adapter may be registered for a given `task_type`
- `task.engine_type` must match the resolved adapter `engineType`

If either rule is violated, the backend raises a `DomainError` instead of silently continuing with an inconsistent engine handoff.

Current internal error codes:

- `ENGINE_ADAPTER_DUPLICATE_REGISTRATION`
- `ENGINE_ADAPTER_ENGINE_TYPE_MISMATCH`

These guards are internal backend contract protections. They are meant to surface wiring mistakes early while the three engine adapters remain placeholders and before real engine submit/poll/callback flows are added.

## REQ-12 Frontend Task Presentation Formatters

Task presentation labels that are reused across multiple frontend pages should be centralized behind shared frontend formatter utilities instead of being redefined per page.

Current shared formatter responsibilities:

- `task_type` -> stable operator-facing label
- task timestamps -> stable UTC `en-US` display label

This keeps the Tasks page and Task detail page aligned while the admin console grows. Shared platform contracts still live in `shared/`, but repeated view-only formatting logic should stay in one frontend utility instead of drifting across multiple components.
## Asset-Scan Step Contracts

The shared asset-scan types now include explicit engine-internal contracts for the first three runtime steps:

- `DiscoveryInput -> Asset[]`
- `PortScanInput -> PortInfo`
- `ProtocolInput -> ProtocolInfo`

Current field baseline:

- `Asset`: `asset_id`, `ip`, optional `domain`, `source[]`, `tags[]`, `timestamp`
- `PortInfo.ports[]`: `port`, `status`
- `ProtocolInfo.port_protocols[]`: `port`, `protocol`, optional `subprotocol`, `service`, optional `tls`
- `ProtocolInfo.confidence`: aggregated confidence for the inspected open ports

These contracts are shared for type consistency, but they are still engine-private runtime steps rather than frontend-facing public API payloads.

## REQ-ASSET-SCAN-PORT-007 Repository Workflow Script Contract

For requirement REQ-ASSET-SCAN-PORT-007, repository-side FOFA workflow scripts define a minimal execution/output contract that does not change public backend API routes.

Script entrypoints:

- `scripts/dev/intel/fofa-portscan-workflow.ts`
- `scripts/dev/intel/fofa-sample-export.ts`

`runFofaPortscanWorkflow` input (minimal):

- `targets[]` with `source_query/source_ip/source_port/protocol/target_value/probe_target_id/task_id/requested_by`
- `outputDir`
- command `runner`

`runFofaPortscanWorkflow` output summary:

- `total_targets`
- `naabu_success_targets`
- `nmap_attempted_targets`
- `verified_count`
- `candidate_count`
- `failed_count`

Sample output layering (separated files):

- `exposure-candidates.json`:
  - candidate-layer only, with source/task/audit fields
- `verified-fingerprints.json`:
  - verified fingerprint samples only
- `raw-evidence.json`:
  - raw tool outputs and tool exit codes for audit/replay

Boundary notes:

- `naabu` is limited to open-port detection.
- `nmap` is limited to service evidence on naabu-hit ports.
- Candidate and verified samples must stay separated; candidate records are not auto-promoted to verified without evidence.

## REQ-T1-SUPERVISION-UI-009 Supervision Console Read API

REQ-009 adds three read-only public GET routes that expose safe supervision projections of stored sandbox results. The routes never leak producer narrative, raw model/tool content, or engine-internal metadata.

### Public GET routes

- `GET /api/supervision/sessions` — overview (counts + session summaries)
- `GET /api/supervision/sessions/:sessionId` — single-session detail (events, decisions, alerts, blocked records)
- `GET /api/supervision/sessions/:sessionId/evidence` — deterministic sanitized evidence export

All three routes are wrapped in the standard `ApiResponse<T>` envelope (`success` / `message` / `data` / `error_code` / `request_id`).

### Query fields and validation

`GET /api/supervision/sessions` accepts the following optional query parameters, emitted in stable URL order:

- `q` (free-text fragment match against session/scenario/case IDs)
- `status` (`TaskStatus`)
- `risk_level` (`RiskLevel`)
- `action` (`SandboxPolicyAction`: `allow` / `deny` / `ask` / `alert`)
- `scenario_id`
- `tool_name` (one of the four approved tools: `send_email`, `read_file`, `write_file`, `call_api`)

Unknown or invalid filter values are removed from the URL rather than rejected. Filters are AND-combined.

### 100-row cap and count semantics

- `limit` is fixed at `100` and exposed in the overview payload.
- `matched_session_count` reflects the total number of sessions matching the filters before the cap.
- `returned_session_count` reflects the number of sessions actually returned (≤ `limit`).
- `truncated` is `true` when `matched_session_count > returned_session_count`.
- The `counts` object aggregates over all matched sessions (not just the returned page), so running/blocked/alert counts stay stable regardless of cap.

### Shared DTO names

All DTOs live in `shared/types/supervision.ts` and are normalized by `shared/contracts/supervision.ts`:

- `SandboxSupervisionOverview`
- `SandboxSupervisionCounts`
- `SandboxSupervisionSessionSummary`
- `SandboxSupervisionSessionDetail`
- `SandboxSupervisionEventView` (closed discriminated union over seven event types)
- `SandboxSupervisionDecisionView`
- `SandboxSupervisionAlertView`
- `SandboxSupervisionBlockedRecordView`
- `SandboxSupervisionEvidenceExport`

Schema versions are pinned via `SANDBOX_SUPERVISION_SCHEMA_VERSION` and `SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION`.

### Safe error codes

- `404` with `error_code: "SUPERVISION_SESSION_NOT_FOUND"` when the session ID does not exist.
- `404` with `error_code: "SUPERVISION_EVIDENCE_NOT_AVAILABLE"` when the session exists but `evidence_available` is `false`.
- `422` with `error_code: "SUPERVISION_PROJECTION_INVALID"` when the stored record cannot be projected (the projector raises a `DomainError` instead of returning a partial projection).
- `500` with `error_code: "INTERNAL_ERROR"` for unexpected failures.

### Evidence wrapper and download behavior

`GET /api/supervision/sessions/:sessionId/evidence` returns a `SandboxSupervisionEvidenceExport` with exactly three top-level keys:

- `schema_version` (`SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION`)
- `source_schema_version` (`SANDBOX_SUPERVISION_SCHEMA_VERSION`)
- `session` (the full `SandboxSupervisionSessionDetail`)

The export never includes `request_id`, `metadata`, decision `reason`, alert `title`/`reason`, blocked-record `reason`/`resource_ref`, or any producer narrative field. The frontend serializes the normalized export with `JSON.stringify(value, null, 2)` plus a trailing newline, and downloads it as `supervision-<sanitized-session-id>.json` via a transient blob URL that is revoked immediately after the click. The serialized bytes are deterministic for a given session ID.

## REQ-T1-DEMO-010 Track 1 Campaign Ingest and Read API

REQ-T1-DEMO-010 adds a split-listener architecture for Track 1 campaign supervision: an internal-only ingest listener and a public read API. The two listeners never share routes.

### Listener separation

- **Public listener** (`AppModule` + `matchRoute`): serves `/health`, `/api/tasks/*`, `/api/supervision/sessions/*`, and `/api/supervision/campaigns/*`. It never matches any `/internal/*` path.
- **Internal listener** (`InternalAppModule` + `matchInternalRoute`): serves `/internal/health` and the four campaign ingest write routes only. Every other path returns 404.

The split is enforced at the router level: `matchRoute` has no `/internal/` branch, and `matchInternalRoute` recognizes only health plus the four ingest routes.

### Internal ingest routes (authenticated)

All four internal routes require a `Authorization: Bearer <token>` header. Token comparison is timing-safe (both supplied and expected tokens are SHA-256 hashed before `timingSafeEqual`). The expected token is configured at internal module construction.

- `POST /internal/track1/campaigns` — start campaign (body: `Track1CampaignStartEnvelope`)
- `POST /internal/track1/campaigns/:campaignId/snapshots` — ingest snapshot (body: `Track1CampaignSnapshotEnvelope`)
- `POST /internal/track1/campaigns/:campaignId/finalize` — finalize campaign (body: `Track1CampaignFinalizeEnvelope`)
- `POST /internal/track1/campaigns/:campaignId/evidence` — register evidence (body: `Track1CampaignEvidenceRegistration`)

### Body limits

- Lifecycle envelopes (start, finalize, evidence registration): `TRACK1_LIFECYCLE_MAX_BYTES` = 256 KiB
- Snapshot envelopes: `TRACK1_SNAPSHOT_MAX_BYTES` = 2 MiB

Body limits are enforced on raw `Buffer.byteLength` before JSON parse. Oversized bodies are rejected with `400` and `error_code: "CAMPAIGN_BODY_TOO_LARGE"`.

### Lifecycle invariants

- Campaign start is idempotent on `campaign_manifest_sha256` — a second start with the same manifest returns the existing campaign summary.
- Snapshots form a hash chain: `previous_snapshot_sha256` must match the last accepted snapshot hash, or be `null` for the first snapshot. Sequence numbers must be gapless starting at 1.
- A second attempt is only allowed if the first attempt failed. Two passed attempts for the same case are rejected.
- Finalize requires all 9 cases to be terminal. A completed campaign requires every case to be `passed` (oracle match).
- Evidence registration is only allowed after finalize with `requested_status: "completed"`.

### Public read routes

- `GET /api/supervision/campaigns` — list campaign summaries (capped at 50)
- `GET /api/supervision/campaigns/:campaignId` — single-campaign detail (3 agents × 3 cases with content-free attempt summaries)
- `GET /api/supervision/campaigns/:campaignId/evidence` — deterministic evidence export

All three routes are wrapped in the standard `ApiResponse<T>` envelope.

### Query fields and validation (campaign list)

`GET /api/supervision/campaigns` accepts the following optional query parameters:

- `q` (free-text fragment match against campaign ID; max 128 characters)
- `status` (`Track1CampaignStatus`)
- `scenario_id` (`Track1ScenarioId`)
- `agent_id` (`Track1CampaignAgentId`)

Unknown keys, duplicate keys, empty-but-present enum values, and control characters are rejected with `400` and `error_code: "INVALID_CAMPAIGN_QUERY"`. Filters are AND-combined.

### 50-row cap and sort order

- List is capped at 50 entries.
- Sort order: `updated_at` descending (newest first), then `campaign_id` ascending.
- All counters in the summary are recomputed from stored attempts/results — callers cannot supply aggregate counters.

### Content-free detail projection

The campaign detail never copies raw result content into the response. Attempt summaries in the detail carry only:

- `campaign_id`, `agent_id`, `scenario_id`, `case_id` (fixed association IDs)
- `attempt_id`, `attempt_index`, `session_id`, `task_id` (identifier reuse)
- `status`, `actual_action` (derived from policy decisions)
- `started_at`, `updated_at` (timestamps)

The following fields are never present in attempt summaries: `events`, `policy_decisions`, `alerts`, `blocked_records`, `result`.

### Cross-agent validation

The projector rejects any attempt whose `agent_id` does not match the expected agent/scenario/case mapping with `500` and `error_code: "CAMPAIGN_PROJECTION_INVALID"`.

### Safe error codes

- `400` with `error_code: "INVALID_CAMPAIGN_QUERY"` for malformed query parameters.
- `400` with `error_code: "CAMPAIGN_BODY_TOO_LARGE"` for oversized request bodies.
- `401` with `error_code: "CAMPAIGN_INGEST_UNAUTHORIZED"` for missing or invalid bearer tokens.
- `404` with `error_code: "CAMPAIGN_NOT_FOUND"` when the campaign ID does not exist.
- `409` with `error_code: "CAMPAIGN_EVIDENCE_NOT_READY"` when evidence is requested before registration.
- `409` with `error_code: "CAMPAIGN_ALREADY_EXISTS"` for duplicate campaign start.
- `409` with `error_code: "CAMPAIGN_SNAPSHOT_CONFLICT"` for byte-mismatched snapshot retries.
- `409` with `error_code: "CAMPAIGN_SEQUENCE_INVALID"` for gap or broken hash chain.
- `409` with `error_code: "CAMPAIGN_SECOND_ATTEMPT_NOT_ALLOWED"` for retry after a passed first attempt.
- `409` with `error_code: "CAMPAIGN_INCOMPLETE"` for finalize with fewer than nine terminal cases.
- `500` with `error_code: "CAMPAIGN_PROJECTION_INVALID"` for inconsistent stored records.
- `500` with `error_code: "INTERNAL_ERROR"` for unexpected failures.

### Shared DTO names

All campaign DTOs live in `shared/types/campaign-supervision.ts` and `shared/types/campaign-ingest.ts`, normalized by `shared/contracts/campaign-supervision.ts` and `shared/contracts/campaign-ingest.ts`:

- `Track1CampaignSummary` (list item)
- `Track1CampaignDetail` (detail with 3 agents × 3 cases)
- `Track1CampaignAgentDetail`, `Track1CampaignCaseDetail`, `Track1CampaignAttemptSummary`
- `Track1CampaignEvidenceExport` (evidence with deterministic session refs)

Schema versions are pinned via `TRACK1_CAMPAIGN_READ_SCHEMA_VERSION` (`track1-campaign-read.v1`) and `TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION` (`track1-campaign-evidence.v1`).

### Runtime dependency composition

A single `createRuntimeDependencies()` composition root creates one `InMemoryTaskRepository` and one `InMemoryCampaignRepository`. Both the public `AppModule` and the internal `InternalAppModule` share the same repository instances, so writes from the internal listener are immediately visible to public reads.

## REQ-T1-DEMO-010 Phase 3 OpenClaw Plugin Internal Surface

Phase 3 adds the OpenClaw plugin integration layer that observes native hooks and ingests snapshots. The plugin does not expose new public API routes — it consumes the existing internal ingest routes through a typed client.

### Plugin manifest

`integrations/openclaw/openclaw.plugin.json` is a strict manifest with no unknown keys:

- `id`: `"agent-security-track1"`
- `main`: `"./src/plugin.ts"`
- `contracts.tools`: exactly `["send_email", "read_file", "write_file", "call_api"]`
- `configSchema`: closed object requiring `ingestEndpoint` and `ingestToken`. `ingestToken` is `writeOnly: true`. The default endpoint is `http://backend:3001/internal/track1/campaigns`.

### Native hook registration

`integrations/openclaw/src/plugin.ts` exports `registerTrack1Plugin` and `definePluginEntry`. It registers exactly seven typed hooks via `api.on`:

- `session_start`, `llm_input`, `llm_output`, `after_tool_call`, `agent_end`, `session_end` (default options)
- `before_tool_call` with `{ priority: 100, timeoutMs: 10_000 }`

Legacy `registerHook` is permanently prohibited.

The direct `openclaw agent` harness does not emit a per-run `session_start` or
`session_end`. On that path, `llm_input` lazily binds the canonical campaign
identity from the normalized input envelope, and `agent_end` is the terminal
attempt boundary. Session-oriented OpenClaw paths continue to use
`session_start` and `session_end`.

### Acknowledgement barrier and fail-closed semantics

For `allow`/`alert` decisions, `before_tool_call` ingests the snapshot before returning. Ingest failure converts the outcome into `{ block: true, blockReason: "security_monitor_unavailable" }`.

For `deny`/`ask` decisions, `before_tool_call` returns `{ block: true, blockReason: "policy_denied" | "policy_ask_required" }` without reaching tool execution.

Unknown tools are blocked with `{ block: true, blockReason: "tool_not_permitted" }` before touching the adapter.

### Ingest client contract

`integrations/openclaw/src/ingest-client.ts` exposes `Track1IngestClient`:

- Constructor validates the fixed endpoint: protocol `http:`, hostname `backend`, port `3001`, pathname `/internal/track1/campaigns`, no search/hash. Token must be non-empty.
- `appendSnapshot(campaignId, envelope)` builds URL `…/campaigns/<encoded-id>/snapshots/<sequence>`, sends `PUT` with `Authorization: Bearer <token>` and `AbortController` timeout (5000 ms).
- Accepts only `200` or `202`. Validates ack via `normalizeTrack1CampaignSnapshotAck` and verifies `campaign_id`, `attempt_id`, `sequence`, and `snapshot_sha256` match.
- The token is never included in error messages. Backend body is never echoed. All failures raise `Track1IngestError` with a stable code.

### Startup capability probe

`integrations/openclaw/src/runtime-probe.ts` exports `runTrack1PluginCapabilityProbe` and `TRACK1_PLUGIN_PROBE_COMMAND`. The probe result `Track1PluginProbeResult` has exactly nine canonical keys:

- `schema_version` (`"track1-openclaw-probe.v1"`)
- `plugin_id` (`"agent-security-track1"`)
- `runtime_version` (`"2026.6.10"`)
- `tool_names` (sorted: `call_api`, `read_file`, `send_email`, `write_file`)
- `hook_names` (sorted: seven canonical hooks)
- `before_tool_blocked` (`true`)
- `after_tool_observed` (`true`)
- `correlation_ready` (`true`)
- `diagnostics` (empty array)

The fixed runtime command is `openclaw plugins inspect agent-security-track1 --runtime --json`. Any missing capability, duplicate, version mismatch, failed blocking, missing after-observation, missing correlation, or diagnostic causes `track1_plugin_probe_failed`.

### Test script registration

- Root `test:integration:openclaw` runs all five Phase 3 spec files: `plugin-contract.spec.ts`, `campaign-context.spec.ts`, `ingest-client.spec.ts`, `plugin-hooks.spec.ts`, `plugin-runtime-probe.spec.ts`.
- Root `test:repo` includes `tests/repository/track1-openclaw-plugin.spec.ts` as a permanent gate.

### Explicit non-goals

The plugin does not expose any new public HTTP route, does not invoke real models or tools, does not manage campaign retry/attempt lifecycle, and does not produce frontend-facing payloads. Real Docker/OpenClaw runtime execution belongs to Phase 4.

## REQ-T1-DEMO-010 Phase 4 Real OpenClaw Runtime Orchestration Surface

Phase 4 adds no new public or internal HTTP route. It adds a fixed operator
CLI, an internal campaign runner state machine, and a shell-free OpenClaw
process invocation port, all consuming the Phase 1 shared contracts and the
Phase 2 internal ingest routes established by earlier phases.

### Operator CLI

```text
npm run demo:track1:openclaw
```

The entrypoint `scripts/track1/run-openclaw-campaign.ts` accepts no
arguments — any argument fails closed with `track1_entrypoint_arguments_not_supported`.
Required environment variables (`OPENCLAW_MODEL_BASE_URL`,
`OPENCLAW_MODEL_API_KEY`, `OPENCLAW_MODEL_ID`, `TRACK1_INGEST_TOKEN`) are
validated by `scripts/track1/environment.ts` before any preflight check
runs. Fixed safe stdout lines are `status=<value>`; the entrypoint never
prints a raw environment value, provider response, or exception message.

### Campaign runner ports (internal, not HTTP)

`scripts/track1/campaign-runner.ts` exports `Track1CampaignRunnerPorts`, an
injected-port interface (`preflight`, `createCampaign`, `compilePrompt`,
`invokeAgent`, `awaitAttempt`, `finalizeCampaign`, `now`, `randomHex32`,
`progress`). Production wiring composes these ports over the existing Phase 2
internal ingest client and the Phase 4 OpenClaw command port — no new route
is exposed. `awaitAttempt` is the sole source of a case's final action; the
runner never trusts CLI-claimed text.

### OpenClaw command port contract

`scripts/track1/openclaw-command.ts` exports `invokeOpenClawAgent`. The
production port spawns exactly:

```text
openclaw agent --agent <fixed-agent-id> --session-key <runner-generated-key> --message-file /run/track1/messages/<derived-attempt-id>.json --json
```

with `shell: false` and an allowlisted environment
(`OPENCLAW_MODEL_BASE_URL`, `OPENCLAW_MODEL_API_KEY`, `OPENCLAW_MODEL_ID`,
`PATH`, `HOME`). The safe result contains only `exit_code`, `agent_id`,
`session_key_sha256`, and `protocol_valid` — never raw stdout/stderr, model
text, or provider content.

### Retry classification (closed)

| Reason | Retryable |
| --- | --- |
| `provider_transport_failed` | yes |
| `model_protocol_invalid` | yes |
| `expected_tool_request_missing` | yes |
| `derived_action_mismatch` | yes |
| `preflight_failed` | no |
| `plugin_probe_failed` | no |
| `ingest_failed` | no |
| `correlation_invalid` | no |
| `real_side_effect_detected` | no |
| `content_boundary_violated` | no |
| `manifest_invalid` | no |

At most one retry per case. A second failure of any reason is terminal for
the whole campaign.

### Offline runtime gate

`npm run test:track1:openclaw` runs the Phase 3 integration suite plus the
full Phase 4 unit/repository suite (`test:track1:openclaw:unit`), including
`scripts/track1/offline-runtime-gate.ts`'s `runTrack1OfflineRuntimeGate`,
which builds the pinned image, checks the exact OpenClaw version, inspects
the real plugin runtime, and runs the dynamic capability probe — zero
cloud-model or agent invocations.

### Explicit non-goals

Phase 4 does not execute a real credentialed cloud-model campaign (Phase 7),
does not generate evidence or reports (Phase 6), and does not add or modify
any backend HTTP route.

## REQ-T1-DEMO-010 Phase 5 Campaign Supervision UI Frontend Contract

Phase 5 adds a read-only campaign supervision mode to the existing
`/results/sandbox` workbench. It consumes the Phase 1 read contracts and the
Phase 2 public campaign API. No new backend routes are introduced.

### Campaign service query order

`frontend/src/services/campaign-supervision-service.ts` serializes the
`CampaignQuery` in the exact order `q`, `status`, `scenario_id`, `agent_id`,
mirroring the backend `CampaignQuery` DTO so the two sides cannot drift.
`serializeCampaignQuery` validates the key set at runtime and throws on
unknown keys (exact-key normalizer). Empty values are dropped. IDs are
encoded as one path segment via `encodeURIComponent`.

Example: `{ agent_id: "agent:track1:tool-hijack", scenario_id: "T1-SC-002",
status: "running", q: "campaign" }` serializes to
`?q=campaign&status=running&scenario_id=T1-SC-002&agent_id=agent%3Atrack1%3Atool-hijack`.

### Campaign read endpoints

| Operation | Method | Path | Normalizer |
| --- | --- | --- | --- |
| List campaigns | `GET` | `/api/supervision/campaigns` | `normalizeTrack1CampaignSummary` (per item) |
| Get campaign | `GET` | `/api/supervision/campaigns/:campaignId` | `normalizeTrack1CampaignDetail` |
| Get evidence | `GET` | `/api/supervision/campaigns/:campaignId/evidence` | `normalizeTrack1CampaignEvidenceExport` |

### Failure boundary and no-mock-fallback rule

`CampaignDataResult<T>` carries `{ data, source, error }`:

- `source: "api"` — successful API read, data normalized and non-null.
- `source: "integration-error"` — API failure. `data` is `null`. `error` is
  one of `"unavailable"` (network/5xx/404/abort), `"invalid"` (malformed
  envelope or contract violation), or `"not-ready"` (evidence 409).
- `source: "mock"` — explicit `mock-only` mode only. Never returned by
  `api-preferred` mode.

`api-preferred` failure never falls back to mock campaign data. A 503/404/abort
returns `{ data: null, source: "integration-error", error: "unavailable" }`.
A malformed `200` body returns `error: "invalid"`.

### Evidence not-ready state

The evidence endpoint distinguishes `409 CAMPAIGN_EVIDENCE_NOT_READY` from
other failures. `requestApiDataWithStatus` collapses all non-200 responses to
`unavailable`, so the evidence fetch is performed directly and the HTTP status
code plus `error_code` field are inspected. A 409 with
`error_code: "CAMPAIGN_EVIDENCE_NOT_READY"` is surfaced as
`{ data: null, source: "integration-error", error: "not-ready" }`. A 409
without the canonical error_code remains `unavailable` to avoid spoofing
not-ready.

### Polling stale semantics

`useCampaignSupervisionPolling` polls every 3000 ms while campaign status is
`created`, `validating`, `running`, or `collecting`. Polling stops on
`completed` and `failed` (terminal states).

- Hidden document pauses polling; visibility restore resumes only if the
  campaign is not stale and not terminal.
- Failure keeps the last successful data, marks `freshness: "stale"`, and
  pauses polling. The stale state surfaces in the UI via the
  `data-evidence-state` marker on `CampaignOverviewHeader` (one of
  `fresh-running`, `fresh-completed`, `stale`).
- Explicit `retry()` clears the pause and attempts immediately.
- Campaign ID change aborts the prior request and resets state. A generation
  guard prevents late responses for campaign A from overwriting campaign B.
- Unmount aborts and creates no post-unmount state update. One hook instance
  owns one visibility listener.

### URL-driven mode selection

Campaign mode is selected only by the normalized `campaign_id` URL parameter
on `/results/sandbox`. The page validates the ID against
`/^campaign:t1:[0-9a-f]{32}$/`; invalid IDs are dropped rather than forwarded
to the API. Existing session-mode URLs (without `campaign_id`) remain backward
compatible. The `agent_id` URL parameter is validated against the fixed
`Track1CampaignAgentId` set; invalid agent IDs are removed.

### Read-only boundary

No start, retry, approve, reject, cancel, acknowledge, policy edit, or
artifact generation control exists in campaign mode. The repository gate
permanently prohibits these command surfaces.

### Explicit non-goals

Real 390/1024/1440 browser screenshots, visual acceptance, and end-to-end
campaign orchestration across Docker/OpenClaw runtime belong to Phase 6.
## REQ-T1-DEMO-010 Evidence Builder and Acceptance Boundary

No public write route was added for report generation. The report CLI reads
the existing public endpoints:

- `GET /api/supervision/campaigns/:campaignId`
- `GET /api/supervision/sessions/:sessionId`
- `GET /api/supervision/sessions/:sessionId/evidence`

After local byte re-read and manifest validation, it registers exactly one
existing internal envelope:

- `POST /internal/track1/campaigns/:campaignId/evidence`

The registration body remains
`Track1CampaignEvidenceRegistration` with exactly
`schema_version`, `campaign_id`, `artifact_manifest_sha256`,
`artifact_manifest_ref`, and `registered_at`. Runtime prompt/output/tool
content, provider bodies, browser logs, and credentials are not accepted.

The output directory contains exactly `security-risk-analysis.md`,
`security-risk-analysis.pdf`, `campaign.json`, five fixed PNG paths, and
`manifest.json`. `manifest.json` is canonical JSON and does not list itself.
The independent acceptance source additionally contains normalized campaign
and session DTOs, a three-counter safe log summary, and closed runtime
capability metadata; it is an ignored operational artifact and is not copied
into the accepted baseline.

## REQ-T1-DEMO-010 Review Demo UI Frontend Contract

The `/review-demo` guided evaluator tour adds no new backend route, DTO, or
write path. It reuses exactly these existing public read endpoints:

- `GET /api/supervision/campaigns` — resolves a default campaign when no
  `campaign_id` URL param is present, and refreshes the aggregate summary
  used for live metrics.
- `GET /api/supervision/campaigns/:campaignId` — campaign detail, fetched in
  parallel with the summary via the existing
  `campaign-supervision-service` functions.
- `GET /api/supervision/campaigns/:campaignId/evidence` — evidence
  readiness check (`ready` / `409 CAMPAIGN_EVIDENCE_NOT_READY` /
  `unavailable`), identical semantics to the Phase 5 campaign mode.

### Metric field coverage

The content catalog's `metric_bindings` lists 11 keys. Five are populated
from live `Track1CampaignSummary` fields:

| Catalog key | Summary field |
| --- | --- |
| `agent_count` | `agent_count` |
| `case_count` | `case_count` |
| `retry_count` | `retry_count` |
| `ask_count` | `ask_count` |
| `blocked_count` | `blocked_count` |

The remaining six (`attempt_count`, `deny_count`, `allow_count`,
`intercepted_tool_count`, `executed_simulated_tool_count`,
`real_side_effect_count`) are not present on `Track1CampaignSummary` or
`Track1CampaignDetail` today — they only exist inside the offline evidence
package's `campaign.json` (`scripts/track1/report/report-model.ts`). The UI
renders a fixed neutral placeholder for these six rather than deriving them
client-side, which would duplicate backend aggregation logic. Populating
them live is future work gated on a public evidence-metrics API, not part
of this slice.

### Explicit non-goals

No public route serves `security-risk-analysis.md/.pdf`, the five fixed
screenshot PNGs, or `manifest.json` directly, so the review demo UI does not
link or fetch those paths. No campaign start/retry/approve/reject/cancel/
edit-policy command surface exists — the page is read-only, same rule as the
Phase 5 campaign mode.

## REQ-SBX-GENERAL-001 Sandbox Security Core Contract

The supported sandbox construction factory is
`createSandboxSecurityEngine`. Its public evaluation contract is:

```ts
interface SandboxSecurityEngine {
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    callerSignal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
```

`SandboxSecurityEvaluationRequest` is an engine-package adapter-facing exported
type, not a backend route or frontend DTO. It wraps the untrusted
`SandboxSecurityRequest` submission with engine-owned authoritative context.
Public API submissions cannot call `evaluate` or construct authoritative
context; a trusted in-process adapter constructs the envelope from authenticated
observations. Normalized request brands, private handles, raw detector snapshots,
and sanitized Judge payloads are not public platform contracts.
`evaluate(request)` starts the fixed 5000 ms work budget at entry, normalizes and
validates authority within that budget, and returns the versioned
`sandbox-security-decision.v1` decision boundary.

The GENERAL-002 controlled live benchmark uses a production-internal
`p6_local_hardware_compatibility_v8` execution profile with a `360000ms` entry
budget, a `60000ms` local slot, and a `300000ms` Judge slot. Readiness and
qualification/warmed prewarm are respectively `40000ms` and `40000ms`. This is
not a public API profile or request field and does not add retry capacity.
Candidate manifests and signed evidence require the exact v8 record and reject
v7 and older records. Ordinary production and P7
replay retain the fixed
GENERAL-001 budget and `100/1000/4000ms` slots.

Its sealed provider configuration requires
`local_prompt_version: "sandbox-security-ollama-local-prompt.v2"`. The v2 prompt
adds an exact no-duplicate-`subject_refs` instruction; the provider response is
still validated without repair or deduplication. The fixed P6 boundary permits
only one retry after the exact first-attempt `connection_failed` transport
outcome; this is an internal
capture/replay binding and not a backend or frontend API field.

The internal candidate decision projection also uses
`SandboxSecurityAction` unchanged: `allow|alert|ask|deny`. It must not translate
`deny` to the obsolete `block` spelling. Benchmark detection numerators are
still determined solely by `verdict === "risk_detected"`.

Internal canonical benchmark trees use a `16 MiB` per-artifact and `256 MiB`
whole-tree bound. These are evidence-aggregation limits, not public request
limits; the production request contract retains its independent `512 KiB`
boundary.

The internal live evaluator worker exposes only bounded stage diagnostics. A
report with structurally incomplete 300-input output or any infrastructure
code maps to
`sandbox_security_evaluate_worker_reject:evaluation_not_accepted`. The
retained `accepted_metrics.numerators.decided` value is a quality-coverage
metric and may be below `300` when valid `indeterminate` projections are
present; it does not by itself reject the fixed complete-run path. A complete
300-input report may continue even when its retained
`accepted_metrics.accepted` quality boolean is false. Detailed multi-threshold
text is never reflected across the worker boundary. The standalone evaluator
CLI remains a quality metrics tool and may still return its quality-failure
exit code.

The internal production factory is
`createSandboxSecurityProductionEngine`. Hermetic benchmark execution is
invoked separately with `npm run benchmark:sandbox-security:replay`; it is not
a backend route or a public transport/configuration contract. The explicit
`npm run benchmark:sandbox-security:qualify:live` command is operator-only and
is excluded from `test:all`. Replay remains fail-closed until a signed,
validated P6 capture/evaluation receipt chain and complete-run `seal.json`
exist; the retained quality boolean is reported separately from complete-run
acceptance.
The current formal acceptance state and evidence-root binding are recorded in
`docs/progress.md`; manually accepted assessments without the signed artifact
chain do not establish GENERAL-002 `VERIFIED` status.

The external Judge configuration is an operator-only runtime boundary rather
than a public API field. `SANDBOX_SECURITY_JUDGE_PROTOCOL`,
`SANDBOX_SECURITY_JUDGE_BASE_URL`, `SANDBOX_SECURITY_JUDGE_MODEL`,
`SANDBOX_SECURITY_JUDGE_API_KEY`, and `SANDBOX_SECURITY_ENABLE_JUDGE` are read
from the mode-`600` credential environment file. There are no source-level
defaults for the external base URL, model, or key; the P6 profile constrains
only the protocol and HTTPS-FQDN policy. The fixed local `qwen3:8b` digest
requirement is independent of this external Judge configuration.

The production composition factory also owns the internal
`judge_screening_mode: "disabled" | "seven_domain_v2"` contract. This is not a
public API field and cannot be supplied by a caller, environment variable, or
CLI flag. Ordinary `local` selects `disabled`; `local_and_judge`, including P6
capture and P7 replay, selects `seven_domain_v2`; `five_domain_v1` is retired
and rejected. After a valid pinned Ollama response, the latter yields exactly
seven low-confidence unresolved obligations in fixed order:
`prompt_injection`, `jailbreak`, `instruction_override`, `privilege_escalation`,
`sensitive_data_exposure`, `unsafe_side_effect`, and
`trust_boundary_violation`. Each obligation references every authoritative
content source plus the optional whole tool call and is resolved only by the
existing sanitized Judge protocol. More than eight combined subjects fails
closed; no partial or truncated Judge request is valid.

### Compatibility adapters

`createSandboxSecurityMonitorDecisionAdapter` creates the
`MonitorDecisionProvider` adapter. For every Monitor decision, the adapter calls
`engine.evaluate(request)` exactly once, without a second signal argument or a
second policy reduction. The engine-owned reducer remains the sole authority
for the final action.

The Track1 adapter uses fixed confidence `0.80` and maps existing rule evidence
into the same decision boundary. The balanced harness is test-only and is not a
production detector or a public runtime profile.

## REQ-SBX-GENERAL-003 Authenticated Backend API

GENERAL-003 exposes exactly five routes. The public listener accepts simulation
evaluation and subject-scoped audit reads; the internal listener accepts only
bootstrap-administrator capability and retention operations.

### Route Matrix

| Listener | Method and path | Authentication | Input boundary | Success envelope |
| --- | --- | --- | --- | --- |
| public | `POST /api/sandbox/security/evaluations` | `Authorization: Bearer <capability>` plus `Idempotency-Key` | JSON `SandboxSecurityRequest`; 786432 raw bytes; 5000 ms body deadline | `200 ApiResponse<SandboxSecurityDecision>` or ordered `text/event-stream` when requested |
| public | `GET /api/sandbox/security/audit-events` | `Authorization: Bearer <capability>` with `sandbox_security:audit:read` | only `cursor` and `limit` query keys; bodyless | `200 ApiResponse<SandboxSecurityAuditPage>` |
| internal | `POST /internal/sandbox/security/capabilities` | `Authorization: Bearer <bootstrap-admin-token>` | exact public or private JSON issue DTO; 65536 raw bytes; 5000 ms body deadline | `201 ApiResponse<SandboxSecurityCapabilityIssueResult | SandboxSecurityEnforcementAuditCapabilityIssueResult>` |
| internal | `POST /internal/sandbox/security/capabilities/:capabilityId/revoke` | `Authorization: Bearer <bootstrap-admin-token>` | bodyless; one percent-decode of the path ID | `200 ApiResponse<SandboxSecurityCapabilityPublicRecord>` |
| internal | `POST /internal/sandbox/security/audit-events/purge` | `Authorization: Bearer <bootstrap-admin-token>` | bodyless; fixed 90-day retention and 1000-row batch | `200 ApiResponse<SandboxSecurityAuditPurgeResult>` |
| internal | `POST /internal/sandbox/security/enforcement-events` | `Authorization: Bearer <dedicated enforcement capability>` with `sandbox_security:enforcement:audit:write` | exact content-free `sandbox-security-enforcement-audit-request.v1`; 65536 raw bytes; 5000 ms body deadline; capacity 2, refill 1 token/6 seconds | `201/200 ApiResponse<OpenClawEnforcementAuditAck>` (`accepted`/`replayed`) |

Public capabilities are opaque `sbxcap_v1.<43 base64url characters>` values and
are never returned by audit routes. Internal routes are not dispatched by the
public listener. Every response uses the repository envelope below; the
`request_id` is the HTTP correlation ID and is not persisted as audit content:

```ts
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error_code: string | null;
  request_id: string;
}
```

The enforcement-event route is internal-listener-only and never accepts the
bootstrap administrator credential as its event bearer. Its closed request
union and acknowledgement are defined in
[`shared/types/sandbox-security-enforcement-audit.ts`](../shared/types/sandbox-security-enforcement-audit.ts)
and normalized by
[`shared/contracts/sandbox-security-enforcement-audit.ts`](../shared/contracts/sandbox-security-enforcement-audit.ts).
The backend injects `subject_id`, `authorization_scope_id`, `capability_id`, and
`occurred_at`; those fields are not accepted from the request. Replay returns
the first stored timestamp, while a changed content-free candidate under the
same event ID returns `409` without echoing request data.

### DTO Matrix

The evaluation body is the exact shared request contract. Unknown, inherited,
accessor, symbol, duplicate, or content-bearing fields are rejected.

```ts
interface SandboxSecurityRequest {
  schema_version: "sandbox-security-request.v1";
  request_id: string;
  stage: "user_input" | "model_output" | "tool_request";
  policy_profile_id:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  content_items: SandboxSecuritySubmittedContentItem[]; // 1..64
  tool_request?: SandboxSecurityToolRequest;
}

interface SandboxSecurityDecision {
  schema_version: "sandbox-security-decision.v1";
  decision_id: string;
  request_id: string;
  evaluation_mode: "simulation";
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  verdict: "no_detected_risk" | "risk_detected" | "indeterminate";
  action: "allow" | "alert" | "ask" | "deny";
  risk_level: "info" | "low" | "medium" | "high" | "critical";
  findings: SandboxSecurityFinding[];
  detector_runs: SandboxDetectorRun[];
  evidence_refs: string[];
  created_at: string;
}
```

| DTO | Exact fields and constraints |
| --- | --- |
| `SandboxSecuritySubmittedContentItem` | `source_id`, `claimed_source_type`, `media_type` (`text/plain` or `application/json`), `value`, `provenance_ref`; text and JSON values use the shared byte/depth/node limits. |
| `SandboxSecurityToolRequest` | `call_id`, `tool_name`, `arguments`, optional `target`; no caller-selected provider, model, endpoint, timeout, retry, fallback, policy, or production mode. |
| `SandboxSecurityCapabilityIssueRequest` | `schema_version: "sandbox-security-capability-issue-request.v1"`, `subject_id`, `scopes`, `allowed_stages`, `allowed_policy_profile_ids`, optional `ttl_seconds`; TTL defaults to 900 and is bounded to 60..3600 seconds. Evaluation scope requires at least one stage and profile; audit-only grants require both arrays empty. |
| `SandboxSecurityCapabilityIssueResult` | `schema_version: "sandbox-security-capability-issue-result.v1"`, `capability_id`, `subject_id`, `scopes`, `allowed_stages`, `allowed_policy_profile_ids`, `bearer_token`, `issued_at`, `expires_at`, `revoked_at: null`; the bearer token appears only in this successful 201 response. |
| `SandboxSecurityEnforcementAuditCapabilityIssueRequest` | `schema_version: "sandbox-security-enforcement-audit-capability-issue-request.v1"`, `subject_id`, one `policy_profile_id`, and `ttl_seconds` as a safe integer in `60..3600`; scope, stages, production mode, endpoint, and authorization-scope ID are backend-owned. |
| `SandboxSecurityEnforcementAuditCapabilityIssueResult` | `schema_version: "sandbox-security-enforcement-audit-capability-issue-result.v1"`, fixed scope `sandbox_security:enforcement:audit:write`, all `user_input`, `model_output`, and `tool_request` stages, exactly one profile, immutable production composition, one transient `bearer_token`, strict timestamps, and `revoked_at: null`. |
| `SandboxSecurityCapabilityPublicRecord` | `schema_version: "sandbox-security-capability-record.v1"`, `capability_id`, `subject_id`, `scopes`, `allowed_stages`, `allowed_policy_profile_ids`, `issued_at`, `expires_at`, `revoked_at`; it never contains a token digest or scope seed. |
| `SandboxSecurityAuditPage` | `schema_version: "sandbox-security-audit-page.v1"`, `events` (0..100 content-free events), `next_cursor` (null or canonical `sbxcur_v1.<payload>.<mac>`). |
| `SandboxSecurityAuditPurgeResult` | `schema_version: "sandbox-security-audit-purge-result.v1"`, `retention_days: 90`, `deleted_count`, `has_more`; the cutoff and batch size are not caller inputs. |

### Status And Error Table

| HTTP | `error_code` | Meaning |
| --- | --- | --- |
| 400 | `SANDBOX_SECURITY_INVALID_REQUEST` | malformed non-credential headers, query, JSON, or DTO |
| 400 | `SANDBOX_SECURITY_AUDIT_CURSOR_INVALID` | malformed, tampered, wrong-scope, or wrong-subject cursor |
| 401 | `SANDBOX_SECURITY_UNAUTHORIZED` | public capability is absent, malformed, unknown, expired, or revoked |
| 401 | `SANDBOX_SECURITY_ADMIN_UNAUTHORIZED` | bootstrap administrator credential is absent or invalid |
| 403 | `SANDBOX_SECURITY_FORBIDDEN` | scope, stage, or profile is not granted |
| 404 | `SANDBOX_SECURITY_CAPABILITY_NOT_FOUND` | revoke target does not exist |
| 408 | `SANDBOX_SECURITY_REQUEST_TIMEOUT` | authenticated body did not complete within 5000 ms |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` | same authorization scope and key have a different fingerprint |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS` | same authorization scope, key, and fingerprint is executing |
| 413 | `SANDBOX_SECURITY_BODY_TOO_LARGE` | route-specific raw body limit was exceeded |
| 415 | `SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE` | media type is not canonical `application/json` |
| 429 | `SANDBOX_SECURITY_RATE_LIMITED` | a public or administrator token bucket rejected the request |
| 429 | `SANDBOX_SECURITY_CONCURRENCY_LIMITED` | all four Engine slots are occupied |
| 500 | `SANDBOX_SECURITY_INTERNAL_ERROR` | Engine, crypto, persistence, or invariant failure |
| 503 | `SANDBOX_SECURITY_STORAGE_UNAVAILABLE` | idempotency maintenance is degraded or closed |

Error responses never include bearer tokens, raw request content,
`Idempotency-Key`, fingerprints, canonical bytes, SQLite details, causes,
stacks, provider messages, or Engine diagnostics. In-progress/concurrency
errors include `Retry-After: 1`; rate-limit errors include their monotonic
bucket deficit clamped to `1..60`; storage-unavailable includes
`Retry-After: 60`. Server-detected 408/413 responses also include
`Connection: close` and destroy the request only after response `finish`.

### Examples

Minimal simulation evaluation:

```http
POST /api/sandbox/security/evaluations HTTP/1.1
Authorization: Bearer <capability>
Idempotency-Key: eval-20260806-0001
Content-Type: application/json

{"schema_version":"sandbox-security-request.v1","request_id":"req-0001","stage":"user_input","policy_profile_id":"sandbox-security-balanced.v1","content_items":[{"source_id":"src-1","claimed_source_type":"user_input","media_type":"text/plain","value":"hello","provenance_ref":"source://client/1"}]}
```

```json
{"success":true,"message":"Sandbox security evaluation completed","data":{"schema_version":"sandbox-security-decision.v1","decision_id":"decision:...","request_id":"req-0001","evaluation_mode":"simulation","stage":"user_input","policy_profile_id":"sandbox-security-balanced.v1","verdict":"no_detected_risk","action":"allow","risk_level":"info","findings":[],"detector_runs":[],"evidence_refs":[],"created_at":"2026-08-06T00:00:00.000Z"},"error_code":null,"request_id":"http:..."}
```

Issue a capability and read its public audit page:

```http
POST /internal/sandbox/security/capabilities HTTP/1.1
Authorization: Bearer <bootstrap-admin-token>
Content-Type: application/json

{"schema_version":"sandbox-security-capability-issue-request.v1","subject_id":"subject-1","scopes":["sandbox_security:evaluate","sandbox_security:audit:read"],"allowed_stages":["user_input"],"allowed_policy_profile_ids":["sandbox-security-balanced.v1"],"ttl_seconds":900}
```

```http
GET /api/sandbox/security/audit-events?limit=50 HTTP/1.1
Authorization: Bearer <capability>
```

The audit response is `ApiResponse<SandboxSecurityAuditPage>`; its event
variants contain only IDs, timestamps, closed catalog values, counts, and
rejection metadata. Raw content, provider data, tokens, locator text, and
finding evidence are never part of the page.

## REQ-SBX-GENERAL-003 Shared Audit API Contract

The authenticated sandbox backend exposes the content-free audit projection
through the shared `SandboxSecurityAuditEvent` discriminated union and the
`SandboxSecurityAuditPage` envelope. The complete field matrix is maintained in
the [canonical GENERAL-003 specification](superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md#durable-audit-contract);
this document records the stable cross-package boundary:

- Event types are exactly `evaluation_completed`, `evaluation_replayed`,
  `evaluation_interrupted`, `request_rejected`, `capability_issued`,
  `capability_revoked`, `audit_read`, and `audit_purged`.
- Every event has schema version `sandbox-security-audit-event.v1`, an audit
  UUID, a strict UTC millisecond timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`), a
  subject ID, and the exact variant keys defined by the specification. Unknown,
  inherited, accessor, symbol, or content-bearing fields are rejected.
- Evaluation events use the closed stage catalog
  `user_input`, `model_output`, `tool_request`, the two closed policy profiles,
  the fixed production-composition binding, and elapsed milliseconds bounded to
  `0..60000`. Completed/replayed events contain all nine risk-category counts
  and all six detector-run-status counts as safe non-negative integers in their
  catalog order. The detector status order is `matched`, `no_match`, `failed`,
  `timeout`, `invalid_result`, `skipped`.
- Rejection events enforce the route/nullability matrix: `audit_read` always
  has null request/stage/profile and only its five read-route rejection codes;
  evaluation-only codes require the `evaluation` route.
- Capability issue/revoke, audit-read, and purge variants retain only their
  exact closed fields. Arrays and count records are dense, ordered, and copied
  defensively.

The page envelope is exactly:

```ts
interface SandboxSecurityAuditPage {
  schema_version: "sandbox-security-audit-page.v1";
  events: SandboxSecurityAuditEvent[]; // 0..100
  next_cursor: string | null;
}
```

`next_cursor` is either null or a canonical, unpadded base64url cursor with the
grammar `sbxcur_v1.<payload>.<mac>`. The shared strict normalizers
`normalizeSandboxSecurityAuditEvent` and `normalizeSandboxSecurityAuditPage`
return fresh values or `null`; they perform all exact-key, catalog, bounds,
timestamp, cursor, and defensive-copy checks before a value crosses the shared
boundary.

## REQ-SBX-GENERAL-003 HTTP Admission

Sandbox security HTTP handlers inspect security-sensitive fields from
`IncomingMessage.rawHeaders` case-insensitively. `Authorization`,
`Idempotency-Key`, `Content-Type`, `Content-Encoding`, `Content-Length`, and
`Transfer-Encoding` occur at most once. Duplicate authorization is `401`;
duplicate media or encoding headers are `415`; other duplicate framing or
idempotency headers are `400`.

Bearer authorization is exactly `Bearer <token>` with one ASCII space and no
surrounding whitespace. Public tokens use the opaque
`sbxcap_v1.<43 base64url characters>` grammar. Internal administrator tokens
use the same header grammar and are checked by the injected administrator
authorizer.

Body-bearing routes require a single `Content-Type` matching
`application/json` with optional unquoted `charset=utf-8`, and reject any
`Content-Encoding`. They accept one canonical decimal `Content-Length` or a
single case-insensitive `Transfer-Encoding: chunked`, never both. Public
evaluation bodies are capped at `786432` bytes; internal capability issue
bodies at `65536` bytes. Bytes are decoded with fatal UTF-8 and parsed only
after the complete body arrives within the `5000 ms` admission deadline.
Empty or invalid JSON, invalid framing, invalid UTF-8, and malformed
`Idempotency-Key` (`^[A-Za-z0-9._~-]{16,128}$`) return
`SANDBOX_SECURITY_INVALID_REQUEST` (or the specific media/body error).

Audit-read, capability-revoke, and audit-purge routes are bodyless. They allow
no transfer encoding and only no `Content-Length` or `Content-Length: 0`.
Admission still awaits request completion and rejects a nonempty chunk that is
delivered later. Audit query parsing allows only one `cursor` and one `limit`,
defaults `limit` to `50`, and bounds it to `1..100`; malformed percent
encoding, unknown or repeated keys, empty/overlong cursors, and non-canonical
limits are `400`.

Controller failures are typed `SandboxSecurityHttpError` values and are mapped
to the `ApiResponse` error envelope only by the public and internal app modules.
`Retry-After` is emitted exactly for in-progress/concurrency (`1`), rate-limit
(`1..60` from the monotonic bucket), and storage-unavailable (`60`) errors.
Server-detected `408` and `413` responses include `Connection: close`; the
request and socket are destroyed only from the response `finish` callback.
When the caller has already aborted or the response is not writable, no second
headers/body/end/destroy operation is attempted.

### P5-T2 public controller contract

The public controller accepts only the injected production composition binding
`sandbox-security-production-composition.v1:{rule_only|local|local_and_judge}`.
It returns success `ApiResponse` values from the two public routes and throws
typed `SandboxSecurityHttpError` values for all failures; app modules are the
only error-envelope writers.

Evaluation admission is ordered as global bucket, bearer authentication,
`sandbox_security:evaluate` scope, maintenance health, capability bucket,
`Idempotency-Key`, JSON body admission and shared normalization, then stage and
profile grant checks before the evaluation service. Audit reads use the same
global/authentication prefix, require `sandbox_security:audit:read`, consume
the capability bucket, await bodyless completion, parse the bounded query, and
only then call the subject-scoped audit service. Audit `limit` defaults to 50
and accepts only canonical values from 1 through 100.

Known-capability controller-owned rejections append one content-free
`request_rejected` event using the exact injected composition binding. Global
bucket and unknown-credential failures create no audit. Idempotency conflict,
in-progress, and concurrency failures are transaction-owned by the evaluation
service and are mapped without a second controller event. Body admission
errors on evaluation use their evaluation rejection codes; an unsupported
media error on a bodyless audit route is returned to the caller but is not
projected as an invalid `audit_read` rejection variant.

### P5-T3 administrator controller contract

Internal capability and purge handlers consume the administrator token bucket
before parsing or authenticating the bearer credential. Invalid credentials,
including duplicate or malformed raw headers, return the fixed administrator
`401` without reading a body, decoding a path segment, invoking a service, or
creating an audit event.

Capability issue then reads a strict JSON body with the `65536`-byte and
`5000 ms` limits, dispatches only by exact `schema_version`, normalizes the
selected issue DTO, and calls its branch-specific capability service only after
normalization. The legacy schema keeps the default `ttl_seconds=900`; the
private enforcement schema requires its explicit profile and bounded TTL.
Success is `201 ApiResponse<SandboxSecurityCapabilityIssueResult |
SandboxSecurityEnforcementAuditCapabilityIssueResult>` and exposes the opaque
bearer token only in that response. Revoke and purge first await
bodyless completion; revoke then percent-decodes the opaque path segment once,
rejects malformed encoding, decoded slash/backslash/NUL, and non-v4 capability
IDs, and only then calls the revoke service. Repeated revocation remains
idempotent and an unknown ID maps to the fixed `404`.

Purge delegates the fixed 90-day, bounded-1000-row retention operation to the
audit service and returns the exact purge result. Storage degradation maps to
`503` with `Retry-After: 60`; administrator rate rejection and bad credentials
are not durably audited. Unknown stream/iterator failures at the controller
boundary are normalized to the stable `400 SANDBOX_SECURITY_INVALID_REQUEST`
without leaking implementation details.

### P5-T4 injected module and listener boundary

`createSandboxSecurityModule` accepts only already constructed ports, services,
limiters, runtime, composition binding, and the single SQLite database owner.
It creates both controllers without reading environment variables or opening a
second database. The same module instance is injected into the public and
internal app modules, so public evaluation/audit routes and internal
capability/revoke/purge routes share one service graph while remaining on their
respective listeners. A module close cancels idempotency maintenance before it
checkpoints and closes the database; repeated close calls are no-ops.

The public listener returns `404` for internal sandbox paths, and the internal
listener returns `404` for public sandbox paths. Existing `/health` and
`/internal/health` success envelopes are unchanged. Real HTTP admission keeps
the complete `408`/`413` JSON envelope on the wire with `Connection: close`; a
caller-aborted request is never written after its response or socket becomes
non-writable.

## REQ-SBX-GENERAL-005 Frontend Evaluation Workbench Contract

The frontend adds no backend route, shared contract, or DTO. It consumes exactly
the two public routes already defined by GENERAL-003 — see the route matrix in
`REQ-SBX-GENERAL-003 Authenticated Backend API` and the audit shapes in
`REQ-SBX-GENERAL-003 Shared Audit API Contract`; those are canonical and are not
copied here. This section records only what is genuinely frontend-owned.

Consumed routes:

- `POST /api/sandbox/security/evaluations` — bearer capability, per-call
  `Idempotency-Key`, JSON `SandboxSecurityRequest` body; `200
  ApiResponse<SandboxSecurityDecision>`.
- `GET /api/sandbox/security/audit-events?cursor=&limit=` — bearer capability,
  scope `sandbox_security:audit:read`, bodyless; `200
  ApiResponse<SandboxSecurityAuditPage>`.

Client-generated identity and idempotency lifecycle:

- `request_id` is generated per submit with `crypto.randomUUID()`.
- `Idempotency-Key` is generated with `crypto.randomUUID()` at the moment of
  submit, held with the in-flight request, and **reused** on retry of an
  unchanged payload so the backend replays the stored decision. **Any edit to
  the payload invalidates the key**; the next submit generates a fresh one.
  Reusing a key after an edit would produce
  `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` (a client defect), so the client never
  does this. The key is never written to a URL, storage, or log.

Client-side limit pre-flight (mirrors no constant; every bound is imported from
`shared/types/sandbox-security`): a request is rejected before any capability
call when it exceeds `SANDBOX_SECURITY_MAX_CONTENT_ITEMS` (64), a text item
exceeds `SANDBOX_SECURITY_MAX_TEXT_BYTES` (128 KiB), a JSON value exceeds
`SANDBOX_SECURITY_MAX_JSON_DEPTH` (12) or `SANDBOX_SECURITY_MAX_JSON_NODES`
(4096), or the whole request exceeds the canonical
`SANDBOX_SECURITY_MAX_REQUEST_BYTES` (512 KiB — the engine bound, stricter than
the 786432-byte HTTP admission cap, because clearing HTTP admission but
exceeding the canonical bound wastes a capability call). A violation names only
the failing rule and at most the item `source_id` — never the submitted value.

Error mapping: all fifteen documented `error_code` values plus transport and
validation failure are surfaced through a discriminated result union carrying
`error_code`, HTTP status, and `Retry-After`; no server `message` is trusted or
surfaced. `SANDBOX_SECURITY_UNAUTHORIZED`/`SANDBOX_SECURITY_FORBIDDEN` prompt for
a fresh capability without discarding the typed payload;
`SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` prompts a fresh key.

Content-free rendering: the capability bearer token lives only in React state,
is never rendered back after entry, and never enters a URL, storage, history,
`document.title`, console, or log. Submitted content appears only in the owning
form control and the outbound request body. The decision and audit views render
only the content-free GENERAL-001/GENERAL-003 unions; `subject_refs`/
`evidence_refs` positional data are content-free and safe to render. The public
route returns `evaluation_mode: "simulation"`, and the workbench labels every
decision as simulation, not enforcement.

## REQ-SBX-GENERAL-006 Evaluation Runtime Stream Contract

The existing evaluation route negotiates an optional runtime stream. A request
whose `Accept` header contains `text/event-stream` receives
`Content-Type: text/event-stream; charset=utf-8`; requests without that media
type retain the GENERAL-003 JSON envelope and decision semantics.

The SSE body is a sequence of exactly five successful frames for a completed
evaluation. Each frame uses one `event` line and one JSON `data` line, separated
by a blank line, and conforms to the shared
`sandbox-security-evaluation-stream.v1` contract. Stage frames use sequences
1..4 for `source`, `rule`, `model`, and `judge`; the `decision` frame uses
sequence 5. Every frame carries the request correlation ID and a `live` or
`replayed` delivery marker.

Stage results are content-free. Detector metadata is limited to the normalized
detector ID/version/kind, obligation, elapsed time, terminal status, and the
closed `error_code` or `skip_reason` fields where applicable. MODEL and JUDGE
emit explicit `skipped` results when their optional routing or configuration is
not selected. The backend emits `DECISION` only after decision normalization and
idempotency completion persistence succeed; replayed evaluations synthesize the
four stage frames from the cached decision before the replayed decision frame.
Post-header failures use the content-free stream `error` event; pre-header
failures retain the normal JSON error envelope.

The frontend validates schema, request correlation, event names, and sequences
before invoking its stage callback. Stage state is React-memory-only and is
discarded when the final decision branch mounts. The existing result structure
(`EvidenceTrace`, decision summary, findings/detectors, `ExecutionTrace`) is
unchanged after the `DECISION` frame.
