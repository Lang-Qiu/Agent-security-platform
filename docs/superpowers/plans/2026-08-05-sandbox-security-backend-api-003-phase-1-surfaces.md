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
- [ ] Confirm the Master status is `PLAN_REVIEWED_PENDING_USER_APPROVAL` and
  that the user has explicitly approved execution.
- [ ] Run the baseline:

```bash
npm run test:shared
npm run test:backend
npm run test:repo
git diff --check
```

Expected: record current counts and any unrelated failure before P1-T0.

## Locked Backend Contract Ledger

P1-T3 creates these type-only contracts exactly once. Every later Phase imports
and implements these names; it must not invent a second runtime, repository,
maintenance, service dependency, limiter-registry, or module-dependency shape.
The `type`/`interface` declarations, both error classes, the Engine runtime
projection, and the service-error factory/type guard compile in P1-T3. All
other function signatures in this ledger are normative future factory
contracts emitted only by their named owning task; they are not ambient stub
exports. The Engine runtime alias belongs in `ports/runtime.ts`, while the
`DatabaseSync` type import belongs only in `ports/sqlite-database.ts`.

```ts
import type {
  SandboxSecurityRuntimePorts as SandboxSecurityEngineRuntimePorts
} from "../../../../../engines/sandbox/src/security/index.ts";
import type { DatabaseSync } from "node:sqlite";

export interface SandboxSecurityRuntimePort {
  now(): string;
  monotonicNowMs(): number;
  randomBytes(length: number): Uint8Array;
  nextCapabilityId(): string;
  nextAuditEventId(): string;
  nextDecisionId(): string;
  scheduleTimeout(delayMs: number, callback: () => void): () => void;
  scheduleInterval(
    delayMs: number,
    callback: () => void
  ): Readonly<{ unref(): void; cancel(): void }>;
}

export function toSandboxSecurityEngineRuntime(
  runtime: SandboxSecurityRuntimePort
): SandboxSecurityEngineRuntimePorts;

export type SandboxSecurityProductionMode =
  | "rule_only"
  | "local"
  | "local_and_judge";

export type SandboxSecurityCapabilityScope =
  | "sandbox_security:evaluate"
  | "sandbox_security:audit:read";

export interface SandboxSecurityAuditCursorFields {
  subject_id: string;
  authorization_scope_id: string;
  occurred_at: string;
  event_id: string;
}

export interface SandboxSecurityAuditPurgeResult {
  schema_version: "sandbox-security-audit-purge-result.v1";
  retention_days: 90;
  deleted_count: number;
  has_more: boolean;
}

export interface SandboxSecurityHmacService {
  deploymentKeyId(): string;
  authorizationScopeId(
    scopeSeed: Uint8Array,
    productionMode: SandboxSecurityProductionMode
  ): string;
  idempotencyKeyHmac(idempotencyKey: string): `idem-key:hmac-sha256:${string}`;
  fingerprintCanonicalBytes(
    canonicalBytes: Uint8Array
  ): `hmac-sha256:${string}`;
  encodeAuditCursor(input: Readonly<SandboxSecurityAuditCursorFields>): string;
  decodeAuditCursor(
    cursor: string,
    expected: Readonly<{
      subject_id: string;
      authorization_scope_id: string;
    }>
  ): Readonly<SandboxSecurityAuditCursorFields> | null;
}

export interface SandboxSecurityCapabilityAuditIdentity {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export type SandboxSecurityCapabilityAuthenticationResult =
  | Readonly<{
      kind: "authorized";
      capability: SandboxSecurityAuthorizedCapability;
    }>
  | Readonly<{
      kind: "known_denied";
      rejection_code: "capability_expired" | "capability_revoked";
      audit_identity: SandboxSecurityCapabilityAuditIdentity;
    }>
  | Readonly<{ kind: "unknown" }>;

export interface SandboxSecurityCapabilityAuthenticator {
  authenticateToken(token: string): SandboxSecurityCapabilityAuthenticationResult;
  requireScope(
    capability: SandboxSecurityAuthorizedCapability,
    scope: SandboxSecurityCapabilityScope
  ): void;
  requireEvaluationGrant(
    capability: SandboxSecurityAuthorizedCapability,
    submission: SandboxSecurityRequest
  ): void;
  authenticateAdministrator(token: string): void;
}

export type SandboxSecurityLimitResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retry_after_seconds: number }>;

export interface SandboxSecurityTokenBucket {
  consume(monotonicNowMs: number): SandboxSecurityLimitResult;
}

export interface SandboxSecurityEngineConcurrencyLimiter {
  tryAcquire(): (() => void) | null;
  activeCount(): number;
}

export interface SqliteSandboxSecurityDatabase {
  transaction<T>(operation: (database: DatabaseSync) => T): T;
  read<T>(operation: (database: DatabaseSync) => T): T;
  checkpointAndClose(): void;
  readonly state: "open" | "closed";
}

export interface SandboxSecurityCapabilityLimiterRegistry {
  consume(
    capability: Readonly<SandboxSecurityAuthorizedCapability>
  ): SandboxSecurityLimitResult;
  remove(capabilityId: string): void;
  size(): number;
}

export function createSandboxSecurityCapabilityLimiterRegistry(input: Readonly<{
  runtime: SandboxSecurityRuntimePort;
  capacity: 3;
  refill_tokens_per_second: 0.2;
  sweep_every_admissions: 256;
  idle_expiry_ms: 3600000;
}>): SandboxSecurityCapabilityLimiterRegistry;
```

`toSandboxSecurityEngineRuntime` must return a fresh ordinary frozen object with
exactly four own enumerable data keys in Engine order: `now`,
`nextDecisionId`, `monotonicNowMs`, and `scheduleTimeout`. It must never pass the
extended backend runtime object directly to GENERAL-002, whose composition
validates exact keys.

The idempotency domain types are exact, not open bags of correlation data:

```ts
export interface SandboxSecurityIdempotencyRecord {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  capability_id: string;
  subject_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  status: "in_progress" | "completed" | "interrupted";
  response_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface SandboxSecurityIdempotencyClaim {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  capability_id: string;
  subject_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  now: string;
  expires_at: string;
  in_progress_event: Readonly<SandboxSecurityAuditEvent>;
  fingerprint_conflict_event: Readonly<SandboxSecurityAuditEvent>;
  create_replayed_event(
    decision: Readonly<SandboxSecurityDecision>
  ): Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyCompletion {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  decision: Readonly<SandboxSecurityDecision>;
  completed_event: Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyInterruption {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  interrupted_event: Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyConcurrencyRejection {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  rejection_event: Readonly<SandboxSecurityAuditEvent>;
}

export type SandboxSecurityIdempotencyClaimResult =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "completed"; response: SandboxSecurityDecision }>
  | Readonly<{ kind: "in_progress" }>
  | Readonly<{ kind: "fingerprint_conflict" }>;

export interface SandboxSecurityCapabilityPersistenceRecord {
  capability_id: string;
  subject_id: string;
  token_digest: `sha256:${string}`;
  scope_seed: Uint8Array;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SandboxSecurityCapabilityIssueRequest {
  schema_version: "sandbox-security-capability-issue-request.v1";
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  ttl_seconds?: number;
}

export interface SandboxSecurityNormalizedCapabilityIssueRequest
  extends Omit<SandboxSecurityCapabilityIssueRequest, "ttl_seconds"> {
  ttl_seconds: number;
}

export interface SandboxSecurityCapabilityIssueResult {
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

export interface SandboxSecurityCapabilityPublicRecord {
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

export interface SandboxSecurityAuthorizedCapability {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export class SandboxSecurityClaimCleanupError extends Error {
  readonly code = "SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED" as const;

  constructor() {
    super("SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED");
    this.name = "SandboxSecurityClaimCleanupError";
  }
}

export type SandboxSecurityServiceErrorDescriptor =
  | Readonly<{ code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED" }>
  | Readonly<{
      code: "SANDBOX_SECURITY_FORBIDDEN";
      audit_rejection_code:
        | "scope_forbidden"
        | "stage_forbidden"
        | "profile_forbidden";
    }>
  | Readonly<{ code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND" }>
  | Readonly<{
      code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID";
      audit_rejection_code: "invalid_request";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT";
      audit_rejection_code: "idempotency_conflict";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS";
      audit_rejection_code: "idempotency_in_progress";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_CONCURRENCY_LIMITED";
      audit_rejection_code: "concurrency_limited";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE";
      audit_rejection_code: "storage_unavailable";
    }>
  | Readonly<{ code: "SANDBOX_SECURITY_INTERNAL_ERROR" }>;

export class SandboxSecurityServiceError extends Error {
  readonly code: SandboxSecurityServiceErrorDescriptor["code"];
  readonly audit_rejection_code: SandboxSecurityAuditRejectionCode | null;
  readonly retry_after_seconds: 1 | 60 | null;

  constructor(descriptor: SandboxSecurityServiceErrorDescriptor) {
    super(descriptor.code);
    this.name = "SandboxSecurityServiceError";
    this.code = descriptor.code;
    this.audit_rejection_code =
      "audit_rejection_code" in descriptor
        ? descriptor.audit_rejection_code
        : null;
    this.retry_after_seconds =
      descriptor.code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"
        ? 60
        : descriptor.code === "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS" ||
            descriptor.code === "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
          ? 1
          : null;
  }
}

export function createSandboxSecurityServiceError(
  descriptor: SandboxSecurityServiceErrorDescriptor
): SandboxSecurityServiceError;

export function isSandboxSecurityServiceError(
  error: unknown
): error is SandboxSecurityServiceError;

export interface SandboxSecurityIdempotencyRepository {
  claim(input: Readonly<SandboxSecurityIdempotencyClaim>): SandboxSecurityIdempotencyClaimResult;
  complete(input: Readonly<SandboxSecurityIdempotencyCompletion>): void;
  interrupt(input: Readonly<SandboxSecurityIdempotencyInterruption>): void;
  rejectConcurrency(
    input: Readonly<SandboxSecurityIdempotencyConcurrencyRejection>
  ): void;
  recoverInProgress(input: Readonly<{
    now: string;
    create_event(
      record: Readonly<SandboxSecurityIdempotencyRecord>
    ): Readonly<SandboxSecurityAuditEvent>;
  }>): number;
  cleanupExpired(now: string, limit: 100 | 4096): number;
}

export interface SandboxSecurityCapabilityRepository {
  issueWithAudit(
    record: Readonly<SandboxSecurityCapabilityPersistenceRecord>,
    event: Readonly<SandboxSecurityAuditEvent>
  ): void;
  findByTokenDigest(
    tokenDigest: `sha256:${string}`
  ): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null;
  revokeWithAudit(input: Readonly<{
    capability_id: string;
    revoked_at: string;
    create_event(
      record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
    ): Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null;
}

export interface SandboxSecurityAuditRepository {
  append(event: Readonly<SandboxSecurityAuditEvent>): void;
  listAndRecordRead(input: Readonly<{
    visibility_subject_id: string;
    after: Readonly<{ occurred_at: string; event_id: string }> | null;
    limit: number;
    create_event(result: Readonly<{
      returned_count: number;
      next_cursor_present: boolean;
    }>): Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<{
    events: SandboxSecurityAuditEvent[];
    has_more: boolean;
  }>;
  purgeExpiredWithAudit(input: Readonly<{
    cutoff: string;
    limit: 1000;
    create_event(
      deletedCount: number,
      hasMore: boolean
    ): Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<{ deleted_count: number; has_more: boolean }>;
}
```

The repository normalizes every supplied audit event to the exact union and
checks its variant against the transition before opening the transaction.
`in_progress_event` and `fingerprint_conflict_event` are inserted only for their
matching outcomes; `create_replayed_event` is invoked only after cached Decision
normalization succeeds.

`claim()` may throw `SandboxSecurityClaimCleanupError` only when its mandatory
100-row delete rolls back; all other storage/invariant failures use the fixed
internal error. Maintenance catches only that tagged class to enter
`degraded`, then maps it to storage-unavailable. It does not classify errors by
message text.

The three adapter factories and maintenance factory are:

```ts
export function createSqliteSandboxSecurityCapabilityRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityCapabilityRepository;

export function createSqliteSandboxSecurityIdempotencyRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityIdempotencyRepository;

export function createSqliteSandboxSecurityAuditRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityAuditRepository;

export interface SandboxSecurityIdempotencyMaintenance {
  state(): "healthy" | "degraded" | "closed";
  assertEvaluationAvailable(): void;
  claim(
    input: Readonly<SandboxSecurityIdempotencyClaim>
  ): SandboxSecurityIdempotencyClaimResult;
  runHourlyCleanup(): void;
  runPurgePreCleanup(): void;
  close(): void;
}

export function createSandboxSecurityIdempotencyMaintenance(input: Readonly<{
  repository: SandboxSecurityIdempotencyRepository;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityIdempotencyMaintenance;
```

The SQLite idempotency repository owns the 100-row cleanup inside the same
`BEGIN IMMEDIATE` claim transaction and exposes a distinct tagged
claim-cleanup failure. Maintenance wraps `claim`, transitions that failure to
`degraded`, owns startup recovery plus the 4096-row startup cleanup, and owns
exactly one hourly interval handle. It calls `unref()` once, cancels it once,
and never closes SQLite. Only `SandboxSecurityModule.close()` cancels
maintenance before checkpointing and closing the single database owner.

Application construction uses this one projector and these exact factories:

```ts
export interface SandboxSecurityEvaluationAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  composition_binding: string;
  elapsed_ms: number;
  decision: Readonly<SandboxSecurityDecision>;
}

export interface SandboxSecurityInterruptionAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  elapsed_ms: number;
  interruption_code: "engine_error" | "persistence_error" | "startup_recovery";
}

export type SandboxSecurityAuditRejectionCode =
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

export interface SandboxSecurityRejectionAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  route_id: "evaluation" | "audit_read";
  request_id: string | null;
  stage: SandboxSecurityStage | null;
  policy_profile_id: SandboxSecurityPolicyProfileId | null;
  composition_binding: string;
  elapsed_ms: number;
  rejection_code: SandboxSecurityAuditRejectionCode;
}

export interface SandboxSecurityCapabilityIssuedAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export interface SandboxSecurityCapabilityRevokedAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  revoked_at: string;
}

export interface SandboxSecurityAuditReadAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  returned_count: number;
  next_cursor_present: boolean;
  elapsed_ms: number;
}

export interface SandboxSecurityAuditPurgeAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: "system:bootstrap-admin";
  retention_days: 90;
  deleted_count: number;
  has_more: boolean;
  elapsed_ms: number;
}

export interface SandboxSecurityEvaluationGateway {
  readonly composition_binding: string;
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>
  ): string;
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    signal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}

export interface SandboxSecurityCapabilityService {
  issue(
    request: Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>
  ): Readonly<SandboxSecurityCapabilityIssueResult>;
  revoke(
    capabilityId: string
  ): Readonly<SandboxSecurityCapabilityPublicRecord>;
}

export interface SandboxSecurityAuditService {
  list(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    cursor?: string;
    limit: number;
  }>): Readonly<SandboxSecurityAuditPage>;
  purgeExpired(): Readonly<SandboxSecurityAuditPurgeResult>;
}

export interface SandboxSecurityEvaluationService {
  evaluate(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    idempotency_key: string;
    submission: SandboxSecurityRequest;
    signal?: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityDecision>>;
}

export interface SandboxSecurityAuditProjector {
  evaluationCompleted(input: Readonly<SandboxSecurityEvaluationAuditInput>): SandboxSecurityAuditEvent;
  evaluationReplayed(input: Readonly<SandboxSecurityEvaluationAuditInput>): SandboxSecurityAuditEvent;
  evaluationInterrupted(input: Readonly<SandboxSecurityInterruptionAuditInput>): SandboxSecurityAuditEvent;
  requestRejected(input: Readonly<SandboxSecurityRejectionAuditInput>): SandboxSecurityAuditEvent;
  capabilityIssued(input: Readonly<SandboxSecurityCapabilityIssuedAuditInput>): SandboxSecurityAuditEvent;
  capabilityRevoked(input: Readonly<SandboxSecurityCapabilityRevokedAuditInput>): SandboxSecurityAuditEvent;
  auditRead(input: Readonly<SandboxSecurityAuditReadAuditInput>): SandboxSecurityAuditEvent;
  auditPurged(input: Readonly<SandboxSecurityAuditPurgeAuditInput>): SandboxSecurityAuditEvent;
}

export function createSandboxSecurityCapabilityService(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
}>): SandboxSecurityCapabilityService;

export function createSandboxSecurityAuditService(input: Readonly<{
  repository: SandboxSecurityAuditRepository;
  hmac: SandboxSecurityHmacService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityAuditService;

export function createSandboxSecurityEvaluationService(input: Readonly<{
  authorizer: SandboxSecurityCapabilityAuthenticator;
  hmac: SandboxSecurityHmacService;
  idempotency_repository: SandboxSecurityIdempotencyRepository;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  concurrency: SandboxSecurityEngineConcurrencyLimiter;
  gateway: SandboxSecurityEvaluationGateway;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityEvaluationService;

export interface SandboxSecurityModuleDependencies {
  database: SqliteSandboxSecurityDatabase;
  composition_binding: string;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  authenticator: SandboxSecurityCapabilityAuthenticator;
  evaluation_service: SandboxSecurityEvaluationService;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  audit_repository: SandboxSecurityAuditRepository;
  audit_projector: SandboxSecurityAuditProjector;
  global_bucket: SandboxSecurityTokenBucket;
  administrator_bucket: SandboxSecurityTokenBucket;
  capability_limiters: SandboxSecurityCapabilityLimiterRegistry;
  runtime: SandboxSecurityRuntimePort;
}
```

All referenced record, input, result, and error unions are defined with their
exact specification fields in `sandbox-security.types.ts` and the Phase 1 port
files. Service/controller tests instantiate these interfaces structurally, so
later factories cannot silently add dependencies. Repositories share the one
injected database and never close it; services never access `DatabaseSync`;
only maintenance schedules a repeating timer.

## P1-T0: Permanent Requirement And Status Gate

**Files:**

- Create: `tests/repository/sandbox-security-backend-spec.spec.ts`
- Modify: `package.json`
- Modify: `docs/sprint-current.md`

This repository-workflow gate is a configuration/test exception to business
TDD. It introduces no production behavior.

- [ ] **Step 1: Write the gate and obtain a registration RED**

The test reads `docs/sprint-current.md` and `package.json`, asserts requirement
identity and the canonical specification path, and asserts its own path is in
`test:repo`. Its exact legal status set is:

```ts
const LEGAL_GENERAL_003_STATUSES = new Set([
  "PLAN_FIXED_PENDING_REVIEW",
  "PLAN_REVIEWED_PENDING_USER_APPROVAL",
  "IMPLEMENTATION_IN_PROGRESS",
  "IMPLEMENTED_PENDING_GLOBAL_P6_GATE"
]);
```

It also requires the dependency text to retain
`PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`, reject any statement that
GENERAL-002 or GENERAL-003 is `VERIFIED`, and reject a final GENERAL-003 status
other than `IMPLEMENTED_PENDING_GLOBAL_P6_GATE` while that dependency is open.
Do not assert one mutable `Current Work` sentence.

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-backend-spec.spec.ts
```

Expected: FAIL only because the newly written gate is not yet registered in
`test:repo`; requirement and dependency assertions already pass.

- [ ] **Step 2: Register the gate, enter implementation state, and run GREEN**

Append the exact path to `test:repo`, preserve all existing entries, and change
the sprint status to `IMPLEMENTATION_IN_PROGRESS` only after the user has
approved the independently reviewed plan.

```bash
npm run test:repo
git diff --check
```

- [ ] **Step 3: Review, update progress, commit, and stop**

```bash
git add tests/repository/sandbox-security-backend-spec.spec.ts package.json \
  docs/sprint-current.md docs/progress.md
git commit -m "test(sandbox): gate GENERAL-003 requirement state"
```

Stop after P1-T0 for task review. P1-T1 starts only in a later task turn.

## P1-T1: Exact Shared Audit Event and Page Contract

**Files:**

- Create: `shared/types/sandbox-security-api.ts`
- Create: `shared/contracts/sandbox-security-api.ts`
- Create: `shared/tests/sandbox-security-api-contract.spec.ts`
- Modify: `shared/index.ts`
- Modify: `docs/api-contract.md`
- Modify: `package.json`

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

Append `shared/tests/sandbox-security-api-contract.spec.ts` to `test:shared` in
this same step, preserving every existing path and flag.

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

- [ ] **Step 6: Synchronize the durable API contract**

Document the exact eight-event union, page envelope, field catalogs,
nullability, bounds, ordering, and strict-normalization behavior in
`docs/api-contract.md`. Link to the canonical specification for the full field
matrix rather than creating a second divergent contract.

- [ ] **Step 7: Run the registered gate, review, update progress, and commit**

```bash
npm run test:shared
```

```bash
git add shared/types/sandbox-security-api.ts \
  shared/contracts/sandbox-security-api.ts \
  shared/tests/sandbox-security-api-contract.spec.ts \
  shared/index.ts package.json docs/api-contract.md docs/progress.md
git commit -m "feat(shared): add sandbox security audit API contract"
```

Review must verify no content-bearing field, Engine-private type, capability
secret, cursor codec, or backend persistence type escaped into `shared/`.

## P1-T2: Five Exact Public and Internal Route Matches

**Files:**

- Create: `backend/tests/sandbox-security-routes.spec.ts`
- Modify: `backend/src/common/http/router.ts`
- Modify: `backend/src/common/http/internal-router.ts`
- Modify: `package.json`

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
      params: { rawCapabilityIdSegment: "capability%3A123" }
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

Add wrong-method, missing/empty path slot, extra/trailing segment,
public/internal cross-listener, and existing route regression cases. This route
task tests shape matching only; malformed percent encoding and encoded
slash/backslash/NUL are controller-admission cases owned by P5-T3.

Append `backend/tests/sandbox-security-routes.spec.ts` to `test:backend` in this
same step.

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

For the new revoke branch, return the one path slot unchanged as
`params.rawCapabilityIdSegment`; do not call the existing
`decodeRouteSegment`. That helper remains unchanged for existing campaign
routes only. The router must not decode, validate, or reject percent-encoded
content because administrator authentication and bodyless admission have not
run yet. Do not add authentication, service calls, or a public capability
route.

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
  backend/tests/sandbox-security-routes.spec.ts package.json docs/progress.md
git commit -m "feat(backend): recognize sandbox security API routes"
```

## P1-T3: Injectable Sandbox Module Dispatch Boundary

**Files:**

- Create: `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- Create: `backend/src/modules/sandbox-security/sandbox-security.types.ts`
- Create: `backend/src/modules/sandbox-security/sandbox-security.errors.ts`
- Create: `backend/src/modules/sandbox-security/ports/runtime.ts`
- Create: `backend/src/modules/sandbox-security/ports/evaluation.gateway.ts`
- Create: `backend/src/modules/sandbox-security/ports/capability.repository.ts`
- Create: `backend/src/modules/sandbox-security/ports/idempotency.repository.ts`
- Create: `backend/src/modules/sandbox-security/ports/audit.repository.ts`
- Create: `backend/src/modules/sandbox-security/ports/sqlite-database.ts`
- Create: `backend/tests/sandbox-security-controller.spec.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/internal-app.module.ts`
- Modify: `docs/architecture.md`
- Modify: `package.json`

- [ ] **Step 1: Write behavioral dispatch RED against existing App modules**

```ts
test("REQ-SBX-GENERAL-003 AppModule dispatches evaluation to an injected sandbox module", async () => {
  const calls: string[] = [];
  const sandboxModule = makeStructuralSandboxModule({
    evaluate: async () => {
      calls.push("evaluate");
      return fixedSuccessResponse();
    }
  });
  const response = await invokeAppModule(
    new AppModule(createRuntimeDependencies(), sandboxModule),
    "POST",
    "/api/sandbox/security/evaluations"
  );
  assert.deepEqual(calls, ["evaluate"]);
  assert.equal(response.statusCode, 200);
});
```

Add equivalent audit-read, issue, revoke, and purge dispatch tests. The revoke
case asserts `capability%3A123` reaches the injected controller unchanged as its
raw segment. Assert existing health, tasks, supervision, and campaign routes
still dispatch. The test defines the injected object structurally and imports
no new source path.
Append `backend/tests/sandbox-security-controller.spec.ts` to `test:backend` in
this same step.

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
    rawCapabilityIdSegment: string,
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

Implement every type-only signature in the **Locked Backend Contract Ledger**,
including the exact runtime projection. Add a focused failing assertion for the
missing `toSandboxSecurityEngineRuntime` and tagged claim-cleanup error exports
plus the closed service-error factory/type guard before implementing them. Then
assert the projection's four exact own
enumerable keys, that extra backend runtime keys never cross the Engine
boundary, the claim error's fixed internal tag, every service descriptor's
derived rejection/retry metadata, rejection of unknown/mismatched descriptor
keys, and type-guard behavior. No repository or service implementation is
created in this task.

Controller contracts return `HttpResponse` only for successful operations.
Phase 5 failures throw `SandboxSecurityHttpError` after any required
content-free audit; App modules own the single error-to-response mapping path.

- [ ] **Step 4: Dispatch through the injected module**

`AppModule` accepts an optional second `SandboxSecurityModule` argument and
routes the two public names only when it is present; `InternalAppModule` accepts
the same module in its constructor input and routes the three internal names.
For revoke dispatch it passes `route.params.rawCapabilityIdSegment` unchanged;
the App module never calls `decodeURIComponent` for this route.
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

Before review, document the module/controller/service/port/adapter ownership,
single database owner, maintenance timer owner, and exact Engine runtime
projection in `docs/architecture.md`, then run the registered backend gate.

```bash
npm run test:backend
```

```bash
git add backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/src/modules/sandbox-security/sandbox-security.types.ts \
  backend/src/modules/sandbox-security/sandbox-security.errors.ts \
  backend/src/modules/sandbox-security/ports/runtime.ts \
  backend/src/modules/sandbox-security/ports/evaluation.gateway.ts \
  backend/src/modules/sandbox-security/ports/capability.repository.ts \
  backend/src/modules/sandbox-security/ports/idempotency.repository.ts \
  backend/src/modules/sandbox-security/ports/audit.repository.ts \
  backend/src/modules/sandbox-security/ports/sqlite-database.ts \
  backend/src/app.module.ts backend/src/internal-app.module.ts \
  backend/tests/sandbox-security-controller.spec.ts package.json \
  docs/architecture.md docs/progress.md
git commit -m "feat(backend): add sandbox security module boundary"
```

## P1-T4: Mandatory Typecheck Script Registration

**Files:**

- Modify: `package.json`

This is a configuration-only TDD exception. It introduces no business logic.

- [ ] **Step 1: Add exact typecheck scripts**

```json
{
  "typecheck:shared": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p shared/tsconfig.json",
  "typecheck:backend": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json"
}
```

Do not register tests here: P1-T0 through P1-T3 already registered every test in
the task that created it. Preserve every existing script entry and command flag.

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
