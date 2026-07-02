import { TRACK1_MODEL_REF_CANONICAL } from "../../../shared/types/campaign-ingest.js";
// -- error -----------------------------------------------------------------
export class Track1PluginContextError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "Track1PluginContextError";
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
function hasExactKeys(value, expectedKeys) {
    const actualKeys = Object.keys(value).sort();
    const sortedExpected = [...expectedKeys].sort();
    return (actualKeys.length === sortedExpected.length &&
        actualKeys.every((key, index) => key === sortedExpected[index]));
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
];
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
];
// Forbidden oracle / report fields that must never appear in a model input
const FORBIDDEN_MODEL_INPUT_FIELDS = [
    "expected_outcome",
    "expected_action",
    "policy_action",
    "report_metadata",
    "attempt_outcome"
];
function isValidMemoryEntry(value) {
    if (!isPlainObject(value))
        return false;
    return (isNonEmptyString(value.memory_entry_id) &&
        isNonEmptyString(value.content_ref) &&
        isNonEmptyString(value.content_sha256));
}
function isValidToolProposal(value) {
    if (value === null)
        return true;
    if (!isPlainObject(value))
        return false;
    return ((value.tool_name === "send_email" ||
        value.tool_name === "read_file" ||
        value.tool_name === "write_file" ||
        value.tool_name === "call_api") &&
        isNonEmptyString(value.arguments_ref));
}
// -- context normalization -------------------------------------------------
export function normalizeTrack1PluginContext(value) {
    if (!isPlainObject(value) || !hasExactKeys(value, CONTEXT_KEYS)) {
        throw new Track1PluginContextError("track1_plugin_context_invalid");
    }
    if (!isNonEmptyString(value.campaign_id) ||
        !isNonEmptyString(value.attempt_id) ||
        !isNonEmptyString(value.agent_id) ||
        !isNonEmptyString(value.session_id) ||
        !isNonEmptyString(value.scenario_id) ||
        !isNonEmptyString(value.case_id) ||
        !isNonEmptyString(value.model_ref)) {
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
    ]) {
        if (value[field] === "foreign") {
            throw new Track1PluginContextError("track1_plugin_context_invalid");
        }
    }
    return Object.freeze({
        campaign_id: value.campaign_id,
        attempt_id: value.attempt_id,
        attempt_index: value.attempt_index,
        agent_id: value.agent_id,
        session_id: value.session_id,
        scenario_id: value.scenario_id,
        case_id: value.case_id,
        model_ref: value.model_ref
    });
}
// -- model input envelope normalization ------------------------------------
export function normalizeTrack1ModelInputEnvelope(value) {
    if (!isPlainObject(value) || !hasExactKeys(value, MODEL_INPUT_KEYS)) {
        throw new Track1PluginContextError("track1_model_input_invalid");
    }
    if (value.schema_version !== "track1-openclaw-input.v1") {
        throw new Track1PluginContextError("track1_model_input_invalid");
    }
    if (!isNonEmptyString(value.campaign_id) ||
        !isNonEmptyString(value.agent_id) ||
        !isNonEmptyString(value.attempt_id) ||
        !isNonEmptyString(value.session_id) ||
        !isNonEmptyString(value.case_id) ||
        !isNonEmptyString(value.scenario_id) ||
        !isNonEmptyString(value.user_prompt)) {
        throw new Track1PluginContextError("track1_model_input_invalid");
    }
    if (value.attempt_index !== 1 && value.attempt_index !== 2) {
        throw new Track1PluginContextError("track1_model_input_invalid");
    }
    if (!Array.isArray(value.retrieved_content) ||
        !value.retrieved_content.every(isValidMemoryEntry)) {
        throw new Track1PluginContextError("track1_model_input_invalid");
    }
    if (!Array.isArray(value.memory_entries) ||
        !value.memory_entries.every(isValidMemoryEntry)) {
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
        attempt_index: value.attempt_index,
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
