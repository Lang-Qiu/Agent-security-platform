export const SKILLS_STATIC_TASK_TYPE = "static_analysis";
export const SKILLS_STATIC_ENGINE_TYPE = "skills_static";
export const SKILLS_STATIC_TASK_STATUSES = ["pending", "running", "finished", "failed", "partial_success"] as const;
export const SKILLS_STATIC_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type SkillsStaticTaskType = typeof SKILLS_STATIC_TASK_TYPE;
export type SkillsStaticEngineType = typeof SKILLS_STATIC_ENGINE_TYPE;
export type SkillsStaticTaskStatus = (typeof SKILLS_STATIC_TASK_STATUSES)[number];

export type * from "./skills-static-target.ts";
export type * from "./skills-static-parameters.ts";
export type * from "./skills-static-rule-hit.ts";
export type * from "./skills-static-result-details.ts";
export type * from "./skills-static-result.ts";
