# Phase 2 Backend Audit and SQLite v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Persist and authenticate content-free OpenClaw enforcement audit
events through a strict internal route while preserving every GENERAL-003 v1
row, public reader, TTL, retention, and listener boundary.

**Architecture:** Startup migrates the single SQLite database to schema v2,
adding a private scope, two event type literals, and `event_schema`. Legacy and
enforcement repositories use opposite schema predicates. A dedicated
capability branch and audit service construct backend-owned events; the
controller performs bounded authentication-first HTTP admission.

**Tech Stack:** Node.js `node:sqlite`, TypeScript ESM, existing sandbox-security
module/controller/error patterns, shared private exact normalizers,
`node:test`, real `node:http` integration tests.

---

## Entry Gate

- [ ] Confirm every Phase 1 task is committed and reviewed.
- [ ] Run:

```bash
npm run test:shared
npm run test:backend
TMPDIR=/tmp npm run test:repo
npm run typecheck:backend
git diff --check
```

Expected: Phase 1 green; unrelated worktree changes preserved.

## Locked Storage and HTTP Contract

```text
schema version: 2
event schemas:
  sandbox-security-audit-event.v1
  sandbox-security-enforcement-audit-event.v1
new scope:
  sandbox_security:enforcement:audit:write
new event types:
  enforcement_completed
  enforcement_interrupted
body max: 65536 bytes
body deadline: 5000 ms
route limiter: capacity 2, refill 1/6 second
accepted: 201 + status=accepted
replay: 200 + status=replayed + first stored occurred_at
conflict: 409
storage unavailable: 503
```

### Task P2-T1: SQLite v1-to-v2 Migration

**Files:**
- Modify: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts`
- Modify: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts`
- Modify: `backend/tests/sandbox-security-sqlite.spec.ts`

- [ ] **Step 1: Write failing migration and preservation tests**

Build a real v1 fixture from the exported immutable v1 SQL, insert one legacy
capability/scope/audit row, close it, then open through the production factory.
Assert:

```ts
assert.equal(boundary.SANDBOX_SECURITY_SCHEMA_VERSION, 2);
assert.deepEqual(
  db.read((sqlite) => sqlite
    .prepare("SELECT version FROM sandbox_security_schema_migrations ORDER BY version")
    .all()),
  [{ version: 1 }, { version: 2 }]
);
assert.ok(tableSql.includes("event_schema TEXT NOT NULL"));
assert.ok(tableSql.includes("'sandbox-security-enforcement-audit-event.v1'"));
assert.ok(scopeSql.includes("'sandbox_security:enforcement:audit:write'"));
assert.equal(legacyRow.event_schema, "sandbox-security-audit-event.v1");
```

Also assert all old JSON/IDs/timestamps are byte-identical, old indexes and
foreign keys remain, unknown version 3 fails, drifted v1 fails before mutation,
partial v2 fails, rerunning validated v2 is a no-op, and forced copy failure
rolls back to intact v1.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test --test-name-pattern="v1-to-v2|schema v2" backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL because schema version is 1 and `event_schema` is absent; no
environment/import error is accepted.

- [ ] **Step 3: Implement exact transactional migration**

Keep `SANDBOX_SECURITY_V1_SCHEMA_SQL` immutable. Add a v2 audit table whose
critical columns are:

```sql
CREATE TABLE sandbox_security_audit_events_v2 (
  event_id TEXT PRIMARY KEY,
  event_schema TEXT NOT NULL CHECK (event_schema IN (
    'sandbox-security-audit-event.v1',
    'sandbox-security-enforcement-audit-event.v1')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'evaluation_completed', 'evaluation_replayed',
    'evaluation_interrupted', 'request_rejected',
    'capability_issued', 'capability_revoked',
    'audit_read', 'audit_purged',
    'enforcement_completed', 'enforcement_interrupted')),
  visibility_subject_id TEXT NOT NULL
    CHECK (length(visibility_subject_id) BETWEEN 1 AND 64),
  authorization_scope_id TEXT,
  capability_id TEXT REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK (length(event_json) BETWEEN 2 AND 65536)
);
```

Rebuild `sandbox_security_capability_scopes` with the old two literals plus the
private scope. At exclusive startup: verify exact v1 objects/row `1`, disable
foreign-key enforcement only for the bounded rebuild, `BEGIN IMMEDIATE`, create
v2 tables, copy old rows with the legacy event schema, rebuild the same indexes,
swap, insert migration row `2`, run `foreign_key_check`, commit, re-enable
foreign keys, and validate exact v2 definitions. Roll back/re-enable on every
throw. Existing v2 startup validates definitions and migration rows `[1,2]`.

- [ ] **Step 4: Run GREEN and all SQLite tests**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-sqlite.spec.ts
npm run typecheck:backend
git diff --check
```

Expected: migration/preservation/rollback matrices pass; mode `0600`, WAL,
retention indexes, and existing repository tests remain green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts \
  backend/tests/sandbox-security-sqlite.spec.ts
git commit -m "feat(sandbox): migrate security audit storage to v2"
```

### Task P2-T2: Dual-Schema Audit Repositories

**Files:**
- Create: `backend/src/modules/sandbox-security/ports/enforcement-audit.repository.ts`
- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-enforcement-audit.repository.ts`
- Create: `backend/tests/sandbox-security-enforcement-audit-repository.spec.ts`
- Modify: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts`
- Modify: `backend/src/modules/sandbox-security/ports/audit.repository.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `backend/tests/sandbox-security-audit.spec.ts`
- Modify: `backend/tests/sandbox-security-sqlite.spec.ts`

- [ ] **Step 1: Write failing replay/filter/conflict tests**

Use a real v2 database. Append an enforcement candidate at time A, then append
the same candidate at time B:

```ts
assert.deepEqual(repository.append({ candidate, occurred_at: TIME_A }), {
  event_id: candidate.event_id,
  status: "accepted",
  occurred_at: TIME_A
});
assert.deepEqual(repository.append({ candidate, occurred_at: TIME_B }), {
  event_id: candidate.event_id,
  status: "replayed",
  occurred_at: TIME_A
});
```

Assert a changed action/profile/identity under the same event ID throws the
idempotency conflict service error. Insert a legacy v1 and all three private
durable variants, then prove public `listAndRecordRead` returns only v1 rows and
the private repository reads only private rows. Assert purge validates and
removes expired rows from both schemas, event JSON stays <=65536 bytes, subject
SQL predicate remains in the public query, and corruption in either schema
fails closed.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-repository.spec.ts
```

Expected: FAIL because the enforcement repository factory is absent.

- [ ] **Step 3: Implement the repository port and adapters**

Use the exact port:

```ts
export interface SandboxSecurityEnforcementAuditRepository {
  append(input: Readonly<{
    candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
    occurred_at: string;
  }>): Readonly<{
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}
```

Normalize candidate and timestamp before the transaction. On first insert,
compose the full event and insert `event_schema`. On existing ID, read and
normalize the stored full event, remove only `occurred_at`, canonicalize both
content-free candidates with deterministic property order, compare bytes, and
return stored time or conflict. Never hash raw content.

Modify public list SQL to require:

```sql
WHERE event_schema = 'sandbox-security-audit-event.v1'
  AND visibility_subject_id = :subject
```

All legacy inserts explicitly set the legacy schema. Purge selects both and
dispatches normalization by `event_schema` before deleting.

- [ ] **Step 4: Run GREEN and regressions**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-repository.spec.ts backend/tests/sandbox-security-audit.spec.ts backend/tests/sandbox-security-sqlite.spec.ts
npm run typecheck:backend
git diff --check
```

Expected: replay/filter/corruption/purge pass; legacy page bytes remain stable.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sandbox-security/ports/enforcement-audit.repository.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-enforcement-audit.repository.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts \
  backend/src/modules/sandbox-security/ports/audit.repository.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-enforcement-audit-repository.spec.ts \
  backend/tests/sandbox-security-audit.spec.ts backend/tests/sandbox-security-sqlite.spec.ts
git commit -m "feat(sandbox): add enforcement audit repositories"
```

### Task P2-T3: Private Capability Provisioning and Authentication

**Files:**
- Modify: `backend/src/modules/sandbox-security/ports/capability.repository.ts`
- Modify: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts`
- Modify: `backend/src/modules/sandbox-security/capability-authorizer.ts`
- Modify: `backend/src/modules/sandbox-security/capability.service.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `backend/tests/sandbox-security-enforcement-audit-capability.spec.ts`
- Modify: `backend/tests/sandbox-security-capability.spec.ts`
- Modify: `backend/tests/sandbox-security-admin.controller.spec.ts`

- [ ] **Step 1: Write failing issuance/auth/isolation tests**

Through the existing admin controller, submit the new schema and assert HTTP
201 `ApiResponse<SandboxSecurityEnforcementAuditCapabilityIssueResult>`, one
raw token, exact one-scope/all-stage/one-profile grant, backend composition,
strict timestamps, and an enforcement-schema capability-issued audit row.
Assert:

```ts
assert.throws(
  () => authenticator.requireScope(capability, "sandbox_security:evaluate"),
  isForbidden
);
assert.deepEqual(
  authenticator.requireEnforcementAuditGrant(capability, {
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION
  }),
  capability
);
```

Cover invalid/new scope through the legacy v1 issue schema, multiple scopes,
wrong stage/profile/composition, expired/revoked token, TTL 60/3600, token
one-time return, no token in SQLite/audit/log errors, and existing v1 issue
response unchanged.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test --test-name-pattern="enforcement audit capability|public v1 scope" backend/tests/sandbox-security-enforcement-audit-capability.spec.ts backend/tests/sandbox-security-capability.spec.ts backend/tests/sandbox-security-admin.controller.spec.ts
```

Expected: FAIL because service/authenticator/admin dispatch lack the private
branch; old v1 tests pass.

- [ ] **Step 3: Implement minimum private branch**

Add repository storage types whose private scope is not assignable to the
public v1 union. Add:

```ts
interface SandboxSecurityCapabilityService {
  issue(
    request: Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>
  ): Readonly<SandboxSecurityCapabilityIssueResult>;
  issueEnforcementAudit(
    request: Readonly<SandboxSecurityEnforcementAuditCapabilityIssueRequest>
  ): Readonly<SandboxSecurityEnforcementAuditCapabilityIssueResult>;
  revoke(capabilityId: string): Readonly<SandboxSecurityCapabilityPublicRecord>;
}
```

`issueEnforcementAudit` fixes scope/stages/composition, creates one profile,
uses existing opaque token/HMAC/TTL rules, and inserts capability plus private
capability-issued event in one transaction. The admin controller authenticates
and reads the body exactly once, dispatches only by exact `schema_version`, and
wraps the branch-specific result. OpenClaw never receives admin credentials.

Authenticator `requireEnforcementAuditGrant` requires exactly one private
scope, all stages, one matching profile, non-expired/non-revoked state, and
current module composition. Public evaluation/read authorizers reject it.

- [ ] **Step 4: Run GREEN and backend regression**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-capability.spec.ts backend/tests/sandbox-security-capability.spec.ts backend/tests/sandbox-security-admin.controller.spec.ts
npm run test:backend
npm run typecheck:backend
git diff --check
```

Expected: both issue schemas pass and no v1 contract snapshot changes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sandbox-security/ports/capability.repository.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts \
  backend/src/modules/sandbox-security/capability-authorizer.ts \
  backend/src/modules/sandbox-security/capability.service.ts \
  backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts \
  backend/src/modules/sandbox-security/sandbox-security.types.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-enforcement-audit-capability.spec.ts \
  backend/tests/sandbox-security-capability.spec.ts \
  backend/tests/sandbox-security-admin.controller.spec.ts
git commit -m "feat(sandbox): provision enforcement audit capabilities"
```

### Task P2-T4: Enforcement Audit Application Service

**Files:**
- Create: `backend/src/modules/sandbox-security/enforcement-audit.service.ts`
- Create: `backend/tests/sandbox-security-enforcement-audit-service.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write failing service tests with a recording repository**

Test completed/interrupted projection, backend identity/time injection,
candidate omission of time, accepted/replayed acknowledgements, first-time
replay timestamp, conflict/storage error mapping, exact event/ack keys, and no
subject/time/token/raw fields accepted from the request.

```ts
const ack = await service.appendEnforcementEvent(completedRequest, identity);
assert.deepEqual(ack, {
  schema_version: "sandbox-security-enforcement-audit-ack.v1",
  event_id: completedRequest.event_id,
  status: "accepted",
  occurred_at: NOW
});
assert.equal("occurred_at" in recordedAppend.candidate, false);
```

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-service.spec.ts
```

Expected: FAIL because the service factory is not exported.

- [ ] **Step 3: Implement the exact service**

```ts
export interface SandboxSecurityEnforcementAuditService {
  appendEnforcementEvent(
    request: Readonly<SandboxSecurityEnforcementAuditRequest>,
    identity: Readonly<OpenClawEnforcementAuditIdentity>
  ): Promise<Readonly<OpenClawEnforcementAuditAck>>;
}
```

Validate dependencies at construction. Re-normalize the request, deep-freeze a
candidate with backend identity and private schema, obtain `runtime.now()` once,
call the synchronous repository append inside the async service boundary, and
build an ack whose ID/status/time exactly match the repository result. Import
the acknowledgement type and normalizer from `shared/index.ts`; do not define a
backend-private copy. Map only stable domain errors and never stringify input.
Tests use `await`/`assert.rejects` to prove synchronous repository throws and
future asynchronous service failures become rejected Promises rather than
escaping a controller await.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-service.spec.ts
npm run typecheck:backend
git diff --check
```

Expected: complete service matrix passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sandbox-security/enforcement-audit.service.ts \
  backend/src/modules/sandbox-security/sandbox-security.types.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-enforcement-audit-service.spec.ts
git commit -m "feat(sandbox): persist enforcement audit events"
```

### Task P2-T5: Internal Controller, Module Dispatch, and Real HTTP

**Files:**
- Create: `backend/src/modules/sandbox-security/sandbox-security-enforcement-audit.controller.ts`
- Create: `backend/tests/sandbox-security-enforcement-audit-controller.spec.ts`
- Create: `tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts`
- Modify: `backend/src/modules/sandbox-security/http-admission.ts`
- Modify: `backend/src/modules/sandbox-security/token-bucket.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `backend/src/internal-app.module.ts`
- Modify: `backend/tests/main.spec.ts`
- Modify: `backend/tests/runtime-dependencies.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing admission and real-listener tests**

Controller tests assert exact order with spies:

```text
bucket -> bearer auth -> private scope -> JSON media -> 65536/5000 body
-> exact normalize -> stage/profile/composition grant -> service -> envelope
```

Cover 401 before body read, 403 wrong scope/binding, 400 malformed/extra,
408 timeout, 413 declared/chunked overflow with response-safe close, 415 media,
429 capacity `2`/refill `1/6s`, 503 storage, 201 accepted, 200 replay, and 409
conflict. Real HTTP tests start both listeners and prove the route is internal
only, shares one module/database, and returns no raw input on every error.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-controller.spec.ts tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts
```

Expected: FAIL because controller/module dispatch is absent; route matcher
tests from Phase 1 remain green.

- [ ] **Step 3: Implement controller and composition**

Use:

```ts
export interface SandboxSecurityEnforcementAuditController {
  enforcementAudit(
    request: IncomingMessage,
    requestId: string
  ): Promise<HttpResponse>;
}
```

Create a dedicated token bucket with canonical parameters; do not reuse the
administrator credential or share mutable bucket state. Reuse existing strict
body reader/error envelope/close-after-response behavior. Authenticate before
reading, normalize, authorize grant equality, await the service, then use
`status === "accepted" ? 201 : 200`.

Add exactly one `enforcementAudit` switch branch in `InternalAppModule`. Extend
`SandboxSecurityModule` with a required enforcement audit controller and wire
repository/service/controller before listener startup. Production close still
owns one database and remains idempotent.

Register the new tests in `test:backend` and the aggregate OpenClaw script.

- [ ] **Step 4: Run Phase 2 GREEN gate**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-controller.spec.ts tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts
npm run test:shared
npm run test:backend
TMPDIR=/tmp npm run test:repo
npm run typecheck:backend
git diff --check
```

Expected: all backend matrices pass; public v1 and Track 1 routes remain
unchanged.

- [ ] **Step 5: Commit and stop Phase 2**

```bash
git add backend/src/modules/sandbox-security/sandbox-security-enforcement-audit.controller.ts \
  backend/src/modules/sandbox-security/http-admission.ts \
  backend/src/modules/sandbox-security/token-bucket.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/internal-app.module.ts \
  backend/tests/sandbox-security-enforcement-audit-controller.spec.ts \
  backend/tests/main.spec.ts backend/tests/runtime-dependencies.spec.ts \
  tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts package.json
git commit -m "feat(sandbox): accept OpenClaw enforcement audit events"
```

## Phase 2 Exit Gate

- [ ] v1 fixture migrates transactionally and rerun v2 is stable.
- [ ] Public v1 query can never return a private event schema.
- [ ] Capability issue/auth and audit request types remain disjoint from public
  v1 unions.
- [ ] Replay excludes only server time; conflict includes identity and every
  request field.
- [ ] Internal route status/admission/order tests and real HTTP tests pass.
- [ ] No raw token/content appears in database, events, errors, or tests.
- [ ] Review has no unresolved Critical or Important finding.

Proceed only to Phase 3. Do not create OpenClaw patch files in this Phase.
