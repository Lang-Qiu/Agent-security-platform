import { Col, Row, Statistic, Typography } from "antd";

import type { SandboxRunResultDetails } from "../../../../../shared/types/result";
import { ResultDetailsFallback } from "./ResultDetailsFallback";

const { Paragraph, Title } = Typography;

function hasSandboxDetails(details: SandboxRunResultDetails): boolean {
  return Boolean(
    details.session_id ||
      details.blocked !== undefined ||
      details.event_count !== undefined ||
      (Array.isArray(details.alerts) && details.alerts.length > 0)
  );
}

export function SandboxAlertSection({ details }: { details: SandboxRunResultDetails }) {
  if (!hasSandboxDetails(details)) {
    return (
      <section className="console-panel">
        <Title level={2}>Sandbox Alert Section</Title>
        <ResultDetailsFallback />
      </section>
    );
  }

  const alertCount = Array.isArray(details.alerts) ? details.alerts.length : 0;

  return (
    <section className="console-panel">
      <Title level={2}>Sandbox Alert Section</Title>
      <Paragraph className="task-detail-copy">
        A stable placeholder for future runtime timelines, policy hits, and sandbox alert evidence.
      </Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Session state" value={details.blocked ? "Blocked session" : "Observation only"} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Alert coverage" value={`${alertCount} alerts captured`} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Runtime events" value={details.event_count ?? 0} />
          </div>
        </Col>
      </Row>
    </section>
  );
}
