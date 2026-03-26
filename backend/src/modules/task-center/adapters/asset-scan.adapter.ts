import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class AssetScanTaskAdapter implements TaskEngineAdapter<"asset_scan"> {
  taskType: "asset_scan";
  engineType: "asset_scan";

  constructor() {
    this.taskType = "asset_scan";
    this.engineType = "asset_scan";
  }

  createDispatchPayload(task: Task) {
    return {
      target: task.target,
      scan_parameters: task.parameters ? { ...task.parameters } : undefined
    };
  }

  createInitialDetails(task: Task): AssetScanResultDetails {
    return {
      target: task.target,
      findings: []
    };
  }
}
