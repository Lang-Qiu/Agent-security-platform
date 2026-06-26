# Sprint Current

## Requirement ID
REQ-T1-SPEC-001

## Requirement Name
赛题一方向化总体设计文档

## Background

当前仓库已经具备 Agent 安全平台骨架，包含 `asset_scan`、`static_analysis`、`sandbox_run` 三条任务线，以及前后端共享任务、结果和风险摘要契约。根据《命题挑战赛赛题.pdf》，项目与赛题一“面向大模型及其应用的安全性研究”最契合。

本 requirement 的目标是先完成赛题一方向化的设计和 requirement 收敛，把最终成果形态明确映射到仓库可持续演进的工程结构中，避免直接进入一次性 demo 实现。

## Goal

- 明确赛题一预期成果与本仓库现有能力的映射关系。
- 确认采用“成果闭环优先”的方案 A。
- 定义后续 Track 1 requirements 的实施顺序。
- 记录 OpenClaw、攻击场景、用例集、攻击脚本、模拟业务工具、行为监督、模型过滤、监督 UI 和报告之间的边界。

## In Scope

- 新增赛题一方向化 spec 文档。
- 记录至少三类初始攻击场景：
  - prompt injection / jailbreak
  - tool-call hijacking
  - context / memory poisoning
- 复用矩阵：说明哪些赛题一成果可复用 `asset_scan`、`static_analysis`、`sandbox_run`、任务中心和前端 sandbox 页面。
- 将当前 active requirement 切换为 `REQ-T1-SPEC-001`。
- 更新 `docs/progress.md` 记录该 doc-only requirement。

## Out of Scope

- 不新增业务逻辑。
- 不新增攻击脚本。
- 不新增模拟工具。
- 不修改 shared/backend/frontend/engine 生产代码。
- 不新增第四个引擎。
- 不实现真实 OpenClaw 接入。

## Acceptance Criteria

- `docs/superpowers/specs/2026-06-27-track1-agent-security-design.md` 存在并覆盖 Objective、Commands、Project Structure、Code Style、Testing Strategy、Boundaries、Success Criteria、Open Questions。
- spec 明确赛题一成果验收层和仓库实现层 requirement。
- spec 明确采用方案 A：成果闭环优先。
- spec 说明本 requirement 属于纯文档更新，是完整 TDD 的允许例外。
- `docs/sprint-current.md` 只包含当前唯一 active requirement。
- `docs/progress.md` 有本 requirement 的记录。

## Constraints / Notes

- 后续修改都在 worktree `codex/track1-requirements-spec` 上进行。
- 后续实现每次只处理一个 requirement，并继续遵守 `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`。
- 当前 worktree 的后端基线存在既有失败：asset-scan 期望漂移和本机 Semgrep Python 依赖缺失；本 requirement 不修复这些问题。
