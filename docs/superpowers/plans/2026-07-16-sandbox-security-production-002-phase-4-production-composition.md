# Phase 4: Production Composition and Benchmark Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. Complete review/fix/re-review for each
> task before starting the next one.

**Goal:** Compose the verified rule/local/Judge adapters through the frozen
GENERAL-001 registry and Engine, expose only the approved public factories, and
create benchmark-only live/replay composition seams that remain absent from the
public production index.

**Architecture:** Composition selects rule_only, local, or local_and_judge,
reads configuration internally, qualifies/prewarms local mode before returning
an Engine, then delegates registry/Engine construction to the final security
public index. Benchmark composition supplies two non-index factories with
runner-owned capture/replay ports. Neither public factory accepts a transport,
endpoint, model, prompt, environment object, credential, or benchmark metadata.

**Tech Stack:** TypeScript ESM, node:test, frozen registry/Engine public
factories, P1 rule detector, P2 transport/config/Ollama, P3 sanitizer/Judge.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P4-T1 | composition.ts and mode-composition tests |
| P4-T2 | production index.ts and export-surface tests |
| P4-T3 | benchmark-composition.ts and seam tests |
| P4-T4 | full production Engine/Track 1 integration test and production test script |

No GENERAL-001 source file is changed. Production index.ts exports exactly the
three approved public factories and no type/helper/transport/config/benchmark
symbol. The benchmark module is imported only by its matching scripts and
repository tests after P5/P6/P7 create them.

## Phase Entry Gate

- [ ] Confirm Phase 3 is VERIFIED with an APPROVED Phase re-review.
- [ ] Read Spec sections Production API Surface, Production Configuration and
  Composition, Benchmark Layout, Live Capture Qualification, Hermetic Sealed
  Replay, and Anti-Oracle and Isolation Gates.
- [ ] Verify P1 boundary gate and P2/P3 focused tests are green before P4-T1:

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
  T1[P4-T1 production composition] --> T2[P4-T2 public index]
  T1 --> T3[P4-T3 benchmark seams]
  T2 --> T4[P4-T4 full integration]
  T3 --> T4
~~~

P4-T2 and P4-T3 touch distinct source files after P4-T1, but remain serialized
for review and commit discipline. P4-T4 runs only after all three source tasks
are verified.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Every task must show intended behavioral RED, focused GREEN, its listed
static/contract/integration tests, sandbox TypeScript, npm run build --prefix
frontend, git diff --check, independent review, root-cause RED regression
fixes, APPROVED re-review, progress status update, exact commit, and stop.

### P4-T1: Production Mode Composition

**Goal / acceptance:** Build selected adapters and delegate to
createSandboxSecurityDetectorRegistry and createSandboxSecurityEngine. Rule-only
does not read configuration. Local and local_and_judge validate configuration,
build sealed transport, qualify/prewarm before Engine creation, and surface
configuration/qualification errors before evaluation. The function does not
resolve profiles, reduce decisions, add fallback behavior, or catch evaluation
failures.

**Files:**

- Create: engines/sandbox/src/security-production/composition.ts
- Create: engines/sandbox/tests/sandbox-security-production-composition.spec.ts

**Dependencies / frozen inputs:** P1 through P3 are verified. Import only
createSandboxSecurityDetectorRegistry, createSandboxSecurityEngine, detector
ports, runtime ports, and Engine types through security/index.ts.

- [ ] **Step 1: Write failing mode and boundary tests**

~~~ts
test("REQ-SBX-GENERAL-002 rule_only composes only the production rule detector", async () => {
  const engine = await createSandboxSecurityProductionComposition({
    runtime, mode: "rule_only"
  });
  const decision = await engine.evaluate(benignRequest());
  assert.equal(decision.detector_runs.some(run => run.detector_id.includes("/local/")), false);
});

test("REQ-SBX-GENERAL-002 local composition qualifies before returning an Engine", async () => {
  await assert.rejects(() => createSandboxSecurityProductionComposition({
    runtime, mode: "local"
  }), { name: "sandbox_security_production_config_invalid" });
});

test("REQ-SBX-GENERAL-002 local qualification uses a separate fixed 1000 ms runtime timer", async () => {
  await createSandboxSecurityProductionCompositionWithPorts(
    { runtime, mode: "local" },
    deterministicLocalCompositionPorts()
  );
  assert.equal(runtime.scheduledDelays[0], 1000);
});

test("REQ-SBX-GENERAL-002 composition does not accept public transport or endpoint overrides", () => {
  assert.doesNotMatch(readFileSync(compositionPath, "utf8"), /endpoint|base_url|fetch|process\.env/);
});
~~~

Cover all modes, missing configs, disabled Judge, invalid mode, qualification
failure, prewarm failure, transport identity flow, registry slot selection,
no fallback detector, no profile resolution, no externally supplied env/
credential/endpoint/transport, and preservation of Engine error/abort behavior.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts
~~~

Expected: guarded composition lacks the requested selected detector/config
behavior, causing a mode or qualification assertion to fail.

- [ ] **Step 3: Implement internal composition only**

~~~ts
export type SandboxSecurityProductionMode = "rule_only" | "local" | "local_and_judge";

export interface SandboxSecurityProductionCompositionPorts {
  create_config(mode: SandboxSecurityProductionMode): Readonly<SandboxSecurityProductionConfig>;
  create_transport(config: Readonly<SandboxSecurityProductionConfig>): SandboxSecurityHttpTransport;
  create_local_detector(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    expected_digest: string;
    signal: AbortSignal;
  }>): Promise<RawLocalDetector>;
  create_external_pipeline(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
  }>): Readonly<{
    sanitizer: SandboxSecuritySanitizer;
    judge: SanitizedExternalDetector;
  }>;
}

export async function createSandboxSecurityProductionComposition(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  mode: SandboxSecurityProductionMode;
}>): Promise<SandboxSecurityEngine>;

export async function createSandboxSecurityProductionCompositionWithPorts(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>,
  ports: Readonly<SandboxSecurityProductionCompositionPorts>
): Promise<SandboxSecurityEngine>;
~~~

For rule_only create only the P1 detector. For local modes read P2 config,
create P2 transport, create a composition-owned AbortController scheduled for
exactly 1000 ms through runtime.scheduleTimeout, qualify/prewarm under that
signal before Engine construction, dispose the timer, consume the one-use proof
to create the local detector, and use P3's external-pipeline factory to add its
sanitizer/Judge pair only for local_and_judge. Construct
the registry and Engine with public core factories. The WithPorts factory is a
sibling direct-import seam used only by focused production tests and
benchmark-composition.ts; repository gates reject every other importer. It is
never exported by index.ts and accepts normalized internal factories only,
never an endpoint, credential, raw environment object, benchmark label, or
truth.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts
~~~

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-engine.spec.ts \
  engines/sandbox/tests/sandbox-security-track1-adapter.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Verify mode prerequisites, proof consumption, no config read in rule_only,
dependency direction, no profile/reducer duplication, no catch-to-fallback
path, and public-core factory usage.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a mode/config/proof/error-path counterexample before correcting only the
composition owner file.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P4-T1 mode and qualification evidence to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/composition.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): compose production security detectors"
~~~

Stop after the commit and report the evidence.

### P4-T2: Exact Public Production Index

**Goal / acceptance:** Add the only supported public production import surface.
It exports exactly createSandboxSecurityProductionRuleDetector,
createSandboxSecurityDeterministicSanitizer, and
createSandboxSecurityProductionEngine, with no public way to control transport,
environment, credential, endpoint, model, prompt, schema, or benchmark seams.

**Files:**

- Create: engines/sandbox/src/security-production/index.ts
- Create: engines/sandbox/tests/sandbox-security-production-index.spec.ts

**Dependencies / frozen inputs:** P4-T1 is verified. The index delegates to P1
rule factory, P3 sanitizer factory, and P4-T1 composition; it must not re-export
or import benchmark-composition.ts.

- [ ] **Step 1: Write failing public surface tests**

~~~ts
test("REQ-SBX-GENERAL-002 production index exports exactly three factories", async () => {
  const exported = await import("../src/security-production/index.ts");
  assert.deepEqual(Object.keys(exported).sort(), [
    "createSandboxSecurityDeterministicSanitizer",
    "createSandboxSecurityProductionEngine",
    "createSandboxSecurityProductionRuleDetector"
  ]);
});

test("REQ-SBX-GENERAL-002 public production Engine accepts only runtime and mode", () => {
  assert.match(readFileSync(indexPath, "utf8"), /runtime: SandboxSecurityRuntimePorts/);
  assert.doesNotMatch(readFileSync(indexPath, "utf8"), /transport|credential|endpoint|environment|benchmark/);
});
~~~

Add compile probes that valid factories satisfy the exact ports and rejected
arguments fail with ts-expect-error. Test no accidental core export, provider
contract, qualification proof, replay type, or benchmark factory leakage.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-index.spec.ts
~~~

Expected: the absent/guarded index has an incorrect export inventory, so the
three-factory assertion fails.

- [ ] **Step 3: Implement the exact index**

~~~ts
export { createSandboxSecurityProductionRuleDetector } from "./rule-detector.ts";
export { createSandboxSecurityDeterministicSanitizer } from "./deterministic-sanitizer.ts";

export async function createSandboxSecurityProductionEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  mode: "rule_only" | "local" | "local_and_judge";
}>): Promise<SandboxSecurityEngine> {
  return createSandboxSecurityProductionComposition(input);
}
~~~

Do not export any type or helper beyond the three named function values.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-index.spec.ts
~~~

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-index.spec.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Audit both runtime and TypeScript export sets, parameter visibility, index import
graph, benchmark absence, and whether any public option can redirect provider
traffic or reveal a secret.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a direct export inventory or invalid-argument type probe before correcting
the index.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P4-T2's exact export allowlist and review conclusion in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/index.ts \
  engines/sandbox/tests/sandbox-security-production-index.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): expose production security factories"
~~~

Stop after the commit and report the evidence.

### P4-T3: Benchmark-Only Live and Replay Composition Seams

**Goal / acceptance:** Implement the two non-index composition entrypoints and
their closed runner-owned interfaces. Live composition emits only content-free
capture outcomes. Replay composition accepts only a credential-free replay
transport and sealed configuration, consumes inventory then prewarm before
returning an Engine, and rejects mismatch before evaluation.

**Files:**

- Create: engines/sandbox/src/security-production/benchmark-composition.ts
- Create: engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts

**Dependencies / frozen inputs:** P2-T1, P2-T5, P3-T1, P3-T3, and P4-T1 are
verified. No script exists yet, so tests use in-memory conforming capture sink
and replay transport only.

- [ ] **Step 1: Write failing lifecycle/seam tests**

~~~ts
test("REQ-SBX-GENERAL-002 live composition records inventory prewarm then anonymous evaluation slots", async () => {
  const engine = await createSandboxSecurityLiveCaptureEngine({ runtime, capture_sink: sink });
  assert.deepEqual(sink.events.map(event => event.operation), ["model_inventory", "chat"]);
  sink.beginInput();
  await engine.evaluate(request());
  sink.endInput();
  sink.assertDrained();
});

test("REQ-SBX-GENERAL-002 replay composition consumes qualification prefix before Engine creation", async () => {
  const engine = await createSandboxSecurityHermeticReplayEngine({
    runtime, replay_transport, sealed_config
  });
  assert.equal(replay_transport.qualificationConsumed, true);
  void engine;
});

test("REQ-SBX-GENERAL-002 benchmark entries are unavailable from public production index", async () => {
  const publicExports = await import("../src/security-production/index.ts");
  assert.equal("createSandboxSecurityLiveCaptureEngine" in publicExports, false);
});
~~~

Cover sink phase order, one inventory and one prewarm only, content-free
records, explicit not_called slots at endInput, duplicate/wrong/outside record
rejection, replay prefix schema/digest/config validation, mode fixed to
local_and_judge, no environment/credential reads, and static import ownership.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
~~~

Expected: guarded seams cannot consume the required qualification prefix or
produce anonymous slot records, so a lifecycle assertion fails.

- [ ] **Step 3: Implement closed benchmark composition APIs**

~~~ts
export interface SandboxSecurityCaptureSink {
  beginInput(): void;
  record(outcome: Readonly<SandboxSecurityCapturedProviderOutcome>): void;
  endInput(): void;
  assertDrained(): void;
}

export interface SandboxSecurityReplayTransport extends SandboxSecurityHttpTransport {
  beginInput(): void;
  endInput(): void;
  assertDrained(): void;
}

export function createSandboxSecurityLiveCaptureEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  capture_sink: SandboxSecurityCaptureSink;
}>): Promise<SandboxSecurityEngine>;

export function createSandboxSecurityHermeticReplayEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  replay_transport: SandboxSecurityReplayTransport;
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}>): Promise<SandboxSecurityEngine>;
~~~

Live construction reads P2 configuration internally and wraps adapter outcomes
only after parsing. Replay construction accepts no env/credential and validates
all sealed model/prompt/schema/catalog/sanitizer version values before building
the same detector graph. It drives the replay transport's boundary-free
inventory and prewarm requests before returning the Engine, then permits input
boundaries. Neither function is exported by index.ts.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-index.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review benchmark-only importer restrictions, anonymous two-slot design,
qualification prefix, no provider request leakage, sealed-config comparisons,
public index exclusion, and readiness for later permission isolation.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a wrong phase, duplicate slot, mismatched sealed version, or accidental
public export test before the narrow correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P4-T3 seam ownership and lifecycle result to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/benchmark-composition.ts \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add benchmark composition seams"
~~~

Stop after the commit and report the evidence.

### P4-T4: Full Production Engine and Track 1 Regression

**Goal / acceptance:** Exercise each public mode and benchmark seam through
actual Engine evaluation, then prove all frozen Track 1 adapter behavior remains
unchanged. This is an integration test task; a discovered production defect is
returned to its sole owner with a new RED/review loop before P4-T4 closes.

**Files:**

- Create: engines/sandbox/tests/sandbox-security-production-integration.spec.ts
- Modify: package.json

**Dependencies / frozen inputs:** P4-T1 through P4-T3 are verified. Use public
production index for public-mode tests and direct benchmark-composition import
only for benchmark seam tests.

- [ ] **Step 1: Write failing full-path tests**

~~~ts
test("REQ-SBX-GENERAL-002 public rule_only Engine evaluates through frozen core", async () => {
  const engine = await createSandboxSecurityProductionEngine({ runtime, mode: "rule_only" });
  assert.equal((await engine.evaluate(ruleMatchRequest())).verdict, "risk_detected");
});

test("REQ-SBX-GENERAL-002 production modes retain Engine decision and detector-run contracts", async () => {
  for (const mode of ["rule_only", "local", "local_and_judge"] as const) {
    const result = await internalProductionEngineForMode(mode, deterministicCompositionPorts()).evaluate(request());
    assertSandboxSecurityDecisionContract(result);
  }
});

test("REQ-SBX-GENERAL-002 public index covers rule_only success and configured-mode failure without live providers", async () => {
  await createSandboxSecurityProductionEngine({ runtime, mode: "rule_only" });
  await assert.rejects(() => createSandboxSecurityProductionEngine({ runtime, mode: "local" }));
});

test("REQ-SBX-GENERAL-002 Track 1 adapter behavior remains byte compatible", async () => {
  await assertTrack1SecurityRegressionHarness();
});

test("REQ-SBX-GENERAL-002 production test suite is permanently registered", () => {
  assert.match(readPackage().scripts["test:engine:sandbox:production"], /sandbox-security-production-\*\.spec\.ts/);
});
~~~

Use createSandboxSecurityProductionCompositionWithPorts for deterministic
local/Judge success cases; no live provider. Use the public index only for
rule_only success, argument/type boundaries, and missing-config pre-evaluation
failure. Cover short circuit, routed
Judge, sanitizer failure, local/Judge timeout, caller abort, immutable decision,
no benchmark identity, and the complete Track 1 regression harness.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
~~~

Expected: the permanent production-test script assertion fails because the
script is not registered. Engine assertions must already exercise actual
composition; a missing-module/import failure or inert test double is invalid.

- [ ] **Step 3: Implement test-local construction helpers and script registration**

Build in-memory transport/config ports strictly in the spec file and route them
through sibling internal factories. Do not add a public override, inspect
benchmark truth, alter core profiles, or replace an Engine result. Return any
real source defect to P4-T1, P4-T2, or P4-T3 for its own regression/review loop.
Add only this package script in P4:

~~~json
{
  "test:engine:sandbox:production": "node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/sandbox-security-production-*.spec.ts"
}
~~~

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
npm run test:engine:sandbox:production
~~~

- [ ] **Step 5: Run integration and compatibility gates**

~~~bash
npm run test:engine:sandbox
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts \
  engines/sandbox/tests/sandbox-security-track1-adapter.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Confirm integrations exercise real composition, do not make live calls, preserve
Engine state/failure semantics, and validate Track 1 with its canonical harness.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add an actual end-to-end mode/abort/contract case before owner-file corrections.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P4-T4 integration and Track 1 command results in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/tests/sandbox-security-production-integration.spec.ts \
  package.json \
  docs/progress.md
git commit -m "test(sandbox): verify full production security Engine"
~~~

Stop after the commit and report the evidence.

## Phase Exit Gate

- [ ] P4-T1 through P4-T4 are VERIFIED, individually committed, and
  independently re-reviewed.
- [ ] Public index runtime/type inventory is exactly three factories; benchmark
  seam imports are direct-only and capability-gated.
- [ ] All modes preserve frozen GENERAL-001 contracts and Track 1 behavior.
- [ ] Run and record:

~~~bash
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
git diff --summary
git status --short
~~~

- [ ] Dispatch a Phase-level independent reviewer who inspects composition,
  public surface, seam lifecycle, error/abort paths, capability boundaries, and
  full Engine/Track 1 results. Fix accepted findings with RED regressions and
  obtain APPROVED Phase re-review before recording Phase 4 VERIFIED.
- [ ] Commit the Phase 4 evidence-only progress update and stop before Phase 5.

## Phase Report Format

~~~text
Phase: 4
Tasks: P4-T1 VERIFIED; P4-T2 VERIFIED; P4-T3 VERIFIED; P4-T4 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
Public API: <export inventory/type probes>
Composition: <modes/config/qualification results>
Benchmark seams: <capture/replay lifecycle results>
Regression: <Engine and Track 1 result>
Review: <findings, fixes, re-review>
Next gate: Phase 5 entry gate
~~~
