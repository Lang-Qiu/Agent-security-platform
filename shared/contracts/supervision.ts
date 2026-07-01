import { RISK_LEVELS } from "../constants/risk-level.ts";
import { TASK_STATUSES } from "../constants/task-status.ts";
import { isOneOf, isPlainObject, isString } from "../utils/guards.ts";
import {
  SANDBOX_EVENT_SOURCES,
  SANDBOX_EVENT_TYPES,
  SANDBOX_POLICY_ACTIONS,
  SANDBOX_TOOL_RESULT_STATUSES
} from "../types/sandbox.ts";
import {
  SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
  SANDBOX_SUPERVISION_SCHEMA_VERSION,
  type SandboxSupervisionAlertView,
  type SandboxSupervisionBlockedRecordView,
  type SandboxSupervisionCounts,
  type SandboxSupervisionDecisionView,
  type SandboxSupervisionEventView,
  type SandboxSupervisionEvidenceExport,
  type SandboxSupervisionOverview,
  type SandboxSupervisionSessionDetail,
  type SandboxSupervisionSessionSummary,
  type SandboxSupervisionToolName
} from "../types/supervision.ts";

export {
  SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
  SANDBOX_SUPERVISION_SCHEMA_VERSION
} from "../types/supervision.ts";

export const SUPERVISION_TOOL_NAMES: readonly SandboxSupervisionToolName[] = [
  "send_email",
  "read_file",
  "write_file",
  "call_api"
];

const SUMMARY_KEYS = [
  "task_id",
  "session_id",
  "task_status",
  "risk_level",
  "highest_action",
  "scenario_id",
  "case_id",
  "tool_names",
  "event_count",
  "decision_count",
  "alert_count",
  "blocked_record_count",
  "blocked",
  "evidence_available",
  "updated_at",
  "last_event_at"
] as const;

const COUNTS_KEYS = [
  "observed_session_count",
  "running_session_count",
  "awaiting_confirmation_count",
  "alert_record_count",
  "blocked_session_count"
] as const;

const OVERVIEW_KEYS = [
  "schema_version",
  "counts",
  "matched_session_count",
  "returned_session_count",
  "limit",
  "truncated",
  "sessions"
] as const;

const ISO_8601_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const CONTROL_OR_WHITESPACE = /[\s\x00-\x1f\x7f]/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month === 2) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return day <= (isLeapYear ? 29 : 28);
  }

  return day <= daysInMonth[month - 1];
}

function isStrictIso8601(value: unknown): value is string {
  if (!isString(value)) return false;

  const match = value.match(ISO_8601_PATTERN);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidCalendarDate(year, month, day)) return false;
  if (!Number.isFinite(Date.parse(value))) return false;

  const offset = match[7];
  if (offset !== "Z") {
    const hours = Number(offset.substring(1, 3));
    const minutes = Number(offset.substring(4, 6));
    if (hours > 14) return false;
    if (hours === 14 && minutes > 0) return false;
  }

  return true;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  if (keys.length !== expected.length) return false;
  return expected.every((key) => key in value);
}

function isSafeId(value: unknown): value is string {
  if (!isString(value) || value.length === 0 || value.length > 256) return false;
  return !CONTROL_OR_WHITESPACE.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isToolNameArray(
  value: unknown
): value is SandboxSupervisionToolName[] {
  if (!Array.isArray(value)) return false;

  const seen = new Set<string>();
  for (const item of value) {
    if (!isOneOf(SUPERVISION_TOOL_NAMES, item)) return false;
    if (seen.has(item)) return false;
    seen.add(item);
  }

  for (let i = 1; i < value.length; i++) {
    if (value[i] < value[i - 1]) return false;
  }

  return true;
}

function isSortedSessions(
  sessions: SandboxSupervisionSessionSummary[]
): boolean {
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1];
    const curr = sessions[i];
    if (prev.updated_at < curr.updated_at) return false;
    if (
      prev.updated_at === curr.updated_at &&
      prev.session_id > curr.session_id
    ) {
      return false;
    }
  }
  return true;
}

export function normalizeSandboxSupervisionSessionSummary(
  value: unknown
): SandboxSupervisionSessionSummary | null {
  if (!isPlainObject(value) || !hasExactKeys(value, SUMMARY_KEYS)) return null;

  if (!isSafeId(value.task_id)) return null;
  if (!isSafeId(value.session_id)) return null;
  if (!isOneOf(TASK_STATUSES, value.task_status)) return null;
  if (!isOneOf(RISK_LEVELS, value.risk_level)) return null;
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, value.highest_action)) return null;

  if (value.scenario_id !== null && !isSafeId(value.scenario_id)) return null;
  if (value.case_id !== null && !isSafeId(value.case_id)) return null;

  if (!isToolNameArray(value.tool_names)) return null;
  if (!isNonNegativeInteger(value.event_count)) return null;
  if (!isNonNegativeInteger(value.decision_count)) return null;
  if (!isNonNegativeInteger(value.alert_count)) return null;
  if (!isNonNegativeInteger(value.blocked_record_count)) return null;

  if (typeof value.blocked !== "boolean") return null;
  if (typeof value.evidence_available !== "boolean") return null;

  if (!isStrictIso8601(value.updated_at)) return null;
  if (value.last_event_at !== null && !isStrictIso8601(value.last_event_at)) {
    return null;
  }

  return {
    task_id: value.task_id,
    session_id: value.session_id,
    task_status: value.task_status,
    risk_level: value.risk_level,
    highest_action: value.highest_action,
    scenario_id: value.scenario_id,
    case_id: value.case_id,
    tool_names: [...value.tool_names],
    event_count: value.event_count,
    decision_count: value.decision_count,
    alert_count: value.alert_count,
    blocked_record_count: value.blocked_record_count,
    blocked: value.blocked,
    evidence_available: value.evidence_available,
    updated_at: value.updated_at,
    last_event_at: value.last_event_at
  };
}

export function normalizeSandboxSupervisionCounts(
  value: unknown
): SandboxSupervisionCounts | null {
  if (!isPlainObject(value) || !hasExactKeys(value, COUNTS_KEYS)) return null;

  for (const key of COUNTS_KEYS) {
    if (!isNonNegativeInteger(value[key])) return null;
  }

  return {
    observed_session_count: value.observed_session_count,
    running_session_count: value.running_session_count,
    awaiting_confirmation_count: value.awaiting_confirmation_count,
    alert_record_count: value.alert_record_count,
    blocked_session_count: value.blocked_session_count
  };
}

export function normalizeSandboxSupervisionOverview(
  value: unknown
): SandboxSupervisionOverview | null {
  if (!isPlainObject(value) || !hasExactKeys(value, OVERVIEW_KEYS)) return null;

  if (value.schema_version !== SANDBOX_SUPERVISION_SCHEMA_VERSION) return null;

  const counts = normalizeSandboxSupervisionCounts(value.counts);
  if (!counts) return null;

  if (!isNonNegativeInteger(value.matched_session_count)) return null;
  if (!isNonNegativeInteger(value.returned_session_count)) return null;
  if (value.returned_session_count > 100) return null;
  if (value.limit !== 100) return null;
  if (typeof value.truncated !== "boolean") return null;

  if (!Array.isArray(value.sessions)) return null;
  if (value.sessions.length !== value.returned_session_count) return null;

  const sessions: SandboxSupervisionSessionSummary[] = [];
  for (const item of value.sessions) {
    const session = normalizeSandboxSupervisionSessionSummary(item);
    if (!session) return null;
    sessions.push(session);
  }

  if (!isSortedSessions(sessions)) return null;

  const expectedTruncated = value.matched_session_count > 100;
  if (value.truncated !== expectedTruncated) return null;

  const expectedReturned = Math.min(value.matched_session_count, 100);
  if (value.returned_session_count !== expectedReturned) return null;

  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    counts,
    matched_session_count: value.matched_session_count,
    returned_session_count: value.returned_session_count,
    limit: 100,
    truncated: value.truncated,
    sessions
  };
}

// -- Task 2: content-free detail and evidence contracts -----------------------

export const SUPERVISION_STATE_CHANGES = [
  "none",
  "outbox_append",
  "virtual_file_write"
] as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_TOKEN_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
const SAFE_REF_MAX_LENGTH = 512;
const SAFE_TOKEN_MAX_LENGTH = 96;

function isSha256(value: unknown): value is string {
  return isString(value) && SHA256_PATTERN.test(value);
}

function isSafeRef(value: unknown): value is string {
  if (!isString(value) || value.length === 0 || value.length > SAFE_REF_MAX_LENGTH) {
    return false;
  }
  return !CONTROL_OR_WHITESPACE.test(value);
}

function isSafeToken(value: unknown): value is string {
  if (!isString(value) || value.length === 0 || value.length > SAFE_TOKEN_MAX_LENGTH) {
    return false;
  }
  return SAFE_TOKEN_PATTERN.test(value);
}

function isStringArrayValue(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => isSafeRef(item));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

const DECISION_VIEW_KEYS = [
  "decision_id",
  "subject_event_id",
  "policy_id",
  "action",
  "reason_code",
  "evidence_refs",
  "decided_at"
] as const;

const ALERT_VIEW_KEYS = [
  "alert_id",
  "subject_event_id",
  "decision_id",
  "risk_level",
  "category",
  "evidence_refs",
  "occurred_at"
] as const;

const BLOCKED_RECORD_VIEW_KEYS = [
  "blocked_record_id",
  "subject_event_id",
  "decision_id",
  "evidence_refs",
  "occurred_at"
] as const;

const EVENT_ENVELOPE_KEYS = [
  "event_id",
  "session_id",
  "sequence",
  "event_type",
  "occurred_at",
  "source",
  "scenario_id",
  "case_id",
  "evidence_refs",
  "payload"
] as const;

const MODEL_PAYLOAD_KEYS = ["model_ref", "content_ref", "content_sha256"] as const;
const TOOL_REQUEST_PAYLOAD_KEYS = [
  "call_id",
  "tool_name",
  "target_ref",
  "arguments_ref"
] as const;
const TOOL_RESULT_PAYLOAD_KEYS = [
  "call_id",
  "tool_name",
  "status",
  "result_ref",
  "state_change"
] as const;
const MEMORY_PAYLOAD_KEYS = [
  "memory_entry_id",
  "content_ref",
  "content_sha256"
] as const;

const DETAIL_KEYS = [
  "schema_version",
  "summary",
  "events",
  "policy_decisions",
  "alerts",
  "blocked_records"
] as const;

const EVIDENCE_EXPORT_KEYS = [
  "schema_version",
  "source_schema_version",
  "session"
] as const;

export function normalizeSandboxSupervisionDecisionView(
  value: unknown
): SandboxSupervisionDecisionView | null {
  if (!isPlainObject(value) || !hasExactKeys(value, DECISION_VIEW_KEYS)) return null;

  if (!isSafeId(value.decision_id)) return null;
  if (!isSafeId(value.subject_event_id)) return null;
  if (!isSafeId(value.policy_id)) return null;
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, value.action)) return null;
  if (!isSafeToken(value.reason_code)) return null;
  if (!isStringArrayValue(value.evidence_refs)) return null;
  if (!isStrictIso8601(value.decided_at)) return null;

  return {
    decision_id: value.decision_id,
    subject_event_id: value.subject_event_id,
    policy_id: value.policy_id,
    action: value.action,
    reason_code: value.reason_code,
    evidence_refs: [...value.evidence_refs],
    decided_at: value.decided_at
  };
}

export function normalizeSandboxSupervisionAlertView(
  value: unknown
): SandboxSupervisionAlertView | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ALERT_VIEW_KEYS)) return null;

  if (!isSafeId(value.alert_id)) return null;
  if (!isSafeId(value.subject_event_id)) return null;
  if (!isSafeId(value.decision_id)) return null;
  if (!isOneOf(RISK_LEVELS, value.risk_level)) return null;
  if (!isSafeToken(value.category)) return null;
  if (!isStringArrayValue(value.evidence_refs)) return null;
  if (!isStrictIso8601(value.occurred_at)) return null;

  return {
    alert_id: value.alert_id,
    subject_event_id: value.subject_event_id,
    decision_id: value.decision_id,
    risk_level: value.risk_level,
    category: value.category,
    evidence_refs: [...value.evidence_refs],
    occurred_at: value.occurred_at
  };
}

export function normalizeSandboxSupervisionBlockedRecordView(
  value: unknown
): SandboxSupervisionBlockedRecordView | null {
  if (!isPlainObject(value) || !hasExactKeys(value, BLOCKED_RECORD_VIEW_KEYS)) return null;

  if (!isSafeId(value.blocked_record_id)) return null;
  if (!isSafeId(value.subject_event_id)) return null;
  if (!isSafeId(value.decision_id)) return null;
  if (!isStringArrayValue(value.evidence_refs)) return null;
  if (!isStrictIso8601(value.occurred_at)) return null;

  return {
    blocked_record_id: value.blocked_record_id,
    subject_event_id: value.subject_event_id,
    decision_id: value.decision_id,
    evidence_refs: [...value.evidence_refs],
    occurred_at: value.occurred_at
  };
}

function normalizeModelPayload(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, MODEL_PAYLOAD_KEYS)) return null;
  if (!isSafeRef(value.model_ref)) return null;
  if (!isSafeRef(value.content_ref)) return null;
  if (!isSha256(value.content_sha256)) return null;
  return {
    model_ref: value.model_ref,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };
}

function normalizeToolRequestPayload(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, TOOL_REQUEST_PAYLOAD_KEYS)) return null;
  if (!isSafeId(value.call_id)) return null;
  if (!isOneOf(SUPERVISION_TOOL_NAMES, value.tool_name)) return null;
  if (!isSafeRef(value.target_ref)) return null;
  if (!isSafeRef(value.arguments_ref)) return null;
  return {
    call_id: value.call_id,
    tool_name: value.tool_name,
    target_ref: value.target_ref,
    arguments_ref: value.arguments_ref
  };
}

function normalizeToolResultPayload(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, TOOL_RESULT_PAYLOAD_KEYS)) return null;
  if (!isSafeId(value.call_id)) return null;
  if (!isOneOf(SUPERVISION_TOOL_NAMES, value.tool_name)) return null;
  if (!isOneOf(SANDBOX_TOOL_RESULT_STATUSES, value.status)) return null;
  if (!isSafeRef(value.result_ref)) return null;
  if (!isOneOf(SUPERVISION_STATE_CHANGES, value.state_change)) return null;
  return {
    call_id: value.call_id,
    tool_name: value.tool_name,
    status: value.status,
    result_ref: value.result_ref,
    state_change: value.state_change
  };
}

function normalizeMemoryPayload(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, MEMORY_PAYLOAD_KEYS)) return null;
  if (!isSafeId(value.memory_entry_id)) return null;
  if (!isSafeRef(value.content_ref)) return null;
  if (!isSha256(value.content_sha256)) return null;
  return {
    memory_entry_id: value.memory_entry_id,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };
}

export function normalizeSandboxSupervisionEventView(
  value: unknown
): SandboxSupervisionEventView | null {
  if (!isPlainObject(value) || !hasExactKeys(value, EVENT_ENVELOPE_KEYS)) return null;

  if (!isSafeId(value.event_id)) return null;
  if (!isSafeId(value.session_id)) return null;
  if (!isPositiveInteger(value.sequence)) return null;
  if (!isOneOf(SANDBOX_EVENT_TYPES, value.event_type)) return null;
  if (!isStrictIso8601(value.occurred_at)) return null;
  if (!isOneOf(SANDBOX_EVENT_SOURCES, value.source)) return null;

  if (value.scenario_id !== null && !isSafeId(value.scenario_id)) return null;
  if (value.case_id !== null && !isSafeId(value.case_id)) return null;
  if (!isStringArrayValue(value.evidence_refs)) return null;

  const common = {
    event_id: value.event_id,
    session_id: value.session_id,
    sequence: value.sequence,
    occurred_at: value.occurred_at,
    source: value.source,
    scenario_id: value.scenario_id,
    case_id: value.case_id,
    evidence_refs: [...value.evidence_refs]
  };

  switch (value.event_type) {
    case "model_input": {
      const payload = normalizeModelPayload(value.payload);
      return payload ? { ...common, event_type: "model_input", payload } : null;
    }
    case "model_output": {
      const payload = normalizeModelPayload(value.payload);
      return payload ? { ...common, event_type: "model_output", payload } : null;
    }
    case "tool_request": {
      const payload = normalizeToolRequestPayload(value.payload);
      return payload ? { ...common, event_type: "tool_request", payload } : null;
    }
    case "tool_result": {
      const payload = normalizeToolResultPayload(value.payload);
      return payload ? { ...common, event_type: "tool_result", payload } : null;
    }
    case "policy_decision": {
      const payload = normalizeSandboxSupervisionDecisionView(value.payload);
      return payload ? { ...common, event_type: "policy_decision", payload } : null;
    }
    case "memory_write": {
      const payload = normalizeMemoryPayload(value.payload);
      return payload ? { ...common, event_type: "memory_write", payload } : null;
    }
    case "memory_read": {
      const payload = normalizeMemoryPayload(value.payload);
      return payload ? { ...common, event_type: "memory_read", payload } : null;
    }
    default:
      return null;
  }
}

function isAscendingUniqueSequences(sequences: number[]): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i];
    if (seen.has(seq)) return false;
    seen.add(seq);
    if (i > 0 && seq <= sequences[i - 1]) return false;
  }
  return true;
}

export function normalizeSandboxSupervisionSessionDetail(
  value: unknown
): SandboxSupervisionSessionDetail | null {
  if (!isPlainObject(value) || !hasExactKeys(value, DETAIL_KEYS)) return null;

  if (value.schema_version !== SANDBOX_SUPERVISION_SCHEMA_VERSION) return null;

  const summary = normalizeSandboxSupervisionSessionSummary(value.summary);
  if (!summary) return null;

  if (!Array.isArray(value.events)) return null;
  if (!Array.isArray(value.policy_decisions)) return null;
  if (!Array.isArray(value.alerts)) return null;
  if (!Array.isArray(value.blocked_records)) return null;

  const events: SandboxSupervisionEventView[] = [];
  const eventIds = new Set<string>();
  const sequences: number[] = [];
  for (const item of value.events) {
    const event = normalizeSandboxSupervisionEventView(item);
    if (!event) return null;
    if (eventIds.has(event.event_id)) return null;
    if (event.session_id !== summary.session_id) return null;
    eventIds.add(event.event_id);
    sequences.push(event.sequence);
    events.push(event);
  }
  if (!isAscendingUniqueSequences(sequences)) return null;

  const decisions: SandboxSupervisionDecisionView[] = [];
  const decisionIds = new Set<string>();
  for (const item of value.policy_decisions) {
    const decision = normalizeSandboxSupervisionDecisionView(item);
    if (!decision) return null;
    if (decisionIds.has(decision.decision_id)) return null;
    if (!eventIds.has(decision.subject_event_id)) return null;
    decisionIds.add(decision.decision_id);
    decisions.push(decision);
  }

  const alerts: SandboxSupervisionAlertView[] = [];
  const alertIds = new Set<string>();
  for (const item of value.alerts) {
    const alert = normalizeSandboxSupervisionAlertView(item);
    if (!alert) return null;
    if (alertIds.has(alert.alert_id)) return null;
    if (!eventIds.has(alert.subject_event_id)) return null;
    if (!decisionIds.has(alert.decision_id)) return null;
    alertIds.add(alert.alert_id);
    alerts.push(alert);
  }

  const blockedRecords: SandboxSupervisionBlockedRecordView[] = [];
  const blockedIds = new Set<string>();
  for (const item of value.blocked_records) {
    const record = normalizeSandboxSupervisionBlockedRecordView(item);
    if (!record) return null;
    if (blockedIds.has(record.blocked_record_id)) return null;
    if (!eventIds.has(record.subject_event_id)) return null;
    if (!decisionIds.has(record.decision_id)) return null;
    blockedIds.add(record.blocked_record_id);
    blockedRecords.push(record);
  }

  if (summary.event_count !== events.length) return null;
  if (summary.decision_count !== decisions.length) return null;
  if (summary.alert_count !== alerts.length) return null;
  if (summary.blocked_record_count !== blockedRecords.length) return null;

  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    summary,
    events,
    policy_decisions: decisions,
    alerts,
    blocked_records: blockedRecords
  };
}

export function normalizeSandboxSupervisionEvidenceExport(
  value: unknown
): SandboxSupervisionEvidenceExport | null {
  if (!isPlainObject(value) || !hasExactKeys(value, EVIDENCE_EXPORT_KEYS)) return null;

  if (value.schema_version !== SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION) return null;
  if (value.source_schema_version !== SANDBOX_SUPERVISION_SCHEMA_VERSION) return null;

  const session = normalizeSandboxSupervisionSessionDetail(value.session);
  if (!session) return null;

  if (session.summary.evidence_available !== true) return null;

  return {
    schema_version: SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
    source_schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    session
  };
}
