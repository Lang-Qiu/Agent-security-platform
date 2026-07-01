import { calculateTrack1SnapshotSha256 } from "../../../shared/contracts/campaign-ingest.ts";
import { normalizeBaseResult } from "../../../shared/contracts/result.ts";
import {
  makeCampaignEvidenceRegistration as makeCampaignEvidenceRegistrationShared,
  makeCampaignFinalizeEnvelope as makeCampaignFinalizeEnvelopeShared,
  makeCampaignStartEnvelope as makeCampaignStartEnvelopeShared,
  makeFinishedSandboxResult
} from "../../../shared/tests/fixtures/campaign-ingest.fixture.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotWithoutHash,
  Track1CampaignStartEnvelope
} from "../../../shared/types/campaign-ingest.ts";
import { TRACK1_CAMPAIGN_MANIFEST_SHA256 } from "../../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";
import type { SandboxPolicyAction, SandboxPolicyDecision } from "../../../shared/types/sandbox.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  getTrack1CaseExpectedAction,
  type Track1CampaignAgentId,
  type Track1CampaignId,
  type Track1CampaignStatus,
  type Track1CaseId,
  type Track1ScenarioId
} from "../../../shared/types/campaign-supervision.ts";
import type { StoredCampaignAttempt, StoredCampaignRecord, StoredCampaignSnapshotReceipt } from "../src/modules/supervision/repositories/campaign.repository.ts";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const CAMPAIGN_HEX = "0123456789abcdef0123456789abcdef";
const MANIFEST_SHA256 = TRACK1_CAMPAIGN_MANIFEST_SHA256;

// Re-export shared fixtures for backend test convenience.
export function makeCampaignStartEnvelope(): Track1CampaignStartEnvelope {
  return makeCampaignStartEnvelopeShared();
}

export function makeCampaignFinalizeEnvelope(): Track1CampaignFinalizeEnvelope {
  return makeCampaignFinalizeEnvelopeShared();
}

export function makeCampaignEvidenceRegistration(): Track1CampaignEvidenceRegistration {
  return makeCampaignEvidenceRegistrationShared();
}

// -- Action-aware sandbox result factory ---------------------------------------

function makeResultWithAction(
  action: SandboxPolicyAction,
  caseIndex: number,
  attemptIndex: 1 | 2 = 1
): BaseResult<SandboxRunResultDetails> {
  // P2-T6: Session and task IDs must be exactly 32 hex chars after the prefix
  // to satisfy SESSION_ID_PATTERN and TASK_ID_PATTERN in the shared normalizers.
  // R13: include attemptIndex in the hex derivation so different attempts of
  // the same case get distinct task_id/session_id. Without this, attempt 1
  // and attempt 2 of the same case would share the same task_id, causing the
  // TaskRepository (keyed by task_id) to silently overwrite the first
  // attempt's task record.
  const caseSuffix = caseIndex.toString(16).padStart(2, "0");
  const attemptSuffix = attemptIndex.toString(16).padStart(2, "0");
  const hexBase = CAMPAIGN_HEX.slice(0, -4) + caseSuffix + attemptSuffix;
  const sessionId = `session:${hexBase}`;
  const taskId = `task:${hexBase}`;
  const sequence = caseIndex + 1;
  const minutePad = sequence.toString().padStart(2, "0");
  const occurredAt = `2026-06-30T00:${minutePad}:01.000Z`;
  const decidedAt = `2026-06-30T00:${minutePad}:02.000Z`;

  const decision: SandboxPolicyDecision = {
    decision_id: `decision_${caseIndex + 1}`,
    subject_event_id: `event_tool_request_${caseIndex + 1}`,
    policy_id: `policy_case_${caseIndex + 1}`,
    action,
    reason_code: `${action}_expected`,
    reason: `Fixture policy decision with action ${action}`,
    evidence_refs: [`evidence://decision/${caseIndex + 1}`],
    decided_at: decidedAt
  };

  // satisfiesSandboxSupervisionContract requires:
  //   - every "deny" decision has a matching blocked_record (blocked=true)
  //   - every "alert" decision has a matching alert (blocked unchanged)
  //   - blocked === (blocked_records.length > 0)
  const alerts =
    action === "alert"
      ? [
          {
            alert_id: `alert_${caseIndex + 1}`,
            subject_event_id: `event_tool_request_${caseIndex + 1}`,
            decision_id: decision.decision_id,
            risk_level: "medium" as const,
            category: "policy.alert",
            title: `Alert for ${action} decision`,
            reason: `Fixture alert for case ${caseIndex + 1}`,
            evidence_refs: [`evidence://alert/${caseIndex + 1}`],
            occurred_at: decidedAt
          }
        ]
      : [];

  const blocked_records =
    action === "deny"
      ? [
          {
            blocked_record_id: `blocked_${caseIndex + 1}`,
            subject_event_id: `event_tool_request_${caseIndex + 1}`,
            decision_id: decision.decision_id,
            reason: `Fixture block for case ${caseIndex + 1}`,
            evidence_refs: [`evidence://blocked/${caseIndex + 1}`],
            occurred_at: decidedAt
          }
        ]
      : [];

  const details = {
    session_id: sessionId,
    events: [
      {
        event_id: `event_tool_request_${caseIndex + 1}`,
        session_id: sessionId,
        sequence: 1,
        event_type: "tool_request",
        occurred_at: occurredAt,
        source: "agent",
        evidence_refs: [`evidence://tool/request/${caseIndex + 1}`],
        payload: {
          call_id: `call_${caseIndex + 1}`,
          tool_name: "send_email",
          target_ref: "recipient://reviewer@local.invalid",
          arguments_ref: `fixture://cases/T1-SC-${(Math.floor(caseIndex / 3) + 1).toString().padStart(3, "0")}/tool-request`
        }
      },
      {
        event_id: `event_policy_decision_${caseIndex + 1}`,
        session_id: sessionId,
        sequence: 2,
        event_type: "policy_decision",
        occurred_at: decidedAt,
        source: "policy",
        evidence_refs: [`evidence://decision/${caseIndex + 1}`],
        payload: decision
      }
    ],
    policy_decisions: [decision],
    alerts,
    blocked_records,
    blocked: blocked_records.length > 0,
    event_count: 2
  };

  const normalized = normalizeBaseResult({
    task_id: taskId,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "finished",
    risk_level: "info",
    summary: `Sandbox finished with action ${action}`,
    details,
    created_at: `2026-06-30T00:${minutePad}:00.000Z`,
    updated_at: `2026-06-30T00:${minutePad}:03.000Z`
  });

  if (!normalized) {
    throw new Error(`fixture result for action ${action} must normalize`);
  }

  return normalized as BaseResult<SandboxRunResultDetails>;
}

// -- Case metadata helper -----------------------------------------------------

interface CaseMetadata {
  agent_id: Track1CampaignAgentId;
  scenario_id: Track1ScenarioId;
  case_id: Track1CaseId;
  expected_action: SandboxPolicyAction;
}

function getCaseMetadata(caseIndex: number): CaseMetadata {
  const caseId = TRACK1_CASE_IDS[caseIndex];
  const groupIdx = Math.floor(caseIndex / 3);
  return {
    agent_id: TRACK1_CAMPAIGN_AGENT_IDS[groupIdx],
    scenario_id: TRACK1_SCENARIO_IDS[groupIdx],
    case_id: caseId as Track1CaseId,
    expected_action: getTrack1CaseExpectedAction(caseId as Track1CaseId)
  };
}

// -- Snapshot factories -------------------------------------------------------

export function makeCampaignSnapshot(
  sequence: number,
  previousHash: string | null
): Track1CampaignSnapshotEnvelope {
  return makeCampaignSnapshotForCase(0, 1, sequence, previousHash);
}

export function makeCampaignSnapshotForCase(
  caseIndex: number,
  attemptIndex: 1 | 2,
  sequence: number,
  previousHash: string | null,
  overrides?: {
    observed_at?: string;
    action?: SandboxPolicyAction;
  }
): Track1CampaignSnapshotEnvelope {
  const meta = getCaseMetadata(caseIndex);
  const action = overrides?.action ?? meta.expected_action;
  const result = makeResultWithAction(action, caseIndex, attemptIndex);
  const attemptId = `attempt:${meta.case_id.toLowerCase()}:${attemptIndex}`;

  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: MANIFEST_SHA256,
    agent_id: meta.agent_id,
    scenario_id: meta.scenario_id,
    case_id: meta.case_id,
    attempt_id: attemptId,
    attempt_index: attemptIndex,
    sequence,
    previous_snapshot_sha256: previousHash,
    observed_at: overrides?.observed_at ?? `2026-06-30T00:${sequence.toString().padStart(2, "0")}:00.000Z`,
    result
  };
  const snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256 };
}

// -- Stored campaign record factories -----------------------------------------

export function makeStoredCampaignRecord(overrides?: {
  campaignId?: Track1CampaignId;
  updatedAt?: string;
  status?: Track1CampaignStatus;
}): StoredCampaignRecord {
  const start = makeCampaignStartEnvelope();
  const campaignId = overrides?.campaignId ?? start.campaign_id;
  const result = makeFinishedSandboxResult();
  return {
    campaign: {
      campaign_id: campaignId,
      start: { ...start, campaign_id: campaignId },
      status: overrides?.status ?? "created",
      updated_at: overrides?.updatedAt ?? "2026-06-30T00:00:01.000Z"
    },
    snapshots: [],
    attempts: [
      {
        campaign_id: campaignId,
        agent_id: "agent:track1:prompt-injection",
        scenario_id: "T1-SC-001",
        case_id: "T1-SC-001-C001",
        attempt_id: "attempt:t1-sc-001-c001:1",
        attempt_index: 1,
        session_id: "session:0123456789abcdef0123456789abcdef",
        task_id: "task:0123456789abcdef0123456789abcdef",
        status: "passed",
        snapshot_head: MANIFEST_SHA256,
        result
      }
    ],
    evidence: null
  };
}

export function makeCompletedCampaignRecord(): StoredCampaignRecord {
  const start = makeCampaignStartEnvelope();
  const campaignId = start.campaign_id;

  const attempts: StoredCampaignAttempt[] = [];
  const snapshots: StoredCampaignSnapshotReceipt[] = [];

  for (let i = 0; i < TRACK1_CASE_IDS.length; i++) {
    const meta = getCaseMetadata(i);
    const result = makeResultWithAction(meta.expected_action, i);
    const attemptId = `attempt:${meta.case_id.toLowerCase()}:1`;
    const sessionId = result.details.session_id!;
    const taskId = result.task_id;

    const snapshotWithoutHash: Track1CampaignSnapshotWithoutHash = {
      schema_version: "track1-campaign-snapshot.v1",
      campaign_id: campaignId,
      campaign_manifest_sha256: MANIFEST_SHA256,
      agent_id: meta.agent_id,
      scenario_id: meta.scenario_id,
      case_id: meta.case_id,
      attempt_id: attemptId,
      attempt_index: 1,
      sequence: 1,
      previous_snapshot_sha256: null,
      observed_at: `2026-06-30T00:${(i + 1).toString().padStart(2, "0")}:00.000Z`,
      result
    };
    const snapshotSha = calculateTrack1SnapshotSha256(snapshotWithoutHash);
    // R11: store closed receipt, not raw snapshot envelope.
    snapshots.push({
      schema_version: snapshotWithoutHash.schema_version,
      campaign_id: campaignId,
      campaign_manifest_sha256: MANIFEST_SHA256,
      agent_id: meta.agent_id,
      scenario_id: meta.scenario_id,
      case_id: meta.case_id,
      attempt_id: attemptId,
      attempt_index: 1,
      sequence: 1,
      previous_snapshot_sha256: null,
      observed_at: snapshotWithoutHash.observed_at,
      snapshot_sha256: snapshotSha,
      result_task_id: taskId,
      result_session_id: sessionId,
      result_status: result.status
    });

    attempts.push({
      campaign_id: campaignId,
      agent_id: meta.agent_id,
      scenario_id: meta.scenario_id,
      case_id: meta.case_id,
      attempt_id: attemptId,
      attempt_index: 1,
      session_id: sessionId,
      task_id: taskId,
      status: "passed",
      snapshot_head: snapshotSha,
      result
    });
  }

  return {
    campaign: {
      campaign_id: campaignId,
      start,
      status: "completed",
      updated_at: "2026-06-30T00:10:00.000Z",
      completed_at: "2026-06-30T00:10:00.000Z"
    },
    snapshots,
    attempts,
    evidence: null
  };
}

// -- Constants for tests ------------------------------------------------------

export const FIXED_CAMPAIGN_ID = CAMPAIGN_ID;
export const FIXED_CAMPAIGN_HEX = CAMPAIGN_HEX;
export const FIXED_MANIFEST_SHA256 = MANIFEST_SHA256;
