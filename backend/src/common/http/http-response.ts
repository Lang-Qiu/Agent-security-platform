import type { ServerResponse } from "node:http";

import { createApiResponse } from "../../../../shared/contracts/api-response.ts";
import { DomainError } from "../errors/domain-error.ts";

export interface HttpResponse {
  statusCode: number;
  body: unknown;
}

export function createSuccessHttpResponse<T>(input: {
  requestId: string;
  message: string;
  data: T;
  statusCode?: number;
}): HttpResponse {
  return {
    statusCode: input.statusCode ?? 200,
    body: createApiResponse({
      message: input.message,
      data: input.data,
      request_id: input.requestId
    })
  };
}

export function createErrorHttpResponse(input: {
  requestId: string;
  error: DomainError;
}): HttpResponse {
  return {
    statusCode: input.error.statusCode,
    body: createApiResponse({
      success: false,
      message: input.error.message,
      data: null,
      error_code: input.error.code,
      request_id: input.requestId
    })
  };
}

export function writeJsonResponse(response: ServerResponse, httpResponse: HttpResponse): void {
  response.statusCode = httpResponse.statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(httpResponse.body));
}
