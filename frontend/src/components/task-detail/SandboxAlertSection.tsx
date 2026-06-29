import { Col, Row, Statistic, Typography } from "antd";

import type { SandboxSupervisionSessionDetail } from "../../../shared/types/supervision";
import { ResultDetailsFallback } from "./ResultDetailsFallback";

const { Title } = Typography;

function formatToken(value: string): string {
  return value.replace(/_/g, " ");
}

export function SandboxAlertSection({
  supervision
}: {
  supervision: SandboxSupervisionSessionDetail | null;
}) {
  if (!supervision) {
    return (
      <section className="console-panel">
        <Title level={2}>Sandbox Alert Section</Title>
        <ResultDetailsFallback />
      </section>
    );
  }

  const { summary, alerts, policy_decisions } = supervision;
  const latestAlert = alerts[0];
  const latestDecision = policy_decisions[0];
  const latestSignal =
    latestAlert?.category ?? latestDecision?.reason_code ?? null;

  return (
    <section className="console-panel">
      <Title level={2}>Sandbox Alert Section</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic
              title="Session state"
              value={summary.blocked ? "Blocked session" : "Observation only"}
            />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic
              title="Highest action"
              value={formatToken(summary.highest_action)}
            />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic
              title="Alert coverage"
              value={`${summary.alert_count} alerts captured`}
            />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Runtime events" value={summary.event_count} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic
              title="Blocked records"
              value={summary.blocked_record_count}
            />
          </div>
        </Col>
        {latestSignal ? (
          <Col xs={24} md={8}>
            <div className="detail-metric">
              <Statistic
                title="Latest signal"
                value={formatToken(latestSignal)}
              />
            </div>
          </Col>
        ) : null}
      </Row>
    </section>
  );
}
