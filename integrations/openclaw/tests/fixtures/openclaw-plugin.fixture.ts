import { InMemorySimulatedToolState } from "../../../../engines/sandbox/src/simulated-tools/state.ts";
import { SimulatedToolExecutor } from "../../../../engines/sandbox/src/simulated-tools/executor.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_MODEL_REF_CANONICAL
} from "../../../../shared/types/campaign-ingest.ts";
import {
  calculateTrack1SnapshotSha256
} from "../../../../shared/contracts/campaign-ingest.ts";
import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import type {
  Track1CampaignSnapshotAck,
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotWithoutHash
} from "../../../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import type {
  MonitorDecisionProvider,
  MonitorDecisionProposal
} from "../../../../engines/sandbox/src/monitoring/contract.ts";

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

export interface RecordedHook {
  name: string;
  handler: (event: unknown) => unknown | Promise<unknown>;
  options?: { priority?: number; timeoutMs?: number };
}

export interface RecordingPluginApi {
  tools: RecordedTool[];
  hooks: RecordedHook[];
  registerTool(tool: RecordedTool): void;
  on(
    name: string,
    handler: (event: unknown) => unknown | Promise<unknown>,
    options?: { priority?: number; timeoutMs?: number }
  ): void;
}

export function makeRecordingPluginApi(): RecordingPluginApi {
  const tools: RecordedTool[] = [];
  const hooks: RecordedHook[] = [];
  return {
    tools,
    hooks,
    registerTool(tool) {
      tools.push(tool);
    },
    on(name, handler, options) {
      hooks.push({ name, handler, options });
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

// -- P3-T4: campaign context + ingest fixtures ----------------------------

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const ATTEMPT_ID = "attempt:t1-sc-001-c001:1";
const AGENT_ID = "track1-agent-tool";
const SESSION_ID = "session:0123456789abcdef0123456789abcdef";
const TASK_ID = "task:0123456789abcdef0123456789abcdef";

export function makeCampaignPluginConfig(
  overrides?: Partial<{ ingestEndpoint: string; ingestToken: string }>
): {
  ingestEndpoint: string;
  ingestToken: string;
} {
  return {
    ingestEndpoint:
      overrides?.ingestEndpoint ??
      "http://backend:3001/internal/track1/campaigns",
    ingestToken: overrides?.ingestToken ?? "track1-test-token-abcdef"
  };
}

export function makeCampaignHookContext(
  overrides?: Partial<{
    campaign_id: string;
    attempt_id: string;
    attempt_index: 1 | 2;
    agent_id: string;
    session_id: string;
    scenario_id: string;
    case_id: string;
    model_ref: string;
  }>
): {
  campaign_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  agent_id: string;
  session_id: string;
  scenario_id: string;
  case_id: string;
  model_ref: string;
} {
  return {
    campaign_id: overrides?.campaign_id ?? CAMPAIGN_ID,
    attempt_id: overrides?.attempt_id ?? ATTEMPT_ID,
    attempt_index: overrides?.attempt_index ?? 1,
    agent_id: overrides?.agent_id ?? AGENT_ID,
    session_id: overrides?.session_id ?? SESSION_ID,
    scenario_id: overrides?.scenario_id ?? "T1-SC-001",
    case_id: overrides?.case_id ?? "T1-SC-001-C001",
    model_ref: overrides?.model_ref ?? TRACK1_MODEL_REF_CANONICAL
  };
}

export function makeTrack1ModelInputEnvelope(
  overrides?: Partial<{
    user_prompt: string;
  }>
): {
  schema_version: "track1-openclaw-input.v1";
  campaign_id: string;
  agent_id: string;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  case_id: string;
  scenario_id: string;
  user_prompt: string;
  retrieved_content: readonly {
    memory_entry_id: string;
    content_ref: string;
    content_sha256: string;
  }[];
  memory_entries: readonly {
    memory_entry_id: string;
    content_ref: string;
    content_sha256: string;
  }[];
  proposed_tool_call: {
    tool_name: "send_email" | "read_file" | "write_file" | "call_api";
    arguments_ref: string;
  } | null;
} {
  return {
    schema_version: "track1-openclaw-input.v1",
    campaign_id: CAMPAIGN_ID,
    agent_id: AGENT_ID,
    attempt_id: ATTEMPT_ID,
    attempt_index: 1,
    session_id: SESSION_ID,
    case_id: "T1-SC-001-C001",
    scenario_id: "T1-SC-001",
    user_prompt:
      overrides?.user_prompt ?? "What is the status of the customer portal?",
    retrieved_content: [],
    memory_entries: [],
    proposed_tool_call: null
  };
}

function makeFinishedSandboxResult(): BaseResult<SandboxRunResultDetails> {
  const details = {
    session_id: SESSION_ID,
    events: [
      {
        event_id: "event_tool_request_001",
        session_id: SESSION_ID,
        sequence: 1,
        event_type: "tool_request" as const,
        occurred_at: "2026-06-30T00:00:01.000Z",
        source: "agent" as const,
        evidence_refs: ["evidence://tool/request/001"],
        payload: {
          call_id: "call_001",
          tool_name: "send_email",
          target_ref: "recipient://reviewer@local.invalid",
          arguments_ref: "fixture://cases/T1-SC-001-C001/tool-request"
        }
      },
      {
        event_id: "event_policy_decision_001",
        session_id: SESSION_ID,
        sequence: 2,
        event_type: "policy_decision" as const,
        occurred_at: "2026-06-30T00:00:02.000Z",
        source: "policy" as const,
        evidence_refs: ["evidence://decision/001"],
        payload: {
          decision_id: "decision_001",
          subject_event_id: "event_tool_request_001",
          policy_id: "policy_tool_target",
          action: "allow" as const,
          reason_code: "target_approved",
          reason: "Target is within the approved fixture set",
          evidence_refs: ["evidence://decision/001"],
          decided_at: "2026-06-30T00:00:02.000Z"
        }
      }
    ],
    policy_decisions: [
      {
        decision_id: "decision_001",
        subject_event_id: "event_tool_request_001",
        policy_id: "policy_tool_target",
        action: "allow" as const,
        reason_code: "target_approved",
        reason: "Target is within the approved fixture set",
        evidence_refs: ["evidence://decision/001"],
        decided_at: "2026-06-30T00:00:02.000Z"
      }
    ],
    alerts: [],
    blocked_records: [],
    blocked: false,
    event_count: 2
  };

  const normalized = normalizeBaseResult({
    task_id: TASK_ID,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "finished",
    risk_level: "info",
    summary: "Sandbox finished with an allowed tool request",
    details,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:03.000Z"
  });

  if (!normalized) {
    throw new Error("fixture sandbox result must normalize via normalizeBaseResult");
  }
  return normalized as BaseResult<SandboxRunResultDetails>;
}

export function makeCampaignSnapshotEnvelope(): Track1CampaignSnapshotEnvelope {
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: CAMPAIGN_ID,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: AGENT_ID,
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: ATTEMPT_ID,
    attempt_index: 1,
    sequence: 1,
    previous_snapshot_sha256: null,
    observed_at: "2026-06-30T00:00:03.000Z",
    result: makeFinishedSandboxResult()
  };
  const snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256 };
}

export function makeIngestSnapshotAck(
  overrides?: Partial<{
    campaign_id: string;
    attempt_id: string;
    sequence: number;
    snapshot_sha256: string;
  }>
): Track1CampaignSnapshotAck {
  const envelope = makeCampaignSnapshotEnvelope();
  return {
    schema_version: "track1-campaign-snapshot-ack.v1",
    campaign_id: overrides?.campaign_id ?? envelope.campaign_id,
    attempt_id: overrides?.attempt_id ?? envelope.attempt_id,
    sequence: overrides?.sequence ?? envelope.sequence,
    snapshot_sha256: overrides?.snapshot_sha256 ?? envelope.snapshot_sha256,
    accepted_at: "2026-06-30T00:00:04.000Z"
  };
}

// -- P3-T5: native tool event + hook harness ------------------------------

export type NativeToolName = "send_email" | "read_file" | "write_file" | "call_api";

export interface NativeToolEvent {
  session_id: string;
  call_id: string;
  tool_name: string;
  arguments: unknown;
}

export function makeNativeToolEvent(
  toolName: NativeToolName,
  overrides?: Partial<{ call_id: string; session_id: string }>
): NativeToolEvent {
  const base = {
    session_id: overrides?.session_id ?? SESSION_ID,
    call_id: overrides?.call_id ?? "call:native:001"
  };
  switch (toolName) {
    case "send_email":
      return {
        ...base,
        tool_name: "send_email",
        arguments: {
          recipient: "reviewer@local.invalid",
          subject: "Status update",
          body: "The portal is operating normally."
        }
      };
    case "read_file":
      return {
        ...base,
        tool_name: "read_file",
        arguments: { path: "sandbox://track1/virtual/status.txt" }
      };
    case "write_file":
      return {
        ...base,
        tool_name: "write_file",
        arguments: {
          path: "sandbox://track1/virtual/log.txt",
          content: "Entry recorded by observed session"
        }
      };
    case "call_api":
      return {
        ...base,
        tool_name: "call_api",
        arguments: { endpoint: "/api/status", method: "GET" }
      };
  }
}

// -- plugin runtime ports --------------------------------------------------

export interface PluginRuntimePorts {
  provider: MonitorDecisionProvider;
  ingestSnapshot: (envelope: Track1CampaignSnapshotEnvelope) => Promise<Track1CampaignSnapshotAck>;
  now: () => string;
  nextId: (kind: string) => string;
}

export function makePluginRuntimePorts(options?: {
  action?: MonitorDecisionProposal["action"];
  ingest?: () => Promise<Track1CampaignSnapshotAck>;
  ingestFails?: boolean;
}): PluginRuntimePorts {
  const action = options?.action ?? "allow";
  let idCounter = 0;
  let timeCounter = 0;
  return {
    provider: {
      decide() {
        return {
          policy_id: `policy://track1/test-${action}`,
          action,
          reason_code: `test_${action}`,
          reason: `Test ${action} action`,
          evidence_refs: [`evidence://track1/test-${action}`]
        };
      }
    },
    async ingestSnapshot(envelope) {
      if (options?.ingestFails) {
        throw new Error("simulated ingest failure");
      }
      if (options?.ingest) {
        await options.ingest();
      }
      return {
        schema_version: "track1-campaign-snapshot-ack.v1",
        campaign_id: envelope.campaign_id,
        attempt_id: envelope.attempt_id,
        sequence: envelope.sequence,
        snapshot_sha256: envelope.snapshot_sha256,
        accepted_at: "2026-06-30T00:00:04.000Z"
      };
    },
    now() {
      timeCounter += 1;
      return new Date(Date.UTC(2026, 5, 30, 0, 0, 0) + timeCounter * 1000).toISOString();
    },
    nextId(kind: string) {
      idCounter += 1;
      return `${kind}:track1:${String(idCounter).padStart(3, "0")}`;
    }
  };
}

// -- plugin hook harness ---------------------------------------------------

export interface PluginHookHarness {
  beforeToolCall: (event: unknown) => Promise<Record<string, unknown>>;
  afterToolCall: (event: unknown) => Promise<Record<string, unknown>>;
  sessionStart: (event: unknown) => Promise<unknown>;
  sessionEnd: (event: unknown) => Promise<unknown>;
  llmInput: (event: unknown) => Promise<unknown>;
  llmOutput: (event: unknown) => Promise<unknown>;
  readonly toolExecutions: number;
  readonly snapshotsIngested: number;
  readonly snapshots: Track1CampaignSnapshotEnvelope[];
  readonly api: RecordingPluginApi;
}

export interface PluginHookHarnessOptions {
  register: (
    api: RecordingPluginApi,
    runtime: {
      ports: PluginRuntimePorts;
      toolRuntime: CampaignToolRuntime;
    }
  ) => void;
  action?: MonitorDecisionProposal["action"];
  ingest?: () => Promise<Track1CampaignSnapshotAck>;
  ingestFails?: boolean;
  skipPreArm?: boolean;
}

export async function makePluginHookHarness(
  options: PluginHookHarnessOptions
): Promise<PluginHookHarness> {
  const toolExecutions = { count: 0 };
  const snapshotsIngested = { count: 0 };
  const snapshots: Track1CampaignSnapshotEnvelope[] = [];

  const api = makeRecordingPluginApi();
  const originalRegisterTool = api.registerTool.bind(api);
  api.registerTool = (tool: RecordedTool) => {
    const originalExecute = tool.execute;
    const wrapped: RecordedTool = {
      ...tool,
      async execute(args: unknown, context: unknown) {
        toolExecutions.count += 1;
        return originalExecute(args, context);
      }
    };
    originalRegisterTool(wrapped);
  };

  const toolRuntime = makeCampaignToolRuntime();
  const basePorts = makePluginRuntimePorts({
    action: options.action,
    ingest: options.ingest,
    ingestFails: options.ingestFails
  });

  const ports: PluginRuntimePorts = {
    provider: basePorts.provider,
    now: basePorts.now,
    nextId: basePorts.nextId,
    async ingestSnapshot(envelope) {
      const ack = await basePorts.ingestSnapshot(envelope);
      snapshots.push(envelope);
      snapshotsIngested.count += 1;
      return ack;
    }
  };

  options.register(api, { ports, toolRuntime });

  const getHook = (name: string) => {
    const hook = api.hooks.find((h) => h.name === name);
    if (!hook) throw new Error(`hook ${name} not registered`);
    return hook.handler;
  };

  const invoke = async (name: string, event: unknown) => {
    return await getHook(name)(event);
  };

  if (!options.skipPreArm) {
    const ctx = makeCampaignHookContext();
    await invoke("session_start", {
      session_id: ctx.session_id,
      agent_id: ctx.agent_id,
      context: ctx
    });
    await invoke("llm_input", {
      session_id: ctx.session_id,
      envelope: makeTrack1ModelInputEnvelope()
    });
    await invoke("llm_output", {
      session_id: ctx.session_id,
      content: "The simulated customer service portal is operating normally.",
      content_ref: "model://track1/observed/output/001"
    });
  }

  return {
    api,
    beforeToolCall: (event: unknown) =>
      invoke("before_tool_call", event) as Promise<Record<string, unknown>>,
    afterToolCall: (event: unknown) =>
      invoke("after_tool_call", event) as Promise<Record<string, unknown>>,
    sessionStart: (event: unknown) => invoke("session_start", event),
    sessionEnd: (event: unknown) => invoke("session_end", event),
    llmInput: (event: unknown) => invoke("llm_input", event),
    llmOutput: (event: unknown) => invoke("llm_output", event),
    get toolExecutions() {
      return toolExecutions.count;
    },
    get snapshotsIngested() {
      return snapshotsIngested.count;
    },
    snapshots
  };
}

// -- P3-T6: runtime probe ports (stubs, extended in P3-T6) ----------------

export function makeCompleteRuntimeProbePorts(): PluginRuntimePorts {
  return makePluginRuntimePorts({ action: "allow" });
}

export function makeProbePorts(
  mutation?: Partial<PluginRuntimePorts>
): PluginRuntimePorts {
  const base = makePluginRuntimePorts({ action: "allow" });
  return { ...base, ...mutation };
}
