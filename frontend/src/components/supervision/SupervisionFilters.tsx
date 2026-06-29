import { Input, Select, Space } from "antd";

import type { SandboxPolicyAction } from "../../../../shared/types/sandbox";
import type { RiskLevel, TaskStatus } from "../../../../shared/types/task";
import type { SandboxSupervisionToolName } from "../../../../shared/types/supervision";
import type { SupervisionQuery } from "../../services/supervision-service";

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "finished", label: "Finished" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
  { value: "partial_success", label: "Partial Success" }
];

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: "info", label: "Info" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
];

const ACTION_OPTIONS: Array<{ value: SandboxPolicyAction; label: string }> = [
  { value: "allow", label: "Allow" },
  { value: "deny", label: "Deny" },
  { value: "ask", label: "Ask" },
  { value: "alert", label: "Alert" }
];

const TOOL_LABELS: Record<SandboxSupervisionToolName, string> = {
  send_email: "Send email",
  read_file: "Read file",
  write_file: "Write file",
  call_api: "Call API"
};

export interface SupervisionFiltersProps {
  query: SupervisionQuery;
  onChange: (query: SupervisionQuery) => void;
  scenarioOptions: string[];
  toolOptions: SandboxSupervisionToolName[];
}

export function SupervisionFilters({
  query,
  onChange,
  scenarioOptions,
  toolOptions
}: SupervisionFiltersProps) {
  const updateField = <K extends keyof SupervisionQuery>(
    field: K,
    value: SupervisionQuery[K]
  ): void => {
    onChange({ ...query, [field]: value });
  };

  return (
    <div className="supervision-filters">
      <Space wrap>
        <Input
          type="search"
          aria-label="Session search"
          placeholder="Search sessions"
          value={query.q ?? ""}
          onChange={(e) => updateField("q", e.target.value || undefined)}
          allowClear
          style={{ width: 240 }}
        />
        <Select<TaskStatus>
          aria-label="Status"
          placeholder="Status"
          value={query.status}
          onChange={(value) => updateField("status", value ?? undefined)}
          allowClear
          virtual={false}
          style={{ width: 160 }}
          options={STATUS_OPTIONS}
        />
        <Select<RiskLevel>
          aria-label="Risk"
          placeholder="Risk"
          value={query.risk_level}
          onChange={(value) => updateField("risk_level", value ?? undefined)}
          allowClear
          virtual={false}
          style={{ width: 140 }}
          options={RISK_OPTIONS}
        />
        <Select<SandboxPolicyAction>
          aria-label="Action"
          placeholder="Action"
          value={query.action}
          onChange={(value) => updateField("action", value ?? undefined)}
          allowClear
          virtual={false}
          style={{ width: 140 }}
          options={ACTION_OPTIONS}
        />
        <Select<string>
          aria-label="Scenario"
          placeholder="Scenario"
          value={query.scenario_id}
          onChange={(value) => updateField("scenario_id", value ?? undefined)}
          allowClear
          virtual={false}
          style={{ width: 160 }}
          options={scenarioOptions.map((s) => ({ value: s, label: s }))}
        />
        <Select<SandboxSupervisionToolName>
          aria-label="Tool"
          placeholder="Tool"
          value={query.tool_name}
          onChange={(value) => updateField("tool_name", value ?? undefined)}
          allowClear
          virtual={false}
          style={{ width: 160 }}
          options={toolOptions.map((t) => ({ value: t, label: TOOL_LABELS[t] }))}
        />
      </Space>
    </div>
  );
}
