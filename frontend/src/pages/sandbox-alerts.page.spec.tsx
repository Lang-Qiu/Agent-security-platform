import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SANDBOX_SUPERVISION_SCHEMA_VERSION } from "../../../shared/contracts/supervision";
import type {
  SandboxSupervisionEvidenceExport,
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail
} from "../../../shared/types/supervision";
import {
  makeSupervisionDetail,
  makeSupervisionEvidence,
  makeSupervisionOverview
} from "../mocks/supervision";
import { renderAppAtRoute } from "../test/app-test-harness";

// Controllable mock for the supervision service. By default, delegates to the
// real implementation (which uses fetch). The cross-session race test
// overrides getSupervisionSession to control timing.
const supervisionServiceMock = vi.hoisted(() => {
  let realService: {
    getSupervisionSession: (sessionId: string, options?: unknown) => Promise<unknown>;
    listSupervisionSessions: (query: unknown, options?: unknown) => Promise<unknown>;
    serializeSupervisionQuery: (query: unknown) => string;
  } | null = null;

  async function ensureReal() {
    if (!realService) {
      const mod = await vi.importActual<
        typeof import("../services/supervision-service")
      >("../services/supervision-service");
      realService = {
        getSupervisionSession: mod.getSupervisionSession.bind(mod),
        listSupervisionSessions: mod.listSupervisionSessions.bind(mod),
        serializeSupervisionQuery: mod.serializeSupervisionQuery.bind(mod)
      };
    }
    return realService;
  }

  return {
    getSupervisionSession: vi.fn(async (...args: [string, unknown?]) => {
      const real = await ensureReal();
      return real.getSupervisionSession(args[0], args[1]);
    }),
    listSupervisionSessions: vi.fn(async (...args: [unknown, unknown?]) => {
      const real = await ensureReal();
      return real.listSupervisionSessions(args[0], args[1]);
    }),
    serializeSupervisionQuery: vi.fn((...args: [unknown]) => {
      // Synchronous fallback: build query string inline
      const query = args[0] as Record<string, unknown>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          params.set(k, String(v));
        }
      }
      const s = params.toString();
      return s.length === 0 ? "" : `?${s}`;
    }),
    downloadSupervisionEvidence: vi.fn(async (...args: [string, unknown?]) => {
      const real = await ensureReal();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (real as any).downloadSupervisionEvidence(args[0], args[1]);
    }),
    loadTaskSupervisionDetail: vi.fn(async (...args: [string, unknown?]) => {
      const real = await ensureReal();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (real as any).loadTaskSupervisionDetail(args[0], args[1]);
    }),
    _resetToReal: () => {
      realService = null;
    }
  };
});

vi.mock("../services/supervision-service", () => ({
  getSupervisionSession: supervisionServiceMock.getSupervisionSession,
  listSupervisionSessions: supervisionServiceMock.listSupervisionSessions,
  serializeSupervisionQuery: supervisionServiceMock.serializeSupervisionQuery,
  downloadSupervisionEvidence: supervisionServiceMock.downloadSupervisionEvidence,
  loadTaskSupervisionDetail: supervisionServiceMock.loadTaskSupervisionDetail
}));

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

function setNarrowViewport(narrow: boolean): void {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: narrow && query.includes("max-width"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function makeEmptyRunningDetail(sessionId: string): SandboxSupervisionSessionDetail {
  return {
    schema_version: SANDBOX_SUPERVISION_SCHEMA_VERSION,
    summary: {
      task_id: "task:outside-filter",
      session_id: sessionId,
      task_status: "running",
      risk_level: "low",
      highest_action: "allow",
      scenario_id: "T1-SC-OUTSIDE",
      case_id: "T1-SC-OUTSIDE-C001",
      tool_names: [],
      event_count: 0,
      decision_count: 0,
      alert_count: 0,
      blocked_record_count: 0,
      blocked: false,
      evidence_available: true,
      updated_at: "2026-06-30T00:00:00Z",
      last_event_at: null
    },
    events: [],
    policy_decisions: [],
    alerts: [],
    blocked_records: []
  };
}

describe("REQ-T1-SUPERVISION-UI-009 sandbox alerts workbench", () => {
  beforeEach(() => {
    // Re-establish default matchMedia mock (vi.restoreAllMocks resets it)
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Reset service mock implementations back to delegate-to-real
    supervisionServiceMock._resetToReal();
    supervisionServiceMock.getSupervisionSession.mockImplementation(async (sessionId: string, options?: unknown) => {
      const mod = await vi.importActual<typeof import("../services/supervision-service")>("../services/supervision-service");
      return mod.getSupervisionSession(sessionId, options as never);
    });
    supervisionServiceMock.listSupervisionSessions.mockImplementation(async (query: unknown, options?: unknown) => {
      const mod = await vi.importActual<typeof import("../services/supervision-service")>("../services/supervision-service");
      return mod.listSupervisionSessions(query as never, options as never);
    });
    supervisionServiceMock.downloadSupervisionEvidence.mockImplementation(async (sessionId: string, options?: unknown) => {
      const mod = await vi.importActual<typeof import("../services/supervision-service")>("../services/supervision-service");
      return mod.downloadSupervisionEvidence(sessionId, options as never);
    });
    supervisionServiceMock.loadTaskSupervisionDetail.mockImplementation(async (sessionId: string, options?: unknown) => {
      const mod = await vi.importActual<typeof import("../services/supervision-service")>("../services/supervision-service");
      return mod.loadTaskSupervisionDetail(sessionId, options as never);
    });
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
    // Deep-link to the running session so the hook schedules detail polling.
    // First detail call succeeds (real API), establishing hasRealDetailRef.
    // Second detail call (3s poll) fails — service falls back to mock, but
    // page rejects it because hasRealDetailRef is true, producing stale state.
    let detailCallCount = 0;
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
        detailCallCount++;
        if (detailCallCount >= 2) {
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

    // Deep-link to the running session (session:T1-SC-003-C001)
    await renderAppAtRoute(
      "/results/sandbox?session_id=session%3AT1-SC-003-C001"
    );
    await screen.findByRole("listbox", { name: "Supervision sessions" });

    // Wait for first detail to load successfully
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Session Inspector/i })
      ).toBeInTheDocument();
    });

    // Wait for second detail call (3s poll) to fail and produce stale state
    await waitFor(() => {
      expect(screen.getByText(/session detail is stale/i)).toBeInTheDocument();
    }, { timeout: 8000 });
    expect(
      screen.getByRole("button", { name: /retry.*detail/i })
    ).toBeInTheDocument();

    // Reset: third call succeeds
    detailCallCount = 0;
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
    }, { timeout: 8000 });
  }, 30000);

  test("REQ-T1-SUPERVISION-UI-009 deep-linked session outside current filters shows outside-filter state and loads detail", async () => {
    const overview = makeSupervisionOverview();
    const outsideSessionId = "session:outside-filter";
    const outsideDetail = makeEmptyRunningDetail(outsideSessionId);

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
            data: outsideDetail,
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

    // Detail should successfully load and display in the inspector
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Session Inspector/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/session detail unavailable/i)
    ).not.toBeInTheDocument();
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 outside-filter running session continues polling", async () => {
    const overview = makeSupervisionOverview();
    const outsideSessionId = "session:outside-filter-running";
    const outsideDetail = makeEmptyRunningDetail(outsideSessionId);
    let detailCallCount = 0;

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
        detailCallCount++;
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "ok",
            data: outsideDetail,
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

    // First detail load happens on mount
    await waitFor(() => {
      expect(detailCallCount).toBeGreaterThanOrEqual(1);
    });

    // Wait for polling to schedule the next detail fetch (3s interval)
    await waitFor(
      () => {
        expect(detailCallCount).toBeGreaterThanOrEqual(2);
      },
      { timeout: 8000 }
    );
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 initial detail API failure shows mock detail not stale state", async () => {
    // Overview succeeds from API; detail fetch always fails so service falls
    // back to mock. Page should show the mock detail timeline (safe), NOT stale.
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
        throw new Error("detail offline");
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

    // Inspector should show the mock detail (Session Inspector heading), not stale
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Session Inspector/i })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/session detail is stale/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/session detail unavailable/i)
    ).not.toBeInTheDocument();
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 mobile back button switches to list view keeping session in URL", async () => {
    setNarrowViewport(true);
    mockSupervisionApi();
    const { router } = await renderAppAtRoute("/results/sandbox");

    // At narrow viewport, auto-selection switches to inspector view.
    // Wait for the back button (inspector view indicator), not the listbox.
    const backButton = await screen.findByRole("button", {
      name: /back to session list/i
    });

    // List wrapper should NOT be rendered at narrow viewport in inspector view
    expect(
      document.querySelector(".supervision-session-list-wrapper")
    ).toBeNull();

    // Session_id is in URL
    expect(router.state.location.search).toContain("session_id=");

    // Click back button — switches to list view
    fireEvent.click(backButton);

    await waitFor(() => {
      // Inspector should NOT be rendered at narrow viewport in list view
      expect(
        document.querySelector(".supervision-inspector")
      ).toBeNull();
    });
    // List wrapper should be rendered again
    expect(
      document.querySelector(".supervision-session-list-wrapper")
    ).not.toBeNull();
    // Listbox should now be visible
    expect(
      screen.getByRole("listbox", { name: "Supervision sessions" })
    ).toBeInTheDocument();

    // Spec: "the selected session remains encoded in the URL"
    expect(router.state.location.search).toContain("session_id=");
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 narrow viewport does not cause width collapse or horizontal overflow", async () => {
    setNarrowViewport(true);
    mockSupervisionApi();
    await renderAppAtRoute("/results/sandbox");

    // At narrow viewport, auto-selection switches to inspector view.
    // Wait for the back button as the inspector view indicator.
    await screen.findByRole("button", { name: /back to session list/i });

    // Workbench should always have non-zero content (not width:0)
    const workbench = document.querySelector(".supervision-workbench");
    expect(workbench).not.toBeNull();
    // At narrow viewport in inspector view, only inspector is rendered
    expect(
      document.querySelector(".supervision-inspector")
    ).not.toBeNull();
    expect(
      document.querySelector(".supervision-session-list-wrapper")
    ).toBeNull();
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 session list supports keyboard navigation", async () => {
    mockSupervisionApi();
    await renderAppAtRoute("/results/sandbox");

    await screen.findByRole("listbox", { name: "Supervision sessions" });

    const selectedOption = screen.getByRole("option", { selected: true });
    // Selected option is focusable via keyboard (roving tabindex)
    expect(selectedOption).toHaveAttribute("tabindex", "0");

    // Non-selected options are in the tab order only when focused
    const allOptions = screen.getAllByRole("option");
    const unselectedOption = allOptions.find(
      (o) => o !== selectedOption
    );
    expect(unselectedOption).toHaveAttribute("tabindex", "-1");

    // Focus the selected option and navigate with ArrowDown
    selectedOption.focus();
    expect(selectedOption).toHaveFocus();

    const selectedIdx = allOptions.indexOf(selectedOption);
    const nextOption = allOptions[selectedIdx + 1];

    fireEvent.keyDown(selectedOption, { key: "ArrowDown" });
    expect(nextOption).toHaveFocus();

    // Enter selects the focused option
    fireEvent.keyDown(nextOption, { key: "Enter" });

    await waitFor(() => {
      expect(nextOption).toHaveAttribute("aria-selected", "true");
    });
  }, 20000);

  test("REQ-T1-SUPERVISION-UI-009 late real detail from prior session does not mark new session as stale", async () => {
    // Cross-session race in loadDetail: session A's real detail promise
    // resolves AFTER session B's loadDetail has started. Without a session
    // identity check after the await, A's late success would set
    // hasRealDetailRef=true for B, causing B's subsequent mock fallback to be
    // wrongly rejected as stale.
    //
    // We mock getSupervisionSession so A's promise stays pending across the
    // session switch (the hook would normally abort it). This isolates the
    // loadDetail callback's race-safety from the hook's abort protection.
    const overview = makeSupervisionOverview();
    const sessionAId = overview.sessions[0].session_id;
    const sessionBId = overview.sessions[1].session_id;
    const detailA = makeSupervisionDetail();

    let resolveDetailA: ((value: {
      data: typeof detailA;
      source: "api";
    }) => void) | null = null;
    const detailAPromise = new Promise<{
      data: typeof detailA;
      source: "api";
    }>((resolve) => {
      resolveDetailA = resolve;
    });

    // Override getSupervisionSession to control timing per session.
    supervisionServiceMock.getSupervisionSession.mockImplementation(
      async (sessionId: string) => {
        if (sessionId === sessionAId) {
          // A's real response stays pending — resolves late after switch
          return detailAPromise;
        }
        // Session B: returns mock. If hasRealDetailRef is wrongly true from
        // A's late resolve, the page loadDetail would throw, marking B stale.
        return { data: makeSupervisionDetail(), source: "mock" };
      }
    );
    supervisionServiceMock.listSupervisionSessions.mockResolvedValue({
      data: overview,
      source: "api"
    });

    // Deep-link to session A (detail pending)
    await renderAppAtRoute(
      `/results/sandbox?session_id=${encodeURIComponent(sessionAId)}`
    );
    await screen.findByRole("listbox", { name: "Supervision sessions" });

    // Switch to session B while A's detail is still pending
    fireEvent.click(
      screen.getByRole("option", { name: new RegExp(sessionBId, "i") })
    );

    // Wait for B's initial mock detail to load
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Session Inspector/i })
      ).toBeInTheDocument();
    });
    const bCallCountAfterInitial =
      supervisionServiceMock.getSupervisionSession.mock.calls.filter(
        (call) => call[0] === sessionBId
      ).length;

    // Now resolve A's late real detail — without the fix, this sets
    // hasRealDetailRef.current = true for B
    resolveDetailA!({ data: detailA, source: "api" });
    await new Promise((r) => setTimeout(r, 100));

    // Trigger B's next detail poll via refresh. If hasRealDetailRef is wrongly
    // true (from A's late resolve), loadDetail throws on B's mock result,
    // marking B stale.
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh supervision data" })
    );

    await waitFor(() => {
      const bCalls = supervisionServiceMock.getSupervisionSession.mock.calls.filter(
        (call) => call[0] === sessionBId
      ).length;
      expect(bCalls).toBeGreaterThan(bCallCountAfterInitial);
    });

    // B must NOT be stale — no real snapshot exists for B
    expect(
      screen.queryByText(/session detail is stale/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Session Inspector/i })
    ).toBeInTheDocument();
  }, 30000);
});
