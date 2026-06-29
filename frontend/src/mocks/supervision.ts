import { SANDBOX_SUPERVISION_SCHEMA_VERSION, SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION } from "../../../shared/contracts/supervision";
import type { SandboxPolicyAction } from "../../../shared/types/sandbox";
import type { RiskLevel, TaskStatus } from "../../../shared/types/task";
import type {
  SandboxSupervisionAlertView,
  SandboxSupervisionBlockedRecordView,
  SandboxSupervisionDecisionView,
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionEventView,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail,
  SandboxSupervisionSessionSummary,
  SandboxSupervisionToolName
} from "../../../shared/types/supervision";

const SCENARIO_IDS = ["T1-SC-001", "T1-SC-002", "T1-SC-003"] as const;

function buildSummary(input: {
  task_id: string;
  session_id: string;
  scenario_id: string;
  case_id: string;
  action: SandboxPolicyAction;
  status: TaskStatus;
  risk: RiskLevel;
  tool: SandboxSupervisionToolName;
  eventCount: number;
  decisionCount: number;
  alertCount: number;
  blockedCount: number;
  blocked: boolean;
  updatedAt: string;
  lastEventAt: string;
}): SandboxSupervisionSessionSummary {
  return {
    task_id: input.task_id,
    session_id: input.session_id,
    task_status: input.status,
    risk_level: input.risk,
    highest_action: input.action,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    tool_names: [input.tool],
    event_count: input.eventCount,
    decision_count: input.decisionCount,
    alert_count: input.alertCount,
    blocked_record_count: input.blockedCount,
    blocked: input.blocked,
    evidence_available: true,
    updated_at: input.updatedAt,
    last_event_at: input.lastEventAt
  };
}

const MOCK_SESSIONS: SandboxSupervisionSessionSummary[] = [
  buildSummary({
    task_id: "task:T1-SC-001-C001",
    session_id: "session:T1-SC-001-C001",
    scenario_id: SCENARIO_IDS[0],
    case_id: "T1-SC-001-C001",
    action: "deny",
    status: "blocked",
    risk: "high",
    tool: "send_email",
    eventCount: 7,
    decisionCount: 1,
    alertCount: 1,
    blockedCount: 1,
    blocked: true,
    updatedAt: "2026-06-29T00:00:07Z",
    lastEventAt: "2026-06-29T00:00:07Z"
  }),
  buildSummary({
    task_id: "task:T1-SC-002-C001",
    session_id: "session:T1-SC-002-C001",
    scenario_id: SCENARIO_IDS[1],
    case_id: "T1-SC-002-C001",
    action: "alert",
    status: "finished",
    risk: "medium",
    tool: "read_file",
    eventCount: 6,
    decisionCount: 1,
    alertCount: 1,
    blockedCount: 0,
    blocked: false,
    updatedAt: "2026-06-29T00:00:06Z",
    lastEventAt: "2026-06-29T00:00:06Z"
  }),
  buildSummary({
    task_id: "task:T1-SC-001-C002",
    session_id: "session:T1-SC-001-C002",
    scenario_id: SCENARIO_IDS[0],
    case_id: "T1-SC-001-C002",
    action: "allow",
    status: "finished",
    risk: "info",
    tool: "call_api",
    eventCount: 5,
    decisionCount: 1,
    alertCount: 0,
    blockedCount: 0,
    blocked: false,
    updatedAt: "2026-06-29T00:00:05Z",
    lastEventAt: "2026-06-29T00:00:05Z"
  }),
  buildSummary({
    task_id: "task:T1-SC-003-C001",
    session_id: "session:T1-SC-003-C001",
    scenario_id: SCENARIO_IDS[2],
    case_id: "T1-SC-003-C001",
    action: "ask",
    status: "running",
    risk: "low",
    tool: "write_file",
    eventCount: 4,
    decisionCount: 1,
    alertCount: 0,
    blockedCount: 0,
    blocked: false,
    updatedAt: "2026-06-29T00:00:04Z",
    lastEventAt: "2026-06-29T00:00:04Z"
  })
];

export function makeSupervisionOverview(): SandboxSupervisionOverview {
  const sessions = MOCK_SESSIONS.map((summary) => ({ ...summary, tool_names: [...summary.tool_names] }));
  const counts = {
    observed_session_count: sessions.length,
    running_session_count: sessions.filter((s) => s.task_status === "running").length,
    awaiting_confirmation_count: sessions.filter((s) => s.highest_action === "ask").length,
    alert_record_count: sessions.reduce((total, s) => total + s.alert_count, 0),
    blocked_session_count: sessions.filter((s) => s.blocked).length
  };

  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    counts,
    matched_session_count: sessions.length,
    returned_session_count: sessions.length,
    limit: 100,
    truncated: false,
    sessions
  };
}

const PRIMARY_SESSION_ID = "session:T1-SC-001-C001";
const PRIMARY_SCENARIO_ID = SCENARIO_IDS[0];
const PRIMARY_CASE_ID = "T1-SC-001-C001";

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

const BASE_BLOCKED: SandboxSupervisionBlockedRecordView = {
  blocked_record_id: "blocked:001",
  subject_event_id: "event:tool_request",
  decision_id: "decision:001",
  evidence_refs: ["evidence://blocked/001"],
  occurred_at: "2026-06-29T00:00:09Z"
};

function makeEventView(eventType: SandboxSupervisionEventView["event_type"]): SandboxSupervisionEventView {
  const common = {
    session_id: PRIMARY_SESSION_ID,
    scenario_id: PRIMARY_SCENARIO_ID,
    case_id: PRIMARY_CASE_ID
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

export function makeSupervisionDetail(): SandboxSupervisionSessionDetail {
  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    summary: { ...MOCK_SESSIONS[0], tool_names: [...MOCK_SESSIONS[0].tool_names] },
    events: EVENT_TYPE_ORDER.map((type) => makeEventView(type)),
    policy_decisions: [{ ...BASE_DECISION, evidence_refs: [...BASE_DECISION.evidence_refs] }],
    alerts: [{ ...BASE_ALERT, evidence_refs: [...BASE_ALERT.evidence_refs] }],
    blocked_records: [{ ...BASE_BLOCKED, evidence_refs: [...BASE_BLOCKED.evidence_refs] }]
  };
}

export function makeSupervisionEvidence(): SandboxSupervisionEvidenceExport {
  return {
    schema_version: SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
    source_schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    session: makeSupervisionDetail()
  };
}

export function findMockSession(sessionId: string): SandboxSupervisionSessionDetail | null {
  if (sessionId === PRIMARY_SESSION_ID) {
    return makeSupervisionDetail();
  }
  const summary = MOCK_SESSIONS.find((s) => s.session_id === sessionId);
  if (!summary) {
    return null;
  }
  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    summary: { ...summary, tool_names: [...summary.tool_names] },
    events: [],
    policy_decisions: [],
    alerts: [],
    blocked_records: []
  };
}

export function findMockEvidence(sessionId: string): SandboxSupervisionEvidenceExport | null {
  if (sessionId !== PRIMARY_SESSION_ID) {
    return null;
  }
  return makeSupervisionEvidence();
}
