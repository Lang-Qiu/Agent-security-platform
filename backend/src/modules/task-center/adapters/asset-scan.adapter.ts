import type { AssetScanResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import { AssetFingerprintService } from "../asset-fingerprint/asset-fingerprint.service.ts";
import { AssetProbeService } from "../asset-fingerprint/asset-probe.service.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class AssetScanTaskAdapter implements TaskEngineAdapter<"asset_scan"> {
  taskType: "asset_scan";
  engineType: "asset_scan";
  fingerprintService: AssetFingerprintService;
  probeService: AssetProbeService;

  constructor(options?: { fingerprintService?: AssetFingerprintService; probeService?: AssetProbeService }) {
    this.taskType = "asset_scan";
    this.engineType = "asset_scan";
    this.fingerprintService = options?.fingerprintService ?? new AssetFingerprintService();
    this.probeService = options?.probeService ?? new AssetProbeService();
  }

  createDispatchPayload(task: Task) {
    return {
      target: task.target,
      scan_parameters: task.parameters ? { ...task.parameters } : undefined
    };
  }

  async createInitialDetails(task: Task): Promise<AssetScanResultDetails> {
    const sampleRef = typeof task.parameters?.sample_ref === "string" ? task.parameters.sample_ref : undefined;
    const probeMode = typeof task.parameters?.probe_mode === "string" ? task.parameters.probe_mode : undefined;
    const probeTargetId = typeof task.parameters?.probe_target_id === "string" ? task.parameters.probe_target_id : undefined;

    if (sampleRef) {
      return this.fingerprintService.createInitialDetailsFromSampleRef(sampleRef, task.target);
    }

    if (probeMode === "live" && probeTargetId) {
      const observation = await this.probeService.collectObservation(probeTargetId, task.target.target_value);

      if (observation) {
        return this.fingerprintService.createInitialDetailsFromObservation(observation, task.target);
      }
    }

    return {
      target: task.target,
      findings: []
    };
  }
}
