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
import type {
  Track1CampaignAgentDetail,
  Track1CampaignAgentId,
  Track1CampaignDetail
} from "../../../shared/types/campaign-supervision";
import {
  TRACK1_CAMPAIGN_AGENT_IDS
} from "../../../shared/types/campaign-supervision";
import { CampaignAgentGroup } from "../components/supervision/CampaignAgentGroup";
import { CampaignOverviewHeader } from "../components/supervision/CampaignOverviewHeader";
import { SupervisionFilters } from "../components/supervision/SupervisionFilters";
import {
  SupervisionOverviewHeader,
  type SupervisionDataSource
} from "../components/supervision/SupervisionOverviewHeader";
import { SupervisionSessionInspector } from "../components/supervision/SupervisionSessionInspector";
import { SupervisionSessionList } from "../components/supervision/SupervisionSessionList";
import {
  useCampaignSupervisionPolling,
  type CampaignSupervisionData
} from "../hooks/useCampaignSupervisionPolling";
import { useSupervisionPolling } from "../hooks/useSupervisionPolling";
import {
  getCampaign,
  listCampaigns,
  type CampaignDataResult
} from "../services/campaign-supervision-service";
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

// ---------------------------------------------------------------------------
// Campaign mode helpers (kept outside the component per P5-T4 Step 4)
// ---------------------------------------------------------------------------

const CAMPAIGN_ID_PATTERN = /^campaign:t1:[0-9a-f]{32}$/;

function parseCampaignId(value: string | null): string | null {
  if (value === null) return null;
  return CAMPAIGN_ID_PATTERN.test(value) ? value : null;
}

function parseCampaignAgentId(
  value: string | null
): Track1CampaignAgentId | null {
  if (value === null) return null;
  return (TRACK1_CAMPAIGN_AGENT_IDS as readonly string[]).includes(value)
    ? (value as Track1CampaignAgentId)
    : null;
}

function collectCampaignSessionIds(
  detail: Track1CampaignDetail
): Set<string> {
  const ids = new Set<string>();
  for (const agent of detail.agents) {
    for (const c of agent.cases) {
      for (const a of c.attempts) {
        ids.add(a.session_id);
      }
    }
  }
  return ids;
}

function findAgentForSession(
  detail: Track1CampaignDetail,
  sessionId: string
): Track1CampaignAgentDetail | undefined {
  return detail.agents.find((a) =>
    a.cases.some((c) => c.attempts.some((at) => at.session_id === sessionId))
  );
}

function pickDefaultCampaignSession(
  detail: Track1CampaignDetail
): string | null {
  // First final attempt in first fixed agent/case order.
  for (const agent of detail.agents) {
    for (const c of agent.cases) {
      const lastAttempt = c.attempts[c.attempts.length - 1];
      if (lastAttempt) {
        return lastAttempt.session_id;
      }
    }
  }
  return null;
}

function SandboxAlertsPageCampaign(props: {
  campaignId: string;
  searchParams: URLSearchParams;
  setSearchParams: (
    next: URLSearchParams,
    options?: { replace?: boolean }
  ) => void;
}) {
  const { campaignId, searchParams, setSearchParams } = props;

  const sessionIdFromUrl = searchParams.get("session_id");
  const isNarrow = useNarrowViewport();
  const [mobileView, setMobileView] = useState<"list" | "inspector">("list");

  const loadCampaign = useCallback(
    async (
      id: string,
      signal: AbortSignal
    ): Promise<CampaignDataResult<CampaignSupervisionData>> => {
      // Fetch detail and summary in parallel. The summary comes from the
      // backend's list endpoint, which computes aggregate counts (alerts,
      // blocked, asks, retries) using backend semantics — NOT derivable from
      // the detail DTO's attempt actual_action values. Pass the campaign ID
      // as the `q` filter so the backend returns the target summary even
      // when more than 50 campaigns exist (the backend ROW_LIMIT).
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

      // Find the matching summary by campaign_id.
      const matchingSummary = summaryResult.data?.find(
        (s) => s.campaign_id === id
      );

      if (!matchingSummary) {
        // Summary unavailable — cannot show authoritative aggregate counts.
        // Return integration error rather than a front-end derived summary.
        return {
          data: null,
          source: "integration-error",
          error: summaryResult.error ?? "unavailable"
        };
      }

      return {
        data: {
          summary: matchingSummary,
          detail: detailResult.data
        },
        source: detailResult.source,
        error: null
      };
    },
    []
  );

  const { campaign, retry: retryCampaign } = useCampaignSupervisionPolling({
    campaignId,
    loadCampaign
  });

  const campaignData = campaign.data;
  const campaignDetail = campaignData?.detail ?? null;
  const campaignSummary = campaignData?.summary ?? null;

  const campaignSessionIds = useMemo(() => {
    if (!campaignDetail) return new Set<string>();
    return collectCampaignSessionIds(campaignDetail);
  }, [campaignDetail]);

  const sessionInCampaign =
    sessionIdFromUrl !== null && campaignSessionIds.has(sessionIdFromUrl);
  const effectiveSessionId = sessionInCampaign ? sessionIdFromUrl : null;

  // Default session selection when no session_id is in the URL (or the
  // session_id belongs to the campaign but isn't set yet).
  useEffect(() => {
    if (!campaignDetail) return;
    if (sessionIdFromUrl && sessionInCampaign) return;
    // If a foreign session_id is present, leave it — the rejection message
    // is shown and we don't auto-select a replacement.
    if (sessionIdFromUrl && !sessionInCampaign) return;
    const defaultSession = pickDefaultCampaignSession(campaignDetail);
    if (defaultSession) {
      const next = new URLSearchParams(searchParams);
      next.set("session_id", defaultSession);
      const agent = findAgentForSession(campaignDetail, defaultSession);
      if (agent) {
        next.set("agent_id", agent.agent_id);
      }
      setSearchParams(next, { replace: true });
    }
  }, [
    campaignDetail,
    sessionIdFromUrl,
    sessionInCampaign,
    searchParams,
    setSearchParams
  ]);

  // Remove invalid agent_id from URL.
  useEffect(() => {
    const agentIdRaw = searchParams.get("agent_id");
    if (agentIdRaw !== null && !parseCampaignAgentId(agentIdRaw)) {
      const next = new URLSearchParams(searchParams);
      next.delete("agent_id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Session detail fetch for campaign mode: single fetch with abort + generation
  // guard. The existing SupervisionSessionInspector is reused.
  const [sessionDetail, setSessionDetail] =
    useState<SandboxSupervisionSessionDetail | null>(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const sessionDetailGenRef = useRef(0);

  useEffect(() => {
    if (!effectiveSessionId) {
      setSessionDetail(null);
      setSessionDetailLoading(false);
      return;
    }
    const gen = ++sessionDetailGenRef.current;
    const controller = new AbortController();
    setSessionDetailLoading(true);

    getSupervisionSession(effectiveSessionId, { signal: controller.signal })
      .then((result) => {
        if (gen !== sessionDetailGenRef.current) return;
        if (result?.data) {
          setSessionDetail(result.data);
        } else {
          setSessionDetail(null);
        }
        setSessionDetailLoading(false);
      })
      .catch(() => {
        if (gen !== sessionDetailGenRef.current) return;
        setSessionDetail(null);
        setSessionDetailLoading(false);
      });

    return () => controller.abort();
  }, [effectiveSessionId]);

  const selectSession = useCallback(
    (sessionId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("session_id", sessionId);
      if (campaignDetail) {
        const agent = findAgentForSession(campaignDetail, sessionId);
        if (agent) {
          next.set("agent_id", agent.agent_id);
        }
      }
      setSearchParams(next);
      setMobileView("inspector");
    },
    [searchParams, setSearchParams, campaignDetail]
  );

  // Sync mobile view when session_id changes from external sources (deep
  // links, default selection, campaign switch).
  useEffect(() => {
    setMobileView(effectiveSessionId ? "inspector" : "list");
  }, [effectiveSessionId]);

  const handleMobileBack = useCallback(() => {
    setMobileView("list");
  }, []);

  const showCampaignLoading = campaign.loading && !campaignData;
  const showSessionOutsideCampaign =
    sessionIdFromUrl !== null && !sessionInCampaign;

  return (
    <section className="sandbox-alerts-page console-panel campaign-mode">
      {campaignSummary ? (
        <CampaignOverviewHeader
          summary={campaignSummary}
          source={campaign.source ?? "integration-error"}
          freshness={campaign.freshness}
          onRetry={() => {
            void retryCampaign();
          }}
        />
      ) : showCampaignLoading ? (
        <div className="campaign-loading">
          <Paragraph>Loading campaign data...</Paragraph>
        </div>
      ) : (
        <div className="campaign-error">
          <Paragraph>Campaign data unavailable.</Paragraph>
          <button
            type="button"
            onClick={() => {
              void retryCampaign();
            }}
          >
            Retry campaign data
          </button>
        </div>
      )}

      {campaignDetail ? (
        <div
          className={`campaign-workbench mobile-view-${mobileView}`}
          data-narrow={isNarrow ? "true" : "false"}
        >
          {(!isNarrow || mobileView === "list") && (
            <div className="campaign-agents" data-testid="campaign-agent-list">
              {campaignDetail.agents.map((agent) => (
                <CampaignAgentGroup
                  key={agent.agent_id}
                  agent={agent}
                  selectedSessionId={effectiveSessionId}
                  onSelectSession={selectSession}
                />
              ))}
            </div>
          )}

          {(!isNarrow || mobileView === "inspector") && (
            <aside className="supervision-inspector">
              {isNarrow && effectiveSessionId && (
                <button
                  type="button"
                  className="campaign-mobile-back"
                  onClick={handleMobileBack}
                  aria-label="Back to campaign cases"
                >
                  &larr; Back to cases
                </button>
              )}
              {showSessionOutsideCampaign ? (
                <div className="supervision-inspector-outside-campaign">
                  <Paragraph>
                    Session is not part of this campaign.
                  </Paragraph>
                </div>
              ) : effectiveSessionId ? (
                sessionDetail ? (
                  <SupervisionSessionInspector detail={sessionDetail} />
                ) : sessionDetailLoading ? (
                  <div className="supervision-inspector-loading">
                    <Paragraph>Loading session detail...</Paragraph>
                  </div>
                ) : (
                  <div className="supervision-inspector-error">
                    <Paragraph>Session detail unavailable.</Paragraph>
                  </div>
                )
              ) : (
                <div className="supervision-inspector-placeholder">
                  <Paragraph>Select an attempt to inspect.</Paragraph>
                </div>
              )}
            </aside>
          )}
        </div>
      ) : null}
    </section>
  );
}

// Session-mode subcomponent. Extracted from the top-level SandboxAlertsPage
// so that switching the campaign_id URL param (which toggles between campaign
// and session mode) does not change the number of Hooks called by the
// top-level component — violating React's Rules of Hooks.
function SandboxAlertsPageSession(props: {
  searchParams: URLSearchParams;
  setSearchParams: (
    next: URLSearchParams,
    options?: { replace?: boolean }
  ) => void;
}) {
  const { searchParams, setSearchParams } = props;

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
          data-testid="supervision-workbench"
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

export function SandboxAlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const campaignIdRaw = searchParams.get("campaign_id");
  const campaignId = parseCampaignId(campaignIdRaw);

  // Remove invalid campaign_id from URL (falls back to session mode).
  // This useEffect is always called regardless of mode, so the top-level
  // component's Hook count is constant — satisfying React's Rules of Hooks
  // when the campaign_id URL param is added/removed without a remount.
  useEffect(() => {
    if (campaignIdRaw !== null && campaignId === null) {
      const next = new URLSearchParams(searchParams);
      next.delete("campaign_id");
      setSearchParams(next, { replace: true });
    }
  }, [campaignIdRaw, campaignId, searchParams, setSearchParams]);

  if (campaignId) {
    return (
      <SandboxAlertsPageCampaign
        campaignId={campaignId}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  }

  return (
    <SandboxAlertsPageSession
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}
