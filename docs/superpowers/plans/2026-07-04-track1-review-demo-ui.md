# Track 1 Review Demo UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new top-level, all-Chinese "评审模式" (`/review-demo`) page that walks an
evaluator through the five-minute tour defined in
`samples/track1/review-demo/content.zh-CN.json`, showing only metrics that are
directly available from the existing public campaign API, and deep-linking to
the existing `/results/sandbox` campaign workbench for investigation instead
of building a second investigation UI. No backend route, DTO, or Electron
packaging work is in scope.

**Architecture:** The page is a pure consumer: content narrative comes from
the versioned JSON catalog (already gated by
`tests/repository/track1-review-demo-content.spec.ts`), live numbers come
from the existing `campaign-supervision-service` (`getCampaign`,
`listCampaigns`, `getCampaignEvidence`) reused as-is, and deep investigation
reuses the existing `/results/sandbox?campaign_id=...` route. A new
permanent repository gate enforces read-only behavior, catalog reuse (no
duplicated Chinese strings), and route/nav registration, mirroring the
existing `track1-campaign-ui.spec.ts` gate for Phase 5.

**Tech Stack:** React 19, react-router-dom 7, Ant Design 6, Vite 8, Vitest +
Testing Library, TypeScript (NodeNext/ESM), Node.js `node:test` for the
repository gate.

---

## Scope and File Map

- Create `frontend/src/content/review-demo-content.ts`: typed loader for the
  JSON catalog (local content-only types, no shared DTO duplication).
- Modify `frontend/tsconfig.json`: add `resolveJsonModule: true` so the
  catalog import type-checks.
- Create `frontend/src/components/review-demo/ReviewTourNav.tsx`: 5-step
  nav/prev/next control, `step` URL param driven.
- Create `frontend/src/components/review-demo/CampaignSnapshotPanel.tsx`:
  live campaign summary (step 3).
- Create `frontend/src/components/review-demo/ScenarioInvestigationPanel.tsx`:
  three-scenario narrative + deep link (step 4).
- Create `frontend/src/components/review-demo/EvidenceVerificationPanel.tsx`:
  evidence surfaces + evidence readiness + safety boundary + FAQ (step 5).
- Create `frontend/src/pages/ReviewDemoPage.tsx`: page shell, steps 1–2
  inline (pure content), composes the three panels for steps 3–5.
- Create `frontend/src/pages/review-demo.page.spec.tsx`: page test.
- Modify `frontend/src/app/routes.tsx`: register `path: "review-demo"`.
- Modify `frontend/src/app/navigation.tsx`: add a top-level "评审模式" nav
  item (peer of Overview/Tasks/Results).
- Modify `frontend/src/styles/app.css`: minimal styles for the tour shell
  and step panels (grid layout, responsive collapse, no new breakpoints
  beyond the existing 1100px convention already used by campaign mode).
- Create `tests/repository/track1-review-demo-ui.spec.ts`: permanent gate.
- Modify `package.json`: append the new repository spec to `test:repo`.
- Modify `docs/architecture.md`: add `/review-demo` to the route skeleton
  list (line 46) and add a short section describing the page.
- Modify `docs/api-contract.md`: add a "Review Demo UI Frontend Contract"
  section (no new endpoints — documents which existing endpoints/fields are
  reused and which catalog metrics are intentionally left unpopulated).
- Modify `docs/progress.md`: append RED/GREEN evidence and status.

The worktree already contains unrelated uncommitted changes. Preserve them.
Do not commit implementation files from this plan; report a suggested commit
message instead.

## Design Decisions (resolved, do not re-litigate)

1. **Missing tool-effect metrics.** `metric_bindings` in the catalog lists 11
   keys. `Track1CampaignSummary` only exposes `agent_count`, `case_count`,
   `retry_count`, `ask_count`, `blocked_count` directly. The other six
   (`attempt_count`, `deny_count`, `allow_count`, `intercepted_tool_count`,
   `executed_simulated_tool_count`, `real_side_effect_count`) are NOT present
   on the public summary/detail DTOs and must not be derived client-side by
   hand-rolled aggregation (that would duplicate backend counting logic the
   project deliberately keeps server-side). `CampaignSnapshotPanel` renders
   a value for the first five and a fixed neutral label
   ("该指标暂无公开数据源，详见证据包") for the other six.
2. **Route placement.** New top-level route `/review-demo`, alongside
   `/overview` and `/tasks`, not nested under `/results/*` — it is a guided
   tour, not a results view.
3. **UI chrome language.** All UI chrome (nav label, step titles, buttons)
   is Chinese, matching the Chinese content catalog. This intentionally
   diverges from the English console shell elsewhere; do not "fix" that by
   translating the rest of the console.
4. **No second investigation UI.** Step 4 does not re-render session/event
   detail. It links to the existing `/results/sandbox?campaign_id=...&agent_id=...`
   route (`Link`, not a fetch) for investigation, consistent with the Phase 5
   decision to extend the existing workbench rather than build a second one.
5. **No report file serving.** No public route serves
   `security-risk-analysis.md/.pdf`/screenshots/`manifest.json` today. Step 5
   states this plainly instead of inventing a download link; it only shows
   the catalog's `evidence_surfaces` descriptions and the existing
   `getCampaignEvidence` readiness signal (`ready` / `not-ready` / `unavailable`).
6. **Campaign selection.** `/review-demo` accepts an optional `campaign_id`
   query param (validated against the existing
   `/^campaign:t1:[0-9a-f]{32}$/` pattern already used on `/results/sandbox`).
   If absent or invalid, the page calls `listCampaigns({})` and selects the
   first (most recently updated) result, mirroring existing "pick default"
   precedent. If the list is empty or errors, show a read-only empty state
   ("暂无可展示的 campaign 数据，请先运行受控 campaign 或联系运营方核对
   accepted baseline") — no start/retry-campaign command, since campaign
   commands are a permanently prohibited surface in this UI.
7. **Live data reuse.** `CampaignSnapshotPanel` reuses
   `useCampaignSupervisionPolling` + `getCampaign`/`listCampaigns` exactly as
   `SandboxAlertsPage` does, so abort/stale/generation-race handling is not
   reimplemented.

## Task 1: Write and Prove the Repository Gate

**Files:**

- Create: `tests/repository/track1-review-demo-ui.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the failing repository gate**

Create `tests/repository/track1-review-demo-ui.spec.ts` asserting (mirroring
`tests/repository/track1-campaign-ui.spec.ts`):

- `frontend/src/pages/ReviewDemoPage.tsx`,
  `frontend/src/pages/review-demo.page.spec.tsx`,
  `frontend/src/content/review-demo-content.ts`,
  `frontend/src/components/review-demo/ReviewTourNav.tsx`,
  `frontend/src/components/review-demo/CampaignSnapshotPanel.tsx`,
  `frontend/src/components/review-demo/ScenarioInvestigationPanel.tsx`,
  `frontend/src/components/review-demo/EvidenceVerificationPanel.tsx` all
  exist and are non-empty.
- `frontend/src/app/routes.tsx` registers `path: "review-demo"`.
- `frontend/src/app/navigation.tsx` contains a nav entry with
  `path: "/review-demo"`.
- `frontend/src/content/review-demo-content.ts` imports
  `samples/track1/review-demo/content.zh-CN.json` (catalog reuse, not a
  duplicated inline copy of the Chinese strings).
- None of the five new source files contain any of the prohibited command
  strings already banned for campaign UI: `Start campaign`, `Retry attack`,
  `Approve`, `Reject`, `Cancel campaign`, `Edit policy`, `Acknowledge`, plus
  the Chinese equivalents `开始 campaign`, `批准`, `拒绝`（as a command verb,
  not the read-only "deny" tag already used elsewhere), `编辑策略`.
- None of the five new source files reference a report-file HTTP path
  (`security-risk-analysis.md`, `security-risk-analysis.pdf`, `manifest.json`
  as a fetch target) — evidence must go through `getCampaignEvidence` only.
- `package.json` `scripts.test:repo` includes
  `tests/repository/track1-review-demo-ui.spec.ts`.

- [ ] **Step 2: Register the new spec in the root repository gate**

Append `tests/repository/track1-review-demo-ui.spec.ts` to
`scripts.test:repo` in `package.json`, immediately after
`tests/repository/track1-review-demo-content.spec.ts`. Do not alter other
uncommitted script entries.

- [ ] **Step 3: Run the focused test and prove RED**

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-review-demo-ui.spec.ts
```

Expected: FAIL because the frontend files do not exist yet. A
module-resolution or assertion-design error is not valid RED.

## Task 2: Content Loader and tsconfig

**Files:**

- Create: `frontend/src/content/review-demo-content.ts`
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Add `resolveJsonModule` to `frontend/tsconfig.json`**

Add `"resolveJsonModule": true` to `compilerOptions` so the JSON import
type-checks under the existing `esModuleInterop`/strict settings.

- [ ] **Step 2: Create the content loader**

`frontend/src/content/review-demo-content.ts` imports
`../../../samples/track1/review-demo/content.zh-CN.json` as the default
export (Vite native JSON import; already proven to work for cross-package
imports at this repo depth by the existing `shared/` imports in
`frontend/src/services/*.ts`). Define local TypeScript interfaces for the
catalog shape (`ReviewDemoContent`, `ReviewTourStep`, `ReviewScenario`,
`ReviewMetricBinding`, `ReviewEvidenceSurface`, `ReviewSafetyBoundaryItem`,
`ReviewFaqItem`, `ReviewCapability`) matching the JSON 1:1. Export one typed
constant `reviewDemoContent: ReviewDemoContent` and one helper
`getReviewMetricBindings(): ReviewMetricBinding[]` (thin passthrough, exists
so components don't reach into the raw JSON shape directly). Do not
redefine any existing shared DTO name.

## Task 3: Tour Shell and Steps 1–2 (Pure Content)

**Files:**

- Create: `frontend/src/components/review-demo/ReviewTourNav.tsx`
- Create: `frontend/src/pages/ReviewDemoPage.tsx`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `frontend/src/app/navigation.tsx`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: `ReviewTourNav`**

Props: `steps: ReviewTourStep[]`, `activeStepId: string`,
`onSelect(stepId: string): void`. Renders an Ant Design `Steps` (or `Tabs`,
pick whichever matches existing admin-console density better after a quick
look at `antd` version's `Steps` component) with each step's `title`, plus
"上一步"/"下一步" `Button`s that move `activeStepId` to the prior/next step in
`order`. No internal fetch.

- [ ] **Step 2: `ReviewDemoPage` shell**

- Reads/writes a `step` URL search param (`useSearchParams`), one of the
  five catalog step IDs; invalid/missing values default to the first step
  by `order`.
- Reads/writes `campaign_id` URL search param per Design Decision 6.
- Renders `ReviewTourNav` plus the active step's body:
  - `product-boundary` (step 1): render `product`, `source_notice`, and
    `safety_boundary` directly from `reviewDemoContent` — pure content, no
    fetch.
  - `runtime-readiness` (step 2): render `capabilities` directly from
    `reviewDemoContent` — pure content, no fetch, no live health probe (out
    of scope for this slice).
  - `campaign-overview` (step 3): render `<CampaignSnapshotPanel campaignId={...} onCampaignResolved={...} />`.
  - `scenario-investigation` (step 4): render
    `<ScenarioInvestigationPanel scenarios={reviewDemoContent.scenarios} campaignId={...} />`.
  - `evidence-verification` (step 5): render
    `<EvidenceVerificationPanel evidenceSurfaces={...} safetyBoundary={...} faq={...} campaignId={...} />`.
- Each step also renders that step's `evaluator_question` and
  `presenter_guidance` from the catalog above the step body (shared frame,
  not duplicated per-step).

- [ ] **Step 3: Wire the route and nav**

`frontend/src/app/routes.tsx`: add `{ path: "review-demo", element: <ReviewDemoPage /> }`
as a top-level child of `ConsoleLayout`, alongside `overview`/`tasks`.

`frontend/src/app/navigation.tsx`: add a top-level item
`{ key: "/review-demo", label: "评审模式", path: "/review-demo", icon: <CompassOutlined /> }`
after the `results` group (or before it — match existing item ordering by
adding it last, least disruptive to existing snapshot-style tests if any
exist for nav order; confirm no such test before finalizing position).

- [ ] **Step 4: Minimal CSS**

Add a `.review-demo-*` block to `frontend/src/styles/app.css` for the tour
shell layout (two-column: nav + content, or stacked on narrow viewports)
reusing the existing `@media (max-width: 1100px)` breakpoint convention.

## Task 4: Campaign Snapshot Panel (Step 3)

**Files:**

- Create: `frontend/src/components/review-demo/CampaignSnapshotPanel.tsx`

- [ ] **Step 1: Implement**

Props: `campaignId: string | null`, `onCampaignResolved(campaignId: string | null): void`.

- If `campaignId` is null, call `listCampaigns({}, { signal })` once on
  mount, pick the first result (already sorted `updated_at` desc by the
  backend), call `onCampaignResolved` with its `campaign_id` (or `null` if
  the list is empty/erroring), and let the parent update the URL. Render the
  empty-state message from Design Decision 6 when there is no campaign to
  resolve to.
- Once a `campaignId` is known, reuse `useCampaignSupervisionPolling` with a
  `loadCampaign` identical in shape to `SandboxAlertsPage`'s (fetch detail +
  summary in parallel, require the summary match).
- Render a metric grid using `getReviewMetricBindings()` for labels: for
  `agent_count`, `case_count`, `retry_count`, `ask_count`, `blocked_count`
  show the live `Track1CampaignSummary` field value; for the remaining six
  keys show the fixed neutral tag text from Design Decision 1.
- Render the existing `CampaignOverviewHeader`-style status tag
  (`summary.status`) for context, but do not duplicate its evidence-state
  marker logic — this panel is a snapshot, not the Phase 6 screenshot
  target.
- Read-only: no retry/start/cancel controls beyond a single "重新加载"
  button that calls the hook's `retry()`.

## Task 5: Scenario Investigation Panel (Step 4)

**Files:**

- Create: `frontend/src/components/review-demo/ScenarioInvestigationPanel.tsx`

- [ ] **Step 1: Implement**

Props: `scenarios: ReviewScenario[]`, `campaignId: string | null`.

Render the three scenarios in catalog order as cards/list items showing
`display_name`, `evaluator_question`, `controlled_attack_objective`,
`control_mechanism`, `residual_risk`, and the `evidence_surfaces` id list as
tags. Each scenario has a `Link` (react-router-dom) to
`/results/sandbox?campaign_id=<campaignId>&agent_id=<scenario.agent_id>`,
rendered only when `campaignId` is non-null; otherwise show the link
disabled with a tooltip explaining a campaign must be resolved first (ties
back to step 3).

## Task 6: Evidence Verification Panel (Step 5)

**Files:**

- Create: `frontend/src/components/review-demo/EvidenceVerificationPanel.tsx`

- [ ] **Step 1: Implement**

Props: `evidenceSurfaces: ReviewEvidenceSurface[]`,
`safetyBoundary: ReviewSafetyBoundaryItem[]`, `faq: ReviewFaqItem[]`,
`campaignId: string | null`.

- Render `evidenceSurfaces` as a list with `title`/`description` and a
  `fixture_state` tag (`structured_fixture` / `reviewable_fixture` /
  `binary_placeholder` → three fixed Chinese labels, e.g. "结构化证据" /
  "可读证据" / "二进制占位校验件，非正式证据").
- If `campaignId` is set, call `getCampaignEvidence(campaignId)` on mount
  and render one of three states: `ready` (data present),
  `not-ready` (`error === "not-ready"`), `unavailable` (any other failure).
  No file download control (Design Decision 5).
- Render `safetyBoundary` statements as a plain list.
- Render `faq` as an Ant Design `Collapse` (question/answer pairs).

## Task 7: Frontend Tests and GREEN

**Files:**

- Create: `frontend/src/pages/review-demo.page.spec.tsx`
- Test: all Task 3–6 files

- [ ] **Step 1: Write the page spec**

Follow the `sandbox-alerts.page.spec.tsx` pattern: `renderAppAtRoute` +
`vi.mock("../services/campaign-supervision-service")` with
`vi.importActual` passthrough, overriding `getCampaign`, `listCampaigns`,
`getCampaignEvidence` per test. Cover:

1. Renders all five step titles from the catalog; `step` URL param
   navigation moves between them.
2. Step 3 with a mocked campaign: shows live values for the five
   API-backed metrics and the fixed placeholder text for the other six.
3. Step 3 with an empty campaign list: shows the empty-state message, no
   command button.
4. Step 4: renders the three scenarios in canonical order; deep link `href`
   matches `/results/sandbox?campaign_id=...&agent_id=...` once a campaign
   is resolved.
5. Step 5: renders `not-ready` state when `getCampaignEvidence` returns
   `error: "not-ready"`, and `unavailable` on generic failure.

- [ ] **Step 2: Run focused frontend tests and prove GREEN**

```powershell
npm run test --prefix frontend -- review-demo
```

- [ ] **Step 3: Run the repository gate and prove GREEN**

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-review-demo-ui.spec.ts
npm run test:repo
```

- [ ] **Step 4: Run the full frontend suite**

```powershell
npm run test:frontend
```

Expected: all existing frontend tests still pass (no regression to
`SandboxAlertsPage`, routing, or navigation tests).

## Task 8: Documentation and Close

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Update the route skeleton**

In `docs/architecture.md` line 46, add `/review-demo` to the listed route
skeleton. Add a short subsection (mirroring the existing Phase 5 UI
subsection style) describing the review-demo page's read-only, catalog+API
composition and its explicit non-goals (no new backend route, no report
file serving, no second investigation UI).

- [ ] **Step 2: Document the frontend contract**

In `docs/api-contract.md`, add a "REQ-T1-DEMO-010 Review Demo UI Frontend
Contract" section: no new endpoints; lists the exact existing endpoints
reused (`GET /api/supervision/campaigns`,
`GET /api/supervision/campaigns/:campaignId`,
`GET /api/supervision/campaigns/:campaignId/evidence`); states which five
metric keys are populated from `Track1CampaignSummary` and which six are
intentionally left as a fixed placeholder pending a future evidence-package
API.

- [ ] **Step 3: Append progress evidence**

Append a dated `docs/progress.md` section: requirement `REQ-T1-DEMO-010
review-demo UI`; scope; RED command/failure; GREEN focused + full frontend
+ root gate counts; explicit note that no backend route, DTO, or Electron
packaging changed; status `REVIEW_DEMO_UI_COMPLETE`; next dependency:
explicit user approval before any Electron/executable packaging work.

- [ ] **Step 4: Stop and report**

Report: modified/created files; new test counts (repository gate + frontend
page spec); RED/GREEN evidence; confirmation that steps 1–2 are pure
content, step 3 shows exactly 5 of 11 metrics live, step 4 deep-links to the
existing workbench, step 5 has no file-download control; suggested commit
message `feat(track1): add review demo UI`; explicit statement that no
Electron/executable packaging work was started and it requires separate
approval.
