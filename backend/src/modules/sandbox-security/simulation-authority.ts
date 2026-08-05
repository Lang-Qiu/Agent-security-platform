import type {
  SandboxSecurityJsonValue,
  SandboxSecurityRequest
} from "../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityEvaluationRequest } from "./sandbox-security.types.ts";

function cloneJson(value: SandboxSecurityJsonValue): SandboxSecurityJsonValue {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneJson(item));
  }

  const result: { [key: string]: SandboxSecurityJsonValue } = {};
  for (const key of Object.keys(value)) {
    result[key] = cloneJson(value[key]);
  }
  return result;
}

function cloneSandboxSecurityRequest(
  submission: Readonly<SandboxSecurityRequest>
): SandboxSecurityRequest {
  const content_items = submission.content_items.map((item) => ({
    source_id: item.source_id,
    claimed_source_type: item.claimed_source_type,
    media_type: item.media_type,
    value:
      item.media_type === "application/json"
        ? cloneJson(item.value as SandboxSecurityJsonValue)
        : item.value,
    provenance_ref: item.provenance_ref
  }));

  return {
    schema_version: "sandbox-security-request.v1",
    request_id: submission.request_id,
    stage: submission.stage,
    policy_profile_id: submission.policy_profile_id,
    content_items,
    ...(submission.tool_request
      ? {
          tool_request: {
            call_id: submission.tool_request.call_id,
            tool_name: submission.tool_request.tool_name,
            arguments: cloneJson(submission.tool_request.arguments),
            ...(submission.tool_request.target === undefined
              ? {}
              : { target: submission.tool_request.target })
          }
        }
      : {})
  };
}

function cloneAuthorityValue(
  mediaType: "text/plain" | "application/json",
  value: string | SandboxSecurityJsonValue
): string | SandboxSecurityJsonValue {
  return mediaType === "application/json"
    ? cloneJson(value as SandboxSecurityJsonValue)
    : value;
}

export function createSandboxSecuritySimulationEvaluationRequest(
  submission: Readonly<SandboxSecurityRequest>
): Readonly<SandboxSecurityEvaluationRequest> {
  const clonedSubmission = cloneSandboxSecurityRequest(submission);

  return {
    submission: clonedSubmission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: submission.stage,
      policy_profile_id: submission.policy_profile_id,
      sources: submission.content_items.map((item) => ({
        source_id: item.source_id,
        authority_kind: "simulation_observation" as const,
        source_type: item.claimed_source_type,
        media_type: item.media_type,
        value: cloneAuthorityValue(item.media_type, item.value),
        provenance_ref: item.provenance_ref
      })),
      ...(submission.tool_request
        ? {
            tool_request: {
              authority_kind: "simulation_observation" as const,
              call_id: submission.tool_request.call_id,
              tool_name: submission.tool_request.tool_name,
              arguments: cloneJson(submission.tool_request.arguments),
              ...(submission.tool_request.target === undefined
                ? {}
                : { target: submission.tool_request.target })
            }
          }
        : {})
    }
  };
}
