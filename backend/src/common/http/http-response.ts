import type { IncomingMessage, ServerResponse } from "node:http";

import { createApiResponse } from "../../../../shared/contracts/api-response.ts";
import { DomainError } from "../errors/domain-error.ts";

export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
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

function isWritableResponse(
  response: ServerResponse,
  request?: IncomingMessage
): boolean {
  const requestReadableEnded =
    request !== undefined &&
    (request as IncomingMessage & { readableEnded?: boolean }).readableEnded === true;
  const normalRequestEof =
    request !== undefined &&
    request.destroyed === true &&
    request.complete === true &&
    requestReadableEnded &&
    request.socket?.destroyed !== true;
  if (
    response.writableEnded ||
    response.destroyed ||
    response.writable === false ||
    response.headersSent ||
    request?.aborted === true ||
    request?.socket?.destroyed === true ||
    (request?.destroyed === true && !normalRequestEof)
  ) {
    return false;
  }
  return true;
}

function installCloseAfterFinish(
  response: ServerResponse,
  request: IncomingMessage | undefined
): void {
  if (request === undefined) return;
  let destroyed = false;
  const destroyAfterFinish = () => {
    if (destroyed) return;
    destroyed = true;
    if (!request.destroyed) request.destroy();
    const socket = request.socket;
    if (socket !== undefined && !socket.destroyed) socket.destroy();
  };
  if (typeof response.once === "function") {
    response.once("finish", destroyAfterFinish);
  } else if (typeof response.on === "function") {
    response.on("finish", destroyAfterFinish);
  }
}

function hasConnectionCloseHeader(httpResponse: HttpResponse): boolean {
  return Object.entries(httpResponse.headers ?? {}).some(
    ([name, value]) =>
      name.toLowerCase() === "connection" &&
      value.trim().toLowerCase() === "close"
  );
}

export function writeJsonResponse(
  response: ServerResponse,
  httpResponse: HttpResponse,
  request?: IncomingMessage
): void {
  if (!isWritableResponse(response, request)) return;
  if (
    httpResponse.statusCode === 408 ||
    httpResponse.statusCode === 413 ||
    hasConnectionCloseHeader(httpResponse)
  ) {
    installCloseAfterFinish(response, request);
  }
  response.statusCode = httpResponse.statusCode;
  for (const [name, value] of Object.entries(httpResponse.headers ?? {})) {
    response.setHeader(name, value);
  }
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(httpResponse.body));
}
