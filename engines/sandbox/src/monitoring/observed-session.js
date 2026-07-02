import { sha256MonitorValue, createFrozenMonitorSnapshot, createToolArgumentsRef, createToolTargetRef, collectRawToolArgumentStrings, isValidSha256Hex } from "./content-boundary.js";
import { Track1MonitorError, normalizeMonitorSessionContext, normalizeMonitorModelRequest, normalizeMonitorModelResponse, normalizeMonitorDecisionProposal, normalizeMonitorRuntimePorts, isCorrelationId, isSafeReference } from "./contract.js";
import { normalizeSimulatedToolRequest } from "../simulated-tools/contract.js";
import { buildMonitorResult } from "./result-builder.js";
// -- default runtime ports -------------------------------------------------
let _defaultIdCounter = 0;
function defaultNow() {
    return new Date().toISOString();
}
function defaultNextId(kind) {
    _defaultIdCounter += 1;
    return `${kind}-${Date.now().toString(36)}-${_defaultIdCounter.toString(36)}`;
}
const DEFAULT_PORTS = Object.freeze({
    now: defaultNow,
    nextId: defaultNextId
});
// -- evidence refs ---------------------------------------------------------
const EVIDENCE_MODEL_INPUT = "evidence://track1/monitor/model-input";
const EVIDENCE_MODEL_OUTPUT = "evidence://track1/monitor/model-output";
const EVIDENCE_POLICY_DECISION = "evidence://track1/monitor/policy-decision";
const EVIDENCE_TOOL_REQUEST = "evidence://track1/monitor/tool-request";
const EVIDENCE_TOOL_RESULT = "evidence://track1/monitor/tool-result";
const EVIDENCE_MEMORY_WRITE = "evidence://track1/monitor/memory-write";
const EVIDENCE_MEMORY_READ = "evidence://track1/monitor/memory-read";
// -- internal helpers ------------------------------------------------------
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expectedKeys) {
    const actualKeys = Object.keys(value).sort();
    const sortedExpected = [...expectedKeys].sort();
    return (actualKeys.length === sortedExpected.length &&
        actualKeys.every((key, index) => key === sortedExpected[index]));
}
function isNonEmptyString(value) {
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
    #context;
    #provider;
    #ports;
    #events = [];
    #decisions = [];
    #alerts = [];
    #blockedRecords = [];
    #lifecycle = "open";
    // Volatile: frozen raw input while a pair is pending
    #pendingInput = null;
    #pendingInputEventId = null;
    // Volatile: frozen latest input/output pair for future tool decision
    #latestPair = null;
    // Pending safe call record (IDs, tool name, refs only — never raw arguments)
    #pendingCall = null;
    // Durable: safe refs and hashes only
    #lastModelInputRef = null;
    #lastModelInputSha256 = null;
    #lastModelOutputRef = null;
    #lastModelOutputSha256 = null;
    // Counters
    #modelCallCount = 0;
    #toolCallCount = 0;
    #decisionCount = 0;
    #executedToolCount = 0;
    #interceptedToolCount = 0;
    #providerFailureCount = 0;
    // Model stage locked after a deny/ask at model output: further model
    // input is rejected, but the session stays open for tool interception.
    #modelStageLocked = false;
    // Distinguish seal causes: an intercept seal (deny/ask at tool stage) is
    // a normal terminal state that can be finalized; a failure seal (provider
    // throw, correlation mismatch, malformed input) is a hard error.
    #failed = false;
    #sequence = 0;
    #firstTimestamp;
    #cachedResult = null;
    constructor(context, decisionProvider, runtimePorts) {
        const normalizedContext = normalizeMonitorSessionContext(context);
        if (!normalizedContext) {
            throw new Track1MonitorError("monitor_context_invalid");
        }
        this.#context = normalizedContext;
        if (!decisionProvider || typeof decisionProvider !== "object") {
            throw new Track1MonitorError("monitor_decision_invalid");
        }
        if (typeof decisionProvider.decide !== "function") {
            throw new Track1MonitorError("monitor_decision_invalid");
        }
        this.#provider = decisionProvider;
        if (runtimePorts !== undefined) {
            const normalizedPorts = normalizeMonitorRuntimePorts(runtimePorts);
            if (!normalizedPorts) {
                throw new Track1MonitorError("monitor_context_invalid");
            }
            this.#ports = normalizedPorts;
        }
        else {
            this.#ports = DEFAULT_PORTS;
        }
        this.#firstTimestamp = this.#ports.now();
    }
    // -- split model observation --------------------------------------------
    observeModelInput(input) {
        if (this.#lifecycle !== "open") {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Reject second input while a pair is pending
        if (this.#pendingInput !== null) {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Reject new model input after the model stage was locked by a deny/ask
        if (this.#modelStageLocked) {
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
        const payload = {
            model_ref: this.#context.model_ref,
            content_ref: request.content_ref,
            content_sha256: sha256
        };
        const event = {
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
    async observeModelOutput(output) {
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
        const outputPayload = {
            model_ref: this.#context.model_ref,
            content_ref: response.content_ref,
            content_sha256: outputSha256
        };
        const outputEvent = {
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
        const decisionInput = Object.freeze({
            stage: "model_output",
            session: createFrozenMonitorSnapshot(this.#context),
            subject_event_id: subjectEventId,
            model_input: pendingInput,
            model_output: frozenOutput
        });
        // Ask provider
        let rawProposal;
        try {
            rawProposal = await this.#provider.decide(decisionInput);
        }
        catch {
            this.#providerFailureCount += 1;
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_decision_invalid");
        }
        const proposal = normalizeMonitorDecisionProposal(rawProposal);
        if (!proposal) {
            this.#providerFailureCount += 1;
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_decision_invalid");
        }
        // Reject proposals that echo raw model content
        const sensitiveValues = [pendingInput.content, frozenOutput.content].filter((v) => v.length > 0);
        if (sensitiveValues.some((s) => proposal.reason.includes(s) || proposal.evidence_refs.includes(s))) {
            this.#providerFailureCount += 1;
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_decision_invalid");
        }
        // Materialize decision
        const materializedDecision = {
            decision_id: this.#nextId("decision"),
            subject_event_id: subjectEventId,
            policy_id: proposal.policy_id,
            action: proposal.action,
            reason_code: proposal.reason_code,
            reason: proposal.reason,
            evidence_refs: [...proposal.evidence_refs],
            decided_at: this.#nextTimestamp()
        };
        this.#materializeDecision(subjectEventId, materializedDecision);
        const canContinue = materializedDecision.action === "allow" ||
            materializedDecision.action === "alert";
        // Retain frozen latest pair for future tool decision (volatile)
        this.#latestPair = { input: pendingInput, output: frozenOutput };
        // Clear pending input — pair is no longer pending
        this.#pendingInput = null;
        this.#pendingInputEventId = null;
        if (!canContinue) {
            // Model pair was denied/asked: lock the model stage but keep the
            // session open so the next tool call can be intercepted at the
            // tool_request stage. Further model input is rejected.
            this.#modelStageLocked = true;
        }
        const responseCopy = {
            content: frozenOutput.content,
            content_ref: frozenOutput.content_ref
        };
        return {
            response: responseCopy,
            decision: materializedDecision,
            can_continue: canContinue
        };
    }
    // -- two-phase tool observation -----------------------------------------
    async beforeTool(request) {
        if (this.#lifecycle !== "open") {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Require a completed model pair
        if (this.#latestPair === null) {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Reject if a tool call is already pending (do not seal — caller may
        // complete the pending call and retry).
        if (this.#pendingCall !== null) {
            throw new Track1MonitorError("monitor_state_invalid");
        }
        const normalizedRequest = normalizeSimulatedToolRequest(request);
        if (!normalizedRequest) {
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_request_invalid");
        }
        // Correlation with session context
        if (normalizedRequest.session_id !== this.#context.session_id ||
            normalizedRequest.scenario_id !== this.#context.scenario_id ||
            normalizedRequest.case_id !== this.#context.case_id) {
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_request_invalid");
        }
        const frozenRequest = createFrozenMonitorSnapshot(normalizedRequest);
        const argumentsRef = createToolArgumentsRef(normalizedRequest);
        const targetRef = createToolTargetRef(normalizedRequest);
        // Emit tool_request event
        const toolRequestEventId = this.#nextId("tool-request");
        const requestPayload = {
            call_id: normalizedRequest.call_id,
            tool_name: normalizedRequest.tool_name,
            target_ref: targetRef,
            arguments_ref: argumentsRef
        };
        const toolRequestEvent = {
            event_id: toolRequestEventId,
            session_id: this.#context.session_id,
            sequence: this.#nextSequence(),
            event_type: "tool_request",
            occurred_at: this.#nextTimestamp(),
            source: "agent",
            scenario_id: this.#context.scenario_id,
            case_id: this.#context.case_id,
            evidence_refs: [EVIDENCE_TOOL_REQUEST],
            payload: requestPayload
        };
        this.#events.push(toolRequestEvent);
        this.#toolCallCount += 1;
        // Ask provider at tool_request stage
        const decisionInput = Object.freeze({
            stage: "tool_request",
            session: createFrozenMonitorSnapshot(this.#context),
            subject_event_id: toolRequestEventId,
            model_input: this.#latestPair.input,
            model_output: this.#latestPair.output,
            tool_request: frozenRequest
        });
        let rawProposal;
        try {
            rawProposal = await this.#provider.decide(decisionInput);
        }
        catch {
            this.#providerFailureCount += 1;
            this.#emitFailedToolResult(normalizedRequest.call_id, normalizedRequest.tool_name);
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_failed");
        }
        const proposal = normalizeMonitorDecisionProposal(rawProposal);
        if (!proposal) {
            this.#providerFailureCount += 1;
            this.#emitFailedToolResult(normalizedRequest.call_id, normalizedRequest.tool_name);
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_failed");
        }
        // Reject proposals echoing raw model/tool content
        // P1-Fix9: include raw tool param strings (e.g. send_email body,
        // write_file content, call_api body values) in leak detection.
        const sensitiveValues = [
            this.#latestPair.input.content,
            this.#latestPair.output.content,
            ...collectRawToolArgumentStrings(normalizedRequest)
        ].filter((v) => v.length > 0);
        if (sensitiveValues.some((s) => proposal.reason.includes(s) || proposal.evidence_refs.includes(s))) {
            this.#providerFailureCount += 1;
            this.#emitFailedToolResult(normalizedRequest.call_id, normalizedRequest.tool_name);
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_failed");
        }
        const materializedDecision = {
            decision_id: this.#nextId("decision"),
            subject_event_id: toolRequestEventId,
            policy_id: proposal.policy_id,
            action: proposal.action,
            reason_code: proposal.reason_code,
            reason: proposal.reason,
            evidence_refs: [...proposal.evidence_refs],
            decided_at: this.#nextTimestamp()
        };
        this.#materializeDecision(toolRequestEventId, materializedDecision);
        const snapshot = this.#buildNonTerminalResult();
        if (proposal.action === "deny" || proposal.action === "ask") {
            // Intercept: emit rejected tool_result and seal
            this.#interceptedToolCount += 1;
            const interceptRef = `simulated-result://${normalizedRequest.call_id}/${sha256MonitorValue(normalizedRequest.call_id + "-intercepted")}`;
            const interceptPayload = {
                call_id: normalizedRequest.call_id,
                tool_name: normalizedRequest.tool_name,
                status: "rejected",
                result_ref: interceptRef,
                state_change: "none"
            };
            this.#pushToolResultEvent(interceptPayload);
            this.#clearVolatile();
            this.#seal();
            return {
                disposition: "intercept",
                decision: materializedDecision,
                snapshot
            };
        }
        // allow / alert: execute disposition, retain pending safe call record
        this.#executedToolCount += 1;
        this.#pendingCall = {
            call_id: normalizedRequest.call_id,
            tool_name: normalizedRequest.tool_name,
            target_ref: targetRef,
            arguments_ref: argumentsRef,
            subject_event_id: toolRequestEventId
        };
        return {
            disposition: "execute",
            decision: materializedDecision,
            snapshot
        };
    }
    afterTool(result) {
        if (this.#lifecycle !== "open") {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        if (this.#pendingCall === null) {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Structural validation of ObservedToolResult — require the known
        // fields to be present; extra fields are ignored (stripped) so callers
        // cannot smuggle sentinel content into the canonical event stream.
        if (!isPlainObject(result)) {
            this.#emitFailedToolResult(this.#pendingCall.call_id, this.#pendingCall.tool_name);
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_failed");
        }
        const r = result;
        // Correlation + value checks on the six canonical fields
        if (!isCorrelationId(r.session_id) ||
            r.session_id !== this.#context.session_id ||
            !isNonEmptyString(r.call_id) ||
            r.call_id !== this.#pendingCall.call_id ||
            !isNonEmptyString(r.tool_name) ||
            r.tool_name !== this.#pendingCall.tool_name ||
            (r.status !== "success" && r.status !== "failed") ||
            !isSafeReference(r.result_ref) ||
            (r.state_change !== "none" && r.state_change !== "simulated")) {
            this.#emitFailedToolResult(this.#pendingCall.call_id, this.#pendingCall.tool_name);
            this.#clearVolatile();
            this.#failSeal();
            throw new Track1MonitorError("monitor_tool_failed");
        }
        // Emit success/failed tool_result with safe fields only
        const payload = {
            call_id: r.call_id,
            tool_name: r.tool_name,
            status: r.status,
            result_ref: r.result_ref,
            state_change: r.state_change
        };
        this.#pushToolResultEvent(payload);
        // Clear pending call and volatile latest pair
        this.#pendingCall = null;
        this.#latestPair = null;
        return this.#buildNonTerminalResult();
    }
    // -- memory observation --------------------------------------------------
    observeMemoryWrite(value) {
        return this.#observeMemory(value, "memory_write", EVIDENCE_MEMORY_WRITE);
    }
    observeMemoryRead(value) {
        return this.#observeMemory(value, "memory_read", EVIDENCE_MEMORY_READ);
    }
    #observeMemory(value, eventType, evidenceRef) {
        if (this.#lifecycle !== "open") {
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // P1-Fix9: accept both the legacy 4-key shape and the envelope 5-key
        // shape (with content_sha256). The envelope-provided content_sha256, when
        // present and valid, is used directly instead of re-hashing `content`.
        const REQUIRED_MEMORY_KEYS = ["session_id", "memory_entry_id", "content", "content_ref"];
        const hasEnvelopeSha256 = isPlainObject(value) &&
            Object.prototype.hasOwnProperty.call(value, "content_sha256");
        if (!isPlainObject(value) ||
            !hasExactKeys(value, hasEnvelopeSha256
                ? [...REQUIRED_MEMORY_KEYS, "content_sha256"]
                : REQUIRED_MEMORY_KEYS)) {
            this.#seal();
            throw new Track1MonitorError("monitor_model_request_invalid");
        }
        if (!isCorrelationId(value.session_id) ||
            value.session_id !== this.#context.session_id ||
            !isNonEmptyString(value.memory_entry_id) ||
            !isNonEmptyString(value.content) ||
            !isSafeReference(value.content_ref)) {
            this.#seal();
            throw new Track1MonitorError("monitor_model_request_invalid");
        }
        // P1-Fix9: prefer envelope content_sha256 over re-hashing
        const envelopeSha256 = hasEnvelopeSha256
            ? value.content_sha256
            : undefined;
        if (envelopeSha256 !== undefined && !isValidSha256Hex(envelopeSha256)) {
            this.#seal();
            throw new Track1MonitorError("monitor_model_request_invalid");
        }
        const sha256 = envelopeSha256 ?? sha256MonitorValue(value.content);
        const payload = {
            memory_entry_id: value.memory_entry_id,
            content_ref: value.content_ref,
            content_sha256: sha256
        };
        const event = {
            event_id: this.#nextId(eventType),
            session_id: this.#context.session_id,
            sequence: this.#nextSequence(),
            event_type: eventType,
            occurred_at: this.#nextTimestamp(),
            source: "memory",
            scenario_id: this.#context.scenario_id,
            case_id: this.#context.case_id,
            evidence_refs: [evidenceRef],
            payload
        };
        this.#events.push(event);
        return this.#buildNonTerminalResult();
    }
    // -- defensive snapshot --------------------------------------------------
    snapshot() {
        if (this.#lifecycle === "finalized") {
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Sealed sessions may still be snapshotted (e.g. after intercept or
        // correlation failure) to inspect the canonical event stream.
        return this.#buildNonTerminalResult();
    }
    // -- finalization --------------------------------------------------------
    finalize() {
        if (this.#cachedResult) {
            return this.#cachedResult;
        }
        if (this.#lifecycle === "finalized") {
            throw new Track1MonitorError("monitor_state_invalid");
        }
        // Sealed sessions: an intercept seal (deny/ask at tool stage) can be
        // finalized to produce the canonical blocked result. A failure seal
        // (provider throw, correlation mismatch, malformed input) is a hard
        // error and finalize must reject.
        if (this.#lifecycle === "sealed") {
            if (this.#failed) {
                throw new Track1MonitorError("monitor_state_invalid");
            }
            if (this.#pendingInput !== null || this.#pendingCall !== null) {
                this.#clearVolatile();
                throw new Track1MonitorError("monitor_state_invalid");
            }
            // Build the finalized result from the intercept-sealed state.
            const finalTimestamp = this.#ports.now();
            const metadata = {
                schema_version: "track1-monitor.v1",
                model_call_count: this.#modelCallCount,
                tool_call_count: this.#toolCallCount,
                decision_count: this.#decisionCount,
                executed_tool_count: this.#executedToolCount,
                intercepted_tool_count: this.#interceptedToolCount,
                provider_failure_count: this.#providerFailureCount
            };
            const sealedResult = buildMonitorResult({
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
            this.#cachedResult = sealedResult;
            return sealedResult;
        }
        if (this.#pendingInput !== null || this.#pendingCall !== null) {
            this.#clearVolatile();
            this.#seal();
            throw new Track1MonitorError("monitor_state_invalid");
        }
        if (this.#modelCallCount === 0) {
            this.#seal();
            throw new Track1MonitorError("monitor_session_empty");
        }
        const finalTimestamp = this.#ports.now();
        const metadata = {
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
            failed: false
        });
        this.#clearVolatile();
        this.#lifecycle = "finalized";
        this.#cachedResult = result;
        return result;
    }
    // -- private helpers -----------------------------------------------------
    #materializeDecision(subjectEventId, materializedDecision) {
        const decisionEvent = {
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
    }
    #pushToolResultEvent(payload) {
        const event = {
            event_id: this.#nextId("tool-result"),
            session_id: this.#context.session_id,
            sequence: this.#nextSequence(),
            event_type: "tool_result",
            occurred_at: this.#nextTimestamp(),
            source: "tool",
            scenario_id: this.#context.scenario_id,
            case_id: this.#context.case_id,
            evidence_refs: [EVIDENCE_TOOL_RESULT],
            payload
        };
        this.#events.push(event);
    }
    #emitFailedToolResult(call_id, tool_name) {
        const failedRef = `simulated-result://${call_id}/${sha256MonitorValue(call_id + "-failed")}`;
        this.#pushToolResultEvent({
            call_id,
            tool_name,
            status: "failed",
            result_ref: failedRef,
            state_change: "none"
        });
    }
    #buildNonTerminalResult() {
        const metadata = {
            schema_version: "track1-monitor.v1",
            model_call_count: this.#modelCallCount,
            tool_call_count: this.#toolCallCount,
            decision_count: this.#decisionCount,
            executed_tool_count: this.#executedToolCount,
            intercepted_tool_count: this.#interceptedToolCount,
            provider_failure_count: this.#providerFailureCount
        };
        const built = buildMonitorResult({
            context: this.#context,
            events: [...this.#events],
            decisions: [...this.#decisions],
            alerts: [...this.#alerts],
            blockedRecords: [...this.#blockedRecords],
            metadata,
            firstTimestamp: this.#firstTimestamp,
            finalTimestamp: this.#ports.now(),
            failed: this.#failed
        });
        // A snapshot is non-terminal: the session is still in progress unless
        // it has been failure-sealed. Strip finished_at and force the status
        // to "running" for live sessions, or "failed" for failure-sealed ones.
        if (this.#failed) {
            return {
                ...built,
                status: "failed",
                summary: "Monitored sandbox session failed",
                finished_at: built.finished_at
            };
        }
        const { finished_at: _omit, ...withoutFinishedAt } = built;
        return {
            ...withoutFinishedAt,
            status: "running",
            summary: "Monitored sandbox session in progress"
        };
    }
    #normalizeObservedInputStructure(value) {
        if (!isPlainObject(value) ||
            !hasExactKeys(value, ["session_id", "content", "content_ref"])) {
            return null;
        }
        return normalizeMonitorModelRequest({
            content: value.content,
            content_ref: value.content_ref
        });
    }
    #normalizeObservedOutputStructure(value) {
        if (!isPlainObject(value) ||
            !hasExactKeys(value, ["session_id", "content", "content_ref"])) {
            return null;
        }
        return normalizeMonitorModelResponse({
            content: value.content,
            content_ref: value.content_ref
        });
    }
    #matchesSession(value) {
        return (isPlainObject(value) &&
            isCorrelationId(value.session_id) &&
            value.session_id === this.#context.session_id);
    }
    #clearVolatile() {
        this.#pendingInput = null;
        this.#pendingInputEventId = null;
        this.#latestPair = null;
        this.#pendingCall = null;
    }
    #seal() {
        this.#lifecycle = "sealed";
    }
    #failSeal() {
        this.#failed = true;
        this.#lifecycle = "sealed";
    }
    #nextSequence() {
        this.#sequence += 1;
        return this.#sequence;
    }
    #nextId(kind) {
        return this.#ports.nextId(kind);
    }
    #nextTimestamp() {
        return this.#ports.now();
    }
}
