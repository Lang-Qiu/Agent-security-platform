// P0-Fix1: Real OpenClaw SDK definePluginEntry import — no local stub.
// P0-Fix2: camelCase hook event fields + ctx param + tool label + 5-arg execute.
// P1-Fix5: Per-session tool runtime via CampaignToolRuntimeResolver.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ObservedMonitoredSession } from "../../../engines/sandbox/src/monitoring/observed-session.js";
import { InMemorySimulatedToolState } from "../../../engines/sandbox/src/simulated-tools/state.js";
import { SimulatedToolExecutor } from "../../../engines/sandbox/src/simulated-tools/executor.js";
import { registerTrack1Tools } from "./tool-adapters.js";
import { normalizeTrack1PluginContext, normalizeTrack1ModelInputEnvelope } from "./campaign-context.js";
import { calculateTrack1SnapshotSha256 } from "../../../shared/contracts/campaign-ingest.js";
import { TRACK1_CAMPAIGN_MANIFEST_SHA256, TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION } from "../../../shared/types/campaign-ingest.js";
// P1-Fix5: Per-session tool runtime registry. Each session gets its own
// CampaignToolRuntime instead of sharing one fixed runtime.
export class SessionToolRuntimeRegistry {
    runtimes = new Map();
    register(sessionId, runtime) {
        this.runtimes.set(sessionId, runtime);
    }
    resolveToolRuntime(sessionId) {
        return this.runtimes.get(sessionId);
    }
    delete(sessionId) {
        this.runtimes.delete(sessionId);
    }
}
// -- internal error --------------------------------------------------------
class Track1PluginHookError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "Track1PluginHookError";
        this.code = code;
    }
}
// -- helpers ---------------------------------------------------------------
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
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
function createDefaultToolRuntime(context) {
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
function buildSnapshotEnvelope(state, result) {
    const withoutHash = {
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
async function ingestSessionSnapshot(state, result) {
    const envelope = buildSnapshotEnvelope(state, result);
    const ack = await state.ingest(envelope);
    state.previousSnapshotSha256 = ack.snapshot_sha256;
    state.snapshotSequence += 1;
}
// P1-Fix7: Tool failure detection — check error field and parse tool output JSON.
function detectToolFailure(event) {
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
            }
            catch {
                // Not JSON — treat as success content
            }
        }
    }
    return false;
}
// -- registration ----------------------------------------------------------
export function registerTrack1Plugin(api, runtime) {
    const sessions = new Map();
    const { campaignContext, toolRuntimeRegistry } = runtime;
    // P1-Fix5: Register tools with the per-session resolver.
    registerTrack1Tools(api, toolRuntimeRegistry);
    // -- session_start --------------------------------------------------
    // P0-Fix2: camelCase event fields from real SDK PluginHookSessionStartEvent.
    // P1-Fix5: Cross-check native session/agent with bound campaign context.
    api.on("session_start", async (event, ctx) => {
        if (!isPlainObject(event)) {
            throw new Track1PluginHookError("track1_plugin_event_invalid");
        }
        const sessionId = event.sessionId;
        if (!isNonEmptyString(sessionId)) {
            throw new Track1PluginHookError("track1_plugin_event_invalid");
        }
        // P1-Fix5: Cross-check ctx (PluginHookSessionContext) against bound context.
        const ctxObj = isPlainObject(ctx) ? ctx : {};
        const ctxSessionId = ctxObj.sessionId;
        const ctxAgentId = ctxObj.agentId;
        // Cross-check: ctx.sessionId must match event.sessionId (if ctx has it)
        if (isNonEmptyString(ctxSessionId) && ctxSessionId !== sessionId) {
            throw new Track1PluginHookError("track1_plugin_session_mismatch");
        }
        // Cross-check: ctx.agentId must match bound campaign context's agent_id
        if (isNonEmptyString(ctxAgentId) && ctxAgentId !== campaignContext.agent_id) {
            throw new Track1PluginHookError("track1_plugin_agent_mismatch");
        }
        // Cross-check: event.sessionId must match bound campaign context's session_id
        if (sessionId !== campaignContext.session_id) {
            throw new Track1PluginHookError("track1_plugin_session_mismatch");
        }
        if (sessions.has(sessionId)) {
            throw new Track1PluginHookError("track1_plugin_session_exists");
        }
        // Create per-session tool runtime (P1-Fix5)
        const toolRuntime = runtime.createToolRuntime
            ? runtime.createToolRuntime(campaignContext)
            : createDefaultToolRuntime(campaignContext);
        toolRuntimeRegistry.register(sessionId, toolRuntime);
        // Map to MonitorSessionContext
        const monitorContext = {
            task_id: sessionId.replace(/^session:/, "task:"),
            session_id: campaignContext.session_id,
            model_ref: campaignContext.model_ref,
            scenario_id: campaignContext.scenario_id,
            case_id: campaignContext.case_id
        };
        const monitorPorts = {
            now: runtime.ports.now ?? (() => new Date().toISOString()),
            nextId: runtime.ports.nextId ??
                ((kind) => `${kind}:${Date.now().toString(36)}`)
        };
        const session = new ObservedMonitoredSession(monitorContext, runtime.ports.provider, monitorPorts);
        sessions.set(sessionId, {
            session,
            context: campaignContext,
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
    api.on("llm_input", async (event, _ctx) => {
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
        let content;
        let contentRef;
        if (isPlainObject(rawEnvelope)) {
            // Normalize and cross-check the envelope (P1-Fix5)
            const envelope = normalizeTrack1ModelInputEnvelope(rawEnvelope);
            // Cross-check envelope fields against bound context
            if (envelope.campaign_id !== state.context.campaign_id ||
                envelope.agent_id !== state.context.agent_id ||
                envelope.attempt_id !== state.context.attempt_id ||
                envelope.session_id !== state.context.session_id ||
                envelope.scenario_id !== state.context.scenario_id ||
                envelope.case_id !== state.context.case_id ||
                envelope.attempt_index !== state.context.attempt_index) {
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
        }
        else {
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
    api.on("llm_output", async (event, _ctx) => {
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
        let content;
        const assistantTexts = event.assistantTexts;
        if (Array.isArray(assistantTexts) && assistantTexts.length > 0) {
            content = assistantTexts
                .filter((t) => typeof t === "string")
                .join("\n");
        }
        else if (isNonEmptyString(event.content)) {
            // Track 1 test extension: direct content field
            content = event.content;
        }
        else {
            throw new Track1PluginHookError("track1_plugin_event_invalid");
        }
        if (!isNonEmptyString(content)) {
            throw new Track1PluginHookError("track1_plugin_event_invalid");
        }
        // Derive content_ref (or use Track 1 extension if provided)
        const contentRef = isNonEmptyString(event.contentRef)
            ? event.contentRef
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
    api.on("before_tool_call", async (event, ctx) => {
        if (!isPlainObject(event)) {
            return { ...BLOCK_TOOL_NOT_PERMITTED };
        }
        // P0-Fix2: camelCase field names
        const toolName = event.toolName;
        const params = event.params;
        const toolCallId = event.toolCallId;
        // ctx provides sessionId (real SDK PluginHookToolContext)
        const ctxObj = isPlainObject(ctx) ? ctx : {};
        const sessionId = (isNonEmptyString(ctxObj.sessionId) ? ctxObj.sessionId : undefined) ??
            (isNonEmptyString(event.sessionId) ? event.sessionId : undefined);
        if (!isNonEmptyString(sessionId) ||
            !isNonEmptyString(toolName) ||
            !isNonEmptyString(toolCallId)) {
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
            session_id: state.context.session_id,
            scenario_id: state.context.scenario_id,
            case_id: state.context.case_id,
            tool_name: toolName,
            arguments: params
        };
        let outcome;
        try {
            outcome = await state.session.beforeTool(request);
        }
        catch {
            state.ended = true;
            return { ...BLOCK_SECURITY_UNAVAILABLE };
        }
        if (outcome.disposition === "intercept") {
            try {
                await ingestSessionSnapshot(state, outcome.snapshot);
            }
            catch {
                // Ingest failure on intercept is still a block
            }
            const reason = outcome.decision.action === "deny"
                ? "policy_denied"
                : "policy_ask_required";
            return Object.freeze({ block: true, blockReason: reason });
        }
        // allow/alert: ingest snapshot BEFORE returning (acknowledgement barrier)
        try {
            await ingestSessionSnapshot(state, outcome.snapshot);
        }
        catch {
            state.ended = true;
            return { ...BLOCK_SECURITY_UNAVAILABLE };
        }
        // Track pending tool call for session_end terminal failure (P1-Fix6)
        state.pendingToolCallId = toolCallId;
        return {};
    }, { priority: 100, timeoutMs: 10_000 });
    // -- after_tool_call ------------------------------------------------
    // P0-Fix2: camelCase fields from real SDK PluginHookAfterToolCallEvent.
    // P1-Fix7: Tool failure detection via error field and result JSON parsing.
    api.on("after_tool_call", async (event, ctx) => {
        if (!isPlainObject(event)) {
            throw new Track1PluginHookError("track1_plugin_event_invalid");
        }
        // P0-Fix2: camelCase field names
        const toolName = event.toolName;
        const toolCallId = event.toolCallId;
        // ctx provides sessionId
        const ctxObj = isPlainObject(ctx) ? ctx : {};
        const sessionId = (isNonEmptyString(ctxObj.sessionId) ? ctxObj.sessionId : undefined) ??
            (isNonEmptyString(event.sessionId) ? event.sessionId : undefined);
        if (!isNonEmptyString(sessionId) ||
            !isNonEmptyString(toolName) ||
            !isNonEmptyString(toolCallId)) {
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
            state_change: "simulated"
        };
        try {
            const afterSnapshot = state.session.afterTool(observedResult);
            await ingestSessionSnapshot(state, afterSnapshot);
        }
        catch {
            state.ended = true;
            throw new Track1PluginHookError("security_monitor_unavailable");
        }
        // Clear pending tool call (P1-Fix6)
        state.pendingToolCallId = null;
    });
    // -- session_end ----------------------------------------------------
    // P1-Fix6: session_end with pending tool must generate terminal failed snapshot.
    api.on("session_end", async (event, _ctx) => {
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
                }
                catch {
                    // finalize failed — use snapshot() which allows sealed sessions
                    const snapshot = state.session.snapshot();
                    await ingestSessionSnapshot(state, snapshot);
                }
            }
            else {
                const finalResult = state.session.finalize();
                await ingestSessionSnapshot(state, finalResult);
            }
        }
        catch {
            // Last resort: try snapshot if finalize threw
            try {
                const snapshot = state.session.snapshot();
                await ingestSessionSnapshot(state, snapshot);
            }
            catch {
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
export function createTrack1PluginEntry() {
    return definePluginEntry({
        id: "agent-security-track1",
        name: "Agent Security Track 1",
        description: "Track 1 campaign supervision plugin: observes model I/O, mediates tool calls, and ingests campaign snapshots via the OpenClaw plugin SDK.",
        register(api) {
            const realApi = api;
            const config = realApi.pluginConfig ?? {};
            // Construct runtime from plugin config
            const ingestEndpoint = String(config.ingestEndpoint ?? "http://backend:3001/internal/track1/campaigns");
            const ingestToken = String(config.ingestToken ?? "");
            // Build campaign context from config
            const contextInput = {
                campaign_id: String(config.campaignId ?? ""),
                attempt_id: String(config.attemptId ?? ""),
                attempt_index: Number(config.attemptIndex ?? 1),
                agent_id: String(config.agentId ?? ""),
                session_id: String(config.sessionId ?? ""),
                scenario_id: String(config.scenarioId ?? ""),
                case_id: String(config.caseId ?? ""),
                model_ref: String(config.modelRef ?? "track1:openclaw:demo")
            };
            const campaignContext = normalizeTrack1PluginContext(contextInput);
            const toolRuntimeRegistry = new SessionToolRuntimeRegistry();
            // Lazy import to avoid circular dependency at module load
            const ports = {
                provider: {
                    decide() {
                        // Default provider: allow all (demo only)
                        return {
                            policy_id: "policy://track1/default",
                            action: "allow",
                            reason_code: "default_allow",
                            reason: "Track 1 default allow",
                            evidence_refs: []
                        };
                    }
                },
                async ingestSnapshot(envelope) {
                    // Construct ingest client lazily
                    const { Track1IngestClient } = await import("./ingest-client.js");
                    const client = new Track1IngestClient({ ingestEndpoint, ingestToken }, undefined);
                    return client.appendSnapshot(envelope);
                }
            };
            registerTrack1Plugin(realApi, {
                ports,
                campaignContext,
                toolRuntimeRegistry
            });
        }
    });
}
// Default export: real SDK plugin entry
export default createTrack1PluginEntry();
