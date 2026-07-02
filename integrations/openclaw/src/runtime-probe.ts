// P1-Fix8: Startup probe runs real `openclaw plugins inspect` command output
// for static checks (tools, hooks, version, labels) instead of a self-made
// recording API. Dynamic checks still use a minimal recording API to verify
// hook behavior, but the static shape comes from the real SDK runtime.
// P1-ISSUE13: Export getDefaultProbePorts() so consumers can obtain a
// functional probe configuration without importing execFileSync.

import { execFileSync } from "node:child_process";
import { registerTrack1Plugin } from "./plugin.ts";
import { SessionToolRuntimeRegistry } from "./plugin.ts";
import type { Track1PluginRuntimePorts } from "./plugin.ts";
import type { Track1PluginApi, Track1ToolDefinition } from "./tool-adapters.ts";
import { normalizeTrack1PluginContext } from "./campaign-context.ts";
import type { Track1PluginContext } from "./campaign-context.ts";
import {
  TRACK1_MODEL_REF_CANONICAL
} from "../../../shared/types/campaign-ingest.ts";
import type { Track1CampaignSnapshotEnvelope } from "../../../shared/types/campaign-ingest.ts";

// -- public types ----------------------------------------------------------

export interface PluginInspectOutput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly runtime_version: string;
  readonly tools: ReadonlyArray<{ name: string }>;
  readonly hooks: readonly string[];
  readonly diagnostics: readonly unknown[];
}

export interface Track1PluginProbeResult {
  readonly schema_version: "track1-openclaw-probe.v1";
  readonly plugin_id: "agent-security-track1";
  readonly runtime_version: "2026.6.10";
  readonly tool_names: readonly ["call_api", "read_file", "send_email", "write_file"];
  readonly hook_names: readonly [
    "after_tool_call",
    "before_tool_call",
    "llm_input",
    "llm_output",
    "session_end",
    "session_start"
  ];
  readonly before_tool_blocked: true;
  readonly after_tool_observed: true;
  readonly correlation_ready: true;
  readonly diagnostics: readonly never[];
}

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
] as const);

export const TRACK1_PLUGIN_PROBE_COMMAND =
  "openclaw plugins inspect agent-security-track1 --runtime --json";

export const TRACK1_PLUGIN_PROBE_EXECUTABLE =
  process.platform === "win32" ? "openclaw.cmd" : "openclaw";

export const TRACK1_PLUGIN_PROBE_RUNTIME_VERSION = "2026.6.10";

// -- probe input -----------------------------------------------------------

type Track1ProbeMutation =
  | "wrong-version"
  | "missing-tool"
  | "duplicate-tool"
  | "missing-hook"
  | "block-failed"
  | "after-not-observed"
  | "correlation-missing"
  | "diagnostic-present";

export interface Track1PluginProbePorts {
  // P1-Fix8: The parsed output from `openclaw plugins inspect` command.
  // In production, obtained via execOpenclawPluginsInspect(). In tests,
  // injected as a canned response.
  inspect: PluginInspectOutput;
  ports: Track1PluginRuntimePorts;
  mutation?: Track1ProbeMutation;
}

// -- real command execution (P1-Fix8) --------------------------------------

/**
 * Execute `openclaw plugins inspect` to obtain the real plugin runtime output.
 * In production, this is the canonical source of truth for static checks.
 * Tests can supply a canned PluginInspectOutput via Track1PluginProbePorts.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeOpenclawPluginInspectOutput(
  input: unknown,
  versionOutput: string
): PluginInspectOutput {
  const root = isPlainObject(input) ? input : {};
  const plugin = isPlainObject(root.plugin) ? root.plugin : {};
  const typedHooks = Array.isArray(root.typedHooks) ? root.typedHooks : [];
  const toolGroups = Array.isArray(root.tools) ? root.tools : [];
  const versionMatch = versionOutput.match(/\bOpenClaw\s+(\d{4}\.\d+\.\d+)\b/);

  const hooks = typedHooks.flatMap((entry) =>
    isPlainObject(entry) && typeof entry.name === "string"
      ? [entry.name]
      : []
  );
  const tools = toolGroups.flatMap((entry) =>
    isPlainObject(entry) && Array.isArray(entry.names)
      ? entry.names
          .filter((name): name is string => typeof name === "string")
          .map((name) => ({ name }))
      : []
  );

  return {
    id: typeof plugin.id === "string" ? plugin.id : "",
    name: typeof plugin.name === "string" ? plugin.name : "",
    status: typeof plugin.status === "string" ? plugin.status : "",
    runtime_version: versionMatch?.[1] ?? "",
    tools,
    hooks,
    diagnostics: Array.isArray(root.diagnostics) ? root.diagnostics : []
  };
}

function execOpenclaw(args: readonly string[]): string {
  if (args.some((arg) => !/^[A-Za-z0-9._:-]+$/.test(arg))) {
    throw new Error("track1_plugin_probe_failed");
  }
  const options = {
    encoding: "utf8" as const,
    timeout: 30_000
  };
  if (process.platform === "win32") {
    const command = [TRACK1_PLUGIN_PROBE_EXECUTABLE, ...args].join(" ");
    return execFileSync("cmd.exe", ["/d", "/s", "/c", command], options);
  }
  return execFileSync(TRACK1_PLUGIN_PROBE_EXECUTABLE, [...args], options);
}

export function execOpenclawPluginsInspect(): PluginInspectOutput {
  const stdout = execOpenclaw([
    "plugins",
    "inspect",
    "agent-security-track1",
    "--runtime",
    "--json"
  ]);
  const versionOutput = execOpenclaw(["--version"]);
  return normalizeOpenclawPluginInspectOutput(
    JSON.parse(stdout) as unknown,
    versionOutput
  );
}

/**
 * Obtain default probe ports by executing the real `openclaw plugins inspect`
 * command. This is the production default; tests should call makeProbePorts()
 * or pass a canned Track1PluginProbePorts directly.
 *
 * This function exists so entry-point code can write:
 *   const ports = getDefaultProbePorts();
 *   const result = await runTrack1PluginCapabilityProbe(ports);
 *
 * without importing execFileSync or constructing Track1PluginRuntimePorts.
 * The local probe runtime uses the canonical REQ-008 no-match decision and a
 * contract-valid correlated acknowledgement without performing network I/O.
 */
export function createTrack1ProbePorts(
  inspect: PluginInspectOutput,
  now: () => string = () => new Date().toISOString()
): Track1PluginProbePorts {
  let idSequence = 0;
  const ports: Track1PluginRuntimePorts = {
    provider: {
      decide() {
        return {
          policy_id: "policy://track1/base-filter/v1",
          action: "allow",
          reason_code: "base_filter_no_match",
          reason: "No base filter rule matched",
          evidence_refs: ["evidence://track1/base-filter/no-match"]
        };
      }
    },
    async ingestSnapshot(envelope) {
      return {
        schema_version: "track1-campaign-snapshot-ack.v1",
        campaign_id: envelope.campaign_id,
        attempt_id: envelope.attempt_id,
        sequence: envelope.sequence,
        snapshot_sha256: envelope.snapshot_sha256,
        accepted_at: now()
      };
    },
    now,
    nextId(kind: string): string {
      idSequence += 1;
      return `${kind}:probe:${String(idSequence).padStart(4, "0")}`;
    }
  };
  return { inspect, ports };
}

export function getDefaultProbePorts(): Track1PluginProbePorts {
  return createTrack1ProbePorts(execOpenclawPluginsInspect());
}

// -- error -----------------------------------------------------------------

class Track1PluginProbeError extends Error {
  readonly code: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "Track1PluginProbeError";
    this.code = code;
  }
}

// -- recording api for dynamic checks --------------------------------------

interface ProbeHookEntry {
  name: string;
  handler: (event: unknown, ctx: unknown) => unknown | Promise<unknown>;
  options?: { priority?: number; timeoutMs?: number };
}

interface ProbeRecordingApi extends Track1PluginApi {
  tools: Track1ToolDefinition[];
  hooks: ProbeHookEntry[];
}

function makeProbeRecordingApi(): ProbeRecordingApi {
  const tools: Track1ToolDefinition[] = [];
  const hooks: ProbeHookEntry[] = [];
  return {
    tools,
    hooks,
    registerTool(tool: Track1ToolDefinition) {
      tools.push(tool);
    },
    on(
      name: string,
      handler: (event: unknown, ctx: unknown) => unknown | Promise<unknown>,
      options?: { priority?: number; timeoutMs?: number }
    ) {
      hooks.push({ name, handler, options });
    }
  };
}

// -- probe context ---------------------------------------------------------

const PROBE_CONTEXT_INPUT = Object.freeze({
  campaign_id: "campaign:t1:00000000000000000000000000000001",
  attempt_id: "attempt:t1-sc-001-c001:1",
  attempt_index: 1 as const,
  agent_id: "agent:track1:prompt-injection",
  session_id: "session:00000000000000000000000000000001",
  scenario_id: "T1-SC-001",
  case_id: "T1-SC-001-C001",
  model_ref: TRACK1_MODEL_REF_CANONICAL
});

const PROBE_CONTEXT: Track1PluginContext = normalizeTrack1PluginContext(PROBE_CONTEXT_INPUT);

const EXPECTED_TOOLS = Object.freeze([
  "call_api",
  "read_file",
  "send_email",
  "write_file"
] as const);

const EXPECTED_HOOKS = Object.freeze([
  "after_tool_call",
  "before_tool_call",
  "llm_input",
  "llm_output",
  "session_end",
  "session_start"
] as const);

// -- helpers ---------------------------------------------------------------

function isBlocked(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const obj = result as Record<string, unknown>;
  return obj.block === true && typeof obj.blockReason === "string";
}

function deepEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// -- mutation application (dynamic only) -----------------------------------

function applyDynamicMutation(
  api: ProbeRecordingApi,
  mutation: Track1ProbeMutation | undefined,
  ingestWrapper: {
    snapshots: Track1CampaignSnapshotEnvelope[];
    ingest: (envelope: Track1CampaignSnapshotEnvelope) => Promise<unknown>;
  }
): void {
  if (!mutation) return;

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
        const defective: Track1CampaignSnapshotEnvelope = {
          ...envelope,
          campaign_id: "" as Track1CampaignSnapshotEnvelope["campaign_id"]
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

export async function runTrack1PluginCapabilityProbe(
  input: Track1PluginProbePorts
): Promise<Track1PluginProbeResult> {
  const { inspect, ports, mutation } = input;

  // -- static checks (from `openclaw plugins inspect` output) -------------
  // P1-Fix8: These checks verify the real SDK runtime's view of the plugin,
  // not a self-made recording API.

  const toolNames = [...inspect.tools.map((t) => t.name)].sort();
  const hookNames = [...inspect.hooks].sort();

  if (
    inspect.id !== "agent-security-track1" ||
    inspect.status !== "loaded"
  ) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "plugin identity or load status mismatch"
    );
  }

  if (new Set(toolNames).size !== toolNames.length) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "duplicate tool detected"
    );
  }

  if (!deepEqual(toolNames, [...EXPECTED_TOOLS])) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "tool set mismatch"
    );
  }

  if (!deepEqual(hookNames, [...EXPECTED_HOOKS])) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "hook set mismatch"
    );
  }

  if (inspect.runtime_version !== TRACK1_PLUGIN_PROBE_RUNTIME_VERSION) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "runtime version mismatch"
    );
  }

  if (inspect.diagnostics.length > 0) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "diagnostics present"
    );
  }

  // -- dynamic checks (via recording API) ---------------------------------
  // These verify the plugin's hook behavior: before_tool_call blocks unknown
  // tools, after_tool_call observes results, and snapshots carry correlation.

  const api = makeProbeRecordingApi();

  const snapshots: Track1CampaignSnapshotEnvelope[] = [];
  const ingestWrapper = {
    snapshots,
    async ingest(envelope: Track1CampaignSnapshotEnvelope) {
      snapshots.push(envelope);
      return ports.ingestSnapshot(envelope);
    }
  };

  const wrappedPorts: Track1PluginRuntimePorts = {
    ...ports,
    async ingestSnapshot(envelope: Track1CampaignSnapshotEnvelope) {
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

  const getHook = (name: string) => {
    const hook = api.hooks.find((h) => h.name === name);
    if (!hook) {
      throw new Track1PluginProbeError(
        "track1_plugin_probe_failed",
        `hook ${name} not found`
      );
    }
    return hook.handler;
  };

  // Start session
  await getHook("session_start")({ sessionId }, ctx);

  // LLM input
  await getHook("llm_input")(
    {
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
    },
    ctx
  );

  // LLM output
  await getHook("llm_output")(
    {
      sessionId,
      content: "The portal is operating normally.",
      contentRef: "model://track1/probe/output/001"
    },
    ctx
  );

  // before_tool_call: unknown tool must block
  const unknownResult = await getHook("before_tool_call")(
    {
      sessionId,
      toolCallId: "call:probe:unknown",
      toolName: "unknown_tool",
      params: {}
    },
    ctx
  );
  const beforeToolBlocked = isBlocked(unknownResult);

  if (!beforeToolBlocked) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "before_tool did not block unknown tool"
    );
  }

  // before_tool_call: known tool should allow (and ingest)
  const allowResult = await getHook("before_tool_call")(
    {
      sessionId,
      toolCallId: "call:probe:write",
      toolName: "write_file",
      params: {
        path: "sandbox://probe/test.txt",
        content: "probe"
      }
    },
    ctx
  );

  const allowBlocked = isBlocked(allowResult);

  // after_tool_call: should ingest a snapshot
  const snapshotsBeforeAfter = snapshots.length;
  if (!allowBlocked) {
    try {
      await getHook("after_tool_call")(
        {
          sessionId,
          toolCallId: "call:probe:write",
          toolName: "write_file",
          result: { status: "success" }
        },
        ctx
      );
    } catch {
      // after_tool_call may throw if session was ended; observation is
      // determined by whether a snapshot was ingested.
    }
  }
  const afterToolObserved = snapshots.length > snapshotsBeforeAfter;

  if (!afterToolObserved) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "after_tool did not observe"
    );
  }

  // session_end
  try {
    await getHook("session_end")({ sessionId }, ctx);
  } catch {
    // session_end may fail if already ended; that's acceptable
  }

  // -- correlation check ---------------------------------------------------

  const correlationReady =
    snapshots.length > 0 &&
    snapshots.every(
      (s) =>
        typeof s.campaign_id === "string" &&
        s.campaign_id.length > 0 &&
        typeof s.attempt_id === "string" &&
        s.attempt_id.length > 0 &&
        typeof s.snapshot_sha256 === "string" &&
        s.snapshot_sha256.length > 0
    );

  if (!correlationReady) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "correlation missing in snapshots"
    );
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
