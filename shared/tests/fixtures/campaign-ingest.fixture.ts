import { normalizeBaseResult } from "../../contracts/result.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../types/result.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL,
  TRACK1_OPENCLAW_PACKAGE_INTEGRITY
} from "../../types/campaign-ingest.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotAck,
  Track1CampaignStartEnvelope
} from "../../types/campaign-ingest.ts";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const CAMPAIGN_HEX = "0123456789abcdef0123456789abcdef";
const SESSION_ID = "session:0123456789abcdef0123456789abcdef";
const TASK_ID = "task:0123456789abcdef0123456789abcdef";
const SHA256_A = TRACK1_CAMPAIGN_MANIFEST_SHA256;
const SHA256_C = "c".repeat(64);

// Build a real normalized BaseResult<SandboxRunResultDetails> using existing shared contracts.
// Status is "finished" with an "allow" decision, blocked=false, no alerts or blocked records.
// The result must pass normalizeBaseResult and satisfiesSandboxSupervisionContract.
export function makeFinishedSandboxResult(): BaseResult<SandboxRunResultDetails> {
  const details = {
    session_id: SESSION_ID,
    events: [
      {
        event_id: "event_tool_request_001",
        session_id: SESSION_ID,
        sequence: 1,
        event_type: "tool_request",
        occurred_at: "2026-06-30T00:00:01.000Z",
        source: "agent",
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
        event_type: "policy_decision",
        occurred_at: "2026-06-30T00:00:02.000Z",
        source: "policy",
        evidence_refs: ["evidence://decision/001"],
        payload: {
          decision_id: "decision_001",
          subject_event_id: "event_tool_request_001",
          policy_id: "policy_tool_target",
          action: "allow",
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
        action: "allow",
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

export function makeCampaignStartEnvelope(): Track1CampaignStartEnvelope {
  return {
    schema_version: "track1-campaign-start.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: SHA256_A,
    openclaw_version: "2026.6.10",
    openclaw_package_integrity: TRACK1_OPENCLAW_PACKAGE_INTEGRITY,
    model_ref: TRACK1_MODEL_REF_CANONICAL,
    started_at: "2026-06-30T00:00:00.000Z"
  };
}

export function makeCampaignSnapshotAck(): Track1CampaignSnapshotAck {
  return {
    schema_version: "track1-campaign-snapshot-ack.v1",
    campaign_id: CAMPAIGN_ID,
    attempt_id: "attempt:t1-sc-001-c001:1",
    sequence: 1,
    snapshot_sha256: SHA256_A,
    accepted_at: "2026-06-30T00:00:02.000Z"
  };
}

export function makeCampaignFinalizeEnvelope(): Track1CampaignFinalizeEnvelope {
  return {
    schema_version: "track1-campaign-finalize.v1",
    campaign_id: CAMPAIGN_ID,
    requested_status: "completed",
    completed_at: "2026-06-30T00:10:00.000Z"
  };
}

export function makeCampaignEvidenceRegistration(): Track1CampaignEvidenceRegistration {
  return {
    schema_version: "track1-campaign-evidence-registration.v1",
    campaign_id: CAMPAIGN_ID,
    artifact_manifest_sha256: SHA256_C,
    artifact_manifest_ref: `artifact://track1/campaign/${CAMPAIGN_HEX}/manifest`,
    registered_at: "2026-06-30T00:10:01.000Z"
  };
}
