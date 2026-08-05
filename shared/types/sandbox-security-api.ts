import type {
  SandboxDetectorRunStatus,
  SandboxSecurityAction,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity,
  SandboxSecurityStage,
  SandboxSecurityVerdict
} from "./sandbox-security.ts";

export type SandboxSecurityCapabilityScope =
  | "sandbox_security:evaluate"
  | "sandbox_security:audit:read";

export type SandboxSecurityAuditEventType =
  | "evaluation_completed"
  | "evaluation_replayed"
  | "evaluation_interrupted"
  | "request_rejected"
  | "capability_issued"
  | "capability_revoked"
  | "audit_read"
  | "audit_purged";

export type SandboxSecurityAuditCategoryCounts = Readonly<
  Record<SandboxSecurityRiskCategory, number>
>;

export type SandboxSecurityAuditRunStatusCounts = Readonly<
  Record<SandboxDetectorRunStatus, number>
>;

export interface SandboxSecurityAuditEventBase {
  schema_version: "sandbox-security-audit-event.v1";
  event_id: string;
  event_type: SandboxSecurityAuditEventType;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string | null;
  capability_id: string | null;
}

export interface SandboxSecurityEvaluationAuditFields {
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  elapsed_ms: number;
}

export type SandboxSecurityAuditEvent =
  | (SandboxSecurityAuditEventBase &
      SandboxSecurityEvaluationAuditFields & {
        event_type: "evaluation_completed" | "evaluation_replayed";
        authorization_scope_id: string;
        capability_id: string;
        verdict: SandboxSecurityVerdict;
        action: SandboxSecurityAction;
        risk_level: "info" | SandboxSecuritySeverity;
        category_counts: SandboxSecurityAuditCategoryCounts;
        detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
      })
  | (SandboxSecurityAuditEventBase &
      SandboxSecurityEvaluationAuditFields & {
        event_type: "evaluation_interrupted";
        authorization_scope_id: string;
        capability_id: string;
        interruption_code:
          | "engine_error"
          | "persistence_error"
          | "startup_recovery";
      })
  | (SandboxSecurityAuditEventBase & {
      event_type: "request_rejected";
      authorization_scope_id: string;
      capability_id: string;
      route_id: "evaluation" | "audit_read";
      request_id: string | null;
      stage: SandboxSecurityStage | null;
      policy_profile_id: SandboxSecurityPolicyProfileId | null;
      composition_binding: string;
      elapsed_ms: number;
      rejection_code:
        | "capability_expired"
        | "capability_revoked"
        | "scope_forbidden"
        | "stage_forbidden"
        | "profile_forbidden"
        | "capability_rate_limited"
        | "idempotency_conflict"
        | "idempotency_in_progress"
        | "concurrency_limited"
        | "storage_unavailable"
        | "invalid_request"
        | "body_too_large"
        | "body_timeout"
        | "unsupported_media_type";
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "capability_issued";
      authorization_scope_id: string;
      capability_id: string;
      scopes: SandboxSecurityCapabilityScope[];
      allowed_stages: SandboxSecurityStage[];
      allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
      issued_at: string;
      expires_at: string;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "capability_revoked";
      authorization_scope_id: string;
      capability_id: string;
      revoked_at: string;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "audit_read";
      authorization_scope_id: string;
      capability_id: string;
      returned_count: number;
      next_cursor_present: boolean;
      elapsed_ms: number;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "audit_purged";
      subject_id: "system:bootstrap-admin";
      authorization_scope_id: null;
      capability_id: null;
      retention_days: 90;
      deleted_count: number;
      has_more: boolean;
      elapsed_ms: number;
    });

export interface SandboxSecurityAuditPage {
  schema_version: "sandbox-security-audit-page.v1";
  events: SandboxSecurityAuditEvent[];
  next_cursor: string | null;
}
