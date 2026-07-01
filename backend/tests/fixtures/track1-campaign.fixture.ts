import { calculateTrack1SnapshotSha256 } from "../../../shared/contracts/campaign-ingest.ts";
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
import type {
  Track1CampaignId,
  Track1CampaignStatus
} from "../../../shared/types/campaign-supervision.ts";
import type { StoredCampaignRecord } from "../src/modules/supervision/repositories/campaign.repository.ts";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const MANIFEST_SHA256 = "a".repeat(64);

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

export function makeCampaignSnapshot(
  sequence: number,
  previousHash: string | null
): Track1CampaignSnapshotEnvelope {
  const result = makeFinishedSandboxResult();
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: MANIFEST_SHA256,
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: "attempt:t1-sc-001-c001:1",
    attempt_index: 1,
    sequence,
    previous_snapshot_sha256: previousHash,
    observed_at: `2026-06-30T00:00:0${sequence}.000Z`,
    result
  };
  const snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256 };
}

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
