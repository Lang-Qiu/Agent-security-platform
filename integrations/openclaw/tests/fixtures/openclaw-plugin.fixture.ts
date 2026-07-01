import { InMemorySimulatedToolState } from "../../../../engines/sandbox/src/simulated-tools/state.ts";
import { SimulatedToolExecutor } from "../../../../engines/sandbox/src/simulated-tools/executor.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL
} from "../../../../shared/types/campaign-ingest.ts";
import {
  calculateTrack1SnapshotSha256
} from "../../../../shared/contracts/campaign-ingest.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import type {
  Track1CampaignSnapshotAck,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotWithoutHash
} from "../../../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";

// -- recording plugin api -------------------------------------------------

export interface RecordedTool {
  name: string;
  description: string;
  parameters: {
    additionalProperties: boolean;
    [key: string]: unknown;
  };
  execute: (args: unknown, context: unknown) => Promise<unknown>;
}

export interface RecordingPluginApi {
  tools: RecordedTool[];
  registerTool(tool: RecordedTool): void;
}

export function makeRecordingPluginApi(): RecordingPluginApi {
  const tools: RecordedTool[] = [];
  return {
    tools,
    registerTool(tool) {
      tools.push(tool);
    }
  };
}

// -- campaign tool runtime ------------------------------------------------

export interface CampaignToolRuntime {
  campaign_id: string;
  agent_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  scenario_id: string;
  case_id: string;
  state: InMemorySimulatedToolState;
  executor: SimulatedToolExecutor;
}

export function makeCampaignToolRuntime(
  overrides?: Partial<{
    campaign_id: string;
    agent_id: string;
    attempt_id: string;
    attempt_index: 1 | 2;
    session_id: string;
    scenario_id: string;
    case_id: string;
    files: Record<string, string>;
    api_routes: Array<{
      endpoint: string;
      method: "GET" | "POST";
      status_code: number;
      body: Record<string, string>;
    }>;
  }>
): CampaignToolRuntime {
  const state = new InMemorySimulatedToolState({
    files: overrides?.files,
    api_routes: overrides?.api_routes
  });
  return {
    campaign_id: overrides?.campaign_id ?? "campaign:track1:demo-010",
    agent_id: overrides?.agent_id ?? "agent:track1:openclaw-001",
    attempt_id: overrides?.attempt_id ?? "attempt:track1:demo-010-001",
    attempt_index: overrides?.attempt_index ?? 1,
    session_id: overrides?.session_id ?? "session:track1:openclaw-001",
    scenario_id: overrides?.scenario_id ?? "T1-SC-001",
    case_id: overrides?.case_id ?? "T1-SC-001-C001",
    state,
    executor: new SimulatedToolExecutor(state)
  };
}

// -- call id generator -----------------------------------------------------

let _callIdCounter = 0;

export function nextCallId(): string {
  _callIdCounter += 1;
  return `call:fixture:${String(_callIdCounter).padStart(3, "0")}`;
}

// -- P3-T4: campaign context + ingest fixtures ----------------------------

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const ATTEMPT_ID = "attempt:t1-sc-001-c001:1";
const AGENT_ID = "track1-agent-tool";
const SESSION_ID = "session:0123456789abcdef0123456789abcdef";
const TASK_ID = "task:0123456789abcdef0123456789abcdef";

export function makeCampaignPluginConfig(
  overrides?: Partial<{ ingestEndpoint: string; ingestToken: string }>
): {
  ingestEndpoint: string;
  ingestToken: string;
} {
  return {
    ingestEndpoint:
      overrides?.ingestEndpoint ??
      "http://backend:3001/internal/track1/campaigns",
    ingestToken: overrides?.ingestToken ?? "track1-test-token-abcdef"
  };
}

export function makeCampaignHookContext(
  overrides?: Partial<{
    campaign_id: string;
    attempt_id: string;
    attempt_index: 1 | 2;
    agent_id: string;
    session_id: string;
    scenario_id: string;
    case_id: string;
    model_ref: string;
  }>
): {
  campaign_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  agent_id: string;
  session_id: string;
  scenario_id: string;
  case_id: string;
  model_ref: string;
} {
  return {
    campaign_id: overrides?.campaign_id ?? CAMPAIGN_ID,
    attempt_id: overrides?.attempt_id ?? ATTEMPT_ID,
    attempt_index: overrides?.attempt_index ?? 1,
    agent_id: overrides?.agent_id ?? AGENT_ID,
    session_id: overrides?.session_id ?? SESSION_ID,
    scenario_id: overrides?.scenario_id ?? "T1-SC-001",
    case_id: overrides?.case_id ?? "T1-SC-001-C001",
    model_ref: overrides?.model_ref ?? TRACK1_MODEL_REF_CANONICAL
  };
}

export function makeTrack1ModelInputEnvelope(
  overrides?: Partial<{
    user_prompt: string;
  }>
): {
  schema_version: "track1-openclaw-input.v1";
  campaign_id: string;
  agent_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  case_id: string;
  scenario_id: string;
  user_prompt: string;
  retrieved_content: readonly {
    memory_entry_id: string;
    content_ref: string;
    content_sha256: string;
  }[];
  memory_entries: readonly {
    memory_entry_id: string;
    content_ref: string;
    content_sha256: string;
  }[];
  proposed_tool_call: {
    tool_name: "send_email" | "read_file" | "write_file" | "call_api";
    arguments_ref: string;
  } | null;
} {
  return {
    schema_version: "track1-openclaw-input.v1",
    campaign_id: CAMPAIGN_ID,
    agent_id: AGENT_ID,
    attempt_id: ATTEMPT_ID,
    attempt_index: 1,
    session_id: SESSION_ID,
    case_id: "T1-SC-001-C001",
    scenario_id: "T1-SC-001",
    user_prompt:
      overrides?.user_prompt ?? "What is the status of the customer portal?",
    retrieved_content: [],
    memory_entries: [],
    proposed_tool_call: null
  };
}

function makeFinishedSandboxResult(): BaseResult<SandboxRunResultDetails> {
  const details = {
    session_id: SESSION_ID,
    events: [
      {
        event_id: "event_tool_request_001",
        session_id: SESSION_ID,
        sequence: 1,
        event_type: "tool_request" as const,
        occurred_at: "2026-06-30T00:00:01.000Z",
        source: "agent" as const,
        evidence_refs: ["evidence://tool/request/001"],
        payload: {
          call_id: "call_001",
          tool_name: "send_email",
          target_ref: "recipient://reviewer@local.invalid",
          arguments_ref: "fixture://cases/T1-SC-001-C001/tool-request"
        }
      },
      {
        event_id: "event_policy_decision_001",
        session_id: SESSION_ID,
        sequence: 2,
        event_type: "policy_decision" as const,
        occurred_at: "2026-06-30T00:00:02.000Z",
        source: "policy" as const,
        evidence_refs: ["evidence://decision/001"],
        payload: {
          decision_id: "decision_001",
          subject_event_id: "event_tool_request_001",
          policy_id: "policy_tool_target",
          action: "allow" as const,
          reason_code: "target_approved",
          reason: "Target is within the approved fixture set",
          evidence_refs: ["evidence://decision/001"],
          decided_at: "2026-06-30T00:00:02.000Z"
        }
      }
    ],
    policy_decisions: [
      {
        decision_id: "decision_001",
        subject_event_id: "event_tool_request_001",
        policy_id: "policy_tool_target",
        action: "allow" as const,
        reason_code: "target_approved",
        reason: "Target is within the approved fixture set",
        evidence_refs: ["evidence://decision/001"],
        decided_at: "2026-06-30T00:00:02.000Z"
      }
    ],
    alerts: [],
    blocked_records: [],
    blocked: false,
    event_count: 2
  };

  const normalized = normalizeBaseResult({
    task_id: TASK_ID,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "finished",
    risk_level: "info",
    summary: "Sandbox finished with an allowed tool request",
    details,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:03.000Z"
  });

  if (!normalized) {
    throw new Error("fixture sandbox result must normalize via normalizeBaseResult");
  }
  return normalized as BaseResult<SandboxRunResultDetails>;
}

export function makeCampaignSnapshotEnvelope(): Track1CampaignSnapshotEnvelope {
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: AGENT_ID,
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: ATTEMPT_ID,
    attempt_index: 1,
    sequence: 1,
    previous_snapshot_sha256: null,
    observed_at: "2026-06-30T00:00:03.000Z",
    result: makeFinishedSandboxResult()
  };
  const snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256 };
}

export function makeIngestSnapshotAck(
  overrides?: Partial<{
    campaign_id: string;
    attempt_id: string;
    sequence: number;
    snapshot_sha256: string;
  }>
): Track1CampaignSnapshotAck {
  const envelope = makeCampaignSnapshotEnvelope();
  return {
    schema_version: "track1-campaign-snapshot-ack.v1",
    campaign_id: overrides?.campaign_id ?? envelope.campaign_id,
    attempt_id: overrides?.attempt_id ?? envelope.attempt_id,
    sequence: overrides?.sequence ?? envelope.sequence,
    snapshot_sha256: overrides?.snapshot_sha256 ?? envelope.snapshot_sha256,
    accepted_at: "2026-06-30T00:00:04.000Z"
  };
}
