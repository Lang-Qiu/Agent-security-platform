import { isOneOf, isPlainObject, isString, isStringArray } from "../utils/guards.ts";
import { SANDBOX_POLICY_ACTIONS } from "../types/sandbox.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_ATTEMPT_STATUSES,
  TRACK1_CAMPAIGN_CASE_STATUSES,
  TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_STATUSES,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  type Track1CampaignAgentDetail,
  type Track1CampaignAgentSummary,
  type Track1CampaignAttemptSummary,
  type Track1CampaignCaseDetail,
  type Track1CampaignCaseSummary,
  type Track1CampaignDetail,
  type Track1CampaignEvidenceExport,
  type Track1CampaignSummary
} from "../types/campaign-supervision.ts";

export {
  TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION
} from "../types/campaign-supervision.ts";

const SUMMARY_BASE_KEYS = [
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

// When status === "completed", the summary must also carry a `completed_at`
// timestamp. Any other status must NOT include `completed_at` (P1-4).
const SUMMARY_COMPLETED_KEYS = [
  ...SUMMARY_BASE_KEYS,
  "completed_at"
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

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  // Reject objects whose prototype is not Object.prototype or null.
  // This prevents prototype-injected objects from bypassing the key set
  // check via inherited fields (e.g., Object.create({ campaign_id: ... })).
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;

  // Compare own-property key sets exactly. Using `hasOwnProperty` instead of
  // `key in value` ensures prototype-inherited fields are never accepted as
  // substitutes for required own properties.
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length !== expected.length) return false;

  const expectedSet = new Set(expected);
  return ownKeys.every((key) => expectedSet.has(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isCampaignId(value: unknown): value is string {
  return isString(value) && CAMPAIGN_ID_PATTERN.test(value);
}

const SESSION_ID_PATTERN = /^session:[0-9a-f]{32}$/;

function isSessionId(value: unknown): value is string {
  return isString(value) && SESSION_ID_PATTERN.test(value);
}

const TASK_ID_PATTERN = /^task:[0-9a-f]{32}$/;

function isTaskId(value: unknown): value is string {
  return isString(value) && TASK_ID_PATTERN.test(value);
}

// P1-3: fixed agent/scenario/case mapping.
// TRACK1_CASE_IDS is ordered in groups of 3, one group per agent/scenario.
// case index 0..2  -> agent[0] / scenario[0]
// case index 3..5  -> agent[1] / scenario[1]
// case index 6..8  -> agent[2] / scenario[2]
function isValidTrack1AgentScenario(
  agentId: string,
  scenarioId: string
): boolean {
  const agentIdx = TRACK1_CAMPAIGN_AGENT_IDS.indexOf(
    agentId as Track1CampaignAgentId
  );
  if (agentIdx === -1) return false;
  return TRACK1_SCENARIO_IDS[agentIdx] === scenarioId;
}

export function isValidTrack1AgentScenarioCase(
  agentId: string,
  scenarioId: string,
  caseId: string
): boolean {
  const caseIdx = TRACK1_CASE_IDS.indexOf(caseId as Track1CaseId);
  if (caseIdx === -1) return false;
  const groupIdx = Math.floor(caseIdx / 3);
  return (
    TRACK1_CAMPAIGN_AGENT_IDS[groupIdx] === agentId &&
    TRACK1_SCENARIO_IDS[groupIdx] === scenarioId
  );
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
  if (!isPlainObject(input)) return null;

  // P1-4: completed_at is required when status === "completed" and forbidden
  // otherwise. The expected key set is therefore conditional on status.
  const isCompleted = input.status === "completed";
  const expectedKeys = isCompleted ? SUMMARY_COMPLETED_KEYS : SUMMARY_BASE_KEYS;
  if (!hasExactKeys(input, expectedKeys)) return null;

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

  // Validate completed_at when present (status === "completed").
  const completedAt = (input as Record<string, unknown>).completed_at;
  if (isCompleted && !isStrictIso8601(completedAt)) return null;

  // Counter invariants against fixed 3-agent/9-case totals.
  if (input.passed_case_count > input.case_count) return null;
  if (input.failed_case_count > input.case_count) return null;
  if (input.passed_case_count + input.failed_case_count > input.case_count)
    return null;
  if (input.retry_count > input.case_count) return null;

  // P1-2 rework: completed campaign requires all 9 cases resolved.
  if (isCompleted && input.passed_case_count + input.failed_case_count !== input.case_count) {
    return null;
  }

  // P1-2 rework: completed_at must not precede started_at.
  if (isCompleted) {
    if (Date.parse(completedAt as string) < Date.parse(input.started_at)) {
      return null;
    }
  }

  const result: Track1CampaignSummary = {
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
  if (isCompleted) {
    result.completed_at = completedAt as string;
  }
  return result;
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
  // P1-3: agent_id and scenario_id must come from the same fixed group.
  if (!isValidTrack1AgentScenario(input.agent_id, input.scenario_id)) return null;
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
  // P1-3: agent_id, scenario_id and case_id must come from the same fixed group.
  if (
    !isValidTrack1AgentScenarioCase(
      input.agent_id,
      input.scenario_id,
      input.case_id
    )
  ) {
    return null;
  }
  if (!isOneOf(TRACK1_CAMPAIGN_CASE_STATUSES, input.status)) return null;
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.expected_action)) return null;
  if (input.actual_action !== null) {
    if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.actual_action)) return null;
  }
  if (input.attempt_count !== 0 && input.attempt_count !== 1 && input.attempt_count !== 2) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  // P1-1 rework 3: complete state matrix.
  // pending -> attempt_count must be 0, actual_action must be null,
  //            current_session_id must be null (no session yet)
  // non-pending -> attempt_count must be >= 1, current_session_id must be valid
  if (input.status === "pending") {
    if (input.attempt_count !== 0) return null;
    if (input.actual_action !== null) return null;
    if (input.current_session_id !== null) return null;
  } else {
    if (input.attempt_count === 0) return null;
    if (!isSessionId(input.current_session_id)) return null;
  }

  // P1-3: status/action consistency.
  // passed  -> actual_action must equal expected_action (and not be null)
  // failed  -> actual_action must not be null (may differ from expected_action)
  // running -> actual_action may be null or any valid action
  if (input.status === "passed") {
    if (input.actual_action === null) return null;
    if (input.actual_action !== input.expected_action) return null;
  } else if (input.status === "failed") {
    if (input.actual_action === null) return null;
  }

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

// P1-T3: detail and evidence normalizers

const ATTEMPT_KEYS = [
  "campaign_id",
  "agent_id",
  "scenario_id",
  "case_id",
  "attempt_id",
  "attempt_index",
  "session_id",
  "task_id",
  "status",
  "actual_action",
  "started_at",
  "updated_at"
] as const;

const CASE_DETAIL_KEYS = [
  "campaign_id",
  "agent_id",
  "scenario_id",
  "case_id",
  "status",
  "expected_action",
  "attempt_count",
  "attempts",
  "updated_at"
] as const;

const AGENT_DETAIL_KEYS = [
  "campaign_id",
  "agent_id",
  "scenario_id",
  "status",
  "case_count",
  "cases",
  "updated_at"
] as const;

const DETAIL_KEYS = [
  "schema_version",
  "campaign_id",
  "status",
  "started_at",
  "updated_at",
  "agent_count",
  "case_count",
  "agents"
] as const;

const EVIDENCE_KEYS = [
  "schema_version",
  "campaign",
  "session_evidence_refs",
  "artifact_manifest_ref"
] as const;

const EVIDENCE_REF_PATTERN =
  /^evidence:\/\/track1\/campaign\/([0-9a-f]{32})\/session\/([0-9a-f]{32})$/;
const ARTIFACT_REF_PATTERN =
  /^artifact:\/\/track1\/campaign\/([0-9a-f]{32})\/manifest$/;

function normalizeTrack1CampaignAttempt(
  input: unknown,
  expectedCampaignId: string,
  expectedAgentId: string,
  expectedScenarioId: string,
  expectedCaseId: string
): Track1CampaignAttemptSummary | null {
  if (!isPlainObject(input) || !hasExactKeys(input, ATTEMPT_KEYS)) {
    return null;
  }

  if (input.campaign_id !== expectedCampaignId) return null;
  if (input.agent_id !== expectedAgentId) return null;
  if (input.scenario_id !== expectedScenarioId) return null;
  if (input.case_id !== expectedCaseId) return null;

  if (input.attempt_index !== 1 && input.attempt_index !== 2) return null;

  // attempt_id must be canonical: attempt:<case_id_lower>:<attempt_index>
  const expectedAttemptId = `attempt:${expectedCaseId.toLowerCase()}:${input.attempt_index}`;
  if (input.attempt_id !== expectedAttemptId) return null;

  if (!isSessionId(input.session_id)) return null;
  if (!isTaskId(input.task_id)) return null;
  // P2-3: attempts use a separate status set that excludes "pending".
  if (!isOneOf(TRACK1_CAMPAIGN_ATTEMPT_STATUSES, input.status)) return null;
  if (input.actual_action !== null) {
    if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.actual_action)) return null;
  }
  if (!isStrictIso8601(input.started_at)) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  return {
    campaign_id: input.campaign_id,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    attempt_id: input.attempt_id,
    attempt_index: input.attempt_index,
    session_id: input.session_id,
    task_id: input.task_id,
    status: input.status,
    actual_action: input.actual_action,
    started_at: input.started_at,
    updated_at: input.updated_at
  };
}

function normalizeTrack1CampaignCaseDetail(
  input: unknown,
  expectedCampaignId: string,
  expectedAgentId: string,
  expectedScenarioId: string,
  expectedCaseId: string,
  sessionSet: Set<string>
): Track1CampaignCaseDetail | null {
  if (!isPlainObject(input) || !hasExactKeys(input, CASE_DETAIL_KEYS)) {
    return null;
  }

  if (input.campaign_id !== expectedCampaignId) return null;
  if (input.agent_id !== expectedAgentId) return null;
  if (input.scenario_id !== expectedScenarioId) return null;
  if (input.case_id !== expectedCaseId) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_CASE_STATUSES, input.status)) return null;
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, input.expected_action)) return null;
  if (input.attempt_count !== 0 && input.attempt_count !== 1 && input.attempt_count !== 2) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  if (!Array.isArray(input.attempts)) return null;
  if (input.attempts.length !== input.attempt_count) return null;

  // P1-1 rework 3: pending cases must have zero attempts.
  if (input.status === "pending") {
    if (input.attempt_count !== 0) return null;
    if (input.attempts.length !== 0) return null;
  } else {
    // non-pending cases must have at least one attempt.
    if (input.attempt_count === 0) return null;
  }

  const normalizedAttempts: Track1CampaignAttemptSummary[] = [];
  for (let i = 0; i < input.attempts.length; i++) {
    const attempt = input.attempts[i];
    const normalized = normalizeTrack1CampaignAttempt(
      attempt,
      expectedCampaignId,
      expectedAgentId,
      expectedScenarioId,
      expectedCaseId
    );
    if (!normalized) return null;

    // attempts must be ordered by attempt_index ascending starting at 1.
    if (normalized.attempt_index !== i + 1) return null;

    // session_id must be globally unique across the whole campaign.
    if (sessionSet.has(normalized.session_id)) return null;
    sessionSet.add(normalized.session_id);

    normalizedAttempts.push(normalized);
  }

  // P1-1 rework 3: two-attempt predecessor failure constraint.
  // A second attempt is only valid if the first attempt failed.
  if (normalizedAttempts.length === 2) {
    if (normalizedAttempts[0].status !== "failed") return null;
  }

  // P1-1 rework 3: pending cases have no attempts to check.
  if (input.status === "pending") {
    return {
      campaign_id: input.campaign_id,
      agent_id: input.agent_id,
      scenario_id: input.scenario_id,
      case_id: input.case_id,
      status: input.status,
      expected_action: input.expected_action,
      attempt_count: input.attempt_count,
      attempts: normalizedAttempts,
      updated_at: input.updated_at
    };
  }

  // P1-2 rework: case status/action consistency, mirroring the case summary
  // rule. A case detail carries its own status and the attempts' statuses; the
  // final attempt's actual_action is the case outcome.
  // passed  -> final attempt actual_action must equal expected_action (not null)
  // failed  -> final attempt actual_action must not be null
  // running -> no constraint on actual_action (may be null mid-flight)
  const finalAttempt = normalizedAttempts[normalizedAttempts.length - 1];
  if (input.status === "passed") {
    if (finalAttempt.actual_action === null) return null;
    if (finalAttempt.actual_action !== input.expected_action) return null;
    // P1-1 rework 2: the final attempt status must also be "passed".
    if (finalAttempt.status !== "passed") return null;
  } else if (input.status === "failed") {
    if (finalAttempt.actual_action === null) return null;
    // P1-1 rework 2: the final attempt status must also be "failed".
    if (finalAttempt.status !== "failed") return null;
  } else if (input.status === "running") {
    // P1-1 rework 2: a running case cannot have a terminal (passed/failed)
    // attempt as its final attempt.
    if (finalAttempt.status === "passed" || finalAttempt.status === "failed") {
      return null;
    }
  }

  return {
    campaign_id: input.campaign_id,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    status: input.status,
    expected_action: input.expected_action,
    attempt_count: input.attempt_count,
    attempts: normalizedAttempts,
    updated_at: input.updated_at
  };
}

function normalizeTrack1CampaignAgentDetail(
  input: unknown,
  expectedCampaignId: string,
  agentIndex: number,
  caseIdSet: Set<string>,
  sessionSet: Set<string>
): Track1CampaignAgentDetail | null {
  if (!isPlainObject(input) || !hasExactKeys(input, AGENT_DETAIL_KEYS)) {
    return null;
  }

  const expectedAgentId = TRACK1_CAMPAIGN_AGENT_IDS[agentIndex];
  const expectedScenarioId = TRACK1_SCENARIO_IDS[agentIndex];

  if (input.campaign_id !== expectedCampaignId) return null;
  if (input.agent_id !== expectedAgentId) return null;
  if (input.scenario_id !== expectedScenarioId) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_STATUSES, input.status)) return null;
  if (input.case_count !== 3) return null;
  if (!isStrictIso8601(input.updated_at)) return null;

  if (!Array.isArray(input.cases)) return null;
  if (input.cases.length !== 3) return null;

  // cases must be in fixed TRACK1_CASE_IDS order for this agent.
  const expectedCaseIds = TRACK1_CASE_IDS.slice(agentIndex * 3, agentIndex * 3 + 3);

  const normalizedCases: Track1CampaignCaseDetail[] = [];
  for (let i = 0; i < input.cases.length; i++) {
    const expectedCaseId = expectedCaseIds[i];

    const normalized = normalizeTrack1CampaignCaseDetail(
      input.cases[i],
      expectedCampaignId,
      expectedAgentId,
      expectedScenarioId,
      expectedCaseId,
      sessionSet
    );
    if (!normalized) return null;

    // case_id must be globally unique across the whole campaign.
    if (caseIdSet.has(normalized.case_id)) return null;
    caseIdSet.add(normalized.case_id);

    normalizedCases.push(normalized);
  }

  // P1-1 rework 2: agent status must be consistent with its case statuses.
  // completed -> all 3 cases must be terminal (passed or failed)
  // running   -> at least one case must be running (not all terminal)
  // created/validating -> all cases must be pending
  // collecting -> all cases must be terminal
  const allCasesTerminal = normalizedCases.every(
    (c) => c.status === "passed" || c.status === "failed"
  );
  const allCasesPending = normalizedCases.every(
    (c) => c.status === "pending"
  );
  if (input.status === "completed") {
    if (!allCasesTerminal) return null;
  } else if (input.status === "running") {
    if (allCasesTerminal) return null;
  } else if (input.status === "created" || input.status === "validating") {
    if (!allCasesPending) return null;
  } else if (input.status === "collecting") {
    if (!allCasesTerminal) return null;
  }

  return {
    campaign_id: input.campaign_id,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    status: input.status,
    case_count: 3,
    cases: normalizedCases,
    updated_at: input.updated_at
  };
}

export function normalizeTrack1CampaignDetail(
  input: unknown
): Track1CampaignDetail | null {
  if (!isPlainObject(input) || !hasExactKeys(input, DETAIL_KEYS)) {
    return null;
  }

  if (input.schema_version !== TRACK1_CAMPAIGN_READ_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isOneOf(TRACK1_CAMPAIGN_STATUSES, input.status)) return null;
  if (!isStrictIso8601(input.started_at)) return null;
  if (!isStrictIso8601(input.updated_at)) return null;
  if (input.agent_count !== 3) return null;
  if (input.case_count !== 9) return null;

  if (!Array.isArray(input.agents)) return null;
  if (input.agents.length !== 3) return null;

  const caseIdSet = new Set<string>();
  const sessionSet = new Set<string>();

  const normalizedAgents: Track1CampaignAgentDetail[] = [];
  for (let i = 0; i < input.agents.length; i++) {
    const normalized = normalizeTrack1CampaignAgentDetail(
      input.agents[i],
      input.campaign_id,
      i,
      caseIdSet,
      sessionSet
    );
    if (!normalized) return null;
    normalizedAgents.push(normalized);
  }

  // P1-1 rework 2: campaign status must be consistent with agent statuses.
  // completed -> all 3 agents must be completed
  // running   -> at least one agent must be running (not all completed)
  // created/validating -> all agents must be created/validating respectively,
  //                       and all cases must be pending
  // collecting -> all agents must be completed (collecting happens after done)
  const allAgentsCompleted = normalizedAgents.every(
    (a) => a.status === "completed"
  );
  if (input.status === "completed") {
    if (!allAgentsCompleted) return null;
  } else if (input.status === "running") {
    if (allAgentsCompleted) return null;
  } else if (input.status === "created" || input.status === "validating") {
    // P1-1 rework 3: created/validating campaign must have all agents in the
    // same state and all cases pending.
    for (const agent of normalizedAgents) {
      if (agent.status !== input.status) return null;
      for (const c of agent.cases) {
        if (c.status !== "pending") return null;
      }
    }
  } else if (input.status === "collecting") {
    // P1-2 rework 4: collecting campaign requires all agents completed.
    if (!allAgentsCompleted) return null;
  }

  return {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    status: input.status,
    started_at: input.started_at,
    updated_at: input.updated_at,
    agent_count: 3,
    case_count: 9,
    agents: normalizedAgents
  };
}

export function normalizeTrack1CampaignEvidenceExport(
  input: unknown
): Track1CampaignEvidenceExport | null {
  if (!isPlainObject(input) || !hasExactKeys(input, EVIDENCE_KEYS)) {
    return null;
  }

  if (input.schema_version !== TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION) {
    return null;
  }

  const normalizedCampaign = normalizeTrack1CampaignDetail(input.campaign);
  if (!normalizedCampaign) return null;

  if (!isStringArray(input.session_evidence_refs)) return null;
  if (!isString(input.artifact_manifest_ref)) return null;

  // Extract the 32-hex suffix from campaign_id.
  const campaignHex = normalizedCampaign.campaign_id.substring(
    "campaign:t1:".length
  );

  // Validate artifact_manifest_ref format and campaign correlation.
  const artifactMatch = input.artifact_manifest_ref.match(ARTIFACT_REF_PATTERN);
  if (!artifactMatch) return null;
  if (artifactMatch[1] !== campaignHex) return null;

  // Collect the ordered list of session hex suffixes by walking the campaign
  // in its fixed traversal order (agent 0 case 0 attempt 0, ... agent 2 case 2).
  const orderedSessionHexes: string[] = [];
  const sessionHexSet = new Set<string>();
  for (const agent of normalizedCampaign.agents) {
    for (const c of agent.cases) {
      for (const a of c.attempts) {
        const hex = a.session_id.substring("session:".length);
        orderedSessionHexes.push(hex);
        sessionHexSet.add(hex);
      }
    }
  }

  // P1-3: session_evidence_refs must be non-empty, unique, and complete.
  if (input.session_evidence_refs.length === 0) return null;

  // P2-4: refs must appear in deterministic campaign traversal order.
  // Reversed or shuffled refs are rejected even if the set is complete.
  for (let i = 0; i < input.session_evidence_refs.length; i++) {
    const ref = input.session_evidence_refs[i];
    const expectedHex = orderedSessionHexes[i];
    const expectedRef = `evidence://track1/campaign/${campaignHex}/session/${expectedHex}`;
    if (ref !== expectedRef) return null;
  }

  const seenRefs = new Set<string>();
  for (const ref of input.session_evidence_refs) {
    // Reject duplicates.
    if (seenRefs.has(ref)) return null;
    seenRefs.add(ref);

    const match = ref.match(EVIDENCE_REF_PATTERN);
    if (!match) return null;
    if (match[1] !== campaignHex) return null;
    if (!sessionHexSet.has(match[2])) return null;
  }

  // Completeness: every session in the campaign must have exactly one ref.
  if (seenRefs.size !== sessionHexSet.size) return null;

  return {
    schema_version: TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
    campaign: normalizedCampaign,
    session_evidence_refs: [...input.session_evidence_refs],
    artifact_manifest_ref: input.artifact_manifest_ref
  };
}
