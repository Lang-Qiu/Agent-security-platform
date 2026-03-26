import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiResponse } from "../../../../shared/types/api-response";
import type { Task } from "../../../../shared/types/task";
import { renderAppAtRoute } from "../test/app-test-harness";

const TASK_ROWS: Task[] = [
  {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "running",
    title: "Scan public agent surface",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com",
      display_name: "Demo Agent"
    },
    risk_level: "high",
    summary: "Fingerprinting and exposed surface checks are in progress",
    created_at: "2026-03-26T09:15:00Z",
    updated_at: "2026-03-26T09:18:00Z"
  },
  {
    task_id: "task_static_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "partial_success",
    title: "Analyze mail routing skill pack",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/mail-routing",
      display_name: "mail-routing"
    },
    risk_level: "medium",
    summary: "Rule scan completed with dependency metadata pending",
    created_at: "2026-03-26T08:45:00Z",
    updated_at: "2026-03-26T08:57:00Z"
  }
];

function createTaskListResponse(data: Task[]): ApiResponse<Task[]> {
  return {
    success: true,
    message: "Tasks fetched successfully",
    data,
    error_code: null,
    request_id: "req_tasks_page_test"
  };
}

function mockFetchWithTaskRows(data: Task[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => createTaskListResponse(data)
    })
  );
}

describe("tasks page", () => {
  beforeEach(() => {
    mockFetchWithTaskRows(TASK_ROWS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("renders the tasks workspace heading and loads the task queue table", async () => {
    const renderedApp = await renderAppAtRoute("/tasks");

    expect(renderedApp).not.toBeNull();

    if (!renderedApp) {
      return;
    }

    expect(await screen.findByRole("heading", { level: 1, name: /tasks/i })).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(await screen.findByText("task_asset_001")).toBeInTheDocument();
  });

  test("renders the required task table columns and shared status and risk labels", async () => {
    await renderAppAtRoute("/tasks");

    expect(await screen.findByRole("columnheader", { name: /task id/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /task type/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /risk level/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /created at/i })).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Partial Success")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
  });

  test("renders an empty state when the task list is empty", async () => {
    mockFetchWithTaskRows([]);

    await renderAppAtRoute("/tasks");

    expect(await screen.findByText(/no tasks available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/create or sync tasks to populate the queue workspace/i)).toBeInTheDocument();
  });

  test("navigates to the task detail route when the operator clicks view details", async () => {
    await renderAppAtRoute("/tasks");

    fireEvent.click(await screen.findByRole("link", { name: /view details for task_asset_001/i }));

    expect(await screen.findByRole("heading", { level: 1, name: /task detail/i })).toBeInTheDocument();
    expect(screen.getByText("task_asset_001")).toBeInTheDocument();
  });
});
