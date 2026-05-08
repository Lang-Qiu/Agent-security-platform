import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const modulePath = resolve(import.meta.dirname, "../../scripts/dev/intel/fofa-task-batch-report.ts");

type BatchReportModule = {
  runFofaTaskBatchReport?: (options: {
    backendBaseUrl: string;
    taskIds: string[];
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<{
    total: number;
    byStatus: Record<string, number>;
    byRiskLevel: Record<string, number>;
    tasks: Array<{
      task_id: string;
      status: string;
      risk_level: string;
      summary: string;
      findings: number;
      target_value?: string;
    }>;
  }>;
};

test("runFofaTaskBatchReport aggregates backend task results and risk summaries", async () => {
  const module = (await import(pathToFileURL(modulePath).href)) as BatchReportModule;

  assert.equal(typeof module.runFofaTaskBatchReport, "function", "runFofaTaskBatchReport should be exported");

  if (!module.runFofaTaskBatchReport) {
    return;
  }

  const fetchImpl = async (input: string | URL): Promise<Response> => {
    const url = String(input);

    if (url === "http://127.0.0.1:3000/api/tasks/task_a/result") {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            task_id: "task_a",
            status: "finished",
            risk_level: "high",
            summary: "Asset scan finished with 1 finding",
            details: {
              target: {
                target_type: "url",
                target_value: "http://39.98.59.84:11434"
              },
              findings: [{ finding_id: "finding_001" }]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url === "http://127.0.0.1:3000/api/tasks/task_a/risk-summary") {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            task_id: "task_a",
            status: "finished",
            risk_level: "high",
            summary: "Asset scan finished with 1 finding"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url === "http://127.0.0.1:3000/api/tasks/task_b/result") {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            task_id: "task_b",
            status: "finished",
            risk_level: "info",
            summary: "Asset scan finished with 0 findings",
            details: {
              target: {
                target_type: "url",
                target_value: "http://116.104.176.243:11434"
              },
              findings: []
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url === "http://127.0.0.1:3000/api/tasks/task_b/risk-summary") {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            task_id: "task_b",
            status: "finished",
            risk_level: "info",
            summary: "Asset scan finished with 0 findings"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const report = await module.runFofaTaskBatchReport({
    backendBaseUrl: "http://127.0.0.1:3000",
    taskIds: ["task_a", "task_b"],
    fetchImpl
  });

  assert.deepEqual(report, {
    total: 2,
    byStatus: {
      finished: 2
    },
    byRiskLevel: {
      high: 1,
      info: 1
    },
    tasks: [
      {
        task_id: "task_a",
        status: "finished",
        risk_level: "high",
        summary: "Asset scan finished with 1 finding",
        findings: 1,
        target_value: "http://39.98.59.84:11434"
      },
      {
        task_id: "task_b",
        status: "finished",
        risk_level: "info",
        summary: "Asset scan finished with 0 findings",
        findings: 0,
        target_value: "http://116.104.176.243:11434"
      }
    ]
  });
});