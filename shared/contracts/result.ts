import { TASK_TYPE_TO_ENGINE_TYPE } from "../constants/task-type.ts";
import type { BaseResult, ResultDetails, StaticAnalysisResultDetails } from "../types/result.ts";
import { isPlainObject, isString } from "../utils/guards.ts";
import { normalizeResultDetails } from "../utils/normalizers.ts";
import { isRiskLevel, isTaskStatus, isTaskType } from "./task.ts";

function satisfiesFinishedStaticAnalysisContract(details: StaticAnalysisResultDetails): boolean {
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

export function normalizeBaseResult(value: unknown): BaseResult<ResultDetails> | null {
  if (
    !isPlainObject(value) ||
    !isString(value.task_id) ||
    !isString(value.task_type) ||
    !isString(value.engine_type) ||
    !isString(value.status) ||
    !isString(value.risk_level) ||
    !isString(value.summary) ||
    !isString(value.created_at) ||
    !isString(value.updated_at)
  ) {
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

  if (
    value.task_type === "static_analysis" &&
    value.status === "finished" &&
    !satisfiesFinishedStaticAnalysisContract(normalizedDetails as StaticAnalysisResultDetails)
  ) {
    return null;
  }

  const normalizedResult: BaseResult<ResultDetails> = {
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

  if (isPlainObject(value.metadata)) {
    normalizedResult.metadata = { ...value.metadata };
  }

  return normalizedResult;
}
