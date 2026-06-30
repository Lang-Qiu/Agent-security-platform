import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_CASE_STATUSES,
  TRACK1_CAMPAIGN_STATUSES,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  TRACK1_SNAPSHOT_MAX_BYTES,
  TRACK1_LIFECYCLE_MAX_BYTES,
  TRACK1_OPENCLAW_VERSION
} from "../../shared/index.ts";

function readRootPackageJson() {
  return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
}

test("root quality gate delegates to test:all and includes frontend coverage", () => {
  const packageJson = readRootPackageJson();
  const scripts = packageJson.scripts ?? {};

  assert.equal(
    scripts.test,
    "npm run test:all",
    "root test should delegate to the full-stack quality gate"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:frontend\b/,
    "test:all should include frontend coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:backend\b/,
    "test:all should include backend coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:shared\b/,
    "test:all should include shared contract coverage"
  );
  assert.match(
    scripts["test:all"] ?? "",
    /\bnpm run test:engine:sandbox\b/,
    "test:all should include sandbox engine coverage"
  );
  assert.match(
    scripts["test:engine:sandbox"] ?? "",
    /\bengines\/sandbox\/tests\/simulated-tool-contract\.spec\.ts\b/,
    "sandbox engine gate should include simulated-tool contract coverage"
  );
  assert.match(
    scripts["test:engine:sandbox"] ?? "",
    /\bengines\/sandbox\/tests\/simulated-tool-executor\.spec\.ts\b/,
    "sandbox engine gate should include simulated-tool execution coverage"
  );

  for (const replayTest of [
    "engines/sandbox/tests/attack-replay-loader.spec.ts",
    "engines/sandbox/tests/attack-replay-compiler.spec.ts",
    "engines/sandbox/tests/attack-replay-entrypoints.spec.ts"
  ]) {
    assert.ok(
      scripts["test:engine:sandbox"]?.includes(replayTest),
      `sandbox gate should include ${replayTest}`
    );
  }

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-attack-replay.spec.ts"),
    "repository gate should include Track 1 attack replay coverage"
  );

  for (const monitorTest of [
    "engines/sandbox/tests/attack-monitor-contract.spec.ts",
    "engines/sandbox/tests/attack-monitor-session.spec.ts",
    "engines/sandbox/tests/attack-monitor-replay-adapter.spec.ts",
    "engines/sandbox/tests/attack-monitor-demo.spec.ts"
  ]) {
    assert.ok(
      scripts["test:engine:sandbox"]?.includes(monitorTest),
      `sandbox gate should include ${monitorTest}`
    );
  }

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-monitor-plugin.spec.ts"),
    "repository gate should include Track 1 monitor coverage"
  );

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-base-filter.spec.ts"),
    "repository gate should include Track 1 base filter coverage"
  );

  for (const baseFilterTest of [
    "engines/sandbox/tests/base-filter-contract.spec.ts",
    "engines/sandbox/tests/base-filter-evaluator.spec.ts",
    "engines/sandbox/tests/base-filter-provider.spec.ts",
    "engines/sandbox/tests/base-filter-evaluation.spec.ts"
  ]) {
    assert.ok(
      scripts["test:engine:sandbox"]?.includes(baseFilterTest),
      `sandbox gate should include ${baseFilterTest}`
    );
  }

  assert.match(
    scripts["test:repo"] ?? "",
    /\btests\/repository\/fofa-portscan-workflow\.spec\.ts\b/,
    "test:repo should include naabu+nmap workflow repository coverage"
  );

  assert.match(
    scripts["test:shared"] ?? "",
    /\bshared\/tests\/sandbox-contract\.spec\.ts\b/,
    "test:shared should include sandbox supervision contract coverage"
  );

  assert.match(
    scripts["test:shared"] ?? "",
    /\bshared\/tests\/supervision-contract\.spec\.ts\b/,
    "test:shared should include supervision contract coverage"
  );

  assert.match(
    scripts["test:shared"] ?? "",
    /\bshared\/tests\/campaign-supervision-contract\.spec\.ts\b/,
    "test:shared should include Track 1 campaign supervision contract coverage"
  );

  assert.match(
    scripts["test:shared"] ?? "",
    /\bshared\/tests\/campaign-ingest-contract\.spec\.ts\b/,
    "test:shared should include Track 1 campaign ingest contract coverage"
  );

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-openclaw-manifest.spec.ts"),
    "repository gate should include Track 1 OpenClaw manifest coverage"
  );

  assert.ok(
    scripts["test:repo"]?.includes("tests/repository/track1-supervision-ui.spec.ts"),
    "repository gate should include Track 1 supervision UI coverage"
  );

  assert.match(
    scripts["test:backend"] ?? "",
    /\btests\/integration\/backend-supervision\.api\.spec\.ts\b/,
    "test:backend should include supervision API integration coverage"
  );

  const sharedPackageJson = JSON.parse(
    readFileSync(new URL("../../shared/package.json", import.meta.url), "utf8")
  ) as { scripts?: Record<string, string> };

  assert.match(
    sharedPackageJson.scripts?.test ?? "",
    /\btests\/sandbox-contract\.spec\.ts\b/,
    "the shared package test should include sandbox supervision contract coverage"
  );

  assert.match(
    sharedPackageJson.scripts?.test ?? "",
    /\btests\/supervision-contract\.spec\.ts\b/,
    "the shared package test should include supervision contract coverage"
  );

  assert.match(
    sharedPackageJson.scripts?.test ?? "",
    /\btests\/campaign-supervision-contract\.spec\.ts\b/,
    "the shared package test should include Track 1 campaign supervision contract coverage"
  );

  assert.match(
    sharedPackageJson.scripts?.test ?? "",
    /\btests\/campaign-ingest-contract\.spec\.ts\b/,
    "the shared package test should include Track 1 campaign ingest contract coverage"
  );
});

test("shared package exports all Track 1 runtime constants", () => {
  assert.deepEqual([...TRACK1_CAMPAIGN_AGENT_IDS], [
    "agent:track1:prompt-injection",
    "agent:track1:tool-hijack",
    "agent:track1:memory-poison"
  ]);
  assert.deepEqual([...TRACK1_SCENARIO_IDS], ["T1-SC-001", "T1-SC-002", "T1-SC-003"]);
  assert.deepEqual([...TRACK1_CASE_IDS], [
    "T1-SC-001-C001", "T1-SC-001-C002", "T1-SC-001-C003",
    "T1-SC-002-C001", "T1-SC-002-C002", "T1-SC-002-C003",
    "T1-SC-003-C001", "T1-SC-003-C002", "T1-SC-003-C003"
  ]);
  assert.deepEqual([...TRACK1_CAMPAIGN_STATUSES], [
    "created", "validating", "running", "collecting", "completed", "failed"
  ]);
  assert.deepEqual([...TRACK1_CAMPAIGN_CASE_STATUSES], ["running", "passed", "failed"]);
  assert.equal(TRACK1_OPENCLAW_VERSION, "2026.6.10");
  assert.equal(TRACK1_SNAPSHOT_MAX_BYTES, 2 * 1024 * 1024);
  assert.equal(TRACK1_LIFECYCLE_MAX_BYTES, 256 * 1024);
});
