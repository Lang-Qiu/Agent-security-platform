import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 引入公共类型契约
import type { Task } from "../../../../shared/types/task.ts";
import type { AssetScanResult } from "../../../../shared/types/asset-scan.ts";

// 引入重构好的流水线
import { AssetScanPipeline } from "./pipeline.ts";

export async function runAssetScanTask(task: Task): Promise<AssetScanResult> {
    // 1. 解析工作区根目录，确保 Pipeline 能准确找到 rules/ 目录下的 yaml 文件
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = resolve(currentDir, "../../../..");

    // 2. 实例化扫描流水线
    const pipeline = new AssetScanPipeline(workspaceRoot);

    // 3. 从标准 Task 契约中提取探测目标
    if (!task.target || !task.target.target_value) {
        throw new Error("Task target is missing or invalid.");
    }
    const targetUrl = task.target.target_value;

    try {
        // 4. 执行底层测绘流水线 (Step 4 ~ Step 6)(Step 1 ~ Step 3 )
        const pipelineResult = await pipeline.run(targetUrl);

        // 5. 补全平台级任务元数据，满足 AssetScanResult 接口的完整性要求
        const finalResult: AssetScanResult = {
            result_id: `res_scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            task_id: task.task_id,
            task_type: task.task_type || "asset_scan",
            engine_type: task.engine_type || "asset_scan",
            status: "finished",
            
            // 继承流水线返回的核心业务数据
            target: pipelineResult.target!,
            asset: pipelineResult.asset,
            network: pipelineResult.network,
            application: pipelineResult.application!,
            fingerprints: pipelineResult.fingerprints || {},
            inferred_attributes: pipelineResult.inferred_attributes || {},
            findings: pipelineResult.findings || []
        };

        return finalResult;

    } catch (error) {
        console.error(`[Engine Error] Pipeline execution failed for task ${task.task_id}:`, error);
        
        // 发生严重异常时，返回降级的结果
        return {
            result_id: `res_err_${Date.now()}`,
            task_id: task.task_id,
            status: "failed",
            target: { target_type: "url", target_value: targetUrl },
            application: { http_endpoints: [], auth: { auth_detected: false, auth_type: "none" } },
            fingerprints: {},
            inferred_attributes: {},
            findings: []
        };
    }
}