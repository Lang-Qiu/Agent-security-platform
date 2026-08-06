import {
  SANDBOX_SECURITY_ACTIONS,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES,
  SANDBOX_SECURITY_STAGES,
  SANDBOX_SECURITY_VERDICTS,
  type SandboxDetectorRunStatus,
  type SandboxSecurityAction,
  type SandboxSecurityPolicyProfileId,
  type SandboxSecuritySeverity,
  type SandboxSecurityStage,
  type SandboxSecurityVerdict
} from "../types/sandbox-security.ts";
import type {
  SandboxSecurityAuditCategoryCounts,
  SandboxSecurityAuditRunStatusCounts
} from "../types/sandbox-security-api.ts";
import type {
  OpenClawEnforcementAuditAck,
  SandboxSecurityEnforcementAuditCapabilityIssuedEvent,
  SandboxSecurityEnforcementAuditEvent,
  SandboxSecurityEnforcementAuditRequest,
  SandboxSecurityEnforcementAuditRequestCommon,
  SandboxSecurityEnforcementCompletedEvent,
  SandboxSecurityEnforcementInterruptionCode,
  SandboxSecurityEnforcementInterruptedEvent,
  SandboxSecurityEnforcementPoint,
  SandboxSecurityProductionCompositionBinding
} from "../types/sandbox-security-enforcement-audit.ts";

type PlainRecord = Record<string, unknown>;

const AUDIT_EVENT_SCHEMA_VERSION =
  "sandbox-security-enforcement-audit-event.v1" as const;
const AUDIT_REQUEST_SCHEMA_VERSION =
  "sandbox-security-enforcement-audit-request.v1" as const;
const ACK_SCHEMA_VERSION = "sandbox-security-enforcement-audit-ack.v1" as const;
const ENFORCEMENT_POINTS = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
] as const satisfies readonly SandboxSecurityEnforcementPoint[];
const INTERRUPTION_CODES = [
  "authority_mismatch",
  "correlation_mismatch",
  "unsupported_input",
  "engine_error",
  "engine_timeout",
  "engine_slot_unavailable",
  "barrier_timeout",
  "startup_recovery"
] as const satisfies readonly SandboxSecurityEnforcementInterruptionCode[];
const COMPOSITION_BINDINGS = [
  "sandbox-security-production-composition.v1:rule_only",
  "sandbox-security-production-composition.v1:local",
  "sandbox-security-production-composition.v1:local_and_judge"
] as const satisfies readonly SandboxSecurityProductionCompositionBinding[];
const RUN_STATUS_CATALOG = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const satisfies readonly SandboxDetectorRunStatus[];
const ENFORCEMENT_SCOPE = "sandbox_security:enforcement:audit:write" as const;

const AUDIT_EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID_PATTERN =
  /^request:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const AUTHORIZATION_SCOPE_ID_PATTERN =
  /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

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

function hasExactKeys(value: unknown, keys: readonly string[]): value is PlainRecord {
  if (!isOwnEnumerableDataRecord(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isDenseOrdinaryArray(value: unknown, expectedLength?: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    (expectedLength !== undefined && lengthDescriptor.value !== expectedLength)
  ) {
    return false;
  }
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return false;
    }
  }
  return keys.every((key) => {
    if (key === "length") return true;
    return typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length;
  });
}

function arrayValue(value: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function isCatalogValue<const T extends readonly string[]>(catalog: T, value: unknown): value is T[number] {
  return typeof value === "string" && catalog.includes(value);
}

function isStrictTimestamp(value: unknown): value is string {
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
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : monthLengths[month - 1]!;
  if (day < 1 || day > maxDay) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSafeBoundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4096;
}

function normalizeCounts<const T extends readonly string[]>(
  value: unknown,
  catalog: T
): Record<T[number], number> | null {
  if (!hasExactKeys(value, catalog) || JSON.stringify(Object.keys(value)) !== JSON.stringify(catalog)) {
    return null;
  }
  const normalized = {} as Record<T[number], number>;
  let total = 0;
  for (const key of catalog) {
    const count = value[key];
    if (!isSafeBoundedCount(count)) return null;
    total += count;
    if (total > 4096) return null;
    normalized[key as T[number]] = count;
  }
  return normalized;
}

function pointStageMatches(
  point: SandboxSecurityEnforcementPoint,
  stage: SandboxSecurityStage
): boolean {
  return (
    (point === "before_agent_run" && stage === "user_input") ||
    (point === "before_model_output_delivery" && stage === "model_output") ||
    (point === "before_tool_execution" && stage === "tool_request") ||
    (point === "before_message_delivery" && stage === "model_output")
  );
}

function isPrivateRequestCommon(value: PlainRecord): value is PlainRecord & SandboxSecurityEnforcementAuditRequestCommon {
  return (
    value.schema_version === AUDIT_REQUEST_SCHEMA_VERSION &&
    typeof value.event_id === "string" &&
    AUDIT_EVENT_ID_PATTERN.test(value.event_id) &&
    typeof value.request_id === "string" &&
    REQUEST_ID_PATTERN.test(value.request_id) &&
    isCatalogValue(ENFORCEMENT_POINTS, value.enforcement_point) &&
    isCatalogValue(SANDBOX_SECURITY_STAGES, value.stage) &&
    pointStageMatches(value.enforcement_point, value.stage) &&
    isCatalogValue(SANDBOX_SECURITY_POLICY_PROFILE_IDS, value.policy_profile_id) &&
    isCatalogValue(COMPOSITION_BINDINGS, value.composition_binding) &&
    Number.isSafeInteger(value.elapsed_ms) &&
    (value.elapsed_ms as number) >= 0 &&
    (value.elapsed_ms as number) <= 60000
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function normalizeRequestValue(value: unknown): SandboxSecurityEnforcementAuditRequest | null {
  if (!isOwnEnumerableDataRecord(value) || typeof value.event_type !== "string") return null;
  const expectedKeys: Record<string, readonly string[]> = {
    enforcement_completed: [
      "schema_version", "event_id", "request_id", "enforcement_point", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "event_type",
      "verdict", "action", "risk_level", "category_counts", "detector_run_status_counts",
      "host_outcome"
    ],
    enforcement_interrupted: [
      "schema_version", "event_id", "request_id", "enforcement_point", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "event_type",
      "interruption_code", "applied_fail_closed_action"
    ]
  };
  const keys = expectedKeys[value.event_type];
  if (keys === undefined || !hasExactKeys(value, keys) || !isPrivateRequestCommon(value)) return null;

  if (value.event_type === "enforcement_completed") {
    const categories = normalizeCounts(value.category_counts, SANDBOX_SECURITY_RISK_CATEGORIES);
    const statuses = normalizeCounts(value.detector_run_status_counts, RUN_STATUS_CATALOG);
    if (
      categories === null ||
      statuses === null ||
      !isCatalogValue(SANDBOX_SECURITY_VERDICTS, value.verdict) ||
      !isCatalogValue(SANDBOX_SECURITY_ACTIONS, value.action) ||
      !isCatalogValue(["info", ...SANDBOX_SECURITY_SEVERITIES] as const, value.risk_level) ||
      ((value.action === "allow" || value.action === "alert") && value.host_outcome !== "continued") ||
      ((value.action === "ask" || value.action === "deny") && value.host_outcome !== "replaced")
    ) {
      return null;
    }
    return deepFreeze({
      schema_version: AUDIT_REQUEST_SCHEMA_VERSION,
      event_id: value.event_id,
      request_id: value.request_id,
      enforcement_point: value.enforcement_point,
      stage: value.stage,
      policy_profile_id: value.policy_profile_id,
      composition_binding: value.composition_binding,
      elapsed_ms: value.elapsed_ms,
      event_type: "enforcement_completed",
      verdict: value.verdict,
      action: value.action,
      risk_level: value.risk_level,
      category_counts: categories,
      detector_run_status_counts: statuses,
      host_outcome: value.host_outcome
    }) as SandboxSecurityEnforcementAuditRequest;
  }

  const expectedAction = value.enforcement_point === "before_tool_execution" ? "deny" : "ask";
  if (
    !isCatalogValue(INTERRUPTION_CODES, value.interruption_code) ||
    value.applied_fail_closed_action !== expectedAction
  ) {
    return null;
  }
  return deepFreeze({
    schema_version: AUDIT_REQUEST_SCHEMA_VERSION,
    event_id: value.event_id,
    request_id: value.request_id,
    enforcement_point: value.enforcement_point,
    stage: value.stage,
    policy_profile_id: value.policy_profile_id,
    composition_binding: value.composition_binding,
    elapsed_ms: value.elapsed_ms,
    event_type: "enforcement_interrupted",
    interruption_code: value.interruption_code,
    applied_fail_closed_action: value.applied_fail_closed_action
  }) as SandboxSecurityEnforcementAuditRequest;
}

function validIdentity(value: PlainRecord): boolean {
  return (
    typeof value.subject_id === "string" && SUBJECT_PATTERN.test(value.subject_id) &&
    typeof value.authorization_scope_id === "string" && AUTHORIZATION_SCOPE_ID_PATTERN.test(value.authorization_scope_id) &&
    typeof value.capability_id === "string" && CAPABILITY_ID_PATTERN.test(value.capability_id)
  );
}

function eventCommonValid(value: PlainRecord): boolean {
  return (
    value.schema_version === AUDIT_EVENT_SCHEMA_VERSION &&
    typeof value.event_id === "string" && AUDIT_EVENT_ID_PATTERN.test(value.event_id) &&
    isStrictTimestamp(value.occurred_at) && validIdentity(value)
  );
}

function eventProjectionValid(value: PlainRecord): boolean {
  return (
    typeof value.request_id === "string" && REQUEST_ID_PATTERN.test(value.request_id) &&
    isCatalogValue(ENFORCEMENT_POINTS, value.enforcement_point) &&
    isCatalogValue(SANDBOX_SECURITY_STAGES, value.stage) &&
    pointStageMatches(value.enforcement_point, value.stage) &&
    isCatalogValue(SANDBOX_SECURITY_POLICY_PROFILE_IDS, value.policy_profile_id) &&
    isCatalogValue(COMPOSITION_BINDINGS, value.composition_binding) &&
    Number.isSafeInteger(value.elapsed_ms) &&
    (value.elapsed_ms as number) >= 0 &&
    (value.elapsed_ms as number) <= 60000
  );
}

function normalizeDurableEvent(value: unknown): SandboxSecurityEnforcementAuditEvent | null {
  if (!isOwnEnumerableDataRecord(value) || typeof value.event_type !== "string") return null;
  const expectedKeys: Record<string, readonly string[]> = {
    enforcement_completed: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "request_id", "enforcement_point",
      "stage", "policy_profile_id", "composition_binding", "elapsed_ms", "verdict",
      "action", "risk_level", "category_counts", "detector_run_status_counts", "host_outcome"
    ],
    enforcement_interrupted: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "request_id", "enforcement_point",
      "stage", "policy_profile_id", "composition_binding", "elapsed_ms",
      "interruption_code", "applied_fail_closed_action"
    ],
    capability_issued: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "scopes", "allowed_stages",
      "allowed_policy_profile_ids", "composition_binding", "issued_at", "expires_at"
    ]
  };
  const keys = expectedKeys[value.event_type];
  if (keys === undefined || !hasExactKeys(value, keys) || !eventCommonValid(value)) return null;

  if (value.event_type === "capability_issued") {
    if (
      !isDenseOrdinaryArray(value.scopes, 1) ||
      value.scopes.length !== 1 ||
      arrayValue(value.scopes, 0) !== ENFORCEMENT_SCOPE ||
      !isDenseOrdinaryArray(value.allowed_stages, 3) ||
      JSON.stringify(value.allowed_stages) !== JSON.stringify(SANDBOX_SECURITY_STAGES) ||
      !isDenseOrdinaryArray(value.allowed_policy_profile_ids, 1) ||
      value.allowed_policy_profile_ids.length !== 1 ||
      !isCatalogValue(SANDBOX_SECURITY_POLICY_PROFILE_IDS, arrayValue(value.allowed_policy_profile_ids, 0)) ||
      !isCatalogValue(COMPOSITION_BINDINGS, value.composition_binding) ||
      !isStrictTimestamp(value.issued_at) ||
      !isStrictTimestamp(value.expires_at) ||
      Date.parse(value.expires_at) <= Date.parse(value.issued_at)
    ) {
      return null;
    }
    return deepFreeze({
      schema_version: AUDIT_EVENT_SCHEMA_VERSION,
      event_id: value.event_id,
      event_type: "capability_issued",
      occurred_at: value.occurred_at,
      subject_id: value.subject_id,
      authorization_scope_id: value.authorization_scope_id,
      capability_id: value.capability_id,
      scopes: [ENFORCEMENT_SCOPE],
      allowed_stages: [...SANDBOX_SECURITY_STAGES],
      allowed_policy_profile_ids: [arrayValue(value.allowed_policy_profile_ids, 0)],
      composition_binding: value.composition_binding,
      issued_at: value.issued_at,
      expires_at: value.expires_at
    }) as SandboxSecurityEnforcementAuditCapabilityIssuedEvent;
  }

  if (!eventProjectionValid(value)) return null;
  if (value.event_type === "enforcement_completed") {
    const categories = normalizeCounts(value.category_counts, SANDBOX_SECURITY_RISK_CATEGORIES);
    const statuses = normalizeCounts(value.detector_run_status_counts, RUN_STATUS_CATALOG);
    if (
      categories === null ||
      statuses === null ||
      !isCatalogValue(SANDBOX_SECURITY_VERDICTS, value.verdict) ||
      !isCatalogValue(SANDBOX_SECURITY_ACTIONS, value.action) ||
      !isCatalogValue(["info", ...SANDBOX_SECURITY_SEVERITIES] as const, value.risk_level) ||
      ((value.action === "allow" || value.action === "alert") && value.host_outcome !== "continued") ||
      ((value.action === "ask" || value.action === "deny") && value.host_outcome !== "replaced")
    ) {
      return null;
    }
    return deepFreeze({
      schema_version: AUDIT_EVENT_SCHEMA_VERSION,
      event_id: value.event_id,
      event_type: "enforcement_completed",
      occurred_at: value.occurred_at,
      subject_id: value.subject_id,
      authorization_scope_id: value.authorization_scope_id,
      capability_id: value.capability_id,
      request_id: value.request_id,
      enforcement_point: value.enforcement_point,
      stage: value.stage,
      policy_profile_id: value.policy_profile_id,
      composition_binding: value.composition_binding,
      elapsed_ms: value.elapsed_ms,
      verdict: value.verdict,
      action: value.action,
      risk_level: value.risk_level,
      category_counts: categories,
      detector_run_status_counts: statuses,
      host_outcome: value.host_outcome
    }) as SandboxSecurityEnforcementCompletedEvent;
  }

  const expectedAction = value.enforcement_point === "before_tool_execution" ? "deny" : "ask";
  if (
    !isCatalogValue(INTERRUPTION_CODES, value.interruption_code) ||
    value.applied_fail_closed_action !== expectedAction
  ) {
    return null;
  }
  return deepFreeze({
    schema_version: AUDIT_EVENT_SCHEMA_VERSION,
    event_id: value.event_id,
    event_type: "enforcement_interrupted",
    occurred_at: value.occurred_at,
    subject_id: value.subject_id,
    authorization_scope_id: value.authorization_scope_id,
    capability_id: value.capability_id,
    request_id: value.request_id,
    enforcement_point: value.enforcement_point,
    stage: value.stage,
    policy_profile_id: value.policy_profile_id,
    composition_binding: value.composition_binding,
    elapsed_ms: value.elapsed_ms,
    interruption_code: value.interruption_code,
    applied_fail_closed_action: value.applied_fail_closed_action
  }) as SandboxSecurityEnforcementInterruptedEvent;
}

export function normalizeSandboxSecurityEnforcementAuditRequest(
  value: unknown
): SandboxSecurityEnforcementAuditRequest | null {
  return normalizeRequestValue(value);
}

export function normalizeSandboxSecurityEnforcementAuditEvent(
  value: unknown
): SandboxSecurityEnforcementAuditEvent | null {
  return normalizeDurableEvent(value);
}

export function normalizeOpenClawEnforcementAuditAck(
  value: unknown
): OpenClawEnforcementAuditAck | null {
  if (
    !hasExactKeys(value, ["schema_version", "event_id", "status", "occurred_at"]) ||
    value.schema_version !== ACK_SCHEMA_VERSION ||
    typeof value.event_id !== "string" ||
    !AUDIT_EVENT_ID_PATTERN.test(value.event_id) ||
    (value.status !== "accepted" && value.status !== "replayed") ||
    !isStrictTimestamp(value.occurred_at)
  ) {
    return null;
  }
  return deepFreeze({
    schema_version: ACK_SCHEMA_VERSION,
    event_id: value.event_id,
    status: value.status,
    occurred_at: value.occurred_at
  });
}
