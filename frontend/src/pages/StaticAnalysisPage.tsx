import { Typography } from "antd";

const { Paragraph, Title } = Typography;

export function StaticAnalysisPage() {
  return (
    <section className="console-panel">
      <Title level={1}>Static Analysis</Title>
      <Paragraph>
        Placeholder page for future static analysis reporting. Overview can link here immediately without
        route churn.
      </Paragraph>
    </section>
  );
}
