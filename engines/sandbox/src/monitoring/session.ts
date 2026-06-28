import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxEventEnvelope,
  SandboxModelContentPayload,
  SandboxPolicyDecision,
  SandboxToolRequestPayload,
  SandboxToolResultPayload
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
  normalizeMonitorRuntimePorts
} from "./contract.ts";
import type {
  MonitorSessionContext,
  MonitorRuntimePorts,
  MonitorDecisionProvider,
  MonitorDecisionProposal,
  MonitorDecisionInput,
  MonitorDecisionStage,
  MonitorModelRequest,
  MonitorModelResponse,
  MonitorModelNext,
  MonitoredModelOutcome,
  MonitorToolDecisionContext,
  MonitorToolNext,
  MonitoredToolOutcome,
  MonitorLifecycleState,
  Track1MonitorMetadata
} from "./contract.ts";
import { buildMonitorResult } from "./result-builder.ts";

// -- default runtime ports -------------------------------------------------

let _defaultIdCounter = 0;

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultNextId(kind: string): string {
  _defaultIdCounter += 1;
  const uuid = `${kind}-${Date.now().toString(36)}-${_defaultIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return uuid;
}

const DEFAULT_PORTS: MonitorRuntimePorts = Object.freeze({
  now: defaultNow,
  nextId: defaultNextId
});

// -- event summaries -------------------------------------------------------

const FIXED_SUMMARIES = {
  model_input: "Monitored model input",
  model_output: "Monitored model output",
  tool_request: "Monitored tool request",
  tool_result: "Monitored tool result",
  blocked: "Monitored sandbox session blocked",
  failed: "Monitored sandbox session failed",
  completed: "Monitored sandbox session completed"
} as const;

// -- evidence refs ---------------------------------------------------------

const EVIDENCE_MODEL_INPUT = "evidence://track1/monitor/model-input";
const EVIDENCE_MODEL_OUTPUT = "evidence://track1/monitor/model-output";
const EVIDENCE_TOOL_REQUEST = "evidence://track1/monitor/tool-request";
const EVIDENCE_TOOL_RESULT = "evidence://track1/monitor/tool-result";
const EVIDENCE_POLICY_DECISION = "evidence://track1/monitor/policy-decision";

// -- sandbox result normalizer ---------------------------------------------

export class MonitoredSession {
  // Private state - never stores raw content
  #context: MonitorSessionContext;
  #provider: MonitorDecisionProvider;
  #ports: MonitorRuntimePorts;

  #events: SandboxBehaviorEvent[] = [];
  #decisions: SandboxPolicyDecision[] = [];
  #alerts: SandboxAlert[] = [];
  #blockedRecords: SandboxBlockedRecord[] = [];

  #lifecycle: MonitorLifecycleState = "open";
  #pending = false;
  #failed = false;

  #sequence = 0;
  #firstTimestamp = "";

  // Safe references to latest model state (no raw content)
  #lastModelInputRef: string | null = null;
  #lastModelInputSha256: string | null = null;
  #lastModelOutputRef: string | null = null;
  #lastModelOutputSha256: string | null = null;

  // Latest model call info for tool context
  #latestModelInput: MonitorModelRequest | null = null;
  #latestModelOutput: MonitorModelResponse | null = null;

  // Counters
  #modelCallCount = 0;
  #toolCallCount = 0;
  #decisionCount = 0;
  #executedToolCount = 0;
  #interceptedToolCount = 0;
  #providerFailureCount = 0;

  // Cached result
  #cachedResult: BaseResult<SandboxRunResultDetails> | null = null;

  constructor(
    context: unknown,
    decisionProvider: MonitorDecisionProvider,
    runtimePorts?: MonitorRuntimePorts
  ) {
    // Normalize context
    const normalizedContext = normalizeMonitorSessionContext(context);
    if (!normalizedContext) {
      throw new Track1MonitorError("monitor_context_invalid");
    }
    this.#context = normalizedContext;

    // Validate provider
    if (!decisionProvider || typeof decisionProvider !== "object") {
      throw new Track1MonitorError("monitor_decision_invalid");
    }
    if (typeof (decisionProvider as MonitorDecisionProvider).decide !== "function") {
      throw new Track1MonitorError("monitor_decision_invalid");
    }
    this.#provider = decisionProvider;

    // Validate or default runtime ports
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

  // -- model invocation ----------------------------------------------------

  async invokeModel(
    request: unknown,
    next: MonitorModelNext
  ): Promise<MonitoredModelOutcome> {
    // Lifecycle check
    if (this.#lifecycle !== "open") {
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#pending) {
      throw new Track1MonitorError("monitor_state_invalid");
    }
    this.#pending = true;

    try {
      // Normalize request
      const normalizedRequest = normalizeMonitorModelRequest(request);
      if (!normalizedRequest) {
        throw new Track1MonitorError("monitor_model_request_invalid");
      }

      // Validate next is callable
      if (typeof next !== "function") {
        throw new Track1MonitorError("monitor_model_failed");
      }

      // Hash the content
      const inputSha256 = sha256MonitorValue(normalizedRequest.content);

      // Emit model_input event
      const modelInputEventId = this.#nextId("model-input");
      const modelInputTimestamp = this.#nextTimestamp();
      const modelInputSequence = this.#nextSequence();

      const modelInputPayload: SandboxModelContentPayload = {
        model_ref: this.#context.model_ref,
        content_ref: normalizedRequest.content_ref,
        content_sha256: inputSha256
      };

      const modelInputEvent: SandboxEventEnvelope<"model_input", SandboxModelContentPayload> = {
        event_id: modelInputEventId,
        session_id: this.#context.session_id,
        sequence: modelInputSequence,
        event_type: "model_input",
        occurred_at: modelInputTimestamp,
        source: "agent",
        scenario_id: this.#context.scenario_id,
        case_id: this.#context.case_id,
        evidence_refs: [EVIDENCE_MODEL_INPUT],
        payload: modelInputPayload
      };
      this.#events.push(modelInputEvent);
      this.#modelCallCount += 1;

      // Store safe references (no raw content)
      this.#lastModelInputRef = normalizedRequest.content_ref;
      this.#lastModelInputSha256 = inputSha256;
      this.#latestModelInput = normalizedRequest;

      // Call next
      let rawResponse: MonitorModelResponse;
      try {
        rawResponse = await next(normalizedRequest);
      } catch {
        this.#lifecycle = "sealed";
        this.#failed = true;
        throw new Track1MonitorError("monitor_model_failed");
      }

      // Normalize response
      const normalizedResponse = normalizeMonitorModelResponse(rawResponse);
      if (!normalizedResponse) {
        this.#lifecycle = "sealed";
        throw new Track1MonitorError("monitor_model_response_invalid");
      }

      const outputSha256 = sha256MonitorValue(normalizedResponse.content);

      // Emit model_output event
      const modelOutputEventId = this.#nextId("model-output");
      const modelOutputTimestamp = this.#nextTimestamp();
      const modelOutputSequence = this.#nextSequence();

      const modelOutputPayload: SandboxModelContentPayload = {
        model_ref: this.#context.model_ref,
        content_ref: normalizedResponse.content_ref,
        content_sha256: outputSha256
      };

      const modelOutputEvent: SandboxEventEnvelope<"model_output", SandboxModelContentPayload> = {
        event_id: modelOutputEventId,
        session_id: this.#context.session_id,
        sequence: modelOutputSequence,
        event_type: "model_output",
        occurred_at: modelOutputTimestamp,
        source: "model",
        scenario_id: this.#context.scenario_id,
        case_id: this.#context.case_id,
        evidence_refs: [EVIDENCE_MODEL_OUTPUT],
        payload: modelOutputPayload
      };
      this.#events.push(modelOutputEvent);

      // Store safe references
      this.#lastModelOutputRef = normalizedResponse.content_ref;
      this.#lastModelOutputSha256 = outputSha256;
      this.#latestModelOutput = normalizedResponse;

      // Ask provider to decide
      const decision = await this.#obtainDecision(
        "model_output",
        modelOutputEventId,
        normalizedRequest,
        normalizedResponse
      );

      // Materialize decision
      this.#materializeDecision(modelOutputEventId, decision);

      // Determine outcome
      const canContinue = decision.action === "allow" || decision.action === "alert";

      if (!canContinue) {
        this.#lifecycle = "sealed";
      }

      // Clear raw references before returning
      const responseCopy: MonitorModelResponse = {
        content: normalizedResponse.content,
        content_ref: normalizedResponse.content_ref
      };

      // Clear latest model input/output (raw content)
      this.#latestModelInput = null;
      this.#latestModelOutput = null;

      return {
        response: responseCopy,
        decision: {
          decision_id: decision.materializedDecision.decision_id,
          subject_event_id: decision.materializedDecision.subject_event_id,
          policy_id: decision.materializedDecision.policy_id,
          action: decision.materializedDecision.action,
          reason_code: decision.materializedDecision.reason_code,
          reason: decision.materializedDecision.reason,
          evidence_refs: [...decision.materializedDecision.evidence_refs],
          decided_at: decision.materializedDecision.decided_at
        },
        can_continue: canContinue
      };
    } finally {
      this.#pending = false;
    }
  }

  // -- tool invocation (stub for Task 2, full implementation in Task 3) ----

  async invokeTool(
    _request: unknown,
    _context: MonitorToolDecisionContext,
    _next: MonitorToolNext
  ): Promise<MonitoredToolOutcome> {
    throw new Track1MonitorError("monitor_state_invalid");
  }

  // -- finalization --------------------------------------------------------

  finalize(): BaseResult<SandboxRunResultDetails> {
    if (this.#cachedResult) {
      return this.#cachedResult;
    }

    if (this.#pending) {
      throw new Track1MonitorError("monitor_state_invalid");
    }

    if (this.#modelCallCount === 0) {
      throw new Track1MonitorError("monitor_session_empty");
    }

    const finalTimestamp = this.#ports.now();

    const metadata: Track1MonitorMetadata = {
      schema_version: "track1-monitor.v1",
      model_call_count: this.#modelCallCount,
      tool_call_count: this.#toolCallCount,
      decision_count: this.#decisionCount,
      executed_tool_count: this.#executedToolCount,
      intercepted_tool_count: this.#interceptedToolCount,
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
      failed: this.#failed
    });

    this.#lifecycle = "finalized";
    this.#cachedResult = result;
    return result;
  }

  // -- private helpers -----------------------------------------------------

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

  async #obtainDecision(
    stage: MonitorDecisionStage,
    subjectEventId: string,
    modelInput: MonitorModelRequest,
    modelOutput: MonitorModelResponse
  ): Promise<{ materializedDecision: SandboxPolicyDecision; action: MonitorDecisionProposal["action"] }> {
    // Helper to create fail-closed decision
    const failClosed = (): SandboxPolicyDecision => ({
      decision_id: this.#nextId("decision"),
      subject_event_id: subjectEventId,
      policy_id: MONITOR_FAIL_CLOSED_PROPOSAL.policy_id,
      action: MONITOR_FAIL_CLOSED_PROPOSAL.action,
      reason_code: MONITOR_FAIL_CLOSED_PROPOSAL.reason_code,
      reason: MONITOR_FAIL_CLOSED_PROPOSAL.reason,
      evidence_refs: [...MONITOR_FAIL_CLOSED_PROPOSAL.evidence_refs],
      decided_at: this.#nextTimestamp()
    });

    // Build frozen input snapshot
    const decisionInput: MonitorDecisionInput = {
      stage,
      session: createFrozenMonitorSnapshot(this.#context),
      subject_event_id: subjectEventId,
      model_input: createFrozenMonitorSnapshot(modelInput),
      model_output: createFrozenMonitorSnapshot(modelOutput)
    };

    let rawProposal: unknown;
    try {
      rawProposal = await this.#provider.decide(decisionInput);
    } catch {
      // Provider threw - fail closed
      this.#providerFailureCount += 1;
      this.#lifecycle = "sealed";
      return { materializedDecision: failClosed(), action: "deny" };
    }

    // Normalize the proposal
    const normalizedProposal = normalizeMonitorDecisionProposal(rawProposal);

    if (!normalizedProposal) {
      // Invalid provider output - fail closed
      this.#providerFailureCount += 1;
      this.#lifecycle = "sealed";
      return { materializedDecision: failClosed(), action: "deny" };
    }

    // Check for provider mutation (sensitive values in proposal)
    const { containsMonitorSensitiveValue } = await import("./content-boundary.ts");
    if (
      containsMonitorSensitiveValue(normalizedProposal.reason, [modelInput.content, modelOutput.content]) ||
      containsMonitorSensitiveValue(normalizedProposal, [modelInput.content, modelOutput.content])
    ) {
      this.#providerFailureCount += 1;
      this.#lifecycle = "sealed";
      return { materializedDecision: failClosed(), action: "deny" };
    }

    const decisionId = this.#nextId("decision");
    const decidedAt = this.#nextTimestamp();

    const materializedDecision: SandboxPolicyDecision = {
      decision_id: decisionId,
      subject_event_id: subjectEventId,
      policy_id: normalizedProposal.policy_id,
      action: normalizedProposal.action,
      reason_code: normalizedProposal.reason_code,
      reason: normalizedProposal.reason,
      evidence_refs: [...normalizedProposal.evidence_refs],
      decided_at: decidedAt
    };

    return { materializedDecision, action: normalizedProposal.action };
  }

  #materializeDecision(
    subjectEventId: string,
    decision: { materializedDecision: SandboxPolicyDecision; action: MonitorDecisionProposal["action"] }
  ): void {
    const { materializedDecision } = decision;

    // Emit policy_decision event
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

    // Materialize alerts/blocked records
    if (materializedDecision.action === "alert") {
      const alert: SandboxAlert = {
        alert_id: this.#nextId("alert"),
        subject_event_id: subjectEventId,
        decision_id: materializedDecision.decision_id,
        risk_level: "high",
        category: "monitor_policy_alert",
        title: "Monitor policy alert",
        reason: materializedDecision.reason,
        evidence_refs: [...materializedDecision.evidence_refs],
        occurred_at: materializedDecision.decided_at
      };
      this.#alerts.push(alert);
    }

    if (materializedDecision.action === "deny") {
      const blockedRecord: SandboxBlockedRecord = {
        blocked_record_id: this.#nextId("blocked-record"),
        subject_event_id: subjectEventId,
        decision_id: materializedDecision.decision_id,
        reason: materializedDecision.reason,
        evidence_refs: [...materializedDecision.evidence_refs],
        occurred_at: materializedDecision.decided_at
      };
      this.#blockedRecords.push(blockedRecord);
    }
  }
}
