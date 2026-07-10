import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXPECTED_TRACK1_ARTIFACT_PATHS
} from "../../scripts/track1/report/evidence-manifest.ts";
import {
  TRACK1_REPORT_SCREENSHOT_PATHS
} from "../../scripts/track1/report/markdown-report.ts";

const root = new URL("../../", import.meta.url);
const BASELINE_ROOT = new URL(
  "docs/track1/evidence/openclaw-baseline/",
  root
);
const BASELINE_ALLOWLIST = [
  "security-risk-analysis.md",
  "security-risk-analysis.pdf",
  "manifest.json",
  "campaign.json",
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
] as const;

function text(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function listFiles(directory: string, prefix = ""): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push(relative.replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

test("REQ-T1-DEMO-010 accepted baseline is allowlisted and hash-consistent", () => {
  const ignore = text(".gitignore");
  assert.match(ignore, /^artifacts\/$/m);

  const rootPath = fileURLToPath(BASELINE_ROOT);
  const tracked = listFiles(rootPath);
  assert.deepEqual(
    tracked,
    [...BASELINE_ALLOWLIST].slice().sort()
  );

  for (const relative of BASELINE_ALLOWLIST) {
    const absolute = join(rootPath, ...relative.split("/"));
    const info = statSync(absolute);
    assert.equal(info.isFile(), true);
    assert.ok(info.size > 0, relative);
  }

  const manifestBytes = readFileSync(join(rootPath, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    schema_version: string;
    campaign_id: string;
    coverage: { agent_count: number; case_count: number };
    action_matrix: Array<{ passed: boolean }>;
    artifacts: Array<{
      path: string;
      byte_length: number;
      sha256: string;
    }>;
  };
  assert.equal(manifest.schema_version, "track1-evidence-manifest.v1");
  assert.equal(manifest.coverage.agent_count, 3);
  assert.equal(manifest.coverage.case_count, 9);
  assert.equal(manifest.action_matrix.length, 9);
  assert.equal(
    manifest.action_matrix.every((row) => row.passed === true),
    true
  );
  assert.equal(manifest.artifacts.length, EXPECTED_TRACK1_ARTIFACT_PATHS.length);

  for (let index = 0; index < EXPECTED_TRACK1_ARTIFACT_PATHS.length; index += 1) {
    const expectedPath = EXPECTED_TRACK1_ARTIFACT_PATHS[index];
    const entry = manifest.artifacts[index];
    assert.equal(entry.path, expectedPath);
    const bytes = readFileSync(join(rootPath, ...expectedPath.split("/")));
    assert.equal(entry.byte_length, bytes.byteLength);
    assert.equal(entry.sha256, sha256(bytes));
  }

  const markdown = text(
    "docs/track1/evidence/openclaw-baseline/security-risk-analysis.md"
  );
  assert.equal(
    markdown.split("\n").filter((line) => /^## \d+\./.test(line)).length,
    18
  );
  assert.match(markdown, /中文摘要/);
  assert.match(markdown, /English Abstract/);
  assert.doesNotMatch(
    markdown,
    /runtime_(?:prompt|output|credential|provider)_secret_|OPENCLAW_MODEL_API_KEY|TRACK1_INGEST_TOKEN/
  );
});
