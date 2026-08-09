# Spec: Sandbox Security Workbench UI/UX Redesign [R2]

## Document Status

- Requirement: Sandbox Workbench Cinematic Runtime Redesign
- Date: 2026-08-09
- Revision: **R2** (design evolution, not rewrite)
- Status: `DRAFT_PENDING_USER_REVIEW`
- Design approach: **B — Cinematic Runtime Console**
- Visual target: Cinematic Precision Agent Security (70% restraint + 30% controlled spectacle)
- Implementation authority: NOT YET GRANTED.

## Confirmed Design Decisions

| # | Decision |
|---|---|
| D1 | Approach B: Cinematic Runtime Console |
| D2 | ~~Fail-Closed toggle~~ **REMOVED** (P0-3). Replaced by read-only SecurityPolicyStatus. |
| D3 | Demo Mode: excluded from scope |
| D4 | Stage descriptions: English ID + Chinese one-liner per stage |
| D5 | DetectorChain / FindingsCascade / VerdictHero promoted from `showcase/` |
| D6 | API is one-shot; all reveals are presentation layer; no fake streaming |
| D7 | No new dependencies; Motion 13 already installed |
| D8 | No backend / shared contract / engine changes |
| D9 | Existing test semantics preserved; DOM query updates permitted |
| D10 | All new CSS appended to `app.css`; no new stylesheet; no new `:root` tokens |
| D11 | EvidenceTrace: thin technical rail, presentation-layer reveal only (NEW) |
| D12 | ExecutionTrace: derived from real `SandboxSecurityDecision` fields only (NEW) |
| D13 | Layout order and reveal order are **decoupled** (R2.1): DOM layout = EvidenceTrace→DecisionHero→InsightGrid→ExecutionTrace; Reveal animation = EvidenceTrace→Findings→Detectors→DecisionHero climax→ExecutionTrace |
| D14 | StageSelector: horizontal segmented, not 3 vertical cards (REVISED) |
| D15 | SourceStack: compact rows=2, inline controls for 1080p density (REVISED) |
| D16 | InsightGrid: FindingsCascade + DetectorChain side by side; positioned **below** DecisionHero in DOM layout (NEW) |
| D17 | SecurityPolicyStatus: read-only policy property badge, no toggle semantics (NEW) |

## Design Contract v0.1

Lightweight shared visual language between Workbench, Showcase, and (future) Landing.
Not a Design System — only stable, reusable rules. YAGNI applies.

### Canvas & Surfaces

| Layer | Token | Usage |
|---|---|---|
| Canvas | `--console-bg` `#0d1520` | Page base |
| Panel surface | `--console-surface` `rgba(18,28,40,0.9)` | Major panels, backdrop-filter blur(10px) |
| Raised surface | `--console-surface-raised` `#16222f` | Nested rows, chip backgrounds |
| Panel border | `--console-border-strong` `#2c3e52` | Panel edge |
| Interactive border | `--console-border-interactive` `#51708f` | Input/control edge, selected state |

### Accent & Semantics

| Role | Token | Rule |
|---|---|---|
| Cyan | `--console-accent` `#22d3ee` | Evidence active · CTA · focus ring · selected state ONLY |
| Cyan fill | `--console-accent-soft` `#0f2a35` | Accent surface fill |
| Critical | `--console-severity-critical` | Real risk finding · never decoration |
| High/Medium/Low | severity tokens | Real risk semantics only |
| Allow | `--console-action-allow` | Real allow decision only |
| Deny | `--console-action-deny` | Real deny decision only |

**Glow rule**: glow only at evidence active state, decision climax, and CTA.
Never: every-card glow, permanent pulse, generic AI gradient, purple/blue wash.

### Typography

| Role | Font | Usage |
|---|---|---|
| UI text | Aptos / Segoe UI sans | Labels, body, headings |
| Technical identifiers | `--console-mono` JetBrains Mono | IDs, hashes, enum values, detector names |
| Micro labels | mono + uppercase + letter-spacing | Eyebrows, section labels, state chips |

### Geometry

| Surface | Radius | Notes |
|---|---|---|
| Major panel | 20–24px | Existing `.console-panel` |
| Technical inner surface | 8–12px | Compact rows, cards within panels |
| Chip / badge | 4–6px or 999px pill | Small labels |

**Decision**: Keep outer `.console-panel` at 24px for Landing consistency.
Use smaller 8–12px radius for inner technical surfaces (EvidenceTrace nodes,
SourceCards, StageSelector items) to signal "precision instrument" within the panel.
Do not globally reduce `.console-panel` radius.

### Motion

| Tier | When | Max duration |
|---|---|---|
| UI | hover / select / focus | 200ms |
| Narrative | section reveal, stagger | 400ms |
| Cinematic | evidence trace, detector chain, decision | Cinematic presentation target: approximately 3–4s total |

No loops after settle. No fake progress. No continuous pulse except during
active loading (EVALUATING badge). Reduced motion collapses all to instant opacity.

**Timing note**: Specific timing values are visual tuning targets, not
behavioral or test contracts. They may be adjusted slightly during
implementation and visual QA.

### Future Consolidation Note

Workbench currently imports showcase runtime components from `showcase/`.
No file moves in this iteration. After Landing is implemented, evaluate whether
`DetectorChain`, `FindingsCascade`, `VerdictHero`, `SpotlightSurface` warrant
promotion to `components/security-runtime/` or equivalent shared location.
This spec does not authorize that move.

## 1. Current State Summary

### 1.1 Reusable tokens (all referenced, never duplicated)

```
--console-bg / --console-surface / --console-surface-raised
--console-ink / --console-muted / --console-muted-dim
--console-accent / --console-accent-soft / --console-accent-strong
--console-border / --console-border-strong / --console-border-interactive
--console-severity-critical/high/medium/low/info
--console-action-allow / --console-action-deny
--console-mono / --console-shadow / --console-veil
```

`.console-panel`: 24px radius, surface bg, shadow, backdrop-filter blur(10px)
`@keyframes rise-in`: opacity 0→1, translateY 8→0, 420ms ease

### 1.2 Showcase components available for promotion (no file moves)

| Component | Key props | Workbench usage |
|---|---|---|
| `VerdictHero` | `decision`, `active`, `reduceMotion` | DecisionHero block; pass `active={true}` |
| `FindingsCascade` | `findings[]`, `active`, `reduceMotion` | FindingsSection; `active={true}` |
| `DetectorChain` | `runs[]`, `active`, `onComplete` | DetectorSection; `active={true}`, no `onComplete` needed |
| `SpotlightSurface` | `className`, `ariaLabel`, `children` | InspectorIdle + InspectorRunning wrappers |
| `SpringNumber` | `value`, `suffix`, `reduceMotion` | DecisionHero metrics |
| `showcase-motion.ts` | CALM_SPRING, MOMENTUM_SPRING, verdictSpring | All motion transitions |

### 1.3 Real data available from SandboxSecurityDecision

Fields derivable for UI use (confirmed from shared types):

```
decision_id, request_id, evaluation_mode, stage, policy_profile_id
verdict, action, risk_level
findings[]: finding_id, detector_id, category, severity, confidence,
            reason_code, subject_refs
detector_runs[]: detector_id, detector_kind (rule/local_model/external_judge),
                 obligation, elapsed_ms, status, finding_ids/error_code/skip_reason
evidence_refs[], created_at
```

From submitted request (available in page state):
```
stage, policyProfileId, contentItems[]{source_id, claimed_source_type,
  media_type, value}, toolRequest?
```

ExecutionTrace must only derive steps from the above. No invented fields.

## 2. Target Architecture

### 2.1 Component tree

```
SandboxSecurityWorkbenchPage
│
├── WorkbenchHeader
│   ├── eyebrow  "沙箱安全 · 评估工作台"
│   ├── h3       "评估工作台"
│   ├── p        description
│   └── SimulationBadge  "SIMULATION / 仿真"
│
└── .sandbox-workbench-grid  (0.75fr / 1.25fr)
    │
    ├── RequestComposer                     [LEFT]
    │   ├── SecurityCredentialPanel
    │   ├── StageSelector                  ← horizontal segmented (R2)
    │   ├── PolicySelector + SecurityPolicyStatus
    │   ├── SourceStack                    ← compact cards (R2)
    │   ├── ToolRequestSection             (stage=tool_request only)
    │   ├── TechnicalMeter
    │   ├── ViolationsList
    │   └── EvaluateCTA
    │
    └── EvaluationInspector                [RIGHT, sticky]
        ├── RuntimeHeader
        ├── EvidenceTrace                  ← NEW
        │   SOURCE─RULE─MODEL─JUDGE─DECISION
        │
        ├── [state=idle]    InspectorIdle
        ├── [state=loading] InspectorRunning
        ├── [state=error]   InspectorError
        │
        └── [state=result]  layout order ≠ reveal order (D13)
            │  DOM layout (top→bottom, always this position):
            ├── DecisionHero       ← fixed position; hidden until t≈2.2s reveal
            ├── InsightGrid        ← below DecisionHero in DOM
            │   ├── FindingsCascade (left or full-width)
            │   └── DetectorSection (DetectorChain)
            └── ExecutionTrace     ← NEW (settles last)
            │
            │  Reveal animation order (presentation layer):
            │  t≈0.0s EvidenceTrace result presentation
            │  t≈0.2s FindingsCascade (stagger)
            │  t≈0.8s DetectorChain (elapsed_ms reveal)
            │  t≈1.8s EvidenceTrace rail reaches DECISION
            │  t≈2.2s DecisionHero unmasks ← CLIMAX
            │  t≈3.2s ExecutionTrace stagger
```

### 2.2 Grid

```css
.sandbox-workbench-grid {
  grid-template-columns: minmax(300px, 0.75fr) minmax(500px, 1.25fr);
  gap: 20px;
  align-items: start;
}
```

Right pane sticky, `top: 24px`. Below 1100px: single column, right pane
`order: -1` (result before form — existing behavior kept).

## 3. Left Pane: Request Composer

Primary presentation goal at 1920×1080: in the `user_input + 3 sources`
scenario, the Evaluate CTA is easy to find in the initial working viewport.
Extended scenarios such as `tool_request` may scroll naturally; do not compress
font sizes, spacing, or control hit areas to force zero scroll.

### 3.1 SecurityCredentialPanel

Visual upgrade of `CapabilitySessionPanel`. Interface unchanged (`hasToken: boolean`).

States:
- `empty`: password input + description text
- `held`: input hidden; `TOKEN HELD · 令牌已持有` mono badge (accent color);
  panel tinted with `--console-accent-soft`; ClearButton enabled
- `rejected`: empty + Alert (requiresNewCapability)

CSS: `.workbench-credential-panel`, `.workbench-credential-panel--held`,
`.workbench-credential-status`

### 3.2 StageSelector (R2: horizontal segmented)

**Three horizontal tabs, not vertical cards.** Saves ~60px vertical space.

```
┌────────────────────────────────────────┐
│  user_input │ tool_request │ model_output │
└────────────────────────────────────────┘
  [description of selected stage below]
```

- Selected tab: accent border-bottom + accent text
- Description line below tabs: Chinese one-liner for selected stage

| stage | Chinese one-liner |
|---|---|
| `user_input` | 评估用户输入内容，检测注入与越权意图 |
| `tool_request` | 评估工具调用请求，检测参数劫持与作用域滥用 |
| `model_output` | 评估模型输出内容，检测敏感数据泄露与输出操纵 |

Radio semantics preserved: `<fieldset>` + `<legend>` + `<label>`+`<Radio>`.
CSS: `.workbench-stage-tabs`, `.workbench-stage-tab`, `.workbench-stage-tab--selected`,
`.workbench-stage-desc`

### 3.3 PolicySelector + SecurityPolicyStatus

Two compact cards side by side (flex row). Below them: a read-only
SecurityPolicyStatus badge showing the security property of the selected policy.

**PolicyCard:**
- policy ID in mono (e.g. `balanced.v1`)
- key differentiator: `平衡 / 严格`
- Selected: accent border + soft fill

**SecurityPolicyStatus (read-only, no toggle):**
Shows a fixed security property for each policy, derived from the repository's
existing authoritative policy definition / metadata. If structured metadata is
unavailable, the frontend mapping may only reflect verified existing policy
semantics; it must not create a new security guarantee.
The example below is illustrative; its wording must come from that authoritative
source rather than from a newly invented frontend claim.
This is a read-only informational label, never a toggle.

```
POLICY: sandbox-security-strict.v1
🔒 FAIL-CLOSED · 全量检测器 · 拒绝优先
```

CSS: `.workbench-policy-status` — styled as a compact mono info chip, not
an interactive control. No `role="switch"`, no `aria-checked`.

### 3.4 SourceStack (R2: compact)

Each `SourceCard` uses compact layout to reduce vertical height.

```
SourceCard (border, 10–12px radius)
├── header: [src-0 chip] [source-type select] [media-type select] [size] [×]
└── body:   Textarea rows=2 (monospace)
```

- All metadata in one header row (compact selects, no separate labels)
- `rows=2` instead of `rows=3`
- Size shown as byte count (muted, mono) after value entry
- Screen reader labels via `aria-label` on each select

CSS: `.workbench-source-card`, `.workbench-source-card__header`,
`.workbench-source-card__id`

`source_id`, `provenance_ref`, and all state logic unchanged.

### 3.5 TechnicalMeter

Props unchanged: `usedBytes`, `limitBytes`. Visual upgrade only.

```
[track 4px ──────────────░░░░░] 187432 / 524288 B
                           ↑ fill accent → critical red >100%
```

Warning text at >90%: `接近上限` in `--console-severity-medium`.
CSS: `.workbench-byte-meter`, `.workbench-byte-meter__fill`

### 3.6 EvaluateCTA

```
idle (no violations): [  开始评估  ]  ← full accent primary
blocked (violations): [  开始评估  ]  ← disabled muted
submitting:           [  ⟳ 评估中...  ]  ← Ant Design loading prop
```

CSS: `.workbench-evaluate-btn`

## 4. Right Pane: EvaluationInspector

Single component managing exclusive render states.

### 4.1 RuntimeHeader

Always visible above the state-dependent content.

```
EVALUATION RUNTIME  [SIMULATION badge]  [stage chip]  [policy chip]
```

- `EVALUATION RUNTIME` — eyebrow style (mono, uppercase, muted)
- `SIMULATION / 仿真` — accent pill (existing `.sandbox-simulation-badge`)
- Stage + policy chips appear once a decision exists (mono, muted border)

CSS: `.workbench-runtime-header`

### 4.2 EvidenceTrace (always visible, state-driven)

See §5 for full design. Summary of states:

- `idle`: rail at ~15% opacity; nodes faintly visible; no animation
- `loading`: rail and nodes stay **static** at ~15% opacity (same as idle);
  no per-node pulse, no progressive lighting; only EVALUATING badge and
  generic shimmer rows communicate "evaluation in progress"
- `result`: presentation-layer reveal starts **only after API returns**;
  SOURCE→RULE→MODEL→JUDGE→DECISION animates in sequence (§7)
- `settled`: each node shows execution-status color (see §5.3); no animation

### 4.3 State: idle

```
InspectorIdle (SpotlightSurface)
├── .console-panel
├── icon: RadarChartOutlined (muted, 32px)
├── "等待评估"
├── "配置左侧请求并提交，判定结果将在此呈现。"
└── EvidenceTrace (idle state)
```

### 4.4 State: loading

```
InspectorRunning (SpotlightSurface)
├── .console-panel
├── EVALUATING badge (pulsing)
├── EvidenceTrace (loading state — static, low opacity, NO fake detector IDs)
└── three type rows (rule · local_model · external_judge) with shimmer
    NO detector IDs, NO progress bars, NO fake percentages
```

### 4.5 State: error

Alert + retry Button. Unchanged from R1. No new components.

### 4.6 State: result

See §7 for full reveal sequence. Final **DOM layout** (top-to-bottom):

```
RuntimeHeader
EvidenceTrace (settled, execution-status colors)
─────────────────────────────────────
DecisionHero  ← FIXED POSITION, always visible location
              (opacity:0 initially; unmasks at t≈2.2s during reveal)
─────────────────────────────────────
InsightGrid (2 columns, below DecisionHero)
 FindingsCascade (left) │ DetectorSection (right)
─────────────────────────────────────
ExecutionTrace (settled, at bottom)
```

**Layout vs reveal**: DecisionHero is always at its final DOM position
(second block after EvidenceTrace), ensuring it dominates the 1920×1080
viewport. Its entrance animation (opacity+spring) unmasks it last during
the presentation sequence, creating the climax effect.

## 5. EvidenceTrace Design

### 5.1 Purpose and visual principle

EvidenceTrace expresses the causal chain of a security evaluation:

```
SOURCE ──── RULE ──── MODEL ──── JUDGE ──── DECISION
```

It is **not** a progress bar, **not** a live streaming indicator, and
**not** a flowchart. It is a thin technical rail that explains causality
through presentation-layer animation after API data is received.

Visual rules:
- Thin rail (2–3px) connecting small nodes (~8px circles)
- Low-opacity idle state — structure hint only, not attention-grabbing
- Cyan accent only on active/completed segments
- Precise mono labels below nodes
- Minimal controlled glow only at the DECISION node during climax
- No persistent pulse after settle

### 5.2 Node mapping

| Node | Label | Derives from |
|---|---|---|
| SOURCE | `source` | `contentItems.length` sources submitted |
| RULE | `rule` | detector_runs where `detector_kind="rule"` |
| MODEL | `model` | detector_runs where `detector_kind="local_model"` |
| JUDGE | `judge` | detector_runs where `detector_kind="external_judge"` |
| DECISION | `decision` | `verdict` + `action` |

If no detectors of a given kind exist in `detector_runs`, the node renders
at reduced opacity (muted) indicating that stage was not activated by
the current policy. It is never hidden — absence is information.

### 5.3 States

**idle**: All nodes and rail at `opacity: 0.15`. No animation. Faint structure hint.

**loading**: Nodes and rail stay **static** at `opacity: 0.15`. No pulse, no
progressive lighting, no per-node animation. The EVALUATING badge and shimmer
rows (in InspectorRunning) communicate "evaluation in progress". EvidenceTrace
must never imply real detector execution is happening step by step.

**result presentation** (starts only after API returns — see §7 for timing):
- t≈0.0s: SOURCE node lights **cyan** (executed)
- t≈0.2s: rail draws SOURCE→RULE
- t≈0.6s: RULE node lights — **execution status color** (see settled table)
- t≈0.9s: rail continues to MODEL; MODEL node lights — execution status color
- t≈1.3s: rail continues to JUDGE; JUDGE node lights — execution status color
- t≈1.8s: rail reaches DECISION node; DECISION node brief glow then settles
  to **verdict/action color** (the only node that uses risk semantics)

**settled** — node color table (execution status, not risk level):

| Status | Color token | When |
|---|---|---|
| Executed without error | `--console-accent` (cyan) | status = matched or no_match |
| Timeout | `--console-severity-medium` (amber) | status = timeout |
| Execution error | `--console-severity-high` (orange) | status = failed or invalid_result |
| Skipped / not used | `--console-muted` | status = skipped, or no detectors of this kind |

**DECISION node is the only exception**: it shows verdict/action semantics:
- deny → `--console-action-deny` (red)
- allow → `--console-action-allow` (green)
- indeterminate → `--console-muted`

**Key rule**: RULE/MODEL/JUDGE node colors reflect whether execution completed
successfully, NOT whether risk was found. A RULE detector that matched (found
risk) still shows cyan — it executed correctly. Risk severity is expressed
solely by FindingsCascade and DecisionHero, not by trace node color.

### 5.4 CSS

```css
.workbench-evidence-trace          /* flex row, align-items center */
.workbench-evidence-trace__rail    /* connecting lines between nodes */
.workbench-evidence-trace__node    /* 8px circle */
.workbench-evidence-trace__label   /* mono, 0.65rem, below node */
```


## 6. ExecutionTrace Design

### 6.1 Purpose

ExecutionTrace answers: "整个 evaluation lifecycle 经历了哪些步骤？"

It complements DetectorChain (which answers per-detector timing) by
providing a higher-level lifecycle view. It is positioned at the bottom
of the result pane, settling last — it is the audit/explanation layer
for a reviewer who wants to understand the full sequence.

### 6.2 Derivable steps (real data only)

| Step | Label | Derivation |
|---|---|---|
| REQUEST_RECEIVED | 请求接收 | Always present; `request_id`, `stage`, submitted timestamp |
| SOURCES_BOUND | 来源绑定 | `contentItems.length` sources; total byte count from TechnicalMeter |
| RULE_EVALUATION | 规则检测 | detector_runs where `detector_kind="rule"`, count + status summary |
| MODEL_EVALUATION | 模型推理 | detector_runs where `detector_kind="local_model"` |
| JUDGE_EVALUATION | 外部评审 | detector_runs where `detector_kind="external_judge"` |
| POLICY_REDUCTION | 策略归约 | `policy_profile_id` → `verdict` + `action` + `risk_level` |
| JUDGMENT_COMPLETE | 判定完成 | `decision_id`, `evaluation_mode`, `created_at` |

**Rule**: If no detectors of a kind ran (count=0 or all skipped), that step
is shown as `SKIPPED` with muted styling. The step is never hidden.

No step is shown without a real derivation. No invented "chain of thought"
or model internal steps. No fake processing times for non-detector steps.
`decision_id` is displayed as an opaque value; the UI must not assume a prefix,
hash, or other identifier format.

### 6.3 Visual design

A vertical timeline (or compact horizontal row on wide viewports):

```
◉ REQUEST_RECEIVED    req-abc…  · stage: tool_request · policy: balanced.v1
◉ SOURCES_BOUND       3 sources · 14 866 B
◉ RULE_EVALUATION     3 run · 1 matched · 39 ms
◉ MODEL_EVALUATION    2 run · 1 matched · 998 ms
◉ JUDGE_EVALUATION    1 timeout · 1840 ms
◉ POLICY_REDUCTION    balanced.v1 → risk_detected · deny · critical
◉ JUDGMENT_COMPLETE   decision_id: ... · simulation
```

Each row:
- Node dot (8px) — color by outcome (cyan=ok, amber=partial, red=error/timeout)
- Step label (mono, uppercase, small)
- Detail (mono, muted, truncated with title for full value)

CSS: `.workbench-execution-trace`, `.workbench-trace-step`,
`.workbench-trace-step--ok / --warn / --error / --skipped`

### 6.4 Settle timing

ExecutionTrace enters at t≈3.x after DecisionHero (§7). Steps stagger
in top-to-bottom at 60ms intervals via CALM_SPRING. Under reduced motion:
all steps appear instantly after decision is visible.

## 7. Result Reveal Sequence (R2 — Decision as Climax)

> **Honesty rule**: API returns all data at once. Every timed reveal below
> is a comprehension/storytelling layer. No animation implies live streaming.
> Code comments must confirm this. No reveal may show fake intermediate state.

### 7.1 Loading phase (pre-result)

```
EVALUATING badge (CSS pulse — workbench-pulse-badge)
EvidenceTrace: completely static, low opacity (~0.15) (no node pulse,
              no progressive lighting, no per-node animation)
3 shimmer rows: rule · local_model · external_judge  (type labels only,
               NO detector IDs, NO progress)
DecisionHero: not yet in DOM (rendered only when decision !== null)
```

**EvidenceTrace during loading is intentionally inert.** Only the EVALUATING
badge and shimmer rows communicate that evaluation is in progress.

### 7.2 Layout vs reveal decoupling

All result-state DOM elements mount simultaneously when `decision` arrives.
DecisionHero is at its **fixed visual position** (second block after
EvidenceTrace) from the moment it mounts. Its initial CSS state is
`opacity: 0; transform: scale(0.95)` so it is spatially reserved but
invisible. The reveal sequence uses animation to uncover it last.

The relative reveal order is the presentation contract. The illustrative
timing values below are visual tuning targets, not behavioral or test
contracts, and may be adjusted slightly during implementation and visual QA.

```
API returns → decision state set → all result components mount at once
              (DecisionHero is in DOM at final position, but opacity:0)
│
t=0.0s  EvidenceTrace switches to result presentation mode
        SOURCE node transitions to cyan

t=0.2s  FindingsCascade reveals (components already in DOM)
        severity-ordered stagger, 0.08s per item
        EvidenceTrace: rail segment SOURCE→RULE draws

t=0.6s  EvidenceTrace: RULE node transitions to execution-status color
        rail segment RULE→MODEL draws

t=0.8s  DetectorChain elapsed_ms-proportional reveal begins
        EvidenceTrace: MODEL node transitions

t=1.3s  EvidenceTrace: JUDGE node transitions
        rail reaches JUDGE→DECISION segment

t=1.8s  EvidenceTrace: DECISION node brief glow then settles to verdict color
        ← evidence chain visual complete
        ← viewer attention drawn upward toward DecisionHero position

t=2.2s  DecisionHero UNMASKS (opacity 0→1, scale 0.95→1)
        verdictSpring(risk_level) drives the entrance spring
        pulse ring expands once, fades (0.9s easeOut, no loop)
        verdict / action / risk_level large ValueTags land
        SpringNumber metrics settle

t=3.2s  ExecutionTrace steps stagger in, 60ms each

t≈4.0s  All settled. No loops. No continuous flash.
```

The cinematic presentation target is approximately 3–4s total. DecisionHero
stays at its fixed upper position and unmasks last for the climax effect.

### 7.3 Reduced motion

API returns → all result content immediately visible at full opacity.
No delays, no spring travel, no pulse, no trace animation.
EvidenceTrace shows settled state instantly with execution-status colors.
DecisionHero appears at full opacity immediately (no unmask delay).
Role="status" fires immediately for screen readers.

### 7.4 Re-submit behavior

On new submission: Inspector returns to loading state.
Previous result is replaced, not layered. No accumulation.

## 8. DecisionHero Composition

### 8.1 Relationship to VerdictHero

`VerdictHero` from Showcase is promoted and used as the core rendering
engine. A thin Workbench wrapper adds context above and below it.

VerdictHero already provides:
- verdictSpring-driven entrance
- pulse ring (one expand, no loop)
- verdict / action / risk_level large ValueTags
- findings count / detectors run / elapsed ms SpringNumbers

### 8.2 Workbench wrapper additions

```
.workbench-decision-hero  (console-panel, extra top padding for emphasis)
│
├── [above VerdictHero]
│   ├── stage chip    (mono, muted border)
│   └── policy chip   (mono, muted border)
│
├── VerdictHero  active={true}  ← core rendering
│
└── [below VerdictHero]
    ├── collapsible: decision_id (mono, truncated) + request_id
    ├── evaluation_mode chip
    ├── "本结果仅为模拟评估，不可用于实际拦截。" (warning text)
    └── [if verdict=no_detected_risk] Alert: 未检出风险 ≠ 安全
```

### 8.3 Information hierarchy

At 1920×1080, a viewer 3 meters away must read within 3 seconds:

1. **Verdict** — `risk_detected` / `no_detected_risk` / `indeterminate`
2. **Action** — `deny` / `allow` / `alert` / `ask`
3. **Severity** — `critical` / `high` / `medium` / `low` / `info`

These three are rendered as large ValueTags (font-size ≥ 1.1rem, min-height
≥ 32px) by VerdictHero. No changes needed to VerdictHero internals.

### 8.4 No invented fields

`confidence` is a per-finding field, not a per-decision field. DecisionHero
must not display a fake decision-level confidence value.

---

## 9. Motion Design

### 9.1 Animation inventory

| Moment | Component | Spec |
|---|---|---|
| EvidenceTrace result draw | CSS transition / Motion | rail segments + node transitions in sequence per §7 |
| DECISION node glow | Motion | opacity+scale 1 pulse at t≈1.8s, 0.6s, **no loop** |
| EVALUATING badge (loading only) | CSS keyframe | `workbench-pulse-badge` 1.4s ease infinite; stops when result arrives |
| Shimmer rows (loading only) | CSS keyframe | `workbench-shimmer` 1.5s linear infinite; stops when result arrives |
| FindingsCascade reveal | MOMENTUM_SPRING, 0.08s stagger | existing component; opacity controlled by result state |
| DetectorChain reveal | elapsed_ms schedule | existing component; starts at t≈0.8s |
| DecisionHero **unmask** | `verdictSpring(risk_level)` | existing VerdictHero; opacity 0→1 at t≈2.2s from fixed position |
| DecisionHero pulse ring | 0.9s easeOut, no loop | existing VerdictHero |
| ExecutionTrace steps | CALM_SPRING, 60ms stagger | new component; t≈3.2s |
| SpotlightSurface glow | SHOWCASE_SPOTLIGHT_SPRING | idle + loading states only |
| SourceCard enter | CALM_SPRING | new card add |

**EvidenceTrace during loading: no animation.** It is completely static at
low opacity (~0.15): no node pulse and no progressive lighting. Only the
EVALUATING badge and loading shimmer rows animate.

### 9.2 What must not animate after settle

No loops. No continuous pulse. No permanent glow. After the presentation
settles, everything is static and stable for presenter explanation.

### 9.3 Reduced motion contract

All reveal gates are canceled immediately and reveals collapse to instant
opacity. Delays = 0. No spring travel.
No pulse ring. No trace draw. No shimmer. No glow pulse.
All content immediately visible at full opacity.

### 9.4 CSS keyframes (appended to app.css)

```css
@keyframes workbench-pulse-badge {
  0%, 100% { opacity: 1; }  50% { opacity: 0.55; }
}
@keyframes workbench-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
/* Loading-only keyframes are disabled under prefers-reduced-motion: reduce */
```

## 10. CSS Architecture

All new rules appended to `app.css`. No new stylesheet. No new `:root` tokens.
All color values must reference existing `var(--console-*)`.

### 10.1 New class inventory

```
/* Left pane */
.workbench-credential-panel / --held / __status
.workbench-stage-tabs / __tab / __tab--selected / __desc
.workbench-policy-status               ← read-only badge (was toggle, now removed)
.workbench-source-card / __header / __id
.workbench-byte-meter / __fill
.workbench-evaluate-btn

/* Right pane structure */
.workbench-runtime-header
.workbench-inspector-idle / __hint-chips
.workbench-inspector-running
.workbench-evaluating-badge            ← CSS keyframe
.workbench-shimmer-row                 ← CSS keyframe

/* EvidenceTrace */
.workbench-evidence-trace / __rail / __node / __label  /* loading: static, low opacity */

/* DecisionHero */
.workbench-decision-hero / __context-chips / __meta

/* InsightGrid */
.workbench-insight-grid                ← 2-column flex/grid below Decision

/* ExecutionTrace */
.workbench-execution-trace / __step / __step--ok / --warn / --error / --skipped
.workbench-section-eyebrow
```

### 10.2 Grid override (only existing class change)

```css
.sandbox-workbench-grid {
  grid-template-columns: minmax(300px, 0.75fr) minmax(500px, 1.25fr);
}
```

### 10.3 Color literal gate

No raw `#rrggbb` or `rgba()` values outside `:root`. All new CSS must pass
`tests/repository/frontend-console-theme-literals.spec.ts`.

---

## 11. Accessibility

All GENERAL-005 contracts preserved:

| Contract | Where |
|---|---|
| `role="status"` + `aria-live="polite"` on decision | DecisionHero wrapper |
| `role="alert"` on error | InspectorError unchanged |
| Token never re-rendered to DOM | SecurityCredentialPanel interface unchanged |
| `type="password"` on token input | Unchanged |
| Reduced motion | `useReducedMotion()` in page; all components support it |
| Keyboard: all controls reachable and operable | `<label>` wrappers on stage/policy tabs |
| Focus ring: 2px `--console-accent` | Inherited from global theme |
| Contrast ≥ 4.5:1 | All text on `--console-surface` already verified |

New additions:
- `aria-label="评估检查器"` on EvaluationInspector section
- `aria-busy="true"` on Inspector during loading
- EvidenceTrace nodes: `aria-hidden="true"` (decorative); settled status
  communicated via DecisionHero role="status" text, not trace color alone
- ExecutionTrace rows: semantic `<dl>` or `<ol>` structure; each step
  readable as text without animation
- Shimmer rows: `aria-hidden="true"`
- RuntimeHeader chips: `aria-hidden="true"` (decorative duplication of
  information already in DecisionHero)
- SecurityPolicyStatus: `role="status"` forbidden (not a live region);
  plain `<p>` or `<div>` with accessible text suffices
- StageSelector: `<fieldset>` + `<legend>` preserved; tab layout uses
  `<label>` wrappers around existing `<Radio>` components

## 12. Test Plan

### 12.1 Existing tests — must remain green (semantics unchanged)

```
frontend/src/pages/sandbox-security-workbench.page.spec.tsx
frontend/src/components/sandbox-security/capability-session-panel.spec.tsx
frontend/src/components/sandbox-security/evaluation-request-form.spec.tsx
frontend/src/components/sandbox-security/decision-rendering.spec.tsx
frontend/src/pages/sandbox-security-privacy.spec.tsx
tests/repository/frontend-console-theme-literals.spec.ts
```

DOM query updates permitted; no semantic assertion may be weakened.

### 12.2 New tests required

| Test | File | What it covers |
|---|---|---|
| Inspector state machine | `workbench.page.spec.tsx` | idle→loading→result/error |
| EvidenceTrace node mapping | `workbench.page.spec.tsx` | correct nodes present; aria-hidden on nodes |
| EvidenceTrace loading — no fake IDs | `workbench.page.spec.tsx` | shimmer rows have no detector IDs or % values |
| Reveal order | `workbench.page.spec.tsx` | Assert DecisionHero is before InsightGrid in DOM; normal motion starts DecisionHero pre-reveal; Findings/Detectors activate before its reveal gate; DecisionHero eventually becomes visible; reduced motion cancels all reveal gates immediately |
| Result fully visible eventually | `workbench.page.spec.tsx` | after API mock resolves, all result info present |
| Reduced motion — immediate visibility | `workbench.page.spec.tsx` | no delays; all content visible on first render |
| DecisionHero role=status preserved | `decision-rendering.spec.tsx` | live region fires correctly |
| ExecutionTrace real data only | `workbench.page.spec.tsx` | no step rendered without real derivation |
| SecurityPolicyStatus read-only | `evaluation-request-form.spec.tsx` | no role=switch, no aria-checked, not passed to service; mapping uses authoritative policy definition/metadata or verified existing semantics only |
| Stage tab selection | `evaluation-request-form.spec.tsx` | tab click updates stage; tool fields appear/disappear |
| Source card compact | `evaluation-request-form.spec.tsx` | add/remove works; rows=2 |
| Color literal gate | `frontend-console-theme-literals.spec.ts` | no raw hex/rgba in new CSS |
| InsightGrid 2-col layout | `workbench.page.spec.tsx` | findings + detectors co-present in result |

**Removed tests** (FailClosedToggle — D2 removed):
- toggle state change
- toggle does not pass to service call
- role=switch / aria-checked behavior

**Presentation timing**: do not assert fixed millisecond delays. Assert
relative activation and visibility states instead: after a mock API resolves,
(a) loading does not show fake progress, (b) DecisionHero starts pre-reveal
under normal motion, (c) Findings/Detectors presentation activation precedes
the DecisionHero reveal gate, (d) result content is eventually fully visible,
and (e) reduced motion cancels every reveal gate and shows everything
immediately.

### 12.3 Visual QA checklist (1920×1080 primary)

Captures at: 1920×1080 (idle, loading, result), 1440×900 (result)

- [ ] First-glance hierarchy: EvidenceTrace (thin rail, not dominant) →
      DecisionHero at fixed upper-right position (visually dominant after unmask)
- [ ] During reveal: EvidenceTrace rail draws, Findings/Detectors appear first,
      then DecisionHero unmasks as visual climax — correct order confirmed
- [ ] Landing / Showcase consistency: same product family
- [ ] Left/right visual balance: right pane clearly heavier
- [ ] Primary 1920×1080 scenario (`user_input` + 3 sources): Evaluate CTA is
      easy to find in the initial working viewport
- [ ] Extended scenarios such as `tool_request` may scroll naturally; do not
      compress font sizes, spacing, or control hit areas to force zero scroll
- [ ] Stage tabs: compact, all 3 readable
- [ ] Source cards: compact rows=2, header metadata inline
- [ ] EvidenceTrace: visible but not attention-grabbing at idle
- [ ] EvidenceTrace settled: status colors match detector outcomes
- [ ] DecisionHero: verdict/action/severity readable at projector distance
- [ ] Findings: severity-ordered, stripe visible, clickable
- [ ] DetectorChain: elapsed_ms rhythm legible (rule fast, model slow, judge timeout)
- [ ] ExecutionTrace: all steps present, readable at small size
- [ ] Glow: only at DECISION node settle moment, then gone
- [ ] No generic Ant Design feel; no game HUD
- [ ] Projector contrast: ≥ 4.5:1 for all critical text

## 13. Engineering Impact

### 13.1 Files modified

| File | Change |
|---|---|
| `SandboxSecurityWorkbenchPage.tsx` | Layout refactor; EvaluationInspector; reveal sequence timing |
| `app.css` | Append `.workbench-*` block; override grid proportion; 2 loading keyframes |
| `CapabilitySessionPanel.tsx` | Held-state visual; interface unchanged |
| `EvaluationRequestForm.tsx` | StageSelector split out; PolicySelector split out |
| `ContentItemRow.tsx` | SourceCard compact layout; rows=2 |
| `RequestLimitMeter.tsx` | TechnicalMeter visual; props unchanged |
| `DecisionSummaryPanel.tsx` | Thin wrapper only; VerdictHero does main work |

### 13.2 Files created

| File | Responsibility |
|---|---|
| `StageSelector.tsx` | Horizontal tab segmented selector |
| `PolicySelector.tsx` | 2 PolicyCards + SecurityPolicyStatus (read-only) |
| `EvaluationInspector.tsx` | State machine: idle / loading / error / result |
| `EvidenceTrace.tsx` | SOURCE→RULE→MODEL→JUDGE→DECISION causal rail |
| `ExecutionTrace.tsx` | Lifecycle steps derived from real decision data |

### 13.3 Promoted imports (no file moves)

```ts
import { VerdictHero }      from "./showcase/VerdictHero";
import { FindingsCascade }  from "./showcase/FindingsCascade";
import { DetectorChain }    from "./showcase/DetectorChain";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { SpringNumber }     from "./showcase/SpringNumber";
import { CALM_SPRING, MOMENTUM_SPRING, verdictSpring }
                            from "./showcase/showcase-motion";
```

### 13.4 Explicitly unchanged

- `shared/` types, contracts, limits
- `sandbox-security-service.ts`, `api-client.ts`, `sandbox-security-limits.ts`
- All showcase component files (only imported from, never edited)
- All other pages, layouts, navigation, ConsoleLayout, AppProviders
- Backend, engine, OpenClaw

## 14. Acceptance Criteria

1. First glance: Workbench reads as the same product family as Showcase / Landing.
2. EvidenceTrace is present in all states; idle and loading states are
   completely static at low opacity, with no node pulse or progressive lighting.
3. EvidenceTrace settled: RULE/MODEL/JUDGE nodes show **execution-status colors**
   (cyan=completed, amber=timeout, orange=error, muted=skipped). DECISION node
   alone shows verdict/action semantics. Risk severity never colors trace nodes.
4. DOM layout: EvidenceTrace → DecisionHero → InsightGrid → ExecutionTrace.
   DecisionHero is at fixed upper position and starts in a pre-reveal state until
   its reveal gate opens.
5. Reveal animation order: EvidenceTrace → Findings → Detectors → DecisionHero
   unmask (climax) → ExecutionTrace. Findings/Detectors presentation activation
   precedes the DecisionHero reveal; DecisionHero is the last to reveal while
   remaining physically above Findings/Detectors in the DOM. Exact millisecond
   values are visual tuning targets, not behavioral or test contracts.
6. DecisionHero is the dominant visual element after unmask; verdict/action/severity
   readable at projector distance within 3 seconds.
7. Loading state: EvidenceTrace stays completely static at low opacity (no
   node pulse or progressive lighting); no detector IDs, no fake progress, and
   no fake percentages are shown in shimmer rows.
8. ExecutionTrace: every step derives from real `SandboxSecurityDecision` data.
   No fabricated execution events.
9. SecurityPolicyStatus: read-only label; no toggle, no `role="switch"`.
   Its value comes from the repository's authoritative policy definition /
   metadata, or from verified existing policy semantics when structured
   metadata is unavailable; it must not create a new security guarantee.
10. All existing privacy tests pass: token not in DOM, content not in URL/storage.
11. `role="status"` on DecisionHero fires; screen reader announces verdict.
12. Reduced motion: all reveal gates are canceled immediately and all result
    content is visible with no delays; DecisionHero appears at full opacity
    immediately (no unmask delay).
13. Color literal gate: no raw hex/rgba in new CSS or TSX files.
14. In the primary `user_input + 3 sources` scenario, the Evaluate CTA is easy
    to find in the initial 1920×1080 working viewport. Extended scenarios such
    as `tool_request` may scroll naturally; typography, spacing, and control
    usability must not be compressed to force zero scroll.
15. Build passes; TypeScript no new errors; all tests pass.
16. No backend, shared contract, engine, or Console page changed.

---

*Spec status: DRAFT_PENDING_USER_REVIEW — R2*
*Self-review: see §15 below*
*Next step after approval: superpowers:writing-plans*

## 15. Spec Self-Review (R2.1)

Checklist run inline; all items resolved before commit.

| Check | Result |
|---|---|
| TBD / TODO / placeholder scan | ✅ None found |
| Architecture ↔ sections consistent | ✅ §2 tree matches §4.6 layout; layout≠reveal decoupled in both |
| FailClosedToggle fully removed | ✅ Removed from decisions, left pane, CSS, tests, criteria |
| EvidenceTrace in arch/motion/test/criteria | ✅ §4.2, §5, §9, §12.2, §14 |
| ExecutionTrace in arch/test/criteria | ✅ §6, §12.2, §14 |
| EvidenceTrace loading is static (no per-node pulse) | ✅ §4.2, §5.3, §7.1, §9.1 all confirm static |
| EvidenceTrace node colors = execution status only | ✅ §5.3 table + Key rule paragraph; DECISION node is the only exception |
| Layout/reveal decoupling documented | ✅ §2.1 tree, §4.6, §7.2 all state: DOM layout ≠ reveal order |
| One-shot API honesty intact | ✅ §7 honesty rule; §7.1 loading static; §7.2 "all components mount simultaneously" |
| No fabricated backend fields | ✅ §6.2 derivation table; §8.4 no fake confidence |
| Test plan matches new design | ✅ §12.2 has EvidenceTrace loading/node-color/layout tests |
| Acceptance criteria updated | ✅ 16 items; items 2–7 cover the R2.1 fixes |
| Reveal order test matches DOM/reveal contract | ✅ §12.2 asserts DecisionHero before InsightGrid in DOM, pre-reveal state, earlier Findings/Detectors activation, eventual visibility, and immediate reduced-motion gate cancellation |
| EvidenceTrace loading pulse cleanup | ✅ §4, §5, §7, §9, and CSS inventory require fully static low opacity; no legacy pulse keyframe or class remains |
| Motion target and timing contract | ✅ Design Contract and §7/§9 use approximately 3–4s total; timings are visual tuning targets, not behavioral/test contracts |
| SecurityPolicyStatus source authority | ✅ §3.3 and §14 require authoritative policy definition/metadata or verified existing semantics only; no new guarantee is invented |
| 1920×1080 acceptance scope | ✅ Primary `user_input + 3 sources` requires an easy-to-find CTA; extended `tool_request` scenarios may scroll naturally |
| Scope: frontend only | ✅ §13.4 confirmed |
| Design Contract v0.1 present | ✅ Standalone section |
| Q1 (InsightGrid max-height) resolved by D13 | ✅ DecisionHero now above InsightGrid; pushing-down concern eliminated |
