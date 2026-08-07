# Phase 1 Console Theme Layer and Requirement Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Establish a permanent GENERAL-005 requirement gate, a single-source
console theme token module, dark/compact `ConfigProvider` algorithms, a fully
inverted `app.css`, and repair the one real contrast defect the inversion
exposes — without editing a single existing spec file and without changing the
221-test baseline count.

**Architecture:** `frontend/src/styles/console-theme.ts` is the sole TypeScript
source of colour truth. `app.css` `:root` mirrors it as custom properties, and
every colour literal previously hardcoded inline in a CSS rule is repointed at
one of those properties. `AppProviders` composes
`[theme.darkAlgorithm, theme.compactAlgorithm]` over the seed tokens so every
existing route inherits the console theme with no per-page edit. Two existing
components carry colour literals that the inversion invalidates; both are
repointed at tokens.

**Tech Stack:** React 19.2.4, TypeScript 6.0.2, antd 6.3.4
(`theme.darkAlgorithm`, `theme.compactAlgorithm`), Vitest 4.1.1 + jsdom,
`node:test` for the repository gate.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-005`
- Phase: 1 of 5
- Date: `2026-08-07`
- Status: `PLAN_DRAFT_PENDING_REVIEW`
- Canonical specification:
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- Master plan:
  `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-master.md`

**Execution is not authorized.** This Phase may not begin until all four
conditions in the Master's `Execution Is Blocked` section hold. In
particular `docs/sprint-current.md` still names `REQ-SBX-GENERAL-004`, and
GENERAL-005 is a documentation-only artifact until that changes.

---

## Execution Environment

`npm run test:frontend` **cannot be run from the Windows side of this
workstation.** npm spawns `cmd.exe`, which refuses the
`\\wsl$\Ubuntu\...` UNC path, and Node cannot resolve modules from a UNC cwd.
Every command in this Phase runs inside the distro:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && node --version && pnpm --version'
```

Expected: Node `>=22.19.0` (measured `v22.19.0`), pnpm `10.0.0`.

The frontend test command for this Phase is:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

## Entry Gate

- [ ] Read the approved spec sections `Console Theme Layer`, `Seed Tokens`,
  `CSS Custom Properties`, `Accessibility`, `Compatibility`, and
  `Planned Implementation Surface`.
- [ ] Confirm the Master and spec are both reviewed `PASS`, the user has
  explicitly approved execution, and `docs/sprint-current.md` has been
  transitioned to `REQ-SBX-GENERAL-005`. None of these may be inferred by the
  worker.
- [ ] Record the baseline:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
wsl -e bash -lc 'cd /Agent-security-platform && git diff --check'
```

Expected, and measured on `2026-08-07` before any GENERAL-005 change:

```text
Test Files  15 passed (15)
Tests      221 passed (221)
Duration    ~139.7 s
```

Two pre-existing antd 6 deprecation warnings are emitted by
`review-demo.page.spec.tsx` and are **not** in scope for this Phase:

```text
Warning: [antd: Alert] `message` is deprecated. Please use `title` instead.
Warning: [antd: List] The `List` component is deprecated.
```

Any failure, or any count other than 15/221, blocks implementation until
classified. Preserve unrelated worktree changes; do not reset, clean, or switch
branches.

---

## Locked Phase 1 Palette

Every value below is measured, not chosen by eye. Ratios are WCAG 2.1 relative
luminance contrast against `--console-bg` `#0d1520` and `--console-surface`
`#121c28`.

```text
bg                   #0d1520   base
surface              #121c28   panel            elevation delta 1.07
surface-raised       #16222f   nested row, non-text

ink                  #e4edf5   15.48 / 14.50    AA text
muted                #8fa3b8    7.07 /  6.63    AA text
muted-dim            #7d92a8    5.72 /  5.36    AA text
accent               #22d3ee   10.15 /  9.51    AA text + focus ring
accent-soft          #0f2a35   fill; ink 12.64, accent 8.28

border               #1f2d3d    1.31 /  1.23    decorative separator only
border-strong        #2c3e52    1.67 /  1.57    panel edge, decorative
border-interactive   #51708f    3.55 /  3.32    WCAG 1.4.11 control edge

severity critical    #f87171    6.63 /  6.21    AA text
severity high        #fb923c    8.10 /  7.59    AA text
severity medium      #fbbf24   10.98 / 10.29    AA text
severity low         #38bdf8    8.56 /  8.02    AA text
severity info        #94a3b8    7.15 /  6.70    AA text
action  allow        #34d399    9.54 /  8.94    AA text
action  deny         #f87171    6.63 /  6.21    AA text
```

Two values are deliberate corrections made during design and must not be
reverted to their first drafts:

- `muted-dim` is `#7d92a8`, not `#6b7f94`. The earlier value measured 4.44,
  which is AA-large only and would have failed as body text.
- `border-interactive` `#51708f` exists specifically because
  `border-strong` measures 1.67 and therefore fails WCAG 1.4.11's 3:1 floor for
  the boundary of an interactive control. Inputs, selects, and buttons use
  `border-interactive`; decorative rules use `border`/`border-strong`.

`border` and `border-strong` are permitted below 3:1 **only** because they are
decorative separators that convey no state. Any border that communicates focus,
error, or selection must use `accent`, a severity token, or
`border-interactive`.

---

### Task P1-T1: Permanent GENERAL-005 Requirement Gate

**Files:**
- Create: `tests/repository/sandbox-security-frontend-spec.spec.ts`
- Modify: `package.json` (register the spec in `test:repo`)
- Verify unchanged: `docs/sprint-current.md`,
  `tests/repository/sandbox-security-openclaw-enforcement.spec.ts`

- [ ] **Step 1: Write the failing gate**

This gate asserts the durable existence and ordering of the GENERAL-005
documentation set. It deliberately does **not** assert that
`docs/sprint-current.md` names GENERAL-005, because the sprint pointer rotates
and a predecessor requirement must never be broken by a successor becoming
current. Ownership is proven by the canonical spec and the durable completion
record instead.

```ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const SPEC =
  "docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md";
const MASTER =
  "docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-master.md";

test("REQ-SBX-GENERAL-005 keeps one reviewed spec and five ordered plans", () => {
  const spec = read(SPEC);
  const master = read(MASTER);
  const phasePlans = [
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-1-theme-gate.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-2-service-layer.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-3-components.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-4-pages-routing.md",
    "2026-08-07-sandbox-security-frontend-workbench-005-phase-5-privacy-acceptance.md"
  ] as const;

  assert.match(spec, /Requirement: `REQ-SBX-GENERAL-005`/);
  assert.match(master, /Requirement: `REQ-SBX-GENERAL-005`/);

  const discovered = readdirSync(
    new URL("../../docs/superpowers/plans/", import.meta.url)
  )
    .filter((name) =>
      /^2026-08-07-sandbox-security-frontend-workbench-005-phase-.*\.md$/.test(name)
    )
    .sort();
  assert.deepEqual(discovered, [...phasePlans].sort());

  let previousIndex = -1;
  for (const [index, filename] of phasePlans.entries()) {
    read(`docs/superpowers/plans/${filename}`);
    const currentIndex = master.indexOf(`| ${index + 1} | \`${filename}\``);
    assert.ok(
      currentIndex > previousIndex,
      `plan ${index + 1} is missing from the Master plan set or out of order`
    );
    previousIndex = currentIndex;
  }
});

test("REQ-SBX-GENERAL-005 preserves the GENERAL-004 durable record", () => {
  const sprint = read("docs/sprint-current.md");
  assert.match(sprint, /## Requirement ID\s+REQ-SBX-GENERAL-00[45]/);
});

test("REQ-SBX-GENERAL-005 registers its gate in test:repo", () => {
  const rootPackage = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.match(
    rootPackage.scripts?.["test:repo"] ?? "",
    /sandbox-security-frontend-spec\.spec\.ts/
  );
});
```

- [ ] **Step 2: Verify the RED is correct**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp node \
  --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-frontend-spec.spec.ts'
```

Expected: the third case fails because `test:repo` does not yet name the new
spec. The first case fails only until all five phase plan files exist. Confirm
each failure names the intended assertion — a `MODULE_NOT_FOUND` or a missing
spec/Master file is an environment error, not the intended RED.

- [ ] **Step 3: GREEN — register the gate**

Add the spec to `test:repo` in root `package.json`, preserving the existing
command order and every other registered repository spec.

- [ ] **Step 4: Confirm**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test:repo'
```

Expected: the three new cases pass and no previously passing repository case
regresses.

- [ ] **Step 5: Commit exactly**

```text
tests/repository/sandbox-security-frontend-spec.spec.ts
package.json
```

Suggested message:
`test(sandbox): add GENERAL-005 frontend requirement gate`

---

### Task P1-T2: Console Theme Token Module

**Files:**
- Create: `frontend/src/styles/console-theme.ts`
- Create: `frontend/src/styles/console-theme.spec.ts`
- Verify unchanged: every existing file under `frontend/src`

- [ ] **Step 1: Write the failing token + contrast test**

The test must compute contrast rather than restate a hardcoded number, so a
future token edit that breaks accessibility fails loudly.

```ts
import { describe, expect, it } from "vitest";

import {
  consolePalette,
  consoleThemeTokens,
  contrastRatio
} from "./console-theme";

describe("REQ-SBX-GENERAL-005 console theme tokens", () => {
  it("exposes the locked dark slate seed tokens", () => {
    expect(consoleThemeTokens.colorPrimary).toBe("#22d3ee");
    expect(consoleThemeTokens.colorBgBase).toBe("#0d1520");
    expect(consoleThemeTokens.colorTextBase).toBe("#e4edf5");
    expect(consoleThemeTokens.borderRadius).toBe(6);
  });

  it("keeps every text token at or above WCAG AA 4.5 on bg and surface", () => {
    const textTokens = [
      "ink",
      "muted",
      "mutedDim",
      "accent",
      "severityCritical",
      "severityHigh",
      "severityMedium",
      "severityLow",
      "severityInfo",
      "actionAllow",
      "actionDeny"
    ] as const;

    for (const token of textTokens) {
      const value = consolePalette[token];
      expect(
        contrastRatio(value, consolePalette.bg),
        `${token} on bg`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(value, consolePalette.surface),
        `${token} on surface`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the interactive control border at or above WCAG 1.4.11 3:1", () => {
    expect(
      contrastRatio(consolePalette.borderInteractive, consolePalette.bg)
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(consolePalette.borderInteractive, consolePalette.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("rejects the earlier muted-dim draft that failed AA body text", () => {
    expect(consolePalette.mutedDim).not.toBe("#6b7f94");
    expect(contrastRatio("#6b7f94", consolePalette.bg)).toBeLessThan(4.5);
  });

  it("computes a known contrast ratio correctly", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#0d1520", "#0d1520")).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Verify the RED**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npx vitest run \
  --config frontend/vitest.config.mjs --configLoader native \
  --root frontend src/styles/console-theme.spec.ts'
```

Expected: the suite fails to resolve `./console-theme`. That is the intended
RED for a module that does not exist yet.

- [ ] **Step 3: GREEN — implement the module**

Export exactly three things: `consolePalette` (raw values),
`consoleThemeTokens` (antd seed tokens derived from the palette), and
`contrastRatio` (WCAG 2.1 relative-luminance implementation). Identifiers are
English per `metadata.md`. No React import belongs in this file.

- [ ] **Step 4: Confirm and check the whole suite is untouched**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: `16 passed (16)` files and `221 + <new>` tests. The pre-existing 221
must all still pass.

- [ ] **Step 5: Commit exactly**

```text
frontend/src/styles/console-theme.ts
frontend/src/styles/console-theme.spec.ts
```

Suggested message:
`feat(frontend): add console theme tokens with measured contrast`

---

### Task P1-T3: Dark and Compact ConfigProvider

**Files:**
- Modify: `frontend/src/app/AppProviders.tsx`
- Create: `frontend/src/styles/console-theme.provider.spec.tsx`

This provider case **must** live in a `.tsx` file. `frontend/vitest.config.mjs`
sets no `esbuild.loader` override, so esbuild parses a `.ts` file as TypeScript
without JSX, and `"jsx": "react-jsx"` in `tsconfig.json` does not change the
extension rule. JSX placed in `console-theme.spec.ts` dies with a transform
error, which is an environment failure masquerading as RED — barred by
AGENTS.md and `metadata.md`.
- Verify unchanged: `frontend/src/app/app-shell.spec.tsx`,
  `frontend/src/test/app-test-harness.tsx`, and every other existing spec

`AppProviders.tsx` currently hardcodes five light-mode literals — `#146c72`
twice, `#f3f7f6`, `#102a2d`, `#d7e3e2` — and no algorithm. All five are replaced
by `consoleThemeTokens`.

- [ ] **Step 1: Write the failing provider test**

Assert the resolved token, not the source literal, so the test proves the
algorithm actually applied.

```tsx
import { render, screen } from "@testing-library/react";
import { theme } from "antd";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../app/AppProviders";
import { consolePalette } from "./console-theme";

function TokenProbe() {
  const { token } = theme.useToken();
  return (
    <div
      data-testid="probe"
      data-bg={token.colorBgBase}
      data-primary={token.colorPrimary}
      data-radius={String(token.borderRadius)}
      data-text={token.colorTextBase}
    />
  );
}

describe("REQ-SBX-GENERAL-005 AppProviders console theme", () => {
  it("applies the dark slate seed tokens through ConfigProvider", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );

    const probe = screen.getByTestId("probe");
    expect(probe.dataset.bg).toBe(consolePalette.bg);
    expect(probe.dataset.primary).toBe(consolePalette.accent);
    expect(probe.dataset.radius).toBe("6");
  });

  it("resolves a dark container token, proving darkAlgorithm is active", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );

    const probe = screen.getByTestId("probe");
    // darkAlgorithm derives a light ink from the dark base; the light default
    // would derive a near-black. Assert the derived direction, not a literal.
    const ink = probe.dataset.text ?? "";
    expect(ink.toLowerCase()).toBe(consolePalette.ink.toLowerCase());
  });

  it("no longer contains the light teal seed", () => {
    render(
      <AppProviders>
        <TokenProbe />
      </AppProviders>
    );
    expect(screen.getByTestId("probe").dataset.primary).not.toBe("#146c72");
  });
});
```

- [ ] **Step 2: Verify the RED**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npx vitest run \
  --config vitest.config.mjs --configLoader native \
  --root frontend src/styles/console-theme.provider.spec.tsx'
```

Expected: `data-primary` is `#146c72` and `data-radius` is `16`, so the first
and third cases fail on the current light configuration. Confirm the failure
message shows the old teal — that proves the probe is wired correctly and the
provider has genuinely not been changed yet. A transform or parse error here
means the file was created as `.ts`; fix the extension rather than the test.

- [ ] **Step 3: GREEN — compose the algorithms**

Set `algorithm: [theme.darkAlgorithm, theme.compactAlgorithm]` and spread
`consoleThemeTokens` into `token`. Keep `AntdApp` and the `children` contract
exactly as they are; `renderAppAtRoute` depends on this component's signature.

- [ ] **Step 4: Confirm the assertion-neutrality claim**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: **every one of the 221 pre-existing tests still passes with zero edits
to any existing spec file.** This is the load-bearing verification of the whole
theme strategy. If any existing assertion fails here, stop: it means that spec
depends on a visual value, which contradicts the design's compatibility
analysis, and the Master's rollback rule applies.

- [ ] **Step 5: Commit exactly**

```text
frontend/src/app/AppProviders.tsx
frontend/src/styles/console-theme.provider.spec.tsx
```

Suggested message:
`feat(frontend): apply dark compact console theme at ConfigProvider`

---

### Task P1-T4: Invert app.css and Repoint Inline Literals

**Files:**
- Modify: `frontend/src/styles/app.css`
- Create: `tests/repository/frontend-console-theme-literals.spec.ts`
- Modify: `package.json` (register the new gate in `test:repo`)
- Verify unchanged: every existing spec file

`test:repo` enumerates each repository spec path explicitly — it does **not**
glob. A gate that is created but not appended to that script never executes, so
Step 1's RED would observe nothing and the exit criterion would be unenforced
forever. Registration is part of this task, not an afterthought.

`app.css` currently holds 12 hex literals and 25 `rgba()` values. **Both groups
must be classified**, because the Step 1 gate regex matches hex and `rgba(`
equally.

The 25 `rgba()` values:

```text
light surfaces      rgba(255,255,255,0.92|0.9|0.6|0.35)          4
                    rgba(248,251,250,0.96) x2, rgba(248,251,250,0.6)
                    rgba(245,250,249,0.88)
light borders       rgba(215,227,226,0.85) x3, rgba(215,227,226,0.95)
old teal accent     rgba(20,108,114,0.2|0.16|0.14|0.12 x2|0.1|0.08)
dark-on-light grid  rgba(16,42,45,0.03) x4        -> invisible on dark
panel shadow        rgba(11,44,47,0.08)           -> needs dark re-tune
muted fallback      rgba(0,0,0,0.45)              -> invisible on dark
```

19 of the 25 are light surfaces, light borders, or old-teal accents that must be
repointed at custom properties. The 4 dark grid overlays and the panel shadow
must be re-tuned for a dark base rather than merely repointed, because a
3%-opacity dark overlay on a dark background is invisible.

The 12 hex literals split 5 inside `:root` and **7 inline in rules**. Only the
5 are value swaps; the 7 need explicit action:

```text
line  28  body background   linear-gradient(180deg, #eef5f4, #f7faf9, #f1f6f5)
          -> 3 literals, all 16.6-17.5:1 against the dark base, i.e. a white
             page. Replace the whole gradient with var(--console-bg).
line  60  brand mark        linear-gradient(160deg, #146c72 0%, #1d8f84 100%)
          -> 2 literals. MEASURED: #146c72 is 2.98:1 against #0d1520, which
             FAILS the WCAG 1.4.11 3:1 non-text floor. It cannot be carried
             over unchanged. Replace with
             var(--console-accent-soft) -> var(--console-accent-strong)
             (#0f2a35 -> #0e7490, 3.42:1), glyph in var(--console-accent).
line 405  focus fallback    var(--console-accent, #1677ff)
line 679  focus fallback    var(--console-accent, #1677ff)
          -> 2 literals. Drop the fallback entirely; `--console-accent` is
             always defined in :root, so the fallback is dead and only exists
             to defeat the gate. Write var(--console-accent).
```

`--console-accent-strong` (`#0e7490`) is introduced here with its measured
ratios, per the spec rule that any new token arrives with its measurement.

- [ ] **Step 1: Write the failing literal gate**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("app.css declares colour literals only inside :root", () => {
  const css = read("frontend/src/styles/app.css");
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const outsideRoot = css.replace(rootBlock, "");

  const literals = outsideRoot.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(
    literals,
    [],
    `app.css must reference var(--console-*) outside :root, found ${literals.join(", ")}`
  );
});

test("app.css uses the dark colour scheme", () => {
  const css = read("frontend/src/styles/app.css");
  assert.match(css, /color-scheme:\s*dark/);
  assert.doesNotMatch(css, /color-scheme:\s*light/);
});

test("no frontend source file outside the theme module hardcodes a colour", () => {
  const offenders: string[] = [];
  for (const path of [
    "frontend/src/app/AppProviders.tsx",
    "frontend/src/components/supervision/SupervisionSessionList.tsx",
    "frontend/src/components/task-detail/StaticAnalysisResultSection.tsx"
  ]) {
    const source = read(path);
    const hits = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    if (hits.length > 0) offenders.push(`${path}: ${hits.join(", ")}`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
```

- [ ] **Step 2: Verify the RED**

Expected three failures naming, respectively: the inline `rgba()`/hex literals
still present outside `:root`; `color-scheme: light` at line 2; and the
remaining hardcoded colours in the three listed files.

- [ ] **Step 3: GREEN — invert `:root` and repoint every rule**

Set `color-scheme: dark`. Replace the eight existing variable values with the
locked palette and add `--console-surface-raised`, `--console-muted-dim`,
`--console-border-strong`, `--console-border-interactive`, and `--console-mono`,
plus the severity and action variables. Then repoint every inline literal in
every rule at a variable. Re-tune, do not merely repoint:

- the four `rgba(16,42,45,0.03)` grid overlays become a light-on-dark hairline;
- `--console-shadow` becomes a dark-base shadow;
- `rgba(0,0,0,0.45)` becomes `var(--console-muted)`.

Preserve every selector, every media query, the `prefers-reduced-motion` block,
and the `rise-in` keyframes. Do not rename a class or restructure a rule — the
existing high-specificity `.console-shell.ant-layout-has-sider > .console-main`
override and its explanatory comment must survive verbatim.

- [ ] **Step 4: Fix the two component literals**

`StaticAnalysisResultSection.tsx:51` is a genuine accessibility defect once the
theme inverts. The `<pre>` sets `background: "#f5f5f5"` and no colour, so it
inherits the dark theme ink `#e4edf5`, measuring **1.09:1** — effectively
invisible. Repoint the background at `--console-surface-raised` `#16222f`, which
measures **13.60:1** against the inherited ink.

`SupervisionSessionList.tsx:19-24` holds six status icon colours. These are
**not** a compliance defect: each is applied to a `role="img"` element with an
`aria-label`, so WCAG 1.4.11's 3:1 non-text floor applies, and all six clear it
on the dark base (`#1677ff` 4.47, `#d48806` 6.39, `#52c41a` 8.09, `#ff4d4f`
5.61, `#fa541c` 5.54, `#faad14` 9.65). Repoint them at severity/action tokens
for palette consistency only. Preserve every `aria-label` string exactly —
`supervision-event-details.spec.tsx` and `campaign-components.spec.tsx` query by
accessible name.

- [ ] **Step 5: Confirm**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test:repo'
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
wsl -e bash -lc 'cd /Agent-security-platform && git diff --check'
```

Expected: the literal gate passes, and all 221 pre-existing frontend tests still
pass with no existing spec edited.

- [ ] **Step 6: Commit exactly**

```text
frontend/src/styles/app.css
frontend/src/components/task-detail/StaticAnalysisResultSection.tsx
frontend/src/components/supervision/SupervisionSessionList.tsx
tests/repository/frontend-console-theme-literals.spec.ts
package.json
```

Suggested message:
`fix(frontend): invert console stylesheet to dark tokens`

---

## Phase 1 Exit Criteria

- [ ] The GENERAL-005 repository gate passes and is registered in `test:repo`.
- [ ] `console-theme.ts` is the only TypeScript source of colour truth, and its
  spec computes every contrast ratio instead of restating one.
- [ ] `AppProviders` applies `darkAlgorithm` + `compactAlgorithm`; no light seed
  literal remains.
- [ ] `app.css` declares colour only in `:root`, uses `color-scheme: dark`, and
  every rule references a custom property.
- [ ] The `<pre>` contrast defect is fixed and measured at ≥ 4.5:1.
- [ ] **All 221 pre-existing tests pass and not one existing spec file was
  edited.**
- [ ] `git diff --check` is clean and no unrelated worktree change was
  discarded.

Stop and report before starting Phase 2. Do not create any
`frontend/src/components/sandbox-security/` file, page, route, or service in this
Phase — those belong to Phases 2 through 4.
