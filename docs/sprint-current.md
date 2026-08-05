# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-003

## Requirement Name

Sandbox Security Authenticated Backend API

## Status

IMPLEMENTED_PENDING_GLOBAL_P6_GATE

## Transition Authority

GENERAL-002 received the temporary disposition
`PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE` on `2026-08-05`. The user then
instructed the project to continue with GENERAL-003, approved the design
decisions section by section, requested one independent specification review,
and authorized implementation-plan writing after that review passed.

The final independent specification review returned `PASS` with no Critical or
Important finding. The initial independent implementation-plan review and first
re-review each returned `FAIL` with two Critical and five Important findings.
Three later re-reviews returned `FAIL` while successively closing one Important
and two Minor findings, one Critical finding, and one final Important finding.
The final independent plan re-review returned `PASS` with zero Critical,
Important, or Minor findings. The user explicitly approved execution of that
reviewed plan. P6-T4 closing review also returned `PASS` with zero Critical,
Important, or Minor findings; implementation is complete up to the dependency
bounded global P6 gate.

## Canonical Inputs

- `metadata.md`
- `AGENTS.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-master.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-1-surfaces.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-2-domain-controls.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-3-sqlite.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-4-services.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-5-http.md`
- `docs/superpowers/plans/2026-08-05-sandbox-security-backend-api-003-phase-6-production-closure.md`
- `docs/architecture.md`
- `docs/api-contract.md`

## Goal

- Add synchronous, simulation-only sandbox security evaluation on the public
  backend listener.
- Authenticate public access with opaque, expiring, revocable, restart-durable
  capabilities.
- Enforce capability scope, stage, profile, raw-body, rate, concurrency, and
  idempotency boundaries before invoking the Engine.
- Persist capabilities, completed idempotency responses, and content-free
  audit events in a hardened single-node `node:sqlite` database.
- Add subject-scoped public audit read and administrator-only capability/purge
  routes on the correct listeners.
- Reuse the GENERAL-001 fingerprint service and GENERAL-002 production Engine
  only through their public indexes.

## In Scope

- Public routes:
  - `POST /api/sandbox/security/evaluations`
  - `GET /api/sandbox/security/audit-events`
- Internal routes:
  - `POST /internal/sandbox/security/capabilities`
  - `POST /internal/sandbox/security/capabilities/:capabilityId/revoke`
  - `POST /internal/sandbox/security/audit-events/purge`
- Shared audit event/page types and strict normalizers.
- Backend module, controllers, services, ports, crypto, limiters, SQLite
  adapters, production Engine gateway, startup/shutdown, tests, privacy gates,
  and required documentation.

## Out of Scope

- Enforcement-mode public requests or authority reconstruction.
- OpenClaw hooks or enforcement, which belong to GENERAL-004.
- Frontend workbench or audit UI, which belongs to GENERAL-005.
- Multiple instances, distributed state, queues, workers, sidecars, general
  RBAC, OAuth/OIDC, token refresh, secret rotation, or automatic audit cleanup.
- Caller-selected production mode, provider, model, endpoint, timeout, retry,
  fallback, policy rules, or Engine-private configuration.
- GENERAL-001 semantic changes or GENERAL-002 detector/benchmark/P6 changes.

## Approved Design Summary

- Single-node persistence uses Node.js 22 `node:sqlite`; database parent is
  private and database/WAL/SHM files are mode `0600`.
- Capability tokens are 32 random bytes with `sbxcap_v1.` prefix; only SHA-256
  digests are stored. Default TTL is 900 seconds and maximum TTL is 3600.
- A deployment HMAC key binds authorization scope, idempotency keys, Engine
  canonical fingerprints, audit cursors, production mode, and database
  identity.
- Public rate limits are capability capacity 3/refill 0.2 per second and
  deployment capacity 10/refill 1 per second; at most four Engine calls run
  concurrently.
- Completed idempotency is retained for 24 hours; audit is retained for 90
  days. Startup, claim, hourly, and administrator cleanup are bounded.
- Audit reads always include the authenticated `subject_id` SQL predicate and
  verify it again after normalization.
- Production mode is exactly `rule_only | local | local_and_judge`, must be
  configured before startup, and remains fixed for the process lifetime.
- `Retry-After` is fixed by the Master plan: in-progress/concurrency `1`,
  storage `60`, and token-bucket deficit `ceil(deficit/refill)` clamped `1..60`.

## Dependency Gate

GENERAL-002 remains `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`. Its formal
signed P6 evidence and successful gated hermetic replay are absent. This permits
GENERAL-003 planning and, after explicit plan approval, implementation; it does
not permit GENERAL-003 or the global sandbox program to claim `VERIFIED`.
P6 formal acceptance remains absent, and GENERAL-002 is not `VERIFIED`.

The highest valid GENERAL-003 implementation status before that dependency
closes is `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. `npm run test:all` must still be
attempted and its expected hermetic fail-closed result reported honestly.

## Current Work

- The written specification is approved after independent review.
- The Master and six Phase implementation plans passed final independent review
  with zero Critical, Important, or Minor findings after iterative correction.
- Implementation has completed Phase 6 / P6-T1 through P6-T4 and Phase 5 / P5-T4,
  including validated production configuration/lifecycle, the production
  evaluation gateway, strict HTTP admission, normal/abnormal close handling,
  response-safe cleanup, the
  ordered public and administrator controller gates, one injected module
  instance shared by both listeners, and real HTTP integration coverage.
  Phase 4 / P4-T3
  included ordered evaluation
  orchestration, idempotency replay/conflict handling, Engine-slot lifecycle,
  interruption convergence, and the necessary changed-correlation SQLite
  conflict correction.
- P5-T1 through P5-T4 and P6-T1 through P6-T4 focused and independent review
  gates are green; the remaining gate is the GENERAL-002-dependent global P6
  acceptance.
- The P6 retry amendment is complete through Task 6 documentation and
  repository gates, but no fresh full 300-input P6 capture has been run.
- GENERAL-002 remains `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`; neither
  GENERAL-002 nor GENERAL-003 is `VERIFIED`.
- The GENERAL-003 plan group is complete at
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`; do not claim `VERIFIED` until the
  GENERAL-002 signed P6 recapture and hermetic replay are accepted.
