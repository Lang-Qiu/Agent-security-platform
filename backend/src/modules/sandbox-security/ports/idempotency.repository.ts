import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityIdempotencyClaim,
  SandboxSecurityIdempotencyClaimResult,
  SandboxSecurityIdempotencyCompletion,
  SandboxSecurityIdempotencyConcurrencyRejection,
  SandboxSecurityIdempotencyInterruption,
  SandboxSecurityIdempotencyRecord
} from "../sandbox-security.types.ts";

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
