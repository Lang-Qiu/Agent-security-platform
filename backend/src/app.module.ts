import type { IncomingMessage, ServerResponse } from "node:http";

import { DomainError } from "./common/errors/domain-error.ts";
import { readJsonBody } from "./common/http/json-body.ts";
import { createErrorHttpResponse, createSuccessHttpResponse, writeJsonResponse } from "./common/http/http-response.ts";
import { createRequestId } from "./common/http/request-id.ts";
import { matchRoute } from "./common/http/router.ts";
import { createTaskCenterModule } from "./modules/task-center/task-center.module.ts";
import { createSupervisionModule } from "./modules/supervision/supervision.module.ts";
import {
  createRuntimeDependencies,
  type RuntimeDependencies
} from "./runtime-dependencies.ts";

export class AppModule {
  taskCenterModule: ReturnType<typeof createTaskCenterModule>;
  supervisionModule: ReturnType<typeof createSupervisionModule>;

  constructor(dependencies?: RuntimeDependencies) {
    const runtime = dependencies ?? createRuntimeDependencies();
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
      }
    } catch (error) {
      const domainError =
        error instanceof DomainError
          ? error
          : new DomainError("Internal server error", "INTERNAL_ERROR", 500);

      writeJsonResponse(
        response,
        createErrorHttpResponse({
          requestId,
          error: domainError
        })
      );
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
}

export function createAppModule(dependencies?: RuntimeDependencies): AppModule {
  return new AppModule(dependencies);
}
