import type {
  SandboxSecuritySanitizedJudgePayload
} from "../security/index.ts";
import {
  createSandboxSecurityOpenAiJudgePrompt,
  parseSandboxSecurityOpenAiJudgeAssistantContent,
  validateSandboxSecurityOpenAiJudgeRequestedModel,
  validateSandboxSecurityOpenAiJudgeResolvedModel,
  type SandboxSecurityParsedOpenAIResponse
} from "./openai-judge-contract.ts";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REASONING_CONTENT_BYTES = 32 * 1024;
const MAX_COMPLETION_TOKENS = 4096;
const OUTER_KEYS = [
  "choices",
  "created",
  "id",
  "model",
  "object",
  "system_fingerprint",
  "usage"
] as const;
const CHOICE_REQUIRED_KEYS = ["finish_reason", "index", "message"] as const;
const CHOICE_OPTIONAL_KEYS = ["logprobs", "provider_specific_fields"] as const;
const MESSAGE_REQUIRED_KEYS = ["content", "role"] as const;
const MESSAGE_OPTIONAL_KEYS = ["reasoning_content", "provider_specific_fields"] as const;
const CHOICE_PROVIDER_SPECIFIC_KEYS = [
  "routed_experts",
  "stop_reason",
  "token_ids"
] as const;
const MESSAGE_PROVIDER_SPECIFIC_KEYS = [
  "reasoning",
  "reasoning_content",
  "refusal"
] as const;
const USAGE_REQUIRED_KEYS = [
  "prompt_tokens",
  "completion_tokens",
  "total_tokens"
] as const;
const USAGE_OPTIONAL_KEYS = [
  "prompt_cache_hit_tokens",
  "prompt_cache_miss_tokens",
  "completion_tokens_details",
  "prompt_tokens_details"
] as const;
const COMPLETION_TOKEN_DETAIL_KEYS = [
  "accepted_prediction_tokens",
  "audio_tokens",
  "reasoning_tokens",
  "rejected_prediction_tokens"
] as const;
const PROMPT_TOKEN_DETAIL_KEYS = ["audio_tokens", "cached_tokens"] as const;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  "byteLength"
)?.get;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;

function requestInvalid(): never {
  throw new TypeError("sandbox_security_openai_chat_judge_request_invalid");
}

function responseInvalid(): never {
  throw new TypeError("sandbox_security_openai_chat_judge_response_invalid");
}

function withRequestValidation<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return requestInvalid();
  }
}

function withResponseValidation<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return responseInvalid();
  }
}

function requestedModel(
  options: Readonly<{ judge_requested_model: string }>
): string {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.getPrototypeOf(options) !== Object.prototype
  ) {
    return requestInvalid();
  }
  const ownKeys = Reflect.ownKeys(options);
  if (ownKeys.length !== 1 || ownKeys[0] !== "judge_requested_model") {
    return requestInvalid();
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    options,
    "judge_requested_model"
  );
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    return requestInvalid();
  }
  return validateSandboxSecurityOpenAiJudgeRequestedModel(descriptor.value);
}

export function createSandboxSecurityOpenAiChatJudgeRequest(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
  options: Readonly<{ judge_requested_model: string }>
): Readonly<{ body: Uint8Array }> {
  return withRequestValidation(() => {
    const model = requestedModel(options);
    const prompt = createSandboxSecurityOpenAiJudgePrompt(payload);
    const body = ENCODER.encode(
      JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: prompt.system_instruction_with_schema
          },
          { role: "user", content: prompt.user_message }
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        temperature: 0,
        stream: false,
        max_completion_tokens: MAX_COMPLETION_TOKENS
      })
    );
    if (body.byteLength > MAX_BODY_BYTES) return requestInvalid();
    return Object.freeze({ body });
  });
}

function responseBodyBytes(value: unknown): Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype
  ) {
    return responseInvalid();
  }
  const byteLength = Reflect.apply(
    TYPED_ARRAY_BYTE_LENGTH_GETTER,
    value,
    []
  ) as number;
  if (!Number.isSafeInteger(byteLength) || byteLength > MAX_BODY_BYTES) {
    return responseInvalid();
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== byteLength) return responseInvalid();
  for (let index = 0; index < byteLength; index += 1) {
    const key = ownKeys[index];
    if (key !== String(index)) return responseInvalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true ||
      typeof descriptor.value !== "number"
    ) {
      return responseInvalid();
    }
  }
  const copy = new Uint8Array(byteLength);
  Reflect.apply(UINT8_ARRAY_SET, copy, [value]);
  return copy;
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return responseInvalid();
  }
  const record = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (
    ownKeys.length < requiredKeys.length ||
    ownKeys.length > requiredKeys.length + optionalKeys.length
  ) {
    return responseInvalid();
  }
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowedKeys.has(key)) {
      return responseInvalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return responseInvalid();
    }
  }
  for (const key of requiredKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return responseInvalid();
    }
  }
  return record;
}

function dataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    return responseInvalid();
  }
  return descriptor.value;
}

function hasDataProperty(record: object, key: string): boolean {
  return Object.hasOwn(record, key);
}

function exactArray(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return responseInvalid();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.enumerable !== false ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return responseInvalid();
  }
  const length = lengthDescriptor.value;
  if (Reflect.ownKeys(value).length !== length + 1) return responseInvalid();
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return responseInvalid();
    }
    items.push(descriptor.value);
  }
  return items;
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string" || !isWellFormedUtf16(value)) {
    return responseInvalid();
  }
}

function assertSafeNonnegativeInteger(value: unknown): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return responseInvalid();
  }
}

function validateTokenDetails(
  value: unknown,
  knownKeys: readonly string[]
): void {
  const details = exactRecord(value, [], knownKeys);
  for (const key of knownKeys) {
    if (hasDataProperty(details, key)) {
      assertSafeNonnegativeInteger(dataProperty(details, key));
    }
  }
}

function validateUsage(value: unknown): void {
  const usage = exactRecord(value, USAGE_REQUIRED_KEYS, USAGE_OPTIONAL_KEYS);
  for (const key of [
    ...USAGE_REQUIRED_KEYS,
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens"
  ] as const) {
    if (hasDataProperty(usage, key)) {
      assertSafeNonnegativeInteger(dataProperty(usage, key));
    }
  }
  if (hasDataProperty(usage, "completion_tokens_details")) {
    validateTokenDetails(
      dataProperty(usage, "completion_tokens_details"),
      COMPLETION_TOKEN_DETAIL_KEYS
    );
  }
  if (hasDataProperty(usage, "prompt_tokens_details")) {
    validateTokenDetails(
      dataProperty(usage, "prompt_tokens_details"),
      PROMPT_TOKEN_DETAIL_KEYS
    );
  }
}

function validateProviderSpecificChoiceFields(value: unknown): void {
  const fields = exactRecord(value, [], CHOICE_PROVIDER_SPECIFIC_KEYS);
  for (const key of CHOICE_PROVIDER_SPECIFIC_KEYS) {
    if (hasDataProperty(fields, key) && dataProperty(fields, key) !== null) {
      return responseInvalid();
    }
  }
}

function validateProviderSpecificMessageFields(value: unknown): void {
  const fields = exactRecord(value, [], MESSAGE_PROVIDER_SPECIFIC_KEYS);
  for (const key of ["reasoning", "reasoning_content"] as const) {
    if (hasDataProperty(fields, key)) {
      const reasoning = dataProperty(fields, key);
      assertString(reasoning);
      if (ENCODER.encode(reasoning).byteLength > MAX_REASONING_CONTENT_BYTES) {
        return responseInvalid();
      }
    }
  }
  if (
    hasDataProperty(fields, "refusal") &&
    dataProperty(fields, "refusal") !== null
  ) {
    return responseInvalid();
  }
}

function parseEnvelope(
  value: unknown,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityParsedOpenAIResponse> {
  const envelope = exactRecord(value, OUTER_KEYS);
  if (dataProperty(envelope, "object") !== "chat.completion") {
    return responseInvalid();
  }
  assertSafeNonnegativeInteger(dataProperty(envelope, "created"));
  assertString(dataProperty(envelope, "id"));
  const resolvedModel = validateSandboxSecurityOpenAiJudgeResolvedModel(
    dataProperty(envelope, "model")
  );
  const systemFingerprint = dataProperty(envelope, "system_fingerprint");
  if (systemFingerprint !== null) assertString(systemFingerprint);
  validateUsage(dataProperty(envelope, "usage"));

  const choices = exactArray(dataProperty(envelope, "choices"));
  if (choices.length !== 1) return responseInvalid();
  const choice = exactRecord(
    choices[0],
    CHOICE_REQUIRED_KEYS,
    CHOICE_OPTIONAL_KEYS
  );
 if (
   dataProperty(choice, "finish_reason") !== "stop" ||
    dataProperty(choice, "index") !== 0
 ) {
   return responseInvalid();
 }
  if (
    hasDataProperty(choice, "logprobs") &&
    dataProperty(choice, "logprobs") !== null
  ) {
    return responseInvalid();
  }
  if (hasDataProperty(choice, "provider_specific_fields")) {
    validateProviderSpecificChoiceFields(
      dataProperty(choice, "provider_specific_fields")
    );
  }

  const message = exactRecord(
    dataProperty(choice, "message"),
    MESSAGE_REQUIRED_KEYS,
    MESSAGE_OPTIONAL_KEYS
  );
  if (dataProperty(message, "role") !== "assistant") {
    return responseInvalid();
  }
  const content = dataProperty(message, "content");
  assertString(content);
  if (hasDataProperty(message, "reasoning_content")) {
    const reasoningContent = dataProperty(message, "reasoning_content");
    if (reasoningContent !== null) {
      assertString(reasoningContent);
      if (ENCODER.encode(reasoningContent).byteLength > MAX_REASONING_CONTENT_BYTES) {
        return responseInvalid();
      }
    }
  }
  if (hasDataProperty(message, "provider_specific_fields")) {
    validateProviderSpecificMessageFields(
      dataProperty(message, "provider_specific_fields")
    );
  }
  return parseSandboxSecurityOpenAiJudgeAssistantContent(
    content,
    resolvedModel,
    payload
  );
}

export function parseSandboxSecurityOpenAiChatJudgeResponse(
  body: Uint8Array,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityParsedOpenAIResponse> {
  return withResponseValidation(() => {
    const bytes = responseBodyBytes(body);
    if (
      bytes.byteLength >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      return responseInvalid();
    }
    const decoded = DECODER.decode(bytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded) as unknown;
    } catch {
      return responseInvalid();
    }
    return parseEnvelope(parsed, payload);
  });
}
