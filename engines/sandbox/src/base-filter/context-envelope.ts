import { createHash } from "node:crypto";
import {
  Track1BaseFilterError
} from "./contract.ts";
import type {
  Track1FilterContextEnvelope,
  Track1FilterContextInput,
  Track1FilterMemoryEntry,
  Track1FilterRule,
  Track1FilterSource,
  Track1FilterOperator,
  Track1FilterCategory
} from "./contract.ts";
import type { MonitorModelRequest } from "../monitoring/contract.ts";

// -- closed enums -----------------------------------------------------------

const VALID_SOURCES: readonly Track1FilterSource[] = [
  "user_prompt",
  "retrieved_content",
  "memory_content",
  "model_output",
  "tool_name",
  "tool_target",
  "tool_arguments"
];

const VALID_OPERATORS: readonly Track1FilterOperator[] = [
  "contains_any",
  "contains_all",
  "equals_any"
];

const VALID_CATEGORIES: readonly Track1FilterCategory[] = [
  "jailbreak",
  "prompt_injection",
  "sensitive_data",
  "tool_hijacking",
  "protected_resource",
  "memory_poisoning",
  "sensitive_capability"
];

const VALID_STAGES = ["model_output", "tool_request"] as const;

const VALID_ACTIONS = ["deny", "ask", "alert"] as const;

// -- unsafe pattern detection -----------------------------------------------

const CASE_ID_PATTERN = /T1-SC-\d{3}(-C\d{3})?/;
const UNSAFE_RULE_ID_PATTERNS = [
  /expected_outcome/i,
  /policy_action/i,
  /samples[./\\_-]?track1/i,
  /[/\\]/  // path separators
];

// Rule IDs become evidence URI path segments and must be safe:
// evidence://track1/base-filter/rule/<rule_id>
const SAFE_RULE_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;

function isSafeRuleId(value: string): boolean {
  if (value.trim().length === 0) return false;
  if (!SAFE_RULE_ID_PATTERN.test(value)) return false;
  if (CASE_ID_PATTERN.test(value)) return false;
  for (const pattern of UNSAFE_RULE_ID_PATTERNS) {
    if (pattern.test(value)) return false;
  }
  return true;
}

// -- helpers ----------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
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

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function allUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

// -- context input normalizer ------------------------------------------------

export function normalizeTrack1FilterContextInput(
  value: unknown
): Track1FilterContextInput | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ["user_prompt", "retrieved_content", "memory_entries"])) {
    return null;
  }

  if (!isNonEmptyString(value.user_prompt)) return null;

  if (!Array.isArray(value.retrieved_content)) return null;
  for (const item of value.retrieved_content) {
    if (!(typeof item === "string")) return null;
  }

  if (!Array.isArray(value.memory_entries)) return null;
  const memoryEntries: Track1FilterMemoryEntry[] = [];
  const seenMemoryIds = new Set<string>();
  for (const entry of value.memory_entries) {
    if (!isPlainObject(entry)) return null;
    if (!hasExactKeys(entry, ["memory_id", "content"])) return null;
    if (!isNonEmptyString(entry.memory_id)) return null;
    if (!isNonEmptyString(entry.content)) return null;
    if (seenMemoryIds.has(entry.memory_id)) return null;
    seenMemoryIds.add(entry.memory_id);
    memoryEntries.push({
      memory_id: entry.memory_id,
      content: entry.content
    });
  }

  // Defensive copy
  return {
    user_prompt: value.user_prompt,
    retrieved_content: [...value.retrieved_content],
    memory_entries: memoryEntries
  };
}

// -- rule normalizer ---------------------------------------------------------

const RULE_KEYS = [
  "rule_id",
  "stages",
  "category",
  "action",
  "reason_code",
  "reason",
  "conditions"
] as const;

const CONDITION_KEYS = ["source", "operator", "values"] as const;

function normalizeCondition(
  value: unknown
): Track1FilterRule["conditions"][number] | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, CONDITION_KEYS)) return null;

  if (!isOneOf(VALID_SOURCES, value.source)) return null;
  if (!isOneOf(VALID_OPERATORS, value.operator)) return null;

  if (!Array.isArray(value.values)) return null;
  if (value.values.length === 0) return null;
  for (const v of value.values) {
    if (typeof v !== "string") return null;
    if (!isNonEmptyString(v)) return null;
  }
  if (!allUnique(value.values)) return null;

  return {
    source: value.source,
    operator: value.operator,
    values: [...value.values]
  };
}

export function normalizeTrack1FilterRule(
  value: unknown
): Track1FilterRule | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, RULE_KEYS)) return null;

  // rule_id
  if (!isNonEmptyString(value.rule_id)) return null;
  if (!isSafeRuleId(value.rule_id)) return null;

  // stages
  if (!Array.isArray(value.stages)) return null;
  if (value.stages.length === 0) return null;
  for (const stage of value.stages) {
    if (!isOneOf(VALID_STAGES, stage)) return null;
  }
  if (!allUnique(value.stages)) return null;

  // category
  if (!isOneOf(VALID_CATEGORIES, value.category)) return null;

  // action — reject "allow" in risk rules
  if (!isOneOf(VALID_ACTIONS, value.action)) return null;

  // reason_code
  if (!isNonEmptyString(value.reason_code)) return null;

  // reason
  if (!isNonEmptyString(value.reason)) return null;

  // conditions
  if (!Array.isArray(value.conditions)) return null;
  if (value.conditions.length === 0) return null;

  const normalizedConditions = value.conditions.map(normalizeCondition);
  if (normalizedConditions.some((c) => c === null)) return null;

  // Defensive copy
  return {
    rule_id: value.rule_id,
    stages: [...value.stages],
    category: value.category,
    action: value.action,
    reason_code: value.reason_code,
    reason: value.reason,
    conditions: normalizedConditions as Track1FilterRule["conditions"]
  };
}

// -- catalog normalizer ------------------------------------------------------

export function normalizeTrack1FilterCatalog(
  value: unknown
): readonly Track1FilterRule[] {
  if (!Array.isArray(value)) {
    throw new Track1BaseFilterError("base_filter_catalog_invalid");
  }
  if (value.length === 0) {
    throw new Track1BaseFilterError("base_filter_catalog_invalid");
  }

  const rules = value.map(normalizeTrack1FilterRule);
  if (rules.some((r) => r === null)) {
    throw new Track1BaseFilterError("base_filter_catalog_invalid");
  }

  // Duplicate rule IDs
  const ruleIds = rules.map((r) => r!.rule_id);
  if (!allUnique(ruleIds)) {
    throw new Track1BaseFilterError("base_filter_catalog_invalid");
  }

  // Deep freeze
  const frozen = rules.map((r) =>
    Object.freeze({
      ...r,
      stages: Object.freeze([...r!.stages]),
      conditions: Object.freeze(
        r!.conditions.map((c) =>
          Object.freeze({
            ...c,
            values: Object.freeze([...c.values])
          })
        )
      )
    })
  );

  return Object.freeze(frozen) as readonly Track1FilterRule[];
}

// -- context serialization ---------------------------------------------------

const ENVELOPE_SCHEMA_VERSION = "track1-filter-context.v1" as const;

export function serializeTrack1FilterContext(
  input: Track1FilterContextInput
): string {
  // Validate first
  const normalized = normalizeTrack1FilterContextInput(input);
  if (!normalized) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  // Fixed key insertion order
  const envelope = {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    user_prompt: normalized.user_prompt,
    retrieved_content: normalized.retrieved_content,
    memory_entries: normalized.memory_entries.map(({ memory_id, content }) => ({
      memory_id,
      content
    }))
  };

  return JSON.stringify(envelope);
}

export function parseTrack1FilterContext(
  content: string
): Track1FilterContextEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  if (!isPlainObject(parsed)) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  if (!hasExactKeys(parsed, ["schema_version", "user_prompt", "retrieved_content", "memory_entries"])) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  if (parsed.schema_version !== ENVELOPE_SCHEMA_VERSION) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  if (!isNonEmptyString(parsed.user_prompt)) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }

  if (!Array.isArray(parsed.retrieved_content)) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }
  for (const item of parsed.retrieved_content) {
    if (typeof item !== "string") {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
  }

  if (!Array.isArray(parsed.memory_entries)) {
    throw new Track1BaseFilterError("base_filter_context_invalid");
  }
  const seenIds = new Set<string>();
  const memoryEntries: Track1FilterMemoryEntry[] = [];
  for (const entry of parsed.memory_entries) {
    if (!isPlainObject(entry)) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    if (!hasExactKeys(entry, ["memory_id", "content"])) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    if (!isNonEmptyString(entry.memory_id)) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    if (!isNonEmptyString(entry.content)) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    if (seenIds.has(entry.memory_id)) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    seenIds.add(entry.memory_id);
    memoryEntries.push({
      memory_id: entry.memory_id,
      content: entry.content
    });
  }

  return {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    user_prompt: parsed.user_prompt,
    retrieved_content: [...parsed.retrieved_content],
    memory_entries: memoryEntries
  };
}

// -- model request composition -----------------------------------------------

export function composeTrack1FilterModelRequest(
  input: Track1FilterContextInput
): MonitorModelRequest {
  const serialized = serializeTrack1FilterContext(input);
  const hash = createHash("sha256").update(serialized, "utf8").digest("hex");
  const contentRef = `filter-context://track1/sha256/${hash}`;

  return {
    content: serialized,
    content_ref: contentRef
  };
}

// -- text normalization (used by evaluator, defined here for T1) -------------

export function normalizeTrack1FilterText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}
