import type { RiskSummary } from "../../../../shared/types/task";

export const taskRiskSummaryMocks: Record<string, RiskSummary> = {
  task_asset_001: {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    status: "running",
    risk_level: "high",
    summary: "1 high risk finding requires follow-up",
    total_findings: 3,
    info_count: 0,
    low_count: 1,
    medium_count: 1,
    high_count: 1,
    critical_count: 0,
    updated_at: "2026-03-26T09:18:00Z"
  },
  task_static_001: {
    task_id: "task_static_001",
    task_type: "static_analysis",
    status: "partial_success",
    risk_level: "medium",
    summary: "Static review found 2 medium issues",
    total_findings: 2,
    info_count: 0,
    low_count: 0,
    medium_count: 2,
    high_count: 0,
    critical_count: 0,
    updated_at: "2026-03-26T08:57:00Z"
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    status: "blocked",
    risk_level: "critical",
    summary: "A blocked runtime action was captured in sandbox",
    total_findings: 2,
    info_count: 0,
    low_count: 0,
    medium_count: 0,
    high_count: 1,
    critical_count: 1,
    blocked_count: 1,
    updated_at: "2026-03-26T07:41:00Z"
  }
};
