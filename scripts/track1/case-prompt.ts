// P4-T2: compile a hash-verified, oracle-free, input-only model prompt
// envelope for one attempt. The compiler never reads expected_outcome or any
// other oracle field from the canonical case file — only `input` data is
// copied into the compiled bytes.

import { createHash } from "node:crypto";
import { parseTrack1CaseFixture } from "../../engines/sandbox/src/replay/loader.ts";
import type { Track1ScenarioId } from "../../engines/sandbox/src/replay/contract.ts";
import { normalizeTrack1ModelInputEnvelope } from "../../integrations/openclaw/src/campaign-context.ts";
import type {
  Track1ControlledMemoryEntry,
  Track1ControlledToolProposal
} from "../../integrations/openclaw/src/campaign-context.ts";
import type {
  Track1CampaignAgentId,
  Track1CampaignId,
  Track1CaseId,
  Track1SessionId
} from "../../shared/types/campaign-supervision.ts";

// -- public types ------------------------------------------------------------

export interface Track1CompiledPrompt {
  case_id: Track1CaseId;
  scenario_id: Track1ScenarioId;
  relative_tmpfs_path: string;
  content_sha256: string;
  utf8: Uint8Array;
}

// -- error --------------------------------------------------------------------

class Track1CasePromptError extends Error {
  constructor() {
    super("track1_case_prompt_invalid");
    this.name = "Track1CasePromptError";
  }
}

// -- helpers ------------------------------------------------------------------

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

const INPUT_KEYS = [
  "manifest_entry",
  "canonical_case_bytes",
  "campaign_id",
  "agent_id",
  "attempt_id",
  "attempt_index",
  "session_id"
] as const;

const MANIFEST_ENTRY_KEYS = [
  "agent_id",
  "scenario_id",
  "case_id",
  "case_ref",
  "case_sha256",
  "expected_action"
] as const;

const CASE_SHA256_PATTERN = /^[a-f0-9]{64}$/;

interface Track1CasePromptManifestEntry {
  agent_id: string;
  scenario_id: Track1ScenarioId;
  case_id: string;
  case_ref: string;
  case_sha256: string;
  expected_action: string;
}

function validateManifestEntry(value: unknown): Track1CasePromptManifestEntry {
  if (!isPlainObject(value) || !hasExactKeys(value, MANIFEST_ENTRY_KEYS)) {
    throw new Track1CasePromptError();
  }
  if (
    !isNonEmptyString(value.agent_id) ||
    !isNonEmptyString(value.scenario_id) ||
    !isNonEmptyString(value.case_id) ||
    !isNonEmptyString(value.case_ref) ||
    !isNonEmptyString(value.expected_action)
  ) {
    throw new Track1CasePromptError();
  }
  if (
    typeof value.case_sha256 !== "string" ||
    !CASE_SHA256_PATTERN.test(value.case_sha256)
  ) {
    throw new Track1CasePromptError();
  }
  return value as unknown as Track1CasePromptManifestEntry;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Recursively sorts object keys so the serialized bytes are canonical and
// deterministic across repeated compilations of the same input.
function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalizeValue(value[key]);
    }
    return result;
  }
  return value;
}

function deriveTmpfsPath(attemptId: string): string {
  return `/run/track1/messages/${attemptId.replace(/:/g, "-")}.json`;
}

// -- compiler -----------------------------------------------------------------

export function compileTrack1CasePrompt(input: unknown): Track1CompiledPrompt {
  if (!isPlainObject(input) || !hasExactKeys(input, INPUT_KEYS)) {
    throw new Track1CasePromptError();
  }

  const manifestEntry = validateManifestEntry(input.manifest_entry);

  if (!(input.canonical_case_bytes instanceof Uint8Array) || input.canonical_case_bytes.length === 0) {
    throw new Track1CasePromptError();
  }
  const canonicalCaseBytes = input.canonical_case_bytes;

  if (
    !isNonEmptyString(input.campaign_id) ||
    !isNonEmptyString(input.agent_id) ||
    !isNonEmptyString(input.attempt_id) ||
    !isNonEmptyString(input.session_id)
  ) {
    throw new Track1CasePromptError();
  }
  if (input.attempt_index !== 1 && input.attempt_index !== 2) {
    throw new Track1CasePromptError();
  }

  // Hash-verify the canonical case bytes against the immutable manifest entry
  // before ever parsing them. Tampered bytes must never reach the parser.
  if (sha256Hex(canonicalCaseBytes) !== manifestEntry.case_sha256) {
    throw new Track1CasePromptError();
  }

  let parsedCase: unknown;
  try {
    parsedCase = JSON.parse(Buffer.from(canonicalCaseBytes).toString("utf8"));
  } catch {
    throw new Track1CasePromptError();
  }

  let fixture;
  try {
    fixture = parseTrack1CaseFixture(parsedCase, manifestEntry.scenario_id);
  } catch {
    throw new Track1CasePromptError();
  }

  if (fixture.case_id !== manifestEntry.case_id) {
    throw new Track1CasePromptError();
  }

  const lowerCaseId = fixture.case_id.toLowerCase();

  const retrievedEntries: Track1ControlledMemoryEntry[] = fixture.input.retrieved_content.map(
    (content, index) => ({
      memory_entry_id: `memory:track1-retrieved:${String(index + 1).padStart(3, "0")}`,
      content_ref: `case://track1/${lowerCaseId}/retrieved/${String(index + 1).padStart(3, "0")}`,
      content_sha256: createHash("sha256").update(content, "utf8").digest("hex")
    })
  );

  const memoryEntries: Track1ControlledMemoryEntry[] = fixture.input.memory_entries.map(
    (entry) => ({
      memory_entry_id: `memory:track1-memory:${entry.memory_id}`,
      content_ref: `case://track1/${lowerCaseId}/memory/${entry.memory_id}`,
      content_sha256: createHash("sha256").update(entry.content, "utf8").digest("hex")
    })
  );

  const proposedToolCall: Track1ControlledToolProposal | null =
    fixture.input.proposed_tool_call === null
      ? null
      : {
          tool_name: fixture.input.proposed_tool_call.tool_name,
          arguments_ref: `case://track1/${lowerCaseId}/proposed-tool-call`
        };

  let envelope;
  try {
    envelope = normalizeTrack1ModelInputEnvelope({
      schema_version: "track1-openclaw-input.v1",
      campaign_id: input.campaign_id as Track1CampaignId,
      agent_id: input.agent_id as Track1CampaignAgentId,
      attempt_id: input.attempt_id,
      attempt_index: input.attempt_index,
      session_id: input.session_id as Track1SessionId,
      case_id: fixture.case_id,
      scenario_id: fixture.scenario_id,
      user_prompt: fixture.input.user_prompt,
      retrieved_content: retrievedEntries,
      memory_entries: memoryEntries,
      proposed_tool_call: proposedToolCall
    });
  } catch {
    throw new Track1CasePromptError();
  }

  const canonicalJson = JSON.stringify(canonicalizeValue(envelope));
  const utf8 = new TextEncoder().encode(`${canonicalJson}\n`);

  return Object.freeze({
    case_id: envelope.case_id,
    scenario_id: envelope.scenario_id,
    relative_tmpfs_path: deriveTmpfsPath(envelope.attempt_id),
    content_sha256: sha256Hex(utf8),
    utf8
  }) as Track1CompiledPrompt;
}
