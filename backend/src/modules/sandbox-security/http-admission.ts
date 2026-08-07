import type { IncomingMessage } from "node:http";
import { TextDecoder } from "node:util";

import { DomainError } from "../../common/errors/domain-error.ts";
import type { HttpResponse } from "../../common/http/http-response.ts";
import { createApiResponse } from "../../../../shared/contracts/api-response.ts";
import {
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "./sandbox-security.errors.ts";

export type SandboxSecurityHttpErrorCode =
  | "SANDBOX_SECURITY_INVALID_REQUEST"
  | "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID"
  | "SANDBOX_SECURITY_UNAUTHORIZED"
  | "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
  | "SANDBOX_SECURITY_FORBIDDEN"
  | "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
  | "SANDBOX_SECURITY_REQUEST_TIMEOUT"
  | "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT"
  | "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS"
  | "SANDBOX_SECURITY_BODY_TOO_LARGE"
  | "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"
  | "SANDBOX_SECURITY_RATE_LIMITED"
  | "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
  | "SANDBOX_SECURITY_INTERNAL_ERROR"
  | "SANDBOX_SECURITY_STORAGE_UNAVAILABLE";

type SandboxSecurityHttpStatus =
  | 400
  | 401
  | 403
  | 404
  | 408
  | 409
  | 413
  | 415
  | 429
  | 500
  | 503;

const CAPABILITY_TOKEN_PATTERN = /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const CONTENT_LENGTH_PATTERN = /^(0|[1-9][0-9]*)$/;
const AUDIT_LIMIT_PATTERN = /^[1-9][0-9]{0,2}$/;
const MAX_JSON_NESTING = 128;

export const SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_LIMIT = 65536 as const;
export const SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_DEADLINE_MS = 5000 as const;

const HTTP_MESSAGES: Readonly<Record<SandboxSecurityHttpErrorCode, string>> = {
  SANDBOX_SECURITY_INVALID_REQUEST: "Invalid sandbox security request",
  SANDBOX_SECURITY_AUDIT_CURSOR_INVALID: "Invalid sandbox security audit cursor",
  SANDBOX_SECURITY_UNAUTHORIZED: "Unauthorized",
  SANDBOX_SECURITY_ADMIN_UNAUTHORIZED: "Administrator unauthorized",
  SANDBOX_SECURITY_FORBIDDEN: "Forbidden",
  SANDBOX_SECURITY_CAPABILITY_NOT_FOUND: "Sandbox security capability not found",
  SANDBOX_SECURITY_REQUEST_TIMEOUT: "Sandbox security request timed out",
  SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT: "Sandbox security idempotency conflict",
  SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS: "Sandbox security request is in progress",
  SANDBOX_SECURITY_BODY_TOO_LARGE: "Sandbox security request body is too large",
  SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE: "Sandbox security media type is unsupported",
  SANDBOX_SECURITY_RATE_LIMITED: "Sandbox security rate limit exceeded",
  SANDBOX_SECURITY_CONCURRENCY_LIMITED: "Sandbox security concurrency limit exceeded",
  SANDBOX_SECURITY_INTERNAL_ERROR: "Internal server error",
  SANDBOX_SECURITY_STORAGE_UNAVAILABLE: "Sandbox security storage is unavailable"
};

export class SandboxSecurityHttpError extends DomainError {
  declare readonly statusCode: SandboxSecurityHttpStatus;
  declare readonly code: SandboxSecurityHttpErrorCode;
  readonly retry_after_seconds?: number;
  readonly close_after_response: boolean;

  constructor(input: Readonly<{
    code: SandboxSecurityHttpErrorCode;
    statusCode: SandboxSecurityHttpStatus;
    message?: string;
    retry_after_seconds?: number;
    close_after_response?: boolean;
  }>) {
    super(
      input.message ?? HTTP_MESSAGES[input.code],
      input.code,
      input.statusCode
    );
    this.name = "SandboxSecurityHttpError";
    this.code = input.code;
    this.statusCode = input.statusCode;
    if (input.retry_after_seconds !== undefined) {
      this.retry_after_seconds = input.retry_after_seconds;
    }
    this.close_after_response =
      input.close_after_response === true ||
      input.statusCode === 408 ||
      input.statusCode === 413;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function httpError(input: Readonly<{
  code: SandboxSecurityHttpErrorCode;
  statusCode: SandboxSecurityHttpStatus;
  retry_after_seconds?: number;
  close_after_response?: boolean;
}>): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError(input);
}

function invalidRequest(): SandboxSecurityHttpError {
  return httpError({
    code: "SANDBOX_SECURITY_INVALID_REQUEST",
    statusCode: 400
  });
}

function rejectDuplicateJsonKeys(input: string): void {
  let cursor = 0;

  const skipWhitespace = (): void => {
    while (
      cursor < input.length &&
      (input[cursor] === " " || input[cursor] === "\t" ||
        input[cursor] === "\n" || input[cursor] === "\r")
    ) {
      cursor += 1;
    }
  };

  const readString = (): string => {
    const start = cursor;
    if (input[cursor] !== '"') throw invalidRequest();
    cursor += 1;
    while (cursor < input.length) {
      const character = input[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          const value = JSON.parse(input.slice(start, cursor));
          if (typeof value !== "string") throw invalidRequest();
          return value;
        } catch {
          throw invalidRequest();
        }
      }
      if (character === "\\") {
        cursor += 1;
        if (cursor >= input.length) throw invalidRequest();
        if (input[cursor] === "u") {
          cursor += 1;
          if (cursor + 4 > input.length) throw invalidRequest();
          for (let index = 0; index < 4; index += 1) {
            if (!/[0-9A-Fa-f]/.test(input[cursor + index] ?? "")) {
              throw invalidRequest();
            }
          }
          cursor += 4;
        } else if ('"\\/bfnrt'.includes(input[cursor] ?? "")) {
          cursor += 1;
        } else {
          throw invalidRequest();
        }
        continue;
      }
      if (character.charCodeAt(0) < 0x20) throw invalidRequest();
      cursor += 1;
    }
    throw invalidRequest();
  };

  const readPrimitive = (): void => {
    const start = cursor;
    while (
      cursor < input.length &&
      ![" ", "\t", "\n", "\r", ",", "]", "}"].includes(input[cursor] ?? "")
    ) {
      cursor += 1;
    }
    if (cursor === start) throw invalidRequest();
  };

  const readValue = (depth: number): void => {
    if (depth > MAX_JSON_NESTING) throw invalidRequest();
    skipWhitespace();
    const character = input[cursor];
    if (character === "{") {
      cursor += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (input[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (true) {
        const key = readString();
        if (keys.has(key)) throw invalidRequest();
        keys.add(key);
        skipWhitespace();
        if (input[cursor] !== ":") throw invalidRequest();
        cursor += 1;
        readValue(depth + 1);
        skipWhitespace();
        if (input[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (input[cursor] !== ",") throw invalidRequest();
        cursor += 1;
        skipWhitespace();
      }
    }
    if (character === "[") {
      cursor += 1;
      skipWhitespace();
      if (input[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (true) {
        readValue(depth + 1);
        skipWhitespace();
        if (input[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (input[cursor] !== ",") throw invalidRequest();
        cursor += 1;
        skipWhitespace();
      }
    }
    if (character === '"') {
      readString();
      return;
    }
    readPrimitive();
  };

  readValue(0);
  skipWhitespace();
  if (cursor !== input.length) throw invalidRequest();
}

function readHeaderMap(
  request: IncomingMessage
): ReadonlyMap<string, readonly string[]> {
  const values = new Map<string, string[]>();
  const rawHeaders = request.rawHeaders;
  if (!Array.isArray(rawHeaders)) throw invalidRequest();
  if (rawHeaders.length % 2 !== 0) throw invalidRequest();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1];
    if (typeof name !== "string" || typeof value !== "string") {
      throw invalidRequest();
    }
    const key = name.toLowerCase();
    const existing = values.get(key);
    if (existing === undefined) values.set(key, [value]);
    else existing.push(value);
  }
  return values;
}

function oneHeader(
  request: IncomingMessage,
  name: string,
  duplicateCode: SandboxSecurityHttpErrorCode = "SANDBOX_SECURITY_INVALID_REQUEST"
): string | undefined {
  const values = readHeaderMap(request).get(name.toLowerCase());
  if (values === undefined || values.length === 0) return undefined;
  if (values.length !== 1) {
    if (duplicateCode === "SANDBOX_SECURITY_INVALID_REQUEST") throw invalidRequest();
    if (duplicateCode === "SANDBOX_SECURITY_UNAUTHORIZED") {
      throw httpError({
        code: "SANDBOX_SECURITY_UNAUTHORIZED",
        statusCode: 401
      });
    }
    throw httpError({
      code: duplicateCode,
      statusCode: duplicateCode === "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE" ? 415 : 400
    });
  }
  return values[0];
}

function requireSingleHeader(
  request: IncomingMessage,
  name: string,
  duplicate: "invalid" | "unsupported" | "unauthorized" = "invalid"
): string | undefined {
  const duplicateCode = duplicate === "unauthorized"
    ? "SANDBOX_SECURITY_UNAUTHORIZED"
    : duplicate === "unsupported"
      ? "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"
      : "SANDBOX_SECURITY_INVALID_REQUEST";
  return oneHeader(request, name, duplicateCode);
}

function authorizationError(audience: "public" | "administrator"): SandboxSecurityHttpError {
  return httpError({
    code: audience === "public"
      ? "SANDBOX_SECURITY_UNAUTHORIZED"
      : "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED",
    statusCode: 401
  });
}

export function readSandboxSecurityBearer(
  request: IncomingMessage,
  audience: "public" | "administrator"
): string {
  let value: string | undefined;
  try {
    value = requireSingleHeader(request, "authorization", "unauthorized");
  } catch (error) {
    if (error instanceof SandboxSecurityHttpError) {
      throw authorizationError(audience);
    }
    throw authorizationError(audience);
  }
  if (
    value === undefined ||
    !/^Bearer [\x21-\x7e]+$/.test(value)
  ) {
    throw authorizationError(audience);
  }
  const token = value.slice("Bearer ".length);
  if (audience === "public" && !CAPABILITY_TOKEN_PATTERN.test(token)) {
    throw authorizationError(audience);
  }
  return token;
}

export function readSandboxSecurityIdempotencyKey(
  request: IncomingMessage
): string {
  const value = requireSingleHeader(request, "idempotency-key");
  if (value === undefined || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw invalidRequest();
  }
  return value;
}

interface BodyFraming {
  readonly content_length: bigint | null;
  readonly transfer_chunked: boolean;
}

function pauseRequest(request: IncomingMessage): void {
  try {
    request.pause?.();
  } catch {
    // A custom request may not implement pause correctly. The caller still
    // owns the response-safe close policy.
  }
}

function hasNormalRequestCompletion(request: IncomingMessage): boolean {
  return (
    request.complete === true &&
    (request as IncomingMessage & { readableEnded?: boolean }).readableEnded === true
  );
}

function isAbortedOrPrematurelyDestroyed(request: IncomingMessage): boolean {
  return (
    request.aborted === true ||
    request.socket?.destroyed === true ||
    (request.destroyed === true && !hasNormalRequestCompletion(request))
  );
}

function parseBodyFraming(
  request: IncomingMessage,
  maxBytes: number,
  bodyless: boolean
): BodyFraming {
  const contentType = requireSingleHeader(request, "content-type", "unsupported");
  const contentEncoding = requireSingleHeader(request, "content-encoding", "unsupported");
  const contentLength = requireSingleHeader(request, "content-length");
  const transferEncoding = requireSingleHeader(request, "transfer-encoding");

  if (!bodyless) {
    if (
      contentEncoding !== undefined ||
      contentType === undefined ||
      !/^[ \t]*application\/json(?:[ \t]*;[ \t]*charset=utf-8)?[ \t]*$/i.test(contentType)
    ) {
      throw httpError({
        code: "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE",
        statusCode: 415
      });
    }
  } else if (contentEncoding !== undefined || contentType !== undefined) {
    // Bodyless routes reject content encoding; a media declaration is ignored
    // because the bodyless framing contract is independent of media type.
    if (contentEncoding !== undefined) {
      throw httpError({
        code: "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE",
        statusCode: 415
      });
    }
  }

  if (contentLength !== undefined && transferEncoding !== undefined) {
    throw invalidRequest();
  }

  let parsedLength: bigint | null = null;
  if (contentLength !== undefined) {
    if (!CONTENT_LENGTH_PATTERN.test(contentLength)) throw invalidRequest();
    try {
      parsedLength = BigInt(contentLength);
    } catch {
      throw invalidRequest();
    }
    if (!bodyless && parsedLength > BigInt(maxBytes)) {
      pauseRequest(request);
      throw httpError({
        code: "SANDBOX_SECURITY_BODY_TOO_LARGE",
        statusCode: 413,
        close_after_response: true
      });
    }
    if (bodyless && parsedLength !== 0n) throw invalidRequest();
  }

  if (transferEncoding !== undefined) {
    if (bodyless || transferEncoding.trim().toLowerCase() !== "chunked") {
      throw invalidRequest();
    }
  }

  if (!bodyless && parsedLength === null && transferEncoding === undefined) {
    throw invalidRequest();
  }
  return {
    content_length: parsedLength,
    transfer_chunked: transferEncoding !== undefined
  };
}

interface RequestChunkResult {
  readonly chunks: Buffer[];
  readonly aborted: boolean;
}

async function readRequestChunks(
  request: IncomingMessage,
  input: Readonly<{
    max_bytes: number;
    deadline_ms: number;
    declared_length: bigint | null;
  }>
): Promise<RequestChunkResult> {
  if (isAbortedOrPrematurelyDestroyed(request)) {
    throw httpError({
      code: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
      statusCode: 408,
      close_after_response: true
    });
  }

  const iterator = request[Symbol.asyncIterator]?.();
  if (iterator === undefined) {
    if (request.complete !== true) throw invalidRequest();
    if (input.declared_length !== null && input.declared_length !== 0n) {
      throw invalidRequest();
    }
    return { chunks: [], aborted: false };
  }

  const eventRequest = request as IncomingMessage & {
    on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let callerAborted = false;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abortRequest = () => {
    callerAborted = true;
    rejectAbort?.(httpError({
      code: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
      statusCode: 408,
      close_after_response: true
    }));
  };
  const onAbort = () => abortRequest();
  const onClose = () => {
    if (isAbortedOrPrematurelyDestroyed(request)) abortRequest();
  };
  eventRequest.on?.("aborted", onAbort);
  eventRequest.on?.("close", onClose);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      pauseRequest(request);
      reject(httpError({
        code: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
        statusCode: 408,
        close_after_response: true
      }));
    }, input.deadline_ms);
  });

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await Promise.race([
        iterator.next(),
        timeoutPromise,
        abortPromise
      ]);
      if (result.done) break;
      const chunk = Buffer.isBuffer(result.value)
        ? result.value
        : typeof result.value === "string"
          ? Buffer.from(result.value)
          : result.value instanceof Uint8Array
            ? Buffer.from(result.value)
            : null;
      if (chunk === null) throw invalidRequest();
      totalBytes += chunk.byteLength;
      if (totalBytes > input.max_bytes) {
        pauseRequest(request);
        throw httpError({
          code: "SANDBOX_SECURITY_BODY_TOO_LARGE",
          statusCode: 413,
          close_after_response: true
        });
      }
      if (chunk.byteLength > 0) chunks.push(chunk);
    }
  } catch (error) {
    if (callerAborted || isAbortedOrPrematurelyDestroyed(request)) {
      throw error instanceof SandboxSecurityHttpError
        ? error
        : httpError({
            code: "SANDBOX_SECURITY_REQUEST_TIMEOUT",
            statusCode: 408,
            close_after_response: true
          });
    }
    if (timedOut) throw error;
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    eventRequest.off?.("aborted", onAbort);
    eventRequest.off?.("close", onClose);
  }

  if (
    input.declared_length !== null &&
    BigInt(totalBytes) !== input.declared_length
  ) {
    throw invalidRequest();
  }
  return { chunks, aborted: false };
}

export async function readSandboxSecurityJsonBody(
  request: IncomingMessage,
  input: Readonly<{ max_bytes: 65536 | 786432; deadline_ms: 5000 }>
): Promise<Readonly<{ value: unknown; byte_length: number }>> {
  if (input.max_bytes !== 65536 && input.max_bytes !== 786432) {
    throw new RangeError("Unsupported sandbox security body limit");
  }
  if (input.deadline_ms !== 5000) {
    throw new RangeError("Unsupported sandbox security body deadline");
  }
  const framing = parseBodyFraming(request, input.max_bytes, false);
  const result = await readRequestChunks(request, {
    max_bytes: input.max_bytes,
    deadline_ms: input.deadline_ms,
    declared_length: framing.content_length
  });
  const bytes = Buffer.concat(result.chunks);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidRequest();
  }
  if (decoded.trim() === "") throw invalidRequest();
  let value: unknown;
  try {
    rejectDuplicateJsonKeys(decoded);
    value = JSON.parse(decoded);
  } catch {
    throw invalidRequest();
  }
  return { value, byte_length: bytes.byteLength };
}

export async function assertSandboxSecurityBodyless(
  request: IncomingMessage
): Promise<void> {
  const framing = parseBodyFraming(request, 0, true);
  if (isAbortedOrPrematurelyDestroyed(request)) {
    throw invalidRequest();
  }
  const iterator = request[Symbol.asyncIterator]?.();
  if (iterator === undefined) {
    if (request.complete !== true) throw invalidRequest();
    return;
  }

  const eventRequest = request as IncomingMessage & {
    on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  };
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort?.(invalidRequest());
  const onClose = () => {
    if (isAbortedOrPrematurelyDestroyed(request)) rejectAbort?.(invalidRequest());
  };
  eventRequest.on?.("aborted", onAbort);
  eventRequest.on?.("close", onClose);
  try {
    while (true) {
      const result = await Promise.race([iterator.next(), abortPromise]);
      if (result.done) return;
      const chunk = Buffer.isBuffer(result.value)
        ? result.value
        : typeof result.value === "string"
          ? Buffer.from(result.value)
          : result.value instanceof Uint8Array
            ? Buffer.from(result.value)
            : null;
      if (chunk === null || chunk.byteLength > 0) throw invalidRequest();
    }
  } finally {
    eventRequest.off?.("aborted", onAbort);
    eventRequest.off?.("close", onClose);
  }
  // Keep the framing value observable to TypeScript and ensure validation is
  // not optimized away when custom request implementations are used.
  void framing;
}

function decodeQueryPart(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    throw invalidRequest();
  }
}

export function parseSandboxSecurityAuditQuery(
  rawUrl: string
): Readonly<{ cursor?: string; limit: number }> {
  if (typeof rawUrl !== "string") throw invalidRequest();
  let search: string;
  try {
    search = new URL(rawUrl, "http://127.0.0.1").search;
  } catch {
    throw invalidRequest();
  }
  const params = search.length > 1 ? search.slice(1).split("&") : [];
  let cursor: string | undefined;
  let limit = 50;
  const seen = new Set<string>();
  for (const parameter of params) {
    if (parameter === "") throw invalidRequest();
    const separator = parameter.indexOf("=");
    const rawKey = separator < 0 ? parameter : parameter.slice(0, separator);
    const rawValue = separator < 0 ? "" : parameter.slice(separator + 1);
    const key = decodeQueryPart(rawKey);
    if (seen.has(key) || (key !== "cursor" && key !== "limit")) {
      throw invalidRequest();
    }
    seen.add(key);
    const value = decodeQueryPart(rawValue);
    if (key === "cursor") {
      if (
        value.length === 0 ||
        Buffer.byteLength(value, "ascii") > 2048 ||
        [...value].some((character) => character.charCodeAt(0) > 0x7f)
      ) {
        throw invalidRequest();
      }
      cursor = value;
    } else {
      if (!AUDIT_LIMIT_PATTERN.test(value)) throw invalidRequest();
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
        throw invalidRequest();
      }
      limit = parsed;
    }
  }
  return cursor === undefined ? { limit } : { cursor, limit };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled sandbox security service error: ${String(value)}`);
}

export function sandboxSecurityServiceErrorToHttpError(
  error: SandboxSecurityServiceError
): SandboxSecurityHttpError {
  if (!isSandboxSecurityServiceError(error)) {
    return httpError({
      code: "SANDBOX_SECURITY_INTERNAL_ERROR",
      statusCode: 500
    });
  }
  switch (error.code) {
    case "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED":
      return httpError({ code: error.code, statusCode: 401 });
    case "SANDBOX_SECURITY_FORBIDDEN":
      return httpError({ code: error.code, statusCode: 403 });
    case "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND":
      return httpError({ code: error.code, statusCode: 404 });
    case "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID":
      return httpError({ code: error.code, statusCode: 400 });
    case "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT":
      return httpError({ code: error.code, statusCode: 409 });
    case "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS":
      return httpError({
        code: error.code,
        statusCode: 409,
        retry_after_seconds: error.retry_after_seconds ?? 1
      });
    case "SANDBOX_SECURITY_CONCURRENCY_LIMITED":
      return httpError({
        code: error.code,
        statusCode: 429,
        retry_after_seconds: error.retry_after_seconds ?? 1
      });
    case "SANDBOX_SECURITY_STORAGE_UNAVAILABLE":
      return httpError({
        code: error.code,
        statusCode: 503,
        retry_after_seconds: error.retry_after_seconds ?? 60
      });
    case "SANDBOX_SECURITY_INTERNAL_ERROR":
      return httpError({ code: error.code, statusCode: 500 });
    default:
      return assertNever(error.code);
  }
}

export function sandboxSecurityHttpErrorResponse(
  error: SandboxSecurityHttpError,
  requestId: string
): HttpResponse {
  const headers: Record<string, string> = {};
  if (error.retry_after_seconds !== undefined) {
    headers["Retry-After"] = String(error.retry_after_seconds);
  }
  if (error.close_after_response) headers.Connection = "close";
  return {
    statusCode: error.statusCode,
    headers,
    body: createApiResponse({
      success: false,
      message: error.message,
      data: null,
      error_code: error.code,
      request_id: requestId
    })
  };
}
