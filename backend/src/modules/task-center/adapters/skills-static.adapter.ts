import type { SkillsStaticAnalysisParameters, SkillsStaticResultDetails, SkillsStaticTarget } from "../../../../../shared/types/skills-static.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";
import type { SkillsStaticEngineOutput } from "../skills-static/skills-static-engine-output.ts";
import { normalizeSkillsStaticEngineOutput } from "../skills-static/skills-static-result-normalizer.ts";

export interface SkillsStaticEngineDispatchRequest {
  target: SkillsStaticTarget;
  analysis_parameters?: SkillsStaticAnalysisParameters;
}

export type SkillsStaticEngineResult = SkillsStaticEngineOutput;

export function mapSkillsStaticEngineResultToDetails(
  engineResult: SkillsStaticEngineOutput,
  task: Task
): SkillsStaticResultDetails {
  return normalizeSkillsStaticEngineOutput(engineResult, task);
}

export class SkillsStaticTaskAdapter implements TaskEngineAdapter<"static_analysis"> {
  taskType: "static_analysis";
  engineType: "skills_static";

  constructor() {
    this.taskType = "static_analysis";
    this.engineType = "skills_static";
  }

  createDispatchPayload(task: Task): SkillsStaticEngineDispatchRequest {
    return {
      target: task.target,
      analysis_parameters: task.parameters ? ({ ...task.parameters } as SkillsStaticAnalysisParameters) : undefined
    };
  }

  createInitialDetails(task: Task): SkillsStaticResultDetails {
    return {
      sample_name: task.target.display_name ?? task.target.target_value,
      rule_hits: []
    };
  }
}
