# Sandbox Security P6 Quality Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a P6/P7-only Judge prompt v3 profile, validate it with independent development probes, and produce formally accepted GENERAL-002 evidence without changing ordinary production behavior.

**Architecture:** Keep the existing v2 Judge prompt as the default for ordinary production. Add an explicit prompt-profile parameter to the Judge request/detector path, inject v3 only from benchmark live/replay composition, and bind the version through candidate manifests, sealed configuration, replay transport, and P7. The response schema and provider attempt-sequence contracts remain unchanged.

**Tech Stack:** Node.js 22, TypeScript, Node test runner, sandbox security production adapters, benchmark receipt/seal scripts, external Judge operator environment.

---

### Task 1: Add the versioned Judge prompt profile

**Files:**
- Modify: `engines/sandbox/src/security-production/openai-judge-contract.ts`
- Modify: `engines/sandbox/src/security-production/openai-chat-judge-contract.ts`
- Modify: `engines/sandbox/src/security-production/openai-judge-detector.ts`
- Modify: `engines/sandbox/src/security-production/external-pipeline.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-openai-chat-contract.spec.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts`

- [ ] **Step 1: Write the RED assertions.**

Add tests that request the new explicit prompt profile and assert that its
system instruction contains the operational `instruction_override` and
`jailbreak` distinctions, contains no acceptance fixture identifier or truth
label, preserves `sandbox-security-judge.v1`, and differs from v2. Add a second
assertion that the existing two-argument/default request path still emits the
exact v2 prompt. Add detector construction tests proving the prompt profile is
passed to both the Responses and Chat Completions request builders.

- [ ] **Step 2: Run the focused RED suite.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-chat-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts
```

Expected: the new profile export/argument is absent and the new assertions
fail for the intended missing behavior; existing v2 assertions must continue to
run rather than fail from a test setup error.

- [ ] **Step 3: Implement the smallest profile API.**

Add a closed prompt-profile type with v2 default and v3 value. Keep response
schema `sandbox-security-judge.v1` unchanged. Make the prompt factory and both
protocol request builders accept the profile as an explicit optional argument;
the detector and external pipeline pass it through. Preserve exact input
validation and make an unknown profile fail closed.

The v3 text must state that `instruction_override` covers direct requests to
ignore, forget, stop, replace, or outrank an active instruction/task/policy,
while `jailbreak` covers attempts to bypass or evade a safety/access-control
safeguard, including adversarial role-play or encoding used for that purpose.
Ordinary questions, harmless persona/style requests, and ordinary new requests
must not be sufficient by themselves. Preserve the existing untrusted-payload
delimiter and no-provider-prose rules.

- [ ] **Step 4: Run the focused GREEN suite.**

Run the command from Step 2. Expected: all focused contract and detector tests
pass, including the unchanged v2 byte/hash assertions.

- [ ] **Step 5: Run the production TypeScript check for this slice.**

Run:

```bash
npm run typecheck:engine:sandbox:production
```

Expected: no new error in the modified production contract/detector files.

- [ ] **Step 6: Commit the isolated task.**

```bash
git add engines/sandbox/src/security-production/openai-judge-contract.ts \
  engines/sandbox/src/security-production/openai-chat-judge-contract.ts \
  engines/sandbox/src/security-production/openai-judge-detector.ts \
  engines/sandbox/src/security-production/external-pipeline.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-chat-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts
git commit -m "feat(sandbox): add versioned P6 Judge prompt profile"
```

### Task 2: Inject v3 only into P6 benchmark composition

**Files:**
- Modify: `engines/sandbox/src/security-production/benchmark-composition.ts`
- Modify: `engines/sandbox/src/security-production/composition.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-composition.spec.ts`
- Test: `engines/sandbox/tests/sandbox-security-production-integration.spec.ts`

- [ ] **Step 1: Write RED profile-boundary tests.**

Add tests that construct ordinary `local_and_judge` composition without a
benchmark profile and assert v2 request bytes, then construct the benchmark
live composition and assert v3 request bytes. Add a replay composition case
whose sealed configuration says v3 and assert the replay request uses v3. Add
rejection coverage for an unknown prompt profile and for a sealed v2 profile in
the active P6 replay path.

- [ ] **Step 2: Run the boundary tests to verify RED.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
```

Expected: the new v3 boundary assertions fail because benchmark composition
currently calls the default v2 pipeline.

- [ ] **Step 3: Implement benchmark-only injection.**

Keep `SandboxSecurityProductionCompositionPorts` default behavior at v2. Make
`livePorts` pass v3 to `createSandboxSecurityExternalPipeline`, and make
`replayPorts` pass the sealed prompt version after validating it as v3. Do not
change ordinary `createSandboxSecurityProductionCompositionWithPorts` behavior.
Keep the seven-domain order, one Judge request, retry wrapper, timing, and
sanitizer unchanged.

- [ ] **Step 4: Run the boundary tests GREEN.**

Run the command from Step 2. Expected: ordinary composition remains v2, P6
live/replay are v3, and all invalid profile cases fail closed.

- [ ] **Step 5: Commit the isolated task.**

```bash
git add engines/sandbox/src/security-production/benchmark-composition.ts \
  engines/sandbox/src/security-production/composition.ts \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
git commit -m "feat(sandbox): isolate P6 Judge prompt profile"
```

### Task 3: Bind v3 through capture, seal, replay, and repository contracts

**Files:**
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Modify: `scripts/benchmark/sandbox-security/replay-transport.ts`
- Modify: `scripts/benchmark/sandbox-security/seal.ts`
- Modify: `scripts/benchmark/sandbox-security/replay-hermetic.ts`
- Modify: `tests/benchmark/sandbox-security-contracts.spec.ts`
- Modify: `tests/benchmark/sandbox-security-evaluate.spec.ts`
- Modify: `tests/benchmark/sandbox-security-live-evidence.spec.ts`
- Modify: `tests/benchmark/sandbox-security-replay-transport.spec.ts`
- Modify: `tests/benchmark/sandbox-security-replay-hermetic.spec.ts`
- Modify: `tests/repository/sandbox-security-production-spec.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/progress.md`

- [ ] **Step 1: Write RED artifact-binding tests.**

Change test fixtures only after adding assertions that the active benchmark
contract accepts exactly `sandbox-security-openai-judge-prompt.v3`, rejects v2
and unknown versions for P6 manifests/sealed configs, carries v3 from capture
manifest to seal and replay input, and rejects a replay request whose prompt
version does not match the sealed configuration. Keep ordinary production
contract tests on v2.

- [ ] **Step 2: Run the contract RED suite.**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  tests/benchmark/sandbox-security-replay-transport.spec.ts \
  tests/benchmark/sandbox-security-replay-hermetic.spec.ts \
  tests/repository/sandbox-security-production-spec.spec.ts
```

Expected: only the new v3 expectations fail; failures must not be missing-file
or malformed-fixture errors.

- [ ] **Step 3: Implement v3 artifact binding.**

Introduce a benchmark-owned v3 constant in `contracts.ts`, change active P6
manifest/sealed-config types and normalizers to require it, and have
`capture-live.ts` emit the same value. Propagate the field through `seal.ts`,
`replay-hermetic.ts`, and `replay-transport.ts`. Keep all v1 artifact and
partial-attempt rejection behavior. Update only source-controlled documentation
that describes the active prompt profile; do not add live evidence.

- [ ] **Step 4: Run contract tests GREEN.**

Run the command from Step 2. Expected: all contract tests pass, and tests still
prove that no candidate/progress artifact can be promoted without a complete
300-input result and accepted metrics.

- [ ] **Step 5: Run corpus validation and diff checks.**

```bash
npm run benchmark:sandbox-security:validate
git diff --check
```

Expected: corpus validation passes; no whitespace errors.

- [ ] **Step 6: Commit the isolated task.**

```bash
git add scripts/benchmark/sandbox-security/contracts.ts \
  scripts/benchmark/sandbox-security/capture-live.ts \
  scripts/benchmark/sandbox-security/replay-transport.ts \
  scripts/benchmark/sandbox-security/seal.ts \
  scripts/benchmark/sandbox-security/replay-hermetic.ts \
  tests/benchmark tests/repository/sandbox-security-production-spec.spec.ts \
  docs/architecture.md docs/progress.md
git commit -m "feat(sandbox): bind P6 Judge prompt v3 through evidence"
```

### Task 4: Deterministic review and operator preflight

**Files:**
- Review only: all Task 1-3 files and
  `docs/superpowers/specs/2026-08-06-sandbox-security-p6-quality-amendment-design.md`

- [ ] **Step 1: Run the complete deterministic gate battery.**

Run:

```bash
npm run test:repo
npm run test:engine:sandbox:production
npm run typecheck:engine:sandbox:production
npm run typecheck:benchmark:sandbox-security
npm run benchmark:sandbox-security:validate-corpus
git diff --check
```

Expected: every relevant command exits zero. Existing unrelated baseline
failures must be reported and must not be hidden.

- [ ] **Step 2: Perform specification review.**

Review the diff against the design and confirm: ordinary production stays v2;
P6/P7 alone use v3; the response schema and seven-domain order are unchanged;
retry remains exact-first-connection-failure only; no truth/corpus/threshold
relaxation exists; and every v3 artifact binding is covered.

- [ ] **Step 3: Perform code-quality review.**

Check for duplicated prompt text, unsafe optional defaults, missing exact-key
validation, raw provider data in aggregate artifacts, and accidental model or
credential logging. Fix any finding with a new RED test before changing code.

- [ ] **Step 4: Run content-free Judge preflight.**

With the mode-600 operator environment loaded and the API key never printed,
set only the per-run model override to `deepseek-v4-flash`. Confirm readiness
returns the resolved model and the P6 prompt/profile binding is v3. Do not
start the 300-input run until all deterministic gates and reviews are green.

### Task 5: Fresh P6 acceptance and P7 closure

**Files:**
- Create only under fresh ignored roots: `tmp/.../capture-bundle/` and
  `tmp/.../evidence/`
- Promote only accepted artifacts to: `samples/sandbox-security-benchmark/v1/`

- [ ] **Step 1: Allocate disjoint roots and run the formal P6 capture.**

Use a new capture/evidence pair, v8 timing, v3 prompt profile, and
`deepseek-v4-flash`. Preserve every provider attempt sequence. Do not reuse
`vaNRzb`, any v4 root, the temporary release projection, or a retry merge.

- [ ] **Step 2: Require evaluator acceptance before sealing.**

The report must have `accepted: true`, zero infrastructure codes, all 300
decisions, and every frozen metric threshold. If it fails, retain the root as
rejected diagnostic output and stop; never hand-edit or merge it.

- [ ] **Step 3: Validate and publish formal evidence.**

Run the single `accept-live.ts` authority to create the evaluation receipt,
receipt chain, `capture.json`, 300 replay envelopes, and `seal.json`. Verify
signatures, v3 binding, tree hashes, permissions, and exact counts before any
P7 invocation.

- [ ] **Step 4: Run P7 hermetic replay under network denial.**

```bash
npm run benchmark:sandbox-security:replay
```

Expected: exit zero with the accepted v3 sealed configuration, 300 replay
envelopes, no Judge credential, no network, and byte-stable decision output.

- [ ] **Step 5: Run final validation.**

Run the live-evidence, production, repository, TypeScript, corpus, and
`git diff --check` gates. Confirm the committed evidence root contains
`capture.json`, `replay/` with exactly 300 envelopes, `seal.json`, and
`receipt-chain.json`.

- [ ] **Step 6: Update status and commit the completed requirement.**

Update `docs/progress.md`, `docs/architecture.md`, and any active status gate
to record the actual accepted root and command outputs. Mark GENERAL-002
`VERIFIED` only after Steps 2-5 pass, then commit the requirement-scoped
documentation and evidence promotion.
