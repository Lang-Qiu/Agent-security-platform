import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const packagePath = resolve(repoRoot, "package.json");
const sharedPackagePath = resolve(repoRoot, "shared/package.json");
const supervisionFrontendFiles = [
  "frontend/src/services/supervision-service.ts",
  "frontend/src/hooks/useSupervisionPolling.ts",
  "frontend/src/pages/SandboxAlertsPage.tsx",
  "frontend/src/components/supervision/SupervisionOverviewHeader.tsx",
  "frontend/src/components/supervision/SupervisionFilters.tsx",
  "frontend/src/components/supervision/SupervisionSessionList.tsx",
  "frontend/src/components/supervision/SupervisionSessionInspector.tsx",
  "frontend/src/components/supervision/SupervisionEventTimeline.tsx",
  "frontend/src/components/supervision/SupervisionEventDetails.tsx",
  "frontend/src/components/task-detail/SandboxTaskSupervisionSection.tsx",
  "frontend/src/components/task-detail/SandboxAlertSection.tsx"
].map((path) => resolve(repoRoot, path));
const supervisionSources = supervisionFrontendFiles.map((file) =>
  readFileSync(file, "utf8")
);

test("REQ-T1-SUPERVISION-UI-009 frontend never imports engine modules", () => {
  for (const file of supervisionFrontendFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*engines\//);
  }
});

test("REQ-T1-SUPERVISION-UI-009 has no raw or generic rendering path", () => {
  for (const file of supervisionFrontendFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(source, /Object\.entries\([^)]*(payload|event|detail)/);
    assert.doesNotMatch(source, /\b(raw_content|model_content|tool_arguments)\b/);
  }
});

test("REQ-T1-SUPERVISION-UI-009 remains read-only and polling-only", () => {
  const source = supervisionSources.join("\n");
  assert.doesNotMatch(source, /\b(WebSocket|EventSource)\b/);
  assert.doesNotMatch(source, /\b(approve|resume|acknowledgeAlert)\b/);
  assert.doesNotMatch(source, /\b(pdf|csv|xlsx|zip)\b/i);
});

test("REQ-T1-SUPERVISION-UI-009 is registered in canonical gates", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const sharedPkg = JSON.parse(readFileSync(sharedPackagePath, "utf8"));
  assert.match(pkg.scripts["test:repo"], /track1-supervision-ui\.spec\.ts/);
  assert.match(pkg.scripts["test:shared"], /supervision-contract\.spec\.ts/);
  assert.match(pkg.scripts["test:backend"], /backend-supervision\.api\.spec\.ts/);
  assert.match(
    sharedPkg.scripts.test,
    /tests\/supervision-contract\.spec\.ts/
  );
});

test("REQ-T1-SUPERVISION-UI-009 declares stable responsive workbench tracks", () => {
  const css = readFileSync(
    resolve(repoRoot, "frontend/src/styles/app.css"),
    "utf8"
  );
  assert.match(
    css,
    /\.supervision-workbench\s*\{[^}]*grid-template-columns:/s
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.supervision-workbench\s*\{[^}]*grid-template-columns:\s*1fr/s
  );
});
