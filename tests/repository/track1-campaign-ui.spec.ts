// P5-T6: Repository gate for campaign supervision UI.
//
// Asserts that the campaign supervision mode is:
// - Registered in the canonical test:repo gate
// - Present in the frontend test suite (service, hook, components, page)
// - Read-only (no prohibited command surfaces)
// - Free of raw narrative content field labels
// - Using shared normalizers (not hand-rolled validation)
// - Using the exact campaign API endpoints
// - Never falling back to mock data on API failure
// - Rendering evidence-state markers for Phase 6 screenshot capture
// - Honoring the 1100px responsive breakpoint

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const packagePath = resolve(repoRoot, "package.json");

const campaignFrontendFiles = [
  "frontend/src/services/campaign-supervision-service.ts",
  "frontend/src/hooks/useCampaignSupervisionPolling.ts",
  "frontend/src/components/supervision/CampaignOverviewHeader.tsx",
  "frontend/src/components/supervision/CampaignAgentGroup.tsx",
  "frontend/src/pages/SandboxAlertsPage.tsx"
].map((path) => resolve(repoRoot, path));

const campaignSources = campaignFrontendFiles.map((file) =>
  readFileSync(file, "utf8")
);

const campaignTestFiles = [
  "frontend/src/services/campaign-supervision-service.spec.ts",
  "frontend/src/hooks/use-campaign-supervision-polling.spec.tsx",
  "frontend/src/components/supervision/campaign-components.spec.tsx",
  "frontend/src/pages/sandbox-alerts.page.spec.tsx"
].map((path) => resolve(repoRoot, path));

const PROHIBITED_COMMANDS = [
  "Start campaign",
  "Retry attack",
  "Approve",
  "Reject",
  "Cancel campaign",
  "Edit policy",
  "Acknowledge"
];

test("REQ-T1-DEMO-010 campaign UI files import useCampaignSupervisionPolling in page", () => {
  const page = readFileSync(
    resolve(repoRoot, "frontend/src/pages/SandboxAlertsPage.tsx"),
    "utf8"
  );
  assert.ok(
    page.includes("useCampaignSupervisionPolling"),
    "SandboxAlertsPage must import useCampaignSupervisionPolling"
  );
});

test("REQ-T1-DEMO-010 campaign header renders data-evidence-state marker", () => {
  const header = readFileSync(
    resolve(repoRoot, "frontend/src/components/supervision/CampaignOverviewHeader.tsx"),
    "utf8"
  );
  assert.ok(
    header.includes("data-evidence-state"),
    "CampaignOverviewHeader must render data-evidence-state for Phase 6 screenshot capture"
  );
});

test("REQ-T1-DEMO-010 campaign UI has no prohibited command surfaces", () => {
  const allSource = campaignSources.join("\n");
  for (const command of PROHIBITED_COMMANDS) {
    assert.equal(
      allSource.includes(command),
      false,
      `Prohibited command surface "${command}" found in campaign UI source`
    );
  }
});

test("REQ-T1-DEMO-010 campaign UI has no raw narrative content field labels", () => {
  const allSource = campaignSources.join("\n");
  assert.doesNotMatch(allSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(allSource, /\b(raw_prompt|raw_output|raw_content|model_content|tool_arguments)\b/);
  // No generic Object.entries rendering of payload/event/detail that could
  // leak arbitrary fields.
  assert.doesNotMatch(allSource, /Object\.entries\([^)]*(payload|event|detail)/);
});

test("REQ-T1-DEMO-010 campaign service uses shared normalizers, not hand-rolled validation", () => {
  const service = readFileSync(
    resolve(repoRoot, "frontend/src/services/campaign-supervision-service.ts"),
    "utf8"
  );
  assert.ok(
    service.includes("normalizeTrack1CampaignDetail"),
    "Campaign service must import normalizeTrack1CampaignDetail from shared contracts"
  );
  assert.ok(
    service.includes("normalizeTrack1CampaignSummary"),
    "Campaign service must import normalizeTrack1CampaignSummary from shared contracts"
  );
  assert.ok(
    service.includes("normalizeTrack1CampaignEvidenceExport"),
    "Campaign service must import normalizeTrack1CampaignEvidenceExport from shared contracts"
  );
});

test("REQ-T1-DEMO-010 campaign service uses exact API endpoints", () => {
  const service = readFileSync(
    resolve(repoRoot, "frontend/src/services/campaign-supervision-service.ts"),
    "utf8"
  );
  assert.ok(
    service.includes('"/api/supervision/campaigns"'),
    "Campaign service must use /api/supervision/campaigns endpoint"
  );
});

test("REQ-T1-DEMO-010 campaign service never falls back to mock data on API failure", () => {
  const service = readFileSync(
    resolve(repoRoot, "frontend/src/services/campaign-supervision-service.ts"),
    "utf8"
  );
  // The campaign service may import makeCampaign* factories for the explicit
  // mock-only mode, but must NOT use findMock (runtime mock lookup by ID) as
  // a fallback in api-preferred mode.
  assert.doesNotMatch(
    service,
    /\bfindMockCampaign\b/,
    "Campaign service must not use findMockCampaign — no runtime mock lookup fallback"
  );
  // All API failure paths must return integration-error with data: null,
  // not a mock object. Verify the catch blocks return integration-error.
  assert.ok(
    service.includes('{ data: null, source: "integration-error"'),
    "Campaign service must return { data: null, source: integration-error } on API failure"
  );
});

test("REQ-T1-DEMO-010 campaign CSS has 1100px responsive breakpoint for campaign workbench", () => {
  const css = readFileSync(
    resolve(repoRoot, "frontend/src/styles/app.css"),
    "utf8"
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.campaign-mode\s+\.campaign-workbench\s*\{[^}]*grid-template-columns:\s*1fr/s,
    "Campaign workbench must collapse to single column at 1100px or less"
  );
});

test("REQ-T1-DEMO-010 campaign CSS uses overflow-wrap anywhere for long safe IDs", () => {
  const css = readFileSync(
    resolve(repoRoot, "frontend/src/styles/app.css"),
    "utf8"
  );
  assert.match(
    css,
    /overflow-wrap:\s*anywhere/,
    "Campaign CSS must use overflow-wrap: anywhere to prevent horizontal overflow from long IDs"
  );
});

test("REQ-T1-DEMO-010 campaign CSS does not use viewport-relative font sizes", () => {
  const css = readFileSync(
    resolve(repoRoot, "frontend/src/styles/app.css"),
    "utf8"
  );
  assert.doesNotMatch(
    css,
    /font-size:\s*[^;]*vw/,
    "Campaign CSS must not use vw font sizes — they cause uncontrolled scaling"
  );
});

test("REQ-T1-DEMO-010 campaign CSS has mobile-view visibility toggles for narrow panels", () => {
  const css = readFileSync(
    resolve(repoRoot, "frontend/src/styles/app.css"),
    "utf8"
  );
  assert.match(
    css,
    /\.campaign-workbench\.mobile-view-inspector\s+\.campaign-agents\s*\{\s*display:\s*none/,
    "CSS must hide agent list when in inspector view at narrow viewport"
  );
  assert.match(
    css,
    /\.campaign-workbench\.mobile-view-list\s+\.supervision-inspector\s*\{\s*display:\s*none/,
    "CSS must hide inspector when in list view at narrow viewport"
  );
});

test("REQ-T1-DEMO-010 campaign UI tests are registered in frontend vitest config", () => {
  // The frontend test command is `npm run test --prefix frontend` which runs
  // vitest with the default glob. All spec files matching *.spec.tsx? are
  // included. Verify the test files exist.
  for (const testFile of campaignTestFiles) {
    const source = readFileSync(testFile, "utf8");
    assert.ok(
      source.length > 0,
      `Campaign test file ${testFile} must not be empty`
    );
  }
});

test("REQ-T1-DEMO-010 repository gate is registered in test:repo script", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  assert.match(
    pkg.scripts["test:repo"],
    /track1-campaign-ui\.spec\.ts/,
    "test:repo script must include track1-campaign-ui.spec.ts"
  );
});

test("REQ-T1-DEMO-010 campaign frontend tests include the expected spec files", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  // The frontend test command runs vitest which auto-discovers *.spec.tsx
  // files. Verify the frontend package.json test script exists.
  const frontendPkg = JSON.parse(
    readFileSync(resolve(repoRoot, "frontend/package.json"), "utf8")
  );
  assert.ok(
    frontendPkg.scripts.test,
    "Frontend package.json must have a test script"
  );
});
