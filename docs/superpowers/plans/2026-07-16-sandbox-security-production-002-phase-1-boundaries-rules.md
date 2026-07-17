# Phase 1: Production Boundaries and Deterministic Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`.
> Execute one task at a time. A task is not complete until its independent
> review, fixes, re-review, evidence update, and exact commit are complete.

**Goal:** Establish the isolated production source boundary, then deliver a
versioned deterministic rule catalog and raw local detector without changing
the frozen GENERAL-001 security core.

**Architecture:** This phase creates only the sibling
`engines/sandbox/src/security-production/` tree. The repository gate proves
that the frozen core has no reverse dependency and production detectors cannot
read benchmark or Track 1 material. The catalog is closed readonly data; the
detector translates catalog matches into the existing `RawLocalDetector` port.

**Tech Stack:** Node.js `>=22.19.0`, TypeScript ESM, `node:test`,
repository TypeScript compiler, frozen GENERAL-001 security public index.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P1-T1 | production boundary marker and repository production gate |
| P1-T2 | `rule-catalog.ts` and its focused test |
| P1-T3 | `rule-detector.ts` and its focused test |
| P1-T4 | sandbox TypeScript inclusion, type probe, and narrow core-gate expectation |

No task may modify `engines/sandbox/src/security/*.ts`, shared security
contracts, profiles, reducer, state machine, or the public security index.
The only future deep import is reserved for P3-T1 and is forbidden in this
phase.

## Phase Entry Gate

- [ ] Confirm `docs/sprint-current.md` is
  `SPEC_APPROVED_PLAN_IN_PROGRESS` or a later explicitly approved execution
  state and the full GENERAL-002 plan set is user-approved.
- [ ] Read the approved Spec sections `Architecture`, `Production Rule
  Detector`, `Anti-Overfitting Boundary`, and `TDD and Review Strategy`.
- [ ] Verify all GENERAL-001 Phase 1..5 evidence remains historical and
  `git status --short` does not contain another agent's conflicting change.
- [ ] Run the frozen baseline before writing a failing test:

~~~bash
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] Record the branch, HEAD, dirty paths, command counts, and any unrelated
  failure before beginning P1-T1. A pre-existing unrelated failure must remain
  documented; it is not repaired in this Phase.

## Task DAG

~~~mermaid
flowchart LR
  T1[P1-T1 boundary gate] --> T2[P1-T2 catalog]
  T2 --> T3[P1-T3 rule detector]
  T3 --> T4[P1-T4 TypeScript integration]
~~~

The order is strict because P1-T1 establishes the import/capability guard that
the later modules must satisfy. P1-T4 is last because it expands the sandbox
compiler input only after the two source modules exist.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Every task below uses this non-negotiable closure after its focused GREEN
command. The task-specific steps name the exact focused test and owned files.

1. Run its listed static or contract command, the sandbox TypeScript check,
   `npm run build --prefix frontend`, and `git diff --check`.
2. Dispatch an implementer-independent reviewer with the approved Spec,
   Master, this Phase plan, actual diff, test source, and command evidence.
3. For each accepted P0/P1 or requirement-related P2 finding, add a narrowly
   failing regression test, verify its intended assertion failure, make the
   smallest root-cause correction in the task-owned files, and rerun all
   task commands.
4. Request re-review. Only an `APPROVED` re-review marks the task `VERIFIED`.
5. Update `docs/progress.md` with command results, review conclusion, fix
   evidence, remaining risk, exact commit, and the next gate; do not change
   the active requirement's completion status here.

### P1-T1: Production Boundary and Capability Repository Gate

**Goal / acceptance:** Create the production source root and a permanent
repository test that proves the source tree is a sibling of the frozen core,
the core has no reverse import, production source has no benchmark/Track 1
access, production source cannot deep-import core internals except the one
future sanitizer helper, and capability use is limited by module role.

**Files:**

- Create: `engines/sandbox/src/security-production/.gitkeep`
- Create: `tests/repository/sandbox-security-production.spec.ts`

**Frozen inputs:** the approved GENERAL-002 Spec, `engines/sandbox/src/security/index.ts`, and the frozen core file inventory in `tests/repository/sandbox-security-core.spec.ts`.

- [ ] **Step 1: Write the failing repository gate**

~~~ts
test("REQ-SBX-GENERAL-002 production boundary has an isolated source root", () => {
  assert.equal(existsSync(PRODUCTION_ROOT), true);
  assert.equal(existsSync(join(PRODUCTION_ROOT, ".gitkeep")), true);
});

test("REQ-SBX-GENERAL-002 frozen security core never imports production", () => {
  for (const source of coreSources()) assert.doesNotMatch(source, /security-production/);
});

test("REQ-SBX-GENERAL-002 production source has no benchmark or Track 1 oracle access", () => {
  for (const edge of resolvedProductionImportEdges()) {
    assert.doesNotMatch(edge.target, /samples\/sandbox-security-benchmark|scripts\/benchmark|tests\/|track1|campaign/iu);
  }
  for (const source of productionSources()) {
    assert.doesNotMatch(source.text, /fixture_id|verdict_class|ground_truth_severity|transformation_kind|seed_record_ref|expected_action/iu);
  }
});
~~~

The AST/text walker must resolve relative imports and inspect all production
source files, not only direct entrypoints. It must allow no deep core import
until P3-T1, then allow exactly `../security/sanitized-boundary.ts` with only
`deriveSandboxSecurityExternalTokenRegistry` in that one sanitizer module.
Content-free replay outcome/interface names and `benchmark-composition.ts` are
required and allowed. The gate forbids actual sample/script/test import paths,
oracle field names, fixture/source/record literals, and expected actions. It
rejects dynamic import, `process.getBuiltinModule`, `eval`, and `Function` in
every production module; network APIs are allowed only in `http-transport.ts`
and `process.env` only in `production-config.ts`.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts
~~~

Expected: an `AssertionError` that the production source root or `.gitkeep`
is absent. A missing-test import, syntax error, or an unrelated core test
failure is not valid RED evidence.

- [ ] **Step 3: Make the minimal structural implementation**

Create only the tracked root marker and complete the repository test's own
AST/path helpers. Do not create a detector, provider module, benchmark path,
or environment reader in this task. The gate must scan `security/` and
`security-production/` independently and report the offending file and import
edge in its assertion message.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts
~~~

Expected: all P1-T1 boundary assertions pass with an empty production source
tree other than `.gitkeep`.

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review specifically for bypasses through absolute paths, `file:` URLs,
symlinks, dynamic import spellings, transitive imports, aliases, and tests that
only scan a hand-picked file list. Confirm the empty-root RED was behavioral
and the gate does not alter GENERAL-001 behavior.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

For every accepted issue, add a failing malicious-import fixture or source
snippet to this task-owned repository test before correcting the scanner.

- [ ] **Step 8: Re-review**

Provide the reviewer the corrected diff and all Step 4/5 results. Require
`APPROVED` before status synchronization.

- [ ] **Step 9: Synchronize task evidence**

Append P1-T1 `VERIFIED` evidence to `docs/progress.md`; retain unrelated
dirty paths verbatim.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/.gitkeep \
  tests/repository/sandbox-security-production.spec.ts docs/progress.md
git commit -m "test(sandbox): gate production security boundary"
~~~

Stop after the commit and report the evidence.

### P1-T2: Closed, Frozen Rule Catalog

**Goal / acceptance:** Define a recursively frozen v1 data catalog with the
nine approved condition operators, exact-key descriptors, bounded expression
shape, stable category/reason mapping, fixed severity/confidence, and no
executable callbacks or benchmark knowledge.

**Files:**

- Create: `engines/sandbox/src/security-production/rule-catalog.ts`
- Create: `engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts`

**Dependencies / frozen inputs:** P1-T1 is `VERIFIED`; use risk category,
severity, stage, source-type, and detector types only through the final
security index or public shared types. The catalog version is a stable
non-secret string such as `sandbox-security-rule-catalog.v1` and must be
exported only to sibling production modules/tests, never from the public
production index.

- [ ] **Step 1: Write failing catalog behavior tests**

~~~ts
test("REQ-SBX-GENERAL-002 catalog accepts every closed v1 operator", () => {
  assert.deepEqual(ruleOperatorNames(), [
    "text_contains_token", "text_contains_phrase", "text_ordered_sequence",
    "json_key_present", "json_string_contains", "tool_name_equals",
    "target_scheme_equals", "argument_key_present", "cross_source_ordered_sequence"
  ]);
});

test("REQ-SBX-GENERAL-002 catalog is recursively frozen and has stable reason mapping", () => {
  assert.equal(Object.isFrozen(SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG), true);
  assert.throws(() => mutateNestedCondition(), TypeError);
  assert.equal(reasonCodeFor("prompt_injection"), "sandbox_security_prompt_injection");
});

test("REQ-SBX-GENERAL-002 catalog rejects executable, unbounded, and unknown descriptor fields", () => {
  for (const invalid of invalidDescriptors()) {
    assert.throws(() => validateSandboxSecurityProductionRuleCatalog([invalid]));
  }
});
~~~

Cover one through eight conditions, unsupported stage/source combinations,
duplicate rule IDs, invalid category/reason pairs, non-`0.60`/`0.80`/`1.00`
confidence, invalid subject strategy, inherited/accessor fields, sparse arrays,
and nested callback/regex values. Add a static inventory test that rejects
fixture IDs, source IDs, locators, truth words, expected actions, and replay
keys in the catalog source.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts
~~~

Expected: a guarded test-local inert catalog causes a named catalog-content
assertion to fail. Import absence alone is not valid RED.

- [ ] **Step 3: Implement the smallest closed catalog module**

~~~ts
export const SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION =
  "sandbox-security-rule-catalog.v1" as const;

export const SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG:
  readonly SandboxSecurityProductionRuleDescriptor[] =
  freezeCatalog(validateSandboxSecurityProductionRuleCatalog([...descriptorData]));

export function validateSandboxSecurityProductionRuleCatalog(
  value: unknown
): readonly SandboxSecurityProductionRuleDescriptor[];
~~~

Use data records only. The validator must reject getters, inherited fields,
unknown keys, unsafe strings, lengths outside the Spec bounds, dynamic
behavior, and any match expression outside the closed grammar. Do not import
filesystem, network, environment, benchmark, or Track 1 modules.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts
~~~

Expected: descriptor grammar, frozen graph, deterministic version, and
anti-oracle inventory tests pass.

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review each operator's exact-key validation, NFKC comparison declaration,
bounded arrays, immutable deep freeze, category-to-reason consistency, and
absence of hidden fixture knowledge. Check that no runtime callback, regex
source, or condition-specific unowned field can enter the catalog.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a minimal invalid descriptor or attempted nested mutation test for each
accepted problem, then make the narrow validation/freeze correction.

- [ ] **Step 8: Re-review**

Require `APPROVED` after rerunning Step 4/5. Do not carry a finding into P1-T3.

- [ ] **Step 9: Synchronize task evidence**

Record P1-T2 implementation, RED/green commands, review loop, version, and
commit in `docs/progress.md`.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/rule-catalog.ts \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add production security rule catalog"
~~~

Stop after the commit and report the evidence.

### P1-T3: Deterministic Rule Detector

**Goal / acceptance:** Implement the raw local detector that evaluates only
the frozen catalog, uses NFKC/case behavior declared by a rule for comparison,
does not mutate the snapshot, and returns normal GENERAL-001 raw candidates
without any clearance, provider, benchmark, or profile behavior.

**Files:**

- Create: `engines/sandbox/src/security-production/rule-detector.ts`
- Create: `engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts`

**Dependencies / frozen inputs:** P1-T1 and P1-T2 are `VERIFIED`; import
`RawLocalDetector`, snapshot, and candidate types from the security index.
Use only `SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG` from the sibling catalog.

- [ ] **Step 1: Write failing detector behavior tests**

~~~ts
test("REQ-SBX-GENERAL-002 rule detector emits exact deterministic candidates", async () => {
  const result = await createSandboxSecurityProductionRuleDetector().detect(
    snapshotWithPromptInjection(), new AbortController().signal
  );
  assert.deepEqual(result.clearances, []);
  assert.equal(result.candidates[0]?.confidence, 1);
  assert.equal(result.candidates[0]?.reason_code, "sandbox_security_prompt_injection");
});

test("REQ-SBX-GENERAL-002 rule detector uses comparison NFKC without mutating raw snapshot", async () => {
  const snapshot = frozenSnapshotWithCompatibilityCharacters();
  await detector.detect(snapshot, new AbortController().signal);
  assert.equal(snapshot.contents[0]!.value, originalRawValue);
});

test("REQ-SBX-GENERAL-002 rule detector returns no_match instead of clearance when rules are absent", async () => {
  assert.deepEqual(await detector.detect(benignSnapshot(), signal), { candidates: [], clearances: [] });
});
~~~

Cover all nine operators, case-insensitive and exact comparisons, content/tool
subject strategies, cross-source ordering, a maximum of eight subjects, no
private handle comparison/hash/branching, abort-before-work, invalid catalog
invariant throwing, and failure when an original-byte locator cannot be proven.
Assert normalized deterministic confidence `0.80` and routing-only `0.60`
where the catalog declares those modes.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts
~~~

Expected: a guarded inert detector returns no candidates, so the exact-match
assertion fails. A missing module or type import is not valid RED.

- [ ] **Step 3: Implement the minimal raw detector**

~~~ts
export function createSandboxSecurityProductionRuleDetector(): RawLocalDetector {
  return Object.freeze({
    async detect(snapshot, signal): Promise<SandboxSecurityRawDetectorResult> {
      // Abort first, evaluate only validated catalog records, and return frozen arrays.
    }
  });
}
~~~

Build an internal immutable comparison projection from allowed snapshot values.
Use handles only when constructing returned `subject_refs`; never expose raw
text, create clearances, catch invariant failures as `no_match`, or access
network/environment/filesystem.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts
~~~

Expected: all operator, subject, abort, no-match, and immutability assertions
pass.

- [ ] **Step 5: Run static, contract, and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts \
  engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts \
  engines/sandbox/tests/sandbox-security-detector-boundary.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review subject mapping against current snapshot handles, duplicate candidate
elimination, confidence provenance, all operator boundaries, no-match versus
invariant error semantics, NFKC-only comparison, and absence of any corpus or
provider access.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Write a focused mutation, malformed snapshot, locator, or cross-source test
before the minimal detector correction.

- [ ] **Step 8: Re-review**

Require `APPROVED` with Step 4/5 evidence before marking P1-T3 verified.

- [ ] **Step 9: Synchronize task evidence**

Update `docs/progress.md` with P1-T3's catalog version, command results,
review conclusion, fixes, and exact commit.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/rule-detector.ts \
  engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add deterministic production rule detector"
~~~

Stop after the commit and report the evidence.

### P1-T4: Sandbox TypeScript Inclusion and Production Type Probe

**Goal / acceptance:** Expand the sandbox compiler input to include the
sibling production tree, add a compile-only probe for the public detector
contract, and update only the existing core gate's exact `tsconfig` expectation
to recognize the sibling path without changing frozen runtime behavior.

**Files:**

- Modify: `engines/sandbox/tsconfig.json`
- Modify: `tests/repository/sandbox-security-core.spec.ts`
- Create: `engines/sandbox/tests/types/sandbox-security-production-typecheck-anchor.ts`

**Dependencies / frozen inputs:** P1-T1 through P1-T3 are `VERIFIED`. The core
gate change is limited to the expected `include` array; do not weaken any
security, export, or behavior assertion.

- [ ] **Step 1: Write the failing compile probe and narrow repository assertion**

~~~ts
import { createSandboxSecurityProductionRuleDetector } from "../../src/security-production/rule-detector.ts";
import type { RawLocalDetector } from "../../src/security/index.ts";

const detector: RawLocalDetector = createSandboxSecurityProductionRuleDetector();
void detector;
~~~

Add a repository assertion that parsed `tsconfig.include` contains exactly
one additional `"src/security-production/**/*.ts"` entry while preserving the
existing `src/security/**/*.ts` and all current test/type probe entries.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-core.spec.ts
~~~

Expected: the compile probe is outside the compiler program or the exact
`include` assertion fails because the sibling source pattern is absent. A
pre-existing unrelated TypeScript error is not valid RED.

- [ ] **Step 3: Implement the smallest compiler registration**

Add only `"src/security-production/**/*.ts"` to the `include` list and amend
the core test's expected list accordingly. Do not add an export, public index
entry, source root, new compiler option, path alias, or broad glob that absorbs
benchmark/scripts.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-core.spec.ts
~~~

Expected: the production detector probe typechecks and the core gate preserves
all original assertions with the one reviewed include addition.

- [ ] **Step 5: Run static and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-rule-catalog.spec.ts \
  engines/sandbox/tests/sandbox-security-production-rule-detector.spec.ts
npm run test:engine:sandbox
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Confirm the compiler glob includes every production TypeScript source and no
benchmark/script tree, the probe uses the final public core type only, and the
core gate edit does not relax its frozen export or capability checks.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a source-placement or type-incompatibility probe before correcting any
accepted finding; do not widen the glob to hide the defect.

- [ ] **Step 8: Re-review**

Require `APPROVED` after Step 4/5 regression evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P1-T4's exact compiler program change, command results, review loop,
and commit in `docs/progress.md`.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/tsconfig.json \
  tests/repository/sandbox-security-core.spec.ts \
  engines/sandbox/tests/types/sandbox-security-production-typecheck-anchor.ts \
  docs/progress.md
git commit -m "build(sandbox): typecheck production security modules"
~~~

Stop after the commit and report the evidence.

## Phase Exit Gate

- [ ] P1-T1 through P1-T4 are `VERIFIED`, individually committed, and have
  independent re-review conclusions of `APPROVED`.
- [ ] The production repository gate rejects reverse core imports, deep imports
  outside the sole future sanitizer exception, benchmark/Track 1 references,
  and forbidden capability use.
- [ ] Rule catalog and detector tests cover normal, error, bounds, missing
  fields, unknown keys, inherited/accessor input, abort, mutation, no-match,
  and raw-result boundary cases.
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

- [ ] Dispatch a Phase-level independent reviewer. It must inspect the full
  P1 diff, approved Spec, Master, task evidence, frozen-core compatibility,
  and capability gate. Fix accepted P0/P1 and requirement-related P2 findings
  with new RED tests, rerun the exit commands, and request a Phase re-review.
- [ ] Only after the Phase re-review is `APPROVED`, append `Phase 1:
  VERIFIED` evidence to `docs/progress.md`, commit the evidence-only update,
  and stop.

## Phase Report Format

~~~text
Phase: 1
Tasks: P1-T1 VERIFIED; P1-T2 VERIFIED; P1-T3 VERIFIED; P1-T4 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
RED/green: <commands and intended failures>
Static/integration/build: <commands and results>
Review: <first findings, fixes, re-review conclusion>
Frozen-core check: <result>
Dirty paths: <exact output>
Next gate: Phase 2 entry gate
~~~
