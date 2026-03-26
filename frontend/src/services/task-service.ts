import type { ApiResponse } from "../../../shared/types/api-response";
import type { BaseResult } from "../../../shared/types/result";
import type { Task } from "../../../shared/types/task";
import { taskQueueMocks } from "../mocks/tasks";
import { taskResultMocks } from "../mocks/task-results";

const TASKS_ENDPOINT = "/api/tasks";
const DEFAULT_RESULT_SUMMARY = "Result details are not available yet.";

export interface TaskDetailData {
  task: Task;
  result: BaseResult<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findMockTask(taskId: string): Task | null {
  return taskQueueMocks.find((task) => task.task_id === taskId) ?? null;
}

function findMockResult(taskId: string): BaseResult | null {
  return taskResultMocks[taskId] ?? null;
}

function normalizeResult(task: Task, rawResult: unknown): BaseResult<Record<string, unknown>> {
  if (!isRecord(rawResult)) {
    return {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: task.engine_type,
      status: task.status,
      risk_level: task.risk_level ?? "info",
      summary: task.summary ?? DEFAULT_RESULT_SUMMARY,
      details: {},
      created_at: task.created_at,
      updated_at: task.updated_at
    };
  }

  return {
    task_id: typeof rawResult.task_id === "string" ? rawResult.task_id : task.task_id,
    task_type: task.task_type,
    engine_type: task.engine_type,
    status: task.status,
    risk_level:
      rawResult.risk_level === "info" ||
      rawResult.risk_level === "low" ||
      rawResult.risk_level === "medium" ||
      rawResult.risk_level === "high" ||
      rawResult.risk_level === "critical"
        ? rawResult.risk_level
        : task.risk_level ?? "info",
    summary: typeof rawResult.summary === "string" ? rawResult.summary : task.summary ?? DEFAULT_RESULT_SUMMARY,
    details: isRecord(rawResult.details) ? rawResult.details : {},
    created_at: typeof rawResult.created_at === "string" ? rawResult.created_at : task.created_at,
    updated_at: typeof rawResult.updated_at === "string" ? rawResult.updated_at : task.updated_at,
    result_id: typeof rawResult.result_id === "string" ? rawResult.result_id : undefined,
    started_at: typeof rawResult.started_at === "string" ? rawResult.started_at : undefined,
    finished_at: typeof rawResult.finished_at === "string" ? rawResult.finished_at : undefined,
    metadata: isRecord(rawResult.metadata) ? rawResult.metadata : undefined
  };
}

async function readSuccessPayload<T>(response: { ok: boolean; json: () => Promise<unknown> }): Promise<T | null> {
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.success) {
    return null;
  }

  return payload.data;
}

export async function listTasks(input: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<Task[]> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    return taskQueueMocks;
  }

  try {
    const response = await fetchImpl(TASKS_ENDPOINT, {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: input.signal
    });

    if (!response.ok) {
      return taskQueueMocks;
    }

    const payload = (await response.json()) as ApiResponse<Task[]>;

    if (!payload.success || !Array.isArray(payload.data)) {
      return taskQueueMocks;
    }

    return payload.data;
  } catch {
    return taskQueueMocks;
  }
}

export async function getTaskDetail(
  taskId: string,
  input: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  } = {}
): Promise<TaskDetailData | null> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const mockTask = findMockTask(taskId);
  const mockResult = findMockResult(taskId);

  if (!fetchImpl) {
    if (!mockTask) {
      return null;
    }

    return {
      task: mockTask,
      result: normalizeResult(mockTask, mockResult)
    };
  }

  try {
    const [taskData, resultData] = await Promise.all([
      fetchImpl(`${TASKS_ENDPOINT}/${taskId}`, {
        method: "GET",
        headers: {
          accept: "application/json"
        },
        signal: input.signal
      }).then(readSuccessPayload<Task>),
      fetchImpl(`${TASKS_ENDPOINT}/${taskId}/result`, {
        method: "GET",
        headers: {
          accept: "application/json"
        },
        signal: input.signal
      }).then(readSuccessPayload<unknown>)
    ]);

    if (taskData && typeof taskData.task_id === "string") {
      return {
        task: taskData,
        result: normalizeResult(taskData, resultData)
      };
    }
  } catch {
    // Fallback to local mocks below when the backend is unavailable.
  }

  if (!mockTask) {
    return null;
  }

  return {
    task: mockTask,
    result: normalizeResult(mockTask, mockResult)
  };
}
