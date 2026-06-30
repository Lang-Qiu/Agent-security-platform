import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SANDBOX_SUPERVISION_SCHEMA_VERSION } from "../../../shared/contracts/supervision";
import type {
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview
} from "../../../shared/types/supervision";
import {
  makeSupervisionDetail,
  makeSupervisionEvidence,
  makeSupervisionOverview
} from "../mocks/supervision";
import { renderAppAtRoute } from "../test/app-test-harness";

function createOverview(
  sessions: SandboxSupervisionOverview["sessions"]
): SandboxSupervisionOverview {
  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    counts: {
      observed_session_count: sessions.length,
      running_session_count: sessions.filter((s) => s.task_status === "running")
        .length,
      awaiting_confirmation_count: sessions.filter(
        (s) => s.highest_action === "ask"
      ).length,
      alert_record_count: sessions.reduce(
        (total, s) => total + s.alert_count,
        0
      ),
      blocked_session_count: sessions.filter((s) => s.blocked).length
    },
    matched_session_count: sessions.length,
    returned_session_count: sessions.length,
    limit: 100,
    truncated: false,
    sessions
  };
}

function mockSupervisionApi(input: {
  overview?: SandboxSupervisionOverview;
  evidence?: SandboxSupervisionEvidenceExport;
  overviewFilter?: (sessions: SandboxSupervisionOverview["sessions"]) => SandboxSupervisionOverview["sessions"];
  failOverviewAfter?: number;
  invalidOverviewAfter?: number;
} = {}) {
  const overview = input.overview ?? makeSupervisionOverview();
  const detail = makeSupervisionDetail();
  const evidence = input.evidence ?? makeSupervisionEvidence();
  let overviewCallCount = 0;
  const fetchMock = vi.fn(async (resource: string | URL) => {
    const path = String(resource);
    let data: unknown;

    if (path.endsWith("/evidence")) {
      data = evidence;
    } else if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
      const match = path.match(/\/api\/supervision\/sessions\/([^?]+)$/);
      const sessionId = match ? decodeURIComponent(match[1]) : "";
      const sessionSummary = overview.sessions.find(
        (s) => s.session_id === sessionId
      );
      data = sessionSummary
        ? {
            ...detail,
            summary: {
              ...detail.summary,
              evidence_available: sessionSummary.evidence_available
            }
          }
        : detail;
    } else if (path.startsWith("/api/supervision/sessions")) {
      overviewCallCount++;
      if (
        input.failOverviewAfter &&
        overviewCallCount > input.failOverviewAfter
      ) {
        throw new Error("network failure");
      }
      if (
        input.invalidOverviewAfter &&
        overviewCallCount > input.invalidOverviewAfter
      ) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: { invalid: "shape" },
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (input.overviewFilter) {
        const filtered = input.overviewFilter(overview.sessions);
        data = {
          ...overview,
          sessions: filtered,
          matched_session_count: filtered.length,
          returned_session_count: filtered.length
        };
      } else {
        data = overview;
      }
    } else {
      throw new Error(`Unexpected supervision request: ${path}`);
    }

    return {
      ok: true,
      json: async () => ({
        success: true,
        message: "ok",
        data,
        error_code: null,
        request_id: "req_supervision_page_test"
      })
    };
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function selectAntOption(label: string, option: string): Promise<void> {
  const combobox = screen.getByRole("combobox", { name: label });
  // Antd 6 Select uses .ant-select-content (not .ant-select-selector like v5).
  // The mouseDown handler that opens the dropdown lives on the .ant-select
  // root element. Fire on that to open the dropdown.
  const selectRoot = combobox.closest(".ant-select") ?? combobox;
  fireEvent.mouseDown(selectRoot, { button: 0 });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("REQ-T1-SUPERVISION-UI-009 sandbox alerts workbench", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("renders global counts and session list", async () => {
    mockSupervisionApi();
    await renderAppAtRoute("/results/sandbox");

    expect(
      await screen.findByRole("heading", { name: "Behavior Supervision" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Awaiting confirmation")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(
      await screen.findByRole("listbox", { name: "Supervision sessions" })
    ).toBeInTheDocument();
  });

  test(
    "sends all approved filters in stable URL order",
    async () => {
      const fetchMock = mockSupervisionApi();
      await renderAppAtRoute("/results/sandbox");

      await screen.findByRole("listbox", { name: "Supervision sessions" });

      fireEvent.change(screen.getByRole("searchbox", { name: "Session search" }), {
        target: { value: "session:001" }
      });
      await selectAntOption("Status", "Blocked");
      await selectAntOption("Risk", "High");
      await selectAntOption("Action", "Deny");
      await selectAntOption("Scenario", "T1-SC-001");
      await selectAntOption("Tool", "Send email");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(
            "q=session%3A001&status=blocked&risk_level=high" +
              "&action=deny&scenario_id=T1-SC-001&tool_name=send_email"
          ),
          expect.any(Object)
        );
      });
    },
    30000
  );

  test("honors session deep links", async () => {
    mockSupervisionApi();
    await renderAppAtRoute(
      "/results/sandbox?session_id=session%3AT1-SC-002-C001"
    );

    expect(
      await screen.findByRole("option", {
        name: /session:T1-SC-002-C001/i
      })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("default selection prefers most recent deny/ask/alert session", async () => {
    mockSupervisionApi();
    await renderAppAtRoute("/results/sandbox");

    expect(
      await screen.findByRole("option", {
        name: /session:T1-SC-001-C001/i
      })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("selected row remains after overview refresh", async () => {
    mockSupervisionApi();
    await renderAppAtRoute(
      "/results/sandbox?session_id=session%3AT1-SC-002-C001"
    );

    await screen.findByRole("option", { name: /session:T1-SC-002-C001/i });

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh supervision data" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /session:T1-SC-002-C001/i })
      ).toHaveAttribute("aria-selected", "true");
    });
  });

  test("unknown known query values are removed from URL", async () => {
    mockSupervisionApi();
    const { router } = await renderAppAtRoute(
      "/results/sandbox?status=invalid_status&risk_level=invalid_risk"
    );

    await screen.findByRole("listbox", { name: "Supervision sessions" });

    await waitFor(() => {
      expect(router.state.location.search).not.toContain(
        "status=invalid_status"
      );
      expect(router.state.location.search).not.toContain(
        "risk_level=invalid_risk"
      );
    });
  });

  test("clear filters command resets all filters", async () => {
    mockSupervisionApi();
    const { router } = await renderAppAtRoute("/results/sandbox");

    await screen.findByRole("listbox", { name: "Supervision sessions" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Session search" }), {
      target: { value: "session:001" }
    });
    await selectAntOption("Status", "Blocked");

    await waitFor(() => {
      expect(router.state.location.search).toContain("q=session");
      expect(router.state.location.search).toContain("status=blocked");
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      expect(router.state.location.search).not.toContain("q=");
      expect(router.state.location.search).not.toContain("status=");
    });
  }, 15000);

  test("shows initial loading state before data arrives", async () => {
    let resolveOverview!: (value: unknown) => void;
    const deferredPromise = new Promise((resolve) => {
      resolveOverview = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => deferredPromise)
    );

    await renderAppAtRoute("/results/sandbox");

    await waitFor(() => {
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    resolveOverview({
      ok: true,
      json: async () => ({
        success: true,
        message: "ok",
        data: makeSupervisionOverview(),
        error_code: null,
        request_id: "req_supervision_page_test"
      })
    });

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  test("shows empty state when no sessions exist", async () => {
    mockSupervisionApi({ overview: createOverview([]) });
    await renderAppAtRoute("/results/sandbox");

    expect(
      await screen.findByText(/no sessions available/i)
    ).toBeInTheDocument();
  });

  test("shows filtered empty state when filters match no sessions", async () => {
    const fullOverview = makeSupervisionOverview();
    const emptyOverview = createOverview([]);
    const fetchMock = vi.fn(async (resource: string | URL) => {
      const path = String(resource);
      if (path.endsWith("/evidence")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionEvidence(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionDetail(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (path.startsWith("/api/supervision/sessions")) {
        const hasFilter = path.includes("?");
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: hasFilter ? emptyOverview : fullOverview,
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      throw new Error(`Unexpected: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAtRoute("/results/sandbox");
    await screen.findByRole("listbox", { name: "Supervision sessions" });

    await selectAntOption("Status", "Running");

    await waitFor(() => {
      expect(screen.getByText(/no sessions match/i)).toBeInTheDocument();
    });
  });

  test("shows mock data source when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network failure")))
    );

    await renderAppAtRoute("/results/sandbox");

    expect(await screen.findByText(/mock fallback/i)).toBeInTheDocument();
  });

  test("shows integration-error data source when API returns invalid shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          message: "ok",
          data: { invalid: "shape" },
          error_code: null,
          request_id: "req_supervision_page_test"
        })
      }))
    );

    await renderAppAtRoute("/results/sandbox");

    expect(await screen.findByText(/integration error/i)).toBeInTheDocument();
  });

  test("stale state shows last success and retry recovers", async () => {
    let failNextOverview = false;
    const fetchMock = vi.fn(async (resource: string | URL) => {
      const path = String(resource);
      if (path.endsWith("/evidence")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionEvidence(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionDetail(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (path.startsWith("/api/supervision/sessions")) {
        if (failNextOverview) {
          failNextOverview = false;
          throw new Error("network failure");
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionOverview(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      throw new Error(`Unexpected: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAtRoute("/results/sandbox");
    await screen.findByRole("listbox", { name: "Supervision sessions" });

    failNextOverview = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh supervision data" })
    );

    await waitFor(() => {
      expect(screen.getByText(/stale/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/last updated/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
    });
  });

  test("refresh icon has accessible name", async () => {
    mockSupervisionApi();
    await renderAppAtRoute("/results/sandbox");

    await screen.findByRole("listbox", { name: "Supervision sessions" });

    const refreshButton = screen.getByRole("button", {
      name: "Refresh supervision data"
    });
    expect(refreshButton).toBeInTheDocument();
  });

  test("ask session has no approval command", async () => {
    mockSupervisionApi();
    await renderAppAtRoute(
      "/results/sandbox?session_id=session%3AT1-SC-003-C001"
    );

    await screen.findByRole("option", { name: /session:T1-SC-003-C001/i });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /approve/i })
      ).not.toBeInTheDocument();
    });
  });

  test("REQ-T1-SUPERVISION-UI-009 downloads only normalized evidence data", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:evidence");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    mockSupervisionApi({ evidence: makeSupervisionEvidence() });

    await renderAppAtRoute("/results/sandbox");

    fireEvent.click(
      await screen.findByRole("button", { name: "Download evidence" })
    );

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:evidence");
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 disables download when evidence unavailable", async () => {
    const overview = makeSupervisionOverview();
    const noEvidenceSessions = overview.sessions.map((session) => ({
      ...session,
      evidence_available: false
    }));
    const noEvidenceOverview: SandboxSupervisionOverview = {
      ...overview,
      sessions: noEvidenceSessions,
      counts: {
        ...overview.counts,
        observed_session_count: noEvidenceSessions.length
      }
    };
    mockSupervisionApi({ overview: noEvidenceOverview });

    await renderAppAtRoute("/results/sandbox");

    const downloadButton = await screen.findByRole("button", {
      name: "Download evidence"
    });
    expect(downloadButton).toBeDisabled();
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 failed download leaves page usable with safe notification", async () => {
    const fetchMock = vi.fn(async (resource: string | URL) => {
      const path = String(resource);
      if (path.endsWith("/evidence")) {
        throw new Error("evidence offline");
      }
      if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionDetail(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (path.startsWith("/api/supervision/sessions")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionOverview(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      throw new Error(`Unexpected: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAtRoute("/results/sandbox");

    const downloadButton = await screen.findByRole("button", {
      name: "Download evidence"
    });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(
        screen.getByText(/evidence unavailable|download failed|unable to download/i)
      ).toBeInTheDocument();
    });

    // Page remains usable: the session list and download button are still present.
    expect(
      screen.getByRole("listbox", { name: "Supervision sessions" })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download evidence" })
      ).toBeInTheDocument();
    });
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 detail stale state exposes retry for selected session", async () => {
    // The selectedTaskStatusRef pattern in SandboxAlertsPage causes the detail
    // polling effect to run twice on initial mount (once with null task status,
    // once with the actual value after re-render). Use a flag that stays true
    // across both initial polls so the stale state persists until manual retry.
    let failDetail = true;
    const fetchMock = vi.fn(async (resource: string | URL) => {
      const path = String(resource);
      if (path.endsWith("/evidence")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionEvidence(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
        if (failDetail) {
          throw new Error("detail offline");
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionDetail(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (path.startsWith("/api/supervision/sessions")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionOverview(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      throw new Error(`Unexpected: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAtRoute("/results/sandbox");
    await screen.findByRole("listbox", { name: "Supervision sessions" });

    await waitFor(() => {
      expect(screen.getByText(/session detail is stale/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /retry.*detail/i })
    ).toBeInTheDocument();

    failDetail = false;
    fireEvent.click(
      screen.getByRole("button", { name: /retry.*detail/i })
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/session detail is stale/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /retry.*detail/i })
      ).not.toBeInTheDocument();
    });
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 deep-linked session outside current filters shows outside-filter state", async () => {
    const overview = makeSupervisionOverview();
    const outsideSessionId = "session:outside-filter";
    const outsideDetail = makeSupervisionDetail();
    const outsideDetailWithId: typeof outsideDetail = {
      ...outsideDetail,
      summary: {
        ...outsideDetail.summary,
        session_id: outsideSessionId,
        task_status: "running"
      }
    };

    const fetchMock = vi.fn(async (resource: string | URL) => {
      const path = String(resource);
      if (path.endsWith("/evidence")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: makeSupervisionEvidence(),
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (/\/api\/supervision\/sessions\/[^?]+$/.test(path)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: outsideDetailWithId,
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      if (path.startsWith("/api/supervision/sessions")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: overview,
            error_code: null,
            request_id: "req_supervision_page_test"
          })
        };
      }
      throw new Error(`Unexpected: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAtRoute(
      `/results/sandbox?session_id=${encodeURIComponent(outsideSessionId)}`
    );

    await waitFor(() => {
      expect(
        screen.getByText(/outside current filter/i)
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/select a session/i)
    ).not.toBeInTheDocument();
  }, 20000);
});
