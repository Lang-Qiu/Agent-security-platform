import { types as utilTypes } from "node:util";

export const SANDBOX_SECURITY_P6_LIVE_ENVIRONMENT_KEYS = Object.freeze([
  "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
  "SANDBOX_SECURITY_JUDGE_PROTOCOL",
  "SANDBOX_SECURITY_JUDGE_BASE_URL",
  "SANDBOX_SECURITY_JUDGE_MODEL",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "SANDBOX_SECURITY_ENABLE_JUDGE"
] as const);

export const SANDBOX_SECURITY_STAGE_MAX_STDOUT_BYTES = 4096;
export const SANDBOX_SECURITY_STAGE_MAX_FAILURE_STDERR_BYTES = 512;

export type SandboxSecurityStageStatus =
  | "prepare_complete"
  | "capture_complete"
  | "evaluation_accepted"
  | "seal_complete";

export interface SandboxSecurityStageJsonObject {
  readonly [key: string]: SandboxSecurityStageJsonValue;
}

export type SandboxSecurityStageJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SandboxSecurityStageJsonValue[]
  | SandboxSecurityStageJsonObject;

export interface SandboxSecurityStageResult {
  readonly status: SandboxSecurityStageStatus;
  readonly frame: SandboxSecurityStageJsonObject;
}

export interface SandboxSecurityPrepareStageSummary {
  readonly status: "prepare_complete";
  readonly bundle_descriptor_sha256: string;
  readonly inputs_tree_sha256: string;
  readonly code_tree_sha256: string;
  readonly fixture_count: 300;
}

export interface SandboxSecurityCaptureStageSummary {
  readonly status: "capture_complete";
  readonly issued_binding: SandboxSecurityStageJsonObject;
}

export interface SandboxSecurityEvaluateStageSummary {
  readonly status: "evaluation_accepted";
  readonly issued_binding: SandboxSecurityStageJsonObject;
}

export interface SandboxSecuritySealStageSummary {
  readonly status: "seal_complete";
  readonly seal_sha256: string;
  readonly capture_manifest_sha256: string;
  readonly replay_tree_sha256: string;
  readonly replay_count: 300;
}

const INVALID = "sandbox_security_stage_reject";
const STAGE_RESULT_KEYS = Object.freeze([
  "exit_code",
  "stdout",
  "stderr"
] as const);
const STAGE_STATUSES = Object.freeze([
  "prepare_complete",
  "capture_complete",
  "evaluation_accepted",
  "seal_complete"
] as const);
const PREPARE_SUMMARY_KEYS = Object.freeze([
  "status",
  "bundle_descriptor_sha256",
  "inputs_tree_sha256",
  "code_tree_sha256",
  "fixture_count"
] as const);
const CAPTURE_SUMMARY_KEYS = Object.freeze(["status", "issued_binding"] as const);
const EVALUATE_SUMMARY_KEYS = Object.freeze([
  "status",
  "issued_binding"
] as const);
const SEAL_SUMMARY_KEYS = Object.freeze([
  "status",
  "seal_sha256",
  "capture_manifest_sha256",
  "replay_tree_sha256",
  "replay_count"
] as const);
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const MAX_JSON_DEPTH = 32;
const MAX_JSON_NODES = 4096;
const FORBIDDEN_RECORD_KEYS = Object.freeze([
  "__proto__",
  "prototype",
  "constructor"
] as const);
const SAFE_STAGE_ERROR_CODE =
  /^(?:sandbox_security_[a-z_]+_(?:reject|invalid)|capture_bundle_(?:invalid|reject)|corpus_validation_failed):[a-z0-9_]+(?::[a-z0-9_./:,-]+)?$/u;
const GENERIC_STAGE_FAILURE =
  "sandbox_security_stage_reject:stage_exit_invalid";

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function isWellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

interface DataRecordSnapshot {
  readonly keys: readonly string[];
  readonly values: ReadonlyMap<string, unknown>;
}

function snapshotDataRecord(
  value: unknown,
  code: string,
  exactKeys: readonly string[]
): DataRecordSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) fail(code);
  const keys = ownKeys as string[];
  if (
    keys.length !== exactKeys.length ||
    exactKeys.some((key) => !keys.includes(key))
  ) {
    fail(code);
  }

  const values = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail(code);
    }
    values.set(key, descriptor.value);
  }
  return Object.freeze({ keys: Object.freeze([...keys]), values });
}

interface JsonNormalizationState {
  nodes: number;
}

function normalizeParsedJsonValue(
  value: unknown,
  state: JsonNormalizationState,
  depth: number
): SandboxSecurityStageJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    fail("stage_stdout_invalid");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!isWellFormed(value)) fail("stage_stdout_invalid");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("stage_stdout_invalid");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") fail("stage_stdout_invalid");
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => normalizeParsedJsonValue(item, state, depth + 1))
    );
  }

  const output: Record<string, SandboxSecurityStageJsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    if (
      (FORBIDDEN_RECORD_KEYS as readonly string[]).includes(key) ||
      !isWellFormed(key)
    ) {
      fail("stage_stdout_invalid");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail("stage_stdout_invalid");
    }
    output[key] = normalizeParsedJsonValue(descriptor.value, state, depth + 1);
  }
  return Object.freeze(output);
}

function isStageStatus(value: unknown): value is SandboxSecurityStageStatus {
  return (
    typeof value === "string" &&
    (STAGE_STATUSES as readonly string[]).includes(value)
  );
}

export function parseSandboxSecurityStageResult(
  input: unknown
): SandboxSecurityStageResult {
  const record = snapshotDataRecord(input, "input_invalid", STAGE_RESULT_KEYS);
  const exitCode = record.values.get("exit_code");
  if (typeof exitCode !== "number" || !Number.isSafeInteger(exitCode)) {
    fail("stage_exit_invalid");
  }
  if (exitCode !== 0) fail("stage_exit_invalid");

  const stderr = record.values.get("stderr");
  if (typeof stderr !== "string") fail("stage_stderr_invalid");
  if (stderr.length !== 0) fail("stage_stderr_invalid");

  const stdout = record.values.get("stdout");
  if (typeof stdout !== "string" || !isWellFormed(stdout)) {
    fail("stage_stdout_invalid");
  }
  if (
    Buffer.byteLength(stdout, "utf8") > SANDBOX_SECURITY_STAGE_MAX_STDOUT_BYTES
  ) {
    fail("stage_stdout_invalid");
  }
  if (stdout.length < 2 || !stdout.endsWith("\n")) {
    fail("stage_stdout_invalid");
  }
  if (stdout.indexOf("\n") !== stdout.length - 1) {
    fail("stage_stdout_invalid");
  }
  const line = stdout.slice(0, -1);
  for (let index = 0; index < line.length; index += 1) {
    if (line.charCodeAt(index) < 0x20) fail("stage_stdout_invalid");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    fail("stage_stdout_invalid");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    fail("stage_stdout_invalid");
  }
  const frame = normalizeParsedJsonValue(parsed, { nodes: 0 }, 0);
  if (
    frame === null ||
    typeof frame !== "object" ||
    Array.isArray(frame)
  ) {
    fail("stage_stdout_invalid");
  }
  const frameRecord = frame as SandboxSecurityStageJsonObject;
  const status = frameRecord.status;
  if (!isStageStatus(status)) fail("stage_status_invalid");

  return Object.freeze({ status, frame: frameRecord });
}

/**
 * Classifies a failed worker frame without reflecting arbitrary stderr. Only a
 * single bounded JSON line containing exactly one source-controlled error_code
 * is admitted; every other shape collapses to the generic stage failure.
 */
export function classifySandboxSecurityFailedStage(input: unknown): string {
  try {
    const record = snapshotDataRecord(input, "input_invalid", STAGE_RESULT_KEYS);
    const exitCode = record.values.get("exit_code");
    const stdout = record.values.get("stdout");
    const stderr = record.values.get("stderr");
    if (
      typeof exitCode !== "number" ||
      !Number.isSafeInteger(exitCode) ||
      exitCode === 0 ||
      stdout !== "" ||
      typeof stderr !== "string" ||
      !isWellFormed(stderr) ||
      Buffer.byteLength(stderr, "utf8") >
        SANDBOX_SECURITY_STAGE_MAX_FAILURE_STDERR_BYTES ||
      stderr.length < 3 ||
      !stderr.endsWith("\n") ||
      stderr.indexOf("\n") !== stderr.length - 1
    ) {
      return GENERIC_STAGE_FAILURE;
    }

    const parsed = JSON.parse(stderr.slice(0, -1)) as unknown;
    const errorRecord = snapshotDataRecord(
      parsed,
      "failure_frame_invalid",
      ["error_code"]
    );
    const errorCode = errorRecord.values.get("error_code");
    if (
      typeof errorCode !== "string" ||
      errorCode.length > 200 ||
      !SAFE_STAGE_ERROR_CODE.test(errorCode)
    ) {
      return GENERIC_STAGE_FAILURE;
    }
    return errorCode;
  } catch {
    return GENERIC_STAGE_FAILURE;
  }
}

function requireExactSummaryKeys(
  frame: SandboxSecurityStageJsonObject,
  exactKeys: readonly string[]
): void {
  const keys = Object.keys(frame);
  if (
    keys.length !== exactKeys.length ||
    exactKeys.some((key) => !keys.includes(key))
  ) {
    fail("stage_summary_invalid");
  }
}

function requireSummarySha256(value: SandboxSecurityStageJsonValue): string {
  if (typeof value !== "string" || !SHA256_HEX.test(value)) {
    fail("stage_summary_invalid");
  }
  return value;
}

function isStageJsonArray(
  value: SandboxSecurityStageJsonValue
): value is readonly SandboxSecurityStageJsonValue[] {
  return Array.isArray(value);
}

function requireSummaryBindingObject(
  value: SandboxSecurityStageJsonValue
): SandboxSecurityStageJsonObject {
  if (
    value === null ||
    typeof value !== "object" ||
    isStageJsonArray(value)
  ) {
    fail("stage_summary_invalid");
  }
  return value;
}

function parseStageWithStatus(
  input: unknown,
  status: SandboxSecurityStageStatus
): SandboxSecurityStageJsonObject {
  const result = parseSandboxSecurityStageResult(input);
  if (result.status !== status) fail("stage_status_invalid");
  return result.frame;
}

export function parseSandboxSecurityPrepareStageSummary(
  input: unknown
): SandboxSecurityPrepareStageSummary {
  const frame = parseStageWithStatus(input, "prepare_complete");
  requireExactSummaryKeys(frame, PREPARE_SUMMARY_KEYS);
  const summary: SandboxSecurityPrepareStageSummary = Object.freeze({
    status: "prepare_complete" as const,
    bundle_descriptor_sha256: requireSummarySha256(
      frame.bundle_descriptor_sha256!
    ),
    inputs_tree_sha256: requireSummarySha256(frame.inputs_tree_sha256!),
    code_tree_sha256: requireSummarySha256(frame.code_tree_sha256!),
    fixture_count: 300 as const
  });
  if (frame.fixture_count !== 300) fail("stage_summary_invalid");
  return summary;
}

export function parseSandboxSecurityCaptureStageSummary(
  input: unknown
): SandboxSecurityCaptureStageSummary {
  const frame = parseStageWithStatus(input, "capture_complete");
  requireExactSummaryKeys(frame, CAPTURE_SUMMARY_KEYS);
  return Object.freeze({
    status: "capture_complete" as const,
    issued_binding: requireSummaryBindingObject(frame.issued_binding!)
  });
}

export function parseSandboxSecurityEvaluateStageSummary(
  input: unknown
): SandboxSecurityEvaluateStageSummary {
  const frame = parseStageWithStatus(input, "evaluation_accepted");
  requireExactSummaryKeys(frame, EVALUATE_SUMMARY_KEYS);
  return Object.freeze({
    status: "evaluation_accepted" as const,
    issued_binding: requireSummaryBindingObject(frame.issued_binding!)
  });
}

export function parseSandboxSecuritySealStageSummary(
  input: unknown
): SandboxSecuritySealStageSummary {
  const frame = parseStageWithStatus(input, "seal_complete");
  requireExactSummaryKeys(frame, SEAL_SUMMARY_KEYS);
  const summary: SandboxSecuritySealStageSummary = Object.freeze({
    status: "seal_complete" as const,
    seal_sha256: requireSummarySha256(frame.seal_sha256!),
    capture_manifest_sha256: requireSummarySha256(
      frame.capture_manifest_sha256!
    ),
    replay_tree_sha256: requireSummarySha256(frame.replay_tree_sha256!),
    replay_count: 300 as const
  });
  if (frame.replay_count !== 300) fail("stage_summary_invalid");
  return summary;
}

function buildClosedWorkerEnvironment(
  forbidden: readonly unknown[]
): Readonly<Record<string, string>> {
  if (forbidden.length > 0) fail("environment_arguments_forbidden");
  return Object.freeze({ NODE_NO_WARNINGS: "1" });
}

export function createSandboxSecurityPrepareWorkerEnvironment(
  ...forbidden: readonly never[]
): Readonly<Record<string, string>> {
  return buildClosedWorkerEnvironment(forbidden);
}

export function createSandboxSecurityCaptureWorkerEnvironment(
  ...forbidden: readonly never[]
): Readonly<Record<string, string>> {
  return buildClosedWorkerEnvironment(forbidden);
}

export function createSandboxSecurityEvaluateWorkerEnvironment(
  ...forbidden: readonly never[]
): Readonly<Record<string, string>> {
  return buildClosedWorkerEnvironment(forbidden);
}

export function createSandboxSecuritySealWorkerEnvironment(
  ...forbidden: readonly never[]
): Readonly<Record<string, string>> {
  return buildClosedWorkerEnvironment(forbidden);
}

export function assertSandboxSecurityLiveEnvironmentAbsent(
  ...forbidden: readonly never[]
): void {
  if (forbidden.length > 0) fail("environment_arguments_forbidden");
  for (const key of SANDBOX_SECURITY_P6_LIVE_ENVIRONMENT_KEYS) {
    if (process.env[key] !== undefined) fail("live_environment_present");
  }
}
