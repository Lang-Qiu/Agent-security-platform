import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord,
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityPrivateCapabilityPersistenceRecord,
  SandboxSecurityPrivateAuthorizedCapability,
  SandboxSecurityPrivateCapabilityScope
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type {
  SandboxSecurityPrivateAuthorizedCapability as ModulePrivateAuthorizedCapability
} from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityProductionCompositionBinding
} from "../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityCapabilityRepository } from "../src/modules/sandbox-security/ports/capability.repository.ts";

type PublicCapabilityRepository =
  Parameters<typeof boundary.createSandboxSecurityCapabilityAuthenticator>[0]["repository"];
type EnforcementCapabilityRepository =
  Parameters<typeof boundary.createSandboxSecurityCapabilityAuthenticator>[0]["enforcement_audit_repository"];

const REQUEST = {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-request.v1",
  subject_id: "integration:openclaw",
  policy_profile_id: "sandbox-security-balanced.v1",
  ttl_seconds: 3600
} as const;

test("REQ-SBX-GENERAL-004 normalizes only the private capability issue schema", () => {
  const normalize = Reflect.get(
    boundary,
    "normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest"
  ) as (value: unknown) => { ttl_seconds: number } | null;
  assert.equal(typeof normalize, "function");
  const normalized = normalize(REQUEST);
  assert.ok(normalized);
  assert.deepEqual(normalized, REQUEST);
  for (const ttl of [60, 3600]) {
    const normalizedTtl = normalize({ ...REQUEST, ttl_seconds: ttl });
    assert.ok(normalizedTtl);
    assert.equal(normalizedTtl.ttl_seconds, ttl);
  }
  assert.equal(Object.isFrozen(normalized), true);
  assert.throws(() => {
    (normalized as { ttl_seconds: number }).ttl_seconds = 60;
  }, TypeError);
});

test("REQ-SBX-GENERAL-004 rejects public and malformed private capability fields", () => {
  const normalize = Reflect.get(
    boundary,
    "normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest"
  );
  assert.equal(typeof normalize, "function");

  const { ttl_seconds: _missingTtl, ...missingTtl } = REQUEST;
  const { policy_profile_id: _missingProfile, ...missingProfile } = REQUEST;

  for (const invalid of [
    missingTtl,
    missingProfile,
    { ...REQUEST, subject_id: "" },
    { ...REQUEST, subject_id: "bad subject" },
    { ...REQUEST, policy_profile_id: "unknown.v1" },
    { ...REQUEST, ttl_seconds: 59 },
    { ...REQUEST, ttl_seconds: 3601 },
    { ...REQUEST, ttl_seconds: 1.5 },
    { ...REQUEST, scopes: ["sandbox_security:evaluate"] },
    { ...REQUEST, allowed_stages: ["user_input"] },
    { ...REQUEST, production_mode: "rule_only" },
    { ...REQUEST, endpoint: "http://localhost" },
    { ...REQUEST, extra: true }
  ]) {
    assert.equal(normalize(invalid), null);
  }
});

test("REQ-SBX-GENERAL-004 keeps private storage scope and composition types closed", () => {
  const privateScope: SandboxSecurityPrivateCapabilityScope =
    "sandbox_security:enforcement:audit:write";
  const composition = "sandbox-security-production-composition.v1:rule_only" satisfies
    SandboxSecurityProductionCompositionBinding;
  const privateRecord = {
    capability_id: "capability:enforcement-audit",
    subject_id: REQUEST.subject_id,
    token_digest: "sha256:token-digest",
    scope_seed: new Uint8Array([1, 2, 3]),
    scopes: [privateScope] as const,
    allowed_stages: ["user_input", "model_output", "tool_request"] as const,
    allowed_policy_profile_ids: [REQUEST.policy_profile_id] as const,
    composition_binding: composition,
    issued_at: "2026-08-06T00:00:00.000Z",
    expires_at: "2026-08-06T01:00:00.000Z",
    revoked_at: null
  } satisfies SandboxSecurityPrivateCapabilityPersistenceRecord;
  const authorized = {
    capability_id: privateRecord.capability_id,
    subject_id: privateRecord.subject_id,
    authorization_scope_id: "scope:enforcement-audit",
    scopes: privateRecord.scopes,
    allowed_stages: privateRecord.allowed_stages,
    allowed_policy_profile_ids: privateRecord.allowed_policy_profile_ids,
    composition_binding: privateRecord.composition_binding,
    issued_at: privateRecord.issued_at,
    expires_at: privateRecord.expires_at
  } satisfies SandboxSecurityPrivateAuthorizedCapability;
  const moduleTypeReexportProof: ModulePrivateAuthorizedCapability = authorized;

  // @ts-expect-error private scope catalog is closed
  const invalidPrivateScope: SandboxSecurityPrivateCapabilityScope =
    "sandbox_security:enforcement:audit:read";
  // @ts-expect-error production composition binding is closed
  const invalidComposition: SandboxSecurityProductionCompositionBinding =
    "sandbox-security-production-composition.v1:unexpected";
  type EnforcementResultScopes =
    SandboxSecurityEnforcementAuditCapabilityIssueResult["scopes"];
  // @ts-expect-error enforcement capability result has exactly one private scope
  const invalidResultScopes: EnforcementResultScopes = [
    "sandbox_security:enforcement:audit:write",
    "sandbox_security:enforcement:audit:write"
  ];

  assert.equal(privateRecord.scopes[0], privateScope);
  assert.equal(authorized.scopes[0], privateScope);
  assert.equal(authorized.composition_binding, composition);
  assert.equal(moduleTypeReexportProof.capability_id, authorized.capability_id);
  assert.equal(invalidPrivateScope, "sandbox_security:enforcement:audit:read");
  assert.equal(invalidComposition, "sandbox-security-production-composition.v1:unexpected");
  assert.equal(invalidResultScopes.length, 2);
  assert.equal(composition, "sandbox-security-production-composition.v1:rule_only");
});

test("REQ-SBX-GENERAL-004 keeps public v1 capability types separate from private storage", () => {
  const publicAuthorized = {
    capability_id: "capability:public",
    subject_id: "integration:openclaw",
    authorization_scope_id: "scope:enforcement-audit",
    scopes: ["sandbox_security:audit:read"] as const,
    allowed_stages: [] as const,
    allowed_policy_profile_ids: [] as const,
    issued_at: "2026-08-06T00:00:00.000Z",
    expires_at: "2026-08-06T01:00:00.000Z"
  } satisfies import("../src/modules/sandbox-security/sandbox-security.types.ts").SandboxSecurityAuthorizedCapability;
  assert.equal(publicAuthorized.scopes[0], "sandbox_security:audit:read");
});

test("REQ-SBX-GENERAL-004 rejects inherited accessor and symbol capability fields", () => {
  const normalize = Reflect.get(
    boundary,
    "normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest"
  );
  assert.equal(typeof normalize, "function");

  const inherited = Object.create({ subject_id: REQUEST.subject_id }) as Record<string, unknown>;
  Object.assign(inherited, REQUEST);
  delete inherited.subject_id;
  assert.equal(normalize(inherited), null);

  const accessor = { ...REQUEST } as Record<string, unknown>;
  Object.defineProperty(accessor, "subject_id", {
    enumerable: true,
    get: () => REQUEST.subject_id
  });
  assert.equal(normalize(accessor), null);

  const symbolValue = { ...REQUEST } as Record<string | symbol, unknown>;
  symbolValue[Symbol("unexpected")] = true;
  assert.equal(normalize(symbolValue), null);
});

const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000010";
const AUDIT_EVENT_ID = "audit:00000000-0000-4000-8000-000000000010";
const PRIVATE_TOKEN = `sbxcap_v1.${"B".repeat(43)}`;
const PRIVATE_NOW = "2026-08-06T00:00:00.000Z";
const PRIVATE_EXPIRES = "2026-08-06T01:00:00.000Z";
const PRIVATE_COMPOSITION =
  "sandbox-security-production-composition.v1:rule_only" as const;

function privateRuntime(
  auditEventIds: readonly string[] = [AUDIT_EVENT_ID]
): SandboxSecurityRuntimePort {
  let randomCall = 0;
  let auditEventIndex = 0;
  return {
    now: () => PRIVATE_NOW,
    monotonicNowMs: () => 0,
    randomBytes: (length) => {
      randomCall += 1;
      return Uint8Array.from({ length }, (_, index) => randomCall + index + 1);
    },
    nextCapabilityId: () => CAPABILITY_ID,
    nextAuditEventId: () =>
      auditEventIds[Math.min(auditEventIndex++, auditEventIds.length - 1)]!,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000010",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({ unref() {}, cancel() {} })
  };
}

function privateProjector(): SandboxSecurityAuditProjector {
  const unsupported = () => {
    throw new Error("legacy projector method is not used by this test");
  };
  return {
    evaluationCompleted: unsupported,
    evaluationReplayed: unsupported,
    evaluationInterrupted: unsupported,
    requestRejected: unsupported,
    capabilityIssued: unsupported,
    capabilityRevoked: (input) => ({
      schema_version: "sandbox-security-audit-event.v1",
      event_id: input.event_id,
      event_type: "capability_revoked",
      occurred_at: input.occurred_at,
      subject_id: input.subject_id,
      authorization_scope_id: input.authorization_scope_id,
      capability_id: input.capability_id,
      revoked_at: input.revoked_at
    }),
    auditRead: unsupported,
    auditPurged: unsupported
  };
}

function privateLimiter(): SandboxSecurityCapabilityLimiterRegistry {
  return {
    consume: () => ({ allowed: true }),
    remove: () => {},
    size: () => 0
  };
}

function issueRequestMessage(value: unknown): IncomingMessage {
  const body = JSON.stringify(value);
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = [
    "Authorization", "Bearer admin-secret",
    "Content-Type", "application/json",
    "Content-Length", String(Buffer.byteLength(body))
  ];
  request.complete = true;
  request.readableEnded = true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  let index = 0;
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: async () => {
        if (index++ > 0) return { done: true, value: undefined };
        return { done: false, value: Buffer.from(body) };
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function privateCapabilityRecord(
  overrides: Partial<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord> = {}
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord {
  const scopeSeed = new Uint8Array(32).fill(9);
  return {
    capability_id: CAPABILITY_ID,
    subject_id: "integration:openclaw",
    token_digest: `sha256:${createHash("sha256").update(PRIVATE_TOKEN, "ascii").digest("hex")}`,
    scope_seed: scopeSeed,
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    composition_binding: PRIVATE_COMPOSITION,
    issued_at: PRIVATE_NOW,
    expires_at: PRIVATE_EXPIRES,
    revoked_at: null,
    ...overrides
  } as SandboxSecurityEnforcementAuditCapabilityPersistenceRecord;
}

test("REQ-SBX-GENERAL-004 keeps private persistence out of the public repository port", () => {
  const privateRecord = privateCapabilityRecord();
  const publicRepository: SandboxSecurityCapabilityRepository = {
    issueWithAudit() {},
    // @ts-expect-error private persistence records are not public repository records
    findByTokenDigest: () => privateRecord,
    revokeWithAudit: () => null
  };
  assert.equal(typeof publicRepository.findByTokenDigest, "function");
});

test("REQ-SBX-GENERAL-004 enforcement audit capability is issued atomically with a private audit row", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-capability-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: join(parent, "security.db"),
    deployment_key_id: "deployment-key:hmac-sha256:" + "a".repeat(64),
    now: () => PRIVATE_NOW
  });
  t.after(() => {
    if (database.state === "open") database.checkpointAndClose();
  });

  const hmac = boundary.createSandboxSecurityHmacService!(new Uint8Array(32).fill(7));
  const repository = boundary.createSqliteSandboxSecurityCapabilityRepository!({ database });
  const capabilityService = boundary.createSandboxSecurityCapabilityService!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "rule_only",
    runtime: privateRuntime([
      AUDIT_EVENT_ID,
      "audit:00000000-0000-4000-8000-000000000011"
    ]),
    audit_projector: privateProjector(),
    capability_limiters: privateLimiter()
  });
  const authenticator = boundary.createSandboxSecurityCapabilityAuthenticator!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "rule_only",
    bootstrap_admin_token: "admin-secret",
    now: () => PRIVATE_NOW
  });
  const controller = boundary.createSandboxSecurityAdminController!({
    authenticator,
    capability_service: capabilityService,
    audit_service: { list: () => ({ schema_version: "sandbox-security-audit-page.v1", events: [], next_cursor: null }), purgeExpired: () => ({ schema_version: "sandbox-security-audit-purge-result.v1", retention_days: 90, deleted_count: 0, has_more: false }) },
    administrator_bucket: { consume: () => ({ allowed: true }) },
    runtime: privateRuntime()
  });

  return controller.issue(issueRequestMessage(REQUEST), "request:00000000-0000-4000-8000-000000000010").then((response) => {
    assert.equal(response.statusCode, 201);
    const data = (response.body as { data: SandboxSecurityEnforcementAuditCapabilityIssueResult }).data;
    assert.deepEqual(data.scopes, ["sandbox_security:enforcement:audit:write"]);
    assert.deepEqual(data.allowed_stages, ["user_input", "model_output", "tool_request"]);
    assert.deepEqual(data.allowed_policy_profile_ids, ["sandbox-security-balanced.v1"]);
    assert.equal(data.composition_binding, PRIVATE_COMPOSITION);
    assert.match(data.bearer_token, /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/);
    assert.equal(data.expires_at, PRIVATE_EXPIRES);

    const rows = database.read((sqlite) => sqlite.prepare(
      `SELECT c.token_digest, e.event_schema, e.event_type, e.event_json
       FROM sandbox_security_capabilities c
       JOIN sandbox_security_audit_events e ON e.capability_id = c.capability_id
       WHERE c.capability_id = ?`
    ).all(CAPABILITY_ID) as Array<{ token_digest: string; event_schema: string; event_type: string; event_json: string }>);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.notEqual(row.token_digest, data.bearer_token);
    assert.equal(row.event_schema, "sandbox-security-enforcement-audit-event.v1");
    assert.equal(row.event_type, "capability_issued");
    assert.equal(row.event_json.includes(data.bearer_token), false);
    assert.equal(row.event_json.includes("admin-secret"), false);

    const authenticated = authenticator.authenticateEnforcementAuditToken(data.bearer_token);
    assert.equal(authenticated.kind, "authorized");
    if (authenticated.kind === "authorized") {
      assert.deepEqual(
        authenticator.requireEnforcementAuditGrant(authenticated.capability, {
          stage: "tool_request",
          policy_profile_id: "sandbox-security-balanced.v1",
          composition_binding: PRIVATE_COMPOSITION
        }),
        authenticated.capability
      );
    }

    assert.throws(
      () => capabilityService.issueEnforcementAudit(REQUEST),
      (error: unknown) =>
        (error as { code?: string; message?: string }).code ===
          "SANDBOX_SECURITY_INTERNAL_ERROR" &&
        !(error as { message?: string }).message?.includes(data.bearer_token)
    );
    assert.equal(
      database.read((sqlite) =>
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM sandbox_security_capabilities")
          .get() as { count: number }
      ).count,
      1
    );
  });
});

test("REQ-SBX-GENERAL-004 private capability authentication is isolated from public v1 scopes", () => {
  const record = privateCapabilityRecord();
  const hmac = boundary.createSandboxSecurityHmacService!(new Uint8Array(32).fill(7));
  const repositorySource = {
    issueWithAudit() {},
    findByTokenDigest: () => null,
    findEnforcementAuditByTokenDigest: () => record,
    revokeWithAudit: () => null
  };
  const repository = repositorySource as unknown as PublicCapabilityRepository;
  const enforcementAuditRepository = repositorySource as unknown as EnforcementCapabilityRepository;
  const authenticator = boundary.createSandboxSecurityCapabilityAuthenticator!({
    repository,
    enforcement_audit_repository: enforcementAuditRepository,
    hmac,
    production_mode: "rule_only",
    bootstrap_admin_token: "admin-secret",
    now: () => PRIVATE_NOW
  });
  const privateAuth = (authenticator as unknown as {
    authenticateEnforcementAuditToken(token: string): { kind: string; capability?: unknown };
  }).authenticateEnforcementAuditToken(PRIVATE_TOKEN);
  assert.equal(privateAuth.kind, "authorized");
  const capability = privateAuth.capability as SandboxSecurityPrivateAuthorizedCapability;

  assert.throws(
    () => authenticator.requireScope(capability as never, "sandbox_security:evaluate"),
    (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_FORBIDDEN"
  );
  type GrantContext = {
    stage: "user_input" | "model_output" | "tool_request";
    policy_profile_id: "sandbox-security-balanced.v1" | "sandbox-security-strict.v1";
    composition_binding: SandboxSecurityProductionCompositionBinding;
  };
  const requireGrant = (authenticator as unknown as {
    requireEnforcementAuditGrant(value: SandboxSecurityPrivateAuthorizedCapability, context: Readonly<GrantContext>): SandboxSecurityPrivateAuthorizedCapability;
  }).requireEnforcementAuditGrant;
  assert.deepEqual(requireGrant.call(authenticator, capability, {
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    composition_binding: PRIVATE_COMPOSITION
  }), capability);
  assert.throws(
    () => requireGrant.call(authenticator, {
      ...capability,
      allowed_stages: ["user_input", "model_output"]
    } as unknown as SandboxSecurityPrivateAuthorizedCapability, {
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      composition_binding: PRIVATE_COMPOSITION
    }),
    (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_FORBIDDEN"
  );
  for (const context of [
    { stage: "tool_request", policy_profile_id: "sandbox-security-strict.v1", composition_binding: PRIVATE_COMPOSITION },
    { stage: "tool_request", policy_profile_id: "sandbox-security-balanced.v1", composition_binding: "sandbox-security-production-composition.v1:local" }
  ] as const) {
    assert.throws(
      () => requireGrant.call(authenticator, capability, context),
      (error: unknown) => (error as { code?: string }).code === "SANDBOX_SECURITY_FORBIDDEN"
    );
  }
});

test("REQ-SBX-GENERAL-004 private capability authentication fails closed for expiry and revocation", () => {
  const hmac = boundary.createSandboxSecurityHmacService!(new Uint8Array(32).fill(7));
  for (const [record, expected] of [
    [privateCapabilityRecord({ issued_at: "2026-08-05T00:00:00.000Z", expires_at: PRIVATE_NOW }), "capability_expired"],
    [privateCapabilityRecord({ revoked_at: "2026-08-06T00:30:00.000Z" }), "capability_revoked"]
  ] as const) {
    const repositorySource = {
      issueWithAudit() {},
      findByTokenDigest: () => null,
      findEnforcementAuditByTokenDigest: () => record,
      revokeWithAudit: () => null
    };
    const repository = repositorySource as unknown as PublicCapabilityRepository;
    const enforcementAuditRepository = repositorySource as unknown as EnforcementCapabilityRepository;
    const authenticator = boundary.createSandboxSecurityCapabilityAuthenticator!({
      repository,
      enforcement_audit_repository: enforcementAuditRepository,
      hmac,
      production_mode: "rule_only",
      bootstrap_admin_token: "admin-secret",
      now: () => PRIVATE_NOW
    });
    const result = authenticator.authenticateEnforcementAuditToken(PRIVATE_TOKEN);
    assert.equal(result.kind, "known_denied");
    if (result.kind === "known_denied") assert.equal(result.rejection_code, expected);
  }
});

test("REQ-SBX-GENERAL-004 revokes a private capability through the existing service boundary", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-revoke-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: join(parent, "security.db"),
    deployment_key_id: "deployment-key:hmac-sha256:" + "a".repeat(64),
    now: () => PRIVATE_NOW
  });
  t.after(() => {
    if (database.state === "open") database.checkpointAndClose();
  });

  const hmac = boundary.createSandboxSecurityHmacService!(new Uint8Array(32).fill(7));
  const repository = boundary.createSqliteSandboxSecurityCapabilityRepository!({ database });
  const capabilityService = boundary.createSandboxSecurityCapabilityService!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "rule_only",
    runtime: privateRuntime([
      AUDIT_EVENT_ID,
      "audit:00000000-0000-4000-8000-000000000011"
    ]),
    audit_projector: privateProjector(),
    capability_limiters: privateLimiter()
  });
  const authenticator = boundary.createSandboxSecurityCapabilityAuthenticator!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "rule_only",
    bootstrap_admin_token: "admin-secret",
    now: () => PRIVATE_NOW
  });

  const issued = capabilityService.issueEnforcementAudit(REQUEST);
  assert.doesNotThrow(() => capabilityService.revoke(issued.capability_id));
  const authentication = authenticator.authenticateEnforcementAuditToken(issued.bearer_token);
  assert.equal(authentication.kind, "known_denied");
  assert.equal(
    database.read((sqlite) =>
      sqlite
        .prepare("SELECT revoked_at FROM sandbox_security_capabilities WHERE capability_id = ?")
        .get(issued.capability_id) as { revoked_at: string | null }
    ).revoked_at,
    PRIVATE_NOW
  );
  const auditRows = database.read((sqlite) => sqlite.prepare(
    `SELECT event_schema, event_type
     FROM sandbox_security_audit_events
     WHERE capability_id = ?
     ORDER BY rowid`
  ).all(issued.capability_id) as Array<{ event_schema: string; event_type: string }>);
  assert.deepEqual(
    auditRows.map((row) => ({ event_schema: row.event_schema, event_type: row.event_type })),
    [
      {
        event_schema: "sandbox-security-enforcement-audit-event.v1",
        event_type: "capability_issued"
      }
    ]
  );

  const publicAuditRepository = boundary.createSqliteSandboxSecurityAuditRepository!({ database });
  const publicAuditProjector = boundary.createSandboxSecurityAuditProjector!();
  const publicRead = publicAuditRepository.listAndRecordRead({
    visibility_subject_id: REQUEST.subject_id,
    after: null,
    limit: 100,
    create_event: ({ returned_count, next_cursor_present }) => publicAuditProjector.auditRead({
      event_id: "audit:00000000-0000-4000-8000-000000000012",
      occurred_at: PRIVATE_NOW,
      subject_id: REQUEST.subject_id,
      authorization_scope_id: "authscope:hmac-sha256:" + "a".repeat(64),
      capability_id: CAPABILITY_ID,
      returned_count,
      next_cursor_present,
      elapsed_ms: 0
    })
  });
  assert.equal(
    publicRead.events.some((event) => event.capability_id === issued.capability_id),
    false
  );
});

test("REQ-SBX-GENERAL-004 does not commit a private revoke when composition validation fails", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "sandbox-security-enforcement-revoke-composition-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const database = boundary.openSandboxSecuritySqliteDatabase!({
    path: join(parent, "security.db"),
    deployment_key_id: "deployment-key:hmac-sha256:" + "a".repeat(64),
    now: () => PRIVATE_NOW
  });
  t.after(() => {
    if (database.state === "open") database.checkpointAndClose();
  });

  const hmac = boundary.createSandboxSecurityHmacService!(new Uint8Array(32).fill(7));
  const repository = boundary.createSqliteSandboxSecurityCapabilityRepository!({ database });
  const issueService = boundary.createSandboxSecurityCapabilityService!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "rule_only",
    runtime: privateRuntime(),
    audit_projector: privateProjector(),
    capability_limiters: privateLimiter()
  });
  const issued = issueService.issueEnforcementAudit(REQUEST);
  const removed: string[] = [];
  const revokeService = boundary.createSandboxSecurityCapabilityService!({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "local",
    runtime: privateRuntime(),
    audit_projector: privateProjector(),
    capability_limiters: {
      consume: () => ({ allowed: true }),
      remove: (capabilityId) => removed.push(capabilityId),
      size: () => 0
    }
  });

  assert.throws(
    () => revokeService.revoke(issued.capability_id),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: unknown }).code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.equal(
    database.read((sqlite) =>
      sqlite
        .prepare("SELECT revoked_at FROM sandbox_security_capabilities WHERE capability_id = ?")
        .get(issued.capability_id) as { revoked_at: string | null }
    ).revoked_at,
    null
  );
  assert.deepEqual(removed, []);
});

test("REQ-SBX-GENERAL-004 public v1 capability issuance rejects the private scope literal", () => {
  const normalize = Reflect.get(boundary, "normalizeSandboxSecurityCapabilityIssueRequest") as (value: unknown) => unknown;
  assert.equal(normalize({
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "integration:openclaw",
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: [],
    allowed_policy_profile_ids: [],
    ttl_seconds: 3600
  }), null);
});
