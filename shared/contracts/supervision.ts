import { RISK_LEVELS } from "../constants/risk-level.ts";
import { TASK_STATUSES } from "../constants/task-status.ts";
import { isOneOf, isPlainObject, isString } from "../utils/guards.ts";
import { SANDBOX_POLICY_ACTIONS } from "../types/sandbox.ts";
import {
  SANDBOX_SUPERVISION_SCHEMA_VERSION,
  type SandboxSupervisionCounts,
  type SandboxSupervisionOverview,
  type SandboxSupervisionSessionSummary,
  type SandboxSupervisionToolName
} from "../types/supervision.ts";

export { SANDBOX_SUPERVISION_SCHEMA_VERSION } from "../types/supervision.ts";

const SUPERVISION_TOOL_NAMES: readonly SandboxSupervisionToolName[] = [
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
  if (!Array.isArray(value) || value.length === 0) return false;

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
