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
import { MonitoredSession } from "../monitoring/session.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorModelNext,
  MonitorToolNext,
  MonitorToolDecisionContext,
  MonitorModelRequest,
  MonitorModelResponse
} from "../monitoring/contract.ts";
import { normalizeSimulatedToolRequest } from "../simulated-tools/contract.ts";
import type { SimulatedToolRequest, SimulatedToolResult } from "../simulated-tools/contract.ts";
import { composeTrack1FilterModelRequest } from "./context-envelope.ts";
import { RuleBasedDecisionProvider } from "./provider.ts";
import type {
  Track1BaseFilterCaseRun,
  Track1TestCategory
} from "./contract.ts";

// -- deterministic ports ----------------------------------------------------

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

// -- fixture model callback -------------------------------------------------

function fixtureModelNext(modelBehavior: string): MonitorModelNext {
  return (_request: MonitorModelRequest): MonitorModelResponse => {
    return {
      content: modelBehavior,
      content_ref: `fixture://track1/model-output/deterministic`
    };
  };
}

// -- sentinel tool callback -------------------------------------------------

function sentinelToolNext(): MonitorToolNext {
  return (): SimulatedToolResult => {
    throw new Track1ReplayError(
      "unsafe_tool_execution_requested",
      "Sentinel: primary tool-bearing cases must not reach execution"
    );
  };
}

// -- tool request construction ----------------------------------------------

function buildToolRequest(
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

// -- context construction ---------------------------------------------------

function buildContext(
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

// -- single case execution --------------------------------------------------

async function runCase(
  fixture: Track1CaseFixture
): Promise<Track1BaseFilterCaseRun> {
  const caseId = fixture.case_id;
  const sessionId = replayId("session", caseId);
  const taskId = replayId("task", caseId);

  const context = buildContext(fixture, sessionId, taskId);
  const ports = createReplayPorts(caseId);
  const provider = new RuleBasedDecisionProvider();

  // Compose source-aware model request
  const modelRequest = composeTrack1FilterModelRequest({
    user_prompt: fixture.input.user_prompt,
    retrieved_content: fixture.input.retrieved_content,
    memory_entries: fixture.input.memory_entries
  });

  const session = new MonitoredSession(context, provider, ports);

  // Model call
  const modelBehavior = fixture.expected_outcome.model_behavior;
  const modelOutcome = await session.invokeModel(
    modelRequest,
    fixtureModelNext(modelBehavior)
  );

  // Tool call if proposed and can continue
  const toolRequest = buildToolRequest(fixture, sessionId);
  if (toolRequest && modelOutcome.can_continue) {
    const toolCtx: MonitorToolDecisionContext = {
      model_input: modelRequest,
      model_output: modelOutcome.response
    };

    await session.invokeTool(
      toolRequest,
      toolCtx,
      sentinelToolNext()
    );
  }

  const result = session.finalize();

  // Validate result
  const normalized = normalizeBaseResult(result);
  if (!normalized) {
    throw new Track1ReplayError(
      "replay_result_invalid",
      `${caseId}: result failed shared normalization`
    );
  }

  return {
    case_id: fixture.case_id,
    scenario_id: fixture.scenario_id,
    test_category: fixture.test_category as Track1TestCategory,
    expected_action: fixture.expected_outcome.policy_action,
    result: normalized as BaseResult<SandboxRunResultDetails>
  };
}

// -- scenario execution -----------------------------------------------------

export async function runTrack1BaseFilterScenario(
  scenarioId: Track1ScenarioId
): Promise<Track1BaseFilterCaseRun[]> {
  const bundle = loadTrack1ReplayScenario(scenarioId);
  const { cases } = bundle;

  const results: Track1BaseFilterCaseRun[] = [];
  for (const fixture of cases) {
    const run = await runCase(fixture);
    results.push(run);
  }

  return results;
}

// -- all cases --------------------------------------------------------------

export async function runAllTrack1BaseFilterCases(): Promise<Track1BaseFilterCaseRun[]> {
  const allResults: Track1BaseFilterCaseRun[] = [];

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const results = await runTrack1BaseFilterScenario(scenarioId);
    allResults.push(...results);
  }

  // Sort by case_id
  allResults.sort((a, b) => a.case_id.localeCompare(b.case_id));

  return allResults;
}
