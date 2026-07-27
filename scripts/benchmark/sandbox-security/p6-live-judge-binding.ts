/**
 * P6-only source-controlled live Judge binding profile.
 *
 * Ordinary production keeps runtime requested-model selection. Controlled P6
 * acceptance additionally pins the reviewed Judge channel: the selected
 * protocol, endpoint policy, canonical base/endpoint hashes, and canonical
 * requested/resolved model hashes plus their stable IDs. The capture worker
 * compares the runtime-resolved Judge binding against this profile before the
 * values may enter evidence; any mismatch fails closed and requires a reviewed
 * profile change and a fresh capture.
 *
 * The pinned SHA-256 values below are placeholders that MUST be replaced with
 * the operator's reviewed live channel values before a real P6 capture. Until
 * then verification fails closed, which is the intended pre-review state.
 */

import { createHash } from "node:crypto";

export const SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID =
  "p6_live_judge_binding_v1" as const;

export type SandboxSecurityP6JudgeProtocolId =
  | "openai_responses_v1"
  | "openai_chat_completions_json_v1";

export interface SandboxSecurityP6LiveJudgeBindingProfile {
  readonly profile_id: typeof SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID;
  readonly judge_protocol_id: SandboxSecurityP6JudgeProtocolId;
  readonly judge_endpoint_policy_id: "operator_https_fqdn_v1";
  readonly judge_base_url_sha256: string;
  readonly judge_endpoint_url_sha256: string;
  readonly judge_requested_model_id: string;
  readonly judge_requested_model_sha256: string;
  readonly judge_resolved_model_id: string;
  readonly judge_resolved_model_sha256: string;
  readonly reviewed: boolean;
}

/**
 * The reviewed P6 live Judge binding profile. The pinned hashes and stable IDs
 * below were reviewed against the operator's live channel (chat-completions JSON
 * over an operator HTTPS FQDN) via the config-normalized runtime binding, so
 * `reviewed` is `true`. Changing any value requires a fresh reviewed profile and
 * a new capture.
 */
export const SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE: SandboxSecurityP6LiveJudgeBindingProfile =
  Object.freeze({
    profile_id: SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE_ID,
    judge_protocol_id: "openai_chat_completions_json_v1",
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url_sha256:
      "a34e2a4708ed1c61008a151688838dcf1c44d4e7f08054633e72ba7c0b16cfc1",
    judge_endpoint_url_sha256:
      "948f1ecb6b48f91adc4e110d0351cd172b16450e9936d358992e0dfad7b863f3",
    judge_requested_model_id: "deepseek-v4-flash",
    judge_requested_model_sha256:
      "f61ff5cf8e1cc88da6944d6bcd3e2e7da5ff27dd3288a8781908018cb8240cd6",
    judge_resolved_model_id: "deepseek-v4-flash",
    judge_resolved_model_sha256:
      "f61ff5cf8e1cc88da6944d6bcd3e2e7da5ff27dd3288a8781908018cb8240cd6",
    reviewed: true
  });

const INVALID = "sandbox_security_p6_judge_binding_reject";
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const MODEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
 * Verifies a runtime-resolved Judge binding against the reviewed P6 profile and
 * returns the reviewed stable IDs that may enter evidence. Fails closed on an
 * unreviewed profile or any protocol/policy/hash/id mismatch.
 */
export function verifySandboxSecurityP6LiveJudgeBinding(
  runtime: SandboxSecurityP6RuntimeJudgeBinding,
  profile: SandboxSecurityP6LiveJudgeBindingProfile = SANDBOX_SECURITY_P6_LIVE_JUDGE_BINDING_PROFILE
): Readonly<{
  judge_requested_model_id: string;
  judge_resolved_model_id: string;
}> {
  if (!profile.reviewed) fail("profile_not_reviewed");
  for (const hash of [
    profile.judge_base_url_sha256,
    profile.judge_endpoint_url_sha256,
    profile.judge_requested_model_sha256,
    profile.judge_resolved_model_sha256
  ]) {
    if (!SHA256_HEX.test(hash)) fail("profile_hash_invalid");
  }

  if (
    runtime.judge_protocol_id !== profile.judge_protocol_id ||
    runtime.judge_endpoint_policy_id !== profile.judge_endpoint_policy_id
  ) {
    fail("judge_channel_mismatch");
  }
  if (
    !MODEL_IDENTIFIER.test(runtime.judge_requested_model) ||
    !MODEL_IDENTIFIER.test(runtime.judge_resolved_model)
  ) {
    fail("judge_model_identifier_invalid");
  }
  if (
    sha256Hex(runtime.judge_base_url) !== profile.judge_base_url_sha256 ||
    sha256Hex(runtime.judge_endpoint_url) !== profile.judge_endpoint_url_sha256 ||
    sha256Hex(runtime.judge_requested_model) !==
      profile.judge_requested_model_sha256 ||
    sha256Hex(runtime.judge_resolved_model) !==
      profile.judge_resolved_model_sha256
  ) {
    fail("judge_channel_mismatch");
  }

  return Object.freeze({
    judge_requested_model_id: profile.judge_requested_model_id,
    judge_resolved_model_id: profile.judge_resolved_model_id
  });
}
