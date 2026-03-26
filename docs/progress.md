# Progress

Update this file after each completed requirement.

Recommended fields:
- requirement name or id
- change scope
- tests added or updated
- test result
- docs updated
- current conclusion and next blocker

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
