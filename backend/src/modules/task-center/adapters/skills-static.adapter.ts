import { SKILLS_STATIC_SEVERITIES } from "../../../../../shared/types/skills-static.ts";
import type { SkillsStaticAnalysisParameters, SkillsStaticResultDetails, SkillsStaticRuleHit, SkillsStaticTarget } from "../../../../../shared/types/skills-static.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import { isNumber, isOneOf, isPlainObject, isString, isStringArray } from "../../../../../shared/utils/guards.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export interface SkillsStaticEngineDispatchRequest {
  target: SkillsStaticTarget;
  analysis_parameters?: SkillsStaticAnalysisParameters;
}

export interface SkillsStaticEngineResult {
  sample_name?: string;
  language?: string;
  entry_files?: string[];
  files_scanned?: number;
  rule_hits?: SkillsStaticRuleHit[];
  sensitive_capabilities?: string[];
  dependency_summary?: Record<string, unknown>;
  risk_level?: "info" | "low" | "medium" | "high" | "critical";
}

export interface SkillsStaticMockResult {
  sample_name: string;
  language: string;
  entry_files: string[];
  files_scanned: number;
  rule_hits: SkillsStaticRuleHit[];
  sensitive_capabilities: string[];
  dependency_summary: Record<string, unknown>;
}

interface SkillsStaticTraceStepInput {
  step?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  metadata?: Record<string, unknown>;
}

function normalizeTraceStep(value: unknown): SkillsStaticTraceStepInput | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalizedTraceStep: SkillsStaticTraceStepInput = {};

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
    normalizedTraceStep.metadata = { ...value.metadata };
  }

  return normalizedTraceStep;
}

function normalizeRuleHit(value: unknown): SkillsStaticRuleHit | null {
  if (!isPlainObject(value) || !isString(value.rule_id) || !isOneOf(SKILLS_STATIC_SEVERITIES, value.severity)) {
    return null;
  }

  const normalizedRuleHit: SkillsStaticRuleHit = {
    rule_id: value.rule_id,
    severity: value.severity
  };

  if (isString(value.title)) {
    normalizedRuleHit.title = value.title;
  }

  if (isString(value.category)) {
    normalizedRuleHit.category = value.category;
  }

  if (isString(value.message)) {
    normalizedRuleHit.message = value.message;
  }

  if (isString(value.file_path)) {
    normalizedRuleHit.file_path = value.file_path;
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
    normalizedRuleHit.evidence = { ...value.evidence };
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
      .map((traceStep) => normalizeTraceStep(traceStep))
      .filter((traceStep): traceStep is SkillsStaticTraceStepInput => traceStep !== null);

    if (normalizedTrace.length > 0) {
      normalizedRuleHit.trace = normalizedTrace;
    }
  }

  if (isStringArray(value.tags)) {
    normalizedRuleHit.tags = [...value.tags];
  }

  if (isPlainObject(value.metadata)) {
    normalizedRuleHit.metadata = { ...value.metadata };
  }

  return normalizedRuleHit;
}

export function normalizeSkillsStaticMockResult(value: unknown): SkillsStaticMockResult | null {
  if (
    !isPlainObject(value) ||
    !isString(value.sample_name) ||
    !isString(value.language) ||
    !isStringArray(value.entry_files) ||
    !isNumber(value.files_scanned) ||
    !Array.isArray(value.rule_hits) ||
    !isStringArray(value.sensitive_capabilities) ||
    !isPlainObject(value.dependency_summary)
  ) {
    return null;
  }

  const normalizedRuleHits = value.rule_hits
    .map((ruleHit) => normalizeRuleHit(ruleHit))
    .filter((ruleHit): ruleHit is SkillsStaticRuleHit => ruleHit !== null);

  if (normalizedRuleHits.length !== value.rule_hits.length) {
    return null;
  }

  return {
    sample_name: value.sample_name,
    language: value.language,
    entry_files: [...value.entry_files],
    files_scanned: value.files_scanned,
    rule_hits: normalizedRuleHits,
    sensitive_capabilities: [...value.sensitive_capabilities],
    dependency_summary: { ...value.dependency_summary }
  };
}

export function mapSkillsStaticEngineResultToDetails(engineResult: unknown, task: Task): SkillsStaticResultDetails {
  const details: SkillsStaticResultDetails = {
    sample_name: task.target.display_name ?? task.target.target_value,
    rule_hits: []
  };

  if (!isPlainObject(engineResult)) {
    return details;
  }

  if (isString(engineResult.sample_name)) {
    details.sample_name = engineResult.sample_name;
  }

  if (isString(engineResult.language)) {
    details.language = engineResult.language;
  }

  if (isStringArray(engineResult.entry_files)) {
    details.entry_files = [...engineResult.entry_files];
  }

  if (isNumber(engineResult.files_scanned)) {
    details.files_scanned = engineResult.files_scanned;
  }

  if (Array.isArray(engineResult.rule_hits)) {
    details.rule_hits = engineResult.rule_hits
      .map((ruleHit) => normalizeRuleHit(ruleHit))
      .filter((ruleHit): ruleHit is SkillsStaticRuleHit => ruleHit !== null);
  }

  if (isStringArray(engineResult.sensitive_capabilities)) {
    details.sensitive_capabilities = [...engineResult.sensitive_capabilities];
  }

  if (isPlainObject(engineResult.dependency_summary)) {
    details.dependency_summary = { ...engineResult.dependency_summary };
  }

  return details;
}

export class SkillsStaticTaskAdapter implements TaskEngineAdapter<"static_analysis"> {
  taskType: "static_analysis";
  engineType: "skills_static";

  constructor() {
    this.taskType = "static_analysis";
    this.engineType = "skills_static";
  }

  createDispatchPayload(task: Task): SkillsStaticEngineDispatchRequest {
    return {
      target: task.target,
      analysis_parameters: task.parameters ? ({ ...task.parameters } as SkillsStaticAnalysisParameters) : undefined
    };
  }

  createInitialDetails(task: Task): SkillsStaticResultDetails {
    return mapSkillsStaticEngineResultToDetails({}, task);
  }
}
