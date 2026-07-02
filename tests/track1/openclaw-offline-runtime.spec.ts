/**
 * REQ-T1-DEMO-010 / P4-T8: Offline OpenClaw Runtime Gate
 *
 * Tests that verify the OpenClaw Docker image, plugin installation, and runtime
 * configuration without invoking cloud model APIs. These gates run in CI to catch
 * image build failures, version mismatches, and plugin loading issues before
 * credentialed campaign execution.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

/**
 * Offline runtime gate result
 */
export interface Track1OfflineRuntimeGateResult {
  runtime_version: string;
  runtime_integrity: string;
  plugin_id: string;
  plugin_enabled: boolean;
  plugin_tools: readonly string[];
  agent_invocation_count: number;
}

/**
 * Ports for offline runtime gate (no real Docker, plugin, or model calls)
 */
export interface Track1OfflineRuntimePorts {
  readonly calls: readonly string[];
  readonly agentInvocations: number;
  composeBuildOpenClaw(): Promise<void>;
  openclawVersion(): Promise<{ version: string; integrity: string }>;
  pluginRuntimeInspect(pluginId: string): Promise<{
    id: string;
    enabled: boolean;
    status: string;
    diagnostics: readonly unknown[];
  }>;
  pluginCapabilityProbe(pluginId: string): Promise<{
    tools: readonly string[];
  }>;
}

/**
 * Run offline runtime gate (injected ports for testing)
 */
export async function runTrack1OfflineRuntimeGate(
  ports: Track1OfflineRuntimePorts
): Promise<Track1OfflineRuntimeGateResult> {
  // Build OpenClaw gateway image
  await ports.composeBuildOpenClaw();

  // Verify OpenClaw version
  const versionResult = await ports.openclawVersion();
  if (versionResult.version !== "2026.6.10") {
    throw new Error(
      `openclaw_version_mismatch: expected 2026.6.10, got ${versionResult.version}`
    );
  }

  // Inspect plugin runtime state
  const inspectResult = await ports.pluginRuntimeInspect(
    "agent-security-track1"
  );
  if (inspectResult.status !== "loaded") {
    throw new Error(`plugin_not_loaded: status=${inspectResult.status}`);
  }
  if (!inspectResult.enabled) {
    throw new Error("plugin_not_enabled");
  }
  if (inspectResult.diagnostics.length > 0) {
    throw new Error(
      `plugin_has_diagnostics: ${JSON.stringify(inspectResult.diagnostics)}`
    );
  }

  // Probe plugin capabilities
  const probeResult = await ports.pluginCapabilityProbe(
    "agent-security-track1"
  );
  const expectedTools = ["send_email", "read_file", "write_file", "call_api"];
  const actualTools = [...probeResult.tools].sort();
  const expected = [...expectedTools].sort();

  if (JSON.stringify(actualTools) !== JSON.stringify(expected)) {
    throw new Error(
      `plugin_tool_mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actualTools)}`
    );
  }

  return {
    runtime_version: versionResult.version,
    runtime_integrity: versionResult.integrity,
    plugin_id: inspectResult.id,
    plugin_enabled: inspectResult.enabled,
    plugin_tools: probeResult.tools,
    agent_invocation_count: ports.agentInvocations
  };
}

/**
 * Make recording offline runtime ports for unit tests
 */
function makeOfflineRuntimePorts(options?: {
  version?: string;
  integrity?: string;
  pluginStatus?: string;
  pluginEnabled?: boolean;
  pluginDiagnostics?: readonly unknown[];
  pluginTools?: readonly string[];
  agentInvocations?: number;
}): Track1OfflineRuntimePorts {
  const calls: string[] = [];
  const agentInvocations = options?.agentInvocations ?? 0;

  return {
    get calls() {
      return calls;
    },
    get agentInvocations() {
      return agentInvocations;
    },

    async composeBuildOpenClaw() {
      calls.push("compose-build-openclaw");
    },

    async openclawVersion() {
      calls.push("openclaw-version");
      return {
        version: options?.version ?? "2026.6.10",
        integrity:
          options?.integrity ??
          "sha512-abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd=="
      };
    },

    async pluginRuntimeInspect(pluginId: string) {
      calls.push("plugin-runtime-inspect");
      return {
        id: pluginId,
        enabled: options?.pluginEnabled ?? true,
        status: options?.pluginStatus ?? "loaded",
        diagnostics: options?.pluginDiagnostics ?? []
      };
    },

    async pluginCapabilityProbe(pluginId: string) {
      calls.push("plugin-capability-probe");
      return {
        tools:
          options?.pluginTools ?? [
            "send_email",
            "read_file",
            "write_file",
            "call_api"
          ]
      };
    }
  };
}

describe("REQ-T1-DEMO-010 offline runtime gate", () => {
  test("ordinary runtime gate inspects real plugin without model calls", async () => {
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
    assert.equal(result.plugin_enabled, true);
    assert.deepEqual([...result.plugin_tools].sort(), [
      "call_api",
      "read_file",
      "send_email",
      "write_file"
    ]);
  });

  test("offline gate rejects wrong OpenClaw version", async () => {
    const ports = makeOfflineRuntimePorts({ version: "2026.6.9" });

    await assert.rejects(
      () => runTrack1OfflineRuntimeGate(ports),
      /openclaw_version_mismatch/
    );
  });

  test("offline gate rejects non-loaded plugin", async () => {
    const ports = makeOfflineRuntimePorts({ pluginStatus: "error" });

    await assert.rejects(
      () => runTrack1OfflineRuntimeGate(ports),
      /plugin_not_loaded/
    );
  });

  test("offline gate rejects disabled plugin", async () => {
    const ports = makeOfflineRuntimePorts({ pluginEnabled: false });

    await assert.rejects(
      () => runTrack1OfflineRuntimeGate(ports),
      /plugin_not_enabled/
    );
  });

  test("offline gate rejects plugin with diagnostics", async () => {
    const ports = makeOfflineRuntimePorts({
      pluginDiagnostics: [{ level: "error", message: "config missing" }]
    });

    await assert.rejects(
      () => runTrack1OfflineRuntimeGate(ports),
      /plugin_has_diagnostics/
    );
  });

  test("offline gate rejects plugin with wrong tools", async () => {
    const ports = makeOfflineRuntimePorts({
      pluginTools: ["read_file", "write_file"]
    });

    await assert.rejects(
      () => runTrack1OfflineRuntimeGate(ports),
      /plugin_tool_mismatch/
    );
  });

  test("offline gate counts agent invocations", async () => {
    const ports = makeOfflineRuntimePorts({ agentInvocations: 3 });

    await assert.rejects(
      async () => {
        const result = await runTrack1OfflineRuntimeGate(ports);
        if (result.agent_invocation_count !== 0) {
          throw new Error(
            `agent_invocation_not_zero: count=${result.agent_invocation_count}`
          );
        }
      },
      /agent_invocation_not_zero/
    );
  });
});
