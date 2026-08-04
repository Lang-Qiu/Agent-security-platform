# Sandbox Security P6 Capture Observability Implementation Plan

> **Superseded.** This plan is retained for decision history only. The active
> implementation is the approved [P6 Candidate Progress Persistence plan](./2026-08-04-sandbox-security-p6-candidate-progress.md),
> which persists cumulative content-free decision projections and does not add
> the diagnostic sidecar or latency-statistics protocol described below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Use
> superpowers:test-driven-development for every behavior change. Stop after
> this requirement; do not begin GENERAL-003.

**Goal:** Add durable, content-free P6 progress frames and per-input latency
statistics that remain available after a failed live capture without changing
formal candidate, receipt, seal, or P7 behavior.

**Architecture:** The permission-limited capture child measures each serial
`engine.evaluate` call with its existing monotonic runtime and emits bounded
JSONL progress frames on its existing stdout pipe. The credentialed capture
worker validates those frames and writes a mode-`600` sidecar plus a latency
summary in the fresh capture-parent run directory. The sidecar is diagnostic
only and is excluded from candidate hashes, signed bindings, evidence, and
hermetic replay.

**Tech Stack:** Node.js `node:test`, TypeScript ESM with
`--experimental-strip-types`, Node permission model, existing capture worker
and child-process pipe, `fsyncSync`, and the repository's exact JSON/hash
helpers.

---

## File Map

- Create `scripts/benchmark/sandbox-security/capture-progress.ts` for the
  closed progress-frame schema, safe provider-status projection, JSONL parser,
  append-only recorder, and deterministic latency summary.
- Modify `scripts/benchmark/sandbox-security/capture-live.ts` to measure the
  serial input loop and emit frames through an internal progress-writer option.
  Candidate construction and `stdout_summary` remain unchanged.
- Modify `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts` to
  forward stdout chunks to a worker-owned observer while preserving the child
  filesystem allowlist and the final candidate-summary parser.
- Modify `scripts/benchmark/sandbox-security/capture-live-worker.ts` to create
  the fresh sidecar, stream/validate frames, finalize the summary on success or
  child failure, and then preserve the existing failure code.
- Modify `tests/benchmark/sandbox-security-capture-live.spec.ts` for the first
  RED/GREEN behavior test and timing determinism.
- Create `tests/benchmark/sandbox-security-capture-progress.spec.ts` for frame
  normalization, JSONL chunking, file durability, failure summaries, and
  percentile rules.
- Modify `tests/benchmark/sandbox-security-isolation.spec.ts` for the unchanged
  child permission boundary and stdout-only progress transport.
- Modify `tests/benchmark/sandbox-security-accept-live.spec.ts` for worker
  failure preservation and sidecar exclusion from formal acceptance.
- Modify `tests/repository/sandbox-security-benchmark.spec.ts` to register the
  new public benchmark source file.
- Modify `docs/architecture.md` and `docs/progress.md` after implementation;
  do not alter the public stage summary or P7 contract.

## Task 1: Establish The RED Progress Contract

**Files:**
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Test only; do not modify production files before the RED run.

- [ ] **Step 1: Add one failing behavioral test for emitted frames.**

Add a test beside the existing live-capture lifecycle tests. It must inject a
deterministic monotonic clock and a writer through the future internal options
argument. The cast is intentional only during RED because the current
function accepts one runtime argument and ignores the extra options object.

```ts
test("REQ-SBX-GENERAL-002 emits ordered content-free input progress with monotonic durations", async () => {
  const ports = fakeLivePorts({ fixtureCount: 3 });
  let now = 0;
  let input = 0;
  const originalCreateEngine = ports.create_engine!;
  ports.runtime = {
    ...ports.runtime!,
    monotonicNowMs: () => now
  };
  ports.create_engine = async (engineInput) => {
    const engine = await originalCreateEngine(engineInput);
    return {
      async evaluate(request, signal) {
        input += 1;
        now += input * 10;
        return engine.evaluate(request, signal);
      }
    };
  };

  const frames: Array<Record<string, unknown>> = [];
  const result = await (runSandboxSecurityLiveCapture as unknown as (
    ports: SandboxSecurityLiveCapturePorts,
    options: Readonly<{ progress_writer: { write(frame: unknown): void } }>
  ) => Promise<Readonly<{ stdout_summary: string }>>)(ports, {
    progress_writer: {
      write(frame: unknown) {
        frames.push(frame as Record<string, unknown>);
      }
    }
  });

  assert.equal(result.stdout_summary.includes("fixture ssb-v1-0001"), false);
  assert.deepEqual(
    frames.map((frame) => frame.event),
    ["capture_started", "input_complete", "input_complete", "input_complete"]
  );
  assert.deepEqual(
    frames.slice(1).map((frame) => frame.elapsed_ms),
    [10, 20, 30]
  );
  assert.deepEqual(
    frames.slice(1).map((frame) => frame.completed_count),
    [1, 2, 3]
  );
  for (const frame of frames) {
    assert.equal("fixture_id" in frame, false);
    assert.equal("raw_body" in frame, false);
    assert.equal("truth" in frame, false);
  }
});
```

- [ ] **Step 2: Run the focused RED test and verify the failure is behavioral.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  --test-name-pattern="emits ordered content-free input progress"
```

Expected: the test executes the existing capture successfully but fails its
frame assertion because no progress writer is called. An import error,
permission error, or fixture setup error is not an acceptable RED result; fix
the test harness first if one occurs.

## Task 2: Implement Child Progress Frames

**Files:**
- Create: `scripts/benchmark/sandbox-security/capture-progress.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`

- [ ] **Step 1: Add the closed frame and writer types.**

`capture-progress.ts` must define the following public internal contract and
reject unknown keys before serialization:

```ts
export const SANDBOX_SECURITY_P6_PROGRESS_SCHEMA_VERSION =
  "sandbox-security-p6-progress.v1" as const;

export type SandboxSecurityP6ProgressProviderStatus =
  | "not_called"
  | "response"
  | "http_error"
  | "transport_error"
  | "signal_termination";

export type SandboxSecurityP6ProgressFrame =
  | Readonly<{
      schema_version: typeof SANDBOX_SECURITY_P6_PROGRESS_SCHEMA_VERSION;
      event: "capture_started";
      fixture_count: number;
      completed_count: 0;
    }>
  | Readonly<{
      schema_version: typeof SANDBOX_SECURITY_P6_PROGRESS_SCHEMA_VERSION;
      event: "input_complete";
      input_ordinal: number;
      fixture_count: number;
      completed_count: number;
      elapsed_ms: number;
      cumulative_elapsed_ms: number;
      ollama_status: SandboxSecurityP6ProgressProviderStatus;
      judge_status: SandboxSecurityP6ProgressProviderStatus;
      judge_termination_reason?: string;
    }>
  | Readonly<{
      schema_version: typeof SANDBOX_SECURITY_P6_PROGRESS_SCHEMA_VERSION;
      event: "capture_failed";
      fixture_count: number;
      completed_count: number;
      failure_ordinal: number | null;
      error_code: string;
    }>;

export interface SandboxSecurityP6ProgressWriter {
  write(frame: SandboxSecurityP6ProgressFrame): void;
}

export function normalizeSandboxSecurityP6ProgressFrame(
  input: unknown
): SandboxSecurityP6ProgressFrame;

export function serializeSandboxSecurityP6ProgressFrame(
  frame: SandboxSecurityP6ProgressFrame
): string;

export interface SandboxSecurityP6LatencyStatistics {
  readonly count: number;
  readonly min: number | null;
  readonly mean: number | null;
  readonly p50: number | null;
  readonly p90: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly max: number | null;
}

export function summarizeSandboxSecurityP6Durations(
  durations: readonly number[]
): SandboxSecurityP6LatencyStatistics;
```

The frame constructor must only accept one-based ordinals, bounded fixture
counts, safe non-negative integer durations, the five provider statuses, and
the existing safe Judge termination reasons. It must never copy any normalized
provider response object into a frame.

- [ ] **Step 2: Add the internal capture options and deterministic timing.**

Extend `capture-live.ts` with an optional second argument:

```ts
interface SandboxSecurityLiveCaptureOptions {
  readonly progress_writer?: SandboxSecurityP6ProgressWriter;
}

export async function runSandboxSecurityLiveCapture(
  rawPorts: Readonly<SandboxSecurityLiveCapturePorts>,
  options: Readonly<SandboxSecurityLiveCaptureOptions> = {}
): Promise<Readonly<SandboxSecurityLiveCaptureResult>>;
```

The production `main()` supplies a writer that writes exactly one serialized
frame plus `\n` to stdout. Direct library callers and tests omit the writer, so
existing non-child tests do not gain unsolicited output. The main loop emits
`capture_started` after engine creation, then measures each `await
engine.evaluate(...)` with `runtime.monotonicNowMs()`, calls `sink.endInput()`,
projects only the two slot statuses from the sink snapshot, and emits one
`input_complete` frame. The loop remains:

```ts
for (let index = 0; index < fixtureIds.length; index += 1) {
  sink.beginInput();
  const started = runtime.monotonicNowMs();
  let returned = false;
  try {
    decisions.push(await engine.evaluate(envelope.evaluation_request as never, parentSignal));
    returned = true;
  } finally {
    sink.endInput();
    if (returned) {
      emitProgressInputComplete(index, runtime.monotonicNowMs() - started);
    }
  }
}
```

Use the existing `SandboxSecurityCaptureAccumulator.inputs[index]` only to
project `status` and `termination_reason`; do not add timing fields to the
accumulator or candidate cassette. The existing candidate materialization and
final `stdout_summary` remain byte-for-byte unchanged.

- [ ] **Step 3: Run the focused test to verify GREEN.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  --test-name-pattern="emits ordered content-free input progress"
```

Expected: PASS with four frames and durations `10/20/30`. Then run the whole
capture-live file and verify all pre-existing tests remain green.

## Task 3: Add The Progress Parser And Statistics Tests

**Files:**
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Create: `tests/benchmark/sandbox-security-capture-progress.spec.ts`

- [ ] **Step 1: Add regression tests for frame normalization and summary rules.**

The first RED for the requirement already exists in Task 1. These tests cover
the pure contract introduced in Task 2 and must be run before any later worker
integration changes:

```ts
test("REQ-SBX-GENERAL-002 progress frame normalizer accepts the closed started frame", () => {
  const frame = normalizeSandboxSecurityP6ProgressFrame({
    schema_version: "sandbox-security-p6-progress.v1",
    event: "capture_started",
    fixture_count: 3,
    completed_count: 0
  });
  assert.deepEqual(frame, {
    schema_version: "sandbox-security-p6-progress.v1",
    event: "capture_started",
    fixture_count: 3,
    completed_count: 0
  });
});

test("REQ-SBX-GENERAL-002 latency summary uses deterministic nearest-rank percentiles", () => {
  const summary = summarizeSandboxSecurityP6Durations([10, 20, 30, 40]);
  assert.deepEqual(summary, {
    count: 4,
    min: 10,
    mean: 25,
    p50: 20,
    p90: 40,
    p95: 40,
    p99: 40,
    max: 40
  });
});

test("REQ-SBX-GENERAL-002 progress parser rejects oracle and raw provider fields", () => {
  assert.throws(
    () => normalizeSandboxSecurityP6ProgressFrame({
        schema_version: "sandbox-security-p6-progress.v1",
        event: "capture_started",
        fixture_count: 1,
        completed_count: 0,
        fixture_id: "ssb-v1-0001"
      }),
    /progress.*oracle|progress.*invalid/i
  );
});
```

Use the actual exported names from `capture-progress.ts`; do not weaken these
assertions to accept extra keys or silently discard malformed frames.

- [ ] **Step 2: Run the progress contract tests.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-progress.spec.ts
```

Expected: PASS after Task 2. Any failure here is a contract defect to fix
before worker integration.

## Task 4: Stream Frames And Persist The Failed-Run Sidecar

**Files:**
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live-worker.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-progress.ts`

- [ ] **Step 1: Add a failing source/integration assertion for worker persistence.**

Extend the acceptance-worker tests with a behavior-level assertion that
`runSandboxSecurityCaptureWorker` leaves both diagnostic files under the
capture parent when its prepared child exits through the existing
`missing_live_config` safe failure path, while no candidate or formal evidence
is created. Build the descriptor with the existing prepare-worker test helper,
use a fresh temporary capture parent, and assert these paths:

```ts
assert.equal(existsSync(join(captureParent, "capture-progress.jsonl")), true);
assert.equal(existsSync(join(captureParent, "capture-latency-summary.json")), true);
assert.equal(existsSync(join(outputRoot, "candidate")), false);
assert.equal(existsSync(join(outputRoot, "seal.json")), false);
```

Before implementation this test must fail because the two diagnostic files do
not exist, not because the fixture bundle or environment is malformed.

- [ ] **Step 2: Add the bounded stdout observer to the child launcher.**

Change `launchSandboxSecurityCaptureChild` to accept only `bundle` and an
optional parent callback:

```ts
export async function launchSandboxSecurityCaptureChild(input: Readonly<{
  bundle: Readonly<SandboxSecurityCaptureBundle>;
  on_stdout_chunk?: (chunk: string) => void;
}>): Promise<Readonly<SandboxSecurityCaptureChildResult>>;
```

Keep the exact-key guard. The callback is never serialized into child argv,
environment, or permissions. Invoke it from the existing `child.stdout`
`data` handler before appending to the final in-memory stdout. If the callback
throws, terminate the child, preserve the original bounded worker error, and
close the launch lock in the existing `finally` block. Keep final summary
parsing as a reverse scan so progress frames do not change candidate
materialization.

- [ ] **Step 3: Implement the worker-owned recorder lifecycle.**

`capture-live-worker.ts` creates a recorder at the resolved
`capture_parent_root`, before launching the child. It passes
`on_stdout_chunk: recorder.consume` to the launcher. On child success it calls
`recorder.close({ status: "completed" })`; on child exit, malformed progress,
or safe capture failure it calls `recorder.close({ status: "failed", error_code })`
before rethrowing the existing classified error. The recorder must:

```ts
interface SandboxSecurityP6ProgressRecorder {
  consume(chunk: string): void;
  close(input: Readonly<{
    status: "completed" | "failed";
    error_code?: string;
  }>): void;
  snapshot(): Readonly<{
    completed_count: number;
    duration_count: number;
  }>;
}

export function createSandboxSecurityP6ProgressRecorder(input: Readonly<{
  capture_parent_root: string;
}>): SandboxSecurityP6ProgressRecorder;
```

The recorder creates exclusive mode-`600` files, keeps a bounded line buffer,
writes complete canonical JSON lines with `writeSync` and `fsyncSync`, and
uses `capture-progress.jsonl` plus `capture-latency-summary.json`. It accepts
at most 300 `input_complete` frames in increasing ordinal order, exactly one
`capture_started` frame, and exactly one terminal close operation. It projects
only safe status fields into the summary. It never hashes or copies the
sidecar into the candidate output root.

- [ ] **Step 4: Run the worker and isolation tests.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-progress.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-accept-live.spec.ts
```

Expected: all focused tests pass; child permission assertions still show one
write capability, no truth path, no child/worker capability, and no new
filesystem write scope for the permission-limited child.

## Task 5: Register The New Source Without Widening Runtime Scope

**Files:**
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`
- Modify: `tests/repository/sandbox-security-benchmark.spec.ts`
- Modify: `tests/benchmark/sandbox-security-isolation.spec.ts`

- [ ] **Step 1: Add `capture-progress.ts` to the fixed code mirror allowlist.**

The source-controlled `CODE_SOURCE_RELATIVE` list must include:

```ts
"scripts/benchmark/sandbox-security/capture-progress.ts",
```

The new file must be copied into the prepared bundle and included in the code
tree hash. It must not add `capture-output-root` or any corpus truth path to
the child read/write allowlists.

- [ ] **Step 2: Add the file to the exact public benchmark layout test.**

Insert `"capture-progress.ts"` in
`PUBLIC_BENCHMARK_ENTRIES` in sorted position and keep all existing entries.
Do not register the new diagnostic JSON files as repository source entries;
they are run-local artifacts, not committed benchmark sources.

- [ ] **Step 3: Run repository and permission boundary tests.**

Run:

```bash
npm run test:repo:sandbox-security-production
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-p6-root-binding.spec.ts
```

Expected: exact source layout, bundle code hash, import graph, no-truth, and
permission tests pass.

## Task 6: Preserve Candidate, Receipt, Seal, And Replay Contracts

**Files:**
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Modify: `tests/benchmark/sandbox-security-accept-live.spec.ts`
- Modify: `tests/benchmark/sandbox-security-live-evidence.spec.ts`

- [ ] **Step 1: Add regression assertions for unchanged candidate bytes.**

Run the same synthetic capture twice with identical provider outcomes and
different progress-writer sinks. Assert that `candidate_package_sha256`,
`cassette_tree_sha256`, `decisions_tree_sha256`, and serialized candidate
files are equal. The progress files may differ in filesystem timestamps but
must not be in the candidate tree.

- [ ] **Step 2: Assert rejected live evidence remains fail-closed.**

Add assertions that the presence of `capture-progress.jsonl` and
`capture-latency-summary.json` does not make `parseSandboxSecurityCaptureStageSummary`
accept a missing capture binding, does not create an evaluation receipt, and
does not allow hermetic replay to run without an accepted signed P6 root.

- [ ] **Step 3: Run the contract and fail-closed replay tests.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts \
  tests/benchmark/sandbox-security-accept-live.spec.ts
```

Expected: candidate and formal evidence contracts remain unchanged; replay
still rejects before child/provider execution when signed P6 evidence is absent.

## Task 7: Document, Typecheck, And Close The Requirement

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`
- Do not modify `docs/sprint-current.md` to start GENERAL-003.

- [ ] **Step 1: Document the diagnostic sidecar boundary.**

Add a concise architecture note linking to
`docs/superpowers/specs/2026-08-04-sandbox-security-p6-capture-observability-design.md`.
Record in `docs/progress.md` the implementation status, focused test result,
the fact that failed runs retain diagnostics, and the unchanged P6/P7/evidence
boundaries. Do not claim a real accepted P6 run based on synthetic telemetry.

- [ ] **Step 2: Run focused type and behavior gates.**

Run:

```bash
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p scripts/benchmark/sandbox-security/tsconfig.json
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-progress.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-capture-sink.spec.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-accept-live.spec.ts \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts
npm run test:repo:sandbox-security-production
git diff --check
```

Expected: all focused tests and TypeScript checks pass. The hermetic replay
test may intentionally assert fail-closed behavior when no accepted P6 root is
available; that is not a successful replay claim.

- [ ] **Step 3: Run the repository production gate.**

Run:

```bash
npm run test:engine:sandbox:production
npm run typecheck:benchmark:sandbox-security
```

Expected: existing production sandbox tests remain green and the new helper
does not alter ordinary production imports or timing.

- [ ] **Step 4: Report and stop.**

Report modified files, added tests, exact focused/full gate results, the
diagnostic artifact paths, and the suggested commit message:
`feat(benchmark): record P6 capture progress and latency diagnostics`.
Do not launch another external Judge run, do not promote diagnostics into
evidence, and do not begin GENERAL-003.

## Self-Review Checklist

- Every goal in the approved design has a task: progress streaming (Tasks 1,
  2, 4), failed-run durability (Task 4), deterministic statistics (Tasks 2,
  3), secret/truth exclusion (Tasks 2, 3, 4), and formal-contract isolation
  (Task 6).
- No task changes retry, fallback, serial scheduling, thresholds, receipt
  binding, seal contents, or P7 replay input.
- The new source file is included in both the prepared code mirror and exact
  public source inventory (Task 5).
- No production implementation is written before Task 1's behavioral RED.
- This plan contains no TODO/TBD placeholder or unbounded "handle later"
  instruction.
