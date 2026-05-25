// 后端逐个读取每个任务的 result 和 risk-summary，
// 把它们汇总成一份批次报告，看看这批任务里 
// finished、failed、high、info 分别有多少。

import { parseArgs } from "node:util";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type TaskResultShell = {
  success?: boolean;
  data?: {
    task_id?: string;
    status?: string;
    risk_level?: string;
    summary?: string;
    details?: {
      target?: {
        target_value?: string;
      };
      findings?: unknown[];
    };
  };
};

type RiskSummaryShell = {
  success?: boolean;
  data?: {
    task_id?: string;
    status?: string;
    risk_level?: string;
    summary?: string;
  };
};

function incrementCounter(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

export async function runFofaTaskBatchReport(options: {
  backendBaseUrl: string;
  taskIds: string[];
  fetchImpl?: FetchLike;
}): Promise<{
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
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const tasks: Array<{
    task_id: string;
    status: string;
    risk_level: string;
    summary: string;
    findings: number;
    target_value?: string;
  }> = [];
  const byStatus: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};

  for (const taskId of options.taskIds) {
    const resultResponse = await fetchImpl(new URL(`/api/tasks/${taskId}/result`, options.backendBaseUrl));
    if (!resultResponse.ok) {
      throw new Error(`Failed to fetch task result for ${taskId}: ${resultResponse.status}`);
    }

    const riskSummaryResponse = await fetchImpl(new URL(`/api/tasks/${taskId}/risk-summary`, options.backendBaseUrl));
    if (!riskSummaryResponse.ok) {
      throw new Error(`Failed to fetch risk summary for ${taskId}: ${riskSummaryResponse.status}`);
    }

    const resultPayload = (await resultResponse.json()) as TaskResultShell;
    const riskSummaryPayload = (await riskSummaryResponse.json()) as RiskSummaryShell;
    if (resultPayload.success !== true || !resultPayload.data) {
      throw new Error(`Task result shell is invalid for ${taskId}`);
    }
    if (riskSummaryPayload.success !== true || !riskSummaryPayload.data) {
      throw new Error(`Risk summary shell is invalid for ${taskId}`);
    }

    const status = riskSummaryPayload.data.status ?? resultPayload.data.status ?? "unknown";
    const riskLevel = riskSummaryPayload.data.risk_level ?? resultPayload.data.risk_level ?? "info";
    const summary = riskSummaryPayload.data.summary ?? resultPayload.data.summary ?? "";
    const findings = Array.isArray(resultPayload.data.details?.findings) ? resultPayload.data.details?.findings.length : 0;
    const targetValue = resultPayload.data.details?.target?.target_value;

    tasks.push({
      task_id: taskId,
      status,
      risk_level: riskLevel,
      summary,
      findings,
      target_value: targetValue
    });

    incrementCounter(byStatus, status);
    incrementCounter(byRiskLevel, riskLevel);
  }

  return {
    total: tasks.length,
    byStatus,
    byRiskLevel,
    tasks
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      backend: { type: "string", default: "http://127.0.0.1:3000" },
      taskIds: { type: "string" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help || !values.taskIds) {
    console.log([
      "Usage: node --experimental-strip-types scripts/dev/intel/fofa-task-batch-report.ts --taskIds <comma-separated-task-ids> [--backend <url>]",
      "",
      "Example:",
      "  node --experimental-strip-types scripts/dev/intel/fofa-task-batch-report.ts --backend http://127.0.0.1:3000 --taskIds task_a,task_b"
    ].join("\n"));
    return;
  }

  const taskIds = values.taskIds
    .split(",")
    .map((taskId) => taskId.trim())
    .filter((taskId) => taskId.length > 0);

  const report = await runFofaTaskBatchReport({
    backendBaseUrl: values.backend,
    taskIds
  });

  console.log(JSON.stringify(report, null, 2));
}

const isDirectExecution = typeof process.argv[1] === "string" && import.meta.url === new URL(process.argv[1], "file://").href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("[FOFA TASK BATCH REPORT] failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}