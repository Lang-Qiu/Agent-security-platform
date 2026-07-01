import type { BaseResult, SandboxRunResultDetails } from "../../../../../shared/types/result.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignStartEnvelope
} from "../../../../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignAgentId,
  Track1CampaignAttemptStatus,
  Track1CampaignId,
  Track1CampaignStatus,
  Track1CaseId,
  Track1ScenarioId,
  Track1AttemptId,
  Track1SessionId,
  Track1TaskId
} from "../../../../../shared/types/campaign-supervision.ts";

// P2-T1: Stored attempt contains only fixed association IDs, attempt/session IDs,
// status, snapshot head, and normalized terminal result. No raw content field and
// no caller-supplied aggregate counter.
export interface StoredCampaignAttempt {
  campaign_id: Track1CampaignId;
  agent_id: Track1CampaignAgentId;
  scenario_id: Track1ScenarioId;
  case_id: Track1CaseId;
  attempt_id: Track1AttemptId;
  attempt_index: 1 | 2;
  session_id: Track1SessionId;
  task_id: Track1TaskId;
  status: Track1CampaignAttemptStatus;
  snapshot_head: string;
  result: BaseResult<SandboxRunResultDetails>;
}

// R11 (Phase 2 rework review P1 #2): a closed snapshot receipt stored in the
// campaign record. It carries ONLY structural IDs, hashes, and timestamps —
// never the raw result content (summary, metadata, target, events, etc.).
// The full projected result lives on StoredCampaignAttempt.result.
export interface StoredCampaignSnapshotReceipt {
  schema_version: string;
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
  snapshot_sha256: string;
  result_task_id: Track1TaskId;
  result_session_id: Track1SessionId;
  result_status: string;
}

export interface StoredCampaignRecord {
  campaign: {
    campaign_id: Track1CampaignId;
    start: Track1CampaignStartEnvelope;
    status: Track1CampaignStatus;
    updated_at: string;
    completed_at?: string;
  };
  snapshots: readonly StoredCampaignSnapshotReceipt[];
  attempts: readonly StoredCampaignAttempt[];
  evidence: Track1CampaignEvidenceRegistration | null;
}

export interface CampaignRepository {
  create(record: StoredCampaignRecord): StoredCampaignRecord;
  save(record: StoredCampaignRecord): StoredCampaignRecord;
  findById(campaignId: string): StoredCampaignRecord | null;
  list(): StoredCampaignRecord[];
}
