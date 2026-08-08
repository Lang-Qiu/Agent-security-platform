import { Alert, Space, Typography } from "antd";

import type { SandboxSecurityDecision } from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";

const { Text } = Typography;

export interface DecisionSummaryPanelProps {
  decision: SandboxSecurityDecision;
}

/**
 * Presentational decision summary. Verdict and action are announced in a live
 * region (`role="status"`). The decision is always labelled `simulation` and
 * described as not usable for real interception; a `no_detected_risk` verdict is
 * explained as not a safety proof, matching the Engine's evidence-bounded
 * semantics. Decision identity renders in a monospace-marked element.
 */
export function DecisionSummaryPanel({ decision }: DecisionSummaryPanelProps) {
  return (
    <section className="console-panel" aria-label="评估决策摘要">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        <div role="status">
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
          <Text data-mono="true" style={{ fontFamily: "var(--console-mono)" }}>
            {decision.decision_id}
          </Text>
        </div>
        <div>
          <Text type="secondary">请求标识：</Text>
          <Text data-mono="true" style={{ fontFamily: "var(--console-mono)" }}>
            {decision.request_id}
          </Text>
        </div>
        <div>
          <Text type="secondary">评估模式：</Text>
          <Text>{decision.evaluation_mode}</Text>
        </div>
        <Text type="warning">本结果仅为模拟评估，不可用于实际拦截。</Text>
        {decision.verdict === "no_detected_risk" ? (
          <Alert
            type="info"
            showIcon
            title="未检出风险并不证明输入安全；这只是在当前证据与策略下未发现风险。"
          />
        ) : null}
      </Space>
    </section>
  );
}
