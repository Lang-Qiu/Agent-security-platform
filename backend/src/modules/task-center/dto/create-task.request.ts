import type { TaskTarget, TaskType } from "../../../../../shared/types/task.ts";
import { isTaskType } from "../../../../../shared/contracts/task.ts";

export interface CreateTaskRequest {
  task_type: TaskType;
  title: string;
  target: TaskTarget;
  requested_by?: string;
  parameters?: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function normalizeTarget(value: unknown): TaskTarget | null {
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
    normalizedTarget.metadata = { ...value.metadata };
  }

  return normalizedTarget;
}

export function normalizeCreateTaskRequest(value: unknown): CreateTaskRequest | null {
  if (!isPlainObject(value) || !isTaskType(value.task_type) || !isString(value.title)) {
    return null;
  }

  const normalizedTarget = normalizeTarget(value.target);

  if (!normalizedTarget) {
    return null;
  }

  const normalizedRequest: CreateTaskRequest = {
    task_type: value.task_type,
    title: value.title,
    target: normalizedTarget
  };

  if (isString(value.requested_by)) {
    normalizedRequest.requested_by = value.requested_by;
  }

  if (isPlainObject(value.parameters)) {
    normalizedRequest.parameters = { ...value.parameters };
  }

  return normalizedRequest;
}
