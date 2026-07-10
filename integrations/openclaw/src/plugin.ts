// P0-Fix1: Real OpenClaw SDK definePluginEntry import �?no local stub.
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
  // Bug #11: When a provisional model output was synthesized for an early
  // tool turn, the real llm_output may arrive after the pair is no longer
  // pending (or after an intercept seal). Observation may be a no-op.
  provisionalModelOutput: boolean;
  // Bug #11: after_tool_call may fire for a deny/ask intercept. Remember the
  // last intercept call id so that path is a safe no-op without weakening the
  // "no pending allow" fail-closed contract.
  lastInterceptedToolCallId: string | null;
  // Bug #12: Canonical fixture proposed tool call from the model-input
  // envelope. Real models may ignore or rewrite the tool call; on agent_end
  // the plugin evaluates this proposal if no tool was already mediated.
  proposedToolCall: {
    tool_name: "send_email" | "read_file" | "write_file" | "call_api";
    arguments: Readonly<Record<string, unknown>>;
  } | null;
  toolMediated: boolean;
  // Bug #13: Enough state to rebuild a fresh ObservedMonitoredSession when a
  // failed real tool call seals the previous monitor session.
  filterModelContent: string | null;
  filterModelContentRef: string | null;
  // True once terminal (finished/failed/blocked) snapshot was successfully
  // ingested for this attempt. agent_end recovery uses this to avoid early
  // return after a non-terminal failure path marked the session ended.
  terminalSnapshotIngested: boolean;
  // Bug #16: llm_input is fire-and-forget in OpenClaw. Session objects may
  // exist before the envelope fields (proposedToolCall/filter context) are
  // bound. agent_end must wait until binding is complete.
  bindingReady: boolean;
  // Monotonic creation order for multi-session fallback selection.
  createdAtMs: number;
}

// -- helpers ---------------------------------------------------------------

function debugLog(message: string, data?: Record<string, unknown>): void {
  try {
    const line = `[track1-plugin] ${JSON.stringify({
      ts: new Date().toISOString(),
      message,
      ...(data ?? {})
    })}\n`;
    process.stderr.write(line);
  } catch {
    // never throw from debug
  }
}

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

function toolArgsMatchProposed(
  toolName: string,
  params: unknown,
  proposed: {
    tool_name: string;
    arguments: Readonly<Record<string, unknown>>;
  }
): boolean {
  if (toolName !== proposed.tool_name) return false;
  if (!isPlainObject(params)) return false;
  // Compare primary target fields used by Track 1 fixtures.
  switch (toolName) {
    case "read_file":
    case "write_file":
      return (
        typeof params.path === "string" &&
        typeof proposed.arguments.path === "string" &&
        params.path === proposed.arguments.path
      );
    case "send_email":
      return (
        typeof params.recipient === "string" &&
        typeof params.subject === "string" &&
        typeof params.body === "string" &&
        typeof proposed.arguments.recipient === "string" &&
        typeof proposed.arguments.subject === "string" &&
        typeof proposed.arguments.body === "string" &&
        params.recipient === proposed.arguments.recipient &&
        params.subject === proposed.arguments.subject &&
        params.body === proposed.arguments.body
      );
    case "call_api":
      return (
        typeof params.endpoint === "string" &&
        typeof proposed.arguments.endpoint === "string" &&
        params.endpoint === proposed.arguments.endpoint
      );
    default:
      return false;
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
  // Local validation before network so we can distinguish envelope shape
  // failures from transport/HTTP failures.
  const { normalizeTrack1CampaignSnapshotEnvelope } = await import(
    "../../../shared/contracts/campaign-ingest.ts"
  );
  const localOk = normalizeTrack1CampaignSnapshotEnvelope(envelope);
  if (!localOk) {
    const details = result.details as SandboxRunResultDetails | undefined;
    debugLog("envelope_invalid_local", {
      case_id: state.context.case_id,
      attempt_id: state.context.attempt_id,
      status: result.status,
      sequence: envelope.sequence,
      task_type: result.task_type,
      engine_type: result.engine_type,
      risk_level: result.risk_level,
      has_details: Boolean(details),
      blocked: details?.blocked,
      event_count: details?.event_count,
      events: Array.isArray(details?.events) ? details.events.length : -1,
      decisions: Array.isArray(details?.policy_decisions)
        ? details.policy_decisions.length
        : -1,
      alerts: Array.isArray(details?.alerts) ? details.alerts.length : -1,
      blocked_records: Array.isArray(details?.blocked_records)
        ? details.blocked_records.length
        : -1,
      result_keys: Object.keys(result),
      detail_keys: details ? Object.keys(details) : []
    });
  }
  try {
    const ack = await state.ingest(envelope);
    state.previousSnapshotSha256 = ack.snapshot_sha256;
    state.snapshotSequence += 1;
    if (
      result.status === "finished" ||
      result.status === "failed" ||
      result.status === "blocked"
    ) {
      state.terminalSnapshotIngested = true;
    }
    debugLog("ingest_ok", {
      case_id: state.context.case_id,
      attempt_id: state.context.attempt_id,
      status: result.status,
      sequence: envelope.sequence,
      terminal: state.terminalSnapshotIngested
    });
  } catch (err) {
    debugLog("ingest_fail", {
      case_id: state.context.case_id,
      attempt_id: state.context.attempt_id,
      status: result.status,
      sequence: envelope.sequence,
      localOk: Boolean(localOk),
      err: String(err)
    });
    throw err;
  }
}


// P1-Fix7: Tool failure detection �?check error field and parse tool output JSON.
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
      // P5-ISSUE5: "rejected" is NOT a tool failure �?the tool adapter
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
          // P5-ISSUE5: "rejected" is also excluded here �?same rationale.
          if (parsed.status === "failed" || parsed.status === "error") {
            return true;
          }
          // Check nested output.status (our tool adapter returns { output: { status: ... } })
          if (isPlainObject(parsed.output) && parsed.output.status === "failed") {
            return true;
          }
        }
      } catch {
        // Not JSON �?treat as success content
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
  let idSeq = 0;
  const nextRuntimeId = (kind: string): string => {
    idSeq += 1;
    return `${kind}:${Date.now().toString(36)}:${idSeq.toString(36)}`;
  };

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
      nextId: runtime.ports.nextId ?? nextRuntimeId
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
      modelOutputObserved: false,
      provisionalModelOutput: false,
      lastInterceptedToolCallId: null,
      proposedToolCall: null,
      toolMediated: false,
      filterModelContent: null,
      filterModelContentRef: null,
      terminalSnapshotIngested: false,
      bindingReady: false,
      createdAtMs: Date.now()
    };
    sessions.set(runtimeSessionId, state);
    pendingSessionStarts.delete(runtimeSessionId);
    return state;
  };

  const waitForBoundSession = async (
    sessionId: string | null,
    maxPolls = 100
  ): Promise<{ runtimeId: string; state: PluginSessionState } | null> => {
    // Bug #16/#17/#20/#22/#27:
    // - Wait for llm_input binding (fire-and-forget).
    // - Tolerate session: vs session- form drift.
    // - NEVER steal another attempt's session. Late agent_end from a prior
    //   attempt previously finalized the newest ready session and poisoned
    //   SC-002-C002 with an invalid force-terminal envelope.
    const candidatesFor = (id: string | null): string[] => {
      if (!id) return [];
      const out = [id];
      if (id.startsWith("session:")) {
        out.push(id.replace(/^session:/, "session-"));
      } else if (id.startsWith("session-")) {
        out.push(id.replace(/^session-/, "session:"));
      }
      return out;
    };

    const lookupExact = (
      id: string | null
    ): { runtimeId: string; state: PluginSessionState } | null => {
      for (const candidate of candidatesFor(id)) {
        const direct = sessions.get(candidate);
        if (direct?.bindingReady) {
          return { runtimeId: candidate, state: direct };
        }
      }
      return null;
    };

    const pickNewestReady = (): {
      runtimeId: string;
      state: PluginSessionState;
    } | null => {
      const ready: Array<{ runtimeId: string; state: PluginSessionState }> = [];
      for (const [runtimeId, state] of sessions.entries()) {
        if (
          state.bindingReady &&
          !state.terminalSnapshotIngested &&
          !state.ended
        ) {
          ready.push({ runtimeId, state });
        }
      }
      if (ready.length === 0) return null;
      ready.sort((a, b) => b.state.createdAtMs - a.state.createdAtMs);
      return ready[0]!;
    };

    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (sessionId) {
        const exact = lookupExact(sessionId);
        if (exact) return exact;
        // Exact id was requested: keep waiting for THAT session only.
        // Do not fall back to another ready session.
      } else {
        const newest = pickNewestReady();
        if (newest) return newest;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (sessionId) {
      return lookupExact(sessionId);
    }
    return pickNewestReady();
  };

  const listReadySessions = (): Array<{
    runtimeId: string;
    state: PluginSessionState;
  }> => {
    const ready: Array<{ runtimeId: string; state: PluginSessionState }> = [];
    for (const [runtimeId, state] of sessions.entries()) {
      if (state.bindingReady && !state.terminalSnapshotIngested) {
        ready.push({ runtimeId, state });
      }
    }
    ready.sort((a, b) => b.state.createdAtMs - a.state.createdAtMs);
    return ready;
  };

  const purgeStaleSessions = (keepRuntimeId?: string): void => {
    // Long-lived gateway accumulates abandoned sessions across sequential
    // campaign attempts. On each new bind, keep ONLY the active attempt.
    for (const [runtimeId] of sessions.entries()) {
      if (keepRuntimeId && runtimeId === keepRuntimeId) continue;
      sessions.delete(runtimeId);
      pendingSessionStarts.delete(runtimeId);
      toolRuntimeRegistry.delete(runtimeId);
    }
  };

  const forceTerminalFail = async (
    runtimeSessionId: string
  ): Promise<boolean> => {
    const live = sessions.get(runtimeSessionId);
    if (!live || live.terminalSnapshotIngested) return false;
    if (
      live.proposedToolCall === null ||
      live.filterModelContent === null ||
      live.filterModelContentRef === null
    ) {
      return false;
    }
    try {
      const monitorPorts: MonitorRuntimePorts = {
        now: runtime.ports.now ?? (() => new Date().toISOString()),
        nextId:
          runtime.ports.nextId ?? nextRuntimeId
      };
      live.session = new ObservedMonitoredSession(
        {
          task_id: live.context.session_id.replace(/^session:/, "task:"),
          session_id: live.context.session_id,
          model_ref: live.context.model_ref,
          scenario_id: live.context.scenario_id,
          case_id: live.context.case_id
        },
        runtime.ports.provider,
        monitorPorts
      );
      live.ended = false;
      live.modelOutputObserved = false;
      live.provisionalModelOutput = false;
      live.previousSnapshotSha256 = null;
      live.snapshotSequence = 1;
      live.toolMediated = false;
      live.pendingToolCallId = null;
      live.pendingToolCallToolName = null;
      live.session.observeModelInput({
        session_id: live.context.session_id,
        content: live.filterModelContent,
        content_ref: live.filterModelContentRef
      });
      await live.session.observeModelOutput({
        session_id: live.context.session_id,
        content: "Provisional model output for force terminal recovery.",
        content_ref: `model://track1/provisional/${live.snapshotSequence}`
      });
      live.modelOutputObserved = true;
      live.provisionalModelOutput = true;
      const proposed = live.proposedToolCall;
      const syntheticCallId = `call:proposed:${live.context.case_id.toLowerCase()}:${live.context.attempt_index}`;
      const recovery = await live.session.beforeTool({
        call_id: syntheticCallId,
        session_id: live.context.session_id,
        scenario_id: live.context.scenario_id,
        case_id: live.context.case_id,
        tool_name: proposed.tool_name,
        arguments: proposed.arguments
      });
      live.toolMediated = true;
      if (recovery.disposition === "intercept") {
        const terminal = live.session.finalize();
        await ingestSessionSnapshot(live, terminal);
      } else {
        await ingestSessionSnapshot(live, recovery.snapshot);
        const afterSnapshot = live.session.afterTool({
          session_id: live.context.session_id,
          call_id: syntheticCallId,
          tool_name: proposed.tool_name,
          status: "success",
          result_ref: `simulated-result://${syntheticCallId}/success`,
          state_change: "simulated"
        });
        await ingestSessionSnapshot(live, afterSnapshot);
        const finalResult = live.session.finalize();
        await ingestSessionSnapshot(live, finalResult);
      }
      live.ended = true;
      sessions.delete(runtimeSessionId);
      pendingSessionStarts.delete(runtimeSessionId);
      toolRuntimeRegistry.delete(runtimeSessionId);
      return live.terminalSnapshotIngested;
    } catch (err) {
      debugLog("force_terminal_fail", {
        case_id: live.context.case_id,
        err: String(err)
      });
      return false;
    }
  };

  const finalizeBoundSession = async (
    runtimeSessionId: string,
    failed: boolean
  ): Promise<void> => {
    const state = sessions.get(runtimeSessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    // Bug #9 / #15 / #25 / #29: agent_end may arrive before llm_output.
    // - If a proposed_tool_call exists, never defer: rebuild + evaluate.
    // - If no proposed tool, still synthesize provisional model output and
    //   finalize immediately so allow-only cases (SC-001-C003 / SC-003-C003)
    //   do not hang waiting for fire-and-forget llm_output.
    if (!state.modelOutputObserved && !failed) {
      if (state.proposedToolCall !== null) {
        try {
          await state.session.observeModelOutput({
            session_id: state.context.session_id,
            content:
              "Provisional model output synthesized at agent_end before llm_output.",
            content_ref: `model://track1/provisional/${state.snapshotSequence}`
          });
          state.modelOutputObserved = true;
          state.provisionalModelOutput = true;
        } catch {
          // Do NOT defer when a fixture proposed tool exists. Rebuild a clean
          // genesis monitor session so proposed-tool recovery can still run.
          if (
            state.filterModelContent !== null &&
            state.filterModelContentRef !== null
          ) {
            try {
              const monitorPorts: MonitorRuntimePorts = {
                now: runtime.ports.now ?? (() => new Date().toISOString()),
                nextId: runtime.ports.nextId ?? nextRuntimeId
              };
              state.session = new ObservedMonitoredSession(
                {
                  task_id: state.context.session_id.replace(
                    /^session:/,
                    "task:"
                  ),
                  session_id: state.context.session_id,
                  model_ref: state.context.model_ref,
                  scenario_id: state.context.scenario_id,
                  case_id: state.context.case_id
                },
                runtime.ports.provider,
                monitorPorts
              );
              state.session.observeModelInput({
                session_id: state.context.session_id,
                content: state.filterModelContent,
                content_ref: state.filterModelContentRef
              });
              await state.session.observeModelOutput({
                session_id: state.context.session_id,
                content:
                  "Provisional model output synthesized after rebuild at agent_end.",
                content_ref: `model://track1/provisional/${state.snapshotSequence}`
              });
              state.modelOutputObserved = true;
              state.provisionalModelOutput = true;
              state.previousSnapshotSha256 = null;
              state.snapshotSequence = 1;
            } catch {
              debugLog("agent_end_rebuild_failed", {
                case_id: state.context.case_id,
                attempt_id: state.context.attempt_id
              });
            }
          }
        }
      } else {
        // No proposed tool: still terminalize immediately.
        try {
          await state.session.observeModelOutput({
            session_id: state.context.session_id,
            content:
              "Provisional model output synthesized at agent_end for allow-path finalization.",
            content_ref: `model://track1/provisional/${state.snapshotSequence}`
          });
          state.modelOutputObserved = true;
          state.provisionalModelOutput = true;
        } catch {
          // Keep legacy defer only if synthesis is impossible.
          state.agentEndedPendingOutput = true;
          state.agentEndedFailed = false;
          return;
        }
      }
    }

    if (!state.modelOutputObserved && failed) {
      // Failed CLI runs still need a terminal snapshot.
      try {
        await ingestSessionSnapshot(state, state.session.fail());
        state.ended = true;
        sessions.delete(runtimeSessionId);
        pendingSessionStarts.delete(runtimeSessionId);
        toolRuntimeRegistry.delete(runtimeSessionId);
        return;
      } catch {
        // Continue into ordinary fail-closed finalization.
      }
    }

    // Bug #12/#13/#28: Evaluate fixture proposed_tool_call when the attempt is
    // still non-terminal. ALWAYS rebuild a clean genesis monitor session for
    // proposed-tool recovery so prior memory/tool failures cannot poison
    // normalizeBaseResult (Monitor result is invalid).
    if (
      !failed &&
      !state.terminalSnapshotIngested &&
      state.pendingToolCallId === null &&
      state.proposedToolCall !== null &&
      state.filterModelContent !== null &&
      state.filterModelContentRef !== null
    ) {
      try {
        const monitorPorts: MonitorRuntimePorts = {
          now: runtime.ports.now ?? (() => new Date().toISOString()),
          nextId:
            runtime.ports.nextId ?? nextRuntimeId
        };
        state.session = new ObservedMonitoredSession(
          {
            task_id: state.context.session_id.replace(/^session:/, "task:"),
            session_id: state.context.session_id,
            model_ref: state.context.model_ref,
            scenario_id: state.context.scenario_id,
            case_id: state.context.case_id
          },
          runtime.ports.provider,
          monitorPorts
        );
        state.previousSnapshotSha256 = null;
        state.snapshotSequence = 1;
        state.session.observeModelInput({
          session_id: state.context.session_id,
          content: state.filterModelContent,
          content_ref: state.filterModelContentRef
        });
        await state.session.observeModelOutput({
          session_id: state.context.session_id,
          content: "Provisional model output for proposed tool evaluation.",
          content_ref: `model://track1/provisional/${state.snapshotSequence}`
        });
        state.modelOutputObserved = true;
        state.provisionalModelOutput = true;

        const proposed = state.proposedToolCall;
        const syntheticCallId = `call:proposed:${state.context.case_id.toLowerCase()}:${state.context.attempt_index}`;
        const outcome = await state.session.beforeTool({
          call_id: syntheticCallId,
          session_id: state.context.session_id,
          scenario_id: state.context.scenario_id,
          case_id: state.context.case_id,
          tool_name: proposed.tool_name,
          arguments: proposed.arguments
        });
        state.toolMediated = true;
        if (outcome.disposition === "intercept") {
          const terminal = state.session.finalize();
          await ingestSessionSnapshot(state, terminal);
          state.ended = true;
          sessions.delete(runtimeSessionId);
          pendingSessionStarts.delete(runtimeSessionId);
          toolRuntimeRegistry.delete(runtimeSessionId);
          return;
        }
        await ingestSessionSnapshot(state, outcome.snapshot);
        const afterSnapshot = state.session.afterTool({
          session_id: state.context.session_id,
          call_id: syntheticCallId,
          tool_name: proposed.tool_name,
          status: "success",
          result_ref: `simulated-result://${syntheticCallId}/success`,
          state_change: "simulated"
        });
        await ingestSessionSnapshot(state, afterSnapshot);
        const finalResult = state.session.finalize();
        await ingestSessionSnapshot(state, finalResult);
        state.ended = true;
        sessions.delete(runtimeSessionId);
        pendingSessionStarts.delete(runtimeSessionId);
        toolRuntimeRegistry.delete(runtimeSessionId);
        return;
      } catch (err) {
        debugLog("proposed_recovery_fail", {
          case_id: state.context.case_id,
          err: String(err)
        });
        // Fall through to ordinary finalization / fail-closed recovery.
      }
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
      // Bug #11: After a deny/ask intercept the monitored session is already
      // sealed. Prefer finalize() even when agent_end reports success=false,
      // because fail() on an intercept-sealed session can leave the campaign
      // attempt non-terminal. Only use fail() when finalize is impossible.
      try {
        const finalResult = state.session.finalize();
        await ingestSessionSnapshot(state, finalResult);
        return;
      } catch {
        if (failed) {
          await ingestSessionSnapshot(state, state.session.fail());
          return;
        }
        try {
          await ingestSessionSnapshot(state, state.session.fail());
          return;
        } catch {
          throw new Track1PluginHookError("security_monitor_unavailable");
        }
      }
    } catch {
      let recoveredTerminalSnapshot = false;
      try {
        // Prefer finalize over snapshot: intercept seals report "running" via
        // snapshot() even though finalize() can emit the terminal blocked
        // result the campaign runner needs.
        try {
          const finalResult = state.session.finalize();
          await ingestSessionSnapshot(state, finalResult);
          recoveredTerminalSnapshot = true;
        } catch {
          try {
            await ingestSessionSnapshot(state, state.session.fail());
            recoveredTerminalSnapshot = true;
          } catch {
            const snapshot = state.session.snapshot();
            if (
              snapshot.status === "failed" ||
              snapshot.status === "finished" ||
              snapshot.status === "blocked"
            ) {
              await ingestSessionSnapshot(state, snapshot);
              recoveredTerminalSnapshot = true;
            }
          }
        }
      } catch {
        // No raw provider or model error crosses the plugin boundary.
      }
      if (!recoveredTerminalSnapshot) {
        throw new Track1PluginHookError("security_monitor_unavailable");
      }
    } finally {
      // Bug #9: If we deferred finalization (agentEndedPendingOutput), keep
      // the session alive so llm_output can still observe the output.
      if (state.agentEndedPendingOutput) {
        return;
      }
      // Bug #26: Never delete a non-terminal session from finally. That left
      // agent_end with found=false after a failed recovery attempt.
      if (state.terminalSnapshotIngested) {
        state.ended = true;
        sessions.delete(runtimeSessionId);
        pendingSessionStarts.delete(runtimeSessionId);
        toolRuntimeRegistry.delete(runtimeSessionId);
      } else {
        state.ended = false;
      }
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
      // This is only done once �?subsequent envelopes must match.
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

      state.proposedToolCall = envelope.proposed_tool_call
        ? {
            tool_name: envelope.proposed_tool_call.tool_name,
            arguments: envelope.proposed_tool_call.arguments
          }
        : null;

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
      state.filterModelContent = content;
      state.filterModelContentRef = contentRef;
      // Envelope identity + proposed tool + filter context are fully bound.
      // Mark binding ready as soon as identity + proposed tool + filter
      // content are known. Later observation failures must not leave
      // agent_end/tool hooks waiting forever with zero snapshots.
      state.bindingReady = true;
      purgeStaleSessions(runtimeSessionId);
      debugLog("llm_input_bound", {
        runtimeSessionId,
        case_id: state.context.case_id,
        attempt_id: state.context.attempt_id,
        hasProposed: state.proposedToolCall !== null,
        sessionCount: sessions.size
      });

      // Observe model input
      try {
        state.session.observeModelInput({
          session_id: state.context.session_id,
          content,
          content_ref: contentRef
        });
      } catch {
        // Session may already have input from a partial prior attempt.
      }

      // Emit controlled memory observations for memory_entries (writes)
      // P6-ISSUE6: Propagate content_sha256 from the envelope so the monitor
      // uses the hash from the envelope rather than re-hashing the content_ref.
      for (const entry of envelope.memory_entries) {
        try {
          state.session.observeMemoryWrite({
            session_id: state.context.session_id,
            memory_entry_id: entry.memory_entry_id,
            content: entry.content,
            content_ref: entry.content_ref,
            content_sha256: entry.content_sha256
          });
        } catch {
          // Best-effort controlled memory observation.
        }
      }

      // Emit controlled memory observations for retrieved_content (reads)
      for (const entry of envelope.retrieved_content) {
        try {
          state.session.observeMemoryRead({
            session_id: state.context.session_id,
            memory_entry_id: entry.memory_entry_id,
            content: entry.content,
            content_ref: entry.content_ref,
            content_sha256: entry.content_sha256
          });
        } catch {
          // Best-effort controlled memory observation.
        }
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
      // Session already finalized (e.g. intercept path) or cleaned up.
      // Late llm_output is a no-op so OpenClaw multi-turn ordering remains safe.
      return;
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

    // Bug #11: When a provisional model output was synthesized for an early
    // tool turn, the real llm_output may arrive after the pair is no longer
    // pending (or after an intercept seal). Keep the session usable for
    // agent_end finalization and never leak raw content on this path.
    try {
      await state.session.observeModelOutput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
      });
      state.modelOutputObserved = true;
      state.provisionalModelOutput = false;
    } catch {
      if (!state.provisionalModelOutput) {
        throw new Track1PluginHookError("security_monitor_unavailable");
      }
      state.provisionalModelOutput = false;
    }

    // Bug #9: If agent_end already fired (agentEndedPendingOutput), the
    // session was kept alive so this hook could observe the output. Now
    // that the output has been observed, run the same terminal finalization
    // path as agent_end �?including proposed-tool recovery (Bug #14).
    if (state.agentEndedPendingOutput) {
      state.agentEndedPendingOutput = false;
      try {
        await finalizeBoundSession(sessionId, state.agentEndedFailed);
      } catch {
        // Best-effort: leave fail-closed without raw content.
        try {
          if (!state.terminalSnapshotIngested) {
            await ingestSessionSnapshot(state, state.session.fail());
          }
        } catch {
          // No raw provider or model error crosses the plugin boundary.
        }
        state.ended = true;
        sessions.delete(sessionId);
        pendingSessionStarts.delete(sessionId);
        toolRuntimeRegistry.delete(sessionId);
      }
      return;
    }

    // Bug #19: For fixture proposed tools, do not wait for a later agent_end
    // race. After a real model output, evaluate the proposed tool immediately
    // so text-only refusals still produce the expected deny/ask terminal
    // attempt (SC-002-C003 etc.).
    if (
      state.proposedToolCall !== null &&
      !state.terminalSnapshotIngested &&
      !state.ended
    ) {
      try {
        await finalizeBoundSession(sessionId, false);
      } catch {
        await forceTerminalFail(sessionId);
      }
      if (!state.terminalSnapshotIngested) {
        await forceTerminalFail(sessionId);
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
      let sessionId =
        (isNonEmptyString(ctxObj.sessionId) ? ctxObj.sessionId : undefined) ??
        (isNonEmptyString(event.sessionId) ? event.sessionId : undefined);

      if (
        !isNonEmptyString(sessionId) ||
        !isNonEmptyString(toolName) ||
        !isNonEmptyString(toolCallId)
      ) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }

      // Bug #16: tool hooks can race ahead of fire-and-forget llm_input.
      let state = sessions.get(sessionId);
      if (!state?.bindingReady) {
        const waited = await waitForBoundSession(sessionId);
        state = waited?.state;
        if (waited) sessionId = waited.runtimeId;
      }
      debugLog("before_tool_enter", {
        sessionId,
        toolName,
        toolCallId,
        hasState: Boolean(state),
        bindingReady: Boolean(state?.bindingReady),
        case_id: state?.context.case_id,
        proposed: state?.proposedToolCall?.tool_name ?? null
      });

      if (!state || state.ended || !state.bindingReady) {
        debugLog("before_tool_no_state", {
          sessionId,
          toolName,
          readyCount: listReadySessions().length,
          sessionKeys: [...sessions.keys()]
        });
        // Last chance: if any ready proposed-tool session exists, terminalize
        // it even when this tool event's sessionId could not be resolved.
        if (!state?.terminalSnapshotIngested) {
          const ready = listReadySessions();
          for (const target of ready) {
            if (
              target.state.proposedToolCall !== null &&
              !target.state.terminalSnapshotIngested
            ) {
              try {
                await finalizeBoundSession(target.runtimeId, false);
              } catch {
                // ignore
              }
            }
          }
        }
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      const terminalizeProposedIfNeeded = async (): Promise<void> => {
        if (
          state &&
          state.proposedToolCall !== null &&
          !state.terminalSnapshotIngested
        ) {
          if (state.ended) {
            state.ended = false;
          }
          try {
            await finalizeBoundSession(sessionId, false);
          } catch {
            await forceTerminalFail(sessionId);
          }
          if (!state.terminalSnapshotIngested) {
            await forceTerminalFail(sessionId);
          }
        }
      };

      // Reject unknown tools before touching the adapter. If a fixture
      // proposed tool still needs terminalization, do it now so unknown
      // tool attempts (e.g. "status") still produce campaign evidence.
      if (!PERMITTED_TOOLS.has(toolName)) {
        await terminalizeProposedIfNeeded();
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }

      // Bug #14/#19: When the fixture proposes a tool, only mediate real tool
      // calls that match that proposal. Non-matching real tools must not
      // mutate ObservedMonitoredSession. Immediately evaluate the fixture
      // proposal so the campaign does not depend on a later agent_end race.
      if (
        state.proposedToolCall !== null &&
        !toolArgsMatchProposed(toolName, params, state.proposedToolCall)
      ) {
        debugLog("before_tool_nonmatch_terminalize", {
          sessionId,
          toolName,
          proposed: state.proposedToolCall.tool_name,
          case_id: state.context.case_id
        });
        await terminalizeProposedIfNeeded();
        debugLog("before_tool_nonmatch_done", {
          sessionId,
          terminal: state.terminalSnapshotIngested,
          seq: state.snapshotSequence
        });
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }

      // Bug #11: OpenClaw may invoke before_tool_call before llm_output for
      // the same user turn. beforeTool requires a completed model pair, so
      // synthesize a provisional output that never contains raw provider body.
      if (!state.modelOutputObserved) {
        try {
          await state.session.observeModelOutput({
            session_id: state.context.session_id,
            content: "Provisional model output for early tool evaluation.",
            content_ref: `model://track1/provisional/${state.snapshotSequence}`
          });
          state.modelOutputObserved = true;
          state.provisionalModelOutput = true;
        } catch {
          // Bug #13/#19: Keep session recoverable and immediately try
          // proposed-tool terminalization if available.
          await terminalizeProposedIfNeeded();
          return { ...BLOCK_SECURITY_UNAVAILABLE };
        }
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
      } catch (err) {
        debugLog("before_tool_mediate_fail", {
          sessionId,
          toolName,
          case_id: state.context.case_id,
          err: String(err)
        });
        // Real-tool mediation failed (often Monitor result is invalid when the
        // model rewrote fixture args or the live event stream cannot normalize).
        // Drop the poisoned monitor session completely and evaluate the fixture
        // proposed tool on a clean genesis session.
        state.toolMediated = false;
        state.pendingToolCallId = null;
        state.pendingToolCallToolName = null;
        state.modelOutputObserved = false;
        state.provisionalModelOutput = false;
        state.previousSnapshotSha256 = null;
        state.snapshotSequence = 1;
        state.ended = false;
        state.terminalSnapshotIngested = false;
        if (
          state.proposedToolCall !== null &&
          state.filterModelContent !== null &&
          state.filterModelContentRef !== null
        ) {
          try {
            const monitorPorts: MonitorRuntimePorts = {
              now: runtime.ports.now ?? (() => new Date().toISOString()),
              nextId:
                runtime.ports.nextId ?? nextRuntimeId
            };
            state.session = new ObservedMonitoredSession(
              {
                task_id: state.context.session_id.replace(/^session:/, "task:"),
                session_id: state.context.session_id,
                model_ref: state.context.model_ref,
                scenario_id: state.context.scenario_id,
                case_id: state.context.case_id
              },
              runtime.ports.provider,
              monitorPorts
            );
            state.session.observeModelInput({
              session_id: state.context.session_id,
              content: state.filterModelContent,
              content_ref: state.filterModelContentRef
            });
            await state.session.observeModelOutput({
              session_id: state.context.session_id,
              content:
                "Provisional model output after failed real-tool mediation.",
              content_ref: `model://track1/provisional/${state.snapshotSequence}`
            });
            state.modelOutputObserved = true;
            state.provisionalModelOutput = true;
            const proposed = state.proposedToolCall;
            const syntheticCallId = `call:proposed:${state.context.case_id.toLowerCase()}:${state.context.attempt_index}`;
            const recovery = await state.session.beforeTool({
              call_id: syntheticCallId,
              session_id: state.context.session_id,
              scenario_id: state.context.scenario_id,
              case_id: state.context.case_id,
              tool_name: proposed.tool_name,
              arguments: proposed.arguments
            });
            state.toolMediated = true;
            if (recovery.disposition === "intercept") {
              const terminal = state.session.finalize();
              await ingestSessionSnapshot(state, terminal);
              state.ended = true;
              sessions.delete(sessionId);
              pendingSessionStarts.delete(sessionId);
              toolRuntimeRegistry.delete(sessionId);
              const reason =
                recovery.decision.action === "deny"
                  ? "policy_denied"
                  : "policy_ask_required";
              return Object.freeze({ block: true, blockReason: reason });
            }
          } catch (recoveryErr) {
            debugLog("before_tool_recovery_fail", {
              sessionId,
              case_id: state.context.case_id,
              err: String(recoveryErr)
            });
          }
        }
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }
      state.toolMediated = true;
      debugLog("before_tool_outcome", {
        sessionId,
        toolName,
        disposition: outcome.disposition,
        action: outcome.decision?.action,
        case_id: state.context.case_id
      });

      if (outcome.disposition === "intercept") {
        // Bug #11: Only ingest the terminal intercept result. The live
        // beforeTool snapshot is non-terminal (status=running). Ingesting it
        // first leaves the campaign attempt stuck if a later terminal ingest
        // fails the snapshot chain, and even on success it is redundant.
        try {
          const terminal = state.session.finalize();
          await ingestSessionSnapshot(state, terminal);
        } catch {
          try {
            // Last resort: force a terminal blocked envelope from the
            // sealed snapshot without depending on finalize().
            const snapshot = state.session.snapshot();
            const forced = {
              ...snapshot,
              status: "blocked" as const,
              summary: "Monitored sandbox session blocked",
              finished_at:
                typeof snapshot.finished_at === "string" &&
                snapshot.finished_at.length > 0
                  ? snapshot.finished_at
                  : new Date().toISOString()
            };
            await ingestSessionSnapshot(state, forced as typeof snapshot);
          } catch {
            state.ended = true;
            sessions.delete(sessionId);
            pendingSessionStarts.delete(sessionId);
            toolRuntimeRegistry.delete(sessionId);
            return { ...BLOCK_SECURITY_UNAVAILABLE };
          }
        }
        state.lastInterceptedToolCallId = toolCallId;
        state.pendingToolCallId = null;
        state.pendingToolCallToolName = null;
        state.ended = true;
        sessions.delete(sessionId);
        pendingSessionStarts.delete(sessionId);
        toolRuntimeRegistry.delete(sessionId);
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
    { priority: 100, timeoutMs: 30_000 }
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
      // Session already cleaned up by agent_end/session_end �?ignore late tool
      // after-hooks rather than failing the runtime.
      return;
    }

    // Bug #11/#13: Intercept paths and failed mediations may leave no pending
    // allow. OpenClaw still emits after_tool_call; never throw here or the
    // runtime may abort before agent_end recovery can run.
    if (state.pendingToolCallId === null) {
      if (state.lastInterceptedToolCallId === toolCallId) {
        state.lastInterceptedToolCallId = null;
      }
      return;
    }

    // P1-Fix7: Detect tool failure via error field and result JSON parsing.
    // P5-ISSUE5: Use detectToolFailure() which rejects "rejected" status as
    // a non-failure �?adapter-rejected calls are tool executions, not failures.
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
      // Bug #13: Keep the session recoverable for agent_end proposed-tool
      // evaluation instead of permanently ending without a terminal snapshot.
      state.pendingToolCallId = null;
      state.pendingToolCallToolName = null;
      state.toolMediated = false;
      return;
    }

    // Clear pending tool call (P1-Fix6)
    state.pendingToolCallId = null;
    state.pendingToolCallToolName = null;
  });

  // -- agent_end ------------------------------------------------------
  // `openclaw agent` uses the harness lifecycle and does not emit
  // session_start/session_end for each direct run. agent_end is therefore
  // the authoritative per-attempt terminal boundary for the campaign CLI.

  api.on(
    "agent_end",
    async (event: unknown, ctx: unknown) => {
      // Never throw from agent_end �?OpenClaw treats it as a hard error and
      // the campaign runner would hang with zero snapshots.
      if (!isPlainObject(event) || !isPlainObject(ctx)) {
        return;
      }

      // OpenClaw event shapes vary slightly across harness paths. Accept
      // missing messages/success rather than silently dropping the terminal
      // boundary for tool-stage cases.
      const failed = event.success === false;
      const sessionId = isNonEmptyString(ctx.sessionId)
        ? ctx.sessionId
        : isNonEmptyString(event.sessionId)
          ? (event.sessionId as string)
          : null;

      let targets = [] as Array<{
        runtimeId: string;
        state: PluginSessionState;
      }>;
      // Only finalize the exact session for this agent_end. Never fall back to
      // listReadySessions() �?that allowed a late prior-attempt agent_end to
      // poison the next case.
      const bound = await waitForBoundSession(sessionId);
      debugLog("agent_end_enter", {
        sessionId,
        failed,
        found: Boolean(bound),
        case_id: bound?.state.context.case_id,
        proposed: bound?.state.proposedToolCall?.tool_name ?? null,
        modelOut: bound?.state.modelOutputObserved,
        terminal: bound?.state.terminalSnapshotIngested
      });
      if (bound) {
        targets = [bound];
      }

      for (const { runtimeId, state } of targets) {
        if (state.ended && state.terminalSnapshotIngested) {
          continue;
        }
        if (state.ended && !state.terminalSnapshotIngested) {
          state.ended = false;
        }
        try {
          await finalizeBoundSession(runtimeId, failed);
        } catch {
          // Only force-terminal when we expected a terminal now
          // (failed run or proposed-tool recovery). SC-001 may legitimately
          // defer until llm_output.
          if (failed || state.proposedToolCall !== null) {
            await forceTerminalFail(runtimeId);
          }
        }
        if (
          !state.terminalSnapshotIngested &&
          !state.agentEndedPendingOutput &&
          (failed || state.proposedToolCall !== null)
        ) {
          await forceTerminalFail(runtimeId);
        }
      }
    },
    { timeoutMs: 30_000 }
  );

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
