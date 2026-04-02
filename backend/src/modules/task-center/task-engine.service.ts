import type { BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskLevel, RiskSummary, Task } from "../../../../shared/types/task.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import { mapSkillsStaticEngineResultToDetails } from "./adapters/skills-static.adapter.ts";
import { EngineAdapterRegistry } from "./adapters/engine-adapter-registry.ts";
import type { EngineDispatchTicket, TaskEngineAdapter } from "./adapters/engine-adapter.ts";
import type { SkillsStaticMockResult } from "./adapters/skills-static.adapter.ts";
import { EngineClientRegistry } from "./clients/engine-client-registry.ts";
import type { EngineClient, EngineClientDispatchReceipt } from "./clients/engine-client.ts";

export const DEFAULT_PENDING_TASK_SUMMARY = "Task accepted and waiting for engine dispatch";

export interface TaskInitialArtifacts {
  result: BaseResult<ResultDetails>;
  riskSummary: RiskSummary;
}

export interface TaskCompletedArtifacts {
  task: Task;
  result: BaseResult<ResultDetails>;
  riskSummary: RiskSummary;
}

const RISK_LEVEL_PRIORITY: RiskLevel[] = ["info", "low", "medium", "high", "critical"];

function createStaticAnalysisCompletionSummary(totalFindings: number): string {
  return `Static analysis finished with ${totalFindings} rule hit${totalFindings === 1 ? "" : "s"}`;
}

function getHighestRiskLevel(ruleLevels: Array<RiskLevel | undefined>): RiskLevel {
  let highestRiskLevel: RiskLevel = "info";

  for (const riskLevel of ruleLevels) {
    if (!riskLevel) {
      continue;
    }

    if (RISK_LEVEL_PRIORITY.indexOf(riskLevel) > RISK_LEVEL_PRIORITY.indexOf(highestRiskLevel)) {
      highestRiskLevel = riskLevel;
    }
  }

  return highestRiskLevel;
}

export class TaskEngineService {
  adapterRegistry: EngineAdapterRegistry;
  engineClientRegistry: EngineClientRegistry;

  constructor(options: { adapters: TaskEngineAdapter[]; engineClients?: EngineClient[] }) {
    this.adapterRegistry = new EngineAdapterRegistry(options.adapters);
    this.engineClientRegistry = new EngineClientRegistry(options.engineClients ?? []);
  }

  getValidatedAdapter(task: Task): TaskEngineAdapter {
    const adapter = this.adapterRegistry.getRequiredAdapter(task.task_type);

    if (task.engine_type !== adapter.engineType) {
      throw new DomainError(
        "The registered engine adapter does not match the task engine type",
        "ENGINE_ADAPTER_ENGINE_TYPE_MISMATCH",
        500
      );
    }

    return adapter;
  }

  createDispatchTicket(task: Task): EngineDispatchTicket {
    const adapter = this.getValidatedAdapter(task);

    return {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: adapter.engineType,
      payload: adapter.createDispatchPayload(task)
    };
  }

  getValidatedClient(task: Task): EngineClient {
    const client = this.engineClientRegistry.getRequiredClient(task.engine_type);

    if (client.engineType !== task.engine_type) {
      throw new DomainError(
        "The registered engine client does not match the task engine type",
        "ENGINE_CLIENT_ENGINE_TYPE_MISMATCH",
        500
      );
    }

    return client;
  }

  hasRegisteredClient(task: Task): boolean {
    return this.engineClientRegistry.hasClient(task.engine_type);
  }

  async dispatchTask(task: Task): Promise<EngineClientDispatchReceipt> {
    const ticket = this.createDispatchTicket(task);
    const client = this.getValidatedClient(task);
    return client.dispatch(ticket);
  }

  async createInitialArtifacts(task: Task): Promise<TaskInitialArtifacts> {
    const adapter = this.getValidatedAdapter(task);
    const summary = task.summary ?? DEFAULT_PENDING_TASK_SUMMARY;
    const initialDetails = await adapter.createInitialDetails(task);

    const result: BaseResult<ResultDetails> = {
      task_id: task.task_id,
      task_type: task.task_type,
      engine_type: task.engine_type,
      status: task.status,
      risk_level: task.risk_level ?? "info",
      summary,
      details: initialDetails,
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

  createCompletedStaticAnalysisArtifacts(task: Task, mockResult: SkillsStaticMockResult, updatedAt: string): TaskCompletedArtifacts {
    const details = mapSkillsStaticEngineResultToDetails(mockResult, task);
    const ruleHits = details.rule_hits ?? [];
    const riskLevel = getHighestRiskLevel(ruleHits.map((ruleHit) => ruleHit.severity));
    const summary = createStaticAnalysisCompletionSummary(ruleHits.length);

    return {
      task: {
        ...task,
        status: "finished",
        risk_level: riskLevel,
        summary,
        updated_at: updatedAt
      },
      result: {
        task_id: task.task_id,
        task_type: task.task_type,
        engine_type: task.engine_type,
        status: "finished",
        risk_level: riskLevel,
        summary,
        details,
        created_at: task.created_at,
        updated_at: updatedAt
      },
      riskSummary: {
        task_id: task.task_id,
        task_type: task.task_type,
        status: "finished",
        risk_level: riskLevel,
        summary,
        total_findings: ruleHits.length,
        info_count: ruleHits.filter((ruleHit) => ruleHit.severity === "info").length,
        low_count: ruleHits.filter((ruleHit) => ruleHit.severity === "low").length,
        medium_count: ruleHits.filter((ruleHit) => ruleHit.severity === "medium").length,
        high_count: ruleHits.filter((ruleHit) => ruleHit.severity === "high").length,
        critical_count: ruleHits.filter((ruleHit) => ruleHit.severity === "critical").length,
        updated_at: updatedAt
      }
    };
  }
}
