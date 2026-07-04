// Step 5 (evidence-verification) panel: renders the catalog's evidence
// surfaces, safety boundary, and FAQ, plus a live evidence-readiness check
// through the existing getCampaignEvidence read. No report artifact file is
// fetched or linked directly — there is no public route for that today.

import { useEffect, useRef, useState } from "react";
import { Alert, Collapse, List, Tag, Typography } from "antd";

import type {
  ReviewEvidenceSurface,
  ReviewFaqItem,
  ReviewSafetyBoundaryItem
} from "../../content/review-demo-content";
import { getCampaignEvidence } from "../../services/campaign-supervision-service";

const { Paragraph, Text } = Typography;

const FIXTURE_STATE_LABEL: Record<string, string> = {
  structured_fixture: "结构化证据",
  reviewable_fixture: "可读证据",
  binary_placeholder: "二进制占位校验件，非正式证据"
};

type EvidenceReadiness = "loading" | "ready" | "not-ready" | "unavailable" | "idle";

export interface EvidenceVerificationPanelProps {
  evidenceSurfaces: ReviewEvidenceSurface[];
  safetyBoundary: ReviewSafetyBoundaryItem[];
  faq: ReviewFaqItem[];
  campaignId: string | null;
}

export function EvidenceVerificationPanel({
  evidenceSurfaces,
  safetyBoundary,
  faq,
  campaignId
}: EvidenceVerificationPanelProps) {
  const [readiness, setReadiness] = useState<EvidenceReadiness>("idle");
  const genRef = useRef(0);

  useEffect(() => {
    if (!campaignId) {
      setReadiness("idle");
      return;
    }

    const gen = ++genRef.current;
    setReadiness("loading");

    getCampaignEvidence(campaignId)
      .then((result) => {
        if (gen !== genRef.current) return;
        if (result.data) {
          setReadiness("ready");
          return;
        }
        setReadiness(result.error === "not-ready" ? "not-ready" : "unavailable");
      })
      .catch(() => {
        if (gen !== genRef.current) return;
        setReadiness("unavailable");
      });
  }, [campaignId]);

  return (
    <section
      className="review-demo-evidence-verification"
      aria-label="报告与证据完整性"
    >
      {campaignId ? (
        <EvidenceReadinessBanner readiness={readiness} />
      ) : null}

      <List
        header={<Text strong>证据展示面</Text>}
        dataSource={evidenceSurfaces}
        renderItem={(surface) => (
          <List.Item key={surface.id}>
            <div>
              <Text strong>{surface.title}</Text>{" "}
              <Tag>
                {FIXTURE_STATE_LABEL[surface.fixture_state] ?? surface.fixture_state}
              </Tag>
              <Paragraph type="secondary">{surface.description}</Paragraph>
            </div>
          </List.Item>
        )}
      />

      <List
        header={<Text strong>安全边界</Text>}
        dataSource={safetyBoundary}
        renderItem={(item) => (
          <List.Item key={item.id}>{item.statement}</List.Item>
        )}
      />

      <Collapse
        items={faq.map((item) => ({
          key: item.id,
          label: item.question,
          children: <Paragraph>{item.answer}</Paragraph>
        }))}
      />
    </section>
  );
}

function EvidenceReadinessBanner({
  readiness
}: {
  readiness: EvidenceReadiness;
}) {
  if (readiness === "loading" || readiness === "idle") {
    return null;
  }
  if (readiness === "ready") {
    return (
      <Alert
        type="success"
        showIcon
        message="该 campaign 的证据导出已就绪"
      />
    );
  }
  if (readiness === "not-ready") {
    return (
      <Alert
        type="warning"
        showIcon
        message="该 campaign 的证据尚未注册"
        description="Campaign 尚未完成终态或证据尚未注册，暂无法导出。"
      />
    );
  }
  return (
    <Alert
      type="error"
      showIcon
      message="证据状态读取失败"
      description="请稍后重试或联系运营方核对后端服务状态。"
    />
  );
}
