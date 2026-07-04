// Step 3 (campaign-overview) panel: shows live campaign numbers for the
// five metric keys that are actually present on Track1CampaignSummary, and a
// fixed neutral placeholder for the six catalog metric keys that have no
// public API source yet (see plan Design Decision 1). Reuses the existing
// campaign polling hook and service — no hand-rolled fetch, no duplicated
// aggregation logic.

import { Alert, Button, Tag, Typography } from "antd";

import type { Track1CampaignSummary } from "../../../../shared/types/campaign-supervision";
import type { CampaignPollingState } from "../../hooks/useCampaignSupervisionPolling";
import type { ReviewMetricBinding } from "../../content/review-demo-content";

const { Text } = Typography;

// Keys directly present on Track1CampaignSummary. Every other catalog metric
// key has no public API source today and renders the fixed placeholder.
const LIVE_METRIC_KEYS: ReadonlySet<string> = new Set([
  "agent_count",
  "case_count",
  "retry_count",
  "ask_count",
  "blocked_count"
]);

const NO_SOURCE_LABEL = "该指标暂无公开数据源，详见证据包";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  created: "已创建",
  validating: "校验中",
  running: "运行中",
  collecting: "汇总中",
  completed: "已完成",
  failed: "失败"
};

function readMetricValue(
  summary: Track1CampaignSummary,
  key: string
): number | null {
  switch (key) {
    case "agent_count":
      return summary.agent_count;
    case "case_count":
      return summary.case_count;
    case "retry_count":
      return summary.retry_count;
    case "ask_count":
      return summary.ask_count;
    case "blocked_count":
      return summary.blocked_count;
    default:
      return null;
  }
}

export interface CampaignSnapshotPanelProps {
  campaignId: string | null;
  resolving: boolean;
  resolveFailed: boolean;
  metricBindings: ReviewMetricBinding[];
  campaign: CampaignPollingState;
  retry: () => Promise<void>;
}

export function CampaignSnapshotPanel({
  campaignId,
  resolving,
  resolveFailed,
  metricBindings,
  campaign,
  retry
}: CampaignSnapshotPanelProps) {
  if (resolving) {
    return (
      <section
        className="review-demo-campaign-snapshot"
        aria-label="Campaign 概览"
      >
        <Text type="secondary">正在查找可展示的 campaign…</Text>
      </section>
    );
  }

  if (campaignId === null) {
    return (
      <section
        className="review-demo-campaign-snapshot"
        aria-label="Campaign 概览"
      >
        <Alert
          type="info"
          showIcon
          message="暂无可展示的 campaign 数据"
          description="请先运行受控 campaign 或联系运营方核对 accepted baseline。"
        />
        {resolveFailed ? (
          <Text type="secondary">campaign 列表读取失败，可稍后重试。</Text>
        ) : null}
      </section>
    );
  }

  const summary = campaign.data?.summary ?? null;

  return (
    <section
      className="review-demo-campaign-snapshot"
      aria-label="Campaign 概览"
      data-testid="review-demo-campaign-snapshot"
    >
      {summary ? (
        <Tag color="blue">{CAMPAIGN_STATUS_LABEL[summary.status] ?? summary.status}</Tag>
      ) : null}

      {campaign.freshness === "stale" ? (
        <Button size="small" onClick={() => retry()}>
          重新加载
        </Button>
      ) : null}

      <dl className="review-demo-metric-grid">
        {metricBindings.map((metric) => {
          const value =
            summary && LIVE_METRIC_KEYS.has(metric.key)
              ? readMetricValue(summary, metric.key)
              : null;
          const isLive = LIVE_METRIC_KEYS.has(metric.key) && summary !== null;
          return (
            <div key={metric.key} className="review-demo-metric-grid__item">
              <dt>{metric.label}</dt>
              <dd>
                {isLive ? (
                  value
                ) : (
                  <Text type="secondary">{NO_SOURCE_LABEL}</Text>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {!summary && campaign.error ? (
        <Alert
          type="warning"
          showIcon
          message="campaign 数据暂不可用"
          description="Campaign 概览读取失败，请稍后重试。"
        />
      ) : null}
    </section>
  );
}
