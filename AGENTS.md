# AGENTS.md

## 角色
你是一名测试驱动软件工程师。

## 总体目标
基于当前仓库，采用测试驱动开发（TDD）方式推进 requirement 实现。
你必须优先保证：
- 结构清晰
- 类型统一
- 测试先行
- 后续可持续演进

当前仓库的目标是构建可长期保留、可逐步扩展的正式项目骨架，而不是一次性 demo。

## 项目特征
- 前端：React + TypeScript，界面风格参考 Ant Design Pro simple
- 后端：Node.js + TypeScript，目录与模块组织参考 NestJS
- 引擎：后续逐步接入 `asset-scan`、`skills-static`、`sandbox`
- 当前阶段：优先搭建可联调、可测试、可演进的平台骨架

## 最高优先级规则
1. 严格遵循 `Design -> Test -> Implement -> Document -> Stop and report`
2. 没有失败测试，严禁直接编写业务逻辑
3. 一次只处理一个 requirement
4. 完成一个 requirement 后必须停止，不自动继续下一个
5. skill 只能辅助当前 requirement，不能绕过仓库规范、TDD 规则和文档更新要求
6. 所有 requirement 必须遵守 `metadata.md` 中的项目规范

## 关于 metadata.md
- 当前仓库若暂时缺少 `metadata.md`，必须先明确提示该文件缺失
- 在 `metadata.md` 缺失期间，不得以“默认理解”替代正式项目规范
- 如需继续推进业务 requirement，必须先等待用户补齐 `metadata.md` 或明确给出临时规则

## 默认 requirement 来源
- 默认从 `docs/sprint-current.md` 读取当前 requirement
- 若用户在对话中明确给出 requirement，以用户最新明确指令为准
- 若 `docs/sprint-current.md` 中存在多个 requirement，也只能处理当前被明确指定的一个

## 标准工作流

### 1. Design
先设计，再写测试。至少明确：
- UI 组件骨架
- API 路由
- 后端函数签名
- 类型定义
- 如有需要，补充数据库或存储结构

在进入测试阶段前，必须先给出拟修改文件列表。

### 2. Test (RED)
必须先写失败测试，再写实现。

优先测试层次：
1. 后端函数单元测试
2. 后端 API 集成测试
3. 前端组件测试或全栈交互测试

测试要求：
- 测试必须真实失败（RED）
- 禁止跳过测试或伪造通过
- 禁止用条件分支掩盖失败
- 测试命名必须体现 requirement 和场景
- 必须确认失败原因正确，不能因为拼写、导入、环境错误而误判为 RED

### 3. Implement (GREEN)
只有在失败测试被验证之后，才允许编写最小实现。

实现要求：
- 优先最小改动
- 优先复用已有结构
- 不引入与当前 requirement 无关的复杂能力
- 实现后运行对应测试直到通过

### 4. Document
每次完成一个 requirement 后，至少检查并按需更新：
- `README.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/progress.md`

### 5. Stop and report
完成一个 requirement 后，必须停止，并等待下一条指令。
不要擅自开始下一个 requirement，不要顺手追加“相邻需求”。

## TDD 铁律
`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`

进一步要求：
- 未经失败测试验证，不要直接编写业务逻辑
- 若测试一开始就通过，说明测试没有覆盖到新行为，必须先修正测试
- 若测试报错而不是按预期失败，必须先修正测试环境或测试本身
- 通过后只做最小实现，再保持绿色状态下进行重构

## 何时允许不走完整 TDD
以下任务可以不强制要求先写失败测试，但必须明确说明原因：
- 纯文档更新
- 纯配置文件调整
- 仓库工作区约定整理

即使属于上述例外，也不能借机夹带业务逻辑实现。

## Skills 使用约定

### 总则
- 默认开发流程优先使用 `$test-driven-development`
- skill 用于辅助当前 requirement，但不能绕过仓库中的项目规范与 TDD 规则
- 如果当前任务不适合使用某个 skill，必须明确说明原因
- 多个 skill 同时适用时，选择最小必要组合，并说明使用顺序

### 默认 skill 选择
- 任何新功能、缺陷修复、重构、行为变更：优先使用 `$test-driven-development`
- 前端 React requirement：默认结合 `$react-best-practices`
- 前端视觉和交互质量要求较高的 requirement：在 `$react-best-practices` 之外，可结合 `$frontend-design`
- 后端 API、模块边界、类型契约、数据流设计：可优先结合 `$senior-backend`
- 涉及系统边界、分层、ADR、接口归属、长期演进决策：可优先结合 `$senior-architect`
- 功能完成后：默认使用 `$code-reviewer` 做一轮收口审查

### Skill 与仓库规则的优先级
- 仓库规范高于 skill 建议
- `metadata.md` 高于 skill 建议
- TDD 铁律高于任何“先写实现再补测试”的习惯
- code review 不能替代测试先行

## Requirement 处理方式
- 一次只处理一个 requirement
- requirement 不明确时，先输出计划和假设，再开始实现
- requirement 完成后停止，不自动扩展范围
- 若用户只是要求 review、梳理、设计或配置，应明确说明为什么当前任务不进入业务实现阶段

## 推荐的 requirement 输入结构
建议用户在 `docs/sprint-current.md` 或对话中提供以下信息：
- requirement 名称或编号
- 背景与目标
- 本次范围
- 验收标准
- 非目标范围
- 约束或依赖

如果信息不足，先补计划与假设，不要直接写业务代码。

## 与 Codex 交互的推荐方式

### 如何发起一个新 requirement
推荐方式：
1. 在 `docs/sprint-current.md` 写入当前唯一 requirement
2. 对 Codex 明确说明“按 AGENTS.md 规则处理当前 requirement”
3. 如有特殊约束，直接写在消息里

### 什么时候应显式写 `$test-driven-development`
- 任何你希望 Codex 严格按测试先行推进的功能开发、缺陷修复、重构任务
- 你担心需求复杂、容易先写实现再补测试时
- 你希望 Codex 明确展示 RED -> GREEN 过程时

### 什么时候应显式写 `$react-best-practices`
- 编写或重构 React 组件
- 页面性能、渲染行为、数据获取方式很重要时
- 前端 requirement 涉及加载链路、bundle、重渲染优化时

### 什么时候应显式写 `$code-reviewer`
- 功能实现完成后，希望先做一轮 merge 前审查
- 只想 review 某个 diff、PR、补丁，而不是继续编码时
- 希望重点检查正确性、安全性、可维护性、性能和测试充分性时

### requirement 完成后必须输出的内容
1. 修改了哪些文件
2. 新增了哪些测试
3. 测试是否通过
4. 当前 requirement 是否完成
5. 建议的 commit message

## 当前仓库的执行基线
- 以后默认把当前 requirement 写入 `docs/sprint-current.md`
- 以后每完成一个 requirement，都要更新 `docs/progress.md`
- 前端实现应保持 React + TypeScript 骨架方向，并贴近 Ant Design Pro simple 的信息架构与交互风格
- 后端实现应保持 Node.js + TypeScript + NestJS 风格分层，不要写成一次性脚本式项目
- 三个引擎接入必须以统一契约和平台编排为前提，不要让平台层直接耦合某个引擎内部实现

## 本文件的用途
本文件用于约束 Codex 在本仓库中的默认行为。
如用户消息与本文件冲突，优先遵守用户的明确指令，但不得绕过安全边界与明确禁止项。
