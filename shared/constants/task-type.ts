import type { EngineType } from "../types/task.ts";

export const TASK_TYPES = ["asset_scan", "static_analysis", "sandbox_run"] as const;

export const TASK_TYPE_TO_ENGINE_TYPE: Record<(typeof TASK_TYPES)[number], EngineType> = {
  asset_scan: "asset_scan",
  static_analysis: "skills_static",
  sandbox_run: "sandbox"
};
