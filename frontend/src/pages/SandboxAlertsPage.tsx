import { Typography } from "antd";

const { Paragraph, Title } = Typography;

export function SandboxAlertsPage() {
  return (
    <section className="console-panel">
      <Title level={1}>Sandbox Alerts</Title>
      <Paragraph>
        Placeholder page for future runtime monitoring and block events. The admin shell is ready for this
        monitoring surface.
      </Paragraph>
    </section>
  );
}
