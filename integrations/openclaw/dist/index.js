var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../shared/constants/task-type.ts
var TASK_TYPES, TASK_TYPE_TO_ENGINE_TYPE;
var init_task_type = __esm({
  "../../shared/constants/task-type.ts"() {
    "use strict";
    TASK_TYPES = ["asset_scan", "static_analysis", "sandbox_run"];
    TASK_TYPE_TO_ENGINE_TYPE = {
      asset_scan: "asset_scan",
      static_analysis: "skills_static",
      sandbox_run: "sandbox"
    };
  }
});

// ../../shared/utils/guards.ts
function isPlainObject4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
  return typeof value === "string";
}
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isBoolean(value) {
  return typeof value === "boolean";
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isOneOf2(allowedValues, value) {
  return typeof value === "string" && allowedValues.includes(value);
}
var init_guards = __esm({
  "../../shared/utils/guards.ts"() {
    "use strict";
  }
});

// ../../shared/constants/risk-level.ts
var RISK_LEVELS;
var init_risk_level = __esm({
  "../../shared/constants/risk-level.ts"() {
    "use strict";
    RISK_LEVELS = ["info", "low", "medium", "high", "critical"];
  }
});

// ../../shared/types/sandbox.ts
var SANDBOX_EVENT_TYPES, SANDBOX_EVENT_SOURCES, SANDBOX_POLICY_ACTIONS2, SANDBOX_TOOL_RESULT_STATUSES;
var init_sandbox = __esm({
  "../../shared/types/sandbox.ts"() {
    "use strict";
    SANDBOX_EVENT_TYPES = [
      "model_input",
      "model_output",
      "tool_request",
      "tool_result",
      "policy_decision",
      "memory_write",
      "memory_read"
    ];
    SANDBOX_EVENT_SOURCES = ["model", "agent", "tool", "policy", "memory", "monitor"];
    SANDBOX_POLICY_ACTIONS2 = ["allow", "deny", "ask", "alert"];
    SANDBOX_TOOL_RESULT_STATUSES = ["success", "rejected", "failed"];
  }
});

// ../../shared/contracts/sandbox.ts
function isNonEmptyString3(value) {
  return isString(value) && value.trim().length > 0;
}
function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    const maxDay = isLeapYear ? 29 : 28;
    return day <= maxDay;
  }
  return day <= daysInMonth[month - 1];
}
function isIso8601(value) {
  if (!isString(value)) return false;
  const match = value.match(ISO_8601_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) return false;
  return Number.isFinite(Date.parse(value));
}
function isNonEmptyStringArray2(value) {
  return isStringArray(value) && value.every(isNonEmptyString3);
}
function hasOptionalNonEmptyString(value, key) {
  return !(key in value) || isNonEmptyString3(value[key]);
}
function normalizeModelContentPayload(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.model_ref) || !isNonEmptyString3(value.content_ref) || !isString(value.content_sha256) || !SHA256_PATTERN.test(value.content_sha256) || !hasOptionalNonEmptyString(value, "summary")) {
    return null;
  }
  const normalized = {
    model_ref: value.model_ref,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };
  if (isNonEmptyString3(value.summary)) {
    normalized.summary = value.summary;
  }
  return normalized;
}
function normalizeToolRequestPayload(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.call_id) || !isNonEmptyString3(value.tool_name) || !isNonEmptyString3(value.target_ref) || !isNonEmptyString3(value.arguments_ref)) {
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
  if (!isPlainObject4(value) || !isNonEmptyString3(value.call_id) || !isNonEmptyString3(value.tool_name) || !isOneOf2(SANDBOX_TOOL_RESULT_STATUSES, value.status) || !isNonEmptyString3(value.result_ref) || !isNonEmptyString3(value.state_change)) {
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
  if (!isPlainObject4(value) || !isNonEmptyString3(value.memory_entry_id) || !isNonEmptyString3(value.content_ref) || !isString(value.content_sha256) || !SHA256_PATTERN.test(value.content_sha256) || !hasOptionalNonEmptyString(value, "summary")) {
    return null;
  }
  const normalized = {
    memory_entry_id: value.memory_entry_id,
    content_ref: value.content_ref,
    content_sha256: value.content_sha256
  };
  if (isNonEmptyString3(value.summary)) {
    normalized.summary = value.summary;
  }
  return normalized;
}
function normalizeSandboxPolicyDecision(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.decision_id) || !isNonEmptyString3(value.subject_event_id) || !isNonEmptyString3(value.policy_id) || !isOneOf2(SANDBOX_POLICY_ACTIONS2, value.action) || !isNonEmptyString3(value.reason_code) || !isNonEmptyString3(value.reason) || !isNonEmptyStringArray2(value.evidence_refs) || !isIso8601(value.decided_at)) {
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
function normalizeSandboxBehaviorEvent(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.event_id) || !isNonEmptyString3(value.session_id) || !Number.isInteger(value.sequence) || value.sequence <= 0 || !isOneOf2(SANDBOX_EVENT_TYPES, value.event_type) || !isIso8601(value.occurred_at) || !isOneOf2(SANDBOX_EVENT_SOURCES, value.source) || !hasOptionalNonEmptyString(value, "scenario_id") || !hasOptionalNonEmptyString(value, "case_id") || !isNonEmptyStringArray2(value.evidence_refs)) {
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
  if (isNonEmptyString3(value.scenario_id)) {
    common.scenario_id = value.scenario_id;
  }
  if (isNonEmptyString3(value.case_id)) {
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
function normalizeSandboxAlert(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.alert_id) || !isNonEmptyString3(value.subject_event_id) || !isNonEmptyString3(value.decision_id) || !isOneOf2(RISK_LEVELS, value.risk_level) || !isNonEmptyString3(value.category) || !isNonEmptyString3(value.title) || !isNonEmptyString3(value.reason) || !isNonEmptyStringArray2(value.evidence_refs) || !isIso8601(value.occurred_at)) {
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
function normalizeSandboxBlockedRecord(value) {
  if (!isPlainObject4(value) || !isNonEmptyString3(value.blocked_record_id) || !isNonEmptyString3(value.subject_event_id) || !isNonEmptyString3(value.decision_id) || !isNonEmptyString3(value.reason) || !isNonEmptyStringArray2(value.evidence_refs) || !isIso8601(value.occurred_at)) {
    return null;
  }
  if ("resource_ref" in value && value.resource_ref !== void 0 && (!isString(value.resource_ref) || value.resource_ref.trim().length === 0)) {
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
  if (isNonEmptyString3(value.resource_ref)) {
    normalized.resource_ref = value.resource_ref;
  }
  return normalized;
}
function decisionFieldsEqual(a, b) {
  return a.decision_id === b.decision_id && a.subject_event_id === b.subject_event_id && a.policy_id === b.policy_id && a.action === b.action && a.reason_code === b.reason_code && a.reason === b.reason;
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}
function fullDecisionEqual(a, b) {
  return decisionFieldsEqual(a, b) && arraysEqual(a.evidence_refs, b.evidence_refs) && a.decided_at === b.decided_at;
}
function satisfiesSandboxSupervisionContract(details) {
  const { events, policy_decisions, alerts, blocked_records } = details;
  if (!isNonEmptyString3(details.session_id)) return false;
  if (typeof details.blocked !== "boolean") return false;
  if (!Number.isInteger(details.event_count) || details.event_count < 0) return false;
  if (!events || !policy_decisions || !alerts || !blocked_records) {
    return false;
  }
  if (!Array.isArray(events) || !Array.isArray(policy_decisions) || !Array.isArray(alerts) || !Array.isArray(blocked_records)) {
    return false;
  }
  const eventIds = events.map((event) => event.event_id);
  if (new Set(eventIds).size !== eventIds.length) return false;
  const sequences = events.map((event) => event.sequence);
  if (new Set(sequences).size !== sequences.length) return false;
  for (let i = 1; i < sequences.length; i++) {
    if (sequences[i] <= sequences[i - 1]) return false;
  }
  if (!events.every((event) => event.session_id === details.session_id)) return false;
  const decisionIds = policy_decisions.map((d) => d.decision_id);
  if (new Set(decisionIds).size !== decisionIds.length) return false;
  const eventIdSet = new Set(eventIds);
  if (!policy_decisions.every((d) => eventIdSet.has(d.subject_event_id))) return false;
  const policyEvents = events.filter(
    (event) => event.event_type === "policy_decision"
  );
  if (policyEvents.length !== policy_decisions.length) return false;
  const policyEventDecisionIds = policyEvents.map(
    (event) => event.payload.decision_id
  );
  if (new Set(policyEventDecisionIds).size !== policyEventDecisionIds.length) return false;
  const policyDecisionIdSet = new Set(decisionIds);
  if (policyEventDecisionIds.length !== policyDecisionIdSet.size) return false;
  if (!policyEventDecisionIds.every((id) => policyDecisionIdSet.has(id))) return false;
  const decisionMap = new Map(policy_decisions.map((d) => [d.decision_id, d]));
  for (const event of policyEvents) {
    const payload = event.payload;
    const matching = decisionMap.get(payload.decision_id);
    if (!matching) return false;
    if (!fullDecisionEqual(payload, matching)) return false;
  }
  const alertIds = alerts.map((a) => a.alert_id);
  if (new Set(alertIds).size !== alertIds.length) return false;
  const blockedIds = blocked_records.map((b) => b.blocked_record_id);
  if (new Set(blockedIds).size !== blockedIds.length) return false;
  for (const alert of alerts) {
    const decision = decisionMap.get(alert.decision_id);
    if (!decision) return false;
    if (decision.action !== "alert") return false;
    if (decision.subject_event_id !== alert.subject_event_id) return false;
  }
  for (const record of blocked_records) {
    const decision = decisionMap.get(record.decision_id);
    if (!decision) return false;
    if (decision.action !== "deny") return false;
    if (decision.subject_event_id !== record.subject_event_id) return false;
  }
  for (const decision of policy_decisions) {
    if (decision.action === "alert") {
      if (!alerts.some((a) => a.decision_id === decision.decision_id)) return false;
    }
  }
  for (const decision of policy_decisions) {
    if (decision.action === "deny") {
      if (!blocked_records.some((b) => b.decision_id === decision.decision_id)) return false;
    }
  }
  if (details.event_count !== events.length) return false;
  if (details.blocked !== blocked_records.length > 0) return false;
  return true;
}
var SHA256_PATTERN, ISO_8601_PATTERN;
var init_sandbox2 = __esm({
  "../../shared/contracts/sandbox.ts"() {
    "use strict";
    init_risk_level();
    init_sandbox();
    init_guards();
    SHA256_PATTERN = /^[a-f0-9]{64}$/;
    ISO_8601_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
  }
});

// ../../shared/types/skills-static.ts
var SKILLS_STATIC_SEVERITIES;
var init_skills_static = __esm({
  "../../shared/types/skills-static.ts"() {
    "use strict";
    SKILLS_STATIC_SEVERITIES = ["info", "low", "medium", "high", "critical"];
  }
});

// ../../shared/utils/normalizers.ts
function copyPlainObject(value) {
  return { ...value };
}
function copyArray(value) {
  return value.map((item) => {
    if (Array.isArray(item)) {
      return copyArray(item);
    }
    if (isPlainObject4(item)) {
      return copyPlainObject(item);
    }
    return item;
  });
}
function normalizeTaskTarget(value) {
  if (!isPlainObject4(value) || !isString(value.target_type) || !isString(value.target_value)) {
    return null;
  }
  const normalizedTarget = {
    target_type: value.target_type,
    target_value: value.target_value
  };
  if (isString(value.display_name)) {
    normalizedTarget.display_name = value.display_name;
  }
  if (isString(value.location)) {
    normalizedTarget.location = value.location;
  }
  if (isPlainObject4(value.metadata)) {
    normalizedTarget.metadata = copyPlainObject(value.metadata);
  }
  return normalizedTarget;
}
function normalizeAssetScanDetails(value) {
  if (!isPlainObject4(value)) {
    return null;
  }
  const normalizedDetails = {};
  const normalizedTarget = normalizeTaskTarget(value.target);
  if (normalizedTarget) {
    normalizedDetails.target = normalizedTarget;
  }
  if (isPlainObject4(value.fingerprint)) {
    normalizedDetails.fingerprint = copyPlainObject(value.fingerprint);
  }
  if (isNumber(value.confidence)) {
    normalizedDetails.confidence = value.confidence;
  }
  if (Array.isArray(value.matched_features)) {
    normalizedDetails.matched_features = copyArray(value.matched_features);
  }
  if (Array.isArray(value.open_ports)) {
    normalizedDetails.open_ports = copyArray(value.open_ports);
  }
  if (Array.isArray(value.http_endpoints)) {
    normalizedDetails.http_endpoints = copyArray(value.http_endpoints);
  }
  if (isBoolean(value.auth_detected)) {
    normalizedDetails.auth_detected = value.auth_detected;
  }
  if (Array.isArray(value.findings)) {
    normalizedDetails.findings = copyArray(value.findings);
  }
  if (isPlainObject4(value.execution_context)) {
    const executionContext = {};
    if (isNumber(value.execution_context.max_targets)) {
      executionContext.max_targets = value.execution_context.max_targets;
    }
    if (isNumber(value.execution_context.max_ports_per_target)) {
      executionContext.max_ports_per_target = value.execution_context.max_ports_per_target;
    }
    if (isNumber(value.execution_context.max_runtime_seconds)) {
      executionContext.max_runtime_seconds = value.execution_context.max_runtime_seconds;
    }
    if (isNumber(value.execution_context.target_http_rps_cap)) {
      executionContext.target_http_rps_cap = value.execution_context.target_http_rps_cap;
    }
    if (isNumber(value.execution_context.max_tcp_concurrency_per_target)) {
      executionContext.max_tcp_concurrency_per_target = value.execution_context.max_tcp_concurrency_per_target;
    }
    if (isPlainObject4(value.execution_context.audit)) {
      const audit = {};
      if (isString(value.execution_context.audit.query)) {
        audit.query = value.execution_context.audit.query;
      }
      if (isString(value.execution_context.audit.source)) {
        audit.source = value.execution_context.audit.source;
      }
      if (isString(value.execution_context.audit.requested_by)) {
        audit.requested_by = value.execution_context.audit.requested_by;
      }
      if (isString(value.execution_context.audit.requested_at)) {
        audit.requested_at = value.execution_context.audit.requested_at;
      }
      if (isString(value.execution_context.audit.interruption_reason) && isOneOf2(ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS, value.execution_context.audit.interruption_reason)) {
        audit.interruption_reason = value.execution_context.audit.interruption_reason;
      }
      executionContext.audit = audit;
    }
    normalizedDetails.execution_context = executionContext;
  }
  return normalizedDetails;
}
function normalizeSkillsStaticTraceStep(value) {
  if (!isPlainObject4(value)) {
    return null;
  }
  const normalizedTraceStep = {};
  if (isString(value.step)) {
    normalizedTraceStep.step = value.step;
  }
  if (isString(value.file_path)) {
    normalizedTraceStep.file_path = value.file_path;
  }
  if (isNumber(value.line_start)) {
    normalizedTraceStep.line_start = value.line_start;
  }
  if (isNumber(value.line_end)) {
    normalizedTraceStep.line_end = value.line_end;
  }
  if (isPlainObject4(value.metadata)) {
    normalizedTraceStep.metadata = copyPlainObject(value.metadata);
  }
  return normalizedTraceStep;
}
function normalizeSkillsStaticRuleHit(value) {
  if (!isPlainObject4(value) || !isString(value.rule_id) || !isOneOf2(SKILLS_STATIC_SEVERITIES, value.severity) || !isString(value.message) || !isString(value.file_path)) {
    return null;
  }
  const normalizedRuleHit = {
    rule_id: value.rule_id,
    severity: value.severity,
    message: value.message,
    file_path: value.file_path
  };
  if (isString(value.title)) {
    normalizedRuleHit.title = value.title;
  }
  if (isString(value.category)) {
    normalizedRuleHit.category = value.category;
  }
  if (isNumber(value.line_start)) {
    normalizedRuleHit.line_start = value.line_start;
  }
  if (isNumber(value.line_end)) {
    normalizedRuleHit.line_end = value.line_end;
  }
  if (isString(value.code_snippet)) {
    normalizedRuleHit.code_snippet = value.code_snippet;
  }
  if (isPlainObject4(value.evidence)) {
    normalizedRuleHit.evidence = copyPlainObject(value.evidence);
  }
  if (isString(value.recommendation)) {
    normalizedRuleHit.recommendation = value.recommendation;
  }
  if (isString(value.source_type)) {
    normalizedRuleHit.source_type = value.source_type;
  }
  if (isString(value.sink_type)) {
    normalizedRuleHit.sink_type = value.sink_type;
  }
  if (Array.isArray(value.trace)) {
    const normalizedTrace = value.trace.map((traceStep) => normalizeSkillsStaticTraceStep(traceStep)).filter((traceStep) => traceStep !== null);
    if (normalizedTrace.length > 0) {
      normalizedRuleHit.trace = normalizedTrace;
    }
  }
  if (isStringArray(value.tags)) {
    normalizedRuleHit.tags = [...value.tags];
  }
  if (isPlainObject4(value.metadata)) {
    normalizedRuleHit.metadata = copyPlainObject(value.metadata);
  }
  return normalizedRuleHit;
}
function normalizeStaticAnalysisDetails(value) {
  if (!isPlainObject4(value)) {
    return null;
  }
  const normalizedDetails = {};
  if (isString(value.sample_name)) {
    normalizedDetails.sample_name = value.sample_name;
  }
  if (isString(value.language)) {
    normalizedDetails.language = value.language;
  }
  if (isStringArray(value.entry_files)) {
    normalizedDetails.entry_files = [...value.entry_files];
  }
  if (isNumber(value.files_scanned)) {
    normalizedDetails.files_scanned = value.files_scanned;
  }
  if (Array.isArray(value.rule_hits)) {
    const normalizedRuleHits = value.rule_hits.map((ruleHit) => normalizeSkillsStaticRuleHit(ruleHit));
    if (normalizedRuleHits.some((ruleHit) => ruleHit === null)) {
      return null;
    }
    normalizedDetails.rule_hits = normalizedRuleHits;
  }
  if (isStringArray(value.sensitive_capabilities)) {
    normalizedDetails.sensitive_capabilities = [...value.sensitive_capabilities];
  }
  if (isPlainObject4(value.dependency_summary)) {
    normalizedDetails.dependency_summary = copyPlainObject(value.dependency_summary);
  }
  return normalizedDetails;
}
function normalizeSandboxRunDetails(value) {
  if (!isPlainObject4(value)) {
    return null;
  }
  const normalizedDetails = {};
  if (isString(value.session_id)) {
    normalizedDetails.session_id = value.session_id;
  }
  const normalizedTarget = normalizeTaskTarget(value.target);
  if (normalizedTarget) {
    normalizedDetails.target = normalizedTarget;
  }
  if ("events" in value) {
    if (!Array.isArray(value.events)) {
      return null;
    }
    const normalizedEvents = value.events.map(normalizeSandboxBehaviorEvent);
    if (normalizedEvents.some((event) => event === null)) {
      return null;
    }
    normalizedDetails.events = normalizedEvents;
  }
  if ("policy_decisions" in value) {
    if (!Array.isArray(value.policy_decisions)) {
      return null;
    }
    const normalizedDecisions = value.policy_decisions.map(normalizeSandboxPolicyDecision);
    if (normalizedDecisions.some((decision) => decision === null)) {
      return null;
    }
    normalizedDetails.policy_decisions = normalizedDecisions;
  }
  if ("alerts" in value) {
    if (!Array.isArray(value.alerts)) {
      return null;
    }
    const normalizedAlerts = value.alerts.map(normalizeSandboxAlert);
    if (normalizedAlerts.some((alert) => alert === null)) {
      return null;
    }
    normalizedDetails.alerts = normalizedAlerts;
  }
  if ("blocked_records" in value) {
    if (!Array.isArray(value.blocked_records)) {
      return null;
    }
    const normalizedBlockedRecords = value.blocked_records.map(normalizeSandboxBlockedRecord);
    if (normalizedBlockedRecords.some((record) => record === null)) {
      return null;
    }
    normalizedDetails.blocked_records = normalizedBlockedRecords;
  }
  if (isBoolean(value.blocked)) {
    normalizedDetails.blocked = value.blocked;
  }
  if (isNumber(value.event_count)) {
    normalizedDetails.event_count = value.event_count;
  }
  return normalizedDetails;
}
function normalizeResultDetails(taskType, value) {
  switch (taskType) {
    case "asset_scan":
      return normalizeAssetScanDetails(value);
    case "static_analysis":
      return normalizeStaticAnalysisDetails(value);
    case "sandbox_run":
      return normalizeSandboxRunDetails(value);
    default:
      return null;
  }
}
var ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS;
var init_normalizers = __esm({
  "../../shared/utils/normalizers.ts"() {
    "use strict";
    init_sandbox2();
    init_skills_static();
    init_guards();
    ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS = ["none", "budget", "timeout", "manual_stop"];
  }
});

// ../../shared/constants/engine-type.ts
var init_engine_type = __esm({
  "../../shared/constants/engine-type.ts"() {
    "use strict";
  }
});

// ../../shared/constants/task-status.ts
var TASK_STATUSES;
var init_task_status = __esm({
  "../../shared/constants/task-status.ts"() {
    "use strict";
    TASK_STATUSES = [
      "pending",
      "running",
      "finished",
      "failed",
      "blocked",
      "partial_success"
    ];
  }
});

// ../../shared/contracts/task.ts
function isTaskType(value) {
  return isOneOf2(TASK_TYPES, value);
}
function isTaskStatus(value) {
  return isOneOf2(TASK_STATUSES, value);
}
function isRiskLevel(value) {
  return isOneOf2(RISK_LEVELS, value);
}
var init_task = __esm({
  "../../shared/contracts/task.ts"() {
    "use strict";
    init_engine_type();
    init_risk_level();
    init_task_status();
    init_task_type();
    init_guards();
    init_normalizers();
  }
});

// ../../shared/contracts/result.ts
function satisfiesFinishedStaticAnalysisContract(details) {
  if (!isString(details.sample_name) || !isString(details.language) || !Array.isArray(details.rule_hits)) {
    return false;
  }
  return details.rule_hits.every((ruleHit) => {
    if (!isString(ruleHit.message) || !isString(ruleHit.file_path)) {
      return false;
    }
    const hasLineStart = typeof ruleHit.line_start === "number";
    const hasLineEnd = typeof ruleHit.line_end === "number";
    if (hasLineStart !== hasLineEnd) {
      return false;
    }
    if (hasLineStart && hasLineEnd && ruleHit.line_start > ruleHit.line_end) {
      return false;
    }
    return true;
  });
}
function normalizeBaseResult(value) {
  if (!isPlainObject4(value) || !isString(value.task_id) || !isString(value.task_type) || !isString(value.engine_type) || !isString(value.status) || !isString(value.risk_level) || !isString(value.summary) || !isString(value.created_at) || !isString(value.updated_at)) {
    return null;
  }
  if (!isTaskType(value.task_type) || !isTaskStatus(value.status) || !isRiskLevel(value.risk_level)) {
    return null;
  }
  if (value.engine_type !== TASK_TYPE_TO_ENGINE_TYPE[value.task_type]) {
    return null;
  }
  const normalizedDetails = normalizeResultDetails(value.task_type, value.details);
  if (!normalizedDetails) {
    return null;
  }
  if (value.task_type === "static_analysis" && value.status === "finished" && !satisfiesFinishedStaticAnalysisContract(normalizedDetails)) {
    return null;
  }
  if (value.task_type === "sandbox_run") {
    const sandboxDetails = normalizedDetails;
    const hasAllCollections = sandboxDetails.events !== void 0 && sandboxDetails.policy_decisions !== void 0 && sandboxDetails.alerts !== void 0 && sandboxDetails.blocked_records !== void 0;
    if (hasAllCollections && !satisfiesSandboxSupervisionContract(sandboxDetails)) {
      return null;
    }
    if ((value.status === "finished" || value.status === "blocked") && !satisfiesSandboxSupervisionContract(sandboxDetails)) {
      return null;
    }
    if (value.status === "blocked" && sandboxDetails.blocked !== true) {
      return null;
    }
  }
  const normalizedResult = {
    task_id: value.task_id,
    task_type: value.task_type,
    engine_type: value.engine_type,
    status: value.status,
    risk_level: value.risk_level,
    summary: value.summary,
    details: normalizedDetails,
    created_at: value.created_at,
    updated_at: value.updated_at
  };
  if (isString(value.result_id)) {
    normalizedResult.result_id = value.result_id;
  }
  if (isString(value.started_at)) {
    normalizedResult.started_at = value.started_at;
  }
  if (isString(value.finished_at)) {
    normalizedResult.finished_at = value.finished_at;
  }
  if (isPlainObject4(value.metadata)) {
    normalizedResult.metadata = { ...value.metadata };
  }
  return normalizedResult;
}
var init_result = __esm({
  "../../shared/contracts/result.ts"() {
    "use strict";
    init_task_type();
    init_guards();
    init_normalizers();
    init_sandbox2();
    init_task();
  }
});

// ../../shared/types/campaign-ingest.ts
var TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION, TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION, TRACK1_SNAPSHOT_MAX_BYTES, TRACK1_LIFECYCLE_MAX_BYTES, TRACK1_MODEL_REF_CANONICAL, TRACK1_CAMPAIGN_MANIFEST_SHA256;
var init_campaign_ingest = __esm({
  "../../shared/types/campaign-ingest.ts"() {
    "use strict";
    TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION = "track1-campaign-snapshot.v1";
    TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION = "track1-campaign-snapshot-ack.v1";
    TRACK1_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
    TRACK1_LIFECYCLE_MAX_BYTES = 256 * 1024;
    TRACK1_MODEL_REF_CANONICAL = "model://track1/openclaw-demo";
    TRACK1_CAMPAIGN_MANIFEST_SHA256 = "3fb7887447cc0d8814a52932ad0ad26abbd7a46b372ef4d629426ead205a1408";
  }
});

// ../../shared/types/campaign-supervision.ts
var TRACK1_CAMPAIGN_AGENT_IDS, TRACK1_SCENARIO_IDS, TRACK1_CASE_IDS;
var init_campaign_supervision = __esm({
  "../../shared/types/campaign-supervision.ts"() {
    "use strict";
    TRACK1_CAMPAIGN_AGENT_IDS = [
      "agent:track1:prompt-injection",
      "agent:track1:tool-hijack",
      "agent:track1:memory-poison"
    ];
    TRACK1_SCENARIO_IDS = [
      "T1-SC-001",
      "T1-SC-002",
      "T1-SC-003"
    ];
    TRACK1_CASE_IDS = [
      "T1-SC-001-C001",
      "T1-SC-001-C002",
      "T1-SC-001-C003",
      "T1-SC-002-C001",
      "T1-SC-002-C002",
      "T1-SC-002-C003",
      "T1-SC-003-C001",
      "T1-SC-003-C002",
      "T1-SC-003-C003"
    ];
  }
});

// ../../shared/contracts/campaign-supervision.ts
function hasExactKeys5(value, expected) {
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const ownKeys = Object.getOwnPropertyNames(value);
  if (ownKeys.length !== expected.length) return false;
  const expectedSet = new Set(expected);
  return ownKeys.every((key) => expectedSet.has(key));
}
function isCampaignId(value) {
  return isString(value) && CAMPAIGN_ID_PATTERN.test(value);
}
function isValidTrack1AgentScenarioCase(agentId, scenarioId, caseId) {
  const caseIdx = TRACK1_CASE_IDS.indexOf(caseId);
  if (caseIdx === -1) return false;
  const groupIdx = Math.floor(caseIdx / 3);
  return TRACK1_CAMPAIGN_AGENT_IDS[groupIdx] === agentId && TRACK1_SCENARIO_IDS[groupIdx] === scenarioId;
}
var SUMMARY_BASE_KEYS, SUMMARY_COMPLETED_KEYS, CAMPAIGN_ID_PATTERN;
var init_campaign_supervision2 = __esm({
  "../../shared/contracts/campaign-supervision.ts"() {
    "use strict";
    init_guards();
    init_sandbox();
    init_campaign_supervision();
    init_campaign_supervision();
    SUMMARY_BASE_KEYS = [
      "schema_version",
      "campaign_id",
      "status",
      "started_at",
      "updated_at",
      "agent_count",
      "case_count",
      "passed_case_count",
      "failed_case_count",
      "retry_count",
      "alert_count",
      "blocked_count",
      "ask_count",
      "evidence_available"
    ];
    SUMMARY_COMPLETED_KEYS = [
      ...SUMMARY_BASE_KEYS,
      "completed_at"
    ];
    CAMPAIGN_ID_PATTERN = /^campaign:t1:[0-9a-f]{32}$/;
  }
});

// ../../shared/contracts/campaign-ingest.ts
import { createHash as createHash2 } from "node:crypto";
function isSha256Hex(value) {
  return isString(value) && SHA256_PATTERN2.test(value);
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function isValidCalendarDate2(year, month, day) {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    return day <= (isLeapYear ? 29 : 28);
  }
  return day <= daysInMonth[month - 1];
}
function isStrictIso8601(value) {
  if (!isString(value)) return false;
  const match = value.match(ISO_8601_PATTERN2);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate2(year, month, day)) return false;
  if (!Number.isFinite(Date.parse(value))) return false;
  const offset = match[7];
  if (offset !== "Z") {
    const hours = Number(offset.substring(1, 3));
    const minutes = Number(offset.substring(4, 6));
    if (hours > 14) return false;
    if (hours === 14 && minutes > 0) return false;
  }
  return true;
}
function isAttemptId(value) {
  if (!isString(value)) return false;
  const match = value.match(ATTEMPT_ID_PATTERN);
  if (!match) return false;
  const caseId = `T1-SC-${match[1]}-C${match[2]}`;
  return TRACK1_CASE_IDS.includes(caseId);
}
function utf8ByteLength(text) {
  return Buffer.byteLength(text, "utf8");
}
function canonicalize(value) {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non-finite number encountered during canonicalization");
    }
    return value;
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject4(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result = {};
    for (const key of sortedKeys) {
      const child = value[key];
      if (child === void 0) {
        throw new Error("undefined value encountered during canonicalization");
      }
      result[key] = canonicalize(child);
    }
    return result;
  }
  throw new Error("non-JSON value encountered during canonicalization");
}
function stableCanonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}
function calculateTrack1SnapshotSha256(input) {
  return createHash2("sha256").update(`${stableCanonicalJson(input)}
`, "utf8").digest("hex");
}
function withinByteLimit(value, limit) {
  try {
    const json = stableCanonicalJson(value);
    return utf8ByteLength(json) <= limit;
  } catch {
    return false;
  }
}
function normalizeTrack1CampaignSnapshotEnvelope(input) {
  if (!isPlainObject4(input) || !hasExactKeys5(input, SNAPSHOT_KEYS)) return null;
  if (input.schema_version !== TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isSha256Hex(input.campaign_manifest_sha256)) return null;
  if (!isOneOf2(TRACK1_CAMPAIGN_AGENT_IDS, input.agent_id)) return null;
  if (!isOneOf2(TRACK1_SCENARIO_IDS, input.scenario_id)) return null;
  if (!isOneOf2(TRACK1_CASE_IDS, input.case_id)) return null;
  if (!isValidTrack1AgentScenarioCase(
    input.agent_id,
    input.scenario_id,
    input.case_id
  )) {
    return null;
  }
  if (input.attempt_index !== 1 && input.attempt_index !== 2) return null;
  if (!isAttemptId(input.attempt_id)) return null;
  if (!isPositiveInteger(input.sequence)) return null;
  if (input.sequence === 1) {
    if (input.previous_snapshot_sha256 !== null) return null;
  } else {
    if (input.previous_snapshot_sha256 === null) return null;
    if (!isSha256Hex(input.previous_snapshot_sha256)) return null;
  }
  if (!isStrictIso8601(input.observed_at)) return null;
  const expectedAttemptId = `attempt:${input.case_id.toLowerCase()}:${input.attempt_index}`;
  if (input.attempt_id !== expectedAttemptId) return null;
  if (!withinByteLimit(input, TRACK1_SNAPSHOT_MAX_BYTES)) return null;
  const normalizedResult = normalizeBaseResult(input.result);
  if (!normalizedResult) return null;
  const withoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    campaign_manifest_sha256: input.campaign_manifest_sha256,
    agent_id: input.agent_id,
    scenario_id: input.scenario_id,
    case_id: input.case_id,
    attempt_id: input.attempt_id,
    attempt_index: input.attempt_index,
    sequence: input.sequence,
    previous_snapshot_sha256: input.previous_snapshot_sha256,
    observed_at: input.observed_at,
    result: normalizedResult
  };
  const recomputedHash = calculateTrack1SnapshotSha256(withoutHash);
  if (recomputedHash !== input.snapshot_sha256) return null;
  return {
    ...withoutHash,
    snapshot_sha256: recomputedHash
  };
}
function normalizeTrack1CampaignSnapshotAck(input) {
  if (!isPlainObject4(input) || !hasExactKeys5(input, ACK_KEYS)) return null;
  if (input.schema_version !== TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION) return null;
  if (!isCampaignId(input.campaign_id)) return null;
  if (!isAttemptId(input.attempt_id)) return null;
  if (!isPositiveInteger(input.sequence)) return null;
  if (!isSha256Hex(input.snapshot_sha256)) return null;
  if (!isStrictIso8601(input.accepted_at)) return null;
  if (!withinByteLimit(input, TRACK1_LIFECYCLE_MAX_BYTES)) return null;
  return {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_ACK_SCHEMA_VERSION,
    campaign_id: input.campaign_id,
    attempt_id: input.attempt_id,
    sequence: input.sequence,
    snapshot_sha256: input.snapshot_sha256,
    accepted_at: input.accepted_at
  };
}
var SHA256_PATTERN2, ATTEMPT_ID_PATTERN, ISO_8601_PATTERN2, SNAPSHOT_KEYS, ACK_KEYS;
var init_campaign_ingest2 = __esm({
  "../../shared/contracts/campaign-ingest.ts"() {
    "use strict";
    init_guards();
    init_result();
    init_campaign_supervision2();
    init_campaign_supervision();
    init_campaign_ingest();
    SHA256_PATTERN2 = /^[a-f0-9]{64}$/;
    ATTEMPT_ID_PATTERN = /^attempt:t1-sc-(\d{3})-c(\d{3}):([12])$/;
    ISO_8601_PATTERN2 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
    SNAPSHOT_KEYS = [
      "schema_version",
      "campaign_id",
      "campaign_manifest_sha256",
      "agent_id",
      "scenario_id",
      "case_id",
      "attempt_id",
      "attempt_index",
      "sequence",
      "previous_snapshot_sha256",
      "observed_at",
      "result",
      "snapshot_sha256"
    ];
    ACK_KEYS = [
      "schema_version",
      "campaign_id",
      "attempt_id",
      "sequence",
      "snapshot_sha256",
      "accepted_at"
    ];
  }
});

// src/ingest-client.ts
var ingest_client_exports = {};
__export(ingest_client_exports, {
  Track1IngestClient: () => Track1IngestClient,
  Track1IngestError: () => Track1IngestError
});
function isPlainObject7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString6(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function normalizeConfig(value) {
  if (!isPlainObject7(value) || !isNonEmptyString6(value.ingestEndpoint) || !isNonEmptyString6(value.ingestToken) || value.ingestToken.trim().length === 0) {
    throw new Track1IngestError("track1_ingest_failed");
  }
  let url;
  try {
    url = new URL(value.ingestEndpoint);
  } catch {
    throw new Track1IngestError("track1_ingest_failed");
  }
  if (url.protocol !== FIXED_PROTOCOL || url.hostname !== FIXED_HOST || Number(url.port) !== FIXED_PORT || url.pathname !== FIXED_BASE_PATH || url.search !== "" || url.hash !== "") {
    throw new Track1IngestError("track1_ingest_failed");
  }
  return {
    ingestEndpoint: value.ingestEndpoint,
    ingestToken: value.ingestToken
  };
}
var Track1IngestError, FIXED_TIMEOUT_MS, FIXED_HOST, FIXED_PORT, FIXED_PROTOCOL, FIXED_BASE_PATH, NativeFetchTransport, Track1IngestClient;
var init_ingest_client = __esm({
  "src/ingest-client.ts"() {
    "use strict";
    init_campaign_ingest2();
    Track1IngestError = class extends Error {
      code;
      constructor(code) {
        super(code);
        this.name = "Track1IngestError";
        this.code = code;
      }
    };
    FIXED_TIMEOUT_MS = 5e3;
    FIXED_HOST = "backend";
    FIXED_PORT = 3001;
    FIXED_PROTOCOL = "http:";
    FIXED_BASE_PATH = "/internal/track1/campaigns";
    NativeFetchTransport = class {
      async request(method, url, headers, body, signal) {
        const response = await fetch(url.href, {
          method,
          headers,
          body,
          signal
        });
        const text = await response.text();
        return { status: response.status, body: text };
      }
    };
    Track1IngestClient = class {
      #config;
      #transport;
      constructor(config, transport) {
        this.#config = normalizeConfig(config);
        this.#transport = transport ?? new NativeFetchTransport();
      }
      async appendSnapshot(envelope) {
        const normalized = normalizeTrack1CampaignSnapshotEnvelope(envelope);
        if (!normalized) {
          throw new Track1IngestError("track1_ingest_failed");
        }
        const campaignId = normalized.campaign_id;
        const sequence = normalized.sequence;
        const attemptId = normalized.attempt_id;
        const snapshotSha256 = normalized.snapshot_sha256;
        const url = new URL(
          `${this.#config.ingestEndpoint}/${encodeURIComponent(campaignId)}/snapshots`
        );
        const headers = Object.freeze({
          authorization: `Bearer ${this.#config.ingestToken}`,
          "content-type": "application/json"
        });
        const body = JSON.stringify(normalized);
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          FIXED_TIMEOUT_MS
        );
        let response;
        try {
          response = await this.#transport.request(
            "POST",
            url,
            headers,
            body,
            controller.signal
          );
        } catch {
          throw new Track1IngestError("track1_ingest_failed");
        } finally {
          clearTimeout(timeoutId);
        }
        if (response.status !== 200 && response.status !== 202) {
          throw new Track1IngestError("track1_ingest_failed");
        }
        let parsedAck;
        try {
          parsedAck = JSON.parse(response.body);
        } catch {
          throw new Track1IngestError("track1_ingest_failed");
        }
        const ack = normalizeTrack1CampaignSnapshotAck(parsedAck);
        if (!ack) {
          throw new Track1IngestError("track1_ingest_failed");
        }
        if (ack.campaign_id !== campaignId || ack.attempt_id !== attemptId || ack.sequence !== sequence || ack.snapshot_sha256 !== snapshotSha256) {
          throw new Track1IngestError("track1_ingest_failed");
        }
        return ack;
      }
    };
  }
});

// src/plugin.ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// ../../engines/sandbox/src/monitoring/content-boundary.ts
import { createHash } from "node:crypto";

// ../../engines/sandbox/src/monitoring/contract.ts
var _failClosedEvidenceRefs = Object.freeze(["evidence://track1/monitor/provider-failure"]);
var MONITOR_FAIL_CLOSED_PROPOSAL = Object.freeze({
  policy_id: "policy://track1/monitor-fail-closed",
  action: "deny",
  reason_code: "decision_provider_failed",
  reason: "Decision provider failed closed",
  evidence_refs: _failClosedEvidenceRefs
});
var ERROR_MESSAGES = {
  monitor_context_invalid: "Monitor context is invalid",
  monitor_model_request_invalid: "Monitor model request is invalid",
  monitor_model_response_invalid: "Monitor model response is invalid",
  monitor_tool_request_invalid: "Monitor tool request is invalid",
  monitor_decision_invalid: "Monitor decision provider is invalid",
  monitor_model_failed: "Monitored model callback failed",
  monitor_tool_failed: "Monitored tool callback failed",
  monitor_state_invalid: "Monitor session state is invalid",
  monitor_session_empty: "Monitor session has no model call",
  monitor_result_invalid: "Monitor result is invalid"
};
var Track1MonitorError = class extends Error {
  code;
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.name = "Track1MonitorError";
    this.code = code;
  }
};
var SAFE_REF_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>"{}|\\^`\x00-\x1f\x7f?&#]+$/;
function isSafeReference(value) {
  return typeof value === "string" && SAFE_REF_PATTERN.test(value);
}
var CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function isCorrelationId(value) {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}
var SCENARIO_ID_PATTERN = /^T1-SC-\d{3}$/;
function isScenarioId(value) {
  return typeof value === "string" && SCENARIO_ID_PATTERN.test(value);
}
function isCaseId(value) {
  if (typeof value !== "string") return false;
  return /^T1-SC-\d{3}-C\d{3}$/.test(value);
}
var SANDBOX_POLICY_ACTIONS = ["allow", "deny", "ask", "alert"];
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
}
function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length && actualKeys.every((key, index) => key === sortedExpected[index]);
}
function isOneOf(allowed, value) {
  return typeof value === "string" && allowed.includes(value);
}
function allUnique(values) {
  return new Set(values).size === values.length;
}
function normalizeMonitorSessionContext(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["task_id", "session_id", "model_ref"]) && !hasExactKeys(value, ["task_id", "session_id", "model_ref", "scenario_id"]) && !hasExactKeys(value, ["task_id", "session_id", "model_ref", "scenario_id", "case_id"]) && !hasExactKeys(value, ["task_id", "session_id", "model_ref", "case_id"])) {
    return null;
  }
  if (!isCorrelationId(value.task_id) || !isCorrelationId(value.session_id) || !isSafeReference(value.model_ref)) {
    return null;
  }
  const result = {
    task_id: value.task_id,
    session_id: value.session_id,
    model_ref: value.model_ref
  };
  if ("scenario_id" in value && isNonEmptyString(value.scenario_id)) {
    if (!isScenarioId(value.scenario_id)) return null;
    result.scenario_id = value.scenario_id;
  }
  if ("case_id" in value && isNonEmptyString(value.case_id)) {
    if (!isCaseId(value.case_id)) return null;
    if (result.scenario_id) {
      if (!value.case_id.startsWith(result.scenario_id + "-C")) return null;
    } else {
      return null;
    }
    result.case_id = value.case_id;
  }
  return result;
}
function normalizeMonitorModelRequest(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["content", "content_ref"]) || !isNonEmptyString(value.content) || !isSafeReference(value.content_ref)) {
    return null;
  }
  return {
    content: value.content,
    content_ref: value.content_ref
  };
}
function normalizeMonitorModelResponse(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, ["content", "content_ref"]) || !isNonEmptyString(value.content) || !isSafeReference(value.content_ref)) {
    return null;
  }
  return {
    content: value.content,
    content_ref: value.content_ref
  };
}
function normalizeMonitorDecisionProposal(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "policy_id",
    "action",
    "reason_code",
    "reason",
    "evidence_refs"
  ]) || !isSafeReference(value.policy_id) || !isOneOf(SANDBOX_POLICY_ACTIONS, value.action) || !isNonEmptyString(value.reason_code) || !isNonEmptyString(value.reason) || !isNonEmptyStringArray(value.evidence_refs)) {
    return null;
  }
  if (!value.evidence_refs.every((ref) => isSafeReference(ref))) {
    return null;
  }
  if (!allUnique(value.evidence_refs)) {
    return null;
  }
  return {
    policy_id: value.policy_id,
    action: value.action,
    reason_code: value.reason_code,
    reason: value.reason,
    evidence_refs: [...value.evidence_refs]
  };
}
function normalizeMonitorRuntimePorts(value) {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ["now", "nextId"])) return null;
  if (typeof value.now !== "function" || typeof value.nextId !== "function") {
    return null;
  }
  return {
    now: value.now,
    nextId: value.nextId
  };
}

// ../../engines/sandbox/src/monitoring/content-boundary.ts
function sha256MonitorValue(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function isPlainObject2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isValidCanonicalValue(value) {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.every((item) => isValidCanonicalValue(item));
  }
  if (isPlainObject2(value)) {
    return Object.values(value).every((item) => isValidCanonicalValue(item));
  }
  return false;
}
function canonicalizeMonitorValue(value) {
  if (!isValidCanonicalValue(value)) {
    throw new Error("Value contains unsupported types for canonical serialization");
  }
  const seen = /* @__PURE__ */ new WeakSet();
  function detectCycles(v) {
    if (isPlainObject2(v) || Array.isArray(v)) {
      if (seen.has(v)) {
        throw new Error("Value contains circular references");
      }
      seen.add(v);
      if (Array.isArray(v)) {
        for (const item of v) detectCycles(item);
      } else {
        for (const key of Object.keys(v).sort()) {
          detectCycles(v[key]);
        }
      }
    }
  }
  detectCycles(value);
  return JSON.stringify(value, (key, val) => {
    if (isPlainObject2(val) && !Array.isArray(val)) {
      const sorted = {};
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}
function createFrozenMonitorSnapshot(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const seen = /* @__PURE__ */ new WeakSet();
  function detectCycles(v) {
    if (v !== null && typeof v === "object") {
      if (seen.has(v)) {
        throw new Error("Cannot create frozen snapshot of circular structure");
      }
      seen.add(v);
      if (Array.isArray(v)) {
        for (const item of v) detectCycles(item);
      } else {
        for (const val of Object.values(v)) {
          detectCycles(val);
        }
      }
    }
  }
  detectCycles(value);
  function deepFreezeCopy(v) {
    if (v === null || typeof v !== "object") {
      return v;
    }
    if (Array.isArray(v)) {
      const frozenArr = v.map((item) => deepFreezeCopy(item));
      return Object.freeze(frozenArr);
    }
    const copy = {};
    for (const key of Object.keys(v)) {
      copy[key] = deepFreezeCopy(v[key]);
    }
    return Object.freeze(copy);
  }
  return deepFreezeCopy(value);
}
function createToolArgumentsRef(request) {
  const canonical = canonicalizeMonitorValue(request.arguments);
  const digest = sha256MonitorValue(canonical);
  return `sha256://${digest}`;
}
function createToolTargetRef(request) {
  const canonical = canonicalizeMonitorValue(request.arguments);
  const digest = sha256MonitorValue(canonical);
  return `simulated-target://${request.tool_name}/${digest}`;
}
function collectRawToolArgumentStrings(request) {
  const strings = [];
  function collect(v) {
    if (typeof v === "string" && v.length > 0) {
      strings.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(collect);
    } else if (isPlainObject2(v)) {
      Object.values(v).forEach(collect);
    }
  }
  collect(request.arguments);
  return strings;
}
var SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
function isValidSha256Hex(value) {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

// ../../engines/sandbox/src/simulated-tools/contract.ts
function isPlainObject3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys2(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}
function isNonEmptyString2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isSafeCorrelationId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function isStringRecord(value) {
  return isPlainObject3(value) && Object.values(value).every((entry) => typeof entry === "string");
}
function normalizeRequestContext(value) {
  if (!isSafeCorrelationId(value.call_id) || !isSafeCorrelationId(value.session_id) || !isNonEmptyString2(value.scenario_id) || !isNonEmptyString2(value.case_id)) {
    return null;
  }
  if (!/^T1-SC-\d{3}$/.test(value.scenario_id)) {
    return null;
  }
  if (!new RegExp(`^${value.scenario_id}-C\\d{3}$`).test(value.case_id)) {
    return null;
  }
  return {
    call_id: value.call_id,
    session_id: value.session_id,
    scenario_id: value.scenario_id,
    case_id: value.case_id
  };
}
function normalizeSimulatedToolRequest(value) {
  if (!isPlainObject3(value) || !hasExactKeys2(value, [
    "call_id",
    "session_id",
    "scenario_id",
    "case_id",
    "tool_name",
    "arguments"
  ]) || !isPlainObject3(value.arguments)) {
    return null;
  }
  const context = normalizeRequestContext(value);
  if (!context) {
    return null;
  }
  switch (value.tool_name) {
    case "send_email": {
      if (!hasExactKeys2(value.arguments, ["recipient", "subject", "body"]) || !isNonEmptyString2(value.arguments.recipient) || !isNonEmptyString2(value.arguments.subject) || !isNonEmptyString2(value.arguments.body)) {
        return null;
      }
      return {
        ...context,
        tool_name: "send_email",
        arguments: {
          recipient: value.arguments.recipient,
          subject: value.arguments.subject,
          body: value.arguments.body
        }
      };
    }
    case "read_file": {
      if (!hasExactKeys2(value.arguments, ["path"]) || !isNonEmptyString2(value.arguments.path)) {
        return null;
      }
      return {
        ...context,
        tool_name: "read_file",
        arguments: {
          path: value.arguments.path
        }
      };
    }
    case "write_file": {
      if (!hasExactKeys2(value.arguments, ["path", "content"]) || !isNonEmptyString2(value.arguments.path) || typeof value.arguments.content !== "string") {
        return null;
      }
      return {
        ...context,
        tool_name: "write_file",
        arguments: {
          path: value.arguments.path,
          content: value.arguments.content
        }
      };
    }
    case "call_api": {
      const hasBody = Object.hasOwn(value.arguments, "body");
      const expectedKeys = hasBody ? ["endpoint", "method", "body"] : ["endpoint", "method"];
      if (!hasExactKeys2(value.arguments, expectedKeys) || !isNonEmptyString2(value.arguments.endpoint) || value.arguments.method !== "GET" && value.arguments.method !== "POST" || hasBody && !isStringRecord(value.arguments.body)) {
        return null;
      }
      return {
        ...context,
        tool_name: "call_api",
        arguments: {
          endpoint: value.arguments.endpoint,
          method: value.arguments.method,
          ...hasBody ? { body: { ...value.arguments.body } } : {}
        }
      };
    }
    default:
      return null;
  }
}

// ../../engines/sandbox/src/monitoring/result-builder.ts
init_result();
var TERMINAL_SUMMARIES = {
  failed: "Monitored sandbox session failed",
  blocked: "Monitored sandbox session blocked",
  finished: "Monitored sandbox session completed"
};
function buildMonitorResult(input) {
  const {
    context,
    events,
    decisions,
    alerts,
    blockedRecords,
    metadata,
    firstTimestamp,
    finalTimestamp
  } = input;
  const hasBlocked = blockedRecords.length > 0;
  const hasDeny = decisions.some((d) => d.action === "deny");
  const hasAlert = decisions.some((d) => d.action === "alert");
  const hasAsk = decisions.some((d) => d.action === "ask");
  const hasCallbackFailure = input.failed === true;
  let status;
  let riskLevel;
  let summary;
  if (hasCallbackFailure) {
    status = "failed";
    riskLevel = "high";
    summary = TERMINAL_SUMMARIES.failed;
  } else if (hasDeny || hasBlocked) {
    status = "blocked";
    riskLevel = "high";
    summary = TERMINAL_SUMMARIES.blocked;
  } else if (hasAlert) {
    status = "finished";
    riskLevel = "high";
    summary = TERMINAL_SUMMARIES.finished;
  } else if (hasAsk) {
    status = "finished";
    riskLevel = "medium";
    summary = TERMINAL_SUMMARIES.finished;
  } else {
    status = "finished";
    riskLevel = "info";
    summary = TERMINAL_SUMMARIES.finished;
  }
  const candidate = {
    task_id: context.task_id,
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status,
    risk_level: riskLevel,
    summary,
    details: {
      session_id: context.session_id,
      events: [...events],
      policy_decisions: [...decisions],
      alerts: [...alerts],
      blocked_records: [...blockedRecords],
      blocked: blockedRecords.length > 0,
      event_count: events.length
    },
    created_at: firstTimestamp,
    updated_at: finalTimestamp,
    finished_at: finalTimestamp,
    metadata: {
      monitor: { ...metadata }
    }
  };
  const normalized = normalizeBaseResult(candidate);
  if (!normalized) {
    throw new Track1MonitorError("monitor_result_invalid");
  }
  return normalized;
}

// ../../engines/sandbox/src/monitoring/observed-session.ts
var _defaultIdCounter = 0;
function defaultNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function defaultNextId(kind) {
  _defaultIdCounter += 1;
  return `${kind}-${Date.now().toString(36)}-${_defaultIdCounter.toString(36)}`;
}
var DEFAULT_PORTS = Object.freeze({
  now: defaultNow,
  nextId: defaultNextId
});
var EVIDENCE_MODEL_INPUT = "evidence://track1/monitor/model-input";
var EVIDENCE_MODEL_OUTPUT = "evidence://track1/monitor/model-output";
var EVIDENCE_POLICY_DECISION = "evidence://track1/monitor/policy-decision";
var EVIDENCE_TOOL_REQUEST = "evidence://track1/monitor/tool-request";
var EVIDENCE_TOOL_RESULT = "evidence://track1/monitor/tool-result";
var EVIDENCE_MEMORY_WRITE = "evidence://track1/monitor/memory-write";
var EVIDENCE_MEMORY_READ = "evidence://track1/monitor/memory-read";
function isPlainObject5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys3(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length && actualKeys.every((key, index) => key === sortedExpected[index]);
}
function isNonEmptyString4(value) {
  return typeof value === "string" && value.trim().length > 0;
}
var ObservedMonitoredSession = class {
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
    if (runtimePorts !== void 0) {
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
  observeModelInput(input) {
    if (this.#lifecycle !== "open") {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#pendingInput !== null) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#modelStageLocked) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    const request = this.#normalizeObservedInputStructure(input);
    if (!request) {
      this.#seal();
      throw new Track1MonitorError("monitor_model_request_invalid");
    }
    if (!this.#matchesSession(input)) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    const frozenInput = createFrozenMonitorSnapshot(request);
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
    this.#lastModelInputRef = request.content_ref;
    this.#lastModelInputSha256 = sha256;
    this.#latestPair = null;
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
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    const response = this.#normalizeObservedOutputStructure(output);
    if (!response) {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_model_response_invalid");
    }
    if (!this.#matchesSession(output)) {
      this.#clearVolatile();
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    const frozenOutput = createFrozenMonitorSnapshot(response);
    const pendingInput = this.#pendingInput;
    const subjectEventId = this.#pendingInputEventId;
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
    this.#lastModelOutputRef = response.content_ref;
    this.#lastModelOutputSha256 = outputSha256;
    const decisionInput = Object.freeze({
      stage: "model_output",
      session: createFrozenMonitorSnapshot(this.#context),
      subject_event_id: subjectEventId,
      model_input: pendingInput,
      model_output: frozenOutput
    });
    let rawProposal;
    try {
      rawProposal = await this.#provider.decide(decisionInput);
    } catch {
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
    const sensitiveValues = [pendingInput.content, frozenOutput.content].filter(
      (v) => v.length > 0
    );
    if (sensitiveValues.some(
      (s) => proposal.reason.includes(s) || proposal.evidence_refs.includes(s)
    )) {
      this.#providerFailureCount += 1;
      this.#clearVolatile();
      this.#failSeal();
      throw new Track1MonitorError("monitor_decision_invalid");
    }
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
    const canContinue = materializedDecision.action === "allow" || materializedDecision.action === "alert";
    this.#latestPair = { input: pendingInput, output: frozenOutput };
    this.#pendingInput = null;
    this.#pendingInputEventId = null;
    if (!canContinue) {
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
    if (this.#latestPair === null) {
      this.#seal();
      throw new Track1MonitorError("monitor_state_invalid");
    }
    if (this.#pendingCall !== null) {
      throw new Track1MonitorError("monitor_state_invalid");
    }
    const normalizedRequest = normalizeSimulatedToolRequest(request);
    if (!normalizedRequest) {
      this.#failSeal();
      throw new Track1MonitorError("monitor_tool_request_invalid");
    }
    if (normalizedRequest.session_id !== this.#context.session_id || normalizedRequest.scenario_id !== this.#context.scenario_id || normalizedRequest.case_id !== this.#context.case_id) {
      this.#failSeal();
      throw new Track1MonitorError("monitor_tool_request_invalid");
    }
    const frozenRequest = createFrozenMonitorSnapshot(normalizedRequest);
    const argumentsRef = createToolArgumentsRef(normalizedRequest);
    const targetRef = createToolTargetRef(normalizedRequest);
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
    } catch {
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
    const sensitiveValues = [
      this.#latestPair.input.content,
      this.#latestPair.output.content,
      ...collectRawToolArgumentStrings(normalizedRequest)
    ].filter((v) => v.length > 0);
    if (sensitiveValues.some(
      (s) => proposal.reason.includes(s) || proposal.evidence_refs.includes(s)
    )) {
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
    if (!isPlainObject5(result)) {
      this.#emitFailedToolResult(
        this.#pendingCall.call_id,
        this.#pendingCall.tool_name
      );
      this.#clearVolatile();
      this.#failSeal();
      throw new Track1MonitorError("monitor_tool_failed");
    }
    const r = result;
    if (!isCorrelationId(r.session_id) || r.session_id !== this.#context.session_id || !isNonEmptyString4(r.call_id) || r.call_id !== this.#pendingCall.call_id || !isNonEmptyString4(r.tool_name) || r.tool_name !== this.#pendingCall.tool_name || r.status !== "success" && r.status !== "failed" || !isSafeReference(r.result_ref) || r.state_change !== "none" && r.state_change !== "simulated") {
      this.#emitFailedToolResult(
        this.#pendingCall.call_id,
        this.#pendingCall.tool_name
      );
      this.#clearVolatile();
      this.#failSeal();
      throw new Track1MonitorError("monitor_tool_failed");
    }
    const payload = {
      call_id: r.call_id,
      tool_name: r.tool_name,
      status: r.status,
      result_ref: r.result_ref,
      state_change: r.state_change
    };
    this.#pushToolResultEvent(payload);
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
    const REQUIRED_MEMORY_KEYS = ["session_id", "memory_entry_id", "content", "content_ref"];
    const hasEnvelopeSha256 = isPlainObject5(value) && Object.prototype.hasOwnProperty.call(value, "content_sha256");
    if (!isPlainObject5(value) || !hasExactKeys3(
      value,
      hasEnvelopeSha256 ? [...REQUIRED_MEMORY_KEYS, "content_sha256"] : REQUIRED_MEMORY_KEYS
    )) {
      this.#seal();
      throw new Track1MonitorError("monitor_model_request_invalid");
    }
    if (!isCorrelationId(value.session_id) || value.session_id !== this.#context.session_id || !isNonEmptyString4(value.memory_entry_id) || !isNonEmptyString4(value.content) || !isSafeReference(value.content_ref)) {
      this.#seal();
      throw new Track1MonitorError("monitor_model_request_invalid");
    }
    const envelopeSha256 = hasEnvelopeSha256 ? value.content_sha256 : void 0;
    if (envelopeSha256 !== void 0 && !isValidSha256Hex(envelopeSha256)) {
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
    if (this.#lifecycle === "sealed") {
      if (this.#failed) {
        throw new Track1MonitorError("monitor_state_invalid");
      }
      if (this.#pendingInput !== null || this.#pendingCall !== null) {
        this.#clearVolatile();
        throw new Track1MonitorError("monitor_state_invalid");
      }
      const finalTimestamp2 = this.#ports.now();
      const metadata2 = {
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
        metadata: metadata2,
        firstTimestamp: this.#firstTimestamp,
        finalTimestamp: finalTimestamp2,
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
    if (!isPlainObject5(value) || !hasExactKeys3(value, ["session_id", "content", "content_ref"])) {
      return null;
    }
    return normalizeMonitorModelRequest({
      content: value.content,
      content_ref: value.content_ref
    });
  }
  #normalizeObservedOutputStructure(value) {
    if (!isPlainObject5(value) || !hasExactKeys3(value, ["session_id", "content", "content_ref"])) {
      return null;
    }
    return normalizeMonitorModelResponse({
      content: value.content,
      content_ref: value.content_ref
    });
  }
  #matchesSession(value) {
    return isPlainObject5(value) && isCorrelationId(value.session_id) && value.session_id === this.#context.session_id;
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
};

// ../../engines/sandbox/src/simulated-tools/state.ts
function apiRouteKey(method, endpoint) {
  return `${method} ${endpoint}`;
}
function copyApiRoute(route) {
  return {
    ...route,
    body: { ...route.body }
  };
}
var InMemorySimulatedToolState = class {
  outbox = [];
  files;
  apiRoutes;
  constructor(options = {}) {
    this.files = new Map(Object.entries(options.files ?? {}));
    this.apiRoutes = new Map(
      (options.api_routes ?? []).map((route) => [
        apiRouteKey(route.method, route.endpoint),
        copyApiRoute(route)
      ])
    );
  }
  appendEmail(record) {
    this.outbox.push({ ...record });
  }
  readFile(path) {
    return this.files.get(path);
  }
  writeFile(path, content) {
    this.files.set(path, content);
  }
  resolveApiRoute(method, endpoint) {
    const route = this.apiRoutes.get(apiRouteKey(method, endpoint));
    return route ? copyApiRoute(route) : void 0;
  }
  snapshot() {
    return {
      outbox: this.outbox.map((record) => ({ ...record })),
      files: Object.fromEntries(this.files.entries()),
      api_routes: Array.from(this.apiRoutes.values(), copyApiRoute)
    };
  }
};

// ../../engines/sandbox/src/simulated-tools/executor.ts
var VIRTUAL_FILE_PREFIX = "sandbox://fixtures/";
var MOCK_API_PREFIX = "mock://api.local/";
function evidence(request, target_ref, state_change) {
  return {
    evidence_ref: `simulated-tool://${request.call_id}`,
    simulated: true,
    target_ref,
    state_change
  };
}
function reject(request, targetRef, rejection_code, summary) {
  return {
    call_id: request.call_id,
    session_id: request.session_id,
    scenario_id: request.scenario_id,
    case_id: request.case_id,
    tool_name: request.tool_name,
    status: "rejected",
    rejection_code,
    summary,
    evidence: evidence(request, targetRef, "none")
  };
}
function hasSafePathSegments(value, prefix) {
  if (!value.startsWith(prefix) || value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")) {
    return false;
  }
  const relativePath = value.slice(prefix.length);
  if (relativePath.length === 0) {
    return false;
  }
  return relativePath.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isAllowedEmailRecipient(recipient) {
  return /^[^@\s]+@local\.invalid$/i.test(recipient);
}
function isAllowedVirtualPath(path) {
  return hasSafePathSegments(path, VIRTUAL_FILE_PREFIX);
}
function isAllowedMockEndpoint(endpoint) {
  return hasSafePathSegments(endpoint, MOCK_API_PREFIX);
}
function resultContext(request) {
  return {
    call_id: request.call_id,
    session_id: request.session_id,
    scenario_id: request.scenario_id,
    case_id: request.case_id
  };
}
var SimulatedToolExecutor = class {
  state;
  constructor(state) {
    this.state = state;
  }
  execute(request) {
    switch (request.tool_name) {
      case "send_email":
        return this.sendEmail(request);
      case "read_file":
        return this.readFile(request);
      case "write_file":
        return this.writeFile(request);
      case "call_api":
        return this.callApi(request);
    }
  }
  sendEmail(request) {
    const { recipient, subject, body } = request.arguments;
    if (!isAllowedEmailRecipient(recipient)) {
      return reject(
        request,
        recipient,
        "target_not_allowed",
        "Email recipient is outside the controlled local.invalid domain"
      );
    }
    const message_id = `sim-email-${request.call_id}`;
    this.state.appendEmail({
      message_id,
      recipient,
      subject,
      body
    });
    return {
      ...resultContext(request),
      tool_name: "send_email",
      status: "simulated_success",
      summary: "Simulated email appended to the local outbox",
      output: {
        message_id,
        recipient,
        subject
      },
      evidence: evidence(request, recipient, "outbox_append")
    };
  }
  readFile(request) {
    const { path } = request.arguments;
    if (!isAllowedVirtualPath(path)) {
      return reject(
        request,
        path,
        "target_not_allowed",
        "File path is outside the controlled sandbox fixture namespace"
      );
    }
    const content = this.state.readFile(path);
    if (content === void 0) {
      return reject(
        request,
        path,
        "resource_not_found",
        "Virtual file does not exist"
      );
    }
    return {
      ...resultContext(request),
      tool_name: "read_file",
      status: "simulated_success",
      summary: "Virtual sandbox file read",
      output: {
        path,
        content
      },
      evidence: evidence(request, path, "none")
    };
  }
  writeFile(request) {
    const { path, content } = request.arguments;
    if (!isAllowedVirtualPath(path)) {
      return reject(
        request,
        path,
        "target_not_allowed",
        "File path is outside the controlled sandbox fixture namespace"
      );
    }
    this.state.writeFile(path, content);
    return {
      ...resultContext(request),
      tool_name: "write_file",
      status: "simulated_success",
      summary: "Virtual sandbox file written",
      output: {
        path,
        bytes_written: Buffer.byteLength(content)
      },
      evidence: evidence(request, path, "virtual_file_write")
    };
  }
  callApi(request) {
    const { endpoint, method } = request.arguments;
    if (!isAllowedMockEndpoint(endpoint)) {
      return reject(
        request,
        endpoint,
        "target_not_allowed",
        "API endpoint is outside the controlled mock route namespace"
      );
    }
    const route = this.state.resolveApiRoute(method, endpoint);
    if (!route) {
      return reject(
        request,
        endpoint,
        "resource_not_found",
        "Mock API route does not exist"
      );
    }
    return {
      ...resultContext(request),
      tool_name: "call_api",
      status: "simulated_success",
      summary: "Mock API route resolved",
      output: {
        endpoint,
        method,
        status_code: route.status_code,
        body: { ...route.body }
      },
      evidence: evidence(request, endpoint, "none")
    };
  }
};

// src/tool-adapters.ts
function safeJson(value) {
  return JSON.stringify(value);
}
function buildResult(payload) {
  return {
    content: [{ type: "text", text: safeJson(payload) }],
    details: payload
  };
}
function successPayload(result) {
  const safeOutput = buildSafeOutput(result);
  return {
    call_id: result.call_id,
    tool_name: result.tool_name,
    status: result.status,
    summary: result.summary,
    output: safeOutput,
    evidence: result.evidence
  };
}
function buildSafeOutput(result) {
  switch (result.tool_name) {
    case "send_email":
      return {
        message_id: result.output.message_id,
        recipient: result.output.recipient
      };
    case "read_file":
      return {
        path: result.output.path
      };
    case "write_file":
      return {
        path: result.output.path,
        bytes_written: result.output.bytes_written
      };
    case "call_api":
      return {
        endpoint: result.output.endpoint,
        method: result.output.method,
        status_code: result.output.status_code
      };
  }
}
function rejectedPayload(result) {
  return {
    call_id: result.call_id,
    tool_name: result.tool_name,
    status: result.status,
    rejection_code: result.rejection_code,
    summary: result.summary,
    evidence: result.evidence
  };
}
function buildToolResult(result) {
  if (result.status === "simulated_success") {
    return buildResult(successPayload(result));
  }
  return buildResult(rejectedPayload(result));
}
function buildRequest(runtime, toolName, callId, args) {
  const base = {
    call_id: callId,
    session_id: runtime.session_id,
    scenario_id: runtime.scenario_id,
    case_id: runtime.case_id
  };
  switch (toolName) {
    case "send_email":
      return {
        ...base,
        tool_name: "send_email",
        arguments: args
      };
    case "read_file":
      return {
        ...base,
        tool_name: "read_file",
        arguments: args
      };
    case "write_file":
      return {
        ...base,
        tool_name: "write_file",
        arguments: args
      };
    case "call_api":
      return {
        ...base,
        tool_name: "call_api",
        arguments: args
      };
  }
}
var SEND_EMAIL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["recipient", "subject", "body"],
  properties: {
    recipient: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" }
  }
};
var READ_FILE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: { type: "string" }
  }
};
var WRITE_FILE_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["path", "content"],
  properties: {
    path: { type: "string" },
    content: { type: "string" }
  }
};
var CALL_API_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["endpoint", "method"],
  properties: {
    endpoint: { type: "string" },
    method: { type: "string", enum: ["GET", "POST"] }
  }
};
function registerTrack1Tools(api, resolver) {
  api.registerTool({
    name: "send_email",
    label: "Send Email (Track 1 Simulated)",
    description: "Append an email to the campaign-local simulated outbox",
    parameters: SEND_EMAIL_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "send_email", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });
  api.registerTool({
    name: "read_file",
    label: "Read File (Track 1 Simulated)",
    description: "Read from the campaign-local virtual file namespace",
    parameters: READ_FILE_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "read_file", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });
  api.registerTool({
    name: "write_file",
    label: "Write File (Track 1 Simulated)",
    description: "Write to the campaign-local virtual file namespace",
    parameters: WRITE_FILE_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "write_file", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });
  api.registerTool({
    name: "call_api",
    label: "Call API (Track 1 Simulated)",
    description: "Resolve a campaign-local mock API route",
    parameters: CALL_API_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(resolver, ctx, toolCallId);
      const request = buildRequest(runtime, "call_api", toolCallId, params);
      const result = runtime.executor.execute(request);
      return buildToolResult(result);
    }
  });
}
function resolveRuntime(resolver, ctx, toolCallId) {
  const sessionId = ctx?.sessionId ?? resolveSessionByToolCallId(toolCallId);
  if (!sessionId) {
    throw new Error("track1_tool_session_not_found");
  }
  const runtime = resolver.resolveToolRuntime(sessionId);
  if (!runtime) {
    throw new Error("track1_tool_runtime_not_found");
  }
  return runtime;
}
var toolCallSessionMap = /* @__PURE__ */ new Map();
function resolveSessionByToolCallId(toolCallId) {
  return toolCallSessionMap.get(toolCallId);
}

// src/campaign-context.ts
init_campaign_ingest();
var Track1PluginContextError = class extends Error {
  code;
  constructor(code) {
    super(code);
    this.name = "Track1PluginContextError";
    this.code = code;
  }
};
function isPlainObject6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString5(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function hasExactKeys4(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length && actualKeys.every((key, index) => key === sortedExpected[index]);
}
var CONTEXT_KEYS = [
  "campaign_id",
  "attempt_id",
  "attempt_index",
  "agent_id",
  "session_id",
  "scenario_id",
  "case_id",
  "model_ref"
];
var MODEL_INPUT_KEYS = [
  "schema_version",
  "campaign_id",
  "agent_id",
  "attempt_id",
  "attempt_index",
  "session_id",
  "case_id",
  "scenario_id",
  "user_prompt",
  "retrieved_content",
  "memory_entries",
  "proposed_tool_call"
];
function isValidMemoryEntry(value) {
  if (!isPlainObject6(value)) return false;
  return isNonEmptyString5(value.memory_entry_id) && isNonEmptyString5(value.content_ref) && isNonEmptyString5(value.content_sha256);
}
function isValidToolProposal(value) {
  if (value === null) return true;
  if (!isPlainObject6(value)) return false;
  return (value.tool_name === "send_email" || value.tool_name === "read_file" || value.tool_name === "write_file" || value.tool_name === "call_api") && isNonEmptyString5(value.arguments_ref);
}
function normalizeTrack1PluginContext(value) {
  if (!isPlainObject6(value) || !hasExactKeys4(value, CONTEXT_KEYS)) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }
  if (!isNonEmptyString5(value.campaign_id) || !isNonEmptyString5(value.attempt_id) || !isNonEmptyString5(value.agent_id) || !isNonEmptyString5(value.session_id) || !isNonEmptyString5(value.scenario_id) || !isNonEmptyString5(value.case_id) || !isNonEmptyString5(value.model_ref)) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }
  if (value.attempt_index !== 1 && value.attempt_index !== 2) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }
  if (value.model_ref !== TRACK1_MODEL_REF_CANONICAL) {
    throw new Track1PluginContextError("track1_plugin_context_invalid");
  }
  for (const field of [
    "campaign_id",
    "attempt_id",
    "agent_id",
    "session_id"
  ]) {
    if (value[field] === "foreign") {
      throw new Track1PluginContextError("track1_plugin_context_invalid");
    }
  }
  return Object.freeze({
    campaign_id: value.campaign_id,
    attempt_id: value.attempt_id,
    attempt_index: value.attempt_index,
    agent_id: value.agent_id,
    session_id: value.session_id,
    scenario_id: value.scenario_id,
    case_id: value.case_id,
    model_ref: value.model_ref
  });
}
function normalizeTrack1ModelInputEnvelope(value) {
  if (!isPlainObject6(value) || !hasExactKeys4(value, MODEL_INPUT_KEYS)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (value.schema_version !== "track1-openclaw-input.v1") {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (!isNonEmptyString5(value.campaign_id) || !isNonEmptyString5(value.agent_id) || !isNonEmptyString5(value.attempt_id) || !isNonEmptyString5(value.session_id) || !isNonEmptyString5(value.case_id) || !isNonEmptyString5(value.scenario_id) || !isNonEmptyString5(value.user_prompt)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (value.attempt_index !== 1 && value.attempt_index !== 2) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (!Array.isArray(value.retrieved_content) || !value.retrieved_content.every(isValidMemoryEntry)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (!Array.isArray(value.memory_entries) || !value.memory_entries.every(isValidMemoryEntry)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  if (!isValidToolProposal(value.proposed_tool_call)) {
    throw new Track1PluginContextError("track1_model_input_invalid");
  }
  return Object.freeze({
    schema_version: value.schema_version,
    campaign_id: value.campaign_id,
    agent_id: value.agent_id,
    attempt_id: value.attempt_id,
    attempt_index: value.attempt_index,
    session_id: value.session_id,
    case_id: value.case_id,
    scenario_id: value.scenario_id,
    user_prompt: value.user_prompt,
    retrieved_content: Object.freeze([...value.retrieved_content]),
    memory_entries: Object.freeze([...value.memory_entries]),
    proposed_tool_call: value.proposed_tool_call ? Object.freeze({ ...value.proposed_tool_call }) : null
  });
}

// src/plugin.ts
init_campaign_ingest2();
init_campaign_ingest();
var SessionToolRuntimeRegistry = class {
  runtimes = /* @__PURE__ */ new Map();
  register(sessionId, runtime) {
    this.runtimes.set(sessionId, runtime);
  }
  resolveToolRuntime(sessionId) {
    return this.runtimes.get(sessionId);
  }
  delete(sessionId) {
    this.runtimes.delete(sessionId);
  }
};
var Track1PluginHookError = class extends Error {
  code;
  constructor(code) {
    super(code);
    this.name = "Track1PluginHookError";
    this.code = code;
  }
};
function isPlainObject8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString7(value) {
  return typeof value === "string" && value.trim().length > 0;
}
var PERMITTED_TOOLS = /* @__PURE__ */ new Set([
  "send_email",
  "read_file",
  "write_file",
  "call_api"
]);
var BLOCK_TOOL_NOT_PERMITTED = Object.freeze({
  block: true,
  blockReason: "tool_not_permitted"
});
var BLOCK_SECURITY_UNAVAILABLE = Object.freeze({
  block: true,
  blockReason: "security_monitor_unavailable"
});
function createDefaultToolRuntime(context) {
  const state = new InMemorySimulatedToolState({});
  return {
    campaign_id: context.campaign_id,
    agent_id: context.agent_id,
    attempt_id: context.attempt_id,
    attempt_index: context.attempt_index,
    session_id: context.session_id,
    scenario_id: context.scenario_id,
    case_id: context.case_id,
    state,
    executor: new SimulatedToolExecutor(state)
  };
}
function buildSnapshotEnvelope(state, result) {
  const withoutHash = {
    schema_version: TRACK1_CAMPAIGN_SNAPSHOT_SCHEMA_VERSION,
    campaign_id: state.context.campaign_id,
    campaign_manifest_sha256: TRACK1_CAMPAIGN_MANIFEST_SHA256,
    agent_id: state.context.agent_id,
    scenario_id: state.context.scenario_id,
    case_id: state.context.case_id,
    attempt_id: state.context.attempt_id,
    attempt_index: state.context.attempt_index,
    sequence: state.snapshotSequence,
    previous_snapshot_sha256: state.previousSnapshotSha256,
    observed_at: (/* @__PURE__ */ new Date()).toISOString(),
    result
  };
  const snapshotSha256 = calculateTrack1SnapshotSha256(withoutHash);
  return { ...withoutHash, snapshot_sha256: snapshotSha256 };
}
async function ingestSessionSnapshot(state, result) {
  const envelope = buildSnapshotEnvelope(state, result);
  const ack = await state.ingest(envelope);
  state.previousSnapshotSha256 = ack.snapshot_sha256;
  state.snapshotSequence += 1;
}
function detectToolFailure(event) {
  if (isNonEmptyString7(event.error)) {
    return true;
  }
  if (event.result !== void 0 && event.result !== null) {
    const result = event.result;
    if (isPlainObject8(result)) {
      if (result.status === "failed" || result.status === "error") {
        return true;
      }
      if (result.isError === true) {
        return true;
      }
    }
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        if (isPlainObject8(parsed)) {
          if (parsed.status === "failed" || parsed.status === "error" || parsed.status === "rejected") {
            return true;
          }
          if (isPlainObject8(parsed.output) && parsed.output.status === "failed") {
            return true;
          }
        }
      } catch {
      }
    }
  }
  return false;
}
function registerTrack1Plugin(api, runtime) {
  const sessions = /* @__PURE__ */ new Map();
  const { campaignContext, toolRuntimeRegistry } = runtime;
  registerTrack1Tools(api, toolRuntimeRegistry);
  api.on("session_start", async (event, ctx) => {
    if (!isPlainObject8(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString7(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const ctxObj = isPlainObject8(ctx) ? ctx : {};
    const ctxSessionId = ctxObj.sessionId;
    const ctxAgentId = ctxObj.agentId;
    if (isNonEmptyString7(ctxSessionId) && ctxSessionId !== sessionId) {
      throw new Track1PluginHookError("track1_plugin_session_mismatch");
    }
    if (isNonEmptyString7(ctxAgentId) && ctxAgentId !== campaignContext.agent_id) {
      throw new Track1PluginHookError("track1_plugin_agent_mismatch");
    }
    if (sessionId !== campaignContext.session_id) {
      throw new Track1PluginHookError("track1_plugin_session_mismatch");
    }
    if (sessions.has(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_session_exists");
    }
    const toolRuntime = runtime.createToolRuntime ? runtime.createToolRuntime(campaignContext) : createDefaultToolRuntime(campaignContext);
    toolRuntimeRegistry.register(sessionId, toolRuntime);
    const monitorContext = {
      task_id: sessionId.replace(/^session:/, "task:"),
      session_id: campaignContext.session_id,
      model_ref: campaignContext.model_ref,
      scenario_id: campaignContext.scenario_id,
      case_id: campaignContext.case_id
    };
    const monitorPorts = {
      now: runtime.ports.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()),
      nextId: runtime.ports.nextId ?? ((kind) => `${kind}:${Date.now().toString(36)}`)
    };
    const session = new ObservedMonitoredSession(
      monitorContext,
      runtime.ports.provider,
      monitorPorts
    );
    sessions.set(sessionId, {
      session,
      context: campaignContext,
      ingest: runtime.ports.ingestSnapshot,
      snapshotSequence: 1,
      previousSnapshotSha256: null,
      ended: false,
      pendingToolCallId: null
    });
  });
  api.on("llm_input", async (event, _ctx) => {
    if (!isPlainObject8(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString7(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    const rawEnvelope = event.envelope;
    let content;
    let contentRef;
    if (isPlainObject8(rawEnvelope)) {
      const envelope = normalizeTrack1ModelInputEnvelope(rawEnvelope);
      if (envelope.campaign_id !== state.context.campaign_id || envelope.agent_id !== state.context.agent_id || envelope.attempt_id !== state.context.attempt_id || envelope.session_id !== state.context.session_id || envelope.scenario_id !== state.context.scenario_id || envelope.case_id !== state.context.case_id || envelope.attempt_index !== state.context.attempt_index) {
        throw new Track1PluginHookError("track1_plugin_envelope_mismatch");
      }
      content = envelope.user_prompt;
      contentRef = `model://track1/input/${state.snapshotSequence}`;
      state.session.observeModelInput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
      });
      for (const entry of envelope.memory_entries) {
        state.session.observeMemoryWrite({
          session_id: state.context.session_id,
          memory_entry_id: entry.memory_entry_id,
          content: entry.content_ref,
          content_ref: entry.content_ref
        });
      }
      for (const entry of envelope.retrieved_content) {
        state.session.observeMemoryRead({
          session_id: state.context.session_id,
          memory_entry_id: entry.memory_entry_id,
          content: entry.content_ref,
          content_ref: entry.content_ref
        });
      }
    } else {
      const prompt = event.prompt;
      if (!isNonEmptyString7(prompt)) {
        throw new Track1PluginHookError("track1_plugin_event_invalid");
      }
      content = prompt;
      contentRef = `model://track1/input/${state.snapshotSequence}`;
      state.session.observeModelInput({
        session_id: state.context.session_id,
        content,
        content_ref: contentRef
      });
    }
  });
  api.on("llm_output", async (event, _ctx) => {
    if (!isPlainObject8(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString7(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    let content;
    const assistantTexts = event.assistantTexts;
    if (Array.isArray(assistantTexts) && assistantTexts.length > 0) {
      content = assistantTexts.filter((t) => typeof t === "string").join("\n");
    } else if (isNonEmptyString7(event.content)) {
      content = event.content;
    } else {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    if (!isNonEmptyString7(content)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const contentRef = isNonEmptyString7(event.contentRef) ? event.contentRef : `model://track1/output/${state.snapshotSequence}`;
    await state.session.observeModelOutput({
      session_id: state.context.session_id,
      content,
      content_ref: contentRef
    });
  });
  api.on(
    "before_tool_call",
    async (event, ctx) => {
      if (!isPlainObject8(event)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }
      const toolName = event.toolName;
      const params = event.params;
      const toolCallId = event.toolCallId;
      const ctxObj = isPlainObject8(ctx) ? ctx : {};
      const sessionId = (isNonEmptyString7(ctxObj.sessionId) ? ctxObj.sessionId : void 0) ?? (isNonEmptyString7(event.sessionId) ? event.sessionId : void 0);
      if (!isNonEmptyString7(sessionId) || !isNonEmptyString7(toolName) || !isNonEmptyString7(toolCallId)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }
      const state = sessions.get(sessionId);
      if (!state || state.ended) {
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }
      if (!PERMITTED_TOOLS.has(toolName)) {
        return { ...BLOCK_TOOL_NOT_PERMITTED };
      }
      const request = {
        call_id: toolCallId,
        session_id: state.context.session_id,
        scenario_id: state.context.scenario_id,
        case_id: state.context.case_id,
        tool_name: toolName,
        arguments: params
      };
      let outcome;
      try {
        outcome = await state.session.beforeTool(request);
      } catch {
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }
      if (outcome.disposition === "intercept") {
        try {
          await ingestSessionSnapshot(state, outcome.snapshot);
        } catch {
        }
        const reason = outcome.decision.action === "deny" ? "policy_denied" : "policy_ask_required";
        return Object.freeze({ block: true, blockReason: reason });
      }
      try {
        await ingestSessionSnapshot(state, outcome.snapshot);
      } catch {
        state.ended = true;
        return { ...BLOCK_SECURITY_UNAVAILABLE };
      }
      state.pendingToolCallId = toolCallId;
      return {};
    },
    { priority: 100, timeoutMs: 1e4 }
  );
  api.on("after_tool_call", async (event, ctx) => {
    if (!isPlainObject8(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const toolName = event.toolName;
    const toolCallId = event.toolCallId;
    const ctxObj = isPlainObject8(ctx) ? ctx : {};
    const sessionId = (isNonEmptyString7(ctxObj.sessionId) ? ctxObj.sessionId : void 0) ?? (isNonEmptyString7(event.sessionId) ? event.sessionId : void 0);
    if (!isNonEmptyString7(sessionId) || !isNonEmptyString7(toolName) || !isNonEmptyString7(toolCallId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    const failed = detectToolFailure({
      error: event.error,
      result: event.result
    });
    const status = failed ? "failed" : "success";
    const observedResult = {
      session_id: state.context.session_id,
      call_id: toolCallId,
      tool_name: toolName,
      status,
      result_ref: `simulated-result://${toolCallId}/${status}`,
      state_change: "simulated"
    };
    try {
      const afterSnapshot = state.session.afterTool(observedResult);
      await ingestSessionSnapshot(state, afterSnapshot);
    } catch {
      state.ended = true;
      throw new Track1PluginHookError("security_monitor_unavailable");
    }
    state.pendingToolCallId = null;
  });
  api.on("session_end", async (event, _ctx) => {
    if (!isPlainObject8(event)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const sessionId = event.sessionId;
    if (!isNonEmptyString7(sessionId)) {
      throw new Track1PluginHookError("track1_plugin_event_invalid");
    }
    const state = sessions.get(sessionId);
    if (!state || state.ended) {
      throw new Track1PluginHookError("track1_plugin_session_not_found");
    }
    const hasPendingTool = state.pendingToolCallId !== null;
    try {
      if (hasPendingTool) {
        try {
          const finalResult = state.session.finalize();
          await ingestSessionSnapshot(state, finalResult);
        } catch {
          const snapshot = state.session.snapshot();
          await ingestSessionSnapshot(state, snapshot);
        }
      } else {
        const finalResult = state.session.finalize();
        await ingestSessionSnapshot(state, finalResult);
      }
    } catch {
      try {
        const snapshot = state.session.snapshot();
        await ingestSessionSnapshot(state, snapshot);
      } catch {
      }
    }
    state.ended = true;
    sessions.delete(sessionId);
    toolRuntimeRegistry.delete(sessionId);
  });
}
function createTrack1PluginEntry() {
  return definePluginEntry({
    id: "agent-security-track1",
    name: "Agent Security Track 1",
    description: "Track 1 campaign supervision plugin: observes model I/O, mediates tool calls, and ingests campaign snapshots via the OpenClaw plugin SDK.",
    register(api) {
      const realApi = api;
      const config = realApi.pluginConfig ?? {};
      const ingestEndpoint = String(config.ingestEndpoint ?? "http://backend:3001/internal/track1/campaigns");
      const ingestToken = String(config.ingestToken ?? "");
      const contextInput = {
        campaign_id: String(config.campaignId ?? ""),
        attempt_id: String(config.attemptId ?? ""),
        attempt_index: Number(config.attemptIndex ?? 1),
        agent_id: String(config.agentId ?? ""),
        session_id: String(config.sessionId ?? ""),
        scenario_id: String(config.scenarioId ?? ""),
        case_id: String(config.caseId ?? ""),
        model_ref: String(config.modelRef ?? "track1:openclaw:demo")
      };
      const campaignContext = normalizeTrack1PluginContext(contextInput);
      const toolRuntimeRegistry = new SessionToolRuntimeRegistry();
      const ports = {
        provider: {
          decide() {
            return {
              policy_id: "policy://track1/default",
              action: "allow",
              reason_code: "default_allow",
              reason: "Track 1 default allow",
              evidence_refs: []
            };
          }
        },
        async ingestSnapshot(envelope) {
          const { Track1IngestClient: Track1IngestClient2 } = await Promise.resolve().then(() => (init_ingest_client(), ingest_client_exports));
          const client = new Track1IngestClient2(
            { ingestEndpoint, ingestToken },
            void 0
          );
          return client.appendSnapshot(envelope);
        }
      };
      registerTrack1Plugin(realApi, {
        ports,
        campaignContext,
        toolRuntimeRegistry
      });
    }
  });
}
var plugin_default = createTrack1PluginEntry();

// src/index.ts
init_ingest_client();

// src/runtime-probe.ts
import { execFileSync } from "node:child_process";
init_campaign_ingest();
var TRACK1_PLUGIN_PROBE_RESULT_KEYS = Object.freeze([
  "schema_version",
  "plugin_id",
  "runtime_version",
  "tool_names",
  "hook_names",
  "before_tool_blocked",
  "after_tool_observed",
  "correlation_ready",
  "diagnostics"
]);
var TRACK1_PLUGIN_PROBE_COMMAND = "openclaw plugins inspect agent-security-track1 --runtime --json";
var TRACK1_PLUGIN_PROBE_RUNTIME_VERSION = "2026.6.10";
function execOpenclawPluginsInspect() {
  const stdout = execFileSync(
    "openclaw",
    ["plugins", "inspect", "agent-security-track1", "--runtime", "--json"],
    {
      encoding: "utf8",
      timeout: 3e4
    }
  );
  const parsed = JSON.parse(stdout);
  return {
    id: String(parsed.id ?? ""),
    name: String(parsed.name ?? ""),
    runtime_version: String(parsed.runtime_version ?? ""),
    tools: Array.isArray(parsed.tools) ? parsed.tools : [],
    hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
    diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : []
  };
}
var Track1PluginProbeError = class extends Error {
  code;
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "Track1PluginProbeError";
    this.code = code;
  }
};
function makeProbeRecordingApi() {
  const tools = [];
  const hooks = [];
  return {
    tools,
    hooks,
    registerTool(tool) {
      tools.push(tool);
    },
    on(name, handler, options) {
      hooks.push({ name, handler, options });
    }
  };
}
var PROBE_CONTEXT_INPUT = Object.freeze({
  campaign_id: "campaign:track1:probe-001",
  attempt_id: "attempt:track1:probe-001",
  attempt_index: 1,
  agent_id: "agent:track1:prompt-injection",
  session_id: "session:track1:probe-001",
  scenario_id: "T1-SC-001",
  case_id: "T1-SC-001-C001",
  model_ref: TRACK1_MODEL_REF_CANONICAL
});
var PROBE_CONTEXT = normalizeTrack1PluginContext(PROBE_CONTEXT_INPUT);
var EXPECTED_TOOLS = Object.freeze([
  "call_api",
  "read_file",
  "send_email",
  "write_file"
]);
var EXPECTED_HOOKS = Object.freeze([
  "after_tool_call",
  "before_tool_call",
  "llm_input",
  "llm_output",
  "session_end",
  "session_start"
]);
function isBlocked(result) {
  if (typeof result !== "object" || result === null) return false;
  const obj = result;
  return obj.block === true && typeof obj.blockReason === "string";
}
function deepEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
function applyDynamicMutation(api, mutation, ingestWrapper) {
  if (!mutation) return;
  switch (mutation) {
    case "block-failed": {
      const hook = api.hooks.find((h) => h.name === "before_tool_call");
      if (hook) {
        hook.handler = async () => ({});
      }
      break;
    }
    case "after-not-observed": {
      const hook = api.hooks.find((h) => h.name === "after_tool_call");
      if (hook) {
        hook.handler = async () => void 0;
      }
      break;
    }
    case "correlation-missing": {
      const originalIngest = ingestWrapper.ingest;
      ingestWrapper.ingest = async (envelope) => {
        const defective = {
          ...envelope,
          campaign_id: ""
        };
        ingestWrapper.snapshots.push(defective);
        return originalIngest(envelope);
      };
      break;
    }
  }
}
async function runTrack1PluginCapabilityProbe(input) {
  const { inspect, ports, mutation } = input;
  const toolNames = [...inspect.tools.map((t) => t.name)].sort();
  const hookNames = [...inspect.hooks].sort();
  if (new Set(toolNames).size !== toolNames.length) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "duplicate tool detected"
    );
  }
  if (!deepEqual(toolNames, [...EXPECTED_TOOLS])) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "tool set mismatch"
    );
  }
  if (!deepEqual(hookNames, [...EXPECTED_HOOKS])) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "hook set mismatch"
    );
  }
  if (inspect.runtime_version !== TRACK1_PLUGIN_PROBE_RUNTIME_VERSION) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "runtime version mismatch"
    );
  }
  if (inspect.diagnostics.length > 0) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "diagnostics present"
    );
  }
  for (const tool of inspect.tools) {
    if (!tool.label || tool.label.length === 0) {
      throw new Track1PluginProbeError(
        "track1_plugin_probe_failed",
        `tool ${tool.name} missing label`
      );
    }
  }
  const api = makeProbeRecordingApi();
  const snapshots = [];
  const ingestWrapper = {
    snapshots,
    async ingest(envelope) {
      snapshots.push(envelope);
      return ports.ingestSnapshot(envelope);
    }
  };
  const wrappedPorts = {
    ...ports,
    async ingestSnapshot(envelope) {
      return ingestWrapper.ingest(envelope);
    }
  };
  const toolRuntimeRegistry = new SessionToolRuntimeRegistry();
  registerTrack1Plugin(api, {
    ports: wrappedPorts,
    campaignContext: PROBE_CONTEXT,
    toolRuntimeRegistry
  });
  applyDynamicMutation(api, mutation, ingestWrapper);
  const sessionId = PROBE_CONTEXT.session_id;
  const ctx = { agentId: PROBE_CONTEXT.agent_id, sessionId };
  const getHook = (name) => {
    const hook = api.hooks.find((h) => h.name === name);
    if (!hook) {
      throw new Track1PluginProbeError(
        "track1_plugin_probe_failed",
        `hook ${name} not found`
      );
    }
    return hook.handler;
  };
  await getHook("session_start")({ sessionId }, ctx);
  await getHook("llm_input")(
    {
      sessionId,
      envelope: {
        schema_version: "track1-openclaw-input.v1",
        campaign_id: PROBE_CONTEXT.campaign_id,
        agent_id: PROBE_CONTEXT.agent_id,
        attempt_id: PROBE_CONTEXT.attempt_id,
        attempt_index: PROBE_CONTEXT.attempt_index,
        session_id: PROBE_CONTEXT.session_id,
        case_id: PROBE_CONTEXT.case_id,
        scenario_id: PROBE_CONTEXT.scenario_id,
        user_prompt: "Probe: what is the portal status?",
        retrieved_content: [],
        memory_entries: [],
        proposed_tool_call: null
      }
    },
    ctx
  );
  await getHook("llm_output")(
    {
      sessionId,
      content: "The portal is operating normally.",
      contentRef: "model://track1/probe/output/001"
    },
    ctx
  );
  const unknownResult = await getHook("before_tool_call")(
    {
      sessionId,
      toolCallId: "call:probe:unknown",
      toolName: "unknown_tool",
      params: {}
    },
    ctx
  );
  const beforeToolBlocked = isBlocked(unknownResult);
  if (!beforeToolBlocked) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "before_tool did not block unknown tool"
    );
  }
  const allowResult = await getHook("before_tool_call")(
    {
      sessionId,
      toolCallId: "call:probe:write",
      toolName: "write_file",
      params: {
        path: "sandbox://probe/test.txt",
        content: "probe"
      }
    },
    ctx
  );
  const allowBlocked = isBlocked(allowResult);
  const snapshotsBeforeAfter = snapshots.length;
  if (!allowBlocked) {
    try {
      await getHook("after_tool_call")(
        {
          sessionId,
          toolCallId: "call:probe:write",
          toolName: "write_file",
          result: { status: "success" }
        },
        ctx
      );
    } catch {
    }
  }
  const afterToolObserved = snapshots.length > snapshotsBeforeAfter;
  if (!afterToolObserved) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "after_tool did not observe"
    );
  }
  try {
    await getHook("session_end")({ sessionId }, ctx);
  } catch {
  }
  const correlationReady = snapshots.length > 0 && snapshots.every(
    (s) => typeof s.campaign_id === "string" && s.campaign_id.length > 0 && typeof s.attempt_id === "string" && s.attempt_id.length > 0 && typeof s.snapshot_sha256 === "string" && s.snapshot_sha256.length > 0
  );
  if (!correlationReady) {
    throw new Track1PluginProbeError(
      "track1_plugin_probe_failed",
      "correlation missing in snapshots"
    );
  }
  return {
    schema_version: "track1-openclaw-probe.v1",
    plugin_id: "agent-security-track1",
    runtime_version: TRACK1_PLUGIN_PROBE_RUNTIME_VERSION,
    tool_names: EXPECTED_TOOLS,
    hook_names: EXPECTED_HOOKS,
    before_tool_blocked: true,
    after_tool_observed: true,
    correlation_ready: true,
    diagnostics: []
  };
}
export {
  SessionToolRuntimeRegistry,
  TRACK1_PLUGIN_PROBE_COMMAND,
  TRACK1_PLUGIN_PROBE_RESULT_KEYS,
  TRACK1_PLUGIN_PROBE_RUNTIME_VERSION,
  Track1IngestClient,
  Track1IngestError,
  Track1PluginContextError,
  createTrack1PluginEntry,
  execOpenclawPluginsInspect,
  normalizeTrack1ModelInputEnvelope,
  normalizeTrack1PluginContext,
  registerTrack1Plugin,
  registerTrack1Tools,
  runTrack1PluginCapabilityProbe
};
