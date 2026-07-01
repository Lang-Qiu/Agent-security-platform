import type { BaseResult, SandboxRunResultDetails } from "../../../../../shared/types/result.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignStartEnvelope,
  Track1CampaignSnapshotEnvelope
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

export interface StoredCampaignRecord {
  campaign: {
    campaign_id: Track1CampaignId;
    start: Track1CampaignStartEnvelope;
    status: Track1CampaignStatus;
    updated_at: string;
    completed_at?: string;
  };
  snapshots: readonly Track1CampaignSnapshotEnvelope[];
  attempts: readonly StoredCampaignAttempt[];
  evidence: Track1CampaignEvidenceRegistration | null;
}

export interface CampaignRepository {
  create(record: StoredCampaignRecord): StoredCampaignRecord;
  save(record: StoredCampaignRecord): StoredCampaignRecord;
  findById(campaignId: string): StoredCampaignRecord | null;
  list(): StoredCampaignRecord[];
}
