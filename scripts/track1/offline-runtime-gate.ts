// P4-T8: ordinary offline runtime gate. Builds the pinned OpenClaw image,
// verifies its exact version, inspects the real plugin runtime, and runs the
// dynamic capability probe — without ever invoking a cloud model or an
// agent. Used by `npm run test:track1:openclaw` and CI.

import type { Track1PluginProbeResult } from "../../integrations/openclaw/src/runtime-probe.ts";

export class Track1OfflineRuntimeGateError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1OfflineRuntimeGateError";
    this.code = code;
  }
}

function fail(): never {
  throw new Track1OfflineRuntimeGateError("track1_offline_runtime_gate_failed");
}

export interface Track1OfflineRuntimePorts {
  buildOpenClawImage(): Promise<void>;
  readOpenClawVersion(): Promise<string>;
  inspectPluginRuntime(): Promise<{
    plugin_id: string;
    diagnostics: readonly unknown[];
  }>;
  runCapabilityProbe(): Promise<Track1PluginProbeResult>;
}

export interface Track1OfflineRuntimeGateResult {
  runtime_version: "2026.6.10";
  plugin_id: "agent-security-track1";
}

const EXPECTED_VERSION = "2026.6.10";
const EXPECTED_PLUGIN_ID = "agent-security-track1";

export async function runTrack1OfflineRuntimeGate(
  ports: Track1OfflineRuntimePorts
): Promise<Track1OfflineRuntimeGateResult> {
  await ports.buildOpenClawImage();

  const version = await ports.readOpenClawVersion();
  if (version !== EXPECTED_VERSION) fail();

  const inspected = await ports.inspectPluginRuntime();
  if (inspected.plugin_id !== EXPECTED_PLUGIN_ID) fail();
  if (inspected.diagnostics.length > 0) fail();

  const probeResult = await ports.runCapabilityProbe();
  if (probeResult.plugin_id !== EXPECTED_PLUGIN_ID) fail();
  if (probeResult.runtime_version !== EXPECTED_VERSION) fail();

  return Object.freeze({
    runtime_version: EXPECTED_VERSION,
    plugin_id: EXPECTED_PLUGIN_ID
  });
}
