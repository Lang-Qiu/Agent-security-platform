# Phase 4 Application Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Implement content-free audit projection and the capability, audit,
and evaluation application workflows using injected domain ports.

**Architecture:** Services own orchestration order and transaction intent but
never inspect SQL or Engine internals. Audit projection is a pure exact-union
builder. Evaluation fingerprints before claim, acquires an Engine slot only for
a new/reclaimed claim, and returns a Decision only after durable completion and
audit commit.

**Tech Stack:** TypeScript ESM, `node:test`, fake repositories/gateways/clocks,
shared normalizers, Phase 2 controls, Phase 3 repository ports.

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

## P4-T1: Exact Content-Free Audit Projection

**Files:**

- Create: `backend/src/modules/sandbox-security/audit-projector.ts`
- Create: `backend/tests/sandbox-security-audit.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write projector RED tests**

```ts
test("REQ-SBX-GENERAL-003 projects a completed Decision without content", () => {
  assert.equal(typeof boundary.createSandboxSecurityEvaluationCompletedAudit, "function");
  const event = boundary.createSandboxSecurityEvaluationCompletedAudit!({
    event_id: FIXED_AUDIT_ID,
    occurred_at: FIXED_NOW,
    subject_id: "subject-a",
    authorization_scope_id: FIXED_SCOPE,
    capability_id: FIXED_CAPABILITY_ID,
    composition_binding: "sandbox-security-production-composition.v1:rule_only",
    elapsed_ms: 17,
    decision: FIXED_DECISION
  });
  assert.equal(event.request_id, FIXED_DECISION.request_id);
  assert.equal(event.verdict, FIXED_DECISION.verdict);
  assert.deepEqual(event.category_counts, ALL_CATEGORY_COUNTS);
  assert.deepEqual(event.detector_run_status_counts, ALL_RUN_STATUS_COUNTS);
  assert.doesNotMatch(JSON.stringify(event), /RAW_SENTINEL|source_token|evidence_ref/);
});
```

Add replay recomputation, interrupted codes, evaluation/audit-read rejection
matrices, issue/revoke/read/purge ownership, all-zero counts, multiple counts,
elapsed floor/clamp, exact keys, catalog order, defensive copies, and prohibited
key/value sentinel scans.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-audit.spec.ts
```

Expected: FAIL because the module boundary lacks the projector factory.

- [ ] **Step 3: Implement explicit variant builders**

```ts
export function createSandboxSecurityEvaluationCompletedAudit(
  input: Readonly<SandboxSecurityEvaluationAuditInput>
): Readonly<SandboxSecurityAuditEvent>;

export function createSandboxSecurityEvaluationReplayedAudit(
  input: Readonly<SandboxSecurityEvaluationAuditInput>
): Readonly<SandboxSecurityAuditEvent>;

export function createSandboxSecurityEvaluationInterruptedAudit(
  input: Readonly<SandboxSecurityInterruptionAuditInput>
): Readonly<SandboxSecurityAuditEvent>;

export function createSandboxSecurityRequestRejectedAudit(
  input: Readonly<SandboxSecurityRejectionAuditInput>
): Readonly<SandboxSecurityAuditEvent>;
```

Also implement exact issue, revoke, audit-read, and purge builders. Construct
each returned object field-by-field; never spread a request, Decision, stored
row, error, or provider value. Normalize the completed/replayed Decision before
counting findings/runs and normalize the final event before return.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-audit.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/audit-projector.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-audit.spec.ts docs/progress.md
git commit -m "feat(backend): project sandbox security audit events"
```

## P4-T2: Capability Issue and Revoke Service

**Files:**

- Create: `backend/src/modules/sandbox-security/capability.service.ts`
- Modify: `backend/tests/sandbox-security-capability.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write service RED tests with a recording repository**

```ts
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
first/repeated revoke, limiter deletion after revoke, and returned exact DTO
cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(issues|revoke|bearer|digest)" \
  backend/tests/sandbox-security-capability.spec.ts
```

Expected: FAIL at the missing service factory export.

- [ ] **Step 3: Implement the specification signature**

```ts
export interface SandboxSecurityCapabilityService {
  issue(
    request: Readonly<SandboxSecurityCapabilityIssueRequest>
  ): Readonly<SandboxSecurityCapabilityIssueResult>;
  revoke(
    capabilityId: string
  ): Readonly<SandboxSecurityCapabilityPublicRecord>;
}

export function createSandboxSecurityCapabilityService(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  runtime: SandboxSecurityRuntimePort;
  remove_capability_limiter: (capabilityId: string) => void;
}>): SandboxSecurityCapabilityService;
```

Call the already-tested DTO normalizer before service entry in the controller;
the service accepts only its normalized result. Construct one persistence
record and one audit event, call the atomic repository operation, and only then
return the raw bearer token.

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

## P4-T3: Subject-Scoped Audit List and Fixed Retention Service

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
    /SANDBOX_SECURITY_AUDIT_CURSOR_INVALID/
  );
});
```

Add default/maximum limit, deterministic tie pagination, cursor expiry via
capability auth, selected-page-before-read-event, audit write failure returns
no page, defensive copies, fixed `90 * 24 * 60 * 60 * 1000` cutoff, 1000-row
purge, pre-cleanup recovery from degraded, pre-cleanup failure 503/no purge,
and fixed purge subject cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(audit cursor|purge|retention|page)" \
  backend/tests/sandbox-security-audit.spec.ts
```

Expected: FAIL because the module lacks the audit service factory.

- [ ] **Step 3: Implement exact service methods**

```ts
export interface SandboxSecurityAuditService {
  list(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    cursor?: string;
    limit: number;
  }>): Readonly<SandboxSecurityAuditPage>;
  purgeExpired(): Readonly<SandboxSecurityAuditPurgeResult>;
}
```

Decode/verify the cursor before repository selection, pass the authenticated
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

## P4-T4: Evaluation Orchestration and Idempotency

**Files:**

- Create: `backend/src/modules/sandbox-security/evaluation.service.ts`
- Create: `backend/tests/sandbox-security-evaluation.service.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

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
    "repository.claim",
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
projection cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-evaluation.service.spec.ts
```

Expected: FAIL because the module lacks the evaluation service factory.

- [ ] **Step 3: Implement the exact service signature and order**

```ts
export interface SandboxSecurityEvaluationService {
  evaluate(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    idempotency_key: string;
    submission: SandboxSecurityRequest;
    signal?: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityDecision>>;
}
```

Implementation order is fixed: stage/profile grant; simulation context;
gateway fingerprint; idempotency-key HMAC; claim; immediate return for
replay/conflicts; slot acquisition for `claimed`; Engine outside a transaction;
release in `finally` when Engine settles; normalized Decision;
completion/audit transaction; return. The controller owns the required
pre-body maintenance-health check; a claim-cleanup failure still surfaces the
same storage-unavailable error from the repository. Failed fingerprint, replay,
conflict, and slow body never acquire a slot.

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
  backend/tests/sandbox-security-evaluation.service.spec.ts docs/progress.md
git commit -m "feat(backend): orchestrate sandbox security evaluations"
```

Stop after P4-T4. HTTP body and header parsing remain Phase 5 work.
