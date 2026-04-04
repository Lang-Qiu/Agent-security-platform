# Progress

Update this file after each completed requirement.

Recommended fields:
- requirement name or id
- change scope
- tests added or updated
- test result
- docs updated
- current conclusion and next blocker

## 2026-04-02 - static-analysis contract and integration test solidification
- requirement: solidify the shared contract and public integration semantics for the finished `static_analysis` mock closed loop without extending engine behavior
- scope: add a canonical contract fixture, strengthen shared contract tests for normalized static-analysis result and finished risk summary semantics, relax backend/integration assertions away from mock-specific snapshots, and align API contract docs with the current closed-loop read behavior
- tests:
  - `shared/tests/task-contract.spec.ts`
  - `shared/tests/api-response.contract.spec.ts`
  - `shared/tests/result-contract.spec.ts`
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass for the requirement-focused verification set:
  - `node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/task-contract.spec.ts shared/tests/api-response.contract.spec.ts shared/tests/result-contract.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "skills-static adapter rejects malformed mock results before closed-loop backfill|engine client registry resolves skills-static engine clients and rejects duplicate engine registration|task engine service dispatches static-analysis tickets through the registered skills-static engine client|task engine service materializes a finished static-analysis shell from a deterministic mock result" backend/tests/task-engine.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "task center service dispatches static-analysis tasks after saving their initial artifacts|task center service backfills static-analysis artifacts when the engine client returns a mock result|task center service does not backfill static-analysis artifacts when the engine client returns a malformed mock result" backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "backend task center creates and lists in-memory tasks through the shared response shell|backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/progress.md`
- notes:
  - shared tests now fix the normalized static-analysis result shape and finished risk-summary semantics using a canonical contract fixture instead of engine-client internals
  - integration assertions now verify response shell stability and cross-endpoint semantic consistency rather than exact mock `rule_hits`, summary wording, or dependency-summary literals
  - future real detection-library adapters should only need to normalize into the same shared contract for these tests to remain valid

## 2026-04-02 - minimal mock skills-static engine closed loop
- requirement: implement the smallest mock engine closed loop for `static_analysis` on top of the completed engine-registration and route-wiring baseline
- scope: keep `POST /api/tasks` as the only public write entry, let `SkillsStaticEngineClient` return a deterministic mock analysis result, and backfill the existing `Task`, `BaseResult`, and `RiskSummary` records through the current task-center mainline
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass for the requirement-focused verification set:
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "task engine service dispatches static-analysis tickets through the registered skills-static engine client|task engine service materializes a finished static-analysis shell from a deterministic mock result" backend/tests/task-engine.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "task center service dispatches static-analysis tasks after saving their initial artifacts|task center service backfills static-analysis artifacts when the engine client returns a mock result" backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "backend task center creates and lists in-memory tasks through the shared response shell|backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `README.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - `SkillsStaticEngineClient` now returns a deterministic mock result payload for `static_analysis`; it still does not call a real scan engine
  - the platform backfills the existing record through a second repository save, so `GET /api/tasks/:taskId`, `GET /result`, and `GET /risk-summary` expose the closed-loop state without adding new routes
  - `POST /api/tasks` remains the unchanged public write entry and still returns the created task shell rather than introducing a new engine-specific response contract
  - the pre-existing unrelated `asset-scan` `.worktrees` failure was not touched and remains outside this requirement

## 2026-04-02 - skills-static engine registration and platform route wiring baseline
- requirement: register `skills-static` on the platform mainline and wire `static_analysis` task creation into an internal engine entry without changing the public task-center API
- scope: add backend `EngineClient` / `EngineClientRegistry`, register `SkillsStaticEngineClient`, keep `POST /api/tasks` as the only public write entry, and dispatch `static_analysis` tickets through the new engine client layer after task creation
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass for the requirement-focused verification set:
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "engine client registry resolves skills-static engine clients and rejects duplicate engine registration|task engine service dispatches static-analysis tickets through the registered skills-static engine client|task center service dispatches static-analysis tasks after saving their initial artifacts" backend/tests/task-engine.service.spec.ts backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "backend task center creates and lists in-memory tasks through the shared response shell|backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot|backend task center returns a created task together with its initial result and risk summary" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `README.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - `static_analysis` remains on the existing `POST /api/tasks` route and still maps to `engine_type = skills_static`
  - adapter responsibilities stay limited to payload/details mapping; engine-entry routing now lives in `EngineClientRegistry` plus `SkillsStaticEngineClient`
  - `TaskCenterService` only dispatches when an engine client is registered, so this stage does not force unrelated engines onto the new path yet
  - there is a pre-existing unrelated baseline failure in this worktree for `asset-scan` live-probe tests caused by path handling under `.worktrees`; it was not changed in this requirement and was excluded from the focused verification set

## 2026-04-01 - skills-static platform-compatible DTO / interface and minimal adapter mapping skeleton
- requirement: add `skills-static`-compatible shared DTOs/interfaces and the smallest backend adapter mapping boundary without changing the public task-center API
- scope: introduce shared `skills-static` result/parameter/target/rule-hit types, narrow `static_analysis.details.rule_hits[]`, add a backend mapper from placeholder engine output into shared details, and keep `POST /api/tasks` as the only public creation entry
- tests:
  - `shared/tests/result-contract.spec.ts`
  - `backend/tests/task-engine.service.spec.ts`
  - `backend/tests/task-center.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass for the requirement-focused verification set:
  - `npm.cmd run test:shared`
  - `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/task-center.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "engine adapters expose stable dispatch placeholders|skills-static adapter maps engine output into base-result compatible details without introducing risk_score|task engine service maps tasks into initial result and risk summary shells without leaking engine internals" backend/tests/task-engine.service.spec.ts`
  - `node --experimental-strip-types --experimental-test-isolation=none --test --test-name-pattern "backend task center keeps static-analysis creation on POST /api/tasks with parameters as the engine options slot" tests/integration/backend-task-center.api.spec.ts`
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - public API routes remain unchanged; `static_analysis` still enters through `POST /api/tasks`
  - shared now provides named `skills-static` contract types instead of leaving `static_analysis.rule_hits` as `unknown[]`
  - backend `skills-static` adapter now owns a minimal engine-result-to-details mapper but still does not execute real scans
  - while verifying, the workspace initially lacked the locked `yaml` dependency in `node_modules`; it was restored with `corepack pnpm install --frozen-lockfile` before rerunning tests

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

## 2026-03-31 - REQ-ASSET-FINGERPRINT-002 offline matcher baseline
- requirement: `REQ-ASSET-FINGERPRINT-002` 基于离线样本的资产指纹匹配 TDD 实现
- scope: 消费现有指纹规则 YAML 与正/负样本，新增最小 backend 离线 matcher，并通过现有 task-center 流程暴露基于样本的初始 asset-scan 结果
- tests:
  - `backend/tests/asset-fingerprint.service.spec.ts`
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
- test result: pass; `node --experimental-strip-types --experimental-test-isolation=none --test backend/tests/asset-fingerprint.service.spec.ts backend/tests/task-engine.service.spec.ts tests/integration/backend-task-center.api.spec.ts` and `npm run test:backend`
- docs updated:
  - `docs/sprint-current.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - backend 已可直接读取 `engines/asset-scan/rules/fingerprints.v1.yaml`，无需在代码中重复维护规则
  - `asset_scan` 任务可通过 `parameters.sample_ref` 在 TDD 流程中加载样本并回填初始指纹详情
  - `ollama`、`langflow`、`autogpt` 的正样本已达到离线 matcher 的 direct 阈值
  - 当时 `openclaw-gateway` 正样本因缺少端口证据，分数为 `0.65`，结论为 `log_only`

## 2026-03-31 - asset fingerprint documentation consolidation and next-step planning
- requirement: 将已完成的离线 matcher 工作收敛到 beginner 与计划文档，并明确推荐的下一条 requirement
- scope: 更新 beginner 指引、刷新总计划（当前状态 + 下一阶段）、将 sprint-current 切换到证据补强 requirement，并记录下一步所需用户输入
- tests: 无；本次仅涉及文档与规划调整
- test result: 未执行；本次更新不涉及运行时行为变更
- docs updated:
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/plans/agent-asset-fingerprinting-discovery-plan.md`
  - `docs/sprint-current.md`
  - `docs/progress.md`
- notes:
  - beginner 指引已从旧的“先补 8 个样本”基线切换为当前真实状态
  - 推荐下一条 requirement 为 `REQ-ASSET-EVIDENCE-003`，而不是直接跳到真实探针执行器
  - 计划已拆分为“先证据补强，再最小真实探针执行”两阶段

## 2026-03-31 - REQ-ASSET-EVIDENCE-003 openclaw sample strengthening checkpoint
- requirement: 通过补齐 openclaw 正样本端口证据并对齐过程文档，稳定证据补强阶段
- scope: 确认补强后的 openclaw 样本达到 direct，更新 sprint 文案到新基线，并将 beginner 转为全过程记录格式
- tests:
  - `npm run test:backend`
- test result: pass; 在更新 openclaw 正样本预期后 backend 测试全绿
- docs updated:
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/sprint-current.md`
  - `docs/progress.md`
- notes:
  - openclaw 正样本已包含端口证据，结果达到 `confidence=0.95`、`disposition=direct`
  - beginner 文档已切换为含“已完成/进行中/待开始”状态的过程日志
  - 下一执行重点仍是扩展 P0 负样本回归覆盖

## 2026-03-31 ~ 2026-04-01 - REQ-ASSET-EVIDENCE-003 negative sample generation (consolidated)
- requirement: 合并记录 P0 负样本批次生成与回归闭环（统一容器、统一脚本、统一回归）
- scope: 连续完成 n002~n009 批次负样本实采与回归接入，覆盖 openclaw/ollama/langflow/autogpt 四个 P0；mock 采样链路统一为 `scripts/dev/negative-sample-mock.py` + `asp-negative-mock`
- tests:
  - `backend/tests/asset-fingerprint.service.spec.ts`
  - `npm run test:backend`
  - `npm run test`
- test result: pass; 各批次均按 RED（先引入样本引用触发缺失失败）-> GREEN（补齐样本后回归通过）执行，最终全仓测试保持全绿
- docs updated:
  - `docs/sprint-current.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - 负样本生成六类场景已覆盖：
    1. 字段缺失
    2. 路径近似
    3. 404/端点不存在
    4. 代理头污染/中间件注入
    5. 跨产品字段复用（交叉污染）
    6. 字段格式伪装（键名变体/语义偏差）
  - 每类场景均已接入 matcher 回归并保持 `confidence < 0.7` 抑制语义
  - 负样本证据链已统一到可复现采样流程，便于后续扩展 P1/P2

## 2026-04-01 - REQ-ASSET-PROBE-004 phase G kickoff and docs alignment
- requirement: `REQ-ASSET-PROBE-004` 真实探针执行器最小闭环（阶段 G）
- scope: 将当前唯一 requirement 从阶段 F 切换至阶段 G，并同步 sprint/plan/beginner/progress 的目标、边界、验收与阶段状态
- tests: 无；本次仅涉及 requirement 切换与文档更新，不涉及运行时行为改动
- test result: 未执行；本次变更为纯文档更新
- docs updated:
  - `docs/sprint-current.md`
  - `docs/plans/agent-asset-fingerprinting-discovery-plan.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
  - `docs/progress.md`
- notes:
  - 阶段 F 已标记完成，阶段 G 已进入执行状态
  - 阶段 G 执行边界已明确：仅 localhost/测试容器/mock server，不触达公网目标
  - 第一轮探针范围已明确：TCP + HTTP HEAD/GET；WebSocket 暂不纳入
  - 下一步必须按 TDD 进入 RED：先补 probe runner/adapter/API 失败测试，再做最小实现

## 2026-04-01 - REQ-ASSET-PROBE-004 minimal live probe loop (RED -> GREEN)
- requirement: `REQ-ASSET-PROBE-004` 阶段 G 第一刀：live probe 最小闭环
- scope: 在 `asset_scan` 中新增受控 live probe 输入通道，并保持与离线 sample 模式并存；打通 adapter -> task-engine -> task-center -> API 的异步创建链路
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
  - `backend/tests/task-center.service.spec.ts`（异步调用适配）
- test result: pass; 先 RED（新增 live probe 断言失败），后 GREEN（实现后 `npm run test:backend` 与 `npm run test` 全绿）
- docs updated:
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
- notes:
  - 新增 `AssetProbeService`，按 `probes.v1.yaml` 目标探针执行最小 HTTP 采集
  - `AssetScanTaskAdapter` 现支持 `sample_ref` 与 `probe_mode=live + probe_target_id` 双路径
  - `TaskCenterController/TaskCenterService/TaskEngineService` 的任务创建链路已异步化
  - live probe 在当前实现中仅面向 localhost/测试容器/mock server 受控目标

## 2026-04-01 - REQ-ASSET-PROBE-004 expand live probe to ollama and openclaw-gateway
- requirement: `REQ-ASSET-PROBE-004` 阶段 G 第二刀：补齐剩余 P0 live probe 覆盖
- scope: 为 `ollama` 增加带 `probe_port_hint` 的 live probe 识别，为 `openclaw-gateway` 增加最小 WebSocket probe 识别，并补齐 task-engine/API 两层回归
- tests:
  - `backend/tests/task-engine.service.spec.ts`
  - `tests/integration/backend-task-center.api.spec.ts`
  - `npm run test:backend`
  - `npm run test`
- test result: pass; `ollama` 与 `openclaw-gateway` 的新增 RED 用例在实现后转 GREEN，最终全仓测试保持通过
- docs updated:
  - `docs/sprint-current.md`
  - `docs/api-contract.md`
  - `docs/architecture.md`
  - `docs/progress.md`
  - `docs/temp/beginner-learning-guide-asset-fingerprint.md`
- notes:
  - `ollama` 通过 `probe_port_hint=11434` 补齐逻辑端口信号，live probe 结果达到 direct 阈值
  - `openclaw-gateway` 通过最小 WebSocket 探针采集 `hello-ok` 与 `presence`，live probe 结果达到 direct 阈值
  - 当前 P0 四个目标均已具备无 `sample_ref` 的 live probe 识别能力
  - `REQ-ASSET-PROBE-004` 当前最小闭环验收项已满足，可在此停下并等待下一条 requirement
