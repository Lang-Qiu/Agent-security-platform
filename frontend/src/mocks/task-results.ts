import type { BaseResult } from "../../../../shared/types/result";

export const taskResultMocks: Record<string, BaseResult> = {
  task_asset_001: {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "running",
    risk_level: "high",
    summary: "Detected open ports and a partially identified fingerprint",
    details: {
      confidence: 0.93,
      open_ports: [{ port: 443 }, { port: 8443 }],
      findings: [{ title: "Admin surface exposed" }]
    },
    created_at: "2026-03-26T09:15:00Z",
    updated_at: "2026-03-26T09:18:00Z"
  },
  task_static_001: {
    task_id: "task_static_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "partial_success",
    risk_level: "medium",
    summary: "Rule hit aggregation completed for the primary package",
    details: {
      sample_name: "mail-routing",
      language: "TypeScript",
      files_scanned: 14,
      rule_hits: [{ id: "RULE-001" }, { id: "RULE-002" }]
    },
    created_at: "2026-03-26T08:45:00Z",
    updated_at: "2026-03-26T08:57:00Z"
  },
  task_sandbox_001: {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "blocked",
    risk_level: "critical",
    summary: "Outbound script download was blocked by sandbox policy",
    details: {
      session_id: "session_demo_001",
      blocked: true,
      event_count: 17,
      alerts: [{ alert_id: "alert-001" }, { alert_id: "alert-002" }]
    },
    created_at: "2026-03-26T07:30:00Z",
    updated_at: "2026-03-26T07:41:00Z"
  }
};
