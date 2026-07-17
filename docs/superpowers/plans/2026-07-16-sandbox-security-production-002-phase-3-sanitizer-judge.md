# Phase 3: Deterministic Sanitizer and OpenAI Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. Finish each task review/re-review loop
> before moving to the next task.

**Goal:** Deliver a deterministic, fail-closed sanitizer and an exact OpenAI
Responses Judge adapter that can only evaluate current routed obligations over
core-validated sanitized payloads.

**Architecture:** The sanitizer is the sole production module allowed to
deep-import deriveSandboxSecurityExternalTokenRegistry. It performs bounded
NFKC/redaction/ordinalization and returns a fresh frozen payload. The Judge
contract is pure request/response parsing. The detector maps content-free,
schema-valid obligation results through the payload, never through raw snapshots
or benchmark metadata.

**Tech Stack:** TypeScript ESM, Node test runner, frozen GENERAL-001 sanitizer
and external-detector ports, P2 closed transport/config/outcome modules.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P3-T1 | deterministic-sanitizer.ts and sanitizer tests |
| P3-T2 | openai-judge-contract.ts and contract tests |
| P3-T3 | openai-judge-detector.ts and detector tests |
| P3-T4 | end-to-end external pipeline integration test |

The sanitizer has the sole allowed deep import:
security/sanitized-boundary.ts named export
deriveSandboxSecurityExternalTokenRegistry. No P3 module imports the registry
type, validator, bounds helper, canonical JSON helper, benchmark, Track 1,
files, network API, or process.env.

## Phase Entry Gate

- [ ] Confirm Phase 2 is VERIFIED with an APPROVED Phase re-review.
- [ ] Read Spec sections Deterministic Sanitizer, OpenAI Judge Adapter,
  Production API Surface, Failure Semantics, and Anti-Oracle and Isolation
  Gates.
- [ ] Re-run the predecessor gates before P3-T1:

~~~bash
npm run test:repo
npm run test:engine:sandbox
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] Confirm the production boundary gate permits no P3 deep import until
  this phase's sanitizer implementation is reviewed.

## Task DAG

~~~mermaid
flowchart LR
  T1[P3-T1 sanitizer] --> T3[P3-T3 Judge detector]
  T2[P3-T2 Judge contract] --> T3
  T3 --> T4[P3-T4 external pipeline]
~~~

P3-T1 and P3-T2 may be independently researched but are committed/reviewed
serially. P3-T4 begins only when the sanitizer and Judge detector are verified.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

Each task requires focused RED evidence, focused GREEN evidence, the listed
static/contract checks, sandbox TypeScript, npm run build --prefix frontend,
git diff --check, independent review, root-cause regression fixes, APPROVED
re-review, progress evidence, exact commit, and a stop. A test-only integration
task still proves a real product boundary and may not weaken tests or fake
provider outcomes.

### P3-T1: Deterministic Structured Sanitizer

**Goal / acceptance:** Convert a raw snapshot plus routed obligations into one
fresh recursively frozen payload that preserves only permitted structure/tokens,
NFKC-normalizes copied strings, redacts the fixed sensitive catalog, applies
safe-key ordinalization, rejects unsafe input/bounds leaks, and performs zero
I/O.

**Files:**

- Create: engines/sandbox/src/security-production/deterministic-sanitizer.ts
- Create: engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts

**Dependencies / frozen inputs:** P1/P2 are verified. Import raw detector and
sanitizer types through the final security index. The only non-index import is
the named derive helper from security/sanitized-boundary.ts.

- [ ] **Step 1: Write failing sanitizer tests**

~~~ts
test("REQ-SBX-GENERAL-002 sanitizer derives tokens and returns canonical frozen payload", async () => {
  const payload = await createSandboxSecurityDeterministicSanitizer().sanitize(
    credentialBearingSnapshot(), routedObligations(), signal
  );
  assert.equal(payload.schema_version, "sandbox-security-sanitized-judge.v1");
  assert.equal(Object.isFrozen(payload), true);
  assert.match(JSON.stringify(payload), /\[REDACTED_CREDENTIAL\]/);
  assert.doesNotMatch(JSON.stringify(payload), /sk_live_|Bearer secret/);
});

test("REQ-SBX-GENERAL-002 sanitizer ordinalizes unknown JSON keys in UTF-16 order", async () => {
  const payload = await sanitizer.sanitize(snapshotWithUnknownObjectKeys(), obligations, signal);
  assert.deepEqual(Object.keys(payload.sources[0]!.sanitized_value), ["field_0001", "field_0002"]);
});

test("REQ-SBX-GENERAL-002 sanitizer fails closed before returning partial values", async () => {
  await assert.rejects(() => sanitizer.sanitize(cyclicAccessorSnapshot(), obligations, signal));
});
~~~

Cover abort, zero obligations, invalid source/tool shapes, invalid UTF-16,
accessors, inherited fields, cycles, sparse arrays, depth/node/size local caps,
NFKC, every fixed placeholder, private key/authorization/password/JWT/hex/
base64/high-entropy thresholds, email/phone/IP/UUID/path/URL/userinfo/query
redaction, headers behavior, safe-key catalog, unknown-key collision, encoded
sensitive atoms, unsupported values, output overflow, and recursive freeze.
Prove no sensitive atom survives direct/NFKC/percent/base64/base64url scans.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts
~~~

Expected: a guarded inert sanitizer returns an unredacted/incorrect payload, so
a redaction or canonical-order assertion fails. A missing module alone is not
valid RED.

- [ ] **Step 3: Implement the minimal fail-closed sanitizer**

~~~ts
export const SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION =
  "sandbox-security-deterministic-sanitizer.v1" as const;

export function createSandboxSecurityDeterministicSanitizer(): SandboxSecuritySanitizer;
~~~

Construct only fresh records/arrays. Derive tokens through the permitted helper,
then order keys by UTF-16 code unit after safe-key recognition/ordinalization.
Use the exact placeholder and safe-key catalogs in the Spec. Throw safe named
errors before any partial return. Leave frozen-core exact 256 KiB/depth/node/
token validation to the existing Engine path; do not copy its helpers.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts \
  engines/sandbox/tests/sandbox-security-sanitized-boundary.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Audit the import list, construction order, atom lifetime, ordinal collision
handling, all redaction grammars/thresholds, inherited core boundary ownership,
abort behavior, error leakage, and proof that no I/O or raw-value persistence
exists.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a smallest secret, encoded value, dangerous key, malformed value, or
ordering counterexample before the corresponding correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence and a fresh static import scan.

- [ ] **Step 9: Synchronize task evidence**

Record P3-T1 version, deep-import exception, test counts, review, and commit in
docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/deterministic-sanitizer.ts \
  engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add deterministic Judge sanitizer"
~~~

Stop after the commit and report the evidence.

### P3-T2: Exact OpenAI Responses Contract

**Goal / acceptance:** Define the immutable developer instruction/version,
canonical strict JSON Schema request body, and parser for the only accepted
completed Responses envelope. The parser returns a content-free ordered
obligation projection and rejects all prose/refusal/error/unknown output forms.

**Files:**

- Create: engines/sandbox/src/security-production/openai-judge-contract.ts
- Create: engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts

**Dependencies / frozen inputs:** P2-T1 is verified. Use the exact
gpt-5.6-terra endpoint-independent request fields and strict Schema in the
approved Spec. This pure contract module neither calls the transport nor reads
environment.

- [ ] **Step 1: Write failing canonical request/parser tests**

~~~ts
test("REQ-SBX-GENERAL-002 Responses request has exact fixed bytes and no caller controls", () => {
  const body = createSandboxSecurityOpenAiJudgeRequest(validSanitizedPayload()).body;
  assert.deepEqual(body, expectedExactUtf8Bytes);
  assert.doesNotMatch(new TextDecoder().decode(body), /fixture_id|request_id|authorization/);
});

test("REQ-SBX-GENERAL-002 Responses parser accepts exactly one completed output_text message", () => {
  assert.deepEqual(parseSandboxSecurityOpenAiJudgeResponse(validCompletedBody(), validSanitizedPayload()), expectedProjection);
  for (const value of invalidResponses()) assert.throws(() => parseSandboxSecurityOpenAiJudgeResponse(value, validSanitizedPayload()));
});

test("REQ-SBX-GENERAL-002 Judge response parser rejects duplicate unknown and stale obligation IDs", () => {
  for (const value of invalidObligationBodies()) assert.throws(() => parseSandboxSecurityOpenAiJudgeResponse(value, validSanitizedPayload()));
});
~~~

Byte-check model, store false, reasoning low, max_output_tokens 4096, input
roles/order, delimiters, strict schema object/name, absent tools/metadata/
previous-response/cache/streaming fields, no trailing newline, 64 KiB body
limit, model/status/error/incomplete_details, reasoning summary/refusal/
multiple-message rejection, and every risk/clearance confidence/severity rule.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts
~~~

Expected: a guarded inert formatter emits an incomplete request, causing the
exact-byte or strict-schema assertion to fail.

- [ ] **Step 3: Implement pure OpenAI contract functions**

~~~ts
export const SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION =
  "sandbox-security-openai-judge-prompt.v1" as const;

export interface SandboxSecurityParsedOpenAIResponse {
  readonly model: "gpt-5.6-terra";
  readonly status: "completed";
  readonly obligation_results: readonly {
    readonly obligation_id: string;
    readonly outcome: "risk" | "clearance";
    readonly confidence: "uncertain" | "probable" | "confident";
    readonly severity: "low" | "medium" | "high" | "critical" | null;
  }[];
}

export function createSandboxSecurityOpenAiJudgeRequest(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<{ body: Uint8Array }>;

export function parseSandboxSecurityOpenAiJudgeResponse(
  body: Uint8Array,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityParsedOpenAIResponse>;
~~~

The parser returns only model, completed status, and current payload-bound
obligation IDs/results. It must preserve no provider ID, timestamp, usage,
reasoning, refusal, or JSON text. P3-T3 converts validated current obligation
IDs to one-based routed ordinals when producing a content-free capture outcome.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Compare the exact prompt, schema, JSON ordering, request exclusions, output
envelope grammar, byte cap, and no-prose return shape against the Spec.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a canonical-byte or malformed output fixture that detects the accepted
deviation before the narrow formatter/parser correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P3-T2 request/schema versions and review evidence to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/openai-judge-contract.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): define strict OpenAI Judge contract"
~~~

Stop after the commit and report the evidence.

### P3-T3: Obligation-Bound OpenAI Judge Detector

**Goal / acceptance:** Implement the SanitizedExternalDetector that submits only
the canonical sanitized payload through the closed transport, parses only the
fixed Judge contract, and maps each response to current payload obligations.
Omission is partial coverage; unknown, duplicate, stale, or cross-evaluation
IDs reject the entire response.

**Files:**

- Create: engines/sandbox/src/security-production/openai-judge-detector.ts
- Create: engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts

**Dependencies / frozen inputs:** P2-T1 through P2-T3 and P3-T2 are verified.
Use transport injection only in sibling construction/tests; public composition
will construct it internally later.

- [ ] **Step 1: Write failing detector behavior tests**

~~~ts
test("REQ-SBX-GENERAL-002 Judge detector maps risk and clearance through current obligations", async () => {
  const result = await createSandboxSecurityOpenAiJudgeDetector({ transport }).detect(payload, signal);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0]!.subject_refs, payload.routed_obligations[0]!.subject_refs);
});

test("REQ-SBX-GENERAL-002 Judge omission is partial coverage only", async () => {
  const result = await detector.detect(payloadWithTwoObligations(), signal);
  assert.deepEqual(result.candidates.map(candidate => candidate.obligation_id), [firstObligationId]);
  assert.equal(result.clearances.length, 0);
});

test("REQ-SBX-GENERAL-002 Judge detector rejects output not bound to current payload", async () => {
  await assert.rejects(() => detector.detect(payload, signalWithStaleResponse()));
});
~~~

Cover request byte/body cap, exact operation, transport HTTP/nonresponse/
termination error mapping, abort, risk severity requirement, clearance null
severity, confidence map, duplicate/unknown/cross-evaluation IDs, subject and
category copied from routed obligations, no invented reason/category/subject,
and no raw snapshot/provider prose returned.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts
~~~

Expected: a guarded inert detector returns no binding evidence, so an
obligation-subject mapping assertion fails.

- [ ] **Step 3: Implement the minimal external detector**

~~~ts
export function createSandboxSecurityOpenAiJudgeDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
}>): SanitizedExternalDetector;
~~~

Build request bytes from P3-T2, call only the closed openai/responses operation
under the exact supplied signal, parse the content-free response, and bind each
ordinal to the supplied payload. Return a fresh frozen external detector result.
Do not catch invalid/transport failures as no_match and do not retain payload
beyond the promise settlement.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts \
  engines/sandbox/tests/sandbox-security-sanitized-boundary.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Trace payload-to-wire isolation, signal ownership, required/omitted obligation
semantics, category/scope copying, confidence/severity mapping, error behavior,
and any raw or provider-prose retention.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a malformed or cross-evaluation response test before making the minimal
binding/parser correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P3-T3 transport and obligation-boundary evidence in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/openai-judge-detector.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add obligation-bound OpenAI Judge detector"
~~~

Stop after the commit and report the evidence.

### P3-T4: External Pipeline Engine Integration

**Goal / acceptance:** Add a small sibling-only external-pipeline assembly seam
that pairs the deterministic sanitizer with the obligation-bound Judge, then
prove through the actual GENERAL-001 Engine path that routed obligations and
zero-call sanitizer failure semantics remain intact. The seam is never exported
from the public production index.

**Files:**

- Create: engines/sandbox/src/security-production/external-pipeline.ts
- Create: engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts

**Dependencies / frozen inputs:** P3-T1 through P3-T3 are verified. Reuse only
the final security index public factories to assemble registry and Engine; do
not deep-import engine internals or modify frozen core source. This focused
split keeps sanitizer/Judge pairing independently testable before Phase 4.

- [ ] **Step 1: Write the failing end-to-end behavior tests**

~~~ts
test("REQ-SBX-GENERAL-002 external pipeline pairs sanitizer and Judge through Engine", async () => {
  const pipeline = createSandboxSecurityExternalPipeline({ transport });
  const { engine } = createEngineWithProductionExternalPipeline({ pipeline });
  const decision = await engine.evaluate(requestThatRoutesJudge());
  assert.equal(decision.detector_runs.some(run => run.detector_id.includes("/judge/")), true);
});

test("REQ-SBX-GENERAL-002 sanitizer failure makes zero Judge calls through Engine", async () => {
  const pipeline = createSandboxSecurityExternalPipeline({ transport: recordingJudgeTransport });
  const { engine, judge } = createEngineWithProductionExternalPipeline({
    pipeline,
    raw_detectors: detectorsThatRouteJudge()
  });
  const request = engineValidRequestWithSanitizerInvalidUrl();
  assert.doesNotThrow(() => normalizeSandboxSecurityRequestForTest(request));
  const decision = await engine.evaluate(request);
  assert.equal(judge.calls, 0);
  assert.equal(decision.detector_runs.find(run => run.detector_id.includes("/judge/"))?.status, "failed");
});

test("REQ-SBX-GENERAL-002 valid sanitizer and Judge preserve obligation-bound findings", async () => {
  const { engine } = createEngineWithProductionExternalPipeline();
  const decision = await engine.evaluate(requestThatRoutesJudge());
  assert.equal(decision.verdict, "risk_detected");
  assert.doesNotMatch(JSON.stringify(decision), /raw-secret|provider-prose/);
});

test("REQ-SBX-GENERAL-002 Judge does not run after a qualifying short circuit", async () => {
  const { engine, judge } = createEngineWithProductionExternalPipeline({ rule: criticalRuleDetector() });
  await engine.evaluate(requestThatRoutesJudge());
  assert.equal(judge.calls, 0);
});
~~~

Write the initial assertions against actual production modules and prove the
failure occurs in the required path, not from an import/env fixture error. Cover
abort, local/Judge timeout, malformed sanitizer output rejected by frozen core,
partial Judge coverage, detector failure records, and Track 1 adapter behavior.
The zero-call case must use the real P3-T1 sanitizer with an unsafe URL fixture
that first passes the normal Engine request/input boundary, plus only raw
detector routing doubles and a real Judge transport spy. A synthetic throwing
sanitizer is not accepted evidence.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts
~~~

Expected: the guarded test-local inert pipeline fails the sanitizer/Judge
pairing assertion. A raw missing-module/import error is invalid RED.

- [ ] **Step 3: Implement the internal pipeline and public-Engine fixture**

~~~ts
export function createSandboxSecurityExternalPipeline(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
}>): Readonly<{
  sanitizer: SandboxSecuritySanitizer;
  judge: SanitizedExternalDetector;
}>;
~~~

Create the deterministic sanitizer and Judge detector from the same transport,
return a frozen pair, and retain no snapshot/provider state. The test-local
fixture must call createSandboxSecurityDetectorRegistry and
createSandboxSecurityEngine through the public index and expose only call
counters in test memory.

If this correct fixture exposes a P3 production defect, open a focused
regression under that owning task, correct it there, rerun its review loop, then
return here.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts
~~~

- [ ] **Step 5: Run integration and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-sanitizer.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts \
  engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts \
  engines/sandbox/tests/sandbox-security-engine.spec.ts \
  engines/sandbox/tests/sandbox-security-track1-adapter.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review fixture authenticity, Engine public-boundary use, zero-call proof,
failure/timeout/short-circuit assertions, raw-content leak checks, and
compatibility with existing Track 1 behavior.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a genuine Engine-path counterexample before any test-fixture or P3-owner
correction. Never mutate frozen core to make the integration test pass.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4/5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P3-T4 integration evidence and any returned-owner review loop to
docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/external-pipeline.ts \
  engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): assemble production external pipeline"
~~~

Stop after the commit and report the evidence.

## Phase Exit Gate

- [ ] P3-T1 through P3-T4 are VERIFIED and independently re-reviewed.
- [ ] The sole sanitizer deep import is exact; no raw source leaves the
  sanitizer/Judge boundary; sanitizer errors create zero Judge calls.
- [ ] Sanitizer, contract, detector, and Engine integration tests cover normal,
  error, bounds, null/missing, inherited/accessor, abort, state transitions,
  raw-sentinel and Track 1 compatibility scenarios.
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

- [ ] Dispatch a Phase-level reviewer who independently reads the Spec and
  validates redaction construction, the sole deep import, fixed Judge bytes,
  obligation binding, Engine integration, and P1/P2 compatibility. Fix accepted
  findings with new RED tests, rerun exit commands, and obtain an APPROVED
  Phase re-review.
- [ ] Record Phase 3 VERIFIED evidence in docs/progress.md, commit the
  evidence-only update, and stop before Phase 4.

## Phase Report Format

~~~text
Phase: 3
Tasks: P3-T1 VERIFIED; P3-T2 VERIFIED; P3-T3 VERIFIED; P3-T4 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
Sanitizer: <redaction/deep-import/no-I-O evidence>
Judge: <byte/schema/obligation evidence>
Integration: <zero-call/timeout/Track1 evidence>
Review: <findings, fixes, re-review>
Next gate: Phase 4 entry gate
~~~
