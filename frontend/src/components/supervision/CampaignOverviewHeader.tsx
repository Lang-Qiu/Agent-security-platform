// P5-T3: Campaign overview header.
//
// Compact, read-only band showing campaign status, progress (X / 9), and the
// four aggregate safety counts (alerts/blocked/asks/retries). The header is
// the single source of the `data-evidence-state` marker that Phase 6
// screenshot capture waits on:
//   - fresh + completed        -> "fresh-completed"
//   - fresh + non-completed    -> "fresh-running"
//   - stale                    -> "stale"
//
// No marketing hero, decorative gradients, nested cards, or explanatory
// feature text. No command surfaces — campaign mode is read-only.

import { SyncOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";

import type { Track1CampaignStatus, Track1CampaignSummary } from "../../../../shared/types/campaign-supervision";
import type {
  CampaignFreshness,
  CampaignSource
} from "../../hooks/useCampaignSupervisionPolling";

const { Text } = Typography;

const CAMPAIGN_STATUS_LABEL: Record<Track1CampaignStatus, string> = {
  created: "Created",
  validating: "Validating",
  running: "Running",
  collecting: "Collecting",
  completed: "Completed",
  failed: "Failed"
};

const CAMPAIGN_STATUS_COLOR: Record<Track1CampaignStatus, string> = {
  created: "default",
  validating: "processing",
  running: "processing",
  collecting: "processing",
  completed: "success",
  failed: "error"
};

function evidenceState(
  status: Track1CampaignStatus,
  freshness: CampaignFreshness
): "fresh-running" | "fresh-completed" | "stale" {
  if (freshness === "stale") return "stale";
  return status === "completed" ? "fresh-completed" : "fresh-running";
}

function sourceLabel(source: CampaignSource): { color: string; text: string } {
  if (source === "api") return { color: "green", text: "Backend API" };
  if (source === "integration-error") {
    return { color: "red", text: "Integration Error" };
  }
  return { color: "gold", text: "Mock Fallback" };
}

export interface CampaignOverviewHeaderProps {
  summary: Track1CampaignSummary;
  source: CampaignSource;
  freshness: CampaignFreshness;
  onRetry: () => void;
}

export function CampaignOverviewHeader({
  summary,
  source,
  freshness,
  onRetry
}: CampaignOverviewHeaderProps) {
  const evidence = evidenceState(summary.status, freshness);
  const sourceMeta = sourceLabel(source);
  const isStale = freshness === "stale";

  return (
    <header
      className="campaign-overview-header"
      data-testid="campaign-overview"
      data-evidence-state={evidence}
    >
      <div className="campaign-overview-header__status">
        <Tag color={CAMPAIGN_STATUS_COLOR[summary.status]}>
          {CAMPAIGN_STATUS_LABEL[summary.status]}
        </Tag>
        <Tag color={sourceMeta.color}>{sourceMeta.text}</Tag>
      </div>

      <div className="campaign-overview-header__progress">
        <Text className="campaign-overview-header__passed">
          {summary.passed_case_count} / 9
        </Text>
        <Text type="secondary" className="campaign-overview-header__progress-label">
          passed
        </Text>
      </div>

      <Space
        wrap
        className="campaign-overview-header__counts"
        size="middle"
      >
        <span className="campaign-overview-count" data-count="alerts">
          {summary.alert_count}
          <Text type="secondary" className="campaign-overview-count__label">
            {" "}alerts
          </Text>
        </span>
        <span className="campaign-overview-count" data-count="blocked">
          {summary.blocked_count}
          <Text type="secondary" className="campaign-overview-count__label">
            {" "}blocked
          </Text>
        </span>
        <span className="campaign-overview-count" data-count="asks">
          {summary.ask_count}
          <Text type="secondary" className="campaign-overview-count__label">
            {" "}asks
          </Text>
        </span>
        <span className="campaign-overview-count" data-count="retries">
          {summary.retry_count}
          <Text type="secondary" className="campaign-overview-count__label">
            {" "}retries
          </Text>
        </span>
      </Space>

      {isStale ? (
        <Button
          size="small"
          type="default"
          icon={<SyncOutlined />}
          aria-label="Retry campaign data"
          onClick={onRetry}
        >
          Retry campaign data
        </Button>
      ) : null}
    </header>
  );
}
