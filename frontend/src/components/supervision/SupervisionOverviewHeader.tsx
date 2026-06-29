import { SyncOutlined } from "@ant-design/icons";
import { Button, Space, Statistic, Tag, Typography } from "antd";

import type { SandboxSupervisionCounts } from "../../../../shared/types/supervision";
import type { SupervisionFreshness } from "../../hooks/useSupervisionPolling";

const { Title } = Typography;

export type SupervisionDataSource = "api" | "integration-error" | "mock";

function DataSourceBadge({ source }: { source: SupervisionDataSource }) {
  if (source === "api") {
    return <Tag color="green">Backend API</Tag>;
  }
  if (source === "integration-error") {
    return <Tag color="red">Integration Error</Tag>;
  }
  return <Tag color="gold">Mock Fallback</Tag>;
}

function formatLastSuccess(timestamp: string | null): string {
  if (!timestamp) {
    return "";
  }
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(timestamp));
  return `Last updated: ${formatted} UTC`;
}

export interface SupervisionOverviewHeaderProps {
  counts: SandboxSupervisionCounts | null;
  dataSource: SupervisionDataSource;
  freshness: SupervisionFreshness;
  lastSuccessAt: string | null;
  loading: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  onClearFilters: () => void;
}

export function SupervisionOverviewHeader({
  counts,
  dataSource,
  freshness,
  lastSuccessAt,
  loading,
  onRefresh,
  onRetry,
  onClearFilters
}: SupervisionOverviewHeaderProps) {
  const showStale = freshness === "stale" && lastSuccessAt !== null;

  return (
    <header className="supervision-header">
      <div className="supervision-header-row">
        <div>
          <Title level={1}>Behavior Supervision</Title>
        </div>
        <Space wrap>
          <DataSourceBadge source={dataSource} />
          {showStale ? (
            <>
              <Tag color="orange">Stale</Tag>
              <span>{formatLastSuccess(lastSuccessAt)}</span>
              <Button size="small" onClick={onRetry}>
                Retry
              </Button>
            </>
          ) : null}
          <Button
            icon={<SyncOutlined />}
            aria-label="Refresh supervision data"
            loading={loading}
            onClick={onRefresh}
          />
          <Button size="small" onClick={onClearFilters}>
            Clear filters
          </Button>
        </Space>
      </div>

      {counts ? (
        <div className="supervision-summary-tiles">
          <Statistic title="Running" value={counts.running_session_count} />
          <Statistic
            title="Awaiting confirmation"
            value={counts.awaiting_confirmation_count}
          />
          <Statistic title="Alerts" value={counts.alert_record_count} />
          <Statistic
            title="Blocked"
            value={counts.blocked_session_count}
          />
        </div>
      ) : null}
    </header>
  );
}
