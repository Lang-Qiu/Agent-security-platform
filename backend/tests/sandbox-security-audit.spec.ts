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
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditService,
  SandboxSecurityAuditRejectionCode
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityAuditRepository } from "../src/modules/sandbox-security/ports/audit.repository.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type {
  SandboxSecurityHmacService,
  SandboxSecurityIdempotencyMaintenance
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import { createSandboxSecurityHmacService } from "../src/modules/sandbox-security/hmac.ts";
import { createSandboxSecurityServiceError } from "../src/modules/sandbox-security/sandbox-security.errors.ts";
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

test("REQ-SBX-GENERAL-003 exposes the subject-scoped audit service factory", () => {
  const value = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityAuditService;
  assert.equal(typeof value, "function");
});

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

const SUBJECT_A_CAPABILITY = {
  capability_id: FIXED_CAPABILITY_ID,
  subject_id: "subject-reader-a",
  authorization_scope_id: FIXED_SCOPE,
  scopes: ["sandbox_security:audit:read"] as const,
  allowed_stages: [] as const,
  allowed_policy_profile_ids: [] as const,
  issued_at: "2026-08-05T00:00:00.000Z",
  expires_at: "2026-08-05T13:00:00.000Z"
} satisfies SandboxSecurityAuthorizedCapability;

const SUBJECT_B_CAPABILITY = {
  ...SUBJECT_A_CAPABILITY,
  subject_id: "subject-reader-b"
} satisfies SandboxSecurityAuthorizedCapability;

function makePageEvent(input: Readonly<{
  event_id: string;
  occurred_at: string;
  subject_id?: string;
  authorization_scope_id?: string;
}>): SandboxSecurityAuditEvent {
  return getProjector().capabilityRevoked({
    event_id: input.event_id,
    occurred_at: input.occurred_at,
    subject_id: input.subject_id ?? SUBJECT_A_CAPABILITY.subject_id,
    authorization_scope_id:
      input.authorization_scope_id ?? SUBJECT_A_CAPABILITY.authorization_scope_id,
    capability_id: FIXED_CAPABILITY_ID,
    revoked_at: input.occurred_at
  });
}

function cloneEvent(event: SandboxSecurityAuditEvent): SandboxSecurityAuditEvent {
  return structuredClone(event);
}

function makeAuditServiceFixture(input: Readonly<{
  events?: readonly SandboxSecurityAuditEvent[];
  over_limit_events?: boolean;
  list_error?: unknown;
  purge_error?: unknown;
  hmac_error?: unknown;
  pre_cleanup_error?: unknown;
  projector_error?: unknown;
  maintenance_state?: "healthy" | "degraded" | "closed";
  purge_deleted_count?: number;
  purge_has_more?: boolean;
  now?: string;
}> = {}) {
  const state = {
    now: input.now ?? FIXED_NOW,
    monotonic_now_ms: 1000,
    events: (input.events ?? [
      makePageEvent({
        event_id: "audit:00000000-0000-4000-8000-000000000003",
        occurred_at: "2026-08-05T11:00:00.000Z"
      }),
      makePageEvent({
        event_id: "audit:00000000-0000-4000-8000-000000000002",
        occurred_at: "2026-08-05T11:00:00.000Z"
      }),
      makePageEvent({
        event_id: "audit:00000000-0000-4000-8000-000000000001",
        occurred_at: "2026-08-05T10:00:00.000Z"
      })
    ]).map(cloneEvent),
    over_limit_events: input.over_limit_events ?? false,
    list_inputs: [] as unknown[],
    purge_inputs: [] as unknown[],
    read_inputs: [] as unknown[],
    purge_projector_inputs: [] as unknown[],
    read_events: [] as SandboxSecurityAuditEvent[],
    purge_events: [] as SandboxSecurityAuditEvent[],
    call_order: [] as string[],
    pre_cleanup_calls: 0,
    maintenance_state: input.maintenance_state ?? "healthy",
    list_error: input.list_error,
    purge_error: input.purge_error,
    pre_cleanup_error: input.pre_cleanup_error,
    projector_error: input.projector_error,
    purge_deleted_count: input.purge_deleted_count ?? 4,
    purge_has_more: input.purge_has_more ?? false
  };

  const baseHmac = createSandboxSecurityHmacService(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  );
  const hmac: SandboxSecurityHmacService = input.hmac_error === undefined
    ? baseHmac
    : {
        ...baseHmac,
        decodeAuditCursor() {
          throw input.hmac_error;
        }
      };
  const runtime: SandboxSecurityRuntimePort = {
    now() {
      return state.now;
    },
    monotonicNowMs() {
      state.monotonic_now_ms += 5;
      return state.monotonic_now_ms;
    },
    randomBytes(length) {
      return new Uint8Array(length);
    },
    nextCapabilityId() {
      return FIXED_CAPABILITY_ID;
    },
    nextAuditEventId() {
      return "audit:00000000-0000-4000-8000-000000000099";
    },
    nextDecisionId() {
      return "decision:00000000-0000-4000-8000-000000000001";
    },
    scheduleTimeout() {
      return () => {};
    },
    scheduleInterval() {
      return { unref() {}, cancel() {} };
    }
  };

  const baseProjector = getProjector();
  const audit_projector: SandboxSecurityAuditProjector = {
    ...baseProjector,
    auditRead(value) {
      state.read_inputs.push({ ...value });
      if (state.projector_error !== undefined) throw state.projector_error;
      const event = baseProjector.auditRead(value);
      state.read_events.push(event);
      return event;
    },
    auditPurged(value) {
      state.purge_projector_inputs.push({ ...value });
      if (state.projector_error !== undefined) throw state.projector_error;
      const event = baseProjector.auditPurged(value);
      state.purge_events.push(event);
      return event;
    }
  };

  const repository: SandboxSecurityAuditRepository = {
    append() {},
    listAndRecordRead(value) {
      state.list_inputs.push({
        visibility_subject_id: value.visibility_subject_id,
        after: value.after === null ? null : { ...value.after },
        limit: value.limit
      });
      state.call_order.push("list:page-selected");
      const selected = state.events
        .filter((event) => {
          if (event.subject_id !== value.visibility_subject_id) return false;
          if (value.after === null) return true;
          return (
            event.occurred_at < value.after.occurred_at ||
            (event.occurred_at === value.after.occurred_at &&
              event.event_id < value.after.event_id)
          );
        })
        .slice(0, value.limit);
      const hasMore = state.events.filter((event) => {
        if (event.subject_id !== value.visibility_subject_id) return false;
        if (value.after === null) return true;
        return (
          event.occurred_at < value.after.occurred_at ||
          (event.occurred_at === value.after.occurred_at &&
            event.event_id < value.after.event_id)
        );
      }).length > value.limit;
      const readEvent = value.create_event({
        returned_count: selected.length,
        next_cursor_present: hasMore
      });
      state.call_order.push("list:read-audit-created");
      if (state.list_error !== undefined) throw state.list_error;
      const returnedEvents = state.over_limit_events
        ? state.events.filter((event) => event.subject_id === value.visibility_subject_id)
        : selected;
      return { events: returnedEvents.map(cloneEvent), has_more: hasMore };
    },
    purgeExpiredWithAudit(value) {
      state.purge_inputs.push({ cutoff: value.cutoff, limit: value.limit });
      state.call_order.push("purge:rows-selected");
      if (state.purge_error !== undefined) throw state.purge_error;
      const event = value.create_event(
        state.purge_deleted_count,
        state.purge_has_more
      );
      state.call_order.push("purge:audit-created");
      state.purge_events.push(event);
      return {
        deleted_count: state.purge_deleted_count,
        has_more: state.purge_has_more
      };
    }
  };

  const maintenance: SandboxSecurityIdempotencyMaintenance = {
    state() {
      return state.maintenance_state;
    },
    assertEvaluationAvailable() {},
    claim() {
      throw new Error("unsupported maintenance method");
    },
    runHourlyCleanup() {},
    runPurgePreCleanup() {
      state.pre_cleanup_calls += 1;
      if (state.pre_cleanup_error !== undefined) throw state.pre_cleanup_error;
      if (state.maintenance_state === "degraded") state.maintenance_state = "healthy";
    },
    close() {
      state.maintenance_state = "closed";
    }
  };

  const create = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityAuditService as ((value: Readonly<{
      repository: SandboxSecurityAuditRepository;
      hmac: SandboxSecurityHmacService;
      maintenance: SandboxSecurityIdempotencyMaintenance;
      runtime: SandboxSecurityRuntimePort;
      audit_projector: SandboxSecurityAuditProjector;
    }>) => SandboxSecurityAuditService);
  assert.equal(typeof create, "function");
  const service = create({
    repository,
    hmac,
    maintenance,
    runtime,
    audit_projector
  });
  return { service, state, repository, hmac, maintenance, runtime, audit_projector };
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

test("REQ-SBX-GENERAL-003 binds audit cursors to subject and authorization scope", () => {
  const fixture = makeAuditServiceFixture();
  const first = fixture.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 });
  assert.equal(first.events.length, 1);
  assert.equal(first.next_cursor !== null, true);
  const decoded = fixture.hmac.decodeAuditCursor(first.next_cursor!, {
    subject_id: SUBJECT_A_CAPABILITY.subject_id,
    authorization_scope_id: SUBJECT_A_CAPABILITY.authorization_scope_id
  });
  assert.deepEqual(decoded, {
    subject_id: SUBJECT_A_CAPABILITY.subject_id,
    authorization_scope_id: SUBJECT_A_CAPABILITY.authorization_scope_id,
    occurred_at: "2026-08-05T11:00:00.000Z",
    event_id: "audit:00000000-0000-4000-8000-000000000003"
  });
  assert.throws(
    () => fixture.service.list({
      capability: SUBJECT_B_CAPABILITY,
      cursor: first.next_cursor!,
      limit: 1
    }),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID" &&
      error?.audit_rejection_code === "invalid_request"
  );
  assert.equal(fixture.state.list_inputs.length, 1);
});

test("REQ-SBX-GENERAL-003 paginates audit ties through the last returned event", () => {
  const fixture = makeAuditServiceFixture();
  const first = fixture.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 });
  const second = fixture.service.list({
    capability: SUBJECT_A_CAPABILITY,
    cursor: first.next_cursor!,
    limit: 1
  });
  assert.equal(first.events[0]?.event_id, "audit:00000000-0000-4000-8000-000000000003");
  assert.equal(second.events[0]?.event_id, "audit:00000000-0000-4000-8000-000000000002");
  assert.equal(fixture.state.list_inputs[0] && (fixture.state.list_inputs[0] as any).after, null);
  assert.deepEqual((fixture.state.list_inputs[1] as any).after, {
    occurred_at: "2026-08-05T11:00:00.000Z",
    event_id: "audit:00000000-0000-4000-8000-000000000003"
  });
  assert.deepEqual(fixture.state.read_inputs.map((value: any) => ({
    returned_count: value.returned_count,
    next_cursor_present: value.next_cursor_present
  })), [
    { returned_count: 1, next_cursor_present: true },
    { returned_count: 1, next_cursor_present: true }
  ]);
  assert.deepEqual(fixture.state.call_order.slice(0, 4), [
    "list:page-selected",
    "list:read-audit-created",
    "list:page-selected",
    "list:read-audit-created"
  ]);
});

test("REQ-SBX-GENERAL-003 returns no page when the read audit write fails", () => {
  const fixture = makeAuditServiceFixture({ list_error: new Error("audit write failed") });
  assert.throws(
    () => fixture.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 }),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.equal(fixture.state.read_events.length, 1);
});

test("REQ-SBX-GENERAL-003 returns defensive copies and suppresses the read event from the page", () => {
  const issued = getProjector().capabilityIssued({
    event_id: "audit:00000000-0000-4000-8000-000000000010",
    occurred_at: "2026-08-05T11:00:00.000Z",
    subject_id: SUBJECT_A_CAPABILITY.subject_id,
    authorization_scope_id: SUBJECT_A_CAPABILITY.authorization_scope_id,
    capability_id: FIXED_CAPABILITY_ID,
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    issued_at: "2026-08-05T10:00:00.000Z",
    expires_at: "2026-08-05T12:00:00.000Z"
  });
  const fixture = makeAuditServiceFixture({ events: [issued] });
  const page = fixture.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 });
  assert.equal(page.schema_version, "sandbox-security-audit-page.v1");
  assert.equal(page.events.length, 1);
  assert.equal(page.events.some((event) => event.event_type === "audit_read"), false);
  assert.notStrictEqual(page.events[0], fixture.state.events[0]);
  const returned = page.events[0] as Extract<
    SandboxSecurityAuditEvent,
    { event_type: "capability_issued" }
  >;
  returned.scopes.push("sandbox_security:audit:read");
  assert.deepEqual(
    (fixture.state.events[0] as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "capability_issued" }
    >).scopes,
    ["sandbox_security:evaluate"]
  );
});

test("REQ-SBX-GENERAL-003 purges with fixed ninety-day retention and a 1000-row bound", () => {
  const fixture = makeAuditServiceFixture({
    now: FIXED_NOW,
    purge_deleted_count: 1000,
    purge_has_more: true
  });
  const result = fixture.service.purgeExpired();
  assert.deepEqual(result, {
    schema_version: "sandbox-security-audit-purge-result.v1",
    retention_days: 90,
    deleted_count: 1000,
    has_more: true
  });
  assert.deepEqual(fixture.state.purge_inputs, [{
    cutoff: "2026-05-07T12:00:00.000Z",
    limit: 1000
  }]);
  assert.equal(fixture.state.pre_cleanup_calls, 1);
  assert.equal(fixture.state.purge_projector_inputs.length, 1);
  assert.deepEqual(fixture.state.purge_projector_inputs[0], {
    event_id: "audit:00000000-0000-4000-8000-000000000099",
    occurred_at: FIXED_NOW,
    subject_id: "system:bootstrap-admin",
    retention_days: 90,
    deleted_count: 1000,
    has_more: true,
    elapsed_ms: 5
  });
  assert.equal(fixture.state.purge_events[0]?.authorization_scope_id, null);
  assert.equal(fixture.state.purge_events[0]?.capability_id, null);
});

test("REQ-SBX-GENERAL-003 runs purge pre-cleanup recovery before the audit purge", () => {
  const fixture = makeAuditServiceFixture({ maintenance_state: "degraded" });
  fixture.service.purgeExpired();
  assert.equal(fixture.state.maintenance_state, "healthy");
  assert.equal(fixture.state.pre_cleanup_calls, 1);
  assert.equal(fixture.state.purge_inputs.length, 1);
});

test("REQ-SBX-GENERAL-003 maps purge pre-cleanup failure to storage unavailable without purging", () => {
  const storageUnavailable = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
    audit_rejection_code: "storage_unavailable"
  });
  const fixture = makeAuditServiceFixture({ pre_cleanup_error: storageUnavailable });
  assert.throws(
    () => fixture.service.purgeExpired(),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE" &&
      error?.retry_after_seconds === 60
  );
  assert.equal(fixture.state.purge_inputs.length, 0);
  assert.equal(fixture.state.pre_cleanup_calls, 1);
});

test("REQ-SBX-GENERAL-003 maps repository storage errors during purge to internal", () => {
  const storageUnavailable = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
    audit_rejection_code: "storage_unavailable"
  });
  const fixture = makeAuditServiceFixture({ purge_error: storageUnavailable });
  assert.throws(
    () => fixture.service.purgeExpired(),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
});

test("REQ-SBX-GENERAL-003 classifies cursor decode exceptions as invalid cursors", () => {
  const errors = [
    new Error("decode failed"),
    createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
      audit_rejection_code: "invalid_request"
    }),
    createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
      audit_rejection_code: "storage_unavailable"
    })
  ];
  for (const hmac_error of errors) {
    const fixture = makeAuditServiceFixture({ hmac_error });
    assert.throws(
      () => fixture.service.list({ capability: SUBJECT_A_CAPABILITY, cursor: "bad", limit: 1 }),
      (error: any) =>
        error?.code === "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID" &&
        error?.audit_rejection_code === "invalid_request"
    );
    assert.equal(fixture.state.list_inputs.length, 0);
  }
});

test("REQ-SBX-GENERAL-003 rejects a repository page larger than the normalized limit", () => {
  const fixture = makeAuditServiceFixture({ over_limit_events: true });
  assert.throws(
    () => fixture.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 }),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
});

test("REQ-SBX-GENERAL-003 maps audit repository, cursor, and projector failures to tagged errors", () => {
  const repositoryFailure = makeAuditServiceFixture({ list_error: new Error("read failed") });
  assert.throws(
    () => repositoryFailure.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 }),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  const invalidCursor = makeAuditServiceFixture();
  assert.throws(
    () => invalidCursor.service.list({ capability: SUBJECT_A_CAPABILITY, cursor: "bad", limit: 1 }),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID" &&
      error?.audit_rejection_code === "invalid_request"
  );
  const projectorFailure = makeAuditServiceFixture({ projector_error: new Error("projection failed") });
  assert.throws(
    () => projectorFailure.service.list({ capability: SUBJECT_A_CAPABILITY, limit: 1 }),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
});
