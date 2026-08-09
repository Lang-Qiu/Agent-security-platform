# Agent Security Platform Product Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Every production behavior uses
> `superpowers:test-driven-development`; every completed task receives a focused
> code review before the next task begins.

**Goal:** Build the approved Cinematic Precision Agent Security Landing Page at
`/`, preserve the operational Console at its existing URLs, and expose
`/console` as a redirect to `/overview`.

**Architecture:** The Landing is a lazy React route with static authored content,
Landing-owned components/assets, and a route-imported `.landing-page` stylesheet.
Existing `:root --console-*` values remain the shared semantic layer; Landing
presentation tokens live only under `.landing-page`, while Hero/Runtime cinematic
tokens live only on their scene roots. Hero and Runtime use finite, cancellable
state machines over the already-installed Motion package and browser observers;
no backend, API, shared contract, storage, or new dependency is introduced.

**Tech Stack:** React 19.2.4, TypeScript 6.0.2, React Router 7.13.2, Ant Design
icons only where needed, Motion 13.0.0, Vite 8.0.2, Vitest 4.1.1, Testing
Library 16.3.2, CSS custom properties, Playwright Core 1.60, local Chrome.

---

## Document Status

- Requirement: Product Landing Page
- Plan revision: v2.2, generated from the final refined Design Spec and
  independently audited for TDD/visual-gate executability
- Date: 2026-08-09
- Status: `PLAN_COMPLETE_PENDING_EXECUTION_APPROVAL`
- Canonical Design Spec:
  `docs/superpowers/specs/2026-08-09-agent-security-platform-product-landing-page-design.md`
- Delivery of this phase: documentation only; this is an explicit exception to
  RED/GREEN because no production behavior changes in the planning phase.
- Execution authority: not granted by this document. The user must explicitly
  approve implementation and resolve the requirement/worktree gates in Task 0.
- Supersession: this document replaces the earlier quiet-scene implementation
  plan in full.

## Non-Negotiable Boundaries

1. `/` is Landing; `/console` replace-redirects to `/overview`; all current
   Console URLs remain root-level and unchanged.
2. Landing performs no `fetch`, API call, engine import, shared-contract import,
   browser-storage write, cookie write, telemetry, analytics, or live verdict.
3. Authored product scenarios are visibly labelled illustrative. Evidence
   counters equal the authored rows visible in the same scene.
4. English owns display headlines, short CTA labels, and technical states;
   Chinese owns explanatory copy; technical identifiers remain English mono.
5. Sandbox showcase components, data, shared decision types, Console panels,
   and `showcase-*` CSS are not Landing dependencies. Reuse principles only:
   timer cleanup, reduced-motion settlement, status semantics, and local pointer
   math.
6. No new animation/UI/state/SEO dependency, WebGL, shader, Canvas particle
   system, video background, new cinematic section, or extra typography beat.
7. Hero and Runtime remain the only Cinematic Visualization scenes. Console
   remains dense, operational, and quiet.
8. Visual self-scores are provisional. Final visual completion requires user
   approval of contact sheets/recordings or a relatively independent reviewer.

## File Map

### Create

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/useRouteDocumentTitle.ts` | native route title effect, no SEO library |
| `frontend/src/pages/LandingPage.tsx` | semantic route shell, section order, `lang`, CSS import |
| `frontend/src/pages/landing.page.spec.tsx` | narrative, bilingual, provenance, CTA, isolation tests |
| `frontend/src/content/landing-content.ts` | typed authored Landing copy/state only |
| `frontend/src/components/landing/LandingNav.tsx` | sticky nav and accessible mobile dialog |
| `frontend/src/components/landing/LandingHero.tsx` | Hero copy/actions/scene composition |
| `frontend/src/components/landing/HeroSecurityWorkbench.tsx` | product chrome, evidence, detectors, topology, decision |
| `frontend/src/components/landing/ProductSurfaceFrame.tsx` | shared small-radius product frame slots |
| `frontend/src/components/landing/EnvironmentLayer.tsx` | clipped decorative Z0 layer |
| `frontend/src/components/landing/EvidenceTrace.tsx` | decorative signature trace primitive |
| `frontend/src/components/landing/SectionTypographyBeat.tsx` | two editorial transitions with settled fallback |
| `frontend/src/components/landing/EvidenceRail.tsx` | Discover/Analyze/Contain handoff rail |
| `frontend/src/components/landing/AttackSurfaceMap.tsx` | Discover product/evidence surface |
| `frontend/src/components/landing/SkillInspectionSurface.tsx` | Analyze inspection surface |
| `frontend/src/components/landing/RuntimeDecisionStage.tsx` | causal runtime workspace |
| `frontend/src/components/landing/RuntimeStageRail.tsx` | keyboard/touch checkpoint controls |
| `frontend/src/components/landing/PlatformLayerStack.tsx` | fixed first-party screenshot and layer selector |
| `frontend/src/components/landing/EvidencePipeline.tsx` | Observe-to-Audit architecture rail |
| `frontend/src/components/landing/LandingCta.tsx` | final semantic actions |
| `frontend/src/components/landing/LandingFooter.tsx` | compact real links only |
| `frontend/src/components/landing/landing-nav.spec.tsx` | dialog/focus/link tests |
| `frontend/src/components/landing/landing-hero.spec.tsx` | Hero content, lifecycle, fallback tests |
| `frontend/src/components/landing/landing-visualizations.spec.tsx` | Discover/Analyze tests |
| `frontend/src/components/landing/runtime-decision-stage.spec.tsx` | checkpoint/replay/causality tests |
| `frontend/src/components/landing/platform-layer-stack.spec.tsx` | fixed-image/layer/pipeline tests |
| `frontend/src/hooks/useLandingInView.ts` | one-time observer enhancement with cleanup |
| `frontend/src/hooks/useNarrativeSequence.ts` | pausable one-shot Discover/Analyze progression |
| `frontend/src/hooks/usePointerSpotlight.ts` | local CSS variables without React render state |
| `frontend/src/hooks/useMagneticOffset.ts` | capped Hero primary-CTA offset |
| `frontend/src/hooks/useRuntimeStage.ts` | four discrete observer checkpoints |
| `frontend/src/hooks/useCinematicSequence.ts` | finite Hero/Runtime playback and cancellation |
| `frontend/src/hooks/landing-motion-hooks.spec.tsx` | observer/pointer/magnetic tests |
| `frontend/src/hooks/cinematic-sequence.spec.tsx` | mount/replay/cancel/reduced-motion tests |
| `frontend/src/styles/landing.css` | all scoped Landing tokens, layout, motion, fallbacks |
| `frontend/public/landing/console-overview-2x.webp` | owned Console product proof, fixed dimensions |
| `frontend/public/landing/landing-noise.webp` | owned <=16 KiB grayscale texture |
| `frontend/public/landing/agent-security-platform-og.png` | owned 1200x630 share preview |
| `frontend/public/landing/fonts/geist-latin.woff2` | approved self-hosted display/UI subset |
| `frontend/public/landing/fonts/geist-mono-latin.woff2` | approved self-hosted mono subset |
| `frontend/public/landing/fonts/noto-sans-sc-regular.woff2` | approved Chinese regular subset |
| `frontend/public/landing/fonts/noto-sans-sc-semibold.woff2` | approved Chinese semibold subset |
| `frontend/public/landing/LICENSES.md` | provenance/license/hash ledger for every shipped asset |

### Modify

| Path | Change |
| --- | --- |
| `frontend/index.html` | static root title/description/theme/OG/Twitter metadata |
| `frontend/src/app/routes.tsx` | lazy Landing route, `/console` redirect, pathless Console parent |
| `frontend/src/app/app-shell.spec.tsx` | replace obsolete root redirect test; pin route isolation |
| `frontend/src/layouts/ConsoleLayout.tsx` | set existing Console document title only |
| `tests/repository/frontend-console-theme-literals.spec.ts` | Landing token/source/asset/metadata gates |
| `README.md` | public and Console entry URLs after delivery |
| `docs/architecture.md` | route/presentation/motion/metadata boundary |
| `docs/progress.md` | final requirement evidence and provisional/final visual status |
| `docs/sprint-current.md` | only after explicit user supersession; never inferred |

### Explicitly Do Not Modify

- `frontend/src/main.tsx`, `frontend/src/app/App.tsx`,
  `frontend/src/app/AppProviders.tsx`
- `frontend/src/app/navigation.tsx` and all existing Console `Link` destinations
- `frontend/src/styles/app.css`; it keeps only shared Console/showcase root tokens
- `frontend/src/components/sandbox-security/**`,
  `frontend/src/content/sandbox-security-showcase.ts`
- `frontend/package.json`, `pnpm-lock.yaml`; Motion is already installed
- `electron/src/main.mjs`; `/review-demo` must remain unchanged
- `backend/**`, `shared/**`, `engines/**`, `docs/api-contract.md`

---

## Browser QA Server Procedure

Use this exact lifecycle for every browser checkpoint; choose a different
explicit port if 5184 is occupied and never terminate an existing process:

```powershell
if ([string]::IsNullOrWhiteSpace($env:VITE_PUBLIC_ORIGIN)) {
  throw 'VITE_PUBLIC_ORIGIN must be supplied by the approved deployment configuration.'
}
$landingOriginText = $env:VITE_PUBLIC_ORIGIN
$landingOriginUri = $null
$landingOriginValid = [Uri]::TryCreate($landingOriginText, [UriKind]::Absolute, [ref]$landingOriginUri)
if (-not $landingOriginValid -or
    $landingOriginText -cne $landingOriginText.Trim() -or
    $landingOriginUri.Scheme -cne 'https' -or
    [string]::IsNullOrWhiteSpace($landingOriginUri.Host) -or
    $landingOriginUri.AbsolutePath -ne '/' -or
    $landingOriginUri.Query -ne '' -or
    $landingOriginUri.Fragment -ne '' -or
    $landingOriginUri.UserInfo -ne '' -or
    $landingOriginText -cne $landingOriginUri.GetLeftPart([UriPartial]::Authority)) {
  throw 'VITE_PUBLIC_ORIGIN must be a bare HTTPS origin with no credentials, path, query, fragment, trailing slash, or surrounding whitespace.'
}
$landingQaPort = 5184
if (Get-NetTCPConnection -LocalPort $landingQaPort -ErrorAction SilentlyContinue) {
  throw "Port $landingQaPort is already in use; choose another explicit unused port."
}
$landingQaStateDir = Join-Path (Resolve-Path '.').Path 'docs\temp\landing-visual'
$landingQaStatePath = Join-Path $landingQaStateDir '.qa-server.json'
if (Test-Path -LiteralPath $landingQaStatePath) {
  throw "A prior QA state file exists at $landingQaStatePath; inspect it instead of starting another server."
}
New-Item -ItemType Directory -Path $landingQaStateDir -Force | Out-Null
$landingQaRoot = (Resolve-Path 'frontend').Path
$landingQaNode = (Get-Command 'node.exe').Source
$landingQaVite = Join-Path $landingQaRoot 'node_modules\vite\bin\vite.js'
$landingQaServer = Start-Process -FilePath $landingQaNode -WorkingDirectory $landingQaRoot -ArgumentList $landingQaVite, '--config', 'vite.config.mjs', '--configLoader', 'native', '--host', '127.0.0.1', '--port', "$landingQaPort", '--strictPort' -PassThru -WindowStyle Hidden
$landingQaDeadline = (Get-Date).AddSeconds(20)
do {
  try {
    $landingQaReady = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$landingQaPort/" -TimeoutSec 1).StatusCode -eq 200
  } catch {
    $landingQaReady = $false
  }
  if (-not $landingQaReady) { Start-Sleep -Milliseconds 250 }
} until ($landingQaReady -or $landingQaServer.HasExited -or (Get-Date) -ge $landingQaDeadline)
if (-not $landingQaReady) {
  if (-not $landingQaServer.HasExited) { Stop-Process -Id $landingQaServer.Id -Force }
  throw "Vite did not become ready on http://127.0.0.1:$landingQaPort/."
}
$landingQaListener = Get-NetTCPConnection -LocalPort $landingQaPort -State Listen
if ($landingQaListener.OwningProcess -ne $landingQaServer.Id) {
  Stop-Process -Id $landingQaServer.Id -Force
  throw 'The recorded Vite PID does not own the requested listener.'
}
[pscustomobject]@{
  pid = $landingQaServer.Id
  port = $landingQaPort
  nodePath = $landingQaNode
  startedUtc = $landingQaServer.StartTime.ToUniversalTime().ToString('O')
} | ConvertTo-Json | Set-Content -LiteralPath $landingQaStatePath -Encoding utf8
"QA server ready: http://127.0.0.1:$landingQaPort/ (PID $($landingQaServer.Id)); state: $landingQaStatePath"
```

Open the exact URL printed by the start block with the available Chrome DevTools or
Playwright browser tooling. Save only project screenshots/recordings to the
named `docs/temp/landing-visual/` folder; reference-site captures remain
temporary and untracked. After the checkpoint, stop only the recorded process:

```powershell
$landingQaStatePath = Join-Path (Resolve-Path '.').Path 'docs\temp\landing-visual\.qa-server.json'
if (-not (Test-Path -LiteralPath $landingQaStatePath)) {
  throw 'QA state file is missing; do not guess a PID or terminate another server.'
}
$landingQaState = Get-Content -Raw -LiteralPath $landingQaStatePath | ConvertFrom-Json
$landingQaListeners = @(Get-NetTCPConnection -LocalPort $landingQaState.port -State Listen -ErrorAction SilentlyContinue)
if ($landingQaListeners.Count -gt 0 -and
    @($landingQaListeners | Where-Object OwningProcess -ne $landingQaState.pid).Count -gt 0) {
  throw 'The recorded port is now owned by another process; do not terminate it.'
}
$landingQaProcess = Get-Process -Id $landingQaState.pid -ErrorAction SilentlyContinue
if ($null -ne $landingQaProcess) {
  $sameExecutable = $landingQaProcess.Path -eq $landingQaState.nodePath
  $sameStart = $landingQaProcess.StartTime.ToUniversalTime().ToString('O') -eq $landingQaState.startedUtc
  if (-not $sameExecutable -or -not $sameStart) {
    throw 'The recorded PID was reused; do not terminate it.'
  }
  Stop-Process -Id $landingQaState.pid -Force
  Wait-Process -Id $landingQaState.pid -Timeout 10 -ErrorAction SilentlyContinue
}
if (Get-NetTCPConnection -LocalPort $landingQaState.port -State Listen -ErrorAction SilentlyContinue) {
  throw "QA server cleanup failed: port $($landingQaState.port) is still listening."
}
Remove-Item -LiteralPath $landingQaStatePath
```

Do not leave the server running when a task ends.

---

## TDD Evidence Model

- Semantic, routing, interaction, lifecycle, and scene authority behavior starts
  in a route-level Vitest/Testing Library RED, then gains direct component/hook
  regression coverage only after the route behavior is GREEN.
- Deterministic presentation contracts such as token ownership, rails, grid,
  fixed type sizes, radius, breakpoints, reduced modes, and scene containment
  start as failing assertions in the existing repository test before their CSS
  is written. These source assertions do not claim visual quality; they make the
  objective contract test-first without adding a screenshot-test dependency.
- Real-browser checkpoints then verify computed layout, overflow, interaction,
  timing, and visual fidelity. A screenshot review is verification evidence, not
  a substitute for the preceding RED. Subjective fidelity deltas that change
  source follow the same narrow RED -> fix -> GREEN -> recapture loop.

---

## Task 0: Establish an Executable Baseline Without Losing User Work

**Files:** none unless the user explicitly authorizes `docs/sprint-current.md`.

- [ ] **Step 1: verify requirement ownership**

`docs/sprint-current.md` currently names `REQ-SBX-GENERAL-005`. Before any test
or production edit, obtain one auditable state:

1. the user updates it to make Product Landing the sole active requirement; or
2. the user explicitly supersedes it in writing and that message is recorded in
   the implementation log.

If neither exists, stop. Generating this plan does not supersede the sprint.

- [ ] **Step 2: preserve the dirty integration baseline**

Run read-only checks from the current workspace:

```powershell
git status --short
git diff -- frontend/src/app/routes.tsx frontend/src/app/navigation.tsx frontend/src/styles/app.css frontend/package.json pnpm-lock.yaml
git log -1 --format=%H
```

Expected: record that routes, navigation, CSS, package/lock, metadata, and
sandbox showcase work are dirty/untracked. Do not stash, reset, checkout, clean,
or reconstruct these files from `HEAD`.

- [ ] **Step 3: select an approved implementation workspace**

Require a user-approved clean commit that contains the current Console,
Showcase, and Motion baseline, then create the dedicated worktree from that
exact commit. This is mandatory because `routes.tsx` overlaps current uncommitted
Showcase work: exact-path staging cannot separate user changes from the Landing
route rewrite reliably. If no approved clean commit exists, stop; do not
implement or commit from the current dirty workspace, and do not create a
worktree from stale `HEAD`.

```powershell
if ([string]::IsNullOrWhiteSpace($env:LANDING_BASE_SHA)) {
  throw 'Set LANDING_BASE_SHA to the exact clean commit explicitly approved by the user.'
}
$landingBaseSha = (git rev-parse --verify "$($env:LANDING_BASE_SHA)^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $landingBaseSha -notmatch '^[a-f0-9]{40}$') {
  throw 'LANDING_BASE_SHA does not resolve to one commit.'
}
git show --stat --oneline $landingBaseSha
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the approved base commit.' }
git worktree add -b feat/product-landing ..\agent-security-platform-landing $landingBaseSha
if ($LASTEXITCODE -ne 0) { throw 'Unable to create the approved Landing worktree.' }
```

Expected: the chosen workspace includes the current
`SandboxSecurityShowcasePage` route, `motion@13.0.0`, this plan, and its canonical
Design Spec. Otherwise stop before editing tests.

- [ ] **Step 4: verify supported toolchain**

```powershell
node --version
pnpm --version
pyftsubset --help | Select-Object -First 1
$landingFontToolsVersion = (python -m pip show fonttools | Select-String '^Version:').Line.Split(':', 2)[1].Trim()
if ($landingFontToolsVersion -ne '4.63.0') {
  throw "FontTools 4.63.0 is required for reproducible local subsetting; observed $landingFontToolsVersion."
}
```

Expected: Node >= `v22.19.0`, pnpm `10.0.0`. Current observed Node is
`v22.17.0`; switch runtimes before continuing. FontTools `pyftsubset` must be
available at the observed `4.63.0` baseline for the pinned font recipe in Task
7. Do not install or add a project dependency if it is absent; stop and obtain
an approved pre-generated font asset bundle instead.

- [ ] **Step 5: capture automated and visual baselines**

```powershell
pnpm install --frozen-lockfile
npm run test:repo
npm run test:frontend
npm run build --prefix frontend
```

Expected: record exact test counts and any pre-existing warnings. Start Vite on
an unused port with the Browser QA Server Procedure and capture `/overview` at
`1440x900` and `390x844` into
`docs/temp/landing-visual/baseline/`; these are QA evidence, not shipped assets.

No commit is created for Task 0.

---

## Task 1: Lock the Public/Console Route Contract

**Files:**

- Modify: `frontend/src/app/app-shell.spec.tsx`
- Modify: `frontend/src/app/routes.tsx`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`
- Create: `frontend/src/pages/LandingPage.tsx`
- Create: `frontend/src/styles/landing.css`

- [ ] **Step 1: write the route RED tests**

Replace the obsolete root redirect assertion, and move the Console-header test
from `/` to `/overview`. The required test core is:

```tsx
test("root renders Landing without Console chrome", async () => {
  await renderAppAtRoute("/");

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: /secure every decision your agents make/i
    })
  ).toBeInTheDocument();
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("id", "landing-content");
  expect(document.querySelector(".landing-page")).toContainElement(main);
  expect(
    screen.queryByRole("navigation", { name: /console navigation/i })
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/security operations console/i)).not.toBeInTheDocument();
});

test("/console replace-redirects to the existing overview Console", async () => {
  const app = await renderAppAtRoute("/console");

  expect(
    await screen.findByRole("navigation", { name: /console navigation/i })
  ).toBeInTheDocument();
  expect(await screen.findByRole("heading", { level: 1, name: /overview/i }))
    .toBeInTheDocument();
  await waitFor(() => expect(app.router.state.location.pathname).toBe("/overview"));
  expect(app.router.state.historyAction).toBe("REPLACE");
});

test("direct /overview keeps Console chrome and controls", async () => {
  await renderAppAtRoute("/overview");
  expect(await screen.findByRole("banner")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create task/i })).toBeInTheDocument();
  expect(screen.queryByText(/mock data mode/i)).not.toBeInTheDocument();
});
```

Before implementation, extend the existing repository test to prove the route
split itself rather than relying only on the final bundle inspection:

```ts
const routesSource = read("frontend/src/app/routes.tsx");
const mainSource = read("frontend/src/main.tsx");

assert.match(routesSource, /path:\s*["']\/["'][\s\S]*?lazy:\s*async/);
assert.match(routesSource, /import\(["']\.\.\/pages\/LandingPage["']\)/);
assert.doesNotMatch(routesSource, /import\s+\{?\s*LandingPage/);
assert.doesNotMatch(mainSource, /LandingPage|landing\.css/);
```

- [ ] **Step 2: run the narrow route test and verify RED**

```powershell
npm run test --prefix frontend -- src/app/app-shell.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: the root test fails because `/` still redirects to Overview, and the
`/console` test fails because no route exists; the route-split repository
assertions fail because Landing is not lazy. `/overview` remains green. Import,
syntax, or missing-browser-API errors are not acceptable RED.

- [ ] **Step 3: add the minimal semantic Landing tracer bullet**

```tsx
// frontend/src/pages/LandingPage.tsx
import { Link } from "react-router-dom";
import "../styles/landing.css";

export function LandingPage() {
  return (
    <div className="landing-page">
      <a className="landing-skip-link" href="#landing-content">
        Skip to content
      </a>
      <main id="landing-content" lang="zh-CN" tabIndex={-1}>
        <h1 lang="en">Secure every decision your agents make.</h1>
        <Link to="/console">Launch Security Console</Link>
      </main>
    </div>
  );
}
```

Start `landing.css` with only a route boundary:

```css
.landing-page {
  min-height: 100vh;
}
```

- [ ] **Step 4: restructure routes around the current child list**

Use a lazy root route, a replace redirect, and a pathless Console parent. Keep
every current child, including `sandbox-security-showcase`:

```tsx
export const appRoutes: RouteObject[] = [
  {
    path: "/",
    lazy: async () => {
      const { LandingPage } = await import("../pages/LandingPage");
      return { Component: LandingPage };
    }
  },
  {
    path: "/console",
    element: <Navigate to="/overview" replace />
  },
  {
    element: <ConsoleLayout />,
    children: [
      { path: "overview", element: <OverviewPage /> },
      { path: "tasks", element: <TaskListPage /> },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      { path: "results/assets", element: <AssetResultPage /> },
      { path: "results/static-analysis", element: <StaticAnalysisPage /> },
      { path: "results/sandbox", element: <SandboxAlertsPage /> },
      { path: "sandbox-security/workbench", element: <SandboxSecurityWorkbenchPage /> },
      { path: "sandbox-security/audit", element: <SandboxSecurityAuditPage /> },
      { path: "review-demo", element: <ReviewDemoPage /> },
      { path: "sandbox-security-showcase", element: <SandboxSecurityShowcasePage /> }
    ]
  }
];
```

- [ ] **Step 5: verify route GREEN and Console regressions**

```powershell
npm run test --prefix frontend -- src/app/app-shell.spec.tsx src/layouts/console-menu.spec.tsx src/app/sandbox-security-navigation.spec.tsx src/pages/overview.page.spec.tsx src/pages/review-demo.page.spec.tsx src/pages/sandbox-security-showcase.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
npm run build --prefix frontend
```

Expected: all pass; `/review-demo` remains root-level and existing navigation is
unchanged. Inspect `frontend/dist/assets`: the Landing headline/CSS must occur in
a lazy non-entry chunk, never the eager route-shell entry.

- [ ] **Step 6: commit only the route tracer bullet**

```powershell
git add frontend/src/app/app-shell.spec.tsx frontend/src/app/routes.tsx frontend/src/pages/LandingPage.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): establish product landing route"
```

---

## Task 2: Add Route Metadata, Token Scope, and Typography Foundation

**Files:**

- Modify: `frontend/index.html`
- Modify: `frontend/src/app/app-shell.spec.tsx`
- Create: `frontend/src/app/useRouteDocumentTitle.ts`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/layouts/ConsoleLayout.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write failing title, metadata, and token-scope tests**

Add route-title assertions to `app-shell.spec.tsx` only after Task 1 is green:

```tsx
test("Landing and Console own distinct document titles", async () => {
  const landing = await renderAppAtRoute("/");
  expect(document.title).toBe("Agent Security Platform");
  landing.unmount();

  await renderAppAtRoute("/overview");
  expect(document.title).toBe("Agent Security Platform Console");
});
```

Extend the repository test with static assertions:

```ts
test("Landing metadata and token scopes stay route-owned", () => {
  const html = read("frontend/index.html");
  const appCss = read("frontend/src/styles/app.css");
  const landingCss = read("frontend/src/styles/landing.css");
  const approvedDescription = "Secure every decision your agents make - from attack-surface discovery and Skill analysis to runtime security evaluation.";

  assert.match(html, /<title>Agent Security Platform<\/title>/);
  assert.ok(html.includes(`<meta name="description" content="${approvedDescription}" />`));
  assert.match(html, /name="theme-color" content="#080c10"/);
  assert.match(html, /property="og:title" content="Agent Security Platform"/);
  assert.ok(html.includes(`<meta property="og:description" content="${approvedDescription}" />`));
  assert.match(html, /property="og:type" content="website"/);
  assert.match(
    html,
    /property="og:image" content="%VITE_PUBLIC_ORIGIN%\/landing\/agent-security-platform-og\.png"/
  );
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title" content="Agent Security Platform"/);
  assert.ok(html.includes(`<meta name="twitter:description" content="${approvedDescription}" />`));
  assert.match(
    html,
    /name="twitter:image" content="%VITE_PUBLIC_ORIGIN%\/landing\/agent-security-platform-og\.png"/
  );
  assert.doesNotMatch(appCss, /--landing-|--environment-|--cinematic-|--specular-/);
  assert.doesNotMatch(landingCss, /:root\s*\{/);
  assert.doesNotMatch(landingCss, /\.console-/);
  assert.doesNotMatch(landingCss, /--console-[\w-]+\s*:/);

  const presentationBlock = landingCss.match(/\.landing-page\s*\{[^}]*\}/)?.[0];
  const cinematicBlock = landingCss.match(/\.landing-hero\s*,\s*\.landing-runtime\s*\{[^}]*\}/)?.[0];
  assert.ok(presentationBlock, "missing .landing-page token block");
  assert.ok(cinematicBlock, "missing Hero/Runtime cinematic token block");
  assert.match(presentationBlock, /--landing-canvas:/);
  assert.match(cinematicBlock, /--cinematic-bloom-cyan:/);
  assert.match(cinematicBlock, /--specular-line:/);

  const cssOutsideTokenBlocks = landingCss
    .replace(presentationBlock, "")
    .replace(cinematicBlock, "");
  assert.doesNotMatch(
    cssOutsideTokenBlocks,
    /--(?:landing-|environment-|grid-|local-halo-|cinematic-|specular-)[\w-]*\s*:/
  );
  assert.doesNotMatch(cssOutsideTokenBlocks, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
```

- [ ] **Step 2: verify RED for missing metadata/title/tokens**

```powershell
npm run test --prefix frontend -- src/app/app-shell.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: route title remains the old static Console title; metadata and scoped
Landing tokens are absent. Existing Console color tests remain green.

- [ ] **Step 3: implement the native route-title hook**

```ts
import { useEffect } from "react";

export function useRouteDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
```

Call `useRouteDocumentTitle("Agent Security Platform")` in `LandingPage` and
`useRouteDocumentTitle("Agent Security Platform Console")` in
`ConsoleLayout`. Change no Console markup, path, or data behavior.

- [ ] **Step 4: implement static Vite metadata**

Use Vite's supported HTML environment replacement and require
`VITE_PUBLIC_ORIGIN` to be an approved absolute `https://` origin at execution
and deployment time:

```html
<title>Agent Security Platform</title>
<meta name="description" content="Secure every decision your agents make - from attack-surface discovery and Skill analysis to runtime security evaluation." />
<meta name="theme-color" content="#080c10" />
<meta property="og:title" content="Agent Security Platform" />
<meta property="og:description" content="Secure every decision your agents make - from attack-surface discovery and Skill analysis to runtime security evaluation." />
<meta property="og:type" content="website" />
<meta property="og:image" content="%VITE_PUBLIC_ORIGIN%/landing/agent-security-platform-og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Agent Security Platform" />
<meta name="twitter:description" content="Secure every decision your agents make - from attack-surface discovery and Skill analysis to runtime security evaluation." />
<meta name="twitter:image" content="%VITE_PUBLIC_ORIGIN%/landing/agent-security-platform-og.png" />
```

Before build/preview, validate the supplied value:

```powershell
if ([string]::IsNullOrWhiteSpace($env:VITE_PUBLIC_ORIGIN)) {
  throw 'VITE_PUBLIC_ORIGIN must be supplied by the approved deployment configuration.'
}
$landingOriginText = $env:VITE_PUBLIC_ORIGIN
$landingOriginUri = $null
$landingOriginValid = [Uri]::TryCreate($landingOriginText, [UriKind]::Absolute, [ref]$landingOriginUri)
if (-not $landingOriginValid -or
    $landingOriginText -cne $landingOriginText.Trim() -or
    $landingOriginUri.Scheme -cne 'https' -or
    [string]::IsNullOrWhiteSpace($landingOriginUri.Host) -or
    $landingOriginUri.AbsolutePath -ne '/' -or
    $landingOriginUri.Query -ne '' -or
    $landingOriginUri.Fragment -ne '' -or
    $landingOriginUri.UserInfo -ne '' -or
    $landingOriginText -cne $landingOriginUri.GetLeftPart([UriPartial]::Authority)) {
  throw 'VITE_PUBLIC_ORIGIN must be a bare HTTPS origin with no credentials, path, query, fragment, trailing slash, or surrounding whitespace.'
}
```

If the origin is not known, stop this step; do not invent a domain or add a
metadata dependency. The final build gate must confirm the emitted `dist/index.html`
contains an absolute URL and no `%VITE_PUBLIC_ORIGIN%` token.

- [ ] **Step 5: declare the scoped presentation foundation**

In `landing.css`, define raw values only in the allowed scope:

```css
.landing-page {
  --landing-canvas: #080c10;
  --landing-canvas-raised: #0d1520;
  --landing-surface: rgba(18, 28, 40, 0.82);
  --landing-surface-solid: #101923;
  --landing-hairline: rgba(228, 237, 245, 0.07);
  --landing-hairline-strong: rgba(228, 237, 245, 0.13);
  --environment-cyan: rgba(34, 211, 238, 0.055);
  --environment-steel-blue: rgba(96, 165, 250, 0.04);
  --grid-minor: rgba(228, 237, 245, 0.025);
  --grid-major: rgba(228, 237, 245, 0.05);
  min-height: 100vh;
  background: var(--landing-canvas);
  color: var(--console-ink);
  font-family: Geist, Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei UI", "Segoe UI", sans-serif;
  letter-spacing: 0;
}

.landing-hero,
.landing-runtime {
  --local-halo-cyan: rgba(34, 211, 238, 0.08);
  --local-halo-blue: rgba(96, 165, 250, 0.05);
  --cinematic-bloom-cyan: rgba(34, 211, 238, 0.18);
  --specular-line: rgba(228, 237, 245, 0.16);
  --landing-depth-shadow: 0 40px 120px rgba(0, 0, 0, 0.56);
}
```

Add `@font-face` only after the OFL/source/hash entries and WOFF2 assets exist;
the font faces may be globally registered, but only `.landing-page` uses them.

- [ ] **Step 6: verify GREEN and commit**

```powershell
npm run test --prefix frontend -- src/app/app-shell.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
git add frontend/index.html frontend/src/app/app-shell.spec.tsx frontend/src/app/useRouteDocumentTitle.ts frontend/src/pages/LandingPage.tsx frontend/src/layouts/ConsoleLayout.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): define landing metadata and token boundary"
```

---

## Task 3: Build the Bilingual Semantic Shell and Navigation

**Files:**

- Create: `frontend/src/content/landing-content.ts`
- Create: `frontend/src/pages/landing.page.spec.tsx`
- Create: `frontend/src/components/landing/LandingNav.tsx`
- Create: `frontend/src/components/landing/landing-nav.spec.tsx`
- Create: `frontend/src/components/landing/ProductSurfaceFrame.tsx`
- Create: `frontend/src/components/landing/EnvironmentLayer.tsx`
- Create: `frontend/src/components/landing/EvidenceTrace.tsx`
- Create: `frontend/src/components/landing/SectionTypographyBeat.tsx`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write the page hierarchy RED test**

```tsx
test("Landing exposes one bilingual Discover Analyze Contain narrative", async () => {
  await renderAppAtRoute("/");

  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  const main = screen.getByRole("main");
  const landingRoot = document.querySelector(".landing-page");
  expect(main).toHaveAttribute("id", "landing-content");
  expect(main).toHaveAttribute("lang", "zh-CN");
  expect(landingRoot).toContainElement(main);
  expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
  expect(screen.getByText(/从发现暴露面/)).toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: /map the agent attack surface/i }))
    .toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: /understand what a skill can really do/i }))
    .toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: /observe agent behavior at runtime/i }))
    .toBeVisible();
  expect(screen.getByText("DISCOVER. ANALYZE. CONTAIN.")).toBeVisible();
  expect(screen.getByText(/ONE PLATFORM/)).toBeVisible();
  expect(screen.getByRole("link", { name: /launch security console/i }))
    .toHaveAttribute("href", "/console");

  const headingLevels = screen.getAllByRole("heading").map((heading) =>
    Number(heading.tagName.slice(1))
  );
  expect(headingLevels[0]).toBe(1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index] - headingLevels[index - 1]).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 2: write the navigation RED test**

The test must prove real hrefs, a 44px-capable menu control, modal semantics,
Escape close, focus trap, and focus return. Use `fireEvent`/`userEvent` only
with existing dependencies; do not add a package. Put the initial RED in
`landing.page.spec.tsx` and drive it through `renderAppAtRoute("/")`, so it
fails on absent behavior rather than importing a component that does not exist.

```tsx
it("operates the skip link and mobile Landing navigation accessibly", async () => {
  const originalOverflow = document.body.style.overflow;
  const app = await renderAppAtRoute("/");
  const main = screen.getByRole("main");
  const skipLink = screen.getByRole("link", { name: /skip to content/i });
  expect(skipLink).toHaveAttribute("href", "#landing-content");
  fireEvent.click(skipLink);
  expect(main).toHaveFocus();

  const trigger = screen.getByRole("button", { name: /open navigation/i });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: /landing navigation/i });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(document.body.style.overflow).toBe("hidden");

  const close = within(dialog).getByRole("button", { name: /close navigation/i });
  const dialogLinks = within(dialog).getAllByRole("link");
  close.focus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(dialogLinks.at(-1)).toHaveFocus();
  dialogLinks.at(-1)!.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(close).toHaveFocus();

  fireEvent.click(close);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe(originalOverflow);
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  app.unmount();
  expect(document.body.style.overflow).toBe(originalOverflow);
});
```

In the same repository RED, require the primitive layout/accessibility styles
before writing them:

```ts
assert.match(landingCss, /\.landing-skip-link\s*\{/);
assert.match(landingCss, /\.landing-nav__menu-button[^}]*min-block-size:\s*44px/s);
assert.match(landingCss, /\.landing-product-surface\s*\{/);
assert.match(landingCss, /\.landing-environment[^}]*pointer-events:\s*none/s);
assert.match(landingCss, /\.landing-evidence-trace[^}]*pointer-events:\s*none/s);
```

- [ ] **Step 3: run the route-level tests and verify RED**

```powershell
npm run test --prefix frontend -- src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: sections, content module, and navigation dialog do not exist. The RED
also fails on the missing primitive selectors. It must not be a missing
`IntersectionObserver`; motion hooks are not wired yet.

- [ ] **Step 4: define typed authored content**

Use local literal unions, never shared engine types:

```ts
export const runtimeCheckpointOrder = ["resolve", "detect", "decide", "contain"] as const;
export type RuntimeCheckpoint = (typeof runtimeCheckpointOrder)[number];

export interface LandingSectionCopy {
  readonly id: "discover" | "analyze" | "runtime" | "platform" | "architecture";
  readonly eyebrow: string;
  readonly headingEn: string;
  readonly bodyZh: string;
}
```

Populate exact approved copy from Spec E. Hero evidence contains exactly six
rows; Runtime contains exactly three evidence refs; navigation contains only
Discover, Analyze, Runtime, Architecture, and `/console`. No current timestamp,
latency, confidence, adoption count, or `LIVE` label is allowed.

- [ ] **Step 5: implement semantic shell and primitive boundaries**

`LandingPage` renders one `.landing-page` presentation wrapper. Its direct order
is: skip link, `LandingNav`, `main#landing-content`, then (in Task 7)
`LandingFooter`. The skip link focuses `main#landing-content`; navigation is not
inside `main`. The main contains Hero, evidence rail, first typography beat,
Discover, Analyze, Runtime, second typography beat, Platform, Architecture, and
Final CTA in that exact order. Every chapter gets a stable ID, an H2, and
`aria-labelledby`; panel headings use H3 without skipping a level. Typography
beats remain text, not extra headings. Visible copy is present on the first
React render and is never initially hidden behind motion arming.

`EnvironmentLayer` and `EvidenceTrace` always render `aria-hidden="true"` and
`pointer-events: none`. `ProductSurfaceFrame` accepts `label`, `chrome`, and
`children` slots but never supplies interactive-looking fake controls.
`SectionTypographyBeat` renders semantic text first; animation is only a class/
data-state enhancement.

- [ ] **Step 6: implement navigation behavior and styles**

Use native links for anchors/Console, one native menu button, one labelled
`role="dialog" aria-modal="true"`, a close button, and a bounded focus trap.
Opening moves focus inside the dialog; forward/reverse Tab wrap within its
controls. Both close button and Escape close it and return focus to the trigger.
Lock body scroll only while open and restore the previous value on close and
unmount cleanup. Do not label it `Console Navigation`.

- [ ] **Step 7: verify route-level GREEN, then add direct regression coverage**

First rerun `landing.page.spec.tsx`. After it passes, create
`landing-nav.spec.tsx` with the same dialog/focus cases rendered inside
`MemoryRouter`; that direct test is regression coverage for behavior already
driven RED through the route, not a missing-module RED.

- [ ] **Step 8: verify focused GREEN and commit**

```powershell
npm run test --prefix frontend -- src/pages/landing.page.spec.tsx src/components/landing/landing-nav.spec.tsx src/app/app-shell.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
git add frontend/src/content/landing-content.ts frontend/src/pages/LandingPage.tsx frontend/src/pages/landing.page.spec.tsx frontend/src/components/landing/LandingNav.tsx frontend/src/components/landing/landing-nav.spec.tsx frontend/src/components/landing/ProductSurfaceFrame.tsx frontend/src/components/landing/EnvironmentLayer.tsx frontend/src/components/landing/EvidenceTrace.tsx frontend/src/components/landing/SectionTypographyBeat.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): add landing narrative shell"
```

---

## Task 4: Implement the Cinematic Product-Surface Hero

**Files:**

- Create: `frontend/src/components/landing/LandingHero.tsx`
- Create: `frontend/src/components/landing/HeroSecurityWorkbench.tsx`
- Create: `frontend/src/components/landing/EvidenceRail.tsx`
- Create: `frontend/src/components/landing/landing-hero.spec.tsx`
- Create: `frontend/src/hooks/useLandingInView.ts`
- Create: `frontend/src/hooks/usePointerSpotlight.ts`
- Create: `frontend/src/hooks/useMagneticOffset.ts`
- Create: `frontend/src/hooks/useCinematicSequence.ts`
- Create: `frontend/src/hooks/landing-motion-hooks.spec.tsx`
- Create: `frontend/src/hooks/cinematic-sequence.spec.tsx`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write Hero product-credibility RED tests**

Create `landing-hero.spec.tsx` with `renderAppAtRoute("/")`; do not import
`LandingHero` or `HeroSecurityWorkbench` before they exist.

Assert the final H1/copy/links, `Illustrative security evaluation`, trace ID,
`evidence_count: 06`, six visible evidence rows, three detector names,
`reason_code: tool_scope_escalation`, `policy_action: deny`, and
`containment: active`. Assert decorative vectors are `aria-hidden` and the
Chinese accessible summary is present. Assert no `LIVE`, time, confidence, or
latency text.

```tsx
expect(within(hero).getAllByTestId("hero-evidence-row")).toHaveLength(6);
expect(within(hero).getByText("rule_detector")).toBeVisible();
expect(within(hero).getByText("local_model")).toBeVisible();
expect(within(hero).getByText("external_judge")).toBeVisible();
expect(within(hero).getByText("policy_action: deny")).toBeVisible();
expect(within(hero).queryByText(/^LIVE$/)).not.toBeInTheDocument();
```

- [ ] **Step 2: write lifecycle and pointer RED tests**

Keep the initial lifecycle/pointer assertions in the same route-level test. Use
fake timers and rerender to prove the Hero entrance starts once per
`LandingPage` mount, child rerenders do not restart it, reduced motion begins
settled, and unmount clears every timer. Explicitly drive the observer into
view, advance to `trace`, exit, and advance fake time: the phase must remain
`trace`. Re-entry resumes the remaining timeline and settles at `resolved`
without returning to `copy`; a settled Hero never replays until the whole
`LandingPage` remounts. Stub `matchMedia` and `IntersectionObserver`
deliberately. Pointer events against the Hero surface must write bounded local
CSS variables, remain disabled for coarse/reduced/<=1024px, and install no
window-level listener. Magnetic offset is <=4px.

Extend the repository RED before writing Hero CSS:

```ts
assert.match(landingCss, /min-block-size:\s*clamp\(720px,\s*calc\(100svh - 64px - 72px\),\s*840px\)/);
assert.match(landingCss, /\.landing-hero__product-rail[^}]*max-inline-size:\s*(?:1360|1400)px/s);
assert.match(landingCss, /@media \(max-width:\s*1024px\)[\s\S]*\.landing-hero__scene[^}]*perspective:\s*none/);
assert.match(landingCss, /@media \(max-width:\s*640px\)[\s\S]*\.landing-hero__dust[^}]*display:\s*none/);
assert.match(landingCss, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.landing-hero/);
```

- [ ] **Step 3: verify Hero/hook RED**

```powershell
npm run test --prefix frontend -- src/components/landing/landing-hero.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: missing product surface/hooks plus absent Hero layout/fallback CSS.
No test may rely on animation pixels in jsdom; assert semantic state/data
attributes and cleanup.

- [ ] **Step 4: implement the finite Hero sequence**

Use the closed states below and expose them as `data-hero-phase`:

```ts
export const heroSequencePhases = [
  "copy",
  "frame",
  "topology",
  "trace",
  "detectors",
  "resolved"
] as const;
export type HeroSequencePhase = (typeof heroSequencePhases)[number];
```

Schedule copy by 300ms, frame 420ms, topology 760ms, trace 1020ms, detectors
1240-1520ms, and `resolved` by 1700-2000ms. The mount-local ref prevents
rerender replay; route remount may replay. Reduced motion or unavailable motion
enhancement renders `resolved`; the semantic DOM always contains complete
information. Links remain active from first paint. Out-of-view pauses the active
phase and records remaining delay; re-entry resumes from that phase. Unmount
cancels every timeout/observer/RAF, and settled state never schedules again.

- [ ] **Step 5: implement the workbench and evidence rail**

Use crisp HTML for chrome/evidence/status and SVG/CSS only for decorative paths.
Top chrome changes `EVALUATING` to `RESOLVED`. Z0 environment, Z1 product frame,
and Z2 evidence counter/decision plaque are distinct descendants. Product
surface appears before topology. Derive `evidence_count: 06` from the six-row
authored array rather than maintaining a second numeric value. Evidence rail
contains exactly:

```ts
[
  { index: "01", label: "Discover", identifier: "asset_scan" },
  { index: "02", label: "Analyze", identifier: "skills_static" },
  { index: "03", label: "Contain", identifier: "sandbox" }
]
```

- [ ] **Step 6: implement Hero-specific CSS and local interaction**

At >=1280px use
`min-block-size: clamp(720px, calc(100svh - 64px - 72px), 840px)` and the
1280/1360/full-bleed rails. Confine perspective, spotlight, six dust marks,
pre-blurred bloom, and sweep to `.landing-hero`. Animate opacity/transform only;
product text stays stable. Flatten at <=1024px and remove dust/spotlight/sweep/
secondary metadata at <=640px.

- [ ] **Step 7: verify route-level GREEN and add direct hook regressions**

First run `landing-hero.spec.tsx` alone. Once it passes, create
`landing-motion-hooks.spec.tsx` and `cinematic-sequence.spec.tsx` to exercise
the now-existing hooks directly: observer disconnect, RAF/timer cleanup,
mount-local no-replay, exit/pause/re-entry resume, pointer/magnetic clamps, and
reduced-motion settlement. Those direct tests protect behavior already driven
RED at route level.

- [ ] **Step 8: run the mandatory Hero checkpoint**

```powershell
npm run test --prefix frontend -- src/components/landing/landing-hero.spec.tsx src/hooks/landing-motion-hooks.spec.tsx src/hooks/cinematic-sequence.spec.tsx src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Use the Browser QA Server Procedure. Capture Hero at `1440x900`, `390x844`, and
reduced motion into `docs/temp/landing-visual/hero/`; record the 1.7-2.2s
entrance. Check
copy/CTA readable before frame completion, evidence-rail cue visible, and Hero
reads as product before topology. Record only a **PROVISIONAL** checkpoint score.
Do not proceed while Hero is generic, undersized, clipped, or diagram-first.

- [ ] **Step 9: commit the accepted Hero slice**

```powershell
git add frontend/src/components/landing/LandingHero.tsx frontend/src/components/landing/HeroSecurityWorkbench.tsx frontend/src/components/landing/EvidenceRail.tsx frontend/src/components/landing/landing-hero.spec.tsx frontend/src/hooks/useLandingInView.ts frontend/src/hooks/usePointerSpotlight.ts frontend/src/hooks/useMagneticOffset.ts frontend/src/hooks/useCinematicSequence.ts frontend/src/hooks/landing-motion-hooks.spec.tsx frontend/src/hooks/cinematic-sequence.spec.tsx frontend/src/pages/LandingPage.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): build cinematic landing hero"
```

Do not stage temporary screenshots/recordings.

---

## Task 5: Implement Discover and Analyze Product Evidence

**Files:**

- Create: `frontend/src/components/landing/AttackSurfaceMap.tsx`
- Create: `frontend/src/components/landing/SkillInspectionSurface.tsx`
- Create: `frontend/src/components/landing/landing-visualizations.spec.tsx`
- Create: `frontend/src/hooks/useNarrativeSequence.ts`
- Modify: `frontend/src/hooks/landing-motion-hooks.spec.tsx`
- Modify: `frontend/src/content/landing-content.ts`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write Discover/Analyze RED tests**

Create `landing-visualizations.spec.tsx` against the existing Landing route via
`renderAppAtRoute("/")`; do not import the not-yet-created visualization
components.

Discover must expose an accessible evidence list for Agent service, framework,
interface, Skill package, external Tool, and exposure; technical identifiers
include `framework_fingerprint`, `tool_endpoint`, `skill_package`. Keyboard,
click, and pointer selection must produce the same selected evidence state;
hover cannot own information.

Analyze must visibly expose manifest, dependency, permission boundary, tool
invocation, `reason_code: tool_scope_escalation`, and both illustrative labels.
Selection/focus changes definition only and never removes evidence or expands
layout.

With fake timers and a controlled `IntersectionObserver`, assert Discover moves
`idle -> scanning -> revealed` only after entry. Exiting while `scanning` yields
`paused`; advancing time out of view changes nothing; re-entry resumes and a
settled scan never repeats. Assert Analyze advances `manifest -> dependency ->
permission -> invocation -> reason` at 75ms intervals, pauses out of view, and
settles without hiding any pane. Reduced motion starts both scenes settled and
unmount leaves no timer. Assert these semantic states through
`data-discover-scan` and `data-inspection-focus`, never animation pixels.

Add objective CSS contracts to the repository RED before implementation:

```ts
assert.match(landingCss, /\.landing-discover\[data-discover-scan="scanning"\]/);
assert.match(landingCss, /\.landing-analyze\[data-inspection-focus="reason"\]/);
assert.match(landingCss, /\.landing-discover__layout[^}]*grid-template-columns:\s*5fr 7fr/s);
assert.match(landingCss, /\.landing-analyze__layout[^}]*grid-template-columns:\s*8fr 4fr/s);
assert.match(landingCss, /@media \(max-width:\s*768px\)[\s\S]*\.landing-(?:discover|analyze)__layout[^}]*grid-template-columns:\s*1fr/);
assert.match(landingCss, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.landing-(?:discover|analyze)/);
```

- [ ] **Step 2: run the visualization test and verify RED**

```powershell
npm run test --prefix frontend -- src/components/landing/landing-visualizations.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: components, progression states, evidence lists, and the specified
Discover/Analyze layout/fallback CSS are absent.

- [ ] **Step 3: implement the bounded narrative sequence**

`useNarrativeSequence` accepts a readonly step list, per-step duration, current
in-view state, and reduced-motion flag. It owns one timeout, preserves remaining
delay while paused, never loops, and returns the final step immediately for
reduced motion. Use it only for Discover/Analyze Narrative Motion; Hero/Runtime
remain the only Cinematic Visualization tier. Discover stays `scanning` for
900ms before `revealed`; Analyze advances every 75ms through its five focus
states.

```ts
export const discoverScanPhases = ["idle", "scanning", "revealed"] as const;
export type DiscoverScanState = (typeof discoverScanPhases)[number] | "paused";
export const analyzeFocusOrder = [
  "manifest",
  "dependency",
  "permission",
  "invocation",
  "reason"
] as const;
```

- [ ] **Step 4: implement authored evidence surfaces**

Keep data in `landing-content.ts`, not inside SVG paths. `AttackSurfaceMap`
renders a bounded product shell with readable HTML evidence and a decorative
scan aperture; no globe, totals, last-seen, or scan status. `SkillInspectionSurface`
renders back/middle/front panes for provenance, dependency, permission,
invocation, and one detached reason-code outcome. No code-scroll simulation or
generic feature cards.

- [ ] **Step 5: implement continuity and responsive CSS**

Discover is 5/7 and dark/scan-lit; Analyze reverses to 8/4 with 8-20px static
layer overlap. The evidence trace exits Discover as `tool_endpoint`, enters
Analyze at provenance, then contracts to `evidence_ref` before Runtime. Use
420-720ms masked handoffs with content already visible; at mobile use copy ->
surface -> visible evidence list, with no horizontal scrolling.

- [ ] **Step 6: verify GREEN, add direct regressions, and run the Discover/Analyze checkpoint**

```powershell
npm run test --prefix frontend -- src/components/landing/landing-visualizations.spec.tsx src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

After the route-level test is GREEN, extend the now-existing
`landing-motion-hooks.spec.tsx` with direct pause/resume, once-only, cleanup,
and reduced-motion tests for `useNarrativeSequence`; rerun it before browser QA.

```powershell
npm run test --prefix frontend -- src/hooks/landing-motion-hooks.spec.tsx src/components/landing/landing-visualizations.spec.tsx
```

Use the Browser QA Server Procedure. Capture both sections at `1440x900`,
`390x844`, and reduced motion into
`docs/temp/landing-visual/discover-analyze/`. Verify Discover feels exploratory,
Analyze feels technical, product evidence remains credible, and neither becomes
a normal left-copy/right-card section. Record provisional deltas only.

- [ ] **Step 7: commit the evidence chapters**

```powershell
git add frontend/src/components/landing/AttackSurfaceMap.tsx frontend/src/components/landing/SkillInspectionSurface.tsx frontend/src/components/landing/landing-visualizations.spec.tsx frontend/src/hooks/useNarrativeSequence.ts frontend/src/hooks/landing-motion-hooks.spec.tsx frontend/src/content/landing-content.ts frontend/src/pages/LandingPage.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): add landing discovery and analysis evidence"
```

---

## Task 6: Implement the Runtime Causal Cinematic Sequence

**Files:**

- Create: `frontend/src/components/landing/RuntimeDecisionStage.tsx`
- Create: `frontend/src/components/landing/RuntimeStageRail.tsx`
- Create: `frontend/src/components/landing/runtime-decision-stage.spec.tsx`
- Create: `frontend/src/hooks/useRuntimeStage.ts`
- Modify: `frontend/src/hooks/useCinematicSequence.ts`
- Modify: `frontend/src/hooks/cinematic-sequence.spec.tsx`
- Modify: `frontend/src/content/landing-content.ts`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write the four-checkpoint RED tests**

Create `runtime-decision-stage.spec.tsx` against `renderAppAtRoute("/")`; do not
import Runtime components or hooks before they exist.

Use `runtimeCheckpointOrder` and assert the stable outcomes:

| Checkpoint | Required stable state |
| --- | --- |
| `resolve` | Input plus identity, Skill provenance, Tool scope visible |
| `detect` | all three detector rows `complete`; three evidence refs visible |
| `decide` | `evidence_refs: 03`; policy gate resolves deny |
| `contain` | `containment: active`; scene settled |

Test observer forward seek, fast skip, reverse direct seek (no reverse causal
playback), re-entry persistence, and observer cleanup. Test keyboard/touch stage
selection cancels playback and lands immediately. Test Replay is the sole owner
of the full 4.8-5.4s sequence; user selection/out-of-view/unmount cancels it.

- [ ] **Step 2: write causality and truthfulness RED tests**

Before `decide`, no final policy decision is exposed as completed. Detector
statuses are only `standby/evaluating/complete`; there are exactly three authored
evidence refs. Assert `ILLUSTRATIVE SEQUENCE`, `evaluation_mode: simulation`,
`sandbox-security-balanced.v1`, and absence of `LIVE`, current time, throughput,
confidence, latency, or engine data. Reduced motion renders the complete
`contain` state immediately and Replay remains settled.

Add the Runtime layout/motion source contracts to the repository RED before
implementation:

```ts
assert.match(landingCss, /\.landing-runtime__story[^}]*min-block-size:\s*(?:190|200|210|220)vh/s);
assert.match(landingCss, /\.landing-runtime__scene[^}]*position:\s*sticky/s);
assert.match(landingCss, /\.landing-runtime__scene[^}]*block-size:\s*min\(72vh,\s*680px\)/s);
assert.match(landingCss, /@media \(max-width:\s*1024px\)[\s\S]*\.landing-runtime__scene[^}]*position:\s*static/);
assert.match(landingCss, /@media \(max-width:\s*640px\)[\s\S]*\.landing-runtime__signal[^}]*display:\s*none/);
assert.match(landingCss, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.landing-runtime/);
assert.doesNotMatch(landingCss, /transition:\s*all/i);
```

- [ ] **Step 3: run Runtime/hook tests and verify RED**

```powershell
npm run test --prefix frontend -- src/components/landing/runtime-decision-stage.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: missing stage/hook behavior and absent Runtime layout/fallback CSS. A
missing observer mock is test setup failure, not valid RED.

- [ ] **Step 4: implement one deterministic authority model**

`useRuntimeStage` owns observer checkpoints and direct selection.
`useCinematicSequence` owns one cancellable active segment/replay. Priority is:

1. explicit stage selection cancels and seeks immediately;
2. Replay temporarily ignores observers, then settles at `contain`;
3. observer changes drive normal forward segments and stable reverse seeks;
4. reduced motion always returns `contain`.

Never queue timers from an obsolete checkpoint. Store timeout/RAF IDs in refs,
cancel before every ownership change, and pause out of view.

- [ ] **Step 5: implement Runtime product workspace**

Render readable HTML Input well, Trust Resolver, three detector rows, evidence
strip, Policy Gate, final decision, and four real stage buttons. Decorative
signal branches, trace head, ring, and scan are `aria-hidden`. No sandbox
showcase/shared contract import is permitted.

Use one visibly illustrative, stable scenario:

```ts
export const runtimeScenario = {
  traceId: "runtime_interaction/trace-0142",
  eventType: "tool_invocation",
  actor: "agent://research-assistant",
  target: "tool://workspace/write",
  declaredScope: "workspace:read",
  requestedScope: "workspace:write",
  detectors: ["rule_detector", "local_model", "external_judge"],
  evidenceRefs: [
    "evidence_ref/identity-context",
    "evidence_ref/skill-provenance",
    "evidence_ref/tool-scope"
  ],
  policyProfile: "sandbox-security-balanced.v1",
  policyAction: "deny",
  containment: "active"
} as const;
```

Derive `evidence_refs: 03` from `evidenceRefs.length`; do not duplicate a
manually maintained counter.

- [ ] **Step 6: implement causal motion and mobile fallback**

Desktop Replay timing:

```ts
export const runtimeTimelineMs = {
  input: 550,
  trust: 1150,
  detectors: 2600,
  evidence: 3500,
  policy: 4550,
  settle: 5400
} as const;
```

Use a 190-220vh wrapper, sticky `min(72vh, 680px)` scene, four document-flow
sentinels, and no per-pixel scroll handler. Animate pre-blurred opacity/transform,
never large `filter`, `box-shadow`, layout, or text. At <=1024px remove sticky;
at <=640px render static vertical Input -> Resolver -> Detectors -> Policy,
remove scan/dust/spotlight/depth/dissipation, and show decision text first.

- [ ] **Step 7: verify route-level GREEN and add direct state-machine regressions**

Run `runtime-decision-stage.spec.tsx` alone. After it passes, extend the
now-existing `cinematic-sequence.spec.tsx` with observer/direct/replay authority,
fast seek, reverse seek, out-of-view cancellation, and reduced-motion tests.
This direct hook coverage protects behavior already driven RED through the route.

- [ ] **Step 8: run the mandatory Runtime checkpoint**

```powershell
npm run test --prefix frontend -- src/components/landing/runtime-decision-stage.spec.tsx src/hooks/cinematic-sequence.spec.tsx src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Use the Browser QA Server Procedure. Record the complete Runtime sequence at
1440x900 and capture detector-evaluating, policy-resolved, settled, mobile, and
reduced-motion frames under
`docs/temp/landing-visual/runtime/`. Review at 0.25x and confirm input -> trust ->
independent branches -> evidence convergence -> policy -> containment order.
Record only a provisional score. Do not proceed if causality is ambiguous or
Runtime reads as a diagram rather than a security workspace.

- [ ] **Step 9: commit Runtime**

```powershell
git add frontend/src/components/landing/RuntimeDecisionStage.tsx frontend/src/components/landing/RuntimeStageRail.tsx frontend/src/components/landing/runtime-decision-stage.spec.tsx frontend/src/hooks/useRuntimeStage.ts frontend/src/hooks/useCinematicSequence.ts frontend/src/hooks/cinematic-sequence.spec.tsx frontend/src/content/landing-content.ts frontend/src/pages/LandingPage.tsx frontend/src/styles/landing.css tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): add causal runtime security sequence"
```

---

## Task 7: Add Product Proof, Architecture, CTA, Footer, and Owned Assets

**Files:**

- Create: `frontend/src/components/landing/PlatformLayerStack.tsx`
- Create: `frontend/src/components/landing/EvidencePipeline.tsx`
- Create: `frontend/src/components/landing/LandingCta.tsx`
- Create: `frontend/src/components/landing/LandingFooter.tsx`
- Create: `frontend/src/components/landing/platform-layer-stack.spec.tsx`
- Create: `frontend/public/landing/console-overview-2x.webp`
- Create: `frontend/public/landing/landing-noise.webp`
- Create: `frontend/public/landing/agent-security-platform-og.png`
- Create: `frontend/public/landing/fonts/geist-latin.woff2`
- Create: `frontend/public/landing/fonts/geist-mono-latin.woff2`
- Create: `frontend/public/landing/fonts/noto-sans-sc-regular.woff2`
- Create: `frontend/public/landing/fonts/noto-sans-sc-semibold.woff2`
- Create: `frontend/public/landing/LICENSES.md`
- Modify: `frontend/index.html`
- Modify: `frontend/src/pages/landing.page.spec.tsx`
- Modify: `frontend/src/content/landing-content.ts`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/styles/landing.css`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: write product-proof and asset RED tests**

Add the initial product-proof behavior to the existing
`landing.page.spec.tsx`; do not import `PlatformLayerStack` before it exists.
Test three `aria-pressed` layer buttons, initial Asset Discovery selection,
fixed screenshot source `/landing/console-overview-2x.webp`, intrinsic
`width={2400}` / `height={1500}`, `loading="lazy"`, changed overlay/copy
without image replacement, six architecture stages, final CTA hrefs, and
`contentinfo` links. Each architecture stage must render one English label, one
mono identifier, and a non-empty Chinese `descriptionZh`; assert all six
descriptions use `lang="zh-CN"`. Assert `contentinfo` follows and is outside
`main#landing-content`, so the final page has a clear navigation/main/footer
landmark structure. Repository assertions must first test `existsSync` before
`statSync` so missing assets fail intentionally rather than with `ENOENT`.

Add objective Platform/closure style contracts to the same repository RED:

```ts
assert.match(landingCss, /\.landing-platform__surface[^}]*transform:\s*perspective\([^)]*\)\s*rotateX\((?:0\.[0-9]+|1)deg\)/s);
assert.match(landingCss, /\.landing-platform__layer\[aria-pressed="true"\]/);
assert.match(landingCss, /\.landing-architecture__pipeline[^}]*grid-template-columns:\s*repeat\(6,\s*1fr\)/s);
assert.match(landingCss, /\.landing-final-cta\s*\{/);
assert.match(landingCss, /\.landing-footer\s*\{/);
```

```ts
const landingAssets = [
  ["frontend/public/landing/console-overview-2x.webp", 450_000],
  ["frontend/public/landing/landing-noise.webp", 16_000],
  ["frontend/public/landing/agent-security-platform-og.png", 500_000]
] as const;

const landingFontAssets = [
  "frontend/public/landing/fonts/geist-latin.woff2",
  "frontend/public/landing/fonts/geist-mono-latin.woff2",
  "frontend/public/landing/fonts/noto-sans-sc-regular.woff2",
  "frontend/public/landing/fonts/noto-sans-sc-semibold.woff2"
] as const;

const criticalFontAssets = [
  "frontend/public/landing/fonts/geist-latin.woff2",
  "frontend/public/landing/fonts/noto-sans-sc-regular.woff2"
] as const;

for (const [asset, limit] of landingAssets) {
  const assetUrl = new URL(`../../${asset}`, import.meta.url);
  const exists = existsSync(assetUrl);
  assert.equal(exists, true, asset);
  if (!exists) continue;
  const bytes = statSync(assetUrl).size;
  assert.ok(bytes > 0 && bytes <= limit, `${asset}: ${bytes}`);
}

for (const font of landingFontAssets) {
  assert.equal(existsSync(new URL(`../../${font}`, import.meta.url)), true, font);
}

const criticalFontBytes = criticalFontAssets.reduce((total, font) => {
  const fontUrl = new URL(`../../${font}`, import.meta.url);
  return total + (existsSync(fontUrl) ? statSync(fontUrl).size : 0);
}, 0);
assert.ok(criticalFontBytes <= 420_000, `critical fonts: ${criticalFontBytes}`);

const ledgerPath = "frontend/public/landing/LICENSES.md";
const ledgerUrl = new URL(`../../${ledgerPath}`, import.meta.url);
const ledgerExists = existsSync(ledgerUrl);
assert.equal(ledgerExists, true, ledgerPath);
if (ledgerExists) {
  const ledger = read(ledgerPath);
  for (const path of [...landingAssets.map(([asset]) => asset), ...landingFontAssets]) {
    assert.match(ledger, new RegExp(path.split("/").at(-1)!.replace(".", "\\.")));
  }
  assert.match(ledger, /SHA-256/);
  assert.match(ledger, /license/i);
  assert.match(ledger, /source/i);
  assert.match(ledger, /capture|generated|subset/i);
  assert.match(ledger, /first-party|project-owned/i);
}
```

Assert `LICENSES.md` names every asset/font and contains source, license,
capture/generation method, SHA-256, and first-party ownership. Assert the font
files exist and that the subset preloaded above fold remains within the 420 KiB
critical transfer budget. Extend the repository test's `node:fs` import with
`existsSync` and `statSync` before adding this code.

- [ ] **Step 2: run tests and verify valid RED**

```powershell
npm run test --prefix frontend -- src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: route-level assertions fail on absent Platform/pipeline/footer
behavior; repository assertions fail on absent Platform/closure CSS, assets, and
ledger. No missing module import or `ENOENT` exception is valid RED. Existing
route/token gates remain green.

- [ ] **Step 3: create first-party assets with provenance**

1. Treat the Console proof as a fail-closed external asset gate. The current
   `/overview` always renders `mocks/overview.ts` metrics and placeholder copy,
   so it is **not** an approved capture source for this requirement. Before this
   task can complete, the user or a relatively independent product reviewer must
   approve a project-owned `console-overview-2x.webp` captured from a truthful
   Console state produced under a separately authorized requirement. Record the
   source commit, route/state, viewport/DPR, exact crop, reviewer, dimensions,
   and SHA-256. The approved derivative is exactly 2400x1500 (displayed at a
   reserved 8:5 aspect ratio) and <=450 KiB. Cropping/redacting operator identity
   is allowed; compositing,
   replacing values, or relabelling mock/fixture data is not. If no truthful
   source exists, stop Task 7 and keep the requirement incomplete; never fall
   back to current Overview mocks or Showcase verdict fixtures.
2. Generate one deterministic 256x256 owned grayscale noise tile. Use seed
   `0x415350` with xorshift32, map each byte to luminance 112-144 with alpha 255,
   and encode once through an existing local Chrome/Playwright canvas as lossy
   WebP quality 0.35. This is an offline asset-generation action, not shipped
   Canvas code. Require <=16 KiB and record the pixel recipe, Chrome version,
   dimensions, encoder setting, and SHA-256; no downloaded texture.
3. Create `agent-security-platform-og.png` at 1200x630 from the final Hero or a
   dedicated first-party product preview; no reference assets/fake telemetry.
4. Acquire fonts reproducibly without changing package manifests. Pack
   `geist@1.7.2` (npm integrity
   `sha512-Gu5lDFa3pLRyoBlBPf0QIFHVdWAnpco7fS1bJm41jyLPFoguBgiubseUN2oLXMgqZ7uxAxDoXcHMhCY/fOTTgg==`)
   and `@fontsource/noto-sans-sc@5.3.0` (npm integrity
   `sha512-HeqIlGm0+ohOKxZLuHj1qW6r6avHH0OWdKERAcSDI0RQ+MXrteuLKA+M+5eOA8rYy0MFvOR5AT0fQo2rUkye0Q==`)
   into a temporary directory with `npm pack`; do not install them. Copy
   `Geist-Variable.woff2` and `GeistMono-Variable.woff2` from the pinned Geist
   tarball. Run the preflighted FontTools 4.63.0 `pyftsubset` against the pinned
   Fontsource `noto-sans-sc-chinese-simplified-400-normal.woff2` and
   `...-600-normal.woff2`, using
   `frontend/src/content/landing-content.ts` as `--text-file`,
   `--layout-features='*'`, `--flavor=woff2`, and `--no-hinting`. Rename outputs
   to the four planned public font filenames. All visible Chinese copy must live
   in `landing-content.ts`, so the inventory is complete; rerun subsetting after
   any copy edit.
5. Copy the two upstream OFL license texts/provenance into `LICENSES.md`, record
   package versions/integrities and each output SHA-256, then run the glyph/wrap
   browser QA and the <=420 KiB critical-font gate. If FontTools, source
   integrity, glyph coverage, ownership, or license is unclear, stop; an
   explicitly approved pre-generated asset bundle is the only fallback. Do not
   add a dependency, remote font CDN, or reference-site asset.

Execute the pinned font transformation from the approved worktree; generated
font binaries are allowed outputs, not hand-edited source:

```powershell
$landingFontTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$landingFontTemp = Join-Path $landingFontTempRoot ("asp-landing-fonts-" + [guid]::NewGuid().ToString('N'))
$landingGeistExtract = Join-Path $landingFontTemp 'geist'
$landingNotoExtract = Join-Path $landingFontTemp 'noto'
$landingFontOutput = Join-Path (Resolve-Path 'frontend\public').Path 'landing\fonts'
New-Item -ItemType Directory -Path $landingFontTemp, $landingGeistExtract, $landingNotoExtract, $landingFontOutput -Force | Out-Null
try {
  npm pack 'geist@1.7.2' --pack-destination $landingFontTemp --silent | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to pack pinned Geist.' }
  npm pack '@fontsource/noto-sans-sc@5.3.0' --pack-destination $landingFontTemp --silent | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to pack pinned Noto Sans SC.' }
  tar -xf (Join-Path $landingFontTemp 'geist-1.7.2.tgz') -C $landingGeistExtract
  if ($LASTEXITCODE -ne 0) { throw 'Unable to extract Geist.' }
  tar -xf (Join-Path $landingFontTemp 'fontsource-noto-sans-sc-5.3.0.tgz') -C $landingNotoExtract
  if ($LASTEXITCODE -ne 0) { throw 'Unable to extract Noto Sans SC.' }

  Copy-Item -LiteralPath (Join-Path $landingGeistExtract 'package\dist\fonts\geist-sans\Geist-Variable.woff2') -Destination (Join-Path $landingFontOutput 'geist-latin.woff2')
  Copy-Item -LiteralPath (Join-Path $landingGeistExtract 'package\dist\fonts\geist-mono\GeistMono-Variable.woff2') -Destination (Join-Path $landingFontOutput 'geist-mono-latin.woff2')
  pyftsubset (Join-Path $landingNotoExtract 'package\files\noto-sans-sc-chinese-simplified-400-normal.woff2') --text-file='frontend/src/content/landing-content.ts' --output-file=(Join-Path $landingFontOutput 'noto-sans-sc-regular.woff2') --flavor=woff2 '--layout-features=*' --no-hinting
  if ($LASTEXITCODE -ne 0) { throw 'Unable to subset Noto Sans SC 400.' }
  pyftsubset (Join-Path $landingNotoExtract 'package\files\noto-sans-sc-chinese-simplified-600-normal.woff2') --text-file='frontend/src/content/landing-content.ts' --output-file=(Join-Path $landingFontOutput 'noto-sans-sc-semibold.woff2') --flavor=woff2 '--layout-features=*' --no-hinting
  if ($LASTEXITCODE -ne 0) { throw 'Unable to subset Noto Sans SC 600.' }

  Get-ChildItem -LiteralPath $landingFontOutput -Filter '*.woff2' | Get-FileHash -Algorithm SHA256
} finally {
  $landingResolvedFontTemp = [IO.Path]::GetFullPath($landingFontTemp)
  if (-not $landingResolvedFontTemp.StartsWith($landingFontTempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Unsafe font temp cleanup target.'
  }
  if (Test-Path -LiteralPath $landingResolvedFontTemp) {
    Remove-Item -LiteralPath $landingResolvedFontTemp -Recurse -Force
  }
}
```

- [ ] **Step 4: register Landing-owned fonts and required preloads**

Add `@font-face` declarations to `landing.css` with `font-display: swap` and
only local `/landing/fonts/...` URLs. Preload only the above-fold regular faces
in `frontend/index.html`; mono/semibold load on demand. Do not change the
Console `font-family` or add a font CDN.

```css
@font-face {
  font-family: "Geist";
  src: url("/landing/fonts/geist-latin.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("/landing/fonts/geist-mono-latin.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 600;
  font-display: swap;
}

@font-face {
  font-family: "Noto Sans SC";
  src: url("/landing/fonts/noto-sans-sc-regular.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Noto Sans SC";
  src: url("/landing/fonts/noto-sans-sc-semibold.woff2") format("woff2");
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}
```

```html
<link rel="preload" href="/landing/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/landing/fonts/noto-sans-sc-regular.woff2" as="font" type="font/woff2" crossorigin />
```

- [ ] **Step 5: implement static product proof and closure**

`PlatformLayerStack` keeps one fixed screenshot while buttons change only a
masked overlay and Chinese explanation. First layer is active; perspective is
static <=1deg desktop and flat mobile. `EvidencePipeline` renders Observe,
Normalize, Analyze, Decide, Act, Audit as an ordered text rail with English
labels, mono IDs, and the authored Chinese plain-language explanation for every
stage.
`LandingCta` contains only `/console` and `#runtime`. Footer contains only
product descriptor, real anchors, Console, Architecture; no legal/social/status/
customer/integration invention.

Use these local presentation values:

```ts
export const productLayers = [
  {
    id: "asset_scan",
    index: "01",
    label: "Asset Discovery",
    overlay: "asset_discovery",
    descriptionZh: "将 Agent 服务、框架、接口与工具关系归一为可分析资产。"
  },
  {
    id: "skills_static",
    index: "02",
    label: "Static Analysis",
    overlay: "static_analysis",
    descriptionZh: "把 Skill 的脚本、依赖、权限与调用路径汇聚为能力证据。"
  },
  {
    id: "sandbox",
    index: "03",
    label: "Runtime Security",
    overlay: "runtime_security",
    descriptionZh: "将运行时信号、检测结果与策略动作关联为可审计决策。"
  }
] as const;

export const evidencePipeline = [
  {
    id: "observe",
    labelEn: "Observe",
    identifier: "asset_scan",
    descriptionZh: "采集 Agent 服务、Skill 与工具交互信号。"
  },
  {
    id: "normalize",
    labelEn: "Normalize",
    identifier: "interaction_context",
    descriptionZh: "将分散事件归一为一致的安全上下文。"
  },
  {
    id: "analyze",
    labelEn: "Analyze",
    identifier: "reason_code",
    descriptionZh: "关联权限、行为与来源证据，识别风险意图。"
  },
  {
    id: "decide",
    labelEn: "Decide",
    identifier: "policy_action",
    descriptionZh: "依据证据与策略形成可解释的安全决策。"
  },
  {
    id: "act",
    labelEn: "Act",
    identifier: "containment_action",
    descriptionZh: "按策略执行允许、拒绝或隔离动作。"
  },
  {
    id: "audit",
    labelEn: "Audit",
    identifier: "evidence_ref",
    descriptionZh: "保留原因码与证据引用，形成可追溯记录。"
  }
] as const;
```

- [ ] **Step 6: verify route-level GREEN and add direct component regressions**

First run `landing.page.spec.tsx` and the repository gate. Once both pass,
create `platform-layer-stack.spec.tsx` for direct keyboard/click selection,
fixed-image, overlay, pipeline, CTA, and footer regression coverage using the
now-existing components.

- [ ] **Step 7: verify focused GREEN and commit assets/product proof**

```powershell
npm run test --prefix frontend -- src/components/landing/platform-layer-stack.spec.tsx src/pages/landing.page.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
git add frontend/index.html frontend/src/components/landing/PlatformLayerStack.tsx frontend/src/components/landing/EvidencePipeline.tsx frontend/src/components/landing/LandingCta.tsx frontend/src/components/landing/LandingFooter.tsx frontend/src/components/landing/platform-layer-stack.spec.tsx frontend/src/content/landing-content.ts frontend/src/pages/LandingPage.tsx frontend/src/pages/landing.page.spec.tsx frontend/src/styles/landing.css frontend/public/landing/console-overview-2x.webp frontend/public/landing/landing-noise.webp frontend/public/landing/agent-security-platform-og.png frontend/public/landing/fonts/geist-latin.woff2 frontend/public/landing/fonts/geist-mono-latin.woff2 frontend/public/landing/fonts/noto-sans-sc-regular.woff2 frontend/public/landing/fonts/noto-sans-sc-semibold.woff2 frontend/public/landing/LICENSES.md tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): add landing product proof and closure"
```

---

## Task 8: Complete Responsive, Accessibility, and Performance Integration

**Files:**

- Modify: `frontend/src/styles/landing.css`
- Modify: `frontend/src/pages/landing.page.spec.tsx`
- Modify: `tests/repository/frontend-console-theme-literals.spec.ts`

- [ ] **Step 1: add green boundary regressions and final-integration RED gates**

Recursively read non-test Landing TS/TSX and `landing.css`. Extend the existing
`node:fs` import with `readdirSync` before adding this helper, then assert:

```ts
function walkLandingSources(directory: string): string[] {
  return readdirSync(new URL(`../../${directory}/`, import.meta.url), {
    withFileTypes: true
  }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return walkLandingSources(path);
    return /\.(?:ts|tsx)$/.test(path) && !/\.spec\.(?:ts|tsx)$/.test(path)
      ? [path]
      : [];
  });
}

const landingContentSource = read("frontend/src/content/landing-content.ts");
const landingComponentSources = [
  read("frontend/src/pages/LandingPage.tsx"),
  read("frontend/src/app/useRouteDocumentTitle.ts"),
  ...walkLandingSources("frontend/src/components/landing").map(read),
  ...[
    "useLandingInView.ts",
    "useNarrativeSequence.ts",
    "usePointerSpotlight.ts",
    "useMagneticOffset.ts",
    "useRuntimeStage.ts",
    "useCinematicSequence.ts"
  ].map((name) => read(`frontend/src/hooks/${name}`))
].join("\n");
const landingSources = `${landingContentSource}\n${landingComponentSources}`;

assert.doesNotMatch(
  landingSources,
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|services\/|engines\/|shared\/|sandbox-security\/showcase/
);
assert.doesNotMatch(landingSources, /<canvas\b|<video\b|WebGL|shader/i);
assert.doesNotMatch(landingComponentSources, /[\u3400-\u9fff]/);
assert.match(landingCss, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(landingCss, /@media \(prefers-reduced-transparency: reduce\)/);
assert.match(landingCss, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(landingCss, /calc\(100svh - 64px - 72px\)/);
assert.doesNotMatch(landingCss, /100svh\s*-\s*64px\s*-\s*72px(?!\))/);
assert.doesNotMatch(landingCss, /transition:\s*all/i);

assert.match(landingCss, /--landing-copy-max:\s*1280px/);
assert.match(landingCss, /--landing-product-max:\s*1400px/);
assert.match(landingCss, /--landing-radius-sm:\s*4px/);
assert.match(landingCss, /--landing-radius-md:\s*6px/);
assert.match(landingCss, /--landing-radius-lg:\s*8px/);
assert.match(landingCss, /\.landing-grid[^}]*grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*24px/s);
assert.match(landingCss, /\.landing-hero__title[^}]*font-size:\s*80px/s);
assert.match(landingCss, /\.landing-section__title[^}]*font-size:\s*56px/s);
assert.match(landingCss, /\.landing-typography-beat[^}]*font-size:\s*112px/s);
assert.match(landingCss, /@media \(max-width:\s*1024px\)[\s\S]*\.landing-grid[^}]*repeat\(8,/);
assert.match(landingCss, /@media \(max-width:\s*768px\)[\s\S]*\.landing-grid[^}]*repeat\(4,[^}]*gap:\s*16px/s);
assert.match(landingCss, /@media \(max-width:\s*768px\)[\s\S]*\.landing-hero__title[^}]*font-size:\s*44px/s);
assert.match(landingCss, /@media \(max-width:\s*768px\)[\s\S]*\.landing-section__title[^}]*font-size:\s*34px/s);
assert.match(landingCss, /@media \(max-width:\s*320px\)[\s\S]*overflow-wrap:\s*anywhere/);
```

The source-boundary, already-built scene, CTA, and semantic assertions are green
regressions, not claimed RED. Add page regressions that all CTA controls are
named, one H1 exists, heading levels never skip upward, navigation/main/footer
landmarks occur in that order, no fake button chrome has `role=button`, all
selected states have text, and storage write spies remain untouched through
Hero and Runtime replay. The intentional RED is the still-deferred global rail,
12/8/4-column grid, radius/type system, `320px` wrap/flattening, and page-wide
reduced-transparency contracts above. Earlier tasks must not pre-implement this
final integration block.

- [ ] **Step 2: run static/page tests and verify RED**

```powershell
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
npm run test --prefix frontend -- src/pages/landing.page.spec.tsx
```

Expected: all negative/source/scene regressions remain green, while the named
global rail/grid/radius/type, `320px`, and reduced-transparency assertions fail
for absent final-integration rules. A wholly green run is not accepted as RED;
verify that earlier work did not accidentally absorb Task 8 scope.

- [ ] **Step 3: complete layout/type/motion CSS exactly from Spec F/G**

- Copy rail max 1280px; product rail 1360-1400px; clipped environment rail;
  desktop 12-column/24px gap, tablet 8-column, mobile 4-column/16px gap.
- Display scale: 112-128/72/44-48 typography beat; 80/64/44 H1;
  56/48/34 H2; body 16; letter spacing zero; mono wraps at separators.
- Radius 4/6/8px only; hairlines 1px; Platform static product-proof depth;
  Hero/Runtime alone get animated or cursor-reactive perspective, bloom, dust,
  spotlight, and parallax. Platform retains its approved static <=1deg resting
  perspective and shallow edge shadow only.
- Breakpoints at 1280, 1024, 768, 480, 320 plus nav 880. No horizontal
  overflow or essential off-canvas labels.
- UI motion 100-240ms; narrative 420-900ms; Hero 1.7-2.2s; Runtime 4.8-5.4s;
  no blanket glow/blur cap for scenes, but no animated large filters.
- Reduced motion immediately settles all content and removes travel/scan/
  magnetic/spotlight/sticky/perspective/dust/dissipation. Reduced transparency
  uses solid surfaces and removes noise/bloom/backdrop blur.

- [ ] **Step 4: verify automated integration GREEN**

```powershell
node .\frontend\node_modules\typescript\bin\tsc --noEmit -p frontend\tsconfig.json
npm run test --prefix frontend -- src/app/app-shell.spec.tsx src/pages/landing.page.spec.tsx src/components/landing/landing-nav.spec.tsx src/components/landing/landing-hero.spec.tsx src/components/landing/landing-visualizations.spec.tsx src/components/landing/runtime-decision-stage.spec.tsx src/components/landing/platform-layer-stack.spec.tsx src/hooks/landing-motion-hooks.spec.tsx src/hooks/cinematic-sequence.spec.tsx
node --experimental-strip-types --test tests/repository/frontend-console-theme-literals.spec.ts
```

Expected: typecheck and all focused tests pass.

- [ ] **Step 5: commit integrated presentation CSS**

```powershell
git add frontend/src/styles/landing.css frontend/src/pages/landing.page.spec.tsx tests/repository/frontend-console-theme-literals.spec.ts
git commit -m "feat(frontend): complete landing responsive system"
```

---

## Task 9: Full Verification, Fidelity Review, Documentation, and Stop

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`
- Modify only if explicitly authorized in Task 0: `docs/sprint-current.md`
- Modify only when a confirmed review delta requires it: exact affected Landing
  source/test files, committed separately before the documentation commit
- Create temporary, uncommitted QA artifacts under `docs/temp/landing-visual/`

- [ ] **Step 1: run full automated verification**

```powershell
if ([string]::IsNullOrWhiteSpace($env:VITE_PUBLIC_ORIGIN)) {
  throw 'VITE_PUBLIC_ORIGIN must be supplied non-interactively by the approved deployment configuration.'
}
$landingOriginText = $env:VITE_PUBLIC_ORIGIN
$landingOriginUri = $null
$landingOriginValid = [Uri]::TryCreate($landingOriginText, [UriKind]::Absolute, [ref]$landingOriginUri)
if (-not $landingOriginValid -or
    $landingOriginText -cne $landingOriginText.Trim() -or
    $landingOriginUri.Scheme -cne 'https' -or
    [string]::IsNullOrWhiteSpace($landingOriginUri.Host) -or
    $landingOriginUri.AbsolutePath -ne '/' -or
    $landingOriginUri.Query -ne '' -or
    $landingOriginUri.Fragment -ne '' -or
    $landingOriginUri.UserInfo -ne '' -or
    $landingOriginText -cne $landingOriginUri.GetLeftPart([UriPartial]::Authority)) {
  throw 'VITE_PUBLIC_ORIGIN must be a bare HTTPS origin with no credentials, path, query, fragment, trailing slash, or surrounding whitespace.'
}
node .\frontend\node_modules\typescript\bin\tsc --noEmit -p frontend\tsconfig.json
npm run test:frontend
npm run test:repo
npm run build --prefix frontend
if (Select-String -Quiet -Path 'frontend\dist\index.html' -SimpleMatch '%VITE_PUBLIC_ORIGIN%') {
  throw 'Production metadata still contains an unresolved VITE_PUBLIC_ORIGIN token.'
}
if (-not (Select-String -Quiet -Path 'frontend\dist\index.html' -Pattern 'property="og:image" content="https://')) {
  throw 'Production og:image is not an absolute HTTPS URL.'
}
```

Expected: all pass. Record exact test counts, build chunk names/sizes, and any
baseline warnings. If a command fails, use `superpowers:systematic-debugging`;
do not continue to visual approval.

- [ ] **Step 2: verify route split and performance budgets**

In the production build/browser trace confirm:

- Landing incremental route JS <=85 KiB gzip excluding shared Motion runtime;
- critical above-fold fonts <=420 KiB;
- max two owned product screenshots, each <=450 KiB, with intrinsic dimensions;
- Landing CLS <=0.05;
- p95 scene frame work <=20ms, no repeated animation-caused >50ms long task;
- Hero <=8 and Runtime <=10 promoted scene layers, with `will-change` removed
  after settlement;
- no active scene work outside the viewport and no third-party resource request.

- [ ] **Step 3: run browser/accessibility/responsive QA**

Use the Browser QA Server Procedure. Capture `/` at 1440x900, 1024x768,
768x1024, 390x844, and 320x568; capture
`/overview` at 1440x900 and 390x844 for Console regression. At each Landing
viewport verify:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Keyboard-test skip link, all anchors, mobile dialog focus/Escape/return,
Discover selection, Runtime stage controls/Replay cancellation, Platform layer
buttons, and CTA destinations. Verify mixed-language wrap, named controls,
focus visibility, one H1 with sequential H2/H3 levels, navigation/main/footer
landmark order, AA body contrast, reduced motion, and reduced transparency.

- [ ] **Step 4: execute the Visual Fidelity Acceptance Gate**

1. Capture Hero, Discover, Analyze, Runtime, Platform at 1440x900; record Hero
   entrance and full Runtime sequence; include detector-evaluating and
   policy-resolved frames. Re-capture final Hero and Runtime reduced-motion
   states after Task 8, plus the complete page at 390x844 and 320x568. Reduced
   motion must show complete information without scan/parallax/spotlight/dust/
   camera shift/dissipation; both mobile artifacts must show intentionally
   flattened compositions rather than compressed desktop spectacle.
2. In the same QA session capture the mapped current Linear/Wiz/Vercel regions.
   Reference captures stay temporary/outside source control and never become
   assets.
3. Build labelled contact sheets and score the exact 0/1/2 rubric. Required
   thresholds remain page >=85%, Hero/Runtime >=90%, other scenes >=80%; Hero
   and Runtime motion causality must score 2. Use the fixed page weights:
   Hero 28%, Discover 14%, Analyze 14%, Runtime 30%, Platform 14%. Score visual
   scale, whitespace, typography hierarchy, product-surface prominence,
   background richness, section rhythm, depth, motion causality, CTA prominence
   where applicable, and overall premium feeling. No `0` is allowed for
   typography hierarchy, product-surface prominence, depth, or overall premium
   feeling.
4. Give Architecture, Final CTA, and Footer a separate blocking pass/fail review
   for mapped reference principle, source provenance, readable hierarchy, and
   their place in the energy curve. Any failure blocks delivery even though
   these sections are outside the weighted five-scene score.
5. Record every 0/1 or pass/fail failure as a visual delta. Before changing
   source behavior, add or update the narrow failing test and verify the intended
   RED; implement one small delta, rerun affected/full verification, recapture,
   stage exact paths, and create a separate `fix(frontend): refine landing ...`
   commit. Never leave source/test fixes for the documentation-only commit.
6. Mark the implementation agent score `PROVISIONAL`. Final pass additionally
   requires user review/approval or a relatively independent visual reviewer.

Automatic failure remains: `headline + gradient + feature cards + screenshot +
CTA`, diagram-first Hero, noncausal Runtime, flat energy curve, reference IP,
or unrecorded unavailable reference.

- [ ] **Step 5: update durable docs only after engineering gates pass**

Update README with `/` and `/console`. Update architecture with lazy Landing,
pathless Console parent, scoped tokens, static authored content, scene authority,
Vite metadata limitation, and no API/contract change. Update progress with exact
automated/browser/performance results and visual status:

- `VISUAL_APPROVED` only with recorded user/independent approval; or
- `IMPLEMENTED_PENDING_VISUAL_APPROVAL` with the provisional score/artifacts.

Never mark the whole requirement final based on implementation self-score.
Update `docs/sprint-current.md` only if Task 0 explicitly authorized it.

- [ ] **Step 6: run closing reviews and reverify affected files**

Use `code-reviewer` for correctness/security/maintainability and
`review-animations` for Hero/Runtime motion. Resolve confirmed findings through
TDD, rerun the narrow checks, then rerun the full commands from Step 1. Each
confirmed source/test fix receives an exact-path `fix(frontend)` commit before
documentation is staged; if review changes visuals, repeat the affected capture
and fidelity gate.

- [ ] **Step 7: commit docs and stop**

```powershell
git add README.md docs/architecture.md docs/progress.md
git commit -m "docs: record product landing delivery"
```

Add `docs/sprint-current.md` only if explicitly changed. Do not stage
`docs/temp` reference captures or recordings. Report modified files, tests,
commands, artifact paths, provenance ledger, provisional/final visual status,
unchanged `docs/api-contract.md`, and suggested final commit message. Stop; do
not begin another requirement.

---

## Plan Self-Review

### Spec Coverage Matrix

| Design Spec requirement | Plan task |
| --- | --- |
| Dirty-worktree/runtime/requirement gates | Task 0 |
| `/`, `/console`, existing Console/electron URLs | Task 1 |
| Vite metadata, route titles, token/font scope | Task 2 |
| Bilingual IA, landmarks, navigation, shared primitives | Task 3 |
| Product-first Hero, Z0/Z1/Z2, mount sequence, local pointer effects | Task 4 |
| Evidence rail, first beat, pausable Discover scan, Analyze focus sequence, trace handoffs | Task 5 |
| Runtime four-checkpoint authority and 4.8-5.4s causal sequence | Task 6 |
| Second beat, truthful Platform proof gate, bilingual Architecture, CTA, Footer, owned assets | Task 7 |
| Responsive, accessibility, reduced modes, scoped CSS, no forbidden sources | Task 8 |
| Full tests/build/performance/browser QA/fidelity gate/docs/stop | Task 9 |

### Self-Audit Result

- [x] Every production behavior starts with a route-level RED; every objective
  CSS contract starts with a repository RED. Missing imports/browser mocks do
  not count as RED.
- [x] File paths, exported types, checkpoint names, commands, and commit scope
  remain consistent across tasks.
- [x] Hero and Runtime have mandatory standalone browser/motion checkpoints
  before full-page integration.
- [x] Shared Console semantics remain global; Landing presentation and cinematic
  tokens remain scoped; `app.css` and Console navigation are not edited.
- [x] Sandbox showcase fixture/components/contracts are explicitly excluded.
- [x] Static authored scenarios contain no fake telemetry, API, storage, or
  backend/engine/shared-contract dependency.
- [x] Owned assets, font licenses, metadata, route splitting, performance,
  accessibility, reduced modes, and Console regressions have explicit gates;
  current mock Overview data is explicitly rejected as product proof.
- [x] Visual ratio remains directional; implementation tests use product-proof
  criteria rather than pixel-area math.
- [x] The implementation agent cannot self-approve final visual fidelity.
- [x] No unresolved marker, deferred code stub, unspecified dependency, or
  adjacent requirement remains in the plan.
