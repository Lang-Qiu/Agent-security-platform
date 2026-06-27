# Track 1 Scenario Fixtures

This directory owns the machine-readable scenario manifest for Track 1 agent security work.

`track1-scenarios.v1.json` is the stable scenario index used by later case-set, attack-script, sandbox replay, UI, and report requirements.

## Safety Boundary

These are controlled research fixtures.

- Do not store real credentials.
- Do not perform third-party targeting.
- Do not use live private data.
- Do not send real email.
- Do not make real external API calls.
- Do not perform external exfiltration.
- Use local mock tools and synthetic evidence references.

Prohibited behavior labels: `real credential use`, `real external API calls`, `real email delivery`, `external exfiltration`, `third-party targeting`.

## Scenario ID Rules

- IDs use `T1-SC-001`, `T1-SC-002`, and `T1-SC-003`.
- Later case files should live under `samples/track1/cases/<scenario_id>/`.
- Later attack replay scripts should live under `samples/track1/attack-scripts/<scenario_id>/replay.ts`.
- Later sandbox event fixtures should reference the same `scenario_id`.

## Scenario Paths

| Scenario ID | Case Fixture Directory | Replay Entrypoint |
| --- | --- | --- |
| `T1-SC-001` | `samples/track1/cases/T1-SC-001/` | `samples/track1/attack-scripts/T1-SC-001/replay.ts` |
| `T1-SC-002` | `samples/track1/cases/T1-SC-002/` | `samples/track1/attack-scripts/T1-SC-002/replay.ts` |
| `T1-SC-003` | `samples/track1/cases/T1-SC-003/` | `samples/track1/attack-scripts/T1-SC-003/replay.ts` |
