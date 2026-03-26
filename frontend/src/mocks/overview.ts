import type { RiskLevel, TaskStatus } from "../../../../shared/types/task";

export interface OverviewMetric {
  label: string;
  value: string;
  helper: string;
}

export interface OverviewShortcut {
  title: string;
  description: string;
  to: string;
}

export interface OverviewActivityItem {
  id: string;
  title: string;
  status: TaskStatus;
  riskLevel: RiskLevel;
  detail: string;
}

export interface OverviewRiskItem {
  id: string;
  title: string;
  level: RiskLevel;
  description: string;
}

export const overviewMetrics: OverviewMetric[] = [
  {
    label: "Open Tasks",
    value: "12",
    helper: "3 waiting for adapter dispatch"
  },
  {
    label: "Running Checks",
    value: "4",
    helper: "Asset, static, and sandbox lanes active"
  },
  {
    label: "High Risks",
    value: "2",
    helper: "Current mock posture for follow-up"
  },
  {
    label: "Healthy Connectors",
    value: "3 / 3",
    helper: "Engine placeholders are reachable"
  }
];

export const overviewShortcuts: OverviewShortcut[] = [
  {
    title: "Review Task Queue",
    description: "Open the tasks workspace and inspect queue status before deeper implementation begins.",
    to: "/tasks"
  },
  {
    title: "Inspect Asset Results",
    description: "Use the asset result route as the first consumer of shared result contracts.",
    to: "/results/assets"
  },
  {
    title: "Inspect Static Analysis",
    description: "Check the static analysis placeholder to keep layout and result routes aligned.",
    to: "/results/static-analysis"
  }
];

export const overviewActivity: OverviewActivityItem[] = [
  {
    id: "activity-1",
    title: "demo-agent asset scan",
    status: "running",
    riskLevel: "medium",
    detail: "Backend task center placeholder is ready for frontend binding."
  },
  {
    id: "activity-2",
    title: "demo-email-skill static analysis",
    status: "pending",
    riskLevel: "high",
    detail: "Awaiting future detail page and result list implementation."
  },
  {
    id: "activity-3",
    title: "runtime sandbox session",
    status: "blocked",
    riskLevel: "critical",
    detail: "Reserved route confirms the future alert workflow entry point."
  }
];

export const overviewRisks: OverviewRiskItem[] = [
  {
    id: "risk-1",
    title: "Static analysis backlog",
    level: "high",
    description: "Task list and detail pages are still placeholders, so triage remains overview-led."
  },
  {
    id: "risk-2",
    title: "Asset exposure baseline",
    level: "medium",
    description: "Shared result shells exist, but asset drill-down behavior is not implemented yet."
  },
  {
    id: "risk-3",
    title: "Sandbox monitoring route",
    level: "info",
    description: "Navigation is stable and ready for future alert stream integration."
  }
];
