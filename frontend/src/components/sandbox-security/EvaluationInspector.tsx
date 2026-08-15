// EvaluationInspector — exclusive idle / loading / error / result rendering plus
// the finite post-response reveal sequence.
//
// Design: spec R2.1 §4, §7. D13 (layout order != reveal order).
//
// Honesty rule (§7): runtime rows show only validated stream events. The timed
// result reveal below remains a comprehension layer over the final decision and
// never implies additional detector execution.
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
import type {
  SandboxSecurityEvaluationStreamEvent,
  SandboxSecurityEvaluationStreamStage
} from "../../../../shared/types/sandbox-security-api";
import type { SandboxSecurityFailureCopy } from "../../content/sandbox-security-copy";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { EvidenceTrace } from "./EvidenceTrace";
import { ExecutionTrace, type EvaluationRequestFacts } from "./ExecutionTrace";
import { WorkbenchDetectorTable } from "./WorkbenchDetectorTable";
import { WorkbenchFindingsTable } from "./WorkbenchFindingsTable";
import { SpotlightSurface } from "./showcase/SpotlightSurface";
import { CALM_SPRING, MOMENTUM_SPRING } from "./showcase/showcase-motion";

export type EvaluationInspectorState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "loading";
      readonly runtimeStages: EvaluationInspectorStageEvents;
    }
  | {
      readonly kind: "error";
      readonly failure: SandboxSecurityFailureCopy;
      readonly retryable: boolean;
      readonly runtimeStages: EvaluationInspectorStageEvents;
    }
  | {
      readonly kind: "result";
      readonly decision: SandboxSecurityDecision;
      readonly requestFacts: EvaluationRequestFacts;
    };

export type EvaluationInspectorStageEvents = Partial<
  Record<
    SandboxSecurityEvaluationStreamStage,
    Extract<SandboxSecurityEvaluationStreamEvent, { event_type: "stage" }>
  >
>;

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

const RUNTIME_STAGE_ROWS = [
  { stage: "source", label: "SOURCE", detectorKind: "source" },
  { stage: "rule", label: "RULE", detectorKind: "rule" },
  { stage: "model", label: "MODEL", detectorKind: "local_model" },
  { stage: "judge", label: "JUDGE", detectorKind: "external_judge" },
  { stage: "decision", label: "DECISION", detectorKind: "decision" }
] as const;

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

function RunningInspector({
  runtimeStages
}: {
  runtimeStages: EvaluationInspectorStageEvents;
}) {
  return (
    <SpotlightSurface
      className="console-panel workbench-inspector-running"
      ariaLabel="评估检查器运行状态"
    >
      <span className="workbench-evaluating-badge" data-mono="true">
        EVALUATING
      </span>
      <div className="workbench-inspector-running__rows" aria-live="polite">
        {RUNTIME_STAGE_ROWS.map(({ stage, label, detectorKind }) => {
          const event = runtimeStages[stage];
          const status = event?.status ?? "pending";
          const metadata = event?.event_type === "stage"
            ? event.stage === "source"
              ? `${event.result.source_count} source${event.result.source_count === 1 ? "" : "s"}`
              : event.result.skip_reason ?? event.result.detector_kind
            : detectorKind;
          return (
            <div
              key={stage}
              className="workbench-runtime-stage-row"
              data-testid={`runtime-stage-${stage}`}
              data-stage-status={status}
            >
              <span className="workbench-runtime-stage-row__label" data-mono="true">
                {label}
              </span>
              <span className="workbench-runtime-stage-row__status" data-mono="true">
                {status}
              </span>
              <span className="workbench-runtime-stage-row__metadata" data-mono="true">
                {metadata}
              </span>
            </div>
          );
        })}
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
      {state.kind === "loading" ? (
        <RunningInspector runtimeStages={state.runtimeStages} />
      ) : null}
      {state.kind === "error" ? (
        <>
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
          <RunningInspector runtimeStages={state.runtimeStages} />
        </>
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
              <p className="workbench-section-eyebrow">RISK FINDINGS</p>
              <WorkbenchFindingsTable findings={state.decision.findings} />
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
              <p className="workbench-section-eyebrow">DETECTOR EXECUTION</p>
              <WorkbenchDetectorTable runs={state.decision.detector_runs} />
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
