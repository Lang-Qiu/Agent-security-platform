import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxEventEnvelope,
  SandboxModelContentPayload,
  SandboxPolicyDecision
} from "../../../../shared/types/sandbox.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import { sha256MonitorValue, createFrozenMonitorSnapshot } from "./content-boundary.ts";
import {
  Track1MonitorError,
  MONITOR_FAIL_CLOSED_PROPOSAL,
  normalizeMonitorSessionContext,
  normalizeMonitorModelRequest,
  normalizeMonitorModelResponse,
  normalizeMonitorDecisionProposal,
  normalizeMonitorRuntimePorts,
  isCorrelationId,
  isSafeReference
} from "./contract.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorDecisionProvider,
  MonitorDecisionProposal,
  MonitorDecisionInput,
  MonitorModelRequest,
  MonitorModelResponse,
  MonitoredModelOutcome,
  MonitorLifecycleState,
  Track1MonitorMetadata
} from "./contract.ts";
import { buildMonitorResult } from "./result-builder.ts";

// -- public engine-private types ------------------------------------------

export interface ObservedModelInput {
  session_id: string;
  content: string;
  content_ref: string;
}

export interface ObservedModelOutput {
  session_id: string;
  content: string;
  content_ref: string;
}

// -- default runtime ports -------------------------------------------------

let _defaultIdCounter = 0;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultNextId(kind: string): string {
  _defaultIdCounter += 1;
  return `${kind}-${Date.now().toString(36)}-${_defaultIdCounter.toString(36)}`;
}

const DEFAULT_PORTS: MonitorRuntimePorts = Object.freeze({
  now: defaultNow,
  nextId: defaultNextId
});

// -- evidence refs ---------------------------------------------------------

const EVIDENCE_MODEL_INPUT = "evidence://track1/monitor/model-input";
const EVIDENCE_MODEL_OUTPUT = "evidence://track1/monitor/model-output";
const EVIDENCE_POLICY_DECISION = "evidence://track1/monitor/policy-decision";

// -- internal helpers ------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// -- ObservedMonitoredSession ---------------------------------------------

/**
 * Engine-private adapter that observes OpenClaw's split model hooks
 * (llm_input / llm_output) and evaluates the existing Track 1 policy.
 *
 * Volatile context policy:
 * - While a model pair is pending, retains exactly one frozen raw input.
 * - After observeModelOutput resolves, retains at most one frozen latest
 *   input/output pair for the next tool decision.
 * - The pair is cleared on the next model input, finalization, or failure.
 * - Durable state contains refs, hashes, counters, events, and decisions only.
 */
export class ObservedMonitoredSession {
  #context: MonitorSessionContext;
  #provider: MonitorDecisionProvider;
  #ports: MonitorRuntimePorts;

  #events: SandboxBehaviorEvent[] = [];
  #decisions: SandboxPolicyDecision[] = [];
  #alerts: SandboxAlert[] = [];
  #blockedRecords: SandboxBlockedRecord[] = [];

  #lifecycle: MonitorLifecycleState = "open";

  // Volatile: frozen raw input while a pair is pending
  #pendingInput: Readonly<MonitorModelRequest> | null = null;
  #pendingInputEventId: string | null = null;

  // Volatile: frozen latest input/output pair for future tool decision
  #latestPair: {
    input: Readonly<MonitorModelRequest>;
    output: Readonly<MonitorModelResponse>;
  } | null = null;

  // Durable: safe refs and hashes only
  #lastModelInputRef: string | null = null;
  #lastModelInputSha256: string | null = null;
  #lastModelOutputRef: string | null = null;
  #lastModelOutputSha256: string | null = null;

  // Counters
  #modelCallCount = 0;
  #decisionCount = 0;
  #providerFailureCount = 0;

  #sequence = 0;
  #firstTimestamp: string;

  #cachedResult: BaseResult<SandboxRunResultDetails> | null = null;

  constructor(
    context: unknown,
    decisionProvider: MonitorDecisionProvider,
    runtimePorts?: MonitorRuntimePorts
  ) {
    const normalizedContext = normalizeMonitorSessionContext(context);
    if (!normalizedContext) {
      throw new Track1MonitorError("monitor_context_invalid");
    }
    this.#context = normalizedContext;

    if (!decisionProvider || typeof decisionProvider !== "object") {
      throw new Track1MonitorError("monitor_decision_invalid");
    }
    if (typeof (decisionProvider as MonitorDecisionProvider).decide !== "function") {
      throw new Track1MonitorError("monitor_decision_invalid");
    }
    this.#provider = decisionProvider;

    if (runtimePorts !== undefined) {
      const normalizedPorts = normalizeMonitorRuntimePorts(runtimePorts);
      if (!normalizedPorts) {
        throw new Track1MonitorError("monitor_context_invalid");
      }
      this.#ports = normalizedPorts;
    } else {
      this.#ports = DEFAULT_PORTS;
    }

    this.#firstTimestamp = this.#ports.now();
  }

  // -- split model observation --------------------------------------------

  observeModelInput(input: unknown): void {
    if (this.#lifecycle !== "open") {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    // Reject second input while a pair is pending
    if (this.#pendingInput !== null) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    // Structural normalization (keys, content, content_ref)
    const request = this.#normalizeObservedInputStructure(input);
    if (!request) {
      this.#seal();
      throw new Track1MonitorError("monitor_model_request_invalid");
    }

    // Session correlation check
    if (!this.#matchesSession(input)) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    const frozenInput = createFrozenMonitorSnapshot(request);

    // Emit model_input event
    const eventId = this.#nextId("model-input");
    const sha256 = sha256MonitorValue(request.content);
    const payload: SandboxModelContentPayload = {
      model_ref: this.#context.model_ref,
      content_ref: request.content_ref,
      content_sha256: sha256
    };
    const event: SandboxEventEnvelope<"model_input", SandboxModelContentPayload> = {
      event_id: eventId,
      session_id: this.#context.session_id,
      sequence: this.#nextSequence(),
      event_type: "model_input",
      occurred_at: this.#nextTimestamp(),
      source: "agent",
      scenario_id: this.#context.scenario_id,
      case_id: this.#context.case_id,
      evidence_refs: [EVIDENCE_MODEL_INPUT],
      payload
    };
    this.#events.push(event);
    this.#modelCallCount += 1;

    // Durable safe refs
    this.#lastModelInputRef = request.content_ref;
    this.#lastModelInputSha256 = sha256;

    // Clear any previous volatile pair before storing the new pending input
    this.#latestPair = null;

    // Volatile: retain exactly one frozen raw input
    this.#pendingInput = frozenInput;
    this.#pendingInputEventId = eventId;
  }

  async observeModelOutput(
    output: unknown
  ): Promise<MonitoredModelOutcome> {
    if (this.#lifecycle !== "open") {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#pendingInput === null || this.#pendingInputEventId === null) {
      // Output before input
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    // Structural normalization (keys, content, content_ref)
    const response = this.#normalizeObservedOutputStructure(output);
    if (!response) {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_model_response_invalid");
    }

    // Session correlation check
    if (!this.#matchesSession(output)) {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    const frozenOutput = createFrozenMonitorSnapshot(response);
    const pendingInput = this.#pendingInput;
    const subjectEventId = this.#pendingInputEventId;

    // Emit model_output event
    const outputEventId = this.#nextId("model-output");
    const outputSha256 = sha256MonitorValue(response.content);
    const outputPayload: SandboxModelContentPayload = {
      model_ref: this.#context.model_ref,
      content_ref: response.content_ref,
      content_sha256: outputSha256
    };
    const outputEvent: SandboxEventEnvelope<"model_output", SandboxModelContentPayload> = {
      event_id: outputEventId,
      session_id: this.#context.session_id,
      sequence: this.#nextSequence(),
      event_type: "model_output",
      occurred_at: this.#nextTimestamp(),
      source: "model",
      scenario_id: this.#context.scenario_id,
      case_id: this.#context.case_id,
      evidence_refs: [EVIDENCE_MODEL_OUTPUT],
      payload: outputPayload
    };
    this.#events.push(outputEvent);

    // Durable safe refs
    this.#lastModelOutputRef = response.content_ref;
    this.#lastModelOutputSha256 = outputSha256;

    // Build frozen decision input — exactly 5 keys, no tool_request
    const decisionInput: MonitorDecisionInput = Object.freeze({
      stage: "model_output",
      session: createFrozenMonitorSnapshot(this.#context),
      subject_event_id: subjectEventId,
      model_input: pendingInput,
      model_output: frozenOutput
    });

    // Ask provider
    let rawProposal: unknown;
    try {
      rawProposal = await this.#provider.decide(decisionInput);
    } catch {
      this.#providerFailureCount += 1;
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_decision_invalid");
    }

    const proposal = normalizeMonitorDecisionProposal(rawProposal);
    if (!proposal) {
      this.#providerFailureCount += 1;
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_decision_invalid");
    }

    // Reject proposals that echo raw model content
    const sensitiveValues = [pendingInput.content, frozenOutput.content].filter(
      (v) => v.length > 0
    );
    if (
      sensitiveValues.some(
        (s) => proposal.reason.includes(s) || proposal.evidence_refs.includes(s)
      )
    ) {
      this.#providerFailureCount += 1;
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_decision_invalid");
    }

    // Materialize decision
    const materializedDecision: SandboxPolicyDecision = {
      decision_id: this.#nextId("decision"),
      subject_event_id: subjectEventId,
      policy_id: proposal.policy_id,
      action: proposal.action,
      reason_code: proposal.reason_code,
      reason: proposal.reason,
      evidence_refs: [...proposal.evidence_refs],
      decided_at: this.#nextTimestamp()
    };

    const decisionEvent: SandboxEventEnvelope<"policy_decision", SandboxPolicyDecision> = {
      event_id: this.#nextId("policy-decision"),
      session_id: this.#context.session_id,
      sequence: this.#nextSequence(),
      event_type: "policy_decision",
      occurred_at: materializedDecision.decided_at,
      source: "policy",
      scenario_id: this.#context.scenario_id,
      case_id: this.#context.case_id,
      evidence_refs: [EVIDENCE_POLICY_DECISION],
      payload: materializedDecision
    };
    this.#events.push(decisionEvent);
    this.#decisions.push(materializedDecision);
    this.#decisionCount += 1;

    if (materializedDecision.action === "alert") {
      this.#alerts.push({
        alert_id: this.#nextId("alert"),
        subject_event_id: subjectEventId,
        decision_id: materializedDecision.decision_id,
        risk_level: "high",
        category: "monitor_policy_alert",
        title: "Monitor policy alert",
        reason: materializedDecision.reason,
        evidence_refs: [...materializedDecision.evidence_refs],
        occurred_at: materializedDecision.decided_at
      });
    }

    if (materializedDecision.action === "deny") {
      this.#blockedRecords.push({
        blocked_record_id: this.#nextId("blocked-record"),
        subject_event_id: subjectEventId,
        decision_id: materializedDecision.decision_id,
        reason: materializedDecision.reason,
        evidence_refs: [...materializedDecision.evidence_refs],
        occurred_at: materializedDecision.decided_at
      });
    }

    const canContinue =
      materializedDecision.action === "allow" ||
      materializedDecision.action === "alert";

    // Retain frozen latest pair for future tool decision (volatile)
    this.#latestPair = { input: pendingInput, output: frozenOutput };

    // Clear pending input — pair is no longer pending
    this.#pendingInput = null;
    this.#pendingInputEventId = null;

    if (!canContinue) {
      this.#lifecycle = "sealed";
      // On seal, clear the volatile pair as well
      this.#latestPair = null;
    }

    const responseCopy: MonitorModelResponse = {
      content: frozenOutput.content,
      content_ref: frozenOutput.content_ref
    };

    return {
      response: responseCopy,
      decision: materializedDecision,
      can_continue: canContinue
    };
  }

  // -- finalization --------------------------------------------------------

  finalize(): BaseResult<SandboxRunResultDetails> {
    if (this.#cachedResult) {
      return this.#cachedResult;
    }

    if (this.#lifecycle === "finalized") {
      throw new Track1MonitorError("monitor_state_invalid");
    }

    if (this.#lifecycle === "sealed") {
      this.#clearVolatile();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    if (this.#pendingInput !== null) {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }

    if (this.#modelCallCount === 0) {
      this.#seal();
      throw new Track1MonitorError("monitor_session_empty");
    }

    const finalTimestamp = this.#ports.now();
    const metadata: Track1MonitorMetadata = {
      schema_version: "track1-monitor.v1",
      model_call_count: this.#modelCallCount,
      tool_call_count: 0,
      decision_count: this.#decisionCount,
      executed_tool_count: 0,
      intercepted_tool_count: 0,
      provider_failure_count: this.#providerFailureCount
    };

    const result = buildMonitorResult({
      context: this.#context,
      events: [...this.#events],
      decisions: [...this.#decisions],
      alerts: [...this.#alerts],
      blockedRecords: [...this.#blockedRecords],
      metadata,
      firstTimestamp: this.#firstTimestamp,
      finalTimestamp,
      failed: false
    });

    this.#clearVolatile();
    this.#lifecycle = "finalized";
    this.#cachedResult = result;
    return result;
  }

  // -- private helpers -----------------------------------------------------

  #normalizeObservedInputStructure(
    value: unknown
  ): MonitorModelRequest | null {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["session_id", "content", "content_ref"])
    ) {
      return null;
    }

    return normalizeMonitorModelRequest({
      content: value.content,
      content_ref: value.content_ref
    });
  }

  #normalizeObservedOutputStructure(
    value: unknown
  ): MonitorModelResponse | null {
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["session_id", "content", "content_ref"])
    ) {
      return null;
    }

    return normalizeMonitorModelResponse({
      content: value.content,
      content_ref: value.content_ref
    });
  }

  #matchesSession(value: unknown): boolean {
    return (
      isPlainObject(value) &&
      isCorrelationId(value.session_id) &&
      value.session_id === this.#context.session_id
    );
  }

  #clearVolatile(): void {
    this.#pendingInput = null;
    this.#pendingInputEventId = null;
    this.#latestPair = null;
  }

  #seal(): void {
    this.#lifecycle = "sealed";
  }

  #nextSequence(): number {
    this.#sequence += 1;
    return this.#sequence;
  }

  #nextId(kind: string): string {
    return this.#ports.nextId(kind);
  }

  #nextTimestamp(): string {
    return this.#ports.now();
  }
}
