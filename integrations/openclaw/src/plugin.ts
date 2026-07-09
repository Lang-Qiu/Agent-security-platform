// P0-Fix1: Real OpenClaw SDK definePluginEntry import — no local stub.
// P0-Fix2: camelCase hook event fields + ctx param + tool label + 5-arg execute.
// P1-Fix5: Per-session tool runtime via CampaignToolRuntimeResolver.

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { DefinedPluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ObservedMonitoredSession } from "../../../engines/sandbox/src/monitoring/observed-session.ts";
import type { MonitorRuntimePorts, MonitorDecisionProvider } from "../../../engines/sandbox/src/monitoring/contract.ts";
import { RuleBasedDecisionProvider } from "../../../engines/sandbox/src/base-filter/provider.ts";
import { composeTrack1FilterModelRequest } from "../../../engines/sandbox/src/base-filter/context-envelope.ts";
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
  context: Track1PluginContext;
  ingest: (
    envelope: Track1CampaignSnapshotEnvelope
  ) => Promise<Track1CampaignSnapshotAck>;
  snapshotSequence: number;
  previousSnapshotSha256: string | null;
  ended: boolean;
  pendingToolCallId: string | null;
  /** P4-ISSUE4: Track the tool name alongside the call ID for terminal failure */
  pendingToolCallToolName: string | null;
  // Bug #9: The OpenClaw direct CLI harness emits agent_end BEFORE
  // llm_output. When agent_end arrives and the session still has a
  // pending model input (no output observed yet), we cannot finalize.
  // Mark the session as "agentEndedPendingOutput" and keep it alive so
  // llm_output can observe the output and finalize.
  agentEndedPendingOutput: boolean;
  // Bug #9: When agent_end fires first with success=false, we need to
  // remember the failure flag so llm_output can finalize as failed.
  agentEndedFailed: boolean;
  // Bug #9: Track whether llm_output has been observed. When false,
  // finalize() would seal the session (because there's a pending input),
  // making observeModelOutput impossible afterwards.
  modelOutputObserved: boolean;
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

const OPENCLAW_BOUNDARY_PREFIX =
  /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]\r\n]{0,128}\] /;

function toRuntimeSessionId(sessionId: string): string {
  return sessionId.replace(/^session:/, "session-");
}

function toRuntimeAgentId(agentId: string): string {
  return agentId.replaceAll(":", "-");
}

function runtimeIdentityMatches(
  runtimeValue: string,
  canonicalValue: string,
  convert: (value: string) => string
): boolean {
  return runtimeValue === canonicalValue || runtimeValue === convert(canonicalValue);
}

function parseModelInputEnvelope(
  event: Record<string, unknown>
): ReturnType<typeof normalizeTrack1ModelInputEnvelope> {
  if (isPlainObject(event.envelope)) {
    return normalizeTrack1ModelInputEnvelope(event.envelope);
  }
  if (!isNonEmptyString(event.prompt)) {
    throw new Track1PluginHookError("track1_plugin_event_invalid");
  }
  const prompt = event.prompt.replace(OPENCLAW_BOUNDARY_PREFIX, "");
  try {
    return normalizeTrack1ModelInputEnvelope(JSON.parse(prompt));
  } catch {
    throw new Track1PluginHookError("track1_plugin_event_invalid");
  }
}

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

function buildSnapshotEnvelope(
  state: PluginSessionState,
  result: BaseResult<SandboxRunResultDetails>
): Track1CampaignSnapshotEnvelope {
  const ctx = state.context;
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: ctx.campaign_id,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: ctx.agent_id,
    scenario_id: ctx.scenario_id,
    case_id: ctx.case_id,
    attempt_id: ctx.attempt_id,
    attempt_index: ctx.attempt_index,
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
      // P5-ISSUE5: "rejected" is NOT a tool failure — the tool adapter
      // rejected the call (e.g. target_not_allowed), and the execution
      // succeeded at rejecting. It must be recorded as a tool execution
      // result, not a failure. The rejection_code is preserved in the
      // result payload so downstream policy can inspect it.
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
          // P5-ISSUE5: "rejected" is also excluded here — same rationale.
          if (parsed.status === "failed" || parsed.status === "error") {
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
  const pendingSessionStarts = new Set<string>();
  const { campaignContext, toolRuntimeRegistry } = runtime;

  // P3-ISSUE2: campaignContext may be undefined (production path). When
  // provided upfront (test probes), use it for session_start cross-checks.
  // When undefined, identity is captured from the first llm_input envelope.
  const resolvedCampaignContext = campaignContext;

  // P1-Fix5: Register tools with the per-session resolver.
  registerTrack1Tools(api, toolRuntimeRegistry);

  const createBoundSession = (
    runtimeSessionId: string,
    context: Track1PluginContext
  ): PluginSessionState => {
    if (sessions.has(runtimeSessionId)) {
      throw new Track1PluginHookError("track1_plugin_session_exists");
    }
    const toolRuntime = runtime.createToolRuntime
      ? runtime.createToolRuntime(context)
      : createDefaultToolRuntime(context);
    toolRuntimeRegistry.register(runtimeSessionId, toolRuntime);
    const monitorPorts: MonitorRuntimePorts = {
      now: runtime.ports.now ?? (() => new Date().toISOString()),
      nextId:
        runtime.ports.nextId ??
        ((kind: string) => `${kind}:${Date.now().toString(36)}`)
    };
    const state: PluginSessionState = {
      session: new ObservedMonitoredSession(
        {
          task_id: context.session_id.replace(/^session:/, "task:"),
          session_id: context.session_id,
          model_ref: context.model_ref,
          scenario_id: context.scenario_id,
          case_id: context.case_id
        },
        runtime.ports.provider,
        monitorPorts
      ),
      context,
      ingest: runtime.ports.ingestSnapshot,
      snapshotSequence: 1,
      previousSnapshotSha256: null,
      ended: false,
      pendingToolCallId: null,
      pendingToolCallToolName: null,
      agentEndedPendingOutput: false,
      agentEndedFailed: false,
      modelOutputObserved: false
    };
    sessions.set(runtimeSessionId, state);
    pendingSessionStarts.delete(runtimeSessionId);
    return state;
  };

  const finalizeBoundSession = async (
    runtimeSessionId: string,
    failed: boolean
  ): Promise<void> => {
    const state = sessions.get(runtimeSessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    // Bug #9: The OpenClaw direct CLI harness may emit agent_end BEFORE
    // llm_output. When that happens, the session has a pending model input
    // without a matching output. Calling finalize() would seal the session
    // and make observeModelOutput impossible. Instead, defer finalization:
    // mark the session as pending output so llm_output can observe the
    // output and finalize later.
    if (!state.modelOutputObserved && !failed) {
      state.agentEndedPendingOutput = true;
      state.agentEndedFailed = false;
      return;
    }
    try {
      if (state.pendingToolCallId !== null) {
        try {
          const failedSnapshot = state.session.afterTool({
            session_id: state.context.session_id,
            call_id: state.pendingToolCallId,
            tool_name: state.pendingToolCallToolName ?? "unknown",
            status: "failed",
            result_ref:
              `simulated-result://${state.pendingToolCallId}/failed`,
            state_change: "simulated"
          });
          await ingestSessionSnapshot(state, failedSnapshot);
        } catch {
          // The finalization attempt below remains fail-closed.
        }
      }
      if (failed) {
        await ingestSessionSnapshot(state, state.session.fail());
        return;
      }
      const finalResult = state.session.finalize();
      await ingestSessionSnapshot(state, finalResult);
    } catch {
      let recoveredFailedSnapshot = false;
      try {
        const snapshot = state.session.snapshot();
        if (snapshot.status === "failed") {
          await ingestSessionSnapshot(state, snapshot);
          recoveredFailedSnapshot = true;
        }
      } catch {
        // No raw provider or model error crosses the plugin boundary.
      }
      if (!recoveredFailedSnapshot) {
        throw new Track1PluginHookError("security_monitor_unavailable");
      }
    } finally {
      // Bug #9: If we deferred finalization (agentEndedPendingOutput), keep
      // the session alive so llm_output can still observe the output.
      if (state.agentEndedPendingOutput) {
        return;
      }
      state.ended = true;
      sessions.delete(runtimeSessionId);
      pendingSessionStarts.delete(runtimeSessionId);
      toolRuntimeRegistry.delete(runtimeSessionId);
    }
  };

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
      if (
        isNonEmptyString(ctxAgentId) &&
        !runtimeIdentityMatches(
          ctxAgentId,
          resolvedCampaignContext.agent_id,
          toRuntimeAgentId
        )
      ) {
        throw new Track1PluginHookError("track1_plugin_agent_mismatch");
      }

      // Cross-check: event.sessionId must match bound campaign context's session_id
      if (
        !runtimeIdentityMatches(
          sessionId,
          resolvedCampaignContext.session_id,
          toRuntimeSessionId
        )
      ) {
        throw new Track1PluginHookError("track1_plugin_session_mismatch");
      }
    }

    if (sessions.has(sessionId) || pendingSessionStarts.has(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_session_exists");
    }

    // The direct agent harness may omit session_start entirely. When this
    // hook is present without an upfront context, reserve the runtime id and
    // bind the canonical identity from llm_input.
    if (resolvedCampaignContext) {
      createBoundSession(sessionId, resolvedCampaignContext);
    } else {
      pendingSessionStarts.add(sessionId);
    }
  });

  // -- llm_input ------------------------------------------------------
  // P0-Fix2: camelCase fields from real SDK PluginHookLlmInputEvent.
  // P1-Fix5: Cross-check envelope fields with bound campaign context.

  api.on("llm_input", async (event: unknown, ctx: unknown) => {
    if (!isPlainObject(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const runtimeSessionId = event.sessionId;
    if (!isNonEmptyString(runtimeSessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const envelope = parseModelInputEnvelope(event);
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
    if (
      !runtimeIdentityMatches(
        runtimeSessionId,
        boundContext.session_id,
        toRuntimeSessionId
      )
    ) {
      throw new Track1PluginHookError("track1_plugin_session_mismatch");
    }
    const ctxObject = isPlainObject(ctx) ? ctx : {};
    if (
      isNonEmptyString(ctxObject.sessionId) &&
      ctxObject.sessionId !== runtimeSessionId
    ) {
      throw new Track1PluginHookError("track1_plugin_session_mismatch");
    }
    if (
      isNonEmptyString(ctxObject.agentId) &&
      !runtimeIdentityMatches(
        ctxObject.agentId,
        boundContext.agent_id,
        toRuntimeAgentId
      )
    ) {
      throw new Track1PluginHookError("track1_plugin_agent_mismatch");
    }
    const state =
      sessions.get(runtimeSessionId) ??
      createBoundSession(runtimeSessionId, boundContext);
    if (state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    let content: string;
    let contentRef: string;

    {

      // P3-ISSUE2: When no campaignContext was provided upfront (production path),
      // bind session identity from the first llm_input envelope.
      // This is only done once — subsequent envelopes must match.
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

      const filterRequest = composeTrack1FilterModelRequest({
        user_prompt: envelope.user_prompt,
        retrieved_content: envelope.retrieved_content.map(
          (entry) => entry.content
        ),
        memory_entries: envelope.memory_entries.map((entry) => ({
          memory_id: entry.memory_entry_id,
          content: entry.content
        }))
      });
      content = filterRequest.content;
      contentRef = filterRequest.content_ref;

      // Observe model input
      state.session.observeModelInput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
      });

      // Emit controlled memory observations for memory_entries (writes)
      // P6-ISSUE6: Propagate content_sha256 from the envelope so the monitor
      // uses the hash from the envelope rather than re-hashing the content_ref.
      for (const entry of envelope.memory_entries) {
        state.session.observeMemoryWrite({
          session_id: state.context.session_id,
          memory_entry_id: entry.memory_entry_id,
          content: entry.content,
          content_ref: entry.content_ref,
          content_sha256: entry.content_sha256
        });
      }

      // Emit controlled memory observations for retrieved_content (reads)
      for (const entry of envelope.retrieved_content) {
        state.session.observeMemoryRead({
          session_id: state.context.session_id,
          memory_entry_id: entry.memory_entry_id,
          content: entry.content,
          content_ref: entry.content_ref,
          content_sha256: entry.content_sha256
        });
      }
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
    state.modelOutputObserved = true;

    // Bug #9: If agent_end already fired (agentEndedPendingOutput), the
    // session was kept alive so this hook could observe the output. Now
    // that the output has been observed, finalize and clean up.
    if (state.agentEndedPendingOutput) {
      try {
        if (state.agentEndedFailed) {
          await ingestSessionSnapshot(state, state.session.fail());
        } else {
          const finalResult = state.session.finalize();
          await ingestSessionSnapshot(state, finalResult);
        }
      } catch {
        // Best-effort recovery: try to ingest a failed snapshot.
        try {
          const snapshot = state.session.snapshot();
          if (snapshot.status === "failed") {
            await ingestSessionSnapshot(state, snapshot);
          }
        } catch {
          // No raw provider or model error crosses the plugin boundary.
        }
      } finally {
        state.ended = true;
        state.agentEndedPendingOutput = false;
        sessions.delete(sessionId);
        pendingSessionStarts.delete(sessionId);
        toolRuntimeRegistry.delete(sessionId);
      }
    }
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
      state.pendingToolCallToolName = toolName;

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

    // P1-Fix7: Detect tool failure via error field and result JSON parsing.
    // P5-ISSUE5: Use detectToolFailure() which rejects "rejected" status as
    // a non-failure — adapter-rejected calls are tool executions, not failures.
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
    state.pendingToolCallToolName = null;
  });

  // -- agent_end ------------------------------------------------------
  // `openclaw agent` uses the harness lifecycle and does not emit
  // session_start/session_end for each direct run. agent_end is therefore
  // the authoritative per-attempt terminal boundary for the campaign CLI.

  api.on("agent_end", async (event: unknown, ctx: unknown) => {
    if (
      !isPlainObject(event) ||
      typeof event.success !== "boolean" ||
      !Array.isArray(event.messages) ||
      !isPlainObject(ctx) ||
      !isNonEmptyString(ctx.sessionId)
    ) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    await finalizeBoundSession(ctx.sessionId, event.success === false);
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

    await finalizeBoundSession(sessionId, false);
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
        provider: new RuleBasedDecisionProvider(),
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
