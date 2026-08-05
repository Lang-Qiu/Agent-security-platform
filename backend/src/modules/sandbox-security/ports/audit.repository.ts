import type { SandboxSecurityAuditEvent } from "../../../../../shared/types/sandbox-security-api.ts";

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
