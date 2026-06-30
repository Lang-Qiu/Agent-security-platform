import { isOneOf, isPlainObject, isString } from "../utils/guards.ts";
import { SANDBOX_POLICY_ACTIONS } from "../types/sandbox.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_CASE_STATUSES,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_STATUSES,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  type Track1CampaignAgentSummary,
  type Track1CampaignCaseSummary,
  type Track1CampaignSummary
} from "../types/campaign-supervision.ts";

export { TRACK1_CAMPAIGN_READ_SCHEMA_VERSION } from "../types/campaign-supervision.ts";

const SUMMARY_KEYS = [
  "schema_version",
  "campaign_id",
  "status",
  "started_at",
  "updated_at",
  "agent_count",
  "case_count",
  "passed_case_count",
  "failed_case_count",
  "retry_count",
  "alert_count",
  "blocked_count",
  "ask_count",
  "evidence_available"
] as const;

const ISO_8601_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const CONTROL_OR_WHITESPACE = /[\s\x00-\x1f\x7f]/;

const CAMPAIGN_ID_PATTERN = /^campaign:t1:[0-9a-f]{32}$/;

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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isCampaignId(value: unknown): value is string {
  return isString(value) && CAMPAIGN_ID_PATTERN.test(value);
}

const SESSION_ID_PATTERN = /^session:[0-9a-f]{32}$/;

function isSessionId(value: unknown): value is string {
  return isString(value) && SESSION_ID_PATTERN.test(value);
}

const AGENT_SUMMARY_KEYS = [
  "campaign_id",
  "agent_id",
  "scenario_id",
  "status",
  "case_count",
  "passed_case_count",
  "failed_case_count",
  "retry_count",
  "alert_count",
  "blocked_count",
  "ask_count",
  "updated_at"
] as const;

const CASE_SUMMARY_KEYS = [
  "campaign_id",
  "agent_id",
  "scenario_id",
  "case_id",
  "status",
  "expected_action",
  "actual_action",
  "attempt_count",
  "current_session_id",
  "updated_at"
] as const;

export function normalizeTrack1CampaignSummary(
  input: unknown
): Track1CampaignSummary | null {
  if (!isPlainObject(input) || !hasExactKeys(input, SUMMARY_KEYS)) return null;

  if (input.schema_version !== TRACK1_CAMPAIGN_READ_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_STATUSES, input.status)) return null;
  if (!isStrictIso8601(input.started_at)) return null;
  if (!isStrictIso8601(input.updated_at)) return null;
  if (input.agent_count !== 3) return null;
  if (input.case_count !== 9) return null;
  if (!isNonNegativeInteger(input.passed_case_count)) return null;
  if (!isNonNegativeInteger(input.failed_case_count)) return null;
  if (!isNonNegativeInteger(input.retry_count)) return null;
  if (!isNonNegativeInteger(input.alert_count)) return null;
  if (!isNonNegativeInteger(input.blocked_count)) return null;
  if (!isNonNegativeInteger(input.ask_count)) return null;
  if (typeof input.evidence_available !== "boolean") return null;

  // Counter invariants against fixed 3-agent/9-case totals.
  if (input.passed_case_count > input.case_count) return null;
  if (input.failed_case_count > input.case_count) return null;
  if (input.passed_case_count + input.failed_case_count > input.case_count)
    return null;
  if (input.retry_count > input.case_count) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    status: input.status,
    started_at: input.started_at,
    updated_at: input.updated_at,
    agent_count: 3,
    case_count: 9,
    passed_case_count: input.passed_case_count,
    failed_case_count: input.failed_case_count,
    retry_count: input.retry_count,
    alert_count: input.alert_count,
    blocked_count: input.blocked_count,
    ask_count: input.ask_count,
    evidence_available: input.evidence_available
  };
}

export function normalizeTrack1CampaignAgentSummary(
  input: unknown
): Track1CampaignAgentSummary | null {
  if (!isPlainObject(input) || !hasExactKeys(input, AGENT_SUMMARY_KEYS)) {
    return null;
  }

  if (!isCampaignId(input.campaign_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_AGENT_IDS, input.agent_id)) return null;
  if (!isOneOf(TRACK1_SCENARIO_IDS, input.scenario_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_STATUSES, input.status)) return null;
  if (input.case_count !== 3) return null;
  if (!isNonNegativeInteger(input.passed_case_count)) return null;
  if (!isNonNegativeInteger(input.failed_case_count)) return null;
  if (!isNonNegativeInteger(input.retry_count)) return null;
  if (!isNonNegativeInteger(input.alert_count)) return null;
  if (!isNonNegativeInteger(input.blocked_count)) return null;
  if (!isNonNegativeInteger(input.ask_count)) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  // Counter invariants against the fixed 3-case-per-agent total.
  if (input.passed_case_count > input.case_count) return null;
  if (input.failed_case_count > input.case_count) return null;
  if (input.passed_case_count + input.failed_case_count > input.case_count) {
    return null;
  }
  if (input.retry_count > input.case_count) return null;

  return {
    campaign_id: input.campaign_id,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    status: input.status,
    case_count: 3,
    passed_case_count: input.passed_case_count,
    failed_case_count: input.failed_case_count,
    retry_count: input.retry_count,
    alert_count: input.alert_count,
    blocked_count: input.blocked_count,
    ask_count: input.ask_count,
    updated_at: input.updated_at
  };
}

export function normalizeTrack1CampaignCaseSummary(
  input: unknown
): Track1CampaignCaseSummary | null {
  if (!isPlainObject(input) || !hasExactKeys(input, CASE_SUMMARY_KEYS)) {
    return null;
  }

  if (!isCampaignId(input.campaign_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_AGENT_IDS, input.agent_id)) return null;
  if (!isOneOf(TRACK1_SCENARIO_IDS, input.scenario_id)) return null;
  if (!isOneOf(TRACK1_CASE_IDS, input.case_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_CASE_STATUSES, input.status)) return null;
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.expected_action)) return null;
  if (input.actual_action !== null) {
    if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.actual_action)) return null;
  }
  if (input.attempt_count !== 1 && input.attempt_count !== 2) return null;
  if (!isSessionId(input.current_session_id)) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  return {
    campaign_id: input.campaign_id,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    status: input.status,
    expected_action: input.expected_action,
    actual_action: input.actual_action,
    attempt_count: input.attempt_count,
    current_session_id: input.current_session_id,
    updated_at: input.updated_at
  };
}
