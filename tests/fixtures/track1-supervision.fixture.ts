import type {
  SandboxSupervisionAlertView,
  SandboxSupervisionBlockedRecordView,
  SandboxSupervisionCounts,
  SandboxSupervisionDecisionView,
  SandboxSupervisionEventView,
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail,
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
  alert_count: 1,
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
  alert_record_count: 1,
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

const BASE_DECISION: SandboxSupervisionDecisionView = {
  decision_id: "decision:001",
  subject_event_id: "event:tool_request",
  policy_id: "policy:tool_target",
  action: "deny",
  reason_code: "target_not_approved",
  evidence_refs: ["evidence://decision/001"],
  decided_at: "2026-06-29T00:00:05Z"
};

const BASE_ALERT: SandboxSupervisionAlertView = {
  alert_id: "alert:001",
  subject_event_id: "event:tool_request",
  decision_id: "decision:001",
  risk_level: "high",
  category: "tool_target",
  evidence_refs: ["evidence://alert/001"],
  occurred_at: "2026-06-29T00:00:08Z"
};

const BASE_BLOCKED_RECORD: SandboxSupervisionBlockedRecordView = {
  blocked_record_id: "blocked:001",
  subject_event_id: "event:tool_request",
  decision_id: "decision:001",
  evidence_refs: ["evidence://blocked/001"],
  occurred_at: "2026-06-29T00:00:09Z"
};

export function makeDecisionView(
  overrides: Partial<SandboxSupervisionDecisionView> = {}
): SandboxSupervisionDecisionView {
  return {
    ...BASE_DECISION,
    ...overrides,
    evidence_refs: [...(overrides.evidence_refs ?? BASE_DECISION.evidence_refs)]
  };
}

export function makeAlertView(
  overrides: Partial<SandboxSupervisionAlertView> = {}
): SandboxSupervisionAlertView {
  return {
    ...BASE_ALERT,
    ...overrides,
    evidence_refs: [...(overrides.evidence_refs ?? BASE_ALERT.evidence_refs)]
  };
}

export function makeBlockedRecordView(
  overrides: Partial<SandboxSupervisionBlockedRecordView> = {}
): SandboxSupervisionBlockedRecordView {
  return {
    ...BASE_BLOCKED_RECORD,
    ...overrides,
    evidence_refs: [
      ...(overrides.evidence_refs ?? BASE_BLOCKED_RECORD.evidence_refs)
    ]
  };
}

export function makeEventView(
  eventType: SandboxSupervisionEventView["event_type"]
): SandboxSupervisionEventView {
  const common = {
    session_id: BASE_SUMMARY.session_id,
    scenario_id: BASE_SUMMARY.scenario_id,
    case_id: BASE_SUMMARY.case_id
  } as const;

  switch (eventType) {
    case "model_input":
      return {
        event_id: "event:model_input",
        ...common,
        sequence: 1,
        event_type: "model_input",
        occurred_at: "2026-06-29T00:00:01Z",
        source: "agent",
        evidence_refs: ["evidence://model/input/001"],
        payload: {
          model_ref: "model://base/demo",
          content_ref: "fixture://cases/T1-SC-001-C001/model-input",
          content_sha256: "a".repeat(64)
        }
      };
    case "model_output":
      return {
        event_id: "event:model_output",
        ...common,
        sequence: 2,
        event_type: "model_output",
        occurred_at: "2026-06-29T00:00:02Z",
        source: "model",
        evidence_refs: ["evidence://model/output/001"],
        payload: {
          model_ref: "model://base/demo",
          content_ref: "fixture://cases/T1-SC-001-C001/model-output",
          content_sha256: "b".repeat(64)
        }
      };
    case "tool_request":
      return {
        event_id: "event:tool_request",
        ...common,
        sequence: 3,
        event_type: "tool_request",
        occurred_at: "2026-06-29T00:00:03Z",
        source: "agent",
        evidence_refs: ["evidence://tool/request/001"],
        payload: {
          call_id: "call:001",
          tool_name: "send_email",
          target_ref: "recipient://reviewer@local.invalid",
          arguments_ref: "fixture://cases/T1-SC-001-C001/tool-request"
        }
      };
    case "tool_result":
      return {
        event_id: "event:tool_result",
        ...common,
        sequence: 4,
        event_type: "tool_result",
        occurred_at: "2026-06-29T00:00:04Z",
        source: "tool",
        evidence_refs: ["evidence://tool/result/001"],
        payload: {
          call_id: "call:001",
          tool_name: "send_email",
          status: "rejected",
          result_ref: "evidence://tool/result/001",
          state_change: "none"
        }
      };
    case "policy_decision":
      return {
        event_id: "event:policy_decision",
        ...common,
        sequence: 5,
        event_type: "policy_decision",
        occurred_at: "2026-06-29T00:00:05Z",
        source: "policy",
        evidence_refs: ["evidence://decision/001"],
        payload: { ...BASE_DECISION }
      };
    case "memory_write":
      return {
        event_id: "event:memory_write",
        ...common,
        sequence: 6,
        event_type: "memory_write",
        occurred_at: "2026-06-29T00:00:06Z",
        source: "memory",
        evidence_refs: ["evidence://memory/write/001"],
        payload: {
          memory_entry_id: "memory:001",
          content_ref: "fixture://memory/001",
          content_sha256: "c".repeat(64)
        }
      };
    case "memory_read":
      return {
        event_id: "event:memory_read",
        ...common,
        sequence: 7,
        event_type: "memory_read",
        occurred_at: "2026-06-29T00:00:07Z",
        source: "memory",
        evidence_refs: ["evidence://memory/read/001"],
        payload: {
          memory_entry_id: "memory:001",
          content_ref: "fixture://memory/001",
          content_sha256: "c".repeat(64)
        }
      };
  }
}

const EVENT_TYPE_ORDER: SandboxSupervisionEventView["event_type"][] = [
  "model_input",
  "model_output",
  "tool_request",
  "tool_result",
  "policy_decision",
  "memory_write",
  "memory_read"
];

export function makeSupervisionDetail(
  overrides: Partial<SandboxSupervisionSessionDetail> = {}
): SandboxSupervisionSessionDetail {
  const events = overrides.events ?? EVENT_TYPE_ORDER.map((type) => makeEventView(type));
  const policyDecisions =
    overrides.policy_decisions ?? [makeDecisionView()];
  const alerts = overrides.alerts ?? [makeAlertView()];
  const blockedRecords =
    overrides.blocked_records ?? [makeBlockedRecordView()];

  return {
    schema_version:
      overrides.schema_version ?? "track1-supervision-ui.v1",
    summary: overrides.summary ?? makeSupervisionSummary(),
    events,
    policy_decisions: policyDecisions,
    alerts,
    blocked_records: blockedRecords
  };
}

export function makeSupervisionEvidence(
  overrides: Partial<SandboxSupervisionEvidenceExport> = {}
): SandboxSupervisionEvidenceExport {
  return {
    schema_version:
      overrides.schema_version ?? "track1-supervision-evidence.v1",
    source_schema_version:
      overrides.source_schema_version ?? "track1-supervision-ui.v1",
    session: overrides.session ?? makeSupervisionDetail()
  };
}
