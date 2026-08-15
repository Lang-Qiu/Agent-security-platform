import assert from "node:assert/strict";
import { test } from "node:test";
import * as shared from "../index.ts";
import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_STAGES
} from "../types/sandbox-security.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityAuditPage,
  SandboxSecurityEvaluationStreamEvent
} from "../types/sandbox-security-api.ts";

const EXPECTED_DETECTOR_RUN_STATUSES = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;

const VALID_EVENT_ID = "audit:00000000-0000-4000-8000-000000000000";
const VALID_TIMESTAMP = "2026-08-05T00:00:00.000Z";
const VALID_SUBJECT_ID = "subject-1";
const VALID_AUTHORIZATION_SCOPE_ID = `authscope:hmac-sha256:${"a".repeat(64)}`;
const VALID_CAPABILITY_ID =
  "capability:00000000-0000-4000-8000-000000000000";
const VALID_REQUEST_ID = "request_001";
const VALID_COMPOSITION_BINDING =
  "sandbox-security-production-composition.v1:rule_only";

function getNormalizers(): {
  normalizeEvent: (value: unknown) => SandboxSecurityAuditEvent | null;
  normalizePage: (value: unknown) => SandboxSecurityAuditPage | null;
} {
  assert.equal(typeof shared.normalizeSandboxSecurityAuditEvent, "function");
  assert.equal(typeof shared.normalizeSandboxSecurityAuditPage, "function");
  return {
    normalizeEvent: shared.normalizeSandboxSecurityAuditEvent,
    normalizePage: shared.normalizeSandboxSecurityAuditPage
  };
}

function categoryCounts(value = 1): Record<string, number> {
  return Object.fromEntries(
    SANDBOX_SECURITY_RISK_CATEGORIES.map((category) => [category, value])
  );
}

function detectorRunStatusCounts(value = 1): Record<string, number> {
  return Object.fromEntries(
    EXPECTED_DETECTOR_RUN_STATUSES.map((status) => [status, value])
  );
}

function evaluationFields() {
  return {
    request_id: VALID_REQUEST_ID,
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: VALID_COMPOSITION_BINDING,
    elapsed_ms: 0
  };
}

function baseFields(event_type: string) {
  return {
    schema_version: "sandbox-security-audit-event.v1",
    event_id: VALID_EVENT_ID,
    event_type,
    occurred_at: VALID_TIMESTAMP,
    subject_id: VALID_SUBJECT_ID,
    authorization_scope_id: VALID_AUTHORIZATION_SCOPE_ID,
    capability_id: VALID_CAPABILITY_ID
  };
}

function makeCompletedEvent(
  event_type: "evaluation_completed" | "evaluation_replayed" =
    "evaluation_completed"
) {
  return {
    ...baseFields(event_type),
    ...evaluationFields(),
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    category_counts: categoryCounts(),
    detector_run_status_counts: detectorRunStatusCounts()
  };
}

function makeInterruptedEvent() {
  return {
    ...baseFields("evaluation_interrupted"),
    ...evaluationFields(),
    interruption_code: "engine_error"
  };
}

function makeRejectedEvent(
  route_id: "evaluation" | "audit_read" = "evaluation",
  rejection_code = "invalid_request",
  details: Record<string, unknown> = {}
) {
  return {
    ...baseFields("request_rejected"),
    route_id,
    request_id: route_id === "audit_read" ? null : null,
    stage: route_id === "audit_read" ? null : null,
    policy_profile_id: route_id === "audit_read" ? null : null,
    composition_binding: VALID_COMPOSITION_BINDING,
    elapsed_ms: 1,
    rejection_code,
    ...details
  };
}

function makeIssuedEvent() {
  return {
    ...baseFields("capability_issued"),
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: [...SANDBOX_SECURITY_STAGES],
    allowed_policy_profile_ids: [...SANDBOX_SECURITY_POLICY_PROFILE_IDS],
    issued_at: VALID_TIMESTAMP,
    expires_at: "2026-08-05T00:15:00.000Z"
  };
}

function makeRevokedEvent() {
  return {
    ...baseFields("capability_revoked"),
    revoked_at: VALID_TIMESTAMP
  };
}

function makeAuditReadEvent() {
  return {
    ...baseFields("audit_read"),
    returned_count: 0,
    next_cursor_present: false,
    elapsed_ms: 2
  };
}

function makePurgedEvent() {
  return {
    ...baseFields("audit_purged"),
    subject_id: "system:bootstrap-admin",
    authorization_scope_id: null,
    capability_id: null,
    retention_days: 90,
    deleted_count: 0,
    has_more: false,
    elapsed_ms: 3
  };
}

const EVENT_FIXTURES = [
  ["evaluation_completed", makeCompletedEvent()],
  ["evaluation_replayed", makeCompletedEvent("evaluation_replayed")],
  ["evaluation_interrupted", makeInterruptedEvent()],
  ["request_rejected", makeRejectedEvent()],
  ["capability_issued", makeIssuedEvent()],
  ["capability_revoked", makeRevokedEvent()],
  ["audit_read", makeAuditReadEvent()],
  ["audit_purged", makePurgedEvent()]
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("REQ-SBX-GENERAL-003 shared index exposes strict audit normalizers", () => {
  assert.equal(typeof shared.normalizeSandboxSecurityAuditEvent, "function");
  assert.equal(typeof shared.normalizeSandboxSecurityAuditPage, "function");
});

test("REQ-SBX-GENERAL-003 normalizes every exact audit event variant", () => {
  const { normalizeEvent } = getNormalizers();
  for (const [eventType, fixture] of EVENT_FIXTURES) {
    const normalized = normalizeEvent(fixture);
    assert.ok(normalized, `${eventType} should normalize`);
    assert.deepEqual(Object.keys(normalized), Object.keys(fixture));
  }
});

test("REQ-SBX-GENERAL-003 rejects unknown, inherited, accessor, and symbol fields", () => {
  const { normalizeEvent } = getNormalizers();
  const unknown = { ...makeRevokedEvent(), extra: true };
  assert.equal(normalizeEvent(unknown), null);

  const inherited = Object.create({ extra: true });
  Object.assign(inherited, makeRevokedEvent());
  assert.equal(normalizeEvent(inherited), null);

  const accessor = makeRevokedEvent();
  Object.defineProperty(accessor, "revoked_at", {
    enumerable: true,
    configurable: true,
    get: () => VALID_TIMESTAMP
  });
  assert.equal(normalizeEvent(accessor), null);

  const symbolField = makeRevokedEvent();
  Object.defineProperty(symbolField, Symbol("unexpected"), {
    enumerable: true,
    value: true
  });
  assert.equal(normalizeEvent(symbolField), null);
});

test("REQ-SBX-GENERAL-003 rejects prototype-name event types without throwing", () => {
  const { normalizeEvent } = getNormalizers();
  for (const eventType of ["constructor", "hasOwnProperty", "toString"]) {
    const invalid = { event_type: eventType };
    assert.equal(normalizeEvent(invalid), null, `${eventType} should be rejected`);
  }
});

test("REQ-SBX-GENERAL-003 enforces event UUID and strict UTC millisecond timestamps", () => {
  const { normalizeEvent } = getNormalizers();
  for (const [field, value] of [
    ["event_id", "audit:00000000-0000-4000-7000-000000000000"],
    ["event_id", "audit:00000000-0000-4000-8000-00000000000"],
    ["occurred_at", "2026-08-05T00:00:00Z"],
    ["occurred_at", "2026-08-05T00:00:00.00Z"],
    ["occurred_at", "2026-08-05T00:00:00.000+00:00"],
    ["occurred_at", "2026-02-29T00:00:00.000Z"]
  ] as const) {
    const invalid = makeRevokedEvent();
    invalid[field] = value;
    assert.equal(normalizeEvent(invalid), null, `${field}=${value}`);
  }
});

test("REQ-SBX-GENERAL-003 enforces catalogs, bounds, and count key ordering", () => {
  const { normalizeEvent } = getNormalizers();
  const invalidStage = makeCompletedEvent();
  invalidStage.stage = "unknown";
  assert.equal(normalizeEvent(invalidStage), null);

  const invalidElapsed = makeInterruptedEvent();
  invalidElapsed.elapsed_ms = 60001;
  assert.equal(normalizeEvent(invalidElapsed), null);

  const fractionalElapsed = makeAuditReadEvent();
  fractionalElapsed.elapsed_ms = 1.5;
  assert.equal(normalizeEvent(fractionalElapsed), null);

  const reorderedCounts = makeCompletedEvent();
  reorderedCounts.category_counts = Object.fromEntries(
    [...SANDBOX_SECURITY_RISK_CATEGORIES].reverse().map((category) => [
      category,
      1
    ])
  );
  assert.equal(normalizeEvent(reorderedCounts), null);

  const missingCount = makeCompletedEvent();
  delete missingCount.category_counts.prompt_injection;
  assert.equal(normalizeEvent(missingCount), null);

  const unsafeCount = makeCompletedEvent();
  unsafeCount.detector_run_status_counts.matched = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(normalizeEvent(unsafeCount), null);

  const negativeCount = makeCompletedEvent();
  negativeCount.category_counts.jailbreak = -1;
  assert.equal(normalizeEvent(negativeCount), null);

  const invalidIdentity = makeCompletedEvent();
  invalidIdentity.authorization_scope_id = "scope-1";
  assert.equal(normalizeEvent(invalidIdentity), null);
  const invalidCapability = makeCompletedEvent();
  invalidCapability.capability_id = "capability-1";
  assert.equal(normalizeEvent(invalidCapability), null);
});

test("REQ-SBX-GENERAL-003 enforces evaluation and rejection matrices", () => {
  const { normalizeEvent } = getNormalizers();
  const invalidBinding = makeCompletedEvent();
  invalidBinding.composition_binding = "rule_only";
  assert.equal(normalizeEvent(invalidBinding), null);

  const invalidAuditRequestFields = makeRejectedEvent("audit_read", "invalid_request", {
    request_id: VALID_REQUEST_ID
  });
  assert.equal(normalizeEvent(invalidAuditRequestFields), null);

  const auditEvaluationCode = makeRejectedEvent("audit_read", "stage_forbidden");
  assert.equal(normalizeEvent(auditEvaluationCode), null);

  const evaluationOnlyCodeOnAudit = makeRejectedEvent(
    "audit_read",
    "concurrency_limited"
  );
  assert.equal(normalizeEvent(evaluationOnlyCodeOnAudit), null);

  const evaluationWithPartialRequest = makeRejectedEvent("evaluation", "invalid_request", {
    request_id: VALID_REQUEST_ID,
    stage: null,
    policy_profile_id: "sandbox-security-balanced.v1"
  });
  assert.equal(normalizeEvent(evaluationWithPartialRequest), null);

  const evaluationWithContext = makeRejectedEvent("evaluation", "stage_forbidden", {
    request_id: VALID_REQUEST_ID,
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1"
  });
  assert.ok(normalizeEvent(evaluationWithContext));
});

test("REQ-SBX-GENERAL-003 normalizes capability and purge array fields in catalog order", () => {
  const { normalizeEvent } = getNormalizers();
  const issued = makeIssuedEvent();
  const normalized = normalizeEvent(issued);
  assert.ok(normalized && normalized.event_type === "capability_issued");
  if (!normalized || normalized.event_type !== "capability_issued") return;
  assert.deepEqual(normalized.scopes, issued.scopes);
  assert.deepEqual(normalized.allowed_stages, issued.allowed_stages);
  assert.deepEqual(
    normalized.allowed_policy_profile_ids,
    issued.allowed_policy_profile_ids
  );

  const duplicateScope = makeIssuedEvent();
  duplicateScope.scopes = [
    "sandbox_security:evaluate",
    "sandbox_security:evaluate"
  ];
  assert.equal(normalizeEvent(duplicateScope), null);

  const reorderedStages = makeIssuedEvent();
  reorderedStages.allowed_stages = [...SANDBOX_SECURITY_STAGES].reverse();
  assert.equal(normalizeEvent(reorderedStages), null);

  const invalidExpiry = makeIssuedEvent();
  invalidExpiry.expires_at = "2026-08-04T23:59:59.000Z";
  assert.equal(normalizeEvent(invalidExpiry), null);

  const equalExpiry = makeIssuedEvent();
  equalExpiry.expires_at = equalExpiry.issued_at;
  assert.equal(normalizeEvent(equalExpiry), null);

  const auditOnlyGrant = makeIssuedEvent();
  auditOnlyGrant.scopes = ["sandbox_security:audit:read"];
  auditOnlyGrant.allowed_stages = [];
  auditOnlyGrant.allowed_policy_profile_ids = [];
  assert.ok(normalizeEvent(auditOnlyGrant));

  const auditOnlyWithEvaluationGrant = makeIssuedEvent();
  auditOnlyWithEvaluationGrant.scopes = ["sandbox_security:audit:read"];
  assert.equal(normalizeEvent(auditOnlyWithEvaluationGrant), null);
});

test("REQ-SBX-GENERAL-003 returns fresh defensive copies for nested event values", () => {
  const { normalizeEvent } = getNormalizers();
  const input = makeCompletedEvent();
  const normalized = normalizeEvent(input);
  assert.ok(normalized && (normalized.event_type === "evaluation_completed" || normalized.event_type === "evaluation_replayed"));
  if (!normalized || (normalized.event_type !== "evaluation_completed" && normalized.event_type !== "evaluation_replayed")) return;
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.category_counts, input.category_counts);
  assert.notEqual(
    normalized.detector_run_status_counts,
    input.detector_run_status_counts
  );
  (normalized.category_counts as Record<string, number>).jailbreak = 99;
  assert.equal(input.category_counts.jailbreak, 1);
});

test("REQ-SBX-GENERAL-003 normalizes audit pages and cursor grammar", () => {
  const { normalizeEvent, normalizePage } = getNormalizers();
  const event = makeRevokedEvent();
  assert.ok(normalizeEvent(event));

  const validPage = {
    schema_version: "sandbox-security-audit-page.v1",
    events: [event],
    next_cursor: "sbxcur_v1.YQ.Yg"
  };
  const normalized = normalizePage(validPage);
  assert.ok(normalized);
  assert.notEqual(normalized.events, validPage.events);
  assert.notEqual(normalized.events[0], validPage.events[0]);

  for (const cursor of [
    "sbxcur_v1.A.Yg",
    "sbxcur_v1.YQ=.Yg",
    "sbxcur_v1.YQ.",
    "sbxcur_v1..Yg",
    "sbxcur_v1.YQ.Yg!"
  ]) {
    assert.equal(
      normalizePage({ ...validPage, next_cursor: cursor }),
      null,
      cursor
    );
  }

  const emptyPage = { ...validPage, events: [], next_cursor: null };
  assert.ok(normalizePage(emptyPage));
  const hundredEvents = {
    ...validPage,
    events: Array.from({ length: 100 }, () => clone(event))
  };
  assert.ok(normalizePage(hundredEvents));
  const tooManyEvents = {
    ...validPage,
    events: Array.from({ length: 101 }, () => clone(event))
  };
  assert.equal(normalizePage(tooManyEvents), null);

  const sparseEvents = { ...validPage, events: new Array(1) };
  assert.equal(normalizePage(sparseEvents), null);
});

test("REQ-SBX-GENERAL-003 rejects page unknown fields and preserves input arrays", () => {
  const { normalizePage } = getNormalizers();
  const event = makeRevokedEvent();
  const input = {
    schema_version: "sandbox-security-audit-page.v1",
    events: [event],
    next_cursor: null,
    extra: true
  };
  assert.equal(normalizePage(input), null);

  const accepted = {
    schema_version: "sandbox-security-audit-page.v1",
    events: [event],
    next_cursor: null
  };
  const output = normalizePage(accepted);
  assert.ok(output);
  output.events.pop();
  assert.equal(accepted.events.length, 1);
});

const STREAM_REQUEST_ID = "request_stream_001";

function makeStreamStageEvent(
  sequence: 1 | 2 | 3 | 4,
  stage: "source" | "rule" | "model" | "judge",
  status: "completed" | "matched" | "no_match" | "skipped" = "no_match"
) {
  return {
    schema_version: "sandbox-security-evaluation-stream.v1",
    event_type: "stage",
    request_id: STREAM_REQUEST_ID,
    sequence,
    stage,
    status,
    delivery: "live",
    result:
      stage === "source"
        ? { source_count: 1, tool_request_present: false, elapsed_ms: 2 }
        : {
            detector_id: `detector://sandbox/security/${stage}/default/v1`,
            detector_version: "1.0.0",
            detector_kind:
              stage === "rule"
                ? "rule"
                : stage === "model"
                  ? "local_model"
                  : "external_judge",
            obligation: "profile_required",
            elapsed_ms: 3,
            ...(status === "skipped" ? { skip_reason: "routing_not_selected" } : {})
          }
  };
}

function makeStreamDecisionEvent() {
  return {
    schema_version: "sandbox-security-evaluation-stream.v1",
    event_type: "decision",
    request_id: STREAM_REQUEST_ID,
    sequence: 5,
    stage: "decision",
    delivery: "live",
    decision: {
      schema_version: "sandbox-security-decision.v1",
      decision_id: "decision_stream_001",
      request_id: STREAM_REQUEST_ID,
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      verdict: "no_detected_risk",
      action: "allow",
      risk_level: "info",
      findings: [],
      detector_runs: [],
      evidence_refs: [],
      created_at: VALID_TIMESTAMP
    }
  };
}

test("REQ-SBX-GENERAL-006 accepts the five ordered content-free stream events", () => {
  assert.equal(typeof shared.normalizeSandboxSecurityEvaluationStreamEvent, "function");
  const normalize = shared.normalizeSandboxSecurityEvaluationStreamEvent;
  const events = [
    makeStreamStageEvent(1, "source", "completed"),
    makeStreamStageEvent(2, "rule", "no_match"),
    makeStreamStageEvent(3, "model", "skipped"),
    makeStreamStageEvent(4, "judge", "skipped"),
    makeStreamDecisionEvent()
  ];
  const normalized = events.map((event) => normalize(event));
  assert.ok(normalized.every(Boolean));
  assert.deepEqual(
    normalized.map((event) =>
      event && event.event_type !== "error" ? event.sequence : null
    ),
    [1, 2, 3, 4, 5]
  );
});

test("REQ-SBX-GENERAL-006 rejects reordered, extra-key, and content-bearing stream events", () => {
  const normalize = shared.normalizeSandboxSecurityEvaluationStreamEvent;
  const valid = makeStreamStageEvent(2, "rule");
  assert.equal(normalize({ ...valid, sequence: 1 }), null);
  assert.equal(normalize({ ...valid, extra: true }), null);
  assert.equal(
    normalize({ ...valid, result: { ...valid.result, rule_snippet: "secret" } }),
    null
  );
  assert.equal(
    normalize({ ...valid, status: "completed", result: { ...valid.result, error_code: "x" } }),
    null
  );
});

test("REQ-SBX-GENERAL-006 rejects malformed decision and error events", () => {
  const normalize = shared.normalizeSandboxSecurityEvaluationStreamEvent;
  const decision = makeStreamDecisionEvent();
  assert.equal(normalize({ ...decision, sequence: 4 }), null);
  assert.equal(normalize({ ...decision, decision: { ...decision.decision, raw_input: "secret" } }), null);
  assert.equal(
    normalize({
      schema_version: "sandbox-security-evaluation-stream.v1",
      event_type: "error",
      request_id: STREAM_REQUEST_ID,
      error_code: "engine_error",
      retryable: true,
      secret: "token"
    }),
    null
  );
  const error = normalize({
    schema_version: "sandbox-security-evaluation-stream.v1",
    event_type: "error",
    request_id: STREAM_REQUEST_ID,
    error_code: "engine_error",
    retryable: true
  });
  assert.ok(error && error.event_type === "error");
});
