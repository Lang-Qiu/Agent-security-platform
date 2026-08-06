import type { SandboxSecurityAuditEvent } from "../../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityEnforcementAuditCapabilityIssuedEvent } from "../../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityEnforcementAuditCapabilityPersistenceRecord } from "../dto/enforcement-audit-capability.ts";
import type {
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityPrivateCapabilityPersistenceRecord
} from "../sandbox-security.types.ts";

export interface SandboxSecurityCapabilityRepository {
  issueWithAudit(
    record: Readonly<SandboxSecurityCapabilityPersistenceRecord>,
    event: Readonly<SandboxSecurityAuditEvent>
  ): void;
  findByTokenDigest(
    tokenDigest: `sha256:${string}`
  ): Readonly<SandboxSecurityPrivateCapabilityPersistenceRecord> | null;
  revokeWithAudit(input: Readonly<{
    capability_id: string;
    revoked_at: string;
    create_event(
      record: Readonly<
        SandboxSecurityCapabilityPersistenceRecord |
        SandboxSecurityEnforcementAuditCapabilityPersistenceRecord
      >
    ): Readonly<SandboxSecurityAuditEvent>;
  }>): Readonly<SandboxSecurityPrivateCapabilityPersistenceRecord> | null;
}

export interface SandboxSecurityEnforcementAuditCapabilityRepository {
  issueEnforcementAuditWithAudit(
    record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>,
    event: Readonly<SandboxSecurityEnforcementAuditCapabilityIssuedEvent>
  ): void;
}
