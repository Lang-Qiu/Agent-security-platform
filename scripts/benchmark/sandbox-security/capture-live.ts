/**
 * P6-T2: Permission-limited live capture child.
 *
 * Accepts only a materialized input bundle + capture output directory, runs a
 * non-benchmark Judge strict-schema readiness check, then evaluates 300 inputs
 * serially with beginInput/endInput, writing a candidate content-free package.
 * Never reads truth, never seals, never spawns child/worker.
 */

import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts,
  SandboxSecuritySanitizedJudgePayload
} from "../../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_EXECUTION_PROFILE_ID,
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING
} from "../../../engines/sandbox/src/security-production/p6-live-capture-profile.ts";
import {
  createSandboxSecurityLiveCaptureEngine,
  resolveSandboxSecurityBenchmarkJudgeProtocolDispatch,
  type SandboxSecurityBenchmarkJudgeProtocolDispatch,
  type SandboxSecurityCaptureSink
} from "../../../engines/sandbox/src/security-production/benchmark-composition.ts";
import {
  createSandboxSecurityProductionConfig,
  createSandboxSecurityProductionTransport,
  type SandboxSecurityProductionConfig
} from "../../../engines/sandbox/src/security-production/production-config.ts";
import {
  SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/openai-judge-contract.ts";
import type {
  SandboxSecurityHttpTransport
} from "../../../engines/sandbox/src/security-production/http-transport.ts";
import {
  normalizeSandboxSecurityJudgeEndpoint,
  resolveSandboxSecurityJudgeProtocol,
  type SandboxSecurityJudgeProtocolId
} from "../../../engines/sandbox/src/security-production/judge-protocol-adapter.ts";
import {
  SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION,
  SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION,
  assertSandboxSecurityBenchmarkAcceptedProviderOutcomes,
  hashSandboxSecurityBenchmarkCandidateCassette,
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkJudgeBinding,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkCandidateCaptureManifest,
  normalizeSandboxSecurityBenchmarkCandidateCassette,
  normalizeSandboxSecurityBenchmarkCandidateDecisionEnvelope,
  normalizeSandboxSecurityBenchmarkCandidatePackage,
  assertSandboxSecurityBenchmarkCandidatePackageLayout,
  normalizeSandboxSecurityBenchmarkInputEnvelope
} from "./contracts.ts";
import {
  createSandboxSecurityCaptureSink,
  SANDBOX_SECURITY_CAPTURE_INPUT_COUNT,
  type SandboxSecurityCaptureAccumulator
} from "./capture-sink.ts";
import {
  materializeSandboxSecurityCandidatePackage,
  sandboxSecurityCandidateStagingPath,
  SANDBOX_SECURITY_CANDIDATE_STAGING_SCHEMA_VERSION,
  SANDBOX_SECURITY_MAX_CANDIDATE_STAGING_BYTES
} from "./capture-candidate.ts";
import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "../../../engines/sandbox/src/security-production/deterministic-sanitizer.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "../../../engines/sandbox/src/security-production/rule-catalog.ts";
import {
  SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/ollama-contract.ts";
import {
  assertSandboxSecurityCandidateOutputAcknowledgement,
  buildSandboxSecurityCandidateDecisionEnvelope,
  SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
  type SandboxSecurityCandidateCompleteFrame,
  type SandboxSecurityCandidateOutputFrame,
  type SandboxSecurityCandidateProgressFrame
} from "./candidate-progress.ts";

export {
  appendSandboxSecurityCandidateProgress,
  buildSandboxSecurityCandidateDecisionEnvelope,
  createSandboxSecurityCandidateProgressDocument,
  markSandboxSecurityCandidateProgressFailed,
  normalizeSandboxSecurityCandidateOutputFrame,
  normalizeSandboxSecurityCandidateProgressDocument,
  SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
  SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION
} from "./candidate-progress.ts";

const INVALID = "sandbox_security_capture_live_reject";
const READINESS_TIMEOUT_MS =
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.readiness_timeout_ms;
const LOCAL_SCHEMA_VERSION = "sandbox-security-local-model.v1" as const;
const JUDGE_SCHEMA_VERSION = "sandbox-security-judge.v1" as const;
const OLLAMA_MODEL = "qwen3:8b" as const;
const SHA256 = /^[0-9a-f]{64}$/u;
const JUDGE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const CAPTURE_OUTPUT_BINDING = /^(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/u;
const CANDIDATE_STAGING_FILENAME = ".candidate-package.json" as const;
const CANDIDATE_STAGING_SCHEMA_VERSION =
  SANDBOX_SECURITY_CANDIDATE_STAGING_SCHEMA_VERSION;
const MAX_CANDIDATE_STAGING_BYTES = SANDBOX_SECURITY_MAX_CANDIDATE_STAGING_BYTES;

export { materializeSandboxSecurityCandidatePackage } from "./capture-candidate.ts";

interface SandboxSecurityLiveBinding {
  readonly ollama_digest: string;
  readonly judge_protocol_id: SandboxSecurityJudgeProtocolId;
  readonly judge_endpoint_policy_id: "operator_https_fqdn_v1";
  readonly judge_base_url: string;
  readonly judge_endpoint_url: string;
  readonly judge_requested_model: string;
}

interface SandboxSecurityLiveCaptureConfig {
  readonly binding: SandboxSecurityLiveBinding;
  readonly production_config: Readonly<SandboxSecurityProductionConfig> | null;
}

export type SandboxSecurityLiveCaptureEvent =
  | "judge_readiness"
  | "capture_child_started"
  | "engine_created"
  | "inputs_complete"
  | "sink_drained"
  | "candidate_written"
  | "capture_complete";

export interface SandboxSecurityLiveCaptureResult {
  readonly events: readonly SandboxSecurityLiveCaptureEvent[];
  readonly fixture_ids: readonly string[];
  readonly decision_count: number;
  readonly readiness_counted_as_decision: false;
  readonly candidate_root: string;
  readonly cassette_tree_sha256: string;
  readonly decisions_tree_sha256: string;
  readonly candidate_package_sha256: string;
  readonly stdout_summary: string;
}

export interface SandboxSecurityLiveCapturePorts {
  readonly bundle_root: string;
  readonly input_root: string;
  readonly capture_output_root: string;
  readonly capture_output_binding?: string;
  readonly inputs_tree_sha256: string;
  readonly runtime?: SandboxSecurityRuntimePorts;
  readonly truth_path?: string;
  readonly inherited_fd?: number;
  readonly evaluate_path?: string;
  readonly metrics_path?: string;
  readonly fixture_ids?: readonly string[];
  /** Test-only: skip recomputing inputs tree hash against disk. */
  skip_input_hash_check?: boolean;
  readonly abort_signal?: AbortSignal;
  create_sink?: () => SandboxSecurityCaptureSink & {
    snapshot(): Readonly<SandboxSecurityCaptureAccumulator>;
  };
  run_judge_readiness?: (input: Readonly<{
    timeout_ms: number;
    signal: AbortSignal;
  }>) => Promise<
    | string
    | Readonly<{
        resolved_model: string;
        transport: SandboxSecurityHttpTransport;
      }>
  >;
  create_engine?: (input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    capture_sink: SandboxSecurityCaptureSink;
    transport: SandboxSecurityHttpTransport;
  }>) => Promise<SandboxSecurityEngine>;
  has_child_permission?: () => boolean;
  has_worker_permission?: () => boolean;
  has_fs_read_permission?: (path: string) => boolean;
  has_fs_write_permission?: (path: string) => boolean;
  /** Test-only: inject a complete synthetic binding instead of reading env. */
  live_binding?: SandboxSecurityLiveBinding;
  require_live_config?: () => void;
}

export interface SandboxSecurityLiveCaptureOptions {
  readonly candidate_output?: "bound_file" | "stream";
  readonly output_frame_writer?: Readonly<{
    write(frame: SandboxSecurityCandidateOutputFrame): void | PromiseLike<void>;
  }>;
}

function fail(code: string): never {
  const error = new Error(`${INVALID}:${code}`);
  error.name = INVALID;
  throw error;
}

function normalizeInjectedLiveBinding(value: unknown): SandboxSecurityLiveBinding {
  if (!isPlainObject(value)) fail("live_binding_invalid");
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "judge_base_url",
    "judge_endpoint_policy_id",
    "judge_endpoint_url",
    "judge_protocol_id",
    "judge_requested_model",
    "ollama_digest"
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail("live_binding_invalid");
  }

  const ollamaDigest = value.ollama_digest;
  const protocolId = value.judge_protocol_id;
  const endpointPolicyId = value.judge_endpoint_policy_id;
  const baseUrl = value.judge_base_url;
  const endpointUrl = value.judge_endpoint_url;
  const requestedModel = value.judge_requested_model;
  if (
    typeof ollamaDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(ollamaDigest) ||
    (protocolId !== "openai_responses_v1" &&
      protocolId !== "openai_chat_completions_json_v1") ||
    endpointPolicyId !== "operator_https_fqdn_v1" ||
    typeof baseUrl !== "string" ||
    typeof endpointUrl !== "string" ||
    typeof requestedModel !== "string" ||
    !JUDGE_MODEL.test(requestedModel)
  ) {
    fail("live_binding_invalid");
  }
  try {
    const protocol = resolveSandboxSecurityJudgeProtocol(protocolId, baseUrl);
    const endpoint = normalizeSandboxSecurityJudgeEndpoint(
      protocolId,
      endpointUrl
    );
    if (protocol.endpoint_url !== endpoint.endpoint_url) {
      fail("live_binding_invalid");
    }
  } catch {
    fail("live_binding_invalid");
  }
  return Object.freeze({
    ollama_digest: ollamaDigest,
    judge_protocol_id: protocolId,
    judge_endpoint_policy_id: endpointPolicyId,
    judge_base_url: baseUrl,
    judge_endpoint_url: endpointUrl,
    judge_requested_model: requestedModel
  });
}

const SAFE_CAPTURE_RUNTIME_FAILURE_CODES = Object.freeze([
  "sandbox_security_benchmark_composition_invalid",
  "sandbox_security_external_pipeline_invalid",
  "sandbox_security_judge_protocol_invalid",
  "sandbox_security_ollama_construction",
  "sandbox_security_ollama_detector_invalid",
  "sandbox_security_ollama_qualification_invalid",
  "sandbox_security_ollama_request_invalid",
  "sandbox_security_ollama_response_invalid",
  "sandbox_security_openai_chat_judge_request_invalid",
  "sandbox_security_openai_chat_judge_response_invalid",
  "sandbox_security_openai_judge_request_invalid",
  "sandbox_security_openai_judge_response_invalid",
  "sandbox_security_openai_judge_detector_invalid",
  "sandbox_security_production_composition_invalid",
  "sandbox_security_production_config_invalid",
  "sandbox_security_provider_outcome_invalid",
  "sandbox_security_transport_aborted",
  "sandbox_security_transport_connection_failed",
  "sandbox_security_transport_credential_reflection",
  "sandbox_security_transport_digest_mismatch",
  "sandbox_security_transport_invalid",
  "sandbox_security_transport_response_too_large"
] as const);

export function classifySandboxSecurityCaptureLiveError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    message.length <= 160 &&
    /^sandbox_security_capture_live_reject:[a-z0-9_]+(?::[a-z0-9_]+){0,2}$/u.test(
      message
    )
  ) {
    return message;
  }
  if (
    (SAFE_CAPTURE_RUNTIME_FAILURE_CODES as readonly string[]).includes(message)
  ) {
    return `${INVALID}:${message.slice("sandbox_security_".length)}`;
  }
  return `${INVALID}:internal`;
}

function safeCliErrorCode(error: unknown): string {
  return classifySandboxSecurityCaptureLiveError(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertJudgeResolvedModel(value: unknown): string {
  if (typeof value !== "string" || !JUDGE_MODEL.test(value)) {
    fail("judge_resolved_model");
  }
  return value;
}

function assertCapturedJudgeResponseModels(
  accumulator: Readonly<SandboxSecurityCaptureAccumulator>,
  judgeResolvedModel: string
): void {
  for (const input of accumulator.inputs) {
    const finalAttempt = input.judge.at(-1);
    if (finalAttempt?.status !== "response") continue;
    const normalizedResponse = finalAttempt.normalized_response;
    if (!isPlainObject(normalizedResponse)) fail("judge_resolved_model");
    const model = Object.getOwnPropertyDescriptor(normalizedResponse, "model");
    if (model === undefined || !("value" in model)) {
      fail("judge_resolved_model");
    }
    if (assertJudgeResolvedModel(model.value) !== judgeResolvedModel) {
      fail("judge_resolved_model");
    }
  }
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

function assertRealDirectory(path: string, label: string): string {
  if (typeof path !== "string" || path.length === 0) {
    fail(`${label}_missing`);
  }
  if (!existsSync(path)) fail(`${label}_missing`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`${label}_symlink`);
  if (!stat.isDirectory()) fail(`${label}_not_directory`);
  return realpathSync(path);
}

function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : root + sep;
  return candidate === root || candidate.startsWith(normalizedRoot);
}

function assertAbsolutePath(path: string, label: string): string {
  if (typeof path !== "string" || path.length === 0 || !isAbsolute(path)) {
    fail(`${label}_missing`);
  }
  return resolve(path);
}

function defaultRuntime(): SandboxSecurityRuntimePorts {
  let decisionCounter = 0;
  return {
    now: () => new Date().toISOString(),
    nextDecisionId: () => {
      decisionCounter += 1;
      return `ssb-live-${String(decisionCounter).padStart(4, "0")}`;
    },
    monotonicNowMs: () => Number(process.hrtime.bigint() / 1_000_000n),
    scheduleTimeout: (delayMs, handler) => {
      const handle = setTimeout(handler, delayMs);
      return () => clearTimeout(handle);
    }
  };
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function listInputFixtureIds(inputRoot: string): string[] {
  const names = readdirSync(inputRoot)
    .filter((name) => /^ssb-v1-\d{4}\.json$/u.test(name))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  if (names.length === 0) fail("inputs_empty");
  const ids = names.map((name) => name.replace(/\.json$/u, ""));
  for (let index = 0; index < ids.length; index += 1) {
    const expected = `ssb-v1-${String(index + 1).padStart(4, "0")}`;
    if (ids[index] !== expected) fail(`fixture_order:${ids[index]}`);
  }
  return ids;
}

type SandboxSecurityFrozenInputEnvelope = ReturnType<
  typeof normalizeSandboxSecurityBenchmarkInputEnvelope
>;

function snapshotInputEnvelopes(
  inputRoot: string,
  fixtureIds: readonly string[]
): readonly SandboxSecurityFrozenInputEnvelope[] {
  const envelopes: SandboxSecurityFrozenInputEnvelope[] = [];
  for (const fixtureId of fixtureIds) {
    const envelopePath = join(inputRoot, `${fixtureId}.json`);
    if (!existsSync(envelopePath)) fail(`input_missing:${fixtureId}`);
    let envelope: SandboxSecurityFrozenInputEnvelope;
    try {
      envelope = normalizeSandboxSecurityBenchmarkInputEnvelope(
        JSON.parse(readFileSync(envelopePath, "utf8")) as unknown
      );
    } catch {
      fail(`input_invalid:${fixtureId}`);
    }
    if (envelope.fixture_id !== fixtureId) fail(`fixture_id_mismatch:${fixtureId}`);
    if (envelope.schema_version !== SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION) {
      fail(`input_schema:${fixtureId}`);
    }
    envelopes.push(deepFreeze(envelope));
  }
  return Object.freeze(envelopes);
}

function isInjectableCapturePorts(
  ports: Readonly<SandboxSecurityLiveCapturePorts>
): boolean {
  const productionKeys = new Set([
    "bundle_root",
    "input_root",
    "capture_output_root",
    "capture_output_binding",
    "inputs_tree_sha256"
  ]);
  try {
    const keys = Reflect.ownKeys(ports);
    return (
      keys.length !== productionKeys.size ||
      keys.some((key) => typeof key !== "string" || !productionKeys.has(key))
    );
  } catch {
    return true;
  }
}

const LIVE_CAPTURE_PORT_KEYS = Object.freeze([
  "bundle_root",
  "input_root",
  "capture_output_root",
  "capture_output_binding",
  "inputs_tree_sha256",
  "runtime",
  "truth_path",
  "inherited_fd",
  "evaluate_path",
  "metrics_path",
  "fixture_ids",
  "skip_input_hash_check",
  "abort_signal",
  "create_sink",
  "run_judge_readiness",
  "create_engine",
  "has_child_permission",
  "has_worker_permission",
  "has_fs_read_permission",
  "has_fs_write_permission",
  "live_binding",
  "require_live_config"
] as const satisfies readonly (keyof SandboxSecurityLiveCapturePorts)[]);

function snapshotLiveCapturePorts(
  ports: Readonly<SandboxSecurityLiveCapturePorts>
): Readonly<SandboxSecurityLiveCapturePorts> {
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of LIVE_CAPTURE_PORT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(ports, key);
    if (descriptor === undefined) continue;
    if (!("value" in descriptor)) fail(`ports_accessor:${key}`);
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<SandboxSecurityLiveCapturePorts>;
}

function rejectForbiddenPorts(
  ports: Readonly<SandboxSecurityLiveCapturePorts>,
  productionProvenance: boolean
): void {
  if (ports.truth_path !== undefined) fail("truth_argument");
  if (ports.evaluate_path !== undefined) fail("evaluate_argument");
  if (ports.metrics_path !== undefined) fail("metrics_argument");
  if (ports.inherited_fd !== undefined) fail("inherited_descriptor");

  if (productionProvenance) {
    if (typeof process.permission?.has !== "function") {
      fail("native_permission_required");
    }
    const hasChild = process.permission.has("child");
    const hasWorker = process.permission.has("worker");
    if (hasChild) fail("child_permission_granted");
    if (hasWorker) fail("worker_permission_granted");
    return;
  }

  const hasChild =
    ports.has_child_permission?.() ??
    (typeof process.permission?.has === "function"
      ? process.permission.has("child")
      : false);
  const hasWorker =
    ports.has_worker_permission?.() ??
    (typeof process.permission?.has === "function"
      ? process.permission.has("worker")
      : false);
  if (hasChild) fail("child_permission_granted");
  if (hasWorker) fail("worker_permission_granted");
}

function permissionFlagValues(flag: string): readonly string[] {
  const prefix = `${flag}=`;
  const values: string[] = [];
  for (const token of process.execArgv) {
    if (token === flag) fail(`${flag.slice(2).replaceAll("-", "_")}_scope_invalid`);
    if (token.startsWith(prefix)) values.push(token.slice(prefix.length));
  }
  return values;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function assertExactProductionPermissions(input: Readonly<{
  bundle_root: string;
  input_root: string;
  capture_output_root: string;
  capture_output_file: string;
}>): void {
  if (process.execArgv.filter((token) => token === "--permission").length !== 1) {
    fail("native_permission_required");
  }
  const codeRoot = join(input.bundle_root, "code");
  const readScopes = permissionFlagValues("--allow-fs-read");
  const writeScopes = permissionFlagValues("--allow-fs-write");
  if (!sameStrings(readScopes, [input.input_root, codeRoot])) {
    fail("fs_read_permission_scope_invalid");
  }
  if (!sameStrings(writeScopes, [input.capture_output_file])) {
    fail("fs_write_permission_scope_invalid");
  }
  if (
    !process.permission.has("fs.read", input.input_root) ||
    !process.permission.has("fs.read", codeRoot) ||
    process.permission.has("fs.read", input.capture_output_root)
  ) {
    fail("fs_read_permission_scope_invalid");
  }
  if (
    process.permission.has("fs.write", input.capture_output_root) ||
    !process.permission.has("fs.write", input.capture_output_file)
  ) {
    fail("fs_write_permission_scope_invalid");
  }
}

function captureSinkFacade(
  sink: SandboxSecurityCaptureSink
): SandboxSecurityCaptureSink {
  const facade: SandboxSecurityCaptureSink = {
    beginInput(): void {
      sink.beginInput();
    },
    record(outcome): void {
      sink.record(outcome);
    },
    endInput(): void {
      sink.endInput();
    },
    assertDrained(): void {
      sink.assertDrained();
    }
  };
  return Object.freeze(facade);
}

function resolveLiveCaptureConfig(
  ports: Readonly<SandboxSecurityLiveCapturePorts>
): SandboxSecurityLiveCaptureConfig {
  if (ports.require_live_config !== undefined) {
    ports.require_live_config();
    if (ports.live_binding === undefined) {
      fail("live_binding_missing");
    }
    return Object.freeze({
      binding: normalizeInjectedLiveBinding(ports.live_binding),
      production_config: null
    });
  }

  try {
    const productionConfig = createSandboxSecurityProductionConfig("local_and_judge");
    const summary = productionConfig.summary;
    if (
      summary.ollama_configured !== true ||
      summary.judge_configured !== true ||
      typeof summary.ollama_digest !== "string" ||
      summary.judge_endpoint_policy_id !== "operator_https_fqdn_v1" ||
      typeof summary.judge_base_url !== "string" ||
      typeof summary.judge_endpoint_url !== "string" ||
      typeof summary.judge_requested_model !== "string"
    ) {
      fail("missing_live_config");
    }
    const judgeDispatch = resolveSandboxSecurityBenchmarkJudgeProtocolDispatch(
      summary.judge_protocol_id
    );
    return Object.freeze({
      binding: Object.freeze({
        ollama_digest: summary.ollama_digest,
        judge_protocol_id: judgeDispatch.protocol_id,
        judge_endpoint_policy_id: summary.judge_endpoint_policy_id,
        judge_base_url: summary.judge_base_url,
        judge_endpoint_url: summary.judge_endpoint_url,
        judge_requested_model: summary.judge_requested_model
      }),
      production_config: productionConfig
    });
  } catch {
    fail("missing_live_config");
  }
}

function readinessSanitizedPayload(): Readonly<
  SandboxSecuritySanitizedJudgePayload
> {
  return {
    schema_version: "sandbox-security-sanitized-judge.v1" as const,
    request_token: "token://sandbox/security/readiness/0001",
    stage: "user_input" as const,
    policy_profile_id: "sandbox-security-balanced.v1" as const,
    sources: [
      {
        source_token: "token://sandbox/security/source/0001",
        source_type: "user_input" as const,
        media_type: "text/plain" as const,
        sanitized_value: "sandbox security judge readiness probe"
      }
    ],
    routed_obligations: [
      {
        obligation_id: "obligation://sandbox/security/readiness/0001",
        category: "prompt_injection" as const,
        subject_refs: [
          {
            kind: "content_source" as const,
            source_token: "token://sandbox/security/source/0001",
            locator: { kind: "whole_source" as const }
          }
        ]
      }
    ]
  };
}

export async function runSandboxSecurityJudgeReadiness(input: Readonly<{
  timeout_ms: number;
  signal: AbortSignal;
  judge_protocol_id: SandboxSecurityJudgeProtocolId;
  judge_requested_model: string;
  transport: SandboxSecurityHttpTransport;
}>): Promise<string> {
  if (input.timeout_ms !== READINESS_TIMEOUT_MS) {
    fail("readiness_timeout_budget");
  }
  const dispatch = resolveSandboxSecurityBenchmarkJudgeProtocolDispatch(
    input.judge_protocol_id
  );
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort(input.signal.reason ?? "caller_cancelled");
  };
  if (input.signal.aborted) {
    fail("caller_cancelled");
  }
  input.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort("readiness_timeout");
  }, READINESS_TIMEOUT_MS);
  try {
    const payload = readinessSanitizedPayload();
    const body = dispatch.create_request(
      payload,
      { judge_requested_model: input.judge_requested_model }
    ).body;
    const response = await input.transport.request({
      provider: "openai",
      operation: dispatch.operation,
      body,
      signal: controller.signal,
      max_response_bytes: 65536
    });
    if (response.status !== 200) {
      fail("judge_readiness_failed");
    }
    if (response.content_type !== "application/json") {
      fail("judge_readiness_failed");
    }
    const parsed = dispatch.parse_response(
      response.body,
      payload
    );
    return assertJudgeResolvedModel(parsed.model);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === "readiness_timeout") {
      fail("judge_readiness_timeout");
    }
    if (
      error instanceof Error &&
      error.message.startsWith(`${INVALID}:`)
    ) {
      throw error;
    }
    fail("judge_readiness_failed");
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onAbort);
  }
}

async function defaultJudgeReadiness(input: Readonly<{
  timeout_ms: number;
  signal: AbortSignal;
}>, liveConfig: SandboxSecurityLiveCaptureConfig): Promise<Readonly<{
  resolved_model: string;
  transport: SandboxSecurityHttpTransport;
}>> {
  if (liveConfig.production_config === null) {
    fail("missing_live_config");
  }
  const transport = createSandboxSecurityProductionTransport(
    liveConfig.production_config
  );
  const resolved_model = await runSandboxSecurityJudgeReadiness({
    ...input,
    judge_protocol_id: liveConfig.binding.judge_protocol_id,
    judge_requested_model: liveConfig.binding.judge_requested_model,
    transport
  });
  return Object.freeze({
    resolved_model,
    transport
  });
}

interface SandboxSecurityBuiltCandidatePackage {
  readonly staging_serialized: string;
  readonly candidate_package_sha256: string;
  readonly cassette_tree_sha256: string;
  readonly decisions_tree_sha256: string;
}

function classifyAcceptanceBlockingProviderOutcome(
  accumulator: Readonly<SandboxSecurityCaptureAccumulator>
): string {
  for (const unit of accumulator.inputs) {
    for (const [slot, attempts] of [
      ["ollama", unit.ollama],
      ["judge", unit.judge]
    ] as const) {
      const finalAttempt = attempts.at(-1);
      if (finalAttempt?.status === "http_error") {
        return `${slot}_http_error_${finalAttempt.http_status}`;
      }
      if (finalAttempt?.status === "transport_error") {
        return `${slot}_transport_error_${finalAttempt.error_code}`;
      }
      if (finalAttempt?.status === "signal_termination") {
        return `${slot}_signal_termination_${finalAttempt.termination_reason}`;
      }
    }
    const judgeFinal = unit.judge.at(-1);
    const ollamaFinal = unit.ollama.at(-1);
    if (
      judgeFinal?.status === "response" &&
      ollamaFinal?.status !== "response"
    ) {
      return "judge_response_without_local_response";
    }
  }
  return "unclassified";
}

function buildCandidatePackage(input: Readonly<{
  fixture_ids: readonly string[];
  decisions: readonly Readonly<SandboxSecurityDecision>[];
  accumulator: Readonly<SandboxSecurityCaptureAccumulator>;
  inputs_tree_sha256: string;
  live_binding: SandboxSecurityLiveBinding;
  judge_resolved_model: string;
  provenance: "production_permissioned_v1" | "test_injected_v1";
}>): Readonly<SandboxSecurityBuiltCandidatePackage> {
  const judgeResolvedModel = assertJudgeResolvedModel(input.judge_resolved_model);
  assertCapturedJudgeResponseModels(input.accumulator, judgeResolvedModel);
  const judgeBinding = deepFreeze({
    judge_protocol_id: input.live_binding.judge_protocol_id,
    judge_endpoint_policy_id: input.live_binding.judge_endpoint_policy_id,
    judge_base_url: input.live_binding.judge_base_url,
    judge_endpoint_url: input.live_binding.judge_endpoint_url,
    judge_requested_model: input.live_binding.judge_requested_model,
    judge_resolved_model: judgeResolvedModel
  });
  const judgeBindingSha256 = hashSandboxSecurityBenchmarkJudgeBinding(
    judgeBinding
  );

  if (input.decisions.length !== input.fixture_ids.length) {
    fail("decision_count_mismatch");
  }
  if (input.accumulator.inputs.length !== input.fixture_ids.length) {
    fail("cassette_count_mismatch");
  }
  if (input.accumulator.qualification_inventory === null) {
    fail("missing_qualification_inventory");
  }
  if (input.accumulator.qualification_prewarm === null) {
    fail("missing_qualification_prewarm");
  }

  const decisionHashes: string[] = [];
  const decisionTreeInventory: Array<Readonly<{ path: string; sha256: string }>> = [];
  const decisionEnvelopes: unknown[] = [];
  for (let index = 0; index < input.fixture_ids.length; index += 1) {
    const fixtureId = input.fixture_ids[index]!;
    const decision = input.decisions[index]!;
    const envelope = buildSandboxSecurityCandidateDecisionEnvelope(
      fixtureId,
      decision
    );
    const projectionSha = envelope.decision_projection_sha256;
    decisionHashes.push(projectionSha);
    const filename = `${fixtureId}.json`;
    const serialized = `${JSON.stringify(envelope)}\n`;
    decisionEnvelopes.push(envelope);
    decisionTreeInventory.push(
      Object.freeze({ path: filename, sha256: sha256Text(serialized) })
    );
  }

  const cassetteInputs = input.accumulator.inputs.map((unit, index) =>
    deepFreeze({
      fixture_id: input.fixture_ids[index]!,
      ollama: unit.ollama,
      judge: unit.judge,
      decision_projection_sha256: decisionHashes[index]!,
      judge_binding_sha256: judgeBindingSha256
    })
  );

  const digestFromInventory = (() => {
    const inventory = input.accumulator.qualification_inventory;
    const finalAttempt = inventory?.at(-1);
    if (
      finalAttempt?.status === "response" &&
      isPlainObject(finalAttempt.normalized_response) &&
      typeof finalAttempt.normalized_response.digest === "string"
    ) {
      return finalAttempt.normalized_response.digest;
    }
    fail("missing_qualification_inventory");
  })();

  const captureManifest = deepFreeze({
    schema_version: SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION,
    inputs_tree_sha256: input.inputs_tree_sha256,
    fixture_count: input.fixture_ids.length,
    execution_profile_id:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_EXECUTION_PROFILE_ID,
    readiness_timeout_ms:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.readiness_timeout_ms,
    qualification_timeout_ms:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms,
    local_detector_slot_timeout_ms:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.local_detector_slot_timeout_ms,
    judge_detector_slot_timeout_ms:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.judge_detector_slot_timeout_ms,
    normal_work_budget_ms:
      SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.normal_work_budget_ms,
    ollama_model: OLLAMA_MODEL,
    ollama_digest: digestFromInventory,
    ollama_qualification: {
      inventory: input.accumulator.qualification_inventory,
      prewarm: input.accumulator.qualification_prewarm
    },
    ...judgeBinding,
    judge_binding_sha256: judgeBindingSha256,
    local_prompt_version: SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION,
    judge_prompt_version: SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION,
    local_schema_version: LOCAL_SCHEMA_VERSION,
    judge_schema_version: JUDGE_SCHEMA_VERSION,
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
  });

  const cassette = deepFreeze({
    schema_version: "sandbox-security-benchmark-candidate-cassette.v2" as const,
    judge_binding_sha256: judgeBindingSha256,
    inputs: cassetteInputs
  });
  try {
    assertSandboxSecurityBenchmarkAcceptedProviderOutcomes(
      cassette as never
    );
  } catch {
    fail(
      `provider_outcome_not_acceptance_capable:${
        classifyAcceptanceBlockingProviderOutcome(input.accumulator)
      }`
    );
  }
  const captureManifestSha256 = hashSandboxSecurityBenchmarkCanonicalJson(
    captureManifest
  );

  const decisionsTreeSha256 = hashSandboxSecurityBenchmarkCanonicalJson(
    decisionTreeInventory.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    )
  );
  const cassetteTreeSha256 = hashSandboxSecurityBenchmarkCandidateCassette(cassette);
  const candidatePackage = deepFreeze({
    schema_version: "sandbox-security-benchmark-candidate-package.v1" as const,
    fixture_count: input.fixture_ids.length,
    provenance: input.provenance,
    inputs_tree_sha256: input.inputs_tree_sha256,
    decisions_tree_sha256: decisionsTreeSha256,
    cassette_tree_sha256: cassetteTreeSha256,
    capture_manifest_sha256: captureManifestSha256
  });
  const stagingEnvelope = deepFreeze({
    schema_version: CANDIDATE_STAGING_SCHEMA_VERSION,
    capture_manifest: captureManifest,
    cassette,
    package: candidatePackage,
    decisions: Object.freeze(decisionEnvelopes)
  });
  const stagingSerialized = `${JSON.stringify(stagingEnvelope)}\n`;
  if (Buffer.byteLength(stagingSerialized, "utf8") > MAX_CANDIDATE_STAGING_BYTES) {
    fail("candidate_staging_too_large");
  }

  return {
    staging_serialized: stagingSerialized,
    candidate_package_sha256: sha256Text(stagingSerialized),
    cassette_tree_sha256: cassetteTreeSha256,
    decisions_tree_sha256: decisionsTreeSha256
  };
}

function captureOutputBindingFromStat(
  stat: Readonly<{ dev: bigint; ino: bigint }>
): string {
  return `${stat.dev}:${stat.ino}`;
}

function assertCaptureOutputBinding(value: unknown): string {
  if (typeof value !== "string" || !CAPTURE_OUTPUT_BINDING.test(value)) {
    fail("capture_output_binding_invalid");
  }
  return value;
}

function candidateStagingPath(captureOutputRoot: string): string {
  return join(captureOutputRoot, CANDIDATE_STAGING_FILENAME);
}

function prepareInjectableCaptureOutput(captureOutputRoot: string): string {
  const path = candidateStagingPath(captureOutputRoot);
  try {
    writeFileSync(path, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch {
    fail("candidate_staging_already_exists");
  }
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== 0n || stat.nlink !== 1n) {
    fail("candidate_staging_invalid");
  }
  return captureOutputBindingFromStat(stat);
}

interface SandboxSecurityBoundCaptureOutput {
  readonly fd: number;
  readonly path: string;
  readonly binding: string;
}

function openBoundCaptureOutput(
  captureOutputRoot: string,
  rawBinding: unknown,
  allowInitializedFile: boolean
): SandboxSecurityBoundCaptureOutput {
  const binding = assertCaptureOutputBinding(rawBinding);
  const path = candidateStagingPath(captureOutputRoot);
  let fd: number;
  try {
    fd = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW
    );
  } catch {
    fail("capture_output_path_changed");
  }
  const stat = fstatSync(fd, { bigint: true });
  if (
    !stat.isFile() ||
    (!allowInitializedFile && stat.size !== 0n) ||
    stat.nlink !== 1n ||
    captureOutputBindingFromStat(stat) !== binding
  ) {
    closeSync(fd);
    fail("capture_output_binding_changed");
  }
  return Object.freeze({ fd, path, binding });
}

function writeBoundCaptureOutput(
  output: Readonly<SandboxSecurityBoundCaptureOutput>,
  serialized: string
): void {
  const before = fstatSync(output.fd, { bigint: true });
  if (
    !before.isFile() ||
    before.size !== 0n ||
    before.nlink !== 1n ||
    captureOutputBindingFromStat(before) !== output.binding
  ) {
    fail("capture_output_binding_changed");
  }
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength === 0 || byteLength > MAX_CANDIDATE_STAGING_BYTES) {
    fail("candidate_staging_size_invalid");
  }
  writeFileSync(output.fd, serialized, { encoding: "utf8" });
  fsyncSync(output.fd);
  const after = fstatSync(output.fd, { bigint: true });
  if (
    !after.isFile() ||
    after.size !== BigInt(byteLength) ||
    after.nlink !== 1n ||
    captureOutputBindingFromStat(after) !== output.binding
  ) {
    fail("candidate_staging_write_invalid");
  }
}

interface SandboxSecurityCandidateAcknowledgementReader {
  waitFor(frame: Readonly<SandboxSecurityCandidateOutputFrame>): Promise<void>;
  dispose(): void;
}

function createSandboxSecurityCandidateAcknowledgementReader(): SandboxSecurityCandidateAcknowledgementReader {
  let pending = "";
  let queued: unknown[] = [];
  let closed = false;
  let terminalError: Error | undefined;
  let waiter:
    | Readonly<{
        expected: Readonly<{
          output_event: "candidate_progress" | "capture_complete";
          ordinal: number;
        }>;
        resolve: () => void;
        reject: (error: unknown) => void;
      }>
    | undefined;

  const rejectReader = (error: Error): void => {
    if (terminalError === undefined) terminalError = error;
    closed = true;
    if (waiter !== undefined) {
      const current = waiter;
      waiter = undefined;
      current.reject(terminalError);
    }
  };

  const consumeLine = (line: string): void => {
    if (line.length === 0) return;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      rejectReader(new Error(`${INVALID}:candidate_output_ack_invalid`));
      return;
    }
    if (waiter === undefined) {
      queued.push(value);
      return;
    }
    const current = waiter;
    waiter = undefined;
    try {
      assertSandboxSecurityCandidateOutputAcknowledgement(value, current.expected);
      current.resolve();
    } catch {
      current.reject(new Error(`${INVALID}:candidate_output_ack_invalid`));
      rejectReader(new Error(`${INVALID}:candidate_output_ack_invalid`));
    }
  };

  const onData = (chunk: string): void => {
    if (closed) return;
    pending += chunk;
    if (Buffer.byteLength(pending, "utf8") > 64 * 1024) {
      rejectReader(new Error(`${INVALID}:candidate_output_ack_too_large`));
      return;
    }
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  };
  const onEnd = (): void => {
    if (closed) return;
    if (pending.trim().length > 0) consumeLine(pending.trim());
    if (!closed) {
      rejectReader(new Error(`${INVALID}:candidate_output_ack_closed`));
    }
  };
  const onError = (): void => {
    rejectReader(new Error(`${INVALID}:candidate_output_ack_closed`));
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onData);
  process.stdin.on("end", onEnd);
  process.stdin.on("error", onError);

  return {
    waitFor(frame) {
      const expected = {
        output_event: frame.event,
        ordinal:
          frame.event === "candidate_progress"
            ? frame.input_ordinal
            : frame.decision_count
      } as const;
      if (queued.length > 0) {
        const value = queued.shift();
        try {
          assertSandboxSecurityCandidateOutputAcknowledgement(value, expected);
          return Promise.resolve();
        } catch {
          const error = new Error(`${INVALID}:candidate_output_ack_invalid`);
          rejectReader(error);
          return Promise.reject(error);
        }
      }
      if (closed) {
        return Promise.reject(
          terminalError ?? new Error(`${INVALID}:candidate_output_ack_closed`)
        );
      }
      return new Promise<void>((resolvePromise, rejectPromise) => {
        if (waiter !== undefined) {
          rejectPromise(new Error(`${INVALID}:candidate_output_ack_invalid`));
          return;
        }
        waiter = Object.freeze({
          expected,
          resolve: resolvePromise,
          reject: rejectPromise
        });
      });
    },
    dispose() {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
      process.stdin.pause();
      queued = [];
      pending = "";
    }
  };
}

export async function runSandboxSecurityLiveCapture(
  rawPorts: Readonly<SandboxSecurityLiveCapturePorts>,
  rawOptions: Readonly<SandboxSecurityLiveCaptureOptions> = {}
): Promise<Readonly<SandboxSecurityLiveCaptureResult>> {
  if (!isPlainObject(rawPorts)) fail("ports_invalid");
  if (!isPlainObject(rawOptions)) fail("candidate_output_options_invalid");
  const candidateOutput = rawOptions.candidate_output ?? "bound_file";
  if (candidateOutput !== "bound_file" && candidateOutput !== "stream") {
    fail("candidate_output_mode_invalid");
  }
  const outputFrameWriter = rawOptions.output_frame_writer;
  if (
    candidateOutput === "stream" &&
    (outputFrameWriter === undefined ||
      outputFrameWriter === null ||
      typeof outputFrameWriter !== "object" ||
      typeof outputFrameWriter.write !== "function")
  ) {
    fail("candidate_output_writer_missing");
  }
  if (candidateOutput === "bound_file" && outputFrameWriter !== undefined) {
    fail("candidate_output_writer_unexpected");
  }
  const productionProvenance = !isInjectableCapturePorts(rawPorts);
  const ports = snapshotLiveCapturePorts(rawPorts);
  rejectForbiddenPorts(ports, productionProvenance);

  // The parent validates these paths before launch; capture output stays write-only.
  const bundleRoot = assertAbsolutePath(ports.bundle_root, "bundle_root");
  const inputRoot = assertRealDirectory(ports.input_root, "input_root");
  const captureOutputRoot = assertAbsolutePath(
    ports.capture_output_root,
    "capture_output_root"
  );

  if (!isPathInside(bundleRoot, inputRoot)) fail("input_root_escape");
  if (captureOutputRoot !== join(bundleRoot, "capture-output")) {
    fail("capture_output_escape");
  }
  if (productionProvenance) {
    assertExactProductionPermissions({
      bundle_root: bundleRoot,
      input_root: inputRoot,
      capture_output_root: captureOutputRoot,
      capture_output_file: candidateStagingPath(captureOutputRoot)
    });
  }

  if (typeof ports.inputs_tree_sha256 !== "string" || !SHA256.test(ports.inputs_tree_sha256)) {
    fail("inputs_tree_sha256_invalid");
  }

  const fixtureIds = ports.fixture_ids
    ? [...ports.fixture_ids]
    : listInputFixtureIds(inputRoot);

  if (fixtureIds.length === 0) fail("fixture_ids_empty");
  // Production requires 300; unit tests may use smaller fake bundles via fixture_ids.
  if (ports.fixture_ids === undefined && fixtureIds.length !== SANDBOX_SECURITY_CAPTURE_INPUT_COUNT) {
    fail("fixture_count_not_300");
  }

  if (ports.skip_input_hash_check !== true) {
    const actual = hashSandboxSecurityBenchmarkTree(inputRoot);
    if (actual !== ports.inputs_tree_sha256) {
      fail("inputs_tree_hash_mismatch");
    }
  }

  // Snapshot, normalize, freeze, and hash all input envelopes before readiness.
  // The evaluation loop consumes only this frozen memory so a post-snapshot
  // input replacement cannot change what capture evaluates.
  const frozenEnvelopes = snapshotInputEnvelopes(inputRoot, fixtureIds);

  const captureOutputBinding =
    ports.capture_output_binding ??
    (productionProvenance
      ? fail("capture_output_binding_invalid")
      : prepareInjectableCaptureOutput(captureOutputRoot));
  // Validate the pre-created staging inode before readiness in both output
  // modes. Stream mode delegates writes to the parent, but still needs the
  // child-side binding check to reject a replaced capability.
  const boundOutput = openBoundCaptureOutput(
    captureOutputRoot,
    captureOutputBinding,
    candidateOutput === "stream"
  );
  let boundOutputOpen = true;

  async function emitOutputFrame(frame: SandboxSecurityCandidateOutputFrame): Promise<void> {
    if (outputFrameWriter === undefined) {
      fail("candidate_output_writer_missing");
    }
    try {
      await outputFrameWriter.write(frame);
    } catch {
      fail("candidate_output_write_failed");
    }
  }

  try {
  const liveConfig = resolveLiveCaptureConfig(ports);

  const events: SandboxSecurityLiveCaptureEvent[] = [];
  const runtime = ports.runtime ?? defaultRuntime();
  const parentSignal = ports.abort_signal;

  if (parentSignal?.aborted) fail("caller_cancelled");

  // Judge readiness first: independent 40000 ms budget, no retry, not a decision.
  const readinessController = new AbortController();
  const onParentAbort = (): void => {
    readinessController.abort(parentSignal?.reason ?? "caller_cancelled");
  };
  if (parentSignal !== undefined) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  let judgeResolvedModel: string | undefined;
  let readinessTransport: SandboxSecurityHttpTransport | undefined;
  try {
    const runReadiness = ports.run_judge_readiness ?? ((input) =>
      defaultJudgeReadiness(input, liveConfig));
    const readinessResult = await runReadiness({
      timeout_ms: READINESS_TIMEOUT_MS,
      signal: readinessController.signal
    });
    if (typeof readinessResult === "string") {
      judgeResolvedModel = assertJudgeResolvedModel(readinessResult);
      if (liveConfig.production_config !== null) {
        readinessTransport = createSandboxSecurityProductionTransport(
          liveConfig.production_config
        );
      } else if (isInjectableCapturePorts(ports)) {
        readinessTransport = Object.freeze({
          async request() {
            fail("unexpected_transport_request");
          }
        });
      } else {
        fail("missing_live_config");
      }
    } else if (
      readinessResult !== null &&
      typeof readinessResult === "object" &&
      !Array.isArray(readinessResult)
    ) {
      judgeResolvedModel = assertJudgeResolvedModel(
        (readinessResult as { resolved_model?: unknown }).resolved_model
      );
      const transport = (readinessResult as { transport?: unknown }).transport;
      if (
        transport === null ||
        (typeof transport !== "object" && typeof transport !== "function")
      ) {
        fail("judge_readiness_transport");
      }
      readinessTransport = transport as SandboxSecurityHttpTransport;
    } else {
      // undefined / null / non-object: treat as missing resolved model.
      fail("judge_resolved_model");
    }
  } catch (error) {
    if (
      readinessController.signal.aborted &&
      (readinessController.signal.reason === "caller_cancelled" ||
        parentSignal?.aborted)
    ) {
      fail("caller_cancelled");
    }
    if (error instanceof Error && error.message.startsWith(`${INVALID}:`)) {
      throw error;
    }
    fail("judge_readiness_failed");
  } finally {
    if (parentSignal !== undefined) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  }
  events.push("judge_readiness");

  if (judgeResolvedModel === undefined) fail("judge_resolved_model");
  if (readinessTransport === undefined) fail("judge_readiness_transport");

  if (parentSignal?.aborted) fail("caller_cancelled");
  events.push("capture_child_started");

  const sinkFactory = ports.create_sink ?? createSandboxSecurityCaptureSink;
  const sink = sinkFactory();
  const engineSink = captureSinkFacade(sink);

  const createEngine =
    ports.create_engine ??
    ((input) =>
      createSandboxSecurityLiveCaptureEngine({
        runtime: input.runtime,
        capture_sink: input.capture_sink,
        transport: input.transport,
        judge_protocol_id: liveConfig.binding.judge_protocol_id,
        ollama_digest: liveConfig.binding.ollama_digest,
        judge_endpoint_policy_id: liveConfig.binding.judge_endpoint_policy_id,
        judge_base_url: liveConfig.binding.judge_base_url,
        judge_endpoint_url: liveConfig.binding.judge_endpoint_url,
        judge_requested_model: liveConfig.binding.judge_requested_model
      }));

  const engine = await createEngine({
    runtime,
    capture_sink: engineSink,
    transport: readinessTransport
  });
  events.push("engine_created");

  const decisions: SandboxSecurityDecision[] = [];

  for (let index = 0; index < fixtureIds.length; index += 1) {
    if (parentSignal?.aborted) fail("caller_cancelled");
    const fixtureId = fixtureIds[index]!;
    const envelope = frozenEnvelopes[index]!;

    sink.beginInput();
    let completedDecision: SandboxSecurityDecision | undefined;
    try {
      const decision = await engine.evaluate(
        envelope.evaluation_request as never,
        parentSignal
      );
      decisions.push(decision);
      completedDecision = decision;
    } finally {
      sink.endInput();
    }
    if (completedDecision !== undefined && candidateOutput === "stream") {
      const frame: SandboxSecurityCandidateProgressFrame = {
        schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
        event: "candidate_progress",
        input_ordinal: index + 1,
        fixture_count: fixtureIds.length,
        completed_count: decisions.length,
        decision: buildSandboxSecurityCandidateDecisionEnvelope(
          fixtureId,
          completedDecision
        )
      };
      await emitOutputFrame(frame);
    }
  }
  events.push("inputs_complete");

  // Production always processes exactly 300 units and must fully drain.
  // Unit tests may inject a smaller ordered fixture_ids list via ports.
  if (fixtureIds.length === SANDBOX_SECURITY_CAPTURE_INPUT_COUNT) {
    sink.assertDrained();
  } else {
    const partial =
      "snapshot" in sink &&
      typeof (sink as { snapshot?: unknown }).snapshot === "function"
        ? (sink as { snapshot: () => Readonly<SandboxSecurityCaptureAccumulator> }).snapshot()
        : null;
    if (partial === null) fail("sink_snapshot_unavailable");
    if (partial.closed_input_count !== fixtureIds.length) {
      fail("closed_input_count_mismatch");
    }
    if (partial.state === "input_open" || partial.state === "failed") {
      fail("sink_not_ready_for_candidate");
    }
  }
  events.push("sink_drained");

  const snapshot =
    "snapshot" in sink && typeof (sink as { snapshot?: unknown }).snapshot === "function"
      ? (sink as { snapshot: () => Readonly<SandboxSecurityCaptureAccumulator> }).snapshot()
      : fail("sink_snapshot_unavailable");

  if (snapshot.closed_input_count !== fixtureIds.length) {
    fail("closed_input_count_mismatch");
  }

  const written = buildCandidatePackage({
    fixture_ids: fixtureIds,
    decisions,
    accumulator: snapshot,
    inputs_tree_sha256: ports.inputs_tree_sha256,
    live_binding: liveConfig.binding,
    judge_resolved_model: judgeResolvedModel,
    provenance: productionProvenance
      ? "production_permissioned_v1"
      : "test_injected_v1"
  });
  if (candidateOutput === "stream") {
    const finalFrame: SandboxSecurityCandidateCompleteFrame = {
      schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
      event: "capture_complete",
      status: "capture_complete",
      decision_count: decisions.length,
      fixture_count: fixtureIds.length,
      candidate_package_sha256: written.candidate_package_sha256,
      staging_serialized: written.staging_serialized
    };
    await emitOutputFrame(finalFrame);
  } else {
    if (boundOutput === null) fail("candidate_output_writer_missing");
    writeBoundCaptureOutput(boundOutput, written.staging_serialized);
    closeSync(boundOutput.fd);
    boundOutputOpen = false;
    if (
      !productionProvenance &&
      (
        typeof process.permission?.has !== "function" ||
        process.permission.has("fs.write", captureOutputRoot)
      )
    ) {
      materializeSandboxSecurityCandidatePackage({
        capture_output_root: captureOutputRoot,
        capture_output_binding: captureOutputBinding,
        fixture_ids: fixtureIds,
        candidate_package_sha256: written.candidate_package_sha256
      });
    }
  }
  events.push("candidate_written");
  events.push("capture_complete");

  const stdout_summary = JSON.stringify({
    status: "capture_complete",
    decision_count: decisions.length,
    fixture_count: fixtureIds.length,
    candidate_root: "candidate",
    cassette_tree_sha256: written.cassette_tree_sha256,
    decisions_tree_sha256: written.decisions_tree_sha256,
    candidate_package_sha256: written.candidate_package_sha256
  });

  return deepFreeze({
    events: Object.freeze([...events]),
    fixture_ids: Object.freeze([...fixtureIds]),
    decision_count: decisions.length,
    readiness_counted_as_decision: false as const,
    candidate_root: join(captureOutputRoot, "candidate"),
    cassette_tree_sha256: written.cassette_tree_sha256,
    decisions_tree_sha256: written.decisions_tree_sha256,
    candidate_package_sha256: written.candidate_package_sha256,
    stdout_summary
  });
  } finally {
    if (boundOutputOpen) {
      try {
        if (boundOutput !== null) closeSync(boundOutput.fd);
      } catch {
        // Preserve the original fail-closed capture error.
      }
    }
  }
}

function parseArgv(argv: readonly string[]): {
  bundle_root?: string;
  input_root?: string;
  capture_output?: string;
  capture_output_binding?: string;
  inputs_tree_sha256?: string;
} {
  const out: {
    bundle_root?: string;
    input_root?: string;
    capture_output?: string;
    capture_output_binding?: string;
    inputs_tree_sha256?: string;
  } = {};
  for (const token of argv) {
    if (token.startsWith("--bundle-root=")) {
      out.bundle_root = token.slice("--bundle-root=".length);
      continue;
    }
    if (token.startsWith("--input-root=")) {
      out.input_root = token.slice("--input-root=".length);
      continue;
    }
    if (token.startsWith("--capture-output=")) {
      out.capture_output = token.slice("--capture-output=".length);
      continue;
    }
    if (token.startsWith("--capture-output-binding=")) {
      out.capture_output_binding = token.slice("--capture-output-binding=".length);
      continue;
    }
    if (token.startsWith("--inputs-tree-sha256=")) {
      out.inputs_tree_sha256 = token.slice("--inputs-tree-sha256=".length);
      continue;
    }
    if (token === "--truth" || token.startsWith("--truth=") || token.includes("truth")) {
      fail("truth_argument");
    }
    if (token.includes("evaluate") || token.includes("metrics")) {
      fail("evaluate_or_metrics_argument");
    }
    fail("unknown_cli_argument");
  }
  return out;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  if (
    options.bundle_root === undefined ||
    options.input_root === undefined ||
    options.capture_output === undefined ||
    options.capture_output_binding === undefined ||
    options.inputs_tree_sha256 === undefined
  ) {
    fail("missing_cli_arguments");
  }

  const acknowledgementReader =
    createSandboxSecurityCandidateAcknowledgementReader();
  try {
    await runSandboxSecurityLiveCapture(
      {
        bundle_root: options.bundle_root,
        input_root: options.input_root,
        capture_output_root: options.capture_output,
        capture_output_binding: options.capture_output_binding,
        inputs_tree_sha256: options.inputs_tree_sha256
      },
      {
        candidate_output: "stream",
        output_frame_writer: {
          async write(frame) {
            await new Promise<void>((resolvePromise, rejectPromise) => {
              try {
                process.stdout.write(
                  `${JSON.stringify(frame)}\n`,
                  "utf8",
                  (error?: Error | null) => {
                    if (error !== undefined && error !== null) {
                      rejectPromise(error);
                    } else {
                      resolvePromise();
                    }
                  }
                );
              } catch (error) {
                rejectPromise(error);
              }
            });
            await acknowledgementReader.waitFor(frame);
          }
        }
      }
    );
  } finally {
    acknowledgementReader.dispose();
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error_code: safeCliErrorCode(error) })}\n`
    );
    process.exitCode = 1;
  });
}
