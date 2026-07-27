import type {
  AuthenticatedSourceObservation,
  AuthenticatedToolObservation,
  RawLocalDetector,
  SanitizedExternalDetector,
  SandboxSecurityActionByStage,
  SandboxSecurityActionMatrix,
  SandboxSecurityAuthoritativeEvaluationContext,
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityCanonicalFingerprintPort,
  SandboxSecurityCanonicalFingerprintService,
  SandboxSecurityCategoryClearance,
  SandboxSecurityDetectorRegistry,
  SandboxSecurityDetectorRegistryInput,
  SandboxSecurityDetectorSlotId,
  SandboxSecurityDetectorSlotManifest,
  SandboxSecurityEngine,
  SandboxSecurityEvaluationRequest,
  SandboxSecurityExternalCandidateSubjectRef,
  SandboxSecurityExternalCategoryClearance,
  SandboxSecurityExternalDetectorResult,
  SandboxSecurityExternalRiskCandidate,
  SandboxSecurityPolicyProfileManifest,
  SandboxSecurityRawDetectorResult,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate,
  SandboxSecurityRuntimePorts,
  SandboxSecuritySanitizedJudgeObligation,
  SandboxSecuritySanitizedJudgePayload,
  SandboxSecuritySanitizer,
  SandboxSecurityTrustClass,
  SandboxSecurityTrustRule
} from "../../src/security/index.ts";
import {
  createSandboxSecurityEngine
} from "../../src/security/index.ts";
import {
  createSandboxSecurityP6LiveCaptureEngine
} from "../../src/security/engine.ts";

// @ts-expect-error internal normalized request is not a public engine export
import type { NormalizedSandboxSecurityEvaluationRequest } from "../../src/security/index.ts";
// @ts-expect-error internal request brand is not a public engine export
import type { sandboxSecurityEvaluationRequestBrand } from "../../src/security/index.ts";
// @ts-expect-error prepared input is not a public engine export
import type { SandboxSecurityPreparedInput } from "../../src/security/index.ts";
// @ts-expect-error raw subject registry is not a public engine export
import type { SandboxSecurityRawSubjectRegistry } from "../../src/security/index.ts";

import type {
  SandboxSecurityFindingSubjectRef,
  SandboxSecurityRequest
} from "../../../../shared/types/sandbox-security.ts";

// probes must not import NormalizedSandboxSecurityEvaluationRequest

declare const publicRequest: SandboxSecurityRequest;
declare const snapshot: SandboxSecurityRawDetectorSnapshot;
declare const judge: SanitizedExternalDetector;
declare const raw: RawLocalDetector;
declare const evaluationRequest: SandboxSecurityEvaluationRequest;
declare const publicSubject: SandboxSecurityFindingSubjectRef;
declare const privateSubject: SandboxSecurityCandidateSubjectRef;
declare const registry: SandboxSecurityDetectorRegistry;
declare const runtimePorts: SandboxSecurityRuntimePorts;
declare const profile: SandboxSecurityPolicyProfileManifest;
declare const profileResolver: (
  profileId: string
) => Readonly<SandboxSecurityPolicyProfileManifest>;
type MasterDExportProbe = readonly [
  SandboxSecurityEvaluationRequest,
  SandboxSecurityAuthoritativeEvaluationContext,
  AuthenticatedSourceObservation,
  AuthenticatedToolObservation,
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts,
  SandboxSecurityCanonicalFingerprintPort,
  SandboxSecurityCanonicalFingerprintService,
  SandboxSecurityDetectorRegistry,
  SandboxSecurityDetectorRegistryInput,
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
  SandboxSecurityExternalCandidateSubjectRef,
  SandboxSecurityPolicyProfileManifest,
  SandboxSecurityDetectorSlotManifest,
  SandboxSecurityDetectorSlotId,
  SandboxSecurityTrustClass,
  SandboxSecurityTrustRule,
  SandboxSecurityActionByStage,
  SandboxSecurityActionMatrix
];
declare const masterDExports: MasterDExportProbe;

// @ts-expect-error ordinary public request is not complete evaluation request
const badEval: SandboxSecurityEvaluationRequest = publicRequest;

// @ts-expect-error external Judge only accepts sanitized payload
judge.detect(snapshot, new AbortController().signal);

// @ts-expect-error raw detector not assignable to SanitizedExternalDetector
const badJudge: SanitizedExternalDetector = raw;

// @ts-expect-error public subject is not private candidate subject
const badSubject: SandboxSecurityCandidateSubjectRef = publicSubject;

// action property is the diagnostic line — directive must sit on that line
const badCandidate: SandboxSecurityRiskCandidate = {
  category: "prompt_injection",
  severity: "high",
  confidence: 0.9,
  reason_code: "sandbox_security_prompt_injection",
  subject_refs: [],
  // @ts-expect-error candidate cannot declare action
  action: "deny"
};

// @ts-expect-error raw candidate subject is not external subject ref
const badExternal: SandboxSecurityExternalCandidateSubjectRef = privateSubject;

const publicDepsWithProfileResolver = {
  registry,
  runtime: runtimePorts,
  profileResolver
};
createSandboxSecurityEngine(publicDepsWithProfileResolver);

const publicDepsWithEntryBudget = {
  registry,
  runtime: runtimePorts,
  entryNormalWorkBudgetMs: 40000
};
createSandboxSecurityEngine(publicDepsWithEntryBudget);

const internalDepsWithEntryBudget = {
  registry,
  runtime: runtimePorts,
  entryNormalWorkBudgetMs: 40000
};
createSandboxSecurityP6LiveCaptureEngine(
  // @ts-expect-error internal P6 Engine owns its entry budget
  internalDepsWithEntryBudget
);

const internalDepsWithProfileResolver = {
  registry,
  runtime: runtimePorts,
  profileResolver
};
createSandboxSecurityP6LiveCaptureEngine(
  // @ts-expect-error internal P6 Engine owns its fixed profile resolver
  internalDepsWithProfileResolver
);

const badNormalWorkBudgetProfile: SandboxSecurityPolicyProfileManifest = {
  ...profile,
  // @ts-expect-error core policy manifests retain the GENERAL-001 budget
  normal_work_budget_ms: 40000
};

// prove approved evaluation request is not the internal branded type:
// do NOT import NormalizedSandboxSecurityEvaluationRequest from public index
// repository scan (runtime test) asserts that symbol is absent from exports
void evaluationRequest;
void badEval;
void badJudge;
void badSubject;
void badCandidate;
void badExternal;
void badNormalWorkBudgetProfile;
void masterDExports;
