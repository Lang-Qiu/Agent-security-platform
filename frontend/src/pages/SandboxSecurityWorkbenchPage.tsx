import { useState } from "react";
import { Typography } from "antd";
import { motion, useReducedMotion } from "motion/react";

import type {
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../shared/types/sandbox-security";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security";
import { CapabilitySessionPanel } from "../components/sandbox-security/CapabilitySessionPanel";
import { EvaluationInspector } from "../components/sandbox-security/EvaluationInspector";
import { EvaluationRequestForm } from "../components/sandbox-security/EvaluationRequestForm";
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
  // Unconditional hook call. Entrance uses a critically damped spring
  // (bounce 0): the result arrives without overshoot because no gesture
  // momentum preceded it. Under reduced motion every entrance collapses to an
  // instant opacity change, matching the prefers-reduced-motion contract that
  // app.css already establishes for .console-panel.
  const reduceMotion = useReducedMotion();
  const enterAt = (index: number) =>
    reduceMotion
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0 }
        }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: {
            type: "spring" as const,
            bounce: 0,
            duration: 0.4,
            delay: index * 0.06
          }
        };

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

  // Inspector state machine: loading while the API is in flight, error for
  // non-capability failures, result once a decision arrives, idle otherwise.
  // 401 errors set requiresNewCapability=true and are handled by the
  // CapabilitySessionPanel — the inspector stays idle in that case.
  const inspectorState = submitting
    ? "loading"
    : error !== null && !requiresNewCapability
      ? "error"
      : decision !== null
        ? "result"
        : "idle";

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
    if (describeSandboxSecurityFailure(result).requiresNewCapability) {
      setCapabilityToken("");
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
      <header className="sandbox-workbench-header">
        <Typography.Title level={3}>评估工作台</Typography.Title>
        <Typography.Paragraph type="secondary">
          提交内容以在模拟模式下评估沙箱安全策略。结果仅供分析，不用于实际拦截。
        </Typography.Paragraph>
      </header>

      {/* Two-pane workbench: input on the left, results on the right. The
          results pane is sticky on wide screens so the verdict stays in view
          while the form scrolls (summary before detail), and reorders above the
          input below 1100px so a returned verdict needs no scrolling. The
          reorder is CSS-only, so DOM and tab order stay
          capability -> form -> submit -> result. */}
      <div className="sandbox-workbench-grid">
        <div className="sandbox-workbench-input">
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
            reduceMotion={reduceMotion ?? false}
            onChange={(next) => {
              setStage(next.stage);
              setPolicyProfileId(next.policyProfileId);
              setContentItems(next.contentItems);
              setToolRequest(next.toolRequest);
              invalidateKey();
            }}
            onSubmit={handleSubmit}
          />
        </div>

        <div className="sandbox-workbench-results">
          {/* Persistent simulation marker. Carries no ARIA role: the decision
              summary owns the only role="status" and the inspector error owns
              the only role="alert". */}
          <motion.div className="sandbox-simulation-badge" {...enterAt(0)}>
            SIMULATION / 仿真
          </motion.div>

          {/* EvaluationInspector owns all result-pane states: idle hint,
              loading shimmer, error alert with optional retry, and the full
              cinematic result reveal (EvidenceTrace → InsightGrid → DecisionHero
              → ExecutionTrace). D13 layout/reveal decoupling happens inside. */}
          <EvaluationInspector
            inspectorState={inspectorState}
            decision={decision}
            contentItems={contentItems}
            stage={stage}
            policyProfileId={policyProfileId}
            failureCopy={requiresNewCapability ? null : failureCopy}
            isRetryable={isRetryable}
            onRetry={handleRetry}
            reduceMotion={reduceMotion ?? false}
          />
        </div>
      </div>
    </section>
  );
}
