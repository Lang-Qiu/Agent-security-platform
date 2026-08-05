import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import type { SandboxSecurityAuditEvent } from "../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityDecision } from "../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityIdempotencyClaim,
  SandboxSecurityIdempotencyCompletion,
  SandboxSecurityIdempotencyInterruption,
  SandboxSecurityIdempotencyRecord,
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type { SqliteSandboxSecurityDatabase } from "../src/modules/sandbox-security/ports/sqlite-database.ts";
import { SandboxSecurityClaimCleanupError } from "../src/modules/sandbox-security/sandbox-security.errors.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const NOW = "2026-08-05T12:00:00.000Z";
const LATER = "2026-08-05T12:05:00.000Z";
const EXPIRES = "2026-08-06T12:00:00.000Z";
const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000000";
const CAPABILITY_ID_2 = "capability:00000000-0000-4000-8000-000000000001";
const SCOPE_A =
  "authscope:hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SCOPE_B =
  "authscope:hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const KEY_A = "idem-key:hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_B = "idem-key:hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FINGERPRINT_A = "hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FINGERPRINT_B = "hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const COMPOSITION = "sandbox-security-production-composition.v1:rule_only";
let claimEventCounter = 10;

type Boundary = Record<string, unknown>;

function getFactory<T extends (...args: any[]) => any>(name: string): T {
  const factory = (boundary as unknown as Boundary)[name];
  assert.equal(typeof factory, "function", `module must export ${name}`);
  return factory as T;
}

function openDatabase(t: { after(callback: () => void): void }): SqliteSandboxSecurityDatabase {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-idempotency-"));
  chmodSync(parent, 0o700);
  const database = getFactory<(input: {
    path: string;
    deployment_key_id: string;
    now: () => string;
  }) => SqliteSandboxSecurityDatabase>("openSandboxSecuritySqliteDatabase")({
    path: join(parent, "security.sqlite"),
    deployment_key_id: "deployment-key:hmac-sha256:" + "0".repeat(64),
    now: () => NOW
  });
  t.after(() => {
    database.checkpointAndClose();
    rmSync(parent, { recursive: true, force: true });
  });
  return database;
}

function seedCapability(database: SqliteSandboxSecurityDatabase, capabilityId = CAPABILITY_ID): void {
  database.transaction((db) => {
    db.prepare(
      `INSERT INTO sandbox_security_capabilities(
        capability_id, subject_id, token_digest, scope_seed, issued_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      capabilityId,
      "subject-a",
      `sha256:${"c".repeat(64)}`,
      Buffer.alloc(32, 1),
      NOW,
      EXPIRES
    );
  });
}

function makeDecision(overrides: Partial<SandboxSecurityDecision> = {}): SandboxSecurityDecision {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:00000000-0000-4000-8000-000000000000",
    request_id: "request-001",
    evaluation_mode: "simulation",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: NOW,
    ...overrides
  };
}

function makeProjector() {
  return getFactory<() => any>("createSandboxSecurityAuditProjector")();
}

function makeClaim(overrides: Partial<SandboxSecurityIdempotencyClaim> = {}): SandboxSecurityIdempotencyClaim {
  const projector = makeProjector();
  const eventId = () => `audit:00000000-0000-4000-8000-${String(++claimEventCounter).padStart(12, "0")}`;
  const authorizationScopeId = overrides.authorization_scope_id ?? SCOPE_A;
  const capabilityId = overrides.capability_id ?? CAPABILITY_ID;
  const subjectId = overrides.subject_id ?? "subject-a";
  const requestId = overrides.request_id ?? "request-001";
  const stage = overrides.stage ?? "user_input";
  const policyProfileId = overrides.policy_profile_id ?? "sandbox-security-balanced.v1";
  const compositionBinding = overrides.composition_binding ?? COMPOSITION;
  const base = {
    authorization_scope_id: authorizationScopeId,
    idempotency_key_hmac: KEY_A,
    request_fingerprint: FINGERPRINT_A,
    capability_id: capabilityId,
    subject_id: subjectId,
    request_id: requestId,
    stage,
    policy_profile_id: policyProfileId,
    composition_binding: compositionBinding,
    now: NOW,
    expires_at: EXPIRES,
    in_progress_event: projector.requestRejected({
      event_id: eventId(),
      occurred_at: NOW,
      subject_id: subjectId,
      authorization_scope_id: authorizationScopeId,
      capability_id: capabilityId,
      route_id: "evaluation",
      request_id: requestId,
      stage,
      policy_profile_id: policyProfileId,
      composition_binding: compositionBinding,
      elapsed_ms: 0,
      rejection_code: "idempotency_in_progress"
    }),
    fingerprint_conflict_event: projector.requestRejected({
      event_id: eventId(),
      occurred_at: NOW,
      subject_id: subjectId,
      authorization_scope_id: authorizationScopeId,
      capability_id: capabilityId,
      route_id: "evaluation",
      request_id: requestId,
      stage,
      policy_profile_id: policyProfileId,
      composition_binding: compositionBinding,
      elapsed_ms: 0,
      rejection_code: "idempotency_conflict"
    }),
    create_replayed_event: (decision: SandboxSecurityDecision) =>
      projector.evaluationReplayed({
        event_id: eventId(),
        occurred_at: NOW,
        subject_id: subjectId,
        authorization_scope_id: authorizationScopeId,
        capability_id: capabilityId,
        composition_binding: compositionBinding,
        elapsed_ms: 0,
        decision
      })
  } satisfies SandboxSecurityIdempotencyClaim;
  return { ...base, ...overrides };
}

function makeCompletion(overrides: Partial<SandboxSecurityIdempotencyCompletion> = {}): SandboxSecurityIdempotencyCompletion {
  const projector = makeProjector();
  const decision = makeDecision();
  const eventId = `audit:00000000-0000-4000-8000-${String(++claimEventCounter).padStart(12, "0")}`;
  return {
    authorization_scope_id: SCOPE_A,
    idempotency_key_hmac: KEY_A,
    request_fingerprint: FINGERPRINT_A,
    updated_at: LATER,
    decision,
    completed_event: projector.evaluationCompleted({
      event_id: eventId,
      occurred_at: LATER,
      subject_id: "subject-a",
      authorization_scope_id: SCOPE_A,
      capability_id: CAPABILITY_ID,
      composition_binding: COMPOSITION,
      elapsed_ms: 1,
      decision
    }),
    ...overrides
  };
}

function makeInterruption(overrides: Partial<SandboxSecurityIdempotencyInterruption> = {}): SandboxSecurityIdempotencyInterruption {
  const projector = makeProjector();
  const eventId = `audit:00000000-0000-4000-8000-${String(++claimEventCounter).padStart(12, "0")}`;
  return {
    authorization_scope_id: SCOPE_A,
    idempotency_key_hmac: KEY_A,
    request_fingerprint: FINGERPRINT_A,
    updated_at: LATER,
    interrupted_event: projector.evaluationInterrupted({
      event_id: eventId,
      occurred_at: LATER,
      subject_id: "subject-a",
      authorization_scope_id: SCOPE_A,
      capability_id: CAPABILITY_ID,
      request_id: "request-001",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      composition_binding: COMPOSITION,
      elapsed_ms: 1,
      interruption_code: "engine_error"
    }),
    ...overrides
  };
}

function repositoryFor(t: { after(callback: () => void): void }) {
  const database = openDatabase(t);
  seedCapability(database);
  const repository = getFactory<(input: { database: SqliteSandboxSecurityDatabase }) => any>(
    "createSqliteSandboxSecurityIdempotencyRepository"
  )({ database });
  return { database, repository };
}

test("REQ-SBX-GENERAL-003 exposes the SQLite idempotency repository boundary", () => {
  assert.equal(
    typeof (boundary as unknown as Boundary).createSqliteSandboxSecurityIdempotencyRepository,
    "function"
  );
});

test("REQ-SBX-GENERAL-003 claims replays and rejects fingerprint conflicts", (t) => {
  const { repository } = repositoryFor(t);
  const claim = makeClaim();
  assert.deepEqual(repository.claim(claim), { kind: "claimed" });
  assert.deepEqual(repository.claim(makeClaim()), { kind: "in_progress" });
  repository.complete(makeCompletion());
  assert.deepEqual(repository.claim(claim), { kind: "completed", response: makeDecision() });
  assert.deepEqual(repository.claim(makeClaim({ request_fingerprint: FINGERPRINT_B })), {
    kind: "fingerprint_conflict"
  });
});

test("REQ-SBX-GENERAL-003 deletes an expired row before claim and never replays it", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim({ expires_at: LATER }));
  repository.complete(makeCompletion({ updated_at: LATER, decision: makeDecision({ created_at: LATER }) }));
  assert.deepEqual(repository.claim(makeClaim({ now: "2026-08-05T12:06:00.000Z" })), { kind: "claimed" });
  assert.equal(
    database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_idempotency_records").get() as { count: number }).count),
    1
  );
});

test("REQ-SBX-GENERAL-003 deletes an expired target even when it falls after the 100-row cleanup batch", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim({ expires_at: LATER }));
  repository.complete(makeCompletion({ updated_at: LATER, decision: makeDecision({ created_at: LATER }) }));
  database.transaction((db) => {
    const insert = db.prepare(
      `INSERT INTO sandbox_security_idempotency_records(
        authorization_scope_id, idempotency_key_hmac, request_fingerprint,
        capability_id, subject_id, request_id, stage, policy_profile_id,
        composition_binding, status, response_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interrupted', NULL, ?, ?, ?)`
    );
    for (let index = 0; index < 101; index += 1) {
      const hex = index.toString(16).padStart(64, "0");
      insert.run(SCOPE_A, `idem-key:hmac-sha256:${hex}`, FINGERPRINT_A, CAPABILITY_ID, "subject-a", `expired-${index}`, "user_input", "sandbox-security-balanced.v1", COMPOSITION, "2026-08-05T10:00:00.000Z", "2026-08-05T10:00:00.000Z", "2026-08-05T11:00:00.000Z");
    }
  });
  assert.deepEqual(repository.claim(makeClaim({ now: "2026-08-05T12:06:00.000Z" })), { kind: "claimed" });
  assert.equal(
    database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records WHERE idempotency_key_hmac = ?").get(KEY_A) as { status: string }).status),
    "in_progress"
  );
});

test("REQ-SBX-GENERAL-003 classifies target-expiry delete failure as internal, not claim-cleanup", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim({ expires_at: LATER }));
  repository.complete(makeCompletion({ updated_at: LATER, decision: makeDecision({ created_at: LATER }) }));
  database.transaction((db) => {
    const insert = db.prepare(
      `INSERT INTO sandbox_security_idempotency_records(
        authorization_scope_id, idempotency_key_hmac, request_fingerprint,
        capability_id, subject_id, request_id, stage, policy_profile_id,
        composition_binding, status, response_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interrupted', NULL, ?, ?, ?)`
    );
    for (let index = 0; index < 101; index += 1) {
      const hex = index.toString(16).padStart(64, "0");
      insert.run(SCOPE_A, `idem-key:hmac-sha256:${hex}`, FINGERPRINT_A, CAPABILITY_ID, "subject-a", `expired-trigger-${index}`, "user_input", "sandbox-security-balanced.v1", COMPOSITION, "2026-08-05T10:00:00.000Z", "2026-08-05T10:00:00.000Z", "2026-08-05T11:00:00.000Z");
    }
    db.exec(`CREATE TRIGGER fail_target_expiry_delete BEFORE DELETE ON sandbox_security_idempotency_records WHEN OLD.idempotency_key_hmac = '${KEY_A}' BEGIN SELECT RAISE(ABORT, 'target expiry delete failed'); END`);
  });
  assert.throws(
    () => repository.claim(makeClaim({ now: "2026-08-05T12:06:00.000Z" })),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_INTERNAL_ERROR");
      assert.notEqual((error as { code?: unknown }).code, "SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED");
      return true;
    }
  );
  assert.equal(
    database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records WHERE idempotency_key_hmac = ?").get(KEY_A) as { status: string }).status),
    "completed"
  );
});

test("REQ-SBX-GENERAL-003 reclaims interrupted rows without changing created or expiry", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  repository.interrupt(makeInterruption());
  assert.deepEqual(repository.claim(makeClaim({ now: LATER })), { kind: "claimed" });
  const row = database.read((db) => db.prepare(
    "SELECT created_at, expires_at, status FROM sandbox_security_idempotency_records"
  ).get()) as { created_at: string; expires_at: string; status: string };
  assert.deepEqual({ ...row }, { created_at: NOW, expires_at: EXPIRES, status: "in_progress" });
});

test("REQ-SBX-GENERAL-003 keeps completion, interruption, replay, and concurrency audit atomic", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  repository.rejectConcurrency({
    authorization_scope_id: SCOPE_A,
    idempotency_key_hmac: KEY_A,
    request_fingerprint: FINGERPRINT_A,
    updated_at: LATER,
    rejection_event: makeProjector().requestRejected({
      event_id: "audit:00000000-0000-4000-8000-000000000006",
      occurred_at: LATER,
      subject_id: "subject-a",
      authorization_scope_id: SCOPE_A,
      capability_id: CAPABILITY_ID,
      route_id: "evaluation",
      request_id: "request-001",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      composition_binding: COMPOSITION,
      elapsed_ms: 1,
      rejection_code: "concurrency_limited"
    })
  });
  assert.equal(database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records").get() as { status: string }).status), "interrupted");
  repository.claim(makeClaim({ now: LATER }));
  repository.interrupt(makeInterruption());
  repository.claim(makeClaim({ now: LATER }));
  repository.complete(makeCompletion());
  repository.claim(makeClaim());
  const types = database.read((db) => (db.prepare("SELECT event_type FROM sandbox_security_audit_events ORDER BY rowid").all() as Array<{ event_type: string }>).map((row) => row.event_type));
  assert.deepEqual(types, ["request_rejected", "evaluation_interrupted", "evaluation_completed", "evaluation_replayed"]);
});

test("REQ-SBX-GENERAL-003 rejects malformed cached decisions and oversized serialized responses", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  repository.complete(makeCompletion());
  database.transaction((db) => {
    db.prepare("UPDATE sandbox_security_idempotency_records SET response_json = ?").run(JSON.stringify({ invalid: true }));
  });
  assert.throws(() => repository.claim(makeClaim()), /SANDBOX_SECURITY_INTERNAL_ERROR/);
  assert.throws(() => repository.complete(makeCompletion({ decision: { ...makeDecision(), evidence_refs: ["evidence://sandbox/security/x/0001"] } })), /SANDBOX_SECURITY/);
});

test("REQ-SBX-GENERAL-003 binds completion decisions and audit fields to the stored row", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  const projector = makeProjector();
  const mismatchedDecision = makeDecision({
    request_id: "request-002",
    stage: "model_output",
    policy_profile_id: "sandbox-security-strict.v1"
  });
  const mismatchedEvent = projector.evaluationCompleted({
    event_id: "audit:00000000-0000-4000-8000-000000000009",
    occurred_at: LATER,
    subject_id: "subject-a",
    authorization_scope_id: SCOPE_A,
    capability_id: CAPABILITY_ID,
    composition_binding: COMPOSITION,
    elapsed_ms: 1,
    decision: mismatchedDecision
  });
  assert.throws(
    () => repository.complete(makeCompletion({ decision: mismatchedDecision, completed_event: mismatchedEvent })),
    /SANDBOX_SECURITY_INTERNAL_ERROR/
  );
  assert.equal(
    database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records").get() as { status: string }).status),
    "in_progress"
  );
  assert.equal(
    database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'evaluation_completed'").get() as { count: number }).count),
    0
  );
});

test("REQ-SBX-GENERAL-003 separates idempotency by authorization scope and never stores raw keys", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  repository.claim(makeClaim({ authorization_scope_id: SCOPE_B, idempotency_key_hmac: KEY_B }));
  const bytes = database.read((db) => db.prepare("SELECT authorization_scope_id, idempotency_key_hmac FROM sandbox_security_idempotency_records ORDER BY authorization_scope_id").all()) as Array<Record<string, string>>;
  assert.equal(bytes.length, 2);
  assert.equal(JSON.stringify(bytes).includes("raw-idempotency-key"), false);
});

test("REQ-SBX-GENERAL-003 recovers in-progress rows into interrupted startup events", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  const recovered = repository.recoverInProgress({
    now: LATER,
    create_event: (record: Readonly<SandboxSecurityIdempotencyRecord>) => makeProjector().evaluationInterrupted({
      event_id: "audit:00000000-0000-4000-8000-000000000007",
      occurred_at: LATER,
      subject_id: record.subject_id,
      authorization_scope_id: record.authorization_scope_id,
      capability_id: record.capability_id,
      request_id: record.request_id,
      stage: record.stage,
      policy_profile_id: record.policy_profile_id,
      composition_binding: record.composition_binding,
      elapsed_ms: 0,
      interruption_code: "startup_recovery"
    })
  });
  assert.equal(recovered, 1);
  assert.equal(database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records").get() as { status: string }).status), "interrupted");
  const event = database.read((db) => JSON.parse((db.prepare("SELECT event_json FROM sandbox_security_audit_events ORDER BY rowid DESC").get() as { event_json: string }).event_json) as SandboxSecurityAuditEvent);
  assert.equal(event.event_type, "evaluation_interrupted");
  assert.equal(event.interruption_code, "startup_recovery");
});

test("REQ-SBX-GENERAL-003 rejects startup-recovery interruption codes on direct request transitions", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  const event = makeProjector().evaluationInterrupted({
    event_id: "audit:00000000-0000-4000-8000-000000000008",
    occurred_at: LATER,
    subject_id: "subject-a",
    authorization_scope_id: SCOPE_A,
    capability_id: CAPABILITY_ID,
    request_id: "request-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: COMPOSITION,
    elapsed_ms: 1,
    interruption_code: "startup_recovery"
  });
  assert.throws(() => repository.interrupt(makeInterruption({ interrupted_event: event })), /SANDBOX_SECURITY_INTERNAL_ERROR/);
  assert.equal(database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records").get() as { status: string }).status), "in_progress");
});

test("REQ-SBX-GENERAL-003 rolls back recovery when its event is not startup_recovery", (t) => {
  const { repository, database } = repositoryFor(t);
  repository.claim(makeClaim());
  assert.throws(() => repository.recoverInProgress({
    now: LATER,
    create_event: (record: Readonly<SandboxSecurityIdempotencyRecord>) => makeProjector().evaluationInterrupted({
      event_id: "audit:00000000-0000-4000-8000-000000000009",
      occurred_at: LATER,
      subject_id: record.subject_id,
      authorization_scope_id: record.authorization_scope_id,
      capability_id: record.capability_id,
      request_id: record.request_id,
      stage: record.stage,
      policy_profile_id: record.policy_profile_id,
      composition_binding: record.composition_binding,
      elapsed_ms: 0,
      interruption_code: "engine_error"
    })
  }), /SANDBOX_SECURITY_INTERNAL_ERROR/);
  assert.equal(database.read((db) => (db.prepare("SELECT status FROM sandbox_security_idempotency_records").get() as { status: string }).status), "in_progress");
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_audit_events WHERE event_type = 'evaluation_interrupted'").get() as { count: number }).count), 0);
});

test("REQ-SBX-GENERAL-003 bounds expired cleanup to 100 rows", (t) => {
  const { repository, database } = repositoryFor(t);
  database.transaction((db) => {
    const insert = db.prepare(
      `INSERT INTO sandbox_security_idempotency_records(
        authorization_scope_id, idempotency_key_hmac, request_fingerprint,
        capability_id, subject_id, request_id, stage, policy_profile_id,
        composition_binding, status, response_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interrupted', NULL, ?, ?, ?)`
    );
    for (let index = 0; index < 130; index += 1) {
      const hex = index.toString(16).padStart(64, "0");
      insert.run(SCOPE_A, `idem-key:hmac-sha256:${hex}`, FINGERPRINT_A, CAPABILITY_ID, "subject-a", `request-${index}`, "user_input", "sandbox-security-balanced.v1", COMPOSITION, "2026-08-05T10:00:00.000Z", "2026-08-05T10:00:00.000Z", "2026-08-05T11:00:00.000Z");
    }
  });
  assert.equal(repository.cleanupExpired(NOW, 100), 100);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_idempotency_records").get() as { count: number }).count), 30);
});

test("REQ-SBX-GENERAL-003 bounds startup and hourly cleanup to 4096 rows", (t) => {
  const { repository, database } = repositoryFor(t);
  database.transaction((db) => {
    const insert = db.prepare(
      `INSERT INTO sandbox_security_idempotency_records(
        authorization_scope_id, idempotency_key_hmac, request_fingerprint,
        capability_id, subject_id, request_id, stage, policy_profile_id,
        composition_binding, status, response_json, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interrupted', NULL, ?, ?, ?)`
    );
    for (let index = 0; index < 4100; index += 1) {
      const hex = index.toString(16).padStart(64, "0");
      insert.run(SCOPE_A, `idem-key:hmac-sha256:${hex}`, FINGERPRINT_A, CAPABILITY_ID, "subject-a", `request-${index}`, "user_input", "sandbox-security-balanced.v1", COMPOSITION, "2026-08-05T10:00:00.000Z", "2026-08-05T10:00:00.000Z", "2026-08-05T11:00:00.000Z");
    }
  });
  assert.equal(repository.cleanupExpired(NOW, 4096), 4096);
  assert.equal(database.read((db) => (db.prepare("SELECT COUNT(*) AS count FROM sandbox_security_idempotency_records").get() as { count: number }).count), 4);
});

function makeRuntime(overrides: Partial<SandboxSecurityRuntimePort> = {}): SandboxSecurityRuntimePort {
  let intervalCount = 0;
  return {
    now: () => NOW,
    monotonicNowMs: () => 0,
    randomBytes: () => new Uint8Array(32),
    nextCapabilityId: () => CAPABILITY_ID,
    nextAuditEventId: () => `audit:00000000-0000-4000-8000-${String(++intervalCount).padStart(12, "0")}`,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000000",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({ unref() {}, cancel() {} }),
    ...overrides
  };
}

test("REQ-SBX-GENERAL-003 maintenance recovers and cleans before healthy, schedules one unref interval, and closes once", () => {
  const calls: string[] = [];
  let cancelCount = 0;
  let unrefCount = 0;
  const repository = {
    recoverInProgress(input: any) { calls.push("recover"); input.create_event({ subject_id: "subject-a", authorization_scope_id: SCOPE_A, capability_id: CAPABILITY_ID, request_id: "request-001", stage: "user_input", policy_profile_id: "sandbox-security-balanced.v1", composition_binding: COMPOSITION }); return 0; },
    cleanupExpired(_now: string, limit: number) { calls.push(`cleanup:${limit}`); return 0; },
    claim() { return { kind: "claimed" as const }; }
  };
  const maintenance = getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({
    repository,
    runtime: makeRuntime({ scheduleInterval: (_delay, _callback) => ({ unref() { unrefCount += 1; }, cancel() { cancelCount += 1; } }) }),
    audit_projector: makeProjector()
  });
  assert.equal(maintenance.state(), "healthy");
  assert.deepEqual(calls, ["recover", "cleanup:4096"]);
  assert.equal(unrefCount, 1);
  maintenance.close();
  maintenance.close();
  assert.equal(cancelCount, 1);
  assert.equal(maintenance.state(), "closed");
});

test("REQ-SBX-GENERAL-003 maintenance maps cleanup failures to degraded storage availability and never reopens", () => {
  let cleanups = 0;
  const repository = {
    recoverInProgress() { return 0; },
    cleanupExpired() { cleanups += 1; if (cleanups === 1) throw new Error("disk"); return 0; },
    claim() { return { kind: "claimed" as const }; }
  };
  assert.throws(() => getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({ repository, runtime: makeRuntime(), audit_projector: makeProjector() }), /disk/);

  const maintenance = getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({
    repository: { ...repository, cleanupExpired() { return 0; } },
    runtime: makeRuntime(),
    audit_projector: makeProjector()
  });
  maintenance.close();
  assert.equal(maintenance.state(), "closed");
  assert.throws(() => maintenance.assertEvaluationAvailable(), /SANDBOX_SECURITY_STORAGE_UNAVAILABLE/);
});

test("REQ-SBX-GENERAL-003 maintenance restores health after committed hourly and purge cleanup", () => {
  let cleanupCalls = 0;
  const repository = {
    recoverInProgress() { return 0; },
    cleanupExpired() {
      cleanupCalls += 1;
      if (cleanupCalls === 2 || cleanupCalls === 4) throw new Error("cleanup unavailable");
      return 0;
    },
    claim() { return { kind: "claimed" as const }; }
  };
  const maintenance = getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({
    repository,
    runtime: makeRuntime(),
    audit_projector: makeProjector()
  });
  assert.throws(() => maintenance.runHourlyCleanup(), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE");
    assert.equal((error as { retry_after_seconds?: unknown }).retry_after_seconds, 60);
    return true;
  });
  assert.equal(maintenance.state(), "degraded");
  assert.throws(() => maintenance.assertEvaluationAvailable(), /SANDBOX_SECURITY_STORAGE_UNAVAILABLE/);
  maintenance.runHourlyCleanup();
  assert.equal(maintenance.state(), "healthy");
  assert.throws(() => maintenance.runPurgePreCleanup(), /SANDBOX_SECURITY_STORAGE_UNAVAILABLE/);
  assert.equal(maintenance.state(), "degraded");
  maintenance.runPurgePreCleanup();
  assert.equal(maintenance.state(), "healthy");
});

test("REQ-SBX-GENERAL-003 maintenance distinguishes tagged claim cleanup from internal claim errors", () => {
  let failure: "cleanup" | "internal" = "cleanup";
  const repository = {
    recoverInProgress() { return 0; },
    cleanupExpired() { return 0; },
    claim() {
      if (failure === "cleanup") throw new SandboxSecurityClaimCleanupError();
      throw new Error("ordinary failure");
    }
  };
  const maintenance = getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({
    repository,
    runtime: makeRuntime(),
    audit_projector: makeProjector()
  });
  assert.throws(() => maintenance.claim(makeClaim()), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE");
    assert.equal((error as { retry_after_seconds?: unknown }).retry_after_seconds, 60);
    return true;
  });
  assert.equal(maintenance.state(), "degraded");
  failure = "internal";
  const internalMaintenance = getFactory<(input: any) => any>("createSandboxSecurityIdempotencyMaintenance")({
    repository,
    runtime: makeRuntime(),
    audit_projector: makeProjector()
  });
  assert.throws(() => internalMaintenance.claim(makeClaim()), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, "SANDBOX_SECURITY_INTERNAL_ERROR");
    return true;
  });
  assert.equal(internalMaintenance.state(), "healthy");
});
