import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type {
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityHmacService
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityRequest } from "../../shared/types/sandbox-security.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const SCOPE_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 41);
const NOW = "2026-08-05T12:00:00.000Z";
const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;

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
    }
  };
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
    hmac: SandboxSecurityHmacService;
    production_mode: "local";
    bootstrap_admin_token: string;
    now: () => string;
  }>) => any>("createSandboxSecurityCapabilityAuthenticator");
  const authenticator = create({
    repository: makeRepository(makeRecord()),
    hmac: makeHmac(),
    production_mode: "local",
    bootstrap_admin_token: "admin-secret",
    now: () => NOW
  });
  assert.deepEqual(authenticator.authenticateToken("not-a-capability"), { kind: "unknown" });
  assert.deepEqual(authenticator.authenticateToken(`${TOKEN.slice(0, -1)}!`), { kind: "unknown" });
  assert.deepEqual(authenticator.authenticateToken(`${TOKEN}x`), { kind: "unknown" });
});

test("REQ-SBX-GENERAL-003 returns content-free known-denied and authorized projections", () => {
  const create = get<(input: any) => any>("createSandboxSecurityCapabilityAuthenticator");
  const record = makeRecord();
  const authenticator = create({
    repository: makeRepository(record),
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
