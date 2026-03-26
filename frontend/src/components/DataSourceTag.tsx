import { Tag } from "antd";

import type { TaskDataSource } from "../services/task-service";

export function DataSourceTag({ source }: { source: TaskDataSource }) {
  if (source === "api") {
    return <Tag color="green">Backend API</Tag>;
  }

  if (source === "degraded") {
    return <Tag color="orange">Degraded API Data</Tag>;
  }

  if (source === "integration-error") {
    return <Tag color="red">Integration Error</Tag>;
  }

  return <Tag color="gold">Mock Fallback</Tag>;
}
