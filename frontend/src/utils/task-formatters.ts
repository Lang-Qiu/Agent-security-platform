import type { Task } from "../../../../shared/types/task";

export function formatTaskTypeLabel(taskType: Task["task_type"]): string {
  switch (taskType) {
    case "asset_scan":
      return "Asset Scan";
    case "static_analysis":
      return "Static Analysis";
    case "sandbox_run":
      return "Sandbox Run";
  }
}

export function formatTaskTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}
