import type { Track1PreflightPorts } from "../../../scripts/track1/preflight.ts";
import type { Track1PluginProbeResult } from "../../../integrations/openclaw/src/runtime-probe.ts";

// -- P4-T1: environment + preflight fixtures --------------------------------

export function makeValidTrack1Environment(): Record<string, string> {
  return {
    OPENCLAW_MODEL_BASE_URL: "https://model.example.test/v1",
    OPENCLAW_MODEL_API_KEY: "API_KEY_SENTINEL_abcdef0123456789",
    OPENCLAW_MODEL_ID: "provider/model-safe",
    TRACK1_INGEST_TOKEN: "0123456789abcdef0123456789abcdef"
  };
}

const DEFAULT_PROBE_RESULT: Track1PluginProbeResult = Object.freeze({
  schema_version: "track1-openclaw-probe.v1",
  plugin_id: "agent-security-track1",
  runtime_version: "2026.6.10",
  tool_names: Object.freeze(["call_api", "read_file", "send_email", "write_file"]),
  hook_names: Object.freeze([
    "after_tool_call",
    "before_tool_call",
    "llm_input",
    "llm_output",
    "session_end",
    "session_start"
  ]),
  before_tool_blocked: true,
  after_tool_observed: true,
  correlation_ready: true,
  diagnostics: Object.freeze([])
}) as Track1PluginProbeResult;

export interface CampaignPreflightPortsOptions {
  dockerFails?: boolean;
  composeV2?: boolean;
  openclawFails?: boolean;
  openclawVersion?: string;
  pluginProbeFails?: boolean;
  pluginDiagnostics?: readonly unknown[];
  backendFails?: boolean;
  publicReady?: boolean;
  internalReady?: boolean;
  manifestFails?: boolean;
}

export function makeCampaignPreflightPorts(
  options?: CampaignPreflightPortsOptions
): Track1PreflightPorts & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async inspectDocker() {
      calls.push("docker");
      if (options?.dockerFails) {
        throw new Error("docker_unavailable");
      }
      return { compose_v2: options?.composeV2 ?? true };
    },
    async inspectOpenClaw() {
      calls.push("openclaw");
      if (options?.openclawFails) {
        throw new Error("openclaw_unavailable");
      }
      return {
        version: options?.openclawVersion ?? "2026.6.10",
        integrity: "sha512-test-only-integrity-value"
      };
    },
    async probePlugin() {
      calls.push("plugin");
      if (options?.pluginProbeFails) {
        throw new Error("plugin_probe_failed");
      }
      return {
        ...DEFAULT_PROBE_RESULT,
        diagnostics: options?.pluginDiagnostics ?? DEFAULT_PROBE_RESULT.diagnostics
      } as Track1PluginProbeResult;
    },
    async checkBackend() {
      calls.push("backend");
      if (options?.backendFails) {
        throw new Error("backend_unavailable");
      }
      return {
        public_ready: options?.publicReady ?? true,
        internal_ready: options?.internalReady ?? true
      };
    },
    async loadManifest() {
      calls.push("manifest");
      if (options?.manifestFails) {
        throw new Error("manifest_unavailable");
      }
      return { schema_version: "track1-openclaw-campaign.v1" };
    }
  };
}
