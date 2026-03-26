import { Tag } from "antd";

import type { TaskStatus } from "../../../../shared/types/task";

const STATUS_CONFIG: Record<TaskStatus, { color: string; label: string }> = {
  pending: { color: "gold", label: "Pending" },
  running: { color: "processing", label: "Running" },
  finished: { color: "success", label: "Finished" },
  failed: { color: "error", label: "Failed" },
  blocked: { color: "volcano", label: "Blocked" },
  partial_success: { color: "warning", label: "Partial Success" }
};

export function StatusTag({ status }: { status: TaskStatus }) {
  const config = STATUS_CONFIG[status];

  return <Tag color={config.color}>{config.label}</Tag>;
}
