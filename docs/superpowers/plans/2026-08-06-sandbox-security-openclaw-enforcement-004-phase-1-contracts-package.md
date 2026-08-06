# Phase 1 Contracts and Package Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Establish importable, exact GENERAL-004 contracts, permanent status
gates, a standalone OpenClaw package root, and listener-specific route/script
surfaces before persistence or enforcement behavior is implemented.

**Architecture:** New enforcement audit/capability DTOs are versioned beside,
not inside, GENERAL-003 public v1 unions. The current Track 1 OpenClaw package
remains the parent package; `integrations/openclaw/general-security/` owns an
independent dependency tree and build. The internal route matcher recognizes
the audit path, while controller dispatch remains Phase 2-owned.

**Tech Stack:** TypeScript ESM, `node:test`, repository file gates, shared
exact-key normalizers, pnpm lockfile generation, esbuild.

---

## Entry Gate

- [ ] Read the approved spec sections `Scope`, `Package and Image Isolation`,
  `Dedicated Capability Provisioning`, `Request and Acknowledgement`, and
  `Planned Implementation Surface`.
- [ ] Confirm the final plan review is `PASS` and the user has explicitly
  approved execution. Before P1-T1, commit the documentation-only transition
  that sets the Master to `PLAN_APPROVED` and `docs/sprint-current.md` to
  `IMPLEMENTATION_IN_PROGRESS`; neither status may be inferred by the worker.
- [ ] Run and record:

```bash
TMPDIR=/tmp npm run test:repo
npm run test:shared
npm run test:backend
npm run test:integration:openclaw
git diff --check
```

Expected: `test:repo` has the thirteen same-cause stale GENERAL-003
current-sprint failures owned by P1-T1 and no other failure; capture the other
baseline counts and preserve unrelated worktree changes. Any different failure
blocks implementation until classified.

## Locked Phase 1 Contracts

The existing GENERAL-003 values remain unchanged:

```ts
type SandboxSecurityCapabilityScope =
  | "sandbox_security:evaluate"
  | "sandbox_security:audit:read";

type SandboxSecurityAuditEvent = /* existing closed v1 union */ never;
```

The new private catalog is separate:

```ts
type SandboxSecurityEnforcementAuditCapabilityScope =
  "sandbox_security:enforcement:audit:write";

type SandboxSecurityEnforcementPoint =
  | "before_agent_run"
  | "before_model_output_delivery"
  | "before_tool_execution"
  | "before_message_delivery";

type SandboxSecurityEnforcementInterruptionCode =
  | "authority_mismatch"
  | "correlation_mismatch"
  | "unsupported_input"
  | "engine_error"
  | "engine_timeout"
  | "engine_slot_unavailable"
  | "barrier_timeout"
  | "startup_recovery";
```

No task widens the old public types to make a test compile.

### Task P1-T1: Permanent Requirement and Plan Gate

**Files:**
- Create: `tests/repository/sandbox-security-openclaw-enforcement.spec.ts`
- Modify: `tests/repository/sandbox-security-backend-spec.spec.ts`
- Modify: `package.json`
- Verify unchanged: `integrations/openclaw/package.json`

- [ ] **Step 1: Confirm the predecessor-gate RED, then write the new failing gate**

First run the existing GENERAL-003 permanent gate after the Entry Gate status
transition:

```bash
TMPDIR=/tmp node --experimental-strip-types \
  --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-backend-spec.spec.ts
```

Expected: all thirteen cases fail for the same intended reason: the historical
GENERAL-003 gate still asserts that the rotating `docs/sprint-current.md` names
GENERAL-003. Record this as a related stale-ownership RED, not as baseline
noise. The gate must preserve GENERAL-003 through its canonical spec and
durable completion record instead of preventing the next requirement from
becoming current.

Then add a GENERAL-004 test that reads committed files without importing future
modules:

```ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("REQ-SBX-GENERAL-004 keeps one reviewed spec and five ordered plans", () => {
  const spec = read(
    "docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md"
  );
  const master = read(
    "docs/superpowers/plans/2026-08-06-sandbox-security-openclaw-enforcement-004-master.md"
  );
  const sprint = read("docs/sprint-current.md");
  const phasePlans = [
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-1-contracts-package.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-2-backend-sqlite.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-3-plugin-enforcement.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-4-openclaw-patch.md",
    "2026-08-06-sandbox-security-openclaw-enforcement-004-phase-5-deployment-closure.md"
  ] as const;
  const rootPackage = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.match(spec, /Final verdict: `PASS`/);
  assert.match(spec, /Status: `SPEC_APPROVED`/);
  assert.match(spec, /openclaw@2026\.6\.34/);
  assert.match(master, /Status: `PLAN_APPROVED`/);
  assert.match(
    sprint,
    /## Status\s+(IMPLEMENTATION_IN_PROGRESS|IMPLEMENTED_PENDING_GLOBAL_P6_GATE)/
  );
  assert.match(sprint, /PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE/);
  const discoveredPhasePlans = readdirSync(
    new URL("../../docs/superpowers/plans/", import.meta.url)
  ).filter((name) =>
    /^2026-08-06-sandbox-security-openclaw-enforcement-004-phase-.*\.md$/.test(name)
  ).sort();
  assert.deepEqual(discoveredPhasePlans, [...phasePlans].sort());
  let previousIndex = -1;
  for (const [index, filename] of phasePlans.entries()) {
    read(`docs/superpowers/plans/${filename}`);
    const currentIndex = master.indexOf(`| ${index + 1} | \`${filename}\``);
    assert.ok(currentIndex > previousIndex, `plan ${index + 1} is missing or out of order`);
    previousIndex = currentIndex;
  }
  assert.match(
    rootPackage.scripts?.["test:repo"] ?? "",
    /sandbox-security-openclaw-enforcement\.spec\.ts/
  );
});

test("REQ-SBX-GENERAL-004 leaves the Track 1 package pin unchanged", () => {
  const track1 = JSON.parse(read("integrations/openclaw/package.json")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(track1.dependencies?.openclaw, "2026.6.10");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts
```

Expected: after the Entry Gate status transition, the new gate FAILS only
because `test:repo` does not yet include it. The separately captured
GENERAL-003 RED must still fail only on stale current-sprint ownership. A
draft/review-pending status is an invalid execution precondition, not an
acceptable behavioral RED.

- [ ] **Step 3: Repair permanent ownership and register the new gate**

In `sandbox-security-backend-spec.spec.ts`, replace only the obsolete
current-sprint ownership checks:

- remove `SPRINT_PATH`, `LEGAL_GENERAL_003_STATUSES`, `currentStatus`, and the
  sprint file from `readSnapshot()`;
- add `docs/progress.md` and the existing GENERAL-003 canonical spec to the
  snapshot;
- require the canonical spec to name `REQ-SBX-GENERAL-003`;
- extract exactly the durable
  `## 2026-08-06 - REQ-SBX-GENERAL-003 P6-T4 durable documentation and final verification`
  section from `docs/progress.md`;
- require that section to contain status
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`, dependency
  `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`, and no positive `VERIFIED`
  claim; and
- keep every backend/source/route/SQLite/privacy assertion unchanged.

Apply the same canonical-spec/progress checks in the gate's top-level identity
test and its snapshot assertion helper so all mutation tests regain a valid
base snapshot. Add a negative mutation proving removal of the P6-T4 completion
status is rejected. Do not weaken the dependency boundary merely to make the
suite pass.

Append the exact GENERAL-004 test path to the existing `test:repo` command. Do
not reorder or remove another test and do not edit the Track 1 package.

- [ ] **Step 4: Run GREEN and regression checks**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts
TMPDIR=/tmp node --experimental-strip-types \
  --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-backend-spec.spec.ts
TMPDIR=/tmp npm run test:repo
git diff --check
```

Expected: the new focused test passes, all GENERAL-003 permanent-gate cases pass
against canonical history rather than current sprint ownership, and the
repository gate is fully green. Running without a writable `TMPDIR` may fail
unrelated FOFA temp-directory cases on this Windows-mounted workspace and is
not accepted as evidence for this task.

- [ ] **Step 5: Commit**

```bash
git add package.json \
  tests/repository/sandbox-security-backend-spec.spec.ts \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts
git commit -m "test(sandbox): gate GENERAL-004 implementation surfaces"
```

### Task P1-T2: Versioned Enforcement Audit Contracts

**Files:**
- Create: `shared/types/sandbox-security-enforcement-audit.ts`
- Create: `shared/contracts/sandbox-security-enforcement-audit.ts`
- Create: `shared/tests/sandbox-security-enforcement-audit-contract.spec.ts`
- Modify: `shared/index.ts`
- Modify: `shared/package.json`
- Modify: `package.json`
- Verify unchanged behavior: `shared/types/sandbox-security-api.ts`
- Verify unchanged behavior: `shared/contracts/sandbox-security-api.ts`

- [ ] **Step 1: Write failing runtime contract tests through `shared/index.ts`**

Cover both exact request variants, all three durable variants, the exact
acknowledgement, exact count-map keys, prototype/accessor/symbol rejection,
stage-point relations, action-host relations, interruption floors,
ID/timestamp/bounds, and old-v1 rejection of a new event:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import * as shared from "../index.ts";

test("REQ-SBX-GENERAL-004 exports private enforcement audit normalizers", () => {
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeSandboxSecurityEnforcementAuditRequest,
    "function"
  );
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeSandboxSecurityEnforcementAuditEvent,
    "function"
  );
  assert.equal(
    typeof (shared as Record<string, unknown>)
      .normalizeOpenClawEnforcementAuditAck,
    "function"
  );
});

test("REQ-SBX-GENERAL-004 keeps the public v1 audit union closed", () => {
  const value = {
    schema_version: "sandbox-security-enforcement-audit-event.v1",
    event_type: "enforcement_completed"
  };
  assert.equal(shared.normalizeSandboxSecurityAuditEvent(value), null);
});
```

Add fixtures with exact lower-case `audit:<UUIDv4>` event IDs and
`request:<UUIDv4>` evaluation IDs, strict UTC milliseconds, all nine category
keys, all six detector status keys, and a `4096` total boundary. Reject request
IDs with a different prefix, UUID version/variant/case, extra characters, or a
run/call/session-derived shape. Ack fixtures cover only `accepted|replayed`,
reject every extra/missing key, and use the same event-ID and timestamp grammars
as the request/durable event.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test shared/tests/sandbox-security-enforcement-audit-contract.spec.ts
```

Expected: assertion FAIL because the two new normalizers are not exported;
the old v1 closure assertion already passes.

- [ ] **Step 3: Add exact private types and normalizers**

Define these top-level unions in the new type file:

```ts
export type SandboxSecurityEnforcementAuditRequest =
  | (SandboxSecurityEnforcementAuditCommon & {
      event_type: "enforcement_completed";
      verdict: SandboxSecurityVerdict;
      action: SandboxSecurityAction;
      risk_level: "info" | SandboxSecuritySeverity;
      category_counts: SandboxSecurityAuditCategoryCounts;
      detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
      host_outcome: "continued" | "replaced";
    })
  | (SandboxSecurityEnforcementAuditCommon & {
      event_type: "enforcement_interrupted";
      interruption_code: SandboxSecurityEnforcementInterruptionCode;
      applied_fail_closed_action: "ask" | "deny";
    });

export type SandboxSecurityEnforcementAuditEvent =
  | SandboxSecurityEnforcementCompletedEvent
  | SandboxSecurityEnforcementInterruptedEvent
  | SandboxSecurityEnforcementAuditCapabilityIssuedEvent;

export interface OpenClawEnforcementAuditAck {
  schema_version: "sandbox-security-enforcement-audit-ack.v1";
  event_id: string;
  status: "accepted" | "replayed";
  occurred_at: string;
}
```

The durable base adds exact backend fields
`schema_version`, `subject_id`, `authorization_scope_id`, `capability_id`, and
`occurred_at`. The capability-issued variant uses
`event_type: "capability_issued"`, one fixed scope, all three stages, one
profile, composition, issued-at, and expires-at; it has no token field.

Implement the normalizer with ordinary data-property checks and closed arrays.
Use imported catalogs from existing shared types. Return fresh deeply frozen
objects; require the private audit request's `request_id` to match exact
lower-case `request:<UUIDv4>` even though GENERAL-001's public correlation
grammar is broader, and do not call or modify the public v1 normalizer.

Export only the new types and the request, durable-event, and acknowledgement
normalizers from `shared/index.ts`. P2 and P3 must import the acknowledgement
type/normalizer from this boundary rather than defining a second copy. Register
the test in root/shared scripts.

- [ ] **Step 4: Run GREEN and typecheck**

```bash
node --experimental-strip-types --test shared/tests/sandbox-security-enforcement-audit-contract.spec.ts
npm run test:shared
npm run typecheck:shared
git diff --check
```

Expected: all new matrix cases pass; all GENERAL-003 v1 tests remain green.

- [ ] **Step 5: Commit**

```bash
git add shared/types/sandbox-security-enforcement-audit.ts \
  shared/contracts/sandbox-security-enforcement-audit.ts \
  shared/tests/sandbox-security-enforcement-audit-contract.spec.ts \
  shared/index.ts shared/package.json package.json
git commit -m "feat(shared): add private enforcement audit contracts"
```

### Task P1-T3: Backend-Private Capability DTO and Type Ledger

**Files:**
- Create: `backend/src/modules/sandbox-security/dto/enforcement-audit-capability.ts`
- Create: `backend/tests/sandbox-security-enforcement-audit-capability.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing boundary test through the existing module**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import * as boundary from
  "../src/modules/sandbox-security/sandbox-security.module.ts";

test("REQ-SBX-GENERAL-004 normalizes only the private capability issue schema", () => {
  const normalize = Reflect.get(
    boundary,
    "normalizeSandboxSecurityEnforcementAuditCapabilityIssueRequest"
  );
  assert.equal(typeof normalize, "function");
  assert.deepEqual(normalize({
    schema_version:
      "sandbox-security-enforcement-audit-capability-issue-request.v1",
    subject_id: "integration:openclaw",
    policy_profile_id: "sandbox-security-balanced.v1",
    ttl_seconds: 3600
  }), {
    schema_version:
      "sandbox-security-enforcement-audit-capability-issue-request.v1",
    subject_id: "integration:openclaw",
    policy_profile_id: "sandbox-security-balanced.v1",
    ttl_seconds: 3600
  });
});
```

Add rejection cases for missing/extra keys, public `scopes`, stages, mode,
endpoint, accessor/prototype/symbol properties, subject grammar, profile
catalog, and TTL `59/3601/non-integer`.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-capability.spec.ts
```

Expected: FAIL because the existing module has no new normalizer export.

- [ ] **Step 3: Implement only DTO/types/exports**

Add exact request/result/storage types from the spec. The result has:

```ts
interface SandboxSecurityEnforcementAuditCapabilityIssueResult {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-result.v1";
  capability_id: string;
  subject_id: string;
  scopes: ["sandbox_security:enforcement:audit:write"];
  allowed_stages: ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  bearer_token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: null;
}

type SandboxSecurityProductionCompositionBinding =
  | "sandbox-security-production-composition.v1:rule_only"
  | "sandbox-security-production-composition.v1:local"
  | "sandbox-security-production-composition.v1:local_and_judge";
```

Define private stored/authorized capability unions without widening the shared
public scope. Reuse the exact closed composition-binding type in the result,
stored grant, authenticator inputs, and tests; no private capability boundary
may widen it back to `string`. Re-export the normalizer/type-only ledger from
the existing module; do not add service behavior.

- [ ] **Step 4: Run GREEN and backend typecheck**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-enforcement-audit-capability.spec.ts
npm run typecheck:backend
npm run test:backend
git diff --check
```

Expected: focused test passes and GENERAL-003 capability tests remain green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sandbox-security/dto/enforcement-audit-capability.ts \
  backend/src/modules/sandbox-security/sandbox-security.types.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-enforcement-audit-capability.spec.ts package.json
git commit -m "feat(sandbox): define enforcement audit capability contracts"
```

### Task P1-T4: Standalone OpenClaw General-Security Package

**Files:**
- Create: `integrations/openclaw/general-security/package.json`
- Create: `integrations/openclaw/general-security/pnpm-workspace.yaml`
- Create: `integrations/openclaw/general-security/pnpm-lock.yaml`
- Create: `integrations/openclaw/general-security/tsconfig.json`
- Create: `integrations/openclaw/general-security/scripts/build.mjs`
- Create: `integrations/openclaw/general-security/src/index.ts`
- Create: `integrations/openclaw/general-security/openclaw.plugin.json`
- Create: `integrations/openclaw/general-security/config/openclaw-security.json5`
- Create: `tests/repository/sandbox-security-openclaw-package.spec.ts`
- Verify unchanged: `integrations/openclaw/package.json`

- [ ] **Step 1: Write a failing package-isolation repository test**

Assert the nested package exists, pins exact OpenClaw/integrity-compatible
version, owns its lock/build/manifest/config, and the parent still pins
`2026.6.10`:

```ts
test("REQ-SBX-GENERAL-004 isolates OpenClaw package roots", () => {
  const parent = readJson("integrations/openclaw/package.json");
  const security = readJson(
    "integrations/openclaw/general-security/package.json"
  );
  const nestedWorkspace = read(
    "integrations/openclaw/general-security/pnpm-workspace.yaml"
  );
  const nestedLock = read(
    "integrations/openclaw/general-security/pnpm-lock.yaml"
  );
  assert.equal(parent.dependencies.openclaw, "2026.6.10");
  assert.equal(security.dependencies.openclaw, "2026.6.34");
  assert.equal(security.name,
    "@agent-security-platform/openclaw-general-security");
  assert.deepEqual(security.openclaw, {
    extensions: ["./dist/index.js"],
    compat: {
      pluginApi: ">=2026.6.34",
      minGatewayVersion: "2026.6.34"
    },
    build: {
      openclawVersion: "2026.6.34",
      pluginSdkVersion: "2026.6.34"
    }
  });
  assert.equal(nestedWorkspace, 'packages:\n  - "."\n');
  assert.match(
    nestedLock,
    /importers:\s+\.:\s+dependencies:\s+openclaw:\s+specifier: 2026\.6\.34\s+version: 2026\.6\.34/
  );
  assert.match(
    nestedLock,
    /openclaw@2026\.6\.34:\s+resolution: \{integrity: sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB\+8SVFdh0FPNPHRVgZepzNJDfHg==\}/
  );
  assert.equal(
    createHash("sha256").update(read("pnpm-lock.yaml")).digest("hex"),
    "c94b923620ce5e3f82616fa366fb530a2b74b44c5ebbbccf572653c2bea06c0d"
  );
  assert.ok(exists("integrations/openclaw/general-security/openclaw.plugin.json"));
  assert.ok(exists("integrations/openclaw/general-security/pnpm-lock.yaml"));
});
```

Import `createHash` from `node:crypto`; reuse the repository-test `read`,
`readJson`, and `exists` helpers. The root lock SHA-256 is intentionally pinned
to the pre-implementation value so a nested install cannot silently add the
new importer to the root workspace.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test tests/repository/sandbox-security-openclaw-package.spec.ts
```

Expected: FAIL because the nested package does not exist.

- [ ] **Step 3: Create the minimal isolated package**

Use this package shape:

```json
{
  "name": "@agent-security-platform/openclaw-general-security",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --experimental-strip-types --experimental-test-isolation=none --test tests/general-security-*.spec.ts"
  },
  "dependencies": {
    "openclaw": "2026.6.34"
  },
  "devDependencies": {
    "esbuild": "0.25.12",
    "typescript": "6.0.2"
  },
  "openclaw": {
    "extensions": ["./dist/index.js"],
    "compat": {
      "pluginApi": ">=2026.6.34",
      "minGatewayVersion": "2026.6.34"
    },
    "build": {
      "openclawVersion": "2026.6.34",
      "pluginSdkVersion": "2026.6.34"
    }
  }
}
```

Create the nearest workspace boundary before generating the lockfile:

```yaml
packages:
  - "."
```

This nested `pnpm-workspace.yaml` makes `general-security` its own pnpm 10
workspace root even though the repository root already owns a broader
workspace. The nested lockfile must therefore contain importer `.` and the
locked OpenClaw integrity, while the repository-root `pnpm-lock.yaml` retains
SHA-256
`c94b923620ce5e3f82616fa366fb530a2b74b44c5ebbbccf572653c2bea06c0d`.

`src/index.ts` exports a frozen package identity constant only; no hook or
Engine logic is added. The build bundles `src/index.ts` to `dist/index.js` and
keeps `openclaw` external. The native manifest is named exactly
`openclaw.plugin.json` at the package root. The repository RED also asserts the
exact `openclaw.extensions`, compatibility/build metadata, built entry
path, and native manifest layout. Runtime discovery waits for the real plugin
coordinator in P3 and the nested-CLI probe in P4.
The manifest ID is
`agent-security-sandbox-general`, has `additionalProperties: false`, and
requires the four immutable config keys. The checked-in JSON5 config uses
environment references, never a token literal.

Generate the nested lockfile using the Master command only after the nested
workspace boundary exists, then install/build.

- [ ] **Step 4: Run GREEN and prove isolation**

```bash
node --experimental-strip-types --test tests/repository/sandbox-security-openclaw-package.spec.ts
pnpm --dir integrations/openclaw/general-security run build
test -f integrations/openclaw/general-security/dist/index.js
test "$(node -p 'require("./integrations/openclaw/general-security/node_modules/openclaw/package.json").version')" = "2026.6.34"
test "$(node -p 'require("./integrations/openclaw/package.json").dependencies.openclaw')" = "2026.6.10"
git diff --check
```

Expected: nested build produces the declared `dist/index.js`, the native
manifest/package metadata are exact, the nested lock owns importer `.`, the
repository-root lock hash is unchanged, and both OpenClaw versions are
independent.

- [ ] **Step 5: Commit**

```bash
git add integrations/openclaw/general-security \
  tests/repository/sandbox-security-openclaw-package.spec.ts
git commit -m "build(openclaw): isolate general security package"
```

Do not stage nested `node_modules` or generated `dist/` unless an existing
repository gate explicitly owns built output.

### Task P1-T5: Internal Route, Typecheck, and Aggregate Scripts

**Files:**
- Modify: `backend/src/common/http/internal-router.ts`
- Modify: `backend/tests/sandbox-security-routes.spec.ts`
- Create: `tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing listener and script tests**

Extend the existing route test:

```ts
assert.deepEqual(
  matchInternalRoute(
    "POST",
    "/internal/sandbox/security/enforcement-events"
  ),
  { name: "enforcementAudit", params: {} }
);
assert.equal(
  matchRoute("POST", "/internal/sandbox/security/enforcement-events"),
  null
);
```

The repository test asserts the two Master script strings exist and include
the exact nested/integration paths.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-routes.spec.ts tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts
```

Expected: route assertion and missing-script assertions fail; existing route
cases pass.

- [ ] **Step 3: Add exact route and scripts**

Add `"enforcementAudit"` to `InternalRouteName` and one exact POST branch
before dynamic capability-route parsing. Reject GET, trailing slash, extra
segments, public listener, and encoded variants.

Add:

```json
{
  "test:integration:openclaw:security": "node --experimental-strip-types --experimental-test-isolation=none --test integrations/openclaw/general-security/tests/general-security-*.spec.ts tests/integration/openclaw-sandbox-security.runtime.spec.ts tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts",
  "typecheck:integration:openclaw:security": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p integrations/openclaw/general-security/tsconfig.json"
}
```

Do not add InternalAppModule dispatch until P2-T5 owns a real controller.

- [ ] **Step 4: Run Phase 1 GREEN gate**

```bash
node --experimental-strip-types --test backend/tests/sandbox-security-routes.spec.ts tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts
npm run test:shared
npm run test:backend
TMPDIR=/tmp npm run test:repo
pnpm --dir integrations/openclaw/general-security run build
git diff --check
```

Expected: all Phase 1 behavior is green; aggregate OpenClaw security script is
not run yet because its later test files do not exist.

- [ ] **Step 5: Commit and stop Phase 1**

```bash
git add backend/src/common/http/internal-router.ts \
  backend/tests/sandbox-security-routes.spec.ts \
  tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts \
  package.json
git commit -m "feat(sandbox): register enforcement audit route surface"
```

## Phase 1 Exit Gate

- [ ] Five task commits exist and no unrelated files were staged.
- [ ] New private contracts are importable and public v1 contract tests pass.
- [ ] Nested OpenClaw package builds with exact `2026.6.34`; Track 1 remains
  exact `2026.6.10`.
- [ ] Internal route matcher recognizes exactly one new path; no controller is
  faked.
- [ ] Focused review has no unresolved Critical or Important finding.

Proceed only to Phase 2. Do not add plugin behavior or patch OpenClaw here.
