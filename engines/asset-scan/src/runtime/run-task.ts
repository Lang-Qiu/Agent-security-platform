import type { AssetScanResultDetails } from "../../../../shared/types/result.ts";
import type { Task } from "../../../../shared/types/task.ts";
import { EngineAssetFingerprintService } from "./asset-fingerprint.service.ts";
import { EngineAssetProbeService } from "./asset-probe.service.ts";

export async function runAssetScanTask(task: Task): Promise<AssetScanResultDetails> {
  const fingerprintService = new EngineAssetFingerprintService();
  const probeService = new EngineAssetProbeService();

  const sampleRef = typeof task.parameters?.sample_ref === "string" ? task.parameters.sample_ref : undefined;
  const probeMode = typeof task.parameters?.probe_mode === "string" ? task.parameters.probe_mode : undefined;
  const probeTargetId = typeof task.parameters?.probe_target_id === "string" ? task.parameters.probe_target_id : undefined;
  const probePortHint = typeof task.parameters?.probe_port_hint === "number" ? task.parameters.probe_port_hint : undefined;

  if (sampleRef) {
    return fingerprintService.createInitialDetailsFromSampleRef(sampleRef, task.target);
  }

  if (probeMode === "live" && probeTargetId) {
    const observation = await probeService.collectObservation(probeTargetId, task.target.target_value, {
      portHint: probePortHint
    });

    if (observation) {
      return fingerprintService.createInitialDetailsFromObservation(observation, task.target);
    }
  }

  return {
    target: task.target,
    findings: []
  };
}
