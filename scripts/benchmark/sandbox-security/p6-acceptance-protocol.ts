import {
  KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify
} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeSync
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { types as utilTypes } from "node:util";

export const SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION =
  "sandbox-security-p6-acceptance-receipt.v1" as const;
export const SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256 =
  "8wkE8E-myTau0xBFFnugrbS-CKmlq_a-XuvUGhcWL48" as const;
export const SANDBOX_SECURITY_P6_ACCEPTANCE_MAX_BINDING_BYTES = 4096;

export type SandboxSecurityP6AcceptanceIssuer = "capture" | "evaluation";

export interface SandboxSecurityP6AcceptanceJsonObject {
  readonly [key: string]: SandboxSecurityP6AcceptanceJsonValue;
}

export type SandboxSecurityP6AcceptanceJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SandboxSecurityP6AcceptanceJsonValue[]
  | SandboxSecurityP6AcceptanceJsonObject;

export interface SandboxSecurityP6AcceptanceExecutionProfile
  extends SandboxSecurityP6AcceptanceJsonObject {
  readonly execution_profile_id: "p6_local_hardware_compatibility_v8";
  readonly readiness_timeout_ms: 40000;
  readonly qualification_timeout_ms: 40000;
  readonly local_detector_slot_timeout_ms: 60000;
  readonly judge_detector_slot_timeout_ms: 300000;
  readonly normal_work_budget_ms: 360000;
}

export interface SandboxSecurityP6AcceptanceJudgeBinding
  extends SandboxSecurityP6AcceptanceJsonObject {
  readonly judge_protocol_id:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1";
  readonly judge_endpoint_policy_id: "operator_https_fqdn_v1";
  readonly judge_base_url_sha256: string;
  readonly judge_endpoint_url_sha256: string;
  readonly judge_requested_model_id: string;
  readonly judge_requested_model_sha256: string;
  readonly judge_resolved_model_id: string;
  readonly judge_resolved_model_sha256: string;
  readonly judge_binding_sha256: string;
}

export interface SandboxSecurityP6AcceptanceCaptureBinding
  extends SandboxSecurityP6AcceptanceJsonObject {
  readonly bundle_descriptor_sha256: string;
  readonly inputs_tree_sha256: string;
  readonly code_tree_sha256: string;
  readonly candidate_package_sha256: string;
  readonly candidate_tree_sha256: string;
  readonly decisions_tree_sha256: string;
  readonly cassette_tree_sha256: string;
  readonly fixture_count: 300;
  readonly execution_profile: SandboxSecurityP6AcceptanceExecutionProfile;
  readonly judge_binding: SandboxSecurityP6AcceptanceJudgeBinding;
}

export interface SandboxSecurityP6AcceptanceEvaluationBinding
  extends SandboxSecurityP6AcceptanceJsonObject {
  readonly capture_receipt_sha256: string;
  readonly evaluation_report_sha256: string;
  readonly benchmark_manifest_sha256: string;
  readonly candidate_package_sha256: string;
  readonly candidate_tree_sha256: string;
  readonly inputs_tree_sha256: string;
  readonly decisions_tree_sha256: string;
  readonly cassette_tree_sha256: string;
  readonly truth_tree_sha256: string;
  readonly accepted_metrics_sha256: string;
  readonly fixture_count: 300;
}

export type SandboxSecurityP6AcceptanceBinding =
  | SandboxSecurityP6AcceptanceCaptureBinding
  | SandboxSecurityP6AcceptanceEvaluationBinding;

export interface SandboxSecurityP6AcceptanceReceipt {
  readonly schema_version: typeof SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION;
  readonly issuer: SandboxSecurityP6AcceptanceIssuer;
  readonly run_id: string;
  readonly issued_binding: SandboxSecurityP6AcceptanceBinding;
  readonly issued_binding_sha256: string;
  readonly acceptance_public_key_sha256: string;
  readonly signature_base64url: string;
}

export const SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_CHAIN_SCHEMA_VERSION =
  "sandbox-security-p6-acceptance-receipt-chain.v1" as const;

export interface SandboxSecurityP6AcceptanceReceiptChainEvidenceBinding
  extends SandboxSecurityP6AcceptanceJsonObject {
  readonly capture_manifest_sha256: string;
  readonly replay_tree_sha256: string;
  readonly benchmark_manifest_sha256: string;
  readonly inputs_tree_sha256: string;
  readonly decisions_tree_sha256: string;
  readonly cassette_tree_sha256: string;
  readonly truth_tree_sha256: string;
  readonly accepted_metrics_sha256: string;
  readonly fixture_count: 300;
}

export interface SandboxSecurityP6AcceptanceReceiptChain {
  readonly schema_version: typeof SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_CHAIN_SCHEMA_VERSION;
  readonly run_id: string;
  readonly seal_sha256: string;
  readonly capture_receipt_sha256: string;
  readonly evaluation_receipt_sha256: string;
  readonly capture_binding_sha256: string;
  readonly evaluation_binding_sha256: string;
  readonly capture_binding: SandboxSecurityP6AcceptanceCaptureBinding;
  readonly evaluation_binding: SandboxSecurityP6AcceptanceEvaluationBinding;
  readonly evidence_binding: SandboxSecurityP6AcceptanceReceiptChainEvidenceBinding;
  readonly capture_receipt: SandboxSecurityP6AcceptanceReceipt;
  readonly evaluation_receipt: SandboxSecurityP6AcceptanceReceipt;
}

export interface SandboxSecurityP6AcceptanceReceiptInput {
  readonly issuer: SandboxSecurityP6AcceptanceIssuer;
  readonly run_id: string;
  readonly issued_binding: Readonly<Record<string, unknown>>;
  readonly private_key: KeyObject;
}

const INVALID = "sandbox_security_p6_acceptance_reject";
const RECEIPT_DOMAIN = "sandbox-security-p6-receipt.v1";
const RECEIPT_KEYS = Object.freeze([
  "schema_version",
  "issuer",
  "run_id",
  "issued_binding",
  "issued_binding_sha256",
  "acceptance_public_key_sha256",
  "signature_base64url"
] as const);
const RECEIPT_INPUT_KEYS = Object.freeze([
  "issuer",
  "run_id",
  "issued_binding",
  "private_key"
] as const);
const CAPTURE_BINDING_KEYS = Object.freeze([
  "bundle_descriptor_sha256",
  "inputs_tree_sha256",
  "code_tree_sha256",
  "candidate_package_sha256",
  "candidate_tree_sha256",
  "decisions_tree_sha256",
  "cassette_tree_sha256",
  "fixture_count",
  "execution_profile",
  "judge_binding"
] as const);
const CAPTURE_BINDING_HASH_KEYS = Object.freeze([
  "inputs_tree_sha256",
  "code_tree_sha256",
  "candidate_package_sha256",
  "candidate_tree_sha256",
  "decisions_tree_sha256",
  "cassette_tree_sha256"
] as const);
const EVALUATION_BINDING_KEYS = Object.freeze([
  "capture_receipt_sha256",
  "evaluation_report_sha256",
  "benchmark_manifest_sha256",
  "candidate_package_sha256",
  "candidate_tree_sha256",
  "inputs_tree_sha256",
  "decisions_tree_sha256",
  "cassette_tree_sha256",
  "truth_tree_sha256",
  "accepted_metrics_sha256",
  "fixture_count"
] as const);
const EVALUATION_BINDING_HASH_KEYS = Object.freeze([
  "capture_receipt_sha256",
  "evaluation_report_sha256",
  "benchmark_manifest_sha256",
  "candidate_package_sha256",
  "candidate_tree_sha256",
  "inputs_tree_sha256",
  "decisions_tree_sha256",
  "cassette_tree_sha256",
  "truth_tree_sha256",
  "accepted_metrics_sha256"
] as const);
const EXECUTION_PROFILE_KEYS = Object.freeze([
  "execution_profile_id",
  "readiness_timeout_ms",
  "qualification_timeout_ms",
  "local_detector_slot_timeout_ms",
  "judge_detector_slot_timeout_ms",
  "normal_work_budget_ms"
] as const);
const JUDGE_BINDING_KEYS = Object.freeze([
  "judge_protocol_id",
  "judge_endpoint_policy_id",
  "judge_base_url_sha256",
  "judge_endpoint_url_sha256",
  "judge_requested_model_id",
  "judge_requested_model_sha256",
  "judge_resolved_model_id",
  "judge_resolved_model_sha256",
  "judge_binding_sha256"
] as const);
const JUDGE_BINDING_HASH_KEYS = Object.freeze([
  "judge_base_url_sha256",
  "judge_endpoint_url_sha256",
  "judge_requested_model_sha256",
  "judge_resolved_model_sha256",
  "judge_binding_sha256"
] as const);
const RECEIPT_CHAIN_KEYS = Object.freeze([
  "schema_version",
  "run_id",
  "seal_sha256",
  "capture_receipt_sha256",
  "evaluation_receipt_sha256",
  "capture_binding_sha256",
  "evaluation_binding_sha256",
  "capture_binding",
  "evaluation_binding",
  "evidence_binding",
  "capture_receipt",
  "evaluation_receipt"
] as const);
const RECEIPT_CHAIN_EVIDENCE_KEYS = Object.freeze([
  "capture_manifest_sha256",
  "replay_tree_sha256",
  "benchmark_manifest_sha256",
  "inputs_tree_sha256",
  "decisions_tree_sha256",
  "cassette_tree_sha256",
  "truth_tree_sha256",
  "accepted_metrics_sha256",
  "fixture_count"
] as const);
const RUN_ID = /^[0-9a-f]{32}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 100_000;
const MAX_JSON_TEXT_BYTES = 1_048_576;
const MAX_PRIVATE_KEY_BYTES = 16_384n;
const ACCEPTANCE_PUBLIC_KEY_PATH = fileURLToPath(
  new URL("./p6-acceptance-public-key.pem", import.meta.url)
);

interface DataRecordSnapshot {
  readonly keys: readonly string[];
  readonly values: ReadonlyMap<string, unknown>;
}

interface JsonNormalizationState {
  readonly active: WeakSet<object>;
  nodes: number;
}

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

function assertBoundedString(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !isWellFormed(value) ||
    Buffer.byteLength(value, "utf8") > MAX_JSON_TEXT_BYTES
  ) {
    fail(code);
  }
  return value;
}

function snapshotDataRecord(
  value: unknown,
  code: string,
  exactKeys?: readonly string[]
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
    exactKeys !== undefined &&
    (keys.length !== exactKeys.length ||
      exactKeys.some((key) => !keys.includes(key)))
  ) {
    fail(code);
  }

  const values = new Map<string, unknown>();
  for (const key of keys) {
    if (
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor" ||
      !isWellFormed(key) ||
      Buffer.byteLength(key, "utf8") > MAX_JSON_TEXT_BYTES
    ) {
      fail(code);
    }
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
  return Object.freeze({
    keys: Object.freeze([...keys]),
    values
  });
}

function snapshotDenseArray(value: unknown, code: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(code);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > MAX_JSON_NODES
  ) {
    fail(code);
  }
  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) fail(code);

  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail(code);
    }
    output.push(descriptor.value);
  }
  return output;
}

function normalizeJsonValue(
  value: unknown,
  state: JsonNormalizationState,
  depth: number
): SandboxSecurityP6AcceptanceJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    fail("issued_binding_invalid");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return assertBoundedString(value, "issued_binding_invalid");
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("issued_binding_invalid");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object" || state.active.has(value)) {
    fail("issued_binding_invalid");
  }

  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      const items = snapshotDenseArray(value, "issued_binding_invalid");
      return Object.freeze(
        items.map((item) => normalizeJsonValue(item, state, depth + 1))
      );
    }
    const record = snapshotDataRecord(value, "issued_binding_invalid");
    return normalizeRecordSnapshot(record, state, depth);
  } finally {
    state.active.delete(value);
  }
}

function normalizeRecordSnapshot(
  record: DataRecordSnapshot,
  state: JsonNormalizationState,
  depth: number
): SandboxSecurityP6AcceptanceJsonObject {
  const output: Record<string, SandboxSecurityP6AcceptanceJsonValue> = {};
  for (const key of [...record.keys].sort()) {
    output[key] = normalizeJsonValue(
      record.values.get(key),
      state,
      depth + 1
    );
  }
  return Object.freeze(output);
}

function isJsonArray(
  value: SandboxSecurityP6AcceptanceJsonValue
): value is readonly SandboxSecurityP6AcceptanceJsonValue[] {
  return Array.isArray(value);
}

function isJsonObject(
  value: SandboxSecurityP6AcceptanceJsonValue
): value is SandboxSecurityP6AcceptanceJsonObject {
  return value !== null && typeof value === "object" && !isJsonArray(value);
}

function normalizeExecutionProfile(
  value: SandboxSecurityP6AcceptanceJsonValue
): SandboxSecurityP6AcceptanceExecutionProfile {
  if (!isJsonObject(value)) fail("issued_binding_invalid");
  const record = snapshotDataRecord(
    value,
    "issued_binding_invalid",
    EXECUTION_PROFILE_KEYS
  );
  if (
    record.values.get("execution_profile_id") !==
      "p6_local_hardware_compatibility_v8" ||
    record.values.get("readiness_timeout_ms") !== 40000 ||
    record.values.get("qualification_timeout_ms") !== 40000 ||
    record.values.get("local_detector_slot_timeout_ms") !== 60000 ||
    record.values.get("judge_detector_slot_timeout_ms") !== 300000 ||
    record.values.get("normal_work_budget_ms") !== 360000
  ) {
    fail("issued_binding_invalid");
  }
  return value as SandboxSecurityP6AcceptanceExecutionProfile;
}

function normalizeJudgeBinding(
  value: SandboxSecurityP6AcceptanceJsonValue
): SandboxSecurityP6AcceptanceJudgeBinding {
  if (!isJsonObject(value)) fail("issued_binding_invalid");
  const record = snapshotDataRecord(
    value,
    "issued_binding_invalid",
    JUDGE_BINDING_KEYS
  );
  const protocolId = record.values.get("judge_protocol_id");
  if (
    protocolId !== "openai_responses_v1" &&
    protocolId !== "openai_chat_completions_json_v1"
  ) {
    fail("issued_binding_invalid");
  }
  if (
    record.values.get("judge_endpoint_policy_id") !==
    "operator_https_fqdn_v1"
  ) {
    fail("issued_binding_invalid");
  }
  for (const key of JUDGE_BINDING_HASH_KEYS) {
    const hash = record.values.get(key);
    if (typeof hash !== "string" || !SHA256_HEX.test(hash)) {
      fail("issued_binding_invalid");
    }
  }
  for (const key of [
    "judge_requested_model_id",
    "judge_resolved_model_id"
  ] as const) {
    const modelId = record.values.get(key);
    if (typeof modelId !== "string" || !MODEL_IDENTIFIER.test(modelId)) {
      fail("issued_binding_invalid");
    }
  }
  return value as SandboxSecurityP6AcceptanceJudgeBinding;
}

function normalizeBinding(
  value: unknown,
  issuer: SandboxSecurityP6AcceptanceIssuer
): SandboxSecurityP6AcceptanceBinding {
  const exactKeys =
    issuer === "capture" ? CAPTURE_BINDING_KEYS : EVALUATION_BINDING_KEYS;
  const record = snapshotDataRecord(value, "issued_binding_invalid", exactKeys);
  const state: JsonNormalizationState = {
    active: new WeakSet<object>(),
    nodes: 1
  };
  state.active.add(value as object);
  let normalized: SandboxSecurityP6AcceptanceJsonObject;
  try {
    normalized = normalizeRecordSnapshot(record, state, 0);
  } finally {
    state.active.delete(value as object);
  }
  const hashKeys =
    issuer === "capture"
      ? CAPTURE_BINDING_HASH_KEYS
      : EVALUATION_BINDING_HASH_KEYS;
  for (const key of hashKeys) {
    const hash = normalized[key];
    if (typeof hash !== "string" || !SHA256_HEX.test(hash)) {
      fail("issued_binding_invalid");
    }
  }
  if (normalized.fixture_count !== 300) fail("issued_binding_invalid");

  if (issuer === "capture") {
    normalizeExecutionProfile(normalized.execution_profile!);
    normalizeJudgeBinding(normalized.judge_binding!);
    return normalized as SandboxSecurityP6AcceptanceCaptureBinding;
  }
  return normalized as SandboxSecurityP6AcceptanceEvaluationBinding;
}

function canonicalJson(value: SandboxSecurityP6AcceptanceJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (isJsonArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`
    )
    .join(",")}}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeCanonicalBinding(
  value: unknown,
  issuer: SandboxSecurityP6AcceptanceIssuer
): Readonly<{
  binding: SandboxSecurityP6AcceptanceBinding;
  canonical_json: string;
  sha256: string;
}> {
  const binding = normalizeBinding(value, issuer);
  const canonicalBinding = canonicalJson(binding);
  if (
    Buffer.byteLength(canonicalBinding, "utf8") >
    SANDBOX_SECURITY_P6_ACCEPTANCE_MAX_BINDING_BYTES
  ) {
    fail("issued_binding_too_large");
  }
  return Object.freeze({
    binding,
    canonical_json: canonicalBinding,
    sha256: sha256Hex(canonicalBinding)
  });
}

function exportPublicKeyDer(key: KeyObject): Buffer {
  const exported = key.export({ format: "der", type: "spki" });
  return Buffer.isBuffer(exported) ? exported : Buffer.from(exported);
}

function loadAcceptancePublicKey(): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey(readFileSync(ACCEPTANCE_PUBLIC_KEY_PATH));
  } catch {
    fail("acceptance_public_key_invalid");
  }
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    fail("acceptance_public_key_invalid");
  }
  return key;
}

const ACCEPTANCE_PUBLIC_KEY = loadAcceptancePublicKey();
const ACCEPTANCE_PUBLIC_KEY_DER = exportPublicKeyDer(ACCEPTANCE_PUBLIC_KEY);
const LOADED_ACCEPTANCE_PUBLIC_KEY_SHA256 = createHash("sha256")
  .update(ACCEPTANCE_PUBLIC_KEY_DER)
  .digest("base64url");
if (
  LOADED_ACCEPTANCE_PUBLIC_KEY_SHA256 !==
  SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256
) {
  fail("acceptance_public_key_fingerprint_mismatch");
}
const CONSUMED_RECEIPTS = new Set<string>();
const RECEIPT_CONSUMPTION_OPTIONS_KEYS = Object.freeze([
  "consumer",
  "registry_path"
] as const);
const RECEIPT_CONSUMERS = Object.freeze(["evaluation", "seal"] as const);

function assertIssuer(value: unknown): SandboxSecurityP6AcceptanceIssuer {
  if (value !== "capture" && value !== "evaluation") fail("issuer_invalid");
  return value;
}

function assertRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID.test(value)) fail("run_id_invalid");
  return value;
}

function assertPrivateKey(value: unknown): KeyObject {
  if (
    !(value instanceof KeyObject) ||
    value.type !== "private" ||
    value.asymmetricKeyType !== "ed25519"
  ) {
    fail("acceptance_private_key_invalid");
  }
  const derivedPublicKey = exportPublicKeyDer(createPublicKey(value));
  if (
    derivedPublicKey.length !== ACCEPTANCE_PUBLIC_KEY_DER.length ||
    !timingSafeEqual(derivedPublicKey, ACCEPTANCE_PUBLIC_KEY_DER)
  ) {
    fail("acceptance_private_key_public_mismatch");
  }
  return value;
}

function signingBytes(input: Readonly<{
  issuer: SandboxSecurityP6AcceptanceIssuer;
  run_id: string;
  issued_binding_sha256: string;
}>): Buffer {
  return Buffer.from(
    `${RECEIPT_DOMAIN}\n${SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION}\n${input.issuer}\n${input.run_id}\n${input.issued_binding_sha256}`,
    "utf8"
  );
}

function decodeCanonicalBase64url(
  value: unknown,
  expectedBytes: number,
  code: string
): Readonly<{ encoded: string; decoded: Buffer }> {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64URL.test(value)
  ) {
    fail(code);
  }
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.length !== expectedBytes ||
    decoded.toString("base64url") !== value
  ) {
    fail(code);
  }
  return Object.freeze({ encoded: value, decoded });
}

function normalizeReceipt(value: unknown): SandboxSecurityP6AcceptanceReceipt {
  const record = snapshotDataRecord(value, "receipt_invalid", RECEIPT_KEYS);
  if (
    record.values.get("schema_version") !==
    SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION
  ) {
    fail("schema_version_invalid");
  }
  const issuer = assertIssuer(record.values.get("issuer"));
  const runId = assertRunId(record.values.get("run_id"));
  const canonicalBinding = normalizeCanonicalBinding(
    record.values.get("issued_binding"),
    issuer
  );
  const issuedBinding = canonicalBinding.binding;
  const issuedBindingSha256 = record.values.get("issued_binding_sha256");
  if (
    typeof issuedBindingSha256 !== "string" ||
    !SHA256_HEX.test(issuedBindingSha256)
  ) {
    fail("issued_binding_hash_invalid");
  }
  if (canonicalBinding.sha256 !== issuedBindingSha256) {
    fail("issued_binding_hash_mismatch");
  }

  const publicKeyFingerprint = decodeCanonicalBase64url(
    record.values.get("acceptance_public_key_sha256"),
    32,
    "acceptance_public_key_encoding_invalid"
  );
  if (
    publicKeyFingerprint.encoded !==
    SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256
  ) {
    fail("acceptance_public_key_unknown");
  }
  const signature = decodeCanonicalBase64url(
    record.values.get("signature_base64url"),
    64,
    "signature_encoding_invalid"
  );
  if (
    !verify(
      null,
      signingBytes({
        issuer,
        run_id: runId,
        issued_binding_sha256: issuedBindingSha256
      }),
      ACCEPTANCE_PUBLIC_KEY,
      signature.decoded
    )
  ) {
    fail("signature_invalid");
  }

  return Object.freeze({
    schema_version: SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION,
    issuer,
    run_id: runId,
    issued_binding: issuedBinding,
    issued_binding_sha256: issuedBindingSha256,
    acceptance_public_key_sha256: publicKeyFingerprint.encoded,
    signature_base64url: signature.encoded
  });
}

function normalizeReceiptChainEvidenceBinding(
  value: unknown
): SandboxSecurityP6AcceptanceReceiptChainEvidenceBinding {
  const record = snapshotDataRecord(
    value,
    "receipt_chain_evidence_binding_invalid",
    RECEIPT_CHAIN_EVIDENCE_KEYS
  );
  const state: JsonNormalizationState = {
    active: new WeakSet<object>(),
    nodes: 1
  };
  state.active.add(value as object);
  let normalized: SandboxSecurityP6AcceptanceJsonObject;
  try {
    normalized = normalizeRecordSnapshot(record, state, 0);
  } finally {
    state.active.delete(value as object);
  }
  for (const key of [
    "capture_manifest_sha256",
    "replay_tree_sha256",
    "benchmark_manifest_sha256",
    "inputs_tree_sha256",
    "decisions_tree_sha256",
    "cassette_tree_sha256",
    "truth_tree_sha256",
    "accepted_metrics_sha256"
  ] as const) {
    const hash = normalized[key];
    if (typeof hash !== "string" || !SHA256_HEX.test(hash)) {
      fail("receipt_chain_evidence_binding_invalid");
    }
  }
  if (normalized.fixture_count !== 300) {
    fail("receipt_chain_evidence_binding_invalid");
  }
  return normalized as SandboxSecurityP6AcceptanceReceiptChainEvidenceBinding;
}

export function normalizeSandboxSecurityP6AcceptanceReceiptChain(
  value: unknown
): SandboxSecurityP6AcceptanceReceiptChain {
  const record = snapshotDataRecord(
    value,
    "receipt_chain_invalid",
    RECEIPT_CHAIN_KEYS
  );
  if (
    record.values.get("schema_version") !==
    SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_CHAIN_SCHEMA_VERSION
  ) {
    fail("receipt_chain_schema_invalid");
  }
  const runId = assertRunId(record.values.get("run_id"));
  const sealSha256 = record.values.get("seal_sha256");
  if (typeof sealSha256 !== "string" || !SHA256_HEX.test(sealSha256)) {
    fail("receipt_chain_seal_invalid");
  }

  const captureReceipt = normalizeReceipt(record.values.get("capture_receipt"));
  const evaluationReceipt = normalizeReceipt(
    record.values.get("evaluation_receipt")
  );
  if (
    captureReceipt.issuer !== "capture" ||
    evaluationReceipt.issuer !== "evaluation" ||
    captureReceipt.run_id !== runId ||
    evaluationReceipt.run_id !== runId
  ) {
    fail("receipt_chain_binding_invalid");
  }

  const captureReceiptSha256 = hashVerifiedReceipt(captureReceipt);
  const evaluationReceiptSha256 = hashVerifiedReceipt(evaluationReceipt);
  for (const [key, expected] of [
    ["capture_receipt_sha256", captureReceiptSha256],
    ["evaluation_receipt_sha256", evaluationReceiptSha256]
  ] as const) {
    if (record.values.get(key) !== expected) {
      fail("receipt_chain_receipt_hash_invalid");
    }
  }

  const captureBinding = normalizeBinding(
    record.values.get("capture_binding"),
    "capture"
  ) as SandboxSecurityP6AcceptanceCaptureBinding;
  const evaluationBinding = normalizeBinding(
    record.values.get("evaluation_binding"),
    "evaluation"
  ) as SandboxSecurityP6AcceptanceEvaluationBinding;
  if (
    canonicalJson(captureBinding) !== canonicalJson(captureReceipt.issued_binding) ||
    canonicalJson(evaluationBinding) !==
      canonicalJson(evaluationReceipt.issued_binding)
  ) {
    fail("receipt_chain_binding_copy_invalid");
  }
  if (
    record.values.get("capture_binding_sha256") !==
      captureReceipt.issued_binding_sha256 ||
    record.values.get("evaluation_binding_sha256") !==
      evaluationReceipt.issued_binding_sha256
  ) {
    fail("receipt_chain_binding_hash_invalid");
  }

  if (evaluationBinding.capture_receipt_sha256 !== captureReceiptSha256) {
    fail("receipt_chain_link_broken");
  }

  const evidenceBinding = normalizeReceiptChainEvidenceBinding(
    record.values.get("evidence_binding")
  );
  if (
    evidenceBinding.benchmark_manifest_sha256 !==
      evaluationBinding.benchmark_manifest_sha256 ||
    evidenceBinding.inputs_tree_sha256 !== evaluationBinding.inputs_tree_sha256 ||
    evidenceBinding.decisions_tree_sha256 !==
      evaluationBinding.decisions_tree_sha256 ||
    evidenceBinding.cassette_tree_sha256 !==
      evaluationBinding.cassette_tree_sha256 ||
    evidenceBinding.truth_tree_sha256 !== evaluationBinding.truth_tree_sha256 ||
    evidenceBinding.accepted_metrics_sha256 !==
      evaluationBinding.accepted_metrics_sha256 ||
    evidenceBinding.fixture_count !== evaluationBinding.fixture_count
  ) {
    fail("receipt_chain_evidence_binding_invalid");
  }

  return Object.freeze({
    schema_version:
      SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_CHAIN_SCHEMA_VERSION,
    run_id: runId,
    seal_sha256: sealSha256,
    capture_receipt_sha256: captureReceiptSha256,
    evaluation_receipt_sha256: evaluationReceiptSha256,
    capture_binding_sha256: captureReceipt.issued_binding_sha256,
    evaluation_binding_sha256: evaluationReceipt.issued_binding_sha256,
    capture_binding: captureBinding,
    evaluation_binding: evaluationBinding,
    evidence_binding: evidenceBinding,
    capture_receipt: captureReceipt,
    evaluation_receipt: evaluationReceipt
  });
}

export function createSandboxSecurityP6AcceptanceReceipt(
  input: unknown
): SandboxSecurityP6AcceptanceReceipt {
  const record = snapshotDataRecord(
    input,
    "receipt_input_invalid",
    RECEIPT_INPUT_KEYS
  );
  const issuer = assertIssuer(record.values.get("issuer"));
  const runId = assertRunId(record.values.get("run_id"));
  const canonicalBinding = normalizeCanonicalBinding(
    record.values.get("issued_binding"),
    issuer
  );
  const issuedBinding = canonicalBinding.binding;
  const privateKey = assertPrivateKey(record.values.get("private_key"));
  const issuedBindingSha256 = canonicalBinding.sha256;
  const signatureBase64url = sign(
    null,
    signingBytes({
      issuer,
      run_id: runId,
      issued_binding_sha256: issuedBindingSha256
    }),
    privateKey
  ).toString("base64url");

  return Object.freeze({
    schema_version: SANDBOX_SECURITY_P6_ACCEPTANCE_RECEIPT_SCHEMA_VERSION,
    issuer,
    run_id: runId,
    issued_binding: issuedBinding,
    issued_binding_sha256: issuedBindingSha256,
    acceptance_public_key_sha256:
      SANDBOX_SECURITY_P6_ACCEPTANCE_PUBLIC_KEY_SHA256,
    signature_base64url: signatureBase64url
  });
}

export function verifySandboxSecurityP6AcceptanceReceipt(
  receipt: unknown
): SandboxSecurityP6AcceptanceReceipt {
  return normalizeReceipt(receipt);
}

export function consumeSandboxSecurityP6AcceptanceReceipt(
  receipt: unknown,
  options?: Readonly<{
    consumer: "evaluation" | "seal";
    registry_path: string;
  }>
): SandboxSecurityP6AcceptanceReceipt {
  const verified = normalizeReceipt(receipt);
  const receiptSha256 = hashVerifiedReceipt(verified);
  if (options === undefined) {
    if (CONSUMED_RECEIPTS.has(receiptSha256)) fail("receipt_replayed");
    CONSUMED_RECEIPTS.add(receiptSha256);
    return verified;
  }

  const optionRecord = snapshotDataRecord(
    options,
    "receipt_consumption_options_invalid",
    RECEIPT_CONSUMPTION_OPTIONS_KEYS
  );
  const consumer = optionRecord.values.get("consumer");
  if (
    typeof consumer !== "string" ||
    !(RECEIPT_CONSUMERS as readonly string[]).includes(consumer)
  ) {
    fail("receipt_consumption_options_invalid");
  }
  const registryPath = optionRecord.values.get("registry_path");
  if (
    typeof registryPath !== "string" ||
    registryPath.length === 0 ||
    !isAbsolute(registryPath) ||
    registryPath.includes("\0")
  ) {
    fail("receipt_consumption_registry_invalid");
  }

  let descriptor: number;
  try {
    descriptor = openSync(
      resolve(registryPath),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "EEXIST"
    ) {
      fail("receipt_replayed");
    }
    fail("receipt_consumption_registry_write_failed");
  }
  try {
    const marker = `${consumer}:${receiptSha256}\n`;
    writeSync(descriptor, marker, undefined, "utf8");
    fsyncSync(descriptor);
  } catch {
    closeSync(descriptor);
    try {
      unlinkSync(resolve(registryPath));
    } catch {
      // The marker remains a conservative consumed token if cleanup fails.
    }
    fail("receipt_consumption_registry_write_failed");
  }
  closeSync(descriptor);
  return verified;
}

function hashVerifiedReceipt(
  verified: SandboxSecurityP6AcceptanceReceipt
): string {
  const canonicalReceipt: SandboxSecurityP6AcceptanceJsonObject = {
    schema_version: verified.schema_version,
    issuer: verified.issuer,
    run_id: verified.run_id,
    issued_binding: verified.issued_binding,
    issued_binding_sha256: verified.issued_binding_sha256,
    acceptance_public_key_sha256: verified.acceptance_public_key_sha256,
    signature_base64url: verified.signature_base64url
  };
  return sha256Hex(canonicalJson(canonicalReceipt));
}

/**
 * Canonical SHA-256 (hex) of a fully verified receipt. The evaluator and sealer
 * use this identical hash to bind and re-verify the receipt chain across
 * processes without retaining the private key.
 */
export function hashSandboxSecurityP6AcceptanceReceipt(
  receipt: unknown
): string {
  return hashVerifiedReceipt(normalizeReceipt(receipt));
}

export function loadSandboxSecurityP6AcceptancePrivateKey(path: string): KeyObject {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.length > 4096 ||
    path.includes("\0") ||
    !isAbsolute(path)
  ) {
    fail("acceptance_private_key_path_invalid");
  }

  let pathStat;
  try {
    pathStat = lstatSync(path, { bigint: true });
  } catch {
    fail("acceptance_private_key_missing");
  }
  if (pathStat.isSymbolicLink()) fail("acceptance_private_key_symlink");
  if (!pathStat.isFile()) fail("acceptance_private_key_not_regular");
  if (pathStat.nlink !== 1n) fail("acceptance_private_key_link_count_invalid");
  if ((pathStat.mode & 0o7777n) !== 0o600n) {
    fail("acceptance_private_key_mode_invalid");
  }
  if (pathStat.size <= 0n || pathStat.size > MAX_PRIVATE_KEY_BYTES) {
    fail("acceptance_private_key_size_invalid");
  }

  const expectedSize = Number(pathStat.size);
  let rawBytes: Buffer | undefined;
  try {
    let descriptor: number;
    try {
      descriptor = openSync(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
    } catch {
      fail("acceptance_private_key_open_failed");
    }

    try {
      const before = fstatSync(descriptor, { bigint: true });
      if (!before.isFile()) fail("acceptance_private_key_not_regular");
      if (before.nlink !== 1n) {
        fail("acceptance_private_key_link_count_invalid");
      }
      if ((before.mode & 0o7777n) !== 0o600n) {
        fail("acceptance_private_key_mode_invalid");
      }
      if (
        before.dev !== pathStat.dev ||
        before.ino !== pathStat.ino ||
        before.size !== pathStat.size ||
        before.mode !== pathStat.mode ||
        before.nlink !== pathStat.nlink ||
        before.mtimeNs !== pathStat.mtimeNs ||
        before.ctimeNs !== pathStat.ctimeNs
      ) {
        fail("acceptance_private_key_binding_changed");
      }

      rawBytes = Buffer.alloc(expectedSize + 1);
      let totalBytesRead = 0;
      while (totalBytesRead < rawBytes.length) {
        const bytesRead = readSync(
          descriptor,
          rawBytes,
          totalBytesRead,
          rawBytes.length - totalBytesRead,
          null
        );
        if (bytesRead === 0) break;
        totalBytesRead += bytesRead;
      }
      const after = fstatSync(descriptor, { bigint: true });
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mode !== before.mode ||
        after.nlink !== before.nlink ||
        after.mtimeNs !== before.mtimeNs ||
        after.ctimeNs !== before.ctimeNs
      ) {
        fail("acceptance_private_key_binding_changed");
      }
      if (totalBytesRead !== expectedSize) {
        fail("acceptance_private_key_binding_changed");
      }
    } finally {
      closeSync(descriptor);
    }

    if (rawBytes === undefined) fail("acceptance_private_key_binding_changed");
    let privateKey: KeyObject;
    try {
      privateKey = createPrivateKey(rawBytes.subarray(0, expectedSize));
    } catch {
      fail("acceptance_private_key_invalid");
    }
    return assertPrivateKey(privateKey);
  } finally {
    rawBytes?.fill(0);
  }
}
