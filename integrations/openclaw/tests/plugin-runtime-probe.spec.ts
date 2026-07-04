import assert from "node:assert/strict";
import test from "node:test";

import {
  makeCompleteRuntimeProbePorts,
  makeProbePorts
} from "./fixtures/openclaw-plugin.fixture.ts";

// -- Step 1: capability probe RED -----------------------------------------

test("REQ-T1-DEMO-010 startup capability probe accepts only the complete native plugin", async () => {
  const { runTrack1PluginCapabilityProbe } = await import(
    "../src/runtime-probe.ts"
  );
  const result = await runTrack1PluginCapabilityProbe(
    makeCompleteRuntimeProbePorts()
  );
  assert.deepEqual(result, {
    schema_version: "track1-openclaw-probe.v1",
    plugin_id: "agent-security-track1",
    runtime_version: "2026.6.10",
    tool_names: ["call_api", "read_file", "send_email", "write_file"],
    hook_names: [
      "after_tool_call",
      "agent_end",
      "before_tool_call",
      "llm_input",
      "llm_output",
      "session_end",
      "session_start"
    ],
    before_tool_blocked: true,
    after_tool_observed: true,
    correlation_ready: true,
    diagnostics: []
  });
});

test("REQ-T1-DEMO-010 startup probe fails on every missing capability", async () => {
  const { runTrack1PluginCapabilityProbe } = await import(
    "../src/runtime-probe.ts"
  );
  const mutations = [
    "wrong-version",
    "missing-tool",
    "duplicate-tool",
    "missing-hook",
    "block-failed",
    "after-not-observed",
    "correlation-missing",
    "diagnostic-present"
  ] as const;

  for (const mutation of mutations) {
    await assert.rejects(
      () => runTrack1PluginCapabilityProbe(makeProbePorts(mutation)),
      /track1_plugin_probe_failed/
    );
  }
});

test("REQ-T1-DEMO-010 startup probe result rejects unknown keys", async () => {
  const { runTrack1PluginCapabilityProbe } = await import(
    "../src/runtime-probe.ts"
  );
  const result = await runTrack1PluginCapabilityProbe(
    makeCompleteRuntimeProbePorts()
  );
  const allowedKeys = new Set([
    "schema_version",
    "plugin_id",
    "runtime_version",
    "tool_names",
    "hook_names",
    "before_tool_blocked",
    "after_tool_observed",
    "correlation_ready",
    "diagnostics"
  ]);
  for (const key of Object.keys(result)) {
    assert.equal(
      allowedKeys.has(key),
      true,
      `unknown probe result key: ${key}`
    );
  }
});

test("REQ-T1-DEMO-010 startup probe runtime command is fixed", async () => {
  const { TRACK1_PLUGIN_PROBE_COMMAND } = await import(
    "../src/runtime-probe.ts"
  );
  assert.equal(
    TRACK1_PLUGIN_PROBE_COMMAND,
    "openclaw plugins inspect agent-security-track1 --runtime --json"
  );
});
