# Sandbox Security P6 Capture Observability Design

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-04`
- Status: `SUPERSEDED`
- Scope: P6 controlled live capture diagnostics only

> Superseded by the approved
> [P6 Candidate Progress Persistence Design](./2026-08-04-sandbox-security-p6-candidate-progress-design.md).
> The repository now persists the cumulative, content-free candidate decision
> projection required for recovery. The diagnostic sidecar and latency
> statistics described here are not part of the current requirement and must
> not be implemented as a parallel capture protocol.

## Problem

P6 capture currently exposes a final stage result but does not retain a
per-input progress trace or a per-input latency distribution. A long-running
serial capture can therefore provide no reliable count of completed inputs and
no evidence-backed explanation of a Judge latency tail when the run fails
before candidate admission. The v6-01 run demonstrated this gap.

The requested observability must survive a failed live run while preserving the
existing truth-blind capture boundary and the formal evidence contract.

## Goals

- Record progress while the 300-input capture is running.
- Preserve completed progress and timing data when capture fails mid-run.
- Record one monotonic elapsed duration for each completed input.
- Produce deterministic latency summary statistics, including min, mean, p50,
  p90, p95, p99, and max.
- Identify provider outcome classes and Judge timeout termination without
  retaining provider bodies or benchmark content.
- Keep candidate hashes, signed receipts, seals, P7 replay inputs, retry
  policy, fallback policy, and acceptance thresholds unchanged.

## Non-Goals

- No retry, fallback, alternate provider, response repair, or scheduling
  change.
- No change to the serial P6 execution model.
- No fixture body, fixture ID, truth label, category label from truth, raw
  request, raw response, credential, or provider prose in diagnostics.
- No promotion of diagnostic timing data into formal acceptance evidence.
- No new public API or frontend behavior.

## Design

### Data Flow

The capture child measures each evaluation with the existing monotonic runtime
clock. It emits bounded, content-free progress frames over its existing stdout
pipe. The capture worker consumes those frames while the child is alive and
writes them to a fresh run-local diagnostic sidecar. The worker closes the
sidecar and writes a summary when the child exits, including the failed path.

```text
capture-live.ts
  -> monotonic input timing
  -> content-free progress frame
  -> child stdout pipe
  -> capture-live-worker.ts
  -> capture-progress.jsonl
  -> capture-latency-summary.json
```

The sidecar is owned by the capture worker, not the permission-limited capture
child. This avoids expanding the child's filesystem write allowlist. The
worker creates a new exclusive mode-`600` file, appends complete frames, and
fsyncs each frame. A partial final line is ignored by summary parsing and does
not affect the capture admission decision.

### Progress Record

The diagnostic stream uses the fixed schema
`sandbox-security-p6-progress.v1`. The minimum input-complete frame is:

```json
{
  "schema_version": "sandbox-security-p6-progress.v1",
  "event": "input_complete",
  "input_ordinal": 127,
  "fixture_count": 300,
  "completed_count": 127,
  "elapsed_ms": 8421,
  "cumulative_elapsed_ms": 1084321,
  "ollama_status": "response",
  "judge_status": "signal_termination",
  "judge_termination_reason": "slot_timeout"
}
```

The stream emits exactly three event types:

- `capture_started`: fixture count and zero completed inputs;
- `input_complete`: the frame shown above, once for each successfully returned
  `engine.evaluate` call;
- `capture_failed`: completed count, failure ordinal when known, and one
  bounded capture error code.

An `input_started` event is not required because the durable completed count is
the primary progress contract and a failed in-flight evaluation is represented
by `capture_failed`. All fields are closed enums or bounded non-negative
integers. `input_ordinal` is one-based and refers only to the already frozen
ordered input set; fixture IDs and input values are never serialized. Provider
status is limited to `not_called`, `response`, `http_error`, `transport_error`,
and `signal_termination`. Termination reasons and capture error codes are
limited to the existing safe runtime/capture error enums.

### Latency Summary

`capture-latency-summary.json` uses a separate fixed diagnostic schema and
contains:

- run status: `completed` or `failed`;
- fixture count, completed count, and failure ordinal when known;
- total elapsed time;
- count, min, mean, p50, p90, p95, p99, and max for completed input durations;
- provider status counts and Judge timeout count.

Percentiles use the nearest-rank rule `ceil(p * count)` with one-based ranks
over the sorted completed durations; `p50`, `p90`, `p95`, and `p99` use
`0.50`, `0.90`, `0.95`, and `0.99`. An empty completed set is represented
explicitly with `count: 0` and null statistics. The summary is
diagnostic-only and is never included in a candidate tree, receipt binding,
seal, evidence root, or P7 replay cassette.

### Failure Semantics

- A completed input frame is durable before the next input starts.
- If the Judge returns a replayable failure outcome, the frame records the
  bounded outcome class and the capture continues under the existing engine
  behavior; candidate admission remains unchanged and can still reject the
  run.
- If the child exits unexpectedly, the worker preserves all received frames,
  records the child failure classification when safe, and closes the summary
  before returning the existing capture failure.
- A missing, malformed, oversized, or secret-bearing frame is rejected from
  the diagnostic stream. This does not turn an invalid diagnostic stream into
  acceptance evidence.
- A telemetry write failure is fail-closed for the diagnostic stage and is
  surfaced as a bounded capture-worker error; it does not create synthetic
  evidence or alter retry/fallback behavior.

## Isolation and Compatibility

- The existing stage summary remains unchanged; progress is not sent as a
  stage-summary field.
- The candidate package and cassette remain byte-for-byte unchanged when the
  same provider outcomes are used.
- The formal receipt chain and sealer do not read the sidecar.
- P7 does not consume timing data and continues to require accepted P6
  evidence before execution.
- Ordinary production timing and behavior remain unchanged.

## Testing Strategy

RED-first tests will cover:

1. deterministic per-input duration frames using an injected monotonic clock;
2. ordered progress for completed inputs and bounded progress fields;
3. deterministic percentile calculations and empty/incomplete summaries;
4. rejection of fixture IDs, raw content, truth fields, credentials, and
   malformed or oversized frames;
5. preservation of progress and summary after a synthetic Judge timeout or
   child failure;
6. unchanged candidate hashes and stage-summary parsing;
7. no change to retry, fallback, admission, receipt, seal, or P7 boundaries.

## Proposed Files

- Add `scripts/benchmark/sandbox-security/capture-progress.ts`.
- Update `scripts/benchmark/sandbox-security/capture-live.ts`.
- Update `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`.
- Update `scripts/benchmark/sandbox-security/capture-live-worker.ts`.
- Add `tests/benchmark/sandbox-security-capture-progress.spec.ts`.
- Update `tests/benchmark/sandbox-security-capture-live.spec.ts`.
- Update the relevant acceptance/isolation test coverage.
- After implementation, update `docs/architecture.md` and `docs/progress.md`.

## Acceptance Criteria

- A real or synthetic 300-input capture exposes durable progress during the
  run and a latency summary after completion or failure.
- A failed run retains the exact number of completed input records available
  before failure and identifies a bounded Judge timeout when present.
- No diagnostic artifact contains benchmark content, truth, credentials, raw
  provider data, or fixture IDs.
- Existing deterministic suites remain green, except for the intentional RED
  assertions before implementation.
- No candidate, receipt, seal, or P7 behavior changes.
