import type { IncomingMessage, ServerResponse } from "node:http";

import { DomainError } from "./common/errors/domain-error.ts";
import { readJsonBody } from "./common/http/json-body.ts";
import {
  acceptsEventStream,
  createErrorHttpResponse,
  createSuccessHttpResponse,
  endServerSentEvents,
  writeJsonResponse,
  writeServerSentEvent
} from "./common/http/http-response.ts";
import { normalizeSandboxSecurityEvaluationStreamEvent } from "../../shared/contracts/sandbox-security-api.ts";
import { createRequestId } from "./common/http/request-id.ts";
import { matchRoute } from "./common/http/router.ts";
import { createTaskCenterModule } from "./modules/task-center/task-center.module.ts";
import { createSupervisionModule } from "./modules/supervision/supervision.module.ts";
import type { SandboxSecurityModule } from "./modules/sandbox-security/sandbox-security.module.ts";
import {
  createRuntimeDependencies,
  type RuntimeDependencies
} from "./runtime-dependencies.ts";
import {
  SandboxSecurityHttpError,
  sandboxSecurityHttpErrorResponse,
  sandboxSecurityServiceErrorToHttpError
} from "./modules/sandbox-security/http-admission.ts";
import { isSandboxSecurityServiceError } from "./modules/sandbox-security/sandbox-security.errors.ts";

export class AppModule {
  taskCenterModule: ReturnType<typeof createTaskCenterModule>;
  supervisionModule: ReturnType<typeof createSupervisionModule>;
  readonly sandboxSecurityModule?: SandboxSecurityModule;

  constructor(
    dependencies?: RuntimeDependencies,
    sandboxSecurityModule?: SandboxSecurityModule
  ) {
    const runtime = dependencies ?? createRuntimeDependencies();
    this.sandboxSecurityModule = sandboxSecurityModule;
    this.taskCenterModule = createTaskCenterModule({
      repository: runtime.taskRepository
    });
    this.supervisionModule = createSupervisionModule({
      taskRepository: runtime.taskRepository,
      campaignRepository: runtime.campaignRepository
    });
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestId = createRequestId();
    let evaluationStream = false;
    let evaluationRequestId = requestId;

    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const route = matchRoute(request.method, url.pathname);

      if (!route) {
        throw new DomainError("Route not found", "NOT_FOUND", 404);
      }

      switch (route.name) {
        case "health":
          writeJsonResponse(
            response,
            createSuccessHttpResponse({
              requestId,
              message: "Service is healthy",
              data: {
                status: "ok"
              }
            })
          );
          return;
        case "createTask":
          writeJsonResponse(response, await this.taskCenterModule.controller.createTask(await readJsonBody(request), requestId));
          return;
        case "listTasks":
          writeJsonResponse(response, this.taskCenterModule.controller.listTasks(requestId));
          return;
        case "getTask":
          writeJsonResponse(response, this.taskCenterModule.controller.getTaskById(route.params.taskId, requestId));
          return;
        case "getTaskResult":
          writeJsonResponse(response, this.taskCenterModule.controller.getTaskResult(route.params.taskId, requestId));
          return;
        case "getRiskSummary":
          writeJsonResponse(response, this.taskCenterModule.controller.getRiskSummary(route.params.taskId, requestId));
          return;
        case "evaluateSandboxSecurity":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Internal server error",
              "INTERNAL_ERROR",
              500
            );
          }
          evaluationStream = acceptsEventStream(request);
          if (!evaluationStream) {
            writeJsonResponse(
              response,
              await this.sandboxSecurityModule.publicController.evaluate(
                request,
                requestId
              ),
              request
            );
            return;
          }
          {
            const abortController = new AbortController();
            const abortOnDisconnect = () => {
              if (!response.writableEnded) abortController.abort();
            };
            request.once("aborted", abortOnDisconnect);
            response.once("close", abortOnDisconnect);
            let delivery: "live" | "replayed" = "live";
            await this.sandboxSecurityModule.publicController.evaluate(
              request,
              requestId,
              {
                signal: abortController.signal,
                on_stage: (event) => {
                  evaluationRequestId = event.request_id;
                  delivery = event.delivery;
                  writeServerSentEvent(response, "stage", event);
                },
                on_decision: (decision) => {
                  evaluationRequestId = decision.request_id;
                  const event = normalizeSandboxSecurityEvaluationStreamEvent({
                    schema_version: "sandbox-security-evaluation-stream.v1",
                    event_type: "decision",
                    request_id: decision.request_id,
                    sequence: 5,
                    stage: "decision",
                    delivery,
                    decision
                  });
                  if (event === null || event.event_type !== "decision") {
                    throw new Error("sandbox_security_stream_decision_invalid");
                  }
                  writeServerSentEvent(response, "decision", event);
                }
              }
            );
            endServerSentEvents(response);
          }
          return;
        case "listSandboxSecurityAuditEvents":
          if (!this.sandboxSecurityModule) {
            throw new DomainError(
              "Internal server error",
              "INTERNAL_ERROR",
              500
            );
          }
          writeJsonResponse(
            response,
            await this.sandboxSecurityModule.publicController.listAuditEvents(
              request,
              url,
              requestId
            ),
            request
          );
          return;
        case "listSupervisionSessions": {
          const httpResponse = this.supervisionModule.controller.listSessions(
            url.searchParams,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
        case "getSupervisionSession": {
          const sessionId = this.decodeSessionId(route.params.sessionId);
          const httpResponse = this.supervisionModule.controller.getSessionDetail(
            sessionId,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
        case "getSupervisionEvidence": {
          const sessionId = this.decodeSessionId(route.params.sessionId);
          const httpResponse = this.supervisionModule.controller.getSessionEvidence(
            sessionId,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
        case "listCampaigns": {
          const httpResponse = this.supervisionModule.campaignSupervisionController.listCampaigns(
            url.searchParams,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
        case "getCampaignDetail": {
          const campaignId = this.decodeCampaignId(route.params.campaignId);
          const httpResponse = this.supervisionModule.campaignSupervisionController.getCampaignDetail(
            campaignId,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
        case "getCampaignEvidence": {
          const campaignId = this.decodeCampaignId(route.params.campaignId);
          const httpResponse = this.supervisionModule.campaignSupervisionController.getCampaignEvidence(
            campaignId,
            requestId
          );
          writeJsonResponse(response, { statusCode: 200, body: httpResponse });
          return;
        }
      }
    } catch (error) {
      if (evaluationStream && response.headersSent) {
        const code =
          error instanceof SandboxSecurityHttpError
            ? error.code
            : isSandboxSecurityServiceError(error)
              ? error.code
              : "SANDBOX_SECURITY_INTERNAL_ERROR";
        const event = normalizeSandboxSecurityEvaluationStreamEvent({
          schema_version: "sandbox-security-evaluation-stream.v1",
          event_type: "error",
          request_id: evaluationRequestId,
          error_code: code,
          retryable:
            code === "SANDBOX_SECURITY_INTERNAL_ERROR" ||
            code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE" ||
            code === "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
        });
        if (event !== null && event.event_type === "error") {
          writeServerSentEvent(response, "error", event);
        }
        endServerSentEvents(response);
        return;
      }
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

  private decodeSessionId(raw: string): string {
    try {
      return decodeURIComponent(raw);
    } catch {
      throw new DomainError(
        `Malformed session id encoding: ${raw}`,
        "INVALID_SUPERVISION_QUERY",
        400
      );
    }
  }

  private decodeCampaignId(raw: string): string {
    try {
      return decodeURIComponent(raw);
    } catch {
      throw new DomainError(
        `Malformed campaign id encoding: ${raw}`,
        "INVALID_CAMPAIGN_QUERY",
        400
      );
    }
  }
}

export function createAppModule(
  dependencies?: RuntimeDependencies,
  sandboxSecurityModule?: SandboxSecurityModule
): AppModule {
  return new AppModule(dependencies, sandboxSecurityModule);
}
