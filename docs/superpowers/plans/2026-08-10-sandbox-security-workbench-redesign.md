# Sandbox Security Workbench Cinematic Runtime Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Use `superpowers:test-driven-development` for every production behavior and `react-best-practices` while editing React code. Before the first UI production edit and again during Visual QA/polish, invoke `ui-ux-pro-max`; also invoke `frontend-design` and `emil-design-eng` when installed (all three were installed when this revision was written). Their recommendations are review input only: they may not override the approved Spec, change real request/decision semantics, add dependencies, or widen this requirement. Use `code-reviewer` for the closing review, then invoke `superpowers:verification-before-completion` and collect fresh evidence before any final pass/completion claim.

**Goal:** Evolve `/sandbox-security/workbench` into the specified R2 Cinematic Runtime Console after approval while preserving the one-shot simulation API, memory-only credentials, content-free result rendering, and every existing backend/shared/engine contract.

**Architecture:** `SandboxSecurityWorkbenchPage` remains the only owner of request state, capability state, idempotency, and API calls. It freezes only content-free submission facts and passes one exclusive view-state union to a presentational `EvaluationInspector`; the Inspector composes an always-present causal rail, the existing Showcase runtime components, a fixed-position decision climax, and a real-data lifecycle trace. All motion is a finite post-response presentation sequence, reduced motion settles immediately, and no loading UI implies detector streaming.

**Tech Stack:** React 19.2.4, TypeScript 6.0.2, Ant Design 6.3.4, Motion 13.0.0, Vite 8.0.2, Vitest 4.1.1, Testing Library 16.3.2, CSS custom properties, Node.js 22.19.0, pnpm 10.0.0.

---

## Document Status

- Requirement: Sandbox Workbench Cinematic Runtime Redesign
- Plan date: 2026-08-10
- Plan status: `PLAN_COMPLETE_PENDING_EXECUTION_APPROVAL`
- Canonical specification: `docs/superpowers/specs/2026-08-09-sandbox-workbench-redesign.md`
- Specification revision: R2 / R2.1 layout-reveal decoupling
- Planning delivery is documentation-only, so it is an explicit exception to production RED/GREEN.
- Execution remains blocked while the specification says `DRAFT_PENDING_USER_REVIEW` and `Implementation authority: NOT YET GRANTED`; writing this plan does not grant implementation authority.
- The current checkout is already a dedicated `sandbox` worktree, but it contains user-owned modified and untracked files. In particular, `SandboxSecurityWorkbenchPage.tsx`, `app.css`, and `docs/progress.md` are modified, while the Showcase components this plan imports are untracked. Execution must not begin until the user chooses a safe base disposition for those overlapping prerequisites.

## Locked Decisions and Resolved Ambiguities

1. The API remains one-shot. `loading` may show only an EVALUATING badge, three detector-kind shimmer rows, and a static low-opacity EvidenceTrace. Every result reveal starts after the response exists.
2. Result state binds the returned decision to a content-free submission snapshot. It never reads source count or request bytes from a form the operator may edit after submission.
3. `clientSubmittedAt` is a real client event timestamp captured when the idempotency key is first created. ExecutionTrace uses row id `REQUEST_SUBMITTED`, visibly marks its origin `CLIENT_SUBMITTED`, labels it `请求提交`, and displays the field as `client_submitted_at`; it never uses `REQUEST_RECEIVED`, `请求接收`, or any server-receipt wording because no server receipt timestamp exists.
4. EvidenceTrace uses execution-status precedence: `failed/invalid_result > timeout > matched/no_match > skipped/absent`. ExecutionTrace returns `skipped` only when a detector kind is absent or every run is skipped; any `failed`, `invalid_result`, or `timeout` run makes the aggregate `error`; otherwise a `matched` or `no_match` run makes it `ok`, even when optional sibling runs are skipped. Skipped runs remain visible in the detail but never downgrade a successful aggregate to warning.
5. EvidenceTrace maps timeout to amber because it communicates execution status. ExecutionTrace maps a detector timeout to error/red because section 6.3 explicitly groups timeout with lifecycle errors. Decision risk severity never colors RULE, MODEL, or JUDGE nodes.
6. The illustrative policy copy `FAIL-CLOSED · 全量检测器 · 拒绝优先` is not used. The authoritative runtime manifest shows that Judge remains routed/optional. Frontend copy is limited to verified facts:
   - balanced: `规则必检 · 本地模型可选 · 高/严重风险短路`
   - strict: `规则与本地模型必检 · 中/高/严重风险短路`
7. `DecisionSummaryPanel` gains a `workbench` variant while its existing `summary` variant remains the default. This lets Workbench reuse `VerdictHero` without changing or duplicating the existing Showcase page.
8. The Workbench decision section mounts in its final position immediately, but `VerdictHero` itself mounts only when the decision gate opens so its one-shot pulse occurs at the climax and its Showcase-only idle copy never leaks into Workbench. Reduced motion opens that gate on the first result render.
9. All result wrappers mount in final DOM order. Before a wrapper's reveal gate opens it is visually hidden, `aria-hidden="true"`, and HTML `inert`; opacity is presentation only and is never the interaction gate. `aria-hidden` and `inert` are removed in the same render that opens that wrapper's gate. `EvaluationInspector` owns one polite live region that stays mounted and empty through idle, loading, error, and the pre-decision result phases; it sits outside every hidden/inert visual surface and receives verdict text only when the Decision gate opens. Thus the real page updates an already-mounted live region even when reduced motion settles every visual gate on the first result render.
10. DECISION-node action colors reuse the existing value-tag semantics: `deny` red, `allow` green, `alert` orange, and `ask` cyan; an `indeterminate` verdict remains muted regardless of action. This completes the spec's verdict/action rule without inventing a new risk mapping.
11. Reveal order is contractual only as `Evidence -> Findings -> Detectors -> Decision -> ExecutionTrace`. Numeric delays such as 0.2 s, 0.8 s, and 2.2 s are private initial tuning targets, are never copied into tests, and may be adjusted modestly during Visual QA without changing the order.
12. SourceCard preserves the shared request contract rather than the current row's accidental string-only edit behavior. A valid edit in an `application/json` row is parsed back to the corresponding `SandboxSecurityJsonValue`; `text/plain` always remains an exact string. A media-type change normalizes the current displayed value at the boundary: structured JSON becomes its displayed JSON text when changed to `text/plain`, while JSON-looking text is parsed when changed to `application/json`. Like the existing `ToolRequestFields` convention, a JSON string scalar and an invalid raw JSON draft both occupy the contract's existing string branch after parsing/fallback; this requirement adds no hidden draft-validity state, API field, or JSON-editor subsystem. The user explicitly approved this UI contract correction; the shared DTO, normalizer, and service request shape do not change.
13. Major Workbench surfaces stay in the Spec's 20-24 px direction: existing `.console-panel` surfaces inherit 24 px and the standalone ExecutionTrace starts at 20 px. Technical inner surfaces use 8-12 px. These are initial in-range values, not pixel-perfect locks; screenshot QA may tune only within the approved ranges and may not globally reduce `.console-panel`.
14. The primary Workbench visual reference is the previously approved `.runtime/landing-audit/target.png` (1672x941, SHA-256 `E813DE21D73C51E266F0E800CD3D1D7C8B55A8E6C9F94B389A9870E3F1E1D64A`). It guides composition and finish, not data or behavior. Priority is real business semantics and usability > Landing/Showcase brand consistency > visual convergence toward the reference > pixel-perfect reproduction.

## File Map

### Create

| Path | Single responsibility |
| --- | --- |
| `frontend/src/components/sandbox-security/StageSelector.tsx` | Three radio-semantic horizontal stage tabs and the selected Chinese description |
| `frontend/src/components/sandbox-security/PolicySelector.tsx` | Two profile cards and one non-interactive, authority-backed policy status line |
| `frontend/src/components/sandbox-security/EvidenceTrace.tsx` | Five-node causal rail and execution-status aggregation |
| `frontend/src/components/sandbox-security/ExecutionTrace.tsx` | Seven-step lifecycle projection from a decision plus frozen content-free submission facts |
| `frontend/src/components/sandbox-security/EvaluationInspector.tsx` | Exclusive idle/loading/error/result rendering, persistent Workbench decision live region, and finite result reveal orchestration |

### Modify

| Path | Change |
| --- | --- |
| `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx` | Keep API ownership, clear an explicitly rejected capability, bind decision to submission facts, clear stale result on submit, build Inspector state, and render the upgraded header |
| `frontend/src/pages/sandbox-security-workbench.page.spec.tsx` | State machine, client-submit semantics, detector aggregation, DOM/reveal/focus order, eventual visibility, reduced motion, and re-submit coverage |
| `frontend/src/components/sandbox-security/EvaluationRequestForm.tsx` | Compose StageSelector and PolicySelector; retain controlled request behavior, limits, tool fields, violations, and submit |
| `frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx` | Stage tabs, policy status, compact source rows, structured JSON/text request semantics, meter warning, add/remove, and CTA coverage |
| `frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx` | Empty/held/rejected presentation without receiving or retaining the token value |
| `frontend/src/components/sandbox-security/capability-session-panel.spec.tsx` | Held/rejected rendering and unchanged privacy behavior |
| `frontend/src/components/sandbox-security/ContentItemRow.tsx` | Compact SourceCard header, two-row contract-preserving text/structured-value editor, explicit value-display byte count, and accessible inline controls |
| `frontend/src/components/sandbox-security/RequestLimitMeter.tsx` | Class-driven technical meter, over-limit state, and greater-than-90-percent warning |
| `frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx` | Preserve the default summary/live region; add the visually gated Workbench wrapper around VerdictHero while leaving Workbench announcement ownership to EvaluationInspector |
| `frontend/src/components/sandbox-security/decision-rendering.spec.tsx` | Workbench visual variant, reveal state, simulation warning, identity, and default-summary live-region regression coverage |
| `frontend/src/pages/sandbox-security-privacy.spec.tsx` | Update the CTA query only; retain the complete privacy sentinel semantics |
| `frontend/src/styles/app.css` | Change the existing grid ratio and append the complete `.workbench-*` block, loading keyframes, responsive rules, and reduced-motion shutdown |
| `tests/repository/frontend-console-theme-literals.spec.ts` | Require the redesign selector inventory and scan every changed/new Workbench TSX file for color literals |
| `README.md` | Describe the upgraded Workbench without changing its route or API boundary |
| `docs/architecture.md` | Record page/Inspector ownership, final DOM order, and one-shot presentation boundary |
| `docs/progress.md` | Record requirement scope, validation, review, and unchanged contracts after implementation |

### Check and Leave Unchanged

- `docs/api-contract.md`: no request, response, route, or DTO changes.
- `docs/sprint-current.md`: the user supplied the redesign requirement directly; do not invent a new requirement ID or rewrite the current sprint without explicit authority.
- `frontend/src/components/sandbox-security/FindingsTable.tsx` and `DetectorRunTable.tsx`: retained for existing consumers/tests, no longer used by the redesigned Workbench result pane.

### Explicitly Do Not Modify

- `backend/**`, `shared/**`, `engines/**`
- `frontend/src/services/sandbox-security-service.ts`
- `frontend/src/services/api-client.ts`
- `frontend/src/utils/sandbox-security-limits.ts`
- `frontend/src/components/sandbox-security/showcase/**`
- `frontend/src/content/sandbox-security-showcase.ts`
- `frontend/src/pages/SandboxSecurityShowcasePage.tsx`
- `frontend/package.json`, `pnpm-lock.yaml`
- routing, navigation, Console layout, or any other page

## Task 0: Reconfirm the Execution Gate and Baseline

**Files:**
- Read: `docs/superpowers/specs/2026-08-09-sandbox-workbench-redesign.md`
- Read: `metadata.md`
- Read: `docs/sprint-current.md`
- Read: `docs/api-contract.md`
- Read: `docs/architecture.md`
- Read: `.github/instructions/frontend.instructions.md`
- Read: `.github/instructions/docs.instructions.md`
- Read: `frontend/src/components/sandbox-security/ContentItemRow.tsx`
- Read: `frontend/src/components/sandbox-security/ToolRequestFields.tsx`
- Read: `shared/types/sandbox-security.ts`
- Read: `frontend/src/components/sandbox-security/showcase/SpotlightSurface.tsx`
- Read: `frontend/src/components/sandbox-security/showcase/FindingsCascade.tsx`
- Read: `frontend/src/components/sandbox-security/showcase/DetectorChain.tsx`
- Read: `frontend/src/components/sandbox-security/showcase/VerdictHero.tsx`
- Required visual input: `.runtime/landing-audit/target.png`

- [ ] **Step 1: Confirm explicit implementation authority**

Do not edit production files unless the user has explicitly approved implementation after this plan. The accepted specification must still authorize exactly one frontend redesign and must continue to forbid backend, shared, engine, dependency, route, and API changes.

- [ ] **Step 2: Verify the dedicated worktree and preserve user changes**

Run:

```powershell
git branch --show-current
git worktree list
git status --short
git diff -- frontend/src/pages/SandboxSecurityWorkbenchPage.tsx frontend/src/styles/app.css docs/superpowers/specs/2026-08-09-sandbox-workbench-redesign.md
```

Expected: branch `sandbox`; this checkout appears in `git worktree list`; the known user-owned modifications and untracked Showcase files remain visible.

Before Task 1, obtain explicit user direction for the overlapping base. The safe default is for the user to create or authorize a separate base commit containing the already-written Showcase route/components and existing Workbench/CSS/progress changes, after which every implementation target must be clean relative to that base. Do not create that base commit, stash, reset, checkout, clean, or partially absorb those changes without authorization. Stop if `SandboxSecurityWorkbenchPage.tsx`, `app.css`, `docs/progress.md`, or any imported `showcase/**` prerequisite still has an unresolved ownership boundary, or if another process is editing a target file. Once the base is explicit, the later exact-path `git add` commands are safe and must still exclude unrelated paths.

- [ ] **Step 3: Select the repository runtime**

Run:

```powershell
nvm use 22.19.0
node --version
corepack.cmd pnpm --version
```

Expected: Node `v22.19.0` and pnpm `10.0.0`. Stop on any other version.

- [ ] **Step 4: Run the unchanged narrow baseline**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/components/sandbox-security/decision-rendering.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx
npm.cmd run test:repo
```

Expected: both commands exit 0 before new tests are written. Record the observed counts in the execution log; do not edit a failing baseline.

- [ ] **Step 5: Run the pre-implementation UI-skill and component-interface gate**

Invoke `ui-ux-pro-max`, then `frontend-design` and `emil-design-eng` when they are installed, with the accepted R2 Spec, the current Workbench, the current Showcase, the existing console tokens, and the operator-console job to be done. This is the implementation-phase invocation required before any production UI edit. Keep the output in the execution notes as a short, scope-bound decision log covering hierarchy, density, accessibility, responsive behavior, semantic color, 20-24 px major versus 8-12 px inner radii, motion restraint, and the rejection of generic Ant Design or game-HUD styling. Do not persist a new design system, add a dependency, rewrite the Spec, or accept a skill suggestion that conflicts with the approved requirement.

Re-open the real Showcase files immediately before Task 1 and verify these exact interfaces and behaviors rather than relying on the plan from memory:

```ts
VerdictHero({ decision, active, reduceMotion })
FindingsCascade({ findings, active, reduceMotion })
DetectorChain({ runs, active, onComplete? })
SpotlightSurface({ className?, ariaLabel?, children })
```

`DetectorChain` has no `reduceMotion` prop and owns that preference internally; omit its optional `onComplete` because `EvaluationInspector` owns the reveal clock. `FindingsCascade active={false}` omits its interactive finding buttons, while `DetectorChain active={false}` still renders run rows, so the Workbench wrapper must supply the complete `inert` gate. Pass an explicit `ariaLabel` to every Workbench `SpotlightSurface` usage even though the current prop is optional, but do not treat it as landmark semantics: the real component forwards it to an ordinary `div` with no `role`; the outer named `EvaluationInspector` section remains the accessible region. `VerdictHero` receives `active={true}` only after its wrapper gate opens. If any real export or prop differs at execution time, stop and revise the plan before editing production code; do not invent a prop or import a nonexistent barrel.

- [ ] **Step 6: Verify the approved visual-reference and brand-comparison inputs**

Run:

```powershell
Get-Item .runtime\landing-audit\target.png
Get-FileHash -Algorithm SHA256 .runtime\landing-audit\target.png
rg -n "sandbox-security-showcase" frontend/src/app/routes.tsx
rg -n -i "landing" frontend/src/app/routes.tsx frontend/src/app/navigation.tsx
```

Expected: the approved 1672x941 target image exists with SHA-256 `E813DE21D73C51E266F0E800CD3D1D7C8B55A8E6C9F94B389A9870E3F1E1D64A`; `/sandbox-security-showcase` is renderable; and the approved execution base provides a real renderable Landing route, which must be recorded in the execution notes as `LANDING_ROUTE`. The current planning checkout has no Landing route. If the image is missing/changed or no accepted Landing reference is renderable when execution begins, stop and ask for the approved artifact/base. Do not substitute `/overview`, create a Landing page in this requirement, copy or stage `.runtime/**`, or silently skip the comparison.

## Task 1: Extract Stage and Policy Selectors

**Files:**
- Create: `frontend/src/components/sandbox-security/StageSelector.tsx`
- Create: `frontend/src/components/sandbox-security/PolicySelector.tsx`
- Modify: `frontend/src/components/sandbox-security/EvaluationRequestForm.tsx`
- Test: `frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx`

- [ ] **Step 1: Add failing behavior tests through the existing form**

Add this controlled harness and the three tests to `evaluation-request-form.spec.tsx`. Testing through the existing form avoids treating an unresolved new-module import as RED.

```tsx
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

function ControlledEvaluationRequestForm() {
  const [state, setState] = useState({
    stage: baseProps.stage,
    policyProfileId: baseProps.policyProfileId,
    contentItems: baseProps.contentItems,
    toolRequest: baseProps.toolRequest
  });

  return (
    <EvaluationRequestForm
      {...baseProps}
      {...state}
      onChange={setState}
    />
  );
}

it("renders radio-semantic horizontal stage tabs with the selected Chinese description", () => {
  render(<ControlledEvaluationRequestForm />);
  const group = screen.getByRole("group", { name: "阶段" });
  expect(within(group).getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByText("评估用户输入内容，检测注入与越权意图")).toBeInTheDocument();

  fireEvent.click(within(group).getByRole("radio", { name: "tool_request" }));
  expect(
    screen.getByText("评估工具调用请求，检测参数劫持与作用域滥用")
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/工具名称/)).toBeInTheDocument();
});

it("renders a verified read-only policy status instead of switch semantics", () => {
  render(<ControlledEvaluationRequestForm />);
  const status = screen.getByTestId("security-policy-status");
  expect(status).toHaveTextContent("POLICY: sandbox-security-balanced.v1");
  expect(status).toHaveTextContent("规则必检 · 本地模型可选 · 高/严重风险短路");
  expect(status).not.toHaveAttribute("role", "switch");
  expect(status).not.toHaveAttribute("aria-checked");

  fireEvent.click(
    screen.getByRole("radio", { name: "sandbox-security-strict.v1 严格" })
  );
  expect(status).toHaveTextContent(
    "规则与本地模型必检 · 中/高/严重风险短路"
  );
});

it("emits only the existing request fields when policy selection changes", () => {
  const onChange = vi.fn();
  render(<EvaluationRequestForm {...baseProps} onChange={onChange} />);
  fireEvent.click(
    screen.getByRole("radio", { name: "sandbox-security-strict.v1 严格" })
  );
  expect(onChange).toHaveBeenCalledWith({
    stage: "user_input",
    policyProfileId: "sandbox-security-strict.v1",
    contentItems: baseProps.contentItems,
    toolRequest: null
  });
});
```

Merge the added imports with the file's existing Testing Library import rather than creating a duplicate import declaration.

- [ ] **Step 2: Run the tests and verify the intended RED state**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/evaluation-request-form.spec.tsx
```

Expected: FAIL because the selected-stage description and `security-policy-status` do not exist. Existing catalog assertions must still pass; an import or environment failure is not acceptable RED.

- [ ] **Step 3: Create the stage selector**

Create `StageSelector.tsx` with this complete implementation:

```tsx
import { Radio } from "antd";

import {
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityStage
} from "../../../../shared/types/sandbox-security";

const STAGE_DESCRIPTION: Record<SandboxSecurityStage, string> = {
  user_input: "评估用户输入内容，检测注入与越权意图",
  tool_request: "评估工具调用请求，检测参数劫持与作用域滥用",
  model_output: "评估模型输出内容，检测敏感数据泄露与输出操纵"
};

export interface StageSelectorProps {
  stage: SandboxSecurityStage;
  onStageChange: (stage: SandboxSecurityStage) => void;
}

export function StageSelector({ stage, onStageChange }: StageSelectorProps) {
  const descriptionId = "sandbox-security-stage-description";

  return (
    <fieldset aria-describedby={descriptionId}>
      <legend className="sandbox-security-legend">阶段</legend>
      <div className="workbench-stage-tabs">
        {SANDBOX_SECURITY_STAGES.map((option) => (
          <Radio
            key={option}
            className={
              stage === option
                ? "workbench-stage-tab workbench-stage-tab--selected"
                : "workbench-stage-tab"
            }
            name="sandbox-security-stage"
            value={option}
            checked={stage === option}
            onChange={() => onStageChange(option)}
          >
            <span data-mono="true">{option}</span>
          </Radio>
        ))}
      </div>
      <p id={descriptionId} className="workbench-stage-desc">
        {STAGE_DESCRIPTION[stage]}
      </p>
    </fieldset>
  );
}
```

- [ ] **Step 4: Create the policy selector from verified manifest semantics**

Create `PolicySelector.tsx`. The comment is part of the implementation boundary: frontend code mirrors reviewed presentation facts but never imports the engine module at runtime.

```tsx
import { Radio } from "antd";

import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  type SandboxSecurityPolicyProfileId
} from "../../../../shared/types/sandbox-security";

interface PolicyPresentation {
  differentiator: "平衡" | "严格";
  status: string;
}

// Presentation-only facts verified against
// engines/sandbox/src/security/policy-profiles.ts. Do not add budgets,
// timeout numbers, all-detector claims, or a blanket fail-closed guarantee.
const POLICY_PRESENTATION = {
  "sandbox-security-balanced.v1": {
    differentiator: "平衡",
    status: "规则必检 · 本地模型可选 · 高/严重风险短路"
  },
  "sandbox-security-strict.v1": {
    differentiator: "严格",
    status: "规则与本地模型必检 · 中/高/严重风险短路"
  }
} satisfies Record<SandboxSecurityPolicyProfileId, PolicyPresentation>;

export interface PolicySelectorProps {
  policyProfileId: SandboxSecurityPolicyProfileId;
  onPolicyProfileChange: (policyProfileId: SandboxSecurityPolicyProfileId) => void;
}

export function PolicySelector({
  policyProfileId,
  onPolicyProfileChange
}: PolicySelectorProps) {
  return (
    <fieldset>
      <legend className="sandbox-security-legend">策略配置</legend>
      <div className="workbench-policy-selector">
        {SANDBOX_SECURITY_POLICY_PROFILE_IDS.map((option) => {
          const presentation = POLICY_PRESENTATION[option];
          return (
            <Radio
              key={option}
              className={
                policyProfileId === option
                  ? "workbench-policy-card workbench-policy-card--selected"
                  : "workbench-policy-card"
              }
              name="sandbox-security-profile"
              value={option}
              checked={policyProfileId === option}
              onChange={() => onPolicyProfileChange(option)}
            >
              <span className="workbench-policy-card__id" data-mono="true">
                {option}
              </span>
              <span className="workbench-policy-card__label">
                {presentation.differentiator}
              </span>
            </Radio>
          );
        })}
      </div>
      <p
        className="workbench-policy-status"
        data-testid="security-policy-status"
      >
        <span data-mono="true">POLICY: {policyProfileId}</span>
        <span>{POLICY_PRESENTATION[policyProfileId].status}</span>
      </p>
    </fieldset>
  );
}
```

- [ ] **Step 5: Integrate both selectors without changing controlled form ownership**

In `EvaluationRequestForm.tsx`, remove the direct `Radio` import, the now-unused `SANDBOX_SECURITY_POLICY_PROFILE_IDS` and `SANDBOX_SECURITY_STAGES` imports, the `FIELDSET_STYLE` constant, and the two inline fieldsets. Import the new components and render this exact composition before the source rows:

```tsx
<StageSelector
  stage={stage}
  onStageChange={(nextStage) => {
    const nextTool =
      nextStage === "tool_request"
        ? toolRequest ?? { call_id: "", tool_name: "", arguments: {} }
        : null;
    emit({ stage: nextStage, toolRequest: nextTool });
  }}
/>

<PolicySelector
  policyProfileId={policyProfileId}
  onPolicyProfileChange={(nextPolicyProfileId) =>
    emit({ policyProfileId: nextPolicyProfileId })
  }
/>
```

Use direct local imports:

```ts
import { PolicySelector } from "./PolicySelector";
import { StageSelector } from "./StageSelector";
```

- [ ] **Step 6: Run the selector tests and the full form spec**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/evaluation-request-form.spec.tsx
```

Expected: PASS. The three shared stages and two shared profile IDs remain the only options; tool fields still appear only for `tool_request`; the status element has no switch semantics.

- [ ] **Step 7: Commit the focused selector change**

```powershell
git add -- frontend/src/components/sandbox-security/StageSelector.tsx frontend/src/components/sandbox-security/PolicySelector.tsx frontend/src/components/sandbox-security/EvaluationRequestForm.tsx frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx
git diff --cached --check
git commit -m "feat(frontend): extract workbench stage and policy selectors"
```

## Task 2: Compact the Request Composer While Preserving the Shared Request Contract

**Files:**
- Modify: `frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx`
- Modify: `frontend/src/components/sandbox-security/ContentItemRow.tsx`
- Modify: `frontend/src/components/sandbox-security/RequestLimitMeter.tsx`
- Modify: `frontend/src/components/sandbox-security/EvaluationRequestForm.tsx`
- Modify: `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- Test: `frontend/src/components/sandbox-security/capability-session-panel.spec.tsx`
- Test: `frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx`
- Test: `frontend/src/pages/sandbox-security-workbench.page.spec.tsx`
- Test: `frontend/src/pages/sandbox-security-privacy.spec.tsx`

- [ ] **Step 1: Add RED tests for the credential presentation states**

Append these tests to `capability-session-panel.spec.tsx`:

```tsx
it("shows a held badge and removes the password field after entry settles", () => {
  render(
    <CapabilitySessionPanel
      hasToken
      onTokenChange={vi.fn()}
      onClear={vi.fn()}
    />
  );
  expect(screen.getByText("TOKEN HELD · 令牌已持有")).toBeInTheDocument();
  expect(screen.queryByLabelText(/能力令牌/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /清除令牌/ })).toBeEnabled();
});

it("returns to editable rejected state without rendering the held token", () => {
  render(
    <CapabilitySessionPanel
      hasToken
      requiresNewCapability
      onTokenChange={vi.fn()}
      onClear={vi.fn()}
    />
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByLabelText(/能力令牌/)).toHaveAttribute("type", "password");
  expect(document.body).not.toHaveTextContent("tok-secret");
});

it("settles a replacement token after blur when the rejected state clears", () => {
  const props = {
    hasToken: true,
    onTokenChange: vi.fn(),
    onClear: vi.fn()
  };
  const { rerender } = render(
    <CapabilitySessionPanel {...props} requiresNewCapability />
  );
  const field = screen.getByLabelText(/能力令牌/);
  fireEvent.change(field, { target: { value: "tok-replacement" } });
  fireEvent.blur(field);
  expect(props.onTokenChange).toHaveBeenCalledWith("tok-replacement");
  rerender(<CapabilitySessionPanel {...props} requiresNewCapability={false} />);
  expect(screen.getByText("TOKEN HELD · 令牌已持有")).toBeInTheDocument();
  expect(screen.queryByLabelText(/能力令牌/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add RED regressions for compact sources, structured-value semantics, the technical meter, and CTA**

First inspect the current `ContentItemRow.tsx`, `ToolRequestFields.tsx`, and `SandboxSecuritySubmittedContentItem` definition. The current row pretty-prints an object value but unconditionally emits textarea edits as strings; the shared contract permits a real structured `SandboxSecurityJsonValue`, and `ToolRequestFields` already establishes the repository's parse-valid-JSON-or-preserve-raw-string convention. The SourceCard refactor must not silently turn a valid edited JSON object into JSON source text.

Add `useState` from React and `fireEvent` to the existing Testing Library import. Add the shared submitted-item type to the existing shared import and add this component import, then append the harness and tests to `evaluation-request-form.spec.tsx`:

```tsx
import type { SandboxSecuritySubmittedContentItem } from "../../../../shared/types/sandbox-security";
import { ContentItemRow } from "./ContentItemRow";
```

Merge the type into the file's existing shared import rather than keeping two imports from the same module.

```tsx
function CompactRequestComposerHarness() {
  const [state, setState] = useState({
    stage: "user_input" as const,
    policyProfileId: "sandbox-security-balanced.v1" as const,
    contentItems: [
      {
        source_id: "src-0",
        claimed_source_type: "user_input" as const,
        media_type: "text/plain" as const,
        value: "hello",
        provenance_ref: "source://client/0"
      }
    ],
    toolRequest: null
  });

  return (
    <EvaluationRequestForm
      {...baseProps}
      {...state}
      onChange={setState}
    />
  );
}

async function selectOnlyMediaTypeOption(
  option: "text/plain" | "application/json"
): Promise<void> {
  const combobox = screen.getByRole("combobox", { name: /媒体类型/ });
  fireEvent.mouseDown(combobox.closest(".ant-select") ?? combobox, { button: 0 });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

it("renders a compact two-row source card with inline named controls", () => {
  render(<CompactRequestComposerHarness />);
  expect(screen.getByText("src-0")).toBeInTheDocument();
  expect(screen.getByText("5 B")).toBeInTheDocument();
  expect(screen.getByLabelText("来源类型 src-0")).toBeInTheDocument();
  expect(screen.getByLabelText("媒体类型 src-0")).toBeInTheDocument();
  expect(screen.getByLabelText("内容值 src-0")).toHaveAttribute("rows", "2");
});

it("REQ-SBX-WORKBENCH-R2 renders an existing structured JSON value and its compact byte size", () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-json",
    claimed_source_type: "user_input",
    media_type: "application/json",
    value: { message: "hello" },
    provenance_ref: "source://client/json"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );

  expect(screen.getByRole("textbox", { name: /内容值/ })).toHaveValue(
    JSON.stringify(item.value, null, 2)
  );
  expect(screen.getByText("19 B")).toBeInTheDocument();
});

it("REQ-SBX-WORKBENCH-R2 preserves a valid application/json edit as a structured value", () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-json",
    claimed_source_type: "user_input",
    media_type: "application/json",
    value: { message: "hello" },
    provenance_ref: "source://client/json"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );

  fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
    target: { value: '{"message":"updated","nested":{"enabled":false}}' }
  });

  expect(onChange).toHaveBeenLastCalledWith({
    ...item,
    value: { message: "updated", nested: { enabled: false } }
  });
  expect(onChange.mock.lastCall?.[0].value).not.toBe(
    '{"message":"updated","nested":{"enabled":false}}'
  );
});

it("REQ-SBX-WORKBENCH-R2 normalizes a structured JSON value when switching to text/plain", async () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-json",
    claimed_source_type: "user_input",
    media_type: "application/json",
    value: { message: "hello" },
    provenance_ref: "source://client/json"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );

  await selectOnlyMediaTypeOption("text/plain");
  expect(onChange).toHaveBeenLastCalledWith({
    ...item,
    media_type: "text/plain",
    value: JSON.stringify(item.value, null, 2)
  });
  expect(typeof onChange.mock.lastCall?.[0].value).toBe("string");
});

it("REQ-SBX-WORKBENCH-R2 parses JSON-looking text when switching to application/json", async () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-text-json",
    claimed_source_type: "user_input",
    media_type: "text/plain",
    value: '{"message":"hello"}',
    provenance_ref: "source://client/text-json"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );

  await selectOnlyMediaTypeOption("application/json");
  expect(onChange).toHaveBeenLastCalledWith({
    ...item,
    media_type: "application/json",
    value: { message: "hello" }
  });
});

it("REQ-SBX-WORKBENCH-R2 keeps the existing parse-or-raw convention for JSON strings and drafts", () => {
  const onChange = vi.fn();
  const baseItem: SandboxSecuritySubmittedContentItem = {
    source_id: "src-json-string",
    claimed_source_type: "user_input",
    media_type: "application/json",
    value: {},
    provenance_ref: "source://client/json-string"
  };
  const { rerender } = render(
    <ContentItemRow
      index={0}
      item={baseItem}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );

  fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
    target: { value: '"hello"' }
  });
  const scalarItem = onChange.mock.lastCall?.[0] as SandboxSecuritySubmittedContentItem;
  expect(scalarItem.value).toBe("hello");
  rerender(
    <ContentItemRow
      index={0}
      item={scalarItem}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );
  expect(screen.getByRole("textbox", { name: /内容值/ })).toHaveValue("hello");
  expect(screen.getByText("7 B")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
    target: { value: "not-json" }
  });
  const rawDraftItem = onChange.mock.lastCall?.[0] as SandboxSecuritySubmittedContentItem;
  expect(rawDraftItem.value).toBe("not-json");
  rerender(
    <ContentItemRow
      index={0}
      item={rawDraftItem}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );
  expect(screen.getByRole("textbox", { name: /内容值/ })).toHaveValue("not-json");
  expect(screen.getByText("10 B")).toBeInTheDocument();
});

it("REQ-SBX-WORKBENCH-R2 does not turn JSON numeric overflow into null", () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-json-overflow",
    claimed_source_type: "user_input",
    media_type: "application/json",
    value: {},
    provenance_ref: "source://client/json-overflow"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );
  const overflowDraft = '{"nested":[1e400]}';
  fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
    target: { value: overflowDraft }
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...item, value: overflowDraft });
  expect(onChange.mock.lastCall?.[0].value).not.toEqual({ nested: [Infinity] });
});

it("REQ-SBX-WORKBENCH-R2 keeps JSON-looking text/plain edits as exact strings", () => {
  const onChange = vi.fn();
  const item: SandboxSecuritySubmittedContentItem = {
    source_id: "src-text",
    claimed_source_type: "user_input",
    media_type: "text/plain",
    value: "before",
    provenance_ref: "source://client/text"
  };
  render(
    <ContentItemRow
      index={0}
      item={item}
      canRemove={false}
      reduceMotion
      onChange={onChange}
      onRemove={vi.fn()}
    />
  );
  const nextText = '{"message":"still text"}';
  fireEvent.change(screen.getByRole("textbox", { name: /内容值/ }), {
    target: { value: nextText }
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...item, value: nextText });
});

it("keeps add and remove behavior intact in the compact source stack", () => {
  render(<CompactRequestComposerHarness />);
  fireEvent.click(screen.getByRole("button", { name: "新增来源" }));
  expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "移除来源 src-1" }));
  expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(1);
});

it("warns after ninety percent without marking an in-limit request invalid", () => {
  render(<RequestLimitMeter usedBytes={91} limitBytes={100} />);
  expect(screen.getByText("接近上限")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-invalid", "false");
});

it("uses the new CTA label and Ant Design loading state", () => {
  const { rerender } = render(<EvaluationRequestForm {...baseProps} />);
  expect(screen.getByRole("button", { name: "开始评估" })).toBeEnabled();

  rerender(<EvaluationRequestForm {...baseProps} submitting />);
  expect(screen.getByRole("button", { name: /评估中/ })).toBeDisabled();
});

it("cancels SourceCard entrance travel when reduced motion is requested", () => {
  render(<EvaluationRequestForm {...baseProps} reduceMotion />);
  expect(screen.getByRole("region", { name: "来源 src-1" })).toHaveAttribute(
    "data-enter-motion",
    "instant"
  );
});
```

Change every existing submit-button query in this form spec from `/提交评估/` to `/开始评估|评估中/`. Change every submit query in `sandbox-security-workbench.page.spec.tsx` to `/开始评估|评估中/`. In `sandbox-security-privacy.spec.tsx`, change both submit queries to `/开始评估|submit/i`; keep every URL, storage, history, title, DOM-attribute, log, and retry privacy assertion unchanged.

In the existing Workbench test `prompts for a new capability on 401 without clearing the form payload`, append these RED assertions after the alert appears:

```tsx
expect(screen.getByLabelText(/能力令牌/)).toHaveValue("");
expect(screen.getByRole("button", { name: "开始评估" })).toBeDisabled();
fireEvent.change(screen.getByLabelText(/能力令牌/), {
  target: { value: "tok-replacement" }
});
expect(screen.getByRole("button", { name: "开始评估" })).toBeEnabled();
```

- [ ] **Step 3: Verify that structure and copy are RED for the intended reasons**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx
```

Expected: FAIL on the absent held badge, uncleared rejected credential, absent compact source metadata/byte badge, structured `application/json` edit being emitted as source text, media-type changes retaining the wrong value representation, JSON string-scalar parsing, `rows="3"`, absent near-limit warning, old CTA label, and missing reduced-motion SourceCard contract. The byte-presentation test and structured-edit test are intentionally separate and use the old/new-stable textbox accessible name: the edit test must reach its `onChange` assertion and show the real semantic regression rather than being masked by the new source-id label, missing `19 B` badge, an import failure, or a render error. The numeric-overflow characterization is expected to stay GREEN on the baseline and throughout implementation; it prevents the new parse path from converting `1e400` to `Infinity` and then silently serializing it as `null`. Privacy assertions must fail only because the CTA query changed, not because content or a token leaked.

- [ ] **Step 4: Implement credential empty/held/rejected rendering without token state**

Replace the component body in `CapabilitySessionPanel.tsx` with the implementation below. The only local state is a boolean controlling whether an operator is still editing; the token remains exclusively in the page.

```tsx
import { useState } from "react";
import { Alert, Button, Input, Typography } from "antd";

const { Text } = Typography;
const TOKEN_FIELD_ID = "sandbox-security-capability-token";

export interface CapabilitySessionPanelProps {
  hasToken: boolean;
  requiresNewCapability?: boolean;
  onTokenChange: (token: string) => void;
  onClear: () => void;
}

export function CapabilitySessionPanel({
  hasToken,
  requiresNewCapability = false,
  onTokenChange,
  onClear
}: CapabilitySessionPanelProps) {
  const [editing, setEditing] = useState(!hasToken);
  const held = hasToken && !requiresNewCapability && !editing;

  return (
    <section
      className={
        held
          ? "console-panel workbench-credential-panel workbench-credential-panel--held"
          : "console-panel workbench-credential-panel"
      }
      aria-label="令牌会话"
    >
      <div className="workbench-credential-panel__heading">
        <span className="workbench-section-eyebrow">SECURITY CREDENTIAL</span>
        {held ? (
          <span className="workbench-credential-status" data-mono="true">
            TOKEN HELD · 令牌已持有
          </span>
        ) : null}
      </div>

      {held ? null : (
        <div className="workbench-credential-panel__entry">
          <label htmlFor={TOKEN_FIELD_ID}>能力令牌</label>
          <Input
            key={requiresNewCapability ? "rejected" : "entry"}
            id={TOKEN_FIELD_ID}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="粘贴能力令牌"
            onChange={(event) => onTokenChange(event.target.value)}
            onBlur={() => {
              if (hasToken) setEditing(false);
            }}
          />
          <Text type="secondary">
            令牌仅保存在内存中，刷新或关闭页面即丢失，绝不写入任何存储或日志。
          </Text>
        </div>
      )}

      {requiresNewCapability ? (
        <Alert
          role="alert"
          type="warning"
          showIcon
          title="后端已拒绝当前令牌，请粘贴一个新的能力令牌。"
        />
      ) : null}

      <Button
        onClick={() => {
          onClear();
          setEditing(true);
        }}
        disabled={!hasToken}
      >
        清除令牌
      </Button>
    </section>
  );
}
```

- [ ] **Step 5: Implement the compact SourceCard**

Replace `ContentItemRow.tsx` with:

```tsx
import { Button, Input, Select } from "antd";
import { motion } from "motion/react";

import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  type SandboxSecuritySubmittedContentItem
} from "../../../../shared/types/sandbox-security";
import { measureUtf8Bytes } from "../../utils/sandbox-security-limits";
import { CALM_SPRING, REDUCED_TRANSITION } from "./showcase/showcase-motion";

const MEDIA_TYPES = ["text/plain", "application/json"] as const;

function hasOnlyFiniteJsonNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasOnlyFiniteJsonNumbers);
  if (value !== null && typeof value === "object") {
    return Object.values(value).every(hasOnlyFiniteJsonNumbers);
  }
  return true;
}

function parseEditedValue(
  rawValue: string,
  mediaType: SandboxSecuritySubmittedContentItem["media_type"]
): SandboxSecuritySubmittedContentItem["value"] {
  if (mediaType === "text/plain") return rawValue;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return hasOnlyFiniteJsonNumbers(parsed)
      ? (parsed as SandboxSecuritySubmittedContentItem["value"])
      : rawValue;
  } catch {
    return rawValue;
  }
}

export interface ContentItemRowProps {
  index: number;
  item: SandboxSecuritySubmittedContentItem;
  canRemove: boolean;
  reduceMotion: boolean;
  onChange: (item: SandboxSecuritySubmittedContentItem) => void;
  onRemove: () => void;
}

export function ContentItemRow({
  index,
  item,
  canRemove,
  reduceMotion,
  onChange,
  onRemove
}: ContentItemRowProps) {
  const valueFieldId = `sandbox-security-content-value-${index}`;
  const displayValue =
    typeof item.value === "string" ? item.value : JSON.stringify(item.value, null, 2);
  const valueForByteMeasurement =
    item.media_type === "application/json"
      ? JSON.stringify(item.value)
      : typeof item.value === "string"
        ? item.value
        : JSON.stringify(item.value);
  const usedBytes = measureUtf8Bytes(valueForByteMeasurement);

  return (
    <motion.section
      className="workbench-source-card"
      aria-label={`来源 ${item.source_id}`}
      data-enter-motion={reduceMotion ? "instant" : "spring"}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? REDUCED_TRANSITION : CALM_SPRING}
    >
      <header className="workbench-source-card__header">
        <span className="workbench-source-card__id" data-mono="true">
          {item.source_id}
        </span>
        <Select
          aria-label={`来源类型 ${item.source_id}`}
          value={item.claimed_source_type}
          onChange={(claimed_source_type) =>
            onChange({ ...item, claimed_source_type })
          }
          options={SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES.map((type) => ({
            value: type,
            label: type
          }))}
        />
        <Select
          aria-label={`媒体类型 ${item.source_id}`}
          value={item.media_type}
          onChange={(media_type) =>
            onChange({
              ...item,
              media_type,
              value: parseEditedValue(displayValue, media_type)
            })
          }
          options={MEDIA_TYPES.map((type) => ({ value: type, label: type }))}
        />
        <span className="workbench-source-card__size" data-mono="true">
          {usedBytes} B
        </span>
        {canRemove ? (
          <Button
            type="text"
            size="small"
            aria-label={`移除来源 ${item.source_id}`}
            onClick={onRemove}
          >
            ×
          </Button>
        ) : null}
      </header>
      <Input.TextArea
        id={valueFieldId}
        className="workbench-source-card__value"
        aria-label={`内容值 ${item.source_id}`}
        rows={2}
        value={displayValue}
        onChange={(event) =>
          onChange({
            ...item,
            value: parseEditedValue(event.target.value, item.media_type)
          })
        }
      />
    </motion.section>
  );
}
```

This conversion is deliberate contract normalization, not a new editor model. `JSON.parse` can produce non-finite numbers from exponent overflow even though those are not valid `SandboxSecurityJsonValue` numbers; recursively retain the raw draft when that happens so subsequent `JSON.stringify` cannot silently turn the operator's value into `null`. For `application/json`, the badge measures the compact JSON serialization, so a JSON string scalar `"hello"` occupies 7 bytes including its JSON quotes; for `text/plain`, it measures the exact string bytes. Because the shared value union and the existing `ToolRequestFields` parse-or-raw convention carry no draft-validity metadata, the UI intentionally cannot distinguish a parsed JSON string scalar from a raw invalid draft after either has become the string branch. Preserve that established convention here; do not add local draft state, validation fields, or a DTO change in this redesign.

- [ ] **Step 6: Implement the class-driven technical meter**

Replace `RequestLimitMeter.tsx` with:

```tsx
export interface RequestLimitMeterProps {
  usedBytes: number;
  limitBytes: number;
}

export function RequestLimitMeter({ usedBytes, limitBytes }: RequestLimitMeterProps) {
  const overLimit = usedBytes > limitBytes;
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 0;
  const fillPercent = Math.min(Math.max(ratio * 100, 0), 100);
  const nearLimit = !overLimit && ratio > 0.9;

  return (
    <div
      className="workbench-byte-meter"
      data-over-limit={overLimit ? "true" : "false"}
      role="progressbar"
      aria-label="请求字节用量"
      aria-valuemin={0}
      aria-valuemax={limitBytes}
      aria-valuenow={usedBytes}
      aria-invalid={overLimit ? "true" : "false"}
    >
      <div className="workbench-byte-meter__track" aria-hidden="true">
        <div
          className="workbench-byte-meter__fill"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="workbench-byte-meter__copy" data-mono="true">
        <span>{usedBytes} / {limitBytes} B</span>
        {nearLimit ? <span className="workbench-byte-meter__warning">接近上限</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Finish the composer structure, reduced-motion plumbing, and CTA**

In `EvaluationRequestForm.tsx`, remove the `Space` import and wrapper. Add `reduceMotion?: boolean` to `EvaluationRequestFormProps`, default it to `false` in the parameter destructuring, and keep `handleAddItem`, immutable row replacement/removal, tool-request initialization, `useMemo` byte measurement, and violation copy unchanged. Replace the complete return with:

```tsx
return (
  <form
    className="console-panel workbench-request-composer"
    onSubmit={(event) => {
      event.preventDefault();
      if (!submitDisabled) onSubmit();
    }}
  >
    <StageSelector
      stage={stage}
      onStageChange={(nextStage) => {
        const nextTool =
          nextStage === "tool_request"
            ? toolRequest ?? { call_id: "", tool_name: "", arguments: {} }
            : null;
        emit({ stage: nextStage, toolRequest: nextTool });
      }}
    />

    <PolicySelector
      policyProfileId={policyProfileId}
      onPolicyProfileChange={(nextPolicyProfileId) =>
        emit({ policyProfileId: nextPolicyProfileId })
      }
    />

    <div className="workbench-source-stack">
      {contentItems.map((item, index) => (
        <ContentItemRow
          key={item.source_id}
          index={index}
          item={item}
          canRemove={contentItems.length > 1}
          reduceMotion={reduceMotion}
          onChange={(nextItem) => {
            const next = contentItems.slice();
            next[index] = nextItem;
            emit({ contentItems: next });
          }}
          onRemove={() => {
            emit({
              contentItems: contentItems.filter(
                (_unused, position) => position !== index
              )
            });
          }}
        />
      ))}
    </div>

    <Button onClick={handleAddItem} disabled={addDisabled}>
      新增来源
    </Button>

    {stage === "tool_request" && toolRequest !== null ? (
      <ToolRequestFields
        toolRequest={toolRequest}
        onChange={(nextTool) => emit({ toolRequest: nextTool })}
      />
    ) : null}

    <RequestLimitMeter
      usedBytes={usedBytes}
      limitBytes={SANDBOX_SECURITY_MAX_REQUEST_BYTES}
    />

    {violations.length > 0 ? (
      <div aria-live="polite" className="sandbox-security-violations">
        <Typography.Text type="danger">提交被阻止：</Typography.Text>
        <ul>
          {violations.map((violation) => (
            <li key={`${violation.rule}:${violation.sourceId ?? ""}`}>
              <Typography.Text type="secondary">
                {describeSandboxSecurityViolation(violation)}
              </Typography.Text>
            </li>
          ))}
        </ul>
      </div>
    ) : null}

    <Button
      className="workbench-evaluate-btn"
      type="primary"
      htmlType="submit"
      block
      loading={submitting}
      disabled={submitDisabled}
    >
      {submitting ? "评估中..." : "开始评估"}
    </Button>
  </form>
);
```

In `SandboxSecurityWorkbenchPage.tsx`, pass the existing preference without creating a second hook:

```tsx
<EvaluationRequestForm
  stage={stage}
  policyProfileId={policyProfileId}
  contentItems={contentItems}
  toolRequest={toolRequest}
  submitting={submitting}
  violations={violations}
  reduceMotion={reduceMotion ?? false}
  onChange={(next) => {
    setStage(next.stage);
    setPolicyProfileId(next.policyProfileId);
    setContentItems(next.contentItems);
    setToolRequest(next.toolRequest);
    invalidateKey();
  }}
  onSubmit={handleSubmit}
/>
```

In the existing `runEvaluation` failure branch, clear only a capability that the existing failure catalog marks unusable; retain all request fields:

```tsx
if (describeSandboxSecurityFailure(result).requiresNewCapability) {
  setCapabilityToken("");
}
setDecision(null);
setError(result);
```

After Task 3 normalizes `reduceMotion` to a boolean, remove the now-unnecessary `?? false` at this call site.

- [ ] **Step 8: Run the focused GREEN suite**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx
```

Expected: PASS. The capability tests still prove password input, no storage write, no token re-render, clear action, and rejected-token alert. The form tests still prove shared catalogs, tool fields, limits, all violation copy, content-free attributes, valid `application/json` edits remaining structured, both media-type transitions normalizing to a contract-valid representation, JSON scalar/raw fallback round-trips following the established convention, and `text/plain` edits remaining exact strings. The SourceCard byte badge measures only the value representation (exact UTF-8 for `text/plain`; compact `JSON.stringify` UTF-8 for `application/json`, including quotes around a JSON string scalar); it must not be described as request-envelope bytes.

- [ ] **Step 9: Commit the focused composer change**

```powershell
git add -- frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx frontend/src/components/sandbox-security/ContentItemRow.tsx frontend/src/components/sandbox-security/RequestLimitMeter.tsx frontend/src/components/sandbox-security/EvaluationRequestForm.tsx frontend/src/components/sandbox-security/capability-session-panel.spec.tsx frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx frontend/src/pages/SandboxSecurityWorkbenchPage.tsx frontend/src/pages/sandbox-security-workbench.page.spec.tsx frontend/src/pages/sandbox-security-privacy.spec.tsx
git diff --cached --check
git commit -m "feat(frontend): compact sandbox evaluation composer"
```

## Task 3: Add Honest Evidence and Execution Traces

**Files:**
- Create: `frontend/src/components/sandbox-security/EvidenceTrace.tsx`
- Create: `frontend/src/components/sandbox-security/ExecutionTrace.tsx`
- Modify: `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- Test: `frontend/src/pages/sandbox-security-workbench.page.spec.tsx`

- [ ] **Step 1: Add a rich decision fixture and deferred-response helper**

Add `within` to the existing Testing Library import, add the shared decision type import, and append these fixtures beside the existing `DECISION` constant:

```tsx
import type {
  SandboxDetectorRun,
  SandboxSecurityDecision
} from "../../../shared/types/sandbox-security";

const TRACE_DECISION: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "opaque-decision-value",
  request_id: "req-trace-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-strict.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [
    {
      finding_id: "finding:trace-1",
      detector_id: "rule.injection",
      detector_version: "1.0.0",
      category: "prompt_injection",
      severity: "critical",
      confidence: 0.91,
      reason_code: "sandbox_security_prompt_injection",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "srctok-trace-1",
          locator: { kind: "text_byte_range", start_byte: 4, end_byte: 18 }
        }
      ],
      evidence_refs: ["evidence:trace-1"]
    }
  ],
  detector_runs: [
    {
      detector_id: "rule.injection",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 8,
      status: "matched",
      finding_ids: ["finding:trace-1"]
    },
    {
      detector_id: "rule.optional-secondary",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "optional_not_selected",
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: "optional_not_selected"
    },
    {
      detector_id: "local.classifier",
      detector_version: "2.0.0",
      detector_kind: "local_model",
      obligation: "profile_required",
      elapsed_ms: 1200,
      status: "timeout",
      error_code: "detector_timeout"
    },
    {
      detector_id: "external.judge",
      detector_version: "3.0.0",
      detector_kind: "external_judge",
      obligation: "runtime_required",
      elapsed_ms: 480,
      status: "invalid_result",
      error_code: "detector_result_invalid"
    }
  ],
  evidence_refs: ["evidence:trace-1"],
  created_at: "2026-08-10T00:00:01.000Z"
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
```

- [ ] **Step 2: Add page-level RED tests before importing either new component**

Append these tests inside the existing Workbench describe block:

```tsx
it("REQ-SBX-WORKBENCH-R2 renders an inert five-node EvidenceTrace before submission", () => {
  render(<SandboxSecurityWorkbenchPage />);
  const trace = screen.getByTestId("evidence-trace");
  expect(trace).toHaveAttribute("aria-hidden", "true");
  expect(trace).toHaveAttribute("data-state", "idle");
  expect(trace).toHaveAttribute("data-animated", "false");
  expect(
    within(trace).getAllByTestId(/evidence-node-/).map((node) => node.dataset.node)
  ).toEqual(["source", "rule", "model", "judge", "decision"]);
});

it("REQ-SBX-WORKBENCH-R2 keeps EvidenceTrace static while the one-shot request is pending", async () => {
  const deferred = createDeferred<Response>();
  const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  const trace = screen.getByTestId("evidence-trace");
  expect(trace).toHaveAttribute("data-state", "loading");
  expect(trace).toHaveAttribute("data-animated", "false");
  expect(document.body).not.toHaveTextContent("rule.injection");
  expect(document.body).not.toHaveTextContent(/\d+%/);

  deferred.resolve(okResponse(TRACE_DECISION));
  await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());
});

it("REQ-SBX-WORKBENCH-R2 maps evidence nodes by execution status, not risk severity", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  const trace = await screen.findByTestId("evidence-trace");
  await waitFor(() => expect(trace).toHaveAttribute("data-state", "result"));
  expect(within(trace).getByTestId("evidence-node-rule")).toHaveAttribute(
    "data-outcome",
    "completed"
  );
  expect(within(trace).getByTestId("evidence-node-model")).toHaveAttribute(
    "data-outcome",
    "timeout"
  );
  expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
    "data-outcome",
    "error"
  );
  expect(within(trace).getByTestId("evidence-node-decision")).toHaveAttribute(
    "data-outcome",
    "decision-deny"
  );
  expect(within(trace).getByTestId("evidence-node-rule")).not.toHaveAttribute(
    "data-outcome",
    "critical"
  );
});

it.each([
  {
    action: "alert",
    policyProfileId: "sandbox-security-balanced.v1",
    outcome: "decision-alert"
  },
  {
    action: "ask",
    policyProfileId: "sandbox-security-strict.v1",
    outcome: "decision-ask"
  }
] as const)(
  "REQ-SBX-WORKBENCH-R2 maps the $action decision action without borrowing risk color",
  async ({ action, policyProfileId, outcome }) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse({
        ...TRACE_DECISION,
        action,
        policy_profile_id: policyProfileId,
        risk_level: "low",
        findings: TRACE_DECISION.findings.map((finding) => ({
          ...finding,
          severity: "low"
        }))
      })
    );
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const trace = await screen.findByTestId("evidence-trace");
    await waitFor(() => expect(trace).toHaveAttribute("data-state", "result"));
    expect(within(trace).getByTestId("evidence-node-decision")).toHaveAttribute(
      "data-outcome",
      outcome
    );
  }
);

it("REQ-SBX-WORKBENCH-R2 derives seven lifecycle rows without fabricated fields", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  const lifecycle = await screen.findByTestId("execution-trace");
  expect(within(lifecycle).getAllByRole("listitem")).toHaveLength(7);
  expect(lifecycle).toHaveTextContent("req-trace-1");
  expect(lifecycle).toHaveTextContent("1 sources");
  expect(lifecycle).toHaveTextContent(/\d+ B/);
  const submitted = within(lifecycle).getByTestId(
    "execution-step-request_submitted"
  );
  expect(submitted).toHaveTextContent("REQUEST_SUBMITTED");
  expect(submitted).toHaveTextContent("CLIENT_SUBMITTED");
  expect(submitted).toHaveTextContent("请求提交");
  expect(submitted).toHaveTextContent("client_submitted_at:");
  expect(submitted).not.toHaveTextContent(
    /REQUEST_RECEIVED|请求接收|server_received_at/i
  );
  expect(lifecycle).toHaveTextContent("1 timeout");
  expect(lifecycle).toHaveTextContent("sandbox-security-strict.v1");
  expect(lifecycle).toHaveTextContent("opaque-decision-value");
  expect(within(lifecycle).getByTestId("execution-step-rule_evaluation")).toHaveClass(
    "workbench-trace-step--ok"
  );
  expect(lifecycle).not.toHaveTextContent("confidence");
  expect(lifecycle).not.toHaveTextContent("chain of thought");
  expect(lifecycle).not.toHaveTextContent("test payload");
  expect(lifecycle).not.toHaveTextContent("tok-abc");
});

it.each(["matched", "no_match"] as const)(
  "REQ-SBX-WORKBENCH-R2 keeps $status plus optional skipped as completed evidence and ok execution",
  async (status) => {
    const completedRule: SandboxDetectorRun = {
      detector_id: `rule.${status}`,
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 8,
      status,
      finding_ids: status === "matched" ? ["finding:trace-1"] : []
    };
    const decision: SandboxSecurityDecision = {
      ...TRACE_DECISION,
      detector_runs: [
        completedRule,
        TRACE_DECISION.detector_runs[1],
        ...TRACE_DECISION.detector_runs.filter(
          (run) => run.detector_kind !== "rule"
        )
      ]
    };
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(decision));
    render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
    pasteTokenAndFill();
    fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

    const evidence = await screen.findByTestId("evidence-trace");
    await waitFor(() => expect(evidence).toHaveAttribute("data-state", "result"));
    expect(within(evidence).getByTestId("evidence-node-rule")).toHaveAttribute(
      "data-outcome",
      "completed"
    );

    const step = await screen.findByTestId("execution-step-rule_evaluation");
    expect(step).toHaveClass("workbench-trace-step--ok");
    expect(step).not.toHaveClass("workbench-trace-step--warn");
    expect(step).not.toHaveClass("workbench-trace-step--skipped");
    expect(step).toHaveTextContent("2 run");
    expect(step).toHaveTextContent(`1 ${status}`);
    expect(step).toHaveTextContent("1 skipped");
    expect(step).toHaveTextContent("8 ms");
    expect(step).not.toHaveTextContent(/· SKIPPED$/);
  }
);

it("REQ-SBX-WORKBENCH-R2 keeps result trace facts bound after the form is edited", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_DECISION));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  const lifecycle = await screen.findByTestId("execution-trace");
  expect(lifecycle).toHaveTextContent("1 sources");
  const frozenLifecycleText = lifecycle.textContent;
  fireEvent.click(screen.getByRole("button", { name: "新增来源" }));
  expect(screen.getAllByLabelText(/内容值 src-/)).toHaveLength(2);
  expect(lifecycle).toHaveTextContent("1 sources");
  expect(lifecycle).not.toHaveTextContent("2 sources");
  expect(lifecycle.textContent).toBe(frozenLifecycleText);
});

it("REQ-SBX-WORKBENCH-R2 marks an absent detector kind as skipped", async () => {
  const decisionWithoutJudge: SandboxSecurityDecision = {
    ...TRACE_DECISION,
    detector_runs: TRACE_DECISION.detector_runs.filter(
      (run) => run.detector_kind !== "external_judge"
    )
  };
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(decisionWithoutJudge));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  const trace = await screen.findByTestId("evidence-trace");
  await waitFor(() => expect(trace).toHaveAttribute("data-state", "result"));
  expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
    "data-outcome",
    "skipped"
  );
  expect(await screen.findByTestId("execution-step-judge_evaluation")).toHaveTextContent(
    "SKIPPED"
  );
});

it("REQ-SBX-WORKBENCH-R2 marks a detector kind with only skipped runs as skipped", async () => {
  const skippedJudgeRun: SandboxDetectorRun = {
    detector_id: "external.judge.optional",
    detector_version: "3.0.0",
    detector_kind: "external_judge",
    obligation: "optional_not_selected",
    elapsed_ms: 0,
    status: "skipped",
    skip_reason: "optional_not_selected"
  };
  const decisionWithSkippedJudge: SandboxSecurityDecision = {
    ...TRACE_DECISION,
    detector_runs: [
      ...TRACE_DECISION.detector_runs.filter(
        (run) => run.detector_kind !== "external_judge"
      ),
      skippedJudgeRun
    ]
  };
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(decisionWithSkippedJudge));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  const trace = await screen.findByTestId("evidence-trace");
  await waitFor(() => expect(trace).toHaveAttribute("data-state", "result"));
  expect(within(trace).getByTestId("evidence-node-judge")).toHaveAttribute(
    "data-outcome",
    "skipped"
  );
  const step = await screen.findByTestId("execution-step-judge_evaluation");
  expect(step).toHaveClass("workbench-trace-step--skipped");
  expect(step).not.toHaveClass("workbench-trace-step--ok");
  expect(step).toHaveTextContent("SKIPPED");
});
```

- [ ] **Step 3: Run the Workbench spec and verify RED**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/pages/sandbox-security-workbench.page.spec.tsx
```

Expected: FAIL because `evidence-trace` and `execution-trace` are absent. Existing auth, idempotency, privacy, limit, accessibility, and successful-decision tests must remain green.

- [ ] **Step 4: Create the complete EvidenceTrace derivation and rendering**

Create `EvidenceTrace.tsx`:

```tsx
import { Fragment } from "react";
import { motion } from "motion/react";

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision
} from "../../../../shared/types/sandbox-security";
import { CALM_SPRING } from "./showcase/showcase-motion";

// Private visual-tuning targets only. Tests assert relative node order and
// eventual settlement; they never import, mirror, or assert these numbers.
const NODE_REVEAL_AT = [0, 0.6, 0.9, 1.3, 1.8] as const;
const RAIL_REVEAL_AT = [0.2, 0.6, 0.9, 1.3] as const;

type DetectorKind = SandboxDetectorRun["detector_kind"];
type EvidenceNodeId = "source" | "rule" | "model" | "judge" | "decision";
type EvidenceOutcome =
  | "pending"
  | "completed"
  | "timeout"
  | "error"
  | "skipped"
  | "decision-allow"
  | "decision-deny"
  | "decision-alert"
  | "decision-ask"
  | "decision-neutral";

interface EvidenceNode {
  readonly id: EvidenceNodeId;
  readonly label: string;
  readonly outcome: EvidenceOutcome;
}

const DECISION_ACTION_OUTCOME = {
  allow: "decision-allow",
  alert: "decision-alert",
  ask: "decision-ask",
  deny: "decision-deny"
} satisfies Record<SandboxSecurityDecision["action"], EvidenceOutcome>;

export type EvidenceTraceProps =
  | {
      state: "idle" | "loading";
      reduceMotion: boolean;
    }
  | {
      state: "result" | "settled";
      decision: SandboxSecurityDecision;
      sourceCount: number;
      reduceMotion: boolean;
    };

function deriveDetectorOutcome(
  runs: readonly SandboxDetectorRun[],
  kind: DetectorKind
): EvidenceOutcome {
  const matching = runs.filter((run) => run.detector_kind === kind);
  if (matching.length === 0 || matching.every((run) => run.status === "skipped")) {
    return "skipped";
  }
  if (
    matching.some(
      (run) => run.status === "failed" || run.status === "invalid_result"
    )
  ) {
    return "error";
  }
  if (matching.some((run) => run.status === "timeout")) return "timeout";
  if (
    matching.some(
      (run) => run.status === "matched" || run.status === "no_match"
    )
  ) {
    return "completed";
  }
  return "skipped";
}

function deriveDecisionOutcome(
  decision: SandboxSecurityDecision
): EvidenceOutcome {
  if (decision.verdict === "indeterminate") return "decision-neutral";
  return DECISION_ACTION_OUTCOME[decision.action];
}

export function deriveEvidenceNodes(
  decision: SandboxSecurityDecision,
  sourceCount: number
): readonly EvidenceNode[] {
  return [
    {
      id: "source",
      label: "SOURCE",
      outcome: sourceCount > 0 ? "completed" : "skipped"
    },
    {
      id: "rule",
      label: "RULE",
      outcome: deriveDetectorOutcome(decision.detector_runs, "rule")
    },
    {
      id: "model",
      label: "MODEL",
      outcome: deriveDetectorOutcome(decision.detector_runs, "local_model")
    },
    {
      id: "judge",
      label: "JUDGE",
      outcome: deriveDetectorOutcome(decision.detector_runs, "external_judge")
    },
    {
      id: "decision",
      label: "DECISION",
      outcome: deriveDecisionOutcome(decision)
    }
  ];
}

const INERT_NODES: readonly EvidenceNode[] = [
  { id: "source", label: "SOURCE", outcome: "pending" },
  { id: "rule", label: "RULE", outcome: "pending" },
  { id: "model", label: "MODEL", outcome: "pending" },
  { id: "judge", label: "JUDGE", outcome: "pending" },
  { id: "decision", label: "DECISION", outcome: "pending" }
];

export function EvidenceTrace(props: EvidenceTraceProps) {
  const hasResult = props.state === "result" || props.state === "settled";
  const presenting = props.state === "result" && !props.reduceMotion;
  const nodes = hasResult
    ? deriveEvidenceNodes(props.decision, props.sourceCount)
    : INERT_NODES;

  return (
    <div
      className="workbench-evidence-trace"
      data-testid="evidence-trace"
      data-state={props.state}
      data-animated={presenting ? "true" : "false"}
      aria-hidden="true"
    >
      {nodes.map((node, index) => (
        <Fragment key={node.id}>
          {index > 0 ? (
            <motion.span
              className="workbench-evidence-trace__rail"
              initial={presenting ? { scaleX: 0, opacity: 0.15 } : false}
              animate={{
                scaleX: 1,
                opacity: hasResult ? 1 : 0.15
              }}
              transition={
                presenting
                  ? { ...CALM_SPRING, delay: RAIL_REVEAL_AT[index - 1] }
                  : { duration: 0 }
              }
            />
          ) : null}
          <span className="workbench-evidence-trace__item">
            <motion.span
              className="workbench-evidence-trace__node"
              data-testid={`evidence-node-${node.id}`}
              data-node={node.id}
              data-outcome={node.outcome}
              initial={presenting ? { opacity: 0.15, scale: 0.8 } : false}
              animate={{
                opacity: hasResult ? 1 : 0.15,
                scale: hasResult ? 1 : 0.8
              }}
              transition={
                presenting
                  ? { ...CALM_SPRING, delay: NODE_REVEAL_AT[index] }
                  : { duration: 0 }
              }
            />
            {node.id === "decision" && presenting ? (
              <motion.span
                className="workbench-evidence-trace__decision-glow"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 1, 0], scale: [0.7, 1.6, 1.9] }}
                transition={{ duration: 0.6, delay: 1.8, ease: "easeOut" }}
              />
            ) : null}
            <span className="workbench-evidence-trace__label">{node.label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create the complete real-data ExecutionTrace projection**

Create `ExecutionTrace.tsx`:

```tsx
import { motion } from "motion/react";

import type {
  SandboxDetectorRun,
  SandboxDetectorRunStatus,
  SandboxSecurityDecision
} from "../../../../shared/types/sandbox-security";
import { CALM_SPRING } from "./showcase/showcase-motion";

export interface EvaluationRequestFacts {
  readonly clientSubmittedAt: string;
  readonly sourceCount: number;
  readonly requestBytes: number;
}

export type ExecutionTraceOutcome = "ok" | "warn" | "error" | "skipped";

export interface ExecutionTraceStep {
  readonly id:
    | "request_submitted"
    | "sources_bound"
    | "rule_evaluation"
    | "model_evaluation"
    | "judge_evaluation"
    | "policy_reduction"
    | "judgment_complete";
  readonly label: string;
  readonly detail: string;
  readonly outcome: ExecutionTraceOutcome;
}

export interface ExecutionTraceProps {
  decision: SandboxSecurityDecision;
  requestFacts: EvaluationRequestFacts;
  active: boolean;
  reduceMotion: boolean;
}

const STATUS_ORDER: readonly SandboxDetectorRunStatus[] = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
];

function deriveDetectorStep(
  id: "rule_evaluation" | "model_evaluation" | "judge_evaluation",
  label: string,
  kind: SandboxDetectorRun["detector_kind"],
  runs: readonly SandboxDetectorRun[]
): ExecutionTraceStep {
  const matching = runs.filter((run) => run.detector_kind === kind);
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      matching.filter((run) => run.status === status).length
    ])
  ) as Record<SandboxDetectorRunStatus, number>;
  const skipped = matching.length === 0 || counts.skipped === matching.length;
  if (skipped) {
    return {
      id,
      label,
      detail: `${matching.length} run · SKIPPED`,
      outcome: "skipped"
    };
  }

  const statusSummary = STATUS_ORDER.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
    .join(" · ");
  const elapsedMs = matching.reduce((sum, run) => sum + run.elapsed_ms, 0);
  const hasError =
    counts.failed > 0 || counts.timeout > 0 || counts.invalid_result > 0;
  const hasCompletedExecution = counts.matched > 0 || counts.no_match > 0;
  const outcome: ExecutionTraceOutcome = hasError
    ? "error"
    : hasCompletedExecution
      ? "ok"
      : "skipped";

  return {
    id,
    label,
    detail: `${matching.length} run · ${statusSummary} · ${elapsedMs} ms`,
    outcome
  };
}

export function deriveExecutionTraceSteps(
  decision: SandboxSecurityDecision,
  requestFacts: EvaluationRequestFacts
): readonly ExecutionTraceStep[] {
  return [
    {
      id: "request_submitted",
      label: "请求提交",
      detail: `CLIENT_SUBMITTED · ${decision.request_id} · stage: ${decision.stage} · client_submitted_at: ${requestFacts.clientSubmittedAt}`,
      outcome: "ok"
    },
    {
      id: "sources_bound",
      label: "来源绑定",
      detail: `${requestFacts.sourceCount} sources · ${requestFacts.requestBytes} B`,
      outcome: "ok"
    },
    deriveDetectorStep(
      "rule_evaluation",
      "规则检测",
      "rule",
      decision.detector_runs
    ),
    deriveDetectorStep(
      "model_evaluation",
      "模型推理",
      "local_model",
      decision.detector_runs
    ),
    deriveDetectorStep(
      "judge_evaluation",
      "外部评审",
      "external_judge",
      decision.detector_runs
    ),
    {
      id: "policy_reduction",
      label: "策略归约",
      detail: `${decision.policy_profile_id} → ${decision.verdict} · ${decision.action} · ${decision.risk_level}`,
      outcome: decision.verdict === "indeterminate" ? "warn" : "ok"
    },
    {
      id: "judgment_complete",
      label: "判定完成",
      detail: `${decision.decision_id} · ${decision.evaluation_mode} · ${decision.created_at}`,
      outcome: "ok"
    }
  ];
}

export function ExecutionTrace({
  decision,
  requestFacts,
  active,
  reduceMotion
}: ExecutionTraceProps) {
  const steps = deriveExecutionTraceSteps(decision, requestFacts);
  const visible = active || reduceMotion;

  return (
    <motion.section
      className="workbench-execution-trace"
      data-testid="execution-trace"
      data-reveal-state={visible ? "visible" : "pending"}
      aria-label="评估执行轨迹"
      aria-hidden={visible ? undefined : true}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
      transition={reduceMotion ? { duration: 0 } : CALM_SPRING}
    >
      <p className="workbench-section-eyebrow">EXECUTION TRACE</p>
      <ol>
        {steps.map((step, index) => (
          <motion.li
            key={step.id}
            className={`workbench-trace-step workbench-trace-step--${step.outcome}`}
            data-testid={`execution-step-${step.id}`}
            initial={false}
            animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { ...CALM_SPRING, delay: visible ? index * 0.06 : 0 }
            }
          >
            <span className="workbench-trace-step__dot" aria-hidden="true" />
            <span className="workbench-trace-step__label" data-mono="true">
              {step.id.toUpperCase()}
            </span>
            <span className="workbench-trace-step__detail" title={step.detail}>
              {step.label} · {step.detail}
            </span>
          </motion.li>
        ))}
      </ol>
    </motion.section>
  );
}
```

- [ ] **Step 6: Bind a decision to frozen content-free submission facts in the page**

Import `measureEvaluationRequestBytes`, `EvidenceTrace`, `ExecutionTrace`, and `EvaluationRequestFacts`. Replace the standalone decision state with:

```tsx
interface EvaluationResult {
  readonly decision: SandboxSecurityDecision;
  readonly requestFacts: EvaluationRequestFacts;
}

const [lastRequestFacts, setLastRequestFacts] =
  useState<EvaluationRequestFacts | null>(null);
const [evaluationResult, setEvaluationResult] =
  useState<EvaluationResult | null>(null);
const decision = evaluationResult?.decision ?? null;
```

Normalize the existing hook result once:

```tsx
const reduceMotion = useReducedMotion() ?? false;
```

At the existing `EvaluationRequestForm` call site, change `reduceMotion={reduceMotion ?? false}` to `reduceMotion={reduceMotion}` so this one normalized preference drives SourceCard entry, the Inspector, and every new Workbench motion surface.

Replace `runEvaluation`, `handleSubmit`, `handleRetry`, and `invalidateKey` with:

```tsx
const runEvaluation = async (key: string, requestFacts: EvaluationRequestFacts) => {
  setSubmitting(true);
  setEvaluationResult(null);
  setError(null);
  const result: SandboxSecurityCallResult<SandboxSecurityDecision> =
    await evaluateSandboxSecurityRequest({
      capabilityToken,
      idempotencyKey: key,
      requestId: crypto.randomUUID(),
      stage,
      policyProfileId,
      contentItems,
      toolRequest: toolRequest ?? undefined,
      options: fetchImpl ? { fetchImpl } : undefined
    });
  setSubmitting(false);
  if (result.kind === "ok") {
    setEvaluationResult({ decision: result.data, requestFacts });
    return;
  }
  if (describeSandboxSecurityFailure(result).requiresNewCapability) {
    setCapabilityToken("");
  }
  setError(result);
};

const handleSubmit = () => {
  if (violations.length > 0 || submitting) return;
  const canReuse = idempotencyKey !== null && lastRequestFacts !== null;
  const key = canReuse ? idempotencyKey : crypto.randomUUID();
  const requestFacts = canReuse
    ? lastRequestFacts
    : {
        clientSubmittedAt: new Date().toISOString(),
        sourceCount: contentItems.length,
        requestBytes: measureEvaluationRequestBytes({
          stage,
          contentItems,
          toolRequest
        })
      };
  if (!canReuse) {
    setIdempotencyKey(key);
    setLastRequestFacts(requestFacts);
  }
  void runEvaluation(key, requestFacts);
};

const handleRetry = () => {
  if (idempotencyKey === null || lastRequestFacts === null || submitting) return;
  void runEvaluation(idempotencyKey, lastRequestFacts);
};

const invalidateKey = () => {
  setIdempotencyKey(null);
  setLastRequestFacts(null);
};
```

Update `isRetryable` so it also requires `lastRequestFacts !== null`.

- [ ] **Step 7: Mount both traces in the current results pane**

Immediately after the existing simulation badge, render exactly one EvidenceTrace state:

```tsx
{submitting ? (
  <EvidenceTrace state="loading" reduceMotion={reduceMotion} />
) : evaluationResult ? (
  <EvidenceTrace
    state="result"
    decision={evaluationResult.decision}
    sourceCount={evaluationResult.requestFacts.sourceCount}
    reduceMotion={reduceMotion}
  />
) : (
  <EvidenceTrace state="idle" reduceMotion={reduceMotion} />
)}
```

After the current detector detail section, render the lifecycle only for the bound result:

```tsx
{evaluationResult ? (
  <ExecutionTrace
    decision={evaluationResult.decision}
    requestFacts={evaluationResult.requestFacts}
    active
    reduceMotion={reduceMotion}
  />
) : null}
```

Do not pass `contentItems`, submitted values, capability state, or Showcase fixture data into either trace.

- [ ] **Step 8: Run GREEN tests and regression checks**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx
```

Expected: PASS. The loading trace is inert; detector outcomes use execution status; mixed completed + optional-skipped runs remain `ok`; absent/all-skipped remains `skipped`; failed/invalid/timeout is `error`; the lifecycle starts with `REQUEST_SUBMITTED`, visibly scopes it as `CLIENT_SUBMITTED`, has exactly seven real-data rows, and never claims server receipt; editing the form after a result does not alter the bound facts; auth/idempotency/privacy tests remain green.

- [ ] **Step 9: Commit the trace projection layer**

```powershell
git add -- frontend/src/components/sandbox-security/EvidenceTrace.tsx frontend/src/components/sandbox-security/ExecutionTrace.tsx frontend/src/pages/SandboxSecurityWorkbenchPage.tsx frontend/src/pages/sandbox-security-workbench.page.spec.tsx
git diff --cached --check
git commit -m "feat(frontend): add workbench evidence and execution traces"
```

## Task 4: Promote VerdictHero Through a Backward-Compatible Decision Wrapper

**Files:**
- Modify: `frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx`
- Test: `frontend/src/components/sandbox-security/decision-rendering.spec.tsx`
- Regression: `frontend/src/pages/sandbox-security-showcase.page.spec.tsx`

- [ ] **Step 1: Add RED tests for the Workbench-only variant**

Add `rerender` through the render result and append these tests to the decision-summary describe block:

```tsx
it("REQ-SBX-WORKBENCH-R2 reserves the decision position before its reveal gate", () => {
  const { rerender } = render(
    <DecisionSummaryPanel
      decision={DECISION}
      variant="workbench"
      active={false}
      reduceMotion={false}
    />
  );
  const panel = screen.getByLabelText("评估决策摘要");
  expect(panel).toHaveAttribute("data-reveal-state", "pending");
  expect(panel).toHaveAttribute("aria-hidden", "true");
  expect(panel).toHaveAttribute("inert");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText("risk_detected")).not.toBeInTheDocument();

  rerender(
    <DecisionSummaryPanel
      decision={DECISION}
      variant="workbench"
      active
      reduceMotion={false}
    />
  );
  expect(panel).toHaveAttribute("data-reveal-state", "visible");
  expect(panel).not.toHaveAttribute("aria-hidden");
  expect(panel).not.toHaveAttribute("inert");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("risk_detected")).toBeInTheDocument();
});

it("REQ-SBX-WORKBENCH-R2 exposes the decision immediately under reduced motion", () => {
  render(
    <DecisionSummaryPanel
      decision={DECISION}
      variant="workbench"
      active={false}
      reduceMotion
    />
  );
  const panel = screen.getByLabelText("评估决策摘要");
  expect(panel).toHaveAttribute(
    "data-reveal-state",
    "visible"
  );
  expect(panel).not.toHaveAttribute("aria-hidden");
  expect(panel).not.toHaveAttribute("inert");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("REQ-SBX-WORKBENCH-R2 keeps opaque identities and simulation limits below the hero", () => {
  render(
    <DecisionSummaryPanel
      decision={DECISION}
      variant="workbench"
      active
      reduceMotion
    />
  );
  expect(screen.getByText("decision:1")).toBeInTheDocument();
  expect(screen.getByText("req-1")).toBeInTheDocument();
  expect(screen.getByText(/不可用于实际拦截/)).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the decision spec and verify RED**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/decision-rendering.spec.tsx
```

Expected: FAIL because the current panel ignores `variant`, `active`, and `reduceMotion`, has no `data-reveal-state`, and exposes the verdict immediately.

- [ ] **Step 3: Replace the panel with the complete dual-variant implementation**

Replace `DecisionSummaryPanel.tsx` with:

```tsx
import { Alert, Space, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";
import { VerdictHero } from "./showcase/VerdictHero";
import { REDUCED_TRANSITION, verdictSpring } from "./showcase/showcase-motion";

const { Text } = Typography;

export interface DecisionSummaryPanelProps {
  decision: SandboxSecurityDecision;
  variant?: "summary" | "workbench";
  active?: boolean;
  reduceMotion?: boolean;
}

function DecisionCaveats({ decision }: { decision: SandboxSecurityDecision }) {
  return (
    <>
      <Text type="warning">本结果仅为模拟评估，不可用于实际拦截。</Text>
      {decision.verdict === "no_detected_risk" ? (
        <Alert
          type="info"
          showIcon
          title="未检出风险并不证明输入安全；这只是在当前证据与策略下未发现风险。"
        />
      ) : null}
    </>
  );
}

function SummaryVariant({ decision }: { decision: SandboxSecurityDecision }) {
  return (
    <section className="console-panel" aria-label="评估决策摘要">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <div role="status" aria-live="polite">
          <Space size="small" wrap>
            <SandboxSecurityValueTag domain="verdict" value={decision.verdict} />
            <SandboxSecurityValueTag domain="action" value={decision.action} />
            <SandboxSecurityValueTag domain="risk_level" value={decision.risk_level} />
          </Space>
        </div>
        <div>
          <SandboxSecurityValueTag domain="stage" value={decision.stage} />
          <SandboxSecurityValueTag domain="profile" value={decision.policy_profile_id} />
        </div>
        <div>
          <Text type="secondary">决策标识：</Text>
          <Text data-mono="true">{decision.decision_id}</Text>
        </div>
        <div>
          <Text type="secondary">请求标识：</Text>
          <Text data-mono="true">{decision.request_id}</Text>
        </div>
        <div>
          <Text type="secondary">评估模式：</Text>
          <Text>{decision.evaluation_mode}</Text>
        </div>
        <DecisionCaveats decision={decision} />
      </Space>
    </section>
  );
}

function WorkbenchVariant({
  decision,
  active,
  reduceMotion
}: {
  decision: SandboxSecurityDecision;
  active: boolean;
  reduceMotion: boolean;
}) {
  const visible = active || reduceMotion;

  return (
    <motion.section
      className="console-panel workbench-decision-hero"
      aria-label="评估决策摘要"
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      data-reveal-state={visible ? "visible" : "pending"}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.95 }}
      transition={
        reduceMotion ? REDUCED_TRANSITION : verdictSpring(decision.risk_level)
      }
    >
      {visible ? (
        <div className="workbench-decision-hero__content">
          <div className="workbench-decision-hero__context-chips">
            <SandboxSecurityValueTag domain="stage" value={decision.stage} />
            <SandboxSecurityValueTag
              domain="profile"
              value={decision.policy_profile_id}
            />
          </div>
          <VerdictHero decision={decision} active reduceMotion={reduceMotion} />
          <details className="workbench-decision-hero__meta">
            <summary data-mono="true">决策标识 · {decision.decision_id}</summary>
            <dl>
              <div>
                <dt>decision_id</dt>
                <dd data-mono="true">{decision.decision_id}</dd>
              </div>
              <div>
                <dt>request_id</dt>
                <dd data-mono="true">{decision.request_id}</dd>
              </div>
              <div>
                <dt>evaluation_mode</dt>
                <dd data-mono="true">{decision.evaluation_mode}</dd>
              </div>
            </dl>
          </details>
          <DecisionCaveats decision={decision} />
        </div>
      ) : (
        <div className="workbench-decision-hero__reserve" aria-hidden="true" />
      )}
    </motion.section>
  );
}

export function DecisionSummaryPanel({
  decision,
  variant = "summary",
  active = true,
  reduceMotion = false
}: DecisionSummaryPanelProps) {
  return variant === "workbench" ? (
    <WorkbenchVariant
      decision={decision}
      active={active}
      reduceMotion={reduceMotion}
    />
  ) : (
    <SummaryVariant decision={decision} />
  );
}
```

- [ ] **Step 4: Run decision and Showcase regressions**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/decision-rendering.spec.tsx src/pages/sandbox-security-showcase.page.spec.tsx
```

Expected: PASS. The default summary still supplies its existing polite status region and unchanged copy. The Workbench variant deliberately owns no live region—EvaluationInspector will own the one persistent Workbench announcement node in Task 5—while it reserves the visual panel's final DOM position, removes both gates when revealed, keeps opaque IDs, and settles immediately without an inert visual phase for reduced motion.

- [ ] **Step 5: Commit the backward-compatible promotion**

```powershell
git add -- frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx frontend/src/components/sandbox-security/decision-rendering.spec.tsx
git diff --cached --check
git commit -m "feat(frontend): add cinematic workbench decision hero"
```

## Task 5: Build the Exclusive EvaluationInspector and Reveal State Machine

**Files:**
- Create: `frontend/src/components/sandbox-security/EvaluationInspector.tsx`
- Modify: `frontend/src/components/sandbox-security/ExecutionTrace.tsx`
- Modify: `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- Test: `frontend/src/pages/sandbox-security-workbench.page.spec.tsx`

- [ ] **Step 1: Make reduced-motion behavior deterministic in the page spec**

Add `act` to the Testing Library import and `afterEach` to the existing Vitest import, then add this hoisted Motion preference before the page tests. The default is reduced motion so the pre-existing success/privacy semantics remain fast; only the reveal-order test opts into normal motion.

```tsx
const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => motionPreference.reduced
  };
});
```

Extend the existing lifecycle hooks to reset the preference and timers:

```tsx
beforeEach(() => {
  vi.restoreAllMocks();
  motionPreference.reduced = true;
});

afterEach(() => {
  vi.useRealTimers();
  motionPreference.reduced = true;
});
```

Add these helpers after `createDeferred`:

```tsx
async function flushAsyncWork() {
  await act(async () => {
    for (let pass = 0; pass < 12; pass += 1) {
      await Promise.resolve();
    }
  });
}

async function advanceInspectorToPhase(
  phase: "findings" | "detectors" | "decision" | "execution" | "settled"
) {
  const inspector = screen.getByLabelText("评估检查器");
  for (
    let attempt = 0;
    attempt < 500 && inspector.getAttribute("data-reveal-phase") !== phase;
    attempt += 1
  ) {
    await act(async () => vi.advanceTimersToNextTimerAsync());
  }
  expect(inspector).toHaveAttribute("data-reveal-phase", phase);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function expectPendingSurfaceIsNotKeyboardReachable(
  surface: HTMLElement
): void {
  expect(surface).toHaveAttribute("aria-hidden", "true");
  expect(surface).toHaveAttribute("inert");
  for (const node of surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    expect(node.closest("[inert]")).not.toBeNull();
  }
}
```

- [ ] **Step 2: Add RED tests for exclusive idle/loading/result/error states**

Append these tests to the Workbench describe block:

```tsx
it("REQ-SBX-WORKBENCH-R2 renders one idle inspector with an inert trace", () => {
  render(<SandboxSecurityWorkbenchPage />);
  const inspector = screen.getByLabelText("评估检查器");
  expect(inspector).toHaveAttribute("data-inspector-state", "idle");
  expect(inspector).toHaveAttribute("aria-busy", "false");
  expect(within(inspector).getByText("等待评估")).toBeInTheDocument();
  expect(within(inspector).getByTestId("evidence-trace")).toHaveAttribute(
    "data-state",
    "idle"
  );
  expect(within(inspector).getByRole("status")).toBeEmptyDOMElement();
});

it("REQ-SBX-WORKBENCH-R2 shows honest loading copy while the API promise is pending", async () => {
  const deferred = createDeferred<Response>();
  const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  const inspector = screen.getByLabelText("评估检查器");
  expect(inspector).toHaveAttribute("data-inspector-state", "loading");
  expect(inspector).toHaveAttribute("aria-busy", "true");
  expect(within(inspector).getByText("EVALUATING")).toBeInTheDocument();
  expect(within(inspector).getByText("rule")).toBeInTheDocument();
  expect(within(inspector).getByText("local_model")).toBeInTheDocument();
  expect(within(inspector).getByText("external_judge")).toBeInTheDocument();
  expect(within(inspector).queryByText("rule.injection")).not.toBeInTheDocument();
  expect(within(inspector).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(inspector).not.toHaveTextContent(/\d+%/);
  expect(within(inspector).getByRole("status")).toBeEmptyDOMElement();

  deferred.resolve(okResponse(TRACE_DECISION));
  await waitFor(() =>
    expect(inspector).toHaveAttribute("data-inspector-state", "result")
  );
});

it("REQ-SBX-WORKBENCH-R2 replaces loading with a retryable error inspector", async () => {
  const deferred = createDeferred<Response>();
  const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

  deferred.resolve(
    errorResponse(503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE")
  );
  const inspector = screen.getByLabelText("评估检查器");
  await waitFor(() =>
    expect(inspector).toHaveAttribute("data-inspector-state", "error")
  );
  expect(within(inspector).getByRole("alert")).toBeInTheDocument();
  expect(within(inspector).getByRole("button", { name: /重试/ })).toBeEnabled();
});

it("REQ-SBX-WORKBENCH-R2 removes the previous result as soon as re-submit starts", async () => {
  const secondResponse = createDeferred<Response>();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(okResponse(TRACE_DECISION))
    .mockReturnValueOnce(secondResponse.promise);
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
  await waitFor(() => expect(screen.getByText("risk_detected")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText("内容值 src-0"), {
    target: { value: "changed payload" }
  });
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
  const inspector = screen.getByLabelText("评估检查器");
  expect(inspector).toHaveAttribute("data-inspector-state", "loading");
  expect(within(inspector).queryByText("risk_detected")).not.toBeInTheDocument();

  secondResponse.resolve(okResponse(TRACE_DECISION));
  await waitFor(() =>
    expect(inspector).toHaveAttribute("data-inspector-state", "result")
  );
});
```

- [ ] **Step 3: Add RED tests for final DOM order and relative reveal order**

Add one real finding without importing authored Showcase data:

```tsx
const REVEAL_DECISION: SandboxSecurityDecision = {
  ...TRACE_DECISION,
  findings: [
    {
      finding_id: "finding:reveal-1",
      detector_id: "rule.injection",
      detector_version: "1.0.0",
      category: "prompt_injection",
      severity: "critical",
      confidence: 0.91,
      reason_code: "sandbox_security_prompt_injection",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "srctok-reveal-1",
          locator: { kind: "text_byte_range", start_byte: 4, end_byte: 18 }
        }
      ],
      evidence_refs: ["evidence:reveal-1"]
    }
  ]
};
```

Append the normal-motion and reduced-motion tests:

```tsx
it("REQ-SBX-WORKBENCH-R2 keeps final DOM order while revealing findings and detectors before decision", async () => {
  motionPreference.reduced = false;
  vi.useFakeTimers();
  const deferred = createDeferred<Response>();
  const fetchImpl = vi.fn().mockReturnValueOnce(deferred.promise);
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));
  deferred.resolve(okResponse(REVEAL_DECISION));
  await flushAsyncWork();

  const inspector = screen.getByLabelText("评估检查器");
  const liveRegion = within(inspector).getByRole("status");
  expect(liveRegion).toBeEmptyDOMElement();
  expect(inspector).toHaveAttribute("data-inspector-state", "result");
  expect(inspector).toHaveAttribute("data-reveal-phase", "evidence");
  const trace = within(inspector).getByTestId("evidence-trace");
  const decision = within(inspector).getByLabelText("评估决策摘要");
  const insight = within(inspector).getByTestId("insight-grid");
  const execution = within(inspector).getByTestId("execution-trace");
  const findings = within(insight).getByTestId("findings-presentation");
  const detectors = within(insight).getByTestId("detectors-presentation");
  const ordered = [trace, decision, insight, execution];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    expect(
      ordered[index].compareDocumentPosition(ordered[index + 1]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  }
  expect(decision).toHaveAttribute("data-reveal-state", "pending");
  expect(findings).toHaveAttribute("data-presentation-active", "false");
  expect(detectors).toHaveAttribute("data-presentation-active", "false");
  expectPendingSurfaceIsNotKeyboardReachable(decision);
  expectPendingSurfaceIsNotKeyboardReachable(findings);
  expectPendingSurfaceIsNotKeyboardReachable(detectors);
  expectPendingSurfaceIsNotKeyboardReachable(execution);

  await advanceInspectorToPhase("findings");
  expect(findings).toHaveAttribute("data-presentation-active", "true");
  expect(findings).not.toHaveAttribute("aria-hidden");
  expect(findings).not.toHaveAttribute("inert");
  const findingButton = within(findings).getByRole("button", { expanded: false });
  findingButton.focus();
  expect(findingButton).toHaveFocus();
  expectPendingSurfaceIsNotKeyboardReachable(detectors);
  expect(decision).toHaveAttribute("data-reveal-state", "pending");

  await advanceInspectorToPhase("detectors");
  expect(detectors).toHaveAttribute("data-presentation-active", "true");
  expect(detectors).not.toHaveAttribute("aria-hidden");
  expect(detectors).not.toHaveAttribute("inert");
  expect(decision).toHaveAttribute("data-reveal-state", "pending");
  expectPendingSurfaceIsNotKeyboardReachable(decision);

  await advanceInspectorToPhase("decision");
  expect(decision).toHaveAttribute("data-reveal-state", "visible");
  expect(decision).not.toHaveAttribute("aria-hidden");
  expect(decision).not.toHaveAttribute("inert");
  expect(within(inspector).getByRole("status")).toBe(liveRegion);
  expect(liveRegion).toHaveTextContent(
    "risk_detected deny critical"
  );
  expectPendingSurfaceIsNotKeyboardReachable(execution);

  await advanceInspectorToPhase("execution");
  expect(execution).toHaveAttribute("data-reveal-state", "visible");
  expect(execution).not.toHaveAttribute("aria-hidden");
  expect(execution).not.toHaveAttribute("inert");
  expect(within(inspector).getByText("prompt_injection")).toBeInTheDocument();
  await advanceInspectorToPhase("settled");
});

it("REQ-SBX-WORKBENCH-R2 cancels every reveal gate under reduced motion", async () => {
  motionPreference.reduced = true;
  const fetchImpl = vi.fn().mockResolvedValue(okResponse(REVEAL_DECISION));
  render(<SandboxSecurityWorkbenchPage fetchImpl={fetchImpl} />);
  const inspector = screen.getByLabelText("评估检查器");
  const liveRegion = within(inspector).getByRole("status");
  expect(liveRegion).toBeEmptyDOMElement();
  pasteTokenAndFill();
  fireEvent.click(screen.getByRole("button", { name: /开始评估/ }));

  await waitFor(() =>
    expect(inspector).toHaveAttribute("data-inspector-state", "result")
  );
  expect(inspector).toHaveAttribute("data-reveal-phase", "settled");
  expect(within(inspector).getByLabelText("评估决策摘要")).toHaveAttribute(
    "data-reveal-state",
    "visible"
  );
  expect(within(inspector).getByTestId("execution-trace")).toHaveAttribute(
    "data-reveal-state",
    "visible"
  );
  for (const surface of [
    within(inspector).getByLabelText("评估决策摘要"),
    within(inspector).getByTestId("findings-presentation"),
    within(inspector).getByTestId("detectors-presentation"),
    within(inspector).getByTestId("execution-trace")
  ]) {
    expect(surface).not.toHaveAttribute("aria-hidden");
    expect(surface).not.toHaveAttribute("inert");
  }
  expect(within(inspector).getByRole("status")).toBe(liveRegion);
  expect(liveRegion).toHaveTextContent("risk_detected deny critical");
  expect(within(inspector).getByText("prompt_injection")).toBeInTheDocument();
});
```

These tests assert only relative phase order and eventual visibility. Do not use `advanceTimersByTime(<visual target>)`, assert elapsed milliseconds or timer counts, import the reveal-step constant, or copy 200/800/2200/3200 ms into a test. The numeric targets are visual tuning inputs, not behavior contracts.

- [ ] **Step 4: Run the new Inspector tests and verify RED**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/pages/sandbox-security-workbench.page.spec.tsx -t "REQ-SBX-WORKBENCH-R2"
```

Expected: FAIL because there is no `评估检查器` region, persistent empty-to-decision live region, exclusive state marker, honest loading surface, InsightGrid, semantic reveal phase, or complete `aria-hidden` + `inert` interaction gate. The failure must be a missing behavior assertion, not a timer leak or unresolved import.

- [ ] **Step 5: Create the complete EvaluationInspector**

First update the existing `ExecutionTrace` root while the new pending-surface test is RED:

```tsx
aria-hidden={visible ? undefined : true}
inert={!visible}
```

This attribute, rather than opacity, removes its pending subtree from sequential focus navigation.

Create `EvaluationInspector.tsx`:

```tsx
import { useEffect, useState } from "react";
import RadarChartOutlined from "@ant-design/icons/RadarChartOutlined";
import { Alert, Button, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import type { SandboxSecurityFailureCopy } from "../../content/sandbox-security-copy";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { EvidenceTrace } from "./EvidenceTrace";
import {
  ExecutionTrace,
  type EvaluationRequestFacts
} from "./ExecutionTrace";
import { DetectorChain } from "./showcase/DetectorChain";
import { FindingsCascade } from "./showcase/FindingsCascade";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { CALM_SPRING, MOMENTUM_SPRING } from "./showcase/showcase-motion";

export type EvaluationInspectorState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "error";
      readonly failure: SandboxSecurityFailureCopy;
      readonly retryable: boolean;
    }
  | {
      readonly kind: "result";
      readonly decision: SandboxSecurityDecision;
      readonly requestFacts: EvaluationRequestFacts;
    };

export interface EvaluationInspectorProps {
  state: EvaluationInspectorState;
  reduceMotion: boolean;
  onRetry: () => void;
}

type RevealPhase =
  | "evidence"
  | "findings"
  | "detectors"
  | "decision"
  | "execution"
  | "settled";

// Private initial visual-tuning targets only. Tests assert phase order and
// eventual settlement; Visual QA may tune these without reordering phases.
const INITIAL_REVEAL_STEPS: readonly { phase: RevealPhase; delayMs: number }[] = [
  { phase: "findings", delayMs: 200 },
  { phase: "detectors", delayMs: 800 },
  { phase: "decision", delayMs: 2200 },
  { phase: "execution", delayMs: 3200 },
  { phase: "settled", delayMs: 4000 }
];

const REVEAL_ORDER: readonly RevealPhase[] = [
  "evidence",
  "findings",
  "detectors",
  "decision",
  "execution",
  "settled"
];

function hasReached(current: RevealPhase, target: RevealPhase): boolean {
  return REVEAL_ORDER.indexOf(current) >= REVEAL_ORDER.indexOf(target);
}

function RuntimeHeader({ state }: { state: EvaluationInspectorState }) {
  const decision = state.kind === "result" ? state.decision : null;
  return (
    <header className="workbench-runtime-header">
      <span className="workbench-section-eyebrow">EVALUATION RUNTIME</span>
      <div className="workbench-runtime-header__chips" aria-hidden="true">
        <span className="sandbox-simulation-badge">SIMULATION / 仿真</span>
        {decision ? (
          <>
            <span data-mono="true">{decision.stage}</span>
            <span data-mono="true">{decision.policy_profile_id}</span>
          </>
        ) : null}
      </div>
    </header>
  );
}

function IdleInspector() {
  // SpotlightSurface forwards ariaLabel to an ordinary div. The outer named
  // EvaluationInspector <section> below—not this decorative shell—owns the
  // accessible region semantics.
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-idle"
      ariaLabel="评估检查器空闲状态"
    >
      <RadarChartOutlined aria-hidden="true" />
      <Typography.Title level={4}>等待评估</Typography.Title>
      <Typography.Text type="secondary">
        配置左侧请求并提交，判定结果将在此呈现。
      </Typography.Text>
    </SpotlightSurface>
  );
}

function RunningInspector() {
  const kinds = ["rule", "local_model", "external_judge"] as const;
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-running"
      ariaLabel="评估检查器运行状态"
    >
      <span className="workbench-evaluating-badge" data-mono="true">
        EVALUATING
      </span>
      <div className="workbench-inspector-running__rows">
        {kinds.map((kind) => (
          <div key={kind} className="workbench-shimmer-row" aria-hidden="true">
            <span data-mono="true">{kind}</span>
          </div>
        ))}
      </div>
    </SpotlightSurface>
  );
}

export function EvaluationInspector({
  state,
  reduceMotion,
  onRetry
}: EvaluationInspectorProps) {
  const resultId = state.kind === "result" ? state.decision.decision_id : null;
  const [phase, setPhase] = useState<RevealPhase>(
    reduceMotion ? "settled" : "evidence"
  );

  useEffect(() => {
    if (resultId === null) {
      setPhase(reduceMotion ? "settled" : "evidence");
      return;
    }
    if (reduceMotion) {
      setPhase("settled");
      return;
    }

    setPhase("evidence");
    // The API has already returned all data. These timers sequence only a
    // finite comprehension layer; they never represent detector streaming.
    const timers = INITIAL_REVEAL_STEPS.map((step) =>
      window.setTimeout(() => setPhase(step.phase), step.delayMs)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [reduceMotion, resultId]);

  const findingsActive = reduceMotion || hasReached(phase, "findings");
  const detectorsActive = reduceMotion || hasReached(phase, "detectors");
  const decisionActive = reduceMotion || hasReached(phase, "decision");
  const executionActive = reduceMotion || hasReached(phase, "execution");

  return (
    <section
      className="workbench-evaluation-inspector"
      aria-label="评估检查器"
      aria-busy={state.kind === "loading"}
      data-inspector-state={state.kind}
      data-reveal-phase={state.kind === "result" ? phase : undefined}
    >
      <RuntimeHeader state={state} />
      <div role="status" aria-live="polite" className="showcase-sr-only">
        {state.kind === "result" && decisionActive
          ? `${state.decision.verdict} ${state.decision.action} ${state.decision.risk_level}`
          : ""}
      </div>
      {state.kind === "loading" ? (
        <EvidenceTrace state="loading" reduceMotion={reduceMotion} />
      ) : state.kind === "result" ? (
        <EvidenceTrace
          state={phase === "settled" ? "settled" : "result"}
          decision={state.decision}
          sourceCount={state.requestFacts.sourceCount}
          reduceMotion={reduceMotion}
        />
      ) : (
        <EvidenceTrace state="idle" reduceMotion={reduceMotion} />
      )}

      {state.kind === "idle" ? <IdleInspector /> : null}
      {state.kind === "loading" ? <RunningInspector /> : null}
      {state.kind === "error" ? (
        <section className="console-panel workbench-inspector-error">
          <Alert
            role="alert"
            type="error"
            showIcon
            title={state.failure.title}
            description={state.failure.remedy}
          />
          {state.retryable ? (
            <Button className="sandbox-workbench-retry" size="small" onClick={onRetry}>
              重试请求
            </Button>
          ) : null}
        </section>
      ) : null}
      {state.kind === "result" ? (
        <>
          <DecisionSummaryPanel
            decision={state.decision}
            variant="workbench"
            active={decisionActive}
            reduceMotion={reduceMotion}
          />
          <div className="workbench-insight-grid" data-testid="insight-grid">
            <motion.section
              className="console-panel workbench-insight-grid__findings"
              data-testid="findings-presentation"
              data-presentation-active={findingsActive ? "true" : "false"}
              aria-hidden={findingsActive ? undefined : true}
              inert={!findingsActive}
              initial={false}
              animate={{ opacity: findingsActive ? 1 : 0, y: findingsActive ? 0 : 8 }}
              transition={reduceMotion ? { duration: 0 } : MOMENTUM_SPRING}
            >
              <p className="workbench-section-eyebrow">FINDINGS</p>
              {state.decision.findings.length > 0 ? (
                <FindingsCascade
                  findings={state.decision.findings}
                  active={findingsActive}
                  reduceMotion={reduceMotion}
                />
              ) : (
                <Typography.Text type="secondary">未产生风险发现。</Typography.Text>
              )}
            </motion.section>
            <motion.section
              className="console-panel workbench-insight-grid__detectors"
              data-testid="detectors-presentation"
              data-presentation-active={detectorsActive ? "true" : "false"}
              aria-hidden={detectorsActive ? undefined : true}
              inert={!detectorsActive}
              initial={false}
              animate={{ opacity: detectorsActive ? 1 : 0, y: detectorsActive ? 0 : 8 }}
              transition={reduceMotion ? { duration: 0 } : CALM_SPRING}
            >
              <p className="workbench-section-eyebrow">DETECTOR CHAIN</p>
              <DetectorChain runs={state.decision.detector_runs} active={detectorsActive} />
            </motion.section>
          </div>
          <ExecutionTrace
            decision={state.decision}
            requestFacts={state.requestFacts}
            active={executionActive}
            reduceMotion={reduceMotion}
          />
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 6: Replace the page's ad hoc right pane with one Inspector state**

In `SandboxSecurityWorkbenchPage.tsx`, remove the direct imports and JSX for `Alert`, `Button`, `motion`, `DecisionSummaryPanel`, `FindingsTable`, `DetectorRunTable`, `EvidenceTrace`, and the `ExecutionTrace` value import, plus the temporary `decision` alias and local `enterAt` function. Retain `EvaluationRequestFacts` as a type-only import, then import `EvaluationInspector` and its state type.

Build the discriminated state immediately before the return:

```tsx
const inspectorState: EvaluationInspectorState = submitting
  ? { kind: "loading" }
  : evaluationResult
    ? {
        kind: "result",
        decision: evaluationResult.decision,
        requestFacts: evaluationResult.requestFacts
      }
    : failureCopy && !requiresNewCapability
      ? {
          kind: "error",
          failure: failureCopy,
          retryable: isRetryable
        }
      : { kind: "idle" };
```

Upgrade the header without changing the route or page role:

```tsx
<header className="sandbox-workbench-header">
  <div>
    <p className="workbench-section-eyebrow">沙箱安全 · 评估工作台</p>
    <Typography.Title level={3}>评估工作台</Typography.Title>
    <Typography.Paragraph type="secondary">
      提交内容以在模拟模式下评估沙箱安全策略。结果仅供分析，不用于实际拦截。
    </Typography.Paragraph>
  </div>
  <span className="sandbox-simulation-badge">SIMULATION / 仿真</span>
</header>
```

Replace the complete `sandbox-workbench-results` content with:

```tsx
<div className="sandbox-workbench-results">
  <EvaluationInspector
    state={inspectorState}
    reduceMotion={reduceMotion}
    onRetry={handleRetry}
  />
</div>
```

The left pane remains `CapabilitySessionPanel` followed by `EvaluationRequestForm`. The page remains the sole API caller and token owner.

- [ ] **Step 7: Run the Inspector GREEN suite**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/pages/sandbox-security-workbench.page.spec.tsx
```

Expected: PASS. Idle/loading/error/result are exclusive; re-submit removes the old result; final DOM order is EvidenceTrace → DecisionHero → InsightGrid → ExecutionTrace; normal motion reaches phases in the locked relative order; every pending result wrapper is `aria-hidden` and `inert` until its own gate opens; reduced motion settles without an inert frame on the first result render.

- [ ] **Step 8: Run related component and privacy regressions**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/components/sandbox-security/decision-rendering.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx src/pages/sandbox-security-showcase.page.spec.tsx
```

Expected: PASS. EvaluationInspector retains exactly one polite Workbench decision status region across idle/loading/result, keeps it empty before the Decision gate, and updates that same node at reveal—including the reduced-motion path. There is no token/content persistence, no Showcase fixture in Workbench, and no changed Showcase behavior.

- [ ] **Step 9: Commit the Inspector orchestration**

```powershell
git add -- frontend/src/components/sandbox-security/EvaluationInspector.tsx frontend/src/components/sandbox-security/ExecutionTrace.tsx frontend/src/pages/SandboxSecurityWorkbenchPage.tsx frontend/src/pages/sandbox-security-workbench.page.spec.tsx
git diff --cached --check
git commit -m "feat(frontend): orchestrate cinematic evaluation inspector"
```

## Task 6: Finish the Cinematic Console CSS and Visual Acceptance

**Files:**
- Modify: `frontend/src/styles/app.css`
- Test: `tests/repository/frontend-console-theme-literals.spec.ts`
- Read: `docs/superpowers/2026-08-07-general-005-frontend-acceptance-runbook.md`

- [ ] **Step 1: Add a RED repository gate for the complete selector inventory**

Append this test to `tests/repository/frontend-console-theme-literals.spec.ts`:

```ts
test("app.css contains the complete sandbox Workbench redesign contract", () => {
  const css = read("frontend/src/styles/app.css");
  const requiredSelectors = [
    ".workbench-request-composer",
    ".workbench-credential-panel--held",
    ".workbench-stage-tabs",
    ".workbench-policy-card--selected",
    ".workbench-policy-status",
    ".workbench-source-card",
    ".workbench-byte-meter",
    ".workbench-evaluate-btn",
    ".workbench-runtime-header",
    ".workbench-evidence-trace",
    ".workbench-inspector-idle",
    ".workbench-inspector-running",
    ".workbench-decision-hero",
    ".workbench-insight-grid",
    ".workbench-execution-trace",
    ".workbench-trace-step--error"
  ] as const;

  for (const selector of requiredSelectors) {
    assert.ok(css.includes(selector), `missing Workbench selector: ${selector}`);
  }
  assert.match(
    css,
    /grid-template-columns:\s*minmax\(300px,\s*0\.75fr\)\s+minmax\(500px,\s*1\.25fr\)/
  );
  assert.match(css, /@keyframes\s+workbench-pulse-badge/);
  assert.match(css, /@keyframes\s+workbench-shimmer/);
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.showcase-spotlight__glow\s*\{\s*display:\s*none;\s*\}/
  );

  for (const [outcome, token] of [
    ["completed", "--console-accent"],
    ["timeout", "--console-severity-medium"],
    ["error", "--console-severity-high"],
    ["decision-allow", "--console-action-allow"],
    ["decision-alert", "--console-severity-high"],
    ["decision-ask", "--console-accent"],
    ["decision-deny", "--console-action-deny"]
  ] as const) {
    const marker = `data-outcome="${outcome}"`;
    const start = css.indexOf(marker);
    const end = css.indexOf("}", start);
    assert.notEqual(start, -1, `missing EvidenceTrace outcome: ${outcome}`);
    assert.ok(
      css.slice(start, end).includes(`var(${token})`),
      `${outcome} must use ${token}`
    );
  }

  const radiusFor = (selector: string): number => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `missing radius selector: ${selector}`);
    const end = css.indexOf("}", start);
    const match = css.slice(start, end).match(/border-radius:\s*(\d+)px/);
    assert.ok(match, `missing px radius in ${selector}`);
    return Number(match[1]);
  };
  assert.equal(radiusFor(".console-panel"), 24);

  const composerOverride = css.match(
    /\.workbench-credential-panel,\s*\.workbench-request-composer\s*\{([^}]*)\}/s
  );
  assert.ok(composerOverride);
  assert.doesNotMatch(composerOverride[1], /border-radius/);
  const insightOverride = css.match(
    /\.workbench-insight-grid\s*>\s*\.console-panel\s*\{([^}]*)\}/s
  );
  assert.ok(insightOverride);
  assert.doesNotMatch(insightOverride[1], /border-radius/);

  const evidenceRadius = radiusFor(".workbench-evidence-trace");
  assert.ok(evidenceRadius >= 8 && evidenceRadius <= 12);
  const executionRadius = radiusFor(".workbench-execution-trace");
  assert.ok(executionRadius >= 20 && executionRadius <= 24);
});
```

Expand the existing `no frontend source file outside the theme module hardcodes a colour` path array to this exact closed list:

```ts
for (const path of [
  "frontend/src/app/AppProviders.tsx",
  "frontend/src/components/supervision/SupervisionSessionList.tsx",
  "frontend/src/components/task-detail/StaticAnalysisResultSection.tsx",
  "frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx",
  "frontend/src/components/sandbox-security/ContentItemRow.tsx",
  "frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx",
  "frontend/src/components/sandbox-security/EvaluationInspector.tsx",
  "frontend/src/components/sandbox-security/EvaluationRequestForm.tsx",
  "frontend/src/components/sandbox-security/EvidenceTrace.tsx",
  "frontend/src/components/sandbox-security/ExecutionTrace.tsx",
  "frontend/src/components/sandbox-security/PolicySelector.tsx",
  "frontend/src/components/sandbox-security/RequestLimitMeter.tsx",
  "frontend/src/components/sandbox-security/StageSelector.tsx",
  "frontend/src/pages/SandboxSecurityWorkbenchPage.tsx"
]) {
  const source = read(path);
  const hits = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  if (hits.length > 0) offenders.push(`${path}: ${hits.join(", ")}`);
}
```

This preserves the existing root-token and dark-scheme tests while making every redesigned TSX surface part of the permanent color-literal gate.

- [ ] **Step 2: Prove the CSS contract is RED**

Run:

```powershell
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: FAIL because the new `.workbench-*` selectors, two loading keyframes, `300px/500px` grid ratio, and range-based radius contract do not yet exist. The existing color-literal assertions and existing reduced-motion shutdown for `.showcase-spotlight__glow` must continue to pass; the latter also covers Workbench's reused SpotlightSurface without pretending that its plain `div` is a region.

- [ ] **Step 3: Change the one authorized grid declaration and append the token-only extension**

In the existing `.sandbox-workbench-grid` rule in `frontend/src/styles/app.css`, change only its column declaration to:

```css
grid-template-columns: minmax(300px, 0.75fr) minmax(500px, 1.25fr);
```

Then append the following R2 extension immediately after the existing Workbench `prefers-reduced-transparency` rule and before `.overview-hero`. Keep the existing sticky result behavior, responsive collapse, failure/retry styling, simulation badge, table overflow rules, and the existing global reduced-motion/reduced-transparency rules that hide `.showcase-spotlight__glow`; those existing rules apply to the reused Workbench SpotlightSurface as well. Do not add a color literal outside `:root`. The credential, composer, DecisionHero, and InsightGrid panels inherit the existing 24 px `.console-panel` radius; EvidenceTrace starts at 12 px as an inner technical surface; the standalone ExecutionTrace starts at 20 px as a major result surface. Visual QA may tune only inside the Spec's 8-12 px inner and 20-24 px major ranges.

```css
/* REQ-SBX-GENERAL-005 / R2: cinematic runtime Workbench. */

.sandbox-workbench-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  max-width: none;
}

.sandbox-workbench-header > div {
  display: grid;
  gap: 4px;
  max-width: 68ch;
}

.sandbox-workbench-header .ant-typography {
  margin-block: 0;
}

.sandbox-security-workbench-page [data-mono="true"] {
  font-family: var(--console-mono);
  font-variant-numeric: tabular-nums;
}

.sandbox-security-workbench-page .sandbox-simulation-badge {
  font-family: var(--console-mono);
}

.workbench-section-eyebrow {
  margin: 0;
  color: var(--console-accent);
  font-family: var(--console-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  line-height: 1.4;
  text-transform: uppercase;
}

.workbench-evaluation-inspector,
.workbench-request-composer {
  display: grid;
  gap: 20px;
}

.workbench-credential-panel,
.workbench-request-composer {
  padding: 18px;
}

.workbench-credential-panel {
  gap: 14px;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.workbench-credential-panel--held {
  border-color: var(--console-accent-strong);
  background: var(--console-accent-soft);
}

.workbench-credential-panel__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.workbench-credential-panel__entry {
  display: grid;
  gap: 8px;
}

.workbench-credential-status {
  color: var(--console-action-allow);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.workbench-stage-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.workbench-stage-tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--console-border);
  border-bottom-color: var(--console-border-strong);
  border-radius: 10px;
  background: var(--console-surface-raised);
  color: var(--console-muted);
}

.workbench-stage-tab:hover,
.workbench-stage-tab--selected {
  color: var(--console-accent);
}

.workbench-stage-tab--selected {
  border-bottom-color: var(--console-accent);
  box-shadow: inset 0 -2px 0 var(--console-accent);
}

.workbench-stage-tab > .ant-radio,
.workbench-policy-card > .ant-radio {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.workbench-stage-tab > span:last-child {
  min-width: 0;
  padding: 0;
  overflow-wrap: anywhere;
}

.workbench-stage-tab:has(.ant-radio-input:focus-visible),
.workbench-policy-card:has(.ant-radio-input:focus-visible) {
  outline: 2px solid var(--console-accent);
  outline-offset: 2px;
}

.workbench-stage-desc {
  min-height: 1.5em;
  color: var(--console-muted);
  font-size: 0.82rem;
}

.workbench-policy-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.workbench-policy-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 13px 14px;
  border: 1px solid var(--console-border);
  border-radius: 12px;
  background: var(--console-surface-raised);
  cursor: pointer;
}

.workbench-policy-card:hover,
.workbench-policy-card--selected {
  border-color: var(--console-accent-strong);
  background: var(--console-accent-soft);
}

.workbench-policy-card > span:last-child {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 0;
}

.workbench-policy-card__label {
  color: var(--console-ink);
  font-weight: 600;
}

.workbench-policy-card__id {
  min-width: 0;
  color: var(--console-muted-dim);
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}

.workbench-policy-status {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  grid-column: 1 / -1;
  margin: 10px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--console-accent);
  background: var(--console-accent-soft);
  color: var(--console-muted);
  font-family: var(--console-mono);
  font-size: 0.78rem;
}

.workbench-source-stack {
  display: grid;
  gap: 10px;
}

.workbench-source-card {
  display: grid;
  gap: 8px;
  padding: 11px;
  border: 1px solid var(--console-border);
  border-radius: 12px;
  background: var(--console-showcase-chip);
}

.workbench-source-card:focus-within {
  border-color: var(--console-border-interactive);
}

.workbench-source-card__header {
  display: grid;
  grid-template-columns: minmax(58px, auto) minmax(0, 0.8fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}

.workbench-source-card__header .ant-select {
  width: 100%;
  min-width: 0;
}

.workbench-source-card__id {
  color: var(--console-accent);
  font-size: 0.75rem;
}

.workbench-source-card__size {
  color: var(--console-muted-dim);
  font-size: 0.72rem;
  white-space: nowrap;
}

.workbench-source-card__value {
  font-family: var(--console-mono);
  resize: vertical;
}

.workbench-request-composer .sandbox-security-violations ul {
  margin: 4px 0 0;
  padding-inline-start: 20px;
}

.workbench-byte-meter {
  display: grid;
  gap: 7px;
}

.workbench-byte-meter__track {
  height: 4px;
  border-radius: 999px;
  background: var(--console-border);
  overflow: hidden;
}

.workbench-byte-meter__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--console-accent);
  transition: width 180ms ease;
}

.workbench-byte-meter[data-over-limit="true"] .workbench-byte-meter__fill {
  background: var(--console-severity-critical);
}

.workbench-byte-meter__copy {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--console-muted-dim);
  font-size: 0.72rem;
}

.workbench-byte-meter__warning {
  color: var(--console-severity-medium);
}

.workbench-evaluate-btn.ant-btn {
  min-height: 46px;
  border-radius: 12px;
  box-shadow: 0 12px 30px var(--console-hero-tint-strong);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.workbench-runtime-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.workbench-runtime-header__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.workbench-runtime-header__chips > span:not(.sandbox-simulation-badge) {
  max-width: 220px;
  padding: 5px 9px;
  border: 1px solid var(--console-border);
  border-radius: 999px;
  color: var(--console-muted-dim);
  font-size: 0.68rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-evidence-trace {
  display: grid;
  grid-template-columns: auto minmax(20px, 1fr) auto minmax(20px, 1fr) auto minmax(20px, 1fr) auto minmax(20px, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--console-border);
  border-radius: 12px;
  background: var(--console-surface);
  overflow: hidden;
}

.workbench-evidence-trace__item {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 5px;
}

.workbench-evidence-trace__rail {
  width: 100%;
  height: 2px;
  background: var(--console-accent-strong);
  transform-origin: left center;
}

.workbench-evidence-trace__node {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  border: 2px solid var(--console-border-interactive);
  border-radius: 999px;
  background: var(--console-surface-raised);
}

.workbench-evidence-trace__node[data-outcome="completed"] {
  border-color: var(--console-accent);
  background: var(--console-accent);
}

.workbench-evidence-trace__node[data-outcome="timeout"] {
  border-color: var(--console-severity-medium);
  background: var(--console-severity-medium);
}

.workbench-evidence-trace__node[data-outcome="error"],
.workbench-evidence-trace__node[data-outcome="decision-alert"] {
  border-color: var(--console-severity-high);
  background: var(--console-severity-high);
}

.workbench-evidence-trace__node[data-outcome="decision-allow"] {
  border-color: var(--console-action-allow);
  background: var(--console-action-allow);
}

.workbench-evidence-trace__node[data-outcome="decision-deny"] {
  border-color: var(--console-action-deny);
  background: var(--console-action-deny);
}

.workbench-evidence-trace__node[data-outcome="decision-ask"] {
  border-color: var(--console-accent);
  background: var(--console-accent);
}

.workbench-evidence-trace__node[data-outcome="skipped"],
.workbench-evidence-trace__node[data-outcome="pending"],
.workbench-evidence-trace__node[data-outcome="decision-neutral"] {
  border-color: var(--console-muted);
  background: var(--console-surface-raised);
}

.workbench-evidence-trace__decision-glow {
  position: absolute;
  top: 0;
  width: 28px;
  height: 28px;
  margin-top: -8px;
  border: 1px solid var(--console-accent);
  border-radius: 999px;
  pointer-events: none;
}

.workbench-evidence-trace__label {
  color: var(--console-muted);
  font-family: var(--console-mono);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
}

.workbench-evidence-trace[data-state="idle"] .workbench-evidence-trace__label,
.workbench-evidence-trace[data-state="loading"] .workbench-evidence-trace__label {
  opacity: 0.15;
}

.workbench-inspector-idle,
.workbench-inspector-running,
.workbench-inspector-error {
  min-height: 230px;
}

.workbench-inspector-idle .showcase-spotlight__content {
  place-items: center;
  align-content: center;
  min-height: 172px;
  text-align: center;
}

.workbench-inspector-idle .anticon {
  color: var(--console-accent);
  font-size: 2.4rem;
}

.workbench-inspector-idle .ant-typography {
  margin: 0;
}

.workbench-inspector-running .showcase-spotlight__content {
  align-content: center;
  min-height: 172px;
}

.workbench-inspector-error {
  display: grid;
  align-content: start;
  gap: 14px;
}

.workbench-evaluating-badge {
  justify-self: start;
  padding: 7px 12px;
  border: 1px solid var(--console-accent-strong);
  border-radius: 999px;
  background: var(--console-accent-soft);
  color: var(--console-accent);
  animation: workbench-pulse-badge 1.4s ease infinite;
}

.workbench-inspector-running__rows {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.workbench-shimmer-row {
  position: relative;
  min-height: 42px;
  padding: 12px 14px;
  border: 1px solid var(--console-border);
  border-radius: 10px;
  background: var(--console-surface-raised);
  color: var(--console-muted-dim);
  overflow: hidden;
}

.workbench-shimmer-row::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--console-veil), transparent);
  animation: workbench-shimmer 1.5s linear infinite;
}

.workbench-decision-hero {
  position: relative;
  min-height: 250px;
  overflow: hidden;
}

.workbench-decision-hero__reserve {
  min-height: 190px;
  display: grid;
  align-content: center;
}

.workbench-decision-hero__content {
  display: grid;
  gap: 14px;
}

.workbench-decision-hero .showcase-verdict__tags {
  font-size: 1.15rem;
}

.workbench-decision-hero .showcase-verdict__tags .ant-tag {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  font-size: 1.15rem;
}

.workbench-decision-hero__context-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workbench-decision-hero__context-chips > span {
  padding: 5px 9px;
  border: 1px solid var(--console-border);
  border-radius: 999px;
  color: var(--console-muted);
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}

.workbench-decision-hero__meta {
  display: grid;
  gap: 10px;
  margin-top: 2px;
}

.workbench-decision-hero__meta > summary {
  color: var(--console-muted);
  cursor: pointer;
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.workbench-decision-hero__meta dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.workbench-decision-hero__meta dl > div {
  display: grid;
  grid-template-columns: minmax(110px, 0.35fr) minmax(0, 1fr);
  gap: 10px;
}

.workbench-decision-hero__meta dt,
.workbench-decision-hero__meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.workbench-insight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
}

.workbench-insight-grid > .console-panel {
  min-width: 0;
  padding: 18px;
}

.workbench-insight-grid__findings,
.workbench-insight-grid__detectors {
  display: grid;
  gap: 14px;
}

.workbench-execution-trace {
  display: grid;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--console-border-strong);
  border-radius: 20px;
  background: var(--console-surface);
}

.workbench-execution-trace ol {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workbench-trace-step {
  display: grid;
  grid-template-columns: 12px minmax(120px, 0.42fr) minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 9px 0;
  border-bottom: 1px solid var(--console-border);
}

.workbench-trace-step:last-child {
  border-bottom: 0;
}

.workbench-trace-step__dot {
  width: 9px;
  height: 9px;
  margin-top: 4px;
  border: 2px solid var(--console-accent);
  border-radius: 999px;
  background: var(--console-surface-raised);
}

.workbench-trace-step--warn .workbench-trace-step__dot {
  border-color: var(--console-severity-medium);
}

.workbench-trace-step--error .workbench-trace-step__dot {
  border-color: var(--console-action-deny);
}

.workbench-trace-step--skipped .workbench-trace-step__dot {
  border-color: var(--console-muted);
}

.workbench-trace-step__label {
  color: var(--console-accent);
  font-size: 0.68rem;
  overflow-wrap: anywhere;
}

.workbench-trace-step__detail {
  min-width: 0;
  color: var(--console-muted);
  font-family: var(--console-mono);
  font-size: 0.76rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes workbench-pulse-badge {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@keyframes workbench-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(200%);
  }
}

@media (max-width: 1100px) {
  .workbench-insight-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .sandbox-workbench-header,
  .workbench-runtime-header {
    align-items: stretch;
    flex-direction: column;
  }

  .workbench-runtime-header__chips {
    justify-content: flex-start;
  }

  .workbench-stage-tabs,
  .workbench-policy-selector {
    grid-template-columns: 1fr;
  }

  .workbench-source-card__header,
  .workbench-trace-step {
    grid-template-columns: 1fr;
  }

  .workbench-evidence-trace {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .workbench-evidence-trace__item {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .workbench-evidence-trace__rail {
    width: 2px;
    height: 14px;
    margin-left: 5px;
    transform-origin: top center;
  }

  .workbench-trace-step__detail {
    white-space: normal;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workbench-credential-panel,
  .workbench-byte-meter__fill {
    transition: none;
  }

  .workbench-evaluating-badge,
  .workbench-shimmer-row::after {
    animation: none;
  }

  .workbench-shimmer-row::after,
  .workbench-evidence-trace__decision-glow {
    display: none;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .workbench-evidence-trace,
  .workbench-execution-trace {
    background: var(--console-surface-raised);
    backdrop-filter: none;
  }
}
```

- [ ] **Step 4: Run the CSS and color-literal GREEN gate**

Run:

```powershell
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: PASS. Every required selector and both keyframes exist; all colors outside `:root` are token references; no changed Workbench TSX file contains a color literal; inherited major panels remain 24 px, EvidenceTrace stays within 8-12 px, and ExecutionTrace stays within 20-24 px without an 18 px major-surface lock.

- [ ] **Step 5: Run the focused UI regression before opening the browser**

Run:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/components/sandbox-security/decision-rendering.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx src/pages/sandbox-security-showcase.page.spec.tsx
npm.cmd run build --prefix frontend
```

Expected: PASS and a successful production build. If CSS changes require a DOM/class change, first add or amend the failing component assertion, prove RED for that behavior, then make the smallest TSX change.

- [ ] **Step 6: Perform three rounds of reference-led real-route Visual QA**

Read and follow `docs/superpowers/2026-08-07-general-005-frontend-acceptance-runbook.md`; use its out-of-band capability and backend procedure without copying a credential into this plan, a screenshot name, a URL, the terminal, or Git history. Start the frontend in a separate terminal:

```powershell
npm.cmd run dev --prefix frontend -- --host 127.0.0.1 --port 5173
```

The primary Workbench reference is the read-only `.runtime/landing-audit/target.png` verified in Task 0. It is not a pixel-perfect implementation contract. Use it to converge on the approved two-column composition, compact Request Composer density, Evaluation Runtime visual weight, EvidenceTrace position and precision, DecisionHero dominance, Findings/Detector Execution two-column organization, ExecutionTrace technical-console character, dark surface hierarchy, restrained cyan/semantic color, typography, spacing, border/radius rhythm, restrained glow, and premium cinematic atmosphere.

Never copy the reference's data or unauthorized controls. In particular, do not render its capability token, FAIL-CLOSED toggle, fixed finding/confidence values, invented detector names/status/timings, `REQUEST_RECEIVED`, server receipt timestamp, download action, or any field not present in the real request/decision contract. Every Workbench capture must use a real one-shot response; loading may be held only with browser network throttling. The unbreakable priority is:

```text
approved Spec + real business semantics, privacy, accessibility, and usability
> Landing / Showcase brand consistency
> visual convergence toward the target image
> pixel-perfect reproduction
```

Use one browser session, dark color scheme, 100% zoom, and DPR 1. For direct target comparison, capture the result Workbench at exactly 1672x941 CSS pixels to match the reference canvas. Open the real `/sandbox-security-showcase` route and the `LANDING_ROUTE` recorded in Task 0 at the same 1672x941 viewport; do not compare only the Workbench. Keep every screenshot and delta note under `.runtime/workbench-redesign-qa/round-N/`; never stage `.runtime/**`.

Every round must complete this closed loop:

1. Render the current real Workbench and capture `workbench-result-1672x941-before.png`.
2. Place that capture beside `.runtime/landing-audit/target.png` at equal displayed size.
3. Write the largest three to five visual differences in the round notes, ordered by impact on the approved hierarchy and the visual axes above.
4. Re-invoke `ui-ux-pro-max`, plus `frontend-design` and `emil-design-eng` when installed, against the current capture, target, and same-viewport brand captures. `emil-design-eng` review findings must use its required Before/After/Why table. Reject any recommendation that changes the Spec, real data, routes, dependencies, or scope.
5. Fix those highest-impact differences first. Default to `app.css`; if a difference exposes a semantic/DOM/accessibility defect, write the smallest failing test, observe RED, then make the minimum TSX change.
6. Re-run Step 4 and Step 5, then capture `workbench-result-1672x941-after.png`. Do not count a round complete without the post-fix screenshot.

Perform all three rounds; never stop after a single pass:

- **Round 1 — structural baseline:** before the skill review, capture the target-sized Workbench plus `showcase-settled-1672x941-before.png` and `landing-1672x941-before.png` from the real routes, then also capture `1920x1080-idle.png`, `1920x1080-loading.png`, `1920x1080-result.png`, `1440x900-result.png`, and the first-frame reduced-motion result. Check the overall columns, composer density, right-pane dominance, reserved DecisionHero position, trace legibility, overflow, default CTA visibility, and honest loading. Identify and close the largest three to five structural gaps. After the corrections, recapture the same-viewport Showcase and Landing as `showcase-settled-1672x941-after.png` and `landing-1672x941-after.png` alongside the required Workbench after image; Round 1 is incomplete without all three post-fix brand captures.
- **Round 2 — brand and target convergence:** repeat the target side-by-side loop. At the same 1672x941 viewport capture `workbench-result.png`, `showcase-settled.png`, and `landing.png` from the real routes. Compare canvas/surface hierarchy, major 20-24 px and inner 8-12 px radius language, cyan usage, semantic colors, mono labels, typography, density, spacing, hero dominance, shadow/glow restraint, and cinematic tone. Apply the three to five highest-impact in-scope corrections and recapture all three routes.
- **Round 3 — final convergence and regression:** repeat the target comparison and the same-viewport Workbench/Showcase/Landing trio after Round 2 changes. Re-capture the canonical idle/loading/result/responsive states, reduced motion, and reduced transparency. Pause at every reveal phase and press Tab: focus must not enter pending Decision, Findings, Detectors, or ExecutionTrace wrappers; each becomes reachable only after its own gate opens. Confirm the sole decision `role="status"` announces only when the decision gate opens, critical text meets 4.5:1 contrast, and the extended `tool_request` form may scroll rather than losing required fields.

If Round 3 finds an in-scope defect, fix it, re-run Step 4 and Step 5, and repeat Round 3's screenshots until the major three-to-five difference list has clearly converged and no high-impact delta remains. Numeric reveal timings may be tuned modestly here, but the locked `Evidence -> Findings -> Detectors -> Decision -> ExecutionTrace` order and reduced-motion first-frame settlement may not change. A screenshot that looks closer while using fabricated data, inaccessible hidden content, or out-of-range geometry is a failed round.

- [ ] **Step 7: Commit the permanent presentation gate and CSS**

```powershell
git add -- frontend/src/styles/app.css tests/repository/frontend-console-theme-literals.spec.ts
git diff --cached --check
git commit -m "style(frontend): finish cinematic workbench presentation"
```

## Task 7: Verify, Document, Review, and Stop

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`
- Check unchanged: `docs/api-contract.md`
- Check unchanged: `docs/sprint-current.md`
- Review: every path listed in the File Map

- [ ] **Step 1: Run the complete frontend and repository validation set**

From the repository root with Node.js 22.19.0 active, run each command separately so the failing layer is unambiguous:

```powershell
npm.cmd run test:frontend
node .\frontend\node_modules\typescript\bin\tsc --noEmit -p frontend\tsconfig.json
npm.cmd run build --prefix frontend
npm.cmd run test:repo
git diff --check
```

Expected: every command exits 0. The typecheck may print the repository's existing `baseUrl` deprecation warning, but it must report no TypeScript error. `git diff --check` must print nothing.

Then run the full repository gate in a Linux/CI shell that supports the existing `env -u ... unshare --net` benchmark command:

```bash
npm test
```

Expected: PASS through repository, shared, sandbox engine, production engine, benchmark validation/replay, backend, frontend, and Electron suites. Do not rewrite the hermetic benchmark command for PowerShell and do not report the full gate as passing if only the Windows-compatible subset ran. If the compatible runner is unavailable or the existing global P6 dependency prevents completion, record that pre-existing external gate precisely and keep GENERAL-005 at `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`; the Workbench-focused and repository gates above must still be green.

- [ ] **Step 2: Update README with the operator-visible behavior and unchanged trust boundary**

Append these paragraphs to `### GENERAL-005 sandbox security evaluation workbench` in `README.md`, immediately before `# Track 1 OpenClaw Evidence Workflow`:

```markdown
The Workbench now presents the same one-shot response as a finite runtime
sequence: a static causal evidence rail, a fixed-position decision hero,
findings and detector context, and a content-free execution trace. This is a
post-response comprehension layer, not detector streaming or enforcement
progress. Reloading or submitting a new request removes the prior result.

Reduced-motion clients receive the complete settled result on the first result
frame. Runtime labels use only returned decision fields plus a client-side,
content-free submission snapshot (`client_submitted_at`, source count, and
request byte count); `REQUEST_SUBMITTED` is visibly scoped as `CLIENT_SUBMITTED`
and never implies a server receipt event,
and raw content and capability values never enter the result projection.
```

- [ ] **Step 3: Record the page/Inspector ownership boundary in architecture**

Append these bullets to `#### 2.1.1 REQ-SBX-GENERAL-005 沙箱安全评估工作台` in `docs/architecture.md`:

```markdown
- R2 保持页面为请求状态、能力令牌、幂等键和 API 调用的唯一所有者；页面只冻结
  `client_submitted_at`、来源数量和请求字节数三个 content-free 提交事实，并将它们与
  同一次响应的 decision 绑定。表单后续编辑不能改变已返回结果的执行轨迹。
- `EvaluationInspector` 只接收 `idle | loading | error | result` 判别联合并独占右栏渲染。
  `loading` 不投射检测器结果；响应返回后才运行有限的一次性呈现序列，reduced motion
  在首个结果帧直接进入 `settled`。
- 结果 wrapper 始终按 EvidenceTrace → DecisionHero → Findings/Detector context →
  ExecutionTrace 的 DOM 顺序挂载；未 reveal 的 wrapper 同时设置 `aria-hidden` 与
  `inert`，交互后代可延迟挂载，gate 打开后才进入键盘顺序，但不会移动 wrapper。
  RULE、MODEL、JUDGE 使用 detector execution status，只有 DECISION 使用判定语义色。
```

- [ ] **Step 4: Prepare the durable progress entry without writing success claims yet**

Keep the following exact entry as a draft in the execution notes. Do not edit `docs/progress.md` yet: its pass/review statements become true only after the closing review, any resulting Visual QA repeat, and Step 7's fresh verification evidence.

```markdown
# 2026-08-10 - Sandbox Workbench R2 cinematic runtime redesign

- phase/task: GENERAL-005 UI refinement / approved R2 Workbench redesign
- requirement state: GENERAL-005 remains `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`;
  this refinement does not auto-verify any predecessor or alter the global P6
  dependency
- scope: compact request composer, authority-backed stage/policy presentation,
  exclusive Inspector states, honest one-shot causal and lifecycle traces,
  fixed-position decision climax, finite reveal choreography, and complete
  reduced-motion behavior
- trust boundary: no backend route, shared DTO, Engine behavior, service call,
  persistence channel, routing, navigation, dependency, or Showcase fixture
  changed; the result projection uses only the returned decision and a frozen
  content-free submission snapshot
- validation: focused Workbench/component/privacy/Showcase suites, complete
  frontend suite, frontend typecheck, production build, repository gate,
  color-literal/selector gate, and `git diff --check` pass
- visual acceptance: three reference-led rounds converge against the approved
  Workbench target and same-viewport Landing/Showcase captures; real-route idle,
  loading, result, 1440x900 responsive, keyboard, live-region, reduced-motion,
  and reduced-transparency checks pass; disposable captures remain ignored
  under `.runtime/workbench-redesign-qa/`
- review: implementation reviewed for correctness, API honesty, privacy,
  accessibility, motion safety, type consistency, and regression scope; all
  actionable findings are closed
- next: stop after this single redesign requirement and await explicit user
  direction; do not start another GENERAL requirement
```

If the Linux-only full gate cannot run for a pre-existing environment or P6 reason, do not add a false `npm test` success claim; revise only the draft validation wording to name the successful gates and the precise unchanged external blocker before writing it in Step 8.

- [ ] **Step 5: Confirm contract and sprint documents remain unchanged**

Run:

```powershell
git diff -- docs/api-contract.md docs/sprint-current.md
```

Expected: no output attributable to this implementation. The redesign changes neither the two GENERAL-003 route contracts nor the currently selected sprint requirement. If either file already had user-owned changes at execution start, verify the Workbench commits did not add to them rather than reverting them.

- [ ] **Step 6: Run the required closing code review**

Invoke `$code-reviewer` over both the exact Workbench redesign diff from the execution-start commit to `HEAD` and the current working-tree documentation diff for `README.md` and `docs/architecture.md`. The review must not omit those durable-doc drafts merely because they are intentionally uncommitted until final verification. Review in this order:

1. One-shot API honesty and exclusive `idle/loading/error/result` behavior.
2. Token/content privacy, submission-snapshot binding, `REQUEST_SUBMITTED` / `CLIENT_SUBMITTED` client-time semantics, and absence of server-receipt claims.
3. Detector status aggregation—including successful mixed executed/skipped runs—policy copy, decision semantics, and absence of fabricated runtime facts.
4. Structured `application/json` SourceCard editing, exact `text/plain` preservation, and unchanged request/service contracts.
5. DOM order, live-region timing, pending-surface `inert` behavior, keyboard semantics, focus visibility, and reduced-motion first-frame settlement.
6. Type ownership, effect dependency stability, exact real Showcase props, direct imports, Showcase backward compatibility, and regression test strength.
7. CSS token discipline, 20-24 px/8-12 px geometry, responsive behavior, finite animation, and absence of game-HUD noise.
8. Three-round convergence against the approved target plus same-viewport Landing/Showcase consistency, without copying fake data or unauthorized target controls.

For every actionable behavior finding, write or tighten the smallest failing test first, run it to observe the intended RED failure, apply the minimum implementation change, and rerun the focused suite to GREEN. Documentation-only and CSS-only corrections are TDD exceptions, but they must re-run the relevant repository/style gate. Do not create an empty review-fix commit when there are no changes; when fixes exist, stage only their exact paths and commit them with:

```powershell
git add -- frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx frontend/src/components/sandbox-security/ContentItemRow.tsx frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx frontend/src/components/sandbox-security/EvaluationInspector.tsx frontend/src/components/sandbox-security/EvaluationRequestForm.tsx frontend/src/components/sandbox-security/EvidenceTrace.tsx frontend/src/components/sandbox-security/ExecutionTrace.tsx frontend/src/components/sandbox-security/PolicySelector.tsx frontend/src/components/sandbox-security/RequestLimitMeter.tsx frontend/src/components/sandbox-security/StageSelector.tsx frontend/src/components/sandbox-security/capability-session-panel.spec.tsx frontend/src/components/sandbox-security/decision-rendering.spec.tsx frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx frontend/src/pages/SandboxSecurityWorkbenchPage.tsx frontend/src/pages/sandbox-security-workbench.page.spec.tsx frontend/src/pages/sandbox-security-privacy.spec.tsx frontend/src/styles/app.css tests/repository/frontend-console-theme-literals.spec.ts
git diff --check
git diff --cached --check
git commit -m "fix(frontend): close workbench redesign review findings"
```

- [ ] **Step 7: Invoke verification-before-completion and collect fresh final evidence**

If closing review produces any Workbench frontend fix commit—or any other fix that can change rendered state, copy, semantic color, interaction, accessibility, or timing—first repeat Task 6 Round 3: compare the fresh 1672x941 Workbench capture beside the approved target, re-open the same-viewport Landing and Showcase, re-invoke the three available UI skills, and close any new highest-impact delta. Do not reuse pre-review screenshots as final visual evidence.

Now invoke `superpowers:verification-before-completion`. Identify the commands below as the evidence for the final report, run them fresh against the final tree, read their complete output and exit codes, and make no pass/completion claim before that evidence exists:

```powershell
npm.cmd run test --prefix frontend -- src/components/sandbox-security/capability-session-panel.spec.tsx src/components/sandbox-security/evaluation-request-form.spec.tsx src/components/sandbox-security/decision-rendering.spec.tsx src/pages/sandbox-security-workbench.page.spec.tsx src/pages/sandbox-security-privacy.spec.tsx src/pages/sandbox-security-showcase.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
npm.cmd run test:frontend
node .\frontend\node_modules\typescript\bin\tsc --noEmit -p frontend\tsconfig.json
npm.cmd run build --prefix frontend
npm.cmd run test:repo
git diff --check
```

Expected: every command exits 0 and `git diff --check` is silent. This is the evidence used in the final report; do not rely on earlier runs made before review fixes.

In the same Linux/CI-compatible shell used in Step 1, rerun the complete repository gate:

```bash
npm test
```

Expected: PASS only if the command actually exits 0. If the compatible runner is unavailable or the unchanged global P6 dependency blocks it, record that exact limitation and do not generalize the Windows-compatible evidence into a full-repository pass.

- [ ] **Step 8: Write the verified progress entry and commit durable documentation**

Only after Step 7, prepend the Step 4 draft to `docs/progress.md`, correcting its validation wording if a named external gate could not run. Every success statement must be backed by the fresh Step 7 output and final Round 3 captures.

```powershell
npm.cmd run test:repo
git diff --check
git add -- README.md docs/architecture.md docs/progress.md
git diff --cached --check
git commit -m "docs: record sandbox workbench redesign"
```

Expected: after `docs/progress.md` is written, `npm.cmd run test:repo` exits 0 and the working-tree diff check is silent; only then are all three durable docs staged, checked from the index, and committed. This post-write repository gate covers the actual final tree and prevents a corrected working tree from diverging from a stale index. If the gate or either diff check fails, correct only the documentation defect and restart this entire command block from `npm.cmd run test:repo`, including a fresh `git add`, before committing or reporting completion.

Do not stage `docs/api-contract.md`, `docs/sprint-current.md`, the R2 specification, user-owned pre-existing changes, `.runtime/**`, screenshots, or credentials.

- [ ] **Step 9: Stop and report this requirement only**

The final execution report must contain exactly the repository-required facts:

1. Modified and created files, grouped by composer, Inspector/traces, presentation gate, tests, and durable docs.
2. New tests: selector/policy semantics; compact composer, structured JSON-value preservation, and held credential; one-shot Inspector states; real-data traces and `REQUEST_SUBMITTED` / `CLIENT_SUBMITTED`; successful mixed executed/skipped aggregation; reveal order, pending-surface keyboard exclusion, and reduced motion; DecisionSummary backward compatibility; permanent CSS/color/radius gate.
3. Verification status, listing the final commands that passed and identifying any unchanged global P6/environment gate without overstating it.
4. Requirement status: R2 redesign complete for the approved scope; GENERAL-005 remains at its existing dependency-bounded status.
5. Suggested squash commit message: `feat(frontend): deliver cinematic sandbox security workbench`.

Stop after the report. Do not begin another requirement, alter the public API, add persistent state, or extend the Showcase route.

## Plan Self-Review

### Specification Coverage

| Spec decision | Plan coverage |
| --- | --- |
| D1 Cinematic Runtime Console | Tasks 1–6 implement the compact composer, exclusive Inspector, causal rail, decision climax, and lifecycle explanation as one frontend subsystem |
| D2 Fail-Closed toggle removed | Task 1 creates a plain read-only policy status and permanently tests the absence of switch semantics |
| D3 Demo Mode excluded | File Map and Tasks 3–7 prohibit Showcase fixtures, demo controls, and any authored fallback result |
| D4 English stage IDs + Chinese descriptions | Task 1 uses the three exact shared IDs and the three specified one-line descriptions |
| D5 Showcase components promoted without moves | Task 0 re-checks real interfaces; Tasks 2, 4, and 5 reuse motion constants, SpotlightSurface, FindingsCascade, DetectorChain, and VerdictHero directly, with SpringNumber reused transitively through VerdictHero, while preserving Showcase regressions |
| D6 one-shot presentation honesty | Tasks 3 and 5 bind complete responses, keep loading generic, label the event `REQUEST_SUBMITTED` with visible `CLIENT_SUBMITTED` provenance, and explain that all timed reveals occur post-response |
| D7 no new dependencies | File Map and Task 7 leave both package manifests and the lockfile unchanged |
| D8 no backend/shared/engine changes | File Map, Task 0 authority check, and Task 7 contract verification enforce this boundary |
| D9 existing semantics preserved | Every implementation task begins with focused RED coverage; Task 2 preserves the shared request contract while correcting the current row's accidental string-only JSON edit behavior exactly as the user requested, locks both media-type transitions and the existing parse-or-raw convention, and changes no DTO/normalizer/service shape; every task ends with existing component/page/privacy/Showcase regressions |
| D10 append CSS/no new tokens | Task 6 changes only the authorized grid declaration, appends the R2 block, extends the literal/radius gate, and keeps major versus technical geometry inside the Spec ranges |
| D11 EvidenceTrace | Tasks 3, 5, and 6 fix five always-present nodes, honest outcome precedence, static loading, semantic tokens, and finite reveal |
| D12 ExecutionTrace | Tasks 3, 5, and 6 derive seven lifecycle steps only from returned decision fields and frozen content-free submission facts; the first row is `REQUEST_SUBMITTED` / `CLIENT_SUBMITTED`, never a server receipt claim |
| D13 layout/reveal decoupling | Tasks 4 and 5 test final wrapper DOM order separately from findings → detectors → decision → execution activation order and require `aria-hidden` + `inert` before each gate |
| D14 horizontal StageSelector | Task 1 implements a three-column radio-semantic segmented control rather than vertical cards |
| D15 compact SourceStack | Task 2 uses rows=2, inline labeled controls, value-display bytes, add/remove preservation, valid structured JSON editing, exact text editing, and a reduced-motion-safe CALM_SPRING entry |
| D16 two-column InsightGrid | Tasks 5 and 6 co-present FindingsCascade and DetectorChain below the fixed DecisionHero, with responsive collapse |
| D17 read-only SecurityPolicyStatus | Task 1 uses exhaustive shared profile IDs and facts verified against the authoritative runtime manifest, without a toggle or new guarantee |

### Execution-Risk Revision Check

| Revision risk | Plan safeguard |
| --- | --- |
| UI skills omitted or allowed to redesign scope | Task 0 invokes `ui-ux-pro-max`, installed `frontend-design`, and installed `emil-design-eng` before UI edits; Task 6 re-invokes them in every QA round; both gates explicitly subordinate recommendations to the Spec and existing contracts |
| Completion claimed from stale evidence | Task 7 invokes `superpowers:verification-before-completion` after code review and any repeated visual round, then reruns the complete final evidence set before progress/report claims |
| Client timestamp presented as server receipt | Locked Decision 3 and Task 3 use `clientSubmittedAt`, `REQUEST_SUBMITTED`, visible `CLIENT_SUBMITTED` provenance, `请求提交`, and `client_submitted_at`, with negative tests for received/server wording |
| Hidden result content remains keyboard reachable | Tasks 4 and 5 require `aria-hidden` plus HTML `inert`, test pending focusable descendants, restore focus only at each gate, and settle all gates on the first reduced-motion frame |
| SourceCard emits a contract-invalid or ambiguous value after editing/type change | Task 2 first captures the current implementation, shared normalizer, and ToolRequestFields convention; independent RED tests prove valid JSON edits remain structured, `text/plain` remains an exact string, both media-type transitions normalize the displayed value, and JSON string-scalar/raw fallback behavior stays within the existing union without adding draft state |
| Mixed optional skip is treated as warning | Task 3 tests both `matched` and `no_match` plus optional `skipped` as Evidence `completed` and Execution `ok`; only failed/invalid/timeout becomes `error`, and absent/all-skipped becomes `skipped` |
| Visual timings become brittle behavior contracts | Evidence and Inspector delays remain private initial targets; tests advance semantic phases only, and Task 6 may tune numbers without changing the locked reveal order |
| Visual QA is a single subjective pass | Task 6 requires three render → screenshot → 3-5 deltas → UI-skill review → fix → screenshot loops, direct side-by-side target comparison every round, and same-viewport real Landing/Showcase comparison |
| Target image drives fake UI/data | Task 0 pins the read-only target path/hash; Task 6 states the semantic/brand/reference/pixel priority and explicitly forbids copying unsupported controls, timestamps, detector facts, confidence, or content |
| Geometry is locked at an out-of-range 18 px | Task 6 removes 18 px major overrides, inherits 24 px `.console-panel`, starts ExecutionTrace at 20 px and technical EvidenceTrace at 12 px, and tests only the approved ranges |
| Showcase props or semantics are guessed | Task 0 re-opens every real component interface; Task 5 passes explicit `SpotlightSurface.ariaLabel` while recognizing that its ordinary `div` is not the Inspector landmark, omits nonexistent `DetectorChain.reduceMotion`, and leaves sequence completion with the Inspector; Task 6 preserves/tests the existing reduced-motion glow shutdown |

### Type and Ownership Consistency

| Type/state | Single owner | Consumers |
| --- | --- | --- |
| `EvaluationRequestFacts` (`clientSubmittedAt`, `sourceCount`, `requestBytes`) | `ExecutionTrace.tsx` | page snapshot, Inspector result state, ExecutionTrace |
| `EvaluationResult` | Workbench page | page request/retry lifecycle only |
| `EvaluationInspectorState` | `EvaluationInspector.tsx` | page constructs it; Inspector exhaustively renders it |
| `EvidenceTraceProps` | `EvidenceTrace.tsx` | Inspector supplies either inert or result-required fields |
| `RevealPhase` | `EvaluationInspector.tsx` | one finite effect keyed by `decision_id` and reduced-motion boolean |
| policy IDs and detector statuses | existing shared contract | selectors and pure trace derivations; no duplicate open string type |

The plan uses direct file imports because no Showcase barrel exists and calls the real props exactly. `DetectorChain` receives only `runs` and `active`; optional `onComplete` is intentionally omitted because `EvaluationInspector` owns sequence completion, and no `reduceMotion` prop exists because DetectorChain reads the preference internally. `SpotlightSurface` receives an explicit camelCase `ariaLabel`, but its real root is an ordinary `div`; only the outer named `EvaluationInspector` section supplies region semantics, and the existing CSS media query hides its decorative glow for reduced motion/transparency. `SpringNumber` remains encapsulated inside `VerdictHero` rather than gaining an unused direct import. One top-level `useReducedMotion() ?? false` value drives the other Workbench surfaces. No task modifies backend/shared/engine contracts, adds a dependency, imports authored Showcase fixtures into Workbench, or stores a capability/content value outside page React state.

### Execution Gate

This documentation-only revision remains `PLAN_COMPLETE_PENDING_EXECUTION_APPROVAL`. It does not invoke an executing/subagent implementation workflow and does not start Task 0 or edit production code. Execution must not start until the user explicitly approves R2, grants implementation authority, resolves the dirty overlapping base, and supplies the Task 0 visual inputs—including a renderable Landing reference—without widening this requirement. Once those gates are clear, execute exactly one task at a time with the required RED evidence, focused GREEN evidence, exact-path commits, review checkpoints, fresh final verification, and the stop condition above.
