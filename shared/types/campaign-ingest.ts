import type { BaseResult, SandboxRunResultDetails } from "./result.ts";
import type {
  Track1CampaignAgentId,
  Track1CampaignId,
  Track1CaseId,
  Track1ScenarioId,
  Track1AttemptId
} from "./campaign-supervision.ts";

export const TRACK1_CAMPAIGN_START_SCHEMA_VERSION =
  "track1-campaign-start.v1" as const;
export const TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION =
  "track1-campaign-snapshot.v1" as const;
export const TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION =
  "track1-campaign-snapshot-ack.v1" as const;
export const TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION =
  "track1-campaign-finalize.v1" as const;
export const TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION =
  "track1-campaign-evidence-registration.v1" as const;

export const TRACK1_OPENCLAW_VERSION = "2026.6.10" as const;

export const TRACK1_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const TRACK1_LIFECYCLE_MAX_BYTES = 256 * 1024;

// P2-4: pinned package integrity and canonical model_ref as public contract
// constants. Exported so fixtures and Phase 4 callers reference a single
// source of truth instead of duplicating hardcoded strings.
export const TRACK1_OPENCLAW_PACKAGE_INTEGRITY =
  "sha512-LcooND2tBQw8A+kc1Ujltu3lg30bJ0w7XaeRy7eYzobb8BBdcW6DOGbwJL4vpj1vl9+gjRceOtlh5nh9OARcug==" as const;

export const TRACK1_MODEL_REF_CANONICAL = "model://track1/openclaw-demo" as const;

export interface Track1CampaignStartEnvelope {
  schema_version: typeof TRACK1_CAMPAIGN_START_SCHEMA_VERSION;
  campaign_id: Track1CampaignId;
  campaign_manifest_sha256: string;
  openclaw_version: typeof TRACK1_OPENCLAW_VERSION;
  openclaw_package_integrity: string;
  model_ref: string;
  started_at: string;
}

export interface Track1CampaignSnapshotWithoutHash {
  schema_version: typeof TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION;
  campaign_id: Track1CampaignId;
  campaign_manifest_sha256: string;
  agent_id: Track1CampaignAgentId;
  scenario_id: Track1ScenarioId;
  case_id: Track1CaseId;
  attempt_id: Track1AttemptId;
  attempt_index: 1 | 2;
  sequence: number;
  previous_snapshot_sha256: string | null;
  observed_at: string;
  result: BaseResult<SandboxRunResultDetails>;
}

export interface Track1CampaignSnapshotEnvelope
  extends Track1CampaignSnapshotWithoutHash {
  snapshot_sha256: string;
}

export interface Track1CampaignSnapshotAck {
  schema_version: typeof TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION;
  campaign_id: Track1CampaignId;
  attempt_id: Track1AttemptId;
  sequence: number;
  snapshot_sha256: string;
  accepted_at: string;
}

export interface Track1CampaignFinalizeEnvelope {
  schema_version: typeof TRACK1_CAMPAIGN_FINALIZE_SCHEMA_VERSION;
  campaign_id: Track1CampaignId;
  requested_status: "completed" | "failed";
  completed_at: string;
}

export interface Track1CampaignEvidenceRegistration {
  schema_version: typeof TRACK1_CAMPAIGN_EVIDENCE_REGISTRATION_SCHEMA_VERSION;
  campaign_id: Track1CampaignId;
  artifact_manifest_sha256: string;
  artifact_manifest_ref: string;
  registered_at: string;
}
