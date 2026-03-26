import { ArrowRightOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Col, Row, Space, Statistic, Typography } from "antd";
import { Link } from "react-router-dom";

import { RiskTag } from "../components/RiskTag";
import { StatusTag } from "../components/StatusTag";
import { overviewActivity, overviewMetrics, overviewRisks, overviewShortcuts } from "../mocks/overview";

const { Paragraph, Text, Title } = Typography;

function OverviewHero() {
  return (
    <section className="console-panel overview-hero">
      <div>
        <Text className="eyebrow">Security operations workspace</Text>
        <Title level={1}>Overview</Title>
        <Paragraph className="overview-copy">
          A lightweight console shell for task orchestration, risk review, and future detail pages. This
          first slice keeps the information architecture stable while backend and shared contracts continue
          to grow.
        </Paragraph>
      </div>
      <Space wrap>
        <Button type="primary" icon={<ArrowRightOutlined />}>
          Open Task Queue
        </Button>
        <Button icon={<SafetyCertificateOutlined />}>Review Risk Posture</Button>
      </Space>
    </section>
  );
}

function OverviewMetricStrip() {
  return (
    <section className="console-panel">
      <Title level={2}>Platform Snapshot</Title>
      <Row gutter={[16, 16]}>
        {overviewMetrics.map((metric) => (
          <Col xs={24} sm={12} xl={6} key={metric.label}>
            <div className="metric-tile">
              <Statistic title={metric.label} value={metric.value} />
              <Text className="metric-helper">{metric.helper}</Text>
            </div>
          </Col>
        ))}
      </Row>
    </section>
  );
}

function OverviewQuickStart() {
  return (
    <section className="console-panel">
      <Title level={2}>Quick Start</Title>
      <div className="stack-list">
        {overviewShortcuts.map((shortcut) => (
          <div className="stack-item" key={shortcut.to}>
            <div className="stack-item-body">
              <Text strong>{shortcut.title}</Text>
              <Paragraph className="stack-item-copy">{shortcut.description}</Paragraph>
            </div>
            <Button type="link">
              <Link to={shortcut.to}>Open</Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewActivityPanel() {
  return (
    <section className="console-panel">
      <Title level={2}>Recent Task Activity</Title>
      <div className="stack-list">
        {overviewActivity.map((item) => (
          <div className="stack-item" key={item.id}>
            <div className="stack-item-body">
              <Space wrap>
                <Text strong>{item.title}</Text>
                <StatusTag status={item.status} />
                <RiskTag level={item.riskLevel} />
              </Space>
              <Paragraph className="stack-item-copy">{item.detail}</Paragraph>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewRiskPanel() {
  return (
    <section className="console-panel">
      <Title level={2}>Risk Posture</Title>
      <div className="stack-list">
        {overviewRisks.map((item) => (
          <div className="stack-item" key={item.id}>
            <div className="stack-item-body">
              <Space wrap>
                <Text strong>{item.title}</Text>
                <RiskTag level={item.level} />
              </Space>
              <Paragraph className="stack-item-copy">{item.description}</Paragraph>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OverviewPage() {
  return (
    <div className="overview-page">
      <OverviewHero />
      <OverviewMetricStrip />
      <div className="overview-grid">
        <OverviewQuickStart />
        <OverviewRiskPanel />
      </div>
      <OverviewActivityPanel />
    </div>
  );
}
