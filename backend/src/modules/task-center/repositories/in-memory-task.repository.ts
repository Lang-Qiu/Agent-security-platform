import type { TaskRepository, StoredTaskRecord } from "./task.repository.ts";

export class InMemoryTaskRepository implements TaskRepository {
  records: Map<string, StoredTaskRecord>;

  constructor() {
    this.records = new Map<string, StoredTaskRecord>();
  }

  save(record: StoredTaskRecord): StoredTaskRecord {
    this.records.set(record.task.task_id, record);
    return record;
  }

  list(): StoredTaskRecord[] {
    return Array.from(this.records.values());
  }

  findById(taskId: string): StoredTaskRecord | null {
    return this.records.get(taskId) ?? null;
  }

  // R19 (Phase 2 rework review 2 P1 #2): rollback support.
  delete(taskId: string): boolean {
    return this.records.delete(taskId);
  }
}
