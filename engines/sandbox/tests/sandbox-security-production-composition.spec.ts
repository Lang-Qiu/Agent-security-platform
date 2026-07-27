import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type {
  RawLocalDetector,
  SandboxSecurityEngine,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityRuntimePorts,
  SandboxSecuritySanitizer,
  SanitizedExternalDetector
} from "../src/security/index.ts";
import {
  createSandboxSecurityDeterministicSanitizer
} from "../src/security-production/deterministic-sanitizer.ts";
import type { SandboxSecurityHttpTransport } from "../src/security-production/http-transport.ts";
import type {
  SandboxSecurityJudgeProtocolId
} from "../src/security-production/judge-protocol-adapter.ts";
import type {
  SandboxSecurityProductionConfig,
  SandboxSecurityProductionMode
} from "../src/security-production/production-config.ts";
import {
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING
} from "../src/security-production/p6-live-capture-profile.ts";

interface CompositionPorts {
  create_config(
    mode: SandboxSecurityProductionMode
  ): Readonly<SandboxSecurityProductionConfig>;
  create_transport(
    config: Readonly<SandboxSecurityProductionConfig>
  ): SandboxSecurityHttpTransport;
  create_local_detector(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
    qualification_timeout_ms: 1000 | 20000;
  }>): Promise<RawLocalDetector>;
  create_external_pipeline(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    judge_protocol_id: SandboxSecurityJudgeProtocolId;
    judge_requested_model: string;
  }>): Readonly<{
    sanitizer: SandboxSecuritySanitizer;
    judge: SanitizedExternalDetector;
  }>;
}

type CreateWithPorts = (
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>,
  ports: Readonly<CompositionPorts>
) => Promise<SandboxSecurityEngine>;

type CreateComposition = (
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>
) => Promise<SandboxSecurityEngine>;

type CreateLiveCaptureWithPorts = (
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
  }>,
  ports: Readonly<CompositionPorts>
) => Promise<SandboxSecurityEngine>;

let createWithPorts: CreateWithPorts = async () => {
  throw new Error("guarded-composition-placeholder");
};
let createComposition: CreateComposition = async () => {
  throw new Error("guarded-composition-placeholder");
};
let createLiveCaptureWithPorts: CreateLiveCaptureWithPorts | undefined;

try {
  const candidate = await import(
    "../src/security-production/composition.ts"
  );
  if (
    typeof candidate.createSandboxSecurityProductionCompositionWithPorts ===
    "function"
  ) {
    createWithPorts =
      candidate.createSandboxSecurityProductionCompositionWithPorts as CreateWithPorts;
  }
  if (
    typeof candidate.createSandboxSecurityProductionComposition === "function"
  ) {
    createComposition =
      candidate.createSandboxSecurityProductionComposition as CreateComposition;
  }
  if (
    typeof candidate.createSandboxSecurityProductionLiveCaptureCompositionWithPorts ===
    "function"
  ) {
    createLiveCaptureWithPorts =
      candidate.createSandboxSecurityProductionLiveCaptureCompositionWithPorts as CreateLiveCaptureWithPorts;
  }
} catch (error: unknown) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ERR_MODULE_NOT_FOUND"
  ) {
    throw error;
  }
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const RESPONSES_PROTOCOL_ID = "openai_responses_v1" as const;
const TRANSPORT: SandboxSecurityHttpTransport = Object.freeze({
  async request() {
    throw new Error("transport-must-not-run");
  }
});
const EMPTY_RESULT: SandboxSecurityRawDetectorResult = Object.freeze({
  candidates: [],
  clearances: []
});
const LOCAL: RawLocalDetector = Object.freeze({
  async detect() {
    return EMPTY_RESULT;
  }
});
const JUDGE: SanitizedExternalDetector = Object.freeze({
  async detect() {
    return Object.freeze({
      candidates: [],
      clearances: []
    });
  }
});
const SANITIZER: SandboxSecuritySanitizer = Object.freeze({
  async sanitize() {
    throw new Error("sanitizer-must-not-run");
  }
});

function config(mode: SandboxSecurityProductionMode) {
  return Object.freeze({
    mode,
    summary: Object.freeze({
      ollama_configured: mode !== "rule_only",
      judge_configured: mode === "local_and_judge",
      ...(mode === "rule_only" ? {} : { ollama_digest: DIGEST }),
      ...(mode === "local_and_judge"
        ? {
            judge_protocol_id: RESPONSES_PROTOCOL_ID,
            judge_endpoint_policy_id: "operator_https_fqdn_v1",
            judge_base_url: "https://doro.lol/v1",
            judge_endpoint_url: "https://doro.lol/v1/responses",
            judge_requested_model: "gpt-5.4-mini"
          }
        : {})
    })
  }) as Readonly<SandboxSecurityProductionConfig>;
}

function runtimeHarness() {
  const delays: number[] = [];
  const callbacks: Array<() => void> = [];
  let cancellationCount = 0;
  const runtime: SandboxSecurityRuntimePorts = {
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => "decision-composition-1",
    monotonicNowMs: () => 0,
    scheduleTimeout(delayMs, callback) {
      delays.push(delayMs);
      callbacks.push(callback);
      let cancelled = false;
      return () => {
        if (!cancelled) {
          cancelled = true;
          cancellationCount += 1;
        }
      };
    }
  };
  return {
    runtime,
    delays,
    callbacks,
    get cancellation_count() {
      return cancellationCount;
    }
  };
}

function portsHarness() {
  const calls: string[] = [];
  let localInput:
    | Readonly<{
        transport: SandboxSecurityHttpTransport;
        expected_digest: string;
        signal: AbortSignal;
        qualification_timeout_ms: 1000 | 20000;
      }>
    | undefined;
  let pipelineTransport: SandboxSecurityHttpTransport | undefined;
  let pipelineProtocolId: SandboxSecurityJudgeProtocolId | undefined;
  let pipelineRequestedModel: string | undefined;
  const ports: CompositionPorts = {
    create_config(mode) {
      calls.push(`config:${mode}`);
      return config(mode);
    },
    create_transport(input) {
      calls.push(`transport:${input.mode}`);
      return TRANSPORT;
    },
    async create_local_detector(input) {
      calls.push("local");
      localInput = input;
      return LOCAL;
    },
    create_external_pipeline(input) {
      calls.push("pipeline");
      pipelineTransport = input.transport;
      pipelineProtocolId = input.judge_protocol_id;
      pipelineRequestedModel = input.judge_requested_model;
      if (input.judge_protocol_id !== RESPONSES_PROTOCOL_ID) {
        throw new Error("unexpected-judge-protocol-id");
      }
      if (input.judge_requested_model !== "gpt-5.4-mini") {
        throw new Error("unexpected-judge-requested-model");
      }
      return Object.freeze({ sanitizer: SANITIZER, judge: JUDGE });
    }
  };
  return {
    ports,
    calls,
    get local_input() {
      return localInput;
    },
    get pipeline_transport() {
      return pipelineTransport;
    },
    get pipeline_protocol_id() {
      return pipelineProtocolId;
    },
    get pipeline_requested_model() {
      return pipelineRequestedModel;
    }
  };
}

function evaluationRequest(value = "ordinary benign request") {
  const content = {
    source_id: "user_1",
    claimed_source_type: "user_input" as const,
    media_type: "text/plain" as const,
    value,
    provenance_ref: "source://user_1"
  };
  return {
    submission: {
      schema_version: "sandbox-security-request.v1" as const,
      request_id: "request_composition_001",
      stage: "user_input" as const,
      policy_profile_id: "sandbox-security-balanced.v1" as const,
      content_items: [content]
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1" as const,
      evaluation_mode: "simulation" as const,
      stage: "user_input" as const,
      policy_profile_id: "sandbox-security-balanced.v1" as const,
      sources: [
        {
          source_id: content.source_id,
          authority_kind: "simulation_observation" as const,
          source_type: content.claimed_source_type,
          media_type: content.media_type,
          value: content.value,
          provenance_ref: content.provenance_ref
        }
      ]
    }
  };
}

test("REQ-SBX-GENERAL-002 rule_only composes without configuration or provider ports", async () => {
  const runtime = runtimeHarness();
  const harness = portsHarness();

  const engine = await createWithPorts(
    { runtime: runtime.runtime, mode: "rule_only" },
    harness.ports
  );

  assert.equal(typeof engine.evaluate, "function");
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(runtime.delays, []);
});

for (const mode of ["local", "local_and_judge"] as const) {
  test(`REQ-SBX-GENERAL-002 ${mode} uses one transport and a fixed qualification timer`, async () => {
    const runtime = runtimeHarness();
    const harness = portsHarness();

    const engine = await createWithPorts(
      { runtime: runtime.runtime, mode },
      harness.ports
    );

    assert.equal(typeof engine.evaluate, "function");
    assert.deepEqual(harness.calls, [
      `config:${mode}`,
      `transport:${mode}`,
      "local",
      ...(mode === "local_and_judge" ? ["pipeline"] : [])
    ]);
    assert.deepEqual(runtime.delays, [1000]);
    assert.equal(runtime.cancellation_count, 1);
    assert.equal(harness.local_input?.transport, TRANSPORT);
    assert.equal(harness.local_input?.expected_digest, DIGEST);
    assert.equal(harness.local_input?.qualification_timeout_ms, 1000);
    assert.equal(harness.local_input?.signal instanceof AbortSignal, true);
    assert.equal(harness.local_input?.signal.aborted, false);
    assert.equal(
      harness.pipeline_transport,
      mode === "local_and_judge" ? TRANSPORT : undefined
    );
    assert.equal(
      harness.pipeline_protocol_id,
      mode === "local_and_judge" ? RESPONSES_PROTOCOL_ID : undefined
    );
    assert.equal(
      harness.pipeline_requested_model,
      mode === "local_and_judge" ? "gpt-5.4-mini" : undefined
    );
  });
}

async function assertJudgeConfigRejectedBeforeProviderSetup(
  scenario: Readonly<{
    name: string;
    key: "judge_protocol_id" | "judge_requested_model";
    value: string | undefined;
  }>
): Promise<void> {
  const runtime = runtimeHarness();
  const harness = portsHarness();
  harness.ports.create_config = (mode) => {
    harness.calls.push(`config:${mode}`);
    const summary = {
      ...config("local_and_judge").summary
    } as Record<string, unknown>;
    if (scenario.value === undefined) delete summary[scenario.key];
    else summary[scenario.key] = scenario.value;
    return Object.freeze({
      mode: "local_and_judge" as const,
      summary: Object.freeze(summary)
    }) as Readonly<SandboxSecurityProductionConfig>;
  };

  await assert.rejects(
    createWithPorts(
      { runtime: runtime.runtime, mode: "local_and_judge" },
      harness.ports
    ),
    { name: "sandbox_security_production_composition_invalid" },
    scenario.name
  );
  assert.deepEqual(harness.calls, ["config:local_and_judge"], scenario.name);
  assert.deepEqual(runtime.delays, [], scenario.name);
}

test("REQ-SBX-GENERAL-002 local_and_judge requires config-selected protocol and model before provider setup", async () => {
  for (const scenario of [
    { name: "missing protocol", key: "judge_protocol_id", value: undefined },
    { name: "unknown protocol", key: "judge_protocol_id", value: "openai_auto" },
    { name: "missing model", key: "judge_requested_model", value: undefined }
  ] as const) {
    await assertJudgeConfigRejectedBeforeProviderSetup(scenario);
  }
});

for (const scenario of [
  { name: "leading-whitespace", value: " gpt-5.4-mini" },
  { name: "overlength", value: "a".repeat(129) }
] as const) {
  test(`REQ-SBX-GENERAL-002 local_and_judge rejects ${scenario.name} Judge model before provider setup`, async () => {
    await assertJudgeConfigRejectedBeforeProviderSetup({
      name: `${scenario.name} model`,
      key: "judge_requested_model",
      value: scenario.value
    });
  });
}

test("REQ-SBX-GENERAL-002 P6 live capture isolates the approved 20000 ms Ollama qualification policy", async () => {
  if (createLiveCaptureWithPorts === undefined) {
    assert.fail("missing P6-only live capture composition entrypoint");
  }
  const runtime = runtimeHarness();
  const harness = portsHarness();

  const engine = await createLiveCaptureWithPorts(
    { runtime: runtime.runtime },
    harness.ports
  );

  assert.equal(typeof engine.evaluate, "function");
  assert.deepEqual(runtime.delays, [
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms
  ]);
  assert.equal(
    harness.local_input?.qualification_timeout_ms,
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms
  );
  assert.deepEqual(harness.calls, [
    "config:local_and_judge",
    "transport:local_and_judge",
    "local",
    "pipeline"
  ]);

  await engine.evaluate(evaluationRequest());
  assert.deepEqual(runtime.delays, [
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms,
    100,
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.local_detector_slot_timeout_ms
  ]);
  assert.equal(runtime.cancellation_count, 3);
});

test("REQ-SBX-GENERAL-002 P6 live capture uses 40000 ms work budget and 20000 ms Judge slot only in live path", async () => {
  if (createLiveCaptureWithPorts === undefined) {
    assert.fail("missing P6-only live capture composition entrypoint");
  }
  const delays: number[] = [];
  let cancellationCount = 0;
  let monotonic = 0;
  const runtime: SandboxSecurityRuntimePorts = {
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => "decision-composition-p6-budget",
    monotonicNowMs: () => monotonic,
    scheduleTimeout(delayMs, _callback) {
      delays.push(delayMs);
      if (delayMs === 100) monotonic = 6000;
      let cancelled = false;
      return () => {
        if (!cancelled) {
          cancelled = true;
          cancellationCount += 1;
        }
      };
    }
  };
  const harness = portsHarness();
  let localEvaluations = 0;
  let judgeEvaluations = 0;
  harness.ports.create_local_detector = async () =>
    Object.freeze({
      async detect(
        snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
      ): Promise<SandboxSecurityRawDetectorResult> {
        localEvaluations += 1;
        const source = snapshot.contents[0]!;
        return {
          candidates: [
            {
              category: "prompt_injection",
              severity: "medium",
              confidence: 0.6,
              reason_code: "sandbox_security_prompt_injection",
              subject_refs: [
                {
                  kind: "content_source",
                  source_handle: source.source_handle,
                  locator: { kind: "whole_source" }
                }
              ]
            }
          ],
          clearances: []
        };
      }
    });
  harness.ports.create_external_pipeline = () =>
    Object.freeze({
      sanitizer: createSandboxSecurityDeterministicSanitizer(),
      judge: Object.freeze({
        async detect() {
          judgeEvaluations += 1;
          return { candidates: [], clearances: [] };
        }
      })
    });

  const engine = await createLiveCaptureWithPorts(
    { runtime },
    harness.ports
  );
  await engine.evaluate(evaluationRequest());

  assert.equal(localEvaluations, 1);
  assert.equal(judgeEvaluations, 1);
  assert.deepEqual(delays, [
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms,
    100,
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.local_detector_slot_timeout_ms,
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.judge_detector_slot_timeout_ms
  ]);
  assert.equal(cancellationCount, 4);
});

test("REQ-SBX-GENERAL-002 P6 work budget remains available one millisecond below the approved boundary", async () => {
  if (createLiveCaptureWithPorts === undefined) {
    assert.fail("missing P6-only live capture composition entrypoint");
  }
  let monotonicCalls = 0;
  let localEvaluations = 0;
  const runtime: SandboxSecurityRuntimePorts = {
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => "decision-composition-p6-entry-budget",
    monotonicNowMs: () => {
      monotonicCalls += 1;
      return monotonicCalls === 1
        ? 0
        : SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.normal_work_budget_ms - 1;
    },
    scheduleTimeout: () => () => {}
  };
  const harness = portsHarness();
  harness.ports.create_local_detector = async () =>
    Object.freeze({
      async detect(): Promise<SandboxSecurityRawDetectorResult> {
        localEvaluations += 1;
        return { candidates: [], clearances: [] };
      }
    });

  const engine = await createLiveCaptureWithPorts({ runtime }, harness.ports);
  await assert.doesNotReject(() => engine.evaluate(evaluationRequest()));
  assert.equal(localEvaluations, 1);
});

test("REQ-SBX-GENERAL-002 P6 work budget expires immediately above the approved boundary", async () => {
  if (createLiveCaptureWithPorts === undefined) {
    assert.fail("missing P6-only live capture composition entrypoint");
  }
  let monotonicCalls = 0;
  const runtime: SandboxSecurityRuntimePorts = {
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => "decision-composition-p6-budget-boundary",
    monotonicNowMs: () => {
      monotonicCalls += 1;
      return monotonicCalls === 1
        ? 0
        : SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.normal_work_budget_ms + 1;
    },
    scheduleTimeout: () => () => {}
  };
  const harness = portsHarness();
  const engine = await createLiveCaptureWithPorts({ runtime }, harness.ports);

  await assert.rejects(
    () => engine.evaluate(evaluationRequest()),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "sandbox_security_internal_invalid" &&
      error.message === "pre_id_evaluation_budget_exhausted"
  );
});

test("REQ-SBX-GENERAL-002 P6 live capture rejects caller-selected composition modes", async () => {
  if (createLiveCaptureWithPorts === undefined) {
    assert.fail("missing P6-only live capture composition entrypoint");
  }
  const runtime = runtimeHarness();
  const harness = portsHarness();

  await assert.rejects(
    createLiveCaptureWithPorts(
      { runtime: runtime.runtime, mode: "local" } as never,
      harness.ports
    ),
    { name: "sandbox_security_production_composition_invalid" }
  );
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(runtime.delays, []);
});

test("REQ-SBX-GENERAL-002 composed engines preserve selected slots and caller cancellation", async () => {
  for (const mode of ["rule_only", "local", "local_and_judge"] as const) {
    const runtime = runtimeHarness();
    const harness = portsHarness();
    let localEvaluations = 0;
    let judgeEvaluations = 0;
    harness.ports.create_local_detector = async () => {
      const detector: RawLocalDetector = Object.freeze({
        async detect(
          snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
        ): Promise<SandboxSecurityRawDetectorResult> {
          localEvaluations += 1;
          if (mode !== "local_and_judge") return EMPTY_RESULT;
          const source = snapshot.contents[0]!;
          return {
            candidates: [
              {
                category: "prompt_injection",
                severity: "medium",
                confidence: 0.6,
                reason_code: "sandbox_security_prompt_injection",
                subject_refs: [
                  {
                    kind: "content_source",
                    source_handle: source.source_handle,
                    locator: { kind: "whole_source" }
                  }
                ]
              }
            ],
            clearances: []
          };
        }
      });
      return detector;
    };
    harness.ports.create_external_pipeline = ({
      transport,
      judge_protocol_id,
      judge_requested_model
    }) => {
      assert.equal(judge_protocol_id, RESPONSES_PROTOCOL_ID);
      assert.equal(judge_requested_model, "gpt-5.4-mini");
      assert.equal(transport, TRANSPORT);
      return Object.freeze({
        sanitizer: createSandboxSecurityDeterministicSanitizer(),
        judge: Object.freeze({
          async detect() {
            judgeEvaluations += 1;
            return { candidates: [], clearances: [] };
          }
        })
      });
    };

    const engine = await createWithPorts(
      { runtime: runtime.runtime, mode },
      harness.ports
    );
    const decision = await engine.evaluate(evaluationRequest());
    const localRun = decision.detector_runs.find(
      (run) => run.detector_kind === "local_model"
    )!;
    const judgeRun = decision.detector_runs.find(
      (run) => run.detector_kind === "external_judge"
    )!;

    assert.equal(
      localEvaluations,
      mode === "rule_only" ? 0 : 1,
      `${mode} local slot selection`
    );
    assert.equal(
      localRun.status,
      mode === "rule_only"
        ? "skipped"
        : mode === "local"
          ? "no_match"
          : "matched"
    );
    assert.equal(judgeEvaluations, mode === "local_and_judge" ? 1 : 0);
    assert.equal(
      judgeRun.status,
      mode === "local_and_judge" ? "no_match" : "skipped"
    );

    const caller = new AbortController();
    caller.abort();
    await assert.rejects(
      engine.evaluate(evaluationRequest(), caller.signal),
      { name: "sandbox_security_cancelled" }
    );
  }
});

test("REQ-SBX-GENERAL-002 qualification timeout aborts the owned signal and propagates the failure", async () => {
  const runtime = runtimeHarness();
  const failure = new Error("qualification-timeout-sentinel");
  const harness = portsHarness();
  harness.ports.create_local_detector = async ({ signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(failure), { once: true });
    });

  const pending = createWithPorts(
    { runtime: runtime.runtime, mode: "local" },
    harness.ports
  );
  await Promise.resolve();
  assert.deepEqual(runtime.delays, [1000]);
  runtime.callbacks[0]!();

  await assert.rejects(pending, (error: unknown) => error === failure);
  assert.equal(runtime.cancellation_count, 1);
});

test("REQ-SBX-GENERAL-002 qualification and pipeline failures propagate with no fallback", async () => {
  for (const phase of ["local", "pipeline"] as const) {
    const runtime = runtimeHarness();
    const harness = portsHarness();
    const failure = new Error(`${phase}-failure-sentinel`);
    if (phase === "local") {
      harness.ports.create_local_detector = async () => {
        throw failure;
      };
    } else {
      harness.ports.create_external_pipeline = () => {
        throw failure;
      };
    }

    await assert.rejects(
      createWithPorts(
        {
          runtime: runtime.runtime,
          mode: phase === "local" ? "local" : "local_and_judge"
        },
        harness.ports
      ),
      (error: unknown) => error === failure
    );
    assert.equal(runtime.cancellation_count, 1);
  }
});

test("REQ-SBX-GENERAL-002 timer cleanup cannot replace a qualification outcome", async () => {
  for (const outcome of ["failure", "success"] as const) {
    const runtime = runtimeHarness();
    const harness = portsHarness();
    const qualificationFailure = new Error("original-qualification-failure");
    let cleanupAttempts = 0;
    runtime.runtime.scheduleTimeout = () => () => {
      cleanupAttempts += 1;
      throw new Error("cleanup-mask-sentinel");
    };
    harness.ports.create_local_detector = async () => {
      if (outcome === "failure") throw qualificationFailure;
      return LOCAL;
    };

    const composition = createWithPorts(
      { runtime: runtime.runtime, mode: "local" },
      harness.ports
    );
    if (outcome === "failure") {
      await assert.rejects(
        composition,
        (error: unknown) => error === qualificationFailure
      );
    } else {
      assert.equal(typeof (await composition).evaluate, "function");
    }
    assert.equal(cleanupAttempts, 1);
  }
});

test("REQ-SBX-GENERAL-002 public local composition surfaces missing production configuration", async () => {
  const runtime = runtimeHarness();
  const keys = [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE"
  ] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) delete process.env[key];
  try {
    await assert.rejects(
      createComposition({ runtime: runtime.runtime, mode: "local" }),
      { name: "sandbox_security_production_config_invalid" }
    );
    assert.deepEqual(runtime.delays, []);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("REQ-SBX-GENERAL-002 public local_and_judge rejects missing key and disabled Judge before transport", async () => {
  const keys = [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE"
  ] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  const invalidJudgeValues = [
    { key: undefined, enabled: "1" },
    { key: "", enabled: "1" },
    { key: "judge-key-sentinel", enabled: undefined },
    { key: "judge-key-sentinel", enabled: "0" },
    { key: "judge-key-sentinel", enabled: "true" }
  ] as const;
  try {
    for (const invalid of invalidJudgeValues) {
      process.env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST = DIGEST;
      process.env.SANDBOX_SECURITY_JUDGE_PROTOCOL = RESPONSES_PROTOCOL_ID;
      process.env.SANDBOX_SECURITY_JUDGE_BASE_URL = "https://doro.lol/v1";
      process.env.SANDBOX_SECURITY_JUDGE_MODEL = "gpt-5.4-mini";
      if (invalid.key === undefined) delete process.env.SANDBOX_SECURITY_JUDGE_API_KEY;
      else process.env.SANDBOX_SECURITY_JUDGE_API_KEY = invalid.key;
      if (invalid.enabled === undefined) {
        delete process.env.SANDBOX_SECURITY_ENABLE_JUDGE;
      } else {
        process.env.SANDBOX_SECURITY_ENABLE_JUDGE = invalid.enabled;
      }
      const runtime = runtimeHarness();
      await assert.rejects(
        createComposition({
          runtime: runtime.runtime,
          mode: "local_and_judge"
        }),
        { name: "sandbox_security_production_config_invalid" }
      );
      assert.deepEqual(runtime.delays, []);
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("REQ-SBX-GENERAL-002 composition snapshots validated runtime methods before provider effects", async () => {
  const runtime = runtimeHarness();
  const harness = portsHarness();
  let runtimeGets = 0;
  const runtimeProxy = new Proxy(runtime.runtime, {
    get() {
      runtimeGets += 1;
      throw new Error("runtime-get-sentinel");
    }
  });

  const engine = await createWithPorts(
    { runtime: runtimeProxy, mode: "local" },
    harness.ports
  );

  assert.equal(typeof engine.evaluate, "function");
  assert.equal(runtimeGets, 0);
  assert.deepEqual(harness.calls, ["config:local", "transport:local", "local"]);
  assert.equal(runtime.cancellation_count, 1);
});

test("REQ-SBX-GENERAL-002 hostile input runtime and port records fail before provider effects", async () => {
  let getterCalls = 0;
  const transforms: readonly Readonly<{
    name: string;
    apply(base: Record<PropertyKey, unknown>, key: string): unknown;
  }>[] = [
    {
      name: "accessor",
      apply(base, key) {
        const candidate = { ...base };
        const value = Object.getOwnPropertyDescriptor(base, key)!.value;
        Object.defineProperty(candidate, key, {
          enumerable: true,
          get() {
            getterCalls += 1;
            return value;
          }
        });
        return candidate;
      }
    },
    {
      name: "inherited-prototype",
      apply(base) {
        return Object.assign(Object.create({ inherited: true }), base);
      }
    },
    {
      name: "non-enumerable",
      apply(base, key) {
        const candidate = { ...base };
        Object.defineProperty(candidate, key, {
          value: Object.getOwnPropertyDescriptor(base, key)!.value,
          enumerable: false
        });
        return candidate;
      }
    },
    {
      name: "symbol-key",
      apply(base) {
        return { ...base, [Symbol("hostile")]: true };
      }
    },
    {
      name: "revoked-proxy",
      apply(base) {
        const revocable = Proxy.revocable(base, {});
        revocable.revoke();
        return revocable.proxy;
      }
    },
    {
      name: "throwing-ownKeys",
      apply(base) {
        return new Proxy(base, {
          ownKeys() {
            throw new Error("own-keys-sentinel");
          }
        });
      }
    },
    {
      name: "throwing-descriptor",
      apply(base) {
        return new Proxy(base, {
          getOwnPropertyDescriptor() {
            throw new Error("descriptor-sentinel");
          }
        });
      }
    }
  ];
  const boundaries = [
    { name: "input", key: "mode" },
    { name: "runtime", key: "scheduleTimeout" },
    { name: "ports", key: "create_config" }
  ] as const;

  for (const boundary of boundaries) {
    for (const transform of transforms) {
      const runtime = runtimeHarness();
      const harness = portsHarness();
      const validInput = {
        runtime: runtime.runtime,
        mode: "local" as const
      };
      let input: unknown = validInput;
      let ports: unknown = harness.ports;
      if (boundary.name === "input") {
        input = transform.apply(
          validInput as unknown as Record<PropertyKey, unknown>,
          boundary.key
        );
      } else if (boundary.name === "runtime") {
        input = {
          ...validInput,
          runtime: transform.apply(
            runtime.runtime as unknown as Record<PropertyKey, unknown>,
            boundary.key
          )
        };
      } else {
        ports = transform.apply(
          harness.ports as unknown as Record<PropertyKey, unknown>,
          boundary.key
        );
      }

      await assert.rejects(
        createWithPorts(
          input as Parameters<CreateWithPorts>[0],
          ports as CompositionPorts
        ),
        { name: "sandbox_security_production_composition_invalid" },
        `${boundary.name}/${transform.name}`
      );
      assert.deepEqual(harness.calls, [], `${boundary.name}/${transform.name}`);
      assert.deepEqual(runtime.delays, [], `${boundary.name}/${transform.name}`);
    }
  }
  assert.equal(getterCalls, 0);
});

test("REQ-SBX-GENERAL-002 composition rejects invalid modes inputs and port bags before effects", async () => {
  const invalidInputs: unknown[] = [
    null,
    {},
    { runtime: runtimeHarness().runtime },
    { runtime: runtimeHarness().runtime, mode: "unknown" },
    { runtime: runtimeHarness().runtime, mode: "rule_only", transport: TRANSPORT },
    { runtime: runtimeHarness().runtime, mode: "rule_only", endpoint: "sentinel" },
    { runtime: runtimeHarness().runtime, mode: "rule_only", environment: {} },
    { runtime: runtimeHarness().runtime, mode: "rule_only", credential: "sentinel" },
    {
      runtime: runtimeHarness().runtime,
      mode: "local_and_judge",
      judge_protocol_id: "openai_chat_completions_json_v1"
    },
    {
      runtime: runtimeHarness().runtime,
      mode: "local_and_judge",
      judge_requested_model: "gpt-5.4-mini"
    }
  ];
  for (const input of invalidInputs) {
    const harness = portsHarness();
    await assert.rejects(
      createWithPorts(input as Parameters<CreateWithPorts>[0], harness.ports),
      { name: "sandbox_security_production_composition_invalid" }
    );
    assert.deepEqual(harness.calls, []);
  }

  const runtime = runtimeHarness();
  const harness = portsHarness();
  await assert.rejects(
    createWithPorts(
      { runtime: runtime.runtime, mode: "rule_only" },
      { ...harness.ports, extra: true } as CompositionPorts
    ),
    { name: "sandbox_security_production_composition_invalid" }
  );
  assert.deepEqual(harness.calls, []);
});

test("REQ-SBX-GENERAL-002 composition contains no provider override or duplicated policy path", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../src/security-production/composition.ts", import.meta.url)
    ),
    "utf8"
  );

  assert.doesNotMatch(source, /endpoint|base_url|fetch|process\.env/);
  assert.doesNotMatch(
    source,
    /process\.getBuiltinModule|\bimport\s*\(|\beval\s*\(|\bFunction\b/
  );
  assert.doesNotMatch(
    source,
    /credential|environment|benchmark|ground_truth|resolveSandboxSecurityProfile|reduceSandboxSecurityPolicy/
  );

  const wrapperStart = source.indexOf("async function createDefaultLocalDetector");
  const wrapperEnd = source.indexOf("const DEFAULT_PORTS", wrapperStart);
  const wrapper = source.slice(wrapperStart, wrapperEnd);
  const qualify = wrapper.indexOf("await qualifySandboxSecurityOllama(");
  const consume = wrapper.indexOf("createSandboxSecurityOllamaLocalDetector");
  assert.ok(wrapperStart > 0 && wrapperEnd > wrapperStart);
  assert.ok(qualify > 0 && consume > qualify);
  assert.match(wrapper, /transport:\s*input\.transport,\s*qualification/);
  assert.match(wrapper, /input\.qualification_timeout_ms/);
});

test("REQ-SBX-GENERAL-002 P6 composition uses a dedicated Engine factory path", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("../src/security-production/composition.ts", import.meta.url)
    ),
    "utf8"
  );

  assert.doesNotMatch(source, /profileResolver\?:/u);
  assert.match(
    source,
    /createSandboxSecurityP6LiveCaptureEngine\(\{[\s\S]*?runtime:\s*input\.runtime/u
  );
  assert.doesNotMatch(
    source,
    /createSandboxSecurityEngineWithPolicyProfileResolver|profileResolver:/u
  );
  assert.match(
    source,
    /function createSandboxSecurityOrdinaryProductionEngine/u
  );
});
