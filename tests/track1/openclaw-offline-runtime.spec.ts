import assert from "node:assert/strict";
import test from "node:test";

import {
  runTrack1OfflineRuntimeGate,
  Track1OfflineRuntimeGateError
} from "../../scripts/track1/offline-runtime-gate.ts";
import type { Track1OfflineRuntimePorts } from "../../scripts/track1/offline-runtime-gate.ts";
import { makeValidPluginProbeResult } from "./fixtures/openclaw-runner.fixture.ts";

function makeOfflineRuntimePorts(
  overrides: Partial<{
    version: string;
    pluginId: string;
    diagnostics: readonly unknown[];
    probeRuntimeVersion: string;
    probePluginId: string;
    agentInvocations: number;
  }> = {}
): Track1OfflineRuntimePorts & { calls: string[]; agentInvocations: number } {
  const calls: string[] = [];
  const state = { agentInvocations: overrides.agentInvocations ?? 0 };
  return {
    calls,
    get agentInvocations() {
      return state.agentInvocations;
    },
    async buildOpenClawImage() {
      calls.push("compose-build-openclaw");
    },
    async readOpenClawVersion() {
      calls.push("openclaw-version");
      return overrides.version ?? "2026.6.10";
    },
    async inspectPluginRuntime() {
      calls.push("plugin-runtime-inspect");
      return {
        plugin_id: overrides.pluginId ?? "agent-security-track1",
        diagnostics: overrides.diagnostics ?? []
      };
    },
    async runCapabilityProbe() {
      calls.push("plugin-capability-probe");
      const base = makeValidPluginProbeResult();
      return {
        ...base,
        runtime_version: (overrides.probeRuntimeVersion ??
          base.runtime_version) as "2026.6.10",
        plugin_id: (overrides.probePluginId ?? base.plugin_id) as "agent-security-track1"
      };
    }
  };
}

test("REQ-T1-DEMO-010 ordinary runtime gate inspects real plugin without model calls", async () => {
  const ports = makeOfflineRuntimePorts();
  const result = await runTrack1OfflineRuntimeGate(ports);

  assert.deepEqual(ports.calls, [
    "compose-build-openclaw",
    "openclaw-version",
    "plugin-runtime-inspect",
    "plugin-capability-probe"
  ]);
  assert.equal(ports.agentInvocations, 0);
  assert.equal(result.runtime_version, "2026.6.10");
  assert.equal(result.plugin_id, "agent-security-track1");
});

test("REQ-T1-DEMO-010 wrong OpenClaw version fails the gate", async () => {
  const ports = makeOfflineRuntimePorts({ version: "2025.1.1" });
  await assert.rejects(
    () => runTrack1OfflineRuntimeGate(ports),
    Track1OfflineRuntimeGateError
  );
});

test("REQ-T1-DEMO-010 a non-empty plugin diagnostic fails the gate", async () => {
  const ports = makeOfflineRuntimePorts({ diagnostics: [{ code: "warn" }] });
  await assert.rejects(
    () => runTrack1OfflineRuntimeGate(ports),
    Track1OfflineRuntimeGateError
  );
});

test("REQ-T1-DEMO-010 a wrong plugin id fails the gate", async () => {
  const ports = makeOfflineRuntimePorts({ pluginId: "wrong-plugin" });
  await assert.rejects(
    () => runTrack1OfflineRuntimeGate(ports),
    Track1OfflineRuntimeGateError
  );
});

test("REQ-T1-DEMO-010 a probe runtime version mismatch fails the gate", async () => {
  const ports = makeOfflineRuntimePorts({ probeRuntimeVersion: "9999.9.9" });
  await assert.rejects(
    () => runTrack1OfflineRuntimeGate(ports),
    Track1OfflineRuntimeGateError
  );
});

test("REQ-T1-DEMO-010 a probe plugin id mismatch fails the gate", async () => {
  const ports = makeOfflineRuntimePorts({ probePluginId: "wrong-plugin" });
  await assert.rejects(
    () => runTrack1OfflineRuntimeGate(ports),
    Track1OfflineRuntimeGateError
  );
});

test("REQ-T1-DEMO-010 the gate never invokes an agent", async () => {
  const ports = makeOfflineRuntimePorts();
  await runTrack1OfflineRuntimeGate(ports);
  assert.equal(ports.agentInvocations, 0);
});
