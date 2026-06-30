import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Typography } from "antd";

import { RISK_LEVELS } from "../../../shared/constants/risk-level";
import { TASK_STATUSES } from "../../../shared/constants/task-status";
import { SANDBOX_POLICY_ACTIONS } from "../../../shared/types/sandbox";
import type { RiskLevel, TaskStatus } from "../../../shared/types/task";
import type {
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail,
  SandboxSupervisionSessionSummary,
  SandboxSupervisionToolName
} from "../../../shared/types/supervision";
import { SupervisionFilters } from "../components/supervision/SupervisionFilters";
import {
  SupervisionOverviewHeader,
  type SupervisionDataSource
} from "../components/supervision/SupervisionOverviewHeader";
import { SupervisionSessionInspector } from "../components/supervision/SupervisionSessionInspector";
import { SupervisionSessionList } from "../components/supervision/SupervisionSessionList";
import { useSupervisionPolling } from "../hooks/useSupervisionPolling";
import {
  getSupervisionSession,
  listSupervisionSessions,
  serializeSupervisionQuery,
  type SupervisionDataResult,
  type SupervisionQuery
} from "../services/supervision-service";

const NARROW_VIEWPORT_QUERY = "(max-width: 1100px)";

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return narrow;
}

const { Paragraph } = Typography;

const SUPERVISION_TOOL_NAMES: readonly SandboxSupervisionToolName[] = [
  "send_email",
  "read_file",
  "write_file",
  "call_api"
];

const PRIORITY_ACTIONS = new Set(["deny", "ask", "alert"]);

function parseTaskStatus(value: string | null): TaskStatus | undefined {
  if (value === null) return undefined;
  return (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as TaskStatus)
    : undefined;
}

function parseRiskLevel(value: string | null): RiskLevel | undefined {
  if (value === null) return undefined;
  return (RISK_LEVELS as readonly string[]).includes(value)
    ? (value as RiskLevel)
    : undefined;
}

function parseSandboxPolicyAction(
  value: string | null
): SupervisionQuery["action"] {
  if (value === null) return undefined;
  return (SANDBOX_POLICY_ACTIONS as readonly string[]).includes(value)
    ? (value as SupervisionQuery["action"])
    : undefined;
}

function parseSandboxToolName(
  value: string | null
): SandboxSupervisionToolName | undefined {
  if (value === null) return undefined;
  return (SUPERVISION_TOOL_NAMES as readonly string[]).includes(value)
    ? (value as SandboxSupervisionToolName)
    : undefined;
}

function setOrDelete(
  params: URLSearchParams,
  key: string,
  value: string | undefined
): void {
  if (value === undefined || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }
}

function pickDefaultSession(
  sessions: SandboxSupervisionSessionSummary[]
): SandboxSupervisionSessionSummary | null {
  for (const session of sessions) {
    if (PRIORITY_ACTIONS.has(session.highest_action)) {
      return session;
    }
  }
  return sessions[0] ?? null;
}

export function SandboxAlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = useMemo<SupervisionQuery>(() => {
    return {
      q: searchParams.get("q") ?? undefined,
      status: parseTaskStatus(searchParams.get("status")),
      risk_level: parseRiskLevel(searchParams.get("risk_level")),
      action: parseSandboxPolicyAction(searchParams.get("action")),
      scenario_id: searchParams.get("scenario_id") ?? undefined,
      tool_name: parseSandboxToolName(searchParams.get("tool_name"))
    };
  }, [searchParams]);

  const sessionIdFromUrl = searchParams.get("session_id");

  const [dataSource, setDataSource] = useState<SupervisionDataSource>("mock");
  const [mockFallback, setMockFallback] =
    useState<SandboxSupervisionOverview | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "inspector">("list");
  const isNarrow = useNarrowViewport();

  const queryRef = useRef(query);
  queryRef.current = query;

  // Track whether we've ever received a real (non-mock) detail for the current
  // session. Only reject mock fallback after a real snapshot exists (stale
  // case); initial unavailability should still show the safe mock detail.
  const hasRealDetailRef = useRef(false);
  const lastDetailSessionRef = useRef<string | null>(null);

  const loadOverview = useCallback(
    async (
      signal: AbortSignal
    ): Promise<SupervisionDataResult<SandboxSupervisionOverview>> => {
      const result = await listSupervisionSessions(queryRef.current, {
        signal
      });

      if (result.source === "mock") {
        setMockFallback(result.data);
        throw new Error("supervision overview unavailable");
      }

      setDataSource(result.source);
      return result;
    },
    []
  );

  const loadDetail = useCallback(
    async (
      sessionId: string,
      signal: AbortSignal
    ): Promise<SupervisionDataResult<SandboxSupervisionSessionDetail> | null> => {
      // Reset real-detail tracking when session changes
      if (lastDetailSessionRef.current !== sessionId) {
        hasRealDetailRef.current = false;
        lastDetailSessionRef.current = sessionId;
      }

      const result = await getSupervisionSession(sessionId, { signal });
      // Guard against cross-session race: if the session changed while this
      // request was in flight, don't write to the ref — it belongs to a
      // different session now.
      if (lastDetailSessionRef.current !== sessionId) {
        return result;
      }
      if (result && result.source === "mock" && hasRealDetailRef.current) {
        throw new Error("supervision detail unavailable");
      }
      if (result && result.source !== "mock") {
        hasRealDetailRef.current = true;
      }
      return result;
    },
    []
  );

  // selectedTaskStatus is computed from the overview which is returned by the
  // polling hook. Use a ref so the hook receives the previous render's value;
  // the hook stores it in its own ref and re-runs the detail effect when it
  // changes, so running sessions still get polled after one extra render.
  const selectedTaskStatusRef = useRef<TaskStatus | null>(null);

  const { overview, detail, retryOverview, retryDetail, refreshNow } = useSupervisionPolling({
    loadOverview,
    loadDetail,
    selectedSessionId: sessionIdFromUrl,
    selectedTaskStatus: selectedTaskStatusRef.current
  });

  const displayOverview = overview.data ?? mockFallback;
  const showInitialLoading = overview.loading && !displayOverview;
  const sessions = displayOverview?.sessions ?? [];
  const serializedQuery = serializeSupervisionQuery(query);
  const hasFilters = serializedQuery.length > 0;

  const selectedSession = useMemo(() => {
    if (!sessionIdFromUrl || !displayOverview) return null;
    return (
      displayOverview.sessions.find(
        (s) => s.session_id === sessionIdFromUrl
      ) ?? null
    );
  }, [displayOverview, sessionIdFromUrl]);

  // Derive task status from the selected overview session, or from the loaded
  // detail when the session is outside current filters (no overview match).
  selectedTaskStatusRef.current =
    selectedSession?.task_status ?? detail.data?.summary.task_status ?? null;

  const scenarioOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.scenario_id) set.add(s.scenario_id);
    }
    return Array.from(set).sort();
  }, [sessions]);

  const toolOptions = useMemo(() => {
    const set = new Set<SandboxSupervisionToolName>();
    for (const s of sessions) {
      for (const t of s.tool_names) set.add(t);
    }
    return Array.from(set).sort();
  }, [sessions]);

  // Clean up invalid known query values from the URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    const status = next.get("status");
    if (status !== null && !(TASK_STATUSES as readonly string[]).includes(status)) {
      next.delete("status");
      changed = true;
    }

    const riskLevel = next.get("risk_level");
    if (
      riskLevel !== null &&
      !(RISK_LEVELS as readonly string[]).includes(riskLevel)
    ) {
      next.delete("risk_level");
      changed = true;
    }

    const action = next.get("action");
    if (
      action !== null &&
      !(SANDBOX_POLICY_ACTIONS as readonly string[]).includes(action)
    ) {
      next.delete("action");
      changed = true;
    }

    const toolName = next.get("tool_name");
    if (
      toolName !== null &&
      !(SUPERVISION_TOOL_NAMES as readonly string[]).includes(toolName)
    ) {
      next.delete("tool_name");
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Default session selection when no session_id is in the URL.
  useEffect(() => {
    if (!displayOverview || sessionIdFromUrl) return;
    const defaultSession = pickDefaultSession(displayOverview.sessions);
    if (defaultSession) {
      const next = new URLSearchParams(searchParams);
      next.set("session_id", defaultSession.session_id);
      setSearchParams(next, { replace: true });
      setMobileView("inspector");
    }
  }, [displayOverview, sessionIdFromUrl, searchParams, setSearchParams]);

  // Sync mobile view when session_id changes from external sources (deep links).
  useEffect(() => {
    setMobileView(sessionIdFromUrl ? "inspector" : "list");
  }, [sessionIdFromUrl]);

  // Refresh overview when filters change (skip initial render).
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    void refreshNow();
  }, [serializedQuery, refreshNow]);

  const updateQuery = useCallback(
    (nextQuery: SupervisionQuery) => {
      const next = new URLSearchParams(searchParams);
      setOrDelete(next, "q", nextQuery.q);
      setOrDelete(next, "status", nextQuery.status);
      setOrDelete(next, "risk_level", nextQuery.risk_level);
      setOrDelete(next, "action", nextQuery.action);
      setOrDelete(next, "scenario_id", nextQuery.scenario_id);
      setOrDelete(next, "tool_name", nextQuery.tool_name);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("status");
    next.delete("risk_level");
    next.delete("action");
    next.delete("scenario_id");
    next.delete("tool_name");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const selectSession = useCallback(
    (sessionId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("session_id", sessionId);
      setSearchParams(next);
      setMobileView("inspector");
    },
    [searchParams, setSearchParams]
  );

  const handleMobileBack = useCallback(() => {
    setMobileView("list");
  }, []);

  return (
    <section className="sandbox-alerts-page console-panel">
      <SupervisionOverviewHeader
        counts={displayOverview?.counts ?? null}
        dataSource={dataSource}
        freshness={overview.freshness}
        lastSuccessAt={overview.lastSuccessAt}
        loading={overview.loading}
        onRefresh={refreshNow}
        onRetry={retryOverview}
        onClearFilters={clearFilters}
      />

      <SupervisionFilters
        query={query}
        onChange={updateQuery}
        scenarioOptions={scenarioOptions}
        toolOptions={toolOptions}
      />

      {showInitialLoading ? (
        <div className="supervision-loading">
          <Paragraph>Loading supervision data...</Paragraph>
        </div>
      ) : displayOverview ? (
        <div
          className={`supervision-workbench mobile-view-${mobileView}`}
          data-narrow={isNarrow ? "true" : "false"}
        >
          {(!isNarrow || mobileView === "list") && (
            <div className="supervision-session-list-wrapper">
              {sessions.length > 0 ? (
                <SupervisionSessionList
                  sessions={sessions}
                  selectedSessionId={sessionIdFromUrl}
                  onSelect={selectSession}
                />
              ) : (
                <div className="supervision-empty-state">
                  <Paragraph>
                    {hasFilters
                      ? "No sessions match the current filters."
                      : "No sessions available."}
                  </Paragraph>
                </div>
              )}
            </div>
          )}

          {(!isNarrow || mobileView === "inspector") && (
            <aside className="supervision-inspector">
              {selectedSession || sessionIdFromUrl ? (
                <>
                  {isNarrow && (
                    <button
                      type="button"
                      className="supervision-mobile-back"
                      onClick={handleMobileBack}
                      aria-label="Back to session list"
                    >
                      ← Back
                    </button>
                  )}
                {sessionIdFromUrl && !selectedSession ? (
                  <div className="supervision-inspector-outside-filters">
                    <Paragraph>
                      Session is outside current filters.
                    </Paragraph>
                  </div>
                ) : null}
                {detail.freshness === "stale" && detail.error ? (
                  <div className="supervision-inspector-stale">
                    <Paragraph>
                      Session detail is stale.
                    </Paragraph>
                    <button
                      type="button"
                      className="supervision-retry-detail-button"
                      onClick={() => {
                        void retryDetail();
                      }}
                    >
                      Retry detail
                    </button>
                  </div>
                ) : null}
                {detail.data ? (
                  <SupervisionSessionInspector detail={detail.data} />
                ) : detail.loading ? (
                  <div className="supervision-inspector-loading">
                    <Paragraph>Loading session detail...</Paragraph>
                  </div>
                ) : (
                  <div className="supervision-inspector-error">
                    <Paragraph>Session detail unavailable.</Paragraph>
                  </div>
                )}
              </>
            ) : (
              <div className="supervision-inspector-placeholder">
                <Paragraph>Select a session to inspect.</Paragraph>
              </div>
            )}
            </aside>
          )}
        </div>
      ) : null}
    </section>
  );
}
