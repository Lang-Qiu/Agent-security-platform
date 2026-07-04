// Track 1 OpenClaw plugin public entry point.
// Re-exports the typed plugin registration surface and supporting types.
// P0-Fix1: Uses real definePluginEntry from openclaw/plugin-sdk/plugin-entry.

export {
  registerTrack1Plugin,
  createTrack1PluginEntry,
  SessionToolRuntimeRegistry
} from "./plugin.ts";

export type {
  Track1PluginApi,
  Track1PluginRuntimePorts,
  Track1PluginRuntime
} from "./plugin.ts";

export {
  registerTrack1Tools
} from "./tool-adapters.ts";

export type {
  Track1ToolDefinition,
  Track1ToolParameters,
  Track1ToolExecuteContext,
  Track1ToolResult,
  CampaignToolRuntime,
  CampaignToolRuntimeResolver
} from "./tool-adapters.ts";

export {
  normalizeTrack1PluginContext,
  normalizeTrack1ModelInputEnvelope,
  Track1PluginContextError
} from "./campaign-context.ts";

export type {
  Track1PluginContext,
  Track1ControlledMemoryEntry,
  Track1ControlledToolProposal,
  Track1ModelInputEnvelope
} from "./campaign-context.ts";

export {
  Track1IngestClient,
  Track1IngestError
} from "./ingest-client.ts";

export type {
  Track1IngestTransport
} from "./ingest-client.ts";

export {
  runTrack1PluginCapabilityProbe,
  execOpenclawPluginsInspect,
  TRACK1_PLUGIN_PROBE_COMMAND,
  TRACK1_PLUGIN_PROBE_RESULT_KEYS,
  TRACK1_PLUGIN_PROBE_RUNTIME_VERSION
} from "./runtime-probe.ts";

export type {
  Track1PluginProbeResult,
  Track1PluginProbePorts,
  PluginInspectOutput
} from "./runtime-probe.ts";

// Real OpenClaw plugin loader requires the entry module's `default` export
// to be the DefinedPluginEntry (register/activate owner). Without this,
// `openclaw plugins inspect --runtime` reports "plugin export missing
// register/activate" and no hook/tool ever loads.
export { default } from "./plugin.ts";
