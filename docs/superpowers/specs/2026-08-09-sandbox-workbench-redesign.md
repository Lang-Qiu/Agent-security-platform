# Spec: Sandbox Security Workbench UI/UX Redesign

## Document Status

- Requirement: Sandbox Workbench Cinematic Runtime Redesign
- Date: 2026-08-09
- Status: `DRAFT_PENDING_USER_REVIEW`
- Design approach: **B — Cinematic Runtime Console**
- Visual target: Cinematic Precision Agent Security (70% restraint + 30% controlled spectacle)
- Canonical predecessor specs:
  - `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
  - `docs/superpowers/specs/2026-08-09-agent-security-platform-product-landing-page-design.md`
- Implementation authority: NOT YET GRANTED. User must explicitly approve this spec
  and its implementation plan before any production file changes.

## Confirmed Design Decisions

| # | Decision |
|---|---|
| D1 | Approach B: Cinematic Runtime Console |
| D2 | Fail-Closed: add as presentation-layer toggle (see §3.6 for caveat) |
| D3 | Demo Mode: excluded from scope |
| D4 | Stage descriptions: English ID + Chinese one-liner per stage |
| D5 | DetectorChain / FindingsCascade / VerdictHero promoted from `showcase/` to Workbench |
| D6 | API is one-shot; staged reveal is presentation layer only, must be labeled as such |
| D7 | No new dependencies; Motion 13 already installed |
| D8 | No backend / shared contract / engine changes |
| D9 | Existing test semantics preserved; test queries may be updated for new DOM structure |
| D10 | All new CSS appended to `app.css`; no new stylesheet; no new `:root` tokens |

## 1. Current State Summary

### 1.1 Visual DNA (existing tokens, all reused verbatim)

```
--console-bg:              #0d1520   page base
--console-surface:         rgba(18,28,40,0.9)  panel fill
--console-surface-raised:  #16222f   nested row
--console-ink:             #e4edf5   primary text
--console-muted:           #8fa3b8   secondary text
--console-accent:          #22d3ee   cyan accent
--console-accent-soft:     #0f2a35   cyan fill
--console-border-strong:   #2c3e52   panel edge
--console-mono:            JetBrains Mono stack
--console-shadow:          0 24px 80px rgba(0,0,0,0.5)
severity: critical #f87171 / high #fb923c / medium #fbbf24 / low #38bdf8
action:   allow #34d399 / deny #f87171
```

`.console-panel`: `padding:24px; border-radius:24px; background:--console-surface;
  border:1px solid --console-border-strong; box-shadow:--console-shadow; backdrop-filter:blur(10px)`

`@keyframes rise-in`: `opacity 0→1, translateY 8px→0, 420ms ease`

### 1.2 Showcase components available for promotion

| Component | Path | Reuse note |
|---|---|---|
| `DetectorChain` | `showcase/DetectorChain.tsx` | accepts `runs[]`, `active`, `onComplete`; no changes needed |
| `FindingsCascade` | `showcase/FindingsCascade.tsx` | accepts `findings[]`, `active`, `reduceMotion`; no changes needed |
| `VerdictHero` | `showcase/VerdictHero.tsx` | accepts `decision`, `active`, `reduceMotion`; pass `active={true}` |
| `SpotlightSurface` | `showcase/SpotlightSurface.tsx` | no changes needed |
| `SpringNumber` | `showcase/SpringNumber.tsx` | no changes needed |
| `showcase-motion.ts` | `showcase/showcase-motion.ts` | CALM_SPRING, MOMENTUM_SPRING, verdictSpring |

All promoted components keep their existing paths. Workbench imports them via relative path.
No file moves required unless a future refactor warrants it.

## 2. Target Architecture

### 2.1 Page structure

```
SandboxSecurityWorkbenchPage
├── WorkbenchHeader
│   ├── eyebrow "沙箱安全 · 评估工作台"
│   ├── h3 "评估工作台"
│   ├── p  description
│   └── SimulationBadge "SIMULATION / 仿真"
│
└── .sandbox-workbench-grid  (0.75fr / 1.25fr, gap 20px)
    │
    ├── .sandbox-workbench-input          [LEFT — Request Composer]
    │   ├── SecurityCredentialPanel
    │   ├── StageSelector
    │   ├── PolicySelector
    │   ├── SourceStack
    │   ├── ToolRequestSection  (stage=tool_request only)
    │   ├── TechnicalMeter
    │   ├── FailClosedToggle
    │   ├── ViolationsList
    │   └── EvaluateCTA
    │
    └── .sandbox-workbench-results        [RIGHT — Evaluation Inspector, sticky]
        └── EvaluationInspector
            ├── state=idle     → InspectorIdle
            ├── state=loading  → InspectorRunning
            ├── state=error    → InspectorError
            └── state=result
                ├── DecisionHero   (VerdictHero promoted)
                ├── FindingsSection (FindingsCascade promoted)
                └── DetectorSection (DetectorChain promoted)
```

### 2.2 Grid proportions

```css
.sandbox-workbench-grid {
  grid-template-columns: minmax(300px, 0.75fr) minmax(500px, 1.25fr);
}
```

Right pane is deliberately wider than the current 1.15fr to give the
Decision Hero room to breathe and establish visual dominance.

## 3. Left Pane: Request Composer

### 3.1 SecurityCredentialPanel

**Visual upgrade of existing `CapabilitySessionPanel`.**

States:
- `empty`: Input visible, placeholder "粘贴能力令牌", description text
- `held`: Input cleared (value not re-rendered); accent-soft surface;
  `TOKEN HELD · 令牌已持有` badge in accent color; ClearButton enabled
- `rejected`: Same as empty + Alert (requiresNewCapability)

CSS target:
```css
.workbench-credential-panel               /* console-panel base */
.workbench-credential-panel--held         /* accent-soft background tint */
.workbench-credential-status              /* mono badge: TOKEN HELD */
```

The `hasToken: boolean` contract is unchanged. The token value is never
rendered into the DOM. No new props are needed.

### 3.2 StageSelector

**Visual upgrade of existing stage fieldset (3 Radio buttons).**

Three `StageCard` elements in a column:

| stage | English ID | Chinese description |
|---|---|---|
| `user_input` | `user_input` | 评估用户输入内容，检测注入与越权意图 |
| `tool_request` | `tool_request` | 评估工具调用请求，检测参数劫持与作用域滥用 |
| `model_output` | `model_output` | 评估模型输出内容，检测敏感数据泄露与输出操纵 |

CSS target:
```css
.workbench-stage-card                     /* unselected card */
.workbench-stage-card--selected           /* accent border + soft fill */
.workbench-stage-card__id                 /* mono, accent color */
.workbench-stage-card__desc              /* muted text, small */
```

Radio semantics preserved (`name="sandbox-security-stage"`). Cards are
`<label>` wrappers around the existing `<Radio>` to keep keyboard/screen
reader behavior.

### 3.3 PolicySelector

**Visual upgrade of existing policy fieldset (2 Radio buttons).**

Two `PolicyCard` elements side by side (flex row):

| policy | English ID | Key differentiator |
|---|---|---|
| `sandbox-security-balanced.v1` | `balanced.v1` | 平衡：可选检测器参与 |
| `sandbox-security-strict.v1`   | `strict.v1`   | 严格：全量检测器强制执行 |

CSS target:
```css
.workbench-policy-card                    /* unselected */
.workbench-policy-card--selected          /* accent border + soft fill */
.workbench-policy-card__id                /* mono, small */
.workbench-policy-card__desc             /* muted, caption size */
```

Same `<label>` + `<Radio>` pattern as StageSelector.

### 3.4 SourceStack

**Visual upgrade of `ContentItemRow` repeated list.**

Each item becomes a `SourceCard`:

```
SourceCard
├── header row
│   ├── source_id chip  (mono, accent, e.g. "src-0")
│   ├── claimed_source_type Select  (compact)
│   └── RemoveButton (icon only, if canRemove)
├── media_type row
│   └── media_type Select  (compact)
└── content area
    └── Textarea (monospace, rows=3)
```

CSS target:
```css
.workbench-source-card                    /* console-panel-like surface */
.workbench-source-card__header            /* flex row */
.workbench-source-card__id               /* mono chip */
```

"新增来源" button kept below the stack. Card enters with CALM_SPRING
on add. Remove triggers immediate exit (no animation needed for removal).
`source_id`, `provenance_ref`, and internal state logic are unchanged.

### 3.5 TechnicalMeter (upgrade of RequestLimitMeter)

Visual upgrade only. Props unchanged: `usedBytes`, `limitBytes`.

```
TechnicalMeter
├── track (thin, 4px height, border-radius 2px)
│   └── fill (accent color, critical red at >100%)
├── label row
│   ├── "请求用量" (muted)
│   └── "N / 524288 B" (mono, right-aligned)
└── warning text (if >90%: "接近上限" in amber)
```

CSS target: `.workbench-byte-meter`, `.workbench-byte-meter__fill`

### 3.6 FailClosedToggle

**New UI control. Presentation-layer only for this iteration.**

> **Backend caveat**: The current `SandboxSecurityRequest` contract does not
> include a `fail_closed` parameter. This toggle is a visual affordance in the
> UI. It does NOT alter the API request body in this iteration. A future
> backend contract extension is required to wire it to real behavior.
> The control must be visually labeled to indicate it is a policy intent
> indicator, not a live enforcement switch.

Visual design: a custom toggle styled as a security control (not a plain
checkbox), with:
- Label: `Fail-Closed` (mono) + `故障关闭` (Chinese)
- Description: `检测失败时拒绝通过（演示标注，本次不传入请求）`
- Toggle on: accent color indicator; toggle off: muted
- `aria-checked`, `role="switch"` semantics

CSS target: `.workbench-fail-closed`, `.workbench-fail-closed__track`

State: `failClosed: boolean` in page state. Not passed to service call.

### 3.7 EvaluateCTA

Upgrade of current `Button type="primary"` submit.

States:
- `idle` (violations.length === 0): "开始评估" — full accent primary
- `blocked` (violations.length > 0): "开始评估" — disabled, muted
- `submitting`: "评估中..." — loading spinner, disabled

CSS target: `.workbench-evaluate-btn`
Animation: loading spinner uses existing Ant Design Button loading prop.

## 4. Right Pane: Evaluation Inspector

The Inspector is a single component (`EvaluationInspector`) that manages
four exclusive render states based on `{ submitting, decision, error }`.

### 4.1 State: idle

Shown when `!submitting && !decision && !error`.

```
InspectorIdle  (wrapped in SpotlightSurface)
├── .console-panel surface
├── center-aligned content
│   ├── icon: RadarChartOutlined (muted, large)
│   ├── heading: "等待评估"
│   ├── body: "配置左侧请求并提交，判定结果将在此呈现。"
│   └── hint row (three detector type chips, opacity 0.35):
│       "rule" · "local_model" · "external_judge"
```

SpotlightSurface provides the magnetic glow; no other animation.
CSS: `.workbench-inspector-idle`

### 4.2 State: loading

Shown when `submitting === true`.

```
InspectorRunning  (wrapped in SpotlightSurface)
├── .console-panel surface
├── EVALUATING badge (accent, pulsing — see §5.3)
└── three detector-type shimmer rows:
    ├── row: "rule" shimmer (delay 0ms)
    ├── row: "local_model" shimmer (delay 300ms)
    └── row: "external_judge" shimmer (delay 600ms)
```

**Critical**: rows show only detector type labels (rule / local_model /
external_judge). No detector IDs, no progress bars, no fake percentages.
The shimmer communicates "evaluation in progress", not real detector state.
CSS: `.workbench-inspector-running`, `.workbench-shimmer-row`

### 4.3 State: error

Shown when `error !== null && !requiresNewCapability`.
Layout unchanged from current implementation (Alert + retry Button).
Visual: Alert uses existing Ant Design error type. No new components.

### 4.4 State: result

Shown when `decision !== null`. Three sub-sections appear in sequence
(see §5.2 for timing). Each sub-section is a `motion.div`.

#### 4.4.1 DecisionHero

Promoted from `VerdictHero`. Called with `active={true}` always.

The component already renders:
- `verdictSpring(decision.risk_level)` driven entrance
- pulse ring (expand + fade, no loop)
- verdict / action / risk_level as large ValueTags
- metrics: findings count, detectors run count, total elapsed ms

**Additions for Workbench context** (minimal wrapper, not component change):
- Above the VerdictHero block: `SandboxSecurityValueTag` for `stage` and
  `policy_profile_id` (already in DecisionSummaryPanel, move here)
- Below: collapsible row for `decision_id` and `request_id` (mono)
- Simulation warning: existing `Text type="warning"` line kept
- `no_detected_risk` Alert kept

Wrapped in `.workbench-decision-hero` (console-panel surface).
The existing `role="status"` and `aria-live="polite"` from DecisionSummaryPanel
must be preserved in this new wrapper.

#### 4.4.2 FindingsSection

```
motion.div (enterAt delay 300ms)
└── section.console-panel
    ├── eyebrow "风险发现" (uppercase, accent, small)
    └── FindingsCascade
          findings={decision.findings}
          active={true}
          reduceMotion={reduceMotion}
```

If `decision.findings.length === 0`: render `<Empty description="未产生风险发现" />`
instead of FindingsCascade (the cascade adds no value for zero items and
would show an unstyled empty list). The Decision Hero's `no_detected_risk`
verdict already communicates the absence of findings.

#### 4.4.3 DetectorSection

```
motion.div (enterAt delay 800ms)
└── section.console-panel
    ├── eyebrow "检测器执行" (uppercase, accent, small)
    └── DetectorChain
          runs={decision.detector_runs}
          active={true}
          onComplete={undefined}
```

`onComplete` is not needed in the Workbench context (no act transition).
The chain plays once and settles. `active` is always `true` when rendered.

### 4.5 Staged reveal timing

> **Honest labeling requirement**: This is a presentation-layer reveal.
> The API returns all data at once. The stagger is for comprehension, not
> to represent real-time streaming. No code comment, UI copy, or visual
> state may imply the detectors are executing live after API return.

```
API returns
  t=0ms     decision state set
  t=0ms     DecisionHero mounts   → verdictSpring entrance (risk_level driven)
  t=0ms     pulse ring expands once, fades (0.9s easeOut, no loop)
  t=700ms   FindingsCascade mounts → severity-ordered stagger (0.08s per item)
  t=1600ms  DetectorChain mounts  → elapsed_ms-proportional reveal
               (fast rule detectors arrive quickly,
                local_model detectors have visible pause,
                timeout/failed detectors land in error color)
```

Rationale: Decision settles in ~0.3–0.5s depending on risk_level; 700ms
gives the verdict full time to land and be read before Findings arrive.
Another 900ms before DetectorChain ensures each section feels like a
distinct reveal moment rather than a rapid flush.

The `enterAt(index)` helper in `SandboxSecurityWorkbenchPage` handles
the existing small stagger (delay: index * 0.06). For the larger inter-
section delays, use explicit values on the wrapping `motion.div`:

```tsx
{/* Findings — 700ms after decision */}
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", bounce: 0, duration: 0.4, delay: 0.7 }}>
  <FindingsSection ... />
</motion.div>

{/* Detectors — 1600ms after decision */}
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", bounce: 0, duration: 0.4, delay: 1.6 }}>
  <DetectorSection ... />
</motion.div>
```

Under `prefers-reduced-motion: reduce`: all delays collapse to 0,
all entrances are instant opacity changes (no spring travel).

## 5. Motion Design

### 5.1 What animates

| Moment | Component | Spring / timing |
|---|---|---|
| Inspector idle → loading transition | EvaluationInspector | opacity 200ms |
| Inspector loading → result transition | EvaluationInspector | CALM_SPRING |
| Decision Hero entrance | VerdictHero | `verdictSpring(risk_level)` |
| Pulse ring | VerdictHero | 0.9s easeOut, **no loop** |
| Metrics (SpringNumber) | VerdictHero | CALM_SPRING, stagger 0/0.06/0.12 |
| Findings rows | FindingsCascade | MOMENTUM_SPRING, 0.08s stagger |
| Detector rows | DetectorChain | MOMENTUM_SPRING, elapsed_ms schedule |
| Detector chain rail fill | DetectorChain | CALM_SPRING |
| New SourceCard entry | SourceStack | CALM_SPRING |
| EVALUATING badge pulse | InspectorRunning | CSS keyframe, 1.4s ease, loops while loading |
| Shimmer rows | InspectorRunning | CSS @keyframes shimmer, 1.5s linear, stagger |
| SpotlightSurface glow | SpotlightSurface | SHOWCASE_SPOTLIGHT_SPRING (stiffness 140) |

### 5.2 What must NOT animate

| Element | Reason |
|---|---|
| Shimmer row detector progress | Must not imply real streaming |
| Already-settled Decision area | No loop, no replay after settle |
| Form inputs and selects | Operational UI — no decoration |
| Submitted content text | Never animated, never in URL/log |
| Decision ring after first expansion | One pulse only, then gone |

### 5.3 EVALUATING badge pulse (CSS, loading state only)

```css
@keyframes workbench-pulse-badge {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}
.workbench-evaluating-badge {
  animation: workbench-pulse-badge 1.4s ease infinite;
}
@media (prefers-reduced-motion: reduce) {
  .workbench-evaluating-badge { animation: none; }
}
```

### 5.4 Shimmer row (CSS, loading state only)

```css
@keyframes workbench-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.workbench-shimmer-row::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg, transparent, var(--console-veil), transparent
  );
  animation: workbench-shimmer 1.5s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .workbench-shimmer-row::after { display: none; }
}
```

## 6. CSS Architecture

All new rules appended to `frontend/src/styles/app.css` inside a clearly-
delimited comment block. No new stylesheet. No new `:root` tokens.
All color values reference existing `var(--console-*)`.

### 6.1 New class inventory (summary)

```
.workbench-credential-panel / --held / __status
.workbench-stage-card / --selected / __id / __desc
.workbench-policy-cards / .workbench-policy-card / --selected
.workbench-source-card / __header / __id
.workbench-byte-meter / __track / __fill
.workbench-fail-closed / __track
.workbench-inspector-idle
.workbench-inspector-running
.workbench-evaluating-badge  (+ @keyframes workbench-pulse-badge)
.workbench-shimmer-row       (+ @keyframes workbench-shimmer)
.workbench-decision-hero
.workbench-section-eyebrow
```

### 6.2 No color literals

Every color references an existing `var(--console-*)`. The repository
color-literal gate (`tests/repository/frontend-console-theme-literals.spec.ts`)
must stay green after this change.

### 6.3 Grid override

```css
/* Override existing 0.85fr/1.15fr for more Decision Hero space */
.sandbox-workbench-grid {
  grid-template-columns: minmax(300px, 0.75fr) minmax(500px, 1.25fr);
}
```

This is the only change to an existing class. All other changes are new
additions. The existing `@media (max-width: 1100px)` rule that collapses
to `1fr` is unchanged.

## 7. Accessibility

All existing accessibility contracts from GENERAL-005 are preserved:

| Requirement | Implementation |
|---|---|
| `role="status"` on decision | Moved from DecisionSummaryPanel to wrapper in DecisionHero block |
| `aria-live="polite"` | Same location |
| `role="alert"` on error | Unchanged in ErrorState |
| `type="password"` on token input | Unchanged in SecurityCredentialPanel |
| Token never re-rendered to DOM | `hasToken: boolean` interface unchanged |
| Reduced motion | `useReducedMotion()` hook; all components already support it |
| Keyboard operability | All cards are `<label>` wrappers; focus ring: 2px `--console-accent` |
| Contrast | All text on `--console-surface` already verified ≥ 4.5:1 |
| Screen reader | Shimmer rows have `aria-hidden="true"`; SpotlightSurface glow is `aria-hidden` |
| FailClosedToggle | `role="switch"`, `aria-checked`, labeled |
| Stage/Policy cards | Radio semantics preserved inside `<label>` wrappers |
| Violations live region | Existing `aria-live="polite"` on `.sandbox-security-violations` unchanged |

New accessibility additions:
- `aria-label="评估检查器"` on the EvaluationInspector section
- `aria-label="令牌会话"` on SecurityCredentialPanel (was already present)
- `aria-busy="true"` on the Inspector section during loading state
- Section eyebrows are `aria-hidden` (decorative labels; real heading remains)

## 8. Test Plan

### 8.1 Existing tests — must remain green

```
frontend/src/pages/sandbox-security-workbench.page.spec.tsx
frontend/src/components/sandbox-security/capability-session-panel.spec.tsx
frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx
frontend/src/components/sandbox-security/decision-rendering.spec.tsx
frontend/src/pages/sandbox-security-privacy.spec.tsx
tests/repository/frontend-console-theme-literals.spec.ts
```

Query updates permitted: test assertions checking class names or DOM
structure may be updated to reflect the new component tree, provided:
- No semantic assertion (role, aria-label, live-region behavior) is weakened
- No privacy assertion is removed or weakened
- Business logic tests (idempotency key lifecycle, violation blocking,
  error state rendering) remain unchanged

### 8.2 New tests required

| Test | File | What it covers |
|---|---|---|
| Inspector state machine | `workbench.page.spec.tsx` | idle → loading → result/error transitions |
| Decision Hero rendering | `decision-rendering.spec.tsx` | VerdictHero receives correct props from real decision |
| Staged reveal order | `workbench.page.spec.tsx` | DecisionHero before Findings before Detectors |
| Stage card selection | `evaluation-request-form.spec.tsx` | card click updates stage, tool fields appear/disappear |
| Policy card selection | `evaluation-request-form.spec.tsx` | card click updates policyProfileId |
| Source card add/remove | `evaluation-request-form.spec.tsx` | card add animates in, remove works |
| FailClosed toggle | `evaluation-request-form.spec.tsx` | toggle state changes; NOT passed to service call |
| Loading shimmer accessibility | `workbench.page.spec.tsx` | shimmer rows are aria-hidden during loading |
| Color literal gate | `frontend-console-theme-literals.spec.ts` | new CSS has no raw hex/rgba literals |
| Reduced motion | `workbench.page.spec.tsx` | all staged delays collapse to 0 |

### 8.3 Screenshot / visual QA

After implementation, run Playwright screenshot captures:
- `/sandbox-security/workbench` at 1920×1080 (idle, loading, result states)
- `/sandbox-security/workbench` at 1440×900 (same states)
- Compare result state against `.runtime/landing-audit/target.png`
- Verify Decision Hero is visually dominant over Findings and Detectors
- Verify DetectorChain elapsed_ms rhythm is legible at projection distance

## 9. Engineering Impact

### 9.1 Files modified

| File | Change |
|---|---|
| `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx` | Main refactor: layout, state, EvaluationInspector |
| `frontend/src/styles/app.css` | Append new `.workbench-*` class block; override grid proportion |
| `frontend/src/components/sandbox-security/CapabilitySessionPanel.tsx` | Visual upgrade (held state styling, no interface change) |
| `frontend/src/components/sandbox-security/EvaluationRequestForm.tsx` | Split into StageSelector + PolicySelector sub-components |
| `frontend/src/components/sandbox-security/ContentItemRow.tsx` | Upgrade to SourceCard visual (no interface change) |
| `frontend/src/components/sandbox-security/RequestLimitMeter.tsx` | Upgrade to TechnicalMeter visual (no interface change) |
| `frontend/src/components/sandbox-security/DecisionSummaryPanel.tsx` | Reduced: becomes thin wrapper; VerdictHero does the heavy lifting |

### 9.2 Files created

| File | Responsibility |
|---|---|
| `frontend/src/components/sandbox-security/StageSelector.tsx` | 3 StageCards with descriptions |
| `frontend/src/components/sandbox-security/PolicySelector.tsx` | 2 PolicyCards with differentiators |
| `frontend/src/components/sandbox-security/EvaluationInspector.tsx` | Inspector state machine (idle/loading/error/result) |
| `frontend/src/components/sandbox-security/FailClosedToggle.tsx` | Presentation-only security toggle |

### 9.3 No changes required in

- `shared/` types, contracts, limits — unchanged
- `frontend/src/services/sandbox-security-service.ts` — unchanged
- `frontend/src/utils/sandbox-security-limits.ts` — unchanged
- `frontend/src/services/api-client.ts` — unchanged
- All other pages, layouts, navigation — unchanged
- All existing `showcase/` component files — unchanged (only imported from)

### 9.4 Promoted component imports

Workbench imports from existing showcase paths:
```ts
import { VerdictHero } from "./showcase/VerdictHero";
import { FindingsCascade } from "./showcase/FindingsCascade";
import { DetectorChain } from "./showcase/DetectorChain";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { SpringNumber } from "./showcase/SpringNumber";
import { CALM_SPRING, MOMENTUM_SPRING, verdictSpring } from "./showcase/showcase-motion";
```

No files are moved. No showcase component is modified.

## 10. Acceptance Criteria

1. First visual impression: Workbench reads as the same product as the
   Showcase page and (when Landing ships) the Landing Page.
2. Decision Hero is the dominant visual element in the result state; a
   viewer at projection distance can read verdict, action, risk_level
   within 3 seconds of result appearing.
3. Staged reveal follows the order: Decision → Findings → Detectors,
   with visible stagger delay.
4. DetectorChain's elapsed_ms rhythm is legible: rule detectors arrive
   fast, local_model has a visible pause, timeout shows in error color.
5. Loading state communicates "evaluating" without implying real streaming;
   no detector IDs or progress values appear during loading.
6. All existing privacy tests pass: token not in DOM, content not in URL,
   no storage writes.
7. All existing semantic tests pass: role="status" announces verdict,
   role="alert" announces errors, keyboard tab order is logical.
8. Reduced motion: all staged delays collapse to 0; no pulse ring, no
   shimmer, no spring travel. All information immediately visible.
9. `tests/repository/frontend-console-theme-literals.spec.ts` stays green:
   no raw hex or rgba literals in new CSS or TSX files.
10. FailClosedToggle is present, operable, and labeled as a presentation
    affordance (not wired to API request body).
11. No backend, shared contract, engine, or existing Console page is changed.
12. Build passes; TypeScript has no new errors; all tests pass.

---

*Spec status: DRAFT_PENDING_USER_REVIEW*
*Next step: user review → superpowers:writing-plans*
