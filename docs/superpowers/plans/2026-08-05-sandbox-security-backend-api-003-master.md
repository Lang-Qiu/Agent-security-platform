# REQ-SBX-GENERAL-003 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, obtain review, commit its exact paths, and stop
> before starting the next task.

**Goal:** Expose restart-durable, capability-authenticated sandbox security
simulation and content-free audit APIs without duplicating GENERAL-001 Engine
semantics or GENERAL-002 production composition.

**Architecture:** The backend adds one NestJS-style sandbox-security module
with HTTP controllers, application services, domain ports, and adapters.
Cross-boundary audit DTOs remain in `shared/`; capability, idempotency, and
audit state use a single local `node:sqlite` database; the Engine adapter uses
only the public GENERAL-001 and GENERAL-002 indexes. The public and internal
listeners share one module and database lifecycle but keep disjoint routes.

**Tech Stack:** Node.js `>=22.19.0`, TypeScript ESM with native type stripping,
`node:test`, `node:assert/strict`, Node `crypto`, Node `http`, Node `node:sqlite`,
the repository TypeScript compiler, and no new runtime dependency.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-003`
- Date: `2026-08-05`
- Status: `PLAN_COMPLETE_PENDING_USER_APPROVAL`
- Canonical specification:
  `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- Specification review: `PASS`, no Critical or Important findings
- Dependency: GENERAL-002 remains
  `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`
- Maximum implementation status before that dependency closes:
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`
- This plan does not authorize implementation until the user approves the
  complete Master and Phase set.

## Plan Set

| Order | Plan | Outcome |
| --- | --- | --- |
| 1 | `2026-08-05-sandbox-security-backend-api-003-phase-1-surfaces.md` | shared audit contract, five route matches, injectable module boundary, typecheck scripts |
| 2 | `2026-08-05-sandbox-security-backend-api-003-phase-2-domain-controls.md` | simulation authority, cryptography, capabilities, rate and concurrency controls |
| 3 | `2026-08-05-sandbox-security-backend-api-003-phase-3-sqlite.md` | hardened database, migrations, durable repositories, recovery and retention |
| 4 | `2026-08-05-sandbox-security-backend-api-003-phase-4-services.md` | content-free audit projection and capability/audit/evaluation orchestration |
| 5 | `2026-08-05-sandbox-security-backend-api-003-phase-5-http.md` | strict HTTP admission, public/internal controllers, listener integration |
| 6 | `2026-08-05-sandbox-security-backend-api-003-phase-6-production-closure.md` | real Engine adapter, production startup/shutdown, privacy gates, docs and final validation |

The order is strict. A Phase may start only after every task in its predecessor
is committed and reviewed with no unresolved Critical or Important finding.

## Plan Self-Review Record

- Specification coverage: all sections and every required scenario map to a
  named Phase task; no uncovered behavior was found.
- Placeholder scan: no unresolved planning marker, deferred implementation
  instruction, generalized error-handling placeholder, or cross-task shortcut
  is present.
- RED integrity: first shared/router/module tests use existing importable
  boundaries; later files are introduced through the existing module export
  boundary; no missing-module exception is accepted as RED.
- Type consistency corrections: public-controller maintenance admission is
  pre-body, evaluation-service stage/profile authorization begins after shared
  normalization, known expired/revoked capability identity is available only
  for content-free audit, and the SQLite test surface uses the declared
  `read()` port.
- Review note closure: exact Retry-After formulas and limits are locked in this
  Master.

## Execution Environment

Run from the repository root on Linux:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
nvm use
node --version
npm --version
git branch --show-current
git status --short
test "$(node -p 'process.platform')" = "linux"
test -f ./frontend/node_modules/typescript/bin/tsc
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.close()'
```

Expected: Node `>=22.19.0`; the repository-local TypeScript compiler exists;
`node:sqlite` opens an in-memory database; unrelated user changes are listed
and preserved. Do not install dependencies, alter lockfiles, reset, clean, or
switch branches for this requirement.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `docs/sprint-current.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `engines/sandbox/src/security/index.ts`
- `engines/sandbox/src/security-production/index.ts`
- `shared/index.ts`
- `backend/src/app.module.ts`
- `backend/src/internal-app.module.ts`
- `backend/src/main.ts`

The specification wins over this plan if wording differs. Stop for user
direction if implementation would modify a GENERAL-001 semantic file, a
GENERAL-002 detector/benchmark file, an OpenClaw integration, a frontend
production file, or a database technology other than `node:sqlite`.

## Locked Public Surface

The only new public routes are:

```text
POST /api/sandbox/security/evaluations
GET  /api/sandbox/security/audit-events
POST /internal/sandbox/security/capabilities
POST /internal/sandbox/security/capabilities/:capabilityId/revoke
POST /internal/sandbox/security/audit-events/purge
```

The only new shared runtime exports are:

```ts
export function normalizeSandboxSecurityAuditEvent(
  value: unknown
): SandboxSecurityAuditEvent | null;

export function normalizeSandboxSecurityAuditPage(
  value: unknown
): SandboxSecurityAuditPage | null;
```

The associated shared types are
`SandboxSecurityAuditEventType`, `SandboxSecurityAuditCategoryCounts`,
`SandboxSecurityAuditRunStatusCounts`, `SandboxSecurityAuditEvent`, and
`SandboxSecurityAuditPage`. Capability request/result types, persistence
records, repository ports, configuration, and bootstrap administrator DTOs
remain backend-local.

## Locked Retry-After Contract

The specification review left one non-blocking precision note. This plan locks
the implementation formula:

```ts
export function tokenBucketRetryAfterSeconds(input: Readonly<{
  available_tokens: number;
  refill_tokens_per_second: number;
}>): number {
  return Math.min(
    60,
    Math.max(
      1,
      Math.ceil((1 - input.available_tokens) / input.refill_tokens_per_second)
    )
  );
}
```

- `SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS`: `Retry-After: 1`
- `SANDBOX_SECURITY_CONCURRENCY_LIMITED`: `Retry-After: 1`
- `SANDBOX_SECURITY_RATE_LIMITED`: the formula above, integer `1..60`
- `SANDBOX_SECURITY_STORAGE_UNAVAILABLE`: `Retry-After: 60`

Tests use a fake monotonic clock and assert exact values for the capability
bucket (`5` seconds from zero tokens), global bucket (`1` second), and
administrator bucket (`6` seconds).

## File Ownership Map

### Shared and Routing

```text
shared/types/sandbox-security-api.ts
shared/contracts/sandbox-security-api.ts
shared/index.ts
shared/tests/sandbox-security-api-contract.spec.ts
backend/src/common/http/router.ts
backend/src/common/http/internal-router.ts
backend/tests/sandbox-security-routes.spec.ts
```

### Backend Domain and Ports

```text
backend/src/modules/sandbox-security/sandbox-security.module.ts
backend/src/modules/sandbox-security/sandbox-security.types.ts
backend/src/modules/sandbox-security/simulation-authority.ts
backend/src/modules/sandbox-security/hmac.ts
backend/src/modules/sandbox-security/dto/capability.ts
backend/src/modules/sandbox-security/capability-authorizer.ts
backend/src/modules/sandbox-security/token-bucket.ts
backend/src/modules/sandbox-security/engine-concurrency.ts
backend/src/modules/sandbox-security/ports/runtime.ts
backend/src/modules/sandbox-security/ports/evaluation.gateway.ts
backend/src/modules/sandbox-security/ports/capability.repository.ts
backend/src/modules/sandbox-security/ports/idempotency.repository.ts
backend/src/modules/sandbox-security/ports/audit.repository.ts
```

### SQLite Adapters

```text
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-idempotency.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts
```

### Application and HTTP

```text
backend/src/modules/sandbox-security/audit-projector.ts
backend/src/modules/sandbox-security/capability.service.ts
backend/src/modules/sandbox-security/evaluation.service.ts
backend/src/modules/sandbox-security/audit.service.ts
backend/src/modules/sandbox-security/http-admission.ts
backend/src/modules/sandbox-security/sandbox-security.controller.ts
backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts
backend/src/common/http/http-response.ts
backend/src/app.module.ts
backend/src/internal-app.module.ts
```

### Production Composition and Closure

```text
backend/src/modules/sandbox-security/sandbox-security.config.ts
backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts
backend/src/runtime-dependencies.ts
backend/src/main.ts
backend/tests/main.spec.ts
tests/integration/backend-sandbox-security.api.spec.ts
tests/repository/sandbox-security-backend-spec.spec.ts
package.json
README.md
docs/architecture.md
docs/api-contract.md
docs/progress.md
docs/sprint-current.md
```

No Phase may create an alternative public DTO, second database abstraction,
general RBAC framework, queue, worker, sidecar, retry, fallback, or frontend
surface.

## Global TDD Protocol

Every behavior task uses this exact sequence:

1. Write one focused test against an already importable boundary.
2. Run the exact focused command and record the intended assertion failure.
3. Reject import, syntax, type-environment, missing-tool, and timeout failures
   as invalid RED; repair the test boundary first.
4. Write the smallest production change that satisfies that behavior.
5. Run the focused command until GREEN.
6. Run the Phase regression commands and `git diff --check`.
7. Request an independent specification and code-quality review.
8. For each accepted finding, add a new failing regression test before fixing.
9. Re-run, re-review, update `docs/progress.md`, commit exact paths, and stop.

The first shared RED dynamically imports the existing `shared/index.ts` and
fails because the audit normalizer export is absent. The first backend RED
imports the existing route matchers and fails by returned route value. The
module bootstrap RED invokes the existing `AppModule`/`InternalAppModule` with
injected structural handlers and fails because the recognized routes are not
dispatched. Once `sandbox-security.module.ts` exists, later tests import that
existing boundary and assert a missing factory export before the corresponding
source file is created. No test catches, maps, or masks
`ERR_MODULE_NOT_FOUND`.

Pure documentation and script-list changes are the repository-approved TDD
exception. They must not contain production behavior.

## Required Test Naming

Every new test name starts with `REQ-SBX-GENERAL-003` and states the scenario.
Examples:

```ts
test("REQ-SBX-GENERAL-003 denies evaluation scope before reading the body", async () => {});
test("REQ-SBX-GENERAL-003 replays a completed response without acquiring an Engine slot", async () => {});
test("REQ-SBX-GENERAL-003 never returns another subject's audit event", () => {});
```

Do not use skipped tests, conditional early returns after a failed import, or
test-only production branches.

## Review Protocol

After each task, a reviewer receives the specification, this Master, the active
Phase plan, the exact diff, RED output, GREEN output, and widened gate output.
Critical and Important findings block the next task. Accepted findings require
a regression RED, minimal correction, full task rerun, and re-review. Minor
findings may be deferred only when the reviewer explicitly says they do not
affect correctness, security, contract compliance, or the next task.

## Final Validation Sequence

After Phase 6 documentation is synchronized, run in order:

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

The first ten commands must be reported with exact counts and exit status.
`npm run test:all` must be attempted. Its hermetic replay is expected to fail
closed while GENERAL-002 lacks formal signed P6 evidence; report that result as
an open global gate, never as GREEN and never as a GENERAL-003 defect waiver.

## Completion Gate

GENERAL-003 may become `IMPLEMENTED_PENDING_GLOBAL_P6_GATE` only when:

- all five routes exist only on their approved listener;
- every required scenario in the specification has a passing test;
- the SQLite permission, migration, recovery, cleanup, transaction, and
  restart tests pass;
- the real HTTP timeout/oversize tests receive JSON 408/413 and
  `Connection: close` before socket teardown;
- privacy sentinels are absent from responses, logs, database files, WAL/SHM,
  and test artifacts;
- all focused and widened GENERAL-003 gates pass;
- independent closing review has no unresolved Critical or Important finding;
- required documentation reflects the implemented contract; and
- GENERAL-002 remains visibly recorded as the only outstanding global P6 gate.

Then stop. Do not begin GENERAL-004.
