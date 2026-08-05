import {
  SANDBOX_SECURITY_RISK_CATEGORIES,
  type SandboxDetectorRunStatus,
  type SandboxSecurityRiskCategory
} from "../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityAuditEvent } from "../../../../shared/types/sandbox-security-api.ts";
import { normalizeSandboxSecurityAuditEvent } from "../../../../shared/contracts/sandbox-security-api.ts";
import { normalizeSandboxSecurityDecision } from "../../../../shared/contracts/sandbox-security.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityEvaluationAuditInput
} from "./sandbox-security.types.ts";

const RUN_STATUS_CATALOG = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const satisfies readonly SandboxDetectorRunStatus[];

function normalizeElapsedMs(value: unknown): number {
  if (typeof value !== "number") {
    throw new TypeError("sandbox security audit elapsed_ms must be a number");
  }
  if (Number.isNaN(value) || value === Number.NEGATIVE_INFINITY) return 0;
  if (value === Number.POSITIVE_INFINITY) return 60000;
  return Math.max(0, Math.min(60000, Math.floor(value)));
}

function normalizeProjectedEvent(value: unknown): SandboxSecurityAuditEvent {
  const normalized = normalizeSandboxSecurityAuditEvent(value);
  if (normalized === null) {
    throw new TypeError("sandbox security audit projection is invalid");
  }
  return normalized;
}

function projectDecision(
  input: Readonly<SandboxSecurityEvaluationAuditInput>,
  eventType: "evaluation_completed" | "evaluation_replayed"
): SandboxSecurityAuditEvent {
  const decision = normalizeSandboxSecurityDecision(input.decision);
  if (decision === null) {
    throw new TypeError("sandbox security decision is invalid");
  }

  const categoryCounts = {} as Record<SandboxSecurityRiskCategory, number>;
  for (const category of SANDBOX_SECURITY_RISK_CATEGORIES) {
    categoryCounts[category] = 0;
  }
  for (const finding of decision.findings) {
    categoryCounts[finding.category] += 1;
  }

  const detectorRunStatusCounts = {} as Record<
    SandboxDetectorRunStatus,
    number
  >;
  for (const status of RUN_STATUS_CATALOG) {
    detectorRunStatusCounts[status] = 0;
  }
  for (const run of decision.detector_runs) {
    detectorRunStatusCounts[run.status] += 1;
  }

  return normalizeProjectedEvent({
    schema_version: "sandbox-security-audit-event.v1",
    event_id: input.event_id,
    event_type: eventType,
    occurred_at: input.occurred_at,
    subject_id: input.subject_id,
    authorization_scope_id: input.authorization_scope_id,
    capability_id: input.capability_id,
    request_id: decision.request_id,
    stage: decision.stage,
    policy_profile_id: decision.policy_profile_id,
    composition_binding: input.composition_binding,
    elapsed_ms: normalizeElapsedMs(input.elapsed_ms),
    verdict: decision.verdict,
    action: decision.action,
    risk_level: decision.risk_level,
    category_counts: categoryCounts,
    detector_run_status_counts: detectorRunStatusCounts
  });
}

export function createSandboxSecurityAuditProjector(): SandboxSecurityAuditProjector {
  return {
    evaluationCompleted(input) {
      return projectDecision(input, "evaluation_completed");
    },

    evaluationReplayed(input) {
      return projectDecision(input, "evaluation_replayed");
    },

    evaluationInterrupted(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "evaluation_interrupted",
        occurred_at: input.occurred_at,
        subject_id: input.subject_id,
        authorization_scope_id: input.authorization_scope_id,
        capability_id: input.capability_id,
        request_id: input.request_id,
        stage: input.stage,
        policy_profile_id: input.policy_profile_id,
        composition_binding: input.composition_binding,
        elapsed_ms: normalizeElapsedMs(input.elapsed_ms),
        interruption_code: input.interruption_code
      });
    },

    requestRejected(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "request_rejected",
        occurred_at: input.occurred_at,
        subject_id: input.subject_id,
        authorization_scope_id: input.authorization_scope_id,
        capability_id: input.capability_id,
        route_id: input.route_id,
        request_id: input.request_id,
        stage: input.stage,
        policy_profile_id: input.policy_profile_id,
        composition_binding: input.composition_binding,
        elapsed_ms: normalizeElapsedMs(input.elapsed_ms),
        rejection_code: input.rejection_code
      });
    },

    capabilityIssued(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "capability_issued",
        occurred_at: input.occurred_at,
        subject_id: input.subject_id,
        authorization_scope_id: input.authorization_scope_id,
        capability_id: input.capability_id,
        scopes: [...input.scopes],
        allowed_stages: [...input.allowed_stages],
        allowed_policy_profile_ids: [
          ...input.allowed_policy_profile_ids
        ],
        issued_at: input.issued_at,
        expires_at: input.expires_at
      });
    },

    capabilityRevoked(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "capability_revoked",
        occurred_at: input.occurred_at,
        subject_id: input.subject_id,
        authorization_scope_id: input.authorization_scope_id,
        capability_id: input.capability_id,
        revoked_at: input.revoked_at
      });
    },

    auditRead(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "audit_read",
        occurred_at: input.occurred_at,
        subject_id: input.subject_id,
        authorization_scope_id: input.authorization_scope_id,
        capability_id: input.capability_id,
        returned_count: input.returned_count,
        next_cursor_present: input.next_cursor_present,
        elapsed_ms: normalizeElapsedMs(input.elapsed_ms)
      });
    },

    auditPurged(input) {
      return normalizeProjectedEvent({
        schema_version: "sandbox-security-audit-event.v1",
        event_id: input.event_id,
        event_type: "audit_purged",
        occurred_at: input.occurred_at,
        subject_id: "system:bootstrap-admin",
        authorization_scope_id: null,
        capability_id: null,
        retention_days: 90,
        deleted_count: input.deleted_count,
        has_more: input.has_more,
        elapsed_ms: normalizeElapsedMs(input.elapsed_ms)
      });
    }
  };
}
