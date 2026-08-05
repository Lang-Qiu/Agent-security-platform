import type { IncomingMessage } from "node:http";

import {
  createSuccessHttpResponse,
  type HttpResponse
} from "../../common/http/http-response.ts";
import {
  assertSandboxSecurityBodyless,
  readSandboxSecurityBearer,
  readSandboxSecurityJsonBody,
  SandboxSecurityHttpError,
  sandboxSecurityServiceErrorToHttpError
} from "./http-admission.ts";
import {
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import { normalizeSandboxSecurityCapabilityIssueRequest } from "./dto/capability.ts";
import type {
  SandboxSecurityAuditService,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityCapabilityService,
  SandboxSecurityTokenBucket
} from "./sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";

const ADMINISTRATOR_BODY_LIMIT = 65536 as const;
const BODY_ADMISSION_DEADLINE_MS = 5000 as const;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface SandboxSecurityAdminController {
  issue(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  revoke(
    request: IncomingMessage,
    rawCapabilityIdSegment: string,
    requestId: string
  ): Promise<HttpResponse>;
  purge(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
}

function invalidRequestError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_INVALID_REQUEST",
    statusCode: 400
  });
}

function internalError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR",
    statusCode: 500
  });
}

function rateLimitedError(retryAfterSeconds: unknown): SandboxSecurityHttpError {
  const retry =
    typeof retryAfterSeconds === "number" &&
    Number.isSafeInteger(retryAfterSeconds) &&
    retryAfterSeconds >= 1 &&
    retryAfterSeconds <= 60
      ? retryAfterSeconds
      : 1;
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_RATE_LIMITED",
    statusCode: 429,
    retry_after_seconds: retry
  });
}

function mapError(error: unknown): SandboxSecurityHttpError {
  if (error instanceof SandboxSecurityHttpError) return error;
  if (isSandboxSecurityServiceError(error)) {
    return sandboxSecurityServiceErrorToHttpError(error);
  }
  return internalError();
}

function assertDependencies(input: Readonly<{
  authenticator: SandboxSecurityCapabilityAuthenticator;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  administrator_bucket: SandboxSecurityTokenBucket;
  runtime: SandboxSecurityRuntimePort;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.authenticator === null ||
    typeof input.authenticator !== "object" ||
    typeof input.authenticator.authenticateAdministrator !== "function" ||
    input.capability_service === null ||
    typeof input.capability_service !== "object" ||
    typeof input.capability_service.issue !== "function" ||
    typeof input.capability_service.revoke !== "function" ||
    input.audit_service === null ||
    typeof input.audit_service !== "object" ||
    typeof input.audit_service.purgeExpired !== "function" ||
    input.administrator_bucket === null ||
    typeof input.administrator_bucket !== "object" ||
    typeof input.administrator_bucket.consume !== "function" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.monotonicNowMs !== "function"
  ) {
    throw new TypeError("Invalid sandbox security administrator controller input");
  }
}

function decodeCapabilityId(rawCapabilityIdSegment: string): string {
  if (typeof rawCapabilityIdSegment !== "string") throw invalidRequestError();
  let decoded: string;
  try {
    // The router deliberately passes the opaque raw slot. Decode exactly once
    // after authentication and bodyless admission have completed.
    decoded = decodeURIComponent(rawCapabilityIdSegment);
  } catch {
    throw invalidRequestError();
  }
  if (
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    !CAPABILITY_ID_PATTERN.test(decoded)
  ) {
    throw invalidRequestError();
  }
  return decoded;
}

export function createSandboxSecurityAdminController(input: Readonly<{
  authenticator: SandboxSecurityCapabilityAuthenticator;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  administrator_bucket: SandboxSecurityTokenBucket;
  runtime: SandboxSecurityRuntimePort;
}>): SandboxSecurityAdminController {
  assertDependencies(input);

  const {
    authenticator,
    capability_service: capabilityService,
    audit_service: auditService,
    administrator_bucket: administratorBucket,
    runtime
  } = input;

  function consumeAdministratorBucket(): void {
    let result: ReturnType<SandboxSecurityTokenBucket["consume"]>;
    try {
      result = administratorBucket.consume(runtime.monotonicNowMs());
    } catch {
      throw internalError();
    }
    if (result === null || typeof result !== "object" || result.allowed !== true) {
      throw rateLimitedError(
        result !== null &&
          typeof result === "object" &&
          "retry_after_seconds" in result
          ? result.retry_after_seconds
          : undefined
      );
    }
  }

  function authenticateAdministrator(request: IncomingMessage): void {
    const token = readSandboxSecurityBearer(request, "administrator");
    try {
      authenticator.authenticateAdministrator(token);
    } catch (error) {
      throw mapError(error);
    }
  }

  async function issue(request: IncomingMessage, requestId: string): Promise<HttpResponse> {
    try {
      consumeAdministratorBucket();
      authenticateAdministrator(request);
      let body: Awaited<ReturnType<typeof readSandboxSecurityJsonBody>>;
      try {
        body = await readSandboxSecurityJsonBody(request, {
          max_bytes: ADMINISTRATOR_BODY_LIMIT,
          deadline_ms: BODY_ADMISSION_DEADLINE_MS
        });
      } catch (error) {
        if (error instanceof SandboxSecurityHttpError) throw error;
        throw invalidRequestError();
      }
      const normalized = normalizeSandboxSecurityCapabilityIssueRequest(body.value);
      if (normalized === null) throw invalidRequestError();
      const result = capabilityService.issue(normalized);
      return createSuccessHttpResponse({
        requestId,
        message: "Sandbox security capability issued",
        data: result,
        statusCode: 201
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async function revoke(
    request: IncomingMessage,
    rawCapabilityIdSegment: string,
    requestId: string
  ): Promise<HttpResponse> {
    try {
      consumeAdministratorBucket();
      authenticateAdministrator(request);
      try {
        await assertSandboxSecurityBodyless(request);
      } catch (error) {
        if (error instanceof SandboxSecurityHttpError) throw error;
        throw invalidRequestError();
      }
      const capabilityId = decodeCapabilityId(rawCapabilityIdSegment);
      const result = capabilityService.revoke(capabilityId);
      return createSuccessHttpResponse({
        requestId,
        message: "Sandbox security capability revoked",
        data: result
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async function purge(request: IncomingMessage, requestId: string): Promise<HttpResponse> {
    try {
      consumeAdministratorBucket();
      authenticateAdministrator(request);
      try {
        await assertSandboxSecurityBodyless(request);
      } catch (error) {
        if (error instanceof SandboxSecurityHttpError) throw error;
        throw invalidRequestError();
      }
      const result = auditService.purgeExpired();
      return createSuccessHttpResponse({
        requestId,
        message: "Sandbox security audit events purged",
        data: result
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  return Object.freeze({ issue, revoke, purge });
}
