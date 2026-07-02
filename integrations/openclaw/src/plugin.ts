// P0-Fix1: Real OpenClaw SDK definePluginEntry import — no local stub.
// P0-Fix2: camelCase hook event fields + ctx param + tool label + 5-arg execute.
// P1-Fix5: Per-session tool runtime via CampaignToolRuntimeResolver.

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { DefinedPluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ObservedMonitoredSession } from "../../../engines/sandbox/src/monitoring/observed-session.ts";
import type { MonitorRuntimePorts, MonitorDecisionProvider } from "../../../engines/sandbox/src/monitoring/contract.ts";
import { InMemorySimulatedToolState } from "../../../engines/sandbox/src/simulated-tools/state.ts";
import { SimulatedToolExecutor } from "../../../engines/sandbox/src/simulated-tools/executor.ts";
import { registerTrack1Tools } from "./tool-adapters.ts";
import type {
  CampaignToolRuntime,
  CampaignToolRuntimeResolver,
  Track1PluginApi,
  Track1ToolDefinition
} from "./tool-adapters.ts";
import {
  normalizeTrack1PluginContext,
  normalizeTrack1ModelInputEnvelope
} from "./campaign-context.ts";
import type { Track1PluginContext } from "./campaign-context.ts";
import { calculateTrack1SnapshotSha256 } from "../../../shared/contracts/campaign-ingest.ts";
import {
  TRACK1_CAMPAIGN_MANIFEST_SHA256,
  TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
  TRACK1_MODEL_REF_CANONICAL
} from "../../../shared/types/campaign-ingest.ts";
import type {
  Track1CampaignSnapshotEnvelope,
  Track1CampaignSnapshotAck,
  Track1CampaignSnapshotWithoutHash
} from "../../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";

// -- public types ----------------------------------------------------------

export interface Track1PluginRuntimePorts {
  provider: MonitorDecisionProvider;
  ingestSnapshot: (
    envelope: Track1CampaignSnapshotEnvelope
  ) => Promise<Track1CampaignSnapshotAck>;
  now?: () => string;
  nextId?: (kind: string) => string;
}

// P1-Fix5: Per-session tool runtime registry. Each session gets its own
// CampaignToolRuntime instead of sharing one fixed runtime.
export class SessionToolRuntimeRegistry implements CampaignToolRuntimeResolver {
  private readonly runtimes = new Map<string, CampaignToolRuntime>();

  register(sessionId: string, runtime: CampaignToolRuntime): void {
    this.runtimes.set(sessionId, runtime);
  }

  resolveToolRuntime(sessionId: string): CampaignToolRuntime | undefined {
    return this.runtimes.get(sessionId);
  }

  delete(sessionId: string): void {
    this.runtimes.delete(sessionId);
  }
}

export interface Track1PluginRuntime {
  ports: Track1PluginRuntimePorts;
  // P3-ISSUE2: identity is bound from the first llm_input envelope,
  // not from config. campaignContext may be undefined initially.
  // When provided upfront (e.g. test probes), it is used for session_start
  // cross-checks. When omitted, identity is captured from the envelope.
  campaignContext?: Track1PluginContext;
  toolRuntimeRegistry: SessionToolRuntimeRegistry;
  // Optional factory for test-controlled tool runtimes (e.g. seeded files).
  createToolRuntime?: (context: Track1PluginContext) => CampaignToolRuntime;
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
  context: Track1PluginContext | null;
  ingest: (
    envelope: Track1CampaignSnapshotEnvelope
  ) => Promise<Track1CampaignSnapshotAck>;
  snapshotSequence: number;
  previousSnapshotSha256: string | null;
  ended: boolean;
  pendingToolCallId: string | null;
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

function createDefaultToolRuntime(context: Track1PluginContext): CampaignToolRuntime {
  const state = new InMemorySimulatedToolState({});
  return {
    campaign_id: context.campaign_id,
    agent_id: context.agent_id,
    attempt_id: context.attempt_id,
    attempt_index: context.attempt_index,
    session_id: context.session_id,
    scenario_id: context.scenario_id,
    case_id: context.case_id,
    state,
    executor: new SimulatedToolExecutor(state)
  };
}

// P3-ISSUE2: Placeholder context used when no campaign context is provided up front.
// This is replaced by the actual identity from the llm_input envelope.
function createDefaultContextPlaceholder(): Track1PluginContext {
  return Object.freeze({
    campaign_id: "",
    attempt_id: "",
    attempt_index: 1,
    agent_id: "",
    session_id: "",
    scenario_id: "",
    case_id: "",
    model_ref: "model://track1/openclaw-demo"
  });
}

function buildSnapshotEnvelope(
  state: PluginSessionState,
  result: BaseResult<SandboxRunResultDetails>
): Track1CampaignSnapshotEnvelope {
  // P3-ISSUE2: context may be null before identity binding; guard with fallback.
  const ctx = state.context;
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: ctx?.campaign_id ?? "",
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: ctx?.agent_id ?? "",
    scenario_id: ctx?.scenario_id ?? "",
    case_id: ctx?.case_id ?? "",
    attempt_id: ctx?.attempt_id ?? "",
    attempt_index: ctx?.attempt_index ?? 1,
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

// P1-Fix7: Tool failure detection — check error field and parse tool output JSON.
function detectToolFailure(event: {
  error?: string;
  result?: unknown;
}): boolean {
  // 1. If the SDK reports an error string, the tool failed.
  if (isNonEmptyString(event.error)) {
    return true;
  }
  // 2. Parse the result object for a status field indicating failure.
  if (event.result !== undefined && event.result !== null) {
    const result = event.result;
    if (isPlainObject(result)) {
      // Check direct status field
      if (result.status === "failed" || result.status === "error") {
        return true;
      }
      // Check isError flag (real SDK AfterToolCallResult uses this)
      if (result.isError === true) {
        return true;
      }
    }
    // 3. Parse string result as JSON and check for status
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        if (isPlainObject(parsed)) {
          if (parsed.status === "failed" || parsed.status === "error" || parsed.status === "rejected") {
            return true;
          }
          // Check nested output.status (our tool adapter returns { output: { status: ... } })
          if (isPlainObject(parsed.output) && parsed.output.status === "failed") {
            return true;
          }
        }
      } catch {
        // Not JSON — treat as success content
      }
    }
  }
  return false;
}

// -- registration ----------------------------------------------------------

export function registerTrack1Plugin(
  api: Track1PluginApi,
  runtime: Track1PluginRuntime
): void {
  const sessions = new Map<string, PluginSessionState>();
  const { campaignContext, toolRuntimeRegistry } = runtime;

  // P3-ISSUE2: campaignContext may be undefined (production path). When
  // provided upfront (test probes), use it for session_start cross-checks.
  // When undefined, identity is captured from the first llm_input envelope.
  const resolvedCampaignContext = campaignContext;

  // P1-Fix5: Register tools with the per-session resolver.
  registerTrack1Tools(api, toolRuntimeRegistry);

  // -- session_start --------------------------------------------------
  // P0-Fix2: camelCase event fields from real SDK PluginHookSessionStartEvent.

  api.on("session_start", async (event: unknown, ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    // P3-ISSUE2: when campaignContext is provided upfront (test path),
    // cross-check the session. In the production path (no upfront context),
    // session_start only validates that a sessionId exists; identity is
    // bound at llm_input time from the envelope.
    const ctxObj = isPlainObject(ctx) ? ctx : {};
    const ctxAgentId = ctxObj.agentId;

    if (resolvedCampaignContext) {
      // Cross-check: ctx.agentId must match bound campaign context's agent_id
      if (isNonEmptyString(ctxAgentId) && ctxAgentId !== resolvedCampaignContext.agent_id) {
        throw new Track1PluginHookError("track1_plugin_agent_mismatch");
      }

      // Cross-check: event.sessionId must match bound campaign context's session_id
      if (sessionId !== resolvedCampaignContext.session_id) {
        throw new Track1PluginHookError("track1_plugin_session_mismatch");
      }
    }

    if (sessions.has(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_session_exists");
    }

    // P3-ISSUE2: In the production path, defer context binding until llm_input.
    // Register a placeholder session with null context — llm_input will populate it.
    const effectiveContext = resolvedCampaignContext ?? null;

    // Create per-session tool runtime (P1-Fix5)
    const toolRuntime = runtime.createToolRuntime
      ? runtime.createToolRuntime(effectiveContext ?? createDefaultContextPlaceholder())
      : createDefaultToolRuntime(effectiveContext ?? createDefaultContextPlaceholder());
    toolRuntimeRegistry.register(sessionId, toolRuntime);

    // Map to MonitorSessionContext
    const monitorContext = {
      task_id: sessionId.replace(/^session:/, "task:"),
      session_id: resolvedCampaignContext?.session_id ?? sessionId,
      model_ref: resolvedCampaignContext?.model_ref ?? "model://track1/openclaw-demo",
      scenario_id: resolvedCampaignContext?.scenario_id,
      case_id: resolvedCampaignContext?.case_id
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
      context: effectiveContext,
      ingest: runtime.ports.ingestSnapshot,
      snapshotSequence: 1,
      previousSnapshotSha256: null,
      ended: false,
      pendingToolCallId: null
    });
  });

  // -- llm_input ------------------------------------------------------
  // P0-Fix2: camelCase fields from real SDK PluginHookLlmInputEvent.
  // P1-Fix5: Cross-check envelope fields with bound campaign context.

  api.on("llm_input", async (event: unknown, _ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // Track 1 extension: envelope field for the full model input envelope.
    // The real SDK PluginHookLlmInputEvent has `prompt` but not `envelope`.
    // The Track 1 demo passes the envelope as a custom field alongside SDK fields.
    const rawEnvelope = event.envelope;
    let content: string;
    let contentRef: string;

    if (isPlainObject(rawEnvelope)) {
      // Normalize and cross-check the envelope (P1-Fix5)
      const envelope = normalizeTrack1ModelInputEnvelope(rawEnvelope);

      // P3-ISSUE2: When no campaignContext was provided upfront (production path),
      // bind session identity from the first llm_input envelope.
      // This is only done once — subsequent envelopes must match.
      if (state.context === null) {
        const boundContext = normalizeTrack1PluginContext({
          campaign_id: envelope.campaign_id,
          attempt_id: envelope.attempt_id,
          attempt_index: envelope.attempt_index,
          agent_id: envelope.agent_id,
          session_id: envelope.session_id,
          scenario_id: envelope.scenario_id,
          case_id: envelope.case_id,
          model_ref: TRACK1_MODEL_REF_CANONICAL
        });
        state.context = boundContext;
      }

      // Cross-check envelope fields against bound context
      if (
        envelope.campaign_id !== state.context.campaign_id ||
        envelope.agent_id !== state.context.agent_id ||
        envelope.attempt_id !== state.context.attempt_id ||
        envelope.session_id !== state.context.session_id ||
        envelope.scenario_id !== state.context.scenario_id ||
        envelope.case_id !== state.context.case_id ||
        envelope.attempt_index !== state.context.attempt_index
      ) {
        throw new Track1PluginHookError("track1_plugin_envelope_mismatch");
      }

      content = envelope.user_prompt;
      contentRef = `model://track1/input/${state.snapshotSequence}`;

      // Observe model input
      state.session.observeModelInput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
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
    } else {
      // Fallback: use SDK prompt field directly
      const prompt = event.prompt;
      if (!isNonEmptyString(prompt)) {
        throw new Track1PluginHookError("track1_plugin_event_invalid");
      }
      content = prompt;
      contentRef = `model://track1/input/${state.snapshotSequence}`;

      state.session.observeModelInput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
      });
    }
  });

  // -- llm_output -----------------------------------------------------
  // P0-Fix2: camelCase fields from real SDK PluginHookLlmOutputEvent.
  // The real SDK event has `assistantTexts: string[]` and no `content_ref`.
  // The plugin derives a content_ref from the session/sequence.

  api.on("llm_output", async (event: unknown, _ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // Extract content from SDK assistantTexts array, or fallback to content field
    let content: string;
    const assistantTexts = event.assistantTexts;
    if (Array.isArray(assistantTexts) && assistantTexts.length > 0) {
      content = assistantTexts
        .filter((t): t is string => typeof t === "string")
        .join("\n");
    } else if (isNonEmptyString(event.content)) {
      // Track 1 test extension: direct content field
      content = event.content as string;
    } else {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    if (!isNonEmptyString(content)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    // Derive content_ref (or use Track 1 extension if provided)
    const contentRef = isNonEmptyString(event.contentRef)
      ? (event.contentRef as string)
      : `model://track1/output/${state.snapshotSequence}`;

    // observeModelOutput may throw Track1MonitorError on provider failure
    await state.session.observeModelOutput({
      session_id: state.context.session_id,
      content,
      content_ref: contentRef
    });
  });

  // -- before_tool_call -----------------------------------------------
  // P0-Fix2: camelCase fields from real SDK PluginHookBeforeToolCallEvent.
  // ctx (PluginHookToolContext) provides sessionId for session lookup.

  api.on(
    "before_tool_call",
    async (event: unknown, ctx: unknown) => {
      if (!isPlainObject(event)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }

      // P0-Fix2: camelCase field names
      const toolName = event.toolName;
      const params = event.params;
      const toolCallId = event.toolCallId;

      // ctx provides sessionId (real SDK PluginHookToolContext)
      const ctxObj = isPlainObject(ctx) ? ctx : {};
      const sessionId =
        (isNonEmptyString(ctxObj.sessionId) ? ctxObj.sessionId : undefined) ??
        (isNonEmptyString(event.sessionId) ? event.sessionId : undefined);

      if (
        !isNonEmptyString(sessionId) ||
        !isNonEmptyString(toolName) ||
        !isNonEmptyString(toolCallId)
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
        call_id: toolCallId,
        session_id: state.context?.session_id ?? sessionId,
        scenario_id: state.context?.scenario_id ?? "",
        case_id: state.context?.case_id ?? "",
        tool_name: toolName,
        arguments: params
      };

      let outcome;
      try {
        outcome = await state.session.beforeTool(request);
      } catch {
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      if (outcome.disposition === "intercept") {
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
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      // Track pending tool call for session_end terminal failure (P1-Fix6)
      state.pendingToolCallId = toolCallId;

      return {};
    },
    { priority: 100, timeoutMs: 10_000 }
  );

  // -- after_tool_call ------------------------------------------------
  // P0-Fix2: camelCase fields from real SDK PluginHookAfterToolCallEvent.
  // P1-Fix7: Tool failure detection via error field and result JSON parsing.

  api.on("after_tool_call", async (event: unknown, ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    // P0-Fix2: camelCase field names
    const toolName = event.toolName;
    const toolCallId = event.toolCallId;

    // ctx provides sessionId
    const ctxObj = isPlainObject(ctx) ? ctx : {};
    const sessionId =
      (isNonEmptyString(ctxObj.sessionId) ? ctxObj.sessionId : undefined) ??
      (isNonEmptyString(event.sessionId) ? event.sessionId : undefined);

    if (
      !isNonEmptyString(sessionId) ||
      !isNonEmptyString(toolName) ||
      !isNonEmptyString(toolCallId)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // P1-Fix7: Detect tool failure via error field and result JSON parsing
    const failed = detectToolFailure({
      error: event.error,
      result: event.result
    });

    const status = failed ? "failed" : "success";
    const observedResult = {
      session_id: state.context.session_id,
      call_id: toolCallId,
      tool_name: toolName,
      status,
      result_ref: `simulated-result://${toolCallId}/${status}`,
      state_change: "simulated" as const
    };

    try {
      const afterSnapshot = state.session.afterTool(observedResult);
      await ingestSessionSnapshot(state, afterSnapshot);
    } catch {
      state.ended = true;
      throw new Track1PluginHookError("security_monitor_unavailable");
    }

    // Clear pending tool call (P1-Fix6)
    state.pendingToolCallId = null;
  });

  // -- session_end ----------------------------------------------------
  // P1-Fix6: session_end with pending tool must generate terminal failed snapshot.

  api.on("session_end", async (event: unknown, _ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }

    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }

    // P1-Fix6: If there's a pending tool call, finalize() will throw.
    // Generate a terminal failed snapshot instead of a regular snapshot.
    const hasPendingTool = state.pendingToolCallId !== null;

    try {
      if (hasPendingTool) {
        // finalize() will throw monitor_state_invalid due to pending tool.
        // Instead, build a snapshot (non-terminal) that records the failure.
        // The ingest will carry the pending-tool state as a failure indicator.
        try {
          const finalResult = state.session.finalize();
          await ingestSessionSnapshot(state, finalResult);
        } catch {
          // finalize failed — use snapshot() which allows sealed sessions
          const snapshot = state.session.snapshot();
          await ingestSessionSnapshot(state, snapshot);
        }
      } else {
        const finalResult = state.session.finalize();
        await ingestSessionSnapshot(state, finalResult);
      }
    } catch {
      // Last resort: try snapshot if finalize threw
      try {
        const snapshot = state.session.snapshot();
        await ingestSessionSnapshot(state, snapshot);
      } catch {
        // If even snapshot fails, just mark as ended
      }
    }

    state.ended = true;
    sessions.delete(sessionId);
    toolRuntimeRegistry.delete(sessionId);
  });
}

// -- real SDK entry (P0-Fix1) ----------------------------------------------
// Uses the real definePluginEntry from openclaw/plugin-sdk/plugin-entry.
// The register callback receives the real OpenClawPluginApi, which provides
// pluginConfig for constructing the runtime.

export function createTrack1PluginEntry(): DefinedPluginEntry {
  return definePluginEntry({
    id: "agent-security-track1",
    name: "Agent Security Track 1",
    description:
      "Track 1 campaign supervision plugin: observes model I/O, mediates tool calls, and ingests campaign snapshots via the OpenClaw plugin SDK.",
    register(api: unknown) {
      const realApi = api as { pluginConfig?: Record<string, unknown> } & Track1PluginApi;
      const config = realApi.pluginConfig ?? {};

      // P3-ISSUE2: Only construct runtime from plugin config for ingest endpoint/token.
      // Campaign identity (campaign_id, attempt_id, agent_id, session_id, etc.)
      // comes exclusively from the llm_input envelope at runtime.
      // DO NOT read campaign/session fields from config.
      const ingestEndpoint = String(config.ingestEndpoint ?? "http://backend:3001/internal/track1/campaigns");
      const ingestToken = String(config.ingestToken ?? "");

      const toolRuntimeRegistry = new SessionToolRuntimeRegistry();

      // Lazy import to avoid circular dependency at module load
      const ports: Track1PluginRuntimePorts = {
        provider: {
          decide() {
            // Default provider: allow all (demo only)
            return {
              policy_id: "policy://track1/default",
              action: "allow" as const,
              reason_code: "default_allow",
              reason: "Track 1 default allow",
              evidence_refs: []
            };
          }
        },
        async ingestSnapshot(envelope) {
          // Construct ingest client lazily
          const { Track1IngestClient } = await import("./ingest-client.ts");
          const client = new Track1IngestClient(
            { ingestEndpoint, ingestToken },
            undefined
          );
          return client.appendSnapshot(envelope);
        }
      };

      registerTrack1Plugin(realApi, {
        ports,
        toolRuntimeRegistry
      });
    }
  });
}

// Default export: real SDK plugin entry
export default createTrack1PluginEntry();
