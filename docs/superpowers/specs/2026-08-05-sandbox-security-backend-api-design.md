# Sandbox Security Authenticated Backend API Design

## Document Status

- Requirement: `REQ-SBX-GENERAL-003`
- Date: `2026-08-05`
- Status: `APPROVED_DESIGN_PENDING_USER_SPEC_REVIEW`
- Workflow: `Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop`
- Dependencies: GENERAL-001 and GENERAL-002

This document records the design approved in the design dialogue. It does not
authorize implementation until the user reviews this written specification and
approves the implementation plan produced afterward.

GENERAL-002 has only the temporary disposition
`PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`. Its formal P6 evidence and global
`VERIFIED` gate remain absent. That disposition permits GENERAL-003 design and
implementation planning, but it does not convert progress-only data into P6
evidence and it does not allow GENERAL-003 to claim global verification.

## Canonical Inputs

- `metadata.md`
- `AGENTS.md`
- `docs/sprint-current.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- `docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md`

The GENERAL-001 and GENERAL-002 specifications remain authoritative for Engine
semantics, canonicalization, production composition, privacy limits, profiles,
detector behavior, and provider configuration. GENERAL-003 does not reopen any
of those decisions.

## Goal

Deliver a single-node, restart-durable backend boundary for sandbox security
simulation evaluations:

- authenticate public requests with short-lived opaque capabilities;
- authorize stage and policy-profile access with deny-by-default rules;
- reject HTTP bodies larger than 768 KiB before JSON parsing;
- enforce fixed per-capability, global, and concurrency limits;
- bind idempotency to authorization scope and the Engine-owned canonical
  request fingerprint;
- invoke the GENERAL-002 production Engine without duplicating Engine logic;
- persist content-free durable audit records in SQLite; and
- expose a bounded audit read contract for GENERAL-005.

## Scope

### In Scope

- Public synchronous simulation evaluation API.
- Public capability-protected audit read API.
- Internal capability issue and revoke APIs.
- Internal fixed-retention audit purge API.
- Opaque bearer capability generation, hashing, expiry, revocation, and
  restart persistence.
- Deployment-selected, process-lifetime-fixed GENERAL-002 production mode.
- Engine canonical fingerprint HMAC port.
- SQLite schema, migrations, integrity checks, transactions, and recovery.
- Idempotency claim, replay, conflict, interruption, and expiry behavior.
- Content-free audit projection and pagination.
- Focused unit, adapter, integration, repository, privacy, and regression
  tests.

### Out of Scope

- Enforcement-mode public requests or authority reconstruction.
- OpenClaw hooks or enforcement, which belong to GENERAL-004.
- Frontend pages or UI components, which belong to GENERAL-005.
- A network capability-issuance endpoint on the public listener.
- Multiple backend instances, shared databases, leader election, queues,
  workers, sidecars, or distributed rate limiting.
- Refresh tokens, user passwords, sessions, OAuth, OIDC, or a general RBAC
  framework.
- Caller-selectable production detector mode, policy rules, provider, model,
  endpoint, timeout, retry, or fallback.
- HMAC secret rotation or migration between deployment secrets.
- Automatic audit cleanup timers.
- Changes to GENERAL-001 contracts, profiles, reducer, state machine,
  canonicalization, or Engine limits.
- Changes to GENERAL-002 detectors, benchmark, sealed evidence, provider
  protocols, or P6/P7 acceptance.

## Approved Decisions

1. Deployment is single-node and uses a restart-durable local database.
2. Persistence uses Node.js 22 `node:sqlite` without a new runtime dependency.
3. Capabilities are high-entropy opaque bearer tokens. Only their SHA-256
   digests are stored.
4. Capabilities survive restart, can be revoked, default to 15 minutes, and
   may not exceed 1 hour.
5. Capability issue and revoke routes reuse the existing internal listener and
   an environment-supplied bootstrap administrator bearer secret.
6. The public evaluation route is simulation-only. GENERAL-004 owns future
   enforcement authority reconstruction.
7. Evaluation is synchronous. A concurrent request for an in-progress
   idempotency key receives a stable conflict rather than waiting.
8. Evaluation limits are 12 requests per minute per capability with burst 3,
   60 requests per minute deployment-wide, and 4 concurrent Engine calls.
9. Completed idempotency responses are retained for 24 hours. In-progress
   records become interrupted after process restart and may be retried only
   with the same fingerprint.
10. Durable audit records are retained for 90 days and have a capability-
    protected bounded read API.
11. The production mode is an explicit deployment setting selected from
    `rule_only`, `local`, or `local_and_judge`. It has no default, is fixed for
    the process lifetime, and contributes to authorization-scope identity.
12. GENERAL-003 can finish as `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`, but cannot
    be globally `VERIFIED` while GENERAL-002 lacks formal P6 evidence.

## Architecture

### Module Boundary

Production code belongs under:

```text
backend/src/modules/sandbox-security/
```

The module has four boundaries:

```text
HTTP controller
  -> application service
    -> domain ports
      -> SQLite / production Engine / crypto adapters
```

- Controllers own route headers, body admission, DTO normalization, status
  mapping, and response envelopes.
- Application services own orchestration order and transaction intent.
- Domain ports define persistence, clock, randomness, rate limiting,
  fingerprinting, and Engine invocation boundaries.
- Adapters own `node:sqlite`, Node crypto, GENERAL-001 public Engine imports,
  and GENERAL-002 public production composition imports.

Controllers and repositories must not import Engine-private modules. The
backend must not implement JCS, profile reduction, trust derivation, detector
routing, policy reduction, or decision validation.

### Existing Listener Integration

The existing public listener adds evaluation and audit-read routes. The
existing internal listener adds capability-management and audit-purge routes.
No `/internal/*` route is added to the public router and no public route is
added to the internal router.

Existing task-center and Track 1 behavior remains compatible. Test composition
may inject a sandbox-security module. Production startup must construct the
module from validated environment configuration before opening either
listener.

### UI Component Skeleton

There is no UI component work in GENERAL-003. The only frontend-facing output
is the shared audit event/page contract that GENERAL-005 may consume later.

## Production Configuration

Production startup requires these GENERAL-003 settings:

```text
SANDBOX_SECURITY_STORAGE_PATH
SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY
SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN
SANDBOX_SECURITY_PRODUCTION_MODE
```

- `SANDBOX_SECURITY_STORAGE_PATH` is an absolute path to the SQLite database.
- `SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY` is exactly 32 random bytes represented
  as unpadded base64url.
- `SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN` is exactly 32 random bytes
  represented as unpadded base64url.
- `SANDBOX_SECURITY_PRODUCTION_MODE` is exactly `rule_only`, `local`, or
  `local_and_judge`.

GENERAL-002 continues to own any Ollama and Judge environment required by the
selected production mode. GENERAL-003 cannot add defaults for those settings.

Missing, malformed, unsupported, or inconsistent configuration fails startup
before listener binding. The selected production mode is immutable after
startup and is never accepted from an HTTP request, capability request, query,
or existing database row.

The database stores a deployment-key binding derived with the domain
`sandbox-security-deployment-key-id.v1`. A database created under a different
HMAC key fails startup. Secret rotation is a future, separately approved
requirement.

## Capability Model

### Token

A capability token has this grammar:

```regex
^sbxcap_v1\.[A-Za-z0-9_-]{43}$
```

The suffix is 32 bytes from `crypto.randomBytes`, encoded as unpadded
base64url. The raw token is returned exactly once by the issue API. Persistence
uses only:

```text
sha256:<64 lowercase hex>
```

Capability lookup gives missing, malformed, expired, and revoked tokens the
same public `401` response. The raw token and digest never enter response
errors, logs, audit, metrics, traces, URLs, or idempotency storage.

### Grant

The issue request contains:

```ts
type SandboxSecurityCapabilityScope =
  | "sandbox_security:evaluate"
  | "sandbox_security:audit:read";

interface SandboxSecurityCapabilityIssueRequest {
  schema_version: "sandbox-security-capability-issue-request.v1";
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  ttl_seconds?: number;
}
```

`subject_id` matches `^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`. Scope, stage, and
profile arrays are dense, duplicate-free, and normalized to catalog order.
At least one scope is required.

When `sandbox_security:evaluate` is present, both authorization arrays must be
non-empty. When it is absent, both arrays must be empty. When supplied, TTL is
an integer from 60 through 3600 seconds; omission selects the approved 900
second default.

The issue response contains capability ID, subject ID, normalized grant,
issued/expiry timestamps, and the one-time raw bearer token. Revocation is
idempotent and returns the stored revoked state without returning the token.

### Effective Authorization Scope

Every issued capability owns a random scope seed. The effective
`authorization_scope_id` uses the domain
`sandbox-security-authorization-scope.v1` and is an HMAC over:

- the scope seed;
- `sandbox-security-production-composition.v1`; and
- the selected production mode.

It therefore changes if the deployment changes production mode, preventing
old-mode idempotency replay. Two separately issued capabilities never share an
authorization scope even when their visible grants are equal.

## HTTP API

### Public Simulation Evaluation

```http
POST /api/sandbox/security/evaluations
Authorization: Bearer <capability>
Idempotency-Key: <opaque-key>
Content-Type: application/json
```

The JSON body is exactly `SandboxSecurityRequest`. It does not contain an
evaluation mode. After shared structural normalization, the backend constructs
an Engine-private authoritative context with:

- `evaluation_mode: "simulation"`;
- the normalized request stage and profile;
- one `simulation_observation` for every content item in the same order; and
- an optional `simulation_observation` tool request.

Public content and authoritative observations must match exactly. A public
request cannot construct `platform_control` or `integration_observation`.

The capability requires `sandbox_security:evaluate`; stage and profile must
appear in its grant. Success returns:

```ts
ApiResponse<SandboxSecurityDecision>
```

with HTTP 200.

`Idempotency-Key` must match:

```regex
^[A-Za-z0-9._~-]{16,128}$
```

The raw key is never persisted. The persisted key is a domain-separated HMAC
using `sandbox-security-idempotency-key.v1`.

### Public Audit Read

```http
GET /api/sandbox/security/audit-events?cursor=<opaque>&limit=<1..100>
Authorization: Bearer <capability>
```

The capability requires `sandbox_security:audit:read`. `limit` defaults to 50
and cannot exceed 100. Ordering is descending `(occurred_at, event_id)` and
pagination is keyset-based.

The cursor contains schema version, effective authorization scope, and the
last ordering key. It is authenticated using the domain
`sandbox-security-audit-cursor.v1`. A cursor cannot be reused by a different
authorization scope or after its capability expires.

The shared page is:

```ts
interface SandboxSecurityAuditPage {
  schema_version: "sandbox-security-audit-page.v1";
  events: SandboxSecurityAuditEvent[];
  next_cursor: string | null;
}
```

Success returns `ApiResponse<SandboxSecurityAuditPage>` with HTTP 200.

### Internal Capability Issue

```http
POST /internal/sandbox/security/capabilities
Authorization: Bearer <bootstrap-admin-token>
Content-Type: application/json
```

The exact request is `SandboxSecurityCapabilityIssueRequest`. A successful
issue returns HTTP 201 and the raw token exactly once. Its raw request body is
capped at 65536 bytes before JSON parsing.

### Internal Capability Revoke

```http
POST /internal/sandbox/security/capabilities/:capabilityId/revoke
Authorization: Bearer <bootstrap-admin-token>
```

This route accepts no JSON body. A valid existing capability returns HTTP 200.
Repeated calls return the original revoked timestamp. Unknown IDs return a
stable 404.

### Internal Audit Purge

```http
POST /internal/sandbox/security/audit-events/purge
Authorization: Bearer <bootstrap-admin-token>
```

This route accepts no JSON body. It deletes no more than 1000 audit rows older
than 90 days in one transaction and returns `deleted_count` plus `has_more`.
The cutoff cannot be supplied by the caller. The transaction appends one
content-free `audit_purged` event after deletion.

## Stable HTTP Errors

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | `SANDBOX_SECURITY_INVALID_REQUEST` | malformed headers, JSON, or request contract |
| 400 | `SANDBOX_SECURITY_AUDIT_CURSOR_INVALID` | malformed, tampered, or wrong-scope cursor |
| 401 | `SANDBOX_SECURITY_UNAUTHORIZED` | public capability cannot authenticate |
| 401 | `SANDBOX_SECURITY_ADMIN_UNAUTHORIZED` | bootstrap administrator cannot authenticate |
| 403 | `SANDBOX_SECURITY_FORBIDDEN` | scope, stage, or profile is not allowed |
| 404 | `SANDBOX_SECURITY_CAPABILITY_NOT_FOUND` | revoke target does not exist |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` | same scope/key has a different fingerprint |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS` | same scope/key/fingerprint is executing |
| 413 | `SANDBOX_SECURITY_BODY_TOO_LARGE` | raw body exceeds its route-specific limit |
| 415 | `SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE` | media type is not `application/json` |
| 429 | `SANDBOX_SECURITY_RATE_LIMITED` | a token bucket rejected the request |
| 429 | `SANDBOX_SECURITY_CONCURRENCY_LIMITED` | all four Engine slots are occupied |
| 500 | `SANDBOX_SECURITY_INTERNAL_ERROR` | Engine, crypto, persistence, or invariant failure |

Errors use the repository `ApiResponse` error envelope and a request ID. They
never include bearer tokens, request content, idempotency keys, fingerprints,
canonical bytes, SQLite details, causes, stacks, provider messages, or Engine
private diagnostics.

`SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS`, rate-limit, and concurrency errors
include a bounded integer `Retry-After` header. They do not wait for another
request to finish.

## HTTP Admission And Limits

The public evaluation order is fixed:

1. route match;
2. deployment-wide token bucket;
3. capability header syntax, digest lookup, expiry, and revocation;
4. capability token bucket and concurrent-slot admission;
5. `Idempotency-Key` syntax;
6. exact `application/json` media-type check;
7. raw body read capped at 786432 bytes before parse;
8. JSON parse and shared request normalization;
9. stage/profile authorization;
10. authoritative simulation request construction;
11. Engine-owned canonical fingerprint;
12. idempotency claim;
13. Engine evaluation;
14. atomic idempotency completion and audit write;
15. response.

Authentication therefore occurs before request-body parsing. Concurrency slots
are always released in `finally`, including persistence and response failures.

Token buckets use a monotonic clock:

- capability bucket: capacity 3, refill 0.2 tokens/second;
- deployment bucket: capacity 10, refill 1 token/second;
- administrator bucket: capacity 2, refill 1 token/6 seconds.

Buckets and the four-slot concurrency counter are process-local and reset after
restart. Capability, idempotency, and audit state does not reset.

## Engine Gateway

The backend-facing gateway is:

```ts
interface SandboxSecurityEvaluationGateway {
  readonly composition_binding: string;
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>
  ): string;
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    signal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
```

The production adapter imports only:

- `createSandboxSecurityProductionEngine` from the GENERAL-002 public
  production index;
- `createSandboxSecurityCanonicalFingerprintService` and public types from the
  GENERAL-001 security index; and
- shared request/decision normalizers from the shared public surface.

The canonical fingerprint port computes:

```text
hmac-sha256:<HMAC-SHA-256(
  deployment_key,
  "sandbox-security-canonical-fingerprint.v1" || 0x00 || canonical_bytes
)>
```

The port uses the bytes transiently and retains no reference. Backend code sees
only the returned keyed fingerprint. Invalid port output or fingerprint-service
failure becomes the stable internal error and cannot create an idempotency row.

The gateway normalizes every Engine decision before it leaves the adapter. An
invalid decision fails closed and is never persisted or returned.

## Application Service Signatures

```ts
interface SandboxSecurityEvaluationService {
  evaluate(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    idempotency_key: string;
    submission: SandboxSecurityRequest;
    signal?: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityDecision>>;
}

interface SandboxSecurityCapabilityService {
  issue(
    request: Readonly<SandboxSecurityCapabilityIssueRequest>
  ): Readonly<SandboxSecurityCapabilityIssueResult>;
  revoke(capabilityId: string): Readonly<SandboxSecurityCapabilityRecord>;
}

interface SandboxSecurityAuditService {
  list(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    cursor?: string;
    limit: number;
  }>): Readonly<SandboxSecurityAuditPage>;
  purgeExpired(): Readonly<{
    deleted_count: number;
    has_more: boolean;
  }>;
}
```

Repository ports expose domain operations, not SQL statements or `DatabaseSync`
objects. Transactional operations include:

- capability insert plus `capability_issued` audit;
- capability revoke plus `capability_revoked` audit;
- completed-response replay plus `evaluation_replayed` audit;
- idempotency completion plus `evaluation_completed` audit;
- idempotency interruption plus `evaluation_interrupted` audit; and
- audit purge plus `audit_purged` audit.

## SQLite Design

### Startup And File Boundary

The database parent must already exist. The configured database path must be
absolute. Startup rejects a symbolic link or an existing non-regular file,
opens/creates the database, and requires mode `0600`. This is an application
boundary, not a claim against a malicious local root or a TOCTOU-capable local
administrator.

Startup enables:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

Migrations are monotonic and transactional. A schema version newer than the
binary fails startup. `PRAGMA quick_check` failure also fails startup.

### Tables

The initial schema contains:

```text
sandbox_security_metadata
sandbox_security_capabilities
sandbox_security_capability_scopes
sandbox_security_capability_stages
sandbox_security_capability_profiles
sandbox_security_idempotency_records
sandbox_security_audit_events
sandbox_security_schema_migrations
```

Capability tables store only normalized grants, IDs, token digest, random scope
seed, timestamps, and revocation state.

Idempotency rows contain:

```ts
type SandboxSecurityIdempotencyStatus =
  | "in_progress"
  | "completed"
  | "interrupted";

interface SandboxSecurityIdempotencyRecord {
  authorization_scope_id: string;
  idempotency_key_hmac: string;
  request_fingerprint: string;
  status: SandboxSecurityIdempotencyStatus;
  response_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
```

The unique key is `(authorization_scope_id, idempotency_key_hmac)`.
`response_json` is non-null only for `completed` and contains only a normalized
`SandboxSecurityDecision`. It is normalized again before replay.

Audit rows use typed columns for event metadata and validated fixed-shape JSON
only for category and detector-run status counts. They never contain arbitrary
request or provider JSON.

### Idempotency State Machine

After a valid Engine fingerprint exists, one immediate transaction performs:

- expired row: delete it and continue as an absent row;
- absent row: insert `in_progress` and return `claimed`;
- same fingerprint plus `completed`: append a replay audit event and return the
  normalized cached response;
- same fingerprint plus `in_progress`: return in-progress conflict;
- same fingerprint plus `interrupted`: update to `in_progress` and return
  `claimed`; or
- different fingerprint in any non-expired state: return fingerprint conflict.

Engine evaluation runs outside a SQLite transaction. Success completes the row
and appends audit in one transaction before HTTP response. Engine failure marks
the row interrupted and appends interruption audit in one transaction.
Completion-transaction failure makes a best-effort separate interruption
transaction; failure to mark it does not replace the original fixed error.

At startup, every `in_progress` row becomes `interrupted`. Expired rows are
ignored for admission and may be deleted in a bounded maintenance transaction.
No failed fingerprint calculation creates a row.

## Durable Audit Contract

### Event Types

The exact v1 event catalog is:

```ts
type SandboxSecurityAuditEventType =
  | "evaluation_completed"
  | "evaluation_replayed"
  | "evaluation_interrupted"
  | "evaluation_rejected"
  | "capability_issued"
  | "capability_revoked"
  | "audit_read"
  | "audit_purged";
```

Known-capability expiry, revocation, authorization denial, rate rejection, and
concurrency rejection produce content-free `evaluation_rejected` events.
Unknown bearer tokens and invalid bootstrap administrator secrets do not create
durable events, preventing unauthenticated write amplification.

Audit reads are themselves recorded after the page has been selected and before
the HTTP response. The new `audit_read` row cannot appear in the page currently
being returned. If that audit write fails, the selected page is not returned.

### Evaluation Projection

A completed evaluation retains only:

- audit event ID and schema version;
- event type and occurred-at timestamp;
- request ID;
- capability ID and subject ID;
- stage and policy profile ID;
- verdict, action, and risk level;
- exact counts for all nine risk categories;
- exact counts for all six detector-run statuses;
- total bounded elapsed milliseconds; and
- production composition binding.

The projection removes:

- source and call tokens;
- source and tool locators;
- evidence references;
- finding IDs;
- detector IDs and versions;
- provenance;
- idempotency keys and their HMACs;
- canonical request fingerprints;
- ordinary content hashes;
- raw and sanitized values;
- provider request or response data;
- credentials; and
- all free text.

This stricter projection is separate from the public Decision. The idempotency
store may retain a normalized Decision for 24-hour response replay, but the
durable audit store may not.

## Failure And Privacy Rules

- Deny by default before body parsing.
- Do not log raw headers, body chunks, parsed submissions, authoritative
  contexts, canonical bytes, fingerprints, provider data, or SQLite payloads.
- Stop reading and close the request stream after the raw body limit is
  exceeded.
- Do not return an Engine decision until both idempotency completion and audit
  commit succeed.
- Treat SQLite busy exhaustion, corruption, constraint failure, invalid cached
  JSON, or transaction failure as a fixed internal error.
- Treat malformed Engine output as a fixed internal error.
- Do not convert Engine terminal errors into fabricated Decisions.
- Do not create retries or provider fallbacks. Client retry under the approved
  interrupted idempotency rule is the only retry behavior introduced here.
- Keep all secrets and raw values out of application-managed metrics, traces,
  audit, caches, queues, and generated test artifacts.
- The application does not claim memory zeroization, protection from malicious
  in-process production detectors, or protection from local root, swap,
  debuggers, browser extensions, or DevTools.

## TDD Strategy

Every implementation slice follows:

```text
write focused test -> run and confirm intended RED -> minimal GREEN -> refactor
```

No production behavior is written before its failing test is observed. Import,
syntax, environment, or missing-tool errors are not acceptable RED evidence.

### Test Order

1. Shared exact-key types and normalizers for audit pages/events.
2. Simulation authoritative-context builder.
3. Domain-separated HMAC and capability token generation.
4. Capability normalization, issue, expiry, authorization, and revoke.
5. In-memory monotonic rate and concurrency limiters.
6. Idempotency state machine with a fake repository.
7. Audit projection and prohibited-field tests.
8. Real temporary SQLite migrations, repositories, transactions, recovery,
   retention, permissions, and corruption handling.
9. Evaluation service orchestration with fake Engine/fingerprint ports.
10. Public and internal controller tests.
11. Public and internal HTTP integration tests.
12. Repository import/privacy gates and full relevant regressions.

### Required Scenarios

Tests must prove at least:

- authentication occurs before body read;
- UTF-8 bodies at exactly 786432 bytes pass body admission and one byte over
  fails before JSON parse;
- public input always becomes simulation authority and can never request
  enforcement authority;
- capability scope, stage, and profile are all enforced;
- token TTL boundaries and idempotent revocation survive restart;
- omitted capability TTL resolves to 900 seconds and explicit TTL remains
  within 60 through 3600 seconds;
- per-capability/global buckets and four concurrent slots release correctly;
- fingerprint is produced by the Engine helper before idempotency claim;
- invalid fingerprints create no idempotency row;
- same scope/key/fingerprint calls Engine once after completion;
- completed replay writes content-free replay audit before returning;
- in-progress requests do not wait;
- changed fingerprints conflict;
- changed production mode cannot replay an old-mode response;
- startup recovers stale in-progress rows as interrupted;
- Engine and commit failure returns no uncommitted Decision;
- cached Decisions are normalized before replay;
- capability changes and audit, and evaluation completion and audit, are
  atomic;
- audit pagination is bounded, deterministic, and cursor-authenticated;
- purge uses the fixed 90-day cutoff and 1000-row limit;
- unknown tokens and bad administrator secrets do not amplify durable writes;
- known-capability denials are audited without content; and
- existing public/internal route separation remains intact.

### Leak Sentinel

Privacy tests place unique raw sentinel text in text content, JSON content, tool
arguments, provenance-safe identifiers, and deliberately malformed requests.
After success and failure paths, tests scan:

- error responses;
- audit API responses;
- captured application logs;
- the SQLite main file;
- SQLite WAL and SHM files when present; and
- generated test artifacts.

The test rejects literal, base64, hex, case-folded, and NFKC sentinel forms
where applicable. It separately asserts that audit JSON contains no locator,
evidence, finding, provenance, token, idempotency, fingerprint, ordinary hash,
or provider keys.

## Validation Gates

Focused tests run first. The required widening sequence is:

```text
npm run test:shared
npm run test:backend
npm run test:engine:sandbox:production
npm run test:repo
npm run typecheck:benchmark:sandbox-security
npm run test:frontend
git diff --check
```

The implementation plan may add a backend typecheck command if the current
package scripts do not provide one; that is a configuration-only change and
must not conceal type errors.

`npm run test:all` must also be attempted and reported. Its hermetic replay is
expected to fail closed until GENERAL-002 has formal signed P6 evidence. That
known result is not waived, skipped, or called green.

## Acceptance Criteria

GENERAL-003 reaches `IMPLEMENTED_PENDING_GLOBAL_P6_GATE` only when:

1. all five approved routes exist on the correct listener;
2. capabilities are opaque, restart-durable, expiring, revocable, and stored
   only by digest;
3. evaluation is simulation-only and deny-by-default;
4. 768 KiB body admission, fixed rate limits, and concurrency limits pass;
5. idempotency is bound to effective authorization scope and the Engine-owned
   HMAC fingerprint;
6. SQLite restart recovery and transactional boundaries pass;
7. audit records and pages satisfy the strict content-free schema;
8. no caller can select production mode, enforcement authority, provider,
   model, profile outside its grant, timeout, retry, or fallback;
9. privacy sentinel tests find zero application-managed raw-content leaks;
10. focused and relevant regression gates pass;
11. documentation and repository gates are updated; and
12. code review finds no unresolved correctness, security, or maintainability
    issue.

It cannot reach global `VERIFIED` until the deferred GENERAL-002 formal P6 and
hermetic replay gates pass.

## Expected File Changes

The implementation plan must refine this list before the first RED test. The
currently expected changes are:

### Shared

- Add `shared/types/sandbox-security-api.ts`.
- Add `shared/contracts/sandbox-security-api.ts`.
- Modify `shared/index.ts`.
- Add `shared/tests/sandbox-security-api-contract.spec.ts`.
- Modify root/shared test scripts as needed to run the new spec.

### Backend Production

- Add `backend/src/modules/sandbox-security/sandbox-security.module.ts`.
- Add public/internal sandbox-security controllers.
- Add evaluation, capability, and audit application services.
- Add exact DTO normalizers and simulation authority builder.
- Add authorizer, token-bucket, concurrency, HMAC, and audit-projector modules.
- Add capability, idempotency, audit, clock, and gateway port interfaces.
- Add `node:sqlite` database/migration and repository adapters.
- Add GENERAL-001 fingerprint and GENERAL-002 production Engine gateway.
- Modify `backend/src/common/http/router.ts`.
- Modify `backend/src/common/http/internal-router.ts`.
- Modify `backend/src/app.module.ts`.
- Modify `backend/src/internal-app.module.ts`.
- Modify `backend/src/runtime-dependencies.ts` as required by composition.
- Modify `backend/src/main.ts` for validated asynchronous production startup
  and database closure.

### Tests

- Add focused backend unit specs for every domain/application module.
- Add real SQLite adapter/restart specs.
- Add public/internal controller specs.
- Add `tests/integration/backend-sandbox-security.api.spec.ts`.
- Add a repository GENERAL-003 import/privacy/spec gate.
- Modify root backend/repository test scripts to include the new specs.

### Documentation

- Replace `docs/sprint-current.md` with GENERAL-003 as the sole current
  requirement while retaining the GENERAL-002 provisional dependency status.
- Update `README.md`.
- Update `docs/architecture.md`.
- Update `docs/api-contract.md`.
- Update `docs/progress.md` after the requirement implementation checkpoint.

No frontend production file, OpenClaw file, GENERAL-001 Engine semantic file,
GENERAL-002 detector/benchmark file, or database technology outside
`node:sqlite` is expected to change. Any discovered need to cross one of those
boundaries requires stopping for explicit approval.

## Documentation And Stop Rule

After implementation, update the required durable documents, record exact RED
and GREEN evidence, run verification, perform closing code review, and stop.
Do not begin GENERAL-004.

The completion report must list modified files, added tests, exact test results,
current requirement status, the remaining GENERAL-002 P6 gate, and a suggested
commit message.

## Open Questions

None. The design decisions needed for implementation planning are closed.
