import {
  type SandboxSecurityAuditCategoryCounts,
  type SandboxSecurityAuditEvent,
  type SandboxSecurityAuditPage,
  type SandboxSecurityCapabilityScope
} from "../types/sandbox-security-api.ts";
import {
  SANDBOX_SECURITY_ACTIONS,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS as POLICY_PROFILE_CATALOG,
  SANDBOX_SECURITY_RISK_CATEGORIES as RISK_CATEGORY_CATALOG,
  SANDBOX_SECURITY_SEVERITIES,
  SANDBOX_SECURITY_STAGES as STAGE_CATALOG,
  SANDBOX_SECURITY_VERDICTS,
  type SandboxDetectorRunStatus
} from "../types/sandbox-security.ts";

type PlainRecord = Record<string, unknown>;

const SCOPES = [
  "sandbox_security:evaluate",
  "sandbox_security:audit:read"
] as const satisfies readonly SandboxSecurityCapabilityScope[];
const AUDIT_RUN_STATUS_CATALOG = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const satisfies readonly SandboxDetectorRunStatus[];
const EVENT_SCHEMA_VERSION = "sandbox-security-audit-event.v1";
const PAGE_SCHEMA_VERSION = "sandbox-security-audit-page.v1";
const EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMPOSITION_BINDING_PATTERN =
  /^sandbox-security-production-composition\.v1:(rule_only|local|local_and_judge)$/;
const CURSOR_PATTERN = /^sbxcur_v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;
const REJECTION_CODES = [
  "capability_expired",
  "capability_revoked",
  "scope_forbidden",
  "stage_forbidden",
  "profile_forbidden",
  "capability_rate_limited",
  "idempotency_conflict",
  "idempotency_in_progress",
  "concurrency_limited",
  "storage_unavailable",
  "invalid_request",
  "body_too_large",
  "body_timeout",
  "unsupported_media_type"
] as const;
const AUDIT_READ_REJECTION_CODES = [
  "capability_expired",
  "capability_revoked",
  "scope_forbidden",
  "capability_rate_limited",
  "invalid_request"
] as const;
const INTERRUPTION_CODES = [
  "engine_error",
  "persistence_error",
  "startup_recovery"
] as const;

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
  if (ownKeys.some((key) => typeof key !== "string")) {
    return false;
  }

  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is PlainRecord {
  if (!isOwnEnumerableDataRecord(value)) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isDenseOrdinaryArray(
  value: unknown,
  minLength = 0,
  maxLength = Number.POSITIVE_INFINITY
): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < minLength ||
    lengthDescriptor.value > maxLength
  ) {
    return false;
  }
  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
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

function isCatalogValue<const T extends readonly string[]>(
  catalog: T,
  value: unknown
): value is T[number] {
  return typeof value === "string" && catalog.includes(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isSubject(value: unknown): value is string {
  return typeof value === "string" && SUBJECT_PATTERN.test(value);
}

function isStrictUtcMillisecondTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = UTC_MILLISECOND_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59 || month < 1 || month > 12) {
    return false;
  }
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : daysInMonth[month - 1];
  if (day < 1 || day > maxDay) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isElapsedMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 60000;
}

function isCursorSegmentCanonical(value: string): boolean {
  if (value.length % 4 === 1) return false;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length > 0 && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function isCursor(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  const match = CURSOR_PATTERN.exec(value);
  return match !== null && isCursorSegmentCanonical(match[1]) && isCursorSegmentCanonical(match[2]);
}

function hasOrderedCatalogValues<T extends string>(
  value: unknown,
  catalog: readonly T[],
  options: { minLength?: number; allowEmpty?: boolean } = {}
): T[] | null {
  const minLength = options.minLength ?? 0;
  if (!isDenseOrdinaryArray(value, minLength, catalog.length)) return null;
  const normalized: T[] = [];
  let previousIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    const item = readArrayElement(value, index);
    if (!isCatalogValue(catalog, item)) return null;
    const catalogIndex = catalog.indexOf(item);
    if (catalogIndex <= previousIndex) return null;
    previousIndex = catalogIndex;
    normalized.push(item);
  }
  if (!options.allowEmpty && normalized.length < minLength) return null;
  return normalized;
}

function normalizeCounts<T extends string>(
  value: unknown,
  catalog: readonly T[]
): Record<T, number> | null {
  if (
    !hasExactKeys(value, catalog) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(catalog)
  ) {
    return null;
  }
  const result = {} as Record<T, number>;
  for (const key of catalog) {
    if (!isSafeCount(value[key])) return null;
    result[key] = value[key] as number;
  }
  return result;
}

function normalizeBase(value: PlainRecord, eventType: string): PlainRecord | null {
  if (
    !isOwnEnumerableDataRecord(value) ||
    ![
      "schema_version",
      "event_id",
      "event_type",
      "occurred_at",
      "subject_id",
      "authorization_scope_id",
      "capability_id"
    ].every((key) => Object.hasOwn(value, key)) ||
    value.schema_version !== EVENT_SCHEMA_VERSION ||
    value.event_type !== eventType ||
    typeof value.event_id !== "string" ||
    !EVENT_ID_PATTERN.test(value.event_id) ||
    !isStrictUtcMillisecondTimestamp(value.occurred_at) ||
    !isSubject(value.subject_id)
  ) {
    return null;
  }
  return {
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: value.event_id,
    event_type: eventType,
    occurred_at: value.occurred_at,
    subject_id: value.subject_id,
    authorization_scope_id: value.authorization_scope_id,
    capability_id: value.capability_id
  };
}

function normalizeRequiredIdentity(value: PlainRecord): boolean {
  return (
    typeof value.authorization_scope_id === "string" &&
    AUTHORIZATION_SCOPE_PATTERN.test(value.authorization_scope_id) &&
    typeof value.capability_id === "string" &&
    CAPABILITY_ID_PATTERN.test(value.capability_id)
  );
}

function normalizeEvaluationFields(value: PlainRecord): PlainRecord | null {
  if (
    !isIdentifier(value.request_id) ||
    !isCatalogValue(STAGE_CATALOG, value.stage) ||
    !isCatalogValue(POLICY_PROFILE_CATALOG, value.policy_profile_id) ||
    typeof value.composition_binding !== "string" ||
    !COMPOSITION_BINDING_PATTERN.test(value.composition_binding) ||
    !isElapsedMs(value.elapsed_ms)
  ) {
    return null;
  }
  return {
    request_id: value.request_id,
    stage: value.stage,
    policy_profile_id: value.policy_profile_id,
    composition_binding: value.composition_binding,
    elapsed_ms: value.elapsed_ms
  };
}

function normalizeCompleted(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, value.event_type as string);
  const evaluation = normalizeEvaluationFields(value);
  const categories = normalizeCounts(value.category_counts, RISK_CATEGORY_CATALOG);
  const statuses = normalizeCounts(
    value.detector_run_status_counts,
    AUDIT_RUN_STATUS_CATALOG
  );
  if (
    base === null ||
    evaluation === null ||
    !normalizeRequiredIdentity(value) ||
    !isCatalogValue(SANDBOX_SECURITY_VERDICTS, value.verdict) ||
    !isCatalogValue(SANDBOX_SECURITY_ACTIONS, value.action) ||
    !isCatalogValue(["info", ...SANDBOX_SECURITY_SEVERITIES] as const, value.risk_level) ||
    categories === null ||
    statuses === null
  ) {
    return null;
  }
  return {
    ...base,
    ...evaluation,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    verdict: value.verdict,
    action: value.action,
    risk_level: value.risk_level,
    category_counts: categories as SandboxSecurityAuditCategoryCounts,
    detector_run_status_counts: statuses
  } as SandboxSecurityAuditEvent;
}

function normalizeInterrupted(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "evaluation_interrupted");
  const evaluation = normalizeEvaluationFields(value);
  if (
    base === null ||
    evaluation === null ||
    !normalizeRequiredIdentity(value) ||
    !isCatalogValue(INTERRUPTION_CODES, value.interruption_code)
  ) {
    return null;
  }
  return {
    ...base,
    ...evaluation,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    interruption_code: value.interruption_code
  } as SandboxSecurityAuditEvent;
}

function normalizeRejected(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "request_rejected");
  if (
    base === null ||
    !normalizeRequiredIdentity(value) ||
    !isCatalogValue(["evaluation", "audit_read"] as const, value.route_id) ||
    typeof value.composition_binding !== "string" ||
    !COMPOSITION_BINDING_PATTERN.test(value.composition_binding) ||
    !isElapsedMs(value.elapsed_ms) ||
    !isCatalogValue(REJECTION_CODES, value.rejection_code)
  ) {
    return null;
  }
  const route = value.route_id as "evaluation" | "audit_read";
  const hasNoContext =
    value.request_id === null && value.stage === null && value.policy_profile_id === null;
  const hasContext =
    isIdentifier(value.request_id) &&
    isCatalogValue(STAGE_CATALOG, value.stage) &&
    isCatalogValue(POLICY_PROFILE_CATALOG, value.policy_profile_id);
  if ((route === "audit_read" && !hasNoContext) || (route === "evaluation" && !hasNoContext && !hasContext)) {
    return null;
  }
  if (route === "audit_read" && !isCatalogValue(AUDIT_READ_REJECTION_CODES, value.rejection_code)) {
    return null;
  }
  return {
    ...base,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    route_id: route,
    request_id: value.request_id,
    stage: value.stage,
    policy_profile_id: value.policy_profile_id,
    composition_binding: value.composition_binding,
    elapsed_ms: value.elapsed_ms,
    rejection_code: value.rejection_code
  } as SandboxSecurityAuditEvent;
}

function normalizeIssued(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "capability_issued");
  const scopes = hasOrderedCatalogValues(value.scopes, SCOPES, { minLength: 1 });
  const stages = hasOrderedCatalogValues(value.allowed_stages, STAGE_CATALOG, { allowEmpty: true });
  const profiles = hasOrderedCatalogValues(value.allowed_policy_profile_ids, POLICY_PROFILE_CATALOG, { allowEmpty: true });
  const hasEvaluationScope = scopes?.includes("sandbox_security:evaluate") ?? false;
  if (
    base === null ||
    !normalizeRequiredIdentity(value) ||
    scopes === null ||
    stages === null ||
    profiles === null ||
    (hasEvaluationScope && (stages.length === 0 || profiles.length === 0)) ||
    (!hasEvaluationScope && (stages.length !== 0 || profiles.length !== 0)) ||
    !isStrictUtcMillisecondTimestamp(value.issued_at) ||
    !isStrictUtcMillisecondTimestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.issued_at)
  ) {
    return null;
  }
  return {
    ...base,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    scopes: [...scopes],
    allowed_stages: [...stages],
    allowed_policy_profile_ids: [...profiles],
    issued_at: value.issued_at,
    expires_at: value.expires_at
  } as SandboxSecurityAuditEvent;
}

function normalizeRevoked(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "capability_revoked");
  if (
    base === null ||
    !normalizeRequiredIdentity(value) ||
    !isStrictUtcMillisecondTimestamp(value.revoked_at)
  ) {
    return null;
  }
  return {
    ...base,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    revoked_at: value.revoked_at
  } as SandboxSecurityAuditEvent;
}

function normalizeAuditRead(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "audit_read");
  if (
    base === null ||
    !normalizeRequiredIdentity(value) ||
    !isSafeCount(value.returned_count) ||
    typeof value.next_cursor_present !== "boolean" ||
    !isElapsedMs(value.elapsed_ms)
  ) {
    return null;
  }
  return {
    ...base,
    authorization_scope_id: value.authorization_scope_id as string,
    capability_id: value.capability_id as string,
    returned_count: value.returned_count,
    next_cursor_present: value.next_cursor_present,
    elapsed_ms: value.elapsed_ms
  } as SandboxSecurityAuditEvent;
}

function normalizePurged(value: PlainRecord): SandboxSecurityAuditEvent | null {
  const base = normalizeBase(value, "audit_purged");
  if (
    base === null ||
    value.subject_id !== "system:bootstrap-admin" ||
    value.authorization_scope_id !== null ||
    value.capability_id !== null ||
    value.retention_days !== 90 ||
    !isSafeCount(value.deleted_count) ||
    typeof value.has_more !== "boolean" ||
    !isElapsedMs(value.elapsed_ms)
  ) {
    return null;
  }
  return {
    ...base,
    subject_id: "system:bootstrap-admin",
    authorization_scope_id: null,
    capability_id: null,
    retention_days: 90,
    deleted_count: value.deleted_count,
    has_more: value.has_more,
    elapsed_ms: value.elapsed_ms
  } as SandboxSecurityAuditEvent;
}

export function normalizeSandboxSecurityAuditEvent(
  value: unknown
): SandboxSecurityAuditEvent | null {
  if (!isOwnEnumerableDataRecord(value) || typeof value.event_type !== "string") {
    return null;
  }
  const expectedKeys: Record<string, readonly string[]> = {
    evaluation_completed: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "request_id", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "verdict",
      "action", "risk_level", "category_counts", "detector_run_status_counts"
    ],
    evaluation_replayed: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "request_id", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "verdict",
      "action", "risk_level", "category_counts", "detector_run_status_counts"
    ],
    evaluation_interrupted: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "request_id", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "interruption_code"
    ],
    request_rejected: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "route_id", "request_id", "stage",
      "policy_profile_id", "composition_binding", "elapsed_ms", "rejection_code"
    ],
    capability_issued: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "scopes", "allowed_stages",
      "allowed_policy_profile_ids", "issued_at", "expires_at"
    ],
    capability_revoked: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "revoked_at"
    ],
    audit_read: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "returned_count",
      "next_cursor_present", "elapsed_ms"
    ],
    audit_purged: [
      "schema_version", "event_id", "event_type", "occurred_at", "subject_id",
      "authorization_scope_id", "capability_id", "retention_days", "deleted_count",
      "has_more", "elapsed_ms"
    ]
  };
  const keys = expectedKeys[value.event_type];
  if (keys === undefined || !hasExactKeys(value, keys)) return null;
  switch (value.event_type) {
    case "evaluation_completed":
    case "evaluation_replayed":
      return normalizeCompleted(value);
    case "evaluation_interrupted":
      return normalizeInterrupted(value);
    case "request_rejected":
      return normalizeRejected(value);
    case "capability_issued":
      return normalizeIssued(value);
    case "capability_revoked":
      return normalizeRevoked(value);
    case "audit_read":
      return normalizeAuditRead(value);
    case "audit_purged":
      return normalizePurged(value);
    default:
      return null;
  }
}

export function normalizeSandboxSecurityAuditPage(
  value: unknown
): SandboxSecurityAuditPage | null {
  if (
    !hasExactKeys(value, ["schema_version", "events", "next_cursor"]) ||
    value.schema_version !== PAGE_SCHEMA_VERSION ||
    !isDenseOrdinaryArray(value.events, 0, 100) ||
    (value.next_cursor !== null && !isCursor(value.next_cursor))
  ) {
    return null;
  }
  const events: SandboxSecurityAuditEvent[] = [];
  for (let index = 0; index < value.events.length; index += 1) {
    const normalized = normalizeSandboxSecurityAuditEvent(
      readArrayElement(value.events, index)
    );
    if (normalized === null) return null;
    events.push(normalized);
  }
  return {
    schema_version: PAGE_SCHEMA_VERSION,
    events,
    next_cursor: value.next_cursor
  };
}
