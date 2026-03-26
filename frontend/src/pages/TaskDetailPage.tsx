import { Divider, Typography } from "antd";
import { useParams } from "react-router-dom";

const { Paragraph, Title } = Typography;

export function TaskDetailPage() {
  const { taskId } = useParams();

  return (
    <section className="console-panel">
      <Title level={1}>Task Detail</Title>
      <Paragraph>Future task detail content will mount here without changing the global app shell.</Paragraph>
      <Divider />
      <Paragraph>
        Current route parameter: <strong>{taskId ?? "task_demo_001"}</strong>
      </Paragraph>
    </section>
  );
}
