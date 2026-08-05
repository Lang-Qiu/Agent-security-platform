export type RouteName =
  | "health"
  | "createTask"
  | "listTasks"
  | "getTask"
  | "getTaskResult"
  | "getRiskSummary"
  | "listSupervisionSessions"
  | "getSupervisionSession"
  | "getSupervisionEvidence"
  | "listCampaigns"
  | "getCampaignDetail"
  | "getCampaignEvidence"
  | "evaluateSandboxSecurity"
  | "listSandboxSecurityAuditEvents";

export interface RouteMatch {
  name: RouteName;
  params: Record<string, string>;
}

export function matchRoute(method: string | undefined, pathname: string): RouteMatch | null {
  if (method === "GET" && pathname === "/health") {
    return {
      name: "health",
      params: {}
    };
  }

  if (pathname === "/api/tasks") {
    if (method === "POST") {
      return {
        name: "createTask",
        params: {}
      };
    }

    if (method === "GET") {
      return {
        name: "listTasks",
        params: {}
      };
    }
  }

  if (method === "POST" && pathname === "/api/sandbox/security/evaluations") {
    return {
      name: "evaluateSandboxSecurity",
      params: {}
    };
  }

  if (method === "GET" && pathname === "/api/sandbox/security/audit-events") {
    return {
      name: "listSandboxSecurityAuditEvents",
      params: {}
    };
  }

  const segments = pathname.split("/").filter(Boolean);

  // /api/supervision/campaigns[/:campaignId[/evidence]]
  // P2-T7: Route precedence places evidence > detail > list to avoid shadowing.
  // Must be checked before the generic /api/supervision/sessions block below.
  if (
    method === "GET" &&
    segments[0] === "api" &&
    segments[1] === "supervision" &&
    segments[2] === "campaigns"
  ) {
    if (segments.length === 3) {
      return {
        name: "listCampaigns",
        params: {}
      };
    }

    const campaignId = segments[3];
    if (segments.length === 4) {
      return {
        name: "getCampaignDetail",
        params: { campaignId }
      };
    }

    if (segments.length === 5 && segments[4] === "evidence") {
      return {
        name: "getCampaignEvidence",
        params: { campaignId }
      };
    }
  }

  // /api/supervision/sessions[/:sessionId[/evidence]]
  if (
    method === "GET" &&
    segments[0] === "api" &&
    segments[1] === "supervision" &&
    segments[2] === "sessions"
  ) {
    if (segments.length === 3) {
      return {
        name: "listSupervisionSessions",
        params: {}
      };
    }

    const sessionId = segments[3];
    if (segments.length === 4) {
      return {
        name: "getSupervisionSession",
        params: { sessionId }
      };
    }

    if (segments.length === 5 && segments[4] === "evidence") {
      return {
        name: "getSupervisionEvidence",
        params: { sessionId }
      };
    }
  }

  if (segments[0] !== "api" || segments[1] !== "tasks" || !segments[2]) {
    return null;
  }

  const taskId = segments[2];

  if (method === "GET" && segments.length === 3) {
    return {
      name: "getTask",
      params: { taskId }
    };
  }

  if (method === "GET" && segments.length === 4 && segments[3] === "result") {
    return {
      name: "getTaskResult",
      params: { taskId }
    };
  }

  if (method === "GET" && segments.length === 4 && segments[3] === "risk-summary") {
    return {
      name: "getRiskSummary",
      params: { taskId }
    };
  }

  return null;
}
