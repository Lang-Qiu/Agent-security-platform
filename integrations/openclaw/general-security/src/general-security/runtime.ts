import { randomUUID } from "node:crypto";

import { createSandboxSecurityProductionEngine } from "../../../../../engines/sandbox/src/security-production/index.ts";
import type {
  SandboxSecurityEngine,
  SandboxSecurityEvaluationRequest,
  SandboxSecurityRuntimePorts
} from "../../../../../engines/sandbox/src/security/index.ts";
import {
  normalizeSandboxSecurityDecision,
  type SandboxSecurityDecision
} from "../../../../../shared/index.ts";

import {
  normalizeOpenClawSecurityConfig,
  type OpenClawSandboxSecurityConfig,
  type OpenClawSecurityConfigOptions,
  type OpenClawSecurityProductionMode
} from "./config.ts";

export const OPENCLAW_SECURITY_ENGINE_TIMEOUT_MS = 10000 as const;

export type OpenClawSecurityInterruptionCode =
  | "engine_slot_unavailable"
  | "engine_timeout"
  | "engine_error"
  | "correlation_mismatch"
  | "request_id_unavailable";

export type OpenClawSecurityEvaluationResult =
  | Readonly<{
      kind: "decision";
      decision: Readonly<SandboxSecurityDecision>;
    }>
  | Readonly<{
      kind: "interrupted";
      code: OpenClawSecurityInterruptionCode;
    }>;

export interface OpenClawSecurityHealth {
  readonly enforcement: "healthy" | "failed";
  readonly audit: "healthy" | "degraded";
}

export type OpenClawSecurityEvaluationRequestId = string & {
  readonly __openclawSecurityEvaluationRequestId: unique symbol;
};

export interface OpenClawSecurityRuntimePorts extends SandboxSecurityRuntimePorts {
  readonly internalAuditOrigins: readonly string[];
  readonly nextEvaluationRequestId: () => unknown;
}

export interface OpenClawSecurityEngineFactoryInput {
  readonly runtime: SandboxSecurityRuntimePorts;
  readonly mode: OpenClawSecurityProductionMode;
}

export type OpenClawSecurityEngineFactory = (
  input: Readonly<OpenClawSecurityEngineFactoryInput>
) => Promise<Readonly<SandboxSecurityEngine>> | Readonly<SandboxSecurityEngine>;

export interface OpenClawSecurityRuntime {
  readonly health: () => Readonly<OpenClawSecurityHealth>;
  readonly markAuditDegraded: (reason: unknown) => void;
  readonly markEnforcementFailed: (reason: unknown) => void;
  readonly nextEvaluationRequestId: () =>
    | Readonly<{
        kind: "issued";
        requestId: OpenClawSecurityEvaluationRequestId;
      }>
    | Readonly<{
        kind: "interrupted";
        code: "request_id_unavailable";
      }>;
  readonly tryEvaluate: (
    request: Readonly<SandboxSecurityEvaluationRequest>
  ) => Promise<Readonly<OpenClawSecurityEvaluationResult>>;
}

export type OpenClawSecurityRequestIdIssueResult =
  | Readonly<{
      kind: "issued";
      requestId: OpenClawSecurityEvaluationRequestId;
    }>
  | Readonly<{
      kind: "interrupted";
      code: "request_id_unavailable";
    }>;

const REQUEST_ID_PATTERN =
  /^request:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function isOrdinaryRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function readOwnString(value: unknown, key: string): string | null {
  if (!isOrdinaryRecord(value)) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "string"
  ) {
    return null;
  }
  return descriptor.value;
}

function readEvaluationRequestId(value: unknown): string | null {
  if (!isOrdinaryRecord(value)) {
    return null;
  }
  const submission = Object.getOwnPropertyDescriptor(value, "submission");
  if (
    submission === undefined ||
    !submission.enumerable ||
    !("value" in submission)
  ) {
    return null;
  }
  return readOwnString(submission.value, "request_id");
}

function requestIdResult(
  requestId: OpenClawSecurityEvaluationRequestId
): OpenClawSecurityRequestIdIssueResult {
  return deepFreeze({ kind: "issued", requestId });
}

function unavailableRequestId(): OpenClawSecurityRequestIdIssueResult {
  return deepFreeze({
    kind: "interrupted",
    code: "request_id_unavailable"
  });
}

export function normalizeOpenClawSecurityEvaluationRequestId(
  value: unknown
): OpenClawSecurityEvaluationRequestId | null {
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    return null;
  }
  return value as OpenClawSecurityEvaluationRequestId;
}

export function issueOpenClawSecurityEvaluationRequestId(
  next: () => unknown
): OpenClawSecurityRequestIdIssueResult {
  if (typeof next !== "function") {
    return unavailableRequestId();
  }
  try {
    const requestId = normalizeOpenClawSecurityEvaluationRequestId(next());
    return requestId === null ? unavailableRequestId() : requestIdResult(requestId);
  } catch {
    return unavailableRequestId();
  }
}

export function createOpenClawSecurityRuntimePorts(): OpenClawSecurityRuntimePorts {
  return Object.freeze({
    internalAuditOrigins: Object.freeze([
      "http://sandbox-security-backend:3001"
    ]),
    nextEvaluationRequestId: () => `request:${randomUUID()}`,
    now: () => new Date().toISOString(),
    nextDecisionId: () => `decision:${randomUUID()}`,
    monotonicNowMs: () => performance.now(),
    scheduleTimeout: (delayMs: number, callback: () => void) => {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    }
  });
}

function interruption(
  code: OpenClawSecurityInterruptionCode
): Readonly<OpenClawSecurityEvaluationResult> {
  return deepFreeze({ kind: "interrupted", code });
}

function extractRuntimeConfig(
  config: unknown,
  runtimePorts: OpenClawSecurityRuntimePorts
): Readonly<OpenClawSandboxSecurityConfig> {
  const options: Readonly<OpenClawSecurityConfigOptions> = {
    internalAuditOrigins: runtimePorts.internalAuditOrigins
  };
  return normalizeOpenClawSecurityConfig(config, options);
}

function isDecisionRequestCorrelated(
  request: Readonly<SandboxSecurityEvaluationRequest>,
  decision: Readonly<SandboxSecurityDecision>
): boolean {
  const requestId = readEvaluationRequestId(request);
  return requestId !== null && decision.request_id === requestId;
}

export async function createOpenClawSecurityRuntime(input: Readonly<{
  config: unknown;
  runtimePorts?: OpenClawSecurityRuntimePorts;
  engineFactory?: OpenClawSecurityEngineFactory;
}>): Promise<Readonly<OpenClawSecurityRuntime>> {
  if (input === null || typeof input !== "object") {
    throw new Error("openclaw security runtime input invalid");
  }

  const runtimePorts = input.runtimePorts ?? createOpenClawSecurityRuntimePorts();
  const config = extractRuntimeConfig(input.config, runtimePorts);
  const engineFactory =
    input.engineFactory ??
    (createSandboxSecurityProductionEngine as OpenClawSecurityEngineFactory);
  const engine = await engineFactory({
    runtime: runtimePorts,
    mode: config.productionMode
  });

  if (
    engine === null ||
    typeof engine !== "object" ||
    typeof engine.evaluate !== "function"
  ) {
    throw new Error("openclaw security engine invalid");
  }

  let enforcement: OpenClawSecurityHealth["enforcement"] = "healthy";
  let audit: OpenClawSecurityHealth["audit"] = "healthy";
  let activeSlots = 0;

  const health = (): Readonly<OpenClawSecurityHealth> =>
    Object.freeze({ enforcement, audit });

  const markAuditDegraded = (_reason: unknown): void => {
    audit = "degraded";
  };

  const markEnforcementFailed = (_reason: unknown): void => {
    enforcement = "failed";
  };

  const nextEvaluationRequestId = (): OpenClawSecurityRequestIdIssueResult => {
    const result = issueOpenClawSecurityEvaluationRequestId(
      runtimePorts.nextEvaluationRequestId
    );
    if (result.kind === "interrupted") {
      markEnforcementFailed(result.code);
    }
    return result;
  };

  const tryEvaluate = async (
    request: Readonly<SandboxSecurityEvaluationRequest>
  ): Promise<Readonly<OpenClawSecurityEvaluationResult>> => {
    const requestId = normalizeOpenClawSecurityEvaluationRequestId(
      readEvaluationRequestId(request)
    );
    if (requestId === null) {
      markEnforcementFailed("request_id_unavailable");
      return interruption("request_id_unavailable");
    }

    if (activeSlots >= 4) {
      return interruption("engine_slot_unavailable");
    }
    activeSlots += 1;

    const controller = new AbortController();
    let timedOut = false;
    let cancelTimeout: (() => void) | null = null;
    try {
      cancelTimeout = runtimePorts.scheduleTimeout(
        OPENCLAW_SECURITY_ENGINE_TIMEOUT_MS,
        () => {
          timedOut = true;
          if (!controller.signal.aborted) {
            controller.abort("engine_timeout");
          }
        }
      );
      const decision = await engine.evaluate(request, controller.signal);
      const normalizedDecision = normalizeSandboxSecurityDecision(decision);
      if (normalizedDecision === null) {
        return interruption("engine_error");
      }
      if (
        normalizedDecision.request_id !== requestId ||
        !isDecisionRequestCorrelated(request, normalizedDecision)
      ) {
        markEnforcementFailed("correlation_mismatch");
        return interruption("correlation_mismatch");
      }
      return deepFreeze({ kind: "decision", decision: normalizedDecision });
    } catch {
      return interruption(timedOut ? "engine_timeout" : "engine_error");
    } finally {
      if (cancelTimeout !== null) {
        try {
          cancelTimeout();
        } catch {
          markEnforcementFailed("timeout_cleanup_failed");
        }
      }
      activeSlots -= 1;
    }
  };

  return Object.freeze({
    health,
    markAuditDegraded,
    markEnforcementFailed,
    nextEvaluationRequestId,
    tryEvaluate
  });
}
