/**
 * P6-T2: Permission-limited live capture child.
 *
 * Accepts only a materialized input bundle + capture output directory, runs a
 * non-benchmark Judge strict-schema readiness check, then evaluates 300 inputs
 * serially with beginInput/endInput, writing a candidate content-free package.
 * Never reads truth, never seals, never spawns child/worker.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts
} from "../../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security.ts";
import {
  createSandboxSecurityLiveCaptureEngine,
  type SandboxSecurityCaptureSink
} from "../../../engines/sandbox/src/security-production/benchmark-composition.ts";
import {
  createSandboxSecurityProductionConfig,
  createSandboxSecurityProductionTransport
} from "../../../engines/sandbox/src/security-production/production-config.ts";
import {
  createSandboxSecurityOpenAiJudgeRequest,
  parseSandboxSecurityOpenAiJudgeResponse,
  SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/openai-judge-contract.ts";
import {
  SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION,
  SANDBOX_SECURITY_BENCHMARK_INPUT_SCHEMA_VERSION,
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkInputEnvelope
} from "./contracts.ts";
import {
  createSandboxSecurityCaptureSink,
  SANDBOX_SECURITY_CAPTURE_INPUT_COUNT,
  type SandboxSecurityCaptureAccumulator
} from "./capture-sink.ts";
import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "../../../engines/sandbox/src/security-production/deterministic-sanitizer.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "../../../engines/sandbox/src/security-production/rule-catalog.ts";
import {
  SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/ollama-contract.ts";

const INVALID = "sandbox_security_capture_live_reject";
const READINESS_TIMEOUT_MS = 4000 as const;
const LOCAL_SCHEMA_VERSION = "sandbox-security-local-model.v1" as const;
const JUDGE_SCHEMA_VERSION = "sandbox-security-judge.v1" as const;
const OLLAMA_MODEL = "qwen3:8b" as const;
const SHA256 = /^[0-9a-f]{64}$/u;
let judgeResolvedModelForCapture: string | null = null;

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
  readonly stdout_summary: string;
}

export interface SandboxSecurityLiveCapturePorts {
  readonly bundle_root: string;
  readonly input_root: string;
  readonly capture_output_root: string;
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
  }>) => Promise<void>;
  create_engine?: (input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    capture_sink: SandboxSecurityCaptureSink;
  }>) => Promise<SandboxSecurityEngine>;
  has_child_permission?: () => boolean;
  has_worker_permission?: () => boolean;
  require_live_config?: () => void;
}

function fail(code: string): never {
  const error = new Error(`${INVALID}:${code}`);
  error.name = INVALID;
  throw error;
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

function contentFreeDecisionProjection(
  decision: Readonly<SandboxSecurityDecision>
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    schema_version: decision.schema_version,
    verdict: decision.verdict,
    action: decision.action,
    risk_level: decision.risk_level,
    finding_count: decision.findings.length,
    detector_run_count: decision.detector_runs.length,
    evidence_ref_count: decision.evidence_refs.length
  });
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

function rejectForbiddenPorts(
  ports: Readonly<SandboxSecurityLiveCapturePorts>
): void {
  if (ports.truth_path !== undefined) fail("truth_argument");
  if (ports.evaluate_path !== undefined) fail("evaluate_argument");
  if (ports.metrics_path !== undefined) fail("metrics_argument");
  if (ports.inherited_fd !== undefined) fail("inherited_descriptor");

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

function assertLiveConfig(ports: Readonly<SandboxSecurityLiveCapturePorts>): void {
  if (ports.require_live_config !== undefined) {
    ports.require_live_config();
    return;
  }
  // Production path: require exact env surface without logging secrets.
  const digest = process.env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST?.trim() ?? "";
  const key = process.env.SANDBOX_SECURITY_JUDGE_API_KEY?.trim() ?? "";
  const enabled = process.env.SANDBOX_SECURITY_ENABLE_JUDGE?.trim() ?? "";
  const baseUrl = process.env.SANDBOX_SECURITY_JUDGE_BASE_URL?.trim() ?? "";
  const model = process.env.SANDBOX_SECURITY_JUDGE_MODEL?.trim() ?? "";
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) fail("missing_live_config:digest");
  if (key.length === 0) fail("missing_live_config:judge_key");
  if (enabled !== "1") fail("missing_live_config:judge_enable");
  if (baseUrl !== "https://doro.lol/v1") fail("missing_live_config:judge_base_url");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) fail("missing_live_config:judge_model");
}

function readinessPayloadBody(): Uint8Array {
  // Non-benchmark strict-schema readiness: one synthetic obligation so the
  // request is schema-valid. Not counted as a benchmark decision.
  const payload = {
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
  return createSandboxSecurityOpenAiJudgeRequest(payload as never, { judge_requested_model: process.env.SANDBOX_SECURITY_JUDGE_MODEL?.trim() || "gpt-5.4-mini" }).body;
}

async function defaultJudgeReadiness(input: Readonly<{
  timeout_ms: number;
  signal: AbortSignal;
}>): Promise<void> {
  if (input.timeout_ms !== READINESS_TIMEOUT_MS) {
    fail("readiness_timeout_budget");
  }
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
    const config = createSandboxSecurityProductionConfig("local_and_judge");
    const transport = createSandboxSecurityProductionTransport(config);
    const body = readinessPayloadBody();
    const response = await transport.request({
      provider: "openai",
      operation: "responses",
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
    // Readiness payload uses synthetic obligation; parse only for model identity.
    const readinessPayload = {
      request_token: "token://sandbox/security/readiness/0001",
      decision_id: "decision-readiness",
      stage: "user_input",
      content_sources: [],
      tool_request: null,
      routed_obligations: [
        {
          obligation_id: "obligation://sandbox/security/readiness/0001",
          category: "prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: "token://sandbox/security/source/0001",
              locator: { kind: "whole_source" }
            }
          ]
        }
      ]
    } as never;
    try {
      const parsed = parseSandboxSecurityOpenAiJudgeResponse(
        response.body,
        readinessPayload
      );
      if (typeof parsed.model !== "string" || parsed.model.length === 0) {
        fail("judge_readiness_failed");
      }
      judgeResolvedModelForCapture = parsed.model;
    } catch {
      fail("judge_readiness_failed");
    }
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

function writeCandidatePackage(input: Readonly<{
  capture_output_root: string;
  fixture_ids: readonly string[];
  decisions: readonly Readonly<SandboxSecurityDecision>[];
  accumulator: Readonly<SandboxSecurityCaptureAccumulator>;
  inputs_tree_sha256: string;
}>): Readonly<{
  candidate_root: string;
  cassette_tree_sha256: string;
  decisions_tree_sha256: string;
}> {
  const candidateRoot = join(input.capture_output_root, "candidate");
  if (existsSync(candidateRoot)) {
    rmSync(candidateRoot, { recursive: true, force: true });
  }
  const decisionsRoot = join(candidateRoot, "decisions");
  mkdirSync(decisionsRoot, { recursive: true });

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
  for (let index = 0; index < input.fixture_ids.length; index += 1) {
    const fixtureId = input.fixture_ids[index]!;
    const decision = input.decisions[index]!;
    const projection = contentFreeDecisionProjection(decision);
    const projectionSha = hashSandboxSecurityBenchmarkCanonicalJson(projection);
    decisionHashes.push(projectionSha);
    const envelope = deepFreeze({
      schema_version: "sandbox-security-benchmark-decision-projection.v1",
      fixture_id: fixtureId,
      decision_projection_sha256: projectionSha,
      projection
    });
    writeFileSync(
      join(decisionsRoot, `${fixtureId}.json`),
      `${JSON.stringify(envelope)}\n`
    );
  }

  const cassetteInputs = input.accumulator.inputs.map((unit, index) =>
    deepFreeze({
      fixture_id: input.fixture_ids[index]!,
      ollama: unit.ollama,
      judge: unit.judge,
      decision_projection_sha256: decisionHashes[index]!
    })
  );

  const digestFromInventory = (() => {
    const inventory = input.accumulator.qualification_inventory;
    if (
      inventory !== null &&
      inventory.status === "response" &&
      isPlainObject(inventory.normalized_response) &&
      typeof inventory.normalized_response.digest === "string"
    ) {
      return inventory.normalized_response.digest;
    }
    return process.env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST?.trim() ??
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  })();

  const captureManifest = deepFreeze({
    schema_version: SANDBOX_SECURITY_BENCHMARK_CAPTURE_SCHEMA_VERSION,
    inputs_tree_sha256: input.inputs_tree_sha256,
    fixture_count: input.fixture_ids.length,
    ollama_model: OLLAMA_MODEL,
    ollama_digest: digestFromInventory,
    ollama_qualification: {
      inventory: input.accumulator.qualification_inventory,
      prewarm: input.accumulator.qualification_prewarm
    },
    judge_provider_id: "doro",
    judge_base_url: "https://doro.lol/v1",
    judge_responses_url: "https://doro.lol/v1/responses",
    judge_requested_model: process.env.SANDBOX_SECURITY_JUDGE_MODEL?.trim() ?? "gpt-5.4-mini",
    judge_resolved_model:
      judgeResolvedModelForCapture ??
      (process.env.SANDBOX_SECURITY_JUDGE_MODEL?.trim() ?? "gpt-5.4-mini"),
    local_prompt_version: SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION,
    judge_prompt_version: SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION,
    local_schema_version: LOCAL_SCHEMA_VERSION,
    judge_schema_version: JUDGE_SCHEMA_VERSION,
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
  });

  const cassette = deepFreeze({
    schema_version: "sandbox-security-benchmark-candidate-cassette.v1",
    inputs: cassetteInputs
  });

  writeFileSync(
    join(candidateRoot, "capture-manifest.json"),
    `${JSON.stringify(captureManifest, null, 2)}\n`
  );
  writeFileSync(
    join(candidateRoot, "cassette.json"),
    `${JSON.stringify(cassette, null, 2)}\n`
  );

  const decisionsTreeSha256 = hashSandboxSecurityBenchmarkTree(decisionsRoot);
  const cassetteTreeSha256 = hashSandboxSecurityBenchmarkCanonicalJson(cassette);

  writeFileSync(
    join(candidateRoot, "package.json"),
    `${JSON.stringify(
      {
        schema_version: "sandbox-security-benchmark-candidate-package.v1",
        fixture_count: input.fixture_ids.length,
        inputs_tree_sha256: input.inputs_tree_sha256,
        decisions_tree_sha256: decisionsTreeSha256,
        cassette_tree_sha256: cassetteTreeSha256
      },
      null,
      2
    )}\n`
  );

  return {
    candidate_root: candidateRoot,
    cassette_tree_sha256: cassetteTreeSha256,
    decisions_tree_sha256: decisionsTreeSha256
  };
}

export async function runSandboxSecurityLiveCapture(
  ports: Readonly<SandboxSecurityLiveCapturePorts>
): Promise<Readonly<SandboxSecurityLiveCaptureResult>> {
  if (!isPlainObject(ports)) fail("ports_invalid");
  rejectForbiddenPorts(ports);

  const bundleRoot = assertRealDirectory(ports.bundle_root, "bundle_root");
  const inputRoot = assertRealDirectory(ports.input_root, "input_root");
  const captureOutputRoot = assertRealDirectory(
    ports.capture_output_root,
    "capture_output_root"
  );

  if (!isPathInside(bundleRoot, inputRoot)) fail("input_root_escape");
  if (!isPathInside(bundleRoot, captureOutputRoot)) {
    // Allow capture-output as sibling under bundle (standard layout).
    if (!isPathInside(bundleRoot, captureOutputRoot) && captureOutputRoot !== join(bundleRoot, "capture-output")) {
      // still require capture output under bundle
      if (!captureOutputRoot.startsWith(bundleRoot + sep) && captureOutputRoot !== bundleRoot) {
        fail("capture_output_escape");
      }
    }
  }
  if (!isPathInside(bundleRoot, captureOutputRoot) && !captureOutputRoot.startsWith(bundleRoot)) {
    fail("capture_output_escape");
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

  assertLiveConfig(ports);

  const events: SandboxSecurityLiveCaptureEvent[] = [];
  const runtime = ports.runtime ?? defaultRuntime();
  const parentSignal = ports.abort_signal;

  if (parentSignal?.aborted) fail("caller_cancelled");

  // Judge readiness first: independent 4000 ms budget, no retry, not a decision.
  const readinessController = new AbortController();
  const onParentAbort = (): void => {
    readinessController.abort(parentSignal?.reason ?? "caller_cancelled");
  };
  if (parentSignal !== undefined) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  try {
    const runReadiness = ports.run_judge_readiness ?? defaultJudgeReadiness;
    await runReadiness({
      timeout_ms: READINESS_TIMEOUT_MS,
      signal: readinessController.signal
    });
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

  if (parentSignal?.aborted) fail("caller_cancelled");
  events.push("capture_child_started");

  const sinkFactory = ports.create_sink ?? createSandboxSecurityCaptureSink;
  const sink = sinkFactory();

  const createEngine =
    ports.create_engine ??
    ((input) =>
      createSandboxSecurityLiveCaptureEngine({
        runtime: input.runtime,
        capture_sink: input.capture_sink
      }));

  const engine = await createEngine({
    runtime,
    capture_sink: sink
  });
  events.push("engine_created");

  const decisions: SandboxSecurityDecision[] = [];

  for (let index = 0; index < fixtureIds.length; index += 1) {
    if (parentSignal?.aborted) fail("caller_cancelled");
    const fixtureId = fixtureIds[index]!;
    const envelopePath = join(inputRoot, `${fixtureId}.json`);
    if (!existsSync(envelopePath)) fail(`input_missing:${fixtureId}`);
    let envelope;
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

    sink.beginInput();
    try {
      const decision = await engine.evaluate(
        envelope.evaluation_request as never,
        parentSignal
      );
      decisions.push(decision);
    } finally {
      sink.endInput();
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

  // Candidate package only — never seal/replay/capture.json at committed path.
  if (existsSync(join(captureOutputRoot, "seal.json"))) {
    fail("unexpected_seal_present");
  }

  const written = writeCandidatePackage({
    capture_output_root: captureOutputRoot,
    fixture_ids: fixtureIds,
    decisions,
    accumulator: snapshot,
    inputs_tree_sha256: ports.inputs_tree_sha256
  });
  events.push("candidate_written");
  events.push("capture_complete");

  const stdout_summary = JSON.stringify({
    status: "capture_complete",
    decision_count: decisions.length,
    fixture_count: fixtureIds.length,
    candidate_root: "candidate",
    cassette_tree_sha256: written.cassette_tree_sha256,
    decisions_tree_sha256: written.decisions_tree_sha256
  });

  return deepFreeze({
    events: Object.freeze([...events]),
    fixture_ids: Object.freeze([...fixtureIds]),
    decision_count: decisions.length,
    readiness_counted_as_decision: false as const,
    candidate_root: written.candidate_root,
    cassette_tree_sha256: written.cassette_tree_sha256,
    decisions_tree_sha256: written.decisions_tree_sha256,
    stdout_summary
  });
}

function parseArgv(argv: readonly string[]): {
  bundle_root?: string;
  input_root?: string;
  capture_output?: string;
  inputs_tree_sha256?: string;
} {
  const out: {
    bundle_root?: string;
    input_root?: string;
    capture_output?: string;
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
    fail(`unknown_cli_argument:${token}`);
  }
  return out;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  if (
    options.bundle_root === undefined ||
    options.input_root === undefined ||
    options.capture_output === undefined ||
    options.inputs_tree_sha256 === undefined
  ) {
    fail("missing_cli_arguments");
  }

  const result = await runSandboxSecurityLiveCapture({
    bundle_root: options.bundle_root,
    input_root: options.input_root,
    capture_output_root: options.capture_output,
    inputs_tree_sha256: options.inputs_tree_sha256
  });
  process.stdout.write(`${result.stdout_summary}\n`);
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : `${INVALID}:internal`;
    process.stderr.write(`${JSON.stringify({ error_code: message })}\n`);
    process.exitCode = 1;
  });
}
