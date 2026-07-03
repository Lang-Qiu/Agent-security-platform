// P4-T4/P4-T5: fixed three-agent/nine-case campaign state machine. Executes
// agents in manifest order, cases in case-ID order, and derives every final
// action exclusively from normalized backend-observed evidence — never from
// CLI text. P4-T4 adds the all-success path; P4-T5 adds the one-retry state
// machine below.

import type { Track1CompiledPrompt } from "./case-prompt.ts";
import type { SafeOpenClawInvocationResult } from "./openclaw-command.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS
} from "../../shared/types/campaign-supervision.ts";
import type {
  Track1CampaignAgentId,
  Track1CaseId,
  Track1ScenarioId
} from "../../shared/types/campaign-supervision.ts";
import type { SandboxPolicyAction } from "../../shared/types/sandbox.ts";
import type { Track1CampaignStartEnvelope } from "../../shared/types/campaign-ingest.ts";
import type { Track1PreflightResult } from "./preflight.ts";

export class Track1CampaignError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1CampaignError";
    this.code = code;
  }
}

// -- retry classification -----------------------------------------------------

export const TRACK1_RETRYABLE_REASONS = [
  "provider_transport_failed",
  "model_protocol_invalid",
  "expected_tool_request_missing",
  "derived_action_mismatch"
] as const;

export const TRACK1_TERMINAL_FAILURE_REASONS = [
  "preflight_failed",
  "plugin_probe_failed",
  "ingest_failed",
  "correlation_invalid",
  "real_side_effect_detected",
  "content_boundary_violated",
  "manifest_invalid"
] as const;

export type Track1RetryReason = (typeof TRACK1_RETRYABLE_REASONS)[number];
export type Track1TerminalFailureReason =
  (typeof TRACK1_TERMINAL_FAILURE_REASONS)[number];

export interface Track1AttemptObservation {
  outcome: "passed" | "retryable_failed" | "terminal_failed";
  final_action: SandboxPolicyAction | null;
  reason: Track1RetryReason | Track1TerminalFailureReason | null;
}

// -- ports --------------------------------------------------------------------

export interface Track1CampaignFinalizeAttemptRecord {
  case_id: Track1CaseId;
  attempt_index: 1 | 2;
  final: boolean;
}

export interface Track1CampaignFinalizeInput {
  campaign_id: string;
  status: "completed" | "failed";
  attempts: readonly Track1CampaignFinalizeAttemptRecord[];
  completed_at: string;
}

export interface Track1CampaignRunnerPorts {
  preflight(): Promise<Track1PreflightResult>;
  createCampaign(input: Track1CampaignStartEnvelope): Promise<void>;
  compilePrompt(input: {
    campaign_id: string;
    agent_id: Track1CampaignAgentId;
    scenario_id: Track1ScenarioId;
    case_id: Track1CaseId;
    attempt_id: string;
    attempt_index: 1 | 2;
    session_id: string;
  }): Promise<Track1CompiledPrompt>;
  invokeAgent(input: {
    agent_id: Track1CampaignAgentId;
    session_key: string;
    attempt_id: string;
    prompt: Track1CompiledPrompt;
  }): Promise<SafeOpenClawInvocationResult>;
  awaitAttempt(input: {
    campaign_id: string;
    agent_id: Track1CampaignAgentId;
    case_id: Track1CaseId;
    attempt_id: string;
    session_id: string;
  }): Promise<Track1AttemptObservation>;
  finalizeCampaign(input: Track1CampaignFinalizeInput): Promise<void>;
  now(): string;
  randomHex32(): string;
  progress(event: Readonly<Record<string, unknown>>): void;
}

// -- summary --------------------------------------------------------------------

export interface Track1CampaignRunSummary {
  campaign_id: string;
  agent_count: 3;
  case_count: 9;
  retry_count: number;
  final_actions: Readonly<Record<Track1CaseId, SandboxPolicyAction>>;
}

const MAX_ATTEMPTS = 2;

export async function runTrack1OpenClawCampaign(
  ports: Track1CampaignRunnerPorts
): Promise<Track1CampaignRunSummary> {
  await ports.preflight();

  const campaignId = `campaign:t1:${ports.randomHex32()}`;

  const startEnvelope: Track1CampaignStartEnvelope = {
    schema_version: "track1-campaign-start.v1",
    campaign_id: campaignId as Track1CampaignStartEnvelope["campaign_id"],
    campaign_manifest_sha256:
      "3fb7887447cc0d8814a52932ad0ad26abbd7a46b372ef4d629426ead205a1408",
    openclaw_version: "2026.6.10",
    openclaw_package_integrity:
      "sha512-LcooND2tBQw8A+kc1Ujltu3lg30bJ0w7XaeRy7eYzobb8BBdcW6DOGbwJL4vpj1vl9+gjRceOtlh5nh9OARcug==",
    model_ref: "model://track1/openclaw-demo",
    started_at: ports.now()
  };
  await ports.createCampaign(startEnvelope);
  ports.progress({ event_type: "campaign_created", campaign_id: campaignId });

  const finalActions: Record<string, SandboxPolicyAction> = {};
  const finalizeAttempts: Track1CampaignFinalizeAttemptRecord[] = [];
  let retryCount = 0;
  let campaignFailed = false;

  let caseOrdinal = 0;
  for (let agentIndex = 0; agentIndex < TRACK1_CAMPAIGN_AGENT_IDS.length; agentIndex++) {
    const agentId = TRACK1_CAMPAIGN_AGENT_IDS[agentIndex];
    const scenarioId = TRACK1_SCENARIO_IDS[agentIndex];
    const caseIds = TRACK1_CASE_IDS.slice(agentIndex * 3, agentIndex * 3 + 3);

    for (const caseId of caseIds) {
      caseOrdinal += 1;
      ports.progress({
        event_type: "case_started",
        agent_id: agentId,
        case_id: caseId,
        case_ordinal: caseOrdinal,
        total_cases: 9
      });

      let caseResolved = false;

      for (let attemptIndex = 1; attemptIndex <= MAX_ATTEMPTS; attemptIndex++) {
        const sessionId = `session:${ports.randomHex32()}`;
        const attemptId = `attempt:${caseId.toLowerCase()}:${attemptIndex}`;
        const sessionKey = `session-key:${ports.randomHex32()}`;

        const prompt = await ports.compilePrompt({
          campaign_id: campaignId,
          agent_id: agentId,
          scenario_id: scenarioId,
          case_id: caseId,
          attempt_id: attemptId,
          attempt_index: attemptIndex as 1 | 2,
          session_id: sessionId
        });

        await ports.invokeAgent({
          agent_id: agentId,
          session_key: sessionKey,
          attempt_id: attemptId,
          prompt
        });
        ports.progress({
          event_type: "attempt_invoked",
          agent_id: agentId,
          case_id: caseId,
          attempt_id: attemptId,
          attempt_index: attemptIndex
        });

        const observation = await ports.awaitAttempt({
          campaign_id: campaignId,
          agent_id: agentId,
          case_id: caseId,
          attempt_id: attemptId,
          session_id: sessionId
        });

        if (observation.outcome === "passed") {
          finalActions[caseId] = observation.final_action as SandboxPolicyAction;
          finalizeAttempts.push({
            case_id: caseId,
            attempt_index: attemptIndex as 1 | 2,
            final: true
          });
          ports.progress({
            event_type: "attempt_observed",
            agent_id: agentId,
            case_id: caseId,
            attempt_id: attemptId,
            final_action: observation.final_action
          });
          caseResolved = true;
          break;
        }

        finalizeAttempts.push({
          case_id: caseId,
          attempt_index: attemptIndex as 1 | 2,
          final: false
        });
        ports.progress({
          event_type: "attempt_observed",
          agent_id: agentId,
          case_id: caseId,
          attempt_id: attemptId,
          final_action: observation.final_action
        });

        // P4-T4: single-attempt-only tracer path. Retry is added by P4-T5's
        // outcome === "retryable_failed" branch below.
        if (
          observation.outcome === "retryable_failed" &&
          attemptIndex < MAX_ATTEMPTS
        ) {
          retryCount += 1;
          continue;
        }

        campaignFailed = true;
        caseResolved = true;
        break;
      }

      if (campaignFailed) break;
      if (!caseResolved) {
        // Defensive: the loop above always resolves or fails within
        // MAX_ATTEMPTS iterations.
        campaignFailed = true;
        break;
      }
    }
    if (campaignFailed) break;
  }

  const completedAt = ports.now();
  await ports.finalizeCampaign({
    campaign_id: campaignId,
    status: campaignFailed ? "failed" : "completed",
    attempts: finalizeAttempts,
    completed_at: completedAt
  });
  ports.progress({
    event_type: "campaign_finalized",
    campaign_id: campaignId,
    status: campaignFailed ? "failed" : "completed"
  });

  if (campaignFailed) {
    throw new Track1CampaignError("track1_campaign_failed");
  }

  return Object.freeze({
    campaign_id: campaignId,
    agent_count: 3 as const,
    case_count: 9 as const,
    retry_count: retryCount,
    final_actions: Object.freeze({ ...finalActions }) as Readonly<
      Record<Track1CaseId, SandboxPolicyAction>
    >
  });
}
