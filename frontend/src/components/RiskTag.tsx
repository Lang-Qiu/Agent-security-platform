import { Tag } from "antd";

import type { RiskLevel } from "../../../../shared/types/task";

const RISK_CONFIG: Record<RiskLevel, { color: string; label: string }> = {
  info: { color: "default", label: "Info" },
  low: { color: "blue", label: "Low" },
  medium: { color: "gold", label: "Medium" },
  high: { color: "orange", label: "High" },
  critical: { color: "red", label: "Critical" }
};

export function RiskTag({ level }: { level: RiskLevel }) {
  const config = RISK_CONFIG[level];

  return <Tag color={config.color}>{config.label}</Tag>;
}
