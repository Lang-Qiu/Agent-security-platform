import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSandboxSecurityCaptureSink,
  SANDBOX_SECURITY_CAPTURE_INPUT_COUNT
} from "../../scripts/benchmark/sandbox-security/capture-sink.ts";
import {
  runSandboxSecurityLiveCapture,
  type SandboxSecurityLiveCapturePorts
} from "../../scripts/benchmark/sandbox-security/capture-live.ts";
import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts
} from "../../engines/sandbox/src/security/index.ts";
import type {
  SandboxSecurityCapturedProviderOutcome
} from "../../engines/sandbox/src/security-production/benchmark-composition.ts";
import type { SandboxSecurityDecision } from "../../shared/types/sandbox-security.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMITTED_INPUTS = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1/inputs"
);
const COMMITTED_INPUTS_TREE =
  "5b95a264e3fd4fb393e313a0dbdd3ea099af6257e9ef3a6e75790e0f6c659407";

const DIGEST =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
  readinessRetryAttempts?: { count: number };
  missingConfig?: boolean;
  hasChild?: boolean;
  hasWorker?: boolean;
  fixtureCount?: number;
  inputs_tree_sha256?: string;
  corruptHash?: boolean;
  skip_input_hash_check?: boolean;
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
      return;
    },
    create_engine: async ({ capture_sink }) => {
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
          return contentFreeDecision(request.submission.request_id, evaluateCalls - 1);
        }
      };
      return engine;
    },
    abort_signal: abortController?.signal,
    require_live_config: options.missingConfig
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

test("REQ-SBX-GENERAL-002 capture child performs non-benchmark Judge readiness first", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const result = await runSandboxSecurityLiveCapture(ports);
  assert.deepEqual(result.events.slice(0, 2), [
    "judge_readiness",
    "capture_child_started"
  ]);
  assert.equal(ports.readinessCalls, 1);
  assert.deepEqual(ports.readinessTimeouts, [4000]);
  assert.ok(result.events.indexOf("judge_readiness") < result.events.indexOf("capture_child_started"));
  assert.ok(result.events.indexOf("capture_child_started") < result.events.indexOf("engine_created"));
  assert.ok(result.events.indexOf("engine_created") < result.events.indexOf("inputs_complete"));
});

test("REQ-SBX-GENERAL-002 runner closes every input in finally", async () => {
  const ports = fakeLivePorts({ throwAtInput: 2, fixtureCount: 3 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports));
  assert.deepEqual(ports.sinkEvents, ["begin:1", "end:1", "begin:2", "end:2"]);
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

test("REQ-SBX-GENERAL-002 readiness budget is exactly 4000 ms with no retry", async () => {
  const ports = fakeLivePorts({ readinessFail: true, fixtureCount: 1 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports));
  assert.equal(ports.readinessCalls, 1);
  assert.deepEqual(ports.readinessTimeouts, [4000]);
  assert.equal(ports.evaluateCalls, 0);
  assert.ok(!ports.sinkEvents.some((event) => event.startsWith("begin:")));
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

test("REQ-SBX-GENERAL-002 candidate package is content-free and output-contained", async () => {
  const ports = fakeLivePorts({ fixtureCount: 2 });
  const result = await runSandboxSecurityLiveCapture(ports);
  const candidateRoot = join(ports.capture_output_root, "candidate");
  assert.equal(result.candidate_root, candidateRoot);
  const decisionsDir = join(candidateRoot, "decisions");
  assert.equal(readdirSync(decisionsDir).sort().join(","), "ssb-v1-0001.json,ssb-v1-0002.json");
  const cassette = JSON.parse(
    readFileSync(join(candidateRoot, "cassette.json"), "utf8")
  ) as { inputs: unknown[] };
  assert.equal(cassette.inputs.length, 2);
  const decisionText = readFileSync(join(decisionsDir, "ssb-v1-0001.json"), "utf8");
  assert.doesNotMatch(decisionText, /OPENAI_API_KEY|fixture text|primary_category|verdict_class/);
  assert.doesNotMatch(JSON.stringify(cassette), /OPENAI_API_KEY|primary_category|truth/);
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
  assert.doesNotMatch(result.stdout_summary, /primary_category|verdict_class|OPENAI_API_KEY/);
  assert.match(result.stdout_summary, /decision_count|candidate|capture_complete/);
});
