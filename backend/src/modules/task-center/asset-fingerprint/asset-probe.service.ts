import { readFileSync } from "fs";
import { resolve } from "path";

import { parse } from "yaml";

interface ProbeRule {
  target_id?: string;
  enabled?: boolean;
  request?: {
    protocol?: string;
    method?: string;
    path?: string;
    payload?: string;
    timeout_ms?: number;
  };
  fallback?: {
    action?: string;
  };
}

interface ProbeCollectionOptions {
  portHint?: number;
}

interface ProbeRulesDocument {
  probes?: ProbeRule[];
}

export interface ProbeObservation {
  targetId: string;
  requestSummary: string;
  responseStatus?: number;
  responseHeaders?: Record<string, unknown>;
  responseBodyExcerpt?: string;
  source?: string;
  collectedAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createLogicalEndpoint(baseUrl: string, path: string, portHint?: number): string {
  const logicalUrl = new URL(path, baseUrl);

  if (isNumber(portHint) && portHint > 0) {
    logicalUrl.port = String(portHint);
  }

  return logicalUrl.toString();
}

function normalizeProbeRulesDocument(value: unknown): ProbeRulesDocument {
  if (!isPlainObject(value) || !Array.isArray(value.probes)) {
    return { probes: [] };
  }

  const probes = value.probes
    .filter((probe): probe is Record<string, unknown> => isPlainObject(probe))
    .map((probe) => {
      const normalizedRule: ProbeRule = {
        target_id: isString(probe.target_id) ? probe.target_id : undefined,
        enabled: typeof probe.enabled === "boolean" ? probe.enabled : true
      };

      if (isPlainObject(probe.request)) {
        normalizedRule.request = {
          protocol: isString(probe.request.protocol) ? probe.request.protocol : undefined,
          method: isString(probe.request.method) ? probe.request.method : undefined,
          path: isString(probe.request.path) ? probe.request.path : undefined,
          payload: isString(probe.request.payload) ? probe.request.payload : undefined,
          timeout_ms: isNumber(probe.request.timeout_ms) ? probe.request.timeout_ms : undefined
        };
      }

      if (isPlainObject(probe.fallback)) {
        normalizedRule.fallback = {
          action: isString(probe.fallback.action) ? probe.fallback.action : undefined
        };
      }

      return normalizedRule;
    });

  return { probes };
}

export class AssetProbeService {
  workspaceRoot: string;
  probesFilePath: string;
  cachedRulesDocument?: ProbeRulesDocument;

  constructor(options?: { workspaceRoot?: string; probesFilePath?: string }) {
    this.workspaceRoot = options?.workspaceRoot ?? resolve(new URL("../../../../..", import.meta.url).pathname);
    this.probesFilePath = options?.probesFilePath ?? resolve(this.workspaceRoot, "engines/asset-scan/rules/probes.v1.yaml");
  }

  async collectObservation(targetId: string, baseUrl: string, options?: ProbeCollectionOptions): Promise<ProbeObservation | null> {
    const rules = this.getRulesDocument();
    const candidates = (rules.probes ?? []).filter((probe) => {
      const method = probe.request?.method?.toUpperCase();
      const protocol = probe.request?.protocol;

      return (
        probe.enabled !== false &&
        probe.target_id === targetId &&
        (protocol === "http" || protocol === "ws") &&
        (protocol === "ws" || method === "GET" || method === "HEAD") &&
        isString(probe.request?.path)
      );
    });

    for (const probe of candidates) {
      const path = probe.request?.path as string;
      const timeoutMs = probe.request?.timeout_ms ?? 1200;
      const actualEndpoint = new URL(path, baseUrl).toString();
      const logicalEndpoint = createLogicalEndpoint(baseUrl, path, options?.portHint);

      if (probe.request?.protocol === "ws") {
        const websocketAttempt = await this.requestWebSocketEndpoint(actualEndpoint, probe.request.payload, timeoutMs);

        if (websocketAttempt) {
          return {
            targetId,
            requestSummary: `WS ${logicalEndpoint}`,
            responseStatus: websocketAttempt.status,
            responseHeaders: websocketAttempt.headers,
            responseBodyExcerpt: websocketAttempt.body,
            source: logicalEndpoint,
            collectedAt: new Date().toISOString()
          };
        }

        continue;
      }

      const method = probe.request?.method?.toUpperCase() as "GET" | "HEAD";

      const firstAttempt = await this.requestEndpoint(actualEndpoint, method, timeoutMs);

      if (firstAttempt) {
        return {
          targetId,
          requestSummary: `${method} ${logicalEndpoint}`,
          responseStatus: firstAttempt.status,
          responseHeaders: firstAttempt.headers,
          responseBodyExcerpt: firstAttempt.body,
          source: logicalEndpoint,
          collectedAt: new Date().toISOString()
        };
      }

      if (method === "HEAD" && probe.fallback?.action === "degrade_to_get") {
        const fallbackAttempt = await this.requestEndpoint(actualEndpoint, "GET", timeoutMs);

        if (fallbackAttempt) {
          return {
            targetId,
            requestSummary: `GET ${logicalEndpoint}`,
            responseStatus: fallbackAttempt.status,
            responseHeaders: fallbackAttempt.headers,
            responseBodyExcerpt: fallbackAttempt.body,
            source: logicalEndpoint,
            collectedAt: new Date().toISOString()
          };
        }
      }
    }

    return null;
  }

  async requestEndpoint(
    endpoint: string,
    method: "GET" | "HEAD",
    timeoutMs: number
  ): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1200;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method,
        signal: abortController.signal
      });

      if (response.status < 200 || response.status >= 300) {
        return null;
      }

      const body = method === "HEAD" ? "" : await response.text();
      const headers = Object.fromEntries(response.headers.entries());

      return {
        status: response.status,
        headers,
        body
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async requestWebSocketEndpoint(
    endpoint: string,
    payload: string | undefined,
    timeoutMs: number
  ): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
    const websocketConstructor = (globalThis as unknown as {
      WebSocket?: new (url: string) => {
        addEventListener: (type: string, listener: (event: { data?: unknown }) => void, options?: { once?: boolean }) => void;
        send: (data: string) => void;
        close: () => void;
      };
    }).WebSocket;

    if (!websocketConstructor) {
      return null;
    }

    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1500;

    return new Promise((resolvePromise) => {
      const websocket = new websocketConstructor(endpoint);
      const timer = setTimeout(() => {
        websocket.close();
        resolvePromise(null);
      }, timeout);

      const finalize = (result: { status: number; headers: Record<string, string>; body: string } | null) => {
        clearTimeout(timer);
        resolvePromise(result);
      };

      websocket.addEventListener(
        "open",
        () => {
          if (payload) {
            websocket.send(payload);
          }
        },
        { once: true }
      );

      websocket.addEventListener(
        "message",
        (event) => {
          websocket.close();
          finalize({
            status: 101,
            headers: {
              upgrade: "websocket"
            },
            body: typeof event.data === "string" ? event.data : String(event.data ?? "")
          });
        },
        { once: true }
      );

      websocket.addEventListener(
        "error",
        () => {
          websocket.close();
          finalize(null);
        },
        { once: true }
      );
    });
  }

  getRulesDocument(): ProbeRulesDocument {
    if (this.cachedRulesDocument) {
      return this.cachedRulesDocument;
    }

    const raw = readFileSync(this.probesFilePath, "utf8");
    const parsed = parse(raw) as unknown;

    this.cachedRulesDocument = normalizeProbeRulesDocument(parsed);

    return this.cachedRulesDocument;
  }
}
