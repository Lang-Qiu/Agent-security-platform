import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  mkdirSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import { createSandboxSecurityAuditProjector } from "../src/modules/sandbox-security/audit-projector.ts";
import type { SandboxSecurityAuditEvent } from "../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityEnforcementAuditEventCandidate,
  SandboxSecurityEnforcementCompletedEvent,
  SandboxSecurityEnforcementInterruptedEvent
} from "../../shared/types/sandbox-security-enforcement-audit.ts";
import { normalizeSandboxSecurityEnforcementAuditEvent } from "../../shared/contracts/sandbox-security-enforcement-audit.ts";
import type { SqliteSandboxSecurityDatabase } from "../src/modules/sandbox-security/ports/sqlite-database.ts";

const DEPLOYMENT_KEY_ID = "deployment-key:hmac-sha256:" + "a".repeat(64);
const NOW = "2026-08-07T00:00:00.000Z";
const TIME_A = "2026-08-07T00:00:01.000Z";
const TIME_B = "2026-08-07T00:00:02.000Z";
const SUBJECT_ID = "openclaw:general-security";
const OTHER_SUBJECT_ID = "openclaw:other";
const AUTHORIZATION_SCOPE_ID = "authscope:hmac-sha256:" + "b".repeat(64);
const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000001";
const EVENT_ID = "audit:00000000-0000-4000-8000-000000000001";
const INTERRUPTED_EVENT_ID = "audit:00000000-0000-4000-8000-000000000002";
const CAPABILITY_EVENT_ID = "audit:00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "request:00000000-0000-4000-8000-000000000001";
const COMPOSITION_BINDING = "sandbox-security-production-composition.v1:rule_only" as const;

type EnforcementRepositoryFactory = (input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>) => Readonly<{
  append(input: Readonly<{
    candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
    occurred_at: string;
  }>): Readonly<{
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}>;

function enforcementFactory(): EnforcementRepositoryFactory | undefined {
  return (
    boundary as unknown as {
      createSqliteSandboxSecurityEnforcementAuditRepository?: (
        input: Parameters<EnforcementRepositoryFactory>[0]
      ) => ReturnType<EnforcementRepositoryFactory>;
    }
  ).createSqliteSandboxSecurityEnforcementAuditRepository;
}

function createFixture(): Readonly<{
  parent_path: string;
  database_path: string;
}> {
  const parentPath = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-audit-"));
  mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  return {
    parent_path: parentPath,
    database_path: join(parentPath, "security.db")
  };
}

function openDatabase(fixture: Readonly<{ database_path: string }>): SqliteSandboxSecurityDatabase {
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: fixture.database_path,
    deployment_key_id: DEPLOYMENT_KEY_ID,
    now: () => NOW
  });
  return database;
}

function closeFixture(
  fixture: Readonly<{ parent_path: string }>,
  database: SqliteSandboxSecurityDatabase | null
): void {
  database?.checkpointAndClose();
  rmSync(fixture.parent_path, { recursive: true, force: true });
}

function zeroCounts<const T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function completedCandidate(
  overrides: Partial<SandboxSecurityEnforcementCompletedEvent> = {}
): SandboxSecurityEnforcementAuditEventCandidate {
  return {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: EVENT_ID,
    event_type: "enforcement_completed",
    subject_id: SUBJECT_ID,
    authorization_scope_id: AUTHORIZATION_SCOPE_ID,
    capability_id: CAPABILITY_ID,
    request_id: REQUEST_ID,
    enforcement_point: "before_agent_run",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION_BINDING,
    elapsed_ms: 12,
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    category_counts: zeroCounts([
      "prompt_injection",
      "jailbreak",
      "instruction_override",
      "privilege_escalation",
      "sensitive_data_exposure",
      "tool_hijacking",
      "unsafe_side_effect",
      "memory_poisoning",
      "trust_boundary_violation"
    ] as const),
    detector_run_status_counts: zeroCounts([
      "matched",
      "no_match",
      "failed",
      "timeout",
      "invalid_result",
      "skipped"
    ] as const),
    host_outcome: "continued",
    ...overrides
  } as SandboxSecurityEnforcementAuditEventCandidate;
}

function interruptedCandidate(): SandboxSecurityEnforcementAuditEventCandidate {
  return {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: INTERRUPTED_EVENT_ID,
    event_type: "enforcement_interrupted",
    subject_id: SUBJECT_ID,
    authorization_scope_id: AUTHORIZATION_SCOPE_ID,
    capability_id: CAPABILITY_ID,
    request_id: "request:00000000-0000-4000-8000-000000000002",
    enforcement_point: "before_tool_execution",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION_BINDING,
    elapsed_ms: 1000,
    interruption_code: "engine_timeout",
    applied_fail_closed_action: "deny"
  };
}

function capabilityIssuedCandidate(): SandboxSecurityEnforcementAuditEventCandidate {
  return {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: CAPABILITY_EVENT_ID,
    event_type: "capability_issued",
    subject_id: SUBJECT_ID,
    authorization_scope_id: AUTHORIZATION_SCOPE_ID,
    capability_id: CAPABILITY_ID,
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    composition_binding: COMPOSITION_BINDING,
    issued_at: TIME_A,
    expires_at: "2026-08-07T01:00:01.000Z"
  };
}

function legacyInterruptedEvent(
  overrides: Partial<SandboxSecurityAuditEvent> = {}
): SandboxSecurityAuditEvent {
  return {
    schema_version: "sandbox-security-audit-event.v1",
    event_id: "audit:00000000-0000-4000-8000-000000000010",
    event_type: "evaluation_interrupted",
    occurred_at: TIME_A,
    subject_id: SUBJECT_ID,
    authorization_scope_id: AUTHORIZATION_SCOPE_ID,
    capability_id: CAPABILITY_ID,
    request_id: REQUEST_ID,
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION_BINDING,
    elapsed_ms: 1,
    interruption_code: "engine_error",
    ...overrides
  } as SandboxSecurityAuditEvent;
}

function seedCapability(database: SqliteSandboxSecurityDatabase): void {
  database.transaction((sqlite) => {
    sqlite
      .prepare(
        `INSERT INTO sandbox_security_capabilities(
          capability_id, subject_id, token_digest, scope_seed,
          issued_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        CAPABILITY_ID,
        SUBJECT_ID,
        `sha256:${"c".repeat(64)}`,
        Buffer.from(new Uint8Array(32)),
        TIME_A,
        "2026-08-07T01:00:01.000Z",
        null
      );
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
      )
      .run(CAPABILITY_ID, "sandbox_security:enforcement:audit:write");
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)"
      )
      .run(CAPABILITY_ID, "user_input");
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)"
      )
      .run(CAPABILITY_ID, "sandbox-security-balanced.v1");
  });
}

function insertDurableRow(
  database: SqliteSandboxSecurityDatabase,
  event: SandboxSecurityEnforcementAuditEventCandidate,
  occurredAt: string
): void {
  const full = normalizeSandboxSecurityEnforcementAuditEvent({
    ...event,
    occurred_at: occurredAt
  });
  assert.notEqual(full, null);
  database.transaction((sqlite) => {
    sqlite
      .prepare(
        `INSERT INTO sandbox_security_audit_events(
          event_schema, event_id, event_type, visibility_subject_id,
          authorization_scope_id, capability_id, occurred_at, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "sandbox-security-enforcement-audit-event.v1",
        full!.event_id,
        full!.event_type,
        full!.subject_id,
        full!.authorization_scope_id,
        full!.capability_id,
        full!.occurred_at,
        JSON.stringify(full)
      );
  });
}

function assertConflict(error: unknown): boolean {
  assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT");
  return true;
}

test("REQ-SBX-GENERAL-004 enforcement repository accepts and replays only the first timestamp", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const factory = enforcementFactory();
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  const candidate = completedCandidate();

  assert.deepEqual(repository.append({ candidate, occurred_at: TIME_A }), {
    event_id: EVENT_ID,
    status: "accepted",
    occurred_at: TIME_A
  });
  assert.deepEqual(repository.append({ candidate, occurred_at: TIME_B }), {
    event_id: EVENT_ID,
    status: "replayed",
    occurred_at: TIME_A
  });
  assert.deepEqual(
    database.read((sqlite) => {
      const row = sqlite
        .prepare(
          "SELECT event_schema, occurred_at FROM sandbox_security_audit_events WHERE event_id = ?"
        )
        .get(EVENT_ID) as { event_schema: string; occurred_at: string };
      return { event_schema: row.event_schema, occurred_at: row.occurred_at };
    }),
    {
      event_schema: "sandbox-security-enforcement-audit-event.v1",
      occurred_at: TIME_A
    }
  );
});

test("REQ-SBX-GENERAL-004 enforcement repository rejects every changed candidate field as an idempotency conflict", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const factory = enforcementFactory();
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  const candidate = completedCandidate();
  repository.append({ candidate, occurred_at: TIME_A });

  for (const changed of [
    completedCandidate({ action: "ask", host_outcome: "replaced" }),
    completedCandidate({ policy_profile_id: "sandbox-security-strict.v1" }),
    completedCandidate({ subject_id: OTHER_SUBJECT_ID })
  ]) {
    assert.throws(
      () => repository.append({ candidate: changed, occurred_at: TIME_B }),
      assertConflict
    );
  }
});

test("REQ-SBX-GENERAL-004 enforcement repository stores all three private durable variants", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const factory = enforcementFactory();
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  const candidates = [completedCandidate(), interruptedCandidate(), capabilityIssuedCandidate()];

  for (const candidate of candidates) {
    const accepted = repository.append({ candidate, occurred_at: TIME_A });
    assert.equal(accepted.status, "accepted");
    assert.equal(repository.append({ candidate, occurred_at: TIME_B }).status, "replayed");
  }

  assert.deepEqual(
    database.read((sqlite) =>
      (
        sqlite
          .prepare(
            `SELECT event_type, event_schema FROM sandbox_security_audit_events
             WHERE event_schema = 'sandbox-security-enforcement-audit-event.v1'
             ORDER BY event_id`
          )
          .all() as Array<{ event_type: string; event_schema: string }>
      ).map((row) => ({
        event_type: row.event_type,
        event_schema: row.event_schema
      }))
    ),
    [
      {
        event_type: "enforcement_completed",
        event_schema: "sandbox-security-enforcement-audit-event.v1"
      },
      {
        event_type: "enforcement_interrupted",
        event_schema: "sandbox-security-enforcement-audit-event.v1"
      },
      {
        event_type: "capability_issued",
        event_schema: "sandbox-security-enforcement-audit-event.v1"
      }
    ]
  );
});

test("REQ-SBX-GENERAL-004 public audit repository excludes private event schemas", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const enforcementFactoryValue = enforcementFactory();
  assert.equal(typeof enforcementFactoryValue, "function");
  enforcementFactoryValue!({ database }).append({
    candidate: completedCandidate(),
    occurred_at: TIME_A
  });

  const publicRepository = boundary.createSqliteSandboxSecurityAuditRepository!({ database });
  const legacy = legacyInterruptedEvent();
  publicRepository.append(legacy);
  const page = publicRepository.listAndRecordRead({
    visibility_subject_id: SUBJECT_ID,
    after: null,
    limit: 10,
    create_event: ({ returned_count, next_cursor_present }) =>
      createSandboxSecurityAuditProjector().auditRead({
        event_id: "audit:00000000-0000-4000-8000-000000000011",
        occurred_at: TIME_B,
        subject_id: SUBJECT_ID,
        authorization_scope_id: AUTHORIZATION_SCOPE_ID,
        capability_id: CAPABILITY_ID,
        returned_count,
        next_cursor_present,
        elapsed_ms: 1
      })
  });

  assert.deepEqual(page.events.map((event) => event.event_id), [legacy.event_id]);
  assert.deepEqual(
    database.read((sqlite) => {
      const row = sqlite
        .prepare(
          "SELECT event_schema FROM sandbox_security_audit_events WHERE event_id = ?"
        )
        .get(legacy.event_id) as { event_schema: string };
      return { event_schema: row.event_schema };
    }),
    { event_schema: "sandbox-security-audit-event.v1" }
  );
});

test("REQ-SBX-GENERAL-004 classifies a legacy event-id collision as an idempotency conflict", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const publicRepository = boundary.createSqliteSandboxSecurityAuditRepository!({ database });
  publicRepository.append(legacyInterruptedEvent({ event_id: EVENT_ID }));

  const factory = enforcementFactory();
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  assert.throws(
    () => repository.append({ candidate: completedCandidate(), occurred_at: TIME_B }),
    assertConflict
  );
});

test("REQ-SBX-GENERAL-004 purge validates and removes expired legacy and private rows", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const enforcementFactoryValue = enforcementFactory();
  assert.equal(typeof enforcementFactoryValue, "function");
  enforcementFactoryValue!({ database }).append({
    candidate: completedCandidate(),
    occurred_at: "2026-04-01T00:00:00.000Z"
  });
  const privateInterrupted = interruptedCandidate();
  insertDurableRow(database, privateInterrupted, "2026-04-01T00:00:01.000Z");

  const publicRepository = boundary.createSqliteSandboxSecurityAuditRepository!({ database });
  publicRepository.append(
    legacyInterruptedEvent({
      event_id: "audit:00000000-0000-4000-8000-000000000012",
      occurred_at: "2026-04-01T00:00:02.000Z"
    })
  );
  const result = publicRepository.purgeExpiredWithAudit({
    cutoff: "2026-05-01T00:00:00.000Z",
    limit: 1000,
    create_event: (deletedCount, hasMore) =>
      createSandboxSecurityAuditProjector().auditPurged({
        event_id: "audit:00000000-0000-4000-8000-000000000013",
        occurred_at: TIME_B,
        subject_id: "system:bootstrap-admin",
        retention_days: 90,
        deleted_count: deletedCount,
        has_more: hasMore,
        elapsed_ms: 1
      })
  });

  assert.deepEqual(result, { deleted_count: 3, has_more: false });
  assert.equal(
    database.read((sqlite) =>
      (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE occurred_at < ?"
          )
          .get("2026-05-01T00:00:00.000Z") as { count: number }
      ).count
    ),
    0
  );
  assert.equal(
    database.read((sqlite) => {
      const rows = sqlite
        .prepare("SELECT event_json FROM sandbox_security_audit_events")
        .all() as Array<{ event_json: string }>;
      return rows.every((row) => Buffer.byteLength(row.event_json, "utf8") <= 65536);
    }),
    true
  );
});

test("REQ-SBX-GENERAL-004 private repository fails closed on corrupted private JSON", (t) => {
  const fixture = createFixture();
  const database = openDatabase(fixture);
  t.after(() => closeFixture(fixture, database));
  seedCapability(database);

  const factory = enforcementFactory();
  assert.equal(typeof factory, "function");
  const repository = factory!({ database });
  const candidate = completedCandidate();
  repository.append({ candidate, occurred_at: TIME_A });
  database.transaction((sqlite) => {
    sqlite
      .prepare("UPDATE sandbox_security_audit_events SET event_json = ? WHERE event_id = ?")
      .run("not-json", EVENT_ID);
  });

  assert.throws(
    () => repository.append({ candidate, occurred_at: TIME_B }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_INTERNAL_ERROR");
      return true;
    }
  );
});
