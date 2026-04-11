import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import { ProcessAssetScanEngineClient } from "./asset-scan-engine-client.ts";
import type { AssetScanEngineClient } from "./asset-scan-engine-client.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class AssetScanTaskAdapter implements TaskEngineAdapter<"asset_scan"> {
  taskType: "asset_scan";
  engineType: "asset_scan";
  engineClient: AssetScanEngineClient;

  constructor(options?: { engineClient?: AssetScanEngineClient }) {
    this.taskType = "asset_scan";
    this.engineType = "asset_scan";
    this.engineClient = options?.engineClient ?? new ProcessAssetScanEngineClient();
  }

  createDispatchPayload(task: Task) {
    return {
      target: task.target,
      scan_parameters: task.parameters ? { ...task.parameters } : undefined
    };
  }

  async createInitialDetails(task: Task): Promise<AssetScanResultDetails> {
    const details = await this.engineClient.scan(task);

    if (details) {
      return details;
    }

    return {
      target: task.target,
      findings: []
    };
  }
}
