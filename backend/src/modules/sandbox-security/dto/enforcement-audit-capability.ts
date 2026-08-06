import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  type SandboxSecurityPolicyProfileId
} from "../../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityScope,
  SandboxSecurityProductionCompositionBinding
} from "../../../../../shared/types/sandbox-security-enforcement-audit.ts";

export interface SandboxSecurityEnforcementAuditCapabilityIssueRequest {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-request.v1";
  subject_id: string;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  ttl_seconds: number;
}

export interface SandboxSecurityEnforcementAuditCapabilityIssueResult {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-result.v1";
  capability_id: string;
  subject_id: string;
  scopes: [SandboxSecurityEnforcementAuditCapabilityScope];
  allowed_stages: ["user_input", "model_output", "tool_request"];
    allowed_policy_profile_ids: [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  bearer_token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: null;
}

export interface SandboxSecurityEnforcementAuditCapabilityPersistenceRecord {
  capability_id: string;
  subject_id: string;
  token_digest: `sha256:${string}`;
  scope_seed: Uint8Array;
  scopes: readonly [SandboxSecurityEnforcementAuditCapabilityScope];
  allowed_stages: readonly ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: readonly [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SandboxSecurityEnforcementAuditAuthorizedCapability {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly [SandboxSecurityEnforcementAuditCapabilityScope];
  allowed_stages: readonly ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: readonly [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  issued_at: string;
  expires_at: string;
}

type PlainRecord = Record<string, unknown>;

const REQUEST_KEYS = [
  "schema_version",
  "subject_id",
  "policy_profile_id",
  "ttl_seconds"
] as const;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function isOwnEnumerableDataRecord(value: unknown): value is PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
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

function hasExactKeys(value: PlainRecord): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === REQUEST_KEYS.length && REQUEST_KEYS.every((key) => Object.hasOwn(value, key));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest(
  value: unknown
): SandboxSecurityEnforcementAuditCapabilityIssueRequest | null {
  if (
    !isOwnEnumerableDataRecord(value) ||
    !hasExactKeys(value) ||
    value.schema_version !==
      "sandbox-security-enforcement-audit-capability-issue-request.v1" ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    !SANDBOX_SECURITY_POLICY_PROFILE_IDS.includes(
      value.policy_profile_id as SandboxSecurityPolicyProfileId
    ) ||
    typeof value.ttl_seconds !== "number" ||
    !Number.isSafeInteger(value.ttl_seconds) ||
    value.ttl_seconds < 60 ||
    value.ttl_seconds > 3600
  ) {
    return null;
  }

  return deepFreeze({
    schema_version:
      "sandbox-security-enforcement-audit-capability-issue-request.v1",
    subject_id: value.subject_id,
    policy_profile_id: value.policy_profile_id as SandboxSecurityPolicyProfileId,
    ttl_seconds: value.ttl_seconds
  });
}

export type {
  SandboxSecurityEnforcementAuditCapabilityScope,
  SandboxSecurityProductionCompositionBinding,
  SandboxSecurityPolicyProfileId
};
