// EvaluationInspector — right-pane state machine: idle / loading / error / result.
//
// Design: spec R2.1 §4, §7.
// Owns the reveal sequence: all result DOM elements mount simultaneously when
// the decision arrives, but are unveiled in presentation order via timed reveal
// gates. This decouples DOM layout (EvidenceTrace → DecisionHero → InsightGrid
// → ExecutionTrace) from reveal order (EvidenceTrace → Findings → Detectors →
// DecisionHero climax → ExecutionTrace). D13.
//
// Honesty rule (§7): every timed reveal is a comprehension layer over
// already-received data. No reveal implies streaming or fake progress.

import { useEffect, useState } from "react";
import { Alert, Button, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { EvidenceTrace } from "./EvidenceTrace";
import { ExecutionTrace } from "./ExecutionTrace";
import type { EvaluationRequestFacts } from "./ExecutionTrace";
import { DetectorChain } from "./showcase/DetectorChain";
import { FindingsCascade } from "./showcase/FindingsCascade";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { verdictSpring, CALM_SPRING, REDUCED_TRANSITION } from "./showcase/showcase-motion";

const { Text } = Typography;

export interface SandboxSecurityFailureCopy {
  title: string;
  remedy: string;
  requiresNewCapability: boolean;
}

export type EvaluationInspectorState = "idle" | "loading" | "error" | "result";

interface EvaluationResult {
  readonly decision: SandboxSecurityDecision;
  readonly requestFacts: EvaluationRequestFacts;
}

export interface EvaluationInspectorProps {
  inspectorState: EvaluationInspectorState;
  evaluationResult: EvaluationResult | null;
  failureCopy: SandboxSecurityFailureCopy | null;
  isRetryable: boolean;
  onRetry: () => void;
  reduceMotion: boolean;
}

// ─── shimmer rows (loading state, aria-hidden) ────────────────────────────────

const SHIMMER_TYPES = ["rule", "local_model", "external_judge"] as const;

function ShimmerRows() {
  return (
    <div className="workbench-shimmer-rows" aria-hidden="true">
      {SHIMMER_TYPES.map((type) => (
        <div key={type} className="workbench-shimmer-row">
          <span
            className="workbench-shimmer-row__type"
            style={{ fontFamily: "var(--console-mono)" }}
          >
            {type}
          </span>
          {/* Shimmer animation: the shimmer effect communicates that evaluation
              is in progress. It must not show detector IDs, fake progress, or
              fake percentages — only the detector kind label. (spec §7.1) */}
          <span className="workbench-shimmer-row__bar" />
        </div>
      ))}
    </div>
  );
}

// ─── idle state content ───────────────────────────────────────────────────────

function InspectorIdle() {
  return (
    <SpotlightSurface className="console-panel workbench-inspector-idle" ariaLabel="等待评估">
      <div className="workbench-inspector-idle__content">
        <Text style={{ fontSize: "2rem", opacity: 0.4 }}>⊙</Text>
        <Text strong>等待评估</Text>
        <Text type="secondary">配置左侧请求并提交，判定结果将在此呈现。</Text>
      </div>
    </SpotlightSurface>
  );
}

// ─── loading state content ────────────────────────────────────────────────────

function InspectorRunning() {
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-running"
      ariaLabel="评估进行中"
    >
      <div className="workbench-evaluating-badge">EVALUATING · 评估中</div>
      {/* Shimmer rows: type labels only — no detector IDs, no fake percentages.
          (spec §7.1: loading EvidenceTrace is completely static; only badge and
          shimmer rows communicate that evaluation is in progress) */}
      <ShimmerRows />
    </SpotlightSurface>
  );
}

// ─── result content — InsightGrid ─────────────────────────────────────────────

interface InsightGridProps {
  decision: SandboxSecurityDecision;
  findingsActive: boolean;
  detectorsActive: boolean;
  reduceMotion: boolean;
}

function InsightGrid({
  decision,
  findingsActive,
  detectorsActive,
  reduceMotion
}: InsightGridProps) {
  return (
    <div className="workbench-insight-grid">
      <FindingsCascade
        findings={decision.findings}
        active={findingsActive}
        reduceMotion={reduceMotion}
      />
      <DetectorChain
        runs={decision.detector_runs}
        active={detectorsActive}
      />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function EvaluationInspector({
  inspectorState,
  evaluationResult,
  failureCopy,
  isRetryable,
  onRetry,
  reduceMotion
}: EvaluationInspectorProps) {
  const decision = evaluationResult?.decision ?? null;

  // Reveal gates for the result state (D13 layout/reveal decoupling).
  const [findingsActive, setFindingsActive] = useState(false);
  const [detectorsActive, setDetectorsActive] = useState(false);
  const [decisionRevealed, setDecisionRevealed] = useState(false);
  const [executionVisible, setExecutionVisible] = useState(false);

  useEffect(() => {
    if (inspectorState !== "result" || !decision) {
      setFindingsActive(false);
      setDetectorsActive(false);
      setDecisionRevealed(false);
      setExecutionVisible(false);
      return;
    }

    if (reduceMotion) {
      setFindingsActive(true);
      setDetectorsActive(true);
      setDecisionRevealed(true);
      setExecutionVisible(true);
      return;
    }

    const t1 = window.setTimeout(() => setFindingsActive(true), 200);
    const t2 = window.setTimeout(() => setDetectorsActive(true), 800);
    const t3 = window.setTimeout(() => setDecisionRevealed(true), 2200);
    const t4 = window.setTimeout(() => setExecutionVisible(true), 3200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [inspectorState, decision, reduceMotion]);

  // EvidenceTrace props: discriminated union based on inspector state
  const evidenceTraceProps: Parameters<typeof EvidenceTrace>[0] =
    inspectorState === "result" && evaluationResult
      ? {
          state: "result",
          decision: evaluationResult.decision,
          sourceCount: evaluationResult.requestFacts.sourceCount,
          reduceMotion
        }
      : inspectorState === "loading"
        ? { state: "loading", reduceMotion }
        : { state: "idle", reduceMotion };

  return (
    <section
      className="workbench-evaluation-inspector"
      aria-label="评估检查器"
      aria-busy={inspectorState === "loading" ? "true" : undefined}
    >
      {/* EvidenceTrace: always visible, state-driven.
          In idle and loading: completely static at low opacity — no animation,
          no per-node pulse, no fake detector IDs (spec §5.3, §7.1). */}
      <EvidenceTrace {...evidenceTraceProps} />

      {/* State-exclusive content */}
      {inspectorState === "idle" && <InspectorIdle />}

      {inspectorState === "loading" && <InspectorRunning />}

      {inspectorState === "error" && failureCopy ? (
        <div className="workbench-inspector-error console-panel">
          <Alert
            type="error"
            showIcon
            title={failureCopy.title}
            description={failureCopy.remedy}
          />
          {isRetryable ? (
            <Button size="small" onClick={onRetry}>
              重试请求
            </Button>
          ) : null}
        </div>
      ) : null}

      {inspectorState === "result" && decision && evaluationResult ? (
        <>
          <motion.div
            className="workbench-decision-hero-reveal"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
            animate={
              decisionRevealed
                ? { opacity: 1, scale: 1 }
                : reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 0, scale: 0.95 }
            }
            transition={
              reduceMotion
                ? REDUCED_TRANSITION
                : verdictSpring(decision.risk_level)
            }
          >
            <DecisionSummaryPanel decision={decision} />
          </motion.div>

          <InsightGrid
            decision={decision}
            findingsActive={findingsActive}
            detectorsActive={detectorsActive}
            reduceMotion={reduceMotion}
          />

          {/* ExecutionTrace: settles last at t≈3.2s (spec §6.4). Uses frozen
              requestFacts from submission — never reads live contentItems.
              active=true so the section is always visible/reachable while the
              EvaluationInspector result is mounted; opacity animation is handled
              by the component itself based on the active prop. */}
          <ExecutionTrace
            decision={decision}
            requestFacts={evaluationResult.requestFacts}
            active={true}
            reduceMotion={reduceMotion}
          />
        </>
      ) : null}
    </section>
  );
}
