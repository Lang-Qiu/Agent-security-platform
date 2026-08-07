import type { IncomingMessage } from "node:http";

import {
  normalizeOpenClawEnforcementAuditAck,
  normalizeSandboxSecurityEnforcementAuditRequest
} from "../../../../shared/index.ts";
import { createSuccessHttpResponse, type HttpResponse } from "../../common/http/http-response.ts";
import {
  SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_DEADLINE_MS,
  SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_LIMIT,
  readSandboxSecurityBearer,
  readSandboxSecurityJsonBody,
  SandboxSecurityHttpError,
  sandboxSecurityServiceErrorToHttpError
} from "./http-admission.ts";
import {
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  OpenClawEnforcementAuditIdentity,
  SandboxSecurityEnforcementAuditAuthenticator,
  SandboxSecurityEnforcementAuditCapabilityAuthenticationResult,
  SandboxSecurityEnforcementAuditService,
  SandboxSecurityTokenBucket
} from "./sandbox-security.types.ts";
import type { SandboxSecurityEnforcementAuditAuthorizedCapability } from "./dto/enforcement-audit-capability.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";

const COMPOSITION_BINDINGS = new Set([
  "sandbox-security-production-composition.v1:rule_only",
  "sandbox-security-production-composition.v1:local",
  "sandbox-security-production-composition.v1:local_and_judge"
]);
const ENFORCEMENT_AUDIT_SCOPE = "sandbox_security:enforcement:audit:write";

export interface SandboxSecurityEnforcementAuditController {
  enforcementAudit(
    request: IncomingMessage,
    requestId: string
  ): Promise<HttpResponse>;
}

function invalidRequestError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_INVALID_REQUEST",
    statusCode: 400
  });
}

function unauthorizedError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_UNAUTHORIZED",
    statusCode: 401
  });
}

function forbiddenError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_FORBIDDEN",
    statusCode: 403
  });
}

function rateLimitedError(retryAfterSeconds: unknown): SandboxSecurityHttpError {
  const retry = typeof retryAfterSeconds === "number" &&
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

function internalError(): SandboxSecurityHttpError {
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR",
    statusCode: 500
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
  authenticator: SandboxSecurityEnforcementAuditAuthenticator;
  service: SandboxSecurityEnforcementAuditService;
  enforcement_bucket: SandboxSecurityTokenBucket;
  runtime: SandboxSecurityRuntimePort;
  composition_binding: string;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.composition_binding !== "string" ||
    !COMPOSITION_BINDINGS.has(input.composition_binding) ||
    input.authenticator === null ||
    typeof input.authenticator !== "object" ||
    typeof input.authenticator.authenticateEnforcementAuditToken !== "function" ||
    typeof input.authenticator.requireEnforcementAuditGrant !== "function" ||
    input.service === null ||
    typeof input.service !== "object" ||
    typeof input.service.appendEnforcementEvent !== "function" ||
    input.enforcement_bucket === null ||
    typeof input.enforcement_bucket !== "object" ||
    typeof input.enforcement_bucket.consume !== "function" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.monotonicNowMs !== "function"
  ) {
    throw new TypeError("Invalid sandbox security enforcement audit controller input");
  }
}

function monotonicNow(runtime: SandboxSecurityRuntimePort): number {
  try {
    const value = runtime.monotonicNowMs();
    if (!Number.isFinite(value) || value < 0) throw new RangeError("invalid monotonic clock");
    return value;
  } catch {
    throw internalError();
  }
}

function authorizedCapability(
  result: SandboxSecurityEnforcementAuditCapabilityAuthenticationResult
): SandboxSecurityEnforcementAuditAuthorizedCapability {
  if (result === null || typeof result !== "object") throw unauthorizedError();
  if (result.kind !== "authorized") throw unauthorizedError();
  const capability = result.capability;
  if (
    capability === null ||
    typeof capability !== "object" ||
    typeof capability.capability_id !== "string" ||
    typeof capability.subject_id !== "string" ||
    typeof capability.authorization_scope_id !== "string" ||
    typeof capability.composition_binding !== "string" ||
    !Array.isArray(capability.allowed_stages) ||
    !Array.isArray(capability.allowed_policy_profile_ids)
  ) {
    throw unauthorizedError();
  }
  return capability;
}

function requireEnforcementAuditScope(
  capability: SandboxSecurityEnforcementAuditAuthorizedCapability
): void {
  if (
    !Array.isArray(capability.scopes) ||
    capability.scopes.length !== 1 ||
    capability.scopes[0] !== ENFORCEMENT_AUDIT_SCOPE
  ) {
    throw forbiddenError();
  }
}

export function createSandboxSecurityEnforcementAuditController(input: Readonly<{
  authenticator: SandboxSecurityEnforcementAuditAuthenticator;
  service: SandboxSecurityEnforcementAuditService;
  enforcement_bucket: SandboxSecurityTokenBucket;
  runtime: SandboxSecurityRuntimePort;
  composition_binding: string;
}>): SandboxSecurityEnforcementAuditController {
  assertDependencies(input);
  const {
    authenticator,
    service,
    enforcement_bucket: enforcementBucket,
    runtime,
    composition_binding: compositionBinding
  } = input;

  return Object.freeze({
    async enforcementAudit(
      request: IncomingMessage,
      requestId: string
    ): Promise<HttpResponse> {
      try {
        const limit = enforcementBucket.consume(monotonicNow(runtime));
        if (limit === null || typeof limit !== "object") throw internalError();
        if (limit.allowed !== true) {
          throw rateLimitedError(limit.retry_after_seconds);
        }

        let token: string;
        try {
          token = readSandboxSecurityBearer(request, "public");
        } catch (error) {
          if (error instanceof SandboxSecurityHttpError) throw error;
          throw unauthorizedError();
        }

        let authentication: SandboxSecurityEnforcementAuditCapabilityAuthenticationResult;
        try {
          authentication = authenticator.authenticateEnforcementAuditToken(token);
        } catch (error) {
          if (isSandboxSecurityServiceError(error)) throw mapError(error);
          throw internalError();
        }
        const capability = authorizedCapability(authentication);
        requireEnforcementAuditScope(capability);

        let body: Awaited<ReturnType<typeof readSandboxSecurityJsonBody>>;
        try {
          body = await readSandboxSecurityJsonBody(request, {
            max_bytes: SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_LIMIT,
            deadline_ms: SANDBOX_SECURITY_ENFORCEMENT_AUDIT_BODY_DEADLINE_MS
          });
        } catch (error) {
          if (error instanceof SandboxSecurityHttpError) throw error;
          throw invalidRequestError();
        }

        const normalized = normalizeSandboxSecurityEnforcementAuditRequest(body.value);
        if (normalized === null) throw invalidRequestError();

        let granted: SandboxSecurityEnforcementAuditAuthorizedCapability;
        try {
          granted = authenticator.requireEnforcementAuditGrant(capability, {
            stage: normalized.stage,
            policy_profile_id: normalized.policy_profile_id,
            composition_binding: normalized.composition_binding
          });
        } catch (error) {
          throw mapError(error);
        }
        if (
          granted === null ||
          typeof granted !== "object" ||
          granted.capability_id !== capability.capability_id ||
          granted.subject_id !== capability.subject_id ||
          granted.authorization_scope_id !== capability.authorization_scope_id ||
          granted.composition_binding !== compositionBinding
        ) {
          throw internalError();
        }

        const identity: OpenClawEnforcementAuditIdentity = {
          subject_id: granted.subject_id,
          capability_id: granted.capability_id,
          authorization_scope_id: granted.authorization_scope_id
        };
        const rawAck = await service.appendEnforcementEvent(normalized, identity);
        const ack = normalizeOpenClawEnforcementAuditAck(rawAck);
        if (ack === null || ack.event_id !== normalized.event_id) {
          throw internalError();
        }
        return createSuccessHttpResponse({
          requestId,
          message: "Sandbox security enforcement event accepted",
          data: ack,
          statusCode: ack.status === "accepted" ? 201 : 200
        });
      } catch (error) {
        throw mapError(error);
      }
    }
  });
}
