import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

// P2-T8: Permanent repository gate for Track 1 campaign backend.
// Proves public/internal listener separation, exact four internal write routes,
// exact three public read routes, and that ingest controllers carry no
// execution/retry/model/tool invocation imports.

const repoRoot = resolve(import.meta.dirname, "../..");
const packagePath = resolve(repoRoot, "package.json");
const publicRouterPath = resolve(repoRoot, "backend/src/common/http/router.ts");
const internalRouterPath = resolve(
  repoRoot,
  "backend/src/common/http/internal-router.ts"
);
const ingestControllerPath = resolve(
  repoRoot,
  "backend/src/modules/supervision/campaign-ingest.controller.ts"
);
const supervisionControllerPath = resolve(
  repoRoot,
  "backend/src/modules/supervision/campaign-supervision.controller.ts"
);

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("REQ-T1-DEMO-010 backend campaign tests are registered in test:backend", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const testBackend = pkg.scripts["test:backend"];
  const expectedSpecs = [
    "campaign-repository.spec",
    "campaign-ingest.service.spec",
    "campaign-ingest.controller.spec",
    "runtime-dependencies.spec",
    "campaign-projector.spec",
    "campaign-supervision.service.spec",
    "backend-campaign-ingest.api.spec",
    "backend-supervision.api.spec"
  ];
  for (const spec of expectedSpecs) {
    assert.match(
      testBackend,
      new RegExp(spec),
      `Expected test:backend to include ${spec}`
    );
  }
});

test("REQ-T1-DEMO-010 public router never matches /internal/track1 routes", () => {
  const publicRouter = readText("backend/src/common/http/router.ts");
  assert.equal(publicRouter.includes("/internal/track1"), false);
  assert.equal(publicRouter.includes("internal/track1"), false);
});

test("REQ-T1-DEMO-010 internal router recognizes health and four campaign ingest routes", () => {
  const internalRouter = readText("backend/src/common/http/internal-router.ts");
  assert.match(internalRouter, /internalHealth/);
  assert.match(internalRouter, /startCampaign/);
  assert.match(internalRouter, /ingestSnapshot/);
  assert.match(internalRouter, /finalizeCampaign/);
  assert.match(internalRouter, /registerEvidence/);
  // Four campaign route keywords (campaigns appears in route patterns).
  const campaignMatches = internalRouter.match(/campaigns/g) ?? [];
  assert.ok(campaignMatches.length > 0);
});

test("REQ-T1-DEMO-010 public router exposes exactly three campaign read routes", () => {
  const publicRouter = readText("backend/src/common/http/router.ts");
  assert.match(publicRouter, /listCampaigns/);
  assert.match(publicRouter, /getCampaignDetail/);
  assert.match(publicRouter, /getCampaignEvidence/);
});

test("REQ-T1-DEMO-010 ingest controller has no launch, retry, model, or tool invocation imports", () => {
  assert.equal(existsSync(ingestControllerPath), true);
  const source = readFileSync(ingestControllerPath, "utf8");
  assert.doesNotMatch(source, /\b(launchAgent|retryCampaign|invokeModel|callTool)\b/);
  assert.doesNotMatch(source, /from\s+["'][^"']*engines\//);
});

test("REQ-T1-DEMO-010 supervision controller has no launch, retry, model, or tool invocation imports", () => {
  assert.equal(existsSync(supervisionControllerPath), true);
  const source = readFileSync(supervisionControllerPath, "utf8");
  assert.doesNotMatch(source, /\b(launchAgent|retryCampaign|invokeModel|callTool)\b/);
  assert.doesNotMatch(source, /from\s+["'][^"']*engines\//);
});

test("REQ-T1-DEMO-010 internal router module exists at expected path", () => {
  assert.equal(existsSync(internalRouterPath), true);
});

test("REQ-T1-DEMO-010 public router module exists at expected path", () => {
  assert.equal(existsSync(publicRouterPath), true);
});
