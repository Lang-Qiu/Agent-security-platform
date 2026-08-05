import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_STAGES
} from "../../shared/types/sandbox-security.ts";
import type {
  SandboxDetectorRun,
  SandboxSecurityDecision,
  SandboxSecurityRiskCategory
} from "../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityAuditCategoryCounts,
  SandboxSecurityAuditRunStatusCounts
} from "../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditRejectionCode
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const FIXED_AUDIT_ID = "audit:00000000-0000-4000-8000-000000000000";
const FIXED_CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000000";
const FIXED_SCOPE =
  "authscope:hmac-sha256:0000000000000000000000000000000000000000000000000000000000000000";
const COMPOSITION = "sandbox-security-production-composition.v1:rule_only";
const FINDING_ONE =
  "finding:sha256:0000000000000000000000000000000000000000000000000000000000000001";
const FINDING_TWO =
  "finding:sha256:0000000000000000000000000000000000000000000000000000000000000002";

const RUN_STATUS_CATALOG = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;

const EVALUATION_REJECTION_CODES: readonly SandboxSecurityAuditRejectionCode[] = [
  "capability_expired",
  "capability_revoked",
  "scope_forbidden",
  "stage_forbidden",
  "profile_forbidden",
  "capability_rate_limited",
  "idempotency_conflict",
  "idempotency_in_progress",
  "concurrency_limited",
  "storage_unavailable",
  "invalid_request",
  "body_too_large",
  "body_timeout",
  "unsupported_media_type"
];

const AUDIT_READ_REJECTION_CODES: readonly SandboxSecurityAuditRejectionCode[] = [
  "capability_expired",
  "capability_revoked",
  "scope_forbidden",
  "capability_rate_limited",
  "invalid_request"
];

type RejectedAuditEvent = Extract<
  SandboxSecurityAuditEvent,
  { event_type: "request_rejected" }
>;
type IssuedAuditEvent = Extract<
  SandboxSecurityAuditEvent,
  { event_type: "capability_issued" }
>;
type ReadAuditEvent = Extract<SandboxSecurityAuditEvent, { event_type: "audit_read" }>;
type CompletedAuditEvent = Extract<
  SandboxSecurityAuditEvent,
  { event_type: "evaluation_completed" | "evaluation_replayed" }
>;

function getProjector(): SandboxSecurityAuditProjector {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityAuditProjector;
  assert.equal(typeof factory, "function");
  return (factory as () => SandboxSecurityAuditProjector)();
}

function makeCounts<T extends readonly string[]>(catalog: T): Record<T[number], number> {
  return Object.fromEntries(catalog.map((key) => [key, 0])) as Record<
    T[number],
    number
  >;
}

function makeRun(
  status: (typeof RUN_STATUS_CATALOG)[number],
  index: number
): SandboxDetectorRun {
  const base = {
    detector_id: `detector://sandbox/${status}-${index}`,
    detector_version: "1.0.0",
    detector_kind: "rule" as const,
    obligation: "profile_required" as const,
    elapsed_ms: index
  };
  if (status === "matched" || status === "no_match") {
    return {
      ...base,
      status,
      finding_ids: status === "matched" ? [FINDING_ONE] : []
    };
  }
  if (status === "skipped") {
    return { ...base, status, skip_reason: "optional_not_selected" };
  }
  const errorCode = {
    failed: "detector_failed",
    timeout: "detector_timeout",
    invalid_result: "detector_result_invalid"
  } as const;
  return { ...base, status, error_code: errorCode[status] };
}

function makeDecision(
  input: Readonly<{
    findings?: SandboxSecurityDecision["findings"];
    detector_runs?: SandboxSecurityDecision["detector_runs"];
    request_id?: string;
  }> = {}
): SandboxSecurityDecision {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:00000000-0000-4000-8000-000000000000",
    request_id: input.request_id ?? "request_001",
    evaluation_mode: "enforcement",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-strict.v1",
    verdict: "risk_detected",
    action: "alert",
    risk_level: "high",
    findings:
      input.findings ?? [
        {
          finding_id: FINDING_ONE,
          detector_id: "detector://sandbox/rule-one",
          detector_version: "1.0.0",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: "source://sandbox/security/source/0001",
              locator: { kind: "whole_source" }
            }
          ],
          evidence_refs: ["evidence://sandbox/security/source/0001"]
        },
        {
          finding_id: FINDING_TWO,
          detector_id: "detector://sandbox/rule-two",
          detector_version: "1.0.0",
          category: "jailbreak",
          severity: "medium",
          confidence: 0.7,
          reason_code: "sandbox_security_jailbreak",
          subject_refs: [
            {
              kind: "tool_request",
              call_token: "call://sandbox/security/call/0001",
              component: "whole_call"
            }
          ],
          evidence_refs: ["evidence://sandbox/security/call/0001"]
        }
      ],
    detector_runs:
      input.detector_runs ?? RUN_STATUS_CATALOG.map((status, index) => makeRun(status, index)),
    evidence_refs: [
      "evidence://sandbox/security/source/0001",
      "evidence://sandbox/security/call/0001"
    ],
    created_at: FIXED_NOW
  };
}

function expectedCounts(decision: SandboxSecurityDecision): {
  category_counts: SandboxSecurityAuditCategoryCounts;
  detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
} {
  const categoryCounts = makeCounts(SANDBOX_SECURITY_RISK_CATEGORIES);
  for (const finding of decision.findings) {
    categoryCounts[finding.category] += 1;
  }
  const statusCounts = makeCounts(RUN_STATUS_CATALOG);
  for (const run of decision.detector_runs) {
    statusCounts[run.status] += 1;
  }
  return {
    category_counts: categoryCounts as SandboxSecurityAuditCategoryCounts,
    detector_run_status_counts: statusCounts as SandboxSecurityAuditRunStatusCounts
  };
}

function assertNoContent(event: SandboxSecurityAuditEvent): void {
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(
    serialized,
    /RAW_SENTINEL|source_token|call_token|evidence_ref|provenance_ref|provider_payload|idempotency_key|request_fingerprint|detector_id|finding_id/
  );
}

test("REQ-SBX-GENERAL-003 projects completed decisions with exact content-free counts", () => {
  const projector = getProjector();
  const decision = makeDecision();
  const event = projector.evaluationCompleted({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-a",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    composition_binding: COMPOSITION,
    elapsed_ms: 17.9,
    decision
  });

  assert.deepEqual(Object.keys(event), [
    "schema_version",
    "event_id",
    "event_type",
    "occurred_at",
    "subject_id",
    "authorization_scope_id",
    "capability_id",
    "request_id",
    "stage",
    "policy_profile_id",
    "composition_binding",
    "elapsed_ms",
    "verdict",
    "action",
    "risk_level",
    "category_counts",
    "detector_run_status_counts"
  ]);
  assert.equal(event.event_type, "evaluation_completed");
  assert.equal(event.request_id, decision.request_id);
  assert.deepEqual(event.category_counts, expectedCounts(decision).category_counts);
  assert.deepEqual(
    event.detector_run_status_counts,
    expectedCounts(decision).detector_run_status_counts
  );
  assert.equal(event.elapsed_ms, 17);
  assert.deepEqual(Object.keys(event.category_counts), SANDBOX_SECURITY_RISK_CATEGORIES);
  assert.deepEqual(Object.keys(event.detector_run_status_counts), RUN_STATUS_CATALOG);
  assertNoContent(event);
});

test("REQ-SBX-GENERAL-003 recomputes replay counts and preserves zero-count catalogs", () => {
  const projector = getProjector();
  const decision = makeDecision({ findings: [], detector_runs: [], request_id: "request_replay" });
  const event = projector.evaluationReplayed({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-a",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    composition_binding: COMPOSITION,
    elapsed_ms: 60000.75,
    decision
  });

  assert.equal(event.event_type, "evaluation_replayed");
  assert.equal(event.elapsed_ms, 60000);
  assert.deepEqual(event.category_counts, makeCounts(SANDBOX_SECURITY_RISK_CATEGORIES));
  assert.deepEqual(event.detector_run_status_counts, makeCounts(RUN_STATUS_CATALOG));
  assertNoContent(event);
});

test("REQ-SBX-GENERAL-003 projects every interruption code with floored and clamped elapsed time", () => {
  const projector = getProjector();
  const codes = ["engine_error", "persistence_error", "startup_recovery"] as const;
  for (const [index, interruption_code] of codes.entries()) {
    const event = projector.evaluationInterrupted({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-a",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      request_id: `request_interrupt_${index}`,
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      composition_binding: COMPOSITION,
      elapsed_ms: index === 0 ? -5.9 : index === 1 ? 60001.2 : 23.8,
      interruption_code
    });
    assert.equal(event.event_type, "evaluation_interrupted");
    assert.equal(event.interruption_code, interruption_code);
    assert.equal(event.elapsed_ms, index === 0 ? 0 : index === 1 ? 60000 : 23);
    assertNoContent(event);
  }
});

test("REQ-SBX-GENERAL-003 applies evaluation and audit-read rejection matrices", () => {
  const projector = getProjector();
  for (const rejection_code of EVALUATION_REJECTION_CODES) {
    const event = projector.requestRejected({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-a",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      route_id: "evaluation",
      request_id: null,
      stage: null,
      policy_profile_id: null,
      composition_binding: COMPOSITION,
      elapsed_ms: 8.6,
      rejection_code
    });
    assert.equal(event.event_type, "request_rejected");
    assert.equal(event.rejection_code, rejection_code);
    assert.equal(event.elapsed_ms, 8);
    assertNoContent(event);
  }
  for (const rejection_code of AUDIT_READ_REJECTION_CODES) {
    const event = projector.requestRejected({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-a",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      route_id: "audit_read",
      request_id: null,
      stage: null,
      policy_profile_id: null,
      composition_binding: COMPOSITION,
      elapsed_ms: 0,
      rejection_code
    });
    const rejected = event as RejectedAuditEvent;
    assert.equal(rejected.route_id, "audit_read");
    assert.equal(rejected.request_id, null);
  }
  assert.throws(() =>
    projector.requestRejected({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-a",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      route_id: "audit_read",
      request_id: null,
      stage: null,
      policy_profile_id: null,
      composition_binding: COMPOSITION,
      elapsed_ms: 0,
      rejection_code: "stage_forbidden"
    })
  );
  assert.throws(() =>
    projector.requestRejected({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-a",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      route_id: "audit_read",
      request_id: "request_should_not_be_present",
      stage: "user_input",
      policy_profile_id: "sandbox-security-strict.v1",
      composition_binding: COMPOSITION,
      elapsed_ms: 0,
      rejection_code: "invalid_request"
    })
  );
});

test("REQ-SBX-GENERAL-003 projects capability issue and revoke ownership without secrets", () => {
  const projector = getProjector();
  const scopes = ["sandbox_security:evaluate", "sandbox_security:audit:read"] as const;
  const stages = [...SANDBOX_SECURITY_STAGES];
  const profiles = [...SANDBOX_SECURITY_POLICY_PROFILE_IDS];
  const issued = projector.capabilityIssued({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-admin",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    scopes,
    allowed_stages: stages,
    allowed_policy_profile_ids: profiles,
    issued_at: "2026-08-05T11:00:00.000Z",
    expires_at: "2026-08-05T13:00:00.000Z"
  });
  assert.deepEqual(Object.keys(issued), [
    "schema_version",
    "event_id",
    "event_type",
    "occurred_at",
    "subject_id",
    "authorization_scope_id",
    "capability_id",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "issued_at",
    "expires_at"
  ]);
  const issuedEvent = issued as IssuedAuditEvent;
  assert.deepEqual(issuedEvent.scopes, scopes);
  assert.deepEqual(issuedEvent.allowed_stages, stages);
  assert.deepEqual(issuedEvent.allowed_policy_profile_ids, profiles);
  assertNoContent(issued);

  const revoked = projector.capabilityRevoked({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-admin",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    revoked_at: FIXED_NOW
  });
  assert.equal(revoked.event_type, "capability_revoked");
  assert.equal(revoked.subject_id, "subject-admin");
  assert.equal(revoked.capability_id, FIXED_CAPABILITY_ID);
  assertNoContent(revoked);
});

test("REQ-SBX-GENERAL-003 projects audit reads and purges with fixed ownership", () => {
  const projector = getProjector();
  const read = projector.auditRead({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-reader",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    returned_count: 3,
    next_cursor_present: true,
    elapsed_ms: 1.9
  });
  assert.deepEqual(Object.keys(read), [
    "schema_version",
    "event_id",
    "event_type",
    "occurred_at",
    "subject_id",
    "authorization_scope_id",
    "capability_id",
    "returned_count",
    "next_cursor_present",
    "elapsed_ms"
  ]);
  const readEvent = read as ReadAuditEvent;
  assert.equal(readEvent.returned_count, 3);
  assert.equal(readEvent.next_cursor_present, true);
  assert.equal(readEvent.elapsed_ms, 1);

  const purged = projector.auditPurged({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "system:bootstrap-admin",
    retention_days: 90,
    deleted_count: 4,
    has_more: false,
    elapsed_ms: 60001.1
  });
  assert.deepEqual(Object.keys(purged), [
    "schema_version",
    "event_id",
    "event_type",
    "occurred_at",
    "subject_id",
    "authorization_scope_id",
    "capability_id",
    "retention_days",
    "deleted_count",
    "has_more",
    "elapsed_ms"
  ]);
  assert.equal(purged.subject_id, "system:bootstrap-admin");
  assert.equal(purged.authorization_scope_id, null);
  assert.equal(purged.capability_id, null);
  assert.equal(purged.retention_days, 90);
  assert.equal(purged.elapsed_ms, 60000);
});

test("REQ-SBX-GENERAL-003 returns defensive projection copies", () => {
  const projector = getProjector();
  const scopes = ["sandbox_security:evaluate"] as const;
  const stages = ["user_input"] as const;
  const profiles = ["sandbox-security-strict.v1"] as const;
  const event = projector.capabilityIssued({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-a",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    scopes,
    allowed_stages: stages,
    allowed_policy_profile_ids: profiles,
    issued_at: "2026-08-05T11:00:00.000Z",
    expires_at: "2026-08-05T13:00:00.000Z"
  });
  const issuedEvent = event as IssuedAuditEvent;
  assert.notEqual(issuedEvent.scopes, scopes);
  assert.notEqual(issuedEvent.allowed_stages, stages);
  assert.notEqual(issuedEvent.allowed_policy_profile_ids, profiles);
  issuedEvent.scopes.push("sandbox_security:audit:read");
  assert.deepEqual(scopes, ["sandbox_security:evaluate"]);

  const decision = makeDecision();
  const completed = projector.evaluationCompleted({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-a",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    composition_binding: COMPOSITION,
    elapsed_ms: 1,
    decision
  });
  const completedEvent = completed as CompletedAuditEvent;
  assert.notEqual(completedEvent.category_counts, expectedCounts(decision).category_counts);
  (completedEvent.category_counts as Record<SandboxSecurityRiskCategory, number>).prompt_injection = 99;
  assert.equal(decision.findings[0]?.category, "prompt_injection");
});

test("REQ-SBX-GENERAL-003 rejects non-number elapsed values before coercion", () => {
  const projector = getProjector();
  const readWithElapsed = (elapsed_ms: unknown): ReadAuditEvent =>
    projector.auditRead({
      event_id: FIXED_AUDIT_ID,
      occurred_at: FIXED_NOW,
      subject_id: "subject-reader",
      authorization_scope_id: FIXED_SCOPE,
      capability_id: FIXED_CAPABILITY_ID,
      returned_count: 0,
      next_cursor_present: false,
      elapsed_ms
    } as never) as ReadAuditEvent;

  assert.throws(() => readWithElapsed("2"), TypeError);
  assert.throws(() => readWithElapsed(null), TypeError);
  let valueOfCalled = false;
  const objectElapsed = {
    valueOf() {
      valueOfCalled = true;
      throw new Error("valueOf must not be called");
    }
  };
  assert.throws(() => readWithElapsed(objectElapsed), TypeError);
  assert.equal(valueOfCalled, false);

  assert.equal(readWithElapsed(Number.NaN).elapsed_ms, 0);
  assert.equal(readWithElapsed(Number.NEGATIVE_INFINITY).elapsed_ms, 0);
  assert.equal(readWithElapsed(Number.POSITIVE_INFINITY).elapsed_ms, 60000);
});
