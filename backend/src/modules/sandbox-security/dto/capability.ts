import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityCapabilityScope
} from "../../../../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityCapabilityIssueRequest,
  SandboxSecurityNormalizedCapabilityIssueRequest
} from "../sandbox-security.types.ts";

const SANDBOX_SECURITY_CAPABILITY_SCOPES = [
  "sandbox_security:evaluate",
  "sandbox_security:audit:read"
] as const satisfies readonly SandboxSecurityCapabilityScope[];

const REQUEST_KEYS = [
  "schema_version",
  "subject_id",
  "scopes",
  "allowed_stages",
  "allowed_policy_profile_ids"
] as const;
const REQUEST_KEYS_WITH_TTL = [...REQUEST_KEYS, "ttl_seconds"] as const;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

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

function isDenseOrdinaryArray(value: unknown): value is unknown[] {
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

function readArrayElement(value: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function normalizeCatalogArray<const T extends readonly string[]>(
  value: unknown,
  catalog: T,
  minimumLength: number
): T[number][] | null {
  if (!isDenseOrdinaryArray(value) || value.length < minimumLength) return null;

  const supplied = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = readArrayElement(value, index);
    if (
      typeof item !== "string" ||
      !catalog.includes(item) ||
      supplied.has(item)
    ) {
      return null;
    }
    supplied.add(item);
  }

  return catalog.filter((item) => supplied.has(item)) as T[number][];
}

export function normalizeSandboxSecurityCapabilityIssueRequest(
  value: unknown
): SandboxSecurityNormalizedCapabilityIssueRequest | null {
  if (!isOwnEnumerableDataRecord(value)) return null;

  const hasTtl = Object.prototype.hasOwnProperty.call(value, "ttl_seconds");
  if (!hasExactKeys(value, hasTtl ? REQUEST_KEYS_WITH_TTL : REQUEST_KEYS)) {
    return null;
  }
  if (
    value.schema_version !== "sandbox-security-capability-issue-request.v1" ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id)
  ) {
    return null;
  }

  const scopes = normalizeCatalogArray(
    value.scopes,
    SANDBOX_SECURITY_CAPABILITY_SCOPES,
    1
  );
  const allowedStages = normalizeCatalogArray(
    value.allowed_stages,
    SANDBOX_SECURITY_STAGES,
    0
  );
  const allowedProfiles = normalizeCatalogArray(
    value.allowed_policy_profile_ids,
    SANDBOX_SECURITY_POLICY_PROFILE_IDS,
    0
  );
  if (scopes === null || allowedStages === null || allowedProfiles === null) {
    return null;
  }

  const hasEvaluateScope = scopes.includes("sandbox_security:evaluate");
  if (hasEvaluateScope !== (allowedStages.length > 0 && allowedProfiles.length > 0)) {
    return null;
  }
  if (!hasEvaluateScope && (allowedStages.length !== 0 || allowedProfiles.length !== 0)) {
    return null;
  }

  let ttlSeconds = 900;
  if (hasTtl) {
    if (
      typeof value.ttl_seconds !== "number" ||
      !Number.isSafeInteger(value.ttl_seconds) ||
      value.ttl_seconds < 60 ||
      value.ttl_seconds > 3600
    ) {
      return null;
    }
    ttlSeconds = value.ttl_seconds;
  }

  return {
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: value.subject_id,
    scopes,
    allowed_stages: allowedStages,
    allowed_policy_profile_ids: allowedProfiles,
    ttl_seconds: ttlSeconds
  };
}

export type { SandboxSecurityCapabilityIssueRequest };
