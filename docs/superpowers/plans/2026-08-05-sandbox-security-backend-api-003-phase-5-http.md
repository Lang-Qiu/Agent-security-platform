# Phase 5 HTTP Admission and Controllers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Implement strict raw-header/body/query admission and complete public
and internal controllers in the approved deny-before-body order.

**Architecture:** A sandbox-specific HTTP admission module reads
`IncomingMessage.rawHeaders`, enforces body framing and fatal UTF-8, and returns
tagged stable errors. Controllers authenticate and authorize route scope before
body/query admission, delegate normalized inputs to Phase 4 services, and emit
the existing `ApiResponse` shell. App modules own final response writing and
response-safe close-after-finish behavior.

**Tech Stack:** Node `http`, `TextDecoder`, raw TCP integration tests,
TypeScript ESM, existing `DomainError`/`HttpResponse` shell.

---

## Entry Gate

- [ ] Confirm Phase 4 is committed and reviewed.
- [ ] Run:

```bash
npm run test:shared
npm run test:backend
npm run typecheck:backend
git diff --check
```

## P5-T1: Raw Header, Body, Query, and Response Policy

**Files:**

- Create: `backend/src/modules/sandbox-security/http-admission.ts`
- Modify: `backend/src/common/http/http-response.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/internal-app.module.ts`
- Modify: `backend/tests/sandbox-security-controller.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write admission RED tests through the module boundary**

```ts
test("REQ-SBX-GENERAL-003 rejects duplicate Authorization from rawHeaders", () => {
  assert.equal(typeof boundary.readSandboxSecurityBearer, "function");
  const request = makeIncomingMessage({
    rawHeaders: [
      "Authorization", `Bearer ${FIXED_CAPABILITY}`,
      "authorization", `Bearer ${SECOND_CAPABILITY}`
    ]
  });
  assert.throws(
    () => boundary.readSandboxSecurityBearer!(request, "public"),
    hasSandboxHttpError(401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
});

test("REQ-SBX-GENERAL-003 reads exactly 786432 UTF-8 bytes and rejects one more", async () => {
  const exact = makeChunkedRequest(Buffer.from(`"${"a".repeat(786430)}"`));
  assert.equal(
    (await boundary.readSandboxSecurityJsonBody!(exact, {
      max_bytes: 786432,
      deadline_ms: 5000
    })).byte_length,
    786432
  );
  const over = makeChunkedRequest(Buffer.from(`"${"a".repeat(786431)}"`));
  await assert.rejects(
    () => boundary.readSandboxSecurityJsonBody!(over, {
      max_bytes: 786432,
      deadline_ms: 5000
    }),
    hasSandboxHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE", true)
  );
});
```

Add absent/malformed/duplicate bearer, exact one-space grammar, idempotency-key
grammar, duplicate Content-Type/Length/Encoding/Transfer-Encoding, media type
case/OWS/charset, quoted/extra charset, declared and chunked bounds,
Content-Length canonical decimal, chunked-only transfer, both framing headers,
fatal invalid UTF-8, empty/invalid JSON, 5000 ms fake deadline, caller abort,
bodyless declared/observed body, audit query duplicates/unknown/decoding/limit,
and exact Retry-After headers.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(header|body|UTF-8|query|Retry-After)" \
  backend/tests/sandbox-security-controller.spec.ts
```

Expected: FAIL because the existing module boundary lacks admission exports.

- [ ] **Step 3: Implement stable admission APIs**

```ts
export class SandboxSecurityHttpError extends DomainError {
  readonly retry_after_seconds?: number;
  readonly close_after_response: boolean;
}

export function readSandboxSecurityBearer(
  request: IncomingMessage,
  audience: "public" | "administrator"
): string;

export function readSandboxSecurityIdempotencyKey(
  request: IncomingMessage
): string;

export async function readSandboxSecurityJsonBody(
  request: IncomingMessage,
  input: Readonly<{ max_bytes: 65536 | 786432; deadline_ms: 5000 }>
): Promise<Readonly<{ value: unknown; byte_length: number }>>;

export function assertSandboxSecurityBodyless(
  request: IncomingMessage
): void;

export function parseSandboxSecurityAuditQuery(
  rawUrl: string
): Readonly<{ cursor?: string; limit: number }>;
```

Inspect `rawHeaders` case-insensitively, not normalized `headers`. On timeout or
over-limit, pause the request and throw `close_after_response=true`; do not call
`request.destroy()` inside the reader. Fatal-decode all bytes before JSON parse.

- [ ] **Step 4: Extend response writing without changing existing envelopes**

```ts
export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
  close_after_response?: boolean;
}
```

Map sandbox errors to this response, set `Retry-After` exactly per the Master,
and set `Connection: close` when requested. In both App-module catches, attach
`response.once("finish", () => request.destroy())` before calling
`writeJsonResponse` only for `close_after_response`; never destroy first.

- [ ] **Step 5: Run GREEN and existing HTTP regressions**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts \
  backend/tests/main.spec.ts \
  tests/integration/backend-task-center.api.spec.ts \
  tests/integration/backend-campaign-ingest.api.spec.ts
npm run typecheck:backend
```

- [ ] **Step 6: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/http-admission.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/common/http/http-response.ts backend/src/app.module.ts \
  backend/src/internal-app.module.ts \
  backend/tests/sandbox-security-controller.spec.ts docs/progress.md
git commit -m "feat(backend): enforce sandbox security HTTP admission"
```

## P5-T2: Public Evaluation and Audit Controllers

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security.controller.ts`
- Modify: `backend/tests/sandbox-security-controller.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write ordered public-controller RED tests**

```ts
test("REQ-SBX-GENERAL-003 denies evaluation scope before reading the body", async () => {
  assert.equal(typeof boundary.createSandboxSecurityController, "function");
  const fixture = createPublicControllerFixture({ scopes: ["sandbox_security:audit:read"] });
  const response = await fixture.controller.evaluate(
    fixture.unreadBodyRequest(FIXED_SUBMISSION),
    "http-request-1"
  );
  assert.equal(response.statusCode, 403);
  assert.deepEqual(fixture.calls, [
    "global_bucket",
    "authenticate",
    "require_evaluate_scope",
    "record_rejection"
  ]);
  assert.equal(fixture.bodyReadCount, 0);
});
```

Add the full public matrices:

```text
evaluation:
global bucket -> authenticate -> evaluate scope -> maintenance health ->
capability bucket -> Idempotency-Key -> JSON headers/body -> shared normalize
-> stage/profile grant -> evaluation service -> 200

audit read:
global bucket -> authenticate -> audit scope -> capability bucket -> bodyless
-> exact query -> audit service -> 200
```

Test global rejection creates no audit; unknown token creates no audit; known
expiry/revocation/scope/rate/body/stage/profile/idempotency/concurrency failures
create only content-free rejection events; audit scope precedes query parsing;
success uses exact messages and `ApiResponse` data; no Engine/private diagnostic
appears in errors.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(evaluation scope|audit scope|public controller|admission order)" \
  backend/tests/sandbox-security-controller.spec.ts
```

Expected: FAIL at the missing controller factory export.

- [ ] **Step 3: Implement public controller dependencies and methods**

```ts
export function createSandboxSecurityController(input: Readonly<{
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  audit_service: SandboxSecurityAuditService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  global_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  record_rejection: (event: SandboxSecurityAuditEvent) => void;
  monotonic_now_ms: () => number;
}>): SandboxSecurityPublicController;
```

Normalize the parsed evaluation body with
`normalizeSandboxSecurityRequest`; null is the stable invalid-request error.
Call `maintenance.assertEvaluationAvailable()` before capability bucket,
idempotency header, or body admission. Route-scope auth always precedes body or
query. Stage/profile auth occurs only after shared normalization.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.controller.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-controller.spec.ts docs/progress.md
git commit -m "feat(backend): handle sandbox security public APIs"
```

## P5-T3: Internal Capability and Purge Controller

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts`
- Create: `backend/tests/sandbox-security-admin.controller.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write administrator-controller RED tests**

```ts
test("REQ-SBX-GENERAL-003 authenticates administrator before capability issue body", async () => {
  assert.equal(typeof boundary.createSandboxSecurityAdminController, "function");
  const fixture = createAdminControllerFixture({ administrator_token: "invalid" });
  const response = await fixture.controller.issue(
    fixture.unreadBodyRequest(FIXED_ISSUE_REQUEST),
    "http-request-2"
  );
  assert.equal(response.statusCode, 401);
  assert.deepEqual(fixture.calls, ["administrator_bucket", "authenticate_administrator"]);
  assert.equal(fixture.bodyReadCount, 0);
  assert.equal(fixture.auditWrites, 0);
});
```

Add duplicate/malformed admin bearer, admin bucket before auth, 65536-byte body,
strict DTO normalization, 201 issue, one-time token, bodyless revoke/purge,
decoded capability ID grammar, idempotent revoke, fixed 404, purge pre-cleanup,
503 Retry-After 60, fixed retention response, and no durable amplification for
bad admin credentials.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-admin.controller.spec.ts
```

Expected: FAIL because the module lacks the admin-controller factory.

- [ ] **Step 3: Implement the exact controller factory**

```ts
export function createSandboxSecurityAdminController(input: Readonly<{
  authenticator: SandboxSecurityCapabilityAuthenticator;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  administrator_bucket: SandboxSecurityTokenBucket;
  monotonic_now_ms: () => number;
}>): SandboxSecurityAdminController;
```

Use the fixed matrices from the specification. Do not accept cutoff, mode,
provider, model, timeout, retry, fallback, database path, or HMAC key from any
request.

- [ ] **Step 4: Run GREEN, review, and commit**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-admin.controller.spec.ts
npm run typecheck:backend
git diff --check
git add backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-admin.controller.spec.ts docs/progress.md
git commit -m "feat(backend): handle sandbox security admin APIs"
```

## P5-T4: Complete Injected Module and Real HTTP Admission

**Files:**

- Create: `tests/integration/backend-sandbox-security.api.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/internal-app.module.ts`

- [ ] **Step 1: Write real HTTP RED tests with injected fake services**

```ts
test("REQ-SBX-GENERAL-003 oversized client receives JSON 413 before socket close", async (t) => {
  const fixture = await startInjectedSandboxSecurityServers(t);
  const response = await sendRawHttpRequest(fixture.publicPort, oversizedChunkedRequest());
  assert.equal(response.statusCode, 413);
  assert.equal(response.headers.connection, "close");
  assert.equal(response.json.error_code, "SANDBOX_SECURITY_BODY_TOO_LARGE");
  assert.equal(response.complete, true);
});

test("REQ-SBX-GENERAL-003 slow client receives JSON 408 before socket close", { timeout: 8000 }, async (t) => {
  const fixture = await startInjectedSandboxSecurityServers(t);
  const response = await sendSlowRawHttpRequest(fixture.publicPort);
  assert.equal(response.statusCode, 408);
  assert.equal(response.headers.connection, "close");
  assert.equal(response.json.error_code, "SANDBOX_SECURITY_REQUEST_TIMEOUT");
  assert.equal(response.complete, true);
});
```

Add all five route successes with fake services, public/internal cross-listener
404, health contract unchanged, authentication before unread malformed body,
scope before malformed query, exact 786432 bytes, duplicate raw headers, and
bodyless observed-byte cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/integration/backend-sandbox-security.api.spec.ts
```

Expected: the first incomplete module wiring or response-close assertion fails;
an HTTP client timeout is invalid RED and must be converted into a bounded test
failure with open handles closed.

- [ ] **Step 3: Assemble the injected module factory**

```ts
export function createSandboxSecurityModule(
  dependencies: Readonly<SandboxSecurityModuleDependencies>
): SandboxSecurityModule {
  return {
    publicController: createSandboxSecurityController(dependencies),
    adminController: createSandboxSecurityAdminController(dependencies),
    async close() {
      dependencies.maintenance.close();
      dependencies.database.checkpointAndClose();
    }
  };
}
```

The factory accepts already constructed repositories/services/gateway/runtime;
it reads no environment and opens no file. Ensure both App modules receive the
same module instance.

- [ ] **Step 4: Run GREEN and Phase gates**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/integration/backend-sandbox-security.api.spec.ts
npm run test:backend
npm run typecheck:backend
npm run test:shared
npm run typecheck:shared
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/app.module.ts backend/src/internal-app.module.ts \
  tests/integration/backend-sandbox-security.api.spec.ts docs/progress.md
git commit -m "feat(backend): wire sandbox security HTTP module"
```

Stop after P5-T4. Production environment and real Engine construction remain
Phase 6 work.
