import { createApiResponse } from "../../../../shared/contracts/api-response.ts";
import type { ApiResponse } from "../../../../shared/types/api-response.ts";
import type {
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail
} from "../../../../shared/types/supervision.ts";
import type { SupervisionService } from "./supervision.service.ts";
import { normalizeSupervisionQuery } from "./dto/supervision-query.ts";

export class SupervisionController {
  private readonly service: SupervisionService;

  constructor(service: SupervisionService) {
    this.service = service;
  }

  listSessions(
    searchParams: URLSearchParams,
    requestId: string
  ): ApiResponse<SandboxSupervisionOverview> {
    const query = normalizeSupervisionQuery(searchParams);
    const data = this.service.listSessions(query);
    return createApiResponse({
      message: "Supervision sessions fetched successfully",
      data,
      request_id: requestId
    });
  }

  getSessionDetail(
    sessionId: string,
    requestId: string
  ): ApiResponse<SandboxSupervisionSessionDetail> {
    const data = this.service.getSessionDetail(sessionId);
    return createApiResponse({
      message: "Supervision session detail fetched successfully",
      data,
      request_id: requestId
    });
  }

  getSessionEvidence(
    sessionId: string,
    requestId: string
  ): ApiResponse<SandboxSupervisionEvidenceExport> {
    const data = this.service.getSessionEvidence(sessionId);
    return createApiResponse({
      message: "Supervision evidence fetched successfully",
      data,
      request_id: requestId
    });
  }
}
