import type { StaticAnalysisResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class SkillsStaticTaskAdapter implements TaskEngineAdapter<"static_analysis"> {
  taskType: "static_analysis";

  constructor() {
    this.taskType = "static_analysis";
  }

  createInitialDetails(task: Task): StaticAnalysisResultDetails {
    return {
      sample_name: task.target.display_name ?? task.target.target_value,
      rule_hits: []
    };
  }
}
