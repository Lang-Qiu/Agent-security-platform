# Sprint Current

## Requirement ID
REQ-T1-SCENARIO-002

## Requirement Name
Track 1 attack scenario matrix

## Background

`REQ-T1-SPEC-001` defined the Track 1 direction and selected the outcome-loop-first approach. The next requirement is to make the first three Track 1 attack scenarios explicit, testable, and reusable by later case-set, attack-script, sandbox, UI, and report requirements.

## Goal

- Define the first three controlled Track 1 attack scenarios.
- Provide a machine-readable scenario manifest.
- Provide a human-readable acceptance matrix.
- Make scenario IDs stable for later fixtures and scripts.
- Keep the work limited to docs, fixtures, and repository tests.

## In Scope

- Create `samples/track1/scenarios/track1-scenarios.v1.json`.
- Create `samples/track1/scenarios/README.md`.
- Create `docs/track1/scenario-acceptance-matrix.md`.
- Add repository tests for required scenario fields and documentation coverage.
- Update `docs/progress.md` after verification.

## Out of Scope

- No adversarial case JSON files yet.
- No attack replay scripts yet.
- No simulated business tool implementation yet.
- No sandbox event contract changes yet.
- No frontend or backend production code changes.
- No OpenClaw runtime integration.

## Acceptance Criteria

- The manifest includes at least the required attack classes: `prompt_injection_jailbreak`, `tool_call_hijacking`, and `context_memory_poisoning`.
- Each scenario defines case requirements, attack-script requirements, simulated tools, expected policy actions, and report evidence requirements.
- The matrix document references every scenario ID from the manifest.
- Repository tests fail before the manifest/docs exist and pass after the requirement is implemented.
- `npm run test:repo` passes, or any failure is clearly identified as unrelated and pre-existing.

## Constraints / Notes

- This requirement is still pre-production Track 1 scaffolding.
- Scenario content must remain controlled and research-oriented.
- Do not add real credentials, live targets, real email delivery, or real external API calls.
