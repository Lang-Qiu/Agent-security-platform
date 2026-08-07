import { TextDecoder } from "node:util";

import {
  isApiResponse,
  normalizeOpenClawEnforcementAuditAck,
  normalizeSandboxSecurityEnforcementAuditRequest,
  type ApiResponse,
  type OpenClawEnforcementAuditAck,
  type OpenClawEnforcementAuditRequest
} from "../../../../../shared/index.ts";

const AUDIT_TIMEOUT_MS = 1000 as const;
const MAX_RESPONSE_BYTES = 64 * 1024;
const TOKEN_PATTERN = /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/;
const AUDIT_FAILURE_CODES = [
  "audit_request_invalid",
  "audit_transport_error",
  "audit_timeout",
  "audit_response_invalid",
  "audit_response_mismatch",
  "audit_unauthorized",
  "audit_forbidden",
  "audit_payload_too_large",
  "audit_unsupported_media",
  "audit_rate_limited",
  "audit_unavailable",
  "audit_conflict",
  "audit_http_error"
] as const;

export type OpenClawSecurityAuditFailureCode = (typeof AUDIT_FAILURE_CODES)[number];

export interface OpenClawSecurityAuditTransport {
  readonly post: (input: Readonly<{
    url: string;
    bearer_token: string;
    body: Uint8Array;
    signal: AbortSignal;
  }>) => Promise<Readonly<{ status: number; body: Uint8Array }>>;
}

export type OpenClawSecurityScheduleTimeout = (
  delayMs: number,
  callback: () => void
) => () => void;

export type OpenClawSecurityAuditAppendResult = Readonly<
  | {
      kind: "accepted";
      ack: Readonly<OpenClawEnforcementAuditAck>;
    }
  | {
      kind: "failed";
      code: OpenClawSecurityAuditFailureCode;
    }
>;

export interface OpenClawSecurityAuditClient {
  readonly append: (
    request: unknown
  ) => Promise<Readonly<OpenClawSecurityAuditAppendResult>>;
}

type RecordValue = Record<string, unknown>;

function invalidClient(): never {
  throw new Error("invalid OpenClaw security audit client input");
}

function isPlainRecord(value: unknown): value is RecordValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is RecordValue {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function normalizeApiResponse(value: unknown): ApiResponse<unknown> | null {
  if (
    !hasExactOwnDataProperties(value, [
      "success",
      "message",
      "data",
      "error_code",
      "request_id"
    ]) ||
    !isApiResponse(value) ||
    value.success !== true ||
    value.error_code !== null
  ) {
    return null;
  }
  return Object.freeze({
    success: true,
    message: value.message,
    data: value.data,
    error_code: null,
    request_id: value.request_id
  });
}

function normalizeTransportResponse(value: unknown): Readonly<{
  status: number;
  body: Uint8Array;
}> | null {
  if (
    !hasExactOwnDataProperties(value, ["status", "body"]) ||
    typeof value.status !== "number" ||
    !Number.isSafeInteger(value.status) ||
    value.status < 100 ||
    value.status > 599 ||
    !(value.body instanceof Uint8Array) ||
    value.body.byteLength > MAX_RESPONSE_BYTES
  ) {
    return null;
  }
  return Object.freeze({
    status: value.status,
    body: new Uint8Array(value.body)
  });
}

function mapHttpFailure(status: number): OpenClawSecurityAuditFailureCode {
  switch (status) {
    case 401:
      return "audit_unauthorized";
    case 403:
      return "audit_forbidden";
    case 408:
      return "audit_timeout";
    case 409:
      return "audit_conflict";
    case 413:
      return "audit_payload_too_large";
    case 415:
      return "audit_unsupported_media";
    case 429:
      return "audit_rate_limited";
    case 503:
      return "audit_unavailable";
    default:
      return "audit_http_error";
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function defaultScheduleTimeout(
  delayMs: number,
  callback: () => void
): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

export function createOpenClawSecurityAuditClient(input: Readonly<{
  endpoint: string;
  bearer_token: string;
  transport: OpenClawSecurityAuditTransport;
  markAuditDegraded: (reason: unknown) => void;
  scheduleTimeout?: OpenClawSecurityScheduleTimeout;
}>): Readonly<OpenClawSecurityAuditClient> {
  if (
    !hasExactOwnDataProperties(input, [
      "endpoint",
      "bearer_token",
      "transport",
      "markAuditDegraded"
    ], ["scheduleTimeout"]) ||
    typeof input.endpoint !== "string" ||
    input.endpoint.length === 0 ||
    typeof input.bearer_token !== "string" ||
    !TOKEN_PATTERN.test(input.bearer_token) ||
    input.transport === null ||
    typeof input.transport !== "object" ||
    typeof input.transport.post !== "function" ||
    typeof input.markAuditDegraded !== "function" ||
    (input.scheduleTimeout !== undefined && typeof input.scheduleTimeout !== "function")
  ) {
    invalidClient();
  }

  const scheduleTimeout = input.scheduleTimeout ?? defaultScheduleTimeout;

  const degraded = (
    code: OpenClawSecurityAuditFailureCode
  ): OpenClawSecurityAuditAppendResult => {
    try {
      input.markAuditDegraded(code);
    } catch {
      // Audit health is best effort and must not replace the closed result.
    }
    return deepFreeze({ kind: "failed", code });
  };

  const append = async (
    request: unknown
  ): Promise<Readonly<OpenClawSecurityAuditAppendResult>> => {
    const normalized = normalizeSandboxSecurityEnforcementAuditRequest(request);
    if (normalized === null) return degraded("audit_request_invalid");

    let body: Uint8Array;
    try {
      body = new TextEncoder().encode(JSON.stringify(normalized));
    } catch {
      return degraded("audit_request_invalid");
    }

    const controller = new AbortController();
    let timedOut = false;
    let cancelTimeout: (() => void) | null = null;
    try {
      cancelTimeout = scheduleTimeout(AUDIT_TIMEOUT_MS, () => {
        timedOut = true;
        if (!controller.signal.aborted) controller.abort("audit_timeout");
      });
    } catch {
      return degraded("audit_transport_error");
    }

    try {
      let rawResponse: unknown;
      try {
        rawResponse = await input.transport.post({
          url: input.endpoint,
          bearer_token: input.bearer_token,
          body,
          signal: controller.signal
        });
      } catch {
        return degraded(timedOut ? "audit_timeout" : "audit_transport_error");
      }

      if (timedOut || controller.signal.aborted) {
        return degraded("audit_timeout");
      }

      const response = normalizeTransportResponse(rawResponse);
      if (response === null) return degraded("audit_response_invalid");
      if (response.status !== 200 && response.status !== 201) {
        return degraded(mapHttpFailure(response.status));
      }

      let parsed: unknown;
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(response.body);
        parsed = JSON.parse(text);
      } catch {
        return degraded("audit_response_invalid");
      }

      const envelope = normalizeApiResponse(parsed);
      if (envelope === null) return degraded("audit_response_invalid");
      const ack = normalizeOpenClawEnforcementAuditAck(envelope.data);
      if (ack === null) return degraded("audit_response_invalid");
      if (
        ack.event_id !== normalized.event_id ||
        (response.status === 201 && ack.status !== "accepted") ||
        (response.status === 200 && ack.status !== "replayed")
      ) {
        return degraded("audit_response_mismatch");
      }

      return deepFreeze({ kind: "accepted", ack });
    } finally {
      if (cancelTimeout !== null) {
        try {
          cancelTimeout();
        } catch {
          // Timer cleanup is best effort; the request result is already closed.
        }
      }
    }
  };

  return Object.freeze({ append });
}
