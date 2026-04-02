import type { BaseResult } from "./result.ts";
import type { SkillsStaticEngineType, SkillsStaticTaskStatus, SkillsStaticTaskType } from "./skills-static.ts";
import type { SkillsStaticResultDetails } from "./skills-static-result-details.ts";

export type SkillsStaticBaseResult = BaseResult<SkillsStaticResultDetails> & {
  task_type: SkillsStaticTaskType;
  engine_type: SkillsStaticEngineType;
  status: SkillsStaticTaskStatus;
};
