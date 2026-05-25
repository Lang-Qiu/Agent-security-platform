import { pathToFileURL } from "node:url";

import { runAssetScanTask } from "../runtime/run-task.ts";
import type { Task } from "../../../../shared/types/task.ts";
import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";

const ALLOWED_INTERRUPTION_REASONS = ["none", "budget", "timeout", "manual_stop"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isAllowedInterruptionReason(value: string | undefined): boolean {
  return value !== undefined && (ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(value);
}

function resolveInterruptionReason(parameterReason: string | undefined, runtimeReason: string | undefined): string {
  if (parameterReason && parameterReason !== "none" && isAllowedInterruptionReason(parameterReason)) {
    return parameterReason;
  }

  if (isAllowedInterruptionReason(runtimeReason)) {
    return runtimeReason;
  }

  if (isAllowedInterruptionReason(parameterReason)) {
    return parameterReason;
  }

  return "none";
}

export function buildExecutionContextFromTask(
  task: Pick<Task, "parameters" | "requested_by">,
  runtimeExecutionContext?: AssetScanResultDetails["execution_context"]
):
  | AssetScanResultDetails["execution_context"]
  | undefined {
  if (!isPlainObject(task.parameters)) {
    return runtimeExecutionContext;
  }

  const parameters = task.parameters;
  const auditFromParameters = isPlainObject(parameters.audit) ? parameters.audit : {};
  const runtimeAudit = isPlainObject(runtimeExecutionContext?.audit) ? runtimeExecutionContext.audit : {};
  const interruptionReason = readOptionalString(auditFromParameters.interruption_reason);
  const runtimeInterruptionReason = readOptionalString(runtimeAudit.interruption_reason);

  return {
    ...runtimeExecutionContext,
    max_targets: typeof parameters.max_targets === "number" ? parameters.max_targets : undefined,
    max_ports_per_target: typeof parameters.max_ports_per_target === "number" ? parameters.max_ports_per_target : undefined,
    max_runtime_seconds: typeof parameters.max_runtime_seconds === "number" ? parameters.max_runtime_seconds : undefined,
    target_http_rps_cap: typeof parameters.target_http_rps_cap === "number" ? parameters.target_http_rps_cap : undefined,
    max_tcp_concurrency_per_target:
      typeof parameters.max_tcp_concurrency_per_target === "number"
        ? parameters.max_tcp_concurrency_per_target
        : undefined,
    audit: {
      ...runtimeAudit,
      query: readOptionalString(auditFromParameters.query),
      source: readOptionalString(auditFromParameters.source),
      requested_by: readOptionalString(auditFromParameters.requested_by) ?? task.requested_by,
      requested_at: readOptionalString(auditFromParameters.requested_at),
      interruption_reason: resolveInterruptionReason(interruptionReason, runtimeInterruptionReason)
    }
  };
}

async function main() {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const payload = JSON.parse(input);
    const task: Task = payload.task;

    if (!task) {
      throw new Error("Missing task payload in stdin");
    }

    const fullResult = await runAssetScanTask(task);

    const details: AssetScanResultDetails = {
      target: fullResult.target,
      fingerprint: fullResult.fingerprints,
      open_ports: fullResult.network?.open_ports || [],
      http_endpoints: fullResult.application?.http_endpoints || [],
      auth_detected: fullResult.application?.auth?.auth_detected || false,
      findings: fullResult.findings || [],
      execution_context: buildExecutionContextFromTask(task, fullResult.execution_context)
    };

    console.log(JSON.stringify({
      success: true,
      details
    }));
  } catch (error) {
    console.error("[Bridge Error]", error);
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
