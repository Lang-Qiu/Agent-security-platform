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
}
