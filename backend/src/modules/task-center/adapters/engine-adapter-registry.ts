import type { TaskType } from "../../../../../shared/types/task.ts";
import { DomainError } from "../../../common/errors/domain-error.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class EngineAdapterRegistry {
  adaptersByTaskType: Map<TaskType, TaskEngineAdapter>;

  constructor(adapters: TaskEngineAdapter[]) {
    this.adaptersByTaskType = new Map(
      adapters.map((adapter) => [adapter.taskType, adapter as TaskEngineAdapter])
    );
  }

  getRequiredAdapter(taskType: TaskType): TaskEngineAdapter {
    const adapter = this.adaptersByTaskType.get(taskType);

    if (!adapter) {
      throw new DomainError(
        "No engine adapter is registered for the requested task type",
        "ENGINE_ADAPTER_NOT_FOUND",
        500
      );
    }

    return adapter;
  }
}
