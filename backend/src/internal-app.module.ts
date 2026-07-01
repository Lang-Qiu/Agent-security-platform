import type { IncomingMessage, ServerResponse } from "node:http";

import { DomainError } from "./common/errors/domain-error.ts";
import {
  createErrorHttpResponse,
  createSuccessHttpResponse,
  writeJsonResponse
} from "./common/http/http-response.ts";
import { matchInternalRoute } from "./common/http/internal-router.ts";
import { readLimitedJsonBody } from "./common/http/limited-json-body.ts";
import { createRequestId } from "./common/http/request-id.ts";
import { CampaignIngestController } from "./modules/supervision/campaign-ingest.controller.ts";
import { CampaignIngestService } from "./modules/supervision/campaign-ingest.service.ts";
import type { InMemoryCampaignRepository } from "./modules/supervision/repositories/in-memory-campaign.repository.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignStartEnvelope
} from "../../shared/types/campaign-ingest.ts";

// P2-T5: Body limits measured in UTF-8 bytes.
// Lifecycle envelopes (start/finalize/evidence) are capped at 256 KiB.
// Snapshot envelopes are capped at 2 MiB.
const LIFECYCLE_BODY_LIMIT = 256 * 1024;
const SNAPSHOT_BODY_LIMIT = 2 * 1024 * 1024;

function requireJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    throw new DomainError(
      "Content-Type must be application/json",
      "CAMPAIGN_INGEST_UNSUPPORTED_MEDIA_TYPE",
      415
    );
  }
}

export class InternalAppModule {
  campaignRepository: InMemoryCampaignRepository;
  private readonly controller: CampaignIngestController;

  constructor(input: {
    campaignRepository: InMemoryCampaignRepository;
    ingestToken: string;
  }) {
    this.campaignRepository = input.campaignRepository;
    const service = new CampaignIngestService(input.campaignRepository);
    this.controller = new CampaignIngestController(service, input.ingestToken);
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const requestId = createRequestId();

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const route = matchInternalRoute(request.method, url.pathname);

      if (!route) {
        throw new DomainError("Route not found", "NOT_FOUND", 404);
      }

      switch (route.name) {
        case "internalHealth":
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Internal service is healthy",
              data: { status: "ok" }
            })
          );
          return;

        case "startCampaign": {
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, LIFECYCLE_BODY_LIMIT);
          const result = this.controller.startCampaign(
            request.headers.authorization,
            body as Track1CampaignStartEnvelope
          );
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Campaign started",
              data: result,
              statusCode: 201
            })
          );
          return;
        }

        case "ingestSnapshot": {
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, SNAPSHOT_BODY_LIMIT);
          const result = this.controller.ingestSnapshot(
            request.headers.authorization,
            body as Track1CampaignSnapshotEnvelope
          );
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Snapshot ingested",
              data: result
            })
          );
          return;
        }

        case "finalizeCampaign": {
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, LIFECYCLE_BODY_LIMIT);
          const result = this.controller.finalizeCampaign(
            request.headers.authorization,
            body as Track1CampaignFinalizeEnvelope
          );
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Campaign finalized",
              data: result
            })
          );
          return;
        }

        case "registerEvidence": {
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, LIFECYCLE_BODY_LIMIT);
          const result = this.controller.registerEvidence(
            request.headers.authorization,
            body as Track1CampaignEvidenceRegistration
          );
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Evidence registered",
              data: result
            })
          );
          return;
        }
      }
    } catch (error) {
      const domainError =
        error instanceof DomainError
          ? error
          : new DomainError("Internal server error", "INTERNAL_ERROR", 500);

      writeJsonResponse(
        response,
        createErrorHttpResponse({ requestId, error: domainError })
      );
    }
  }
}
