import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Typography } from "antd";

import { RISK_LEVELS } from "../../../shared/constants/risk-level";
import { TASK_STATUSES } from "../../../shared/constants/task-status";
import { SANDBOX_POLICY_ACTIONS } from "../../../shared/types/sandbox";
import type { RiskLevel, TaskStatus } from "../../../shared/types/task";
import type {
  SandboxSupervisionOverview,
  SandboxSupervisionSessionSummary,
  SandboxSupervisionToolName
} from "../../../shared/types/supervision";
import { SupervisionFilters } from "../components/supervision/SupervisionFilters";
import {
  SupervisionOverviewHeader,
  type SupervisionDataSource
} from "../components/supervision/SupervisionOverviewHeader";
import { SupervisionSessionList } from "../components/supervision/SupervisionSessionList";
import { RiskTag } from "../components/RiskTag";
import { useSupervisionPolling } from "../hooks/useSupervisionPolling";
import {
  listSupervisionSessions,
  serializeSupervisionQuery,
  type SupervisionDataResult,
  type SupervisionQuery
} from "../services/supervision-service";

const { Text, Title, Paragraph } = Typography;

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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
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

  const queryRef = useRef(query);
  queryRef.current = query;

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

  const { overview, retryOverview, refreshNow } = useSupervisionPolling({
    loadOverview
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
    }
  }, [displayOverview, sessionIdFromUrl, searchParams, setSearchParams]);

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
    },
    [searchParams, setSearchParams]
  );

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
        <div className="supervision-workbench">
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

          <aside className="supervision-inspector">
            {selectedSession ? (
              <div className="supervision-inspector-content">
                <Title level={2}>Session Inspector</Title>
                <dl className="supervision-inspector-summary">
                  <div>
                    <dt>Session</dt>
                    <dd>
                      <Text code>{selectedSession.session_id}</Text>
                    </dd>
                  </div>
                  <div>
                    <dt>Task</dt>
                    <dd>
                      <Text type="secondary">{selectedSession.task_id}</Text>
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedSession.task_status}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>
                      <RiskTag level={selectedSession.risk_level} />
                    </dd>
                  </div>
                  <div>
                    <dt>Highest action</dt>
                    <dd>{selectedSession.highest_action}</dd>
                  </div>
                  <div>
                    <dt>Scenario</dt>
                    <dd>{selectedSession.scenario_id ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Case</dt>
                    <dd>{selectedSession.case_id ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Events</dt>
                    <dd>{selectedSession.event_count}</dd>
                  </div>
                  <div>
                    <dt>Decisions</dt>
                    <dd>{selectedSession.decision_count}</dd>
                  </div>
                  <div>
                    <dt>Alert records</dt>
                    <dd>{selectedSession.alert_count}</dd>
                  </div>
                  <div>
                    <dt>Blocked records</dt>
                    <dd>{selectedSession.blocked_record_count}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatTimestamp(selectedSession.updated_at)}</dd>
                  </div>
                </dl>
                <Paragraph type="secondary">
                  Timeline and evidence download available in the next phase.
                </Paragraph>
              </div>
            ) : (
              <div className="supervision-inspector-placeholder">
                <Paragraph>Select a session to inspect.</Paragraph>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
