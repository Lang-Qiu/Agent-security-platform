import type { EngineType, RiskLevel, TaskStatus, TaskTarget, TaskType } from "./task.ts";
import type { MaxPrivilegeAssessment } from "./asset-scan.ts";
import type { SkillsStaticResultDetails } from "./skills-static-result-details.ts";

export type AssetScanInterruptionReason = "none" | "budget" | "timeout" | "manual_stop";

export interface AssetScanExecutionAudit {
  query?: string;
  source?: string;
  requested_by?: string;
  requested_at?: string;
  interruption_reason?: AssetScanInterruptionReason;
}

export interface AssetScanExecutionContext {
  max_targets?: number;
  max_ports_per_target?: number;
  max_runtime_seconds?: number;
  target_http_rps_cap?: number;
  max_tcp_concurrency_per_target?: number;
  audit?: AssetScanExecutionAudit;
}

export interface AssetScanResultDetails {
  target?: TaskTarget;
  fingerprint?: Record<string, unknown>;
  confidence?: number;
  matched_features?: unknown[];
  open_ports?: unknown[];
  http_endpoints?: unknown[];
  auth_detected?: boolean;
  findings?: unknown[];
  execution_context?: AssetScanExecutionContext;

  // === 风险评估扩展字段 ===
  overall_risk_score?: number;
  overall_risk_level?: RiskLevel;
  max_privilege?: MaxPrivilegeAssessment;
}

export type StaticAnalysisResultDetails = SkillsStaticResultDetails;

export interface SandboxRunResultDetails {
  session_id?: string;
  target?: TaskTarget;
  alerts?: unknown[];
  blocked?: boolean;
  event_count?: number;
}

export interface ResultDetailsByTaskType {
  asset_scan: AssetScanResultDetails;
  static_analysis: StaticAnalysisResultDetails;
  sandbox_run: SandboxRunResultDetails;
}

export type ResultDetails =
  | AssetScanResultDetails
  | StaticAnalysisResultDetails
  | SandboxRunResultDetails;

export interface BaseResult<TDetails extends ResultDetails = ResultDetails> {
  task_id: string;
  task_type: TaskType;
  engine_type: EngineType;
  status: TaskStatus;
  risk_level: RiskLevel;
  summary: string;
  details: TDetails;
  created_at: string;
  updated_at: string;
  result_id?: string;
  started_at?: string;
  finished_at?: string;
  metadata?: Record<string, unknown>;
}
