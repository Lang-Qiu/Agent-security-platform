import { isApiResponse } from "../../../shared/contracts/api-response";
import {
  normalizeSandboxSecurityDecision
} from "../../../shared/contracts/sandbox-security";
import {
  normalizeSandboxSecurityAuditPage,
  normalizeSandboxSecurityEvaluationStreamEvent
} from "../../../shared/contracts/sandbox-security-api";
import type {
  SandboxSecurityAuditPage,
  SandboxSecurityEvaluationStreamEvent
} from "../../../shared/types/sandbox-security-api";
import type {
  SandboxSecurityDecision,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../shared/types/sandbox-security";
import {
  normalizeSandboxSecurityCapabilityToken,
  requestAuthenticatedJson,
  type AuthenticatedRequestOptions,
  type SandboxSecurityCallResult
} from "./api-client";
import { validateEvaluationRequest } from "../utils/sandbox-security-limits";

const EVALUATIONS_PATH = "/api/sandbox/security/evaluations";
const AUDIT_EVENTS_PATH = "/api/sandbox/security/audit-events";

const AUDIT_LIMIT_MIN = 1;
const AUDIT_LIMIT_MAX = 100;

export interface EvaluateSandboxSecurityInput {
  capabilityToken: string;
  idempotencyKey: string;
  requestId: string;
  stage: SandboxSecurityStage;
  policyProfileId: SandboxSecurityPolicyProfileId;
  contentItems: SandboxSecuritySubmittedContentItem[];
  toolRequest?: SandboxSecurityToolRequest;
  options?: AuthenticatedRequestOptions;
}

export async function evaluateSandboxSecurityRequest(
  input: EvaluateSandboxSecurityInput
): Promise<SandboxSecurityCallResult<SandboxSecurityDecision>> {
  const preflight = validateEvaluationRequest({
    stage: input.stage,
    contentItems: input.contentItems,
    toolRequest: input.toolRequest
  });
  if (!preflight.ok) {
    return { kind: "invalid" };
  }

  const body: {
    schema_version: "sandbox-security-request.v1";
    request_id: string;
    stage: SandboxSecurityStage;
    policy_profile_id: SandboxSecurityPolicyProfileId;
    content_items: SandboxSecuritySubmittedContentItem[];
    tool_request?: SandboxSecurityToolRequest;
  } = {
    schema_version: "sandbox-security-request.v1",
    request_id: input.requestId,
    stage: input.stage,
    policy_profile_id: input.policyProfileId,
    content_items: input.contentItems
  };
  if (input.toolRequest !== undefined) {
    body.tool_request = input.toolRequest;
  }

  return requestAuthenticatedJson({
    path: EVALUATIONS_PATH,
    method: "POST",
    capabilityToken: input.capabilityToken,
    idempotencyKey: input.idempotencyKey,
    body,
    normalize: normalizeSandboxSecurityDecision,
    options: input.options
  });
}

type SandboxSecurityEvaluationStageEvent = Extract<
  SandboxSecurityEvaluationStreamEvent,
  { event_type: "stage" }
>;

export interface StreamSandboxSecurityEvaluationInput
  extends EvaluateSandboxSecurityInput {
  onStage: (event: SandboxSecurityEvaluationStageEvent) => void;
}

function streamErrorResult(response: Response, payload: unknown) {
  const errorCode =
    typeof payload === "object" &&
    payload !== null &&
    "error_code" in payload &&
    typeof payload.error_code === "string"
      ? payload.error_code
      : null;
  const retryAfter = response.headers.get("retry-after");
  const parsedRetry = retryAfter === null ? null : Number.parseInt(retryAfter, 10);
  return {
    kind: "error" as const,
    httpStatus: response.status,
    errorCode,
    retryAfterSeconds:
      parsedRetry !== null && Number.isSafeInteger(parsedRetry) && parsedRetry >= 0
        ? parsedRetry
        : null
  };
}

export async function streamSandboxSecurityEvaluation(
  input: StreamSandboxSecurityEvaluationInput
): Promise<SandboxSecurityCallResult<SandboxSecurityDecision>> {
  const preflight = validateEvaluationRequest({
    stage: input.stage,
    contentItems: input.contentItems,
    toolRequest: input.toolRequest
  });
  if (!preflight.ok) return { kind: "invalid" };
  const capabilityToken = normalizeSandboxSecurityCapabilityToken(input.capabilityToken);
  if (capabilityToken === null) return { kind: "invalid_token" };
  const fetchImpl = input.options?.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { kind: "unavailable" };

  const body = {
    schema_version: "sandbox-security-request.v1" as const,
    request_id: input.requestId,
    stage: input.stage,
    policy_profile_id: input.policyProfileId,
    content_items: input.contentItems,
    ...(input.toolRequest === undefined ? {} : { tool_request: input.toolRequest })
  };
  let response: Response;
  try {
    response = await fetchImpl(EVALUATIONS_PATH, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${capabilityToken}`,
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey
      },
      body: JSON.stringify(body),
      signal: input.options?.signal
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return streamErrorResult(response, payload);
  }
  if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("text/event-stream")) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { kind: "invalid" };
    }
    if (!isApiResponse(payload)) return { kind: "invalid" };
    const normalized = normalizeSandboxSecurityDecision(payload.data);
    return normalized === null ? { kind: "invalid" } : { kind: "ok", data: normalized };
  }
  if (response.body === null) return { kind: "invalid" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let expectedSequence = 1;
  let decision: SandboxSecurityDecision | null = null;

  const consumeFrame = (frame: string): SandboxSecurityCallResult<SandboxSecurityDecision> | null => {
    const lines = frame.split("\n").filter((line) => line.length > 0);
    if (lines.length !== 2) return { kind: "invalid" };
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!eventLine || !dataLine) return { kind: "invalid" };
    let payload: unknown;
    try {
      payload = JSON.parse(dataLine.slice(6));
    } catch {
      return { kind: "invalid" };
    }
    const event = normalizeSandboxSecurityEvaluationStreamEvent(payload);
    if (
      event === null ||
      event.event_type !== eventLine.slice(7) ||
      event.request_id !== input.requestId
    ) {
      return { kind: "invalid" };
    }
    if (event.event_type === "stage") {
      if (event.sequence !== expectedSequence || decision !== null) {
        return { kind: "invalid" };
      }
      expectedSequence += 1;
      input.onStage(event);
      return null;
    }
    if (event.event_type === "decision") {
      if (expectedSequence !== 5 || decision !== null) return { kind: "invalid" };
      decision = event.decision;
      expectedSequence = 6;
      return null;
    }
    return {
      kind: "error",
      httpStatus: event.retryable ? 503 : 500,
      errorCode: event.error_code,
      retryAfterSeconds: null
    };
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.length > 0) {
          const terminal = consumeFrame(frame);
          if (terminal !== null) {
            await reader.cancel();
            return terminal;
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
  } catch {
    return { kind: "unavailable" };
  }

  if (buffer.trim().length > 0 || decision === null || expectedSequence !== 6) {
    return { kind: "invalid" };
  }
  return { kind: "ok", data: decision };
}

export interface ReadSandboxSecurityAuditPageInput {
  capabilityToken: string;
  limit: number;
  cursor?: string;
  options?: AuthenticatedRequestOptions;
}

function clampAuditLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return AUDIT_LIMIT_MIN;
  }
  const truncated = Math.trunc(limit);
  if (truncated < AUDIT_LIMIT_MIN) {
    return AUDIT_LIMIT_MIN;
  }
  if (truncated > AUDIT_LIMIT_MAX) {
    return AUDIT_LIMIT_MAX;
  }
  return truncated;
}

export async function readSandboxSecurityAuditPage(
  input: ReadSandboxSecurityAuditPageInput
): Promise<SandboxSecurityCallResult<SandboxSecurityAuditPage>> {
  const params = new URLSearchParams();
  params.set("limit", String(clampAuditLimit(input.limit)));
  if (input.cursor !== undefined) {
    params.set("cursor", input.cursor);
  }

  return requestAuthenticatedJson({
    path: `${AUDIT_EVENTS_PATH}?${params.toString()}`,
    method: "GET",
    capabilityToken: input.capabilityToken,
    normalize: normalizeSandboxSecurityAuditPage,
    options: input.options
  });
}
