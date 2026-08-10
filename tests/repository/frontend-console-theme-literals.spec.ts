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
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

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

  // A bare substring check is satisfied by a longer descendant name: deleting
  // `.workbench-decision-hero` while keeping `.workbench-decision-hero__reserve`
  // would pass. Require a real rule head instead.
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const selector of requiredSelectors) {
    assert.match(
      css,
      new RegExp(`${escape(selector)}(?![\\w-])`),
      `missing Workbench selector rule: ${selector}`
    );
  }

  // Every gapped Workbench container must establish a formatting context that
  // honours `gap`. A `gap` on a `display: block` section is silently inert and
  // collapses the panel's rows flush against each other.
  for (const [selector, expected] of [
    [".workbench-credential-panel", "grid"],
    [".workbench-evidence-trace", "grid"],
    [".workbench-execution-trace", "grid"],
    [".workbench-insight-grid", "grid"],
    [".workbench-stage-tabs", "grid"],
    [".workbench-byte-meter", "grid"],
    [".workbench-credential-panel__heading", "flex"]
  ] as const) {
    const rule = css.match(
      new RegExp(`\\n${escape(selector)}\\s*\\{([^}]*)\\}`)
    );
    assert.ok(rule, `missing rule for ${selector}`);
    assert.match(
      rule[1],
      new RegExp(`display:\\s*${expected}`),
      `${selector} declares gap/row layout and must set display: ${expected}`
    );
  }
  assert.match(
    css,
    /grid-template-columns:\s*minmax\(300px,\s*0\.75fr\)\s+minmax\(500px,\s*1\.25fr\)/
  );
  assert.match(css, /@keyframes\s+workbench-pulse-badge/);
  assert.match(css, /@keyframes\s+workbench-shimmer/);

  // Asserting the keyframes merely exist does not prove they are ever switched
  // off. Both Workbench loading animations are infinite, so the reduced-motion
  // shutdown is the accessibility contract and must be asserted directly. The
  // showcase glow lives in its own block and is checked separately below, so an
  // unrelated showcase edit can no longer fail the Workbench contract.
  const reducedMotionBlocks = [
    ...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)
  ].map((match) => match[1]);
  assert.ok(reducedMotionBlocks.length > 0, "no reduced-motion block found");
  const workbenchQuiet = reducedMotionBlocks.find((block) =>
    block.includes(".workbench-")
  );
  assert.ok(workbenchQuiet, "missing Workbench reduced-motion shutdown");
  for (const selector of [
    ".workbench-evaluating-badge",
    ".workbench-shimmer-row::after"
  ]) {
    assert.ok(
      workbenchQuiet.includes(selector),
      `${selector} runs an infinite animation and must be quieted under reduced motion`
    );
  }
  assert.match(workbenchQuiet, /animation:\s*none/);
  assert.ok(
    reducedMotionBlocks.some((block) =>
      /\.showcase-spotlight__glow\s*\{[^}]*display:\s*none/.test(block)
    ),
    "showcase spotlight glow must be hidden under reduced motion"
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
    // Bind the token to the properties that actually colour the node. A
    // presence-only check passes when the node is recoloured grey and the token
    // survives in an unrelated declaration or a comment.
    const rule = css.match(
      new RegExp(
        `\\.workbench-evidence-trace__node\\[data-outcome="${outcome}"\\][^{]*\\{([^}]*)\\}`
      )
    );
    assert.ok(rule, `missing EvidenceTrace outcome rule: ${outcome}`);
    for (const property of ["border-color", "background"]) {
      assert.match(
        rule[1],
        new RegExp(`${property}:\\s*var\\(${escape(token)}\\)`),
        `${outcome} must set ${property} to var(${token})`
      );
    }
  }

  // Anchor to a rule head at line start and tolerate whitespace: an unanchored
  // `indexOf(selector + " {")` also matches descendant rules such as
  // `.sandbox-workbench-results .console-panel {`, so it can silently measure a
  // different rule, and it breaks on any reformat that removes the space.
  const radiusFor = (selector: string): number => {
    const rule = css.match(
      new RegExp(`\\n${escape(selector)}\\s*\\{([^}]*)\\}`)
    );
    assert.ok(rule, `missing radius selector: ${selector}`);
    const match = rule[1].match(/border-radius:\s*(\d+)px/);
    assert.ok(match, `missing px radius in ${selector}`);
    return Number(match[1]);
  };
  assert.equal(radiusFor(".console-panel"), 24);

  // The narrow-viewport override must stay inside the Spec's major-surface
  // range rather than drifting to an arbitrary value.
  const narrowPanelRadius = css.match(
    /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\n {2}\.console-panel\s*\{([^}]*)\}/
  );
  if (narrowPanelRadius) {
    const narrow = narrowPanelRadius[1].match(/border-radius:\s*(\d+)px/);
    if (narrow) {
      const value = Number(narrow[1]);
      assert.ok(
        value >= 20 && value <= 24,
        `narrow-viewport .console-panel radius ${value}px escapes the 20-24px major range`
      );
    }
  }

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

  // A descendant rule head such as `.workbench-decision-hero .showcase-verdict`
  // satisfies the inventory check above, so assert the base rule separately: it
  // carries the overflow containment that keeps VerdictHero's oversized pulse
  // ring from producing page-level scrollbars.
  const heroBase = css.match(/\n\.workbench-decision-hero\s*\{([^}]*)\}/);
  assert.ok(heroBase, "missing .workbench-decision-hero base rule");
  assert.match(
    heroBase[1],
    /overflow:\s*hidden/,
    ".workbench-decision-hero must contain its own overflow"
  );

  // Inspecting only the captured override rule is defeated by any later rule
  // that redeclares the radius. These panels must inherit .console-panel's
  // radius everywhere, so assert it is never redeclared anywhere in the file.
  for (const selector of [
    ".workbench-request-composer",
    ".workbench-credential-panel",
    ".workbench-decision-hero"
  ]) {
    for (const rule of css.matchAll(
      new RegExp(`${escape(selector)}(?![\\w-])[^{}]*\\{([^}]*)\\}`, "g")
    )) {
      assert.doesNotMatch(
        rule[1],
        /border-radius/,
        `${selector} must inherit .console-panel's radius, not redeclare it`
      );
    }
  }

  const evidenceRadius = radiusFor(".workbench-evidence-trace");
  assert.ok(evidenceRadius >= 8 && evidenceRadius <= 12);
  const executionRadius = radiusFor(".workbench-execution-trace");
  assert.ok(executionRadius >= 20 && executionRadius <= 24);
});
