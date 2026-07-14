import {
  canonicalizeSandboxSecurityJson
} from "./canonical-json.ts";
import {
  isSandboxSecurityCallHandle,
  isSandboxSecuritySourceHandle,
  type SandboxSecurityCallHandle,
  type SandboxSecuritySourceHandle
} from "./input-boundary.ts";
import {
  validateSandboxSecurityContentLocator,
  validateSandboxSecurityToolLocator
} from "./locator.ts";
import {
  canonicalizeSandboxSecurityPrivateSubjectScopes
} from "./subject-scope.ts";
import {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT,
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT,
  SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES,
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM,
  type SandboxSecurityCandidateSubjectRef,
  type SandboxSecurityCategoryClearance,
  type SandboxSecurityRiskCandidate
} from "./detector-contract.ts";
import type {
  SandboxSecurityJsonValue,
  SandboxSecurityReasonCode,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity
} from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityRawContentSubject {
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly media_type: "text/plain" | "application/json";
  readonly original_utf8_bytes: readonly number[];
  readonly value: string | SandboxSecurityJsonValue;
}

export interface SandboxSecurityRawToolSubject {
  readonly call_handle: SandboxSecurityCallHandle;
  readonly has_target: boolean;
  readonly arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecurityRawSubjectRegistry {
  readonly evaluation_nonce: string;
  readonly content_subjects: readonly SandboxSecurityRawContentSubject[];
  readonly tool_subject?: Readonly<SandboxSecurityRawToolSubject>;
}

export interface SandboxSecurityNormalizedSlotResult {
  readonly candidates: readonly SandboxSecurityRiskCandidate<SandboxSecurityCandidateSubjectRef>[];
  readonly clearances: readonly SandboxSecurityCategoryClearance<SandboxSecurityCandidateSubjectRef>[];
}

export type SandboxSecurityNormalizedDetectorResult =
  | {
      status: "matched";
      result: Readonly<SandboxSecurityNormalizedSlotResult>;
    }
  | { status: "no_match" }
  | {
      status: "invalid_result";
      error_code: "detector_result_invalid" | "detector_content_leak";
    };

const REASON_CODES = new Set(
  SANDBOX_SECURITY_RISK_CATEGORIES.map((c) => `sandbox_security_${c}`)
);

function invalid(
  code: "detector_result_invalid" | "detector_content_leak" = "detector_result_invalid"
): SandboxSecurityNormalizedDetectorResult {
  return { status: "invalid_result", error_code: code };
}

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
  keys: readonly string[]
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const own = Reflect.ownKeys(value);
  return (
    own.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    own.every((key) => typeof key === "string" && keys.includes(key))
  );
}

function contentByHandle(
  registry: Readonly<SandboxSecurityRawSubjectRegistry>
): Map<string, SandboxSecurityRawContentSubject> {
  return new Map(
    registry.content_subjects.map((subject) => [subject.source_handle, subject])
  );
}

function validateSubjectRef(
  ref: unknown,
  registry: Readonly<SandboxSecurityRawSubjectRegistry>,
  contents: Map<string, SandboxSecurityRawContentSubject>
): SandboxSecurityCandidateSubjectRef | null {
  if (!isPlainRecord(ref) || typeof ref.kind !== "string") return null;
  if (ref.kind === "content_source") {
    if (!hasExactKeys(ref, ["kind", "source_handle", "locator"])) return null;
    if (!isSandboxSecuritySourceHandle(ref.source_handle)) return null;
    if (!ref.source_handle.includes(`:${registry.evaluation_nonce}:`)) return null;
    const subject = contents.get(ref.source_handle);
    if (!subject) return null;
    const locator = validateSandboxSecurityContentLocator(ref.locator, {
      source_handle: subject.source_handle,
      source_id: "x",
      source_type: "user_input",
      media_type: subject.media_type,
      authority_kind: "simulation_observation",
      value: subject.value,
      provenance_ref: "source://x",
      original_utf8_bytes: subject.original_utf8_bytes,
      original_value_sha256: "0".repeat(64),
      comparison_value: subject.value
    } as never);
    if (locator === null) return null;
    return {
      kind: "content_source",
      source_handle: ref.source_handle,
      locator
    };
  }
  if (ref.kind !== "tool_request") return null;
  if (!registry.tool_subject) return null;
  if (!isSandboxSecurityCallHandle(ref.call_handle)) return null;
  if (!ref.call_handle.includes(`:${registry.evaluation_nonce}:`)) return null;
  if (ref.call_handle !== registry.tool_subject.call_handle) return null;
  if (
    hasExactKeys(ref, ["kind", "call_handle", "component"]) &&
    (ref.component === "whole_call" ||
      ref.component === "tool_name" ||
      ref.component === "target")
  ) {
    if (ref.component === "target" && !registry.tool_subject.has_target) {
      return null;
    }
    return {
      kind: "tool_request",
      call_handle: ref.call_handle,
      component: ref.component
    };
  }
  if (
    hasExactKeys(ref, ["kind", "call_handle", "component", "locator"]) &&
    ref.component === "arguments"
  ) {
    const locator = validateSandboxSecurityToolLocator(ref.locator, {
      call_handle: registry.tool_subject.call_handle,
      call_id: "call",
      authority_kind: "simulation_observation",
      tool_name: "tool",
      arguments: registry.tool_subject.arguments,
      arguments_jcs_sha256: "0".repeat(64),
      has_target: registry.tool_subject.has_target
    } as never);
    if (locator === null) return null;
    return {
      kind: "tool_request",
      call_handle: ref.call_handle,
      component: "arguments",
      locator
    };
  }
  return null;
}

function normalizeItemRefs(
  refsValue: unknown,
  registry: Readonly<SandboxSecurityRawSubjectRegistry>,
  contents: Map<string, SandboxSecurityRawContentSubject>
): SandboxSecurityCandidateSubjectRef[] | null {
  if (!Array.isArray(refsValue) || refsValue.length === 0) return null;
  if (refsValue.length > SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM) return null;
  const refs: SandboxSecurityCandidateSubjectRef[] = [];
  for (const ref of refsValue) {
    const normalized = validateSubjectRef(ref, registry, contents);
    if (!normalized) return null;
    refs.push(normalized);
  }
  try {
    canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  } catch {
    return null;
  }
  return refs;
}

function scopeSet(
  refs: readonly SandboxSecurityCandidateSubjectRef[]
): Set<string> {
  return new Set(
    canonicalizeSandboxSecurityPrivateSubjectScopes(refs).map((scope) =>
      canonicalizeSandboxSecurityJson(scope)
    )
  );
}

function looksLikeLeak(value: unknown): boolean {
  const text = JSON.stringify(value);
  return (
    text.includes("raw_content") ||
    text.includes("PROMPT_SECRET") ||
    text.includes("password=")
  );
}

export function normalizeSandboxSecurityRawDetectorResult(
  value: unknown,
  registry: Readonly<SandboxSecurityRawSubjectRegistry>
): Readonly<SandboxSecurityNormalizedDetectorResult> {
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

  const encoded = Buffer.byteLength(
    canonicalizeSandboxSecurityJson(value),
    "utf8"
  );
  if (encoded > SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES) {
    return invalid();
  }

  if (value.candidates.length === 0 && value.clearances.length === 0) {
    return { status: "no_match" };
  }

  const contents = contentByHandle(registry);
  const candidates: SandboxSecurityRiskCandidate[] = [];
  const clearances: SandboxSecurityCategoryClearance[] = [];
  const candidateScopes = new Set<string>();
  const clearanceScopes = new Set<string>();

  for (const item of value.candidates) {
    if (
      !hasExactKeys(item, [
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
      typeof item.category !== "string" ||
      !SANDBOX_SECURITY_RISK_CATEGORIES.includes(item.category as never) ||
      typeof item.severity !== "string" ||
      !SANDBOX_SECURITY_SEVERITIES.includes(item.severity as never) ||
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1 ||
      typeof item.reason_code !== "string" ||
      !REASON_CODES.has(item.reason_code)
    ) {
      return invalid();
    }
    const refs = normalizeItemRefs(item.subject_refs, registry, contents);
    if (!refs) return invalid();
    for (const scope of scopeSet(refs)) {
      if (candidateScopes.has(scope) || clearanceScopes.has(scope)) {
        // conflict checked later for clearance; duplicate across candidates ok? same scope candidate+clearance invalid
      }
      candidateScopes.add(`${item.category}:${scope}`);
    }
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
      !hasExactKeys(item, ["category", "confidence", "subject_refs"])
    ) {
      return invalid();
    }
    if (
      typeof item.category !== "string" ||
      !SANDBOX_SECURITY_RISK_CATEGORIES.includes(item.category as never) ||
      typeof item.confidence !== "number" ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1
    ) {
      return invalid();
    }
    const refs = normalizeItemRefs(item.subject_refs, registry, contents);
    if (!refs) return invalid();
    for (const scope of scopeSet(refs)) {
      const key = `${item.category}:${scope}`;
      if (candidateScopes.has(key)) {
        return invalid();
      }
      clearanceScopes.add(key);
    }
    clearances.push({
      category: item.category as SandboxSecurityRiskCategory,
      confidence: item.confidence,
      subject_refs: refs
    });
  }

  return {
    status: "matched",
    result: {
      candidates,
      clearances
    }
  };
}
