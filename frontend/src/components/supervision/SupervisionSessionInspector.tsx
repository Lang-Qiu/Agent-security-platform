import { useState } from "react";
import { Button, Descriptions, DescriptionsProps, Tag, Typography } from "antd";

import type { SandboxSupervisionSessionDetail } from "../../../shared/types/supervision";
import { downloadSupervisionEvidence } from "../../services/supervision-service";
import { RiskTag } from "../RiskTag";
import { SupervisionEventTimeline } from "./SupervisionEventTimeline";

const { Title, Text } = Typography;

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

export interface SupervisionSessionInspectorProps {
  detail: SandboxSupervisionSessionDetail;
}

export function SupervisionSessionInspector({
  detail
}: SupervisionSessionInspectorProps): JSX.Element {
  const { summary } = detail;
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true);
    setDownloadMessage(null);
    try {
      const result = await downloadSupervisionEvidence(summary.session_id);
      if (result === "downloaded") {
        setDownloadMessage("Evidence downloaded.");
      } else {
        setDownloadMessage("Evidence unavailable.");
      }
    } catch {
      setDownloadMessage("Evidence unavailable.");
    } finally {
      setIsDownloading(false);
    }
  };

  const items: DescriptionsProps["items"] = [
    {
      key: "session",
      label: "Session",
      children: <Text code>{summary.session_id}</Text>
    },
    {
      key: "task",
      label: "Task",
      children: <Text type="secondary">{summary.task_id}</Text>
    },
    {
      key: "status",
      label: "Status",
      children: summary.task_status
    },
    {
      key: "risk",
      label: "Risk",
      children: <RiskTag level={summary.risk_level} />
    },
    {
      key: "action",
      label: "Highest action",
      children: (
        <Tag
          color={
            summary.highest_action === "deny"
              ? "red"
              : summary.highest_action === "ask"
                ? "gold"
                : summary.highest_action === "alert"
                  ? "orange"
                  : "green"
          }
        >
          {summary.highest_action}
        </Tag>
      )
    },
    {
      key: "scenario",
      label: "Scenario",
      children: summary.scenario_id ?? "—"
    },
    {
      key: "case",
      label: "Case",
      children: summary.case_id ?? "—"
    },
    {
      key: "blocked",
      label: "Blocked state",
      children: summary.blocked ? "Yes" : "No"
    },
    {
      key: "events",
      label: "Events",
      children: summary.event_count
    },
    {
      key: "decisions",
      label: "Decisions",
      children: summary.decision_count
    },
    {
      key: "alerts",
      label: "Alert records",
      children: summary.alert_count
    },
    {
      key: "blocked-records",
      label: "Blocked records",
      children: summary.blocked_record_count
    },
    {
      key: "updated",
      label: "Updated",
      children: formatTimestamp(summary.updated_at)
    },
    {
      key: "last-event",
      label: "Last event",
      children: summary.last_event_at
        ? formatTimestamp(summary.last_event_at)
        : "—"
    }
  ];

  return (
    <div className="supervision-session-inspector">
      <Title level={2}>Session Inspector</Title>
      <Descriptions column={1} size="small" items={items} />
      <div className="supervision-inspector-actions">
        <Button
          type="default"
          onClick={handleDownload}
          disabled={!summary.evidence_available || isDownloading}
        >
          Download evidence
        </Button>
        {downloadMessage ? (
          <Text type="secondary" className="supervision-download-message">
            {downloadMessage}
          </Text>
        ) : null}
      </div>
      <SupervisionEventTimeline detail={detail} />
    </div>
  );
}
