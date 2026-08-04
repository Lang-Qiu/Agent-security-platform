# Sandbox Security P6 Judge Readiness Compatibility v5 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-03`
- Status: `IMPLEMENTED_PENDING_FRESH_LIVE_ACCEPTANCE`
- Authority: the operator requested a P6-only Judge readiness ceiling of
  `40000ms` after the fresh v4-05 capture failed closed at the approved
  `20000ms` readiness boundary. This amendment changes no provider identity or
  admission rule and requires a separately authorized fresh live run.

## Normative P6 v5 Profile

The source-controlled execution profile ID is exactly:

```text
p6_local_hardware_compatibility_v5
```

Its fixed timing record is exactly:

- Judge readiness: `40000ms`
- Ollama qualification and warmed prewarm: `20000ms`
- rule detector slot: inherited `100ms`
- local detector slot: `60000ms`
- Judge detector slot: `120000ms`
- normal work budget: `180000ms`

The readiness request is not a benchmark decision and is governed by its own
single bounded deadline. The larger readiness ceiling does not extend the
normal work budget, local or Judge detector slots, and authorizes no retry,
fallback, response repair, or alternate provider.

## Profile Provenance and Isolation

The v5 profile supersedes v4 for newly produced P6 capture manifests and signed
receipts. Validators require the exact v5 profile ID and timing record; v4 and
older timing records fail closed. Historical v4 runs remain historical and
cannot be repaired, promoted, or reused under v5.

Only the private controlled-live composition and P6 Engine factory may use v5.
Ordinary production and P7 retain the GENERAL-001 `5000ms` normal work budget
and `100/1000/4000ms` rule/local/Judge detector slots, including hermetic
replay.

The Judge protocol, safe endpoint policy, requested model, resolved model, and
API key remain operator-environment values. No provider URL, external model, or
credential is added to the source-controlled profile or this amendment.

## Preserved Boundaries

This amendment does not change the corpus, truth, thresholds, metric
definitions, local prompt/schema/digest, seven-domain routing, sanitizer, Judge
prompt/schema/protocol, endpoint policy, strict admission, signed receipt chain,
worker capabilities, or P7 replay contract. Strict admission still requires
every invoked provider slot to contain a normalized response, and any failure
rejects the capture without retry or fallback.

## RED/GREEN Evidence

The focused RED suite changed the valid P6 profile to v5/`40000ms` and failed
against the old v4/`20000ms` implementation. After the minimal profile and
validator update, the focused acceptance, capture, and contract suite passed
`118/118`. Deterministic repository, production, type, corpus, and final live
acceptance gates remain required after a separately authorized fresh run.

## Acceptance Requirement

The next live attempt must use completely fresh capture and evidence roots and
the mode-`600` operator env file. A real accepted 300-input capture must issue
the v5-bound signed capture and evaluation receipts, publish the receipt chain,
pass the frozen metrics, and then pass P7 hermetic replay and the final review.
No prior rejected root or synthetic evidence may be promoted.
