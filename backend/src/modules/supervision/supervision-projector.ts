import type { StoredTaskRecord } from "../task-center/repositories/task.repository.ts";
import {
  SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
  SANDBOX_SUPERVISION_SCHEMA_VERSION,
  normalizeSandboxSupervisionEvidenceExport,
  normalizeSandboxSupervisionSessionDetail
} from "../../../../shared/contracts/supervision.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import { normalizeTask } from "../../../../shared/contracts/task.ts";
import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxPolicyAction,
  SandboxPolicyDecision
} from "../../../../shared/types/sandbox.ts";
import type { SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import type { TaskStatus } from "../../../../shared/types/task.ts";
import type {
  SandboxSupervisionAlertView,
  SandboxSupervisionBlockedRecordView,
  SandboxSupervisionDecisionView,
  SandboxSupervisionEventView,
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionSessionDetail,
  SandboxSupervisionSessionSummary,
  SandboxSupervisionStateChange,
  SandboxSupervisionToolName
} from "../../../../shared/types/supervision.ts";

export interface ProjectedSupervisionRecord {
  summary: SandboxSupervisionSessionSummary;
  detail: SandboxSupervisionSessionDetail;
  evidence: SandboxSupervisionEvidenceExport | null;
}

const ACTION_PRECEDENCE: Record<SandboxPolicyAction, number> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
};

const APPROVED_TOOL_NAMES: readonly SandboxSupervisionToolName[] = [
  "send_email",
  "read_file",
  "write_file",
  "call_api"
];

function projectDecision(
  decision: SandboxPolicyDecision
): SandboxSupervisionDecisionView {
  return {
    decision_id: decision.decision_id,
    subject_event_id: decision.subject_event_id,
    policy_id: decision.policy_id,
    action: decision.action,
    reason_code: decision.reason_code,
    evidence_refs: [...decision.evidence_refs],
    decided_at: decision.decided_at
  };
}

function projectAlert(alert: SandboxAlert): SandboxSupervisionAlertView {
  return {
    alert_id: alert.alert_id,
    subject_event_id: alert.subject_event_id,
    decision_id: alert.decision_id,
    risk_level: alert.risk_level,
    category: alert.category,
    evidence_refs: [...alert.evidence_refs],
    occurred_at: alert.occurred_at
  };
}

function projectBlockedRecord(
  record: SandboxBlockedRecord
): SandboxSupervisionBlockedRecordView {
  return {
    blocked_record_id: record.blocked_record_id,
    subject_event_id: record.subject_event_id,
    decision_id: record.decision_id,
    evidence_refs: [...record.evidence_refs],
    occurred_at: record.occurred_at
  };
}

function projectEvent(
  event: SandboxBehaviorEvent
): SandboxSupervisionEventView {
  const common = {
    event_id: event.event_id,
    session_id: event.session_id,
    sequence: event.sequence,
    occurred_at: event.occurred_at,
    source: event.source,
    scenario_id: event.scenario_id ?? null,
    case_id: event.case_id ?? null,
    evidence_refs: [...event.evidence_refs]
  };

  switch (event.event_type) {
    case "model_input":
      return {
        ...common,
        event_type: "model_input",
        payload: {
          model_ref: event.payload.model_ref,
          content_ref: event.payload.content_ref,
          content_sha256: event.payload.content_sha256
        }
      };
    case "model_output":
      return {
        ...common,
        event_type: "model_output",
        payload: {
          model_ref: event.payload.model_ref,
          content_ref: event.payload.content_ref,
          content_sha256: event.payload.content_sha256
        }
      };
    case "tool_request":
      return {
        ...common,
        event_type: "tool_request",
        payload: {
          call_id: event.payload.call_id,
          tool_name: event.payload.tool_name as SandboxSupervisionToolName,
          target_ref: event.payload.target_ref,
          arguments_ref: event.payload.arguments_ref
        }
      };
    case "tool_result":
      return {
        ...common,
        event_type: "tool_result",
        payload: {
          call_id: event.payload.call_id,
          tool_name: event.payload.tool_name as SandboxSupervisionToolName,
          status: event.payload.status,
          result_ref: event.payload.result_ref,
          state_change: event.payload.state_change as SandboxSupervisionStateChange
        }
      };
    case "policy_decision":
      return {
        ...common,
        event_type: "policy_decision",
        payload: projectDecision(event.payload)
      };
    case "memory_write":
      return {
        ...common,
        event_type: "memory_write",
        payload: {
          memory_entry_id: event.payload.memory_entry_id,
          content_ref: event.payload.content_ref,
          content_sha256: event.payload.content_sha256
        }
      };
    case "memory_read":
      return {
        ...common,
        event_type: "memory_read",
        payload: {
          memory_entry_id: event.payload.memory_entry_id,
          content_ref: event.payload.content_ref,
          content_sha256: event.payload.content_sha256
        }
      };
  }
}

function deriveHighestAction(
  decisions: SandboxPolicyDecision[]
): SandboxPolicyAction {
  if (decisions.length === 0) return "allow";
  let highest: SandboxPolicyAction = "allow";
  for (const decision of decisions) {
    if (ACTION_PRECEDENCE[decision.action] > ACTION_PRECEDENCE[highest]) {
      highest = decision.action;
    }
  }
  return highest;
}

function deriveToolNames(
  events: SandboxBehaviorEvent[]
): SandboxSupervisionToolName[] {
  const toolNames = new Set<string>();
  for (const event of events) {
    if (
      event.event_type === "tool_request" ||
      event.event_type === "tool_result"
    ) {
      const toolName = event.payload.tool_name;
      if (
        APPROVED_TOOL_NAMES.includes(toolName as SandboxSupervisionToolName)
      ) {
        toolNames.add(toolName);
      }
    }
  }
  return Array.from(toolNames).sort() as SandboxSupervisionToolName[];
}

function deriveLastEventAt(
  events: SandboxBehaviorEvent[]
): string | null {
  if (events.length === 0) return null;
  return events.reduce((max, event) =>
    event.occurred_at > max ? event.occurred_at : max
  , events[0].occurred_at);
}

function isTerminalStatus(status: TaskStatus): boolean {
  return status === "finished" || status === "blocked";
}

function sortByTimestampThenId<T extends { occurred_at: string }>(
  items: T[],
  getId: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) {
      return a.occurred_at < b.occurred_at ? -1 : 1;
    }
    return getId(a) < getId(b) ? -1 : 1;
  });
}

function sortByDecidedAtThenId(
  items: SandboxSupervisionDecisionView[]
): SandboxSupervisionDecisionView[] {
  return [...items].sort((a, b) => {
    if (a.decided_at !== b.decided_at) {
      return a.decided_at < b.decided_at ? -1 : 1;
    }
    return a.decision_id < b.decision_id ? -1 : 1;
  });
}

export function projectSupervisionRecord(
  record: StoredTaskRecord
): ProjectedSupervisionRecord | null {
  const task = normalizeTask(record.task);
  const result = normalizeBaseResult(record.result);
  if (!task || !result) return null;

  if (task.task_type !== "sandbox_run") return null;
  if (task.engine_type !== "sandbox") return null;
  if (task.task_id !== result.task_id) return null;
  if (task.task_type !== result.task_type) return null;
  if (task.engine_type !== result.engine_type) return null;
  if (task.status !== result.status) return null;

  const details = result.details as SandboxRunResultDetails;
  if (!details.session_id || details.session_id.length === 0) return null;

  const events = details.events ?? [];
  const decisions = details.policy_decisions ?? [];
  const alerts = details.alerts ?? [];
  const blockedRecords = details.blocked_records ?? [];

  if (events.length === 0) return null;

  const firstEvent = events[0];
  const scenarioId = firstEvent.scenario_id ?? null;
  const caseId = firstEvent.case_id ?? null;

  for (const event of events) {
    const eventScenario = event.scenario_id ?? null;
    const eventCase = event.case_id ?? null;
    if (eventScenario !== scenarioId || eventCase !== caseId) return null;
  }

  const safeEvents = events.map(projectEvent);
  const safeDecisions = sortByDecidedAtThenId(decisions.map(projectDecision));
  const safeAlerts = sortByTimestampThenId(
    alerts.map(projectAlert),
    (a) => a.alert_id
  );
  const safeBlockedRecords = sortByTimestampThenId(
    blockedRecords.map(projectBlockedRecord),
    (b) => b.blocked_record_id
  );

  const highestAction = deriveHighestAction(decisions);
  const toolNames = deriveToolNames(events);
  const lastEventAt = deriveLastEventAt(events);
  const blocked = details.blocked === true;
  const evidenceAvailable = isTerminalStatus(task.status);

  const summary: SandboxSupervisionSessionSummary = {
    task_id: task.task_id,
    session_id: details.session_id,
    task_status: task.status,
    risk_level: result.risk_level,
    highest_action: highestAction,
    scenario_id: scenarioId,
    case_id: caseId,
    tool_names: toolNames,
    event_count: events.length,
    decision_count: decisions.length,
    alert_count: alerts.length,
    blocked_record_count: blockedRecords.length,
    blocked,
    evidence_available: evidenceAvailable,
    updated_at: task.updated_at,
    last_event_at: lastEventAt
  };

  const detail: SandboxSupervisionSessionDetail = {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    summary,
    events: safeEvents,
    policy_decisions: safeDecisions,
    alerts: safeAlerts,
    blocked_records: safeBlockedRecords
  };

  const normalizedDetail = normalizeSandboxSupervisionSessionDetail(detail);
  if (!normalizedDetail) return null;

  const normalizedSummary = normalizedDetail.summary;

  let evidence: SandboxSupervisionEvidenceExport | null = null;
  if (evidenceAvailable) {
    const evidenceExport: SandboxSupervisionEvidenceExport = {
      schema_version: SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION,
      source_schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
      session: normalizedDetail
    };
    evidence = normalizeSandboxSupervisionEvidenceExport(evidenceExport);
  }

  return {
    summary: normalizedSummary,
    detail: normalizedDetail,
    evidence
  };
}
