type SandboxSecurityReplayRiskCategory =
  | "prompt_injection"
  | "jailbreak"
  | "instruction_override"
  | "privilege_escalation"
  | "sensitive_data_exposure"
  | "tool_hijacking"
  | "unsafe_side_effect"
  | "memory_poisoning"
  | "trust_boundary_violation";

type SandboxSecurityReplaySeverity = "low" | "medium" | "high" | "critical";
type SandboxSecurityReplayConfidence = "uncertain" | "probable" | "confident";

type SandboxSecurityReplayLocalSubjectRef =
  | Readonly<{
      kind: "content_source";
      source_ordinal: number;
      component: "whole_source";
    }>
  | Readonly<{
      kind: "tool_request";
      component: "whole_call" | "tool_name" | "target" | "arguments";
    }>;

type SandboxSecurityReplayLocalCandidate = Readonly<{
  category: SandboxSecurityReplayRiskCategory;
  severity: SandboxSecurityReplaySeverity;
  confidence: SandboxSecurityReplayConfidence;
  subject_refs: readonly SandboxSecurityReplayLocalSubjectRef[];
}>;

type SandboxSecurityReplayObligationResult = Readonly<{
  obligation_ordinal: number;
  outcome: "risk" | "clearance";
  confidence: SandboxSecurityReplayConfidence;
  severity: SandboxSecurityReplaySeverity | null;
}>;

export type SandboxSecurityReplayTransportOutcome<T> =
  | Readonly<{ status: "not_called" }>
  | Readonly<{
      status: "response";
      http_status: 200;
      content_type: "application/json";
      normalized_response: T;
    }>
  | Readonly<{ status: "http_error"; http_status: number }>
  | Readonly<{
      status: "transport_error";
      error_code:
        | "connection_failed"
        | "response_too_large"
        | "provider_response_invalid";
    }>
  | Readonly<{
      status: "signal_termination";
      termination_reason: "slot_timeout" | "work_budget";
    }>;

export interface SandboxSecurityReplayOllamaInventoryResponse {
  readonly model: "qwen3:8b";
  readonly digest: string;
}

export interface SandboxSecurityReplayOllamaResponse {
  readonly model: "qwen3:8b";
  readonly verified_ollama_digest: string;
  readonly done: true;
  readonly message: Readonly<{
    role: "assistant";
    parsed: Readonly<{
      schema_version: "sandbox-security-local-model.v1";
      status: "matched" | "no_match";
      candidates: readonly SandboxSecurityReplayLocalCandidate[];
    }>;
  }>;
}

export interface SandboxSecurityReplayOpenAIResponse {
  readonly model: string;
  readonly status: "completed";
  readonly parsed: Readonly<{
    schema_version: "sandbox-security-judge.v1";
    obligation_results: readonly SandboxSecurityReplayObligationResult[];
  }>;
}

const RISK_CATEGORIES = [
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

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const CONFIDENCES = ["uncertain", "probable", "confident"] as const;
const TRANSPORT_ERROR_CODES = [
  "connection_failed",
  "response_too_large",
  "provider_response_invalid"
] as const;
const TERMINATION_REASONS = ["slot_timeout", "work_budget"] as const;
const TOOL_COMPONENTS = ["whole_call", "tool_name", "target", "arguments"] as const;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const JUDGE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MAX_REPLAY_COPY_NODES = 512;
const MAX_REPLAY_COPY_RECORD_KEYS = 32;
const MAX_REPLAY_COPY_ARRAY_LENGTH = 32;

interface ValidationState {
  readonly seen: WeakSet<object>;
}

interface CopyState extends ValidationState {
  nodes: number;
}

function invalid(): never {
  throw new TypeError("sandbox_security_provider_outcome_invalid");
}

function withSafeValidation<T>(validate: () => T): T {
  try {
    return validate();
  } catch {
    return invalid();
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function assertNewObject(value: object, state: ValidationState): void {
  if (state.seen.has(value)) {
    invalid();
  }
  state.seen.add(value);
}

function plainRecord(value: unknown, state: ValidationState): Record<string, unknown> {
  if (
    !isObject(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  assertNewObject(value, state);
  return value as Record<string, unknown>;
}

function assertExactEnumerableDataKeys(
  record: object,
  expected: readonly string[]
): void {
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length !== expected.length) {
    invalid();
  }
  const expectedKeys = new Set(expected);
  for (const key of ownKeys) {
    if (typeof key !== "string" || !expectedKeys.has(key)) {
      invalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid();
    }
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid();
    }
  }
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  state: ValidationState
): Record<string, unknown> {
  const record = plainRecord(value, state);
  assertExactEnumerableDataKeys(record, expected);
  return record;
}

function dataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    invalid();
  }
  return descriptor.value;
}

function denseArray(
  value: unknown,
  minLength: number,
  maxLength: number,
  state: ValidationState
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalid();
  }
  assertNewObject(value, state);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.enumerable !== false ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < minLength ||
    lengthDescriptor.value > maxLength
  ) {
    invalid();
  }
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    invalid();
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid();
    }
    items.push(descriptor.value);
  }
  return items;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid();
  }
  return value as T;
}

function literalValue<T extends string>(value: unknown, expected: T): T {
  if (value !== expected) {
    invalid();
  }
  return expected;
}

function boundedInteger(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalid();
  }
  return value;
}

function normalizedDigest(value: unknown): string {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) {
    invalid();
  }
  return value;
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function copiedDataValue(value: unknown, state: CopyState): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalid();
    }
    return value;
  }
  if (!isObject(value)) {
    invalid();
  }
  if (state.nodes >= MAX_REPLAY_COPY_NODES) {
    invalid();
  }
  state.nodes += 1;

  if (Array.isArray(value)) {
    const items = denseArray(value, 0, MAX_REPLAY_COPY_ARRAY_LENGTH, state);
    return items.map((item) => copiedDataValue(item, state));
  }

  const record = plainRecord(value, state);
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length > MAX_REPLAY_COPY_RECORD_KEYS) {
    invalid();
  }
  const copy: Record<string, unknown> = {};
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      invalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      invalid();
    }
    Object.defineProperty(copy, key, {
      value: copiedDataValue(descriptor.value, state),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return copy;
}

function copyAndFreeze<T>(value: T): T {
  return deepFreeze(
    copiedDataValue(value, { seen: new WeakSet<object>(), nodes: 0 }) as T
  );
}

function normalizeLocalSubjectRef(
  value: unknown,
  state: ValidationState
): SandboxSecurityReplayLocalSubjectRef {
  const record = plainRecord(value, state);
  const kind = dataProperty(record, "kind");
  if (kind === "content_source") {
    assertExactEnumerableDataKeys(record, ["kind", "source_ordinal", "component"]);
    const source_ordinal = boundedInteger(dataProperty(record, "source_ordinal"), 1, 64);
    literalValue(dataProperty(record, "component"), "whole_source");
    return deepFreeze({
      kind: "content_source",
      source_ordinal,
      component: "whole_source"
    });
  }
  if (kind === "tool_request") {
    assertExactEnumerableDataKeys(record, ["kind", "component"]);
    const component = enumValue(dataProperty(record, "component"), TOOL_COMPONENTS);
    return deepFreeze({ kind: "tool_request", component });
  }
  invalid();
}

function normalizeLocalCandidate(
  value: unknown,
  state: ValidationState
): SandboxSecurityReplayLocalCandidate {
  const record = exactRecord(
    value,
    ["category", "severity", "confidence", "subject_refs"],
    state
  );
  const category = enumValue(dataProperty(record, "category"), RISK_CATEGORIES);
  const severity = enumValue(dataProperty(record, "severity"), SEVERITIES);
  const confidence = enumValue(dataProperty(record, "confidence"), CONFIDENCES);
  const subjectValues = denseArray(dataProperty(record, "subject_refs"), 1, 8, state);
  const subject_refs = subjectValues.map((subject) =>
    normalizeLocalSubjectRef(subject, state)
  );
  const uniqueRefs = new Set<string>();
  for (const subject of subject_refs) {
    const key = localSubjectRefKey(subject);
    if (uniqueRefs.has(key)) {
      invalid();
    }
    uniqueRefs.add(key);
  }
  return deepFreeze({ category, severity, confidence, subject_refs });
}

function localSubjectRefKey(subject: SandboxSecurityReplayLocalSubjectRef): string {
  return subject.kind === "content_source"
    ? `content_source:${subject.source_ordinal}:whole_source`
    : `tool_request:${subject.component}`;
}

function localCandidateKey(candidate: SandboxSecurityReplayLocalCandidate): string {
  return JSON.stringify([
    candidate.category,
    candidate.subject_refs.map(localSubjectRefKey).sort()
  ]);
}

function normalizeObligationResult(
  value: unknown,
  state: ValidationState
): SandboxSecurityReplayObligationResult {
  const record = exactRecord(
    value,
    ["obligation_ordinal", "outcome", "confidence", "severity"],
    state
  );
  const obligation_ordinal = boundedInteger(
    dataProperty(record, "obligation_ordinal"),
    1,
    999
  );
  const outcome = enumValue(dataProperty(record, "outcome"), ["risk", "clearance"] as const);
  const confidence = enumValue(dataProperty(record, "confidence"), CONFIDENCES);
  const severityValue = dataProperty(record, "severity");
  const severity =
    outcome === "risk"
      ? enumValue(severityValue, SEVERITIES)
      : severityValue === null
        ? null
        : invalid();
  return deepFreeze({ obligation_ordinal, outcome, confidence, severity });
}

export function normalizeSandboxSecurityReplayOllamaInventoryResponse(
  value: unknown
): SandboxSecurityReplayOllamaInventoryResponse {
  return withSafeValidation(() =>
    normalizeSandboxSecurityReplayOllamaInventoryResponseImpl(value)
  );
}

function normalizeSandboxSecurityReplayOllamaInventoryResponseImpl(
  value: unknown
): SandboxSecurityReplayOllamaInventoryResponse {
  const state: ValidationState = { seen: new WeakSet<object>() };
  const record = exactRecord(value, ["model", "digest"], state);
  const model = literalValue(dataProperty(record, "model"), "qwen3:8b");
  const digest = normalizedDigest(dataProperty(record, "digest"));
  return deepFreeze({ model, digest });
}

export function normalizeSandboxSecurityReplayOllamaResponse(
  value: unknown
): SandboxSecurityReplayOllamaResponse {
  return withSafeValidation(() => normalizeSandboxSecurityReplayOllamaResponseImpl(value));
}

function normalizeSandboxSecurityReplayOllamaResponseImpl(
  value: unknown
): SandboxSecurityReplayOllamaResponse {
  const state: ValidationState = { seen: new WeakSet<object>() };
  const record = exactRecord(
    value,
    ["model", "verified_ollama_digest", "done", "message"],
    state
  );
  const model = literalValue(dataProperty(record, "model"), "qwen3:8b");
  const verified_ollama_digest = normalizedDigest(
    dataProperty(record, "verified_ollama_digest")
  );
  if (dataProperty(record, "done") !== true) {
    invalid();
  }
  const messageRecord = exactRecord(dataProperty(record, "message"), ["role", "parsed"], state);
  const role = literalValue(dataProperty(messageRecord, "role"), "assistant");
  const parsedRecord = exactRecord(
    dataProperty(messageRecord, "parsed"),
    ["schema_version", "status", "candidates"],
    state
  );
  const schema_version = literalValue(
    dataProperty(parsedRecord, "schema_version"),
    "sandbox-security-local-model.v1"
  );
  const status = enumValue(dataProperty(parsedRecord, "status"), ["matched", "no_match"] as const);
  const candidateValues = denseArray(dataProperty(parsedRecord, "candidates"), 0, 32, state);
  if ((status === "no_match" && candidateValues.length !== 0) || (status === "matched" && candidateValues.length === 0)) {
    invalid();
  }
  const candidates: SandboxSecurityReplayLocalCandidate[] = [];
  const candidateKeys = new Set<string>();
  for (const candidateValue of candidateValues) {
    const normalizedCandidate = normalizeLocalCandidate(candidateValue, state);
    const key = localCandidateKey(normalizedCandidate);
    if (candidateKeys.has(key)) {
      invalid();
    }
    candidateKeys.add(key);
    candidates.push(normalizedCandidate);
  }
  return deepFreeze({
    model,
    verified_ollama_digest,
    done: true,
    message: { role, parsed: { schema_version, status, candidates } }
  });
}

export function normalizeSandboxSecurityReplayOpenAIResponse(
  value: unknown
): SandboxSecurityReplayOpenAIResponse {
  return withSafeValidation(() => normalizeSandboxSecurityReplayOpenAIResponseImpl(value));
}

function normalizeSandboxSecurityReplayOpenAIResponseImpl(
  value: unknown
): SandboxSecurityReplayOpenAIResponse {
  const state: ValidationState = { seen: new WeakSet<object>() };
  const record = exactRecord(value, ["model", "status", "parsed"], state);
  const modelRaw = dataProperty(record, "model");
  if (typeof modelRaw !== "string" || !JUDGE_MODEL.test(modelRaw)) {
    invalid();
  }
  const model = modelRaw;
  const status = literalValue(dataProperty(record, "status"), "completed");
  const parsedRecord = exactRecord(
    dataProperty(record, "parsed"),
    ["schema_version", "obligation_results"],
    state
  );
  const schema_version = literalValue(
    dataProperty(parsedRecord, "schema_version"),
    "sandbox-security-judge.v1"
  );
  const resultValues = denseArray(
    dataProperty(parsedRecord, "obligation_results"),
    0,
    32,
    state
  );
  const obligation_results: SandboxSecurityReplayObligationResult[] = [];
  const ordinals = new Set<number>();
  for (const resultValue of resultValues) {
    const normalizedResult = normalizeObligationResult(resultValue, state);
    if (ordinals.has(normalizedResult.obligation_ordinal)) {
      invalid();
    }
    ordinals.add(normalizedResult.obligation_ordinal);
    obligation_results.push(normalizedResult);
  }
  return deepFreeze({
    model,
    status,
    parsed: { schema_version, obligation_results }
  });
}

function isConcreteResponseNormalizer(
  normalizeResponse: (value: unknown) => unknown
): boolean {
  return (
    normalizeResponse === normalizeSandboxSecurityReplayOllamaInventoryResponse ||
    normalizeResponse === normalizeSandboxSecurityReplayOllamaResponse ||
    normalizeResponse === normalizeSandboxSecurityReplayOpenAIResponse
  );
}

export function normalizeSandboxSecurityReplayOutcome<T>(
  value: unknown,
  normalizeResponse: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T> {
  return withSafeValidation(() =>
    normalizeSandboxSecurityReplayOutcomeImpl(value, normalizeResponse)
  );
}

function normalizeSandboxSecurityReplayOutcomeImpl<T>(
  value: unknown,
  normalizeResponse: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T> {
  if (!isConcreteResponseNormalizer(normalizeResponse)) {
    invalid();
  }
  const state: ValidationState = { seen: new WeakSet<object>() };
  const record = plainRecord(value, state);
  const status = dataProperty(record, "status");
  if (status === "not_called") {
    assertExactEnumerableDataKeys(record, ["status"]);
    return deepFreeze({ status: "not_called" });
  }
  if (status === "response") {
    assertExactEnumerableDataKeys(record, [
      "status",
      "http_status",
      "content_type",
      "normalized_response"
    ]);
    if (dataProperty(record, "http_status") !== 200) {
      invalid();
    }
    literalValue(dataProperty(record, "content_type"), "application/json");
    const normalized_response = copyAndFreeze(
      normalizeResponse(dataProperty(record, "normalized_response"))
    );
    return deepFreeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response
    });
  }
  if (status === "http_error") {
    assertExactEnumerableDataKeys(record, ["status", "http_status"]);
    const http_status = boundedInteger(dataProperty(record, "http_status"), 100, 599);
    if (http_status === 200) {
      invalid();
    }
    return deepFreeze({ status: "http_error", http_status });
  }
  if (status === "transport_error") {
    assertExactEnumerableDataKeys(record, ["status", "error_code"]);
    const error_code = enumValue(
      dataProperty(record, "error_code"),
      TRANSPORT_ERROR_CODES
    );
    return deepFreeze({ status: "transport_error", error_code });
  }
  if (status === "signal_termination") {
    assertExactEnumerableDataKeys(record, ["status", "termination_reason"]);
    const termination_reason = enumValue(
      dataProperty(record, "termination_reason"),
      TERMINATION_REASONS
    );
    return deepFreeze({ status: "signal_termination", termination_reason });
  }
  invalid();
}
