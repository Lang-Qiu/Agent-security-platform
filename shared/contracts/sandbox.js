import { RISK_LEVELS } from "../constants/risk-level.js";
import { SANDBOX_EVENT_SOURCES, SANDBOX_EVENT_TYPES, SANDBOX_POLICY_ACTIONS, SANDBOX_TOOL_RESULT_STATUSES } from "../types/sandbox.js";
import { isOneOf, isPlainObject, isString, isStringArray } from "../utils/guards.js";
function isNonEmptyString(value) {
    return isString(value) && value.trim().length > 0;
}
function isValidCalendarDate(year, month, day) {
    if (month < 1 || month > 12)
        return false;
    if (day < 1 || day > 31)
        return false;
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    // leap year adjustment for February
    if (month === 2) {
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        const maxDay = isLeapYear ? 29 : 28;
        return day <= maxDay;
    }
    return day <= daysInMonth[month - 1];
}
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_8601_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function isIso8601(value) {
    if (!isString(value))
        return false;
    const match = value.match(ISO_8601_PATTERN);
    if (!match)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day))
        return false;
    return Number.isFinite(Date.parse(value));
}
function isNonEmptyStringArray(value) {
    return isStringArray(value) && value.every(isNonEmptyString);
}
function hasOptionalNonEmptyString(value, key) {
    return !(key in value) || isNonEmptyString(value[key]);
}
function normalizeModelContentPayload(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.model_ref) ||
        !isNonEmptyString(value.content_ref) ||
        !isString(value.content_sha256) ||
        !SHA256_PATTERN.test(value.content_sha256) ||
        !hasOptionalNonEmptyString(value, "summary")) {
        return null;
    }
    const normalized = {
        model_ref: value.model_ref,
        content_ref: value.content_ref,
        content_sha256: value.content_sha256
    };
    if (isNonEmptyString(value.summary)) {
        normalized.summary = value.summary;
    }
    return normalized;
}
function normalizeToolRequestPayload(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.call_id) ||
        !isNonEmptyString(value.tool_name) ||
        !isNonEmptyString(value.target_ref) ||
        !isNonEmptyString(value.arguments_ref)) {
        return null;
    }
    return {
        call_id: value.call_id,
        tool_name: value.tool_name,
        target_ref: value.target_ref,
        arguments_ref: value.arguments_ref
    };
}
function normalizeToolResultPayload(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.call_id) ||
        !isNonEmptyString(value.tool_name) ||
        !isOneOf(SANDBOX_TOOL_RESULT_STATUSES, value.status) ||
        !isNonEmptyString(value.result_ref) ||
        !isNonEmptyString(value.state_change)) {
        return null;
    }
    return {
        call_id: value.call_id,
        tool_name: value.tool_name,
        status: value.status,
        result_ref: value.result_ref,
        state_change: value.state_change
    };
}
function normalizeMemoryPayload(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.memory_entry_id) ||
        !isNonEmptyString(value.content_ref) ||
        !isString(value.content_sha256) ||
        !SHA256_PATTERN.test(value.content_sha256) ||
        !hasOptionalNonEmptyString(value, "summary")) {
        return null;
    }
    const normalized = {
        memory_entry_id: value.memory_entry_id,
        content_ref: value.content_ref,
        content_sha256: value.content_sha256
    };
    if (isNonEmptyString(value.summary)) {
        normalized.summary = value.summary;
    }
    return normalized;
}
export function normalizeSandboxPolicyDecision(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.decision_id) ||
        !isNonEmptyString(value.subject_event_id) ||
        !isNonEmptyString(value.policy_id) ||
        !isOneOf(SANDBOX_POLICY_ACTIONS, value.action) ||
        !isNonEmptyString(value.reason_code) ||
        !isNonEmptyString(value.reason) ||
        !isNonEmptyStringArray(value.evidence_refs) ||
        !isIso8601(value.decided_at)) {
        return null;
    }
    return {
        decision_id: value.decision_id,
        subject_event_id: value.subject_event_id,
        policy_id: value.policy_id,
        action: value.action,
        reason_code: value.reason_code,
        reason: value.reason,
        evidence_refs: [...value.evidence_refs],
        decided_at: value.decided_at
    };
}
function unreachableEventType(value) {
    return value;
}
export function normalizeSandboxBehaviorEvent(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.event_id) ||
        !isNonEmptyString(value.session_id) ||
        !Number.isInteger(value.sequence) ||
        value.sequence <= 0 ||
        !isOneOf(SANDBOX_EVENT_TYPES, value.event_type) ||
        !isIso8601(value.occurred_at) ||
        !isOneOf(SANDBOX_EVENT_SOURCES, value.source) ||
        !hasOptionalNonEmptyString(value, "scenario_id") ||
        !hasOptionalNonEmptyString(value, "case_id") ||
        !isNonEmptyStringArray(value.evidence_refs)) {
        return null;
    }
    const common = {
        event_id: value.event_id,
        session_id: value.session_id,
        sequence: value.sequence,
        occurred_at: value.occurred_at,
        source: value.source,
        evidence_refs: [...value.evidence_refs]
    };
    if (isNonEmptyString(value.scenario_id)) {
        common.scenario_id = value.scenario_id;
    }
    if (isNonEmptyString(value.case_id)) {
        common.case_id = value.case_id;
    }
    const eventType = value.event_type;
    switch (eventType) {
        case "model_input": {
            const payload = normalizeModelContentPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "model_output": {
            const payload = normalizeModelContentPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "tool_request": {
            const payload = normalizeToolRequestPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "tool_result": {
            const payload = normalizeToolResultPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "policy_decision": {
            const payload = normalizeSandboxPolicyDecision(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "memory_write": {
            const payload = normalizeMemoryPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        case "memory_read": {
            const payload = normalizeMemoryPayload(value.payload);
            return payload ? { ...common, event_type: eventType, payload } : null;
        }
        default:
            return unreachableEventType(eventType);
    }
}
export function normalizeSandboxAlert(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.alert_id) ||
        !isNonEmptyString(value.subject_event_id) ||
        !isNonEmptyString(value.decision_id) ||
        !isOneOf(RISK_LEVELS, value.risk_level) ||
        !isNonEmptyString(value.category) ||
        !isNonEmptyString(value.title) ||
        !isNonEmptyString(value.reason) ||
        !isNonEmptyStringArray(value.evidence_refs) ||
        !isIso8601(value.occurred_at)) {
        return null;
    }
    return {
        alert_id: value.alert_id,
        subject_event_id: value.subject_event_id,
        decision_id: value.decision_id,
        risk_level: value.risk_level,
        category: value.category,
        title: value.title,
        reason: value.reason,
        evidence_refs: [...value.evidence_refs],
        occurred_at: value.occurred_at
    };
}
export function normalizeSandboxBlockedRecord(value) {
    if (!isPlainObject(value) ||
        !isNonEmptyString(value.blocked_record_id) ||
        !isNonEmptyString(value.subject_event_id) ||
        !isNonEmptyString(value.decision_id) ||
        !isNonEmptyString(value.reason) ||
        !isNonEmptyStringArray(value.evidence_refs) ||
        !isIso8601(value.occurred_at)) {
        return null;
    }
    if ("resource_ref" in value &&
        value.resource_ref !== undefined &&
        (!isString(value.resource_ref) || value.resource_ref.trim().length === 0)) {
        return null;
    }
    const normalized = {
        blocked_record_id: value.blocked_record_id,
        subject_event_id: value.subject_event_id,
        decision_id: value.decision_id,
        reason: value.reason,
        evidence_refs: [...value.evidence_refs],
        occurred_at: value.occurred_at
    };
    if (isNonEmptyString(value.resource_ref)) {
        normalized.resource_ref = value.resource_ref;
    }
    return normalized;
}
function decisionFieldsEqual(a, b) {
    return (a.decision_id === b.decision_id &&
        a.subject_event_id === b.subject_event_id &&
        a.policy_id === b.policy_id &&
        a.action === b.action &&
        a.reason_code === b.reason_code &&
        a.reason === b.reason);
}
function arraysEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((value, index) => value === b[index]);
}
function fullDecisionEqual(a, b) {
    return (decisionFieldsEqual(a, b) &&
        arraysEqual(a.evidence_refs, b.evidence_refs) &&
        a.decided_at === b.decided_at);
}
export function satisfiesSandboxSupervisionContract(details) {
    const { events, policy_decisions, alerts, blocked_records } = details;
    // terminal fields are mandatory
    if (!isNonEmptyString(details.session_id))
        return false;
    if (typeof details.blocked !== "boolean")
        return false;
    if (!Number.isInteger(details.event_count) || details.event_count < 0)
        return false;
    if (!events || !policy_decisions || !alerts || !blocked_records) {
        return false;
    }
    if (!Array.isArray(events) || !Array.isArray(policy_decisions) || !Array.isArray(alerts) || !Array.isArray(blocked_records)) {
        return false;
    }
    // event ID uniqueness
    const eventIds = events.map((event) => event.event_id);
    if (new Set(eventIds).size !== eventIds.length)
        return false;
    // sequence uniqueness and strict order
    const sequences = events.map((event) => event.sequence);
    if (new Set(sequences).size !== sequences.length)
        return false;
    for (let i = 1; i < sequences.length; i++) {
        if (sequences[i] <= sequences[i - 1])
            return false;
    }
    // every event session matches details.session_id
    if (!events.every((event) => event.session_id === details.session_id))
        return false;
    // decision ID uniqueness
    const decisionIds = policy_decisions.map((d) => d.decision_id);
    if (new Set(decisionIds).size !== decisionIds.length)
        return false;
    // every decision subject exists in event IDs
    const eventIdSet = new Set(eventIds);
    if (!policy_decisions.every((d) => eventIdSet.has(d.subject_event_id)))
        return false;
    // policy decision events and policy_decisions are 1:1 and field-equal
    const policyEvents = events.filter((event) => event.event_type === "policy_decision");
    if (policyEvents.length !== policy_decisions.length)
        return false;
    // policy event decision IDs must be unique
    const policyEventDecisionIds = policyEvents.map((event) => event.payload.decision_id);
    if (new Set(policyEventDecisionIds).size !== policyEventDecisionIds.length)
        return false;
    // policy event decision IDs and policy_decisions IDs must be identical sets
    const policyDecisionIdSet = new Set(decisionIds);
    if (policyEventDecisionIds.length !== policyDecisionIdSet.size)
        return false;
    if (!policyEventDecisionIds.every((id) => policyDecisionIdSet.has(id)))
        return false;
    const decisionMap = new Map(policy_decisions.map((d) => [d.decision_id, d]));
    for (const event of policyEvents) {
        const payload = event.payload;
        const matching = decisionMap.get(payload.decision_id);
        if (!matching)
            return false;
        if (!fullDecisionEqual(payload, matching))
            return false;
    }
    // alert ID uniqueness
    const alertIds = alerts.map((a) => a.alert_id);
    if (new Set(alertIds).size !== alertIds.length)
        return false;
    // blocked record ID uniqueness
    const blockedIds = blocked_records.map((b) => b.blocked_record_id);
    if (new Set(blockedIds).size !== blockedIds.length)
        return false;
    // every alert resolves to an "alert" decision with same subject
    for (const alert of alerts) {
        const decision = decisionMap.get(alert.decision_id);
        if (!decision)
            return false;
        if (decision.action !== "alert")
            return false;
        if (decision.subject_event_id !== alert.subject_event_id)
            return false;
    }
    // every blocked record resolves to a "deny" decision with same subject
    for (const record of blocked_records) {
        const decision = decisionMap.get(record.decision_id);
        if (!decision)
            return false;
        if (decision.action !== "deny")
            return false;
        if (decision.subject_event_id !== record.subject_event_id)
            return false;
    }
    // every "alert" decision has at least one alert
    for (const decision of policy_decisions) {
        if (decision.action === "alert") {
            if (!alerts.some((a) => a.decision_id === decision.decision_id))
                return false;
        }
    }
    // every "deny" decision has at least one blocking record
    for (const decision of policy_decisions) {
        if (decision.action === "deny") {
            if (!blocked_records.some((b) => b.decision_id === decision.decision_id))
                return false;
        }
    }
    // event_count === events.length
    if (details.event_count !== events.length)
        return false;
    // blocked === (blocked_records.length > 0)
    if (details.blocked !== (blocked_records.length > 0))
        return false;
    return true;
}
