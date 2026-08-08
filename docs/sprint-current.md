# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-005

## Requirement Name

Sandbox security evaluation workbench and content-free audit console

## Status

IMPLEMENTATION_IN_PROGRESS

## Transition Authority

GENERAL-004 reached its terminal status `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`
with a closing review returning `PASS` (Critical `0`, Important `0`, Minor `0`)
and its full Docker deployment path validated for the first time (isolated
image build, Compose topology, four-barrier runtime probe, privacy gate). Its
five-Phase plan group is complete and committed.

All four GENERAL-005 execution-gate conditions from the Master plan's
`Execution Is Blocked` section now hold:

1. `REQ-SBX-GENERAL-004` is terminal (recorded in `docs/progress.md`).
2. Independent specification review returned `PASS` with Critical `0` and
   Important `0` (`.superpowers/review/general-005-rereview-2.md`).
3. Independent plan review returned `PASS` with Critical `0` and Important `0`
   (same record; progression initial `FAIL` -> rereview `FAIL` -> rereview-2
   `PASS`, all prior findings addressed).
4. The user explicitly approved driving GENERAL-005 to completion, and this
   documentation-only commit transitions the current sprint to
   `REQ-SBX-GENERAL-005`.

GENERAL-005 remains the only active requirement per `AGENTS.md` and
`metadata.md`, which permit exactly one at a time.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/docs.instructions.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-master.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-phase-1-theme-gate.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-phase-2-service-layer.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-phase-3-components.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-phase-4-pages-routing.md`
- `docs/superpowers/plans/2026-08-07-sandbox-security-frontend-workbench-005-phase-5-privacy-acceptance.md`
- `shared/types/sandbox-security.ts`
- `shared/types/sandbox-security-api.ts`
- `shared/contracts/sandbox-security.ts`
- `shared/contracts/sandbox-security-api.ts`
- `frontend/src/app/AppProviders.tsx`
- `frontend/src/styles/app.css`
- `frontend/src/test/app-test-harness.tsx`

## Goal

- Deliver the sandbox security evaluation workbench and content-free audit view
  as a cybersecurity-console frontend surface on a shared dark theme layer.
- Consume only the two existing public GENERAL-003 routes through a new
  authenticated client path and the existing shared exact-key normalizers.
- Hold the operator-pasted capability bearer token only in React state.
- Change no backend route, shared contract, or Engine semantics, and do not
  regress the existing 221-test frontend baseline.

## In Scope

- One shared token-driven console theme layer at `ConfigProvider` plus the
  `app.css` custom-property block, applied once at the app root.
- Two new pages (evaluation workbench, content-free audit view) authored
  natively in the new style, plus their route registration and navigation group.
- A new authenticated request path with `Authorization` and `Idempotency-Key`,
  and evaluation/audit service functions over the shared exact-key normalizers.
- Presentational verdict/action/severity tags, findings and detector-run
  tables, a content-item editor with client limits, a capability panel, and a
  content-free audit event table.
- Privacy leak sentinel, accessibility and contrast gates, full-suite
  regression, and durable documentation closure.

## Out of Scope

- Any new public route: GENERAL-003's fixed five-route surface is untouched.
- GENERAL-001 Engine semantics, GENERAL-002 detector behavior, GENERAL-003
  public v1 DTO meaning, GENERAL-004 enforcement behavior, or any Track 1
  backend/engine file.
- A cross-cutting auth/authz model (remains a project-wide Pending Decision).
- Rewriting existing Track 1 page markup, or "fixing" the two pre-existing
  antd 6 deprecation warnings.
- A benchmark-corpus "load example" affordance and a client-side audit subject
  filter (both explicit non-goals).

## Approved Product Decisions

Confirmed by the user on 2026-08-07 and treated as inputs, not open questions:

1. Documentation-only delivery deferred until GENERAL-004 terminal; now active.
2. A shared theme layer at the app root plus new pages authored natively; Track
   1 markup is not rewritten.
3. Dark slate palette with a restrained cyan accent; Inter for prose, monospace
   reserved for identifiers and digests.
4. The capability bearer token is operator-pasted and held in memory only; no
   new public route is added.
5. Specification and plan documents are in English.
6. New UI copy uses Chinese labels with English enum and identifier values.

## Locked Baseline

```text
frontend test files: 15
frontend tests:      221 passed
antd:                6.3.4  (theme.darkAlgorithm + theme.compactAlgorithm)
react:               19.2.4
```

Every Phase must keep the 221 pre-existing tests green with no existing spec
edited. A Phase that changes a count states the exact new count and reason. The
two pre-existing antd 6 deprecation warnings are Track 1-owned baseline noise
and out of scope.

## Locked Privacy Rules

Application code must not place submitted content in URL state, browser
storage, response history, telemetry, or durable audit. The capability token
exists only in React state, is never rendered back after entry, and never
enters a log, error message, or retry record. The audit view renders only the
content-free event union. `subject_refs`/`evidence_refs` positional data are
content-free and safe to render.

## Plan Set

| Order | Plan | Testable outcome |
| --- | --- | --- |
| 1 | phase-1-theme-gate | permanent requirement gate, console theme token module, dark/compact `ConfigProvider`, `app.css` inversion, hardcoded-color removal, unchanged 221 baseline |
| 2 | phase-2-service-layer | authenticated request path with `Authorization`/`Idempotency-Key`, evaluation/audit service functions over shared normalizers, closed error-code mapping, no-persistence guarantees |
| 3 | phase-3-components | verdict/action/severity tags, findings and detector-run tables, content-item editor with client limits, capability panel, content-free audit table |
| 4 | phase-4-pages-routing | workbench and audit pages, route registration, navigation group, cursor pagination, URL state proven content-free |
| 5 | phase-5-privacy-acceptance | privacy leak sentinel, accessibility/contrast gates, full-suite regression, durable documentation closure |

The order is strict. A Phase starts only after every task in its predecessor is
green, committed, and reviewed with no unresolved Critical or Important finding.

## Dependency Gate

GENERAL-005 depends on GENERAL-001 through GENERAL-004. GENERAL-004 is terminal
at `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`; GENERAL-002 is `VERIFIED`; GENERAL-003
remains at its own `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. None of these is
auto-verified by this transition. GENERAL-005 does not claim `VERIFIED` for any
predecessor and adds no new backend gate.

The GENERAL-002 P6 retry amendment remains durable policy across this sprint
transition: a fresh formal 300-projection P6 capture with no infrastructure
failure, complete provider attempt sequences allowing exactly one retry on a
`connection_failed` readiness probe, a complete-run seal and receipt chain, and
a successful hermetic replay are required before the fixed live evidence path is
verified. This policy is unchanged by GENERAL-005 and authorizes no
caller-configurable retry.

## Current Work

- The documentation-only sprint switch to `REQ-SBX-GENERAL-005` is this commit.
- Phase 1 (theme gate) is next: permanent requirement gate, console theme token
  module, dark/compact `ConfigProvider`, and `app.css` inversion, all under the
  frontend TDD baseline.
- No production frontend file has been changed by this documentation commit.

## Next Transition

`GENERAL_004_TERMINAL` -> `GENERAL_005_SPRINT_SWITCH (doc-only)` ->
`PHASE_1_IN_PROGRESS`

This commit records the sprint switch. Phase 1 execution begins immediately
after, starting with the permanent GENERAL-005 requirement gate (P1-T1).
