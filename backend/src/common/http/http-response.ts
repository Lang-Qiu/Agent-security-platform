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

export function acceptsEventStream(request: IncomingMessage): boolean {
  const raw = request.headers.accept;
  const values: string[] = Array.isArray(raw)
    ? raw
    : raw === undefined
      ? []
      : [raw];
  return values.some((value) =>
    value
      .split(",")
      .some((part) => part.split(";", 1)[0]?.trim().toLowerCase() === "text/event-stream")
  );
}

function canWriteStream(response: ServerResponse): boolean {
  return !response.writableEnded && !response.destroyed && response.writable !== false;
}

export function writeServerSentEvent(
  response: ServerResponse,
  eventName: "stage" | "decision" | "error",
  data: unknown
): void {
  if (!canWriteStream(response)) return;
  if (!response.headersSent) {
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("x-accel-buffering", "no");
  }
  response.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function endServerSentEvents(response: ServerResponse): void {
  if (canWriteStream(response)) response.end();
}
