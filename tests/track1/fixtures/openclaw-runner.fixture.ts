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
      "agent_end",
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

// -- P4-T4/P4-T5: campaign runner port fixtures ------------------------------

import type {
  Track1AttemptObservation,
  Track1CampaignFinalizeInput,
  Track1CampaignRunnerPorts,
  Track1RetryReason,
  Track1TerminalFailureReason
} from "../../../scripts/track1/campaign-runner.ts";
import type { Track1CompiledPrompt } from "../../../scripts/track1/case-prompt.ts";
import type { SafeOpenClawInvocationResult } from "../../../scripts/track1/openclaw-command.ts";
import type { Track1CaseId } from "../../../shared/types/campaign-supervision.ts";
import {
  TRACK1_CASE_EXPECTED_ACTIONS,
  TRACK1_CASE_IDS
} from "../../../shared/types/campaign-supervision.ts";

export function makeSuccessfulAttemptObservation(): Track1AttemptObservation {
  return Object.freeze({
    outcome: "passed",
    final_action: "allow",
    reason: null
  });
}

export function makeRetryableAttemptObservation(
  reason: Track1RetryReason
): Track1AttemptObservation {
  return Object.freeze({
    outcome: "retryable_failed",
    final_action: null,
    reason
  });
}

export function makeTerminalAttemptObservation(
  reason: Track1TerminalFailureReason = "correlation_invalid"
): Track1AttemptObservation {
  return Object.freeze({
    outcome: "terminal_failed",
    final_action: null,
    reason
  });
}

let hexCounter = 0;
function nextHex32(): string {
  hexCounter += 1;
  return hexCounter.toString(16).padStart(32, "0");
}

export interface Track1CampaignRunnerPortsOptions {
  cliClaimedAction?: string;
  backendActualAction?: string;
  attempts?: Partial<Record<Track1CaseId, readonly Track1AttemptObservation[]>>;
}

export function makeCampaignRunnerPorts(
  options: Track1CampaignRunnerPortsOptions = {}
): Track1CampaignRunnerPorts & {
  calls: string[];
  invocations: Array<{
    agent_id: string;
    case_id: string;
    session_id: string;
    session_key: string;
  }>;
  progressEvents: Array<Record<string, unknown>>;
  finalizeInputs: Track1CampaignFinalizeInput[];
  runningCheckpoints: Array<Record<string, unknown>>;
  attemptsFor(caseId: string): Array<{ attempt_index: number; final: boolean }>;
} {
  hexCounter = 0;
  const calls: string[] = [];
  const invocations: Array<{
    agent_id: string;
    case_id: string;
    session_id: string;
    session_key: string;
  }> = [];
  const progressEvents: Array<Record<string, unknown>> = [];
  const finalizeInputs: Track1CampaignFinalizeInput[] = [];
  const runningCheckpoints: Array<Record<string, unknown>> = [];

  const attemptQueues = new Map<string, Track1AttemptObservation[]>();
  for (const [caseId, observations] of Object.entries(options.attempts ?? {})) {
    attemptQueues.set(caseId, [...(observations ?? [])]);
  }

  return {
    calls,
    invocations,
    progressEvents,
    finalizeInputs,
    runningCheckpoints,
    attemptsFor(caseId: string) {
      return finalizeInputs
        .flatMap((f) => f.attempts)
        .filter((a) => a.case_id === caseId)
        .map((a) => ({ attempt_index: a.attempt_index, final: a.final }));
    },
    async preflight() {
      calls.push("preflight");
      return {
        schema_version: "track1-preflight.v1",
        compose_v2: true,
        openclaw_version: "2026.6.10",
        openclaw_package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
        model_ref: TRACK1_MODEL_REF_CANONICAL,
        plugin_probe: makeValidPluginProbeResult(),
        backend_public_ready: true,
        backend_internal_ready: true,
        campaign_manifest_sha256:
          "3fb7887447cc0d8814a52932ad0ad26abbd7a46b372ef4d629426ead205a1408"
      } as never;
    },
    async createCampaign() {
      calls.push("create-campaign");
    },
    async compilePrompt(input) {
      return Object.freeze({
        case_id: input.case_id,
        scenario_id: input.scenario_id,
        relative_tmpfs_path: `/run/track1/messages/attempt-${input.case_id.toLowerCase()}-${input.attempt_index}.json`,
        content_sha256: "0".repeat(64),
        utf8: new TextEncoder().encode(
          JSON.stringify({ case_id: input.case_id })
        )
      }) as Track1CompiledPrompt;
    },
    async invokeAgent(input) {
      invocations.push({
        agent_id: input.agent_id,
        case_id: input.prompt.case_id,
        session_id: input.session_id,
        session_key: input.session_key
      });
      return Object.freeze({
        exit_code: 0,
        agent_id: input.agent_id,
        session_key_sha256: "0".repeat(64),
        protocol_valid: true
      }) as SafeOpenClawInvocationResult;
    },
    async awaitAttempt(input) {
      const queue = attemptQueues.get(input.case_id);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
      const caseIndex = TRACK1_CASE_IDS.indexOf(input.case_id as Track1CaseId);
      const expectedAction = TRACK1_CASE_EXPECTED_ACTIONS[caseIndex];
      const actualAction = options.backendActualAction ?? expectedAction;
      return Object.freeze({
        outcome: actualAction === expectedAction ? "passed" : "retryable_failed",
        final_action: actualAction === expectedAction ? (actualAction as never) : null,
        reason: actualAction === expectedAction ? null : "derived_action_mismatch"
      });
    },
    async captureRunningCheckpoint(input) {
      calls.push("capture-running-checkpoint");
      runningCheckpoints.push(structuredClone(input));
    },
    async finalizeCampaign(input) {
      calls.push("finalize-campaign");
      finalizeInputs.push(input);
    },
    now() {
      return "2026-07-04T00:00:00.000Z";
    },
    randomHex32() {
      return nextHex32();
    },
    progress(event) {
      progressEvents.push({ ...event });
    }
  };
}
