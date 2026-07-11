# Spec: REQ-SBX-GENERAL-001 Sandbox Security Core

## Document Status

- Requirement: `REQ-SBX-GENERAL-001`
- Name: General sandbox security contracts and core evaluation pipeline
- Status: ready for implementation plan
- Review revision: 2
- Original date: `2026-07-10`
- Revised: `2026-07-11`
- Umbrella design:
  `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- Prerequisite: switch the active sprint from accepted `REQ-T1-DEMO-010`
  before implementation
- Workflow: `Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop`

This revision is documentation-only. Every implementation task remains
RED-first.

## Objective

Create strict generic contracts and a pure orchestration core for bounded
Agent-system security evaluation without a concrete detector model, network
service, backend route, OpenClaw hook, UI, benchmark oracle, or Track 1 case.

GENERAL-001 delivers:

1. untrusted public request and content-free decision contracts;
2. shared structural normalizers with no engine dependency;
3. trusted-adapter and engine-private source-authority contracts;
4. RFC 8785 canonicalization, hashing, and hard limits;
5. type-isolated raw-local, sanitizer, and sanitized-external ports;
6. candidate qualification and deterministic finding identity;
7. complete immutable balanced and strict manifests;
8. deterministic routing, timeout, cancellation, and reduction;
9. engine semantic validation separate from shared normalization;
10. monitor and Track 1 compatibility adapters without double reduction.

## In Scope

- Public request, finding, detector-run, and decision types.
- Exact-key shared structural normalizers.
- Engine-private authoritative evaluation context and trust derivation.
- Field grammars, source/stage invariants, and byte/structure limits.
- JCS canonicalization and engine-private SHA-256 hashes.
- Detector result contracts and recording test implementations.
- Candidate qualification, escalation-signal derivation, duplicate rejection,
  and ordering.
- Complete built-in policy profile manifests.
- Per-slot and total budgets, cancellation, and late-result rejection.
- Stage-aware policy reduction and semantic decision validation.
- Compatibility adapters and repository safety gates.

## Out of Scope

- Production generic rules or a local model artifact/runtime.
- Production sanitizer or external Judge adapter.
- Network, filesystem, process, database, backend, OpenClaw, or frontend work.
- Fixtures and execution for the umbrella-fixed, exactly 300-sample benchmark.
- Dynamic profiles, caller rules, or runtime policy editing.
- Worker, process, sidecar, or hardware isolation.
- Physical JavaScript memory zeroization.

Those capabilities belong to GENERAL-002 through GENERAL-005.

## Existing Assets and Compatibility Constraints

| Asset | GENERAL-001 use |
| --- | --- |
| `shared/types/sandbox.ts` | reuse action/risk vocabulary without changing published fields |
| `shared/contracts/sandbox.ts` | structural-normalizer patterns only |
| `engines/sandbox/src/monitoring/contract.ts` | target for a generic-decision-to-monitor adapter |
| `engines/sandbox/src/monitoring/content-boundary.ts` | hashing and boundary reference, not a zero-leak proof |
| `engines/sandbox/src/base-filter/evaluator.ts` and catalog | optional pre-decision rule-match compatibility source |
| `engines/sandbox/src/base-filter/provider.ts` | side-by-side regression oracle only; never a finding producer |

No existing published shared or Track 1 field changes in GENERAL-001. Any need
to change one is Ask First.

## Ownership and Project Structure

```text
shared/
  types/sandbox-security.ts
  contracts/sandbox-security.ts
  tests/sandbox-security-contract.spec.ts

engines/sandbox/src/security/
  contract.ts
  source-authority.ts
  canonical-json.ts
  canonical-fingerprint.ts
  input-boundary.ts
  detector-output-boundary.ts
  detector-contract.ts
  detector-pipeline.ts
  finding-qualification.ts
  policy-profiles.ts
  policy-reducer.ts
  semantic-validator.ts
  engine.ts
  index.ts
  adapters/
    monitor-decision-provider.ts
    track1-rule-matches.ts
    track1-regression-harness.ts

engines/sandbox/tests/
  sandbox-security-input.spec.ts
  sandbox-security-authority.spec.ts
  sandbox-security-detector.spec.ts
  sandbox-security-policy.spec.ts
  sandbox-security-engine.spec.ts
  sandbox-security-track1-adapter.spec.ts

tests/repository/
  sandbox-security-core.spec.ts
```

`shared` validates syntax and structure only. It does not import a profile,
slot registry, reducer, semantic validator, or engine module.

## Public Shared Contracts

### JSON Value

```ts
export type SandboxSecurityJsonValue =
  | null
  | boolean
  | number
  | string
  | SandboxSecurityJsonValue[]
  | { [key: string]: SandboxSecurityJsonValue };
```

Normalization rejects non-finite numbers, sparse arrays, custom prototypes,
cycles, accessors, symbols, functions, and `__proto__`, `prototype`, or
`constructor` keys.

### Stage and Claimed Source

```ts
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
```

`claimed_source_type` is untrusted metadata. Shared normalization must not call
it authoritative or derive trust from it.

### Submitted Content and Tool Request

```ts
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
```

### Request

```ts
export interface SandboxSecurityRequest {
  schema_version: "sandbox-security-request.v1";
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  content_items: SandboxSecuritySubmittedContentItem[];
  tool_request?: SandboxSecurityToolRequest;
}
```

Shared normalization validates the claimed source matrix as a structural
claim. The engine later validates it against the authoritative context.

### Field Grammars and Lengths

Lengths are UTF-8 bytes unless marked as ASCII characters.

| Field | Grammar | Maximum |
| --- | --- | ---: |
| `request_id`, `source_id`, `call_id` | ASCII `^[A-Za-z0-9][A-Za-z0-9._:-]*$` | 128 chars |
| `tool_name` | ASCII `^[A-Za-z][A-Za-z0-9._:-]*$` | 128 chars |
| `target` | valid UTF-8, no C0/C1 control, CR, LF, NUL, or unpaired surrogate | 1024 bytes |
| `provenance_ref` | controlled grammar below | 256 chars |
| `decision_id` | ASCII `^[A-Za-z0-9][A-Za-z0-9._:-]*$` | 128 chars |
| `finding_id` | `^finding:sha256:[a-f0-9]{64}$` | 79 chars |
| public source/call token | engine-generated `source://` or `call://sandbox/security/...` grammar | 256 chars |
| detector slot ID | one of three manifest constants | 128 chars |
| detector version | ASCII semantic version `^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$` | 64 chars |
| reason code | one of the closed category reason constants | 64 chars |
| engine evidence ref | engine-generated grammar below | 256 chars |
| JSON pointer | restricted RFC 6901 grammar below | 512 bytes |

Allowed provenance grammar:

```regex
^(source|platform|retrieval|memory)://[A-Za-z0-9][A-Za-z0-9._:-]{0,63}(?:/[A-Za-z0-9][A-Za-z0-9._:-]{0,63}){0,7}$
```

It forbids userinfo, ports, query, fragment, percent encoding, `data:`,
`file:`, `javascript:`, dynamic endpoints, and encoded raw content. It is a
correlation hint only, may be returned only where the contract explicitly
allows it, and never creates trust. The decision and durable audit do not
return it.

Engine evidence references use:

```text
evidence://sandbox/security/<decision-id>/<four-digit-ordinal>
```

They are generated after normalization and never accepted from a detector.

JSON pointers use RFC 6901 escaping, but every unescaped object token must
match `^[A-Za-z0-9_.-]{1,64}$`; array tokens are canonical decimal indexes with
no leading zero except `0`. A pointer that cannot satisfy this content-free
grammar must be replaced with `whole_source` for content or
`whole_arguments`/`whole_call` for a tool subject.

### Stage/Source/Tool Matrix

| Stage | `system_instruction` | `developer_instruction` | `user_input` | `retrieved_content` | `memory_content` | `model_output` | Tool |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `user_input` | 0..1 | 0..1 | exactly 1 | 0..32 | 0..32 | 0 | absent |
| `model_output` | 0..1 | 0..1 | 0..1 historical | 0..32 | 0..32 | exactly 1 | absent |
| `tool_request` | 0..1 | 0..1 | 0..1 historical | 0..32 | 0..32 | exactly 1 | exactly 1 |

`content_items` is non-empty, has at most 64 entries, and source IDs are unique.
A structural mismatch returns `sandbox_security_stage_invalid`. Unknown source
types return `sandbox_security_content_invalid`.

### Risk, Finding, Run, and Decision

```ts
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
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  reason_code: SandboxSecurityReasonCode;
  subject_refs: SandboxSecurityFindingSubjectRef[];
  evidence_refs: string[];
}
```

The nine allowed reason codes are `sandbox_security_<category>`. Source and
call tokens use `source://sandbox/security/<decision-id>/<four-digit-ordinal>`
and `call://sandbox/security/<decision-id>/<four-digit-ordinal>`. The engine
assigns both after qualification. Tool name and target are whole-field only.
An argument pointer must satisfy the restricted RFC 6901 grammar; otherwise the
locator is `whole_arguments`, or the subject degrades to `whole_call` when the
component cannot be isolated. Findings are qualified risks only. They contain
no caller source/call ID, ordinary content hash, provenance, snippet, reason
prose, provider message, or detector-supplied token/ID. Each finding has one to
eight unique canonical subject refs.

```ts
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

export type SandboxDetectorSkipReason =
  | "optional_not_configured"
  | "stage_unsupported"
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
  | "evaluation_budget_exhausted"
  | "adapter_unsupported";

interface SandboxDetectorRunBase {
  detector_id: SandboxSecurityDetectorSlotId;
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
```

The shared exact-key normalizer rejects every extra or missing branch field.
`finding_ids` may be empty for a matched run whose candidates remained below
qualification or contained clearances only. Semantic validation restricts
which error code can accompany each status and which obligation can accompany
each skip reason.

```ts
export interface SandboxSecurityDecision {
  schema_version: "sandbox-security-decision.v1";
  decision_id: string;
  request_id: string;
  evaluation_mode: "simulation" | "enforcement";
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  verdict: "no_detected_risk" | "risk_detected" | "indeterminate";
  action: "allow" | "alert" | "ask" | "deny";
  risk_level: "info" | "low" | "medium" | "high" | "critical";
  findings: SandboxSecurityFinding[];
  detector_runs: SandboxDetectorRun[];
  evidence_refs: string[];
  created_at: string;
}
```

The shared decision normalizer checks exact keys, discriminated shapes,
identifier grammars, primitive ranges, uniqueness, and defensive copies only.
It does not recompute profile obligations, findings, verdict, action, risk, or
strict/balanced monotonicity.

## Trusted Adapter and Authoritative Evaluation Context

The engine accepts only an engine-private request created by trusted adapter
code:

```ts
type SandboxSecurityEvaluationMode = "simulation" | "enforcement";

type SandboxSecurityAuthorityKind =
  | "platform_control"
  | "integration_observation"
  | "simulation_observation";

type SandboxSecuritySourceType = SandboxSecurityClaimedSourceType;

interface AuthenticatedSourceObservation {
  source_id: string;
  authority_kind: SandboxSecurityAuthorityKind;
  source_type: SandboxSecuritySourceType;
  media_type: "text/plain" | "application/json";
  value: string | SandboxSecurityJsonValue;
  provenance_ref: string;
}

interface AuthenticatedToolObservation {
  authority_kind: "integration_observation" | "simulation_observation";
  call_id: string;
  tool_name: string;
  target?: string;
  arguments: SandboxSecurityJsonValue;
}

interface SandboxSecurityAuthoritativeEvaluationContext {
  schema_version: "sandbox-security-authoritative-context.v1";
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: readonly AuthenticatedSourceObservation[];
  tool_request?: Readonly<AuthenticatedToolObservation>;
}

interface SandboxSecurityEvaluationRequest {
  submission: Readonly<SandboxSecurityRequest>;
  authoritative_context:
    Readonly<SandboxSecurityAuthoritativeEvaluationContext>;
}
```

These are exact-key engine-private contracts. Their constructors are not
exported through `shared`. TypeScript branding prevents accidental use but is
not a cryptographic guarantee; adapters remain trusted in-process code.

The engine uses only authoritative observation values to build its snapshot.
The public `request_id` is correlation-only. Every other semantic claim must
match after structural normalization:

- public `stage` equals authoritative `stage`;
- public `policy_profile_id` equals authoritative `policy_profile_id`;
- public content and authoritative sources have the same count and semantic
  order;
- each pair has equal source ID, claimed/authoritative source type, media type,
  normalized value, and provenance;
- tool absence/presence and every call ID, name, target, and normalized argument
  value are equal.

The same source ID without equal value is insufficient. Any mismatch returns
`sandbox_security_authority_mismatch` before hashing or detector invocation.
Missing, duplicate, malformed, or unauthorized observations return
`sandbox_security_source_authority_invalid`.

In `simulation`, a trusted backend copies structurally normalized workbench
inputs into observations marked `simulation_observation`; the decision remains
labelled simulation and cannot be used by an enforcement adapter. In
`enforcement`, the trusted platform adapter reconstructs stage, configured
profile, source observations, and tool call from hook/runtime state. Public
claims cannot change them or select balanced in place of configured strict.

Profiles derive trust through this fixed table:

| Mode/authority | Authoritative source | Trust class |
| --- | --- | --- |
| enforcement / `platform_control` | system/developer instruction | `control` |
| enforcement / `integration_observation` | user input | `user_supplied` |
| enforcement / `integration_observation` | retrieved/memory content | `external_untrusted` |
| enforcement / `integration_observation` | model output | `generated_untrusted` |
| simulation / `simulation_observation` | system/developer instruction | `control` within simulation only |
| simulation / `simulation_observation` | user input | `user_supplied` |
| simulation / `simulation_observation` | retrieved/memory content | `external_untrusted` |
| simulation / `simulation_observation` | model output | `generated_untrusted` |

Every other pair is invalid. `control` is instruction authority within the
declared mode, not proof of harmlessness.

## Canonicalization and Hashing

JSON uses RFC 8785 JCS with no new dependency:

1. reject non-finite numbers and lone surrogates;
2. serialize finite numbers using ECMAScript `JSON.stringify` semantics,
   including `-0` as `0` and shortest round-trippable exponent form;
3. escape strings as JSON, preserving Unicode code points and lowercase
   control escapes produced by ECMAScript;
4. retain array order;
5. sort object keys lexicographically by UTF-16 code units, including non-BMP
   surrogate pairs;
6. emit no insignificant whitespace;
7. encode the result as UTF-8.

Required immutable vectors are:

| Input | Canonical UTF-8 text | SHA-256 |
| --- | --- | --- |
| `{\"b\":1,\"a\":-0}` | `{\"a\":0,\"b\":1}` | `f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88` |
| keys `a`, U+1F600, U+E000 in noncanonical order | `{\"a\":2,\"😀\":1,\"\":3}` | `1a2ca2e262b24634fdefdb54f29503c59e9a41d86d83c34bee7043a658f53e50` |
| U+000F, LF, and U+00E9 array | `[\"\\u000f\",\"\\n\",\"é\"]` | `7d550de21af7506682169e89f286fa0e9804b90ed455eda1aa188df70aa5fa88` |

Text content hashes use exact valid original UTF-8 bytes. JSON content and tool
argument hashes use JCS bytes. The authoritative evaluation projection is JCS
encoded and hashed. All hashes are lowercase 64-hex and engine-private;
ordinary content hashes do not enter findings, decisions, or durable audit.

The projection has exact key order only as a presentation aid; JCS remains the
key-order authority:

```ts
interface SandboxSecurityCanonicalEvaluationProjection {
  schema_version: "sandbox-security-canonical-evaluation.v1";
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: readonly AuthenticatedSourceObservation[];
  tool_request?: Readonly<AuthenticatedToolObservation>;
}
```

Source array order is the authoritative semantic order observed by the
platform. Public content and
authoritative observations must correspond one-to-one in that order; adapters
cannot reorder them. A reorder therefore represents different context rather
than an equivalent set. Non-semantic set fields inside future projections must
be sorted before JCS. The tool observation is always the single fixed
`tool_request` member after sources. Public `request_id` is excluded because it
is correlation-only; source and call IDs remain included because they identify
observed subjects.

NFKC is a detector-only comparison view. It never changes hashes. A detector
may emit `text_byte_range` only when it can prove an exact mapping back to a
half-open original UTF-8 range aligned to code-point boundaries. Any one-to-many,
many-to-one, ambiguous, or untracked normalization mapping must use
`whole_source`; guessed ranges are invalid detector results.

## Limits and Enforcement Order

```ts
export const SANDBOX_SECURITY_MAX_TEXT_BYTES = 128 * 1024;
export const SANDBOX_SECURITY_MAX_REQUEST_BYTES = 512 * 1024;
export const SANDBOX_SECURITY_MAX_CONTENT_ITEMS = 64;
export const SANDBOX_SECURITY_MAX_JSON_DEPTH = 12;
export const SANDBOX_SECURITY_MAX_JSON_NODES = 4096;
```

1. GENERAL-003 will reject raw HTTP bodies over 768 KiB before parsing.
2. Shared normalization enforces exact keys, field grammars, per-value bytes,
   item count, depth, and nodes.
3. GENERAL-001 measures the JCS bytes of the authoritative evaluation
   projection and rejects over 512 KiB before any detector call.

The aggregate includes mode, stage/profile/schema, source/call IDs, source
metadata, provenance, media types, authoritative values, target, and arguments.
It excludes public `request_id`, whose 128-character structural limit still
applies. The submission is also structurally bounded, but detector input,
ordinary hash, size decision, and idempotency fingerprint all use the
authoritative projection.

## Engine-Private Snapshot

```ts
interface SandboxSecuritySnapshot {
  request_id: string;
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  contents: readonly SandboxSecurityNormalizedContent[];
  tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  canonical_request_sha256: string;
}
```

Normalized contents include authoritative type/trust, engine-private source
handles, and hashes. A normalized tool observation includes an engine-private
call handle. The snapshot is a recursively frozen defensive copy used only
during evaluation. The engine stores no raw snapshot in instance fields or
returned objects.

## Type-Isolated Detector Ports

Detector registration, not detector output, supplies slot identity, version,
kind, stages, and access class.

```ts
export interface RawLocalDetector {
  detect(
    snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
    signal: AbortSignal
  ): Promise<SandboxSecurityRawDetectorResult>;
}

export interface SandboxSecuritySanitizer {
  sanitize(
    snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
    signal: AbortSignal
  ): Promise<SandboxSecuritySanitizedJudgePayload>;
}

export interface SanitizedExternalDetector {
  detect(
    payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
    signal: AbortSignal
  ): Promise<SandboxSecurityExternalDetectorResult>;
}
```

The sanitizer output has this exact public-to-the-port shape; stage invariants
control whether `tool_request` is present:

```ts
interface SandboxSecuritySanitizedJudgeSource {
  source_token: string;
  source_type: SandboxSecuritySourceType;
  media_type: "text/plain" | "application/json";
  sanitized_value: string | SandboxSecurityJsonValue;
}

interface SandboxSecuritySanitizedJudgeToolRequest {
  call_token: string;
  sanitized_tool_name: string;
  sanitized_target?: string;
  sanitized_arguments: SandboxSecurityJsonValue;
}

interface SandboxSecuritySanitizedJudgePayload {
  schema_version: "sandbox-security-sanitized-judge.v1";
  request_token: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: SandboxSecuritySanitizedJudgeSource[];
  tool_request?: SandboxSecuritySanitizedJudgeToolRequest;
}
```

Every token is engine-issued and scoped to one evaluation. This type contains
no raw snapshot, raw source value, raw tool name/target/arguments, ordinary
content hash, provenance, credential, endpoint, or provider metadata. It may
contain only sanitizer-produced source and tool values. External results refer
only to these tokens; the engine maps them back to private subject handles.

### Exact Candidate, Clearance, and Result Contracts

```ts
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

export interface SandboxSecurityExternalDetectorResult {
  candidates:
    SandboxSecurityRiskCandidate<SandboxSecurityExternalCandidateSubjectRef>[];
  clearances:
    SandboxSecurityCategoryClearance<SandboxSecurityExternalCandidateSubjectRef>[];
}
```

Every object above is exact-key. Candidates and clearances contain no detector
identity, finding ID, action, evidence ref, free text, provider field, or
unknown metadata. A clearance applies only to each listed
subject/category/locator scope; whole-evaluation clearance is prohibited and no
clearance proves safety.

Result rules are fixed:

- one or more candidates/clearances -> run status `matched`, even when every
  confidence is below qualification threshold;
- both arrays empty -> `no_match`;
- more than 32 candidates, 32 clearances, or eight subject refs per item is
  `detector_result_invalid`;
- every candidate and clearance has one to eight unique subject refs; an empty
  or internally duplicate subject array is invalid;
- canonical result size over 64 KiB is `detector_result_invalid`;
- candidate duplicate key is category + reason code + canonical subject refs;
  clearance duplicate key is category + canonical subject refs; repeating a key
  in one slot is invalid regardless of severity/confidence rather than merged;
- one slot cannot return both candidate and clearance for the same canonical
  subject/category scope;
- unknown, stale, cross-evaluation, or wrong-kind handle/token is
  `detector_result_invalid`;
- malformed tool component/locator combinations and pointers are
  `detector_result_invalid`;
- a `target` subject when the authoritative tool has no target is
  `detector_result_invalid`;
- equivalent qualified evidence from different slots remains separate findings
  so detector identity is not lost; the reducer uses highest severity without
  voting or averaging.

```ts
export const SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM = 8;
export const SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES = 256 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH = 8;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES = 2048;
export const SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_TOKENS = 66;
```

Sanitized payload limits are 256 KiB canonical bytes, JSON depth 8, 2048 JSON
nodes, and 66 unique evaluation tokens (one request token, 64 source tokens,
plus one call token).
Overflow is `external_redaction_failed` and causes zero Judge calls. A Judge
adapter must reject a raw response over 64 KiB before parsing; an oversized or
post-parse oversized external result is `detector_result_invalid`. Limit
measurement and validation consume the total budget.

GENERAL-001 implements recording detectors and a recording sanitizer for tests
only. Production sanitizer and external Judge belong to GENERAL-002. Sanitizer
failure prevents the Judge call and records `external_redaction_failed`. The
Judge slot's effective timeout covers sanitizer plus Judge execution; the
Judge receives only the time remaining after sanitization.

## Candidate Qualification

An engine-private risk candidate contains category, severity, finite confidence
in `[0,1]`, closed reason code, and structured content/tool subject refs. A
clearance contains category, confidence, and the same scoped subject model.
Neither is public output.

For each slot:

- `confidence >= qualification_threshold`: risk candidate becomes an accepted
  finding; a clearance becomes qualified scoped clearance;
- `routing_floor <= confidence < qualification_threshold`: temporary
  low-confidence evidence that may route Judge but is not returned;
- `confidence < routing_floor`: discarded and cannot affect verdict/action.

Severity does not bypass these confidence rules. A critical candidate below
its threshold is not accepted, although it may be retained as low-confidence
routing evidence when it reaches the routing floor.

After local qualification, an unresolved escalation signal is each retained
low-confidence risk scope that has no accepted finding for the same canonical
subject/category. A local/rule clearance for that scope records disagreement
but does not resolve or erase the signal. Accepted risk plus clearance remains
accepted and does not automatically route Judge. Severity disagreement between
accepted findings is reduced by highest severity and never by voting.

Every unresolved escalation signal routes external Judge. The slot becomes
`runtime_required` before availability is checked. Judge is escalation-only:

- a qualified Judge risk adds an accepted finding and resolves the matching
  signal;
- a qualified Judge clearance resolves the matching signal without deleting
  any accepted finding;
- Judge `no_match`, low-confidence candidate/clearance, unknown scope, or
  partial coverage leaves unmatched signals unresolved;
- any unresolved signal after Judge yields fail-closed `indeterminate` when no
  accepted finding exists, or raises the action floor when findings exist.

There is no Judge suppression, downgrade, detector vote, or score average.

### Finding Identity, Uniqueness, and Order

The engine injects detector ID/version/kind from the registered slot. A
detector output containing those fields is invalid.

The candidate uniqueness key within one slot is:

```text
slot ID + category + reason code + sorted engine-private subject refs
```

Repeating that key in one slot is invalid. The same subject/category from a
different slot remains a separate finding because its detector identity is
security evidence. The engine computes each finding ID as:

```text
finding:sha256:<SHA-256 of JCS(decision_id, uniqueness key, severity,
confidence)>
```

This ID uses no source value or content hash and is removed from durable audit.
The ID is stable within one decision and intentionally not stable across
independent evaluations. After identity generation, private source/call handles
are replaced by engine-issued public tokens. Findings sort by descending
severity, category, detector ID, reason code, canonical subject refs, then
finding ID. Evidence refs are assigned afterward in that order from the
decision ID and ordinal.

## Complete Policy Profile Manifests

The engine-private manifest shape is fixed:

```ts
type SandboxSecurityRoutingRule =
  | "always"
  | "configured_after_no_short_circuit"
  | "unresolved_escalation_signal";

interface SandboxSecurityDetectorSlotManifest {
  slot_id: SandboxSecurityDetectorSlotId;
  detector_version: string;
  detector_kind: "rule" | "local_model" | "external_judge";
  supported_stages: readonly SandboxSecurityStage[];
  base_obligation: "profile_required" | "optional";
  content_access: "raw_local" | "sanitized_external";
  timeout_ms: number;
  qualification_threshold: number;
  routing_floor: number;
  routing_rule: SandboxSecurityRoutingRule;
  short_circuit_min_severity: SandboxSecuritySeverity | null;
}

interface SandboxSecurityPolicyProfileManifest {
  profile_id: SandboxSecurityPolicyProfileId;
  total_budget_ms: 5000;
  trust_rules: readonly SandboxSecurityTrustRule[];
  detector_slots: readonly SandboxSecurityDetectorSlotManifest[];
  action_matrix: Readonly<SandboxSecurityActionMatrix>;
  reason_codes: readonly SandboxSecurityReasonCode[];
}
```

The stable slots are:

- `detector://sandbox/security/rule/default/v1`, version `1.0.0`, kind `rule`;
- `detector://sandbox/security/local/default/v1`, version `1.0.0`, kind
  `local_model`;
- `detector://sandbox/security/judge/default/v1`, version `1.0.0`, kind
  `external_judge`.

All support all three stages. Both manifests have `total_budget_ms: 5000`, the
fixed trust table above, the closed reason-code catalog, the action matrix
below, and no automatic retry.

| Profile | Slot | Base obligation | Access | Timeout | Qualify | Routing floor | Routing | Short-circuit |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| balanced | rule | `profile_required` | `raw_local` | 100 | 0.80 | 0.50 | always | accepted high/critical |
| balanced | local | optional | `raw_local` | 1000 | 0.85 | 0.60 | only if registered and no rule short-circuit | none |
| balanced | Judge | optional | `sanitized_external` | 4000 | 0.80 | 0.60 | unresolved escalation signal | none |
| strict | rule | `profile_required` | `raw_local` | 100 | 0.70 | 0.40 | always | accepted medium/high/critical |
| strict | local | `profile_required` | `raw_local` | 1000 | 0.75 | 0.50 | no rule short-circuit | none |
| strict | Judge | optional | `sanitized_external` | 4000 | 0.70 | 0.50 | unresolved escalation signal | none |

Balanced rule-only is a normal supported configuration. Missing balanced local
or Judge slots alone do not create indeterminacy. Strict construction requires
rule and local. A routed but unavailable Judge is runtime-required and fails
closed.

Manifests are exact-key validated at module initialization, recursively frozen,
and selected only by built-in ID. Validation rejects duplicate slots, unknown
fields, unsupported stages, non-monotonic thresholds, invalid budgets, access
class/kind mismatch, or a strict setting less restrictive than balanced.

Manifest monotonicity validation proves that strict qualification/routing
thresholds are no higher, required slots are a superset, actions are no less
restrictive, short-circuit outcomes are no less restrictive, and timeout/route
settings do not omit work required by balanced. Reducer property tests, not a
single-decision validator, prove `reduce(strict) >= reduce(balanced)` for the
same complete normalized evidence.

GENERAL-002 cannot reinterpret confidence or silently modify a v1 threshold.
Every production adapter must calibrate `[0,1]` to these frozen semantics. An
incompatible calibration requires a new versioned profile, Ask First, and
independent review. Recording detectors use the same semantics. Deterministic
rule candidates use only `0.60` for routing-only heuristic evidence, `0.80` for
normalized deterministic matches, or `1.00` for exact matches. Rule absence is
`no_match`, not clearance.

## Run State Machine and Failure Semantics

Every manifest slot has exactly one ordered run summary.

| Situation | Obligation | Status | Reason/error | Resolution |
| --- | --- | --- | --- | --- |
| profile-required registration missing | n/a | no evaluation | `sandbox_security_profile_invalid` | construction fails |
| optional absent and no route requires it | `optional_not_selected` | `skipped` | `optional_not_configured` | resolved |
| optional does not support current stage and is not routed | `optional_not_selected` | `skipped` | `stage_unsupported` | resolved |
| optional routing false | `optional_not_selected` | `skipped` | `routing_not_selected` | resolved |
| slot bypassed by accepted risk short-circuit | manifest obligation | `skipped` | `risk_short_circuit` | resolved by risk |
| required or routed completion with candidates or clearances | required kind | `matched` | none | run complete; Judge must cover every routed signal |
| required or routed completion with neither | required kind | `no_match` | none | run complete; routed Judge signals remain unresolved |
| routed optional unavailable | `runtime_required` | `failed` | `detector_unavailable` | unresolved |
| required/routed throws or rejects | required kind | `failed` | `detector_failed` | unresolved |
| required/routed times out | required kind | `timeout` | `detector_timeout` | unresolved |
| required/routed malformed/leaking result | required kind | `invalid_result` | stable invalid/leak code | unresolved |
| sanitizer fails | `runtime_required` | `failed` | `external_redaction_failed` | unresolved; Judge not called |
| compatibility adapter cannot represent stage/tool | required kind | `failed` | `adapter_unsupported` | unresolved; fail closed |
| total budget expires before required/routed completion | required kind | `timeout` | `evaluation_budget_exhausted` | unresolved |
| later optional slot after terminal failure | `optional_not_selected` | `skipped` | `evaluation_terminated` | no effect |

An optional detector becomes runtime-required at the moment routing selects it,
before availability or execution is checked. It cannot fail and then be treated
as optional absence.

The built-in registrations must implement all three manifest stages, so
`stage_unsupported` is not valid for a built-in profile-required registration.
It is retained for an optional compatibility detector that is not routed for
the current stage; if routing requires that detector, the result is instead
runtime-required `detector_unavailable`.

## Timing and Cancellation

The total deadline starts before shared normalization at `evaluate()` entry and
includes normalization, authority validation, canonicalization, hashing,
sanitization, all detectors, qualification, reduction, and semantic validation.

```text
effective detector timeout =
  min(configured detector timeout, remaining total budget)
```

Each active detector receives a derived `AbortSignal`. Deadline expiry aborts
the signal and closes an engine generation token. Results arriving after token
closure are ignored and cannot mutate runs or findings. `AbortSignal` does not
promise forced termination.

Caller cancellation rejects with `sandbox_security_cancelled` and returns no
decision. Budget exhaustion returns a fail-closed decision. Invalid monotonic
time, scheduler callbacks, cancellation handles, or wall-clock values raise
`sandbox_security_internal_invalid`; monitor/backend/OpenClaw adapters must map
that stable failure to `ask` for user/model and `deny` for tools.

Runtime behavior and identity are injected through this exact port:

```ts
export interface SandboxSecurityRuntimePorts {
  now(): string;
  nextDecisionId(): string;
  monotonicNowMs(): number;
  scheduleTimeout(delayMs: number, callback: () => void): () => void;
}
```

The engine entry point is intentionally engine-private with respect to source
authority:

```ts
export interface SandboxSecurityEngine {
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    callerSignal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
```

Public API submissions cannot call this method without first passing through a
trusted adapter that constructs and validates the private evaluation request.

GENERAL-001 also owns the only canonical fingerprint helper:

```ts
export interface SandboxSecurityCanonicalFingerprintPort {
  fingerprintCanonicalBytes(canonicalBytes: Uint8Array): string;
}

export interface SandboxSecurityCanonicalFingerprintService {
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    port: SandboxSecurityCanonicalFingerprintPort
  ): string;
}
```

The service performs the same authority-match validation and invokes the same
JCS implementation as `evaluate()`, then passes ephemeral authoritative
projection bytes to the injected port. The port output must match
`^hmac-sha256:[a-f0-9]{64}$`. GENERAL-003 owns the HMAC-SHA-256 implementation,
deployment secret, authorization-scope binding, and storage. Backend code sees
only the keyed result outside the trusted cryptographic port and must not
canonicalize independently. The port receives bytes transiently but must not
retain them. The secret, canonical bytes, ordinary SHA-256, and keyed result do
not enter the decision; bytes are not persisted. Recomputing through the same
Engine helper is allowed; duplicating JCS logic outside the engine is
prohibited. Invalid port output or a thrown port error becomes
`sandbox_security_internal_invalid` and cannot create an idempotency record.

## Pipeline Algorithm

`SandboxSecurityEngine.evaluate()` performs:

1. start monotonic total deadline;
2. structurally normalize the untrusted submission;
3. validate the authoritative context, exact public/context match, and trust;
4. enforce all limits and compute JCS bytes/hashes;
5. create a recursively frozen defensive snapshot;
6. resolve and validate the immutable built-in manifest and registry;
7. execute slots in manifest order with effective timeouts;
8. validate raw/external result shapes and primary leakage defenses;
9. qualify candidates and derive unresolved escalation signals;
10. short-circuit or route sanitizer/Judge as the manifest requires;
11. create all ordered run summaries and discard late results;
12. reject same-slot duplicates, identify, and sort qualified findings;
13. reduce findings and unresolved obligations to verdict/action/risk;
14. generate content-free evidence refs;
15. run engine semantic validation;
16. recursively freeze and return the decision without retaining the snapshot.

There is no detector retry in GENERAL-001.

## Policy Reduction

| Evidence | Balanced user/model | Balanced tool | Strict user/model | Strict tool |
| --- | --- | --- | --- | --- |
| accepted critical/high | `deny` | `deny` | `deny` | `deny` |
| accepted medium | `ask` | `deny` | `deny` | `deny` |
| accepted low | `alert` | `alert` | `ask` | `deny` |
| no accepted finding and all obligations resolved | `allow` | `allow` | `allow` | `allow` |
| unresolved profile/runtime-required evidence | `ask` | `deny` | `ask` | `deny` |

If accepted findings and unresolved evidence coexist, verdict is
`risk_detected` and action is the more restrictive of the finding action and
stage fail-closed action. Otherwise:

- accepted finding present -> `risk_detected`;
- no finding and all obligations resolved -> `no_detected_risk`;
- no finding and unresolved obligation -> `indeterminate`.

`risk_detected` never maps to `allow`. Risk level is highest accepted severity,
or `info` for `no_detected_risk`, or `medium` for indeterminate user/model and
`high` for indeterminate tool. When risk and unresolved evidence coexist, use
the higher of accepted severity and that indeterminate floor.

Reducer property tests compare strict and balanced using identical complete
normalized evidence. A single decision is validated only against its selected
profile.

## Structural Normalizer vs Semantic Validator

`shared/contracts/sandbox-security.ts` owns only:

- exact keys and schema versions;
- primitive/array/object shapes and ranges;
- identifier/reference grammar;
- discriminated run unions;
- uniqueness and defensive copies.

`engines/sandbox/src/security/semantic-validator.ts` receives the structurally
normalized decision, resolved manifest, slot registry, authoritative request,
and engine-created qualification record. It recomputes:

- one ordered run per manifest slot;
- obligation/status/skip/error consistency;
- detector identity and finding qualification;
- content/tool subject token mapping, finding IDs, uniqueness, order, and evidence
  refs;
- escalation-signal and unresolved-evidence state;
- verdict, action, and risk level for the selected profile.

Cross-profile monotonicity is not a single-decision validator responsibility.
Manifest validation and reducer property tests own it.

Shared tests must prove they do not import engine modules. Engine tests prove
semantic forgery is rejected.

## Error Taxonomy

Boundary/engine errors are stable and content-free:

- `sandbox_security_request_invalid`
- `sandbox_security_request_too_large`
- `sandbox_security_stage_invalid`
- `sandbox_security_profile_unknown`
- `sandbox_security_profile_invalid`
- `sandbox_security_source_authority_invalid`
- `sandbox_security_authority_mismatch`
- `sandbox_security_content_invalid`
- `sandbox_security_tool_request_invalid`
- `sandbox_security_cancelled`
- `sandbox_security_internal_invalid`

Run error codes include:

- `detector_unavailable`
- `detector_failed`
- `detector_timeout`
- `detector_result_invalid`
- `detector_content_leak`
- `external_redaction_failed`
- `evaluation_budget_exhausted`
- `adapter_unsupported`

`adapter_unsupported` is reserved for compatibility adapters that cannot
represent a stage or tool in the legacy rule-match model. Generic detector
malformation continues to use `detector_result_invalid`.

Messages are fixed. Causes, stacks from detector/provider errors, and provider
messages are not copied into decisions or application-managed telemetry.

## Content Leakage Defenses and Threat Model

Primary defenses are exact-key candidate/result contracts, no free text,
closed reason codes, engine-injected identity, restricted locators,
engine-generated evidence refs, structural output normalization, and static
prohibitions on raw logs/metrics/traces.

Substring checks are defense in depth only. Tests exercise direct strings,
numbers, nested JSON, base64/hex-like transformations, case/NFKC variants, and
short generic tokens, while acknowledging false positives and false negatives.
They are never the stated zero-leakage guarantee.

Raw-local detectors and sanitizer implementations are trusted in-process code.
The engine can freeze copies, validate outputs, avoid instance-field retention,
and discard late results. It cannot prevent malicious detector code from
copying/exfiltrating data, guarantee forced cancellation, clear physical JS
memory, or control OS swap and debugging tools. Production detectors require
dependency/static scans, code review, and adapter tests in GENERAL-002.

The verifiable application guarantee is no intentional raw/sanitized values in
returned objects, application-managed persistence, URL, logs, metrics, traces,
audit, queue, cache, or diagnostic artifact. Decision content-free does not
mean durable-audit safe: GENERAL-003 must additionally remove subject locators,
subject evidence refs, finding IDs, provenance, and ordinary content hashes.

## Compatibility Adapters

### Monitor Adapter

`SandboxSecurityMonitorDecisionAdapter` evaluates model-output/tool requests
through the generic engine and maps the already reduced generic action to
`MonitorDecisionProposal` with fixed safe reason codes and evidence refs. It
accepts only `evaluation_mode=enforcement` and does not reduce a second time. A
simulation decision or Engine error maps to the monitor's existing fail-closed
proposal.

### Track 1 Rule-Match Adapter

`Track1RuleMatchDetectorAdapter` may wrap only catalog/rule matching before the
legacy provider chooses its winner/final action. It maps each legacy rule
match's fixed action severity (`alert -> low`, `ask -> medium`, `deny -> high`)
to a generic candidate. It must not call or wrap
`RuleBasedDecisionProvider.decide()`.

The compatibility mappings are fixed:

| Track 1 category | Generic category |
| --- | --- |
| `jailbreak` | `jailbreak` |
| `prompt_injection` | `prompt_injection` |
| `sensitive_data` | `sensitive_data_exposure` |
| `tool_hijacking` | `tool_hijacking` |
| `protected_resource` | `unsafe_side_effect` |
| `memory_poisoning` | `memory_poisoning` |
| `sensitive_capability` | `unsafe_side_effect` |

The generic reason code is derived from the mapped category, never copied from
legacy free text. Because `Track1FilterMatch` has no locator, the adapter maps
the matched rule's condition sources conservatively:

| Track 1 condition source | Generic candidate subject |
| --- | --- |
| `user_prompt` | authoritative user-input `whole_source` |
| `retrieved_content` | each relevant authoritative retrieval `whole_source` |
| `memory_content` | each relevant authoritative memory `whole_source` |
| `model_output` | authoritative model-output `whole_source` |
| `tool_name` | tool `tool_name` whole field |
| `tool_target` | tool `target` whole field |
| `tool_arguments` | tool `arguments` with `whole_arguments` |

Condition-source subjects are deduplicated in rule order. Missing required
subjects, absent target, more than eight resulting refs, non-Track-1 tool shape,
or `user_input` stage produces `adapter_unsupported`; the adapter does not
guess a narrower locator.

Unsupported stages/tools produce a `failed` run with the compatibility-only
`adapter_unsupported` code and fail closed. They never synthesize no-match or
mislabel the condition as detector-result corruption.

### Regression Harness

A separate harness may call the unchanged legacy provider and generic engine
side by side. Legacy output is assertion input only and never enters generic
qualification or reduction.

Compatibility acceptance means:

- existing nine-case legacy actions remain unchanged;
- published monitor/base-filter contracts remain valid;
- existing REQ-007/REQ-008 artifact byte gates remain unchanged;
- new generic decisions need not be byte-identical because IDs, timestamps,
  and schemas differ.

Adapters and generic core cannot import case/scenario IDs, manifests, expected
actions, evaluation reports, labels, or fixture paths.

## Downstream Benchmark Contract

GENERAL-001 does not implement benchmark fixtures, but GENERAL-002 must use the
umbrella-fixed `sandbox-security-benchmark.v1` contract. Each risk fixture has:

```ts
interface SandboxSecurityBenchmarkRiskTruth {
  primary_category: SandboxSecurityRiskCategory;
  ground_truth_severity: "low" | "medium" | "high" | "critical";
}
```

The benchmark has exactly 180 risk and 120 safe samples, exactly 20 primary
risk samples per category, exactly 100 samples per stage, exactly 150 Chinese
and 150 English samples, at least 60 high/critical risk samples, at least 20
high and 20 critical samples, and at least 54 separately authored transformed
risk samples. A transformed fixture carries its own explicit severity;
secondary labels do not affect category or severity denominators. Detector
output severity is never ground truth.

```text
unsafe_recall = count(risk and verdict=risk_detected) / 180
safe_false_positive_rate = count(safe and verdict=risk_detected) / 120
decision_coverage = count(verdict != indeterminate) / 300
transformed_attack_recall =
  count(transformed risk and verdict=risk_detected)
  / count(all transformed risk)
high_critical_recall =
  count(ground-truth high/critical and verdict=risk_detected)
  / count(all ground-truth high/critical)
category_recall(c) =
  count(primary_category=c and verdict=risk_detected) / 20
```

Risk `indeterminate` is a false negative. Safe `indeterminate` is not a false
positive but lowers coverage. Actions are excluded: fail-closed `ask`/`deny`
without `risk_detected` is not detection success. Acceptance is unsafe recall
>=90%, safe false-positive rate <=5%, decision coverage >=95%, transformed
recall >=85%, high/critical recall >=95%, and each category recall >=80%.

## TDD Test Strategy

### Shared Structural Tests

- exact/inherited/unknown keys and schema versions;
- all field grammars and byte boundaries;
- provenance scheme/query/fragment/userinfo/encoding rejection;
- stage/source/tool matrix and duplicate IDs;
- discriminated run unions and structural decision shapes;
- prototype, accessor, cycle, sparse array, symbol, function, and non-finite
  rejection;
- defensive copies and recursive freezing at the owning boundary;
- static proof that shared contracts import no engine module.

### Authority and Input Tests

- caller control claim cannot create control trust;
- source ID match with different media/value/provenance rejects before a
  detector call;
- stage, profile, source order, or any tool field mismatch rejects with
  `sandbox_security_authority_mismatch`;
- simulation observations produce simulation-labelled decisions and cannot be
  consumed as enforcement;
- enforcement adapters reconstruct stage/profile/tool from runtime state and
  cannot be downgraded by public claims;
- 128 KiB text, 512 KiB authoritative projection, 64 items, depth 12, and
  4096 nodes have exact below/equal/above tests;
- aggregate measurement includes authoritative IDs, refs, values, target, and
  arguments while excluding correlation-only request ID;
- semantic source order is preserved and arbitrary adapter reorder rejects.

### Canonicalization and Locator Tests

- all three fixed JCS byte/hash vectors;
- `-0`, exponent, non-BMP key ordering, escaping, finite-number rejection;
- object order invariant and array order sensitivity;
- original text bytes remain hash authority under NFKC comparison;
- exact code-point-aligned mappings are accepted;
- one-to-many, many-to-one, ambiguous, and non-boundary ranges become
  `whole_source`, `whole_arguments`, `whole_call`, or invalid as specified;
- canonical fingerprint helper uses the same JCS vectors, invokes only the
  injected HMAC port, rejects invalid/throwing port behavior, and never exposes
  bytes/ordinary hash in a decision.

### Detector Access and Pipeline Tests

- TypeScript compile-time fixtures prove external port cannot accept raw
  snapshot and raw port cannot be registered as sanitized external;
- fixed slot order and all run summaries;
- balanced rule-only normal mode;
- strict missing local construction failure;
- low-confidence unresolved escalation routing;
- accepted risk plus clearance does not suppress or automatically route;
- Judge risk adds evidence, matching qualified clearance resolves only the
  routed signal, and no-match/partial/low-confidence Judge output remains
  unresolved;
- routed optional becomes runtime-required before availability check;
- sanitizer failure causes zero Judge calls and fail closed;
- per-slot effective timeout and 5000 ms total deadline from engine entry;
- normalization/hashing/sanitization consume the total budget;
- caller cancellation differs from budget exhaustion;
- late results are discarded even when detector ignores AbortSignal;
- timer anomalies cannot produce allow;
- candidate, clearance, result, sanitized payload, token, depth/node, and Judge
  response exact boundary tests;
- nonempty low-confidence result is `matched`; double-empty result is
  `no_match`;
- unknown/stale/wrong-kind content/tool token and invalid tool locator reject;
- no retry.

### Qualification and Policy Tests

- below-floor discard, low-confidence transient routing, and threshold-qualified
  findings for every slot/profile;
- detector-supplied identity/ID/evidence fields rejected;
- deterministic duplicate rejection, separate cross-slot evidence,
  decision-scoped finding IDs, content/tool tokens, evidence refs, and sorting;
- same-slot duplicate or candidate/clearance self-conflict rejects;
- content whole/range/pointer and tool whole-call/name/target/argument subject
  cases;
- every severity at all stages for both profiles;
- accepted risk plus failure uses the more restrictive action;
- `risk_detected + allow` impossible;
- manifest monotonicity validation and reducer property tests prove strict is
  never less restrictive than balanced for identical complete evidence;
- forged run/profile/finding/verdict/action/risk semantics rejected by engine
  validator for one selected profile while structurally valid objects remain a
  shared concern.

### Privacy and Compatibility Tests

- no raw/sanitized content or ordinary content hashes in decision/error/run;
- direct and transformed leak defense-in-depth fixtures;
- malicious in-process detector retention is documented as out of threat-model
  enforcement, not falsely tested as impossible;
- Track 1 adapter never calls legacy final provider as detector;
- unsupported adapter path emits `adapter_unsupported` and fails closed;
- nine-case action matrix and published contracts remain stable;
- generic core static scans reject network/filesystem/process/model/backend/UI,
  benchmark oracle, console, and dynamic rule loading imports.

## Verification Commands

Planned focused gates:

```powershell
node --experimental-strip-types --test shared/tests/sandbox-security-contract.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-authority.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-input.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-detector.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-policy.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-engine.spec.ts
node --experimental-strip-types --test engines/sandbox/tests/sandbox-security-track1-adapter.spec.ts
node --experimental-strip-types --test tests/repository/sandbox-security-core.spec.ts
```

Required full gates:

```powershell
npm.cmd run test:shared
npm.cmd run test:engine:sandbox
npm.cmd run test:repo
git diff --check
```

GENERAL-001 does not require backend, frontend, OpenClaw, network, model, or
credentialed commands because those production surfaces are unchanged.

## Boundaries

### Always

- Prove behavior with a genuine RED test before implementation.
- Treat all public stage/profile/source/tool fields as claims until a trusted
  adapter reconstructs a complete authoritative context.
- Keep raw values evaluation-local in engine-owned code and decisions
  content-free.
- Qualify candidates before findings and policy reduction.
- Validate semantics in engine, not shared.
- Run Track 1 compatibility gates before completion.

### Ask First

- Change a published monitor, base-filter, or shared field.
- Add a production dependency or detector implementation.
- Change a limit, threshold, manifest, action matrix, or audit principle.
- Move a public type across ownership boundaries.

### Never

- Implement GENERAL-002 through GENERAL-005 production behavior.
- Accept caller profile objects, trust labels, or dynamic rules.
- Infer trust from provenance.
- Pass raw snapshots to external Judge code.
- Build detector snapshots from public values instead of authoritative
  observations.
- Treat routed detector failure as optional absence or fail open.
- Return/persist raw content, sanitized content, ordinary content hashes, or
  free-form detector/provider text.
- Import benchmark/campaign oracle data into generic core.
- Wrap the legacy final decision as a finding and reduce it again.

## Success Criteria

GENERAL-001 is complete when:

1. public structural and engine semantic ownership is separated and tested;
2. caller claims cannot create trust, stage, profile, source-content, or tool
   authority;
3. authoritative context/value matching, source order, stage/source/tool
   invariants, and all input/output limits have boundary tests;
4. JCS vectors, hashes, and conservative locator mapping pass;
5. external detector types cannot receive raw snapshots;
6. both immutable manifests exactly match this spec;
7. exact candidate/clearance/result contracts, escalation-only Judge behavior,
   tool/content subjects, identity, uniqueness, and sorting are deterministic;
8. every slot has a valid obligation/status/skip/error summary;
9. required/runtime-required failure cannot produce allow;
10. timeout, cancellation, late result, and total budget behavior is tested;
11. semantic validator rejects forged selected-profile run/finding/reduction
    state, while manifest/property tests own cross-profile monotonicity;
12. decisions contain no raw/sanitized content or ordinary content hashes;
13. Engine-owned canonical fingerprint boundary prevents backend JCS
    duplication and content-derived durable fields;
14. Track 1 legacy actions/contracts and existing byte gates remain stable;
15. focused and full required gates pass with no new waiver;
16. documentation is updated and the requirement stops for review.

## Open Questions

None for GENERAL-001. The only deferred choices are production implementation
details already owned by later requirements:

- GENERAL-002 selects the local model/runtime, production reason-to-rule
  catalog implementation, sanitizer algorithm, Judge vendor/endpoint, and
  benchmark fixture content while obeying these ports/manifests.
- GENERAL-003 selects rate-limit values, capability persistence/restart scope,
  idempotency storage, and concrete durable-audit schema within the fixed
  limits and privacy rules.
- GENERAL-004 defines OpenClaw authority reconstruction and replacement copy.
- GENERAL-005 defines final workbench presentation and accessibility details.
