import {
  SANDBOX_SECURITY_RISK_CATEGORIES,
  type SandboxSecurityAction,
  type SandboxSecurityDecision,
  type SandboxSecurityJsonValue
} from "../../../../../shared/index.ts";

import {
  normalizeOpenClawSecurityConfig,
  type OpenClawSandboxSecurityConfig
} from "./config.ts";
import {
  createOpenClawSecurityRuntime,
  type OpenClawSecurityAuditEventId,
  type OpenClawSecurityEngineFactory,
  type OpenClawSecurityEvaluationRequestId,
  type OpenClawSecurityHealth,
  type OpenClawSecurityInterruptionCode,
  type OpenClawSecurityRuntime,
  type OpenClawSecurityRuntimePorts
} from "./runtime.ts";
import {
  buildOpenClawSecurityEvaluationRequest,
  type OpenClawSecurityAssistantProjection,
  type OpenClawSecurityBarrierObservation,
  type OpenClawSecurityCorrelation
} from "./authority-builder.ts";
import {
  mapDecision,
  type OpenClawSecurityActionMapping,
  type OpenClawSecurityBarrierResult,
  type OpenClawSecurityEnforcementPoint,
  type OpenClawSecurityFailureCode
} from "./action-mapper.ts";
import {
  createOpenClawSecurityAuditClient,
  type OpenClawSecurityAuditClient,
  type OpenClawSecurityAuditTransport
} from "./audit-client.ts";

export const OPENCLAW_SECURITY_HOOK_NAMES = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
] as const;

export type OpenClawSecurityHookName =
  (typeof OPENCLAW_SECURITY_HOOK_NAMES)[number];

export const OPENCLAW_SECURITY_HOOK_PRIORITY = 1000 as const;
export const OPENCLAW_SECURITY_HOOK_TIMEOUT_MS = 10000 as const;

export const OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA =
  "openclaw-security-hook-event.v1" as const;
export const OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA =
  "openclaw-security-turn-context.v1" as const;
export const OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA =
  "openclaw-security-hook-result.v1" as const;

export interface OpenClawSecurityHookEnvelope {
  readonly schema_version: typeof OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA;
  readonly correlation: OpenClawSecurityCorrelation;
  readonly health: OpenClawSecurityHealth;
  readonly barrier: OpenClawSecurityBarrierResult;
}

export interface OpenClawSecurityOpaqueRunState {
  readonly runId: string;
  readonly sessionKey: string;
  readonly state: "active";
  readonly callIds: readonly string[];
}

export interface OpenClawSecurityPluginApi {
  readonly on: (
    name: OpenClawSecurityHookName,
    handler: (event: unknown, context: unknown) => Promise<unknown>,
    options: Readonly<{ priority: 1000; timeoutMs: 10000 }>
  ) => void;
}

export interface OpenClawSecurityPlugin {
  readonly register: (api: unknown) => void;
  readonly health: () => Readonly<OpenClawSecurityHealth>;
  readonly inspectOpaqueState: () => readonly OpenClawSecurityOpaqueRunState[];
}

type RecordValue = Record<string, unknown>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const RUN_STATUS_CATALOG = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const;

const COMPOSITION_BINDINGS = Object.freeze({
  rule_only: "sandbox-security-production-composition.v1:rule_only",
  local: "sandbox-security-production-composition.v1:local",
  local_and_judge: "sandbox-security-production-composition.v1:local_and_judge"
} as const);

const AUDITABLE_INTERRUPTION_CODES = new Set([
  "authority_mismatch",
  "correlation_mismatch",
  "unsupported_input",
  "engine_error",
  "engine_timeout",
  "engine_slot_unavailable",
  "barrier_timeout",
  "startup_recovery"
]);

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
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

function isPlainRecord(value: unknown): value is RecordValue {
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
): value is RecordValue {
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

function readIdentifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value)
    ? value
    : null;
}

function stageForPoint(
  point: OpenClawSecurityEnforcementPoint
): "user_input" | "model_output" | "tool_request" {
  switch (point) {
    case "before_agent_run":
      return "user_input";
    case "before_tool_execution":
      return "tool_request";
    default:
      return "model_output";
  }
}

/**
 * Best-effort correlation identity used only to shape a fail-closed envelope.
 * It never feeds authority, the Engine, or audit.
 */
function readFallbackCorrelation(
  event: unknown,
  context: unknown,
  point: OpenClawSecurityEnforcementPoint
): OpenClawSecurityCorrelation | null {
  const eventRecord = isPlainRecord(event) ? event : {};
  const contextRecord = isPlainRecord(context) ? context : {};
  const runId =
    readIdentifier(eventRecord.runId) ?? readIdentifier(contextRecord.runId);
  const sessionKey =
    readIdentifier(eventRecord.sessionKey) ??
    readIdentifier(contextRecord.sessionKey);
  if (runId === null || sessionKey === null) {
    return null;
  }
  const callId =
    point === "before_tool_execution"
      ? readIdentifier(eventRecord.callId)
      : null;
  return { runId, sessionKey, callId };
}

type NormalizedHostInput = Readonly<{
  correlation: OpenClawSecurityCorrelation;
  observation: OpenClawSecurityBarrierObservation;
}>;

function normalizeAssistantShape(
  value: unknown
): OpenClawSecurityAssistantProjection | null {
  if (
    !hasExactOwnDataProperties(value, [
      "schema_version",
      "text_parts",
      "tool_calls"
    ]) ||
    value.schema_version !== "openclaw-security-assistant-projection.v1" ||
    !Array.isArray(value.text_parts) ||
    !Array.isArray(value.tool_calls)
  ) {
    return null;
  }
  return value as unknown as OpenClawSecurityAssistantProjection;
}

/**
 * Exact-normalizes the host event/context pair for one point. Structural
 * failure here happens before any evaluation identity exists, so the caller
 * fails closed without Engine or audit work.
 */
function normalizeHostInput(
  point: OpenClawSecurityEnforcementPoint,
  event: unknown,
  context: unknown
): NormalizedHostInput | null {
  if (
    !hasExactOwnDataProperties(context, [
      "schema_version",
      "prompt",
      "runId",
      "sessionKey"
    ]) ||
    context.schema_version !== OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA ||
    typeof context.prompt !== "string"
  ) {
    return null;
  }

  const contextRunId = readIdentifier(context.runId);
  const contextSessionKey = readIdentifier(context.sessionKey);
  if (contextRunId === null || contextSessionKey === null) {
    return null;
  }

  const requiredEventKeys: readonly string[] =
    point === "before_agent_run"
      ? ["schema_version", "runId", "sessionKey"]
      : point === "before_model_output_delivery"
        ? ["schema_version", "runId", "sessionKey", "assistant"]
        : point === "before_tool_execution"
          ? ["schema_version", "runId", "sessionKey", "callId", "assistant", "tool"]
          : ["schema_version", "runId", "sessionKey", "outbound"];

  if (
    !hasExactOwnDataProperties(event, requiredEventKeys) ||
    event.schema_version !== OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA
  ) {
    return null;
  }

  const eventRunId = readIdentifier(event.runId);
  const eventSessionKey = readIdentifier(event.sessionKey);
  if (
    eventRunId === null ||
    eventSessionKey === null ||
    eventRunId !== contextRunId ||
    eventSessionKey !== contextSessionKey
  ) {
    return null;
  }

  const prompt = context.prompt;

  if (point === "before_agent_run") {
    const correlation: OpenClawSecurityCorrelation = {
      runId: eventRunId,
      sessionKey: eventSessionKey,
      callId: null
    };
    return {
      correlation,
      observation: { point, correlation, prompt }
    };
  }

  if (point === "before_model_output_delivery") {
    const assistant = normalizeAssistantShape(event.assistant);
    if (assistant === null) return null;
    const correlation: OpenClawSecurityCorrelation = {
      runId: eventRunId,
      sessionKey: eventSessionKey,
      callId: null
    };
    return {
      correlation,
      observation: { point, correlation, prompt, assistant }
    };
  }

  if (point === "before_tool_execution") {
    const assistant = normalizeAssistantShape(event.assistant);
    const callId = readIdentifier(event.callId);
    if (
      assistant === null ||
      callId === null ||
      !hasExactOwnDataProperties(event.tool, [
        "call_id",
        "tool_name",
        "arguments"
      ])
    ) {
      return null;
    }
    const tool = event.tool as Readonly<{
      call_id: string;
      tool_name: string;
      arguments: SandboxSecurityJsonValue;
    }>;
    if (readIdentifier(tool.call_id) !== callId) {
      return null;
    }
    const correlation: OpenClawSecurityCorrelation = {
      runId: eventRunId,
      sessionKey: eventSessionKey,
      callId
    };
    return {
      correlation,
      observation: { point, correlation, prompt, assistant, tool }
    };
  }

  if (
    typeof event.outbound !== "string" &&
    (event.outbound === undefined || event.outbound === null)
  ) {
    return null;
  }
  const correlation: OpenClawSecurityCorrelation = {
    runId: eventRunId,
    sessionKey: eventSessionKey,
    callId: null
  };
  return {
    correlation,
    observation: {
      point,
      correlation,
      prompt,
      outbound: event.outbound as string | SandboxSecurityJsonValue
    }
  };
}

function countCategories(
  decision: Readonly<SandboxSecurityDecision>
): RecordValue {
  const counts: RecordValue = {};
  for (const category of SANDBOX_SECURITY_RISK_CATEGORIES) {
    counts[category] = 0;
  }
  for (const finding of decision.findings) {
    if (Object.hasOwn(counts, finding.category)) {
      counts[finding.category] = (counts[finding.category] as number) + 1;
    }
  }
  return counts;
}

function countRunStatuses(
  decision: Readonly<SandboxSecurityDecision>
): RecordValue {
  const counts: RecordValue = {};
  for (const status of RUN_STATUS_CATALOG) {
    counts[status] = 0;
  }
  for (const run of decision.detector_runs) {
    if (Object.hasOwn(counts, run.status)) {
      counts[run.status] = (counts[run.status] as number) + 1;
    }
  }
  return counts;
}

function clampElapsedMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(60000, Math.round(value));
}

export async function createOpenClawSecurityPlugin(input: Readonly<{
  config: unknown;
  runtime_ports: OpenClawSecurityRuntimePorts;
  audit_transport: OpenClawSecurityAuditTransport;
  engine_factory?: OpenClawSecurityEngineFactory;
}>): Promise<Readonly<OpenClawSecurityPlugin>> {
  if (
    !hasExactOwnDataProperties(
      input,
      ["config", "runtime_ports", "audit_transport"],
      ["engine_factory"]
    )
  ) {
    throw new Error("openclaw security plugin input invalid");
  }

  const runtimePorts = input.runtime_ports;
  if (
    runtimePorts === null ||
    typeof runtimePorts !== "object" ||
    typeof runtimePorts.nextEvaluationRequestId !== "function" ||
    typeof runtimePorts.nextAuditEventId !== "function"
  ) {
    throw new Error("openclaw security plugin runtime ports invalid");
  }

  // Startup validates config strictly before any hook can be registered.
  const config: Readonly<OpenClawSandboxSecurityConfig> =
    normalizeOpenClawSecurityConfig(input.config, {
      internalAuditOrigins: runtimePorts.internalAuditOrigins
    });

  const runtime: Readonly<OpenClawSecurityRuntime> =
    await createOpenClawSecurityRuntime({
      config,
      runtimePorts,
      ...(input.engine_factory === undefined
        ? {}
        : { engineFactory: input.engine_factory })
    });

  const auditClient: Readonly<OpenClawSecurityAuditClient> =
    createOpenClawSecurityAuditClient({
      endpoint: config.auditEndpoint,
      bearer_token: config.auditCapabilityToken,
      transport: input.audit_transport,
      markAuditDegraded: (reason: unknown) => runtime.markAuditDegraded(reason),
      scheduleTimeout: runtimePorts.scheduleTimeout
    });

  const compositionBinding = COMPOSITION_BINDINGS[config.productionMode];

  type RunState = { sessionKey: string; callIds: Set<string>; active: number };
  const opaqueState = new Map<string, RunState>();

  const enterState = (correlation: OpenClawSecurityCorrelation): void => {
    const existing = opaqueState.get(correlation.runId);
    if (existing === undefined) {
      opaqueState.set(correlation.runId, {
        sessionKey: correlation.sessionKey,
        callIds: new Set(correlation.callId === null ? [] : [correlation.callId]),
        active: 1
      });
      return;
    }
    existing.active += 1;
    if (correlation.callId !== null) {
      existing.callIds.add(correlation.callId);
    }
  };

  const leaveState = (correlation: OpenClawSecurityCorrelation): void => {
    const existing = opaqueState.get(correlation.runId);
    if (existing === undefined) return;
    existing.active -= 1;
    if (existing.active <= 0) {
      opaqueState.delete(correlation.runId);
    }
  };

  const inspectOpaqueState = (): readonly OpenClawSecurityOpaqueRunState[] =>
    deepFreeze(
      [...opaqueState.entries()].map(([runId, state]) => ({
        runId,
        sessionKey: state.sessionKey,
        state: "active" as const,
        callIds: [...state.callIds]
      }))
    );

  const envelope = (
    correlation: OpenClawSecurityCorrelation,
    barrier: OpenClawSecurityBarrierResult
  ): Readonly<OpenClawSecurityHookEnvelope> => {
    const health = runtime.health();
    const effectiveBarrier =
      health.enforcement === "failed"
        ? mapDecision({
            point: "before_tool_execution",
            failure: "startup_recovery"
          }).barrier
        : barrier;
    return deepFreeze({
      schema_version: OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA,
      correlation: {
        runId: correlation.runId,
        sessionKey: correlation.sessionKey,
        callId: correlation.callId
      },
      health: { enforcement: health.enforcement, audit: health.audit },
      barrier: effectiveBarrier
    });
  };

  const failureBarrier = (
    point: OpenClawSecurityEnforcementPoint,
    failure: OpenClawSecurityFailureCode
  ): Readonly<OpenClawSecurityActionMapping> =>
    mapDecision({ point, failure });

  const attemptAudit = async (
    projection: RecordValue
  ): Promise<void> => {
    const issued = runtime.nextAuditEventId();
    if (issued.kind === "interrupted") {
      return;
    }
    const eventId: OpenClawSecurityAuditEventId = issued.eventId;
    await auditClient.append(deepFreeze({ ...projection, event_id: eventId }));
  };

  const completedProjection = (
    point: OpenClawSecurityEnforcementPoint,
    requestId: OpenClawSecurityEvaluationRequestId,
    decision: Readonly<SandboxSecurityDecision>,
    mapping: Readonly<OpenClawSecurityActionMapping>,
    elapsedMs: number
  ): RecordValue => ({
    schema_version: "sandbox-security-enforcement-audit-request.v1",
    request_id: requestId,
    enforcement_point: point,
    stage: stageForPoint(point),
    policy_profile_id: config.policyProfileId,
    composition_binding: compositionBinding,
    elapsed_ms: clampElapsedMs(elapsedMs),
    event_type: "enforcement_completed",
    verdict: decision.verdict,
    action: decision.action,
    risk_level: decision.risk_level,
    category_counts: countCategories(decision),
    detector_run_status_counts: countRunStatuses(decision),
    host_outcome: mapping.host_outcome
  });

  const interruptedProjection = (
    point: OpenClawSecurityEnforcementPoint,
    requestId: OpenClawSecurityEvaluationRequestId,
    code: string,
    appliedAction: SandboxSecurityAction,
    elapsedMs: number
  ): RecordValue | null => {
    if (!AUDITABLE_INTERRUPTION_CODES.has(code)) return null;
    if (appliedAction !== "ask" && appliedAction !== "deny") return null;
    return {
      schema_version: "sandbox-security-enforcement-audit-request.v1",
      request_id: requestId,
      enforcement_point: point,
      stage: stageForPoint(point),
      policy_profile_id: config.policyProfileId,
      composition_binding: compositionBinding,
      elapsed_ms: clampElapsedMs(elapsedMs),
      event_type: "enforcement_interrupted",
      interruption_code: code,
      applied_fail_closed_action: appliedAction
    };
  };

  const handle = async (
    point: OpenClawSecurityEnforcementPoint,
    event: unknown,
    context: unknown
  ): Promise<Readonly<OpenClawSecurityHookEnvelope>> => {
    const startedAtMs = runtimePorts.monotonicNowMs();

    // 1. Exact host normalization, before any evaluation identity exists.
    const normalized = normalizeHostInput(point, event, context);
    if (normalized === null) {
      const fallback = readFallbackCorrelation(event, context, point);
      if (fallback === null) {
        const error = new Error("openclaw security host input unusable");
        error.name = "openclaw_security_host_input_invalid";
        throw error;
      }
      return envelope(fallback, failureBarrier(point, "unsupported_input").barrier);
    }

    const { correlation, observation } = normalized;

    // 2. Exactly one trusted evaluation request ID.
    const issuedRequest = runtime.nextEvaluationRequestId();
    if (issuedRequest.kind === "interrupted") {
      return envelope(
        correlation,
        failureBarrier(point, "request_id_unavailable").barrier
      );
    }
    const requestId = issuedRequest.requestId;

    enterState(correlation);
    try {
      // 3. Authority from normalized values plus the issued ID.
      let request;
      try {
        request = buildOpenClawSecurityEvaluationRequest({
          observation,
          policy_profile_id: config.policyProfileId,
          issued_request_id: requestId
        });
      } catch {
        const mapping = failureBarrier(point, "unsupported_input");
        const projection = interruptedProjection(
          point,
          requestId,
          "unsupported_input",
          mapping.applied_action,
          runtimePorts.monotonicNowMs() - startedAtMs
        );
        if (projection !== null) await attemptAudit(projection);
        return envelope(correlation, mapping.barrier);
      }

      // 4. Evaluate.
      const result = await runtime.tryEvaluate(request);

      if (result.kind === "interrupted") {
        const code: OpenClawSecurityInterruptionCode = result.code;
        const failure: OpenClawSecurityFailureCode =
          code === "request_id_unavailable" ? "unsupported_input" : code;
        const mapping = failureBarrier(point, failure);
        const projection = interruptedProjection(
          point,
          requestId,
          code,
          mapping.applied_action,
          runtimePorts.monotonicNowMs() - startedAtMs
        );
        if (projection !== null) await attemptAudit(projection);
        return envelope(correlation, mapping.barrier);
      }

      const decision = result.decision;

      // 5. Recheck correlation and stage before trusting the decision.
      if (
        decision.request_id !== requestId ||
        decision.stage !== stageForPoint(point)
      ) {
        const mapping = failureBarrier(point, "correlation_mismatch");
        const projection = interruptedProjection(
          point,
          requestId,
          "correlation_mismatch",
          mapping.applied_action,
          runtimePorts.monotonicNowMs() - startedAtMs
        );
        if (projection !== null) await attemptAudit(projection);
        return envelope(correlation, mapping.barrier);
      }

      // 6. Map the action, then audit exactly once.
      const mapping = mapDecision({ point, action: decision.action });
      await attemptAudit(
        completedProjection(
          point,
          requestId,
          decision,
          mapping,
          runtimePorts.monotonicNowMs() - startedAtMs
        )
      );

      return envelope(correlation, mapping.barrier);
    } finally {
      leaveState(correlation);
    }
  };

  let registered = false;
  const register = (api: unknown): void => {
    if (registered) {
      throw new Error("openclaw security plugin already registered");
    }
    if (
      api === null ||
      typeof api !== "object" ||
      typeof (api as { on?: unknown }).on !== "function"
    ) {
      throw new Error("openclaw security plugin host api invalid");
    }
    const hostApi = api as OpenClawSecurityPluginApi;
    registered = true;
    for (const name of OPENCLAW_SECURITY_HOOK_NAMES) {
      hostApi.on(
        name,
        (hookEvent: unknown, hookContext: unknown) =>
          handle(name, hookEvent, hookContext),
        Object.freeze({
          priority: OPENCLAW_SECURITY_HOOK_PRIORITY,
          timeoutMs: OPENCLAW_SECURITY_HOOK_TIMEOUT_MS
        })
      );
    }
  };

  return Object.freeze({
    register,
    health: () => runtime.health(),
    inspectOpaqueState
  });
}
