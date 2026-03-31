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

## 2026-03-26 - REQ-04 frontend tasks page
- requirement: `REQ-04` frontend Tasks page
- scope: replace the `/tasks` placeholder with a minimal queue workspace, add a thin frontend task service, keep the list aligned to shared task contracts, and preserve a stable entry into `/tasks/:taskId`
- tests:
  - `frontend/src/pages/tasks.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - Tasks page now renders a minimal operator-facing table with `task_id`, `task_type`, `status`, `risk_level`, and `created_at`
  - the frontend service prefers the existing `GET /api/tasks` contract and falls back to local mock rows when the backend is unavailable
  - each row now exposes a stable detail-route entry point so the next requirement can deepen `/tasks/:taskId` without rewriting the list shell

## 2026-03-26 - REQ-05 frontend task detail page
- requirement: `REQ-05` frontend Task detail page
- scope: replace the `/tasks/:taskId` placeholder with a stable detail workspace, add a shared task overview section, map `task_type` to three result sections, and fall back cleanly when result details are missing
- tests:
  - `frontend/src/pages/task-detail.page.spec.tsx`
  - `frontend/src/pages/tasks.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - Task detail now has one shared information area plus three task-type-specific result placeholders: asset scan, static analysis, and sandbox alerts
  - the detail service fetches `/api/tasks/:taskId` and `/api/tasks/:taskId/result` in parallel, then falls back to local mocks when the backend is unavailable
  - missing or empty `details` no longer breaks the page; the result region stays structurally stable and shows a unified fallback message instead

## 2026-03-26 - REQ-06 frontend-backend task integration loop
- requirement: `REQ-06` frontend Tasks page and Task detail page backend integration
- scope: connect frontend services to the existing backend tasks API, normalize API payloads through shared contracts, add a visible backend-vs-mock data source indicator, and extend Task detail to read `result` plus `risk-summary`
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test:frontend`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the frontend list route now reads `GET /api/tasks` through a shared-contract-aware service instead of depending only on static page mocks
  - the frontend detail route now reads `GET /api/tasks/:taskId`, `GET /api/tasks/:taskId/result`, and `GET /api/tasks/:taskId/risk-summary`
  - local frontend development now proxies `/api` to the backend on `127.0.0.1:3000`, while service-level fallback keeps isolated frontend work possible when the backend is offline

## 2026-03-26 - backend engine adapter baseline
- requirement: backend engine adapter/service integration points
- scope: keep the public task-center API unchanged, add a stable internal handoff from `Task` to engine adapters, and centralize initial `BaseResult` / `RiskSummary` creation behind a dedicated service
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
- test result: pass; `cmd /c npm run test:backend` and `cmd /c npm run test`
- docs updated:
  - `docs/architecture.md`
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - backend now uses `TaskEngineService` as the stable platform-to-engine handoff point instead of letting `TaskCenterService` manage adapter details directly
  - each adapter now reserves both dispatch-payload creation and initial result-detail creation for `asset-scan`, `skills-static`, and `sandbox`
  - future engine submit/poll/callback logic can extend `TaskEngineService` and adapter implementations without changing the current public task APIs

## 2026-03-26 - frontend data source state refinement
- requirement: refine frontend integration state from `api/mock` into `api/degraded/mock`
- scope: keep the existing tasks pages and backend API unchanged, but make partial contract failures visible instead of silently presenting them as healthy backend data
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/services/task-service.spec.ts src/pages/tasks.page.spec.tsx src/pages/task-detail.page.spec.tsx` and `cmd /c npm run test:frontend`
- docs updated:
  - `docs/progress.md`
- notes:
  - frontend services now distinguish between fully valid backend responses, partially degraded backend responses, and pure mock fallback
  - invalid rows in `GET /api/tasks` now keep valid rows but surface a degraded state instead of silently claiming full backend health
  - task detail now marks the page as degraded when `task` exists but `result` or `risk-summary` must be synthesized locally

## 2026-03-26 - frontend integration error visibility
- requirement: fix the must-fix review issue where contract-invalid backend responses were still shown as healthy backend integration
- scope: keep the current backend routes and page structure unchanged, but distinguish contract-invalid API responses from backend-unavailable mock fallback
- tests:
  - `frontend/src/services/task-service.spec.ts`
  - `frontend/src/pages/tasks.page.spec.tsx`
  - `frontend/src/pages/task-detail.page.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/services/task-service.spec.ts src/pages/tasks.page.spec.tsx src/pages/task-detail.page.spec.tsx`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `integration-error` now means the backend answered but failed shared contract normalization on one or more required payloads
  - `degraded` remains reserved for pages that can still render from a valid backend `Task` while synthesizing missing dependent payloads
  - frontend mock fallback no longer masquerades as healthy backend API data when the backend response shape drifts from the shared contract

## 2026-03-26 - repository full-stack test gate
- requirement: fix the must-fix review issue where root `npm run test` did not cover frontend verification
- scope: add a repository-level script-definition test, introduce a canonical `test:all` gate, and make root `test` delegate to the full-stack gate
- tests:
  - `tests/repository/root-test-entry.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts` and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - root `npm run test` now delegates to `npm run test:all`
  - `test:all` now covers repository script checks, shared contracts, backend tests, and frontend tests
  - a green root test run now means the current platform skeleton is green across all three active layers

## 2026-03-26 - neutralize global layout data-source badge
- requirement: fix the misleading hard-coded `Mock Data Mode` badge in the shared console layout header
- scope: keep page-level data source indicators unchanged, but remove the layout-level mock badge so global shell chrome stays neutral during frontend-backend integration
- tests:
  - `frontend/src/app/app-shell.spec.tsx`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/app/app-shell.spec.tsx`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the shared layout header no longer claims a global mock state
  - `Backend API`, `Degraded API Data`, `Integration Error`, and `Mock Fallback` remain page-scoped signals owned by page-level data loading
  - this removes the visual conflict between shell chrome and real page integration status

## 2026-03-26 - backend adapter guardrails
- requirement: fix backend adapter registry and task-engine service so duplicate adapter registration and engine-type mismatches fail fast
- scope: add explicit registry protection for duplicate `task_type` registration and add task-to-adapter engine-type validation before dispatch ticket or initial artifact creation
- tests:
  - `backend/tests/task-engine.service.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-engine.service.spec.ts`, `cmd /c npm run test:backend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - the adapter registry now rejects multiple adapters claiming the same `task_type`
  - the task-engine service now fails fast when `task.engine_type` and adapter `engineType` drift apart
  - backend engine handoff no longer silently hides placeholder wiring mistakes that would become harder to debug once real engines are connected

## 2026-03-26 - frontend shared task formatters
- requirement: remove repeated task label and timestamp formatting logic from multiple frontend presentation components
- scope: extract shared task presentation helpers, reuse them in the Tasks page and Task detail overview section, and enforce the boundary with a repository-level structure test
- tests:
  - `frontend/src/utils/task-formatters.spec.ts`
  - `tests/repository/frontend-formatting-boundary.spec.ts`
- test result: pass; `cmd /c npm run test --prefix frontend -- src/utils/task-formatters.spec.ts`, `node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/frontend-formatting-boundary.spec.ts`, `cmd /c npm run test:frontend`, and `cmd /c npm run test`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - `TaskListPage` and `TaskOverviewSection` now share one formatter source for `task_type` and timestamp labels
  - root `test:repo` now includes a structure guard so these two pages do not silently drift back into duplicated presentation helpers
  - the refactor keeps page behavior stable while reducing future formatting drift as more task-facing pages are added

## 2026-03-30 - REQ-ASSET-DISCOVERY-001 phase A freeze and phase B draft
- requirement: `REQ-ASSET-DISCOVERY-001` 智能体资产测绘与指纹识别查找产物落地（非引擎实现）
- scope: freeze phase-A inputs (targets, boundaries, confidence policy), convert target-specific signals into probe/rule draft artifacts, and prepare phase-B review-ready catalog files
- tests: none; this iteration is documentation/rule-modeling only with no production behavior change
- test result: not run (no code-path behavior changes)
- docs updated:
  - `docs/temp/stage_A_330.md`
  - `docs/progress.md`
  - `engines/asset-scan/rules/probes.v1.yaml`
  - `engines/asset-scan/rules/fingerprints.v1.yaml`
- notes:
  - phase-A now has unique `target_id` set and P1 denominator fixed to 3 with target >= 2/3 coverage
  - conservative confidence policy is aligned to `>=0.80 direct`, `0.70-0.79 suspected`, `<0.70 log only`
  - phase-B drafts now include target-specific probes for `openclaw-gateway`, `ollama`, `langflow`, and `autogpt`
  - next blocker: provide positive/negative sample JSON files for each P0 target to replace placeholder sample refs
