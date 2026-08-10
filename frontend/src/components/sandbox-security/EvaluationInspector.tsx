// EvaluationInspector — exclusive idle / loading / error / result rendering plus
// the finite post-response reveal sequence.
//
// Design: spec R2.1 §4, §7. D13 (layout order != reveal order).
//
// Honesty rule (§7): the API is one-shot. Every timed reveal below is a
// comprehension layer over data that has ALREADY arrived — no reveal implies
// detector streaming, and no loading surface shows fake progress or percentages.
//
// This component owns the single polite live region for the Workbench decision.
// It stays mounted and empty through idle, loading, error, and the pre-decision
// result phases, and receives verdict text only when the Decision gate opens, so
// the real page always updates an already-mounted node.

import { useEffect, useState } from "react";
import { RadarChartOutlined } from "@ant-design/icons";
import { Alert, Button, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import type { SandboxSecurityFailureCopy } from "../../content/sandbox-security-copy";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { EvidenceTrace } from "./EvidenceTrace";
import { ExecutionTrace, type EvaluationRequestFacts } from "./ExecutionTrace";
import { DetectorChain } from "./showcase/DetectorChain";
import { FindingsCascade } from "./showcase/FindingsCascade";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { CALM_SPRING, MOMENTUM_SPRING } from "./showcase/showcase-motion";

export type EvaluationInspectorState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "error";
      readonly failure: SandboxSecurityFailureCopy;
      readonly retryable: boolean;
    }
  | {
      readonly kind: "result";
      readonly decision: SandboxSecurityDecision;
      readonly requestFacts: EvaluationRequestFacts;
    };

export interface EvaluationInspectorProps {
  state: EvaluationInspectorState;
  reduceMotion: boolean;
  onRetry: () => void;
}

type RevealPhase =
  | "evidence"
  | "findings"
  | "detectors"
  | "decision"
  | "execution"
  | "settled";

// Private initial visual-tuning targets only. Tests assert phase order and
// eventual settlement; Visual QA may tune these without reordering phases.
const INITIAL_REVEAL_STEPS: readonly { phase: RevealPhase; delayMs: number }[] = [
  { phase: "findings", delayMs: 200 },
  { phase: "detectors", delayMs: 800 },
  { phase: "decision", delayMs: 2200 },
  { phase: "execution", delayMs: 3200 },
  { phase: "settled", delayMs: 4000 }
];

const REVEAL_ORDER: readonly RevealPhase[] = [
  "evidence",
  "findings",
  "detectors",
  "decision",
  "execution",
  "settled"
];

function hasReached(current: RevealPhase, target: RevealPhase): boolean {
  return REVEAL_ORDER.indexOf(current) >= REVEAL_ORDER.indexOf(target);
}

function RuntimeHeader({ state }: { state: EvaluationInspectorState }) {
  const decision = state.kind === "result" ? state.decision : null;
  return (
    <header className="workbench-runtime-header">
      <span className="workbench-section-eyebrow">EVALUATION RUNTIME</span>
      <div className="workbench-runtime-header__chips" aria-hidden="true">
        <span className="sandbox-simulation-badge">SIMULATION / 仿真</span>
        {decision ? (
          <>
            <span data-mono="true">{decision.stage}</span>
            <span data-mono="true">{decision.policy_profile_id}</span>
          </>
        ) : null}
      </div>
    </header>
  );
}

function IdleInspector() {
  // SpotlightSurface forwards ariaLabel to an ordinary div. The outer named
  // EvaluationInspector <section> below—not this decorative shell—owns the
  // accessible region semantics.
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-idle"
      ariaLabel="评估检查器空闲状态"
    >
      <RadarChartOutlined aria-hidden="true" />
      <Typography.Title level={4}>等待评估</Typography.Title>
      <Typography.Text type="secondary">
        配置左侧请求并提交，判定结果将在此呈现。
      </Typography.Text>
    </SpotlightSurface>
  );
}

function RunningInspector() {
  // Detector-kind labels only. No detector IDs, no percentages, no progressbar:
  // the API has not returned, so there is nothing honest to report per detector.
  const kinds = ["rule", "local_model", "external_judge"] as const;
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-running"
      ariaLabel="评估检查器运行状态"
    >
      <span className="workbench-evaluating-badge" data-mono="true">
        EVALUATING
      </span>
      <div className="workbench-inspector-running__rows">
        {kinds.map((kind) => (
          <div key={kind} className="workbench-shimmer-row" aria-hidden="true">
            <span data-mono="true">{kind}</span>
          </div>
        ))}
      </div>
    </SpotlightSurface>
  );
}

export function EvaluationInspector({
  state,
  reduceMotion,
  onRetry
}: EvaluationInspectorProps) {
  const resultId = state.kind === "result" ? state.decision.decision_id : null;
  const [phase, setPhase] = useState<RevealPhase>(
    reduceMotion ? "settled" : "evidence"
  );

  useEffect(() => {
    if (resultId === null) {
      setPhase(reduceMotion ? "settled" : "evidence");
      return;
    }
    if (reduceMotion) {
      setPhase("settled");
      return;
    }

    setPhase("evidence");
    // The API has already returned all data. These timers sequence only a
    // finite comprehension layer; they never represent detector streaming.
    const timers = INITIAL_REVEAL_STEPS.map((step) =>
      window.setTimeout(() => setPhase(step.phase), step.delayMs)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [reduceMotion, resultId]);

  const findingsActive = reduceMotion || hasReached(phase, "findings");
  const detectorsActive = reduceMotion || hasReached(phase, "detectors");
  const decisionActive = reduceMotion || hasReached(phase, "decision");
  const executionActive = reduceMotion || hasReached(phase, "execution");

  return (
    <section
      className="workbench-evaluation-inspector"
      aria-label="评估检查器"
      aria-busy={state.kind === "loading"}
      data-inspector-state={state.kind}
      data-reveal-phase={state.kind === "result" ? phase : undefined}
    >
      <RuntimeHeader state={state} />

      {/* The single persistent Workbench decision live region. Stays mounted and
          empty until the Decision gate opens, then updates in place. */}
      <div role="status" aria-live="polite" className="showcase-sr-only">
        {state.kind === "result" && decisionActive
          ? `${state.decision.verdict} ${state.decision.action} ${state.decision.risk_level}`
          : ""}
      </div>

      {state.kind === "loading" ? (
        <EvidenceTrace state="loading" reduceMotion={reduceMotion} />
      ) : state.kind === "result" ? (
        <EvidenceTrace
          state={phase === "settled" ? "settled" : "result"}
          decision={state.decision}
          sourceCount={state.requestFacts.sourceCount}
          reduceMotion={reduceMotion}
        />
      ) : (
        <EvidenceTrace state="idle" reduceMotion={reduceMotion} />
      )}

      {state.kind === "idle" ? <IdleInspector /> : null}
      {state.kind === "loading" ? <RunningInspector /> : null}
      {state.kind === "error" ? (
        <section className="console-panel workbench-inspector-error">
          <Alert
            role="alert"
            type="error"
            showIcon
            title={state.failure.title}
            description={state.failure.remedy}
          />
          {state.retryable ? (
            <Button className="sandbox-workbench-retry" size="small" onClick={onRetry}>
              重试请求
            </Button>
          ) : null}
        </section>
      ) : null}

      {state.kind === "result" ? (
        <>
          {/* Final DOM order: EvidenceTrace -> DecisionHero -> InsightGrid ->
              ExecutionTrace. Reveal order differs (D13) and is driven by the
              gates above; every pending wrapper is aria-hidden + inert. */}
          <DecisionSummaryPanel
            decision={state.decision}
            variant="workbench"
            active={decisionActive}
            reduceMotion={reduceMotion}
          />
          <div className="workbench-insight-grid" data-testid="insight-grid">
            <motion.section
              className="console-panel workbench-insight-grid__findings"
              data-testid="findings-presentation"
              data-presentation-active={findingsActive ? "true" : "false"}
              aria-hidden={findingsActive ? undefined : true}
              inert={!findingsActive}
              initial={false}
              animate={{ opacity: findingsActive ? 1 : 0, y: findingsActive ? 0 : 8 }}
              transition={reduceMotion ? { duration: 0 } : MOMENTUM_SPRING}
            >
              <p className="workbench-section-eyebrow">FINDINGS</p>
              {state.decision.findings.length > 0 ? (
                <FindingsCascade
                  findings={state.decision.findings}
                  active={findingsActive}
                  reduceMotion={reduceMotion}
                />
              ) : (
                <Typography.Text type="secondary">未产生风险发现。</Typography.Text>
              )}
            </motion.section>
            <motion.section
              className="console-panel workbench-insight-grid__detectors"
              data-testid="detectors-presentation"
              data-presentation-active={detectorsActive ? "true" : "false"}
              aria-hidden={detectorsActive ? undefined : true}
              inert={!detectorsActive}
              initial={false}
              animate={{ opacity: detectorsActive ? 1 : 0, y: detectorsActive ? 0 : 8 }}
              transition={reduceMotion ? { duration: 0 } : CALM_SPRING}
            >
              <p className="workbench-section-eyebrow">DETECTOR CHAIN</p>
              <DetectorChain
                runs={state.decision.detector_runs}
                active={detectorsActive}
              />
            </motion.section>
          </div>
          <ExecutionTrace
            decision={state.decision}
            requestFacts={state.requestFacts}
            active={executionActive}
            reduceMotion={reduceMotion}
          />
        </>
      ) : null}
    </section>
  );
}
