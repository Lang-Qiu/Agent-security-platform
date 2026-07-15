import type {
  SandboxSecurityNormalizedToolRequest
} from "./input-boundary.ts";
import type {
  SandboxSecurityNormalizedContent,
  SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";
import type {
  SandboxSecurityStage,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity,
  SandboxSecurityReasonCode,
  SandboxSecurityContentLocator,
  SandboxSecurityToolLocator,
  SandboxSecurityClaimedSourceType,
  SandboxSecurityJsonValue
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityRawDetectorSnapshot {
  // engine-private handles and frozen authoritative material for raw-local
  // and sanitizer only; no public constructor; adapters cannot forge
  // Engine creates this AFTER profile resolution; full frozen profile manifest
  readonly request_id: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly contents: readonly SandboxSecurityNormalizedContent[];
  readonly tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  readonly canonical_request_sha256: string;
}

export interface RawLocalDetector {
  detect(
    snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
    signal: AbortSignal
  ): Promise<SandboxSecurityRawDetectorResult>;
}

export interface SandboxSecuritySanitizer {
  sanitize(
    snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
    routed_obligations:
      readonly SandboxSecuritySanitizedJudgeObligation[],
    signal: AbortSignal
  ): Promise<SandboxSecuritySanitizedJudgePayload>;
}

export interface SanitizedExternalDetector {
  detect(
    payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
    signal: AbortSignal
  ): Promise<SandboxSecurityExternalDetectorResult>;
}

/**
 * Engine-private, content-free compatibility control signal. Only
 * `instanceof` this class maps to adapter_unsupported; lookalike objects remain
 * ordinary detector failures. P5-T4 never exports this class from
 * security/index.ts.
 */
export class SandboxSecurityAdapterUnsupportedError extends Error {
  readonly code = "adapter_unsupported" as const;

  constructor() {
    super("sandbox_security_adapter_unsupported");
    this.name = "SandboxSecurityAdapterUnsupportedError";
    Object.freeze(this);
  }
}

export type SandboxSecurityCandidateSubjectRef =
  | {
      kind: "content_source";
      source_handle: string;
      locator: SandboxSecurityContentLocator;
    }
  | {
      kind: "tool_request";
      call_handle: string;
      component: "whole_call" | "tool_name" | "target";
    }
  | {
      kind: "tool_request";
      call_handle: string;
      component: "arguments";
      locator: SandboxSecurityToolLocator;
    };

export type SandboxSecurityExternalCandidateSubjectRef =
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

export interface SandboxSecurityRiskCandidate<
  TSubjectRef extends object = SandboxSecurityCandidateSubjectRef
> {
  category: SandboxSecurityRiskCategory;
  severity: SandboxSecuritySeverity;
  confidence: number;
  reason_code: SandboxSecurityReasonCode;
  subject_refs: TSubjectRef[];
}

export interface SandboxSecurityCategoryClearance<
  TSubjectRef extends object = SandboxSecurityCandidateSubjectRef
> {
  category: SandboxSecurityRiskCategory;
  confidence: number;
  subject_refs: TSubjectRef[];
}

export interface SandboxSecurityRawDetectorResult {
  candidates: SandboxSecurityRiskCandidate[];
  clearances: SandboxSecurityCategoryClearance[];
}

export interface SandboxSecurityExternalRiskCandidate {
  readonly obligation_id: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs:
    readonly SandboxSecurityExternalCandidateSubjectRef[];
}

export interface SandboxSecurityExternalCategoryClearance {
  readonly obligation_id: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly confidence: number;
  readonly subject_refs:
    readonly SandboxSecurityExternalCandidateSubjectRef[];
}

export interface SandboxSecurityExternalDetectorResult {
  readonly candidates: readonly SandboxSecurityExternalRiskCandidate[];
  readonly clearances: readonly SandboxSecurityExternalCategoryClearance[];
}

export interface SandboxSecuritySanitizedJudgeSource {
  readonly source_token: string;
  readonly source_type: SandboxSecurityClaimedSourceType;
  readonly media_type: "text/plain" | "application/json";
  readonly sanitized_value: string | SandboxSecurityJsonValue;
}

export interface SandboxSecuritySanitizedJudgeToolRequest {
  readonly call_token: string;
  readonly tool_name_token: string;
  readonly sanitized_target?: string;
  readonly sanitized_arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecuritySanitizedJudgeObligation {
  readonly obligation_id: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_refs:
    readonly SandboxSecurityExternalCandidateSubjectRef[];
}

export interface SandboxSecuritySanitizedJudgePayload {
  readonly schema_version: "sandbox-security-sanitized-judge.v1";
  readonly request_token: string;
  readonly stage: SandboxSecurityStage;
  readonly policy_profile_id: SandboxSecurityPolicyProfileId;
  readonly sources: readonly SandboxSecuritySanitizedJudgeSource[];
  readonly tool_request?:
    Readonly<SandboxSecuritySanitizedJudgeToolRequest>;
  readonly routed_obligations:
    readonly SandboxSecuritySanitizedJudgeObligation[];
}

export const SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM = 8;
export const SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES = 256 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH = 8;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES = 2048;
export const SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_TOKENS = 67;
