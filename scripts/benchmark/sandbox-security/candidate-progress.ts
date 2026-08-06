import { createHash } from "node:crypto";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security.ts";
import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  normalizeSandboxSecurityBenchmarkCandidateDecisionEnvelope,
  type SandboxSecurityBenchmarkCandidateDecisionEnvelope
} from "./contracts.ts";

const INVALID = "sandbox_security_candidate_progress_invalid";
const SHA256 = /^[0-9a-f]{64}$/u;
const FIXTURE_ID = /^ssb-v1-[0-9]{4}$/u;
const MAX_STAGING_BYTES = 16 * 1024 * 1024;
const FAILURE_CODE = /^(?:sandbox_security_[a-z0-9_]+_reject|capture_bundle_reject):[a-z0-9_./:-]+$/u;
const FORBIDDEN_FIELDS = new Set([
  "OPENAI_API_KEY",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "fixture_body",
  "ground_truth_severity",
  "metric",
  "primary_category",
  "raw_body",
  "request_id",
  "sanitized_content",
  "truth",
  "verdict_class"
]);

export const SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-progress.v1" as const;

export const SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-output.v1" as const;

export const SANDBOX_SECURITY_CANDIDATE_OUTPUT_ACK_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-output-ack.v1" as const;

export type SandboxSecurityCandidateProgressStatus = "running" | "failed";

export interface SandboxSecurityCandidateProgressDocument {
  readonly schema_version:
    typeof SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION;
  readonly status: SandboxSecurityCandidateProgressStatus;
  readonly fixture_count: number;
  readonly completed_count: number;
  readonly decisions: readonly SandboxSecurityBenchmarkCandidateDecisionEnvelope[];
  readonly failure_code?: string;
}

export interface SandboxSecurityCandidateProgressFrame {
  readonly schema_version:
    typeof SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION;
  readonly event: "candidate_progress";
  readonly input_ordinal: number;
  readonly fixture_count: number;
  readonly completed_count: number;
  readonly decision: SandboxSecurityBenchmarkCandidateDecisionEnvelope;
}

export interface SandboxSecurityCandidateCompleteFrame {
  readonly schema_version:
    typeof SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION;
  readonly event: "capture_complete";
  readonly status: "capture_complete";
  readonly decision_count: number;
  readonly fixture_count: number;
  readonly candidate_package_sha256: string;
  readonly staging_serialized: string;
}

export interface SandboxSecurityCandidateOutputAcknowledgement {
  readonly schema_version:
    typeof SANDBOX_SECURITY_CANDIDATE_OUTPUT_ACK_SCHEMA_VERSION;
  readonly event: "candidate_output_persisted";
  readonly output_event: "candidate_progress" | "capture_complete";
  readonly ordinal: number;
}

export interface SandboxSecurityCandidateOutputState {
  readonly progress: Readonly<SandboxSecurityCandidateProgressDocument>;
  readonly complete_frame?: Readonly<SandboxSecurityCandidateCompleteFrame>;
}

export type SandboxSecurityCandidateOutputFrame =
  | SandboxSecurityCandidateProgressFrame
  | SandboxSecurityCandidateCompleteFrame;

function fail(code: string): never {
  throw new TypeError(`${INVALID}:${code}`);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const child = (value as Record<string | symbol, unknown>)[key as string];
    if (child !== null && typeof child === "object") {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  code: string
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    fail(code);
  }
}

function assertNoForbiddenFields(value: unknown, depth = 0): void {
  if (depth > 10 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenFields(item, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) fail("candidate_progress_raw_oracle_field");
    assertNoForbiddenFields(child, depth + 1);
  }
}

function assertFixtureIds(fixtureIds: readonly string[]): readonly string[] {
  if (!Array.isArray(fixtureIds) || fixtureIds.length === 0) {
    fail("fixture_ids_invalid");
  }
  const normalized = fixtureIds.map((fixtureId, index) => {
    if (
      typeof fixtureId !== "string" ||
      !FIXTURE_ID.test(fixtureId) ||
      fixtureId !== `ssb-v1-${String(index + 1).padStart(4, "0")}`
    ) {
      fail("fixture_ids_invalid");
    }
    return fixtureId;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail("fixture_ids_duplicate");
  }
  return normalized;
}

function assertCount(value: unknown, maximum: number, code: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    fail(code);
  }
  return value;
}

function normalizeDecision(
  value: unknown,
  expectedFixtureId: string
): SandboxSecurityBenchmarkCandidateDecisionEnvelope {
  assertNoForbiddenFields(value);
  let normalized: Readonly<SandboxSecurityBenchmarkCandidateDecisionEnvelope>;
  try {
    normalized = normalizeSandboxSecurityBenchmarkCandidateDecisionEnvelope(
      value
    );
  } catch {
    fail("candidate_progress_decision_invalid");
  }
  if (normalized.fixture_id !== expectedFixtureId) {
    fail("candidate_progress_fixture_mismatch");
  }
  if (!SHA256.test(normalized.decision_projection_sha256)) {
    fail("candidate_progress_decision_hash_invalid");
  }
  if (
    normalized.decision_projection_sha256 !==
    hashSandboxSecurityBenchmarkCanonicalJson(normalized.projection)
  ) {
    fail("candidate_progress_decision_hash_mismatch");
  }
  return deepFreeze(normalized);
}

function normalizeDecisions(
  value: unknown,
  fixtureIds: readonly string[]
): readonly SandboxSecurityBenchmarkCandidateDecisionEnvelope[] {
  if (!Array.isArray(value) || value.length > fixtureIds.length) {
    fail("candidate_progress_decisions_invalid");
  }
  return Object.freeze(
    value.map((decision, index) =>
      normalizeDecision(decision, fixtureIds[index]!)
    )
  );
}

function normalizeFailureCode(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 160 ||
    !FAILURE_CODE.test(value)
  ) {
    fail("candidate_progress_failure_code_invalid");
  }
  return value;
}

export function createSandboxSecurityCandidateProgressDocument(
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateProgressDocument> {
  const ids = assertFixtureIds(fixtureIds);
  return deepFreeze({
    schema_version: SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION,
    status: "running" as const,
    fixture_count: ids.length,
    completed_count: 0,
    decisions: Object.freeze([])
  });
}

export function buildSandboxSecurityCandidateDecisionEnvelope(
  fixtureId: string,
  decision: Readonly<SandboxSecurityDecision>
): Readonly<SandboxSecurityBenchmarkCandidateDecisionEnvelope> {
  if (typeof fixtureId !== "string" || !FIXTURE_ID.test(fixtureId)) {
    fail("fixture_id_invalid");
  }
  if (
    decision === null ||
    typeof decision !== "object" ||
    !Array.isArray(decision.findings) ||
    !Array.isArray(decision.detector_runs) ||
    !Array.isArray(decision.evidence_refs)
  ) {
    fail("candidate_progress_decision_invalid");
  }
  const projection = deepFreeze({
    schema_version: decision.schema_version,
    verdict: decision.verdict,
    action: decision.action,
    risk_level: decision.risk_level,
    finding_count: decision.findings.length,
    detector_run_count: decision.detector_runs.length,
    evidence_ref_count: decision.evidence_refs.length
  });
  const envelope = {
    schema_version: "sandbox-security-benchmark-decision-projection.v1" as const,
    fixture_id: fixtureId,
    decision_projection_sha256:
      hashSandboxSecurityBenchmarkCanonicalJson(projection),
    projection
  };
  return normalizeDecision(envelope, fixtureId);
}

export function normalizeSandboxSecurityCandidateProgressDocument(
  value: unknown,
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateProgressDocument> {
  const ids = assertFixtureIds(fixtureIds);
  if (!isPlainObject(value)) fail("candidate_progress_document_invalid");
  const status = value.status;
  const expectedKeys =
    status === "failed"
      ? [
          "schema_version",
          "status",
          "fixture_count",
          "completed_count",
          "failure_code",
          "decisions"
        ]
      : [
          "schema_version",
          "status",
          "fixture_count",
          "completed_count",
          "decisions"
        ];
  exactKeys(value, expectedKeys, "candidate_progress_document_keys_invalid");
  assertNoForbiddenFields(value);
  if (
    value.schema_version !== SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION ||
    (status !== "running" && status !== "failed")
  ) {
    fail("candidate_progress_document_schema_invalid");
  }
  const fixtureCount = assertCount(
    value.fixture_count,
    ids.length,
    "candidate_progress_fixture_count_invalid"
  );
  const completedCount = assertCount(
    value.completed_count,
    ids.length,
    "candidate_progress_completed_count_invalid"
  );
  if (fixtureCount !== ids.length) fail("candidate_progress_fixture_count_mismatch");
  const decisions = normalizeDecisions(value.decisions, ids);
  if (completedCount !== decisions.length) {
    fail("candidate_progress_completed_count_mismatch");
  }
  const normalized: SandboxSecurityCandidateProgressDocument = {
    schema_version: SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION,
    status,
    fixture_count: fixtureCount,
    completed_count: completedCount,
    decisions,
    ...(status === "failed"
      ? { failure_code: normalizeFailureCode(value.failure_code) }
      : {})
  };
  return deepFreeze(normalized);
}

export function normalizeSandboxSecurityCandidateOutputFrame(
  value: unknown,
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateOutputFrame> {
  const ids = assertFixtureIds(fixtureIds);
  if (!isPlainObject(value)) fail("candidate_progress_frame_invalid");
  if (value.event === "candidate_progress") {
    exactKeys(
      value,
      [
        "schema_version",
        "event",
        "input_ordinal",
        "fixture_count",
        "completed_count",
        "decision"
      ],
      "candidate_progress_frame_keys_invalid"
    );
    assertNoForbiddenFields(value);
    if (
      value.schema_version !==
        SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION ||
      value.event !== "candidate_progress"
    ) {
      fail("candidate_progress_frame_schema_invalid");
    }
    const ordinal = assertCount(
      value.input_ordinal,
      ids.length,
      "candidate_progress_ordinal_invalid"
    );
    const fixtureCount = assertCount(
      value.fixture_count,
      ids.length,
      "candidate_progress_fixture_count_invalid"
    );
    const completedCount = assertCount(
      value.completed_count,
      ids.length,
      "candidate_progress_completed_count_invalid"
    );
    if (
      fixtureCount !== ids.length ||
      ordinal === 0 ||
      completedCount !== ordinal
    ) {
      fail("candidate_progress_frame_count_mismatch");
    }
    const decision = normalizeDecision(value.decision, ids[ordinal - 1]!);
    return deepFreeze({
      schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
      event: "candidate_progress",
      input_ordinal: ordinal,
      fixture_count: fixtureCount,
      completed_count: completedCount,
      decision
    });
  }

  exactKeys(
    value,
    [
      "schema_version",
      "event",
      "status",
      "decision_count",
      "fixture_count",
      "candidate_package_sha256",
      "staging_serialized"
    ],
    "candidate_complete_frame_keys_invalid"
  );
  assertNoForbiddenFields(value);
  if (
    value.schema_version !==
      SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION ||
    value.event !== "capture_complete" ||
    value.status !== "capture_complete"
  ) {
    fail("candidate_complete_frame_schema_invalid");
  }
  const decisionCount = assertCount(
    value.decision_count,
    ids.length,
    "candidate_complete_decision_count_invalid"
  );
  const fixtureCount = assertCount(
    value.fixture_count,
    ids.length,
    "candidate_complete_fixture_count_invalid"
  );
  if (fixtureCount !== ids.length || decisionCount !== ids.length) {
    fail("candidate_complete_count_mismatch");
  }
  if (
    typeof value.candidate_package_sha256 !== "string" ||
    !SHA256.test(value.candidate_package_sha256)
  ) {
    fail("candidate_complete_hash_invalid");
  }
  if (
    typeof value.staging_serialized !== "string" ||
    Buffer.byteLength(value.staging_serialized, "utf8") === 0 ||
    Buffer.byteLength(value.staging_serialized, "utf8") > MAX_STAGING_BYTES
  ) {
    fail("candidate_complete_staging_invalid");
  }
  if (
    sha256Text(value.staging_serialized) !== value.candidate_package_sha256
  ) {
    fail("candidate_complete_hash_mismatch");
  }
  return deepFreeze({
    schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
    event: "capture_complete",
    status: "capture_complete",
    decision_count: decisionCount,
    fixture_count: fixtureCount,
    candidate_package_sha256: value.candidate_package_sha256,
    staging_serialized: value.staging_serialized
  });
}

export function appendSandboxSecurityCandidateOutputFrame(
  current: Readonly<SandboxSecurityCandidateOutputState>,
  frame: unknown,
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateOutputState> {
  const ids = assertFixtureIds(fixtureIds);
  if (
    current === null ||
    typeof current !== "object" ||
    Array.isArray(current) ||
    !Object.hasOwn(current, "progress")
  ) {
    fail("candidate_output_state_invalid");
  }
  if (current.complete_frame !== undefined) {
    fail("candidate_progress_after_complete");
  }
  const normalizedFrame = normalizeSandboxSecurityCandidateOutputFrame(
    frame,
    ids
  );
  if (normalizedFrame.event === "candidate_progress") {
    return deepFreeze({
      progress: appendSandboxSecurityCandidateProgress(
        current.progress,
        normalizedFrame,
        ids
      )
    });
  }
  const normalizedProgress = normalizeSandboxSecurityCandidateProgressDocument(
    current.progress,
    ids
  );
  if (normalizedProgress.completed_count !== ids.length) {
    fail("candidate_complete_before_progress");
  }
  return deepFreeze({
    progress: normalizedProgress,
    complete_frame: normalizedFrame
  });
}

export function createSandboxSecurityCandidateOutputAcknowledgement(
  frame: Readonly<SandboxSecurityCandidateOutputFrame>
): Readonly<SandboxSecurityCandidateOutputAcknowledgement> {
  const outputEvent = frame.event;
  return deepFreeze({
    schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_ACK_SCHEMA_VERSION,
    event: "candidate_output_persisted" as const,
    output_event: outputEvent,
    ordinal:
      outputEvent === "candidate_progress"
        ? frame.input_ordinal
        : frame.decision_count
  });
}

export function assertSandboxSecurityCandidateOutputAcknowledgement(
  value: unknown,
  expected: Readonly<{
    output_event: "candidate_progress" | "capture_complete";
    ordinal: number;
  }>
): void {
  exactKeys(
    value,
    ["schema_version", "event", "output_event", "ordinal"],
    "candidate_output_ack_keys_invalid"
  );
  assertNoForbiddenFields(value);
  if (
    value.schema_version !==
      SANDBOX_SECURITY_CANDIDATE_OUTPUT_ACK_SCHEMA_VERSION ||
    value.event !== "candidate_output_persisted" ||
    value.output_event !== expected.output_event ||
    value.ordinal !== expected.ordinal
  ) {
    fail("candidate_output_ack_mismatch");
  }
}

export function appendSandboxSecurityCandidateProgress(
  current: Readonly<SandboxSecurityCandidateProgressDocument>,
  frame: Readonly<SandboxSecurityCandidateProgressFrame>,
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateProgressDocument> {
  const ids = assertFixtureIds(fixtureIds);
  const normalizedCurrent = normalizeSandboxSecurityCandidateProgressDocument(
    current,
    ids
  );
  if (normalizedCurrent.status !== "running") {
    fail("candidate_progress_append_after_failure");
  }
  const normalizedFrame = normalizeSandboxSecurityCandidateOutputFrame(
    frame,
    ids
  );
  if (normalizedFrame.event !== "candidate_progress") {
    fail("candidate_progress_append_frame_invalid");
  }
  const expectedOrdinal = normalizedCurrent.completed_count + 1;
  if (
    normalizedFrame.input_ordinal !== expectedOrdinal ||
    normalizedFrame.completed_count !== expectedOrdinal
  ) {
    fail("candidate_progress_append_order_invalid");
  }
  return deepFreeze({
    schema_version: SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION,
    status: "running" as const,
    fixture_count: ids.length,
    completed_count: expectedOrdinal,
    decisions: Object.freeze([
      ...normalizedCurrent.decisions,
      normalizedFrame.decision
    ])
  });
}

export function markSandboxSecurityCandidateProgressFailed(
  current: Readonly<SandboxSecurityCandidateProgressDocument>,
  failureCode: string,
  fixtureIds: readonly string[]
): Readonly<SandboxSecurityCandidateProgressDocument> {
  const ids = assertFixtureIds(fixtureIds);
  const normalized = normalizeSandboxSecurityCandidateProgressDocument(
    current,
    ids
  );
  if (normalized.status !== "running") {
    fail("candidate_progress_failure_state_invalid");
  }
  return deepFreeze({
    schema_version: SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION,
    status: "failed" as const,
    fixture_count: normalized.fixture_count,
    completed_count: normalized.completed_count,
    failure_code: normalizeFailureCode(failureCode),
    decisions: normalized.decisions
  });
}

export function assertSandboxSecurityCandidateStagingMatchesProgress(
  stagingSerialized: string,
  progress: Readonly<SandboxSecurityCandidateProgressDocument>,
  fixtureIds: readonly string[]
): void {
  const ids = assertFixtureIds(fixtureIds);
  const normalizedProgress = normalizeSandboxSecurityCandidateProgressDocument(
    progress,
    ids
  );
  if (
    normalizedProgress.status !== "running" ||
    normalizedProgress.completed_count !== ids.length
  ) {
    fail("candidate_progress_not_complete");
  }
  if (
    typeof stagingSerialized !== "string" ||
    Buffer.byteLength(stagingSerialized, "utf8") > MAX_STAGING_BYTES
  ) {
    fail("candidate_staging_size_invalid");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stagingSerialized) as unknown;
  } catch {
    fail("candidate_staging_json_invalid");
  }
  if (!isPlainObject(raw)) fail("candidate_staging_invalid");
  exactKeys(
    raw,
    ["schema_version", "capture_manifest", "cassette", "package", "decisions"],
    "candidate_staging_keys_invalid"
  );
  if (raw.schema_version !== "sandbox-security-benchmark-candidate-staging.v2") {
    fail("candidate_staging_schema_invalid");
  }
  if (!Array.isArray(raw.decisions) || raw.decisions.length !== ids.length) {
    fail("candidate_staging_decisions_invalid");
  }
  const decisions = raw.decisions.map((decision, index) =>
    normalizeDecision(decision, ids[index]!)
  );
  if (
    hashSandboxSecurityBenchmarkCanonicalJson(decisions) !==
    hashSandboxSecurityBenchmarkCanonicalJson(normalizedProgress.decisions)
  ) {
    fail("candidate_staging_progress_mismatch");
  }
}
