# P6 Local Hardware Compatibility v2 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Status: `SPEC_AMENDMENT_APPROVED_IMPLEMENTATION_GREEN_LIVE_ACCEPTANCE_PENDING`
- Date: `2026-07-31`
- Scope: controlled P6 live-capture timing and the exact local-detector prompt
  compatibility fix discovered by the first v2 run
- Authority: the operator explicitly approved a `60000ms` local detector slot
  and `80000ms` normal work budget while keeping every other P6, ordinary
  production, and P7 limit unchanged

This amendment supersedes the controlled-live timing record in
`2026-07-26-sandbox-security-p6-local-hardware-compatibility-amendment.md`.
Every other GENERAL-001 and GENERAL-002 boundary remains unchanged.

## Measured Need

The approved v1 profile was exercised through the capability-separated live
acceptance authority against the real 300-input corpus. The run passed Judge
readiness and Ollama qualification but failed closed because at least one local
provider outcome was `signal_termination:slot_timeout`.

Content-free local diagnostics on the pinned CPU-only `qwen3:8b` runtime then
established:

- the warmed fixed prewarm request completed in approximately `3.6s` to `4.3s`;
- among the 20 largest real production-protocol requests, at least three
  exceeded `20000ms`;
- the largest real request completed successfully in `41663ms` when allowed to
  finish;
- `OLLAMA_NUM_PARALLEL=1` was no faster than the existing runner; and
- forcing 16 inference threads increased the warmed fixed-request median to
  approximately `9.6s`.

No benchmark body, provider response body, credential, truth record, or
per-fixture decision was logged. These diagnostics did not contact Judge.

The first controlled v2 run then passed the widened timing boundary but failed
closed on a structurally invalid Ollama response. A content-free exact-parser
diagnostic localized the failure to corpus ordinal `241`: the model returned
three otherwise valid `subject_refs` entries containing only one unique
reference. The production normalizer correctly rejected the duplicate. Ollama
`0.6.8` did not enforce an experimental JSON Schema `uniqueItems` annotation,
while one explicit fixed system instruction made the same request parse
successfully in `18.7s`. No Judge request was made during that diagnosis.

## Required Timing

The source-controlled `p6_local_hardware_compatibility_v2` execution overlay is
used only by controlled P6 live capture:

- Judge readiness: `20000ms`
- Ollama qualification and warmed prewarm: `20000ms`
- local detector slot: `60000ms`
- Judge detector slot: `20000ms`
- normal work budget: `80000ms`

The normal work budget remains the exact sum of the local and Judge detector
slot ceilings. Every Engine evaluation receives its own budget.

## Isolation And Non-Goals

The overlay remains fixed in source and cannot be selected through public
input, environment, CLI, sealed evidence, caller-provided timing, or a
caller-provided profile resolver.

This amendment changes the local prompt from
`sandbox-security-ollama-local-prompt.v1` to
`sandbox-security-ollama-local-prompt.v2` by appending exactly:

```text
Each candidate's subject_refs array must contain no duplicate references.
```

The complete v2 prompt SHA-256 is
`e2632e29c2720f8f3c34436fe5daf6a7f251f5e912c3effeb21beccf56e4c196`.
The fixed v2 prewarm request is `2486` UTF-8 bytes with SHA-256
`d485c1671c61545499447b6b496ff2f965df4f93d0b43797d7ee105da874e486`.
Evidence claiming prompt v1 is invalid. The adapter does not retry, repair, or
deduplicate provider output.

## Post-Capture Candidate Contract Correction

The next controlled run completed all 300 capture evaluations and all provider
outcomes were acceptance-capable, then failed closed while materializing the
candidate staging envelope. Content-free layer-by-layer validation proved that
manifest, cassette, provider outcomes, package, and 299 decision structures
were valid. One real Engine decision used a legal frozen GENERAL-001 action that
the benchmark projection contract rejected.

The benchmark contract had incorrectly narrowed decision actions to
`allow|block`. GENERAL-001 has always defined the closed action catalog as
`allow|alert|ask|deny`; `block` is a deprecated non-core spelling. Candidate
decision projection types and normalizers must import that shared catalog,
accept all four values, and reject `block`. This correction does not change the
Engine decision, verdict-based acceptance numerators, provider behavior, or
benchmark truth.

This amendment does not change:

- the `100ms` P6 rule slot;
- the Judge readiness, qualification, warmed-prewarm, or Judge-slot ceilings;
- provider protocol, response schema, model, sanitizer, retry, or fallback
  behavior, apart from the exact prompt sentence and resulting request bytes
  recorded above;
- acceptance metrics or thresholds;
- ordinary production composition, which retains the GENERAL-001 `5000ms`
  work budget and `100/1000/4000ms` rule/local/Judge slots; or
- P7 hermetic replay, which also retains the ordinary GENERAL-001 timing.

## Execution And Evidence Binding

The existing private `createSandboxSecurityP6LiveCaptureEngine` factory remains
the sole core exception. Its fixed `80000ms` entry budget and `60000ms` local
slot must match
`security-production/p6-live-capture-profile.ts`. The public Engine factory and
public security index remain unchanged.

Candidate manifests, capture manifests, signed receipts, evaluation bindings,
seals, and accepted-evidence validators must bind the exact v2 profile ID and
five timing values. Evidence claiming v1 or any mixed v1/v2 record is invalid.

## Compatibility Gates

Before another controlled live request:

1. focused tests must first fail against the v1 implementation and pass after
   the minimal v2 implementation;
2. behavioral tests must prove P6 uses `60000ms` local and `20000ms` Judge
   slots inside an `80000ms` budget;
3. ordinary production and P7 timing must remain unchanged;
4. receipt and evidence normalizers must reject drift and mixed profiles;
5. the v2 system-prompt and prewarm byte hashes must be regression-locked, and
   v1 manifests must fail closed;
6. all 300 production prompt/response pairs must pass the exact local parser
   before another paid Judge run;
7. sandbox and benchmark TypeScript checks, production sandbox tests,
   repository capability gates, and `git diff --check` must pass; and
8. the real 300-input capture must still fail closed on every invoked provider
   failure and may publish evidence only after metrics are accepted.
9. permission-child materialization must cover at least one non-`allow` core
   action, and the contract must reject deprecated `block`.

## Controlled V2 Result

A fresh run after the action-contract correction completed all 300 production
evaluations and reached the truth-aware evaluator. It failed the frozen
thresholds with unsafe recall `6/180`, high/critical recall `2/60`, transformed
recall `1/54`, safe false-positive rate `0/120`, and decision coverage
`300/300`. The candidate and report are rejected diagnostic artifacts; no seal
or accepted evidence was published.

The local detector produced 299 valid responses: 3 matches and 296 no-match.
One evaluation was rule-short-circuited before local invocation. The reviewed
Judge channel passed binding/readiness, but the unchanged production router
selected no Judge calls because it invokes Judge only for unresolved signals.
This amendment does not authorize forced Judge routing.

P6-T4 is therefore blocked on detection quality under the approved prompt-v2,
qwen3:8b digest, and core routing semantics. Threshold relaxation, acceptance-
corpus tuning, synthetic evidence, and promotion/reuse of this rejected
candidate are prohibited. Any prompt/schema, pinned-model, or routing change
requires a separate explicitly approved amendment, independent development
data, RED-first implementation, and a fresh controlled run.
