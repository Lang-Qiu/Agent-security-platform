# P6 Live Acceptance Capability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsafe in-process P6 acceptance chain with fixed capability-separated workers, fd-bound snapshots, strict stage I/O, and a source-rooted signed receipt chain before running real live acceptance.

**Architecture:** An uncredentialed `accept-live.ts` authority owns only fixed child launch and the local Ed25519 signing key. Separate prepare, credentialed capture, truth-aware evaluator, and truth-blind sealer workers communicate through exact content-free summaries and authority-signed receipts. Every stage reads security-relevant files through immutable fd snapshots; the final seal retains the fixed-public-key-verifiable chain.

**Tech Stack:** Node.js 22 TypeScript strip-types, `node:crypto` Ed25519, Node permission model, `node:child_process`, POSIX no-follow/exclusive filesystem flags, `node:test`.

---

## File Map

- Create `p6-acceptance-protocol.ts`: exact receipt schemas, signing bytes, fixed-key verification, private-key validation, and one-use consumption.
- Create `p6-acceptance-public-key.pem`: tracked Ed25519 trust root only.
- Create `fs-snapshot.ts`: bounded no-follow fd snapshots, exact inventories, root bindings, and exclusive atomic writes.
- Create `stage-protocol.ts`: exact one-line worker summary parsers and closed worker environments.
- Create `capture-candidate.ts`: production-neutral candidate materialization moved out of `capture-live.ts`.
- Create `prepare-live-worker.ts`, `capture-live-worker.ts`, `evaluate-live-worker.ts`, and `seal-live-worker.ts`: fixed capability stages.
- Modify `accept-live.ts`: signing authority and fixed stage launcher only.
- Modify `prepare-capture-bundle.ts`, `capture-live.ts`, `evaluate.ts`, `seal.ts`, and `contracts.ts`: snapshot-based stage contracts and signed seal.
- Extend the five P6 benchmark test files and repository production/spec/plan gates.
- Synchronize canonical P6 docs only after deterministic GREEN.

### Task 1: Fixed Acceptance Signature Protocol

**Files:**
- Create: `scripts/benchmark/sandbox-security/p6-acceptance-protocol.ts`
- Create: `scripts/benchmark/sandbox-security/p6-acceptance-public-key.pem`
- Modify: `.gitignore`
- Test: `tests/benchmark/sandbox-security-accept-live.spec.ts`

- [ ] **Step 1: Write failing receipt tests**

Require `createSandboxSecurityP6AcceptanceReceipt`,
`verifySandboxSecurityP6AcceptanceReceipt`,
`consumeSandboxSecurityP6AcceptanceReceipt`, and
`loadSandboxSecurityP6AcceptancePrivateKey`. Cover exact keys, capture/evaluation
issuer domains, binding/signature tamper, unknown public key, wrong issuer,
private/public mismatch, non-mode-`600` private key, symlink key, and replay.

```ts
const receipt = createSandboxSecurityP6AcceptanceReceipt({
  issuer: "capture",
  run_id: "0123456789abcdef0123456789abcdef",
  issued_binding: captureBinding(),
  private_key: loadSandboxSecurityP6AcceptancePrivateKey(localKeyPath)
});
assert.equal(verifySandboxSecurityP6AcceptanceReceipt(receipt).issuer, "capture");
assert.throws(() => consumeSandboxSecurityP6AcceptanceReceipt(receipt));
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern='P6 receipt|acceptance private key' \
  tests/benchmark/sandbox-security-accept-live.spec.ts
```

Expected: missing module/export behavior, not fixture or environment errors.

- [ ] **Step 3: Implement minimal protocol**

Provision one local mode-`600` private key and tracked public key without
printing private material. Implement exact-record normalization, canonical JSON
binding hashes, fixed SPKI fingerprint comparison, domain-separated Ed25519
sign/verify, and one-use verified receipt consumption.

- [ ] **Step 4: Run GREEN**

Run the acceptance test and `npm run typecheck:benchmark:sandbox-security`.
Expected: protocol tests pass and the private key remains ignored.

### Task 2: Immutable Filesystem Snapshots And Root Binding

**Files:**
- Create: `scripts/benchmark/sandbox-security/fs-snapshot.ts`
- Test: `tests/benchmark/sandbox-security-isolation.spec.ts`
- Test: `tests/benchmark/sandbox-security-live-evidence.spec.ts`

- [ ] **Step 1: Write failing snapshot and overlap tests**

Cover accessors without getter invocation, symlink/hardlink files, replacement
between open/read, metadata change during read, undeclared directory entries,
directory replacement, forward/reverse root containment, and symlink aliases.

```ts
assert.throws(() => bindSandboxSecurityLiveRoots({
  corpus_root: join(root, "corpus"),
  capture_parent_root: root,
  output_root: join(root, "out")
}), /path_overlap/);
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern='snapshot|root.*overlap|reverse containment|symlink alias' \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
```

Expected: missing snapshot/root-binding API failures.

- [ ] **Step 3: Implement fd-bound primitives**

Implement `snapshotSandboxSecurityFile`,
`snapshotSandboxSecurityJson`, `snapshotSandboxSecurityDirectory`,
`bindSandboxSecurityLiveRoots`, and
`writeSandboxSecurityExclusiveAtomicFile`. Use
`O_RDONLY | O_NOFOLLOW`, pre/post `fstat`, regular file + `nlink === 1`,
bounded bytes, real-root containment, sorted exact inventory,
`O_CREAT | O_EXCL`, fsync-before-rename, and directory fsync.

- [ ] **Step 4: Run GREEN**

Run both focused files and benchmark typecheck. Expected: all mutation/race
fixtures fail closed without getter execution.

### Task 3: Closed Worker I/O And Environment Protocol

**Files:**
- Create: `scripts/benchmark/sandbox-security/stage-protocol.ts`
- Test: `tests/benchmark/sandbox-security-accept-live.spec.ts`
- Test: `tests/benchmark/sandbox-security-isolation.spec.ts`

- [ ] **Step 1: Write failing stage parser tests**

Require exit `0`, empty stderr, exactly one bounded newline-terminated JSON
stdout frame, exact keys/status, and no leading/trailing/duplicate frames.
Require prepare/evaluate/seal environments to contain no live variable.

```ts
assert.throws(() => parseSandboxSecurityStageResult({
  exit_code: 0,
  stdout: '{"status":"capture_complete"}\nextra\n',
  stderr: ""
}), /stage_stdout_invalid/);
```

- [ ] **Step 2: Run RED**

Run the two focused files with
`--test-name-pattern='stage stdout|stage stderr|worker environment'`.
Expected: missing parser/environment behavior.

- [ ] **Step 3: Implement exact stage protocol**

Add one parser per fixed status, maximum `4096` stdout bytes, zero successful
stderr bytes, exact own enumerable data-property snapshots, safe fixed failure
codes, and environment constructors that never accept caller maps.

- [ ] **Step 4: Run GREEN**

Run both focused files and benchmark typecheck.

### Task 4: Prepare And Credentialed Capture Separation

**Files:**
- Create: `scripts/benchmark/sandbox-security/capture-candidate.ts`
- Create: `scripts/benchmark/sandbox-security/prepare-live-worker.ts`
- Create: `scripts/benchmark/sandbox-security/capture-live-worker.ts`
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Test: `tests/benchmark/sandbox-security-isolation.spec.ts`
- Test: `tests/benchmark/sandbox-security-capture-live.spec.ts`

- [ ] **Step 1: Write failing capability/getter/snapshot tests**

Require prepare code to have no production/evaluator import, capture worker to
have no truth/evaluator/sealer import, bundle/receipt accessors to be rejected
without invocation, all 300 inputs to be opened before readiness, and
post-snapshot input replacement to have no effect or fail before provider calls.

- [ ] **Step 2: Run RED**

Run isolation and capture-live test files. Expected: named import, getter-count,
and input replacement assertions fail.

- [ ] **Step 3: Move candidate materialization**

Move `materializeSandboxSecurityCandidatePackage` and staging helpers into
`capture-candidate.ts` without schema changes. Update imports and return to
GREEN before proceeding.

- [ ] **Step 4: Remove in-process receipt/evaluator ownership**

Delete WeakMap capture/evaluation receipt APIs from
`prepare-capture-bundle.ts`. Add exact serializable prepared-bundle descriptor
normalization whose code/input hashes are revalidated by capture worker.

- [ ] **Step 5: Add fixed prepare and capture workers**

Prepare worker creates the input-only bundle and descriptor with all live
variables absent. Capture worker loads the descriptor once, validates hashes,
launches the permission child with exactly six values loaded by Node from the
env file, requires strict child output, and emits only the capture binding.

- [ ] **Step 6: Snapshot capture inputs before providers**

Change `runSandboxSecurityLiveCapture` to snapshot, normalize, freeze, and hash
all 300 envelopes before readiness. The loop consumes only frozen memory.

- [ ] **Step 7: Run GREEN and broader gates**

Run isolation, capture-live, capture-sink, contracts, production composition,
both TypeScript checks, and `git diff --check`.

### Task 5: Truth-Aware Evaluator Worker

**Files:**
- Create: `scripts/benchmark/sandbox-security/evaluate-live-worker.ts`
- Modify: `scripts/benchmark/sandbox-security/evaluate.ts`
- Test: `tests/benchmark/sandbox-security-evaluate.spec.ts`
- Test: `tests/benchmark/sandbox-security-isolation.spec.ts`

- [ ] **Step 1: Write failing evaluator boundary tests**

Require a valid one-use signed capture receipt, no live variables, no
production/network imports, immutable truth/candidate snapshots, unchanged
metrics after path replacement, and no report on a binding mismatch.

- [ ] **Step 2: Run RED**

Run evaluator and isolation tests. Expected: worker missing and current path
reread behavior fails.

- [ ] **Step 3: Implement snapshot-based evaluation**

Load manifest, truth, decisions, package, and cassette once through
`fs-snapshot.ts`; compute metrics and hashes from those same bytes. Verify and
consume the capture receipt, write one exclusive report, and emit an exact
evaluation binding.

- [ ] **Step 4: Run GREEN**

Run evaluate, contracts, corpus, isolation, benchmark typecheck, and diff check.

### Task 6: Signed Truth-Blind Seal And Publication

**Files:**
- Create: `scripts/benchmark/sandbox-security/seal-live-worker.ts`
- Modify: `scripts/benchmark/sandbox-security/seal.ts`
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Test: `tests/benchmark/sandbox-security-live-evidence.spec.ts`

- [ ] **Step 1: Write failing seal-chain tests**

Reject missing signatures, unknown keys, binding/signature tamper, run-ID
mismatch, replayed receipts, candidate/report swaps, publication races,
nonempty output, and a self-consistent public-hash-only seal.

- [ ] **Step 2: Run RED**

Run live-evidence tests with
`--test-name-pattern='receipt chain|signature|publication|path swap'`.
Expected: current unsigned seal is accepted and the new assertion fails.

- [ ] **Step 3: Implement signed seal consumption**

Verify and consume both receipts, snapshot candidate/report/manifest once,
check all bindings and thresholds, and pass immutable data to publication. Add
exact receipt-chain fields to the seal contract and final validator.

- [ ] **Step 4: Harden atomic publication**

Use exclusive temps, no-follow checks, fsync each replay file/directory, refuse
existing final entries, publish signed `seal.json` last, and clean only the
current run's private temp root.

- [ ] **Step 5: Run GREEN**

Run live-evidence, evaluate, contracts, corpus, benchmark typecheck, sensitive
scan, and diff check.

### Task 7: Acceptance Authority, Model Binding, And Permanent Gates

**Files:**
- Modify: `scripts/benchmark/sandbox-security/accept-live.ts`
- Create: `scripts/benchmark/sandbox-security/p6-live-judge-binding.ts`
- Test: `tests/benchmark/sandbox-security-accept-live.spec.ts`
- Test: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Modify: `tests/repository/sandbox-security-production.spec.ts`
- Modify: `tests/repository/sandbox-security-production-spec.spec.ts`
- Modify: `tests/repository/sandbox-security-production-plan.spec.ts`
- Modify: canonical P6 Spec/Master/Phase 6/sprint documents

- [ ] **Step 1: Write failing authority and model-channel tests**

Require authority-only imports, no corpus bytes, fixed worker order, all six
variables absent, credentials loaded only by capture `--env-file`, no private
key inheritance, capture/evaluation signatures, and rejection of model hashes
outside the source-controlled P6 profile.

- [ ] **Step 2: Run RED**

Run accept-live, capture-live, and repository production/spec/plan tests.
Expected: current direct imports and arbitrary model values fail.

- [ ] **Step 3: Implement fixed authority**

Snapshot input data properties once, bind roots/local files once, generate a
128-bit run ID, launch fixed workers, strictly parse summaries, sign capture and
evaluation receipts, write them exclusively, and return only content-free
hashes/counts.

- [ ] **Step 4: Add P6-only Judge binding profile**

Pin protocol/base/endpoint/requested/resolved canonical hashes and stable IDs.
Capture compares runtime values before readiness and copies reviewed IDs into
evidence. Ordinary production remains runtime-selected.

- [ ] **Step 5: Add permanent capability gates**

Repository AST tests enforce exact worker imports, sole signing-key reader,
sole credential env-file handoff, evaluator no-production/no-network, sealer
no-truth, and authority no-corpus/no-stage implementation imports.

- [ ] **Step 6: Synchronize canonical text**

Replace stale single-process and `prepare -> evaluate -> seal` commands with
the fixed `env -u` six-variable live command, add worker ownership, and keep
P6 pending until real evidence exists.

- [ ] **Step 7: Run deterministic pre-live exit gates**

```bash
npm run test:engine:sandbox:production
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-accept-live.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
git diff --check
```

Expected: deterministic gates GREEN; committed evidence checks remain RED only
for absent real artifacts.

### Task 8: Independent Review And Real P6 Acceptance

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`
- Generate after acceptance only: `capture.json`, `replay/*.json`, `seal.json`

- [ ] **Step 1: Obtain specification review**

Review amendment, diff, tests, import/permission graph, key handling, timing,
and deterministic evidence. Fix accepted findings with new RED tests until
`APPROVED`.

- [ ] **Step 2: Obtain quality/security review**

A separate reviewer verifies every original finding RESOLVED, fixed trust root,
TOCTOU handling, output closure, model binding, cleanup, and tests. Fix accepted
findings RED-first and require final `APPROVED`.

- [ ] **Step 3: Run controlled live acceptance**

Use all six ambient variables unset, the local mode-`600` credential env file,
the local mode-`600` acceptance key, fresh capture parent, and intended output.
Never print environment values or worker bodies.

Expected: Judge readiness, five warmed Ollama probes, 300 evaluations, accepted
metrics, signed seal, and empty successful worker stderr within `20s/40s`.

- [ ] **Step 4: Validate real evidence**

Run corpus validation, live-evidence validation, sensitive scan,
signature-chain verification, exact 300 replay inventory, both TypeScript
checks, production, repository, sandbox, and diff gates.

- [ ] **Step 5: Record P6 VERIFIED**

Record aggregate metrics, content-free hashes, timing, public-key fingerprint,
review conclusions, and counts. Advance only to actual P7-T1 after P6 is fully
VERIFIED.

## Plan Self-Review

- Spec coverage: process separation, fixed trust root, snapshots, overlap,
  strict I/O, model channel, timing, permanent gates, review, and real
  acceptance each map to a task.
- Placeholder scan: no deferred implementation placeholders are present.
- Type consistency: `run_id`, `issued_binding`,
  `issued_binding_sha256`, `acceptance_public_key_sha256`, and
  `signature_base64url` are consistent from Task 1 through Task 8.
- Scope: this closes only the corrective P6-T4 blocker. P7 remains under its
  existing Phase 7 plan and starts only after Task 8.

