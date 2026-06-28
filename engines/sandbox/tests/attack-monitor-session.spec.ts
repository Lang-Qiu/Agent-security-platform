import assert from "node:assert/strict";
import test from "node:test";
import {
  MonitoredSession,
  Track1MonitorError,
  TRACK1_MONITOR_SCHEMA_VERSION,
  MONITOR_FAIL_CLOSED_PROPOSAL,
  buildMonitorResult
} from "../src/monitoring/index.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorDecisionProvider,
  MonitorDecisionProposal,
  MonitorModelNext,
  MonitorModelRequest,
  MonitorModelResponse,
  MonitoredModelOutcome,
  MonitorToolNext,
  MonitorToolDecisionContext
} from "../src/monitoring/index.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";
import { normalizeBaseResult } from "../../../shared/contracts/result.ts";
import { SimulatedToolExecutor } from "../src/simulated-tools/executor.ts";
import { InMemorySimulatedToolState } from "../src/simulated-tools/state.ts";
import type { SimulatedToolRequest, SimulatedToolResult } from "../src/simulated-tools/contract.ts";
import { normalizeSimulatedToolRequest } from "../src/simulated-tools/contract.ts";

// -- deterministic test ports -----------------------------------------------

let _idCounter = 0;
let _timeCounter = 0;

function createTestPorts(): MonitorRuntimePorts {
  _idCounter = 0;
  _timeCounter = 0;
  return {
    now() {
      return new Date(Date.UTC(2026, 5, 28, 0, 0, 0) + _timeCounter * 1000).toISOString();
    },
    nextId(kind: string) {
      _idCounter += 1;
      return `${kind}:test:${String(_idCounter).padStart(3, "0")}`;
    }
  };
}

// -- test helpers -----------------------------------------------------------

function makeContext(overrides?: Partial<MonitorSessionContext>): MonitorSessionContext {
  return {
    task_id: "task-test-001",
    session_id: "session-test-001",
    model_ref: "model://test/gpt-4",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    ...overrides
  };
}

function allowProvider(): MonitorDecisionProvider {
  return {
    decide(_input) {
      return {
        policy_id: "policy://test/allow-all",
        action: "allow",
        reason_code: "test_allow",
        reason: "Test allow everything",
        evidence_refs: ["evidence://test/allow"]
      };
    }
  };
}

function actionProvider(action: MonitorDecisionProposal["action"]): MonitorDecisionProvider {
  return {
    decide(_input) {
      return {
        policy_id: `policy://test/${action}`,
        action,
        reason_code: `test_${action}`,
        reason: `Test ${action} action`,
        evidence_refs: [`evidence://test/${action}`]
      };
    }
  };
}

function modelNext(response: string): MonitorModelNext {
  return (request: MonitorModelRequest): MonitorModelResponse => {
    return {
      content: response,
      content_ref: `ref://model/response/${request.content_ref}`
    };
  };
}

function makeModelRequest(content?: string): MonitorModelRequest {
  return {
    content: content ?? "Hello, what can you do?",
    content_ref: "ref://test/input-1"
  };
}

// -- Step 1: MonitoredSession export and construction RED ------------------

test("MonitoredSession is exported and constructable", () => {
  assert.ok(MonitoredSession, "MonitoredSession should be exported");
  assert.equal(typeof MonitoredSession, "function", "MonitoredSession should be a class/function");
});

test("MonitoredSession construction rejects malformed context", () => {
  assert.throws(
    () => new MonitoredSession(null as unknown as MonitorSessionContext, allowProvider()),
    Track1MonitorError
  );
  assert.throws(
    () => new MonitoredSession({} as MonitorSessionContext, allowProvider()),
    Track1MonitorError
  );
});

test("MonitoredSession construction rejects invalid provider", () => {
  assert.throws(
    () => new MonitoredSession(makeContext(), null as unknown as MonitorDecisionProvider),
    Track1MonitorError
  );
  assert.throws(
    () => new MonitoredSession(makeContext(), {} as MonitorDecisionProvider),
    Track1MonitorError
  );
  // Non-callable decide
  assert.throws(
    () => new MonitoredSession(makeContext(), { decide: "not a function" } as unknown as MonitorDecisionProvider),
    Track1MonitorError
  );
});

test("MonitoredSession construction rejects invalid runtime ports", () => {
  assert.throws(
    () => new MonitoredSession(makeContext(), allowProvider(), {} as MonitorRuntimePorts),
    Track1MonitorError
  );
});

// -- Step 1: Model allow-path RED tests -------------------------------------

test("invokeModel calls next exactly once with normalized request", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  let callCount = 0;
  let receivedRequest: MonitorModelRequest | null = null;

  const next: MonitorModelNext = (req) => {
    callCount += 1;
    receivedRequest = req;
    return { content: "I can help!", content_ref: "ref://model/output-1" };
  };

  await session.invokeModel(makeModelRequest(), next);
  assert.equal(callCount, 1);
  assert.ok(receivedRequest);
  assert.equal(receivedRequest!.content, "Hello, what can you do?");
});

test("invokeModel with allow action returns can_continue=true", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.ok(outcome);
  assert.equal(outcome.can_continue, true);
  assert.equal(outcome.decision.action, "allow");
  assert.equal(outcome.response.content, "OK");
});

test("invokeModel allow path finalize produces correct events", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest("Test prompt"), modelNext("Test response"));

  const result = session.finalize();
  assert.ok(result);
  const details = result.details as SandboxRunResultDetails;

  // Event order: model_input, model_output, policy_decision
  assert.ok(details.events);
  assert.equal(details.events!.length, 3);
  assert.equal(details.events![0].event_type, "model_input");
  assert.equal(details.events![1].event_type, "model_output");
  assert.equal(details.events![2].event_type, "policy_decision");

  // Sources
  assert.equal(details.events![0].source, "agent");
  assert.equal(details.events![1].source, "model");
  assert.equal(details.events![2].source, "policy");

  // Decision targets model_output
  const decision = details.policy_decisions![0];
  assert.equal(decision.subject_event_id, details.events![1].event_id);

  // Event payloads contain content refs and SHA-256 but not raw content
  const modelInputPayload = details.events![0].payload as Record<string, unknown>;
  assert.ok(modelInputPayload.content_ref);
  assert.ok(modelInputPayload.content_sha256);
  assert.equal(typeof modelInputPayload.content_sha256, "string");
  assert.equal((modelInputPayload.content_sha256 as string).length, 64);
  assert.ok(!("content" in (details.events![0] as Record<string, unknown>)));

  // Summaries are fixed
  assert.equal(modelInputPayload.summary, undefined);

  // result passes normalizeBaseResult
  const recheck = normalizeBaseResult(result);
  assert.ok(recheck);
});

test("invokeModel allow finalize result metadata contains monitor info", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const metadata = result.metadata as Record<string, unknown>;
  assert.ok(metadata);
  assert.ok(metadata.monitor);
  const monitor = metadata.monitor as Record<string, unknown>;
  assert.equal(monitor.schema_version, TRACK1_MONITOR_SCHEMA_VERSION);
  assert.equal(monitor.model_call_count, 1);
  assert.equal(monitor.tool_call_count, 0);
  assert.equal(monitor.decision_count, 1);
  assert.equal(monitor.executed_tool_count, 0);
  assert.equal(monitor.intercepted_tool_count, 0);
  assert.equal(monitor.provider_failure_count, 0);
});

// -- Step 3: All model actions table test -----------------------------------

test("invokeModel alert action: can_continue=true, 1 alert, open", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("alert"), createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("Response"));
  assert.equal(outcome.can_continue, true);
  assert.equal(outcome.decision.action, "alert");
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.alerts!.length, 1);
  assert.equal(details.blocked_records!.length, 0);
  assert.equal(details.blocked, false);
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "high");
  // Alert shares subject and decision
  assert.equal(details.alerts![0].subject_event_id, details.policy_decisions![0].subject_event_id);
  assert.equal(details.alerts![0].decision_id, details.policy_decisions![0].decision_id);
});

test("invokeModel ask action: can_continue=false, sealed, no blocked", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("ask"), createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("Response"));
  assert.equal(outcome.can_continue, false);
  assert.equal(outcome.decision.action, "ask");
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.alerts!.length, 0);
  assert.equal(details.blocked_records!.length, 0);
  assert.equal(details.blocked, false);
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "medium");
});

test("invokeModel deny action: can_continue=false, sealed, 1 blocked", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("deny"), createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("Response"));
  assert.equal(outcome.can_continue, false);
  assert.equal(outcome.decision.action, "deny");
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.alerts!.length, 0);
  assert.equal(details.blocked_records!.length, 1);
  assert.equal(details.blocked, true);
  assert.equal(result.status, "blocked");
  assert.equal(result.risk_level, "high");
  // Blocked record shares subject and decision
  assert.equal(details.blocked_records![0].subject_event_id, details.policy_decisions![0].subject_event_id);
  assert.equal(details.blocked_records![0].decision_id, details.policy_decisions![0].decision_id);
});

// -- Step 4: Provider failure tests ----------------------------------------

test("invokeModel provider sync throw: fail-closed deny, sealed", async () => {
  const throwingProvider: MonitorDecisionProvider = {
    decide() { throw new Error("provider crash"); }
  };
  const session = new MonitoredSession(makeContext(), throwingProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.can_continue, false);
  assert.equal(outcome.decision.action, "deny");
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
  const result = session.finalize();
  const metadata = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;
  assert.equal(metadata.provider_failure_count, 1);
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.blocked_records!.length, 1);
  // No raw exception in result
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("provider crash"));
});

test("invokeModel provider rejected promise: fail-closed deny", async () => {
  const rejectingProvider: MonitorDecisionProvider = {
    decide() { return Promise.reject(new Error("provider rejected")); }
  };
  const session = new MonitoredSession(makeContext(), rejectingProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.decision.action, "deny");
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
  const result = session.finalize();
  assert.ok(!JSON.stringify(result).includes("provider rejected"));
});

test("invokeModel provider returns non-object: fail-closed", async () => {
  const badProvider: MonitorDecisionProvider = {
    decide() { return "not an object" as unknown as MonitorDecisionProposal; }
  };
  const session = new MonitoredSession(makeContext(), badProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
});

test("invokeModel provider returns extra key: fail-closed", async () => {
  const badProvider: MonitorDecisionProvider = {
    decide() {
      return {
        policy_id: "policy://test/x",
        action: "allow",
        reason_code: "ok",
        reason: "ok",
        evidence_refs: ["evidence://test/x"],
        extra_unknown: true
      } as unknown as MonitorDecisionProposal;
    }
  };
  const session = new MonitoredSession(makeContext(), badProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
});

test("invokeModel provider returns blank fields: fail-closed", async () => {
  const badProvider: MonitorDecisionProvider = {
    decide() {
      return {
        policy_id: "",
        action: "allow",
        reason_code: "ok",
        reason: "ok",
        evidence_refs: ["evidence://test/x"]
      } as MonitorDecisionProposal;
    }
  };
  const session = new MonitoredSession(makeContext(), badProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
});

test("invokeModel provider returns unsupported action: fail-closed", async () => {
  const badProvider: MonitorDecisionProvider = {
    decide() {
      return {
        policy_id: "policy://test/x",
        action: "unknown_action",
        reason_code: "ok",
        reason: "ok",
        evidence_refs: ["evidence://test/x"]
      } as unknown as MonitorDecisionProposal;
    }
  };
  const session = new MonitoredSession(makeContext(), badProvider, createTestPorts());
  const outcome = await session.invokeModel(makeModelRequest(), modelNext("OK"));
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
});

test("invokeModel provider reason contains model content: fail-closed", async () => {
  const sentinel = "UNIQUE_SENTINEL_ABC123_MODEL_CONTENT";
  const leakyProvider: MonitorDecisionProvider = {
    decide(input) {
      return {
        policy_id: "policy://test/x",
        action: "allow",
        reason_code: "ok",
        reason: `Leaked: ${input.model_output.content}`,
        evidence_refs: ["evidence://test/x"]
      };
    }
  };
  const session = new MonitoredSession(makeContext(), leakyProvider, createTestPorts());
  const outcome = await session.invokeModel(
    makeModelRequest(sentinel),
    modelNext(sentinel)
  );
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
  const result = session.finalize();
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

// -- Step 5: Callback, concurrency, and state tests ------------------------

test("invokeModel malformed request raises monitor_model_request_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await assert.rejects(
    () => session.invokeModel(null, modelNext("OK")),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_model_request_invalid");
      return true;
    }
  );
  // Malformed request does not emit events
  assert.throws(() => session.finalize(), Track1MonitorError); // still empty
});

test("invokeModel non-function callback raises monitor_model_failed", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), null as unknown as MonitorModelNext),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_model_failed");
      return true;
    }
  );
});

test("invokeModel callback rejects: sealed, no raw error in result", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const sentinel = "CALLBACK_CRASH_SECRET_XYZ";
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), () => { throw new Error(sentinel); }),
    Track1MonitorError
  );
  // Session is sealed but has one model input event
  const result = session.finalize();
  assert.ok(!JSON.stringify(result).includes(sentinel));
  assert.equal(result.status, "failed");
  assert.equal(result.risk_level, "high");
});

test("invokeModel malformed callback response seals session", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const badNext: MonitorModelNext = () => ({ content: "", content_ref: "not a ref" } as MonitorModelResponse);
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), badNext),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_model_response_invalid");
      return true;
    }
  );
});

test("invokeModel concurrent call rejected", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  // Start first call but don't await it yet
  let resolveFirst: (v: MonitorModelResponse) => void;
  const slowNext: MonitorModelNext = () => new Promise((resolve) => { resolveFirst = resolve; });

  const firstCall = session.invokeModel(makeModelRequest(), slowNext);
  // Second call should fail while first is pending
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), modelNext("OK")),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
  // Complete the first call
  resolveFirst!({ content: "done", content_ref: "ref://test/done" });
  await firstCall;
  // First call produced events
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.events!.length, 3);
});

test("invokeModel after ask seals rejects with monitor_state_invalid", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("ask"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), modelNext("OK2")),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
});

test("invokeModel after deny rejects with monitor_state_invalid", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("deny"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), modelNext("OK2")),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
});

test("two sequential allow model calls preserve order and increment counters", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest("First"), modelNext("Response 1"));
  await session.invokeModel(makeModelRequest("Second"), modelNext("Response 2"));
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  // 2 model_input, 2 model_output, 2 policy_decision = 6 events
  assert.equal(details.events!.length, 6);
  // Sequences increase strictly
  const seqs = details.events!.map((e) => e.sequence);
  for (let i = 1; i < seqs.length; i++) {
    assert.ok(seqs[i] > seqs[i - 1]);
  }
  // Metadata counters
  const monitor = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;
  assert.equal(monitor.model_call_count, 2);
  assert.equal(monitor.decision_count, 2);
});

// -- Step 6: Model-only finalization tests ---------------------------------

test("finalize empty session throws monitor_session_empty", () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  assert.throws(() => session.finalize(), (err: unknown) => {
    assert.ok(err instanceof Track1MonitorError);
    assert.equal((err as Track1MonitorError).code, "monitor_session_empty");
    return true;
  });
});

test("finalize result passes normalizeBaseResult", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const recheck = normalizeBaseResult(result);
  assert.ok(recheck);
  assert.deepEqual(result, recheck);
});

test("finalize is idempotent (same object identity)", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const first = session.finalize();
  const second = session.finalize();
  assert.strictEqual(first, second);
});

test("finalize while pending raises monitor_state_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  // Start a slow model call that we control
  let resolveSlow: (v: MonitorModelResponse) => void;
  const slowNext: MonitorModelNext = () =>
    new Promise((resolve) => { resolveSlow = resolve; });

  const callPromise = session.invokeModel(makeModelRequest(), slowNext);
  // finalize immediately while the call is still pending
  assert.throws(
    () => session.finalize(),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
  // Complete the pending call
  resolveSlow!({ content: "Done", content_ref: "ref://test/done" });
  await callPromise;
});

test("post-finalize operations raise monitor_state_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  session.finalize();
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), modelNext("OK2")),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
});

test("default runtime ports produce normalized result", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const recheck = normalizeBaseResult(result);
  assert.ok(recheck);
});

test("allow-only session produces finished/info", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "info");
});

test("blocked field equals blocked_records.length > 0", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("deny"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.blocked, details.blocked_records!.length > 0);
  assert.equal(details.blocked, true);
});

test("finalize result details contain all four arrays", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("alert"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.ok(Array.isArray(details.events));
  assert.ok(Array.isArray(details.policy_decisions));
  assert.ok(Array.isArray(details.alerts));
  assert.ok(Array.isArray(details.blocked_records));
});

test("event_count equals events.length", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.event_count, details.events!.length);
});

// -- Step 7: Raw-content boundary tests ------------------------------------

test("raw model input content is absent from session serialization", async () => {
  const sentinel = "RAW_INPUT_SECRET_UNIQUE_789";
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(sentinel), modelNext("Safe response"));
  const result = session.finalize();
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(sentinel));
});

test("raw model output content is absent from session serialization", async () => {
  const sentinel = "RAW_OUTPUT_SECRET_UNIQUE_456";
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest("Safe prompt"), modelNext(sentinel));
  const result = session.finalize();
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(sentinel));
});

test("mutating caller request after invokeModel does not change safe hashes", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const mutableRequest = { content: "Original prompt", content_ref: "ref://test/original" };
  await session.invokeModel(mutableRequest, modelNext("OK"));
  // Mutate caller request
  mutableRequest.content = "MUTATED_AFTER_CALL";
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  const inputEvent = details.events![0];
  const payload = inputEvent.payload as Record<string, unknown>;
  const hash = payload.content_sha256 as string;
  // Hash should correspond to original content, not mutated
  const { sha256MonitorValue } = await import("../src/monitoring/content-boundary.ts");
  assert.equal(hash, sha256MonitorValue("Original prompt"));
  assert.notEqual(hash, sha256MonitorValue("MUTATED_AFTER_CALL"));
});

// ==========================================================================
// Task 3: Tool execution gate tests
// ==========================================================================

// -- tool test helpers ------------------------------------------------------

function makeToolRequest(): SimulatedToolRequest {
  return normalizeSimulatedToolRequest({
    call_id: "tool-call-test-001",
    session_id: "session-test-001",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "write_file",
    arguments: { path: "sandbox://fixtures/test.txt", content: "test content" }
  }) as SimulatedToolRequest;
}

function makeToolContext(
  inputRef?: string,
  outputRef?: string,
  inputContent?: string,
  outputContent?: string
): MonitorToolDecisionContext {
  return {
    model_input: {
      content: inputContent ?? "Write to file",
      content_ref: inputRef ?? "ref://test/model-input"
    },
    model_output: {
      content: outputContent ?? "Writing file...",
      content_ref: outputRef ?? "ref://test/model-output"
    }
  };
}

function createExecutor(state?: InMemorySimulatedToolState): SimulatedToolExecutor {
  return new SimulatedToolExecutor(state ?? new InMemorySimulatedToolState());
}

// Provider that checks the stage
function stageAwareProvider(): MonitorDecisionProvider {
  return {
    decide(input) {
      const action: MonitorDecisionProposal["action"] =
        input.stage === "model_output" ? "allow" : "alert";
      return {
        policy_id: "policy://test/stage-aware",
        action,
        reason_code: `test_${input.stage}`,
        reason: `Test decision at ${input.stage}`,
        evidence_refs: [`evidence://test/${input.stage}`]
      };
    }
  };
}

async function doModelCall(
  session: MonitoredSession,
  prompt?: string,
  response?: string
): Promise<{ inputRef: string; outputRef: string; inputContent: string; outputContent: string }> {
  const req = makeModelRequest(prompt);
  const resp = modelNext(response ?? "OK")(req);
  await session.invokeModel(req, () => resp);
  return {
    inputRef: req.content_ref,
    outputRef: resp.content_ref,
    inputContent: req.content,
    outputContent: resp.content
  };
}

// -- Step 1: Tool RED tests (will fail until invokeTool implemented) -------

test("invokeTool with allow action executes callback and returns result", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const refs = await doModelCall(session);

  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);
  const toolReq = makeToolRequest();
  let callbackCalled = false;
  let callbackRequest: SimulatedToolRequest | null = null;

  const next: MonitorToolNext = (req) => {
    callbackCalled = true;
    callbackRequest = req;
    return executor.execute(req);
  };

  const toolCtx = makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent);
  const outcome = await session.invokeTool(toolReq, toolCtx, next);
  assert.ok(callbackCalled);
  assert.ok(callbackRequest);
  assert.equal(outcome.disposition, "executed");
  assert.equal(outcome.action, "allow");
  // Tool was actually executed - state exists
  assert.ok(state);
});

test("invokeTool with alert action executes callback and creates alert", async () => {
  const provider: MonitorDecisionProvider = {
    decide(input) {
      return {
        policy_id: "policy://test/alert-tool",
        action: input.stage === "tool_request" ? "alert" : "allow",
        reason_code: "test_alert",
        reason: "Alert on tool",
        evidence_refs: ["evidence://test/alert-tool"]
      };
    }
  };

  const session = new MonitoredSession(makeContext(), provider, createTestPorts());
  const refs = await doModelCall(session);

  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);
  let callbackCalled = false;
  const next: MonitorToolNext = (req) => {
    callbackCalled = true;
    return executor.execute(req);
  };

  const outcome = await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    next
  );
  assert.ok(callbackCalled);
  assert.equal(outcome.disposition, "executed");
  assert.equal(outcome.action, "alert");
  // Alert created
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.alerts!.length, 1);
});

test("invokeTool produces correct event order: tool_request, policy_decision, tool_result", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const refs = await doModelCall(session);

  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);
  const outcome = await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    (req) => executor.execute(req)
  );

  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  const events = details.events!;
  // Should have: model_input, model_output, policy_decision (model), tool_request, policy_decision (tool), tool_result
  assert.equal(events.length, 6);
  assert.equal(events[3].event_type, "tool_request");
  assert.equal(events[4].event_type, "policy_decision");
  assert.equal(events[5].event_type, "tool_result");
  // Sources
  assert.equal(events[3].source, "agent");
  assert.equal(events[4].source, "policy");
  assert.equal(events[5].source, "tool");
});

test("invokeTool safe tool result does not contain raw write content", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const refs = await doModelCall(session);

  const sentinel = "SECRET_WRITE_CONTENT_98765";
  const toolReq = normalizeSimulatedToolRequest({
    call_id: "tool-call-sentinel-1",
    session_id: "session-test-001",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "write_file",
    arguments: { path: "sandbox://fixtures/test.txt", content: sentinel }
  }) as SimulatedToolRequest;

  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);
  await session.invokeTool(
    toolReq,
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    (req) => executor.execute(req)
  );

  const result = session.finalize();
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(sentinel));
});

// -- Step 3: Deny/ask tool interception tests ------------------------------

test("invokeTool deny action: callback not called, intercepted result", async () => {
  const provider: MonitorDecisionProvider = {
    decide(input) {
      return {
        policy_id: "policy://test/deny-tool",
        action: input.stage === "tool_request" ? "deny" : "allow",
        reason_code: "test_deny",
        reason: "Deny tool execution",
        evidence_refs: ["evidence://test/deny-tool"]
      };
    }
  };
  const session = new MonitoredSession(makeContext(), provider, createTestPorts());
  const refs = await doModelCall(session);

  let callbackCalled = false;
  const outcome = await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    () => { callbackCalled = true; throw new Error("should not call"); }
  );
  assert.equal(callbackCalled, false);
  assert.equal(outcome.disposition, "intercepted");
  assert.equal(outcome.action, "deny");
  // Tool result is a SandboxToolResultPayload
  const toolResult = outcome.result;
  assert.equal(toolResult.status, "rejected");
  assert.equal(toolResult.state_change, "none");
  // Blocked record created
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.blocked_records!.length, 1);
});

test("invokeTool ask action: callback not called, intercepted, no blocked", async () => {
  const provider: MonitorDecisionProvider = {
    decide(input) {
      return {
        policy_id: "policy://test/ask-tool",
        action: input.stage === "tool_request" ? "ask" : "allow",
        reason_code: "test_ask",
        reason: "Ask about tool",
        evidence_refs: ["evidence://test/ask-tool"]
      };
    }
  };
  const session = new MonitoredSession(makeContext(), provider, createTestPorts());
  const refs = await doModelCall(session);

  let callbackCalled = false;
  const outcome = await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    () => { callbackCalled = true; throw new Error("should not call"); }
  );
  assert.equal(callbackCalled, false);
  assert.equal(outcome.disposition, "intercepted");
  assert.equal(outcome.action, "ask");
  assert.equal(outcome.result.status, "rejected");
  // No blocked record
  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  assert.equal(details.blocked_records!.length, 0);
});

test("invokeTool provider failure: fail-closed, no callback", async () => {
  // Provider only fails at tool stage
  const provider: MonitorDecisionProvider = {
    decide(input) {
      if (input.stage === "tool_request") {
        throw new Error("tool provider crash");
      }
      return {
        policy_id: "policy://test/allow-model",
        action: "allow",
        reason_code: "test_allow",
        reason: "Allow model",
        evidence_refs: ["evidence://test/allow-model"]
      };
    }
  };
  const session = new MonitoredSession(makeContext(), provider, createTestPorts());
  const refs = await doModelCall(session);

  let callbackCalled = false;
  const outcome = await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
    () => { callbackCalled = true; throw new Error("should not call"); }
  );
  assert.equal(callbackCalled, false);
  assert.equal(outcome.disposition, "intercepted");
  assert.equal(outcome.decision.reason_code, "decision_provider_failed");
  // Blocked record created
  const result = session.finalize();
  const metadata = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;
  assert.equal(metadata.provider_failure_count, 1);
  assert.equal(metadata.intercepted_tool_count, 1);
});

// -- Step 4: Invalid and callback-failure tool tests -----------------------

test("invokeTool before model call raises monitor_state_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await assert.rejects(
    () => session.invokeTool(makeToolRequest(), makeToolContext(), () => {
      throw new Error("should not be called");
    }),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
});

test("invokeTool with malformed request raises monitor_tool_request_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  await assert.rejects(
    () => session.invokeTool(null, makeToolContext(), () => {
      throw new Error("should not be called");
    }),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_tool_request_invalid");
      return true;
    }
  );
});

test("invokeTool with stale model context raises monitor_tool_request_invalid", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const refs = await doModelCall(session, "Prompt1", "Response1");

  // Create context with wrong refs - use valid format but wrong values
  const badContext: MonitorToolDecisionContext = {
    model_input: { content: refs.inputContent, content_ref: "ref://wrong/input" },
    model_output: { content: refs.outputContent, content_ref: "ref://wrong/output" }
  };

  await assert.rejects(
    () => session.invokeTool(makeToolRequest(), badContext, () => {
      throw new Error("should not call");
    }),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_tool_request_invalid");
      return true;
    }
  );
});

test("invokeTool callback throws: sealed, safe tool_result", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const refs = await doModelCall(session);

  const sentinel = "TOOL_CALLBACK_CRASH_SECRET";
  await assert.rejects(
    () => session.invokeTool(
      makeToolRequest(),
      makeToolContext(refs.inputRef, refs.outputRef, refs.inputContent, refs.outputContent),
      () => { throw new Error(sentinel); }
    ),
    Track1MonitorError
  );
  const result = session.finalize();
  assert.ok(!JSON.stringify(result).includes(sentinel));
  assert.equal(result.status, "failed");
});

test("invokeTool after sealed session rejects", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("ask"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  // Session is now sealed by ask
  await assert.rejects(
    () => session.invokeTool(makeToolRequest(), makeToolContext(), () => {
      throw new Error("should not call");
    }),
    (err: unknown) => {
      assert.ok(err instanceof Track1MonitorError);
      assert.equal((err as Track1MonitorError).code, "monitor_state_invalid");
      return true;
    }
  );
});

// -- Step 5 & 7: Multi-round and extended finalization ---------------------

test("multiple sequential rounds: model->tool->model->tool", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);

  // Round 1: model allow -> tool allow
  const refs1 = await doModelCall(session, "Round 1", "R1 response");
  await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs1.inputRef, refs1.outputRef, refs1.inputContent, refs1.outputContent),
    (req) => executor.execute(req)
  );

  // Round 2: model allow -> tool allow
  const refs2 = await doModelCall(session, "Round 2", "R2 response");
  await session.invokeTool(
    makeToolRequest(),
    makeToolContext(refs2.inputRef, refs2.outputRef, refs2.inputContent, refs2.outputContent),
    (req) => executor.execute(req)
  );

  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  // 2*(model_input, model_output, policy_decision, tool_request, policy_decision, tool_result) = 12
  assert.equal(details.events!.length, 12);
  const monitor = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;
  assert.equal(monitor.model_call_count, 2);
  assert.equal(monitor.tool_call_count, 2);
  assert.equal(monitor.decision_count, 4);
  assert.equal(monitor.executed_tool_count, 2);
});

test("multi-round: model allow -> model allow -> tool allow with context check", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  const state = new InMemorySimulatedToolState();
  const executor = createExecutor(state);

  // Two sequential model calls
  await doModelCall(session, "First", "First response");
  const refs2 = await doModelCall(session, "Second", "Second response");

  // Tool after two models - uses second model's refs
  const toolReq = makeToolRequest();
  const outcome = await session.invokeTool(
    toolReq,
    makeToolContext(refs2.inputRef, refs2.outputRef, refs2.inputContent, refs2.outputContent),
    (req) => executor.execute(req)
  );
  assert.equal(outcome.disposition, "executed");

  const result = session.finalize();
  const details = result.details as SandboxRunResultDetails;
  // 2*(model_input, model_output, policy_decision) + tool_request + policy_decision + tool_result = 9
  assert.equal(details.events!.length, 9);
  assert.equal(details.event_count, 9);

  const monitor = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;
  assert.equal(monitor.model_call_count, 2);
  assert.equal(monitor.tool_call_count, 1);
  assert.equal(monitor.decision_count, 3);
  assert.equal(monitor.executed_tool_count, 1);
  assert.equal(monitor.intercepted_tool_count, 0);
});

// -- Terminal aggregation matrix tests -------------------------------------

test("callback failure -> failed/high", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  // Trigger callback failure
  await assert.rejects(
    () => session.invokeModel(makeModelRequest(), () => { throw new Error("crash"); }),
    Track1MonitorError
  );
  const result = session.finalize();
  assert.equal(result.status, "failed");
  assert.equal(result.risk_level, "high");
});

test("any deny -> blocked/high", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("deny"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  assert.equal(result.status, "blocked");
  assert.equal(result.risk_level, "high");
});

test("alert but no deny -> finished/high", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("alert"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "high");
});

test("ask but no deny/alert -> finished/medium", async () => {
  const session = new MonitoredSession(makeContext(), actionProvider("ask"), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "medium");
});

test("allow only -> finished/info", async () => {
  const session = new MonitoredSession(makeContext(), allowProvider(), createTestPorts());
  await session.invokeModel(makeModelRequest(), modelNext("OK"));
  const result = session.finalize();
  assert.equal(result.status, "finished");
  assert.equal(result.risk_level, "info");
});
