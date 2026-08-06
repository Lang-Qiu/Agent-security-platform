import assert from "node:assert/strict";
import test from "node:test";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityPrivateCapabilityPersistenceRecord,
  SandboxSecurityPrivateAuthorizedCapability,
  SandboxSecurityPrivateCapabilityScope
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type {
  SandboxSecurityPrivateAuthorizedCapability as ModulePrivateAuthorizedCapability
} from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type {
  SandboxSecurityProductionCompositionBinding
} from "../../shared/types/sandbox-security-enforcement-audit.ts";

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
  );
  assert.equal(typeof normalize, "function");
  const normalized = normalize(REQUEST);
  assert.deepEqual(normalized, REQUEST);
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
