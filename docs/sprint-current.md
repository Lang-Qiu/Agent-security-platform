<!-- Phase 4 VERIFIED 2026-07-15: P4-T1..T6 closed -->
# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-001

## Requirement Name

Sandbox Security Core

## Status

IN_PROGRESS

## Approval

The user explicitly reapproved both Canonical Specs, the Master Plan, and all
five Phase Plans on `2026-07-13`. Implementation is authorized only in the
exact Master DAG order.

## Background

The existing Track 1 sandbox path provides deterministic monitoring, a
rule-based filter, controlled tool execution, and supervision contracts. This
requirement adds a reusable core that evaluates bounded authoritative Agent
activity without depending on Track 1 case IDs, benchmark labels, simulated
tool names, or an expected-action oracle.

Canonical specifications:

- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`

Canonical implementation authority:

- `docs/superpowers/plans/2026-07-11-sandbox-security-core-001-master.md`
- the five `2026-07-11-sandbox-security-core-001-phase-*.md` plans

## Goal

- Add strict public request, finding, detector-run, and decision contracts.
- Reconstruct and validate engine-private authoritative evaluation context.
- Canonicalize and bound authoritative inputs using in-repository RFC 8785 JCS.
- Isolate raw-local detectors from sanitized external Judge ports.
- Qualify detector evidence through immutable balanced and strict profiles.
- Route Judge only for unresolved escalation obligations.
- Reduce findings and failures to deterministic, stage-aware fail-closed policy.
- Preserve existing Monitor and Track 1 behavior through compatibility adapters.

## In Scope

- Shared structural types and exact-key normalizers.
- Source authority, canonical projection, private handles, locators, and keyed
  fingerprint boundary.
- Detector ports, subject/result boundaries, immutable profiles, and registry.
- Finding qualification, escalation lifecycle, runtime deadlines, run ledger,
  policy reducer, semantic validator, and evaluation orchestration.
- Monitor and Track 1 compatibility adapters, exact export closure, tests, and
  durable documentation.
- Exactly 26 tasks in the Master DAG: `4 + 5 + 6 + 6 + 5`.

## Out Of Scope

- Production generic detector rules, local model runtime, sanitizer, or Judge.
- Backend routes, authentication, authorization, idempotency, or durable audit.
- OpenClaw hook enforcement or frontend workbench behavior.
- The 300-sample benchmark fixtures and execution.
- New dependencies, network/filesystem/process integrations, dynamic profiles,
  database, queue, worker, sidecar, or physical memory zeroization.
- Any implementation from REQ-SBX-GENERAL-002 through GENERAL-005.

## Acceptance Criteria

- Caller claims cannot create source trust or override authoritative stage,
  profile, content, source order, or tool observations.
- All fixed limits, JCS vectors, private/public token boundaries, and locator
  rules have exact boundary tests.
- External Judge code cannot receive a raw detector snapshot and cannot run
  without validated nonempty routed obligations.
- Required and runtime-required failure cannot produce `allow`.
- Decision materialization, Scheme B closure, run ownership, and semantic
  validation follow the Canonical Specs.
- Decisions contain no raw or sanitized content, ordinary content hashes, or
  free-form detector/provider text.
- Existing Track 1 actions, contracts, and byte-stability gates remain green.
- Focused, Phase, Master, shared, sandbox-engine, repository, and TypeScript
  gates pass without waiver.
- Required documentation is updated and final status becomes
  `COMPLETE_PENDING_REVIEW`.

## Design Decision

Keep structural contracts in `shared/` and all authority, trust, detector,
qualification, policy, and orchestration semantics inside
`engines/sandbox/src/security/`. Trusted adapters construct authoritative
evaluation requests. Profiles are immutable, detectors return evidence rather
than actions, the external Judge receives only validated sanitized payloads,
and policy reduction has one engine-owned implementation.

## Execution Constraints

- Work only in WSL/Linux with Node.js `>=22.19.0`, `pnpm@10.0.0`, and the
  repository-local TypeScript compiler.
- Follow `Design -> Test (RED) -> Implement (GREEN) -> Document -> Review` for
  every implementation task.
- A raw import, syntax, export-link, or environment error is not valid RED.
- Execute one implementation task at a time in exact Master DAG order.
- Preserve production-file ownership and exact per-task staging/commit scope.
- Do not install dependencies, modify lockfiles, change frozen API names, or
  widen requirement scope during implementation.
- Complete both spec-compliance and code-quality review before each task commit.
- Phase reviews may proceed automatically after their gates pass; do not enter
  GENERAL-002 after this requirement closes.

## Current Implementation Status

- Documentation-only approval and sprint-switch gate: complete.
- Phase 1 public shared contracts: complete (prior commits).
- Phase 2 authority and canonical input (P2-T1..P2-T5): implemented; review
  P1/P2 fixes verified (typed authority JSON errors, 512 KiB fingerprint bound,
  independent fingerprint port bytes).
- Phase 3 detectors/profiles/boundaries/registry (P3-T5 → T1 → T2 → T3 → T4 → T6):
  implemented and independently APPROVED (subject_key `subjects` field, strict
  missing-local `sandbox_security_profile_invalid`, boundary fail-closed
  uniqueness/confidence/reason_code/source_type/locator gates closed).
- Note: current execution environment may not allow git commits; worktree is
  source of truth for the restarted sequence.
- Phase 4 engine/policy (P4-T1..T6): independently APPROVED after review/fix loop.
- Next: Phase 5 compatibility closure (only on explicit instruction).

