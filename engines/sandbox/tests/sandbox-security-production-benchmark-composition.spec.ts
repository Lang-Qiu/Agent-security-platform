import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  existsSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "../../../frontend/node_modules/typescript/lib/typescript.js";

import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts
} from "../src/security/index.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport
} from "../src/security-production/http-transport.ts";
import {
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  normalizeSandboxSecurityReplayOllamaResponse,
  normalizeSandboxSecurityReplayOpenAIResponse,
  normalizeSandboxSecurityReplayOutcome,
  type SandboxSecurityReplayOllamaInventoryResponse,
  type SandboxSecurityReplayOllamaResponse,
  type SandboxSecurityReplayOpenAIResponse,
  type SandboxSecurityReplayTransportOutcome
} from "../src/security-production/provider-outcomes.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "../src/security-production/rule-catalog.ts";
import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "../src/security-production/deterministic-sanitizer.ts";

type CapturedProviderOutcome =
  | Readonly<{
      capture_phase: "qualification";
      provider: "ollama";
      operation: "model_inventory";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaInventoryResponse
      >;
    }>
  | Readonly<{
      capture_phase: "qualification" | "evaluation";
      provider: "ollama";
      operation: "chat";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaResponse
      >;
    }>
  | Readonly<{
      capture_phase: "evaluation";
      provider: "openai";
      operation: "responses";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOpenAIResponse
      >;
    }>;

interface CaptureSink {
  beginInput(): void;
  record(outcome: Readonly<CapturedProviderOutcome>): void;
  endInput(): void;
  assertDrained(): void;
}

interface ReplayTransport extends SandboxSecurityHttpTransport {
  beginInput(): void;
  endInput(): void;
  assertDrained(): void;
}

interface SealedProviderConfig {
  ollama_model: "qwen3:8b";
  ollama_digest: string;
  openai_model: "gpt-5.6-terra";
  local_prompt_version: "sandbox-security-ollama-local-prompt.v1";
  local_schema_version: "sandbox-security-local-model.v1";
  judge_prompt_version: "sandbox-security-openai-judge-prompt.v1";
  judge_schema_version: "sandbox-security-judge.v1";
  rule_catalog_version: string;
  sanitizer_version: string;
}

type CreateLiveCaptureEngine = (input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  capture_sink: CaptureSink;
}>) => Promise<SandboxSecurityEngine>;

type CreateHermeticReplayEngine = (input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  replay_transport: ReplayTransport;
  sealed_config: Readonly<SealedProviderConfig>;
}>) => Promise<SandboxSecurityEngine>;

const BENCHMARK_MODULE_URL = new URL(
  "../src/security-production/benchmark-composition.ts",
  import.meta.url
);
const INERT_ENGINE = Object.freeze({
  async evaluate() {
    return Object.freeze({ detector_runs: [] });
  }
}) as unknown as SandboxSecurityEngine;

let createLiveCaptureEngine: CreateLiveCaptureEngine = async () => INERT_ENGINE;
let createHermeticReplayEngine: CreateHermeticReplayEngine = async () =>
  INERT_ENGINE;

if (existsSync(BENCHMARK_MODULE_URL)) {
  const candidate = await import(
    "../src/security-production/benchmark-composition.ts"
  );
  if (typeof candidate.createSandboxSecurityLiveCaptureEngine === "function") {
    createLiveCaptureEngine =
      candidate.createSandboxSecurityLiveCaptureEngine as CreateLiveCaptureEngine;
  }
  if (
    typeof candidate.createSandboxSecurityHermeticReplayEngine === "function"
  ) {
    createHermeticReplayEngine =
      candidate.createSandboxSecurityHermeticReplayEngine as CreateHermeticReplayEngine;
  }
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const PRODUCTION_ROOT = fileURLToPath(
  new URL("../src/security-production", import.meta.url)
);
const PRODUCTION_INDEX = join(PRODUCTION_ROOT, "index.ts");

function sealedConfig(
  overrides: Readonly<Record<string, unknown>> = {}
): Readonly<SealedProviderConfig> {
  return Object.freeze({
    ollama_model: "qwen3:8b",
    ollama_digest: DIGEST,
    openai_model: "gpt-5.6-terra",
    local_prompt_version: "sandbox-security-ollama-local-prompt.v1",
    local_schema_version: "sandbox-security-local-model.v1",
    judge_prompt_version: "sandbox-security-openai-judge-prompt.v1",
    judge_schema_version: "sandbox-security-judge.v1",
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION,
    ...overrides
  }) as Readonly<SealedProviderConfig>;
}

function runtimeHarness(options: Readonly<{
  fire_qualification_timeout?: boolean;
}> = {}) {
  const delays: number[] = [];
  let cancellationCount = 0;
  let scheduledCount = 0;
  let decisionOrdinal = 0;
  let monotonic = 0;
  const runtime: SandboxSecurityRuntimePorts = Object.freeze({
    now: () => "2026-07-20T00:00:00.000Z",
    nextDecisionId: () => `decision-benchmark-${++decisionOrdinal}`,
    monotonicNowMs: () => monotonic++,
    scheduleTimeout(delayMs: number, callback: () => void) {
      delays.push(delayMs);
      scheduledCount += 1;
      if (options.fire_qualification_timeout === true && scheduledCount === 1) {
        callback();
      }
      let cancelled = false;
      return () => {
        if (!cancelled) {
          cancelled = true;
          cancellationCount += 1;
        }
      };
    }
  });
  return {
    runtime,
    delays,
    get cancellation_count() {
      return cancellationCount;
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
      request_id: "request_benchmark_001",
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

function inventoryNormalized(): SandboxSecurityReplayOllamaInventoryResponse {
  return normalizeSandboxSecurityReplayOllamaInventoryResponse({
    model: "qwen3:8b",
    digest: DIGEST
  });
}

function ollamaNormalized(
  status: "matched" | "no_match" = "no_match",
  confidence: "uncertain" | "probable" | "confident" = "confident"
): SandboxSecurityReplayOllamaResponse {
  return normalizeSandboxSecurityReplayOllamaResponse({
    model: "qwen3:8b",
    verified_ollama_digest: DIGEST,
    done: true,
    message: {
      role: "assistant",
      parsed: {
        schema_version: "sandbox-security-local-model.v1",
        status,
        candidates: status === "no_match"
          ? []
          : [
              {
                category: "prompt_injection",
                severity: "high",
                confidence,
                subject_refs: [
                  {
                    kind: "content_source",
                    source_ordinal: 1,
                    component: "whole_source"
                  }
                ]
              }
            ]
      }
    }
  });
}

function openAiNormalized(): SandboxSecurityReplayOpenAIResponse {
  return normalizeSandboxSecurityReplayOpenAIResponse({
    model: "gpt-5.6-terra",
    status: "completed",
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: [
        {
          obligation_ordinal: 1,
          outcome: "clearance",
          confidence: "probable",
          severity: null
        }
      ]
    }
  });
}

function responseOutcome<T>(
  normalizedResponse: T,
  normalizeResponse: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T> {
  return normalizeSandboxSecurityReplayOutcome(
    {
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: normalizedResponse
    },
    normalizeResponse
  );
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  error: string
): ReadonlyMap<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(error);
  }
  const values = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error(error);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error(error);
    }
    values.set(key, descriptor.value);
  }
  if (
    values.size !== expectedKeys.length ||
    expectedKeys.some((key) => !values.has(key))
  ) {
    throw new Error(error);
  }
  return values;
}

function createConformingCaptureSink(expectedInputs = 1): Readonly<{
  sink: CaptureSink;
  events: readonly CapturedProviderOutcome[];
}> {
  let phase:
    | "qualification_inventory"
    | "qualification_prewarm"
    | "ready"
    | "input"
    | "failed" = "qualification_inventory";
  let closedInputs = 0;
  let localSeen = false;
  let judgeSeen = false;
  const events: CapturedProviderOutcome[] = [];
  const fail = (): never => {
    phase = "failed";
    throw new Error("capture_sink_invalid");
  };
  const sink: CaptureSink = Object.freeze({
    beginInput() {
      if (phase !== "ready" || closedInputs >= expectedInputs) fail();
      phase = "input";
      localSeen = false;
      judgeSeen = false;
    },
    record(value: Readonly<CapturedProviderOutcome>) {
      const values = exactRecord(
        value,
        ["capture_phase", "provider", "operation", "outcome"],
        "capture_sink_invalid"
      );
      const capturePhase = values.get("capture_phase");
      const provider = values.get("provider");
      const operation = values.get("operation");
      let outcome: SandboxSecurityReplayTransportOutcome<unknown>;
      if (provider === "ollama" && operation === "model_inventory") {
        outcome = normalizeSandboxSecurityReplayOutcome(
          values.get("outcome"),
          normalizeSandboxSecurityReplayOllamaInventoryResponse
        );
      } else if (provider === "ollama" && operation === "chat") {
        outcome = normalizeSandboxSecurityReplayOutcome(
          values.get("outcome"),
          normalizeSandboxSecurityReplayOllamaResponse
        );
      } else if (provider === "openai" && operation === "responses") {
        outcome = normalizeSandboxSecurityReplayOutcome(
          values.get("outcome"),
          normalizeSandboxSecurityReplayOpenAIResponse
        );
      } else {
        return fail();
      }
      const normalized = Object.freeze({
        capture_phase: capturePhase,
        provider,
        operation,
        outcome
      }) as CapturedProviderOutcome;
      if (
        phase === "qualification_inventory" &&
        capturePhase === "qualification" &&
        provider === "ollama" &&
        operation === "model_inventory"
      ) {
        events.push(normalized);
        if (outcome.status !== "response") {
          phase = "failed";
          return;
        }
        phase = "qualification_prewarm";
        return;
      }
      if (
        phase === "qualification_prewarm" &&
        capturePhase === "qualification" &&
        provider === "ollama" &&
        operation === "chat"
      ) {
        events.push(normalized);
        if (outcome.status !== "response") {
          phase = "failed";
          return;
        }
        phase = "ready";
        return;
      }
      if (phase !== "input" || capturePhase !== "evaluation") fail();
      if (provider === "ollama" && operation === "chat") {
        if (localSeen) fail();
        localSeen = true;
      } else if (provider === "openai" && operation === "responses") {
        if (judgeSeen) fail();
        judgeSeen = true;
      } else {
        fail();
      }
      events.push(normalized);
    },
    endInput() {
      if (phase !== "input") fail();
      if (!localSeen) {
        events.push(Object.freeze({
          capture_phase: "evaluation",
          provider: "ollama",
          operation: "chat",
          outcome: Object.freeze({ status: "not_called" })
        }));
      }
      if (!judgeSeen) {
        events.push(Object.freeze({
          capture_phase: "evaluation",
          provider: "openai",
          operation: "responses",
          outcome: Object.freeze({ status: "not_called" })
        }));
      }
      closedInputs += 1;
      phase = "ready";
    },
    assertDrained() {
      if (phase !== "ready" || closedInputs !== expectedInputs) fail();
    }
  });
  return { sink, events };
}

type AnonymousReplayUnit = Readonly<{
  ollama: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  openai: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOpenAIResponse>;
}>;

function inventoryWire(
  normalized: SandboxSecurityReplayOllamaInventoryResponse
): Readonly<SandboxSecurityHttpResponse> {
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body: ENCODER.encode(JSON.stringify({
      models: [
        {
          name: normalized.model,
          model: normalized.model,
          digest: normalized.digest.slice("sha256:".length)
        }
      ]
    }))
  });
}

function ollamaWire(
  normalized: SandboxSecurityReplayOllamaResponse
): Readonly<SandboxSecurityHttpResponse> {
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body: ENCODER.encode(JSON.stringify({
      model: normalized.model,
      done: normalized.done,
      done_reason: "stop",
      message: {
        role: normalized.message.role,
        content: JSON.stringify(normalized.message.parsed)
      }
    })),
    verified_ollama_digest: normalized.verified_ollama_digest
  });
}

function openAiWire(
  normalized: SandboxSecurityReplayOpenAIResponse,
  requestBody: Uint8Array
): Readonly<SandboxSecurityHttpResponse> {
  const requestEnvelope = JSON.parse(DECODER.decode(requestBody)) as {
    input?: readonly {
      role?: unknown;
      content?: readonly { type?: unknown; text?: unknown }[];
    }[];
  };
  const text = requestEnvelope.input?.[1]?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new TypeError("replay_openai_request_invalid");
  }
  const start = "BEGIN_SANITIZED_PAYLOAD\n";
  const end = "\nEND_SANITIZED_PAYLOAD";
  assert.equal(text.startsWith(start), true);
  assert.equal(text.endsWith(end), true);
  const payload = JSON.parse(text.slice(start.length, -end.length)) as {
    routed_obligations: readonly { obligation_id: string }[];
  };
  const obligationResults = normalized.parsed.obligation_results.map((result) => {
    const obligation = payload.routed_obligations[result.obligation_ordinal - 1];
    assert.ok(obligation);
    return {
      obligation_id: obligation.obligation_id,
      outcome: result.outcome,
      confidence: result.confidence,
      severity: result.severity
    };
  });
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body: ENCODER.encode(JSON.stringify({
      model: normalized.model,
      status: normalized.status,
      error: null,
      incomplete_details: null,
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                schema_version: normalized.parsed.schema_version,
                obligation_results: obligationResults
              })
            }
          ]
        }
      ]
    }))
  });
}

function replayFailure(
  outcome: Exclude<
    SandboxSecurityReplayTransportOutcome<unknown>,
    { status: "response" } | { status: "not_called" }
  >
): never | Readonly<SandboxSecurityHttpResponse> {
  if (outcome.status === "http_error") {
    return Object.freeze({
      status: outcome.http_status,
      content_type: "application/json",
      body: ENCODER.encode("{}")
    });
  }
  const name = outcome.status === "transport_error"
    ? `sandbox_security_transport_${outcome.error_code}`
    : "sandbox_security_transport_aborted";
  const error = new Error(name);
  error.name = name;
  throw error;
}

function createConformingReplayTransport(input: Readonly<{
  qualification_inventory?: SandboxSecurityReplayTransportOutcome<
    SandboxSecurityReplayOllamaInventoryResponse
  >;
  qualification_prewarm?: SandboxSecurityReplayTransportOutcome<
    SandboxSecurityReplayOllamaResponse
  >;
  units?: readonly AnonymousReplayUnit[];
  request_error?: Error;
}> = {}) {
  const qualificationInventory = input.qualification_inventory ??
    responseOutcome(
      inventoryNormalized(),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    );
  const qualificationPrewarm = input.qualification_prewarm ??
    responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    );
  const units = input.units ?? [];
  let phase:
    | "qualification_inventory"
    | "qualification_prewarm"
    | "ready"
    | "input" = "qualification_inventory";
  let unitOrdinal = 0;
  let localConsumed = false;
  let judgeConsumed = false;
  let wrongThisCount = 0;
  const operations: string[] = [];
  let transport!: ReplayTransport;

  const wire = (
    outcome: SandboxSecurityReplayTransportOutcome<unknown>,
    operation: "model_inventory" | "chat" | "responses",
    request?: Readonly<SandboxSecurityHttpRequest>
  ): Readonly<SandboxSecurityHttpResponse> => {
    if (outcome.status === "not_called") {
      throw new Error("replay_unexpected_provider_call");
    }
    if (outcome.status !== "response") return replayFailure(outcome);
    if (operation === "model_inventory") {
      return inventoryWire(
        outcome.normalized_response as SandboxSecurityReplayOllamaInventoryResponse
      );
    }
    if (operation === "chat") {
      return ollamaWire(
        outcome.normalized_response as SandboxSecurityReplayOllamaResponse
      );
    }
    assert.ok(
      request?.provider === "openai" && request.operation === "responses"
    );
    return openAiWire(
      outcome.normalized_response as SandboxSecurityReplayOpenAIResponse,
      request.body
    );
  };

  transport = Object.freeze({
    async request(this: ReplayTransport, request: Readonly<SandboxSecurityHttpRequest>) {
      if (this !== transport) wrongThisCount += 1;
      if (input.request_error !== undefined) throw input.request_error;
      operations.push(`${request.provider}:${request.operation}`);
      if (
        phase === "qualification_inventory" &&
        request.provider === "ollama" &&
        request.operation === "model_inventory"
      ) {
        phase = "qualification_prewarm";
        return wire(qualificationInventory, "model_inventory");
      }
      if (
        phase === "qualification_prewarm" &&
        request.provider === "ollama" &&
        request.operation === "chat"
      ) {
        phase = "ready";
        return wire(qualificationPrewarm, "chat");
      }
      if (phase !== "input") {
        throw new Error("replay_request_outside_input");
      }
      const unit = units[unitOrdinal];
      if (unit === undefined) throw new Error("replay_input_missing");
      if (request.provider === "ollama" && request.operation === "chat") {
        if (localConsumed) throw new Error("replay_duplicate_local");
        localConsumed = true;
        return wire(unit.ollama, "chat");
      }
      if (request.provider === "openai" && request.operation === "responses") {
        if (judgeConsumed) throw new Error("replay_duplicate_judge");
        judgeConsumed = true;
        return wire(unit.openai, "responses", request);
      }
      throw new Error("replay_wrong_provider_operation");
    },
    beginInput() {
      if (phase !== "ready" || unitOrdinal >= units.length) {
        throw new Error("replay_begin_invalid");
      }
      phase = "input";
      localConsumed = false;
      judgeConsumed = false;
    },
    endInput() {
      if (phase !== "input") throw new Error("replay_end_invalid");
      const unit = units[unitOrdinal]!;
      if (
        (unit.ollama.status === "not_called") === localConsumed ||
        (unit.openai.status === "not_called") === judgeConsumed
      ) {
        throw new Error("replay_unit_not_drained");
      }
      unitOrdinal += 1;
      phase = "ready";
    },
    assertDrained() {
      if (phase !== "ready" || unitOrdinal !== units.length) {
        throw new Error("replay_not_drained");
      }
    }
  });
  return {
    transport,
    operations,
    get qualification_consumed() {
      return phase === "ready" || phase === "input";
    },
    get wrong_this_count() {
      return wrongThisCount;
    }
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(11434, "127.0.0.1", () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function withProductionEnvironment(action: () => Promise<void>): Promise<void> {
  const keys = [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "OPENAI_API_KEY",
    "SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE"
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST = DIGEST;
  process.env.OPENAI_API_KEY = "benchmark-test-key";
  process.env.SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE = "1";
  return action().finally(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("REQ-SBX-GENERAL-002 live composition captures qualification before return then anonymous evaluation slots", async () => {
  const serverOperations: string[] = [];
  const server = createServer((request, response) => {
    serverOperations.push(`${request.method}:${request.url}`);
    request.resume();
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.end(JSON.stringify({
        models: [
          {
            name: "qwen3:8b",
            model: "qwen3:8b",
            digest: DIGEST.slice("sha256:".length)
          }
        ]
      }));
      return;
    }
    response.end(JSON.stringify({
      model: "qwen3:8b",
      done: true,
      done_reason: "stop",
      message: {
        role: "assistant",
        content: JSON.stringify({
          schema_version: "sandbox-security-local-model.v1",
          status: "no_match",
          candidates: []
        })
      }
    }));
  });
  await listen(server);
  const runtime = runtimeHarness();
  const capture = createConformingCaptureSink();
  try {
    await withProductionEnvironment(async () => {
      const engine = await createLiveCaptureEngine({
        runtime: runtime.runtime,
        capture_sink: capture.sink
      });

      assert.deepEqual(
        capture.events.map((event) => [
          event.capture_phase,
          event.provider,
          event.operation
        ]),
        [
          ["qualification", "ollama", "model_inventory"],
          ["qualification", "ollama", "chat"]
        ]
      );
      capture.sink.beginInput();
      await engine.evaluate(evaluationRequest());
      capture.sink.endInput();
      capture.sink.assertDrained();
    });
  } finally {
    await close(server);
  }

  assert.deepEqual(
    capture.events.slice(2).map((event) => [
      event.provider,
      event.operation,
      event.outcome.status
    ]),
    [
      ["ollama", "chat", "response"],
      ["openai", "responses", "not_called"]
    ]
  );
  assert.deepEqual(serverOperations, [
    "GET:/api/tags",
    "GET:/api/tags",
    "POST:/api/chat",
    "GET:/api/tags",
    "POST:/api/chat"
  ]);
  assert.deepEqual(runtime.delays, [1000, 100, 1000]);
  assert.equal(runtime.cancellation_count, 3);
});

test("REQ-SBX-GENERAL-002 replay consumes inventory and prewarm before returning an Engine", async () => {
  const runtime = runtimeHarness();
  const unit: AnonymousReplayUnit = Object.freeze({
    ollama: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    ),
    openai: Object.freeze({ status: "not_called" })
  });
  const replay = createConformingReplayTransport({ units: [unit] });

  const engine = await createHermeticReplayEngine({
    runtime: runtime.runtime,
    replay_transport: replay.transport,
    sealed_config: sealedConfig()
  });

  assert.equal(replay.qualification_consumed, true);
  assert.deepEqual(replay.operations, [
    "ollama:model_inventory",
    "ollama:chat"
  ]);
  replay.transport.beginInput();
  await engine.evaluate(evaluationRequest());
  replay.transport.endInput();
  replay.transport.assertDrained();
  assert.deepEqual(replay.operations, [
    "ollama:model_inventory",
    "ollama:chat",
    "ollama:chat"
  ]);
  assert.equal(replay.wrong_this_count, 0);
  assert.deepEqual(runtime.delays, [1000, 100, 1000]);
  assert.equal(runtime.cancellation_count, 3);
});

test("REQ-SBX-GENERAL-002 replay routes matched local and Judge through one original runner state", async () => {
  const replay = createConformingReplayTransport({
    units: [
      Object.freeze({
        ollama: responseOutcome(
          ollamaNormalized("matched", "uncertain"),
          normalizeSandboxSecurityReplayOllamaResponse
        ),
        openai: responseOutcome(
          openAiNormalized(),
          normalizeSandboxSecurityReplayOpenAIResponse
        )
      })
    ]
  });
  const engine = await createHermeticReplayEngine({
    runtime: runtimeHarness().runtime,
    replay_transport: replay.transport,
    sealed_config: sealedConfig()
  });

  replay.transport.beginInput();
  const decision = await engine.evaluate(evaluationRequest());
  assert.deepEqual(
    decision.detector_runs.map((run) => [run.detector_kind, run.status]),
    [
      ["rule", "no_match"],
      ["local_model", "matched"],
      ["external_judge", "matched"]
    ]
  );
  assert.deepEqual(replay.operations, [
    "ollama:model_inventory",
    "ollama:chat",
    "ollama:chat",
    "openai:responses"
  ]);
  replay.transport.endInput();
  replay.transport.assertDrained();

  assert.equal(replay.wrong_this_count, 0);
});

test("REQ-SBX-GENERAL-002 live malformed provider response records only content-free failure before semantic rejection", async () => {
  const rawSentinel = "RAW_PROVIDER_BODY_AND_PROSE_SENTINEL";
  const server = createServer((request, response) => {
    request.resume();
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ provider_prose: rawSentinel }));
  });
  await listen(server);
  const capture = createConformingCaptureSink();
  let thrown: unknown;
  try {
    await withProductionEnvironment(async () => {
      try {
        await createLiveCaptureEngine({
          runtime: runtimeHarness().runtime,
          capture_sink: capture.sink
        });
      } catch (error) {
        thrown = error;
      }
    });
  } finally {
    await close(server);
  }

  assert.ok(thrown instanceof TypeError);
  assert.equal(thrown.message, "sandbox_security_ollama_qualification_invalid");
  assert.deepEqual(capture.events, [
    {
      capture_phase: "qualification",
      provider: "ollama",
      operation: "model_inventory",
      outcome: {
        status: "transport_error",
        error_code: "provider_response_invalid"
      }
    }
  ]);
  assert.equal(JSON.stringify(capture.events).includes(rawSentinel), false);
  assert.throws(() => capture.sink.assertDrained(), /capture_sink_invalid/);
});

test("REQ-SBX-GENERAL-002 live transport failure records content-free outcome and rethrows transport semantics", async () => {
  const capture = createConformingCaptureSink();
  let thrown: unknown;
  await withProductionEnvironment(async () => {
    try {
      await createLiveCaptureEngine({
        runtime: runtimeHarness().runtime,
        capture_sink: capture.sink
      });
    } catch (error) {
      thrown = error;
    }
  });

  assert.ok(thrown instanceof Error);
  assert.equal(thrown.name, "sandbox_security_transport_connection_failed");
  assert.deepEqual(capture.events, [
    {
      capture_phase: "qualification",
      provider: "ollama",
      operation: "model_inventory",
      outcome: {
        status: "transport_error",
        error_code: "connection_failed"
      }
    }
  ]);
});

test("REQ-SBX-GENERAL-002 live transport failure survives a capture record failure", async () => {
  const recordSentinel = new Error("capture-record-sentinel");
  const sink: CaptureSink = Object.freeze({
    beginInput() {},
    record() {
      throw recordSentinel;
    },
    endInput() {},
    assertDrained() {}
  });
  let thrown: unknown;
  await withProductionEnvironment(async () => {
    try {
      await createLiveCaptureEngine({
        runtime: runtimeHarness().runtime,
        capture_sink: sink
      });
    } catch (error) {
      thrown = error;
    }
  });

  assert.ok(thrown instanceof Error);
  assert.notEqual(thrown, recordSentinel);
  assert.equal(thrown.name, "sandbox_security_transport_connection_failed");
});

test("REQ-SBX-GENERAL-002 replay rejects qualification prefix digest drift before Engine return", async () => {
  const otherDigest = `sha256:${"b".repeat(64)}`;
  const replay = createConformingReplayTransport({
    qualification_inventory: responseOutcome(
      normalizeSandboxSecurityReplayOllamaInventoryResponse({
        model: "qwen3:8b",
        digest: otherDigest
      }),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    )
  });
  const runtime = runtimeHarness();

  await assert.rejects(
    () => createHermeticReplayEngine({
      runtime: runtime.runtime,
      replay_transport: replay.transport,
      sealed_config: sealedConfig()
    }),
    /sandbox_security_ollama_qualification_invalid/
  );

  assert.deepEqual(replay.operations, ["ollama:model_inventory"]);
  assert.equal(runtime.cancellation_count, 1);
});

test("REQ-SBX-GENERAL-002 benchmark entrypoints and types stay outside the public production index", async () => {
  const benchmarkExports = await import(
    "../src/security-production/benchmark-composition.ts"
  );
  assert.deepEqual(Object.keys(benchmarkExports).sort(), [
    "createSandboxSecurityHermeticReplayEngine",
    "createSandboxSecurityLiveCaptureEngine"
  ]);
  const publicExports = await import("../src/security-production/index.ts");
  assert.deepEqual(Object.keys(publicExports).sort(), [
    "createSandboxSecurityDeterministicSanitizer",
    "createSandboxSecurityProductionEngine",
    "createSandboxSecurityProductionRuleDetector"
  ]);
  for (const name of [
    "createSandboxSecurityLiveCaptureEngine",
    "createSandboxSecurityHermeticReplayEngine",
    "SandboxSecurityCaptureSink",
    "SandboxSecurityReplayTransport",
    "SandboxSecurityCapturedProviderOutcome",
    "SandboxSecuritySealedProviderConfig"
  ]) {
    assert.equal(name in publicExports, false, `${name} must remain direct-import only`);
  }
  assert.doesNotMatch(
    readFileSync(PRODUCTION_INDEX, "utf8"),
    /benchmark-composition|LiveCapture|HermeticReplay|CaptureSink|ReplayTransport/u
  );
});

test("REQ-SBX-GENERAL-002 conforming sink rejects wrong duplicate and outside records and writes explicit not_called slots", () => {
  const inventoryRecord: CapturedProviderOutcome = Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "model_inventory",
    outcome: responseOutcome(
      inventoryNormalized(),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    )
  });
  const prewarmRecord: CapturedProviderOutcome = Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "chat",
    outcome: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    )
  });
  const outside = createConformingCaptureSink();
  assert.throws(() => outside.sink.beginInput(), /capture_sink_invalid/);

  const wrong = createConformingCaptureSink();
  assert.throws(() => wrong.sink.record(prewarmRecord), /capture_sink_invalid/);

  const duplicate = createConformingCaptureSink();
  duplicate.sink.record(inventoryRecord);
  duplicate.sink.record(prewarmRecord);
  duplicate.sink.beginInput();
  const localRecord: CapturedProviderOutcome = Object.freeze({
    capture_phase: "evaluation",
    provider: "ollama",
    operation: "chat",
    outcome: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    )
  });
  duplicate.sink.record(localRecord);
  assert.throws(() => duplicate.sink.record(localRecord), /capture_sink_invalid/);

  const explicit = createConformingCaptureSink();
  explicit.sink.record(inventoryRecord);
  explicit.sink.record(prewarmRecord);
  explicit.sink.beginInput();
  explicit.sink.endInput();
  explicit.sink.assertDrained();
  assert.deepEqual(explicit.events.slice(2), [
    {
      capture_phase: "evaluation",
      provider: "ollama",
      operation: "chat",
      outcome: { status: "not_called" }
    },
    {
      capture_phase: "evaluation",
      provider: "openai",
      operation: "responses",
      outcome: { status: "not_called" }
    }
  ]);
});

test("REQ-SBX-GENERAL-002 replay rejects every sealed config mismatch before provider effects", async () => {
  const mismatches: readonly Readonly<Record<string, unknown>>[] = [
    { ollama_model: "qwen3:latest" },
    { ollama_digest: `sha256:${"A".repeat(64)}` },
    { ollama_digest: `sha256:${"a".repeat(63)}` },
    { openai_model: "gpt-5.6" },
    { local_prompt_version: "sandbox-security-ollama-local-prompt.v2" },
    { local_schema_version: "sandbox-security-local-model.v2" },
    { judge_prompt_version: "sandbox-security-openai-judge-prompt.v2" },
    { judge_schema_version: "sandbox-security-judge.v2" },
    { rule_catalog_version: "sandbox-security-rule-catalog.v2" },
    { sanitizer_version: "sandbox-security-deterministic-sanitizer.v2" },
    { endpoint: "https://attacker.invalid" },
    { credential: "secret" }
  ];
  for (const mismatch of mismatches) {
    const replay = createConformingReplayTransport();
    await assert.rejects(() =>
      createHermeticReplayEngine({
        runtime: runtimeHarness().runtime,
        replay_transport: replay.transport,
        sealed_config: sealedConfig(mismatch)
      })
    );
    assert.deepEqual(replay.operations, [], JSON.stringify(mismatch));
  }
});

test("REQ-SBX-GENERAL-002 replay contains malformed accessor inherited symbol proxy and revoked config before effects", async () => {
  const accessor: Record<string, unknown> = { ...sealedConfig() };
  Object.defineProperty(accessor, "ollama_digest", {
    enumerable: true,
    get() {
      throw new Error("RAW_ACCESSOR_PROVIDER_PROSE");
    }
  });
  const inherited = Object.assign(
    Object.create({ inherited_secret: "RAW_INHERITED_SECRET" }),
    sealedConfig()
  ) as Record<string, unknown>;
  const symbol = {
    ...sealedConfig(),
    [Symbol("RAW_SYMBOL_SECRET")]: true
  };
  const hostile = new Proxy(
    { ...sealedConfig() },
    {
      ownKeys() {
        throw new Error("RAW_PROXY_PROVIDER_PROSE");
      }
    }
  );
  const revocable = Proxy.revocable({ ...sealedConfig() }, {});
  revocable.revoke();
  const cases: readonly unknown[] = [
    null,
    {},
    { ...sealedConfig(), unknown: true },
    accessor,
    inherited,
    symbol,
    hostile,
    revocable.proxy
  ];

  for (const sealed_config of cases) {
    const replay = createConformingReplayTransport();
    let thrown: unknown;
    try {
      await createHermeticReplayEngine({
        runtime: runtimeHarness().runtime,
        replay_transport: replay.transport,
        sealed_config: sealed_config as Readonly<SealedProviderConfig>
      });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof TypeError);
    assert.equal(thrown.message, "sandbox_security_benchmark_composition_invalid");
    assert.doesNotMatch(
      JSON.stringify({
        name: thrown.name,
        message: thrown.message,
        stack: thrown.stack ?? ""
      }),
      /RAW_|provider prose|secret/iu
    );
    assert.deepEqual(replay.operations, []);
  }
});

test("REQ-SBX-GENERAL-002 factories reject open input bags and lifecycle accessors before effects", async () => {
  const replay = createConformingReplayTransport();
  await assert.rejects(() =>
    createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: replay.transport,
      sealed_config: sealedConfig(),
      endpoint: "https://attacker.invalid"
    } as never)
  );
  assert.deepEqual(replay.operations, []);

  const lifecycleAccessor = { request: replay.transport.request } as Record<
    string,
    unknown
  >;
  for (const method of ["beginInput", "endInput", "assertDrained"]) {
    Object.defineProperty(lifecycleAccessor, method, {
      enumerable: true,
      get() {
        throw new Error("RAW_LIFECYCLE_ACCESSOR_SECRET");
      }
    });
  }
  let thrown: unknown;
  try {
    await createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: lifecycleAccessor as unknown as ReplayTransport,
      sealed_config: sealedConfig()
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof TypeError);
  assert.equal(thrown.message, "sandbox_security_benchmark_composition_invalid");
  assert.doesNotMatch(JSON.stringify(thrown), /RAW_LIFECYCLE/u);
  assert.deepEqual(replay.operations, []);

  await assert.rejects(() =>
    createLiveCaptureEngine({
      runtime: runtimeHarness().runtime,
      capture_sink: createConformingCaptureSink().sink,
      credential: "secret"
    } as never)
  );
});

test("REQ-SBX-GENERAL-002 qualification failure preserves error identity and cleans the timer without fallback", async () => {
  const sentinel = new Error("qualification-connection-sentinel");
  const replay = createConformingReplayTransport({ request_error: sentinel });
  const runtime = runtimeHarness();
  let thrown: unknown;
  try {
    await createHermeticReplayEngine({
      runtime: runtime.runtime,
      replay_transport: replay.transport,
      sealed_config: sealedConfig()
    });
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown, sentinel);
  assert.deepEqual(runtime.delays, [1000]);
  assert.equal(runtime.cancellation_count, 1);
  assert.deepEqual(replay.operations, []);

  const timedRuntime = runtimeHarness({ fire_qualification_timeout: true });
  const untouched = createConformingReplayTransport();
  await assert.rejects(() =>
    createHermeticReplayEngine({
      runtime: timedRuntime.runtime,
      replay_transport: untouched.transport,
      sealed_config: sealedConfig()
    })
  );
  assert.deepEqual(untouched.operations, []);
  assert.equal(timedRuntime.cancellation_count, 1);
});

test("REQ-SBX-GENERAL-002 content-free records expose no request raw provider or oracle data", () => {
  const capture = createConformingCaptureSink();
  capture.sink.record(Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "model_inventory",
    outcome: responseOutcome(
      inventoryNormalized(),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    )
  }));
  capture.sink.record(Object.freeze({
    capture_phase: "qualification",
    provider: "ollama",
    operation: "chat",
    outcome: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    )
  }));
  capture.sink.beginInput();
  capture.sink.endInput();
  const serialized = JSON.stringify(capture.events);
  for (const forbidden of [
    "request_id",
    "request_body",
    "authorization",
    "credential",
    "raw_content",
    "sanitized_content",
    "provider_body",
    "provider_prose",
    "fixture_id",
    "truth",
    "metric",
    "expected_action",
    "verdict"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

function listTypeScriptFiles(root: string): readonly string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

test("REQ-SBX-GENERAL-002 benchmark source owns the sole approved WithPorts edge and no ambient capability", () => {
  assert.equal(existsSync(BENCHMARK_MODULE_URL), true);
  const sourcePath = fileURLToPath(BENCHMARK_MODULE_URL);
  const source = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const specifiers = imports.map((statement) => {
    assert.ok(ts.isStringLiteral(statement.moduleSpecifier));
    return statement.moduleSpecifier.text;
  });
  assert.deepEqual([...new Set(specifiers)].sort(), [
    "../security/index.ts",
    "./composition.ts",
    "./deterministic-sanitizer.ts",
    "./external-pipeline.ts",
    "./http-transport.ts",
    "./ollama-contract.ts",
    "./ollama-local-detector.ts",
    "./openai-judge-contract.ts",
    "./production-config.ts",
    "./provider-outcomes.ts",
    "./rule-catalog.ts"
  ]);
  assert.match(source, /createSandboxSecurityProductionCompositionWithPorts/u);
  assert.doesNotMatch(source, /\b(?:process|fetch|WebSocket|EventSource|require|eval)\b/u);
  assert.doesNotMatch(
    source,
    /\b(?:fixture_id|truth|metric|expected_action|verdict_class|dataset_source)\b/iu
  );

  const importers: string[] = [];
  for (const path of listTypeScriptFiles(resolve(PRODUCTION_ROOT, ".."))) {
    const text = readFileSync(path, "utf8");
    if (
      path !== sourcePath &&
      text.includes("createSandboxSecurityProductionCompositionWithPorts")
    ) {
      importers.push(relative(resolve(PRODUCTION_ROOT, ".."), path));
    }
  }
  assert.deepEqual(importers, ["security-production/composition.ts"]);
  assert.equal(dirname(sourcePath), PRODUCTION_ROOT);
});

test("REQ-SBX-GENERAL-002 sealed config field inventory and constants are exact", () => {
  assert.deepEqual(Object.keys(sealedConfig()), [
    "ollama_model",
    "ollama_digest",
    "openai_model",
    "local_prompt_version",
    "local_schema_version",
    "judge_prompt_version",
    "judge_schema_version",
    "rule_catalog_version",
    "sanitizer_version"
  ]);
  assert.equal(sealedConfig().ollama_digest, DIGEST);
  assert.equal(
    sealedConfig().rule_catalog_version,
    SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
  );
  assert.equal(
    sealedConfig().sanitizer_version,
    SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
  );
  assert.deepEqual(openAiNormalized(), {
    model: "gpt-5.6-terra",
    status: "completed",
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: [
        {
          obligation_ordinal: 1,
          outcome: "clearance",
          confidence: "probable",
          severity: null
        }
      ]
    }
  });
});
