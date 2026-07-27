import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSandboxSecurityCaptureSink,
  SANDBOX_SECURITY_CAPTURE_INPUT_COUNT
} from "../../scripts/benchmark/sandbox-security/capture-sink.ts";
import {
  main as runSandboxSecurityCaptureLiveCli,
  runSandboxSecurityLiveCapture,
  type SandboxSecurityLiveCapturePorts
} from "../../scripts/benchmark/sandbox-security/capture-live.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpTransport
} from "../../engines/sandbox/src/security-production/http-transport.ts";
import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts
} from "../../engines/sandbox/src/security/index.ts";
import type {
  SandboxSecurityCapturedProviderOutcome
} from "../../engines/sandbox/src/security-production/benchmark-composition.ts";
import {
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING
} from "../../engines/sandbox/src/security-production/p6-live-capture-profile.ts";
import type { SandboxSecurityDecision } from "../../shared/types/sandbox-security.ts";
import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkJudgeBinding
} from "../../scripts/benchmark/sandbox-security/contracts.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMITTED_INPUTS = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1/inputs"
);
const COMMITTED_INPUTS_TREE =
  "5b95a264e3fd4fb393e313a0dbdd3ea099af6257e9ef3a6e75790e0f6c659407";
const CAPTURE_LIVE_PATH = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/capture-live.ts"
);
const BENCHMARK_COMPOSITION_PATH = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security-production/benchmark-composition.ts"
);
const OLLAMA_LOCAL_DETECTOR_PATH = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security-production/ollama-local-detector.ts"
);
const SECURITY_ENGINE_PATH = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security/engine.ts"
);
const P6_PROFILE_PATH = resolve(
  REPO_ROOT,
  "engines/sandbox/src/security-production/p6-live-capture-profile.ts"
);

const DIGEST =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SAFE_TEST_JUDGE_RESOLVED_MODEL = "test-judge-resolved-model";

type RunSandboxSecurityJudgeReadiness = (input: Readonly<{
  timeout_ms: number;
  signal: AbortSignal;
  judge_protocol_id:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1";
  judge_requested_model: string;
  transport: SandboxSecurityHttpTransport;
}>) => Promise<string>;

let runSandboxSecurityJudgeReadiness: RunSandboxSecurityJudgeReadiness =
  async () => {
    throw new TypeError("sandbox_security_judge_readiness_missing");
  };
const captureLiveModule = await import(
  "../../scripts/benchmark/sandbox-security/capture-live.ts"
);
if (typeof captureLiveModule.runSandboxSecurityJudgeReadiness === "function") {
  runSandboxSecurityJudgeReadiness =
    captureLiveModule.runSandboxSecurityJudgeReadiness as RunSandboxSecurityJudgeReadiness;
}

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function successInventory(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "model_inventory",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        digest: DIGEST
      })
    })
  });
}

function successPrewarm(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "chat",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        verified_ollama_digest: DIGEST,
        done: true,
        message: Object.freeze({
          role: "assistant",
          parsed: Object.freeze({
            schema_version: "sandbox-security-local-model.v1",
            status: "no_match",
            candidates: Object.freeze([])
          })
        })
      })
    })
  });
}

function successLocalEvaluation(): SandboxSecurityCapturedProviderOutcome {
  return Object.freeze({
    capture_phase: "evaluation",
    provider: "ollama",
    operation: "chat",
    outcome: Object.freeze({
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: Object.freeze({
        model: "qwen3:8b",
        verified_ollama_digest: DIGEST,
        done: true,
        message: Object.freeze({
          role: "assistant",
          parsed: Object.freeze({
            schema_version: "sandbox-security-local-model.v1",
            status: "no_match",
            candidates: Object.freeze([])
          })
        })
      })
    })
  });
}

function successJudgeResponse(
  model: unknown,
  operation: "responses" | "chat_completions" = "responses"
): SandboxSecurityCapturedProviderOutcome {
  return {
    capture_phase: "evaluation",
    provider: "openai",
    operation,
    outcome: {
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: {
        model,
        status: "completed",
        parsed: {
          schema_version: "sandbox-security-judge.v1",
          obligation_results: [
            {
              obligation_ordinal: 1,
              outcome: "risk",
              confidence: "probable",
              severity: "high"
            }
          ]
        }
      }
    }
  } as SandboxSecurityCapturedProviderOutcome;
}

function contentFreeDecision(requestId: string, index: number): SandboxSecurityDecision {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: `decision-${String(index + 1).padStart(4, "0")}`,
    request_id: requestId,
    evaluation_mode: "simulation",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: "2026-07-21T00:00:00.000Z"
  };
}

function listFixtureIds(inputRoot: string): string[] {
  return readdirSync(inputRoot)
    .filter((name) => /^ssb-v1-\d{4}\.json$/u.test(name))
    .sort()
    .map((name) => name.replace(/\.json$/u, ""));
}

function defaultRuntime(): SandboxSecurityRuntimePorts {
  let decision = 0;
  return {
    now: () => "2026-07-21T00:00:00.000Z",
    nextDecisionId: () => {
      decision += 1;
      return `live-decision-${String(decision).padStart(4, "0")}`;
    },
    monotonicNowMs: () => 0,
    scheduleTimeout: () => () => undefined
  };
}

interface FakePortsOptions {
  truth_path?: string;
  inherited_fd?: number;
  evaluate_path?: string;
  metrics_path?: string;
  throwAtInput?: number;
  abortAfterReadiness?: boolean;
  readinessTimeoutMs?: number;
  readinessFail?: boolean;
  judgeResolvedModel?: unknown;
  judgeResponseModel?: unknown;
  judgeResponseOperation?: "responses" | "chat_completions";
  evaluationOutcomes?: readonly SandboxSecurityCapturedProviderOutcome[];
  readinessRetryAttempts?: { count: number };
  missingConfig?: boolean;
  hasChild?: boolean;
  hasWorker?: boolean;
  fixtureCount?: number;
  inputs_tree_sha256?: string;
  corruptHash?: boolean;
  skip_input_hash_check?: boolean;
  useProductionConfig?: boolean;
}

function fakeLivePorts(
  options: FakePortsOptions = {}
): SandboxSecurityLiveCapturePorts & {
  sinkEvents: string[];
  readinessCalls: number;
  readinessTimeouts: number[];
  evaluateCalls: number;
} {
  const root = tempRoot("ssb-capture-live-");
  const bundleRoot = join(root, "capture-bundle");
  const inputRoot = join(bundleRoot, "inputs");
  const captureOutputRoot = join(bundleRoot, "capture-output");
  mkdirSync(inputRoot, { recursive: true });
  mkdirSync(captureOutputRoot, { recursive: true });

  const fixtureCount = options.fixtureCount ?? SANDBOX_SECURITY_CAPTURE_INPUT_COUNT;
  const fixtureIds: string[] = [];
  for (let index = 0; index < fixtureCount; index += 1) {
    const fixtureId = `ssb-v1-${String(index + 1).padStart(4, "0")}`;
    fixtureIds.push(fixtureId);
    const envelope = {
      schema_version: "sandbox-security-benchmark-input.v1",
      fixture_id: fixtureId,
      evaluation_request: {
        submission: {
          schema_version: "sandbox-security-request.v1",
          request_id: `${"ab".repeat(16)}`.slice(0, 32).replace(/./g, "a"),
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          content_items: [
            {
              source_id: "observed_input",
              claimed_source_type: "user_input",
              media_type: "text/plain",
              value: `fixture ${fixtureId}`,
              provenance_ref: "source://benchmark/primary"
            }
          ]
        },
        authoritative_context: {
          schema_version: "sandbox-security-authoritative-context.v1",
          evaluation_mode: "simulation",
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          sources: [
            {
              source_id: "observed_input",
              authority_kind: "simulation_observation",
              source_type: "user_input",
              media_type: "text/plain",
              value: `fixture ${fixtureId}`,
              provenance_ref: "source://benchmark/primary"
            }
          ]
        }
      }
    };
    // stable fake request_id hex
    envelope.evaluation_request.submission.request_id = "a".repeat(32);
    writeFileSync(join(inputRoot, `${fixtureId}.json`), `${JSON.stringify(envelope)}\n`);
  }

  const sinkEvents: string[] = [];
  let readinessCalls = 0;
  const readinessTimeouts: number[] = [];
  let evaluateCalls = 0;
  const abortController = options.abortAfterReadiness ? new AbortController() : null;
  const judgeResolvedModel = Object.hasOwn(options, "judgeResolvedModel")
    ? options.judgeResolvedModel
    : SAFE_TEST_JUDGE_RESOLVED_MODEL;
  const hasJudgeResponse = Object.hasOwn(options, "judgeResponseModel");
  const sink = createSandboxSecurityCaptureSink();

  const ports: SandboxSecurityLiveCapturePorts & {
    sinkEvents: string[];
    readinessCalls: number;
    readinessTimeouts: number[];
    evaluateCalls: number;
  } = {
    bundle_root: bundleRoot,
    input_root: inputRoot,
    capture_output_root: captureOutputRoot,
    inputs_tree_sha256:
      options.inputs_tree_sha256 ??
      (options.corruptHash ? "0".repeat(64) : COMMITTED_INPUTS_TREE),
    truth_path: options.truth_path,
    inherited_fd: options.inherited_fd,
    evaluate_path: options.evaluate_path,
    metrics_path: options.metrics_path,
    skip_input_hash_check: options.skip_input_hash_check ?? true,
    fixture_ids: fixtureIds,
    sinkEvents,
    readinessCalls: 0,
    readinessTimeouts,
    evaluateCalls: 0,
    runtime: defaultRuntime(),
    has_child_permission: () => options.hasChild === true,
    has_worker_permission: () => options.hasWorker === true,
    create_sink: () => {
      const tracked = createSandboxSecurityCaptureSink();
      return {
        beginInput() {
          tracked.beginInput();
          sinkEvents.push(`begin:${tracked.snapshot().closed_input_count + 1}`);
        },
        record(outcome) {
          tracked.record(outcome);
        },
        endInput() {
          const openIndex = tracked.snapshot().closed_input_count + 1;
          tracked.endInput();
          sinkEvents.push(`end:${openIndex}`);
        },
        assertDrained() {
          tracked.assertDrained();
        },
        snapshot() {
          return tracked.snapshot();
        }
      };
    },
    run_judge_readiness: async (input) => {
      readinessCalls += 1;
      ports.readinessCalls = readinessCalls;
      readinessTimeouts.push(input.timeout_ms);
      if (options.readinessFail) {
        throw new Error("sandbox_security_capture_live_reject:judge_readiness_failed");
      }
      if (abortController !== null) {
        // Abort only after readiness settles so the event order is readiness first.
        queueMicrotask(() => abortController.abort("caller_cancelled"));
      }
      return judgeResolvedModel as never;
    },
    create_engine: async ({ capture_sink, transport }) => {
      void transport;
      capture_sink.record(successInventory());
      capture_sink.record(successPrewarm());
      const engine: SandboxSecurityEngine = {
        async evaluate(request, _callerSignal) {
          void _callerSignal;
          evaluateCalls += 1;
          ports.evaluateCalls = evaluateCalls;
          if (
            options.throwAtInput !== undefined &&
            evaluateCalls === options.throwAtInput
          ) {
            throw new Error("sandbox_security_capture_live_reject:forced_evaluate_failure");
          }
          for (const outcome of options.evaluationOutcomes ?? []) {
            capture_sink.record(outcome);
          }
          if (hasJudgeResponse) {
            capture_sink.record(successLocalEvaluation());
            capture_sink.record(successJudgeResponse(
              options.judgeResponseModel,
              options.judgeResponseOperation
            ));
          }
          return contentFreeDecision(request.submission.request_id, evaluateCalls - 1);
        }
      };
      return engine;
    },
    abort_signal: abortController?.signal,
    require_live_config: options.useProductionConfig
      ? undefined
      : options.missingConfig
      ? () => {
          throw new Error("sandbox_security_capture_live_reject:missing_live_config");
        }
      : () => {
          // Fake-port unit tests intentionally skip credentialed env.
        }
  };

  // expose mutable counters
  Object.defineProperty(ports, "readinessCalls", {
    get: () => readinessCalls,
    set: (value: number) => {
      readinessCalls = value;
    }
  });
  Object.defineProperty(ports, "evaluateCalls", {
    get: () => evaluateCalls,
    set: (value: number) => {
      evaluateCalls = value;
    }
  });

  return ports;
}

function chatReadinessResponse(model: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        logprobs: null,
        message: {
          content: JSON.stringify({
            schema_version: "sandbox-security-judge.v1",
            obligation_results: [
              {
                obligation_id: "obligation://sandbox/security/readiness/0001",
                outcome: "clearance",
                confidence: "probable",
                severity: null
              }
            ]
          }),
          role: "assistant"
        }
      }
    ],
    created: 1,
    id: "chatcmpl-readiness",
    model,
    object: "chat.completion",
    system_fingerprint: null,
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2
    }
  }));
}

async function withSyntheticLiveEnvironment<T>(
  protocol: "openai_responses_v1" | "openai_chat_completions_json_v1",
  action: () => Promise<T>
): Promise<T> {
  const keys = [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE"
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST = DIGEST;
  process.env.SANDBOX_SECURITY_JUDGE_PROTOCOL = protocol;
  process.env.SANDBOX_SECURITY_JUDGE_BASE_URL = "https://judge.example.test/v1";
  process.env.SANDBOX_SECURITY_JUDGE_MODEL = "gpt-5.4-mini";
  process.env.SANDBOX_SECURITY_JUDGE_API_KEY = "synthetic-test-key";
  process.env.SANDBOX_SECURITY_ENABLE_JUDGE = "1";
  try {
    return await action();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("REQ-SBX-GENERAL-002 P6 live runtime timing comes only from the P6 profile", () => {
  const captureSource = readFileSync(CAPTURE_LIVE_PATH, "utf8");
  const benchmarkCompositionSource = readFileSync(
    BENCHMARK_COMPOSITION_PATH,
    "utf8"
  );
  const ollamaSource = readFileSync(OLLAMA_LOCAL_DETECTOR_PATH, "utf8");
  const engineSource = readFileSync(SECURITY_ENGINE_PATH, "utf8");
  const profileSource = readFileSync(P6_PROFILE_PATH, "utf8");

  assert.match(
    captureSource,
    /SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING\.readiness_timeout_ms/u
  );
  assert.doesNotMatch(
    captureSource,
    /const READINESS_TIMEOUT_MS = 20000/u
  );
  assert.match(
    benchmarkCompositionSource,
    /SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING\.qualification_timeout_ms/u
  );
  assert.doesNotMatch(
    benchmarkCompositionSource,
    /qualification_timeout_ms !== 20000/u
  );
  assert.match(
    ollamaSource,
    /SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING\.qualification_timeout_ms/u
  );
  assert.doesNotMatch(
    ollamaSource,
    /LIVE_CAPTURE_WARMED_PROBE_LATENCY_MS = 20000/u
  );
  assert.deepEqual(SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING, {
    readiness_timeout_ms: 20000,
    qualification_timeout_ms: 20000,
    local_detector_slot_timeout_ms: 20000,
    judge_detector_slot_timeout_ms: 20000,
    normal_work_budget_ms: 40000
  });
  assert.match(
    engineSource,
    /createSandboxSecurityP6LiveCaptureEngine[\s\S]*?profileResolver:\s*resolveSandboxSecurityP6LiveCaptureProfile/u
  );
  assert.doesNotMatch(
    profileSource,
    /resolveSandboxSecurityP6LiveCapturePolicyProfile/u
  );
  assert.doesNotMatch(
    engineSource,
    /createSandboxSecurityEngineWithPolicyProfileResolver/u
  );
});

test("REQ-SBX-GENERAL-002 capture child performs non-benchmark Judge readiness first", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.deepEqual(result.events.slice(0, 2), [
    "judge_readiness",
    "capture_child_started"
  ]);
  assert.equal(ports.readinessCalls, 1);
  assert.deepEqual(ports.readinessTimeouts, [20000]);
  assert.ok(result.events.indexOf("judge_readiness") < result.events.indexOf("capture_child_started"));
  assert.ok(result.events.indexOf("capture_child_started") < result.events.indexOf("engine_created"));
  assert.ok(result.events.indexOf("engine_created") < result.events.indexOf("inputs_complete"));
});

test("REQ-SBX-GENERAL-002 Chat readiness creates and parses exactly one request at 20000 ms", async () => {
  const operations: string[] = [];
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(request: Readonly<SandboxSecurityHttpRequest>) {
      operations.push(request.operation);
      assert.equal(request.provider, "openai");
      assert.equal(request.operation, "chat_completions");
      return Object.freeze({
        status: 200,
        content_type: "application/json",
        body: chatReadinessResponse("provider-chat-resolved-model")
      });
    }
  });

  const resolvedModel = await runSandboxSecurityJudgeReadiness({
    timeout_ms: 20000,
    signal: new AbortController().signal,
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_requested_model: "gpt-5.4-mini",
    transport
  });

  assert.equal(resolvedModel, "provider-chat-resolved-model");
  assert.deepEqual(operations, ["chat_completions"]);
});

test("REQ-SBX-GENERAL-002 Chat readiness never probes Responses after any Chat failure", async () => {
  const failures: readonly ((operation: string) => Promise<never> | Readonly<{
    status: number;
    content_type: string;
    body: Uint8Array;
  }>)[] = [
    () => {
      const error = new Error("synthetic_transport_failure");
      error.name = "synthetic_transport_failure";
      return Promise.reject(error);
    },
    () => ({
      status: 503,
      content_type: "application/json",
      body: new Uint8Array()
    }),
    () => ({
      status: 200,
      content_type: "application/json",
      body: new TextEncoder().encode("{}")
    })
  ];

  for (const failure of failures) {
    const operations: string[] = [];
    const transport: SandboxSecurityHttpTransport = Object.freeze({
      async request(request: Readonly<SandboxSecurityHttpRequest>) {
        operations.push(request.operation);
        return await failure(request.operation);
      }
    });
    await assert.rejects(
      () =>
        runSandboxSecurityJudgeReadiness({
          timeout_ms: 20000,
          signal: new AbortController().signal,
          judge_protocol_id: "openai_chat_completions_json_v1",
          judge_requested_model: "gpt-5.4-mini",
          transport
        }),
      /sandbox_security_capture_live_reject:judge_readiness_failed/u
    );
    assert.deepEqual(operations, ["chat_completions"]);
  }
});

test("REQ-SBX-GENERAL-002 runner closes every input in finally", async () => {
  const ports = fakeLivePorts({ throwAtInput: 2, fixtureCount: 3 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports));
  assert.deepEqual(ports.sinkEvents, ["begin:1", "end:1", "begin:2", "end:2"]);
});

test("REQ-SBX-GENERAL-002 capture output binding rejects a root swap after validation", async () => {
  const ports = fakeLivePorts({ fixtureCount: 1 });
  const detachedOutput = join(ports.bundle_root, "detached-capture-output");
  const hijackRoot = tempRoot("ssb-capture-output-hijack-");
  const createEngine = ports.create_engine!;

  ports.create_engine = async (input) => {
    const engine = await createEngine(input);
    return {
      async evaluate(request, callerSignal) {
        const decision = await engine.evaluate(request, callerSignal);
        renameSync(ports.capture_output_root, detachedOutput);
        symlinkSync(hijackRoot, ports.capture_output_root);
        return decision;
      }
    };
  };

  await assert.rejects(
    () => runSandboxSecurityLiveCapture(ports),
    /capture_output_(?:binding|identity|path).*changed|capture_output_symlink/i
  );
  assert.equal(existsSync(join(hijackRoot, "candidate")), false);
});

test("REQ-SBX-GENERAL-002 capture child rejects truth arguments and unexpected descriptors", async () => {
  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture(
        fakeLivePorts({ truth_path: "/tmp/truth.json", fixtureCount: 1 })
      ),
    /truth/i
  );
  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture(
        fakeLivePorts({ inherited_fd: 3, fixtureCount: 1 })
      ),
    /descriptor|inherited_fd|fd/i
  );
  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture(
        fakeLivePorts({ evaluate_path: "/tmp/evaluate.ts", fixtureCount: 1 })
      ),
    /evaluate|metric|truth/i
  );
  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture(
        fakeLivePorts({ metrics_path: "/tmp/metrics.json", fixtureCount: 1 })
      ),
    /metric|evaluate|truth/i
  );
});

test("REQ-SBX-GENERAL-002 capture CLI rejects profile selection without reflecting its value", async () => {
  const secretLikeValue = "forbidden-profile-secret-value";
  await assert.rejects(
    () => runSandboxSecurityCaptureLiveCli([`--profile=${secretLikeValue}`]),
    (error: unknown) => {
      assert.equal(
        error instanceof Error ? error.message : "",
        "sandbox_security_capture_live_reject:unknown_cli_argument"
      );
      assert.doesNotMatch(
        error instanceof Error ? error.message : "",
        new RegExp(secretLikeValue, "u")
      );
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-002 capture CLI stderr is bounded JSON for unknown profile arguments", () => {
  const secretLikeValue = "forbidden-profile-secret-value";
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      CAPTURE_LIVE_PATH,
      `--profile=${secretLikeValue}`
    ],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    error_code: "sandbox_security_capture_live_reject:unknown_cli_argument"
  });
  assert.doesNotMatch(result.stderr, new RegExp(secretLikeValue, "u"));
  assert.doesNotMatch(result.stderr, /Error:|node:internal|\.ts:/u);
});

test("REQ-SBX-GENERAL-002 readiness budget is exactly 20000 ms with no retry", async () => {
  const ports = fakeLivePorts({ readinessFail: true, fixtureCount: 1 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports));
  assert.equal(ports.readinessCalls, 1);
  assert.deepEqual(ports.readinessTimeouts, [20000]);
  assert.equal(ports.evaluateCalls, 0);
  assert.ok(!ports.sinkEvents.some((event) => event.startsWith("begin:")));
});

test("REQ-SBX-GENERAL-002 capture child delegates dynamic config environment reads to production config", () => {
  const source = readFileSync(CAPTURE_LIVE_PATH, "utf8");
  assert.doesNotMatch(source, /process\.env\b/u);
});

test("REQ-SBX-GENERAL-002 binds a resolved Judge model per capture without requested-model fallback", async () => {
  const firstResolvedModel = "provider-route-a";
  const first = fakeLivePorts({
    fixtureCount: 1,
    judgeResolvedModel: firstResolvedModel
  });
  await runSandboxSecurityLiveCapture(first);
  const firstManifest = JSON.parse(
    readFileSync(join(first.capture_output_root, "candidate", "capture-manifest.json"), "utf8")
  ) as { judge_requested_model: string; judge_resolved_model: string };
  assert.equal(firstManifest.judge_requested_model, "gpt-5.4-mini");
  assert.equal(firstManifest.judge_resolved_model, firstResolvedModel);

  const secondResolvedModel = "provider-route-b";
  const second = fakeLivePorts({
    fixtureCount: 1,
    judgeResolvedModel: secondResolvedModel
  });
  await runSandboxSecurityLiveCapture(second);
  const secondManifest = JSON.parse(
    readFileSync(join(second.capture_output_root, "candidate", "capture-manifest.json"), "utf8")
  ) as { judge_resolved_model: string };
  assert.equal(secondManifest.judge_resolved_model, secondResolvedModel);
  assert.notEqual(secondManifest.judge_resolved_model, firstManifest.judge_resolved_model);
});

test("REQ-SBX-GENERAL-002 keeps concurrent capture Judge model bindings isolated", async () => {
  let releaseFirstEngine: (() => void) | undefined;
  let signalFirstEngineStarted: (() => void) | undefined;
  const firstEngineStarted = new Promise<void>((resolve) => {
    signalFirstEngineStarted = resolve;
  });
  const firstEngineRelease = new Promise<void>((resolve) => {
    releaseFirstEngine = resolve;
  });

  const first = fakeLivePorts({ fixtureCount: 1 });
  const firstCapture = runSandboxSecurityLiveCapture({
    ...first,
    run_judge_readiness: async () => {
      return "provider-route-a";
    },
    create_engine: async ({ runtime, capture_sink, transport }) => {
      void transport;
      signalFirstEngineStarted?.();
      await firstEngineRelease;
      return first.create_engine!({ runtime, capture_sink, transport });
    }
  });

  await firstEngineStarted;

  const second = fakeLivePorts({
    fixtureCount: 1,
    judgeResolvedModel: "provider-route-b"
  });
  try {
    await runSandboxSecurityLiveCapture(second);
  } finally {
    releaseFirstEngine?.();
  }
  await firstCapture;

  const firstManifest = JSON.parse(
    readFileSync(join(first.capture_output_root, "candidate", "capture-manifest.json"), "utf8")
  ) as { judge_resolved_model: string };
  const secondManifest = JSON.parse(
    readFileSync(join(second.capture_output_root, "candidate", "capture-manifest.json"), "utf8")
  ) as { judge_resolved_model: string };
  assert.equal(firstManifest.judge_resolved_model, "provider-route-a");
  assert.equal(secondManifest.judge_resolved_model, "provider-route-b");
});

test("REQ-SBX-GENERAL-002 fails closed when readiness does not return a valid resolved Judge model", async () => {
  for (const judgeResolvedModel of [undefined, "invalid model name"]) {
    await assert.rejects(
      () =>
        runSandboxSecurityLiveCapture(
          fakeLivePorts({ fixtureCount: 1, judgeResolvedModel })
        ),
      /judge_resolved_model/i
    );
  }
});

test("REQ-SBX-GENERAL-002 fails closed when a captured Judge response changes the readiness model", async () => {
  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture(
        fakeLivePorts({
          fixtureCount: 1,
          judgeResolvedModel: "provider-route-a",
          judgeResponseModel: "provider-route-b"
        })
      ),
    /judge_resolved_model/i
  );
});

test("REQ-SBX-GENERAL-002 fails closed when a captured Judge response omits or uses an unsafe resolved model", async () => {
  for (const judgeResponseModel of [undefined, "invalid model name"]) {
    await assert.rejects(
      () =>
        runSandboxSecurityLiveCapture(
          fakeLivePorts({
            fixtureCount: 1,
            judgeResolvedModel: "provider-route-a",
            judgeResponseModel
          })
        ),
      /judge_resolved_model/i
    );
  }
});

test("REQ-SBX-GENERAL-002 readiness is not counted as a benchmark decision", async () => {
  const ports = fakeLivePorts({ fixtureCount: 2 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.equal(ports.readinessCalls, 1);
  assert.equal(ports.evaluateCalls, 2);
  assert.equal(result.decision_count, 2);
  assert.equal(result.readiness_counted_as_decision, false);
});

test("REQ-SBX-GENERAL-002 processes fixtures in immutable input order", async () => {
  const ports = fakeLivePorts({ fixtureCount: 5 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.deepEqual(
    result.fixture_ids,
    ["ssb-v1-0001", "ssb-v1-0002", "ssb-v1-0003", "ssb-v1-0004", "ssb-v1-0005"]
  );
  assert.equal(result.decision_count, 5);
});

test("REQ-SBX-GENERAL-002 caller abort after readiness does not seal", async () => {
  const ports = fakeLivePorts({ abortAfterReadiness: true, fixtureCount: 2 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports), /cancel|abort/i);
  assert.equal(existsSync(join(ports.capture_output_root, "seal.json")), false);
  assert.equal(existsSync(join(ports.capture_output_root, "replay")), false);
  assert.equal(existsSync(join(ports.capture_output_root, "capture.json")), false);
});

test("REQ-SBX-GENERAL-002 drains sink before writing candidate package", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.ok(result.events.includes("sink_drained"));
  assert.ok(
    result.events.indexOf("sink_drained") < result.events.indexOf("candidate_written")
  );
  assert.equal(existsSync(join(ports.capture_output_root, "candidate")), true);
  assert.equal(existsSync(join(ports.capture_output_root, "seal.json")), false);
  assert.equal(existsSync(join(ports.capture_output_root, "replay")), false);
});

test("REQ-SBX-GENERAL-002 rejects child and worker permission grants", async () => {
  await assert.rejects(
    () => runSandboxSecurityLiveCapture(fakeLivePorts({ hasChild: true, fixtureCount: 1 })),
    /child/i
  );
  await assert.rejects(
    () => runSandboxSecurityLiveCapture(fakeLivePorts({ hasWorker: true, fixtureCount: 1 })),
    /worker/i
  );
});

test("REQ-SBX-GENERAL-002 rejects missing live config before readiness", async () => {
  const ports = fakeLivePorts({ missingConfig: true, fixtureCount: 1 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports), /missing_live_config|config/i);
  assert.equal(ports.readinessCalls, 0);
});

test("REQ-SBX-GENERAL-002 validates an input tree mismatch before live config", async () => {
  const ports = fakeLivePorts({
    missingConfig: true,
    corruptHash: true,
    skip_input_hash_check: false,
    fixtureCount: 1
  });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports), /hash|inputs_tree/i);
  assert.equal(ports.readinessCalls, 0);
});

test("REQ-SBX-GENERAL-002 rejects the bundle root as a capture output root", async () => {
  const ports = fakeLivePorts({ missingConfig: true, fixtureCount: 1 });

  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture({
        ...ports,
        capture_output_root: ports.bundle_root
      }),
    /capture_output_escape/i
  );
  assert.equal(ports.readinessCalls, 0);
});

test("REQ-SBX-GENERAL-002 rejects a pre-existing candidate without deleting it", async () => {
  const ports = fakeLivePorts({ fixtureCount: 1 });
  const candidateRoot = join(ports.capture_output_root, "candidate");
  mkdirSync(candidateRoot);
  writeFileSync(join(candidateRoot, "pre-existing"), "retain\n");

  await assert.rejects(
    () => runSandboxSecurityLiveCapture(ports),
    /candidate_already_exists/i
  );
  assert.equal(ports.readinessCalls, 1);
  assert.equal(readFileSync(join(candidateRoot, "pre-existing"), "utf8"), "retain\n");
});

test("REQ-SBX-GENERAL-002 concurrent captures fail closed while the first capture owns staging", async () => {
  let releaseFirstEngine: (() => void) | undefined;
  let signalFirstEngineStarted: (() => void) | undefined;
  const firstEngineStarted = new Promise<void>((resolve) => {
    signalFirstEngineStarted = resolve;
  });
  const firstEngineRelease = new Promise<void>((resolve) => {
    releaseFirstEngine = resolve;
  });

  const shared = fakeLivePorts({ fixtureCount: 1 });
  const firstCapture = runSandboxSecurityLiveCapture({
    ...shared,
    run_judge_readiness: async () => "provider-route-a",
    create_engine: async ({ runtime, capture_sink, transport }) => {
      void transport;
      const engine = await shared.create_engine!({ runtime, capture_sink, transport });
      return {
        evaluate: async (request, signal) => {
          signalFirstEngineStarted?.();
          await firstEngineRelease;
          return engine.evaluate(request, signal);
        }
      };
    }
  });

  await firstEngineStarted;
  try {
    await assert.rejects(
      () =>
        runSandboxSecurityLiveCapture({
          ...shared,
          run_judge_readiness: async () => "provider-route-b"
        }),
      /candidate_staging_already_exists/i
    );
  } finally {
    releaseFirstEngine?.();
  }

  await firstCapture;
  const manifest = JSON.parse(
    readFileSync(join(shared.capture_output_root, "candidate", "capture-manifest.json"), "utf8")
  ) as { judge_resolved_model: string };
  assert.equal(manifest.judge_resolved_model, "provider-route-a");
});

test("REQ-SBX-GENERAL-002 candidate package is content-free and output-contained", async () => {
  const ports = fakeLivePorts({ fixtureCount: 2 });
  const result = await runSandboxSecurityLiveCapture(ports);
  const candidateRoot = join(ports.capture_output_root, "candidate");
  assert.equal(result.candidate_root, candidateRoot);
  const decisionsDir = join(candidateRoot, "decisions");
  assert.equal(readdirSync(decisionsDir).sort().join(","), "ssb-v1-0001.json,ssb-v1-0002.json");
  const cassette = JSON.parse(
    readFileSync(join(candidateRoot, "cassette.json"), "utf8")
  ) as {
    judge_binding_sha256: string;
    inputs: Array<{ judge_binding_sha256: string }>;
  };
  const captureManifest = JSON.parse(
    readFileSync(join(candidateRoot, "capture-manifest.json"), "utf8")
  ) as Record<string, unknown>;
  const candidatePackage = JSON.parse(
    readFileSync(join(candidateRoot, "package.json"), "utf8")
  ) as { capture_manifest_sha256: string };
  assert.equal(cassette.inputs.length, 2);
  assert.equal(captureManifest.judge_protocol_id, "openai_responses_v1");
  const judgeBindingSha256 = hashSandboxSecurityBenchmarkJudgeBinding({
    judge_protocol_id: captureManifest.judge_protocol_id,
    judge_endpoint_policy_id: captureManifest.judge_endpoint_policy_id,
    judge_base_url: captureManifest.judge_base_url,
    judge_endpoint_url: captureManifest.judge_endpoint_url,
    judge_requested_model: captureManifest.judge_requested_model,
    judge_resolved_model: captureManifest.judge_resolved_model
  });
  assert.equal(captureManifest.judge_binding_sha256, judgeBindingSha256);
  assert.equal(cassette.judge_binding_sha256, judgeBindingSha256);
  assert.deepEqual(
    cassette.inputs.map((unit) => unit.judge_binding_sha256),
    [judgeBindingSha256, judgeBindingSha256]
  );
  assert.equal(
    candidatePackage.capture_manifest_sha256,
    hashSandboxSecurityBenchmarkCanonicalJson(captureManifest)
  );
  const decisionText = readFileSync(join(decisionsDir, "ssb-v1-0001.json"), "utf8");
  assert.doesNotMatch(decisionText, /SANDBOX_SECURITY_JUDGE_API_KEY|fixture text|primary_category|verdict_class/);
  assert.doesNotMatch(JSON.stringify(cassette), /SANDBOX_SECURITY_JUDGE_API_KEY|primary_category|truth/);
});

test("REQ-SBX-GENERAL-002 Chat capture writes the exact protocol endpoint and six-field binding", async () => {
  const ports = fakeLivePorts({
    fixtureCount: 1,
    useProductionConfig: true,
    judgeResponseModel: SAFE_TEST_JUDGE_RESOLVED_MODEL,
    judgeResponseOperation: "chat_completions"
  });
  await withSyntheticLiveEnvironment(
    "openai_chat_completions_json_v1",
    () => runSandboxSecurityLiveCapture(ports)
  );
  const manifest = JSON.parse(
    readFileSync(
      join(ports.capture_output_root, "candidate", "capture-manifest.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
  const binding = {
    judge_protocol_id: manifest.judge_protocol_id,
    judge_endpoint_policy_id: manifest.judge_endpoint_policy_id,
    judge_base_url: manifest.judge_base_url,
    judge_endpoint_url: manifest.judge_endpoint_url,
    judge_requested_model: manifest.judge_requested_model,
    judge_resolved_model: manifest.judge_resolved_model
  };
  const cassette = JSON.parse(
    readFileSync(
      join(ports.capture_output_root, "candidate", "cassette.json"),
      "utf8"
    )
  ) as {
    inputs: Array<{
      judge: {
        status: string;
        normalized_response?: { model?: unknown };
      };
    }>;
  };

  assert.equal(manifest.judge_protocol_id, "openai_chat_completions_json_v1");
  assert.equal(
    manifest.judge_endpoint_url,
    "https://judge.example.test/v1/chat/completions"
  );
  assert.equal(
    manifest.judge_binding_sha256,
    hashSandboxSecurityBenchmarkJudgeBinding(binding)
  );
  assert.equal(cassette.inputs[0]?.judge.status, "response");
  assert.equal(
    cassette.inputs[0]?.judge.normalized_response?.model,
    SAFE_TEST_JUDGE_RESOLVED_MODEL
  );
});

test("REQ-SBX-GENERAL-002 rejects bundle hash mismatch before readiness", async () => {
  const ports = fakeLivePorts({
    fixtureCount: 1,
    corruptHash: true,
    skip_input_hash_check: false,
    inputs_tree_sha256: "0".repeat(64)
  });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports), /hash|inputs_tree/i);
  assert.equal(ports.readinessCalls, 0);
});

test("REQ-SBX-GENERAL-002 writes no per-fixture diagnostic stdout payload", async () => {
  const ports = fakeLivePorts({ fixtureCount: 2 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.equal(result.stdout_summary.includes("ssb-v1-0001"), false);
  assert.equal(result.stdout_summary.includes("fixture text"), false);
  assert.doesNotMatch(result.stdout_summary, /primary_category|verdict_class|SANDBOX_SECURITY_JUDGE_API_KEY/);
  assert.match(result.stdout_summary, /decision_count|candidate|capture_complete/);
});

test("REQ-SBX-GENERAL-002 live capture rejects invoked provider failures before package completion", async () => {
  const failures = [
    { status: "http_error", http_status: 503 },
    { status: "transport_error", error_code: "connection_failed" },
    { status: "signal_termination", termination_reason: "slot_timeout" }
  ] as const;

  for (const provider of ["ollama", "openai"] as const) {
    for (const outcome of failures) {
      const ports = fakeLivePorts({
        fixtureCount: 1,
        evaluationOutcomes: [
          {
            capture_phase: "evaluation",
            provider,
            operation: provider === "ollama" ? "chat" : "responses",
            outcome
          } as SandboxSecurityCapturedProviderOutcome
        ]
      });

      await assert.rejects(
        () => runSandboxSecurityLiveCapture(ports),
        /provider_outcome_not_acceptance_capable|provider.*outcome|acceptance/i
      );
      assert.equal(
        existsSync(join(ports.capture_output_root, "candidate", "package.json")),
        false
      );
    }
  }
});

test("REQ-SBX-GENERAL-002 live capture passes only the closed sink contract into composition", async () => {
  const ports = fakeLivePorts({ fixtureCount: 1 });
  const createEngine = ports.create_engine!;
  ports.create_engine = async (input) => {
    assert.deepEqual(Object.keys(input.capture_sink).sort(), [
      "assertDrained",
      "beginInput",
      "endInput",
      "record"
    ]);
    assert.equal("snapshot" in input.capture_sink, false);
    return createEngine(input);
  };

  const result = await runSandboxSecurityLiveCapture(ports);

  assert.equal(result.decision_count, 1);
});

test("REQ-SBX-GENERAL-002 live capture snapshots injected factories before readiness awaits", async () => {
  const ports = fakeLivePorts({ fixtureCount: 1 });
  const originalCreateEngine = ports.create_engine!;
  let originalCalls = 0;
  let replacementCalls = 0;
  ports.create_engine = async (input) => {
    originalCalls += 1;
    return originalCreateEngine(input);
  };
  ports.run_judge_readiness = async () => {
    ports.create_engine = async () => {
      replacementCalls += 1;
      throw new Error("post_readiness_factory_mutation_reached");
    };
    return SAFE_TEST_JUDGE_RESOLVED_MODEL;
  };

  const result = await runSandboxSecurityLiveCapture(ports);

  assert.equal(result.decision_count, 1);
  assert.equal(originalCalls, 1);
  assert.equal(replacementCalls, 0);
  const packageJson = JSON.parse(
    readFileSync(join(result.candidate_root, "package.json"), "utf8")
  ) as Record<string, unknown>;
  assert.equal(packageJson.provenance, "test_injected_v1");
});

test("REQ-SBX-GENERAL-002 live capture ignores inherited optional factories", async () => {
  const ports = fakeLivePorts({ fixtureCount: 1 });
  delete ports.create_sink;
  Object.defineProperty(Object.prototype, "create_sink", {
    configurable: true,
    value: () => {
      throw new Error("inherited_capture_sink_factory_reached");
    }
  });

  try {
    const result = await runSandboxSecurityLiveCapture(ports);
    assert.equal(result.decision_count, 1);
  } finally {
    delete (Object.prototype as { create_sink?: unknown }).create_sink;
  }
});

test("REQ-SBX-GENERAL-002 live capture reuses the readiness transport and does not reread config after readiness", async () => {
  const root = tempRoot("ssb-same-transport-");
  const bundleRoot = join(root, "capture-bundle");
  const inputRoot = join(bundleRoot, "inputs");
  const captureOutputRoot = join(bundleRoot, "capture-output");
  mkdirSync(inputRoot, { recursive: true });
  mkdirSync(captureOutputRoot, { recursive: true });

  const fixtureId = "ssb-v1-0001";
  writeFileSync(
    join(inputRoot, `${fixtureId}.json`),
    `${JSON.stringify({
      schema_version: "sandbox-security-benchmark-input.v1",
      fixture_id: fixtureId,
      evaluation_request: {
        submission: {
          schema_version: "sandbox-security-request.v1",
          request_id: "a".repeat(32),
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          content_items: [
            {
              source_id: "observed_input",
              claimed_source_type: "user_input",
              media_type: "text/plain",
              value: "fixture",
              provenance_ref: "source://benchmark/primary"
            }
          ]
        },
        authoritative_context: {
          schema_version: "sandbox-security-authoritative-context.v1",
          evaluation_mode: "simulation",
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          sources: [
            {
              source_id: "observed_input",
              authority_kind: "simulation_observation",
              source_type: "user_input",
              media_type: "text/plain",
              value: "fixture",
              provenance_ref: "source://benchmark/primary"
            }
          ]
        }
      }
    })}\n`
  );

  const readinessTransport: SandboxSecurityHttpTransport = Object.freeze({
    async request() {
      return Object.freeze({
        status: 200,
        content_type: "application/json",
        body: new Uint8Array()
      });
    }
  });
  const observedTransports: unknown[] = [];
  let configFactoryCalls = 0;
  let envMutatedAfterReadiness = false;

  const result = await runSandboxSecurityLiveCapture({
    bundle_root: bundleRoot,
    input_root: inputRoot,
    capture_output_root: captureOutputRoot,
    inputs_tree_sha256: "a".repeat(64),
    fixture_ids: [fixtureId],
    skip_input_hash_check: true,
    runtime: defaultRuntime(),
    has_child_permission: () => false,
    has_worker_permission: () => false,
    require_live_config: () => {},
    run_judge_readiness: async () => {
      configFactoryCalls += 1;
      return Object.freeze({
        resolved_model: SAFE_TEST_JUDGE_RESOLVED_MODEL,
        transport: readinessTransport
      });
    },
    create_engine: async ({ capture_sink, transport }) => {
      envMutatedAfterReadiness = true;
      process.env.SANDBOX_SECURITY_JUDGE_MODEL = "mutated-after-readiness";
      observedTransports.push(transport);
      assert.equal(transport, readinessTransport);
      const sink = capture_sink;
      sink.record(successInventory());
      sink.record(successPrewarm());
      return Object.freeze({
        async evaluate(request: {
          readonly submission: { readonly request_id: string };
        }) {
          sink.record(successLocalEvaluation());
          sink.record(successJudgeResponse(SAFE_TEST_JUDGE_RESOLVED_MODEL));
          return contentFreeDecision(request.submission.request_id, 0);
        }
      }) as SandboxSecurityEngine;
    }
  } as SandboxSecurityLiveCapturePorts);

  assert.equal(result.events.includes("judge_readiness"), true);
  assert.equal(result.events.includes("engine_created"), true);
  assert.equal(configFactoryCalls, 1);
  assert.equal(observedTransports.length, 1);
  assert.equal(observedTransports[0], readinessTransport);
  assert.equal(envMutatedAfterReadiness, true);
  const packageJson = JSON.parse(
    readFileSync(join(result.candidate_root, "package.json"), "utf8")
  ) as Record<string, unknown>;
  assert.equal(packageJson.provenance, "test_injected_v1");
});

test("REQ-SBX-GENERAL-002 production capture entry rejects unrestricted processes without native permission API", async () => {
  const root = tempRoot("ssb-native-permission-");
  const bundleRoot = join(root, "capture-bundle");
  const inputRoot = join(bundleRoot, "inputs");
  const captureOutputRoot = join(bundleRoot, "capture-output");
  mkdirSync(inputRoot, { recursive: true });
  mkdirSync(captureOutputRoot, { recursive: true });

  await assert.rejects(
    () =>
      runSandboxSecurityLiveCapture({
        bundle_root: bundleRoot,
        input_root: inputRoot,
        capture_output_root: captureOutputRoot,
        capture_output_binding: "0:0",
        inputs_tree_sha256: "a".repeat(64)
      }),
    /native_permission_required/
  );
});

interface MutableCaptureFsExports {
  openSync: typeof import("node:fs").openSync;
  readFileSync: typeof import("node:fs").readFileSync;
}

const mutableCaptureFs = createRequire(import.meta.url)(
  "node:fs"
) as MutableCaptureFsExports;

test("REQ-SBX-GENERAL-002 live capture opens every input envelope before Judge readiness", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const inputPrefix = `${ports.input_root}/`;
  let readinessStarted = false;
  const inputReadsBeforeReadiness = new Set<string>();
  const inputReadsAfterReadiness = new Set<string>();
  const recordInputAccess = (target: unknown): void => {
    if (typeof target !== "string" || !target.startsWith(inputPrefix)) return;
    if (readinessStarted) inputReadsAfterReadiness.add(target);
    else inputReadsBeforeReadiness.add(target);
  };

  const originalReadiness = ports.run_judge_readiness!;
  ports.run_judge_readiness = async (input) => {
    readinessStarted = true;
    return originalReadiness(input);
  };

  const originalOpenSync = mutableCaptureFs.openSync;
  const originalReadFileSync = mutableCaptureFs.readFileSync;
  mutableCaptureFs.openSync = ((...args: unknown[]) => {
    recordInputAccess(args[0]);
    return Reflect.apply(originalOpenSync, mutableCaptureFs, args) as number;
  }) as typeof originalOpenSync;
  mutableCaptureFs.readFileSync = ((...args: unknown[]) => {
    recordInputAccess(args[0]);
    return Reflect.apply(
      originalReadFileSync,
      mutableCaptureFs,
      args
    ) as Buffer;
  }) as typeof originalReadFileSync;
  syncBuiltinESMExports();
  let result;
  try {
    result = await runSandboxSecurityLiveCapture(ports);
  } finally {
    mutableCaptureFs.openSync = originalOpenSync;
    mutableCaptureFs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  }

  assert.equal(result.decision_count, 3);
  assert.equal(ports.readinessCalls, 1);
  assert.equal(inputReadsBeforeReadiness.size, 3);
  assert.equal(inputReadsAfterReadiness.size, 0);
});

test("REQ-SBX-GENERAL-002 live capture consumes only frozen envelope snapshots after path replacement", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const observedValues: string[] = [];
  const originalCreateEngine = ports.create_engine!;
  ports.create_engine = async (input) => {
    const engine = await originalCreateEngine(input);
    return {
      async evaluate(request, callerSignal) {
        const submission = (
          request as {
            submission: {
              content_items: ReadonlyArray<{ value: string }>;
            };
          }
        ).submission;
        observedValues.push(submission.content_items[0]!.value);
        return engine.evaluate(request, callerSignal);
      }
    };
  };

  const originalReadiness = ports.run_judge_readiness!;
  ports.run_judge_readiness = async (input) => {
    for (const fixtureId of ["ssb-v1-0001", "ssb-v1-0002"]) {
      const envelopePath = join(ports.input_root, `${fixtureId}.json`);
      const replacement = JSON.parse(
        readFileSync(envelopePath, "utf8")
      ) as {
        evaluation_request: {
          submission: { content_items: Array<{ value: string }> };
          authoritative_context: { sources: Array<{ value: string }> };
        };
      };
      replacement.evaluation_request.submission.content_items[0]!.value =
        `replaced ${fixtureId}`;
      replacement.evaluation_request.authoritative_context.sources[0]!.value =
        `replaced ${fixtureId}`;
      writeFileSync(envelopePath, `${JSON.stringify(replacement)}\n`);
    }
    unlinkSync(join(ports.input_root, "ssb-v1-0003.json"));
    return originalReadiness(input);
  };

  const result = await runSandboxSecurityLiveCapture(ports);

  assert.equal(result.decision_count, 3);
  assert.deepEqual(observedValues, [
    "fixture ssb-v1-0001",
    "fixture ssb-v1-0002",
    "fixture ssb-v1-0003"
  ]);
});
