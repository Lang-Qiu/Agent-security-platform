import {
  normalizeOpenClawEnforcementAuditAck,
  normalizeSandboxSecurityEnforcementAuditEvent,
  normalizeSandboxSecurityEnforcementAuditRequest
} from "../../../../shared/index.ts";
import type {
  OpenClawEnforcementAuditAck,
  SandboxSecurityEnforcementAuditEventCandidate,
  SandboxSecurityEnforcementAuditRequest
} from "../../../../shared/index.ts";
import type { SandboxSecurityEnforcementAuditRepository } from "./ports/enforcement-audit.repository.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  OpenClawEnforcementAuditIdentity,
  SandboxSecurityEnforcementAuditService
} from "./sandbox-security.types.ts";

function internalError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

function assertDependencies(input: Readonly<{
  repository: SandboxSecurityEnforcementAuditRepository;
  runtime: SandboxSecurityRuntimePort;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.repository === null ||
    typeof input.repository !== "object" ||
    typeof input.repository.append !== "function" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.now !== "function"
  ) {
    throw new TypeError("Invalid sandbox security enforcement audit service input");
  }
}

function createCandidate(
  request: Readonly<SandboxSecurityEnforcementAuditRequest>,
  identity: Readonly<OpenClawEnforcementAuditIdentity>,
  occurredAt: string
): Readonly<SandboxSecurityEnforcementAuditEventCandidate> {
  const normalized = normalizeSandboxSecurityEnforcementAuditEvent({
    ...request,
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    occurred_at: occurredAt,
    subject_id: identity.subject_id,
    authorization_scope_id: identity.authorization_scope_id,
    capability_id: identity.capability_id
  });
  if (normalized === null) throw internalError();
  const { occurred_at: _occurredAt, ...candidate } = normalized;
  return Object.freeze(candidate);
}

export function createSandboxSecurityEnforcementAuditService(input: Readonly<{
  repository: SandboxSecurityEnforcementAuditRepository;
  runtime: SandboxSecurityRuntimePort;
}>): SandboxSecurityEnforcementAuditService {
  assertDependencies(input);
  const repository = input.repository;
  const runtime = input.runtime;

  return {
    async appendEnforcementEvent(
      request: Readonly<SandboxSecurityEnforcementAuditRequest>,
      identity: Readonly<OpenClawEnforcementAuditIdentity>
    ): Promise<Readonly<OpenClawEnforcementAuditAck>> {
      try {
        const normalizedRequest = normalizeSandboxSecurityEnforcementAuditRequest(request);
        if (normalizedRequest === null) throw internalError();
        const occurredAt = runtime.now();
        const candidate = createCandidate(normalizedRequest, identity, occurredAt);
        const stored = repository.append({
          candidate,
          occurred_at: occurredAt
        });
        const ack = normalizeOpenClawEnforcementAuditAck({
          schema_version: "sandbox-security-enforcement-audit-ack.v1",
          ...stored
        });
        if (ack === null || ack.event_id !== normalizedRequest.event_id) {
          throw internalError();
        }
        return ack;
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    }
  };
}
