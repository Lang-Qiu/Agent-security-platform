import type {
  SandboxSecurityDecision,
  SandboxSecurityFinding,
  SandboxSecurityReasonCode,
  SandboxSecurityRequest
} from "../../types/sandbox-security.ts";

declare const request: SandboxSecurityRequest;
declare const finding: SandboxSecurityFinding;
declare const decision: SandboxSecurityDecision;
declare const reason: SandboxSecurityReasonCode;

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
