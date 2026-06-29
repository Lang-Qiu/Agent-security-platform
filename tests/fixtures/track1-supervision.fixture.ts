import type {
  SandboxSupervisionCounts,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionSummary
} from "../../shared/types/supervision.ts";

export const RAW_NARRATIVE_SENTINEL = "RAW_NARRATIVE_SENTINEL_REQ009";

const BASE_SUMMARY: SandboxSupervisionSessionSummary = {
  task_id: "task:T1-SC-001-C001",
  session_id: "session:T1-SC-001-C001",
  task_status: "blocked",
  risk_level: "high",
  highest_action: "deny",
  scenario_id: "T1-SC-001",
  case_id: "T1-SC-001-C001",
  tool_names: ["send_email"],
  event_count: 7,
  decision_count: 1,
  alert_count: 0,
  blocked_record_count: 1,
  blocked: true,
  evidence_available: true,
  updated_at: "2026-06-29T00:00:07Z",
  last_event_at: "2026-06-29T00:00:07Z"
};

const BASE_COUNTS: SandboxSupervisionCounts = {
  observed_session_count: 1,
  running_session_count: 0,
  awaiting_confirmation_count: 0,
  alert_record_count: 0,
  blocked_session_count: 1
};

export function makeSupervisionSummary(
  overrides: Partial<SandboxSupervisionSessionSummary> = {}
): SandboxSupervisionSessionSummary {
  return {
    ...BASE_SUMMARY,
    ...overrides,
    tool_names: [...(overrides.tool_names ?? BASE_SUMMARY.tool_names)]
  };
}

export function makeSupervisionCounts(
  overrides: Partial<SandboxSupervisionCounts> = {}
): SandboxSupervisionCounts {
  return { ...BASE_COUNTS, ...overrides };
}

export function makeSupervisionOverview(
  overrides: Partial<SandboxSupervisionOverview> = {}
): SandboxSupervisionOverview {
  return {
    schema_version: overrides.schema_version ?? "track1-supervision-ui.v1",
    counts: overrides.counts ?? { ...BASE_COUNTS },
    matched_session_count: overrides.matched_session_count ?? 1,
    returned_session_count: overrides.returned_session_count ?? 1,
    limit: 100,
    truncated: overrides.truncated ?? false,
    sessions: overrides.sessions ?? [makeSupervisionSummary()]
  };
}
