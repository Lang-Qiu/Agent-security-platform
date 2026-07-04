// Repository gate for the review-demo UI (REQ-T1-DEMO-010 review demo UI).
//
// Asserts that the guided evaluator tour page is:
// - Present as a set of frontend files (page, content loader, three panels)
// - Registered as a route and a top-level nav entry
// - Reusing the versioned JSON content catalog (not a duplicated copy)
// - Free of prohibited command surfaces (read-only, same rule as campaign UI)
// - Never fetching report artifact files directly (evidence goes through the
//   existing getCampaignEvidence read, not a raw file path)
// - Registered in the canonical test:repo gate

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const packagePath = resolve(repoRoot, "package.json");

const reviewDemoFiles = [
  "frontend/src/pages/ReviewDemoPage.tsx",
  "frontend/src/content/review-demo-content.ts",
  "frontend/src/components/review-demo/ReviewTourNav.tsx",
  "frontend/src/components/review-demo/CampaignSnapshotPanel.tsx",
  "frontend/src/components/review-demo/ScenarioInvestigationPanel.tsx",
  "frontend/src/components/review-demo/EvidenceVerificationPanel.tsx"
].map((path) => resolve(repoRoot, path));

const reviewDemoTestFile = resolve(
  repoRoot,
  "frontend/src/pages/review-demo.page.spec.tsx"
);

function readOrThrow(path: string): string {
  return readFileSync(path, "utf8");
}

const PROHIBITED_COMMANDS = [
  "Start campaign",
  "Retry attack",
  "Approve",
  "Reject",
  "Cancel campaign",
  "Edit policy",
  "Acknowledge",
  "开始 campaign",
  "编辑策略",
  "批准整改",
  "驳回整改"
];

const PROHIBITED_ARTIFACT_PATHS = [
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "manifest.json",
  "campaign.json"
];

test("REQ-T1-DEMO-010 review demo UI files exist and are non-empty", () => {
  for (const file of reviewDemoFiles) {
    const source = readOrThrow(file);
    assert.ok(source.length > 0, `${file} must not be empty`);
  }
});

test("REQ-T1-DEMO-010 review demo route and nav are registered", () => {
  const routes = readOrThrow(resolve(repoRoot, "frontend/src/app/routes.tsx"));
  assert.match(
    routes,
    /path:\s*"review-demo"/,
    "routes.tsx must register the review-demo path"
  );
  assert.match(
    routes,
    /ReviewDemoPage/,
    "routes.tsx must import and render ReviewDemoPage"
  );

  const navigation = readOrThrow(
    resolve(repoRoot, "frontend/src/app/navigation.tsx")
  );
  assert.match(
    navigation,
    /path:\s*"\/review-demo"/,
    "navigation.tsx must register a /review-demo nav entry"
  );
});

test("REQ-T1-DEMO-010 review demo content loader reuses the versioned JSON catalog", () => {
  const loader = readOrThrow(
    resolve(repoRoot, "frontend/src/content/review-demo-content.ts")
  );
  assert.match(
    loader,
    /content\.zh-CN\.json/,
    "review-demo-content.ts must import the versioned catalog, not a duplicated copy"
  );
});

test("REQ-T1-DEMO-010 review demo UI has no prohibited command surfaces", () => {
  const allSource = reviewDemoFiles.map(readOrThrow).join("\n");
  for (const command of PROHIBITED_COMMANDS) {
    assert.equal(
      allSource.includes(command),
      false,
      `Prohibited command surface "${command}" found in review demo UI source`
    );
  }
});

test("REQ-T1-DEMO-010 review demo UI has no raw narrative content field labels", () => {
  const allSource = reviewDemoFiles.map(readOrThrow).join("\n");
  assert.doesNotMatch(allSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(
    allSource,
    /\b(raw_prompt|raw_output|raw_content|model_content|tool_arguments)\b/
  );
});

test("REQ-T1-DEMO-010 review demo UI never fetches report artifact files directly", () => {
  const allSource = reviewDemoFiles.map(readOrThrow).join("\n");
  for (const artifactPath of PROHIBITED_ARTIFACT_PATHS) {
    assert.equal(
      allSource.includes(artifactPath),
      false,
      `Review demo UI must not reference report artifact path "${artifactPath}" directly — use getCampaignEvidence`
    );
  }
});

test("REQ-T1-DEMO-010 campaign snapshot panel reuses the existing campaign polling hook", () => {
  const panel = readOrThrow(
    resolve(
      repoRoot,
      "frontend/src/components/review-demo/CampaignSnapshotPanel.tsx"
    )
  );
  assert.match(
    panel,
    /useCampaignSupervisionPolling/,
    "CampaignSnapshotPanel must reuse useCampaignSupervisionPolling rather than reimplementing polling"
  );
});

test("REQ-T1-DEMO-010 evidence verification panel uses getCampaignEvidence, not a hand-rolled fetch", () => {
  const panel = readOrThrow(
    resolve(
      repoRoot,
      "frontend/src/components/review-demo/EvidenceVerificationPanel.tsx"
    )
  );
  assert.match(
    panel,
    /getCampaignEvidence/,
    "EvidenceVerificationPanel must call getCampaignEvidence for evidence readiness"
  );
});

test("REQ-T1-DEMO-010 review demo UI test file exists and is non-empty", () => {
  const source = readOrThrow(reviewDemoTestFile);
  assert.ok(source.length > 0, "review-demo.page.spec.tsx must not be empty");
});

test("REQ-T1-DEMO-010 review demo UI repository gate is registered in test:repo script", () => {
  const pkg = JSON.parse(readOrThrow(packagePath)) as {
    scripts: Record<string, string>;
  };
  assert.match(
    pkg.scripts["test:repo"],
    /track1-review-demo-ui\.spec\.ts/,
    "test:repo script must include track1-review-demo-ui.spec.ts"
  );
});
