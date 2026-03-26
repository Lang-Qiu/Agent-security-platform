import { Col, Row, Statistic, Typography } from "antd";

import type { StaticAnalysisResultDetails } from "../../../../../shared/types/result";
import { ResultDetailsFallback } from "./ResultDetailsFallback";

const { Paragraph, Title } = Typography;

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

  const ruleHitsCount = Array.isArray(details.rule_hits) ? details.rule_hits.length : 0;

  return (
    <section className="console-panel">
      <Title level={2}>Static Analysis Result Section</Title>
      {summary ? <Paragraph className="task-detail-copy">{summary}</Paragraph> : null}
      <Paragraph className="task-detail-copy">
        A stable placeholder for rule hits, capability summaries, and source-level review in later slices.
      </Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Primary language" value={details.language ?? "Unknown"} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Coverage" value={`${details.files_scanned ?? 0} files scanned`} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Rule hits" value={`${ruleHitsCount} tracked`} />
          </div>
        </Col>
      </Row>
    </section>
  );
}
