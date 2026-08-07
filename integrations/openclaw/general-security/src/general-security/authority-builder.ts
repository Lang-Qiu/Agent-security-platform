import {
  normalizeSandboxSecurityRequest,
  type SandboxSecurityJsonValue,
  type SandboxSecurityPolicyProfileId
} from "../../../../../shared/index.ts";
import type { SandboxSecurityEvaluationRequest } from "../../../../../engines/sandbox/src/security/index.ts";
import {
  normalizeOpenClawSecurityEvaluationRequestId,
  type OpenClawSecurityEvaluationRequestId
} from "./runtime.ts";

export interface OpenClawSecurityCorrelation {
  readonly runId: string;
  readonly sessionKey: string;
  readonly callId: string | null;
}

export interface OpenClawSecurityAssistantProjection {
  readonly schema_version: "openclaw-security-assistant-projection.v1";
  readonly text_parts: readonly string[];
  readonly tool_calls: readonly Readonly<{
    call_id: string;
    tool_name: string;
    arguments: SandboxSecurityJsonValue;
  }>[];
}

export type OpenClawSecurityBarrierObservation =
  | Readonly<{
      point: "before_agent_run";
      correlation: OpenClawSecurityCorrelation;
      prompt: string;
    }>
  | Readonly<{
      point: "before_model_output_delivery";
      correlation: OpenClawSecurityCorrelation;
      prompt: string;
      assistant: OpenClawSecurityAssistantProjection;
    }>
  | Readonly<{
      point: "before_tool_execution";
      correlation: OpenClawSecurityCorrelation;
      prompt: string;
      assistant: OpenClawSecurityAssistantProjection;
      tool: Readonly<{
        call_id: string;
        tool_name: string;
        arguments: SandboxSecurityJsonValue;
      }>;
    }>
  | Readonly<{
      point: "before_message_delivery";
      correlation: OpenClawSecurityCorrelation;
      prompt: string;
      outbound: string | SandboxSecurityJsonValue;
    }>;

const PROFILE_IDS = [
  "sandbox-security-balanced.v1",
  "sandbox-security-strict.v1"
] as const;

const MAX_TEXT_BYTES = 128 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 4096;
const MAX_ARRAY_ITEMS = 64;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const SOURCE_IDS = Object.freeze({
  prompt: "openclaw-security:prompt:0001",
  assistant: "openclaw-security:assistant:0001",
  outbound: "openclaw-security:outbound:0001"
} as const);

const PROVENANCE_REFS = Object.freeze({
  prompt: "platform://openclaw-security/prompt",
  assistant: "platform://openclaw-security/assistant",
  outbound: "platform://openclaw-security/outbound"
} as const);

function invalidAuthority(): never {
  const error = new Error("invalid OpenClaw security authority observation");
  error.name = "openclaw_security_authority_invalid";
  throw error;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isDenseArray(value: unknown, maxLength: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value > maxLength
  ) {
    return false;
  }
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) return false;
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return false;
    }
  }
  return keys.every((key) => {
    if (key === "length") return true;
    return typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key) &&
      Number(key) >= 0 && Number(key) < length;
  });
}

function isSafeText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= MAX_TEXT_BYTES &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gu, ""))
  );
}

function cloneJson(
  value: unknown,
  depth = 0,
  state = { nodes: 0, active: new WeakSet<object>() }
): SandboxSecurityJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) invalidAuthority();
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && !isSafeText(value)) invalidAuthority();
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidAuthority();
    return value;
  }
  if (typeof value !== "object" || value === null || state.active.has(value)) {
    invalidAuthority();
  }
  state.active.add(value);
  try {
    if (Array.isArray(value)) {
      if (!isDenseArray(value, MAX_JSON_NODES)) invalidAuthority();
      return value.map((item) => cloneJson(item, depth + 1, state));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) invalidAuthority();
    const output: Record<string, SandboxSecurityJsonValue> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (
        typeof key !== "string" ||
        FORBIDDEN_JSON_KEYS.has(key) ||
        !isSafeText(key)
      ) {
        invalidAuthority();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        invalidAuthority();
      }
      output[key] = cloneJson(descriptor.value, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => deepEqualJson(item, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left as object).sort();
  const rightKeys = Object.keys(right as object).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] &&
      deepEqualJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function normalizeCorrelation(value: unknown): OpenClawSecurityCorrelation {
  if (!hasExactOwnDataProperties(value, ["runId", "sessionKey", "callId"])) {
    invalidAuthority();
  }
  if (
    typeof value.runId !== "string" ||
    typeof value.sessionKey !== "string" ||
    !IDENTIFIER_PATTERN.test(value.runId) ||
    !IDENTIFIER_PATTERN.test(value.sessionKey) ||
    (value.callId !== null &&
      (typeof value.callId !== "string" || !IDENTIFIER_PATTERN.test(value.callId)))
  ) {
    invalidAuthority();
  }
  return {
    runId: value.runId,
    sessionKey: value.sessionKey,
    callId: value.callId as string | null
  };
}

function normalizeAssistant(
  value: unknown
): OpenClawSecurityAssistantProjection {
  if (!hasExactOwnDataProperties(value, ["schema_version", "text_parts", "tool_calls"]) ||
      value.schema_version !== "openclaw-security-assistant-projection.v1" ||
      !isDenseArray(value.text_parts, MAX_ARRAY_ITEMS) ||
      !isDenseArray(value.tool_calls, MAX_ARRAY_ITEMS)) {
    invalidAuthority();
  }
  const textParts = value.text_parts.map((part) => {
    if (!isSafeText(part)) invalidAuthority();
    return part;
  });
  const calls: Array<{
    call_id: string;
    tool_name: string;
    arguments: SandboxSecurityJsonValue;
  }> = [];
  const seenCallIds = new Set<string>();
  for (const item of value.tool_calls) {
    if (!hasExactOwnDataProperties(item, ["call_id", "tool_name", "arguments"]) ||
        typeof item.call_id !== "string" ||
        !IDENTIFIER_PATTERN.test(item.call_id) ||
        typeof item.tool_name !== "string" ||
        !TOOL_NAME_PATTERN.test(item.tool_name) ||
        seenCallIds.has(item.call_id)) {
      invalidAuthority();
    }
    seenCallIds.add(item.call_id);
    calls.push({
      call_id: item.call_id,
      tool_name: item.tool_name,
      arguments: cloneJson(item.arguments)
    });
  }
  return {
    schema_version: "openclaw-security-assistant-projection.v1",
    text_parts: textParts,
    tool_calls: calls
  };
}

function contentItem(
  sourceId: string,
  claimedSourceType: "user_input" | "model_output",
  mediaType: "text/plain" | "application/json",
  value: string | SandboxSecurityJsonValue,
  provenanceRef: string
): RecordValue {
  return {
    source_id: sourceId,
    claimed_source_type: claimedSourceType,
    media_type: mediaType,
    value,
    provenance_ref: provenanceRef
  };
}

type RecordValue = Record<string, unknown>;

function buildContext(
  request: Readonly<{
    submission: Readonly<RecordValue>;
  }>
): RecordValue {
  const submission = request.submission;
  const items = submission.content_items as readonly RecordValue[];
  const sources = items.map((item) => ({
    source_id: item.source_id,
    authority_kind: "integration_observation" as const,
    source_type: item.claimed_source_type,
    media_type: item.media_type,
    value: item.value,
    provenance_ref: item.provenance_ref
  }));
  const toolRequest = submission.tool_request as RecordValue | undefined;
  return {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: "enforcement",
    stage: submission.stage,
    policy_profile_id: submission.policy_profile_id,
    sources,
    ...(toolRequest
      ? {
          tool_request: {
            authority_kind: "integration_observation" as const,
            call_id: toolRequest.call_id,
            tool_name: toolRequest.tool_name,
            arguments: toolRequest.arguments
          }
        }
      : {})
  };
}

function normalizeObservation(value: unknown): OpenClawSecurityBarrierObservation {
  if (!isPlainRecord(value) || typeof value.point !== "string") invalidAuthority();
  const point = value.point;
  if (![
    "before_agent_run",
    "before_model_output_delivery",
    "before_tool_execution",
    "before_message_delivery"
  ].includes(point)) {
    invalidAuthority();
  }
  const normalizedCorrelation = normalizeCorrelation(value.correlation);
  if (!isSafeText(value.prompt)) invalidAuthority();
  const base = {
    point,
    correlation: normalizedCorrelation,
    prompt: value.prompt
  } as RecordValue;

  if (point === "before_agent_run") {
    if (!hasExactOwnDataProperties(value, ["point", "correlation", "prompt"]) ||
        normalizedCorrelation.callId !== null) invalidAuthority();
    return base as OpenClawSecurityBarrierObservation;
  }
  if (point === "before_model_output_delivery") {
    if (!hasExactOwnDataProperties(value, ["point", "correlation", "prompt", "assistant"]) ||
        normalizedCorrelation.callId !== null) invalidAuthority();
    return { ...base, assistant: normalizeAssistant(value.assistant) } as OpenClawSecurityBarrierObservation;
  }
  if (point === "before_tool_execution") {
    if (!hasExactOwnDataProperties(value, ["point", "correlation", "prompt", "assistant", "tool"]) ||
        normalizedCorrelation.callId === null ||
        !hasExactOwnDataProperties(value.tool, ["call_id", "tool_name", "arguments"]) ||
        typeof value.tool.call_id !== "string" ||
        !IDENTIFIER_PATTERN.test(value.tool.call_id) ||
        typeof value.tool.tool_name !== "string" ||
        !TOOL_NAME_PATTERN.test(value.tool.tool_name)) {
      invalidAuthority();
    }
    const assistant = normalizeAssistant(value.assistant);
    const tool = {
      call_id: value.tool.call_id,
      tool_name: value.tool.tool_name,
      arguments: cloneJson(value.tool.arguments)
    };
    const match = assistant.tool_calls.find((call) =>
      call.call_id === tool.call_id &&
      call.tool_name === tool.tool_name &&
      deepEqualJson(call.arguments, tool.arguments)
    );
    if (match === undefined || normalizedCorrelation.callId !== tool.call_id) invalidAuthority();
    return { ...base, correlation: normalizedCorrelation, assistant, tool } as OpenClawSecurityBarrierObservation;
  }
  if (!hasExactOwnDataProperties(value, ["point", "correlation", "prompt", "outbound"]) ||
      normalizedCorrelation.callId !== null) invalidAuthority();
  const outbound = typeof value.outbound === "string"
    ? value.outbound
    : cloneJson(value.outbound);
  return { ...base, outbound } as OpenClawSecurityBarrierObservation;
}

export function buildOpenClawSecurityEvaluationRequest(input: Readonly<{
  observation: unknown;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  issued_request_id: OpenClawSecurityEvaluationRequestId;
}>): Readonly<SandboxSecurityEvaluationRequest> {
  try {
    if (!hasExactOwnDataProperties(input, ["observation", "policy_profile_id", "issued_request_id"]) ||
        !PROFILE_IDS.includes(input.policy_profile_id as (typeof PROFILE_IDS)[number])) {
      invalidAuthority();
    }
    const requestId = normalizeOpenClawSecurityEvaluationRequestId(input.issued_request_id);
    if (requestId === null) invalidAuthority();
    const observation = normalizeObservation(input.observation);
    const items: RecordValue[] = [
      contentItem(
        SOURCE_IDS.prompt,
        "user_input",
        "text/plain",
        observation.prompt,
        PROVENANCE_REFS.prompt
      )
    ];
    let stage: "user_input" | "model_output" | "tool_request" = "user_input";
    let toolRequest: RecordValue | undefined;
    if (observation.point === "before_model_output_delivery") {
      stage = "model_output";
      items.push(contentItem(
        SOURCE_IDS.assistant,
        "model_output",
        "application/json",
        observation.assistant as unknown as SandboxSecurityJsonValue,
        PROVENANCE_REFS.assistant
      ));
    } else if (observation.point === "before_tool_execution") {
      stage = "tool_request";
      items.push(contentItem(
        SOURCE_IDS.assistant,
        "model_output",
        "application/json",
        observation.assistant as unknown as SandboxSecurityJsonValue,
        PROVENANCE_REFS.assistant
      ));
      toolRequest = {
        call_id: observation.tool.call_id,
        tool_name: observation.tool.tool_name,
        arguments: observation.tool.arguments
      };
    } else if (observation.point === "before_message_delivery") {
      stage = "model_output";
      items.push(contentItem(
        SOURCE_IDS.outbound,
        "model_output",
        typeof observation.outbound === "string" ? "text/plain" : "application/json",
        observation.outbound,
        PROVENANCE_REFS.outbound
      ));
    }

    const candidate: RecordValue = {
      schema_version: "sandbox-security-request.v1",
      request_id: requestId,
      stage,
      policy_profile_id: input.policy_profile_id,
      content_items: items,
      ...(toolRequest ? { tool_request: toolRequest } : {})
    };
    const submission = normalizeSandboxSecurityRequest(candidate);
    if (submission === null) invalidAuthority();
    return deepFreeze({
      submission,
      authoritative_context: buildContext({ submission: submission as unknown as RecordValue })
    }) as Readonly<SandboxSecurityEvaluationRequest>;
  } catch (error) {
    if (error instanceof Error && error.name === "openclaw_security_authority_invalid") {
      throw error;
    }
    invalidAuthority();
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}
