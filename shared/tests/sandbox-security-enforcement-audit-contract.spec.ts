import assert from "node:assert/strict";
import test from "node:test";
import * as shared from "../index.ts";
import type { SandboxSecurityEnforcementAuditEventType } from "../index.ts";

const COMPLETED_EVENT_TYPE: SandboxSecurityEnforcementAuditEventType =
  "enforcement_completed";

const EVENT_ID = "audit:00000000-0000-4000-8000-000000000000";
const REQUEST_ID = "request:00000000-0000-4000-8000-000000000001";
const OCCURRED_AT = "2026-08-06T00:00:00.000Z";
const COMPOSITION =
  "sandbox-security-production-composition.v1:rule_only";

const CATEGORY_KEYS = [
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
] as const;

const STATUS_KEYS = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;

const counts = (keys: readonly string[], value = 0) =>
  Object.fromEntries(keys.map((key) => [key, value]));

const completedRequest = () => ({
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: EVENT_ID,
  request_id: REQUEST_ID,
  enforcement_point: "before_agent_run",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  composition_binding: COMPOSITION,
  elapsed_ms: 12,
  event_type: "enforcement_completed",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  category_counts: counts(CATEGORY_KEYS, 0),
  detector_run_status_counts: counts(STATUS_KEYS, 0),
  host_outcome: "continued"
});

const interruptedRequest = () => ({
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: EVENT_ID,
  request_id: REQUEST_ID,
  enforcement_point: "before_tool_execution",
  stage: "tool_request",
  policy_profile_id: "sandbox-security-strict.v1",
  composition_binding:
    "sandbox-security-production-composition.v1:local_and_judge",
  elapsed_ms: 60000,
  event_type: "enforcement_interrupted",
  interruption_code: "engine_timeout",
  applied_fail_closed_action: "deny"
});

test("REQ-SBX-GENERAL-004 exports private enforcement audit normalizers", () => {
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeSandboxSecurityEnforcementAuditRequest,
    "function"
  );
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeSandboxSecurityEnforcementAuditEvent,
    "function"
  );
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeOpenClawEnforcementAuditAck,
    "function"
  );
});

test("REQ-SBX-GENERAL-004 keeps the public v1 audit union closed", () => {
  assert.equal(COMPLETED_EVENT_TYPE, "enforcement_completed");
  assert.equal(
    shared.normalizeSandboxSecurityAuditEvent({
      schema_version: "sandbox-security-enforcement-audit-event.v1",
      event_type: "enforcement_completed"
    }),
    null
  );
});

test("REQ-SBX-GENERAL-004 normalizes exact completed and interrupted requests", () => {
  const normalize = (shared as Record<string, unknown>)
    .normalizeSandboxSecurityEnforcementAuditRequest;
  assert.equal(typeof normalize, "function");
  if (typeof normalize !== "function") return;

  const completed = normalize(completedRequest()) as Record<string, unknown>;
  assert.deepEqual(completed, completedRequest());
  assert.equal(Object.isFrozen(completed), true);
  assert.equal(Object.isFrozen(completed.category_counts), true);
  assert.deepEqual(
    normalize(interruptedRequest()),
    interruptedRequest()
  );
});

test("REQ-SBX-GENERAL-004 normalizes the durable variants and exact acknowledgement", () => {
  const normalizeEvent = (shared as Record<string, unknown>)
    .normalizeSandboxSecurityEnforcementAuditEvent;
  const normalizeAck = (shared as Record<string, unknown>)
    .normalizeOpenClawEnforcementAuditAck;
  assert.equal(typeof normalizeEvent, "function");
  assert.equal(typeof normalizeAck, "function");
  if (typeof normalizeEvent !== "function" || typeof normalizeAck !== "function") {
    return;
  }

  const common = {
    event_id: EVENT_ID,
    occurred_at: OCCURRED_AT,
    subject_id: "integration:openclaw",
    authorization_scope_id:
      "authscope:hmac-sha256:0000000000000000000000000000000000000000000000000000000000000000",
    capability_id: "capability:00000000-0000-4000-8000-000000000000",
    request_id: REQUEST_ID,
    enforcement_point: "before_agent_run",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION,
    elapsed_ms: 0
  };
  const completed = {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_type: "enforcement_completed",
    ...common,
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    category_counts: counts(CATEGORY_KEYS),
    detector_run_status_counts: counts(STATUS_KEYS),
    host_outcome: "continued"
  };
  const interrupted = {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_type: "enforcement_interrupted",
    ...common,
    interruption_code: "authority_mismatch",
    applied_fail_closed_action: "ask"
  };
  const issued = {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: EVENT_ID,
    event_type: "capability_issued",
    occurred_at: OCCURRED_AT,
    subject_id: "integration:openclaw",
    authorization_scope_id: common.authorization_scope_id,
    capability_id: common.capability_id,
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    composition_binding: COMPOSITION,
    issued_at: OCCURRED_AT,
    expires_at: "2026-08-06T01:00:00.000Z"
  };
  assert.deepEqual(normalizeEvent(completed)?.event_type, "enforcement_completed");
  assert.deepEqual(normalizeEvent(interrupted)?.event_type, "enforcement_interrupted");
  assert.deepEqual(normalizeEvent(issued)?.event_type, "capability_issued");
  assert.deepEqual(
    normalizeAck({
      schema_version: "sandbox-security-enforcement-audit-ack.v1",
      event_id: EVENT_ID,
      status: "accepted",
      occurred_at: OCCURRED_AT
    }),
    {
      schema_version: "sandbox-security-enforcement-audit-ack.v1",
      event_id: EVENT_ID,
      status: "accepted",
      occurred_at: OCCURRED_AT
    }
  );
});

test("REQ-SBX-GENERAL-004 enforces stage, action, interruption, count, and ID relations", () => {
  const normalize = (shared as Record<string, unknown>)
    .normalizeSandboxSecurityEnforcementAuditRequest as
    | ((value: unknown) => unknown)
    | undefined;
  assert.equal(typeof normalize, "function");
  if (normalize === undefined) return;

  const wrongStage = completedRequest();
  wrongStage.stage = "model_output";
  assert.equal(normalize(wrongStage), null);

  const wrongOutcome = completedRequest();
  wrongOutcome.action = "ask";
  assert.equal(normalize(wrongOutcome), null);

  const wrongFloor = interruptedRequest();
  wrongFloor.applied_fail_closed_action = "ask";
  assert.equal(normalize(wrongFloor), null);

  const overTotal = completedRequest();
  overTotal.category_counts = counts(CATEGORY_KEYS, 4097);
  assert.equal(normalize(overTotal), null);

  for (const requestId of [
    "audit:00000000-0000-4000-8000-000000000001",
    "request:00000000-0000-3000-8000-000000000001",
    "request:00000000-0000-4000-7000-000000000001",
    "request:00000000-0000-4000-8000-00000000000A",
    "request:run-1"
  ]) {
    const invalid = completedRequest();
    invalid.request_id = requestId;
    assert.equal(normalize(invalid), null);
  }
});

test("REQ-SBX-GENERAL-004 rejects accessors, prototypes, symbols, and extra keys", () => {
  const normalize = (shared as Record<string, unknown>)
    .normalizeSandboxSecurityEnforcementAuditRequest as
    | ((value: unknown) => unknown)
    | undefined;
  assert.equal(typeof normalize, "function");
  if (normalize === undefined) return;

  const extra = completedRequest() as Record<string, unknown>;
  extra.extra = true;
  assert.equal(normalize(extra), null);

  const inherited = Object.create({ event_id: EVENT_ID }) as Record<string, unknown>;
  Object.assign(inherited, completedRequest());
  delete inherited.event_id;
  assert.equal(normalize(inherited), null);

  const accessor = completedRequest() as Record<string, unknown>;
  Object.defineProperty(accessor, "event_id", {
    enumerable: true,
    get: () => EVENT_ID
  });
  assert.equal(normalize(accessor), null);

  const symbolValue = completedRequest() as Record<string | symbol, unknown>;
  symbolValue[Symbol("unexpected")] = true;
  assert.equal(normalize(symbolValue), null);
});
