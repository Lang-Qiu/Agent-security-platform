// P1-Fix8: Startup probe runs real `openclaw plugins inspect` command output
// for static checks (tools, hooks, version, labels) instead of a self-made
// recording API. Dynamic checks still use a minimal recording API to verify
// hook behavior, but the static shape comes from the real SDK runtime.
import { execFileSync } from "node:child_process";
import { registerTrack1Plugin } from "./plugin.js";
import { SessionToolRuntimeRegistry } from "./plugin.js";
import { normalizeTrack1PluginContext } from "./campaign-context.js";
import { TRACK1_MODEL_REF_CANONICAL } from "../../../shared/types/campaign-ingest.js";
export const TRACK1_PLUGIN_PROBE_RESULT_KEYS = Object.freeze([
    "schema_version",
    "plugin_id",
    "runtime_version",
    "tool_names",
    "hook_names",
    "before_tool_blocked",
    "after_tool_observed",
    "correlation_ready",
    "diagnostics"
]);
export const TRACK1_PLUGIN_PROBE_COMMAND = "openclaw plugins inspect agent-security-track1 --runtime --json";
export const TRACK1_PLUGIN_PROBE_RUNTIME_VERSION = "2026.6.10";
// -- real command execution (P1-Fix8) --------------------------------------
export function execOpenclawPluginsInspect() {
    const stdout = execFileSync("openclaw", ["plugins", "inspect", "agent-security-track1", "--runtime", "--json"], {
        encoding: "utf8",
        timeout: 30_000
    });
    const parsed = JSON.parse(stdout);
    return {
        id: String(parsed.id ?? ""),
        name: String(parsed.name ?? ""),
        runtime_version: String(parsed.runtime_version ?? ""),
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
        diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : []
    };
}
// -- error -----------------------------------------------------------------
class Track1PluginProbeError extends Error {
    code;
    constructor(code, detail) {
        super(detail ? `${code}: ${detail}` : code);
        this.name = "Track1PluginProbeError";
        this.code = code;
    }
}
function makeProbeRecordingApi() {
    const tools = [];
    const hooks = [];
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
// -- probe context ---------------------------------------------------------
const PROBE_CONTEXT_INPUT = Object.freeze({
    campaign_id: "campaign:track1:probe-001",
    attempt_id: "attempt:track1:probe-001",
    attempt_index: 1,
    agent_id: "agent:track1:prompt-injection",
    session_id: "session:track1:probe-001",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    model_ref: TRACK1_MODEL_REF_CANONICAL
});
const PROBE_CONTEXT = normalizeTrack1PluginContext(PROBE_CONTEXT_INPUT);
const EXPECTED_TOOLS = Object.freeze([
    "call_api",
    "read_file",
    "send_email",
    "write_file"
]);
const EXPECTED_HOOKS = Object.freeze([
    "after_tool_call",
    "before_tool_call",
    "llm_input",
    "llm_output",
    "session_end",
    "session_start"
]);
// -- helpers ---------------------------------------------------------------
function isBlocked(result) {
    if (typeof result !== "object" || result === null)
        return false;
    const obj = result;
    return obj.block === true && typeof obj.blockReason === "string";
}
function deepEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((v, i) => v === b[i]);
}
// -- mutation application (dynamic only) -----------------------------------
function applyDynamicMutation(api, mutation, ingestWrapper) {
    if (!mutation)
        return;
    switch (mutation) {
        case "block-failed": {
            const hook = api.hooks.find((h) => h.name === "before_tool_call");
            if (hook) {
                hook.handler = async () => ({});
            }
            break;
        }
        case "after-not-observed": {
            const hook = api.hooks.find((h) => h.name === "after_tool_call");
            if (hook) {
                hook.handler = async () => undefined;
            }
            break;
        }
        case "correlation-missing": {
            const originalIngest = ingestWrapper.ingest;
            ingestWrapper.ingest = async (envelope) => {
                const defective = {
                    ...envelope,
                    campaign_id: ""
                };
                ingestWrapper.snapshots.push(defective);
                return originalIngest(envelope);
            };
            break;
        }
        // Static mutations (wrong-version, missing-tool, duplicate-tool,
        // missing-hook, diagnostic-present) are handled in static checks above.
    }
}
// -- probe implementation --------------------------------------------------
export async function runTrack1PluginCapabilityProbe(input) {
    const { inspect, ports, mutation } = input;
    // -- static checks (from `openclaw plugins inspect` output) -------------
    // P1-Fix8: These checks verify the real SDK runtime's view of the plugin,
    // not a self-made recording API.
    const toolNames = [...inspect.tools.map((t) => t.name)].sort();
    const hookNames = [...inspect.hooks].sort();
    if (new Set(toolNames).size !== toolNames.length) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "duplicate tool detected");
    }
    if (!deepEqual(toolNames, [...EXPECTED_TOOLS])) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "tool set mismatch");
    }
    if (!deepEqual(hookNames, [...EXPECTED_HOOKS])) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "hook set mismatch");
    }
    if (inspect.runtime_version !== TRACK1_PLUGIN_PROBE_RUNTIME_VERSION) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "runtime version mismatch");
    }
    if (inspect.diagnostics.length > 0) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "diagnostics present");
    }
    // P0-Fix2: Verify all tools have non-empty labels (real SDK requirement)
    for (const tool of inspect.tools) {
        if (!tool.label || tool.label.length === 0) {
            throw new Track1PluginProbeError("track1_plugin_probe_failed", `tool ${tool.name} missing label`);
        }
    }
    // -- dynamic checks (via recording API) ---------------------------------
    // These verify the plugin's hook behavior: before_tool_call blocks unknown
    // tools, after_tool_call observes results, and snapshots carry correlation.
    const api = makeProbeRecordingApi();
    const snapshots = [];
    const ingestWrapper = {
        snapshots,
        async ingest(envelope) {
            snapshots.push(envelope);
            return ports.ingestSnapshot(envelope);
        }
    };
    const wrappedPorts = {
        ...ports,
        async ingestSnapshot(envelope) {
            return ingestWrapper.ingest(envelope);
        }
    };
    const toolRuntimeRegistry = new SessionToolRuntimeRegistry();
    registerTrack1Plugin(api, {
        ports: wrappedPorts,
        campaignContext: PROBE_CONTEXT,
        toolRuntimeRegistry
    });
    applyDynamicMutation(api, mutation, ingestWrapper);
    // -- dynamic test sequence (camelCase events) ---------------------------
    const sessionId = PROBE_CONTEXT.session_id;
    const ctx = { agentId: PROBE_CONTEXT.agent_id, sessionId };
    const getHook = (name) => {
        const hook = api.hooks.find((h) => h.name === name);
        if (!hook) {
            throw new Track1PluginProbeError("track1_plugin_probe_failed", `hook ${name} not found`);
        }
        return hook.handler;
    };
    // Start session
    await getHook("session_start")({ sessionId }, ctx);
    // LLM input
    await getHook("llm_input")({
        sessionId,
        envelope: {
            schema_version: "track1-openclaw-input.v1",
            campaign_id: PROBE_CONTEXT.campaign_id,
            agent_id: PROBE_CONTEXT.agent_id,
            attempt_id: PROBE_CONTEXT.attempt_id,
            attempt_index: PROBE_CONTEXT.attempt_index,
            session_id: PROBE_CONTEXT.session_id,
            case_id: PROBE_CONTEXT.case_id,
            scenario_id: PROBE_CONTEXT.scenario_id,
            user_prompt: "Probe: what is the portal status?",
            retrieved_content: [],
            memory_entries: [],
            proposed_tool_call: null
        }
    }, ctx);
    // LLM output
    await getHook("llm_output")({
        sessionId,
        content: "The portal is operating normally.",
        contentRef: "model://track1/probe/output/001"
    }, ctx);
    // before_tool_call: unknown tool must block
    const unknownResult = await getHook("before_tool_call")({
        sessionId,
        toolCallId: "call:probe:unknown",
        toolName: "unknown_tool",
        params: {}
    }, ctx);
    const beforeToolBlocked = isBlocked(unknownResult);
    if (!beforeToolBlocked) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "before_tool did not block unknown tool");
    }
    // before_tool_call: known tool should allow (and ingest)
    const allowResult = await getHook("before_tool_call")({
        sessionId,
        toolCallId: "call:probe:write",
        toolName: "write_file",
        params: {
            path: "sandbox://probe/test.txt",
            content: "probe"
        }
    }, ctx);
    const allowBlocked = isBlocked(allowResult);
    // after_tool_call: should ingest a snapshot
    const snapshotsBeforeAfter = snapshots.length;
    if (!allowBlocked) {
        try {
            await getHook("after_tool_call")({
                sessionId,
                toolCallId: "call:probe:write",
                toolName: "write_file",
                result: { status: "success" }
            }, ctx);
        }
        catch {
            // after_tool_call may throw if session was ended; observation is
            // determined by whether a snapshot was ingested.
        }
    }
    const afterToolObserved = snapshots.length > snapshotsBeforeAfter;
    if (!afterToolObserved) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "after_tool did not observe");
    }
    // session_end
    try {
        await getHook("session_end")({ sessionId }, ctx);
    }
    catch {
        // session_end may fail if already ended; that's acceptable
    }
    // -- correlation check ---------------------------------------------------
    const correlationReady = snapshots.length > 0 &&
        snapshots.every((s) => typeof s.campaign_id === "string" &&
            s.campaign_id.length > 0 &&
            typeof s.attempt_id === "string" &&
            s.attempt_id.length > 0 &&
            typeof s.snapshot_sha256 === "string" &&
            s.snapshot_sha256.length > 0);
    if (!correlationReady) {
        throw new Track1PluginProbeError("track1_plugin_probe_failed", "correlation missing in snapshots");
    }
    // -- success: return canonical result -----------------------------------
    return {
        schema_version: "track1-openclaw-probe.v1",
        plugin_id: "agent-security-track1",
        runtime_version: TRACK1_PLUGIN_PROBE_RUNTIME_VERSION,
        tool_names: EXPECTED_TOOLS,
        hook_names: EXPECTED_HOOKS,
        before_tool_blocked: true,
        after_tool_observed: true,
        correlation_ready: true,
        diagnostics: []
    };
}
