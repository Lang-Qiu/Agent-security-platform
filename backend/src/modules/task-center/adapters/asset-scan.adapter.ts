import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import { AssetFingerprintService } from "../asset-fingerprint/asset-fingerprint.service.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class AssetScanTaskAdapter implements TaskEngineAdapter<"asset_scan"> {
  taskType: "asset_scan";
  engineType: "asset_scan";
  fingerprintService: AssetFingerprintService;

  constructor(options?: { fingerprintService?: AssetFingerprintService }) {
    this.taskType = "asset_scan";
    this.engineType = "asset_scan";
    this.fingerprintService = options?.fingerprintService ?? new AssetFingerprintService();
  }

  createDispatchPayload(task: Task) {
    return {
      target: task.target,
      scan_parameters: task.parameters ? { ...task.parameters } : undefined
    };
  }

  createInitialDetails(task: Task): AssetScanResultDetails {
    const sampleRef = typeof task.parameters?.sample_ref === "string" ? task.parameters.sample_ref : undefined;

    if (sampleRef) {
      return this.fingerprintService.createInitialDetailsFromSampleRef(sampleRef, task.target);
    }

    return {
      target: task.target,
      findings: []
    };
  }
}
