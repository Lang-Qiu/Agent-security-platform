import type {
  SandboxEventSource,
  SandboxEventType,
  SandboxPolicyAction,
  SandboxToolResultStatus
} from "./sandbox.ts";
import type { RiskLevel, TaskStatus } from "./task.ts";

export const SANDBOX_SUPERVISION_SCHEMA_VERSION = "track1-supervision-ui.v1" as const;

export const SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION =
  "track1-supervision-evidence.v1" as const;

export type SandboxSupervisionToolName =
  | "send_email"
  | "read_file"
  | "write_file"
  | "call_api";

export interface SandboxSupervisionSessionSummary {
  task_id: string;
  session_id: string;
  task_status: TaskStatus;
  risk_level: RiskLevel;
  highest_action: SandboxPolicyAction;
  scenario_id: string | null;
  case_id: string | null;
  tool_names: SandboxSupervisionToolName[];
  event_count: number;
  decision_count: number;
  alert_count: number;
  blocked_record_count: number;
  blocked: boolean;
  evidence_available: boolean;
  updated_at: string;
  last_event_at: string | null;
}

export interface SandboxSupervisionCounts {
  observed_session_count: number;
  running_session_count: number;
  awaiting_confirmation_count: number;
  alert_record_count: number;
  blocked_session_count: number;
}

export interface SandboxSupervisionOverview {
  schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  counts: SandboxSupervisionCounts;
  matched_session_count: number;
  returned_session_count: number;
  limit: 100;
  truncated: boolean;
  sessions: SandboxSupervisionSessionSummary[];
}

export interface SandboxSupervisionDecisionView {
  decision_id: string;
  subject_event_id: string;
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  evidence_refs: string[];
  decided_at: string;
}

export interface SandboxSupervisionAlertView {
  alert_id: string;
  subject_event_id: string;
  decision_id: string;
  risk_level: RiskLevel;
  category: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxSupervisionBlockedRecordView {
  blocked_record_id: string;
  subject_event_id: string;
  decision_id: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxSupervisionModelPayload {
  model_ref: string;
  content_ref: string;
  content_sha256: string;
}

export interface SandboxSupervisionToolRequestPayload {
  call_id: string;
  tool_name: SandboxSupervisionToolName;
  target_ref: string;
  arguments_ref: string;
}

export type SandboxSupervisionStateChange =
  | "none"
  | "outbox_append"
  | "virtual_file_write";

export interface SandboxSupervisionToolResultPayload {
  call_id: string;
  tool_name: SandboxSupervisionToolName;
  status: SandboxToolResultStatus;
  result_ref: string;
  state_change: SandboxSupervisionStateChange;
}

export interface SandboxSupervisionMemoryPayload {
  memory_entry_id: string;
  content_ref: string;
  content_sha256: string;
}

export interface SandboxSupervisionEventEnvelope<
  TType extends SandboxEventType,
  TPayload
> {
  event_id: string;
  session_id: string;
  sequence: number;
  event_type: TType;
  occurred_at: string;
  source: SandboxEventSource;
  scenario_id: string | null;
  case_id: string | null;
  evidence_refs: string[];
  payload: TPayload;
}

export type SandboxSupervisionEventView =
  | SandboxSupervisionEventEnvelope<
      "model_input",
      SandboxSupervisionModelPayload
    >
  | SandboxSupervisionEventEnvelope<
      "model_output",
      SandboxSupervisionModelPayload
    >
  | SandboxSupervisionEventEnvelope<
      "tool_request",
      SandboxSupervisionToolRequestPayload
    >
  | SandboxSupervisionEventEnvelope<
      "tool_result",
      SandboxSupervisionToolResultPayload
    >
  | SandboxSupervisionEventEnvelope<
      "policy_decision",
      SandboxSupervisionDecisionView
    >
  | SandboxSupervisionEventEnvelope<
      "memory_write",
      SandboxSupervisionMemoryPayload
    >
  | SandboxSupervisionEventEnvelope<
      "memory_read",
      SandboxSupervisionMemoryPayload
    >;

export interface SandboxSupervisionSessionDetail {
  schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  summary: SandboxSupervisionSessionSummary;
  events: SandboxSupervisionEventView[];
  policy_decisions: SandboxSupervisionDecisionView[];
  alerts: SandboxSupervisionAlertView[];
  blocked_records: SandboxSupervisionBlockedRecordView[];
}

export interface SandboxSupervisionEvidenceExport {
  schema_version: typeof SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION;
  source_schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  session: SandboxSupervisionSessionDetail;
}
