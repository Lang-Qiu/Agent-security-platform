import assert from "node:assert/strict";
import test from "node:test";

import {
  ObservedMonitoredSession,
  Track1MonitorError
} from "../src/monitoring/index.ts";

const SESSION_ID = "session:track1:observed-001";

function makePorts() {
  let id = 0;
  let tick = 0;
  return {
    now() {
      tick += 1;
      return new Date(Date.UTC(2026, 5, 30, 0, 0, tick)).toISOString();
    },
    nextId(kind: string) {
      id += 1;
      return `${kind}:track1:${String(id).padStart(3, "0")}`;
    }
  };
}

function makeSession(withIdentity = true) {
  return new ObservedMonitoredSession(
    {
      task_id: "task:track1:demo-010",
      session_id: withIdentity ? SESSION_ID : "session:track1:placeholder",
      model_ref: "model://track1/openclaw-demo",
      ...(withIdentity
        ? {
            scenario_id: "T1-SC-001",
            case_id: "T1-SC-001-C001"
          }
        : {})
    },
    {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow" as const,
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    makePorts()
  );
}

function bindIdentity(session: ObservedMonitoredSession) {
  session.rebindContext({
    session_id: SESSION_ID,
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001"
  });
}

async function readyToolSession() {
  const session = makeSession();
  session.observeModelInput({
    session_id: SESSION_ID,
    content: "Check the simulated portal.",
    content_ref: "model://track1/input/001"
  });
  await session.observeModelOutput({
    session_id: SESSION_ID,
    content: "The simulated portal is available.",
    content_ref: "model://track1/output/001"
  });
  await session.beforeTool({
    call_id: "call:track1:001",
    session_id: SESSION_ID,
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    tool_name: "write_file",
    arguments: {
      path: "sandbox://track1/virtual/log.txt",
      content: "safe"
    }
  });
  return session;
}

test("REQ-T1-DEMO-010 deferred identity rebind validates the complete context atomically", () => {
  const session = makeSession(false);

  assert.throws(
    () =>
      session.rebindContext({
        session_id: SESSION_ID,
        scenario_id: "T1-SC-001",
        case_id: "T1-SC-002-C001"
      }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_context_invalid"
  );

  bindIdentity(session);
  assert.equal(session.snapshot().details.session_id, SESSION_ID);
});

test("REQ-T1-DEMO-010 deferred identity can be rebound exactly once before observations", () => {
  const session = makeSession(false);
  bindIdentity(session);

  assert.throws(
    () =>
      session.rebindContext({
        session_id: "session:track1:second",
        scenario_id: "T1-SC-002",
        case_id: "T1-SC-002-C001"
      }),
    (error: unknown) =>
      error instanceof Track1MonitorError &&
      error.code === "monitor_state_invalid"
  );
});

test("REQ-T1-DEMO-010 failed tool result finalizes as terminal failed", async () => {
  const session = await readyToolSession();
  const snapshot = session.afterTool({
    session_id: SESSION_ID,
    call_id: "call:track1:001",
    tool_name: "write_file",
    status: "failed",
    result_ref: "simulated-result://track1/call-001/failed",
    state_change: "none"
  });
  assert.equal(snapshot.status, "failed");

  const result = session.finalize();
  assert.equal(result.status, "failed");
  assert.equal(typeof result.finished_at, "string");
});

test("REQ-T1-DEMO-010 rejected tool result remains non-failed and finalizable", async () => {
  const session = await readyToolSession();
  const snapshot = session.afterTool({
    session_id: SESSION_ID,
    call_id: "call:track1:001",
    tool_name: "write_file",
    status: "rejected",
    result_ref: "simulated-result://track1/call-001/rejected",
    state_change: "none"
  });
  assert.equal(snapshot.status, "running");

  const result = session.finalize();
  assert.equal(result.status, "finished");
  const toolResults = result.details.events.filter(
    (event) => event.event_type === "tool_result"
  );
  assert.equal(toolResults.at(-1)?.payload.status, "rejected");
});
