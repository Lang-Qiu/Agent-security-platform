/**
 * REQ-T1-DEMO-010: Track 1 npm script registration tests
 *
 * Verifies that Track 1 OpenClaw runner scripts are properly registered in
 * package.json and included in the test:all target.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("REQ-T1-DEMO-010 demo:track1:openclaw script exists and points to fixed entrypoint", async () => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf-8")
  ) as { scripts: Record<string, string> };

  assert.ok(
    packageJson.scripts["demo:track1:openclaw"],
    "demo:track1:openclaw script must exist"
  );
  assert.match(
    packageJson.scripts["demo:track1:openclaw"],
    /scripts\/track1\/run-openclaw-campaign\.ts/,
    "demo script must point to fixed entrypoint"
  );
});

test("REQ-T1-DEMO-010 test:track1:openclaw:unit includes all Track 1 test specs", async () => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf-8")
  ) as { scripts: Record<string, string> };

  const script = packageJson.scripts["test:track1:openclaw:unit"];
  assert.ok(script, "test:track1:openclaw:unit script must exist");

  const requiredSpecs = [
    "openclaw-preflight.spec.ts",
    "case-prompt.spec.ts",
    "openclaw-command.spec.ts",
    "openclaw-campaign-runner.spec.ts",
    "openclaw-offline-runtime.spec.ts"
  ];

  for (const spec of requiredSpecs) {
    assert.ok(
      script.includes(spec),
      `test:track1:openclaw:unit must include ${spec}`
    );
  }
});

test("REQ-T1-DEMO-010 test:track1:openclaw runs integration and unit tests", async () => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf-8")
  ) as { scripts: Record<string, string> };

  const script = packageJson.scripts["test:track1:openclaw"];
  assert.ok(script, "test:track1:openclaw script must exist");
  assert.match(
    script,
    /test:integration:openclaw/,
    "must run Phase 3 integration tests"
  );
  assert.match(
    script,
    /test:track1:openclaw:unit/,
    "must run Track 1 unit tests"
  );
});

test("REQ-T1-DEMO-010 test:all includes Track 1 unit tests", async () => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf-8")
  ) as { scripts: Record<string, string> };

  const script = packageJson.scripts["test:all"];
  assert.ok(script, "test:all script must exist");
  assert.match(
    script,
    /test:track1:openclaw:unit/,
    "test:all must include Track 1 unit tests"
  );
});

test("REQ-T1-DEMO-010 test:repo includes Track 1 runtime config tests", async () => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf-8")
  ) as { scripts: Record<string, string> };

  const script = packageJson.scripts["test:repo"];
  assert.ok(script, "test:repo script must exist");
  assert.match(
    script,
    /track1-openclaw-runtime-config\.spec\.ts/,
    "test:repo must include runtime config tests"
  );
});
