import { DomainError } from "../../../common/errors/domain-error.ts";
import type {
  CampaignRepository,
  StoredCampaignRecord
} from "./campaign.repository.ts";

// P2-T1: Defensive in-memory campaign repository.
// All returned records are deep-cloned so callers cannot mutate stored state.
// Input records are never frozen — callers retain full ownership of their objects.
// structuredClone is used instead of JSON.parse(JSON.stringify(...)) because
// JSON serialization silently coerces Date, undefined, and other non-JSON types.
export class InMemoryCampaignRepository implements CampaignRepository {
  private records: Map<string, StoredCampaignRecord>;

  constructor() {
    this.records = new Map<string, StoredCampaignRecord>();
  }

  create(record: StoredCampaignRecord): StoredCampaignRecord {
    const campaignId = record.campaign.campaign_id;
    if (this.records.has(campaignId)) {
      throw new DomainError(
        `Campaign already exists: ${campaignId}`,
        "CAMPAIGN_ALREADY_EXISTS",
        409
      );
    }
    const cloned = this.cloneStoredCampaignRecord(record);
    this.records.set(campaignId, cloned);
    return this.cloneStoredCampaignRecord(cloned);
  }

  save(record: StoredCampaignRecord): StoredCampaignRecord {
    const campaignId = record.campaign.campaign_id;
    const cloned = this.cloneStoredCampaignRecord(record);
    this.records.set(campaignId, cloned);
    return this.cloneStoredCampaignRecord(cloned);
  }

  findById(campaignId: string): StoredCampaignRecord | null {
    const record = this.records.get(campaignId);
    if (!record) return null;
    return this.cloneStoredCampaignRecord(record);
  }

  list(): StoredCampaignRecord[] {
    const records = Array.from(this.records.values());
    return records
      .map((record) => this.cloneStoredCampaignRecord(record))
      .sort((a, b) => {
        // Sort by updated_at descending (newest first).
        if (a.campaign.updated_at > b.campaign.updated_at) return -1;
        if (a.campaign.updated_at < b.campaign.updated_at) return 1;
        // Tie-break by campaign_id ascending.
        if (a.campaign.campaign_id < b.campaign.campaign_id) return -1;
        if (a.campaign.campaign_id > b.campaign.campaign_id) return 1;
        return 0;
      });
  }

  private cloneStoredCampaignRecord(record: StoredCampaignRecord): StoredCampaignRecord {
    return structuredClone(record);
  }
}
