# Spec: Track 1 Sandbox Supervision Contract

## Objective

`REQ-T1-SANDBOX-CONTRACT-005` defines the shared, runtime-validatable contract for behavior-supervision event streams and sandbox policy outcomes.

The contract is consumed across sandbox replay, backend normalization, monitoring, supervision UI, and report evidence. It therefore belongs in `shared/`; policy matching and execution remain engine responsibilities.

This requirement delivers contracts and normalization only. It does not implement a policy evaluator.

## Approved Decisions

1. Core supervision types and runtime normalizers are shared across modules.
2. The canonical audit source is an ordered behavior-event stream.
3. Sandbox results also expose typed decision, alert, and blocking-record views for direct UI and report consumption.
4. Policy actions are exactly `allow`, `deny`, `ask`, and `alert`.
5. Sensitive prompt, response, email, file, API, and memory content is represented by references, summaries, or hashes rather than raw values.
6. The earlier placeholder alert shape using `action: "block"` is replaced. The shared normalizer no longer accepts that legacy structure.

## Policy Semantics

| Action | Execution semantics | Required supervision record |
| --- | --- | --- |
| `allow` | Continue execution. | Policy decision |
| `deny` | Do not execute the subject action. | Policy decision and blocking record |
| `ask` | Suspend execution pending human confirmation. It is not yet blocked. | Policy decision |
| `alert` | Continue execution while recording operator-visible risk. | Policy decision and alert |

Tool safety rejection from `REQ-T1-MOCK-TOOLS-004` remains separate from these policy actions.

## Shared Types

### Event Envelope

Every `SandboxBehaviorEvent` has:

```typescript
interface SandboxEventEnvelope {
  event_id: string;
  session_id: string;
  sequence: number;
  event_type: SandboxEventType;
  occurred_at: string;
  source: "model" | "agent" | "tool" | "policy" | "memory" | "monitor";
  scenario_id?: string;
  case_id?: string;
  evidence_refs: string[];
}
```

`sequence` is a positive integer scoped to one session. `occurred_at` is an ISO 8601 string.

### Event Union

`SandboxBehaviorEvent` is a closed discriminated union keyed by `event_type`:

| Event type | Typed payload purpose |
| --- | --- |
| `model_input` | Model and input evidence references, content digest, and optional summary |
| `model_output` | Model and output evidence references, content digest, and optional summary |
| `tool_request` | Call ID, tool name, target reference, and arguments evidence reference |
| `tool_result` | Call ID, tool name, result status, result evidence reference, and state-change summary |
| `policy_decision` | One complete `SandboxPolicyDecision` |
| `memory_write` | Memory entry ID, content evidence reference, content digest, and optional summary |
| `memory_read` | Memory entry ID, content evidence reference, content digest, and optional summary |

Raw sensitive content is not part of any payload.

### Policy Decision

```typescript
interface SandboxPolicyDecision {
  decision_id: string;
  subject_event_id: string;
  policy_id: string;
  action: "allow" | "deny" | "ask" | "alert";
  reason_code: string;
  reason: string;
  evidence_refs: string[];
  decided_at: string;
}
```

`subject_event_id` identifies the event being evaluated. A `policy_decision` event carries the decision in its payload and provides the decision's position in the session timeline.

### Alert

```typescript
interface SandboxAlert {
  alert_id: string;
  subject_event_id: string;
  decision_id: string;
  risk_level: RiskLevel;
  category: string;
  title: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}
```

### Blocking Record

```typescript
interface SandboxBlockedRecord {
  blocked_record_id: string;
  subject_event_id: string;
  decision_id: string;
  resource_ref?: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}
```

## Sandbox Result Projection

`SandboxRunResultDetails` gains typed supervision fields:

```typescript
interface SandboxRunResultDetails {
  session_id?: string;
  target?: TaskTarget;
  events?: SandboxBehaviorEvent[];
  policy_decisions?: SandboxPolicyDecision[];
  alerts?: SandboxAlert[];
  blocked_records?: SandboxBlockedRecord[];
  blocked?: boolean;
  event_count?: number;
}
```

Pending or running result shells may omit supervision collections. A terminal `finished` or `blocked` result must provide `session_id`, all four collections, `blocked`, and `event_count`.

## Runtime Normalization

The shared contract layer provides focused normalizers for events, decisions, alerts, blocking records, and complete sandbox details.

Normalization rules:

- Strip undeclared fields at every public boundary.
- Reject missing or malformed required fields.
- Reject unsupported event types, sources, statuses, risk levels, and policy actions.
- Reject non-positive or non-integer sequence values.
- Reject invalid ISO 8601 timestamps.
- Reject any collection if one of its members is malformed.
- Require event IDs and sequence values to be unique and sequences to be strictly increasing.
- Require every event to match the result `session_id`.
- Require each decision's `subject_event_id` to reference an event in the same stream.
- Require every materialized decision to match one `policy_decision` event.
- Require alert and blocking-record decision references to resolve.
- Require `event_count` to equal `events.length`.
- Require each `deny` decision to have a blocking record.
- Require each `alert` decision to have an alert.
- Require `blocked` to equal whether at least one blocking record exists.

No rule chooses an action in this requirement. Normalization validates an already-produced decision.

## Compatibility Decision

The existing sandbox alert example is an early placeholder rather than a live engine output. This requirement performs an approved controlled replacement:

- `action: "block"` is removed.
- Blocking becomes a `deny` policy decision plus `SandboxBlockedRecord`.
- Alerts become typed records linked to a policy decision.
- Existing backend creation behavior remains compatible because it emits an empty alert list.
- No REST route is added or removed.

## Project Structure

```text
shared/
  types/
    sandbox.ts
    result.ts
  contracts/
    sandbox.ts
    result.ts
  utils/
    normalizers.ts
  tests/
    sandbox-contract.spec.ts
    result-contract.spec.ts
  index.ts
  package.json

docs/
  superpowers/specs/2026-06-27-track1-sandbox-contract-design.md
  sprint-current.md
  architecture.md
  api-contract.md
  progress.md
```

## Testing Strategy

Implementation follows strict RED -> GREEN increments:

1. Shared contract tests first fail because sandbox types and normalizers do not exist.
2. Valid-event tests cover all seven event variants and sensitive-content stripping.
3. Invalid-event tests cover malformed envelopes, unsupported discriminants, invalid timestamps, and raw/unknown fields.
4. Decision tests cover all four actions and their required fields.
5. Result tests cover ordered timelines, resolved references, materialized-view consistency, counts, and blocking semantics.
6. Compatibility tests prove the legacy `action: "block"` alert is rejected.
7. Existing shared and repository contract suites remain green.

No new runtime or test dependency is required.

## Files Planned For Implementation

- Add `shared/types/sandbox.ts`.
- Add `shared/contracts/sandbox.ts`.
- Add `shared/tests/sandbox-contract.spec.ts`.
- Update `shared/types/result.ts`.
- Update `shared/utils/normalizers.ts`.
- Update `shared/contracts/result.ts`.
- Update `shared/tests/result-contract.spec.ts`.
- Update `shared/index.ts`.
- Update `shared/package.json`.
- Update `docs/architecture.md`, `docs/api-contract.md`, and `docs/progress.md` after verification.
- Check `README.md` and update it only if its public setup or capability summary becomes inaccurate.

## Out Of Scope

- Policy rule definitions or policy evaluation.
- Attack replay scripts.
- Model call-chain monitoring.
- Base-model detection or filtering.
- Backend route or task-orchestration changes.
- Frontend supervision views.
- Database or durable event storage.
- Real tool, model, email, filesystem, memory-service, or network integrations.

## Success Criteria

- All seven required event types have closed, exported, runtime-validatable payload contracts.
- All four approved policy actions have explicit semantics.
- Terminal sandbox results expose a consistent event stream plus typed decision, alert, and blocking views.
- Sensitive raw content and undeclared engine fields cannot cross the shared normalization boundary.
- Cross-record references, ordering, counts, and blocking semantics are validated.
- The legacy `block` alert shape is rejected and its migration is documented.
- Focused shared tests and repository contract tests pass.

