import { ArrowRightOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Empty, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { Task } from "../../../../shared/types/task";
import { DataSourceTag } from "../components/DataSourceTag";
import { RiskTag } from "../components/RiskTag";
import { StatusTag } from "../components/StatusTag";
import { listTasks, type TaskDataSource } from "../services/task-service";

const { Paragraph, Text, Title } = Typography;

function formatTaskType(taskType: Task["task_type"]): string {
  switch (taskType) {
    case "asset_scan":
      return "Asset Scan";
    case "static_analysis":
      return "Static Analysis";
    case "sandbox_run":
      return "Sandbox Run";
  }
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

function createTaskColumns(): ColumnsType<Task> {
  return [
    {
      title: "Task ID",
      dataIndex: "task_id",
      key: "task_id",
      render: (value: string) => <Text code>{value}</Text>
    },
    {
      title: "Task Type",
      dataIndex: "task_type",
      key: "task_type",
      render: (value: Task["task_type"]) => formatTaskType(value)
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (value: Task["status"]) => <StatusTag status={value} />
    },
    {
      title: "Risk Level",
      dataIndex: "risk_level",
      key: "risk_level",
      render: (value?: Task["risk_level"]) => (value ? <RiskTag level={value} /> : <Text type="secondary">N/A</Text>)
    },
    {
      title: "Created At",
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string) => <Text>{formatCreatedAt(value)}</Text>
    },
    {
      title: "Action",
      key: "action",
      align: "right",
      render: (_, record) => (
        <Link to={`/tasks/${record.task_id}`} aria-label={`View details for ${record.task_id}`}>
          View Details
        </Link>
      )
    }
  ];
}

function TaskTable({ tasks, loading }: { tasks: Task[]; loading: boolean }) {
  return (
    <Table<Task>
      rowKey="task_id"
      columns={createTaskColumns()}
      dataSource={tasks}
      loading={loading}
      pagination={false}
      locale={{
        emptyText: (
          <Empty
            description={
              <>
                <div>No tasks available yet</div>
                <div>Create or sync tasks to populate the queue workspace.</div>
              </>
            }
          />
        )
      }}
    />
  );
}

export function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [source, setSource] = useState<TaskDataSource>("mock");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    void listTasks({ signal: controller.signal }).then((nextData) => {
      if (!isActive) {
        return;
      }

      setTasks(nextData.tasks);
      setSource(nextData.source);
      setLoading(false);
    });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="tasks-page">
      <section className="console-panel tasks-hero">
        <div>
          <Text className="eyebrow">Task queue workspace</Text>
          <Title level={1}>Tasks</Title>
          <Paragraph className="tasks-copy">
            Review platform tasks across asset scanning, static analysis, and sandbox execution before the
            live backend list view takes over.
          </Paragraph>
        </div>
        <Space wrap>
          <Button type="primary" icon={<ArrowRightOutlined />}>
            Create Task
          </Button>
          <Button icon={<SyncOutlined />}>Sync Queue</Button>
        </Space>
      </section>

      <section className="console-panel">
        <div className="tasks-table-header">
          <div>
            <Title level={2}>Active Queue</Title>
            <Paragraph className="tasks-copy">
              The first slice keeps the list structure stable: shared status, shared risk level, and a
              consistent detail entry for each task.
            </Paragraph>
          </div>
          <Space wrap>
            <DataSourceTag source={source} />
            <Text type="secondary">{tasks.length} task(s)</Text>
          </Space>
        </div>

        <TaskTable tasks={tasks} loading={loading} />
      </section>
    </div>
  );
}
