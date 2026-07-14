import type {
  SandboxDetectorRun,
  SandboxDetectorRunErrorCode,
  SandboxDetectorRunObligation,
  SandboxDetectorRunStatus,
  SandboxDetectorSkipReason,
  SandboxSecurityAction,
  SandboxSecurityClaimedSourceType,
  SandboxSecurityContentLocator,
  SandboxSecurityDecision,
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef,
  SandboxSecurityJsonValue,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityReasonCode,
  SandboxSecurityRequest,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolLocator,
  SandboxSecurityToolRequest,
  SandboxSecurityVerdict
} from "../../index.ts";

// @ts-expect-error normalized evaluation requests are engine-private
import type { NormalizedSandboxSecurityEvaluationRequest } from "../../index.ts";
// @ts-expect-error prepared inputs are engine-private
import type { SandboxSecurityPreparedInput } from "../../index.ts";
// @ts-expect-error evidence ledgers are engine-private
import type { SandboxSecurityEvaluationEvidenceLedger } from "../../index.ts";
// @ts-expect-error evaluation request normalization is engine-private
import { normalizeSandboxSecurityEvaluationRequest } from "../../index.ts";

type PublicSandboxSecurityTypes = readonly [
  SandboxSecurityStage,
  SandboxSecurityClaimedSourceType,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity,
  SandboxSecurityVerdict,
  SandboxSecurityAction,
  SandboxSecurityReasonCode,
  SandboxSecurityJsonValue,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest,
  SandboxSecurityRequest,
  SandboxSecurityContentLocator,
  SandboxSecurityToolLocator,
  SandboxSecurityFindingSubjectRef,
  SandboxSecurityFinding,
  SandboxDetectorRunObligation,
  SandboxDetectorRunStatus,
  SandboxDetectorSkipReason,
  SandboxDetectorRunErrorCode,
  SandboxDetectorRun,
  SandboxSecurityDecision
];

declare const request: SandboxSecurityRequest;
declare const finding: SandboxSecurityFinding;
declare const decision: SandboxSecurityDecision;
declare const reason: SandboxSecurityReasonCode;
declare const publicTypes: PublicSandboxSecurityTypes;

// @ts-expect-error public request exposes no authority brand
request.__authorityBrand;
// @ts-expect-error finding cannot declare raw content
finding.raw_content;
// @ts-expect-error decision cannot declare ordinary content hash
decision.content_hash;
// @ts-expect-error decision cannot declare provenance
decision.provenance_ref;

const findingReason: SandboxSecurityReasonCode = finding.reason_code;
void reason;
void findingReason;
void publicTypes;
