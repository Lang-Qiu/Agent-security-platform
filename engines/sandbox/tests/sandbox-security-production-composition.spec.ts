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
  SandboxSecurityProductionConfig,
  SandboxSecurityProductionMode
} from "../src/security-production/production-config.ts";

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
  }>): Promise<RawLocalDetector>;
  create_external_pipeline(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
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

let createWithPorts: CreateWithPorts = async () => {
  throw new Error("guarded-composition-placeholder");
};
let createComposition: CreateComposition = async () => {
  throw new Error("guarded-composition-placeholder");
};

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
            judge_provider_id: "doro",
            judge_base_url: "https://doro.lol/v1",
            judge_responses_url: "https://doro.lol/v1/responses",
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
      }>
    | undefined;
  let pipelineTransport: SandboxSecurityHttpTransport | undefined;
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
    assert.equal(harness.local_input?.signal instanceof AbortSignal, true);
    assert.equal(harness.local_input?.signal.aborted, false);
    assert.equal(
      harness.pipeline_transport,
      mode === "local_and_judge" ? TRANSPORT : undefined
    );
  });
}

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
    harness.ports.create_external_pipeline = ({ transport, judge_requested_model }) => {
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
    { runtime: runtimeHarness().runtime, mode: "rule_only", credential: "sentinel" }
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
  const qualify = wrapper.indexOf("await qualifySandboxSecurityOllama(input)");
  const consume = wrapper.indexOf("createSandboxSecurityOllamaLocalDetector");
  assert.ok(wrapperStart > 0 && wrapperEnd > wrapperStart);
  assert.ok(qualify > 0 && consume > qualify);
  assert.match(wrapper, /transport:\s*input\.transport,\s*qualification/);
});
