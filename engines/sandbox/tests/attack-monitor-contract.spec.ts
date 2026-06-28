import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  TRACK1_MONITOR_SCHEMA_VERSION,
  Track1MonitorError,
  MONITOR_FAIL_CLOSED_PROPOSAL,
  normalizeMonitorSessionContext,
  normalizeMonitorModelRequest,
  normalizeMonitorModelResponse,
  normalizeMonitorDecisionProposal,
  normalizeMonitorRuntimePorts,
  normalizeMonitorToolResult,
  normalizeMonitorToolResultPayload,
  sha256MonitorValue,
  canonicalizeMonitorValue,
  createFrozenMonitorSnapshot,
  createToolArgumentsRef,
  createToolTargetRef,
  createToolResultRef,
  containsMonitorSensitiveValue,
  isSafeReference,
  isCorrelationId
} from "../src/monitoring/index.ts";

// -- Step 1: Module existence and export surface ---------------------------

const MONITORING_DIR = resolve(import.meta.dirname, "..", "src", "monitoring");
const CONTRACT_PATH = resolve(MONITORING_DIR, "contract.ts");
const BOUNDARY_PATH = resolve(MONITORING_DIR, "content-boundary.ts");
const INDEX_PATH = resolve(MONITORING_DIR, "index.ts");

test("monitoring module files exist", () => {
  assert.ok(existsSync(CONTRACT_PATH), "contract.ts should exist");
  assert.ok(existsSync(BOUNDARY_PATH), "content-boundary.ts should exist");
  assert.ok(existsSync(INDEX_PATH), "index.ts should exist");
});

test("monitoring index exports required symbols", () => {
  // All imports above work = exports exist
  assert.equal(typeof TRACK1_MONITOR_SCHEMA_VERSION, "string");
  assert.ok(MONITOR_FAIL_CLOSED_PROPOSAL);
  assert.ok(Track1MonitorError);
  assert.equal(typeof normalizeMonitorSessionContext, "function");
  assert.equal(typeof normalizeMonitorModelRequest, "function");
  assert.equal(typeof normalizeMonitorModelResponse, "function");
  assert.equal(typeof normalizeMonitorDecisionProposal, "function");
  assert.equal(typeof normalizeMonitorRuntimePorts, "function");
  assert.equal(typeof normalizeMonitorToolResult, "function");
  assert.equal(typeof normalizeMonitorToolResultPayload, "function");
  assert.equal(typeof sha256MonitorValue, "function");
  assert.equal(typeof canonicalizeMonitorValue, "function");
  assert.equal(typeof createFrozenMonitorSnapshot, "function");
  assert.equal(typeof createToolArgumentsRef, "function");
  assert.equal(typeof createToolTargetRef, "function");
  assert.equal(typeof createToolResultRef, "function");
  assert.equal(typeof containsMonitorSensitiveValue, "function");
  assert.equal(typeof isSafeReference, "function");
  assert.equal(typeof isCorrelationId, "function");
});

// -- Step 2: Track1MonitorError stable errors ------------------------------

test("Track1MonitorError has stable code and fixed message", () => {
  const err = new Track1MonitorError("monitor_context_invalid");
  assert.equal(err.code, "monitor_context_invalid");
  assert.equal(err.message, "Monitor context is invalid");
  assert.ok(err instanceof Error);
  assert.equal(err.name, "Track1MonitorError");

  // All error codes produce fixed messages with no interpolation
  const codes: Array<"monitor_context_invalid" | "monitor_model_request_invalid" | "monitor_model_response_invalid" | "monitor_tool_request_invalid" | "monitor_decision_invalid" | "monitor_model_failed" | "monitor_tool_failed" | "monitor_state_invalid" | "monitor_session_empty" | "monitor_result_invalid"> = [
    "monitor_context_invalid",
    "monitor_model_request_invalid",
    "monitor_model_response_invalid",
    "monitor_tool_request_invalid",
    "monitor_decision_invalid",
    "monitor_model_failed",
    "monitor_tool_failed",
    "monitor_state_invalid",
    "monitor_session_empty",
    "monitor_result_invalid"
  ];
  for (const code of codes) {
    const e = new Track1MonitorError(code);
    assert.equal(e.code, code);
    assert.ok(typeof e.message === "string" && e.message.length > 0);
    // Message must not contain code as a substring in a way that suggests interpolation
    assert.ok(!e.message.includes("undefined") && !e.message.includes("null"));
  }
});

// -- Step 2: MONITOR_FAIL_CLOSED_PROPOSAL -----------------------------------

test("MONITOR_FAIL_CLOSED_PROPOSAL is frozen deny", () => {
  assert.equal(MONITOR_FAIL_CLOSED_PROPOSAL.action, "deny");
  assert.equal(MONITOR_FAIL_CLOSED_PROPOSAL.policy_id, "policy://track1/monitor-fail-closed");
  assert.equal(MONITOR_FAIL_CLOSED_PROPOSAL.reason_code, "decision_provider_failed");
  assert.ok(Object.isFrozen(MONITOR_FAIL_CLOSED_PROPOSAL));
  assert.throws(() => {
    (MONITOR_FAIL_CLOSED_PROPOSAL as Record<string, unknown>).action = "allow";
  });
});

// -- Step 3: Session context normalizer table tests ------------------------

// Valid fixture
const VALID_CONTEXT = {
  task_id: "task-001",
  session_id: "session-001",
  model_ref: "model://test/gpt-4"
};

const VALID_CONTEXT_WITH_SCENARIO = {
  ...VALID_CONTEXT,
  scenario_id: "T1-SC-001"
};

const VALID_CONTEXT_FULL = {
  ...VALID_CONTEXT_WITH_SCENARIO,
  case_id: "T1-SC-001-C001"
};

test("normalizeMonitorSessionContext accepts valid shapes", () => {
  assert.ok(normalizeMonitorSessionContext(VALID_CONTEXT));
  assert.ok(normalizeMonitorSessionContext(VALID_CONTEXT_WITH_SCENARIO));
  assert.ok(normalizeMonitorSessionContext(VALID_CONTEXT_FULL));
});

test("normalizeMonitorSessionContext rejects malformed inputs", () => {
  // Non-object
  assert.equal(normalizeMonitorSessionContext(null), null);
  assert.equal(normalizeMonitorSessionContext(undefined), null);
  assert.equal(normalizeMonitorSessionContext("string"), null);
  assert.equal(normalizeMonitorSessionContext([]), null);

  // Missing required fields
  assert.equal(normalizeMonitorSessionContext({}), null);
  assert.equal(normalizeMonitorSessionContext({ task_id: "x" }), null);

  // Extra keys
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, extra: "field" }), null);

  // Blank task_id
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, task_id: "" }), null);
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, task_id: "  " }), null);

  // Blank session_id
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, session_id: "" }), null);

  // Unsafe model_ref
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, model_ref: "not a uri" }), null);
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, model_ref: "http://test?q=1" }), null);
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, model_ref: "http://test#frag" }), null);

  // Invalid ID characters
  assert.equal(normalizeMonitorSessionContext({ ...VALID_CONTEXT, task_id: "task 001" }), null);

  // case_id without scenario_id
  assert.equal(normalizeMonitorSessionContext({
    task_id: "task-001",
    session_id: "session-001",
    model_ref: "model://test/gpt",
    case_id: "T1-SC-001-C001"
  }), null);

  // Mismatched case_id prefix
  assert.equal(normalizeMonitorSessionContext({
    ...VALID_CONTEXT_WITH_SCENARIO,
    case_id: "T1-SC-002-C001"
  }), null);

  // Invalid case_id format
  assert.equal(normalizeMonitorSessionContext({
    ...VALID_CONTEXT_WITH_SCENARIO,
    case_id: "bad-case"
  }), null);

  // Invalid scenario_id format
  assert.equal(normalizeMonitorSessionContext({
    ...VALID_CONTEXT,
    scenario_id: "bad"
  }), null);
});

test("normalizeMonitorSessionContext returns defensive copy", () => {
  const input = { ...VALID_CONTEXT };
  const result = normalizeMonitorSessionContext(input);
  assert.ok(result);
  // Mutating input should not affect result
  input.task_id = "changed";
  assert.notEqual(result!.task_id, "changed");
  // Mutating result should not affect input
  (result as Record<string, unknown>).task_id = "changed2";
  assert.notEqual(VALID_CONTEXT.task_id, "changed2");
});

// -- Step 3: Model request/response normalizer tests -----------------------

test("normalizeMonitorModelRequest accepts valid input", () => {
  const result = normalizeMonitorModelRequest({
    content: "Hello",
    content_ref: "ref://test/input"
  });
  assert.ok(result);
  assert.equal(result!.content, "Hello");
  assert.equal(result!.content_ref, "ref://test/input");
});

test("normalizeMonitorModelRequest rejects malformed", () => {
  assert.equal(normalizeMonitorModelRequest(null), null);
  assert.equal(normalizeMonitorModelRequest({}), null);
  assert.equal(normalizeMonitorModelRequest({ content: "x" }), null);
  assert.equal(normalizeMonitorModelRequest({ content_ref: "ref://x" }), null);
  // Extra key
  assert.equal(normalizeMonitorModelRequest({
    content: "x",
    content_ref: "ref://x",
    extra: true
  }), null);
  // Blank content
  assert.equal(normalizeMonitorModelRequest({
    content: "",
    content_ref: "ref://x"
  }), null);
  // Unsafe ref
  assert.equal(normalizeMonitorModelRequest({
    content: "x",
    content_ref: "not a ref"
  }), null);
});

test("normalizeMonitorModelResponse accepts valid input", () => {
  const result = normalizeMonitorModelResponse({
    content: "Response text",
    content_ref: "ref://test/output"
  });
  assert.ok(result);
  assert.equal(result!.content, "Response text");
});

test("normalizeMonitorModelResponse rejects malformed", () => {
  assert.equal(normalizeMonitorModelResponse(null), null);
  assert.equal(normalizeMonitorModelResponse({ content: "x" }), null);
  assert.equal(normalizeMonitorModelResponse({
    content: "",
    content_ref: "ref://x"
  }), null);
  assert.equal(normalizeMonitorModelResponse({
    content: "x",
    content_ref: "bad ref"
  }), null);
});

// -- Step 3: Decision proposal normalizer tests ----------------------------

test("normalizeMonitorDecisionProposal accepts valid proposals", () => {
  const result = normalizeMonitorDecisionProposal({
    policy_id: "policy://test/my-policy",
    action: "allow",
    reason_code: "ok_reason",
    reason: "Everything looks fine",
    evidence_refs: ["evidence://test/ev1"]
  });
  assert.ok(result);
  assert.equal(result!.action, "allow");
  assert.equal(result!.evidence_refs.length, 1);
});

test("normalizeMonitorDecisionProposal rejects malformed", () => {
  // Non-object
  assert.equal(normalizeMonitorDecisionProposal(null), null);
  assert.equal(normalizeMonitorDecisionProposal("string"), null);

  // Missing keys
  assert.equal(normalizeMonitorDecisionProposal({}), null);
  assert.equal(normalizeMonitorDecisionProposal({ policy_id: "x" }), null);

  // Extra keys
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["evidence://test/e"],
    extra: true
  }), null);

  // Unsupported action
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "unknown",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["evidence://test/e"]
  }), null);

  // Blank fields
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["evidence://test/e"]
  }), null);

  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "",
    reason: "ok",
    evidence_refs: ["evidence://test/e"]
  }), null);

  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "ok",
    reason: "",
    evidence_refs: ["evidence://test/e"]
  }), null);

  // Empty evidence array
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: []
  }), null);

  // Duplicate evidence
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["evidence://test/e", "evidence://test/e"]
  }), null);

  // Unsafe evidence reference
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "policy://test/p",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["not a safe ref"]
  }), null);

  // Unsafe policy_id
  assert.equal(normalizeMonitorDecisionProposal({
    policy_id: "not a safe ref",
    action: "allow",
    reason_code: "ok",
    reason: "ok",
    evidence_refs: ["evidence://test/e"]
  }), null);
});

test("normalizeMonitorDecisionProposal returns defensive copy", () => {
  const input = {
    policy_id: "policy://test/p",
    action: "deny" as const,
    reason_code: "blocked",
    reason: "Blocked for safety",
    evidence_refs: ["evidence://test/e1", "evidence://test/e2"]
  };
  const result = normalizeMonitorDecisionProposal(input);
  assert.ok(result);
  input.evidence_refs[0] = "changed";
  assert.notEqual(result!.evidence_refs[0], "changed");
  result!.evidence_refs.push("new");
  assert.equal(input.evidence_refs.length, 2);
});

// -- Step 3: Runtime ports normalizer ---------------------------------------

test("normalizeMonitorRuntimePorts accepts valid ports", () => {
  const ports = {
    now: () => new Date().toISOString(),
    nextId: (kind: string) => `${kind}-1`
  };
  const result = normalizeMonitorRuntimePorts(ports);
  assert.ok(result);
  assert.equal(typeof result!.now, "function");
  assert.equal(typeof result!.nextId, "function");
});

test("normalizeMonitorRuntimePorts rejects malformed", () => {
  assert.equal(normalizeMonitorRuntimePorts(null), null);
  assert.equal(normalizeMonitorRuntimePorts({}), null);
  assert.equal(normalizeMonitorRuntimePorts({ now: "not a function", nextId: () => "x" }), null);
  assert.equal(normalizeMonitorRuntimePorts({ now: () => "x" }), null);
  assert.equal(normalizeMonitorRuntimePorts({ now: () => "x", nextId: "not a function" }), null);
  // Extra key
  assert.equal(normalizeMonitorRuntimePorts({
    now: () => "x",
    nextId: () => "x",
    extra: true
  }), null);
});

// -- Step 4: Canonical hashing tests ---------------------------------------

test("sha256MonitorValue produces 64-char hex", () => {
  const hash = sha256MonitorValue("hello");
  assert.equal(hash.length, 64);
  assert.ok(/^[a-f0-9]{64}$/.test(hash));
});

test("sha256MonitorValue is deterministic", () => {
  const a = sha256MonitorValue("test value");
  const b = sha256MonitorValue("test value");
  assert.equal(a, b);
});

test("sha256MonitorValue produces different hashes for different inputs", () => {
  const a = sha256MonitorValue("hello");
  const b = sha256MonitorValue("world");
  assert.notEqual(a, b);
});

test("canonicalizeMonitorValue sorts object keys", () => {
  const a = canonicalizeMonitorValue({ b: 1, a: 2, c: 3 });
  const b = canonicalizeMonitorValue({ c: 3, a: 2, b: 1 });
  assert.equal(a, b);
});

test("canonicalizeMonitorValue preserves array order", () => {
  const a = canonicalizeMonitorValue([1, 2, 3]);
  const b = canonicalizeMonitorValue([3, 2, 1]);
  assert.notEqual(a, b);
});

test("canonicalizeMonitorValue handles nested structures", () => {
  const a = canonicalizeMonitorValue({ outer: { inner: [1, 2], other: "x" } });
  const b = canonicalizeMonitorValue({ outer: { other: "x", inner: [1, 2] } });
  assert.equal(a, b);
});

test("canonicalizeMonitorValue rejects unsupported types", () => {
  assert.throws(() => canonicalizeMonitorValue(undefined));
  assert.throws(() => canonicalizeMonitorValue(() => {}));
  assert.throws(() => canonicalizeMonitorValue(BigInt(1)));
  assert.throws(() => canonicalizeMonitorValue(NaN));
  assert.throws(() => canonicalizeMonitorValue(Infinity));
});

test("canonicalizeMonitorValue rejects cyclic structures", () => {
  const obj: Record<string, unknown> = { a: 1 };
  obj.self = obj;
  assert.throws(() => canonicalizeMonitorValue(obj));
});

// -- Step 4: Frozen snapshot tests ------------------------------------------

test("createFrozenMonitorSnapshot deep copies", () => {
  const input = { a: 1, b: { c: [2, 3] } };
  const frozen = createFrozenMonitorSnapshot(input);

  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen((frozen as Record<string, unknown>).b));

  // Mutating input should not affect frozen
  input.a = 999;
  assert.equal((frozen as Record<string, unknown>).a, 1);
});

test("createFrozenMonitorSnapshot prevents mutation", () => {
  const input = { x: "hello" };
  const frozen = createFrozenMonitorSnapshot(input);
  assert.throws(() => {
    (frozen as Record<string, unknown>).x = "changed";
  });
});

test("createFrozenMonitorSnapshot rejects cycles", () => {
  const obj: Record<string, unknown> = { a: 1 };
  obj.self = obj;
  assert.throws(() => createFrozenMonitorSnapshot(obj));
});

test("createFrozenMonitorSnapshot handles primitives", () => {
  assert.equal(createFrozenMonitorSnapshot(42), 42);
  assert.equal(createFrozenMonitorSnapshot("hello"), "hello");
  assert.equal(createFrozenMonitorSnapshot(null), null);
  assert.equal(createFrozenMonitorSnapshot(true), true);
});

// -- Step 4: Tool reference tests -------------------------------------------

function makeToolRequest(toolName: string, args: Record<string, unknown>) {
  return {
    call_id: "call-1",
    session_id: "session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: toolName,
    arguments: args
  } as unknown as import("../src/simulated-tools/contract.ts").SimulatedToolRequest;
}

test("createToolArgumentsRef produces stable sha256 refs", () => {
  const req = makeToolRequest("write_file", { path: "/tmp/test", content: "data" });
  const ref = createToolArgumentsRef(req);
  assert.ok(ref.startsWith("sha256://"));
  const ref2 = createToolArgumentsRef(req);
  assert.equal(ref, ref2);
});

test("createToolTargetRef produces simulated-target refs", () => {
  const req = makeToolRequest("send_email", { recipient: "x@y.com", subject: "S", body: "B" });
  const ref = createToolTargetRef(req);
  assert.ok(ref.startsWith("simulated-target://send_email/"));
  assert.ok(ref.includes(sha256MonitorValue(canonicalizeMonitorValue(req.arguments))));
});

test("createToolResultRef uses call_id and canonical result", () => {
  const result = {
    call_id: "call-abc",
    tool_name: "read_file",
    status: "rejected",
    rejection_code: "target_not_allowed",
    session_id: "s1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    summary: "Rejected",
    evidence: {
      evidence_ref: "evidence://test/e",
      simulated: true,
      target_ref: "target://test",
      state_change: "none"
    }
  } as unknown as import("../src/simulated-tools/contract.ts").SimulatedToolResult;
  const ref = createToolResultRef(result);
  assert.ok(ref.startsWith("simulated-result://call-abc/"));
});

test("tool references differ for different arguments", () => {
  const req1 = makeToolRequest("write_file", { path: "a", content: "x" });
  const req2 = makeToolRequest("write_file", { path: "a", content: "y" });
  assert.notEqual(createToolArgumentsRef(req1), createToolArgumentsRef(req2));
  assert.notEqual(createToolTargetRef(req1), createToolTargetRef(req2));
});

test("tool references do not contain raw values in the ref string", () => {
  const req = makeToolRequest("write_file", { path: "secret/path", content: "secret data" });
  const ref = createToolArgumentsRef(req);
  // The ref should contain the digest but not the raw values
  assert.ok(!ref.includes("secret/path"));
  assert.ok(!ref.includes("secret data"));
});

// -- Step 4: Sensitive value scanning ---------------------------------------

test("containsMonitorSensitiveValue detects raw strings", () => {
  const sensitive = ["secret123", "private_key"];
  assert.ok(containsMonitorSensitiveValue("this has secret123 inside", sensitive));
  assert.ok(!containsMonitorSensitiveValue("all clean here", sensitive));
});

test("containsMonitorSensitiveValue scans objects recursively", () => {
  const sensitive = ["TOP_SECRET"];
  const obj = {
    a: "normal",
    b: {
      c: "contains TOP_SECRET here"
    }
  };
  assert.ok(containsMonitorSensitiveValue(obj, sensitive));
  assert.ok(!containsMonitorSensitiveValue({ a: "normal", b: { c: "clean" } }, sensitive));
});

test("containsMonitorSensitiveValue scans arrays", () => {
  const sensitive = ["SECRET"];
  assert.ok(containsMonitorSensitiveValue(["normal", "has SECRET"], sensitive));
  assert.ok(!containsMonitorSensitiveValue(["normal", "clean"], sensitive));
});

// -- Step 5: Tool result payload normalization -----------------------------

test("normalizeMonitorToolResultPayload accepts valid payload", () => {
  const payload = normalizeMonitorToolResultPayload({
    call_id: "call-1",
    tool_name: "write_file",
    status: "rejected",
    result_ref: "simulated-result://call-1/abc123",
    state_change: "none"
  });
  assert.ok(payload);
  assert.equal(payload!.status, "rejected");
  assert.equal(payload!.state_change, "none");
});

test("normalizeMonitorToolResultPayload rejects malformed", () => {
  assert.equal(normalizeMonitorToolResultPayload(null), null);
  assert.equal(normalizeMonitorToolResultPayload({}), null);
  assert.equal(normalizeMonitorToolResultPayload({
    call_id: "",
    tool_name: "write_file",
    status: "rejected",
    result_ref: "simulated-result://x/hash",
    state_change: "none"
  }), null);
  assert.equal(normalizeMonitorToolResultPayload({
    call_id: "x",
    tool_name: "unknown_tool",
    status: "rejected",
    result_ref: "simulated-result://x/hash",
    state_change: "none"
  }), null);
  assert.equal(normalizeMonitorToolResultPayload({
    call_id: "x",
    tool_name: "write_file",
    status: "invalid_status",
    result_ref: "simulated-result://x/hash",
    state_change: "none"
  }), null);
  assert.equal(normalizeMonitorToolResultPayload({
    call_id: "x",
    tool_name: "write_file",
    status: "rejected",
    result_ref: "unsafe ref",
    state_change: "none"
  }), null);
  assert.equal(normalizeMonitorToolResultPayload({
    call_id: "x",
    tool_name: "write_file",
    status: "rejected",
    result_ref: "simulated-result://x/hash",
    state_change: "invalid"
  }), null);
});

// -- Step 5: Monitor tool result normalization -----------------------------

function makeExpectedRequest(toolName: string) {
  return {
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: toolName,
    arguments: {}
  } as import("../src/simulated-tools/contract.ts").SimulatedToolRequest;
}

test("normalizeMonitorToolResult validates correlation match", () => {
  const expected = makeExpectedRequest("write_file");
  // Mismatched call_id
  const result = normalizeMonitorToolResult({
    call_id: "different-call",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "write_file",
    status: "rejected",
    rejection_code: "target_not_allowed",
    summary: "Rejected",
    evidence: {
      evidence_ref: "simulated-tool://different-call",
      simulated: true,
      target_ref: "target://test",
      state_change: "none"
    }
  }, expected);
  assert.equal(result, null);
});

test("normalizeMonitorToolResult validates successful send_email", () => {
  const expected = makeExpectedRequest("send_email");
  const result = normalizeMonitorToolResult({
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "send_email",
    status: "simulated_success",
    summary: "Sent",
    output: {
      message_id: "msg-1",
      recipient: "x@y.com",
      subject: "Test"
    },
    evidence: {
      evidence_ref: "simulated-tool://mon-call-1",
      simulated: true,
      target_ref: "target://test",
      state_change: "outbox_append"
    }
  }, expected);
  assert.ok(result);
  assert.equal(result!.status, "simulated_success");
});

test("normalizeMonitorToolResult validates successful read_file (deep copy)", () => {
  const expected = makeExpectedRequest("read_file");
  const input = {
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "read_file",
    status: "simulated_success",
    summary: "Read OK",
    output: {
      path: "/tmp/test.txt",
      content: "file contents here"
    },
    evidence: {
      evidence_ref: "simulated-tool://mon-call-1",
      simulated: true,
      target_ref: "target://test",
      state_change: "none"
    }
  };
  const result = normalizeMonitorToolResult(input, expected);
  assert.ok(result);
  // Mutate input output, result should be untouched
  if (result && "output" in result) {
    input.output.content = "MUTATED";
    assert.notEqual((result as Record<string, unknown>).output?.content, "MUTATED");
  }
});

test("normalizeMonitorToolResult rejects missing evidence fields", () => {
  const expected = makeExpectedRequest("write_file");
  assert.equal(normalizeMonitorToolResult({
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "write_file",
    status: "rejected",
    rejection_code: "target_not_allowed",
    summary: "Nope",
    evidence: {
      // Missing simulated field
      evidence_ref: "simulated-tool://mon-call-1",
      target_ref: "target://test",
      state_change: "none"
    }
  }, expected), null);
});

test("normalizeMonitorToolResult validates rejection codes", () => {
  const expected = makeExpectedRequest("call_api");
  // Invalid rejection code
  assert.equal(normalizeMonitorToolResult({
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "call_api",
    status: "rejected",
    rejection_code: "invalid_code",
    summary: "Bad",
    evidence: {
      evidence_ref: "simulated-tool://mon-call-1",
      simulated: true,
      target_ref: "target://test",
      state_change: "none"
    }
  }, expected), null);

  // Valid rejection code
  assert.ok(normalizeMonitorToolResult({
    call_id: "mon-call-1",
    session_id: "mon-session-1",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "call_api",
    status: "rejected",
    rejection_code: "resource_not_found",
    summary: "Not found",
    evidence: {
      evidence_ref: "simulated-tool://mon-call-1",
      simulated: true,
      target_ref: "target://test",
      state_change: "none"
    }
  }, expected), null);
});

// -- Step 5: Unsafe reference patterns --------------------------------------

test("isSafeReference rejects whitespace and control chars", () => {
  assert.ok(!isSafeReference("http://test/path with spaces"));
  assert.ok(!isSafeReference("http://test/path\nnewline"));
  assert.ok(!isSafeReference("http://test/path?query=1"));
  assert.ok(!isSafeReference("http://test/path#fragment"));
  assert.ok(!isSafeReference("not a uri"));
  assert.ok(!isSafeReference(""));
  assert.ok(isSafeReference("model://test/gpt-4"));
  assert.ok(isSafeReference("policy://track1/my-policy"));
  assert.ok(isSafeReference("evidence://test/ev1"));
  assert.ok(isSafeReference("sha256://abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));
});

test("isCorrelationId validates the pattern", () => {
  assert.ok(isCorrelationId("task-001"));
  assert.ok(isCorrelationId("session_1"));
  assert.ok(isCorrelationId("a.b:c-d_0"));
  assert.ok(!isCorrelationId(""));
  assert.ok(!isCorrelationId("has spaces"));
  assert.ok(!isCorrelationId("x".repeat(129)));  // too long
  assert.ok(!isCorrelationId("-starts-with-dash"));
});
