# Sandbox Security Evaluation Runtime Streaming Design

## Requirement

`REQ-SBX-GENERAL-006`: deliver the five sandbox-security workbench runtime
stages (`SOURCE`, `RULE`, `MODEL`, `JUDGE`, `DECISION`) as real incremental
results, then hand the final decision to the existing result presentation
without changing that presentation.

## Scope

This requirement adds a streaming delivery mode to the existing public
evaluation request. It does not change the meaning of `SandboxSecurityDecision`,
the existing JSON response mode, or the final workbench result components.

The accepted execution sequence is always:

```text
SOURCE -> RULE -> MODEL -> JUDGE -> DECISION
```

RULE, MODEL, and JUDGE may finish with a detector outcome of `matched`,
`no_match`, `failed`, `timeout`, `invalid_result`, or `skipped`. A skipped stage
is still emitted as a stage result, including short-circuit and routing skips.

## Architecture

The browser continues to submit `POST /api/sandbox/security/evaluations`, but
requests the streaming representation with `Accept: text/event-stream`.
Requests without that header continue to receive the existing JSON envelope.

```text
browser fetch
  -> public HTTP authentication, body validation, and idempotency
  -> evaluation service
  -> engine evaluate(request, onStage)
  -> bounded in-memory stage queue
  -> SSE response writer
  -> workbench runtime stage state
  -> final DECISION event
  -> existing result presentation
```

The engine invokes a narrow stage observer at the real terminal points:

- SOURCE after normalized input and the immutable detector snapshot exist.
- RULE after the rule slot reaches a terminal outcome.
- MODEL after the local-model slot reaches a terminal outcome.
- JUDGE after the external-judge slot reaches a terminal outcome, including a
  routing or short-circuit skip.
- DECISION is emitted by the evaluation service only after the engine result is
  normalized and the existing idempotency repository has persisted completion.

The observer writes a validated, content-free event into a queue with a maximum
of five stage events. Network backpressure never becomes part of the engine
work budget. A client disconnect propagates an `AbortSignal` to the evaluation
and disposes the queue.

Idempotency replay does not execute the engine again. The service synthesizes
the same five stage events from the current request and cached decision, marks
the delivery as replayed, and preserves the existing JSON replay response.

## Shared Event Contract

`SandboxSecurityEvaluationStreamEvent` is added to
`shared/types/sandbox-security-api.ts` and normalized by
`shared/contracts/sandbox-security-api.ts` with exact-key validation.

The stream uses standard SSE frames (`event:` and one JSON `data:` line).

Stage event shape:

```ts
{
  schema_version: "sandbox-security-evaluation-stream.v1",
  event_type: "stage",
  request_id: string,
  sequence: 1 | 2 | 3 | 4,
  stage: "source" | "rule" | "model" | "judge",
  status:
    | "completed"
    | "matched"
    | "no_match"
    | "failed"
    | "timeout"
    | "invalid_result"
    | "skipped",
  delivery: "live" | "replayed",
  result: {
    source_count?: number,
    tool_request_present?: boolean,
    detector_id?: string,
    detector_version?: string,
    detector_kind?: "rule" | "local_model" | "external_judge",
    obligation?: "profile_required" | "runtime_required" | "optional_not_selected",
    elapsed_ms?: number,
    error_code?: string,
    skip_reason?: string
  }
}
```

The decision event is:

```ts
{
  schema_version: "sandbox-security-evaluation-stream.v1",
  event_type: "decision",
  request_id: string,
  sequence: 5,
  stage: "decision",
  delivery: "live" | "replayed",
  decision: SandboxSecurityDecision
}
```

An error after the SSE headers are committed is represented by:

```ts
{
  schema_version: "sandbox-security-evaluation-stream.v1",
  event_type: "error",
  request_id: string,
  error_code: string,
  retryable: boolean
}
```

The event contract never contains submitted values, model output, rule
snippets, findings, credentials, or token material. Findings and `finding_ids`
remain part of the final decision only.

## Backend Boundaries

The existing JSON controller path remains authoritative for authentication,
request normalization, idempotency, concurrency, audit projection, and error
mapping. The streaming branch reuses those boundaries and changes only the
response representation.

The evaluation gateway receives an internal stage observer and maps engine
observations to the public shared event shape. Engine-private detector payloads
are never exposed to the frontend. The controller chooses JSON or SSE from the
validated `Accept` header. Before SSE headers are sent, validation and service
errors use the existing HTTP JSON error response. After headers are sent, the
writer sends one bounded `error` event and closes the stream.

Detector failures and timeouts remain fail-closed according to the current
engine behavior. If the engine cannot produce a final decision at all, the
stream ends with an error and does not fabricate missing stage results.

## Frontend Behavior

The sandbox workbench owns an in-memory `runtimeStages` collection. Each stage
event is validated and reconciled by sequence number. The loading and error
states render a fixed five-row runtime list with pending, terminal status,
elapsed time, and safe error or skip metadata.

When the decision event arrives, the page stores the existing
`SandboxSecurityDecision` and transitions to the current result branch. The
existing DOM order and presentation remain unchanged:

```text
EvidenceTrace -> DecisionSummaryPanel -> findings -> detectors -> ExecutionTrace
```

The stream client uses the existing authorization and idempotency headers and
does not place content or stage data in URL state, browser storage, telemetry,
or durable audit. Retry keeps the current idempotency key for an unchanged
request and starts a fresh stream.

## Failure and Compatibility Rules

- Pre-header failures retain the existing HTTP status and JSON error envelope.
- Post-header failures emit only the bounded content-free `error` event.
- A detector terminal failure is a stage result, not a transport failure.
- Client disconnect aborts execution and releases the engine slot.
- JSON clients and all existing audit/evaluation routes remain compatible.
- The final decision is not handed to the existing result UI until completion
  persistence succeeds.

## Test Plan

RED tests must be written before production changes and must fail for the
intended missing behavior.

- Shared contract tests reject malformed, reordered, extra-key, and
  content-bearing stream events and accept all five ordered stages.
- Engine tests prove observer order, one terminal event per detector stage,
  explicit short-circuit/routing skips, and no callback for an evaluation that
  fails before source snapshot creation.
- Backend service and controller tests prove live SSE framing, final-event
  persistence ordering, replay synthesis, pre-header JSON compatibility,
  post-header error events, and abort propagation.
- Frontend stream-client tests prove SSE parsing, sequence validation, error
  mapping, and authorization/idempotency headers.
- Workbench page tests prove each stage appears as it arrives and that the
  final decision still renders the existing result interface.
- The existing frontend, backend, shared, repository, and privacy test suites
  remain green.

## Planned File Changes

Shared:

- `shared/types/sandbox-security-api.ts`
- `shared/contracts/sandbox-security-api.ts`
- `shared/index.ts`

Engine:

- `engines/sandbox/src/security/engine.ts`
- `engines/sandbox/src/security/index.ts`
- a focused stage-observation type module if needed to keep the engine boundary
  small

Backend:

- `backend/src/common/http/http-response.ts`
- `backend/src/app.module.ts`
- `backend/src/modules/sandbox-security/sandbox-security.controller.ts`
- `backend/src/modules/sandbox-security/evaluation.service.ts`
- `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- `backend/src/modules/sandbox-security/ports/evaluation.gateway.ts`
- `backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts`

Frontend:

- `frontend/src/services/api-client.ts`
- `frontend/src/services/sandbox-security-service.ts`
- `frontend/src/pages/SandboxSecurityWorkbenchPage.tsx`
- `frontend/src/components/sandbox-security/EvaluationInspector.tsx`
- a focused runtime-stage presentational component if needed

Tests and docs will be added or updated alongside each boundary. No existing
result presentation component is planned for behavioral changes.
