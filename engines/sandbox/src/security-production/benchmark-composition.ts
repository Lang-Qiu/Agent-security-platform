import {
  type RawLocalDetector,
  type SandboxSecurityEngine,
  type SandboxSecurityRuntimePorts,
  type SandboxSecuritySanitizedJudgePayload
} from "../security/index.ts";
import {
  createSandboxSecurityProductionCompositionWithPorts,
  type SandboxSecurityProductionCompositionPorts
} from "./composition.ts";
import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "./deterministic-sanitizer.ts";
import {
  createSandboxSecurityExternalPipeline
} from "./external-pipeline.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION,
  parseSandboxSecurityOllamaChatResponse
} from "./ollama-contract.ts";
import {
  createSandboxSecurityOllamaLocalDetector,
  qualifySandboxSecurityOllama
} from "./ollama-local-detector.ts";
import {
  SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION,
  parseSandboxSecurityOpenAiJudgeResponse
} from "./openai-judge-contract.ts";
import {
  createSandboxSecurityProductionConfig,
  createSandboxSecurityProductionTransport,
  type SandboxSecurityProductionConfig
} from "./production-config.ts";
import {
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  normalizeSandboxSecurityReplayOllamaResponse,
  normalizeSandboxSecurityReplayOpenAIResponse,
  normalizeSandboxSecurityReplayOutcome,
  type SandboxSecurityReplayOllamaInventoryResponse,
  type SandboxSecurityReplayOllamaResponse,
  type SandboxSecurityReplayOpenAIResponse,
  type SandboxSecurityReplayTransportOutcome
} from "./provider-outcomes.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "./rule-catalog.ts";

export interface SandboxSecurityCaptureSink {
  beginInput(): void;
  record(
    outcome: Readonly<SandboxSecurityCapturedProviderOutcome>
  ): void;
  endInput(): void;
  assertDrained(): void;
}

export interface SandboxSecurityReplayTransport
  extends SandboxSecurityHttpTransport {
  beginInput(): void;
  endInput(): void;
  assertDrained(): void;
}

export type SandboxSecurityCapturedProviderOutcome =
  | {
      capture_phase: "qualification";
      provider: "ollama";
      operation: "model_inventory";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaInventoryResponse
      >;
    }
  | {
      capture_phase: "qualification" | "evaluation";
      provider: "ollama";
      operation: "chat";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaResponse
      >;
    }
  | {
      capture_phase: "evaluation";
      provider: "openai";
      operation: "responses";
      outcome: SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOpenAIResponse
      >;
    };

export interface SandboxSecuritySealedProviderConfig {
  ollama_model: "qwen3:8b";
  ollama_digest: string;
  judge_provider_id: string;
  judge_base_url: string;
  judge_responses_url: string;
  judge_requested_model: string;
  judge_resolved_model: string;
  local_prompt_version: "sandbox-security-ollama-local-prompt.v1";
  local_schema_version: "sandbox-security-local-model.v1";
  judge_prompt_version: "sandbox-security-openai-judge-prompt.v1";
  judge_schema_version: "sandbox-security-judge.v1";
  rule_catalog_version: string;
  sanitizer_version: string;
}

type CaptureRecordMethod = (
  outcome: Readonly<SandboxSecurityCapturedProviderOutcome>
) => void;

interface NormalizedCaptureSink {
  readonly value: SandboxSecurityCaptureSink;
  readonly record: CaptureRecordMethod;
}

interface NormalizedReplayTransport {
  readonly value: SandboxSecurityReplayTransport;
  readonly request: SandboxSecurityReplayTransport["request"];
}

const INVALID = "sandbox_security_benchmark_composition_invalid";
const NORMALIZED_DIGEST = /^sha256:[a-f0-9]{64}$/;
const LOCAL_SCHEMA_VERSION = "sandbox-security-local-model.v1";
const JUDGE_SCHEMA_VERSION = "sandbox-security-judge.v1";
const JUDGE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const JUDGE_PROVIDER_ALLOWLIST = Object.freeze({
  doro: Object.freeze({
    base_url: "https://doro.lol/v1",
    responses_url: "https://doro.lol/v1/responses"
  })
});
const RUNTIME_METHODS = [
  "now",
  "nextDecisionId",
  "monotonicNowMs",
  "scheduleTimeout"
] as const;
const CAPTURE_SINK_METHODS = Object.freeze(Object.keys({
  beginInput: true,
  record: true,
  endInput: true,
  assertDrained: true
}));
const REPLAY_TRANSPORT_METHODS = [
  "request",
  "beginInput",
  "endInput",
  "assertDrained"
] as const;
const DECODER = new TextDecoder("utf-8", { fatal: true });
const ABORT_SIGNAL_REASON_GETTER = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason"
)?.get;

function invalid(): never {
  const error = new TypeError(INVALID);
  error.name = INVALID;
  throw error;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): ReadonlyMap<string, unknown> {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return invalid();
    }
    const values = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return invalid();
      }
      values.set(key, descriptor.value);
    }
    if (
      values.size !== expectedKeys.length ||
      expectedKeys.some((key) => !values.has(key))
    ) {
      return invalid();
    }
    return values;
  } catch {
    return invalid();
  }
}

function normalizedRuntime(value: unknown): SandboxSecurityRuntimePorts {
  const values = exactDataRecord(value, RUNTIME_METHODS);
  for (const method of RUNTIME_METHODS) {
    if (typeof values.get(method) !== "function") return invalid();
  }
  return Object.freeze({
    now: values.get("now") as SandboxSecurityRuntimePorts["now"],
    nextDecisionId: values.get(
      "nextDecisionId"
    ) as SandboxSecurityRuntimePorts["nextDecisionId"],
    monotonicNowMs: values.get(
      "monotonicNowMs"
    ) as SandboxSecurityRuntimePorts["monotonicNowMs"],
    scheduleTimeout: values.get(
      "scheduleTimeout"
    ) as SandboxSecurityRuntimePorts["scheduleTimeout"]
  });
}

function normalizedCaptureSink(value: unknown): NormalizedCaptureSink {
  const values = exactDataRecord(value, CAPTURE_SINK_METHODS);
  for (const method of CAPTURE_SINK_METHODS) {
    if (typeof values.get(method) !== "function") return invalid();
  }
  return Object.freeze({
    value: value as SandboxSecurityCaptureSink,
    record: values.get(CAPTURE_SINK_METHODS[1]!) as CaptureRecordMethod
  });
}

function normalizedReplayTransport(
  value: unknown
): NormalizedReplayTransport {
  const values = exactDataRecord(value, REPLAY_TRANSPORT_METHODS);
  for (const method of REPLAY_TRANSPORT_METHODS) {
    if (typeof values.get(method) !== "function") return invalid();
  }
  return Object.freeze({
    value: value as SandboxSecurityReplayTransport,
    request: values.get(
      "request"
    ) as SandboxSecurityReplayTransport["request"]
  });
}

function normalizedSealedConfig(
  value: unknown
): Readonly<SandboxSecuritySealedProviderConfig> {
  const values = exactDataRecord(value, [
    "ollama_model",
    "ollama_digest",
    "judge_provider_id",
    "judge_base_url",
    "judge_responses_url",
    "judge_requested_model",
    "judge_resolved_model",
    "local_prompt_version",
    "local_schema_version",
    "judge_prompt_version",
    "judge_schema_version",
    "rule_catalog_version",
    "sanitizer_version"
  ]);
  const digest = values.get("ollama_digest");
  const providerId = values.get("judge_provider_id");
  const baseUrl = values.get("judge_base_url");
  const responsesUrl = values.get("judge_responses_url");
  const requestedModel = values.get("judge_requested_model");
  const resolvedModel = values.get("judge_resolved_model");
  const allowlisted =
    typeof providerId === "string" &&
    Object.prototype.hasOwnProperty.call(JUDGE_PROVIDER_ALLOWLIST, providerId)
      ? JUDGE_PROVIDER_ALLOWLIST[providerId as keyof typeof JUDGE_PROVIDER_ALLOWLIST]
      : null;
  if (
    values.get("ollama_model") !== "qwen3:8b" ||
    typeof digest !== "string" ||
    !NORMALIZED_DIGEST.test(digest) ||
    allowlisted === null ||
    baseUrl !== allowlisted.base_url ||
    responsesUrl !== allowlisted.responses_url ||
    typeof requestedModel !== "string" ||
    !JUDGE_MODEL.test(requestedModel) ||
    typeof resolvedModel !== "string" ||
    !JUDGE_MODEL.test(resolvedModel) ||
    values.get("local_prompt_version") !==
      SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION ||
    values.get("local_schema_version") !== LOCAL_SCHEMA_VERSION ||
    values.get("judge_prompt_version") !==
      SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION ||
    values.get("judge_schema_version") !== JUDGE_SCHEMA_VERSION ||
    values.get("rule_catalog_version") !==
      SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION ||
    values.get("sanitizer_version") !==
      SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
  ) {
    return invalid();
  }
  return Object.freeze({
    ollama_model: "qwen3:8b",
    ollama_digest: digest,
    judge_provider_id: providerId as string,
    judge_base_url: allowlisted.base_url,
    judge_responses_url: allowlisted.responses_url,
    judge_requested_model: requestedModel,
    judge_resolved_model: resolvedModel,
    local_prompt_version: SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION,
    local_schema_version: LOCAL_SCHEMA_VERSION,
    judge_prompt_version: SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION,
    judge_schema_version: JUDGE_SCHEMA_VERSION,
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
  });
}

function normalizedLiveInput(value: unknown): Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  capture_sink: NormalizedCaptureSink;
}> {
  const values = exactDataRecord(value, ["runtime", "capture_sink"]);
  return Object.freeze({
    runtime: normalizedRuntime(values.get("runtime")),
    capture_sink: normalizedCaptureSink(values.get("capture_sink"))
  });
}

function normalizedReplayInput(value: unknown): Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  replay_transport: NormalizedReplayTransport;
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}> {
  const values = exactDataRecord(value, [
    "runtime",
    "replay_transport",
    "sealed_config"
  ]);
  const sealedConfig = normalizedSealedConfig(values.get("sealed_config"));
  return Object.freeze({
    sealed_config: sealedConfig,
    runtime: normalizedRuntime(values.get("runtime")),
    replay_transport: normalizedReplayTransport(
      values.get("replay_transport")
    )
  });
}

function responseValues(
  value: unknown,
  request: Readonly<SandboxSecurityHttpRequest>
): ReadonlyMap<string, unknown> {
  let status: unknown;
  try {
    if (typeof value !== "object" || value === null) return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, "status");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return invalid();
    }
    status = descriptor.value;
  } catch {
    return invalid();
  }
  if (request.provider === "ollama" && request.operation === "chat") {
    return exactDataRecord(
      value,
      status === 200
        ? ["status", "content_type", "body", "verified_ollama_digest"]
        : ["status", "content_type", "body"]
    );
  }
  return exactDataRecord(value, ["status", "content_type", "body"]);
}

function inventoryResponse(
  body: Uint8Array
): SandboxSecurityReplayOllamaInventoryResponse {
  const parsed = JSON.parse(DECODER.decode(body)) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return invalid();
  }
  const models = Object.getOwnPropertyDescriptor(parsed, "models");
  if (
    models === undefined ||
    !("value" in models) ||
    !Array.isArray(models.value) ||
    Object.getPrototypeOf(models.value) !== Array.prototype
  ) {
    return invalid();
  }
  const matches = (models.value as unknown[]).filter((candidate) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate) ||
      Object.getPrototypeOf(candidate) !== Object.prototype
    ) {
      return false;
    }
    const name = Object.getOwnPropertyDescriptor(candidate, "name");
    const model = Object.getOwnPropertyDescriptor(candidate, "model");
    return (
      name !== undefined &&
      "value" in name &&
      name.value === "qwen3:8b" &&
      model !== undefined &&
      "value" in model &&
      model.value === "qwen3:8b"
    );
  });
  if (matches.length !== 1) return invalid();
  const match = matches[0] as Record<string, unknown>;
  if (Object.hasOwn(match, "remote_model") || Object.hasOwn(match, "remote_host")) {
    return invalid();
  }
  const digest = Object.getOwnPropertyDescriptor(match, "digest");
  if (
    digest === undefined ||
    !("value" in digest) ||
    typeof digest.value !== "string"
  ) {
    return invalid();
  }
  return normalizeSandboxSecurityReplayOllamaInventoryResponse({
    model: "qwen3:8b",
    digest: `sha256:${digest.value}`
  });
}

function openAiObligationIds(body: Uint8Array): readonly string[] {
  const envelope = JSON.parse(DECODER.decode(body)) as {
    input?: readonly {
      role?: unknown;
      content?: readonly { type?: unknown; text?: unknown }[];
    }[];
  };
  const user = envelope.input?.[1];
  const text = user?.content?.[0]?.text;
  if (
    user?.role !== "user" ||
    user.content?.[0]?.type !== "input_text" ||
    typeof text !== "string"
  ) {
    return invalid();
  }
  const start = "BEGIN_SANITIZED_PAYLOAD\n";
  const end = "\nEND_SANITIZED_PAYLOAD";
  if (!text.startsWith(start) || !text.endsWith(end)) return invalid();
  const payload = JSON.parse(text.slice(start.length, -end.length)) as {
    routed_obligations?: readonly { obligation_id?: unknown }[];
  };
  if (!Array.isArray(payload.routed_obligations)) return invalid();
  return payload.routed_obligations.map((obligation) => {
    if (
      typeof obligation !== "object" ||
      obligation === null ||
      typeof obligation.obligation_id !== "string"
    ) {
      return invalid();
    }
    return obligation.obligation_id;
  });
}

function normalizedOpenAiResponse(
  body: Uint8Array,
  obligationIds: readonly string[]
): SandboxSecurityReplayOpenAIResponse {
  const payload = {
    routed_obligations: obligationIds.map((obligation_id) => ({
      obligation_id
    }))
  } as unknown as Readonly<SandboxSecuritySanitizedJudgePayload>;
  const parsed = parseSandboxSecurityOpenAiJudgeResponse(body, payload);
  const ordinalById = new Map(
    obligationIds.map((obligationId, index) => [obligationId, index + 1])
  );
  return normalizeSandboxSecurityReplayOpenAIResponse({
    model: parsed.model,
    status: parsed.status,
    parsed: {
      schema_version: JUDGE_SCHEMA_VERSION,
      obligation_results: parsed.obligation_results.map((result) => {
        const obligationOrdinal = ordinalById.get(result.obligation_id);
        if (obligationOrdinal === undefined) return invalid();
        return {
          obligation_ordinal: obligationOrdinal,
          outcome: result.outcome,
          confidence: result.confidence,
          severity: result.severity
        };
      })
    }
  });
}

function outcomeNormalizer(
  request: Readonly<SandboxSecurityHttpRequest>
): (value: unknown) =>
  | SandboxSecurityReplayOllamaInventoryResponse
  | SandboxSecurityReplayOllamaResponse
  | SandboxSecurityReplayOpenAIResponse {
  if (request.provider === "ollama" && request.operation === "model_inventory") {
    return normalizeSandboxSecurityReplayOllamaInventoryResponse;
  }
  if (request.provider === "ollama" && request.operation === "chat") {
    return normalizeSandboxSecurityReplayOllamaResponse;
  }
  return normalizeSandboxSecurityReplayOpenAIResponse;
}

function responseOutcome(
  request: Readonly<SandboxSecurityHttpRequest>,
  response: unknown,
  obligationIds: readonly string[] | undefined
): SandboxSecurityReplayTransportOutcome<
  | SandboxSecurityReplayOllamaInventoryResponse
  | SandboxSecurityReplayOllamaResponse
  | SandboxSecurityReplayOpenAIResponse
> {
  try {
    const values = responseValues(response, request);
    const status = values.get("status");
    if (
      typeof status !== "number" ||
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599
    ) {
      return invalid();
    }
    if (status !== 200) {
      return normalizeSandboxSecurityReplayOutcome(
        { status: "http_error", http_status: status },
        outcomeNormalizer(request)
      );
    }
    if (
      values.get("content_type") !== "application/json" ||
      !(values.get("body") instanceof Uint8Array)
    ) {
      return invalid();
    }
    let normalizedResponse:
      | SandboxSecurityReplayOllamaInventoryResponse
      | SandboxSecurityReplayOllamaResponse
      | SandboxSecurityReplayOpenAIResponse;
    if (request.provider === "ollama" && request.operation === "model_inventory") {
      normalizedResponse = inventoryResponse(values.get("body") as Uint8Array);
    } else if (request.provider === "ollama" && request.operation === "chat") {
      const digest = values.get("verified_ollama_digest");
      if (typeof digest !== "string") return invalid();
      normalizedResponse = parseSandboxSecurityOllamaChatResponse(
        values.get("body") as Uint8Array,
        digest
      );
    } else {
      if (obligationIds === undefined) return invalid();
      normalizedResponse = normalizedOpenAiResponse(
        values.get("body") as Uint8Array,
        obligationIds
      );
    }
    return normalizeSandboxSecurityReplayOutcome(
      {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: normalizedResponse
      },
      outcomeNormalizer(request)
    );
  } catch {
    return normalizeSandboxSecurityReplayOutcome(
      {
        status: "transport_error",
        error_code: "provider_response_invalid"
      },
      outcomeNormalizer(request)
    );
  }
}

function errorName(value: unknown): string | null {
  try {
    if (
      (typeof value !== "object" && typeof value !== "function") ||
      value === null
    ) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "name");
    return descriptor !== undefined &&
      "value" in descriptor &&
      typeof descriptor.value === "string"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

function signalReason(signal: AbortSignal): unknown {
  try {
    return ABORT_SIGNAL_REASON_GETTER === undefined
      ? undefined
      : Reflect.apply(ABORT_SIGNAL_REASON_GETTER, signal, []);
  } catch {
    return undefined;
  }
}

function failureOutcome(
  request: Readonly<SandboxSecurityHttpRequest>,
  error: unknown,
  capturePhase: "qualification" | "evaluation"
): SandboxSecurityReplayTransportOutcome<
  | SandboxSecurityReplayOllamaInventoryResponse
  | SandboxSecurityReplayOllamaResponse
  | SandboxSecurityReplayOpenAIResponse
> | null {
  const name = errorName(error);
  let outcome: unknown;
  if (name === "sandbox_security_transport_connection_failed") {
    outcome = { status: "transport_error", error_code: "connection_failed" };
  } else if (name === "sandbox_security_transport_response_too_large") {
    outcome = { status: "transport_error", error_code: "response_too_large" };
  } else if (name === "sandbox_security_transport_aborted") {
    const reason = signalReason(request.signal);
    if (reason === "caller_cancelled") return null;
    outcome = {
      status: "signal_termination",
      termination_reason: reason === "work_budget"
        ? "work_budget"
        : "slot_timeout"
    };
  } else {
    outcome = {
      status: "transport_error",
      error_code: "provider_response_invalid"
    };
  }
  void capturePhase;
  return normalizeSandboxSecurityReplayOutcome(
    outcome,
    outcomeNormalizer(request)
  );
}

function capturePhase(
  state: "qualification_inventory" | "qualification_prewarm" | "evaluation",
  request: Readonly<SandboxSecurityHttpRequest>
): "qualification" | "evaluation" {
  if (state === "qualification_inventory") {
    if (request.provider !== "ollama" || request.operation !== "model_inventory") {
      return invalid();
    }
    return "qualification";
  }
  if (state === "qualification_prewarm") {
    if (request.provider !== "ollama" || request.operation !== "chat") {
      return invalid();
    }
    return "qualification";
  }
  if (
    (request.provider === "ollama" && request.operation === "chat") ||
    (request.provider === "openai" && request.operation === "responses")
  ) {
    return "evaluation";
  }
  return invalid();
}

function capturedRecord(
  phase: "qualification" | "evaluation",
  request: Readonly<SandboxSecurityHttpRequest>,
  outcome: SandboxSecurityReplayTransportOutcome<unknown>
): SandboxSecurityCapturedProviderOutcome {
  if (request.provider === "ollama" && request.operation === "model_inventory") {
    if (phase !== "qualification") return invalid();
    return Object.freeze({
      capture_phase: phase,
      provider: "ollama",
      operation: "model_inventory",
      outcome: outcome as SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaInventoryResponse
      >
    });
  }
  if (request.provider === "ollama" && request.operation === "chat") {
    return Object.freeze({
      capture_phase: phase,
      provider: "ollama",
      operation: "chat",
      outcome: outcome as SandboxSecurityReplayTransportOutcome<
        SandboxSecurityReplayOllamaResponse
      >
    });
  }
  if (phase !== "evaluation") return invalid();
  return Object.freeze({
    capture_phase: phase,
    provider: "openai",
    operation: "responses",
    outcome: outcome as SandboxSecurityReplayTransportOutcome<
      SandboxSecurityReplayOpenAIResponse
    >
  });
}

function createCaptureTransport(
  transport: SandboxSecurityHttpTransport,
  sink: NormalizedCaptureSink
): SandboxSecurityHttpTransport {
  const requestDescriptor = Object.getOwnPropertyDescriptor(transport, "request");
  if (
    requestDescriptor === undefined ||
    !("value" in requestDescriptor) ||
    typeof requestDescriptor.value !== "function"
  ) {
    return invalid();
  }
  const request = requestDescriptor.value as SandboxSecurityHttpTransport["request"];
  let state:
    | "qualification_inventory"
    | "qualification_prewarm"
    | "evaluation" = "qualification_inventory";
  return Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      const phase = capturePhase(state, input);
      let obligationIds: readonly string[] | undefined;
      if (input.provider === "openai" && input.operation === "responses") {
        try {
          obligationIds = openAiObligationIds(input.body);
        } catch {
          obligationIds = undefined;
        }
      }
      let response: Readonly<SandboxSecurityHttpResponse>;
      try {
        response = await Reflect.apply(request, transport, [input]) as Readonly<
          SandboxSecurityHttpResponse
        >;
      } catch (error) {
        const outcome = failureOutcome(input, error, phase);
        if (outcome !== null) {
          try {
            Reflect.apply(sink.record, sink.value, [
              capturedRecord(phase, input, outcome)
            ]);
          } catch {
            // A capture failure cannot replace the provider failure semantics.
          }
        }
        throw error;
      }
      const outcome = responseOutcome(input, response, obligationIds);
      Reflect.apply(sink.record, sink.value, [
        capturedRecord(phase, input, outcome)
      ]);
      if (state === "qualification_inventory") {
        state = "qualification_prewarm";
      } else if (state === "qualification_prewarm") {
        state = "evaluation";
      }
      return response;
    }
  });
}

async function createLocalDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  expected_digest: string;
  signal: AbortSignal;
}>): Promise<RawLocalDetector> {
  const qualification = await qualifySandboxSecurityOllama(input);
  return createSandboxSecurityOllamaLocalDetector({
    transport: input.transport,
    qualification
  });
}

function livePorts(
  sink: NormalizedCaptureSink
): Readonly<SandboxSecurityProductionCompositionPorts> {
  let transportCreated = false;
  return Object.freeze({
    create_config(mode: "rule_only" | "local" | "local_and_judge") {
      if (mode !== "local_and_judge") return invalid();
      return createSandboxSecurityProductionConfig(mode);
    },
    create_transport(config: Readonly<SandboxSecurityProductionConfig>) {
      if (transportCreated) return invalid();
      transportCreated = true;
      return createCaptureTransport(
        createSandboxSecurityProductionTransport(config),
        sink
      );
    },
    create_local_detector: createLocalDetector,
    create_external_pipeline: createSandboxSecurityExternalPipeline
  });
}

function replayPorts(
  replay: NormalizedReplayTransport,
  sealedConfig: Readonly<SandboxSecuritySealedProviderConfig>
): Readonly<SandboxSecurityProductionCompositionPorts> {
  const config: Readonly<SandboxSecurityProductionConfig> = Object.freeze({
    mode: "local_and_judge",
    summary: Object.freeze({
      ollama_configured: true,
      judge_configured: true,
      ollama_digest: sealedConfig.ollama_digest,
      judge_provider_id: sealedConfig.judge_provider_id,
      judge_base_url: sealedConfig.judge_base_url,
      judge_responses_url: sealedConfig.judge_responses_url,
      judge_requested_model: sealedConfig.judge_requested_model
    })
  });
  const facade: SandboxSecurityHttpTransport = Object.freeze({
    request(input: Readonly<SandboxSecurityHttpRequest>) {
      return Reflect.apply(replay.request, replay.value, [input]) as Promise<
        Readonly<SandboxSecurityHttpResponse>
      >;
    }
  });
  let transportCreated = false;
  return Object.freeze({
    create_config(mode: "rule_only" | "local" | "local_and_judge") {
      if (mode !== "local_and_judge") return invalid();
      return config;
    },
    create_transport(input: Readonly<SandboxSecurityProductionConfig>) {
      if (transportCreated || input !== config) return invalid();
      transportCreated = true;
      return facade;
    },
    create_local_detector: createLocalDetector,
    create_external_pipeline: createSandboxSecurityExternalPipeline
  });
}

export async function createSandboxSecurityLiveCaptureEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  capture_sink: SandboxSecurityCaptureSink;
}>): Promise<SandboxSecurityEngine> {
  const normalized = normalizedLiveInput(input);
  return createSandboxSecurityProductionCompositionWithPorts(
    Object.freeze({
      runtime: normalized.runtime,
      mode: "local_and_judge"
    }),
    livePorts(normalized.capture_sink)
  );
}

export async function createSandboxSecurityHermeticReplayEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  replay_transport: SandboxSecurityReplayTransport;
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}>): Promise<SandboxSecurityEngine> {
  const normalized = normalizedReplayInput(input);
  return createSandboxSecurityProductionCompositionWithPorts(
    Object.freeze({
      runtime: normalized.runtime,
      mode: "local_and_judge"
    }),
    replayPorts(normalized.replay_transport, normalized.sealed_config)
  );
}
