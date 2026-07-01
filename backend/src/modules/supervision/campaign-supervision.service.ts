import { DomainError } from "../../common/errors/domain-error.ts";
import type { CampaignRepository } from "./repositories/campaign.repository.ts";
import {
  projectTrack1Campaign,
  type ProjectedCampaign
} from "./campaign-projector.ts";
import type { CampaignQuery } from "./dto/campaign-query.ts";
import type {
  Track1CampaignDetail,
  Track1CampaignEvidenceExport,
  Track1CampaignSummary
} from "../../../../../shared/types/campaign-supervision.ts";

// P2-T6: Campaign supervision query service.
// Mirrors the supervision service pattern: project all records, filter, sort,
// and cap. List cap is 50 (distinct from supervision's 100).
const ROW_LIMIT = 50;

function notFound(campaignId: string): DomainError {
  return new DomainError(
    `Campaign not found: ${campaignId}`,
    "CAMPAIGN_NOT_FOUND",
    404
  );
}

function evidenceNotReady(campaignId: string): DomainError {
  return new DomainError(
    `Evidence not ready for campaign: ${campaignId}`,
    "CAMPAIGN_EVIDENCE_NOT_READY",
    409
  );
}

function matchesFilters(
  projection: ProjectedCampaign,
  query: CampaignQuery
): boolean {
  if (query.q) {
    const needle = query.q.toLowerCase();
    if (!projection.summary.campaign_id.toLowerCase().includes(needle)) {
      return false;
    }
  }
  if (query.status && projection.summary.status !== query.status) return false;
  if (query.scenario_id) {
    const hasScenario = projection.detail.agents.some(
      (a) => a.scenario_id === query.scenario_id
    );
    if (!hasScenario) return false;
  }
  if (query.agent_id) {
    const hasAgent = projection.detail.agents.some(
      (a) => a.agent_id === query.agent_id
    );
    if (!hasAgent) return false;
  }
  return true;
}

export class CampaignSupervisionService {
  private readonly repository: CampaignRepository;

  constructor(repository: CampaignRepository) {
    this.repository = repository;
  }

  private projectAll(): ProjectedCampaign[] {
    const records = this.repository.list();
    return records.map((record) => projectTrack1Campaign(record));
  }

  listCampaigns(query: CampaignQuery): Track1CampaignSummary[] {
    const projections = this.projectAll();
    const filtered = projections.filter((p) => matchesFilters(p, query));
    const sorted = [...filtered].sort((a, b) => {
      // Sort by updated_at desc (newest first), then campaign_id asc.
      if (a.summary.updated_at !== b.summary.updated_at) {
        return a.summary.updated_at > b.summary.updated_at ? -1 : 1;
      }
      return a.summary.campaign_id < b.summary.campaign_id ? -1 : 1;
    });
    return sorted.slice(0, ROW_LIMIT).map((p) => p.summary);
  }

  private findCampaign(campaignId: string): ProjectedCampaign {
    const record = this.repository.findById(campaignId);
    if (!record) {
      throw notFound(campaignId);
    }
    return projectTrack1Campaign(record);
  }

  getCampaignDetail(campaignId: string): Track1CampaignDetail {
    const projection = this.findCampaign(campaignId);
    return projection.detail;
  }

  getCampaignEvidence(campaignId: string): Track1CampaignEvidenceExport {
    const projection = this.findCampaign(campaignId);
    if (!projection.evidence) {
      throw evidenceNotReady(campaignId);
    }
    return projection.evidence;
  }
}
