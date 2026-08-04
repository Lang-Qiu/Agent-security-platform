# Sandbox Security P6 Judge Long-Tail v8 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-04`
- Status: `IMPLEMENTED_PENDING_FRESH_LIVE_ACCEPTANCE`
- Scope: P6 controlled live capture only

The fresh v7-01 run passed readiness and Ollama qualification but failed after
approximately six hours and forty minutes when an invoked Judge request reached
the fixed `180000ms` detector lease. The runtime classified the termination as
`slot_timeout`, not `work_budget`; strict provider admission performed no retry
or fallback, and no evidence was published. The v7 attempt therefore cannot
establish an upper bound for the provider response lifecycle.

## Normative P6 v8 Profile

The source-controlled execution profile ID is exactly:

```text
p6_local_hardware_compatibility_v8
```

Its fixed timing record is exactly:

- Judge readiness: `40000ms`
- Ollama qualification and warmed prewarm: `40000ms`
- rule detector slot: inherited `100ms`
- local detector slot: `60000ms`
- Judge detector slot: `300000ms`
- normal work budget: `360000ms`

The v8 change adds one bounded five-minute Judge slot and the closed local plus
Judge work budget. It does not add retries, fallback, response repair,
alternate providers, or dynamic timing selection.

## Profile Provenance and Isolation

The v8 profile supersedes v7 for newly produced P6 capture manifests, signed
receipts, reports, and seals. v7, v6, v5, and older timing records fail closed
under the active validators; rejected roots and historical candidates cannot be
repaired, promoted, or reused as v8 evidence.

Only the controlled-live P6 composition and its benchmark capture path may use
v8. Ordinary production and P7 hermetic replay retain the GENERAL-001
`5000ms` normal work budget and `100/1000/4000ms` rule/local/Judge slots.

The Judge protocol, base URL, requested model, resolved model, and API key stay
operator-environment values. No provider URL, external model, or credential is
present in the source-controlled profile or this amendment.

## Preserved Boundaries

The amendment preserves the seven-domain routing, corpus, truth isolation,
thresholds, sanitizer, Judge protocol, strict provider admission, zero
retry/fallback policy, signed receipt chain, capability-separated workers, and
P7 replay contract. Every invoked provider slot still requires a normalized
response; any failure rejects the whole capture before evidence publication.

## Acceptance Requirement

The next attempt must use completely fresh capture and evidence roots and the
mode-`600` operator env file. A real accepted 300-input capture must publish
v8-bound signed capture/evaluation receipts, the report, `seal.json`, and
`receipt-chain.json`, pass the frozen metrics, and then pass the gated P7
hermetic replay and final review. No rejected or synthetic evidence may be
promoted.
