import { useMemo } from "react";
import { Button, Radio, Space, Typography } from "antd";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityPolicyProfileId,
  type SandboxSecurityStage,
  type SandboxSecuritySubmittedContentItem,
  type SandboxSecurityToolRequest
} from "../../../../shared/types/sandbox-security";
import { describeSandboxSecurityViolation } from "../../content/sandbox-security-copy";
import {
  measureEvaluationRequestBytes,
  type LimitViolation
} from "../../utils/sandbox-security-limits";
import { ContentItemRow } from "./ContentItemRow";
import { RequestLimitMeter } from "./RequestLimitMeter";
import { ToolRequestFields } from "./ToolRequestFields";

const FIELDSET_STYLE = { border: "none", margin: 0, padding: 0 } as const;

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

  // Serialising the whole payload is O(payload) and the payload bound is
  // 512 KiB, so this must not run on renders that did not change the payload
  // (a `submitting` flip or a new violation list would otherwise re-measure).
  const usedBytes = useMemo(
    () => measureEvaluationRequestBytes({ stage, contentItems, toolRequest }),
    [stage, contentItems, toolRequest]
  );

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
        <fieldset style={FIELDSET_STYLE}>
          <legend className="sandbox-security-legend">阶段</legend>
          {SANDBOX_SECURITY_STAGES.map((option) => (
            <Radio
              key={option}
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
            >
              <span style={{ fontFamily: "var(--console-mono)" }}>{option}</span>
            </Radio>
          ))}
        </fieldset>

        <fieldset style={FIELDSET_STYLE}>
          <legend className="sandbox-security-legend">策略配置</legend>
          {SANDBOX_SECURITY_POLICY_PROFILE_IDS.map((option) => (
            <Radio
              key={option}
              name="sandbox-security-profile"
              value={option}
              checked={policyProfileId === option}
              onChange={() => emit({ policyProfileId: option })}
            >
              <span style={{ fontFamily: "var(--console-mono)" }}>{option}</span>
            </Radio>
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

        <RequestLimitMeter
          usedBytes={usedBytes}
          limitBytes={SANDBOX_SECURITY_MAX_REQUEST_BYTES}
        />

        {violations.length > 0 ? (
          // Bare aria-live with no ARIA role: the page-level failure Alert owns
          // role="alert" and the decision summary owns role="status", and both
          // page specs query those in the singular. A role here would make
          // getByRole ambiguous. Copy names only the failing rule and at most a
          // source_id — never the submitted value.
          <div aria-live="polite" className="sandbox-security-violations">
            <Typography.Text type="danger">提交被阻止：</Typography.Text>
            <ul style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
              {violations.map((violation) => (
                <li key={`${violation.rule}:${violation.sourceId ?? ""}`}>
                  <Typography.Text type="secondary">
                    {describeSandboxSecurityViolation(violation)}
                  </Typography.Text>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button type="primary" htmlType="submit" disabled={submitDisabled}>
          提交评估
        </Button>
      </Space>
    </form>
  );
}
