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
  makeObservedSession
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
