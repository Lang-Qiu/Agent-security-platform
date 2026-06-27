import type { RiskLevel } from "./task.ts";

export const SANDBOX_EVENT_TYPES = [
  "model_input",
  "model_output",
  "tool_request",
  "tool_result",
  "policy_decision",
  "memory_write",
  "memory_read"
] as const;

export const SANDBOX_EVENT_SOURCES = ["model", "agent", "tool", "policy", "memory", "monitor"] as const;
export const SANDBOX_POLICY_ACTIONS = ["allow", "deny", "ask", "alert"] as const;
export const SANDBOX_TOOL_RESULT_STATUSES = ["success", "rejected", "failed"] as const;

export type SandboxEventType = (typeof SANDBOX_EVENT_TYPES)[number];
export type SandboxEventSource = (typeof SANDBOX_EVENT_SOURCES)[number];
export type SandboxPolicyAction = (typeof SANDBOX_POLICY_ACTIONS)[number];
export type SandboxToolResultStatus = (typeof SANDBOX_TOOL_RESULT_STATUSES)[number];

export interface SandboxPolicyDecision {
  decision_id: string;
  subject_event_id: string;
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  reason: string;
  evidence_refs: string[];
  decided_at: string;
}

export interface SandboxModelContentPayload {
  model_ref: string;
  content_ref: string;
  content_sha256: string;
  summary?: string;
}

export interface SandboxToolRequestPayload {
  call_id: string;
  tool_name: string;
  target_ref: string;
  arguments_ref: string;
}

export interface SandboxToolResultPayload {
  call_id: string;
  tool_name: string;
  status: SandboxToolResultStatus;
  result_ref: string;
  state_change: string;
}

export interface SandboxMemoryPayload {
  memory_entry_id: string;
  content_ref: string;
  content_sha256: string;
  summary?: string;
}

export interface SandboxEventEnvelope<TType extends SandboxEventType, TPayload> {
  event_id: string;
  session_id: string;
  sequence: number;
  event_type: TType;
  occurred_at: string;
  source: SandboxEventSource;
  scenario_id?: string;
  case_id?: string;
  evidence_refs: string[];
  payload: TPayload;
}

export type SandboxBehaviorEvent =
  | SandboxEventEnvelope<"model_input", SandboxModelContentPayload>
  | SandboxEventEnvelope<"model_output", SandboxModelContentPayload>
  | SandboxEventEnvelope<"tool_request", SandboxToolRequestPayload>
  | SandboxEventEnvelope<"tool_result", SandboxToolResultPayload>
  | SandboxEventEnvelope<"policy_decision", SandboxPolicyDecision>
  | SandboxEventEnvelope<"memory_write", SandboxMemoryPayload>
  | SandboxEventEnvelope<"memory_read", SandboxMemoryPayload>;

export interface SandboxAlert {
  alert_id: string;
  subject_event_id: string;
  decision_id: string;
  risk_level: RiskLevel;
  category: string;
  title: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxBlockedRecord {
  blocked_record_id: string;
  subject_event_id: string;
  decision_id: string;
  resource_ref?: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}
