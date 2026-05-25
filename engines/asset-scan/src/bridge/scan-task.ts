import { runAssetScanTask } from "../runtime/run-task.ts";
import type { Task } from "../../../../shared/types/task.ts";
import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";
import { pathToFileURL } from "node:url";

const ALLOWED_INTERRUPTION_REASONS = ["none", "budget", "timeout", "manual_stop"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// 用于构建 execution_context（执行上下文），记录这次扫描的配置和审计信息
// 示例：
// max_targets、max_ports_per_target：限制扫描范围
// max_runtime_seconds：超时控制
// audit.query、audit.source：记录当初的 FOFA 查询语句或情报来源
// audit.requested_by：谁发起的
// audit.interruption_reason：任务中断的原因（预算用尽、超时、手动停止等）
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
      interruption_reason:
        interruptionReason && interruptionReason !== "none" && (ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(interruptionReason)
          ? interruptionReason
          : runtimeInterruptionReason && (ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(runtimeInterruptionReason)
            ? runtimeInterruptionReason
            : interruptionReason && (ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(interruptionReason)
              ? interruptionReason
              : "none"
    }
  };
}

async function main() {
  let input = "";
  
  // 1. 从标准输入读取 Backend 传递的 Task Payload
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  try {
    const payload = JSON.parse(input);
    const task: Task = payload.task;

    if (!task) {
      throw new Error("Missing task payload in stdin");
    }

    // 2. 调用已实现的引擎核心入口 (执行 Pipeline)
    const fullResult = await runAssetScanTask(task);

    // 3. 将引擎级的 AssetScanResult 降维映射为平台级 AssetScanResultDetails
    const details: AssetScanResultDetails = {
      target: fullResult.target,
      fingerprint: fullResult.fingerprints,
      open_ports: fullResult.network?.open_ports || [],
      http_endpoints: fullResult.application?.http_endpoints || [],
      auth_detected: fullResult.application?.auth?.auth_detected || false,
      findings: fullResult.findings || [],
      execution_context: buildExecutionContextFromTask(task, fullResult.execution_context)
    };

    // 4. 将结果以 JSON 格式输出到 stdout 供 Backend 消费
    console.log(JSON.stringify({ 
      success: true, 
      details 
    }));

  } catch (error) {
    // 错误信息输出到 stderr，并向 stdout 返回失败状态
    console.error(`[Bridge Error]`, error);
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
