import type { BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../shared/types/task.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import { EngineAdapterRegistry } from "./adapters/engine-adapter-registry.ts";
import type { EngineDispatchTicket, TaskEngineAdapter } from "./adapters/engine-adapter.ts";
import type { SkillsStaticResultDetails } from "../../../../shared/types/result.ts";
import { EngineClientRegistry } from "./clients/engine-client-registry.ts";
import type { EngineClient, EngineClientDispatchReceipt } from "./clients/engine-client.ts";
import { deriveStaticAnalysisRiskSummary } from "./skills-static/risk-summary-deriver.ts";
import { type SkillsStaticExecutionPhase } from "./skills-static/skills-static-execution-error.ts";

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

function createStaticAnalysisCompletionSummary(totalFindings: number): string {
  return `Static analysis finished with ${totalFindings} rule hit${totalFindings === 1 ? "" : "s"}`;
}

function createStaticAnalysisFailureSummary(phase: SkillsStaticExecutionPhase): string {
  switch (phase) {
    case "provider_selection":
      return "Static analysis failed during provider selection";
    case "runner":
      return "Static analysis failed during engine execution";
    case "mapper":
      return "Static analysis failed during result mapping";
    case "normalizer":
      return "Static analysis failed during result normalization";
    case "deriver":
      return "Static analysis failed during risk summary derivation";
    default:
      return "Static analysis failed";
  }
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

  createCompletedStaticAnalysisArtifacts(
    task: Task,
    details: SkillsStaticResultDetails,
    updatedAt: string
  ): TaskCompletedArtifacts {
    const derivedSummary = deriveStaticAnalysisRiskSummary(details);
    const summary = createStaticAnalysisCompletionSummary(derivedSummary.total_findings);

    return {
      task: {
        ...task,
        status: "finished",
        risk_level: derivedSummary.risk_level,
        summary,
        updated_at: updatedAt
      },
      result: {
        task_id: task.task_id,
        task_type: task.task_type,
        engine_type: task.engine_type,
        status: "finished",
        risk_level: derivedSummary.risk_level,
        summary,
        details,
        created_at: task.created_at,
        updated_at: updatedAt
      },
      riskSummary: {
        task_id: task.task_id,
        task_type: task.task_type,
        status: "finished",
        risk_level: derivedSummary.risk_level,
        summary,
        total_findings: derivedSummary.total_findings,
        info_count: derivedSummary.info_count,
        low_count: derivedSummary.low_count,
        medium_count: derivedSummary.medium_count,
        high_count: derivedSummary.high_count,
        critical_count: derivedSummary.critical_count,
        updated_at: updatedAt
      }
    };
  }

  createFailedStaticAnalysisArtifacts(task: Task, updatedAt: string, phase: SkillsStaticExecutionPhase): TaskCompletedArtifacts {
    const summary = createStaticAnalysisFailureSummary(phase);
    const details: SkillsStaticResultDetails = {
      sample_name: task.target.display_name ?? task.target.target_value,
      rule_hits: []
    };

    return {
      task: {
        ...task,
        status: "failed",
        risk_level: "info",
        summary,
        updated_at: updatedAt
      },
      result: {
        task_id: task.task_id,
        task_type: task.task_type,
        engine_type: task.engine_type,
        status: "failed",
        risk_level: "info",
        summary,
        details,
        created_at: task.created_at,
        updated_at: updatedAt
      },
      riskSummary: {
        task_id: task.task_id,
        task_type: task.task_type,
        status: "failed",
        risk_level: "info",
        summary,
        total_findings: 0,
        info_count: 0,
        low_count: 0,
        medium_count: 0,
        high_count: 0,
        critical_count: 0,
        updated_at: updatedAt
      }
    };
  }
}
