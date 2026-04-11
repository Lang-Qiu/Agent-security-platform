import type { AssetScanResultDetails, SandboxRunResultDetails, StaticAnalysisResultDetails } from "../types/result.ts";
import type { SkillsStaticRuleHit, SkillsStaticTraceStep } from "../types/skills-static-rule-hit.ts";
import { SKILLS_STATIC_SEVERITIES } from "../types/skills-static.ts";
import type { RiskSummary, Task, TaskResultRef, TaskTarget, TaskType } from "../types/task.ts";
import { isBoolean, isNumber, isOneOf, isPlainObject, isString, isStringArray } from "./guards.ts";

function copyPlainObject(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function copyArray(value: unknown[]): unknown[] {
  return value.map((item) => {
    if (Array.isArray(item)) {
      return copyArray(item);
    }

    if (isPlainObject(item)) {
      return copyPlainObject(item);
    }

    return item;
  });
}

function copyUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return copyArray(value);
  }

  if (isPlainObject(value)) {
    return copyPlainObject(value);
  }

  return value;
}

export function normalizeTaskTarget(value: unknown): TaskTarget | null {
  if (!isPlainObject(value) || !isString(value.target_type) || !isString(value.target_value)) {
    return null;
  }

  const normalizedTarget: TaskTarget = {
    target_type: value.target_type,
    target_value: value.target_value
  };

  if (isString(value.display_name)) {
    normalizedTarget.display_name = value.display_name;
  }

  if (isString(value.location)) {
    normalizedTarget.location = value.location;
  }

  if (isPlainObject(value.metadata)) {
    normalizedTarget.metadata = copyPlainObject(value.metadata);
  }

  return normalizedTarget;
}

function normalizeTaskResultRef(value: unknown): TaskResultRef | null {
  if (!isPlainObject(value) || !isString(value.result_type) || !isString(value.result_id)) {
    return null;
  }

  return {
    result_type: value.result_type,
    result_id: value.result_id
  };
}

export function normalizeTask(value: unknown): Task | null {
  if (
    !isPlainObject(value) ||
    !isString(value.task_id) ||
    !isString(value.task_type) ||
    !isString(value.engine_type) ||
    !isString(value.status) ||
    !isString(value.title) ||
    !isString(value.created_at) ||
    !isString(value.updated_at)
  ) {
    return null;
  }

  const normalizedTarget = normalizeTaskTarget(value.target);

  if (!normalizedTarget) {
    return null;
  }

  const normalizedTask: Task = {
    task_id: value.task_id,
    task_type: value.task_type,
    engine_type: value.engine_type,
    status: value.status,
    title: value.title,
    target: normalizedTarget,
    created_at: value.created_at,
    updated_at: value.updated_at
  };

  if (isString(value.requested_by)) {
    normalizedTask.requested_by = value.requested_by;
  }

  if (isPlainObject(value.parameters)) {
    normalizedTask.parameters = copyPlainObject(value.parameters);
  }

  if (isString(value.risk_level)) {
    normalizedTask.risk_level = value.risk_level;
  }

  if (isString(value.summary)) {
    normalizedTask.summary = value.summary;
  }

  const normalizedResultRef = normalizeTaskResultRef(value.result_ref);

  if (normalizedResultRef) {
    normalizedTask.result_ref = normalizedResultRef;
  }

  if (isString(value.error_message)) {
    normalizedTask.error_message = value.error_message;
  }

  if (isString(value.started_at)) {
    normalizedTask.started_at = value.started_at;
  }

  if (isString(value.finished_at)) {
    normalizedTask.finished_at = value.finished_at;
  }

  if (isPlainObject(value.metadata)) {
    normalizedTask.metadata = copyPlainObject(value.metadata);
  }

  return normalizedTask;
}

export function normalizeRiskSummary(value: unknown): RiskSummary | null {
  if (
    !isPlainObject(value) ||
    !isString(value.task_id) ||
    !isString(value.task_type) ||
    !isString(value.status) ||
    !isString(value.risk_level) ||
    !isString(value.summary) ||
    !isNumber(value.total_findings) ||
    !isNumber(value.info_count) ||
    !isNumber(value.low_count) ||
    !isNumber(value.medium_count) ||
    !isNumber(value.high_count) ||
    !isNumber(value.critical_count) ||
    !isString(value.updated_at)
  ) {
    return null;
  }

  const normalizedSummary: RiskSummary = {
    task_id: value.task_id,
    task_type: value.task_type,
    status: value.status,
    risk_level: value.risk_level,
    summary: value.summary,
    total_findings: value.total_findings,
    info_count: value.info_count,
    low_count: value.low_count,
    medium_count: value.medium_count,
    high_count: value.high_count,
    critical_count: value.critical_count,
    updated_at: value.updated_at
  };

  if (isNumber(value.blocked_count)) {
    normalizedSummary.blocked_count = value.blocked_count;
  }

  if (isStringArray(value.top_risks)) {
    normalizedSummary.top_risks = [...value.top_risks];
  }

  return normalizedSummary;
}

function normalizeAssetScanDetails(value: unknown): AssetScanResultDetails | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedDetails: AssetScanResultDetails = {};

  const normalizedTarget = normalizeTaskTarget(value.target);
  if (normalizedTarget) {
    normalizedDetails.target = normalizedTarget;
  }

  if (isPlainObject(value.fingerprint)) {
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

  return normalizedDetails;
}

function normalizeSkillsStaticTraceStep(value: unknown): SkillsStaticTraceStep | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedTraceStep: SkillsStaticTraceStep = {};

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

  if (isPlainObject(value.metadata)) {
    normalizedTraceStep.metadata = copyPlainObject(value.metadata);
  }

  return normalizedTraceStep;
}

function normalizeSkillsStaticRuleHit(value: unknown): SkillsStaticRuleHit | null {
  if (
    !isPlainObject(value) ||
    !isString(value.rule_id) ||
    !isOneOf(SKILLS_STATIC_SEVERITIES, value.severity) ||
    !isString(value.message) ||
    !isString(value.file_path)
  ) {
    return null;
  }

  const normalizedRuleHit: SkillsStaticRuleHit = {
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

  if (isPlainObject(value.evidence)) {
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
    const normalizedTrace = value.trace
      .map((traceStep) => normalizeSkillsStaticTraceStep(traceStep))
      .filter((traceStep): traceStep is SkillsStaticTraceStep => traceStep !== null);

    if (normalizedTrace.length > 0) {
      normalizedRuleHit.trace = normalizedTrace;
    }
  }

  if (isStringArray(value.tags)) {
    normalizedRuleHit.tags = [...value.tags];
  }

  if (isPlainObject(value.metadata)) {
    normalizedRuleHit.metadata = copyPlainObject(value.metadata);
  }

  return normalizedRuleHit;
}

function normalizeStaticAnalysisDetails(value: unknown): StaticAnalysisResultDetails | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedDetails: StaticAnalysisResultDetails = {};

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

  if (isPlainObject(value.dependency_summary)) {
    normalizedDetails.dependency_summary = copyPlainObject(value.dependency_summary);
  }

  return normalizedDetails;
}

function normalizeSandboxRunDetails(value: unknown): SandboxRunResultDetails | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedDetails: SandboxRunResultDetails = {};

  if (isString(value.session_id)) {
    normalizedDetails.session_id = value.session_id;
  }

  const normalizedTarget = normalizeTaskTarget(value.target);
  if (normalizedTarget) {
    normalizedDetails.target = normalizedTarget;
  }

  if (Array.isArray(value.alerts)) {
    normalizedDetails.alerts = copyArray(value.alerts);
  }

  if (isBoolean(value.blocked)) {
    normalizedDetails.blocked = value.blocked;
  }

  if (isNumber(value.event_count)) {
    normalizedDetails.event_count = value.event_count;
  }

  return normalizedDetails;
}

export function normalizeResultDetails(taskType: TaskType, value: unknown) {
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
