import { useState } from "react";
import { useReducedMotion } from "motion/react";

import type {
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../shared/types/sandbox-security";
import type { SandboxSecurityDecision } from "../../../shared/types/sandbox-security";
import { CapabilitySessionPanel } from "../components/sandbox-security/CapabilitySessionPanel";
import {
  EvaluationInspector,
  type EvaluationInspectorStageEvents,
  type EvaluationInspectorState
} from "../components/sandbox-security/EvaluationInspector";
import { EvaluationRequestForm } from "../components/sandbox-security/EvaluationRequestForm";
import type { EvaluationRequestFacts } from "../components/sandbox-security/ExecutionTrace";
import {
  describeSandboxSecurityFailure,
  type SandboxSecurityFailureCopy
} from "../content/sandbox-security-copy";
import { streamSandboxSecurityEvaluation } from "../services/sandbox-security-service";
import type { SandboxSecurityCallResult } from "../services/api-client";
import {
  measureEvaluationRequestBytes,
  validateEvaluationRequest,
  type LimitViolation
} from "../utils/sandbox-security-limits";

export interface SandboxSecurityWorkbenchPageProps {
  fetchImpl?: typeof fetch;
}

type ErrorResult =
  | { kind: "error"; httpStatus: number; errorCode: string | null; retryAfterSeconds: number | null }
  | { kind: "invalid_token" }
  | { kind: "invalid" }
  | { kind: "unavailable" };

interface EvaluationResult {
  readonly decision: SandboxSecurityDecision;
  readonly requestFacts: EvaluationRequestFacts;
}

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
  const [lastRequestFacts, setLastRequestFacts] = useState<EvaluationRequestFacts | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [runtimeStages, setRuntimeStages] = useState<EvaluationInspectorStageEvents>({});
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<ErrorResult | null>(null);
  // Normalize reduceMotion to boolean once — drives SourceCard entry, Inspector,
  // and every Workbench motion surface without repeated ?? false.
  const reduceMotion = useReducedMotion() ?? false;

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

  const runEvaluation = async (key: string, requestFacts: EvaluationRequestFacts) => {
    setSubmitting(true);
    setRuntimeStages({});
    setEvaluationResult(null);
    setError(null);
    const result: SandboxSecurityCallResult<SandboxSecurityDecision> =
      await streamSandboxSecurityEvaluation({
        capabilityToken,
        idempotencyKey: key,
        requestId: crypto.randomUUID(),
        stage,
        policyProfileId,
        contentItems,
        toolRequest: toolRequest ?? undefined,
        options: fetchImpl ? { fetchImpl } : undefined,
        onStage: (event) => {
          setRuntimeStages((current) => ({ ...current, [event.stage]: event }));
        }
      });
    setSubmitting(false);
    if (result.kind === "ok") {
      setEvaluationResult({ decision: result.data, requestFacts });
      return;
    }
    if (describeSandboxSecurityFailure(result).requiresNewCapability) {
      setCapabilityToken("");
    }
    setError(result);
  };

  const handleSubmit = () => {
    if (violations.length > 0 || submitting) return;
    const canReuse = idempotencyKey !== null && lastRequestFacts !== null;
    const key = canReuse ? idempotencyKey : crypto.randomUUID();
    const requestFacts = canReuse
      ? lastRequestFacts
      : {
          clientSubmittedAt: new Date().toISOString(),
          sourceCount: contentItems.length,
          requestBytes: measureEvaluationRequestBytes({
            stage,
            contentItems,
            toolRequest
          })
        };
    if (!canReuse) {
      setIdempotencyKey(key);
      setLastRequestFacts(requestFacts);
    }
    void runEvaluation(key, requestFacts);
  };

  const handleRetry = () => {
    if (idempotencyKey === null || lastRequestFacts === null || submitting) return;
    void runEvaluation(idempotencyKey, lastRequestFacts);
  };

  const invalidateKey = () => {
    setIdempotencyKey(null);
    setLastRequestFacts(null);
  };

  const isRetryable =
    error !== null &&
    error.kind === "error" &&
    !requiresNewCapability &&
    idempotencyKey !== null &&
    lastRequestFacts !== null;

  // One exclusive view-state union for the presentational Inspector. A 401 sets
  // requiresNewCapability and is surfaced by CapabilitySessionPanel, so the
  // Inspector stays idle in that case rather than showing a duplicate alert.
  const inspectorState: EvaluationInspectorState = submitting
    ? { kind: "loading", runtimeStages }
    : evaluationResult
      ? {
          kind: "result",
          decision: evaluationResult.decision,
          requestFacts: evaluationResult.requestFacts
        }
      : failureCopy && !requiresNewCapability
        ? {
            kind: "error",
            failure: failureCopy,
            retryable: isRetryable,
            runtimeStages
          }
        : { kind: "idle" };

  return (
    <section className="sandbox-security-workbench-page">
      <div className="sandbox-workbench-grid">
        <div className="sandbox-workbench-input console-panel workbench-composer">
          <div className="workbench-composer__heading">
            <span className="workbench-section-eyebrow">REQUEST COMPOSER</span>
            <span className="workbench-composer__mode" data-mono="true">
              simulation · local_and_judge
            </span>
          </div>
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
            reduceMotion={reduceMotion}
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
          <EvaluationInspector
            state={inspectorState}
            reduceMotion={reduceMotion}
            onRetry={handleRetry}
          />
        </div>
      </div>
    </section>
  );
}
