import {
  InMemorySimulatedToolState
} from "../../../engines/sandbox/src/simulated-tools/state.ts";
import {
  SimulatedToolExecutor
} from "../../../engines/sandbox/src/simulated-tools/executor.ts";
import type {
  SimulatedToolRequest,
  SimulatedToolResult,
  SimulatedToolSuccessResult,
  SimulatedToolRejectedResult
} from "../../../engines/sandbox/src/simulated-tools/contract.ts";

// -- public types ----------------------------------------------------------
// P0-Fix2: Tool definition aligned to the real OpenClaw SDK AnyAgentTool
// shape. Real SDK requires `label` and uses execute(toolCallId, params,
// signal, onUpdate, ctx) — the 5th ctx param carries session identity for
// per-session tool runtime lookup (P1-Fix5).

export interface Track1ToolParameters {
  additionalProperties: false;
  type: "object";
  required: string[];
  properties: Record<string, unknown>;
}

export interface Track1ToolExecuteContext {
  sessionId?: string;
  agentId?: string;
  sessionKey?: string;
  runId?: string;
  toolName?: string;
  toolCallId?: string;
}

export interface Track1ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
  terminate?: boolean;
}

export interface Track1ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: Track1ToolParameters;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: ((partialResult: Track1ToolResult) => void) | undefined,
    ctx?: Track1ToolExecuteContext
  ) => Promise<Track1ToolResult>;
}

export interface Track1PluginApi {
  registerTool(tool: Track1ToolDefinition): void;
  on(
    name: string,
    handler: (event: unknown, ctx: unknown) => unknown | Promise<unknown>,
    options?: { priority?: number; timeoutMs?: number }
  ): void;
}

// -- campaign-local runtime -----------------------------------------------
// P1-Fix5: Per-session tool runtime. Each session gets its own
// InMemorySimulatedToolState + SimulatedToolExecutor instead of sharing
// one fixed runtime across all sessions.

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

export interface CampaignToolRuntimeResolver {
  resolveToolRuntime(sessionId: string): CampaignToolRuntime | undefined;
}

// -- safe output helpers ---------------------------------------------------

function safeJson(value: unknown): string {
  return JSON.stringify(value);
}

function buildResult(payload: unknown): Track1ToolResult {
  return {
    content: [{ type: "text", text: safeJson(payload) }],
    details: payload
  };
}

function successPayload(result: SimulatedToolSuccessResult): unknown {
  const safeOutput = buildSafeOutput(result);
  return {
    call_id: result.call_id,
    tool_name: result.tool_name,
    status: result.status,
    summary: result.summary,
    output: safeOutput,
    evidence: result.evidence
  };
}

function buildSafeOutput(result: SimulatedToolSuccessResult): unknown {
  switch (result.tool_name) {
    case "send_email":
      return {
        message_id: result.output.message_id,
        recipient: result.output.recipient
      };
    case "read_file":
      return {
        path: result.output.path
      };
    case "write_file":
      return {
        path: result.output.path,
        bytes_written: result.output.bytes_written
      };
    case "call_api":
      return {
        endpoint: result.output.endpoint,
        method: result.output.method,
        status_code: result.output.status_code
      };
  }
}

function rejectedPayload(result: SimulatedToolRejectedResult): unknown {
  return {
    call_id: result.call_id,
    tool_name: result.tool_name,
    status: result.status,
    rejection_code: result.rejection_code,
    summary: result.summary,
    evidence: result.evidence
  };
}

function buildToolResult(result: SimulatedToolResult): Track1ToolResult {
  if (result.status === "simulated_success") {
    return buildResult(successPayload(result));
  }
  return buildResult(rejectedPayload(result));
}

// -- request builder -------------------------------------------------------

function buildRequest(
  runtime: CampaignToolRuntime,
  toolName: SimulatedToolRequest["tool_name"],
  callId: string,
  args: unknown
): SimulatedToolRequest {
  const base = {
    call_id: callId,
    session_id: runtime.session_id,
    scenario_id: runtime.scenario_id,
    case_id: runtime.case_id
  };
  switch (toolName) {
    case "send_email":
      return {
        ...base,
        tool_name: "send_email",
        arguments: args as { recipient: string; subject: string; body: string }
      };
    case "read_file":
      return {
        ...base,
        tool_name: "read_file",
        arguments: args as { path: string }
      };
    case "write_file":
      return {
        ...base,
        tool_name: "write_file",
        arguments: args as { path: string; content: string }
      };
    case "call_api":
      return {
        ...base,
        tool_name: "call_api",
        arguments: args as { endpoint: string; method: "GET" | "POST" }
      };
  }
}

// -- tool definitions ------------------------------------------------------

const SEND_EMAIL_PARAMETERS: Track1ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["recipient", "subject", "body"],
  properties: {
    recipient: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" }
  }
};

const READ_FILE_PARAMETERS: Track1ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: { type: "string" }
  }
};

const WRITE_FILE_PARAMETERS: Track1ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["path", "content"],
  properties: {
    path: { type: "string" },
    content: { type: "string" }
  }
};

const CALL_API_PARAMETERS: Track1ToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["endpoint", "method"],
  properties: {
    endpoint: { type: "string" },
    method: { type: "string", enum: ["GET", "POST"] }
  }
};

// -- registration ----------------------------------------------------------
// P1-Fix5: registerTrack1Tools now takes a runtime resolver so each tool
// execute can look up the per-session runtime via ctx.sessionId.

export function registerTrack1Tools(
  api: Track1PluginApi,
  resolver: CampaignToolRuntimeResolver
): void {
  api.registerTool({
    name: "send_email",
    label: "Send Email (Track 1 Simulated)",
    description: "Append an email to the campaign-local simulated outbox",
    parameters: SEND_EMAIL_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "send_email", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });

  api.registerTool({
    name: "read_file",
    label: "Read File (Track 1 Simulated)",
    description: "Read from the campaign-local virtual file namespace",
    parameters: READ_FILE_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "read_file", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });

  api.registerTool({
    name: "write_file",
    label: "Write File (Track 1 Simulated)",
    description: "Write to the campaign-local virtual file namespace",
    parameters: WRITE_FILE_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "write_file", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });

  api.registerTool({
    name: "call_api",
    label: "Call API (Track 1 Simulated)",
    description: "Resolve a campaign-local mock API route",
    parameters: CALL_API_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "call_api", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });
}

// -- runtime resolution ----------------------------------------------------

function resolveRuntime(
  resolver: CampaignToolRuntimeResolver,
  ctx: Track1ToolExecuteContext | undefined,
  toolCallId: string
): CampaignToolRuntime {
  // P1-Fix5: prefer ctx.sessionId (passed by the real SDK runtime as the
  // 5th execute arg). Fall back to toolCallId-based lookup if the host
  // passes only 4 args (older SDK type declaration).
  const sessionId = ctx?.sessionId ?? resolveSessionByToolCallId(toolCallId);
  if (!sessionId) {
    throw new Error("track1_tool_session_not_found");
  }
  const runtime = resolver.resolveToolRuntime(sessionId);
  if (!runtime) {
    throw new Error("track1_tool_runtime_not_found");
  }
  return runtime;
}

// Per-plugin toolCallId → sessionId fallback map, populated by
// before_tool_call when it allows a tool call. This is only used when
// the SDK runtime does not pass ctx as the 5th execute argument.
const toolCallSessionMap = new Map<string, string>();

export function registerToolCallSession(toolCallId: string, sessionId: string): void {
  toolCallSessionMap.set(toolCallId, sessionId);
}

export function clearToolCallSession(toolCallId: string): void {
  toolCallSessionMap.delete(toolCallId);
}

function resolveSessionByToolCallId(toolCallId: string): string | undefined {
  return toolCallSessionMap.get(toolCallId);
}
