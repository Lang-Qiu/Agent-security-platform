import { Alert, Space, Typography } from "antd";
import { motion } from "motion/react";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";
import { VerdictHero } from "./showcase/VerdictHero";
import { REDUCED_TRANSITION, verdictSpring } from "./showcase/showcase-motion";

const { Text } = Typography;

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

  return (
    <motion.section
      className="console-panel workbench-decision-hero"
      aria-label="评估决策摘要"
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      data-reveal-state={visible ? "visible" : "pending"}
      initial={false}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.95 }}
      transition={
        reduceMotion ? REDUCED_TRANSITION : verdictSpring(decision.risk_level)
      }
    >
      {visible ? (
        <div className="workbench-decision-hero__content">
          <div
            className="workbench-decision-hero__context-chips"
            aria-hidden="true"
          >
            <span data-mono="true">{decision.stage}</span>
            <span data-mono="true">{decision.policy_profile_id}</span>
          </div>
          <VerdictHero decision={decision} active reduceMotion={reduceMotion} />
          <details className="workbench-decision-hero__meta">
            <summary data-mono="true">决策标识 · {decision.decision_id}</summary>
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
          </details>
          <DecisionCaveats decision={decision} />
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
