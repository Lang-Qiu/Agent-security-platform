import { ObservedMonitoredSession } from "../../../engines/sandbox/src/monitoring/observed-session.ts";
import type { MonitorRuntimePorts, MonitorDecisionProvider } from "../../../engines/sandbox/src/monitoring/contract.ts";
import { registerTrack1Tools } from "./tool-adapters.ts";
import type { CampaignToolRuntime, Track1ToolDefinition } from "./tool-adapters.ts";
import {
  normalizeTrack1PluginContext,
  normalizeTrack1ModelInputEnvelope
} from "./campaign-context.ts";
import type { Track1PluginContext } from "./campaign-context.ts";
import { calculateTrack1SnapshotSha256 } from "../../../shared/contracts/campaign-ingest.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION
} from "../../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotAck,
  Track1CampaignSnapshotWithoutHash
} from "../../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";

// -- public types ----------------------------------------------------------

export type Track1HookName =
  | "session_start"
  | "llm_input"
  | "llm_output"
  | "before_tool_call"
  | "after_tool_call"
  | "session_end";

export interface Track1HookOptions {
  priority?: number;
  timeoutMs?: number;
}

export interface Track1PluginApi {
  registerTool(tool: Track1ToolDefinition): void;
  on(
    name: Track1HookName,
    handler: (event: unknown) => unknown | Promise<unknown>,
    options?: Track1HookOptions
  ): void;
}

export interface Track1PluginRuntimePorts {
  provider: MonitorDecisionProvider;
  ingestSnapshot: (
    envelope: Track1CampaignSnapshotEnvelope
  ) => Promise<Track1CampaignSnapshotAck>;
  now?: () => string;
  nextId?: (kind: string) => string;
}

export interface Track1PluginRuntime {
  ports: Track1PluginRuntimePorts;
  toolRuntime: CampaignToolRuntime;
}

// -- internal error --------------------------------------------------------

class Track1PluginHookError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1PluginHookError";
    this.code = code;
  }
}

// -- session state ---------------------------------------------------------

interface PluginSessionState {
  session: ObservedMonitoredSession;
  context: Track1PluginContext;
  ingest: (
    envelope: Track1CampaignSnapshotEnvelope
  ) => Promise<Track1CampaignSnapshotAck>;
  snapshotSequence: number;
  previousSnapshotSha256: string | null;
  ended: boolean;
}

// -- helpers ---------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const PERMITTED_TOOLS = new Set([
  "send_email",
  "read_file",
  "write_file",
  "call_api"
]);

const BLOCK_TOOL_NOT_PERMITTED = Object.freeze({
  block: true,
  blockReason: "tool_not_permitted"
});

const BLOCK_SECURITY_UNAVAILABLE = Object.freeze({
  block: true,
  blockReason: "security_monitor_unavailable"
});

function buildSnapshotEnvelope(
  state: PluginSessionState,
  result: BaseResult<SandboxRunResultDetails>
): Track1CampaignSnapshotEnvelope {
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: state.context.campaign_id,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: state.context.agent_id,
    scenario_id: state.context.scenario_id,
    case_id: state.context.case_id,
    attempt_id: state.context.attempt_id,
    attempt_index: state.context.attempt_index,
    sequence: state.snapshotSequence,
    previous_snapshot_sha256: state.previousSnapshotSha256,
    observed_at: new Date().toISOString(),
    result
  };
  const snapshotSha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256: snapshotSha256 };
}

async function ingestSessionSnapshot(
  state: PluginSessionState,
  result: BaseResult<SandboxRunResultDetails>
): Promise<void> {
  const envelope = buildSnapshotEnvelope(state, result);
  const ack = await state.ingest(envelope);
  state.previousSnapshotSha256 = ack.snapshot_sha256;
  state.snapshotSequence += 1;
}

// -- registration ----------------------------------------------------------

export function registerTrack1Plugin(
  api: Track1PluginApi,
  runtime: Track1PluginRuntime
): void {
  const sessions = new Map<string, PluginSessionState>();

  // Register the four campaign-local simulated tools
  registerTrack1Tools(api, runtime.toolRuntime);

  // -- session_start --------------------------------------------------

  api.on("session_start", async (event: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.session_id;
    const agentId = event.agent_id;
    const rawContext = event.context;
    if (
      !isNonEmptyString(sessionId) ||
      !isNonEmptyString(agentId) ||
      !isPlainObject(rawContext)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    if (sessions.has(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_session_exists");
    }

    // Normalize the campaign context (may throw Track1PluginContextError)
    const normalizedContext = normalizeTrack1PluginContext(rawContext);

    // Map to MonitorSessionContext
    const monitorContext = {
      task_id: sessionId.replace(/^session:/, "task:"),
      session_id: normalizedContext.session_id,
      model_ref: normalizedContext.model_ref,
      scenario_id: normalizedContext.scenario_id,
      case_id: normalizedContext.case_id
    };

    const monitorPorts: MonitorRuntimePorts = {
      now: runtime.ports.now ?? (() => new Date().toISOString()),
      nextId:
        runtime.ports.nextId ??
        ((kind: string) => `${kind}:${Date.now().toString(36)}`)
    };

    const session = new ObservedMonitoredSession(
      monitorContext,
      runtime.ports.provider,
      monitorPorts
    );

    sessions.set(sessionId, {
      session,
      context: normalizedContext,
      ingest: runtime.ports.ingestSnapshot,
      snapshotSequence: 1,
      previousSnapshotSha256: null,
      ended: false
    });
  });

  // -- llm_input ------------------------------------------------------

  api.on("llm_input", async (event: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.session_id;
    const rawEnvelope = event.envelope;
    if (
      !isNonEmptyString(sessionId) ||
      !isPlainObject(rawEnvelope)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // Normalize the model input envelope (may throw Track1PluginContextError)
    const envelope = normalizeTrack1ModelInputEnvelope(rawEnvelope);

    // Observe model input — use user_prompt as content
    state.session.observeModelInput({
      session_id: state.context.session_id,
      content: envelope.user_prompt,
      content_ref: `model://track1/input/${state.snapshotSequence}`
    });

    // Emit controlled memory observations for memory_entries (writes)
    for (const entry of envelope.memory_entries) {
      state.session.observeMemoryWrite({
        session_id: state.context.session_id,
        memory_entry_id: entry.memory_entry_id,
        content: entry.content_ref,
        content_ref: entry.content_ref
      });
    }

    // Emit controlled memory observations for retrieved_content (reads)
    for (const entry of envelope.retrieved_content) {
      state.session.observeMemoryRead({
        session_id: state.context.session_id,
        memory_entry_id: entry.memory_entry_id,
        content: entry.content_ref,
        content_ref: entry.content_ref
      });
    }
  });

  // -- llm_output -----------------------------------------------------

  api.on("llm_output", async (event: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.session_id;
    const content = event.content;
    const contentRef = event.content_ref;
    if (
      !isNonEmptyString(sessionId) ||
      !isNonEmptyString(content) ||
      !isNonEmptyString(contentRef)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // observeModelOutput may throw Track1MonitorError on provider failure
    await state.session.observeModelOutput({
      session_id: state.context.session_id,
      content,
      content_ref: contentRef
    });
  });

  // -- before_tool_call -----------------------------------------------

  api.on(
    "before_tool_call",
    async (event: unknown) => {
      if (!isPlainObject(event)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }
      const sessionId = event.session_id;
      const callId = event.call_id;
      const toolName = event.tool_name;
      const args = event.arguments;

      if (
        !isNonEmptyString(sessionId) ||
        !isNonEmptyString(callId) ||
        !isNonEmptyString(toolName)
      ) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }

      const state = sessions.get(sessionId);
      if (!state || state.ended) {
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      // Reject unknown tools before touching the adapter
      if (!PERMITTED_TOOLS.has(toolName)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }

      // Build SimulatedToolRequest for the adapter
      const request = {
        call_id: callId,
        session_id: state.context.session_id,
        scenario_id: state.context.scenario_id,
        case_id: state.context.case_id,
        tool_name: toolName,
        arguments: args
      };

      let outcome;
      try {
        outcome = await state.session.beforeTool(request);
      } catch {
        // Adapter threw — fail closed
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      if (outcome.disposition === "intercept") {
        // deny/ask: ingest the intercept snapshot (best-effort), then block
        try {
          await ingestSessionSnapshot(state, outcome.snapshot);
        } catch {
          // Ingest failure on intercept is still a block
        }
        const reason =
          outcome.decision.action === "deny"
            ? "policy_denied"
            : "policy_ask_required";
        return Object.freeze({ block: true, blockReason: reason });
      }

      // allow/alert: ingest snapshot BEFORE returning (acknowledgement barrier)
      try {
        await ingestSessionSnapshot(state, outcome.snapshot);
      } catch {
        // Ingest failure converts allow/alert into a block
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      return {};
    },
    { priority: 100, timeoutMs: 10_000 }
  );

  // -- after_tool_call ------------------------------------------------

  api.on("after_tool_call", async (event: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.session_id;
    const callId = event.call_id;
    const toolName = event.tool_name;
    const rawResult = event.result;

    if (
      !isNonEmptyString(sessionId) ||
      !isNonEmptyString(callId) ||
      !isNonEmptyString(toolName)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // Map native tool result to ObservedToolResult
    const status =
      isPlainObject(rawResult) && rawResult.status === "failed"
        ? "failed"
        : "success";
    const observedResult = {
      session_id: state.context.session_id,
      call_id: callId,
      tool_name: toolName,
      status,
      result_ref: `simulated-result://${callId}/${status}`,
      state_change: "simulated" as const
    };

    try {
      const afterSnapshot = state.session.afterTool(observedResult);
      await ingestSessionSnapshot(state, afterSnapshot);
    } catch {
      // Adapter or ingest failure — fail closed
      state.ended = true;
      throw new Track1PluginHookError("security_monitor_unavailable");
    }
  });

  // -- session_end ----------------------------------------------------

  api.on("session_end", async (event: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.session_id;
    if (!isNonEmptyString(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // Try to finalize and ingest a terminal snapshot
    try {
      const finalResult = state.session.finalize();
      await ingestSessionSnapshot(state, finalResult);
    } catch {
      // Finalize failed (e.g., pending tool) — try to ingest a snapshot
      try {
        const snapshot = state.session.snapshot();
        await ingestSessionSnapshot(state, snapshot);
      } catch {
        // Last resort: if even snapshot fails, just mark as ended
      }
    }

    state.ended = true;
    sessions.delete(sessionId);
  });
}
