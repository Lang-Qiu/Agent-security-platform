import type { SimulatedApiMethod } from "./contract.ts";

export interface SimulatedEmailRecord {
  message_id: string;
  recipient: string;
  subject: string;
  body: string;
}

export interface SimulatedApiRoute {
  endpoint: string;
  method: SimulatedApiMethod;
  status_code: number;
  body: Record<string, string>;
}

export interface SimulatedToolStateSnapshot {
  outbox: SimulatedEmailRecord[];
  files: Record<string, string>;
  api_routes: SimulatedApiRoute[];
}

export interface InMemorySimulatedToolStateOptions {
  files?: Record<string, string>;
  api_routes?: SimulatedApiRoute[];
}

function apiRouteKey(method: SimulatedApiMethod, endpoint: string): string {
  return `${method} ${endpoint}`;
}

function copyApiRoute(route: SimulatedApiRoute): SimulatedApiRoute {
  return {
    ...route,
    body: { ...route.body }
  };
}

export class InMemorySimulatedToolState {
  private readonly outbox: SimulatedEmailRecord[] = [];
  private readonly files: Map<string, string>;
  private readonly apiRoutes: Map<string, SimulatedApiRoute>;

  constructor(options: InMemorySimulatedToolStateOptions = {}) {
    this.files = new Map(Object.entries(options.files ?? {}));
    this.apiRoutes = new Map(
      (options.api_routes ?? []).map((route) => [
        apiRouteKey(route.method, route.endpoint),
        copyApiRoute(route)
      ])
    );
  }

  appendEmail(record: SimulatedEmailRecord): void {
    this.outbox.push({ ...record });
  }

  readFile(path: string): string | undefined {
    return this.files.get(path);
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  resolveApiRoute(
    method: SimulatedApiMethod,
    endpoint: string
  ): SimulatedApiRoute | undefined {
    const route = this.apiRoutes.get(apiRouteKey(method, endpoint));
    return route ? copyApiRoute(route) : undefined;
  }

  snapshot(): SimulatedToolStateSnapshot {
    return {
      outbox: this.outbox.map((record) => ({ ...record })),
      files: Object.fromEntries(this.files.entries()),
      api_routes: Array.from(this.apiRoutes.values(), copyApiRoute)
    };
  }
}
