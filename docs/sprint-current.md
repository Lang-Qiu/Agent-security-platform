# Sprint Current

## Requirement ID
REQ-T1-MOCK-TOOLS-004

## Requirement Name
Track 1 simulated business tool contract and in-memory execution

## Background

`REQ-T1-CASESET-003` created nine controlled cases that reference `send_email`, `read_file`, `write_file`, and `call_api`. This requirement gives those names a typed, executable, and strictly local tool boundary for later monitoring and replay work.

The detailed design is:

- `docs/superpowers/specs/2026-06-27-track1-mock-tools-design.md`

## Goal

- Define discriminated request/result contracts for all four simulated tools.
- Validate untrusted tool requests before execution.
- Execute all behavior against injected in-memory state.
- Produce deterministic evidence metadata for later sandbox events.
- Make unsafe targets fail closed without introducing policy-decision behavior.

## In Scope

- Engine-private tool contracts under `engines/sandbox/src/simulated-tools/`.
- Runtime request normalization.
- In-memory email outbox.
- Virtual `sandbox://fixtures/` file storage.
- Mock `mock://api.local/` route storage.
- Deterministic tool results and safety rejection codes.
- Sandbox engine unit tests and root test-script integration.
- Sandbox README, architecture, and progress updates after verification.

## Out of Scope

- No real SMTP or email delivery.
- No host filesystem reads or writes.
- No real network calls.
- No public REST API or backend task-center changes.
- No frontend changes.
- No `shared/` contract changes.
- No sandbox policy decisions or typed monitoring events.
- No attack replay scripts.

## Acceptance Criteria

- `send_email`, `read_file`, `write_file`, and `call_api` each have a typed request variant.
- Runtime normalization rejects malformed requests, unknown fields, and unsupported tool names.
- Successful calls mutate or read only injected in-memory state.
- Email recipients are restricted to `local.invalid`.
- File paths are restricted to normalized `sandbox://fixtures/` paths.
- API endpoints are restricted to `mock://api.local/`.
- Rejected calls return stable rejection codes and do not mutate state.
- Results preserve case/session/scenario correlation and deterministic evidence.
- Tests show RED before implementation and GREEN afterward.
- `npm.cmd run test:engine:sandbox` and `npm.cmd run test:repo` pass.

## Design Decision

The tool contract remains engine-private and uses deterministic per-instance in-memory execution. Safety rejection stays separate from `allow`, `deny`, `ask`, and `alert` policy decisions.

## Constraints / Notes

- This requirement switch and design draft are documentation exceptions to full TDD.
- Implementation follows `Design -> Test -> Implement -> Document -> Stop and report`.
