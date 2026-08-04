# P6 Candidate Progress Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to execute this plan task by task.
> Use `superpowers:test-driven-development` for every behavior change. Stop
> after `REQ-SBX-GENERAL-002`; do not begin GENERAL-003.

**Goal:** Persist a valid cumulative, content-free candidate progress JSON
after every completed P6 sample, while preserving fail-closed candidate
materialization and formal candidate hashes.

**Architecture:** The permission-limited `capture-live.ts` child emits strict
candidate progress frames over its existing stdout pipe. The parent in
`prepare-capture-bundle.ts` validates each frame and atomically replaces
`.candidate-package.json` using a same-directory temporary file, `fsync`, and
`rename`, then acknowledges the persisted frame over a private stdin pipe before
the child evaluates the next sample. A separate progress schema is used until
the child exits successfully with a complete formal staging payload; only then
does the existing materializer create `candidate/`.

**Tech Stack:** Node.js `node:test`, TypeScript ESM with
`--experimental-strip-types`, Node filesystem permission model, existing
candidate/cassette normalizers, `fsyncSync`, and atomic same-directory rename.

---

## File Map

- Create: `scripts/benchmark/sandbox-security/candidate-progress.ts` for the
  closed progress document, child output frames, decision projection helper,
  strict normalization, and progress/final consistency checks.
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts` to emit one
  content-free frame after every successful evaluation and a final formal
  staging frame in production stream mode, while retaining the existing direct
  file mode for in-process tests.
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts` to
  atomically seed/update the staging path, consume stdout incrementally, reject
  malformed or out-of-order frames, and materialize only after child success.
- Modify: `scripts/benchmark/sandbox-security/capture-candidate.ts` only if a
  shared strict staging normalizer is needed; the existing full-candidate
  materializer must continue rejecting the progress schema.
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts` for child
  frame emission and failure behavior; replace the stale diagnostic-sidecar
  RED assertion with the candidate-progress contract.
- Create: `tests/benchmark/sandbox-security-candidate-progress.spec.ts` for
  pure normalization, atomic-write behavior, and final consistency checks.
- Modify: `tests/benchmark/sandbox-security-isolation.spec.ts` for fixed child
  permissions, streamed output, failed-run progress retention, and no
  promotion from partial progress.
- Modify: `tests/repository/sandbox-security-benchmark.spec.ts` to register the
  new public benchmark source file and fixed code mirror entry.
- Modify: `docs/architecture.md`, `docs/progress.md`, and the old
  `2026-08-04-sandbox-security-p6-capture-observability` spec/plan to record
  that the candidate-progress design supersedes the diagnostic-sidecar plan.

## Contract Decisions

Use these exact exported names unless an existing local convention requires a
mechanically equivalent name without changing behavior:

```ts
export const SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-progress.v1" as const;

export const SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION =
  "sandbox-security-benchmark-candidate-output.v1" as const;

export type SandboxSecurityCandidateProgressStatus = "running" | "failed";

export interface SandboxSecurityCandidateProgressDocument {
  readonly schema_version: typeof SANDBOX_SECURITY_CANDIDATE_PROGRESS_SCHEMA_VERSION;
  readonly status: SandboxSecurityCandidateProgressStatus;
  readonly fixture_count: number;
  readonly completed_count: number;
  readonly decisions: readonly SandboxSecurityBenchmarkCandidateDecisionEnvelope[];
  readonly failure_code?: string;
}

export interface SandboxSecurityCandidateProgressFrame {
  readonly schema_version: typeof SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION;
  readonly event: "candidate_progress";
  readonly input_ordinal: number;
  readonly fixture_count: number;
  readonly completed_count: number;
  readonly decision: SandboxSecurityBenchmarkCandidateDecisionEnvelope;
}

export interface SandboxSecurityCandidateCompleteFrame {
  readonly schema_version: typeof SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION;
  readonly event: "capture_complete";
  readonly status: "capture_complete";
  readonly decision_count: number;
  readonly fixture_count: number;
  readonly candidate_package_sha256: string;
  readonly staging_serialized: string;
}

export function buildSandboxSecurityCandidateDecisionEnvelope(
  fixtureId: string,
  decision: Readonly<SandboxSecurityDecision>
): SandboxSecurityBenchmarkCandidateDecisionEnvelope;

export function normalizeSandboxSecurityCandidateProgressDocument(
  value: unknown,
  fixtureIds: readonly string[]
): SandboxSecurityCandidateProgressDocument;

export function normalizeSandboxSecurityCandidateOutputFrame(
  value: unknown,
  fixtureIds: readonly string[]
): SandboxSecurityCandidateProgressFrame | SandboxSecurityCandidateCompleteFrame;

export function createSandboxSecurityCandidateProgressDocument(
  fixtureIds: readonly string[]
): SandboxSecurityCandidateProgressDocument;

export function appendSandboxSecurityCandidateProgress(
  current: SandboxSecurityCandidateProgressDocument,
  frame: SandboxSecurityCandidateProgressFrame,
  fixtureIds: readonly string[]
): SandboxSecurityCandidateProgressDocument;

export function markSandboxSecurityCandidateProgressFailed(
  current: SandboxSecurityCandidateProgressDocument,
  failureCode: string,
  fixtureIds: readonly string[]
): SandboxSecurityCandidateProgressDocument;

export function assertSandboxSecurityCandidateStagingMatchesProgress(
  stagingSerialized: string,
  progress: SandboxSecurityCandidateProgressDocument,
  fixtureIds: readonly string[]
): void;
```

The normalizers must require exact own keys, validate fixture order against the
provided frozen `fixtureIds`, require one-based ordinals, require
`completed_count === decisions.length`, validate SHA-256 strings, and reject
the oracle/raw field names already rejected by `capture-sink.ts`. The progress
document is content-free but may contain fixture IDs because the formal
content-free candidate decision envelope already binds them to the candidate
tree.

## Task 1: Replace The Stale RED Test With Candidate Progress RED

**Files:**
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Create: `tests/benchmark/sandbox-security-candidate-progress.spec.ts`

- [ ] **Step 1: Remove only the old sidecar-specific test behavior.**

Replace the current test named
`REQ-SBX-GENERAL-002 emits ordered content-free input progress with monotonic durations`
with a test for the new stream option. Preserve all unrelated user changes in
the file. The test must inject three fixtures and collect future child frames:

```ts
test("REQ-SBX-GENERAL-002 emits one content-free candidate frame per completed sample", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  const frames: unknown[] = [];
  const run = runSandboxSecurityLiveCapture as unknown as (
    ports: SandboxSecurityLiveCapturePorts,
    options: Readonly<{
      candidate_output: "stream";
      output_frame_writer: { write(frame: unknown): void };
    }>
  ) => Promise<Readonly<{ decision_count: number }>>;

  const result = await run(ports, {
    candidate_output: "stream",
    output_frame_writer: {
      write(frame: unknown) {
        frames.push(frame);
      }
    }
  });

  assert.equal(result.decision_count, 3);
  assert.deepEqual(
    (frames as Array<Record<string, unknown>>).map((frame) => frame.event),
    ["candidate_progress", "candidate_progress", "candidate_progress", "capture_complete"]
  );
  assert.deepEqual(
    (frames as Array<Record<string, unknown>>)
      .filter((frame) => frame.event === "candidate_progress")
      .map((frame) => frame.completed_count),
    [1, 2, 3]
  );
  assert.doesNotMatch(JSON.stringify(frames), /fixture text|raw_body|truth|SANDBOX_SECURITY_JUDGE_API_KEY/u);
});
```

The current implementation ignores the second argument and therefore produces
no frames. The test must fail by assertion with an empty frame list, not by a
fixture setup or import error.

- [ ] **Step 2: Add RED assertions for the future pure contract without
  importing a missing module.**

Create `tests/benchmark/sandbox-security-candidate-progress.spec.ts`. Import
`capture-live.ts` and `prepare-capture-bundle.ts`, inspect the exported function
values, and assert the new normalizer/atomic writer exports exist before
invoking them. This makes the first failure an explicit requirement failure
rather than an ESM module-resolution error:

```ts
test("REQ-SBX-GENERAL-002 exposes strict candidate progress helpers", async () => {
  const captureModule = await import("../../scripts/benchmark/sandbox-security/capture-live.ts");
  const prepareModule = await import("../../scripts/benchmark/sandbox-security/prepare-capture-bundle.ts");
  assert.equal(typeof (captureModule as Record<string, unknown>).normalizeSandboxSecurityCandidateOutputFrame, "function", "candidate_frame_normalizer_missing");
  assert.equal(typeof (prepareModule as Record<string, unknown>).writeSandboxSecurityCandidateFileAtomic, "function", "candidate_atomic_writer_missing");
});
```

In the same file, add the complete behavior assertions now, guarded by the
same explicit function-existence assertions. The guard must throw the named
missing-helper assertion in the current code and only proceed to the behavior
assertions after the implementation exists:

```ts
function requireCandidateProgressFunction<T>(
  module: Readonly<Record<string, unknown>>,
  name: string
): T {
  const value = module[name];
  assert.equal(typeof value, "function", `candidate_progress_${name}_missing`);
  return value as T;
}

test("REQ-SBX-GENERAL-002 normalizes zero-count progress as valid JSON", async () => {
  const module = await import("../../scripts/benchmark/sandbox-security/capture-live.ts");
  const create = requireCandidateProgressFunction<(
    fixtureIds: readonly string[]
  ) => Record<string, unknown>>(module, "createSandboxSecurityCandidateProgressDocument");
  assert.deepEqual(create(["ssb-v1-0001", "ssb-v1-0002"]), {
    schema_version: "sandbox-security-benchmark-candidate-progress.v1",
    status: "running",
    fixture_count: 2,
    completed_count: 0,
    decisions: []
  });
});

test("REQ-SBX-GENERAL-002 rejects raw and oracle fields from progress frames", async () => {
  const module = await import("../../scripts/benchmark/sandbox-security/capture-live.ts");
  const normalize = requireCandidateProgressFunction<(
    value: unknown,
    fixtureIds: readonly string[]
  ) => unknown>(module, "normalizeSandboxSecurityCandidateOutputFrame");
  assert.throws(
    () => normalize({
      schema_version: "sandbox-security-benchmark-candidate-output.v1",
      event: "candidate_progress",
      input_ordinal: 1,
      fixture_count: 1,
      completed_count: 1,
      decision: {
        schema_version: "sandbox-security-benchmark-decision-projection.v1",
        fixture_id: "ssb-v1-0001",
        decision_projection_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        projection: {
          schema_version: "sandbox-security-decision.v1",
          verdict: "no_detected_risk",
          action: "allow",
          risk_level: "info",
          finding_count: 0,
          detector_run_count: 0,
          evidence_ref_count: 0
        }
      },
      raw_body: "provider body",
      truth: "oracle"
    }, ["ssb-v1-0001"]),
    /candidate_progress.*(?:invalid|oracle|raw)/i
  );
});

test("REQ-SBX-GENERAL-002 preserves completed decisions in failed progress", async () => {
  const module = await import("../../scripts/benchmark/sandbox-security/capture-live.ts");
  const fixtureIds = ["ssb-v1-0001"] as const;
  const create = requireCandidateProgressFunction<(
    ids: readonly string[]
  ) => Record<string, unknown>>(module, "createSandboxSecurityCandidateProgressDocument");
  const append = requireCandidateProgressFunction<(
    current: Record<string, unknown>,
    frame: Record<string, unknown>,
    ids: readonly string[]
  ) => Record<string, unknown>>(module, "appendSandboxSecurityCandidateProgress");
  const markFailed = requireCandidateProgressFunction<(
    current: Record<string, unknown>,
    code: string,
    ids: readonly string[]
  ) => Record<string, unknown>>(module, "markSandboxSecurityCandidateProgressFailed");
  const normalize = requireCandidateProgressFunction<(
    value: unknown,
    ids: readonly string[]
  ) => Record<string, unknown>>(module, "normalizeSandboxSecurityCandidateOutputFrame");
  const decision = {
    schema_version: "sandbox-security-benchmark-decision-projection.v1",
    fixture_id: "ssb-v1-0001",
    decision_projection_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    projection: {
      schema_version: "sandbox-security-decision.v1",
      verdict: "no_detected_risk",
      action: "allow",
      risk_level: "info",
      finding_count: 0,
      detector_run_count: 0,
      evidence_ref_count: 0
    }
  };
  const frame = normalize({
    schema_version: "sandbox-security-benchmark-candidate-output.v1",
    event: "candidate_progress",
    input_ordinal: 1,
    fixture_count: 1,
    completed_count: 1,
    decision
  }, fixtureIds);
  const running = append(create(fixtureIds), frame, fixtureIds);
  const failed = markFailed(
    running,
    "sandbox_security_capture_live_reject:provider_failed",
    fixtureIds
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.completed_count, 1);
  assert.deepEqual(failed.decisions, running.decisions);
});
```

- [ ] **Step 3: Run the focused RED tests.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-candidate-progress.spec.ts \
  --test-name-pattern="candidate frame per completed sample|strict candidate progress helpers"
```

Expected: both tests fail because the new frame writer and helper exports do
not exist. Do not implement production code until this failure is observed.

## Task 2: Implement The Pure Candidate Progress Contract

**Files:**
- Create: `scripts/benchmark/sandbox-security/candidate-progress.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts` to re-export the
  public internal normalizers used by focused tests.
- Modify: `tests/benchmark/sandbox-security-candidate-progress.spec.ts`

- [ ] **Step 1: Implement decision projection construction.**

Move the existing `contentFreeDecisionProjection` behavior into
`buildSandboxSecurityCandidateDecisionEnvelope`. It must produce exactly the
same projection fields used by `buildCandidatePackage`:

```ts
const projection = Object.freeze({
  schema_version: decision.schema_version,
  verdict: decision.verdict,
  action: decision.action,
  risk_level: decision.risk_level,
  finding_count: decision.findings.length,
  detector_run_count: decision.detector_runs.length,
  evidence_ref_count: decision.evidence_refs.length
});
const decision_projection_sha256 = hashSandboxSecurityBenchmarkCanonicalJson(projection);
return Object.freeze({
  schema_version: "sandbox-security-benchmark-decision-projection.v1",
  fixture_id: fixtureId,
  decision_projection_sha256,
  projection
});
```

Update `buildCandidatePackage` to use this helper so streaming and final
formal staging cannot diverge. Preserve the existing serialized candidate and
hash output for a completed run.

- [ ] **Step 2: Implement exact progress document and frame normalizers.**

Require these exact keys:

- running document: `schema_version`, `status`, `fixture_count`,
  `completed_count`, `decisions`;
- failed document: the same keys plus `failure_code`;
- progress frame: `schema_version`, `event`, `input_ordinal`,
  `fixture_count`, `completed_count`, `decision`;
- complete frame: `schema_version`, `event`, `status`, `decision_count`,
  `fixture_count`, `candidate_package_sha256`, `staging_serialized`.

Reject unknown keys, arrays where objects are required, non-plain objects,
invalid fixture IDs, duplicate or out-of-order IDs, count mismatches, hashes
outside `/^[0-9a-f]{64}$/u`, staging payloads larger than
`16 * 1024 * 1024` bytes, and JSON that contains any of the existing forbidden
oracle/raw field names. Deep-freeze all returned data.

- [ ] **Step 3: Implement append, failed-state, and final consistency helpers.**

`appendSandboxSecurityCandidateProgress` must accept only the next expected
fixture and ordinal, append exactly one decision, and return a new frozen
document. `markSandboxSecurityCandidateProgressFailed` must preserve all
decisions and add only the bounded failure code. The final consistency helper
must parse the staging serialization, require the formal staging schema, and
require its `decisions` array to be byte-equivalent in canonical JSON to the
progress decisions before allowing promotion.

The tests now exist before production implementation and are the RED evidence.
Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-candidate-progress.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  --test-name-pattern="candidate progress|candidate frame|strict candidate"
```

Expected: all focused contract and existence tests pass. Then run the full
`tests/benchmark/sandbox-security-capture-live.spec.ts` and preserve the
existing completed-candidate assertions.

## Task 3: Add Child Stream Mode And Per-Sample Frames

**Files:**
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`

- [ ] **Step 1: Define the internal stream options.**

Add an optional second argument without changing the existing ports contract:

```ts
export interface SandboxSecurityLiveCaptureOptions {
  readonly candidate_output?: "bound_file" | "stream";
  readonly output_frame_writer?: Readonly<{
    write(frame: SandboxSecurityCandidateProgressFrame | SandboxSecurityCandidateCompleteFrame): void;
  }>;
}
```

Default to `bound_file` for direct library callers. Require
`output_frame_writer` when `candidate_output === "stream"`; reject a writer
without stream mode. In stream mode do not open, truncate, or materialize the
capture output from the child.

- [ ] **Step 2: Emit a frame after each completed input.**

After `engine.evaluate` resolves and `sink.endInput()` succeeds, build the
decision envelope for the current frozen fixture and emit exactly one
`candidate_progress` frame. If evaluation or sink closure throws, emit no
frame for that input. The loop remains serial and must not add retry or
fallback behavior:

```ts
const decision = await engine.evaluate(
  envelope.evaluation_request as never,
  parentSignal
);
decisions.push(decision);
sink.endInput();
emitFrame({
  schema_version: SANDBOX_SECURITY_CANDIDATE_OUTPUT_FRAME_SCHEMA_VERSION,
  event: "candidate_progress",
  input_ordinal: index + 1,
  fixture_count: fixtureIds.length,
  completed_count: decisions.length,
  decision: buildSandboxSecurityCandidateDecisionEnvelope(fixtureId, decision)
});
```

Keep `sink.endInput()` in a `finally` around evaluation as in the current
implementation; call the output writer only after a successful close.

- [ ] **Step 3: Emit the final formal staging frame in stream mode.**

Retain the existing `buildCandidatePackage` path. In stream mode, emit a
`capture_complete` frame containing the current summary fields plus
`staging_serialized`; do not write it through the child file descriptor. In
bound-file mode, preserve the existing final write and test materialization.
The returned `stdout_summary` and formal hashes must remain unchanged.

- [ ] **Step 4: Make the CLI select stream mode.**

`main()` must pass `candidate_output: "stream"` and a writer that serializes
exactly one frame plus `\n` to stdout. It must not print a second final summary
line that the parent would mistake for a child protocol frame. Keep stderr
classification bounded and secret-free.

- [ ] **Step 5: Verify child behavior.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts
```

Expected: the new three-sample frame test passes; a synthetic evaluation
failure test shows only frames for evaluations that returned successfully; all
existing formal candidate tests remain green.

## Task 4: Implement Parent Atomic Persistence And Stream Consumption

**Files:**
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`
- Modify: `scripts/benchmark/sandbox-security/candidate-progress.ts`
- Modify: `tests/benchmark/sandbox-security-candidate-progress.spec.ts`
- Modify: `tests/benchmark/sandbox-security-isolation.spec.ts`

- [ ] **Step 1: Add a failing atomic-writer test before the parent code.**

Use a real temporary `capture-output` directory and an initial regular target.
Call the future exported writer twice with two valid progress documents and
assert after each call that the target is parseable, has mode `0600`, and has
no temporary sibling left. Capture the inode before and after the second write
and assert it changes, proving the implementation uses replacement rather than
in-place truncation. The first RED must be the explicit
`candidate_atomic_writer_missing` assertion from Task 1.

- [ ] **Step 2: Implement `writeSandboxSecurityCandidateFileAtomic`.**

The parent-only writer must:

1. Resolve and revalidate `capture-output` as a real directory.
2. Verify the target is either the prepared regular file or a regular file
   created by the previous atomic update; reject symlinks and multi-link files.
3. Serialize the normalized document with compact JSON and one trailing
   newline; enforce the 16 MiB bound.
4. Create a unique same-directory temporary file with `O_CREAT | O_EXCL |
   O_WRONLY | O_NOFOLLOW`, mode `0600`.
5. Write all bytes, call `fsyncSync(tempFd)`, close the descriptor, rename the
   temp path over `.candidate-package.json`, and fsync the output directory.
6. On any failure, close descriptors, remove only the owned temp path, and
   preserve the previous target. Never delete `candidate/` or unrelated output.

The writer must be exported from `prepare-capture-bundle.ts` for focused tests
and must not be added to the mirrored child import graph.

- [ ] **Step 3: Implement incremental stdout frame handling.**

In `launchSandboxSecurityCaptureChild`, retain the complete stdout for the
existing result shape but process UTF-8 chunks line-by-line while the child is
running. Keep one partial line between chunks. For every non-empty line:

- normalize it as a candidate progress or complete frame;
- require progress `input_ordinal` and `completed_count` to be exactly the next
  fixture in `bundle.fixture_ids`;
- append the frame to the current progress document;
- atomically persist the new document before accepting the next frame;
- retain at most the bounded child stdout size established by the existing
  capture safety limits.

On a malformed, duplicate, out-of-order, secret-bearing, or unexpected line,
kill the child, preserve the last valid progress document, and return the
existing fail-closed child failure shape. A final frame may be validated,
persisted, and acknowledged before close so the child can terminate; do not
promote it to `candidate/` until the child closes successfully.

After each successful atomic write, send a strict content-free acknowledgement
to the child over a private stdin pipe. The child stream writer must await the
matching acknowledgement before returning to the serial evaluation loop. The
final formal staging frame is acknowledged only after its hash and ordered
decision consistency checks pass and the formal staging serialization has been
atomically written.

- [ ] **Step 4: Seed and finalize the progress document.**

Immediately after acquiring the launch lock and before spawning the child,
atomically write the zero-count running document. On non-zero child exit or
protocol failure, atomically mark the current document failed with the bounded
classified error code. On zero exit:

- require exactly one final `capture_complete` frame;
- require `completed_count === fixture_count`;
- require final `decision_count` and fixture count to match;
- verify the final staging SHA-256;
- verify final formal `decisions` exactly match the durable progress decisions;
- atomically replace the progress document with the formal staging string.

Only after this replacement should the parent derive the current staging inode
binding and call `materializeSandboxSecurityCandidatePackage`. This avoids
using the initial empty-file inode binding after an atomic replacement.

- [ ] **Step 5: Add fail-closed isolation coverage.**

Extend `sandbox-security-isolation.spec.ts` to assert:

- the child write allowlist does not include `capture-output` itself or any
  temporary sibling path;
- the child read allowlist still excludes `capture-output`;
- a failed capture leaves a parseable progress document with the expected
  completed count and no `candidate/` directory;
- a malformed or tampered progress frame never materializes a candidate;
- no temporary atomic-write file remains after success or failure;
- the successful smoke path still materializes the unchanged formal candidate.

- [ ] **Step 6: Run focused parent and isolation tests.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-candidate-progress.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts
```

Expected: atomic inode replacement, stream consumption, failed-run retention,
permission boundaries, and complete materialization all pass.

## Task 5: Preserve Formal Materialization And Repository Boundaries

**Files:**
- Modify: `scripts/benchmark/sandbox-security/capture-candidate.ts` only if
  shared parsing is extracted.
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`.
- Modify: `tests/benchmark/sandbox-security-contracts.spec.ts` if a formal
  progress-schema rejection assertion belongs with contract tests.
- Modify: `tests/repository/sandbox-security-benchmark.spec.ts`.
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts` fixed
  code mirror allowlist.

- [ ] **Step 1: Add the new source to the fixed code mirror.**

Add exactly:

```ts
"scripts/benchmark/sandbox-security/candidate-progress.ts",
```

to `FIXED_CODE_ALLOWLIST_RELATIVE`. Add `candidate-progress.ts` to
`PUBLIC_BENCHMARK_ENTRIES` in the repository test. Verify the mirrored code
tree hash and command checks continue to bind the new source file.

- [ ] **Step 2: Verify partial schema cannot materialize.**

Add a test that writes a valid zero-count or one-count progress document to
`.candidate-package.json`, calls
`materializeSandboxSecurityCandidatePackage`, and expects
`candidate_staging_schema` or `candidate_staging_invalid`. Assert no
`candidate/` directory exists and the progress file is retained unchanged.

- [ ] **Step 3: Verify complete output is unchanged.**

Run the existing content-free candidate test and compare the formal candidate
schema, cassette length, decision files, candidate package hash, cassette tree
hash, and decision tree hash with the values produced by the current direct
file-mode path. Do not add progress fields to `capture-manifest.json`,
`cassette.json`, `package.json`, decision files, receipts, or P7 replay input.

- [ ] **Step 4: Run the formal focused suite.**

Run:

```bash
npm run test:repo:sandbox-security-production
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts
```

Expected: no existing formal acceptance or isolation regression remains.

## Task 6: Document The Durable Boundary And Close The Requirement

**Files:**
- Modify: `docs/architecture.md`.
- Modify: `docs/progress.md`.
- Modify: `docs/sprint-current.md` only to record the completed sub-boundary;
  keep GENERAL-002 as the sole current requirement.
- Modify: `README.md` only if the existing P6 capture description needs the
  durable progress path recorded.
- Modify: `docs/superpowers/specs/2026-08-04-sandbox-security-p6-capture-observability-design.md`
  and `docs/superpowers/plans/2026-08-04-sandbox-security-p6-capture-observability.md`
  with a short superseded notice linking the approved candidate-progress
  design; do not implement the obsolete JSONL sidecar plan.

- [ ] **Step 1: Document architecture and failure semantics.**

State that P6 candidate progress is a separate, content-free, incomplete
schema written atomically by the parent capture authority; it is retained on
failure for diagnosis only and is never accepted by materialization, receipt,
seal, evidence-root, or P7 replay. Link to the new spec instead of copying its
full schema into multiple docs.

- [ ] **Step 2: Update progress status.**

Record the implementation, focused test commands, and whether the full
benchmark TypeScript check and repository/production suites pass. Do not state
that GENERAL-002 or P7 is accepted merely because this sub-boundary is green.

- [ ] **Step 3: Run the complete required verification.**

Run all of the following from the repository root:

```bash
npm run typecheck:benchmark:sandbox-security
npm run test:repo:sandbox-security-production
npm run test:engine:sandbox:production
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-candidate-progress.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts
git diff --check
```

If the full `npm test` is run, report any unrelated pre-existing failures
separately. Do not claim the requirement complete without fresh command output
and a clean requirement checklist.

- [ ] **Step 4: Stop.**

Report modified files, added tests, exact verification results, current
requirement status, and suggested commit message. Do not start GENERAL-003 or
the superseded diagnostic-sidecar work.
