# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-004

## Requirement Name

OpenClaw sandbox security enforcement

## Status

SPEC_DRAFT_PENDING_USER_REVIEW

## Transition Authority

GENERAL-003 is complete at `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. The user
instructed the project to begin GENERAL-004 specification writing after the
GENERAL-003 task group was completed and accepted. The GENERAL-004 design was
reviewed and approved section by section during the design dialogue. This
active sprint records the written specification as awaiting explicit user
review; it does not authorize implementation-plan writing or production code.

This is a documentation-only transition and is therefore exempt from the
RED/GREEN TDD sequence. No business behavior is changed by this sprint update.

## Canonical Inputs

- `metadata.md`
- `AGENTS.md`
- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- `docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`
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

GENERAL-002 remains `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`. Its formal
signed P6 evidence and successful gated hermetic replay are absent. This does
not permit GENERAL-002 or GENERAL-003 to claim `VERIFIED`, and GENERAL-004
must inherit the same dependency boundary.

The highest valid GENERAL-003 status is
`IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. `npm run test:all` must still be
attempted during implementation and its expected dependency-bounded
fail-closed result reported honestly.

The GENERAL-002 P6 retry amendment is implemented through Task 6
documentation and permanent repository gates. GENERAL-002 still requires a
fresh full 300-input P6 capture, an accepted seal and receipt chain, and a
successful hermetic replay before any `VERIFIED` transition. This fixed P6
policy does not authorize caller-configurable retry and does not change
GENERAL-003's out-of-scope retry rule.

## Current Work

- The approved written draft is now at
  `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`.
- The final independent read-only specification re-review returned `PASS` with
  zero Critical, Important, or Minor findings after all earlier findings were
  corrected.
- No GENERAL-004 production files, tests, architecture/API implementation
  claims, or frontend files have been added.
- The next gate is explicit user review of the written specification. Only
  after approval may an implementation plan be written and independently
  reviewed.
- GENERAL-003 implementation work remains complete through its phase- and
  P6-T4 review gates, bounded by the unresolved GENERAL-002 global P6 gate.
- The P6 retry amendment remains complete through Task 6 documentation and
  repository gates, but no fresh full 300-input capture has been run.
- Do not claim `VERIFIED` for GENERAL-002, GENERAL-003, or GENERAL-004 until
  the required signed P6 recapture and hermetic replay are accepted.

## Next Transition

`SPEC_DRAFT_PENDING_USER_REVIEW` -> `SPEC_APPROVED_PENDING_PLAN`

The transition requires the user to review the written spec and explicitly
approve it. Until then, stop after documentation verification and do not begin
implementation or the next requirement.
