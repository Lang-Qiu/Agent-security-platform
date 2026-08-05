# Phase 4 Application Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Implement capability, audit, and evaluation application workflows
using injected domain ports and the single Phase 2 content-free projector.

**Architecture:** Services own orchestration order and transaction intent but
never inspect SQL or Engine internals. Audit projection is injected through the
already tested pure exact-union builder. Evaluation fingerprints before claim, acquires an Engine slot only for
a new/reclaimed claim, and returns a Decision only after durable completion and
audit commit.

**Tech Stack:** TypeScript ESM, `node:test`, fake repositories/gateways/clocks,
shared normalizers, Phase 2 controls, Phase 3 repository ports.

Every service failure is created with the closed P1
`createSandboxSecurityServiceError` factory. Phase 4 imports no HTTP class and
does not encode status codes or response envelopes. Tests assert exact error
code, rejection metadata, and retry metadata rather than message text.

---

## Entry Gate

- [ ] Confirm Phase 3 is committed and reviewed.
- [ ] Run:

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
git diff --check
```

The exact content-free projector is already implemented and registered by
P2-T5 so Phase 3 startup recovery can inject it. Phase 4 must reuse that one
instance and must not add a second builder.

## P4-T1: Capability Issue and Revoke Service

**Files:**

- Create: `backend/src/modules/sandbox-security/capability.service.ts`
- Modify: `backend/tests/sandbox-security-capability.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write service RED tests with a recording repository**

```ts
const FIXED_NORMALIZED_GRANT = {
  schema_version: "sandbox-security-capability-issue-request.v1",
  subject_id: "operator:alpha",
  scopes: ["sandbox_security:evaluate"],
  allowed_stages: ["user_input", "tool_request"],
  allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
  ttl_seconds: 900
} satisfies Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>;

test("REQ-SBX-GENERAL-003 issues one-time bearer and persists digest only", () => {
  assert.equal(typeof boundary.createSandboxSecurityCapabilityService, "function");
  const fixture = createCapabilityServiceFixture();
  const result = fixture.service.issue(FIXED_NORMALIZED_GRANT);
  assert.match(result.bearer_token, /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(result.expires_at, "2026-08-05T00:15:00.000Z");
  assert.equal(fixture.repository.issued.length, 1);
  assert.equal("bearer_token" in fixture.repository.issued[0].record, false);
  assert.match(fixture.repository.issued[0].record.token_digest, /^sha256:[a-f0-9]{64}$/);
});
```

Add explicit 60/3600 TTL, random 32-byte scope seed, UUID v4 IDs, auth-scope
binding, issue/audit atomic failure, no token on failure, revoke not found,
first revoke fixes `revoked_at`, repeated revoke preserves that timestamp without
a second revoke event, limiter deletion occurs only after a successful known-ID
revoke, and returned exact DTO cases. These are the revoke/limiter scenarios
deliberately owned by this service task rather than P2-T3.
Assert unknown revoke throws the P1 capability-not-found service error and
repository/projector failures throw the P1 internal service error.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(issues|revoke|bearer|digest)" \
  backend/tests/sandbox-security-capability.spec.ts
```

Expected: FAIL at the missing service factory export.

- [ ] **Step 3: Implement the specification signature**

```ts
export function createSandboxSecurityCapabilityService(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
}>): SandboxSecurityCapabilityService;
```

Import the service interface, required-TTL
`SandboxSecurityNormalizedCapabilityIssueRequest`, and all dependency contracts
from P1-T3 without redeclaring them. Keep every service fixture statically typed
as that normalized request. Call the already-tested DTO normalizer before
service entry in the controller; the service accepts only its non-null normalized
result and never applies a second TTL default. Construct one persistence record
and one audit event, call the atomic repository operation, and only then return
the raw bearer token.

- [ ] **Step 4: Run GREEN, review, and commit**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-capability.spec.ts
npm run typecheck:backend
git diff --check
git add backend/src/modules/sandbox-security/capability.service.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-capability.spec.ts docs/progress.md
git commit -m "feat(backend): manage sandbox security capabilities"
```

## P4-T2: Subject-Scoped Audit List and Fixed Retention Service

**Files:**

- Create: `backend/src/modules/sandbox-security/audit.service.ts`
- Modify: `backend/tests/sandbox-security-audit.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write service RED tests**

```ts
test("REQ-SBX-GENERAL-003 binds an audit cursor to subject and authorization scope", () => {
  assert.equal(typeof boundary.createSandboxSecurityAuditService, "function");
  const fixture = createAuditServiceFixture();
  const first = fixture.service.list({
    capability: SUBJECT_A_CAPABILITY,
    limit: 1
  });
  assert.equal(first.events.length, 1);
  assert.equal(typeof first.next_cursor, "string");
  assert.throws(
    () => fixture.service.list({
      capability: SUBJECT_B_CAPABILITY,
      cursor: first.next_cursor!,
      limit: 1
    }),
    hasSandboxSecurityServiceError("SANDBOX_SECURITY_AUDIT_CURSOR_INVALID")
  );
});
```

Add deterministic tie pagination, selected-page-before-read-event, audit write
failure returns no page, exact returned-count/next-cursor callback values,
defensive copies, fixed
`90 * 24 * 60 * 60 * 1000` cutoff, 1000-row purge, pre-cleanup recovery from
degraded, pre-cleanup failure 503/no purge, and fixed purge subject cases.
Default/maximum query limits and capability expiry are controller/admission
behaviors owned by P5-T2; this service accepts an already authorized capability
and a required normalized `limit`.
Assert invalid cursor throws the P1 cursor-invalid service error, purge
pre-cleanup throws storage-unavailable/retry 60, and other failures use internal.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(audit cursor|purge|retention|page)" \
  backend/tests/sandbox-security-audit.spec.ts
```

Expected: FAIL because the module lacks the audit service factory.

- [ ] **Step 3: Implement exact service methods**

```ts
export function createSandboxSecurityAuditService(input: Readonly<{
  repository: SandboxSecurityAuditRepository;
  hmac: SandboxSecurityHmacService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityAuditService;
```

Import the service interface from P1-T3 without redeclaring it. Decode/verify the cursor before repository selection, pass the authenticated
subject as the mandatory SQL predicate, encode the next cursor from the last
returned event only, and call maintenance pre-cleanup before the fixed purge.

- [ ] **Step 4: Run GREEN, review, and commit**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-audit.spec.ts
npm run typecheck:backend
git diff --check
git add backend/src/modules/sandbox-security/audit.service.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-audit.spec.ts docs/progress.md
git commit -m "feat(backend): serve sandbox security audit pages"
```

## P4-T3: Evaluation Orchestration and Idempotency

**Files:**

- Create: `backend/src/modules/sandbox-security/evaluation.service.ts`
- Create: `backend/tests/sandbox-security-evaluation.service.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `package.json`

- [ ] **Step 1: Write ordered fake-port RED tests**

```ts
test("REQ-SBX-GENERAL-003 fingerprints claims leases evaluates releases and completes in order", async () => {
  assert.equal(typeof boundary.createSandboxSecurityEvaluationService, "function");
  const fixture = createEvaluationServiceFixture({ claim: { kind: "claimed" } });
  const decision = await fixture.service.evaluate({
    capability: EVALUATE_CAPABILITY,
    idempotency_key: "0123456789abcdef",
    submission: FIXED_SUBMISSION
  });
  assert.deepEqual(fixture.calls, [
    "authorize.stage_profile",
    "simulation.build",
    "gateway.fingerprint",
    "hmac.idempotency_key",
    "maintenance.claim",
    "concurrency.acquire",
    "gateway.evaluate",
    "concurrency.release",
    "repository.complete"
  ]);
  assert.deepEqual(decision, FIXED_DECISION);
});
```

Add completed replay/no slot, in-progress/conflict/no slot, changed mode scope,
invalid fingerprint/no row, no available slot marks interrupted plus rejection,
Engine failure interruption, completion failure no Decision plus best-effort
interruption, invalid Engine/cached Decision, abort propagation, slot release
before persistence, 24-hour timestamps, request correlation, and elapsed audit
projection cases. These tests own the replay/conflict slot assertions moved from
P2-T4 and the Engine/best-effort interruption assertions moved from P3-T3.
Append this new spec to `test:backend` in the same step.
Assert fingerprint/Engine/persistence failures use internal, idempotency results
use the exact two 409-domain codes, no slot uses concurrency/retry 1, and claim
cleanup uses storage-unavailable/retry 60. Do not import Phase 5 errors.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-evaluation.service.spec.ts
```

Expected: FAIL because the module lacks the evaluation service factory.

- [ ] **Step 3: Implement the exact service signature and order**

```ts
export function createSandboxSecurityEvaluationService(input: Readonly<{
  authorizer: SandboxSecurityCapabilityAuthenticator;
  hmac: SandboxSecurityHmacService;
  idempotency_repository: SandboxSecurityIdempotencyRepository;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  concurrency: SandboxSecurityEngineConcurrencyLimiter;
  gateway: SandboxSecurityEvaluationGateway;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityEvaluationService;
```

Import the service interface and dependency contracts from P1-T3 without
redeclaring them. Implementation order is fixed: stage/profile grant; simulation context;
gateway fingerprint; idempotency-key HMAC; `maintenance.claim`; immediate return for
replay/conflicts; slot acquisition for `claimed`; Engine outside a transaction;
release in `finally` when Engine settles; normalized Decision;
completion/audit transaction; return. The controller owns the required
pre-body maintenance-health check; the service calls `maintenance.claim()` so a
tagged claim-cleanup failure also transitions health and surfaces the same
storage-unavailable error. Failed fingerprint, replay, and conflict never
acquire a slot. Slow-body admission is not observable here and is tested in
P5-T2 before this service is invoked.

- [ ] **Step 4: Run GREEN and Phase gates**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-evaluation.service.spec.ts
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/evaluation.service.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-evaluation.service.spec.ts package.json \
  docs/progress.md
git commit -m "feat(backend): orchestrate sandbox security evaluations"
```

Stop after P4-T3. HTTP body and header parsing remain Phase 5 work.
