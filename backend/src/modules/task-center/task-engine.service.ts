import type { BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../shared/types/task.ts";
import { EngineAdapterRegistry } from "./adapters/engine-adapter-registry.ts";
import type { EngineDispatchTicket, TaskEngineAdapter } from "./adapters/engine-adapter.ts";

export const DEFAULT_PENDING_TASK_SUMMARY = "Task accepted and waiting for engine dispatch";

export interface TaskInitialArtifacts {
  result: BaseResult<ResultDetails>;
  riskSummary: RiskSummary;
}

export class TaskEngineService {
  adapterRegistry: EngineAdapterRegistry;

  constructor(options: { adapters: TaskEngineAdapter[] }) {
    this.adapterRegistry = new EngineAdapterRegistry(options.adapters);
  }

  createDispatchTicket(task: Task): EngineDispatchTicket {
    const adapter = this.adapterRegistry.getRequiredAdapter(task.task_type);

    return {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: adapter.engineType,
      payload: adapter.createDispatchPayload(task)
    };
  }

  createInitialArtifacts(task: Task): TaskInitialArtifacts {
    const adapter = this.adapterRegistry.getRequiredAdapter(task.task_type);
    const summary = task.summary ?? DEFAULT_PENDING_TASK_SUMMARY;

    const result: BaseResult<ResultDetails> = {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: task.engine_type,
      status: task.status,
      risk_level: task.risk_level ?? "info",
      summary,
      details: adapter.createInitialDetails(task),
      created_at: task.created_at,
      updated_at: task.updated_at
    };

    const riskSummary: RiskSummary = {
      task_id: task.task_id,
      task_type: task.task_type,
      status: task.status,
      risk_level: task.risk_level ?? "info",
      summary,
      total_findings: 0,
      info_count: 0,
      low_count: 0,
      medium_count: 0,
      high_count: 0,
      critical_count: 0,
      updated_at: task.updated_at
    };

    if (task.task_type === "sandbox_run") {
      riskSummary.blocked_count = 0;
    }

    return {
      result,
      riskSummary
    };
  }
}
