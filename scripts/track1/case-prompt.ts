// P4-T2: hash-verified, input-only case prompt compiler. Verifies the exact
// canonical case bytes against the manifest hash, then emits ONLY the
// input-only Track1ModelInputEnvelope (never expected_outcome, the policy
// oracle, or any report metadata) as canonical UTF-8 bytes ready to write to
// tmpfs.

import { createHash } from "node:crypto";
import {
  normalizeTrack1ModelInputEnvelope,
  Track1PluginContextError
} from "../../integrations/openclaw/src/campaign-context.ts";
import {
  isCampaignId,
  isSessionId,
  isValidTrack1AgentScenarioCase
} from "../../shared/contracts/campaign-supervision.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS,
  TRACK1_SCENARIO_IDS
} from "../../shared/types/campaign-supervision.ts";
import type {
  Track1CampaignAgentId,
  Track1CaseId,
  Track1ScenarioId
} from "../../shared/types/campaign-supervision.ts";

export class Track1CasePromptError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "Track1CasePromptError";
    this.code = code;
  }
}

function fail(): never {
  throw new Track1CasePromptError("track1_case_prompt_invalid");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return ownKeys.every((key) => expectedSet.has(key));
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

// -- public types ------------------------------------------------------------

export interface Track1CasePromptManifestEntry {
  agent_id: string;
  scenario_id: string;
  case_id: string;
  case_sha256: string;
}

export interface Track1CompiledPrompt {
  case_id: Track1CaseId;
  scenario_id: Track1ScenarioId;
  relative_tmpfs_path: string;
  content_sha256: string;
  utf8: Uint8Array;
}

// -- canonical JSON -----------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail();
    return value;
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const child = value[key];
      if (child === undefined) fail();
      result[key] = canonicalize(child);
    }
    return result;
  }
  fail();
}

function toCanonicalUtf8(value: unknown): Uint8Array {
  const json = JSON.stringify(canonicalize(value));
  return new TextEncoder().encode(`${json}\n`);
}

// -- manifest entry validation -------------------------------------------------

const MANIFEST_ENTRY_KEYS = [
  "agent_id",
  "scenario_id",
  "case_id",
  "case_sha256"
] as const;

function validateManifestEntry(
  value: unknown
): Track1CasePromptManifestEntry {
  if (!isPlainObject(value) || !hasExactKeys(value, MANIFEST_ENTRY_KEYS)) {
    fail();
  }
  const agentId = value.agent_id;
  const scenarioId = value.scenario_id;
  const caseId = value.case_id;
  const caseSha256 = value.case_sha256;

  if (!TRACK1_CAMPAIGN_AGENT_IDS.includes(agentId as Track1CampaignAgentId)) fail();
  if (!TRACK1_SCENARIO_IDS.includes(scenarioId as Track1ScenarioId)) fail();
  if (!TRACK1_CASE_IDS.includes(caseId as Track1CaseId)) fail();
  if (
    !isValidTrack1AgentScenarioCase(
      agentId as string,
      scenarioId as string,
      caseId as string
    )
  ) {
    fail();
  }
  if (!isSha256Hex(caseSha256)) fail();

  return {
    agent_id: agentId as string,
    scenario_id: scenarioId as string,
    case_id: caseId as string,
    case_sha256: caseSha256
  };
}

// -- case input validation -----------------------------------------------------

const TOOL_NAMES = ["send_email", "read_file", "write_file", "call_api"] as const;

interface ParsedCaseInput {
  user_prompt: string;
  retrieved_content: readonly string[];
  memory_entries: ReadonlyArray<{ memory_id: string; content: string }>;
  proposed_tool_call: { tool_name: string; arguments: unknown } | null;
}

function validateCaseInput(value: unknown): ParsedCaseInput {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "user_prompt",
      "retrieved_content",
      "memory_entries",
      "proposed_tool_call"
    ])
  ) {
    fail();
  }
  if (!isNonEmptyString(value.user_prompt)) fail();
  if (
    !Array.isArray(value.retrieved_content) ||
    !value.retrieved_content.every(isNonEmptyString)
  ) {
    fail();
  }
  if (!Array.isArray(value.memory_entries)) fail();
  const memoryEntries: Array<{ memory_id: string; content: string }> = [];
  for (const entry of value.memory_entries) {
    if (
      !isPlainObject(entry) ||
      !hasExactKeys(entry, ["memory_id", "content"]) ||
      !isNonEmptyString(entry.memory_id) ||
      !isNonEmptyString(entry.content)
    ) {
      fail();
    }
    memoryEntries.push({
      memory_id: entry.memory_id as string,
      content: entry.content as string
    });
  }

  let proposedToolCall: { tool_name: string; arguments: unknown } | null = null;
  if (value.proposed_tool_call !== null) {
    const call = value.proposed_tool_call;
    if (
      !isPlainObject(call) ||
      !hasExactKeys(call, ["tool_name", "arguments"]) ||
      !(TOOL_NAMES as readonly string[]).includes(call.tool_name as string) ||
      !isPlainObject(call.arguments)
    ) {
      fail();
    }
    proposedToolCall = {
      tool_name: call.tool_name as string,
      arguments: call.arguments
    };
  }

  return {
    user_prompt: value.user_prompt,
    retrieved_content: value.retrieved_content as string[],
    memory_entries: memoryEntries,
    proposed_tool_call: proposedToolCall
  };
}

function parseCanonicalCaseDocument(
  bytes: Uint8Array,
  manifestEntry: Track1CasePromptManifestEntry
): ParsedCaseInput {
  let text: string;
  try {
    text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
  } catch {
    fail();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail();
  }

  if (!isPlainObject(parsed)) fail();
  if (parsed.schema_version !== "track1-case.v1") fail();
  if (parsed.case_id !== manifestEntry.case_id) fail();
  if (parsed.scenario_id !== manifestEntry.scenario_id) fail();
  if (!isPlainObject(parsed.input)) fail();

  return validateCaseInput(parsed.input);
}

// -- input validation -----------------------------------------------------------

const COMPILE_INPUT_KEYS = [
  "manifest_entry",
  "canonical_case_bytes",
  "campaign_id",
  "agent_id",
  "attempt_id",
  "attempt_index",
  "session_id"
] as const;

// -- public API -----------------------------------------------------------------

export function compileTrack1CasePrompt(input: unknown): Track1CompiledPrompt {
  if (!isPlainObject(input) || !hasExactKeys(input, COMPILE_INPUT_KEYS)) {
    fail();
  }

  const manifestEntry = validateManifestEntry(input.manifest_entry);

  const caseBytes = input.canonical_case_bytes;
  if (!(caseBytes instanceof Uint8Array)) fail();

  const actualHash = createHash("sha256").update(caseBytes).digest("hex");
  if (actualHash !== manifestEntry.case_sha256) fail();

  if (!isCampaignId(input.campaign_id)) fail();
  if (input.agent_id !== manifestEntry.agent_id) fail();
  if (!TRACK1_CAMPAIGN_AGENT_IDS.includes(input.agent_id as Track1CampaignAgentId)) {
    fail();
  }
  if (input.attempt_index !== 1 && input.attempt_index !== 2) fail();
  if (!isSessionId(input.session_id)) fail();

  const expectedAttemptId = `attempt:${manifestEntry.case_id.toLowerCase()}:${input.attempt_index}`;
  if (input.attempt_id !== expectedAttemptId) fail();

  const caseInput = parseCanonicalCaseDocument(caseBytes, manifestEntry);

  const retrievedContent = caseInput.retrieved_content.map((text, index) => ({
    memory_entry_id: `retrieved:${index + 1}`,
    content_ref: `case://${manifestEntry.case_id}/retrieved/${index + 1}`,
    content_sha256: createHash("sha256").update(text, "utf8").digest("hex")
  }));

  const memoryEntries = caseInput.memory_entries.map((entry) => ({
    memory_entry_id: entry.memory_id,
    content_ref: `case://${manifestEntry.case_id}/memory/${entry.memory_id}`,
    content_sha256: createHash("sha256").update(entry.content, "utf8").digest("hex")
  }));

  const proposedToolCall = caseInput.proposed_tool_call
    ? {
        tool_name: caseInput.proposed_tool_call.tool_name as
          | "send_email"
          | "read_file"
          | "write_file"
          | "call_api",
        arguments_ref: `case://${manifestEntry.case_id}/tool-call/${caseInput.proposed_tool_call.tool_name}`
      }
    : null;

  const envelopeInput = {
    schema_version: "track1-openclaw-input.v1" as const,
    campaign_id: input.campaign_id as string,
    agent_id: input.agent_id as string,
    attempt_id: input.attempt_id as string,
    attempt_index: input.attempt_index as 1 | 2,
    session_id: input.session_id as string,
    case_id: manifestEntry.case_id,
    scenario_id: manifestEntry.scenario_id,
    user_prompt: caseInput.user_prompt,
    retrieved_content: retrievedContent,
    memory_entries: memoryEntries,
    proposed_tool_call: proposedToolCall
  };

  let normalizedEnvelope;
  try {
    normalizedEnvelope = normalizeTrack1ModelInputEnvelope(envelopeInput);
  } catch (error) {
    if (error instanceof Track1PluginContextError) fail();
    throw error;
  }

  const utf8 = toCanonicalUtf8(normalizedEnvelope);
  const contentSha256 = createHash("sha256").update(utf8).digest("hex");
  const relativeTmpfsPath = `/run/track1/messages/attempt-${manifestEntry.case_id.toLowerCase()}-${input.attempt_index}.json`;

  return Object.freeze({
    case_id: manifestEntry.case_id as Track1CaseId,
    scenario_id: manifestEntry.scenario_id as Track1ScenarioId,
    relative_tmpfs_path: relativeTmpfsPath,
    content_sha256: contentSha256,
    utf8
  });
}
