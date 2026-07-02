import { ENGINE_TYPES } from "../constants/engine-type.js";
import { RISK_LEVELS } from "../constants/risk-level.js";
import { TASK_STATUSES } from "../constants/task-status.js";
import { TASK_TYPE_TO_ENGINE_TYPE, TASK_TYPES } from "../constants/task-type.js";
import { isOneOf } from "../utils/guards.js";
import { normalizeRiskSummary as baseNormalizeRiskSummary, normalizeTask as baseNormalizeTask } from "../utils/normalizers.js";
export function isTaskType(value) {
    return isOneOf(TASK_TYPES, value);
}
export function isTaskStatus(value) {
    return isOneOf(TASK_STATUSES, value);
}
export function isEngineType(value) {
    return isOneOf(ENGINE_TYPES, value);
}
export function isRiskLevel(value) {
    return isOneOf(RISK_LEVELS, value);
}
export function normalizeTask(value) {
    const normalizedTask = baseNormalizeTask(value);
    if (!normalizedTask ||
        !isTaskType(normalizedTask.task_type) ||
        !isEngineType(normalizedTask.engine_type) ||
        !isTaskStatus(normalizedTask.status)) {
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
export function normalizeRiskSummary(value) {
    const normalizedSummary = baseNormalizeRiskSummary(value);
    if (!normalizedSummary ||
        !isTaskType(normalizedSummary.task_type) ||
        !isTaskStatus(normalizedSummary.status) ||
        !isRiskLevel(normalizedSummary.risk_level)) {
        return null;
    }
    return normalizedSummary;
}
