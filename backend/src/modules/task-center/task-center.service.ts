import type { AssetScanResultDetails, BaseResult, ResultDetails } from "../../../../shared/types/result.ts";
import type { RiskSummary, Task } from "../../../../shared/types/task.ts";
import { TASK_TYPE_TO_ENGINE_TYPE } from "../../../../shared/constants/task-type.ts";
import { DomainError } from "../../common/errors/domain-error.ts";
import type { CreateTaskRequest } from "./dto/create-task.request.ts";
import type { TaskEngineAdapter } from "./adapters/engine-adapter.ts";
import type { TaskRepository, StoredTaskRecord } from "./repositories/task.repository.ts";
import { normalizeSkillsStaticEngineOutput } from "./skills-static/skills-static-result-normalizer.ts";
import {
  SkillsStaticExecutionError,
  type SkillsStaticExecutionPhase
} from "./skills-static/skills-static-execution-error.ts";
import {
  defaultSkillsStaticRuntimeLogSink,
  type SkillsStaticRuntimeLogSink
} from "./skills-static/skills-static-runtime-log.ts";
import { DEFAULT_PENDING_TASK_SUMMARY, TaskEngineService } from "./task-engine.service.ts";

const ASSET_SCAN_MIN_MAX_TARGETS = 1;
const ASSET_SCAN_MAX_MAX_TARGETS = 5000;
const ASSET_SCAN_DEFAULT_MAX_TARGETS = 100;
const ASSET_SCAN_MIN_MAX_PORTS_PER_TARGET = 1;
const ASSET_SCAN_MAX_MAX_PORTS_PER_TARGET = 128;
const ASSET_SCAN_DEFAULT_MAX_PORTS_PER_TARGET = 24;
const ASSET_SCAN_MIN_MAX_RUNTIME_SECONDS = 60;
const ASSET_SCAN_MAX_MAX_RUNTIME_SECONDS = 7200;
const ASSET_SCAN_DEFAULT_MAX_RUNTIME_SECONDS = 900;
const ASSET_SCAN_MIN_TARGET_HTTP_RPS_CAP = 1;
const ASSET_SCAN_MAX_TARGET_HTTP_RPS_CAP = 20;
const ASSET_SCAN_DEFAULT_TARGET_HTTP_RPS_CAP = 2;
const ASSET_SCAN_MIN_TCP_CONCURRENCY_PER_TARGET = 1;
const ASSET_SCAN_MAX_TCP_CONCURRENCY_PER_TARGET = 64;
const ASSET_SCAN_DEFAULT_TCP_CONCURRENCY_PER_TARGET = 10;
const ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS = ["none", "budget", "timeout", "manual_stop"] as const;
type AssetScanInterruptionReason = (typeof ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeIntegerWithinRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const roundedValue = Math.floor(numericValue);

  if (roundedValue < minimum) {
    return minimum;
  }

  if (roundedValue > maximum) {
    return maximum;
  }

  return roundedValue;
}

function normalizeAssetScanParameters(
  parameters: Record<string, unknown> | undefined,
  requestedBy: string | undefined,
  requestedAt: string
): Record<string, unknown> {
  const normalizedParameters: Record<string, unknown> = {
    ...(parameters ?? {})
  };

  normalizedParameters.max_targets = normalizeIntegerWithinRange(
    normalizedParameters.max_targets,
    ASSET_SCAN_MIN_MAX_TARGETS,
    ASSET_SCAN_MAX_MAX_TARGETS,
    ASSET_SCAN_DEFAULT_MAX_TARGETS
  );
  normalizedParameters.max_ports_per_target = normalizeIntegerWithinRange(
    normalizedParameters.max_ports_per_target,
    ASSET_SCAN_MIN_MAX_PORTS_PER_TARGET,
    ASSET_SCAN_MAX_MAX_PORTS_PER_TARGET,
    ASSET_SCAN_DEFAULT_MAX_PORTS_PER_TARGET
  );
  normalizedParameters.max_runtime_seconds = normalizeIntegerWithinRange(
    normalizedParameters.max_runtime_seconds,
    ASSET_SCAN_MIN_MAX_RUNTIME_SECONDS,
    ASSET_SCAN_MAX_MAX_RUNTIME_SECONDS,
    ASSET_SCAN_DEFAULT_MAX_RUNTIME_SECONDS
  );
  normalizedParameters.target_http_rps_cap = normalizeIntegerWithinRange(
    normalizedParameters.target_http_rps_cap,
    ASSET_SCAN_MIN_TARGET_HTTP_RPS_CAP,
    ASSET_SCAN_MAX_TARGET_HTTP_RPS_CAP,
    ASSET_SCAN_DEFAULT_TARGET_HTTP_RPS_CAP
  );
  normalizedParameters.max_tcp_concurrency_per_target = normalizeIntegerWithinRange(
    normalizedParameters.max_tcp_concurrency_per_target,
    ASSET_SCAN_MIN_TCP_CONCURRENCY_PER_TARGET,
    ASSET_SCAN_MAX_TCP_CONCURRENCY_PER_TARGET,
    ASSET_SCAN_DEFAULT_TCP_CONCURRENCY_PER_TARGET
  );

  const query = readOptionalString(normalizedParameters.query);
  const source = readOptionalString(normalizedParameters.source);
  const existingAudit = isPlainObject(normalizedParameters.audit) ? normalizedParameters.audit : {};
  const interruptionReason = readOptionalString(existingAudit.interruption_reason);
  const audit: Record<string, unknown> = {
    ...existingAudit,
    requested_at: requestedAt,
    interruption_reason:
      interruptionReason && (ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(interruptionReason)
        ? interruptionReason
        : "none"
  };

  if (query) {
    normalizedParameters.query = query;
    audit.query = query;
  }

  if (source) {
    normalizedParameters.source = source;
    audit.source = source;
  }

  if (requestedBy) {
    audit.requested_by = requestedBy;
  }

  normalizedParameters.audit = audit;

  return normalizedParameters;
}

function attachAssetScanExecutionContext(
  details: AssetScanResultDetails,
  parameters: Record<string, unknown> | undefined
): AssetScanResultDetails {
  if (!parameters) {
    return details;
  }

  const existingExecutionContext =
    isPlainObject((details as Record<string, unknown>).execution_context)
      ? ((details as Record<string, unknown>).execution_context as Record<string, unknown>)
      : {};
  const parameterAudit = isPlainObject(parameters.audit) ? parameters.audit : {};
  const existingAudit = isPlainObject(existingExecutionContext.audit)
    ? (existingExecutionContext.audit as Record<string, unknown>)
    : {};

  const interruptionReasonCandidate =
    typeof parameterAudit.interruption_reason === "string" && parameterAudit.interruption_reason !== "none"
      ? parameterAudit.interruption_reason
      : typeof existingAudit.interruption_reason === "string"
        ? existingAudit.interruption_reason
        : typeof parameterAudit.interruption_reason === "string"
          ? parameterAudit.interruption_reason
          : undefined;
  const normalizedInterruptionReason: AssetScanInterruptionReason =
    interruptionReasonCandidate &&
    (ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(interruptionReasonCandidate)
      ? (interruptionReasonCandidate as AssetScanInterruptionReason)
      : "none";

  return {
    ...details,
    execution_context: {
      ...existingExecutionContext,
      max_targets: parameters.max_targets,
      max_ports_per_target: parameters.max_ports_per_target,
      max_runtime_seconds: parameters.max_runtime_seconds,
      target_http_rps_cap: parameters.target_http_rps_cap,
      max_tcp_concurrency_per_target: parameters.max_tcp_concurrency_per_target,
      audit: {
        ...existingAudit,
        query: parameterAudit.query,
        source: parameterAudit.source,
        requested_by: parameterAudit.requested_by,
        requested_at: parameterAudit.requested_at,
        interruption_reason: normalizedInterruptionReason
      }
    }
  };
}

function deriveAssetScanInterruptionReason(
  parameters: Record<string, unknown> | undefined,
  error: unknown
): AssetScanInterruptionReason {
  const parameterAudit = parameters && isPlainObject(parameters.audit) ? parameters.audit : undefined;
  const fromParameters = readOptionalString(parameterAudit?.interruption_reason);

  if (
    fromParameters &&
    fromParameters !== "none" &&
    (ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(fromParameters)
  ) {
    return fromParameters as AssetScanInterruptionReason;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("timeout")) {
    return "timeout";
  }

  if (message.includes("budget")) {
    return "budget";
  }

  if (fromParameters && (ASSET_SCAN_ALLOWED_INTERRUPTION_REASONS as readonly string[]).includes(fromParameters)) {
    return fromParameters as AssetScanInterruptionReason;
  }

  return "none";
}

export class TaskCenterService {
  repository: TaskRepository;
  taskEngineService: TaskEngineService;
  now: () => string;
  nextTaskId: () => string;
  logSkillsStaticEvent: SkillsStaticRuntimeLogSink;

  constructor(options: {
    repository: TaskRepository;
    adapters?: TaskEngineAdapter[];
    taskEngineService?: TaskEngineService;
    now?: () => string;
    nextTaskId?: () => string;
    logSkillsStaticEvent?: SkillsStaticRuntimeLogSink;
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
    this.logSkillsStaticEvent = options.logSkillsStaticEvent ?? defaultSkillsStaticRuntimeLogSink;
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

    if (task.task_type === "asset_scan") {
      task.parameters = normalizeAssetScanParameters(
        isPlainObject(input.parameters) ? input.parameters : undefined,
        input.requested_by,
        timestamp
      );
    } else if (input.parameters) {
      task.parameters = { ...input.parameters };
    }

    let result: BaseResult<ResultDetails>;
    let riskSummary: RiskSummary;

    try {
      const initialArtifacts = await this.taskEngineService.createInitialArtifacts(task);
      result = initialArtifacts.result;
      riskSummary = initialArtifacts.riskSummary;
    } catch (error) {
      if (task.task_type === "asset_scan") {
        const interruptionReason = deriveAssetScanInterruptionReason(task.parameters, error);
        const failedArtifacts = this.taskEngineService.createFailedAssetScanArtifacts(task, this.now(), interruptionReason);
        this.repository.save(failedArtifacts);
        return failedArtifacts.task;
      }

      throw error;
    }

    this.repository.save({
      task,
      result,
      riskSummary
    });

    if (task.task_type === "asset_scan") {
      const completedDetails = attachAssetScanExecutionContext(
        result.details as AssetScanResultDetails,
        task.parameters
      );
      const completedArtifacts = this.taskEngineService.createCompletedAssetScanArtifacts(
        task,
        completedDetails,
        this.now()
      );
      this.repository.save(completedArtifacts);
      return completedArtifacts.task;
    }

    if (this.taskEngineService.hasRegisteredClient(task)) {
      try {
        const dispatchReceipt = await this.taskEngineService.dispatchTask(task);

        if (task.task_type === "static_analysis" && dispatchReceipt.engine_type === "skills_static") {
          try {
            const normalizedResultDetails = normalizeSkillsStaticEngineOutput(dispatchReceipt.mock_result ?? {}, task);

            try {
              this.repository.save(
                this.taskEngineService.createCompletedStaticAnalysisArtifacts(task, normalizedResultDetails, this.now())
              );
            } catch (error) {
              await this.handleSkillsStaticFailure(task, dispatchReceipt.provider ?? "mock", "deriver", "derivation_failed", error);
              return task;
            }
          } catch (error) {
            if (error instanceof DomainError && error.code === "SKILLS_STATIC_INVALID_ENGINE_OUTPUT") {
              await this.handleSkillsStaticFailure(
                task,
                dispatchReceipt.provider ?? "mock",
                "normalizer",
                "normalization_failed",
                error
              );
              return task;
            }

            throw error;
          }
        }
      } catch (error) {
        if (error instanceof SkillsStaticExecutionError && task.task_type === "static_analysis") {
          this.repository.save(
            this.taskEngineService.createFailedStaticAnalysisArtifacts(task, this.now(), error.phase)
          );
          return task;
        }

        throw error;
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

  async handleSkillsStaticFailure(
    task: Task,
    provider: string,
    phase: SkillsStaticExecutionPhase,
    reason: "normalization_failed" | "derivation_failed",
    error: unknown
  ): Promise<void> {
    await this.logSkillsStaticEvent({
      event: "scan_failed",
      task_id: task.task_id,
      engine_type: "skills_static",
      provider,
      target_ref: task.target.display_name ?? task.target.target_value,
      phase,
      reason,
      error_summary: error instanceof Error ? error.message : String(error)
    });

    this.repository.save(this.taskEngineService.createFailedStaticAnalysisArtifacts(task, this.now(), phase));
  }
}
