// P4-T1..T5: shared fresh-factory fixtures for the Track 1 runner test suite.
// Every factory returns a fresh, mutation-safe object graph.

import { readFileSync } from "node:fs";
import {
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY
} from "../../../shared/types/campaign-ingest.ts";
import type { Track1PreflightPorts } from "../../../scripts/track1/preflight.ts";
import type { Track1PluginProbeResult } from "../../../integrations/openclaw/src/runtime-probe.ts";

const VALID_ENVIRONMENT = Object.freeze({
  OPENCLAW_MODEL_BASE_URL: "https://model.example.test/v1",
  OPENCLAW_MODEL_ID: "provider/model-safe",
  OPENCLAW_MODEL_API_KEY: "test-only-key-0123456789",
  TRACK1_INGEST_TOKEN: "0123456789abcdef0123456789abcdef"
});

export function makeValidTrack1Environment(): Record<string, string> {
  return { ...VALID_ENVIRONMENT };
}

export function makeValidPluginProbeResult(): Track1PluginProbeResult {
  return Object.freeze({
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
}

// Read the real committed manifest bytes rather than re-encoding a literal,
// so the fixture's SHA-256 always matches TRACK1_CAMPAIGN_MANIFEST_SHA256
// even if the manifest file's exact byte formatting changes.
const CANONICAL_MANIFEST_BYTES = readFileSync(
  new URL(
    "../../../samples/track1/openclaw/campaign.v1.json",
    import.meta.url
  )
);

export interface Track1CampaignPreflightPortsOptions {
  pluginProbeFails?: boolean;
  dockerFails?: boolean;
  openclawVersionMismatch?: boolean;
  backendFails?: boolean;
  manifestMismatch?: boolean;
}

export function makeCampaignPreflightPorts(
  options: Track1CampaignPreflightPortsOptions = {}
): Track1PreflightPorts & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async inspectDocker() {
      calls.push("docker");
      if (options.dockerFails) return { compose_v2: false };
      return { compose_v2: true };
    },
    async inspectOpenClaw() {
      calls.push("openclaw");
      return {
        version: options.openclawVersionMismatch ? "2025.1.1" : "2026.6.10",
        integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY
      };
    },
    async probePlugin() {
      calls.push("plugin");
      if (options.pluginProbeFails) {
        throw new Error("track1_plugin_probe_failed");
      }
      return makeValidPluginProbeResult();
    },
    async checkBackend() {
      calls.push("backend");
      if (options.backendFails) {
        return { public_ready: false, internal_ready: false };
      }
      return { public_ready: true, internal_ready: true };
    },
    async loadManifest() {
      calls.push("manifest");
      if (options.manifestMismatch) {
        return new TextEncoder().encode("{}");
      }
      return CANONICAL_MANIFEST_BYTES.slice();
    }
  };
}

export function makeCanonicalManifestBytes(): Uint8Array {
  return CANONICAL_MANIFEST_BYTES.slice();
}

export const TRACK1_TEST_MODEL_REF = TRACK1_MODEL_REF_CANONICAL;
