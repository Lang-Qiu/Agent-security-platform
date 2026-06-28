import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import {
  executeTrack1MonitorDemo,
  runAllTrack1MonitorCases,
  Track1MonitorError
} from "../src/monitoring/index.ts";
import type {
  Track1MonitorDemoPorts
} from "../src/monitoring/index.ts";
import { normalizeBaseResult } from "../../../shared/contracts/result.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";

const DEMO_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "samples",
  "track1",
  "monitor-plugin",
  "demo.ts"
);

// -- Step 1: Process and port-boundary RED tests ---------------------------

test("executeTrack1MonitorDemo and Track1MonitorDemoPorts are exported", () => {
  assert.equal(typeof executeTrack1MonitorDemo, "function");
});

test("demo spawn: exit code 0, stdout JSON array of 9, empty stderr", async () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", DEMO_PATH],
    { encoding: "utf8", timeout: 30000 }
  );

  assert.equal(result.status, 0, `exit code should be 0, got ${result.status}`);
  // Filter out Node.js experimental warnings from stderr
  const meaningfulStderr = result.stderr
    .split("\n")
    .filter((line) => !line.includes("ExperimentalWarning") && !line.includes("trace-warnings"))
    .join("\n")
    .trim();
  assert.equal(meaningfulStderr, "", `stderr should have no meaningful errors, got: ${meaningfulStderr}`);

  const parsed = JSON.parse(result.stdout);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed.length, 9);

  // Every result passes normalizeBaseResult
  for (const item of parsed) {
    assert.ok(normalizeBaseResult(item));
  }

  // Case IDs are unique
  const caseIds = parsed.map((r: BaseResult<SandboxRunResultDetails>) =>
    (r.details as SandboxRunResultDetails).events?.[0]?.case_id
  );
  const uniqueIds = new Set(caseIds.filter(Boolean));
  assert.equal(uniqueIds.size, 9);
});

test("demo stdout is byte-identical across two spawns", async () => {
  const a = spawnSync(
    process.execPath,
    ["--experimental-strip-types", DEMO_PATH],
    { encoding: "utf8", timeout: 30000 }
  );
  const b = spawnSync(
    process.execPath,
    ["--experimental-strip-types", DEMO_PATH],
    { encoding: "utf8", timeout: 30000 }
  );

  assert.equal(a.stdout, b.stdout);
});

// -- Injected ports test ---------------------------------------------------

test("executeTrack1MonitorDemo with injected ports writes results", async () => {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const ports: Track1MonitorDemoPorts = {
    async run() {
      return await runAllTrack1MonitorCases();
    },
    writeStdout(value: string) { stdout += value; },
    writeStderr(value: string) { stderr += value; },
    setExitCode(value: number) { exitCode = value; }
  };

  await executeTrack1MonitorDemo(ports);

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.length, 9);
  for (const item of parsed) {
    assert.ok(normalizeBaseResult(item));
  }
});

// -- Failure test ----------------------------------------------------------

test("executeTrack1MonitorDemo failure: safe stderr, exit 1, no stdout", async () => {
  const sentinel = "UNIQUE_DEMO_FAILURE_SENTINEL_999";
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const ports: Track1MonitorDemoPorts = {
    async run() {
      throw new Error(sentinel);
    },
    writeStdout(value: string) { stdout += value; },
    writeStderr(value: string) { stderr += value; },
    setExitCode(value: number) { exitCode = value; }
  };

  await executeTrack1MonitorDemo(ports);

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.ok(!stderr.includes(sentinel));
  assert.equal(stderr, "monitor_result_invalid: Unexpected monitor demo failure\n");
});

test("executeTrack1MonitorDemo Track1MonitorError: safe stderr, exit 1", async () => {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const ports: Track1MonitorDemoPorts = {
    async run() {
      throw new Track1MonitorError("monitor_session_empty");
    },
    writeStdout(value: string) { stdout += value; },
    writeStderr(value: string) { stderr += value; },
    setExitCode(value: number) { exitCode = value; }
  };

  await executeTrack1MonitorDemo(ports);

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.equal(stderr, "monitor_session_empty: Monitor session has no model call\n");
});
