import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

interface ProbeRule {
  target_id?: string;        // 目标框架/产品标识（如 "ollama"）
  enabled?: boolean;         // 是否启用该规则
  request?: {                // 请求参数
    protocol?: string;       // "http" 或 "ws"
    method?: string;         // HTTP 方法，如 "GET"、"HEAD"
    path?: string;           // 请求路径（如 "/api/tags"）
    payload?: string;        // WebSocket 握手后发送的首条消息
    timeout_ms?: number;     // 超时时间（毫秒）
  };
  fallback?: {               // 降级策略
    action?: string;         // 如 "degrade_to_get"
  };
}

interface ProbeCollectionOptions {
  portHint?: number;
}

interface ProbeRulesDocument {
  probes?: ProbeRule[];
}

export interface ProbeObservation {
  targetId: string;                     // 规则命中的 target_id
  requestSummary: string;               // 如 "HEAD http://127.0.0.1:11434/api/tags"
  responseStatus?: number;              // HTTP 状态码（如 200）
  responseHeaders?: Record<string, unknown>;
  responseBodyExcerpt?: string;         // 响应体片段（HEAD 请求为空）
  source?: string;                      // 实际请求的 URL
  collectedAt: string;                  // ISO 时间戳
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

export class EngineAssetProbeService {
  workspaceRoot: string;
  probesFilePath: string;
  cachedRulesDocument?: ProbeRulesDocument;

  constructor(options?: { workspaceRoot?: string; probesFilePath?: string }) {
    const currentFileDir = dirname(fileURLToPath(import.meta.url));
    this.workspaceRoot = options?.workspaceRoot ?? resolve(currentFileDir, "../../../..");
    this.probesFilePath = options?.probesFilePath ?? resolve(this.workspaceRoot, "engines/asset-scan/rules/probes.v1.yaml");
  }

  async collectObservation(targetId: string, baseUrl: string, options?: ProbeCollectionOptions): Promise<ProbeObservation | null> {
    // 给定目标标识符和基础 URL，尝试所有匹配的探测规则，返回第一个成功的观察结果。
    const rules = this.getRulesDocument();
    const candidates = (rules.probes ?? []).filter((probe) => {
//       仅保留与传入 targetId 匹配、协议为 http 或 ws、且 HTTP 方法为 GET 或 HEAD 的规则。
//       要求必须有请求路径。
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
