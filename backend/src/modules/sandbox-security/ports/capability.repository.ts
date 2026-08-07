import type { SandboxSecurityAuditEvent } from "../../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityEnforcementAuditCapabilityIssuedEvent } from "../../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityEnforcementAuditCapabilityPersistenceRecord } from "../dto/enforcement-audit-capability.ts";
import type {
  SandboxSecurityCapabilityPersistenceRecord
} from "../sandbox-security.types.ts";
import type { SandboxSecurityProductionCompositionBinding } from "../../../../../shared/types/sandbox-security-enforcement-audit.ts";

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

export interface SandboxSecurityEnforcementAuditCapabilityRepository {
  issueEnforcementAuditWithAudit(
    record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>,
    event: Readonly<SandboxSecurityEnforcementAuditCapabilityIssuedEvent>
  ): void;
  findEnforcementAuditByTokenDigest(
    tokenDigest: `sha256:${string}`
  ): Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord> | null;
  revokeEnforcementAudit(input: Readonly<{
    capability_id: string;
    revoked_at: string;
    composition_binding: SandboxSecurityProductionCompositionBinding;
  }>): Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord> | null;
}
