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
