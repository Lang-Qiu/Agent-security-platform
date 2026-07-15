// Master C runtime exports
export { createSandboxSecurityEngine } from "./engine.ts";
export type { SandboxSecurityEngine } from "./engine.ts";

export {
  createSandboxSecurityCanonicalFingerprintService
} from "./canonical-fingerprint.ts";
export type {
  SandboxSecurityCanonicalFingerprintPort,
  SandboxSecurityCanonicalFingerprintService
} from "./canonical-fingerprint.ts";

export {
  createSandboxSecurityMonitorDecisionAdapter
} from "./adapters/monitor-decision-provider.ts";

export {
  createTrack1RuleMatchDetectorAdapter
} from "./adapters/track1-rule-matches.ts";

export {
  resolveSandboxSecurityProfile
} from "./policy-profiles.ts";
export type {
  SandboxSecurityPolicyProfileManifest,
  SandboxSecurityDetectorSlotManifest,
  SandboxSecurityDetectorSlotId,
  SandboxSecurityTrustClass,
  SandboxSecurityTrustRule,
  SandboxSecurityActionByStage,
  SandboxSecurityActionMatrix
} from "./policy-profiles.ts";

export {
  createSandboxSecurityDetectorRegistry
} from "./detector-registry.ts";
export type {
  SandboxSecurityDetectorRegistry,
  SandboxSecurityDetectorRegistryInput
} from "./detector-registry.ts";

export type {
  SandboxSecurityRuntimePorts
} from "./runtime-deadline.ts";

export type {
  SandboxSecurityEvaluationRequest,
  SandboxSecurityAuthoritativeEvaluationContext,
  AuthenticatedSourceObservation,
  AuthenticatedToolObservation
} from "./source-authority.ts";

export type {
  RawLocalDetector,
  SandboxSecuritySanitizer,
  SanitizedExternalDetector,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate,
  SandboxSecurityCategoryClearance,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityExternalDetectorResult,
  SandboxSecurityExternalRiskCandidate,
  SandboxSecurityExternalCategoryClearance,
  SandboxSecuritySanitizedJudgePayload,
  SandboxSecuritySanitizedJudgeObligation,
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityExternalCandidateSubjectRef
} from "./detector-contract.ts";
