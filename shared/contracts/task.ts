import { ENGINE_TYPES } from "../constants/engine-type.ts";
import { RISK_LEVELS } from "../constants/risk-level.ts";
import { TASK_STATUSES } from "../constants/task-status.ts";
import { TASK_TYPE_TO_ENGINE_TYPE, TASK_TYPES } from "../constants/task-type.ts";
import type { EngineType, RiskLevel, RiskSummary, Task, TaskStatus, TaskType } from "../types/task.ts";
import { isOneOf } from "../utils/guards.ts";
import { normalizeRiskSummary as baseNormalizeRiskSummary, normalizeTask as baseNormalizeTask } from "../utils/normalizers.ts";

export function isTaskType(value: unknown): value is TaskType {
  return isOneOf(TASK_TYPES, value);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return isOneOf(TASK_STATUSES, value);
}

export function isEngineType(value: unknown): value is EngineType {
  return isOneOf(ENGINE_TYPES, value);
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return isOneOf(RISK_LEVELS, value);
}

export function normalizeTask(value: unknown): Task | null {
  const normalizedTask = baseNormalizeTask(value);

  if (
    !normalizedTask ||
    !isTaskType(normalizedTask.task_type) ||
    !isEngineType(normalizedTask.engine_type) ||
    !isTaskStatus(normalizedTask.status)
  ) {
    return null;
  }

  if (normalizedTask.engine_type !== TASK_TYPE_TO_ENGINE_TYPE[normalizedTask.task_type]) {
    return null;
  }

  if (normalizedTask.risk_level && !isRiskLevel(normalizedTask.risk_level)) {
    return null;
  }

  return normalizedTask;
}

export function normalizeRiskSummary(value: unknown): RiskSummary | null {
  const normalizedSummary = baseNormalizeRiskSummary(value);

  if (
    !normalizedSummary ||
    !isTaskType(normalizedSummary.task_type) ||
    !isTaskStatus(normalizedSummary.status) ||
    !isRiskLevel(normalizedSummary.risk_level)
  ) {
    return null;
  }

  return normalizedSummary;
}
