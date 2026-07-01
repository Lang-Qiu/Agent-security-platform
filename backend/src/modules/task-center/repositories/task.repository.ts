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
  // R27 (Phase 2 rework review 3 P1 #3): find a task by session_id. The
  // supervision API groups every task globally by session_id, so the
  // ingest service must reject a session_id already owned by another
  // task (from a different campaign) to prevent SUPERVISION_SESSION_AMBIGUOUS.
  findBySessionId(sessionId: string): StoredTaskRecord | null;
}
