import type { IncomingMessage } from "node:http";

import { normalizeSandboxSecurityRequest } from "../../../../shared/contracts/sandbox-security-request.ts";
import { createSuccessHttpResponse, type HttpResponse } from "../../common/http/http-response.ts";
import {
  assertSandboxSecurityBodyless,
  parseSandboxSecurityAuditQuery,
  readSandboxSecurityBearer,
  readSandboxSecurityIdempotencyKey,
  readSandboxSecurityJsonBody,
  SandboxSecurityHttpError,
  sandboxSecurityServiceErrorToHttpError
} from "./http-admission.ts";
import type { SandboxSecurityAuditRepository } from "./ports/audit.repository.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import {
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditService,
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityCapabilityAuthenticationResult,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityRequest,
  SandboxSecurityEvaluationService,
  SandboxSecurityTokenBucket
} from "./sandbox-security.types.ts";

const PUBLIC_EVALUATION_BODY_LIMIT = 786432 as const;
const BODY_ADMISSION_DEADLINE_MS = 5000 as const;
const PRODUCTION_COMPOSITION_BINDING_PATTERN =
  /^sandbox-security-production-composition\.v1:(rule_only|local|local_and_judge)$/;

type PublicRouteId = "evaluation" | "audit_read";
type RejectionCode =
  | "capability_expired"
  | "capability_revoked"
  | "scope_forbidden"
  | "stage_forbidden"
  | "profile_forbidden"
  | "capability_rate_limited"
  | "storage_unavailable"
  | "invalid_request"
  | "body_too_large"
  | "body_timeout"
  | "unsupported_media_type";

type AuditIdentity = Readonly<{
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly string[];
  allowed_stages: readonly string[];
  allowed_policy_profile_ids: readonly string[];
  issued_at: string;
  expires_at: string;
}>;

function assertDependencies(input: Readonly<{
  composition_binding: string;
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  audit_service: SandboxSecurityAuditService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  global_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  audit_projector: SandboxSecurityAuditProjector;
  audit_repository: SandboxSecurityAuditRepository;
  runtime: SandboxSecurityRuntimePort;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.composition_binding !== "string" ||
    !PRODUCTION_COMPOSITION_BINDING_PATTERN.test(input.composition_binding) ||
    input.authenticator === null ||
    typeof input.authenticator !== "object" ||
    typeof input.authenticator.authenticateToken !== "function" ||
    typeof input.authenticator.requireScope !== "function" ||
    typeof input.authenticator.requireEvaluationGrant !== "function" ||
    input.evaluation_service === null ||
    typeof input.evaluation_service !== "object" ||
    typeof input.evaluation_service.evaluate !== "function" ||
    input.audit_service === null ||
    typeof input.audit_service !== "object" ||
    typeof input.audit_service.list !== "function" ||
    input.maintenance === null ||
    typeof input.maintenance !== "object" ||
    typeof input.maintenance.assertEvaluationAvailable !== "function" ||
    input.global_bucket === null ||
    typeof input.global_bucket !== "object" ||
    typeof input.global_bucket.consume !== "function" ||
    input.capability_limiters === null ||
    typeof input.capability_limiters !== "object" ||
    typeof input.capability_limiters.consume !== "function" ||
    input.audit_projector === null ||
    typeof input.audit_projector !== "object" ||
    typeof input.audit_projector.requestRejected !== "function" ||
    input.audit_repository === null ||
    typeof input.audit_repository !== "object" ||
    typeof input.audit_repository.append !== "function" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.now !== "function" ||
    typeof input.runtime.monotonicNowMs !== "function" ||
    typeof input.runtime.nextAuditEventId !== "function"
  ) {
    throw new TypeError("Invalid sandbox security public controller dependencies");
  }
}

function safeMonotonic(runtime: SandboxSecurityRuntimePort): number {
  try {
    const value = runtime.monotonicNowMs();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function elapsedMs(runtime: SandboxSecurityRuntimePort, startedAt: number): number {
  const current = safeMonotonic(runtime);
  return Math.max(0, Math.min(60000, Math.floor(current - startedAt)));
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

function rateLimitedError(retryAfterSeconds: number): SandboxSecurityHttpError {
  const retry = Number.isSafeInteger(retryAfterSeconds)
    ? Math.min(60, Math.max(1, retryAfterSeconds))
    : 1;
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_RATE_LIMITED",
    statusCode: 429,
    retry_after_seconds: retry
  });
}

function isRejectionCode(value: unknown): value is RejectionCode {
  return (
    value === "capability_expired" ||
    value === "capability_revoked" ||
    value === "scope_forbidden" ||
    value === "stage_forbidden" ||
    value === "profile_forbidden" ||
    value === "capability_rate_limited" ||
    value === "storage_unavailable" ||
    value === "invalid_request" ||
    value === "body_too_large" ||
    value === "body_timeout" ||
    value === "unsupported_media_type"
  );
}

function httpErrorRejectionCode(
  error: SandboxSecurityHttpError,
  route: PublicRouteId
): RejectionCode | null {
  switch (error.code) {
    case "SANDBOX_SECURITY_RATE_LIMITED":
      return "capability_rate_limited";
    case "SANDBOX_SECURITY_INVALID_REQUEST":
      return "invalid_request";
    case "SANDBOX_SECURITY_BODY_TOO_LARGE":
      return route === "evaluation" ? "body_too_large" : null;
    case "SANDBOX_SECURITY_REQUEST_TIMEOUT":
      return route === "evaluation" ? "body_timeout" : null;
    case "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE":
      return route === "evaluation" ? "unsupported_media_type" : null;
    default:
      return null;
  }
}

function isControllerOwnedServiceRejection(
  error: SandboxSecurityServiceError,
  route: PublicRouteId
): error is SandboxSecurityServiceError & {
  readonly audit_rejection_code: RejectionCode;
} {
  if (!isRejectionCode(error.audit_rejection_code)) return false;
  if (
    error.code === "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT" ||
    error.code === "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS" ||
    error.code === "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
  ) {
    return false;
  }
  if (route === "audit_read") {
    return (
      error.audit_rejection_code === "invalid_request" ||
      error.audit_rejection_code === "capability_expired" ||
      error.audit_rejection_code === "capability_revoked" ||
      error.audit_rejection_code === "scope_forbidden" ||
      error.audit_rejection_code === "capability_rate_limited"
    );
  }
  return true;
}

function authIdentity(
  result: Extract<SandboxSecurityCapabilityAuthenticationResult, { kind: "known_denied" }>
): AuditIdentity {
  return result.audit_identity;
}

function appendRejectionBestEffort(input: Readonly<{
  identity: AuditIdentity | SandboxSecurityAuthorizedCapability;
  route: PublicRouteId;
  request_id: string | null;
  stage: SandboxSecurityRequest["stage"] | null;
  policy_profile_id: SandboxSecurityRequest["policy_profile_id"] | null;
  rejection_code: RejectionCode;
  composition_binding: string;
  runtime: SandboxSecurityRuntimePort;
  projector: SandboxSecurityAuditProjector;
  repository: SandboxSecurityAuditRepository;
  started_at: number;
}>): void {
  try {
    const event = input.projector.requestRejected({
      event_id: input.runtime.nextAuditEventId(),
      occurred_at: input.runtime.now(),
      subject_id: input.identity.subject_id,
      authorization_scope_id: input.identity.authorization_scope_id,
      capability_id: input.identity.capability_id,
      route_id: input.route,
      request_id: input.request_id,
      stage: input.stage,
      policy_profile_id: input.policy_profile_id,
      composition_binding: input.composition_binding,
      elapsed_ms: elapsedMs(input.runtime, input.started_at),
      rejection_code: input.rejection_code
    });
    input.repository.append(event);
  } catch {
    // Rejection auditing is deliberately best effort and must not replace the
    // typed HTTP rejection that protects the caller-facing contract.
  }
}

function mapServiceError(error: unknown): SandboxSecurityHttpError {
  if (isSandboxSecurityServiceError(error)) {
    return sandboxSecurityServiceErrorToHttpError(error);
  }
  return new SandboxSecurityHttpError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR",
    statusCode: 500
  });
}

export function createSandboxSecurityController(input: Readonly<{
  composition_binding: string;
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  audit_service: SandboxSecurityAuditService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  global_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  audit_projector: SandboxSecurityAuditProjector;
  audit_repository: SandboxSecurityAuditRepository;
  runtime: SandboxSecurityRuntimePort;
}>): {
  evaluate(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  listAuditEvents(
    request: IncomingMessage,
    url: URL,
    requestId: string
  ): Promise<HttpResponse>;
} {
  assertDependencies(input);

  const {
    composition_binding: compositionBinding,
    authenticator,
    evaluation_service: evaluationService,
    audit_service: auditService,
    maintenance,
    global_bucket: globalBucket,
    capability_limiters: capabilityLimiters,
    audit_projector: auditProjector,
    audit_repository: auditRepository,
    runtime
  } = input;

  function consumeGlobalBucket(): void {
    const result = globalBucket.consume(safeMonotonic(runtime));
    if (result === null || typeof result !== "object" || result.allowed !== true) {
      const retry =
        result !== null &&
        typeof result === "object" &&
        "retry_after_seconds" in result &&
        typeof result.retry_after_seconds === "number"
          ? result.retry_after_seconds
          : 1;
      throw rateLimitedError(retry);
    }
  }

  function authenticate(request: IncomingMessage): SandboxSecurityAuthorizedCapability {
    const token = readSandboxSecurityBearer(request, "public");
    const result = authenticator.authenticateToken(token);
    if (result === null || typeof result !== "object") throw unauthorizedError();
    if (result.kind === "unknown") throw unauthorizedError();
    if (result.kind === "known_denied") {
      throw result;
    }
    if (result.kind !== "authorized" || result.capability === null) {
      throw unauthorizedError();
    }
    return result.capability;
  }

  function appendHttpRejection(
    capability: SandboxSecurityAuthorizedCapability,
    route: PublicRouteId,
    requestId: string,
    error: SandboxSecurityHttpError,
    startedAt: number,
    correlation: Readonly<{
      request_id: SandboxSecurityRequest["request_id"] | null;
      stage: SandboxSecurityRequest["stage"] | null;
      policy_profile_id: SandboxSecurityRequest["policy_profile_id"] | null;
    }>
  ): void {
    const code = httpErrorRejectionCode(error, route);
    if (code === null) return;
    appendRejectionBestEffort({
      identity: capability,
      route,
      request_id: correlation.request_id,
      stage: correlation.stage,
      policy_profile_id: correlation.policy_profile_id,
      rejection_code: code,
      composition_binding: compositionBinding,
      runtime,
      projector: auditProjector,
      repository: auditRepository,
      started_at: startedAt
    });
    void requestId;
  }

  async function evaluate(request: IncomingMessage, requestId: string): Promise<HttpResponse> {
    const startedAt = safeMonotonic(runtime);
    let capability: SandboxSecurityAuthorizedCapability | null = null;
    let submission: SandboxSecurityRequest | null = null;
    try {
      consumeGlobalBucket();
      let token: string;
      try {
        token = readSandboxSecurityBearer(request, "public");
      } catch (error) {
        if (error instanceof SandboxSecurityHttpError) throw error;
        throw unauthorizedError();
      }
      const authentication = authenticator.authenticateToken(token);
      if (authentication.kind === "unknown") throw unauthorizedError();
      if (authentication.kind === "known_denied") {
        const rejection = unauthorizedError();
        appendRejectionBestEffort({
          identity: authIdentity(authentication),
          route: "evaluation",
          request_id: null,
          stage: null,
          policy_profile_id: null,
          rejection_code: authentication.rejection_code,
          composition_binding: compositionBinding,
          runtime,
          projector: auditProjector,
          repository: auditRepository,
          started_at: startedAt
        });
        throw rejection;
      }
      if (authentication.kind !== "authorized") throw unauthorizedError();
      capability = authentication.capability;

      try {
        authenticator.requireScope(capability, "sandbox_security:evaluate");
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) {
          if (isControllerOwnedServiceRejection(error, "evaluation")) {
            appendRejectionBestEffort({
              identity: capability,
              route: "evaluation",
              request_id: null,
              stage: null,
              policy_profile_id: null,
              rejection_code: error.audit_rejection_code,
              composition_binding: compositionBinding,
              runtime,
              projector: auditProjector,
              repository: auditRepository,
              started_at: startedAt
            });
          }
          throw mapServiceError(error);
        }
        throw error;
      }

      try {
        maintenance.assertEvaluationAvailable();
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) {
          if (isControllerOwnedServiceRejection(error, "evaluation")) {
            appendRejectionBestEffort({
              identity: capability,
              route: "evaluation",
              request_id: null,
              stage: null,
              policy_profile_id: null,
              rejection_code: error.audit_rejection_code,
              composition_binding: compositionBinding,
              runtime,
              projector: auditProjector,
              repository: auditRepository,
              started_at: startedAt
            });
          }
          throw mapServiceError(error);
        }
        throw error;
      }

      const limit = capabilityLimiters.consume(capability);
      if (limit === null || typeof limit !== "object") {
        throw new SandboxSecurityHttpError({
          code: "SANDBOX_SECURITY_INTERNAL_ERROR",
          statusCode: 500
        });
      }
      if (limit.allowed !== true) {
        const rejection = rateLimitedError(limit.retry_after_seconds);
        appendHttpRejection(capability, "evaluation", requestId, rejection, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw rejection;
      }

      let idempotencyKey: string;
      try {
        idempotencyKey = readSandboxSecurityIdempotencyKey(request);
      } catch (error) {
        const typed = error instanceof SandboxSecurityHttpError
          ? error
          : new SandboxSecurityHttpError({
              code: "SANDBOX_SECURITY_INVALID_REQUEST",
              statusCode: 400
            });
        appendHttpRejection(capability, "evaluation", requestId, typed, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw typed;
      }

      let body: Readonly<{ value: unknown }>;
      try {
        body = await readSandboxSecurityJsonBody(request, {
          max_bytes: PUBLIC_EVALUATION_BODY_LIMIT,
          deadline_ms: BODY_ADMISSION_DEADLINE_MS
        });
      } catch (error) {
        const typed = error instanceof SandboxSecurityHttpError
          ? error
          : new SandboxSecurityHttpError({
              code: "SANDBOX_SECURITY_INVALID_REQUEST",
              statusCode: 400
            });
        appendHttpRejection(capability, "evaluation", requestId, typed, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw typed;
      }

      submission = normalizeSandboxSecurityRequest(body.value);
      if (submission === null) {
        const rejection = invalidRequestError();
        appendHttpRejection(capability, "evaluation", requestId, rejection, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw rejection;
      }

      try {
        authenticator.requireEvaluationGrant(capability, submission);
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) {
          if (isControllerOwnedServiceRejection(error, "evaluation")) {
            appendRejectionBestEffort({
              identity: capability,
              route: "evaluation",
              request_id: submission.request_id,
              stage: submission.stage,
              policy_profile_id: submission.policy_profile_id,
              rejection_code: error.audit_rejection_code,
              composition_binding: compositionBinding,
              runtime,
              projector: auditProjector,
              repository: auditRepository,
              started_at: startedAt
            });
          }
          throw mapServiceError(error);
        }
        throw error;
      }

      const decision = await evaluationService.evaluate({
        capability,
        idempotency_key: idempotencyKey,
        submission
      });
      return createSuccessHttpResponse({
        requestId,
        message: "Sandbox security evaluation completed",
        data: decision
      });
    } catch (error) {
      if (error instanceof SandboxSecurityHttpError) throw error;
      if (
        error !== null &&
        typeof error === "object" &&
        "kind" in error &&
        error.kind === "known_denied"
      ) {
        throw unauthorizedError();
      }
      if (isSandboxSecurityServiceError(error)) {
        if (
          capability !== null &&
          isControllerOwnedServiceRejection(error, "evaluation")
        ) {
          appendRejectionBestEffort({
            identity: capability,
            route: "evaluation",
            request_id: submission?.request_id ?? null,
            stage: submission?.stage ?? null,
            policy_profile_id: submission?.policy_profile_id ?? null,
            rejection_code: error.audit_rejection_code,
            composition_binding: compositionBinding,
            runtime,
            projector: auditProjector,
            repository: auditRepository,
            started_at: startedAt
          });
        }
        throw mapServiceError(error);
      }
      throw new SandboxSecurityHttpError({
        code: "SANDBOX_SECURITY_INTERNAL_ERROR",
        statusCode: 500
      });
    }
  }

  async function listAuditEvents(
    request: IncomingMessage,
    url: URL,
    requestId: string
  ): Promise<HttpResponse> {
    const startedAt = safeMonotonic(runtime);
    let capability: SandboxSecurityAuthorizedCapability | null = null;
    try {
      consumeGlobalBucket();
      let token: string;
      try {
        token = readSandboxSecurityBearer(request, "public");
      } catch (error) {
        if (error instanceof SandboxSecurityHttpError) throw error;
        throw unauthorizedError();
      }
      const authentication = authenticator.authenticateToken(token);
      if (authentication.kind === "unknown") throw unauthorizedError();
      if (authentication.kind === "known_denied") {
        const rejection = unauthorizedError();
        appendRejectionBestEffort({
          identity: authIdentity(authentication),
          route: "audit_read",
          request_id: null,
          stage: null,
          policy_profile_id: null,
          rejection_code: authentication.rejection_code,
          composition_binding: compositionBinding,
          runtime,
          projector: auditProjector,
          repository: auditRepository,
          started_at: startedAt
        });
        throw rejection;
      }
      if (authentication.kind !== "authorized") throw unauthorizedError();
      capability = authentication.capability;

      try {
        authenticator.requireScope(capability, "sandbox_security:audit:read");
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) {
          if (isControllerOwnedServiceRejection(error, "audit_read")) {
            appendRejectionBestEffort({
              identity: capability,
              route: "audit_read",
              request_id: null,
              stage: null,
              policy_profile_id: null,
              rejection_code: error.audit_rejection_code,
              composition_binding: compositionBinding,
              runtime,
              projector: auditProjector,
              repository: auditRepository,
              started_at: startedAt
            });
          }
          throw mapServiceError(error);
        }
        throw error;
      }

      const limitResult = capabilityLimiters.consume(capability);
      if (limitResult === null || typeof limitResult !== "object") {
        throw new SandboxSecurityHttpError({
          code: "SANDBOX_SECURITY_INTERNAL_ERROR",
          statusCode: 500
        });
      }
      if (limitResult.allowed !== true) {
        const rejection = rateLimitedError(limitResult.retry_after_seconds);
        appendHttpRejection(capability, "audit_read", requestId, rejection, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw rejection;
      }

      try {
        await assertSandboxSecurityBodyless(request);
      } catch (error) {
        const typed = error instanceof SandboxSecurityHttpError
          ? error
          : invalidRequestError();
        appendHttpRejection(capability, "audit_read", requestId, typed, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw typed;
      }

      let query: Readonly<{ cursor?: string; limit: number }>;
      try {
        query = parseSandboxSecurityAuditQuery(url.toString());
      } catch (error) {
        const typed = error instanceof SandboxSecurityHttpError
          ? error
          : invalidRequestError();
        appendHttpRejection(capability, "audit_read", requestId, typed, startedAt, {
          request_id: null,
          stage: null,
          policy_profile_id: null
        });
        throw typed;
      }

      try {
        const page = auditService.list({
          capability,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit
        });
        return createSuccessHttpResponse({
          requestId,
          message: "Sandbox security audit events retrieved",
          data: page
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) {
          if (isControllerOwnedServiceRejection(error, "audit_read")) {
            appendRejectionBestEffort({
              identity: capability,
              route: "audit_read",
              request_id: null,
              stage: null,
              policy_profile_id: null,
              rejection_code: error.audit_rejection_code,
              composition_binding: compositionBinding,
              runtime,
              projector: auditProjector,
              repository: auditRepository,
              started_at: startedAt
            });
          }
          throw mapServiceError(error);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof SandboxSecurityHttpError) throw error;
      if (isSandboxSecurityServiceError(error)) {
        if (
          capability !== null &&
          isControllerOwnedServiceRejection(error, "audit_read")
        ) {
          appendRejectionBestEffort({
            identity: capability,
            route: "audit_read",
            request_id: null,
            stage: null,
            policy_profile_id: null,
            rejection_code: error.audit_rejection_code,
            composition_binding: compositionBinding,
            runtime,
            projector: auditProjector,
            repository: auditRepository,
            started_at: startedAt
          });
        }
        throw mapServiceError(error);
      }
      throw new SandboxSecurityHttpError({
        code: "SANDBOX_SECURITY_INTERNAL_ERROR",
        statusCode: 500
      });
    }
  }

  return Object.freeze({ evaluate, listAuditEvents });
}
