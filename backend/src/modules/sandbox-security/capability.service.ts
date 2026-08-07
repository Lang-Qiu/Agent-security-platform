import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityCapabilityScope } from "../../../../shared/types/sandbox-security-api.ts";
import { normalizeSandboxSecurityEnforcementAuditEvent } from "../../../../shared/contracts/sandbox-security-enforcement-audit.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityIssuedEvent,
  SandboxSecurityProductionCompositionBinding
} from "../../../../shared/types/sandbox-security-enforcement-audit.ts";
import { normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest } from "./dto/enforcement-audit-capability.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityIssueRequest,
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord
} from "./dto/enforcement-audit-capability.ts";
import type {
  SandboxSecurityCapabilityRepository,
  SandboxSecurityEnforcementAuditCapabilityRepository
} from "./ports/capability.repository.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import {
  createSandboxSecurityOpaqueCapability
} from "./hmac.ts";
import {
  createSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityCapabilityIssueResult,
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityCapabilityPublicRecord,
  SandboxSecurityCapabilityService,
  SandboxSecurityEnforcementAuditCapabilityRecord,
  SandboxSecurityEnforcementAuditCapabilityService,
  SandboxSecurityHmacService,
  SandboxSecurityNormalizedCapabilityIssueRequest,
  SandboxSecurityProductionMode
} from "./sandbox-security.types.ts";

const PRODUCTION_MODES = ["rule_only", "local", "local_and_judge"] as const;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIT_EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const CAPABILITY_SCOPES = [
  "sandbox_security:evaluate",
  "sandbox_security:audit:read"
] as const satisfies readonly SandboxSecurityCapabilityScope[];
const REVOKE_NOT_FOUND = Symbol("sandbox-security-revoke-not-found");
const ENFORCEMENT_SCOPE = "sandbox_security:enforcement:audit:write" as const;
const ENFORCEMENT_STAGES = ["user_input", "model_output", "tool_request"] as const;

type PlainRecord = Record<string, unknown>;

function internalError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

function compositionBinding(
  productionMode: SandboxSecurityProductionMode
): SandboxSecurityProductionCompositionBinding {
  return `sandbox-security-production-composition.v1:${productionMode}` as SandboxSecurityProductionCompositionBinding;
}

function isOwnDataRecord(value: unknown): value is PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function hasExactKeys(value: PlainRecord, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return false;
  }
  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return false;
    }
  }
  return ownKeys.every((key) => {
    if (key === "length") return true;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) return false;
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < length;
  });
}

function isStrictUtcMillisecondTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = UTC_MILLISECOND_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : daysInMonth[month - 1];
  if (day < 1 || day > maxDay) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasOrderedCatalogValues<T extends string>(
  value: unknown,
  catalog: readonly T[],
  allowEmpty: boolean
): value is readonly T[] {
  if (!isDenseArray(value) || (!allowEmpty && value.length === 0)) return false;
  let previous = -1;
  for (const item of value) {
    if (typeof item !== "string") return false;
    const index = catalog.indexOf(item as T);
    if (index < 0 || index <= previous) return false;
    previous = index;
  }
  return true;
}

function normalizedIssueRequest(
  request: Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>
): Readonly<SandboxSecurityNormalizedCapabilityIssueRequest> {
  const value = request as unknown;
  const keys = [
    "schema_version",
    "subject_id",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "ttl_seconds"
  ] as const;
  if (
    !isOwnDataRecord(value) ||
    !hasExactKeys(value, keys) ||
    value.schema_version !== "sandbox-security-capability-issue-request.v1" ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    !Number.isSafeInteger(value.ttl_seconds) ||
    (value.ttl_seconds as number) < 60 ||
    (value.ttl_seconds as number) > 3600 ||
    !hasOrderedCatalogValues(value.scopes, CAPABILITY_SCOPES, false) ||
    !hasOrderedCatalogValues(value.allowed_stages, SANDBOX_SECURITY_STAGES, true) ||
    !hasOrderedCatalogValues(
      value.allowed_policy_profile_ids,
      SANDBOX_SECURITY_POLICY_PROFILE_IDS,
      true
    )
  ) {
    throw internalError();
  }
  const evaluate = value.scopes.includes("sandbox_security:evaluate");
  if (
    evaluate !==
    (value.allowed_stages.length > 0 && value.allowed_policy_profile_ids.length > 0)
  ) {
    throw internalError();
  }
  if (
    !evaluate &&
    (value.allowed_stages.length !== 0 || value.allowed_policy_profile_ids.length !== 0)
  ) {
    throw internalError();
  }
  return value as Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>;
}

function copyRecordArrays(
  record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
): SandboxSecurityCapabilityPersistenceRecord {
  return {
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    token_digest: record.token_digest,
    scope_seed: new Uint8Array(record.scope_seed),
    scopes: [...record.scopes],
    allowed_stages: [...record.allowed_stages],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids],
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function copyEnforcementRecord(
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord {
  return {
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    token_digest: record.token_digest,
    scope_seed: new Uint8Array(record.scope_seed),
    scopes: [ENFORCEMENT_SCOPE],
    allowed_stages: [...ENFORCEMENT_STAGES],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids] as [
      (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number]
    ],
    composition_binding: record.composition_binding,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function publicRecord(
  record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
): SandboxSecurityCapabilityPublicRecord {
  if (
    typeof record.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(record.capability_id) ||
    typeof record.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(record.subject_id) ||
    !isStrictUtcMillisecondTimestamp(record.issued_at) ||
    !isStrictUtcMillisecondTimestamp(record.expires_at) ||
    Date.parse(record.expires_at) <= Date.parse(record.issued_at) ||
    (record.revoked_at !== null &&
      (!isStrictUtcMillisecondTimestamp(record.revoked_at) ||
        Date.parse(record.revoked_at) < Date.parse(record.issued_at))) ||
    !hasOrderedCatalogValues(record.scopes, CAPABILITY_SCOPES, false) ||
    !hasOrderedCatalogValues(record.allowed_stages, SANDBOX_SECURITY_STAGES, true) ||
    !hasOrderedCatalogValues(
      record.allowed_policy_profile_ids,
      SANDBOX_SECURITY_POLICY_PROFILE_IDS,
      true
    ) ||
    (record.scopes.includes("sandbox_security:evaluate") !==
      (record.allowed_stages.length > 0 && record.allowed_policy_profile_ids.length > 0)) ||
    (!record.scopes.includes("sandbox_security:evaluate") &&
      (record.allowed_stages.length !== 0 || record.allowed_policy_profile_ids.length !== 0))
  ) {
    throw internalError();
  }
  return {
    schema_version: "sandbox-security-capability-record.v1",
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    scopes: [...record.scopes],
    allowed_stages: [...record.allowed_stages],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids],
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function enforcementCapabilityRecord(
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>,
  expectedComposition: SandboxSecurityProductionCompositionBinding
): SandboxSecurityEnforcementAuditCapabilityRecord {
  if (
    !CAPABILITY_ID_PATTERN.test(record.capability_id) ||
    !SUBJECT_PATTERN.test(record.subject_id) ||
    !hasOrderedCatalogValues(record.scopes, [ENFORCEMENT_SCOPE] as const, false) ||
    record.scopes.length !== 1 ||
    !hasOrderedCatalogValues(record.allowed_stages, ENFORCEMENT_STAGES, false) ||
    record.allowed_stages.length !== ENFORCEMENT_STAGES.length ||
    !hasOrderedCatalogValues(
      record.allowed_policy_profile_ids,
      SANDBOX_SECURITY_POLICY_PROFILE_IDS,
      false
    ) ||
    record.allowed_policy_profile_ids.length !== 1 ||
    record.composition_binding !== expectedComposition ||
    !isStrictUtcMillisecondTimestamp(record.issued_at) ||
    !isStrictUtcMillisecondTimestamp(record.expires_at) ||
    Date.parse(record.expires_at) <= Date.parse(record.issued_at) ||
    (record.revoked_at !== null &&
      (!isStrictUtcMillisecondTimestamp(record.revoked_at) ||
        Date.parse(record.revoked_at) < Date.parse(record.issued_at)))
  ) {
    throw internalError();
  }
  return {
    schema_version: "sandbox-security-enforcement-audit-capability-record.v1",
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    scopes: [ENFORCEMENT_SCOPE],
    allowed_stages: [...ENFORCEMENT_STAGES],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids] as [
      (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number]
    ],
    composition_binding: record.composition_binding,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function assertDependencies(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  enforcement_audit_repository: SandboxSecurityEnforcementAuditCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.repository === null ||
    typeof input.repository !== "object" ||
    typeof input.repository.issueWithAudit !== "function" ||
    typeof input.repository.revokeWithAudit !== "function" ||
    input.enforcement_audit_repository === null ||
    typeof input.enforcement_audit_repository !== "object" ||
    typeof input.enforcement_audit_repository.issueEnforcementAuditWithAudit !== "function" ||
    typeof input.enforcement_audit_repository.revokeEnforcementAudit !== "function" ||
    input.hmac === null ||
    typeof input.hmac !== "object" ||
    typeof input.hmac.authorizationScopeId !== "function" ||
    !PRODUCTION_MODES.includes(input.production_mode) ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.now !== "function" ||
    typeof input.runtime.randomBytes !== "function" ||
    typeof input.runtime.nextCapabilityId !== "function" ||
    typeof input.runtime.nextAuditEventId !== "function" ||
    input.audit_projector === null ||
    typeof input.audit_projector !== "object" ||
    typeof input.audit_projector.capabilityIssued !== "function" ||
    typeof input.audit_projector.capabilityRevoked !== "function" ||
    input.capability_limiters === null ||
    typeof input.capability_limiters !== "object" ||
    typeof input.capability_limiters.remove !== "function"
  ) {
    throw new TypeError("Invalid sandbox security capability service input");
  }
}

export function createSandboxSecurityCapabilityService(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  enforcement_audit_repository: SandboxSecurityEnforcementAuditCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
}>): SandboxSecurityCapabilityService & SandboxSecurityEnforcementAuditCapabilityService {
  assertDependencies(input);
  const repository = input.repository;
  const hmac = input.hmac;
  const productionMode = input.production_mode;
  const runtime = input.runtime;
  const auditProjector = input.audit_projector;
  const capabilityLimiters = input.capability_limiters;
  const enforcementRepository = input.enforcement_audit_repository;
  const expectedComposition = compositionBinding(productionMode);

  return {
    issue(request): Readonly<SandboxSecurityCapabilityIssueResult> {
      try {
        const normalized = normalizedIssueRequest(request);
        const issuedAt = runtime.now();
        if (!isStrictUtcMillisecondTimestamp(issuedAt)) throw internalError();
        const expiresAt = new Date(
          Date.parse(issuedAt) + normalized.ttl_seconds * 1000
        ).toISOString();
        const capabilityId = runtime.nextCapabilityId();
        if (typeof capabilityId !== "string" || !CAPABILITY_ID_PATTERN.test(capabilityId)) {
          throw internalError();
        }
        const rawScopeSeed = runtime.randomBytes(32);
        if (!(rawScopeSeed instanceof Uint8Array) || rawScopeSeed.byteLength !== 32) {
          throw internalError();
        }
        const scopeSeed = new Uint8Array(rawScopeSeed);
        const opaque = createSandboxSecurityOpaqueCapability({
          random_bytes: (length) => runtime.randomBytes(length)
        });
        const authorizationScopeId = hmac.authorizationScopeId(
          new Uint8Array(scopeSeed),
          productionMode
        );
        if (
          typeof authorizationScopeId !== "string" ||
          !AUTHORIZATION_SCOPE_PATTERN.test(authorizationScopeId)
        ) {
          throw internalError();
        }
        const record: SandboxSecurityCapabilityPersistenceRecord = {
          capability_id: capabilityId,
          subject_id: normalized.subject_id,
          token_digest: opaque.token_digest,
          scope_seed: new Uint8Array(scopeSeed),
          scopes: [...normalized.scopes],
          allowed_stages: [...normalized.allowed_stages],
          allowed_policy_profile_ids: [...normalized.allowed_policy_profile_ids],
          issued_at: issuedAt,
          expires_at: expiresAt,
          revoked_at: null
        };
        const auditEventId = runtime.nextAuditEventId();
        if (typeof auditEventId !== "string" || !AUDIT_EVENT_ID_PATTERN.test(auditEventId)) {
          throw internalError();
        }
        const event = auditProjector.capabilityIssued({
          event_id: auditEventId,
          occurred_at: issuedAt,
          subject_id: normalized.subject_id,
          authorization_scope_id: authorizationScopeId,
          capability_id: capabilityId,
          scopes: [...normalized.scopes],
          allowed_stages: [...normalized.allowed_stages],
          allowed_policy_profile_ids: [...normalized.allowed_policy_profile_ids],
          issued_at: issuedAt,
          expires_at: expiresAt
        });
        repository.issueWithAudit(copyRecordArrays(record), event);
        return {
          schema_version: "sandbox-security-capability-issue-result.v1",
          capability_id: record.capability_id,
          subject_id: record.subject_id,
          scopes: [...record.scopes],
          allowed_stages: [...record.allowed_stages],
          allowed_policy_profile_ids: [...record.allowed_policy_profile_ids],
          bearer_token: opaque.bearer_token,
          issued_at: record.issued_at,
          expires_at: record.expires_at,
          revoked_at: null
        };
      } catch {
        throw internalError();
      }
    },

    issueEnforcementAudit(request: Readonly<SandboxSecurityEnforcementAuditCapabilityIssueRequest>): Readonly<SandboxSecurityEnforcementAuditCapabilityIssueResult> {
      try {
        if (typeof enforcementRepository.issueEnforcementAuditWithAudit !== "function") {
          throw internalError();
        }
        const normalized = normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest(request);
        if (normalized === null) throw internalError();
        const issuedAt = runtime.now();
        if (!isStrictUtcMillisecondTimestamp(issuedAt)) throw internalError();
        const expiresAt = new Date(
          Date.parse(issuedAt) + normalized.ttl_seconds * 1000
        ).toISOString();
        const capabilityId = runtime.nextCapabilityId();
        if (typeof capabilityId !== "string" || !CAPABILITY_ID_PATTERN.test(capabilityId)) {
          throw internalError();
        }
        const scopeSeed = runtime.randomBytes(32);
        if (!(scopeSeed instanceof Uint8Array) || scopeSeed.byteLength !== 32) {
          throw internalError();
        }
        const opaque = createSandboxSecurityOpaqueCapability({
          random_bytes: (length) => runtime.randomBytes(length)
        });
        const authorizationScopeId = hmac.authorizationScopeId(
          new Uint8Array(scopeSeed),
          productionMode
        );
        if (
          typeof authorizationScopeId !== "string" ||
          !AUTHORIZATION_SCOPE_PATTERN.test(authorizationScopeId)
        ) {
          throw internalError();
        }
        const record: SandboxSecurityEnforcementAuditCapabilityPersistenceRecord = {
          capability_id: capabilityId,
          subject_id: normalized.subject_id,
          token_digest: opaque.token_digest,
          scope_seed: new Uint8Array(scopeSeed),
          scopes: [ENFORCEMENT_SCOPE] as [typeof ENFORCEMENT_SCOPE],
          allowed_stages: [...ENFORCEMENT_STAGES] as [
            "user_input",
            "model_output",
            "tool_request"
          ],
          allowed_policy_profile_ids: [normalized.policy_profile_id] as [
            (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number]
          ],
          composition_binding: compositionBinding(productionMode),
          issued_at: issuedAt,
          expires_at: expiresAt,
          revoked_at: null
        };
        const auditEventId = runtime.nextAuditEventId();
        if (typeof auditEventId !== "string" || !AUDIT_EVENT_ID_PATTERN.test(auditEventId)) {
          throw internalError();
        }
        const event = normalizeSandboxSecurityEnforcementAuditEvent({
          schema_version: "sandbox-security-enforcement-audit-event.v1",
          event_id: auditEventId,
          event_type: "capability_issued",
          occurred_at: issuedAt,
          subject_id: normalized.subject_id,
          authorization_scope_id: authorizationScopeId,
          capability_id: capabilityId,
          scopes: [ENFORCEMENT_SCOPE] as [typeof ENFORCEMENT_SCOPE],
          allowed_stages: [...ENFORCEMENT_STAGES],
          allowed_policy_profile_ids: [normalized.policy_profile_id] as [
            (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number]
          ],
          composition_binding: compositionBinding(productionMode),
          issued_at: issuedAt,
          expires_at: expiresAt
        });
        if (event === null || event.event_type !== "capability_issued") {
          throw internalError();
        }
        enforcementRepository.issueEnforcementAuditWithAudit(
          copyEnforcementRecord(record),
          event as SandboxSecurityEnforcementAuditCapabilityIssuedEvent
        );
        return Object.freeze({
          schema_version: "sandbox-security-enforcement-audit-capability-issue-result.v1",
          capability_id: record.capability_id,
          subject_id: record.subject_id,
          scopes: [ENFORCEMENT_SCOPE] as [typeof ENFORCEMENT_SCOPE],
          allowed_stages: [...ENFORCEMENT_STAGES] as [
            "user_input",
            "model_output",
            "tool_request"
          ],
          allowed_policy_profile_ids: [normalized.policy_profile_id] as [
            (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number]
          ],
          composition_binding: record.composition_binding,
          bearer_token: opaque.bearer_token,
          issued_at: record.issued_at,
          expires_at: record.expires_at,
          revoked_at: null
        });
      } catch {
        throw internalError();
      }
    },

    revoke(capabilityId): Readonly<
      SandboxSecurityCapabilityPublicRecord | SandboxSecurityEnforcementAuditCapabilityRecord
    > {
      try {
        if (typeof capabilityId !== "string") throw internalError();
        const revokedAt = runtime.now();
        if (!isStrictUtcMillisecondTimestamp(revokedAt)) throw internalError();
        let record: Readonly<
          SandboxSecurityCapabilityPersistenceRecord |
          SandboxSecurityEnforcementAuditCapabilityPersistenceRecord
        > | null;
        try {
          record = enforcementRepository.revokeEnforcementAudit({
            capability_id: capabilityId,
            revoked_at: revokedAt,
            composition_binding: expectedComposition
          });
          if (record === null) {
            record = repository.revokeWithAudit({
              capability_id: capabilityId,
              revoked_at: revokedAt,
              create_event: (target) => {
                const normalized = copyRecordArrays(target);
                if (
                  !(target.scope_seed instanceof Uint8Array) ||
                  target.scope_seed.byteLength !== 32 ||
                  !isStrictUtcMillisecondTimestamp(normalized.revoked_at) ||
                  !CAPABILITY_ID_PATTERN.test(normalized.capability_id) ||
                  !isStrictUtcMillisecondTimestamp(normalized.issued_at) ||
                  !isStrictUtcMillisecondTimestamp(normalized.expires_at) ||
                  !(normalized.scope_seed instanceof Uint8Array) ||
                  normalized.scope_seed.byteLength !== 32
                ) {
                  throw internalError();
                }
                publicRecord(normalized);
                const authorizationScopeId = hmac.authorizationScopeId(
                  new Uint8Array(normalized.scope_seed),
                  productionMode
                );
                if (
                  typeof authorizationScopeId !== "string" ||
                  !AUTHORIZATION_SCOPE_PATTERN.test(authorizationScopeId)
                ) {
                  throw internalError();
                }
                const occurredAt = runtime.now();
                if (!isStrictUtcMillisecondTimestamp(occurredAt)) throw internalError();
                const auditEventId = runtime.nextAuditEventId();
                if (typeof auditEventId !== "string" || !AUDIT_EVENT_ID_PATTERN.test(auditEventId)) {
                  throw internalError();
                }
                return auditProjector.capabilityRevoked({
                  event_id: auditEventId,
                  occurred_at: occurredAt,
                  subject_id: normalized.subject_id,
                  authorization_scope_id: authorizationScopeId,
                  capability_id: normalized.capability_id,
                  revoked_at: normalized.revoked_at
                });
              }
            });
          }
        } catch {
          throw internalError();
        }
        if (record === null) {
          throw REVOKE_NOT_FOUND;
        }
        if (record.revoked_at === null) throw internalError();
        const projected = "composition_binding" in record
          ? enforcementCapabilityRecord(record, expectedComposition)
          : publicRecord(record);
        capabilityLimiters.remove(capabilityId);
        return projected;
      } catch (error) {
        if (error === REVOKE_NOT_FOUND) {
          throw createSandboxSecurityServiceError({
            code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
          });
        }
        throw internalError();
      }
    }
  };
}
