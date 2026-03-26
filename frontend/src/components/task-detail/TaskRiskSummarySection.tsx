import { Col, Row, Typography } from "antd";

import type { RiskSummary } from "../../../../../shared/types/task";

const { Paragraph, Text, Title } = Typography;

function MetricChip({ value }: { value: string }) {
  return (
    <div className="detail-metric">
      <Text strong>{value}</Text>
    </div>
  );
}

export function TaskRiskSummarySection({ riskSummary }: { riskSummary: RiskSummary }) {
  return (
    <section className="console-panel">
      <Title level={2}>Risk Summary</Title>
      <Paragraph className="task-detail-copy">{riskSummary.summary}</Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.total_findings} total findings`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.high_count} high severity`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.medium_count} medium`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.critical_count} critical`} />
        </Col>
      </Row>
    </section>
  );
}
