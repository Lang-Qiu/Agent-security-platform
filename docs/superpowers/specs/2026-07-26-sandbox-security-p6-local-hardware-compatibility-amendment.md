# P6 Local Hardware Compatibility Amendment

> Superseded for controlled live capture on `2026-07-31` by
> `2026-07-31-sandbox-security-p6-local-hardware-compatibility-v2-amendment.md`.
> This file remains the historical v1 decision record.

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Status: `SUPERSEDED_BY_P6_LOCAL_HARDWARE_COMPATIBILITY_V2`
- Date: `2026-07-26`
- Scope: controlled P6 live-capture timing only
- Authority: the operator approved the `20000ms` / `40000ms` limits and
  delegated resolution of subsequent GENERAL-002 blockers

This amendment supersedes only the frozen-core and production deep-import rules
needed to implement the approved P6 execution timing. Every other GENERAL-001
and GENERAL-002 boundary remains unchanged.

## Required Timing

The source-controlled `p6_local_hardware_compatibility_v1` execution overlay is
used only by controlled P6 live capture:

- Judge readiness: `20000ms`
- Ollama qualification and warmed prewarm: `20000ms`
- local detector slot: `20000ms`
- Judge detector slot: `20000ms`
- normal work budget: `40000ms`

The overlay is not selectable through public input, environment, CLI, sealed
evidence, or a caller-provided profile resolver. Ordinary production and P7
hermetic replay retain the GENERAL-001 `5000ms` work budget and
`100/1000/4000ms` rule/local/Judge slots.

## Narrow Core Exception

Exact timing cannot be implemented by adapting only
`SandboxSecurityRuntimePorts`: the Engine uses the same monotonic clock for
budget exhaustion, detector `elapsed_ms`, and slot-versus-budget termination.
Clock or timer virtualization would therefore falsify elapsed time or timeout
classification. Pre-capture followed by replay would not be a live Engine run,
and a copied production Engine would create a second security state machine.

The approved implementation is one private P6 factory in
`engines/sandbox/src/security/engine.ts`:

```ts
createSandboxSecurityP6LiveCaptureEngine
```

The factory:

- is absent from `engines/sandbox/src/security/index.ts`;
- accepts only the same registry, optional sanitizer, and runtime dependencies
  used by the ordinary Engine factory;
- accepts no timing, profile, resolver, mode, environment, or CLI input;
- uses the existing Engine state machine, reducer, semantic validator, and
  deadline controller;
- owns the fixed P6 work budget and local/Judge slot overlay; and
- does not change the behavior or type contract of
  `createSandboxSecurityEngine`.

`engines/sandbox/src/security-production/composition.ts` may deep-import exactly
that one symbol and only for its benchmark-only live-capture composition path.
The import cannot be aliased, combined with another core symbol, re-exported, or
used by another production module. The sanitizer helper remains the only other
production-to-core deep-import exception.

## Execution Overlay Contract

`engines/sandbox/src/security-production/p6-live-capture-profile.ts` owns the
durable execution-profile ID and five-field timing record used by readiness,
qualification, capture evidence, evaluation, and sealing. It does not resolve
or mutate a GENERAL-001 policy profile.

The core cannot import the production tree. The private factory consequently
owns matching fixed execution literals. Permanent static and behavioral tests
must compare the work-budget and detector-slot literals to the production timing
record and fail on drift. The GENERAL-001 policy profile ID, public manifest
type, public index, routing, thresholds, and action matrix remain unchanged.

## Compatibility Gates

Before P6 live acceptance:

1. the ordinary Engine factory must retain its pre-amendment dependency-bag and
   deadline behavior;
2. all GENERAL-001, Track 1, ordinary production, and P7 replay tests must pass;
3. the P6 path must prove `20000ms` qualification/local/Judge timers and a
   `40000ms` work budget;
4. repository analysis must reject every core deep import except the exact
   sanitizer helper and exact P6 factory edge; and
5. source scans must prove the P6 factory is absent from the public index and
   has no caller-selected timing or resolver input.

This correction is owned by P6-T4 and must complete both specification and code
quality/security review before a fresh provider request is allowed.
