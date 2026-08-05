# Phase 3 SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add hardened single-node SQLite storage with exact v1 migrations,
atomic capability/idempotency/audit operations, restart recovery, and bounded
retention.

**Architecture:** One `SqliteSandboxSecurityDatabase` owns `DatabaseSync`, file
validation, pragmas, migrations, transactions, and lifecycle. Three repository
adapters expose domain operations rather than SQL handles. Idempotency
maintenance owns the process-local `healthy | degraded | closed` state and an
unref'ed hourly cleanup timer.

**Tech Stack:** Node 22 `node:sqlite`, Node `fs`, TypeScript ESM, temporary real
directories in `node:test`; no in-memory SQL substitute for adapter tests.

---

## Entry Gate

- [ ] Confirm Phase 2 is committed and reviewed.
- [ ] Verify `node:sqlite` and run Phase 2 gates:

```bash
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.close()'
npm run test:backend
npm run typecheck:backend
git diff --check
```

Every adapter test creates a private temporary parent with mode `0700`, closes
the database in `t.after`, and removes only its own temporary tree.

## P3-T1: Database File Boundary and Exact V1 Migration

**Files:**

- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts`
- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts`
- Create: `backend/tests/sandbox-security-sqlite.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `docs/architecture.md`
- Modify: `package.json`

- [ ] **Step 1: Write real-filesystem migration RED tests**

```ts
test("REQ-SBX-GENERAL-003 opens a mode-0600 WAL database with exact v1 tables", (t) => {
  assert.equal(typeof boundary.openSandboxSecuritySqliteDatabase, "function");
  const fixture = createPrivateDatabaseFixture();
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  t.after(() => database.checkpointAndClose());
  assert.equal(statSync(fixture.databasePath).mode & 0o777, 0o600);
  assert.equal(
    database.read((db) => db.prepare("PRAGMA journal_mode").get()!.journal_mode),
    "wal"
  );
  assert.deepEqual(database.read((db) => db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sandbox_security_%' ORDER BY name"
  ).all().map((row) => row.name)), [
    "sandbox_security_audit_events",
    "sandbox_security_capabilities",
    "sandbox_security_capability_profiles",
    "sandbox_security_capability_scopes",
    "sandbox_security_capability_stages",
    "sandbox_security_idempotency_records",
    "sandbox_security_metadata",
    "sandbox_security_schema_migrations"
  ]);
});
```

Add relative path, missing/non-directory parent, parent mode `0750`, database
symlink/FIFO/directory, wrong existing file mode, sidecar containment/mode,
deployment-key mismatch, newer schema, migration rollback, `quick_check`
failure fixture, foreign keys, busy timeout, all CHECK constraints, exact
indexes, and close/checkpoint cases.
Append this new spec to `test:backend` in the same step.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(database|migration|SQLite)" \
  backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL because the existing module boundary lacks the database opener.

- [ ] **Step 3: Implement the database owner**

```ts
export function openSandboxSecuritySqliteDatabase(input: Readonly<{
  path: string;
  deployment_key_id: string;
  now: () => string;
}>): SqliteSandboxSecurityDatabase;
```

Import the database port from P1-T3 without redeclaring it. Validate the parent and main path before open; enable `WAL`, foreign keys, and
`busy_timeout=5000`; apply/check `0600` on main/WAL/SHM after WAL creation and
each migration. Run `BEGIN IMMEDIATE`, the exact SQL schema from the approved
specification, deployment-key binding, `quick_check`, and rollback/close on
failure. `transaction` must reject nesting and use commit/rollback in `try` /
`catch` / `finally` without exposing `DatabaseSync` outside the callback.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(database|migration|SQLite)" \
  backend/tests/sandbox-security-sqlite.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Synchronize architecture, review, update progress, and commit**

Document the single `DatabaseSync` owner, private parent/file/sidecar boundary,
WAL pragmas, migration/integrity sequence, transaction API, and close ownership
in `docs/architecture.md`. Run `npm run test:backend` after the focused GREEN.

```bash
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-sqlite.spec.ts package.json \
  docs/architecture.md docs/progress.md
git commit -m "feat(backend): add sandbox security SQLite schema"
```

## P3-T2: Capability Repository Transactions and Restart Durability

**Files:**

- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts`
- Modify: `backend/tests/sandbox-security-sqlite.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write capability repository RED tests**

```ts
test("REQ-SBX-GENERAL-003 capability issue and audit insert are atomic", () => {
  assert.equal(typeof boundary.createSqliteSandboxSecurityCapabilityRepository, "function");
  const repository = createCapabilityRepositoryFixture();
  repository.issueWithAudit(FIXED_CAPABILITY_RECORD, FIXED_ISSUED_EVENT);
  assert.deepEqual(repository.findByTokenDigest(FIXED_TOKEN_DIGEST), FIXED_CAPABILITY_RECORD);
  assert.equal(repository.countAuditEvents("capability_issued"), 1);
  assert.throws(
    () => repository.issueWithAudit(SECOND_CAPABILITY_RECORD, malformedIssuedEvent()),
    hasSandboxSecurityServiceError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(repository.findByTokenDigest(SECOND_TOKEN_DIGEST), null);
});
```

Add digest-only lookup, normalized catalog order, returned defensive copies,
unknown token, restart reopen, `RESTRICT`, malformed row fail-closed, first
revoke timestamp, repeated revoke, unknown ID, revoke/audit rollback, and raw
token never appearing in main/WAL/SHM bytes.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*capability.*(atomic|restart|repository|revoke)" \
  backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL at the factory export assertion.

- [ ] **Step 3: Implement the Phase 1 repository port exactly**

```ts
export function createSqliteSandboxSecurityCapabilityRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityCapabilityRepository;
```

Import the port and persistence record from the P1-T3 type files; do not
redeclare them in the adapter. Prepared statements must name columns; child grants are inserted in one
transaction; read rows are fully normalized before return. Never expose token
digest/scope seed through the authorized/public record projection.

- [ ] **Step 4: Run GREEN, review, and commit**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*capability" \
  backend/tests/sandbox-security-sqlite.spec.ts
npm run typecheck:backend
git diff --check
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-sqlite.spec.ts docs/progress.md
git commit -m "feat(backend): persist sandbox security capabilities"
```

## P3-T3: Idempotency State Machine, Recovery, and Maintenance Health

**Files:**

- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-idempotency.repository.ts`
- Create: `backend/tests/sandbox-security-idempotency.spec.ts`
- Modify: `backend/tests/sandbox-security-sqlite.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `package.json`

- [ ] **Step 1: Write state-machine RED tests**

```ts
test("REQ-SBX-GENERAL-003 idempotency claims replays interrupts and conflicts exactly", () => {
  assert.equal(typeof boundary.createSqliteSandboxSecurityIdempotencyRepository, "function");
  const repository = createIdempotencyRepositoryFixture();
  assert.deepEqual(repository.claim(FIXED_CLAIM), { kind: "claimed" });
  assert.deepEqual(repository.claim(FIXED_CLAIM), { kind: "in_progress" });
  repository.complete(FIXED_COMPLETION);
  assert.deepEqual(repository.claim(FIXED_CLAIM), {
    kind: "completed",
    response: FIXED_DECISION
  });
  assert.deepEqual(repository.claim(CHANGED_FINGERPRINT_CLAIM), {
    kind: "fingerprint_conflict"
  });
});
```

Add expired delete-before-claim, interrupted reclaim preserving created/expiry,
completion/audit atomicity, replay/audit atomicity, concurrency interruption,
direct `interrupt()` transaction atomicity, invalid cached decision, 16 MiB
bound, production-mode scope separation, 100-row claim cleanup, 4096-row
startup/hourly cleanup, startup recovery event, claimed-without-slot restart,
cleanup rollback, and no replay after expiry. Engine interruption and
best-effort second interruption belong to the P4-T3 orchestration RED.

Append `backend/tests/sandbox-security-idempotency.spec.ts` to `test:backend` in
this same step.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-idempotency.spec.ts
```

Expected: FAIL because the existing module boundary lacks the repository
factory.

- [ ] **Step 3: Implement claim and transactional transitions against the Phase 1 port**

```ts
export function createSqliteSandboxSecurityIdempotencyRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityIdempotencyRepository;
```

Import every idempotency input/result/error/port from P1-T3; do not redeclare
them. Normalize cached decisions using the shared normalizer before return. Use
`BEGIN IMMEDIATE` for claim and every paired audit transition. Persist raw
idempotency keys nowhere. Throw the Phase 1 tagged claim-cleanup error only when
the 100-row cleanup in `claim()` rolls back; do not reuse it for lookup,
normalization, transition, audit, or general SQLite failures.

- [ ] **Step 4: Implement exact maintenance state**

```ts
export function createSandboxSecurityIdempotencyMaintenance(input: Readonly<{
  repository: SandboxSecurityIdempotencyRepository;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityIdempotencyMaintenance;
```

Import the maintenance port from P1-T3. Construction performs recovery and startup cleanup before `healthy`, then
schedules exactly one hourly interval and calls `unref()` once. `claim()` wraps
the repository's atomic cleanup-plus-claim: only its tagged cleanup failure
sets `degraded`. Hourly or purge-pre-cleanup failures also set `degraded`; a
later committed hourly or purge pre-cleanup restores `healthy`. `closed` never
reopens, and `close()` cancels exactly the maintenance interval. The maintenance
object never closes SQLite and never schedules audit-retention cleanup.
`assertEvaluationAvailable`, tagged claim-cleanup failure, failed hourly/purge
cleanup, and `closed` map through the P1 service-error factory to exact
`SANDBOX_SECURITY_STORAGE_UNAVAILABLE` with retry 60. Other repository failures
map to `SANDBOX_SECURITY_INTERNAL_ERROR`; no P3 file imports an HTTP class or
classifies error messages.
For startup recovery it passes a typed `create_event(record)` callback that
uses the already constructed projector, `runtime.nextAuditEventId()`, the
runtime wall clock, the row's stored correlation fields, zero elapsed time, and
`startup_recovery`. Recovery never hand-builds event JSON.

- [ ] **Step 5: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-idempotency.spec.ts \
  backend/tests/sandbox-security-sqlite.spec.ts
npm run typecheck:backend
```

- [ ] **Step 6: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-idempotency.repository.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-idempotency.spec.ts \
  backend/tests/sandbox-security-sqlite.spec.ts package.json docs/progress.md
git commit -m "feat(backend): persist sandbox security idempotency"
```

## P3-T4: Subject-Scoped Audit Read and Retention Repository

**Files:**

- Create: `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts`
- Modify: `backend/tests/sandbox-security-sqlite.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write audit repository RED tests**

```ts
test("REQ-SBX-GENERAL-003 audit selection cannot return another subject", () => {
  assert.equal(typeof boundary.createSqliteSandboxSecurityAuditRepository, "function");
  const repository = createAuditRepositoryFixtureWithTwoSubjects();
  const page = repository.listAndRecordRead({
    visibility_subject_id: "subject-a",
    after: null,
    limit: 100,
    create_event: ({ returned_count, next_cursor_present }) =>
      fixedAuditReadEvent({ returned_count, next_cursor_present })
  });
  assert.equal(page.events.every((event) => event.subject_id === "subject-a"), true);
  assert.equal(page.events.some((event) => event.event_type === "audit_read"), false);
});
```

Add descending `(occurred_at,event_id)` ordering, tie pagination, `limit+1`,
post-normalization subject check, invalid stored JSON, typed-column/event JSON
cross-check, result-aware read-event callback, read-event insert failure, no
current-page self-read, fixed 90-day
cutoff input, 1000-row purge, `has_more`, and purge/audit atomicity. Maintenance
pre-cleanup failure and degraded recovery belong to P4-T2, where the audit
service composes maintenance with this repository.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*audit" \
  backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL at the missing factory export assertion.

- [ ] **Step 3: Implement the exact Phase 1 repository API**

```ts
export function createSqliteSandboxSecurityAuditRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityAuditRepository;
```

Import the port from P1-T3 rather than redeclaring it. In the same transaction,
select the page, compute returned count/next-cursor presence, invoke the typed
event callback, require an `audit_read` event whose count/presence fields equal
those computed values, insert it, and only then return the page. Every
public select includes `visibility_subject_id = :subject` in SQL and
checks normalized events again before return. Bind cutoff internally from the
service clock; accept no caller-provided retention interval.

- [ ] **Step 4: Run GREEN and Phase gates**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-sqlite.spec.ts
npm run test:backend
npm run typecheck:backend
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-sqlite.spec.ts docs/progress.md
git commit -m "feat(backend): persist sandbox security audit events"
```

Stop after P3-T4 with every temporary database closed.
