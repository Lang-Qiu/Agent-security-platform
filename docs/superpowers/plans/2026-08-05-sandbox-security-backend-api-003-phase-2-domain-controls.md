# Phase 2 Domain Security Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Implement simulation-only authority construction, exact HMAC/token
primitives, capability grant rules, and deterministic in-memory admission
controls behind the Phase 1 module boundary.

**Architecture:** Pure domain helpers depend on injected clock/random ports and
backend-local types. Cryptographic framing is centralized in one service.
Capability normalization and authentication remain separate from HTTP header
parsing. Limiters use a monotonic clock and contain no persistence or Engine
logic.

**Tech Stack:** Node `crypto`, TypeScript ESM, `node:test`, GENERAL-001 public
Engine types, shared request normalizers.

---

## Entry Gate

- [ ] Confirm all Phase 1 commits and reviews are complete.
- [ ] Run:

```bash
npm run test:shared
npm run typecheck:shared
npm run test:backend
npm run typecheck:backend
git diff --check
```

## P2-T1: Simulation-Only Authoritative Context Builder

**Files:**

- Create: `backend/src/modules/sandbox-security/simulation-authority.ts`
- Create: `backend/tests/sandbox-security-simulation-authority.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write RED through the existing module boundary**

```ts
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

test("REQ-SBX-GENERAL-003 builds simulation authority from normalized public input", () => {
  assert.equal(
    typeof boundary.createSandboxSecuritySimulationEvaluationRequest,
    "function"
  );
  const result = boundary.createSandboxSecuritySimulationEvaluationRequest!(
    makeNormalizedToolSubmission()
  );
  assert.equal(result.authoritative_context.evaluation_mode, "simulation");
  assert.deepEqual(
    result.authoritative_context.sources.map((source) => source.authority_kind),
    ["simulation_observation"]
  );
  assert.equal(
    result.authoritative_context.tool_request?.authority_kind,
    "simulation_observation"
  );
});
```

Add exact content-order, JSON defensive-copy, optional tool, stage/profile
mirroring, public/authority equality, mutation-after-return, and absence of
`platform_control`/`integration_observation` cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-simulation-authority.spec.ts
```

Expected: FAIL at the `typeof` assertion while the existing module loads.

- [ ] **Step 3: Implement and export the exact builder**

```ts
export function createSandboxSecuritySimulationEvaluationRequest(
  submission: Readonly<SandboxSecurityRequest>
): Readonly<SandboxSecurityEvaluationRequest> {
  return {
    submission: cloneSandboxSecurityRequest(submission),
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: submission.stage,
      policy_profile_id: submission.policy_profile_id,
      sources: submission.content_items.map((item) => ({
        source_id: item.source_id,
        authority_kind: "simulation_observation",
        source_type: item.claimed_source_type,
        media_type: item.media_type,
        value: cloneJsonOrText(item.value),
        provenance_ref: item.provenance_ref
      })),
      ...(submission.tool_request
        ? {
            tool_request: {
              authority_kind: "simulation_observation",
              call_id: submission.tool_request.call_id,
              tool_name: submission.tool_request.tool_name,
              arguments: cloneJson(submission.tool_request.arguments),
              ...(submission.tool_request.target === undefined
                ? {}
                : { target: submission.tool_request.target })
            }
          }
        : {})
    }
  };
}
```

The helper accepts only an already normalized shared request. Re-export the
function from `sandbox-security.module.ts`; do not export Engine-private brands
or accept an evaluation mode argument.

- [ ] **Step 4: Run GREEN and Engine authority regression**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-simulation-authority.spec.ts \
  engines/sandbox/tests/sandbox-security-authority.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/simulation-authority.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-simulation-authority.spec.ts docs/progress.md
git commit -m "feat(backend): build sandbox simulation authority"
```

## P2-T2: Domain-Separated HMACs, Cursor Codec, and Opaque Tokens

**Files:**

- Create: `backend/src/modules/sandbox-security/hmac.ts`
- Create: `backend/tests/sandbox-security-hmac.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write independent fixed-vector RED tests**

```ts
test("REQ-SBX-GENERAL-003 reproduces all independent HMAC vectors", () => {
  assert.equal(typeof boundary.createSandboxSecurityHmacService, "function");
  const service = boundary.createSandboxSecurityHmacService!(
    Uint8Array.from({ length: 32 }, (_, index) => index)
  );
  assert.equal(
    service.deploymentKeyId(),
    "deployment-key:hmac-sha256:77a1daccca40976ee878c11f4997d2fc892beb7dfce0c784fb220f597643c707"
  );
  assert.equal(
    service.authorizationScopeId(
      Uint8Array.from({ length: 32 }, (_, index) => index + 32),
      "rule_only"
    ),
    "authscope:hmac-sha256:35fab58ba1030b8017c1c5e4a1d9e417a40790dcbdae2dfd29cfe8dfcd4c5576"
  );
  assert.equal(
    service.idempotencyKeyHmac("0123456789abcdef"),
    "idem-key:hmac-sha256:5fa0e143c2b27daf6febb5965f3504ec65ea47388a12bca468ce8f3bc0971fab"
  );
  assert.equal(
    service.fingerprintCanonicalBytes(Buffer.from('{"a":1}', "ascii")),
    "hmac-sha256:b2dc6da1345ba6630fdd7aaf1ef1082724b6d1a481ba03016a28286c750dbb11"
  );
});
```

Independently encode the published cursor fixture inside the test instead of
calling production framing helpers. Add wrong key, tampered MAC, padded/non-
canonical base64url, wrong field count, trailing byte, non-ASCII, overlength,
wrong subject/scope, invalid timestamp/event ID, key mutation, token grammar,
and digest-only cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-hmac.spec.ts
```

Expected: FAIL because the existing module lacks the HMAC factory export.

- [ ] **Step 3: Implement the closed service**

```ts
export interface SandboxSecurityHmacService {
  deploymentKeyId(): string;
  authorizationScopeId(
    scopeSeed: Uint8Array,
    productionMode: SandboxSecurityProductionMode
  ): string;
  idempotencyKeyHmac(idempotencyKey: string): string;
  fingerprintCanonicalBytes(canonicalBytes: Uint8Array): string;
  encodeAuditCursor(input: Readonly<SandboxSecurityAuditCursorFields>): string;
  decodeAuditCursor(
    cursor: string,
    expected: Readonly<{
      subject_id: string;
      authorization_scope_id: string;
    }>
  ): Readonly<SandboxSecurityAuditCursorFields> | null;
}

export function createSandboxSecurityHmacService(
  deploymentKey: Uint8Array
): SandboxSecurityHmacService;

export function createSandboxSecurityOpaqueCapability(input: Readonly<{
  random_bytes: (length: number) => Uint8Array;
}>): Readonly<{ bearer_token: string; token_digest: `sha256:${string}` }>;
```

Implement `HMAC_FRAME` exactly once with ASCII checks and big-endian lengths.
Copy key and input bytes on entry, retain no canonical-byte reference, use
`timingSafeEqual` for cursor MAC, and store/return only the capability digest
outside the one-time issue result.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-hmac.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/hmac.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-hmac.spec.ts docs/progress.md
git commit -m "feat(backend): add sandbox security cryptographic framing"
```

## P2-T3: Capability DTO, Authentication, and Authorization

**Files:**

- Create: `backend/src/modules/sandbox-security/dto/capability.ts`
- Create: `backend/src/modules/sandbox-security/capability-authorizer.ts`
- Create: `backend/tests/sandbox-security-capability.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write capability RED cases**

```ts
test("REQ-SBX-GENERAL-003 normalizes a default-TTL evaluate grant", () => {
  assert.equal(
    typeof boundary.normalizeSandboxSecurityCapabilityIssueRequest,
    "function"
  );
  assert.deepEqual(
    boundary.normalizeSandboxSecurityCapabilityIssueRequest!({
      schema_version: "sandbox-security-capability-issue-request.v1",
      subject_id: "operator:alpha",
      scopes: ["sandbox_security:evaluate"],
      allowed_stages: ["tool_request", "user_input"],
      allowed_policy_profile_ids: ["sandbox-security-strict.v1"]
    }),
    {
      schema_version: "sandbox-security-capability-issue-request.v1",
      subject_id: "operator:alpha",
      scopes: ["sandbox_security:evaluate"],
      allowed_stages: ["user_input", "tool_request"],
      allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
      ttl_seconds: 900
    }
  );
});
```

Add TTL `59/60/3600/3601`, empty/duplicate/sparse/inherited/accessor arrays,
subject grammar, evaluate/non-evaluate grant matrix, strict bearer grammar,
unknown/malformed/expired/revoked indistinguishable 401, scope-before-stage,
stage/profile denial, changed production-mode scope, constant-time bootstrap
admin check, idempotent revoke timestamp, and limiter-entry removal cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-capability.spec.ts
```

Expected: FAIL because the module boundary lacks the normalizer/authenticator
exports.

- [ ] **Step 3: Implement exact DTO and authorization APIs**

```ts
export function normalizeSandboxSecurityCapabilityIssueRequest(
  value: unknown
): SandboxSecurityCapabilityIssueRequest | null;

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

export function createSandboxSecurityCapabilityAuthenticator(input: Readonly<{
  repository: SandboxSecurityCapabilityRepository;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
  bootstrap_admin_token: string;
  now: () => string;
}>): SandboxSecurityCapabilityAuthenticator;
```

Repository lookup accepts only `sha256:<hex>`. Authorized output omits token
digest and scope seed. A known expired/revoked result contains only subject,
authorization scope, capability ID, and normalized grant fields needed for its
content-free rejection audit; `unknown` contains no identity. The controller
maps both denied variants and malformed tokens to the same public 401.
Administrator comparison hashes both secrets and compares fixed 32-byte values.

- [ ] **Step 4: Run GREEN**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-capability.spec.ts
npm run typecheck:backend
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/dto/capability.ts \
  backend/src/modules/sandbox-security/capability-authorizer.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-capability.spec.ts docs/progress.md
git commit -m "feat(backend): authorize sandbox security capabilities"
```

## P2-T4: Monotonic Token Buckets and Engine Slots

**Files:**

- Create: `backend/src/modules/sandbox-security/token-bucket.ts`
- Create: `backend/src/modules/sandbox-security/engine-concurrency.ts`
- Create: `backend/tests/sandbox-security-limits.spec.ts`
- Modify: `backend/src/modules/sandbox-security/sandbox-security.module.ts`

- [ ] **Step 1: Write deterministic RED tests**

```ts
test("REQ-SBX-GENERAL-003 capability bucket has burst three and five-second refill", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 3,
    refill_tokens_per_second: 0.2,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.equal(bucket.consume(0).allowed, true);
  assert.equal(bucket.consume(0).allowed, true);
  assert.deepEqual(bucket.consume(0), {
    allowed: false,
    retry_after_seconds: 5
  });
  assert.equal(bucket.consume(5000).allowed, true);
});

test("REQ-SBX-GENERAL-003 only four Engine leases may be active", () => {
  const limiter = boundary.createSandboxSecurityEngineConcurrencyLimiter!(4);
  const releases = Array.from({ length: 4 }, () => limiter.tryAcquire());
  assert.equal(releases.every((release) => typeof release === "function"), true);
  assert.equal(limiter.tryAcquire(), null);
  releases[0]!();
  assert.equal(typeof limiter.tryAcquire(), "function");
  releases[0]!();
  assert.equal(limiter.activeCount(), 4);
});
```

Add global `10/1s`, administrator `2/6s`, fractional refill, backward/nonfinite
clock rejection, exact Retry-After clamp, idempotent lease release, exception
release, no lease for slow body/replay/conflict, and capability limiter sweep
every 256 admissions with one-hour idle/expiry cases.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-limits.spec.ts
```

Expected: FAIL because the factories are not exported by the existing module.

- [ ] **Step 3: Implement exact limiter APIs**

```ts
export type SandboxSecurityLimitResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retry_after_seconds: number }>;

export interface SandboxSecurityTokenBucket {
  consume(monotonicNowMs: number): SandboxSecurityLimitResult;
}

export function createSandboxSecurityTokenBucket(input: Readonly<{
  capacity: number;
  refill_tokens_per_second: number;
  initial_monotonic_ms: number;
}>): SandboxSecurityTokenBucket;

export interface SandboxSecurityEngineConcurrencyLimiter {
  tryAcquire(): (() => void) | null;
  activeCount(): number;
}

export function createSandboxSecurityEngineConcurrencyLimiter(
  capacity: 4
): SandboxSecurityEngineConcurrencyLimiter;
```

Implement the Master Retry-After formula. Add a capability-keyed limiter map
whose entries are created only after successful authentication, deleted on
revoke, and swept on every 256th public admission using injected wall and
monotonic clocks.

- [ ] **Step 4: Run GREEN and Phase gates**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  backend/tests/sandbox-security-limits.spec.ts
npm run test:backend
npm run typecheck:backend
npm run test:engine:sandbox
git diff --check
```

- [ ] **Step 5: Review, update progress, and commit**

```bash
git add backend/src/modules/sandbox-security/token-bucket.ts \
  backend/src/modules/sandbox-security/engine-concurrency.ts \
  backend/src/modules/sandbox-security/sandbox-security.module.ts \
  backend/tests/sandbox-security-limits.spec.ts docs/progress.md
git commit -m "feat(backend): limit sandbox security evaluations"
```

Stop after P2-T4. Do not open SQLite in Phase 2.
