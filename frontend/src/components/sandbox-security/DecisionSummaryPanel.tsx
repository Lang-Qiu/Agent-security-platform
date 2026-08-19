import { ExclamationCircleFilled, SafetyOutlined } from "@ant-design/icons";
import { Alert, Space, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";
import { REDUCED_TRANSITION, verdictSpring } from "./showcase/showcase-motion";

const { Text } = Typography;

const VERDICT_TITLES: Record<SandboxSecurityDecision["verdict"], string> = {
  risk_detected: "RISK DETECTED",
  no_detected_risk: "NO DETECTED RISK"
};

function severityRank(level: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[level] ?? 0;
}

function formatDurationMs(ms: number): string {
  const rounded = Math.max(0, Math.round(ms));
  if (rounded >= 60000) {
    const minutes = Math.floor(rounded / 60000);
    const seconds = Math.round((rounded % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${rounded.toLocaleString("en-US")} ms`;
}

export interface DecisionSummaryPanelProps {
  decision: SandboxSecurityDecision;
  variant?: "summary" | "workbench";
  active?: boolean;
  reduceMotion?: boolean;
}

function DecisionCaveats({ decision }: { decision: SandboxSecurityDecision }) {
  return (
    <>
      <Text type="warning">本结果仅为模拟评估，不可用于实际拦截。</Text>
      {decision.verdict === "no_detected_risk" ? (
        <Alert
          type="info"
          showIcon
          title="未检出风险并不证明输入安全；这只是在当前证据与策略下未发现风险。"
        />
      ) : null}
    </>
  );
}

function SummaryVariant({ decision }: { decision: SandboxSecurityDecision }) {
  return (
    <section className="console-panel" aria-label="评估决策摘要">
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <div role="status" aria-live="polite">
          <Space size="small" wrap>
            <SandboxSecurityValueTag domain="verdict" value={decision.verdict} />
            <SandboxSecurityValueTag domain="action" value={decision.action} />
            <SandboxSecurityValueTag domain="risk_level" value={decision.risk_level} />
          </Space>
        </div>
        <div>
          <SandboxSecurityValueTag domain="stage" value={decision.stage} />
          <SandboxSecurityValueTag domain="profile" value={decision.policy_profile_id} />
        </div>
        <div>
          <Text type="secondary">决策标识：</Text>
          <Text data-mono="true">{decision.decision_id}</Text>
        </div>
        <div>
          <Text type="secondary">请求标识：</Text>
          <Text data-mono="true">{decision.request_id}</Text>
        </div>
        <div>
          <Text type="secondary">评估模式：</Text>
          <Text>{decision.evaluation_mode}</Text>
        </div>
        <DecisionCaveats decision={decision} />
      </Space>
    </section>
  );
}

function WorkbenchVariant({
  decision,
  active,
  reduceMotion
}: {
  decision: SandboxSecurityDecision;
  active: boolean;
  reduceMotion: boolean;
}) {
  const visible = active || reduceMotion;

  const acceptedFindings = decision.findings.length;
  const detectorsRun = decision.detector_runs.filter(
    (run) => run.status !== "skipped"
  ).length;
  const totalElapsedMs = decision.detector_runs.reduce(
    (sum, run) => sum + run.elapsed_ms,
    0
  );
  const maxSeverity = decision.findings.reduce(
    (top, finding) => (severityRank(finding.severity) > severityRank(top) ? finding.severity : top),
    "info" as SandboxSecurityDecision["risk_level"]
  );
  const maxConfidence = decision.findings.reduce(
    (top, finding) => Math.max(top, finding.confidence),
    0
  );
  const riskDetected = decision.verdict === "risk_detected";
  const topFinding = decision.findings.reduce(
    (top, finding) =>
      severityRank(finding.severity) > severityRank(top.severity) ||
      (severityRank(finding.severity) === severityRank(top.severity) &&
        finding.confidence > top.confidence)
        ? finding
        : top,
    decision.findings[0]
  );

  return (
    <motion.section
      className="console-panel workbench-decision-hero"
      aria-label="评估决策摘要"
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      data-reveal-state={visible ? "visible" : "pending"}
      data-risk={decision.risk_level}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.95 }}
      transition={
        reduceMotion ? REDUCED_TRANSITION : verdictSpring(decision.risk_level)
      }
    >
      {visible ? (
        <div className="workbench-decision-hero__content">
          <div className="workbench-decision-hero__stage">
            <span
              className="workbench-decision-hero__emblem"
              aria-hidden="true"
              data-risk={decision.risk_level}
            >
              {riskDetected ? <ExclamationCircleFilled /> : <SafetyOutlined />}
            </span>
            <div className="workbench-decision-hero__body">
              <p className="workbench-decision-hero__title">
                {VERDICT_TITLES[decision.verdict]}
              </p>
              <p
                className="workbench-decision-hero__action"
                data-mono="true"
              >
                {decision.action === "ask"
                  ? "REQUIRE REVIEW"
                  : decision.action === "deny"
                    ? "DENY · 拒绝"
                    : decision.action === "alert"
                      ? "ALERT · 告警"
                      : "ALLOW · 放行"}
              </p>
              <div className="workbench-decision-hero__tags">
                <SandboxSecurityValueTag domain="verdict" value={decision.verdict} />
                <SandboxSecurityValueTag domain="action" value={decision.action} />
                <SandboxSecurityValueTag domain="risk_level" value={decision.risk_level} />
              </div>
              <p className="workbench-decision-hero__summary">
                {acceptedFindings > 0 && topFinding
                  ? `${acceptedFindings} 项风险发现 · 最高严重级别 ${maxSeverity} · 首要类别 ${topFinding.category}`
                  : "未产生风险发现"}
              </p>
            </div>
            <dl className="workbench-decision-hero__stats">
              <div>
                <dt>SEVERITY</dt>
                <dd data-mono="true">{decision.risk_level}</dd>
              </div>
              <div>
                <dt>CONFIDENCE</dt>
                <dd>
                  <span
                    className="workbench-decision-hero__confidence-track"
                    aria-hidden="true"
                  >
                    <span
                      className="workbench-decision-hero__confidence-fill"
                      style={{ width: `${Math.round(maxConfidence * 100)}%` }}
                    />
                  </span>
                  <span data-mono="true">{maxConfidence.toFixed(2)}</span>
                </dd>
              </div>
              <div>
                <dt>检测器</dt>
                <dd data-mono="true">{detectorsRun}</dd>
              </div>
              <div>
                <dt>耗时</dt>
                <dd data-mono="true">{formatDurationMs(totalElapsedMs)}</dd>
              </div>
            </dl>
          </div>

          <div className="workbench-decision-hero__meta">
            <div
              className="workbench-decision-hero__context-chips"
              aria-hidden="true"
            >
              <span data-mono="true">{decision.stage}</span>
              <span data-mono="true">{decision.policy_profile_id}</span>
            </div>
            <dl>
              <div>
                <dt>decision_id</dt>
                <dd data-mono="true">{decision.decision_id}</dd>
              </div>
              <div>
                <dt>request_id</dt>
                <dd data-mono="true">{decision.request_id}</dd>
              </div>
              <div>
                <dt>evaluation_mode</dt>
                <dd data-mono="true">{decision.evaluation_mode}</dd>
              </div>
            </dl>
            <DecisionCaveats decision={decision} />
          </div>
        </div>
      ) : (
        <div className="workbench-decision-hero__reserve" aria-hidden="true" />
      )}
    </motion.section>
  );
}

export function DecisionSummaryPanel({
  decision,
  variant = "summary",
  active = true,
  reduceMotion = false
}: DecisionSummaryPanelProps) {
  return variant === "workbench" ? (
    <WorkbenchVariant
      decision={decision}
      active={active}
      reduceMotion={reduceMotion}
    />
  ) : (
    <SummaryVariant decision={decision} />
  );
}
