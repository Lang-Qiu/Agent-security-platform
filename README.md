# agent-security-platform

面向智能体（Agent）安全检测与管理的平台型仓库，用于统一承载资产测绘、Skills 静态安全检测、动态沙箱监控与越权阻断，以及平台化展示、任务编排和结果汇总能力。

当前仓库阶段目标是先完成第一版 monorepo 工程骨架与初始化文档，确保团队可以在统一目录约束下并行推进前端、后端与三个检测引擎。

## 项目简介

`agent-security-platform` 的目标不是只做单点检测工具，而是建设一个可扩展的平台：

- 面向 Agent、Skills、运行会话等对象做统一建模。
- 将资产扫描、静态分析、动态沙箱三类能力拆分为独立引擎，避免平台后端与具体检测实现强耦合。
- 通过统一任务模型、统一结果契约、统一风险等级，实现平台层的汇总、追踪与展示。
- 为后续接入更多检测规则、更多执行环境和更多部署形态预留空间。

## 系统总体模块

- `frontend`：平台控制台，负责资产列表、检测任务、风险结果、沙箱告警等页面展示。
- `backend`：平台后端，负责 API、任务编排、结果归档、权限与模块聚合。
- `engines/asset-scan`：资产测绘与指纹识别引擎。
- `engines/skills-static`：Skills 静态安全分析引擎。
- `engines/sandbox`：动态沙箱监控、策略判定与阻断引擎。
- `shared`：跨前后端与引擎共享的类型、契约、常量和通用工具。
- `docs`：架构、接口、计划、会议记录、设计决策等文档。

## 技术栈

- 前端：React + TypeScript
- 前端 UI：Ant Design，信息架构参考 Ant Design Pro simple
- 后端：Node.js + TypeScript
- 工程组织：推荐 `pnpm workspace` 作为 monorepo 管理方式
- 后端风格：模块化组织，设计上接近 NestJS 的分层与模块边界
- 引擎形态：可独立演进的 Node.js/TypeScript 子项目，后续可根据需要替换为其他语言实现

## 仓库结构说明

```text
agent-security-platform/
├─ frontend/                 # React 控制台
│  ├─ public/
│  └─ src/
├─ backend/                  # 平台 API 与任务编排
│  └─ src/
│     ├─ common/
│     ├─ config/
│     └─ modules/
├─ engines/                  # 三类检测引擎
│  ├─ asset-scan/
│  │  ├─ rules/
│  │  ├─ src/
│  │  └─ tests/
│  ├─ skills-static/
│  │  ├─ rules/
│  │  ├─ src/
│  │  └─ tests/
│  └─ sandbox/
│     ├─ policies/
│     ├─ src/
│     └─ tests/
├─ shared/                   # 公共契约层
│  ├─ constants/
│  ├─ contracts/
│  ├─ types/
│  └─ utils/
├─ docs/
│  ├─ adr/
│  ├─ meeting-notes/
│  ├─ plans/
│  ├─ api-contract.md
│  ├─ architecture.md
│  └─ development-plan.md
├─ scripts/
│  ├─ bootstrap/
│  ├─ ci/
│  └─ dev/
├─ samples/
│  ├─ assets/
│  ├─ sandbox/
│  └─ skills/
├─ deploy/
│  ├─ compose/
│  ├─ docker/
│  └─ k8s/
└─ tests/
   ├─ e2e/
   ├─ fixtures/
   └─ integration/
```

## 目录设计原则

- 平台层与检测层解耦：`backend` 只负责任务、编排、结果聚合，不内嵌具体检测逻辑。
- 引擎独立演进：三个引擎位于 `engines/` 下，具备各自规则、测试与运行边界。
- 共享契约前置：所有跨模块通信用到的数据结构优先收敛到 `shared`。
- 文档与代码并行：在 `docs` 中持续记录架构、接口、决策和迭代计划，便于 3 人团队低成本协作。
- 平台测试与模块测试分层：模块内各自维护单元测试，仓库根 `tests` 负责集成与端到端验证。

## 团队分工占位

建议先按能力边界做分工，再通过 `shared` 和 `docs` 对齐接口：

- 成员 A：`frontend` + 平台展示交互
- 成员 B：`backend` + 任务编排 + 数据聚合
- 成员 C：`engines/*` 三个引擎主责，优先推进一个主引擎，另外两个先完成协议与骨架

后续可根据阶段调整为：

- A：前端 + 联调
- B：后端 + 数据层 + 部署
- C：检测引擎 + 规则能力

## 开发启动说明

当前版本为目录与文档骨架，启动说明先保留为占位版，后续补齐实际命令。

建议初始化步骤：

1. 在仓库根目录初始化 `pnpm workspace`。
2. 为 `frontend`、`backend`、`shared`、三个 `engines/*` 分别建立 `package.json`。
3. 补齐基础脚本：
   - `pnpm dev:frontend`
   - `pnpm dev:backend`
   - `pnpm dev:engines`
   - `pnpm test`
4. 建立统一代码规范：
   - TypeScript
   - ESLint
   - Prettier
   - commit message 规范
5. 优先打通一条最小链路：
   - 后端创建任务
   - 引擎执行检测
   - 后端收集结果
   - 前端展示结果

当前已落地的本地验证命令：

- 共享契约测试：`cmd /c npm run test:shared`
- 后端任务中枢测试：`cmd /c npm run test:backend`
- 前端后台骨架测试：`cmd /c npm run test:frontend`
- 在 `frontend/` 下启动前端开发环境：`cmd /c npm run dev`

## 当前交付范围

本次初始化已包含：

- 第一版 monorepo 目录结构
- 仓库根说明文档
- 架构说明、开发计划、接口契约草案
- 前后端与三个引擎的职责说明
- `shared` 第一版共享契约与运行时规范化能力
- `backend` 最小任务中枢与内存级 API
- `frontend` 最小后台壳子、路由骨架和 `Overview` 页面

本次初始化暂未包含：

- 具体业务代码实现
- workspace 配置文件
- CI/CD 脚本
- 数据库 Schema
- 登录与权限系统
- 真实引擎联调与实时日志流
