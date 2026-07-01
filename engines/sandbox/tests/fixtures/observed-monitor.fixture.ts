import { ObservedMonitoredSession } from "../../src/monitoring/index.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorDecisionProvider,
  MonitorDecisionProposal
} from "../../src/monitoring/index.ts";
import type { SimulatedToolRequest } from "../../src/simulated-tools/contract.ts";

// -- stable correlation constants -----------------------------------------

const SESSION_ID = "session:track1:observed-001";
const TASK_ID = "task:track1:demo-010";
const MODEL_REF = "model://track1/openclaw-gpt-4o-mini";
const SCENARIO_ID = "T1-SC-001";
const CASE_ID = "T1-SC-001-C001";

// -- session context ------------------------------------------------------

export function makeObservedSessionContext(): MonitorSessionContext {
  return {
    task_id: TASK_ID,
    session_id: SESSION_ID,
    model_ref: MODEL_REF,
    scenario_id: SCENARIO_ID,
    case_id: CASE_ID
  };
}

// -- model input / output -------------------------------------------------

export function makeObservedModelInput(): {
  session_id: string;
  content: string;
  content_ref: string;
} {
  return {
    session_id: SESSION_ID,
    content: "What is the current status of the simulated customer service portal?",
    content_ref: "model://track1/observed/input/001"
  };
}

export function makeObservedModelOutput(): {
  session_id: string;
  content: string;
  content_ref: string;
} {
  return {
    session_id: SESSION_ID,
    content: "The simulated customer service portal is operating normally.",
    content_ref: "model://track1/observed/output/001"
  };
}

// -- tool request / result (used by P3-T2; established here per plan) -----

export function makeObservedToolRequest(overrides?: {
  call_id?: string;
}): SimulatedToolRequest {
  return {
    call_id: overrides?.call_id ?? "call:track1:observed-001",
    session_id: SESSION_ID,
    scenario_id: SCENARIO_ID,
    case_id: CASE_ID,
    tool_name: "write_file",
    arguments: {
      path: "sandbox://track1/virtual/log.txt",
      content: "Entry recorded by observed session"
    }
  };
}

export function makeObservedToolResult(): {
  session_id: string;
  call_id: string;
  tool_name: "write_file";
  status: "success" | "failed";
  result_ref: string;
  state_change: "none" | "simulated";
} {
  return {
    session_id: SESSION_ID,
    call_id: "call:track1:observed-001",
    tool_name: "write_file",
    status: "success",
    result_ref: "simulated-result://track1/call-001/success",
    state_change: "simulated"
  };
}

// -- deterministic runtime ports ------------------------------------------

export function makeDeterministicMonitorPorts(): MonitorRuntimePorts {
  let idCounter = 0;
  let timeCounter = 0;
  return {
    now() {
      timeCounter += 1;
      return new Date(
        Date.UTC(2026, 5, 30, 0, 0, 0) + timeCounter * 1000
      ).toISOString();
    },
    nextId(kind: string) {
      idCounter += 1;
      return `${kind}:track1:${String(idCounter).padStart(3, "0")}`;
    }
  };
}

// -- decision providers ---------------------------------------------------

function allowProvider(): MonitorDecisionProvider {
  return {
    decide() {
      return {
        policy_id: "policy://track1/base-filter/v1",
        action: "allow",
        reason_code: "base_filter_no_match",
        reason: "No base filter rule matched",
        evidence_refs: ["evidence://track1/base-filter/no-match"]
      };
    }
  };
}

function actionProvider(
  action: MonitorDecisionProposal["action"]
): MonitorDecisionProvider {
  return {
    decide() {
      return {
        policy_id: `policy://track1/test-${action}`,
        action,
        reason_code: `test_${action}`,
        reason: `Test ${action} action`,
        evidence_refs: [`evidence://track1/test-${action}`]
      };
    }
  };
}

// -- session factories ----------------------------------------------------

export function makeObservedSession(
  provider?: MonitorDecisionProvider
): ObservedMonitoredSession {
  return new ObservedMonitoredSession(
    makeObservedSessionContext(),
    provider ?? allowProvider(),
    makeDeterministicMonitorPorts()
  );
}

export async function makeReadyObservedSession(
  action: MonitorDecisionProposal["action"]
): Promise<ObservedMonitoredSession> {
  const session = new ObservedMonitoredSession(
    makeObservedSessionContext(),
    actionProvider(action),
    makeDeterministicMonitorPorts()
  );
  session.observeModelInput(makeObservedModelInput());
  await session.observeModelOutput(makeObservedModelOutput());
  return session;
}
