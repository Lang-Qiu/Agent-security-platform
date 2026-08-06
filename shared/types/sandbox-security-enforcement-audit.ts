import type {
  SandboxSecurityAuditCategoryCounts,
  SandboxSecurityAuditRunStatusCounts
} from "./sandbox-security-api.ts";
import type {
  SandboxSecurityAction,
  SandboxSecurityPolicyProfileId,
  SandboxSecuritySeverity,
  SandboxSecurityStage,
  SandboxSecurityVerdict
} from "./sandbox-security.ts";

export type SandboxSecurityEnforcementAuditCapabilityScope =
  "sandbox_security:enforcement:audit:write";

export type SandboxSecurityEnforcementPoint =
  | "before_agent_run"
  | "before_model_output_delivery"
  | "before_tool_execution"
  | "before_message_delivery";

export type SandboxSecurityEnforcementInterruptionCode =
  | "authority_mismatch"
  | "correlation_mismatch"
  | "unsupported_input"
  | "engine_error"
  | "engine_timeout"
  | "engine_slot_unavailable"
  | "barrier_timeout"
  | "startup_recovery";

export type SandboxSecurityProductionCompositionBinding =
  | "sandbox-security-production-composition.v1:rule_only"
  | "sandbox-security-production-composition.v1:local"
  | "sandbox-security-production-composition.v1:local_and_judge";

export interface SandboxSecurityEnforcementAuditRequestCommon {
  schema_version: "sandbox-security-enforcement-audit-request.v1";
  event_id: string;
  request_id: string;
  enforcement_point: SandboxSecurityEnforcementPoint;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: SandboxSecurityProductionCompositionBinding;
  elapsed_ms: number;
}

export type SandboxSecurityEnforcementAuditRequest =
  | (SandboxSecurityEnforcementAuditRequestCommon & {
      event_type: "enforcement_completed";
      verdict: SandboxSecurityVerdict;
      action: SandboxSecurityAction;
      risk_level: "info" | SandboxSecuritySeverity;
      category_counts: SandboxSecurityAuditCategoryCounts;
      detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
      host_outcome: "continued" | "replaced";
    })
  | (SandboxSecurityEnforcementAuditRequestCommon & {
      event_type: "enforcement_interrupted";
      interruption_code: SandboxSecurityEnforcementInterruptionCode;
      applied_fail_closed_action: "ask" | "deny";
    });

export type OpenClawEnforcementAuditRequest =
  SandboxSecurityEnforcementAuditRequest;

export interface SandboxSecurityEnforcementAuditEventCommon {
  schema_version: "sandbox-security-enforcement-audit-event.v1";
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
}

export interface SandboxSecurityEnforcementCompletedEvent
  extends SandboxSecurityEnforcementAuditEventCommon {
  event_type: "enforcement_completed";
  request_id: string;
  enforcement_point: SandboxSecurityEnforcementPoint;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: SandboxSecurityProductionCompositionBinding;
  elapsed_ms: number;
  verdict: SandboxSecurityVerdict;
  action: SandboxSecurityAction;
  risk_level: "info" | SandboxSecuritySeverity;
  category_counts: SandboxSecurityAuditCategoryCounts;
  detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
  host_outcome: "continued" | "replaced";
}

export interface SandboxSecurityEnforcementInterruptedEvent
  extends SandboxSecurityEnforcementAuditEventCommon {
  event_type: "enforcement_interrupted";
  request_id: string;
  enforcement_point: SandboxSecurityEnforcementPoint;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: SandboxSecurityProductionCompositionBinding;
  elapsed_ms: number;
  interruption_code: SandboxSecurityEnforcementInterruptionCode;
  applied_fail_closed_action: "ask" | "deny";
}

export interface SandboxSecurityEnforcementAuditCapabilityIssuedEvent
  extends SandboxSecurityEnforcementAuditEventCommon {
  event_type: "capability_issued";
  scopes: [SandboxSecurityEnforcementAuditCapabilityScope];
  allowed_stages: ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  issued_at: string;
  expires_at: string;
}

export type SandboxSecurityEnforcementAuditEvent =
  | SandboxSecurityEnforcementCompletedEvent
  | SandboxSecurityEnforcementInterruptedEvent
  | SandboxSecurityEnforcementAuditCapabilityIssuedEvent;

export type SandboxSecurityEnforcementAuditEventCandidate =
  | Omit<SandboxSecurityEnforcementCompletedEvent, "occurred_at">
  | Omit<SandboxSecurityEnforcementInterruptedEvent, "occurred_at">
  | Omit<SandboxSecurityEnforcementAuditCapabilityIssuedEvent, "occurred_at">;

export interface OpenClawEnforcementAuditAck {
  schema_version: "sandbox-security-enforcement-audit-ack.v1";
  event_id: string;
  status: "accepted" | "replayed";
  occurred_at: string;
}

export type SandboxSecurityEnforcementAuditEventType =
  | "enforcement_completed"
  | "enforcement_interrupted"
  | "capability_issued";
