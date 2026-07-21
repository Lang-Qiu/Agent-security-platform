import { createHash } from "node:crypto";
import {
  lstatSync,
  opendirSync,
  readFileSync
} from "node:fs";
import { relative, resolve, sep } from "node:path";
import { types as utilTypes } from "node:util";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES,
  normalizeSandboxSecurityRequest,
  type SandboxSecurityClaimedSourceType,
  type SandboxSecurityRequest,
  type SandboxSecurityJsonValue
} from "../../../shared/index.ts";

export const SANDBOX_SECURITY_BENCHMARK_SOURCES_SCHEMA_VERSION =
  "sandbox-security-benchmark-sources.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION =
  "sandbox-security-benchmark-input.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_TRUTH_SCHEMA_VERSION =
  "sandbox-security-benchmark-truth.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_REVIEWS_SCHEMA_VERSION =
  "sandbox-security-benchmark-reviews.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_REQUEST_IDS_SCHEMA_VERSION =
  "sandbox-security-benchmark-request-ids.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_MANIFEST_SCHEMA_VERSION =
  "sandbox-security-benchmark-manifest.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_REPLAY_SCHEMA_VERSION =
  "sandbox-security-benchmark-replay.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION =
  "sandbox-security-benchmark-capture.v1" as const;
export const SANDBOX_SECURITY_BENCHMARK_SEAL_SCHEMA_VERSION =
  "sandbox-security-benchmark-seal.v1" as const;

export type SandboxSecurityBenchmarkSha256 = string;
export type SandboxSecurityBenchmarkDigest = `sha256:${string}`;
export type SandboxSecurityBenchmarkLicense =
  | "Apache-2.0"
  | "MIT"
  | "BSD-2-Clause"
  | "BSD-3-Clause"
  | "CC-BY-4.0"
  | "CC0-1.0";
export type SandboxSecurityBenchmarkLanguage = "zh" | "en";
export type SandboxSecurityBenchmarkReviewStatus = "approved";
export type SandboxSecurityBenchmarkReviewApplicability =
  | "approved"
  | "not_applicable";
export type SandboxSecurityBenchmarkSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";
export type SandboxSecurityBenchmarkTransformationKind =
  | null
  | "encoding"
  | "whitespace"
  | "case"
  | "synonym"
  | "split_token"
  | "cross_source";
export type SandboxSecurityBenchmarkDerivation =
  | "direct"
  | "human_translation"
  | "transformed";

export interface SandboxSecurityBenchmarkSourceRecord {
  readonly record_ref: string;
  readonly upstream_sha256: SandboxSecurityBenchmarkSha256;
}

export interface SandboxSecurityBenchmarkSource {
  readonly source_id: string;
  readonly upstream_url: string;
  readonly revision: string;
  readonly admitted_scope: string;
  readonly license: SandboxSecurityBenchmarkLicense;
  readonly license_url: string;
  readonly license_evidence_sha256: SandboxSecurityBenchmarkSha256;
  readonly attribution: string;
  readonly redistribution_confirmed: true;
  readonly records: readonly SandboxSecurityBenchmarkSourceRecord[];
}

export interface SandboxSecurityBenchmarkSourcesLock {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_SOURCES_SCHEMA_VERSION;
  readonly sources: readonly SandboxSecurityBenchmarkSource[];
}

export interface SandboxSecurityBenchmarkAuthoritativeSource {
  readonly source_id: string;
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly source_type:
    SandboxSecurityClaimedSourceType;
  readonly media_type: "text/plain" | "application/json";
  readonly value: string | SandboxSecurityJsonValue;
  readonly provenance_ref: string;
}

export interface SandboxSecurityBenchmarkAuthoritativeContext {
  readonly schema_version: "sandbox-security-authoritative-context.v1";
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: "user_input" | "model_output" | "tool_request";
  readonly policy_profile_id: string;
  readonly sources: readonly SandboxSecurityBenchmarkAuthoritativeSource[];
  readonly tool_request?: Readonly<{
    readonly authority_kind:
      | "integration_observation"
      | "simulation_observation";
    readonly call_id: string;
    readonly tool_name: string;
    readonly target?: string;
    readonly arguments: SandboxSecurityJsonValue;
  }>;
}

export interface SandboxSecurityBenchmarkEvaluationRequest {
  readonly submission: Readonly<SandboxSecurityRequest>;
  readonly authoritative_context: Readonly<SandboxSecurityBenchmarkAuthoritativeContext>;
}

export interface SandboxSecurityBenchmarkInputEnvelope {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION;
  readonly fixture_id: string;
  readonly evaluation_request: Readonly<SandboxSecurityBenchmarkEvaluationRequest>;
}

export type SandboxSecurityBenchmarkTruthEnvelope =
  | Readonly<{
      readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_TRUTH_SCHEMA_VERSION;
      readonly fixture_id: string;
      readonly verdict_class: "safe";
      readonly language: SandboxSecurityBenchmarkLanguage;
      readonly transformed: false;
      readonly source_id: string;
      readonly record_ref: string;
      readonly derivation: "direct" | "human_translation";
      readonly fixture_sha256: SandboxSecurityBenchmarkSha256;
    }>
  | Readonly<{
      readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_TRUTH_SCHEMA_VERSION;
      readonly fixture_id: string;
      readonly verdict_class: "risk";
      readonly primary_category: string;
      readonly ground_truth_severity: "low" | "medium" | "high" | "critical";
      readonly language: SandboxSecurityBenchmarkLanguage;
      readonly transformed: boolean;
      readonly transformation_kind: SandboxSecurityBenchmarkTransformationKind;
      readonly source_id: string;
      readonly record_ref: string;
      readonly derivation: SandboxSecurityBenchmarkDerivation;
      readonly seed_record_ref: string | null;
      readonly fixture_sha256: SandboxSecurityBenchmarkSha256;
    }>;

export interface SandboxSecurityBenchmarkReviewRecord {
  readonly fixture_id: string;
  readonly input_sha256: SandboxSecurityBenchmarkSha256;
  readonly source_id: string;
  readonly record_ref: string;
  readonly upstream_sha256: SandboxSecurityBenchmarkSha256;
  readonly verdict_class: "safe" | "risk";
  readonly language: SandboxSecurityBenchmarkLanguage;
  readonly derivation: SandboxSecurityBenchmarkDerivation;
  readonly transformed: boolean;
  readonly transformation_kind: SandboxSecurityBenchmarkTransformationKind;
  readonly seed_record_ref: string | null;
  readonly seed_upstream_sha256: SandboxSecurityBenchmarkSha256 | null;
  readonly author_id: string;
  readonly independent_reviewer_id: string;
  readonly review_status: SandboxSecurityBenchmarkReviewStatus;
  readonly translation_review_status: SandboxSecurityBenchmarkReviewApplicability;
  readonly transformation_review_status: SandboxSecurityBenchmarkReviewApplicability;
  readonly primary_category: string | null;
  readonly ground_truth_severity: SandboxSecurityBenchmarkSeverity | null;
  readonly category_review_status: SandboxSecurityBenchmarkReviewApplicability;
  readonly severity_review_status: SandboxSecurityBenchmarkReviewApplicability;
  readonly severity_rubric_version: "sandbox-security-severity-rubric.v1" | null;
  readonly adjudication_rationale: string | null;
}

export interface SandboxSecurityBenchmarkReviews {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_REVIEWS_SCHEMA_VERSION;
  readonly severity_rubric_version: "sandbox-security-severity-rubric.v1";
  readonly records: readonly SandboxSecurityBenchmarkReviewRecord[];
}

export interface SandboxSecurityBenchmarkRequestIdRecord {
  readonly slot_ordinal: number;
  readonly request_id: string;
}

export interface SandboxSecurityBenchmarkRequestIds {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_REQUEST_IDS_SCHEMA_VERSION;
  readonly generation_method: "node:crypto.randomBytes";
  readonly entropy_bytes: 16;
  readonly generation_phase: "pre_label";
  readonly generator_id: string;
  readonly independent_reviewer_id: string;
  readonly review_status: SandboxSecurityBenchmarkReviewStatus;
  readonly records: readonly SandboxSecurityBenchmarkRequestIdRecord[];
}

export interface SandboxSecurityBenchmarkManifest {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_MANIFEST_SCHEMA_VERSION;
  readonly benchmark_revision: "v1";
  readonly sources_lock_sha256: SandboxSecurityBenchmarkSha256;
  readonly inputs_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly truth_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly reviews_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly request_ids_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly fixture_ids: readonly string[];
}

export interface SandboxSecurityReplayOllamaInventoryResponse {
  readonly model: "qwen3:8b";
  readonly digest: SandboxSecurityBenchmarkDigest;
}

export type SandboxSecurityReplayLocalSubjectRef =
  | Readonly<{
      readonly kind: "content_source";
      readonly source_ordinal: number;
      readonly component: "whole_source";
    }>
  | Readonly<{
      readonly kind: "tool_request";
      readonly component: "whole_call" | "tool_name" | "target" | "arguments";
    }>;

export interface SandboxSecurityReplayLocalCandidate {
  readonly category: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly confidence: "uncertain" | "probable" | "confident";
  readonly subject_refs: readonly SandboxSecurityReplayLocalSubjectRef[];
}

export interface SandboxSecurityReplayOllamaResponse {
  readonly model: "qwen3:8b";
  readonly verified_ollama_digest: SandboxSecurityBenchmarkDigest;
  readonly done: true;
  readonly message: Readonly<{
    readonly role: "assistant";
    readonly parsed: Readonly<{
      readonly schema_version: "sandbox-security-local-model.v1";
      readonly status: "matched" | "no_match";
      readonly candidates: readonly SandboxSecurityReplayLocalCandidate[];
    }>;
  }>;
}

export interface SandboxSecurityReplayObligationResult {
  readonly obligation_ordinal: number;
  readonly outcome: "risk" | "clearance";
  readonly confidence: "uncertain" | "probable" | "confident";
  readonly severity: "low" | "medium" | "high" | "critical" | null;
}

export interface SandboxSecurityReplayOpenAIResponse {
  readonly model: "gpt-5.6-terra";
  readonly status: "completed";
  readonly parsed: Readonly<{
    readonly schema_version: "sandbox-security-judge.v1";
    readonly obligation_results: readonly SandboxSecurityReplayObligationResult[];
  }>;
}

export type SandboxSecurityReplayTransportOutcome<TResponse> =
  | Readonly<{ readonly status: "not_called" }>
  | Readonly<{
      readonly status: "response";
      readonly http_status: 200;
      readonly content_type: "application/json";
      readonly normalized_response: TResponse;
    }>
  | Readonly<{ readonly status: "http_error"; readonly http_status: number }>
  | Readonly<{
      readonly status: "transport_error";
      readonly error_code:
        | "connection_failed"
        | "response_too_large"
        | "provider_response_invalid";
    }>
  | Readonly<{
      readonly status: "signal_termination";
      readonly termination_reason: "slot_timeout" | "work_budget";
    }>;

export interface SandboxSecurityBenchmarkReplayEnvelope {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_REPLAY_SCHEMA_VERSION;
  readonly fixture_id: string;
  readonly ollama: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  readonly judge: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOpenAIResponse>;
  readonly decision_projection_sha256: SandboxSecurityBenchmarkSha256;
}

export interface SandboxSecurityReplayInputUnit {
  readonly ollama: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  readonly judge: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOpenAIResponse>;
}

export interface SandboxSecurityBenchmarkCaptureManifest {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION;
  readonly benchmark_manifest_sha256: SandboxSecurityBenchmarkSha256;
  readonly sources_lock_sha256: SandboxSecurityBenchmarkSha256;
  readonly inputs_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly decisions_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly cassette_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly ollama_model: "qwen3:8b";
  readonly ollama_digest: SandboxSecurityBenchmarkDigest;
  readonly ollama_qualification: Readonly<{
    readonly inventory: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaInventoryResponse>;
    readonly prewarm: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  }>;
  readonly openai_model: "gpt-5.6-terra";
  readonly local_prompt_version: "sandbox-security-ollama-local-prompt.v1";
  readonly judge_prompt_version: "sandbox-security-openai-judge-prompt.v1";
  readonly local_schema_version: "sandbox-security-local-model.v1";
  readonly judge_schema_version: "sandbox-security-judge.v1";
  readonly rule_catalog_version: string;
  readonly sanitizer_version: string;
}

export interface SandboxSecurityBenchmarkSeal {
  readonly schema_version: typeof SANDBOX_SECURITY_BENCHMARK_SEAL_SCHEMA_VERSION;
  readonly capture_manifest_sha256: SandboxSecurityBenchmarkSha256;
  readonly truth_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly replay_tree_sha256: SandboxSecurityBenchmarkSha256;
  readonly accepted_metrics_sha256: SandboxSecurityBenchmarkSha256;
}

const LICENSES = [
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0"
] as const;
const CATEGORIES = [
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
] as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const FIXTURE_ID = /^ssb-v1-[0-9]{4}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SOURCE_ID = /^[a-z][a-z0-9_-]{1,63}$/u;
const REQUEST_ID = /^[a-f0-9]{32}$/u;
const SEVERITY_RUBRIC_VERSION = "sandbox-security-severity-rubric.v1" as const;
const MAX_SOURCES = 32;
const MAX_RECORDS = 2048;
const MAX_FIXTURES = 300;
const MAX_OUTCOMES = 32;
const MAX_SOURCE_ORDINAL = SANDBOX_SECURITY_MAX_CONTENT_ITEMS;
const MAX_OBLIGATION_ORDINAL = 32;
const MAX_TREE_DEPTH = SANDBOX_SECURITY_MAX_JSON_DEPTH;
const MAX_TREE_FILES = SANDBOX_SECURITY_MAX_JSON_NODES;
const MAX_TREE_FILE_BYTES = SANDBOX_SECURITY_MAX_REQUEST_BYTES;
const MAX_TREE_TOTAL_BYTES = 256 * 1024 * 1024;
const LOCAL_PROMPT_VERSION = "sandbox-security-ollama-local-prompt.v1" as const;
const JUDGE_PROMPT_VERSION = "sandbox-security-openai-judge-prompt.v1" as const;
const LOCAL_SCHEMA_VERSION = "sandbox-security-local-model.v1" as const;
const JUDGE_SCHEMA_VERSION = "sandbox-security-judge.v1" as const;

function invalid(): never {
  throw new TypeError("benchmark_contract_invalid");
}

function safeCall<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return invalid();
  }
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    utilTypes.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return invalid();
  }
  const record = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return invalid();
    }
  }
  return record;
}

function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  const record = dataRecord(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(record);
  if (
    keys.length !== new Set(keys).size ||
    keys.some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(record, key))
  ) {
    return invalid();
  }
  return record;
}

function denseArray(value: unknown, min: number, max: number): unknown[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < min ||
    value.length > max
  ) {
    return invalid();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) {
    return invalid();
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return invalid();
    }
  }
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key)) {
      return invalid();
    }
  }
  return value;
}

function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function stringValue(value: unknown, max: number, nonempty = true): string {
  if (typeof value !== "string" || value.length > max) return invalid();
  if (nonempty && value.length === 0) return invalid();
  if (!isWellFormedString(value)) return invalid();
  if (Buffer.byteLength(value, "utf8") > SANDBOX_SECURITY_MAX_TEXT_BYTES) return invalid();
  return value;
}

function sha(value: unknown): string {
  const result = stringValue(value, 64);
  if (!SHA256.test(result)) return invalid();
  return result;
}

function digest(value: unknown): SandboxSecurityBenchmarkDigest {
  const result = stringValue(value, 71);
  if (!DIGEST.test(result)) return invalid();
  return result as SandboxSecurityBenchmarkDigest;
}

function fixtureId(value: unknown): string {
  const result = stringValue(value, 11);
  if (!FIXTURE_ID.test(result)) return invalid();
  return result;
}

function identifier(value: unknown): string {
  const result = stringValue(value, 128);
  if (!IDENTIFIER.test(result)) return invalid();
  return result;
}

function sourceId(value: unknown): string {
  const result = stringValue(value, 64);
  if (!SOURCE_ID.test(result)) return invalid();
  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== "string" || !values.includes(value)) return invalid();
  return value as T[number];
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

interface JsonCloneState {
  readonly active: WeakSet<object>;
  nodes: number;
}

function jsonClone(
  value: unknown,
  state: JsonCloneState = { active: new WeakSet<object>(), nodes: 0 },
  depth = 0
): SandboxSecurityJsonValue {
  state.nodes += 1;
  if (state.nodes > SANDBOX_SECURITY_MAX_JSON_NODES) return invalid();
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string") stringValue(value, SANDBOX_SECURITY_MAX_TEXT_BYTES, false);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalid();
    return value;
  }
  if (
    typeof value !== "object" ||
    state.active.has(value) ||
    depth >= SANDBOX_SECURITY_MAX_JSON_DEPTH
  ) {
    return invalid();
  }
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const array = denseArray(value, 0, SANDBOX_SECURITY_MAX_JSON_NODES);
      return array.map((item) => jsonClone(item, state, depth + 1));
    }
    const record = dataRecord(value);
    const output: Record<string, SandboxSecurityJsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      if (["__proto__", "prototype", "constructor"].includes(key)) return invalid();
      output[key] = jsonClone(record[key], state, depth + 1);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

interface CanonicalJsonState {
  readonly active: WeakSet<object>;
  nodes: number;
}

function canonicalJson(
  value: unknown,
  state: CanonicalJsonState = { active: new WeakSet<object>(), nodes: 0 },
  depth = 0
): string {
  state.nodes += 1;
  if (state.nodes > SANDBOX_SECURITY_MAX_JSON_NODES) return invalid();
  if (value === null) return "null";
  if (typeof value === "string") {
    stringValue(value, SANDBOX_SECURITY_MAX_TEXT_BYTES, false);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalid();
    return JSON.stringify(value);
  }
  if (
    typeof value !== "object" ||
    state.active.has(value) ||
    depth >= SANDBOX_SECURITY_MAX_JSON_DEPTH
  ) {
    return invalid();
  }
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const array = denseArray(value, 0, SANDBOX_SECURITY_MAX_JSON_NODES);
      return `[${array.map((item) => canonicalJson(item, state, depth + 1)).join(",")}]`;
    }
    const record = dataRecord(value);
    return `{${Object.keys(record).sort().map((key) => {
      stringValue(key, SANDBOX_SECURITY_MAX_TEXT_BYTES, false);
      return `${JSON.stringify(key)}:${canonicalJson(record[key], state, depth + 1)}`;
    }).join(",")}}`;
  } finally {
    state.active.delete(value);
  }
}

function hashBytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashValue(value: unknown): SandboxSecurityBenchmarkSha256 {
  return hashBytes(canonicalJson(value));
}

function authorityAllowedForMode(
  mode: SandboxSecurityBenchmarkAuthoritativeContext["evaluation_mode"],
  kind: SandboxSecurityBenchmarkAuthoritativeSource["authority_kind"]
): boolean {
  return mode === "simulation"
    ? kind === "simulation_observation"
    : kind === "platform_control" || kind === "integration_observation";
}

function normalizeAuthoritativeContext(
  value: unknown,
  submission: SandboxSecurityRequest
): SandboxSecurityBenchmarkAuthoritativeContext {
  const context = exact(
    value,
    ["schema_version", "evaluation_mode", "stage", "policy_profile_id", "sources"],
    ["tool_request"]
  );
  if (context.schema_version !== "sandbox-security-authoritative-context.v1") return invalid();
  if (context.evaluation_mode !== "simulation" && context.evaluation_mode !== "enforcement") return invalid();
  if (context.stage !== submission.stage || context.policy_profile_id !== submission.policy_profile_id) return invalid();
  const submissionItems = submission.content_items;
  const sourceValues = denseArray(context.sources, 1, SANDBOX_SECURITY_MAX_CONTENT_ITEMS);
  if (sourceValues.length !== submissionItems.length) return invalid();
  const sources = sourceValues.map((item, index) => {
    const source = exact(item, ["source_id", "authority_kind", "source_type", "media_type", "value", "provenance_ref"]);
    if (source.source_id !== submissionItems[index]?.source_id ||
      source.source_type !== submissionItems[index]?.claimed_source_type ||
      source.media_type !== submissionItems[index]?.media_type ||
      source.provenance_ref !== submissionItems[index]?.provenance_ref ||
      canonicalJson(source.value) !== canonicalJson(submissionItems[index]?.value)) return invalid();
    if (!["platform_control", "integration_observation", "simulation_observation"].includes(String(source.authority_kind))) return invalid();
    if (!authorityAllowedForMode(
      context.evaluation_mode as SandboxSecurityBenchmarkAuthoritativeContext["evaluation_mode"],
      source.authority_kind as SandboxSecurityBenchmarkAuthoritativeSource["authority_kind"]
    )) return invalid();
    return {
      source_id: String(source.source_id),
      authority_kind: source.authority_kind as SandboxSecurityBenchmarkAuthoritativeSource["authority_kind"],
      source_type: source.source_type as SandboxSecurityBenchmarkAuthoritativeSource["source_type"],
      media_type: source.media_type as "text/plain" | "application/json",
      value: jsonClone(source.value),
      provenance_ref: String(source.provenance_ref)
    };
  });
  let tool_request: SandboxSecurityBenchmarkAuthoritativeContext["tool_request"];
  if (Object.hasOwn(context, "tool_request")) {
    const tool = exact(context.tool_request, ["authority_kind", "call_id", "tool_name", "arguments"], ["target"]);
    if (!["integration_observation", "simulation_observation"].includes(String(tool.authority_kind))) return invalid();
    if (!authorityAllowedForMode(
      context.evaluation_mode as SandboxSecurityBenchmarkAuthoritativeContext["evaluation_mode"],
      tool.authority_kind as SandboxSecurityBenchmarkAuthoritativeSource["authority_kind"]
    )) return invalid();
    tool_request = {
      authority_kind: tool.authority_kind as "integration_observation" | "simulation_observation",
      call_id: stringValue(tool.call_id, 128),
      tool_name: stringValue(tool.tool_name, 128),
      ...(Object.hasOwn(tool, "target") ? { target: stringValue(tool.target, 4096) } : {}),
      arguments: jsonClone(tool.arguments)
    };
  }
  if (submission.tool_request === undefined && tool_request !== undefined) return invalid();
  if (submission.tool_request !== undefined && tool_request === undefined) return invalid();
  if (submission.tool_request !== undefined && tool_request !== undefined &&
    canonicalJson(submission.tool_request) !== canonicalJson({
      call_id: tool_request.call_id,
      tool_name: tool_request.tool_name,
      ...(tool_request.target === undefined ? {} : { target: tool_request.target }),
      arguments: tool_request.arguments
    })) return invalid();
  return deepFreeze({
    schema_version: "sandbox-security-authoritative-context.v1" as const,
    evaluation_mode: context.evaluation_mode as "simulation" | "enforcement",
    stage: context.stage as "user_input" | "model_output" | "tool_request",
    policy_profile_id: String(context.policy_profile_id),
    sources,
    ...(tool_request === undefined ? {} : { tool_request })
  });
}

function normalizeEvaluationRequest(value: unknown): SandboxSecurityBenchmarkEvaluationRequest {
  const outer = exact(value, ["submission", "authoritative_context"]);
  const submission = normalizeSandboxSecurityRequest(outer.submission);
  if (submission === null) return invalid();
  const authoritative_context = normalizeAuthoritativeContext(outer.authoritative_context, submission);
  return deepFreeze({ submission, authoritative_context });
}

function normalizeSourceRecord(value: unknown): SandboxSecurityBenchmarkSourceRecord {
  const record = exact(value, ["record_ref", "upstream_sha256"]);
  return deepFreeze({ record_ref: identifier(record.record_ref), upstream_sha256: sha(record.upstream_sha256) });
}

export function normalizeSandboxSecurityBenchmarkSourcesLock(value: unknown): Readonly<SandboxSecurityBenchmarkSourcesLock> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "sources"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_SOURCES_SCHEMA_VERSION) return invalid();
    const sources = denseArray(root.sources, 1, MAX_SOURCES).map((item) => {
      const source = exact(item, ["source_id", "upstream_url", "revision", "admitted_scope", "license", "license_url", "license_evidence_sha256", "attribution", "redistribution_confirmed", "records"]);
      const records = denseArray(source.records, 1, MAX_RECORDS).map(normalizeSourceRecord);
      if (!/^https:\/\//u.test(stringValue(source.upstream_url, 2048)) || !/^[a-f0-9]{40,64}$/u.test(stringValue(source.revision, 64))) return invalid();
      if (source.redistribution_confirmed !== true) return invalid();
      return deepFreeze({
        source_id: sourceId(source.source_id),
        upstream_url: stringValue(source.upstream_url, 2048),
        revision: stringValue(source.revision, 64),
        admitted_scope: stringValue(source.admitted_scope, 512),
        license: enumValue(source.license, LICENSES),
        license_url: stringValue(source.license_url, 2048),
        license_evidence_sha256: sha(source.license_evidence_sha256),
        attribution: stringValue(source.attribution, 4096),
        redistribution_confirmed: true as const,
        records
      });
    });
    const sourceIds = new Set<string>();
    const recordIds = new Set<string>();
    let recordCount = 0;
    for (const source of sources) {
      if (sourceIds.has(source.source_id)) return invalid();
      sourceIds.add(source.source_id);
      for (const record of source.records) {
        recordCount += 1;
        if (recordIds.has(`${source.source_id}:${record.record_ref}`)) return invalid();
        recordIds.add(`${source.source_id}:${record.record_ref}`);
      }
    }
    if (recordCount > MAX_RECORDS) return invalid();
    return deepFreeze({ schema_version: SANDBOX_SECURITY_BENCHMARK_SOURCES_SCHEMA_VERSION, sources });
  });
}

export function normalizeSandboxSecurityBenchmarkInputEnvelope(value: unknown): Readonly<SandboxSecurityBenchmarkInputEnvelope> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "fixture_id", "evaluation_request"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION) return invalid();
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION,
      fixture_id: fixtureId(root.fixture_id),
      evaluation_request: normalizeEvaluationRequest(root.evaluation_request)
    });
  });
}

function recordIdentity(source_id: unknown, record_ref: unknown): { source_id: string; record_ref: string } {
  return { source_id: sourceId(source_id), record_ref: identifier(record_ref) };
}

export function normalizeSandboxSecurityBenchmarkTruthEnvelope(value: unknown): Readonly<SandboxSecurityBenchmarkTruthEnvelope> {
  return safeCall(() => {
    const root = dataRecord(value);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_TRUTH_SCHEMA_VERSION) return invalid();
    const base = {
      schema_version: SANDBOX_SECURITY_BENCHMARK_TRUTH_SCHEMA_VERSION,
      fixture_id: fixtureId(root.fixture_id),
      language: enumValue(root.language, ["zh", "en"] as const),
      fixture_sha256: sha(root.fixture_sha256)
    };
    if (root.verdict_class === "safe") {
      const safe = exact(value, ["schema_version", "fixture_id", "verdict_class", "language", "transformed", "source_id", "record_ref", "derivation", "fixture_sha256"]);
      if (safe.transformed !== false || !["direct", "human_translation"].includes(String(safe.derivation))) return invalid();
      const identity = recordIdentity(safe.source_id, safe.record_ref);
      return deepFreeze({ ...base, verdict_class: "safe" as const, transformed: false as const, ...identity, derivation: safe.derivation as "direct" | "human_translation" });
    }
    if (root.verdict_class !== "risk") return invalid();
    const risk = exact(value, ["schema_version", "fixture_id", "verdict_class", "primary_category", "ground_truth_severity", "language", "transformed", "transformation_kind", "source_id", "record_ref", "derivation", "seed_record_ref", "fixture_sha256"]);
    const transformed = risk.transformed;
    if (typeof transformed !== "boolean") return invalid();
    const kind = risk.transformation_kind;
    if (kind !== null && !["encoding", "whitespace", "case", "synonym", "split_token", "cross_source"].includes(String(kind))) return invalid();
    if (transformed !== (kind !== null) || (transformed && typeof risk.seed_record_ref !== "string") || (!transformed && risk.seed_record_ref !== null)) return invalid();
    if (transformed && risk.derivation !== "transformed") return invalid();
    if (!transformed && !["direct", "human_translation"].includes(String(risk.derivation))) return invalid();
    const identity = recordIdentity(risk.source_id, risk.record_ref);
    return deepFreeze({
      ...base,
      verdict_class: "risk" as const,
      primary_category: enumValue(risk.primary_category, CATEGORIES),
      ground_truth_severity: enumValue(risk.ground_truth_severity, ["low", "medium", "high", "critical"] as const),
      transformed,
      transformation_kind: kind as SandboxSecurityBenchmarkTransformationKind,
      ...identity,
      derivation: risk.derivation as SandboxSecurityBenchmarkDerivation,
      seed_record_ref: transformed ? identifier(risk.seed_record_ref) : null
    });
  });
}

function normalizeSandboxSecurityBenchmarkReviewRecord(
  value: unknown
): SandboxSecurityBenchmarkReviewRecord {
  const root = exact(value, [
    "fixture_id",
    "input_sha256",
    "source_id",
    "record_ref",
    "upstream_sha256",
    "verdict_class",
    "language",
    "derivation",
    "transformed",
    "transformation_kind",
    "seed_record_ref",
    "seed_upstream_sha256",
    "author_id",
    "independent_reviewer_id",
    "review_status",
    "translation_review_status",
    "transformation_review_status",
    "primary_category",
    "ground_truth_severity",
    "category_review_status",
    "severity_review_status",
    "severity_rubric_version",
    "adjudication_rationale"
  ]);
  const verdict = enumValue(root.verdict_class, ["safe", "risk"] as const);
  const language = enumValue(root.language, ["zh", "en"] as const);
  const derivation = enumValue(root.derivation, [
    "direct",
    "human_translation",
    "transformed"
  ] as const);
  if (root.review_status !== "approved") return invalid();
  const transformed = root.transformed;
  if (typeof transformed !== "boolean") return invalid();
  const transformationKind = root.transformation_kind;
  if (
    transformationKind !== null &&
    ![
      "encoding",
      "whitespace",
      "case",
      "synonym",
      "split_token",
      "cross_source"
    ].includes(String(transformationKind))
  ) {
    return invalid();
  }
  if (transformed !== (transformationKind !== null)) return invalid();
  if (transformed !== (derivation === "transformed")) return invalid();
  if (verdict === "safe" && (transformed || derivation === "transformed")) {
    return invalid();
  }
  const seedRecordRef = root.seed_record_ref;
  const seedUpstreamSha256 = root.seed_upstream_sha256;
  if (transformed) {
    if (
      typeof seedRecordRef !== "string" ||
      typeof seedUpstreamSha256 !== "string"
    ) {
      return invalid();
    }
  } else if (seedRecordRef !== null || seedUpstreamSha256 !== null) {
    return invalid();
  }
  const authorId = identifier(root.author_id);
  const reviewerId = identifier(root.independent_reviewer_id);
  if (authorId === reviewerId) return invalid();
  const translationStatus = enumValue(root.translation_review_status, [
    "approved",
    "not_applicable"
  ] as const);
  if (translationStatus !== (
    derivation === "human_translation" ? "approved" : "not_applicable"
  )) {
    return invalid();
  }
  const transformationStatus = enumValue(root.transformation_review_status, [
    "approved",
    "not_applicable"
  ] as const);
  if (transformationStatus !== (transformed ? "approved" : "not_applicable")) {
    return invalid();
  }
  const base = {
    fixture_id: fixtureId(root.fixture_id),
    input_sha256: sha(root.input_sha256),
    source_id: sourceId(root.source_id),
    record_ref: identifier(root.record_ref),
    upstream_sha256: sha(root.upstream_sha256),
    verdict_class: verdict,
    language,
    derivation,
    transformed,
    transformation_kind: transformationKind as SandboxSecurityBenchmarkTransformationKind,
    seed_record_ref: transformed ? identifier(seedRecordRef) : null,
    seed_upstream_sha256: transformed ? sha(seedUpstreamSha256) : null,
    author_id: authorId,
    independent_reviewer_id: reviewerId,
    review_status: "approved" as const,
    translation_review_status: translationStatus,
    transformation_review_status: transformationStatus
  };
  if (verdict === "safe") {
    const categoryStatus = enumValue(root.category_review_status, [
      "approved",
      "not_applicable"
    ] as const);
    const severityStatus = enumValue(root.severity_review_status, [
      "approved",
      "not_applicable"
    ] as const);
    if (
      root.primary_category !== null ||
      root.ground_truth_severity !== null ||
      categoryStatus !== "not_applicable" ||
      severityStatus !== "not_applicable" ||
      root.severity_rubric_version !== null ||
      root.adjudication_rationale !== null
    ) {
      return invalid();
    }
    return deepFreeze({
      ...base,
      primary_category: null,
      ground_truth_severity: null,
      category_review_status: "not_applicable" as const,
      severity_review_status: "not_applicable" as const,
      severity_rubric_version: null,
      adjudication_rationale: null
    });
  }
  const category = enumValue(root.primary_category, CATEGORIES);
  const severity = enumValue(root.ground_truth_severity, [
    "low",
    "medium",
    "high",
    "critical"
  ] as const);
  if (
    root.category_review_status !== "approved" ||
    root.severity_review_status !== "approved" ||
    root.severity_rubric_version !== SEVERITY_RUBRIC_VERSION
  ) {
    return invalid();
  }
  const rationale = stringValue(root.adjudication_rationale, 2048);
  if (rationale.trim().length === 0) return invalid();
  return deepFreeze({
    ...base,
    primary_category: category,
    ground_truth_severity: severity,
    category_review_status: "approved" as const,
    severity_review_status: "approved" as const,
    severity_rubric_version: SEVERITY_RUBRIC_VERSION,
    adjudication_rationale: rationale
  });
}

export function normalizeSandboxSecurityBenchmarkReviews(
  value: unknown
): Readonly<SandboxSecurityBenchmarkReviews> {
  return safeCall(() => {
    const root = exact(value, [
      "schema_version",
      "severity_rubric_version",
      "records"
    ]);
    if (
      root.schema_version !== SANDBOX_SECURITY_BENCHMARK_REVIEWS_SCHEMA_VERSION ||
      root.severity_rubric_version !== SEVERITY_RUBRIC_VERSION
    ) {
      return invalid();
    }
    const records = denseArray(root.records, 1, MAX_FIXTURES).map(
      normalizeSandboxSecurityBenchmarkReviewRecord
    );
    const fixtureIds = new Set<string>();
    for (const record of records) {
      if (fixtureIds.has(record.fixture_id)) return invalid();
      fixtureIds.add(record.fixture_id);
    }
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_BENCHMARK_REVIEWS_SCHEMA_VERSION,
      severity_rubric_version: SEVERITY_RUBRIC_VERSION,
      records
    });
  });
}

function normalizeSandboxSecurityBenchmarkRequestIdRecord(
  value: unknown,
  expectedOrdinal: number
): SandboxSecurityBenchmarkRequestIdRecord {
  const root = exact(value, ["slot_ordinal", "request_id"]);
  if (root.slot_ordinal !== expectedOrdinal) return invalid();
  const requestId = stringValue(root.request_id, 32);
  if (!REQUEST_ID.test(requestId)) return invalid();
  return deepFreeze({ slot_ordinal: expectedOrdinal, request_id: requestId });
}

export function normalizeSandboxSecurityBenchmarkRequestIds(
  value: unknown
): Readonly<SandboxSecurityBenchmarkRequestIds> {
  return safeCall(() => {
    const root = exact(value, [
      "schema_version",
      "generation_method",
      "entropy_bytes",
      "generation_phase",
      "generator_id",
      "independent_reviewer_id",
      "review_status",
      "records"
    ]);
    if (
      root.schema_version !== SANDBOX_SECURITY_BENCHMARK_REQUEST_IDS_SCHEMA_VERSION ||
      root.generation_method !== "node:crypto.randomBytes" ||
      root.entropy_bytes !== 16 ||
      root.generation_phase !== "pre_label" ||
      root.review_status !== "approved"
    ) {
      return invalid();
    }
    const generatorId = identifier(root.generator_id);
    const reviewerId = identifier(root.independent_reviewer_id);
    if (generatorId === reviewerId) return invalid();
    const rawRecords = denseArray(root.records, 1, MAX_FIXTURES);
    const records = rawRecords.map((record, index) =>
      normalizeSandboxSecurityBenchmarkRequestIdRecord(record, index + 1)
    );
    const requestIds = new Set<string>();
    for (const record of records) {
      if (requestIds.has(record.request_id)) return invalid();
      requestIds.add(record.request_id);
    }
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_BENCHMARK_REQUEST_IDS_SCHEMA_VERSION,
      generation_method: "node:crypto.randomBytes" as const,
      entropy_bytes: 16 as const,
      generation_phase: "pre_label" as const,
      generator_id: generatorId,
      independent_reviewer_id: reviewerId,
      review_status: "approved" as const,
      records
    });
  });
}

function normalizeInventory(value: unknown): SandboxSecurityReplayOllamaInventoryResponse {
  const root = exact(value, ["model", "digest"]);
  if (root.model !== "qwen3:8b") return invalid();
  return deepFreeze({ model: "qwen3:8b", digest: digest(root.digest) });
}

function normalizeSubject(value: unknown): SandboxSecurityReplayLocalSubjectRef {
  const root = dataRecord(value);
  if (root.kind === "content_source") {
    const item = exact(value, ["kind", "source_ordinal", "component"]);
    if (!Number.isSafeInteger(item.source_ordinal) || Number(item.source_ordinal) < 1 || Number(item.source_ordinal) > MAX_SOURCE_ORDINAL || item.component !== "whole_source") return invalid();
    return deepFreeze({ kind: "content_source", source_ordinal: Number(item.source_ordinal), component: "whole_source" as const });
  }
  const item = exact(value, ["kind", "component"]);
  if (item.kind !== "tool_request" || !["whole_call", "tool_name", "target", "arguments"].includes(String(item.component))) return invalid();
  return deepFreeze({ kind: "tool_request", component: item.component as "whole_call" | "tool_name" | "target" | "arguments" });
}

function subjectKey(subject: SandboxSecurityReplayLocalSubjectRef): string {
  return subject.kind === "content_source"
    ? `content_source:${subject.source_ordinal}:whole_source`
    : `tool_request:${subject.component}`;
}

function candidateKey(candidate: SandboxSecurityReplayLocalCandidate): string {
  return canonicalJson([
    candidate.category,
    candidate.subject_refs.map(subjectKey).sort()
  ]);
}

function normalizeLocal(value: unknown): SandboxSecurityReplayOllamaResponse {
  const root = exact(value, ["model", "verified_ollama_digest", "done", "message"]);
  if (root.model !== "qwen3:8b" || root.done !== true) return invalid();
  const message = exact(root.message, ["role", "parsed"]);
  if (message.role !== "assistant") return invalid();
  const parsed = exact(message.parsed, ["schema_version", "status", "candidates"]);
  if (parsed.schema_version !== "sandbox-security-local-model.v1") return invalid();
  const candidates = denseArray(parsed.candidates, 0, MAX_OUTCOMES).map((item) => {
    const candidate = exact(item, ["category", "severity", "confidence", "subject_refs"]);
    const subject_refs = denseArray(candidate.subject_refs, 1, 8).map(normalizeSubject);
    if (new Set(subject_refs.map(subjectKey)).size !== subject_refs.length) return invalid();
    return deepFreeze({
      category: enumValue(candidate.category, CATEGORIES),
      severity: enumValue(candidate.severity, ["low", "medium", "high", "critical"] as const),
      confidence: enumValue(candidate.confidence, ["uncertain", "probable", "confident"] as const),
      subject_refs
    });
  });
  const status = enumValue(parsed.status, ["matched", "no_match"] as const);
  if (status === "no_match" && candidates.length !== 0) return invalid();
  if (status === "matched" && candidates.length === 0) return invalid();
  if (new Set(candidates.map(candidateKey)).size !== candidates.length) return invalid();
  return deepFreeze({
    model: "qwen3:8b",
    verified_ollama_digest: digest(root.verified_ollama_digest),
    done: true as const,
    message: { role: "assistant" as const, parsed: { schema_version: "sandbox-security-local-model.v1" as const, status, candidates } }
  });
}

function normalizeJudge(value: unknown): SandboxSecurityReplayOpenAIResponse {
  const root = exact(value, ["model", "status", "parsed"]);
  if (root.model !== "gpt-5.6-terra" || root.status !== "completed") return invalid();
  const parsed = exact(root.parsed, ["schema_version", "obligation_results"]);
  if (parsed.schema_version !== "sandbox-security-judge.v1") return invalid();
  const results = denseArray(parsed.obligation_results, 0, MAX_OUTCOMES).map((item) => {
    const result = exact(item, ["obligation_ordinal", "outcome", "confidence", "severity"]);
    if (!Number.isSafeInteger(result.obligation_ordinal) || Number(result.obligation_ordinal) < 1 || Number(result.obligation_ordinal) > MAX_OBLIGATION_ORDINAL) return invalid();
    return deepFreeze({
      obligation_ordinal: Number(result.obligation_ordinal),
      outcome: enumValue(result.outcome, ["risk", "clearance"] as const),
      confidence: enumValue(result.confidence, ["uncertain", "probable", "confident"] as const),
      severity: result.severity === null ? null : enumValue(result.severity, ["low", "medium", "high", "critical"] as const)
    });
  });
  const ordinals = new Set<number>();
  for (const result of results) {
    if (ordinals.has(result.obligation_ordinal)) return invalid();
    ordinals.add(result.obligation_ordinal);
    if (result.outcome === "risk" && result.severity === null) return invalid();
    if (result.outcome === "clearance" && result.severity !== null) return invalid();
  }
  return deepFreeze({ model: "gpt-5.6-terra", status: "completed" as const, parsed: { schema_version: "sandbox-security-judge.v1" as const, obligation_results: results } });
}

function normalizeOutcome<T>(value: unknown, response: (value: unknown) => T): SandboxSecurityReplayTransportOutcome<T> {
  const root = dataRecord(value);
  if (root.status === "not_called") {
    if (Object.keys(root).length !== 1) return invalid();
    return Object.freeze({ status: "not_called" as const });
  }
  if (root.status === "response") {
    const responseRecord = exact(value, ["status", "http_status", "content_type", "normalized_response"]);
    if (responseRecord.http_status !== 200 || responseRecord.content_type !== "application/json") return invalid();
    return deepFreeze({ status: "response" as const, http_status: 200 as const, content_type: "application/json" as const, normalized_response: response(responseRecord.normalized_response) });
  }
  if (root.status === "http_error") {
    const error = exact(value, ["status", "http_status"]);
    if (!Number.isInteger(error.http_status) || Number(error.http_status) < 100 || Number(error.http_status) > 599 || error.http_status === 200) return invalid();
    return deepFreeze({ status: "http_error" as const, http_status: Number(error.http_status) });
  }
  if (root.status === "transport_error") {
    const error = exact(value, ["status", "error_code"]);
    return deepFreeze({ status: "transport_error" as const, error_code: enumValue(error.error_code, ["connection_failed", "response_too_large", "provider_response_invalid"] as const) });
  }
  if (root.status === "signal_termination") {
    const termination = exact(value, ["status", "termination_reason"]);
    return deepFreeze({ status: "signal_termination" as const, termination_reason: enumValue(termination.termination_reason, ["slot_timeout", "work_budget"] as const) });
  }
  return invalid();
}

export function normalizeSandboxSecurityBenchmarkReplayEnvelope(value: unknown): Readonly<SandboxSecurityBenchmarkReplayEnvelope> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "fixture_id", "ollama", "judge", "decision_projection_sha256"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_REPLAY_SCHEMA_VERSION) return invalid();
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_BENCHMARK_REPLAY_SCHEMA_VERSION,
      fixture_id: fixtureId(root.fixture_id),
      ollama: normalizeOutcome(root.ollama, normalizeLocal),
      judge: normalizeOutcome(root.judge, normalizeJudge),
      decision_projection_sha256: sha(root.decision_projection_sha256)
    });
  });
}

export function normalizeSandboxSecurityBenchmarkManifest(value: unknown): Readonly<SandboxSecurityBenchmarkManifest> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "benchmark_revision", "sources_lock_sha256", "inputs_tree_sha256", "truth_tree_sha256", "reviews_tree_sha256", "request_ids_tree_sha256", "fixture_ids"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_MANIFEST_SCHEMA_VERSION || root.benchmark_revision !== "v1") return invalid();
    const fixture_ids = denseArray(root.fixture_ids, 1, MAX_FIXTURES).map(fixtureId);
    if (new Set(fixture_ids).size !== fixture_ids.length) return invalid();
    return deepFreeze({ schema_version: SANDBOX_SECURITY_BENCHMARK_MANIFEST_SCHEMA_VERSION, benchmark_revision: "v1" as const, sources_lock_sha256: sha(root.sources_lock_sha256), inputs_tree_sha256: sha(root.inputs_tree_sha256), truth_tree_sha256: sha(root.truth_tree_sha256), reviews_tree_sha256: sha(root.reviews_tree_sha256), request_ids_tree_sha256: sha(root.request_ids_tree_sha256), fixture_ids });
  });
}

export function normalizeSandboxSecurityBenchmarkCaptureManifest(value: unknown): Readonly<SandboxSecurityBenchmarkCaptureManifest> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "benchmark_manifest_sha256", "sources_lock_sha256", "inputs_tree_sha256", "decisions_tree_sha256", "cassette_tree_sha256", "ollama_model", "ollama_digest", "ollama_qualification", "openai_model", "local_prompt_version", "judge_prompt_version", "local_schema_version", "judge_schema_version", "rule_catalog_version", "sanitizer_version"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION || root.ollama_model !== "qwen3:8b" || root.openai_model !== "gpt-5.6-terra") return invalid();
    if (root.local_prompt_version !== LOCAL_PROMPT_VERSION ||
      root.judge_prompt_version !== JUDGE_PROMPT_VERSION ||
      root.local_schema_version !== LOCAL_SCHEMA_VERSION ||
      root.judge_schema_version !== JUDGE_SCHEMA_VERSION) return invalid();
    const qualification = exact(root.ollama_qualification, ["inventory", "prewarm"]);
    const ollama_digest = digest(root.ollama_digest);
    const inventory = normalizeOutcome(qualification.inventory, normalizeInventory);
    const prewarm = normalizeOutcome(qualification.prewarm, normalizeLocal);
    if (inventory.status === "response" && inventory.normalized_response.digest !== ollama_digest) return invalid();
    if (prewarm.status === "response" && prewarm.normalized_response.verified_ollama_digest !== ollama_digest) return invalid();
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION,
      benchmark_manifest_sha256: sha(root.benchmark_manifest_sha256),
      sources_lock_sha256: sha(root.sources_lock_sha256),
      inputs_tree_sha256: sha(root.inputs_tree_sha256),
      decisions_tree_sha256: sha(root.decisions_tree_sha256),
      cassette_tree_sha256: sha(root.cassette_tree_sha256),
      ollama_model: "qwen3:8b" as const,
      ollama_digest,
      ollama_qualification: {
        inventory,
        prewarm
      },
      openai_model: "gpt-5.6-terra" as const,
      local_prompt_version: LOCAL_PROMPT_VERSION,
      judge_prompt_version: JUDGE_PROMPT_VERSION,
      local_schema_version: LOCAL_SCHEMA_VERSION,
      judge_schema_version: JUDGE_SCHEMA_VERSION,
      rule_catalog_version: stringValue(root.rule_catalog_version, 128),
      sanitizer_version: stringValue(root.sanitizer_version, 128)
    });
  });
}

export function normalizeSandboxSecurityBenchmarkSeal(value: unknown): Readonly<SandboxSecurityBenchmarkSeal> {
  return safeCall(() => {
    const root = exact(value, ["schema_version", "capture_manifest_sha256", "truth_tree_sha256", "replay_tree_sha256", "accepted_metrics_sha256"]);
    if (root.schema_version !== SANDBOX_SECURITY_BENCHMARK_SEAL_SCHEMA_VERSION) return invalid();
    return deepFreeze({ schema_version: SANDBOX_SECURITY_BENCHMARK_SEAL_SCHEMA_VERSION, capture_manifest_sha256: sha(root.capture_manifest_sha256), truth_tree_sha256: sha(root.truth_tree_sha256), replay_tree_sha256: sha(root.replay_tree_sha256), accepted_metrics_sha256: sha(root.accepted_metrics_sha256) });
  });
}

export function hashSandboxSecurityBenchmarkCanonicalJson(value: unknown): SandboxSecurityBenchmarkSha256 {
  return safeCall(() => hashValue(value));
}

interface TreeTraversalState {
  entries: number;
}

function directoryNames(
  current: string,
  state: TreeTraversalState
): string[] {
  const directory = opendirSync(current);
  const names: string[] = [];
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      state.entries += 1;
      if (state.entries > MAX_TREE_FILES) return invalid();
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function collectTreeFiles(
  root: string,
  current: string,
  output: string[],
  state: TreeTraversalState,
  depth = 0
): void {
  if (depth > MAX_TREE_DEPTH) return invalid();
  for (const name of directoryNames(current, state)) {
    const full = resolve(current, name);
    const relativePath = relative(root, full).split(sep).join("/");
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) return invalid();
    if (stat.isDirectory()) collectTreeFiles(root, full, output, state, depth + 1);
    else if (stat.isFile()) {
      if (output.length >= MAX_TREE_FILES) return invalid();
      output.push(relativePath);
    }
    else return invalid();
  }
}

export function hashSandboxSecurityBenchmarkTree(root: string): SandboxSecurityBenchmarkSha256 {
  return safeCall(() => {
    const resolvedRoot = resolve(stringValue(root, 4096));
    const rootStat = lstatSync(resolvedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return invalid();
    const files: string[] = [];
    const state: TreeTraversalState = { entries: 0 };
    collectTreeFiles(resolvedRoot, resolvedRoot, files, state);
    files.sort();
    let totalBytes = 0;
    const inventory = files.map((path) => {
      const full = resolve(resolvedRoot, path);
      const stat = lstatSync(full);
      if (!stat.isFile() || stat.isSymbolicLink()) return invalid();
      if (!Number.isSafeInteger(stat.size) || stat.size > MAX_TREE_FILE_BYTES) return invalid();
      totalBytes += stat.size;
      if (totalBytes > MAX_TREE_TOTAL_BYTES) return invalid();
      const bytes = readFileSync(full);
      if (bytes.byteLength > MAX_TREE_FILE_BYTES) return invalid();
      if (bytes.byteLength !== stat.size) return invalid();
      return { path, sha256: hashBytes(bytes) };
    });
    return hashValue(inventory);
  });
}
