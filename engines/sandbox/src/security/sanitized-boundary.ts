import {
  canonicalizeSandboxSecurityJson
} from "./canonical-json.ts";
import {
  validateSandboxSecurityContentLocator,
  validateSandboxSecurityToolLocator
} from "./locator.ts";
import {
  isSandboxSecurityCallHandle,
  isSandboxSecuritySourceHandle,
  type SandboxSecurityCallHandle,
  type SandboxSecuritySourceHandle
} from "./input-boundary.ts";
import {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT,
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT,
  SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES,
  SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_TOKENS,
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM,
  type SandboxSecurityCandidateSubjectRef,
  type SandboxSecurityCategoryClearance,
  type SandboxSecurityExternalCandidateSubjectRef,
  type SandboxSecurityRawDetectorSnapshot,
  type SandboxSecurityRiskCandidate,
  type SandboxSecuritySanitizedJudgeObligation,
  type SandboxSecuritySanitizedJudgePayload
} from "./detector-contract.ts";
import {
  type SandboxSecurityNormalizedSlotResult
} from "./detector-output-boundary.ts";
import {
  canonicalizeSandboxSecurityPrivateSubjectScopes
} from "./subject-scope.ts";
import type {
  SandboxSecurityReasonCode,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity
} from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityExternalSourceTokenEntry {
  readonly source_token: string;
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly media_type: "text/plain" | "application/json";
}

export interface SandboxSecurityExternalCallTokenEntry {
  readonly call_token: string;
  readonly tool_name_token: string;
  readonly call_handle: SandboxSecurityCallHandle;
  readonly has_target: boolean;
}

export interface SandboxSecurityExternalTokenRegistry {
  readonly evaluation_nonce: string;
  readonly request_token: string;
  readonly source_tokens: readonly SandboxSecurityExternalSourceTokenEntry[];
  readonly call_token?: Readonly<SandboxSecurityExternalCallTokenEntry>;
}

type ExternalRegistryValidationContext = {
  readonly contents_by_handle: ReadonlyMap<
    string,
    SandboxSecurityRawDetectorSnapshot["contents"][number]
  >;
  readonly tool_request?: SandboxSecurityRawDetectorSnapshot["tool_request"];
};

const externalRegistryContext = new WeakMap<
  object,
  ExternalRegistryValidationContext
>();

export type SandboxSecurityNormalizedExternalDetectorResult =
  | {
      status: "matched";
      result: Readonly<SandboxSecurityNormalizedSlotResult>;
      covered_obligation_ids: readonly string[];
    }
  | { status: "no_match" }
  | {
      status: "invalid_result";
      error_code: "detector_result_invalid" | "detector_content_leak";
    };

const REASON_CODES = new Set(
  SANDBOX_SECURITY_RISK_CATEGORIES.map(
    (category) => `sandbox_security_${category}`
  )
);

function reasonCodeForCategory(category: string): string {
  return `sandbox_security_${category}`;
}

const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const SOURCE_HANDLE_PATTERN = /^hsrc:([a-f0-9]{32}):(0[0-6][0-9]{2})$/;
const CALL_HANDLE_PATTERN = /^hcall:([a-f0-9]{32}):0000$/;
const OBLIGATION_ID_PATTERN =
  /^obligation:\/\/sandbox\/security\/[A-Za-z0-9_.-]{1,128}\/(0[0-9]{3})$/;

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "request_id",
  "evaluation_mode",
  "profile",
  "contents",
  "canonical_request_sha256",
  "source_handle",
  "call_handle",
  "provenance_ref",
  "original_utf8_bytes",
  "original_value_sha256",
  "comparison_value",
  "arguments_jcs_sha256",
  "authority_kind",
  "tool_name",
  "value"
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key))) return false;
  return required.every((key) => Object.hasOwn(value, key));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function countJsonNodes(value: unknown, depth = 0): { nodes: number; depth: number } {
  if (value === null || typeof value !== "object") {
    return { nodes: 1, depth };
  }
  if (Array.isArray(value)) {
    let nodes = 1;
    let maxDepth = depth;
    for (const item of value) {
      const nested = countJsonNodes(item, depth + 1);
      nodes += nested.nodes;
      maxDepth = Math.max(maxDepth, nested.depth);
    }
    return { nodes, depth: maxDepth };
  }
  let nodes = 1;
  let maxDepth = depth;
  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    const nested = countJsonNodes(nestedValue, depth + 1);
    nodes += nested.nodes;
    maxDepth = Math.max(maxDepth, nested.depth);
  }
  return { nodes, depth: maxDepth };
}

function collectTokenSet(registry: Readonly<SandboxSecurityExternalTokenRegistry>): Set<string> {
  const tokens = new Set<string>([registry.request_token]);
  for (const entry of registry.source_tokens) tokens.add(entry.source_token);
  if (registry.call_token) {
    tokens.add(registry.call_token.call_token);
    tokens.add(registry.call_token.tool_name_token);
  }
  return tokens;
}

function extractNonceFromHandle(handle: string): string | null {
  const source = SOURCE_HANDLE_PATTERN.exec(handle);
  if (source) return source[1];
  const call = CALL_HANDLE_PATTERN.exec(handle);
  if (call) return call[1];
  return null;
}

function ordinalFromSourceHandle(handle: string): string | null {
  const match = SOURCE_HANDLE_PATTERN.exec(handle);
  if (!match) return null;
  const ordinal = Number(match[2]);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 64) return null;
  return match[2];
}

export function deriveSandboxSecurityExternalTokenRegistry(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): Readonly<SandboxSecurityExternalTokenRegistry> {
  if (!Array.isArray(snapshot.contents) || snapshot.contents.length === 0) {
    throw new Error("sandbox_security_external_token_registry_invalid");
  }

  let evaluation_nonce: string | null = null;
  const seenHandles = new Set<string>();
  const source_tokens: SandboxSecurityExternalSourceTokenEntry[] = [];

  for (const content of snapshot.contents) {
    const handle = content.source_handle;
    if (!isSandboxSecuritySourceHandle(handle) || seenHandles.has(handle)) {
      throw new Error("sandbox_security_external_token_registry_invalid");
    }
    const nonce = extractNonceFromHandle(handle);
    const ordinal = ordinalFromSourceHandle(handle);
    if (!nonce || !NONCE_PATTERN.test(nonce) || !ordinal) {
      throw new Error("sandbox_security_external_token_registry_invalid");
    }
    if (evaluation_nonce === null) evaluation_nonce = nonce;
    if (nonce !== evaluation_nonce) {
      throw new Error("sandbox_security_external_token_registry_invalid");
    }
    seenHandles.add(handle);
    source_tokens.push({
      source_token: `etok:src:${nonce}:${ordinal}`,
      source_handle: handle,
      media_type: content.media_type
    });
  }

  if (evaluation_nonce === null) {
    throw new Error("sandbox_security_external_token_registry_invalid");
  }

  let call_token: SandboxSecurityExternalCallTokenEntry | undefined;
  if (snapshot.tool_request) {
    const handle = snapshot.tool_request.call_handle;
    if (!isSandboxSecurityCallHandle(handle)) {
      throw new Error("sandbox_security_external_token_registry_invalid");
    }
    const nonce = extractNonceFromHandle(handle);
    if (!nonce || nonce !== evaluation_nonce) {
      throw new Error("sandbox_security_external_token_registry_invalid");
    }
    call_token = {
      call_token: `etok:call:${evaluation_nonce}:0000`,
      tool_name_token: `etok:tool-name:${evaluation_nonce}:0000`,
      call_handle: handle,
      has_target: snapshot.tool_request.has_target
    };
  }

  const registry: SandboxSecurityExternalTokenRegistry = {
    evaluation_nonce,
    request_token: `etok:req:${evaluation_nonce}`,
    source_tokens: Object.freeze([...source_tokens]),
    ...(call_token ? { call_token: Object.freeze(call_token) } : {})
  };

  const tokenCount =
    1 + registry.source_tokens.length + (registry.call_token ? 2 : 0);
  if (tokenCount > SANDBOX_SECURITY_MAX_SANITIZED_TOKENS) {
    throw new Error("sandbox_security_external_token_registry_invalid");
  }

  const frozen = Object.freeze(registry);
  externalRegistryContext.set(frozen, {
    contents_by_handle: new Map(
      snapshot.contents.map((content) => [content.source_handle, content])
    ),
    tool_request: snapshot.tool_request
  });
  return frozen;
}

export function assertSanitizedJudgePayloadBounds(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): void {
  const encoded = Buffer.byteLength(
    canonicalizeSandboxSecurityJson(payload),
    "utf8"
  );
  if (encoded > SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES) {
    throw new Error("external_redaction_failed");
  }
  const stats = countJsonNodes(payload);
  if (stats.depth > SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH) {
    throw new Error("external_redaction_failed");
  }
  if (stats.nodes > SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES) {
    throw new Error("external_redaction_failed");
  }
}

function containsForbiddenRawMetadata(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenRawMetadata(item));
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) return true;
    if (containsForbiddenRawMetadata(nested)) return true;
  }
  return false;
}

function scopeIdentityFromExternalRefs(
  refs: readonly SandboxSecurityExternalCandidateSubjectRef[],
  registry: Readonly<SandboxSecurityExternalTokenRegistry>
): string[] | null {
  const mapped = mapExternalRefsToPrivate(refs, registry);
  if (!mapped) return null;
  try {
    return canonicalizeSandboxSecurityPrivateSubjectScopes(mapped).map((scope) =>
      canonicalizeSandboxSecurityJson(scope)
    );
  } catch {
    return null;
  }
}

function obligationScopeKey(
  obligation: SandboxSecuritySanitizedJudgeObligation,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>
): string | null {
  const scopes = scopeIdentityFromExternalRefs(obligation.subject_refs, registry);
  if (!scopes) return null;
  return canonicalizeSandboxSecurityJson({
    category: obligation.category,
    scopes
  });
}

export function validateSandboxSecuritySanitizedJudgePayload(
  payload: unknown,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  expected_obligations: readonly SandboxSecuritySanitizedJudgeObligation[]
): Readonly<SandboxSecuritySanitizedJudgePayload> {
  if (
    !hasExactKeys(
      payload,
      [
        "schema_version",
        "request_token",
        "stage",
        "policy_profile_id",
        "sources",
        "routed_obligations"
      ],
      ["tool_request"]
    )
  ) {
    throw new Error("external_redaction_failed");
  }
  if (payload.schema_version !== "sandbox-security-sanitized-judge.v1") {
    throw new Error("external_redaction_failed");
  }
  if (payload.request_token !== registry.request_token) {
    throw new Error("external_redaction_failed");
  }
  if (payload.stage !== snapshot.stage) {
    throw new Error("external_redaction_failed");
  }
  if (payload.policy_profile_id !== snapshot.profile.profile_id) {
    throw new Error("external_redaction_failed");
  }
  if (containsForbiddenRawMetadata(payload)) {
    throw new Error("external_redaction_failed");
  }
  if (!Array.isArray(payload.sources) || payload.sources.length !== registry.source_tokens.length) {
    throw new Error("external_redaction_failed");
  }

  const tokenSet = collectTokenSet(registry);
  const seenSourceTokens = new Set<string>();
  const sources = [];
  for (let index = 0; index < payload.sources.length; index += 1) {
    const source = payload.sources[index];
    const expected = registry.source_tokens[index];
    if (
      !hasExactKeys(source, [
        "source_token",
        "source_type",
        "media_type",
        "sanitized_value"
      ])
    ) {
      throw new Error("external_redaction_failed");
    }
    const expectedContent = snapshot.contents[index];
    if (
      !expectedContent ||
      source.source_token !== expected.source_token ||
      source.media_type !== expected.media_type ||
      source.media_type !== expectedContent.media_type ||
      typeof source.source_type !== "string" ||
      !SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES.includes(source.source_type as never) ||
      source.source_type !== expectedContent.source_type ||
      seenSourceTokens.has(source.source_token) ||
      !tokenSet.has(source.source_token)
    ) {
      throw new Error("external_redaction_failed");
    }
    seenSourceTokens.add(source.source_token);
    sources.push({
      source_token: source.source_token as string,
      source_type: source.source_type as SandboxSecuritySanitizedJudgePayload["sources"][number]["source_type"],
      media_type: source.media_type as "text/plain" | "application/json",
      sanitized_value: source.sanitized_value as SandboxSecuritySanitizedJudgePayload["sources"][number]["sanitized_value"]
    });
  }

  let tool_request: SandboxSecuritySanitizedJudgePayload["tool_request"];
  if (registry.call_token) {
    if (!hasExactKeys(payload.tool_request, ["call_token", "tool_name_token", "sanitized_arguments"], ["sanitized_target"])) {
      throw new Error("external_redaction_failed");
    }
    if (
      payload.tool_request.call_token !== registry.call_token.call_token ||
      payload.tool_request.tool_name_token !== registry.call_token.tool_name_token
    ) {
      throw new Error("external_redaction_failed");
    }
    if (registry.call_token.has_target) {
      if (typeof payload.tool_request.sanitized_target !== "string") {
        throw new Error("external_redaction_failed");
      }
    } else if (Object.hasOwn(payload.tool_request, "sanitized_target")) {
      throw new Error("external_redaction_failed");
    }
    if (Object.hasOwn(payload.tool_request, "tool_name")) {
      throw new Error("external_redaction_failed");
    }
    tool_request = {
      call_token: payload.tool_request.call_token as string,
      tool_name_token: payload.tool_request.tool_name_token as string,
      sanitized_arguments: payload.tool_request.sanitized_arguments as never,
      ...(Object.hasOwn(payload.tool_request, "sanitized_target")
        ? { sanitized_target: payload.tool_request.sanitized_target as string }
        : {})
    };
  } else if (Object.hasOwn(payload, "tool_request")) {
    throw new Error("external_redaction_failed");
  }

  if (!Array.isArray(payload.routed_obligations) || payload.routed_obligations.length === 0) {
    throw new Error("external_redaction_failed");
  }
  if (payload.routed_obligations.length !== expected_obligations.length) {
    throw new Error("external_redaction_failed");
  }

  const seenObligationIds = new Set<string>();
  const seenObligationScopes = new Set<string>();
  const routed_obligations: SandboxSecuritySanitizedJudgeObligation[] = [];
  for (let index = 0; index < payload.routed_obligations.length; index += 1) {
    const obligation = payload.routed_obligations[index];
    const expected = expected_obligations[index];
    if (
      !hasExactKeys(obligation, ["obligation_id", "category", "subject_refs"]) ||
      typeof obligation.obligation_id !== "string" ||
      !OBLIGATION_ID_PATTERN.test(obligation.obligation_id) ||
      !SANDBOX_SECURITY_RISK_CATEGORIES.includes(obligation.category as never) ||
      !Array.isArray(obligation.subject_refs) ||
      obligation.subject_refs.length === 0 ||
      obligation.subject_refs.length > SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM
    ) {
      throw new Error("external_redaction_failed");
    }
    if (
      obligation.obligation_id !== expected.obligation_id ||
      obligation.category !== expected.category
    ) {
      throw new Error("external_redaction_failed");
    }
    if (seenObligationIds.has(obligation.obligation_id)) {
      throw new Error("external_redaction_failed");
    }
    seenObligationIds.add(obligation.obligation_id);
    const scopeKey = obligationScopeKey(
      obligation as unknown as SandboxSecuritySanitizedJudgeObligation,
      registry
    );
    if (!scopeKey || seenObligationScopes.has(scopeKey)) {
      throw new Error("external_redaction_failed");
    }
    seenObligationScopes.add(scopeKey);
    const expectedScope = obligationScopeKey(expected, registry);
    if (expectedScope !== scopeKey) {
      throw new Error("external_redaction_failed");
    }
    routed_obligations.push({
      obligation_id: obligation.obligation_id,
      category: obligation.category as SandboxSecurityRiskCategory,
      subject_refs: obligation.subject_refs as SandboxSecurityExternalCandidateSubjectRef[]
    });
  }

  const validated: SandboxSecuritySanitizedJudgePayload = {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: payload.request_token as string,
    stage: payload.stage as SandboxSecuritySanitizedJudgePayload["stage"],
    policy_profile_id:
      payload.policy_profile_id as SandboxSecuritySanitizedJudgePayload["policy_profile_id"],
    sources,
    ...(tool_request ? { tool_request } : {}),
    routed_obligations
  };

  assertSanitizedJudgePayloadBounds(validated);

  const allTokens = collectTokenSet(registry);
  if (allTokens.size > SANDBOX_SECURITY_MAX_SANITIZED_TOKENS) {
    throw new Error("external_redaction_failed");
  }

  return deepFreeze(validated);
}

function invalid(
  error_code: "detector_result_invalid" | "detector_content_leak" = "detector_result_invalid"
): SandboxSecurityNormalizedExternalDetectorResult {
  return { status: "invalid_result", error_code };
}

function looksLikeLeak(value: unknown): boolean {
  const text = JSON.stringify(value);
  return (
    text.includes("raw_content") ||
    text.includes("PROMPT_SECRET") ||
    text.includes("password=") ||
    text.includes("hsrc:") ||
    text.includes("hcall:")
  );
}

function mapExternalRefsToPrivate(
  refsValue: unknown,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>
): SandboxSecurityCandidateSubjectRef[] | null {
  if (!Array.isArray(refsValue) || refsValue.length === 0) return null;
  if (refsValue.length > SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM) return null;
  const context = externalRegistryContext.get(registry as object);
  if (!context) return null;
  const refs: SandboxSecurityCandidateSubjectRef[] = [];
  for (const ref of refsValue) {
    if (!isPlainRecord(ref) || typeof ref.kind !== "string") return null;
    if (ref.kind === "content_source") {
      if (!hasExactKeys(ref, ["kind", "source_token", "locator"])) return null;
      if (typeof ref.source_token !== "string" || ref.source_token.startsWith("hsrc:")) {
        return null;
      }
      const entry = registry.source_tokens.find(
        (item) => item.source_token === ref.source_token
      );
      if (!entry) return null;
      const content = context.contents_by_handle.get(entry.source_handle);
      if (!content) return null;
      const locator = validateSandboxSecurityContentLocator(ref.locator, {
        source_handle: content.source_handle,
        source_id: content.source_id,
        source_type: content.source_type,
        media_type: content.media_type,
        authority_kind: content.authority_kind,
        value: content.value,
        provenance_ref: content.provenance_ref,
        original_utf8_bytes: content.original_utf8_bytes,
        original_value_sha256: content.original_value_sha256,
        comparison_value: content.comparison_value
      } as never);
      if (locator === null) return null;
      refs.push({
        kind: "content_source",
        source_handle: entry.source_handle,
        locator
      });
      continue;
    }
    if (ref.kind === "tool_request") {
      if (!registry.call_token || !context.tool_request) return null;
      if (typeof ref.call_token !== "string" || ref.call_token.startsWith("hcall:")) {
        return null;
      }
      if (ref.call_token !== registry.call_token.call_token) return null;
      if (
        hasExactKeys(ref, ["kind", "call_token", "component"]) &&
        (ref.component === "whole_call" ||
          ref.component === "tool_name" ||
          ref.component === "target")
      ) {
        if (ref.component === "target" && !registry.call_token.has_target) {
          return null;
        }
        refs.push({
          kind: "tool_request",
          call_handle: registry.call_token.call_handle,
          component: ref.component
        });
        continue;
      }
      if (
        hasExactKeys(ref, ["kind", "call_token", "component", "locator"]) &&
        ref.component === "arguments"
      ) {
        const tool = context.tool_request;
        const locator = validateSandboxSecurityToolLocator(ref.locator, {
          call_handle: tool.call_handle,
          call_id: tool.call_id,
          authority_kind: tool.authority_kind,
          tool_name: tool.tool_name,
          arguments: tool.arguments,
          arguments_jcs_sha256: tool.arguments_jcs_sha256,
          has_target: tool.has_target
        } as never);
        if (locator === null) return null;
        refs.push({
          kind: "tool_request",
          call_handle: registry.call_token.call_handle,
          component: "arguments",
          locator
        });
        continue;
      }
      return null;
    }
    return null;
  }
  try {
    canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  } catch {
    return null;
  }
  return refs;
}

export function normalizeSandboxSecurityExternalDetectorResult(
  value: unknown,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityNormalizedExternalDetectorResult> {
  if (!hasExactKeys(value, ["candidates", "clearances"])) {
    return invalid();
  }
  if (looksLikeLeak(value)) {
    return invalid("detector_content_leak");
  }
  if (!Array.isArray(value.candidates) || !Array.isArray(value.clearances)) {
    return invalid();
  }
  if (value.candidates.length > SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT) {
    return invalid();
  }
  if (value.clearances.length > SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT) {
    return invalid();
  }
  let encoded: number;
  try {
    encoded = Buffer.byteLength(canonicalizeSandboxSecurityJson(value), "utf8");
  } catch {
    return invalid();
  }
  if (encoded > SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES) {
    return invalid();
  }
  if (value.candidates.length === 0 && value.clearances.length === 0) {
    return { status: "no_match" };
  }

  const obligations = new Map(
    payload.routed_obligations.map((item) => [item.obligation_id, item])
  );
  const candidates: SandboxSecurityRiskCandidate[] = [];
  const clearances: SandboxSecurityCategoryClearance[] = [];
  const covered = new Set<string>();
  const candidateScopes = new Set<string>();
  const clearanceScopes = new Set<string>();

  for (const item of value.candidates) {
    if (
      !hasExactKeys(item, [
        "obligation_id",
        "category",
        "severity",
        "confidence",
        "reason_code",
        "subject_refs"
      ])
    ) {
      return invalid();
    }
    if (
      typeof item.obligation_id !== "string" ||
      !obligations.has(item.obligation_id) ||
      typeof item.category !== "string" ||
      !SANDBOX_SECURITY_RISK_CATEGORIES.includes(item.category as never) ||
      typeof item.severity !== "string" ||
      !SANDBOX_SECURITY_SEVERITIES.includes(item.severity as never) ||
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1 ||
      typeof item.reason_code !== "string" ||
      !REASON_CODES.has(item.reason_code) ||
      item.reason_code !== reasonCodeForCategory(item.category)
    ) {
      return invalid();
    }
    const obligation = obligations.get(item.obligation_id)!;
    if (obligation.category !== item.category) {
      return invalid();
    }
    const refs = mapExternalRefsToPrivate(item.subject_refs, registry);
    if (!refs) return invalid();
    const itemScope = scopeIdentityFromExternalRefs(
      item.subject_refs as SandboxSecurityExternalCandidateSubjectRef[],
      registry
    );
    const obligationScope = scopeIdentityFromExternalRefs(
      obligation.subject_refs,
      registry
    );
    if (
      !itemScope ||
      !obligationScope ||
      canonicalizeSandboxSecurityJson(itemScope) !==
        canonicalizeSandboxSecurityJson(obligationScope)
    ) {
      return invalid();
    }
    for (const scope of itemScope) {
      const key = `${item.obligation_id}:${item.category}:${scope}`;
      if (candidateScopes.has(key) || clearanceScopes.has(key)) {
        return invalid();
      }
      candidateScopes.add(key);
    }
    covered.add(item.obligation_id);
    candidates.push({
      category: item.category as SandboxSecurityRiskCategory,
      severity: item.severity as SandboxSecuritySeverity,
      confidence: item.confidence,
      reason_code: item.reason_code as SandboxSecurityReasonCode,
      subject_refs: refs
    });
  }

  for (const item of value.clearances) {
    if (
      !hasExactKeys(item, [
        "obligation_id",
        "category",
        "confidence",
        "subject_refs"
      ])
    ) {
      return invalid();
    }
    if (
      typeof item.obligation_id !== "string" ||
      !obligations.has(item.obligation_id) ||
      typeof item.category !== "string" ||
      !SANDBOX_SECURITY_RISK_CATEGORIES.includes(item.category as never) ||
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1
    ) {
      return invalid();
    }
    const obligation = obligations.get(item.obligation_id)!;
    if (obligation.category !== item.category) {
      return invalid();
    }
    const refs = mapExternalRefsToPrivate(item.subject_refs, registry);
    if (!refs) return invalid();
    const itemScope = scopeIdentityFromExternalRefs(
      item.subject_refs as SandboxSecurityExternalCandidateSubjectRef[],
      registry
    );
    const obligationScope = scopeIdentityFromExternalRefs(
      obligation.subject_refs,
      registry
    );
    if (
      !itemScope ||
      !obligationScope ||
      canonicalizeSandboxSecurityJson(itemScope) !==
        canonicalizeSandboxSecurityJson(obligationScope)
    ) {
      return invalid();
    }
    for (const scope of itemScope) {
      const key = `${item.obligation_id}:${item.category}:${scope}`;
      if (candidateScopes.has(key) || clearanceScopes.has(key)) {
        return invalid();
      }
      clearanceScopes.add(key);
    }
    covered.add(item.obligation_id);
    clearances.push({
      category: item.category as SandboxSecurityRiskCategory,
      confidence: item.confidence,
      subject_refs: refs
    });
  }

  return deepFreeze({
    status: "matched",
    result: {
      candidates,
      clearances
    },
    covered_obligation_ids: Object.freeze([...covered].sort())
  });
}
