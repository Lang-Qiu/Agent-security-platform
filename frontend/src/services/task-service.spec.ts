import { describe, expect, test, vi } from "vitest";

import type { ApiResponse } from "../../../../shared/types/api-response";
import type { BaseResult } from "../../../../shared/types/result";
import type { RiskSummary, Task } from "../../../../shared/types/task";
import { getTaskDetail, listTasks } from "./task-service";

const TASK_FIXTURE: Task = {
  task_id: "task_asset_201",
  task_type: "asset_scan",
  engine_type: "asset_scan",
  status: "pending",
  title: "Scan backend-connected asset",
  target: {
    target_type: "url",
    target_value: "https://backend-agent.example.com",
    display_name: "Backend Agent"
  },
  risk_level: "info",
  summary: "Task accepted and waiting for engine dispatch",
  created_at: "2026-03-26T12:00:00Z",
  updated_at: "2026-03-26T12:00:00Z"
};

const RESULT_FIXTURE: BaseResult = {
  task_id: "task_asset_201",
  task_type: "asset_scan",
  engine_type: "asset_scan",
  status: "pending",
  risk_level: "info",
  summary: "Task accepted and waiting for engine dispatch",
  details: {
    target: {
      target_type: "url",
      target_value: "https://backend-agent.example.com",
      display_name: "Backend Agent"
    },
    findings: []
  },
  created_at: "2026-03-26T12:00:00Z",
  updated_at: "2026-03-26T12:00:00Z"
};

const RISK_SUMMARY_FIXTURE: RiskSummary = {
  task_id: "task_asset_201",
  task_type: "asset_scan",
  status: "pending",
  risk_level: "info",
  summary: "Task accepted and waiting for engine dispatch",
  total_findings: 0,
  info_count: 0,
  low_count: 0,
  medium_count: 0,
  high_count: 0,
  critical_count: 0,
  updated_at: "2026-03-26T12:00:00Z"
};

function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    message: "ok",
    data,
    error_code: null,
    request_id: "req_task_service_test"
  };
}

describe("task service", () => {
  test("listTasks requests GET /api/tasks and returns backend data through the shared response shell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createSuccessResponse([TASK_FIXTURE])
    });

    const result = await listTasks({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: undefined
    });
    expect(result.source).toBe("api");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.task_id).toBe("task_asset_201");
  });

  test("getTaskDetail requests task detail, result, and risk summary endpoints then merges them", async () => {
    const fetchMock = vi.fn().mockImplementation(async (resource: string | URL) => {
      const url = String(resource);

      if (url.endsWith("/api/tasks/task_asset_201")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(TASK_FIXTURE)
        };
      }

      if (url.endsWith("/api/tasks/task_asset_201/result")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(RESULT_FIXTURE)
        };
      }

      if (url.endsWith("/api/tasks/task_asset_201/risk-summary")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(RISK_SUMMARY_FIXTURE)
        };
      }

      return {
        ok: false,
        json: async () => createSuccessResponse(null)
      };
    });

    const result = await getTaskDetail("task_asset_201", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_asset_201", {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: undefined
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_asset_201/result", {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: undefined
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task_asset_201/risk-summary", {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      signal: undefined
    });
    expect(result?.source).toBe("api");
    expect(result?.task.task_id).toBe("task_asset_201");
    expect(result?.result.task_id).toBe("task_asset_201");
    expect(result?.riskSummary.total_findings).toBe(0);
  });

  test("listTasks marks the data source as degraded when the api shell includes invalid task rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        createSuccessResponse([
          TASK_FIXTURE,
          {
            task_id: "task_invalid_001",
            task_type: "asset_scan",
            engine_type: "skills_static",
            status: "pending",
            title: "Broken row",
            target: {
              target_type: "url",
              target_value: "https://broken.example.com"
            },
            created_at: "2026-03-26T12:01:00Z",
            updated_at: "2026-03-26T12:01:00Z"
          }
        ])
    });

    const result = await listTasks({
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result.source).toBe("degraded");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.task_id).toBe("task_asset_201");
  });

  test("getTaskDetail marks the data source as degraded when the task exists but risk summary is missing", async () => {
    const fetchMock = vi.fn().mockImplementation(async (resource: string | URL) => {
      const url = String(resource);

      if (url.endsWith("/api/tasks/task_asset_201")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(TASK_FIXTURE)
        };
      }

      if (url.endsWith("/api/tasks/task_asset_201/result")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(RESULT_FIXTURE)
        };
      }

      if (url.endsWith("/api/tasks/task_asset_201/risk-summary")) {
        return {
          ok: true,
          json: async () => createSuccessResponse(null)
        };
      }

      return {
        ok: false,
        json: async () => createSuccessResponse(null)
      };
    });

    const result = await getTaskDetail("task_asset_201", {
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    expect(result?.source).toBe("degraded");
    expect(result?.task.task_id).toBe("task_asset_201");
    expect(result?.result.task_id).toBe("task_asset_201");
    expect(result?.riskSummary.total_findings).toBe(0);
  });

  test("listTasks returns mock data without calling fetch when mode is mock-only", async () => {
    const fetchMock = vi.fn();

    const result = await listTasks({
      fetchImpl: fetchMock as unknown as typeof fetch,
      mode: "mock-only"
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).toBe("mock");
    expect(result.tasks.length).toBeGreaterThan(0);
  });
});
