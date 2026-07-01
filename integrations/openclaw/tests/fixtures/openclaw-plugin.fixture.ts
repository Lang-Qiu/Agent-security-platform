import { InMemorySimulatedToolState } from "../../../../engines/sandbox/src/simulated-tools/state.ts";
import { SimulatedToolExecutor } from "../../../../engines/sandbox/src/simulated-tools/executor.ts";

// -- recording plugin api -------------------------------------------------

export interface RecordedTool {
  name: string;
  description: string;
  parameters: {
    additionalProperties: boolean;
    [key: string]: unknown;
  };
  execute: (args: unknown, context: unknown) => Promise<unknown>;
}

export interface RecordingPluginApi {
  tools: RecordedTool[];
  registerTool(tool: RecordedTool): void;
}

export function makeRecordingPluginApi(): RecordingPluginApi {
  const tools: RecordedTool[] = [];
  return {
    tools,
    registerTool(tool) {
      tools.push(tool);
    }
  };
}

// -- campaign tool runtime ------------------------------------------------

export interface CampaignToolRuntime {
  campaign_id: string;
  agent_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  scenario_id: string;
  case_id: string;
  state: InMemorySimulatedToolState;
  executor: SimulatedToolExecutor;
}

export function makeCampaignToolRuntime(
  overrides?: Partial<{
    campaign_id: string;
    agent_id: string;
    attempt_id: string;
    attempt_index: 1 | 2;
    session_id: string;
    scenario_id: string;
    case_id: string;
    files: Record<string, string>;
    api_routes: Array<{
      endpoint: string;
      method: "GET" | "POST";
      status_code: number;
      body: Record<string, string>;
    }>;
  }>
): CampaignToolRuntime {
  const state = new InMemorySimulatedToolState({
    files: overrides?.files,
    api_routes: overrides?.api_routes
  });
  return {
    campaign_id: overrides?.campaign_id ?? "campaign:track1:demo-010",
    agent_id: overrides?.agent_id ?? "agent:track1:openclaw-001",
    attempt_id: overrides?.attempt_id ?? "attempt:track1:demo-010-001",
    attempt_index: overrides?.attempt_index ?? 1,
    session_id: overrides?.session_id ?? "session:track1:openclaw-001",
    scenario_id: overrides?.scenario_id ?? "T1-SC-001",
    case_id: overrides?.case_id ?? "T1-SC-001-C001",
    state,
    executor: new SimulatedToolExecutor(state)
  };
}

// -- call id generator -----------------------------------------------------

let _callIdCounter = 0;

export function nextCallId(): string {
  _callIdCounter += 1;
  return `call:fixture:${String(_callIdCounter).padStart(3, "0")}`;
}
