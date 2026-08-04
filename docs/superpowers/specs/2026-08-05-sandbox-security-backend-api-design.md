# Sandbox Security Authenticated Backend API Design

## Document Status

- Requirement: `REQ-SBX-GENERAL-003`
- Date: `2026-08-05`
- Status: `APPROVED_SPEC_PLAN_COMPLETE_PENDING_USER_APPROVAL`
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

## Independent Review Record

- Final review verdict: `PASS`
- Critical findings: none
- Important findings: none
- Closed findings: route-scope admission order, canonical fingerprint vector,
  behavior-based RED boundaries, response-safe 408/413 connection closure,
  and exact idempotency-maintenance health transitions
- Non-blocking planning note: the implementation plan must lock the exact
  `Retry-After` calculation and upper bound for in-progress, rate-limit, and
  concurrency responses; storage-unavailable remains fixed at 60 seconds

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

The database stores the exact deployment-key binding defined below. A database
created under a different HMAC key fails startup. Secret rotation is a future,
separately approved requirement.

## Cryptographic Encoding

All GENERAL-003 HMACs use the decoded 32-byte deployment key and the same
unambiguous binary frame. This backend frame is not JCS and is never used for
the Engine authoritative projection.

```text
HMAC_FRAME(domain, fields) =
  ASCII("sandbox-security-hmac-frame.v1")
  || 0x00
  || U16BE(byte_length(ASCII(domain)))
  || ASCII(domain)
  || U8(field_count)
  || for each field in order:
       U32BE(field.byte_length) || field
```

Domains and textual fields are strict ASCII. Field count is at most 255 and
each field is at most `2^32 - 1` bytes. Decoders reject non-canonical base64url,
wrong field counts, trailing bytes, invalid ASCII, and lengths outside the
contract before any comparison.

The exact constructions are:

```text
deployment_key_id =
  "deployment-key:hmac-sha256:" || HEXLOWER(
    HMAC-SHA-256(key, HMAC_FRAME(
      "sandbox-security-deployment-key-id.v1", [])))

authorization_scope_id =
  "authscope:hmac-sha256:" || HEXLOWER(
    HMAC-SHA-256(key, HMAC_FRAME(
      "sandbox-security-authorization-scope.v1",
      [scope_seed_32_bytes,
       ASCII("sandbox-security-production-composition.v1"),
       ASCII(production_mode)])))

idempotency_key_hmac =
  "idem-key:hmac-sha256:" || HEXLOWER(
    HMAC-SHA-256(key, HMAC_FRAME(
      "sandbox-security-idempotency-key.v1",
      [ASCII(idempotency_key)])))

canonical_fingerprint =
  "hmac-sha256:" || HEXLOWER(
    HMAC-SHA-256(key, HMAC_FRAME(
      "sandbox-security-canonical-fingerprint.v1",
      [canonical_bytes])))
```

The audit cursor payload is:

```text
cursor_payload = HMAC_FRAME(
  "sandbox-security-audit-cursor-payload.v1",
  [ASCII(reader_subject_id),
   ASCII(reader_authorization_scope_id),
   ASCII(last_occurred_at),
   ASCII(last_event_id)])

cursor_mac = HMAC-SHA-256(key, HMAC_FRAME(
  "sandbox-security-audit-cursor.v1", [cursor_payload]))

cursor = "sbxcur_v1."
  || BASE64URL_UNPADDED(cursor_payload)
  || "."
  || BASE64URL_UNPADDED(cursor_mac)
```

Cursor verification decodes both components, requires a 32-byte MAC,
re-encodes the payload canonically, and uses `timingSafeEqual` on the calculated
and supplied MAC before inspecting its fields. It then requires both subject ID
and authorization scope to equal the authenticated reader.

The required fixed vector uses deployment key bytes `00 01 ... 1f`, scope seed
bytes `20 21 ... 3f`, production mode `rule_only`, idempotency key
`0123456789abcdef`, canonical bytes `{"a":1}`, reader subject `subject-1`,
timestamp `2026-08-05T00:00:00.000Z`, and event ID
`audit:00000000-0000-4000-8000-000000000000`:

```text
deployment-key:hmac-sha256:77a1daccca40976ee878c11f4997d2fc892beb7dfce0c784fb220f597643c707
authscope:hmac-sha256:35fab58ba1030b8017c1c5e4a1d9e417a40790dcbdae2dfd29cfe8dfcd4c5576
idem-key:hmac-sha256:5fa0e143c2b27daf6febb5965f3504ec65ea47388a12bca468ce8f3bc0971fab
hmac-sha256:b2dc6da1345ba6630fdd7aaf1ef1082724b6d1a481ba03016a28286c750dbb11
sbxcur_v1.c2FuZGJveC1zZWN1cml0eS1obWFjLWZyYW1lLnYxAAAoc2FuZGJveC1zZWN1cml0eS1hdWRpdC1jdXJzb3ItcGF5bG9hZC52MQQAAAAJc3ViamVjdC0xAAAAVmF1dGhzY29wZTpobWFjLXNoYTI1NjozNWZhYjU4YmExMDMwYjgwMTdjMWM1ZTRhMWQ5ZTQxN2E0MDc5MGRjYmRhZTJkZmQyOWNmZThkZmNkNGM1NTc2AAAAGDIwMjYtMDgtMDVUMDA6MDA6MDAuMDAwWgAAACphdWRpdDowMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDA.Wj9H8dTbAMxvo7PKROraABoqjKlUuINNjaK0XGLSpXs
```

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

Capability IDs match:

```regex
^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

Issue and revoke responses use exact-key backend-local DTOs:

```ts
interface SandboxSecurityCapabilityIssueResult {
  schema_version: "sandbox-security-capability-issue-result.v1";
  capability_id: string;
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  bearer_token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: null;
}

interface SandboxSecurityCapabilityPublicRecord {
  schema_version: "sandbox-security-capability-record.v1";
  capability_id: string;
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}
```

All timestamps use strict UTC millisecond ISO form
`YYYY-MM-DDTHH:mm:ss.sssZ`. `expires_at` is exactly `issued_at + ttl_seconds`.
The first revoke fixes `revoked_at`; later revokes return that timestamp.

The backend-private records are:

```ts
interface SandboxSecurityCapabilityPersistenceRecord {
  capability_id: string;
  subject_id: string;
  token_digest: `sha256:${string}`;
  scope_seed: Uint8Array;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids:
    readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

interface SandboxSecurityAuthorizedCapability {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids:
    readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}
```

The persistence record is accepted only by repository adapters. The authorized
record omits the token digest and scope seed and is accepted only by application
services. Capability HTTP DTOs remain in `backend/`; only the public audit page
and event types belong in `shared/`.

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

Only `cursor` and `limit` query keys are allowed, each at most once. Percent
decoding failure, an unknown/repeated key, an empty cursor, or a cursor over
2048 ASCII bytes is `400`. A supplied limit matches `^[1-9][0-9]{0,2}$` and its
numeric value is at most 100; signs, whitespace, decimals, exponent form, and
leading zeroes are rejected.

Audit visibility is subject-scoped. The repository predicate is always:

```sql
visibility_subject_id = :authenticated_subject_id
```

A reader may therefore see events produced by multiple capabilities issued to
the same trusted administrator-assigned `subject_id`, but never events owned by
another subject. There is no deployment-wide public audit grant in v1.

The cursor contains schema version, effective authorization scope, and the
reader subject plus the last ordering key. It is authenticated using the domain
`sandbox-security-audit-cursor.v1`. A cursor cannot be reused by a different
subject, authorization scope, or expired capability.

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

Success is `ApiResponse<SandboxSecurityCapabilityIssueResult>`.

### Internal Capability Revoke

```http
POST /internal/sandbox/security/capabilities/:capabilityId/revoke
Authorization: Bearer <bootstrap-admin-token>
```

This route accepts no JSON body. A valid existing capability returns HTTP 200.
Repeated calls return the original revoked timestamp. Unknown IDs return a
stable 404.

Success is `ApiResponse<SandboxSecurityCapabilityPublicRecord>`.

### Internal Audit Purge

```http
POST /internal/sandbox/security/audit-events/purge
Authorization: Bearer <bootstrap-admin-token>
```

This route accepts no JSON body. It deletes no more than 1000 audit rows older
than 90 days in one transaction and returns `deleted_count` plus `has_more`.
The cutoff cannot be supplied by the caller. The transaction appends one
content-free `audit_purged` event after deletion.

Success is `ApiResponse<SandboxSecurityAuditPurgeResult>`, where the
backend-local exact-key result is:

```ts
interface SandboxSecurityAuditPurgeResult {
  schema_version: "sandbox-security-audit-purge-result.v1";
  retention_days: 90;
  deleted_count: number;
  has_more: boolean;
}
```

## Stable HTTP Errors

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | `SANDBOX_SECURITY_INVALID_REQUEST` | malformed non-credential headers, query, JSON, or request contract |
| 400 | `SANDBOX_SECURITY_AUDIT_CURSOR_INVALID` | malformed, tampered, or wrong-scope cursor |
| 401 | `SANDBOX_SECURITY_UNAUTHORIZED` | public capability cannot authenticate |
| 401 | `SANDBOX_SECURITY_ADMIN_UNAUTHORIZED` | bootstrap administrator cannot authenticate |
| 403 | `SANDBOX_SECURITY_FORBIDDEN` | scope, stage, or profile is not allowed |
| 404 | `SANDBOX_SECURITY_CAPABILITY_NOT_FOUND` | revoke target does not exist |
| 408 | `SANDBOX_SECURITY_REQUEST_TIMEOUT` | authenticated request body misses its 5000 ms read deadline |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT` | same scope/key has a different fingerprint |
| 409 | `SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS` | same scope/key/fingerprint is executing |
| 413 | `SANDBOX_SECURITY_BODY_TOO_LARGE` | raw body exceeds its route-specific limit |
| 415 | `SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE` | media type is not `application/json` |
| 429 | `SANDBOX_SECURITY_RATE_LIMITED` | a token bucket rejected the request |
| 429 | `SANDBOX_SECURITY_CONCURRENCY_LIMITED` | all four Engine slots are occupied |
| 500 | `SANDBOX_SECURITY_INTERNAL_ERROR` | Engine, crypto, persistence, or invariant failure |
| 503 | `SANDBOX_SECURITY_STORAGE_UNAVAILABLE` | idempotency maintenance is degraded or closed |

Errors use the repository `ApiResponse` error envelope and a request ID. They
never include bearer tokens, request content, idempotency keys, fingerprints,
canonical bytes, SQLite details, causes, stacks, provider messages, or Engine
private diagnostics.

`SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS`, rate-limit, concurrency, and
storage-unavailable errors include a bounded integer `Retry-After` header. They
do not wait for another request to finish.

## HTTP Admission And Limits

Security-sensitive headers are inspected from `IncomingMessage.rawHeaders`
case-insensitively. `Authorization`, `Idempotency-Key`, `Content-Type`,
`Content-Encoding`, `Content-Length`, and `Transfer-Encoding` may occur at most
once. Duplicate Authorization is `401`; duplicate Content-Type or a present
Content-Encoding is `415`; every other duplicate is `400`.

Authorization has exactly one ASCII space and no leading/trailing whitespace:

```text
Bearer <token>
```

Malformed or absent public Authorization is `401`, including a malformed token
grammar. Malformed or absent internal administrator Authorization is the fixed
administrator `401`. The bootstrap administrator parser hashes both supplied
and expected token bytes with SHA-256 and uses `timingSafeEqual` on the two
fixed 32-byte hashes. It never compares raw variable-length secrets.

Body-bearing routes accept only a Content-Type matching this case-insensitive
grammar after outer OWS is trimmed:

```regex
^application/json(?:[ \t]*;[ \t]*charset=utf-8)?$
```

Quoted charset, other parameters, Content-Encoding, and transfer compression
are rejected. Body bytes are decoded with
`new TextDecoder("utf-8", { fatal: true })`; replacement decoding is forbidden.
Declared Content-Length over the route limit fails before iteration. Chunked
bodies are counted incrementally and fail as soon as the next byte would exceed
the limit.

Body-bearing routes allow either one canonical decimal Content-Length or one
case-insensitive `Transfer-Encoding: chunked`, never both. Content-Length has no
sign or surrounding whitespace and matches `^(0|[1-9][0-9]*)$`. Other transfer
codings and comma-separated transfer-coding lists are rejected with `400`.

After successful authentication and route-scope authorization, body-bearing
routes have 5000 ms from the start of body admission to the final byte. Timeout,
caller abort, over-limit, or invalid UTF-8 stops iteration and never parses
partial JSON. A caller-aborted socket may have no writable response.

For server-detected timeout or over-limit, the admission layer pauses request
consumption and returns a tagged close-after-response error. The HTTP handler
sets `Connection: close`, writes and ends the stable JSON 408/413 response, and
destroys the request/socket only from the response `finish` callback. It must
not destroy the `IncomingMessage` before the error response has flushed.

Bodyless routes require no `Transfer-Encoding` and either no Content-Length or
exactly `Content-Length: 0`. Any declared or observed body is `400`.

The route admission matrices are fixed:

| Route | Ordered admission and execution |
| --- | --- |
| public evaluation | public global bucket -> public capability auth -> `sandbox_security:evaluate` scope auth -> idempotency-maintenance health -> capability bucket -> Idempotency-Key -> JSON headers -> 786432-byte/deadline read -> strict decode/parse/shared normalize -> stage/profile auth -> simulation context -> Engine fingerprint -> idempotency claim -> claimed-only Engine slot -> Engine -> release slot -> completion/audit transaction -> response |
| public audit read | public global bucket -> public capability auth -> `sandbox_security:audit:read` scope auth -> capability bucket -> bodyless check -> exact cursor/limit query -> subject-scoped select -> audit-read insert -> response |
| internal capability issue | administrator bucket -> administrator auth -> JSON headers -> 65536-byte/deadline read -> strict decode/parse/backend normalize -> issue/audit transaction -> response |
| internal capability revoke | administrator bucket -> administrator auth -> bodyless check -> exact path ID -> revoke/audit transaction -> response |
| internal audit purge | administrator bucket -> administrator auth -> bodyless check -> idempotency pre-cleanup/health transition -> purge/audit transaction -> response |

The public global bucket precedes authentication and therefore its rejection is
not durably audited. Route scope authorization precedes every body or query
read; only stage and profile require a normalized evaluation body. The
capability bucket is shared by evaluation and audit read requests from that
capability; known-capability bucket rejection is audited. Administrator rate
rejection is not durably audited because the bootstrap secret has not been
authenticated.

An idempotency `completed` result writes its replay audit and returns without
acquiring an Engine slot. An `in_progress` or fingerprint conflict also returns
without a slot. Only a new or reclaimed `claimed` row attempts to acquire one
of the four slots immediately before `gateway.evaluate`.

If no slot is available, one transaction changes the just-claimed row to
`interrupted` and appends `request_rejected` with
`concurrency_limited`, then returns 429. Once acquired, the slot is released in
`finally` immediately when the Engine promise settles, before decision
persistence or HTTP response work. The counter therefore measures concurrent
Engine calls, not slow bodies, fingerprints, cached replays, or SQLite commits.

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

The canonical fingerprint port computes the exact `canonical_fingerprint`
construction in **Cryptographic Encoding**, including its required
`hmac-sha256:<64 lowercase hex>` output grammar and fixed vector.

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
  revoke(
    capabilityId: string
  ): Readonly<SandboxSecurityCapabilityPublicRecord>;
}

interface SandboxSecurityAuditService {
  list(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    cursor?: string;
    limit: number;
  }>): Readonly<SandboxSecurityAuditPage>;
  purgeExpired(): Readonly<SandboxSecurityAuditPurgeResult>;
}
```

Repository ports expose domain operations, not SQL statements or `DatabaseSync`
objects. Transactional operations include:

- capability insert plus `capability_issued` audit;
- capability revoke plus `capability_revoked` audit;
- completed-response replay plus `evaluation_replayed` audit;
- idempotency completion plus `evaluation_completed` audit;
- idempotency interruption plus `evaluation_interrupted` audit;
- claimed-row concurrency rejection plus `request_rejected` audit;
- audit purge plus `audit_purged` audit.

## SQLite Design

### Startup And File Boundary

The database parent must already exist, be a real directory, and have no group
or other permission bits (`0700` or stricter). The configured database path
must be absolute. Startup rejects a symbolic link or an existing non-regular
file, opens/creates the database, and requires mode `0600`. This is an
application boundary, not a claim against a malicious local root or a
TOCTOU-capable local administrator.

Startup enables:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

After WAL creation and after every migration, the database adapter applies
mode `0600` to the main file and any existing `-wal`/`-shm` sidecars and checks
that they are regular non-symlink files inside the validated parent. Parent
directory isolation protects the short creation-to-chmod interval.

Migrations are monotonic and run under `BEGIN IMMEDIATE`. A schema version
newer than the binary, failed `PRAGMA quick_check`, failed permission check, or
failed migration rolls back, closes the database, and fails startup.

### Tables

The v1 logical schema is fixed below. Application normalizers enforce the full
regex and strict timestamp grammars; SQL CHECK constraints enforce closed
catalogs, nullability, byte bounds, and state relationships.

```sql
CREATE TABLE sandbox_security_schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version >= 1),
  applied_at TEXT NOT NULL
);

CREATE TABLE sandbox_security_metadata (
  key TEXT PRIMARY KEY CHECK (key IN ('deployment_key_id')),
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 256)
);

CREATE TABLE sandbox_security_capabilities (
  capability_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 64),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 71),
  scope_seed BLOB NOT NULL CHECK (length(scope_seed) = 32),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE TABLE sandbox_security_capability_scopes (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN (
    'sandbox_security:evaluate', 'sandbox_security:audit:read')),
  PRIMARY KEY (capability_id, scope)
);

CREATE TABLE sandbox_security_capability_stages (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN (
    'user_input', 'model_output', 'tool_request')),
  PRIMARY KEY (capability_id, stage)
);

CREATE TABLE sandbox_security_capability_profiles (
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE CASCADE,
  policy_profile_id TEXT NOT NULL CHECK (policy_profile_id IN (
    'sandbox-security-balanced.v1', 'sandbox-security-strict.v1')),
  PRIMARY KEY (capability_id, policy_profile_id)
);

CREATE TABLE sandbox_security_idempotency_records (
  authorization_scope_id TEXT NOT NULL,
  idempotency_key_hmac TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  capability_id TEXT NOT NULL REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 64),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  stage TEXT NOT NULL CHECK (stage IN (
    'user_input', 'model_output', 'tool_request')),
  policy_profile_id TEXT NOT NULL CHECK (policy_profile_id IN (
    'sandbox-security-balanced.v1', 'sandbox-security-strict.v1')),
  composition_binding TEXT NOT NULL CHECK (composition_binding IN (
    'sandbox-security-production-composition.v1:rule_only',
    'sandbox-security-production-composition.v1:local',
    'sandbox-security-production-composition.v1:local_and_judge')),
  status TEXT NOT NULL CHECK (status IN (
    'in_progress', 'completed', 'interrupted')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (authorization_scope_id, idempotency_key_hmac),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'completed' AND response_json IS NOT NULL
      AND length(response_json) BETWEEN 2 AND 16777216)
    OR
    (status IN ('in_progress', 'interrupted') AND response_json IS NULL)
  )
);

CREATE TABLE sandbox_security_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'evaluation_completed', 'evaluation_replayed',
    'evaluation_interrupted', 'request_rejected',
    'capability_issued', 'capability_revoked',
    'audit_read', 'audit_purged')),
  visibility_subject_id TEXT NOT NULL
    CHECK (length(visibility_subject_id) BETWEEN 1 AND 64),
  authorization_scope_id TEXT,
  capability_id TEXT REFERENCES
    sandbox_security_capabilities(capability_id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  event_json TEXT NOT NULL
    CHECK (length(event_json) BETWEEN 2 AND 65536)
);

CREATE INDEX sandbox_security_idempotency_expiry_idx
  ON sandbox_security_idempotency_records(expires_at);
CREATE INDEX sandbox_security_audit_visibility_order_idx
  ON sandbox_security_audit_events(
    visibility_subject_id, occurred_at DESC, event_id DESC);
CREATE INDEX sandbox_security_audit_retention_idx
  ON sandbox_security_audit_events(occurred_at, event_id);
```

Capability records are not deleted in v1. Grant children cascade only if a
future migration introduces deletion; idempotency and audit references use
`RESTRICT`. `event_json` is deterministic `JSON.stringify` output from one
normalized exact audit union variant in contract key order; no signature or
hash relies on JSON property order. The repository verifies its duplicated
event ID, type, subject visibility, authorization scope, capability ID, and
occurred-at values against the typed columns before insert and after read.
Arbitrary JSON cannot enter the repository port.

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
  capability_id: string;
  subject_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  status: SandboxSecurityIdempotencyStatus;
  response_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}
```

The added correlation fields allow deterministic startup recovery without
reading request content. `response_json` is non-null only for `completed` and
contains only a normalized `SandboxSecurityDecision`. It is normalized again
before replay. The unique key is
`(authorization_scope_id, idempotency_key_hmac)`.

The 16 MiB SQL bound is a corruption/resource guard on serialized safe
Decisions, not an HTTP input limit. A normalized Decision that cannot serialize
within it fails closed before completion and is never returned.

### Idempotency State Machine

After a valid Engine fingerprint exists, one immediate transaction performs:

- expired row: delete it and continue as an absent row;
- absent row: insert `in_progress` and return `claimed`;
- same fingerprint plus `completed`: append a replay audit event and return the
  normalized cached response;
- same fingerprint plus `in_progress`: append an in-progress rejection audit
  and return in-progress conflict;
- same fingerprint plus `interrupted`: update to `in_progress` and return
  `claimed` without changing `created_at` or `expires_at`; or
- different fingerprint in any non-expired state: append a fingerprint-conflict
  rejection audit and return fingerprint conflict.

Engine evaluation runs outside a SQLite transaction. Success completes the row
and appends audit in one transaction before HTTP response. Engine failure marks
the row interrupted and appends interruption audit in one transaction.
Completion-transaction failure makes a best-effort separate interruption
transaction; failure to mark it does not replace the original fixed error.

After migration and integrity checks, one `BEGIN IMMEDIATE` recovery transaction
normalizes every surviving `in_progress` row, changes it to `interrupted`, and
appends one `evaluation_interrupted/startup_recovery` event from its stored
correlation fields. Invalid recovery data rolls back and fails startup. Because
only a claimed request can be in progress and slot acquisition follows claim,
the recovery test includes the claimed-without-slot crash boundary.

The 24-hour expiry is an access boundary: no expired response is ever replayed.
Physical cleanup is mandatory and never extends expiry:

- startup deletes at most 4096 oldest expired rows in one transaction;
- every claim transaction deletes at most 100 oldest expired rows before
  looking up its requested key; and
- an unref'ed hourly maintenance task deletes at most 4096 oldest expired rows.

The maximum admitted public rate is below the hourly batch capacity. Cleanup
health uses this exact process-local state machine:

```ts
type SandboxSecurityIdempotencyMaintenanceState =
  | "healthy"
  | "degraded"
  | "closed";
```

- Startup reaches `healthy` only after its required cleanup commits. Startup
  cleanup failure closes SQLite and prevents listener binding.
- A runtime claim-cleanup or hourly-cleanup failure leaves database rows
  unchanged and changes process state to `degraded`.
- While degraded, every public evaluation, including a possible completed
  replay, fails with 503 before body admission, fingerprinting, or idempotency
  lookup. A known capability receives a best-effort content-free
  `request_rejected/storage_unavailable` event; failure to write that event
  does not replace the 503. Subject-scoped audit read and capability issue or
  revoke remain available; their own repository failures use the fixed 500.
- The next committed hourly cleanup returns the state to `healthy`.
- Internal audit purge always runs one 4096-row idempotency cleanup transaction
  before its audit-retention transaction. A committed pre-cleanup also returns
  state to `healthy`; its failure returns 503 and performs no audit purge.
- Shutdown changes state to `closed`; closed evaluation attempts return the
  same 503 and cannot reopen storage.

The 503 response has `Retry-After: 60`. Existing `/health` and
`/internal/health` remain process/listener-liveness endpoints and keep their
current response contracts; they do not assert sandbox-security evaluation
readiness. No failed fingerprint calculation creates a row.

Capability limiter entries are created only after successful capability lookup,
removed immediately on revoke, and swept every 256 public admissions when the
capability is expired or has been idle for one hour. Because capability TTL is
at most one hour and the deployment-wide bucket admits at most 3600 requests
per hour, the live limiter map remains bounded without evicting an active valid
capability and resetting its burst.

### Startup And Shutdown Order

Production startup validates configuration, opens/migrates/checks/recovers the
database, constructs the selected production Engine, assembles both modules,
and only then binds listeners. Any later startup failure closes an already-bound
listener, cancels the idempotency maintenance task, checkpoints/closes SQLite,
and rethrows.

Shutdown first stops accepting on both listeners, waits for their in-flight
handlers, cancels maintenance, runs `PRAGMA wal_checkpoint(TRUNCATE)`, closes
SQLite, and reports any close failure. SQLite is never closed while an admitted
handler can still use a repository.

## Durable Audit Contract

### Event Types

Audit event IDs match:

```regex
^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

The shared exact-key v1 union is:

```ts
type SandboxSecurityAuditEventType =
  | "evaluation_completed"
  | "evaluation_replayed"
  | "evaluation_interrupted"
  | "request_rejected"
  | "capability_issued"
  | "capability_revoked"
  | "audit_read"
  | "audit_purged";

type SandboxSecurityAuditCategoryCounts = Readonly<
  Record<SandboxSecurityRiskCategory, number>
>;

type SandboxSecurityAuditRunStatusCounts = Readonly<
  Record<SandboxDetectorRunStatus, number>
>;

interface SandboxSecurityAuditEventBase {
  schema_version: "sandbox-security-audit-event.v1";
  event_id: string;
  event_type: SandboxSecurityAuditEventType;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string | null;
  capability_id: string | null;
}

interface SandboxSecurityEvaluationAuditFields {
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  elapsed_ms: number;
}

type SandboxSecurityAuditEvent =
  | (SandboxSecurityAuditEventBase &
      SandboxSecurityEvaluationAuditFields & {
        event_type: "evaluation_completed" | "evaluation_replayed";
        authorization_scope_id: string;
        capability_id: string;
        verdict: SandboxSecurityVerdict;
        action: SandboxSecurityAction;
        risk_level: "info" | SandboxSecuritySeverity;
        category_counts: SandboxSecurityAuditCategoryCounts;
        detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
      })
  | (SandboxSecurityAuditEventBase &
      SandboxSecurityEvaluationAuditFields & {
        event_type: "evaluation_interrupted";
        authorization_scope_id: string;
        capability_id: string;
        interruption_code:
          | "engine_error"
          | "persistence_error"
          | "startup_recovery";
      })
  | (SandboxSecurityAuditEventBase & {
      event_type: "request_rejected";
      authorization_scope_id: string;
      capability_id: string;
      route_id: "evaluation" | "audit_read";
      request_id: string | null;
      stage: SandboxSecurityStage | null;
      policy_profile_id: SandboxSecurityPolicyProfileId | null;
      composition_binding: string;
      elapsed_ms: number;
      rejection_code:
        | "capability_expired"
        | "capability_revoked"
        | "scope_forbidden"
        | "stage_forbidden"
        | "profile_forbidden"
        | "capability_rate_limited"
        | "idempotency_conflict"
        | "idempotency_in_progress"
        | "concurrency_limited"
        | "storage_unavailable"
        | "invalid_request"
        | "body_too_large"
        | "body_timeout"
        | "unsupported_media_type";
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "capability_issued";
      authorization_scope_id: string;
      capability_id: string;
      scopes: SandboxSecurityCapabilityScope[];
      allowed_stages: SandboxSecurityStage[];
      allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
      issued_at: string;
      expires_at: string;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "capability_revoked";
      authorization_scope_id: string;
      capability_id: string;
      revoked_at: string;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "audit_read";
      authorization_scope_id: string;
      capability_id: string;
      returned_count: number;
      next_cursor_present: boolean;
      elapsed_ms: number;
    })
  | (SandboxSecurityAuditEventBase & {
      event_type: "audit_purged";
      subject_id: "system:bootstrap-admin";
      authorization_scope_id: null;
      capability_id: null;
      retention_days: 90;
      deleted_count: number;
      has_more: boolean;
      elapsed_ms: number;
    });
```

Every variant has exactly the keys shown by its intersection and no others.
Count records contain all nine risk-category keys or all six run-status keys in
catalog order, with non-negative safe integers. `elapsed_ms` is an integer from
0 through 60000. Composition binding matches
`^sandbox-security-production-composition\.v1:(rule_only|local|local_and_judge)$`.
All returned arrays and objects are defensive copies.

In evaluation variants, `request_id` means the structurally normalized
`SandboxSecurityRequest.request_id` and equals the returned Decision request ID.
It is not the backend HTTP envelope request ID, which is response-only and is
not persisted in v1. A rejected request has a non-null request ID, stage, and
profile only after shared normalization succeeds; otherwise all three are null.

For `request_rejected` with `route_id: "audit_read"`, request ID, stage, and
profile are always null, and the rejection code is limited to
`capability_expired`, `capability_revoked`, `scope_forbidden`,
`capability_rate_limited`, or `invalid_request`. Evaluation-only codes
(`stage_forbidden`, `profile_forbidden`, both idempotency codes,
`concurrency_limited`, `storage_unavailable`, body admission codes, and
unsupported media type) require `route_id: "evaluation"`.

Completed category counts are derived from normalized accepted Decision
findings, and run-status counts are derived from every normalized Decision
detector run. Replayed counts are recomputed from the normalized cached
Decision. Event elapsed time uses the injected monotonic clock from application
service entry to event projection, floors fractional milliseconds, and does not
include the audit insert itself. Startup recovery uses zero.

Ownership is fixed:

- evaluation events use the evaluated capability's subject, scope, and ID;
- issue/revoke events use the new or target capability's subject, scope, and
  ID;
- audit-read events use the reader's subject, scope, and ID;
- startup-recovery events use correlation stored in the interrupted
  idempotency row; and
- purge events use the fixed internal subject `system:bootstrap-admin` and no
  capability or authorization scope.

The audit table stores `visibility_subject_id` equal to the event subject. The
repository query requires the authenticated reader subject in SQL and validates
it again after normalization. No public query can omit or replace that
predicate.

Known-capability expiry, revocation, authorization denial, per-capability rate
rejection, idempotency rejection, body admission failure, and concurrency
rejection produce content-free `request_rejected` events. Pre-auth global
rate rejections, unknown bearer tokens, and invalid bootstrap administrator
secrets do not create durable events, preventing unauthenticated write
amplification.

Audit reads are themselves recorded after the page has been selected and before
the HTTP response. The new `audit_read` row cannot appear in the page currently
being returned. If that audit write fails, the selected page is not returned.

### Content-Free Projection

A completed or replayed evaluation retains only:

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

Other event variants retain only the exact closed fields defined above. The
projection is separate from the public Decision. The idempotency store may
retain a normalized Decision for 24-hour response replay, but the durable audit
store may not.

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

The first shared RED test imports the already-existing `shared/index.ts`
dynamically and asserts that the new audit normalizer export exists and accepts
an exact fixture. Before implementation, the module loads successfully and the
assertion fails because the export is absent; a module-load error is not the
RED. The first backend RED imports the existing public/internal route matchers
and asserts the five new route matches; it fails by returned value, not import.

Later source modules are introduced only as the minimal GREEN needed by a
failing test against an already-importable boundary. For example, after route
recognition exists, an HTTP test against the existing `AppModule` expects the
new route to return the fixed authentication response rather than fall through;
that behavioral RED authorizes creation and wiring of the minimal sandbox
module/controller boundary. Once a source module exists, all focused unit tests
import it normally and create subsequent RED through behavior. No test catches,
maps, or masks `ERR_MODULE_NOT_FOUND`.

### Test Order

1. Shared exact-key types and normalizers for audit pages/events.
2. Existing public/internal router recognition for all five routes.
3. Simulation authoritative-context builder.
4. Domain-separated HMAC fixed vectors and capability token generation.
5. Capability normalization, issue, expiry, authorization, and revoke.
6. In-memory monotonic rate and concurrency limiters.
7. Idempotency state machine with a fake repository.
8. Audit union, subject visibility, projection, and prohibited-field tests.
9. Real temporary SQLite migrations, repositories, transactions, recovery,
   retention, permissions, and corruption handling.
10. Evaluation service orchestration with fake Engine/fingerprint ports.
11. Public and internal controller tests.
12. Public and internal HTTP integration tests.
13. Repository import/privacy gates and full relevant regressions.

### Required Scenarios

Tests must prove at least:

- authentication occurs before body read;
- evaluate and audit-read scope authorization occurs before their body or query
  admission;
- duplicate security headers, strict bearer grammar, strict UTF-8, media-type
  parameters, transfer encoding, bodyless routes, and 5000 ms body deadline use
  the route admission matrix;
- UTF-8 bodies at exactly 786432 bytes pass body admission and one byte over
  fails before JSON parse;
- real HTTP slow/oversized clients receive the stable 408/413 JSON response and
  `Connection: close` before the server destroys the socket;
- public input always becomes simulation authority and can never request
  enforcement authority;
- capability scope, stage, and profile are all enforced;
- token TTL boundaries and idempotent revocation survive restart;
- omitted capability TTL resolves to 900 seconds and explicit TTL remains
  within 60 through 3600 seconds;
- per-capability/global buckets and four concurrent slots release correctly;
- slow bodies and cached replays never acquire an Engine slot;
- fingerprint is produced by the Engine helper before idempotency claim;
- an independently encoded fixture reproduces every published HMAC/cursor
  vector, including fingerprint `b2dc6d...bb11`;
- invalid fingerprints create no idempotency row;
- same scope/key/fingerprint calls Engine once after completion;
- completed replay writes content-free replay audit before returning;
- in-progress requests do not wait;
- changed fingerprints conflict;
- changed production mode cannot replay an old-mode response;
- startup recovers stale in-progress rows as interrupted;
- expired idempotency responses are never replayed and bounded startup, claim,
  and hourly cleanup physically remove them;
- startup cleanup failure prevents binding, runtime cleanup failure blocks all
  evaluation/replay with 503, committed maintenance clears degradation, and
  liveness health responses remain unchanged;
- Engine and commit failure returns no uncommitted Decision;
- cached Decisions are normalized before replay;
- capability changes and audit, and evaluation completion and audit, are
  atomic;
- audit pagination is bounded, deterministic, and cursor-authenticated;
- audit SQL and post-normalization checks never return a different subject's
  events;
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
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:repo
npm run typecheck:benchmark:sandbox-security
npm run test:frontend
git diff --check
```

The implementation must add mandatory `typecheck:shared` and
`typecheck:backend` scripts using the repository TypeScript compiler and the
existing `shared/tsconfig.json` and `backend/tsconfig.json`. This is a
configuration-only change and cannot conceal or exclude new source files.

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
- Modify `package.json` to run the new shared spec and mandatory shared/backend
  typechecks.

### Backend Production

- Add `backend/src/modules/sandbox-security/sandbox-security.module.ts`.
- Add `backend/src/modules/sandbox-security/sandbox-security.config.ts`.
- Add `backend/src/modules/sandbox-security/sandbox-security.types.ts`.
- Add `backend/src/modules/sandbox-security/sandbox-security.controller.ts`.
- Add `backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts`.
- Add `backend/src/modules/sandbox-security/http-admission.ts`.
- Add `backend/src/modules/sandbox-security/dto/capability.ts`.
- Add `backend/src/modules/sandbox-security/simulation-authority.ts`.
- Add `backend/src/modules/sandbox-security/capability-authorizer.ts`.
- Add `backend/src/modules/sandbox-security/token-bucket.ts`.
- Add `backend/src/modules/sandbox-security/engine-concurrency.ts`.
- Add `backend/src/modules/sandbox-security/hmac.ts`.
- Add `backend/src/modules/sandbox-security/audit-projector.ts`.
- Add `backend/src/modules/sandbox-security/capability.service.ts`.
- Add `backend/src/modules/sandbox-security/evaluation.service.ts`.
- Add `backend/src/modules/sandbox-security/audit.service.ts`.
- Add `backend/src/modules/sandbox-security/ports/capability.repository.ts`.
- Add `backend/src/modules/sandbox-security/ports/idempotency.repository.ts`.
- Add `backend/src/modules/sandbox-security/ports/audit.repository.ts`.
- Add `backend/src/modules/sandbox-security/ports/evaluation.gateway.ts`.
- Add `backend/src/modules/sandbox-security/ports/runtime.ts`.
- Add `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-database.ts`.
- Add `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts`.
- Add `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts`.
- Add `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-idempotency.repository.ts`.
- Add `backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts`.
- Add the GENERAL-001 fingerprint/GENERAL-002 production adapter at
  `backend/src/modules/sandbox-security/adapters/production-evaluation.gateway.ts`.
- Modify `backend/src/common/http/router.ts`.
- Modify `backend/src/common/http/internal-router.ts`.
- Modify `backend/src/app.module.ts`.
- Modify `backend/src/internal-app.module.ts`.
- Modify `backend/src/runtime-dependencies.ts` as required by composition.
- Modify `backend/src/main.ts` for validated asynchronous production startup
  and database closure.

### Tests

- Add `backend/tests/sandbox-security-routes.spec.ts`.
- Add `backend/tests/sandbox-security-simulation-authority.spec.ts`.
- Add `backend/tests/sandbox-security-hmac.spec.ts`.
- Add `backend/tests/sandbox-security-capability.spec.ts`.
- Add `backend/tests/sandbox-security-limits.spec.ts`.
- Add `backend/tests/sandbox-security-idempotency.spec.ts`.
- Add `backend/tests/sandbox-security-audit.spec.ts`.
- Add `backend/tests/sandbox-security-sqlite.spec.ts`.
- Add `backend/tests/sandbox-security-evaluation.service.spec.ts`.
- Add `backend/tests/sandbox-security-controller.spec.ts`.
- Add `backend/tests/sandbox-security-admin.controller.spec.ts`.
- Add `tests/integration/backend-sandbox-security.api.spec.ts`.
- Add `tests/repository/sandbox-security-backend-spec.spec.ts`.
- Modify `package.json` backend/repository scripts to include every new spec.

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
