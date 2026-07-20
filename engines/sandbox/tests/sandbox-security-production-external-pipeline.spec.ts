import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  createSandboxSecurityDetectorRegistry,
  createSandboxSecurityEngine,
  type RawLocalDetector,
  type SandboxSecurityRawDetectorSnapshot,
  type SandboxSecurityRuntimePorts,
  type SandboxSecuritySanitizer,
  type SanitizedExternalDetector
} from "../src/security/index.ts";
import {
  normalizeSandboxSecurityRequest,
  type SandboxDetectorRun
} from "../../../shared/index.ts";
import {
  createSandboxSecurityDeterministicSanitizer
} from "../src/security-production/deterministic-sanitizer.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport
} from "../src/security-production/http-transport.ts";

const pipelinePath = new URL(
  "../src/security-production/external-pipeline.ts",
  import.meta.url
);

interface ExternalPipelineModule {
  createSandboxSecurityExternalPipeline(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
  }>): Readonly<{
    sanitizer: SandboxSecuritySanitizer;
    judge: SanitizedExternalDetector;
  }>;
}

// Keep the initial RED behavioral while the production seam is absent.
const inertPipelineModule: ExternalPipelineModule = {
  createSandboxSecurityExternalPipeline() {
    return Object.freeze({
      sanitizer: createSandboxSecurityDeterministicSanitizer(),
      judge: Object.freeze({
        async detect() {
          return Object.freeze({ candidates: [], clearances: [] });
        }
      })
    });
  }
};

const pipelineModule: ExternalPipelineModule = existsSync(pipelinePath)
  ? ((await import("../src/security-production/external-pipeline.ts")) as ExternalPipelineModule)
  : inertPipelineModule;
const { createSandboxSecurityExternalPipeline } = pipelineModule;

const DECISION_ID = "dec-production-pipeline-1";
const PROVIDER_SENTINEL = "RAW_PROVIDER_PIPELINE_PROSE_MUST_NOT_LEAK";
const PAYLOAD_SENTINEL = "SANITIZED_PIPELINE_CONTENT_MUST_NOT_LEAK";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });

function evaluationRequest(
  value = PAYLOAD_SENTINEL,
  requestId = "request_pipeline_001"
) {
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
      request_id: requestId,
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

function runtimeHarness(): Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  advance(ms: number): void;
  fireDue(): void;
  readonly active_timer_count: number;
}> {
  let nowMs = 0;
  let decisionOrdinal = 0;
  const timers: Array<{
    due: number;
    callback: () => void;
    cancelled: boolean;
  }> = [];
  const runtime: SandboxSecurityRuntimePorts = {
    now() {
      return new Date(1_700_000_000_000 + nowMs).toISOString();
    },
    nextDecisionId() {
      decisionOrdinal += 1;
      return `${DECISION_ID}-${decisionOrdinal}`;
    },
    monotonicNowMs() {
      return nowMs;
    },
    scheduleTimeout(delayMs, callback) {
      const timer = {
        due: nowMs + Math.max(0, delayMs),
        callback,
        cancelled: false
      };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    }
  };
  return Object.freeze({
    runtime,
    advance(ms: number) {
      nowMs += ms;
    },
    fireDue() {
      for (const timer of timers) {
        if (!timer.cancelled && timer.due <= nowMs) {
          timer.cancelled = true;
          timer.callback();
        }
      }
    },
    get active_timer_count() {
      return timers.filter((timer) => !timer.cancelled).length;
    }
  });
}

function ruleDetector(input: Readonly<{
  categories?: readonly ("prompt_injection" | "tool_hijacking")[];
  shortCircuit?: boolean;
  categoryFromValue?: boolean;
}> = {}): RawLocalDetector {
  const categories = input.categories ?? ["prompt_injection"];
  return Object.freeze({
    async detect(snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>) {
      const source = snapshot.contents[0];
      assert.notEqual(source, undefined);
      const selectedCategories = input.categoryFromValue &&
          source!.value === "second evaluation content"
        ? ["tool_hijacking" as const]
        : categories;
      return {
        candidates: selectedCategories.map((category) => ({
          category,
          severity: input.shortCircuit ? "critical" as const : "medium" as const,
          confidence: input.shortCircuit ? 1 : 0.6,
          reason_code: `sandbox_security_${category}` as const,
          subject_refs: [
            {
              kind: "content_source" as const,
              source_handle: source!.source_handle,
              locator: { kind: "whole_source" as const }
            }
          ]
        })),
        clearances: []
      };
    }
  });
}

type ParsedJudgePayload = Readonly<{
  routed_obligations: readonly Readonly<{
    obligation_id: string;
    category: string;
  }>[];
}>;

function judgePayloadFromRequest(
  input: Readonly<SandboxSecurityHttpRequest>
): ParsedJudgePayload {
  assert.equal(input.provider, "openai");
  assert.equal(input.operation, "responses");
  if (!("body" in input)) throw new Error("missing_body");
  const request = JSON.parse(DECODER.decode(input.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  const userText = request.input[1]?.content[0]?.text;
  assert.equal(typeof userText, "string");
  const prefix = "BEGIN_SANITIZED_PAYLOAD\n";
  const suffix = "\nEND_SANITIZED_PAYLOAD";
  assert.equal(userText!.startsWith(prefix), true);
  assert.equal(userText!.endsWith(suffix), true);
  return JSON.parse(
    userText!.slice(prefix.length, -suffix.length)
  ) as ParsedJudgePayload;
}

function judgeResponse(
  results: readonly Readonly<Record<string, unknown>>[],
  includeSentinel = false
): Readonly<SandboxSecurityHttpResponse> {
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body: ENCODER.encode(JSON.stringify({
      model: "gpt-5.6-terra",
      status: "completed",
      error: null,
      incomplete_details: null,
      ...(includeSentinel ? { id: PROVIDER_SENTINEL } : {}),
      output: [
        ...(includeSentinel
          ? [{ type: "reasoning", id: PROVIDER_SENTINEL, summary: [] }]
          : []),
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                schema_version: "sandbox-security-judge.v1",
                obligation_results: results
              })
            }
          ]
        }
      ]
    }))
  });
}

function transportHarness(
  handler: (
    input: Readonly<SandboxSecurityHttpRequest>
  ) => Promise<Readonly<SandboxSecurityHttpResponse>> | Readonly<SandboxSecurityHttpResponse>
): Readonly<{
  transport: SandboxSecurityHttpTransport;
  readonly call_count: number;
}> {
  let callCount = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      callCount += 1;
      return handler(input);
    }
  });
  return Object.freeze({
    transport,
    get call_count() {
      return callCount;
    }
  });
}

function engineWithPipeline(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  rule?: RawLocalDetector;
  runtime?: SandboxSecurityRuntimePorts;
}>) {
  const pipeline = createSandboxSecurityExternalPipeline({
    transport: input.transport
  });
  const engine = createSandboxSecurityEngine({
    registry: createSandboxSecurityDetectorRegistry({
      rule: input.rule ?? ruleDetector(),
      judge: pipeline.judge
    }),
    sanitizer: pipeline.sanitizer,
    runtime: input.runtime ?? runtimeHarness().runtime
  });
  return { engine, pipeline };
}

function judgeRun(
  decision: Readonly<{ detector_runs: readonly SandboxDetectorRun[] }>
): SandboxDetectorRun {
  const run = decision.detector_runs.find((item) =>
    String(item.detector_id).includes("/judge/")
  );
  assert.notEqual(run, undefined);
  return run!;
}

async function waitForCall(callCount: () => number): Promise<void> {
  for (let attempt = 0; attempt < 100 && callCount() === 0; attempt += 1) {
    await Promise.resolve();
  }
  assert.equal(callCount(), 1);
}

test("REQ-SBX-GENERAL-002 external pipeline pairs real sanitizer and Judge through Engine", async () => {
  const harness = transportHarness((request) => {
    const payload = judgePayloadFromRequest(request);
    const obligation = payload.routed_obligations[0]!;
    return judgeResponse([
      {
        obligation_id: obligation.obligation_id,
        outcome: "risk",
        confidence: "confident",
        severity: "high"
      }
    ], true);
  });
  const { engine, pipeline } = engineWithPipeline({
    transport: harness.transport,
    rule: ruleDetector({ categoryFromValue: true })
  });

  const decision = await engine.evaluate(evaluationRequest());

  assert.equal(harness.call_count, 1);
  assert.equal(Object.isFrozen(pipeline), true);
  assert.equal(Object.isFrozen(pipeline.sanitizer), true);
  assert.equal(Object.isFrozen(pipeline.judge), true);
  assert.equal(decision.verdict, "risk_detected");
  assert.equal(decision.findings.length, 1);
  assert.equal(decision.findings[0]!.category, "prompt_injection");
  assert.equal(judgeRun(decision).status, "matched");
  const serialized = JSON.stringify(decision);
  assert.equal(serialized.includes(PROVIDER_SENTINEL), false);
  assert.equal(serialized.includes(PAYLOAD_SENTINEL), false);

  const nextDecision = await engine.evaluate(
    evaluationRequest("second evaluation content", "request_pipeline_002")
  );
  assert.equal(harness.call_count, 2);
  assert.notEqual(nextDecision.decision_id, decision.decision_id);
  assert.equal(nextDecision.findings.length, 1);
  assert.equal(nextDecision.request_id, "request_pipeline_002");
  assert.equal(nextDecision.findings[0]!.category, "tool_hijacking");
  assert.notStrictEqual(nextDecision, decision);
});

test("REQ-SBX-GENERAL-002 external pipeline preserves partial Judge coverage", async () => {
  const harness = transportHarness((request) => {
    const payload = judgePayloadFromRequest(request);
    const first = payload.routed_obligations[0]!;
    return judgeResponse([
      {
        obligation_id: first.obligation_id,
        outcome: "risk",
        confidence: "probable",
        severity: "medium"
      }
    ]);
  });
  const { engine } = engineWithPipeline({
    transport: harness.transport,
    rule: ruleDetector({ categories: ["prompt_injection", "tool_hijacking"] })
  });

  const decision = await engine.evaluate(evaluationRequest("ordinary content"));

  assert.equal(harness.call_count, 1);
  assert.deepEqual(decision.findings.map((item) => item.category), [
    "prompt_injection"
  ]);
  assert.equal(judgeRun(decision).status, "matched");
});

test("REQ-SBX-GENERAL-002 real sanitizer unsafe URL failure makes zero Judge calls", async () => {
  const unsafe = "https://example.com/a\\b";
  const request = evaluationRequest(unsafe);
  assert.doesNotThrow(() => normalizeSandboxSecurityRequest(request.submission));
  const harness = transportHarness(() => judgeResponse([]));
  const { engine } = engineWithPipeline({ transport: harness.transport });

  const decision = await engine.evaluate(request);

  assert.equal(harness.call_count, 0);
  const run = judgeRun(decision);
  assert.equal(run.status, "failed");
  if (run.status === "failed") {
    assert.equal(run.error_code, "external_redaction_failed");
  }
});

test("REQ-SBX-GENERAL-002 frozen core rejects malformed sanitizer output before Judge", async () => {
  const harness = transportHarness(() => judgeResponse([]));
  const pipeline = createSandboxSecurityExternalPipeline({
    transport: harness.transport
  });
  const engine = createSandboxSecurityEngine({
    registry: createSandboxSecurityDetectorRegistry({
      rule: ruleDetector(),
      judge: pipeline.judge
    }),
    sanitizer: Object.freeze({
      async sanitize() {
        return Object.freeze({
          schema_version: "sandbox-security-sanitized-judge.v1",
          request_token: "invalid-free-token",
          stage: "user_input",
          policy_profile_id: "sandbox-security-balanced.v1",
          sources: [],
          routed_obligations: []
        }) as never;
      }
    }),
    runtime: runtimeHarness().runtime
  });

  const decision = await engine.evaluate(evaluationRequest("ordinary content"));

  assert.equal(harness.call_count, 0);
  const run = judgeRun(decision);
  assert.equal(run.status, "failed");
  if (run.status === "failed") {
    assert.equal(run.error_code, "external_redaction_failed");
  }
});

test("REQ-SBX-GENERAL-002 qualifying rule short circuit makes zero Judge calls", async () => {
  const harness = transportHarness(() => judgeResponse([]));
  const { engine } = engineWithPipeline({
    transport: harness.transport,
    rule: ruleDetector({ shortCircuit: true })
  });

  const decision = await engine.evaluate(evaluationRequest("ordinary content"));

  assert.equal(harness.call_count, 0);
  const run = judgeRun(decision);
  assert.equal(run.status, "skipped");
  if (run.status === "skipped") {
    assert.equal(run.skip_reason, "risk_short_circuit");
  }
});

test("REQ-SBX-GENERAL-002 Judge transport failure records safe failed run", async () => {
  const failure = new Error(PROVIDER_SENTINEL);
  const harness = transportHarness(() => {
    throw failure;
  });
  const { engine } = engineWithPipeline({ transport: harness.transport });

  const decision = await engine.evaluate(evaluationRequest("ordinary content"));

  assert.equal(harness.call_count, 1);
  const run = judgeRun(decision);
  assert.equal(run.status, "failed");
  if (run.status === "failed") assert.equal(run.error_code, "detector_failed");
  assert.equal(JSON.stringify(decision).includes(PROVIDER_SENTINEL), false);
});

test("REQ-SBX-GENERAL-002 caller abort during Judge rejects without provider prose", async () => {
  const caller = new AbortController();
  const clock = runtimeHarness();
  const listeners = { count: 0 };
  const harness = transportHarness((request) =>
    new Promise<Readonly<SandboxSecurityHttpResponse>>((_resolve, reject) => {
      listeners.count += 1;
      const onAbort = () => {
        request.signal.removeEventListener("abort", onAbort);
        listeners.count -= 1;
        reject(new Error(PROVIDER_SENTINEL));
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    })
  );
  const { engine } = engineWithPipeline({
    transport: harness.transport,
    runtime: clock.runtime
  });

  const pending = engine.evaluate(
    evaluationRequest("ordinary content"),
    caller.signal
  );
  await waitForCall(() => harness.call_count);
  caller.abort(new Error(PROVIDER_SENTINEL));
  await assert.rejects(
    () => pending,
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.equal((error as Error).name, "sandbox_security_cancelled");
      assert.equal(String(error).includes(PROVIDER_SENTINEL), false);
      return true;
    }
  );
  assert.equal(harness.call_count, 1);
  assert.equal(listeners.count, 0);
  assert.equal(clock.active_timer_count, 0);
});

test("REQ-SBX-GENERAL-002 Judge slot timeout terminates the real pipeline call", async () => {
  const clock = runtimeHarness();
  const listeners = { count: 0 };
  const harness = transportHarness((request) =>
    new Promise<Readonly<SandboxSecurityHttpResponse>>((_resolve, reject) => {
      listeners.count += 1;
      const onAbort = () => {
        request.signal.removeEventListener("abort", onAbort);
        listeners.count -= 1;
        reject(new Error("transport_terminated"));
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    })
  );
  const { engine } = engineWithPipeline({
    transport: harness.transport,
    runtime: clock.runtime
  });

  const pending = engine.evaluate(evaluationRequest("ordinary content"));
  await waitForCall(() => harness.call_count);
  clock.advance(4_000);
  clock.fireDue();
  const decision = await pending;

  assert.equal(harness.call_count, 1);
  assert.equal(judgeRun(decision).status, "timeout");
  assert.equal(listeners.count, 0);
  assert.equal(clock.active_timer_count, 0);
});

test("REQ-SBX-GENERAL-002 local timeout cleans its lease before Judge pipeline runs", async () => {
  const clock = runtimeHarness();
  const local = { calls: 0, listeners: 0 };
  const localDetector: RawLocalDetector = Object.freeze({
    async detect(
      _snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
      signal: AbortSignal
    ) {
      local.calls += 1;
      return new Promise<never>((_resolve, reject) => {
        local.listeners += 1;
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          local.listeners -= 1;
          reject(new Error("local_terminated"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
  });
  const harness = transportHarness((request) => {
    const payload = judgePayloadFromRequest(request);
    return judgeResponse([
      {
        obligation_id: payload.routed_obligations[0]!.obligation_id,
        outcome: "risk",
        confidence: "confident",
        severity: "high"
      }
    ]);
  });
  const pipeline = createSandboxSecurityExternalPipeline({
    transport: harness.transport
  });
  const engine = createSandboxSecurityEngine({
    registry: createSandboxSecurityDetectorRegistry({
      rule: ruleDetector(),
      local: localDetector,
      judge: pipeline.judge
    }),
    sanitizer: pipeline.sanitizer,
    runtime: clock.runtime
  });

  const pending = engine.evaluate(evaluationRequest("ordinary content"));
  await waitForCall(() => local.calls);
  clock.advance(1_000);
  clock.fireDue();
  const decision = await pending;

  const localRun = decision.detector_runs.find((run) =>
    String(run.detector_id).includes("/local/")
  );
  assert.notEqual(localRun, undefined);
  assert.equal(localRun!.status, "timeout");
  assert.equal(local.listeners, 0);
  assert.equal(harness.call_count, 1);
  assert.equal(judgeRun(decision).status, "matched");
  assert.equal(clock.active_timer_count, 0);
});

test("REQ-SBX-GENERAL-002 external pipeline rejects open injection and direct capabilities", () => {
  const harness = transportHarness(() => judgeResponse([]));
  let getterCalls = 0;
  const accessor = {} as Record<string, unknown>;
  Object.defineProperty(accessor, "transport", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(PROVIDER_SENTINEL);
    }
  });
  const accessorTransport = {} as Record<string, unknown>;
  Object.defineProperty(accessorTransport, "request", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(PROVIDER_SENTINEL);
    }
  });
  const nonenumerable = {} as Record<string, unknown>;
  Object.defineProperty(nonenumerable, "transport", {
    enumerable: false,
    value: harness.transport
  });
  const symbolInput = {
    transport: harness.transport,
    [Symbol("unknown")]: true
  };
  const throwingProxy = new Proxy({}, {
    getPrototypeOf() {
      throw new Error(PROVIDER_SENTINEL);
    }
  });
  let proxyTrapCalls = 0;
  const ownKeysProxy = new Proxy(
    { transport: harness.transport },
    {
      ownKeys() {
        proxyTrapCalls += 1;
        throw new Error(PROVIDER_SENTINEL);
      }
    }
  );
  const descriptorProxy = new Proxy(
    { transport: harness.transport },
    {
      getOwnPropertyDescriptor() {
        proxyTrapCalls += 1;
        throw new Error(PROVIDER_SENTINEL);
      }
    }
  );
  for (const input of [
    undefined,
    null,
    false,
    1,
    "invalid",
    Symbol("invalid"),
    () => harness.transport,
    [],
    {},
    Object.create(null),
    { transport: harness.transport, unknown: true },
    Object.create({ transport: harness.transport }),
    accessor,
    nonenumerable,
    symbolInput,
    throwingProxy,
    ownKeysProxy,
    descriptorProxy,
    { transport: {} },
    { transport: [] },
    { transport: accessorTransport },
    { transport: Object.freeze({ request: "not-a-function" }) }
  ]) {
    assert.throws(
      () => createSandboxSecurityExternalPipeline(input as never),
      (error: unknown) => {
        assert.equal(error instanceof TypeError, true);
        assert.equal(
          (error as Error).message,
          "sandbox_security_external_pipeline_invalid"
        );
        assert.equal(String(error).includes(PROVIDER_SENTINEL), false);
        return true;
      }
    );
  }
  assert.equal(getterCalls, 0);
  assert.equal(proxyTrapCalls, 2);

  const source = existsSync(pipelinePath) ? readFileSync(pipelinePath, "utf8") : "";
  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns|fs|child_process)/);
  assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|process\.getBuiltinModule/);
  assert.doesNotMatch(source, /benchmark|fixture_id|truth|capture_sink|replay_transport/i);
  assert.doesNotMatch(source, /from\s+["']\.\.\/security\/(?!index\.ts["'])/);
});

test("REQ-SBX-GENERAL-002 Engine fixture exposes only a transport call counter", () => {
  const harness = transportHarness(() => judgeResponse([]));
  assert.deepEqual(Object.keys(harness), ["transport", "call_count"]);
  assert.equal(harness.call_count, 0);
});
