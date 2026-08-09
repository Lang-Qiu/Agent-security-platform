# Agent Security Platform Product Landing Page Design Spec

## Status and scope

- Date: 2026-08-09
- Revision: v2.1, Visual Ambition Upgrade Final Refinement
- Status: FINAL_REFINEMENT_COMPLETE_PENDING_USER_APPROVAL
- Delivery type: documentation-only design artifact. This is an explicit exception
  to the repository RED/GREEN workflow; it changes no production behavior, API,
  shared contract, dependency, or Console route.
- Requirement source: the user's explicit Product Landing Page request takes
  precedence over the currently recorded sandbox-console sprint.
- Implementation authority: not granted. The user must explicitly approve this
  spec and its implementation plan before any Landing production code is written.
- Visual ambition revision: **70% premium restraint + 30% controlled
  spectacle**. This revision supersedes the earlier quiet-only visual ceiling;
  it does not relax product truth, accessibility, performance, routing, or
  Console-regression protections.

This document is the canonical design input for the requested public root
Landing Page. It intentionally does not overwrite the pre-existing, untracked
draft at "docs/superpowers/specs/2026-08-09-landing-page-design.md". That draft
is preserved as user work. Its sandbox-evaluation-demo narrative is narrower
than this request; this document defines the requested platform-wide
Discover -> Analyze -> Contain story.

## Visual ambition upgrade

This is a **visual-direction revision**, not a new product requirement. It
keeps the IA, page order, copy hierarchy, route boundary, semantic controls,
reduced-motion behavior, responsive fallback, and static-data rule intact.
The revision raises the Landing from a quiet security product page to a
cinematic product showcase with two intentional peaks: Hero establishes an
aspirational but credible operating surface; Runtime demonstrates a completed
security decision with weight.

Changed in this revision:

- Hero becomes a cinematic product surface with real-looking security chrome,
  authored evaluation metadata, detector state, policy state, evidence count, and embedded
  topology rather than a free-standing diagram.
- Runtime receives a causal, staged security sequence with depth, local bloom,
  scan, convergence, and decisive result reveal.
- Background, rails, and section transitions gain a constrained three-layer
  environment: background atmosphere, product surface, foreground accents.
- Product-like UI is directionally targeted at approximately 50-60% of the
  desktop narrative's visual evidence; conceptual visualization occupies the
  remaining 40-50%. This is composition guidance, not rendered-area scoring.
- Motion is divided into UI, narrative, and cinematic visualization tiers;
  only Hero and Runtime use the latter.
- A reference-specific Visual Fidelity Matrix and a screenshot-based visual
  acceptance gate become required delivery criteria.

## Design thesis

**Precision Agent Security is a cinematic control surface: quiet by default,
but capable of making an evidence-backed security decision feel consequential.**

The Landing Page should feel like the presentation layer of the existing
Security Operations Console, not a separate startup site. It uses large,
credible product-like evidence and an original runtime visualization to make
the platform feel real before a visitor reaches Console. Cyan remains a signal,
not decoration, but it is allowed to become light, depth, and directional
energy inside the two cinematic scenes. Motion explains a decision and directs
attention; it must never delay copy, obscure controls, or invent telemetry.

The signature move is a single original **evidence trace**. In Hero it is a
living product trace inside an active control surface. In Discover it becomes a
scan that illuminates attack-surface evidence; in Analyze it becomes an
inspection contour; in Runtime it converges at Policy and resolves a decision.
The motif creates continuity without requiring one literal cross-page DOM line
or copying a reference-site asset, graphic, source code, logo, or wording.

---

# A. Current Project Audit

## A.1 Technical stack and route architecture

| Area | Current state | Design consequence |
| --- | --- | --- |
| App | Vite 8 SPA, React 19.2, TypeScript 6 | Landing stays a React route inside the current app boundary. |
| Router | React Router 7.13, route objects in "frontend/src/app/routes.tsx" | The root can become Landing without changing existing Console child URLs. |
| UI library | Ant Design 6.3, global dark + compact ConfigProvider | Landing may use native presentation components; it must not look like an Ant dashboard. |
| Motion | Motion 13 is installed and used by the sandbox showcase | No animation package is justified. Use CSS first; use Motion only for topology, spotlight, and runtime state. |
| Styling | One global "frontend/src/styles/app.css"; no CSS Modules or Tailwind | Keep shared product-semantic tokens in the root token block; add a Landing-only stylesheet whose presentation tokens are scoped to `.landing-page`. |
| Tests | Vitest + Testing Library; router harness renders route objects | Route, semantic, link, reduced-motion, and isolation tests can be TDD-first without a new harness. |
| Assets | "frontend/public" has no product or font assets | Landing needs owned optimized Console screenshots and licensed self-hosted font assets. |

The root route currently renders ConsoleLayout and redirects its index route to
"/overview". The required public entry behavior is:

| URL | Required behavior |
| --- | --- |
| "/" | Render Product Landing Page without Console chrome. |
| "/console" | Redirect to the existing "/overview" Console entry. |
| Existing Console URLs | Keep "/overview", "/tasks", "/results/*", "/sandbox-security/*", and "/review-demo" unchanged. |

The safe route shape is a dedicated root Landing route, a "/console" redirect,
and a pathless parent route for existing ConsoleLayout children. It satisfies
the requested entry URL while preserving the URL semantics protected by
"metadata.md" and frontend instructions.

## A.2 Existing design system

The Console has a credible dark security foundation in
"frontend/src/styles/console-theme.ts" and the root token block of
"frontend/src/styles/app.css":

| Token family | Existing values and behavior | Landing treatment |
| --- | --- | --- |
| Canvas | #0d1520 background; #121c28 and #16222f surfaces | Reuse hue family; add a quieter near-black Landing canvas rather than changing Console colors. |
| Ink | #e4edf5, #8fa3b8, #7d92a8 hierarchy | Reuse for high-contrast dark presentation. |
| Accent | #22d3ee with soft #0f2a35 and strong #0e7490 | Cyan is active evidence, focus, and primary CTA only. |
| Semantics | critical red, high orange, medium amber, low blue, allow green, deny red | Keep exclusively for meaningful security states. |
| Borders | #1f2d3d, #2c3e52, #51708f | Translate into low-opacity Landing hairlines and focused outlines. |
| Radius | Ant token radius 6; older Console panels use 20-24px | Landing uses 6px default and 8px maximum for framed product surfaces. |
| Typography | Aptos / Segoe UI globally; JetBrains Mono / Fira Code in CSS | Landing extends the shared source locally and does not silently alter Console typography. |

Existing reusable visual vocabulary:

- Cyan status treatment, mono metadata, low-contrast grid, risk tags, and
  policy-decision terminology are appropriate source material.
- "SandboxSecurityShowcasePage" proves reduced-motion-aware detector sequence,
  pointer spotlight, and product-oriented animation primitives already exist.
- The showcase is not a direct Landing dependency. It is sandbox-specific,
  fixture-driven, and inside Console chrome. Reuse its accessibility and motion
  lessons, not its data model or demo claims.

## A.3 Current visual audit

Read-only Chrome captures at 1440x1000 and 390x844 showed:

- Desktop Console already communicates calm dark-security SaaS through slate
  canvas, cyan controls, compact metadata, thin borders, and operational density.
- The root title is "Agent Security Platform Console", which is wrong for a
  public Landing route.
- At 390px the full Console sider precedes main content, creating a long
  navigation block before the overview. Landing therefore needs its own compact
  navigation, not ConsoleLayout.
- The existing sandbox showcase has strong evidence-first visual language, but
  Console header and sider make it unsuitable as a public first impression.

Current weaknesses relevant to this requirement:

1. No public product entry, product navigation, or non-Console page shell.
2. Shared global CSS needs strict Landing isolation to avoid Console regression.
3. No bundled fonts or owned product media exist. High quality cannot depend on
   a browser having Geist, Inter, or Noto Sans SC locally installed.
4. Existing Console panels use large radii; Landing needs a smaller-radius
   presentation layer without refactoring Console panels.
5. Existing route tests assert the old root redirect and must be replaced, not
   weakened.

## A.4 Project and contract constraints

Landing is presentation-only:

- It performs no API request and never calls engines directly.
- It adds no API route, shared type, backend module, authentication state, or
  storage.
- Example event data is authored static content and marked "Illustrative
  topology" or "Product visualization", never presented as live telemetry.
- Screenshots are generated from the local Console only. No Linear, Wiz,
  Vercel, or third-party screenshot, logo, copy, or visual asset is used.
- Existing Console navigation, paths, data flow, and test assertions remain
  stable except for the deliberate root-route expectation.

The latest documented baseline records 326 frontend tests in
"docs/sprint-current.md". It was not rerun during this design phase because
local Node is v22.17.0, below the required v22.19.0, and "nvm" is unavailable
in the current PowerShell environment. This is an environment limitation, not
a test result.

---

# B. Reference Breakdown

## Research method

All three reference pages were opened in isolated headless Chrome and inspected
through Playwright / computed styles on 2026-08-09. Findings are time-sensitive:

- Linear: https://linear.app/
- Wiz: https://www.wiz.io/
- Vercel: https://vercel.com/

No reference asset was downloaded into the repository or proposed as a project
asset.

## B.1 Linear

### What to copy conceptually

- Product-first storytelling: a large believable product window closes Hero
  instead of an abstract illustration.
- A visual rhythm of one strong statement, large negative space, then one
  product context per chapter.
- Low-noise dark surfaces: near-black canvas, restrained 1px borders,
  metadata, and limited color inside meaningful product states.
- The inspected desktop story sections measured roughly 1,090-1,224px each.
  Each capability has room to feel like a product moment, not a feature tile.
- Observed desktop values: ~1,436px content rail at 1,440px viewport, 46px
  outer gutters, 64px / 64px Hero type, 48px / 48px chapter heading, 73px
  fixed blurred header.
- Mobile confidence: preserve a crop of a large product visual rather than
  shrinking it into illegibility. Observed mobile used 16px gutters, 38px title,
  65px header, and purposeful media overflow.

### What not to copy

- Branding, product UI, issue / roadmap semantics, client marks, headline copy,
  indigo branding, or proprietary animation mechanics.
- The observed high count of persistent demo animations. Security needs fewer,
  causally meaningful movements.
- Long initial blur that delays readable content.
- A mobile menu without clear accessible labeling or documented focus behavior.

### Transfer to this page

Use Linear chapter cadence and product-evidence composition for Discover,
Analyze, and Contain. The proof is our topology, inspection evidence, runtime
trace, or Console screenshot. The visual language remains our dark cyan system.

## B.2 Wiz

### What to copy conceptually

- A platform-level security narrative rather than a capability catalogue.
- One connected context graph across discovery, analysis, remediation,
  detection, and blocking.
- Oversized credible product frames and a continuous process rail instead of
  identical feature cards.
- Content depth: Hero -> trust/context -> operating model -> connected
  capability sequence -> product evidence -> closing CTA.
- Observed desktop values: ~1,087px central rail, 97px two-tier header, 580px
  copy column, 560px visual, Hero 52px / 66px, and body 18px / 28px.
- Mobile simplifies a four-stage process into a touch-friendly sequential
  treatment rather than compressing every column.

### What not to copy

- Wiz brand, blue/pink/white palette, wizard / hand / cloud art, globe motifs,
  client/logo claims, analyst proof, lead capture, videos, or literal
  exposure-to-code-fix model.
- The bouncy 5px CTA lift, which is too playful for this precision character.
- Desktop mega-menu behavior on mobile. Our menu must be a keyboard-safe,
  scroll-locking dialog with a visible close control.
- A carousel that hides required content. Chapters stay discoverable through
  normal vertical scrolling.

### Transfer to this page

Use Wiz as security-content model: map an attack surface, understand executable
capability, and make runtime containment decisions. The connected evidence path
is our Agent / Skill / Tool / Runtime / Decision system, not a cloud-security
diagram.

## B.3 Vercel

### What to copy conceptually

- One quiet dominant visual thesis per viewport. The observed Hero is mostly
  black space and one local illuminated canvas.
- Severe whitespace, small-radius frames, sparse thin borders, and precise type.
- Three alternating product-story chapters with real interface and proof rail,
  not a three-card feature grid.
- Observed desktop values: 64px sticky header, ~24px gutters, 64px / 64px Hero
  type, 56px / 56px major chapter type, and 6px product frames.
- At 390px it uses a 44px menu, 24px gutters, full-width CTA stack, and linear
  product-story flow.
- In observed reduced motion, no page animations remained active.

### What not to copy

- Vercel logo, triangle, wording, customer logos, screenshots, command wording,
  canvas art, source code, or exact composition.
- Monochrome as a replacement for project cyan / blue security language.
- Infinite marquee as default decoration.
- Claims that Vercel uses cursor spotlight. None was observed during pointer
  inspection.

### Transfer to this page

Use the single-hero-object rule and alternating chapter geometry. The Hero
object becomes an original cinematic security product surface with embedded
topology and runtime-decision evidence. One or two first-party Console
screenshots create proof while remaining product-specific.

## B.4 Reference synthesis

| Source | Contribution | Project translation |
| --- | --- | --- |
| Linear, 40% | typography, spacious rhythm, premium product evidence, progressive reveal | large type, long chapters, oversized product frames, editorial pause before each proof point |
| Wiz, 35% | platform-security story and connected capability model | Discover -> Analyze -> Contain joined by a visible evidence chain and causal security narrative |
| Vercel, 15% | dark product framing, high-precision grid, visual staging, controlled depth | small-radius frames, edge-reaching product rails, one primary visual event, local environment layers |
| Agent Security Platform, 10% | cyan/blue security semantics, mono identifiers, policy language, existing Console vocabulary | original control surfaces, evidence trace, decision state, Chinese + English metadata, first-party product proof |

The generic ui-ux-pro-max palette suggested Matrix-green and alert red. It is
explicitly rejected because it conflicts with user constraints and semantic
color discipline. The generated bento-grid, personalization, purple palette,
and analytics assumptions are also rejected. Retained guidance is
operations/product-demo narrative, normal scrolling, visual space,
transform/opacity motion, reduced motion, touch targets, and breakpoint QA.

## B.5 Visual Fidelity Matrix

This matrix is a compositional reference, not permission to reuse a brand,
asset, copy string, UI screen, or proprietary interaction. It tells an
implementation agent which **design principle** to study for each surface.

| Surface / section | Primary reference | Secondary reference | Borrowed principle translated for Agent Security Platform |
| --- | --- | --- | --- |
| Sticky nav | Vercel | Linear | 64px precise header, compact frame, high contrast, one calm primary action; retain our shield mark and `/console` CTA. |
| Hero typography | Linear | Vercel | Large left-side display type, disciplined line breaks, real negative space, text readable before the product visual completes. |
| Hero product presentation | Linear + Vercel | Agent Security Platform | Oversized believable product frame plus a single visual thesis; translate into an original credible security control surface, not a copied UI. |
| Hero environment / depth | Vercel | Linear | Local illuminated canvas, masked overflow, perspective, and dark space; translate into cyan/blue evidence energy confined to Hero. |
| Evidence rail and typography beat | Linear | Vercel | Editorial pause and structural rule rather than feature cards; the evidence trace becomes the connector. |
| Discover | Wiz | Agent Security Platform | Attack-surface story as a connected security model; use a scan-lit product surface, never Wiz cloud or globe imagery. |
| Analyze | Linear | Agent Security Platform | Product inspection surface with hierarchy and restraint; reveal internal Skill evidence as credible UI, not a code-themed illustration. |
| Runtime | Wiz + Vercel | Agent Security Platform | Security causality plus a decisive staged visual event; branch evidence, settle detectors, and resolve a policy state in an original scene. |
| Platform overview | Linear | Vercel | Large product proof with asymmetric selector/copy rail; preserve a fixed first-party Overview image and use overlays as explanation. |
| Architecture | Vercel | Linear | Technical clarity through a compact sequential rail and large typographic pause, not a research-paper architecture diagram. |
| Final CTA | Vercel | Linear | Extreme reduction after high energy: one quiet dark band, decisive type, one real action. |
| Footer | Vercel | Linear | Compact low-noise closure with real product/internal links and no invented company or social proof. |

---

# C. Proposed Visual Direction

## C.1 Three explored directions

| Direction | Description | Benefit | Trade-off |
| --- | --- | --- | --- |
| Cinematic Precision Agent Security, recommended | 70% premium restraint / 30% controlled spectacle. A three-layer environment frames believable product surfaces; Hero and Runtime alone use cinematic depth and pacing. | Strong competition/demo first impression without losing product credibility or Console continuity. | Requires strict scoping, explicit performance budgets, and visual QA beyond passing tests. |
| Security Constellation | Many luminous nodes, ambient movement, and a graph-first visual world. | Immediate complexity and spectacle. | Still risks generic cyberpunk and turns product evidence into background decoration. |
| Editorial Control Plane | Typography-led, nearly monochrome, minimal product framing, quiet diagrams. | Premium, maintainable, and easy to read. | Under-delivers the requested WOW effect and makes Runtime feel like a normal SaaS section. |

## C.2 Recommendation

Choose **Cinematic Precision Agent Security**. It keeps the existing Console as
the operational source of truth, then builds a presentation layer that feels
like a high-end product film made from credible security UI. It does not make
the entire site loud. Instead it places a clear Hero crescendo and a larger
Runtime peak inside long spans of air, typography, and technical calm.

The page's memorable signature is not a generic cyber background. It is an
evidence trace passing through a product surface that appears to be evaluating
an agent interaction in front of the viewer.

## C.3 Visual rules

1. **One viewport has one primary visual event, not one bright object.** Hero
   and Runtime may pair that primary product surface with secondary atmosphere:
   faint grid fragments, radial illumination, depth blur, a few inert dust
   motes, and low-opacity metadata. None may compete with the primary surface.
2. **Use product surfaces as evidence.** Across the desktop narrative, target
   approximately 50-60% product-like visual evidence and 40-50% conceptual
   visualization as a directional composition balance, not a pixel calculation.
   Marketing-grade surfaces borrow Console language but remain visibly labelled
   illustrative when not a first-party screenshot.
3. **Build three visual depths.** Background environment establishes darkness
   and location; product surface carries the customer story; foreground accents
   carry evidence labels, trace ends, and selected state. Text and controls
   never sit beneath decorative motion.
4. **Break the grid deliberately, preserve reading order.** Copy rail remains
   1,280px maximum; Hero, Runtime, and Platform may use a 1,360-1,400px
   product rail or clipped full-bleed visual rail at desktop widths.
5. **Use a small number of high-quality effects.** Perspective, masked
   overflow, local volumetric glow, technical glass layers, and parallax are
   cinematic effects allowed only inside Hero and Runtime. Platform Overview
   may use a separate **static spatial product-proof** treatment: <= 1deg
   resting perspective, shallow edge shadow, overlap, and a fixed overlay, but
   no parallax, spotlight, dust, or animated bloom. Ordinary sections retain
   solid, low-radius technical frames.
6. **No fake social proof, fake metrics, price table, email capture,
   testimonial carousel, analyst claim, or live telemetry assertion.**
7. **Continue to reject** Matrix rain, green code, hoods, 0/1 patterns,
   globes, broad purple-blue gradients, ubiquitous glass, repeated equal cards,
   giant page-wide glow, and high-density or fast particle fields.
8. **Every cinematic effect must explain security causality or visual space.**
   It may not merely fill time. Reduced motion always exposes the complete
   information immediately.

---

# D. Information Architecture

## D.1 Page map

1. Skip link and sticky Landing navigation
2. Hero: "Secure every decision your agents make."
3. Evidence rail: three platform planes
4. Full-width typographic beat: "DISCOVER. ANALYZE. CONTAIN."
5. Discover: Map the Agent Attack Surface
6. Analyze: Understand What Agent Skills Can Really Do
7. Contain: Observe Agent Behavior at Runtime
8. Full-width typographic beat: "ONE PLATFORM. THREE SECURITY LAYERS."
9. Platform overview: One Platform. Three Security Layers.
10. Evidence architecture: From signal to defensible decision
11. Final CTA
12. Compact product footer

The three main chapters are not equal feature cards. They are three narrative
acts with distinct visual forms:

| Act | Customer question | Visual proof | Outcome |
| --- | --- | --- | --- |
| Discover | What agents, interfaces, Skills, and Tools are exposed? | Scan-lit attack-surface product surface and compact evidence list | A mapped security surface |
| Analyze | What can this Skill read, invoke, and change? | Layered capability-inspection product surface | A defensible capability assessment |
| Contain | What is the Agent doing now, and what should policy do? | Cinematic runtime detector consensus and policy-decision scene | A visible governed decision |

### Energy curve

| Page movement | Energy | Intended feeling | Visual behavior |
| --- | --- | --- | --- |
| Hero | WOW | a sophisticated product is already operating | cinematic product frame, local depth, controlled entrance sequence |
| Discover | calm / mysterious | an attack surface is becoming visible | low-light scan, evidence appears from darkness |
| Analyze | precise / technical | internal behavior can be inspected | layered panels, focus shift, reason-code clarity |
| Runtime | PEAK | an actual security decision is being made | staged causal sequence, convergence, weighted decision reveal |
| Platform overview | proof | the cinematic story maps to a usable product | large first-party product evidence, clear layer controls |
| Architecture | intellectual clarity | decision has a defensible chain | quiet rail and typographic pause |
| Final CTA | extremely quiet | action is obvious after the demonstration | sparse dark band and one primary action |

## D.2 Navigation

Desktop navigation is a 64px sticky bar:

- Left: existing product name and minimal shield mark from current icon library.
- Center: anchor links, "Discover", "Analyze", "Runtime", "Architecture".
- Right: one primary action, "Launch Security Console".
- A secondary action is textual "Explore platform" in Hero only. It does not
  compete with the primary Console CTA in navigation.

At widths <= 880px, replace center navigation with a 44px menu control. The
mobile menu is a real modal dialog with focus trap, Escape close, visible close
button, body scroll lock, logical focus return, and anchor links. It must not
copy Console navigation or use the aria label "Console Navigation".

---

# E. Detailed Section Design

## E.0 Product-surface strategy

Across the desktop narrative, target approximately **50-60% product-like visual
evidence and 40-50% conceptual/editorial visualization**. The topology is
subordinate to credible product structure, not a substitute for it. This is a
directional composition target, not a pixel-area acceptance metric: overlapping
planes, cropped surfaces, typography beats, foreground metadata, and whitespace
do not have a stable objective area classification.

Do not sacrifice composition, hierarchy, storytelling, or reference fidelity to
mathematically satisfy the ratio. The implementation judgment is qualitative:
Hero must first read as a Product Surface; Analyze must have credible product UI
inspection; Runtime must read as a running security workspace; and Platform
Overview must provide first-party product proof.

The following section mixes are **composition intent only**. They guide the
relative role of product evidence and conceptual storytelling; they are not
summed, averaged, measured from rendered pixels, or used as a fidelity gate.

| Section | Directional product / conceptual mix | Required evidence character |
| --- | --- | --- |
| Hero | product-forward, approximately 65 / 35 | Runtime Security Workbench with embedded topology, detector, evidence, risk, and policy state |
| Discover | concept-forward, approximately 45 / 55 | Attack-surface inventory shell illuminated by a scan |
| Analyze | product-forward, approximately 70 / 30 | Layered Skill inspection surface with manifest, dependencies, permissions, invocation, and reason code |
| Runtime | balanced product / causal visualization, approximately 55 / 45 | Cinematic decision workspace with detector matrix and causal trace |
| Platform overview | product-proof-forward, approximately 85 / 15 | First-party Overview product proof with authored overlays and copy rail |
| Editorial typography beats | editorial | Full-width rhythm and evidence-trace handoff, not feature copy |
| Architecture | concept-forward, approximately 20 / 80 | Quiet text-first evidence pipeline and intellectual clarity |

A product-like surface has recognizable chrome, stable panes, metadata
hierarchy, named state, evidence state, provenance, and a believable outcome.
A bordered SVG with floating labels does not qualify. Reconstruct marketing
surfaces from existing Console design language; do not create fake screenshots,
fake metrics, adoption counts, latency, current time, `LIVE` badges, or
unverifiable telemetry. Any evidence counter must equal visible authored
evidence rows in the same scene. Original surfaces carry a visible
`Product visualization / illustrative scenario` label.

Shared presentation primitives should be `ProductSurfaceFrame`,
`ProductChrome`, `MetadataRail`, `EvidenceCounter`, `DetectorStatus`,
`RiskState`, `PolicyDecision`, and `EvidenceTrace`. They stay inside the Landing
presentation boundary and consume static authored content only.

## E.1 Hero

### Layout

- Desktop uses three nested rails: a 1,280px semantic/copy rail, a 1,360px
  product rail, and a clipped full-bleed environment rail that can approach
  viewport edges. Copy occupies columns 1-5. The Hero product surface begins
  in columns 6-7, extends through column 12, and may bleed 48px toward the
  right viewport edge at 1,440px without clipping its functional labels.
- The product frame is intentionally larger than its copy rail, with an
  asymmetric lower-left foreground metadata strip that crosses its boundary.
  It is a controlled off-grid composition, not a floating card.
- At >= 1280px the Hero content region uses
  `min-block-size: clamp(720px, calc(100svh - 64px - 72px), 840px)`, where
  64px is sticky-nav space and 72px is the reserved evidence-rail cue. At
  1440x900 this resolves to 764px and leaves the required 72px cue visible;
  it must not use a fixed 820-940px height that would push the cue below fold.
  Product overflow stays inside the Hero crop and never hides the primary CTA.
- Mobile remains copy first, then a 16:11 product surface. It does not attempt
  to miniaturize desktop chrome: show a reduced but complete scene with the
  trace, detector summary, policy state, and essential evidence count.

### Copy hierarchy

- Eyebrow: "AGENT SECURITY PLATFORM"
- H1: "Secure every decision your agents make."
- Supporting statement: "从发现暴露面，到分析执行能力，再到运行时监管，为 Agent、
  Skills 与 Tool Interactions 建立一条可追溯的安全证据链。"
- Primary CTA: "Launch Security Console" -> "/console"
- Secondary CTA: "Explore the platform" -> "#discover"
- Micro-proof: "ASSET DISCOVERY / STATIC ANALYSIS / RUNTIME SECURITY"

### Visual

Hero uses an original **Agent Security Evaluation Surface**, a believable
future product interface that contains the Decision Topology rather than
placing a topology beside copy.

**Background environment:** a near-black field receives a soft offset cyan
illumination, partial 48px grid fragments, an owned grain texture, and at most
six very low-opacity dust motes. Motes are noninteractive, live only inside the
Hero visual crop, drift once over 18-28 seconds, disappear on mobile and in
reduced motion, and must never resemble a particle field.

**Product surface:** a perspective-aware technical frame occupies the visual
rail. Its top chrome includes a product label, a stable illustrative trace ID
`runtime_interaction/trace-0142`, stable sequence-offset metadata, an
`EVALUATING` state, and `evidence_count: 06`. The counter equals six visible
authored rows: `identity_context`, `skill_provenance`, `tool_scope`,
`prompt_context`, `dependency_signal`, and `requested_action`. It uses small radius, hairline borders,
layered surface temperature, and one low-contrast edge reflection. This is an
original marketing-grade product surface, not a screenshot and not a claim of
live telemetry; a visible caption says `Illustrative security evaluation`.
`EVALUATING` is the entrance state only. When the decision settles it changes
to `RESOLVED`; no-JavaScript and reduced-motion rendering start at `RESOLVED`
so the product chrome never conflicts with its final policy/containment state.

**Embedded evidence topology:** Agent, Skill, Tool, Runtime, and Decision sit
inside the product pane. A cyan evidence trace travels through them and ends at
the paired written state `policy_action: deny` and `containment: active`.
Three detector rows, `rule_detector`, `local_model`, and `external_judge`, wake
as compact UI status rows; a risk annotation such as
`reason_code: tool_scope_escalation` and a policy-gate state make the surface
feel operational. Status color always has adjacent text. The topology lines
are decorative, while the product labels, detector outcomes, evidence count,
risk reason, and policy result are real readable HTML.

**Depth stack:** the background sits at depth 0; the main product frame has a
subtle perspective plane; a foreground evidence counter, selected detector
rail, and decision badge can overlap its edge. Local cyan/blue volumetric
halos and a masked light sweep may appear behind or inside the frame. The
effect never leaks into the document background, nav, copy, or CTA.

The accessible summary is Chinese explanatory content: "示意 Agent 安全评估：
系统结合 Skill 与 Tool 上下文评估 Agent 输入，三条检测路径返回证据，运行时策略最终
给出隔离决策。" Decorative vectors, dust, and light sweeps are hidden from
assistive technology.

### Interaction, motion, and responsive behavior

- Desktop Hero entrance is a directed 1.7-2.2s sequence that runs once per
  `LandingPage` mount / document navigation to the Landing route. A mount-local
  guard prevents child component re-renders from replaying it. Navigating away
  and returning to the Landing route may play it again; no `localStorage`,
  `sessionStorage`, cookie, or cross-session state is read or written. Eyebrow
  starts at 0ms; H1 is readable by 120ms; supporting copy by 220ms; CTAs by 300ms;
  product frame by 420ms; embedded topology activation by 760ms; trace starts
  by 1,020ms; detector rows wake between 1,240-1,520ms; decision state settles
  by 1,700-2,000ms. Entrance is nonblocking: links are live from first paint,
  text never begins hidden from assistive technology, and the static completed
  product state is the no-JavaScript/reduced-motion fallback.
- Fine-pointer interaction is local to the Hero product surface only. Pointer
  position may produce <= 1.25deg frame rotation, <= 8px foreground plane
  offset, and a <= 320px local spotlight. It is spring-smoothed or
  requestAnimationFrame-batched, never moves text/controls, never updates React
  state per pointer event, and is disabled for coarse pointer, reduced motion,
  and <= 1024px.
- Primary CTA may use <= 4px magnetic translation on fine-pointer devices and a
  0.98 active scale. It remains a semantic link with no motion prerequisite.
- At <= 1024px, product surface moves below copy in normal document flow and
  loses perspective/parallax while keeping product chrome readable. At <= 640px
  remove spotlight, dust, light sweep, and secondary metadata; retain active
  trace, three detector labels, policy state, and evidence count. CTA targets
  stack full width and remain >= 44px tall.

## E.2 Evidence rail

### Purpose and layout

This is the handoff from promise to proof. It is a full-width three-column rail
directly below Hero, separated by hairline. At mobile it becomes three vertically
separated rows.

Each item uses index, label, and identifier:

- 01 / Discover / "asset_scan"
- 02 / Analyze / "skills_static"
- 03 / Contain / "sandbox"

There are no card backgrounds. A 1px cyan rule links the items. That rule draws
once on entry; in reduced motion it is already complete. Content is readable
before JavaScript runs.

### Transition to Discover

The rail's cyan rule exits the third plane as a faint evidence trace and becomes
the baseline for an unframed full-width typography beat:

    DISCOVER. ANALYZE. CONTAIN.

At desktop it uses Display XXL (112-128px) with wide breathing space, at tablet
72px, and at mobile 44-48px on deliberate line breaks. The words use mask/
clip and opacity reveal, never animated letter spacing. The trace is
decorative; the statement is live text and fully visible immediately in reduced
motion. This establishes an editorial pause before the quieter Discover act
without becoming another card or feature headline.

## E.3 Discover

### Section identity

- Number: "01 / DISCOVER"
- H2: "Map the Agent Attack Surface."
- Supporting copy: "识别暴露的 Agent 服务、框架、接口、Skills 与外部 Tools，
  将分散的资产信号转化为可分析的安全上下文。"

### Layout

- Desktop keeps a 5-column copy rail left, while the product/scan surface uses
  the 7-column product rail right and may cross the copy baseline by one grid
  unit. The reading order remains copy -> evidence surface -> fact list.
- Target vertical rhythm is 800-920px desktop chapter. The environment remains
  mostly dark so the scan aperture, not a global glow, carries the section's
  mystery.
- Mobile uses heading, explanation, product surface, then a concise evidence
  list. All facts are present before touch interaction.

### Visual and interaction

"Attack Surface Recon Surface" is a product-led original bounded graph, as if
the platform is gradually making an agent environment legible:

- Top chrome reads `ASSET DISCOVERY / ILLUSTRATIVE SCENARIO`; compact authored
  inventory labels identify Agent service, framework, interface, Skill package,
  external Tool, and exposure contour. It does not show fake totals, reach,
  last-seen time, or live scan status.
- A centered Agent service is surrounded by framework, interface, Skill,
  external Tool, and exposure nodes inside an inventory/result shell. Labels
  use project vocabulary such as `framework_fingerprint`, `tool_endpoint`, and
  `skill_package` without claiming live scanning.
- The Hero evidence trace changes role here: a narrow scan aperture crosses the
  map once, locally illuminating evidence panes and node labels in causal order.
  Background nodes remain low contrast; selected evidence resolves into the
  compact fact list rather than disappearing after the visual event.
- Environment is calm and mysterious: masked grid fragments and a faint
  coordinate mark sit behind the surface; foreground has at most one detached
  evidence plaque. No globe, world map, or generic network background is used.
- It carries a visible `Product visualization / illustrative scenario` label.
  Fine-pointer node hover reveals a one-line definition and highlights the
  matching evidence path. Keyboard focus and click drive the same selected
  state; touch users receive all facts in the visible list without hover.

## E.4 Analyze

### Section identity

- Number: "02 / ANALYZE"
- H2: "Understand what a Skill can really do."
- Supporting copy: "不止识别 package name。审视脚本、依赖、声明权限、Prompt
  行为与 Tool 调用路径，在 Skill 进入生产前厘清它真正能够读取、调用和改变的边界。"

### Layout

- Desktop reverses Discover: an 8-column layered inspection surface begins at
  the left product rail, a 4-column copy/outcome rail aligns right, and an
  intentional gap protects the feeling of a dissected internal structure rather
  than a normal two-column feature section.
- Mobile remains copy, evidence surface, then short three-item outcome list.
  It does not horizontally scroll or shrink a desktop inspection board.

### Visual and interaction

"Capability Inspection Surface" is a large near-black product frame that feels
like a Skill has been opened and inspected, not a set of feature cards:

- Back layer: a dim package-manifest rail and dependency contour establish
  provenance. Middle layer: three crisp inspection panes for `file execution`,
  `permission boundary`, and `tool invocation`. Front layer: one detached
  reason-code annotation such as `reason_code: tool_scope_escalation` and a
  written outcome statement.
- Panel depth comes from 8-20px overlap, surface temperature, clipped edge
  reflection, and focus hierarchy, not big rounded cards or ubiquitous glass.
  The selected evidence path adopts the Hero trace as a thin local contour that
  runs from manifest to invocation to reason code.
- A visible `Illustrative analysis output` and
  `Product visualization / illustrative scenario` label prevent authored content being read as live
  result. Red/amber identify only meaningful risk statement and are paired with
  explanatory text; cyan marks selected evidence, not every row.
- Initial reveal shifts focus through manifest -> dependency -> permission ->
  tool invocation in 60-90ms increments. Focus/hover adds opacity and border
  definition but never expands layout, fake-scrolls code, or hides evidence.
- A verified existing Console screenshot may be a small secondary inlay only if
  it represents the current product accurately. The main scene remains an
  owned illustrative product surface and never misrepresents Console capability.

## E.5 Contain / Runtime

### Section identity

- Number: "03 / CONTAIN"
- H2: "Observe agent behavior at runtime."
- Supporting copy: "在 Agent 发起操作的瞬间解析信任上下文、并行评估证据并应用策略，
  让安全决策及其约束依据清晰可见。"

### Layout

- This is the highest-energy and only scroll-progressive section. At >= 1280px
  it uses a 190-220vh native-scroll wrapper and a sticky cinematic scene on a
  `min(1400px, calc(100vw - 32px))` product rail. Scene height is
  `min(72vh, 680px)` below the sticky nav safety zone. Native scroll remains
  normal; there is no scroll-jacking or horizontal track.
- Four document-flow sentinels update discrete checkpoints through
  IntersectionObserver. No continuous JavaScript scroll transform is needed.
  Fast sentinel changes seek directly to the stable end state of the active
  checkpoint rather than queueing delayed animations.
- The four checkpoints are the authority for normal scroll progression and map
  the six causal phases as follows:

  | Checkpoint | Causal phases owned | Stable end state |
  | --- | --- | --- |
  | `resolve` | Input enters + Trust resolves | identity, Skill provenance, and Tool scope visible |
  | `detect` | three Detectors evaluate | all detector rows `complete` and three refs visible |
  | `decide` | Evidence converges + Policy resolves | evidence counter `03`, policy gate resolved to deny |
  | `contain` | Decision settles | containment active, ring/bloom ended, scene still |

  Each forward sentinel plays only its owned segment. Fast forward scroll first
  seeks preceding checkpoints to their stable end state, then plays the target
  segment. Reverse scroll seeks directly to the earlier stable end state and
  never reverse-plays causality. Re-entry keeps the last stable state.
- Explicit keyboard/touch stage selection cancels any active segment and lands
  immediately on the selected stable end state. `Replay sequence` temporarily
  suspends observer-driven changes and plays all four segments in order over
  4.8-5.4s; any new user selection or section exit cancels replay. This gives
  scroll, replay, and direct controls one deterministic priority model.
- At <= 1024px sticky behavior ends. Tablet and mobile render a vertical,
  readable Input -> Resolver -> Detectors -> Policy sequence with all evidence
  and final state visible; they do not shrink the desktop scene into a diagram.

### Visual

"Runtime Decision Workspace" is the page's most expressive product surface:

- Product chrome reads `RUNTIME DECISION / ILLUSTRATIVE SEQUENCE`,
  `evaluation_mode: simulation`, and a stable presentation trace ID. It never
  uses `LIVE`, current time, throughput, confidence percentage, or a metric
  that could be read as real telemetry.
- An Input well presents authored fields such as `event_type: tool_invocation`,
  actor, target, and declared scope. Trust Resolver makes identity context,
  Skill provenance, and Tool scope visible.
- A detector matrix contains `rule_detector`, `local_model`, and
  `external_judge`; each uses only written `standby`, `evaluating`, and
  `complete` state. Three visible evidence references converge into an
  `evidence_refs: 03` strip, so the counter corresponds to information the
  viewer can actually inspect.
- Policy Gate carries `sandbox-security-balanced.v1`,
  `policy_action: deny`, and `containment: active`. Policy may conceptually
  resolve allow, ask, or deny; this authored cinematic scenario settles on deny
  plus active containment and says `Illustrative runtime simulation`.

The scene is not a generic flowchart. It is a cinematic decision workspace:
Input enters -> Trust Resolver activates -> signal branches -> Rule Detector /
Local Model / External Judge independently evaluate -> evidence converges ->
Policy Gate resolves -> decision appears. Text sits on a crisp product plane;
background and foreground layers create the camera-like depth without blurring
product information.

Three spatial planes are explicit: background environment uses discontinuous
grid fragments, a low-saturation steel-blue field, and coordinate marks;
product surface uses stable chrome, detector matrix, evidence strip, and policy
pane; foreground accents use trace head, decision ring, detached metadata
plaque, and a constrained light sweep. CSS perspective and `translate3d` are
enough; no WebGL is needed.

### Motion and responsive behavior

- The full desktop sequence lasts 4.8-5.4s and is staged for causality, not
  decoration:

  | Time | Causal event | Visual behavior |
  | --- | --- | --- |
  | 0-550ms | Input enters | Authored event enters from frame edge; neutral trace lights. |
  | 450-1,150ms | Trust resolves | Identity, Skill provenance, and Tool scope become legible. |
  | 1,100-2,600ms | Detectors evaluate | Three branches start at 0/180/420ms offsets and independently complete. |
  | 2,400-3,500ms | Evidence converges | Three visible refs return to the evidence strip; counter settles at 03. |
  | 3,400-4,550ms | Policy resolves | Policy Gate receives local light; decision ring closes; result mask reveals. |
  | 4,400-5,400ms | Decision settles | Containment locks; local bloom and energy ring dissipate once; scene becomes still. |

- Hero's evidence trace is the same visual language here, now transformed into
  a policy-decision path. Detector lanes branch, wait, and return on authored
  evidence; all movement ends once decision settles. The only intentional
  replay is a clearly labelled user-triggered `Replay sequence` control. It
  replays the explanatory scenario, never an actual verdict.
- Local cinematic bloom, scan beam, depth shift, and decision ring are confined
  to Runtime. They use pre-blurred pseudo-elements or assets and animate only
  opacity/transform; do not animate large `filter`, `box-shadow`, layout, or
  text layers. Background/foreground may shift slightly, product text stays
  optically stable.
- The `resolve` segment starts when its first checkpoint enters the viewport;
  normal scroll never auto-plays all four segments at once. Active segment work
  pauses out of view and re-entry restores the last stable state. It is not tied
  to a real security verdict. Fine-pointer spotlight is local to the stage and
  disabled outside desktop fine-pointer conditions.
- At <= 1024px, convert rail to vertical bands and remove sticky story. At <=
  640px, show labels and decision text before decorative paths; remove scan,
  dust, spotlight, depth shift, and dissipating effect. No graph label requires
  horizontal scrolling or hover.

## E.6 Platform overview

### Section identity

- Eyebrow: "ONE PLATFORM. THREE SECURITY LAYERS."
- H2: "See the whole security posture, not isolated checks."
- Supporting copy: "在统一的产品视图中关联资产发现、Skill 静态分析与运行时防护，
  避免把每一层安全能力割裂为孤立检查。"

### Transition from Runtime

Runtime's decision ring fades to a single horizontal evidence line. That line
becomes the mask edge for the second unframed typography beat:

    ONE PLATFORM.
    THREE SECURITY LAYERS.

Use 88-104px desktop, 64px tablet, and 40-44px mobile display text. This is a
deceleration from cinematic decision to product proof: no glow build, no
tracking animation, and no card. Reduced motion shows both lines immediately.

### Layout and visual

Use an asymmetric "Layer Stack" on the 1,360-1,400px product rail, not three
equal cards:

- A large owned Overview Console screenshot occupies roughly 9 desktop columns
  and may approach the viewport edge. A 4-column vertical layer index overlaps
  its left edge by one column while all controls remain inside the readable
  product rail: `01 Asset Discovery`, `02 Static Analysis`,
  `03 Runtime Security`.
- Background is a diffuse cool top light and sparse grid fragment; the product
  screenshot is crisp and dominant; foreground uses the selector rail, one
  outcome plaque, and a thin evidence trace. This is lower energy than Runtime
  but clearly deeper than a flat screenshot in a centered card.
- Selecting layer changes a masked evidence overlay and copy rail. It does not
  replace the screenshot, open a modal, fetch data, or create false capability
  proof. First layer is active; every layer is a real keyboard/pointer/touch
  button with obvious selected state.
- A resting perspective of <= 1deg and a shallow edge shadow are allowed at
  >= 1280px. No cursor tilt is needed; product proof, not spectacle, dominates.

Capture Console images locally at 2x after implementation, remove browser
chrome and operator-identifying content, and store owned WebP derivatives with
fixed intrinsic dimensions. Use at most two first-party screenshots in
the whole page. Hero and runtime scene remain original.

On mobile the screenshot precedes a three-row layer list. Active explanation
appears below the list. Perspective and overlap flatten, overlay becomes a
simple CSS fade, and screenshot reserves ratio before loading.

## E.7 Evidence architecture

### Section identity and layout

- Eyebrow: "FROM SIGNAL TO DECISION"
- H2: "A defensible security decision has a chain of evidence."
- Supporting copy: "将发现、归一化、分析、决策、执行与审计串成可追溯的证据链，
  让每个策略结果都能说明其来源与依据。"
- Desktop pipeline: Observe, Normalize, Analyze, Decide, Act, Audit.
- Each stage has 1-2 plain-language lines and one mono identifier such as
  "asset_scan", "risk_level", "policy_action", or "evidence_ref".
- Tablet and mobile turn it into numbered vertical rail with connecting lines.

This is intentionally compact, not a paper architecture diagram. It has no
technical table, deployment chart, or claim of automatic action without policy.

## E.8 Final CTA and footer

### Final CTA

- Spare dark band with local cyan backlight only behind action.
- Eyebrow: "READY TO EVALUATE?"
- H2: "Take control of your agent attack surface."
- Supporting copy: "进入 Console，在同一条证据链上查看资产、能力与运行时决策。"
- Primary link: "Launch Security Console" -> "/console"
- Secondary text link: "Explore the runtime model" -> "#runtime"
- No email input, pricing, client logo, or fabricated count.

### Footer

- Product name, one-sentence platform descriptor, real internal anchors, links
  to Console and Architecture.
- Compact two-column mobile and restrained 3-4-column desktop layout.
- Do not invent legal, social, status, company, or integration links.

## E.9 Section continuity and background environment

The page is not a stack of isolated sections. The evidence trace changes role
at each transition while the page's energy rises and falls deliberately. It
does not need to be one literal long SVG or a scroll-jacked animation.

| Transition / section | Signature-trace role | Background environment | Product / foreground relationship |
| --- | --- | --- | --- |
| Hero | active runtime evaluation trace | strongest cyan/steel illumination, masked perspective grid, sparse dust | cinematic workbench is primary; evidence counter and decision badge float at Z2 |
| Evidence rail -> typography beat | horizontal handoff rule | nearly flat black, faint grain only | text owns the pause; trace is a subtle baseline |
| Discover | scan aperture illuminates topology evidence | dark field with local scan light and one coordinate mark | recon surface is primary; selected evidence plaque is Z2 |
| Analyze | selected contour travels from manifest to reason code | focused neutral inspection field, shallow ruler/grid marks | layered panes are primary; reason-code plaque is Z2 |
| Runtime | branch -> converge -> policy path | deepest vignette, local cyan convergence field, sparse grid fragments | decision workspace is primary; trace head/ring/plaque are Z2 |
| Runtime -> typography beat | settled decision ring collapses to a rule | illumination recedes rapidly to near-black | large type restores breathing room before product proof |
| Platform overview | static overlay contour explains selected security layer | diffuse cool top light, low-contrast edge grid | first-party product proof is primary; selector/outcome rail overlaps at Z2 |
| Architecture | one calm evidence line joins six stages | almost flat near-black, no dust or bloom | text-first pipeline is primary, line only explains order |
| Final CTA | trace ends at the Console action | near-black with one restrained cyan backlight | CTA is primary; no product object or extra spectacle |

Concrete inter-chapter handoffs prevent the motif from becoming a repeated cyan
line:

1. **Discover -> Analyze:** Discover's selected scan path exits as one narrow
   `tool_endpoint` contour. The first Analyze frame enters with the same
   contour already attached to its manifest/provenance rail, then resolves into
   dependency, permission, and invocation evidence. The handoff is a 420-720ms
   masked cross-section reveal, not a persistent DOM connector.
2. **Analyze -> Runtime:** the Analyze reason-code contour contracts to one
   visible `evidence_ref` line at section exit. Runtime's Input well begins
   with that line at its edge, then the first `resolve` checkpoint turns it into
   the neutral input trace. This makes analysis evidence a causal predecessor
   of policy evaluation rather than another visual card.
3. **Runtime -> Platform:** settled decision ring collapses into the static
   horizontal rule that masks the `ONE PLATFORM. THREE SECURITY LAYERS.` beat,
   then becomes the Platform overlay contour. No scroll position, pointer move,
   or timing dependency may hide the content if one handoff does not run.

The environment system uses three planes everywhere, with intensity adjusted by
the energy curve:

1. **Z0 background environment:** near-black substrate, owned noise, local
   radial illumination, sparse grid fragments, and occasional coordinate marks.
   It is noninteractive, masked to its section, and always below readable text.
2. **Z1 product surface:** crisp technical frame, console-derived chrome,
   evidence hierarchy, and stated outcome. It carries the primary meaning.
3. **Z2 foreground accents:** clipped trace bloom, floating metadata, rim
   highlight, selected-state plaque, or decision annotation. These are sparse,
   `pointer-events: none` unless a separate semantic control already exists.

Do not turn these planes into global glassmorphism. Broad color fields are
large and soft, but contained light, contrast, and depth hierarchy matter more
than a blanket blur amount. Noise and grid fragments are section-local, never
fixed to the viewport. In a static screenshot the environment should register
as spatial richness, not be the first visual feature a reviewer describes.

---

# F. Design Tokens

## F.1 Token strategy

Landing extends the Console token source rather than forking it. Existing
"--console-*" values stay authoritative for semantic text, accent, risk, and
action colors. Token ownership is explicit:

1. **Shared semantic tokens** stay in `:root`. They are product-level values
   that Landing and Console may both consume: `--console-ink`,
   `--console-muted`, `--console-accent`, and semantic risk / policy colors.
   Landing never changes their values.
2. **Landing presentation tokens** are declared on `.landing-page`, not
   `:root`. They cover canvas, product-frame, hairline, grid, environment, and
   nonsemantic depth material that must not leak into Console.
3. **Cinematic scene tokens** are declared only on `.landing-hero` and
   `.landing-runtime` (or an equivalent scene-root class). They may be inherited
   by their own decorative descendants, but cannot be used by navigation, calm
   chapters, or Console selectors.

Landing component CSS consumes only declared shared, Landing-presentation, or
scene-scoped tokens; raw color values belong only in the scoped token
declarations. No `--landing-*`, environment, bloom, specular, or depth token is
declared in `:root`, and no existing Console selector may depend on one. This
preserves visual continuity without turning a Landing presentation value into a
global contract.

Within the Landing scope, **ordinary UI tokens** remain strict and quiet for
navigation, copy, controls, and calm chapters. **Cinematic scene tokens** are
legal only inside Hero and Runtime environment/product wrappers. This prevents a
local visual climax from leaking into Console or turning every section into
glowing glass.

## F.2 Color and surface system

| Scope | Token | Target value | Usage |
| --- | --- | --- | --- |
| `:root` shared semantic | `--console-ink` | existing Console value | Headings and high-priority copy in either product surface |
| `:root` shared semantic | `--console-muted`, `--console-muted-dim` | existing Console values | Body, metadata, and passive labels |
| `:root` shared semantic | `--console-accent` | existing Console cyan | Active trace, focus, selected layer, primary CTA |
| `:root` shared semantic | Console critical/high/medium/allow/deny tokens | existing semantic values | Meaningful security state only; always paired with text or icon semantics |
| `.landing-page` | `--landing-canvas` | #080c10 | Quiet near-black page base, not saturated navy |
| `.landing-page` | `--landing-canvas-raised` | #0d1520 | Landing bridge to the Console base |
| `.landing-page` | `--landing-surface`, `--landing-surface-solid` | rgba(18, 28, 40, 0.82) / #101923 | Product frames, sticky nav, reduced-transparency fallback |
| `.landing-page` | `--landing-hairline`, `--landing-hairline-strong` | rgba(228, 237, 245, 0.07) / rgba(228, 237, 245, 0.13) | Quiet divisions, frame outlines, selected layer |
| `.landing-page` | `--evidence-blue` | #60a5fa | Secondary nonsemantic topology path only |
| `.landing-page` | `--environment-cyan`, `--environment-steel-blue` | rgba(34, 211, 238, 0.055) / rgba(96, 165, 250, 0.04) | Section-local radial illumination and low-saturation underlight |
| `.landing-page` | `--grid-minor`, `--grid-major` | rgba(228, 237, 245, 0.025) / rgba(228, 237, 245, 0.05) | Masked technical fragments, not full-page grid wallpaper |
| `.landing-hero`, `.landing-runtime` | `--local-halo-cyan`, `--local-halo-blue` | rgba(34, 211, 238, 0.08) / rgba(96, 165, 250, 0.05) | Scene-local depth, never global |
| `.landing-hero`, `.landing-runtime` | `--cinematic-bloom-cyan` | rgba(34, 211, 238, 0.18) | Pre-blurred convergence pseudo-element only |
| `.landing-hero`, `.landing-runtime` | `--specular-line` | rgba(228, 237, 245, 0.16) | Local product-frame edge reflection, never ordinary card chrome |
| `.landing-hero`, `.landing-runtime` | `--landing-depth-shadow` | 0 40px 120px rgba(0,0,0,0.56) | Product-plane separation only |

Critical red, high orange, medium amber, allow green, and deny red remain
Console semantic tokens. They always appear with text or icon semantics and
are never background decoration.

`--cinematic-bloom-cyan` and `--landing-depth-shadow` must be emitted by
section-clipped pseudo-elements or isolated layers. Their opacity/transform may
animate; large-area `filter`, `box-shadow`, and backdrop blur must not animate
per frame.

## F.3 Typography system

Target families:

| Role | Target stack | Usage |
| --- | --- | --- |
| Display / UI | Geist, Inter, Noto Sans SC, PingFang SC, Microsoft YaHei UI, Segoe UI, sans-serif | Headings, navigation, body, mixed Chinese / English |
| Technical mono | Geist Mono, JetBrains Mono, SFMono-Regular, Consolas, monospace | identifiers, versions, evidence fields, policy labels |

Geist / Geist Mono and Noto Sans SC are self-hosted only after documented
license / source check. Use WOFF2 subsets, "font-display: swap", stable fallback
metrics, and no third-party font CDN. Do not alter existing Console Aptos family
in this Landing requirement.

Letter spacing is always zero. This protects Chinese readability and conforms to
the repository typography constraint.

| Role | >= 1280px | 768-1279px | <= 767px | Line height | Weight |
| --- | ---: | ---: | ---: | ---: | ---: |
| Display XXL, editorial beat | 112-128px | 72px | 44-48px | 0.98-1.08 | 520-600 |
| Display XL, Hero H1 | 80px | 64px | 44px | 1.04, 1.14 for CJK wrap | 520-600 |
| Display L, major H2 | 56px | 48px | 34px | 1.10, 1.22 for CJK wrap | 520-600 |
| H3 / outcome | 24px | 22px | 20px | 1.30 | 560 |
| Statement | 20px | 18px | 18px | 1.55 | 400 |
| Body | 16px | 16px | 16px | 1.65 | 400 |
| Label | 12px | 12px | 12px | 1.35 | 560 |
| Mono metadata | 12px | 12px | 12px | 1.55 | 500 |

Use CSS media queries for discrete typography. Do not scale font size from
viewport width. English technical strings wrap at semantic separators; long
identifiers use overflow wrapping and expose full value when truncation cannot
be avoided.

## F.3.1 Bilingual Content Strategy

The Landing has one predictable language system. English carries the product's
brand, technical precision, and short commands; Chinese carries product
explanation and decision context. This is deliberate mixed-language
composition, not partial translation or a section-by-section language lottery.

| Content role | Default language / treatment | Examples and rule |
| --- | --- | --- |
| Display and brand headline | English, Display/UI stack | `Secure every decision your agents make.`, `Map the Agent Attack Surface.`, `DISCOVER. ANALYZE. CONTAIN.` Hero H1, major section H2, editorial beats, and short CTA labels remain English. |
| Explanatory product copy | Chinese, Statement/Body stack | Explain the product meaning beneath an English heading rather than repeat a full English sentence. For Discover: `识别暴露的 Agent 服务、框架、接口、Skills 与外部 Tools，将分散的资产信号转化为可分析的安全上下文。` |
| Technical metadata | English plus Technical mono | Preserve identifiers such as `framework_fingerprint`, `tool_endpoint`, `skill_package`, `rule_detector`, `local_model`, `external_judge`, `policy_action`, `containment`, and `evidence_ref`; never translate identifiers into invented Chinese tokens. |
| Product state | English state plus optional concise Chinese explanation | `POLICY DECISION` / `DENY` remains a recognizable technical state; a nearby Chinese sentence explains that the policy rejected the current Tool invocation and entered containment. |
| Navigation and CTA | English short labels | `Launch Security Console`, `Explore the platform`, and `Replay sequence` stay concise and do not become bilingual button text. |

Rules:

1. Do not place two complete translations of the same sentence at the same
   hierarchy level. English title plus Chinese explanation is the standard
   pairing; the Chinese statement adds product meaning rather than echoes the
   title word for word.
2. Do not make one chapter all English, the next all Chinese, and a third
   randomly mixed. Hero, Discover, Analyze, Runtime, Platform, Architecture,
   and Final CTA all use the same role-based pattern.
3. Technical identifiers keep English spelling and mono treatment. Chinese
   prose may introduce a term naturally, but it does not alter the identifier
   rendered in the product surface.
4. Keep Chinese and English line wrapping intentional at desktop and mobile.
   No line may split a short CTA label awkwardly, clip a mono identifier, or
   rely on negative letter spacing. QA at 1440px, 390px, and 320px verifies
   hierarchy, line length, and reading order for the mixed-language copy.
5. Give the Landing semantic content root `lang="zh-CN"` because its explanatory
   narrative is Chinese; mark English display phrases with `lang="en"` where
   assistive pronunciation benefits. Do not change the global Console language
   contract solely for Landing, and do not add a language attribute to every
   short identifier when code semantics already make it clear.

## F.4 Spacing, layout, shape, and depth

| System | Values / rule |
| --- | --- |
| Copy rail | max-width 1,280px; desktop gutter 32px, tablet 24px, mobile 16px; all prose and essential controls stay inside it |
| Product rail | max-width 1,360-1,400px; Hero, Runtime, and Platform may use it at desktop widths while preserving safe text zones |
| Full-bleed environment rail | up to viewport width, clipped per section; lighting/grid/noise only, never essential content |
| Grid | 12 columns desktop, 8 tablet, 4 mobile; gaps 24px desktop, 16px mobile |
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160px |
| Section rhythm | Hero uses `clamp(720px, calc(100svh - 64px - 72px), 840px)` desktop to preserve its cue; Discover/Analyze 800-920px; Runtime 190-220vh desktop; 72-104px mobile block spacing |
| Prose measure | 32-36ch Hero support; 54-66ch body paragraphs |
| Radius | 4px small controls, 6px buttons / compact frames, 8px maximum product frame |
| Border | 1px hairline default; 1px strong hairline selected or focused |
| Ordinary UI depth | one neutral featured-frame elevation: 0 24px 72px rgba(0,0,0,0.34); no decorative bloom behind ordinary cards |
| Product-proof depth | Platform only: <= 1deg resting perspective, shallow edge shadow, fixed overlap/overlay; no parallax, dust, spotlight, or animated bloom |
| Cinematic depth | Hero / Runtime only: local perspective, 24-48px apparent plane separation, 48-96px pre-blurred masked radial fields, detached metadata, and clipped foreground accents |
| Grid texture | fragmented 48px desktop / 32px mobile technical grid; perspective variant only in Hero/Runtime; no global wallpaper |
| Noise | owned 256px grayscale WebP tile at <= 0.035 opacity; section-local and omitted for reduced transparency |
| Depth dust | maximum 6 Hero or 8 Runtime low-opacity marks; 18-28s grouped drift; pause out of view and remove on mobile/reduced motion |

## F.5 Responsive breakpoints

| Range | Layout rule |
| --- | --- |
| >= 1280px | Full 12-column asymmetry, three rails, sticky Runtime story, center navigation, local Hero/Runtime depth allowed |
| 1024-1279px | Product rail contracts to safe gutters; preserve two-column chapters only where labels remain readable; remove intentional right overflow and pointer depth |
| 768-1023px | Stack Hero into copy then flatter product surface; Runtime becomes nonsticky; foreground overlap returns inside frames |
| 480-767px | Four-column linear flow, menu dialog, full-width primary CTA, no cursor effects, no dust/parallax, product chrome simplified rather than scaled down |
| 320-479px | 16px gutters, 44px controls, 16px body, short labels, static causal runtime bands, no horizontal overflow or cropped decision/evidence text |

## F.6 Performance budgets

These are Landing-specific acceptance budgets. They constrain spectacle without
forcing it back to a flat page:

| Budget | Target / limit | Enforcement point |
| --- | --- | --- |
| Landing route JavaScript | <= 85 KiB gzip incremental over the route-shell baseline, excluding already-installed shared Motion runtime | inspect production build chunks; no new animation dependency |
| Critical font transfer | <= 420 KiB for fonts needed above fold; only needed subsets/weights preload | network waterfall and font ledger |
| Hero decorative media | owned noise <= 16 KiB; no video/WebGL/canvas particle field | asset ledger and resource entries |
| Product media | at most two owned WebP captures, each <= 450 KiB, intrinsic dimensions reserved, below-fold images lazy | asset gate and browser inspection |
| Layout stability | CLS <= 0.05 for Landing route | browser performance trace after fonts/images settle |
| Scene frame budget | after initial load, p95 animation frame work <= 20ms on target desktop; no repeated animation-caused >50ms long task | Chrome Performance recording of Hero and Runtime |
| Compositor scope | Hero <= 8 promoted scene layers; Runtime <= 10; remove `will-change` after sequence settles | Layers/Performance inspection |
| Visibility work | no active dust, scan, pointer, or replay work while its scene is outside viewport | observer/state test plus performance trace |

Performance budgets do not waive visual quality. If a scene misses budget, first
remove decorative layer count, mobile depth, or animated filter work; do not
remove product hierarchy, accessibility information, or the causal sequence.

## F.7 Landing metadata and share preview

The public root route needs a project-owned metadata baseline. The implementation
must use the Vite SPA's existing static `frontend/index.html` for crawlable root
metadata and a small native React document-title boundary for client-side route
changes. Do not add an SEO, Helmet, prerendering, or server-rendering dependency
for this requirement.

| Field | Required value / behavior |
| --- | --- |
| Document title | `Agent Security Platform` for `/`; client navigation into Console restores `Agent Security Platform Console` through a minimal route-title effect with no visual or route-contract change. |
| Meta description | `Secure every decision your agents make - from attack-surface discovery and Skill analysis to runtime security evaluation.` |
| `theme-color` | `#080c10` for the public Landing document. |
| `og:title` | `Agent Security Platform` |
| `og:description` | Same approved root description unless final marketing copy is explicitly revised before implementation. |
| `og:type` | `website` |
| `og:image` | A project-owned `1200x630` preview derived from the final Hero product surface or a dedicated owned product preview. It contains no reference assets, fake metrics, fake telemetry, or third-party marks. |
| Twitter | Include `twitter:card=summary_large_image`, title, description, and image only if the deployment can provide the same stable public image URL. |

Vite emits one static HTML document and does not provide reliable server-side
per-route Open Graph metadata. Therefore static title, description, theme color,
and Open Graph tags represent the canonical public `/` Landing Page. A client
effect can update only `document.title` after Console navigation; it cannot make
route-specific metadata reliably available to non-JavaScript crawlers. Per-route
social metadata, SSR, and prerendering are explicitly out of scope.

The eventual `og:image` must use a stable deployment-origin absolute URL and be
kept under Landing asset ownership. It is captured or generated only after the
final Hero surface exists, then receives the same provenance review as all other
shipped media.

---

# G. Motion System

## G.1 Philosophy

Motion has three intentional tiers:

1. **UI Motion** is fast, light, and interruptible. It covers hover, press,
   menu, focus-adjacent selected state, and ordinary controls.
2. **Narrative Motion** is slower and editorial. It covers section reveal,
   evidence handoff, and full-width typography beats.
3. **Cinematic Visualization** is reserved for Hero and Runtime. It may be
   slower, spatial, and visibly authored because it explains how agent evidence
   becomes a policy decision.

Normal is quiet. Hover is subtle. Focus is precise. Narrative motion guides
reading. Hero is the first climax; Runtime is the peak. Each viewport retains
one primary visual event but can host subordinate atmospheric layers inside its
section crop.

Motion is explanation, not decoration. Use transform, opacity, clip/mask, and
limited color changes for movement. A pre-blurred cinematic layer may animate
only opacity/transform. Do not animate geometry, width, height, margin, layout,
large-area filter, or inherited global variables for every pointer event.
Keyboard-triggered control changes land immediately; visual transitions must
never delay keyboard feedback or make state ambiguous.

## G.2 Tokens and rules

| Token | Value | Approved use |
| --- | --- | --- |
| motion-press | 100-140ms | active press feedback; 0.98 scale only where it fits the control |
| motion-hover | 140-200ms | border, ink, and <= 2px ordinary UI hover response |
| motion-ui | 180-240ms | menu and compact selected-state transition; interruptible |
| motion-narrative | 420-720ms | ordinary section/evidence reveal and trace handoff |
| motion-editorial | 600-900ms | unframed typography mask/clip reveal, once per entry |
| motion-hero-sequence | 1.7-2.2s total | Hero product-frame, topology, detector, and decision entrance; text readable within first 300ms |
| motion-runtime-sequence | 4.8-5.4s total | causal Input -> Resolver -> Detectors -> Evidence -> Policy -> Decision sequence |
| motion-ambient | 18-28s | section-local Hero/Runtime dust drift; no loop required and no mobile/reduced-motion execution |
| stagger-ui | 40-80ms | up to six related static rows or metadata items |
| ease-out | cubic-bezier(0.16, 1, 0.3, 1) | entries and interactive response |
| ease-in-out | cubic-bezier(0.65, 0, 0.35, 1) | on-screen convergence and plane movement |
| ease-linear-path | linear | only for an explanatory trace's constant-travel segment |

Use CSS transitions for rapid interruptible interactions. Use Motion, WAAPI, or
CSS keyframes only where their lifecycle suits the scene: CSS/WAAPI for
predefined Hero/Runtime cinematics, Motion values for spring-smoothed local
pointer depth, and no per-pixel scroll animation. Do not use broad transition
rules, scale-from-zero, ease-in, unbounded bounce, global cursor tracking, or
an additional animation dependency.

## G.3 Motion inventory

| Moment | Behavior | Guard |
| --- | --- | --- |
| Hero entrance | Eyebrow -> H1 -> support -> CTA -> product frame -> topology -> trace -> detector wake -> decision settle | once per `LandingPage` mount / document navigation to the Landing route; no replay from child re-renders or browser storage; 1.7-2.2s total; readable copy and active CTA first |
| Editorial typography beat | full-width phrase resolves through line mask/clip and opacity | 600-900ms once; no character split, no tracking animation, final text visible in reduced motion |
| Section reveal | opacity + 8-12px rise with optional masked product-surface reveal | once on IntersectionObserver entry; content visible without JS |
| Evidence rail | one left-to-right rule draw becomes the trace baseline for the next section | no repeat; static final state in reduced motion |
| Discover scan | aperture crosses once and reveals graph/evidence panes from darkness | product surface remains readable before/after scan; pause out of view |
| Analyze inspection | focus shifts manifest -> dependency -> permission -> invocation -> reason code | 60-90ms bounded row offsets; no fake code scroll or layout expansion |
| Runtime sequence | Input -> Resolver -> three detector branches -> evidence convergence -> Policy -> decision ring settle | 4.8-5.4s causal sequence; four sentinels select stable checkpoints; one user-triggered replay only |
| Cinematic environment | local light sweep, pre-blurred bloom opacity, shallow background/foreground parallax, sparse dust | Hero/Runtime crop only; no text-plane movement, no global page layer, pause out of view |
| Hover | ordinary UI gets border/ink or <= 2px lift; cinematic surface may expose local depth | fine-pointer media query only; no meaning is hover-only |
| Press | scale to 0.98 then release | all semantic buttons / links; keyboard state remains immediate |
| Magnetic CTA | translate <= 4px by pointer proximity | primary CTA only, Hero only, fine pointer only |
| Local perspective / spotlight | <= 1.25deg Hero product tilt, <= 8px foreground offset, <= 320px radial tint | Hero and Runtime only; no React state per move; disabled <= 1024px |
| Mobile menu | opacity + <= 8px translation, close faster than open | dialog, Escape, focus return |

## G.4 Reduced motion and reduced transparency

For "prefers-reduced-motion: reduce":

- All scenes render completed information immediately.
- Disable scanning, path tracing, magnetic movement, pointer spotlight, sticky
  stage choreography, local perspective, parallax, dust, light sweep, blur
  travel, decision-ring dissipation, and continuous loops.
- Keep a <= 150ms opacity state change only where it communicates selected
  control or menu open / close.
- Never hide text until animation completes.
- Hero renders its complete workbench with detector summary, evidence count,
  reason code, policy result, and containment state. Runtime renders all
  detector/evidence/policy panes in its settled decision state. A replay request
  still resolves immediately to final information.

For "prefers-reduced-transparency: reduce":

- Use solid Landing surfaces.
- Remove backdrop blur, noise, depth dust, local bloom, and cursor spotlight.
- Flatten perspective and foreground overlap into readable in-frame metadata.

Hover styling is gated by "(hover: hover) and (pointer: fine)". Touch and
keyboard have equivalent visible selected states; keyboard-initiated stage and
layer changes do not wait for cinematic animation.

---

# H. Component Architecture

## H.1 Future file layout

Landing presentation components and CSS stay within a Landing-only boundary.
The only exceptions are the root-document metadata baseline and a minimal
route-title mechanism; neither changes Console UI, Console data flow, or route
contracts:

    frontend/
      index.html                         # static root Landing metadata only
      src/
        app/
          useRouteDocumentTitle.ts       # native title mapping, no SEO library
        pages/
          LandingPage.tsx
          landing.page.spec.tsx
        components/landing/
          LandingNav.tsx
          LandingHero.tsx
          HeroSecurityWorkbench.tsx
          ProductSurfaceFrame.tsx
          EnvironmentLayer.tsx
          EvidenceTrace.tsx
          SectionTypographyBeat.tsx
          EvidenceRail.tsx
          AttackSurfaceMap.tsx
          SkillInspectionSurface.tsx
          RuntimeDecisionStage.tsx
          RuntimeStageRail.tsx
          PlatformLayerStack.tsx
          EvidencePipeline.tsx
          LandingCta.tsx
          LandingFooter.tsx
        content/
          landing-content.ts
        hooks/
          useLandingInView.ts
          usePointerSpotlight.ts
          useMagneticOffset.ts
          useRuntimeStage.ts
          useCinematicSequence.ts
        styles/
          landing.css
      public/landing/
        console-overview-2x.webp
        landing-noise.webp
        agent-security-platform-og.png
        LICENSES.md

Asset names may be refined, but assets stay Landing-owned and carry intrinsic
dimensions. Do not put Landing components inside sandbox-specific showcase code.
`landing.css` may consume shared `:root` semantic tokens but declares all
Landing presentation variables on `.landing-page`; Hero/Runtime cinematic
overrides remain on their scene roots. It must not add Landing-only variables or
selectors to Console scope.

## H.2 Component responsibilities

| Component | Responsibility | Data / dependency boundary |
| --- | --- | --- |
| LandingPage | semantic main, section order, root metadata handoff, skip target | static content only; no fetch |
| LandingNav | sticky desktop nav and accessible mobile dialog | anchors and Console URL only |
| LandingHero | copy, actions, Hero scene composition / semantic figure | static copy and visual labels |
| HeroSecurityWorkbench | Hero-specific runtime product chrome, detector/evidence/policy surfaces | authored illustrative scenario only; no real-time data or fake metric |
| ProductSurfaceFrame | shared small-radius technical frame, chrome slots, and depth-safe surface boundary | pure presentation; used by Hero, Analyze, Runtime, Platform only where it reduces duplication |
| EnvironmentLayer | clipped Z0 environment with gradient, noise, grid fragment, and optional dust configuration | decorative `aria-hidden` layer; no page-wide effect or interactive meaning |
| EvidenceTrace | visual-only cyan trace / scan / contour primitive | labels and state remain external readable HTML |
| SectionTypographyBeat | full-width editorial transition with static/reduced fallback | text is semantic; mask/reveal is enhancement only |
| EvidenceRail | three-plane handoff | static plane list |
| AttackSurfaceMap | decorative paths plus accessible evidence list | static topology data, no engine data |
| SkillInspectionSurface | static capability evidence product visual | static authored label set |
| RuntimeDecisionStage | cinematic decision workspace, detector / policy sequence | authored static scenario; never real verdict claim |
| RuntimeStageRail | keyboard/touch stage selector and explanation | controlled selected stage |
| PlatformLayerStack | first-party screenshot frame, three-layer overlay/copy proof | owned assets, static layer copy; fixed image never changes by selection |
| EvidencePipeline | compact text-first architecture rail | static process list |
| LandingCta | shared link semantics, press, optional magnetic decoration | href and action hierarchy |
| LandingFooter | restrained product links | static links only |

## H.3 Hooks and animation primitives

- "useLandingInView": IntersectionObserver boolean enhancement. It disconnects
  after one-time reveal and only enhances visible-by-default content.
- "usePointerSpotlight": Motion values or requestAnimationFrame-managed element
  transform, not React state. It may also write Hero/Runtime-local perspective
  CSS variables; it never moves prose/controls, tracks globally, or runs on
  coarse pointer/reduced motion.
- "useMagneticOffset": capped visual offset for primary CTA only. Link retains
  normal layout and works without hook.
- "useRuntimeStage": IntersectionObserver sentinels select one of four discrete
  stages. It must not listen to every scroll pixel.
- "useCinematicSequence": finite authored scene playback for Hero/Runtime.
  It cancels stale animations/timers on unmount or checkpoint change, seeks
  directly to stable stage end states when scrolling skips forward, pauses out
  of view, and never loops automatically. The Hero sequence initializes once
  per `LandingPage` mount, never on a child re-render, and does not use browser
  storage. Reduced motion returns final state.
- "useRouteDocumentTitle": a small native route-title boundary. It maps `/` to
  `Agent Security Platform` and Console routes to `Agent Security Platform
  Console`; it changes `document.title` only and does not attempt dynamic Open
  Graph tags in the Vite SPA.

Use current Ant Design icons only where familiar icon is necessary. Navigation
and CTA actions remain text links; visual status symbols are descriptive HTML /
CSS, not icon-button substitutes.

---

# I. Implementation Risks and Mitigations

| Risk | Why it matters | Mitigation / acceptance gate |
| --- | --- | --- |
| Spectacle / cyberpunk drift | Cyan depth and motion can become a hacker-template visual | One primary visual event per viewport; neutral canvas dominates; atmospheric layers remain local/subordinate; no Matrix, globe, hoods, purple field, full-page neon, or dense particle system |
| Ant Design drift | Dashboard components would make public entry generic | Native presentation components and Landing-only CSS; share tokens only |
| Misleading live claim | Static visual data can appear to be real verdict | Visible provenance on illustrative scenes; no fetch, fake metrics, `LIVE` badge, current timestamp, or unverifiable telemetry; counters equal visible authored evidence |
| Console regression | Route restructuring / global CSS could alter operational paths | Pathless Console parent preserves URLs; root isolation and existing Console tests pass |
| Performance / GPU overdraw | Two cinematic scenes, local bloom, fonts, and media can slow first load or scroll | route lazy loading, two screenshots maximum, reserved aspect ratios, section-clipped compositor layers, observer pause, no animated large filter/backdrop blur/canvas field, mobile flattening |
| Motion sickness | Sticky scene, scan, spotlight, and depth can overload | full reduced-motion end state; no global tracking; no scroll-jacking; keyboard state immediate; mobile static sequence |
| Sequence desynchronization | Causal Runtime scene can look broken when scroll checkpoints change quickly | finite sequence state, cancel stale animation/timers, seek to stable end state, one explicit replay only |
| Accessibility | Visualizations can hide narrative from keyboard / screen readers | semantics, one H1, summaries, real controls, focus rings, dialog focus management, no color-only state |
| Font FOIT | Target fonts are absent today | licensed WOFF2 subsets, fallback stacks, font-display swap, stable measures |
| Screenshot drift | Console UI evolves | local capture during implementation; neutral caption; future screenshot refresh checklist |
| Mobile depth collapse | Product layers and mono identifiers can become illegible at 320-390px | flatten perspective, remove dust/parallax, reflow chrome into vertical bands, preserve final decision/evidence text, screenshots at 320 and 390 |
| Reference contamination | Fidelity review could accidentally import reference IP | principle-only matrix; reference captures remain temporary/outside shipped assets and source control; provenance review of every shipped visual |
| Subjective visual completion | Functional tests can pass while page still feels generic, and an implementation author can overrate their own work | scored side-by-side Visual Fidelity Acceptance Gate, mandatory deltas/review loop, automatic generic-layout failure, and final user or independent-review approval; implementation self-score is provisional only |
| Vite SPA metadata limit | A client-rendered route cannot supply reliable per-route social metadata to non-JavaScript crawlers | Static root metadata and first-party OG preview describe `/`; native client title updates preserve Console context; no claim of per-route OG without SSR/prerendering |
| Maintainability | Giant page component or shared globals become hard to evolve | focused scene primitives, static content module, finite sequence state, `.landing-page` CSS scope, no state library |

---

# J. Acceptance Criteria

## Product and narrative

- Root "/" is a Product Landing Page; "/console" reaches existing Console entry;
  existing Console paths retain behavior.
- First viewport communicates product, value proposition, and working Console
  CTA before scroll.
- Story progresses Discover -> Analyze -> Contain, then unifies layers and
  closes with product CTA.
- Each major act uses one product visual and outcome, not a generic card grid.
- All visualizations are original; screenshots are first-party; reference
  logos, screenshots, copy, and visual IP never appear.
- Static scenes never claim live telemetry or real-time verdicts.
- Display headlines and short CTA labels are English; explanatory product copy
  is Chinese; technical identifiers retain English mono treatment. The page
  never repeats two full translations at the same hierarchy level.

## Visual quality

- At 1440px the page reads as **70% premium restraint + 30% controlled
  spectacle**: mature dark technical product, strong whitespace, hairlines,
  small-radius product frames, local cinematic depth, and sparse cyan evidence
  energy.
- It belongs to Console through color, metadata, risk, and technical language
  while being substantially more cinematic and spacious. Console itself remains
  operational, dense, and quiet.
- Hero reads first as a credible running security product surface and second as
  an embedded topology. It visibly contains input/evidence hierarchy, detector
  state, risk reason, policy state, and decision outcome without fake telemetry.
- Runtime visibly completes Input -> Trust Resolver -> three independent
  Detectors -> evidence convergence -> Policy Gate -> Decision. Its final
  `policy_action: deny` and `containment: active` result has weight without
  relying on a red alarm or endless pulse.
- The energy curve reads Hero WOW -> Discover mysterious -> Analyze precise ->
  Runtime PEAK -> Platform proof -> Architecture clarity -> Final CTA quiet.
- Hero, Runtime, and Platform expose clear Z0 environment / Z1 product surface
  / Z2 foreground accent separation. Across the desktop narrative,
  approximately 50-60% product-like visual evidence and 40-50%
  conceptual/editorial visualization is a directional composition target, not
  a pixel-area gate. Hero reads product-first; Analyze has credible inspection
  UI; Runtime reads as a running security workspace; Platform provides
  first-party product proof. At least two full-width typography beats interrupt
  a repetitive eyebrow + H2 + body rhythm.
- The page contains no Matrix green, code rain, globe, hooded-person imagery,
  0/1 field, broad purple gradient, generic glass field, giant page-wide glow,
  or dense/fast/full-page particle system. Sparse section-local depth dust is
  permitted only inside Hero/Runtime under its motion budget.
- Hero and Runtime are cinematic peaks; normal resting page stays quiet. Next
  section cue remains visible below Hero at desktop and mobile QA viewports.
- Final visual completion cannot be granted by the implementation agent's
  self-score alone. The Visual Fidelity Acceptance Gate requires either explicit
  user approval after reviewing the required artifacts or a recorded independent
  visual-review pass; otherwise the result is only provisional.

## Interaction and accessibility

- Exactly one H1; sequential heading order; clear landmarks; skip link reaches
  main.
- CTAs are semantic links with real hrefs. Interactive visual controls work by
  keyboard, pointer, and touch.
- Product chrome that is not interactive is rendered as text/status, never a
  fake button. Runtime stage controls, Platform layers, and optional Replay are
  real labelled controls with immediate keyboard state.
- Focus states meet contrast; icon controls have names; mobile dialog traps and
  restores focus.
- Body text meets WCAG AA. Security colors are never sole state carrier.
- Reduced motion removes travel, scan, spotlight, magnetic, sticky choreography,
  perspective, dust, bloom dissipation, and loops while retaining all
  information in a polished settled product surface.
- At 320px, 390px, 768px, 1024px, 1440px: no horizontal overflow, clipped
  essential copy, overlap, or unreadable technical identifier.
- Mixed Chinese / English copy passes line-wrap and reading-order QA at desktop
  and mobile widths; no CTA, product state, or technical identifier depends on
  a translation hidden by crop or hover.

## Visual Fidelity Acceptance Gate

Passing functional tests is insufficient. This gate is mandatory after browser
QA and before declaring the Landing complete.

### Review authority

**The implementation agent's visual self-score is advisory only and cannot
independently satisfy the Visual Fidelity Acceptance Gate.** It may capture
artifacts, compare principles, and record a provisional score to guide normal
development iteration. Final visual acceptance additionally requires at least
one of the following:

1. The user explicitly reviews the labelled side-by-side contact sheets /
   recordings and approves the visual result; or
2. A reviewer agent, reviewer, or fresh review context that did not author the
   visual implementation performs a relatively independent review of the actual
   artifacts, records deltas, and approves the result.

If neither is available, mark the score **PROVISIONAL**. Work may continue and
the score may guide iteration, but the requirement must not be marked final
visual completion or complete pending user approval. A Spec author self-review
is documentation QA, not an implementation visual approval.

1. Capture our Hero, Discover, Analyze, Runtime, and Platform Overview at
   1440x900 with identical browser, zoom, DPR, and color-profile settings.
   Runtime additionally needs frames for detector evaluation and
   policy-resolved state.
2. In the same QA session, capture the current mapped reference regions from
   Linear, Wiz, and Vercel. Build labelled temporary side-by-side contact sheets
   for review. Reference captures remain outside shipped assets and source
   control; they are not design resources.
3. Record Hero entrance and the complete 4.8-5.4s Runtime sequence. Review
   Runtime at 0.25x speed to confirm branch, completion, convergence, policy,
   and decision occur in the specified causal order. Still screenshots alone do
   not validate motion quality.
4. Score each applicable section using `0`, `1`, or `2` against its matrix
   principle: visual scale, whitespace, typography hierarchy, product-surface
   prominence, background richness, section rhythm, depth, motion causality,
   CTA prominence, and overall premium feeling.

| Score | Meaning |
| --- | --- |
| 0 | absent, generic, or materially below the mapped reference principle |
| 1 | credible but visibly under-resolved |
| 2 | comparable craft and confidence without imitation |

Normalization is fixed so the visual gate cannot be hand-waved. Score Hero,
Discover, Analyze, Runtime, and Platform Overview. For each section, divide
the sum of its applicable criteria by `2 x applicable criterion count`.
`CTA prominence` may be marked N/A only where that section intentionally has no
CTA; all other criteria are mandatory. The page-wide score is the weighted sum:

| Section | Page-wide fidelity weight |
| --- | ---: |
| Hero | 28% |
| Discover | 14% |
| Analyze | 14% |
| Runtime | 30% |
| Platform overview | 14% |

Architecture, Final CTA, and Footer receive a separate pass/fail review for
their mapped fidelity principle, source provenance, readable hierarchy, and
place in the energy curve. Any failure blocks delivery even though they do not
enter the five-scene numeric score.

Pass conditions (numeric thresholds are necessary, but not sufficient for final
visual approval):

- Page-wide normalized score is >= 85%; Hero and Runtime each score >= 90%;
  Discover, Analyze, and Platform Overview each score >= 80%.
- No zero is allowed in typography hierarchy, product-surface prominence,
  depth, or overall premium feeling. Hero and Runtime must score `2` for motion
  causality.
- Every `0` or `1` receives a written visual delta and another review pass.
  The implementation agent may perform that iterative re-check, but a final
  approval cannot be only its own re-score. Accessibility, provenance,
  responsive, and performance gates cannot be traded for a visual score.
- The required user approval or relatively independent visual-review approval
  is recorded with the final artifacts. Without it, report only a
  **PROVISIONAL** score even when every numeric threshold is met.
- Reduced-motion captures show complete Hero and Runtime information with no
  scan, parallax, spotlight, dust, camera shift, or dissipation.
- 390x844 and 320x568 captures show intentional flattened compositions rather
  than compressed desktop spectacle.
- Performance inspection shows no animation-driven per-frame layout
  recalculation, no pointer-triggered React render loop, and no newly repeated
  >50ms long task caused by a cinematic sequence.

Automatic visual failure conditions:

- The delivered page can be summarized as `headline + gradient + feature cards
  + screenshot + CTA`.
- Hero reads as a diagram before it reads as a product.
- Runtime fails to communicate causal sequence or all chapters carry equal
  visual energy.
- A Linear, Wiz, Vercel, customer, stock, or other proprietary asset appears
  in the repository or shipped output.
- A mapped reference cannot be reached during final review and the absence is
  not recorded; no one may claim that comparison was performed.

## Engineering and verification

- No Landing component requests backend / engine data, writes browser storage,
  or adds shared contract.
- Existing Console URLs and visual tests remain green.
- Landing is route-split; below-fold media lazy loads; screenshots have
  intrinsic dimensions and optimized formats.
- Tests cover root isolation, Console redirect, content hierarchy, CTA
  destinations, provenance, mobile navigation, cinematic scene checkpoint
  state, and reduced-motion final state.
- Browser screenshot review occurs at desktop 1440x900, tablet 1024x768,
  mobile 390x844, and narrow mobile 320x568 before requirement completion.
- Static root metadata includes the specified title, description, theme color,
  Open Graph fields, and first-party OG image. Its Vite SPA limitation is
  documented: static social metadata represents `/`, while client navigation
  updates document title only.
- Hero and Runtime are observer-gated, stop nonessential visual work out of
  view, keep pointer movement out of React render state, and use compositor-
  friendly animation. No new animation library, API, storage, engine coupling,
  or third-party visual asset is introduced.
- The implementation plan must be written against this final refined Spec before
  production work starts; the previous quiet-scene plan is not a valid execution
  authority.

---

# Visual Ambition Upgrade Delta

| Area | Previous direction | Upgraded direction | Guardrail retained |
| --- | --- | --- | --- |
| Visual ambition | Quiet dark product page with one restrained expressive runtime scene | 70% premium restraint + 30% controlled spectacle, with two intentional cinematic peaks | Console remains dense/quiet; ordinary page UI remains calm |
| Hero composition | Abstract Decision Topology beside copy | Edge-reaching Runtime Security Workbench with embedded topology, product chrome, evidence, detector, risk, and policy surfaces | Static authored scenario, clear provenance, no fake telemetry |
| Runtime cinematic sequence | Framed branch/converge flow over 1.8-2.4s | 4.8-5.4s causal decision workspace: Input -> Resolver -> detector branches -> evidence -> Policy -> settled decision | No scroll-jacking, finite state, reduced-motion settled state |
| Background environment | Near-black canvas, grid, and small local halo | Section-local Z0 environment with radial fields, masked grids, noise, coordinate marks, and sparse depth dust | No page-wide glow, no dense particles, no text beneath decoration |
| Product-surface strategy | Original illustrations with one or two screenshots | Approximately 50-60% product-like evidence / 40-50% conceptual visualization as directional composition intent; believable marketing-grade product surfaces | First-party screenshot only, visible illustrative labels, no fake metrics |
| Section transitions | Chapters primarily separated by rhythm and static rules | Signature evidence trace changes role across Hero/Discover/Analyze/Runtime; two editorial typography beats shape energy | One normal vertical scroll; no fragile page-length SVG or horizontal track |
| Motion tiers | One global conservative motion budget | UI Motion, Narrative Motion, and Hero/Runtime Cinematic Visualization budgets | UI stays fast; all cinematic motion is local, observer-gated, and reduced-motion safe |
| Reference fidelity | Overall Linear/Wiz/Vercel percentage mix | Per-section Visual Fidelity Matrix with Primary/Secondary reference and borrowed principle | Principle-only learning; no copied IP, asset, copy, or mechanics |
| Visual acceptance | Functional/browser checks and screenshots | Side-by-side reference review, scored 0-2 fidelity rubric, motion capture, automatic generic-layout failure, and user or independent visual approval | Accessibility, provenance, performance, responsive QA remain non-negotiable |

## Final Refinement Delta

| Area | Final refinement |
| --- | --- |
| Visual approval | Implementation self-score is advisory. Final visual completion requires explicit user approval or a relatively independent visual-review pass; otherwise the score is `PROVISIONAL`. |
| Product-evidence balance | Replaced the prior rendered-area gate with an approximately 50-60% / 40-50% directional composition target and four qualitative product-proof checks. |
| Bilingual content | Added a role-based English display / Chinese explanation / English mono metadata system with desktop and mobile QA rules. |
| Token scope | Limited shared semantic tokens to `:root`, Landing presentation tokens to `.landing-page`, and cinematic tokens to `.landing-hero` / `.landing-runtime`. |
| Hero lifecycle | Replaced ambiguous legacy lifecycle wording with one entrance per `LandingPage` mount; no storage or child-rerender replay. |
| CSS expressions | Normalized Hero `clamp()` arithmetic to valid `calc(100svh - 64px - 72px)` syntax. |
| Metadata | Defined Vite-compatible root metadata, title behavior, first-party OG preview, and the static-SPA per-route limitation. |
| Visual checkpoints | Added sequencing guidance that makes Hero and Runtime standalone visual gates before full-page fidelity review. |

---

# Implementation Planning Guidance

This is sequencing guidance for the **next** approved planning phase only. It
does not authorize implementation, create an implementation plan, change
production code, or weaken the user-approval gate for this Design Spec.

    Foundation / route / tokens / typography
                ↓
    Hero implementation
                ↓
    Hero browser + visual checkpoint
                ↓
    Discover + Analyze
                ↓
    Discover / Analyze checkpoint
                ↓
    Runtime implementation
                ↓
    Runtime motion recording + causal-sequence checkpoint
                ↓
    Platform / Architecture / CTA / Footer
                ↓
    Full-page integration
                ↓
    Responsive / accessibility / performance pass
                ↓
    Reference side-by-side fidelity review
                ↓
    Visual iteration
                ↓
    User / independent visual approval

Hero and Runtime are mandatory standalone visual checkpoints. Do not wait for
the entire Landing Page to be built before first inspecting Hero at browser
scale or Runtime as a recording and causal sequence. An implementation agent
may use provisional self-scores at every checkpoint to prioritize iteration;
only the final Visual Fidelity Acceptance Gate can receive user or independent
approval.

---

# Self-review checklist

This Design Spec is self-reviewed against user request and repository
constraints:

- [x] Current frontend, Console, route, theme, CSS, component, and test
  architecture were inspected.
- [x] metadata.md, sprint-current.md, api-contract.md, architecture.md,
  progress.md, frontend instructions, and docs instructions were checked.
- [x] Existing frontend opened in real browser and captured at desktop/mobile.
- [x] Linear, Wiz, and Vercel actually opened and analyzed; all were accessible.
- [x] Each reference has conceptual transfers, exclusions, layout, typography,
  motion, visual language, and storytelling observations.
- [x] Three visual directions, trade-offs, and recommendation are explicit.
- [x] Visual Ambition Upgrade explicitly changes the Landing to 70% premium
  restraint + 30% controlled spectacle without changing Console posture.
- [x] Hero and Runtime are defined as cinematic product surfaces with authored
  evidence/provenance rather than abstract diagrams or fake live telemetry.
- [x] Background depth, three rails, directional product-evidence balance,
  typography beats, section trace continuity, and three motion tiers are
  specified.
- [x] Runtime checkpoint/replay authority, Hero cue-height calculation,
  Platform static-depth exception, qualitative product-proof checks, and
  performance budgets are explicit and internally consistent.
- [x] Visual Fidelity Matrix and scored side-by-side acceptance gate are
  explicit; implementation self-score cannot grant final approval; reference
  captures remain temporary and outside shipped assets.
- [x] IA, section layouts, copy, visual, interaction, motion, responsive,
  tokens, components, risks, and acceptance criteria are complete.
- [x] Console paths and behavior are protected; no API, engine, shared contract,
  dependency, or unapproved font CDN is introduced.
- [x] Visual asset provenance, performance, accessibility, and reduced motion
  are explicit.
- [x] Bilingual content roles are consistent: English display and commands,
  Chinese explanation, and English mono identifiers; mixed-language QA is
  required at desktop and mobile widths.
- [x] Shared semantic tokens stay in `:root`; Landing presentation tokens are
  scoped to `.landing-page`; Hero / Runtime cinematic tokens remain local.
- [x] Hero entrance runs once per `LandingPage` mount without storage, while
  child rerenders do not replay it; no legacy lifecycle ambiguity remains.
- [x] All Hero `clamp()` arithmetic uses valid `calc()` syntax.
- [x] Vite's static-metadata limitation, root title / OG strategy, and
  first-party share-preview provenance are explicit.
- [x] This refinement adds no new visual effect, animation library, API,
  storage, or extra cinematic section; Hero and Runtime remain the only
  Cinematic Visualization tier.
- [x] No placeholder, TODO, unresolved visual decision, or contradiction
  remains. Font license / source is an explicit implementation prerequisite.
