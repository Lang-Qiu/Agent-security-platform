export type TaskType = "asset_scan" | "static_analysis" | "sandbox_run";

export type TaskStatus =
  | "pending"
  | "running"
  | "finished"
  | "failed"
  | "blocked"
  | "partial_success";

export type EngineType = "asset_scan" | "skills_static" | "sandbox";

export type RiskLevel = "info" | "low" | "medium" | "high" | "critical";

export interface TaskTarget {
  target_type: string;
  target_value: string;
  display_name?: string;
  location?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskResultRef {
  result_type: string;
  result_id: string;
}

export interface Task {
  task_id: string;
  task_type: TaskType;
  engine_type: EngineType;
  status: TaskStatus;
  title: string;
  target: TaskTarget;
  requested_by?: string;
  parameters?: Record<string, unknown>;
  risk_level?: RiskLevel;
  summary?: string;
  result_ref?: TaskResultRef;
  error_message?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  metadata?: Record<string, unknown>;
}

export interface RiskSummary {
  task_id: string;
  task_type: TaskType;
  status: TaskStatus;
  risk_level: RiskLevel;
  summary: string;
  total_findings: number;
  info_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  critical_count: number;
  blocked_count?: number;
  top_risks?: string[];
  updated_at: string;
}
