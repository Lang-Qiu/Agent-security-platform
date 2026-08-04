# Phase 1 Shared Surfaces and Route Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Establish the exact shared audit contract, five listener-specific
route matches, and an injectable backend module boundary before any domain or
persistence behavior is introduced.

**Architecture:** Public audit event/page types and strict normalizers live in
`shared/`. Existing public/internal route matchers recognize only their own new
routes. Existing App modules dispatch recognized routes through an injected
structural `SandboxSecurityModule`, allowing later behavior to grow behind one
already-importable boundary without module-not-found RED tests.

**Tech Stack:** TypeScript ESM, `node:test`, existing shared normalizer
patterns, existing backend routers and HTTP response shell.

---

## Entry Gate

- [ ] Read the approved specification sections `Durable Audit Contract`,
  `HTTP API`, `TDD Strategy`, and `Expected File Changes`.
- [ ] Confirm the Master status is `PLAN_COMPLETE_PENDING_USER_APPROVAL` or a
  later user-approved execution status.
- [ ] Run the baseline:

```bash
npm run test:shared
npm run test:backend
npm run test:repo
git diff --check
```

Expected: record current counts and any unrelated failure before P1-T1.

## P1-T1: Exact Shared Audit Event and Page Contract

**Files:**

- Create: `shared/types/sandbox-security-api.ts`
- Create: `shared/contracts/sandbox-security-api.ts`
- Create: `shared/tests/sandbox-security-api-contract.spec.ts`
- Modify: `shared/index.ts`

- [ ] **Step 1: Write the failing test against the existing shared index**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import * as shared from "../index.ts";

test("REQ-SBX-GENERAL-003 shared index exposes strict audit normalizers", () => {
  assert.equal(typeof shared.normalizeSandboxSecurityAuditEvent, "function");
  assert.equal(typeof shared.normalizeSandboxSecurityAuditPage, "function");
});
```

Add table-driven assertions for every event variant from the specification:
exact keys, inherited/accessor/symbol properties, catalog ordering, safe count
integers, `elapsed_ms` bounds, UUID grammar, timestamp grammar, route/rejection
matrix, nullability, defensive copies, page length `0..100`, and cursor grammar.
Use one complete `evaluation_completed` fixture and one exact fixture for each
other event type; mutate one property per rejected case.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  shared/tests/sandbox-security-api-contract.spec.ts
```

Expected: FAIL at the two `typeof` assertions because the already-loadable
shared index does not export the new normalizers. Any import or syntax error is
an invalid RED.

- [ ] **Step 3: Implement the exact shared types**

```ts
export type SandboxSecurityAuditEventType =
  | "evaluation_completed"
  | "evaluation_replayed"
  | "evaluation_interrupted"
  | "request_rejected"
  | "capability_issued"
  | "capability_revoked"
  | "audit_read"
  | "audit_purged";

export type SandboxSecurityAuditCategoryCounts = Readonly<
  Record<SandboxSecurityRiskCategory, number>
>;

export type SandboxSecurityAuditRunStatusCounts = Readonly<
  Record<SandboxDetectorRunStatus, number>
>;

export interface SandboxSecurityAuditPage {
  schema_version: "sandbox-security-audit-page.v1";
  events: SandboxSecurityAuditEvent[];
  next_cursor: string | null;
}
```

Define `SandboxSecurityAuditEventBase`, evaluation fields, and the exact eight
variant union exactly as written in the approved specification. Do not export
capability issue/revoke DTOs or repository records from `shared/`.

- [ ] **Step 4: Implement strict normalizers and exports**

```ts
export function normalizeSandboxSecurityAuditEvent(
  value: unknown
): SandboxSecurityAuditEvent | null;

export function normalizeSandboxSecurityAuditPage(
  value: unknown
): SandboxSecurityAuditPage | null;
```

Use own-enumerable-data-property checks, dense ordinary arrays, exact union
keys, strict UTC millisecond timestamps, closed catalogs from
`shared/types/sandbox-security.ts`, and fresh output objects. Count records
must contain all nine category keys or all six run-status keys in catalog
order. Do not accept free text or unknown fields.

- [ ] **Step 5: Run GREEN and shared typecheck**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  shared/tests/sandbox-security-api-contract.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json
```

Expected: both commands exit 0.

- [ ] **Step 6: Review, update progress, and commit**

```bash
git add shared/types/sandbox-security-api.ts \
  shared/contracts/sandbox-security-api.ts \
  shared/tests/sandbox-security-api-contract.spec.ts \
  shared/index.ts docs/progress.md
git commit -m "feat(shared): add sandbox security audit API contract"
```

Review must verify no content-bearing field, Engine-private type, capability
secret, cursor codec, or backend persistence type escaped into `shared/`.

## P1-T2: Five Exact Public and Internal Route Matches

**Files:**

- Create: `backend/tests/sandbox-security-routes.spec.ts`
- Modify: `backend/src/common/http/router.ts`
- Modify: `backend/src/common/http/internal-router.ts`

- [ ] **Step 1: Write route matcher RED tests**

```ts
test("REQ-SBX-GENERAL-003 public router recognizes only evaluation and audit read", () => {
  assert.deepEqual(
    matchRoute("POST", "/api/sandbox/security/evaluations"),
    { name: "evaluateSandboxSecurity", params: {} }
  );
  assert.deepEqual(
    matchRoute("GET", "/api/sandbox/security/audit-events"),
    { name: "listSandboxSecurityAuditEvents", params: {} }
  );
  assert.equal(
    matchRoute("POST", "/internal/sandbox/security/capabilities"),
    null
  );
});

test("REQ-SBX-GENERAL-003 internal router recognizes only capability and purge routes", () => {
  assert.deepEqual(
    matchInternalRoute("POST", "/internal/sandbox/security/capabilities"),
    { name: "issueSandboxSecurityCapability", params: {} }
  );
  assert.deepEqual(
    matchInternalRoute(
      "POST",
      "/internal/sandbox/security/capabilities/capability%3A123/revoke"
    ),
    {
      name: "revokeSandboxSecurityCapability",
      params: { capabilityId: "capability:123" }
    }
  );
  assert.deepEqual(
    matchInternalRoute("POST", "/internal/sandbox/security/audit-events/purge"),
    { name: "purgeSandboxSecurityAuditEvents", params: {} }
  );
  assert.equal(
    matchInternalRoute("GET", "/api/sandbox/security/audit-events"),
    null
  );
});
```

Add wrong-method, extra-segment, trailing-segment, encoded slash/backslash/NUL,
malformed percent encoding, public/internal cross-listener, and existing route
regression cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-routes.spec.ts
```

Expected: FAIL by actual `null` route values, not by import failure.

- [ ] **Step 3: Add only the route names and exact match branches**

```ts
export type RouteName =
  | "health"
  | "createTask"
  | "listTasks"
  | "getTask"
  | "getTaskResult"
  | "getRiskSummary"
  | "listSupervisionSessions"
  | "getSupervisionSession"
  | "getSupervisionEvidence"
  | "listCampaigns"
  | "getCampaignDetail"
  | "getCampaignEvidence"
  | "evaluateSandboxSecurity"
  | "listSandboxSecurityAuditEvents";

export type InternalRouteName =
  | "internalHealth"
  | "startCampaign"
  | "ingestSnapshot"
  | "finalizeCampaign"
  | "registerEvidence"
  | "issueSandboxSecurityCapability"
  | "revokeSandboxSecurityCapability"
  | "purgeSandboxSecurityAuditEvents";
```

Use the existing internal `decodeRouteSegment` for `capabilityId`. Do not add
authentication, parsing, service calls, or a public capability route.

- [ ] **Step 4: Run GREEN and existing route regressions**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-routes.spec.ts \
  backend/tests/main.spec.ts \
  tests/integration/backend-task-center.api.spec.ts \
  tests/integration/backend-campaign-ingest.api.spec.ts
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/common/http/router.ts \
  backend/src/common/http/internal-router.ts \
  backend/tests/sandbox-security-routes.spec.ts docs/progress.md
git commit -m "feat(backend): recognize sandbox security API routes"
```

## P1-T3: Injectable Sandbox Module Dispatch Boundary

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Create: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Create: `backend/src/modules/sandbox-security/ports/runtime.ts`
- Create: `backend/src/modules/sandbox-security/ports/evaluation.gateway.ts`
- Create: `backend/src/modules/sandbox-security/ports/capability.repository.ts`
- Create: `backend/src/modules/sandbox-security/ports/idempotency.repository.ts`
- Create: `backend/src/modules/sandbox-security/ports/audit.repository.ts`
- Create: `backend/tests/sandbox-security-controller.spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/internal-app.module.ts`

- [ ] **Step 1: Write behavioral dispatch RED against existing App modules**

```ts
test("REQ-SBX-GENERAL-003 AppModule dispatches evaluation to an injected sandbox module", async () => {
  const calls: string[] = [];
  const sandboxModule = makeStructuralSandboxModule({
    evaluate: async () => {
      calls.push("evaluate");
      return fixedUnauthorizedResponse();
    }
  });
  const response = await invokeAppModule(
    new AppModule(createRuntimeDependencies(), sandboxModule),
    "POST",
    "/api/sandbox/security/evaluations"
  );
  assert.deepEqual(calls, ["evaluate"]);
  assert.equal(response.statusCode, 401);
});
```

Add equivalent audit-read, issue, revoke, and purge dispatch tests; assert
existing health, tasks, supervision, and campaign routes still dispatch. The
test defines the injected object structurally and imports no new source path.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts
```

Expected: FAIL because existing constructors do not accept or dispatch the
structural sandbox module.

- [ ] **Step 3: Define the stable module and port signatures**

```ts
export interface SandboxSecurityPublicController {
  evaluate(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  listAuditEvents(
    request: IncomingMessage,
    url: URL,
    requestId: string
  ): Promise<HttpResponse>;
}

export interface SandboxSecurityAdminController {
  issue(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  revoke(
    request: IncomingMessage,
    capabilityId: string,
    requestId: string
  ): Promise<HttpResponse>;
  purge(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
}

export interface SandboxSecurityModule {
  publicController: SandboxSecurityPublicController;
  adminController: SandboxSecurityAdminController;
  close(): Promise<void>;
}
```

Define the exact application-service inputs, authorized capability,
idempotency record/result unions, audit selection, runtime clock/random/UUID,
and repository method signatures from the specification in the listed local
type/port files. These are type-only boundaries; no repository or service
implementation is created in this task.

- [ ] **Step 4: Dispatch through the injected module**

`AppModule` accepts an optional second `SandboxSecurityModule` argument and
routes the two public names only when it is present; `InternalAppModule` accepts
the same module in its constructor input and routes the three internal names.
If a sandbox route is recognized without an injected module, throw the fixed
generic internal `DomainError`; do not construct a hidden default.

- [ ] **Step 5: Run GREEN and typecheck**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-controller.spec.ts \
  backend/tests/main.spec.ts
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json
```

- [ ] **Step 6: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/modules/sandbox-security/sandbox-security.types.ts \
  backend/src/modules/sandbox-security/ports/runtime.ts \
  backend/src/modules/sandbox-security/ports/evaluation.gateway.ts \
  backend/src/modules/sandbox-security/ports/capability.repository.ts \
  backend/src/modules/sandbox-security/ports/idempotency.repository.ts \
  backend/src/modules/sandbox-security/ports/audit.repository.ts \
  backend/src/app.module.ts backend/src/internal-app.module.ts \
  backend/tests/sandbox-security-controller.spec.ts docs/progress.md
git commit -m "feat(backend): add sandbox security module boundary"
```

## P1-T4: Mandatory Typecheck and Test Script Registration

**Files:**

- Modify: `package.json`

This is a configuration-only TDD exception. It introduces no business logic.

- [ ] **Step 1: Add exact scripts and test paths**

```json
{
  "typecheck:shared": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json",
  "typecheck:backend": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json"
}
```

Append `shared/tests/sandbox-security-api-contract.spec.ts` to `test:shared` and
append the two Phase 1 backend specs to `test:backend`. Preserve every existing
script entry and command flag.

- [ ] **Step 2: Run registered gates**

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
git diff --check
```

- [ ] **Step 3: Review and commit**

```bash
git add package.json docs/progress.md
git commit -m "chore(test): register sandbox security typecheck gates"
```

Stop after P1-T4. Do not start Phase 2 in the same task turn.
