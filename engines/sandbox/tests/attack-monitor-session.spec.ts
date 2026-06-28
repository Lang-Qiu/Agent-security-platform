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
  MonitoredModelOutcome
} from "../src/monitoring/index.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";
import { normalizeBaseResult } from "../../../shared/contracts/result.ts";

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
