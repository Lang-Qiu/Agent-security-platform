# Phase 6 Production Composition and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Connect the backend module to the real GENERAL-001 fingerprint
service and GENERAL-002 production Engine, enforce fail-before-bind production
configuration, close resources safely, and finish privacy/documentation gates.

**Architecture:** A production gateway wraps only the two approved Engine
indexes. The composition root validates four GENERAL-003 environment values,
opens/recovers SQLite, builds the selected production Engine, creates one
shared sandbox module, then binds both listeners. Shutdown drains handlers,
cancels maintenance, checkpoints SQLite, and closes in reverse order.

**Tech Stack:** Node `crypto`, `node:sqlite`, Node `http`, GENERAL-001/002 public
indexes, repository TypeScript compiler, repository tests and durable docs.

---

## Entry Gate

- [ ] Confirm Phase 5 is committed and reviewed.
- [ ] Run:

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
git diff --check
```

## P6-T1: Production Evaluation Gateway

**Files:**

- Create: `backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts`
- Modify: `backend/tests/sandbox-security-evaluation.service.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write gateway RED tests through the module boundary**

```ts
test("REQ-SBX-GENERAL-003 production gateway uses Engine canonical bytes for HMAC fingerprint", () => {
  assert.equal(typeof boundary.createSandboxSecurityProductionEvaluationGateway, "function");
  const fixture = createProductionGatewayFixture();
  const fingerprint = fixture.gateway.fingerprint(FIXED_EVALUATION_REQUEST);
  assert.equal(
    fingerprint,
    "hmac-sha256:b2dc6da1345ba6630fdd7aaf1ef1082724b6d1a481ba03016a28286c750dbb11"
  );
  assert.equal(fixture.canonicalPortCalls, 1);
  assert.equal(fixture.retainedCanonicalBytes, false);
});
```

Add exact composition binding per mode, invalid fingerprint output, fingerprint
throw/no idempotency row, Engine error passthrough to fixed service error,
caller abort, invalid Decision rejection, defensive normalized Decision, and
no detector/provider detail exposure.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*production gateway" \
  backend/tests/sandbox-security-evaluation.service.spec.ts
```

Expected: FAIL because the existing module boundary lacks the production
gateway factory.

- [ ] **Step 3: Implement the approved adapter only**

```ts
export function createSandboxSecurityProductionEvaluationGateway(input: Readonly<{
  engine: SandboxSecurityEngine;
  canonical_fingerprint: SandboxSecurityCanonicalFingerprintService;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
}>): SandboxSecurityEvaluationGateway {
  return {
    composition_binding:
      `sandbox-security-production-composition.v1:${input.production_mode}`,
    fingerprint(request) {
      return input.canonical_fingerprint.fingerprint(request, input.hmac);
    },
    async evaluate(request, signal) {
      const decision = await input.engine.evaluate(request, signal);
      const normalized = normalizeSandboxSecurityDecision(decision);
      if (normalized === null) throw sandboxSecurityInternalError();
      return normalized;
    }
  };
}
```

Import `createSandboxSecurityCanonicalFingerprintService`, Engine/types only
from `engines/sandbox/src/security/index.ts`; import
`createSandboxSecurityProductionEngine` only from
`engines/sandbox/src/security-production/index.ts`. Do not deep-import JCS,
canonical projection, detector, sanitizer, transport, config, benchmark, or
provider modules.

- [ ] **Step 4: Run GREEN and Engine regressions**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-evaluation.service.spec.ts
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-evaluation.service.spec.ts docs/progress.md
git commit -m "feat(backend): adapt sandbox production security Engine"
```

## P6-T2: Validated Configuration and Production Lifecycle

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security.config.ts`
- Modify: `backend/src/runtime-dependencies.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/tests/runtime-dependencies.spec.ts`
- Modify: `backend/tests/main.spec.ts`
- Modify: `tests/integration/backend-sandbox-security.api.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write configuration/startup RED tests**

```ts
test("REQ-SBX-GENERAL-003 production startup validates sandbox configuration before binding", async () => {
  const publicProbe = reservePort();
  const internalProbe = reservePort();
  await assert.rejects(
    () => startProductionServers({
      publicPort: publicProbe.port,
      internalPort: internalProbe.port,
      environment: {}
    }),
    /SANDBOX_SECURITY_CONFIGURATION_INVALID/
  );
  assert.equal(await canConnect(publicProbe.port), false);
  assert.equal(await canConnect(internalProbe.port), false);
});
```

Add four missing values, relative storage, malformed/padded/wrong-length HMAC
and admin values, unsupported mode, GENERAL-002 mode prerequisite failure,
database key mismatch, migration/cleanup/recovery failure, Engine construction
failure, successful `rule_only` startup, immutable mode, internal-bind failure
closing public/database/timer, public-bind failure cleanup, and close order with
in-flight handlers.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/runtime-dependencies.spec.ts \
  backend/tests/main.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts
```

Expected: at least the fail-before-bind or resource-close assertion fails.
Missing env/import/tool failures are invalid RED.

- [ ] **Step 3: Implement exact configuration normalization**

```ts
export interface SandboxSecurityConfiguration {
  storage_path: string;
  deployment_hmac_key: Uint8Array;
  admin_bootstrap_token: string;
  production_mode: "rule_only" | "local" | "local_and_judge";
}

export function loadSandboxSecurityConfiguration(
  environment: Readonly<Record<string, string | undefined>>
): Readonly<SandboxSecurityConfiguration>;
```

Accept only `SANDBOX_SECURITY_STORAGE_PATH`,
`SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY`,
`SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN`, and
`SANDBOX_SECURITY_PRODUCTION_MODE` for GENERAL-003. Decode the HMAC key from
canonical unpadded base64url to exactly 32 bytes; validate the admin token as
exactly 32 canonical bytes but retain its bearer string for administrator
authentication. Freeze/copy the result and never log it.

- [ ] **Step 4: Implement asynchronous module composition**

```ts
export async function createSandboxSecurityProductionModule(input: Readonly<{
  configuration: SandboxSecurityConfiguration;
  runtime?: SandboxSecurityRuntimePort;
}>): Promise<SandboxSecurityModule>;
```

Use this exact order: create HMAC service; open/migrate/check database; recover
in-progress; commit startup cleanup; create the GENERAL-002 production Engine;
construct gateway/repositories/services/controllers; schedule maintenance;
return module. Any failure cancels the timer if created, checkpoints/closes the
database if opened, and rethrows a bounded startup error.

- [ ] **Step 5: Refactor server lifecycle without hidden defaults**

```ts
export function createProductionServers(input: Readonly<{
  deps: RuntimeDependencies;
  ingestToken: string;
  sandboxSecurityModule: SandboxSecurityModule;
}>): ProductionServers;

export async function startProductionServers(options?: Readonly<{
  publicPort?: number;
  internalPort?: number;
  publicBindHost?: string;
  internalBindHost?: string;
  deps?: RuntimeDependencies;
  ingestToken?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  sandboxSecurityModule?: SandboxSecurityModule;
}>): Promise<ProductionServerHandles>;
```

`createProductionServers` is the explicit low-level injection path used by
tests; it never reads environment. `startProductionServers` constructs the real
module from configuration unless one is explicitly injected. Update existing
main tests to inject a structural sandbox module or a private `rule_only`
temporary database; do not use test-mode conditionals.

Stop accepting on both listeners, await their in-flight handlers, then close
the sandbox module. On partial bind failure, close the bound listener and the
module. Aggregate close errors without skipping remaining cleanup.

- [ ] **Step 6: Run GREEN and restart integration**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/runtime-dependencies.spec.ts \
  backend/tests/main.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts
npm run typecheck:backend
```

The integration must issue a capability, evaluate, close both servers, reopen
the same database, authenticate the same capability, replay the same completed
Decision without an Engine call, revoke it, reopen again, and receive the fixed
401.

- [ ] **Step 7: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.config.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/runtime-dependencies.ts backend/src/main.ts \
  backend/tests/runtime-dependencies.spec.ts backend/tests/main.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts docs/progress.md
git commit -m "feat(backend): start durable sandbox security APIs"
```

## P6-T3: Privacy Sentinel and Permanent Repository Gates

**Files:**

- Create: `tests/repository/sandbox-security-backend-spec.spec.ts`
- Modify: `tests/integration/backend-sandbox-security.api.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write privacy and static-boundary RED tests**

```ts
test("REQ-SBX-GENERAL-003 raw sentinels never enter managed durable surfaces", async (t) => {
  const sentinel = "General003-Raw-Secret-9f4b";
  const fixture = await startRealRuleOnlyFixture(t);
  await fixture.evaluate(submissionContainingEverySentinelLocation(sentinel));
  await fixture.failMalformedRequest(sentinel);
  await fixture.close();
  for (const bytes of fixture.responseLogDatabaseWalShmAndArtifacts()) {
    assertSentinelAbsent(bytes, sentinel, [
      "literal", "base64", "hex", "case_folded", "nfkc"
    ]);
  }
});
```

Repository tests must assert:

```ts
test("REQ-SBX-GENERAL-003 backend imports only public sandbox Engine indexes", () => {
  assert.deepEqual(productionGatewayImportTargets(), [
    "engines/sandbox/src/security-production/index.ts",
    "engines/sandbox/src/security/index.ts",
    "shared/index.ts"
  ]);
});
```

Also assert five route/listener ownership, no frontend/OpenClaw changes, exact
SQLite table/index/check catalogs, no raw-token/idempotency/content/provider
audit keys, every new spec registered in scripts, no missing-module catch, no
caller-selected mode/enforcement/provider/model/timeout/retry/fallback, and no
automatic audit cleanup timer.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-backend-spec.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts
```

Expected: the script-registration or permanent static-gate assertion fails.
The sentinel assertion may already pass and is retained as regression evidence.

- [ ] **Step 3: Register every test and permanent gate**

Append all GENERAL-003 shared/backend/integration specs to `test:shared` or
`test:backend`, append the repository spec to `test:repo`, retain
`typecheck:shared` and `typecheck:backend`, and preserve all existing commands.
Do not add live-provider execution to any test script.

- [ ] **Step 4: Run GREEN and widening gates**

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:repo
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add tests/repository/sandbox-security-backend-spec.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts \
  package.json docs/progress.md
git commit -m "test(sandbox): gate backend security privacy boundaries"
```

## P6-T4: Durable Documentation and Final Verification

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`

This task is the documentation-only TDD exception after all business behavior
is already covered by RED/GREEN tests.

- [ ] **Step 1: Update the durable contract**

Document exactly:

- the five routes, request/response DTOs, status/error table, header/body/query
  grammar, Retry-After values, and examples in `docs/api-contract.md`;
- the controller/service/port/adapter split, single-node SQLite lifecycle,
  production Engine import boundary, admission order, retention, and shutdown
  order in `docs/architecture.md`;
- configuration variables, local startup prerequisites, database parent/file
  permissions, and test commands in `README.md`;
- RED/GREEN evidence, exact command counts, review findings/fixes, commit SHAs,
  status, and remaining P6 dependency in `docs/progress.md`; and
- `IMPLEMENTED_PENDING_GLOBAL_P6_GATE` in `docs/sprint-current.md` only after
  all GENERAL-003 gates and closing review pass.

Do not claim GENERAL-002 `VERIFIED`, formal P6 evidence, or a green hermetic
replay.

- [ ] **Step 2: Run the exact final sequence**

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:repo
npm run typecheck:benchmark:sandbox-security
npm run test:frontend
git diff --check
npm run test:all
```

The first ten commands must exit 0 before completion. Record the actual
`npm run test:all` exit status and bounded hermetic replay failure caused by
missing formal signed P6 evidence. Do not rewrite, skip, or waive it.

- [ ] **Step 3: Perform closing review and fix accepted findings RED-first**

The independent reviewer checks specification coverage, HTTP ordering,
cryptographic vectors, SQLite safety, transaction boundaries, idempotency,
privacy, startup/shutdown, regression impact, types, tests, and docs. Every
accepted correctness/security finding gets a failing regression test, minimal
fix, full final sequence rerun, and re-review. Completion requires no unresolved
Critical or Important finding.

- [ ] **Step 4: Commit the documentation checkpoint**

```bash
git add README.md docs/architecture.md docs/api-contract.md \
  docs/progress.md docs/sprint-current.md
git commit -m "docs(sandbox): complete GENERAL-003 backend API"
```

- [ ] **Step 5: Stop and report**

Report modified files, added tests, exact passing commands/counts, the
`npm run test:all` P6-gated result, GENERAL-003 status, GENERAL-002 remaining
gate, closing review verdict, and the commit SHAs. Do not begin GENERAL-004.
