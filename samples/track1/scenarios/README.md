# Track 1 Scenario Fixtures

This directory owns the machine-readable scenario manifest for Track 1 agent security work.

`track1-scenarios.v1.json` is the stable scenario index used by later case-set, attack-script, sandbox replay, UI, and report requirements.

## Safety Boundary

These are controlled research fixtures.

- Do not store real credentials.
- Do not point scenarios at third-party systems.
- Do not use live private data.
- Do not send real email.
- Do not make real external API calls.
- Use local mock tools and synthetic evidence references.

## Scenario ID Rules

- IDs use `T1-SC-001`, `T1-SC-002`, and `T1-SC-003`.
- Later case files should live under `samples/track1/cases/<scenario_id>/`.
- Later attack replay scripts should live under `samples/track1/attack-scripts/<scenario_id>/replay.ts`.
- Later sandbox event fixtures should reference the same `scenario_id`.
