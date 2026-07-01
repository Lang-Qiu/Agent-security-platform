// P5-T1: Sanitized campaign supervision test/development fixtures.
//
// Every factory returns a fresh, deep-copied, exact-key valid contract that
// passes the shared Phase 1 normalizers. Fixtures contain three agents, nine
// cases, fixed timestamps, and no raw model/tool/runtime content. The default
// campaign is `completed` (all nine cases passed, one attempt each); callers
// can override the status to `running` for polling tests.
//
// These fixtures are `mock-only` data. The campaign supervision service never
// falls back to them on `api-preferred` failure.

import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
  TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS,
  getTrack1CaseExpectedAction,
  type Track1CampaignAgentDetail,
  type Track1CampaignAgentId,
  type Track1CampaignAgentSummary,
  type Track1CampaignAttemptStatus,
  type Track1CampaignAttemptSummary,
  type Track1CampaignCaseDetail,
  type Track1CampaignCaseStatus,
  type Track1CampaignCaseSummary,
  type Track1CampaignDetail,
  type Track1CampaignEvidenceExport,
  type Track1CampaignStatus,
  type Track1CampaignSummary,
  type Track1CaseId
} from "../../../shared/types/campaign-supervision";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const CAMPAIGN_HEX = "0123456789abcdef0123456789abcdef";

// Fixed ISO-8601 timestamps ( millisecond precision to satisfy the strict
// normalizer). All campaign agents/cases share the same window for the
// default `completed` fixture; running overrides re-use the same stamps.
const STARTED_AT = "2026-06-30T00:00:00.000Z";
const UPDATED_AT = "2026-06-30T00:10:00.000Z";
const COMPLETED_AT = "2026-06-30T00:09:58.000Z";

// Each agent owns three contiguous cases in TRACK1_CASE_IDS.
const AGENT_DEFS = [
  {
    agent_id: TRACK1_CAMPAIGN_AGENT_IDS[0],
    scenario_id: TRACK1_SCENARIO_IDS[0],
    case_ids: TRACK1_CASE_IDS.slice(0, 3)
  },
  {
    agent_id: TRACK1_CAMPAIGN_AGENT_IDS[1],
    scenario_id: TRACK1_SCENARIO_IDS[1],
    case_ids: TRACK1_CASE_IDS.slice(3, 6)
  },
  {
    agent_id: TRACK1_CAMPAIGN_AGENT_IDS[2],
    scenario_id: TRACK1_SCENARIO_IDS[2],
    case_ids: TRACK1_CASE_IDS.slice(6, 9)
  }
] as const;

function hexSuffix(n: number): string {
  return n.toString(16).padStart(32, "0");
}

// Deterministic session/task hex per case+attempt so refs are stable but
// globally unique across the campaign. attempt 1 uses counter, attempt 2
// uses counter + 0x80 to avoid collisions.
function sessionHexFor(caseIndex: number, attemptIndex: 1 | 2): string {
  const base = caseIndex + 1;
  const value = attemptIndex === 1 ? base : base + 0x80;
  return hexSuffix(value);
}

function taskHexFor(caseIndex: number, attemptIndex: 1 | 2): string {
  const base = caseIndex + 0x101;
  const value = attemptIndex === 1 ? base : base + 0x80;
  return hexSuffix(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface CampaignSummaryOverrides {
  status?: Track1CampaignStatus;
  passed_case_count?: number;
  failed_case_count?: number;
  retry_count?: number;
  alert_count?: number;
  blocked_count?: number;
  ask_count?: number;
  evidence_available?: boolean;
}

export function makeCampaignSummary(
  overrides?: CampaignSummaryOverrides
): Track1CampaignSummary {
  const status = overrides?.status ?? "running";
  const passed = overrides?.passed_case_count ?? 1;
  const failed = overrides?.failed_case_count ?? 0;
  const retry = overrides?.retry_count ?? 0;
  const alert = overrides?.alert_count ?? 1;
  const blocked = overrides?.blocked_count ?? 1;
  const ask = overrides?.ask_count ?? 0;
  const evidence = overrides?.evidence_available ?? false;

  const base: Track1CampaignSummary = {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: CAMPAIGN_ID,
    status,
    started_at: STARTED_AT,
    updated_at: UPDATED_AT,
    agent_count: 3,
    case_count: 9,
    passed_case_count: passed,
    failed_case_count: failed,
    retry_count: retry,
    alert_count: alert,
    blocked_count: blocked,
    ask_count: ask,
    evidence_available: evidence
  };

  if (status === "completed") {
    return {
      ...base,
      status,
      passed_case_count: 9,
      failed_case_count: 0,
      retry_count: 0,
      alert_count: alert,
      blocked_count: blocked,
      ask_count: ask,
      evidence_available: true,
      completed_at: COMPLETED_AT
    };
  }

  return clone(base);
}

export interface CampaignDetailOverrides {
  status?: Track1CampaignStatus;
}

export function makeCampaignDetail(
  overrides?: CampaignDetailOverrides
): Track1CampaignDetail {
  const status: Track1CampaignStatus = overrides?.status ?? "completed";
  return clone(buildDetail(status));
}

function buildDetail(status: Track1CampaignStatus): Track1CampaignDetail {
  const agents: Track1CampaignAgentDetail[] = AGENT_DEFS.map((def, agentIdx) => {
    const cases: Track1CampaignCaseDetail[] = def.case_ids.map(
      (caseId, caseWithinAgent) => {
        const caseIndex = agentIdx * 3 + caseWithinAgent;
        const expectedAction = getTrack1CaseExpectedAction(caseId as Track1CaseId);

        // For `completed`: all 9 cases passed with one attempt that matches
        // the oracle. For `running`: the first case of the first agent is
        // `running` (terminal-attempt constraint preserved), the remaining
        // eight are `passed` so the campaign is not all-terminal.
        let caseStatus: Track1CampaignCaseStatus;
        let attemptCount: 0 | 1 | 2;
        let attemptStatus: Track1CampaignAttemptStatus;
        let actualAction: typeof expectedAction | null;

        if (status === "completed") {
          caseStatus = "passed";
          attemptCount = 1;
          attemptStatus = "passed";
          actualAction = expectedAction;
        } else {
          // running
          if (agentIdx === 0 && caseWithinAgent === 0) {
            caseStatus = "running";
            attemptCount = 1;
            attemptStatus = "running";
            actualAction = null;
          } else {
            caseStatus = "passed";
            attemptCount = 1;
            attemptStatus = "passed";
            actualAction = expectedAction;
          }
        }

        const attempt: Track1CampaignAttemptSummary = {
          campaign_id: CAMPAIGN_ID,
          agent_id: def.agent_id,
          scenario_id: def.scenario_id,
          case_id: caseId,
          attempt_id: `attempt:${caseId.toLowerCase()}:1`,
          attempt_index: 1,
          session_id: `session:${sessionHexFor(caseIndex, 1)}`,
          task_id: `task:${taskHexFor(caseIndex, 1)}`,
          status: attemptStatus,
          actual_action: actualAction,
          started_at: STARTED_AT,
          updated_at: UPDATED_AT
        };

        return {
          campaign_id: CAMPAIGN_ID,
          agent_id: def.agent_id,
          scenario_id: def.scenario_id,
          case_id: caseId,
          status: caseStatus,
          expected_action: expectedAction,
          attempt_count: attemptCount,
          attempts: [attempt],
          updated_at: UPDATED_AT
        };
      }
    );

    // Agent status mirrors campaign status for the default fixture.
    const agentStatus: Track1CampaignStatus =
      status === "completed"
        ? "completed"
        : agentIdx === 0
          ? "running"
          : "completed";

    return {
      campaign_id: CAMPAIGN_ID,
      agent_id: def.agent_id,
      scenario_id: def.scenario_id,
      status: agentStatus,
      case_count: 3,
      cases,
      updated_at: UPDATED_AT
    };
  });

  return {
    schema_version: TRACK1_CAMPAIGN_READ_SCHEMA_VERSION,
    campaign_id: CAMPAIGN_ID,
    status,
    started_at: STARTED_AT,
    updated_at: UPDATED_AT,
    agent_count: 3,
    case_count: 9,
    agents
  };
}

export function makeCampaignEvidence(): Track1CampaignEvidenceExport {
  const detail = buildDetail("completed");
  const sessionHexes: string[] = [];
  for (const agent of detail.agents) {
    for (const c of agent.cases) {
      for (const a of c.attempts) {
        sessionHexes.push(a.session_id.substring("session:".length));
      }
    }
  }
  const sessionEvidenceRefs = sessionHexes.map(
    (h) => `evidence://track1/campaign/${CAMPAIGN_HEX}/session/${h}`
  );
  return {
    schema_version: TRACK1_CAMPAIGN_EVIDENCE_SCHEMA_VERSION,
    campaign: detail,
    session_evidence_refs: sessionEvidenceRefs,
    artifact_manifest_ref: `artifact://track1/campaign/${CAMPAIGN_HEX}/manifest`
  };
}

export interface CampaignAgentSummaryOverrides {
  status?: Track1CampaignStatus;
  passed_case_count?: number;
  failed_case_count?: number;
  retry_count?: number;
  alert_count?: number;
  blocked_count?: number;
  ask_count?: number;
}

export function makeCampaignAgentSummary(
  agentId: Track1CampaignAgentId,
  overrides?: CampaignAgentSummaryOverrides
): Track1CampaignAgentSummary {
  const def = AGENT_DEFS.find((d) => d.agent_id === agentId);
  if (!def) {
    throw new Error(`Unknown Track1 campaign agent id: ${agentId}`);
  }
  return {
    campaign_id: CAMPAIGN_ID,
    agent_id: def.agent_id,
    scenario_id: def.scenario_id,
    status: overrides?.status ?? "running",
    case_count: 3,
    passed_case_count: overrides?.passed_case_count ?? 1,
    failed_case_count: overrides?.failed_case_count ?? 0,
    retry_count: overrides?.retry_count ?? 0,
    alert_count: overrides?.alert_count ?? 1,
    blocked_count: overrides?.blocked_count ?? 1,
    ask_count: overrides?.ask_count ?? 0,
    updated_at: UPDATED_AT
  };
}

export interface CampaignCaseSummaryOverrides {
  status?: Track1CampaignCaseStatus;
  actual_action?: Track1CampaignCaseSummary["actual_action"];
  attempt_count?: 0 | 1 | 2;
  current_session_id?: string | null;
}

export function makeCampaignCaseSummary(
  caseId: Track1CaseId,
  overrides?: CampaignCaseSummaryOverrides
): Track1CampaignCaseSummary {
  const def = AGENT_DEFS.find((d) => d.case_ids.includes(caseId));
  if (!def) {
    throw new Error(`Unknown Track1 case id: ${caseId}`);
  }
  const expectedAction = getTrack1CaseExpectedAction(caseId);
  const caseIndex = TRACK1_CASE_IDS.indexOf(caseId);
  const status = overrides?.status ?? "passed";
  const attemptCount = overrides?.attempt_count ?? 1;
  const currentSessionId =
    overrides?.current_session_id ??
    (attemptCount === 0 ? null : `session:${sessionHexFor(caseIndex, 1)}`);
  const actualAction =
    overrides?.actual_action ??
    (status === "passed" ? expectedAction : status === "failed" ? "deny" : null);

  return {
    campaign_id: CAMPAIGN_ID,
    agent_id: def.agent_id,
    scenario_id: def.scenario_id,
    case_id: caseId,
    status,
    expected_action: expectedAction,
    actual_action: actualAction,
    attempt_count: attemptCount,
    current_session_id: currentSessionId,
    updated_at: UPDATED_AT
  };
}

export interface CampaignAttemptSummaryOverrides {
  status?: Track1CampaignAttemptStatus;
  actual_action?: Track1CampaignAttemptSummary["actual_action"];
}

export function makeCampaignAttemptSummary(
  caseId: Track1CaseId,
  attemptIndex: 1 | 2,
  overrides?: CampaignAttemptSummaryOverrides
): Track1CampaignAttemptSummary {
  const def = AGENT_DEFS.find((d) => d.case_ids.includes(caseId));
  if (!def) {
    throw new Error(`Unknown Track1 case id: ${caseId}`);
  }
  const expectedAction = getTrack1CaseExpectedAction(caseId);
  const caseIndex = TRACK1_CASE_IDS.indexOf(caseId);
  const status = overrides?.status ?? "passed";
  const actualAction =
    overrides?.actual_action ?? (status === "passed" ? expectedAction : "deny");

  return {
    campaign_id: CAMPAIGN_ID,
    agent_id: def.agent_id,
    scenario_id: def.scenario_id,
    case_id: caseId,
    attempt_id: `attempt:${caseId.toLowerCase()}:${attemptIndex}`,
    attempt_index: attemptIndex,
    session_id: `session:${sessionHexFor(caseIndex, attemptIndex)}`,
    task_id: `task:${taskHexFor(caseIndex, attemptIndex)}`,
    status,
    actual_action: actualAction,
    started_at: STARTED_AT,
    updated_at: UPDATED_AT
  };
}
