import { Input, Space, Typography } from "antd";

import type { SandboxSecurityToolRequest } from "../../../../shared/types/sandbox-security";

const { Text } = Typography;

export interface ToolRequestFieldsProps {
  toolRequest: SandboxSecurityToolRequest;
  onChange: (toolRequest: SandboxSecurityToolRequest) => void;
}

/**
 * Presentational editor for the `tool_request` component of an evaluation.
 * Renders exactly `call_id`, `tool_name`, optional `target`, and `arguments`
 * (JSON). It exposes no provider, model, endpoint, timeout, retry, or
 * production-mode field — those are not caller inputs in the contract.
 */
export function ToolRequestFields({ toolRequest, onChange }: ToolRequestFieldsProps) {
  const argumentsText =
    typeof toolRequest.arguments === "string"
      ? toolRequest.arguments
      : JSON.stringify(toolRequest.arguments ?? {}, null, 2);

  return (
    <Space orientation="vertical" size="small" style={{ width: "100%" }}>
      <label htmlFor="sandbox-security-tool-call-id">调用标识</label>
      <Input
        id="sandbox-security-tool-call-id"
        value={toolRequest.call_id}
        onChange={(event) =>
          onChange({ ...toolRequest, call_id: event.target.value })
        }
      />
      <label htmlFor="sandbox-security-tool-name">工具名称</label>
      <Input
        id="sandbox-security-tool-name"
        value={toolRequest.tool_name}
        onChange={(event) =>
          onChange({ ...toolRequest, tool_name: event.target.value })
        }
      />
      <label htmlFor="sandbox-security-tool-target">目标（可选）</label>
      <Input
        id="sandbox-security-tool-target"
        value={toolRequest.target ?? ""}
        onChange={(event) =>
          onChange({ ...toolRequest, target: event.target.value })
        }
      />
      <label htmlFor="sandbox-security-tool-arguments">参数（JSON）</label>
      <Input.TextArea
        id="sandbox-security-tool-arguments"
        rows={4}
        value={argumentsText}
        style={{ fontFamily: "var(--console-mono)" }}
        onChange={(event) => {
          try {
            onChange({ ...toolRequest, arguments: JSON.parse(event.target.value) });
          } catch {
            onChange({ ...toolRequest, arguments: event.target.value });
          }
        }}
      />
      <Text type="secondary">参数以 JSON 提交；无效 JSON 将按原样保留待修正。</Text>
    </Space>
  );
}
