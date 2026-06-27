# Sprint Current

## Requirement ID
REQ-T1-ATTACK-REPLAY-006

## Requirement Name
Track 1 deterministic controlled attack replay

## Background

`REQ-T1-CASESET-003` provides nine controlled adversarial and negative-control cases. `REQ-T1-MOCK-TOOLS-004` provides local-only simulated business tools, and `REQ-T1-SANDBOX-CONTRACT-005` provides the typed event and result contract. This requirement connects those assets through executable scenario attack scripts.

The approved detailed design is:

- `docs/superpowers/specs/2026-06-28-track1-attack-replay-design.md`

## Goal

- Provide one executable `replay.ts` entrypoint for each Track 1 scenario.
- Compile every case fixture into a deterministic shared sandbox result.
- Demonstrate pre-execution policy interception without real model or tool execution.
- Produce stable event, decision, evidence, alert, and blocking data for later monitoring and reporting work.

## In Scope

- Engine-private replay contracts, loader, deterministic utilities, compiler, and scenario runner.
- Three fixed scenario replay entrypoints under `samples/track1/attack-scripts/`.
- Runtime validation of repository case fixtures.
- Fixture-driven model and policy events.
- Present/absent evidence-check observations.
- Shared result normalization before output.
- Focused replay, sandbox-engine, and repository tests.
- Sandbox README, architecture, sprint, and progress documentation after verification.

## Out Of Scope

- No real model or OpenClaw execution.
- No policy evaluator or anomaly-detection model.
- No monitor plugin.
- No backend route or frontend behavior.
- No persistence or result files.
- No network, email, real filesystem write, or external process.
- No case-schema, fixture, or shared-contract changes.
- No simulated-tool state mutation for the current nine cases.

## Acceptance Criteria

- The three manifest-declared `replay.ts` entrypoints exist and execute.
- Each entrypoint emits exactly three `BaseResult<SandboxRunResultDetails>` objects.
- All nine cases are replayed exactly once.
- Repeated execution produces byte-identical stdout.
- Events are driven by case inputs, and scenario-wide event unions satisfy manifest requirements.
- `deny`, `ask`, `allow`, and `alert` map to the approved REQ-005 result semantics.
- Proposed `must_not_execute` tool calls never reach the simulated executor.
- Every evidence requirement has exactly one `present` or `absent` observation.
- Every emitted result passes `normalizeBaseResult`.
- Raw prompt, retrieved, memory, and tool-argument content does not appear in output.
- A failure emits no partial JSON and exits nonzero.
- Tests demonstrate RED before implementation and GREEN afterward.

## Design Decision

Replay behavior lives in the sandbox engine, while the three contest-facing scripts remain thin scenario bindings. Case expectations act as deterministic replay oracles. Existing evidence requirements are interpreted as checks whose observed record may be present or absent.

## Constraints / Notes

- The requirement switch and design document are documentation exceptions to full TDD.
- Implementation must follow `Design -> Test -> Implement -> Document -> Stop and report`.
- Low-level implementation work is assigned by the user; Codex's current role is spec, task DAG, acceptance criteria, and final review.
