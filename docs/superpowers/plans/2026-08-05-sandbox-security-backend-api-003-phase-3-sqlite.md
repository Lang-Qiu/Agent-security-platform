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

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(database|migration|SQLite)" \
  backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL because the existing module boundary lacks the database opener.

- [ ] **Step 3: Implement the database owner**

```ts
export interface SqliteSandboxSecurityDatabase {
  transaction<T>(operation: (database: DatabaseSync) => T): T;
  read<T>(operation: (database: DatabaseSync) => T): T;
  checkpointAndClose(): void;
  readonly state: "open" | "closed";
}

export function openSandboxSecuritySqliteDatabase(input: Readonly<{
  path: string;
  deployment_key_id: string;
  now: () => string;
}>): SqliteSandboxSecurityDatabase;
```

Validate the parent and main path before open; enable `WAL`, foreign keys, and
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

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts \
  backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-sqlite.spec.ts docs/progress.md
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
    /SANDBOX_SECURITY_INTERNAL_ERROR/
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

- [ ] **Step 3: Implement the repository port exactly**

```ts
export interface SandboxSecurityCapabilityRepository {
  issueWithAudit(
    record: Readonly<SandboxSecurityCapabilityPersistenceRecord>,
    event: Readonly<SandboxSecurityAuditEvent>
  ): void;
  findByTokenDigest(
    tokenDigest: `sha256:${string}`
  ): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null;
  revokeWithAudit(input: Readonly<{
    capability_id: string;
    revoked_at: string;
    create_event: (
      record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
    ) => Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null;
}
```

Prepared statements must name columns; child grants are inserted in one
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
Engine interruption, best-effort second interruption, invalid cached decision,
16 MiB bound, production-mode scope separation, 100-row claim cleanup,
4096-row startup/hourly cleanup, startup recovery event, claimed-without-slot
restart, cleanup rollback, and no replay after expiry.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-idempotency.spec.ts
```

Expected: FAIL because the existing module boundary lacks the repository
factory.

- [ ] **Step 3: Implement claim and transactional transitions**

```ts
export type SandboxSecurityIdempotencyClaimResult =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "completed"; response: SandboxSecurityDecision }>
  | Readonly<{ kind: "in_progress" }>
  | Readonly<{ kind: "fingerprint_conflict" }>;

export interface SandboxSecurityIdempotencyRepository {
  claim(input: Readonly<SandboxSecurityIdempotencyClaim>): SandboxSecurityIdempotencyClaimResult;
  complete(input: Readonly<SandboxSecurityIdempotencyCompletion>): void;
  interrupt(input: Readonly<SandboxSecurityIdempotencyInterruption>): void;
  rejectConcurrency(input: Readonly<SandboxSecurityIdempotencyInterruption>): void;
  recoverInProgress(now: string): number;
  cleanupExpired(now: string, limit: 100 | 4096): number;
}
```

Normalize cached decisions using the shared normalizer before return. Use
`BEGIN IMMEDIATE` for claim and every paired audit transition. Persist raw
idempotency keys nowhere.

- [ ] **Step 4: Implement exact maintenance state**

```ts
export interface SandboxSecurityIdempotencyMaintenance {
  state(): "healthy" | "degraded" | "closed";
  assertEvaluationAvailable(): void;
  runHourlyCleanup(): void;
  runPurgePreCleanup(): void;
  close(): void;
}
```

Startup cleanup must commit before `healthy`. Runtime claim/hourly cleanup
failure sets `degraded`; every evaluation/replay then returns storage 503 before
body/fingerprint/lookup. A committed hourly or purge pre-cleanup restores
`healthy`. `closed` never reopens. Schedule exactly one unref'ed hourly timer.

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
  backend/tests/sandbox-security-sqlite.spec.ts docs/progress.md
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
    read_event: FIXED_AUDIT_READ_EVENT
  });
  assert.equal(page.events.every((event) => event.subject_id === "subject-a"), true);
  assert.equal(page.events.some((event) => event.event_type === "audit_read"), false);
});
```

Add descending `(occurred_at,event_id)` ordering, tie pagination, `limit+1`,
post-normalization subject check, invalid stored JSON, typed-column/event JSON
cross-check, read-event insert failure, no current-page self-read, fixed 90-day
cutoff, 1000-row purge, `has_more`, purge/audit atomicity, and purge pre-cleanup
failure performs no audit deletion.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*audit" \
  backend/tests/sandbox-security-sqlite.spec.ts
```

Expected: FAIL at the missing factory export assertion.

- [ ] **Step 3: Implement the exact repository API**

```ts
export interface SandboxSecurityAuditRepository {
  append(event: Readonly<SandboxSecurityAuditEvent>): void;
  listAndRecordRead(input: Readonly<{
    visibility_subject_id: string;
    after: Readonly<{ occurred_at: string; event_id: string }> | null;
    limit: number;
    read_event: Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<{
    events: SandboxSecurityAuditEvent[];
    has_more: boolean;
  }>;
  purgeExpiredWithAudit(input: Readonly<{
    cutoff: string;
    limit: 1000;
    create_event: (deletedCount: number, hasMore: boolean) => SandboxSecurityAuditEvent;
  }>): Readonly<{ deleted_count: number; has_more: boolean }>;
}
```

Every public select includes `visibility_subject_id = :subject` in SQL and
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
