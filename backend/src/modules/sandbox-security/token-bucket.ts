import type {
  SandboxSecurityCapabilityLimiterRegistry,
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityLimitResult,
  SandboxSecurityTokenBucket
} from "./sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertFiniteMonotonic(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}

function retryAfterSeconds(remainingMs: number): number {
  return Math.min(60, Math.max(1, Math.ceil(remainingMs / 1000)));
}

export function createSandboxSecurityTokenBucket(input: Readonly<{
  capacity: number;
  refill_tokens_per_second: number;
  initial_monotonic_ms: number;
}>): SandboxSecurityTokenBucket {
  assertPositiveSafeInteger(input.capacity, "capacity");
  assertFinitePositive(
    input.refill_tokens_per_second,
    "refill_tokens_per_second"
  );
  assertFiniteMonotonic(input.initial_monotonic_ms, "initial_monotonic_ms");

  const capacity = input.capacity;
  const refillTokensPerSecond = input.refill_tokens_per_second;
  let availableTokens = capacity;
  let lastRefillMonotonicMs = input.initial_monotonic_ms;
  let lastObservedMonotonicMs = input.initial_monotonic_ms;

  return {
    consume(monotonicNowMs: number): SandboxSecurityLimitResult {
      assertFiniteMonotonic(monotonicNowMs, "monotonicNowMs");
      if (monotonicNowMs < lastObservedMonotonicMs) {
        throw new RangeError("monotonicNowMs cannot move backwards");
      }
      lastObservedMonotonicMs = monotonicNowMs;

      const elapsedMs = monotonicNowMs - lastRefillMonotonicMs;
      const timeToOneMs =
        availableTokens >= 1
          ? 0
          : ((1 - availableTokens) * 1000) / refillTokensPerSecond;
      if (elapsedMs >= timeToOneMs) {
        const elapsedSeconds = elapsedMs / 1000;
        const candidateTokens = Math.min(
          capacity,
          availableTokens + elapsedSeconds * refillTokensPerSecond
        );
        // The time comparison is authoritative at the exact boundary; avoid
        // turning a representational value just below one into a negative
        // balance after granting that token.
        availableTokens = Math.max(1, candidateTokens) - 1;
        lastRefillMonotonicMs = monotonicNowMs;
        return { allowed: true };
      }

      return {
        allowed: false,
        retry_after_seconds: retryAfterSeconds(timeToOneMs - elapsedMs)
      };
    }
  };
}

export function createSandboxSecurityEnforcementAuditTokenBucket(input: Readonly<{
  initial_monotonic_ms: number;
}>): SandboxSecurityTokenBucket {
  if (input === null || typeof input !== "object") {
    throw new TypeError("enforcement audit token bucket input is required");
  }
  return createSandboxSecurityTokenBucket({
    capacity: 2,
    refill_tokens_per_second: 1 / 6,
    initial_monotonic_ms: input.initial_monotonic_ms
  });
}

interface CapabilityLimiterEntry {
  readonly capability_id: string;
  readonly expires_at_ms: number;
  readonly bucket: SandboxSecurityTokenBucket;
  last_access_monotonic_ms: number;
}

function capabilityExpiryMs(capability: Readonly<SandboxSecurityAuthorizedCapability>): number {
  const expiresAtMs = Date.parse(capability.expires_at);
  if (!Number.isFinite(expiresAtMs)) {
    throw new RangeError("capability expires_at must be a valid timestamp");
  }
  return expiresAtMs;
}

export function createSandboxSecurityCapabilityLimiterRegistry(input: Readonly<{
  runtime: SandboxSecurityRuntimePort;
  capacity: 3;
  refill_tokens_per_second: 0.2;
  sweep_every_admissions: 256;
  idle_expiry_ms: 3600000;
}>): SandboxSecurityCapabilityLimiterRegistry {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("capability limiter registry input is required");
  }
  if (typeof input.runtime !== "object" || input.runtime === null) {
    throw new TypeError("capability limiter registry runtime is required");
  }
  if (
    typeof input.runtime.now !== "function" ||
    typeof input.runtime.monotonicNowMs !== "function"
  ) {
    throw new TypeError("capability limiter registry runtime is incomplete");
  }
  if (input.capacity !== 3) {
    throw new RangeError("capability limiter capacity must be three");
  }
  if (input.refill_tokens_per_second !== 0.2) {
    throw new RangeError("capability limiter refill must be 0.2 tokens per second");
  }
  if (input.sweep_every_admissions !== 256) {
    throw new RangeError("sweep_every_admissions must be 256");
  }
  if (input.idle_expiry_ms !== 3_600_000) {
    throw new RangeError("capability limiter idle expiry must be one hour");
  }

  const entries = new Map<string, CapabilityLimiterEntry>();
  let admissions = 0;

  function sweep(nowWallMs: number, nowMonotonicMs: number): void {
    if (!Number.isFinite(nowWallMs)) {
      throw new RangeError("runtime wall clock must be finite");
    }
    for (const [capabilityId, entry] of entries) {
      if (
        nowWallMs >= entry.expires_at_ms ||
        nowMonotonicMs - entry.last_access_monotonic_ms >= input.idle_expiry_ms
      ) {
        entries.delete(capabilityId);
      }
    }
  }

  return {
    consume(
      capability: Readonly<SandboxSecurityAuthorizedCapability>
    ): SandboxSecurityLimitResult {
      const nowMonotonicMs = input.runtime.monotonicNowMs();
      assertFiniteMonotonic(nowMonotonicMs, "runtime monotonic clock");
      admissions += 1;

      let entry = entries.get(capability.capability_id);
      if (entry === undefined) {
        entry = {
          capability_id: capability.capability_id,
          expires_at_ms: capabilityExpiryMs(capability),
          bucket: createSandboxSecurityTokenBucket({
            capacity: input.capacity,
            refill_tokens_per_second: input.refill_tokens_per_second,
            initial_monotonic_ms: nowMonotonicMs
          }),
          last_access_monotonic_ms: nowMonotonicMs
        };
        entries.set(capability.capability_id, entry);
      }

      const result = entry.bucket.consume(nowMonotonicMs);
      entry.last_access_monotonic_ms = nowMonotonicMs;
      if (admissions % input.sweep_every_admissions === 0) {
        const wallNow = Date.parse(input.runtime.now());
        sweep(wallNow, nowMonotonicMs);
      }
      return result;
    },
    remove(capabilityId: string): void {
      entries.delete(capabilityId);
    },
    size(): number {
      return entries.size;
    }
  };
}
