import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EXPECTED_TRACK1_ARTIFACT_PATHS
} from "../../scripts/track1/report/evidence-manifest.ts";
import {
  TRACK1_REPORT_SCREENSHOT_PATHS
} from "../../scripts/track1/report/markdown-report.ts";

const root = new URL("../../", import.meta.url);

function text(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("REQ-T1-DEMO-010 evidence and report images use exact tags plus immutable digests", () => {
  assert.match(
    text("deploy/track1/Dockerfile.evidence"),
    /^FROM mcr\.microsoft\.com\/playwright:v1\.60\.0-noble@sha256:[a-f0-9]{64}$/m
  );
  assert.match(
    text("deploy/track1/Dockerfile.report"),
    /^FROM pandoc\/latex:3\.10\.0\.0-ubuntu@sha256:[a-f0-9]{64}$/m
  );
  const packageJson = JSON.parse(text("package.json"));
  assert.equal(packageJson.devDependencies["playwright-core"], "1.60.0");
});

test("REQ-T1-DEMO-010 report source fixes 18 sections, five screenshots, and eight artifacts", () => {
  const template = text("docs/track1/security-risk-analysis-template.md");
  assert.equal(
    template.split("\n").filter((line) => /^## \d+\./.test(line)).length,
    18
  );
  assert.equal(TRACK1_REPORT_SCREENSHOT_PATHS.length, 5);
  assert.equal(new Set(TRACK1_REPORT_SCREENSHOT_PATHS).size, 5);
  assert.equal(EXPECTED_TRACK1_ARTIFACT_PATHS.length, 8);
  assert.equal(new Set(EXPECTED_TRACK1_ARTIFACT_PATHS).size, 8);
});

test("REQ-T1-DEMO-010 root scripts register report unit, fixture, and Docker gates", () => {
  const packageJson = JSON.parse(text("package.json"));
  for (const script of [
    "test:track1:report",
    "test:track1:report:docker",
    "track1:evidence:fixture",
    "report:track1"
  ]) {
    assert.equal(typeof packageJson.scripts[script], "string", script);
  }
  assert.match(packageJson.scripts["test:repo"], /track1-evidence-pack\.spec\.ts/);
});

test("REQ-T1-DEMO-010 evidence services expose no ports or model credentials", () => {
  const compose = text("deploy/track1/compose.track1.yml");
  for (const service of ["evidence-capture:", "report-builder:"]) {
    assert.match(compose, new RegExp(`^  ${service}`, "m"));
  }
  const tail = compose.slice(compose.indexOf("  evidence-capture:"));
  assert.doesNotMatch(tail, /OPENCLAW_MODEL_API_KEY/);
  assert.doesNotMatch(tail, /\n\s+ports:/);
});

test("REQ-T1-DEMO-010 fixture artifacts and accepted baseline remain untracked", () => {
  const ignore = text(".gitignore");
  assert.match(ignore, /^artifacts\/$/m);
  assert.throws(
    () =>
      readFileSync(
        new URL(
          "docs/track1/evidence/openclaw-baseline/security-risk-analysis.md",
          root
        )
      ),
    /ENOENT/
  );
});
