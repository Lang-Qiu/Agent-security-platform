import type { ResultDetailsByTaskType } from "../../../../../shared/types/result.ts";
import type { Task, TaskType } from "../../../../../shared/types/task.ts";

export interface TaskEngineAdapter<TTaskType extends TaskType = TaskType> {
  taskType: TTaskType;
  createInitialDetails(task: Task): ResultDetailsByTaskType[TTaskType];
}
