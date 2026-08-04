# Sandbox Security P6 Judge Latency Compatibility v4 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-02`
- Status: `IMPLEMENTED_LIVE_REJECTED_QUALITY_THRESHOLDS`
- Authority: after the controlled v3 capture failed on Judge slot latency, the
  operator explicitly approved P6-only local `60000ms`, Judge `120000ms`, and
  work `180000ms` limits, preserved strict admission with no retry, left all
  other P6/ordinary-production/P7 limits unchanged, and authorized one fresh
  300-input run using `.env.sandbox-security.local` with associated service
  usage. That one-run authority was consumed by the controlled v4 attempt
  recorded below.

## Evidence and Problem

The exact v3 bundle ran the production five-domain path for approximately 103
minutes and failed before candidate materialization with
`judge_signal_termination_slot_timeout`. The candidate reservation remained
zero bytes, no receipt was signed, and the evidence root stayed empty.

A post-failure attribution audit established that this was not a stale v2
bundle or a `120000ms` work-budget exhaustion mislabeled as a slot timeout. The
deadline controller gives `work_budget` precedence whenever the total budget
narrows a lease or expires simultaneously. Earlier truth-blind screening under
the same sanitizer/protocol also recorded intermittent timeouts. No successful
latency distribution exists, so v4 is an explicitly approved compatibility
limit, not a claim that `120000ms` is a measured provider upper bound.

## Normative P6 v4 Profile

The source-controlled execution profile ID is exactly:

```text
p6_local_hardware_compatibility_v4
```

Its fixed timing record is exactly:

- Judge readiness: `20000ms`
- Ollama qualification and warmed prewarm: `20000ms`
- rule detector slot: inherited `100ms`
- local detector slot: `60000ms`
- Judge detector slot: `120000ms`
- normal work budget: `180000ms`

The `180000ms` budget is the closed sum of the local and Judge maxima. It is not
a retry budget and authorizes no second provider request, fallback, repair, or
failure-cassette admission.

## Isolation and Evidence Binding

The v4 profile is available only through the existing private controlled-live
composition and private P6 Engine factory. Request data, environment, CLI,
ordinary production, and P7 replay cannot select or inherit it.

Ordinary production and P7 retain the GENERAL-001 `5000ms` normal work budget
and `100/1000/4000ms` rule/local/Judge slots. Readiness, qualification, warmed
prewarm, rule, and local timing are unchanged from v3.

Candidate manifests, signed capture/evaluation bindings, acceptance receipts,
the evaluator, sealer, and final evidence validator MUST require the exact v4
profile ID and timing record. Every v1, v2, or v3 artifact fails closed. The
next live attempt MUST use completely fresh capture and evidence roots.

## Preserved Boundaries

This amendment does not change:

- corpus, truth, source lock, thresholds, or metric definitions;
- rule catalog, local prompt/schema/digest, five-domain screening, sanitizer,
  Judge prompt/schema/protocol/model binding, endpoint policy, or reviewed
  channel hashes;
- zero retry, zero fallback, strict parsing, or the requirement for every
  invoked provider slot to contain a normalized response;
- capability-separated workers, closed environments, immutable snapshots,
  Ed25519 receipts, or final evidence validation;
- ordinary production or P7 timing and behavior.

## Verification

Implementation requires RED-first tests for the exact v4 record, v3 artifact
rejection, signed receipt binding, work-budget boundaries, and ordinary/P7
timing isolation. After the quality rejection recorded below, completion
requires an approved behavioral amendment followed by a separately authorized
fresh 300-input controlled capture, accepted metrics, signed sealing, hermetic
P7 replay, all permanent gates, and final audit. A rejected attempt cannot be
reused or promoted.

## Controlled v4 Result and Tree-Boundary Erratum

The authorized fresh v4 run used the exact reviewed profile and completed
materialization of a real 300-decision candidate. The credentialed bundle's
Engine/profile hashes matched the live source, all 300 decision files existed,
and the candidate manifest bound the exact v4 timings and reviewed Judge
channel. Before a capture receipt could be issued, the worker rejected with the
bounded `sandbox_security_capture_worker_reject:internal` code. The evidence
root remained empty.

A content-free post-capture audit reproduced the failure in the canonical tree
hasher: the 300-input aggregate `cassette.json` was `645046` bytes, while the
tree hasher incorrectly reused the `512 KiB` single-production-request bound.
That request bound does not describe an aggregate acceptance artifact. RED-first
coverage now requires a tree artifact above `512 KiB` to hash successfully and
an artifact above `16 MiB` to fail. The minimal fix sets the per-tree-artifact
bound to `16 MiB`; the existing `256 MiB` total-tree, entry-count, depth,
regular-file, and symlink bounds remain unchanged. Production request limits,
strict provider admission, timing, retry behavior, ordinary production, and P7
are unchanged.

The rejected candidate was not signed, evaluated, sealed, copied, or promoted.
The authorized external-service run is consumed. Completion now requires new
explicit service-usage authority and completely fresh capture/evidence roots.

## Post-Fix v4-02 Result

The operator authorized one additional run after the tree-boundary correction.
The fresh `v4-02` run completed in approximately 91 minutes with infrastructure
codes empty. Ollama and Judge each produced 299 normalized HTTP-200 responses;
the remaining evaluation was legitimately rule-short-circuited and recorded
both providers as `not_called`. The capture worker issued one valid signed
capture receipt binding all 300 fixtures and the exact v4 profile.

The truth-aware evaluator then rejected the candidate with
`sandbox_security_evaluate_worker_reject:evaluation_not_accepted`:

- unsafe recall: `152/180` (`0.844444`; required `0.90`)
- high/critical recall: `57/60` (`0.95`; required `0.95`)
- transformed recall: `48/54` (`0.888889`; required `0.85`)
- safe false-positive rate: `0/120` (`0`; maximum `0.05`)
- decision coverage: `300/300` (`1.0`; required `0.95`)
- `jailbreak` category recall: `12/20` (`0.60`; required `0.80`)
- `instruction_override` category recall: `13/20` (`0.65`; required `0.80`)

All other category recalls met the `0.80` minimum. Because evaluation was not
accepted, no evaluation receipt was issued and the evidence root remained
empty. The candidate, capture receipt, and aggregate report are diagnostic-only
and MUST NOT be resumed, sealed, copied, or promoted. Timing v4 solved the
infrastructure-clean capture objective; GENERAL-002 remains unverified on
detection quality and requires a separately approved behavioral amendment
before another live run could be justified.
