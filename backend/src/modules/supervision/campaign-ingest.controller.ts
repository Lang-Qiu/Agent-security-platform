import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignStartEnvelope
} from "../../../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignAttemptSummary,
  Track1CampaignSummary
} from "../../../../shared/types/campaign-supervision.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import { authorizeCampaignIngest } from "./campaign-ingest-auth.ts";

// Minimum token length to prevent accidentally weak ingest tokens.
const MIN_TOKEN_LENGTH = 32;

// Controller-facing service shape. The controller never imports the concrete
// service — it only depends on the methods it delegates to.
export interface CampaignIngestServiceLike {
  startCampaign(input: Track1CampaignStartEnvelope): Track1CampaignSummary;
  ingestSnapshot(
    input: Track1CampaignSnapshotEnvelope
  ): Track1CampaignAttemptSummary;
  finalizeCampaign(
    input: Track1CampaignFinalizeEnvelope
  ): Track1CampaignSummary;
  registerEvidence(
    input: Track1CampaignEvidenceRegistration
  ): Track1CampaignSummary;
  getStoredCampaign(campaignId: string): unknown;
}

export class CampaignIngestController {
  private readonly service: CampaignIngestServiceLike;
  private readonly expectedToken: string;

  constructor(service: CampaignIngestServiceLike, expectedToken: string) {
    if (
      typeof expectedToken !== "string" ||
      expectedToken.length < MIN_TOKEN_LENGTH
    ) {
      throw new DomainError(
        "Campaign ingest token must be at least 32 characters",
        "CAMPAIGN_INGEST_TOKEN_INVALID",
        500
      );
    }
    this.service = service;
    this.expectedToken = expectedToken;
  }

  startCampaign(
    authorization: string | undefined,
    input: Track1CampaignStartEnvelope
  ): Track1CampaignSummary {
    authorizeCampaignIngest(authorization, this.expectedToken);
    return this.service.startCampaign(input);
  }

  ingestSnapshot(
    authorization: string | undefined,
    input: Track1CampaignSnapshotEnvelope
  ): Track1CampaignAttemptSummary {
    authorizeCampaignIngest(authorization, this.expectedToken);
    return this.service.ingestSnapshot(input);
  }

  finalizeCampaign(
    authorization: string | undefined,
    input: Track1CampaignFinalizeEnvelope
  ): Track1CampaignSummary {
    authorizeCampaignIngest(authorization, this.expectedToken);
    return this.service.finalizeCampaign(input);
  }

  registerEvidence(
    authorization: string | undefined,
    input: Track1CampaignEvidenceRegistration
  ): Track1CampaignSummary {
    authorizeCampaignIngest(authorization, this.expectedToken);
    return this.service.registerEvidence(input);
  }
}
