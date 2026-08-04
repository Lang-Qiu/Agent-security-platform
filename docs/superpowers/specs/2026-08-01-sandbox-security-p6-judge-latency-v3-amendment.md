# Sandbox Security P6 Judge Latency Compatibility v3 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-01`
- Status: `HISTORICAL_SUPERSEDED_BY_V4`
- Authority: the operator explicitly approved new P6-only Judge and work
  limits after the controlled five-domain capture failed on Judge slot latency.

## Evidence and Problem

The five-domain production path is deterministically GREEN, but the reviewed
live Judge channel does not complete every invoked request inside the P6 v2
`20000ms` Judge slot:

- a truth-blind 20-input production diagnostic returned 18 Judge responses and
  two `slot_timeout` terminations;
- a fresh 300-input controlled capture ran for approximately 103 minutes and
  then failed before candidate materialization with
  `judge_signal_termination_slot_timeout`;
- no candidate, receipt, replay pack, seal, or accepted metrics were published.

The approved provider-admission contract requires every invoked provider slot
to contain a normalized response. Timeout cassettes remain useful for tests and
hermetic replay but are not acceptance-capable. The operator chose a P6-only
timing amendment rather than weakening that rule.

## Normative P6 v3 Profile

The source-controlled execution profile ID is exactly:

```text
p6_local_hardware_compatibility_v3
```

Its fixed timing record is exactly:

- Judge readiness: `20000ms`
- Ollama qualification and warmed prewarm: `20000ms`
- rule detector slot: inherited `100ms`
- local detector slot: `60000ms`
- Judge detector slot: `60000ms`
- normal work budget: `120000ms`

The `120000ms` budget is the closed sum of the maximum local and Judge slots.
It is not a retry budget and does not authorize a second request.

## Isolation and Evidence Binding

The v3 profile is available only through the existing private controlled-live
composition and private P6 Engine factory. Request data, environment, CLI,
ordinary production, and P7 replay cannot select it.

Ordinary production and P7 retain the GENERAL-001 `5000ms` normal work budget
and `100/1000/4000ms` rule/local/Judge slots. P7 replays captured termination
semantics with ordinary timing; it does not inherit v3 live timings.

Candidate manifests, signed capture/evaluation bindings, acceptance receipts,
the evaluator, sealer, and final evidence validator MUST require the exact v3
profile ID and timing record. Every v1 or v2 artifact fails closed. A fresh
controlled run with new roots is mandatory.

## Preserved Boundaries

This amendment does not change:

- corpus, truth, source lock, thresholds, or metric definitions;
- rule catalog, local prompt/schema/digest, five-domain screening, sanitizer,
  Judge prompt/schema/protocol/model binding, or endpoint policy;
- zero retry, zero fallback, strict response parsing, and the requirement that
  every invoked provider outcome be a normalized response;
- capability-separated workers, closed environments, immutable snapshots,
  Ed25519 receipts, or final evidence validation;
- ordinary production or P7 timing and behavior.

## Verification

Implementation requires RED-first tests proving the exact v3 record, boundary
behavior immediately below/above `120000ms`, v2 artifact rejection, signed
receipt binding, and ordinary/P7 timing isolation. Completion still requires a
fresh 300-input controlled capture, accepted metrics, signed sealing, hermetic
P7 replay, all permanent gates, and final audit.

The first fresh v3 run with a passing content-free Ollama/Judge/binding preflight
executed for approximately 103 minutes and still failed closed because at least
one invoked Judge request exceeded the `60000ms` slot. No candidate, receipt, or
evidence was published. This empirical result does not amend the profile or the
provider-admission rule; further live execution requires a new reviewed
channel/timing decision and explicit service-usage authority.

That authority was granted on 2026-08-02. The v3 timing record is superseded
for all future controlled live capture by
`2026-08-02-sandbox-security-p6-judge-latency-v4-amendment.md`; v3 evidence and
receipt bindings remain invalid for v4 acceptance.
