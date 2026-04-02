import type { ResultDetailsByTaskType } from "../../../../../shared/types/result.ts";
import type { SkillsStaticAnalysisParameters, SkillsStaticTarget } from "../../../../../shared/types/skills-static.ts";
import type { EngineType, Task, TaskTarget, TaskType } from "../../../../../shared/types/task.ts";

export interface EngineDispatchPayloadByTaskType {
  asset_scan: {
    target: TaskTarget;
    scan_parameters?: Record<string, unknown>;
  };
  static_analysis: {
    target: SkillsStaticTarget;
    analysis_parameters?: SkillsStaticAnalysisParameters;
  };
  sandbox_run: {
    target: TaskTarget;
    runtime_parameters?: Record<string, unknown>;
  };
}

export interface EngineDispatchTicket<TTaskType extends TaskType = TaskType> {
  task_id: string;
  task_type: TTaskType;
  engine_type: EngineType;
  payload: EngineDispatchPayloadByTaskType[TTaskType];
}

export interface TaskEngineAdapter<TTaskType extends TaskType = TaskType> {
  taskType: TTaskType;
  engineType: EngineType;
  createDispatchPayload(task: Task): EngineDispatchPayloadByTaskType[TTaskType];
  createInitialDetails(task: Task): ResultDetailsByTaskType[TTaskType] | Promise<ResultDetailsByTaskType[TTaskType]>;
}
