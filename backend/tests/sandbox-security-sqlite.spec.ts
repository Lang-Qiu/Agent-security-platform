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
import {
  SANDBOX_SECURITY_SCHEMA_VERSION,
  SANDBOX_SECURITY_V1_SCHEMA_SQL
} from "../src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts";
import * as sqliteMigrations from "../src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityCapabilityPersistenceRecord
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityCapabilityRepository } from "../src/modules/sandbox-security/ports/capability.repository.ts";
import type { SandboxSecurityAuditRepository } from "../src/modules/sandbox-security/ports/audit.repository.ts";
import { createSandboxSecurityServiceError } from "../src/modules/sandbox-security/sandbox-security.errors.ts";

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
const AUDIT_SCOPE_A = "authscope:hmac-sha256:" + "a".repeat(64);
const AUDIT_SCOPE_B = "authscope:hmac-sha256:" + "b".repeat(64);
const AUDIT_SUBJECT_A = "subject-a";
const AUDIT_SUBJECT_B = "subject-b";
const AUDIT_COMPOSITION = "sandbox-security-production-composition.v1:rule_only";
const canonicalAuditIds = new Map<string, string>();
let nextCanonicalAuditId = 100;

function canonicalAuditId(value: string): string {
  if (/^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    return value;
  }
  const existing = canonicalAuditIds.get(value);
  if (existing !== undefined) return existing;
  const generated = `audit:00000000-0000-4000-8000-${String(nextCanonicalAuditId++).padStart(12, "0")}`;
  canonicalAuditIds.set(value, generated);
  return generated;
}

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

function seedV1Fixture(
  fixture: Readonly<{ databasePath: string }>,
  options: Readonly<{ orphanAudit?: boolean }> = {}
): Readonly<{ event: SandboxSecurityAuditEvent; eventJson: string }> {
  const raw = new DatabaseSync(fixture.databasePath);
  raw.exec(SANDBOX_SECURITY_V1_SCHEMA_SQL);
  raw.exec("PRAGMA foreign_keys = OFF");
  raw
    .prepare(
      "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
    )
    .run(1, ISSUED_AT);
  raw
    .prepare("INSERT INTO sandbox_security_metadata(key, value) VALUES (?, ?)")
    .run("deployment_key_id", FIXED_DEPLOYMENT_KEY_ID);

  const record = capabilityRecord();
  if (!options.orphanAudit) {
    raw
      .prepare(
        `INSERT INTO sandbox_security_capabilities(
          capability_id, subject_id, token_digest, scope_seed,
          issued_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.capability_id,
        record.subject_id,
        record.token_digest,
        Buffer.from(record.scope_seed),
        record.issued_at,
        record.expires_at,
        record.revoked_at
      );
    for (const scope of record.scopes) {
      raw
        .prepare(
          "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
        )
        .run(record.capability_id, scope);
    }
    for (const stage of record.allowed_stages) {
      raw
        .prepare(
          "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)"
        )
        .run(record.capability_id, stage);
    }
    for (const profile of record.allowed_policy_profile_ids) {
      raw
        .prepare(
          "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)"
        )
        .run(record.capability_id, profile);
    }
  }

  const event = capabilityIssuedEvent(record);
  const eventJson = JSON.stringify(event);
  raw
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_id, event_type, visibility_subject_id,
        authorization_scope_id, capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.event_id,
      event.event_type,
      event.subject_id,
      event.authorization_scope_id,
      event.capability_id,
      event.occurred_at,
      eventJson
    );
  raw.close();
  return { event, eventJson };
}

function seedMigrationRowsFixture(
  fixture: Readonly<{ databasePath: string }>,
  versions: readonly number[]
): void {
  const raw = new DatabaseSync(fixture.databasePath);
  raw.exec(
    "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
  );
  for (const version of versions) {
    raw
      .prepare(
        "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
      )
      .run(version, ISSUED_AT);
  }
  raw.close();
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

test("REQ-SBX-GENERAL-003 opens a mode-0600 WAL database with exact v2 tables", (t) => {
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

test("REQ-SBX-GENERAL-004 migrates a v1 fixture to schema v2 without rewriting legacy rows", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const legacy = seedV1Fixture(fixture);
  const database = openDatabase(fixture, t);

  assert.equal(SANDBOX_SECURITY_SCHEMA_VERSION, 2);
  assert.deepEqual(
    database.read((sqlite) =>
      sqlite
        .prepare(
          "SELECT version FROM sandbox_security_schema_migrations ORDER BY version"
        )
        .all()
        .map((row) => ({ version: (row as { version: number }).version }))
    ),
    [{ version: 1 }, { version: 2 }]
  );
  const tableSql = database.read((sqlite) =>
    (
      sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_audit_events'"
        )
        .get() as { sql: string }
    ).sql
  );
  assert.ok(tableSql.includes("event_schema TEXT NOT NULL"));
  assert.ok(
    tableSql.includes("'sandbox-security-enforcement-audit-event.v1'")
  );
  const scopeSql = database.read((sqlite) =>
    (
      sqlite
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_capability_scopes'"
        )
        .get() as { sql: string }
    ).sql
  );
  assert.ok(scopeSql.includes("'sandbox_security:enforcement:audit:write'"));

  const legacyRow = {
    ...(database.read((sqlite) =>
      sqlite
        .prepare(
          `SELECT event_schema, event_id, event_type, visibility_subject_id,
            authorization_scope_id, capability_id, occurred_at, event_json
           FROM sandbox_security_audit_events WHERE event_id = ?`
        )
        .get(legacy.event.event_id)
    ) as Record<string, unknown>)
  };
  assert.deepEqual(legacyRow, {
    event_schema: "sandbox-security-audit-event.v1",
    event_id: legacy.event.event_id,
    event_type: legacy.event.event_type,
    visibility_subject_id: legacy.event.subject_id,
    authorization_scope_id: legacy.event.authorization_scope_id,
    capability_id: legacy.event.capability_id,
    occurred_at: legacy.event.occurred_at,
    event_json: legacy.eventJson
  });
  assert.deepEqual(
    database.read((sqlite) =>
      sqlite
        .prepare("PRAGMA foreign_key_check")
        .all()
    ),
    []
  );
  assert.equal(
    database.read((sqlite) => sqlite.prepare("PRAGMA foreign_keys").get()!.foreign_keys),
    1
  );
});

test("REQ-SBX-GENERAL-004 requires an explicit event schema on every v2 audit insert", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => ISSUED_AT
  });
  t.after(() => closeAndRemove(fixture.parentPath, database));

  assert.throws(() => {
    database.transaction((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO sandbox_security_audit_events(
            event_id, event_type, visibility_subject_id, occurred_at, event_json
          ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          "audit:00000000-0000-4000-8000-000000000099",
          "capability_issued",
          "subject",
          ISSUED_AT,
          "{}"
        );
    });
  });
});

test("REQ-SBX-GENERAL-004 disables foreign keys only for fresh or v1 rebuilds", () => {
  const migrationModule = sqliteMigrations as typeof sqliteMigrations & {
    requiresSandboxSecurityForeignKeyRebuild?: (database: DatabaseSync) => boolean;
  };
  assert.equal(typeof migrationModule.requiresSandboxSecurityForeignKeyRebuild, "function");
  const requiresRebuild = migrationModule.requiresSandboxSecurityForeignKeyRebuild!;

  const fresh = new DatabaseSync(":memory:");
  const v1 = new DatabaseSync(":memory:");
  const v2 = new DatabaseSync(":memory:");
  const incomplete = new DatabaseSync(":memory:");
  const malformedV1 = new DatabaseSync(":memory:");
  try {
    v1.exec(SANDBOX_SECURITY_V1_SCHEMA_SQL);
    v1
      .prepare(
        "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
      )
      .run(1, ISSUED_AT);
    v2.exec(
      "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);"
    );
    v2
      .prepare(
        "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?), (?, ?)"
      )
      .run(1, ISSUED_AT, 2, ISSUED_AT);
    incomplete.exec("CREATE TABLE sandbox_security_partial (id INTEGER PRIMARY KEY)");
    malformedV1.exec(
      "CREATE TABLE sandbox_security_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);"
    );
    malformedV1
      .prepare(
        "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
      )
      .run(1, "");

    assert.equal(requiresRebuild(fresh), true);
    assert.equal(requiresRebuild(v1), true);
    assert.equal(requiresRebuild(v2), false);
    assert.equal(requiresRebuild(incomplete), false);
    assert.equal(requiresRebuild(malformedV1), false);
  } finally {
    fresh.close();
    v1.close();
    v2.close();
    incomplete.close();
    malformedV1.close();
  }
});

test("REQ-SBX-GENERAL-004 rerunning a validated schema v2 database is a no-op", (t) => {
  const fixture = createPrivateDatabaseFixture();
  seedV1Fixture(fixture);
  const first = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => ISSUED_AT
  });
  const snapshot = first.read((sqlite) => ({
    migrations: sqlite
      .prepare("SELECT version, applied_at FROM sandbox_security_schema_migrations ORDER BY version")
      .all()
      .map((row) => ({
        version: (row as { version: number }).version,
        applied_at: (row as { applied_at: string }).applied_at
      })),
    auditSql: sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_audit_events'")
      .get(),
    scopeSql: sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_capability_scopes'")
      .get()
  }));
  assert.deepEqual(snapshot.migrations, [
    { version: 1, applied_at: ISSUED_AT },
    { version: 2, applied_at: ISSUED_AT }
  ]);
  assert.match(
    (snapshot.auditSql as { sql: string }).sql,
    /event_schema TEXT NOT NULL/
  );
  first.checkpointAndClose();

  const second = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => "2026-08-06T00:00:00.000Z"
  });
  t.after(() => closeAndRemove(fixture.parentPath, second));
  assert.deepEqual(
    second.read((sqlite) => ({
      migrations: sqlite
        .prepare("SELECT version, applied_at FROM sandbox_security_schema_migrations ORDER BY version")
        .all()
        .map((row) => ({
          version: (row as { version: number }).version,
          applied_at: (row as { applied_at: string }).applied_at
        })),
      auditSql: sqlite
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_audit_events'")
        .get(),
      scopeSql: sqlite
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sandbox_security_capability_scopes'")
        .get()
    })),
    snapshot
  );
});

test("REQ-SBX-GENERAL-004 rejects unknown, drifted, and partial schema versions before mutation", (t) => {
  const unknown = createPrivateDatabaseFixture();
  seedMigrationRowsFixture(unknown, [3]);
  t.after(() => closeAndRemove(unknown.parentPath, null));
  assertOpenRejected({ path: unknown.databasePath });

  const drifted = createPrivateDatabaseFixture();
  seedV1Fixture(drifted);
  const driftedDb = new DatabaseSync(drifted.databasePath);
  driftedDb.exec(
    "PRAGMA writable_schema=ON; UPDATE sqlite_master SET sql=replace(sql, 'length(subject_id) BETWEEN 1 AND 64', 'length(subject_id) BETWEEN 1 AND 63') WHERE type='table' AND name='sandbox_security_capabilities'"
  );
  driftedDb.close();
  t.after(() => closeAndRemove(drifted.parentPath, null));
  assertOpenRejected({ path: drifted.databasePath });
  const driftedCheck = new DatabaseSync(drifted.databasePath);
  assert.deepEqual(
    driftedCheck
      .prepare("SELECT version FROM sandbox_security_schema_migrations ORDER BY version")
      .all()
      .map((row) => ({ version: (row as { version: number }).version })),
    [{ version: 1 }]
  );
  driftedCheck.close();

  const partial = createPrivateDatabaseFixture();
  seedV1Fixture(partial);
  const partialDb = new DatabaseSync(partial.databasePath);
  partialDb
    .prepare(
      "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
    )
    .run(2, ISSUED_AT);
  partialDb.close();
  t.after(() => closeAndRemove(partial.parentPath, null));
  assertOpenRejected({ path: partial.databasePath });
});

test("REQ-SBX-GENERAL-004 rolls back a v1-to-v2 copy failure without mutating the v1 fixture", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const legacy = seedV1Fixture(fixture, { orphanAudit: true });
  t.after(() => closeAndRemove(fixture.parentPath, null));

  assertOpenRejected({ path: fixture.databasePath });
  const afterFailure = new DatabaseSync(fixture.databasePath);
  assert.deepEqual(
    afterFailure
      .prepare("SELECT version FROM sandbox_security_schema_migrations ORDER BY version")
      .all()
      .map((row) => ({ version: (row as { version: number }).version })),
    [{ version: 1 }]
  );
  assert.equal(
    (
      afterFailure
        .prepare("PRAGMA table_info(sandbox_security_audit_events)")
        .all() as Array<{ name: string }>
    ).some((column) => column.name === "event_schema"),
    false
  );
  assert.equal(
    (
      afterFailure
        .prepare("SELECT event_json FROM sandbox_security_audit_events WHERE event_id = ?")
        .get(legacy.event.event_id) as { event_json: string }
    ).event_json,
    legacy.eventJson
  );
  afterFailure.close();
});

test("REQ-SBX-GENERAL-004 rejects an existing schema v2 foreign-key violation on startup", (t) => {
  const fixture = createPrivateDatabaseFixture();
  const initial = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.databasePath,
    deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
    now: () => ISSUED_AT
  });
  initial.checkpointAndClose();

  const tampered = new DatabaseSync(fixture.databasePath);
  tampered.exec("PRAGMA foreign_keys = OFF");
  tampered
    .prepare(
      "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
    )
    .run("capability:missing", "sandbox_security:evaluate");
  tampered.close();
  t.after(() => closeAndRemove(fixture.parentPath, null));

  let reopened: { checkpointAndClose(): void } | null = null;
  let rejected = false;
  try {
    reopened = boundary.openSandboxSecuritySqliteDatabase!({
      path: fixture.databasePath,
      deployment_key_id: FIXED_DEPLOYMENT_KEY_ID,
      now: () => ISSUED_AT
    });
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
  if (reopened !== null) reopened.checkpointAndClose();
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
        .prepare("SELECT version FROM sandbox_security_schema_migrations ORDER BY version DESC LIMIT 1")
        .get()!.version
    ),
    2
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
    "INSERT INTO sandbox_security_audit_events(event_schema, event_id, event_type, visibility_subject_id, occurred_at, event_json) VALUES (?, ?, ?, ?, ?, ?)",
    "sandbox-security-audit-event.v1",
    "audit:invalid",
    "invalid",
    "subject",
    "2026-08-05T00:00:00.000Z",
    "{}"
  );
  insert(
    "INSERT INTO sandbox_security_audit_events(event_schema, event_id, event_type, visibility_subject_id, occurred_at, event_json) VALUES (?, ?, ?, ?, ?, ?)",
    "sandbox-security-audit-event.v1",
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
    [
      { version: 1, applied_at: "2026-08-05T00:00:00.000Z" },
      { version: 2, applied_at: "2026-08-05T00:00:00.000Z" }
    ]
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

test("REQ-SBX-GENERAL-003 exposes the subject-scoped SQLite audit repository boundary", () => {
  assert.equal(typeof boundary.createSqliteSandboxSecurityAuditRepository, "function");
});

function auditProjector(): any {
  const factory = boundary.createSandboxSecurityAuditProjector;
  assert.equal(typeof factory, "function");
  const projector = factory!();
  return new Proxy(projector, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (input: Record<string, unknown>, ...rest: unknown[]) =>
        value.call(target, { ...input, event_id: canonicalAuditId(input.event_id as string) }, ...rest);
    }
  });
}

function interruptedAuditEvent(input: Readonly<{
  event_id: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  occurred_at: string;
  interruption_code?: "engine_error" | "persistence_error" | "startup_recovery";
}>): SandboxSecurityAuditEvent {
  return auditProjector().evaluationInterrupted({
    event_id: input.event_id,
    occurred_at: input.occurred_at,
    subject_id: input.subject_id,
    authorization_scope_id: input.authorization_scope_id,
    capability_id: input.capability_id,
    request_id: "request-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: AUDIT_COMPOSITION,
    elapsed_ms: 1,
    interruption_code: input.interruption_code ?? "engine_error"
  });
}

function insertAuditEventRow(
  database: ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>>,
  event: SandboxSecurityAuditEvent,
  typedOverrides: Readonly<Partial<{
    event_type: string;
    visibility_subject_id: string;
    authorization_scope_id: string | null;
    capability_id: string | null;
    occurred_at: string;
  }>> = {}
): void {
  database.transaction((db) => {
    db.prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_schema, event_id, event_type, visibility_subject_id, authorization_scope_id,
        capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "sandbox-security-audit-event.v1",
      event.event_id,
      typedOverrides.event_type ?? event.event_type,
      typedOverrides.visibility_subject_id ?? event.subject_id,
      typedOverrides.authorization_scope_id === undefined
        ? event.authorization_scope_id
        : typedOverrides.authorization_scope_id,
      typedOverrides.capability_id === undefined
        ? event.capability_id
        : typedOverrides.capability_id,
      typedOverrides.occurred_at ?? event.occurred_at,
      JSON.stringify(event)
    );
  });
}

function auditRepositoryFixture(
  t: { after(callback: () => void): void }
): Readonly<{
  repository: SandboxSecurityAuditRepository;
  database: ReturnType<NonNullable<typeof boundary.openSandboxSecuritySqliteDatabase>>;
}> {
  const fixture = createPrivateDatabaseFixture();
  const capabilityFixture = capabilityRepository(fixture, t);
  const recordA = capabilityRecord({
    subject_id: AUDIT_SUBJECT_A
  });
  const recordB = capabilityRecord({
    capability_id: SECOND_CAPABILITY_ID,
    subject_id: AUDIT_SUBJECT_B,
    token_digest: SECOND_TOKEN_DIGEST,
    scope_seed: new Uint8Array(SECOND_SCOPE_SEED),
    scopes: ["sandbox_security:evaluate", "sandbox_security:audit:read"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1", "sandbox-security-strict.v1"]
  });
  capabilityFixture.repository.issueWithAudit(recordA, capabilityIssuedEvent(recordA, "audit:00000000-0000-4000-8000-000000000010"));
  capabilityFixture.repository.issueWithAudit(recordB, capabilityIssuedEvent(recordB, "audit:00000000-0000-4000-8000-000000000011"));
  capabilityFixture.database.transaction((db) => {
    db.prepare("DELETE FROM sandbox_security_audit_events").run();
  });
  const factory = boundary.createSqliteSandboxSecurityAuditRepository;
  assert.equal(typeof factory, "function");
  return { repository: factory!({ database: capabilityFixture.database }), database: capabilityFixture.database };
}

test("REQ-SBX-GENERAL-003 audit selection is subject-scoped, ordered, and records the page after selection", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const events = [
    interruptedAuditEvent({ event_id: "audit:a-1", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.001Z" }),
    interruptedAuditEvent({ event_id: "audit:a-2", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.001Z" }),
    interruptedAuditEvent({ event_id: "audit:a-3", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T11:59:00.000Z" }),
    interruptedAuditEvent({ event_id: "audit:b-1", subject_id: AUDIT_SUBJECT_B, authorization_scope_id: AUDIT_SCOPE_B, capability_id: SECOND_CAPABILITY_ID, occurred_at: "2026-08-05T13:00:00.000Z" })
  ];
  for (const event of events) insertAuditEventRow(database, event);
  const page = repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 2,
    create_event: ({ returned_count, next_cursor_present }) =>
      auditProjector().auditRead({
        event_id: "audit:read-1",
        occurred_at: "2026-08-05T12:01:00.000Z",
        subject_id: AUDIT_SUBJECT_A,
        authorization_scope_id: AUDIT_SCOPE_A,
        capability_id: CAPABILITY_ID,
        returned_count,
        next_cursor_present,
        elapsed_ms: 1
      })
  });
  assert.deepEqual(page.events.map((event) => event.event_id), [canonicalAuditId("audit:a-2"), canonicalAuditId("audit:a-1")]);
  assert.equal(page.events.every((event) => event.subject_id === AUDIT_SUBJECT_A), true);
  assert.equal(page.has_more, true);
  assert.equal(page.events.some((event) => event.event_type === "audit_read"), false);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'audit_read'").get() as { count: number }).count), 1);
});

test("REQ-SBX-GENERAL-003 audit selection paginates ties with the exclusive occurred_at/event_id cursor", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  for (const [eventId, occurredAt] of [["audit:t-1", "2026-08-05T12:00:00.001Z"], ["audit:t-2", "2026-08-05T12:00:00.001Z"], ["audit:t-3", "2026-08-05T11:59:00.000Z"]] as const) {
    insertAuditEventRow(database, interruptedAuditEvent({ event_id: eventId, subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: occurredAt }));
  }
  const first = repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 2,
    create_event: ({ returned_count, next_cursor_present }) => auditProjector().auditRead({
      event_id: "audit:read-t-1", occurred_at: "2026-08-05T12:02:00.000Z", subject_id: AUDIT_SUBJECT_A,
      authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count,
      next_cursor_present, elapsed_ms: 1
    })
  });
  assert.deepEqual(first.events.map((event) => event.event_id), [canonicalAuditId("audit:t-2"), canonicalAuditId("audit:t-1")]);
  const second = repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: { occurred_at: first.events[1]!.occurred_at, event_id: first.events[1]!.event_id },
    limit: 2,
    create_event: ({ returned_count, next_cursor_present }) => auditProjector().auditRead({
      event_id: "audit:read-t-2", occurred_at: "2026-08-05T12:03:00.000Z", subject_id: AUDIT_SUBJECT_A,
      authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count,
      next_cursor_present, elapsed_ms: 1
    })
  });
  assert.deepEqual(second.events.map((event) => event.event_id), [canonicalAuditId("audit:t-3")]);
  assert.equal(second.has_more, false);
});

test("REQ-SBX-GENERAL-003 rejects invalid or cross-wired stored audit rows without writing a read event", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const valid = interruptedAuditEvent({ event_id: "audit:bad-json", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.000Z" });
  database.transaction((db) => {
    db.prepare("INSERT INTO sandbox_security_audit_events(event_schema,event_id,event_type,visibility_subject_id,authorization_scope_id,capability_id,occurred_at,event_json) VALUES (?,?,?,?,?,?,?,?)").run("sandbox-security-audit-event.v1", valid.event_id, valid.event_type, AUDIT_SUBJECT_A, AUDIT_SCOPE_A, CAPABILITY_ID, valid.occurred_at, "not-json");
  });
  assert.throws(() => repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 10,
    create_event: () => auditProjector().auditRead({ event_id: "audit:read-invalid", occurred_at: "2026-08-05T12:01:00.000Z", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count: 0, next_cursor_present: false, elapsed_ms: 1 })
  }), assertInternalError);
  database.transaction((db) => db.prepare("DELETE FROM sandbox_security_audit_events WHERE event_id = ?").run(valid.event_id));
  insertAuditEventRow(database, valid, { visibility_subject_id: AUDIT_SUBJECT_B });
  assert.throws(() => repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_B,
    after: null,
    limit: 10,
    create_event: () => auditProjector().auditRead({ event_id: "audit:read-cross", occurred_at: "2026-08-05T12:01:00.000Z", subject_id: AUDIT_SUBJECT_B, authorization_scope_id: AUDIT_SCOPE_B, capability_id: SECOND_CAPABILITY_ID, returned_count: 0, next_cursor_present: false, elapsed_ms: 1 })
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'audit_read'").get() as { count: number }).count), 0);
});

test("REQ-SBX-GENERAL-003 requires a result-aware audit-read callback and rolls back its insert failure", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const event = interruptedAuditEvent({ event_id: "audit:source", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.000Z" });
  insertAuditEventRow(database, event);
  assert.throws(() => repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 10,
    create_event: () => auditProjector().auditRead({ event_id: "audit:read-mismatch", occurred_at: "2026-08-05T12:01:00.000Z", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count: 999, next_cursor_present: true, elapsed_ms: 1 })
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'audit_read'").get() as { count: number }).count), 0);
  assert.throws(() => repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 10,
    create_event: () => auditProjector().auditRead({ event_id: event.event_id, occurred_at: "2026-08-05T12:01:00.000Z", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count: 1, next_cursor_present: false, elapsed_ms: 1 })
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events").get() as { count: number }).count), 1);
});

test("REQ-SBX-GENERAL-003 returns defensive audit copies and supports append", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const event = interruptedAuditEvent({ event_id: "audit:defensive", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.000Z" });
  repository.append(event);
  const page = repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 10,
    create_event: ({ returned_count, next_cursor_present }) => auditProjector().auditRead({ event_id: "audit:read-defensive", occurred_at: "2026-08-05T12:01:00.000Z", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count, next_cursor_present, elapsed_ms: 1 })
  });
  page.events[0]!.subject_id = "subject-mutated";
  const again = repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 1,
    create_event: ({ returned_count, next_cursor_present }) => auditProjector().auditRead({ event_id: "audit:read-defensive-2", occurred_at: "2026-08-05T12:02:00.000Z", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, returned_count, next_cursor_present, elapsed_ms: 1 })
  });
  assert.equal(again.events[0]!.subject_id, AUDIT_SUBJECT_A);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'audit_read'").get() as { count: number }).count), 2);
});

test("REQ-SBX-GENERAL-003 purges at most 1000 old rows with a fixed 90-day audit event", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  database.transaction((db) => {
    const insert = db.prepare("INSERT INTO sandbox_security_audit_events(event_schema,event_id,event_type,visibility_subject_id,authorization_scope_id,capability_id,occurred_at,event_json) VALUES (?,?,?,?,?,?,?,?)");
    for (let index = 0; index < 1002; index += 1) {
      const event = interruptedAuditEvent({ event_id: `audit:old-${index}`, subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-04-01T00:00:00.000Z" });
      insert.run("sandbox-security-audit-event.v1", event.event_id, event.event_type, event.subject_id, event.authorization_scope_id, event.capability_id, event.occurred_at, JSON.stringify(event));
    }
    const recent = interruptedAuditEvent({ event_id: "audit:recent", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-01T00:00:00.000Z" });
    insert.run("sandbox-security-audit-event.v1", recent.event_id, recent.event_type, recent.subject_id, recent.authorization_scope_id, recent.capability_id, recent.occurred_at, JSON.stringify(recent));
  });
  const first = repository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    create_event: (deletedCount, hasMore) => auditProjector().auditPurged({ event_id: "audit:purge-1", occurred_at: "2026-08-05T12:00:00.000Z", deleted_count: deletedCount, has_more: hasMore, elapsed_ms: 1 })
  });
  assert.deepEqual(first, { deleted_count: 1000, has_more: true });
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'evaluation_interrupted'").get() as { count: number }).count), 3);
  const second = repository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    create_event: (deletedCount, hasMore) => auditProjector().auditPurged({ event_id: "audit:purge-2", occurred_at: "2026-08-05T12:01:00.000Z", deleted_count: deletedCount, has_more: hasMore, elapsed_ms: 1 })
  });
  assert.deepEqual(second, { deleted_count: 2, has_more: false });
});

test("REQ-SBX-GENERAL-003 rolls back audit purge on mismatched or failed purge audit", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const old = interruptedAuditEvent({ event_id: "audit:purge-old", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-04-01T00:00:00.000Z" });
  insertAuditEventRow(database, old);
  const existing = interruptedAuditEvent({ event_id: "audit:purge-existing", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-01T00:00:00.000Z" });
  insertAuditEventRow(database, existing);
  assert.throws(() => repository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    create_event: () => auditProjector().auditPurged({ event_id: "audit:purge-mismatch", occurred_at: "2026-08-05T12:00:00.000Z", deleted_count: 999, has_more: false, elapsed_ms: 1 })
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_id = ?").get(old.event_id) as { count: number }).count), 1);
  assert.throws(() => repository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    create_event: () => auditProjector().auditPurged({ event_id: existing.event_id, occurred_at: "2026-08-05T12:00:00.000Z", deleted_count: 1, has_more: false, elapsed_ms: 1 })
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_id = ?").get(old.event_id) as { count: number }).count), 1);
});

test("REQ-SBX-GENERAL-003 does not accept a caller-provided audit retention interval", (t) => {
  const { repository } = auditRepositoryFixture(t);
  assert.throws(() => repository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    retention_days: 1,
    create_event: () => auditProjector().auditPurged({ event_id: "audit:retention-extra", occurred_at: "2026-08-05T12:00:00.000Z", deleted_count: 0, has_more: false, elapsed_ms: 1 })
  } as any), assertInternalError);
});

test("REQ-SBX-GENERAL-003 wraps non-internal callback service errors as internal and rolls back the read", (t) => {
  const { repository, database } = auditRepositoryFixture(t);
  const source = interruptedAuditEvent({ event_id: "audit:callback-source", subject_id: AUDIT_SUBJECT_A, authorization_scope_id: AUDIT_SCOPE_A, capability_id: CAPABILITY_ID, occurred_at: "2026-08-05T12:00:00.000Z" });
  insertAuditEventRow(database, source);
  assert.throws(() => repository.listAndRecordRead({
    visibility_subject_id: AUDIT_SUBJECT_A,
    after: null,
    limit: 10,
    create_event: () => {
      throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE", audit_rejection_code: "storage_unavailable" });
    }
  }), assertInternalError);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'audit_read'").get() as { count: number }).count), 0);
});
