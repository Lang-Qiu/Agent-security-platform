import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import { runFofaPortscanWorkflow, type PortscanCommandRunner, type PortscanWorkflowTarget } from "./fofa-portscan-workflow.ts";

type TaskScanTask = {
  task_id?: string;
  target_value?: string;
  source_ip?: string | null;
  source_port?: number | null;
};

type TaskScanPayload = {
  query?: string;
  tasks?: TaskScanTask[];
};

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }

  return undefined;
}

export function extractJsonObjectFromMixedOutput(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start < 0) {
    throw new Error("Task-scan output does not contain JSON payload");
  }

  return JSON.parse(raw.slice(start));
}

function resolveTargetAddress(task: TaskScanTask): { sourceIp: string; sourcePort: number; protocol: string } {
  const sourceIp = readNonEmptyString(task.source_ip);
  const sourcePort = readInteger(task.source_port);

  const targetValue = readNonEmptyString(task.target_value);

  if (sourceIp && sourcePort) {
    let protocol = "http";
    if (targetValue) {
      try {
        const parsedUrl = new URL(targetValue);
        protocol = parsedUrl.protocol.replace(":", "") || "http";
      } catch {
        // Keep default protocol.
      }
    }

    return {
      sourceIp,
      sourcePort,
      protocol
    };
  }

  if (!targetValue) {
    throw new Error("Task-scan task is missing target_value");
  }

  const parsedUrl = new URL(targetValue);
  const fallbackPort = parsedUrl.port.length > 0 ? Number(parsedUrl.port) : parsedUrl.protocol === "https:" ? 443 : 80;

  if (!Number.isFinite(fallbackPort)) {
    throw new Error(`Unable to resolve source_port from target_value: ${targetValue}`);
  }

  return {
    sourceIp: parsedUrl.hostname,
    sourcePort: Math.trunc(fallbackPort),
    protocol: parsedUrl.protocol.replace(":", "") || "http"
  };
}

export function buildPortscanTargetsFromTaskScan(options: {
  taskScanPayload: TaskScanPayload;
  probeTargetId: string;
  requestedBy: string;
}): PortscanWorkflowTarget[] {
  const query = readNonEmptyString(options.taskScanPayload.query) ?? "unknown_query";
  const tasks = Array.isArray(options.taskScanPayload.tasks) ? options.taskScanPayload.tasks : [];
  const targets: PortscanWorkflowTarget[] = [];

  for (const task of tasks) {
    const taskId = readNonEmptyString(task.task_id);
    const targetValue = readNonEmptyString(task.target_value);

    if (!taskId || !targetValue) {
      continue;
    }

    const address = resolveTargetAddress(task);

    targets.push({
      source_query: query,
      source_ip: address.sourceIp,
      source_port: address.sourcePort,
      protocol: address.protocol,
      target_value: targetValue,
      probe_target_id: options.probeTargetId,
      task_id: taskId,
      requested_by: options.requestedBy
    });
  }

  return targets;
}

export function createShellCommandRunner(): PortscanCommandRunner {
  return {
    run(command, args, timeoutMs) {
      return new Promise((resolvePromise) => {
        const child = spawn(command, args, {
          stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const finish = (result: { stdout: string; stderr: string; exitCode: number }) => {
          if (settled) {
            return;
          }

          settled = true;
          resolvePromise(result);
        };

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });

        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        let timeoutRef: NodeJS.Timeout | undefined;

        if (timeoutMs && timeoutMs > 0) {
          timeoutRef = setTimeout(() => {
            child.kill("SIGKILL");
            finish({ stdout, stderr: stderr || "killed by timeout", exitCode: 124 });
          }, timeoutMs);
        }

        child.on("error", (error) => {
          if (timeoutRef) {
            clearTimeout(timeoutRef);
          }

          finish({ stdout, stderr: error.message || stderr || "spawn failed", exitCode: 127 });
        });

        child.on("close", (code) => {
          if (timeoutRef) {
            clearTimeout(timeoutRef);
          }

          finish({ stdout, stderr, exitCode: code ?? 1 });
        });
      });
    }
  };
}

export async function runFofaMainlinePortscan(options: {
  taskScanFile: string;
  outputDir: string;
  probeTargetId: string;
  requestedBy: string;
  naabuTimeoutMs?: number;
  nmapTimeoutMs?: number;
  runner?: PortscanCommandRunner;
}) {
  const raw = await readFile(options.taskScanFile, "utf8");
  const payload = extractJsonObjectFromMixedOutput(raw) as TaskScanPayload;
  const targets = buildPortscanTargetsFromTaskScan({
    taskScanPayload: payload,
    probeTargetId: options.probeTargetId,
    requestedBy: options.requestedBy
  });

  const runner = options.runner ?? createShellCommandRunner();
  const workflowResult = await runFofaPortscanWorkflow({
    targets,
    outputDir: options.outputDir,
    runner,
    naabuTimeoutMs: options.naabuTimeoutMs,
    nmapTimeoutMs: options.nmapTimeoutMs
  });

  return {
    target_count: targets.length,
    workflow: workflowResult
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      taskScanFile: { type: "string" },
      outputDir: { type: "string", default: "docs/temp" },
      probeTargetId: { type: "string", default: "ollama" },
      requestedBy: { type: "string", default: "fofa-dev-script" },
      naabuTimeoutMs: { type: "string", default: "12000" },
      nmapTimeoutMs: { type: "string", default: "15000" },
      help: { type: "boolean", short: "h" }
    }
  });

  if (values.help || !values.taskScanFile) {
    console.log([
      "Usage: node --experimental-strip-types scripts/dev/intel/fofa-mainline-portscan.ts --taskScanFile <path> [options]",
      "",
      "Options:",
      "  --outputDir <path>         Output directory for workflow artifacts. Default: docs/temp",
      "  --probeTargetId <id>       Probe target id. Default: ollama",
      "  --requestedBy <name>       requested_by for workflow targets. Default: fofa-dev-script",
      "  --naabuTimeoutMs <ms>      naabu timeout. Default: 12000",
      "  --nmapTimeoutMs <ms>       nmap timeout. Default: 15000"
    ].join("\n"));
    return;
  }

  const result = await runFofaMainlinePortscan({
    taskScanFile: values.taskScanFile,
    outputDir: values.outputDir,
    probeTargetId: values.probeTargetId,
    requestedBy: values.requestedBy,
    naabuTimeoutMs: Number(values.naabuTimeoutMs),
    nmapTimeoutMs: Number(values.nmapTimeoutMs)
  });

  console.log(JSON.stringify(result, null, 2));
}

const isDirectExecution = typeof process.argv[1] === "string" && import.meta.url === new URL(process.argv[1], "file://").href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("[FOFA MAINLINE PORTSCAN] failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
