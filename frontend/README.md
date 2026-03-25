# Frontend Workspace

## 目录定位

`frontend/` 用于承载平台控制台，负责将任务、检测结果、风险汇总和告警信息以可操作的界面方式呈现给用户。

当前阶段先以 React + TypeScript 为基础，后续再补充路由、状态管理、UI 组件规范和接口封装。

## 主要职责

- 展示任务列表、任务详情和执行状态。
- 展示资产识别结果、Skills 静态分析结果、沙箱告警结果。
- 提供风险筛选、搜索、汇总视图和基础报表能力。
- 作为平台统一入口，不直接接入各引擎内部接口。

## 建议结构

```text
frontend/
├─ public/       # 静态资源
└─ src/
   ├─ app/       # 应用入口与路由
   ├─ pages/     # 页面级组件
   ├─ features/  # 按业务能力划分的前端模块
   ├─ components/# 通用组件
   ├─ services/  # API 请求封装
   ├─ types/     # 前端专用类型
   └─ styles/    # 样式与主题
```

## 与后端的边界

- 前端仅访问平台后端 API。
- 前端展示模型尽量复用 `shared` 中的公共类型。
- 引擎执行细节、原始日志和规则实现不应直接暴露到前端。

## 第一阶段建议

- 先完成应用入口、路由骨架和基础布局。
- 预留以下页面：
  - Task List
  - Task Detail
  - Asset Result
  - Static Analysis Result
  - Sandbox Alerts
- 统一约定时间、风险等级、状态标签的展示方式。
