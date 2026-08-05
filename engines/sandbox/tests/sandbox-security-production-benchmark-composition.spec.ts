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
import {
  hashSandboxSecurityBenchmarkJudgeBinding
} from "../../../scripts/benchmark/sandbox-security/contracts.ts";

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
      operation: "responses" | "chat_completions";
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
  judge_protocol_id:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1";
  judge_endpoint_policy_id: "operator_https_fqdn_v1";
  judge_base_url: string;
  judge_endpoint_url: string;
  judge_requested_model: string;
  judge_resolved_model: string;
  judge_binding_sha256: string;
  local_prompt_version: "sandbox-security-ollama-local-prompt.v2";
  local_schema_version: "sandbox-security-local-model.v1";
  judge_prompt_version: "sandbox-security-openai-judge-prompt.v2";
  judge_schema_version: "sandbox-security-judge.v1";
  rule_catalog_version: string;
  sanitizer_version: string;
}

type CreateLiveCaptureEngine = (input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  capture_sink: CaptureSink;
  transport?: SandboxSecurityHttpTransport;
  judge_protocol_id?: "openai_responses_v1" | "openai_chat_completions_json_v1";
  ollama_digest?: string;
  judge_endpoint_policy_id?: string;
  judge_base_url?: string;
  judge_endpoint_url?: string;
  judge_requested_model?: string;
}>) => Promise<SandboxSecurityEngine>;

type CreateHermeticReplayEngine = (input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  replay_transport: ReplayTransport;
  sealed_config: Readonly<SealedProviderConfig>;
}>) => Promise<SandboxSecurityEngine>;

interface BenchmarkJudgeProtocolDispatch {
  readonly operation: "responses" | "chat_completions";
  create_request(
    payload: unknown,
    options: Readonly<{ judge_requested_model: string }>
  ): Readonly<{ body: Uint8Array }>;
  normalize_response(
    requestBody: Uint8Array,
    responseBody: Uint8Array
  ): SandboxSecurityReplayOpenAIResponse;
}

type ResolveBenchmarkJudgeProtocolDispatch = (
  protocolId:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1"
) => Readonly<BenchmarkJudgeProtocolDispatch>;

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
let resolveBenchmarkJudgeProtocolDispatch: ResolveBenchmarkJudgeProtocolDispatch =
  () => {
    throw new TypeError("benchmark_judge_protocol_dispatch_missing");
  };

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
  if (
    typeof candidate.resolveSandboxSecurityBenchmarkJudgeProtocolDispatch ===
    "function"
  ) {
    resolveBenchmarkJudgeProtocolDispatch =
      candidate.resolveSandboxSecurityBenchmarkJudgeProtocolDispatch as ResolveBenchmarkJudgeProtocolDispatch;
  }
}

const DIGEST = `sha256:${"a".repeat(64)}`;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const PRODUCTION_ROOT = fileURLToPath(
  new URL("../src/security-production", import.meta.url)
);
const PRODUCTION_INDEX = join(PRODUCTION_ROOT, "index.ts");

function judgeBinding(
  protocolId:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1" = "openai_responses_v1"
) {
  const endpointSuffix = protocolId === "openai_responses_v1"
    ? "responses"
    : "chat/completions";
  return {
    judge_protocol_id: protocolId,
    judge_endpoint_policy_id: "operator_https_fqdn_v1" as const,
    judge_base_url: "https://us.doro.lol/v1",
    judge_endpoint_url: `https://us.doro.lol/v1/${endpointSuffix}`,
    judge_requested_model: "gpt-5.4-mini",
    judge_resolved_model: "gpt-5.4-mini"
  };
}

function sealedConfig(
  overrides: Readonly<Record<string, unknown>> = {},
  protocolId:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1" = "openai_responses_v1"
): Readonly<SealedProviderConfig> {
  const binding = judgeBinding(protocolId);
  return Object.freeze({
    ollama_model: "qwen3:8b",
    ollama_digest: DIGEST,
    ...binding,
    judge_binding_sha256: hashSandboxSecurityBenchmarkJudgeBinding(binding),
    local_prompt_version: "sandbox-security-ollama-local-prompt.v2",
    local_schema_version: "sandbox-security-local-model.v1",
    judge_prompt_version: "sandbox-security-openai-judge-prompt.v2",
    judge_schema_version: "sandbox-security-judge.v1",
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION,
    ...overrides
  }) as Readonly<SealedProviderConfig>;
}

function sanitizedJudgePayload() {
  return {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: "token://sandbox/security/request/0001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [
      {
        source_token: "token://sandbox/security/source/0001",
        source_type: "user_input",
        media_type: "text/plain",
        sanitized_value: "ordinary sanitized input"
      }
    ],
    routed_obligations: [
      {
        obligation_id: "obligation://sandbox/security/prompt_injection/0001",
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
  };
}

function chatJudgeResponseBody(): Uint8Array {
  return ENCODER.encode(JSON.stringify({
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
                obligation_id:
                  "obligation://sandbox/security/prompt_injection/0001",
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
    id: "chatcmpl-test",
    model: "gpt-5.4-mini",
    object: "chat.completion",
    system_fingerprint: null,
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2
    }
  }));
}

test("REQ-SBX-GENERAL-002 replay accepts a generic Judge binding and rejects tampering before transport", async () => {
  const accepted = createConformingReplayTransport();
  await assert.doesNotReject(() =>
    createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: accepted.transport,
      sealed_config: sealedConfig()
    })
  );
  assert.deepEqual(accepted.operations, ["ollama:model_inventory", "ollama:chat"]);

  const tampered = createConformingReplayTransport();
  await assert.rejects(() =>
    createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: tampered.transport,
      sealed_config: sealedConfig({
        judge_endpoint_url: "https://us.doro.lol/v1/not-responses"
      })
    })
  );
  assert.deepEqual(tampered.operations, []);
});

test("REQ-SBX-GENERAL-002 benchmark capture normalizes explicit Chat through the Chat parser and operation", () => {
  const dispatch = resolveBenchmarkJudgeProtocolDispatch(
    "openai_chat_completions_json_v1"
  );
  const request = dispatch.create_request(sanitizedJudgePayload(), {
    judge_requested_model: "gpt-5.4-mini"
  });

  assert.equal(dispatch.operation, "chat_completions");
  assert.deepEqual(
    dispatch.normalize_response(request.body, chatJudgeResponseBody()),
    openAiNormalized()
  );
});

test("REQ-SBX-GENERAL-002 replay accepts Chat sealed config and rejects cross-protocol binding substitution before transport", async () => {
  const accepted = createConformingReplayTransport();
  await assert.doesNotReject(() =>
    createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: accepted.transport,
      sealed_config: sealedConfig({}, "openai_chat_completions_json_v1")
    })
  );
  assert.deepEqual(accepted.operations, ["ollama:model_inventory", "ollama:chat"]);

  const substituted = createConformingReplayTransport();
  await assert.rejects(() =>
    createHermeticReplayEngine({
      runtime: runtimeHarness().runtime,
      replay_transport: substituted.transport,
      sealed_config: sealedConfig({
        judge_protocol_id: "openai_chat_completions_json_v1",
        judge_endpoint_url: "https://us.doro.lol/v1/chat/completions"
      })
    })
  );
  assert.deepEqual(substituted.operations, []);
});

function runtimeHarness(options: Readonly<{
  fire_qualification_timeout?: boolean;
  fire_evaluation_timeout_at?: number;
  force_work_budget_at_schedule?: number;
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
      if (options.fire_evaluation_timeout_at === scheduledCount) {
        if (options.force_work_budget_at_schedule === scheduledCount) {
          monotonic = 1_000_000;
        }
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

function liveCaptureInput(
  runtime: SandboxSecurityRuntimePorts,
  capture_sink: CaptureSink,
  transport: SandboxSecurityHttpTransport,
  judge_protocol_id:
    | "openai_responses_v1"
    | "openai_chat_completions_json_v1" = "openai_responses_v1"
): Parameters<CreateLiveCaptureEngine>[0] {
  const judgeEndpoint = judge_protocol_id === "openai_responses_v1"
    ? "responses"
    : "chat/completions";
  return {
    runtime,
    capture_sink,
    transport,
    judge_protocol_id,
    ollama_digest: DIGEST,
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: "https://unused.example.test/v1",
    judge_endpoint_url: `https://unused.example.test/v1/${judgeEndpoint}`,
    judge_requested_model: "gpt-5.4-mini"
  };
}

function createRecordingCaptureSink(): Readonly<{
  sink: CaptureSink;
  events: readonly CapturedProviderOutcome[];
}> {
  const events: CapturedProviderOutcome[] = [];
  const sink: CaptureSink = Object.freeze({
    beginInput() {},
    record(value: Readonly<CapturedProviderOutcome>) {
      events.push(value);
    },
    endInput() {},
    assertDrained() {}
  });
  return { sink, events };
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

function openAiNormalized(
  obligationCount = 1
): SandboxSecurityReplayOpenAIResponse {
  return normalizeSandboxSecurityReplayOpenAIResponse({
    model: "gpt-5.4-mini",
    status: "completed",
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: Array.from(
        { length: obligationCount },
        (_, index) => ({
          obligation_ordinal: index + 1,
          outcome: "clearance",
          confidence: "probable",
          severity: null
        })
      )
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

function namedTransportError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function liveResponse(
  input: Readonly<SandboxSecurityHttpRequest>
): Readonly<SandboxSecurityHttpResponse> {
  if (input.provider === "ollama" && input.operation === "model_inventory") {
    return inventoryWire(inventoryNormalized());
  }
  if (input.provider === "ollama" && input.operation === "chat") {
    return ollamaWire(ollamaNormalized());
  }
  if (input.provider === "openai") {
    return openAiWire(openAiNormalized(7), input.body);
  }
  throw new Error("unexpected_provider_request");
}

function requestBody(
  input: Readonly<SandboxSecurityHttpRequest>
): Uint8Array | undefined {
  return "body" in input ? input.body : undefined;
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

function isRetryableCaptureOutcome(
  outcome: SandboxSecurityReplayTransportOutcome<unknown>
): boolean {
  return outcome.status === "transport_error" &&
    outcome.error_code === "connection_failed";
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
  let qualificationInventoryAttempts = 0;
  let qualificationPrewarmAttempts = 0;
  let localAttemptOutcomes: SandboxSecurityReplayTransportOutcome<unknown>[] = [];
  let judgeAttemptOutcomes: SandboxSecurityReplayTransportOutcome<unknown>[] = [];
  let judgeOperation: "responses" | "chat_completions" | null = null;
  const events: CapturedProviderOutcome[] = [];
  const fail = (): never => {
    phase = "failed";
    throw new Error("capture_sink_invalid");
  };
  const sink: CaptureSink = Object.freeze({
    beginInput() {
      if (phase !== "ready" || closedInputs >= expectedInputs) fail();
      phase = "input";
      localAttemptOutcomes = [];
      judgeAttemptOutcomes = [];
      judgeOperation = null;
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
      } else if (
        provider === "openai" &&
        (operation === "responses" || operation === "chat_completions")
      ) {
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
        const attempt = qualificationInventoryAttempts;
        qualificationInventoryAttempts += 1;
        if (outcome.status !== "response") {
          if (
            attempt === 0 &&
            outcome.status === "transport_error" &&
            outcome.error_code === "connection_failed"
          ) {
            return;
          }
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
        const attempt = qualificationPrewarmAttempts;
        qualificationPrewarmAttempts += 1;
        if (outcome.status !== "response") {
          if (
            attempt === 0 &&
            outcome.status === "transport_error" &&
            outcome.error_code === "connection_failed"
          ) {
            return;
          }
          phase = "failed";
          return;
        }
        phase = "ready";
        return;
      }
      if (phase !== "input" || capturePhase !== "evaluation") fail();
      if (provider === "ollama" && operation === "chat") {
        const attempt = localAttemptOutcomes.length;
        if (
          attempt >= 2 ||
          (attempt === 1 && !isRetryableCaptureOutcome(localAttemptOutcomes[0]!))
        ) {
          fail();
        }
        localAttemptOutcomes.push(outcome);
        events.push(normalized);
        if (attempt === 0 && isRetryableCaptureOutcome(outcome)) return;
        if (outcome.status !== "response") phase = "failed";
        return;
      } else if (provider === "openai" && operation === "responses") {
        const attempt = judgeAttemptOutcomes.length;
        if (
          attempt >= 2 ||
          (attempt === 1 && !isRetryableCaptureOutcome(judgeAttemptOutcomes[0]!))
        ) {
          fail();
        }
        if (judgeOperation !== null && judgeOperation !== operation) fail();
        judgeOperation = operation;
        judgeAttemptOutcomes.push(outcome);
        events.push(normalized);
        if (attempt === 0 && isRetryableCaptureOutcome(outcome)) return;
        if (outcome.status !== "response") phase = "failed";
        return;
      } else if (
        provider === "openai" &&
        operation === "chat_completions"
      ) {
        const attempt = judgeAttemptOutcomes.length;
        if (
          attempt >= 2 ||
          (attempt === 1 && !isRetryableCaptureOutcome(judgeAttemptOutcomes[0]!))
        ) {
          fail();
        }
        if (judgeOperation !== null && judgeOperation !== operation) fail();
        judgeOperation = operation;
        judgeAttemptOutcomes.push(outcome);
        events.push(normalized);
        if (attempt === 0 && isRetryableCaptureOutcome(outcome)) return;
        if (outcome.status !== "response") phase = "failed";
        return;
      } else {
        fail();
      }
    },
    endInput() {
      if (phase !== "input") fail();
      if (localAttemptOutcomes.length === 0) {
        events.push(Object.freeze({
          capture_phase: "evaluation",
          provider: "ollama",
          operation: "chat",
          outcome: Object.freeze({ status: "not_called" })
        }));
      }
      if (judgeAttemptOutcomes.length === 0) {
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
  requestBody: Uint8Array,
  inspectPayload?: (payload: Readonly<{
    routed_obligations: readonly {
      obligation_id: string;
      category: string;
    }[];
  }>) => void
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
    routed_obligations: readonly {
      obligation_id: string;
      category: string;
    }[];
  };
  inspectPayload?.(payload);
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

function chatOpenAiWire(
  normalized: SandboxSecurityReplayOpenAIResponse,
  requestBody: Uint8Array
): Readonly<SandboxSecurityHttpResponse> {
  const requestEnvelope = JSON.parse(DECODER.decode(requestBody)) as {
    messages?: readonly { role?: unknown; content?: unknown }[];
  };
  const text = requestEnvelope.messages?.[1]?.content;
  if (typeof text !== "string") {
    throw new TypeError("replay_openai_chat_request_invalid");
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
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          logprobs: null,
          message: {
            content: JSON.stringify({
              schema_version: normalized.parsed.schema_version,
              obligation_results: obligationResults
            }),
            role: "assistant"
          }
        }
      ],
      created: 1,
      id: "chatcmpl-test",
      model: normalized.model,
      object: "chat.completion",
      system_fingerprint: null,
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2
      }
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
  retry_local_connection_failed?: boolean;
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
  let localAttempts = 0;
  let localConsumed = false;
  let judgeConsumed = false;
  let wrongThisCount = 0;
  const operations: string[] = [];
  const requests: SandboxSecurityHttpRequest[] = [];
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
      requests.push(request);
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
        if (input.retry_local_connection_failed && localAttempts === 0) {
          localAttempts += 1;
          throw namedTransportError(
            "sandbox_security_transport_connection_failed"
          );
        }
        localAttempts += 1;
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
      localAttempts = 0;
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
    requests,
    get qualification_consumed() {
      return phase === "ready" || phase === "input";
    },
    get wrong_this_count() {
      return wrongThisCount;
    }
  };
}

async function listen(server: Server): Promise<void> {
  throw new Error("fixed_listener_forbidden");
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function withProductionEnvironment(action: () => Promise<void>): Promise<void> {
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
  process.env.SANDBOX_SECURITY_JUDGE_PROTOCOL = "openai_responses_v1";
  process.env.SANDBOX_SECURITY_JUDGE_BASE_URL = "https://doro.lol/v1";
  process.env.SANDBOX_SECURITY_JUDGE_MODEL = "gpt-5.4-mini";
  process.env.SANDBOX_SECURITY_JUDGE_API_KEY = "benchmark-test-key";
  process.env.SANDBOX_SECURITY_ENABLE_JUDGE = "1";
  return action().finally(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("REQ-SBX-GENERAL-002 P6 retries qualification inventory connection failure once without advancing the stage", async () => {
  const requests: SandboxSecurityHttpRequest[] = [];
  let inventoryAttempts = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      requests.push(input);
      if (input.provider === "ollama" && input.operation === "model_inventory") {
        inventoryAttempts += 1;
        if (inventoryAttempts === 1) {
          throw namedTransportError(
            "sandbox_security_transport_connection_failed"
          );
        }
      }
      return liveResponse(input);
    }
  });
  const capture = createConformingCaptureSink();
  const runtime = runtimeHarness();

  await createLiveCaptureEngine(
    liveCaptureInput(runtime.runtime, capture.sink, transport)
  );

  assert.deepEqual(
    requests.map((request) => `${request.provider}:${request.operation}`),
    [
      "ollama:model_inventory",
      "ollama:model_inventory",
      "ollama:chat"
    ]
  );
  assert.equal(requests[0], requests[1]);
  assert.deepEqual(
    capture.events.map((event) => [
      event.capture_phase,
      event.provider,
      event.operation,
      event.outcome.status
    ]),
    [
      ["qualification", "ollama", "model_inventory", "transport_error"],
      ["qualification", "ollama", "model_inventory", "response"],
      ["qualification", "ollama", "chat", "response"]
    ]
  );
});

test("REQ-SBX-GENERAL-002 P6 retries from the normalized connection outcome after capture mutates the provider error", async () => {
  const firstFailure = namedTransportError(
    "sandbox_security_transport_connection_failed"
  );
  const requests: SandboxSecurityHttpRequest[] = [];
  const events: CapturedProviderOutcome[] = [];
  const sink: CaptureSink = Object.freeze({
    beginInput() {},
    record(value: Readonly<CapturedProviderOutcome>) {
      events.push(value);
      if (events.length === 1) {
        firstFailure.name = "sandbox_security_transport_response_too_large";
      }
    },
    endInput() {},
    assertDrained() {}
  });
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      requests.push(input);
      if (requests.length === 1) throw firstFailure;
      return liveResponse(input);
    }
  });

  await createLiveCaptureEngine(
    liveCaptureInput(runtimeHarness().runtime, sink, transport)
  );

  assert.equal(requests.length, 3);
  assert.equal(requests[0], requests[1]);
  assert.deepEqual(events.map((event) => event.outcome.status), [
    "transport_error",
    "response",
    "response"
  ]);
});

test("REQ-SBX-GENERAL-002 P6 retries each transient qualification, local, and Judge connection failure sequentially with the same request", async () => {
  const retryKeys = new Set([
    "ollama:model_inventory",
    "ollama:chat",
    "openai:responses"
  ]);
  const requests = new Map<string, SandboxSecurityHttpRequest[]>();
  const attempts = new Map<string, number>();
  const logicalAttempts = new Map<Readonly<SandboxSecurityHttpRequest>, number>();
  const inFlight = new Map<string, number>();
  const maxInFlight = new Map<string, number>();
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      const key = `${input.provider}:${input.operation}`;
      const keyRequests = requests.get(key) ?? [];
      keyRequests.push(input);
      requests.set(key, keyRequests);
      const logicalAttempt = (logicalAttempts.get(input) ?? 0) + 1;
      logicalAttempts.set(input, logicalAttempt);
      attempts.set(key, (attempts.get(key) ?? 0) + 1);
      const active = (inFlight.get(key) ?? 0) + 1;
      inFlight.set(key, active);
      maxInFlight.set(key, Math.max(maxInFlight.get(key) ?? 0, active));
      try {
        await Promise.resolve();
        if (logicalAttempt === 1 && retryKeys.has(key)) {
          throw namedTransportError(
            "sandbox_security_transport_connection_failed"
          );
        }
        return liveResponse(input);
      } finally {
        inFlight.set(key, active - 1);
      }
    }
  });
  const capture = createConformingCaptureSink();
  const runtime = runtimeHarness();
  const engine = await createLiveCaptureEngine(
    liveCaptureInput(runtime.runtime, capture.sink, transport)
  );

  capture.sink.beginInput();
  await engine.evaluate(evaluationRequest());
  capture.sink.endInput();
  capture.sink.assertDrained();

  assert.deepEqual([...attempts.entries()], [
    ["ollama:model_inventory", 2],
    ["ollama:chat", 4],
    ["openai:responses", 2]
  ]);
  for (const key of retryKeys) {
    const keyRequests = requests.get(key)!;
    assert.equal(keyRequests[0], keyRequests[1], key);
    assert.equal(maxInFlight.get(key), 1, key);
    if (key === "ollama:chat") {
      assert.equal(keyRequests[2], keyRequests[3], key);
      assert.equal(
        requestBody(keyRequests[0]!),
        requestBody(keyRequests[1]!),
        key
      );
      assert.equal(
        requestBody(keyRequests[2]!),
        requestBody(keyRequests[3]!),
        key
      );
    } else if (key === "openai:responses") {
      assert.equal(
        requestBody(keyRequests[0]!),
        requestBody(keyRequests[1]!),
        key
      );
    }
  }
  assert.deepEqual(
    capture.events.map((event) => [
      event.capture_phase,
      event.provider,
      event.operation,
      event.outcome.status
    ]),
    [
      ["qualification", "ollama", "model_inventory", "transport_error"],
      ["qualification", "ollama", "model_inventory", "response"],
      ["qualification", "ollama", "chat", "transport_error"],
      ["qualification", "ollama", "chat", "response"],
      ["evaluation", "ollama", "chat", "transport_error"],
      ["evaluation", "ollama", "chat", "response"],
      ["evaluation", "openai", "responses", "transport_error"],
      ["evaluation", "openai", "responses", "response"]
    ]
  );
});

test("REQ-SBX-GENERAL-002 P6 records the second connection failure and preserves its original provider error after two calls", async () => {
  const firstFailure = namedTransportError(
    "sandbox_security_transport_connection_failed"
  );
  const secondFailure = namedTransportError(
    "sandbox_security_transport_connection_failed"
  );
  assert.notEqual(firstFailure, secondFailure);
  let calls = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request() {
      calls += 1;
      throw calls === 1 ? firstFailure : secondFailure;
    }
  });
  const capture = createConformingCaptureSink();

  await assert.rejects(
    () =>
      createLiveCaptureEngine(
        liveCaptureInput(runtimeHarness().runtime, capture.sink, transport)
      ),
    (error: unknown) => {
      assert.equal(error, secondFailure);
      return true;
    }
  );

  assert.equal(calls, 2);
  assert.deepEqual(capture.events.map((event) => event.outcome), [
    { status: "transport_error", error_code: "connection_failed" },
    { status: "transport_error", error_code: "connection_failed" }
  ]);
});

test("REQ-SBX-GENERAL-002 P6 retries a transient Judge Chat Completions connection failure", async () => {
  const requests: SandboxSecurityHttpRequest[] = [];
  let judgeAttempts = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      requests.push(input);
      if (input.provider === "ollama" && input.operation === "model_inventory") {
        return inventoryWire(inventoryNormalized());
      }
      if (input.provider === "ollama" && input.operation === "chat") {
        return ollamaWire(ollamaNormalized());
      }
      if (input.provider === "openai" && input.operation === "chat_completions") {
        judgeAttempts += 1;
        if (judgeAttempts === 1) {
          throw namedTransportError(
            "sandbox_security_transport_connection_failed"
          );
        }
        return chatOpenAiWire(openAiNormalized(7), input.body);
      }
      throw new Error("unexpected_provider_request");
    }
  });
  const capture = createConformingCaptureSink();
  const engine = await createLiveCaptureEngine(
    liveCaptureInput(
      runtimeHarness().runtime,
      capture.sink,
      transport,
      "openai_chat_completions_json_v1"
    )
  );

  capture.sink.beginInput();
  await engine.evaluate(evaluationRequest());
  capture.sink.endInput();
  capture.sink.assertDrained();

  const judgeRequests = requests.filter(
    (input) => input.provider === "openai"
  );
  assert.equal(judgeAttempts, 2);
  assert.deepEqual(
    judgeRequests.map((input) => input.operation),
    ["chat_completions", "chat_completions"]
  );
  assert.equal(judgeRequests[0], judgeRequests[1]);
  assert.equal(judgeRequests[0]?.body, judgeRequests[1]?.body);
  assert.deepEqual(
    capture.events
      .filter((event) => event.provider === "openai")
      .map((event) => [event.operation, event.outcome.status]),
    [
      ["chat_completions", "transport_error"],
      ["chat_completions", "response"]
    ]
  );
});

test("REQ-SBX-GENERAL-002 P6 does not retry HTTP, malformed, oversized, or timed-out provider failures", async () => {
  const cases: readonly Readonly<{
    name: string;
    request(input: Readonly<SandboxSecurityHttpRequest>): Promise<Readonly<SandboxSecurityHttpResponse>>;
    outcome: Readonly<Record<string, unknown>>;
  }>[] = [
    {
      name: "http_non_200",
      async request() {
        return Object.freeze({
          status: 503,
          content_type: "application/json",
          body: ENCODER.encode("{}")
        });
      },
      outcome: { status: "http_error", http_status: 503 }
    },
    {
      name: "provider_response_invalid",
      async request() {
        return Object.freeze({
          status: 200,
          content_type: "application/json",
          body: ENCODER.encode("{")
        });
      },
      outcome: {
        status: "transport_error",
        error_code: "provider_response_invalid"
      }
    },
    {
      name: "response_too_large",
      async request() {
        throw namedTransportError(
          "sandbox_security_transport_response_too_large"
        );
      },
      outcome: {
        status: "transport_error",
        error_code: "response_too_large"
      }
    },
    {
      name: "slot_timeout",
      async request() {
        throw namedTransportError("sandbox_security_transport_aborted");
      },
      outcome: {
        status: "signal_termination",
        termination_reason: "slot_timeout"
      }
    }
  ];

  for (const scenario of cases) {
    let calls = 0;
    const transport: SandboxSecurityHttpTransport = Object.freeze({
      async request(input: Readonly<SandboxSecurityHttpRequest>) {
        calls += 1;
        return scenario.request(input);
      }
    });
    const capture = createRecordingCaptureSink();

    await assert.rejects(() =>
      createLiveCaptureEngine(
        liveCaptureInput(runtimeHarness().runtime, capture.sink, transport)
      )
    );

    assert.equal(calls, 1, scenario.name);
    assert.deepEqual(capture.events.map((event) => event.outcome), [
      scenario.outcome
    ], scenario.name);
  }
});

test("REQ-SBX-GENERAL-002 P6 does not retry qualification digest or semantic failures after a normalized response", async () => {
  const otherDigest = `sha256:${"b".repeat(64)}`;
    const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      if (input.provider === "ollama" && input.operation === "model_inventory") {
        return inventoryWire(
          normalizeSandboxSecurityReplayOllamaInventoryResponse({
            model: "qwen3:8b",
            digest: otherDigest
          })
        );
      }
      throw new Error("unexpected_provider_request");
    }
  });
  const capture = createRecordingCaptureSink();
  let calls = 0;
  const countedTransport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      calls += 1;
      return transport.request(input);
    }
  });

  await assert.rejects(() =>
    createLiveCaptureEngine(
      liveCaptureInput(runtimeHarness().runtime, capture.sink, countedTransport)
    )
  );

  assert.equal(calls, 1);
  assert.deepEqual(capture.events.map((event) => event.outcome.status), [
    "response"
  ]);
});

test("REQ-SBX-GENERAL-002 P6 does not retry slot timeout, work budget, or caller cancellation", async () => {
  const cases: readonly Readonly<{
    name: "slot_timeout" | "work_budget" | "caller_cancelled";
    runtime: ReturnType<typeof runtimeHarness>;
    caller?: AbortController;
  }>[] = [
    {
      name: "slot_timeout",
      runtime: runtimeHarness({ fire_evaluation_timeout_at: 3 })
    },
    {
      name: "work_budget",
      runtime: runtimeHarness({
        fire_evaluation_timeout_at: 3,
        force_work_budget_at_schedule: 3
      })
    },
    {
      name: "caller_cancelled",
      runtime: runtimeHarness(),
      caller: new AbortController()
    }
  ];

  for (const scenario of cases) {
    let chatCalls = 0;
    const transport: SandboxSecurityHttpTransport = Object.freeze({
      async request(input: Readonly<SandboxSecurityHttpRequest>) {
        if (input.provider === "ollama" && input.operation === "chat") {
          chatCalls += 1;
          if (chatCalls === 1) return liveResponse(input);
          if (scenario.name === "caller_cancelled") {
            scenario.caller!.abort("caller_cancelled");
          }
          if (input.signal.aborted) {
            throw namedTransportError("sandbox_security_transport_aborted");
          }
          return liveResponse(input);
        }
        return liveResponse(input);
      }
    });
    const capture = createRecordingCaptureSink();
    const engine = await createLiveCaptureEngine(
      liveCaptureInput(scenario.runtime.runtime, capture.sink, transport)
    );

    try {
      await engine.evaluate(
        evaluationRequest(),
        scenario.caller?.signal
      );
    } catch {
      // Caller cancellation is expected to reject; timeout outcomes are
      // converted into the engine's content-free decision state.
    }

    assert.equal(chatCalls, 2, scenario.name);
    const localEvents = capture.events.filter(
      (event) =>
        event.capture_phase === "evaluation" &&
        event.provider === "ollama" &&
        event.operation === "chat"
    );
    if (scenario.name === "caller_cancelled") {
      assert.deepEqual(localEvents, [], scenario.name);
    } else {
      assert.deepEqual(localEvents.map((event) => event.outcome), [
        {
          status: "signal_termination",
          termination_reason: scenario.name
        }
      ], scenario.name);
    }
  }
});

test("REQ-SBX-GENERAL-002 live composition captures qualification before return then anonymous evaluation slots", async () => {
  const operations: string[] = [];
  let judgeCategories: string[] = [];
  const transport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      operations.push(`${input.provider}:${input.operation}`);
      if (input.provider === "ollama" && input.operation === "model_inventory") {
        return Object.freeze({
          status: 200,
          content_type: "application/json",
          body: new TextEncoder().encode(JSON.stringify({
            models: [
              {
                name: "qwen3:8b",
                model: "qwen3:8b",
                digest: DIGEST.slice("sha256:".length)
              }
            ]
          }))
        });
      }
      if (input.provider === "ollama" && input.operation === "chat") {
        return Object.freeze({
          status: 200,
          content_type: "application/json",
          body: new TextEncoder().encode(JSON.stringify({
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
          })),
          verified_ollama_digest: DIGEST
        });
      }
      if (input.provider === "openai" && input.operation === "responses") {
        return openAiWire(openAiNormalized(7), input.body, (payload) => {
          judgeCategories = payload.routed_obligations.map(
            (obligation) => obligation.category
          );
        });
      }
      throw new Error("unexpected_provider_request");
    }
  });
  const runtime = runtimeHarness();
  const capture = createConformingCaptureSink();
  const engine = await createLiveCaptureEngine({
    runtime: runtime.runtime,
    capture_sink: capture.sink,
    transport: transport as SandboxSecurityHttpTransport,
    judge_protocol_id: "openai_responses_v1",
    ollama_digest: DIGEST,
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: "https://unused.example.test/v1",
    judge_endpoint_url: "https://unused.example.test/v1/responses",
    judge_requested_model: "gpt-5.4-mini"
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

  assert.deepEqual(
    capture.events.slice(2).map((event) => [
      event.provider,
      event.operation,
      event.outcome.status
    ]),
    [
      ["ollama", "chat", "response"],
      ["openai", "responses", "response"]
    ]
  );
  assert.deepEqual(operations, [
    "ollama:model_inventory",
    "ollama:chat",
    "ollama:chat",
    "openai:responses"
  ]);
  assert.deepEqual(judgeCategories.sort(), [
    "instruction_override",
    "jailbreak",
    "privilege_escalation",
    "prompt_injection",
    "sensitive_data_exposure",
    "trust_boundary_violation",
    "unsafe_side_effect"
  ]);
  assert.deepEqual(runtime.delays, [40000, 100, 60000, 300000]);
  assert.equal(runtime.cancellation_count, 4);
});

test("REQ-SBX-GENERAL-002 live composition tests do not bind a fixed 11434 listener", () => {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  assert.doesNotMatch(source, /listen\(\s*11434\b/);
});

test("REQ-SBX-GENERAL-002 replay consumes inventory and prewarm before returning an Engine", async () => {
  const runtime = runtimeHarness();
  const unit: AnonymousReplayUnit = Object.freeze({
    ollama: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    ),
    openai: responseOutcome(
      openAiNormalized(7),
      normalizeSandboxSecurityReplayOpenAIResponse
    )
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
    "ollama:chat",
    "openai:responses"
  ]);
  assert.equal(replay.wrong_this_count, 0);
  assert.deepEqual(runtime.delays, [1000, 100, 1000, 4000]);
  assert.equal(runtime.cancellation_count, 4);
});

test("REQ-SBX-GENERAL-002 hermetic replay facade retries one recorded local connection failure with the same request", async () => {
  const runtime = runtimeHarness();
  const unit: AnonymousReplayUnit = Object.freeze({
    ollama: responseOutcome(
      ollamaNormalized(),
      normalizeSandboxSecurityReplayOllamaResponse
    ),
    openai: responseOutcome(
      openAiNormalized(7),
      normalizeSandboxSecurityReplayOpenAIResponse
    )
  });
  const replay = createConformingReplayTransport({
    units: [unit],
    retry_local_connection_failed: true
  });

  const engine = await createHermeticReplayEngine({
    runtime: runtime.runtime,
    replay_transport: replay.transport,
    sealed_config: sealedConfig()
  });

  const evaluationRequestStart = replay.requests.length;
  replay.transport.beginInput();
  await engine.evaluate(evaluationRequest());
  replay.transport.endInput();
  replay.transport.assertDrained();

  const localRequests = replay.requests.slice(evaluationRequestStart).filter(
    (request) => request.provider === "ollama" && request.operation === "chat"
  );
  assert.equal(localRequests.length, 2);
  assert.equal(localRequests[0], localRequests[1]);
  assert.deepEqual(
    requestBody(localRequests[0]!),
    requestBody(localRequests[1]!)
  );
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
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      if (input.provider === "ollama" && input.operation === "model_inventory") {
        return Object.freeze({
          status: 200,
          content_type: "application/json",
          body: new TextEncoder().encode(JSON.stringify({ provider_prose: rawSentinel }))
        });
      }
      throw new Error("unexpected_provider_request");
    }
  });
  const capture = createConformingCaptureSink();
  let thrown: unknown;
  try {
    await createLiveCaptureEngine({
      runtime: runtimeHarness().runtime,
      capture_sink: capture.sink,
      transport,
      judge_protocol_id: "openai_responses_v1",
      ollama_digest: DIGEST,
      judge_endpoint_policy_id: "operator_https_fqdn_v1",
      judge_base_url: "https://unused.example.test/v1",
      judge_endpoint_url: "https://unused.example.test/v1/responses",
      judge_requested_model: "gpt-5.4-mini"
    });
  } catch (error) {
    thrown = error;
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
  const failure = new Error("sandbox_security_transport_connection_failed");
  failure.name = "sandbox_security_transport_connection_failed";
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request() {
      throw failure;
    }
  });
  let thrown: unknown;
  try {
    await createLiveCaptureEngine({
      runtime: runtimeHarness().runtime,
      capture_sink: capture.sink,
      transport,
      judge_protocol_id: "openai_responses_v1",
      ollama_digest: DIGEST,
      judge_endpoint_policy_id: "operator_https_fqdn_v1",
      judge_base_url: "https://unused.example.test/v1",
      judge_endpoint_url: "https://unused.example.test/v1/responses",
      judge_requested_model: "gpt-5.4-mini"
    });
  } catch (error) {
    thrown = error;
  }

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
    },
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
  const failure = new Error("sandbox_security_transport_connection_failed");
  failure.name = "sandbox_security_transport_connection_failed";
  let calls = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request() {
      calls += 1;
      throw failure;
    }
  });
  let thrown: unknown;
  try {
    await createLiveCaptureEngine({
      runtime: runtimeHarness().runtime,
      capture_sink: sink,
      transport,
      judge_protocol_id: "openai_responses_v1",
      ollama_digest: DIGEST,
      judge_endpoint_policy_id: "operator_https_fqdn_v1",
      judge_base_url: "https://unused.example.test/v1",
      judge_endpoint_url: "https://unused.example.test/v1/responses",
      judge_requested_model: "gpt-5.4-mini"
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.notEqual(thrown, recordSentinel);
  assert.equal(thrown.name, "sandbox_security_transport_connection_failed");
  assert.equal(calls, 1);
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
    "createSandboxSecurityLiveCaptureEngine",
    "resolveSandboxSecurityBenchmarkJudgeProtocolDispatch"
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
    "resolveSandboxSecurityBenchmarkJudgeProtocolDispatch",
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
    { judge_protocol_id: "unknown_protocol" },
    { judge_endpoint_policy_id: "unknown_policy" },
    { judge_base_url: "https://127.0.0.1/v1" },
    { judge_endpoint_url: "https://us.doro.lol/v1/not-responses" },
    { judge_binding_sha256: "a".repeat(64) },
    { judge_requested_model: "-bad" },
    { local_prompt_version: "sandbox-security-ollama-local-prompt.v1" },
    { local_schema_version: "sandbox-security-local-model.v2" },
    { judge_prompt_version: "sandbox-security-openai-judge-prompt.v3" },
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

test("REQ-SBX-GENERAL-002 live capture rejects missing runtime Judge binding before provider effects", async () => {
  let requestCount = 0;
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request() {
      requestCount += 1;
      throw new Error("provider_effect_forbidden");
    }
  });

  await assert.rejects(
    () =>
      createLiveCaptureEngine({
        runtime: runtimeHarness().runtime,
        capture_sink: createConformingCaptureSink().sink,
        transport,
        judge_protocol_id: "openai_responses_v1",
        ollama_digest: DIGEST,
        judge_endpoint_policy_id: "operator_https_fqdn_v1"
      } as never),
    { name: "sandbox_security_benchmark_composition_invalid" }
  );
  assert.equal(requestCount, 0);
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
    "./judge-protocol-adapter.ts",
    "./ollama-contract.ts",
    "./ollama-local-detector.ts",
    "./openai-chat-judge-contract.ts",
    "./openai-judge-contract.ts",
    "./p6-live-capture-profile.ts",
    "./production-config.ts",
    "./provider-outcomes.ts",
    "./rule-catalog.ts",
    "node:crypto"
  ]);
  assert.match(source, /createSandboxSecurityProductionCompositionWithPorts/u);
  assert.match(
    source,
    /createSandboxSecurityProductionLiveCaptureCompositionWithPorts/u
  );
  assert.match(source, /qualifySandboxSecurityP6LiveCaptureOllama/u);
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

  const p6OnlySymbolImporters: Readonly<Record<string, readonly string[]>> = {
    createSandboxSecurityProductionLiveCaptureCompositionWithPorts: [
      "security-production/composition.ts"
    ],
    qualifySandboxSecurityP6LiveCaptureOllama: [
      "security-production/ollama-local-detector.ts"
    ],
    resolveSandboxSecurityP6LiveCapturePolicyProfile: [],
    SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING: [
      "security-production/composition.ts",
      "security-production/ollama-local-detector.ts",
      "security-production/p6-live-capture-profile.ts"
    ]
  };
  for (const [symbol, expectedImporters] of Object.entries(
    p6OnlySymbolImporters
  )) {
    const p6Importers: string[] = [];
    for (const path of listTypeScriptFiles(resolve(PRODUCTION_ROOT, ".."))) {
      const text = readFileSync(path, "utf8");
      if (path !== sourcePath && text.includes(symbol)) {
        p6Importers.push(relative(resolve(PRODUCTION_ROOT, ".."), path));
      }
    }
    assert.deepEqual(p6Importers, expectedImporters);
  }
  assert.equal(dirname(sourcePath), PRODUCTION_ROOT);
});

test("REQ-SBX-GENERAL-002 sealed config field inventory and constants are exact", () => {
  assert.deepEqual(Object.keys(sealedConfig()), [
    "ollama_model",
    "ollama_digest",
    "judge_protocol_id",
    "judge_endpoint_policy_id",
    "judge_base_url",
    "judge_endpoint_url",
    "judge_requested_model",
    "judge_resolved_model",
    "judge_binding_sha256",
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
    model: "gpt-5.4-mini",
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
