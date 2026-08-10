import { motion } from "motion/react";

import type {
  SandboxDetectorRun,
  SandboxDetectorRunStatus,
  SandboxSecurityDecision
} from "../../../../shared/types/sandbox-security";
import { CALM_SPRING } from "./showcase/showcase-motion";

export interface EvaluationRequestFacts {
  readonly clientSubmittedAt: string;
  readonly sourceCount: number;
  readonly requestBytes: number;
}

export type ExecutionTraceOutcome = "ok" | "warn" | "error" | "skipped";

export interface ExecutionTraceStep {
  readonly id:
    | "request_submitted"
    | "sources_bound"
    | "rule_evaluation"
    | "model_evaluation"
    | "judge_evaluation"
    | "policy_reduction"
    | "judgment_complete";
  readonly label: string;
  readonly detail: string;
  readonly outcome: ExecutionTraceOutcome;
}

export interface ExecutionTraceProps {
  decision: SandboxSecurityDecision;
  requestFacts: EvaluationRequestFacts;
  active: boolean;
  reduceMotion: boolean;
}

const STATUS_ORDER: readonly SandboxDetectorRunStatus[] = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
];

function deriveDetectorStep(
  id: "rule_evaluation" | "model_evaluation" | "judge_evaluation",
  label: string,
  kind: SandboxDetectorRun["detector_kind"],
  runs: readonly SandboxDetectorRun[]
): ExecutionTraceStep {
  const matching = runs.filter((run) => run.detector_kind === kind);
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      matching.filter((run) => run.status === status).length
    ])
  ) as Record<SandboxDetectorRunStatus, number>;
  const skipped = matching.length === 0 || counts.skipped === matching.length;
  if (skipped) {
    return {
      id,
      label,
      detail: `${matching.length} run · SKIPPED`,
      outcome: "skipped"
    };
  }

  const statusSummary = STATUS_ORDER.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
    .join(" · ");
  const elapsedMs = matching.reduce((sum, run) => sum + run.elapsed_ms, 0);
  const hasError =
    counts.failed > 0 || counts.timeout > 0 || counts.invalid_result > 0;
  const hasCompletedExecution = counts.matched > 0 || counts.no_match > 0;
  const outcome: ExecutionTraceOutcome = hasError
    ? "error"
    : hasCompletedExecution
      ? "ok"
      : "skipped";

  return {
    id,
    label,
    detail: `${matching.length} run · ${statusSummary} · ${elapsedMs} ms`,
    outcome
  };
}

export function deriveExecutionTraceSteps(
  decision: SandboxSecurityDecision,
  requestFacts: EvaluationRequestFacts
): readonly ExecutionTraceStep[] {
  return [
    {
      id: "request_submitted",
      label: "请求提交",
      detail: `CLIENT_SUBMITTED · ${decision.request_id} · stage: ${decision.stage} · client_submitted_at: ${requestFacts.clientSubmittedAt}`,
      outcome: "ok"
    },
    {
      id: "sources_bound",
      label: "来源绑定",
      detail: `${requestFacts.sourceCount} sources · ${requestFacts.requestBytes} B`,
      outcome: "ok"
    },
    deriveDetectorStep(
      "rule_evaluation",
      "规则检测",
      "rule",
      decision.detector_runs
    ),
    deriveDetectorStep(
      "model_evaluation",
      "模型推理",
      "local_model",
      decision.detector_runs
    ),
    deriveDetectorStep(
      "judge_evaluation",
      "外部评审",
      "external_judge",
      decision.detector_runs
    ),
    {
      id: "policy_reduction",
      label: "策略归约",
      detail: `${decision.policy_profile_id} → ${decision.verdict} · ${decision.action} · ${decision.risk_level}`,
      outcome: decision.verdict === "indeterminate" ? "warn" : "ok"
    },
    {
      id: "judgment_complete",
      label: "判定完成",
      detail: `${decision.decision_id} · ${decision.evaluation_mode} · ${decision.created_at}`,
      outcome: "ok"
    }
  ];
}

export function ExecutionTrace({
  decision,
  requestFacts,
  active,
  reduceMotion
}: ExecutionTraceProps) {
  const steps = deriveExecutionTraceSteps(decision, requestFacts);
  const visible = active || reduceMotion;

  return (
    <motion.section
      className="workbench-execution-trace"
      data-testid="execution-trace"
      data-reveal-state={visible ? "visible" : "pending"}
      aria-label="评估执行轨迹"
      aria-hidden={visible ? undefined : true}
      // inert, not opacity, is the interaction gate: it removes the pending
      // subtree from sequential focus navigation entirely.
      inert={!visible}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
      transition={reduceMotion ? { duration: 0 } : CALM_SPRING}
    >
      <p className="workbench-section-eyebrow">EXECUTION TRACE</p>
      <ol>
        {steps.map((step, index) => (
          <motion.li
            key={step.id}
            className={`workbench-trace-step workbench-trace-step--${step.outcome}`}
            data-testid={`execution-step-${step.id}`}
            initial={false}
            animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { ...CALM_SPRING, delay: visible ? index * 0.06 : 0 }
            }
          >
            <span className="workbench-trace-step__dot" aria-hidden="true" />
            <span className="workbench-trace-step__label" data-mono="true">
              {step.id.toUpperCase()}
            </span>
            <span className="workbench-trace-step__detail" title={step.detail}>
              {step.label} · {step.detail}
            </span>
          </motion.li>
        ))}
      </ol>
    </motion.section>
  );
}
