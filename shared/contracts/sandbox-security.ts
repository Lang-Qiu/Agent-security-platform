import {
  SANDBOX_SECURITY_ACTIONS,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_RISK_CATEGORIES,
  SANDBOX_SECURITY_SEVERITIES,
  SANDBOX_SECURITY_STAGES,
  SANDBOX_SECURITY_VERDICTS,
  type SandboxDetectorRun,
  type SandboxDetectorRunErrorCode,
  type SandboxDetectorRunObligation,
  type SandboxDetectorSkipReason,
  type SandboxSecurityContentLocator,
  type SandboxSecurityDecision,
  type SandboxSecurityFinding,
  type SandboxSecurityFindingSubjectRef,
  type SandboxSecurityReasonCode,
  type SandboxSecurityToolLocator
} from "../types/sandbox-security.ts";
import { isStrictIso8601 } from "../utils/guards.ts";

export { normalizeSandboxSecurityRequest } from "./sandbox-security-request.ts";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FINDING_ID_PATTERN = /^finding:sha256:[a-f0-9]{64}$/;
const DETECTOR_ID_PATTERN =
  /^detector:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){1,7}$/;
const DETECTOR_VERSION_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/;
const SOURCE_TOKEN_PATTERN =
  /^source:\/\/sandbox\/security\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/[0-9]{4}$/;
const CALL_TOKEN_PATTERN =
  /^call:\/\/sandbox\/security\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/[0-9]{4}$/;
const EVIDENCE_REF_PATTERN =
  /^evidence:\/\/sandbox\/security\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/(?:[0-9]{4}|engine-0001)$/;
const POINTER_TOKEN_CHARACTER_PATTERN = /^[A-Za-z0-9_.-]$/;
const POINTER_DECODED_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

const REASON_CODES = new Set<string>(
  SANDBOX_SECURITY_RISK_CATEGORIES.map(
    (category) => `sandbox_security_${category}`
  )
);
const DETECTOR_KINDS = ["rule", "local_model", "external_judge"] as const;
const RUN_OBLIGATIONS = [
  "profile_required",
  "runtime_required",
  "optional_not_selected"
] as const;
const RUN_STATUSES = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;
const SKIP_REASONS = [
  "optional_not_configured",
  "optional_not_selected",
  "routing_not_selected",
  "risk_short_circuit",
  "evaluation_terminated"
] as const;
const RUN_ERROR_CODES = [
  "detector_unavailable",
  "detector_failed",
  "detector_timeout",
  "detector_result_invalid",
  "detector_content_leak",
  "external_redaction_failed",
  "adapter_unsupported"
] as const;
const EVALUATION_MODES = ["simulation", "enforcement"] as const;
const RISK_LEVELS = ["info", ...SANDBOX_SECURITY_SEVERITIES] as const;

type PlainRecord = Record<string, unknown>;

function isOwnEnumerableDataRecord(value: unknown): value is PlainRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    return false;
  }

  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function hasExactOwnDataProperties(
  value: unknown,
  requiredKeys: readonly string[]
): value is PlainRecord {
  if (!isOwnEnumerableDataRecord(value)) {
    return false;
  }

  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === requiredKeys.length &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isDenseOrdinaryArray(
  value: unknown,
  minLength = 0,
  maxLength = Number.POSITIVE_INFINITY
): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }

  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < minLength ||
    lengthDescriptor.value > maxLength
  ) {
    return false;
  }

  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return false;
    }
  }

  return ownKeys.every((key) => {
    if (key === "length") {
      return true;
    }
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) {
      return false;
    }
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < length;
  });
}

function getArrayElement(value: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function isCatalogValue<const TCatalog extends readonly string[]>(
  catalog: TCatalog,
  value: unknown
): value is TCatalog[number] {
  return typeof value === "string" && catalog.includes(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    IDENTIFIER_PATTERN.test(value)
  );
}

function isFindingId(value: unknown): value is string {
  return typeof value === "string" && FINDING_ID_PATTERN.test(value);
}

function isDetectorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 128 &&
    DETECTOR_ID_PATTERN.test(value)
  );
}

function isDetectorVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    DETECTOR_VERSION_PATTERN.test(value)
  );
}

function isSourceToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    SOURCE_TOKEN_PATTERN.test(value)
  );
}

function isCallToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    CALL_TOKEN_PATTERN.test(value)
  );
}

function isEvidenceRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    EVIDENCE_REF_PATTERN.test(value)
  );
}

function isRestrictedJsonPointer(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > 512 ||
    !value.startsWith("/")
  ) {
    return false;
  }

  const tokens = value.slice(1).split("/");
  if (tokens.length === 0 || tokens.some((token) => token.length === 0)) {
    return false;
  }

  for (const token of tokens) {
    let decoded = "";
    let units = 0;
    for (let index = 0; index < token.length; index += 1) {
      const character = token[index];
      if (character === "~") {
        const escaped = token[index + 1];
        if (escaped !== "0" && escaped !== "1") {
          return false;
        }
        decoded += escaped === "0" ? "~" : "/";
        index += 1;
      } else {
        if (!POINTER_TOKEN_CHARACTER_PATTERN.test(character)) {
          return false;
        }
        decoded += character;
      }
      units += 1;
    }

    if (
      units < 1 ||
      units > 64 ||
      !POINTER_DECODED_TOKEN_PATTERN.test(decoded) ||
      (/^[0-9]+$/.test(decoded) && decoded.length > 1 && decoded.startsWith("0"))
    ) {
      return false;
    }
  }

  return true;
}

function normalizeContentLocator(
  value: unknown
): SandboxSecurityContentLocator | null {
  if (!isOwnEnumerableDataRecord(value)) {
    return null;
  }

  if (value.kind === "whole_source") {
    return hasExactOwnDataProperties(value, ["kind"])
      ? { kind: "whole_source" }
      : null;
  }
  if (value.kind === "text_byte_range") {
    if (
      !hasExactOwnDataProperties(value, ["kind", "start_byte", "end_byte"]) ||
      !Number.isInteger(value.start_byte) ||
      !Number.isInteger(value.end_byte) ||
      (value.start_byte as number) < 0 ||
      (value.end_byte as number) <= (value.start_byte as number)
    ) {
      return null;
    }
    return {
      kind: "text_byte_range",
      start_byte: value.start_byte as number,
      end_byte: value.end_byte as number
    };
  }
  if (value.kind === "json_pointer") {
    return hasExactOwnDataProperties(value, ["kind", "pointer"]) &&
      isRestrictedJsonPointer(value.pointer)
      ? { kind: "json_pointer", pointer: value.pointer }
      : null;
  }
  return null;
}

function normalizeToolLocator(value: unknown): SandboxSecurityToolLocator | null {
  if (!isOwnEnumerableDataRecord(value)) {
    return null;
  }
  if (value.kind === "whole_arguments") {
    return hasExactOwnDataProperties(value, ["kind"])
      ? { kind: "whole_arguments" }
      : null;
  }
  if (value.kind === "json_pointer") {
    return hasExactOwnDataProperties(value, ["kind", "pointer"]) &&
      isRestrictedJsonPointer(value.pointer)
      ? { kind: "json_pointer", pointer: value.pointer }
      : null;
  }
  return null;
}

function normalizeFindingSubjectRef(
  value: unknown
): SandboxSecurityFindingSubjectRef | null {
  if (!isOwnEnumerableDataRecord(value)) {
    return null;
  }

  if (value.kind === "content_source") {
    if (
      !hasExactOwnDataProperties(value, ["kind", "source_token", "locator"]) ||
      !isSourceToken(value.source_token)
    ) {
      return null;
    }
    const locator = normalizeContentLocator(value.locator);
    return locator === null
      ? null
      : { kind: "content_source", source_token: value.source_token, locator };
  }

  if (value.kind !== "tool_request" || !isCallToken(value.call_token)) {
    return null;
  }
  if (value.component === "arguments") {
    if (
      !hasExactOwnDataProperties(value, [
        "kind",
        "call_token",
        "component",
        "locator"
      ])
    ) {
      return null;
    }
    const locator = normalizeToolLocator(value.locator);
    return locator === null
      ? null
      : {
          kind: "tool_request",
          call_token: value.call_token,
          component: "arguments",
          locator
        };
  }
  if (
    value.component !== "whole_call" &&
    value.component !== "tool_name" &&
    value.component !== "target"
  ) {
    return null;
  }
  return hasExactOwnDataProperties(value, ["kind", "call_token", "component"])
    ? {
        kind: "tool_request",
        call_token: value.call_token,
        component: value.component
      }
    : null;
}

function contentLocatorKey(locator: SandboxSecurityContentLocator): string {
  if (locator.kind === "whole_source") {
    return "whole_source";
  }
  if (locator.kind === "text_byte_range") {
    return `text_byte_range:${locator.start_byte}:${locator.end_byte}`;
  }
  return `json_pointer:${locator.pointer}`;
}

function toolLocatorKey(locator: SandboxSecurityToolLocator): string {
  return locator.kind === "whole_arguments"
    ? "whole_arguments"
    : `json_pointer:${locator.pointer}`;
}

function findingSubjectKey(subject: SandboxSecurityFindingSubjectRef): string {
  if (subject.kind === "content_source") {
    return `content:${subject.source_token}:${contentLocatorKey(subject.locator)}`;
  }
  if (subject.component === "arguments") {
    return `tool:${subject.call_token}:arguments:${toolLocatorKey(subject.locator)}`;
  }
  return `tool:${subject.call_token}:${subject.component}`;
}

function normalizeSubjectRefs(
  value: unknown
): SandboxSecurityFindingSubjectRef[] | null {
  if (!isDenseOrdinaryArray(value, 1, 8)) {
    return null;
  }

  const result: SandboxSecurityFindingSubjectRef[] = [];
  const keys = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const subject = normalizeFindingSubjectRef(getArrayElement(value, index));
    if (subject === null) {
      return null;
    }
    const key = findingSubjectKey(subject);
    if (keys.has(key)) {
      return null;
    }
    keys.add(key);
    result.push(subject);
  }
  return result;
}

function normalizeUniqueStrings(
  value: unknown,
  validator: (entry: unknown) => entry is string
): string[] | null {
  if (!isDenseOrdinaryArray(value)) {
    return null;
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = getArrayElement(value, index);
    if (!validator(entry) || seen.has(entry)) {
      return null;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function normalizeFinding(value: unknown): SandboxSecurityFinding | null {
  if (
    !hasExactOwnDataProperties(value, [
      "finding_id",
      "detector_id",
      "detector_version",
      "category",
      "severity",
      "confidence",
      "reason_code",
      "subject_refs",
      "evidence_refs"
    ]) ||
    !isFindingId(value.finding_id) ||
    !isDetectorId(value.detector_id) ||
    !isDetectorVersion(value.detector_version) ||
    !isCatalogValue(SANDBOX_SECURITY_RISK_CATEGORIES, value.category) ||
    !isCatalogValue(SANDBOX_SECURITY_SEVERITIES, value.severity) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.reason_code !== "string" ||
    !REASON_CODES.has(value.reason_code)
  ) {
    return null;
  }

  const subjectRefs = normalizeSubjectRefs(value.subject_refs);
  const evidenceRefs = normalizeUniqueStrings(value.evidence_refs, isEvidenceRef);
  if (subjectRefs === null || evidenceRefs === null) {
    return null;
  }

  return {
    finding_id: value.finding_id,
    detector_id: value.detector_id,
    detector_version: value.detector_version,
    category: value.category,
    severity: value.severity,
    confidence: value.confidence,
    reason_code: value.reason_code as SandboxSecurityReasonCode,
    subject_refs: subjectRefs,
    evidence_refs: evidenceRefs
  };
}

export function normalizeSandboxSecurityFinding(
  value: unknown
): SandboxSecurityFinding | null {
  try {
    return normalizeFinding(value);
  } catch {
    return null;
  }
}

function normalizeRun(value: unknown): SandboxDetectorRun | null {
  if (!isOwnEnumerableDataRecord(value) || !isCatalogValue(RUN_STATUSES, value.status)) {
    return null;
  }

  const baseKeys = [
    "detector_id",
    "detector_version",
    "detector_kind",
    "obligation",
    "elapsed_ms",
    "status"
  ];
  const branchKey =
    value.status === "matched" || value.status === "no_match"
      ? "finding_ids"
      : value.status === "skipped"
        ? "skip_reason"
        : "error_code";

  if (
    !hasExactOwnDataProperties(value, [...baseKeys, branchKey]) ||
    !isDetectorId(value.detector_id) ||
    !isDetectorVersion(value.detector_version) ||
    !isCatalogValue(DETECTOR_KINDS, value.detector_kind) ||
    !isCatalogValue(RUN_OBLIGATIONS, value.obligation) ||
    typeof value.elapsed_ms !== "number" ||
    !Number.isFinite(value.elapsed_ms) ||
    value.elapsed_ms < 0
  ) {
    return null;
  }

  const base = {
    detector_id: value.detector_id,
    detector_version: value.detector_version,
    detector_kind: value.detector_kind,
    obligation: value.obligation as SandboxDetectorRunObligation,
    elapsed_ms: value.elapsed_ms
  };

  if (value.status === "matched" || value.status === "no_match") {
    const findingIds = normalizeUniqueStrings(value.finding_ids, isFindingId);
    return findingIds === null
      ? null
      : { ...base, status: value.status, finding_ids: findingIds };
  }
  if (value.status === "skipped") {
    return isCatalogValue(SKIP_REASONS, value.skip_reason)
      ? {
          ...base,
          status: "skipped",
          skip_reason: value.skip_reason as SandboxDetectorSkipReason
        }
      : null;
  }
  return isCatalogValue(RUN_ERROR_CODES, value.error_code)
    ? {
        ...base,
        status: value.status,
        error_code: value.error_code as SandboxDetectorRunErrorCode
      }
    : null;
}

export function normalizeSandboxDetectorRun(
  value: unknown
): SandboxDetectorRun | null {
  try {
    return normalizeRun(value);
  } catch {
    return null;
  }
}

function normalizeFindings(value: unknown): SandboxSecurityFinding[] | null {
  if (!isDenseOrdinaryArray(value)) {
    return null;
  }

  const result: SandboxSecurityFinding[] = [];
  const findingIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const finding = normalizeFinding(getArrayElement(value, index));
    if (finding === null || findingIds.has(finding.finding_id)) {
      return null;
    }
    findingIds.add(finding.finding_id);
    result.push(finding);
  }
  return result;
}

function normalizeRuns(value: unknown): SandboxDetectorRun[] | null {
  if (!isDenseOrdinaryArray(value)) {
    return null;
  }

  const result: SandboxDetectorRun[] = [];
  const detectorIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const run = normalizeRun(getArrayElement(value, index));
    if (run === null || detectorIds.has(run.detector_id)) {
      return null;
    }
    detectorIds.add(run.detector_id);
    result.push(run);
  }
  return result;
}

function normalizeDecision(value: unknown): SandboxSecurityDecision | null {
  if (
    !hasExactOwnDataProperties(value, [
      "schema_version",
      "decision_id",
      "request_id",
      "evaluation_mode",
      "stage",
      "policy_profile_id",
      "verdict",
      "action",
      "risk_level",
      "findings",
      "detector_runs",
      "evidence_refs",
      "created_at"
    ]) ||
    value.schema_version !== "sandbox-security-decision.v1" ||
    !isIdentifier(value.decision_id) ||
    !isIdentifier(value.request_id) ||
    !isCatalogValue(EVALUATION_MODES, value.evaluation_mode) ||
    !isCatalogValue(SANDBOX_SECURITY_STAGES, value.stage) ||
    !isCatalogValue(
      SANDBOX_SECURITY_POLICY_PROFILE_IDS,
      value.policy_profile_id
    ) ||
    !isCatalogValue(SANDBOX_SECURITY_VERDICTS, value.verdict) ||
    !isCatalogValue(SANDBOX_SECURITY_ACTIONS, value.action) ||
    !isCatalogValue(RISK_LEVELS, value.risk_level) ||
    !isStrictIso8601(value.created_at)
  ) {
    return null;
  }

  const findings = normalizeFindings(value.findings);
  const detectorRuns = normalizeRuns(value.detector_runs);
  const evidenceRefs = normalizeUniqueStrings(value.evidence_refs, isEvidenceRef);
  if (findings === null || detectorRuns === null || evidenceRefs === null) {
    return null;
  }

  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: value.decision_id,
    request_id: value.request_id,
    evaluation_mode: value.evaluation_mode,
    stage: value.stage,
    policy_profile_id: value.policy_profile_id,
    verdict: value.verdict,
    action: value.action,
    risk_level: value.risk_level,
    findings,
    detector_runs: detectorRuns,
    evidence_refs: evidenceRefs,
    created_at: value.created_at
  };
}

export function normalizeSandboxSecurityDecision(
  value: unknown
): SandboxSecurityDecision | null {
  try {
    return normalizeDecision(value);
  } catch {
    return null;
  }
}
