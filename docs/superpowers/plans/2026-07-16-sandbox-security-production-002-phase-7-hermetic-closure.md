# Phase 7: Hermetic Replay, Anti-Oracle, and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. Do not start this Phase until Phase 6
> has a real accepted live seal. Close every task's independent review and
> re-review before the next task.

**Goal:** Replay the complete Engine hermetically from content-free provider
outcomes, enforce qualification/input ordering and anti-oracle boundaries,
register permanent non-live validation scripts, update durable documentation,
and complete the final global review/regression gate.

**Architecture:** The replay transport consumes the fixed inventory/prewarm
qualification prefix, then anonymous ordered two-slot input units. The replay
runner runs under unshare --net with credentials unset and invokes the ordinary
production Engine path. Repository gates statically and dynamically reject
truth/oracle/capability leaks. Live qualification remains explicit and is never
added to test:all.

**Tech Stack:** Node.js permission model, Linux unshare --net, TypeScript ESM,
node:test, Node http/https capability inventory, SHA-256 trees, frontend build.

## Approved Amendment

The Operator Judge Protocol Adapter and Explicit Judge Protocol Selection
amendments are already frozen into any permitted P6 seal. P7 reads no Judge
environment variable and makes no network request. It must validate the sealed
protocol ID, endpoint policy, base URL, protocol-derived endpoint URL,
requested model, and resolved model; every successful replay Judge response
must retain the same resolved model. OpenAI-named operations below are
wire-format labels only.

P7 validates the sealed P6 execution-profile provenance but does not inherit
the live-only `p6_local_hardware_compatibility_v8` limits. Hermetic replay uses
the ordinary production composition with the inherited GENERAL-001 `5000ms`
normal work budget and `100/1000/4000ms` rule/local/Judge detector slots.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P7-T1 | replay-transport.ts and replay transport tests |
| P7-T2 | replay-hermetic.ts and hermetic replay tests |
| P7-T3 | package.json scripts and repository benchmark gate |
| P7-T4 | README.md, architecture/API docs, final status and global review tests |

P7 may validate earlier source but may not change production adapters, core
contracts, rule catalog, sanitizer, source lock, corpus, truth, capture, or
seal. Defects in those files return to their sole prior owner.

## Phase Entry Gate

- [ ] Confirm P6-T1 through P6-T4 are VERIFIED and P6-T4 has an APPROVED
  Phase re-review with real accepted capture/seal hashes.
- [ ] Read Spec sections Hermetic Sealed Replay, Anti-Oracle and Isolation
  Gates, Required Validation, Documentation Requirements, and Acceptance
  Criteria.
- [ ] Verify Linux, Node permission support, and unshare --net:

~~~bash
test "$(node -p 'process.platform')" = "linux"
node --help | rg -- --permission
command -v unshare
test -f samples/sandbox-security-benchmark/v1/seal.json
git status --short
~~~

- [ ] Run the accepted live artifact/corpus checks before P7-T1:

~~~bash
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
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
  T1[P7-T1 replay transport] --> T2[P7-T2 hermetic runner]
  T2 --> T3[P7-T3 permanent gates and scripts]
  T3 --> T4[P7-T4 docs and global review]
~~~

The order is strict: repository scripts cannot reference an unverified replay
runner, and final docs cannot claim hermetic closure before the global gate.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Every task requires intended RED, focused GREEN, static/type/integration/build
checks, git diff --check, independent review, accepted finding RED regression,
APPROVED re-review, truthful progress evidence, exact commit, and stop. No
live qualification command is added to ordinary CI.

### P7-T1: Qualification-Aware Replay Transport

**Goal / acceptance:** Implement a replay transport that consumes exactly one
inventory and one prewarm outcome before ready, then each anonymous ordered
two-slot input unit. It checks sealed digest/model/schema/version bindings,
matches provider operation to slot, waits for actual signal termination, and
fails on missing/extra/out-of-order outcomes.

**Files:**

- Create: scripts/benchmark/sandbox-security/replay-transport.ts
- Create: tests/benchmark/sandbox-security-replay-transport.spec.ts

**Dependencies / frozen inputs:** P4-T3, P5 contracts, and accepted P6 capture/
replay envelopes are verified. Replay transport uses no environment, network,
truth, fixture labels, category, severity, action, verdict, metric, or raw
input.

- [ ] **Step 1: Write failing replay state-machine tests**

~~~ts
test("REQ-SBX-GENERAL-002 replay transport consumes inventory then prewarm before input", async () => {
  const transport = createSandboxSecurityReplayTransport(validPrefixAndUnits());
  assert.equal((await transport.request(ollamaInventoryRequest(signal))).status, 200);
  assert.equal((await transport.request(ollamaPrewarmRequest(signal))).status, 200);
  for (let index = 0; index < 300; index += 1) {
    transport.beginInput();
    await consumeExpectedEvaluationSlots(transport, index, signal);
    transport.endInput();
  }
  transport.assertDrained();
});

test("REQ-SBX-GENERAL-002 replay transport matches only the active provider slot", async () => {
  const transport = readyReplayTransport(unitWithBothSlots());
  transport.beginInput();
  await assert.rejects(() => transport.request(openAiRequestBeforeLocal(signal)));
});

test("REQ-SBX-GENERAL-002 replay transport rejects an incomplete qualification prefix", async () => {
  const transport = createSandboxSecurityReplayTransport(prefixMissingPrewarm());
  await transport.request(ollamaInventoryRequest(signal));
  assert.throws(() => transport.beginInput());
});

test("REQ-SBX-GENERAL-002 signal termination waits for Engine signal and preserves reason", async () => {
  const controller = new AbortController();
  const pending = transport.request(timeoutOutcomeRequest(controller.signal));
  controller.abort("slot_timeout");
  await assert.rejects(pending, { name: "sandbox_security_slot_timeout" });
});
~~~

Cover qualification ordering, success/error outcomes, digest/version mismatch,
begin/end state, duplicate/wrong provider operation, not_called behavior,
missing/extra/out-of-order slots, 300-unit drain, malformed outcome, abort
reason, active signal identity, no immediate fabricated timeout, frozen
responses, and no fixture/truth metadata access.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-transport.spec.ts
~~~

Expected: guarded transport does not consume qualification or active slots, so
the ordered operation assertion fails.

- [ ] **Step 3: Implement ordered replay transport**

~~~ts
export function createSandboxSecurityReplayTransport(input: Readonly<{
  qualification: readonly SandboxSecurityCapturedProviderOutcome[];
  inputs: readonly SandboxSecurityReplayInputUnit[];
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}>): SandboxSecurityReplayTransport;
~~~

Validate each envelope before exposing it to a request. Start in
qualification_inventory; accept only the boundary-free Ollama inventory
request, then the boundary-free Ollama prewarm chat request, and enter ready
only after both successful outcomes validate against sealed_config. P4's replay
composition drives those two requests before returning an Engine. The factory
accepts only prevalidated content-free two-slot units with fixture_id removed;
P7-T2 owns envelope/hash/manifest validation and stripping. Reconstruct only the
ordinary provider response expected by P2/P3 parsers. For signal_termination,
attach to the supplied signal and wait for actual abort; verify the Engine
lease's termination reason matches the record, then reject through the same
semantic path. Never flatten two slots or consume a future unit.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-transport.spec.ts
~~~

- [ ] **Step 5: Run static and integration gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-transport.spec.ts \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Audit qualification prefix, slot state, sealed version/digest checks,
operation matching, signal identity/termination, replay response reconstruction,
and metadata/truth exclusion.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add an out-of-order, wrong operation, missing slot, digest mismatch, or signal
race test before correcting the replay state machine.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P7-T1 state transitions, termination behavior, review, and commit in
docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/replay-transport.ts \
  tests/benchmark/sandbox-security-replay-transport.spec.ts docs/progress.md
git commit -m "feat(benchmark): add ordered hermetic replay transport"
~~~

Stop after the commit and report the evidence.

### P7-T2: Network-Free Complete Engine Replay

**Goal / acceptance:** Orchestrate two isolated children inside one network
namespace: a truth-blind Engine replay child over all 300 inputs and a separate
truth-aware evaluator child with no production/provider graph. Verify every
decision projection and frozen metric matches live, with no network or
credential access.

**Files:**

- Create: scripts/benchmark/sandbox-security/replay-hermetic.ts
- Create: tests/benchmark/sandbox-security-replay-hermetic.spec.ts

**Dependencies / frozen inputs:** P7-T1 is verified; P6 accepted capture,
replay, seal, input, truth, and manifest hashes are immutable. No replay test
may use a live provider or truth-selected response.

- [ ] **Step 1: Write failing hermetic tests**

~~~ts
test("REQ-SBX-GENERAL-002 hermetic replay runs all 300 inputs through ordinary Engine", async () => {
  const result = await runSandboxSecurityHermeticReplay(fakeAcceptedPack());
  assert.equal(result.evaluated_inputs, 300);
  assert.equal(result.network_attempts, 0);
});

test("REQ-SBX-GENERAL-002 hermetic replay matches decisions and aggregate metrics", async () => {
  const result = await runSandboxSecurityHermeticReplay(fakeAcceptedPack());
  assert.equal(result.decision_projection_tree_sha256, acceptedProjectionHash);
  assert.deepEqual(result.metrics, acceptedMetrics);
});

test("REQ-SBX-GENERAL-002 unshare net replay has credentials unset", async () => {
  const result = await runUnderNetworkNamespace(fakeAcceptedPack());
  assert.equal(result.network_attempts, 0);
  assert.equal(result.openai_key_present, false);
});

test("REQ-SBX-GENERAL-002 replay strips fixture IDs before constructing transport", async () => {
  const units = validateAndStripReplayEnvelopes(manifest, replayEnvelopes);
  assert.doesNotMatch(JSON.stringify(units), /fixture_id/);
});

test("REQ-SBX-GENERAL-002 Engine and truth evaluator run in separate permission children", async () => {
  const commands = buildHermeticReplayChildCommands(acceptedPack);
  assert.doesNotMatch(commands.engine.args.join(" "), /truth/);
  assert.doesNotMatch(commands.evaluator.args.join(" "), /security-production|replay-transport/);
});
~~~

Cover sealed/hash mismatch, 299/301 input count, missing/extra/out-of-order
replay, raw-content leak scanner across decision/report/stdout/stderr/artifacts,
network attempt, unset env, permission denial, caller abort, all signal
termination records, and assertDrained after exactly 300 closed units.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts
~~~

Expected: guarded replay does not complete the ordinary Engine path, causing a
300-input or projection-hash assertion failure.

- [ ] **Step 3: Implement hermetic replay runner**

~~~ts
export async function runSandboxSecurityHermeticReplay(input: Readonly<{
  root: string;
}>): Promise<Readonly<SandboxSecurityHermeticReplayResult>>;

export async function main(): Promise<void>;
~~~

The parent unsets SANDBOX_SECURITY_JUDGE_API_KEY, SANDBOX_SECURITY_JUDGE_BASE_URL, SANDBOX_SECURITY_JUDGE_MODEL, SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST, and
SANDBOX_SECURITY_ENABLE_JUDGE, validates replay envelope hashes/order,
removes fixture_id, and creates anonymous two-slot units. It launches an Engine
child with read permission for code/input/replay but no truth/evaluator path.
That child runs the full Engine path, begin/end in finally, awaits actual signal
termination, emits only canonical content-free decision projections, scans its
stdout/stderr/artifacts, and calls assertDrained. The parent then launches the
P6 evaluator as a separate permission child with truth/projections but no
production/provider/replay-transport code. Compare evaluator metrics with the
accepted aggregate report. Neither child can access network in the enclosing
unshare namespace, and the production graph never sees fixture ID or truth.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts
env -u SANDBOX_SECURITY_JUDGE_PROTOCOL -u SANDBOX_SECURITY_JUDGE_API_KEY -u SANDBOX_SECURITY_JUDGE_BASE_URL -u SANDBOX_SECURITY_JUDGE_MODEL -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST \
  -u SANDBOX_SECURITY_ENABLE_JUDGE unshare --net \
  node --experimental-strip-types scripts/benchmark/sandbox-security/replay-hermetic.ts
~~~

Expected: test and real network-namespace replay complete with zero network
attempts and accepted projections/metrics.

- [ ] **Step 5: Run static, integration, and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-replay-transport.spec.ts \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
npm run test:engine:sandbox
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect env clearing, unshare invocation, child capability, complete Engine
composition, signal handling, projection/hash comparison, leak scanner, and
proof the replay cassette is not truth-selected.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a network, env, ordering, projection, signal, or raw-leak reproduction
before correcting the runner.

- [ ] **Step 8: Re-review**

Require APPROVED after the real unshare command and Step 5.

- [ ] **Step 9: Synchronize task evidence**

Record hermetic command output summary, zero-network result, projection/metric
hashes, review, and commit in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add scripts/benchmark/sandbox-security/replay-hermetic.ts \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts docs/progress.md
git commit -m "test(benchmark): close hermetic sandbox security replay"
~~~

Stop after the commit and report the evidence.

### P7-T3: Permanent Anti-Oracle Gates and Script Registration

**Goal / acceptance:** Register production/repository/corpus/replay scripts,
include them in test:all except live qualification, and add permanent static
and runtime gates for imports, strings, capabilities, package paths, exact
artifact layout, and anti-oracle behavior.

**Files:**

- Modify: package.json
- Create: tests/repository/sandbox-security-benchmark.spec.ts

**Dependencies / frozen inputs:** P7-T1 and P7-T2 are verified. Existing
GENERAL-001 tests and scripts remain unchanged except for additive production/
benchmark registrations explicitly listed here.

- [ ] **Step 1: Write failing repository/package gate**

~~~ts
test("REQ-SBX-GENERAL-002 package registers validation and hermetic replay but never live in test:all", () => {
  const packageJson = readPackage();
  assert.match(packageJson.scripts["test:engine:sandbox:production"], /sandbox-security-production-/);
  assert.match(packageJson.scripts["typecheck:benchmark:sandbox-security"], /scripts\/benchmark\/sandbox-security\/tsconfig\.json/);
  assert.match(packageJson.scripts["benchmark:sandbox-security:replay"], /unshare --net/);
  assert.match(packageJson.scripts["test:all"], /typecheck:benchmark:sandbox-security/);
  assert.doesNotMatch(packageJson.scripts["test:all"], /qualify:live/);
});

test("REQ-SBX-GENERAL-002 anti-oracle gate rejects production/benchmark capability leaks", () => {
  assertNoProductionBenchmarkImports();
  assertNoTruthSelectedReplay();
  assertOnlyDefaultTransportUsesNetwork();
  assertOnlyProductionConfigReadsEnvironment();
  assertExactPublicProductionExports();
});

test("REQ-SBX-GENERAL-002 permanent benchmark layout and source closure are present", () => {
  assertExactBenchmarkFiles();
  assertNoTrack1OrDevelopmentFixtureImport();
});
~~~

Cover direct/transitive imports, fixture/source IDs/truth field names in
production strings, evaluator production imports, replay metadata parameters,
network/env capability, sole deep import, public export allowlist, script
presence, live exclusion from test:all, package path ownership, and all
content-free artifact fields.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-benchmark.spec.ts
~~~

Expected: absent package entries or anti-oracle assertions fail by named
repository behavior, not by missing dependency.

- [ ] **Step 3: Preserve the production script and add benchmark gates**

Preserve the P4-registered test:engine:sandbox:production and P5-registered
typecheck:benchmark:sandbox-security scripts exactly. Add the remaining
Master-required benchmark/repository scripts:

~~~json
{
  "test:repo:sandbox-security-production": "node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/sandbox-security-production.spec.ts tests/repository/sandbox-security-benchmark.spec.ts",
  "benchmark:sandbox-security:validate": "node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts",
  "benchmark:sandbox-security:replay": "env -u SANDBOX_SECURITY_JUDGE_PROTOCOL -u SANDBOX_SECURITY_JUDGE_API_KEY -u SANDBOX_SECURITY_JUDGE_BASE_URL -u SANDBOX_SECURITY_JUDGE_MODEL -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST -u SANDBOX_SECURITY_ENABLE_JUDGE unshare --net node --experimental-strip-types scripts/benchmark/sandbox-security/replay-hermetic.ts",
  "benchmark:sandbox-security:qualify:live": "node --env-file=.env.sandbox-security.local --experimental-strip-types scripts/benchmark/sandbox-security/prepare-capture-bundle.ts"
}
~~~

Include production/repository validation, benchmark typecheck, corpus
validation, and hermetic replay in test:all. Keep credentialed capture absent
from test:all. Preserve all existing scripts and exact package/workspace
boundaries.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-benchmark.spec.ts
npm run test:repo:sandbox-security-production
npm run benchmark:sandbox-security:validate
npm run benchmark:sandbox-security:replay
~~~

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
npm run test:repo
npm run test:engine:sandbox
npm run test:all
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect package script expansion, live exclusion, exact test enumeration,
anti-oracle import/string graph, capability ownership, and no weakened
GENERAL-001 registration.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a missing-script, live-in-test-all, import-edge, string-or-capability
counterexample before editing package/gate files.

- [ ] **Step 8: Re-review**

Require APPROVED after test:all and hermetic replay results.

- [ ] **Step 9: Synchronize task evidence**

Record package script names, anti-oracle checks, full test result, review, and
commit in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add package.json tests/repository/sandbox-security-benchmark.spec.ts docs/progress.md
git commit -m "test(repo): register sandbox security benchmark gates"
~~~

Stop after the commit and report the evidence.

### P7-T4: Durable Documentation and Final Global Review

**Goal / acceptance:** Synchronize README, architecture/API contracts,
progress/sprint status, final acceptance evidence, known limitations, and
global review. The requirement is complete only after all Phase/task gates and
the final global re-review pass.

**Files:**

- Modify: README.md
- Modify: docs/architecture.md
- Modify: docs/api-contract.md
- Modify: docs/progress.md
- Modify: docs/sprint-current.md
- Modify: tests/repository/sandbox-security-benchmark.spec.ts

**Dependencies / frozen inputs:** P7-T1 through P7-T3 are verified. Documentation
must distinguish installed, configured, live-qualified, sealed, and hermetically
replayed states. Do not claim a live qualification if P6-T4 was blocked.

- [ ] **Step 1: Write failing final consistency tests**

~~~ts
test("REQ-SBX-GENERAL-002 final docs name the public factories and hermetic command", () => {
  for (const path of ["README.md", "docs/architecture.md", "docs/api-contract.md"]) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /createSandboxSecurityProductionEngine/);
    assert.match(text, /benchmark:sandbox-security:replay/);
  }
});

test("REQ-SBX-GENERAL-002 final docs separate live qualification from ordinary CI", () => {
  const text = readFileSync("docs/sprint-current.md", "utf8") + readFileSync("docs/progress.md", "utf8");
  assert.match(text, /live/i);
  assert.match(text, /test:all/);
  assert.match(text, /not.*test:all|never.*test:all/i);
});

test("REQ-SBX-GENERAL-002 final global evidence has no unresolved P0/P1 or raw leak", () => {
  assertNoUnresolvedBlockingReviewFindings();
  assertNoRawProviderOrTruthDataInDurableDocs();
});
~~~

Cover every public factory signature, no public transport/config promise,
production/core dependency direction, benchmark isolation, script commands,
actual status values, accepted metrics/hash references, unresolved review
findings, and documentation stale-name/phase checks.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-benchmark.spec.ts
~~~

Expected: the new consistency gate fails on absent documentation/evidence or
stale plan references. Do not insert a completion claim before all evidence is
available.

- [ ] **Step 3: Update durable documentation and global evidence**

Document the sibling production boundary, exact public factories, provider
configuration, sanitizer/Judge privacy boundary, source/corpus governance,
capture/replay isolation, live-vs-hermetic commands, and no automatic model or
dataset download. Update progress with each task/Phase evidence, accepted
review fixes, hashes/metrics, residual risk, and the pending final global
review. Keep the active sprint in its truthful Phase 7 implementation/review
state during Steps 3 through 7; do not write a completion status yet.

- [ ] **Step 4: Run focused GREEN and full exit commands**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-benchmark.spec.ts
npm run test:shared
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:repo
npm run test:repo:sandbox-security-production
npm run benchmark:sandbox-security:validate
npm run benchmark:sandbox-security:replay
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
npm run build --prefix frontend
git diff --check
git diff --summary
git status --short
~~~

- [ ] **Step 5: Independent Reviews: Global Spec and Code Quality/Security**

First dispatch a Specification Compliance Review against the Spec, Master, all
Phase plans, full diff, tests, command evidence, source/corpus/capture/replay
hashes, and public docs; fix and rerun accepted findings. Then dispatch a
separate Code Quality/Security Review against the corrected diff, export/
capability graph, resource/error paths, data integrity, compatibility, and
tests; fix and rerun accepted findings before Step 7.

- [ ] **Step 6: Fix accepted global findings with RED regression evidence**

For every accepted P0/P1 or blocking P2 issue, add a failing regression in the
owning test, correct only the owning file/task, rerun the full commands, and
obtain a new independent review. Do not hide a finding as a status change or
weaken a gate.

- [ ] **Step 7: Re-review**

Require the final report to state each original issue RESOLVED, no new issues,
and final conclusion APPROVED. A non-blocking comment may be recorded without
loosening acceptance.

- [ ] **Step 8: Synchronize final status**

First add a final-state assertion to
tests/repository/sandbox-security-benchmark.spec.ts that requires
COMPLETE_PENDING_REVIEW plus recorded APPROVED global review evidence. Run it
and confirm RED against the still-in-progress sprint status. Then update
docs/progress.md and docs/sprint-current.md with the actual final review,
tests/build/typecheck/diff status, clean/known dirty paths, residual risk, and
COMPLETE_PENDING_REVIEW. Rerun the focused repository test to GREEN. Do not
advance to another requirement.

- [ ] **Step 9: Re-run the final regression after approved re-review**

Repeat the complete Step 4 command block after all accepted fixes and the
APPROVED re-review. Record final counts, hashes, build result, diff check, and
exact worktree status in docs/progress.md.

- [ ] **Step 10: Commit only the owned final files**

~~~bash
git add README.md docs/architecture.md docs/api-contract.md \
  docs/progress.md docs/sprint-current.md \
  tests/repository/sandbox-security-benchmark.spec.ts
git commit -m "docs(sandbox): close production benchmark requirement"
~~~

Stop and provide the final implementation-complete report. Do not begin
GENERAL-003.

## Phase Exit Gate

- [ ] P7-T1 through P7-T4 are VERIFIED with APPROVED task and Phase reviews.
- [ ] All P0/P1 and blocking P2 findings are resolved; no accepted review issue
  is hidden in an untracked file or weakened assertion.
- [ ] All permanent repository/shared/sandbox/production/corpus/replay gates,
  type checks, frontend build, and git diff checks pass.
- [ ] test:all includes production/repository/corpus/hermetic checks but never
  credentialed live qualification.
- [ ] Run and record the Master Requirement Exit Gate exactly, including
  unshare --net replay and git status.
- [ ] Dispatch a final global reviewer and record APPROVED, then update durable
  status and stop before GENERAL-003.

## Phase Report Format

~~~text
Phase: 7
Tasks: P7-T1 VERIFIED; P7-T2 VERIFIED; P7-T3 VERIFIED; P7-T4 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
Replay: <zero-network/projection/metric/hash result>
Anti-oracle: <static and runtime capability result>
Docs: <README/architecture/API/progress/sprint result>
Final review: <findings, fixes, APPROVED re-review>
Git: <branch, HEAD, status>
Next: stop; GENERAL-003 is not started
~~~
