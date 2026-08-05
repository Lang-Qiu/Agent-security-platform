import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityCapabilityPersistenceRecord
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityCapabilityRepository } from "../src/modules/sandbox-security/ports/capability.repository.ts";

const FIXED_DEPLOYMENT_KEY_ID =
  "deployment-key:hmac-sha256:" + "a".repeat(64);

const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000001";
const SECOND_CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000002";
const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const TOKEN_DIGEST = `sha256:${"1".repeat(64)}` as `sha256:${string}`;
const SECOND_TOKEN_DIGEST = `sha256:${"2".repeat(64)}` as `sha256:${string}`;
const SCOPE_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SECOND_SCOPE_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 33);
const ISSUED_AT = "2026-08-05T00:00:00.000Z";
const EXPIRES_AT = "2026-08-05T00:15:00.000Z";

function capabilityRecord(
  overrides: Partial<SandboxSecurityCapabilityPersistenceRecord> = {}
): SandboxSecurityCapabilityPersistenceRecord {
  return {
    capability_id: CAPABILITY_ID,
    subject_id: "operator:alpha",
    token_digest: TOKEN_DIGEST,
    scope_seed: new Uint8Array(SCOPE_SEED),
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: [
      "sandbox-security-balanced.v1",
      "sandbox-security-strict.v1"
    ],
    issued_at: ISSUED_AT,
    expires_at: EXPIRES_AT,
    revoked_at: null,
    ...overrides
  };
}

function capabilityIssuedEvent(
  record: SandboxSecurityCapabilityPersistenceRecord,
  eventId = "audit:00000000-0000-4000-8000-000000000001"
): SandboxSecurityAuditEvent {
  return {
    schema_version: "sandbox-security-audit-event.v1",
    event_id: eventId,
    event_type: "capability_issued",
    occurred_at: record.issued_at,
    subject_id: record.subject_id,
    authorization_scope_id: "authscope:hmac-sha256:" + "a".repeat(64),
    capability_id: record.capability_id,
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: [
      "sandbox-security-balanced.v1",
      "sandbox-security-strict.v1"
    ],
    issued_at: record.issued_at,
    expires_at: record.expires_at
  };
}

function capabilityRepository(
  fixture: Readonly<{ parentPath: string; databasePath: string }>,
  t: { after(callback: () => void): void }
): Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  database: ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>>;
}> {
  const database = openDatabase(fixture, t);
  const factory = (
    boundary as unknown as {
      createSqliteSandboxSecurityCapabilityRepository?: (input: Readonly<{
        database: ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>>;
      }>) => SandboxSecurityCapabilityRepository;
    }
  ).createSqliteSandboxSecurityCapabilityRepository;
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  return { repository, database };
}

function assertInternalError(error: unknown): boolean {
  assert.equal(
    (error as { code?: unknown } | null)?.code,
    "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  return true;
}

function createPrivateDatabaseFixture(): Readonly<{
  parentPath: string;
  databasePath: string;
}> {
  const parentPath = mkdtempSync(join(tmpdir(), "sandbox-security-sqlite-"));
  mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  return { parentPath, databasePath: join(parentPath, "security.db") };
}

function closeAndRemove(
  parentPath: string,
  database: { checkpointAndClose(): void; readonly state: string } | null
): void {
  try {
    if (database !== null && database.state === "open") {
      database.checkpointAndClose();
    }
  } finally {
    rmSync(parentPath, { recursive: true, force: true });
  }
}

function openDatabase(
  fixture: Readonly<{ parentPath: string; databasePath: string }>,
  t: { after(callback: () => void): void },
  deploymentKeyId = FIXED_DEPLOYMENT_KEY_ID
): ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>> {
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: deploymentKeyId,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  t.after(() => closeAndRemove(fixture.parentPath, database));
  return database;
}

function assertOpenRejected(input: Readonly<{
  path: string;
  deployment_key_id?: string;
  now?: () => string;
}>): void {
  assert.throws(() =>
    boundary.openSandboxSecuritySqliteDatabase!({
      path: input.path,
      deployment_key_id: input.deployment_key_id ?? FIXED_DEPLOYMENT_KEY_ID,
      now: input.now ?? (() => "2026-08-05T00:00:00.000Z")
    })
  );
}

test("REQ-SBX-GENERAL-003 opens a mode-0600 WAL database with exact v1 tables", (t) => {
  assert.equal(typeof boundary.openSandboxSecuritySqliteDatabase, "function");
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);

  assert.equal(statSync(fixture.databasePath).mode & 0o777, 0o600);
  assert.equal(
    database.read((db) => db.prepare("PRAGMA journal_mode").get()!.journal_mode),
    "wal"
  );
  assert.deepEqual(
    database
      .read((db) =>
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sandbox_security_%' ORDER BY name"
          )
          .all()
      )
      .map((row) => (row as { name: string }).name),
    [
      "sandbox_security_audit_events",
      "sandbox_security_capabilities",
      "sandbox_security_capability_profiles",
      "sandbox_security_capability_scopes",
      "sandbox_security_capability_stages",
      "sandbox_security_idempotency_records",
      "sandbox_security_metadata",
      "sandbox_security_schema_migrations"
    ]
  );
});

test("REQ-SBX-GENERAL-003 rejects relative paths and unsafe parents", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  assertOpenRejected({ path: "relative-security.db" });
  assertOpenRejected({ path: join(fixture.parentPath, "missing", "security.db") });

  const parentFile = join(fixture.parentPath, "not-a-directory");
  writeFileSync(parentFile, "x", { mode: 0o600 });
  assertOpenRejected({ path: join(parentFile, "security.db") });

  chmodSync(fixture.parentPath, 0o750);
  assertOpenRejected({ path: join(fixture.parentPath, "mode.db") });
});

test("REQ-SBX-GENERAL-003 rejects unsafe main files and normalizes an existing file mode", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  const target = join(fixture.parentPath, "target.db");
  writeFileSync(target, "not-a-database", { mode: 0o600 });
  symlinkSync(target, fixture.databasePath);
  assertOpenRejected({ path: fixture.databasePath });
  rmSync(fixture.databasePath, { force: true });

  mkdirSync(fixture.databasePath);
  assertOpenRejected({ path: fixture.databasePath });
  rmSync(fixture.databasePath, { recursive: true, force: true });

  const fifoPath = join(fixture.parentPath, "security.fifo");
  execFileSync("mkfifo", [fifoPath]);
  assertOpenRejected({ path: fifoPath });
  rmSync(fifoPath, { force: true });

  const initial = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  initial.checkpointAndClose();
  chmodSync(fixture.databasePath, 0o644);
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  t.after(() => closeAndRemove(fixture.parentPath, database));
  assert.equal(statSync(fixture.databasePath).mode & 0o777, 0o600);
});

test("REQ-SBX-GENERAL-003 contains and protects WAL and SHM sidecars", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const outside = join(tmpdir(), `sandbox-security-outside-${process.pid}-${Date.now()}`);
  mkdirSync(outside, { mode: 0o700 });
  t.after(() => {
    rmSync(outside, { recursive: true, force: true });
    closeAndRemove(fixture.parentPath, null);
  });

  writeFileSync(join(outside, "wal"), "outside", { mode: 0o600 });
  symlinkSync(join(outside, "wal"), `${fixture.databasePath}-wal`);
  assertOpenRejected({ path: fixture.databasePath });
  rmSync(`${fixture.databasePath}-wal`, { force: true });

  const database = openDatabase(fixture, t);
  for (const sidecar of [`${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`]) {
    if (existsSync(sidecar)) {
      const entry = lstatSync(sidecar);
      assert.equal(entry.isSymbolicLink(), false);
      assert.equal(entry.isFile(), true);
      assert.equal(entry.mode & 0o777, 0o600);
    }
  }
});

test("REQ-SBX-GENERAL-003 binds the deployment key and rejects newer or incomplete migrations", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  const first = openDatabase(fixture, t);
  first.checkpointAndClose();
  assertOpenRejected({
    path: fixture.databasePath,
    deployment_key_id: "deployment-key:hmac-sha256:" + "b".repeat(64)
  });

  const newerFixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(newerFixture.parentPath, null));
  const newer = new DatabaseSync(newerFixture.databasePath);
  newer.exec(
    "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (2, '2026-08-05T00:00:00.000Z');"
  );
  newer.close();
  assertOpenRejected({ path: newerFixture.databasePath });

  const incompleteFixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(incompleteFixture.parentPath, null));
  const incomplete = new DatabaseSync(incompleteFixture.databasePath);
  incomplete.exec(
    "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (1, '2026-08-05T00:00:00.000Z');"
  );
  incomplete.close();
  assertOpenRejected({ path: incompleteFixture.databasePath });
});

test("REQ-SBX-GENERAL-003 rejects a malformed quick_check fixture and rolls back malformed schema", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  const malformed = new DatabaseSync(fixture.databasePath);
  malformed.exec(
    "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql='CREATE TABL broken(value TEXT)' WHERE name='sandbox_security_schema_migrations';"
  );
  malformed.close();
  assertOpenRejected({ path: fixture.databasePath });
  assert.equal(readFileSync(fixture.databasePath).length > 0, true);
});

test("REQ-SBX-GENERAL-003 rejects a writable_schema CHECK mutation despite a valid quick_check", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  const initial = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  initial.checkpointAndClose();

  const tampered = new DatabaseSync(fixture.databasePath);
  tampered.exec(
    "PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=replace(sql, 'length(subject_id) BETWEEN 1 AND 64', 'length(subject_id) BETWEEN 1 AND 63') WHERE type='table' AND name='sandbox_security_capabilities';"
  );
  tampered.close();
  assertOpenRejected({ path: fixture.databasePath });
});

test("REQ-SBX-GENERAL-003 rejects a case-sensitive catalog literal mutation", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  const initial = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  initial.checkpointAndClose();

  const tampered = new DatabaseSync(fixture.databasePath);
  tampered.exec(
    "PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=replace(sql, '''sandbox_security:evaluate''', '''SANDBOX_SECURITY:EVALUATE''') WHERE type='table' AND name='sandbox_security_capability_scopes';"
  );
  tampered.close();
  assertOpenRejected({ path: fixture.databasePath });
});

test("REQ-SBX-GENERAL-003 rolls back a failed fresh migration and can reopen cleanly", (t) => {
  const fixture = createPrivateDatabaseFixture();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  assertOpenRejected({
    path: fixture.databasePath,
    now: () => ""
  });
  const database = openDatabase(fixture, t);
  assert.equal(
    database.read((db) =>
      db
        .prepare("SELECT version FROM sandbox_security_schema_migrations")
        .get()!.version
    ),
    1
  );
});

test("REQ-SBX-GENERAL-003 exposes foreign_keys and busy_timeout pragmas", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);
  assert.equal(database.read((db) => db.prepare("PRAGMA foreign_keys").get()!.foreign_keys), 1);
  assert.equal(database.read((db) => db.prepare("PRAGMA busy_timeout").get()!.timeout), 5000);

  assert.throws(() =>
    database.transaction((db) => {
      db.prepare(
        "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
      ).run("missing", "sandbox_security:evaluate");
    })
  );
});

test("REQ-SBX-GENERAL-003 enforces every v1 catalog and state CHECK constraint", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);

  const insert = (sql: string, ...parameters: SQLInputValue[]) =>
    assert.throws(() => database.transaction((db) => db.prepare(sql).run(...parameters)));

  insert(
    "INSERT INTO sandbox_security_metadata(key, value) VALUES (?, ?)",
    "invalid",
    "x"
  );
  insert(
    "INSERT INTO sandbox_security_metadata(key, value) VALUES (?, ?)",
    "deployment_key_id",
    ""
  );
  insert(
    "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    "capability:invalid-subject",
    "",
    "sha256:" + "a".repeat(64),
    Buffer.alloc(32),
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    "capability:invalid-digest",
    "subject",
    "bad",
    Buffer.alloc(32),
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    "capability:invalid-seed",
    "subject",
    "sha256:" + "b".repeat(64),
    Buffer.alloc(31),
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    "capability:invalid-times",
    "subject",
    "sha256:" + "c".repeat(64),
    Buffer.alloc(32),
    "2026-08-05T00:01:00.000Z",
    "2026-08-05T00:00:00.000Z"
  );
  database.transaction((db) => {
    db.prepare(
      "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "capability:valid",
      "subject",
      "sha256:" + "d".repeat(64),
      Buffer.alloc(32),
      "2026-08-05T00:00:00.000Z",
      "2026-08-05T00:01:00.000Z"
    );
  });
  insert(
    "INSERT INTO sandbox_security_capabilities(capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "capability:invalid-revoked",
    "subject",
    "sha256:" + "e".repeat(64),
    Buffer.alloc(32),
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z",
    "2026-08-04T23:59:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)",
    "capability:valid",
    "invalid"
  );
  insert(
    "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)",
    "capability:valid",
    "invalid"
  );
  insert(
    "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)",
    "capability:valid",
    "invalid"
  );
  insert(
    "INSERT INTO sandbox_security_idempotency_records(authorization_scope_id, idempotency_key_hmac, request_fingerprint, capability_id, subject_id, request_id, stage, policy_profile_id, composition_binding, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "authscope",
    "idem",
    "fingerprint",
    "capability:valid",
    "subject",
    "request",
    "invalid",
    "sandbox-security-balanced.v1",
    "sandbox-security-production-composition.v1:rule_only",
    "in_progress",
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_idempotency_records(authorization_scope_id, idempotency_key_hmac, request_fingerprint, capability_id, subject_id, request_id, stage, policy_profile_id, composition_binding, status, response_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "authscope",
    "idem-2",
    "fingerprint",
    "capability:valid",
    "subject",
    "request",
    "user_input",
    "sandbox-security-balanced.v1",
    "sandbox-security-production-composition.v1:rule_only",
    "completed",
    null,
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    "2026-08-05T00:01:00.000Z"
  );
  insert(
    "INSERT INTO sandbox_security_audit_events(event_id, event_type, visibility_subject_id, occurred_at, event_json) VALUES (?, ?, ?, ?, ?)",
    "audit:invalid",
    "invalid",
    "subject",
    "2026-08-05T00:00:00.000Z",
    "{}"
  );
  insert(
    "INSERT INTO sandbox_security_audit_events(event_id, event_type, visibility_subject_id, occurred_at, event_json) VALUES (?, ?, ?, ?, ?)",
    "audit:invalid",
    "audit_read",
    "subject",
    "2026-08-05T00:00:00.000Z",
    "x"
  );
});

test("REQ-SBX-GENERAL-003 exposes exact v1 indexes and deployment metadata", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);
  assert.deepEqual(
    database
      .read((db) =>
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'sandbox_security_%' ORDER BY name"
          )
          .all()
      )
      .map((row) => (row as { name: string }).name),
    [
      "sandbox_security_audit_retention_idx",
      "sandbox_security_audit_visibility_order_idx",
      "sandbox_security_idempotency_expiry_idx"
    ]
  );
  assert.deepEqual(
    database
      .read((db) => db.prepare("SELECT version, applied_at FROM sandbox_security_schema_migrations").all())
      .map((row) => ({
        version: (row as { version: number }).version,
        applied_at: (row as { applied_at: string }).applied_at
      })),
    [{ version: 1, applied_at: "2026-08-05T00:00:00.000Z" }]
  );
  assert.deepEqual(
    database
      .read((db) => db.prepare("SELECT key, value FROM sandbox_security_metadata").all())
      .map((row) => ({
        key: (row as { key: string }).key,
        value: (row as { value: string }).value
      })),
    [{ key: "deployment_key_id", value: FIXED_DEPLOYMENT_KEY_ID }]
  );
});

test("REQ-SBX-GENERAL-003 enforces transaction ownership, rollback, read, and close lifecycle", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);
  assert.equal(database.state, "open");

  assert.throws(() =>
    database.transaction((db) => {
      db.prepare("CREATE TABLE transaction_probe(value TEXT)").run();
      database.transaction(() => undefined);
    })
  );
  assert.equal(
    database.read((db) =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE name = 'transaction_probe'")
        .get()
    ),
    undefined
  );

  database.transaction((db) => {
    db.prepare("CREATE TABLE transaction_probe(value TEXT)").run();
    db.prepare("INSERT INTO transaction_probe(value) VALUES (?)").run("committed");
  });
  assert.equal(
    database.read((db) => db.prepare("SELECT value FROM transaction_probe").get()!.value),
    "committed"
  );
  database.checkpointAndClose();
  assert.equal(database.state, "closed");
  assert.throws(() => database.read(() => undefined));
  assert.throws(() => database.transaction(() => undefined));
  assert.doesNotThrow(() => database.checkpointAndClose());
});

test("REQ-SBX-GENERAL-003 capability issue and audit insert are atomic", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  assert.deepEqual(repository.findByTokenDigest(TOKEN_DIGEST), record);
});

test("REQ-SBX-GENERAL-003 capability repository rolls back malformed audit inserts", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository, database } = capabilityRepository(fixture, t);
  const first = capabilityRecord();
  repository.issueWithAudit(first, capabilityIssuedEvent(first));
  const second = capabilityRecord({
    capability_id: SECOND_CAPABILITY_ID,
    token_digest: SECOND_TOKEN_DIGEST,
    scope_seed: new Uint8Array(SECOND_SCOPE_SEED)
  });

  assert.throws(
    () => repository.issueWithAudit(second, {} as SandboxSecurityAuditEvent),
    assertInternalError
  );
  assert.equal(repository.findByTokenDigest(SECOND_TOKEN_DIGEST), null);
  assert.equal(
    database.read((db) =>
      (db
        .prepare(
          "SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = ?"
        )
        .get("capability_issued") as { count: number }).count
    ),
    1
  );
});

test("REQ-SBX-GENERAL-003 capability lookup normalizes catalogs and returns defensive copies", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository } = capabilityRepository(fixture, t);
  const input = capabilityRecord({
    scopes: ["sandbox_security:audit:read", "sandbox_security:evaluate"],
    allowed_stages: ["tool_request", "user_input", "model_output"],
    allowed_policy_profile_ids: [
      "sandbox-security-strict.v1",
      "sandbox-security-balanced.v1"
    ]
  });
  repository.issueWithAudit(input, capabilityIssuedEvent(input));

  const normalized = repository.findByTokenDigest(TOKEN_DIGEST);
  assert.ok(normalized);
  assert.deepEqual(normalized.scopes, [
    "sandbox_security:evaluate",
    "sandbox_security:audit:read"
  ]);
  assert.deepEqual(normalized.allowed_stages, [
    "user_input",
    "model_output",
    "tool_request"
  ]);
  assert.deepEqual(normalized.allowed_policy_profile_ids, [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]);
  normalized.scope_seed[0] = 255;
  (normalized.scopes as SandboxSecurityCapabilityPersistenceRecord["scopes"] as string[]).pop();
  const reread = repository.findByTokenDigest(TOKEN_DIGEST);
  assert.ok(reread);
  assert.equal(reread.scope_seed[0], SCOPE_SEED[0]);
  assert.deepEqual(reread.scopes, [
    "sandbox_security:evaluate",
    "sandbox_security:audit:read"
  ]);
  assert.equal(repository.findByTokenDigest(`sha256:${"f".repeat(64)}`), null);
});

test("REQ-SBX-GENERAL-003 capability records survive restart and never persist raw tokens", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = openDatabase(fixture, t);
  const factory = (
    boundary as unknown as {
      createSqliteSandboxSecurityCapabilityRepository?: (input: Readonly<{
        database: ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>>;
      }>) => SandboxSecurityCapabilityRepository;
    }
  ).createSqliteSandboxSecurityCapabilityRepository;
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  database.checkpointAndClose();

  const reopened = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => ISSUED_AT
  });
  t.after(() => closeAndRemove(fixture.parentPath, reopened));
  const restarted = factory!({ database: reopened });
  assert.deepEqual(restarted.findByTokenDigest(TOKEN_DIGEST), record);

  for (const path of [
    fixture.databasePath,
    `${fixture.databasePath}-wal`,
    `${fixture.databasePath}-shm`
  ]) {
    if (existsSync(path)) {
      assert.equal(readFileSync(path).includes(Buffer.from(TOKEN, "ascii")), false);
    }
  }
});

test("REQ-SBX-GENERAL-003 capability foreign keys restrict references and cascade grant children", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository, database } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  assert.throws(() =>
    database.transaction((db) => {
      db.prepare("DELETE FROM sandbox_security_capabilities WHERE capability_id = ?").run(
        record.capability_id
      );
    })
  );
  assert.equal(
    database.read((db) =>
      (db
        .prepare(
          "SELECT COUNT(*) AS count FROM sandbox_security_capability_scopes WHERE capability_id = ?"
        )
        .get(record.capability_id) as { count: number }).count
    ),
    2
  );
  database.transaction((db) => {
    db.prepare("DELETE FROM sandbox_security_audit_events WHERE capability_id = ?").run(
      record.capability_id
    );
    db.prepare("DELETE FROM sandbox_security_capabilities WHERE capability_id = ?").run(
      record.capability_id
    );
  });
  assert.equal(
    database.read((db) =>
      (db
        .prepare(
          "SELECT COUNT(*) AS count FROM sandbox_security_capability_scopes WHERE capability_id = ?"
        )
        .get(record.capability_id) as { count: number }).count
    ),
    0
  );
});

test("REQ-SBX-GENERAL-003 fails closed for malformed capability rows", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository, database } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  database.transaction((db) => {
    db.prepare(
      "DELETE FROM sandbox_security_capability_profiles WHERE capability_id = ?"
    ).run(record.capability_id);
  });
  assert.equal(repository.findByTokenDigest(TOKEN_DIGEST), null);
});

test("REQ-SBX-GENERAL-003 revocation fixes the first timestamp and is atomic with audit", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository, database } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  const revokedAt = "2026-08-05T00:05:00.000Z";
  const revokeEvent = (eventId: string, timestamp: string): SandboxSecurityAuditEvent => ({
    schema_version: "sandbox-security-audit-event.v1",
    event_id: eventId,
    event_type: "capability_revoked",
    occurred_at: timestamp,
    subject_id: record.subject_id,
    authorization_scope_id: "authscope:hmac-sha256:" + "a".repeat(64),
    capability_id: record.capability_id,
    revoked_at: timestamp
  });
  const first = repository.revokeWithAudit({
    capability_id: record.capability_id,
    revoked_at: revokedAt,
    create_event: () => revokeEvent("audit:00000000-0000-4000-8000-000000000003", revokedAt)
  });
  assert.equal(first?.revoked_at, revokedAt);
  const repeated = repository.revokeWithAudit({
    capability_id: record.capability_id,
    revoked_at: "2026-08-05T00:10:00.000Z",
    create_event: () => {
      throw new Error("repeated revoke must not create an audit event");
    }
  });
  assert.equal(repeated?.revoked_at, revokedAt);
  assert.equal(
    database.read((db) =>
      (db
        .prepare(
          "SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = ?"
        )
        .get("capability_revoked") as { count: number }).count
    ),
    1
  );
  assert.equal(
    repository.revokeWithAudit({
      capability_id: "capability:00000000-0000-4000-8000-000000000099",
      revoked_at: revokedAt,
      create_event: () => revokeEvent("audit:00000000-0000-4000-8000-000000000004", revokedAt)
    }),
    null
  );
});

test("REQ-SBX-GENERAL-003 rolls back revoke when its audit event is malformed", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository, database } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  assert.throws(
    () =>
      repository.revokeWithAudit({
        capability_id: record.capability_id,
        revoked_at: "2026-08-05T00:05:00.000Z",
        create_event: () => ({}) as SandboxSecurityAuditEvent
      }),
    assertInternalError
  );
  assert.equal(repository.findByTokenDigest(TOKEN_DIGEST)?.revoked_at, null);
  assert.equal(
    database.read((db) =>
      (db
        .prepare(
          "SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = ?"
        )
        .get("capability_revoked") as { count: number }).count
    ),
    0
  );
});

test("REQ-SBX-GENERAL-003 wraps an ordinary same-message revoke error as a tagged service error", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const { repository } = capabilityRepository(fixture, t);
  const record = capabilityRecord();
  repository.issueWithAudit(record, capabilityIssuedEvent(record));
  assert.throws(
    () =>
      repository.revokeWithAudit({
        capability_id: record.capability_id,
        revoked_at: "2026-08-05T00:05:00.000Z",
        create_event: () => {
          throw new Error("SANDBOX_SECURITY_INTERNAL_ERROR");
        }
      }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_INTERNAL_ERROR");
      assert.equal((error as { name?: unknown }).name, "SandboxSecurityServiceError");
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-003 keeps idempotency rows durable across SQLite reopen", (t) => {
  assert.equal(typeof boundary.createSqliteSandboxSecurityIdempotencyRepository, "function");
  const fixture = createPrivateDatabaseFixture();
  const first = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  first.transaction((db) => {
    db.prepare(
      `INSERT INTO sandbox_security_capabilities(
        capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      CAPABILITY_ID,
      "subject-a",
      TOKEN_DIGEST,
      SCOPE_SEED,
      ISSUED_AT,
      EXPIRES_AT
    );
    db.prepare(
      `INSERT INTO sandbox_security_idempotency_records(
        authorization_scope_id, idempotency_key_hmac, request_fingerprint,
        capability_id, subject_id, request_id, stage, policy_profile_id,
        composition_binding, status, response_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interrupted', NULL, ?, ?, ?)`
    ).run(
      "authscope:hmac-sha256:" + "a".repeat(64),
      "idem-key:hmac-sha256:" + "a".repeat(64),
      "hmac-sha256:" + "a".repeat(64),
      CAPABILITY_ID,
      "subject-a",
      "request-001",
      "user_input",
      "sandbox-security-balanced.v1",
      "sandbox-security-production-composition.v1:rule_only",
      ISSUED_AT,
      ISSUED_AT,
      EXPIRES_AT
    );
  });
  first.checkpointAndClose();
  const reopened = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-05T00:00:00.000Z"
  });
  t.after(() => closeAndRemove(fixture.parentPath, reopened));
  assert.equal(
    reopened.read((db) =>
      (db
        .prepare("SELECT COUNT(*) AS count FROM sandbox_security_idempotency_records")
        .get() as { count: number }).count
    ),
    1
  );
});
