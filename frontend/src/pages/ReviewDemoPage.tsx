// Guided five-minute evaluator tour (REQ-T1-DEMO-010 review demo UI).
//
// Steps 1-2 render pure content from the versioned catalog. Step 3 shows
// live campaign numbers for the metrics the public API actually exposes.
// Step 4 deep-links into the existing /results/sandbox campaign workbench
// instead of building a second investigation UI. Step 5 shows evidence
// readiness through the existing getCampaignEvidence read — no report
// artifact file is served or linked directly.
//
// Read-only: no start/retry/approve/reject/cancel/edit-policy control exists
// on this page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tag, Typography } from "antd";

import { CampaignSnapshotPanel } from "../components/review-demo/CampaignSnapshotPanel";
import { EvidenceVerificationPanel } from "../components/review-demo/EvidenceVerificationPanel";
import { ReviewTourNav } from "../components/review-demo/ReviewTourNav";
import { ScenarioInvestigationPanel } from "../components/review-demo/ScenarioInvestigationPanel";
import { reviewDemoContent } from "../content/review-demo-content";
import {
  useCampaignSupervisionPolling,
  type CampaignSupervisionData
} from "../hooks/useCampaignSupervisionPolling";
import {
  getCampaign,
  listCampaigns,
  type CampaignDataResult
} from "../services/campaign-supervision-service";

const { Paragraph, Text, Title } = Typography;

const CAMPAIGN_ID_PATTERN = /^campaign:t1:[0-9a-f]{32}$/;

function parseCampaignId(value: string | null): string | null {
  if (value === null) return null;
  return CAMPAIGN_ID_PATTERN.test(value) ? value : null;
}

function parseStepId(value: string | null): string {
  const orderedIds = [...reviewDemoContent.review_tour]
    .sort((a, b) => a.order - b.order)
    .map((step) => step.id);
  if (value !== null && orderedIds.includes(value)) {
    return value;
  }
  return orderedIds[0];
}

export function ReviewDemoPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeStepId = parseStepId(searchParams.get("step"));
  const campaignIdFromUrl = parseCampaignId(searchParams.get("campaign_id"));

  const setActiveStepId = useCallback(
    (stepId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("step", stepId);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const setCampaignId = useCallback(
    (nextCampaignId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (nextCampaignId === null) {
        next.delete("campaign_id");
      } else {
        next.set("campaign_id", nextCampaignId);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Resolving which campaign to display is owned by the page, not by
  // whichever step happens to be active, so a direct link to step 4 or 5
  // still has a campaign to deep-link/check evidence for.
  const [resolving, setResolving] = useState(campaignIdFromUrl === null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const resolveGenRef = useRef(0);

  useEffect(() => {
    if (campaignIdFromUrl !== null) {
      setResolving(false);
      return;
    }

    const gen = ++resolveGenRef.current;
    const controller = new AbortController();
    setResolving(true);
    setResolveFailed(false);

    listCampaigns({}, { signal: controller.signal })
      .then((result) => {
        if (gen !== resolveGenRef.current) return;
        const first = result.data?.[0] ?? null;
        setResolving(false);
        if (!first) {
          setResolveFailed(result.data === null);
          return;
        }
        setCampaignId(first.campaign_id);
      })
      .catch(() => {
        if (gen !== resolveGenRef.current) return;
        setResolveFailed(true);
        setResolving(false);
      });

    return () => {
      controller.abort();
    };
    // setCampaignId is stable across renders via useCallback on searchParams;
    // intentionally excluding it keeps this effect keyed only on the URL
    // param, matching the campaign-mode resolution pattern used elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignIdFromUrl]);

  const campaignId = campaignIdFromUrl;

  // Owned at the page level (not inside CampaignSnapshotPanel) so the
  // scenario-investigation step can also read live campaign case data
  // without a second fetch of the same campaign detail.
  const loadCampaign = useCallback(
    async (
      id: string,
      signal: AbortSignal
    ): Promise<CampaignDataResult<CampaignSupervisionData>> => {
      const [detailResult, summaryResult] = await Promise.all([
        getCampaign(id, { signal }),
        listCampaigns({ q: id }, { signal })
      ]);

      if (!detailResult.data) {
        return {
          data: null,
          source: detailResult.source,
          error: detailResult.error
        };
      }

      const matchingSummary = summaryResult.data?.find(
        (s) => s.campaign_id === id
      );

      if (!matchingSummary) {
        return {
          data: null,
          source: "integration-error",
          error: summaryResult.error ?? "unavailable"
        };
      }

      return {
        data: { summary: matchingSummary, detail: detailResult.data },
        source: detailResult.source,
        error: null
      };
    },
    []
  );

  const { campaign, retry } = useCampaignSupervisionPolling({
    campaignId,
    loadCampaign
  });

  const activeStep = reviewDemoContent.review_tour.find(
    (step) => step.id === activeStepId
  );

  return (
    <div className="review-demo-page">
      <header className="review-demo-page__header console-panel">
        <Text className="eyebrow">{reviewDemoContent.product.tagline}</Text>
        <Title level={1}>{reviewDemoContent.product.name}</Title>
        <Paragraph>{reviewDemoContent.product.summary}</Paragraph>
        <Tag color="gold">{reviewDemoContent.source_notice.label}</Tag>
      </header>

      <div className="review-demo-page__body">
        <ReviewTourNav
          steps={reviewDemoContent.review_tour}
          activeStepId={activeStepId}
          onSelect={setActiveStepId}
        />

        <section
          className="review-demo-page__step console-panel"
          aria-label={activeStep?.title ?? ""}
        >
          {activeStep ? (
            <>
              <Title level={2}>{activeStep.title}</Title>
              <Paragraph strong>{activeStep.evaluator_question}</Paragraph>
              <Paragraph type="secondary">
                {activeStep.presenter_guidance}
              </Paragraph>
            </>
          ) : null}

          {activeStepId === "product-boundary" ? (
            <ProductBoundaryStep />
          ) : null}
          {activeStepId === "runtime-readiness" ? (
            <RuntimeReadinessStep />
          ) : null}
          {activeStepId === "campaign-overview" ? (
            <CampaignSnapshotPanel
              campaignId={campaignId}
              resolving={resolving}
              resolveFailed={resolveFailed}
              metricBindings={reviewDemoContent.metric_bindings}
              campaign={campaign}
              retry={retry}
            />
          ) : null}
          {activeStepId === "scenario-investigation" ? (
            <ScenarioInvestigationPanel
              scenarios={reviewDemoContent.scenarios}
              campaignId={campaignId}
              campaignAgents={campaign.data?.detail.agents ?? null}
            />
          ) : null}
          {activeStepId === "evidence-verification" ? (
            <EvidenceVerificationPanel
              evidenceSurfaces={reviewDemoContent.evidence_surfaces}
              safetyBoundary={reviewDemoContent.safety_boundary}
              faq={reviewDemoContent.frequently_asked_questions}
              campaignId={campaignId}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ProductBoundaryStep() {
  return (
    <div className="review-demo-safety-boundary">
      <Paragraph type="secondary">
        {reviewDemoContent.source_notice.summary}
      </Paragraph>
      <ul>
        {reviewDemoContent.safety_boundary.map((item) => (
          <li key={item.id}>{item.statement}</li>
        ))}
      </ul>
    </div>
  );
}

function RuntimeReadinessStep() {
  return (
    <ul className="review-demo-capability-list">
      {reviewDemoContent.capabilities.map((capability) => (
        <li key={capability.id}>
          <Text strong>{capability.title}</Text>
          <Paragraph type="secondary">{capability.summary}</Paragraph>
        </li>
      ))}
    </ul>
  );
}
