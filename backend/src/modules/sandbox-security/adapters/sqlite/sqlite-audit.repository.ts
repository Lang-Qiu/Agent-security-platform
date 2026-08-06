import { Buffer } from "node:buffer";
import type { DatabaseSync } from "node:sqlite";

import { normalizeSandboxSecurityAuditEvent } from "../../../../../../shared/contracts/sandbox-security-api.ts";
import { normalizeSandboxSecurityEnforcementAuditEvent } from "../../../../../../shared/contracts/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityAuditEvent } from "../../../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityEnforcementAuditEvent } from "../../../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityAuditRepository } from "../../ports/audit.repository.ts";
import type { SqliteSandboxSecurityDatabase } from "../../ports/sqlite-database.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../../sandbox-security.errors.ts";

const EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const UTC_MILLISECOND_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_EVENT_BYTES = 65536;
const LEGACY_EVENT_SCHEMA = "sandbox-security-audit-event.v1" as const;
const PRIVATE_EVENT_SCHEMA = "sandbox-security-enforcement-audit-event.v1" as const;

interface AuditRow {
  rowid?: unknown;
  event_schema?: unknown;
  event_id?: unknown;
  event_type?: unknown;
  visibility_subject_id?: unknown;
  authorization_scope_id?: unknown;
  capability_id?: unknown;
  occurred_at?: unknown;
  event_json?: unknown;
}

function internalError(): SandboxSecurityServiceError {
  return createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
}

function isStrictTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function parseStoredEvent(row: Readonly<AuditRow>): SandboxSecurityAuditEvent {
  if (
    row.event_schema !== LEGACY_EVENT_SCHEMA ||
    typeof row.event_id !== "string" ||
    typeof row.event_type !== "string" ||
    typeof row.visibility_subject_id !== "string" ||
    (row.authorization_scope_id !== null && typeof row.authorization_scope_id !== "string") ||
    (row.capability_id !== null && typeof row.capability_id !== "string") ||
    typeof row.occurred_at !== "string" ||
    typeof row.event_json !== "string" ||
    Buffer.byteLength(row.event_json, "utf8") < 2 ||
    Buffer.byteLength(row.event_json, "utf8") > MAX_EVENT_BYTES
  ) {
    throw internalError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.event_json);
  } catch {
    throw internalError();
  }
  const event = normalizeSandboxSecurityAuditEvent(parsed);
  if (
    event === null ||
    event.event_id !== row.event_id ||
    event.event_type !== row.event_type ||
    event.subject_id !== row.visibility_subject_id ||
    event.authorization_scope_id !== row.authorization_scope_id ||
    event.capability_id !== row.capability_id ||
    event.occurred_at !== row.occurred_at
  ) {
    throw internalError();
  }
  return event;
}

function parseStoredPrivateEvent(
  row: Readonly<AuditRow>
): SandboxSecurityEnforcementAuditEvent {
  if (
    row.event_schema !== PRIVATE_EVENT_SCHEMA ||
    typeof row.event_id !== "string" ||
    typeof row.event_type !== "string" ||
    typeof row.visibility_subject_id !== "string" ||
    typeof row.authorization_scope_id !== "string" ||
    typeof row.capability_id !== "string" ||
    typeof row.occurred_at !== "string" ||
    typeof row.event_json !== "string"
  ) {
    throw internalError();
  }
  const eventBytes = Buffer.byteLength(row.event_json, "utf8");
  if (eventBytes < 2 || eventBytes > MAX_EVENT_BYTES) throw internalError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.event_json);
  } catch {
    throw internalError();
  }
  const event = normalizeSandboxSecurityEnforcementAuditEvent(parsed);
  if (
    event === null ||
    event.event_id !== row.event_id ||
    event.event_type !== row.event_type ||
    event.subject_id !== row.visibility_subject_id ||
    event.authorization_scope_id !== row.authorization_scope_id ||
    event.capability_id !== row.capability_id ||
    event.occurred_at !== row.occurred_at
  ) {
    throw internalError();
  }
  return event;
}

function normalizeEvent(value: unknown): SandboxSecurityAuditEvent {
  const event = normalizeSandboxSecurityAuditEvent(value);
  if (event === null) throw internalError();
  const serialized = JSON.stringify(event);
  if (Buffer.byteLength(serialized, "utf8") < 2 || Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) {
    throw internalError();
  }
  return event;
}

function insertEvent(database: DatabaseSync, value: unknown): SandboxSecurityAuditEvent {
  const event = normalizeEvent(value);
  database
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_schema, event_id, event_type, visibility_subject_id, authorization_scope_id,
        capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      LEGACY_EVENT_SCHEMA,
      event.event_id,
      event.event_type,
      event.subject_id,
      event.authorization_scope_id,
      event.capability_id,
      event.occurred_at,
      JSON.stringify(event)
    );
  return event;
}

function assertReadEvent(
  value: unknown,
  subject: string,
  returnedCount: number,
  hasMore: boolean
): SandboxSecurityAuditEvent {
  const event = normalizeEvent(value);
  if (
    event.event_type !== "audit_read" ||
    event.subject_id !== subject ||
    event.returned_count !== returnedCount ||
    event.next_cursor_present !== hasMore
  ) {
    throw internalError();
  }
  return event;
}

function assertPurgeEvent(
  value: unknown,
  deletedCount: number,
  hasMore: boolean
): SandboxSecurityAuditEvent {
  const event = normalizeEvent(value);
  if (
    event.event_type !== "audit_purged" ||
    event.subject_id !== "system:bootstrap-admin" ||
    event.authorization_scope_id !== null ||
    event.capability_id !== null ||
    event.retention_days !== 90 ||
    event.deleted_count !== deletedCount ||
    event.has_more !== hasMore
  ) {
    throw internalError();
  }
  return event;
}

function assertListInput(input: Readonly<{
  visibility_subject_id: string;
  after: Readonly<{ occurred_at: string; event_id: string }> | null;
  limit: number;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.visibility_subject_id !== "string" ||
    !SUBJECT_PATTERN.test(input.visibility_subject_id) ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    (input.after !== null &&
      (typeof input.after !== "object" ||
        !isStrictTimestamp(input.after.occurred_at) ||
        !EVENT_ID_PATTERN.test(input.after.event_id)))
  ) {
    throw internalError();
  }
}

function assertPurgeInput(input: Readonly<{
  cutoff: string;
  limit: 1000;
  create_event(deletedCount: number, hasMore: boolean): Readonly<SandboxSecurityAuditEvent>;
}>): void {
  const ownKeys = input !== null && typeof input === "object" ? Reflect.ownKeys(input) : [];
  if (
    input === null ||
    typeof input !== "object" ||
    !isStrictTimestamp(input.cutoff) ||
    input.limit !== 1000 ||
    typeof input.create_event !== "function" ||
    ownKeys.length !== 3 ||
    !["cutoff", "limit", "create_event"].every((key) => ownKeys.includes(key))
  ) {
    throw internalError();
  }
}

export function createSqliteSandboxSecurityAuditRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityAuditRepository {
  if (
    input === null ||
    typeof input !== "object" ||
    input.database === null ||
    typeof input.database !== "object" ||
    typeof input.database.transaction !== "function" ||
    typeof input.database.read !== "function"
  ) {
    throw new TypeError("Invalid sandbox security audit repository input");
  }
  const database = input.database;
  return {
    append(event): void {
      try {
        database.transaction((sqlite) => {
          insertEvent(sqlite, event);
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error) && error.code === "SANDBOX_SECURITY_INTERNAL_ERROR") throw error;
        throw internalError();
      }
    },

    listAndRecordRead(listInput) {
      assertListInput(listInput);
      try {
        return database.transaction((sqlite) => {
          const afterClause = listInput.after === null
            ? ""
            : " AND (occurred_at < :after_occurred_at OR (occurred_at = :after_occurred_at AND event_id < :after_event_id))";
          const params: Record<string, string | number | null> = {
            subject: listInput.visibility_subject_id,
            row_limit: listInput.limit + 1
          };
          if (listInput.after !== null) {
            params.after_occurred_at = listInput.after.occurred_at;
            params.after_event_id = listInput.after.event_id;
          }
          const rows = sqlite
            .prepare(
              `SELECT rowid, event_schema, event_id, event_type, visibility_subject_id,
                authorization_scope_id, capability_id, occurred_at, event_json
               FROM sandbox_security_audit_events
               WHERE event_schema = '${LEGACY_EVENT_SCHEMA}'
                 AND visibility_subject_id = :subject${afterClause}
               ORDER BY occurred_at DESC, event_id DESC
               LIMIT :row_limit`
            )
            .all(params) as AuditRow[];
          const normalized = rows.map((row) => {
            const event = parseStoredEvent(row);
            if (event.subject_id !== listInput.visibility_subject_id) throw internalError();
            return event;
          });
          const hasMore = normalized.length > listInput.limit;
          const events = normalized.slice(0, listInput.limit);
          const readEvent = assertReadEvent(
            listInput.create_event({
              returned_count: events.length,
              next_cursor_present: hasMore
            }),
            listInput.visibility_subject_id,
            events.length,
            hasMore
          );
          insertEvent(sqlite, readEvent);
          return { events, has_more: hasMore };
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error) && error.code === "SANDBOX_SECURITY_INTERNAL_ERROR") throw error;
        throw internalError();
      }
    },

    purgeExpiredWithAudit(purgeInput) {
      assertPurgeInput(purgeInput);
      try {
        return database.transaction((sqlite) => {
          const rows = sqlite
            .prepare(
              `SELECT rowid, event_schema, event_id, event_type, visibility_subject_id,
                authorization_scope_id, capability_id, occurred_at, event_json
               FROM sandbox_security_audit_events
               WHERE occurred_at < :cutoff
               ORDER BY occurred_at ASC, event_id ASC
               LIMIT :row_limit`
            )
            .all({ cutoff: purgeInput.cutoff, row_limit: 1001 }) as AuditRow[];
          // Validate every selected row before deletion so corruption cannot be silently purged.
          for (const row of rows) {
            if (!Number.isSafeInteger(row.rowid)) throw internalError();
            if (row.event_schema === LEGACY_EVENT_SCHEMA) {
              parseStoredEvent(row);
            } else if (row.event_schema === PRIVATE_EVENT_SCHEMA) {
              parseStoredPrivateEvent(row);
            } else {
              throw internalError();
            }
          }
          const hasMore = rows.length > 1000;
          const selected = rows.slice(0, 1000);
          if (selected.length > 0) {
            const placeholders = selected.map(() => "?").join(", ");
            sqlite
              .prepare(`DELETE FROM sandbox_security_audit_events WHERE rowid IN (${placeholders})`)
              .run(...selected.map((row) => row.rowid as number));
          }
          const purgeEvent = assertPurgeEvent(
            purgeInput.create_event(selected.length, hasMore),
            selected.length,
            hasMore
          );
          insertEvent(sqlite, purgeEvent);
          return { deleted_count: selected.length, has_more: hasMore };
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error) && error.code === "SANDBOX_SECURITY_INTERNAL_ERROR") throw error;
        throw internalError();
      }
    }
  };
}
