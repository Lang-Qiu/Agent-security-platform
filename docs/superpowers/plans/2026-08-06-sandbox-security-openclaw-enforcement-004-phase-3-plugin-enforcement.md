# Phase 3 General-Security Plugin Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Implement and test the general-security plugin's complete
host-independent enforcement behavior before modifying the real OpenClaw
runtime.

**Architecture:** Strict immutable config constructs one production Engine and
a four-slot no-queue runtime. A plugin-owned trusted issuer creates one
`request:<UUIDv4>` per evaluation before a pure authority builder accepts closed
barrier observations and returns GENERAL-001 enforcement requests. A pure mapper
owns fixed actions/replacements, an audit client owns only content-free HTTP,
and a plugin coordinator registers four hook names against a fake API while
retaining only opaque correlation state. Each handler returns one exact private
envelope that echoes host correlation and snapshots enforcement/audit health
around the closed barrier result; the real host validates that envelope in
Phase 4.

**Tech Stack:** TypeScript ESM, OpenClaw plugin SDK types, GENERAL-001/002 public
indexes, Node `crypto`, `fetch`, `AbortController`, `node:test` fake ports.

---

## Entry Gate

- [ ] Confirm Phase 2 is committed/reviewed with v2 backend integration green.
- [ ] Run:

```bash
npm run test:shared
npm run test:backend
pnpm --dir integrations/openclaw/general-security run build
git diff --check
```

Expected: Phase 2 green. No real OpenClaw patch exists yet.

## Locked Plugin Boundary

```ts
type OpenClawSecurityHookName =
  | "before_agent_run"
  | "before_model_output_delivery"
  | "before_tool_execution"
  | "before_message_delivery";

interface OpenClawSecurityPluginApi {
  on(
    name: OpenClawSecurityHookName,
    handler: (event: unknown, context: unknown) => Promise<unknown>,
    options: Readonly<{ priority: 1000; timeoutMs: 10000 }>
  ): void;
}
```

The fake API is an integration-owned structural test boundary. P4 changes the
real SDK to satisfy it; P3 never monkey-patches or imports OpenClaw private
chunks.

### Task P3-T1: Immutable Config, Health, Engine, and Concurrency

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/config.ts`
- Create: `integrations/openclaw/general-security/src/general-security/runtime.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-config-runtime.spec.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`

- [ ] **Step 1: Write failing config/runtime tests**

Test exact four-key config, profile/mode catalogs, audit URL path/protocol,
token grammar, deep freeze, one Engine construction, four immediate slots/no
queue, fixed 10000 ms caller abort, Engine throw/timeout/invalid result,
independent health, and the integration-private evaluation request-ID issuer:

```ts
assert.deepEqual(runtime.health(), {
  enforcement: "healthy",
  audit: "healthy"
});
runtime.markAuditDegraded("audit_timeout");
assert.deepEqual(runtime.health(), {
  enforcement: "healthy",
  audit: "degraded"
});
assert.equal(engineFactoryCalls, 1);
assert.equal(await Promise.all([0, 1, 2, 3].map(() => runtime.tryEvaluate(req)))
  .every((result) => result.kind === "decision"), true);
assert.deepEqual(await runtime.tryEvaluate(req), {
  kind: "interrupted",
  code: "engine_slot_unavailable"
});
```

Also reject extra config, every origin outside the startup-owned internal-audit
origin allowlist (including otherwise valid public `https:` URLs), public
endpoint paths, credentials in URL, wrong token, mutation after startup, and a
production Engine import outside the two public indexes.

Inject `nextEvaluationRequestId()` through runtime ports. Assert one call returns
only exact lower-case `request:<UUIDv4>`, successive calls using distinct stubbed
UUIDs remain distinct, the result cannot be influenced by run/session/call,
prompt, provenance, or final-value inputs, and wrong prefix/version/variant/case,
extra characters, and generator exceptions are rejected as a closed
`request_id_unavailable` issuance result. The issuer stores no raw value or
issued-ID history.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-config-runtime.spec.ts
```

Expected: FAIL because config/runtime exports are absent.

- [ ] **Step 3: Implement minimal config and runtime**

```ts
export interface OpenClawSandboxSecurityConfig {
  policyProfileId:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  productionMode: "rule_only" | "local" | "local_and_judge";
  auditEndpoint: string;
  auditCapabilityToken: string;
}

export interface OpenClawSecurityHealth {
  enforcement: "healthy" | "failed";
  audit: "healthy" | "degraded";
}
```

Normalize own enumerable data properties only. The runtime ports provide a
deeply frozen startup-owned allowlist of canonical internal listener origins;
production contains only `http://sandbox-security-backend:3001`, while tests
may inject explicit loopback origins. Require `auditEndpoint` to match one of
those origins plus exactly
`/internal/sandbox/security/enforcement-events`, with no query/hash/userinfo.
Reject every other `http:` or `https:` origin rather than treating TLS as proof
that a host is internal. Require token
`^sbxcap_v1\.[A-Za-z0-9_-]{43}$` and return a deeply frozen clone. The allowlist
is a trusted process-composition port, not a fifth caller/plugin config field.

`createOpenClawSecurityRuntime` calls
`createSandboxSecurityProductionEngine({ runtime, mode })` once before hooks.
Implement a four-slot counter with `tryAcquire()` returning `null`; never wait.
Each evaluation gets a fixed host AbortController; Engine retains its inherited
budget. Normalize the returned public Decision. Failures return a closed
interruption code and set enforcement failed only for fatal invariant drift,
not ordinary per-call Engine failure. Store no request/decision after return.

Runtime ports expose a dedicated `nextEvaluationRequestId()` independent from
`nextAuditEventId()`. The production adapter prefixes the exact result of
`crypto.randomUUID()` with `request:` and exact-normalizes it as lower-case
UUIDv4. Export only the integration-private branded
`OpenClawSecurityEvaluationRequestId`/closed issuance helper needed by later
Phase 3 modules; do not add it to shared contracts or accept a host-supplied ID.

- [ ] **Step 4: Run GREEN and typecheck**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-config-runtime.spec.ts
npm run typecheck:integration:openclaw:security
pnpm --dir integrations/openclaw/general-security run build
git diff --check
```

Expected: config/runtime matrix passes and build imports only public indexes.

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/src/general-security/config.ts \
  integrations/openclaw/general-security/src/general-security/runtime.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/tests/general-security-config-runtime.spec.ts
git commit -m "feat(openclaw): create sandbox security runtime"
```

### Task P3-T2: Authoritative Request Builder

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/authority-builder.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-authority.spec.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`

- [ ] **Step 1: Write the full failing authority matrix**

Create exact fixtures for the four discriminants:

```ts
type OpenClawSecurityBarrierObservation =
  | { point: "before_agent_run"; correlation: Correlation; prompt: string }
  | {
      point: "before_model_output_delivery";
      correlation: Correlation;
      prompt: string;
      assistant: OpenClawSecurityAssistantProjection;
    }
  | {
      point: "before_tool_execution";
      correlation: Correlation & { callId: string };
      prompt: string;
      assistant: OpenClawSecurityAssistantProjection;
      tool: { call_id: string; tool_name: string; arguments: SandboxSecurityJsonValue };
    }
  | {
      point: "before_message_delivery";
      correlation: Correlation;
      prompt: string;
      outbound: string | SandboxSecurityJsonValue;
    };
```

Assert stage/source ordering/authority kind/media/provenance, configured profile,
enforcement mode, exact submission-authority equality, omitted target, fresh
frozen objects, the exact issuer-owned request ID, and deterministic source IDs.
Prove changing run/session/call/content/provenance cannot derive or replace the
injected ID, and the same branded ID appears unchanged in the public submission
and resulting Engine evaluation request. Reject an unbranded/invalid request ID,
unknown keys,
systemPrompt/history/workspace/memory/retrieval, stale/mismatched run/session/
call, duplicate assistant calls, unknown content blocks, malformed JSON,
prototype/accessor/cyclic/sparse/non-finite/depth/node/size violations, binary,
and multimodal input.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-authority.spec.ts
```

Expected: FAIL because builder export is absent.

- [ ] **Step 3: Implement the closed builder**

```ts
export interface OpenClawSecurityAssistantProjection {
  schema_version: "openclaw-security-assistant-projection.v1";
  text_parts: string[];
  tool_calls: Array<{
    call_id: string;
    tool_name: string;
    arguments: SandboxSecurityJsonValue;
  }>;
}

export function buildOpenClawSecurityEvaluationRequest(input: Readonly<{
  observation: OpenClawSecurityBarrierObservation;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  issued_request_id: OpenClawSecurityEvaluationRequestId;
}>): Readonly<SandboxSecurityEvaluationRequest>;
```

Use ordinary-property traversal and a bounded deep clone, never
`JSON.stringify` as validation. Build both submission and authoritative context
from the same normalized values. Authority kind is `integration_observation`;
source types are only `user_input` and `model_output`. Use the current prompt
only, plus the point-specific final value. Never accept or infer a tool target.
Revalidate and copy `issued_request_id` unchanged; the builder never generates,
derives, defaults, recovers, or accepts a request ID from the observation.
Call the existing Engine boundary by passing the resulting request later; do
not import private source-authority helpers.

- [ ] **Step 4: Run GREEN with Engine authority regression**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-authority.spec.ts
npm run test:engine:sandbox
npm run typecheck:integration:openclaw:security
git diff --check
```

Expected: authority matrix and inherited Engine boundaries pass.

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/src/general-security/authority-builder.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/tests/general-security-authority.spec.ts
git commit -m "feat(openclaw): build sandbox security authority"
```

### Task P3-T3: Action Mapper and Immutable Replacement Envelope

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/action-mapper.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-action-mapper.spec.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`

- [ ] **Step 1: Write failing action x point tests**

For all four points x four actions, assert pass/replace, host outcome, fixed
text/code, no original content, no approval/resume token, no provenance field,
and frozen result. Test Engine error/timeout/invalid/slot/correlation/unsupported
floors by point. The plugin result deliberately stops before host provenance:

```ts
assert.deepEqual(mapDecision({ point: "before_tool_execution", action: "deny" }), {
  barrier: {
    outcome: "replace",
    replacement_code: "sandbox_security_policy_blocked",
    replacement_text: "Blocked by sandbox security policy."
  },
  host_outcome: "replaced",
  applied_action: "deny"
});
assert.equal("replacement_provenance" in result, false);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-action-mapper.spec.ts
```

Expected: FAIL because mapper is absent.

- [ ] **Step 3: Implement exhaustive mapping**

Use a `switch` over action and point with an `assertNever`. Return `pass` only
for `allow|alert`. Map `ask`, `deny`, and failure to the three exact constants.
Failure metadata records applied floor (`ask` except tool `deny`) separately
from replacement code. The mapper and plugin never create or accept
`replacement_provenance`; P4's patched host is its sole writer after validating
the exact replacement code/text pair. Deep-freeze outputs.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-action-mapper.spec.ts
npm run typecheck:integration:openclaw:security
git diff --check
```

Expected: complete action/failure matrix passes.

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/src/general-security/action-mapper.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/tests/general-security-action-mapper.spec.ts
git commit -m "feat(openclaw): enforce sandbox security actions"
```

### Task P3-T4: Content-Free Audit Client

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/audit-client.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-audit-client.spec.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`

- [ ] **Step 1: Write failing transport/envelope/privacy tests**

Use an injected transport/clock. Cover 201 accepted, 200 replay with first
timestamp, 409, 401/403/408/413/415/429/503, abort at exactly 1000 ms, network
throw, bare ack, malformed `ApiResponse`, ID/status/HTTP/timestamp mismatch, and
extra response keys. Scan serialized requests for prompt/model/tool/outbound,
token, call/run/session IDs, findings/evidence/provider/hash/replacement text.

```ts
assert.deepEqual(await client.append(completedProjection), {
  kind: "accepted",
  ack: ACCEPTED_ACK
});
assert.deepEqual(runtime.health(), {
  enforcement: "healthy",
  audit: "healthy"
});
```

For every failure, assert `{ kind: "failed", code: <closed> }`, audit degraded,
and enforcement unchanged.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-audit-client.spec.ts
```

Expected: FAIL because audit client is absent.

- [ ] **Step 3: Implement bounded exact client**

```ts
export interface OpenClawSecurityAuditTransport {
  post(input: Readonly<{
    url: string;
    bearer_token: string;
    body: Uint8Array;
    signal: AbortSignal;
  }>): Promise<Readonly<{ status: number; body: Uint8Array }>>;
}
```

Normalize/freeze the private request before serialization. Create one fixed
1000 ms AbortController, send exact headers through the transport, decode fatal
UTF-8/JSON, exact-normalize the existing `ApiResponse`, then normalize its data
with `normalizeOpenClawEnforcementAuditAck` imported from `shared/index.ts`, and
validate every relationship. Never define a plugin-local ack type/normalizer.
Return only closed code/status/time; never return body text. Catch all failures,
mark audit only, and clear timer in `finally`.

- [ ] **Step 4: Run GREEN and backend contract tests**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-audit-client.spec.ts
npm run test:shared
npm run test:backend
npm run typecheck:integration:openclaw:security
git diff --check
```

Expected: envelope/privacy matrix passes.

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security/src/general-security/audit-client.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/tests/general-security-audit-client.spec.ts
git commit -m "feat(openclaw): audit sandbox security enforcement"
```

### Task P3-T5: Plugin Coordination and Fake-Host Hook Matrix

**Files:**
- Create: `integrations/openclaw/general-security/src/general-security/plugin.ts`
- Create: `integrations/openclaw/general-security/tests/general-security-plugin.spec.ts`
- Modify: `integrations/openclaw/general-security/src/general-security/runtime.ts`
- Modify: `integrations/openclaw/general-security/src/index.ts`
- Modify: `integrations/openclaw/general-security/openclaw.plugin.json`

- [ ] **Step 1: Write failing plugin lifecycle/correlation tests**

Use a recording fake API and injected runtime/audit client. Assert exactly one
registration of each hook at priority 1000/timeout 10000, startup-before-hooks,
missing/duplicate plugin rejection, event exact-key/correlation checks,
same-session concurrent runs, multi-call turns, stale result rejection,
post-rewrite values, all action/failure results, one audit attempt per complete/
interrupted evaluation, audit failure action independence, and terminal cleanup.

Inject `nextEvaluationRequestId()` separately from `nextAuditEventId()`. Assert
exactly one evaluation-ID call after event/context normalization and before
authority/state/Engine work; unique IDs across successive and concurrent
evaluations; the same immutable ID in builder input, Engine request/Decision
correlation, and the one audit projection; and no ID dependence on
run/session/call, raw/final values, or provenance. A throw or invalid grammar
must return the point's fixed unavailable barrier, set
enforcement failed, create no correlation state, and call neither builder,
Engine, audit-ID generator, nor audit transport. It must never fall back to a
host ID or fabricate an auditable interruption.

Assert every handler resolves to a deeply frozen, exact-key private envelope:

```ts
interface OpenClawSecurityHookEnvelope {
  schema_version: "openclaw-security-hook-result.v1";
  correlation: {
    runId: string;
    sessionKey: string;
    callId: string | null;
  };
  health: OpenClawSecurityHealth;
  barrier: OpenClawSecurityBarrierResult;
}
```

The correlation must exactly echo the handler's normalized event/context
identity; non-tool points use `callId: null`, while a tool point uses its exact
call ID. Assert exact `Object.keys` at every envelope level, all field types,
deep freezing, stale-result rejection, and correct echoing across same-session
concurrency. Cover `audit: "degraded"` with the preselected barrier unchanged
and `enforcement: "failed"` with the fixed unavailable replacement rather than
`pass`. Assert the snapshot is taken after the single audit attempt so an audit
failure is visible without changing `barrier`. P4-T2 owns adversarial rejection
tests for externally malformed/tampered envelopes.

Inject `nextAuditEventId()` through the runtime ports; it remains independent
from `nextEvaluationRequestId()` and returns the typed
`audit:<UUIDv4>` identifier. Assert exact UUIDv4 grammar, one generator call per
completed/interrupted evaluation,
unique IDs across evaluations, the same ID throughout that evaluation's single
audit attempt, no host/caller-supplied event ID, and generator failure becoming
an audit-only degradation that leaves the preselected host action unchanged.

Assert state snapshots contain only opaque IDs/digests/status and never prompt,
assistant arguments, outbound text, token, Decision, or replacement:

```ts
assert.deepEqual(plugin.inspectOpaqueState(), [{
  runId: "run-1",
  sessionKey: "session-1",
  state: "active",
  callIds: ["call-1"]
}]);
assert.equal(JSON.stringify(plugin.inspectOpaqueState()).includes("secret"), false);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-plugin.spec.ts
```

Expected: FAIL because plugin registration is absent.

- [ ] **Step 3: Implement plugin coordinator**

```ts
export async function createOpenClawSecurityPlugin(input: Readonly<{
  config: unknown;
  runtime_ports: OpenClawSecurityRuntimePorts;
  audit_transport: OpenClawSecurityAuditTransport;
}>): Promise<Readonly<{
  register(api: OpenClawSecurityPluginApi): void;
  health(): Readonly<OpenClawSecurityHealth>;
  inspectOpaqueState(): readonly OpenClawSecurityOpaqueRunState[];
}>>;
```

Construct config/Engine/audit client before returning. `register` is one-shot;
validate API and register exactly four handlers. Each handler exact-normalizes
event/context, obtains and exact-normalizes exactly one trusted evaluation
request ID, builds authority from current call-stack values plus that ID, evaluates,
rechecks opaque correlation/final-value digest, maps action, freezes audit
projection containing the same evaluation request ID, obtains exactly one
replay-safe `audit:<UUIDv4>` from the injected
runtime port, attempts audit once with that ID, deletes terminal correlation
state, rechecks enforcement health, and returns the exact frozen
`OpenClawSecurityHookEnvelope`. Its `correlation` is reconstructed from the
normalized handler event/context rather than accepted from any Engine/audit
result; its `health` snapshot is read after the audit attempt; and its `barrier`
is the preselected action unless enforcement health has failed, in which case
it is the fixed unavailable replacement. The Node runtime port uses
`crypto.randomUUID()` independently for the evaluation and audit prefixes and
exact-normalizes each result. Evaluation-ID generation/normalization failure
occurs before evaluation, sets enforcement failed, sends no Engine/audit
request, and returns the fixed unavailable barrier. Audit-event-ID failure
occurs after action selection and follows the specification's audit-construction
failure rule: mark audit degraded, send no request, and preserve the preselected
host action. Raw values are never placed in the state map.

Manifest config accepts only the four immutable keys and opts into conversation
access required for these hooks. It defines no tool or public route.

- [ ] **Step 4: Run Phase 3 GREEN gate**

```bash
node --experimental-strip-types --test integrations/openclaw/general-security/tests/general-security-*.spec.ts
npm run typecheck:integration:openclaw:security
pnpm --dir integrations/openclaw/general-security run build
npm run test:engine:sandbox
npm run test:engine:sandbox:production
git diff --check
```

Expected: fake-host plugin and inherited Engine suites pass; Track 1 files are
unchanged.

- [ ] **Step 5: Commit and stop Phase 3**

```bash
git add integrations/openclaw/general-security/src/general-security/plugin.ts \
  integrations/openclaw/general-security/src/general-security/runtime.ts \
  integrations/openclaw/general-security/src/index.ts \
  integrations/openclaw/general-security/openclaw.plugin.json \
  integrations/openclaw/general-security/tests/general-security-plugin.spec.ts
git commit -m "feat(openclaw): coordinate final security hooks"
```

## Phase 3 Exit Gate

- [ ] Four hooks pass all action/failure matrices on the fake host.
- [ ] No raw values survive a handler or appear in audit/state/error outputs.
- [ ] Engine is constructed once, concurrency is four/no queue, and health
  domains are independent.
- [ ] Every evaluation has one unique plugin-issued `request:<UUIDv4>` that is
  stable through Engine/audit correlation; issuance failure is pre-evaluation,
  fail-closed, and invokes neither Engine nor audit.
- [ ] Audit envelope failures never change the selected action.
- [ ] All imports use public Engine/shared indexes.
- [ ] Review has no unresolved Critical or Important finding.

Proceed only to Phase 4. Do not claim real OpenClaw enforcement from fake-host
tests.
