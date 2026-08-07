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
import type { SandboxSecurityModule } from "./modules/sandbox-security/sandbox-security.module.ts";
import type { InMemoryCampaignRepository } from "./modules/supervision/repositories/in-memory-campaign.repository.ts";
import type { TaskRepository } from "./modules/task-center/repositories/task.repository.ts";
import type {
  Track1CampaignEvidenceRegistration,
  Track1CampaignFinalizeEnvelope,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignStartEnvelope
} from "../../shared/types/campaign-ingest.ts";
import {
  SandboxSecurityHttpError,
  sandboxSecurityHttpErrorResponse,
  sandboxSecurityServiceErrorToHttpError
} from "./modules/sandbox-security/http-admission.ts";
import { isSandboxSecurityServiceError } from "./modules/sandbox-security/sandbox-security.errors.ts";

// P2-T5: Body limits measured in UTF-8 bytes.
// Lifecycle envelopes (start/finalize/evidence) are capped at 256 KiB.
// Snapshot envelopes are capped at 2 MiB.
const LIFECYCLE_BODY_LIMIT = 256 * 1024;
const SNAPSHOT_BODY_LIMIT = 2 * 1024 * 1024;

function requireJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") {
    throw new DomainError(
      "Content-Type must be application/json",
      "CAMPAIGN_INGEST_UNSUPPORTED_MEDIA_TYPE",
      415
    );
  }
  // R5 (Phase 2 rework finding 8): parse the media type strictly by splitting
  // on ";" and trimming whitespace. Do not use includes("application/json")
  // because substring matches like "text/application/json-evil" would bypass
  // the check.
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new DomainError(
      "Content-Type must be application/json",
      "CAMPAIGN_INGEST_UNSUPPORTED_MEDIA_TYPE",
      415
    );
  }
}

// R6 (Phase 2 rework finding 6): the route path campaignId must match the
// body's campaign_id for snapshot/finalize/evidence routes. Without this
// check an authorized client could write to a different campaign by using
// a different path campaignId.
function assertPathCampaignMatchesBody(
  pathCampaignId: string,
  body: unknown
): void {
  if (
    body !== null &&
    typeof body === "object" &&
    "campaign_id" in body &&
    (body as { campaign_id: unknown }).campaign_id === pathCampaignId
  ) {
    return;
  }
  throw new DomainError(
    "Path campaignId does not match body campaign_id",
    "CAMPAIGN_PATH_BODY_MISMATCH",
    400
  );
}

export class InternalAppModule {
  campaignRepository: InMemoryCampaignRepository;
  // R14 (Phase 2 rework review P1 #5): expose the configured ingest token so
  // tests can verify that createProductionServers reads TRACK1_INGEST_TOKEN
  // (not the legacy CAMPAIGN_INGEST_TOKEN) from the environment.
  readonly ingestToken: string;
  readonly sandboxSecurityModule?: SandboxSecurityModule;
  private readonly controller: CampaignIngestController;

  constructor(input: {
    campaignRepository: InMemoryCampaignRepository;
    ingestToken: string;
    taskRepository?: TaskRepository;
    sandboxSecurityModule?: SandboxSecurityModule;
  }) {
    this.campaignRepository = input.campaignRepository;
    this.ingestToken = input.ingestToken;
    this.sandboxSecurityModule = input.sandboxSecurityModule;
    const service = new CampaignIngestService(
      input.campaignRepository,
      input.taskRepository
    );
    this.controller = new CampaignIngestController(service, input.ingestToken);
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const requestId = createRequestId();

    try {
      // Match the raw request-target path. URL.pathname normalizes dot
      // segments before the exact internal route matcher can reject them.
      const requestTarget = request.url ?? "/";
      const queryIndex = requestTarget.indexOf("?");
      const pathname =
        queryIndex === -1
          ? requestTarget
          : requestTarget.slice(0, queryIndex);
      const route = matchInternalRoute(request.method, pathname);

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
          // R6 (Phase 2 rework finding 6): authorize BEFORE reading the body
          // so unauthenticated requests get 401 regardless of body shape.
          this.controller.authorize(request.headers.authorization);
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
          // R6: authorize before body read.
          this.controller.authorize(request.headers.authorization);
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, SNAPSHOT_BODY_LIMIT);
          // R6: route.params.campaignId must match body.campaign_id, otherwise
          // an authorized client could write to a different campaign by using
          // a different path campaignId.
          assertPathCampaignMatchesBody(route.params.campaignId, body);
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
          // R6: authorize before body read.
          this.controller.authorize(request.headers.authorization);
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, LIFECYCLE_BODY_LIMIT);
          // R6: route.params.campaignId must match body.campaign_id.
          assertPathCampaignMatchesBody(route.params.campaignId, body);
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
          // R6: authorize before body read.
          this.controller.authorize(request.headers.authorization);
          requireJsonContentType(request);
          const body = await readLimitedJsonBody(request, LIFECYCLE_BODY_LIMIT);
          // R6: route.params.campaignId must match body.campaign_id.
          assertPathCampaignMatchesBody(route.params.campaignId, body);
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

        case "issueSandboxSecurityCapability":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Internal server error",
              "INTERNAL_ERROR",
              500
            );
          }
          writeJsonResponse(
            response,
            await this.sandboxSecurityModule.adminController.issue(
              request,
              requestId
            ),
            request
          );
          return;

        case "revokeSandboxSecurityCapability":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Internal server error",
              "INTERNAL_ERROR",
              500
            );
          }
          writeJsonResponse(
            response,
            await this.sandboxSecurityModule.adminController.revoke(
              request,
              route.params.rawCapabilityIdSegment,
              requestId
            ),
            request
          );
          return;

        case "purgeSandboxSecurityAuditEvents":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Internal server error",
              "INTERNAL_ERROR",
              500
            );
          }
          writeJsonResponse(
            response,
            await this.sandboxSecurityModule.adminController.purge(
              request,
              requestId
            ),
            request
          );
          return;

        case "enforcementAudit":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Route not found",
              "NOT_FOUND",
              404
            );
          }
          writeJsonResponse(
            response,
            await this.sandboxSecurityModule.enforcementAuditController.enforcementAudit(
              request,
              requestId
            ),
            request
          );
          return;
      }
    } catch (error) {
      if (error instanceof SandboxSecurityHttpError) {
        writeJsonResponse(
          response,
          sandboxSecurityHttpErrorResponse(error, requestId),
          request
        );
        return;
      }
      if (isSandboxSecurityServiceError(error)) {
        const httpError = sandboxSecurityServiceErrorToHttpError(error);
        writeJsonResponse(
          response,
          sandboxSecurityHttpErrorResponse(httpError, requestId),
          request
        );
        return;
      }
      const domainError =
        error instanceof DomainError
          ? error
          : new DomainError("Internal server error", "INTERNAL_ERROR", 500);

      writeJsonResponse(response, createErrorHttpResponse({ requestId, error: domainError }));
    }
  }
}
