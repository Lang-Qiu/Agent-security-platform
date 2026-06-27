import { RISK_LEVELS } from "../constants/risk-level.ts";
import {
  SANDBOX_EVENT_SOURCES,
  SANDBOX_EVENT_TYPES,
  SANDBOX_POLICY_ACTIONS,
  SANDBOX_TOOL_RESULT_STATUSES
} from "../types/sandbox.ts";
import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxEventEnvelope,
  SandboxEventType,
  SandboxMemoryPayload,
  SandboxModelContentPayload,
  SandboxPolicyDecision,
  SandboxToolRequestPayload,
  SandboxToolResultPayload
} from "../types/sandbox.ts";
import { isOneOf, isPlainObject, isString, isStringArray } from "../utils/guards.ts";

const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isIso8601(value: unknown): value is string {
  return isString(value) && ISO_8601_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return isStringArray(value) && value.every(isNonEmptyString);
}

function hasOptionalNonEmptyString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || isNonEmptyString(value[key]);
}

function normalizeModelContentPayload(value: unknown): SandboxModelContentPayload | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.model_ref) ||
    !isNonEmptyString(value.content_ref) ||
    !isString(value.content_sha256) ||
    !SHA256_PATTERN.test(value.content_sha256) ||
    !hasOptionalNonEmptyString(value, "summary")
  ) {
    return null;
  }

  const normalized: SandboxModelContentPayload = {
    model_ref: value.model_ref,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };

  if (isNonEmptyString(value.summary)) {
    normalized.summary = value.summary;
  }

  return normalized;
}

function normalizeToolRequestPayload(value: unknown): SandboxToolRequestPayload | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.call_id) ||
    !isNonEmptyString(value.tool_name) ||
    !isNonEmptyString(value.target_ref) ||
    !isNonEmptyString(value.arguments_ref)
  ) {
    return null;
  }

  return {
    call_id: value.call_id,
    tool_name: value.tool_name,
    target_ref: value.target_ref,
    arguments_ref: value.arguments_ref
  };
}

function normalizeToolResultPayload(value: unknown): SandboxToolResultPayload | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.call_id) ||
    !isNonEmptyString(value.tool_name) ||
    !isOneOf(SANDBOX_TOOL_RESULT_STATUSES, value.status) ||
    !isNonEmptyString(value.result_ref) ||
    !isNonEmptyString(value.state_change)
  ) {
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

function normalizeMemoryPayload(value: unknown): SandboxMemoryPayload | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.memory_entry_id) ||
    !isNonEmptyString(value.content_ref) ||
    !isString(value.content_sha256) ||
    !SHA256_PATTERN.test(value.content_sha256) ||
    !hasOptionalNonEmptyString(value, "summary")
  ) {
    return null;
  }

  const normalized: SandboxMemoryPayload = {
    memory_entry_id: value.memory_entry_id,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };

  if (isNonEmptyString(value.summary)) {
    normalized.summary = value.summary;
  }

  return normalized;
}

export function normalizeSandboxPolicyDecision(value: unknown): SandboxPolicyDecision | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.decision_id) ||
    !isNonEmptyString(value.subject_event_id) ||
    !isNonEmptyString(value.policy_id) ||
    !isOneOf(SANDBOX_POLICY_ACTIONS, value.action) ||
    !isNonEmptyString(value.reason_code) ||
    !isNonEmptyString(value.reason) ||
    !isNonEmptyStringArray(value.evidence_refs) ||
    !isIso8601(value.decided_at)
  ) {
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

type SandboxEventCommon = Omit<
  SandboxEventEnvelope<SandboxEventType, unknown>,
  "event_type" | "payload"
>;

function unreachableEventType(value: never): null {
  return value;
}

export function normalizeSandboxBehaviorEvent(value: unknown): SandboxBehaviorEvent | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.event_id) ||
    !isNonEmptyString(value.session_id) ||
    !Number.isInteger(value.sequence) ||
    (value.sequence as number) <= 0 ||
    !isOneOf(SANDBOX_EVENT_TYPES, value.event_type) ||
    !isIso8601(value.occurred_at) ||
    !isOneOf(SANDBOX_EVENT_SOURCES, value.source) ||
    !hasOptionalNonEmptyString(value, "scenario_id") ||
    !hasOptionalNonEmptyString(value, "case_id") ||
    !isNonEmptyStringArray(value.evidence_refs)
  ) {
    return null;
  }

  const common: SandboxEventCommon = {
    event_id: value.event_id,
    session_id: value.session_id,
    sequence: value.sequence as number,
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

export function normalizeSandboxAlert(value: unknown): SandboxAlert | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.alert_id) ||
    !isNonEmptyString(value.subject_event_id) ||
    !isNonEmptyString(value.decision_id) ||
    !isOneOf(RISK_LEVELS, value.risk_level) ||
    !isNonEmptyString(value.category) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.reason) ||
    !isNonEmptyStringArray(value.evidence_refs) ||
    !isIso8601(value.occurred_at)
  ) {
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

export function normalizeSandboxBlockedRecord(value: unknown): SandboxBlockedRecord | null {
  if (
    !isPlainObject(value) ||
    !isNonEmptyString(value.blocked_record_id) ||
    !isNonEmptyString(value.subject_event_id) ||
    !isNonEmptyString(value.decision_id) ||
    !isNonEmptyString(value.reason) ||
    !isNonEmptyStringArray(value.evidence_refs) ||
    !isIso8601(value.occurred_at)
  ) {
    return null;
  }

  if (
    "resource_ref" in value &&
    value.resource_ref !== undefined &&
    (!isString(value.resource_ref) || value.resource_ref.trim().length === 0)
  ) {
    return null;
  }

  const normalized: SandboxBlockedRecord = {
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
