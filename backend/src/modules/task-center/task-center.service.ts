import type { BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../shared/types/task.ts";
import { TASK_TYPE_TO_ENGINE_TYPE } from "../../../../shared/constants/task-type.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import type { CreateTaskRequest } from "./dto/create-task.request.ts";
import type { TaskEngineAdapter } from "./adapters/engine-adapter.ts";
import type { TaskRepository, StoredTaskRecord } from "./repositories/task.repository.ts";
import { DEFAULT_PENDING_TASK_SUMMARY, TaskEngineService } from "./task-engine.service.ts";

export class TaskCenterService {
  repository: TaskRepository;
  taskEngineService: TaskEngineService;
  now: () => string;
  nextTaskId: () => string;

  constructor(options: {
    repository: TaskRepository;
    adapters?: TaskEngineAdapter[];
    taskEngineService?: TaskEngineService;
    now?: () => string;
    nextTaskId?: () => string;
  }) {
    this.repository = options.repository;
    this.taskEngineService =
      options.taskEngineService ??
      new TaskEngineService({
        adapters: options.adapters ?? []
      });
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextTaskId =
      options.nextTaskId ??
      (() => `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);
  }

  async createTask(input: CreateTaskRequest): Promise<Task> {
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
      summary: DEFAULT_PENDING_TASK_SUMMARY,
      created_at: timestamp,
      updated_at: timestamp
    };

    if (input.requested_by) {
      task.requested_by = input.requested_by;
    }

    if (input.parameters) {
      task.parameters = { ...input.parameters };
    }

    const { result, riskSummary } = await this.taskEngineService.createInitialArtifacts(task);

    this.repository.save({
      task,
      result,
      riskSummary
    });

    if (this.taskEngineService.hasRegisteredClient(task)) {
      const dispatchReceipt = await this.taskEngineService.dispatchTask(task);

      if (task.task_type === "static_analysis" && dispatchReceipt.mock_result) {
        this.repository.save(
          this.taskEngineService.createCompletedStaticAnalysisArtifacts(task, dispatchReceipt.mock_result, this.now())
        );
      }
    }

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
