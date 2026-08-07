import assert from "node:assert/strict";
import test from "node:test";

const actionMapperModule = (await import(
  "../src/general-security/action-mapper.ts"
).catch(() => ({}))) as Record<string, unknown>;

type RecordValue = Record<string, unknown>;
type Point =
  | "before_agent_run"
  | "before_model_output_delivery"
  | "before_tool_execution"
  | "before_message_delivery";
type Action = "allow" | "alert" | "ask" | "deny";
type FailureCode =
  | "authority_mismatch"
  | "correlation_mismatch"
  | "unsupported_input"
  | "engine_error"
  | "engine_timeout"
  | "engine_slot_unavailable"
  | "barrier_timeout"
  | "startup_recovery"
  | "request_id_unavailable";

const POINTS: readonly Point[] = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
];
const ACTIONS: readonly Action[] = ["allow", "alert", "ask", "deny"];
const FAILURES: readonly FailureCode[] = [
  "authority_mismatch",
  "correlation_mismatch",
  "unsupported_input",
  "engine_error",
  "engine_timeout",
  "engine_slot_unavailable",
  "barrier_timeout",
  "startup_recovery",
  "request_id_unavailable"
];

function mapDecision(input: unknown): RecordValue {
  const mapper = actionMapperModule.mapDecision;
  assert.equal(typeof mapper, "function", "action mapper must be exported");
  return (mapper as Function)(input) as RecordValue;
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function assertMapperRejected(input: unknown): void {
  assert.throws(
    () => mapDecision(input),
    (error: unknown) =>
      error instanceof Error && error.name === "openclaw_security_action_invalid"
  );
}

test("REQ-SBX-GENERAL-004 P3-T3 exposes the public action mapper", () => {
  assert.equal(typeof actionMapperModule.mapDecision, "function");
});

test("REQ-SBX-GENERAL-004 P3-T3 maps every action at every barrier", () => {
  for (const point of POINTS) {
    for (const action of ACTIONS) {
      const result = mapDecision({ point, action });
      assert.deepEqual(Object.keys(result).sort(), [
        "applied_action",
        "barrier",
        "host_outcome"
      ]);
      assert.equal(result.applied_action, action);
      assert.equal(
        result.host_outcome,
        action === "allow" || action === "alert" ? "continued" : "replaced"
      );
      if (action === "allow" || action === "alert") {
        assert.deepEqual(result.barrier, { outcome: "pass" });
      } else if (action === "ask") {
        assert.deepEqual(result.barrier, {
          outcome: "replace",
          replacement_code: "security_review_required",
          replacement_text: "Security review required. This action was not completed."
        });
      } else {
        assert.deepEqual(result.barrier, {
          outcome: "replace",
          replacement_code: "sandbox_security_policy_blocked",
          replacement_text: "Blocked by sandbox security policy."
        });
      }
      assert.equal(Object.hasOwn(result, "replacement_provenance"), false);
      assert.equal(JSON.stringify(result).includes("original-secret"), false);
      assertDeeplyFrozen(result);
    }
  }
});

test("REQ-SBX-GENERAL-004 P3-T3 applies the fixed failure floor by barrier", () => {
  for (const point of POINTS) {
    const result = mapDecision({ point, failure: "engine_error" });
    const expectedAction = point === "before_tool_execution" ? "deny" : "ask";
    assert.deepEqual(result, {
      barrier: {
        outcome: "replace",
        replacement_code: "sandbox_security_evaluation_unavailable",
        replacement_text: "Security evaluation unavailable. This action was not completed."
      },
      host_outcome: "replaced",
      applied_action: expectedAction
    });
    assertDeeplyFrozen(result);
  }
});

test("REQ-SBX-GENERAL-004 P3-T3 maps every closed failure code to unavailable", () => {
  for (const point of POINTS) {
    for (const failure of FAILURES) {
      const result = mapDecision({ point, failure });
      assert.equal(
        result.applied_action,
        point === "before_tool_execution" ? "deny" : "ask"
      );
      assert.deepEqual(result.barrier, {
        outcome: "replace",
        replacement_code: "sandbox_security_evaluation_unavailable",
        replacement_text: "Security evaluation unavailable. This action was not completed."
      });
      assert.equal(result.host_outcome, "replaced");
    }
  }
});

test("REQ-SBX-GENERAL-004 P3-T3 rejects malformed or open action inputs", () => {
  assertMapperRejected(null);
  assertMapperRejected({ point: "before_agent_run", action: "pass" });
  assertMapperRejected({ point: "unknown", action: "allow" });
  assertMapperRejected({ point: "before_agent_run", action: "allow", failure: "engine_error" });
  assertMapperRejected({ point: "before_agent_run", failure: "unknown_failure" });
  assertMapperRejected({ point: "before_agent_run", action: "allow", extra: true });

  const accessorInput: RecordValue = { point: "before_agent_run", action: "allow" };
  Object.defineProperty(accessorInput, "action", {
    enumerable: true,
    get: () => "allow"
  });
  assertMapperRejected(accessorInput);
});
