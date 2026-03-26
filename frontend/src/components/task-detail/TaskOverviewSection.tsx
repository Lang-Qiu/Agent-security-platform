import { Descriptions, Space, Tag, Typography } from "antd";

import type { Task } from "../../../../../shared/types/task";
import { RiskTag } from "../RiskTag";
import { StatusTag } from "../StatusTag";
import { formatTaskTimestamp, formatTaskTypeLabel } from "../../utils/task-formatters";

const { Paragraph, Text, Title } = Typography;

export function TaskOverviewSection({ task }: { task: Task }) {
  return (
    <section className="console-panel">
      <Title level={2}>Task Overview</Title>
      <Space wrap className="task-detail-tags">
        <StatusTag status={task.status} />
        {task.risk_level ? <RiskTag level={task.risk_level} /> : null}
        <Tag color="geekblue">{formatTaskTypeLabel(task.task_type)}</Tag>
      </Space>
      <Paragraph className="task-detail-copy">{task.summary ?? "Task summary is not available yet."}</Paragraph>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Task ID">
          <Text code>{task.task_id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Title">{task.title}</Descriptions.Item>
        <Descriptions.Item label="Target">{task.target.display_name ?? task.target.target_value}</Descriptions.Item>
        <Descriptions.Item label="Target Type">{task.target.target_type}</Descriptions.Item>
        <Descriptions.Item label="Created At">{formatTaskTimestamp(task.created_at)}</Descriptions.Item>
        <Descriptions.Item label="Updated At">{formatTaskTimestamp(task.updated_at)}</Descriptions.Item>
      </Descriptions>
    </section>
  );
}
