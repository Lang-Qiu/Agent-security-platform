# Phase 2: Transport, Configuration, and Ollama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans, plus
> superpowers:test-driven-development. Execute one task at a time and close its
> independent review loop before proceeding.

**Goal:** Add content-free provider outcome contracts, the only network-capable
default HTTP transport, private production configuration, the exact Ollama wire
contract, and a digest-qualified local detector.

**Architecture:** Provider parsing and replay records are content-free. The
transport accepts a closed operation union and owns URL/header/socket behavior.
Configuration is the sole environment reader and retains credentials privately.
The Ollama adapter is a raw detector but may only be constructed from a
transport-bound, one-use qualification proof.

**Tech Stack:** Node.js http/https, TypeScript ESM, node:test, SHA-256 digest
validation, frozen GENERAL-001 detector ports.

---

## Phase Ownership

| Task | Sole files owned in this Phase |
| --- | --- |
| P2-T1 | provider outcome/replay schema module and tests |
| P2-T2 | default HTTP transport and wire tests |
| P2-T3 | production config and config tests |
| P2-T4 | Ollama request/response contract and tests |
| P2-T5 | digest qualification/local adapter and tests |

P2 may import only the final security/index.ts, P1 production modules, and Node
builtins in http-transport.ts. No P2 file reads benchmark files or truth. Only
http-transport.ts may have network capability; only production-config.ts may
read process.env.

## Phase Entry Gate

- [ ] Confirm Phase 1 is VERIFIED, including its Phase re-review and committed
  evidence.
- [ ] Read Spec sections Ollama Local-Model Detector, HTTP Transport and
  Endpoint Security, Production Configuration and Composition, and Failure
  Semantics.
- [ ] Record whether Ollama and live credentials are installed/configured; do
  not pull a model or obscure their absence with a fake live result.
- [ ] Run before P2-T1:

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
  T1[P2-T1 provider outcomes] --> T2[P2-T2 transport]
  T2 --> T3[P2-T3 production config]
  T1 --> T4[P2-T4 Ollama contract]
  T2 --> T5[P2-T5 local adapter]
  T3 --> T5
  T4 --> T5
~~~

P2-T2 and P2-T4 may be researched in parallel but are committed and reviewed
serially. P2-T5 starts only after P2-T1 through P2-T4 are verified.

## Shared Task Closure Protocol

Every task Independent Reviews step contains two ordered implementer-independent passes: first a Specification Compliance Review followed by accepted-finding RED/fix/full rerun, then a Code Quality/Security Review followed by its accepted-finding RED/fix/full rerun. Step 8 re-reviews and closes both finding sets before VERIFIED.

For every task: run the named focused GREEN command; run its static/contract
command, sandbox TypeScript, npm run build --prefix frontend, and git diff
--check; dispatch an implementer-independent review; add RED regressions for
accepted P0/P1 and requirement-related P2 findings; rerun all commands; obtain
an APPROVED re-review; append exact evidence to docs/progress.md; commit only
listed paths; stop.

### P2-T1: Content-Free Provider Outcome Contracts

**Goal / acceptance:** Define exact-key, recursively frozen, bounded provider
outcomes for inventory, Ollama chat, and OpenAI responses. The data contains
only normalized schema values, HTTP status, content type, closed failure code,
verified digest, and signal termination reason. It never stores request bytes,
provider prose, IDs, usage, headers, secrets, fixture metadata, or truth.

**Files:**

- Create: engines/sandbox/src/security-production/provider-outcomes.ts
- Create: engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts

**Dependencies / frozen inputs:** P1 is verified. These sibling-only types must
remain stable for P2-T2, P2-T4, P3-T2, P4-T3, P6, and P7:
SandboxSecurityReplayTransportOutcome<T>,
SandboxSecurityReplayOllamaInventoryResponse,
SandboxSecurityReplayOllamaResponse, and
SandboxSecurityReplayOpenAIResponse.

- [ ] **Step 1: Write failing outcome tests**

~~~ts
test("REQ-SBX-GENERAL-002 replay outcome accepts only closed response/error branches", () => {
  assert.deepEqual(normalizeOutcome(validInventoryResponse), validInventoryResponse);
  assert.throws(() => normalizeOutcome({ status: "response", body: "raw" }));
});

test("REQ-SBX-GENERAL-002 replay outcome rejects unknown inherited and accessor keys", () => {
  for (const invalid of [unknownKeyOutcome(), inheritedOutcome(), accessorOutcome()]) {
    assert.throws(() => normalizeSandboxSecurityReplayOutcome(invalid));
  }
});

test("REQ-SBX-GENERAL-002 provider outcomes are recursively frozen and content free", () => {
  const outcome = normalizeSandboxSecurityReplayOutcome(validChatResponse);
  assert.equal(Object.isFrozen(outcome), true);
  assert.doesNotMatch(JSON.stringify(outcome), /authorization|prompt|fixture_id|truth|usage/i);
});
~~~

Cover not_called, HTTP 200 normalized response, non-200 status,
connection_failed, response_too_large, provider_response_invalid, and
signal_termination with only slot_timeout or work_budget. Test max arrays,
ordinal bounds, digest grammar, duplicate candidates/obligations, exact content
type, defensive copies, and deep freezing.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts
~~~

Expected: a guarded inert normalizer returns an incorrect permissive object, so
a closed-branch assertion fails rather than a module-load error.

- [ ] **Step 3: Implement exact outcome normalizers**

~~~ts
export type SandboxSecurityReplayTransportOutcome<TResponse> =
  | Readonly<{ status: "not_called" }>
  | Readonly<{ status: "response"; http_status: 200; content_type: "application/json"; normalized_response: TResponse }>
  | Readonly<{ status: "http_error"; http_status: number }>
  | Readonly<{ status: "transport_error"; error_code: "connection_failed" | "response_too_large" | "provider_response_invalid" }>
  | Readonly<{ status: "signal_termination"; termination_reason: "slot_timeout" | "work_budget" }>;

export function normalizeSandboxSecurityReplayOutcome<T>(
  value: unknown,
  normalizeResponse: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T>;
~~~

Use exact-key plain-record validation, no raw body field, no generic error text,
and a fresh recursively frozen return value.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Check each union branch, bounds, recursive freeze, raw-content exclusion,
ambiguous HTTP status behavior, and downstream compatibility with the Spec
envelope names.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a malformed content-free record or mutation test for each accepted issue
before correcting the validator.

- [ ] **Step 8: Re-review**

Require APPROVED with Step 4 and Step 5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P2-T1 result and stable type names to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/provider-outcomes.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): define content-free provider outcomes"
~~~

Stop after the commit and report the evidence.

### P2-T2: Closed Default HTTP Transport

**Goal / acceptance:** Implement the only production network capability. It
maps the closed provider-operation union to exact endpoints, forwards the
Engine signal, enforces body/content-type/redirect rules, tears down all
resources exactly once, and exposes only normalized response metadata/bytes.

**Files:**

- Create: engines/sandbox/src/security-production/http-transport.ts
- Create: engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts

**Dependencies / frozen inputs:** P2-T1 is verified. The transport input uses
the Spec closed SandboxSecurityHttpRequest and SandboxSecurityHttpResponse
shapes. Tests inject a private request factory that observes constructed
URL/options; production composition never accepts this port, endpoint, model,
or credential override.

- [ ] **Step 1: Write failing transport wire and lifecycle tests**

~~~ts
test("REQ-SBX-GENERAL-002 transport maps only exact provider operations to fixed endpoints", async () => {
  await transport.request(ollamaInventoryRequest(signal));
  assert.deepEqual(recordedRequests[0], {
    method: "GET", origin: "http://127.0.0.1:11434", path: "/api/tags", authorization: undefined
  });
});

test("REQ-SBX-GENERAL-002 transport refuses redirect wrong content type and oversized body", async () => {
  await assert.rejects(() => transport.request(ollamaChatRequest(signal)), { name: "sandbox_security_transport_invalid" });
  assert.equal(fakeSocket.destroyed, true);
});

test("REQ-SBX-GENERAL-002 transport destroys request response socket and listeners on abort", async () => {
  const pending = transport.request(openAiRequest(controller.signal));
  controller.abort();
  await assert.rejects(pending, { name: "sandbox_security_transport_aborted" });
  assert.equal(listenerCount(), 0);
});
~~~

Cover exact Ollama inventory GET, Ollama chat compound inventory-revalidate then
POST, exact OpenAI HTTPS POST, no URL userinfo/fragment/query override,
content-type normalization, 64 KiB incremental cap, connection/stream error,
simultaneous abort/error/close, status visibility, no redirect following, no
provider-body/error leakage, and verified_ollama_digest only on successful chat.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts
~~~

Expected: a guarded inert request factory never creates the mandatory fixed
inventory/endpoint record, causing the wire assertion to fail.

- [ ] **Step 3: Implement the closed transport**

~~~ts
export interface SandboxSecurityHttpTransport {
  request(input: Readonly<SandboxSecurityHttpRequest>): Promise<Readonly<SandboxSecurityHttpResponse>>;
}

export function createSandboxSecurityDefaultHttpTransport(input: Readonly<{
  expected_ollama_digest: string | null;
  openai_api_key: string | null;
  request_factory?: SandboxSecurityPrivateRequestFactory;
}>): SandboxSecurityHttpTransport;
~~~

Use Node http/https request APIs, not fetch. Map only ollama/model_inventory,
ollama/chat, and openai/responses. Ollama chat requires the transport's private
expected_ollama_digest closure, issues inventory under the same signal,
validates that digest, then sends raw content. On every
terminal path remove listeners and destroy request, response, and socket.
Return safe named errors without provider bytes.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Trace every endpoint, header, signal, failure race, byte count, response
ownership, redirect, error message, and private test seam. Confirm only this
module has network APIs and no injected test port crosses a public factory.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a controlled fake request/response/socket test for each accepted terminal
race or endpoint bypass before the minimal cleanup correction.

- [ ] **Step 8: Re-review**

Require APPROVED after repeating Step 4 and Step 5.

- [ ] **Step 9: Synchronize task evidence**

Record P2-T2 resource-cleanup and capability-gate evidence in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/http-transport.ts \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add closed production HTTP transport"
~~~

Stop after the commit and report the evidence.

### P2-T3: Private Production Configuration

**Goal / acceptance:** Read and normalize only the three allowlisted
environment variables, require correct values for the selected mode, create the
default transport from a private API-key closure, and expose a credential-free
summary only to sibling composition.

**Files:**

- Create: engines/sandbox/src/security-production/production-config.ts
- Create: engines/sandbox/tests/sandbox-security-production-config.spec.ts

**Dependencies / frozen inputs:** P2-T2 is verified. No caller-facing factory
accepts an environment object. Test parsing uses a test-only helper record; the
production path reads process.env inside this module only.

- [ ] **Step 1: Write failing configuration tests**

~~~ts
test("REQ-SBX-GENERAL-002 rule_only needs no environment values", () => {
  assert.deepEqual(normalizeSandboxSecurityProductionConfigForTest({}, "rule_only").summary, {
    ollama_configured: false, judge_configured: false
  });
});

test("REQ-SBX-GENERAL-002 local modes require a normalized immutable digest", () => {
  assert.throws(() => normalizeSandboxSecurityProductionConfigForTest({}, "local"));
  assert.equal(normalizeSandboxSecurityProductionConfigForTest({
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: " sha256:" + "a".repeat(64) + " "
  }, "local").summary.ollama_digest, "sha256:" + "a".repeat(64));
});

test("REQ-SBX-GENERAL-002 local_and_judge requires nonempty key and exact enable flag without leaking key", () => {
  const config = normalizeSandboxSecurityProductionConfigForTest(validJudgeEnv(), "local_and_judge");
  assert.doesNotMatch(JSON.stringify(config.summary), /secret-openai-key/);
  assert.throws(() => normalizeSandboxSecurityProductionConfigForTest({ ...validJudgeEnv(), SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE: "true" }, "local_and_judge"));
});
~~~

Cover missing, empty, whitespace-only, invalid digest prefix/case/length,
unknown mode, key trimming, flag values other than 1, config immutability,
zero endpoint/model overrides, and a source scan proving this is the sole
process.env reader.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts
~~~

Expected: guarded parsing returns a permissive placeholder, so a required-mode
or credential-leak assertion fails.

- [ ] **Step 3: Implement private config normalization**

~~~ts
export type SandboxSecurityProductionMode = "rule_only" | "local" | "local_and_judge";

export function createSandboxSecurityProductionConfig(
  mode: SandboxSecurityProductionMode
): Readonly<SandboxSecurityProductionConfig>;

export function createSandboxSecurityProductionTransport(
  config: Readonly<SandboxSecurityProductionConfig>
): SandboxSecurityHttpTransport;
~~~

Read exactly SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST, OPENAI_API_KEY, and
SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE; trim/copy values, construct transport,
clear intermediate key references, and never log or return a key. Return a
frozen credential-free config view backed by a module-private WeakMap that
binds the exact view identity to the digest/key closure. Transport construction
consumes that binding; a copied/fabricated config view is rejected.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Review all mode transitions, credential lifetime, summary serializability,
environment read inventory, test helper isolation, and absence of endpoint,
model, transport, or credential overrides.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a leaking summary, malformed digest, or mode prerequisite case before the
smallest config correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4 and Step 5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Append P2-T3 configuration/read-capability evidence to docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/production-config.ts \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add private production detector config"
~~~

Stop after the commit and report the evidence.

### P2-T4: Exact Ollama Request and Response Contract

**Goal / acceptance:** Define the fixed prompt/version, projection ordering,
32 KiB request cap, prewarm request, strict chat envelope parser, local-model
schema parser, confidence/category mapping, and no-prose replay projection.

**Files:**

- Create: engines/sandbox/src/security-production/ollama-contract.ts
- Create: engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts

**Dependencies / frozen inputs:** P2-T1 is verified. Use the exact fixed prompt,
schema, prewarm payload, model qwen3:8b, response envelope, and mapping in the
approved Spec. This module never constructs a network request.

- [ ] **Step 1: Write failing canonical contract tests**

~~~ts
test("REQ-SBX-GENERAL-002 Ollama body bytes match fixed prompt projection and schema", () => {
  assert.deepEqual(
    createSandboxSecurityOllamaChatRequest(snapshotWithTool()).body,
    expectedExactUtf8Bytes
  );
});

test("REQ-SBX-GENERAL-002 Ollama parser accepts only completed assistant JSON envelope", () => {
  assert.deepEqual(parseSandboxSecurityOllamaChatResponse(validWireResponse, digest), expectedParsed);
  for (const invalid of invalidOllamaEnvelopes()) assert.throws(() => parseSandboxSecurityOllamaChatResponse(invalid, digest));
});

test("REQ-SBX-GENERAL-002 Ollama request cap never truncates snapshot content", () => {
  assert.throws(() => createSandboxSecurityOllamaChatRequest(snapshotOver32768Bytes()));
});
~~~

Cover exact UTF-8/no BOM/insertion order, user delimiters, no history/tools/
streaming/retry, all fixed options, prewarm payload, outer model/digest check,
done/done_reason, optional timing grammar, empty-only thinking, 64 KiB raw body
boundary, schema keys, matched/no_match cardinality, ordinal/tool mapping,
duplicate/out-of-scope references, and confidence labels.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts
~~~

Expected: a guarded inert contract produces wrong fixed request bytes, making
the canonical-body assertion fail.

- [ ] **Step 3: Implement pure Ollama contract functions**

~~~ts
export const SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION =
  "sandbox-security-ollama-local-prompt.v1" as const;

export function createSandboxSecurityOllamaChatRequest(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>
): Readonly<{ body: Uint8Array }>;

export function createSandboxSecurityOllamaPrewarmRequest(): Readonly<{ body: Uint8Array }>;

export function parseSandboxSecurityOllamaChatResponse(
  body: Uint8Array,
  verified_digest: string
): Readonly<SandboxSecurityReplayOllamaResponse>;
~~~

The pure parser returns normalized content-free data and throws on malformed
wire/schema/mapping input; it never returns raw provider content or converts
invalid data into no_match.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts
~~~

- [ ] **Step 5: Run static and contract gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts \
  engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Byte-compare implementation against the Spec, including prompt characters, JSON
insertion order, schema branch, options, cap, prewarm payload, envelope fields,
and content-free return value.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a byte fixture or malformed envelope that fails for the reported reason
before changing the pure formatter/parser.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4 and Step 5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P2-T4 prompt/schema versions and canonical-byte test result in
docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/ollama-contract.ts \
  engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): define exact Ollama detector contract"
~~~

Stop after the commit and report the evidence.

### P2-T5: Digest-Qualified Ollama Local Detector

**Goal / acceptance:** Qualify exactly one matching local model inventory,
prewarm it within the inherited slot budget, bind a frozen proof to one
transport identity and construction generation in a private WeakMap, and
construct the raw local detector only by consuming that proof.

**Files:**

- Create: engines/sandbox/src/security-production/ollama-local-detector.ts
- Create: engines/sandbox/tests/sandbox-security-production-ollama-detector.spec.ts

**Dependencies / frozen inputs:** P2-T1 through P2-T4 are verified. The
detector uses P2-T4 request/parser and P2-T2 transport; it cannot read
environment or call an endpoint directly.

- [ ] **Step 1: Write failing qualification and adapter tests**

~~~ts
test("REQ-SBX-GENERAL-002 qualification accepts exactly one matching digest and prewarms once", async () => {
  const proof = await qualifySandboxSecurityOllama({ transport, expected_digest: expectedDigest, signal });
  assert.equal(inventoryCalls, 1);
  assert.equal(chatCalls, 1);
  assert.equal(proof.summary.ollama_digest, expectedDigest);
  assert.ok(proof.summary.warmed_probe_latency_ms <= 1000);
});

test("REQ-SBX-GENERAL-002 qualification proof is one-use and transport-bound", async () => {
  const proof = await qualifySandboxSecurityOllama({ transport, expected_digest: expectedDigest, signal });
  createSandboxSecurityOllamaLocalDetector({ transport, qualification: proof });
  assert.throws(() => createSandboxSecurityOllamaLocalDetector({ transport, qualification: proof }));
  assert.throws(() => createSandboxSecurityOllamaLocalDetector({ transport: otherTransport, qualification: structurallyEqual(proof) }));
});

test("REQ-SBX-GENERAL-002 local detector revalidates digest before every raw-content chat", async () => {
  await detector.detect(snapshot(), signal);
  assert.deepEqual(operationLog, ["model_inventory", "chat"]);
});
~~~

Cover absent/duplicate model, name/model mismatch, remote fields, bare digest
grammar/constant-time mismatch, prewarm invalid response, timeout/abort,
transport failure, drift before chat, response mismatch, raw outcome mapping,
one-use proof deletion, frozen proof view, and no model load/pull.

- [ ] **Step 2: Run the RED command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-ollama-detector.spec.ts
~~~

Expected: guarded qualification cannot produce a transport-bound proof, so the
one-use/operation-order assertion fails for its intended behavior.

- [ ] **Step 3: Implement qualification and detector factory**

~~~ts
export function qualifySandboxSecurityOllama(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  expected_digest: string;
  signal: AbortSignal;
}>): Promise<Readonly<SandboxSecurityOllamaQualification>>;

export function createSandboxSecurityOllamaLocalDetector(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  qualification: Readonly<SandboxSecurityOllamaQualification>;
}>): RawLocalDetector;
~~~

Keep the proof binding in a module-private WeakMap; freeze its returned view and
delete the entry when detector creation consumes it. Qualification receives a
caller-owned signal already bounded to 1000 ms by composition and records the
measured prewarm latency. Use the same supplied signal for inventory/prewarm.
Every detector chat uses its Engine lease signal. Let transport revalidate immediately
before raw bytes leave the process. Do not serialize, clone, log, or expose
proof binding.

- [ ] **Step 4: Run the focused GREEN command**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-ollama-detector.spec.ts
~~~

- [ ] **Step 5: Run static, integration, and compatibility gates**

~~~bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts \
  engines/sandbox/tests/sandbox-security-production-provider-outcomes.spec.ts \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts \
  engines/sandbox/tests/sandbox-security-production-ollama-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-ollama-detector.spec.ts \
  engines/sandbox/tests/sandbox-security-detector-boundary.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run build --prefix frontend
git diff --check
~~~

- [ ] **Step 6: Independent Reviews**

Inspect timing/abort propagation, inventory requirements, digest normalization,
constant-time comparison, prewarm isolation, WeakMap identity/generation
binding, one-use consumption, raw-result behavior, and absence of hidden
config/network/benchmark access.

- [ ] **Step 7: Fix accepted review findings with regression RED evidence**

Add a fake transport case for duplicate inventory, drift, forged proof, reused
proof, or signal race before the narrow correction.

- [ ] **Step 8: Re-review**

Require APPROVED after Step 4 and Step 5 evidence.

- [ ] **Step 9: Synchronize task evidence**

Record P2-T5 digest/prewarm contract, review loop, command results, and exact
commit in docs/progress.md.

- [ ] **Step 10: Commit only the owned files**

~~~bash
git add engines/sandbox/src/security-production/ollama-local-detector.ts \
  engines/sandbox/tests/sandbox-security-production-ollama-detector.spec.ts \
  docs/progress.md
git commit -m "feat(sandbox): add digest-qualified Ollama detector"
~~~

Stop after the commit and report the evidence.

## Phase Exit Gate

- [ ] P2-T1 through P2-T5 are VERIFIED, committed individually, and have
  APPROVED independent re-reviews.
- [ ] The static production gate proves only default transport has network
  capability and only config reads environment.
- [ ] Tests cover normal/error/boundary/missing/unknown/accessor/abort/raw
  response/signal races for outcomes, transport, config, contracts,
  qualification, and adapter mapping.
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

- [ ] Dispatch a Phase-level independent reviewer. It compares provider bytes
  and endpoint policy with the Spec, inspects secret/capability boundaries and
  proof lifecycle, reviews tests, and checks P1 compatibility. Fix accepted
  findings through RED/green/re-review before Phase 2 is verified.
- [ ] Append truthful Phase 2 evidence to docs/progress.md, commit that
  evidence-only update, and stop before Phase 3.

## Phase Report Format

~~~text
Phase: 2
Tasks: P2-T1 VERIFIED; P2-T2 VERIFIED; P2-T3 VERIFIED; P2-T4 VERIFIED; P2-T5 VERIFIED
Commits: <one exact hash per task>; <phase evidence hash>
Provider boundary: <endpoint/signal/cleanup result>
Qualification: <digest/prewarm/proof result>
Review: <findings, fixes, re-review>
Dirty paths: <exact output>
Next gate: Phase 3 entry gate
~~~
