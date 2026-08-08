import { Button, Space } from "antd";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityPolicyProfileId,
  type SandboxSecurityStage,
  type SandboxSecuritySubmittedContentItem,
  type SandboxSecurityToolRequest
} from "../../../../shared/types/sandbox-security";
import type { LimitViolation } from "../../utils/sandbox-security-limits";
import { ContentItemRow } from "./ContentItemRow";
import { ToolRequestFields } from "./ToolRequestFields";

export interface EvaluationRequestFormProps {
  stage: SandboxSecurityStage;
  policyProfileId: SandboxSecurityPolicyProfileId;
  contentItems: SandboxSecuritySubmittedContentItem[];
  toolRequest: SandboxSecurityToolRequest | null;
  submitting: boolean;
  violations: LimitViolation[];
  onChange: (next: {
    stage: SandboxSecurityStage;
    policyProfileId: SandboxSecurityPolicyProfileId;
    contentItems: SandboxSecuritySubmittedContentItem[];
    toolRequest: SandboxSecurityToolRequest | null;
  }) => void;
  onSubmit: () => void;
}

/**
 * Fully controlled evaluation request form. It owns no request state — the page
 * does — and holds every submitted value only in React props, never in the URL
 * or storage. The profile control is a fixed two-option selector because
 * `SandboxSecurityRequest` forbids caller-submitted profiles. Catalog options
 * come from shared constants; no local enum is duplicated.
 */
export function EvaluationRequestForm({
  stage,
  policyProfileId,
  contentItems,
  toolRequest,
  submitting,
  violations,
  onChange,
  onSubmit
}: EvaluationRequestFormProps) {
  const emit = (patch: Partial<{
    stage: SandboxSecurityStage;
    policyProfileId: SandboxSecurityPolicyProfileId;
    contentItems: SandboxSecuritySubmittedContentItem[];
    toolRequest: SandboxSecurityToolRequest | null;
  }>) => {
    onChange({
      stage,
      policyProfileId,
      contentItems,
      toolRequest,
      ...patch
    });
  };

  const addDisabled = contentItems.length >= SANDBOX_SECURITY_MAX_CONTENT_ITEMS;
  const submitDisabled = submitting || violations.length > 0;

  const handleAddItem = () => {
    if (addDisabled) return;
    const nextIndex = contentItems.length;
    emit({
      contentItems: [
        ...contentItems,
        {
          source_id: `src-${nextIndex}`,
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: "",
          provenance_ref: `source://client/${nextIndex}`
        }
      ]
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!submitDisabled) onSubmit();
      }}
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend>阶段</legend>
          {SANDBOX_SECURITY_STAGES.map((option) => (
            <label key={option} style={{ marginInlineEnd: 12 }}>
              <input
                type="radio"
                name="sandbox-security-stage"
                value={option}
                checked={stage === option}
                onChange={() => {
                  const nextTool =
                    option === "tool_request"
                      ? toolRequest ?? { call_id: "", tool_name: "", arguments: {} }
                      : null;
                  emit({ stage: option, toolRequest: nextTool });
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>

        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend>策略配置</legend>
          {SANDBOX_SECURITY_POLICY_PROFILE_IDS.map((option) => (
            <label key={option} style={{ marginInlineEnd: 12 }}>
              <input
                type="radio"
                name="sandbox-security-profile"
                value={option}
                checked={policyProfileId === option}
                onChange={() => emit({ policyProfileId: option })}
              />
              {option}
            </label>
          ))}
        </fieldset>

        {contentItems.map((item, index) => (
          <ContentItemRow
            key={item.source_id}
            index={index}
            item={item}
            canRemove={contentItems.length > 1}
            onChange={(nextItem) => {
              const next = contentItems.slice();
              next[index] = nextItem;
              emit({ contentItems: next });
            }}
            onRemove={() => {
              emit({
                contentItems: contentItems.filter((_unused, position) => position !== index)
              });
            }}
          />
        ))}

        <Button onClick={handleAddItem} disabled={addDisabled}>
          新增来源
        </Button>

        {stage === "tool_request" && toolRequest !== null ? (
          <ToolRequestFields
            toolRequest={toolRequest}
            onChange={(nextTool) => emit({ toolRequest: nextTool })}
          />
        ) : null}

        <Button type="primary" htmlType="submit" disabled={submitDisabled}>
          提交评估
        </Button>
      </Space>
    </form>
  );
}
