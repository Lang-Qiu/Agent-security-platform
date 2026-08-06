import { Buffer } from "node:buffer";
import type { DatabaseSync } from "node:sqlite";

import { normalizeSandboxSecurityEnforcementAuditEvent } from "../../../../../../shared/contracts/sandbox-security-enforcement-audit.ts";
import type {
  SandboxSecurityEnforcementAuditEvent,
  SandboxSecurityEnforcementAuditEventCandidate
} from "../../../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type { SandboxSecurityEnforcementAuditRepository } from "../../ports/enforcement-audit.repository.ts";
import type { SqliteSandboxSecurityDatabase } from "../../ports/sqlite-database.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../../sandbox-security.errors.ts";

const EVENT_SCHEMA = "sandbox-security-enforcement-audit-event.v1" as const;
const LEGACY_EVENT_SCHEMA = "sandbox-security-audit-event.v1" as const;
const MAX_EVENT_BYTES = 65536;

interface EnforcementAuditRow {
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
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

function conflictError(): SandboxSecurityServiceError {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
    audit_rejection_code: "idempotency_conflict"
  });
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && keys.every((key) => ownKeys.includes(key));
}

function normalizeCandidate(input: Readonly<{
  candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
  occurred_at: string;
}>): Readonly<{
  event: SandboxSecurityEnforcementAuditEvent;
  candidate: SandboxSecurityEnforcementAuditEventCandidate;
}> {
  if (
    !hasExactKeys(input, ["candidate", "occurred_at"]) ||
    input.candidate === null ||
    typeof input.candidate !== "object" ||
    Array.isArray(input.candidate) ||
    Reflect.ownKeys(input.candidate).includes("occurred_at")
  ) {
    throw internalError();
  }

  const event = normalizeSandboxSecurityEnforcementAuditEvent({
    ...input.candidate,
    occurred_at: input.occurred_at
  });
  if (event === null) throw internalError();
  const { occurred_at: _occurredAt, ...candidate } = event;
  return { event, candidate };
}

function parseStoredEvent(row: Readonly<EnforcementAuditRow>): SandboxSecurityEnforcementAuditEvent {
  if (
    row.event_schema !== EVENT_SCHEMA ||
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
  if (
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

function withoutOccurredAt(
  event: SandboxSecurityEnforcementAuditEvent
): SandboxSecurityEnforcementAuditEventCandidate {
  const { occurred_at: _occurredAt, ...candidate } = event;
  return candidate;
}

function canonicalCandidate(
  candidate: SandboxSecurityEnforcementAuditEventCandidate
): string {
  const serialized = JSON.stringify(candidate);
  if (typeof serialized !== "string") throw internalError();
  return serialized;
}

function assertDependencies(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.database === null ||
    typeof input.database !== "object" ||
    typeof input.database.transaction !== "function" ||
    typeof input.database.read !== "function"
  ) {
    throw new TypeError("Invalid sandbox security enforcement audit repository input");
  }
}

function insertEvent(
  database: DatabaseSync,
  event: SandboxSecurityEnforcementAuditEvent
): void {
  const eventJson = JSON.stringify(event);
  if (
    typeof eventJson !== "string" ||
    Buffer.byteLength(eventJson, "utf8") < 2 ||
    Buffer.byteLength(eventJson, "utf8") > MAX_EVENT_BYTES
  ) {
    throw internalError();
  }
  database
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_schema, event_id, event_type, visibility_subject_id,
        authorization_scope_id, capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      EVENT_SCHEMA,
      event.event_id,
      event.event_type,
      event.subject_id,
      event.authorization_scope_id,
      event.capability_id,
      event.occurred_at,
      eventJson
    );
}

export function createSqliteSandboxSecurityEnforcementAuditRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityEnforcementAuditRepository {
  assertDependencies(input);
  const database = input.database;

  return {
    append(value) {
      try {
        // Keep all input normalization outside the transaction while still
        // converting hostile accessor/proxy failures to a bounded error.
        const normalized = normalizeCandidate(value);
        const candidateBytes = canonicalCandidate(normalized.candidate);
        return database.transaction((sqlite) => {
          const schemaRow = sqlite
            .prepare(
              `SELECT event_schema
               FROM sandbox_security_audit_events
               WHERE event_id = ?`
            )
            .get(normalized.event.event_id) as { event_schema?: unknown } | undefined;

          if (schemaRow !== undefined) {
            if (schemaRow.event_schema === LEGACY_EVENT_SCHEMA) {
              throw conflictError();
            }
            if (schemaRow.event_schema !== EVENT_SCHEMA) {
              throw internalError();
            }
            const row = sqlite
              .prepare(
                `SELECT event_schema, event_id, event_type,
                  visibility_subject_id, authorization_scope_id, capability_id,
                  occurred_at, event_json
                 FROM sandbox_security_audit_events
                 WHERE event_schema = ? AND event_id = ?`
              )
              .get(EVENT_SCHEMA, normalized.event.event_id) as EnforcementAuditRow | undefined;
            if (row === undefined) throw internalError();
            const stored = parseStoredEvent(row);
            if (canonicalCandidate(withoutOccurredAt(stored)) !== candidateBytes) {
              throw conflictError();
            }
            return {
              event_id: stored.event_id,
              status: "replayed" as const,
              occurred_at: stored.occurred_at
            };
          }

          insertEvent(sqlite, normalized.event);
          return {
            event_id: normalized.event.event_id,
            status: "accepted" as const,
            occurred_at: normalized.event.occurred_at
          };
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    }
  };
}
