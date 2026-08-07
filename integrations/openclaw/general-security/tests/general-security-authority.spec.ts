import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSandboxSecurityRequest,
  type SandboxSecurityJsonValue
} from "../../../../shared/index.ts";

const authorityModule = (await import(
  "../src/general-security/authority-builder.ts"
).catch(() => ({}))) as Record<string, unknown>;
const indexModule = (await import("../src/index.ts")) as Record<string, unknown>;
const runtimeModule = (await import("../src/general-security/runtime.ts")) as Record<
  string,
  unknown
>;

const REQUEST_ID =
  "request:00000000-0000-4000-8000-000000000001";
const PROFILE = "sandbox-security-balanced.v1";
const PROMPT = "user prompt sentinel";
const RUN_ID = "run-0001";
const SESSION_KEY = "session-0001";
const CALL_ID = "call-0001";

type RecordValue = Record<string, unknown>;

function buildRequest(input: RecordValue): unknown {
  const builder = authorityModule.buildOpenClawSecurityEvaluationRequest;
  assert.equal(typeof builder, "function", "authority builder must be exported");
  return (builder as Function)(input);
}

function issuedRequestId(): unknown {
  const normalize = runtimeModule.normalizeOpenClawSecurityEvaluationRequestId;
  assert.equal(typeof normalize, "function");
  return (normalize as Function)(REQUEST_ID);
}

function correlation(callId: string | null = null): RecordValue {
  return { runId: RUN_ID, sessionKey: SESSION_KEY, callId };
}

function assistantProjection(): RecordValue {
  return {
    schema_version: "openclaw-security-assistant-projection.v1",
    text_parts: ["assistant text"],
    tool_calls: [
      {
        call_id: CALL_ID,
        tool_name: "send_report",
        arguments: { channel: "security", urgent: false }
      }
    ]
  };
}

function baseObservation(
  point:
    | "before_agent_run"
    | "before_model_output_delivery"
    | "before_tool_execution"
    | "before_message_delivery"
): RecordValue {
  const base = { point, correlation: correlation(), prompt: PROMPT };
  if (point === "before_model_output_delivery") {
    return { ...base, assistant: assistantProjection() };
  }
  if (point === "before_tool_execution") {
    return {
      ...base,
      correlation: correlation(CALL_ID),
      assistant: assistantProjection(),
      tool: {
        call_id: CALL_ID,
        tool_name: "send_report",
        arguments: { channel: "security", urgent: false }
      }
    };
  }
  if (point === "before_message_delivery") {
    return { ...base, outbound: "rewritten outbound" };
  }
  return base;
}

function builderInput(
  point:
    | "before_agent_run"
    | "before_model_output_delivery"
    | "before_tool_execution"
    | "before_message_delivery",
  overrides: RecordValue = {}
): RecordValue {
  return {
    observation: { ...baseObservation(point), ...(overrides.observation as RecordValue | undefined) },
    policy_profile_id: PROFILE,
    issued_request_id: issuedRequestId(),
    ...overrides
  };
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

function assertAuthorityRejected(input: RecordValue): void {
  assert.throws(
    () => buildRequest(input),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "openclaw_security_authority_invalid"
  );
}

function assertNormalizedRequest(result: unknown): asserts result is RecordValue {
  assert.equal(result !== null && typeof result === "object", true);
  const normalized = normalizeSandboxSecurityRequest(
    (result as RecordValue).submission
  );
  assert.notEqual(normalized, null);
  assert.deepEqual(
    Object.keys(result as RecordValue).sort(),
    ["authoritative_context", "submission"].sort()
  );
  assertDeeplyFrozen(result);
}

test("REQ-SBX-GENERAL-004 P3-T2 exposes the public authority builder surfaces", () => {
  assert.equal(typeof authorityModule.buildOpenClawSecurityEvaluationRequest, "function");
  assert.equal(typeof indexModule.buildOpenClawSecurityEvaluationRequest, "function");
});

test("REQ-SBX-GENERAL-004 P3-T2 builds current-prompt-only user authority", () => {
  const result = buildRequest(builderInput("before_agent_run"));
  assertNormalizedRequest(result);
  assert.deepEqual((result as RecordValue).submission, {
    schema_version: "sandbox-security-request.v1",
    request_id: REQUEST_ID,
    stage: "user_input",
    policy_profile_id: PROFILE,
    content_items: [
      {
        source_id: "openclaw-security:prompt:0001",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: PROMPT,
        provenance_ref: "platform://openclaw-security/prompt"
      }
    ]
  });
  assert.deepEqual(
    ((result as RecordValue).authoritative_context as RecordValue).sources,
    [
      {
        source_id: "openclaw-security:prompt:0001",
        authority_kind: "integration_observation",
        source_type: "user_input",
        media_type: "text/plain",
        value: PROMPT,
        provenance_ref: "platform://openclaw-security/prompt"
      }
    ]
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 builds exact assistant projection authority", () => {
  const result = buildRequest(builderInput("before_model_output_delivery"));
  assertNormalizedRequest(result);
  const submission = (result as RecordValue).submission as RecordValue;
  assert.equal(submission.stage, "model_output");
  assert.deepEqual(
    (submission.content_items as RecordValue[]).map((item) => item.claimed_source_type),
    ["user_input", "model_output"]
  );
  assert.equal(
    ((result as RecordValue).authoritative_context as RecordValue).evaluation_mode,
    "enforcement"
  );
  assert.equal(
    Object.hasOwn((result as RecordValue).authoritative_context as RecordValue, "tool_request"),
    false
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 builds matching final tool authority without a guessed target", () => {
  const result = buildRequest(builderInput("before_tool_execution"));
  assertNormalizedRequest(result);
  const submission = (result as RecordValue).submission as RecordValue;
  const context = (result as RecordValue).authoritative_context as RecordValue;
  assert.equal(submission.stage, "tool_request");
  assert.deepEqual(submission.tool_request, {
    call_id: CALL_ID,
    tool_name: "send_report",
    arguments: { channel: "security", urgent: false }
  });
  assert.deepEqual(context.tool_request, {
    authority_kind: "integration_observation",
    call_id: CALL_ID,
    tool_name: "send_report",
    arguments: { channel: "security", urgent: false }
  });
  assert.equal(Object.hasOwn(submission.tool_request as RecordValue, "target"), false);
});

test("REQ-SBX-GENERAL-004 P3-T2 builds final rewritten outbound authority", () => {
  const result = buildRequest(builderInput("before_message_delivery"));
  assertNormalizedRequest(result);
  const submission = (result as RecordValue).submission as RecordValue;
  assert.equal(submission.stage, "model_output");
  assert.equal(
    (submission.content_items as RecordValue[])[1]?.value,
    "rewritten outbound"
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 preserves the injected request ID and never derives it from observation", () => {
  const first = buildRequest(builderInput("before_agent_run")) as RecordValue;
  const changed = buildRequest({
    ...builderInput("before_agent_run"),
    issued_request_id: issuedRequestId(),
    observation: {
      ...baseObservation("before_agent_run"),
      correlation: { runId: "run-attacker", sessionKey: "session-other", callId: null },
      prompt: "different content"
    }
  }) as RecordValue;
  assert.equal((first.submission as RecordValue).request_id, REQUEST_ID);
  assert.equal((changed.submission as RecordValue).request_id, REQUEST_ID);
  assert.equal(
    ((changed.authoritative_context as RecordValue).sources as RecordValue[])[0]?.value,
    "different content"
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 defensively clones and freezes projection JSON", () => {
  const observation = baseObservation("before_model_output_delivery");
  const result = buildRequest({
    observation,
    policy_profile_id: PROFILE,
    issued_request_id: issuedRequestId()
  }) as RecordValue;
  (observation.assistant as RecordValue).text_parts = ["mutated"];
  const outputProjection = ((result.submission as RecordValue).content_items as RecordValue[])[1]!
    .value as RecordValue;
  assert.deepEqual(outputProjection.text_parts, ["assistant text"]);
  assertDeeplyFrozen(result);
});

test("REQ-SBX-GENERAL-004 P3-T2 rejects unknown authority fields and composite history", () => {
  for (const key of ["systemPrompt", "history", "workspace", "memory", "retrieval"]) {
    assertAuthorityRejected(
      builderInput("before_agent_run", {
        observation: { ...baseObservation("before_agent_run"), [key]: "untrusted" }
      })
    );
  }
  assertAuthorityRejected(
    builderInput("before_agent_run", { unexpected: true })
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 rejects malformed IDs, correlation, and tool matching", () => {
  assertAuthorityRejected({
    ...builderInput("before_agent_run"),
    issued_request_id: "request:bad"
  });
  assertAuthorityRejected(
    builderInput("before_tool_execution", {
      observation: {
        ...baseObservation("before_tool_execution"),
        tool: { call_id: "other-call", tool_name: "send_report", arguments: {} }
      }
    })
  );
  assertAuthorityRejected(
    builderInput("before_tool_execution", {
      observation: {
        ...baseObservation("before_tool_execution"),
        correlation: correlation("different-call")
      }
    })
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 rejects duplicate assistant calls and unknown blocks", () => {
  const duplicate = assistantProjection();
  duplicate.tool_calls = [
    ...(duplicate.tool_calls as RecordValue[]),
    { ...(duplicate.tool_calls as RecordValue[])[0] }
  ];
  assertAuthorityRejected(
    builderInput("before_model_output_delivery", {
      observation: { ...baseObservation("before_model_output_delivery"), assistant: duplicate }
    })
  );

  const unknown = assistantProjection();
  unknown.extra_block = { type: "image" };
  assertAuthorityRejected(
    builderInput("before_model_output_delivery", {
      observation: { ...baseObservation("before_model_output_delivery"), assistant: unknown }
    })
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 rejects cyclic, sparse, non-finite, binary, and multimodal values", () => {
  const cyclic: RecordValue = {};
  cyclic.self = cyclic;
  assertAuthorityRejected(
    builderInput("before_message_delivery", {
      observation: { ...baseObservation("before_message_delivery"), outbound: cyclic }
    })
  );

  const sparse = [] as unknown[];
  sparse.length = 1;
  assertAuthorityRejected(
    builderInput("before_message_delivery", {
      observation: { ...baseObservation("before_message_delivery"), outbound: sparse }
    })
  );
  assertAuthorityRejected(
    builderInput("before_message_delivery", {
      observation: { ...baseObservation("before_message_delivery"), outbound: Number.NaN }
    })
  );
  assertAuthorityRejected(
    builderInput("before_message_delivery", {
      observation: { ...baseObservation("before_message_delivery"), outbound: new Uint8Array([1, 2]) }
    })
  );
});

test("REQ-SBX-GENERAL-004 P3-T2 rejects accessor/prototype fields and preserves exact profile", () => {
  const observation = baseObservation("before_agent_run");
  Object.defineProperty(observation, "prompt", {
    enumerable: true,
    get: () => PROMPT
  });
  assertAuthorityRejected({
    observation,
    policy_profile_id: PROFILE,
    issued_request_id: issuedRequestId()
  });

  assertAuthorityRejected({
    ...builderInput("before_agent_run"),
    policy_profile_id: "sandbox-security-strict.v1",
    observation: Object.assign(Object.create(null), baseObservation("before_agent_run"))
  });
});

void (null as unknown as SandboxSecurityJsonValue);
