# Sandbox Security P6 Local Hardware Compatibility v6 Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-03`
- Status: `IMPLEMENTED_PENDING_FRESH_LIVE_ACCEPTANCE`
- Scope: P6 controlled live capture only

The v5-01 run failed closed after Judge readiness had completed, with the
surfaced `transport_aborted` boundary occurring in the separate local Ollama
qualification/prewarm path. An exact source-generated Ollama prewarm request
returned successfully in approximately `29731ms` on the local qualification
hardware. The v5 `20000ms` qualification ceiling therefore rejected a valid
local warm-up on this hardware.

## Normative P6 v6 Profile

The source-controlled execution profile ID is exactly:

```text
p6_local_hardware_compatibility_v6
```

Its fixed timing record is exactly:

- Judge readiness: `40000ms`
- Ollama qualification and warmed prewarm: `40000ms`
- rule detector slot: inherited `100ms`
- local detector slot: `60000ms`
- Judge detector slot: `120000ms`
- normal work budget: `180000ms`

The qualification increase covers the observed local hardware warm-up boundary.
It does not add retries, fallback, response repair, alternate providers, or
additional work budget.

## Profile Provenance and Isolation

The v6 profile supersedes v5 for newly produced P6 capture manifests, signed
receipts, reports, and seals. v5 and older timing records fail closed under the
active validators; rejected roots and historical candidates cannot be repaired,
promoted, or reused as v6 evidence.

Only the controlled-live P6 composition and its benchmark capture path may use
v6. Ordinary production and P7 hermetic replay retain the GENERAL-001
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

## RED/GREEN Evidence

RED updated the active profile fixtures to v6/`40000ms` and failed against the
old v5/`20000ms` implementation: composition still emitted `20000`, and the
receipt validator rejected the v6 execution binding. GREEN then updated the
single P6 profile source and the cross-stage timing validators. The fresh
focused composition/capture/contracts suite is `96/96`; the receipt acceptance
suite is `44/44`. The live-evidence suite remains `43/46` because its three
committed checks intentionally reject missing synthetic evidence.

## Acceptance Requirement

The next attempt must use completely fresh capture and evidence roots and the
mode-`600` operator env file. A real accepted 300-input capture must publish
v6-bound signed capture/evaluation receipts, the report, `seal.json`, and
`receipt-chain.json`, pass the frozen metrics, and then pass the gated P7
hermetic replay and final review. No rejected or synthetic evidence may be
promoted.
