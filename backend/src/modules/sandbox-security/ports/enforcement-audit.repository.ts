import type { SandboxSecurityEnforcementAuditEventCandidate } from "../../../../../shared/types/sandbox-security-enforcement-audit.ts";

export interface SandboxSecurityEnforcementAuditRepository {
  append(input: Readonly<{
    candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
    occurred_at: string;
  }>): Readonly<{
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}
