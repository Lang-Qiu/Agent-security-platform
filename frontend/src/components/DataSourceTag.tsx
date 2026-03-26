import { Tag } from "antd";

export function DataSourceTag({ source }: { source: "api" | "mock" }) {
  if (source === "api") {
    return <Tag color="green">Backend API</Tag>;
  }

  return <Tag color="gold">Mock Fallback</Tag>;
}
