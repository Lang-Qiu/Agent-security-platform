import assert from "node:assert/strict";
import test from "node:test";

import {
  makeCampaignSnapshotEnvelope,
  makeCompleteInspectOutput,
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

test("REQ-T1-DEMO-010 startup probe requires the requested plugin to be loaded", async () => {
  const { runTrack1PluginCapabilityProbe } = await import(
    "../src/runtime-probe.ts"
  );

  for (const mutation of [
    { id: "different-plugin" },
    { status: "disabled" }
  ]) {
    const input = makeCompleteRuntimeProbePorts();
    Object.assign(input.inspect, mutation);
    await assert.rejects(
      () => runTrack1PluginCapabilityProbe(input),
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
  const {
    TRACK1_PLUGIN_PROBE_COMMAND,
    TRACK1_PLUGIN_PROBE_EXECUTABLE
  } = await import(
    "../src/runtime-probe.ts"
  );
  assert.equal(
    TRACK1_PLUGIN_PROBE_COMMAND,
    "openclaw plugins inspect agent-security-track1 --runtime --json"
  );
  assert.equal(
    TRACK1_PLUGIN_PROBE_EXECUTABLE,
    process.platform === "win32" ? "openclaw.cmd" : "openclaw"
  );
});

test("REQ-T1-DEMO-010 default probe ports return a contract-valid correlated ack", async () => {
  const module = await import("../src/runtime-probe.ts");
  assert.equal(typeof module.createTrack1ProbePorts, "function");

  const created = module.createTrack1ProbePorts(
    makeCompleteInspectOutput(),
    () => "2026-06-30T00:00:04.000Z"
  );
  const envelope = makeCampaignSnapshotEnvelope();
  const ack = await created.ports.ingestSnapshot(envelope);

  assert.deepEqual(ack, {
    schema_version: "track1-campaign-snapshot-ack.v1",
    campaign_id: envelope.campaign_id,
    attempt_id: envelope.attempt_id,
    sequence: envelope.sequence,
    snapshot_sha256: envelope.snapshot_sha256,
    accepted_at: "2026-06-30T00:00:04.000Z"
  });

  const result = await module.runTrack1PluginCapabilityProbe(created);
  assert.equal(result.schema_version, "track1-openclaw-probe.v1");
});

test("REQ-T1-DEMO-010 real OpenClaw inspect JSON is normalized from runtime fields", async () => {
  const module = await import("../src/runtime-probe.ts");
  assert.equal(typeof module.normalizeOpenclawPluginInspectOutput, "function");

  const normalized = module.normalizeOpenclawPluginInspectOutput(
    {
      plugin: {
        id: "agent-security-track1",
        name: "Agent Security Track 1",
        status: "loaded",
        toolNames: ["send_email", "read_file", "write_file", "call_api"]
      },
      typedHooks: [
        { name: "after_tool_call" },
        { name: "before_tool_call", priority: 100 },
        { name: "llm_input" },
        { name: "llm_output" },
        { name: "session_end" },
        { name: "session_start" }
      ],
      tools: [
        { names: ["send_email"] },
        { names: ["read_file"] },
        { names: ["write_file"] },
        { names: ["call_api"] }
      ],
      diagnostics: []
    },
    "OpenClaw 2026.6.10 (aa69b12)"
  );

  assert.deepEqual(normalized, {
    id: "agent-security-track1",
    name: "Agent Security Track 1",
    status: "loaded",
    runtime_version: "2026.6.10",
    tools: [
      { name: "send_email" },
      { name: "read_file" },
      { name: "write_file" },
      { name: "call_api" }
    ],
    hooks: [
      "after_tool_call",
      "before_tool_call",
      "llm_input",
      "llm_output",
      "session_end",
      "session_start"
    ],
    diagnostics: []
  });
});
