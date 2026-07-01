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
  // R19 (Phase 2 rework review 2 P1 #2): delete a task record so the
  // ingest service can roll back a task save when the campaign save fails.
  delete(taskId: string): boolean;
}
