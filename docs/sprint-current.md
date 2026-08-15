# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-006

## Requirement Name

Sandbox security evaluation runtime streaming

## Status

COMPLETE

## Goal

Deliver real ordered `SOURCE -> RULE -> MODEL -> JUDGE -> DECISION` results in
the sandbox-security workbench. Each stage appears when its real engine stage
terminates, and the final decision continues into the existing result
presentation without changing that presentation.

## In Scope

- Add an exact-key, content-free shared evaluation stream event contract.
- Add an optional engine stage observer at real execution terminal points.
- Add `text/event-stream` representation negotiation to the existing
  `POST /api/sandbox/security/evaluations` route.
- Preserve the current JSON response when the SSE Accept header is absent.
- Emit explicit `skipped` results for MODEL/JUDGE short-circuit or routing
  decisions.
- Emit DECISION only after normalization and idempotent completion persistence.
- Keep runtime stage state only in React memory and preserve the final result
  component/DOM structure.

## Out of Scope

- New public routes or changes to existing decision semantics.
- Raw input, detector output, rule snippets, findings, credentials, or token
  material in stage events.
- Browser storage, URL state, telemetry, or audit persistence for runtime stages.
- Changes to enforcement behavior or unrelated sandbox-security requirements.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `docs/superpowers/specs/2026-08-16-sandbox-security-evaluation-runtime-streaming-design.md`
- `docs/superpowers/plans/2026-08-16-sandbox-security-evaluation-runtime-streaming.md`
- `docs/api-contract.md`
- `docs/architecture.md`

## Acceptance Criteria

1. SOURCE, RULE, MODEL, JUDGE, and DECISION arrive in sequence and render as
   each event is received.
2. Skipped detector stages are visible as explicit terminal results.
3. Non-SSE clients retain the current JSON behavior.
4. DECISION is never emitted before completion persistence succeeds.
5. Stream events remain content-free and exact-key validated.
6. The existing final result presentation remains unchanged after DECISION.
7. Focused and repository regression tests are green, apart from documented
   pre-existing environment failures.
