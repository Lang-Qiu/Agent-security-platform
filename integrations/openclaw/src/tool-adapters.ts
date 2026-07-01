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

// -- plugin api shape ------------------------------------------------------

export interface Track1ToolParameters {
  additionalProperties: false;
  type: "object";
  required: string[];
  properties: Record<string, unknown>;
}

export interface Track1ToolDefinition {
  name: string;
  description: string;
  parameters: Track1ToolParameters;
  execute: (args: unknown, context: unknown) => Promise<Track1ToolOutput>;
}

export interface Track1PluginApi {
  registerTool(tool: Track1ToolDefinition): void;
}

export interface Track1ToolOutput {
  content: Array<{ type: "text"; text: string }>;
}

// -- campaign-local runtime -----------------------------------------------

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

// -- call context ----------------------------------------------------------

interface ToolCallContext {
  call_id?: string;
}

// -- safe output helpers ---------------------------------------------------

function safeJson(value: unknown): string {
  return JSON.stringify(value);
}

function buildOutput(payload: unknown): Track1ToolOutput {
  return {
    content: [{ type: "text", text: safeJson(payload) }]
  };
}

function successPayload(result: SimulatedToolSuccessResult): unknown {
  // Emit stable status and safe refs only; strip raw arguments/output bodies.
  // Tool-specific safe output fields are allow-listed below.
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

function buildToolOutput(result: SimulatedToolResult): Track1ToolOutput {
  if (result.status === "simulated_success") {
    return buildOutput(successPayload(result));
  }
  return buildOutput(rejectedPayload(result));
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

function extractCallId(context: unknown): string {
  if (
    typeof context === "object" &&
    context !== null &&
    typeof (context as ToolCallContext).call_id === "string" &&
    (context as ToolCallContext).call_id!.length > 0
  ) {
    return (context as ToolCallContext).call_id!;
  }
  return `call:openclaw:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

export function registerTrack1Tools(
  api: Track1PluginApi,
  runtime: CampaignToolRuntime
): void {
  api.registerTool({
    name: "send_email",
    description: "Append an email to the campaign-local simulated outbox",
    parameters: SEND_EMAIL_PARAMETERS,
    async execute(args, context) {
      const request = buildRequest(
        runtime,
        "send_email",
        extractCallId(context),
        args
      );
      const result = runtime.executor.execute(request);
      return buildToolOutput(result);
    }
  });

  api.registerTool({
    name: "read_file",
    description: "Read from the campaign-local virtual file namespace",
    parameters: READ_FILE_PARAMETERS,
    async execute(args, context) {
      const request = buildRequest(
        runtime,
        "read_file",
        extractCallId(context),
        args
      );
      const result = runtime.executor.execute(request);
      return buildToolOutput(result);
    }
  });

  api.registerTool({
    name: "write_file",
    description: "Write to the campaign-local virtual file namespace",
    parameters: WRITE_FILE_PARAMETERS,
    async execute(args, context) {
      const request = buildRequest(
        runtime,
        "write_file",
        extractCallId(context),
        args
      );
      const result = runtime.executor.execute(request);
      return buildToolOutput(result);
    }
  });

  api.registerTool({
    name: "call_api",
    description: "Resolve a campaign-local mock API route",
    parameters: CALL_API_PARAMETERS,
    async execute(args, context) {
      const request = buildRequest(
        runtime,
        "call_api",
        extractCallId(context),
        args
      );
      const result = runtime.executor.execute(request);
      return buildToolOutput(result);
    }
  });
}
