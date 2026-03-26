import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ApiResponse } from "../../../../shared/types/api-response";
import type { BaseResult } from "../../../../shared/types/result";
import type { RiskSummary, Task } from "../../../../shared/types/task";
import { renderAppAtRoute } from "../test/app-test-harness";

const TASK_FIXTURES: Record<string, Task> = {
  task_asset_001: {
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
  task_static_001: {
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
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    title: "Replay suspicious runtime session",
    target: {
      target_type: "session",
      target_value: "sandbox/session/001",
      display_name: "Suspicious session replay"
    },
    risk_level: "critical",
    summary: "Runtime policy blocked a suspicious outbound fetch",
    created_at: "2026-03-26T07:30:00Z",
    updated_at: "2026-03-26T07:41:00Z"
  }
};

const RESULT_FIXTURES: Record<string, BaseResult | Record<string, unknown>> = {
  task_asset_001: {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "running",
    risk_level: "high",
    summary: "Detected open ports and a partially identified fingerprint",
    details: {
      confidence: 0.93,
      open_ports: [{ port: 443 }, { port: 8443 }],
      findings: [{ title: "Admin surface exposed" }]
    },
    created_at: "2026-03-26T09:15:00Z",
    updated_at: "2026-03-26T09:18:00Z"
  },
  task_static_001: {
    task_id: "task_static_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "partial_success",
    risk_level: "medium",
    summary: "Rule hit aggregation completed for the primary package",
    details: {
      sample_name: "mail-routing",
      language: "TypeScript",
      files_scanned: 14,
      rule_hits: [{ id: "RULE-001" }, { id: "RULE-002" }]
    },
    created_at: "2026-03-26T08:45:00Z",
    updated_at: "2026-03-26T08:57:00Z"
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    risk_level: "critical",
    summary: "Outbound script download was blocked by sandbox policy",
    details: {
      session_id: "session_demo_001",
      blocked: true,
      event_count: 17,
      alerts: [{ alert_id: "alert-001" }, { alert_id: "alert-002" }]
    },
    created_at: "2026-03-26T07:30:00Z",
    updated_at: "2026-03-26T07:41:00Z"
  }
};

const RISK_SUMMARY_FIXTURES: Record<string, RiskSummary> = {
  task_asset_001: {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    status: "running",
    risk_level: "high",
    summary: "1 high risk finding requires follow-up",
    total_findings: 3,
    info_count: 0,
    low_count: 1,
    medium_count: 1,
    high_count: 1,
    critical_count: 0,
    updated_at: "2026-03-26T09:18:00Z"
  },
  task_static_001: {
    task_id: "task_static_001",
    task_type: "static_analysis",
    status: "partial_success",
    risk_level: "medium",
    summary: "Static review found 2 medium issues",
    total_findings: 2,
    info_count: 0,
    low_count: 0,
    medium_count: 2,
    high_count: 0,
    critical_count: 0,
    updated_at: "2026-03-26T08:57:00Z"
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    status: "blocked",
    risk_level: "critical",
    summary: "A blocked runtime action was captured in sandbox",
    total_findings: 2,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 1,
    critical_count: 1,
    blocked_count: 1,
    updated_at: "2026-03-26T07:41:00Z"
  }
};

function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    message: "ok",
    data,
    error_code: null,
    request_id: "req_task_detail_test"
  };
}

function mockTaskDetailFetch(input: {
  tasks?: Record<string, Task>;
  results?: Record<string, BaseResult | Record<string, unknown>>;
  riskSummaries?: Record<string, RiskSummary>;
}) {
  const tasks = input.tasks ?? TASK_FIXTURES;
  const results = input.results ?? RESULT_FIXTURES;
  const riskSummaries = input.riskSummaries ?? RISK_SUMMARY_FIXTURES;

  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (resource: string | URL) => {
      const url = String(resource);
      const summaryMatch = url.match(/\/api\/tasks\/([^/]+)\/risk-summary$/);

      if (summaryMatch) {
        const taskId = summaryMatch[1];
        return {
          ok: true,
          json: async () => createSuccessResponse(riskSummaries[taskId] ?? null)
        };
      }

      const resultMatch = url.match(/\/api\/tasks\/([^/]+)\/result$/);

      if (resultMatch) {
        const taskId = resultMatch[1];
        return {
          ok: true,
          json: async () => createSuccessResponse(results[taskId] ?? null)
        };
      }

      const taskMatch = url.match(/\/api\/tasks\/([^/]+)$/);

      if (taskMatch) {
        const taskId = taskMatch[1];
        return {
          ok: true,
          json: async () => createSuccessResponse(tasks[taskId] ?? null)
        };
      }

      return {
        ok: false,
        json: async () => createSuccessResponse(null)
      };
    })
  );
}

describe("task detail page", () => {
  beforeEach(() => {
    mockTaskDetailFetch({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("renders the task detail workspace with shared task metadata and summary", async () => {
    await renderAppAtRoute("/tasks/task_asset_001");

    expect(await screen.findByRole("heading", { level: 1, name: /task detail/i })).toBeInTheDocument();
    expect(screen.getByText(/backend api/i)).toBeInTheDocument();
    expect(screen.getAllByText("task_asset_001").length).toBeGreaterThan(0);
    expect(screen.getByText("Scan public agent surface")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /task overview/i })).toBeInTheDocument();
    expect(screen.getByText(/fingerprinting and exposed surface checks are in progress/i)).toBeInTheDocument();
  });

  test("renders the asset scan result section for asset_scan tasks", async () => {
    await renderAppAtRoute("/tasks/task_asset_001");

    expect(await screen.findByRole("heading", { level: 2, name: /asset scan result section/i })).toBeInTheDocument();
    expect(screen.getByText(/detected open ports and a partially identified fingerprint/i)).toBeInTheDocument();
    expect(screen.getByText(/fingerprint confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/2 open ports/i)).toBeInTheDocument();
  });

  test("renders the risk summary section with backend counts for the selected task", async () => {
    await renderAppAtRoute("/tasks/task_asset_001");

    expect(await screen.findByRole("heading", { level: 2, name: /risk summary/i })).toBeInTheDocument();
    expect(screen.getByText(/1 high risk finding requires follow-up/i)).toBeInTheDocument();
    expect(screen.getByText(/3 total findings/i)).toBeInTheDocument();
    expect(screen.getByText(/1 high severity/i)).toBeInTheDocument();
  });

  test("renders the static analysis result section for static_analysis tasks", async () => {
    await renderAppAtRoute("/tasks/task_static_001");

    expect(
      await screen.findByRole("heading", { level: 2, name: /static analysis result section/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/typescript/i)).toBeInTheDocument();
    expect(screen.getByText(/14 files scanned/i)).toBeInTheDocument();
  });

  test("renders the sandbox alert section for sandbox_run tasks", async () => {
    await renderAppAtRoute("/tasks/task_sandbox_001");

    expect(await screen.findByRole("heading", { level: 2, name: /sandbox alert section/i })).toBeInTheDocument();
    expect(screen.getByText(/blocked session/i)).toBeInTheDocument();
    expect(screen.getByText(/2 alerts captured/i)).toBeInTheDocument();
  });

  test("renders a fallback message when result details are missing", async () => {
    mockTaskDetailFetch({
      results: {
        ...RESULT_FIXTURES,
        task_sandbox_001: {
          task_id: "task_sandbox_001",
          task_type: "sandbox_run",
          engine_type: "sandbox",
          status: "blocked",
          risk_level: "critical",
          summary: "Outbound script download was blocked by sandbox policy",
          created_at: "2026-03-26T07:30:00Z",
          updated_at: "2026-03-26T07:41:00Z"
        }
      }
    });

    await renderAppAtRoute("/tasks/task_sandbox_001");

    expect(await screen.findByRole("heading", { level: 2, name: /sandbox alert section/i })).toBeInTheDocument();
    expect(screen.getByText(/result details are not available yet/i)).toBeInTheDocument();
  });

  test("renders a degraded source badge when backend detail data is only partially available", async () => {
    mockTaskDetailFetch({
      riskSummaries: {
        task_static_001: RISK_SUMMARY_FIXTURES.task_static_001,
        task_sandbox_001: RISK_SUMMARY_FIXTURES.task_sandbox_001
      }
    });

    await renderAppAtRoute("/tasks/task_asset_001");

    expect(await screen.findByText(/degraded api data/i)).toBeInTheDocument();
    expect(screen.getByText(/risk summary/i)).toBeInTheDocument();
    expect(screen.getByText(/0 total findings/i)).toBeInTheDocument();
  });

  test("renders an integration error badge when the backend task shell is contract-invalid", async () => {
    mockTaskDetailFetch({
      tasks: {
        task_asset_001: {
          ...TASK_FIXTURES.task_asset_001,
          engine_type: "skills_static"
        }
      }
    });

    await renderAppAtRoute("/tasks/task_asset_001");

    expect(await screen.findByText(/integration error/i)).toBeInTheDocument();
    expect(screen.getAllByText("task_asset_001").length).toBeGreaterThan(0);
  });
});
