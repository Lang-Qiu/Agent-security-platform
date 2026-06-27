# Sprint Current

## Requirement ID
REQ-T1-SANDBOX-CONTRACT-005

## Requirement Name
Track 1 typed sandbox behavior-supervision contract

## Background

`REQ-T1-MOCK-TOOLS-004` created deterministic simulated business actions and preserved session, scenario, case, call, and evidence correlation. This requirement defines the shared event and policy-result contract that later replay, monitoring, UI, and report requirements will use to observe those actions.

The approved detailed design is:

- `docs/superpowers/specs/2026-06-27-track1-sandbox-contract-design.md`

## Goal

- Define a closed, typed union for behavior-supervision events.
- Define explicit `allow`, `deny`, `ask`, and `alert` policy decisions.
- Define typed alert and blocking records.
- Expose a canonical event stream plus materialized supervision views in sandbox results.
- Validate ordering, references, counts, action semantics, and sensitive-data boundaries at runtime.

## In Scope

- Cross-module sandbox supervision types under `shared/`.
- Runtime normalization for events, decisions, alerts, blocking records, and sandbox result details.
- Additive sandbox result fields for events, decisions, and blocking records.
- A controlled replacement of the legacy `action: "block"` alert placeholder.
- Shared contract tests.
- Shared exports and test-script registration.
- Architecture, API-contract, and progress documentation after verification.

## Out of Scope

- No policy evaluator or rule engine.
- No attack replay scripts.
- No model call-chain monitoring plugin.
- No base-model filter.
- No backend route or orchestration changes.
- No frontend changes.
- No persistence or external integration.
- No changes to simulated-tool execution.

## Acceptance Criteria

- Seven event variants are exported and runtime-validatable: `model_input`, `model_output`, `tool_request`, `tool_result`, `policy_decision`, `memory_write`, and `memory_read`.
- Raw sensitive content is not admitted into normalized event payloads.
- Policy actions are limited to `allow`, `deny`, `ask`, and `alert`.
- `deny` requires a blocking record; `alert` requires an alert record.
- Event IDs and sequence values are unique, with sequences strictly increasing.
- Cross-record event and decision references resolve inside one session.
- `event_count` and `blocked` agree with the normalized collections.
- Terminal sandbox results require complete supervision collections.
- The legacy `action: "block"` alert shape is rejected.
- Tests demonstrate RED before implementation and GREEN afterward.
- Focused shared and repository contract suites pass.

## Design Decision

The event, decision, alert, and blocking-record contracts live in `shared/` because replay, backend, frontend, monitoring, and report layers will consume them. Policy evaluation remains an engine responsibility and is not implemented by this requirement.

## Constraints / Notes

- The requirement switch and design document are documentation exceptions to full TDD.
- The shared-contract creation and controlled legacy replacement were explicitly approved before implementation.
- Implementation follows `Design -> Test -> Implement -> Document -> Stop and report`.
