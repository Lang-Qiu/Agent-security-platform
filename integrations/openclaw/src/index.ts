// Track 1 OpenClaw plugin public entry point.
// Re-exports the typed plugin registration surface and supporting types.

export {
  registerTrack1Plugin
} from "./plugin.ts";

export type {
  Track1HookName,
  Track1HookOptions,
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
  Track1ToolOutput,
  CampaignToolRuntime
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
