import {
  normalizeSandboxSecurityAuditEvent,
  normalizeSandboxSecurityAuditPage
} from "../../../../shared/contracts/sandbox-security-api.ts";
import type { SandboxSecurityAuditEvent } from "../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityAuditRepository } from "./ports/audit.repository.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuditPurgeResult,
  SandboxSecurityAuditService,
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityHmacService,
  SandboxSecurityIdempotencyMaintenance
} from "./sandbox-security.types.ts";

const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PURGE_LIMIT = 1000 as const;
const CURSOR_INVALID = Symbol("sandbox-security-audit-cursor-invalid");
const PRE_CLEANUP_STORAGE_UNAVAILABLE = Symbol(
  "sandbox-security-audit-pre-cleanup-storage-unavailable"
);
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

function internalError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

function cursorInvalidError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
    audit_rejection_code: "invalid_request"
  });
}

function isStrictUtcMillisecondTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = UTC_MILLISECOND_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = month === 2 && leap ? 29 : daysInMonth[month - 1];
  if (day < 1 || day > maxDay) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function elapsedMs(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw internalError();
  return Math.max(0, Math.min(60000, Math.floor(end - start)));
}

function assertCapability(capability: Readonly<SandboxSecurityAuthorizedCapability>): void {
  if (
    capability === null ||
    typeof capability !== "object" ||
    typeof capability.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(capability.capability_id) ||
    typeof capability.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(capability.subject_id) ||
    typeof capability.authorization_scope_id !== "string" ||
    !AUTHORIZATION_SCOPE_PATTERN.test(capability.authorization_scope_id)
  ) {
    throw internalError();
  }
}

function assertCursorFields(
  value: unknown,
  capability: Readonly<SandboxSecurityAuthorizedCapability>
): asserts value is Readonly<{
  subject_id: string;
  authorization_scope_id: string;
  occurred_at: string;
  event_id: string;
}> {
  const candidate = value as Record<string, unknown>;
  if (
    value === null ||
    typeof value !== "object" ||
    typeof candidate.subject_id !== "string" ||
    typeof candidate.authorization_scope_id !== "string" ||
    typeof candidate.occurred_at !== "string" ||
    typeof candidate.event_id !== "string" ||
    candidate.subject_id !== capability.subject_id ||
    candidate.authorization_scope_id !== capability.authorization_scope_id ||
    !isStrictUtcMillisecondTimestamp(candidate.occurred_at) ||
    !EVENT_ID_PATTERN.test(candidate.event_id)
  ) {
    throw CURSOR_INVALID;
  }
}

function normalizePageEvents(
  value: unknown,
  capability: Readonly<SandboxSecurityAuthorizedCapability>
): SandboxSecurityAuditEvent[] {
  if (!Array.isArray(value) || value.length > 100) throw internalError();
  const events: SandboxSecurityAuditEvent[] = [];
  for (const event of value) {
    const normalized = normalizeSandboxSecurityAuditEvent(event);
    if (normalized === null || normalized.subject_id !== capability.subject_id) {
      throw internalError();
    }
    events.push(normalized);
  }
  return events;
}

function assertDependencies(input: Readonly<{
  repository: SandboxSecurityAuditRepository;
  hmac: SandboxSecurityHmacService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.repository === null ||
    typeof input.repository !== "object" ||
    typeof input.repository.listAndRecordRead !== "function" ||
    typeof input.repository.purgeExpiredWithAudit !== "function" ||
    input.hmac === null ||
    typeof input.hmac !== "object" ||
    typeof input.hmac.decodeAuditCursor !== "function" ||
    typeof input.hmac.encodeAuditCursor !== "function" ||
    input.maintenance === null ||
    typeof input.maintenance !== "object" ||
    typeof input.maintenance.runPurgePreCleanup !== "function" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.now !== "function" ||
    typeof input.runtime.monotonicNowMs !== "function" ||
    typeof input.runtime.nextAuditEventId !== "function" ||
    input.audit_projector === null ||
    typeof input.audit_projector !== "object" ||
    typeof input.audit_projector.auditRead !== "function" ||
    typeof input.audit_projector.auditPurged !== "function"
  ) {
    throw new TypeError("Invalid sandbox security audit service input");
  }
}

export function createSandboxSecurityAuditService(input: Readonly<{
  repository: SandboxSecurityAuditRepository;
  hmac: SandboxSecurityHmacService;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityAuditService {
  assertDependencies(input);
  const repository = input.repository;
  const hmac = input.hmac;
  const maintenance = input.maintenance;
  const runtime = input.runtime;
  const auditProjector = input.audit_projector;

  return {
    list(value): Readonly<{
      schema_version: "sandbox-security-audit-page.v1";
      events: SandboxSecurityAuditEvent[];
      next_cursor: string | null;
    }> {
      try {
        assertCapability(value.capability);
        if (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100) {
          throw internalError();
        }
        const startedAt = runtime.monotonicNowMs();
        let after: Readonly<{ occurred_at: string; event_id: string }> | null = null;
        if (value.cursor !== undefined) {
          if (typeof value.cursor !== "string") throw CURSOR_INVALID;
          let decoded: ReturnType<SandboxSecurityHmacService["decodeAuditCursor"]>;
          try {
            decoded = hmac.decodeAuditCursor(value.cursor, {
              subject_id: value.capability.subject_id,
              authorization_scope_id: value.capability.authorization_scope_id
            });
          } catch {
            throw CURSOR_INVALID;
          }
          if (decoded === null) throw CURSOR_INVALID;
          assertCursorFields(decoded, value.capability);
          after = {
            occurred_at: decoded.occurred_at,
            event_id: decoded.event_id
          };
        }

        let readEventId: string | null = null;
        const result = repository.listAndRecordRead({
          visibility_subject_id: value.capability.subject_id,
          after,
          limit: value.limit,
          create_event: (readInput) => {
            if (
              !Number.isSafeInteger(readInput.returned_count) ||
              readInput.returned_count < 0 ||
              typeof readInput.next_cursor_present !== "boolean"
            ) {
              throw internalError();
            }
            const eventId = runtime.nextAuditEventId();
            if (typeof eventId !== "string" || !EVENT_ID_PATTERN.test(eventId)) {
              throw internalError();
            }
            readEventId = eventId;
            const occurredAt = runtime.now();
            if (!isStrictUtcMillisecondTimestamp(occurredAt)) throw internalError();
            return auditProjector.auditRead({
              event_id: eventId,
              occurred_at: occurredAt,
              subject_id: value.capability.subject_id,
              authorization_scope_id: value.capability.authorization_scope_id,
              capability_id: value.capability.capability_id,
              returned_count: readInput.returned_count,
              next_cursor_present: readInput.next_cursor_present,
              elapsed_ms: elapsedMs(startedAt, runtime.monotonicNowMs())
            });
          }
        });
        if (
          result === null ||
          typeof result !== "object" ||
          typeof result.has_more !== "boolean"
        ) {
          throw internalError();
        }
        const events = normalizePageEvents(result.events, value.capability);
        if (events.length > value.limit) throw internalError();
        if (readEventId !== null && events.some((event) => event.event_id === readEventId)) {
          throw internalError();
        }
        let nextCursor: string | null = null;
        if (result.has_more) {
          const last = events.at(-1);
          if (last === undefined) throw internalError();
          nextCursor = hmac.encodeAuditCursor({
            subject_id: value.capability.subject_id,
            authorization_scope_id: value.capability.authorization_scope_id,
            occurred_at: last.occurred_at,
            event_id: last.event_id
          });
        }
        const page = normalizeSandboxSecurityAuditPage({
          schema_version: "sandbox-security-audit-page.v1",
          events,
          next_cursor: nextCursor
        });
        if (page === null) throw internalError();
        return page;
      } catch (error) {
        if (error === CURSOR_INVALID) throw cursorInvalidError();
        throw internalError();
      }
    },

    purgeExpired(): Readonly<SandboxSecurityAuditPurgeResult> {
      let preCleanupStorageError: ReturnType<
        typeof createSandboxSecurityServiceError
      > | null = null;
      try {
        try {
          maintenance.runPurgePreCleanup();
        } catch (error) {
          if (
            isSandboxSecurityServiceError(error) &&
            error.code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"
          ) {
            preCleanupStorageError = error;
            throw PRE_CLEANUP_STORAGE_UNAVAILABLE;
          }
          throw internalError();
        }
        const startedAt = runtime.monotonicNowMs();
        const now = runtime.now();
        if (!isStrictUtcMillisecondTimestamp(now)) throw internalError();
        const cutoff = new Date(Date.parse(now) - RETENTION_MS).toISOString();
        const result = repository.purgeExpiredWithAudit({
          cutoff,
          limit: PURGE_LIMIT,
          create_event: (deletedCount, hasMore) => {
            if (
              !Number.isSafeInteger(deletedCount) ||
              deletedCount < 0 ||
              deletedCount > PURGE_LIMIT ||
              typeof hasMore !== "boolean"
            ) {
              throw internalError();
            }
            const eventId = runtime.nextAuditEventId();
            if (typeof eventId !== "string" || !EVENT_ID_PATTERN.test(eventId)) {
              throw internalError();
            }
            const occurredAt = runtime.now();
            if (!isStrictUtcMillisecondTimestamp(occurredAt)) throw internalError();
            return auditProjector.auditPurged({
              event_id: eventId,
              occurred_at: occurredAt,
              subject_id: "system:bootstrap-admin",
              retention_days: RETENTION_DAYS,
              deleted_count: deletedCount,
              has_more: hasMore,
              elapsed_ms: elapsedMs(startedAt, runtime.monotonicNowMs())
            });
          }
        });
        if (
          result === null ||
          typeof result !== "object" ||
          !Number.isSafeInteger(result.deleted_count) ||
          result.deleted_count < 0 ||
          result.deleted_count > PURGE_LIMIT ||
          typeof result.has_more !== "boolean"
        ) {
          throw internalError();
        }
        return {
          schema_version: "sandbox-security-audit-purge-result.v1",
          retention_days: RETENTION_DAYS,
          deleted_count: result.deleted_count,
          has_more: result.has_more
        };
      } catch (error) {
        if (error === PRE_CLEANUP_STORAGE_UNAVAILABLE && preCleanupStorageError !== null) {
          throw preCleanupStorageError;
        }
        throw internalError();
      }
    }
  };
}
