export type RouteName =
  | "health"
  | "createTask"
  | "listTasks"
  | "getTask"
  | "getTaskResult"
  | "getRiskSummary";

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

  const segments = pathname.split("/").filter(Boolean);

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
