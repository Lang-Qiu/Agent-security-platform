import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 寮曞叆鍏叡绫诲瀷濂戠害
import type { Task } from "../../../../shared/types/task.ts";
import type { AssetScanResult } from "../../../../shared/types/asset-scan.ts";

// 寮曞叆閲嶆瀯濂界殑娴佹按绾?
import { AssetScanPipeline } from "./pipeline.ts";

type PipelineLike = {
    run: (
        targetUrl: string,
        options?: { discoveryInput?: { seed: string[] } }
    ) => Promise<Partial<AssetScanResult>>;
};

interface RunAssetScanTaskOptions {
    pipeline?: PipelineLike;
    pipelineFactory?: (workspaceRoot: string) => PipelineLike;
    workspaceRoot?: string;
}

function deriveRuntimeStatus(
    executionContext: AssetScanResult["execution_context"] | undefined
): AssetScanResult["status"] {
    const interruptionReason = executionContext?.audit?.interruption_reason;
    return interruptionReason && interruptionReason !== "none" ? "partial_success" : "finished";
}

function deriveInterruptionReasonFromError(error: unknown): "none" | "budget" | "timeout" {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (message.includes("timeout")) {
        return "timeout";
    }

    if (message.includes("budget")) {
        return "budget";
    }

    return "none";
}

function deriveDiscoverySeed(task: Task, targetUrl: string): string[] {
    const seed = task.parameters?.discovery_seed;

    if (Array.isArray(seed)) {
        const normalizedSeed = seed.filter((item): item is string => typeof item === "string");

        if (normalizedSeed.length > 0) {
            return normalizedSeed;
        }
    }

    return [new URL(targetUrl).hostname];
}

export async function runAssetScanTask(task: Task, options?: RunAssetScanTaskOptions): Promise<AssetScanResult> {
    // 1. 瑙ｆ瀽宸ヤ綔鍖烘牴鐩綍锛岀‘淇?Pipeline 鑳藉噯纭壘鍒?rules/ 鐩綍涓嬬殑 yaml 鏂囦欢
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = options?.workspaceRoot ?? resolve(currentDir, "../../../..");

    // 2. 瀹炰緥鍖栨壂鎻忔祦姘寸嚎
    const pipeline = options?.pipeline ?? options?.pipelineFactory?.(workspaceRoot) ?? new AssetScanPipeline(workspaceRoot);

    // 3. 浠庢爣鍑?Task 濂戠害涓彁鍙栨帰娴嬬洰鏍?
    if (!task.target || !task.target.target_value) {
        throw new Error("Task target is missing or invalid.");
    }
    const targetUrl = task.target.target_value;

    try {
        const discoverySeed = deriveDiscoverySeed(task, targetUrl);

        // 4. 鎵ц搴曞眰娴嬬粯娴佹按绾?(Step 1 ~ Step 6)
        const pipelineResult = await pipeline.run(targetUrl, {
            discoveryInput: {
                seed: discoverySeed
            }
        });
        const runtimeStatus = deriveRuntimeStatus(pipelineResult.execution_context);

        // 5. 琛ュ叏骞冲彴绾т换鍔″厓鏁版嵁锛屾弧瓒?AssetScanResult 鎺ュ彛鐨勫畬鏁存€ц姹?
        const finalResult: AssetScanResult = {
            result_id: `res_scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            task_id: task.task_id,
            task_type: task.task_type || "asset_scan",
            engine_type: task.engine_type || "asset_scan",
            status: runtimeStatus,

            // 缁ф壙娴佹按绾胯繑鍥炵殑鏍稿績涓氬姟鏁版嵁
            target: pipelineResult.target!,
            asset: pipelineResult.asset,
            network: pipelineResult.network,
            application: pipelineResult.application!,
            fingerprints: pipelineResult.fingerprints || {},
            inferred_attributes: pipelineResult.inferred_attributes || {},
            findings: pipelineResult.findings || [],
            execution_context: pipelineResult.execution_context
        };

        return finalResult;

    } catch (error) {
        console.error(`[Engine Error] Pipeline execution failed for task ${task.task_id}:`, error);
        const interruptionReason = deriveInterruptionReasonFromError(error);

        // 鍙戠敓涓ラ噸寮傚父鏃讹紝杩斿洖闄嶇骇鐨勭粨鏋?
        return {
            result_id: `res_err_${Date.now()}`,
            task_id: task.task_id,
            task_type: task.task_type || "asset_scan",
            engine_type: task.engine_type || "asset_scan",
            status: "failed",
            target: { target_type: "url", target_value: targetUrl },
            application: { http_endpoints: [], auth: { auth_detected: false, auth_type: "none" } },
            fingerprints: {},
            inferred_attributes: {},
            findings: [],
            execution_context: {
                audit: {
                    interruption_reason: interruptionReason
                }
            }
        };
    }
}
