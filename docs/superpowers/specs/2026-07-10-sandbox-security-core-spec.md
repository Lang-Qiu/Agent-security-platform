# Spec: REQ-SBX-GENERAL-001 Sandbox Security Core

## Document Status

- Requirement: `REQ-SBX-GENERAL-001`
- Name: General sandbox security contracts and core evaluation pipeline
- Status: `APPROVED`
- Approved: `2026-07-13`
- Review revision: 14
- Original date: `2026-07-10`
- Revised: `2026-07-13`
- Umbrella design:
  `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- Prerequisite: switch the active sprint from accepted `REQ-T1-DEMO-010`
  before implementation
- Workflow: `Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop`

Revision 14 is the documentation-only approval and consistency gate. Every
implementation task remains RED-first.

This revised Core Spec and the General Design were explicitly reapproved by the
user on `2026-07-13`. Implementation is authorized only through the canonical
Master DAG.

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
- Per-slot timeout and normal work budget, cancellation, and late-result rejection.
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
  contracts/
    sandbox-security-request.ts
    sandbox-security.ts
  tests/
    sandbox-security-contract.spec.ts
    types/sandbox-security-public-types.ts

engines/sandbox/src/security/
  source-authority.ts
  canonical-json.ts
  canonical-fingerprint.ts
  input-boundary.ts
  locator.ts
  policy-profiles.ts
  detector-contract.ts
  subject-scope.ts
  detector-output-boundary.ts
  sanitized-boundary.ts
  detector-registry.ts
  finding-qualification.ts
  escalation-state.ts
  runtime-deadline.ts
  run-ledger.ts
  policy-reducer.ts
  semantic-validator.ts
  engine.ts
  index.ts
  adapters/
    monitor-decision-provider.ts
    track1-rule-matches.ts

engines/sandbox/tests/
  sandbox-security-input.spec.ts
  sandbox-security-authority.spec.ts
  sandbox-security-detector.spec.ts
  sandbox-security-policy.spec.ts
  sandbox-security-engine.spec.ts
  sandbox-security-track1-adapter.spec.ts
  types/
    sandbox-security-detector-types.ts
  helpers/
    track1-security-regression-harness.ts

tests/repository/
  sandbox-security-core.spec.ts
```

`shared` validates syntax and structure only. It does not import a profile,
slot registry, reducer, semantic validator, or engine module.
There is no `engines/sandbox/src/security/contract.ts` or
`engines/sandbox/src/security/detector-pipeline.ts`. Production `adapters/`
contains exactly the Monitor and Track 1 rule adapters above. The Track 1
regression harness is test-only and may exist only under
`engines/sandbox/tests/helpers/`. File creation/modification ownership is the
single-owner table locked by the Master plan.

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
| Judge obligation ID | `obligation://sandbox/security/<decision-id>/<four-digit-ordinal>` | 256 chars |
| public source/call token | engine-generated `source://` or `call://sandbox/security/...` grammar | 256 chars |
| detector slot ID | shared public `string`; grammar below (not Engine slot union) | 128 chars |
| detector version | ASCII semantic version `^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$` | 64 chars |
| reason code | one of the closed category reason constants | 64 chars |
| engine evidence ref | engine-generated grammar below | 256 chars |
| JSON pointer | restricted RFC 6901 grammar below | 512 bytes |

Shared public `detector_id` is a plain `string`. Shared normalizers validate
**grammar only** against this exact regex (max 128 chars):

```regex
^detector://[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){1,7}$
```

They must not import profile manifests, hard-code the three built-in slot
constants, import `engines/**`, or depend on Engine type
`SandboxSecurityDetectorSlotId`. Engine semantic validation alone checks
membership: `detector_run.detector_id` and `finding.detector_id` each belong to
selected `profile.detector_slots`. Engine-internal narrow type
`SandboxSecurityDetectorSlotId` may be assigned to the public `string` field
when materializing runs/findings. There is no second shared closed-set authority.

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
evidence://sandbox/security/<decision-id>/engine-0001
```

The four-digit form is one-per-published-finding in final finding order. The
`engine-0001` form is the sole Engine-failure marker. Both are generated during
decision materialization and never accepted from a detector.

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
  /** Public shared string; grammar-validated only. Not Engine slot union. */
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

export interface AuthenticatedSourceObservation {
  source_id: string;
  authority_kind: SandboxSecurityAuthorityKind;
  source_type: SandboxSecuritySourceType;
  media_type: "text/plain" | "application/json";
  value: string | SandboxSecurityJsonValue;
  provenance_ref: string;
}

export interface AuthenticatedToolObservation {
  authority_kind: "integration_observation" | "simulation_observation";
  call_id: string;
  tool_name: string;
  target?: string;
  arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecurityAuthoritativeEvaluationContext {
  schema_version: "sandbox-security-authoritative-context.v1";
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: readonly AuthenticatedSourceObservation[];
  tool_request?: Readonly<AuthenticatedToolObservation>;
}

export interface SandboxSecurityEvaluationRequest {
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

Authority normalization deliberately does not assign trust. It produces this
Engine-internal authority-bound content shape:

```ts
declare const sandboxSecuritySourceHandleBrand: unique symbol;
declare const sandboxSecurityCallHandleBrand: unique symbol;

type SandboxSecuritySourceHandle =
  string & { readonly [sandboxSecuritySourceHandleBrand]: true };

type SandboxSecurityCallHandle =
  string & { readonly [sandboxSecurityCallHandleBrand]: true };

export interface SandboxSecurityAuthorityBoundContent {
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly source_id: string;
  readonly source_type: SandboxSecurityClaimedSourceType;
  readonly media_type: "text/plain" | "application/json";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly value: string | SandboxSecurityJsonValue;
  readonly provenance_ref: string;
  readonly original_utf8_bytes: readonly number[];
  readonly original_value_sha256: string;
  readonly comparison_value: string | SandboxSecurityJsonValue;
}

interface SandboxSecurityNormalizedToolRequest {
  readonly call_handle: SandboxSecurityCallHandle;
  readonly call_id: string;
  readonly authority_kind:
    | "integration_observation"
    | "simulation_observation";
  readonly tool_name: string;
  readonly target?: string;
  readonly arguments: SandboxSecurityJsonValue;
  readonly arguments_jcs_sha256: string;
  readonly has_target: boolean;
}
```

The selected immutable profile is the sole trust authority. After profile
resolution, `policy-profiles.ts` applies the profile's exact `trust_rules`
through this helper:

```ts
export type SandboxSecurityTrustClass =
  | "control"
  | "user_supplied"
  | "external_untrusted"
  | "generated_untrusted";

export function deriveSandboxSecurityTrustClass(input: {
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly source_type: SandboxSecurityClaimedSourceType;
}): SandboxSecurityTrustClass;
```

Unknown or ambiguous combinations fail deterministically. `control` remains
instruction authority within the declared mode, not proof of harmlessness.
Phase 2 must not carry a second hard-coded trust table.

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
export interface SandboxSecurityRawDetectorSnapshot {
  readonly request_id: string;
  readonly evaluation_mode: SandboxSecurityEvaluationMode;
  readonly stage: SandboxSecurityStage;
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly contents: readonly SandboxSecurityNormalizedContent[];
  readonly tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  readonly canonical_request_sha256: string;
}

interface SandboxSecurityNormalizedContent
  extends SandboxSecurityAuthorityBoundContent {
  readonly trust_class: SandboxSecurityTrustClass;
}
```

Normalized contents are created only after profile resolution. They include
profile-derived trust, authoritative type, engine-private source
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
 * Engine-private compatibility control signal. It is exported only from its
 * owning detector-contract module for internal adapters and is never exported
 * from the final security index. Only `instanceof` this class maps to
 * adapter_unsupported; lookalike objects and all other detector rejections map
 * to detector_failed.
 */
export class SandboxSecurityAdapterUnsupportedError extends Error {
  readonly code = "adapter_unsupported" as const;

  constructor() {
    super("sandbox_security_adapter_unsupported");
    this.name = "SandboxSecurityAdapterUnsupportedError";
    Object.freeze(this);
  }
}

export interface SandboxSecurityDetectorRegistryInput {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
}

export interface SandboxSecurityDetectorRegistry {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
}
```

Registry construction requires the rule slot, validates exact keys, and freezes
the captured ports without selecting a profile. Profile-specific required-slot
resolution is a separate Engine-internal operation.

The sanitizer output has this exact public-to-the-port shape; stage invariants
control whether `tool_request` is present:

```ts
interface SandboxSecuritySanitizedJudgeSource {
  readonly source_token: string;
  readonly source_type: SandboxSecuritySourceType;
  readonly media_type: "text/plain" | "application/json";
  readonly sanitized_value: string | SandboxSecurityJsonValue;
}

interface SandboxSecuritySanitizedJudgeToolRequest {
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
```

`tool_name_token` is an Engine-issued external evaluation token, not a sanitized
or transformed real tool name. `sanitized_target` and `sanitized_arguments`
remain sanitizer-produced bounded values. This naming and representation are
the only allowed tool payload model; no parallel tool-name, target-token, or
arguments-token aliases exist.

Every token is engine-issued and scoped to one evaluation. This type contains
no raw snapshot, raw source value, raw tool name/target/arguments, ordinary
content hash, provenance, credential, endpoint, or provider metadata. It may
contain only sanitizer-produced source and tool values. External results refer
only to these tokens; the engine maps them back to private subject handles.

Judge may be called only when `routed_obligations` is nonempty. Each obligation
is Engine-generated, deterministic, evaluation-scoped, content-free, and uses:

```text
obligation://sandbox/security/<decision-id>/<four-digit-ordinal>
```

Ordinals start at `0001` after sorting by category and canonical tokenized
subject scope. Slot ID is excluded. Obligations contain only unresolved
escalation signals. Their subject tokens must already exist in the payload and
must match subject kind. Duplicate obligation IDs and duplicate category plus
canonical scope are invalid. Raw content, private handles, ordinary hashes, and
provenance are forbidden.

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
- raw candidate duplicate key is category + reason code + canonical subject
  refs; raw clearance key is category + canonical subject refs; external keys
  prepend obligation_id. Repeating a key in one slot is invalid regardless of
  severity/confidence rather than merged;
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

External result items must reference an obligation present in the validated
payload. Category must equal the obligation category. After token-to-private
mapping, both result and obligation refs are canonicalized with the P3-T3
subject-scope helper and their canonical arrays must be exactly equal. Input
order may differ; subset, superset, duplicate, locator widening/narrowing, and
whole-source/byte-range substitution are invalid for both risk and clearance.
A multi-ref obligation must be returned with every ref or omitted entirely.
One obligation may yield accepted risk, qualified clearance, low-confidence
unresolved evidence, or no returned item. Omitted obligations are the only
valid partial coverage and remain unresolved. Unknown, stale, or
cross-evaluation obligation IDs invalidate the result. Judge cannot create an
escalation obligation or report an unrouted category/scope.

```ts
export const SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT = 32;
export const SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM = 8;
export const SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES = 256 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH = 8;
export const SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES = 2048;
export const SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES = 64 * 1024;
export const SANDBOX_SECURITY_MAX_SANITIZED_TOKENS = 67;
```

Sanitized payload limits are 256 KiB canonical bytes, JSON depth 8, 2048 JSON
nodes, and 67 unique evaluation tokens (one request token, 64 source tokens,
one call token, and one tool-name token).
Overflow is `external_redaction_failed` and causes zero Judge calls. A Judge
adapter must reject a raw response over 64 KiB before parsing; an oversized or
post-parse oversized external result is `detector_result_invalid`. Limit
measurement and validation consume the 5000 ms normal evaluation work budget.

GENERAL-001 implements recording detectors and a recording sanitizer for tests
only. Production sanitizer and external Judge belong to GENERAL-002. Sanitizer
failure prevents the Judge call and records `external_redaction_failed`. The
Judge slot's effective timeout covers sanitizer plus Judge execution; the
Judge receives only the time remaining after sanitization.

### Canonical Private Subject Scope

Subject identity is an Engine-internal Phase 3 primitive, not a Phase 4
qualification implementation detail:

```ts
type SandboxSecurityCanonicalPrivateSubjectScope =
  | {
      readonly kind: "content_source";
      readonly source_handle: SandboxSecuritySourceHandle;
      readonly locator: SandboxSecurityContentLocator;
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
      readonly component: "whole_call" | "tool_name" | "target";
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
      readonly component: "arguments";
      readonly locator: SandboxSecurityToolLocator;
    };

function canonicalizeSandboxSecurityPrivateSubjectScopes(
  refs: readonly SandboxSecurityCandidateSubjectRef[]
): readonly SandboxSecurityCanonicalPrivateSubjectScope[];

function computeSandboxSecuritySubjectKey(input: {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
}): string;
```

```text
subject_key = sha256_hex(JCS({
  category,
  subjects: canonicalized_and_sorted_private_scopes
}))
```

Category participates in identity; detector slot ID does not. Ref order does
not affect the result, duplicate scopes are rejected before hashing, and both
helpers remain Engine-internal. P3 raw and external boundaries use this single
implementation; P4 qualification imports it and must not reimplement it.

## Candidate Qualification

An engine-private risk candidate contains category, severity, finite confidence
in `[0,1]`, closed reason code, and structured content/tool subject refs. A
clearance contains category, confidence, and the same scoped subject model.
Neither is public output.

Qualification produces an exact Engine-internal draft rather than temporarily
placing private handles in the public Finding type:

```ts
interface SandboxSecurityAcceptedRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly finding_id: string;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
}

interface SandboxSecurityQualifiedClearance {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly confidence: number;
}

interface SandboxSecurityRoutingRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
}

interface SandboxSecurityDraftFinding {
  readonly finding_id: string;
  readonly detector_id: SandboxSecurityDetectorSlotId;
  readonly detector_version: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_key: string;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
}

interface SandboxSecurityQualifiedSlotEvidence {
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly accepted_risks:
    readonly SandboxSecurityAcceptedRiskEvidence[];
  readonly accepted_draft_findings:
    readonly SandboxSecurityDraftFinding[];
  readonly qualified_clearances:
    readonly SandboxSecurityQualifiedClearance[];
  readonly routing_risks:
    readonly SandboxSecurityRoutingRiskEvidence[];
  readonly discarded_count: number;
}

/**
 * One record per selected manifest slot, in profile.detector_slots order.
 * Covers every terminal run status. Engine-internal; never exported;
 * not durable audit; not public decision.
 *
 * Rules:
 * - exactly one record per selected manifest slot
 * - record order equals profile.detector_slots order
 * - record.status must equal detector_run.status for the same slot
 * - matched: must have normalized_result + qualified_evidence;
 *   qualified_evidence.source_slot_id === slot_id;
 *   qualified_evidence is cache under validation, not authority
 * - all non-matched statuses: must not carry normalized_result or
 *   qualified_evidence
 * - recursively frozen
 */
export type SandboxSecuritySlotEvaluationRecord =
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "matched";
      readonly normalized_result:
        Readonly<SandboxSecurityNormalizedSlotResult>;
      readonly qualified_evidence:
        Readonly<SandboxSecurityQualifiedSlotEvidence>;
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "no_match";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "invalid_result";
      readonly error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "failed";
      readonly error_code:
        | "detector_unavailable"
        | "detector_failed"
        | "external_redaction_failed"
        | "adapter_unsupported";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "timeout";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "skipped";
      readonly skip_reason: SandboxDetectorSkipReason;
    };

// SandboxSecuritySlotBoundaryOutcome is retired; use SlotEvaluationRecord.status.

interface SandboxSecurityQualificationSubjectMap {
  readonly evaluation_nonce: string;
  readonly sources: readonly {
    readonly source_handle: SandboxSecuritySourceHandle;
  }[];
  readonly tool?: Readonly<{
    readonly call_handle: SandboxSecurityCallHandle;
  }>;
}

interface SandboxSecurityPublicSubjectTokenMap {
  readonly decision_id: string;
  readonly sources: readonly {
    readonly source_handle: SandboxSecuritySourceHandle;
    readonly public_source_token: string;
  }[];
  readonly tool?: Readonly<{
    readonly call_handle: SandboxSecurityCallHandle;
    readonly public_call_token: string;
  }>;
}

type SandboxSecurityAcceptedSubjectEntity =
  | {
      readonly kind: "content_source";
      readonly source_handle: SandboxSecuritySourceHandle;
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
    };
```

Every accepted risk evidence item pairs with exactly one DraftFinding, which in
turn pairs with exactly one published Finding. The three records must agree on
subject key, finding ID, detector ID/version, category, severity, confidence,
reason code, and canonical subject refs. Drafts contain no public tokens or
evidence refs and never enter reduction or the public decision.

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

Judge resolution is owned by one Engine-internal state API:

```ts
export interface SandboxSecurityEscalationSignal {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
  readonly origin_slot_ids: readonly SandboxSecurityDetectorSlotId[];
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
}

export type SandboxSecurityJudgeResolutionEvidence =
  | {
      readonly kind: "accepted_risk";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
      readonly finding_id: string;
    }
  | {
      readonly kind: "qualified_clearance";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
    }
  | {
      readonly kind: "partial_coverage";
      readonly covered_obligation_ids: readonly string[];
      readonly uncovered_obligation_ids: readonly string[];
    }
  | { readonly kind: "no_match" }
  | {
      readonly kind: "low_confidence_unresolved";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
    }
  | {
      readonly kind: "invalid_result";
      readonly error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    };

export type SandboxSecurityNormalizedJudgeOutcome =
  | {
      readonly status: "matched";
      readonly evidence:
        Readonly<SandboxSecurityQualifiedSlotEvidence>;
      readonly covered_obligation_ids: readonly string[];
    }
  | {
      readonly status: "no_match";
      readonly covered_obligation_ids: readonly [];
    }
  | {
      readonly status: "invalid_result";
      readonly error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    };

export interface SandboxSecurityJudgeApplicationResult {
  readonly resolution_evidence:
    readonly SandboxSecurityJudgeResolutionEvidence[];
  readonly unresolved_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly accepted_draft_findings:
    readonly SandboxSecurityDraftFinding[];
  /** Obligation IDs covered by this Judge application; subset of routed set. */
  readonly covered_obligation_ids: readonly string[];
}

export type SandboxSecurityEscalationLifecycle =
  | "collecting"
  | "obligations_materialized"
  | "judge_applied"
  | "closed";

export type SandboxSecurityJudgeTerminationReason =
  | "risk_short_circuit"
  | "detector_unavailable"
  | "external_redaction_failed"
  | "detector_failed"
  | "detector_timeout"
  | "evaluation_terminated";

export interface SandboxSecurityEscalationState {
  lifecycle(): SandboxSecurityEscalationLifecycle;
  /** Rule/local evidence only; Judge evidence is forbidden here. */
  addSlotEvidence(evidence: SandboxSecurityQualifiedSlotEvidence): void;
  unresolvedSignals(): readonly SandboxSecurityEscalationSignal[];
  materializeRoutedObligations(input: {
    readonly decision_id: string;
    readonly token_registry:
      Readonly<SandboxSecurityExternalTokenRegistry>;
  }): readonly SandboxSecuritySanitizedJudgeObligation[];
  applyJudgeOutcome(
    outcome: Readonly<SandboxSecurityNormalizedJudgeOutcome>
  ): Readonly<SandboxSecurityJudgeApplicationResult>;
  /**
   * Termination without NormalizedJudgeOutcome.
   * Callable from collecting or obligations_materialized only.
   * Mutually exclusive with applyJudgeOutcome for this evaluation.
   * Preserves all unresolved signals; creates no accepted findings;
   * creates no new signals; returns resolution_evidence: [] always;
   * termination is represented by Judge SlotEvaluationRecord + DetectorRun
   * + retained unresolved signals (no judge_terminated evidence kind).
   * Transitions directly to closed. At most once per evaluation.
   * Includes risk_short_circuit when short-circuit leaves unrelated signals.
   */
  terminateJudgeAttempt(input: Readonly<{
    reason: SandboxSecurityJudgeTerminationReason;
  }>): Readonly<SandboxSecurityJudgeApplicationResult>;
  /** When no unresolved signals exist: collecting -> closed without Judge. */
  closeWithoutJudge(): void;
  /** judge_applied -> closed. Required after successful applyJudgeOutcome. */
  close(): void;
}

export function createSandboxSecurityEscalationState():
  SandboxSecurityEscalationState;
```

Escalation lifecycle is call-once and exact:

```text
collecting
  allow: addSlotEvidence(rule/local only)
  forbid: applyJudgeOutcome
  materializeRoutedObligations once -> obligations_materialized
  closeWithoutJudge when no unresolved signals -> closed
  terminateJudgeAttempt once -> closed (signals preserved)

obligations_materialized
  forbid: addSlotEvidence
  applyJudgeOutcome once -> judge_applied
  terminateJudgeAttempt once -> closed (signals preserved)
  Judge cannot create new escalation signals

judge_applied
  close once -> closed  (mandatory after applyJudgeOutcome)

closed
  all mutation fails
  final unresolved signals are read only from closed state

Normal Judge path (locked):
  applyJudgeOutcome(...) -> close() -> read final unresolved signals

Failure paths without NormalizedJudgeOutcome (Judge absent, sanitizer fail,
Judge throw/timeout, budget termination mid-Judge, short-circuit with remaining
signals, etc.) must call terminateJudgeAttempt once.
```

`addSlotEvidence()` accepts rule/local evidence only. Judge routing risks never
create new signals. `applyJudgeOutcome()` alone matches obligation IDs and
applies accepted risk, clearance, low-confidence, omitted coverage, no-match,
and invalid-result semantics. Covered obligation IDs must come only from this
evaluation's routed obligations, with no duplicates; omitted obligations remain
unresolved. P4 orchestration cannot duplicate this logic.
Each signal's private refs canonicalize to its `subject_key`; they exist only so
P4-T2 can map the routed scope through the Engine external-token registry.

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
export interface SandboxSecurityTrustRule {
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly source_types:
    readonly SandboxSecurityClaimedSourceType[];
  readonly trust_class: SandboxSecurityTrustClass;
}

export interface SandboxSecurityActionByStage {
  readonly user_input: SandboxSecurityAction;
  readonly model_output: SandboxSecurityAction;
  readonly tool_request: SandboxSecurityAction;
}

export interface SandboxSecurityActionMatrix {
  readonly accepted_critical:
    Readonly<SandboxSecurityActionByStage>;
  readonly accepted_high: Readonly<SandboxSecurityActionByStage>;
  readonly accepted_medium: Readonly<SandboxSecurityActionByStage>;
  readonly accepted_low: Readonly<SandboxSecurityActionByStage>;
  readonly no_finding_all_resolved:
    Readonly<SandboxSecurityActionByStage>;
  readonly unresolved_required:
    Readonly<SandboxSecurityActionByStage>;
}

type SandboxSecurityRoutingRule =
  | "always"
  | "configured_after_no_short_circuit"
  | "unresolved_escalation_signal";

export type SandboxSecurityDetectorSlotId =
  | "detector://sandbox/security/rule/default/v1"
  | "detector://sandbox/security/local/default/v1"
  | "detector://sandbox/security/judge/default/v1";

export interface SandboxSecurityDetectorSlotManifest {
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

export interface SandboxSecurityPolicyProfileManifest {
  profile_id: SandboxSecurityPolicyProfileId;
  normal_work_budget_ms: 5000;
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

All support all three stages. Both manifests have `normal_work_budget_ms: 5000`, the
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
or Judge registrations alone do not create indeterminacy. Registry and Engine
construction require the rule detector only. When an evaluation selects the
strict profile, profile-specific detector resolution requires both rule and
local. If the local detector is missing, resolution fails with
`sandbox_security_profile_invalid` before decision ID issuance and before any
detector call. No public Decision is returned. A routed but unavailable Judge
becomes `runtime_required` and fails closed through the normal Judge failure
path.

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

Run transitions are owned by one Engine-internal ledger, not by orchestration:

```ts
export interface SandboxSecurityRunLedger {
  markSkipped(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    obligation: SandboxDetectorRunObligation;
    skip_reason: SandboxDetectorSkipReason;
    elapsed_ms: number;
  }>): void;
  markStarted(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    obligation: SandboxDetectorRunObligation;
    started_monotonic_ms: number;
  }>): void;
  markMatched(input: Readonly<{slot_id: SandboxSecurityDetectorSlotId; elapsed_ms: number}>): void;
  markNoMatch(input: Readonly<{slot_id: SandboxSecurityDetectorSlotId; elapsed_ms: number}>): void;
  markFailed(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code:
      | "detector_unavailable"
      | "detector_failed"
      | "external_redaction_failed"
      | "adapter_unsupported";
  }>): void;
  markTimeout(input: Readonly<{slot_id: SandboxSecurityDetectorSlotId; elapsed_ms: number}>): void;
  markInvalidResult(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code: "detector_result_invalid" | "detector_content_leak";
  }>): void;
  /**
   * Global attachment once after publication. Groups by finding.detector_id.
   * Opaque finding IDs alone never prove producer ownership.
   */
  attachPublishedFindings(
    findings: readonly SandboxSecurityFinding[]
  ): void;
  finalize(): readonly SandboxDetectorRun[];
  /**
   * Canonical read-only state for Scheme B and orchestration.
   * Sole source of slot status / RunLedger lifecycle; P4-T6 must not maintain
   * a divergent parallel status table.
   */
  snapshot(): Readonly<SandboxSecurityRunLedgerSnapshot>;
}

export type SandboxSecurityRunLedgerLifecycle =
  | "open"
  | "findings_attached"
  | "finalized";

export interface SandboxSecurityRunLedgerSlotSnapshot {
  readonly slot_id: SandboxSecurityDetectorSlotId;
  readonly status:
    | "not_started"
    | "skipped"
    | "running"
    | "matched"
    | "no_match"
    | "failed"
    | "timeout"
    | "invalid_result";
  readonly obligation?: SandboxDetectorRunObligation;
  readonly skip_reason?: SandboxDetectorSkipReason;
  readonly error_code?: SandboxDetectorRunErrorCode;
}

export interface SandboxSecurityRunLedgerSnapshot {
  readonly lifecycle: SandboxSecurityRunLedgerLifecycle;
  readonly slots: readonly SandboxSecurityRunLedgerSlotSnapshot[];
}

export function createSandboxSecurityRunLedger(input: Readonly<{
  profile: Readonly<SandboxSecurityPolicyProfileManifest>;
}>): SandboxSecurityRunLedger;
```

`snapshot()` is pure read-only, available before and after finalize; after
finalize the returned snapshot is recursively frozen and immutable. Scheme B
settled/running/timeout decisions and closure-progress agreement with RunLedger
lifecycle must use this API only.

Each transition input is an exact-key internal record carrying the manifest
slot ID and only fields required by that transition. Construction creates one
private `not_started` entry per `profile.detector_slots` item in manifest order
and captures detector ID, version, and kind from the manifest. Every method
rejects a slot outside the selected profile.

`attachPublishedFindings(findings)` rules:

1. at most once per evaluation;
2. only after every detector slot is terminal;
3. only before `finalize()`;
4. every finding ID unique;
5. every `finding.detector_id` belongs to the selected profile;
6. group by `finding.detector_id`;
7. only `matched` runs may receive non-empty finding IDs;
8. `no_match`, failed, timeout, invalid, and skipped runs must have none;
9. each finding belongs to exactly one run;
10. finding ID order equals relative order in the final global finding order;
11. a second attachment fails stably;
12. foreign/unknown detector or duplicate IDs fail stably.

`finalize()` rejects if any slot is non-terminal or attachment was required but
missing, and otherwise emits exactly one run per manifest slot in manifest
order. After `finalize()`, the ledger is fully closed; any transition or
attachment fails. The state graph is exact:

```text
not_started -> skipped | running
running -> matched | no_match | failed | timeout | invalid_result
terminal -> no further status mutation
all terminal -> attachPublishedFindings once after public finding publication
attachPublishedFindings -> finalize
finalize -> closed (immutable)
```

| Situation | Obligation | Status | Reason/error | Resolution |
| --- | --- | --- | --- | --- |
| profile-required registration missing for selected profile | n/a | no evaluation | `sandbox_security_profile_invalid` | profile resolution fails before decision ID; no Decision; zero detector calls |
| optional absent and no route requires it | `optional_not_selected` | `skipped` | `optional_not_configured` | resolved |
| optional slot not selected for current stage | `optional_not_selected` | `skipped` | `optional_not_selected` | resolved |
| optional routing false | `optional_not_selected` | `skipped` | `routing_not_selected` | resolved |
| profile-required slot bypassed by short-circuit | `profile_required` | `skipped` | `risk_short_circuit` | resolved by risk only when semantic validation confirms a finding that satisfies the profile short-circuit condition |
| optional slot never selected because of short-circuit | `optional_not_selected` | `skipped` | `risk_short_circuit` | resolved by risk only when semantic validation confirms a finding that satisfies the profile short-circuit condition |
| required or routed completion with candidates or clearances | required kind | `matched` | none | run complete; Judge must cover every routed signal |
| required or routed completion with neither | required kind | `no_match` | none | run complete; routed Judge signals remain unresolved |
| routed optional unavailable | `runtime_required` | `failed` | `detector_unavailable` | unresolved |
| required/routed throws or rejects | required kind | `failed` | `detector_failed` | unresolved |
| required/routed times out | required kind | `timeout` | `detector_timeout` | unresolved |
| required/routed malformed/leaking result | required kind | `invalid_result` | stable invalid/leak code | unresolved |
| sanitizer fails | `runtime_required` | `failed` | `external_redaction_failed` | unresolved; Judge not called |
| compatibility adapter cannot represent stage/tool | required kind | `failed` | `adapter_unsupported` | unresolved; fail closed |
| already-selected optional slot after evaluation termination | `runtime_required` | `skipped` | `evaluation_terminated` | unresolved |
| profile-required slot after evaluation termination | `profile_required` | `skipped` | `evaluation_terminated` | unresolved |
| never-selected optional slot after evaluation termination | `optional_not_selected` | `skipped` | `evaluation_terminated` | no independent effect |

An optional detector becomes runtime-required at the moment routing selects it,
before availability or execution is checked. It cannot fail and then be treated
as optional absence.

Profile-required slots use `profile_required`. A configured balanced optional
local slot becomes `runtime_required` when selected for execution; otherwise it
is skipped with `optional_not_configured`, `optional_not_selected`,
`routing_not_selected`, or `risk_short_circuit` as applicable. Routed Judge is
`runtime_required`; unrouted Judge is optional/skipped. Published findings are
attached only via `attachPublishedFindings` after public publication; the ledger
groups by `finding.detector_id` and never accepts opaque ID lists as proof of
producer ownership. The ledger rejects duplicate starts, illegal terminal
transitions, pre-publication attachment, foreign detectors, and second
attachment or post-finalize mutation.

## Timing and Cancellation

Normal sandbox-security evaluation work has a 5000 ms monotonic budget starting
at `SandboxSecurityEngine.evaluate()` entry. When that work budget is exhausted,
the Engine performs no further detector, sanitizer, or Judge work, and no
ordinary/unrestricted qualification, normal unrestricted publication, or
ordinary policy work. It may execute one bounded
deterministic fail-closed epilogue solely to close internal state and, when
sufficient trusted state already exists, return a minimal validated content-free
decision. The epilogue is not claimed to complete inside the exhausted 5000 ms
work budget.

| Phase | Normal 5000 ms work budget | Fail-closed epilogue allowed |
| --- | ---: | ---: |
| normalization | yes | no |
| authority validation | yes | no |
| input preparation/JCS/hash | yes | no |
| profile resolution/trust | yes | no |
| snapshot construction | yes | no |
| detector/sanitizer/Judge | yes | no |
| boundary normalization | yes | no |
| qualification/Judge resolution | yes | no |
| normal publication | yes | no |
| normal run finalization | yes | no |
| normal reduction | yes | no |
| normal decision materialization | yes | no |
| normal semantic validation | yes | no |
| close active lease/runs / terminalize incomplete slots | no | yes |
| complete settled rule/local (matched: restricted-qualify + addSlotEvidence; no_match/invalid: record only) | no | yes |
| lifecycle-correct escalation close / Judge apply | no | yes |
| restricted one-shot publication (or reuse committed) | no | yes |
| attachPublishedFindings + finalize (or reuse) | no | yes |
| record decision-bearing Engine failure | no | yes |
| minimal fail-closed reduction | no | yes |
| minimal candidate normalize/validate | no | yes |

```text
effective detector timeout =
  min(configured detector timeout, remaining normal work budget)
```

Each active detector receives a derived `AbortSignal`. Deadline expiry aborts
the signal and closes an engine generation token. Results arriving after token
closure are ignored and cannot mutate runs or findings. `AbortSignal` does not
promise forced termination.

Caller cancellation rejects with `sandbox_security_cancelled` and returns no
decision. Work-budget exhaustion before a resolved profile, created RunLedger,
and valid decision ID raises the stable content-free internal error; adapters
fail closed. Exhaustion after a valid decision ID enters at most one fail-closed
epilogue (see Fail-Closed Epilogue). An active detector becomes terminal
`timeout`. Not-yet-started required or already-selected optional slots become
`skipped` with `evaluation_terminated` while retaining their real obligation
(`profile_required` or `runtime_required`) and are unresolved. Not-yet-started
never-selected optional slots become `skipped` with
`optional_not_selected + evaluation_terminated` and have **no independent
effect**.
`profile_required + evaluation_terminated` and
`runtime_required + evaluation_terminated` are unresolved required evidence.
A `skipped` status is **not** resolved or unresolved by status alone.
Resolution is determined by `obligation + skip_reason` (see run matrix above).
In particular, `optional_not_selected` with
`optional_not_configured` / `optional_not_selected` / `routing_not_selected` is
resolved; `optional_not_selected + evaluation_terminated` has no independent
effect;
`profile_required` / `runtime_required` + `evaluation_terminated` is unresolved;
`risk_short_circuit` is resolved by risk only when a validated short-circuit
finding exists. Invalid monotonic time, scheduler callbacks,
cancellation handles, or wall-clock values raise
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

Post-detector and non-detector failures use this exact Engine-internal evidence:

```ts
/**
 * Decision-bearing Engine failure may enter reducer, ledger, and public
 * engine-0001 evidence. Only when a valid decision ID, created_at, complete
 * ledger, and candidate can still be materialized.
 */
/**
 * Phases that may appear on a decision-bearing evaluation_budget_exhausted
 * failure. Pre-ID phases are excluded; those map to terminal
 * pre_id_evaluation_budget_exhausted.
 *
 * decision_identity is decision-bearing only when a valid decision ID was
 * already minted and the immediately following remaining-budget check fails.
 * Budget exhaustion before a successful nextDecisionId() is terminal.
 */
export type SandboxSecurityDecisionBearingBudgetPhase =
  | "decision_identity"
  | "detector_execution"
  | "sanitization"
  | "boundary_normalization"
  | "qualification"
  | "judge_resolution"
  | "publication"
  | "run_finalization"
  | "reduction"
  | "decision_materialization"
  | "semantic_validation";

export type SandboxSecurityDecisionBearingEngineFailure =
  | {
      readonly code: "evaluation_budget_exhausted";
      readonly phase: SandboxSecurityDecisionBearingBudgetPhase;
    }
  | {
      readonly code: "semantic_validation_failed";
      readonly phase: "semantic_validation";
    };

/**
 * Terminal Engine errors never enter reducer, ledger, public Decision, or
 * engine-0001. evaluate() throws sandbox_security_internal_invalid;
 * embedding adapter fails closed.
 */
export type SandboxSecurityTerminalEngineErrorCode =
  | "decision_identity_invalid"
  | "runtime_clock_invalid"
  | "decision_materialization_invalid"
  | "pre_id_evaluation_budget_exhausted";

/** Convenience union for internal diagnostics only. */
export type SandboxSecurityEngineFailureCode =
  | SandboxSecurityDecisionBearingEngineFailure["code"]
  | SandboxSecurityTerminalEngineErrorCode;

/** Full phase taxonomy including pre-ID phases for diagnostics only. */
export type SandboxSecurityEngineFailurePhase =
  | "normalization"
  | "authority"
  | "input_preparation"
  | "profile_resolution"
  | "trust_derivation"
  | "snapshot_construction"
  | SandboxSecurityDecisionBearingBudgetPhase;

/** Alias used by reducer/ledger: decision-bearing only. */
export type SandboxSecurityEngineFailure =
  SandboxSecurityDecisionBearingEngineFailure;

// Code/phase rules:
// semantic_validation_failed        -> semantic_validation only
// evaluation_budget_exhausted       -> SandboxSecurityDecisionBearingBudgetPhase only
// pre-ID phase budget exhaustion    -> pre_id_evaluation_budget_exhausted (terminal)
//   pre-ID phases: normalization, authority, input_preparation,
//   profile_resolution, trust_derivation, snapshot_construction
// decision_identity_invalid         -> terminal; never reducer/ledger
// runtime_clock_invalid             -> terminal; never reducer/ledger
// decision_materialization_invalid  -> terminal; never reducer/ledger
// pre_id_evaluation_budget_exhausted -> terminal; never reducer/ledger
// Any other pairing is invalid. Terminal errors never fabricate a public
// decision or evidence namespace.

It is reducer/validator evidence only and never exposes raw diagnostics. Its
single public evidence marker is:

```text
evidence://sandbox/security/<decision-id>/engine-0001
```

Engine failure never mutates a detector run and never lowers an action already
required by accepted evidence.

There is one necessary identity boundary. Failures during normalization or
authority validation, pre-ID work-budget exhaustion, and
`decision_identity_invalid` itself occur before a valid decision ID exists.
They are **terminal Engine errors** (never decision-bearing): they cannot enter
reducer/public decision or use a fabricated evidence ref;
`evaluate()` raises the stable content-free internal error and the embedding
adapter fails closed. `nextDecisionId()` is called exactly once only after
profile resolution, RunLedger creation, detector resolution, trust derivation,
frozen raw snapshot construction, and a remaining-work-budget check—
immediately before detector execution. Later Engine failures (including the
bounded epilogue after post-ID work-budget exhaustion) are reducer evidence when
a valid timestamp and candidate can still be materialized and may then use the
exact `engine-0001` marker. Invalid wall-clock output or failed recovery/epilogue
validation returns no unvalidated decision. A second ID call or fallback ID is
forbidden.

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

1. start monotonic normal work budget (5000 ms) at evaluate entry;
2. structurally normalize the untrusted submission;
3. validate authoritative context and exact public/context match, producing
   authority-bound content with no trust class;
4. enforce limits and compute JCS bytes/hashes (input preparation);
5. resolve profile, create one run ledger from that profile, and resolve the
   detector registry;
6. derive trust only through profile trust rules and build frozen raw snapshot;
7. confirm remaining normal work budget; if exhausted before ID → terminal
   `pre_id_evaluation_budget_exhausted`;
8. call `runtime.nextDecisionId()` exactly once; validate decision ID grammar;
   invalid → terminal `decision_identity_invalid`;
9. immediately re-check remaining normal work budget; if exhausted →
   decision-bearing `evaluation_budget_exhausted` with
   `phase: "decision_identity"`, zero detector calls, enter Scheme B epilogue;
10. **apply the unified slot branch table only when each slot becomes eligible**
    (do **not** pre-terminalize later slots before short-circuit / routing):
    1. rule;
    2. evaluate rule short-circuit;
    3. local only when not short-circuited and applicable;
    4. Judge only when routed.
    Before any detector call for an **eligible** slot:
    - profile-required selected → `markStarted(profile_required)`;
    - optional selected for execution → `markStarted(runtime_required)`;
    - optional absent / not configured and no route →
      `markSkipped(optional_not_selected, optional_not_configured)` + skipped
      SlotEvaluationRecord (no detector call);
    - configured but routing false →
      `markSkipped(optional_not_selected, routing_not_selected)` + skipped
      SlotEvaluationRecord;
    After a started detector attempt (discriminated atomic; no mid-section
    budget checkpoint; only `matched` qualifies / `addSlotEvidence`):
    - matched: settle matched + store normalized result → qualify → record
      matched SlotEvaluationRecord → `addSlotEvidence` → only then budget check;
    - no_match: settle no_match → record no_match SlotEvaluationRecord → do not
      qualify → do not call `addSlotEvidence` → only then budget check;
    - invalid_result: settle invalid_result → record invalid_result
      SlotEvaluationRecord → do not qualify → do not call `addSlotEvidence` →
      only then budget check;
    - throw/reject: an exact engine-private
      `SandboxSecurityAdapterUnsupportedError` maps to
      `markFailed(adapter_unsupported)`; every other rejection maps to
      `markFailed(detector_failed)` → failed SlotEvaluationRecord → do not
      qualify → do not call `addSlotEvidence` → immediately re-check normal
      work budget → if exhausted enter Scheme B → else continue policy;
    - slot timeout: use deadline lease `termination_reason`:
        `work_budget` → enter Scheme B (work budget wins simultaneous expiry);
        `slot_timeout` → `markTimeout()` → timeout SlotEvaluationRecord → do not
        qualify → do not call `addSlotEvidence` → immediately re-check normal
        work budget → if exhausted enter Scheme B → else continue policy;
    - work-budget exhaustion → Scheme B; caller cancellation → no Decision;
    **continue policy after rule/local failure** (locked):
    - rule failed/timeout: no qualification or escalation evidence; does **not**
      short-circuit; continue to applicable local while normal budget remains;
      required rule failure remains unresolved independently;
    - local failed/timeout: preserve previously accumulated rule
      evidence/signals; Judge routes only if those signals require it; local
      failure remains unresolved independently;
11. **if rule short-circuit** (only from accepted matched rule risk):
    - mark remaining **not-yet-terminal** slots with exact obligations + skipped
      SlotEvaluationRecord (never a second terminal transition):
        profile-required (e.g. strict local) → obligation `profile_required`,
          status `skipped`, skip_reason `risk_short_circuit`;
        optional never selected (balanced local, balanced/strict Judge before
          routing) → obligation `optional_not_selected`, status `skipped`,
          skip_reason `risk_short_circuit`;
        never fabricate `runtime_required` for short-circuit;
    - do **not** materialize routed obligations; do **not** call sanitizer/Judge;
    - while escalation still `collecting`:
        no unresolved signals → `closeWithoutJudge()`;
        unresolved signals exist →
          `terminateJudgeAttempt({ reason: "risk_short_circuit" })`
          (preserves unrelated signals; only same category+subject_key was
          suppressed by accepted risk earlier);
    - read final unresolved signals only from closed escalation state;
    - continue at step 15 (publication);
12. **when not short-circuited**, complete applicable local via the unified slot
    branch table only when local becomes eligible (including
    absent/skipped/failed/timeout);
13. convert unresolved signals into deterministic routed obligations once only
    when not short-circuited and signals exist; if no signals after local,
    `closeWithoutJudge()` and terminalize unrouted Judge as skipped
    (`optional_not_configured` or `routing_not_selected`) with skipped record;
14. only when obligations are nonempty (and not short-circuited), Judge becomes
    `runtime_required` and is `markStarted` **before** sanitizer/Judge attempt;
    derive external tokens, sanitize, validate payload/obligations; then:
    - success path: call Judge; apply **discriminated Judge atomic critical
      section** (no mid-section budget checkpoint):
      - external matched: normalize to private handles → settle matched + store
        normalized result → qualify with Judge slot thresholds → construct
        `NormalizedJudgeOutcome` `{ status:"matched", evidence,
        covered_obligation_ids }` → record matched SlotEvaluationRecord →
        `applyJudgeOutcome` → `close()` → only then budget check;
      - external no_match: settle no_match → construct no_match
        `NormalizedJudgeOutcome` → record no_match SlotEvaluationRecord →
        `applyJudgeOutcome` → `close()` → only then budget check;
      - external invalid_result: settle invalid_result → construct invalid_result
        `NormalizedJudgeOutcome` → record invalid_result SlotEvaluationRecord →
        `applyJudgeOutcome` → `close()` → only then budget check;
      only matched invokes qualification;
    - Judge failure path (no `NormalizedJudgeOutcome`; no qualification; no
      `applyJudgeOutcome`): terminalize Judge run + matching
      SlotEvaluationRecord, then `terminateJudgeAttempt` with signals unresolved:
      - Judge unavailable → `failed` / `detector_unavailable`;
      - sanitizer absent or failed → `failed` / `external_redaction_failed`
        (zero Judge calls);
      - Judge throw/reject → `failed` / `detector_failed`;
      - Judge timeout → `timeout` / `detector_timeout`;
      then continue to publication/reduction (no further detector);
15. after all slots are terminal, all SlotEvaluationRecords exist (one per
    manifest slot; Engine-owned precondition, not RunLedger API), and **after
    escalation is closed**, materialize public tokens/findings once (commit
    closure progress.publication);
16. `attachPublishedFindings` then `finalize` the run ledger (or reuse if
    already done via closure progress). Engine precondition before finalize:
    one SlotEvaluationRecord per manifest slot already exists (P4-T5/P4-T6;
    RunLedger does not receive or validate records).
    `RunLedger.finalize` itself validates only: all run slots terminal +
    attachment phase completed + ledger transition legality;
17. reduce published findings, runs, unresolved signals, and Engine failure;
18. call `runtime.now()` exactly once if absent, validate created_at, build the
    complete frozen EvaluationEvidenceLedger (engine_failure already known if
    any), then materialize, structurally normalize, semantically validate, and
    freeze the decision using the single order below;
19. return without retaining snapshot, registries, or ephemeral bytes.

There is no detector retry in GENERAL-001.

#### Unified slot branch table (normal path; locked)

Apply this table **separately when each slot becomes eligible**:

```text
eligibility order:
  1. rule
  2. evaluate rule short-circuit
  3. local only when not short-circuited and applicable
  4. Judge only when routed

Before slot execution (eligible slot only):
  profile-required selected
    → markStarted(profile_required)
  optional selected for execution
    → markStarted(runtime_required)
  optional absent
    → markSkipped(optional_not_selected, optional_not_configured)
    → record skipped
  configured but routing false
    → markSkipped(optional_not_selected, routing_not_selected)
    → record skipped

After execution / attempt:
  matched → matched atomic closure → only then budget check
  no_match → no_match atomic closure → only then budget check
  invalid_result → invalid_result atomic closure → only then budget check
  throw/reject
    → exact SandboxSecurityAdapterUnsupportedError:
         markFailed(adapter_unsupported) + failed record
    → every other rejection:
         markFailed(detector_failed) + failed record
    → immediately re-check normal work budget
    → exhausted → Scheme B; else continue policy
  slot timeout
    → lease termination_reason:
         work_budget → Scheme B (wins simultaneous expiry)
         slot_timeout → markTimeout() + timeout record
           → immediately re-check normal work budget
           → exhausted → Scheme B; else continue policy
  work-budget exhaustion → Scheme B
  caller cancellation → no Decision
```

### Decision Materialization

After profile resolution, RunLedger creation, detector resolution, trust
derivation, frozen raw snapshot construction, and a remaining-work-budget
check—and before detector execution—the Engine:

1. confirms remaining budget (else terminal pre-ID exhaustion);
2. calls `runtime.nextDecisionId()` exactly once;
3. validates decision ID grammar (else terminal `decision_identity_invalid`);
4. **immediately** re-checks remaining budget; if exhausted, records
   decision-bearing `evaluation_budget_exhausted` with
   `phase: "decision_identity"`, performs zero detector calls, and enters
   Scheme B.

The decision ID must satisfy the public grammar. Invalid identity produces
`decision_identity_invalid` with no Decision and no fake ID.
Finding IDs, public subject tokens, routed obligation IDs, finding evidence
refs, and Engine-failure evidence all use this same decision ID.

After normal reduction (or during the epilogue's minimal materialization), the
Engine calls `runtime.now()` exactly once. The value must be a real
RFC3339/ISO timestamp; invalid wall-clock output records
`runtime_clock_invalid` with phase `decision_materialization` internally,
cannot construct a complete ledger or candidate Decision, and is fail-closed by
the embedding adapter. Deadline accounting uses only `monotonicNowMs()` and
never wall clock.

```text
decision.evidence_refs = ordered_unique(
  flatten(published findings' evidence_refs in finding order),
  engine_failure == null
    ? []
    : [evidence://sandbox/security/<decision-id>/engine-0001]
)
```

A clean decision has `[]`. Normal final construction order is unique:

```text
1. complete detector execution
2. complete qualification / Judge resolution
3. publish public findings
4. attachPublishedFindings
5. finalize detector runs
6. reduce initial policy result
7. runtime.now() exactly once
8. validate created_at grammar
9. build complete frozen EvaluationEvidenceLedger
10. build candidate decision
11. normalizeSandboxSecurityDecision(candidate)
12. semantic validate normalized candidate against ledger
13. recursively freeze and return
```

Normalization failure is `decision_materialization_invalid`; semantic mismatch
is `semantic_validation_failed`. The semantic validator directly checks
decision ID, request ID, created-at format, mode, stage, profile, findings,
runs, evidence refs, verdict, action, risk, and Engine-failure floor.

### Fail-Closed Epilogue (Scheme B: restricted deterministic closure)

When the normal work budget is exhausted after a valid decision ID, resolved
profile, and RunLedger exist, the Engine may execute **one** bounded
deterministic fail-closed epilogue. The epilogue is **not** claimed to complete
inside the exhausted 5000 ms normal work budget.

Epilogue **forbids** new detector calls, sanitizer calls, Judge calls, ordinary
or unrestricted qualification, ordinary unrestricted publication, ordinary
allow/no-risk policy paths, a second `nextDecisionId()`, a second
`runtime.now()`, retry, and semantic recovery loops.

Only the **Scheme B restricted qualification** and **restricted one-shot
publication** defined below are permitted after exhaustion.

#### Settled boundary outcome (atomic; locked)

Use the discriminated term **settled boundary outcome**. Only the matched branch
is a **settled normalized result**.

```ts
type SandboxSecuritySettledBoundaryOutcome =
  | {
      status: "matched";
      normalized_result: SandboxSecurityNormalizedSlotResult;
    }
  | {
      status: "no_match";
    }
  | {
      status: "invalid_result";
      error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    };
```

A settled boundary outcome exists only after **all** of:

1. detector generation remains open;
2. full detector output has returned;
3. output boundary normalization succeeds;
4. RunLedger has atomically transitioned the slot to
   `matched` / `no_match` / `invalid_result`;
5. for `matched` only: the immutable normalized result has been stored for
   qualification.

Normal path order (discriminated by boundary status):

```text
detector return
→ boundary normalize
→ atomically settle run status
→ if matched: store normalized outcome (settled normalized result)
  → ordinary qualification
→ if no_match | invalid_result: settled boundary outcome without
  normalized_result; no qualification; no addSlotEvidence
```

A slot still `running` when budget expires has **no** settled boundary outcome
and must become `timeout`. It can never be qualified in the epilogue. Late
results after generation close cannot become settled epilogue input.

Only a `matched` boundary outcome carries
`Readonly<SandboxSecurityNormalizedSlotResult>` and may enter
`qualifySandboxSecuritySlotEvidence()`. `no_match` and `invalid_result` never
carry `normalized_result` or `qualified_evidence` and never call
`addSlotEvidence()`. Do not invent a normalized result for non-matched statuses.

#### Atomic pure-computation critical sections (locked)

Budget checkpoints are **forbidden** between these steps. If work budget is
observed exhausted, it is observed only at section boundaries (before entry or
after the full section commits).

```text
rule/local matched atomic closure:
  settle matched run + store normalized result
  → qualify
  → record matched SlotEvaluationRecord
  → addSlotEvidence
  → only then check budget

rule/local no_match atomic closure:
  settle no_match run
  → record no_match SlotEvaluationRecord
  → do not qualify
  → do not call addSlotEvidence
  → only then check budget

rule/local invalid_result atomic closure:
  settle invalid_result run
  → record invalid_result SlotEvaluationRecord
  → do not qualify
  → do not call addSlotEvidence
  → only then check budget

Judge external matched atomic closure:
  normalize external result to private handles
  → settle matched run + store normalized result
  → qualify using Judge slot thresholds
  → construct NormalizedJudgeOutcome {
      status: "matched",
      evidence: qualifiedEvidence,
      covered_obligation_ids
    }
  → record matched SlotEvaluationRecord
  → applyJudgeOutcome
  → close()
  → only then check budget

Judge external no_match atomic closure:
  settle no_match run
  → construct no_match NormalizedJudgeOutcome
  → record no_match SlotEvaluationRecord
  → applyJudgeOutcome
  → close()
  → only then check budget

Judge external invalid_result atomic closure:
  settle invalid_result run
  → construct invalid_result NormalizedJudgeOutcome
  → record invalid_result SlotEvaluationRecord
  → applyJudgeOutcome
  → close()
  → only then check budget
```

P3 external normalizer yields matched/no_match/invalid_result boundary shapes
only; it never produces profile-threshold `QualifiedSlotEvidence`. Matched
Judge qualification constructs `NormalizedJudgeOutcome.matched.evidence`.

Therefore Scheme B never observes:
- matched qualified record without addSlotEvidence (rule/local);
- no_match/invalid_result calling qualify or addSlotEvidence;
- Judge record without applyJudgeOutcome;
- settled Judge no_match/invalid_result without applyJudgeOutcome;
- settled Judge no_match/invalid_result routed to terminateJudgeAttempt.

If an implementation still records intermediate progress, it must resume from
that progress; the default locked model is atomic sections above.

#### Epilogue steps (Scheme B order; locked)

1. close active lease and reject late results;

2. terminalize genuinely incomplete slots via RunLedger (no slot remains
   `not_started`; create matching SlotEvaluationRecord for each):
   - active **running** detector → `timeout` / `detector_timeout`
     (no settled boundary outcome; never qualify; real obligation retained);
   - not_started profile-required → obligation `profile_required`,
     status `skipped`, skip_reason `evaluation_terminated` → **unresolved**;
   - not_started already-selected optional → obligation `runtime_required`,
     status `skipped`, skip_reason `evaluation_terminated` → **unresolved**;
   - not_started never-selected optional → obligation `optional_not_selected`,
     status `skipped`, skip_reason `evaluation_terminated` → **no independent
     effect**;

3. complete settled rule/local results lacking SlotEvaluationRecords
   (discriminated; never "qualify" no_match/invalid_result):
   - settled matched lacking record → restricted qualification + matched record
     + addSlotEvidence;
   - settled no_match lacking record → create no_match record only;
   - settled invalid_result lacking record → create invalid_result record only;

4. while escalation lifecycle is still `collecting`:
   `addSlotEvidence` for any settled rule/local **matched** qualified evidence
   not yet applied (idempotent; never double-add; never for no_match/invalid);

5. inspect escalation lifecycle and close/apply exactly once as applicable:

```text
collecting + no unresolved signals
  → closeWithoutJudge()

collecting + unresolved signals, and Judge cannot run
  (absent / sanitizer fail / budget forbids Judge / no settled Judge outcome)
  → terminateJudgeAttempt(evaluation_terminated or concrete reason)
  → resolution_evidence: []

obligations_materialized + settled Judge matched:
  qualify when not already qualified
  → record matched result when absent
  → applyJudgeOutcome(matched)
  → close()

obligations_materialized + settled Judge no_match:
  record no_match when absent
  → applyJudgeOutcome(no_match)
  → close()

obligations_materialized + settled Judge invalid_result:
  record invalid_result when absent
  → applyJudgeOutcome(invalid_result)
  → close()

obligations_materialized + no settled Judge outcome:
  → terminateJudgeAttempt(...)

judge_applied
  → close() only
  → never terminateJudgeAttempt

closed
  → no-op; never mutate
```

6. read final unresolved signals only from closed escalation state;

7. complete one SlotEvaluationRecord per manifest slot (full status union;
   status/error_code/skip_reason must match detector run; slot status from
   RunLedger.snapshot() only);

8. determine exact `SandboxSecurityDecisionBearingBudgetPhase` and create or
   reuse the decision-bearing Engine failure
   `{ code: "evaluation_budget_exhausted", phase }`;

9. **publication via closure progress**:
   not committed → commit restricted one-shot publication once;
   committed → reuse exact token_map + findings; never republish;

10. **RunLedger via snapshot lifecycle + closure progress**:
    open → attachPublishedFindings once → finalize once;
    findings_attached → finalize once;
    finalized → reuse frozen runs; never reopen;

11. reduce using the **same** decision-bearing Engine failure object that will
    enter the ledger (reuse prior reduction inputs where already frozen);

12. **created_at via closure progress**:
    absent → runtime.now once (invalid clock = terminal);
    present → reuse;

13. **ledger**:
    absent → build **once with engine_failure already present**;
    present → create one frozen copy replacing **only** engine_failure
    (must equal reducer input engine_failure);

14. build candidate from reducer output (engine-0001 iff decision-bearing
    failure present);

15. structural normalize once; semantic validate once (full recompute;
    publication via P4-T1 pure verify API);

16. return validated Decision or throw stable content-free internal error.

**Invariant (locked):**

```text
ledger.engine_failure
=== reducerInput.engine_failure
=== failure represented by decision.evidence_refs (engine-0001 when non-null)
```

Engine failure is recorded **before** building or copying the complete ledger.
Epilogue never validates a candidate against a null-failure ledger when the
decision is fail-closed for budget exhaustion.

**Decision-bearing epilogue gate:** after the above, every manifest slot must
have a complete SlotEvaluationRecord and runs must be finalizable or already
finalized. If a complete ledger cannot be built (invalid clock/identity/
materialization), throw — no Decision.

Pre-ID / pre-profile / pre-RunLedger exhaustion returns no Decision.
Epilogue semantic validation failure throws; epilogue never triggers recovery.

Epilogue **forbids** new detector/sanitizer/Judge **calls**, ordinary/
unrestricted qualification, unrestricted republication, ordinary allow/no-risk
paths, a second `nextDecisionId()`, a second `runtime.now()`, retry, and
semantic recovery loops.

#### Closure progress (locked)

Engine maintains evaluation-scoped closure progress (explicit type or equivalent
private state). Scheme B is **not** a blind re-run of late pipeline steps; it
is a resume-or-complete state machine:

```ts
interface SandboxSecurityClosureProgress {
  readonly publication:
    | { readonly state: "not_committed" }
    | {
        readonly state: "committed";
        readonly token_map: SandboxSecurityPublicSubjectTokenMap;
        readonly findings: readonly SandboxSecurityFinding[];
      };
  readonly run_ledger_state:
    | "open"
    | "findings_attached"
    | "finalized";
  readonly created_at: string | null;
  readonly complete_ledger:
    Readonly<SandboxSecurityEvaluationEvidenceLedger> | null;
}
```

Rules:

- each commit transition occurs at most once per evaluation;
- publication, attachment, finalization, and created_at are reused verbatim when
  already committed;
- an existing complete ledger is reused as the immutable base and copied once
  with only engine_failure replaced (never reused verbatim when failure is null
  but the fail-closed Decision requires a decision-bearing failure);
- decision-bearing exhaustion during publication, run_finalization, reduction,
  decision_materialization, or semantic_validation never reopens closed
  RunLedger state or republishes;
- semantic_validation exhaustion reuses complete evidence base and copies the
  ledger with only engine_failure replaced before minimal candidate rebuild.

## Policy Reduction

The reducer has one exact input shape:

```ts
interface SandboxSecurityPolicyReducerInput {
  readonly stage: SandboxSecurityStage;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly findings: readonly SandboxSecurityFinding[];
  readonly detector_runs: readonly SandboxDetectorRun[];
  readonly unresolved_escalation_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly engine_failure:
    Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}
```

No second reducer input shape is permitted. Draft findings, raw snapshots,
provider objects, separate clearance arrays, and ad hoc unresolved booleans are
not reducer input.

| Evidence | Balanced user/model | Balanced tool | Strict user/model | Strict tool |
| --- | --- | --- | --- | --- |
| accepted critical/high | `deny` | `deny` | `deny` | `deny` |
| accepted medium | `ask` | `deny` | `deny` | `deny` |
| accepted low | `alert` | `alert` | `ask` | `deny` |
| no accepted finding and all obligations resolved | `allow` | `allow` | `allow` | `allow` |
| unresolved profile/runtime-required evidence | `ask` | `deny` | `ask` | `deny` |
| Engine-level failure | `ask` minimum | `deny` | `ask` minimum | `deny` |

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

When decision-bearing `engine_failure != null`, verdict is always `indeterminate`; user/model
action is at least `ask` and tool action is `deny`. Existing findings remain in
the decision and their action is combined by maximum restrictiveness, so
accepted high/critical risk still yields `deny`. Successful detector runs do
not imply the overall evaluation resolved.

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

`engines/sandbox/src/security/semantic-validator.ts` receives only the
structurally normalized decision and this frozen exact ledger:

```ts
export interface SandboxSecurityEvaluationEvidenceLedger {
  readonly decision_id: string;
  readonly request_id: string;
  readonly created_at: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly profile:
    Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly subject_map:
    Readonly<SandboxSecurityQualificationSubjectMap>;
  readonly slot_records:
    readonly SandboxSecuritySlotEvaluationRecord[];
  readonly public_subject_token_map:
    Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly routed_obligations:
    readonly SandboxSecurityRoutedObligationRecord[];
  readonly judge_resolution_evidence:
    readonly SandboxSecurityJudgeResolutionEvidence[];
  readonly published_findings:
    readonly SandboxSecurityFinding[];
  readonly detector_runs:
    readonly SandboxDetectorRun[];
  readonly unresolved_escalation_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly engine_failure:
    Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}

/**
 * Engine-internal routed obligation record retaining coverage linkage.
 * Obligation payload fields follow SandboxSecuritySanitizedJudgeObligation.
 */
export interface SandboxSecurityRoutedObligationRecord
  extends SandboxSecuritySanitizedJudgeObligation {
  readonly signal_subject_key: string;
  readonly signal_category: SandboxSecurityRiskCategory;
}

export function validateSandboxSecurityDecisionSemantics(
  decision: Readonly<SandboxSecurityDecision>,
  ledger: Readonly<SandboxSecurityEvaluationEvidenceLedger>
): Readonly<SandboxSecurityDecision>;
```

There is no second authoritative `slot_evidence` array. `qualified_evidence`
inside each slot record is a cache under validation, never trusted input.

The validator must recompute matched-slot qualification from
`record.normalized_result` + profile thresholds + decision ID + subject map,
and must verify the full slot-record union:

```text
exactly one record per manifest slot in profile order
record.status === detector_run.status for every slot
failed: record.error_code === detector_run.error_code
invalid_result: record.error_code === detector_run.error_code
timeout: detector_run.error_code === detector_timeout
skipped: record.skip_reason === detector_run.skip_reason
matched/no_match: no error_code and no skip_reason on record or run terminal fields
matched: recompute qualification from normalized_result (ignore cache)
non-matched: zero accepted findings; no normalized_result/qualified_evidence
public tokens/findings: verify via P4-T1 pure
  validateSandboxSecurityPublication / deriveSandboxSecurityExpectedPublication
  (no committed re-publication; no ownership copy of token algorithm)
```

exactly:

- accepted risks;
- DraftFindings;
- qualified clearances;
- routing-floor risks;
- discarded count;
- subject keys;
- finding IDs;
- routed signals;
- Judge resolution and obligation coverage;
- public tokens;
- published findings;
- detector finding ownership;
- reducer result (verdict/action/risk/floor);
- one ordered run per manifest slot and obligation/status consistency;
- decision-bearing Engine failure code/phase, action floor, and engine-0001;
- decision ID, request ID, created-at format, mode, stage, profile, evidence refs.

It must not trust record `qualified_evidence` as authoritative. Ledger
`engine_failure` accepts only decision-bearing failures. The validator
directly requires candidate `decision_id` to equal ledger `decision_id`,
including clean decisions. It validates the already-recorded single publication
pass and never republishes findings.

Semantic recovery belongs only to the normal work path while remaining work
budget exists. Structural normalization failure records
`decision_materialization_invalid` internally and immediately raises
`sandbox_security_internal_invalid`; it does not attempt recovery. If and only
if the initially normalized candidate fails semantic validation and normal work
budget remains, the Engine:

1. reruns no detector, input/detector normalization boundary, qualification,
   token materialization, or finding publication;
2. calls neither `nextDecisionId()` nor `runtime.now()` again;
3. creates one new frozen recovery ledger by copying the original ledger and
   replacing only `engine_failure` with
   `{code:"semantic_validation_failed", phase:"semantic_validation"}`;
4. calls the reducer once with the recovery ledger's same profile, findings,
   runs, and unresolved signals;
5. builds one recovery candidate with the same decision/request IDs,
   `created_at`, findings, runs, and ordered finding evidence, then appends the
   exact `engine-0001` evidence marker;
6. structurally normalizes and semantically validates that candidate once.

If normal semantic validation observes work-budget exhaustion, enter the
fail-closed epilogue instead of recovery. Recovery steps remain under the
normal work budget; exhaustion during recovery terminates into the epilogue.
Epilogue minimal semantic validation failure throws and never triggers recovery.
A valid recovery candidate is recursively frozen and returned. Normalization or
semantic failure of the recovery candidate raises
`sandbox_security_internal_invalid`; no third candidate, recursion, or
unvalidated decision is allowed.

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
- `adapter_unsupported`

Engine failure codes are the closed
`SandboxSecurityEngineFailureCode` union defined above and are never attached
to detector runs.

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

```ts
export function createSandboxSecurityMonitorDecisionAdapter(
  deps: Readonly<{
    engine: SandboxSecurityEngine;
    policy_profile_id: SandboxSecurityPolicyProfileId;
    buildEvaluationRequest: (
      input: Readonly<MonitorDecisionInput>,
      policyProfileId: SandboxSecurityPolicyProfileId
    ) => Readonly<SandboxSecurityEvaluationRequest>;
  }>
): MonitorDecisionProvider;
```

The trusted `buildEvaluationRequest` mapper constructs submission and
authoritative context together so source IDs, order, values, and provenance
cannot diverge. `decide(input)` calls the mapper once and Engine once, then maps
the already-reduced action to a new `MonitorDecisionProposal` with policy ID
`policy://sandbox/security/monitor-adapter/v1`, the closed content-free reason
mapping below, and a defensive copy of decision evidence refs (or `[]` for
caught internal errors). It never returns `engine.evaluate(request)` directly,
never pre-normalizes, and never reduces again. Mapper/Engine/mapping failure
returns stage fail-closed action with the adapter-caught mapping:
`ask` for `model_output`, `deny` for `tool_request`. The Monitor contract remains
unchanged; `reason_code` is an unconstrained non-empty string there, so the
adapter may emit the closed codes below without modifying Monitor contracts.

Closed Monitor reason mapping (content-free; no raw exception, model, or tool
text):

| Decision / path | reason_code | reason | evidence_refs |
| --- | --- | --- | --- |
| `risk_detected` | first final finding's `reason_code` in finding order | `Sandbox security risk detected.` | defensive copy of decision.evidence_refs |
| `no_detected_risk` | `sandbox_security_no_detected_risk` | `No sandbox security risk was detected.` | defensive copy of decision.evidence_refs |
| `indeterminate` | `sandbox_security_evaluation_indeterminate` | `Sandbox security evaluation was incomplete.` | defensive copy of decision.evidence_refs |
| adapter-caught internal error | `sandbox_security_internal_invalid` | `Sandbox security evaluation failed closed.` | `[]` |

`risk_detected` without at least one finding is an invalid decision and must not
be mapped as a successful risk proposal.

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
- Phase 2 authority-bound content contains no trust class; profile trust rules
  are the only trust derivation authority and reject unknown combinations.

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
- strict missing local profile-resolution failure (registry/engine construction
  still succeed; evaluate(strict) fails before decision ID; zero detectors);
- registry construction permits missing local; engine construction permits a
  registry without local; balanced rule-only registry evaluates normally;
- low-confidence unresolved escalation routing;
- accepted risk plus clearance does not suppress or automatically route;
- Judge risk adds evidence, matching qualified clearance resolves only the
  routed signal, and no-match/partial/low-confidence Judge output remains
  unresolved;
- routed optional becomes runtime-required before availability check;
- sanitizer failure causes zero Judge calls and fail closed;
- per-slot effective timeout and 5000 ms normal work budget from engine entry plus one bounded fail-closed epilogue;
- normalization/hashing/sanitization consume the 5000 ms normal work budget;
- caller cancellation differs from budget exhaustion;
- late results are discarded even when detector ignores AbortSignal;
- timer anomalies cannot produce allow;
- candidate, clearance, result, sanitized payload, token, depth/node, and Judge
  response exact boundary tests;
- nonempty low-confidence result is `matched`; double-empty result is
  `no_match`;
- unknown/stale/wrong-kind content/tool token and invalid tool locator reject;
- Judge receives nonempty routed obligations only; every result item binds an
  existing obligation with matching category and covered scope;
- omitted obligations remain unresolved, while unknown/cross-evaluation or
  outside-routed obligation results are invalid;
- run ledger covers every legal transition and rejects terminal mutation,
  premature/cross-slot finding ID attachment, and every illegal transition;
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
- Engine failure produces `indeterminate`, never rewrites successful runs, and
  emits only the exact `engine-0001` evidence marker;
- decision ID and created-at are each minted once; final evidence refs and the
  normalize-then-semantic-validate materialization order are exact;
- balanced medium rule evidence does not short-circuit configured local;
  strict medium does; balanced/strict low never short-circuit;
- rule short-circuit closes escalation (closeWithoutJudge or
  terminateJudgeAttempt risk_short_circuit) before publication;
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
- Monitor mapper builds submission and authority together, calls Engine once,
  maps to a new proposal, and fails closed without returning Engine decision;
- unsupported adapter path emits `adapter_unsupported` and fails closed;
- nine-case action matrix and published contracts remain stable;
- generic core static scans reject network/filesystem/process/model/backend/UI,
  benchmark oracle, console, and dynamic rule loading imports.

## Verification Commands

Planned focused gates:

```bash
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

```bash
npm run test:shared
npm run test:engine:sandbox
npm run test:repo
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
5. external detector types cannot receive raw snapshots and Judge cannot run
   without nonempty, Engine-issued routed obligations;
6. both immutable manifests exactly match this spec;
7. exact candidate/clearance/result contracts, exact canonical obligation-scope
   equality, omission-only partial Judge coverage, tool/content subjects,
   identity, uniqueness, and sorting are deterministic;
8. the canonical private subject helper is the only `subject_key` authority and
   is shared by raw, external, and qualification boundaries;
9. the run-ledger factory prebuilds every manifest slot and finalizes them in
   manifest order with valid obligation/status/skip/error summaries and
   publication-time finding-ID backfill;
10. required/runtime-required failure cannot produce allow;
11. timeout, cancellation, late result, active-detector timeout, post-detector
    Engine-budget failure, and exact Engine-failure code/phase compatibility are
    tested;
12. profile manifests are the sole trust derivation authority;
13. semantic validator rejects forged selected-profile run/finding/reduction
    state, while manifest/property tests own cross-profile monotonicity;
14. decision identity, created-at capture, evidence ordering, normalization,
    one bounded semantic-recovery attempt, freezing, and Engine-failure floors
    follow the single materialization path;
15. decisions contain no raw/sanitized content or ordinary content hashes;
16. Engine-owned canonical fingerprint boundary prevents backend JCS
    duplication and content-derived durable fields;
17. Track 1 legacy actions/contracts and existing byte gates remain stable;
18. focused and full required gates pass with no new waiver;
19. documentation is updated and the requirement stops for review.

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
