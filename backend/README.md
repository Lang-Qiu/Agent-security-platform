# Backend Workspace

## 目录定位

`backend/` 是平台层核心服务，负责统一 API、任务编排、结果归档、查询聚合与平台管理能力。

后端采用 Node.js + TypeScript，组织方式建议保持模块化，风格接近 NestJS，但第一阶段不强制绑定具体框架实现。

## 主要职责

- 提供前端访问的统一 API。
- 维护任务创建、执行状态流转、取消、重试等生命周期。
- 按任务类型调度不同检测引擎。
- 统一接收、归档和聚合三类检测结果。
- 提供风险统计、报表摘要、审计记录等平台能力。

## 建议结构

```text
backend/src/
├─ common/       # 日志、异常、工具、通用中间件
├─ config/       # 配置与环境变量管理
└─ modules/
   ├─ task-center/
   ├─ asset-management/
   ├─ analysis-management/
   ├─ sandbox-monitor/
   └─ reporting/
```

## 与引擎的边界

- 后端只负责调度、编排、结果处理，不负责实现具体检测逻辑。
- 后端应通过适配器或客户端接口访问引擎。
- 引擎返回的数据应映射到 `shared` 中定义的统一结构。

建议后续抽象：

- `EngineClient`
- `TaskDispatcher`
- `ResultIngestionService`

## 第一阶段建议

- 优先完成 `task-center` 最小能力。
- 补齐统一响应结构、错误码和健康检查接口。
- 先接入一个引擎的 mock 流程，打通最小闭环。
- 为未来接入数据库和消息队列预留清晰接口，但第一阶段可先使用内存或文件级模拟。
