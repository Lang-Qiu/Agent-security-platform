import { Button, Empty, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { AssetScanResultDetails, StaticAnalysisResultDetails, SandboxRunResultDetails } from "../../../../shared/types/result";
import type { Task } from "../../../../shared/types/task";
import { AssetScanResultSection } from "../components/task-detail/AssetScanResultSection";
import { SandboxAlertSection } from "../components/task-detail/SandboxAlertSection";
import { StaticAnalysisResultSection } from "../components/task-detail/StaticAnalysisResultSection";
import { TaskOverviewSection } from "../components/task-detail/TaskOverviewSection";
import { getTaskDetail, type TaskDetailData } from "../services/task-service";

const { Paragraph, Text, Title } = Typography;

function TaskDetailSections({ detail }: { detail: TaskDetailData }) {
  const details = detail.result.details;

  switch (detail.task.task_type) {
    case "asset_scan":
      return <AssetScanResultSection details={details as AssetScanResultDetails} />;
    case "static_analysis":
      return <StaticAnalysisResultSection details={details as StaticAnalysisResultDetails} />;
    case "sandbox_run":
      return <SandboxAlertSection details={details as SandboxRunResultDetails} />;
  }
}

function TaskDetailHero({ task }: { task: Task }) {
  return (
    <section className="console-panel task-detail-hero">
      <div>
        <Text className="eyebrow">Task inspection workspace</Text>
        <Title level={1}>Task Detail</Title>
        <Paragraph className="task-detail-copy">
          Inspect one task at a time through a stable shared shell before plugging in full engine-specific
          visualizations.
        </Paragraph>
      </div>
      <Space wrap>
        <Button>
          <Link to="/tasks">Back to Tasks</Link>
        </Button>
        <Text code>{task.task_id}</Text>
      </Space>
    </section>
  );
}

export function TaskDetailPage() {
  const { taskId } = useParams();
  const [detail, setDetail] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    void getTaskDetail(taskId, { signal: controller.signal }).then((nextDetail) => {
      if (!isActive) {
        return;
      }

      setDetail(nextDetail);
      setLoading(false);
    });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [taskId]);

  if (loading) {
    return (
      <section className="console-panel">
        <Title level={1}>Task Detail</Title>
        <Paragraph className="task-detail-copy">Loading task detail...</Paragraph>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="console-panel">
        <Title level={1}>Task Detail</Title>
        <Empty description="Task detail is not available yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </section>
    );
  }

  return (
    <div className="task-detail-page">
      <TaskDetailHero task={detail.task} />
      <div className="task-detail-grid">
        <TaskOverviewSection task={detail.task} />
        <TaskDetailSections detail={detail} />
      </div>
    </div>
  );
}
