# GENERAL-002 Explicit Judge Protocol Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit startup selection between the existing Responses Judge wire protocol and a new fail-closed OpenAI-compatible Chat Completions JSON protocol so the configured live provider can complete P6 without host inference, retry, or fallback.

**Architecture:** `production-config.ts` owns the six-value environment boundary and selects one pure protocol binding from `judge-protocol-adapter.ts`. The existing Judge detector receives a protocol ID and dispatches to one bounded request/parser pair; transport accepts only the configured operation and endpoint. Capture, evaluator, sealer, and replay evidence keep the existing six-field hash, whose protocol field makes cross-protocol substitution fail closed.

**Tech Stack:** Node.js 22.19, TypeScript with native type stripping, `node:test`, existing sandbox security engine contracts, existing benchmark capture/evaluator/sealer scripts.

---

## File Responsibility Map

- `engines/sandbox/src/security-production/judge-protocol-adapter.ts`: pure protocol IDs, canonical base URL validation, operation-specific endpoint derivation and endpoint revalidation.
- `engines/sandbox/src/security-production/production-config.ts`: sole six-variable environment reader and one-use private protocol/credential/endpoint state.
- `engines/sandbox/src/security-production/openai-judge-contract.ts`: shared Judge prompt/structured-output validation plus existing Responses envelope.
- `engines/sandbox/src/security-production/openai-chat-judge-contract.ts`: bounded Chat Completions JSON request and exact response-envelope parser.
- `engines/sandbox/src/security-production/openai-judge-detector.ts`: protocol-selected request/parser dispatch and unchanged candidate mapping.
- `engines/sandbox/src/security-production/external-pipeline.ts`: passes the nonsecret protocol ID into the Judge detector.
- `engines/sandbox/src/security-production/http-transport.ts`: operation/endpoint consistency and no-redirect wire request.
- `engines/sandbox/src/security-production/composition.ts`: requires protocol and model from the config summary.
- `engines/sandbox/src/security-production/benchmark-composition.ts`: protocol-aware capture normalization and sealed replay config validation.
- `scripts/benchmark/sandbox-security/capture-live.ts`: selected-protocol readiness and six-field live binding.
- `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`: mirrors the new contract module and forwards exactly six approved variables.
- `scripts/benchmark/sandbox-security/contracts.ts`: exact protocol/base/endpoint/binding normalization for candidate, evaluator, sealer, and replay artifacts.
- Focused engine and benchmark tests: RED/GREEN evidence for every changed boundary.
- GENERAL-002 amendment/master/P6/P7/progress/sprint docs: durable protocol and status synchronization.

### Task 1: Explicit Protocol And Configuration Boundary

**Files:**
- Modify: `engines/sandbox/tests/sandbox-security-production-judge-protocol-adapter.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-config.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts`
- Modify: `engines/sandbox/src/security-production/judge-protocol-adapter.ts`
- Modify: `engines/sandbox/src/security-production/production-config.ts`
- Modify: `engines/sandbox/src/security-production/http-transport.ts`

- [x] **Step 1: Write failing adapter and config tests**

Add exact scenarios named for `REQ-SBX-GENERAL-002`:

```ts
test("REQ-SBX-GENERAL-002 derives the Chat Completions endpoint only for the explicit chat protocol", () => {
  assert.deepEqual(
    resolveSandboxSecurityJudgeProtocol(
      "openai_chat_completions_json_v1",
      "https://api.example.test/"
    ),
    {
      protocol_id: "openai_chat_completions_json_v1",
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://api.example.test",
      endpoint_url: "https://api.example.test/chat/completions"
    }
  );
});

test("REQ-SBX-GENERAL-002 rejects cross-protocol endpoint substitution", () => {
  assert.throws(() => normalizeSandboxSecurityJudgeEndpoint(
    "openai_chat_completions_json_v1",
    "https://api.example.test/responses"
  ), /sandbox_security_judge_protocol_invalid/);
});

test("REQ-SBX-GENERAL-002 requires an explicit supported Judge protocol", () => {
  assert.throws(() => normalizeSandboxSecurityProductionConfigForTest(
    liveEnvironment({ SANDBOX_SECURITY_JUDGE_PROTOCOL: undefined }),
    "local_and_judge"
  ), /sandbox_security_production_config_invalid/);
});
```

Also prove an unknown protocol fails, both supported protocols expose only the
nonsecret selected binding, and the private credential/endpoint/protocol state
is consumed exactly once.

- [x] **Step 2: Run RED tests**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-judge-protocol-adapter.spec.ts \
  engines/sandbox/tests/sandbox-security-production-config.spec.ts \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts
```

Expected: FAIL because the chat protocol ID, generic resolver, protocol env,
and one-use protocol binding do not exist.

- [x] **Step 3: Implement the minimal pure protocol resolver**

Define and use these exact public-private types:

```ts
export const SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS = [
  "openai_responses_v1",
  "openai_chat_completions_json_v1"
] as const;

export type SandboxSecurityJudgeProtocolId =
  typeof SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS[number];

export function resolveSandboxSecurityJudgeProtocol(
  protocolId: SandboxSecurityJudgeProtocolId,
  baseUrl: string
): Readonly<{
  protocol_id: SandboxSecurityJudgeProtocolId;
  endpoint_policy_id: "operator_https_fqdn_v1";
  base_url: string;
  endpoint_url: string;
}>;
```

Use `responses` for Responses and `chat/completions` for Chat. Keep the current
URL length, HTTPS DNS, no-userinfo/query/fragment/non-default-port, localhost,
and ambiguous-segment checks. Endpoint normalization must reconstruct the
base and prove exact round-trip equality for the declared protocol.

Add `SANDBOX_SECURITY_JUDGE_PROTOCOL` as a mandatory exact env value for
`local_and_judge`. Carry the protocol and derived endpoint together through
summary and private one-use state into transport; do not add a default, host
lookup, protocol probe, retry, or fallback. Transport accepts only the
operation matching that protocol and rejects cross-protocol operations before
the request factory runs.

- [x] **Step 4: Run focused GREEN tests**

Run the Step 2 command. Expected: all adapter and config tests pass.

- [x] **Step 5: Run Task 1 static gates**

```bash
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-production.spec.ts
git diff --check
```

Expected: zero failures and no new capability violation; the protocol adapter
has no Node builtin, environment, filesystem, DNS, or network import.

- [x] **Step 6: Independent reviews and re-review**

Dispatch a Specification Compliance reviewer, fix accepted findings with a new
RED regression, rerun Steps 4-5, then dispatch a Code Quality/Security reviewer.
Fix accepted findings with RED evidence and require both reviewers to return
`APPROVED` on the final diff.

Task 1 closed on `2026-07-23`: focused tests `131/131`, repository capability
gate `183/183`, sandbox and benchmark TypeScript checks, frontend build, and
`git diff --check` passed. Specification and Code Quality/Security re-reviews
both returned `APPROVED`. The aggregate production suite retains four planned
downstream RED cases owned by Tasks 4 and 5: protocol-aware benchmark fixtures
and replacement of fixed port `11434` listeners.

### Task 2: Chat Request And Exact Response Contract

**Files:**
- Create: `engines/sandbox/src/security-production/openai-chat-judge-contract.ts`
- Create: `engines/sandbox/tests/sandbox-security-production-openai-chat-contract.spec.ts`
- Modify: `engines/sandbox/src/security-production/openai-judge-contract.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts`

- [x] **Step 1: Write failing Chat contract tests**

Add tests for the exact request:

```ts
test("REQ-SBX-GENERAL-002 Chat Judge uses bounded JSON-object low-reasoning mode", () => {
  const request = createSandboxSecurityOpenAiChatJudgeRequest(validPayload(), {
    judge_requested_model: "model-a"
  });
  const body = JSON.parse(new TextDecoder().decode(request.body));
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.equal(body.reasoning_effort, "low");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.messages.length, 2);
  assert.equal("tools" in body, false);
});
```

Add a valid observed envelope fixture with exact keys `choices`, `created`,
`id`, `model`, `object`, `system_fingerprint`, and `usage`; one exact choice;
assistant `content` plus bounded `reasoning_content`; and `finish_reason:
"stop"`. Prove the parser returns only model/status/obligation results.

Add table tests rejecting BOM/invalid UTF-8/oversize body, unknown outer or
choice/message key, zero or multiple choices, nonzero index, non-assistant role,
null/prose/invalid inner content, `length` or other finish reason, malformed
model, duplicate/unknown obligation, and invalid outcome/severity coupling.

- [x] **Step 2: Run RED contract tests**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-openai-chat-contract.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-contract.spec.ts
```

Expected: FAIL because the Chat contract does not exist.

- [x] **Step 3: Extract only the shared Judge semantics**

From `openai-judge-contract.ts`, export narrow helpers that produce the trusted
system/user messages and parse the exact inner `sandbox-security-judge.v1`
JSON for a supplied sanitized payload. Keep the Responses request and envelope
behavior unchanged. Do not export a mutable schema object or weaken exact-key
validation.

- [x] **Step 4: Implement the Chat contract**

Create:

```ts
export function createSandboxSecurityOpenAiChatJudgeRequest(
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>,
  options: Readonly<{ judge_requested_model: string }>
): Readonly<{ body: Uint8Array }>;

export function parseSandboxSecurityOpenAiChatJudgeResponse(
  body: Uint8Array,
  payload: Readonly<SandboxSecuritySanitizedJudgePayload>
): Readonly<SandboxSecurityParsedOpenAIResponse>;
```

Enforce the 64 KiB body limit, fatal UTF-8, exact plain data descriptors, one
terminal choice, bounded discarded reasoning content, exact resolved model,
and the shared inner Judge parser. Convert every failure to fixed request or
response error names; never retain provider prose.

- [x] **Step 5: Run focused GREEN and typecheck**

Run Step 2, then:

```bash
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
git diff --check
```

Expected: all contract tests and TypeScript checks pass.

- [x] **Step 6: Independent reviews and re-review**

Require specification approval before quality/security approval. Any accepted
parser finding gets a minimal counterexample test before the fix and a full
rerun of Step 5.

Task 2 closed on `2026-07-23`: contract tests `36/36`, affected integration
tests `33/33`, repository gate `294/294`, sandbox and benchmark TypeScript
checks, frontend build, and `git diff --check` passed. Specification and Code
Quality/Security re-reviews both returned `APPROVED`.

### Task 3: Protocol-Selected Production Dispatch

**Files:**
- Modify: `engines/sandbox/src/security-production/http-transport.ts`
- Modify: `engines/sandbox/src/security-production/openai-judge-detector.ts`
- Modify: `engines/sandbox/src/security-production/external-pipeline.ts`
- Modify: `engines/sandbox/src/security-production/composition.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-composition.spec.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-integration.spec.ts`

- [ ] **Step 1: Write failing dispatch tests**

Prove the chat config issues exactly `{ provider: "openai", operation:
"chat_completions" }`, uses the Chat body/parser, and maps valid structured
results through the unchanged candidate mapping. Prove the Responses config is
unchanged.

Add transport tests that a Chat-configured one-use transport posts only to the
derived Chat endpoint and rejects a Responses operation before the request
factory runs; add the symmetric Responses test. Assert redirect and non-JSON
behavior remain fail closed.

Add composition/integration tests requiring both `judge_protocol_id` and
`judge_requested_model` in `local_and_judge`, with no protocol input accepted
from an evaluation request.

- [ ] **Step 2: Run RED production tests**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts \
  engines/sandbox/tests/sandbox-security-production-openai-detector.spec.ts \
  engines/sandbox/tests/sandbox-security-production-external-pipeline.spec.ts \
  engines/sandbox/tests/sandbox-security-production-composition.spec.ts \
  engines/sandbox/tests/sandbox-security-production-integration.spec.ts
```

Expected: FAIL on missing chat operation and protocol dispatch.

- [ ] **Step 3: Implement minimal protocol dispatch**

Extend the HTTP request union with the exact Chat operation. Store the selected
protocol in private transport state and accept only its corresponding
operation. Revalidate the endpoint with that protocol before constructing any
wire request.

Pass `judge_protocol_id` through composition and external pipeline. Extend the
existing Judge detector input with the protocol ID and choose one fixed
request/parser pair before evaluation. Keep candidate mapping, signal checks,
response cap, no redirects, no retry, and no fallback unchanged.

- [ ] **Step 4: Run focused GREEN and isolated production gates**

Run Step 2, then:

```bash
unshare --net -- bash -ceu '
  ip link set lo up
  exec env \
    -u SANDBOX_SECURITY_JUDGE_PROTOCOL \
    -u SANDBOX_SECURITY_JUDGE_API_KEY \
    -u SANDBOX_SECURITY_JUDGE_BASE_URL \
    -u SANDBOX_SECURITY_JUDGE_MODEL \
    -u SANDBOX_SECURITY_ENABLE_JUDGE \
    -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST \
    npm run test:engine:sandbox:production
'
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
git diff --check
```

Expected: all focused and isolated production tests pass.

- [ ] **Step 5: Independent reviews and re-review**

Review operation confusion, credential routing, endpoint revalidation,
configuration consumption, fallback absence, and abort cleanup. Add RED tests
for every accepted finding, rerun Step 4, and obtain both approvals.

### Task 4: Protocol-Bound Readiness, Capture, And Evidence

**Files:**
- Modify: `engines/sandbox/src/security-production/benchmark-composition.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Modify: `scripts/benchmark/sandbox-security/prepare-capture-bundle.ts`
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Modify: `tests/benchmark/sandbox-security-contracts.spec.ts`
- Modify: `tests/benchmark/sandbox-security-evaluate.spec.ts`
- Modify: `tests/benchmark/sandbox-security-live-evidence.spec.ts`
- Modify: `tests/benchmark/sandbox-security-isolation.spec.ts`
- Modify: `tests/repository/sandbox-security-production.spec.ts`

- [ ] **Step 1: Write failing readiness and capture tests**

Add tests proving Chat readiness creates/parses one Chat request before input
zero, returns the resolved model, remains exactly `4000ms`, and never tries
Responses after any Chat failure.

Add benchmark composition tests that Chat requests are normalized into the
existing content-free replay response using the Chat parser and recorded with
operation `chat_completions`. Add cross-protocol sealed-config and binding-hash
tamper cases. Mutate each of the six Judge binding fields independently and
prove every mutation changes or invalidates `judge_binding_sha256`.

Update child isolation tests to expect exactly six allowlisted variables and
prove old OpenAI-named or protocol-override aliases are absent. Add repository
source gates for the new module's imports and sole environment ownership.

- [ ] **Step 2: Run RED benchmark tests**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts \
  tests/repository/sandbox-security-production.spec.ts
```

Expected: FAIL because readiness, capture normalization, contracts, and child
environment still assume only Responses and five variables.

- [ ] **Step 3: Implement selected-protocol readiness and capture**

Create one protocol dispatch helper used by readiness and benchmark capture.
The helper must select by the config/binding protocol only, never by host,
model, response, or failure. Preserve the generic public failure code and do
not serialize diagnostic status into candidate evidence.

Update sealed config and candidate/cassette normalization to accept either
known protocol, derive the corresponding endpoint from the canonical base,
and recompute the same six-field `judge_binding_sha256`. Preserve exact-key,
same-ordinal projection, capture-manifest, symlink, undeclared-file, and
truth-isolation checks.

Mirror the Chat contract and all imports into the permission bundle. Forward
only the six approved environment keys.

- [ ] **Step 4: Run focused GREEN and aggregate static gates**

Run Step 2, then:

```bash
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run typecheck:benchmark:sandbox-security
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
npm run build --prefix frontend
git diff --check
```

Expected: all deterministic tests, corpus, typechecks, and build pass; only the
existing frontend chunk-size warning may remain.

- [ ] **Step 5: Independent reviews and re-review**

Specification review must inspect the complete six-field binding and protocol
operation. Quality/security review must inspect capability boundaries,
credential routing, raw-response disposal, candidate exactness, and
cross-protocol substitution. Fix accepted findings RED-first and rerun Step 4
before final approval.

### Task 5: Acceptance Provenance And Evidence Closure

**Files:**
- Modify: `engines/sandbox/src/security-production/http-transport.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts`
- Modify: `engines/sandbox/src/security-production/benchmark-composition.ts`
- Modify: `engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts`
- Modify: `scripts/benchmark/sandbox-security/capture-live.ts`
- Modify: `scripts/benchmark/sandbox-security/contracts.ts`
- Modify: `scripts/benchmark/sandbox-security/evaluate.ts`
- Modify: `scripts/benchmark/sandbox-security/seal.ts`
- Modify: `tests/benchmark/sandbox-security-capture-live.spec.ts`
- Modify: `tests/benchmark/sandbox-security-contracts.spec.ts`
- Modify: `tests/benchmark/sandbox-security-evaluate.spec.ts`
- Modify: `tests/benchmark/sandbox-security-live-evidence.spec.ts`
- Modify: `tests/benchmark/sandbox-security-isolation.spec.ts`

- [ ] **Step 1: Write failing credential-reflection tests**

Use a generic control-free credential that does not match any vendor prefix.
Make a fake provider return it in `model`, assistant content, and an otherwise
ignored metadata string. Assert the transport rejects each response with one
fixed credential-reflection error before a parser, capture sink, stdout, or
artifact can receive it. The test must not assert or print the credential.

- [ ] **Step 2: Run credential-reflection RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-http-transport.spec.ts
```

Expected: FAIL because response bodies are not checked against the one-use
credential before leaving transport.

- [ ] **Step 3: Reject reflected credentials inside transport**

While constructing the one-use Judge transport, retain only private credential
bytes. For every successful or error Judge response, scan the bounded body for
an exact credential byte sequence before returning it. On a match, destroy the
response and throw a fixed error; never include the matched value in an error,
log, return object, or artifact. Clear private references after transport
construction while preserving the closure-owned comparison bytes.

- [ ] **Step 4: Write failing single-config provenance tests**

Add a capture test that mutates the process environment after readiness and
before engine creation. Assert the same already-created transport is used for
readiness, Ollama qualification, and all Judge evaluations, and that no second
config/environment read occurs. Add a production entry test requiring the
native Node permission API; injected test ports may exercise logic but must not
write a production-acceptable candidate provenance.

Correct the permission-isolation probe so it targets files that actually
exist, accepts only an `ERR_ACCESS_DENIED` result for forbidden reads/imports,
and explicitly fails if dynamic import or filesystem access succeeds. Do not
count arbitrary module, path, or test errors as permission denial. Replace
fixed `11434` test listeners with isolated injected transports so a real local
Ollama listener cannot produce `EADDRINUSE` in deterministic tests.

- [ ] **Step 5: Run provenance RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  engines/sandbox/tests/sandbox-security-production-benchmark-composition.spec.ts \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-isolation.spec.ts
```

Expected: FAIL because readiness consumes one config/transport and live engine
construction creates a second config/transport; unrestricted execution can
also pass the current permission check.

- [ ] **Step 6: Pin one transport and production provenance**

Return the already-created production transport with the readiness result and
pass that exact object into the live capture engine. Wrap it with the capture
sink only after readiness; do not create or read a second config. Require the
real production entrypoint to observe the native permission API and the exact
read/write/no-child/no-worker boundary. Mark any injectable-port execution as
test-only and make its package unacceptable to evaluator/sealer publication.

- [ ] **Step 7: Write failing provider-failure acceptance tests**

For both evaluator and sealer, create same-ordinal candidates whose Ollama or
Judge cassette contains each of `http_error`, `transport_error`, and
`signal_termination`; assert rejection before metrics or publication. Add the
same capture-live regression and prove legitimate `not_called` remains valid
only for an uninvoked detector slot.

- [ ] **Step 8: Run provider-failure RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-capture-live.spec.ts \
  tests/benchmark/sandbox-security-contracts.spec.ts \
  tests/benchmark/sandbox-security-evaluate.spec.ts \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
```

Expected: FAIL because failed provider outcomes are currently content-free and
hashable but not acceptance-blocking.

- [ ] **Step 9: Enforce successful invoked outcomes at every boundary**

Add one shared exact candidate-cassette acceptance validator. Every invoked
provider slot must contain a normalized response; only a structurally
uninvoked slot may be `not_called`. Invoke it before capture package completion,
truth-aware evaluation, and truth-blind sealing. Keep failure cassettes useful
for deterministic unit/replay tests, but never acceptance-capable.

- [ ] **Step 10: Write failing seal-anchor and final-symlink tests**

Add live-evidence tests that independently alter `truth_tree_sha256`, replace
the retained accepted metrics while preserving a syntactically valid hash, and
replace final `capture.json` or `seal.json` with symlinks to matching external
files. Add undeclared final-root and replay entries, including non-JSON files,
directories, and symlinks. Each case must fail validation.

- [ ] **Step 11: Run seal-anchor RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
```

Expected: FAIL because final validation does not currently resolve the truth
anchor or accepted-metrics hash and follows top-level file symlinks.

- [ ] **Step 12: Make accepted metrics independently verifiable**

Persist the bounded content-free `SandboxSecurityBenchmarkAcceptedMetrics`
object inside `seal.json` and keep `accepted_metrics_sha256` as its canonical
hash. Final validation must `lstat` final manifest/seal/replay entries, reject
symlinks and non-regular files, load the corpus manifest, compare its truth
hash, recompute the accepted-metrics hash, and rerun frozen thresholds. Update
the seal schema in place because no accepted P6 seal exists.

- [ ] **Step 13: Run full security GREEN gates**

Run Steps 2, 5, 8, and 11, then the full Task 4 aggregate static gates. Expected:
all tests, typechecks, corpus validation, build, isolated production suite, and
`git diff --check` pass.

- [ ] **Step 14: Independent reviews and re-review**

Specification review must confirm no synthetic/test-only path can publish
accepted evidence and every invoked provider outcome is successful. Security
review must independently check credential reflection, same-config routing,
permission provenance, truth/metrics anchors, symlinks, and raw-content
absence. Fix every accepted finding RED-first and obtain both final approvals.

### Task 6: Controlled P6 Capture And Phase Handoff

**Files:**
- Modify: `.env.sandbox-security.local` (untracked local configuration only)
- Modify: `docs/superpowers/specs/2026-07-23-sandbox-security-operator-judge-protocol-adapter-amendment.md`
- Modify: `docs/superpowers/plans/2026-07-16-sandbox-security-production-002-master.md`
- Modify: `docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-6-live-capture.md`
- Modify: `docs/superpowers/plans/2026-07-16-sandbox-security-production-002-phase-7-hermetic-closure.md`
- Modify: `docs/sprint-current.md`
- Modify: `docs/progress.md`
- Create after real acceptance: `samples/sandbox-security-benchmark/v1/capture.json`
- Create after real acceptance: `samples/sandbox-security-benchmark/v1/replay/`
- Create after real acceptance: `samples/sandbox-security-benchmark/v1/seal.json`

- [ ] **Step 1: Configure the explicit protocol without printing values**

Add `SANDBOX_SECURITY_JUDGE_PROTOCOL=openai_chat_completions_json_v1` to the
mode-`600` local environment file. Validate only key presence and normalized
nonsecret summary. Never print the API key, digest, request, response, or
headers.

- [ ] **Step 2: Restore the real absent-evidence RED gate**

Remove the temporary absence-pass branches from the three committed
live-evidence tests. Require `capture.json`, 300 replay envelopes, and
`seal.json`; recompute all frozen thresholds rather than checking only a
hash-shaped value.

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
```

Expected: FAIL only because real accepted artifacts do not yet exist. A
passing result before capture means the gate is still vacuous and must be
corrected before proceeding.

- [ ] **Step 3: Synchronize pre-capture plan text**

Replace fixed-host and single-Responses statements with links to the explicit
selection amendment. Correct the live command to use the env file, six
nonprinting presence checks, a fresh absolute temporary root, and the actual
candidate/report paths. Keep P7 gated and status `IMPLEMENTATION_IN_PROGRESS`.

- [ ] **Step 4: Execute one fresh controlled live capture**

```bash
CAPTURE_ROOT="/Agent-security-platform/tmp/sandbox-security-capture-live-$(date +%Y%m%d-%H%M%S)"
node --env-file=.env.sandbox-security.local --experimental-strip-types \
  scripts/benchmark/sandbox-security/prepare-capture-bundle.ts \
  --output-root "${CAPTURE_ROOT}"
```

Expected: readiness succeeds inside `4000ms`, Ollama inventory/prewarm passes
inside the P6-only `5000ms` boundary, 300 ordered evaluations complete, sink
drains, and one exact candidate package exists. On any failure, preserve no
accepted artifact and return to the owning deterministic task; do not retry via
another protocol/model or weaken a threshold.

- [ ] **Step 5: Evaluate and truth-blind seal**

```bash
node --experimental-strip-types scripts/benchmark/sandbox-security/evaluate.ts \
  "--capture-root=${CAPTURE_ROOT}/capture-bundle/capture-output/candidate" \
  "--report=${CAPTURE_ROOT}/capture-bundle/capture-output/evaluation-report.json"
node --experimental-strip-types scripts/benchmark/sandbox-security/seal.ts \
  "--candidate-root=${CAPTURE_ROOT}/capture-bundle/capture-output/candidate" \
  "--report=${CAPTURE_ROOT}/capture-bundle/capture-output/evaluation-report.json"
```

Expected: every frozen metric passes and the sealer atomically publishes one
content-free capture manifest, 300 replay envelopes, and one seal.

- [ ] **Step 6: Run P6 evidence and exit gates**

Run the Phase 6 focused and static/corpus/compatibility blocks, both TypeScript
checks, isolated production command with all six Judge variables unset,
frontend build, `git diff --check`, and accepted live-evidence validation.

- [ ] **Step 7: Independent P6 reviews and re-review**

Require independent Specification Compliance and Code Quality/Security reviews
of real nonsecret readiness, resolved model, aggregate metrics, hashes/order,
raw/truth absence, and credentialed transport provenance. Any accepted bound
artifact change requires a fresh controlled capture. Require both final
reviews to return `APPROVED`.

- [ ] **Step 8: Synchronize P6 evidence and enter P7**

Record only nonsecret protocol/model identifiers, aggregate metrics, versions,
hashes, commands, and approvals. Mark P6-T4 and Phase 6 `VERIFIED` only after
all gates pass. Commit the accepted P6-owned evidence according to the master
plan, then begin Phase 7 from its entry gate; do not modify accepted capture or
production adapters during P7.

## Plan Self-Review

- Spec coverage: explicit selection, both endpoint derivations, Chat request,
  exact response validation, transport dispatch, readiness, binding, closed
  child environment, failure semantics, single-config provenance, credential
  reflection defense, provider-success acceptance, independently verifiable
  metrics/truth anchors, final symlink rejection, live evidence, and P7 handoff
  each map to one task.
- Type consistency: the plan uses one protocol union, one Chat operation name,
  one endpoint policy, and the unchanged six-field binding throughout.
- Scope: no backend/frontend feature, corpus change, threshold change, retry,
  fallback, provider auto-detection, or Phase 7 implementation is included.
