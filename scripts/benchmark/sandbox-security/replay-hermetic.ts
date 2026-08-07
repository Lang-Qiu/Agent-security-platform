import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeSync
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson
} from "../../../engines/sandbox/src/security/canonical-json.ts";
import {
  snapshotSandboxSecurityDirectory,
  snapshotSandboxSecurityFile,
  snapshotSandboxSecurityJson,
  writeSandboxSecurityExclusiveAtomicFile
} from "./fs-snapshot.ts";

const INVALID = "sandbox_security_hermetic_replay_reject";
const INPUT_COUNT = 300;
const SHA256 = /^[a-f0-9]{64}$/u;
const FIXTURE_ID = /^ssb-v1-\d{4}$/u;
const MAX_CHILD_OUTPUT_BYTES = 1_048_576;
const MAX_CHILD_RUNTIME_MS = 240_000;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const REPLAY_INPUT_SCHEMA = "sandbox-security-hermetic-replay-input.v2";
const CHILD_RESULT_SCHEMA = "sandbox-security-hermetic-replay-result.v1";
const NETWORK_PROOF_SCHEMA = "sandbox-security-hermetic-network-proof.v1";
const PROC_NET_ROOT = "/proc/self/net";
const NETWORK_NAMESPACE_PATH = "/proc/self/ns/net";
const NETWORK_NAMESPACE_ID = /^net:\[\d+\]$/u;
const NETWORK_TABLES = Object.freeze(["tcp", "tcp6", "udp", "udp6"] as const);
const MAX_NETWORK_TABLE_ENTRIES = 16 * 1024;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = dirname(SCRIPT_PATH);
const ENGINE_SECURITY_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/security"
);
const ENGINE_PRODUCTION_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/security-production"
);
const ENGINE_BASE_FILTER_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/base-filter"
);
const ENGINE_MONITORING_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/monitoring"
);
const ENGINE_SIMULATED_TOOLS_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/simulated-tools"
);
const SHARED_ROOT = resolve(SCRIPT_ROOT, "../../../shared");
const REPLAY_TRANSPORT_PATH = join(SCRIPT_ROOT, "replay-transport.ts");
const FS_SNAPSHOT_PATH = join(SCRIPT_ROOT, "fs-snapshot.ts");
const EVALUATE_PATH = join(SCRIPT_ROOT, "evaluate.ts");
const CONTRACTS_PATH = join(SCRIPT_ROOT, "contracts.ts");
const CANONICAL_JSON_PATH = resolve(
  SCRIPT_ROOT,
  "../../../engines/sandbox/src/security/canonical-json.ts"
);
const CORPUS_ROOT = resolve(
  SCRIPT_ROOT,
  "../../../samples/sandbox-security-benchmark/v1"
);
const SECRET_ENV_KEYS = Object.freeze([
  "SANDBOX_SECURITY_JUDGE_PROTOCOL",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "SANDBOX_SECURITY_JUDGE_BASE_URL",
  "SANDBOX_SECURITY_JUDGE_MODEL",
  "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
  "SANDBOX_SECURITY_ENABLE_JUDGE"
] as const);
const FORBIDDEN_CHILD_ENV_KEYS = Object.freeze([
  ...SECRET_ENV_KEYS,
  "OPENAI_API_KEY",
  "NODE_OPTIONS",
  "NODE_PATH",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY"
] as const);
const CHILD_ENV = Object.freeze({
  PATH: "/usr/bin:/bin",
  LANG: "C",
  TZ: "UTC",
  NODE_OPTIONS: undefined,
  SANDBOX_SECURITY_JUDGE_PROTOCOL: undefined,
  SANDBOX_SECURITY_JUDGE_API_KEY: undefined,
  SANDBOX_SECURITY_JUDGE_BASE_URL: undefined,
  SANDBOX_SECURITY_JUDGE_MODEL: undefined,
  SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: undefined,
  SANDBOX_SECURITY_ENABLE_JUDGE: undefined
}) satisfies Readonly<Record<string, string | undefined>>;

type JsonRecord = Readonly<Record<string, unknown>>;

const RAW_CONTENT_KEYS = new Set([
  "arguments",
  "body",
  "content",
  "evaluation_request",
  "input",
  "messages",
  "output",
  "prompt",
  "raw_content",
  "raw_input",
  "target"
]);

export interface SandboxSecurityAnonymousReplayEnvelope {
  readonly ollama: unknown;
  readonly judge: unknown;
  readonly decision_projection_sha256: string;
  readonly judge_binding_sha256: string;
}

export interface SandboxSecurityHermeticReplayResult {
  readonly evaluated_inputs: 300;
  readonly network_attempts: number;
  readonly openai_key_present: false;
  readonly decision_projection_tree_sha256: string;
  readonly metrics: JsonRecord;
}

interface HermeticReplayPaths {
  readonly root: string;
  readonly staging_root: string;
  readonly input_root: string;
  readonly replay_input: string;
  readonly sealed_config: string;
  readonly projection_root: string;
  readonly truth_root: string;
  readonly expected_metrics: string;
  readonly result_path: string;
}

interface AnonymousReplayInputDocument {
  readonly schema_version: typeof REPLAY_INPUT_SCHEMA;
  readonly qualification: unknown;
  readonly sealed_config: JsonRecord;
  readonly inputs: readonly SandboxSecurityAnonymousReplayEnvelope[];
}

interface ChildProjection {
  readonly schema_version: string;
  readonly verdict: string;
  readonly action: string;
  readonly risk_level: string;
  readonly finding_count: number;
  readonly detector_run_count: number;
  readonly evidence_ref_count: number;
}

interface ChildProjectionResult {
  readonly projection: ChildProjection;
  readonly decision_projection_sha256: string;
}

interface EngineChildResult {
  readonly schema_version: typeof CHILD_RESULT_SCHEMA;
  readonly evaluated_inputs: number;
  readonly network_attempts: number;
  readonly openai_key_present: boolean;
  readonly network_proof: NetworkIsolationProof;
  readonly projections: readonly ChildProjectionResult[];
}

interface EvaluatorChildResult {
  readonly schema_version: typeof CHILD_RESULT_SCHEMA;
  readonly metrics: JsonRecord;
}

type NetworkTableName = (typeof NETWORK_TABLES)[number];

interface NetworkTableSnapshot {
  readonly entry_count: number;
  readonly sha256: string;
}

interface NetworkNamespaceSnapshot {
  readonly tcp: NetworkTableSnapshot;
  readonly tcp6: NetworkTableSnapshot;
  readonly udp: NetworkTableSnapshot;
  readonly udp6: NetworkTableSnapshot;
}

interface NetworkIsolationProof {
  readonly schema_version: typeof NETWORK_PROOF_SCHEMA;
  readonly before: NetworkNamespaceSnapshot;
  readonly after: NetworkNamespaceSnapshot;
  readonly net_permission_granted: boolean;
  readonly socket_tables_unchanged: boolean;
  readonly network_attempts: number;
}

interface ParentNetworkNamespaceProof {
  readonly parent_namespace: string;
  readonly child_namespace: string;
  readonly network_attempts: 0;
}

function fail(code: string): never {
  const error = new Error(`${INVALID}:${code}`);
  error.name = INVALID;
  throw error;
}

export function assertNoRawContentLeaks(value: unknown): void {
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!isPlainRecord(current)) return;
    for (const [key, nested] of Object.entries(current)) {
      if (RAW_CONTENT_KEYS.has(key)) fail("raw_content_leak");
      visit(nested);
    }
  };
  visit(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function hasSandboxSecurityHermeticReadPermission(
  scope: string,
  hasPermission: (reference: string) => boolean,
  representative?: string
): boolean {
  if (hasPermission(scope)) return true;
  const directoryReference = scope.endsWith(sep) ? scope : `${scope}${sep}`;
  if (directoryReference !== scope && hasPermission(directoryReference)) return true;
  return representative !== undefined && hasPermission(representative);
}

export function assertSandboxSecurityHermeticReplayCompleteRun(input: Readonly<{
  input_count: number;
  accepted_metrics: unknown;
}>): void {
  if (
    !isPlainRecord(input) ||
    input.input_count !== INPUT_COUNT ||
    !isPlainRecord(input.accepted_metrics)
  ) {
    fail("accepted_seal_invalid");
  }
}

function exactRecord(value: unknown, keys: readonly string[]): JsonRecord {
  if (!isPlainRecord(value)) fail("record_invalid");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail("record_keys_invalid");
  }
  return value;
}

function assertAbsolutePath(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    resolve(value) !== value
  ) {
    fail(code);
  }
  return value;
}

function isPathWithin(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate));
  return (
    child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith("/"))
  );
}

function deepCloneJson(value: unknown, depth = 0, nodes = { count: 0 }): unknown {
  nodes.count += 1;
  if (nodes.count > 200_000 || depth > 64) fail("json_invalid");
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("json_invalid");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepCloneJson(item, depth + 1, nodes)));
  }
  if (!isPlainRecord(value)) fail("json_invalid");
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor" ||
      key === "fixture_id"
    ) {
      fail("fixture_identity_leak");
    }
    output[key] = deepCloneJson(value[key], depth + 1, nodes);
  }
  return Object.freeze(output);
}

function expectedFixtureIds(): readonly string[] {
  return Object.freeze(
    Array.from(
      { length: INPUT_COUNT },
      (_, index) => `ssb-v1-${String(index + 1).padStart(4, "0")}`
    )
  );
}

function validateAttempt(value: unknown): JsonRecord {
  if (!isPlainRecord(value) || typeof value.status !== "string") {
    fail("replay_attempt_invalid");
  }
  if (value.status === "response") {
    const response = exactRecord(value, [
        "status",
        "http_status",
        "content_type",
        "normalized_response"
      ]);
    if (
      response.http_status !== 200 ||
      response.content_type !== "application/json"
    ) {
      fail("replay_attempt_invalid");
    }
    return deepCloneJson(response) as JsonRecord;
  }
  if (value.status === "http_error") {
    const error = exactRecord(value, ["status", "http_status"]);
    if (
      typeof error.http_status !== "number" ||
      !Number.isInteger(error.http_status) ||
      error.http_status < 100 ||
      error.http_status > 599 ||
      error.http_status === 200
    ) {
      fail("replay_attempt_invalid");
    }
    return deepCloneJson(error) as JsonRecord;
  }
  if (value.status === "transport_error") {
    const error = exactRecord(value, ["status", "error_code"]);
    if (
      error.error_code !== "connection_failed" &&
      error.error_code !== "response_too_large" &&
      error.error_code !== "provider_response_invalid"
    ) {
      fail("replay_attempt_invalid");
    }
    return deepCloneJson(error) as JsonRecord;
  }
  if (value.status === "signal_termination") {
    const termination = exactRecord(value, ["status", "termination_reason"]);
    if (
      termination.termination_reason !== "slot_timeout" &&
      termination.termination_reason !== "work_budget"
    ) {
      fail("replay_attempt_invalid");
    }
    return deepCloneJson(termination) as JsonRecord;
  }
  fail("replay_attempt_invalid");
}

function validateAttemptSequence(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value) || value.length > 2) {
    fail("replay_attempt_sequence_invalid");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== value.length ||
    keys.some((key, index) => key !== String(index))
  ) {
    fail("replay_attempt_sequence_invalid");
  }
  const attempts = value.map((attempt) => validateAttempt(attempt));
  if (
    attempts.length === 2 &&
    (attempts[0]!.status !== "transport_error" ||
      attempts[0]!.error_code !== "connection_failed")
  ) {
    fail("replay_attempt_retry_invalid");
  }
  return Object.freeze(attempts);
}

/**
 * Validates the ordered capture envelopes and returns only anonymous transport
 * units. Fixture identity is deliberately consumed by this boundary and is
 * never part of the Engine child input.
 */
export function validateAndStripReplayEnvelopes(
  manifest: Readonly<{
    fixture_ids: readonly string[];
    judge_binding_sha256: string;
  }>,
  envelopes: readonly JsonRecord[]
): readonly SandboxSecurityAnonymousReplayEnvelope[] {
  const manifestRecord = exactRecord(manifest, [
    "fixture_ids",
    "judge_binding_sha256"
  ]);
  if (!Array.isArray(manifestRecord.fixture_ids)) fail("manifest_invalid");
  if (
    typeof manifestRecord.judge_binding_sha256 !== "string" ||
    !SHA256.test(manifestRecord.judge_binding_sha256)
  ) {
    fail("manifest_binding_invalid");
  }
  const fixtureIds = [...manifestRecord.fixture_ids];
  const expectedIds = expectedFixtureIds();
  if (
    fixtureIds.length !== INPUT_COUNT ||
    fixtureIds.some((value, index) => value !== expectedIds[index])
  ) {
    fail("fixture_order_invalid");
  }
  if (!Array.isArray(envelopes) || envelopes.length !== INPUT_COUNT) {
    fail("replay_envelope_count_invalid");
  }

  const output: SandboxSecurityAnonymousReplayEnvelope[] = [];
  for (let index = 0; index < envelopes.length; index += 1) {
    const envelope = envelopes[index];
    if (!isPlainRecord(envelope)) fail("replay_envelope_invalid");
    const keys = Object.keys(envelope).sort();
    const allowed = [
      "decision_projection_sha256",
      "fixture_id",
      "judge",
      "judge_binding_sha256",
      "ollama",
      "schema_version"
    ].sort();
    if (
      envelope.schema_version !== "sandbox-security-benchmark-replay.v2" ||
      keys.some((key) => !allowed.includes(key)) ||
      !Object.hasOwn(envelope, "schema_version") ||
      !Object.hasOwn(envelope, "fixture_id") ||
      !Object.hasOwn(envelope, "ollama") ||
      !Object.hasOwn(envelope, "judge") ||
      !Object.hasOwn(envelope, "decision_projection_sha256") ||
      !Object.hasOwn(envelope, "judge_binding_sha256")
    ) {
      fail("replay_envelope_keys_invalid");
    }
    const fixtureId = envelope.fixture_id;
    if (
      typeof fixtureId !== "string" ||
      !FIXTURE_ID.test(fixtureId) ||
      fixtureId !== expectedIds[index]
    ) {
      fail("replay_fixture_order_invalid");
    }
    const decisionHash = envelope.decision_projection_sha256;
    const judgeBindingHash = envelope.judge_binding_sha256;
    if (
      typeof decisionHash !== "string" ||
      !SHA256.test(decisionHash) ||
      typeof judgeBindingHash !== "string" ||
      !SHA256.test(judgeBindingHash)
    ) {
      fail("replay_hash_invalid");
    }
    if (manifestRecord.judge_binding_sha256 !== judgeBindingHash) {
      fail("replay_binding_mismatch");
    }
    const ollama = validateAttemptSequence(envelope.ollama);
    const judge = validateAttemptSequence(envelope.judge);
    const ollamaFinal = ollama.at(-1);
    const judgeFinal = judge.at(-1);
    if (
      judgeFinal !== undefined &&
      (ollamaFinal === undefined || ollamaFinal.status !== "response")
    ) {
      fail("judge_without_local_response");
    }
    output.push(
      Object.freeze({
        ollama,
        judge,
        decision_projection_sha256: decisionHash,
        judge_binding_sha256: judgeBindingHash
      })
    );
  }
  return Object.freeze(output);
}

function permissionArgs(scopes: readonly string[]): readonly string[] {
  return Object.freeze(
    scopes.map((scope) => `--allow-fs-read=${scope}`)
  );
}

function writeArgs(path: string): readonly string[] {
  return Object.freeze([`--allow-fs-write=${path}`]);
}

function permissionFlagValues(flag: string): readonly string[] {
  const prefix = `${flag}=`;
  const values: string[] = [];
  for (const token of process.execArgv) {
    if (token === flag) fail(`${flag.slice(2).replaceAll("-", "_")}_invalid`);
    if (token.startsWith(prefix)) values.push(token.slice(prefix.length));
  }
  return Object.freeze(values);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function assertExactHermeticChildPermissions(
  options: Readonly<Record<string, string>>
): void {
  if (process.execArgv.filter((token) => token === "--permission").length !== 1) {
    fail("native_permission_required");
  }
  const child = options["--child"];
  if (child !== "engine" && child !== "evaluator") fail("child_invalid");
  const resultPath = childOption(options, "--result");
  const expectedReadScopes = child === "engine"
    ? [
      SCRIPT_PATH,
      FS_SNAPSHOT_PATH,
      CANONICAL_JSON_PATH,
      REPLAY_TRANSPORT_PATH,
      CONTRACTS_PATH,
      ENGINE_SECURITY_ROOT,
      ENGINE_PRODUCTION_ROOT,
      ENGINE_BASE_FILTER_ROOT,
      ENGINE_MONITORING_ROOT,
      ENGINE_SIMULATED_TOOLS_ROOT,
      SHARED_ROOT,
      PROC_NET_ROOT,
      dirname(childOption(options, "--replay-input")),
      dirname(childOption(options, "--sealed-config"))
    ]
    : [
      SCRIPT_PATH,
      FS_SNAPSHOT_PATH,
      CANONICAL_JSON_PATH,
      EVALUATE_PATH,
      CONTRACTS_PATH,
      SHARED_ROOT,
      dirname(childOption(options, "--truth-root")),
      join(dirname(childOption(options, "--truth-root")), "manifest.json"),
      dirname(childOption(options, "--projection-root")),
      childOption(options, "--expected-metrics")
    ];
  const readScopes = permissionFlagValues("--allow-fs-read");
  const writeScopes = permissionFlagValues("--allow-fs-write");
  if (!sameStrings(readScopes, expectedReadScopes)) {
    fail("fs_read_permission_scope_invalid");
  }
  if (!sameStrings(writeScopes, [resultPath])) {
    fail("fs_write_permission_scope_invalid");
  }
  if (
    process.execArgv.some((token) =>
      token.startsWith("--allow-") &&
      !token.startsWith("--allow-fs-read=") &&
      !token.startsWith("--allow-fs-write=")
    )
  ) {
    fail("non_filesystem_permission_granted");
  }
  const permission = (
    process as unknown as {
      permission?: {
        has(scope: string, reference?: string): boolean;
      };
    }
  ).permission;
  try {
    const readScopeRepresentatives = child === "engine"
      ? new Map<string, string>([
        [ENGINE_SECURITY_ROOT, join(ENGINE_SECURITY_ROOT, "index.ts")],
        [ENGINE_BASE_FILTER_ROOT, join(ENGINE_BASE_FILTER_ROOT, "index.ts")],
        [ENGINE_MONITORING_ROOT, join(ENGINE_MONITORING_ROOT, "index.ts")],
        [ENGINE_SIMULATED_TOOLS_ROOT, join(ENGINE_SIMULATED_TOOLS_ROOT, "index.ts")],
        [dirname(childOption(options, "--replay-input")), childOption(options, "--replay-input")]
      ])
      : new Map<string, string>();
    if (
      permission === undefined ||
      expectedReadScopes.some((scope) =>
        !hasSandboxSecurityHermeticReadPermission(
          scope,
          (reference) => permission?.has("fs.read", reference) ?? false,
          readScopeRepresentatives.get(scope)
        )
      ) ||
      !permission.has("fs.write", resultPath) ||
      permission.has("fs.write", dirname(resultPath)) ||
      permission.has("net") ||
      permission.has("child") ||
      permission.has("worker")
    ) {
      fail("child_capability_present");
    }
  } catch (error) {
    if (error instanceof Error && error.name === INVALID) throw error;
    fail("child_permission_unavailable");
  }
}

function validateChildPathMap(input: Readonly<Record<string, string>>): HermeticReplayPaths {
  const normalized = exactRecord(input, [
    "expected_metrics",
    "input_root",
    "projection_root",
    "replay_input",
    "result_path",
    "root",
    "sealed_config",
    "staging_root",
    "truth_root"
  ]);
  const keys = [
    "root",
    "staging_root",
    "input_root",
    "replay_input",
    "sealed_config",
    "projection_root",
    "truth_root",
    "expected_metrics",
    "result_path"
  ] as const;
  for (const key of keys) assertAbsolutePath(normalized[key], `${key}_invalid`);
  const paths = normalized as unknown as HermeticReplayPaths;
  const root = paths.root;
  const stagingRoot = paths.staging_root;
  const engineWorkspaceRoot = dirname(paths.replay_input);
  const evaluatorCaptureRootPath = dirname(paths.projection_root);
  const evaluatorCorpusRoot = dirname(paths.truth_root);
  if (isPathWithin(root, stagingRoot) || isPathWithin(stagingRoot, root)) {
    fail("root_staging_overlap");
  }
  if (
    !isPathWithin(engineWorkspaceRoot, paths.input_root) ||
    !isPathWithin(engineWorkspaceRoot, paths.sealed_config) ||
    !isPathWithin(evaluatorCaptureRootPath, paths.projection_root) ||
    !isPathWithin(evaluatorCorpusRoot, paths.truth_root) ||
    isPathWithin(evaluatorCaptureRootPath, paths.expected_metrics) ||
    isPathWithin(engineWorkspaceRoot, evaluatorCaptureRootPath) ||
    isPathWithin(evaluatorCaptureRootPath, engineWorkspaceRoot) ||
    isPathWithin(engineWorkspaceRoot, evaluatorCorpusRoot) ||
    isPathWithin(evaluatorCorpusRoot, engineWorkspaceRoot)
  ) {
    fail("child_workspace_overlap");
  }
  for (const key of [
    "input_root",
    "replay_input",
    "sealed_config",
    "projection_root",
    "truth_root",
    "expected_metrics",
    "result_path"
  ] as const) {
    if (!isPathWithin(stagingRoot, paths[key])) {
      fail(`${key}_outside_staging`);
    }
  }
  return Object.freeze(paths);
}

function evaluatorCaptureRoot(projectionRoot: string): string {
  return dirname(projectionRoot);
}

/**
 * Builds the two closed-capability child commands. The returned args are Node
 * args; the parent adds `unshare --net` immediately before launching them.
 */
export function buildHermeticReplayChildCommands(
  rawInput: Readonly<Record<string, string>>
): Readonly<{
  engine: Readonly<{ args: readonly string[]; env: Readonly<Record<string, string | undefined>> }>;
  evaluator: Readonly<{ args: readonly string[]; env: Readonly<Record<string, string | undefined>> }>;
}> {
  const input = validateChildPathMap(rawInput);
  const engineRead = [
    SCRIPT_PATH,
    FS_SNAPSHOT_PATH,
    CANONICAL_JSON_PATH,
    REPLAY_TRANSPORT_PATH,
    CONTRACTS_PATH,
    ENGINE_SECURITY_ROOT,
    ENGINE_PRODUCTION_ROOT,
    ENGINE_BASE_FILTER_ROOT,
    ENGINE_MONITORING_ROOT,
    ENGINE_SIMULATED_TOOLS_ROOT,
    SHARED_ROOT,
    PROC_NET_ROOT,
    dirname(input.replay_input),
    dirname(input.sealed_config)
  ];
  const corpusManifest = join(dirname(input.truth_root), "manifest.json");
  const evaluatorRead = [
    SCRIPT_PATH,
    FS_SNAPSHOT_PATH,
    CANONICAL_JSON_PATH,
    EVALUATE_PATH,
    CONTRACTS_PATH,
    SHARED_ROOT,
    dirname(input.truth_root),
    corpusManifest,
    evaluatorCaptureRoot(input.projection_root),
    input.expected_metrics
  ];
  const common = Object.freeze([
    "--no-warnings",
    "--experimental-strip-types",
    "--experimental-test-isolation=none",
    "--permission"
  ]);
  const engineArgs = [
    ...common,
    ...permissionArgs(engineRead),
    ...writeArgs(input.result_path),
    SCRIPT_PATH,
    "--child=engine",
    `--input-root=${input.input_root}`,
    `--replay-input=${input.replay_input}`,
    `--sealed-config=${input.sealed_config}`,
    `--result=${input.result_path}`
  ];
  const evaluatorArgs = [
    ...common,
    ...permissionArgs(evaluatorRead),
    ...writeArgs(input.result_path),
    SCRIPT_PATH,
    "--child=evaluator",
    `--corpus-root=${dirname(input.truth_root)}`,
    `--capture-root=${evaluatorCaptureRoot(input.projection_root)}`,
    `--projection-root=${input.projection_root}`,
    `--truth-root=${input.truth_root}`,
    `--expected-metrics=${input.expected_metrics}`,
    `--result=${input.result_path}`
  ];
  return Object.freeze({
    engine: Object.freeze({ args: Object.freeze(engineArgs), env: CHILD_ENV }),
    evaluator: Object.freeze({ args: Object.freeze(evaluatorArgs), env: CHILD_ENV })
  });
}

function readJson(path: string, realRoot: string): unknown {
  return snapshotSandboxSecurityJson({
    real_root: realRoot,
    path,
    max_bytes: MAX_JSON_BYTES
  }).json;
}

function writeJson(path: string, root: string, value: unknown): void {
  assertNoRawContentLeaks(value);
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: root,
    path,
    data: `${JSON.stringify(value, null, 2)}\n`
  });
}

function writeCompactJson(path: string, root: string, value: unknown): void {
  assertNoRawContentLeaks(value);
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: root,
    path,
    data: `${JSON.stringify(value)}\n`
  });
}

function writeAnonymousInputJson(path: string, root: string, value: unknown): void {
  if (!isPlainRecord(value) || value.schema_version !== "sandbox-security-hermetic-anonymous-input.v1") {
    fail("anonymous_input_invalid");
  }
  const data = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(data, "utf8") > MAX_JSON_BYTES) {
    fail("anonymous_input_too_large");
  }
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: root,
    path,
    data
  });
}

function writeBytes(path: string, root: string, data: Uint8Array): void {
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: root,
    path,
    data
  });
}

function materializeAnonymousInputCorpus(input: Readonly<{
  source_root: string;
  staging_root: string;
  expected_tree_sha256: string;
  hash_tree: (root: string) => string;
}>): string {
  const sourceRoot = resolve(input.source_root);
  const stagingRoot = resolve(input.staging_root);
  const snapshotRoot = join(stagingRoot, "input-snapshot");
  const anonymousRoot = join(stagingRoot, "anonymous-inputs");
  mkdirSync(snapshotRoot, { recursive: true, mode: 0o700 });
  mkdirSync(anonymousRoot, { recursive: true, mode: 0o700 });
  const fixtureIds = expectedFixtureIds();
  const entries = fixtureIds.map((fixtureId) => `${fixtureId}.json`);
  snapshotSandboxSecurityDirectory({
    real_root: sourceRoot,
    path: sourceRoot,
    expected_entries: entries
  });
  const snapshots = fixtureIds.map((fixtureId) => {
    const path = join(sourceRoot, `${fixtureId}.json`);
    const snapshot = snapshotSandboxSecurityJson({
      real_root: sourceRoot,
      path,
      max_bytes: MAX_JSON_BYTES
    });
    writeBytes(join(snapshotRoot, `${fixtureId}.json`), stagingRoot, snapshot.bytes);
    return Object.freeze({ fixtureId, json: snapshot.json });
  });
  if (input.hash_tree(snapshotRoot) !== input.expected_tree_sha256) {
    fail("input_tree_hash_mismatch");
  }
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]!;
    const record = exactRecord(snapshot.json, [
      "evaluation_request",
      "fixture_id",
      "schema_version"
    ]);
    if (
      record.schema_version !== "sandbox-security-benchmark-input.v1" ||
      record.fixture_id !== snapshot.fixtureId ||
      !isPlainRecord(record.evaluation_request)
    ) {
      fail("input_envelope_invalid");
    }
    const anonymousRequest = deepCloneJson(record.evaluation_request);
    const entry = `input-${String(index + 1).padStart(4, "0")}.json`;
    writeAnonymousInputJson(join(anonymousRoot, entry), stagingRoot, {
      schema_version: "sandbox-security-hermetic-anonymous-input.v1",
      evaluation_request: anonymousRequest
    });
  }
  rmSync(snapshotRoot, { recursive: true, force: true });
  return anonymousRoot;
}

function writeChildJson(path: string, value: unknown): void {
  assertNoRawContentLeaks(value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_JSON_BYTES) {
    fail("child_result_size_invalid");
  }
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    let offset = 0;
    while (offset < bytes.byteLength) {
      offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    }
    fsyncSync(descriptor);
  } catch {
    fail("child_result_write_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readChildResult(path: string, root: string): unknown {
  return readJson(path, root);
}

function parseCli(argv: readonly string[]): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    if (separator <= 2) fail("cli_argument_invalid");
    const key = argument.slice(0, separator);
    const value = argument.slice(separator + 1);
    if (!value || Object.hasOwn(output, key)) fail("cli_argument_invalid");
    output[key] = value;
  }
  return Object.freeze(output);
}

function childOption(
  options: Readonly<Record<string, string>>,
  name: string
): string {
  const value = options[name];
  if (typeof value !== "string") fail("cli_argument_missing");
  return assertAbsolutePath(value, "cli_path_invalid");
}

function runtimePorts() {
  let counter = 0;
  return {
    now: () => new Date().toISOString(),
    nextDecisionId: () => {
      counter += 1;
      return `ssb-hermetic-${String(counter).padStart(4, "0")}`;
    },
    monotonicNowMs: () => Number(process.hrtime.bigint() / 1_000_000n),
    scheduleTimeout: (delayMs: number, callback: () => void) => {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    }
  };
}

function assertChildEnvironmentAbsent(): boolean {
  return FORBIDDEN_CHILD_ENV_KEYS.some((key) => Object.hasOwn(process.env, key));
}

function childNetworkPermissionGranted(): boolean {
  const permission = (
    process as unknown as {
      permission?: {
        has(scope: string, reference?: string): boolean;
      };
    }
  ).permission;
  try {
    if (permission === undefined) fail("child_permission_unavailable");
    return permission.has("net");
  } catch (error) {
    if (error instanceof Error && error.name === INVALID) throw error;
    fail("child_permission_unavailable");
  }
}

function readNetworkNamespaceSnapshot(): NetworkNamespaceSnapshot {
  const snapshot = {} as Record<NetworkTableName, NetworkTableSnapshot>;
  for (const table of NETWORK_TABLES) {
    let content: string;
    try {
      content = readFileSync(join(PROC_NET_ROOT, table), "utf8");
    } catch {
      fail("network_observation_unavailable");
    }
    const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
    const entryCount = Math.max(0, lines.length - 1);
    if (entryCount > MAX_NETWORK_TABLE_ENTRIES) {
      fail("network_observation_too_large");
    }
    snapshot[table] = Object.freeze({
      entry_count: entryCount,
      sha256: sha256CanonicalJson(content)
    });
  }
  return Object.freeze({
    tcp: snapshot.tcp!,
    tcp6: snapshot.tcp6!,
    udp: snapshot.udp!,
    udp6: snapshot.udp6!
  });
}

function tryReadNetworkNamespaceIdentity(path: string): string | undefined {
  try {
    const identity = readlinkSync(path);
    return NETWORK_NAMESPACE_ID.test(identity) ? identity : undefined;
  } catch {
    return undefined;
  }
}

function readNetworkNamespaceIdentity(path: string): string {
  const identity = tryReadNetworkNamespaceIdentity(path);
  if (identity === undefined) fail("network_namespace_unavailable");
  return identity;
}

export function validateNetworkNamespaceIsolation(
  parentNamespace: unknown,
  childNamespace: unknown
): Readonly<{ network_attempts: 0 }> {
  if (
    typeof parentNamespace !== "string" ||
    typeof childNamespace !== "string" ||
    !NETWORK_NAMESPACE_ID.test(parentNamespace) ||
    !NETWORK_NAMESPACE_ID.test(childNamespace)
  ) {
    fail("network_namespace_proof_invalid");
  }
  if (parentNamespace === childNamespace) {
    fail("network_namespace_not_isolated");
  }
  return Object.freeze({ network_attempts: 0 as const });
}

function createParentNetworkNamespaceProof(
  parentNamespace: string,
  childNamespace: string
): ParentNetworkNamespaceProof {
  const proof = validateNetworkNamespaceIsolation(parentNamespace, childNamespace);
  return Object.freeze({
    parent_namespace: parentNamespace,
    child_namespace: childNamespace,
    network_attempts: proof.network_attempts
  });
}

function networkNamespaceSnapshotsEqual(
  left: NetworkNamespaceSnapshot,
  right: NetworkNamespaceSnapshot
): boolean {
  return NETWORK_TABLES.every((table) =>
    left[table].entry_count === right[table].entry_count &&
    left[table].sha256 === right[table].sha256
  );
}

function createNetworkIsolationProof(
  before: NetworkNamespaceSnapshot,
  after: NetworkNamespaceSnapshot,
  netPermissionGranted: boolean
): NetworkIsolationProof {
  const socketTablesUnchanged = networkNamespaceSnapshotsEqual(before, after);
  const networkAttempts = netPermissionGranted || !socketTablesUnchanged ? 1 : 0;
  return Object.freeze({
    schema_version: NETWORK_PROOF_SCHEMA,
    before,
    after,
    net_permission_granted: netPermissionGranted,
    socket_tables_unchanged: socketTablesUnchanged,
    network_attempts: networkAttempts
  });
}

function normalizeNetworkTableSnapshot(value: unknown): NetworkTableSnapshot {
  const record = exactRecord(value, ["entry_count", "sha256"]);
  if (
    !Number.isSafeInteger(record.entry_count) ||
    Number(record.entry_count) < 0 ||
    Number(record.entry_count) > MAX_NETWORK_TABLE_ENTRIES ||
    typeof record.sha256 !== "string" ||
    !SHA256.test(record.sha256)
  ) {
    fail("network_proof_invalid");
  }
  return Object.freeze({
    entry_count: Number(record.entry_count),
    sha256: record.sha256
  });
}

function normalizeNetworkNamespaceSnapshot(value: unknown): NetworkNamespaceSnapshot {
  const record = exactRecord(value, [...NETWORK_TABLES]);
  return Object.freeze({
    tcp: normalizeNetworkTableSnapshot(record.tcp),
    tcp6: normalizeNetworkTableSnapshot(record.tcp6),
    udp: normalizeNetworkTableSnapshot(record.udp),
    udp6: normalizeNetworkTableSnapshot(record.udp6)
  });
}

function parseNetworkIsolationProof(value: unknown): NetworkIsolationProof {
  const record = exactRecord(value, [
    "after",
    "before",
    "net_permission_granted",
    "network_attempts",
    "schema_version",
    "socket_tables_unchanged"
  ]);
  if (
    record.schema_version !== NETWORK_PROOF_SCHEMA ||
    typeof record.net_permission_granted !== "boolean" ||
    typeof record.socket_tables_unchanged !== "boolean" ||
    !Number.isSafeInteger(record.network_attempts) ||
    Number(record.network_attempts) < 0
  ) {
    fail("network_proof_invalid");
  }
  const before = normalizeNetworkNamespaceSnapshot(record.before);
  const after = normalizeNetworkNamespaceSnapshot(record.after);
  const unchanged = networkNamespaceSnapshotsEqual(before, after);
  const attempts = record.net_permission_granted || !unchanged ? 1 : 0;
  if (
    record.socket_tables_unchanged !== unchanged ||
    record.network_attempts !== attempts
  ) {
    fail("network_proof_mismatch");
  }
  return Object.freeze({
    schema_version: NETWORK_PROOF_SCHEMA,
    before,
    after,
    net_permission_granted: record.net_permission_granted,
    socket_tables_unchanged: unchanged,
    network_attempts: attempts
  });
}

export function validateNetworkIsolationProof(
  value: unknown
): Readonly<{ network_attempts: number }> {
  return Object.freeze({
    network_attempts: parseNetworkIsolationProof(value).network_attempts
  });
}

function assertHermeticChildPermissionBoundary(): void {
  const permission = (
    process as unknown as {
      permission?: {
        has(scope: string, reference?: string): boolean;
      };
    }
  ).permission;
  try {
    if (
      permission === undefined ||
      !permission.has("fs.read", SCRIPT_PATH) ||
      childNetworkPermissionGranted() ||
      permission.has("child") ||
      permission.has("worker") ||
      assertChildEnvironmentAbsent()
    ) {
      fail("child_capability_present");
    }
  } catch (error) {
    if (error instanceof Error && error.name === INVALID) throw error;
    fail("child_permission_unavailable");
  }
}

function readAnonymousInputEnvelope(path: string, inputRoot: string): unknown {
  const raw = readJson(path, inputRoot);
  const record = exactRecord(raw, ["evaluation_request", "schema_version"]);
  if (record.schema_version !== "sandbox-security-hermetic-anonymous-input.v1") {
    fail("input_envelope_invalid");
  }
  const request = record.evaluation_request;
  if (!isPlainRecord(request)) fail("input_request_invalid");
  const assertNoFixtureKey = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) assertNoFixtureKey(item);
      return;
    }
    if (!isPlainRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "fixture_id") fail("fixture_identity_leak");
      assertNoFixtureKey(nested);
    }
  };
  assertNoFixtureKey(request);
  return request;
}

function loadInputRequests(inputRoot: string): readonly unknown[] {
  const entries = Array.from(
    { length: INPUT_COUNT },
    (_, index) => `input-${String(index + 1).padStart(4, "0")}.json`
  );
  snapshotSandboxSecurityDirectory({
    real_root: inputRoot,
    path: inputRoot,
    expected_entries: entries
  });
  return Object.freeze(
    entries.map((entry) =>
      readAnonymousInputEnvelope(join(inputRoot, entry), inputRoot)
    )
  );
}

function parseReplayInput(value: unknown): AnonymousReplayInputDocument {
  const record = exactRecord(value, ["inputs", "qualification", "schema_version", "sealed_config"]);
  if (record.schema_version !== REPLAY_INPUT_SCHEMA || !Array.isArray(record.inputs)) {
    fail("replay_input_invalid");
  }
  if (record.inputs.length !== INPUT_COUNT) fail("replay_input_count_invalid");
  const inputs = record.inputs.map((item) => {
    const unit = exactRecord(item, [
      "decision_projection_sha256",
      "judge",
      "judge_binding_sha256",
      "ollama"
    ]);
    if (
      typeof unit.decision_projection_sha256 !== "string" ||
      !SHA256.test(unit.decision_projection_sha256) ||
      typeof unit.judge_binding_sha256 !== "string" ||
      !SHA256.test(unit.judge_binding_sha256)
    ) {
      fail("replay_input_hash_invalid");
    }
    return Object.freeze({
      ollama: validateAttemptSequence(unit.ollama),
      judge: validateAttemptSequence(unit.judge),
      decision_projection_sha256: unit.decision_projection_sha256,
      judge_binding_sha256: unit.judge_binding_sha256
    });
  });
  const qualification = exactRecord(record.qualification, [
    "inventory",
    "prewarm"
  ]);
  const sealedConfig = exactRecord(record.sealed_config, [
    "judge_base_url",
    "judge_binding_sha256",
    "judge_endpoint_policy_id",
    "judge_endpoint_url",
    "judge_protocol_id",
    "judge_prompt_version",
    "judge_requested_model",
    "judge_resolved_model",
    "judge_schema_version",
    "local_prompt_version",
    "local_schema_version",
    "ollama_digest",
    "ollama_model",
    "rule_catalog_version",
    "sanitizer_version"
  ]);
  return Object.freeze({
    schema_version: REPLAY_INPUT_SCHEMA,
    qualification: Object.freeze({
      inventory: validateAttemptSequence(qualification.inventory),
      prewarm: validateAttemptSequence(qualification.prewarm)
    }),
    sealed_config: sealedConfig,
    inputs: Object.freeze(inputs)
  });
}

function contentFreeProjection(decision: Readonly<Record<string, unknown>>): ChildProjection {
  if (
    typeof decision.schema_version !== "string" ||
    typeof decision.verdict !== "string" ||
    typeof decision.action !== "string" ||
    typeof decision.risk_level !== "string" ||
    !Array.isArray(decision.findings) ||
    !Array.isArray(decision.detector_runs) ||
    !Array.isArray(decision.evidence_refs)
  ) {
    fail("decision_projection_invalid");
  }
  return Object.freeze({
    schema_version: decision.schema_version,
    verdict: decision.verdict,
    action: decision.action,
    risk_level: decision.risk_level,
    finding_count: decision.findings.length,
    detector_run_count: decision.detector_runs.length,
    evidence_ref_count: decision.evidence_refs.length
  });
}

async function runEngineChild(options: Readonly<Record<string, string>>): Promise<void> {
  const inputRoot = childOption(options, "--input-root");
  const replayInputPath = childOption(options, "--replay-input");
  const sealedConfigPath = childOption(options, "--sealed-config");
  const resultPath = childOption(options, "--result");
  const networkBefore = readNetworkNamespaceSnapshot();
  const replayInput = parseReplayInput(readJson(replayInputPath, dirname(replayInputPath)));
  const sealedConfig = readJson(sealedConfigPath, dirname(sealedConfigPath));
  if (canonicalizeSandboxSecurityJson(sealedConfig) !== canonicalizeSandboxSecurityJson(replayInput.sealed_config)) {
    fail("sealed_config_mismatch");
  }
  const { createSandboxSecurityHermeticReplayEngine } = await import(
    "../../../engines/sandbox/src/security-production/benchmark-composition.ts"
  );
  const { createSandboxSecurityReplayTransport } = await import(
    "./replay-transport.ts"
  );
  const transport = createSandboxSecurityReplayTransport({
    qualification: replayInput.qualification as never,
    inputs: replayInput.inputs.map((unit) => ({
      ollama: unit.ollama,
      judge: unit.judge
    })) as never,
    sealed_config: replayInput.sealed_config as never
  });
  const engine = await createSandboxSecurityHermeticReplayEngine({
    runtime: runtimePorts(),
    replay_transport: transport,
    sealed_config: replayInput.sealed_config as never
  });
  const requests = loadInputRequests(inputRoot);
  const projections: ChildProjectionResult[] = [];
  for (let index = 0; index < INPUT_COUNT; index += 1) {
    transport.beginInput();
    try {
      const decision = await engine.evaluate(requests[index] as never);
      const projection = contentFreeProjection(decision as never);
      const projectionHash = sha256CanonicalJson(projection);
      if (projectionHash !== replayInput.inputs[index]!.decision_projection_sha256) {
        fail("decision_projection_hash_mismatch");
      }
      projections.push(Object.freeze({
        projection,
        decision_projection_sha256: projectionHash
      }));
    } finally {
      transport.endInput();
    }
  }
  transport.assertDrained();
  const networkProof = createNetworkIsolationProof(
    networkBefore,
    readNetworkNamespaceSnapshot(),
    childNetworkPermissionGranted()
  );
  const result: EngineChildResult = Object.freeze({
    schema_version: CHILD_RESULT_SCHEMA,
    evaluated_inputs: INPUT_COUNT,
    network_attempts: networkProof.network_attempts,
    openai_key_present: assertChildEnvironmentAbsent(),
    network_proof: networkProof,
    projections: Object.freeze(projections)
  });
  if (result.openai_key_present) fail("credential_present");
  writeChildJson(resultPath, result);
}

function validateChildProjection(value: unknown): ChildProjectionResult {
  const record = exactRecord(value, ["decision_projection_sha256", "projection"]);
  if (typeof record.decision_projection_sha256 !== "string" || !SHA256.test(record.decision_projection_sha256)) {
    fail("child_projection_hash_invalid");
  }
  const projection = exactRecord(record.projection, [
    "action",
    "detector_run_count",
    "evidence_ref_count",
    "finding_count",
    "risk_level",
    "schema_version",
    "verdict"
  ]);
  for (const key of ["finding_count", "detector_run_count", "evidence_ref_count"]) {
    if (!Number.isSafeInteger(projection[key]) || Number(projection[key]) < 0) {
      fail("child_projection_count_invalid");
    }
  }
  if (
    typeof projection.schema_version !== "string" ||
    typeof projection.verdict !== "string" ||
    typeof projection.action !== "string" ||
    typeof projection.risk_level !== "string"
  ) {
    fail("child_projection_invalid");
  }
  const normalized = Object.freeze({
    schema_version: projection.schema_version,
    verdict: projection.verdict,
    action: projection.action,
    risk_level: projection.risk_level,
    finding_count: Number(projection.finding_count),
    detector_run_count: Number(projection.detector_run_count),
    evidence_ref_count: Number(projection.evidence_ref_count)
  });
  if (sha256CanonicalJson(normalized) !== record.decision_projection_sha256) {
    fail("child_projection_hash_mismatch");
  }
  return Object.freeze({
    projection: normalized,
    decision_projection_sha256: record.decision_projection_sha256
  });
}

function parseEngineChildResult(value: unknown): EngineChildResult {
  const record = exactRecord(value, [
    "evaluated_inputs",
    "network_attempts",
    "network_proof",
    "openai_key_present",
    "projections",
    "schema_version"
  ]);
  if (
    record.schema_version !== CHILD_RESULT_SCHEMA ||
    record.evaluated_inputs !== INPUT_COUNT ||
    record.openai_key_present !== false ||
    !Array.isArray(record.projections) ||
    record.projections.length !== INPUT_COUNT
  ) {
    fail("engine_child_result_invalid");
  }
  const networkProof = parseNetworkIsolationProof(record.network_proof);
  if (record.network_attempts !== networkProof.network_attempts) {
    fail("engine_child_result_network_proof_mismatch");
  }
  return Object.freeze({
    schema_version: CHILD_RESULT_SCHEMA,
    evaluated_inputs: INPUT_COUNT,
    network_attempts: networkProof.network_attempts,
    openai_key_present: false,
    network_proof: networkProof,
    projections: Object.freeze(record.projections.map(validateChildProjection))
  });
}

async function runEvaluatorChild(options: Readonly<Record<string, string>>): Promise<void> {
  const corpusRoot = childOption(options, "--corpus-root");
  const captureRoot = childOption(options, "--capture-root");
  const projectionRoot = childOption(options, "--projection-root");
  const expectedMetricsPath = childOption(options, "--expected-metrics");
  const resultPath = childOption(options, "--result");
  if (resolve(projectionRoot) !== resolve(join(captureRoot, "decisions"))) {
    fail("projection_root_binding_invalid");
  }
  const { evaluateSandboxSecurityCapture } = await import("./evaluate.ts");
  const report = evaluateSandboxSecurityCapture({
    corpus_root: corpusRoot,
    capture_root: captureRoot
  });
  const expected = readJson(expectedMetricsPath, dirname(expectedMetricsPath));
  if (canonicalizeSandboxSecurityJson(report.accepted_metrics) !== canonicalizeSandboxSecurityJson(expected)) {
    fail("accepted_metrics_mismatch");
  }
  const result: EvaluatorChildResult = Object.freeze({
    schema_version: CHILD_RESULT_SCHEMA,
    metrics: report.accepted_metrics as JsonRecord
  });
  writeChildJson(resultPath, result);
}

function parseEvaluatorChildResult(value: unknown): EvaluatorChildResult {
  const record = exactRecord(value, ["metrics", "schema_version"]);
  if (record.schema_version !== CHILD_RESULT_SCHEMA || !isPlainRecord(record.metrics)) {
    fail("evaluator_child_result_invalid");
  }
  return Object.freeze({
    schema_version: CHILD_RESULT_SCHEMA,
    metrics: record.metrics
  });
}

function findUnshare(): string {
  for (const candidate of ["/usr/bin/unshare", "/bin/unshare"]) {
    if (existsSync(candidate)) return candidate;
  }
  return "unshare";
}

function runChild(
  args: readonly string[],
  signal?: AbortSignal
): Promise<Readonly<{
  exit_code: number;
  stdout: string;
  stderr: string;
  network_namespace_proof: ParentNetworkNamespaceProof;
}>> {
  if (signal?.aborted) return Promise.reject(new Error(`${INVALID}:caller_cancelled`));
  const parentNetworkNamespace = readNetworkNamespaceIdentity(NETWORK_NAMESPACE_PATH);
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(
      findUnshare(),
      ["--net", "--", process.execPath, ...args],
      {
        env: CHILD_ENV,
        stdio: ["ignore", "pipe", "pipe"],
        signal
      }
    );
    let stdout = "";
    let stderr = "";
    let oversized = false;
    let timedOut = false;
    let settled = false;
    let childError: Error | undefined;
    let childNetworkNamespace: string | undefined;
    let namespaceProbe: ReturnType<typeof setInterval> | undefined;
    const clearNamespaceProbe = (): void => {
      if (namespaceProbe !== undefined) {
        clearInterval(namespaceProbe);
        namespaceProbe = undefined;
      }
    };
    const probeChildNetworkNamespace = (): void => {
      if (childNetworkNamespace !== undefined || child.pid === undefined) return;
      const candidate = tryReadNetworkNamespaceIdentity(
        `/proc/${String(child.pid)}/ns/net`
      );
      if (candidate !== undefined && candidate !== parentNetworkNamespace) {
        childNetworkNamespace = candidate;
        clearNamespaceProbe();
      }
    };
    probeChildNetworkNamespace();
    namespaceProbe = setInterval(probeChildNetworkNamespace, 1);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, MAX_CHILD_RUNTIME_MS);
    const collect = (chunk: Buffer, target: "stdout" | "stderr") => {
      if (oversized) return;
      const next = target === "stdout" ? stdout + chunk.toString("utf8") : stderr + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_CHILD_OUTPUT_BYTES) {
        oversized = true;
        child.kill("SIGKILL");
        return;
      }
      if (target === "stdout") stdout = next;
      else stderr = next;
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
    child.once("error", (error) => {
      if (settled) return;
      childError = error instanceof Error ? error : new Error(`${INVALID}:child_failed`);
      try {
        child.kill("SIGKILL");
      } catch {
        childError = new Error(`${INVALID}:child_failed`);
      }
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearNamespaceProbe();
      if (timedOut) {
        rejectProcess(new Error(`${INVALID}:child_timeout`));
        return;
      }
      if (oversized) {
        rejectProcess(new Error(`${INVALID}:child_output_too_large`));
        return;
      }
      if (childError !== undefined) {
        rejectProcess(
          new Error(`${INVALID}:${signal?.aborted ? "caller_cancelled" : "child_failed"}`)
        );
        return;
      }
      if (childNetworkNamespace === undefined) {
        rejectProcess(new Error(`${INVALID}:network_namespace_unavailable`));
        return;
      }
      let networkNamespaceProof: ParentNetworkNamespaceProof;
      try {
        networkNamespaceProof = createParentNetworkNamespaceProof(
          parentNetworkNamespace,
          childNetworkNamespace
        );
      } catch {
        rejectProcess(new Error(`${INVALID}:network_namespace_not_isolated`));
        return;
      }
      resolveProcess(Object.freeze({
        exit_code: typeof code === "number" ? code : 1,
        stdout,
        stderr,
        network_namespace_proof: networkNamespaceProof
      }));
    });
  });
}

function assertChildSuccess(result: Readonly<{ exit_code: number; stdout: string; stderr: string }>): void {
  if (result.exit_code !== 0 || result.stdout.length !== 0 || result.stderr.length !== 0) {
    fail("child_failed_closed");
  }
}

export function cleanupSandboxSecurityHermeticReplayStaging(input: Readonly<{
  staging_root: string;
  remove?: (path: string) => void;
}>): void {
  const stagingRoot = assertAbsolutePath(input.staging_root, "staging_root_invalid");
  const remove = input.remove ?? ((path: string) => {
    rmSync(path, { recursive: true, force: true });
  });
  try {
    remove(stagingRoot);
  } catch {
    fail("staging_cleanup_failed");
  }
}

function manifestToSealedConfig(manifest: JsonRecord): JsonRecord {
  return Object.freeze({
    judge_base_url: manifest.judge_base_url,
    judge_binding_sha256: manifest.judge_binding_sha256,
    judge_endpoint_policy_id: manifest.judge_endpoint_policy_id,
    judge_endpoint_url: manifest.judge_endpoint_url,
    judge_protocol_id: manifest.judge_protocol_id,
    judge_prompt_version: manifest.judge_prompt_version,
    judge_requested_model: manifest.judge_requested_model,
    judge_resolved_model: manifest.judge_resolved_model,
    judge_schema_version: manifest.judge_schema_version,
    local_prompt_version: manifest.local_prompt_version,
    local_schema_version: manifest.local_schema_version,
    ollama_digest: manifest.ollama_digest,
    ollama_model: manifest.ollama_model,
    rule_catalog_version: manifest.rule_catalog_version,
    sanitizer_version: manifest.sanitizer_version
  });
}

export function manifestToCandidateCaptureManifest(
  manifest: JsonRecord
): JsonRecord {
  return Object.freeze({
    schema_version: manifest.schema_version,
    inputs_tree_sha256: manifest.inputs_tree_sha256,
    fixture_count: INPUT_COUNT,
    execution_profile_id: manifest.execution_profile_id,
    readiness_timeout_ms: manifest.readiness_timeout_ms,
    qualification_timeout_ms: manifest.qualification_timeout_ms,
    local_detector_slot_timeout_ms: manifest.local_detector_slot_timeout_ms,
    judge_detector_slot_timeout_ms: manifest.judge_detector_slot_timeout_ms,
    normal_work_budget_ms: manifest.normal_work_budget_ms,
    ollama_model: manifest.ollama_model,
    ollama_digest: manifest.ollama_digest,
    ollama_qualification: manifest.ollama_qualification,
    judge_protocol_id: manifest.judge_protocol_id,
    judge_endpoint_policy_id: manifest.judge_endpoint_policy_id,
    judge_base_url: manifest.judge_base_url,
    judge_endpoint_url: manifest.judge_endpoint_url,
    judge_requested_model: manifest.judge_requested_model,
    judge_resolved_model: manifest.judge_resolved_model,
    judge_binding_sha256: manifest.judge_binding_sha256,
    local_prompt_version: manifest.local_prompt_version,
    judge_prompt_version: manifest.judge_prompt_version,
    local_schema_version: manifest.local_schema_version,
    judge_schema_version: manifest.judge_schema_version,
    rule_catalog_version: manifest.rule_catalog_version,
    sanitizer_version: manifest.sanitizer_version
  });
}

async function runParent(
  root: string,
  abortSignal?: AbortSignal
): Promise<SandboxSecurityHermeticReplayResult> {
  if (abortSignal?.aborted) fail("caller_cancelled");
  const sealModule = await import("./seal.ts");
  const contractModule = await import("./contracts.ts");
  let accepted: ReturnType<
    typeof sealModule.validateCompleteSandboxSecurityLiveEvidence
  >;
  try {
    accepted = sealModule.validateCompleteSandboxSecurityLiveEvidence(root, {
      corpus_root: CORPUS_ROOT,
      require_receipt_chain: true
    });
  } catch {
    fail("live_evidence_missing");
  }
  assertSandboxSecurityHermeticReplayCompleteRun({
    input_count: accepted.capture.inputs.length,
    accepted_metrics: accepted.seal.accepted_metrics
  });
  const fixtureIds = expectedFixtureIds();
  const manifest = accepted.capture.manifest;
  const sealedConfig = manifestToSealedConfig(manifest as unknown as JsonRecord);
  const candidateManifest = manifestToCandidateCaptureManifest(
    manifest as unknown as JsonRecord
  );
  const stagingRoot = mkdtempSync(
    join(dirname(resolve(root)), ".sandbox-security-hermetic-")
  );
  try {
    chmodSync(stagingRoot, 0o700);
    const engineRoot = join(stagingRoot, "engine-workspace");
    const evaluatorRoot = join(stagingRoot, "evaluator-capture");
    const projectionRoot = join(evaluatorRoot, "decisions");
    mkdirSync(engineRoot, { recursive: true, mode: 0o700 });
    mkdirSync(projectionRoot, { recursive: true, mode: 0o700 });
    const evaluatorCorpusRoot = join(stagingRoot, "evaluator-corpus");
    const evaluatorTruthRoot = join(evaluatorCorpusRoot, "truth");
    mkdirSync(evaluatorTruthRoot, { recursive: true, mode: 0o700 });
    const replayInputPath = join(engineRoot, "replay-input.json");
    const sealedConfigPath = join(engineRoot, "sealed-config.json");
    const expectedMetricsPath = join(stagingRoot, "expected-metrics.json");
    const engineResultPath = join(stagingRoot, "engine-result.json");
    const evaluatorResultPath = join(stagingRoot, "evaluator-result.json");
    const sourceInputRoot = join(CORPUS_ROOT, "inputs");
    const sourceTruthRoot = join(CORPUS_ROOT, "truth");
    const inputRoot = materializeAnonymousInputCorpus({
      source_root: sourceInputRoot,
      staging_root: engineRoot,
      expected_tree_sha256: manifest.inputs_tree_sha256,
      hash_tree: contractModule.hashSandboxSecurityBenchmarkTree
    });
    const anonymousInputs = validateAndStripReplayEnvelopes(
      {
        fixture_ids: fixtureIds,
        judge_binding_sha256: manifest.judge_binding_sha256
      },
      accepted.capture.inputs as readonly JsonRecord[]
    );
    const replayDocument = Object.freeze({
      schema_version: REPLAY_INPUT_SCHEMA,
      qualification: manifest.ollama_qualification,
      sealed_config: sealedConfig,
      inputs: anonymousInputs
    });
    writeJson(replayInputPath, stagingRoot, replayDocument);
    writeJson(sealedConfigPath, stagingRoot, sealedConfig);
    writeJson(expectedMetricsPath, stagingRoot, accepted.seal.accepted_metrics);

    const truthIds = expectedFixtureIds();
    snapshotSandboxSecurityDirectory({
      real_root: sourceTruthRoot,
      path: sourceTruthRoot,
      expected_entries: truthIds.map((fixtureId) => `${fixtureId}.json`)
    });
    const sourceManifestPath = join(CORPUS_ROOT, "manifest.json");
    const manifestSnapshot = snapshotSandboxSecurityFile({
      real_root: CORPUS_ROOT,
      path: sourceManifestPath,
      max_bytes: MAX_JSON_BYTES
    });
    writeBytes(
      join(evaluatorCorpusRoot, "manifest.json"),
      stagingRoot,
      manifestSnapshot.bytes
    );
    for (const fixtureId of truthIds) {
      const truthSnapshot = snapshotSandboxSecurityFile({
        real_root: sourceTruthRoot,
        path: join(sourceTruthRoot, `${fixtureId}.json`),
        max_bytes: MAX_JSON_BYTES
      });
      writeBytes(
        join(evaluatorTruthRoot, `${fixtureId}.json`),
        stagingRoot,
        truthSnapshot.bytes
      );
    }

    const cassette = Object.freeze({
    schema_version: "sandbox-security-benchmark-candidate-cassette.v2",
      judge_binding_sha256: manifest.judge_binding_sha256,
      inputs: Object.freeze(
        accepted.capture.inputs.map((raw) => {
          const input = exactRecord(raw, [
            "decision_projection_sha256",
            "fixture_id",
            "judge",
            "judge_binding_sha256",
            "ollama",
            "schema_version"
          ]);
          return Object.freeze({
            fixture_id: input.fixture_id,
            ollama: input.ollama,
            judge: input.judge,
            decision_projection_sha256: input.decision_projection_sha256,
            judge_binding_sha256: input.judge_binding_sha256
          });
        })
      )
    });
    writeJson(
      join(evaluatorRoot, "capture-manifest.json"),
      stagingRoot,
      candidateManifest
    );
    writeJson(join(evaluatorRoot, "cassette.json"), stagingRoot, cassette);

    const paths: HermeticReplayPaths = Object.freeze({
      root: resolve(root),
      staging_root: stagingRoot,
      input_root: inputRoot,
      replay_input: replayInputPath,
      sealed_config: sealedConfigPath,
      projection_root: projectionRoot,
      truth_root: evaluatorTruthRoot,
      expected_metrics: expectedMetricsPath,
      result_path: engineResultPath
    });
    const commands = buildHermeticReplayChildCommands(
      paths as unknown as Readonly<Record<string, string>>
    );
    const engineRun = await runChild(commands.engine.args, abortSignal);
    assertChildSuccess(engineRun);
    const engineResult = parseEngineChildResult(
      readChildResult(engineResultPath, stagingRoot)
    );
    const networkProof = engineRun.network_namespace_proof;
    if (
      engineResult.openai_key_present ||
      engineResult.network_attempts !== 0 ||
      engineResult.network_proof.net_permission_granted ||
      !engineResult.network_proof.socket_tables_unchanged ||
      networkProof.network_attempts !== 0
    ) {
      fail("child_capability_present");
    }

    for (let index = 0; index < INPUT_COUNT; index += 1) {
      const fixtureId = fixtureIds[index]!;
      const childProjection = engineResult.projections[index]!;
      const expectedHash = anonymousInputs[index]!.decision_projection_sha256;
      if (childProjection.decision_projection_sha256 !== expectedHash) {
        fail("decision_projection_binding_mismatch");
      }
      const envelope = Object.freeze({
        schema_version: "sandbox-security-benchmark-decision-projection.v1",
        fixture_id: fixtureId,
        decision_projection_sha256: childProjection.decision_projection_sha256,
        projection: childProjection.projection
      });
      const path = join(projectionRoot, `${fixtureId}.json`);
      writeCompactJson(path, stagingRoot, envelope);
    }
    const decisionsTreeSha256 = contractModule.hashSandboxSecurityBenchmarkTree(
      projectionRoot
    );
    if (decisionsTreeSha256 !== accepted.seal.accepted_metrics.decisions_tree_sha256) {
      fail("decision_tree_hash_mismatch");
    }
    const cassetteTreeSha256 = contractModule.hashSandboxSecurityBenchmarkCandidateCassette(
      cassette
    );
    const captureManifestSha256 =
      contractModule.hashSandboxSecurityBenchmarkCanonicalJson(candidateManifest);
    const packageJson = Object.freeze({
      schema_version: "sandbox-security-benchmark-candidate-package.v1",
      fixture_count: INPUT_COUNT,
      provenance: "production_permissioned_v1",
      inputs_tree_sha256: candidateManifest.inputs_tree_sha256,
      decisions_tree_sha256: decisionsTreeSha256,
      cassette_tree_sha256: cassetteTreeSha256,
      capture_manifest_sha256: captureManifestSha256
    });
    writeJson(join(evaluatorRoot, "package.json"), stagingRoot, packageJson);

    const evaluatorPaths = Object.freeze({ ...paths, result_path: evaluatorResultPath });
    const evaluatorCommands = buildHermeticReplayChildCommands(
      evaluatorPaths as unknown as Readonly<Record<string, string>>
    );
    const evaluatorRun = await runChild(evaluatorCommands.evaluator.args, abortSignal);
    assertChildSuccess(evaluatorRun);
    if (evaluatorRun.network_namespace_proof.network_attempts !== 0) {
      fail("child_capability_present");
    }
    const evaluatorResult = parseEvaluatorChildResult(
      readChildResult(evaluatorResultPath, stagingRoot)
    );
    if (canonicalizeSandboxSecurityJson(evaluatorResult.metrics) !== canonicalizeSandboxSecurityJson(accepted.seal.accepted_metrics)) {
      fail("accepted_metrics_binding_mismatch");
    }
    return Object.freeze({
      evaluated_inputs: INPUT_COUNT,
      network_attempts: networkProof.network_attempts,
      openai_key_present: false,
      decision_projection_tree_sha256: decisionsTreeSha256,
      metrics: evaluatorResult.metrics
    });
      } finally {
        cleanupSandboxSecurityHermeticReplayStaging({ staging_root: stagingRoot });
      }
}

export async function runSandboxSecurityHermeticReplay(input: Readonly<{
  root: string;
  abort_signal?: AbortSignal;
}>): Promise<Readonly<SandboxSecurityHermeticReplayResult>> {
  if (!isPlainRecord(input) || typeof input.root !== "string") {
    fail("input_invalid");
  }
  const root = resolve(input.root);
  return runParent(root, input.abort_signal);
}

function parseChildArguments(argv: readonly string[]): Readonly<Record<string, string>> {
  const options = parseCli(argv);
  const child = options["--child"];
  if (child !== "engine" && child !== "evaluator") fail("child_invalid");
  return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
    const child = argv.find((argument) => argument.startsWith("--child="));
    if (child !== undefined) {
      const options = parseChildArguments(argv);
      assertExactHermeticChildPermissions(options);
      assertHermeticChildPermissionBoundary();
      if (options["--child"] === "engine") {
      await runEngineChild(options);
    } else {
      await runEvaluatorChild(options);
    }
    return;
  }
  const options = parseCli(argv);
  const root = options["--root"] ?? CORPUS_ROOT;
  const result = await runParent(root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch(() => {
    process.stderr.write(`${JSON.stringify({ error_code: `${INVALID}:failed_closed` })}\n`);
    process.exitCode = 1;
  });
}
