# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-004

## Requirement Name

OpenClaw sandbox security enforcement

## Status

IMPLEMENTATION_IN_PROGRESS

## Transition Authority

GENERAL-003 is complete at `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. The user
explicitly approved execution of the reviewed GENERAL-004 plan group on
2026-08-06 after requiring the existing workspace changes to be checkpointed.
The current branch is the execution branch; work remains bounded to
GENERAL-004.

The GENERAL-004 written specification remains approved. A fresh independent
completion audit of the five-Phase plan found one Critical runtime-catalog gap
and one Important outbound turn-context gap. A supplemental lifetime check then
showed the first context correction ended before dispatcher idle and detached
queued follow-up delivery. The draft now patches the real native hook catalog,
locks all thirteen carrier/caller files, keeps normal context through dispatcher
settlement, and gives each complete queued follow-up its own scoped capsule.
These corrections are documentation-only and are exempt from the RED/GREEN TDD
sequence. The next full re-review found two further Important planning gaps: a
non-sequential coverage list was mislabeled as execution order, and evaluation
`requestId` lacked a trusted issuer/lifecycle. The draft now makes the Master
Phase order authoritative and defines one plugin-issued `request:<UUIDv4>` per
evaluation with fail-closed issuance. Those corrections required another
independent re-review.
The final independent re-review returned `PASS` with Critical `0`, Important
`0`, and Minor `0`, confirming both findings resolved and no regression in the
27-task/commit ledger or thirteen-file Phase 4 identity. The user's explicit
approval is now recorded above.

## Canonical Inputs

- `metadata.md`
- `AGENTS.md`
- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- `docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`
- `docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md`
- `docs/architecture.md`
- `docs/api-contract.md`

## Goal

- Enforce the sandbox security Engine at the final awaited OpenClaw barriers
  for user input, assistant output, tool execution, and outbound delivery.
- Reconstruct authoritative, stage-specific projections without trusting
  generic history, composite prompts, or caller-provided authority claims.
- Stop or replace unsafe and unavailable actions before side effects, with no
  interactive approval or resume path.
- Audit completed and interrupted evaluations through a dedicated,
  content-free internal capability and the GENERAL-003 repository.
- Keep Track 1 and all GENERAL-001 through GENERAL-003 public contracts
  unchanged while adding the smallest audited OpenClaw runtime patch.

## In Scope

- A separate general-security OpenClaw plugin/runtime and its immutable config.
- Exact `openclaw@2026.6.34` pin with npm integrity
  `sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==`.
- Required final barriers: `before_agent_run`,
  `before_model_output_delivery`, `before_tool_execution`, and
  `before_message_delivery`.
- In-process GENERAL-002 production Engine composition through public indexes,
  with a global concurrency limit of four and no waiting queue.
- Fixed action mapping, fail-closed floors, replacement responses,
  correlation checks, startup integrity probes, and privacy gates.
- `POST /internal/sandbox/security/enforcement-events` with capability scope
  `sandbox_security:enforcement:audit:write`.
- SQLite v1-to-v2 migration that preserves GENERAL-003 data and retention
  rules while adding enforcement event and capability-scope catalogs.
- Focused integration, repository, runtime, patch-integrity, privacy, and
  Track 1 regression tests, plus required implementation documentation.

## Out of Scope

- GENERAL-001 detector, profile, canonicalization, reducer, or Engine changes.
- GENERAL-002 detector/provider/benchmark/P6/P7 changes.
- Public enforcement APIs, frontend components, audit UI, or GENERAL-005 work.
- Interactive approval, resume, background retry, persistent enforcement
  queues, workers, sidecars, or distributed runtime state.
- Caller-selected profile, production mode, timeout, retry, fallback,
  provider, model, endpoint, policy rules, or replacement text.
- Binary or unsupported multimodal parsing and protection from malicious
  trusted in-process code or physical-memory/OS-swap inspection.

## Approved Draft Summary

- The general-security runtime is separate from Track 1. Track 1 keeps its
  existing plugin, exact OpenClaw `2026.6.10` base, constants, evidence, byte
  gates, and acceptance behavior unchanged.
- The new runtime uses exact OpenClaw `2026.6.34` with the integrity above and
  a minimal patch whose base identity, patch digest, patched-file hashes, and
  runtime probe evidence are immutable startup inputs.
- The four barriers are registered exactly once, awaited, correlated by stable
  run/session/call IDs, and fail closed on timeout, error, missing identity,
  duplicate registration, or invalid final values.
- Authority is reconstructed as `user_input` from the current prompt;
  `model_output` from the current prompt plus exact assistant projection; or
  `tool_request` from the prompt, matching model output, and final tool
  request. Composite system prompts, generic history, workspace, memory,
  retrieval, and guessed tool targets are excluded.
- Engine `allow` and `alert` continue. `ask` and `deny` stop the current
  action/turn with no interactive approval or resume. User/model/outbound
  failures floor to `ask`; tool failures floor to `deny`. Fixed replacement
  strings are defined in the specification.
- Audit is orthogonal to the selected host action. It uses a fixed short
  timeout, no retry queue, backend-injected identity/server time, replay-safe
  event IDs, and no raw, sanitized, hashed, or provider content.
- Raw values are transient only; OpenClaw session/transcript paths use tmpfs,
  raw-stream/debug capture is disabled, and blocked originals are discarded.

## Dependency Gate

GENERAL-002 is `VERIFIED` as of 2026-08-07. Its formal signed P6 evidence,
receipt chain, complete-run seal, and gated hermetic replay are recorded in
`docs/progress.md`. GENERAL-003 remains at its own
`IMPLEMENTED_PENDING_GLOBAL_P6_GATE` status and is not automatically verified
by this dependency transition; GENERAL-004 must continue to satisfy its own
phase gates.

The highest valid GENERAL-003 status is
`IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. `TMPDIR=/tmp npm run test:all` must still
be attempted during implementation and its expected dependency-bounded
fail-closed result reported honestly.

The GENERAL-002 P6 retry amendment is implemented through Task 6
documentation and permanent repository gates. The 2026-08-06 complete-run
acceptance amendment requires a full 300-projection P6 capture with no
infrastructure failure, complete provider attempt sequences, a complete-run
seal and receipt chain, and a successful hermetic replay before the fixed live
evidence path is verified. The retained `accepted_metrics.accepted` quality
result and `numerators.decided` coverage metric are not rewritten; valid
indeterminate projections may make `decided` less than 300 without blocking
complete-run acceptance. This policy does not authorize caller-configurable
retry and does not change GENERAL-003's out-of-scope retry rule.

## Current Work

- The reviewed written specification is at
  `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`.
- The final independent read-only specification re-review returned `PASS` with
  zero Critical, Important, or Minor findings after all earlier findings were
  corrected.
- The complete five-Phase implementation-plan draft is indexed by
  `docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md`;
  Phase 5 closes isolated deployment, tmpfs/privacy, Track 1 regression, durable
  documentation, and dependency-bounded validation.
- The fresh independent completion audit returned `FAIL` with Critical `1`,
  Important `1`, and Minor `0`; its supplemental lifetime check found the first
  outbound correction incomplete. The draft now includes the native catalog,
  the exact thirteen-file identity, dispatcher-owned normal-turn lifetime, and
  queued-follow-up lifetime, and awaits re-review. Every earlier repository-gate,
  writable-temp, isolation, envelope, and package correction remains in place.
- The subsequent full re-review confirmed those original issues resolved and
  returned `FAIL` with Critical `0`, Important `2`, Minor `0` for conflicting
  execution-order wording and missing trusted evaluation request-ID ownership.
  Both were corrected before the final re-review.
- The final independent re-review returned `PASS` with Critical `0`, Important
  `0`, Minor `0`; both findings are resolved, all earlier findings remain
  closed, and no new actionable issue was found.
- GENERAL-004 Phase 1 is complete through its five task commits and review
  gate. Phase 2 P2-T1 and P2-T2 are complete through their task commits and
  review gates. P2-T3 and P2-T4 are implemented and committed as `81e9aad`
  and `1e73c1a`; their independent specification and quality reviews both
  passed with zero Critical, Important, and Minor findings.
- P2-T5 is implemented in the current workspace. Its independent specification
  review is PASS; its quality review found three Important and one Minor
  finding, all corrected with focused regressions, and quality re-review is
  PASS. The current review-fix cycle adds explicit v2 `event_schema`, bounded
  foreign-key suspension, and body-read re-authentication before grant/append.
  It adds the strict internal enforcement-event controller, dedicated
  capacity-2 limiter with six-second refill, production SQLite/module wiring,
  internal dispatch, and real HTTP coverage. The existing static backend
  catalog/privacy gate accounts for the v2 migration's transactional
  temporary table/index definitions and private enforcement contracts.
- P2-T2 added the private enforcement audit repository, explicit legacy
  `event_schema` writes, public schema filtering, dual-schema purge
  validation, replay/conflict handling, and real SQLite regression tests.
- The P2-T2 file list omitted the two existing legacy audit writers in
  `sqlite-capability.repository.ts` and `sqlite-idempotency.repository.ts`;
  both received only the required explicit legacy schema column/value change.
- P2-T3 added the private capability issue/authentication branch, fixed grant
  shape, private capability-issued audit storage, and private-aware revoke
  projection. It preserves public-only administrator fixture construction by
  checking the private service method only for the private schema branch.
- P2-T3/P2-T4 RED/GREEN and verification evidence is recorded in
  `docs/progress.md`; no Phase 3-5 production file has been modified.
- P2-T5 focused controller/admission, shared body-reader, static gate, and
  real HTTP suites are green. The final P2 focused matrix is `129/129`, and
  the complete backend command is `552/550`; its two failures are the existing
  missing local `semgrep` and task-engine fixture expectation drift. The new
  P2 suites have no source or test failures. `npm run typecheck:backend` remains
  blocked by existing campaign/task-center/task-engine/supervision diagnostics.
- The P2 review-fix cycle is documented in `docs/progress.md`; SQLite and
  controller re-review findings are closed with `0 Critical / 0 Important /
  0 Minor` task reviews. The Phase 2 final gate review returned ALLOW; its
  documentation-only Minor was corrected, and no Phase 3 production file has
  been modified.
- GENERAL-004 P3-T1 is implemented and committed as `618d54f`; it adds the
  immutable config/runtime, public-index Engine composition, four-slot
  no-queue limit, fixed caller timeout, independent health domains, and
  plugin-private evaluation request-ID issuer. Its focused suite is `15/15`,
  the nested integration typecheck/build pass, the sandbox Engine regression is
  `1030/1030`, and the repository gate is `340/340`.
- The main-thread P3-T1 review found no Critical or Important issue. Two
  independent Luna reviewer attempts were unavailable because the selected
  model was at capacity; no external review PASS is claimed. P3-T2 has not
  started.
- GENERAL-003 implementation work remains complete through its phase- and
  P6-T4 review gates; its own global P6 gate remains outstanding, but the
  GENERAL-002 dependency is now satisfied.
- The P6 retry amendment remains complete through Task 6 documentation and
  repository gates. The fresh formal 300-projection capture and P7 replay are
  now recorded as accepted for GENERAL-002.
- GENERAL-002 is `VERIFIED`. GENERAL-004 Phase 2 and P3-T1 are complete, but
  do not claim `VERIFIED` for GENERAL-004 until its global completion gate
  passes; GENERAL-003 remains at its own global P6 gate.

## Next Transition

`PLAN_REVIEWED_PENDING_USER_APPROVAL` -> `PLAN_APPROVED` ->
`IMPLEMENTATION_IN_PROGRESS` -> `P2_T5_REVIEWED_PENDING_PHASE_2_GATE` ->
`PHASE_2_GATE_PENDING` -> `PHASE_2_COMPLETE_PENDING_NEXT_PHASE_APPROVAL` ->
`PHASE_3_IN_PROGRESS` -> `P3_T1_COMPLETE_PENDING_P3_T2`

The first transition records the user's explicit approval. The second records
that Phase 1 execution has begun. GENERAL-004 remains the only active
requirement; P3-T2 and later phases have not started.
