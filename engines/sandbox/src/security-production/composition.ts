import {
  createSandboxSecurityDetectorRegistry,
  createSandboxSecurityEngine,
  type RawLocalDetector,
  type SandboxSecurityEngine,
  type SandboxSecurityRuntimePorts,
  type SandboxSecuritySanitizer,
  type SanitizedExternalDetector
} from "../security/index.ts";
import {
  createSandboxSecurityP6LiveCaptureEngine
} from "../security/engine.ts";
import {
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING
} from "./p6-live-capture-profile.ts";
import {
  createSandboxSecurityExternalPipeline
} from "./external-pipeline.ts";
import type {
  SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID,
  SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
  type SandboxSecurityJudgeProtocolId
} from "./judge-protocol-adapter.ts";
import {
  createSandboxSecurityOllamaLocalDetector,
  qualifySandboxSecurityOllama,
  type SandboxSecurityJudgeScreeningMode
} from "./ollama-local-detector.ts";
import {
  createSandboxSecurityProductionConfig,
  createSandboxSecurityProductionTransport,
  type SandboxSecurityProductionConfig,
  type SandboxSecurityProductionMode as ConfiguredProductionMode
} from "./production-config.ts";
import {
  createSandboxSecurityProductionRuleDetector
} from "./rule-detector.ts";

export type SandboxSecurityProductionMode = ConfiguredProductionMode;

export interface SandboxSecurityProductionCompositionPorts {
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
    qualification_timeout_ms: 1000 | 40000;
    judge_screening_mode: SandboxSecurityJudgeScreeningMode;
  }>): Promise<RawLocalDetector>;
  create_external_pipeline(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    judge_protocol_id: SandboxSecurityJudgeProtocolId;
    judge_requested_model: string;
  }>): Readonly<{
    sanitizer: SandboxSecuritySanitizer;
    judge: SanitizedExternalDetector;
  }>;
}

interface NormalizedCompositionInput {
  readonly runtime: SandboxSecurityRuntimePorts;
  readonly mode: SandboxSecurityProductionMode;
}

interface NormalizedLiveCaptureCompositionInput {
  readonly runtime: SandboxSecurityRuntimePorts;
}

interface SandboxSecurityCompositionEngineInput {
  readonly registry: ReturnType<
    typeof createSandboxSecurityDetectorRegistry
  >;
  readonly sanitizer?: SandboxSecuritySanitizer;
  readonly runtime: SandboxSecurityRuntimePorts;
}

type SandboxSecurityCompositionEngineFactory = (
  input: Readonly<SandboxSecurityCompositionEngineInput>
) => SandboxSecurityEngine;

const INVALID_COMPOSITION = "sandbox_security_production_composition_invalid";
const ORDINARY_QUALIFICATION_TIMEOUT_MS = 1000;
const LIVE_CAPTURE_QUALIFICATION_TIMEOUT_MS =
  SANDBOX_SECURITY_P6_LIVE_CAPTURE_TIMING.qualification_timeout_ms;
const MODES: readonly SandboxSecurityProductionMode[] = [
  "rule_only",
  "local",
  "local_and_judge"
];
const RUNTIME_METHODS = [
  "now",
  "nextDecisionId",
  "monotonicNowMs",
  "scheduleTimeout"
] as const;
const PORT_METHODS = [
  "create_config",
  "create_transport",
  "create_local_detector",
  "create_external_pipeline"
] as const;

function compositionInvalid(): never {
  const error = new TypeError(INVALID_COMPOSITION);
  error.name = INVALID_COMPOSITION;
  throw error;
}

function normalizedJudgeProtocolId(
  value: unknown
): SandboxSecurityJudgeProtocolId {
  if (
    value !== SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID &&
    value !== SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID
  ) {
    return compositionInvalid();
  }
  return value;
}

function cancelTimerBestEffort(cancel: () => void): void {
  try {
    cancel();
  } catch {
    // Cleanup cannot replace a settled qualification outcome.
  }
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
      return compositionInvalid();
    }
    const values = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        return compositionInvalid();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return compositionInvalid();
      }
      values.set(key, descriptor.value);
    }
    if (
      values.size !== expectedKeys.length ||
      expectedKeys.some((key) => !values.has(key))
    ) {
      return compositionInvalid();
    }
    return values;
  } catch {
    return compositionInvalid();
  }
}

function normalizedRuntime(value: unknown): SandboxSecurityRuntimePorts {
  const values = exactDataRecord(value, RUNTIME_METHODS);
  for (const method of RUNTIME_METHODS) {
    if (typeof values.get(method) !== "function") {
      return compositionInvalid();
    }
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

function normalizedInput(value: unknown): NormalizedCompositionInput {
  const values = exactDataRecord(value, ["runtime", "mode"]);
  const mode = values.get("mode");
  if (
    typeof mode !== "string" ||
    !MODES.includes(mode as SandboxSecurityProductionMode)
  ) {
    return compositionInvalid();
  }
  return Object.freeze({
    runtime: normalizedRuntime(values.get("runtime")),
    mode: mode as SandboxSecurityProductionMode
  });
}

function normalizedLiveCaptureInput(
  value: unknown
): NormalizedLiveCaptureCompositionInput {
  const values = exactDataRecord(value, ["runtime"]);
  return Object.freeze({
    runtime: normalizedRuntime(values.get("runtime"))
  });
}

function normalizedPorts(
  value: unknown
): Readonly<SandboxSecurityProductionCompositionPorts> {
  const values = exactDataRecord(value, PORT_METHODS);
  for (const method of PORT_METHODS) {
    if (typeof values.get(method) !== "function") {
      return compositionInvalid();
    }
  }
  return Object.freeze({
    create_config: values.get("create_config") as SandboxSecurityProductionCompositionPorts["create_config"],
    create_transport: values.get("create_transport") as SandboxSecurityProductionCompositionPorts["create_transport"],
    create_local_detector: values.get("create_local_detector") as SandboxSecurityProductionCompositionPorts["create_local_detector"],
    create_external_pipeline: values.get("create_external_pipeline") as SandboxSecurityProductionCompositionPorts["create_external_pipeline"]
  });
}

async function createDefaultLocalDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  expected_digest: string;
  signal: AbortSignal;
  qualification_timeout_ms: 1000 | 40000;
  judge_screening_mode: SandboxSecurityJudgeScreeningMode;
}>): Promise<RawLocalDetector> {
  if (input.qualification_timeout_ms !== ORDINARY_QUALIFICATION_TIMEOUT_MS) {
    return compositionInvalid();
  }
  const qualification = await qualifySandboxSecurityOllama({
    transport: input.transport,
    expected_digest: input.expected_digest,
    signal: input.signal
  });
  return createSandboxSecurityOllamaLocalDetector({
    transport: input.transport,
    qualification,
    judge_screening_mode: input.judge_screening_mode
  });
}

const DEFAULT_PORTS: Readonly<SandboxSecurityProductionCompositionPorts> =
  Object.freeze({
    create_config: createSandboxSecurityProductionConfig,
    create_transport: createSandboxSecurityProductionTransport,
    create_local_detector: createDefaultLocalDetector,
    create_external_pipeline: createSandboxSecurityExternalPipeline
  });

function createSandboxSecurityOrdinaryProductionEngine(
  input: Readonly<SandboxSecurityCompositionEngineInput>
): SandboxSecurityEngine {
  return createSandboxSecurityEngine({
    registry: input.registry,
    ...(input.sanitizer ? { sanitizer: input.sanitizer } : {}),
    runtime: input.runtime
  });
}

function createSandboxSecurityP6LiveCaptureProductionEngine(
  input: Readonly<SandboxSecurityCompositionEngineInput>
): SandboxSecurityEngine {
  return createSandboxSecurityP6LiveCaptureEngine({
    registry: input.registry,
    ...(input.sanitizer ? { sanitizer: input.sanitizer } : {}),
    runtime: input.runtime
  });
}

export async function createSandboxSecurityProductionComposition(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>
): Promise<SandboxSecurityEngine> {
  return createSandboxSecurityProductionCompositionWithPorts(
    input,
    DEFAULT_PORTS
  );
}

export async function createSandboxSecurityProductionCompositionWithPorts(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>,
  ports: Readonly<SandboxSecurityProductionCompositionPorts>
): Promise<SandboxSecurityEngine> {
  return createSandboxSecurityProductionCompositionWithQualificationTimeout(
    input,
    ports,
    ORDINARY_QUALIFICATION_TIMEOUT_MS,
    createSandboxSecurityOrdinaryProductionEngine
  );
}

export async function createSandboxSecurityProductionLiveCaptureCompositionWithPorts(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
  }>,
  ports: Readonly<SandboxSecurityProductionCompositionPorts>
): Promise<SandboxSecurityEngine> {
  const normalized = normalizedLiveCaptureInput(input);
  return createSandboxSecurityProductionCompositionWithQualificationTimeout(
    Object.freeze({
      runtime: normalized.runtime,
      mode: "local_and_judge"
    }),
    ports,
    LIVE_CAPTURE_QUALIFICATION_TIMEOUT_MS,
    createSandboxSecurityP6LiveCaptureProductionEngine
  );
}

async function createSandboxSecurityProductionCompositionWithQualificationTimeout(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>,
  ports: Readonly<SandboxSecurityProductionCompositionPorts>,
  qualificationTimeoutMs: 1000 | 40000,
  createEngine: SandboxSecurityCompositionEngineFactory
): Promise<SandboxSecurityEngine> {
  const normalized = normalizedInput(input);
  const factories = normalizedPorts(ports);
  const rule = createSandboxSecurityProductionRuleDetector();

  if (normalized.mode === "rule_only") {
    return createEngine({
      registry: createSandboxSecurityDetectorRegistry({ rule }),
      runtime: normalized.runtime
    });
  }

  const config = factories.create_config(normalized.mode);
  const expectedDigest = config.summary.ollama_digest;
  if (typeof expectedDigest !== "string") {
    return compositionInvalid();
  }
  const judgeConfig = normalized.mode === "local_and_judge"
    ? (() => {
        const judgeRequestedModel = config.summary.judge_requested_model;
        if (
          typeof judgeRequestedModel !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(judgeRequestedModel)
        ) {
          return compositionInvalid();
        }
        return Object.freeze({
          judge_protocol_id: normalizedJudgeProtocolId(
            config.summary.judge_protocol_id
          ),
          judge_requested_model: judgeRequestedModel
        });
      })()
    : null;
  const transport = factories.create_transport(config);
  const qualificationController = new AbortController();
  const cancelQualificationTimer = normalized.runtime.scheduleTimeout(
    qualificationTimeoutMs,
    () => qualificationController.abort()
  );
  if (typeof cancelQualificationTimer !== "function") {
    return compositionInvalid();
  }

  let local: RawLocalDetector;
  try {
    local = await factories.create_local_detector(Object.freeze({
      transport,
      expected_digest: expectedDigest,
      signal: qualificationController.signal,
      qualification_timeout_ms: qualificationTimeoutMs,
      judge_screening_mode:
        normalized.mode === "local_and_judge"
          ? "seven_domain_v2"
          : "disabled"
    }));
  } finally {
    cancelTimerBestEffort(cancelQualificationTimer);
  }

  if (normalized.mode === "local") {
    return createEngine({
      registry: createSandboxSecurityDetectorRegistry({ rule, local }),
      runtime: normalized.runtime
    });
  }

  if (judgeConfig === null) {
    return compositionInvalid();
  }
  const pipeline = factories.create_external_pipeline({
    transport,
    judge_protocol_id: judgeConfig.judge_protocol_id,
    judge_requested_model: judgeConfig.judge_requested_model
  });
  return createEngine({
    registry: createSandboxSecurityDetectorRegistry({
      rule,
      local,
      judge: pipeline.judge
    }),
    sanitizer: pipeline.sanitizer,
    runtime: normalized.runtime
  });
}
