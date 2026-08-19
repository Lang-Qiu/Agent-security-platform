import { Fragment } from "react";
import {
  AuditOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  RobotOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { motion } from "motion/react";

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision
} from "../../../../shared/types/sandbox-security";
import { CALM_SPRING } from "./showcase/showcase-motion";

// Stage icon tiles + secondary descriptors mirror the reference evidence
// strip: each stage reads as an icon tile with its technical role, not a bare
// dot. Purely presentational (the strip stays aria-hidden).
const STAGE_VISUALS: Record<EvidenceNodeId, { icon: JSX.Element; role: string }> = {
  source: { icon: <DatabaseOutlined />, role: "Input Intake" },
  rule: { icon: <FileSearchOutlined />, role: "Policy Engine" },
  model: { icon: <RobotOutlined />, role: "Local Detectors" },
  judge: { icon: <AuditOutlined />, role: "External Judge" },
  decision: { icon: <ThunderboltOutlined />, role: "Final Action" }
};

// Private visual-tuning targets only. Tests assert relative node order and
// eventual settlement; they never import, mirror, or assert these numbers.
const NODE_REVEAL_AT = [0, 0.6, 0.9, 1.3, 1.8] as const;
const RAIL_REVEAL_AT = [0.2, 0.6, 0.9, 1.3] as const;

type DetectorKind = SandboxDetectorRun["detector_kind"];
type EvidenceNodeId = "source" | "rule" | "model" | "judge" | "decision";
type EvidenceOutcome =
  | "pending"
  | "completed"
  | "timeout"
  | "error"
  | "skipped"
  | "decision-allow"
  | "decision-deny"
  | "decision-alert"
  | "decision-ask"
  | "decision-neutral";

interface EvidenceNode {
  readonly id: EvidenceNodeId;
  readonly label: string;
  readonly outcome: EvidenceOutcome;
}

const DECISION_ACTION_OUTCOME: Record<SandboxSecurityDecision["action"], EvidenceOutcome> = {
  allow: "decision-allow",
  alert: "decision-alert",
  ask: "decision-ask",
  deny: "decision-deny"
};

export type EvidenceTraceProps =
  | {
      state: "idle" | "loading";
      reduceMotion: boolean;
    }
  | {
      state: "result" | "settled";
      decision: SandboxSecurityDecision;
      sourceCount: number;
      reduceMotion: boolean;
    };

function deriveDetectorOutcome(
  runs: readonly SandboxDetectorRun[],
  kind: DetectorKind
): EvidenceOutcome {
  const matching = runs.filter((run) => run.detector_kind === kind);
  if (matching.length === 0 || matching.every((run) => run.status === "skipped")) {
    return "skipped";
  }
  if (
    matching.some(
      (run) => run.status === "failed" || run.status === "invalid_result"
    )
  ) {
    return "error";
  }
  if (matching.some((run) => run.status === "timeout")) return "timeout";
  if (
    matching.some(
      (run) => run.status === "matched" || run.status === "no_match"
    )
  ) {
    return "completed";
  }
  return "skipped";
}

function deriveDecisionOutcome(
  decision: SandboxSecurityDecision
): EvidenceOutcome {
  if (decision.verdict === "indeterminate") return "decision-neutral";
  return DECISION_ACTION_OUTCOME[decision.action];
}

export function deriveEvidenceNodes(
  decision: SandboxSecurityDecision,
  sourceCount: number
): readonly EvidenceNode[] {
  return [
    {
      id: "source",
      label: "SOURCE",
      outcome: sourceCount > 0 ? "completed" : "skipped"
    },
    {
      id: "rule",
      label: "RULE",
      outcome: deriveDetectorOutcome(decision.detector_runs, "rule")
    },
    {
      id: "model",
      label: "MODEL",
      outcome: deriveDetectorOutcome(decision.detector_runs, "local_model")
    },
    {
      id: "judge",
      label: "JUDGE",
      outcome: deriveDetectorOutcome(decision.detector_runs, "external_judge")
    },
    {
      id: "decision",
      label: "DECISION",
      outcome: deriveDecisionOutcome(decision)
    }
  ];
}

const INERT_NODES: readonly EvidenceNode[] = [
  { id: "source", label: "SOURCE", outcome: "pending" },
  { id: "rule", label: "RULE", outcome: "pending" },
  { id: "model", label: "MODEL", outcome: "pending" },
  { id: "judge", label: "JUDGE", outcome: "pending" },
  { id: "decision", label: "DECISION", outcome: "pending" }
];

export function EvidenceTrace(props: EvidenceTraceProps) {
  const hasResult = props.state === "result" || props.state === "settled";
  const presenting = props.state === "result" && !props.reduceMotion;
  const nodes = hasResult
    ? deriveEvidenceNodes(
        (props as { decision: SandboxSecurityDecision }).decision,
        (props as { sourceCount: number }).sourceCount
      )
    : INERT_NODES;

  return (
    <div
      className="workbench-evidence-trace"
      data-testid="evidence-trace"
      data-state={props.state}
      data-animated={presenting ? "true" : "false"}
      aria-hidden="true"
    >
      {nodes.map((node, index) => (
        <Fragment key={node.id}>
          {index > 0 ? (
            <motion.span
              className="workbench-evidence-trace__rail"
              initial={presenting ? { scaleX: 0, opacity: 0.15 } : false}
              animate={{
                scaleX: 1,
                opacity: hasResult ? 1 : 0.15
              }}
              transition={
                presenting
                  ? { ...CALM_SPRING, delay: RAIL_REVEAL_AT[index - 1] }
                  : { duration: 0 }
              }
            />
          ) : null}
          <span className="workbench-evidence-trace__item">
            <span className="workbench-evidence-trace__tile">
              <span aria-hidden="true">{STAGE_VISUALS[node.id].icon}</span>
              <motion.span
                className="workbench-evidence-trace__node"
                data-testid={`evidence-node-${node.id}`}
                data-node={node.id}
                data-outcome={node.outcome}
                initial={presenting ? { opacity: 0.15, scale: 0.8 } : false}
                animate={{
                  opacity: hasResult ? 1 : 0.15,
                  scale: hasResult ? 1 : 0.8
                }}
                transition={
                  presenting
                    ? { ...CALM_SPRING, delay: NODE_REVEAL_AT[index] }
                    : { duration: 0 }
                }
              />
              {node.id === "decision" && presenting ? (
                <motion.span
                  className="workbench-evidence-trace__decision-glow"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.7, 1.6, 1.9] }}
                  transition={{ duration: 0.6, delay: 1.8, ease: "easeOut" }}
                />
              ) : null}
            </span>
            <span className="workbench-evidence-trace__item-text">
              <span className="workbench-evidence-trace__label">{node.label}</span>
              <span className="workbench-evidence-trace__role">
                {STAGE_VISUALS[node.id].role}
              </span>
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
