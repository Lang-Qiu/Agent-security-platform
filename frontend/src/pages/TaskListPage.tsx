import { Button, Space, Typography } from "antd";

const { Paragraph, Title } = Typography;

export function TaskListPage() {
  return (
    <section className="console-panel">
      <Title level={1}>Tasks</Title>
      <Paragraph>
        This route is reserved for the task queue workspace. The layout, navigation, and shared view-model
        entry point are now stable for the next requirement.
      </Paragraph>
      <Space>
        <Button type="primary">Create Task</Button>
        <Button>View Queue Filters</Button>
      </Space>
    </section>
  );
}
