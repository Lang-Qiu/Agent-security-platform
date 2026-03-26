import type { StaticAnalysisResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class SkillsStaticTaskAdapter implements TaskEngineAdapter<"static_analysis"> {
  taskType: "static_analysis";
  engineType: "skills_static";

  constructor() {
    this.taskType = "static_analysis";
    this.engineType = "skills_static";
  }

  createDispatchPayload(task: Task) {
    return {
      target: task.target,
      analysis_parameters: task.parameters ? { ...task.parameters } : undefined
    };
  }

  createInitialDetails(task: Task): StaticAnalysisResultDetails {
    return {
      sample_name: task.target.display_name ?? task.target.target_value,
      rule_hits: []
    };
  }
}
