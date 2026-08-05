import type { SandboxSecurityAuditEvent } from "../../../../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityCapabilityPersistenceRecord
} from "../sandbox-security.types.ts";

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
