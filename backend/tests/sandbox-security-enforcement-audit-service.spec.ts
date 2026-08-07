import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  SandboxSecurityEnforcementAuditEventCandidate,
  SandboxSecurityEnforcementAuditRequest,
  OpenClawEnforcementAuditAck
} from "../../shared/index.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type { SqliteSandboxSecurityDatabase } from "../src/modules/sandbox-security/ports/sqlite-database.ts";
import type { OpenClawEnforcementAuditIdentity } from "../src/modules/sandbox-security/sandbox-security.types.ts";
import {
  createSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../src/modules/sandbox-security/sandbox-security.errors.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const NOW = "2026-08-07T00:00:00.000Z";
const REPLAYED_AT = "2026-08-07T00:00:01.000Z";
const IDENTITY = {
  subject_id: "integration:openclaw",
  capability_id: "capability:00000000-0000-4000-8000-000000000020",
  authorization_scope_id: `authscope:hmac-sha256:${"a".repeat(64)}`
} as const;

const COMPLETED_REQUEST: SandboxSecurityEnforcementAuditRequest = {
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: "audit:00000000-0000-4000-8000-000000000020",
  request_id: "request:00000000-0000-4000-8000-000000000020",
  enforcement_point: "before_agent_run",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  elapsed_ms: 12,
  event_type: "enforcement_completed",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "high",
  category_counts: {
    prompt_injection: 1,
    jailbreak: 0,
    instruction_override: 0,
    privilege_escalation: 0,
    sensitive_data_exposure: 0,
    tool_hijacking: 0,
    unsafe_side_effect: 0,
    memory_poisoning: 0,
    trust_boundary_violation: 0
  },
  detector_run_status_counts: {
    matched: 1,
    no_match: 0,
    failed: 0,
    timeout: 0,
    invalid_result: 0,
    skipped: 0
  },
  host_outcome: "replaced"
};

const INTERRUPTED_REQUEST: SandboxSecurityEnforcementAuditRequest = {
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: "audit:00000000-0000-4000-8000-000000000021",
  request_id: "request:00000000-0000-4000-8000-000000000021",
  enforcement_point: "before_tool_execution",
  stage: "tool_request",
  policy_profile_id: "sandbox-security-strict.v1",
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  elapsed_ms: 33,
  event_type: "enforcement_interrupted",
  interruption_code: "engine_timeout",
  applied_fail_closed_action: "deny"
};

interface RecordedAppend {
  candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
  occurred_at: string;
}

interface RecordingRepository {
  append(input: Readonly<RecordedAppend>): Readonly<{
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}

function runtime(now: () => string = () => NOW): SandboxSecurityRuntimePort {
  return {
    now,
    monotonicNowMs: () => 0,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => IDENTITY.capability_id,
    nextAuditEventId: () => COMPLETED_REQUEST.event_id,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000020",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({ unref() {}, cancel() {} })
  };
}

function getFactory(): ((input: Readonly<{
  repository: RecordingRepository;
  runtime: SandboxSecurityRuntimePort;
}>) => {
  appendEnforcementEvent(
    request: Readonly<SandboxSecurityEnforcementAuditRequest>,
    identity: Readonly<OpenClawEnforcementAuditIdentity>
  ): Promise<Readonly<OpenClawEnforcementAuditAck>>;
}) {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityEnforcementAuditService;
  assert.equal(typeof factory, "function", "module must export the enforcement audit service factory");
  return factory as ReturnType<typeof getFactory>;
}

function serviceWith(
  repository: RecordingRepository,
  now: () => string = () => NOW
) {
  return getFactory()({ repository, runtime: runtime(now) });
}

function sqliteEnforcementRepository(database: SqliteSandboxSecurityDatabase): RecordingRepository {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSqliteSandboxSecurityEnforcementAuditRepository;
  assert.equal(typeof factory, "function");
  return (factory as (input: Readonly<{ database: SqliteSandboxSecurityDatabase }>) => RecordingRepository)({
    database
  });
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
        IDENTITY.capability_id,
        IDENTITY.subject_id,
        `sha256:${"c".repeat(64)}`,
        Buffer.from(new Uint8Array(32)),
        NOW,
        "2026-08-07T01:00:00.000Z",
        null
      );
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
      )
      .run(IDENTITY.capability_id, "sandbox_security:enforcement:audit:write");
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)"
      )
      .run(IDENTITY.capability_id, "user_input");
    sqlite
      .prepare(
        "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)"
      )
      .run(IDENTITY.capability_id, "sandbox-security-balanced.v1");
  });
}

test("REQ-SBX-GENERAL-004 exposes the enforcement audit service factory", () => {
  assert.equal(
    typeof (boundary as unknown as Record<string, unknown>)
      .createSandboxSecurityEnforcementAuditService,
    "function"
  );
});

test("REQ-SBX-GENERAL-004 appends a completed event with backend identity and server time", async () => {
  let recorded: RecordedAppend | undefined;
  const repository: RecordingRepository = {
    append(input) {
      recorded = input;
      return {
        event_id: COMPLETED_REQUEST.event_id,
        status: "accepted",
        occurred_at: NOW
      };
    }
  };

  const ack = await serviceWith(repository).appendEnforcementEvent(
    COMPLETED_REQUEST,
    IDENTITY
  );

  assert.deepEqual(ack, {
    schema_version: "sandbox-security-enforcement-audit-ack.v1",
    event_id: COMPLETED_REQUEST.event_id,
    status: "accepted",
    occurred_at: NOW
  });
  assert.ok(recorded);
  assert.deepEqual(recorded.occurred_at, NOW);
  assert.deepEqual(recorded.candidate, {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: COMPLETED_REQUEST.event_id,
    event_type: "enforcement_completed",
    subject_id: IDENTITY.subject_id,
    authorization_scope_id: IDENTITY.authorization_scope_id,
    capability_id: IDENTITY.capability_id,
    request_id: COMPLETED_REQUEST.request_id,
    enforcement_point: COMPLETED_REQUEST.enforcement_point,
    stage: COMPLETED_REQUEST.stage,
    policy_profile_id: COMPLETED_REQUEST.policy_profile_id,
    composition_binding: COMPLETED_REQUEST.composition_binding,
    elapsed_ms: COMPLETED_REQUEST.elapsed_ms,
    verdict: COMPLETED_REQUEST.verdict,
    action: COMPLETED_REQUEST.action,
    risk_level: COMPLETED_REQUEST.risk_level,
    category_counts: COMPLETED_REQUEST.category_counts,
    detector_run_status_counts: COMPLETED_REQUEST.detector_run_status_counts,
    host_outcome: COMPLETED_REQUEST.host_outcome
  });
  assert.equal("occurred_at" in recorded.candidate, false);
  assert.equal(Object.isFrozen(recorded.candidate), true);
  assert.equal(Object.isFrozen(recorded.candidate.category_counts), true);
});

test("REQ-SBX-GENERAL-004 projects an interrupted event without accepting caller identity or time", async () => {
  let recorded: RecordedAppend | undefined;
  const repository: RecordingRepository = {
    append(input) {
      recorded = input;
      return {
        event_id: INTERRUPTED_REQUEST.event_id,
        status: "accepted",
        occurred_at: NOW
      };
    }
  };
  const requestWithForbiddenFields = {
    ...INTERRUPTED_REQUEST,
    subject_id: "caller-controlled",
    occurred_at: REPLAYED_AT,
    bearer_token: `sbxcap_v1.${"A".repeat(43)}`
  } as unknown as SandboxSecurityEnforcementAuditRequest;

  await assert.rejects(
    () => serviceWith(repository).appendEnforcementEvent(requestWithForbiddenFields, IDENTITY),
    (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.equal(recorded, undefined);
});

test("REQ-SBX-GENERAL-004 accepts interrupted projections with backend identity", async () => {
  let recorded: RecordedAppend | undefined;
  const repository: RecordingRepository = {
    append(input) {
      recorded = input;
      return {
        event_id: INTERRUPTED_REQUEST.event_id,
        status: "replayed",
        occurred_at: REPLAYED_AT
      };
    }
  };

  const ack = await serviceWith(repository).appendEnforcementEvent(
    INTERRUPTED_REQUEST,
    IDENTITY
  );
  assert.deepEqual(ack, {
    schema_version: "sandbox-security-enforcement-audit-ack.v1",
    event_id: INTERRUPTED_REQUEST.event_id,
    status: "replayed",
    occurred_at: REPLAYED_AT
  });
  assert.deepEqual(recorded?.candidate, {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_id: INTERRUPTED_REQUEST.event_id,
    event_type: "enforcement_interrupted",
    subject_id: IDENTITY.subject_id,
    authorization_scope_id: IDENTITY.authorization_scope_id,
    capability_id: IDENTITY.capability_id,
    request_id: INTERRUPTED_REQUEST.request_id,
    enforcement_point: INTERRUPTED_REQUEST.enforcement_point,
    stage: INTERRUPTED_REQUEST.stage,
    policy_profile_id: INTERRUPTED_REQUEST.policy_profile_id,
    composition_binding: INTERRUPTED_REQUEST.composition_binding,
    elapsed_ms: INTERRUPTED_REQUEST.elapsed_ms,
    interruption_code: INTERRUPTED_REQUEST.interruption_code,
    applied_fail_closed_action: INTERRUPTED_REQUEST.applied_fail_closed_action
  });
});

test("REQ-SBX-GENERAL-004 preserves the first replay time and propagates service conflicts", async (t) => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-service-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const database = (boundary as unknown as {
    openSandboxSecuritySqliteDatabase: (input: Readonly<{
      path: string;
      deployment_key_id: string;
      now: () => string;
    }>) => SqliteSandboxSecurityDatabase;
  }).openSandboxSecuritySqliteDatabase({
    path: join(parent, "security.db"),
    deployment_key_id: `deployment-key:hmac-sha256:${"a".repeat(64)}`,
    now: () => NOW
  });
  t.after(() => {
    if (database.state === "open") database.checkpointAndClose();
  });
  seedCapability(database);

  const repository = sqliteEnforcementRepository(database);
  const times = [NOW, REPLAYED_AT, REPLAYED_AT];
  const service = serviceWith(repository, () => times.shift() ?? REPLAYED_AT);
  const accepted = await service.appendEnforcementEvent(COMPLETED_REQUEST, IDENTITY);
  const replayed = await service.appendEnforcementEvent(COMPLETED_REQUEST, IDENTITY);

  assert.deepEqual(accepted, {
    schema_version: "sandbox-security-enforcement-audit-ack.v1",
    event_id: COMPLETED_REQUEST.event_id,
    status: "accepted",
    occurred_at: NOW
  });
  assert.deepEqual(replayed, {
    schema_version: "sandbox-security-enforcement-audit-ack.v1",
    event_id: COMPLETED_REQUEST.event_id,
    status: "replayed",
    occurred_at: NOW
  });

  const conflictingRequest = {
    ...COMPLETED_REQUEST,
    elapsed_ms: COMPLETED_REQUEST.elapsed_ms + 1
  } satisfies SandboxSecurityEnforcementAuditRequest;
  await assert.rejects(
    () => service.appendEnforcementEvent(conflictingRequest, IDENTITY),
    (error: unknown) =>
      (error as { code?: unknown }).code === "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT"
  );
});

test("REQ-SBX-GENERAL-004 calls runtime.now once and preserves stable repository errors", async () => {
  let nowCalls = 0;
  const storageError = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
    audit_rejection_code: "storage_unavailable"
  });
  const repository: RecordingRepository = {
    append() {
      throw storageError;
    }
  };
  await assert.rejects(
    () => serviceWith(repository, () => {
      nowCalls += 1;
      return NOW;
    }).appendEnforcementEvent(COMPLETED_REQUEST, IDENTITY),
    (error: unknown) => error === storageError
  );
  assert.equal(nowCalls, 1);
});

test("REQ-SBX-GENERAL-004 converts synchronous repository failures into rejected promises", async () => {
  const repository: RecordingRepository = {
    append() {
      throw new Error("sqlite raw failure");
    }
  };
  await assert.rejects(
    () => serviceWith(repository).appendEnforcementEvent(COMPLETED_REQUEST, IDENTITY),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "SANDBOX_SECURITY_INTERNAL_ERROR");
      assert.equal((error as Error).message.includes("sqlite raw failure"), false);
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-004 rejects invalid normalized requests and identities before append", async () => {
  let appendCalls = 0;
  const repository: RecordingRepository = {
    append() {
      appendCalls += 1;
      return {
        event_id: COMPLETED_REQUEST.event_id,
        status: "accepted",
        occurred_at: NOW
      };
    }
  };
  const invalidRequest = {
    ...COMPLETED_REQUEST,
    event_id: "not-an-audit-id"
  } as unknown as SandboxSecurityEnforcementAuditRequest;
  await assert.rejects(
    () => serviceWith(repository).appendEnforcementEvent(invalidRequest, IDENTITY),
    (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  await assert.rejects(
    () => serviceWith(repository).appendEnforcementEvent(COMPLETED_REQUEST, {
      ...IDENTITY,
      subject_id: ""
    }),
    (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.equal(appendCalls, 0);
});
