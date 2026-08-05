import {
  SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID,
  SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
  type SandboxSecurityJudgeProtocolId
} from "../../../engines/sandbox/src/security-production/judge-protocol-adapter.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse
} from "../../../engines/sandbox/src/security-production/http-transport.ts";
import type {
  SandboxSecurityReplayOllamaInventoryResponse,
  SandboxSecurityReplayOllamaResponse,
  SandboxSecurityReplayOpenAIResponse,
  SandboxSecurityReplayTransportOutcome
} from "../../../engines/sandbox/src/security-production/provider-outcomes.ts";
import {
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  normalizeSandboxSecurityReplayOllamaResponse,
  normalizeSandboxSecurityReplayOpenAIResponse,
  normalizeSandboxSecurityReplayOutcome
} from "../../../engines/sandbox/src/security-production/provider-outcomes.ts";
import type {
  SandboxSecurityReplayTransport,
  SandboxSecuritySealedProviderConfig
} from "../../../engines/sandbox/src/security-production/benchmark-composition.ts";
import {
  SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/ollama-contract.ts";
import {
  SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION
} from "../../../engines/sandbox/src/security-production/openai-judge-contract.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "../../../engines/sandbox/src/security-production/rule-catalog.ts";
import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "../../../engines/sandbox/src/security-production/deterministic-sanitizer.ts";
import {
  hashSandboxSecurityBenchmarkJudgeBinding
} from "./contracts.ts";

const INVALID = "sandbox_security_replay_transport_invalid";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const INPUT_COUNT = 300;
const MAX_RESPONSE_BYTES = 65536;
const RESPONSE_PREFIX = "BEGIN_SANITIZED_PAYLOAD\n";
const RESPONSE_SUFFIX = "\nEND_SANITIZED_PAYLOAD";
const SEALED_CONFIG_KEYS = [
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
] as const;

type ReplayOutcome = SandboxSecurityReplayTransportOutcome<unknown>;
type ReplayAttemptOutcome<T> = Exclude<
  SandboxSecurityReplayTransportOutcome<T>,
  Readonly<{ status: "not_called" }>
>;

export type SandboxSecurityReplayAttemptSequence<T> = readonly ReplayAttemptOutcome<T>[];

export interface SandboxSecurityReplayInputUnit {
  readonly ollama: SandboxSecurityReplayAttemptSequence<SandboxSecurityReplayOllamaResponse>;
  readonly judge: SandboxSecurityReplayAttemptSequence<SandboxSecurityReplayOpenAIResponse>;
}

export interface SandboxSecurityReplayQualification {
  readonly inventory: SandboxSecurityReplayAttemptSequence<SandboxSecurityReplayOllamaInventoryResponse>;
  readonly prewarm: SandboxSecurityReplayAttemptSequence<SandboxSecurityReplayOllamaResponse>;
}

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return fail("record_invalid");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail("record_keys_invalid");
  }
}

function validateSealedConfig(
  value: Readonly<SandboxSecuritySealedProviderConfig>
): Readonly<SandboxSecuritySealedProviderConfig> {
  const record = plainRecord(value);
  exactKeys(record, SEALED_CONFIG_KEYS);
  if (
    record.ollama_model !== "qwen3:8b" ||
    typeof record.ollama_digest !== "string" ||
    !DIGEST.test(record.ollama_digest) ||
    record.judge_endpoint_policy_id !== "operator_https_fqdn_v1" ||
    (record.judge_protocol_id !== SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID &&
      record.judge_protocol_id !==
        SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID) ||
    typeof record.judge_base_url !== "string" ||
    typeof record.judge_endpoint_url !== "string" ||
    typeof record.judge_requested_model !== "string" ||
    !MODEL.test(record.judge_requested_model) ||
    typeof record.judge_resolved_model !== "string" ||
    !MODEL.test(record.judge_resolved_model) ||
    record.local_prompt_version !== SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION ||
    record.local_schema_version !== "sandbox-security-local-model.v1" ||
    record.judge_prompt_version !== SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION ||
    record.judge_schema_version !== "sandbox-security-judge.v1" ||
    record.rule_catalog_version !== SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION ||
    record.sanitizer_version !== SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION ||
    typeof record.judge_binding_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(record.judge_binding_sha256)
  ) {
    fail("sealed_config_invalid");
  }
  const binding = {
    judge_protocol_id: record.judge_protocol_id,
    judge_endpoint_policy_id: record.judge_endpoint_policy_id,
    judge_base_url: record.judge_base_url,
    judge_endpoint_url: record.judge_endpoint_url,
    judge_requested_model: record.judge_requested_model,
    judge_resolved_model: record.judge_resolved_model
  };
  if (hashSandboxSecurityBenchmarkJudgeBinding(binding) !== record.judge_binding_sha256) {
    fail("sealed_config_binding_mismatch");
  }
  return value;
}

function normalizeOutcome<T>(
  value: unknown,
  normalizer: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T> {
  try {
    return normalizeSandboxSecurityReplayOutcome(value, normalizer);
  } catch {
    return fail("outcome_invalid");
  }
}

function isRetryableFirstAttempt<T>(
  outcome: ReplayAttemptOutcome<T>
): boolean {
  return outcome.status === "transport_error" &&
    outcome.error_code === "connection_failed";
}

function normalizeAttemptSequence<T>(
  value: unknown,
  normalizer: (value: unknown) => T
): SandboxSecurityReplayAttemptSequence<T> {
  if (!Array.isArray(value) || value.length > 2) {
    return fail("attempt_sequence_invalid");
  }
  const attempts: ReplayAttemptOutcome<T>[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const attempt = normalizeOutcome(value[index], normalizer);
    if (attempt.status === "not_called") {
      return fail("attempt_not_called_invalid");
    }
    if (index === 1 && !isRetryableFirstAttempt(attempts[0]!)) {
      return fail("attempt_retry_first_invalid");
    }
    attempts.push(attempt);
  }
  return Object.freeze(attempts);
}

function normalizeInputUnit(
  value: unknown
): Readonly<SandboxSecurityReplayInputUnit> {
  const record = plainRecord(value);
  exactKeys(record, ["judge", "ollama"]);
  const ollama = normalizeAttemptSequence(
    record.ollama,
    normalizeSandboxSecurityReplayOllamaResponse
  );
  const judge = normalizeAttemptSequence(
    record.judge,
    normalizeSandboxSecurityReplayOpenAIResponse
  );
  if (
    judge.length > 0 &&
    ollama.at(-1)?.status !== "response"
  ) {
    fail("judge_without_local_response");
  }
  return Object.freeze({ ollama, judge });
}

function normalizeQualification(value: Readonly<{
  inventory: unknown;
  prewarm: unknown;
}>): Readonly<SandboxSecurityReplayQualification> {
  const record = plainRecord(value);
  exactKeys(record, ["inventory", "prewarm"]);
  return Object.freeze({
    inventory: normalizeAttemptSequence(
      record.inventory,
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    ),
    prewarm: normalizeAttemptSequence(
      record.prewarm,
      normalizeSandboxSecurityReplayOllamaResponse
    )
  });
}

function validateResponseBinding(
  outcome: Extract<ReplayOutcome, { status: "response" }>,
  kind: "inventory" | "local" | "judge",
  config: Readonly<SandboxSecuritySealedProviderConfig>
): void {
  if (outcome.status !== "response") return;
  const response = outcome.normalized_response;
  if (kind === "inventory") {
    const inventory = response as SandboxSecurityReplayOllamaInventoryResponse;
    if (inventory.model !== config.ollama_model || inventory.digest !== config.ollama_digest) {
      fail("inventory_digest_binding_mismatch");
    }
    return;
  }
  if (kind === "local") {
    const local = response as SandboxSecurityReplayOllamaResponse;
    if (
      local.model !== config.ollama_model ||
      local.verified_ollama_digest !== config.ollama_digest ||
      local.message.parsed.schema_version !== config.local_schema_version
    ) {
      fail("local_digest_or_schema_binding_mismatch");
    }
    return;
  }
  const judge = response as SandboxSecurityReplayOpenAIResponse;
  if (
    judge.model !== config.judge_resolved_model ||
    judge.status !== "completed" ||
    judge.parsed.schema_version !== config.judge_schema_version
  ) {
      fail("judge_model_or_schema_binding_mismatch");
  }
}

function requireQualificationResponse<T>(
  attempts: SandboxSecurityReplayAttemptSequence<T>,
  kind: "inventory" | "local",
  config: Readonly<SandboxSecuritySealedProviderConfig>
): void {
  if (attempts.length === 0 || attempts.at(-1)?.status !== "response") {
    fail(`qualification_${kind}_outcome_invalid`);
  }
  for (const attempt of attempts) {
    if (attempt.status === "response") {
      validateResponseBinding(attempt, kind, config);
    }
  }
}

function signalReason(signal: AbortSignal): unknown {
  return signal.reason;
}

function requestBody(
  request: Readonly<SandboxSecurityHttpRequest>
): Uint8Array | undefined {
  return "body" in request ? request.body : undefined;
}

interface ReplayRequestRecord {
  readonly request: Readonly<SandboxSecurityHttpRequest>;
  readonly provider: Readonly<SandboxSecurityHttpRequest>["provider"];
  readonly operation: Readonly<SandboxSecurityHttpRequest>["operation"];
  readonly body: Uint8Array | undefined;
}

function recordRequest(
  request: Readonly<SandboxSecurityHttpRequest>
): ReplayRequestRecord {
  const body = requestBody(request);
  return Object.freeze({
    request,
    provider: request.provider,
    operation: request.operation,
    body: body === undefined ? undefined : new Uint8Array(body)
  });
}

function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validateRetryRequest(
  firstRequest: ReplayRequestRecord,
  retryRequest: Readonly<SandboxSecurityHttpRequest>
): void {
  if (
    firstRequest.provider !== retryRequest.provider ||
    firstRequest.operation !== retryRequest.operation
  ) {
    fail("retry_operation_invalid");
  }
  if (!sameBytes(firstRequest.body, requestBody(retryRequest))) {
    fail("retry_body_invalid");
  }
  if (firstRequest.request !== retryRequest) {
    fail("retry_request_identity_invalid");
  }
}

function waitForTermination(
  outcome: Extract<ReplayOutcome, { status: "signal_termination" }>,
  signal: AbortSignal
): Promise<never> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (signalReason(signal) !== outcome.termination_reason) {
        reject(new Error(`${INVALID}:termination_reason_mismatch`));
        return;
      }
      reject(namedError(
        outcome.termination_reason === "slot_timeout"
          ? "sandbox_security_slot_timeout"
          : "sandbox_security_work_budget"
      ));
    };
    if (signal.aborted) {
      queueMicrotask(finish);
      return;
    }
    signal.addEventListener("abort", finish, { once: true });
    void resolve;
  });
}

function responseFromOutcome(
  outcome: ReplayOutcome,
  request: Readonly<SandboxSecurityHttpRequest>,
  config: Readonly<SandboxSecuritySealedProviderConfig>
): Promise<Readonly<SandboxSecurityHttpResponse>> | Readonly<SandboxSecurityHttpResponse> {
  if (outcome.status === "not_called") return fail("not_called_slot_invoked");
  if (outcome.status === "http_error") {
    return Object.freeze({
      status: outcome.http_status,
      content_type: "application/json",
      body: ENCODER.encode("{}")
    });
  }
  if (outcome.status === "transport_error") {
    throw namedError(`sandbox_security_transport_${outcome.error_code}`);
  }
  if (outcome.status === "signal_termination") {
    return waitForTermination(outcome, request.signal);
  }
  if (request.provider === "ollama" && request.operation === "model_inventory") {
    const response = outcome.normalized_response as SandboxSecurityReplayOllamaInventoryResponse;
    validateResponseBinding(outcome, "inventory", config);
    return Object.freeze({
      status: 200,
      content_type: "application/json",
      body: ENCODER.encode(JSON.stringify({
        models: [{
          name: response.model,
          model: response.model,
          digest: response.digest.slice("sha256:".length)
        }]
      }))
    });
  }
  if (request.provider === "ollama" && request.operation === "chat") {
    const response = outcome.normalized_response as SandboxSecurityReplayOllamaResponse;
    validateResponseBinding(outcome, "local", config);
    return Object.freeze({
      status: 200,
      content_type: "application/json",
      body: ENCODER.encode(JSON.stringify({
        model: response.model,
        done: response.done,
        done_reason: "stop",
        message: {
          role: response.message.role,
          content: JSON.stringify(response.message.parsed)
        }
      })),
      verified_ollama_digest: response.verified_ollama_digest
    });
  }
  if (request.provider !== "openai") return fail("request_provider_invalid");
  const response = outcome.normalized_response as SandboxSecurityReplayOpenAIResponse;
  validateResponseBinding(outcome, "judge", config);
  const payload = judgePayload(request.body, config.judge_protocol_id);
  const obligationResults = response.parsed.obligation_results.map((result) => {
    const obligation = payload[result.obligation_ordinal - 1];
    if (obligation === undefined) return fail("judge_obligation_ordinal_invalid");
    return {
      obligation_id: obligation.obligation_id,
      outcome: result.outcome,
      confidence: result.confidence,
      severity: result.severity
    };
  });
  const content = JSON.stringify({
    schema_version: response.parsed.schema_version,
    obligation_results: obligationResults
  });
  if (request.operation === "responses") {
    return Object.freeze({
      status: 200,
      content_type: "application/json",
      body: ENCODER.encode(JSON.stringify({
        model: response.model,
        status: response.status,
        error: null,
        incomplete_details: null,
        output: [{
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: content }]
        }]
      }))
    });
  }
  if (request.operation !== "chat_completions") return fail("judge_operation_invalid");
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body: ENCODER.encode(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        index: 0,
        logprobs: null,
        message: { content, role: "assistant" }
      }],
      created: 1,
      id: "replay-chat-completion",
      model: response.model,
      object: "chat.completion",
      system_fingerprint: null,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }))
  });
}

function judgePayload(
  body: Uint8Array,
  protocol: SandboxSecurityJudgeProtocolId
): readonly { obligation_id: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(DECODER.decode(body)) as unknown;
  } catch {
    return fail("judge_request_invalid");
  }
  const root = plainRecord(parsed);
  let text: unknown;
  if (protocol === SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID) {
    const input = root.input;
    if (!Array.isArray(input)) return fail("judge_request_invalid");
    const user = input[1];
    const userRecord = plainRecord(user);
    const content = userRecord.content;
    if (!Array.isArray(content)) return fail("judge_request_invalid");
    text = plainRecord(content[0]).text;
  } else {
    const messages = root.messages;
    if (!Array.isArray(messages)) return fail("judge_request_invalid");
    text = plainRecord(messages[1]).content;
  }
  if (typeof text !== "string" || !text.startsWith(RESPONSE_PREFIX) || !text.endsWith(RESPONSE_SUFFIX)) {
    return fail("judge_request_invalid");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text.slice(RESPONSE_PREFIX.length, -RESPONSE_SUFFIX.length)) as unknown;
  } catch {
    return fail("judge_request_invalid");
  }
  const routed = plainRecord(payload).routed_obligations;
  if (!Array.isArray(routed)) return fail("judge_request_invalid");
  return routed.map((value) => {
    const obligation = plainRecord(value).obligation_id;
    if (typeof obligation !== "string") return fail("judge_request_invalid");
    return { obligation_id: obligation };
  });
}

export function createSandboxSecurityReplayTransport(input: Readonly<{
  qualification: Readonly<SandboxSecurityReplayQualification>;
  inputs: readonly SandboxSecurityReplayInputUnit[];
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}>): SandboxSecurityReplayTransport {
  const root = plainRecord(input);
  exactKeys(root, ["inputs", "qualification", "sealed_config"]);
  const config = validateSealedConfig(root.sealed_config as SandboxSecuritySealedProviderConfig);
  const qualification = normalizeQualification(root.qualification as {
    inventory: unknown;
    prewarm: unknown;
  });
  const rawInputs = root.inputs;
  if (!Array.isArray(rawInputs) || rawInputs.length !== INPUT_COUNT) {
    return fail("input_count_invalid");
  }
  const inputs = Object.freeze(
    rawInputs.map((value) => normalizeInputUnit(value as SandboxSecurityReplayInputUnit))
  );
  requireQualificationResponse(qualification.inventory, "inventory", config);
  requireQualificationResponse(qualification.prewarm, "local", config);
  for (const inputUnit of inputs) {
    for (const attempt of inputUnit.ollama) {
      if (attempt.status === "response") {
        validateResponseBinding(attempt, "local", config);
      }
    }
    for (const attempt of inputUnit.judge) {
      if (attempt.status === "response") {
        validateResponseBinding(attempt, "judge", config);
      }
    }
  }

  let state:
    | "qualification_inventory"
    | "qualification_prewarm"
    | "ready"
    | "input"
    | "drained"
    | "failed" = "qualification_inventory";
  let inputOrdinal = 0;
  let qualificationInventoryCursor = 0;
  let qualificationPrewarmCursor = 0;
  let qualificationInventoryRequest: ReplayRequestRecord | null = null;
  let qualificationPrewarmRequest: ReplayRequestRecord | null = null;
  let localAttemptCursor = 0;
  let judgeAttemptCursor = 0;
  let localRequest: ReplayRequestRecord | null = null;
  let judgeRequest: ReplayRequestRecord | null = null;
  let judgeOperation: "responses" | "chat_completions" | null = null;

  const invalidState = (code: string): never => {
    state = "failed";
    return fail(code);
  };

  const validateRetry = (
    firstRequest: ReplayRequestRecord,
    retryRequest: Readonly<SandboxSecurityHttpRequest>
  ): void => {
    try {
      validateRetryRequest(firstRequest, retryRequest);
    } catch (error) {
      state = "failed";
      throw error;
    }
  };

  const deliverAttempt = async (
    attempt: ReplayAttemptOutcome<unknown>,
    requestInput: Readonly<SandboxSecurityHttpRequest>,
    retryableFirstAttempt: boolean
  ): Promise<Readonly<SandboxSecurityHttpResponse>> => {
    try {
      const response = await responseFromOutcome(attempt, requestInput, config);
      if (attempt.status !== "response" && !retryableFirstAttempt) {
        state = "failed";
      }
      return response;
    } catch (error) {
      if (!retryableFirstAttempt) state = "failed";
      throw error;
    }
  };

  const request = async (
    requestInput: Readonly<SandboxSecurityHttpRequest>
  ): Promise<Readonly<SandboxSecurityHttpResponse>> => {
    if (requestInput.max_response_bytes !== MAX_RESPONSE_BYTES) {
      return invalidState("response_bound_invalid");
    }
    if (state === "qualification_inventory") {
      if (
        requestInput.provider !== "ollama" ||
        requestInput.operation !== "model_inventory"
      ) {
        return invalidState("qualification_inventory_operation_invalid");
      }
      const attemptIndex = qualificationInventoryCursor;
      const attempt = qualification.inventory[attemptIndex];
      if (attempt === undefined) {
        return invalidState("qualification_inventory_attempt_missing");
      }
      if (attemptIndex === 0) qualificationInventoryRequest = recordRequest(requestInput);
      else if (qualificationInventoryRequest === null) {
        return invalidState("qualification_inventory_retry_missing");
      } else {
        validateRetry(qualificationInventoryRequest, requestInput);
      }
      qualificationInventoryCursor += 1;
      const retryableFirstAttempt =
        attemptIndex === 0 && isRetryableFirstAttempt(attempt);
      const response = await deliverAttempt(
        attempt,
        requestInput,
        retryableFirstAttempt
      );
      if (attempt.status === "response") state = "qualification_prewarm";
      return response;
    }
    if (state === "qualification_prewarm") {
      if (
        requestInput.provider !== "ollama" ||
        requestInput.operation !== "chat"
      ) {
        return invalidState("qualification_prewarm_operation_invalid");
      }
      const attemptIndex = qualificationPrewarmCursor;
      const attempt = qualification.prewarm[attemptIndex];
      if (attempt === undefined) {
        return invalidState("qualification_prewarm_attempt_missing");
      }
      if (attemptIndex === 0) qualificationPrewarmRequest = recordRequest(requestInput);
      else if (qualificationPrewarmRequest === null) {
        return invalidState("qualification_prewarm_retry_missing");
      } else {
        validateRetry(qualificationPrewarmRequest, requestInput);
      }
      qualificationPrewarmCursor += 1;
      const retryableFirstAttempt =
        attemptIndex === 0 && isRetryableFirstAttempt(attempt);
      const response = await deliverAttempt(
        attempt,
        requestInput,
        retryableFirstAttempt
      );
      if (attempt.status === "response") state = "ready";
      return response;
    }
    if (state !== "input") return invalidState("request_outside_input");
    const unit = inputs[inputOrdinal];
    if (unit === undefined) return invalidState("input_missing");
    if (requestInput.provider === "ollama" && requestInput.operation === "chat") {
      const attemptIndex = localAttemptCursor;
      const attempt = unit.ollama[attemptIndex];
      if (attempt === undefined) {
        return invalidState(
          unit.ollama.length === 0
            ? "local_slot_not_called"
            : "local_slot_duplicate"
        );
      }
      if (attemptIndex === 0) localRequest = recordRequest(requestInput);
      else if (localRequest === null) {
        return invalidState("local_retry_missing");
      } else {
        validateRetry(localRequest, requestInput);
      }
      localAttemptCursor += 1;
      const retryableFirstAttempt =
        attemptIndex === 0 && isRetryableFirstAttempt(attempt);
      return deliverAttempt(attempt, requestInput, retryableFirstAttempt);
    }
    const expectedJudgeOperation =
      config.judge_protocol_id === SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID
        ? "responses"
        : "chat_completions";
    if (
      requestInput.provider !== "openai" ||
      requestInput.operation !== expectedJudgeOperation
    ) {
      return invalidState("judge_slot_order_or_operation_invalid");
    }
    if (localAttemptCursor !== unit.ollama.length) {
      return invalidState("judge_slot_order_invalid");
    }
    const attemptIndex = judgeAttemptCursor;
    const attempt = unit.judge[attemptIndex];
    if (attempt === undefined) {
      return invalidState(
        unit.judge.length === 0
          ? "judge_slot_not_called"
          : "judge_slot_duplicate"
      );
    }
    if (attemptIndex === 0) {
      judgeRequest = recordRequest(requestInput);
      judgeOperation = requestInput.operation;
    } else if (judgeRequest === null || judgeOperation === null) {
      return invalidState("judge_retry_missing");
    } else {
      if (judgeOperation !== requestInput.operation) {
        return invalidState("judge_operation_changed");
      }
      validateRetry(judgeRequest, requestInput);
    }
    judgeAttemptCursor += 1;
    const retryableFirstAttempt =
      attemptIndex === 0 && isRetryableFirstAttempt(attempt);
    return deliverAttempt(attempt, requestInput, retryableFirstAttempt);
  };

  return Object.freeze({
    request,
    beginInput() {
      if (state !== "ready" || inputOrdinal >= inputs.length) {
        return invalidState("begin_input_invalid");
      }
      state = "input";
      localAttemptCursor = 0;
      judgeAttemptCursor = 0;
      localRequest = null;
      judgeRequest = null;
      judgeOperation = null;
    },
    endInput() {
      if (state !== "input") return invalidState("end_input_invalid");
      const unit = inputs[inputOrdinal];
      if (unit === undefined) return invalidState("input_missing");
      if (localAttemptCursor !== unit.ollama.length) {
        return invalidState("local_slot_missing");
      }
      if (judgeAttemptCursor !== unit.judge.length) {
        return invalidState("judge_slot_missing");
      }
      inputOrdinal += 1;
      state = inputOrdinal === inputs.length ? "drained" : "ready";
    },
    assertDrained() {
      if (state !== "drained" || inputOrdinal !== INPUT_COUNT) {
        return invalidState("replay_not_drained");
      }
    }
  });
}
