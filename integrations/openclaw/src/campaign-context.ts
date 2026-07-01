import {
  TRACK1_MODEL_REF_CANONICAL
} from "../../../shared/types/campaign-ingest.ts";

// -- public types ----------------------------------------------------------

export interface Track1PluginContext {
  readonly campaign_id: string;
  readonly attempt_id: string;
  readonly attempt_index: 1 | 2;
  readonly agent_id: string;
  readonly session_id: string;
  readonly scenario_id: string;
  readonly case_id: string;
  readonly model_ref: string;
}

export interface Track1ControlledMemoryEntry {
  memory_entry_id: string;
  content_ref: string;
  content_sha256: string;
}

export interface Track1ControlledToolProposal {
  tool_name: "send_email" | "read_file" | "write_file" | "call_api";
  arguments_ref: string;
}

export interface Track1ModelInputEnvelope {
  readonly schema_version: "track1-openclaw-input.v1";
  readonly campaign_id: string;
  readonly agent_id: string;
  readonly attempt_id: string;
  readonly attempt_index: 1 | 2;
  readonly session_id: string;
  readonly case_id: string;
  readonly scenario_id: string;
  readonly user_prompt: string;
  readonly retrieved_content: readonly Track1ControlledMemoryEntry[];
  readonly memory_entries: readonly Track1ControlledMemoryEntry[];
  readonly proposed_tool_call: Track1ControlledToolProposal | null;
}

// -- error -----------------------------------------------------------------

export class Track1PluginContextError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1PluginContextError";
    this.code = code;
  }
}

// -- helpers ---------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

const CONTEXT_KEYS = [
  "campaign_id",
  "attempt_id",
  "attempt_index",
  "agent_id",
  "session_id",
  "scenario_id",
  "case_id",
  "model_ref"
] as const;

const MODEL_INPUT_KEYS = [
  "schema_version",
  "campaign_id",
  "agent_id",
  "attempt_id",
  "attempt_index",
  "session_id",
  "case_id",
  "scenario_id",
  "user_prompt",
  "retrieved_content",
  "memory_entries",
  "proposed_tool_call"
] as const;

// Forbidden oracle / report fields that must never appear in a model input
const FORBIDDEN_MODEL_INPUT_FIELDS = [
  "expected_outcome",
  "expected_action",
  "policy_action",
  "report_metadata",
  "attempt_outcome"
];

function isValidMemoryEntry(value: unknown): value is Track1ControlledMemoryEntry {
  if (!isPlainObject(value)) return false;
  return (
    isNonEmptyString(value.memory_entry_id) &&
    isNonEmptyString(value.content_ref) &&
    isNonEmptyString(value.content_sha256)
  );
}

function isValidToolProposal(
  value: unknown
): value is Track1ControlledToolProposal | null {
  if (value === null) return true;
  if (!isPlainObject(value)) return false;
  return (
    (value.tool_name === "send_email" ||
      value.tool_name === "read_file" ||
      value.tool_name === "write_file" ||
      value.tool_name === "call_api") &&
    isNonEmptyString(value.arguments_ref)
  );
}

// -- context normalization -------------------------------------------------

export function normalizeTrack1PluginContext(
  value: unknown
): Track1PluginContext {
  if (!isPlainObject(value) || !hasExactKeys(value, CONTEXT_KEYS)) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }

  if (
    !isNonEmptyString(value.campaign_id) ||
    !isNonEmptyString(value.attempt_id) ||
    !isNonEmptyString(value.agent_id) ||
    !isNonEmptyString(value.session_id) ||
    !isNonEmptyString(value.scenario_id) ||
    !isNonEmptyString(value.case_id) ||
    !isNonEmptyString(value.model_ref)
  ) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }

  if (value.attempt_index !== 1 && value.attempt_index !== 2) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }

  if (value.model_ref !== TRACK1_MODEL_REF_CANONICAL) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }

  // Correlation: campaign_id, attempt_id, agent_id, session_id must not be
  // the sentinel "foreign" — they must be internally consistent. The plugin
  // context is bound once from the runner; drift indicates tampering.
  for (const field of [
    "campaign_id",
    "attempt_id",
    "agent_id",
    "session_id"
  ] as const) {
    if (value[field] === "foreign") {
      throw new Track1PluginContextError("track1_plugin_context_invalid");
    }
  }

  return Object.freeze({
    campaign_id: value.campaign_id,
    attempt_id: value.attempt_id,
    attempt_index: value.attempt_index as 1 | 2,
    agent_id: value.agent_id,
    session_id: value.session_id,
    scenario_id: value.scenario_id,
    case_id: value.case_id,
    model_ref: value.model_ref
  });
}

// -- model input envelope normalization ------------------------------------

export function normalizeTrack1ModelInputEnvelope(
  value: unknown
): Track1ModelInputEnvelope {
  if (!isPlainObject(value) || !hasExactKeys(value, MODEL_INPUT_KEYS)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (value.schema_version !== "track1-openclaw-input.v1") {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (
    !isNonEmptyString(value.campaign_id) ||
    !isNonEmptyString(value.agent_id) ||
    !isNonEmptyString(value.attempt_id) ||
    !isNonEmptyString(value.session_id) ||
    !isNonEmptyString(value.case_id) ||
    !isNonEmptyString(value.scenario_id) ||
    !isNonEmptyString(value.user_prompt)
  ) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (value.attempt_index !== 1 && value.attempt_index !== 2) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (
    !Array.isArray(value.retrieved_content) ||
    !value.retrieved_content.every(isValidMemoryEntry)
  ) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (
    !Array.isArray(value.memory_entries) ||
    !value.memory_entries.every(isValidMemoryEntry)
  ) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  if (!isValidToolProposal(value.proposed_tool_call)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }

  return Object.freeze({
    schema_version: value.schema_version,
    campaign_id: value.campaign_id,
    agent_id: value.agent_id,
    attempt_id: value.attempt_id,
    attempt_index: value.attempt_index as 1 | 2,
    session_id: value.session_id,
    case_id: value.case_id,
    scenario_id: value.scenario_id,
    user_prompt: value.user_prompt,
    retrieved_content: Object.freeze([...value.retrieved_content]),
    memory_entries: Object.freeze([...value.memory_entries]),
    proposed_tool_call: value.proposed_tool_call
      ? Object.freeze({ ...value.proposed_tool_call })
      : null
  });
}
