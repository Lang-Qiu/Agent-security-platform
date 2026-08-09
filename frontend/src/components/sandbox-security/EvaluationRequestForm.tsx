import { useMemo } from "react";
import { Button, Typography } from "antd";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
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
import { PolicySelector } from "./PolicySelector";
import { RequestLimitMeter } from "./RequestLimitMeter";
import { StageSelector } from "./StageSelector";
import { ToolRequestFields } from "./ToolRequestFields";

export interface EvaluationRequestFormProps {
  stage: SandboxSecurityStage;
  policyProfileId: SandboxSecurityPolicyProfileId;
  contentItems: SandboxSecuritySubmittedContentItem[];
  toolRequest: SandboxSecurityToolRequest | null;
  submitting: boolean;
  violations: LimitViolation[];
  reduceMotion?: boolean;
  onChange: (next: {
    stage: SandboxSecurityStage;
    policyProfileId: SandboxSecurityPolicyProfileId;
    contentItems: SandboxSecuritySubmittedContentItem[];
    toolRequest: SandboxSecurityToolRequest | null;
  }) => void;
  onSubmit: () => void;
}

export function EvaluationRequestForm({
  stage,
  policyProfileId,
  contentItems,
  toolRequest,
  submitting,
  violations,
  reduceMotion = false,
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
      className="console-panel workbench-request-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!submitDisabled) onSubmit();
      }}
    >
      <StageSelector
        stage={stage}
        onStageChange={(nextStage) => {
          const nextTool =
            nextStage === "tool_request"
              ? toolRequest ?? { call_id: "", tool_name: "", arguments: {} }
              : null;
          emit({ stage: nextStage, toolRequest: nextTool });
        }}
      />

      <PolicySelector
        policyProfileId={policyProfileId}
        onPolicyProfileChange={(nextPolicyProfileId) =>
          emit({ policyProfileId: nextPolicyProfileId })
        }
      />

      <div className="workbench-source-stack">
        {contentItems.map((item, index) => (
          <ContentItemRow
            key={item.source_id}
            index={index}
            item={item}
            canRemove={contentItems.length > 1}
            reduceMotion={reduceMotion}
            onChange={(nextItem) => {
              const next = contentItems.slice();
              next[index] = nextItem;
              emit({ contentItems: next });
            }}
            onRemove={() => {
              emit({
                contentItems: contentItems.filter(
                  (_unused, position) => position !== index
                )
              });
            }}
          />
        ))}
      </div>

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
        <div aria-live="polite" className="sandbox-security-violations">
          <Typography.Text type="danger">提交被阻止：</Typography.Text>
          <ul>
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

      <Button
        className="workbench-evaluate-btn"
        type="primary"
        htmlType="submit"
        block
        loading={submitting}
        disabled={submitDisabled}
      >
        {submitting ? "评估中..." : "开始评估"}
      </Button>
    </form>
  );
}
