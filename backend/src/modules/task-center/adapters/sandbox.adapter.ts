import type { SandboxRunResultDetails } from "../../../../../shared/types/result.ts";
import type { Task } from "../../../../../shared/types/task.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class SandboxTaskAdapter implements TaskEngineAdapter<"sandbox_run"> {
  taskType: "sandbox_run";

  constructor() {
    this.taskType = "sandbox_run";
  }

  createInitialDetails(task: Task): SandboxRunResultDetails {
    return {
      session_id: task.target.target_value,
      alerts: [],
      blocked: false
    };
  }
}
