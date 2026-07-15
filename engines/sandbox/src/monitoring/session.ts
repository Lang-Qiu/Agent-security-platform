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
import type { SimulatedToolRequest, SimulatedToolResult } from "../simulated-tools/contract.ts";
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

      // Call next with frozen copy — callback cannot mutate request seen by provider
      let rawResponse: MonitorModelResponse;
      try {
        const frozenRequest = createFrozenMonitorSnapshot(normalizedRequest);
        rawResponse = await next(frozenRequest as unknown as MonitorModelRequest);
      } catch {
        this.#lifecycle = "sealed";
        this.#failed = true;
        throw new Track1MonitorError("monitor_model_failed");
      }

      // Normalize response
      const normalizedResponse = normalizeMonitorModelResponse(rawResponse);
      if (!normalizedResponse) {
        this.#lifecycle = "sealed";
        this.#failed = true;
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

      // Clear raw references before returning — only safe refs/sha256 persist
      const responseCopy: MonitorModelResponse = {
        content: normalizedResponse.content,
        content_ref: normalizedResponse.content_ref
      };

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

  // -- tool invocation ------------------------------------------------------

  async invokeTool(
    request: unknown,
    context: MonitorToolDecisionContext,
    next: MonitorToolNext
  ): Promise<MonitoredToolOutcome> {
    // Lifecycle check
    if (this.#lifecycle !== "open") {
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#pending) {
      throw new Track1MonitorError("monitor_state_invalid");
    }

    // Require a previous model call
    if (this.#lastModelInputRef === null) {
      throw new Track1MonitorError("monitor_state_invalid");
    }

    this.#pending = true;

    try {
      // Normalize tool request
      const { normalizeSimulatedToolRequest } = await import("../simulated-tools/contract.ts");
      const normalizedRequest = normalizeSimulatedToolRequest(request);
      if (!normalizedRequest) {
        throw new Track1MonitorError("monitor_tool_request_invalid");
      }

      // Session context must have scenario/case for tool requests
      if (!this.#context.scenario_id || !this.#context.case_id) {
        throw new Track1MonitorError("monitor_tool_request_invalid");
      }

      // Validate request correlation with monitor context
      if (
        normalizedRequest.session_id !== this.#context.session_id ||
        normalizedRequest.scenario_id !== this.#context.scenario_id ||
        normalizedRequest.case_id !== this.#context.case_id
      ) {
        throw new Track1MonitorError("monitor_tool_request_invalid");
      }

      // Normalize model context
      const normalizedModelInput = normalizeMonitorModelRequest(context.model_input);
      const normalizedModelOutput = normalizeMonitorModelResponse(context.model_output);
      if (!normalizedModelInput || !normalizedModelOutput) {
        throw new Track1MonitorError("monitor_tool_request_invalid");
      }

      // Verify model context refs AND SHA-256 match latest safe model state
      const modelInputSha = sha256MonitorValue(normalizedModelInput.content);
      const modelOutputSha = sha256MonitorValue(normalizedModelOutput.content);
      if (
        normalizedModelInput.content_ref !== this.#lastModelInputRef ||
        normalizedModelOutput.content_ref !== this.#lastModelOutputRef ||
        modelInputSha !== this.#lastModelInputSha256 ||
        modelOutputSha !== this.#lastModelOutputSha256
      ) {
        throw new Track1MonitorError("monitor_tool_request_invalid");
      }

      const {
        createToolArgumentsRef,
        createToolTargetRef,
        createToolResultRef,
        normalizeMonitorToolResult,
        normalizeMonitorToolResultPayload
      } = await import("./content-boundary.ts");

      const argumentsRef = createToolArgumentsRef(normalizedRequest);
      const targetRef = createToolTargetRef(normalizedRequest);

      // Emit tool_request event
      const toolRequestEventId = this.#nextId("tool-request");
      const toolRequestTimestamp = this.#nextTimestamp();
      const toolRequestSequence = this.#nextSequence();

      const toolRequestPayload: SandboxToolRequestPayload = {
        call_id: normalizedRequest.call_id,
        tool_name: normalizedRequest.tool_name,
        target_ref: targetRef,
        arguments_ref: argumentsRef
      };

      const toolRequestEvent: SandboxEventEnvelope<"tool_request", SandboxToolRequestPayload> = {
        event_id: toolRequestEventId,
        session_id: this.#context.session_id,
        sequence: toolRequestSequence,
        event_type: "tool_request",
        occurred_at: toolRequestTimestamp,
        source: "agent",
        scenario_id: this.#context.scenario_id,
        case_id: this.#context.case_id,
        evidence_refs: [EVIDENCE_TOOL_REQUEST],
        payload: toolRequestPayload
      };
      this.#events.push(toolRequestEvent);
      this.#toolCallCount += 1;

      // Obtain decision from provider at tool-request stage
      const decision = await this.#obtainToolDecision(
        toolRequestEventId,
        normalizedModelInput,
        normalizedModelOutput,
        normalizedRequest
      );

      // Materialize decision
      this.#materializeDecision(toolRequestEventId, decision);

      const { action, materializedDecision } = decision;

      if (action === "allow" || action === "alert") {
        // Execute tool callback
        if (typeof next !== "function") {
          this.#failed = true;
          this.#lifecycle = "sealed";
          // Emit failed tool_result event
          const failRef = `simulated-result://${normalizedRequest.call_id}/${sha256MonitorValue(normalizedRequest.call_id + "-noncallable")}`;
          const failPayload: SandboxToolResultPayload = {
            call_id: normalizedRequest.call_id,
            tool_name: normalizedRequest.tool_name,
            status: "failed",
            result_ref: failRef,
            state_change: "none"
          };
          const normalizedFailPayload = normalizeMonitorToolResultPayload(failPayload);
          if (normalizedFailPayload) {
            const failEvent: SandboxEventEnvelope<"tool_result", SandboxToolResultPayload> = {
              event_id: this.#nextId("tool-result"),
              session_id: this.#context.session_id,
              sequence: this.#nextSequence(),
              event_type: "tool_result",
              occurred_at: this.#nextTimestamp(),
              source: "tool",
              scenario_id: this.#context.scenario_id,
              case_id: this.#context.case_id,
              evidence_refs: [EVIDENCE_TOOL_RESULT],
              payload: normalizedFailPayload
            };
            this.#events.push(failEvent);
          }
          throw new Track1MonitorError("monitor_tool_failed");
        }

        this.#executedToolCount += 1;

        let rawResult: SimulatedToolResult;
        try {
          // Pass recursively frozen copy: callback cannot mutate fields
          const callbackRequest = createFrozenMonitorSnapshot(normalizedRequest);
          rawResult = await next(callbackRequest as unknown as SimulatedToolRequest);
          // Detect callback-result correlation mismatch rather than silently fixing it
          if (
            rawResult.call_id !== normalizedRequest.call_id ||
            rawResult.session_id !== normalizedRequest.session_id ||
            rawResult.scenario_id !== normalizedRequest.scenario_id ||
            rawResult.case_id !== normalizedRequest.case_id
          ) {
            this.#failed = true;
            throw new Track1MonitorError("monitor_tool_failed");
          }
        } catch {
          // Emit safe tool_result (failed) and seal
          const safeResultRef = `simulated-result://${normalizedRequest.call_id}/${sha256MonitorValue(normalizedRequest.call_id + "-failed")}`;
          const failResultPayload: SandboxToolResultPayload = {
            call_id: normalizedRequest.call_id,
            tool_name: normalizedRequest.tool_name,
            status: "failed",
            result_ref: safeResultRef,
            state_change: "none"
          };
          const normalizedPayload = normalizeMonitorToolResultPayload(failResultPayload);
          if (normalizedPayload) {
            const failEvent: SandboxEventEnvelope<"tool_result", SandboxToolResultPayload> = {
              event_id: this.#nextId("tool-result"),
              session_id: this.#context.session_id,
              sequence: this.#nextSequence(),
              event_type: "tool_result",
              occurred_at: this.#nextTimestamp(),
              source: "tool",
              scenario_id: this.#context.scenario_id,
              case_id: this.#context.case_id,
              evidence_refs: [EVIDENCE_TOOL_RESULT],
              payload: normalizedPayload
            };
            this.#events.push(failEvent);
          }
          this.#lifecycle = "sealed";
          this.#failed = true;
          throw new Track1MonitorError("monitor_tool_failed");
        }

        // Normalize and correlation-check result
        const normalizedResult = normalizeMonitorToolResult(rawResult, normalizedRequest);
        if (!normalizedResult) {
          this.#failed = true;
          this.#lifecycle = "sealed";
          // Emit failed tool_result event before throwing
          const failRef = `simulated-result://${normalizedRequest.call_id}/${sha256MonitorValue(normalizedRequest.call_id + "-invalid")}`;
          const failPayload: SandboxToolResultPayload = {
            call_id: normalizedRequest.call_id,
            tool_name: normalizedRequest.tool_name,
            status: "failed",
            result_ref: failRef,
            state_change: "none"
          };
          const normalizedFailPayload = normalizeMonitorToolResultPayload(failPayload);
          if (normalizedFailPayload) {
            const failEvent: SandboxEventEnvelope<"tool_result", SandboxToolResultPayload> = {
              event_id: this.#nextId("tool-result"),
              session_id: this.#context.session_id,
              sequence: this.#nextSequence(),
              event_type: "tool_result",
              occurred_at: this.#nextTimestamp(),
              source: "tool",
              scenario_id: this.#context.scenario_id,
              case_id: this.#context.case_id,
              evidence_refs: [EVIDENCE_TOOL_RESULT],
              payload: normalizedFailPayload
            };
            this.#events.push(failEvent);
          }
          throw new Track1MonitorError("monitor_tool_failed");
        }

        // Emit safe tool_result (from executor-derived evidence)
        const resultRef = createToolResultRef(normalizedResult);
        const executorStateChange = normalizedResult.evidence.state_change;

        const toolResultPayload: SandboxToolResultPayload = {
          call_id: normalizedResult.call_id,
          tool_name: normalizedResult.tool_name,
          status: normalizedResult.status === "simulated_success" ? "success" : "rejected",
          result_ref: resultRef,
          state_change: executorStateChange
        };

        const toolResultEvent: SandboxEventEnvelope<"tool_result", SandboxToolResultPayload> = {
          event_id: this.#nextId("tool-result"),
          session_id: this.#context.session_id,
          sequence: this.#nextSequence(),
          event_type: "tool_result",
          occurred_at: this.#nextTimestamp(),
          source: "tool",
          scenario_id: this.#context.scenario_id,
          case_id: this.#context.case_id,
          evidence_refs: [EVIDENCE_TOOL_RESULT],
          payload: toolResultPayload
        };
        this.#events.push(toolResultEvent);

        return {
          disposition: "executed",
          action: action as "allow" | "alert",
          decision: {
            decision_id: materializedDecision.decision_id,
            subject_event_id: materializedDecision.subject_event_id,
            policy_id: materializedDecision.policy_id,
            action: materializedDecision.action,
            reason_code: materializedDecision.reason_code,
            reason: materializedDecision.reason,
            evidence_refs: [...materializedDecision.evidence_refs],
            decided_at: materializedDecision.decided_at
          },
          result: normalizedResult
        };
      } else {
        // deny or ask: intercept
        this.#interceptedToolCount += 1;
        this.#lifecycle = "sealed";

        const safeInterceptedRef = `simulated-result://${normalizedRequest.call_id}/${sha256MonitorValue(normalizedRequest.call_id + "-intercepted")}`;
        const interceptedResultPayload: SandboxToolResultPayload = {
          call_id: normalizedRequest.call_id,
          tool_name: normalizedRequest.tool_name,
          status: "rejected",
          result_ref: safeInterceptedRef,
          state_change: "none"
        };

        // Emit tool_result event for intercepted
        const toolResultPayload = normalizeMonitorToolResultPayload(interceptedResultPayload);
        if (toolResultPayload) {
          const toolResultEvent: SandboxEventEnvelope<"tool_result", SandboxToolResultPayload> = {
            event_id: this.#nextId("tool-result"),
            session_id: this.#context.session_id,
            sequence: this.#nextSequence(),
            event_type: "tool_result",
            occurred_at: this.#nextTimestamp(),
            source: "tool",
            scenario_id: this.#context.scenario_id,
            case_id: this.#context.case_id,
            evidence_refs: [EVIDENCE_TOOL_RESULT],
            payload: toolResultPayload
          };
          this.#events.push(toolResultEvent);
        }

        return {
          disposition: "intercepted",
          action: action as "deny" | "ask",
          decision: {
            decision_id: materializedDecision.decision_id,
            subject_event_id: materializedDecision.subject_event_id,
            policy_id: materializedDecision.policy_id,
            action: materializedDecision.action,
            reason_code: materializedDecision.reason_code,
            reason: materializedDecision.reason,
            evidence_refs: [...materializedDecision.evidence_refs],
            decided_at: materializedDecision.decided_at
          },
          result: toolResultPayload ?? interceptedResultPayload
        };
      }
    } finally {
      this.#pending = false;
    }
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
    const decisionInput: MonitorDecisionInput = Object.freeze({
      stage,
      session: createFrozenMonitorSnapshot(this.#context),
      subject_event_id: subjectEventId,
      model_input: createFrozenMonitorSnapshot(modelInput),
      model_output: createFrozenMonitorSnapshot(modelOutput)
    });

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

  async #obtainToolDecision(
    subjectEventId: string,
    modelInput: MonitorModelRequest,
    modelOutput: MonitorModelResponse,
    toolRequest: SimulatedToolRequest
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

    // Build frozen input snapshot with tool_request
    const decisionInput: MonitorDecisionInput = Object.freeze({
      stage: "tool_request",
      session: createFrozenMonitorSnapshot(this.#context),
      subject_event_id: subjectEventId,
      model_input: createFrozenMonitorSnapshot(modelInput),
      model_output: createFrozenMonitorSnapshot(modelOutput),
      tool_request: createFrozenMonitorSnapshot(toolRequest)
    });

    let rawProposal: unknown;
    try {
      rawProposal = await this.#provider.decide(decisionInput);
    } catch {
      this.#providerFailureCount += 1;
      this.#lifecycle = "sealed";
      return { materializedDecision: failClosed(), action: "deny" };
    }

    const normalizedProposal = normalizeMonitorDecisionProposal(rawProposal);
    if (!normalizedProposal) {
      this.#providerFailureCount += 1;
      this.#lifecycle = "sealed";
      return { materializedDecision: failClosed(), action: "deny" };
    }

    // Check for sensitive values in proposal — including tool arguments
    const { containsMonitorSensitiveValue, canonicalizeMonitorValue } = await import("./content-boundary.ts");
    const sensitiveValues = [modelInput.content, modelOutput.content];
    // Also collect all tool argument string values
    const toolArgValues: string[] = [];
    const { tool_name: toolName, arguments: toolArgs } = toolRequest;
    switch (toolName) {
      case "send_email":
        toolArgValues.push(toolArgs.recipient, toolArgs.subject, toolArgs.body);
        break;
      case "read_file":
        toolArgValues.push(toolArgs.path);
        break;
      case "write_file":
        toolArgValues.push(toolArgs.path, toolArgs.content);
        break;
      case "call_api":
        toolArgValues.push(toolArgs.endpoint, toolArgs.method);
        if (toolArgs.body !== undefined) {
          toolArgValues.push(...Object.values(toolArgs.body));
        }
        break;
    }
    // Filter out empty strings — ".includes('')" is always true
    const allSensitive = [...sensitiveValues, ...toolArgValues].filter((v) => v.length > 0);
    if (
      containsMonitorSensitiveValue(normalizedProposal.reason, allSensitive) ||
      containsMonitorSensitiveValue(normalizedProposal, allSensitive)
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
