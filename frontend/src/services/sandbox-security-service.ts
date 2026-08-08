import {
  normalizeSandboxSecurityDecision
} from "../../../shared/contracts/sandbox-security";
import {
  normalizeSandboxSecurityAuditPage
} from "../../../shared/contracts/sandbox-security-api";
import type { SandboxSecurityAuditPage } from "../../../shared/types/sandbox-security-api";
import type {
  SandboxSecurityDecision,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../shared/types/sandbox-security";
import {
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
