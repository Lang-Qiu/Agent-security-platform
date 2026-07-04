import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { reviewDemoContent } from "../content/review-demo-content";
import {
  makeCampaignDetail,
  makeCampaignEvidence,
  makeCampaignSummary
} from "../mocks/campaign-supervision";
import { renderAppAtRoute } from "../test/app-test-harness";

const getCampaignMock = vi.fn();
const listCampaignsMock = vi.fn();
const getCampaignEvidenceMock = vi.fn();

vi.mock("../services/campaign-supervision-service", async () => {
  const realService = await vi.importActual<
    typeof import("../services/campaign-supervision-service")
  >("../services/campaign-supervision-service");

  return {
    ...realService,
    getCampaign: (...args: unknown[]) => getCampaignMock(...args),
    listCampaigns: (...args: unknown[]) => listCampaignsMock(...args),
    getCampaignEvidence: (...args: unknown[]) => getCampaignEvidenceMock(...args)
  };
});

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";

function mockHappyPath() {
  const summary = makeCampaignSummary({ campaign_id: CAMPAIGN_ID, status: "completed" });
  const detail = makeCampaignDetail({ status: "completed" });
  const evidence = makeCampaignEvidence();

  listCampaignsMock.mockResolvedValue({
    data: [summary],
    source: "api",
    error: null
  });
  getCampaignMock.mockResolvedValue({
    data: detail,
    source: "api",
    error: null
  });
  getCampaignEvidenceMock.mockResolvedValue({
    data: evidence,
    source: "api",
    error: null
  });
}

describe("ReviewDemoPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders all five step titles from the catalog", async () => {
    mockHappyPath();
    await renderAppAtRoute("/review-demo");

    for (const step of reviewDemoContent.review_tour) {
      expect(screen.getAllByText(step.title).length).toBeGreaterThan(0);
    }
  });

  test("step URL param navigation moves between steps", async () => {
    mockHappyPath();
    await renderAppAtRoute(
      "/review-demo?step=scenario-investigation"
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("region", { name: "三类风险场景调查" }).length
      ).toBeGreaterThan(0);
    });
  });

  test("campaign snapshot shows live values for API-backed metrics and placeholder for the rest", async () => {
    mockHappyPath();
    await renderAppAtRoute("/review-demo?step=campaign-overview");

    const panel = await screen.findByTestId("review-demo-campaign-snapshot");

    await waitFor(() => {
      expect(within(panel).getAllByText("3").length).toBeGreaterThan(0);
    });

    expect(
      within(panel).getAllByText("该指标暂无公开数据源，详见证据包").length
    ).toBeGreaterThan(0);
  });

  test("campaign snapshot shows empty state when no campaign is available", async () => {
    listCampaignsMock.mockResolvedValue({ data: [], source: "api", error: null });
    getCampaignMock.mockResolvedValue({ data: null, source: "integration-error", error: "unavailable" });
    getCampaignEvidenceMock.mockResolvedValue({ data: null, source: "integration-error", error: "unavailable" });

    await renderAppAtRoute("/review-demo?step=campaign-overview");

    await waitFor(() => {
      expect(screen.getByText("暂无可展示的 campaign 数据")).toBeInTheDocument();
    });
  });

  test("scenario investigation renders the three canonical scenarios with deep links once a campaign resolves", async () => {
    mockHappyPath();
    await renderAppAtRoute("/review-demo?step=scenario-investigation");

    await waitFor(() => {
      const links = screen.getAllByRole("link", {
        name: "前往调查该场景"
      });
      expect(links.length).toBe(3);
      for (const link of links) {
        expect(link.getAttribute("href")).toContain(
          `campaign_id=${encodeURIComponent(CAMPAIGN_ID)}`
        );
      }
    });

    expect(screen.getAllByText("提示词注入与越狱").length).toBeGreaterThan(0);
    expect(screen.getAllByText("工具调用劫持").length).toBeGreaterThan(0);
    expect(screen.getAllByText("上下文与记忆投毒").length).toBeGreaterThan(0);
  });

  test("scenario investigation renders all nine cases grouped under their scenario", async () => {
    mockHappyPath();
    await renderAppAtRoute("/review-demo?step=scenario-investigation");

    for (const caseId of [
      "T1-SC-001-C001",
      "T1-SC-001-C002",
      "T1-SC-001-C003",
      "T1-SC-002-C001",
      "T1-SC-002-C002",
      "T1-SC-002-C003",
      "T1-SC-003-C001",
      "T1-SC-003-C002",
      "T1-SC-003-C003"
    ]) {
      await waitFor(() => {
        expect(screen.getAllByText(caseId).length).toBeGreaterThan(0);
      });
    }
  });

  test("evidence verification shows not-ready state", async () => {
    listCampaignsMock.mockResolvedValue({
      data: [makeCampaignSummary({ campaign_id: CAMPAIGN_ID })],
      source: "api",
      error: null
    });
    getCampaignMock.mockResolvedValue({
      data: makeCampaignDetail(),
      source: "api",
      error: null
    });
    getCampaignEvidenceMock.mockResolvedValue({
      data: null,
      source: "integration-error",
      error: "not-ready"
    });

    await renderAppAtRoute("/review-demo?step=evidence-verification");

    await waitFor(() => {
      expect(
        screen.getByText("该 campaign 的证据尚未注册")
      ).toBeInTheDocument();
    });
  });

  test("evidence verification shows unavailable state on generic failure", async () => {
    listCampaignsMock.mockResolvedValue({
      data: [makeCampaignSummary({ campaign_id: CAMPAIGN_ID })],
      source: "api",
      error: null
    });
    getCampaignMock.mockResolvedValue({
      data: makeCampaignDetail(),
      source: "api",
      error: null
    });
    getCampaignEvidenceMock.mockResolvedValue({
      data: null,
      source: "integration-error",
      error: "unavailable"
    });

    await renderAppAtRoute("/review-demo?step=evidence-verification");

    await waitFor(() => {
      expect(screen.getByText("证据状态读取失败")).toBeInTheDocument();
    });
  });

  test("prev/next buttons move between steps", async () => {
    mockHappyPath();
    await renderAppAtRoute("/review-demo");

    const nextButton = screen.getByRole("button", { name: "下一步" });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "真实基础设施链路" })
      ).toBeInTheDocument();
    });
  });
});
