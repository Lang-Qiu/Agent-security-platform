import { normalizeBaseResult } from "../../../shared/contracts/result";
import { normalizeRiskSummary, normalizeTask } from "../../../shared/contracts/task";
import type { BaseResult, ResultDetails } from "../../../shared/types/result";
import type { RiskSummary, Task } from "../../../shared/types/task";
import { taskRiskSummaryMocks } from "../mocks/task-risk-summaries";
import { taskQueueMocks } from "../mocks/tasks";
import { taskResultMocks } from "../mocks/task-results";
import { requestApiDataWithStatus, type ApiClientOptions } from "./api-client";

const TASKS_ENDPOINT = "/api/tasks";
const DEFAULT_RESULT_SUMMARY = "Result details are not available yet.";
export type TaskDataSource = "api" | "degraded" | "mock";

export interface TaskListData {
  tasks: Task[];
  source: TaskDataSource;
}

export interface TaskDetailData {
  task: Task;
  result: BaseResult<ResultDetails>;
  riskSummary: RiskSummary;
  source: TaskDataSource;
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

function findMockRiskSummary(taskId: string): RiskSummary | null {
  return taskRiskSummaryMocks[taskId] ?? null;
}

function buildFallbackRiskSummary(task: Task): RiskSummary {
  return {
    task_id: task.task_id,
    task_type: task.task_type,
    status: task.status,
    risk_level: task.risk_level ?? "info",
    summary: task.summary ?? DEFAULT_RESULT_SUMMARY,
    total_findings: 0,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 0,
    critical_count: 0,
    updated_at: task.updated_at
  };
}

function normalizeResult(task: Task, rawResult: unknown): BaseResult<ResultDetails> {
  const normalizedResult = normalizeBaseResult(rawResult);

  if (normalizedResult) {
    return normalizedResult;
  }

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

  const fallbackDetails = normalizeBaseResult({
    task_id: task.task_id,
    task_type: task.task_type,
    engine_type: task.engine_type,
    status: task.status,
    risk_level: task.risk_level ?? "info",
    summary: typeof rawResult.summary === "string" ? rawResult.summary : task.summary ?? DEFAULT_RESULT_SUMMARY,
    details: rawResult.details,
    created_at: typeof rawResult.created_at === "string" ? rawResult.created_at : task.created_at,
    updated_at: typeof rawResult.updated_at === "string" ? rawResult.updated_at : task.updated_at
  });

  if (fallbackDetails) {
    return fallbackDetails;
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

export async function listTasks(input: {
} & ApiClientOptions = {}): Promise<TaskListData> {
  const apiTasks = await requestApiDataWithStatus({
    path: TASKS_ENDPOINT,
    options: input,
    normalize: (value) => {
      if (!Array.isArray(value)) {
        return null;
      }

      const normalizedTasks = value
        .map((item) => normalizeTask(item))
        .filter((task): task is Task => task !== null);

      return {
        tasks: normalizedTasks,
        hasInvalidRows: normalizedTasks.length !== value.length
      };
    }
  });

  if (apiTasks.data) {
    return {
      tasks: apiTasks.data.tasks,
      source: apiTasks.data.hasInvalidRows ? "degraded" : "api"
    };
  }

  return {
    tasks: taskQueueMocks,
    source: "mock"
  };
}

export async function getTaskDetail(
  taskId: string,
  input: ApiClientOptions = {}
): Promise<TaskDetailData | null> {
  const mockTask = findMockTask(taskId);
  const mockResult = findMockResult(taskId);
  const mockRiskSummary = findMockRiskSummary(taskId);

  const [taskData, resultData, riskSummaryData] = await Promise.all([
    requestApiDataWithStatus({
      path: `${TASKS_ENDPOINT}/${taskId}`,
      options: input,
      normalize: normalizeTask
    }),
    requestApiDataWithStatus({
      path: `${TASKS_ENDPOINT}/${taskId}/result`,
      options: input,
      normalize: normalizeBaseResult
    }),
    requestApiDataWithStatus({
      path: `${TASKS_ENDPOINT}/${taskId}/risk-summary`,
      options: input,
      normalize: normalizeRiskSummary
    })
  ]);

  if (taskData.data && resultData.data && riskSummaryData.data) {
    return {
      task: taskData.data,
      result: resultData.data,
      riskSummary: riskSummaryData.data,
      source: "api"
    };
  }

  if (taskData.data) {
    const isDegraded = resultData.status !== "ok" || riskSummaryData.status !== "ok";

    return {
      task: taskData.data,
      result: resultData.data ?? normalizeResult(taskData.data, null),
      riskSummary: riskSummaryData.data ?? buildFallbackRiskSummary(taskData.data),
      source: isDegraded ? "degraded" : "api"
    };
  }

  if (!mockTask) {
    return null;
  }

  return {
    task: mockTask,
    result: normalizeResult(mockTask, mockResult),
    riskSummary: mockRiskSummary ?? buildFallbackRiskSummary(mockTask),
    source: "mock"
  };
}
