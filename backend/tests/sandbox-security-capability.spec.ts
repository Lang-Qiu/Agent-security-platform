import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityAuditProjector,
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityCapabilityService,
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityPrivateCapabilityPersistenceRecord,
  SandboxSecurityHmacService,
  SandboxSecurityNormalizedCapabilityIssueRequest
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityRequest } from "../../shared/types/sandbox-security.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityCapabilityRepository,
  SandboxSecurityEnforcementAuditCapabilityRepository
} from "../src/modules/sandbox-security/ports/capability.repository.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import { createSandboxSecurityServiceError } from "../src/modules/sandbox-security/sandbox-security.errors.ts";

const KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SCOPE_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 41);
const NOW = "2026-08-05T12:00:00.000Z";
const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const CAPABILITY_ISSUE_NOW = "2026-08-05T00:00:00.000Z";
const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000001";
const FIXED_NORMALIZED_GRANT = {
  schema_version: "sandbox-security-capability-issue-request.v1",
  subject_id: "operator:alpha",
  scopes: ["sandbox_security:evaluate"],
  allowed_stages: ["user_input", "tool_request"],
  allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
  ttl_seconds: 900
} satisfies Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>;

test("REQ-SBX-GENERAL-003 exposes the capability issue and revoke service factory", () => {
  const create = get<(...args: any[]) => SandboxSecurityCapabilityService>(
    "createSandboxSecurityCapabilityService"
  );
  assert.equal(typeof create, "function");
});

function get<T extends (...args: any[]) => any>(name: string): T {
  const value = (boundary as unknown as Record<string, unknown>)[name];
  assert.equal(typeof value, "function", `module must export ${name}`);
  return value as T;
}

function makeIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "operator:alpha",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["tool_request", "user_input"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    ...overrides
  };
}

function makeSubmission(overrides: Partial<SandboxSecurityRequest> = {}): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-strict.v1",
    content_items: [],
    ...overrides
  };
}

function makeRecord(overrides: Partial<SandboxSecurityCapabilityPersistenceRecord> = {}) {
  return {
    capability_id: "capability:00000000-0000-4000-8000-000000000000",
    subject_id: "operator:alpha",
    token_digest: `sha256:${createHash("sha256").update(TOKEN, "ascii").digest("hex")}` as const,
    scope_seed: SCOPE_SEED,
    scopes: ["sandbox_security:evaluate"] as const,
    allowed_stages: ["user_input", "tool_request"] as const,
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"] as const,
    issued_at: NOW,
    expires_at: "2026-08-05T12:15:00.000Z",
    revoked_at: null,
    ...overrides
  } satisfies SandboxSecurityCapabilityPersistenceRecord;
}

function makeRepository(record: SandboxSecurityCapabilityPersistenceRecord | null) {
  return {
    issueWithAudit() {},
    findByTokenDigest(digest: `sha256:${string}`) {
      if (record === null || digest !== record.token_digest) return null;
      return record;
    },
    revokeWithAudit() {
      return null;
    },
    findEnforcementAuditByTokenDigest() {
      return null;
    },
    revokeEnforcementAudit() {
      return null;
    }
  };
}

function makeCapabilityServiceFixture(input: Readonly<{
  issue_error?: unknown;
  revoke_error?: unknown;
  projector_error?: unknown;
  limiter_error?: unknown;
  revoke_record?: SandboxSecurityCapabilityPersistenceRecord | null;
  now?: string;
}> = {}) {
  const state = {
    issued: [] as Array<{
      record: Readonly<SandboxSecurityCapabilityPersistenceRecord>;
      event: Readonly<SandboxSecurityAuditEvent>;
    }>,
    revoked: [] as Array<{
      capability_id: string;
      revoked_at: string;
    }>,
    issued_inputs: [] as unknown[],
    revoked_inputs: [] as unknown[],
    removed: [] as string[],
    random_values: [
      new Uint8Array(SCOPE_SEED),
      Uint8Array.from({ length: 32 }, (_, index) => 0xa0 + index)
    ],
    random_calls: [] as number[],
    scope_seeds: [] as Uint8Array[],
    next_capability_id_calls: 0,
    next_audit_event_id_calls: 0,
    issue_error: input.issue_error,
    revoke_error: input.revoke_error,
    projector_error: input.projector_error,
    limiter_error: input.limiter_error,
    revoke_record: input.revoke_record === undefined
      ? makeRecord({
          capability_id: CAPABILITY_ID,
          issued_at: CAPABILITY_ISSUE_NOW,
          expires_at: "2026-08-05T00:15:00.000Z"
        })
      : input.revoke_record,
    now: input.now ?? CAPABILITY_ISSUE_NOW,
    revoked_at: "2026-08-05T00:02:00.000Z"
  };

  const baseHmac = makeHmac();
  const hmac: SandboxSecurityHmacService = {
    ...baseHmac,
    authorizationScopeId(scopeSeed, productionMode) {
      state.scope_seeds.push(new Uint8Array(scopeSeed));
      return baseHmac.authorizationScopeId(scopeSeed, productionMode);
    }
  };

  const runtime: SandboxSecurityRuntimePort = {
    now() {
      return state.now;
    },
    monotonicNowMs() {
      return 0;
    },
    randomBytes(length) {
      state.random_calls.push(length);
      const value = state.random_values[state.random_calls.length - 1];
      if (value === undefined) throw new Error("unexpected random call");
      return new Uint8Array(value);
    },
    nextCapabilityId() {
      state.next_capability_id_calls += 1;
      return CAPABILITY_ID;
    },
    nextAuditEventId() {
      state.next_audit_event_id_calls += 1;
      return "audit:00000000-0000-4000-8000-000000000001";
    },
    nextDecisionId() {
      return "decision:00000000-0000-4000-8000-000000000001";
    },
    scheduleTimeout() {
      return () => {};
    },
    scheduleInterval() {
      return { unref() {}, cancel() {} };
    }
  };

  const projectCapabilityIssued = (value: Readonly<{
    event_id: string;
    occurred_at: string;
    subject_id: string;
    authorization_scope_id: string;
    capability_id: string;
    scopes: readonly SandboxSecurityCapabilityPersistenceRecord["scopes"][number][];
    allowed_stages: readonly SandboxSecurityCapabilityPersistenceRecord["allowed_stages"][number][];
    allowed_policy_profile_ids: readonly SandboxSecurityCapabilityPersistenceRecord["allowed_policy_profile_ids"][number][];
    issued_at: string;
    expires_at: string;
  }>): SandboxSecurityAuditEvent => ({
    schema_version: "sandbox-security-audit-event.v1",
    event_id: value.event_id,
    event_type: "capability_issued",
    occurred_at: value.occurred_at,
    subject_id: value.subject_id,
    authorization_scope_id: value.authorization_scope_id,
    capability_id: value.capability_id,
    scopes: [...value.scopes],
    allowed_stages: [...value.allowed_stages],
    allowed_policy_profile_ids: [...value.allowed_policy_profile_ids],
    issued_at: value.issued_at,
    expires_at: value.expires_at
  });
  const projectCapabilityRevoked = (value: Readonly<{
    event_id: string;
    occurred_at: string;
    subject_id: string;
    authorization_scope_id: string;
    capability_id: string;
    revoked_at: string;
  }>): SandboxSecurityAuditEvent => ({
    schema_version: "sandbox-security-audit-event.v1",
    event_id: value.event_id,
    event_type: "capability_revoked",
    occurred_at: value.occurred_at,
    subject_id: value.subject_id,
    authorization_scope_id: value.authorization_scope_id,
    capability_id: value.capability_id,
    revoked_at: value.revoked_at
  });
  const unsupportedProjector = () => {
    throw new Error("unsupported projector method");
  };
  const audit_projector: SandboxSecurityAuditProjector = {
    capabilityIssued(value) {
      state.issued_inputs.push(value);
      if (state.projector_error !== undefined) throw state.projector_error;
      return projectCapabilityIssued(value);
    },
    capabilityRevoked(value) {
      state.revoked_inputs.push(value);
      if (state.projector_error !== undefined) throw state.projector_error;
      return projectCapabilityRevoked(value);
    },
    evaluationCompleted: unsupportedProjector,
    evaluationReplayed: unsupportedProjector,
    evaluationInterrupted: unsupportedProjector,
    requestRejected: unsupportedProjector,
    auditRead: unsupportedProjector,
    auditPurged: unsupportedProjector
  };

  let revokedRecord: SandboxSecurityCapabilityPersistenceRecord | null = null;
  const repository: SandboxSecurityCapabilityRepository &
    SandboxSecurityEnforcementAuditCapabilityRepository = {
    issueEnforcementAuditWithAudit() {},
    issueWithAudit(record, event) {
      if (state.issue_error !== undefined) throw state.issue_error;
      state.issued.push({ record, event });
    },
    findByTokenDigest() {
      return null;
    },
    findEnforcementAuditByTokenDigest() {
      return null;
    },
    revokeEnforcementAudit() {
      return null;
    },
    revokeWithAudit(value) {
      state.revoked.push({ capability_id: value.capability_id, revoked_at: value.revoked_at });
      if (state.revoke_error !== undefined) throw state.revoke_error;
      if (state.revoke_record === null) return null;
      if (revokedRecord !== null) return revokedRecord;
      revokedRecord = {
        ...state.revoke_record,
        revoked_at: value.revoked_at,
        scope_seed: new Uint8Array(state.revoke_record.scope_seed),
        scopes: [...state.revoke_record.scopes],
        allowed_stages: [...state.revoke_record.allowed_stages],
        allowed_policy_profile_ids: [...state.revoke_record.allowed_policy_profile_ids]
      };
      value.create_event(revokedRecord);
      return revokedRecord;
    }
  };

  const capability_limiters: SandboxSecurityCapabilityLimiterRegistry = {
    consume() {
      return { allowed: true };
    },
    remove(capabilityId) {
      if (state.limiter_error !== undefined) throw state.limiter_error;
      state.removed.push(capabilityId);
    },
    size() {
      return state.removed.length;
    }
  };

  const create = get<(
    value: Readonly<{
      repository: SandboxSecurityCapabilityRepository;
      enforcement_audit_repository: SandboxSecurityEnforcementAuditCapabilityRepository;
      hmac: SandboxSecurityHmacService;
      production_mode: "local";
      runtime: SandboxSecurityRuntimePort;
      audit_projector: SandboxSecurityAuditProjector;
      capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
    }>
  ) => SandboxSecurityCapabilityService>("createSandboxSecurityCapabilityService");
  const service = create({
    repository,
    enforcement_audit_repository: repository,
    hmac,
    production_mode: "local",
    runtime,
    audit_projector,
    capability_limiters
  });
  return { service, repository, runtime, hmac, audit_projector, capability_limiters, state };
}

function makeHmac(): SandboxSecurityHmacService {
  const factory = get<(key: Uint8Array) => SandboxSecurityHmacService>(
    "createSandboxSecurityHmacService"
  );
  return factory(KEY);
}

test("REQ-SBX-GENERAL-003 normalizes a default-TTL evaluate grant", () => {
  const normalize = get<(value: unknown) => unknown>(
    "normalizeSandboxSecurityCapabilityIssueRequest"
  );
  assert.deepEqual(normalize(makeIssue()), {
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "operator:alpha",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    ttl_seconds: 900
  });
});

test("REQ-SBX-GENERAL-003 enforces capability TTL and grant matrix", () => {
  const normalize = get<(value: unknown) => unknown>(
    "normalizeSandboxSecurityCapabilityIssueRequest"
  );
  for (const ttl of [59, 3601, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalize(makeIssue({ ttl_seconds: ttl })), null);
  }
  for (const ttl of [60, 3600]) {
    assert.equal((normalize(makeIssue({ ttl_seconds: ttl })) as any).ttl_seconds, ttl);
  }
  assert.equal(
    normalize(makeIssue({ scopes: ["sandbox_security:audit:read"], allowed_stages: [], allowed_policy_profile_ids: [] })) !== null,
    true
  );
  assert.equal(
    normalize(makeIssue({ scopes: ["sandbox_security:audit:read"], allowed_stages: ["user_input"] })) ,
    null
  );
  assert.equal(
    normalize(makeIssue({ scopes: [], allowed_stages: [], allowed_policy_profile_ids: [] })),
    null
  );
});

test("REQ-SBX-GENERAL-003 rejects duplicate, sparse, inherited, and accessor grants", () => {
  const normalize = get<(value: unknown) => unknown>(
    "normalizeSandboxSecurityCapabilityIssueRequest"
  );
  assert.equal(normalize(makeIssue({ scopes: ["sandbox_security:evaluate", "sandbox_security:evaluate"] })), null);
  const sparse = new Array(1) as unknown[];
  assert.equal(normalize(makeIssue({ scopes: sparse })), null);
  const inherited = Object.create({ subject_id: "operator:inherited" });
  Object.assign(inherited, makeIssue());
  delete inherited.subject_id;
  assert.equal(normalize(inherited), null);
  const accessor = makeIssue();
  Object.defineProperty(accessor, "subject_id", {
    enumerable: true,
    get() {
      return "operator:accessor";
    }
  });
  assert.equal(normalize(accessor), null);
});

test("REQ-SBX-GENERAL-003 authenticates unknown and malformed tokens as unknown", () => {
  const create = get<(input: Readonly<{
    repository: ReturnType<typeof makeRepository>;
    enforcement_audit_repository: ReturnType<typeof makeRepository>;
    hmac: SandboxSecurityHmacService;
    production_mode: "local";
    bootstrap_admin_token: string;
    now: () => string;
  }>) => any>("createSandboxSecurityCapabilityAuthenticator");
  const authenticator = create({
    repository: makeRepository(makeRecord()),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  assert.deepEqual(authenticator.authenticateToken("not-a-capability"), { kind: "unknown" });
  assert.deepEqual(authenticator.authenticateToken(`${TOKEN.slice(0, -1)}!`), { kind: "unknown" });
  assert.deepEqual(authenticator.authenticateToken(`${TOKEN}x`), { kind: "unknown" });
});

test("REQ-SBX-GENERAL-004 public v1 authenticator rejects a private enforcement record", () => {
  const privateRecord = {
    ...makeRecord(),
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: ["user_input", "model_output", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
    composition_binding: "sandbox-security-production-composition.v1:local"
  } as unknown as SandboxSecurityPrivateCapabilityPersistenceRecord;
  const repository = makeRepository(null) as unknown as {
    findEnforcementAuditByTokenDigest(
      digest: `sha256:${string}`
    ): SandboxSecurityPrivateCapabilityPersistenceRecord | null;
  };
  repository.findEnforcementAuditByTokenDigest = () => privateRecord;
  const create = get<(input: any) => any>("createSandboxSecurityCapabilityAuthenticator");
  const authenticator = create({
    repository,
    enforcement_audit_repository: repository,
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  assert.deepEqual(authenticator.authenticateToken(TOKEN), { kind: "unknown" });
});

test("REQ-SBX-GENERAL-003 returns content-free known-denied and authorized projections", () => {
  const create = get<(input: any) => any>("createSandboxSecurityCapabilityAuthenticator");
  const record = makeRecord();
  const authenticator = create({
    repository: makeRepository(record),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  const authorized = authenticator.authenticateToken(TOKEN);
  assert.equal(authorized.kind, "authorized");
  if (authorized.kind === "authorized") {
    assert.deepEqual(Object.keys(authorized.capability).sort(), [
      "allowed_policy_profile_ids",
      "allowed_stages",
      "authorization_scope_id",
      "capability_id",
      "expires_at",
      "issued_at",
      "scopes",
      "subject_id"
    ]);
    assert.equal("token_digest" in authorized.capability, false);
    assert.equal("scope_seed" in authorized.capability, false);
  }

  const expired = create({
    repository: makeRepository(makeRecord({ expires_at: NOW })),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  }).authenticateToken(TOKEN);
  assert.deepEqual(expired, {
    kind: "known_denied",
    rejection_code: "capability_expired",
    audit_identity: {
      capability_id: record.capability_id,
      subject_id: record.subject_id,
      authorization_scope_id: makeHmac().authorizationScopeId(SCOPE_SEED, "local"),
      scopes: ["sandbox_security:evaluate"],
      allowed_stages: ["user_input", "tool_request"],
      allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
      issued_at: record.issued_at,
      expires_at: NOW
    }
  });

  const revoked = create({
    repository: makeRepository(makeRecord({ revoked_at: "2026-08-05T11:59:00.000Z" })),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  }).authenticateToken(TOKEN);
  assert.equal(revoked.kind, "known_denied");
  if (revoked.kind === "known_denied") {
    assert.equal(revoked.rejection_code, "capability_revoked");
    assert.deepEqual(Object.keys(revoked.audit_identity).sort(), [
      "allowed_policy_profile_ids",
      "allowed_stages",
      "authorization_scope_id",
      "capability_id",
      "expires_at",
      "issued_at",
      "scopes",
      "subject_id"
    ]);
  }

  const changedMode = create({
    repository: makeRepository(record),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "rule_only",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  }).authenticateToken(TOKEN);
  assert.equal(changedMode.kind, "authorized");
  if (authorized.kind === "authorized" && changedMode.kind === "authorized") {
    assert.notEqual(
      authorized.capability.authorization_scope_id,
      changedMode.capability.authorization_scope_id
    );
  }
});

test("REQ-SBX-GENERAL-003 checks scope before stage and profile grants", () => {
  const create = get<(input: any) => any>("createSandboxSecurityCapabilityAuthenticator");
  const authenticator = create({
    repository: makeRepository(makeRecord()),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  const capability = authenticator.authenticateToken(TOKEN);
  assert.equal(capability.kind, "authorized");
  if (capability.kind !== "authorized") return;
  assert.throws(
    () => authenticator.requireEvaluationGrant(capability.capability, makeSubmission({ stage: "model_output" })),
    (error: any) => error?.code === "SANDBOX_SECURITY_FORBIDDEN" && error.audit_rejection_code === "stage_forbidden"
  );
  assert.throws(
    () => authenticator.requireEvaluationGrant(capability.capability, makeSubmission({ policy_profile_id: "sandbox-security-balanced.v1" })),
    (error: any) => error?.code === "SANDBOX_SECURITY_FORBIDDEN" && error.audit_rejection_code === "profile_forbidden"
  );
  const readOnly = {
    ...capability.capability,
    scopes: ["sandbox_security:audit:read"] as const,
    allowed_stages: [] as const,
    allowed_policy_profile_ids: [] as const
  };
  assert.throws(
    () => authenticator.requireEvaluationGrant(readOnly, makeSubmission({ stage: "model_output" })),
    (error: any) => error?.code === "SANDBOX_SECURITY_FORBIDDEN" && error.audit_rejection_code === "scope_forbidden"
  );
});

test("REQ-SBX-GENERAL-003 authenticates bootstrap administrators with fixed digest comparison", () => {
  const create = get<(input: any) => any>("createSandboxSecurityCapabilityAuthenticator");
  const authenticator = create({
    repository: makeRepository(makeRecord()),
    enforcement_audit_repository: makeRepository(null),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  assert.doesNotThrow(() => authenticator.authenticateAdministrator("admin-secret"));
  assert.throws(
    () => authenticator.authenticateAdministrator("wrong-secret"),
    (error: any) => error?.code === "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
  );
});

test("REQ-SBX-GENERAL-003 issues one-time bearer and persists digest only", () => {
  const fixture = makeCapabilityServiceFixture();
  const result = fixture.service.issue(FIXED_NORMALIZED_GRANT);
  assert.match(result.bearer_token, /^sbxcap_v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(result.expires_at, "2026-08-05T00:15:00.000Z");
  assert.equal(fixture.state.random_calls.length, 2);
  assert.deepEqual(fixture.state.random_calls, [32, 32]);
  assert.equal(fixture.state.next_capability_id_calls, 1);
  assert.equal(fixture.state.next_audit_event_id_calls, 1);
  assert.equal(fixture.state.issued.length, 1);
  const issued = fixture.state.issued[0];
  assert.ok(issued);
  assert.equal("bearer_token" in issued.record, false);
  assert.match(issued.record.token_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    issued.record.token_digest,
    `sha256:${createHash("sha256").update(result.bearer_token, "ascii").digest("hex")}`
  );
  assert.deepEqual(issued.record.scope_seed, SCOPE_SEED);
  assert.notStrictEqual(issued.record.scope_seed, SCOPE_SEED);
  assert.equal(issued.event.event_type, "capability_issued");
  assert.equal("bearer_token" in issued.event, false);
  assert.equal("token_digest" in issued.event, false);
  assert.equal("scope_seed" in issued.event, false);
  assert.deepEqual(Object.keys(result).sort(), [
    "allowed_policy_profile_ids",
    "allowed_stages",
    "bearer_token",
    "capability_id",
    "expires_at",
    "issued_at",
    "revoked_at",
    "schema_version",
    "scopes",
    "subject_id"
  ]);
  assert.match(result.capability_id, /^capability:[0-9a-f-]{36}$/);
  assert.equal(result.revoked_at, null);
  result.scopes[0] = "sandbox_security:audit:read";
  assert.deepEqual(issued.record.scopes, FIXED_NORMALIZED_GRANT.scopes);
});

test("REQ-SBX-GENERAL-003 uses exact normalized TTL boundaries", () => {
  for (const ttl_seconds of [60, 3600] as const) {
    const fixture = makeCapabilityServiceFixture();
    const result = fixture.service.issue({ ...FIXED_NORMALIZED_GRANT, ttl_seconds });
    assert.equal(
      result.expires_at,
      new Date(Date.parse(CAPABILITY_ISSUE_NOW) + ttl_seconds * 1000).toISOString()
    );
    assert.equal(fixture.state.issued[0]?.record.expires_at, result.expires_at);
  }
});

test("REQ-SBX-GENERAL-003 maps atomic issue failures to internal without leaking bearer", () => {
  const fixture = makeCapabilityServiceFixture({ issue_error: new Error("storage failed") });
  assert.throws(
    () => fixture.service.issue(FIXED_NORMALIZED_GRANT),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR" &&
      !String(error).includes("sbxcap_v1") &&
      !String(error).includes(TOKEN)
  );
});

test("REQ-SBX-GENERAL-003 rejects unknown revoke without limiter removal", () => {
  const fixture = makeCapabilityServiceFixture({ revoke_record: null });
  assert.throws(
    () => fixture.service.revoke(CAPABILITY_ID),
    (error: any) => error?.code === "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
  );
  assert.deepEqual(fixture.state.removed, []);
  assert.deepEqual(fixture.state.revoked, [
    { capability_id: CAPABILITY_ID, revoked_at: CAPABILITY_ISSUE_NOW }
  ]);
  assert.deepEqual(fixture.state.revoked_inputs, []);
});

test("REQ-SBX-GENERAL-003 makes revoke idempotent and returns a content-free public record", () => {
  const fixture = makeCapabilityServiceFixture({ now: "2026-08-05T00:02:00.000Z" });
  const first = fixture.service.revoke(CAPABILITY_ID);
  const second = fixture.service.revoke(CAPABILITY_ID);
  assert.equal(first.revoked_at, "2026-08-05T00:02:00.000Z");
  assert.equal(second.revoked_at, first.revoked_at);
  assert.equal(fixture.state.revoked_inputs.length, 1);
  assert.equal(fixture.state.next_audit_event_id_calls, 1);
  assert.deepEqual(fixture.state.removed, [CAPABILITY_ID, CAPABILITY_ID]);
  assert.deepEqual(Object.keys(first).sort(), [
    "allowed_policy_profile_ids",
    "allowed_stages",
    "capability_id",
    "expires_at",
    "issued_at",
    "revoked_at",
    "schema_version",
    "scopes",
    "subject_id"
  ]);
  assert.equal("token_digest" in first, false);
  assert.equal("scope_seed" in first, false);
  first.scopes[0] = "sandbox_security:audit:read";
  assert.equal(second.scopes[0], "sandbox_security:evaluate");
});

test("REQ-SBX-GENERAL-003 maps revoke and limiter failures to tagged internal errors", () => {
  const revokeFailure = makeCapabilityServiceFixture({ revoke_error: new Error("db failed") });
  assert.throws(
    () => revokeFailure.service.revoke(CAPABILITY_ID),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  const limiterFailure = makeCapabilityServiceFixture({
    now: "2026-08-05T00:02:00.000Z",
    limiter_error: new Error("limiter failed")
  });
  assert.throws(
    () => limiterFailure.service.revoke(CAPABILITY_ID),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
});

test("REQ-SBX-GENERAL-003 does not pass through dependency capability-not-found errors", () => {
  const dependencyNotFound = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
  });
  const repositoryFailure = makeCapabilityServiceFixture({ revoke_error: dependencyNotFound });
  assert.throws(
    () => repositoryFailure.service.revoke(CAPABILITY_ID),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.deepEqual(repositoryFailure.state.removed, []);

  const projectorFailure = makeCapabilityServiceFixture({ projector_error: dependencyNotFound });
  assert.throws(
    () => projectorFailure.service.revoke(CAPABILITY_ID),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );
  assert.deepEqual(projectorFailure.state.removed, []);
});
