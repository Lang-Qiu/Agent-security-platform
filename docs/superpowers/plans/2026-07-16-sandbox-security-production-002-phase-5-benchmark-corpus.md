# Phase 5: Benchmark Source Lock and Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. This Phase curates durable benchmark
> data, so every deterministic validator must show RED then GREEN and each task
> closes its independent review loop before the next begins.

**Goal:** Define exact benchmark envelopes, admit only independently reviewed
public-source records with compatible licensing, curate the fixed 300-input
corpus with separately isolated truth, manifest-bound review evidence, and a
pre-label request-ID ledger, and build a permission-limited input-only capture
bundle.

**Architecture:** Scripts under scripts/benchmark/sandbox-security are not
production detector code and cannot be imported by it. Sources.lock.json pins
record-level evidence. Inputs contain only Engine requests; truth contains labels
and provenance. Manifest ties immutable ordered inputs/truth, review, and
pre-label request-ID trees to locks.
Capture preparation emits an input-only materialized bundle plus an exact
source/code allowlist, then invokes a child under Node permissions later in
Phase 6.

**Tech Stack:** TypeScript ESM, node:test, Node permission model, SHA-256,
immutable JSON envelopes, no network fetch during normal tests.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P5-T1 | benchmark, review-ledger, request-ID-ledger contracts and schema tests |
| P5-T2 | source admission importer, sources lock, attribution, admission tests |
| P5-T3 | corpus validator, 300 inputs/truth/reviews/request IDs/manifest, corpus tests |
| P5-T4 | input-only capture bundle preparation and isolation tests |

No production source imports scripts/benchmark, samples, truth, manifest,
source lock, replay, Track 1 fixtures, reports, or capture data. No script in
this Phase calls a provider, reads a credential, or creates a sealed replay.

## Phase Entry Gate

- [ ] Confirm Phase 4 is VERIFIED with an APPROVED Phase review.
- [ ] Read Spec sections Benchmark Source Governance, Benchmark Layout,
  Benchmark Matrix, Live Capture Qualification, Anti-Oracle and Isolation
  Gates, Documentation Requirements, and Acceptance Criteria.
- [ ] Confirm no benchmark input/truth/source lock/capture/replay tree exists
  before P5-T1; do not reuse Track 1 fixtures or expected outcomes.
- [ ] Run the production baseline:

~~~bash
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

## Task DAG

~~~mermaid
flowchart LR
  T1[P5-T1 envelope contracts] --> T2[P5-T2 source lock]
  T2 --> T3[P5-T3 300-input corpus]
  T1 --> T3
  T3 --> T4[P5-T4 truth-blind bundle]
~~~

P5-T3 may not begin until the source lock and attribution have been independently
reviewed. The 300 data files are created only in P5-T3, after every selected
record has a lock entry.

### P5-T1 Corrective Governance Gate

The review-ledger amendment, the GENERAL-002 Master plan, and this Phase 5 plan
are owned by one P5-T1 corrective commit together with the accepted contract
and schema-test fixes:

- `docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md`
- `docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md`
- `docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md`

None of these governance documents belongs in the P5-T3 corpus commit. P5-T3
may not begin or continue, and Step 10 may not create its commit, until all
three paths are already committed together by P5-T1 and the worktree is clean
for them. Run this gate before beginning or continuing P5-T3 and again
immediately before its commit:

~~~bash
git ls-files --error-unmatch \
  docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md
test -z "$(git status --short -- \
  docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md)"
~~~

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Each task follows intended RED, minimal GREEN, focused static/contract checks,
sandbox TypeScript where production imports are involved, npm run build
--prefix frontend, git diff --check, independent review, accepted-finding RED
regressions, APPROVED re-review, truthful progress record, exact commit, and
stop. Source/data work is a documented TDD exception only for business logic;
its deterministic validation gate remains mandatory.

### P5-T1: Benchmark Envelope Contracts and Canonical Hashes

**Goal / acceptance:** Define exact-key normalizers and canonical hash helpers
for source lock, input envelope, truth union, review ledger, pre-label request-ID
ledger, manifest, content-free replay envelope, capture manifest, and seal. The
module enforces bounded arrays, opaque fixture IDs, record hashes, independent
approved reviewers, label-blind request-ID slots, no raw provider prose, and no
truth data in input shapes.

**Files:**

- Create: scripts/benchmark/sandbox-security/contracts.ts
- Create: scripts/benchmark/sandbox-security/tsconfig.json
- Create: tests/benchmark/sandbox-security-contracts.spec.ts
- Modify: package.json

**Dependencies / frozen inputs:** Phase 4 benchmark composition types and the
approved Spec Benchmark Layout. Contracts may import public shared request and
security types but must not import production detector modules, transport,
configuration, or any sample data.

- [ ] **Step 1: Write failing schema and separation tests**

~~~ts
test("REQ-SBX-GENERAL-002 input envelope admits only opaque fixture ID and Engine request", () => {
  assert.deepEqual(normalizeBenchmarkInputEnvelope(validInput()), validInput());
  assert.throws(() => normalizeBenchmarkInputEnvelope({ ...validInput(), primary_category: "prompt_injection" }));
});

test("REQ-SBX-GENERAL-002 truth union requires provenance and never enters input", () => {
  assert.equal(normalizeBenchmarkTruthEnvelope(validRiskTruth()).verdict_class, "risk");
  assert.throws(() => normalizeBenchmarkTruthEnvelope({ ...validSafeTruth(), ground_truth_severity: "high" }));
});

test("REQ-SBX-GENERAL-002 capture and replay envelopes cannot retain provider prose or fixture labels", () => {
  assert.throws(() => normalizeBenchmarkReplayEnvelope({ ...validReplay(), provider_body: "raw text" }));
  assert.doesNotMatch(JSON.stringify(normalizeBenchmarkCaptureManifest(validCapture())), /prompt|authorization|usage|truth/);
});

test("REQ-SBX-GENERAL-002 benchmark TypeScript graph is permanently registered", () => {
  assert.equal(existsSync("scripts/benchmark/sandbox-security/tsconfig.json"), true);
  assert.match(readPackage().scripts["typecheck:benchmark:sandbox-security"], /scripts\/benchmark\/sandbox-security\/tsconfig\.json/);
});
~~~

Cover all closed licenses, fixture ID grammar, 64-char hashes, exact source
fields, direct/human_translation/transformed constraints, risk/safe union
fields, category/severity/language/transformation combinations, 1..N source and
obligation ordinals, replay outcome branches, capture qualification,
review and request-ID ledger exact fields/status/ordering/reviewer independence,
manifest/seal hash fields, unknown/inherited/accessor keys, recursive limits,
defensive copies, and stable canonical tree hashing.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts
~~~

Expected: the benchmark tsconfig/script registration assertion fails. Guarded
normalizers still run behavior assertions; a raw missing-module import is
invalid RED.

- [ ] **Step 3: Implement closed contract normalizers**

~~~ts
export function normalizeSandboxSecurityBenchmarkInputEnvelope(
  value: unknown
): Readonly<SandboxSecurityBenchmarkInputEnvelope>;

export function normalizeSandboxSecurityBenchmarkTruthEnvelope(
  value: unknown
): Readonly<SandboxSecurityBenchmarkTruthEnvelope>;

export function normalizeSandboxSecurityBenchmarkReviews(
  value: unknown
): Readonly<SandboxSecurityBenchmarkReviews>;

export function normalizeSandboxSecurityBenchmarkRequestIds(
  value: unknown
): Readonly<SandboxSecurityBenchmarkRequestIds>;

export interface SandboxSecurityReplayInputUnit {
  readonly ollama: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  readonly judge: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOpenAIResponse>;
}

export function hashSandboxSecurityBenchmarkTree(root: string): string;
~~~

Use canonical JSON bytes, sorted relative path inventory, SHA-256, exact-key
plain records, and recursively frozen results. Do not implement provider
parsing, runtime Engine calls, live capture, network, or filesystem source
discovery beyond explicit tree hash traversal.

Create this compiler project and additive package script:

~~~json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "../../../",
    "types": ["node"],
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": [
    "../../../scripts/benchmark/sandbox-security/**/*.ts",
    "../../../tests/benchmark/**/*.ts"
  ],
  "exclude": ["../../../node_modules", "../../../**/dist"]
}
~~~

The typecheck:benchmark:sandbox-security package script runs the repository-
local compiler with this project; its globs include future P5-P7 files as they
are created.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts
npm run typecheck:benchmark:sandbox-security
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Audit every schema discriminant, proof hash, fixture-ID opacity, input/truth
separation, review/request-ID exact-key boundary, independent approval,
pre-label label blindness, provider-prose exclusion, limit, and import graph.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add one malformed envelope or hash-tree counterexample before the smallest
normalizer correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P5-T1 schema version names, deterministic hash rules, durable review and
pre-label request-ID boundaries, review, and commit in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/contracts.ts \
  scripts/benchmark/sandbox-security/tsconfig.json package.json \
  tests/benchmark/sandbox-security-contracts.spec.ts docs/progress.md
git commit -m "feat(benchmark): define sandbox security corpus contracts"
~~~

Stop after the commit and report the evidence.

Accepted review-ledger corrections use a P5-T1 corrective commit. That commit
includes `scripts/benchmark/sandbox-security/contracts.ts`,
`tests/benchmark/sandbox-security-contracts.spec.ts`, and all three governance
documents listed in the P5-T1 Corrective Governance Gate above; it must close
before any P5-T3 work continues.

For this corrective pass, use this exact replacement commit scope rather than
reusing the original P5-T1 Step 10 list:

~~~bash
p5_t3_staged_before="$(git diff --cached --name-only)"
git add scripts/benchmark/sandbox-security/contracts.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md \
  docs/progress.md
git commit --only -m "fix(benchmark): bind corpus review evidence" -- \
  scripts/benchmark/sandbox-security/contracts.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md \
  docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md \
  docs/progress.md
test "$p5_t3_staged_before" = "$(git diff --cached --name-only)"
test "$(git diff-tree --no-commit-id --name-only -r HEAD | sort)" = \
  "$(printf '%s\n' \
    scripts/benchmark/sandbox-security/contracts.ts \
    tests/benchmark/sandbox-security-contracts.spec.ts \
    docs/superpowers/specs/2026-07-21-sandbox-security-benchmark-review-ledger-amendment.md \
    docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md \
    docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-5-benchmark-corpus.md \
    docs/progress.md | sort)"
~~~

### P5-T2: Reviewed Source Admission, Lock, and Attribution

**Goal / acceptance:** Create the source importer that validates a manually
reviewed candidate record against the closed allowed families/revisions/licences
and writes no data automatically. Commit an immutable sources lock and
attribution file containing only selected compatible records and required
license evidence.

**Files:**

- Create: scripts/benchmark/sandbox-security/import-sources.ts
- Create: samples/sandbox-security-benchmark/v1/sources.lock.json
- Create: samples/sandbox-security-benchmark/v1/ATTRIBUTION.md
- Create: tests/benchmark/sandbox-security-source-admission.spec.ts

**Dependencies / frozen inputs:** P5-T1 is verified. The only eligible families
and revisions are AgentDojo 089ed468cf3ed0322acc66b0211f26d9d90dbf60,
ToolEmu ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb,
deepset/prompt-injections 4f61ecb038e9c3fb77e21034b22511b523772cdd, and
OpenAssistant/oasst1 fdf72ae0827c1cda404aff25b6603abec9e3399b. The lock may
contain only records whose record-level license evidence proves Apache-2.0,
MIT, BSD-2-Clause, BSD-3-Clause, CC-BY-4.0, or CC0-1.0.

- [ ] **Step 1: Write failing admission and lock tests**

~~~ts
test("REQ-SBX-GENERAL-002 source admission accepts only pinned record evidence", () => {
  assert.equal(validateReviewedSourceRecord(validAgentDojoRecord()).source_id, "agentdojo");
  assert.throws(() => validateReviewedSourceRecord({ ...validAgentDojoRecord(), revision: "HEAD" }));
});

test("REQ-SBX-GENERAL-002 source admission rejects incompatible ambiguous and excluded datasets", () => {
  for (const candidate of [ncRecord(), researchOnlyRecord(), mixedLicenseRecord(), bipiaRecord(), agentPoisonRecord(), injecAgentRecord()]) {
    assert.throws(() => validateReviewedSourceRecord(candidate));
  }
});

test("REQ-SBX-GENERAL-002 source lock and attribution have one-to-one reviewed records", () => {
  const lock = readSourcesLock();
  assert.equal(lock.sources.every(source => source.records.length > 0), true);
  assertAttributionCoversEveryLockedSource(lock, readAttribution());
});
~~~

Test revision equality, official URL scheme, licence evidence hash, upstream
record hash, admitted scope, redistribution confirmation, required attribution,
duplicate source/record rejection, no full upstream dataset storage, no
network fetch, and an exact static rejection of automatic HTTP/fetch/child
process download code.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-source-admission.spec.ts
~~~

Expected: the missing lock/importer causes a guarded candidate validator to
reject valid reviewed data or a lock-coverage assertion to fail. The failure
must name an admission field, not a missing unrelated environment variable.

- [ ] **Step 3: Implement reviewed-only admission and curate lock data**

~~~ts
export interface SandboxSecurityReviewedSourceRecord {
  readonly source_id: string;
  readonly upstream_url: string;
  readonly revision: string;
  readonly admitted_scope: string;
  readonly license: "Apache-2.0" | "MIT" | "BSD-2-Clause" | "BSD-3-Clause" | "CC-BY-4.0" | "CC0-1.0";
  readonly license_url: string;
  readonly license_evidence_sha256: string;
  readonly attribution: string;
  readonly redistribution_confirmed: true;
  readonly record_ref: string;
  readonly upstream_sha256: string;
}

export function validateSandboxSecurityReviewedSourceRecord(
  value: unknown
): Readonly<SandboxSecurityReviewedSourceRecord>;

export function importSandboxSecurityReviewedRecords(input: Readonly<{
  reviewed_records: readonly unknown[];
}>): Readonly<SandboxSecurityBenchmarkSourcesLock>;
~~~

The importer accepts only caller-supplied reviewed records; it never contacts an
upstream. Populate sources.lock.json with the selected record refs, immutable
revisions, hashes, license URL/evidence hash, attribution, and confirmation.
Write attribution text for every lock source. Exclude BIPIA, AgentPoison,
InjecAgent, and all noncompatible or unproven candidate records.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-source-admission.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-source-admission.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

An independent reviewer must validate every selected upstream record against
the source at the pinned revision, licence terms, redistribution evidence,
attribution, hash, and lock entry. It must confirm no excluded dataset/record
or source-wide license assumption slips into the lock.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a rejected source record test for every accepted admission gap before
correcting lock data/import validation.

- [ ] **Step 8: Re-review**

Require APPROVED after reviewer re-checks every lock record and Step 4/5 is
green.

- [ ] **Step 9: Synchronize task evidence**

Append P5-T2 source-review identifiers, reviewer conclusion, command results,
and exact commit to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/import-sources.ts \
  samples/sandbox-security-benchmark/v1/sources.lock.json \
  samples/sandbox-security-benchmark/v1/ATTRIBUTION.md \
  tests/benchmark/sandbox-security-source-admission.spec.ts \
  docs/progress.md
git commit -m "feat(benchmark): lock reviewed sandbox security sources"
~~~

Stop after the commit and report the evidence.

### P5-T3: Fixed 300-Input Corpus, Truth, and Manifest

**Goal / acceptance:** Curate and validate a sealed candidate corpus of exactly
300 input envelopes and 300 separately stored truth envelopes, tied to the
reviewed source lock. Inputs are opaque ordered Engine requests; truth provides
risk/safe status, primary category/severity, language, transformation, and
provenance. No production detector sees any of these files.

**Files:**

- Create: scripts/benchmark/sandbox-security/validate-corpus.ts
- Create: samples/sandbox-security-benchmark/v1/inputs/
- Create: samples/sandbox-security-benchmark/v1/truth/
- Create: samples/sandbox-security-benchmark/v1/reviews/reviews.json
- Create: samples/sandbox-security-benchmark/v1/request-ids/request-ids.json
- Create: samples/sandbox-security-benchmark/v1/manifest.json
- Create: tests/benchmark/sandbox-security-corpus.spec.ts

**Dependencies / frozen inputs:** P5-T1 and P5-T2 are verified. Every fixture
maps to a sources.lock record, a verified source hash, and one approved record
in the manifest-bound review ledger. Every risk label receives independent
category/severity adjudication under `sandbox-security-severity-rubric.v1`.
At least 54 risk fixtures are independently authored transformations; Chinese
derivatives require human material revision and a second reviewer. Every input
request ID maps by manifest ordinal to an independently approved, label-blind,
pre-label random-ID slot.

- [ ] **Step 1: Write failing corpus-matrix tests**

~~~ts
test("REQ-SBX-GENERAL-002 corpus validator rejects 299 inputs and any input/truth mismatch", () => {
  assert.throws(() => validateSandboxSecurityBenchmarkCorpus(tempCorpus({ total: 299 })));
  assert.throws(() => validateSandboxSecurityBenchmarkCorpus(tempCorpus({ missingTruthFor: "ssb-v1-0001" })));
});

test("REQ-SBX-GENERAL-002 corpus proves exact risk/category/stage/language matrix", () => {
  const report = validateSandboxSecurityBenchmarkCorpus({ corpus_root: committedCorpusRoot, sources_lock: committedSourcesLock });
  assert.equal(report.counts.total, 300);
  assert.equal(report.counts.risk, 180);
  assert.equal(report.counts.safe, 120);
  assert.equal(report.counts.zh, 150);
  assert.equal(report.counts.en, 150);
  assert.ok(report.counts.transformed_risk >= 54);
  assert.equal(report.counts.each_primary_risk_category, 20);
  assert.equal(report.counts.each_stage, 100);
});

test("REQ-SBX-GENERAL-002 corpus excludes Track 1 and development-oracle provenance", () => {
  assert.doesNotMatch(readAllCorpusText(), /T1-SC-|expected_action|campaign|report fixture/i);
});
~~~

Include deterministic invalid fixtures for duplicate normalized content, unsafe
truth shape, wrong fixture hash, source record not locked, unreviewed machine
translation, invalid transformation kind, transformed seed/development overlap,
wrong high/critical counts, stage imbalance, category imbalance, and leaked
fixture/category/severity/action in an Engine request. Also cover missing,
pending, mismatched, or same-author review records; review/request tree tamper;
sequential and ordinal/fixture/source/truth/label-derived request IDs; insufficient
safe multi-source/retrieved/memory controls; malformed UTF-8; and validator
resource-budget exhaustion. Each mutation asserts one precise failure code.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-corpus.spec.ts
~~~

Expected: the initial corpus tree is incomplete, so validator reports a named
matrix/hash/provenance failure. This data-validation RED is valid only when the
same validator correctly accepts the test-local minimal valid control corpus.

- [ ] **Step 3: Implement deterministic validator and curate reviewed corpus**

~~~ts
export function validateSandboxSecurityBenchmarkCorpus(input: Readonly<{
  corpus_root: string;
  sources_lock: Readonly<SandboxSecurityBenchmarkSourcesLock>;
}>): Readonly<SandboxSecurityBenchmarkCorpusValidationReport>;
~~~

Create 300 input files, 300 truth files, 300 approved review records, and 300
approved pre-label request-ID slots in immutable manifest input order.
Use opaque fixture IDs with no category/label semantics. The validator must
prove exactly 180 risk, 120 safe, twenty risks for each of nine categories,
100 per stage, 150 Chinese/150 English, at least 54 transformed risk fixtures,
at least sixty high/critical risks, at least twenty high and twenty critical,
at least ten safe multi-source fixtures per stage, at least ten safe fixtures
containing retrieved content, at least ten containing memory content, at least
five risk single-source fixtures per stage, unique normalized source records,
and valid lock/tree/file/fixture hashes. Decode JSON with fatal UTF-8 handling
and keep oracle/provenance scans under explicit aggregate budgets. Curate
only reviewed records/derivatives; do not generate filler text, copy an entire
upstream dataset, or reuse a Track 1/development fixture.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-corpus.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
~~~

Expected: validator prints only aggregate nonsecret matrix/hash results and
accepts exactly the committed 300-input corpus.

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-source-admission.spec.ts \
  tests/benchmark/sandbox-security-corpus.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review the matrix against actual files, every source lock reference/hash, every
review-ledger record and label adjudication, every pre-label request-ID slot and
attestation, input/truth/review/request separation, benign structural controls,
no duplicate normalized content, no Track 1/development overlap, opaque ID
discipline, validator resource bounds, fatal UTF-8 handling, and the exact
high/critical/category/stage counts.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a test-local malformed corpus or a concrete fixture/provenance assertion
for each accepted issue before correcting validator/data. Every data correction
requires the original source review evidence to be rechecked.

- [ ] **Step 8: Re-review**

Require APPROVED after full corpus recount, hash validation, and Step 4/5
evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P5-T3 aggregate counts, tree hashes, corpus reviewer conclusion, tests,
and exact commit in docs/progress.md. Do not put raw fixture content in progress
logs.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/validate-corpus.ts \
  samples/sandbox-security-benchmark/v1/inputs \
  samples/sandbox-security-benchmark/v1/truth \
  samples/sandbox-security-benchmark/v1/reviews/reviews.json \
  samples/sandbox-security-benchmark/v1/request-ids/request-ids.json \
  samples/sandbox-security-benchmark/v1/manifest.json \
  tests/benchmark/sandbox-security-corpus.spec.ts \
  docs/progress.md
git commit -m "feat(benchmark): curate sealed sandbox security corpus"
~~~

Stop after the commit and report the evidence.

### P5-T4: Truth-Blind Input Bundle Preparation

**Goal / acceptance:** Materialize a capture input-only bundle and exact
read/write allowlist, then define the sole parent launcher for the fixed
capture-live.ts child. The child receives only inputs plus required
production/shared/script code and one capture output directory. It cannot read
truth, source lock, manifest labels, evaluator code, metric threshold, or an
unexpected inherited descriptor.

**Files:**

- Create: scripts/benchmark/sandbox-security/prepare-capture-bundle.ts
- Create: tests/benchmark/sandbox-security-isolation.spec.ts

**Dependencies / frozen inputs:** P5-T3 is verified. The bundle contains input
envelopes in immutable manifest order and integrity hashes, but no source lock,
truth, output replay, capture result, category, severity, verdict, action, or
metric.

- [ ] **Step 1: Write failing permission and bundle tests**

~~~ts
test("REQ-SBX-GENERAL-002 capture bundle contains inputs and code allowlist but no truth capability", async () => {
  const bundle = await prepareSandboxSecurityCaptureBundle({ corpus_root: tempCorpusRoot, output_root: tempBundleRoot });
  assert.equal(existsSync(join(bundle.input_root, "ssb-v1-0001.json")), true);
  assert.equal(existsSync(join(bundle.root, "truth")), false);
  assert.doesNotMatch(JSON.stringify(bundle), /truth|primary_category|ground_truth_severity/);
});

test("REQ-SBX-GENERAL-002 permission child cannot direct relative symlink or directory-enumerate truth", async () => {
  const result = await runPermissionDeniedProbe(bundle);
  assert.deepEqual(result.denied_attempts.sort(), ["directory", "direct", "relative", "symlink"]);
});

test("REQ-SBX-GENERAL-002 capture child rejects inherited descriptor and truth arguments", async () => {
  await assert.rejects(() => launchSandboxSecurityCaptureChild({ bundle, inherited_fd: 3 } as never));
  await assert.rejects(() => launchSandboxSecurityCaptureChild({ bundle, truth_path: truthPath } as never));
});

test("REQ-SBX-GENERAL-002 parent launches only the fixed capture-live entrypoint", () => {
  const command = buildSandboxSecurityCaptureChildCommand(bundle);
  assert.match(command.entrypoint, /scripts\/benchmark\/sandbox-security\/capture-live\.ts$/);
  assert.doesNotMatch(command.args.join(" "), /truth|evaluate|metrics|OPENAI_API_KEY/);
});
~~~

Run the real Node permission-model child with --permission and explicit
--allow-fs-read entries for the bundle/code allowlist and --allow-fs-write only
for a temporary capture directory. Test direct, relative, symlink, dynamic
import, and directory listing attempts; prove no child-process/worker
permission is granted.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-isolation.spec.ts
~~~

Expected: before bundle preparation exists, a bundle-content or permission-denial
assertion fails. An unsupported Node permission flag is an environment failure,
not valid RED; verify Node version before proceeding.

- [ ] **Step 3: Implement input-only bundle preparation**

~~~ts
export async function prepareSandboxSecurityCaptureBundle(input: Readonly<{
  corpus_root: string;
  output_root: string;
}>): Promise<Readonly<SandboxSecurityCaptureBundle>>;

export function buildSandboxSecurityCaptureChildCommand(
  bundle: Readonly<SandboxSecurityCaptureBundle>
): Readonly<SandboxSecurityCaptureChildCommand>;

export async function launchSandboxSecurityCaptureChild(input: Readonly<{
  bundle: Readonly<SandboxSecurityCaptureBundle>;
}>): Promise<Readonly<SandboxSecurityCaptureChildResult>>;

export async function main(): Promise<void>;
~~~

Validate the committed corpus first. Copy only input envelopes and a fixed
code allowlist needed by capture-live/prod/shared runtime. Emit content hashes
and ordered input list without labels. Build exact permission command arguments;
reject inherited descriptors, arbitrary paths, source lock/truth/evaluator/
metrics requests, symlink escapes, and output path outside the provided root.
The CLI is the only child_process owner: it launches the fixed capture-live.ts
path with --permission, no child/worker permission, stdio limited to ignored
stdin plus captured stdout/stderr, and the exact canonical read/write allowlist.
P5 tests use a temporary inert child at the same relative entrypoint shape;
the real child becomes available in P6-T2 without modifying this launcher.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-isolation.spec.ts
~~~

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-corpus.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect the actual permission argument construction, path canonicalization,
symlink handling, child descriptor checks, input-only materialization,
code allowlist, and static/runtime inability to reach truth/evaluator/provider
credentials.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a direct/relative/symlink/dynamic/directory bypass reproduction before the
smallest path/permission correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence and an independent read-capability
audit.

- [ ] **Step 9: Synchronize task evidence**

Append P5-T4 bundle hashes, permission test result, review conclusion, and
commit to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/prepare-capture-bundle.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  docs/progress.md
git commit -m "feat(benchmark): isolate sandbox security capture inputs"
~~~

Stop after the commit and report the evidence.

## Phase Exit Gate

- [ ] P5-T1 through P5-T4 are VERIFIED with APPROVED individual re-reviews.
- [ ] The source lock/attribution are independently checked at record level.
- [ ] Corpus validation proves the exact 300/180/120/9x20/3x100/150/150/54/
  high-critical matrix, provenance, immutability, and no development/Track 1
  overlap.
- [ ] Capture bundle tests prove runtime truth unreadability, not merely static
  import absence.
- [ ] Run and record:

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-source-admission.spec.ts \
  tests/benchmark/sandbox-security-corpus.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
git diff --summary
git status --short
~~~

- [ ] Dispatch a Phase-level reviewer independent from source curation. It must
  inspect every source lock entry, sample matrix/provenance/hash, isolation
  implementation, actual child permissions, production anti-oracle gate, and
  all tests. Fix accepted findings via RED/green/re-review before Phase 5 is
  marked VERIFIED.
- [ ] Commit the truthful Phase 5 evidence-only update and stop before Phase 6.

## Phase Report Format

~~~text
Phase: 5
Tasks: P5-T1 VERIFIED; P5-T2 VERIFIED; P5-T3 VERIFIED; P5-T4 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
Source review: <record-level IDs, hashes, license conclusion>
Corpus: <aggregate matrix/tree hashes only>
Isolation: <permission-denial results>
Review: <findings, fixes, re-review>
Next gate: Phase 6 entry gate
~~~
