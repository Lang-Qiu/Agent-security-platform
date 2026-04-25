import type { SkillsStaticExecutionPhase, SkillsStaticExecutionReason } from "./skills-static-execution-error.ts";

export type SkillsStaticRuntimeEventType =
  | "provider_selected"
  | "scan_started"
  | "scan_succeeded"
  | "scan_failed";

export interface SkillsStaticRuntimeLogEvent {
  event: SkillsStaticRuntimeEventType;
  task_id: string;
  engine_type: "skills_static";
  provider: string;
  target_ref: string;
  phase?: SkillsStaticExecutionPhase;
  reason?: SkillsStaticExecutionReason;
  error_summary?: string;
}

export type SkillsStaticRuntimeLogSink = (event: SkillsStaticRuntimeLogEvent) => void | Promise<void>;

export function defaultSkillsStaticRuntimeLogSink(event: SkillsStaticRuntimeLogEvent): void {
  const logLine = `[skills-static] ${JSON.stringify(event)}`;

  if (event.event === "scan_failed") {
    console.error(logLine);
    return;
  }

  console.info(logLine);
}
