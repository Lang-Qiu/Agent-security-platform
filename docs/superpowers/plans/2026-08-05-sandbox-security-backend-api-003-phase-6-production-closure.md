# Phase 6 Production Composition and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Connect the backend module to the real GENERAL-001 fingerprint
service and GENERAL-002 production Engine, enforce fail-before-bind production
configuration, close resources safely, and finish privacy/documentation gates.

**Architecture:** A production gateway owns canonical fingerprint service and
production Engine construction through only the two approved Engine indexes.
The composition root validates four GENERAL-003 environment values,
opens/recovers SQLite, passes the exact four-key Engine runtime projection to
that gateway, creates one shared sandbox module, then binds both listeners.
Shutdown drains handlers, cancels maintenance, checkpoints SQLite, and closes
in reverse order.

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
test("REQ-SBX-GENERAL-003 production gateway uses Engine canonical bytes for HMAC fingerprint", async () => {
  assert.equal(typeof boundary.createSandboxSecurityProductionEvaluationGateway, "function");
  const hmac = createRecordingHmacService(FIXED_DEPLOYMENT_KEY);
  const gateway =
    await boundary.createSandboxSecurityProductionEvaluationGateway!({
      runtime: FIXED_ENGINE_RUNTIME,
      production_mode: "rule_only",
      hmac
    });

  const actual = gateway.fingerprint(FIXED_EVALUATION_REQUEST);
  const capturedCanonicalBytes = hmac.singleCapturedCanonicalCopy();
  const expected = independentlyFingerprintCanonicalBytes(
    FIXED_DEPLOYMENT_KEY,
    capturedCanonicalBytes
  );

  assert.equal(actual, expected);
  assert.notEqual(
    Buffer.from(capturedCanonicalBytes).toString("ascii"),
    '{"a":1}'
  );
  assert.equal(hmac.canonicalPortCalls, 1);
  assert.equal(hmac.retainedCanonicalBytes, false);
});

function createRecordingHmacService(
  key: Uint8Array
): SandboxSecurityHmacService & Readonly<{
  canonicalPortCalls: number;
  retainedCanonicalBytes: false;
  singleCapturedCanonicalCopy(): Uint8Array;
}> {
  const delegate = boundary.createSandboxSecurityHmacService!(key);
  let canonicalPortCalls = 0;
  let capturedCanonicalCopy: Uint8Array | null = null;
  return {
    ...delegate,
    get canonicalPortCalls() {
      return canonicalPortCalls;
    },
    retainedCanonicalBytes: false,
    singleCapturedCanonicalCopy() {
      if (canonicalPortCalls !== 1 || capturedCanonicalCopy === null) {
        throw new Error("expected exactly one canonical port call");
      }
      return Uint8Array.from(capturedCanonicalCopy);
    },
    fingerprintCanonicalBytes(canonicalBytes) {
      canonicalPortCalls += 1;
      capturedCanonicalCopy = Uint8Array.from(canonicalBytes);
      return delegate.fingerprintCanonicalBytes(canonicalBytes);
    }
  };
}

function independentlyFingerprintCanonicalBytes(
  key: Uint8Array,
  canonicalBytes: Uint8Array
): `hmac-sha256:${string}` {
  const prefix = Buffer.from("sandbox-security-hmac-frame.v1", "ascii");
  const domain = Buffer.from(
    "sandbox-security-canonical-fingerprint.v1",
    "ascii"
  );
  const domainLength = Buffer.alloc(2);
  domainLength.writeUInt16BE(domain.byteLength);
  const fieldLength = Buffer.alloc(4);
  fieldLength.writeUInt32BE(canonicalBytes.byteLength);
  const frame = Buffer.concat([
    prefix,
    Buffer.from([0]),
    domainLength,
    domain,
    Buffer.from([1]),
    fieldLength,
    Buffer.from(canonicalBytes)
  ]);
  return `hmac-sha256:${createHmac("sha256", key).update(frame).digest("hex")}`;
}
```

`createRecordingHmacService` wraps the real P2 HMAC service, stores only a copy,
never stores the received reference, and then delegates. The independent helper
above must remain test-local and must not call the production HMAC framing
implementation. The published digest for canonical bytes `{"a":1}` remains
covered only by P2-T2; it is not the expected digest for
`FIXED_EVALUATION_REQUEST`.

After the initial surface RED creates the adapter path, add adapter-local
`WithPorts` tests for exact composition binding per mode, invalid fingerprint
output, fingerprint-service throw, Engine error passthrough to fixed
service error, caller abort, invalid Decision rejection, defensive normalized
Decision, and no detector/provider detail exposure. The test seam is exported
only from the adapter file, never from `sandbox-security.module.ts`.

The P4-T3 evaluation-service suite already owns the assertion that fingerprint
failure creates no idempotency row; the adapter-local suite must not assert
repository effects it cannot observe.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*production gateway" \
  backend/tests/sandbox-security-evaluation.service.spec.ts
```

Expected: FAIL because the existing module boundary lacks the production
gateway factory.

- [ ] **Step 3: Add a backend-private ports seam and obtain behavior RED**

Create the adapter module and re-export only the public factory from the existing
module boundary. Define this adapter-local test seam, write its behavior tests,
and run them while its body still throws the fixed internal error. That intended
assertion is the second RED; missing-module/import errors remain invalid.

```ts
export interface SandboxSecurityProductionEvaluationGatewayPorts {
  create_engine(input: Readonly<{
    runtime: SandboxSecurityEngineRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>): Promise<SandboxSecurityEngine>;
  create_canonical_fingerprint(): SandboxSecurityCanonicalFingerprintService;
}

export async function createSandboxSecurityProductionEvaluationGatewayWithPorts(
  input: Readonly<{
    runtime: SandboxSecurityEngineRuntimePorts;
    production_mode: SandboxSecurityProductionMode;
    hmac: SandboxSecurityHmacService;
    ports: SandboxSecurityProductionEvaluationGatewayPorts;
  }>
): Promise<SandboxSecurityEvaluationGateway>;
```

- [ ] **Step 4: Implement the public production factory and adapter behavior**

```ts
export async function createSandboxSecurityProductionEvaluationGateway(input: Readonly<{
  runtime: SandboxSecurityEngineRuntimePorts;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
}>): Promise<SandboxSecurityEvaluationGateway> {
  return createSandboxSecurityProductionEvaluationGatewayWithPorts({
    ...input,
    ports: {
      create_engine: ({ runtime, mode }) =>
        createSandboxSecurityProductionEngine({ runtime, mode }),
      create_canonical_fingerprint: () =>
        createSandboxSecurityCanonicalFingerprintService()
    }
  });
}
```

`WithPorts` awaits `create_engine`, creates the canonical service, and returns:

```ts
{
    composition_binding:
      `sandbox-security-production-composition.v1:${input.production_mode}`,
    fingerprint(request) {
      return canonicalFingerprint.fingerprint(request, input.hmac);
    },
    async evaluate(request, signal) {
      const decision = await engine.evaluate(request, signal);
      const normalized = normalizeSandboxSecurityDecision(decision);
      if (normalized === null) throw sandboxSecurityInternalError();
      return normalized;
    }
}
```

Import `createSandboxSecurityCanonicalFingerprintService`, Engine/types only
from `engines/sandbox/src/security/index.ts`; import
`createSandboxSecurityProductionEngine` only from
`engines/sandbox/src/security-production/index.ts`. Do not deep-import JCS,
canonical projection, detector, sanitizer, transport, config, benchmark, or
provider modules. The composition root must not construct an Engine or canonical
fingerprint service itself.

- [ ] **Step 5: Run GREEN and Engine regressions**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-evaluation.service.spec.ts
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
```

- [ ] **Step 6: Review, update progress, and commit**

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
- Modify: `README.md`
- Modify: `docs/architecture.md`

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
in-flight handlers. Add the default Node runtime's UTC clock, monotonic clock,
32-byte random copy, UUID v4 capability/audit/decision IDs, cancel-once timeout,
and unref/cancel-once interval behavior.

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

export function createSandboxSecurityNodeRuntimePort(): SandboxSecurityRuntimePort;
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

Resolve `const runtime = input.runtime ?? createSandboxSecurityNodeRuntimePort()`
once and use that same object for every backend dependency. Use this exact
order: create HMAC service and the one audit projector; open/migrate/check database; construct
the three SQLite repositories; create maintenance, which recovers in-progress,
commits startup cleanup, and schedules its one unref'ed interval using the
injected projector; call the async
production gateway factory with
`toSandboxSecurityEngineRuntime(runtime)`; construct services/controllers;
return module. The gateway, not this composition root, constructs the canonical
service and GENERAL-002 Engine. Any failure closes maintenance if created,
checkpoints/closes the database if opened, and rethrows a bounded startup error.
Pass `gateway.composition_binding` unchanged into the exact module dependencies
so pre-service rejection audits bind the same immutable production mode without
widening the approved capability DTOs.

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

- [ ] **Step 7: Synchronize startup and lifecycle documentation**

Document the four environment variables, local startup prerequisites, private
database parent/file requirements, and validation commands in `README.md`.
Document fail-before-bind composition order, gateway-owned Engine construction,
exact runtime projection, one database/maintenance owner, partial-startup
cleanup, drain-before-close, and reverse shutdown order in
`docs/architecture.md`.

- [ ] **Step 8: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.config.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/runtime-dependencies.ts backend/src/main.ts \
  backend/tests/runtime-dependencies.spec.ts backend/tests/main.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts README.md \
  docs/architecture.md docs/progress.md
git commit -m "feat(backend): start durable sandbox security APIs"
```

## P6-T3: Privacy Sentinel and Permanent Repository Gates

**Files:**

- Modify: `tests/repository/sandbox-security-backend-spec.spec.ts`
- Modify: `tests/integration/backend-sandbox-security.api.spec.ts`

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

Implement these assertions through one test-local
`assertSandboxSecurityBackendBoundaries(snapshot)` helper. Before adding each
new check, create a copied source/package snapshot with exactly one forbidden
mutation (deep Engine import, cross-listener route, unregistered spec,
frontend/OpenClaw path, audit cleanup interval, or forbidden request option)
and assert the helper rejects it. The unmutated real repository must pass.

Also assert five route/listener ownership, no frontend/OpenClaw changes, exact
SQLite table/index/check catalogs, no raw-token/idempotency/content/provider
audit keys, every new spec registered in scripts, no missing-module catch, no
caller-selected mode/enforcement/provider/model/timeout/retry/fallback, and no
automatic audit cleanup timer.

Retain the P1-T0 requirement/status/dependency assertions. This task extends
that already registered permanent gate; it does not create or register it.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-backend-spec.spec.ts \
  tests/integration/backend-sandbox-security.api.spec.ts
```

Expected: the first mutation case FAILS because the existing test-local helper
does not yet reject that injected forbidden edge. A production-repository
failure, missing import, or sentinel that already passes is not accepted as
RED. The sentinel assertion is retained as regression evidence.

- [ ] **Step 3: Verify permanent registration and close static findings**

Extend the test-local helper minimally until every mutation RED is GREEN. Assert
every GENERAL-003 shared/backend/integration spec is already present in
`test:shared` or `test:backend` from its creation task, and the repository gate
has remained in `test:repo` since P1-T0. Missing registration is a task-local
failure to correct, not deferred Phase 6 work. Retain `typecheck:shared` and
`typecheck:backend`; do not add live-provider execution to any test script.

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
  tests/integration/backend-sandbox-security.api.spec.ts docs/progress.md
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

- [ ] **Step 1: Perform the final durable-document cross-check**

Earlier owning tasks have already documented their durable surfaces. Compare
them with the implemented behavior and correct only omissions or drift:

- the five routes, request/response DTOs, status/error table, header/body/query
  grammar, Retry-After values, and examples in `docs/api-contract.md`;
- the controller/service/port/adapter split, single-node SQLite lifecycle,
  production Engine import boundary, admission order, retention, and shutdown
  order in `docs/architecture.md`;
- configuration variables, local startup prerequisites, database parent/file
  permissions, and test commands in `README.md`;
- RED/GREEN evidence accumulated so far and the remaining P6 dependency in
  `docs/progress.md`.

Keep `docs/sprint-current.md` at `IMPLEMENTATION_IN_PROGRESS` through the final
sequence and closing review. Do not set final status before that review passes.

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

- [ ] **Step 4: Record final evidence and transition the bounded status**

After closing review returns `PASS`, add exact command counts, review
findings/fixes, and commit SHAs to `docs/progress.md`; then set
`docs/sprint-current.md` to `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. Keep the
GENERAL-002 provisional dependency and explicit absence of global verification.
Run the status-owning permanent gate again:

```bash
npm run test:repo
git diff --check
```

- [ ] **Step 5: Commit the documentation checkpoint**

```bash
git add README.md docs/architecture.md docs/api-contract.md \
  docs/progress.md docs/sprint-current.md
git commit -m "docs(sandbox): complete GENERAL-003 backend API"
```

- [ ] **Step 6: Stop and report**

Report modified files, added tests, exact passing commands/counts, the
`npm run test:all` P6-gated result, GENERAL-003 status, GENERAL-002 remaining
gate, closing review verdict, and the commit SHAs. Do not begin GENERAL-004.
