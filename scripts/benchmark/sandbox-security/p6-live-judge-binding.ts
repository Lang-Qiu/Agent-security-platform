/**
 * P6-only source-controlled live Judge binding profile.
 *
 * Ordinary production keeps runtime requested-model selection. Controlled P6
 * acceptance additionally pins the reviewed Judge protocol and endpoint policy.
 * The operator environment is the sole source for the base URL, credential,
 * requested model, and runtime-resolved model; those values are bound into the
 * signed evidence after this policy check.
 *
 * Channel-specific values are intentionally absent from this source-controlled
 * profile so a channel change is controlled only by the operator environment.
 */

import {
  normalizeSandboxSecurityJudgeEndpoint,
  resolveSandboxSecurityJudgeProtocol
} from "../../../engines/sandbox/src/security-production/judge-protocol-adapter.ts";

export const SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID =
  "p6_live_judge_binding_v1" as const;

export type SandboxSecurityP6JudgeProtocolId =
  | "openai_responses_v1"
  | "openai_chat_completions_json_v1";

export interface SandboxSecurityP6LiveJudgeBindingProfile {
  readonly profile_id: typeof SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID;
  readonly judge_protocol_id: SandboxSecurityP6JudgeProtocolId;
  readonly judge_endpoint_policy_id: "operator_https_fqdn_v1";
  readonly reviewed: boolean;
}

/**
 * The reviewed P6 live Judge policy profile. Runtime channel values remain
 * operator-controlled and are validated before they enter acceptance evidence.
 */
export const SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE: SandboxSecurityP6LiveJudgeBindingProfile =
  Object.freeze({
    profile_id: SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID,
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    reviewed: true
  });

const INVALID = "sandbox_security_p6_judge_binding_reject";
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

export interface SandboxSecurityP6RuntimeJudgeBinding {
  readonly judge_protocol_id: string;
  readonly judge_endpoint_policy_id: string;
  readonly judge_base_url: string;
  readonly judge_endpoint_url: string;
  readonly judge_requested_model: string;
  readonly judge_resolved_model: string;
}

/**
 * Verifies a runtime-resolved Judge binding against the reviewed P6 policy and
 * returns the runtime model IDs that may enter evidence. Fails closed on an
 * unreviewed profile or any protocol/policy/endpoint/model mismatch.
 */
export function verifySandboxSecurityP6LiveJudgeBinding(
  runtime: SandboxSecurityP6RuntimeJudgeBinding,
  profile: SandboxSecurityP6LiveJudgeBindingProfile = SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE
): Readonly<{
  judge_requested_model_id: string;
  judge_resolved_model_id: string;
}> {
  if (!profile.reviewed) fail("profile_not_reviewed");
  if (
    runtime.judge_protocol_id !== profile.judge_protocol_id ||
    runtime.judge_endpoint_policy_id !== profile.judge_endpoint_policy_id
  ) {
    fail("judge_channel_mismatch");
  }
  if (
    typeof runtime.judge_base_url !== "string" ||
    typeof runtime.judge_endpoint_url !== "string" ||
    !MODEL_IDENTIFIER.test(runtime.judge_requested_model) ||
    !MODEL_IDENTIFIER.test(runtime.judge_resolved_model)
  ) {
    fail("judge_model_identifier_invalid");
  }

  try {
    const protocol = resolveSandboxSecurityJudgeProtocol(
      runtime.judge_protocol_id as SandboxSecurityP6JudgeProtocolId,
      runtime.judge_base_url
    );
    const endpoint = normalizeSandboxSecurityJudgeEndpoint(
      runtime.judge_protocol_id as SandboxSecurityP6JudgeProtocolId,
      runtime.judge_endpoint_url
    );
    if (protocol.endpoint_url !== endpoint.endpoint_url) {
      fail("judge_channel_mismatch");
    }
  } catch {
    fail("judge_channel_mismatch");
  }

  return Object.freeze({
    judge_requested_model_id: runtime.judge_requested_model,
    judge_resolved_model_id: runtime.judge_resolved_model
  });
}
