import { Col, Row, Space, Typography } from "antd";

import type { RiskSummary } from "../../../../../shared/types/task";
import { RiskTag } from "../RiskTag";

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
      <Space style={{ marginBottom: 8 }}>
        <RiskTag level={riskSummary.risk_level} />
      </Space>
      <Paragraph className="task-detail-copy">{riskSummary.summary}</Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.total_findings} total findings`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.critical_count} critical`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.high_count} high severity`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.medium_count} medium`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.low_count} low`} />
        </Col>
        <Col xs={24} sm={12}>
          <MetricChip value={`${riskSummary.info_count} info`} />
        </Col>
      </Row>
    </section>
  );
}
