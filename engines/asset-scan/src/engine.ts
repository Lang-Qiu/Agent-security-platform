import { runAssetScanTask } from "./runtime/run-task.ts";

export async function runAssetScan(target: string) {
    const now = new Date().toISOString();
    const task = {
        task_id: `engine_asset_scan_${Date.now()}`,
        task_type: "asset_scan",
        engine_type: "asset_scan",
        status: "pending",
        title: "Engine standalone asset scan",
        target: {
            target_type: "url",
            target_value: target
        },
        parameters: {
            probe_mode: "live",
            probe_target_id: "ollama",
            probe_port_hint: 11434
        },
        created_at: now,
        updated_at: now
    } satisfies Parameters<typeof runAssetScanTask>[0];

    const details = await runAssetScanTask(task);

    return {
        task_id: task.task_id,
        task_type: task.task_type,
        engine_type: task.engine_type,
        status: "finished",
        risk_level: "low",
        summary: "Asset scan completed",
        created_at: now,
        updated_at: now,
        details
    };
}