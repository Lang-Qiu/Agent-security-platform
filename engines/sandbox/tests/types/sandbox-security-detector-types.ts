// temporary deep imports until P5-T4 closes security/index.ts to Master C/D
import type {
  RawLocalDetector,
  SanitizedExternalDetector,
  SandboxSecurityRawDetectorSnapshot,
  SandboxSecurityRiskCandidate,
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityExternalCandidateSubjectRef
} from "../../src/security/detector-contract.ts";

import type {
  SandboxSecurityEvaluationRequest
} from "../../src/security/source-authority.ts";

import type {
  SandboxSecurityFindingSubjectRef,
  SandboxSecurityRequest
} from "../../../../shared/types/sandbox-security.ts";

declare const publicRequest: SandboxSecurityRequest;
declare const snapshot: SandboxSecurityRawDetectorSnapshot;
declare const judge: SanitizedExternalDetector;
declare const raw: RawLocalDetector;
declare const evaluationRequest: SandboxSecurityEvaluationRequest;
declare const publicSubject: SandboxSecurityFindingSubjectRef;
declare const privateSubject: SandboxSecurityCandidateSubjectRef;

// @ts-expect-error ordinary public request is not complete evaluation request
const badEval: SandboxSecurityEvaluationRequest = publicRequest;

// @ts-expect-error external Judge only accepts sanitized payload
judge.detect(snapshot, new AbortController().signal);

// @ts-expect-error raw detector not assignable to SanitizedExternalDetector
const badJudge: SanitizedExternalDetector = raw;

// @ts-expect-error public subject is not private candidate subject
const badSubject: SandboxSecurityCandidateSubjectRef = publicSubject;

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

void evaluationRequest;
void badEval;
void badJudge;
void badSubject;
void badCandidate;
void badExternal;
