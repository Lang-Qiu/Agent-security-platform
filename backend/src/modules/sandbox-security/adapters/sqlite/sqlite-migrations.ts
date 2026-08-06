import { DatabaseSync } from "node:sqlite";

export const SANDBOX_SECURITY_SCHEMA_VERSION = 2 as const;

const EXPECTED_TABLES = [
  "sandbox_security_audit_events",
  "sandbox_security_capabilities",
  "sandbox_security_capability_profiles",
  "sandbox_security_capability_scopes",
  "sandbox_security_capability_stages",
  "sandbox_security_idempotency_records",
  "sandbox_security_metadata",
  "sandbox_security_schema_migrations"
] as const;

const EXPECTED_INDEXES = [
  "sandbox_security_audit_retention_idx",
  "sandbox_security_audit_visibility_order_idx",
  "sandbox_security_idempotency_expiry_idx"
] as const;

type SchemaObjectType = "table" | "index";

/** The v1 schema is intentionally kept as one immutable migration. */
export const SANDBOX_SECURITY_V1_SCHEMA_SQL = `
CREATE TABLE sandbox_security_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version >= 1),
  applied_at TEXT NOT NULL
);

CREATE TABLE sandbox_security_metadata (
  key TEXT PRIMARY KEY CHECK (key IN ('deployment_key_id')),
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 256)
);

CREATE TABLE sandbox_security_capabilities (
  capability_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 64),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 71),
  scope_seed BLOB NOT NULL CHECK (length(scope_seed) = 32),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE TABLE sandbox_security_capability_scopes (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN (
    'sandbox_security:evaluate', 'sandbox_security:audit:read')),
  PRIMARY KEY (capability_id, scope)
);

CREATE TABLE sandbox_security_capability_stages (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN (
    'user_input', 'model_output', 'tool_request')),
  PRIMARY KEY (capability_id, stage)
);

CREATE TABLE sandbox_security_capability_profiles (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  policy_profile_id TEXT NOT NULL CHECK (policy_profile_id IN (
    'sandbox-security-balanced.v1', 'sandbox-security-strict.v1')),
  PRIMARY KEY (capability_id, policy_profile_id)
);

CREATE TABLE sandbox_security_idempotency_records (
  authorization_scope_id TEXT NOT NULL,
  idempotency_key_hmac TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 64),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  stage TEXT NOT NULL CHECK (stage IN (
    'user_input', 'model_output', 'tool_request')),
  policy_profile_id TEXT NOT NULL CHECK (policy_profile_id IN (
    'sandbox-security-balanced.v1', 'sandbox-security-strict.v1')),
  composition_binding TEXT NOT NULL CHECK (composition_binding IN (
    'sandbox-security-production-composition.v1:rule_only',
    'sandbox-security-production-composition.v1:local',
    'sandbox-security-production-composition.v1:local_and_judge')),
  status TEXT NOT NULL CHECK (status IN (
    'in_progress', 'completed', 'interrupted')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (authorization_scope_id, idempotency_key_hmac),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'completed' AND response_json IS NOT NULL
      AND length(response_json) BETWEEN 2 AND 16777216)
    OR
    (status IN ('in_progress', 'interrupted') AND response_json IS NULL)
  )
);

CREATE TABLE sandbox_security_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'evaluation_completed', 'evaluation_replayed',
    'evaluation_interrupted', 'request_rejected',
    'capability_issued', 'capability_revoked',
    'audit_read', 'audit_purged')),
  visibility_subject_id TEXT NOT NULL
    CHECK (length(visibility_subject_id) BETWEEN 1 AND 64),
  authorization_scope_id TEXT,
  capability_id TEXT REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  event_json TEXT NOT NULL
    CHECK (length(event_json) BETWEEN 2 AND 65536)
);

CREATE INDEX sandbox_security_idempotency_expiry_idx
  ON sandbox_security_idempotency_records(expires_at);
CREATE INDEX sandbox_security_audit_visibility_order_idx
  ON sandbox_security_audit_events(
    visibility_subject_id, occurred_at DESC, event_id DESC);
CREATE INDEX sandbox_security_audit_retention_idx
  ON sandbox_security_audit_events(occurred_at, event_id);
`;

const SANDBOX_SECURITY_V2_SCOPE_TABLE_SQL = `
CREATE TABLE sandbox_security_capability_scopes_v2 (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN (
    'sandbox_security:evaluate', 'sandbox_security:audit:read',
    'sandbox_security:enforcement:audit:write')),
  PRIMARY KEY (capability_id, scope)
);`;

const SANDBOX_SECURITY_V2_AUDIT_TABLE_SQL = `
CREATE TABLE sandbox_security_audit_events_v2 (
  event_id TEXT PRIMARY KEY,
  event_schema TEXT NOT NULL DEFAULT 'sandbox-security-audit-event.v1' CHECK (event_schema IN (
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
);`;

const SANDBOX_SECURITY_V2_AUDIT_INDEX_SQL = `
CREATE INDEX sandbox_security_audit_visibility_order_idx
  ON sandbox_security_audit_events(
    visibility_subject_id, occurred_at DESC, event_id DESC);
CREATE INDEX sandbox_security_audit_retention_idx
  ON sandbox_security_audit_events(occurred_at, event_id);`;

function hasObject(
  database: DatabaseSync,
  type: "table" | "index",
  name: string
): boolean {
  const row = database
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = ? AND name = ?")
    .get(type, name) as { present?: number } | undefined;
  return row?.present === 1;
}

function listObjects(database: DatabaseSync, type: "table" | "index"): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name")
      .all(type) as Array<{ name: string }>
  ).map((row) => row.name);
}

function normalizeDefinition(sql: string): string {
  // Preserve case-sensitive SQL literals while ignoring SQLite's formatting.
  return sql.replace(/\s+/g, " ").trim();
}

type SupportedSchemaVersion = 1 | 2;

let expectedDefinitions:
  | ReadonlyMap<SupportedSchemaVersion, ReadonlyMap<string, string>>
  | null = null;

function collectDefinitions(database: DatabaseSync): ReadonlyMap<string, string> {
  const definitions = new Map<string, string>();
  for (const row of database
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE (type = 'table' OR type = 'index') AND name LIKE 'sandbox_security_%'"
    )
    .all() as Array<{ type: SchemaObjectType; name: string; sql: string | null }>) {
    if (row.sql === null) {
      throw new Error(`sandbox security SQLite definition is missing: ${row.name}`);
    }
    definitions.set(`${row.type}:${row.name}`, normalizeDefinition(row.sql));
  }
  return definitions;
}

function getExpectedDefinitions(
  version: SupportedSchemaVersion
): ReadonlyMap<string, string> {
  if (expectedDefinitions === null) {
    const v1 = new DatabaseSync(":memory:");
    const v2 = new DatabaseSync(":memory:");
    try {
      v1.exec(SANDBOX_SECURITY_V1_SCHEMA_SQL);
      v2.exec(SANDBOX_SECURITY_V1_SCHEMA_SQL);
      v2.exec(
        `DROP INDEX sandbox_security_audit_visibility_order_idx;
         DROP INDEX sandbox_security_audit_retention_idx;
         DROP TABLE sandbox_security_audit_events;
         DROP TABLE sandbox_security_capability_scopes;
         ${SANDBOX_SECURITY_V2_SCOPE_TABLE_SQL}
         ${SANDBOX_SECURITY_V2_AUDIT_TABLE_SQL}
         ALTER TABLE sandbox_security_capability_scopes_v2
           RENAME TO sandbox_security_capability_scopes;
         ALTER TABLE sandbox_security_audit_events_v2
           RENAME TO sandbox_security_audit_events;
         ${SANDBOX_SECURITY_V2_AUDIT_INDEX_SQL}`
      );
      expectedDefinitions = new Map([
        [1, collectDefinitions(v1)],
        [2, collectDefinitions(v2)]
      ]);
    } finally {
      v1.close();
      v2.close();
    }
  }
  return expectedDefinitions.get(version)!;
}

function assertSchemaObjects(
  database: DatabaseSync,
  version: SupportedSchemaVersion
): void {
  for (const table of EXPECTED_TABLES) {
    if (!hasObject(database, "table", table)) {
      throw new Error(`sandbox security SQLite table missing: ${table}`);
    }
  }
  for (const index of EXPECTED_INDEXES) {
    if (!hasObject(database, "index", index)) {
      throw new Error(`sandbox security SQLite index missing: ${index}`);
    }
  }

  const tables = listObjects(database, "table").filter((name) =>
    name.startsWith("sandbox_security_")
  );
  if (
    tables.length !== EXPECTED_TABLES.length ||
    EXPECTED_TABLES.some((table) => !tables.includes(table))
  ) {
    throw new Error(`sandbox security SQLite table catalog is not v${version}`);
  }
  const indexes = listObjects(database, "index").filter((name) =>
    name.startsWith("sandbox_security_")
  );
  if (
    indexes.length !== EXPECTED_INDEXES.length ||
    EXPECTED_INDEXES.some((index) => !indexes.includes(index))
  ) {
    throw new Error(`sandbox security SQLite index catalog is not v${version}`);
  }

  const canonical = getExpectedDefinitions(version);
  for (const type of ["table", "index"] as const) {
    const names = type === "table" ? EXPECTED_TABLES : EXPECTED_INDEXES;
    for (const name of names) {
      const row = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = ? AND name = ?")
        .get(type, name) as { sql?: string | null } | undefined;
      const expected = canonical.get(`${type}:${name}`);
      if (
        expected === undefined ||
        row?.sql === null ||
        typeof row?.sql !== "string" ||
        normalizeDefinition(row.sql) !== expected
      ) {
        throw new Error(
          `sandbox security SQLite ${type} definition is not v${version}: ${name}`
        );
      }
    }
  }
}

function assertV1Objects(database: DatabaseSync): void {
  assertSchemaObjects(database, 1);
}

function assertV2Objects(database: DatabaseSync): void {
  assertSchemaObjects(database, 2);
}

function assertDeploymentBinding(
  database: DatabaseSync,
  deploymentKeyId: string
): void {
  const rows = database
    .prepare("SELECT key, value FROM sandbox_security_metadata ORDER BY key")
    .all() as Array<{ key: string; value: string }>;
  if (
    rows.length !== 1 ||
    rows[0]?.key !== "deployment_key_id" ||
    rows[0].value !== deploymentKeyId
  ) {
    throw new Error("sandbox security SQLite deployment key binding mismatch");
  }
}

function readMigrationRows(database: DatabaseSync): Array<{
  version: number;
  applied_at: string;
}> {
  return database
    .prepare("SELECT version, applied_at FROM sandbox_security_schema_migrations ORDER BY version")
    .all() as Array<{ version: number; applied_at: string }>;
}

function currentSchemaVersion(database: DatabaseSync): SupportedSchemaVersion {
  const rows = readMigrationRows(database);
  if (rows.some((row) => row.version > SANDBOX_SECURITY_SCHEMA_VERSION)) {
    throw new Error("sandbox security SQLite schema is newer than this binary");
  }
  if (
    rows.length === 1 &&
    rows[0]?.version === 1 &&
    typeof rows[0].applied_at === "string" &&
    rows[0].applied_at.length > 0
  ) {
    return 1;
  }
  if (
    rows.length === 2 &&
    rows[0]?.version === 1 &&
    rows[1]?.version === 2 &&
    rows.every(
      (row) => typeof row.applied_at === "string" && row.applied_at.length > 0
    )
  ) {
    return 2;
  }
  if (rows.some((row) => row.version < 1)) {
    throw new Error("sandbox security SQLite migration state is incomplete");
  }
  throw new Error("sandbox security SQLite migration state is incomplete");
}

function migrationTimestamp(now: () => string): string {
  const appliedAt = now();
  if (typeof appliedAt !== "string" || appliedAt.length === 0) {
    throw new TypeError("SQLite migration timestamp must be a non-empty string");
  }
  return appliedAt;
}

function assertForeignKeyIntegrity(database: DatabaseSync): void {
  const foreignKeyViolations = database
    .prepare("PRAGMA foreign_key_check")
    .all();
  if (foreignKeyViolations.length > 0) {
    throw new Error("sandbox security SQLite foreign_key_check failed");
  }
}

function migrateV1ToV2(input: Readonly<{
  database: DatabaseSync;
  now: () => string;
}>): void {
  const { database } = input;
  assertV1Objects(database);

  database.exec(
    `${SANDBOX_SECURITY_V2_SCOPE_TABLE_SQL}
     ${SANDBOX_SECURITY_V2_AUDIT_TABLE_SQL}`
  );
  database.exec(
    `INSERT INTO sandbox_security_capability_scopes_v2(capability_id, scope)
     SELECT capability_id, scope FROM sandbox_security_capability_scopes`
  );
  database.exec(
    `INSERT INTO sandbox_security_audit_events_v2(
       event_schema, event_id, event_type, visibility_subject_id,
       authorization_scope_id, capability_id, occurred_at, event_json
     )
     SELECT 'sandbox-security-audit-event.v1', event_id, event_type,
       visibility_subject_id, authorization_scope_id, capability_id,
       occurred_at, event_json
     FROM sandbox_security_audit_events`
  );

  database.exec(
    `DROP INDEX sandbox_security_audit_visibility_order_idx;
     DROP INDEX sandbox_security_audit_retention_idx;
     DROP TABLE sandbox_security_audit_events;
     DROP TABLE sandbox_security_capability_scopes;
     ALTER TABLE sandbox_security_capability_scopes_v2
       RENAME TO sandbox_security_capability_scopes;
     ALTER TABLE sandbox_security_audit_events_v2
       RENAME TO sandbox_security_audit_events;
     ${SANDBOX_SECURITY_V2_AUDIT_INDEX_SQL}`
  );

  database
    .prepare(
      "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
    )
    .run(2, migrationTimestamp(input.now));

  assertForeignKeyIntegrity(database);
  if (currentSchemaVersion(database) !== 2) {
    throw new Error("sandbox security SQLite schema v2 migration did not settle");
  }
  assertV2Objects(database);
}

export function applySandboxSecurityMigrations(input: Readonly<{
  database: DatabaseSync;
  deployment_key_id: string;
  now: () => string;
}>): void {
  const { database, deployment_key_id: deploymentKeyId } = input;
  if (deploymentKeyId.length < 1 || deploymentKeyId.length > 256) {
    throw new RangeError("deployment_key_id length is outside the SQLite bound");
  }

  const hasMigrationTable = hasObject(
    database,
    "table",
    "sandbox_security_schema_migrations"
  );
  const hasSandboxObjects = listObjects(database, "table").some((name) =>
    name.startsWith("sandbox_security_")
  );

  if (!hasMigrationTable && hasSandboxObjects) {
    throw new Error("sandbox security SQLite has an incomplete migration");
  }

  if (!hasMigrationTable) {
    database.exec(SANDBOX_SECURITY_V1_SCHEMA_SQL);
    const appliedAt = migrationTimestamp(input.now);
    database
      .prepare(
        "INSERT INTO sandbox_security_schema_migrations(version, applied_at) VALUES (?, ?)"
      )
      .run(1, appliedAt);
    database
      .prepare("INSERT INTO sandbox_security_metadata(key, value) VALUES (?, ?)")
      .run("deployment_key_id", deploymentKeyId);
  }

  const version = currentSchemaVersion(database);
  if (version === 1) {
    assertV1Objects(database);
    assertDeploymentBinding(database, deploymentKeyId);
    migrateV1ToV2({ database, now: input.now });
    return;
  }

  assertV2Objects(database);
  assertForeignKeyIntegrity(database);
  assertDeploymentBinding(database, deploymentKeyId);
}

export function runSandboxSecurityQuickCheck(database: DatabaseSync): void {
  const row = database.prepare("PRAGMA quick_check").get() as
    | { quick_check?: string }
    | undefined;
  if (row?.quick_check !== "ok") {
    throw new Error("sandbox security SQLite quick_check failed");
  }
}
