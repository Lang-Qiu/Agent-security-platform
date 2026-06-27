# Sprint Current

## Requirement ID
REQ-T1-CASESET-003

## Requirement Name
Track 1 adversarial and jailbreak case set

## Background

`REQ-T1-SCENARIO-002` established three stable Track 1 scenario IDs, their required case types, safety boundaries, policy expectations, and evidence requirements. This requirement turns that matrix into a reusable, machine-validated case set for later attack replay, filtering, sandbox supervision, and report evidence.

Canonical scenario definitions remain in:

- `samples/track1/scenarios/track1-scenarios.v1.json`
- `docs/track1/scenario-acceptance-matrix.md`

## Goal

- Define one durable JSON schema for Track 1 adversarial, jailbreak, and negative-control cases.
- Create the first nine controlled fixtures: three cases for each existing scenario.
- Give every fixture stable scenario and case identifiers.
- Record expected model behavior, policy action, tool behavior, and evidence references without executing an attack.
- Keep all content synthetic, local, deterministic, and suitable for repository tests.

## Proposed Case Contract

Each case should define at least:

- schema version, case ID, scenario ID, title, and case type
- test category: `adversarial`, `jailbreak`, or `negative_control`
- synthetic input payload and controlled context or memory references
- expected model behavior and prohibited model behavior
- expected policy action and expected simulated tool behavior
- required evidence references
- explicit research-safety declarations

Exact field names and required/optional rules must be finalized in the design before RED tests are written.

## In Scope

- Add a versioned JSON case schema under `samples/track1/cases/`.
- Add exactly three seed fixtures under each of:
  - `samples/track1/cases/T1-SC-001/`
  - `samples/track1/cases/T1-SC-002/`
  - `samples/track1/cases/T1-SC-003/`
- Cover every `required_case_types` entry from the scenario manifest exactly once in the seed set.
- Add a case-set README or index describing IDs, paths, safety rules, and future replay ownership.
- Add repository tests for schema shape, scenario linkage, coverage, uniqueness, policy expectations, and prohibited real-world behavior.
- Add the new repository test to the root `test:repo` gate.
- Update `docs/progress.md` after verification.

## Out of Scope

- No attack replay script implementation.
- No simulated email, file, or API tool implementation.
- No sandbox event or public API contract changes.
- No frontend or backend production behavior changes.
- No real model calls, OpenClaw runtime integration, live credentials, external delivery, or third-party targeting.
- No large-scale corpus generation or model-quality benchmark.

## Acceptance Criteria

- A versioned JSON schema defines the case contract and rejects missing or invalid required fields.
- The seed set contains exactly nine fixtures, with three fixtures linked to each existing scenario ID.
- Every scenario manifest `required_case_types` value is represented exactly once.
- Every case ID is unique and follows a stable scenario-scoped naming convention.
- Every case records explicit expected model, policy, tool, and evidence outcomes.
- Every case is synthetic and declares that real credentials, real email delivery, real external API calls, external exfiltration, and third-party targeting are prohibited.
- Repository tests demonstrate RED before fixtures/schema completion and GREEN afterward.
- `npm run test:repo` passes.

## Design Decision

Negative-control fixtures use the non-blocking `allow` expectation so later filtering and supervision requirements can measure false positives. The scenario manifest `expected_policy_actions` includes `allow` for this purpose.

## Constraints / Notes

- This file update is a documentation/configuration exception to full TDD; no production behavior changes here.
- Implementation follows `Design -> Test -> Implement -> Document -> Stop and report`.
