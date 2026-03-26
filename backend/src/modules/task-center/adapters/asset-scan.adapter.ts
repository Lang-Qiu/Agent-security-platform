import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class AssetScanTaskAdapter implements TaskEngineAdapter<"asset_scan"> {
  taskType: "asset_scan";

  constructor() {
    this.taskType = "asset_scan";
  }

  createInitialDetails(task: Task): AssetScanResultDetails {
    return {
      target: task.target,
      findings: []
    };
  }
}
