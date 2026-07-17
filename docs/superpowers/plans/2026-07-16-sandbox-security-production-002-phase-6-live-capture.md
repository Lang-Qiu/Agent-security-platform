# Phase 6: Truth-Blind Live Capture and Seal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. Close each task with independent review
> and re-review. P6-T4 may become BLOCKED only when the declared live model or
> credential prerequisites are unavailable; never fabricate capture evidence.

**Goal:** Implement anonymous content-free capture lifecycle, permission-limited
live runner/readiness checks, separate truth-aware metric evaluation, and an
accepted live capture/replay/seal artifact only after real qualification passes.

**Architecture:** The capture child receives P5's input-only bundle, uses the
benchmark-composition live Engine, records one qualification inventory and
prewarm then exactly 300 anonymous two-slot input units. A distinct evaluator
receives capture results and truth but no production/provider graph. Only an
accepted real capture may populate capture.json, replay, and seal.json. Live
qualification is absent from ordinary CI.

**Tech Stack:** Node permission model, child_process only in the P5 parent
launcher, TypeScript ESM, node:test, P4 benchmark composition, P5 input
bundle/corpus. The P6 child has no child-process or worker permission.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P6-T1 | capture-sink.ts and lifecycle tests |
| P6-T2 | capture-live.ts and live-runner tests |
| P6-T3 | evaluator script and metric tests |
| P6-T4 | truth-blind seal script, accepted capture/replay/seal, live evidence test |

Capture code cannot read truth. Evaluator cannot import or invoke production
detectors, HTTP transport, production config, or network. No P6 artifact stores
raw input, sanitized payload, provider body/prose, credentials, headers, truth,
or a per-fixture decision.

## Phase Entry Gate

- [ ] Confirm Phase 5 is VERIFIED with an APPROVED Phase review.
- [ ] Read Spec sections Live Capture Qualification, Hermetic Sealed Replay,
  Anti-Oracle and Isolation Gates, Failure Semantics, and Required Validation.
- [ ] Record prerequisites without placing secrets in files:

~~~text
SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST=sha256:<64 lowercase hex>
OPENAI_API_KEY=<nonempty secret supplied only by environment or ignored .env>
SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE=1
Ollama qwen3:8b listener bound only at 127.0.0.1:11434
~~~

- [ ] Verify P5 permission tests and corpus validation:

~~~bash
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-isolation.spec.ts
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

## Task DAG

~~~mermaid
flowchart LR
  T1[P6-T1 capture sink] --> T2[P6-T2 live runner]
  T1 --> T4[P6-T4 accepted evidence]
  T2 --> T4
  T3[P6-T3 evaluator] --> T4
~~~

P6-T1, P6-T2, and P6-T3 are deterministic/fake-port work. P6-T4 starts only
after they are verified and becomes BLOCKED rather than weakened if live
prerequisites are unavailable.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Every task requires intended RED, focused GREEN, its listed static/contract
checks, sandbox TypeScript when production modules are used, npm run build
--prefix frontend, git diff --check, independent review, accepted-finding RED
regressions, APPROVED re-review, truthful progress evidence, exact commit, and
stop. P6-T4 additionally requires auditable real live evidence; synthetic
provider records cannot replace it.

### P6-T1: Anonymous Capture Sink State Machine

**Goal / acceptance:** Implement qualification_inventory,
qualification_prewarm, ready, input-open, failed, and drained behavior. The
sink records only content-free outcomes, owns no fixture ID/truth, and closes
each input with explicit not_called slots.

**Files:**

- Create: scripts/benchmark/sandbox-security/capture-sink.ts
- Create: tests/benchmark/sandbox-security-capture-sink.spec.ts

**Dependencies / frozen inputs:** P4-T3 and P5-T1 are verified. Use only
benchmark-composition capture types; do not import input/truth files.

- [ ] **Step 1: Write failing state-machine tests**

~~~ts
test("REQ-SBX-GENERAL-002 sink accepts exactly inventory then prewarm before first input", () => {
  const sink = createSandboxSecurityCaptureSink();
  sink.record(qualificationInventory());
  sink.record(qualificationPrewarm());
  for (let index = 0; index < 300; index += 1) {
    sink.beginInput();
    sink.endInput();
  }
  sink.assertDrained();
});

test("REQ-SBX-GENERAL-002 sink writes explicit not_called for untouched slots", () => {
  const sink = readySink();
  sink.beginInput();
  sink.endInput();
  assert.deepEqual(sink.snapshot().inputs[0], {
    ollama: { status: "not_called" }, judge: { status: "not_called" }
  });
});

test("REQ-SBX-GENERAL-002 sink rejects duplicate wrong-phase and boundary records", () => {
  for (const operation of invalidSinkOperations()) assert.throws(operation);
});
~~~

Cover malformed/non-success qualification, duplicates, input before ready,
qualification after ready, records outside an input, wrong provider/operation/
phase, duplicate slots, end/begin twice, failed state, incomplete/extra input,
exactly 300 input units, deep freeze, and no content/fixture/truth fields.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-sink.spec.ts
~~~

Expected: guarded sink does not advance qualification, so the ordered lifecycle
assertion fails.

- [ ] **Step 3: Implement the closed sink**

~~~ts
export function createSandboxSecurityCaptureSink(): SandboxSecurityCaptureSink & Readonly<{
  snapshot(): Readonly<SandboxSecurityCaptureAccumulator>;
}>;
~~~

Accept one successful inventory and one successful prewarm before ready. Allow
300 anonymous input units only after ready. At endInput populate untouched
provider slots with not_called. Never accept fixture ID, category, severity,
verdict, action, truth, metric, raw bytes, provider prose, or request metadata.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-sink.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-capture-sink.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect every transition, count, slot overwrite, error path, snapshot field,
freeze boundary, and absence of ID/truth/raw-content capability.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a phase/order/duplicate/not_called counterexample before correcting the
state machine.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P6-T1 state-machine coverage and review in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/capture-sink.ts \
  tests/benchmark/sandbox-security-capture-sink.spec.ts docs/progress.md
git commit -m "feat(benchmark): record anonymous provider capture slots"
~~~

Stop after the commit and report the evidence.

### P6-T2: Permission-Limited Live Capture Runner

**Goal / acceptance:** Implement the permission-limited capture-live child. It
runs OpenAI strict-schema readiness before benchmark evaluation, uses live
benchmark composition, processes 300 inputs serially with beginInput/endInput
in finally, and writes only a candidate content-free capture package. It never
reads truth, spawns a process/worker, or seals an unaccepted result.

**Files:**

- Create: scripts/benchmark/sandbox-security/capture-live.ts
- Create: tests/benchmark/sandbox-security-capture-live.spec.ts

**Dependencies / frozen inputs:** P5-T4 and P6-T1 are verified. Unit tests use
fake child/transport ports. The real command is credentialed and absent from
ordinary test/CI scripts.

- [ ] **Step 1: Write failing runner/readiness tests**

~~~ts
test("REQ-SBX-GENERAL-002 capture child performs non-benchmark Judge readiness first", async () => {
  const result = await runSandboxSecurityLiveCapture(fakeLivePorts());
  assert.deepEqual(result.events.slice(0, 2), ["judge_readiness", "capture_child_started"]);
});

test("REQ-SBX-GENERAL-002 runner closes every input in finally", async () => {
  const ports = fakeLivePorts({ throwAtInput: 2 });
  await assert.rejects(() => runSandboxSecurityLiveCapture(ports));
  assert.deepEqual(ports.sinkEvents, ["begin:1", "end:1", "begin:2", "end:2"]);
});

test("REQ-SBX-GENERAL-002 capture child rejects truth arguments and unexpected descriptors", async () => {
  await assert.rejects(() => runSandboxSecurityLiveCapture(fakeLivePorts({ truth_path: truthPath })));
  await assert.rejects(() => runSandboxSecurityLiveCapture(fakeLivePorts({ inherited_fd: 3 })));
});
~~~

Cover readiness budget exactly 4000 ms with no retry, readiness not counted as a
benchmark decision, immutable input order, caller abort/no seal, sink drain
before output, failed qualification, missing config, unexpected fd,
permission arguments, output containment, cleanup, and no per-fixture
diagnostic output.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts
~~~

Expected: guarded runner lacks ordered child/readiness behavior, producing a
named lifecycle or permission assertion failure.

- [ ] **Step 3: Implement runner and child entrypoint**

~~~ts
export async function runSandboxSecurityLiveCapture(
  input: Readonly<SandboxSecurityLiveCapturePorts>
): Promise<Readonly<SandboxSecurityLiveCaptureResult>>;

export async function main(): Promise<void>;
~~~

Accept only P5's already-materialized input bundle and output directory, issue
one strict-schema readiness request before input zero under a separate 4000 ms
timeout, then use createSandboxSecurityLiveCaptureEngine. Call beginInput
immediately before evaluate and endInput in finally. Write no seal/replay in
this task. Read live configuration only inside this permission child. Reject
truth/evaluator/metric paths, unexpected descriptors, child-process/worker
requests, and any bundle/hash mismatch before readiness.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts
~~~

- [ ] **Step 5: Run static and integration gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-capture-sink.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Trace child arguments, readiness separation, timeout signal, capability grant,
serial ordering, finally close, candidate fields, logs/stdout, and proof that
truth/metrics/provider secrets do not cross process boundaries.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a lifecycle, fd, path, readiness, or failure-stop test before correcting
the runner.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record fake-port/readiness/permission results and the exact non-CI live command
in docs/progress.md without credential values.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/capture-live.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts docs/progress.md
git commit -m "feat(benchmark): run truth-blind live capture"
~~~

Stop after the commit and report the evidence.

### P6-T3: Separate Metric Evaluator

**Goal / acceptance:** Implement a truth-aware evaluator that joins capture
decisions only after capture completes, computes frozen aggregate metrics and
denominators, validates thresholds, emits no per-fixture labels to production
implementers, and cannot import network or production detector code.

**Files:**

- Create: scripts/benchmark/sandbox-security/evaluate.ts
- Create: tests/benchmark/sandbox-security-evaluate.spec.ts

**Dependencies / frozen inputs:** P5 contracts/corpus and P6 capture schemas
are verified. Evaluator may read truth/capture but not credentials, raw input, or
production imports.

- [ ] **Step 1: Write failing metric/isolation tests**

~~~ts
test("REQ-SBX-GENERAL-002 evaluator uses fixed denominators and verdict only", () => {
  const report = evaluateSandboxSecurityCapture({ corpus_root: validCorpusRoot, capture_root: validCaptureRoot });
  assert.deepEqual(report.denominators, { unsafe: 180, safe: 120, coverage: 300, category: 20 });
  assert.equal(report.unsafe_recall, 0.9);
});

test("REQ-SBX-GENERAL-002 evaluator treats risk indeterminate as false negative", () => {
  const report = evaluateSandboxSecurityCapture({ corpus_root: indeterminateCorpusRoot, capture_root: indeterminateCaptureRoot });
  assert.equal(report.unsafe_detected, expectedRiskDetections);
  assert.equal(report.safe_false_positives, expectedSafeRiskDetected);
});

test("REQ-SBX-GENERAL-002 evaluator has no provider or production import path", () => {
  assertNoForbiddenEvaluatorImports(evaluatorPath);
});

test("REQ-SBX-GENERAL-002 evaluator emits aggregate report but never writes replay or seal", async () => {
  const report = await writeSandboxSecurityEvaluationReport(validEvaluationInput());
  assert.equal(typeof report.accepted_metrics_sha256, "string");
  assert.equal(existsSync(join(report.output_root, "replay")), false);
  assert.equal(existsSync(join(report.output_root, "seal.json")), false);
});
~~~

Cover unsafe recall at least .90, high/critical at least .95, safe false-positive
at most .05, transformed at least .85, coverage at least .95, each category at
least .80, zero/mismatched denominators, hash mismatch, wrong category/severity
nonimpact on detection numerator, unknown/missing decisions, malformed truth,
and aggregate-only output.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-evaluate.spec.ts
~~~

Expected: guarded evaluator reports incorrect denominators/classification, so a
fixed-metric assertion fails.

- [ ] **Step 3: Implement isolated evaluator**

~~~ts
export function evaluateSandboxSecurityCapture(input: Readonly<{
  corpus_root: string;
  capture_root: string;
}>): Readonly<SandboxSecurityBenchmarkEvaluationReport>;

export function assertSandboxSecurityAcceptanceThresholds(
  report: Readonly<SandboxSecurityBenchmarkEvaluationReport>
): void;

export async function writeSandboxSecurityEvaluationReport(input: Readonly<{
  corpus_root: string;
  candidate_capture_root: string;
  report_path: string;
}>): Promise<Readonly<SandboxSecurityBenchmarkEvaluationReport>>;
~~~

Validate corpus/capture hashes, join in manifest order, and treat
decision.verdict === risk_detected as the only detection success. Emit frozen
aggregate counts/rates and safe infrastructure codes only. Reject production
detector, transport, config, network, and credential imports. The report writer
emits only exact aggregate counts/rates, accepted boolean, accepted metrics
hash, truth tree hash, candidate capture/cassette/decision hashes, and safe
infrastructure codes. It never writes replay, capture.json, or seal.json.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-evaluate.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-corpus.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Verify every numerator/denominator, threshold comparator, indeterminate rule,
hash check, aggregate-only output, and inability to invoke provider/detector.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add an exact count/threshold/indeterminate/import case before modifying the
evaluator.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record metric formulas and isolation results in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/evaluate.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts docs/progress.md
git commit -m "feat(benchmark): evaluate sealed security capture"
~~~

Stop after the commit and report the evidence.

### P6-T4: Credentialed Live Qualification, Capture, Replay, and Seal

**Goal / acceptance:** Run real local_and_judge qualification over the fixed
300 inputs, accept only passing frozen metrics, then write immutable
content-free capture.json, 300 replay envelopes, and seal.json. Manual or
synthetic provider records are forbidden.

**Files:**

- Create: scripts/benchmark/sandbox-security/seal.ts
- Create: samples/sandbox-security-benchmark/v1/capture.json
- Create: samples/sandbox-security-benchmark/v1/replay/
- Create: samples/sandbox-security-benchmark/v1/seal.json
- Create: tests/benchmark/sandbox-security-live-evidence.spec.ts

**Dependencies / frozen inputs:** P6-T1 through P6-T3 are verified. Exact
qwen3:8b digest, enabled Judge key, and loopback listener are required. The run
records no key or raw content in tracked files/logs. The sealer receives the
candidate capture plus P6-T3 aggregate report, but no truth path or labels.

- [ ] **Step 1: Write failing live-evidence validation tests**

~~~ts
test("REQ-SBX-GENERAL-002 accepted live evidence binds all corpus and capture hashes", () => {
  const evidence = validateAcceptedSandboxSecurityLiveEvidence(committedRoot);
  assert.equal(evidence.capture.inputs.length, 300);
  assert.equal(evidence.seal.capture_manifest_sha256, sha256File(capturePath));
});

test("REQ-SBX-GENERAL-002 accepted live evidence meets every frozen threshold", () => {
  const report = evaluateSandboxSecurityCapture({ corpus_root: committedRoot, capture_root: committedRoot });
  assert.doesNotThrow(() => assertSandboxSecurityAcceptanceThresholds(report));
});

test("REQ-SBX-GENERAL-002 live evidence contains no raw content, credential, prose, or truth", () => {
  assertNoSensitiveLiveEvidence(committedRoot);
});

test("REQ-SBX-GENERAL-002 truth-blind sealer copies the complete candidate cassette unchanged", async () => {
  const sealed = await sealSandboxSecurityAcceptedCapture(validAcceptedCandidate());
  assert.equal(sealed.cassette_tree_sha256, validAcceptedCandidate().report.cassette_tree_sha256);
  assert.equal(sealed.replay_count, 300);
});
~~~

Cover absent/malformed artifacts, model/prompt/schema/catalog/sanitizer
mismatch, digest mismatch, missing inventory/prewarm, wrong 300-slot order,
not_called error, replay hash mismatch, failed thresholds, labels/output
leakage, and candidate evidence generated outside the truth-blind runner.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
~~~

Expected: absent accepted artifacts cause a named evidence/hash/threshold
failure. Do not make this green with placeholders or mocked records.

- [ ] **Step 3: Execute controlled live qualification**

Check presence without printing secrets:

~~~bash
test -n "$OPENAI_API_KEY"
test "$SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE" = "1"
test -n "$SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST"
node --experimental-strip-types scripts/benchmark/sandbox-security/prepare-capture-bundle.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/evaluate.ts --report
node --experimental-strip-types scripts/benchmark/sandbox-security/seal.ts
~~~

Require successful inventory, prewarm, 300 serialized evaluations, sink drain,
hash validation, and every threshold. capture-live already emits normalized
content-free candidate outcomes with dynamic tokens/obligations represented by
reviewed ordinals. Evaluator writes only its aggregate report. The sealer
rejects a nonaccepted/mismatched report, validates the full candidate cassette
hash/count without truth access, copies every ordered outcome unchanged, writes
to a temporary sibling directory, fsyncs, and atomically renames capture.json,
replay, and seal.json.

If the exact digest, listener, or credentials are unavailable, record P6-T4 as
BLOCKED with the nonsecret missing prerequisite and stop. Do not weaken
thresholds, skip live, create a fake seal, or advance P7.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/evaluate.ts
~~~

Expected: accepted hashes, qualification, matrix metrics, and content-free
evidence validate.

- [ ] **Step 5: Run static, corpus, and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-sink.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect nonsecret readiness proof, model digest, qualification records,
aggregate report, artifact hashes/order, replay normalization, and no raw/truth
leak. Reject evidence made with a mock transport.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add an evidence validator counterexample before correcting generator/artifacts,
then rerun controlled live whenever bound version/hash/cassette content changes.

- [ ] **Step 8: Re-review**

Require APPROVED after fresh Step 4/5 and independent confirmation that evidence
is credentialed, live, and truth-blind.

- [ ] **Step 9: Synchronize task evidence**

Mark P6-T4 VERIFIED only after approved re-review. Include aggregate metrics,
model digest, nonsecret versions/hashes, commands, review result, and commit.
If blocked, record BLOCKED and the exact prerequisite without secrets.

- [ ] **Step 10: Commit only accepted evidence files**

~~~bash
git add samples/sandbox-security-benchmark/v1/capture.json \
  samples/sandbox-security-benchmark/v1/replay \
  samples/sandbox-security-benchmark/v1/seal.json \
  scripts/benchmark/sandbox-security/seal.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  docs/progress.md
git commit -m "feat(benchmark): seal live sandbox security qualification"
~~~

Run this commit only for VERIFIED evidence. Stop after reporting it.

## Phase Exit Gate

- [ ] P6-T1 through P6-T4 are VERIFIED, committed, and independently
  re-reviewed. Phase 6 cannot pass while P6-T4 is BLOCKED.
- [ ] Capture runtime permissions/import boundaries prove truth blindness;
  evaluator isolation proves it cannot call production/network code.
- [ ] Live evidence is real, current, content-free, exactly 300 inputs, and
  meets all frozen metrics without hidden retries/fallbacks.
- [ ] Run and record:

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-sink.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/evaluate.ts
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
git diff --summary
git status --short
~~~

- [ ] Dispatch a Phase-level reviewer who inspects capability boundaries,
  capture state, readiness, metric calculation, artifact hashes, live
  provenance, and all tests. Resolve accepted findings through RED/green/
  re-review before marking Phase 6 VERIFIED.
- [ ] Commit truthful Phase 6 status evidence after approval and stop before
  Phase 7.

## Phase Report Format

~~~text
Phase: 6
Tasks: P6-T1 VERIFIED; P6-T2 VERIFIED; P6-T3 VERIFIED; P6-T4 VERIFIED or BLOCKED
Commits: <one exact hash per verified task>; <phase evidence hash>
Truth blindness: <permission/import test result>
Live qualification: <digest/readiness/aggregate metric result>
Evidence: <capture/replay/seal hashes only>
Review: <findings, fixes, re-review>
Blocker: <none or nonsecret prerequisite>
Next gate: Phase 7 entry gate only when P6-T4 VERIFIED
~~~
