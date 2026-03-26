import type { EngineType, RiskLevel, TaskStatus, TaskTarget, TaskType } from "./task.ts";

export interface AssetScanResultDetails {
  target?: TaskTarget;
  fingerprint?: Record<string, unknown>;
  confidence?: number;
  matched_features?: unknown[];
  open_ports?: unknown[];
  http_endpoints?: unknown[];
  auth_detected?: boolean;
  findings?: unknown[];
}

export interface StaticAnalysisResultDetails {
  sample_name?: string;
  language?: string;
  entry_files?: unknown[];
  files_scanned?: number;
  rule_hits?: unknown[];
  sensitive_capabilities?: unknown[];
  dependency_summary?: Record<string, unknown>;
}

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
