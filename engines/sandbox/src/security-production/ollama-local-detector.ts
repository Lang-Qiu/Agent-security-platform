import type {
  RawLocalDetector,
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate
} from "../security/index.ts";
import {
  equalSandboxSecurityNormalizedDigest,
  type SandboxSecurityHttpRequest,
  type SandboxSecurityHttpResponse,
  type SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  createSandboxSecurityOllamaChatRequest,
  createSandboxSecurityOllamaPrewarmRequest,
  parseSandboxSecurityOllamaChatResponse
} from "./ollama-contract.ts";
import {
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  type SandboxSecurityReplayOllamaResponse
} from "./provider-outcomes.ts";
import {
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING
} from "./p6-live-capture-profile.ts";

export interface SandboxSecurityOllamaQualification {
  readonly summary: Readonly<{
    readonly ollama_digest: string;
    readonly warmed_probe_latency_ms: number;
  }>;
}

interface QualificationBinding {
  readonly transport: SandboxSecurityHttpTransport;
  readonly request: SandboxSecurityHttpTransport["request"];
  readonly ollama_digest: string;
  readonly construction_generation: symbol;
}

type ParsedLocalCandidate = SandboxSecurityReplayOllamaResponse["message"]["parsed"]["candidates"][number];
type ParsedLocalSubjectRef = ParsedLocalCandidate["subject_refs"][number];

export type SandboxSecurityJudgeScreeningMode =
  | "disabled"
  | "seven_domain_v2";

const NORMALIZED_DIGEST = /^sha256:[a-f0-9]{64}$/;
const WIRE_DIGEST = /^[a-f0-9]{64}$/;
const MAX_RESPONSE_BYTES = 65536;
const ORDINARY_WARMED_PROBE_LATENCY_MS = 40000;
const LIVE_CAPTURE_WARMED_PROBE_LATENCY_MS =
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms;
const DECODER = new TextDecoder("utf-8", { fatal: true });
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  "byteLength"
)?.get;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const ABORT_SIGNAL_ABORTED_GETTER = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted"
)?.get;
const SEVEN_DOMAIN_SCREENING_CATEGORIES = Object.freeze([
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "unsafe_side_effect",
  "trust_boundary_violation"
] as const);
const QUALIFICATION_BINDINGS = new WeakMap<
  Readonly<SandboxSecurityOllamaQualification>,
  QualificationBinding
>();

function qualificationInvalid(): never {
  throw new TypeError("sandbox_security_ollama_qualification_invalid");
}

function detectorInvalid(): never {
  throw new TypeError("sandbox_security_ollama_detector_invalid");
}

function withDetectorValidation<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return detectorInvalid();
  }
}

function withQualificationValidation<T>(action: () => T): T {
  try {
    return action();
  } catch {
    return qualificationInvalid();
  }
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): ReadonlyMap<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return qualificationInvalid();
  }
  const values = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return qualificationInvalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return qualificationInvalid();
    }
    values.set(key, descriptor.value);
  }
  if (
    values.size !== expectedKeys.length ||
    expectedKeys.some((key) => !values.has(key))
  ) {
    return qualificationInvalid();
  }
  return values;
}

function nativeSignalAborted(value: unknown): boolean {
  if (
    !(value instanceof AbortSignal) ||
    ABORT_SIGNAL_ABORTED_GETTER === undefined
  ) {
    return qualificationInvalid();
  }
  try {
    const aborted = Reflect.apply(ABORT_SIGNAL_ABORTED_GETTER, value, []);
    return typeof aborted === "boolean" ? aborted : qualificationInvalid();
  } catch {
    return qualificationInvalid();
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (nativeSignalAborted(signal)) {
    qualificationInvalid();
  }
}

function transportRequestMethod(
  value: unknown
): SandboxSecurityHttpTransport["request"] {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return qualificationInvalid();
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "request");
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function"
  ) {
    return qualificationInvalid();
  }
  return descriptor.value as SandboxSecurityHttpTransport["request"];
}

function responseBytes(value: unknown): Uint8Array {
  if (
    !(value instanceof Uint8Array) ||
    TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined
  ) {
    return qualificationInvalid();
  }
  const byteLength = Reflect.apply(
    TYPED_ARRAY_BYTE_LENGTH_GETTER,
    value,
    []
  ) as number;
  if (byteLength > MAX_RESPONSE_BYTES) {
    return qualificationInvalid();
  }
  const copy = new Uint8Array(byteLength);
  Reflect.apply(UINT8_ARRAY_SET, copy, [value]);
  return copy;
}

function normalizedResponse(
  value: unknown,
  operation: "model_inventory" | "chat"
): Readonly<{
  status: 200;
  content_type: "application/json";
  body: Uint8Array;
  verified_ollama_digest?: string;
}> {
  const expectedKeys = operation === "model_inventory"
    ? ["status", "content_type", "body"]
    : ["status", "content_type", "body", "verified_ollama_digest"];
  const values = exactDataRecord(value, expectedKeys);
  if (values.get("status") !== 200 || values.get("content_type") !== "application/json") {
    return qualificationInvalid();
  }
  const body = responseBytes(values.get("body"));
  if (operation === "model_inventory") {
    return Object.freeze({
      status: 200,
      content_type: "application/json",
      body
    });
  }
  const verifiedDigest = values.get("verified_ollama_digest");
  if (typeof verifiedDigest !== "string" || !NORMALIZED_DIGEST.test(verifiedDigest)) {
    return qualificationInvalid();
  }
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body,
    verified_ollama_digest: verifiedDigest
  });
}

function inventoryDigest(body: Uint8Array, expectedDigest: string): string {
  const parsed = JSON.parse(DECODER.decode(body)) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return qualificationInvalid();
  }
  const modelsDescriptor = Object.getOwnPropertyDescriptor(parsed, "models");
  if (
    modelsDescriptor === undefined ||
    !("value" in modelsDescriptor) ||
    !Array.isArray(modelsDescriptor.value) ||
    Object.getPrototypeOf(modelsDescriptor.value) !== Array.prototype
  ) {
    return qualificationInvalid();
  }

  const matchingModels: Record<string, unknown>[] = [];
  for (const candidate of modelsDescriptor.value as unknown[]) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate) ||
      Object.getPrototypeOf(candidate) !== Object.prototype
    ) {
      continue;
    }
    const name = Object.getOwnPropertyDescriptor(candidate, "name");
    const model = Object.getOwnPropertyDescriptor(candidate, "model");
    if (
      name !== undefined &&
      "value" in name &&
      name.value === "qwen3:8b" &&
      model !== undefined &&
      "value" in model &&
      model.value === "qwen3:8b"
    ) {
      matchingModels.push(candidate as Record<string, unknown>);
    }
  }
  if (matchingModels.length !== 1) {
    return qualificationInvalid();
  }
  const matching = matchingModels[0];
  if (
    matching === undefined ||
    Object.hasOwn(matching, "remote_model") ||
    Object.hasOwn(matching, "remote_host")
  ) {
    return qualificationInvalid();
  }
  const digestDescriptor = Object.getOwnPropertyDescriptor(matching, "digest");
  if (
    digestDescriptor === undefined ||
    !("value" in digestDescriptor) ||
    typeof digestDescriptor.value !== "string" ||
    !WIRE_DIGEST.test(digestDescriptor.value)
  ) {
    return qualificationInvalid();
  }
  const normalized = normalizeSandboxSecurityReplayOllamaInventoryResponse({
    model: "qwen3:8b",
    digest: `sha256:${digestDescriptor.value}`
  });
  if (!equalSandboxSecurityNormalizedDigest(normalized.digest, expectedDigest)) {
    return qualificationInvalid();
  }
  return normalized.digest;
}

function qualificationInput(value: unknown): Readonly<{
  transport: SandboxSecurityHttpTransport;
  request: SandboxSecurityHttpTransport["request"];
  expected_digest: string;
  signal: AbortSignal;
}> {
  return withQualificationValidation(() => {
    const values = exactDataRecord(value, [
      "transport",
      "expected_digest",
      "signal"
    ]);
    const transport = values.get("transport") as SandboxSecurityHttpTransport;
    const request = transportRequestMethod(transport);
    const expectedDigest = values.get("expected_digest");
    const signal = values.get("signal");
    if (
      typeof expectedDigest !== "string" ||
      !NORMALIZED_DIGEST.test(expectedDigest) ||
      !(signal instanceof AbortSignal)
    ) {
      return qualificationInvalid();
    }
    nativeSignalAborted(signal);
    return Object.freeze({
      transport,
      request,
      expected_digest: expectedDigest,
      signal
    });
  });
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

async function qualifySandboxSecurityOllamaWithWarmedProbeLatencyLimit(
  input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>,
  warmedProbeLatencyLimit: 1000 | 40000
): Promise<Readonly<SandboxSecurityOllamaQualification>> {
  const normalized = qualificationInput(input);
  assertNotAborted(normalized.signal);
  const inventoryWire = await requestTransport(
    normalized.transport,
    normalized.request,
    Object.freeze({
      provider: "ollama",
      operation: "model_inventory",
      signal: normalized.signal,
      max_response_bytes: MAX_RESPONSE_BYTES
    })
  );
  assertNotAborted(normalized.signal);
  const digest = withQualificationValidation(() => {
    const response = normalizedResponse(inventoryWire, "model_inventory");
    return inventoryDigest(response.body, normalized.expected_digest);
  });

  assertNotAborted(normalized.signal);
  const prewarmBody = createSandboxSecurityOllamaPrewarmRequest().body;
  const prewarmStart = performance.now();
  const prewarmWire = await requestTransport(
    normalized.transport,
    normalized.request,
    Object.freeze({
      provider: "ollama",
      operation: "chat",
      body: prewarmBody,
      signal: normalized.signal,
      max_response_bytes: MAX_RESPONSE_BYTES
    })
  );
  assertNotAborted(normalized.signal);
  withQualificationValidation(() => {
    const response = normalizedResponse(prewarmWire, "chat");
    if (
      response.verified_ollama_digest === undefined ||
      !equalSandboxSecurityNormalizedDigest(
        response.verified_ollama_digest,
        digest
      )
    ) {
      return qualificationInvalid();
    }
    parseSandboxSecurityOllamaChatResponse(
      response.body,
      response.verified_ollama_digest
    );
  });
  assertNotAborted(normalized.signal);
  const prewarmEnd = performance.now();
  const warmedProbeLatency = prewarmEnd - prewarmStart;
  const qualification = withQualificationValidation(() => {
    if (
      !Number.isFinite(warmedProbeLatency) ||
      warmedProbeLatency < 0 ||
      warmedProbeLatency > warmedProbeLatencyLimit
    ) {
      return qualificationInvalid();
    }
    const view: Readonly<SandboxSecurityOllamaQualification> = Object.freeze({
      summary: Object.freeze({
        ollama_digest: digest,
        warmed_probe_latency_ms: warmedProbeLatency
      })
    });
    QUALIFICATION_BINDINGS.set(view, Object.freeze({
      transport: normalized.transport,
      request: normalized.request,
      ollama_digest: digest,
      construction_generation: Symbol("sandbox_security_ollama_construction")
    }));
    return view;
  });
  assertNotAborted(normalized.signal);
  return qualification;
}

export async function qualifySandboxSecurityOllama(
  input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>
): Promise<Readonly<SandboxSecurityOllamaQualification>> {
  return qualifySandboxSecurityOllamaWithWarmedProbeLatencyLimit(
    input,
    ORDINARY_WARMED_PROBE_LATENCY_MS
  );
}

export async function qualifySandboxSecurityP6LiveCaptureOllama(
  input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>
): Promise<Readonly<SandboxSecurityOllamaQualification>> {
  return qualifySandboxSecurityOllamaWithWarmedProbeLatencyLimit(
    input,
    LIVE_CAPTURE_WARMED_PROBE_LATENCY_MS
  );
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    seen.has(value)
  ) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function mapSubjectRef(
  subject: ParsedLocalSubjectRef,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): SandboxSecurityCandidateSubjectRef {
  if (subject.kind === "content_source") {
    const source = snapshot.contents[subject.source_ordinal - 1];
    if (source === undefined || typeof source.source_handle !== "string") {
      return detectorInvalid();
    }
    return {
      kind: "content_source",
      source_handle: source.source_handle,
      locator: { kind: "whole_source" }
    };
  }

  const tool = snapshot.tool_request;
  if (tool === undefined || typeof tool.call_handle !== "string") {
    return detectorInvalid();
  }
  if (subject.component === "target") {
    if (
      tool.has_target !== true ||
      typeof tool.target !== "string" ||
      tool.target.length === 0
    ) {
      return detectorInvalid();
    }
    return {
      kind: "tool_request",
      call_handle: tool.call_handle,
      component: "target"
    };
  }
  if (subject.component === "arguments") {
    return {
      kind: "tool_request",
      call_handle: tool.call_handle,
      component: "arguments",
      locator: { kind: "whole_arguments" }
    };
  }
  return {
    kind: "tool_request",
    call_handle: tool.call_handle,
    component: subject.component
  };
}

function mapCandidate(
  candidate: ParsedLocalCandidate,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): SandboxSecurityRiskCandidate {
  const confidence = candidate.confidence === "uncertain"
    ? 0.6
    : candidate.confidence === "probable"
      ? 0.8
      : 0.9;
  return {
    category: candidate.category,
    severity: candidate.severity,
    confidence,
    reason_code: `sandbox_security_${candidate.category}`,
    subject_refs: candidate.subject_refs.map((subject) =>
      mapSubjectRef(subject, snapshot)
    )
  };
}

function sevenDomainSubjectRefs(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): SandboxSecurityCandidateSubjectRef[] {
  const subjectCount =
    snapshot.contents.length + (snapshot.tool_request === undefined ? 0 : 1);
  if (subjectCount === 0 || subjectCount > 8) return detectorInvalid();
  const refs: SandboxSecurityCandidateSubjectRef[] = snapshot.contents.map(
    (source) => ({
      kind: "content_source" as const,
      source_handle: source.source_handle,
      locator: { kind: "whole_source" as const }
    })
  );
  if (snapshot.tool_request !== undefined) {
    refs.push({
      kind: "tool_request",
      call_handle: snapshot.tool_request.call_handle,
      component: "whole_call"
    });
  }
  return refs;
}

function sevenDomainScreeningResult(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): SandboxSecurityRawDetectorResult {
  return {
    candidates: SEVEN_DOMAIN_SCREENING_CATEGORIES.map((category) => ({
      category,
      severity: "low",
      confidence: 0.6,
      reason_code: `sandbox_security_${category}`,
      subject_refs: sevenDomainSubjectRefs(snapshot)
    })),
    clearances: []
  };
}

async function detectWithBinding(
  binding: QualificationBinding,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  signal: AbortSignal,
  judgeScreeningMode: SandboxSecurityJudgeScreeningMode
): Promise<SandboxSecurityRawDetectorResult> {
  const body = withDetectorValidation(() =>
    createSandboxSecurityOllamaChatRequest(snapshot).body
  );
  const wire = await requestTransport(
    binding.transport,
    binding.request,
    Object.freeze({
      provider: "ollama",
      operation: "chat",
      body,
      signal,
      max_response_bytes: MAX_RESPONSE_BYTES
    })
  );
  return withDetectorValidation(() => {
    if (nativeSignalAborted(signal)) {
      return detectorInvalid();
    }
    const response = normalizedResponse(wire, "chat");
    if (
      response.verified_ollama_digest === undefined ||
      !equalSandboxSecurityNormalizedDigest(
        response.verified_ollama_digest,
        binding.ollama_digest
      )
    ) {
      return detectorInvalid();
    }
    const parsed = parseSandboxSecurityOllamaChatResponse(
      response.body,
      response.verified_ollama_digest
    );
    if (judgeScreeningMode === "seven_domain_v2") {
      return deepFreeze(sevenDomainScreeningResult(snapshot));
    }
    const result: SandboxSecurityRawDetectorResult = {
      candidates: parsed.message.parsed.status === "no_match"
        ? []
        : parsed.message.parsed.candidates.map((candidate) =>
            mapCandidate(candidate, snapshot)
          ),
      clearances: []
    };
    return deepFreeze(result);
  });
}

export function createSandboxSecurityOllamaLocalDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  qualification: Readonly<SandboxSecurityOllamaQualification>;
  judge_screening_mode?: SandboxSecurityJudgeScreeningMode;
}>): RawLocalDetector {
  return withQualificationValidation(() => {
    let hasScreeningMode: boolean;
    try {
      hasScreeningMode = Reflect.ownKeys(input).includes(
        "judge_screening_mode"
      );
    } catch {
      return qualificationInvalid();
    }
    const values = exactDataRecord(
      input,
      hasScreeningMode
        ? ["transport", "qualification", "judge_screening_mode"]
        : ["transport", "qualification"]
    );
    const transport = values.get("transport");
    const qualification = values.get("qualification");
    const judgeScreeningMode = hasScreeningMode
      ? values.get("judge_screening_mode")
      : "disabled";
    if (
      (typeof qualification !== "object" || qualification === null) ||
      (typeof transport !== "object" && typeof transport !== "function") ||
      transport === null ||
      (judgeScreeningMode !== "disabled" &&
        judgeScreeningMode !== "seven_domain_v2")
    ) {
      return qualificationInvalid();
    }
    const binding = QUALIFICATION_BINDINGS.get(
      qualification as Readonly<SandboxSecurityOllamaQualification>
    );
    if (binding === undefined || binding.transport !== transport) {
      return qualificationInvalid();
    }
    QUALIFICATION_BINDINGS.delete(
      qualification as Readonly<SandboxSecurityOllamaQualification>
    );
    void binding.construction_generation;
    return Object.freeze({
      async detect(
        snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
        signal: AbortSignal
      ) {
        return detectWithBinding(
          binding,
          snapshot,
          signal,
          judgeScreeningMode
        );
      }
    });
  });
}
