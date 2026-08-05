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
- Modify: `docs/api-contract.md`

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

test("REQ-SBX-GENERAL-003 bodyless admission rejects a delayed observed byte", async () => {
  const fixture = makeDeferredIncomingMessage({
    rawHeaders: ["Content-Length", "0"]
  });
  const admission = boundary.assertSandboxSecurityBodyless!(fixture.request);
  queueMicrotask(() => {
    fixture.push(Buffer.from("x", "ascii"));
    fixture.end();
  });
  await assert.rejects(
    admission,
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
});
```

Add absent/malformed/duplicate bearer, exact one-space grammar, idempotency-key
grammar, duplicate Content-Type/Length/Encoding/Transfer-Encoding, media type
case/OWS/charset, quoted/extra charset, declared and chunked bounds,
Content-Length canonical decimal, chunked-only transfer, both framing headers,
fatal invalid UTF-8, empty/invalid JSON, 5000 ms fake deadline, caller abort,
bodyless declared body and delayed observed nonempty chunks, audit query
duplicates/unknown/decoding/limit,
exact Retry-After headers, all nine P1 service-error mapping rows, retry
preservation, and a compile-time exhaustive-switch assertion.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  --test-name-pattern="REQ-SBX-GENERAL-003.*(header|body|UTF-8|query|Retry-After)" \
  backend/tests/sandbox-security-controller.spec.ts
```

Expected: FAIL because the existing module boundary lacks admission exports.

- [ ] **Step 3: Implement stable admission APIs**

```ts
export type SandboxSecurityHttpErrorCode =
  | "SANDBOX_SECURITY_INVALID_REQUEST"
  | "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID"
  | "SANDBOX_SECURITY_UNAUTHORIZED"
  | "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
  | "SANDBOX_SECURITY_FORBIDDEN"
  | "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
  | "SANDBOX_SECURITY_REQUEST_TIMEOUT"
  | "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT"
  | "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS"
  | "SANDBOX_SECURITY_BODY_TOO_LARGE"
  | "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE"
  | "SANDBOX_SECURITY_RATE_LIMITED"
  | "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
  | "SANDBOX_SECURITY_INTERNAL_ERROR"
  | "SANDBOX_SECURITY_STORAGE_UNAVAILABLE";

export class SandboxSecurityHttpError extends DomainError {
  declare readonly statusCode: 400 | 401 | 403 | 404 | 408 | 409 | 413 | 415 | 429 | 500 | 503;
  declare readonly code: SandboxSecurityHttpErrorCode;
  readonly retry_after_seconds?: number;
  readonly close_after_response: boolean;
}

export function sandboxSecurityHttpErrorResponse(
  error: SandboxSecurityHttpError,
  requestId: string
): HttpResponse;

export function sandboxSecurityServiceErrorToHttpError(
  error: SandboxSecurityServiceError
): SandboxSecurityHttpError;

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

export async function assertSandboxSecurityBodyless(
  request: IncomingMessage
): Promise<void>;

export function parseSandboxSecurityAuditQuery(
  rawUrl: string
): Readonly<{ cursor?: string; limit: number }>;
```

Inspect `rawHeaders` case-insensitively, not normalized `headers`. On timeout or
over-limit, pause the request and throw `close_after_response=true`; do not call
`request.destroy()` inside the reader. Fatal-decode all bytes before JSON parse.
For bodyless admission, validate `Transfer-Encoding` and `Content-Length` before
starting stream iteration and reject a declared nonzero body immediately. After
valid no-body framing, await request completion and reject the first observed
nonempty chunk, including one delivered on a later turn. Empty chunks do not
complete admission. Controllers must await the helper before any query, path,
or service work owned by that route.

- [ ] **Step 4: Extend response writing without changing existing envelopes**

```ts
export interface HttpResponse {
  statusCode: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}
```

Lock one propagation model: controllers return `HttpResponse` only on success.
After any required best-effort content-free rejection audit, every controller
failure throws `SandboxSecurityHttpError`; admission helpers never convert it to
a normal return. Both App modules catch that type and are the only
error-to-envelope mappers. The mapper sets `Retry-After` exactly per the Master
and `Connection: close` only for `close_after_response`; its required
`requestId` populates the repository `ApiResponse` error envelope and is never
read from the typed domain error.

For writable 408/413 responses, attach one `finish` listener before writing,
call `writeJsonResponse` through its complete `response.end()` path, and only in
the `finish` callback destroy the request and remaining socket. Never destroy
before `finish`. If the caller has aborted, or the response is destroyed,
non-writable, or already ended, do not attempt headers, body, `end()`, or a
second destroy. Unit tests record `write -> end -> finish -> destroy` ordering;
the real HTTP tests in P5-T4 prove the JSON response is complete on the wire.

The service-error mapper is an exhaustive switch with a `never` check:

| Service code | HTTP | Public rejection audit owner |
| --- | ---: | --- |
| `SANDBOX_SECURITY_ADMIN_UNAUTHORIZED` | 401 | none |
| `SANDBOX_SECURITY_FORBIDDEN` | 403 | controller |
| `SANDBOX_SECURITY_CAPABILITY_NOT_FOUND` | 404 | none |
| `SANDBOX_SECURITY_AUDIT_CURSOR_INVALID` | 400 | controller |
| `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` | 409 | repository transaction |
| `SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS` | 409 | repository transaction |
| `SANDBOX_SECURITY_CONCURRENCY_LIMITED` | 429 | repository transaction |
| `SANDBOX_SECURITY_STORAGE_UNAVAILABLE` | 503 | public controller for a known capability; none on internal purge |
| `SANDBOX_SECURITY_INTERNAL_ERROR` | 500 | none |

Mapping preserves exact retry metadata. Controller-owned rows use the service
error's fixed rejection code; transaction-owned rows are mapped only and never
written again. Tests cover every row and fail compilation if the P1 union grows.

- [ ] **Step 5: Synchronize the admission contract**

Document raw-header grammar, byte/deadline limits, bodyless/query admission,
the typed-error ownership model, Retry-After values, 408/413
`Connection: close`, and caller-abort no-write behavior in
`docs/api-contract.md`.

- [ ] **Step 6: Run GREEN and existing HTTP regressions**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts \
  backend/tests/main.spec.ts \
  tests/integration/backend-task-center.api.spec.ts \
  tests/integration/backend-campaign-ingest.api.spec.ts
npm run typecheck:backend
```

- [ ] **Step 7: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/http-admission.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/common/http/http-response.ts backend/src/app.module.ts \
  backend/src/internal-app.module.ts \
  backend/tests/sandbox-security-controller.spec.ts docs/api-contract.md \
  docs/progress.md
git commit -m "feat(backend): enforce sandbox security HTTP admission"
```

## P5-T2: Public Evaluation and Audit Controllers

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security.controller.ts`
- Modify: `backend/tests/sandbox-security-controller.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `docs/api-contract.md`

- [ ] **Step 1: Write ordered public-controller RED tests**

```ts
test("REQ-SBX-GENERAL-003 denies evaluation scope before reading the body", async () => {
  assert.equal(typeof boundary.createSandboxSecurityController, "function");
  const fixture = createPublicControllerFixture({ scopes: ["sandbox_security:audit:read"] });
  await assert.rejects(
    () => fixture.controller.evaluate(
      fixture.unreadBodyRequest(FIXED_SUBMISSION),
      "http-request-1"
    ),
    hasSandboxHttpError(403, "SANDBOX_SECURITY_FORBIDDEN")
  );
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
global bucket -> authenticate -> audit scope -> capability bucket -> await bodyless
-> exact query -> audit service -> 200
```

Test global rejection creates no audit; unknown token creates no audit; known
expiry/revocation/scope/rate/body/stage/profile/idempotency/concurrency failures
create only content-free rejection events; audit scope precedes query parsing;
success uses exact messages and `ApiResponse` data; no Engine/private diagnostic
appears in errors. Include default audit `limit=50`, maximum `limit=100`,
rejection of `0/101`, capability expiry before query/body admission, slow-body
timeout before evaluation-service invocation and therefore before Engine slot
acquisition. Every failure assertion uses `assert.rejects` with the exact typed
error; only successful controller calls assert a returned `HttpResponse`.
For every controller-owned rejection, assert the event uses the injected exact
production `composition_binding`; it is never inferred from capability data.
The audit-read controller awaits bodyless stream completion before parsing the
query or calling the audit service.

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
  composition_binding: string;
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  audit_service: SandboxSecurityAuditService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  global_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  audit_projector: SandboxSecurityAuditProjector;
  audit_repository: SandboxSecurityAuditRepository;
  runtime: SandboxSecurityRuntimePort;
}>): SandboxSecurityPublicController;
```

Normalize the parsed evaluation body with
`normalizeSandboxSecurityRequest`; null is the stable invalid-request error.
Call `maintenance.assertEvaluationAvailable()` before capability bucket,
idempotency header, or body admission. Route-scope auth always precedes body or
query. Stage/profile auth occurs only after shared normalization.

On a failure with known capability identity, write the required content-free
rejection event with the injected projector and runtime, append it through the
injected audit repository best-effort, and then map the original P1 service
error to the typed HTTP error. Audit write failure must not replace it. Unknown identity and deployment-global rate denial
write no audit. This controller owns expiry/revocation/scope/rate/body/
stage/profile/invalid-request/unsupported-media/storage-unavailable rejection
audit. Idempotency replay/conflict/
in-progress and concurrency rejection are already written atomically by the
evaluation service/repository and must only be mapped here, never audited a
second time. Other P1 service errors follow the exhaustive ownership table.
Never return an error `HttpResponse` from this controller.

- [ ] **Step 4: Synchronize public route contracts**

Document both public routes, success envelopes, authorization/admission order,
query defaults/bounds, and exact stable error/status mapping in
`docs/api-contract.md`.

- [ ] **Step 5: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts
npm run typecheck:backend
```

- [ ] **Step 6: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.controller.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-controller.spec.ts docs/api-contract.md \
  docs/progress.md
git commit -m "feat(backend): handle sandbox security public APIs"
```

## P5-T3: Internal Capability and Purge Controller

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts`
- Create: `backend/tests/sandbox-security-admin.controller.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `docs/api-contract.md`
- Modify: `package.json`

- [ ] **Step 1: Write administrator-controller RED tests**

```ts
test("REQ-SBX-GENERAL-003 authenticates administrator before capability issue body", async () => {
  assert.equal(typeof boundary.createSandboxSecurityAdminController, "function");
  const fixture = createAdminControllerFixture({ administrator_token: "invalid" });
  await assert.rejects(
    () => fixture.controller.issue(
      fixture.unreadBodyRequest(FIXED_ISSUE_REQUEST),
      "http-request-2"
    ),
    hasSandboxHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
  );
  assert.deepEqual(fixture.calls, ["administrator_bucket", "authenticate_administrator"]);
  assert.equal(fixture.bodyReadCount, 0);
  assert.equal(fixture.auditWrites, 0);
});

test("REQ-SBX-GENERAL-003 waits for bodyless completion before revoke path decoding", async () => {
  const fixture = createAdminControllerFixture({ administrator_token: "valid" });
  const request = fixture.deferredBodylessRequest();
  const attempt = fixture.controller.revoke(
    request.message,
    "capability%ZZ",
    "http-request-3"
  );
  const early = await Promise.race([
    attempt.then(
      () => "settled",
      () => "settled"
    ),
    new Promise<"pending">((resolve) => setImmediate(() => resolve("pending")))
  ]);
  assert.equal(early, "pending");
  assert.equal(fixture.capabilityServiceCalls, 0);

  request.end();
  await assert.rejects(
    attempt,
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.capabilityServiceCalls, 0);
});
```

Add duplicate/malformed admin bearer, admin bucket before auth, 65536-byte body,
strict DTO normalization, 201 issue, one-time token, bodyless revoke/purge,
single percent decode, decoded capability ID grammar, malformed percent,
encoded slash/backslash/NUL, idempotent revoke, fixed 404, purge pre-cleanup,
503 Retry-After 60, fixed retention response, and no durable amplification for
bad admin credentials. Add a revoke case with invalid administrator credentials,
an unread body, and a malformed raw segment; it must return 401 without starting
bodyless admission or path decoding.
Append this new spec to `test:backend` in the same step. All failure cases use
`assert.rejects`; only 201/200 successes inspect returned `HttpResponse` values.
Assert successful issue passes the non-null
`SandboxSecurityNormalizedCapabilityIssueRequest`, including required
`ttl_seconds`, to the capability service. Revoke and purge await bodyless stream
completion before decoding the capability ID or invoking either service.

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
  runtime: SandboxSecurityRuntimePort;
}>): SandboxSecurityAdminController;
```

Use the fixed matrices from the specification. Do not accept cutoff, mode,
provider, model, timeout, retry, fallback, database path, or HMAC key from any
request. The revoke method receives `rawCapabilityIdSegment` from the P1 router.
After administrator bucket and authentication, await
`assertSandboxSecurityBodyless(request)`. Only then decode exactly once with
`decodeURIComponent`; malformed encoding or a decoded `/`, `\\`, or NUL throws
the fixed 400. Require the decoded value to match the exact capability-ID regex
before calling `capability_service.revoke(capabilityId)`. Throw typed errors for
all failures; do not return error responses.

- [ ] **Step 4: Synchronize internal route contracts**

Document the three internal routes, bootstrap authentication, request/result
DTOs, bodyless rules, fixed purge retention, and exact stable error/status
mapping in `docs/api-contract.md`.

- [ ] **Step 5: Run GREEN, review, and commit**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-admin.controller.spec.ts
npm run typecheck:backend
git diff --check
git add backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-admin.controller.spec.ts package.json \
  docs/api-contract.md docs/progress.md
git commit -m "feat(backend): handle sandbox security admin APIs"
```

## P5-T4: Complete Injected Module and Real HTTP Admission

**Files:**

- Create: `tests/integration/backend-sandbox-security.api.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/internal-app.module.ts`
- Modify: `package.json`

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
real-HTTP bodyless declared-byte cases. The P5-T1 deferred IncomingMessage tests
own delayed observed-byte coverage because Node's HTTP parser does not deliver
unframed bytes as a request body. Add a caller-abort case proving no response write
is attempted after the socket is non-writable, and ordering probes proving 408
and 413 call `end()` before the post-`finish` destroy. Append this new integration
spec to `test:backend` in the same step.

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
    publicController: createSandboxSecurityController({
      composition_binding: dependencies.composition_binding,
      authenticator: dependencies.authenticator,
      evaluation_service: dependencies.evaluation_service,
      audit_service: dependencies.audit_service,
      maintenance: dependencies.maintenance,
      global_bucket: dependencies.global_bucket,
      capability_limiters: dependencies.capability_limiters,
      audit_projector: dependencies.audit_projector,
      audit_repository: dependencies.audit_repository,
      runtime: dependencies.runtime
    }),
    adminController: createSandboxSecurityAdminController({
      authenticator: dependencies.authenticator,
      capability_service: dependencies.capability_service,
      audit_service: dependencies.audit_service,
      administrator_bucket: dependencies.administrator_bucket,
      runtime: dependencies.runtime
    }),
    async close() {
      dependencies.maintenance.close();
      dependencies.database.checkpointAndClose();
    }
  };
}
```

The exact `SandboxSecurityModuleDependencies` contract is owned by P1-T3. This
factory accepts already constructed services, controllers' direct ports,
database, maintenance, limiters, and runtime; it reads no environment and opens
no file. Repositories and the gateway remain encapsulated behind constructed
services. Ensure both App modules receive the same module instance. Its only
resource ownership is close order: maintenance first, then the one database.

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
  tests/integration/backend-sandbox-security.api.spec.ts package.json \
  docs/progress.md
git commit -m "feat(backend): wire sandbox security HTTP module"
```

Stop after P5-T4. Production environment and real Engine construction remain
Phase 6 work.
