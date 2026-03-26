import type { BaseResult, ResultDetails } from "../../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../../shared/types/task.ts";

export interface StoredTaskRecord {
  task: Task;
  result: BaseResult<ResultDetails>;
  riskSummary: RiskSummary;
}

export interface TaskRepository {
  save(record: StoredTaskRecord): StoredTaskRecord;
  list(): StoredTaskRecord[];
  findById(taskId: string): StoredTaskRecord | null;
}
