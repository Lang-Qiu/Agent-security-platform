import { Col, Descriptions, Empty, List, Row, Statistic, Tag, Typography } from "antd";

import type { SkillsStaticRuleHit } from "../../../../../shared/types/skills-static-rule-hit";
import type { StaticAnalysisResultDetails } from "../../../../../shared/types/result";
import { ResultDetailsFallback } from "./ResultDetailsFallback";

const { Paragraph, Text, Title } = Typography;

const SEVERITY_COLORS: Record<string, string> = {
  critical: "red",
  high: "orange",
  medium: "gold",
  low: "blue",
  info: "default"
};

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity] ?? "default";
}

function RuleHitItem({ hit }: { hit: SkillsStaticRuleHit }) {
  return (
    <List.Item>
      <div style={{ width: "100%" }}>
        {hit.title ? (
          <div style={{ marginBottom: 2 }}>
            <Text strong>{hit.title}</Text>
          </div>
        ) : null}
        <div style={{ marginBottom: 4 }}>
          <Tag color={severityColor(hit.severity)}>{hit.severity}</Tag>
          {hit.category ? (
            <Tag color="geekblue" style={{ marginRight: 8 }}>
              {hit.category}
            </Tag>
          ) : null}
          <Text code style={{ marginRight: 8 }}>
            {hit.rule_id}
          </Text>
          <Text>{hit.message}</Text>
        </div>
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary">{hit.file_path}</Text>
          {hit.line_start !== undefined && hit.line_end !== undefined ? (
            <Text type="secondary" style={{ marginLeft: 2 }}>
              :{hit.line_start}–{hit.line_end}
            </Text>
          ) : null}
        </div>
        {hit.code_snippet ? (
          <pre style={{ margin: "4px 0", padding: "4px 8px", background: "#f5f5f5", borderRadius: 4, fontSize: 12 }}>
            {hit.code_snippet}
          </pre>
        ) : null}
        {hit.recommendation ? (
          <Paragraph style={{ margin: "4px 0" }} type="secondary">
            {hit.recommendation}
          </Paragraph>
        ) : null}
        {Array.isArray(hit.tags) && hit.tags.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            {hit.tags.map((tag) => (
              <Tag key={tag} style={{ fontSize: 11 }}>
                {tag}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>
    </List.Item>
  );
}

function hasStaticDetails(details: StaticAnalysisResultDetails): boolean {
  return Boolean(
    details.language ||
      details.sample_name ||
      details.files_scanned !== undefined ||
      (Array.isArray(details.rule_hits) && details.rule_hits.length > 0)
  );
}

export function StaticAnalysisResultSection({
  details,
  summary
}: {
  details: StaticAnalysisResultDetails;
  summary?: string;
}) {
  if (!hasStaticDetails(details)) {
    return (
      <section className="console-panel">
        <Title level={2}>Static Analysis Result Section</Title>
        <ResultDetailsFallback />
      </section>
    );
  }

  const ruleHits = Array.isArray(details.rule_hits) ? details.rule_hits : [];
  const capabilities = Array.isArray(details.sensitive_capabilities) ? details.sensitive_capabilities : [];

  return (
    <section className="console-panel">
      <Title level={2}>Static Analysis Result Section</Title>
      {summary ? <Paragraph className="task-detail-copy">{summary}</Paragraph> : null}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={6}>
          <div className="detail-metric">
            <Statistic title="Sample" value={details.sample_name ?? "—"} />
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="detail-metric">
            <Statistic title="Primary language" value={details.language ?? "Unknown"} />
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="detail-metric">
            <Statistic title="Coverage" value={`${details.files_scanned ?? 0} files scanned`} />
          </div>
        </Col>
        <Col xs={24} md={6}>
          <div className="detail-metric">
            <Statistic title="Rule hits" value={`${ruleHits.length} tracked`} />
          </div>
        </Col>
      </Row>

      {Array.isArray(details.entry_files) && details.entry_files.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <Title level={4}>Entry Files</Title>
          <div>
            {details.entry_files.map((file) => (
              <div key={file}>
                <Text code>{file}</Text>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Title level={4}>Rule Hits</Title>
      {ruleHits.length > 0 ? (
        <List
          dataSource={ruleHits}
          renderItem={(hit) => <RuleHitItem hit={hit} />}
          size="small"
          bordered
        />
      ) : (
        <Empty description="No rule hits detected." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}

      {capabilities.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>Sensitive Capabilities</Title>
          <div>
            {capabilities.map((cap) => (
              <Tag key={cap} color="volcano" style={{ marginBottom: 4 }}>
                {cap}
              </Tag>
            ))}
          </div>
        </div>
      ) : null}

      {details.dependency_summary && Object.keys(details.dependency_summary).length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Title level={4}>Dependency Summary</Title>
          <Descriptions column={1} size="small" bordered>
            {Object.entries(details.dependency_summary).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                {String(value)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>
      ) : null}
    </section>
  );
}
