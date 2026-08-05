export const SANDBOX_SECURITY_STAGES = [
  "user_input",
  "model_output",
  "tool_request"
] as const;

export const SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES = [
  "system_instruction",
  "developer_instruction",
  "user_input",
  "retrieved_content",
  "memory_content",
  "model_output"
] as const;

export const SANDBOX_SECURITY_RISK_CATEGORIES = [
  "prompt_injection",
  "jailbreak",
  "instruction_override",
  "privilege_escalation",
  "sensitive_data_exposure",
  "tool_hijacking",
  "unsafe_side_effect",
  "memory_poisoning",
  "trust_boundary_violation"
] as const;

export const SANDBOX_SECURITY_POLICY_PROFILE_IDS = [
  "sandbox-security-balanced.v1",
  "sandbox-security-strict.v1"
] as const;

export const SANDBOX_SECURITY_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical"
] as const;

export const SANDBOX_SECURITY_VERDICTS = [
  "no_detected_risk",
  "risk_detected",
  "indeterminate"
] as const;

export const SANDBOX_SECURITY_ACTIONS = ["allow", "alert", "ask", "deny"] as const;

export const SANDBOX_SECURITY_MAX_TEXT_BYTES = 128 * 1024;
export const SANDBOX_SECURITY_MAX_REQUEST_BYTES = 512 * 1024;
export const SANDBOX_SECURITY_MAX_CONTENT_ITEMS = 64;
export const SANDBOX_SECURITY_MAX_JSON_DEPTH = 12;
export const SANDBOX_SECURITY_MAX_JSON_NODES = 4096;

export type SandboxSecurityStage = (typeof SANDBOX_SECURITY_STAGES)[number];
export type SandboxSecurityClaimedSourceType =
  (typeof SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES)[number];
export type SandboxSecurityPolicyProfileId =
  (typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS)[number];
export type SandboxSecurityRiskCategory =
  (typeof SANDBOX_SECURITY_RISK_CATEGORIES)[number];
export type SandboxSecuritySeverity = (typeof SANDBOX_SECURITY_SEVERITIES)[number];
export type SandboxSecurityVerdict = (typeof SANDBOX_SECURITY_VERDICTS)[number];
export type SandboxSecurityAction = (typeof SANDBOX_SECURITY_ACTIONS)[number];
export type SandboxSecurityReasonCode =
  `sandbox_security_${SandboxSecurityRiskCategory}`;

export type SandboxSecurityJsonValue =
  | null
  | boolean
  | number
  | string
  | SandboxSecurityJsonValue[]
  | { [key: string]: SandboxSecurityJsonValue };

export interface SandboxSecuritySubmittedContentItem {
  source_id: string;
  claimed_source_type: SandboxSecurityClaimedSourceType;
  media_type: "text/plain" | "application/json";
  value: string | SandboxSecurityJsonValue;
  provenance_ref: string;
}

export interface SandboxSecurityToolRequest {
  call_id: string;
  tool_name: string;
  target?: string;
  arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecurityRequest {
  schema_version: "sandbox-security-request.v1";
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  content_items: SandboxSecuritySubmittedContentItem[];
  tool_request?: SandboxSecurityToolRequest;
}

export type SandboxSecurityContentLocator =
  | { kind: "whole_source" }
  | { kind: "text_byte_range"; start_byte: number; end_byte: number }
  | { kind: "json_pointer"; pointer: string };

export type SandboxSecurityToolLocator =
  | { kind: "whole_arguments" }
  | { kind: "json_pointer"; pointer: string };

export type SandboxSecurityFindingSubjectRef =
  | {
      kind: "content_source";
      source_token: string;
      locator: SandboxSecurityContentLocator;
    }
  | {
      kind: "tool_request";
      call_token: string;
      component: "whole_call" | "tool_name" | "target";
    }
  | {
      kind: "tool_request";
      call_token: string;
      component: "arguments";
      locator: SandboxSecurityToolLocator;
    };

export interface SandboxSecurityFinding {
  finding_id: string;
  detector_id: string;
  detector_version: string;
  category: SandboxSecurityRiskCategory;
  severity: SandboxSecuritySeverity;
  confidence: number;
  reason_code: SandboxSecurityReasonCode;
  subject_refs: SandboxSecurityFindingSubjectRef[];
  evidence_refs: string[];
}

export type SandboxDetectorRunObligation =
  | "profile_required"
  | "runtime_required"
  | "optional_not_selected";

export type SandboxDetectorRunStatus =
  | "matched"
  | "no_match"
  | "failed"
  | "timeout"
  | "invalid_result"
  | "skipped";

export const SANDBOX_DETECTOR_RUN_STATUSES = [
  "matched",
  "no_match",
  "failed",
  "timeout",
  "invalid_result",
  "skipped"
] as const satisfies readonly SandboxDetectorRunStatus[];

export type SandboxDetectorSkipReason =
  | "optional_not_configured"
  | "optional_not_selected"
  | "routing_not_selected"
  | "risk_short_circuit"
  | "evaluation_terminated";

export type SandboxDetectorRunErrorCode =
  | "detector_unavailable"
  | "detector_failed"
  | "detector_timeout"
  | "detector_result_invalid"
  | "detector_content_leak"
  | "external_redaction_failed"
  | "adapter_unsupported";

interface SandboxDetectorRunBase {
  detector_id: string;
  detector_version: string;
  detector_kind: "rule" | "local_model" | "external_judge";
  obligation: SandboxDetectorRunObligation;
  elapsed_ms: number;
}

export type SandboxDetectorRun =
  | (SandboxDetectorRunBase & {
      status: "matched" | "no_match";
      finding_ids: string[];
    })
  | (SandboxDetectorRunBase & {
      status: "failed" | "timeout" | "invalid_result";
      error_code: SandboxDetectorRunErrorCode;
    })
  | (SandboxDetectorRunBase & {
      status: "skipped";
      skip_reason: SandboxDetectorSkipReason;
    });

export interface SandboxSecurityDecision {
  schema_version: "sandbox-security-decision.v1";
  decision_id: string;
  request_id: string;
  evaluation_mode: "simulation" | "enforcement";
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  verdict: SandboxSecurityVerdict;
  action: SandboxSecurityAction;
  risk_level: "info" | SandboxSecuritySeverity;
  findings: SandboxSecurityFinding[];
  detector_runs: SandboxDetectorRun[];
  evidence_refs: string[];
  created_at: string;
}
