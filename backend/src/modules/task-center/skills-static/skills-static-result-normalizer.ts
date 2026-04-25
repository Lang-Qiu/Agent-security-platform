import type { SkillsStaticResultDetails } from "../../../../../shared/types/result.ts";
import { SKILLS_STATIC_SEVERITIES } from "../../../../../shared/types/skills-static.ts";
import type { SkillsStaticRuleHit, SkillsStaticTraceStep } from "../../../../../shared/types/skills-static-rule-hit.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import { isNumber, isOneOf, isPlainObject, isString, isStringArray } from "../../../../../shared/utils/guards.ts";
import { DomainError } from "../../../common/errors/domain-error.ts";
import {
  SKILLS_STATIC_ENGINE_PRIVATE_FIELD_PREFIX,
  type SkillsStaticEngineOutput
} from "./skills-static-engine-output.ts";

function createInvalidEngineOutputError(message: string): DomainError {
  return new DomainError(message, "SKILLS_STATIC_INVALID_ENGINE_OUTPUT", 500);
}

function hasEnginePrivatePrefix(key: string): boolean {
  return key.startsWith(SKILLS_STATIC_ENGINE_PRIVATE_FIELD_PREFIX);
}

function isForbiddenEngineField(key: string): boolean {
  return key === "risk_score" || hasEnginePrivatePrefix(key);
}

function normalizeTraceStep(value: unknown): SkillsStaticTraceStep {
  if (!isPlainObject(value)) {
    throw createInvalidEngineOutputError("Skills-static engine output contains an invalid trace step");
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
    normalizedTraceStep.metadata = { ...value.metadata };
  }

  return normalizedTraceStep;
}

function normalizeRuleHit(value: unknown): SkillsStaticRuleHit {
  if (!isPlainObject(value)) {
    throw createInvalidEngineOutputError("Skills-static engine output contains an invalid rule hit");
  }

  if (!isString(value.rule_id)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required rule_id");
  }

  if (!isOneOf(SKILLS_STATIC_SEVERITIES, value.severity)) {
    throw createInvalidEngineOutputError("Skills-static engine output contains an invalid rule-hit severity");
  }

  if (!isString(value.message)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required rule-hit message");
  }

  if (!isString(value.file_path)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required rule-hit file_path");
  }

  const hasLineStart = value.line_start !== undefined;
  const hasLineEnd = value.line_end !== undefined;

  if (hasLineStart !== hasLineEnd) {
    throw createInvalidEngineOutputError("Skills-static engine output contains an incomplete rule-hit line region");
  }

  if (hasLineStart) {
    if (!isNumber(value.line_start) || !isNumber(value.line_end) || value.line_start > value.line_end) {
      throw createInvalidEngineOutputError("Skills-static engine output contains an invalid rule-hit line region");
    }
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
    normalizedRuleHit.trace = value.trace.map((traceStep) => normalizeTraceStep(traceStep));
  }

  if (isStringArray(value.tags)) {
    normalizedRuleHit.tags = [...value.tags];
  }

  if (isPlainObject(value.metadata)) {
    normalizedRuleHit.metadata = { ...value.metadata };
  }

  return normalizedRuleHit;
}

export function normalizeSkillsStaticEngineOutput(
  output: SkillsStaticEngineOutput,
  task: Task
): SkillsStaticResultDetails {
  if (!isPlainObject(output)) {
    throw createInvalidEngineOutputError("Skills-static engine output must be a plain object");
  }

  if (!isString(output.language)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required language");
  }

  if (!isStringArray(output.entry_files)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required entry_files list");
  }

  if (!isNumber(output.files_scanned)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required files_scanned count");
  }

  if (!Array.isArray(output.rule_hits)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required rule_hits list");
  }

  if (!isStringArray(output.sensitive_capabilities)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required sensitive_capabilities list");
  }

  if (!isPlainObject(output.dependency_summary)) {
    throw createInvalidEngineOutputError("Skills-static engine output is missing a required dependency_summary object");
  }

  const normalizedRuleHits = output.rule_hits.map((ruleHit) => normalizeRuleHit(ruleHit));
  const sampleName =
    isString(output.sample_name) ? output.sample_name : task.target.display_name ?? task.target.target_value;

  return {
    sample_name: sampleName,
    language: output.language,
    entry_files: [...output.entry_files],
    files_scanned: output.files_scanned,
    rule_hits: normalizedRuleHits.map((ruleHit) => {
      const sanitizedRuleHit = Object.fromEntries(
        Object.entries(ruleHit).filter(([key]) => !isForbiddenEngineField(key))
      );

      return sanitizedRuleHit as SkillsStaticRuleHit;
    }),
    sensitive_capabilities: [...output.sensitive_capabilities],
    dependency_summary: Object.fromEntries(
      Object.entries(output.dependency_summary).filter(([key]) => !isForbiddenEngineField(key))
    )
  };
}
