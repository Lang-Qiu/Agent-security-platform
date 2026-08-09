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
| D13 | Result reveal order: Evidence → Findings → Detectors → Decision climax (REVISED) |
| D14 | StageSelector: horizontal segmented, not 3 vertical cards (REVISED) |
| D15 | SourceStack: compact rows=2, inline controls for 1080p density (REVISED) |
| D16 | InsightGrid: Findings + Detectors side by side below DecisionHero (NEW) |
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
| Cinematic | evidence trace, detector chain, decision | 3s total sequence |

No loops after settle. No fake progress. No continuous pulse except during
active loading (EVALUATING badge). Reduced motion collapses all to instant opacity.

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
        └── [state=result]  (reveal sequence §7)
            ├── FindingsCascade            (t≈0.6s)
            ├── InsightGrid                (t≈1.0s)
            │   ├── DetectorSection (DetectorChain)
            │   └── [metadata strip]
            ├── DecisionHero               (t≈2.2s ← CLIMAX)
            └── ExecutionTrace             ← NEW (t≈3.x, settles)
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

Design goal at 1920×1080: all controls (Credential → Stage → Policy → Sources ×3
→ Meter → CTA) fit in one working context without forced vertical scroll.

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
Shows a fixed security property for each policy, derived from known policy semantics.
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

- `idle`: rail drawn at ~15% opacity; nodes faintly visible; no animation
- `loading`: rail at 40% opacity; active pulse on all nodes; EVALUATING
- `result`: presentation reveal animates SOURCE→RULE→MODEL→JUDGE→DECISION
  in sync with the broader result sequence (§7)
- `settled`: each node shows actual detector_kind status color; trace rests

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
├── EvidenceTrace (loading state — pulse, NO fake detector IDs)
└── three type rows (rule · local_model · external_judge) with shimmer
    NO detector IDs, NO progress bars, NO fake percentages
```

### 4.5 State: error

Alert + retry Button. Unchanged from R1. No new components.

### 4.6 State: result

See §7 for full reveal sequence. Final settled layout:

```
RuntimeHeader
EvidenceTrace (settled, status colors)
─────────────────────────────────────
FindingsCascade (full width)
─────────────────────────────────────
InsightGrid (2 columns)
 DetectorSection │ [metadata strip]
─────────────────────────────────────
DecisionHero  ← VISUAL CLIMAX
─────────────────────────────────────
ExecutionTrace (settled)
```

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

**idle**: All nodes and rail at `opacity: 0.15`. No animation. Faint structure.

**loading**: Rail at `opacity: 0.4`. All nodes pulse with a slow CSS keyframe
(`workbench-trace-idle-pulse`, 2s ease infinite). No detector-specific
lighting. Communicates "evaluation active", not real detector progress.

**result presentation** (see §7 for timing):
- t≈0.2s: SOURCE node lights cyan
- t≈0.4s: rail draws left-to-right from SOURCE to RULE
- t≈0.7s: RULE node lights (color = matched/no_match from runs)
- t≈0.9s: rail continues to MODEL
- t≈1.1s: MODEL node lights
- t≈1.3s: rail continues to JUDGE
- t≈1.5s: JUDGE node lights
- t≈1.8s: rail reaches DECISION; DECISION node briefly glows
- (decision climax begins at this moment — §7)

**settled**: All nodes show final status color (cyan=active, allow-green=no risk,
deny-red=risk, muted=skipped). Rail fully drawn. No animation.

### 5.4 CSS

```css
.workbench-evidence-trace          /* flex row, align-items center */
.workbench-evidence-trace__rail    /* connecting lines between nodes */
.workbench-evidence-trace__node    /* 8px circle */
.workbench-evidence-trace__label   /* mono, 0.65rem, below node */
```

`@keyframes workbench-trace-idle-pulse`: opacity 0.4 → 0.7 → 0.4, 2s ease infinite.
Disabled under `prefers-reduced-motion: reduce`.

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

### 6.3 Visual design

A vertical timeline (or compact horizontal row on wide viewports):

```
◉ REQUEST_RECEIVED    req-abc…  · stage: tool_request · policy: balanced.v1
◉ SOURCES_BOUND       3 sources · 14 866 B
◉ RULE_EVALUATION     3 run · 1 matched · 39 ms
◉ MODEL_EVALUATION    2 run · 1 matched · 998 ms
◉ JUDGE_EVALUATION    1 timeout · 1840 ms
◉ POLICY_REDUCTION    balanced.v1 → risk_detected · deny · critical
◉ JUDGMENT_COMPLETE   decision:sha256:9e04… · simulation
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
EVALUATING badge (CSS pulse)
EvidenceTrace: loading state (slow idle pulse, no detector IDs)
3 shimmer rows: rule · local_model · external_judge  (type labels only)
```

### 7.2 Result presentation sequence

```
API returns
│
t=0.0s  EvidenceTrace switches to result presentation
        SOURCE node lights cyan

t=0.2s  FindingsCascade mounts (below EvidenceTrace)
        severity-ordered stagger, 0.08s per item
        EvidenceTrace: rail draws SOURCE→RULE

t=0.6s  EvidenceTrace: RULE node lights (run status color)
        rail continues toward MODEL

t=0.8s  InsightGrid mounts:
        DetectorChain (left) — elapsed_ms-proportional reveal begins
        Metadata strip (right) — policy/stage mono labels appear

t=1.1s  EvidenceTrace: MODEL node lights
        rail continues toward JUDGE

t=1.4s  EvidenceTrace: JUDGE node lights
        DetectorChain fully settled

t=1.8s  EvidenceTrace: rail reaches DECISION node
        DECISION node brief local glow (one pulse, not loop)
        ← evidence chain is complete

t=2.2s  DecisionHero mounts ← VISUAL CLIMAX
        verdictSpring(risk_level) drives entrance
        pulse ring expands once, fades (0.9s easeOut, no loop)
        verdict / action / risk_level large ValueTags land
        SpringNumber metrics settle

t=3.2s  ExecutionTrace mounts
        steps stagger in top-to-bottom, 60ms each

t≈4.0s  All settled. No loops. No continuous flash.
```

Total sequence: ~4 seconds. Short, clear, one climax.

### 7.3 Reduced motion

API returns → all result content immediately visible at full opacity.
No delays, no spring travel, no pulse, no trace animation.
EvidenceTrace shows settled state instantly with status colors.
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
| EvidenceTrace idle pulse | CSS keyframe | `workbench-trace-idle-pulse` 2s ease infinite |
| EvidenceTrace result draw | CSS transition / Motion | rail segments fade+scale in sequence (§7) |
| DECISION node glow | Motion | opacity+scale 1 pulse, 0.6s, no loop |
| EVALUATING badge | CSS keyframe | `workbench-pulse-badge` 1.4s ease infinite |
| Shimmer rows | CSS keyframe | `workbench-shimmer` 1.5s linear infinite |
| FindingsCascade reveal | MOMENTUM_SPRING, 0.08s stagger | existing component |
| DetectorChain reveal | elapsed_ms schedule | existing component |
| DecisionHero entrance | `verdictSpring(risk_level)` | existing VerdictHero |
| DecisionHero pulse ring | 0.9s easeOut, no loop | existing VerdictHero |
| ExecutionTrace steps | CALM_SPRING, 60ms stagger | new component |
| SpotlightSurface glow | SHOWCASE_SPOTLIGHT_SPRING | existing component |
| SourceCard enter | CALM_SPRING | new card |

### 9.2 What must not animate after settle

No loops. No continuous pulse. No permanent glow. After t≈4s everything
is static and stable for presenter explanation.

### 9.3 Reduced motion contract

All reveals collapse to instant opacity. Delays = 0. No spring travel.
No pulse ring. No trace draw. No shimmer. No glow pulse.
All content immediately visible at full opacity.

### 9.4 CSS keyframes (appended to app.css)

```css
@keyframes workbench-trace-idle-pulse {
  0%, 100% { opacity: 0.4; }  50% { opacity: 0.7; }
}
@keyframes workbench-pulse-badge {
  0%, 100% { opacity: 1; }  50% { opacity: 0.55; }
}
@keyframes workbench-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
/* All three disabled under prefers-reduced-motion: reduce */
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
.workbench-evidence-trace / __rail / __node / __label
.workbench-trace-idle-pulse            ← CSS keyframe on node

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
| Reveal order | `workbench.page.spec.tsx` | FindingsCascade in DOM before DecisionHero |
| Result fully visible eventually | `workbench.page.spec.tsx` | after API mock resolves, all result info present |
| Reduced motion — immediate visibility | `workbench.page.spec.tsx` | no delays; all content visible on first render |
| DecisionHero role=status preserved | `decision-rendering.spec.tsx` | live region fires correctly |
| ExecutionTrace real data only | `workbench.page.spec.tsx` | no step rendered without real derivation |
| SecurityPolicyStatus read-only | `evaluation-request-form.spec.tsx` | no role=switch, no aria-checked; not passed to service |
| Stage tab selection | `evaluation-request-form.spec.tsx` | tab click updates stage; tool fields appear/disappear |
| Source card compact | `evaluation-request-form.spec.tsx` | add/remove works; rows=2 |
| Color literal gate | `frontend-console-theme-literals.spec.ts` | no raw hex/rgba in new CSS |
| InsightGrid 2-col layout | `workbench.page.spec.tsx` | findings + detectors co-present in result |

**Removed tests** (FailClosedToggle — D2 removed):
- toggle state change
- toggle does not pass to service call
- role=switch / aria-checked behavior

**Presentation timing**: do not assert fixed millisecond delays. Assert
that after a mock API resolves: (a) loading does not show fake progress,
(b) result content is eventually fully visible, (c) reduced motion shows
everything immediately.

### 12.3 Visual QA checklist (1920×1080 primary)

Captures at: 1920×1080 (idle, loading, result), 1440×900 (result)

- [ ] First-glance hierarchy: EvidenceTrace → Findings → Detectors → Decision dominates
- [ ] Landing / Showcase consistency: same product family
- [ ] Left/right visual balance: right pane clearly heavier
- [ ] 1080p: 3 sources visible without excessive scroll, Evaluate CTA discoverable
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
| `app.css` | Append `.workbench-*` block; override grid proportion; 3 keyframes |
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
2. EvidenceTrace is present in all states; idle state is visible but not attention-grabbing.
3. EvidenceTrace settled: node colors match actual `detector_kind` outcomes.
4. Result reveal order: Findings → InsightGrid → DecisionHero (climax) → ExecutionTrace.
5. DecisionHero is the final and dominant visual element; verdict/action/severity
   readable at projector distance within 3 seconds.
6. Loading state: no detector IDs, no fake progress, no fake percentages shown.
7. ExecutionTrace: every step derives from real `SandboxSecurityDecision` data.
   No fabricated execution events.
8. SecurityPolicyStatus: read-only label; no toggle, no `role="switch"`.
9. All existing privacy tests pass: token not in DOM, content not in URL/storage.
10. `role="status"` on DecisionHero fires; screen reader announces verdict.
11. Reduced motion: all result content immediately visible with no delays.
12. Color literal gate: no raw hex/rgba in new CSS or TSX files.
13. Three sources + all left-pane controls visible at 1920×1080 without forced scroll.
14. Build passes; TypeScript no new errors; all tests pass.
15. No backend, shared contract, engine, or Console page changed.

---

*Spec status: DRAFT_PENDING_USER_REVIEW — R2*
*Self-review: see §15 below*
*Next step after approval: superpowers:writing-plans*

## 15. Spec Self-Review (R2)

Checklist run inline; all items resolved before commit.

| Check | Result |
|---|---|
| TBD / TODO / placeholder scan | ✅ None found |
| Architecture ↔ sections consistency | ✅ §2 tree matches §3–6 components |
| FailClosedToggle fully removed | ✅ Removed from decisions, left pane, CSS, tests, criteria |
| EvidenceTrace in architecture/motion/test/criteria | ✅ §4.2, §5, §9, §12.2, §14 |
| ExecutionTrace in architecture/test/criteria | ✅ §6, §12.2, §14 |
| One-shot API honesty intact | ✅ §7 honesty rule, §12.2 loading-no-fake-progress |
| No fabricated backend fields | ✅ §6.2 derivation table; §8.4 no fake confidence |
| Test plan matches new design | ✅ FailClosed tests removed; EvidenceTrace/ExecutionTrace/SecurityPolicyStatus tests added |
| Engineering impact matches new components | ✅ EvidenceTrace.tsx + ExecutionTrace.tsx added; FailClosedToggle.tsx absent |
| Acceptance criteria updated for new reveal order | ✅ §14 item 4: Findings→InsightGrid→DecisionHero→ExecutionTrace |
| Scope: frontend only | ✅ §13.4 explicitly unchanged list confirmed |
| Design Contract v0.1 present | ✅ Standalone section with canvas/accent/glow/motion rules |

One open question for user confirmation:

> **Q1**: InsightGrid layout (§4.6 / §2.1): the spec places `FindingsCascade`
> full-width above a 2-column `InsightGrid` (DetectorChain + metadata strip),
> then `DecisionHero` below both. At narrow viewports or when findings are
> many, this could push DecisionHero far down. Should the fallback be:
> (a) collapse InsightGrid to single column and shrink FindingsCascade to
> a max-height scrollable area; or (b) user confirms this is acceptable
> for demo scenarios where findings are typically 2–4 items?

