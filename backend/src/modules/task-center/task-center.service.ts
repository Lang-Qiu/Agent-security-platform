import type { BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../shared/types/task.ts";
import { TASK_TYPE_TO_ENGINE_TYPE } from "../../../../shared/constants/task-type.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import type { CreateTaskRequest } from "./dto/create-task.request.ts";
import type { TaskEngineAdapter } from "./adapters/engine-adapter.ts";
import type { TaskRepository, StoredTaskRecord } from "./repositories/task.repository.ts";

const INITIAL_TASK_SUMMARY = "Task accepted and waiting for engine dispatch";

export class TaskCenterService {
  repository: TaskRepository;
  adaptersByTaskType: Map<string, TaskEngineAdapter>;
  now: () => string;
  nextTaskId: () => string;

  constructor(options: {
    repository: TaskRepository;
    adapters: TaskEngineAdapter[];
    now?: () => string;
    nextTaskId?: () => string;
  }) {
    this.repository = options.repository;
    this.adaptersByTaskType = new Map(options.adapters.map((adapter) => [adapter.taskType, adapter]));
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextTaskId =
      options.nextTaskId ??
      (() => `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);
  }

  createTask(input: CreateTaskRequest): Task {
    const timestamp = this.now();
    const taskId = this.nextTaskId();
    const engineType = TASK_TYPE_TO_ENGINE_TYPE[input.task_type];
    const task: Task = {
      task_id: taskId,
      task_type: input.task_type,
      engine_type: engineType,
      status: "pending",
      title: input.title,
      target: input.target,
      risk_level: "info",
      summary: INITIAL_TASK_SUMMARY,
      created_at: timestamp,
      updated_at: timestamp
    };

    if (input.requested_by) {
      task.requested_by = input.requested_by;
    }

    if (input.parameters) {
      task.parameters = { ...input.parameters };
    }

    const adapter = this.adaptersByTaskType.get(input.task_type);

    if (!adapter) {
      throw new DomainError("No engine adapter is registered for the requested task type", "ENGINE_ADAPTER_NOT_FOUND", 500);
    }

    const result: BaseResult<ResultDetails> = {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: task.engine_type,
      status: task.status,
      risk_level: "info",
      summary: INITIAL_TASK_SUMMARY,
      details: adapter.createInitialDetails(task),
      created_at: timestamp,
      updated_at: timestamp
    };

    const riskSummary: RiskSummary = {
      task_id: task.task_id,
      task_type: task.task_type,
      status: task.status,
      risk_level: "info",
      summary: INITIAL_TASK_SUMMARY,
      total_findings: 0,
      info_count: 0,
      low_count: 0,
      medium_count: 0,
      high_count: 0,
      critical_count: 0,
      updated_at: timestamp
    };

    if (task.task_type === "sandbox_run") {
      riskSummary.blocked_count = 0;
    }

    this.repository.save({
      task,
      result,
      riskSummary
    });

    return task;
  }

  listTasks(): Task[] {
    return this.repository.list().map((record) => record.task);
  }

  getTaskById(taskId: string): Task {
    return this.getRecordOrThrow(taskId).task;
  }

  getTaskResult(taskId: string): BaseResult<ResultDetails> {
    return this.getRecordOrThrow(taskId).result;
  }

  getRiskSummary(taskId: string): RiskSummary {
    return this.getRecordOrThrow(taskId).riskSummary;
  }

  getRecordOrThrow(taskId: string): StoredTaskRecord {
    const record = this.repository.findById(taskId);

    if (!record) {
      throw new DomainError("Task not found", "TASK_NOT_FOUND", 404);
    }

    return record;
  }
}
