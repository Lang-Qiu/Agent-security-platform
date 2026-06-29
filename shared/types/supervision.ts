import type { SandboxPolicyAction } from "./sandbox.ts";
import type { RiskLevel, TaskStatus } from "./task.ts";

export const SANDBOX_SUPERVISION_SCHEMA_VERSION = "track1-supervision-ui.v1" as const;

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
