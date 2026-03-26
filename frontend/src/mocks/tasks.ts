import type { Task } from "../../../../shared/types/task";

export const taskQueueMocks: Task[] = [
  {
    task_id: "task_asset_001",
    task_type: "asset_scan",
    engine_type: "asset_scan",
    status: "running",
    title: "Scan public agent surface",
    target: {
      target_type: "url",
      target_value: "https://demo-agent.example.com",
      display_name: "Demo Agent"
    },
    risk_level: "high",
    summary: "Fingerprinting and exposed surface checks are in progress",
    created_at: "2026-03-26T09:15:00Z",
    updated_at: "2026-03-26T09:18:00Z"
  },
  {
    task_id: "task_static_001",
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "partial_success",
    title: "Analyze mail routing skill pack",
    target: {
      target_type: "skill_package",
      target_value: "samples/skills/mail-routing",
      display_name: "mail-routing"
    },
    risk_level: "medium",
    summary: "Rule scan completed with dependency metadata pending",
    created_at: "2026-03-26T08:45:00Z",
    updated_at: "2026-03-26T08:57:00Z"
  },
  {
    task_id: "task_sandbox_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "pending",
    title: "Replay suspicious runtime session",
    target: {
      target_type: "session",
      target_value: "sandbox/session/001",
      display_name: "Suspicious session replay"
    },
    risk_level: "info",
    summary: "Task accepted and waiting for sandbox dispatch",
    created_at: "2026-03-26T07:30:00Z",
    updated_at: "2026-03-26T07:30:00Z"
  }
];
