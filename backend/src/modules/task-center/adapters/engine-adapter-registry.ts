import type { TaskType } from "../../../../../shared/types/task.ts";
import { DomainError } from "../../../common/errors/domain-error.ts";
import type { TaskEngineAdapter } from "./engine-adapter.ts";

export class EngineAdapterRegistry {
  adaptersByTaskType: Map<TaskType, TaskEngineAdapter>;

  constructor(adapters: TaskEngineAdapter[]) {
    this.adaptersByTaskType = new Map();

    for (const adapter of adapters) {
      if (this.adaptersByTaskType.has(adapter.taskType)) {
        throw new DomainError(
          "An engine adapter is already registered for the requested task type",
          "ENGINE_ADAPTER_DUPLICATE_REGISTRATION",
          500
        );
      }

      this.adaptersByTaskType.set(adapter.taskType, adapter as TaskEngineAdapter);
    }
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
