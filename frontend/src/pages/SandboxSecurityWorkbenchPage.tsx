import { useState } from "react";
import { Alert, Button, Space, Typography } from "antd";

import type {
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../shared/types/sandbox-security";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security";
import { CapabilitySessionPanel } from "../components/sandbox-security/CapabilitySessionPanel";
import { DecisionSummaryPanel } from "../components/sandbox-security/DecisionSummaryPanel";
import { DetectorRunTable } from "../components/sandbox-security/DetectorRunTable";
import { EvaluationRequestForm } from "../components/sandbox-security/EvaluationRequestForm";
import { FindingsTable } from "../components/sandbox-security/FindingsTable";
import {
  describeSandboxSecurityFailure,
  type SandboxSecurityFailureCopy
} from "../content/sandbox-security-copy";
import { evaluateSandboxSecurityRequest } from "../services/sandbox-security-service";
import type { SandboxSecurityCallResult } from "../services/api-client";
import { validateEvaluationRequest, type LimitViolation } from "../utils/sandbox-security-limits";

export interface SandboxSecurityWorkbenchPageProps {
  fetchImpl?: typeof fetch;
}

type ErrorResult =
  | { kind: "error"; httpStatus: number; errorCode: string | null; retryAfterSeconds: number | null }
  | { kind: "invalid" }
  | { kind: "unavailable" };

const DEFAULT_ITEM: SandboxSecuritySubmittedContentItem = {
  source_id: "src-0",
  claimed_source_type: "user_input",
  media_type: "text/plain",
  value: "",
  provenance_ref: "source://client/0"
};

/**
 * Evaluation workbench page. Owns the capability token (memory only), the form
 * payload, the in-flight idempotency key, the decision, and the error. The
 * capability token and submitted content never enter the URL or storage. The
 * idempotency key is generated at submit, reused on retry of an unchanged
 * payload, and invalidated on any payload edit.
 */
export function SandboxSecurityWorkbenchPage({ fetchImpl }: SandboxSecurityWorkbenchPageProps) {
  const [capabilityToken, setCapabilityToken] = useState("");
  const [stage, setStage] = useState<SandboxSecurityStage>("user_input");
  const [policyProfileId, setPolicyProfileId] =
    useState<SandboxSecurityPolicyProfileId>("sandbox-security-balanced.v1");
  const [contentItems, setContentItems] = useState<SandboxSecuritySubmittedContentItem[]>([
    DEFAULT_ITEM
  ]);
  const [toolRequest, setToolRequest] = useState<SandboxSecurityToolRequest | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<SandboxSecurityDecision | null>(null);
  const [error, setError] = useState<ErrorResult | null>(null);

  const limitCheck = validateEvaluationRequest({ stage, contentItems, toolRequest });
  const violations: LimitViolation[] = [...limitCheck.violations];
  if (capabilityToken.trim().length === 0) {
    violations.push({ rule: "capability_required" });
  }
  const hasEmptyValue = contentItems.some(
    (item) => typeof item.value === "string" && item.value.trim().length === 0
  );
  if (hasEmptyValue) {
    violations.push({ rule: "content_empty" });
  }

  const failureCopy: SandboxSecurityFailureCopy | null = error
    ? describeSandboxSecurityFailure(error)
    : null;
  const requiresNewCapability = failureCopy?.requiresNewCapability ?? false;

  const runEvaluation = async (key: string) => {
    setSubmitting(true);
    const result: SandboxSecurityCallResult<SandboxSecurityDecision> =
      await evaluateSandboxSecurityRequest({
        capabilityToken,
        idempotencyKey: key,
        requestId: crypto.randomUUID(),
        stage,
        policyProfileId,
        contentItems,
        toolRequest: toolRequest ?? undefined,
        options: fetchImpl ? { fetchImpl } : undefined
      });
    setSubmitting(false);
    if (result.kind === "ok") {
      setDecision(result.data);
      setError(null);
      return;
    }
    setDecision(null);
    setError(result);
  };

  const handleSubmit = () => {
    if (violations.length > 0 || submitting) return;
    const key = idempotencyKey ?? crypto.randomUUID();
    if (idempotencyKey === null) setIdempotencyKey(key);
    void runEvaluation(key);
  };

  const handleRetry = () => {
    if (idempotencyKey === null || submitting) return;
    void runEvaluation(idempotencyKey);
  };

  const invalidateKey = () => setIdempotencyKey(null);

  const isRetryable =
    error !== null &&
    error.kind === "error" &&
    !requiresNewCapability &&
    idempotencyKey !== null;

  return (
    <section className="sandbox-security-workbench-page">
      <Typography.Title level={3}>评估工作台</Typography.Title>
      <Typography.Paragraph type="secondary">
        提交内容以在模拟模式下评估沙箱安全策略。结果仅供分析，不用于实际拦截。
      </Typography.Paragraph>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <CapabilitySessionPanel
          hasToken={capabilityToken.trim().length > 0}
          requiresNewCapability={requiresNewCapability}
          onTokenChange={setCapabilityToken}
          onClear={() => setCapabilityToken("")}
        />
        <EvaluationRequestForm
          stage={stage}
          policyProfileId={policyProfileId}
          contentItems={contentItems}
          toolRequest={toolRequest}
          submitting={submitting}
          violations={violations}
          onChange={(next) => {
            setStage(next.stage);
            setPolicyProfileId(next.policyProfileId);
            setContentItems(next.contentItems);
            setToolRequest(next.toolRequest);
            invalidateKey();
          }}
          onSubmit={handleSubmit}
        />
        {failureCopy && !requiresNewCapability ? (
          <Space orientation="vertical" size="small" style={{ width: "100%" }}>
            <Alert
              role="alert"
              type="error"
              showIcon
              title={failureCopy.title}
              description={failureCopy.remedy}
            />
            {isRetryable ? (
              <Button size="small" onClick={handleRetry}>
                重试请求
              </Button>
            ) : null}
          </Space>
        ) : null}
        {decision ? (
          <>
            <DecisionSummaryPanel decision={decision} />
            <FindingsTable findings={decision.findings} />
            <DetectorRunTable runs={decision.detector_runs} />
          </>
        ) : null}
      </Space>
    </section>
  );
}
