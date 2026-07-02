// P4-T4: fixed three-agent/nine-case campaign state machine. The runner
// executes agents in manifest order, waits for backend-normalized terminal
// evidence after each CLI exit, and never trusts CLI text as policy outcome.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import type { Track1PreflightResult } from "./preflight.ts";
import type { Track1CompiledPrompt } from "./case-prompt.ts";
import type {
  OpenClawAgentInvocation,
  SafeOpenClawInvocationResult
} from "./openclaw-command.ts";
import type {
  Track1CampaignStartEnvelope,
  Track1CampaignFinalizeEnvelope
} from "../../shared/types/campaign-ingest.ts";
import {
  TRACK1_CAMPAIGN_START_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_OPENCLAW_VERSION
} from "../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignId,
  Track1CampaignAgentId,
  Track1ScenarioId,
  Track1CaseId,
  Track1AttemptId,
  Track1SessionId
} from "../../shared/types/campaign-supervision.ts";

// -- public types ------------------------------------------------------------

export interface Track1AttemptAwaitRequest {
  campaign_id: Track1CampaignId;
  agent_id: Track1CampaignAgentId;
  scenario_id: Track1ScenarioId;
  case_id: Track1CaseId;
  attempt_id: Track1AttemptId;
  session_id: Track1SessionId;
}

export interface Track1AttemptObservation {
  attempt_id: Track1AttemptId;
  final_action: "allow" | "ask" | "alert" | "deny";
  observation_complete: true;
  retry_classification?:
    | "success"
    | "provider_transport_failed"
    | "model_protocol_invalid"
    | "expected_tool_request_missing"
    | "derived_action_mismatch"
    | "ingest_failed"
    | "correlation_invalid"
    | "real_side_effect_detected"
    | "content_boundary_violated";
}

export interface Track1SafeProgressEvent {
  event_type:
    | "preflight_complete"
    | "campaign_created"
    | "case_started"
    | "attempt_invoked"
    | "attempt_observed"
    | "case_complete"
    | "campaign_finalized";
  agent_id?: Track1CampaignAgentId;
  case_id?: Track1CaseId;
  attempt_id?: Track1AttemptId;
  attempt_index?: 1 | 2;
  final_action?: string;
  case_ordinal?: number;
  total_cases?: number;
}

export interface Track1CampaignRunSummary {
  campaign_id: Track1CampaignId;
  case_count: number;
  agent_count: number;
  retry_count: number;
  final_actions: Record<Track1CaseId, string>;
  completed: boolean;
}

export interface Track1CampaignRunnerPorts {
  preflight(): Promise<Track1PreflightResult>;
  createCampaign(input: Track1CampaignStartEnvelope): Promise<void>;
  compilePrompt(input: {
    campaign_id: Track1CampaignId;
    agent_id: Track1CampaignAgentId;
    scenario_id: Track1ScenarioId;
    case_id: Track1CaseId;
    attempt_id: Track1AttemptId;
    attempt_index: 1 | 2;
    session_id: Track1SessionId;
  }): Promise<Track1CompiledPrompt>;
  invokeAgent(input: OpenClawAgentInvocation): Promise<SafeOpenClawInvocationResult>;
  awaitAttempt(input: Track1AttemptAwaitRequest): Promise<Track1AttemptObservation>;
  finalizeCampaign(input: Track1CampaignFinalizeEnvelope): Promise<void>;
  now(): string;
  randomHex32(): string;
  progress(event: Track1SafeProgressEvent): void;
}

// -- manifest types ----------------------------------------------------------

interface Track1CampaignManifestCase {
  agent_id: string;
  scenario_id: string;
  case_id: string;
  case_ref: string;
  case_sha256: string;
  expected_action: string;
}

interface Track1CampaignManifest {
  schema_version: "track1-openclaw-campaign.v1";
  campaign_name: string;
  max_attempts: 2;
  agents: Array<{ agent_id: string; scenario_id: string }>;
  cases: Track1CampaignManifestCase[];
}

// -- manifest loading --------------------------------------------------------

const MANIFEST_PATH = resolve(
  import.meta.dirname,
  "../../samples/track1/openclaw/campaign.v1.json"
);

function loadManifest(): Track1CampaignManifest {
  const bytes = readFileSync(MANIFEST_PATH);
  const computed = createHash("sha256").update(bytes).digest("hex");
  if (computed !== TRACK1_CAMPAIGN_MANIFEST_SHA256) {
    throw new Error("track1_manifest_integrity_failed");
  }
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (parsed.schema_version !== "track1-openclaw-campaign.v1") {
    throw new Error("track1_manifest_schema_invalid");
  }
  return parsed as Track1CampaignManifest;
}

// -- ID generation -----------------------------------------------------------

function generateCampaignId(hex32: string): Track1CampaignId {
  return `campaign:t1:${hex32}`;
}

function generateAttemptId(
  caseId: Track1CaseId,
  attemptIndex: 1 | 2
): Track1AttemptId {
  return `attempt:${caseId.toLowerCase()}:${attemptIndex}`;
}

function generateSessionKey(hex32: string): string {
  return `session-key:${hex32}`;
}

function generateSessionId(hex32: string): Track1SessionId {
  return `session:${hex32}`;
}

// -- runner state machine ----------------------------------------------------

export async function runTrack1OpenClawCampaign(
  ports: Track1CampaignRunnerPorts
): Promise<Track1CampaignRunSummary> {
  const manifest = loadManifest();

  // Step 1: Preflight
  const preflightResult = await ports.preflight();
  // Preflight validates all requirements; if it returns, environment is valid
  ports.progress({ event_type: "preflight_complete" });

  // Step 2: Create campaign
  const campaign_id = generateCampaignId(ports.randomHex32());
  await ports.createCampaign({
    schema_version: TRACK1_CAMPAIGN_START_SCHEMA_VERSION,
    campaign_id,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    openclaw_version: preflightResult.openclaw_version,
    openclaw_package_integrity: preflightResult.openclaw_integrity,
    model_ref: preflightResult.model_ref,
    started_at: ports.now()
  });
  ports.progress({ event_type: "campaign_created" });

  const final_actions: Record<Track1CaseId, string> = {};
  let caseOrdinal = 0;
  let retryCount = 0;
  let campaignFailed = false;

  const RETRYABLE_REASONS = new Set([
    "provider_transport_failed",
    "model_protocol_invalid",
    "expected_tool_request_missing",
    "derived_action_mismatch"
  ]);

  // Step 3: Execute all cases in manifest order
  for (const caseEntry of manifest.cases) {
    caseOrdinal++;
    const { agent_id, scenario_id, case_id } = caseEntry;

    ports.progress({
      event_type: "case_started",
      agent_id: agent_id as Track1CampaignAgentId,
      case_id: case_id as Track1CaseId,
      case_ordinal: caseOrdinal,
      total_cases: manifest.cases.length
    });

    // P4-T5: Execute attempt 1, retry once if retryable
    let finalObservation: Track1AttemptObservation | null = null;

    for (const attempt_index of [1, 2] as const) {
      const attempt_id = generateAttemptId(case_id as Track1CaseId, attempt_index);
      const session_id = generateSessionId(ports.randomHex32());
      const session_key = generateSessionKey(ports.randomHex32());

      // Compile oracle-free prompt
      const prompt = await ports.compilePrompt({
        campaign_id,
        agent_id: agent_id as Track1CampaignAgentId,
        scenario_id: scenario_id as Track1ScenarioId,
        case_id: case_id as Track1CaseId,
        attempt_id,
        attempt_index,
        session_id
      });

      // Invoke OpenClaw agent
      await ports.invokeAgent({
        agent_id: agent_id as Track1CampaignAgentId,
        session_key,
        attempt_id,
        prompt
      });
      ports.progress({
        event_type: "attempt_invoked",
        agent_id: agent_id as Track1CampaignAgentId,
        case_id: case_id as Track1CaseId,
        attempt_id,
        attempt_index
      });

      // Wait for backend-normalized terminal evidence
      const observation = await ports.awaitAttempt({
        campaign_id,
        agent_id: agent_id as Track1CampaignAgentId,
        scenario_id: scenario_id as Track1ScenarioId,
        case_id: case_id as Track1CaseId,
        attempt_id,
        session_id
      });

      ports.progress({
        event_type: "attempt_observed",
        agent_id: agent_id as Track1CampaignAgentId,
        case_id: case_id as Track1CaseId,
        attempt_id,
        final_action: observation.final_action
      });

      const classification = observation.retry_classification ?? "success";

      // Check if retry is needed and allowed
      if (attempt_index === 1) {
        if (classification === "success") {
          // Success on first attempt
          finalObservation = observation;
          break;
        } else if (RETRYABLE_REASONS.has(classification)) {
          // Retryable failure on first attempt - continue to attempt 2
          retryCount++;
          continue;
        } else {
          // Non-retryable failure on first attempt
          campaignFailed = true;
          break;
        }
      } else {
        // attempt_index === 2
        if (classification !== "success") {
          // Second attempt failed - terminal
          campaignFailed = true;
        }
        finalObservation = observation;
        break;
      }
    }

    if (campaignFailed) {
      await ports.finalizeCampaign({
        schema_version: TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
        campaign_id,
        requested_status: "failed",
        completed_at: ports.now()
      });
      throw new Error("track1_campaign_failed");
    }

    if (!finalObservation) {
      throw new Error("track1_internal_state_invalid");
    }

    final_actions[case_id as Track1CaseId] = finalObservation.final_action;

    ports.progress({
      event_type: "case_complete",
      agent_id: agent_id as Track1CampaignAgentId,
      case_id: case_id as Track1CaseId
    });
  }

  // Step 4: Finalize campaign
  await ports.finalizeCampaign({
    schema_version: TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION,
    campaign_id,
    requested_status: "completed",
    completed_at: ports.now()
  });
  ports.progress({ event_type: "campaign_finalized" });

  return {
    campaign_id,
    case_count: manifest.cases.length,
    agent_count: manifest.agents.length,
    retry_count: retryCount,
    final_actions,
    completed: true
  };
}
