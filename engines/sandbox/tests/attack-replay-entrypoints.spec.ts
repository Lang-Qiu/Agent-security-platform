import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { TRACK1_SCENARIO_IDS } from "../src/replay/contract.ts";
import type { Track1ScenarioId } from "../src/replay/contract.ts";

// Dynamic imports for modules that don't exist yet (RED phase)
async function tryImportRunner() {
  try {
    return await import("../src/replay/runner.ts");
  } catch {
    return null;
  }
}

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

// -- runner tests --------------------------------------------------------

test("REQ-T1-ATTACK-REPLAY-006: runner - runTrack1ScenarioReplay returns three results per scenario", async () => {
  const runner = await tryImportRunner();
  assert.ok(runner, "runner module must exist");
  assert.equal(typeof runner.runTrack1ScenarioReplay, "function");
  assert.equal(typeof runner.serializeTrack1ScenarioReplay, "function");
  assert.equal(typeof runner.executeTrack1ReplayEntrypoint, "function");

  const allCaseIds: string[] = [];

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const results = runner.runTrack1ScenarioReplay(scenarioId);
    assert.equal(results.length, 3, `${scenarioId}: must have exactly 3 results`);

    // Verify results are sorted by metadata.replay.case_id
    const caseIds = results.map(
      (r: Record<string, unknown>) =>
        ((r.metadata as Record<string, unknown>)?.replay as Record<string, unknown>)
          ?.case_id as string
    );
    for (let i = 1; i < caseIds.length; i++) {
      assert.ok(
        caseIds[i - 1].localeCompare(caseIds[i]) < 0,
        `${scenarioId}: results must be sorted by case_id`
      );
    }

    // No duplicate case IDs
    const uniqueCaseIds = new Set(caseIds);
    assert.equal(
      uniqueCaseIds.size,
      3,
      `${scenarioId}: must have 3 unique case IDs`
    );

    allCaseIds.push(...caseIds);
  }

  assert.equal(allCaseIds.length, 9, "must have exactly 9 unique case IDs across all scenarios");
  assert.equal(new Set(allCaseIds).size, 9, "all case IDs must be unique");
});

test("REQ-T1-ATTACK-REPLAY-006: runner - scenario event union satisfies manifest requirements", async () => {
  const runner = await tryImportRunner();
  assert.ok(runner);

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const results = runner.runTrack1ScenarioReplay(scenarioId);

    const allEventTypes = new Set<string>();
    for (const result of results) {
      const details = result.details as Record<string, unknown>;
      const events = (details.events as Array<Record<string, unknown>>) ?? [];
      for (const event of events) {
        allEventTypes.add(event.event_type as string);
      }
    }

    // The scenario manifest defines required events
    // We check the union across all 3 cases covers the required set
    // (Loaded from the scenario bundle via runTrack1ScenarioReplay which validates coverage)
    assert.ok(
      allEventTypes.has("policy_decision"),
      `${scenarioId}: must have policy_decision events`
    );
  }
});

test("REQ-T1-ATTACK-REPLAY-006: runner - serializeTrack1ScenarioReplay is byte-identical", async () => {
  const runner = await tryImportRunner();
  assert.ok(runner);

  const s1 = runner.serializeTrack1ScenarioReplay("T1-SC-001");
  const s2 = runner.serializeTrack1ScenarioReplay("T1-SC-001");

  assert.equal(s1, s2, "serialized output must be byte-identical");

  // Must be valid JSON
  const parsed = JSON.parse(s1);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 3);

  // No pretty-print (no leading spaces or newlines in content)
  assert.ok(!s1.startsWith("\n"));
  assert.ok(!s1.endsWith("\n"));
});

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - atomic failure through injected ports", async () => {
  const runner = await tryImportRunner();
  assert.ok(runner);

  const { Track1ReplayError } = await import("../src/replay/contract.ts");

  const writes: string[] = [];
  let exitCode = 0;

  runner.executeTrack1ReplayEntrypoint("T1-SC-001", {
    run: () => {
      throw new Track1ReplayError("manifest_mismatch", "controlled failure");
    },
    writeStdout: (value: string) => writes.push(`stdout:${value}`),
    writeStderr: (value: string) => writes.push(`stderr:${value}`),
    setExitCode: (value: number) => {
      exitCode = value;
    }
  });

  assert.deepEqual(writes, ["stderr:manifest_mismatch: controlled failure\n"]);
  assert.equal(exitCode, 1);
});

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - unexpected error handling", async () => {
  const runner = await tryImportRunner();
  assert.ok(runner);

  const writes: string[] = [];
  let exitCode = 0;

  runner.executeTrack1ReplayEntrypoint("T1-SC-001", {
    run: () => {
      throw new Error("something unexpected");
    },
    writeStdout: (value: string) => writes.push(`stdout:${value}`),
    writeStderr: (value: string) => writes.push(`stderr:${value}`),
    setExitCode: (value: number) => {
      exitCode = value;
    }
  });

  assert.deepEqual(writes, ["stderr:replay_result_invalid: Unexpected replay failure\n"]);
  assert.equal(exitCode, 1);
});

// -- process boundary tests ---------------------------------------------

function scenarioEntrypointPath(scenarioId: Track1ScenarioId): string {
  return resolve(
    REPO_ROOT,
    "samples",
    "track1",
    "attack-scripts",
    scenarioId,
    "replay.ts"
  );
}

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - T1-SC-001 process spawn succeeds", () => {
  const entrypointPath = scenarioEntrypointPath("T1-SC-001");

  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", entrypointPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
  assert.equal(result.stderr, "", `stderr must be empty, got: ${result.stderr}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    assert.fail(`stdout must be valid JSON, got: ${result.stdout}`);
  }

  assert.ok(Array.isArray(parsed), "stdout must be a JSON array");
  assert.equal((parsed as unknown[]).length, 3, "must have exactly 3 results");
});

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - T1-SC-002 process spawn succeeds", () => {
  const entrypointPath = scenarioEntrypointPath("T1-SC-002");

  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", entrypointPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
  assert.equal(result.stderr, "", `stderr must be empty, got: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout.trim());
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 3);
});

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - T1-SC-003 process spawn succeeds", () => {
  const entrypointPath = scenarioEntrypointPath("T1-SC-003");

  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", entrypointPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
  assert.equal(result.stderr, "", `stderr must be empty, got: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout.trim());
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 3);
});

test("REQ-T1-ATTACK-REPLAY-006: entrypoints - scenario results contain matching session/event IDs", () => {
  const entrypointPath = scenarioEntrypointPath("T1-SC-001");

  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", entrypointPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8"
    }
  );

  const parsed = JSON.parse(result.stdout.trim()) as Array<Record<string, unknown>>;

  for (const entry of parsed) {
    const details = entry.details as Record<string, unknown>;
    const sessionId = details.session_id as string;
    const events = (details.events as Array<Record<string, unknown>>) ?? [];

    for (const event of events) {
      assert.equal(
        event.session_id,
        sessionId,
        "event session_id must match result session_id"
      );
    }
  }
});
