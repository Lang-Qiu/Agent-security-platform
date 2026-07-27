# GENERAL-002 Operator Judge Protocol Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` and
> `superpowers:test-driven-development`. Complete one task, its independent
> specification review, quality/security review, re-review, and documentation
> evidence before the next task.

**Goal:** Replace the fixed Doro-host allowlist with a bounded operator-selected
HTTPS base URL behind a dedicated `openai_responses_v1` protocol adapter, while
preserving strict Judge wire behavior and sealed benchmark reproducibility.

**Architecture:** `judge-protocol-adapter.ts` is the sole owner of Judge URL
canonicalization and `/responses` endpoint derivation. `production-config.ts`
reads the explicit protocol-selection amendment's six values, stores only
adapter-derived private transport state, and exposes nonsecret provenance.
Benchmark code validates the same six sealed protocol/policy/endpoint/model
fields and their canonical binding hash before evaluation or sealing.

**Canonical amendment:**
`docs/superpowers/specs/2026-07-23-sandbox-security-operator-judge-protocol-adapter-amendment.md`

**Task placement:** this is an approved P6-T4 corrective amendment. It must
finish all deterministic gates before the already-blocked live P6-T4 attempt is
restarted. P7 remains unstarted until a real accepted P6 capture and seal.

## File Map

| Area | Files |
| --- | --- |
| Protocol boundary | Create `engines/sandbox/src/security-production/judge-protocol-adapter.ts`; add `engines/sandbox/tests/sandbox-security-production-judge-protocol-adapter.spec.ts` |
| Config and transport | Modify `production-config.ts`, `http-transport.ts`, and their focused tests |
| Sealed engine boundary | Modify `benchmark-composition.ts` and its focused test |
| Capture contract | Modify `scripts/benchmark/sandbox-security/contracts.ts`, `capture-live.ts`, `evaluate.ts`, `seal.ts`, and matching benchmark tests |
| Governance | Modify production spec, master/Phase 6/Phase 7 plans, `docs/sprint-current.md`, `docs/progress.md`, `docs/architecture.md`, and `docs/api-contract.md` as needed |

### Task 1: Protocol Adapter and Configuration

**Files:** create `judge-protocol-adapter.ts`; create its focused test; modify
`production-config.ts` and `sandbox-security-production-config.spec.ts`.

1. Write RED tests that require `https://us.doro.lol/v1/` to normalize to
   `https://us.doro.lol/v1` and
   `https://us.doro.lol/v1/responses`, with protocol ID
   `openai_responses_v1` and policy ID `operator_https_fqdn_v1`.
2. Add RED cases for a generic compliant host and each forbidden URL shape.
   Assert a fixed invalid error and zero credential disclosure.
3. Run only the two focused specs. Confirm each assertion fails because the
   adapter/config behavior does not exist, rather than because of import or
   type errors.
4. Implement the smallest pure adapter and make config use it. Keep all
   environment reads in `production-config.ts`; retain one-use `WeakMap`
   transfer and clearing.
5. Re-run the focused specs and sandbox TypeScript check.

### Task 2: Transport Endpoint Ownership

**Files:** modify `http-transport.ts` and
`sandbox-security-production-http-transport.spec.ts`.

1. Add RED tests proving transport accepts only a canonical adapter-derived
   endpoint, calls the request factory once with that endpoint, and rejects a
   forged/malformed endpoint before network use.
2. Run the focused transport spec and confirm the expected assertion failure.
3. Make transport validate the protocol ID and endpoint through the adapter;
   remove the static Doro URL set. Keep no redirects, bounded response reading,
   exact abort propagation, and credential isolation.
4. Re-run config + adapter + transport specs and TypeScript.

### Task 3: Binding Hash and Sealed Configuration

**Files:** modify `benchmark-composition.ts`,
`scripts/benchmark/sandbox-security/contracts.ts`, and matching engine/
benchmark contract specs.

1. Add RED tests for a canonical generic base/protocol/policy binding, a
   protocol/base/endpoint mismatch that rejects before replay transport
   invocation, and a capture-manifest replacement that rejects because the
   candidate package's manifest hash no longer matches.
2. Run those specs and verify the failures are behavioral.
3. Replace the provider assertion with `judge_protocol_id`, add
   `judge_endpoint_policy_id`, and calculate `judge_binding_sha256` from the
   exact six nonsecret fields. Add the exact candidate-manifest hash to the
   candidate package and require the same binding hash in cassette/replay
   normalizers. Reuse the adapter to derive and compare canonical endpoints;
   do not duplicate URL parsing or add a secret-bearing field.
4. Re-run focused composition and contract specs plus benchmark typecheck.

### Task 4: Live Candidate and Seal Enforcement

**Files:** modify `capture-live.ts`, `evaluate.ts`, `seal.ts`, their tests, and
only the permission-handoff assertions that require the new nonsecret binding.

1. Add RED tests that the candidate/capture/seal path records the protocol ID
   and rejects a tampered protocol, base, or endpoint with no seal publication.
2. Confirm RED in the focused capture/evaluation/live-evidence suite.
3. Propagate the summary's nonsecret protocol ID through candidate construction
   and exact normalizers. Preserve the existing closed six-variable child
   environment and the P6-only `p6_local_hardware_compatibility_v1`
   `20000ms` readiness limit.
4. Run all P6 deterministic tests, benchmark typecheck, sandbox TypeScript,
   corpus validator, frontend build, and `git diff --check`.

### Task 5: Documentation, Reviews, and Controlled Qualification

1. Synchronize the Master/Phase plans and public documentation with the new
   adapter, generic HTTPS base rule, and six-field evidence binding.
2. Dispatch independent specification review, then quality/security review,
   resolve every blocking finding with a fresh RED regression, and obtain a
   combined re-review approval.
3. Validate the existing live environment without printing values. Run exactly
   one controlled P6-T4 capture only after all deterministic gates are green.
4. If readiness/capture succeeds, run evaluator, sealer, P7 hermetic replay,
   full acceptance, and final global review. If an external provider returns a
   non-success response or misses the frozen deadline, record the precise
   nonsecret blocker and stop without fabricating evidence.
