# P6 Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one deterministic, content-free retry to P6 provider slots and make P7 replay the exact recorded attempt sequences while preserving fail-closed acceptance.

**Architecture:** Keep `SandboxSecurityReplayTransportOutcome<T>` as the outcome of one attempt. Change every captured provider slot to an ordered zero-to-two attempt sequence, enforce the retry policy in the composition transport, and use a shared retry wrapper around the hermetic replay transport. Bump affected artifact schemas so v1 single-outcome roots are rejected rather than migrated.

**Tech Stack:** Node.js 22, TypeScript, Node test runner, SHA-256 canonical JSON artifact contracts, sandbox live/replay transports.

---

## File map

- `scripts/benchmark/sandbox-security/contracts.ts` owns public v2 artifact types, sequence normalization, acceptance validation, and cassette hashes.
- `scripts/benchmark/sandbox-security/capture-sink.ts` owns the anonymous attempt-sequence state machine.
- `engines/sandbox/src/security-production/benchmark-composition.ts` owns the fixed two-attempt retry loop and its shared retry classifier.
- `scripts/benchmark/sandbox-security/replay-transport.ts` owns ordered sequence validation and per-slot replay cursors.
- `scripts/benchmark/sandbox-security/capture-live.ts`, `capture-candidate.ts`, `evaluate.ts`, `seal.ts`, and `replay-hermetic.ts` project and consume v2 sequences.
- `tests/benchmark/`, `engines/sandbox/tests/`, and `tests/repository/` own RED/GREEN behavior and repository contract coverage.
- `docs/architecture.md`, `docs/progress.md`, `docs/sprint-current.md`, and the relevant P6 spec test document the changed gate.

## Task 1: Define v2 attempt-sequence contracts

**Files:**
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Test: `tests/benchmark/sandbox-security-contracts.spec.ts`

- [ ] **Step 1: Write the failing contract tests.**

Add tests that construct the v2 shape with `ollama` and `judge` arrays and assert:

```ts
const retryableLocal = [
  { status: "transport_error", error_code: "connection_failed" },
  responseLocal
];

assert.deepEqual(
  normalizeSandboxSecurityBenchmarkCandidateCassette({
    schema_version: "sandbox-security-benchmark-candidate-cassette.v2",
    judge_binding_sha256: bindingHash,
    inputs: [{
      fixture_id: "ssb-v1-0001",
      ollama: retryableLocal,
      judge: [],
      decision_projection_sha256: projectionHash,
      judge_binding_sha256: bindingHash
    }]
  }).inputs[0]?.ollama,
  retryableLocal
);
```

Also add cases for: a third attempt, a two-attempt sequence whose first item is not `connection_failed`, an embedded `not_called`, a final failure rejected by `assertSandboxSecurityBenchmarkAcceptedProviderOutcomes`, a valid two-attempt sequence accepted, and a v1 cassette rejected.

- [ ] **Step 2: Run the focused tests and verify the failure is contractual.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-contracts.spec.ts
```

Expected: FAIL because the v2 schema and sequence validators do not exist; do not proceed if the failure is only a syntax, import, or environment error.

- [ ] **Step 3: Implement the minimum v2 contract.**

In `contracts.ts`:

1. Change the replay and capture schema constants to `...v2`; change the candidate cassette and cassette-hash constants to v2.
2. Add `SandboxSecurityReplayAttemptSequence<TResponse> = readonly SandboxSecurityReplayTransportOutcome<TResponse>[]` and a `normalizeAttemptSequence` helper that accepts only length 0, 1, or 2, rejects embedded `not_called`, and requires the first item of a length-two sequence to be `transport_error/connection_failed`.
3. Replace slot fields in `SandboxSecurityBenchmarkReplayEnvelope`, `SandboxSecurityBenchmarkCandidateCassette`, `SandboxSecurityReplayInputUnit`, `SandboxSecurityBenchmarkCandidateCaptureManifest`, and `SandboxSecurityBenchmarkCaptureManifest` with attempt sequences.
4. Normalize qualification slots with the same helper and validate successful qualification bindings against the final response item.
5. Update `assertSandboxSecurityBenchmarkAcceptedProviderOutcomes` so empty means not called, every nonempty invoked slot ends in `response`, a Judge sequence is allowed only after a local sequence ending in `response`, and a sequence ending in any failure is rejected.
6. Make `hashSandboxSecurityBenchmarkCandidateCassette` hash the complete ordered arrays through v2 replay envelopes.

Do not add a compatibility parser for v1. Exact-key and schema checks must reject v1 input.

- [ ] **Step 4: Run the focused tests and keep them green.**

Run the command from Step 2. Expected: PASS for the new sequence cases and the existing contract cases updated to v2.

- [ ] **Step 5: Commit the contract slice.**

```bash
git add scripts/benchmark/sandbox-security/contracts.ts tests/benchmark/sandbox-security-contracts.spec.ts
git commit -m "feat(sandbox): define P6 retry attempt sequences"
```

## Task 2: Make the capture sink retain attempts

**Files:**
- Modify: `scripts/benchmark/sandbox-security/capture-sink.ts`
- Test: `tests/benchmark/sandbox-security-capture-sink.spec.ts`

- [ ] **Step 1: Write the failing sink tests.**

Add tests that open one input, record a first `connection_failed` local attempt, record a successful local attempt, and assert the snapshot contains the two ordered outcomes. Add tests that reject a second response without a retryable first failure, reject a third attempt, preserve an empty array for a not-called Judge slot, and keep the serialized snapshot free of fixture/truth/raw-body fields.

The expected assertion is:

```ts
assert.deepEqual(sink.snapshot().inputs[0], {
  ollama: [
    { status: "transport_error", error_code: "connection_failed" },
    successfulLocalOutcome
  ],
  judge: []
});
```

- [ ] **Step 2: Run the sink test and verify RED.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-capture-sink.spec.ts
```

Expected: FAIL because the sink currently stores one outcome and rejects every duplicate slot record.

- [ ] **Step 3: Implement the minimum sequence state machine.**

Change the accumulator and open-input slot types to `readonly SandboxSecurityCaptureSlotOutcome[]`. Store qualification attempts and input attempts as arrays. In `record`, allow at most two attempts for the current slot and require the existing first attempt to be exactly `connection_failed` before accepting a second. In `endInput`, use `[]` for a slot with no record. Deep-freeze each outcome and the containing arrays in `snapshot`; retain the existing oracle-field and normalized-response checks.

- [ ] **Step 4: Run the sink test and verify GREEN.**

Run the command from Step 2. Expected: PASS, including all existing sink lifecycle tests after their expected snapshots are updated to arrays.

- [ ] **Step 5: Commit the sink slice.**

```bash
git add scripts/benchmark/sandbox-security/capture-sink.ts tests/benchmark/sandbox-security-capture-sink.spec.ts
git commit -m "feat(sandbox): retain ordered capture attempts"
```

## Task 3: Add the fixed live retry loop

**Files:**
- Modify: `engines/sandbox/src/security-production/benchmark-composition.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts`

- [ ] **Step 1: Write failing live transport tests.**

Add a transport harness whose first call throws an `Error` named `sandbox_security_transport_connection_failed` and whose second call returns a valid inventory/local/Judge response. Assert the engine reaches the next phase, the underlying call count is two, and the capture events contain both outcomes in order. Add a second-failure case that asserts two calls and the original transport error; add a table for HTTP error, `provider_response_invalid`, `response_too_large`, `slot_timeout`, `work_budget`, caller cancellation, and digest/semantic failures with exactly one underlying call.

- [ ] **Step 2: Run the composition tests and verify RED.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
```

Expected: FAIL because `createCaptureTransport` currently records one thrown attempt and immediately rethrows.

- [ ] **Step 3: Implement the minimum retry loop.**

Add constants `MAX_PROVIDER_ATTEMPTS = 2` and a classifier that returns true only for an error whose safe name is `sandbox_security_transport_connection_failed`. Refactor `createCaptureTransport.request` to:

```ts
for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
  try {
    const response = await Reflect.apply(request, transport, [input]) as Readonly<SandboxSecurityHttpResponse>;
    const outcome = responseOutcome(input, response, judgeDispatch);
    Reflect.apply(sink.record, sink.value, [capturedRecord(phase, input, outcome)]);
    if (state === "qualification_inventory") {
      state = "qualification_prewarm";
    } else if (state === "qualification_prewarm") {
      state = "evaluation";
    }
    return response;
  } catch (error) {
    const outcome = failureOutcome(input, error, phase);
    if (outcome !== null) {
      try {
        Reflect.apply(sink.record, sink.value, [capturedRecord(phase, input, outcome)]);
      } catch {
        // Preserve the original provider error and do not retry after capture failure.
        throw error;
      }
    }
    if (attempt === 1 && outcome?.status === "transport_error" && outcome.error_code === "connection_failed") {
      continue;
    }
    throw error;
  }
}
throw new Error("sandbox_security_retry_unreachable");
```

Preserve the current rule that a capture-recording error does not replace the original provider error in the thrown-error path. Do not retry a response that normalizes to HTTP or provider-response-invalid, and do not retry caller cancellation. Qualification state must advance only after the request returns a response.

- [ ] **Step 4: Run the composition tests and verify GREEN.**

Run the command from Step 2 and then the provider contract tests:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
```

Expected: PASS with the retry matrix and existing provider behavior unchanged.

- [ ] **Step 5: Commit the live retry slice.**

```bash
git add engines/sandbox/src/security-production/benchmark-composition.ts engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
git commit -m "feat(sandbox): retry transient P6 connections once"
```

## Task 4: Replay the exact attempt sequence

**Files:**
- Modify: `scripts/benchmark/sandbox-security/replay-transport.ts`
- Modify: `engines/sandbox/src/security-production/benchmark-composition.ts`
- Test: `tests/benchmark/sandbox-security-replay-transport.spec.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts`

- [ ] **Step 1: Write failing replay tests.**

Use a v2 replay unit with a local sequence `[connection_failed, response]` and an empty Judge sequence. Assert the first `request(chat)` rejects with the recorded connection error, the second identical `request(chat)` returns the response, and `endInput()` succeeds. Add cases for skipped retry, extra retry, operation change between attempts, unconsumed second attempt, a non-retryable final outcome, and a two-attempt sequence whose first outcome is not retryable.

- [ ] **Step 2: Run replay tests and verify RED.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-replay-transport.spec.ts
```

Expected: FAIL because replay currently stores one outcome, marks the whole transport failed on the first error, and validates `not_called` as an outcome instead of an empty sequence.

- [ ] **Step 3: Implement sequence cursors and shared retry wiring.**

In `replay-transport.ts`, normalize each slot as a v2 sequence, validate response bindings on every response item, and track `localAttemptIndex`/`judgeAttemptIndex` for the open input plus qualification cursors. A first `connection_failed` must leave the state open for exactly one subsequent same-operation call. `endInput` must require each cursor to equal its sequence length; an empty sequence requires zero calls. Any wrong operation, duplicate, skipped, extra, or unconsumed attempt calls `invalidState`.

In `benchmark-composition.ts`, wrap the base replay facade with the same two-attempt classifier used by live capture so P7 makes the first recorded connection error observable and then performs the recorded retry. The wrapper must not alter the request body, signal, operation, or replay lifecycle methods.

- [ ] **Step 4: Run replay and composition tests and verify GREEN.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-replay-transport.spec.ts engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
```

Expected: PASS, including the no-network replay tests and all existing lifecycle assertions.

- [ ] **Step 5: Commit the replay slice.**

```bash
git add scripts/benchmark/sandbox-security/replay-transport.ts engines/sandbox/src/security-production/benchmark-composition.ts tests/benchmark/sandbox-security-replay-transport.spec.ts engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
git commit -m "feat(sandbox): replay P6 attempt sequences"
```

## Task 5: Migrate capture, candidate, evaluation, and seal artifacts

**Files:**
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-candidate.ts`
- Modify: `scripts/benchmark/sandbox-security/evaluate.ts`
- Modify: `scripts/benchmark/sandbox-security/seal.ts`
- Modify: `scripts/benchmark/sandbox-security/replay-hermetic.ts`
- Test: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Test: `tests/benchmark/sandbox-security-capture-candidate.spec.ts` (create if absent)
- Test: `tests/benchmark/sandbox-security-evaluate.spec.ts`
- Test: `tests/benchmark/sandbox-security-replay-hermetic.spec.ts`
- Test: `tests/benchmark/sandbox-security-live-evidence.spec.ts`

- [ ] **Step 1: Write failing downstream v2 tests.**

Add a capture-builder test that passes a valid two-attempt local sequence and asserts the candidate staging envelope preserves both outcomes, the v2 capture manifest preserves qualification sequences, and the cassette hash changes when the first attempt is removed. Add rejection tests for a final failure and a v1 staging envelope. Add replay-hermetic tests that accept a sequence ending in a response, reject v1/embedded `not_called`, and reject a sequence that skips the recorded retry.

- [ ] **Step 2: Run downstream tests and verify RED.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-capture-live.spec.ts tests/benchmark/sandbox-security-evaluate.spec.ts tests/benchmark/sandbox-security-replay-hermetic.spec.ts tests/benchmark/sandbox-security-live-evidence.spec.ts
```

Expected: FAIL on v2 schema, array shape, and acceptance assertions; fix only test fixture/import mistakes before implementation if the failures are not about the missing behavior.

- [ ] **Step 3: Migrate the artifact producers and consumers.**

1. In `capture-live.ts`, iterate every attempt when classifying blocking outcomes, use the final response item when extracting the Ollama digest or Judge model, and emit v2 cassette/capture manifest/package staging objects with arrays unchanged.
2. In `capture-candidate.ts`, validate and materialize v2 arrays, preserve them in the candidate root, and let the v2 acceptance assertion reject any final failure before publication.
3. In `evaluate.ts` and `seal.ts`, pass arrays through normalization, v2 replay envelopes, canonical hashes, and seal bindings without flattening to the final response.
4. In `replay-hermetic.ts`, validate anonymous sequence arrays and write them unchanged into `replay-input.json` and `cassette.json`; the Engine child must receive no fixture identity or raw provider content.
5. Update hard-coded candidate staging and cassette schema strings to v2 and preserve exact-key rejection of v1 envelopes.

- [ ] **Step 4: Run downstream tests and verify GREEN.**

Run the command from Step 2 and then:

```bash
npm run typecheck:benchmark:sandbox-security
```

Expected: PASS with v2 sequences preserved through candidate, evaluation, seal, and hermetic replay paths.

- [ ] **Step 5: Commit the artifact slice.**

```bash
git add scripts/benchmark/sandbox-security/capture-live.ts scripts/benchmark/sandbox-security/capture-candidate.ts scripts/benchmark/sandbox-security/evaluate.ts scripts/benchmark/sandbox-security/seal.ts scripts/benchmark/sandbox-security/replay-hermetic.ts tests/benchmark/sandbox-security-capture-live.spec.ts tests/benchmark/sandbox-security-capture-candidate.spec.ts tests/benchmark/sandbox-security-evaluate.spec.ts tests/benchmark/sandbox-security-replay-hermetic.spec.ts tests/benchmark/sandbox-security-live-evidence.spec.ts
git commit -m "feat(sandbox): bind P6 retry attempts into evidence"
```

## Task 6: Update documentation and permanent repository gates

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`
- Modify: `tests/repository/sandbox-security-production-spec.spec.ts`
- Modify: `tests/repository/sandbox-security-p6-acceptance-capability.spec.ts`

- [ ] **Step 1: Write failing documentation-gate assertions.**

Add repository assertions requiring the P6 section to state the exact two-attempt policy, `connection_failed`-only retry, v2 sequence binding, and fail-closed final failure rule. Add an assertion that the old “no retry” statement is amended rather than left as the active P6 policy.

- [ ] **Step 2: Run the repository tests and verify RED.**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/sandbox-security-production-spec.spec.ts tests/repository/sandbox-security-p6-acceptance-capability.spec.ts
```

Expected: FAIL because the active design/runbook still describes P6 as single-attempt/no-retry and the v2 amendment is not referenced.

- [ ] **Step 3: Update the durable project documentation.**

In `docs/architecture.md`, replace the active P6 “no retry” wording with the approved fixed policy and state that v1 roots are rejected. In `docs/progress.md`, record the implementation status, test gates, and the fact that the previously rejected v8 root is not reused. In `docs/sprint-current.md`, keep GENERAL-002's acceptance status honest until a fresh full P6 run and P7 evidence pass; do not mark it VERIFIED merely because retry code exists.

- [ ] **Step 4: Run repository documentation gates and verify GREEN.**

Run the command from Step 2. Expected: PASS with the exact policy and fail-closed language present.

- [ ] **Step 5: Commit the documentation slice.**

```bash
git add docs/architecture.md docs/progress.md docs/sprint-current.md tests/repository/sandbox-security-production-spec.spec.ts tests/repository/sandbox-security-p6-acceptance-capability.spec.ts
git commit -m "docs(sandbox): record P6 retry acceptance policy"
```

## Task 7: Full verification and final review

**Files:**
- No new production files; review all changes above.

- [ ] **Step 1: Run focused engine, benchmark, and repository gates.**

```bash
npm run test:engine:sandbox:production
node --experimental-strip-types --experimental-test-isolation=none --test tests/benchmark/sandbox-security-accept-live.spec.ts tests/benchmark/sandbox-security-candidate-progress.spec.ts tests/benchmark/sandbox-security-capture-live.spec.ts tests/benchmark/sandbox-security-capture-sink.spec.ts tests/benchmark/sandbox-security-contracts.spec.ts tests/benchmark/sandbox-security-evaluate.spec.ts tests/benchmark/sandbox-security-isolation.spec.ts tests/benchmark/sandbox-security-live-evidence.spec.ts tests/benchmark/sandbox-security-p6-root-binding.spec.ts tests/benchmark/sandbox-security-replay-hermetic.spec.ts tests/benchmark/sandbox-security-replay-transport.spec.ts tests/repository/sandbox-security-production.spec.ts tests/repository/sandbox-security-production-spec.spec.ts tests/repository/sandbox-security-p6-acceptance-capability.spec.ts
npm run typecheck:benchmark:sandbox-security
```

Expected: all deterministic tests pass. A live provider run is not a substitute for these gates.

- [ ] **Step 2: Run the hermetic gate with network disabled.**

```bash
npm run benchmark:sandbox-security:replay
```

Expected: the v2 replay consumes all 300 ordered inputs, performs zero network attempts, and produces the expected deterministic result. A rejected or incomplete capture root must fail before this command can produce formal evidence.

- [ ] **Step 3: Run the repository gate.**

```bash
npm run test:repo:sandbox-security-production
```

Expected: PASS, including production layout, acceptance capability, and root-binding coverage.

- [ ] **Step 4: Dispatch a spec-compliance reviewer, then a code-quality reviewer.**

Review the complete diff against the amendment and this plan. Resolve every Critical or Important finding, rerun the affected tests, and request a second review after fixes. Confirm no rejected root under `tmp/` was modified or reused.

- [ ] **Step 5: Record the final verification result and stop.**

Report changed files, tests added, exact test commands and results, whether the requirement is complete, and this suggested commit message:

```text
feat(sandbox): allow one deterministic P6 connection retry
```

Do not start GENERAL-003 or claim GENERAL-002 formal verification unless a fresh P6 capture, accepted candidate, seal, and hermetic replay have all passed.
