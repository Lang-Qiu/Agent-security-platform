# REQ-SBX-GENERAL-001 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`.
> Execute only the task explicitly assigned by the user, return its evidence,
> and do not continue automatically.
>
> **Canonical plan set:** This Master plus the five Phase plans are the only
> implementation authority for REQ-SBX-GENERAL-001. Do not rely on any older
> plan revision, chat summary, or external inventory.
>
> **REAPPROVAL GATE:** Both canonical Specs are
> `DRAFT_REVISED_PENDING_REAPPROVAL`. No implementation task may start until the
> user explicitly reapproves both documents. Active sprint remains unchanged.

**Goal:** Implement strict general-purpose sandbox security contracts and a
deterministic in-process evaluation core for authoritative user-input,
model-output, and tool-request observations.

**Architecture:** Trusted adapters construct approved
`SandboxSecurityEvaluationRequest` envelopes. `SandboxSecurityEngine.evaluate()`
starts the normal 5000 ms work budget immediately (+ bounded Scheme B epilogue after exhaustion), then runs engine-internal
normalize/authority validation, mints a private branded
`NormalizedSandboxSecurityEvaluationRequest`, builds prepared input + raw
snapshot views, runs detectors, qualifies evidence, escalates Judge only for
unresolved routing risks, reduces, and validates. Track 1 remains behind
compatibility adapters and a **balanced-only** test-only regression harness.

**Tech Stack:** Node.js `>=22.19.0` on **WSL Linux**, TypeScript ESM with native
type stripping for runtime tests, real TypeScript compiler typecheck via
frontend `typescript@6.0.2` JS entry, `node:test`, `node:assert/strict`,
`node:crypto`, RFC 8785/JCS in-repository, `AbortController`, no new production
dependency.

---

## WSL Execution Environment

Execute only in **WSL/Linux**, never Windows PowerShell.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short
uname -a
command -v node
command -v npm
command -v git
node -p 'process.platform'
node --version
npm --version
test -f ./frontend/node_modules/typescript/bin/tsc
test "$(node -p 'process.platform')" = "linux"
for cmd in node npm git; do
  path="$(command -v "$cmd")"
  case "$path" in
    *.exe|*.cmd|*.bat|/mnt/c/*|/mnt/d/*)
      echo "Windows interop path not allowed for $cmd: $path" >&2
      exit 1
      ;;
  esac
done
```

Notes: reject Windows interop paths; do not reject Linux tools merely because
the repo lives under `/mnt/e/<repo>`. Missing tsc: stop; no install; no lockfile
change. `/mnt/*` slowness must not change the 5000 ms product budget. Exit gates
run `git diff --check`, `git diff --summary`, `git status --short`. Never modify
global `core.autocrlf`, `core.filemode`, WSL mounts, or line-ending policy.

```bash
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
```

## Canonical Inputs

- Specs: `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`,
  `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- Rules: `AGENTS.md`, `metadata.md`
- Shared index: `shared/index.ts` (historical; GENERAL-001 additive only)
- Sprint: `docs/sprint-current.md` (still `REQ-T1-DEMO-010` until user switches)
- Monitor contracts: `engines/sandbox/src/monitoring/contract.ts`
- Track 1: `engines/sandbox/src/base-filter/*`

Implementation must not start until both revised Specs are explicitly
reapproved and the user switches active sprint to `REQ-SBX-GENERAL-001`. This
document-only revision does neither.

---

## Core evaluate / authority model (locked)

Approved Spec adapter-facing request:

```ts
export interface SandboxSecurityEvaluationRequest {
  submission: Readonly<SandboxSecurityRequest>;
  authoritative_context:
    Readonly<SandboxSecurityAuthoritativeEvaluationContext>;
}
```

Engine:

```ts
export interface SandboxSecurityEngine {
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    callerSignal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
```

Internal (never exported):

```ts
declare const sandboxSecurityEvaluationRequestBrand: unique symbol;

type NormalizedSandboxSecurityEvaluationRequest = {
  readonly submission: SandboxSecurityRequest;
  readonly authoritative_context: SandboxSecurityAuthoritativeEvaluationContext;
  readonly [sandboxSecurityEvaluationRequestBrand]: true;
};

function normalizeSandboxSecurityEvaluationRequest(
  value: unknown
): Readonly<NormalizedSandboxSecurityEvaluationRequest>;
```

```text
adapter constructs SandboxSecurityEvaluationRequest
1. evaluate(request, callerSignal?)
2. start monotonic normal work budget immediately (5000 ms)
3. internal request normalization + authority validation + private brand mint
4. prepareSandboxSecurityInput (limits/JCS/hash)
5. resolve profile
6. create one run ledger from the selected profile, then resolve detectors
7. derive trust through profile trust_rules and create frozen raw snapshot with
   the full profile manifest
8a. confirm remaining work budget; if exhausted → terminal pre_id_evaluation_budget_exhausted
8b. call nextDecisionId exactly once
8c. validate decision ID grammar; invalid → terminal decision_identity_invalid
8d. immediately re-check remaining work budget; if exhausted →
    decision-bearing evaluation_budget_exhausted phase=decision_identity,
    zero detector calls, enter Scheme B epilogue
9–12. apply the **unified slot branch table only when each slot becomes eligible**
    (do not pre-terminalize later slots before short-circuit / routing):
    1. rule;
    2. evaluate rule short-circuit;
    3. local only when not short-circuited and applicable;
    4. Judge only when routed.
    Before detector call for an eligible slot:
    - profile-required selected → markStarted(profile_required);
    - optional selected → markStarted(runtime_required);
    - optional absent → markSkipped(optional_not_selected,
      optional_not_configured) + skipped SlotEvaluationRecord;
    - configured but routing false → markSkipped(optional_not_selected,
      routing_not_selected) + skipped SlotEvaluationRecord;
    After started attempt (discriminated atomic; only matched qualifies /
    addSlotEvidence):
    - matched: settle matched + store normalized result → qualify → record
      matched SlotEvaluationRecord → addSlotEvidence → only then budget check;
    - no_match: settle no_match → record no_match SlotEvaluationRecord → do not
      qualify → do not call addSlotEvidence → only then budget check;
    - invalid_result: settle invalid_result → record invalid_result
      SlotEvaluationRecord → do not qualify → do not call addSlotEvidence →
      only then budget check;
    - throw/reject: markFailed(detector_failed) + failed record; no qualify;
      immediately re-check normal work budget → exhausted → Scheme B; else
      continue policy;
    - slot timeout: lease termination_reason work_budget → Scheme B (wins
      simultaneous expiry); slot_timeout → markTimeout() + timeout record;
      immediately re-check budget → exhausted → Scheme B; else continue policy;
    Continue policy: rule failed/timeout does not short-circuit and continues to
    applicable local; local failed/timeout preserves rule evidence/signals;
    required failures remain unresolved independently
13. evaluate rule short-circuit (only from accepted matched rule risk)
14. if short-circuited:
    - mark remaining **not-yet-terminal** slots with exact obligations + skipped
      records (never invent runtime_required; never second terminal transition):
        profile-required → profile_required + skipped + risk_short_circuit;
        optional never selected → optional_not_selected + skipped +
          risk_short_circuit;
    - do not materialize routed obligations; do not call sanitizer/Judge;
    - while collecting: no signals → closeWithoutJudge();
      unresolved signals → terminateJudgeAttempt({reason:"risk_short_circuit"})
      (preserves unrelated signals; same category+subject_key already suppressed);
    - read final unresolved signals only from closed state;
    - continue at publication (step 23)
15. otherwise complete applicable local via the unified slot branch table only
    when local becomes eligible
16–19. (folded into steps 9–12 / 15 for local)
20. read unresolved escalation signals
21. when none exist, closeWithoutJudge; terminalize unrouted Judge as skipped
    (optional_not_configured or routing_not_selected) with skipped record;
    call neither sanitizer nor Judge
22. when signals exist, make Judge runtime_required and markStarted **before**
    sanitizer/Judge attempt; derive external token registry; materialize routed
    obligations once; sanitize and validate obligations/tokens/scope; then:
    - success: call Judge; **discriminated Judge atomic critical section**:
      matched qualifies and constructs NormalizedJudgeOutcome.evidence;
      no_match/invalid_result construct outcome without qualification;
      applyJudgeOutcome → close(); only then budget check;
    - failure without NormalizedJudgeOutcome (unavailable / sanitizer fail /
      throw / timeout): terminalize Judge run + matching SlotEvaluationRecord
      (detector_unavailable | external_redaction_failed | detector_failed |
      detector_timeout), then terminateJudgeAttempt (signals unresolved); no
      qualification; no applyJudgeOutcome; continue to publication;
    P4-T6 performs no risk/clearance/coverage matching
23. after ALL slots are terminal, one SlotEvaluationRecord per manifest slot
    (Engine-owned precondition; not RunLedger API), and after escalation is
    closed, collect DraftFindings and accepted underlying entities; materialize
    one public token map exactly once; publish all public findings exactly once
24. attachPublishedFindings then finalize ordered detector runs through P4-T3
    RunLedger once.
    Engine precondition before finalize: one SlotEvaluationRecord per manifest
    slot already exists (P4-T5/P4-T6 ownership; RunLedger does not receive or
    validate records).
    RunLedger.finalize itself validates: all run slots terminal + attachment
    phase completed + ledger transition legality only.
25. reduce with exact profile/mode/stage, published findings, finalized runs,
    unresolved signals, and Engine failure; reducer never receives DraftFinding
26. call runtime.now exactly once; validate created_at; build complete frozen
    EvaluationEvidenceLedger (slot_records, not slot_evidence alone)
27. build candidate decision, structurally normalize, then semantic-validate it
    against the ledger (recomputing qualification from boundary outcomes)
28. recursively freeze and return the content-free normalized decision
29. drop raw snapshot, registries, and ephemeral bytes

On normal work budget exhaustion after valid decision ID:
  at most one Scheme B fail-closed epilogue (
    settled matched rule/local: restricted-qualify + record + addSlotEvidence;
    settled no_match/invalid_result: record only, never qualify;
    settled Judge matched|no_match|invalid_result: applyJudgeOutcome + close;
    never convert settled Judge no_match/invalid_result to terminateJudgeAttempt;
    closure-progress reuse; Engine failure recorded before ledger build/copy;
    present complete_ledger → one frozen copy replacing only engine_failure;
    ledger.engine_failure === reducerInput.engine_failure;
    running-on-expiry is timeout and never qualified;
    not claimed inside exhausted 5000 ms work budget)
On exhaustion before profile/RunLedger/valid decision ID:
  no Decision; stable content-free error; adapter fail closed
```

Rules: no pre-branded public evaluate parameter; no double full authority
normalize; adapters never call internal normalizer; authority mismatch → zero
detector calls; fingerprint reuses internal normalizer + JCS (separate budget).

Decision materialization is exact: `nextDecisionId()` once after profile,
RunLedger, detector resolution, trust, snapshot, and remaining-budget check—
immediately before detector execution; `now()` once after normal reduction and
before complete ledger construction. Order:

```text
publication → attachPublishedFindings → finalize runs → reduction →
runtime.now → complete ledger → candidate → normalize → semantic validate → freeze
```

All IDs/tokens/obligations/evidence share that decision ID. Decision evidence
refs are ordered finding refs followed by, when present,
`evidence://sandbox/security/<decision-id>/engine-0001`, with ordered dedupe; a
clean decision has `[]`.
Invalid `runtime.now()` output records `runtime_clock_invalid` with phase
`decision_materialization` internally and cannot construct a complete ledger or
candidate; no Decision is returned and the adapter fails closed. Structural
decision-normalizer failure records `decision_materialization_invalid` and raises
the stable internal error without recovery.

Semantic recovery is allowed exactly once on the normal work path after an
initially normalized candidate fails validation while remaining work budget
exists. The Engine creates a frozen copy of the ledger with only
`engine_failure` replaced by
`{code:"semantic_validation_failed", phase:"semantic_validation"}`, reruns the
reducer once with the same profile/findings/runs/signals, rebuilds one candidate
with the same IDs/created_at/publication outputs plus `engine-0001`, then
normalizes and validates once. It never reruns detectors, qualification,
token materialization, publication, `nextDecisionId()`, or `runtime.now()`.
If normal semantic validation observes work-budget exhaustion, enter the
fail-closed epilogue instead of recovery. Epilogue never triggers recovery.
Recovery failure raises `sandbox_security_internal_invalid`; no recursion or
unvalidated candidate is returned.

Normal work budget exhaustion while a detector is active terminates that run as
`timeout`. Not-yet-started required or already-selected optional slots retain
their real obligation (`profile_required` / `runtime_required`) and are
unresolved under `skipped + evaluation_terminated`. Never-selected optional
slots use `optional_not_selected + evaluation_terminated` and have no
independent policy effect. Exhaustion after valid decision ID enters one bounded
fail-closed epilogue that is not claimed to complete inside the exhausted
5000 ms work budget. Exhaustion before profile/RunLedger/valid ID issuance
returns no Decision; the stable content-free error is fail-closed by the
embedding adapter.
Any Engine failure yields `indeterminate`, user/model action at least `ask`, and
tool action `deny`, without lowering stricter accepted-risk action.
Normalization/authority failure, pre-ID work-budget exhaustion, and invalid
decision identity occur before a valid public namespace; they raise a stable
content-free error and adapters fail closed without a decision. They never
trigger a second ID call or fake ID.

---

## Internal prepared input contracts (locked; P2-T3 authority-bound, P3-T5 trust)

Trust class strings are **Spec-exact**:

```ts
export type SandboxSecurityTrustClass =
  | "control"
  | "user_supplied"
  | "external_untrusted"
  | "generated_untrusted";
```

Trust is not derived in Phase 2. P3-T5's immutable profile `trust_rules` are the
sole authority and `deriveSandboxSecurityTrustClass` rejects unknown pairs.

Private handles (engine-internal brands; constructors never exported):

```ts
declare const sandboxSecuritySourceHandleBrand: unique symbol;
declare const sandboxSecurityCallHandleBrand: unique symbol;

export type SandboxSecuritySourceHandle =
  string & { readonly [sandboxSecuritySourceHandleBrand]: true };

export type SandboxSecurityCallHandle =
  string & { readonly [sandboxSecurityCallHandleBrand]: true };
```

Handle generation:

```text
evaluation_nonce = 128-bit cryptographically random lowercase hex
evaluation_nonce grammar = ^[a-f0-9]{32}$
source_handle = "hsrc:" + evaluation_nonce + ":" + four_digit_ordinal
source_handle grammar = ^hsrc:[a-f0-9]{32}:(000[1-9]|00[1-5][0-9]|006[0-4])$
call_handle = "hcall:" + evaluation_nonce + ":0000"
call_handle grammar = ^hcall:[a-f0-9]{32}:0000$
```

Source ordinals follow source semantic order and run from `0001` through at
most `0064`. Every evaluation mints a different nonce. Duplicate handles in an
evaluation, malformed handles, and cross-evaluation handles are invalid.

```ts
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
  /** Frozen ordinary byte vector: integers 0..255 only; defensive copy. */
  readonly original_utf8_bytes: readonly number[];
  readonly original_value_sha256: string;
  readonly comparison_value: string | SandboxSecurityJsonValue;
}

/** P3-T5 derives this only after profile resolution. */
export interface SandboxSecurityNormalizedContent
  extends SandboxSecurityAuthorityBoundContent {
  readonly trust_class: SandboxSecurityTrustClass;
}

export interface SandboxSecurityNormalizedToolRequest {
  readonly call_handle: SandboxSecurityCallHandle;
  readonly call_id: string;
  readonly authority_kind: "integration_observation" | "simulation_observation";
  readonly tool_name: string;
  readonly target?: string;
  readonly arguments: SandboxSecurityJsonValue;
  readonly arguments_jcs_sha256: string;
  readonly has_target: boolean;
}

export interface SandboxSecurityPreparedInput {
  readonly evaluation_nonce: string;
  readonly request_id: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly policy_profile_id: SandboxSecurityPolicyProfileId;
  readonly contents: readonly SandboxSecurityAuthorityBoundContent[];
  readonly tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  readonly canonical_projection: Readonly<SandboxSecurityCanonicalEvaluationProjection>;
  readonly canonical_projection_sha256: string;
}

export function prepareSandboxSecurityInput(
  request: Readonly<NormalizedSandboxSecurityEvaluationRequest>
): Readonly<SandboxSecurityPreparedInput>;

/** P2-T3 sole owner. Returns a fresh Engine-owned ephemeral Uint8Array. */
export function encodeSandboxSecurityCanonicalProjection(
  projection: Readonly<SandboxSecurityCanonicalEvaluationProjection>
): Uint8Array;
```

Byte ownership (locked):

```text
PreparedInput is recursively frozen.
Ephemeral Uint8Array values are not members of PreparedInput and are not
claimed to be frozen.
original_utf8_bytes: readonly number[] (0..255 integers); defensive copy at
  create; ordinary array recursively frozen; byte-range locators use length of
  this vector; never public finding/decision/log
canonical projection bytes: produced only by encodeSandboxSecurityCanonicalProjection;
  each call returns a new array; function-local ephemeral; not stored on
  PreparedInput; not on raw snapshot; not in registry; not returned to detectors;
  fingerprint port receives an independent copy; drop all references after callback
  and after evaluate settlement
```

Security boundaries:

```text
source_id / call_id: visible on prepared input and raw snapshot for raw-local
  detectors and sanitizer only; never on public findings/decisions
provenance_ref: visible to raw-local/sanitizer; never public decision/findings
value / original_utf8_bytes: raw-local + sanitizer only; never external Judge
comparison_value: detector-only NFKC/comparison view; never changes hashes
original_value_sha256 / arguments_jcs_sha256: engine-private ordinary hashes;
  never enter public findings, decisions, or durable audit
handles: evaluation-bound; never public; constructors/brands never exported
external evaluation tokens: sanitizer/Judge temporary tokens; evaluation-scoped;
  never enter public decision
public finding tokens: post-qualification materialize via
  materializeSandboxSecurityPublicSubjectTokens + publishSandboxSecurityFindings
  from private handles (source://... / call://...); may enter public finding/decision;
  never reuse external etok:* tokens
```

Never export from `security/index.ts`: PreparedInput, AuthorityBoundContent,
NormalizedContent,
NormalizedTool, handle brands, `prepareSandboxSecurityInput`,
`encodeSandboxSecurityCanonicalProjection`, registries, NormalizedSlotResult,
AcceptedRiskEvidence, EvidenceLedger, DeadlineController internals,
`materializeSandboxSecurityPublicSubjectTokens`,
`publishSandboxSecurityFindings`,
`SandboxSecurityPublicSubjectTokenMap`, `SandboxSecurityDraftFinding`,
`SandboxSecurityAcceptedSubjectEntity`.

---

## Raw detector snapshot (locked; P3-T1 owns type; Engine creates view)

```ts
export interface SandboxSecurityRawDetectorSnapshot {
  readonly request_id: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly contents: readonly SandboxSecurityNormalizedContent[];
  readonly tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  readonly canonical_request_sha256: string;
}
```

Relation: Engine builds a **frozen readonly view** after profile resolution from
`SandboxSecurityPreparedInput` + resolved `SandboxSecurityPolicyProfileManifest`.
No `policy_profile_id` field (use `snapshot.profile.profile_id`). No canonical
projection bytes. No mutable registries. No public finding tokens. Passed only
to `RawLocalDetector` and `SandboxSecuritySanitizer`. External Judge never
receives this type. Snapshot type and profile manifest types are exported in D;
private handle constructors and brands are not.

Engine order constraint:

```text
prepare input → resolve profile → resolve detectors → create raw snapshot
  containing full frozen profile manifest → run detectors
```

Never create raw snapshot before profile resolution.

---

## Result validation contexts (locked)

### P3-T3 owns raw subject registry (frozen exact-key arrays)

```ts
export interface SandboxSecurityRawContentSubject {
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly media_type: "text/plain" | "application/json";
  readonly original_utf8_bytes: readonly number[];
  readonly value: string | SandboxSecurityJsonValue;
}

export interface SandboxSecurityRawToolSubject {
  readonly call_handle: SandboxSecurityCallHandle;
  readonly has_target: boolean;
  readonly arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecurityRawSubjectRegistry {
  readonly evaluation_nonce: string;
  readonly content_subjects: readonly SandboxSecurityRawContentSubject[];
  readonly tool_subject?: Readonly<SandboxSecurityRawToolSubject>;
}

/** Unified private-handle result after boundary normalize (raw or external). */
export interface SandboxSecurityNormalizedSlotResult {
  readonly candidates:
    readonly SandboxSecurityRiskCandidate<
      SandboxSecurityCandidateSubjectRef
    >[];
  readonly clearances:
    readonly SandboxSecurityCategoryClearance<
      SandboxSecurityCandidateSubjectRef
    >[];
}

export type SandboxSecurityNormalizedDetectorResult =
  | {
      status: "matched";
      result: Readonly<SandboxSecurityNormalizedSlotResult>;
    }
  | { status: "no_match" }
  | {
      status: "invalid_result";
      error_code: "detector_result_invalid" | "detector_content_leak";
    };

export function normalizeSandboxSecurityRawDetectorResult(
  value: unknown,
  registry: Readonly<SandboxSecurityRawSubjectRegistry>
): Readonly<SandboxSecurityNormalizedDetectorResult>;

export type SandboxSecurityCanonicalPrivateSubjectScope =
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

export function canonicalizeSandboxSecurityPrivateSubjectScopes(
  refs: readonly SandboxSecurityCandidateSubjectRef[]
): readonly SandboxSecurityCanonicalPrivateSubjectScope[];

export function computeSandboxSecuritySubjectKey(input: {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_refs:
    readonly SandboxSecurityCandidateSubjectRef[];
}): string;
```

Must reject: unknown/wrong-kind/cross-evaluation handle; target absent; invalid
UTF-8 byte range; invalid JSON pointer; duplicate scope; candidate+clearance
same-scope; >8 refs; >32 candidates/clearances; >64 KiB result.

On success, `matched` result subjects are private handle refs only.
P4 qualification receives only `SandboxSecurityNormalizedSlotResult` (never
external tokens).

P3-T3 owns `subject-scope.ts` and the two helpers. Duplicate scopes reject;
sorting makes ref order irrelevant; category is identity and slot ID is not.
P3-T4 and P4-T1 import these helpers and never implement subject identity.

### P3-T4 owns external token registry (frozen arrays) + Engine-issued tokens

Approved Spec sanitizer signature (fixed; do not change Spec):

```ts
sanitize(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  routed_obligations:
    readonly SandboxSecuritySanitizedJudgeObligation[],
  signal: AbortSignal
): Promise<SandboxSecuritySanitizedJudgePayload>;
```

Tokens are **engine-issued** and deterministic from the snapshot so the
sanitizer port can emit the same tokens without a second Spec argument:

```ts
export interface SandboxSecurityExternalSourceTokenEntry {
  readonly source_token: string;
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly media_type: "text/plain" | "application/json";
}

export interface SandboxSecurityExternalCallTokenEntry {
  readonly call_token: string;
  readonly tool_name_token: string;
  readonly call_handle: SandboxSecurityCallHandle;
  readonly has_target: boolean;
}

export interface SandboxSecurityExternalTokenRegistry {
  readonly evaluation_nonce: string;
  readonly request_token: string;
  readonly source_tokens: readonly SandboxSecurityExternalSourceTokenEntry[];
  readonly call_token?: Readonly<SandboxSecurityExternalCallTokenEntry>;
}

export interface SandboxSecuritySanitizedJudgeObligation {
  readonly obligation_id: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_refs:
    readonly SandboxSecurityExternalCandidateSubjectRef[];
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

// tool_name_token is an Engine-issued token. target/arguments are bounded
// sanitizer-produced values; no parallel tool-name representation exists.

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

/**
 * Sole deterministic issuance. Engine and recording sanitizer MUST call this.
 * Sanitizer implementations do not freely choose tokens.
 * Engine-internal only (not in C/D). Public index never exports this helper.
 */
export function deriveSandboxSecurityExternalTokenRegistry(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): Readonly<SandboxSecurityExternalTokenRegistry>;

/**
 * Engine-internal only. Must run AFTER sanitize and BEFORE any Judge.detect.
 * Input is untrusted sanitizer output (unknown) — do NOT cast to payload first.
 * Returns defensive-copy frozen validated payload for Judge.detect only.
 * Failure → external_redaction_failed; ZERO Judge calls.
 * Checks: exact-key, registry equality, bounds, stage/profile/target, no raw metadata.
 * Distinct from assertSanitizedJudgePayloadBounds (size/depth/nodes only).
 */
export function validateSandboxSecuritySanitizedJudgePayload(
  payload: unknown,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>,
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  expected_obligations:
    readonly SandboxSecuritySanitizedJudgeObligation[]
): Readonly<SandboxSecuritySanitizedJudgePayload>;

export function assertSanitizedJudgePayloadBounds(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): void;
// size / depth / nodes only — not registry equality

export type SandboxSecurityNormalizedExternalDetectorResult =
  | {
      status: "matched";
      result: Readonly<SandboxSecurityNormalizedSlotResult>;
      covered_obligation_ids: readonly string[];
    }
  | { status: "no_match" }
  | {
      status: "invalid_result";
      error_code: "detector_result_invalid" | "detector_content_leak";
    };

export function normalizeSandboxSecurityExternalDetectorResult(
  value: unknown,
  registry: Readonly<SandboxSecurityExternalTokenRegistry>,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityNormalizedExternalDetectorResult>;
```

Token lifecycle (locked):

```text
1. Engine derives ExternalTokenRegistry once via
   deriveSandboxSecurityExternalTokenRegistry(snapshot)
2. P4-T2 materializes deterministic obligations from unresolved signals using
   decision_id and the Engine token registry
3. Engine calls sanitizer.sanitize(snapshot, obligations, signal)
4. Engine MUST call:
     const validatedPayload =
       validateSandboxSecuritySanitizedJudgePayload(
         sanitizerOutput, registry, snapshot, obligations)
     BEFORE any Judge.detect
   Failure → external_redaction_failed; ZERO Judge calls
   Engine passes ONLY validatedPayload to Judge.detect
5. Judge receives nonempty validated routed_obligations and returns items bound
   to those obligation IDs only
6. normalizeSandboxSecurityExternalDetectorResult validates obligation/category,
   maps tokens to private handles, and requires exact canonical scope equality
7. Qualification never sees external tokens
8. P4-T2 alone applies Judge outcome and preserves uncovered signals
9. Public finding tokens minted later via
   materializeSandboxSecurityPublicSubjectTokens — never reuse etok:*
```

GENERAL-002 access lock:

```text
GENERAL-002 uses final index exports for all detector contracts, with exactly
one documented deep-import exception:
sanitized-boundary.ts#deriveSandboxSecurityExternalTokenRegistry.
Repository gates: only GENERAL-002 sanitizer may import that one symbol;
must not import token registry type, validator, normalizer, or other internals;
other production modules must not use this exception.
Public index still never-exports derive helper.
validateSandboxSecuritySanitizedJudgePayload is engine-internal only.
assertSanitizedJudgePayloadBounds = size/depth/nodes only;
validateSandboxSecuritySanitizedJudgePayload = exact-key + registry equality +
  bounds + stage/profile/target + no raw metadata; input unknown; returns frozen
  validated payload.
```

Deterministic token formula (evaluation-scoped; not forgeable across evaluations):

```text
evaluation_nonce grammar = ^[a-f0-9]{32}$
source handles must be hsrc:<nonce>:0001..0064
call handle, when present, must be hcall:<nonce>:0000
reject malformed, duplicate, or cross-evaluation handles before derivation
request_token = "etok:req:" + evaluation_nonce
source_token  = "etok:src:" + evaluation_nonce + ":" + four_digit_ordinal
  call_token    = "etok:call:" + evaluation_nonce + ":0000"
  tool_name_token = "etok:tool-name:" + evaluation_nonce + ":0000"
  max 67 tokens (1 request + ≤64 sources + 1 call + 1 tool-name)
never reused after evaluate settles
```

Partial coverage (Judge external result) — **omission only**:

```text
returned category + canonical scope exactly equals obligation → validate/apply
subject-ref order may differ after canonical sorting
subset / superset / locator widening or narrowing → invalid_result
routed signals covered by Judge result → may resolve
routed signals not mentioned → remain unresolved
token/scope outside routed payload → invalid_result
unknown/stale/cross-evaluation/wrong-kind token → invalid_result
target-absent / oversize response → invalid_result
```

Do **not** reject legal partial coverage.

Export: registries, derive helper, validate helper, bounds assert, normalize
functions, NormalizedSlotResult are **engine-internal only**. GENERAL-002 uses
ports + payload/result types only (except the sole approved deep-import of
`deriveSandboxSecurityExternalTokenRegistry` above); never invents free tokens.

---

## Registry / profile resolution model (locked)

Construction does **not** know profile; profile resolution is separate.

```ts
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

export function createSandboxSecurityDetectorRegistry(
  input: Readonly<SandboxSecurityDetectorRegistryInput>
): SandboxSecurityDetectorRegistry;
```

Construction: `rule` required; exact keys only; no detector identity fields;
freeze/capture implementations; **does not** require local for strict.

```ts
export interface SandboxSecurityResolvedDetectorRegistry {
  readonly rule: RawLocalDetector;
  readonly local?: RawLocalDetector;
  readonly judge?: SanitizedExternalDetector;
  readonly required_slot_ids: readonly SandboxSecurityDetectorSlotId[];
}

// ENGINE-INTERNAL only — not in C
export function resolveSandboxSecurityDetectorsForProfile(
  registry: Readonly<SandboxSecurityDetectorRegistry>,
  profile: Readonly<SandboxSecurityPolicyProfileManifest>
): Readonly<SandboxSecurityResolvedDetectorRegistry>;
```

```text
balanced: rule required; local optional; Judge optional before routing
strict: rule + local required; missing local → stable resolution error
  (not registry construction error)
Judge absent before routing: OK
Judge routed by unresolved escalation → runtime_required;
  absent Judge → detector_unavailable fail-closed
slot identity from profile manifest only
stage/kind/access must match profile slot
```

Exported in C: `createSandboxSecurityDetectorRegistry`,
`resolveSandboxSecurityProfile` only.
**Not exported:** `resolveSandboxSecurityDetectorsForProfile`,
`SandboxSecurityResolvedDetectorRegistry`.

---

## Qualification → escalation data flow (locked)

### Canonical subject key (P3-T3 helper; P4-T1 imports)

```text
subject_key = sha256_hex(
  JCS({
    category,
    subjects: sorted_canonical_private_subject_scopes
  })
)

scope forms:
  { kind:"content_source", source_handle, locator }
  { kind:"tool_request", call_handle, component, locator? }
```

Slot ID is **evidence origin only**, never part of signal identity.
P4-T1 must call `computeSandboxSecuritySubjectKey`; it cannot duplicate this
algorithm.

### P4-T1 output

```ts
export interface SandboxSecurityAcceptedRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly finding_id: string;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

export interface SandboxSecurityQualifiedClearance {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly confidence: number;
}

export interface SandboxSecurityRoutingRiskEvidence {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

/** Engine-internal only: private handles, no public tokens or evidence_refs. */
export interface SandboxSecurityDraftFinding {
  readonly finding_id: string;
  readonly detector_id: SandboxSecurityDetectorSlotId;
  readonly detector_version: string;
  readonly category: SandboxSecurityRiskCategory;
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
  readonly subject_key: string;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
}

export interface SandboxSecurityQualifiedSlotEvidence {
  readonly source_slot_id: SandboxSecurityDetectorSlotId;
  readonly accepted_risks: readonly SandboxSecurityAcceptedRiskEvidence[];
  readonly accepted_draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly qualified_clearances: readonly SandboxSecurityQualifiedClearance[];
  readonly routing_risks: readonly SandboxSecurityRoutingRiskEvidence[];
  readonly discarded_count: number;
}

/**
 * Private-handle map only. NO pre-minted public tokens on this map.
 * Qualification never receives external evaluation tokens.
 */
export interface SandboxSecurityQualificationSubjectMap {
  readonly evaluation_nonce: string;
  readonly sources: readonly {
    readonly source_handle: SandboxSecuritySourceHandle;
  }[];
  readonly tool?: Readonly<{
    readonly call_handle: SandboxSecurityCallHandle;
  }>;
}

/**
 * Sole public finding token mint. Called once AFTER all rule/local/Judge
 * qualification and before public findings are finalized for the decision.
 * Grammar (Spec-exact):
 *   source://sandbox/security/<decision-id>/<four-digit-ordinal>
 *   call://sandbox/security/<decision-id>/<four-digit-ordinal>
 * Never reuses external evaluation tokens (etok:*).
 */
export interface SandboxSecurityPublicSubjectTokenMap {
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

export type SandboxSecurityAcceptedSubjectEntity =
  | {
      readonly kind: "content_source";
      readonly source_handle: SandboxSecuritySourceHandle;
    }
  | {
      readonly kind: "tool_request";
      readonly call_handle: SandboxSecurityCallHandle;
    };

export function materializeSandboxSecurityPublicSubjectTokens(input: {
  readonly decision_id: string;
  readonly accepted_entities: readonly SandboxSecurityAcceptedSubjectEntity[];
}): Readonly<SandboxSecurityPublicSubjectTokenMap>;

/**
 * Rewrites draft finding subject_refs from private handles to Spec public tokens,
 * then sorts and assigns evidence_refs. Draft findings never leave Engine evaluate.
 * Accepts only the separate internal DraftFinding type and constructs a new
 * exact public Finding; no public Finding ever temporarily holds handles.
 */
export function publishSandboxSecurityFindings(input: {
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly decision_id: string;
}): readonly SandboxSecurityFinding[];

export function deriveSandboxSecurityExpectedPublication(input: {
  readonly decision_id: string;
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
}): Readonly<{
  token_map: SandboxSecurityPublicSubjectTokenMap;
  findings: readonly SandboxSecurityFinding[];
}>;

export function validateSandboxSecurityPublication(input: {
  readonly decision_id: string;
  readonly draft_findings: readonly SandboxSecurityDraftFinding[];
  readonly actual_token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly actual_findings: readonly SandboxSecurityFinding[];
}): void;
// Pure; P4-T5 calls for recompute; one committed publication per evaluation

export function qualifySandboxSecuritySlotEvidence(input: {
  slot: Readonly<SandboxSecurityDetectorSlotManifest>;
  /** Always private-handle subjects after raw/external boundary normalize. */
  result: Readonly<SandboxSecurityNormalizedSlotResult>;
  decision_id: string;
  subject_map: Readonly<SandboxSecurityQualificationSubjectMap>;
}): SandboxSecurityQualifiedSlotEvidence;
// accepted_draft_findings use private handles only; no public Finding exists yet
```

Public finding token materialization (locked; P4-T1 sole owner):

```text
1. qualifySandboxSecuritySlotEvidence accepts only private-handle subjects
   via QualificationSubjectMap (NO pre-minted public tokens on the map)
2. determine accepted risk candidates for the slot
3. after ALL rule/local/Judge qualification, collect accepted DraftFindings
4. extract underlying entities only:
     content_source -> { kind, source_handle }
     tool_request   -> { kind, call_handle }
   locator, component, category, severity, reason_code, slot and finding_id do
   not participate in public token identity
5. reject duplicate handles in the token-map input; deduplicate entity refs
   before that input by source_handle/call_handle
6. sort entities by kind, then private-handle byte order; source and call share
   one global sequence; assign four-digit ordinals starting at 0001
7. source subjects → source://sandbox/security/<decision-id>/<ordinal>
   tool subjects → call://sandbox/security/<decision-id>/<ordinal>
8. call materializeSandboxSecurityPublicSubjectTokens exactly once per evaluation
9. call publishSandboxSecurityFindings exactly once after Judge qualification;
   it requires input decision_id == token_map.decision_id, verifies full map
   coverage, rewrites handles while preserving locator and component, and
   recursively freezes the exact public Finding array
10. sort final findings (severity desc, category, detector_id, reason_code,
   canonical public subject refs, finding_id)
11. assign exactly one evidence ref per final finding after sort:
    evidence://sandbox/security/<decision-id>/<four-digit-ordinal>, starting 0001
12. detector-supplied evidence refs are rejected/ignored; drafts have none
13. routing-only, clearance-only, discarded subjects receive NO public token
14. external etok:* tokens are NEVER accepted or reused as public tokens
15. same decision_id + same accepted entity set → identical public tokens;
    different decision_id → different tokens

DraftFinding is an exact internal type, never an alias/Omit of public Finding.
It has private subject refs, no public token, and no evidence_refs. It never
uses the shared public finding normalizer and never reaches reducer/decision.
```

Rules:

```text
- every accepted DraftFinding has paired accepted risk evidence (private subject_key)
- public finding tokens minted only after accepted-risk qualification via
  materializeSandboxSecurityPublicSubjectTokens (never pre-supplied)
- accepted risk evidence never enters public decision
- clearances never delete accepted findings
- only routing-floor risks (without accepted same-scope risk) create signals
- below-floor discarded
- qualification never receives external evaluation tokens
- QualifiedSlotEvidence always carries source_slot_id (even when empty arrays)
- AcceptedRiskEvidence ↔ exactly one DraftFinding ↔ exactly one public Finding;
  subject_key, finding/detector identity, category, severity, confidence,
  reason_code, and canonical subject refs agree
```

Engine post-qualify path (P4-T6):

```text
qualifySandboxSecuritySlotEvidence returns:
  - accepted_risks (private subject_key)
  - accepted_draft_findings (private handles; no public Finding fields)
  - qualified_clearances + routing_risks + discarded_count + source_slot_id
Engine (P4-T6) after all slots:
  1. finish rule/local/Judge qualification and Judge resolution
  2. collect all drafts and deduplicated underlying entities
  3. materializeSandboxSecurityPublicSubjectTokens exactly once
  4. publishSandboxSecurityFindings exactly once
  5. reduce and semantic-validate using published findings only
```

### P4-T2 escalation state

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

/**
 * Exact discriminated union. Owned in escalation-state.ts by P4-T2.
 * P4-T5 imports this type; does not redeclare a looser shape.
 */
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
  | {
      readonly kind: "no_match";
    }
  | {
      readonly kind: "low_confidence_unresolved";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
    }
  | {
      readonly kind: "invalid_result";
      readonly error_code: "detector_result_invalid" | "detector_content_leak";
    };

export type SandboxSecurityNormalizedJudgeOutcome =
  | {
      readonly status: "matched";
      readonly evidence: Readonly<SandboxSecurityQualifiedSlotEvidence>;
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
  /** resolution_evidence: []; no judge_terminated kind */
  terminateJudgeAttempt(input: Readonly<{
    reason: SandboxSecurityJudgeTerminationReason;
  }>): Readonly<SandboxSecurityJudgeApplicationResult>;
  closeWithoutJudge(): void;
  close(): void;
}

export function createSandboxSecurityEscalationState():
  SandboxSecurityEscalationState;
```

```text
lifecycle call-once:
  collecting: addSlotEvidence only; materializeRoutedObligations once;
    closeWithoutJudge if no signals; terminateJudgeAttempt once -> closed
  obligations_materialized: forbid addSlotEvidence; applyJudgeOutcome once
    -> judge_applied; terminateJudgeAttempt once -> closed
  judge_applied: close once -> closed (mandatory after applyJudgeOutcome)
  closed: all mutation fails; unresolved signals read only from closed state

Normal path: applyJudgeOutcome -> close -> read final unresolved signals
Failure without NormalizedJudgeOutcome: terminateJudgeAttempt once

rule/local accepted risk → suppress same category+subject_key routing signal
rule/local routing risk → create/merge signal by category+subject_key
rule/local clearance → disagreement only; cannot resolve signal; cannot delete finding
Judge accepted risk → applyJudgeOutcome resolves matching obligation and
  preserves accepted DraftFinding
Judge qualified clearance → applyJudgeOutcome resolves matching obligation and
  never removes finding
Judge partial coverage → covered may resolve; uncovered remain unresolved;
  evidence kind "partial_coverage"
Judge no_match / low-confidence / uncovered → applyJudgeOutcome keeps signals
  unresolved
stale/wrong-scope / outside routed payload → invalid_result / unresolved
covered_obligation_ids only from this evaluation's routed set; no duplicates
```

P4-T6 never matches obligation/signal identity and never constructs partial,
low-confidence, no-match, or invalid-result resolution evidence.

### P4-T3 run ledger

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
  markMatched(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markNoMatch(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markFailed(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code:
      | "detector_unavailable"
      | "detector_failed"
      | "external_redaction_failed"
      | "adapter_unsupported";
  }>): void;
  markTimeout(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markInvalidResult(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code: "detector_result_invalid" | "detector_content_leak";
  }>): void;
  attachPublishedFindings(
    findings: readonly SandboxSecurityFinding[]
  ): void;
  finalize(): readonly SandboxDetectorRun[];
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

`snapshot()` is the sole canonical read API for Scheme B slot status and
RunLedger lifecycle. Exact transitions are `not_started -> skipped|running` and
`running -> matched|no_match|failed|timeout|invalid_result`; terminal status is
immutable. Factory construction prebuilds every manifest slot in order and
captures its ID/version/kind; foreign slots reject. After all slots are terminal
and public findings are published, `attachPublishedFindings` is called once:
group by `finding.detector_id`, only `matched` runs receive non-empty IDs,
duplicates/foreign/unknown/non-matched attachment fail, finding ID order equals
relative global finding order. `finalize()` requires every slot terminal and
prior attachment phase, preserves manifest order, then closes the ledger.
Opaque finding IDs alone never prove producer ownership.

### P4-T4 reducer input

```ts
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

export type SandboxSecurityTerminalEngineErrorCode =
  | "decision_identity_invalid"
  | "runtime_clock_invalid"
  | "decision_materialization_invalid"
  | "pre_id_evaluation_budget_exhausted";

export type SandboxSecurityEngineFailureCode =
  | SandboxSecurityDecisionBearingEngineFailure["code"]
  | SandboxSecurityTerminalEngineErrorCode;

export type SandboxSecurityEngineFailurePhase =
  | "normalization"
  | "authority"
  | "input_preparation"
  | "profile_resolution"
  | "trust_derivation"
  | "snapshot_construction"
  | SandboxSecurityDecisionBearingBudgetPhase;

export type SandboxSecurityEngineFailure =
  SandboxSecurityDecisionBearingEngineFailure;

export interface SandboxSecurityPolicyReducerInput {
  stage: SandboxSecurityStage;
  evaluation_mode: "simulation" | "enforcement";
  profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  findings: readonly SandboxSecurityFinding[];
  detector_runs: readonly SandboxDetectorRun[];
  unresolved_escalation_signals: readonly SandboxSecurityEscalationSignal[];
  engine_failure: Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}
```

Reducer accepts **only decision-bearing** failures. Terminal errors
(`decision_identity_invalid`, `runtime_clock_invalid`,
`decision_materialization_invalid`, `pre_id_evaluation_budget_exhausted`) never
enter reducer/ledger/public Decision. Budget exhaustion records the exact
`SandboxSecurityEngineFailurePhase` whose budget check observed it.

No duplicate reducer shape, DraftFinding, raw snapshot, provider object,
clearance array, or ad hoc unresolved boolean.

### P4-T5 semantic validator + evidence ledger

```ts
// SandboxSecurityJudgeResolutionEvidence exact union is owned by P4-T2 in
// escalation-state.ts; P4-T5 imports it (does not redeclare).

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

export interface SandboxSecurityRoutedObligationRecord
  extends SandboxSecuritySanitizedJudgeObligation {
  readonly signal_subject_key: string;
  readonly signal_category: SandboxSecurityRiskCategory;
}

export interface SandboxSecurityEvaluationEvidenceLedger {
  readonly decision_id: string;
  readonly request_id: string;
  readonly created_at: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly subject_map: Readonly<SandboxSecurityQualificationSubjectMap>;
  readonly slot_records: readonly SandboxSecuritySlotEvaluationRecord[];
  readonly public_subject_token_map:
    Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly routed_obligations:
    readonly SandboxSecurityRoutedObligationRecord[];
  readonly judge_resolution_evidence:
    readonly SandboxSecurityJudgeResolutionEvidence[];
  readonly published_findings: readonly SandboxSecurityFinding[];
  readonly detector_runs: readonly SandboxDetectorRun[];
  readonly unresolved_escalation_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly engine_failure:
    Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}

export function validateSandboxSecurityDecisionSemantics(
  decision: Readonly<SandboxSecurityDecision>,
  ledger: Readonly<SandboxSecurityEvaluationEvidenceLedger>
): Readonly<SandboxSecurityDecision>;
```

Validator input is ledger + candidate decision. There is no second authoritative
`slot_evidence` array. `qualified_evidence` is a cache under validation, never
authoritative input. The ledger records the frozen result of P4-T1's sole
materialize/publish pass; the validator must not invoke either publication
function a second time. It first directly requires
`decision.decision_id === ledger.decision_id`, including clean decisions.

It must recompute matched-slot qualification from `normalized_result` + profile
thresholds + decision ID + subject map, and verify:
exactly one record per manifest slot in profile order;
`record.status === detector_run.status`;
matched recomputes qualification (ignore cache);
non-matched contribute zero accepted findings.
Also validates created_at, run obligations, decision-bearing Engine failure
floor, and every public decision field.
Ledger is Engine-internal; never exported; never durable audit; content-free
private scope keys only; no raw values after settlement. Ledger carries
`request_id` + `evaluation_mode` for mode/stage/profile forgery checks.

---

## Production file unique ownership (locked)

| Production file | Sole owner |
| --- | --- |
| `shared/types/sandbox-security.ts` | P1-T1 |
| `shared/contracts/sandbox-security-request.ts` | P1-T2 |
| `shared/contracts/sandbox-security.ts` | P1-T3 |
| `shared/index.ts` | P1-T4 (GENERAL-001 additions only) |
| `engines/sandbox/tsconfig.json` | P1-T4 |
| `canonical-json.ts` | P2-T1 |
| `source-authority.ts` | P2-T2 |
| `input-boundary.ts` | P2-T3 |
| `locator.ts` | P2-T4 |
| `canonical-fingerprint.ts` | P2-T5 |
| `detector-contract.ts` | P3-T1 |
| `subject-scope.ts` | P3-T3 |
| `detector-output-boundary.ts` | P3-T3 |
| `sanitized-boundary.ts` | P3-T4 |
| `policy-profiles.ts` | P3-T5 |
| `detector-registry.ts` | P3-T6 |
| `finding-qualification.ts` | P4-T1 |
| `escalation-state.ts` | P4-T2 |
| `runtime-deadline.ts` | P4-T3 |
| `run-ledger.ts` | P4-T3 |
| `policy-reducer.ts` | P4-T4 |
| `semantic-validator.ts` | P4-T5 |
| `engine.ts` | P4-T6 (execution orchestration only) |
| `security/index.ts` | P5-T4 |
| `adapters/monitor-decision-provider.ts` | P5-T1 |
| `adapters/track1-rule-matches.ts` | P5-T2 |

**No** `detector-pipeline.ts`. Tests may be modified by multiple later tasks when
listed. Every production source has one create/modify owner; later tasks do not
patch earlier contracts (stop + rework owner).

---

## Monitor adapter exact contract (locked; P5-T1)

Repo fact (`engines/sandbox/src/monitoring/contract.ts`):

```ts
export type MonitorDecisionStage = "model_output" | "tool_request";

export interface MonitorDecisionInput {
  stage: MonitorDecisionStage;
  session: Readonly<MonitorSessionContext>;
  subject_event_id: string;
  model_input: Readonly<MonitorModelRequest>;
  model_output: Readonly<MonitorModelResponse>;
  tool_request?: Readonly<SimulatedToolRequest>;
}

export interface MonitorDecisionProposal {
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  reason: string;
  evidence_refs: string[];
}

export interface MonitorDecisionProvider {
  decide(
    input: Readonly<MonitorDecisionInput>
  ): MonitorDecisionProposal | Promise<MonitorDecisionProposal>;
}
```

P5-T1 factory (does **not** modify monitor contracts):

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

```text
build submission + authoritative context together ONLY via
  deps.buildEvaluationRequest(input, deps.policy_profile_id)
mapper output must be enforcement and match input stage/profile exactly
one engine.evaluate(request) only; never return that Decision as proposal,
  pre-normalize, second-reduce, or invent undefined signal
map decision.action → proposal.action
policy_id: "policy://sandbox/security/monitor-adapter/v1"
closed reason mapping (content-free; no raw exception/model/tool text):
  risk_detected:
    reason_code = first final finding.reason_code in finding order
    reason = "Sandbox security risk detected."
    evidence_refs = defensive copy of decision.evidence_refs
    (risk_detected with zero findings is invalid decision)
  no_detected_risk:
    reason_code = "sandbox_security_no_detected_risk"
    reason = "No sandbox security risk was detected."
    evidence_refs = defensive copy of decision.evidence_refs
  indeterminate:
    reason_code = "sandbox_security_evaluation_indeterminate"
    reason = "Sandbox security evaluation was incomplete."
    evidence_refs = defensive copy of decision.evidence_refs
  adapter-caught internal error:
    reason_code = "sandbox_security_internal_invalid"
    reason = "Sandbox security evaluation failed closed."
    evidence_refs = []
    model_output → action "ask"
    tool_request → action "deny"
Monitor contract remains unchanged (reason_code is free non-empty string).
no raw content, provenance, hashes, or handles in proposal
```

---

## Global Worker Handoff Prompt

```text
Execute only the assigned REQ-SBX-GENERAL-001 task in the current WSL worktree.
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT"
test "$(node -p 'process.platform')" = "linux"
test -f ./frontend/node_modules/typescript/bin/tsc
Read AGENTS.md, metadata.md, docs/sprint-current.md, both 2026-07-10 specs,
master plan, phase plan, assigned task.
Design -> Test -> Implement -> Document -> Stop.
bash only; npm run ...; tsc via node ./frontend/node_modules/typescript/bin/tsc
evaluate receives SandboxSecurityEvaluationRequest; budget before internal normalize.
Never export NormalizedSandboxSecurityEvaluationRequest / brand / internal normalizer.
Never invent public *Input request types. One task, one commit, listed paths only.
```

## Global TDD Rules

1. No production behavior before listed RED.
2. Strengthen tests that pass before implementation.
3. Untrusted object tests cover unknown/inherited/accessor/prototype.
4. Fail-closed tests assert action/verdict and zero downstream effects.
5. Raw-content tests inject unique sentinels across returned surfaces.
6. Behavior tests do not load external data files into production core.
7. Shared normalizers structural only; semantics in engine.
8. Routed optional detector is runtime-required before availability check.
9. One task, one commit; never `git add .`.
10. Stop after every task/phase for review.
11. Empty `test("name", () => {})` inventories must be filled before RED.
12. Typecheck via Node+JS tsc entry only; probes not imported by Node tests.
13. Typecheck green is not RED for probe tasks.
14. No dependency install; no CRLF/file-mode config surgery.
15. P5-T4 only closes exports; never renames APIs frozen by earlier tasks.
16. Every task is self-contained in its phase plan; do not consult old plans.
17. No production file dual ownership or conditional co-location wording.
18. Later tasks stop on earlier-contract defects; no silent patch.

## Master Baseline Gate

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT"
test "$(node -p 'process.platform')" = "linux"
test -f ./frontend/node_modules/typescript/bin/tsc
for cmd in node npm git; do
  path="$(command -v "$cmd")"
  case "$path" in *.exe|*.cmd|*.bat|/mnt/c/*|/mnt/d/*) exit 1;; esac
done
npm run test:shared
npm run test:engine:sandbox
npm run test:repo
```

## TypeScript / sandbox tsconfig (locked)

P1-T4 creates focused `engines/sandbox/tsconfig.json` (include security + tests +
types + harness helper) and typecheck anchor
`engines/sandbox/tests/types/sandbox-security-typecheck-anchor.ts` with
`export {}`. P3-T2 formal probe is separate; missing formal probe still RED.

## Phase DAG

```text
P1 shared contracts → P2 authority/canonical → P3 detectors/profiles
→ P4 qualification/engine → P5 compatibility/closure
26 tasks: 4+5+6+6+5
```

Phase 3 internal execution order (locked):

```text
P3-T5 → P3-T1 → P3-T2 → P3-T3 → P3-T4 → P3-T6
```

P3-T5 profile manifests must exist before P3-T1/T2 typecheck against snapshot
profile types.

## Spec Coverage Matrix

| Area | Owner |
| --- | --- |
| Public A/B incl. ReasonCode | P1-T1–T3 |
| Shared exports + sandbox tsconfig + anchor | P1-T4, P5-T4 |
| JCS | P2-T1 |
| Internal authority normalizer + branded request | P2-T2 |
| PreparedInput / authority-bound content/tool / handles / 512 KiB | P2-T3 |
| Locators | P2-T4 |
| Fingerprint service | P2-T5 |
| Detector ports + RawDetectorSnapshot + result types | P3-T1 |
| Compile-time isolation probe | P3-T2 |
| Subject-scope helper + raw subject registry + raw result normalize | P3-T3 |
| Obligated Judge payload + external token registry/result normalize/validate | P3-T4 |
| Profile resolution + sole trust derivation + TrustRule/ActionMatrix | P3-T5 |
| Registry construction + resolveDetectorsForProfile (internal) | P3-T6 |
| Qualification + finding identity + public token materialize/publish | P4-T1 |
| Escalation obligations + sole Judge outcome application | P4-T2 |
| Runtime deadline lease ports + run ledger state machine | P4-T3 |
| Exact reducer input + Engine failure | P4-T4 |
| Semantic validator + complete evidence ledger | P4-T5 |
| Orchestration + identity/time decision materialization only | P4-T6 |
| Monitor adapter exact | P5-T1 |
| Track1 rule adapter 0.80 | P5-T2 |
| Balanced harness | P5-T3 |
| Export close | P5-T4 |
| Docs | P5-T5 |

## Fixed decisions (summary)

- Authority equality: text exact UTF-8; JSON JCS only
- Profile budget field: `normal_work_budget_ms`; prose term: normal work budget
- Deadline lease API (P4-T3): createDetectorLease({slot_timeout_ms, parent_signal?});
  `termination_reason` is an exact closed union:
  `slot_timeout | work_budget | caller_cancelled | null`.
  The legacy token `total_budget` is forbidden in production code, tests,
  fixtures, documentation examples, and type unions. `work_budget` wins
  simultaneous slot+budget expiry; dispose/closeGeneration
- Track1 confidence 0.80; harness balanced.v1 only
- adapters/ only monitor + track1 files; no production oracle
- Registry construction ≠ profile resolution
- Subject key helper owned by P3-T3; category + JCS(sorted private scopes), no slot ID
- Rule/local clearances never resolve Judge signals; a qualified matching Judge
  clearance resolves only its obligation and never deletes accepted findings
- Snapshot carries full frozen profile manifest; profile resolved before snapshot
- original_utf8_bytes = frozen readonly number[]; PreparedInput has no Uint8Array
- External tokens Engine-issued deterministic; never public finding tokens
- Public finding tokens minted post-qualification via materialize+publish; Spec grammar
- QualificationSubjectMap private handles only
- validateSanitizedJudgePayload(unknown) returns frozen payload
- QualifiedSlotEvidence.source_slot_id always present
- Judge payload carries deterministic routed obligations; results bind obligation IDs
- Partial Judge coverage legal; uncovered obligations remain unresolved
- applyJudgeOutcome is the sole Judge resolution API
- createSandboxSecurityRunLedger({profile}) is the sole run-ledger constructor
- JudgeResolutionEvidence is exact discriminated union (P4-T2 owns; P4-T5 imports)
- EvaluationEvidenceLedger includes identity/time/publication/obligations/runs/failure
- Semantic validator uses full EvaluationEvidenceLedger
- Pre-Judge validateSandboxSecuritySanitizedJudgePayload mandatory; failure →
  external_redaction_failed; zero Judge calls
- Routed absent Judge → detector_unavailable at Engine (P4-T6), not P3-T6
- Routed Judge + missing sanitizer → external_redaction_failed; zero Judge calls
- Monitor: trusted mapper builds one EvaluationRequest; adapter maps one Engine
  Decision to a new proposal and fails closed on every error
- Phase 3 DAG: P3-T5 before P3-T1/T2 typecheck
- Phase 5 top D == P5-T4 EXPECTED_ENGINE_TYPE_EXPORTS == Master D

## Exact export allowlist (locked)

### A Shared runtime

```ts
SANDBOX_SECURITY_STAGES
SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES
SANDBOX_SECURITY_RISK_CATEGORIES
SANDBOX_SECURITY_POLICY_PROFILE_IDS
SANDBOX_SECURITY_SEVERITIES
SANDBOX_SECURITY_VERDICTS
SANDBOX_SECURITY_ACTIONS
SANDBOX_SECURITY_MAX_TEXT_BYTES
SANDBOX_SECURITY_MAX_REQUEST_BYTES
SANDBOX_SECURITY_MAX_CONTENT_ITEMS
SANDBOX_SECURITY_MAX_JSON_DEPTH
SANDBOX_SECURITY_MAX_JSON_NODES
normalizeSandboxSecurityRequest
normalizeSandboxSecurityFinding
normalizeSandboxDetectorRun
normalizeSandboxSecurityDecision
```

### B Shared types

```ts
SandboxSecurityStage
SandboxSecurityClaimedSourceType
SandboxSecurityPolicyProfileId
SandboxSecurityRiskCategory
SandboxSecuritySeverity
SandboxSecurityVerdict
SandboxSecurityAction
SandboxSecurityReasonCode
SandboxSecurityJsonValue
SandboxSecuritySubmittedContentItem
SandboxSecurityToolRequest
SandboxSecurityRequest
SandboxSecurityContentLocator
SandboxSecurityToolLocator
SandboxSecurityFindingSubjectRef
SandboxSecurityFinding
SandboxDetectorRunObligation
SandboxDetectorRunStatus
SandboxDetectorSkipReason
SandboxDetectorRunErrorCode
SandboxDetectorRun
SandboxSecurityDecision
```

### C Engine runtime

```ts
createSandboxSecurityEngine
createSandboxSecurityCanonicalFingerprintService
createSandboxSecurityMonitorDecisionAdapter
createTrack1RuleMatchDetectorAdapter
resolveSandboxSecurityProfile
createSandboxSecurityDetectorRegistry
```

### D Engine types

```ts
SandboxSecurityEvaluationRequest
SandboxSecurityAuthoritativeEvaluationContext
AuthenticatedSourceObservation
AuthenticatedToolObservation
SandboxSecurityEngine
SandboxSecurityRuntimePorts
SandboxSecurityCanonicalFingerprintPort
SandboxSecurityCanonicalFingerprintService
SandboxSecurityDetectorRegistry
SandboxSecurityDetectorRegistryInput
RawLocalDetector
SandboxSecuritySanitizer
SanitizedExternalDetector
SandboxSecurityRawDetectorSnapshot
SandboxSecurityRiskCandidate
SandboxSecurityCategoryClearance
SandboxSecurityRawDetectorResult
SandboxSecurityExternalDetectorResult
SandboxSecurityExternalRiskCandidate
SandboxSecurityExternalCategoryClearance
SandboxSecuritySanitizedJudgePayload
SandboxSecuritySanitizedJudgeObligation
SandboxSecurityCandidateSubjectRef
SandboxSecurityExternalCandidateSubjectRef
SandboxSecurityPolicyProfileManifest
SandboxSecurityDetectorSlotManifest
SandboxSecurityDetectorSlotId
SandboxSecurityTrustClass
SandboxSecurityTrustRule
SandboxSecurityActionByStage
SandboxSecurityActionMatrix
```

### Never export (E)

```text
normalizeSandboxSecurityEvaluationRequest
NormalizedSandboxSecurityEvaluationRequest
sandboxSecurityEvaluationRequestBrand
prepareSandboxSecurityInput
encodeSandboxSecurityCanonicalProjection
SandboxSecurityPreparedInput
SandboxSecurityAuthorityBoundContent
SandboxSecurityNormalizedContent
deriveSandboxSecurityTrustClass
SandboxSecurityNormalizedToolRequest
SandboxSecuritySourceHandle brand / CallHandle brand
SandboxSecurityRawSubjectRegistry
SandboxSecurityExternalTokenRegistry
deriveSandboxSecurityExternalTokenRegistry
validateSandboxSecuritySanitizedJudgePayload
assertSanitizedJudgePayloadBounds
normalizeSandboxSecurityRawDetectorResult
normalizeSandboxSecurityExternalDetectorResult
SandboxSecurityNormalizedSlotResult
SandboxSecurityCanonicalPrivateSubjectScope
canonicalizeSandboxSecurityPrivateSubjectScopes
computeSandboxSecuritySubjectKey
SandboxSecurityAcceptedRiskEvidence
SandboxSecurityQualifiedSlotEvidence
SandboxSecurityDraftFinding
SandboxSecurityAcceptedSubjectEntity
SandboxSecurityEscalationState
SandboxSecurityEscalationLifecycle
SandboxSecurityEvaluationEvidenceLedger
SandboxSecuritySlotEvaluationRecord
SandboxSecurityRoutedObligationRecord
SandboxSecurityJudgeTerminationReason
SandboxSecurityDecisionBearingEngineFailure
SandboxSecurityDecisionBearingBudgetPhase
SandboxSecurityTerminalEngineErrorCode
SandboxSecurityEngineFailureCode
SandboxDetectorFailedRunErrorCode
deriveSandboxSecurityExpectedPublication
validateSandboxSecurityPublication
validateSandboxSecurityDecisionSemantics
SandboxSecurityEngineFailure
SandboxSecurityEngineFailurePhase
SandboxSecurityRunLedger
createSandboxSecurityRunLedger
SandboxSecurityRunLedgerLifecycle
SandboxSecurityRunLedgerSlotSnapshot
SandboxSecurityRunLedgerSnapshot
SandboxSecurityNormalizedJudgeOutcome
SandboxSecurityJudgeApplicationResult
SandboxSecurityJudgeResolutionEvidence
SandboxSecurityDeadlineController / DetectorLease internals
resolveSandboxSecurityDetectorsForProfile
SandboxSecurityResolvedDetectorRegistry
materializeSandboxSecurityPublicSubjectTokens
publishSandboxSecurityFindings
SandboxSecurityPublicSubjectTokenMap
qualification / semantic-validator private modules as exports
harness / tests/
```

## Cross-Phase Contract Freeze

Phase 1 freezes A/B. Phase 2 freezes authority, prepared input, handles, JCS.
Phase 3 freezes detector ports, registries, profile, registry construction +
internal profile detector resolution. Phase 4 freezes qualify/escalate/reduce/
semantic/evaluate. Phase 5 freezes monitor/Track1/harness/exports/docs.
Earlier defect → stop + owning-task rework.

Phase 4 ownership is strict:
P3-T3: subject-scope.ts, detector-output-boundary.ts
P3-T4: sanitized-boundary.ts
P4-T1: qualification / DraftFinding / publication + pure publication verify APIs
P4-T2: escalation lifecycle / obligation state / Judge application
P4-T3: runtime-deadline.ts, run-ledger.ts (attachPublishedFindings)
P4-T4: reducer
P4-T5: slot evaluation records / evidence ledger / semantic validator
  (recomputes qualification from normalized_result; uses P4-T1 pure
  publication verify; never trusts cache; never commits publication)
P4-T6: sequencing only — must not recompute qualification, verify producer
  ownership, implement RunLedger transitions, copy Judge coverage, copy token
  identity, invent semantic records, or bypass bounded epilogue APIs.

## Required Evidence Per Task

```text
Task / Commit / Files / WSL platform / Node / tsc entry /
RED cmd+valid failure / GREEN / typecheck / broader gates /
git diff --check|--summary / sentinel / dirty files / Status
```

## Plan Review Checklist

- [ ] Every P*-T* self-contained (Files, RED inventory, RED/GREEN cmds, git add, commit)
- [ ] No vague cross-reference or conditional ownership wording
- [ ] Every production file has one sole create/modify owner
- [ ] No later task patches an earlier task's production file
- [ ] PreparedInput recursively frozen; original_utf8_bytes readonly number[]; no Uint8Array fields
- [ ] encodeSandboxSecurityCanonicalProjection owns ephemeral bytes
- [ ] Raw snapshot has full profile manifest; no policy_profile_id duplicate; profile before snapshot
- [ ] External tokens Engine-issued deterministic; map to private handles; not public tokens
- [ ] Routed obligations are nonempty for Judge and external results bind exact IDs/scopes
- [ ] P3-T3 alone owns canonical private scope and subject_key helpers
- [ ] Public finding tokens minted post-qualification via materialize+publish; Spec grammar
- [ ] QualificationSubjectMap private handles only
- [ ] validateSanitizedJudgePayload(unknown) returns frozen payload
- [ ] QualifiedSlotEvidence.source_slot_id always present
- [ ] Raw/external normalize both yield NormalizedSlotResult
- [ ] Legal partial coverage allowed; outside-routed invalid
- [ ] AcceptedRiskEvidence + obligation-bound applyJudgeOutcome locked
- [ ] P4-T3 RunLedger factory prebuilds manifest slots; ledger alone owns
  transitions, skip reasons, obligations, order, and attachPublishedFindings
- [ ] P4-T4 reducer has exactly seven fields including Engine failure
- [ ] Work budget 5000 ms + one bounded fail-closed epilogue; epilogue not inside exhausted budget claim
- [ ] nextDecisionId after snapshot + remaining budget; now() before complete ledger
- [ ] Semantic validator uses EvaluationEvidenceLedger with slot_records and recomputes qualification
- [ ] Deadline createDetectorLease with slot_timeout_ms
- [ ] Routed absent Judge / missing sanitizer at P4-T6
- [ ] Monitor trusted mapper builds one request; one evaluate; Decision maps to a new proposal
- [ ] Registry construction separate from profile resolution; registry/engine
  construction require rule only; strict missing local fails at profile
  resolution (sandbox_security_profile_invalid) before decision ID
- [ ] D includes profile manifest types; E never-exports internals including
  RunLedger snapshot types (Lifecycle / SlotSnapshot / Snapshot)
- [ ] Short-circuit marks profile_required + risk_short_circuit for required
  slots and optional_not_selected + risk_short_circuit for never-selected
  optional; never fabricates runtime_required
- [ ] Rule/local and Judge paths use **discriminated** atomic critical sections:
  only matched qualifies / addSlotEvidence; no_match/invalid_result record only;
  Judge matched constructs NormalizedJudgeOutcome.evidence via qualification
- [ ] Unified slot branch table applies only when each slot becomes eligible
  (rule → short-circuit → local → Judge); covers skipped/failed/timeout;
  one SlotEvaluationRecord per manifest slot before publication/finalize
- [ ] skipped resolution is obligation+skip_reason (not status alone); optional
  absence resolved; profile/runtime_required + evaluation_terminated unresolved;
  never-selected optional termination uses optional_not_selected and has no
  independent effect
- [ ] Scheme B terminalizes never-selected optional slots; no not_started remains
- [ ] Scheme B never qualifies no_match/invalid_result; never converts settled
  Judge no_match/invalid_result into terminateJudgeAttempt
- [ ] Shared public detector_id is string with locked detector:// URI grammar;
  no Engine type dependency; Engine membership check only in semantic validator
- [ ] WSL hard-fail, balanced harness, Track1 0.80, anti-oracle intact
- [ ] Phase 3 DAG: P3-T5 before P3-T1/T2 typecheck
- [ ] TrustRule + ActionMatrix exact shapes in P3-T5
- [ ] validateSandboxSecuritySanitizedJudgePayload before Judge
- [ ] Ledger has request_id + evaluation_mode; JudgeResolutionEvidence exact union
- [ ] Decision ID/time/evidence/materialization order is singular and semantically validated
- [ ] Profile manifest is the sole trust derivation authority
- [ ] termination_reason includes caller_cancelled; work_budget wins ties
- [ ] Phase 5 top D equals P5-T4 EXPECTED_ENGINE_TYPE_EXPORTS equals Master D

## Requirement Exit Gate

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT"
test "$(node -p 'process.platform')" = "linux"
test -f ./frontend/node_modules/typescript/bin/tsc
npm run test:shared
npm run test:engine:sandbox
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
git diff --check
git diff --summary
git status --short
```
