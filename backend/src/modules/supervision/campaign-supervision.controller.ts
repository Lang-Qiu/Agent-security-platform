import { createApiResponse } from "../../../../shared/contracts/api-response.ts";
import type { ApiResponse } from "../../../../shared/types/api-response.ts";
import type {
  Track1CampaignDetail,
  Track1CampaignEvidenceExport,
  Track1CampaignSummary
} from "../../../../shared/types/campaign-supervision.ts";
import type { CampaignSupervisionService } from "./campaign-supervision.service.ts";
import { normalizeCampaignQuery } from "./dto/campaign-query.ts";
import type { CampaignQuery } from "./dto/campaign-query.ts";

// P2-T7: Public read API controller for campaign supervision.
// Mirrors the supervision controller pattern: validate query, delegate to
// service, wrap in ApiResponse. No raw content ever leaves the service.
export class CampaignSupervisionController {
  private readonly service: CampaignSupervisionService;

  constructor(service: CampaignSupervisionService) {
    this.service = service;
  }

  listCampaigns(
    searchParams: URLSearchParams,
    requestId: string
  ): ApiResponse<Track1CampaignSummary[]> {
    const query: CampaignQuery = normalizeCampaignQuery(searchParams);
    const data = this.service.listCampaigns(query);
    return createApiResponse({
      message: "Campaigns fetched successfully",
      data,
      request_id: requestId
    });
  }

  getCampaignDetail(
    campaignId: string,
    requestId: string
  ): ApiResponse<Track1CampaignDetail> {
    const data = this.service.getCampaignDetail(campaignId);
    return createApiResponse({
      message: "Campaign detail fetched successfully",
      data,
      request_id: requestId
    });
  }

  getCampaignEvidence(
    campaignId: string,
    requestId: string
  ): ApiResponse<Track1CampaignEvidenceExport> {
    const data = this.service.getCampaignEvidence(campaignId);
    return createApiResponse({
      message: "Campaign evidence fetched successfully",
      data,
      request_id: requestId
    });
  }
}
