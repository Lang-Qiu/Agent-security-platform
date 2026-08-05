import assert from "node:assert/strict";
import { test } from "node:test";

import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type { SandboxSecurityAuthorizedCapability } from "../src/modules/sandbox-security/sandbox-security.types.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

function makeRuntime(input: Readonly<{
  wallNowMs?: number;
  monotonicNowMs?: number;
}> = {}): {
  runtime: SandboxSecurityRuntimePort;
  setWallNowMs(value: number): void;
  setMonotonicNowMs(value: number): void;
} {
  let wallNowMs = input.wallNowMs ?? Date.parse("2026-08-05T12:00:00.000Z");
  let monotonicNowMs = input.monotonicNowMs ?? 0;
  const runtime: SandboxSecurityRuntimePort = {
    now: () => new Date(wallNowMs).toISOString(),
    monotonicNowMs: () => monotonicNowMs,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => "capability:00000000-0000-4000-8000-000000000000",
    nextAuditEventId: () => "audit:00000000-0000-4000-8000-000000000000",
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000000",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({
      unref() {},
      cancel() {}
    })
  };
  return {
    runtime,
    setWallNowMs(value) {
      wallNowMs = value;
    },
    setMonotonicNowMs(value) {
      monotonicNowMs = value;
    }
  };
}

function makeCapability(input: Readonly<{
  capability_id: string;
  expires_at?: string;
}>): SandboxSecurityAuthorizedCapability {
  return {
    capability_id: input.capability_id,
    subject_id: "operator:alpha",
    authorization_scope_id: "authscope:hmac-sha256:scope",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    issued_at: "2026-08-05T11:00:00.000Z",
    expires_at: input.expires_at ?? "2026-08-05T13:00:00.000Z"
  };
}

test("REQ-SBX-GENERAL-003 capability bucket has burst three and five-second refill", () => {
  assert.equal(typeof boundary.createSandboxSecurityTokenBucket, "function");
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

test("REQ-SBX-GENERAL-003 global bucket refills one token per second", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 10,
    refill_tokens_per_second: 1,
    initial_monotonic_ms: 0
  });
  for (let index = 0; index < 10; index += 1) {
    assert.equal(bucket.consume(0).allowed, true);
  }
  assert.deepEqual(bucket.consume(0), {
    allowed: false,
    retry_after_seconds: 1
  });
  assert.equal(bucket.consume(1000).allowed, true);
});

test("REQ-SBX-GENERAL-003 administrator bucket refills two tokens over six seconds", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 2,
    refill_tokens_per_second: 1 / 6,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.equal(bucket.consume(0).allowed, true);
  assert.deepEqual(bucket.consume(0), {
    allowed: false,
    retry_after_seconds: 6
  });
  assert.equal(bucket.consume(6000).allowed, true);
});

test("REQ-SBX-GENERAL-003 token bucket preserves fractional refills", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 0.5,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.deepEqual(bucket.consume(1000), {
    allowed: false,
    retry_after_seconds: 1
  });
  assert.equal(bucket.consume(2000).allowed, true);
});

test("REQ-SBX-GENERAL-003 one-sixth refill rounds neither Retry-After nor exact-token readiness", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 1 / 6,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.deepEqual(bucket.consume(1000), {
    allowed: false,
    retry_after_seconds: 5
  });
  assert.deepEqual(bucket.consume(2000), {
    allowed: false,
    retry_after_seconds: 4
  });
  assert.deepEqual(bucket.consume(4000), {
    allowed: false,
    retry_after_seconds: 2
  });
  assert.deepEqual(bucket.consume(5000), {
    allowed: false,
    retry_after_seconds: 1
  });
  assert.deepEqual(bucket.consume(6000), { allowed: true });
});

test("REQ-SBX-GENERAL-003 Retry-After never underestimates a fractional millisecond deficit", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 0.2,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.deepEqual(bucket.consume(2999.9999999999995), {
    allowed: false,
    retry_after_seconds: 3
  });
  assert.deepEqual(bucket.consume(3000), {
    allowed: false,
    retry_after_seconds: 2
  });
});

test("REQ-SBX-GENERAL-003 token bucket rejects backward and nonfinite clocks", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 1,
    initial_monotonic_ms: 10
  });
  assert.throws(() => bucket.consume(9), RangeError);
  assert.throws(() => bucket.consume(Number.NaN), RangeError);
  assert.throws(() => bucket.consume(Number.POSITIVE_INFINITY), RangeError);
});

test("REQ-SBX-GENERAL-003 token bucket rejects a clock rollback after a denied admission", () => {
  const bucket = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 0.2,
    initial_monotonic_ms: 0
  });
  assert.equal(bucket.consume(0).allowed, true);
  assert.equal(bucket.consume(1000).allowed, false);
  assert.throws(() => bucket.consume(999), RangeError);
});

test("REQ-SBX-GENERAL-003 Retry-After is ceil-based and clamped to one through sixty", () => {
  const maxClamped = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 0.001,
    initial_monotonic_ms: 0
  });
  assert.equal(maxClamped.consume(0).allowed, true);
  assert.deepEqual(maxClamped.consume(0), {
    allowed: false,
    retry_after_seconds: 60
  });

  const minClamped = boundary.createSandboxSecurityTokenBucket!({
    capacity: 1,
    refill_tokens_per_second: 2,
    initial_monotonic_ms: 0
  });
  assert.equal(minClamped.consume(0).allowed, true);
  assert.deepEqual(minClamped.consume(499), {
    allowed: false,
    retry_after_seconds: 1
  });
});

test("REQ-SBX-GENERAL-003 only four Engine leases may be active and release is idempotent", () => {
  assert.equal(typeof boundary.createSandboxSecurityEngineConcurrencyLimiter, "function");
  const limiter = boundary.createSandboxSecurityEngineConcurrencyLimiter!(4);
  const releases = Array.from({ length: 4 }, () => limiter.tryAcquire());
  assert.equal(releases.every((release) => typeof release === "function"), true);
  assert.equal(limiter.tryAcquire(), null);
  releases[0]!();
  assert.equal(typeof limiter.tryAcquire(), "function");
  releases[0]!();
  assert.equal(limiter.activeCount(), 4);
});

test("REQ-SBX-GENERAL-003 capability registry creates entries only for authorized projections", () => {
  assert.equal(typeof boundary.createSandboxSecurityCapabilityLimiterRegistry, "function");
  const { runtime } = makeRuntime();
  const registry = boundary.createSandboxSecurityCapabilityLimiterRegistry!({
    runtime,
    capacity: 3,
    refill_tokens_per_second: 0.2,
    sweep_every_admissions: 256,
    idle_expiry_ms: 3_600_000
  });
  assert.equal(registry.size(), 0);
  const authorized = makeCapability({ capability_id: "capability:authorized" });
  assert.equal(registry.consume(authorized).allowed, true);
  assert.equal(registry.size(), 1);
  assert.equal("authenticateToken" in registry, false);
});

test("REQ-SBX-GENERAL-003 capability registry rejects non-fixed limiter configuration at construction", () => {
  const create = boundary.createSandboxSecurityCapabilityLimiterRegistry as unknown as (
    input: any
  ) => unknown;
  const { runtime } = makeRuntime();
  const valid = {
    runtime,
    capacity: 3,
    refill_tokens_per_second: 0.2,
    sweep_every_admissions: 256,
    idle_expiry_ms: 3_600_000
  };
  assert.throws(() => create({ ...valid, capacity: 2 }), RangeError);
  assert.throws(() => create({ ...valid, capacity: 100 }), RangeError);
  assert.throws(() => create({ ...valid, refill_tokens_per_second: 1 }), RangeError);
  assert.throws(() => create({ ...valid, refill_tokens_per_second: Number.NaN }), RangeError);
  assert.throws(() => create({ ...valid, runtime: undefined }), TypeError);
  assert.throws(
    () => create({ ...valid, runtime: { monotonicNowMs: () => 0 } }),
    TypeError
  );
});

test("REQ-SBX-GENERAL-003 capability registry sweeps idle entries on every 256th admission", () => {
  const clock = makeRuntime();
  const registry = boundary.createSandboxSecurityCapabilityLimiterRegistry!({
    runtime: clock.runtime,
    capacity: 3,
    refill_tokens_per_second: 0.2,
    sweep_every_admissions: 256,
    idle_expiry_ms: 3_600_000
  });
  const idle = makeCapability({ capability_id: "capability:idle" });
  const active = makeCapability({
    capability_id: "capability:active",
    expires_at: "2026-08-05T14:00:00.000Z"
  });
  assert.equal(registry.consume(idle).allowed, true);
  clock.setWallNowMs(Date.parse("2026-08-05T13:00:00.000Z"));
  clock.setMonotonicNowMs(3_600_000);
  assert.equal(registry.consume(active).allowed, true);
  for (let index = 0; index < 254; index += 1) {
    registry.consume(active);
  }
  assert.equal(registry.size(), 1);
  assert.equal(registry.consume(idle).allowed, true);
  assert.equal(registry.size(), 2);
});

test("REQ-SBX-GENERAL-003 capability registry sweeps expired entries and removes revoked IDs", () => {
  const clock = makeRuntime();
  const registry = boundary.createSandboxSecurityCapabilityLimiterRegistry!({
    runtime: clock.runtime,
    capacity: 3,
    refill_tokens_per_second: 0.2,
    sweep_every_admissions: 256,
    idle_expiry_ms: 3_600_000
  });
  const expired = makeCapability({
    capability_id: "capability:expired",
    expires_at: "2026-08-05T12:30:00.000Z"
  });
  const survivor = makeCapability({
    capability_id: "capability:survivor",
    expires_at: "2026-08-05T14:00:00.000Z"
  });
  assert.equal(registry.consume(expired).allowed, true);
  assert.equal(registry.consume(survivor).allowed, true);
  clock.setWallNowMs(Date.parse("2026-08-05T13:00:00.000Z"));
  clock.setMonotonicNowMs(3_600_000);
  for (let index = 0; index < 254; index += 1) {
    registry.consume(survivor);
  }
  assert.equal(registry.size(), 1);
  registry.remove("capability:survivor");
  registry.remove("capability:survivor");
  assert.equal(registry.size(), 0);
});
