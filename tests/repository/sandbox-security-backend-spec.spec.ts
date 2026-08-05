import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SPRINT_PATH = "docs/sprint-current.md";
const PACKAGE_PATH = "package.json";
const TEST_PATH = "tests/repository/sandbox-security-backend-spec.spec.ts";
const CANONICAL_SPEC_PATH =
  "docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md";

const LEGAL_GENERAL_003_STATUSES = new Set([
  "PLAN_FIXED_PENDING_REVIEW",
  "PLAN_REVIEWED_PENDING_USER_APPROVAL",
  "IMPLEMENTATION_IN_PROGRESS",
  "IMPLEMENTED_PENDING_GLOBAL_P6_GATE"
]);

type SandboxSecurityBackendSnapshot = Readonly<{
  files: Readonly<Record<string, string>>;
  package_json: Readonly<{ scripts?: Readonly<Record<string, string>> }>;
}>;

const PUBLIC_ROUTE_CASES = [
  "evaluateSandboxSecurity",
  "listSandboxSecurityAuditEvents"
] as const;
const ADMIN_ROUTE_CASES = [
  "issueSandboxSecurityCapability",
  "revokeSandboxSecurityCapability",
  "purgeSandboxSecurityAuditEvents"
] as const;
const GENERAL_003_SHARED_SPECS = [
  "shared/tests/sandbox-security-contract.spec.ts",
  "shared/tests/sandbox-security-api-contract.spec.ts"
] as const;
const GENERAL_003_BACKEND_SPECS = [
  "backend/tests/sandbox-security-limits.spec.ts",
  "backend/tests/sandbox-security-audit.spec.ts",
  "backend/tests/sandbox-security-admin.controller.spec.ts",
  "backend/tests/sandbox-security-evaluation.service.spec.ts",
  "backend/tests/sandbox-security-hmac.spec.ts",
  "backend/tests/sandbox-security-routes.spec.ts",
  "backend/tests/sandbox-security-simulation-authority.spec.ts",
  "backend/tests/sandbox-security-controller.spec.ts",
  "backend/tests/sandbox-security-idempotency.spec.ts",
  "backend/tests/sandbox-security-capability.spec.ts",
  "backend/tests/sandbox-security-sqlite.spec.ts",
  "backend/tests/main.spec.ts",
  "backend/tests/runtime-dependencies.spec.ts",
  "tests/integration/backend-sandbox-security.api.spec.ts"
] as const;
const SQLITE_TABLES = [
  "sandbox_security_schema_migrations",
  "sandbox_security_metadata",
  "sandbox_security_capabilities",
  "sandbox_security_capability_scopes",
  "sandbox_security_capability_stages",
  "sandbox_security_capability_profiles",
  "sandbox_security_idempotency_records",
  "sandbox_security_audit_events"
] as const;
const SQLITE_INDEXES = [
  "sandbox_security_idempotency_expiry_idx",
  "sandbox_security_audit_visibility_order_idx",
  "sandbox_security_audit_retention_idx"
] as const;
const SQLITE_INDEX_CATALOG = [
  "CREATE INDEX sandbox_security_idempotency_expiry_idx ON sandbox_security_idempotency_records(expires_at);",
  "CREATE INDEX sandbox_security_audit_visibility_order_idx ON sandbox_security_audit_events( visibility_subject_id, occurred_at DESC, event_id DESC);",
  "CREATE INDEX sandbox_security_audit_retention_idx ON sandbox_security_audit_events(occurred_at, event_id);"
] as const;
const SQLITE_CHECK_CATALOG = [
  "CHECK (version >= 1)",
  "CHECK (key IN ('deployment_key_id'))",
  "CHECK (length(value) BETWEEN 1 AND 256)",
  "CHECK (length(subject_id) BETWEEN 1 AND 64)",
  "CHECK (length(token_digest) = 71)",
  "CHECK (length(scope_seed) = 32)",
  "CHECK (expires_at > issued_at)",
  "CHECK (revoked_at IS NULL OR revoked_at >= issued_at)",
  "CHECK (scope IN ( 'sandbox_security:evaluate', 'sandbox_security:audit:read'))",
  "CHECK (stage IN ( 'user_input', 'model_output', 'tool_request'))",
  "CHECK (policy_profile_id IN ( 'sandbox-security-balanced.v1', 'sandbox-security-strict.v1'))",
  "CHECK (length(subject_id) BETWEEN 1 AND 64)",
  "CHECK (length(request_id) BETWEEN 1 AND 128)",
  "CHECK (stage IN ( 'user_input', 'model_output', 'tool_request'))",
  "CHECK (policy_profile_id IN ( 'sandbox-security-balanced.v1', 'sandbox-security-strict.v1'))",
  "CHECK (composition_binding IN ( 'sandbox-security-production-composition.v1:rule_only', 'sandbox-security-production-composition.v1:local', 'sandbox-security-production-composition.v1:local_and_judge'))",
  "CHECK (status IN ( 'in_progress', 'completed', 'interrupted'))",
  "CHECK (expires_at > created_at)",
  "CHECK ( (status = 'completed' AND response_json IS NOT NULL AND length(response_json) BETWEEN 2 AND 16777216) OR (status IN ('in_progress', 'interrupted') AND response_json IS NULL) )",
  "CHECK (event_type IN ( 'evaluation_completed', 'evaluation_replayed', 'evaluation_interrupted', 'request_rejected', 'capability_issued', 'capability_revoked', 'audit_read', 'audit_purged'))",
  "CHECK (length(visibility_subject_id) BETWEEN 1 AND 64)",
  "CHECK (length(event_json) BETWEEN 2 AND 65536)"
] as const;
const FORBIDDEN_AUDIT_KEYS = [
  "raw_token",
  "token",
  "bearer_token",
  "idempotency_key",
  "idempotency_key_hmac",
  "content",
  "provider",
  "model",
  "endpoint",
  "fingerprint",
  "hash",
  "evidence",
  "finding",
  "provenance",
  "locator"
] as const;

function readText(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function readSnapshot(): SandboxSecurityBackendSnapshot {
  const files = [
    "backend/src/main.ts",
    "backend/src/internal-app.module.ts",
    "backend/src/app.module.ts",
    "backend/src/common/http/router.ts",
    "backend/src/common/http/internal-router.ts",
    "backend/src/modules/sandbox-security/sandbox-security.module.ts",
    "backend/src/modules/sandbox-security/sandbox-security.controller.ts",
    "backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts",
    "backend/src/modules/sandbox-security/audit.service.ts",
    "backend/src/modules/sandbox-security/simulation-authority.ts",
    "backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts",
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts",
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts",
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-idempotency.repository.ts",
    "backend/src/modules/sandbox-security/audit-projector.ts",
    "backend/src/modules/sandbox-security/sandbox-security.types.ts",
    "backend/src/modules/sandbox-security/sandbox-security.config.ts",
    "shared/index.ts",
    "shared/types/sandbox-security-api.ts",
    "shared/contracts/sandbox-security-api.ts",
    "shared/contracts/sandbox-security-request.ts",
    "docs/sprint-current.md"
  ] as const;
  return {
    files: Object.fromEntries(files.map((path) => [path, readText(path)])),
    package_json: JSON.parse(readText(PACKAGE_PATH)) as SandboxSecurityBackendSnapshot["package_json"]
  };
}

function extractSqliteChecks(sql: string): string[] {
  const checks: string[] = [];
  let searchFrom = 0;
  while (true) {
    const start = sql.indexOf("CHECK", searchFrom);
    if (start < 0) return checks;
    const open = sql.indexOf("(", start);
    if (open < 0) return checks;
    let depth = 0;
    let quoted = false;
    let end = -1;
    for (let index = open; index < sql.length; index += 1) {
      const character = sql[index];
      if (character === "'") {
        if (quoted && sql[index + 1] === "'") {
          index += 1;
          continue;
        }
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end < 0) return checks;
    checks.push(sql.slice(start, end + 1).replace(/\s+/g, " ").trim());
    searchFrom = end + 1;
  }
}

function assertSandboxSecurityBackendBoundaries(
  snapshot: SandboxSecurityBackendSnapshot
): void {
  // P1-T0 identity/dependency checks remain the first permanent boundary.
  const sprint = snapshot.files[SPRINT_PATH] ?? readText(SPRINT_PATH);
  assert.match(sprint, /\bREQ-SBX-GENERAL-003\b/);
  const status = currentStatus(sprint);
  assert.ok(LEGAL_GENERAL_003_STATUSES.has(status));
  const dependencyGate = extractSection(sprint, "## Dependency Gate");
  assert.match(dependencyGate, /PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE/);
  assertNoVerifiedClaims(sprint);
  const testRepoScript = snapshot.package_json.scripts?.["test:repo"] ?? "";
  assert.ok(testRepoScript.split(/\s+/).includes(TEST_PATH));

  const source = (path: string): string => {
    const value = snapshot.files[path];
    assert.equal(typeof value, "string", `snapshot is missing ${path}`);
    return value;
  };
  const gateway = source(
    "backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts"
  );
  const gatewayImports = [
    ...gateway.matchAll(/(?:from\s+|import\s*)(["'])([^"']+)\1/g)
  ]
    .map((match) => match[2]!)
    .filter((target) => target.includes("engines/sandbox") || target.includes("shared/"));
  assert.deepEqual(
    gatewayImports,
    [
      "../../../../../engines/sandbox/src/security/index.ts",
      "../../../../../engines/sandbox/src/security-production/index.ts",
      "../../../../../shared/index.ts"
    ],
    "production gateway must import only the two public Engine indexes and shared/index"
  );
  for (const target of gatewayImports) {
    assert.ok(
      target.endsWith("engines/sandbox/src/security/index.ts") ||
        target.endsWith("engines/sandbox/src/security-production/index.ts") ||
        target.endsWith("shared/index.ts"),
      `forbidden production gateway import: ${target}`
    );
  }

  const app = source("backend/src/app.module.ts");
  const internalApp = source("backend/src/internal-app.module.ts");
  const routeBlock = (text: string, route: string): string => {
    const start = text.indexOf(`case "${route}"`);
    assert.notEqual(start, -1, `missing route case ${route}`);
    const remainder = text.slice(start);
    const nextCase = remainder.search(/\n\s*case\s+["']/);
    return nextCase === -1 ? remainder : remainder.slice(0, nextCase);
  };
  for (const route of PUBLIC_ROUTE_CASES) {
    assert.match(routeBlock(app, route), /publicController\./);
    assert.doesNotMatch(internalApp, new RegExp(`case\\s+["']${route}["']`));
  }
  for (const route of ADMIN_ROUTE_CASES) {
    assert.match(routeBlock(internalApp, route), /adminController\./);
    assert.doesNotMatch(app, new RegExp(`case\\s+["']${route}["']`));
  }

  const sourceEntries = Object.entries(snapshot.files);
  for (const [path, text] of sourceEntries) {
    assert.doesNotMatch(
      path,
      /(?:^|[\\/])(?:frontend|integrations[\\/]openclaw)(?:[\\/]|$)/i,
      `GENERAL-003 backend snapshot must not include frontend/OpenClaw path: ${path}`
    );
    assert.doesNotMatch(
      text,
      /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|module-not-found/i,
      `missing-module catches are not permitted in ${path}`
    );
    if (/audit/i.test(path)) {
      assert.doesNotMatch(
        text,
        /scheduleInterval|setInterval/i,
        `automatic audit cleanup timer is not permitted in ${path}`
      );
    }
  }

  const sharedScript = snapshot.package_json.scripts?.["test:shared"] ?? "";
  const backendScript = snapshot.package_json.scripts?.["test:backend"] ?? "";
  for (const spec of GENERAL_003_SHARED_SPECS) {
    assert.ok(sharedScript.split(/\s+/).includes(spec), `test:shared must register ${spec}`);
  }
  for (const spec of GENERAL_003_BACKEND_SPECS) {
    assert.ok(backendScript.split(/\s+/).includes(spec), `test:backend must register ${spec}`);
  }

  const auditSources = [
    source("backend/src/modules/sandbox-security/audit-projector.ts"),
    source("backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts"),
    source("shared/types/sandbox-security-api.ts"),
    source("shared/contracts/sandbox-security-api.ts")
  ];
  const forbiddenAuditKeyPattern = new RegExp(
    `(?:^|[\\s,{])(?:${FORBIDDEN_AUDIT_KEYS.join("|")})\\s*[:?]`,
    "mi"
  );
  for (const text of auditSources) {
    assert.doesNotMatch(text, forbiddenAuditKeyPattern, "audit projection contains a raw-content key");
  }
  const auditProjector = auditSources[0]!;
  assert.doesNotMatch(
    auditProjector,
    /scheduleInterval|setInterval|purgeExpired/i,
    "automatic audit cleanup must remain out of the audit projector"
  );

  const requestSources = [
    source("backend/src/modules/sandbox-security/sandbox-security.controller.ts"),
    source("backend/src/modules/sandbox-security/simulation-authority.ts"),
    source("shared/contracts/sandbox-security-request.ts")
  ];
  const callerOptionPattern =
    /(?:^|[\s,{.(])(?:["']?(?:mode|production_mode|enforcement|provider|model|endpoint|timeout|retry|fallback|policy|policy_options|policy_rules)["']?)\s*:/mi;
  const callerOptionAccessPattern =
    /\.(?:mode|production_mode|enforcement|provider|model|endpoint|timeout|retry|fallback|policy|policy_options|policy_rules)\b/mi;
  for (const text of requestSources) {
    assert.doesNotMatch(
      text,
      callerOptionPattern,
      "evaluation requests must not accept caller-selected production options"
    );
    assert.doesNotMatch(
      text,
      callerOptionAccessPattern,
      "evaluation requests must not read caller-selected production options"
    );
  }

  const migrations = source(
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts"
  );
  const actualTables = [...migrations.matchAll(/CREATE TABLE\s+([A-Za-z0-9_]+)/g)].map(
    (match) => match[1]!
  );
  const actualIndexes = [...migrations.matchAll(/CREATE INDEX\s+([A-Za-z0-9_]+)/g)].map(
    (match) => match[1]!
  );
  assert.deepEqual(actualTables, [...SQLITE_TABLES], "SQLite table catalog drifted");
  assert.deepEqual(actualIndexes, [...SQLITE_INDEXES], "SQLite index catalog drifted");
  const normalizedMigrations = migrations.replace(/\s+/g, " ").trim();
  const actualIndexCatalog = normalizedMigrations.match(/CREATE INDEX [^;]+;/g) ?? [];
  assert.deepEqual(actualIndexCatalog, [...SQLITE_INDEX_CATALOG], "SQLite index catalog drifted");
  assert.deepEqual(
    extractSqliteChecks(migrations),
    [...SQLITE_CHECK_CATALOG],
    "SQLite CHECK catalog drifted"
  );
}

function extractSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const bodyStart = start + heading.length;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1
    ? text.slice(bodyStart).trim()
    : text.slice(bodyStart, bodyStart + next).trim();
}

function currentStatus(sprint: string): string {
  const matches = [
    ...sprint.matchAll(/^## Status\s*\n+([A-Z][A-Z0-9_]*)\s*$/gm)
  ];
  assert.equal(
    matches.length,
    1,
    "sprint-current.md must expose exactly one uppercase Status value"
  );
  return matches[0]![1]!;
}

function assertNoVerifiedClaims(sprint: string): void {
  for (const line of sprint.split(/\r?\n/)) {
    if (
      !/\bGENERAL-(?:002|003)\b/.test(line) ||
      !/\bVERIFIED\b/.test(line)
    ) {
      continue;
    }

    assert.match(
      line,
      /\b(?:not|never|does not|cannot|without|absent|pending|provisional|unverified|neither|nor)\b/i,
      `GENERAL-002/003 must not be described as VERIFIED: ${line}`
    );
    if (
      /\bneither\b[^\n]*\bnor\b/i.test(line) ||
      /\bGENERAL-(?:002|003)\s+nor\s+GENERAL-(?:002|003)\b/i.test(line)
    ) {
      continue;
    }
    assert.doesNotMatch(
      line,
      /\b(?:is|was|were|has been|status\s*(?:is|:)|state\s*(?:is|:)|marked|declared|returned)\s+`?VERIFIED`?\b/i,
      `GENERAL-002/003 has a positive VERIFIED claim: ${line}`
    );
  }
}

test("REQ-SBX-GENERAL-003 repository gate enforces canonical identity and dependency-safe status", () => {
  const sprint = readText(SPRINT_PATH);
  const packageJson = JSON.parse(readText(PACKAGE_PATH)) as {
    scripts?: Record<string, string>;
  };

  assert.match(sprint, /\bREQ-SBX-GENERAL-003\b/);
  const canonicalSpec = readText(CANONICAL_SPEC_PATH);
  assert.ok(canonicalSpec.length > 0, `canonical spec is empty: ${CANONICAL_SPEC_PATH}`);
  assert.ok(
    sprint.includes(CANONICAL_SPEC_PATH),
    `sprint-current.md must reference ${CANONICAL_SPEC_PATH}`
  );

  const status = currentStatus(sprint);
  assert.ok(
    LEGAL_GENERAL_003_STATUSES.has(status),
    `illegal GENERAL-003 status: ${status}`
  );

  const dependencyGate = extractSection(sprint, "## Dependency Gate");
  assert.match(
    dependencyGate,
    /PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE/
  );
  assertNoVerifiedClaims(sprint);

  if (dependencyGate.includes("PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE")) {
    if (status.startsWith("IMPLEMENTED")) {
      assert.equal(status, "IMPLEMENTED_PENDING_GLOBAL_P6_GATE");
    }
  }

  const testRepoScript = packageJson.scripts?.["test:repo"] ?? "";
  assert.ok(
    testRepoScript.split(/\s+/).includes(TEST_PATH),
    `test:repo must register ${TEST_PATH}`
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects a copied deep Engine import mutation", () => {
  const snapshot = readSnapshot();
  const gatewayPath =
    "backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts";
  const gateway = snapshot.files[gatewayPath];
  assert.equal(typeof gateway, "string");
  const mutated: SandboxSecurityBackendSnapshot = {
    ...snapshot,
    files: {
      ...snapshot.files,
      [gatewayPath]: `${gateway}\nimport "../../../../engines/sandbox/src/security/private-engine.ts";\n`
    }
  };

  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /public sandbox Engine indexes|deep Engine import|production gateway/i
  );
});

test("REQ-SBX-GENERAL-003 repository gate accepts the real backend snapshot", () => {
  assert.doesNotThrow(() => assertSandboxSecurityBackendBoundaries(readSnapshot()));
});

function mutateSnapshot(
  snapshot: SandboxSecurityBackendSnapshot,
  path: string,
  mutation: (source: string) => string
): SandboxSecurityBackendSnapshot {
  const original = snapshot.files[path];
  assert.equal(typeof original, "string", `snapshot is missing ${path}`);
  return {
    ...snapshot,
    files: { ...snapshot.files, [path]: mutation(original) }
  };
}

test("REQ-SBX-GENERAL-003 repository gate rejects cross-listener route ownership", () => {
  const snapshot = readSnapshot();
  const mutated = mutateSnapshot(
    snapshot,
    "backend/src/app.module.ts",
    (source) => source.replace(
      "this.sandboxSecurityModule.publicController.evaluate(",
      "this.sandboxSecurityModule.adminController.evaluate("
    )
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /publicController|route ownership/i
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects frontend and OpenClaw snapshot paths", () => {
  const snapshot = readSnapshot();
  for (const path of ["frontend/src/sandbox-security.ts", "integrations/openclaw/sandbox.ts"]) {
    const mutated: SandboxSecurityBackendSnapshot = {
      ...snapshot,
      files: { ...snapshot.files, [path]: "export const forbidden = true;" }
    };
    assert.throws(
      () => assertSandboxSecurityBackendBoundaries(mutated),
      /frontend\/OpenClaw path/i
    );
  }
});

test("REQ-SBX-GENERAL-003 repository gate rejects unregistered shared/backend/integration specs", () => {
  const snapshot = readSnapshot();
  const mutations = [
    { script: "test:shared", spec: GENERAL_003_SHARED_SPECS[0]! },
    { script: "test:backend", spec: "backend/tests/main.spec.ts" },
    { script: "test:backend", spec: "backend/tests/runtime-dependencies.spec.ts" },
    { script: "test:backend", spec: "tests/integration/backend-sandbox-security.api.spec.ts" }
  ] as const;
  for (const { script, spec } of mutations) {
    const packageJson = snapshot.package_json;
    const scriptValue = packageJson.scripts?.[script] ?? "";
    const mutated: SandboxSecurityBackendSnapshot = {
      ...snapshot,
      package_json: {
        ...packageJson,
        scripts: {
          ...packageJson.scripts,
          [script]: scriptValue
            .split(/\s+/)
            .filter((entry) => entry !== spec)
            .join(" ")
        }
      }
    };
    assert.throws(
      () => assertSandboxSecurityBackendBoundaries(mutated),
      new RegExp(`${script} must register`),
      spec
    );
  }
});

test("REQ-SBX-GENERAL-003 repository gate rejects an automatic audit cleanup timer", () => {
  const mutated = mutateSnapshot(
    readSnapshot(),
    "backend/src/modules/sandbox-security/audit-projector.ts",
    (source) => `${source}\nsetInterval(() => undefined, 90000);\n`
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /automatic audit cleanup/i
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects a missing-module catch", () => {
  const mutated = mutateSnapshot(
    readSnapshot(),
    "backend/src/modules/sandbox-security/sandbox-security.module.ts",
    (source) => `${source}\ntry { throw new Error("load"); } catch (error) {\n  if ((error as { code?: string }).code === "ERR_MODULE_NOT_FOUND") return;\n}\n`
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /missing-module catches/i
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects every caller-selected production option", () => {
  const options = [
    "mode",
    "enforcement",
    "provider",
    "model",
    "endpoint",
    "timeout",
    "retry",
    "fallback",
    "production_mode",
    "policy",
    "policy_options",
    "policy_rules"
  ] as const;
  for (const option of options) {
    const mutated = mutateSnapshot(
      readSnapshot(),
      "backend/src/modules/sandbox-security/simulation-authority.ts",
      (source) => `${source}\nconst callerSelected = { ${option}: "forbidden" };\n`
    );
    assert.throws(
      () => assertSandboxSecurityBackendBoundaries(mutated),
      /caller-selected production options/,
      option
    );
  }
});

test("REQ-SBX-GENERAL-003 repository gate rejects raw token, idempotency, content, and provider audit keys", () => {
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    const mutated = mutateSnapshot(
      readSnapshot(),
      "backend/src/modules/sandbox-security/audit-projector.ts",
      (source) => `${source}\nconst forbiddenAuditEvent = { ${key}: "sentinel" };\n`
    );
    assert.throws(
      () => assertSandboxSecurityBackendBoundaries(mutated),
      /raw-content key/,
      key
    );
  }
});

test("REQ-SBX-GENERAL-003 repository gate rejects SQLite catalog drift", () => {
  const mutated = mutateSnapshot(
    readSnapshot(),
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts",
    (source) => `${source}\nCREATE TABLE sandbox_security_drift (id TEXT);\n`
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /SQLite table catalog drifted/
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects SQLite index definition drift", () => {
  const mutated = mutateSnapshot(
    readSnapshot(),
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts",
    (source) => source.replace(
      "ON sandbox_security_idempotency_records(expires_at)",
      "ON sandbox_security_idempotency_records(updated_at)"
    )
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /SQLite index catalog drifted/
  );
});

test("REQ-SBX-GENERAL-003 repository gate rejects SQLite CHECK catalog drift", () => {
  const mutated = mutateSnapshot(
    readSnapshot(),
    "backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts",
    (source) => `${source}\nCHECK (drift = 1);\n`
  );
  assert.throws(
    () => assertSandboxSecurityBackendBoundaries(mutated),
    /SQLite CHECK catalog drifted/
  );
});
