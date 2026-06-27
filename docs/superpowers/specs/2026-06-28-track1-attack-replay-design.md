# Spec: Track 1 Controlled Attack Replay

## Objective

`REQ-T1-ATTACK-REPLAY-006` delivers three executable, deterministic attack replay scripts for the Track 1 scenarios:

- prompt injection and jailbreak;
- tool-call hijacking;
- context and memory poisoning.

The scripts consume the nine controlled `track1-case.v1` fixtures and compile them into shared sandbox results. They provide contest-ready agent attack scripts and a stable event source for later monitoring, supervision UI, and report requirements without calling a real model or touching a live system.

Success means each scenario entrypoint emits exactly three valid `BaseResult<SandboxRunResultDetails>` objects, reproduces byte-identical JSON on repeated runs, and demonstrates pre-execution policy interception with no real side effects.

## Approved Decisions

1. Model behavior is fixture-driven. `expected_outcome` is the replay oracle; no real model is called.
2. Tool execution is policy-gated. `deny`, `ask`, and every current `must_not_execute` case never invoke `SimulatedToolExecutor`.
3. Each case produces a complete shared `BaseResult<SandboxRunResultDetails>`.
4. Existing `evidence_requirements` values are evidence checkpoints. A checkpoint may record either `present` or `absent`; it does not force an alert or blocking record to exist.
5. Scenario `required_events` are satisfied by the union of event types across that scenario's three case results, not by every individual case.
6. Replay output is byte-for-byte deterministic for the same repository state and case input.
7. Replay domain behavior is owned by `engines/sandbox`; the three contest scripts are thin scenario-specific entrypoints.

## Inputs

The canonical input sources remain:

```text
samples/track1/scenarios/track1-scenarios.v1.json
samples/track1/cases/track1-case.schema.json
samples/track1/cases/T1-SC-001/*.json
samples/track1/cases/T1-SC-002/*.json
samples/track1/cases/T1-SC-003/*.json
```

The loader accepts no arbitrary path argument. Each entrypoint is statically bound to one scenario ID and its repository-owned case directory.

The runtime case contract mirrors the existing closed JSON schema:

- fixed `track1-case.v1` schema version;
- case ID must belong to the entrypoint's scenario;
- supported test categories and policy actions only;
- supported simulated tool names only;
- controlled-research safety fields must retain their exact values;
- unknown fields and unsupported evidence requirements are rejected.

No existing scenario, case schema, or case fixture is changed by this requirement.

## Architecture

### Sandbox Replay Core

```text
engines/sandbox/src/replay/
  contract.ts
  loader.ts
  deterministic.ts
  compiler.ts
  runner.ts
  index.ts
```

Responsibilities:

- `contract.ts`: engine-private case, replay metadata, evidence-check, and stable error types.
- `loader.ts`: parse JSON with structured runtime validation and scenario/path confinement.
- `deterministic.ts`: derive IDs, SHA-256 digests, evidence references, and logical timestamps.
- `compiler.ts`: compile one validated case into one shared sandbox `BaseResult`.
- `runner.ts`: load all cases for a scenario, validate manifest coverage, normalize every result through the shared contract, and serialize the final array.
- `index.ts`: expose only the replay capability required by the entrypoints and tests.

The replay core depends on:

- existing shared task/result/sandbox contracts;
- the existing scenario and case fixtures;
- Node.js built-ins for JSON file reads and SHA-256;
- the simulated-tool request contract for tool-name and argument compatibility.

The replay core does not depend on backend or frontend modules.

### Scenario Entrypoints

```text
samples/track1/attack-scripts/T1-SC-001/replay.ts
samples/track1/attack-scripts/T1-SC-002/replay.ts
samples/track1/attack-scripts/T1-SC-003/replay.ts
```

Each entrypoint:

1. binds one fixed scenario ID;
2. runs the shared replay core for that scenario;
3. writes only the JSON result array to stdout;
4. writes a stable error code and message to stderr on failure;
5. sets a nonzero process exit code on failure;
6. never writes a result file or partial JSON.

## Commands

Run one scenario:

```powershell
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-001/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-002/replay.ts
node --experimental-strip-types samples/track1/attack-scripts/T1-SC-003/replay.ts
```

Focused verification:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-replay-loader.spec.ts
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-replay-compiler.spec.ts
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-replay-entrypoints.spec.ts
npm.cmd run test:engine:sandbox
npm.cmd run test:repo
```

No new runtime or test dependency is introduced.

## Single-Case Replay Flow

One validated case is compiled in this order:

1. Emit `memory_write` and then `memory_read` for each declared memory entry.
2. Emit `model_input` using only a fixture reference, SHA-256 digest, and non-sensitive summary.
3. Emit deterministic `model_output` from `expected_outcome.model_behavior`.
4. Emit `tool_request` only when `input.proposed_tool_call` exists.
5. Emit the primary `policy_decision` from `expected_outcome.policy_action`.
   - A tool-bearing case targets the `tool_request` event.
   - A case without a tool request targets the `model_output` event.
6. Emit a rejected `tool_result` only when the scenario manifest requires that event type.
   - `status` is `rejected`.
   - `state_change` is `none`.
   - The simulated tool executor is not invoked.

Event sequences are positive, unique, and strictly increasing. Every event carries the scenario ID, case ID, session ID, and deterministic evidence references.

No empty tool or memory event is fabricated. A scenario passes manifest coverage when the union of event types across its three case results contains every declared `required_events` value.

## Result Mapping

Every case produces:

```typescript
BaseResult<SandboxRunResultDetails>
```

Policy actions map to terminal results as follows:

| Policy action | Result status | Risk level | `blocked` | Materialized record |
| --- | --- | --- | ---: | --- |
| `allow` | `finished` | `info` | `false` | none |
| `ask` | `finished` | `medium` | `false` | none |
| `alert` | `finished` | `high` | `false` | one `SandboxAlert` |
| `deny` | `blocked` | `high` | `true` | one `SandboxBlockedRecord` |

The result includes:

- deterministic task, session, event, decision, alert, and blocked-record IDs;
- ordered events;
- materialized policy decisions;
- action-consistent alerts and blocked records;
- `event_count === events.length`;
- a summary derived from the case title and expected action;
- replay metadata and evidence-check outcomes.

The compiler submits the candidate result to `normalizeBaseResult`. A null normalized result raises `replay_result_invalid`; unnormalized output is never emitted.

## Replay Metadata And Evidence Checks

`BaseResult.metadata.replay` uses this engine-private shape:

```typescript
interface Track1ReplayMetadata {
  schema_version: "track1-replay.v1";
  scenario_id: string;
  case_id: string;
  test_category: "adversarial" | "jailbreak" | "negative_control";
  expected_policy_action: "allow" | "deny" | "ask" | "alert";
  evidence_checks: Track1ReplayEvidenceCheck[];
}

interface Track1ReplayEvidenceCheck {
  requirement: string;
  observation: "present" | "absent";
  evidence_ref: string;
}
```

Each case's `expected_outcome.evidence_requirements` entry appears exactly once and in declaration order.

| Requirement | Observation source |
| --- | --- |
| `prompt_sample_ref` | `model_input` evidence |
| `filter_decision` | primary policy-decision evidence |
| `policy_decision` | primary policy-decision evidence |
| `tool_request_ref` | presence or absence of `tool_request` |
| `memory_entry_ref` | presence or absence of memory events |
| `sandbox_alert` | presence or absence of a typed alert |
| `blocked_record` | presence or absence of a typed blocked record |
| `report_evidence_ref` | deterministic case replay summary evidence |

An `absent` observation is valid evidence. In particular, negative-control cases can prove that no false-positive alert or blocking record was emitted.

Unknown evidence requirements fail closed with `unsupported_evidence_requirement`.

## Determinism

The replay core does not use `Date.now()`, random UUIDs, network state, or environment-dependent IDs.

- IDs are derived from scenario ID, case ID, record kind, and sequence.
- Logical timestamps use one fixed UTC base and advance by event sequence.
- Digests use SHA-256 over compiler-created canonical strings with fixed field order.
- Case files are sorted by case ID before compilation.
- Evidence checks retain fixture declaration order.
- JSON serialization uses the same stable object construction order on every run.

For a fixed commit and case set, two executions of the same entrypoint must produce deeply equal values and identical stdout bytes.

## Failure Handling

Replay failures use a stable engine-private code:

```typescript
type Track1ReplayErrorCode =
  | "case_not_found"
  | "case_invalid"
  | "scenario_mismatch"
  | "manifest_mismatch"
  | "unsupported_evidence_requirement"
  | "unsafe_tool_execution_requested"
  | "replay_result_invalid";
```

The runner is atomic at scenario scope:

- all three cases must load and compile;
- every result must pass the shared normalizer;
- manifest event coverage must pass;
- otherwise no JSON array is written to stdout.

Expected validation failures are reported with their stable code. Unexpected programmer errors are not converted into successful replay output.

## Safety Boundaries

Always:

- read only the repository-owned scenario manifest and fixed case directories;
- preserve controlled-research and no-network constraints;
- represent prompt, retrieved, memory, and tool-argument content through references, hashes, and safe summaries;
- reject malformed or scenario-mismatched cases before event compilation;
- keep all IDs and outputs deterministic;
- validate final results with the shared sandbox contract.

Ask first:

- changing the existing case schema or any of the nine case fixtures;
- introducing a new shared contract;
- enabling simulated tool state mutation;
- adding output files, persistence, backend routes, or frontend behavior;
- introducing a model provider or OpenClaw runtime dependency.

Never:

- call a real model;
- use credentials, tokens, or live private data;
- send email, call a network endpoint, or touch a real memory service;
- execute a proposed tool call marked `must_not_execute`;
- read arbitrary caller-supplied paths;
- include raw prompt, retrieved content, memory content, or tool argument bodies in replay output;
- emit partial scenario output after a failure.

## Testing Strategy

Implementation follows strict RED -> GREEN increments.

### Loader And Contract Tests

- All nine repository cases load successfully.
- Missing files, unknown keys, malformed IDs, wrong scenario IDs, unsupported tools/actions, and invalid safety fields are rejected.
- Caller-controlled paths and path traversal are impossible.
- Unsupported evidence requirements are rejected.

### Compiler Tests

- Synthetic in-memory cases cover all four policy actions.
- Each action maps to the approved status, risk, blocking, alert, and materialized-record semantics.
- Event order, sequence, references, hashes, and timestamps are deterministic.
- Tool-bearing `deny` and `ask` cases do not invoke the simulated executor.
- A required rejected `tool_result` has `state_change: "none"`.
- Every expected evidence checkpoint is represented exactly once as `present` or `absent`.
- Raw fixture content and tool arguments do not appear in serialized output.
- Every compiled result passes `normalizeBaseResult`.

### Scenario And Entrypoint Tests

- Each fixed entrypoint emits exactly three results.
- Result case IDs match the bound scenario and are sorted.
- The scenario-wide event union covers every manifest-required event type.
- Running the same entrypoint twice produces byte-identical stdout.
- Failure writes no partial JSON and returns a nonzero exit status.

### Safety And Gate Tests

- No HTTP, SMTP, model SDK, external process, or real file-write dependency is introduced.
- Current replay leaves simulated-tool state unchanged.
- Replay tests are included in `test:engine:sandbox`.
- Repository tests verify the three required entrypoints and root gate registration.
- Existing shared, sandbox, repository, backend, and frontend behavior remains unchanged apart from the new scripts and tests.

## Planned Project Structure

```text
engines/sandbox/
  src/replay/
    contract.ts
    loader.ts
    deterministic.ts
    compiler.ts
    runner.ts
    index.ts
  tests/
    attack-replay-loader.spec.ts
    attack-replay-compiler.spec.ts
    attack-replay-entrypoints.spec.ts
  README.md

samples/track1/attack-scripts/
  README.md
  T1-SC-001/replay.ts
  T1-SC-002/replay.ts
  T1-SC-003/replay.ts

tests/repository/
  track1-attack-replay.spec.ts

docs/
  sprint-current.md
  architecture.md
  progress.md
```

Implementation will also update root and sandbox test scripts. `docs/api-contract.md` is checked but remains unchanged because no shared or public API contract is added.

## Out Of Scope

- Real model or agent execution.
- Policy evaluation or anomaly detection.
- Monitor-plugin interception.
- OpenClaw integration.
- Backend orchestration or public REST routes.
- Frontend supervision views.
- Persistent event or evidence storage.
- File output or report generation.
- Changes to the existing shared sandbox contract.
- Changes to the nine case fixtures or their schema.
- Simulated tool state mutation for the current case set.

## Success Criteria

- All three required `replay.ts` entrypoints exist and are executable.
- Each entrypoint emits exactly three complete, normalized shared sandbox results.
- All nine case fixtures are replayed exactly once.
- Every case produces deterministic model and policy events.
- Tool and memory events are emitted only when the case input supports them.
- Proposed unsafe tool calls are intercepted before execution.
- Scenario event unions satisfy all manifest requirements.
- Evidence requirements are represented exactly once with a present/absent observation.
- Action semantics and terminal result invariants match REQ-005.
- Repeated replay produces byte-identical JSON.
- No raw sensitive fixture content or real side effect crosses the replay boundary.
- Focused replay, sandbox-engine, and repository gates pass.
- Architecture, sandbox README, sprint, and progress documentation describe the implemented boundary.

## Open Questions

None. All product and architecture decisions required for this requirement are approved.
