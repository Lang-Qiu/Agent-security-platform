import { createHash, timingSafeEqual } from "node:crypto";

import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityCapabilityScope } from "../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityRequest } from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS as PRIVATE_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES as PRIVATE_STAGES
} from "../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityProductionCompositionBinding
} from "../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityCapabilityRepository } from "./ports/capability.repository.ts";
import {
  createSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord,
  SandboxSecurityEnforcementAuditAuthorizedCapability
} from "./dto/enforcement-audit-capability.ts";
import type {
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityCapabilityAuthenticationResult,
  SandboxSecurityCapabilityAuditIdentity,
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityHmacService,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityProductionMode,
  SandboxSecurityStage
} from "./sandbox-security.types.ts";
import type {
  SandboxSecurityEnforcementAuditAuthenticator,
  SandboxSecurityEnforcementAuditCapabilityAuthenticationResult
} from "./sandbox-security.types.ts";

const CAPABILITY_TOKEN_PATTERN = /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const AUTHORIZATION_MODES = ["rule_only", "local", "local_and_judge"] as const;
const ENFORCEMENT_SCOPE = "sandbox_security:enforcement:audit:write" as const;
const COMPOSITION_BINDINGS = [
  "sandbox-security-production-composition.v1:rule_only",
  "sandbox-security-production-composition.v1:local",
  "sandbox-security-production-composition.v1:local_and_judge"
] as const satisfies readonly SandboxSecurityProductionCompositionBinding[];

type PlainRecord = Record<string, unknown>;

function isOwnEnumerableDataRecord(value: unknown): value is PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.every((key) => {
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
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
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

function readArrayElement(value: readonly unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
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

function normalizeCatalogArray<const T extends readonly string[]>(
  value: unknown,
  catalog: T
): T[number][] | null {
  if (!isDenseArray(value)) return null;
  const seen = new Set<string>();
  const supplied: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = readArrayElement(value, index);
    if (typeof item !== "string" || !catalog.includes(item) || seen.has(item)) {
      return null;
    }
    seen.add(item);
    supplied.push(item);
  }
  const ordered = catalog.filter((item) => seen.has(item)) as T[number][];
  return ordered.length === supplied.length && ordered.every((item, index) => item === supplied[index])
    ? ordered
    : null;
}

function normalizePersistenceRecord(
  value: unknown,
  expectedDigest: `sha256:${string}`
): SandboxSecurityCapabilityPersistenceRecord | null {
  const keys = [
    "capability_id",
    "subject_id",
    "token_digest",
    "scope_seed",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "issued_at",
    "expires_at",
    "revoked_at"
  ] as const;
  if (!isOwnEnumerableDataRecord(value) || !hasExactKeys(value, keys)) return null;
  if (
    typeof value.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value.capability_id) ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    typeof value.token_digest !== "string" ||
    !TOKEN_DIGEST_PATTERN.test(value.token_digest) ||
    value.token_digest !== expectedDigest ||
    !(value.scope_seed instanceof Uint8Array) ||
    value.scope_seed.byteLength !== 32 ||
    !isStrictUtcMillisecondTimestamp(value.issued_at) ||
    !isStrictUtcMillisecondTimestamp(value.expires_at) ||
    (value.revoked_at !== null && !isStrictUtcMillisecondTimestamp(value.revoked_at))
  ) {
    return null;
  }
  const scopes = normalizeCatalogArray(value.scopes, [
    "sandbox_security:evaluate",
    "sandbox_security:audit:read"
  ] as const);
  const stages = normalizeCatalogArray(value.allowed_stages, SANDBOX_SECURITY_STAGES);
  const profiles = normalizeCatalogArray(
    value.allowed_policy_profile_ids,
    SANDBOX_SECURITY_POLICY_PROFILE_IDS
  );
  if (scopes === null || stages === null || profiles === null || scopes.length === 0) {
    return null;
  }
  const evaluate = scopes.includes("sandbox_security:evaluate");
  if (evaluate !== (stages.length > 0 && profiles.length > 0)) return null;
  if (!evaluate && (stages.length !== 0 || profiles.length !== 0)) return null;
  return {
    capability_id: value.capability_id,
    subject_id: value.subject_id,
    token_digest: value.token_digest,
    scope_seed: new Uint8Array(value.scope_seed),
    scopes,
    allowed_stages: stages,
    allowed_policy_profile_ids: profiles,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at
  };
}

export function normalizeEnforcementPersistenceRecord(
  value: unknown,
  expectedDigest: `sha256:${string}`
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord | null {
  const keys = [
    "capability_id",
    "subject_id",
    "token_digest",
    "scope_seed",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "composition_binding",
    "issued_at",
    "expires_at",
    "revoked_at"
  ] as const;
  if (!isOwnEnumerableDataRecord(value) || !hasExactKeys(value, keys)) return null;
  if (
    typeof value.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value.capability_id) ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    typeof value.token_digest !== "string" ||
    !TOKEN_DIGEST_PATTERN.test(value.token_digest) ||
    value.token_digest !== expectedDigest ||
    !(value.scope_seed instanceof Uint8Array) ||
    value.scope_seed.byteLength !== 32 ||
    typeof value.composition_binding !== "string" ||
    !COMPOSITION_BINDINGS.includes(value.composition_binding as SandboxSecurityProductionCompositionBinding) ||
    !isStrictUtcMillisecondTimestamp(value.issued_at) ||
    !isStrictUtcMillisecondTimestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.issued_at) ||
    (value.revoked_at !== null && !isStrictUtcMillisecondTimestamp(value.revoked_at))
  ) {
    return null;
  }
  if (
    !isDenseArray(value.scopes) ||
    value.scopes.length !== 1 ||
    readArrayElement(value.scopes, 0) !== ENFORCEMENT_SCOPE ||
    !isDenseArray(value.allowed_stages) ||
    value.allowed_stages.length !== PRIVATE_STAGES.length ||
    PRIVATE_STAGES.some((stage, index) => readArrayElement(value.allowed_stages as readonly unknown[], index) !== stage) ||
    !isDenseArray(value.allowed_policy_profile_ids) ||
    value.allowed_policy_profile_ids.length !== 1 ||
    !PRIVATE_POLICY_PROFILE_IDS.includes(
      readArrayElement(value.allowed_policy_profile_ids, 0) as (typeof PRIVATE_POLICY_PROFILE_IDS)[number]
    )
  ) {
    return null;
  }
  return {
    capability_id: value.capability_id,
    subject_id: value.subject_id,
    token_digest: value.token_digest as `sha256:${string}`,
    scope_seed: new Uint8Array(value.scope_seed),
    scopes: [ENFORCEMENT_SCOPE],
    allowed_stages: [...PRIVATE_STAGES],
    allowed_policy_profile_ids: [
      readArrayElement(value.allowed_policy_profile_ids, 0) as (typeof PRIVATE_POLICY_PROFILE_IDS)[number]
    ],
    composition_binding: value.composition_binding as SandboxSecurityProductionCompositionBinding,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at
  };
}

function privateAuthorizationScopeId(
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>,
  hmac: SandboxSecurityHmacService,
  productionMode: SandboxSecurityProductionMode
): string | null {
  try {
    const scopeId = hmac.authorizationScopeId(record.scope_seed, productionMode);
    return typeof scopeId === "string" && AUTHORIZATION_SCOPE_PATTERN.test(scopeId)
      ? scopeId
      : null;
  } catch {
    return null;
  }
}

function toEnforcementAuthorizedCapability(
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>,
  authorizationScopeId: string
): SandboxSecurityEnforcementAuditAuthorizedCapability {
  return Object.freeze({
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    authorization_scope_id: authorizationScopeId,
    scopes: Object.freeze([ENFORCEMENT_SCOPE] as [typeof ENFORCEMENT_SCOPE]),
    allowed_stages: Object.freeze([...PRIVATE_STAGES] as [
      "user_input",
      "model_output",
      "tool_request"
    ]),
    allowed_policy_profile_ids: Object.freeze([...record.allowed_policy_profile_ids] as [
      (typeof PRIVATE_POLICY_PROFILE_IDS)[number]
    ]),
    composition_binding: record.composition_binding,
    issued_at: record.issued_at,
    expires_at: record.expires_at
  });
}

function toAuditIdentity(
  record: SandboxSecurityCapabilityPersistenceRecord,
  authorizationScopeId: string
): SandboxSecurityCapabilityAuditIdentity {
  return {
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    authorization_scope_id: authorizationScopeId,
    scopes: [...record.scopes],
    allowed_stages: [...record.allowed_stages],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids],
    issued_at: record.issued_at,
    expires_at: record.expires_at
  };
}

function tokenDigest(token: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(token, "ascii").digest("hex")}`;
}

export function createSandboxSecurityCapabilityAuthenticator(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  bootstrap_admin_token: string;
  now: () => string;
}>): SandboxSecurityCapabilityAuthenticator & SandboxSecurityEnforcementAuditAuthenticator {
  if (
    input === null ||
    typeof input !== "object" ||
    !input.repository ||
    typeof input.repository.findByTokenDigest !== "function" ||
    !input.hmac ||
    typeof input.hmac.authorizationScopeId !== "function" ||
    !AUTHORIZATION_MODES.includes(input.production_mode) ||
    typeof input.bootstrap_admin_token !== "string" ||
    typeof input.now !== "function"
  ) {
    throw new TypeError("Invalid sandbox security capability authenticator input");
  }

  const repository = input.repository;
  const hmac = input.hmac;
  const productionMode = input.production_mode;
  const bootstrapAdminToken = input.bootstrap_admin_token;
  const now = input.now;

  const authenticator: SandboxSecurityCapabilityAuthenticator & SandboxSecurityEnforcementAuditAuthenticator = {
    authenticateToken(token: string): SandboxSecurityCapabilityAuthenticationResult {
      if (typeof token !== "string" || !CAPABILITY_TOKEN_PATTERN.test(token)) {
        return { kind: "unknown" };
      }

      const digest = tokenDigest(token);
      const rawRecord = repository.findByTokenDigest(digest);
      const record = normalizePersistenceRecord(rawRecord, digest);
      if (record === null) return { kind: "unknown" };

      let authorizationScopeId: string;
      try {
        authorizationScopeId = hmac.authorizationScopeId(record.scope_seed, productionMode);
      } catch {
        return { kind: "unknown" };
      }

      if (record.revoked_at !== null) {
        return {
          kind: "known_denied",
          rejection_code: "capability_revoked",
          audit_identity: toAuditIdentity(record, authorizationScopeId)
        };
      }

      const nowValue = now();
      if (!isStrictUtcMillisecondTimestamp(nowValue)) return { kind: "unknown" };
      if (Date.parse(record.expires_at) <= Date.parse(nowValue)) {
        return {
          kind: "known_denied",
          rejection_code: "capability_expired",
          audit_identity: toAuditIdentity(record, authorizationScopeId)
        };
      }

      const authorized: SandboxSecurityAuthorizedCapability = {
        capability_id: record.capability_id,
        subject_id: record.subject_id,
        authorization_scope_id: authorizationScopeId,
        scopes: Object.freeze([...record.scopes]),
        allowed_stages: Object.freeze([...record.allowed_stages]),
        allowed_policy_profile_ids: Object.freeze([...record.allowed_policy_profile_ids]),
        issued_at: record.issued_at,
        expires_at: record.expires_at
      };
      return { kind: "authorized", capability: Object.freeze(authorized) };
    },

    authenticateEnforcementAuditToken(
      token: string
    ): SandboxSecurityEnforcementAuditCapabilityAuthenticationResult {
      if (typeof token !== "string" || !CAPABILITY_TOKEN_PATTERN.test(token)) {
        return { kind: "unknown" };
      }
      const digest = tokenDigest(token);
      const rawRecord = repository.findByTokenDigest(digest);
      const record = normalizeEnforcementPersistenceRecord(rawRecord, digest);
      if (record === null) return { kind: "unknown" };
      const authorizationScopeId = privateAuthorizationScopeId(
        record,
        hmac,
        productionMode
      );
      if (authorizationScopeId === null) return { kind: "unknown" };
      const identity = toEnforcementAuthorizedCapability(record, authorizationScopeId);
      if (record.revoked_at !== null) {
        return {
          kind: "known_denied",
          rejection_code: "capability_revoked",
          audit_identity: identity
        };
      }
      const nowValue = now();
      if (
        !isStrictUtcMillisecondTimestamp(nowValue) ||
        Date.parse(record.expires_at) <= Date.parse(nowValue)
      ) {
        return {
          kind: "known_denied",
          rejection_code: "capability_expired",
          audit_identity: identity
        };
      }
      return { kind: "authorized", capability: identity };
    },

    requireScope(
      capability: SandboxSecurityAuthorizedCapability,
      scope: SandboxSecurityCapabilityScope
    ): void {
      if (!Array.isArray(capability.scopes) || !capability.scopes.includes(scope)) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: "scope_forbidden"
        });
      }
    },

    requireEvaluationGrant(
      capability: SandboxSecurityAuthorizedCapability,
      submission: SandboxSecurityRequest
    ): void {
      authenticator.requireScope(capability, "sandbox_security:evaluate");
      if (!capability.allowed_stages.includes(submission.stage as SandboxSecurityStage)) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: "stage_forbidden"
        });
      }
      if (
        !capability.allowed_policy_profile_ids.includes(
          submission.policy_profile_id as SandboxSecurityPolicyProfileId
        )
      ) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: "profile_forbidden"
        });
      }
    },

    requireEnforcementAuditGrant(
      capability,
      context
    ): SandboxSecurityEnforcementAuditAuthorizedCapability {
      const reject = (
        auditRejectionCode: "scope_forbidden" | "stage_forbidden" | "profile_forbidden"
      ): never => {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_FORBIDDEN",
          audit_rejection_code: auditRejectionCode
        });
      };
      if (
        capability === null ||
        typeof capability !== "object" ||
        !Array.isArray(capability.scopes) ||
        capability.scopes.length !== 1 ||
        capability.scopes[0] !== ENFORCEMENT_SCOPE
      ) {
        return reject("scope_forbidden");
      }
      if (
        !Array.isArray(capability.allowed_stages) ||
        capability.allowed_stages.length !== PRIVATE_STAGES.length ||
        capability.allowed_stages.some((stage, index) => stage !== PRIVATE_STAGES[index])
      ) {
        return reject("stage_forbidden");
      }
      if (
        !Array.isArray(capability.allowed_policy_profile_ids) ||
        capability.allowed_policy_profile_ids.length !== 1 ||
        !PRIVATE_POLICY_PROFILE_IDS.includes(capability.allowed_policy_profile_ids[0] as (typeof PRIVATE_POLICY_PROFILE_IDS)[number])
      ) {
        return reject("profile_forbidden");
      }
      if (
        context === null ||
        typeof context !== "object" ||
        !hasExactKeys(context as PlainRecord, ["stage", "policy_profile_id", "composition_binding"]) ||
        !PRIVATE_STAGES.includes(context.stage as (typeof PRIVATE_STAGES)[number]) ||
        !PRIVATE_POLICY_PROFILE_IDS.includes(context.policy_profile_id as (typeof PRIVATE_POLICY_PROFILE_IDS)[number]) ||
        !COMPOSITION_BINDINGS.includes(context.composition_binding as SandboxSecurityProductionCompositionBinding)
      ) {
        return reject("scope_forbidden");
      }
      if (!capability.allowed_stages.includes(context.stage as SandboxSecurityStage)) {
        return reject("stage_forbidden");
      }
      if (capability.allowed_policy_profile_ids[0] !== context.policy_profile_id) {
        return reject("profile_forbidden");
      }
      const currentComposition = `sandbox-security-production-composition.v1:${productionMode}` as SandboxSecurityProductionCompositionBinding;
      if (
        capability.composition_binding !== context.composition_binding ||
        capability.composition_binding !== currentComposition
      ) {
        return reject("scope_forbidden");
      }
      const nowValue = now();
      if (
        !isStrictUtcMillisecondTimestamp(nowValue) ||
        Date.parse(capability.expires_at) <= Date.parse(nowValue)
      ) {
        return reject("scope_forbidden");
      }
      return capability;
    },

    authenticateAdministrator(token: string): void {
      const supplied = createHash("sha256")
        .update(typeof token === "string" ? token : "", "utf8")
        .digest();
      const expected = createHash("sha256")
        .update(bootstrapAdminToken, "utf8")
        .digest();
      if (!timingSafeEqual(supplied, expected)) {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
        });
      }
    }
  };
  return Object.freeze(authenticator);
}
