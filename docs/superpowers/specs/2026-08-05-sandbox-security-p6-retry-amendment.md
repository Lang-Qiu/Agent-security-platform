# P6 Retry Amendment

**Status:** Approved design

**Date:** 2026-08-05

**Scope:** GENERAL-002 P6 live capture and the P7 hermetic replay contract that
consumes its capture output.

## 1. Problem

The current P6 capture path treats every provider request as a single-attempt
slot. A transient `transport_error:connection_failed` therefore fails the
whole capture root even when the provider would succeed immediately on a
second connection. The v8 run that reached `300/300` failed at the final Judge
provider-outcome acceptance check for this reason.

The retry change must preserve the existing fail-closed properties. In
particular, it must not turn an HTTP error, malformed provider response,
credential reflection, digest mismatch, timeout, work-budget termination, or
operator cancellation into an automatically accepted result. P7 must replay
the exact same attempts recorded by P6 rather than replaying only the final
successful response.

## 2. Goals

- Permit exactly one retry for a provider slot, for a maximum of two sequential
  attempts.
- Retry only the classified
  `transport_error:connection_failed` condition.
- Record every attempt in content-free form before deciding whether to retry.
- Make P7 consume the same ordered attempt sequence, including the first failed
  attempt and the retry.
- Keep rejected or incomplete roots permanently ineligible for resume,
  promotion, sealing, or formal evidence generation.
- Keep old single-outcome artifacts incompatible with the amended contract.

## 3. Non-goals

- No retry for readiness probing. Readiness remains its existing separate
  pre-capture control and is not part of a captured provider slot.
- No fallback provider, alternate model, endpoint rotation, or concurrency.
- No exponential backoff, jitter, scheduler, or operator-selected retry count.
- No retry of qualification after a non-connection failure.
- No change to the benchmark corpus, truth labels, decision semantics, or
  candidate-progress projection.

## 4. Retry policy

The policy is fixed in the P6 composition layer and is also applied around the
P7 replay transport.

| Condition from an attempt | Record | Retry? |
| --- | --- | --- |
| `transport_error:connection_failed` on attempt 1 | yes | yes, once |
| `transport_error:connection_failed` on attempt 2 | yes | no; fail closed |
| HTTP status other than 200 | yes | no |
| `transport_error:provider_response_invalid` | yes | no |
| `transport_error:response_too_large` | yes | no |
| `signal_termination:slot_timeout` | yes | no |
| `signal_termination:work_budget` | yes | no |
| caller cancellation | no provider outcome; propagate cancellation | no |
| credential reflection, digest mismatch, or semantic contract failure | content-free failure where the current boundary can classify it; otherwise the existing fail-closed error | no |

Attempts are sequential and use the same logical request body, provider,
operation, and caller signal. A retry does not create a new fixture or logical
input, and it cannot run concurrently with the first attempt. There is no
delay between attempts. A sink-recording exception is a capture failure and
prevents a retry; it must not be used to convert a provider failure into a
successful outcome.

The policy applies to both qualification slots (`model_inventory` and
qualification `chat`) and evaluation slots (local `chat` and Judge
`responses`/`chat_completions`). The readiness request that precedes engine
creation remains outside this policy.

## 5. Attempt data model

`SandboxSecurityReplayTransportOutcome<T>` remains the normalized result of one
provider attempt. A slot is changed from one outcome to an ordered sequence of
zero, one, or two attempt outcomes:

```ts
type SandboxSecurityReplayAttemptSequence<T> = readonly
  SandboxSecurityReplayTransportOutcome<T>[];
```

The contract validator enforces the following invariants:

- length `0` means the slot was not called;
- length `1` is a single attempt;
- length `2` is a retry sequence and its first outcome must be exactly
  `{ status: "transport_error", error_code: "connection_failed" }`;
- an attempt sequence never contains `status: "not_called"`; empty is the only
  representation of not-called;
- no sequence may contain more than two attempts;
- a slot that is acceptance-capable must have a final `response` outcome;
- if a sequence ends in a transport error, HTTP error, or signal termination,
  the root is not acceptance-capable, even if earlier inputs completed.

Each attempt record remains content-free at the capture boundary. Failure
records contain only status and the bounded error or termination code. Response
records retain only the already-normalized response required for deterministic
P7 replay; they never retain raw provider bodies, provider prose, credentials,
fixture identity, truth labels, or source content.

The following fields become attempt sequences wherever a provider slot is
represented:

- `qualification.inventory`
- `qualification.prewarm`
- each capture/replay/cassette input's `ollama`
- each capture/replay/cassette input's `judge`

The sink still receives one `record(...)` event per attempt. It groups events
by the open qualification slot or input slot and preserves their arrival
order. It accepts a second event only when the first event in that slot is the
retryable connection failure and rejects a third or any other duplicate.

## 6. Capture behavior

`createCaptureTransport` performs the following loop for each request:

1. Invoke the underlying transport.
2. Normalize the returned response or thrown error into one content-free
   attempt outcome and record it immediately.
3. If and only if the attempt is the first exact
   `connection_failed` outcome, invoke the same request one more time.
4. Return the successful underlying response or propagate the final/current
   provider error using the existing error semantics.

The qualification/evaluation state advances once, after the request returns
successfully. A retry does not advance the state or open a second input. If
the second attempt fails, the open input remains invalid for formal capture;
the parent capture protocol must reject the root and may preserve only its
content-free progress projection.

The final candidate builder and acceptance assertion operate on the grouped
sequences. A complete run with one transient connection failure followed by a
valid response is acceptance-capable. A complete run with any non-retryable
failure or exhausted retry is rejected, even when its progress counter is
`300/300`.

## 7. P7 hermetic replay

The replay input and transport validate and consume attempt sequences instead
of one outcome per slot. The replay transport maintains a per-slot attempt
cursor:

- a recorded first `connection_failed` is returned as the first replay
  request, and the slot remains open for exactly one retry;
- the next same-operation request consumes the second recorded attempt;
- a recorded final response is returned as a response;
- a recorded non-retryable failure or exhausted retry puts replay into its
  existing failed state;
- missing retries, extra retries, changed operation order, duplicate slots,
  and unconsumed recorded attempts fail closed;
- qualification and every input must consume their complete recorded sequence
  before `endInput`/`assertDrained` can succeed.

P7 runs with no network permission. Its transport retry wrapper uses the same
fixed classifier and two-attempt limit as P6, so the first recorded failure is
observable before the recorded retry is consumed. A replay root cannot invent
an attempt, skip a failed attempt, or substitute a final response.

## 8. Artifact and compatibility rules

Because the shape of every provider slot changes, the following schemas are
bumped to v2:

- `sandbox-security-benchmark-capture.v2`
- `sandbox-security-benchmark-replay.v2`
- `sandbox-security-benchmark-candidate-cassette.v2`
- the candidate staging envelope that embeds the cassette and capture
  manifest

The implementation must reject v1 capture manifests, replay envelopes,
cassettes, and staging packages at normalization or validation boundaries.
Existing rejected roots are never migrated in place. A v1 root, a partial v2
root, and a v2 root containing a final failed attempt are all ineligible for
resume, merge, promotion, seal generation, receipt generation, or evidence
registration.

The accepted candidate cassette hash, replay input, capture manifest, seal, and
evidence binding must all be computed from the v2 sequence representation.
The ordered attempt sequence is therefore covered by the same downstream
hashes that bind decisions and provider configuration.

## 9. Required tests

The implementation is complete only when tests demonstrate:

- a connection failure followed by a response retries exactly once for
  qualification, local, and Judge slots;
- a second connection failure is recorded and fails closed;
- HTTP errors, malformed responses, response-too-large, timeout,
  work-budget, cancellation, credential reflection, and digest mismatch do
  not retry;
- the sink preserves both attempt outcomes, rejects an invalid second attempt,
  rejects a third attempt, and keeps all records content-free;
- acceptance rejects any sequence whose final outcome is not a response and
  accepts a valid two-attempt sequence ending in a response;
- P7 replays the first failure and the retry in order, rejects skipped or
  extra attempts, and remains network-free;
- v1 artifacts and malformed attempt sequences fail closed;
- existing P6 candidate, seal, and evidence gates still reject incomplete or
  rejected roots.

Focused tests must be run before the repository gates. The final verification
must include the benchmark tests, repository tests, TypeScript checks, and the
hermetic replay gate; any live-provider limitation must be reported separately
from deterministic contract verification.

## 10. Implementation file ownership

The planned implementation keeps changes within these boundaries:

- `engines/sandbox/src/security-production/benchmark-composition.ts`: fixed
  retry loop, shared retry classifier, and capture/replay transport wrapping.
- `scripts/benchmark/sandbox-security/capture-sink.ts`: attempt-sequence state
  machine and snapshot types.
- `scripts/benchmark/sandbox-security/contracts.ts`: v2 artifact types,
  sequence normalization, acceptance validation, and hashes.
- `scripts/benchmark/sandbox-security/replay-transport.ts`: ordered sequence
  validation and per-slot attempt cursors.
- `scripts/benchmark/sandbox-security/replay-hermetic.ts`: v2 anonymous input
  validation and replay document/cassette projection.
- `scripts/benchmark/sandbox-security/capture-live.ts`,
  `capture-candidate.ts`, `evaluate.ts`, and `seal.ts`: sequence projection,
  failure classification, and downstream v2 bindings.
- focused engine/benchmark/repository tests covering the matrix above.
- `docs/architecture.md`, `docs/progress.md`, `docs/sprint-current.md`, and
  the P6 runbook/spec tests: document the approved retry boundary and the
  continued fail-closed evidence rule.

No change is planned for frontend APIs, backend orchestration, benchmark
truth/corpus files, or provider fallback behavior.
