import type {
  SandboxSecurityExternalCandidateSubjectRef,
  SandboxSecurityExternalDetectorResult,
  SandboxSecurityExternalRiskCandidate,
  SandboxSecuritySanitizedJudgePayload,
  SanitizedExternalDetector
} from "../security/index.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  createSandboxSecurityOpenAiJudgeRequest,
  parseSandboxSecurityOpenAiJudgeResponse,
  validateSandboxSecurityOpenAiJudgePromptProfile,
  type SandboxSecurityOpenAiJudgePromptProfile,
  type SandboxSecurityParsedOpenAIResponse
} from "./openai-judge-contract.ts";
import {
  createSandboxSecurityOpenAiChatJudgeRequest,
  parseSandboxSecurityOpenAiChatJudgeResponse
} from "./openai-chat-judge-contract.ts";
import {
  SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID,
  SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
  type SandboxSecurityJudgeProtocolId
} from "./judge-protocol-adapter.ts";

type RoutedObligation =
  SandboxSecuritySanitizedJudgePayload["routed_obligations"][number];
type ParsedObligation =
  SandboxSecurityParsedOpenAIResponse["obligation_results"][number];

interface ObligationBinding {
  readonly obligation_id: string;
  readonly category: RoutedObligation["category"];
  readonly subject_refs:
    readonly SandboxSecurityExternalCandidateSubjectRef[];
}

interface JudgeProtocolDispatch {
  readonly operation: "responses" | "chat_completions";
  readonly create_request: typeof createSandboxSecurityOpenAiJudgeRequest;
  readonly parse_response: typeof parseSandboxSecurityOpenAiJudgeResponse;
}

const RESPONSES_DISPATCH: Readonly<JudgeProtocolDispatch> = Object.freeze({
  operation: "responses",
  create_request: createSandboxSecurityOpenAiJudgeRequest,
  parse_response: parseSandboxSecurityOpenAiJudgeResponse
});
const CHAT_COMPLETIONS_DISPATCH: Readonly<JudgeProtocolDispatch> = Object.freeze({
  operation: "chat_completions",
  create_request: createSandboxSecurityOpenAiChatJudgeRequest,
  parse_response: parseSandboxSecurityOpenAiChatJudgeResponse
});

const MAX_RESPONSE_BYTES = 65_536;
const MAX_SUBJECT_REFS = 8;
const OBLIGATION_ID =
  /^obligation:\/\/sandbox\/security\/[A-Za-z0-9_.-]{1,128}\/0[0-9]{3}$/u;
const RISK_CATEGORIES = new Set<RoutedObligation["category"]>([
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
]);
const ABORT_SIGNAL_ABORTED_GETTER = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted"
)?.get;
const ABORT_SIGNAL_THROW_IF_ABORTED = AbortSignal.prototype.throwIfAborted;

function detectorInvalid(): never {
  throw new TypeError("sandbox_security_openai_judge_detector_invalid");
}

function protocolDispatch(value: unknown): Readonly<JudgeProtocolDispatch> {
  if (value === SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID) {
    return RESPONSES_DISPATCH;
  }
  if (value === SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID) {
    return CHAT_COMPLETIONS_DISPATCH;
  }
  return detectorInvalid();
}

function withDetectorValidation<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return detectorInvalid();
  }
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  optionalKeys: readonly string[] = []
): ReadonlyMap<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return detectorInvalid();
  }
  const values = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return detectorInvalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return detectorInvalid();
    }
    values.set(key, descriptor.value);
  }
  const allowedKeys = new Set([...expectedKeys, ...optionalKeys]);
  if (
    values.size < expectedKeys.length ||
    values.size > expectedKeys.length + optionalKeys.length ||
    expectedKeys.some((key) => !values.has(key)) ||
    [...values.keys()].some((key) => !allowedKeys.has(key))
  ) {
    return detectorInvalid();
  }
  return values;
}

function dataProperty(value: unknown, key: string): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return detectorInvalid();
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    return detectorInvalid();
  }
  return descriptor.value;
}

function exactArray(
  value: unknown,
  minimum: number,
  maximum: number
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return detectorInvalid();
  }
  const length = value.length;
  if (
    !Number.isSafeInteger(length) ||
    length < minimum ||
    length > maximum ||
    Reflect.ownKeys(value).length !== length + 1
  ) {
    return detectorInvalid();
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return detectorInvalid();
    }
    items.push(descriptor.value);
  }
  return items;
}

function copyJsonData(
  value: unknown,
  seen: WeakSet<object>,
  depth = 0
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || depth > 8 || seen.has(value)) {
    return detectorInvalid();
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return exactArray(value, 0, 32).map((item) =>
      copyJsonData(item, seen, depth + 1)
    );
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return detectorInvalid();
  }
  const copy: Record<string, unknown> = {};
  const keys = Reflect.ownKeys(value);
  if (keys.length > 32) return detectorInvalid();
  for (const key of keys) {
    if (typeof key !== "string") return detectorInvalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return detectorInvalid();
    }
    copy[key] = copyJsonData(descriptor.value, seen, depth + 1);
  }
  return copy;
}

function copySubjectRef(
  value: unknown
): SandboxSecurityExternalCandidateSubjectRef {
  const base = exactDataRecordForSubject(value);
  const kind = base.get("kind");
  if (kind === "content_source") {
    const values = exactDataRecord(value, ["kind", "source_token", "locator"]);
    const sourceToken = values.get("source_token");
    if (typeof sourceToken !== "string") return detectorInvalid();
    return {
      kind: "content_source",
      source_token: sourceToken,
      locator: copyJsonData(values.get("locator"), new WeakSet()) as never
    };
  }
  if (kind !== "tool_request") return detectorInvalid();
  const component = base.get("component");
  const keys = component === "arguments"
    ? ["kind", "call_token", "component", "locator"]
    : ["kind", "call_token", "component"];
  const values = exactDataRecord(value, keys);
  const callToken = values.get("call_token");
  if (
    typeof callToken !== "string" ||
    (component !== "whole_call" &&
      component !== "tool_name" &&
      component !== "target" &&
      component !== "arguments")
  ) {
    return detectorInvalid();
  }
  if (component === "arguments") {
    return {
      kind: "tool_request",
      call_token: callToken,
      component,
      locator: copyJsonData(values.get("locator"), new WeakSet()) as never
    };
  }
  return { kind: "tool_request", call_token: callToken, component };
}

function exactDataRecordForSubject(
  value: unknown
): ReadonlyMap<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return detectorInvalid();
  }
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  const component = Object.getOwnPropertyDescriptor(value, "component");
  if (
    kind === undefined ||
    !("value" in kind) ||
    kind.enumerable !== true ||
    (component !== undefined &&
      (!("value" in component) || component.enumerable !== true))
  ) {
    return detectorInvalid();
  }
  return new Map<string, unknown>([
    ["kind", kind.value],
    ["component", component !== undefined && "value" in component
      ? component.value
      : undefined]
  ]);
}

function obligationBindings(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): ReadonlyMap<string, ObligationBinding> {
  const routed = exactArray(dataProperty(payload, "routed_obligations"), 1, 32);
  const bindings = new Map<string, ObligationBinding>();
  for (const value of routed) {
    const values = exactDataRecord(value, [
      "obligation_id",
      "category",
      "subject_refs"
    ]);
    const obligationId = values.get("obligation_id");
    const category = values.get("category");
    if (
      typeof obligationId !== "string" ||
      !OBLIGATION_ID.test(obligationId) ||
      bindings.has(obligationId) ||
      typeof category !== "string" ||
      !RISK_CATEGORIES.has(category as RoutedObligation["category"])
    ) {
      return detectorInvalid();
    }
    const subjectRefs = exactArray(
      values.get("subject_refs"),
      1,
      MAX_SUBJECT_REFS
    ).map(copySubjectRef);
    bindings.set(obligationId, {
      obligation_id: obligationId,
      category: category as RoutedObligation["category"],
      subject_refs: subjectRefs
    });
  }
  return bindings;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function assertNotAborted(signal: AbortSignal): void {
  const aborted = withDetectorValidation(() => {
    if (ABORT_SIGNAL_ABORTED_GETTER === undefined) return detectorInvalid();
    const value = Reflect.apply(ABORT_SIGNAL_ABORTED_GETTER, signal, []);
    return typeof value === "boolean" ? value : detectorInvalid();
  });
  if (aborted) Reflect.apply(ABORT_SIGNAL_THROW_IF_ABORTED, signal, []);
}

function normalizedResponse(value: unknown): Readonly<SandboxSecurityHttpResponse> {
  return withDetectorValidation(() => {
    const values = exactDataRecord(value, ["status", "content_type", "body"]);
    if (
      values.get("status") !== 200 ||
      values.get("content_type") !== "application/json" ||
      !(values.get("body") instanceof Uint8Array)
    ) {
      return detectorInvalid();
    }
    return {
      status: 200,
      content_type: "application/json",
      body: values.get("body") as Uint8Array
    };
  });
}

function confidence(value: ParsedObligation["confidence"]): number {
  if (value === "uncertain") return 0.6;
  if (value === "probable") return 0.8;
  if (value === "confident") return 0.9;
  return detectorInvalid();
}

function mapResult(
  parsed: Readonly<SandboxSecurityParsedOpenAIResponse>,
  bindings: ReadonlyMap<string, ObligationBinding>
): Readonly<SandboxSecurityExternalDetectorResult> {
  const candidates: SandboxSecurityExternalRiskCandidate[] = [];
  const clearances: Array<
    SandboxSecurityExternalDetectorResult["clearances"][number]
  > = [];
  for (const item of parsed.obligation_results) {
    const binding = bindings.get(item.obligation_id);
    if (binding === undefined) return detectorInvalid();
    const subjectRefs = binding.subject_refs.map((subject) =>
      copySubjectRef(subject)
    );
    if (item.outcome === "risk") {
      if (item.severity === null) return detectorInvalid();
      candidates.push({
        obligation_id: binding.obligation_id,
        category: binding.category,
        severity: item.severity,
        confidence: confidence(item.confidence),
        reason_code: `sandbox_security_${binding.category}`,
        subject_refs: subjectRefs
      });
    } else {
      if (item.severity !== null) return detectorInvalid();
      clearances.push({
        obligation_id: binding.obligation_id,
        category: binding.category,
        confidence: confidence(item.confidence),
        subject_refs: subjectRefs
      });
    }
  }
  return deepFreeze({ candidates, clearances });
}

async function requestTransport(
  transport: SandboxSecurityHttpTransport,
  request: SandboxSecurityHttpTransport["request"],
  input: Readonly<SandboxSecurityHttpRequest>
): Promise<Readonly<SandboxSecurityHttpResponse>> {
  return Reflect.apply(request, transport, [input]) as Promise<
    Readonly<SandboxSecurityHttpResponse>
  >;
}

async function detect(
  transport: SandboxSecurityHttpTransport,
  request: SandboxSecurityHttpTransport["request"],
  dispatch: Readonly<JudgeProtocolDispatch>,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
  signal: AbortSignal,
  judgeRequestedModel: string,
  judgePromptProfile: SandboxSecurityOpenAiJudgePromptProfile | undefined
): Promise<Readonly<SandboxSecurityExternalDetectorResult>> {
  assertNotAborted(signal);
  const prepared = withDetectorValidation(() => ({
    bindings: obligationBindings(payload),
    body: dispatch.create_request(payload, {
      judge_requested_model: judgeRequestedModel
    }, judgePromptProfile).body
  }));
  const wire = await requestTransport(
    transport,
    request,
    Object.freeze({
      provider: "openai",
      operation: dispatch.operation,
      body: prepared.body,
      signal,
      max_response_bytes: MAX_RESPONSE_BYTES
    })
  );
  assertNotAborted(signal);
  return withDetectorValidation(() => {
    const response = normalizedResponse(wire);
    const parsed = dispatch.parse_response(response.body, payload);
    assertNotAborted(signal);
    return mapResult(parsed, prepared.bindings);
  });
}

export function createSandboxSecurityOpenAiJudgeDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  judge_protocol_id: SandboxSecurityJudgeProtocolId;
  judge_requested_model: string;
  judge_prompt_profile?: SandboxSecurityOpenAiJudgePromptProfile;
}>): SanitizedExternalDetector {
  return withDetectorValidation(() => {
    const inputValues = exactDataRecord(input, [
      "transport",
      "judge_protocol_id",
      "judge_requested_model"
    ], ["judge_prompt_profile"]);
    const transport = inputValues.get("transport") as SandboxSecurityHttpTransport;
    const dispatch = protocolDispatch(inputValues.get("judge_protocol_id"));
    const judgeRequestedModel = inputValues.get("judge_requested_model");
    if (
      typeof judgeRequestedModel !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(judgeRequestedModel)
    ) {
      return detectorInvalid();
    }
    const judgePromptProfile = inputValues.has("judge_prompt_profile")
      ? validateSandboxSecurityOpenAiJudgePromptProfile(
        inputValues.get("judge_prompt_profile")
      )
      : undefined;
    const transportValues = exactDataRecord(transport, ["request"]);
    const request = transportValues.get("request");
    if (typeof request !== "function") return detectorInvalid();
    return Object.freeze({
      async detect(
        payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
        signal: AbortSignal
      ) {
        return detect(
          transport,
          request as SandboxSecurityHttpTransport["request"],
          dispatch,
          payload,
          signal,
          judgeRequestedModel,
          judgePromptProfile
        );
      }
    });
  });
}
