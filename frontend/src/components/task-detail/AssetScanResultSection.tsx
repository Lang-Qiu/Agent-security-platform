import { Col, Row, Statistic, Typography } from "antd";

import type { AssetScanResultDetails } from "../../../../../shared/types/result";
import { ResultDetailsFallback } from "./ResultDetailsFallback";

const { Paragraph, Title } = Typography;

function hasAssetDetails(details: AssetScanResultDetails): boolean {
  return Boolean(
    details.confidence !== undefined ||
      (Array.isArray(details.open_ports) && details.open_ports.length > 0) ||
      (Array.isArray(details.findings) && details.findings.length > 0)
  );
}

export function AssetScanResultSection({
  details,
  summary
}: {
  details: AssetScanResultDetails;
  summary?: string;
}) {
  if (!hasAssetDetails(details)) {
    return (
      <section className="console-panel">
        <Title level={2}>Asset Scan Result Section</Title>
        <ResultDetailsFallback />
      </section>
    );
  }

  const openPortsCount = Array.isArray(details.open_ports) ? details.open_ports.length : 0;
  const findingsCount = Array.isArray(details.findings) ? details.findings.length : 0;

  return (
    <section className="console-panel">
      <Title level={2}>Asset Scan Result Section</Title>
      {summary ? <Paragraph className="task-detail-copy">{summary}</Paragraph> : null}
      <Paragraph className="task-detail-copy">
        A stable placeholder for future asset fingerprint, endpoint exposure, and finding breakdown views.
      </Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic
              title="Fingerprint confidence"
              value={details.confidence ? Math.round(details.confidence * 100) : 0}
              suffix="%"
            />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Network exposure" value={`${openPortsCount} open ports`} />
          </div>
        </Col>
        <Col xs={24} md={8}>
          <div className="detail-metric">
            <Statistic title="Findings" value={`${findingsCount} tracked`} />
          </div>
        </Col>
      </Row>
    </section>
  );
}
