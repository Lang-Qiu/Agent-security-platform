import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import {
  TRACK1_SCENARIO_IDS,
  Track1ReplayError
} from "../replay/contract.ts";
import type {
  Track1CaseFixture,
  Track1ScenarioId
} from "../replay/contract.ts";
import { loadTrack1ReplayScenario } from "../replay/loader.ts";
import { replayId, replayTimestamp } from "../replay/deterministic.ts";
import { MonitoredSession } from "./session.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorDecisionProvider,
  MonitorModelRequest,
  MonitorModelResponse,
  MonitorModelNext,
  MonitorToolNext,
  MonitorToolDecisionContext,
  MonitorDecisionProposal
} from "./contract.ts";
import type { SimulatedToolRequest, SimulatedToolResult } from "../simulated-tools/contract.ts";
import { normalizeSimulatedToolRequest } from "../simulated-tools/contract.ts";

// -- deterministic monitor ports per case ----------------------------------

function createReplayPorts(caseId: string): MonitorRuntimePorts {
  let idSeq = 0;
  let timeSeq = 0;

  return {
    now() {
      const ts = replayTimestamp(timeSeq);
      timeSeq += 1;
      return ts;
    },
    nextId(kind: string) {
      idSeq += 1;
      return replayId(kind, caseId, idSeq);
    }
  };
}

// -- fixture model callback ------------------------------------------------

function fixtureModelNext(modelBehavior: string): MonitorModelNext {
  return (request: MonitorModelRequest): MonitorModelResponse => {
    return {
      content: modelBehavior,
      content_ref: `fixture://track1/model-output/${request.content_ref}`
    };
  };
}

// -- fixture decision provider ---------------------------------------------

function fixtureProvider(
  fixture: Track1CaseFixture
): MonitorDecisionProvider {
  const hasTool = fixture.input.proposed_tool_call !== null;
  const expectedAction = fixture.expected_outcome.policy_action;

  return {
    decide(input): MonitorDecisionProposal {
      if (input.stage === "model_output") {
        // Return allow when a tool follows, otherwise the expected action
        const modelAction = hasTool ? "allow" : expectedAction;
        return {
          policy_id: "policy://track1/fixture-adapter",
          action: modelAction,
          reason_code: `fixture_model_${modelAction}`,
          reason: `Fixture adapter model-stage: ${modelAction}`,
          evidence_refs: [`evidence://track1/fixture/${fixture.case_id}/model`]
        };
      } else {
        // tool_request stage
        return {
          policy_id: "policy://track1/fixture-adapter",
          action: expectedAction,
          reason_code: `fixture_expected_${expectedAction}`,
          reason: `Fixture expected: ${expectedAction}`,
          evidence_refs: [`evidence://track1/fixture/${fixture.case_id}/tool`]
        };
      }
    }
  };
}

// -- sentinel tool callback ------------------------------------------------

function sentinelToolNext(): MonitorToolNext {
  return (): SimulatedToolResult => {
    throw new Track1ReplayError(
      "unsafe_tool_execution_requested",
      "Sentinel tool callback was called — tools must not execute in current cases"
    );
  };
}

// -- tool request construction ---------------------------------------------

function buildMonitorToolRequest(
  fixture: Track1CaseFixture,
  sessionId: string
): SimulatedToolRequest | null {
  const ptc = fixture.input.proposed_tool_call;
  if (!ptc) return null;

  const syntheticRequest = {
    call_id: replayId("call", fixture.case_id),
    session_id: sessionId,
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id,
    tool_name: ptc.tool_name,
    arguments: ptc.arguments
  };

  return normalizeSimulatedToolRequest(syntheticRequest);
}

// -- session context construction ------------------------------------------

function buildMonitorContext(
  fixture: Track1CaseFixture,
  sessionId: string,
  taskId: string
): MonitorSessionContext {
  return {
    task_id: taskId,
    session_id: sessionId,
    model_ref: "fixture-model://track1/deterministic",
    scenario_id: fixture.scenario_id,
    case_id: fixture.case_id
  };
}

// -- scenario adaptation ---------------------------------------------------

export async function runTrack1MonitorScenario(
  scenarioId: Track1ScenarioId
): Promise<BaseResult<SandboxRunResultDetails>[]> {
  const bundle = loadTrack1ReplayScenario(scenarioId);
  const { cases } = bundle;

  const results: BaseResult<SandboxRunResultDetails>[] = [];

  for (const fixture of cases) {
    const result = await adaptCaseAsync(fixture);
    results.push(result);
  }

  return results;
}

async function adaptCaseAsync(
  fixture: Track1CaseFixture
): Promise<BaseResult<SandboxRunResultDetails>> {
  const caseId = fixture.case_id;
  const sessionId = replayId("session", caseId);
  const taskId = replayId("task", caseId);

  const context = buildMonitorContext(fixture, sessionId, taskId);
  const ports = createReplayPorts(caseId);
  const provider = fixtureProvider(fixture);
  const modelNext = fixtureModelNext(fixture.expected_outcome.model_behavior);

  const session = new MonitoredSession(context, provider, ports);

  // Model call
  const modelRequest: MonitorModelRequest = {
    content: fixture.input.user_prompt,
    content_ref: `fixture://track1/model-input/${caseId}`
  };

  const modelOutcome = await session.invokeModel(modelRequest, modelNext);

  // Tool call if proposed
  const toolRequest = buildMonitorToolRequest(fixture, sessionId);
  if (toolRequest && modelOutcome.can_continue) {
    const toolContext: MonitorToolDecisionContext = {
      model_input: modelRequest,
      model_output: { content: fixture.expected_outcome.model_behavior, content_ref: modelOutcome.response.content_ref }
    };

    await session.invokeTool(
      toolRequest,
      toolContext,
      sentinelToolNext()
    );
  }

  const result = session.finalize();
  return result;
}

// -- all cases -------------------------------------------------------------

export async function runAllTrack1MonitorCases(): Promise<BaseResult<SandboxRunResultDetails>[]> {
  const allResults: BaseResult<SandboxRunResultDetails>[] = [];

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const results = await runTrack1MonitorScenario(scenarioId);
    allResults.push(...results);
  }

  // Sort by case_id (from metadata monitor or events)
  allResults.sort((a, b) => {
    const detailsA = a.details as SandboxRunResultDetails;
    const detailsB = b.details as SandboxRunResultDetails;
    const caseA = detailsA.events?.[0]?.case_id ?? "";
    const caseB = detailsB.events?.[0]?.case_id ?? "";
    return caseA.localeCompare(caseB);
  });

  return allResults;
}

// -- demo serialization ----------------------------------------------------

export async function serializeTrack1MonitorDemo(): Promise<string> {
  const results = await runAllTrack1MonitorCases();
  return JSON.stringify(results);
}
