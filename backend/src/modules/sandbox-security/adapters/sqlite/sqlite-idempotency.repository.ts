import { Buffer } from "node:buffer";
import type { DatabaseSync } from "node:sqlite";

import { normalizeSandboxSecurityAuditEvent } from "../../../../../../shared/contracts/sandbox-security-api.ts";
import { normalizeSandboxSecurityDecision } from "../../../../../../shared/contracts/sandbox-security.ts";
import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES,
  type SandboxSecurityDecision,
  type SandboxSecurityPolicyProfileId,
  type SandboxSecurityStage
} from "../../../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityAuditEvent } from "../../../../../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityIdempotencyRepository } from "../../ports/idempotency.repository.ts";
import type { SqliteSandboxSecurityDatabase } from "../../ports/sqlite-database.ts";
import {
  SandboxSecurityClaimCleanupError,
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../../sandbox-security.errors.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityIdempotencyClaim,
  SandboxSecurityIdempotencyClaimResult,
  SandboxSecurityIdempotencyCompletion,
  SandboxSecurityIdempotencyConcurrencyRejection,
  SandboxSecurityIdempotencyInterruption,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityIdempotencyRecord
} from "../../sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "../../ports/runtime.ts";

const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^idem-key:hmac-sha256:[0-9a-f]{64}$/;
const FINGERPRINT_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/;
const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COMPOSITION_BINDINGS = [
  "sandbox-security-production-composition.v1:rule_only",
  "sandbox-security-production-composition.v1:local",
  "sandbox-security-production-composition.v1:local_and_judge"
] as const;
const UTC_MILLISECOND_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

type IdempotencyStatus = SandboxSecurityIdempotencyRecord["status"];

interface IdempotencyRow {
  authorization_scope_id?: unknown;
  idempotency_key_hmac?: unknown;
  request_fingerprint?: unknown;
  capability_id?: unknown;
  subject_id?: unknown;
  request_id?: unknown;
  stage?: unknown;
  policy_profile_id?: unknown;
  composition_binding?: unknown;
  status?: unknown;
  response_json?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  expires_at?: unknown;
}

function internalError(): SandboxSecurityServiceError {
  return createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
}

function isStrictTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeStatus(value: unknown): IdempotencyStatus | null {
  return value === "in_progress" || value === "completed" || value === "interrupted"
    ? value
    : null;
}

function normalizeRecord(value: IdempotencyRow): SandboxSecurityIdempotencyRecord | null {
  if (
    typeof value.authorization_scope_id !== "string" ||
    !AUTHORIZATION_SCOPE_PATTERN.test(value.authorization_scope_id) ||
    typeof value.idempotency_key_hmac !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(value.idempotency_key_hmac) ||
    typeof value.request_fingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.request_fingerprint) ||
    typeof value.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value.capability_id) ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    typeof value.request_id !== "string" ||
    !REQUEST_ID_PATTERN.test(value.request_id) ||
    typeof value.stage !== "string" ||
    !SANDBOX_SECURITY_STAGES.includes(value.stage as SandboxSecurityStage) ||
    typeof value.policy_profile_id !== "string" ||
    !SANDBOX_SECURITY_POLICY_PROFILE_IDS.includes(
      value.policy_profile_id as SandboxSecurityPolicyProfileId
    ) ||
    typeof value.composition_binding !== "string" ||
    !COMPOSITION_BINDINGS.includes(value.composition_binding as (typeof COMPOSITION_BINDINGS)[number]) ||
    !isStrictTimestamp(value.created_at) ||
    !isStrictTimestamp(value.updated_at) ||
    !isStrictTimestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.created_at)
  ) {
    return null;
  }
  const status = normalizeStatus(value.status);
  if (status === null) return null;
  if (status === "completed") {
    if (typeof value.response_json !== "string") return null;
    const bytes = Buffer.byteLength(value.response_json, "utf8");
    if (bytes < 2 || bytes > MAX_RESPONSE_BYTES) return null;
  } else if (value.response_json !== null) {
    return null;
  }
  return {
    authorization_scope_id: value.authorization_scope_id,
    idempotency_key_hmac: value.idempotency_key_hmac as `idem-key:hmac-sha256:${string}`,
    request_fingerprint: value.request_fingerprint as `hmac-sha256:${string}`,
    capability_id: value.capability_id,
    subject_id: value.subject_id,
    request_id: value.request_id,
    stage: value.stage as SandboxSecurityStage,
    policy_profile_id: value.policy_profile_id as SandboxSecurityPolicyProfileId,
    composition_binding: value.composition_binding,
    status,
    response_json: value.response_json,
    created_at: value.created_at,
    updated_at: value.updated_at,
    expires_at: value.expires_at
  };
}

function readRow(
  database: DatabaseSync,
  authorizationScopeId: string,
  idempotencyKeyHmac: string
): SandboxSecurityIdempotencyRecord | null {
  const row = database
    .prepare(
      `SELECT authorization_scope_id, idempotency_key_hmac,
        request_fingerprint, capability_id, subject_id, request_id, stage,
        policy_profile_id, composition_binding, status, response_json,
        created_at, updated_at, expires_at
       FROM sandbox_security_idempotency_records
       WHERE authorization_scope_id = ? AND idempotency_key_hmac = ?`
    )
    .get(authorizationScopeId, idempotencyKeyHmac) as IdempotencyRow | undefined;
  return row === undefined ? null : normalizeRecord(row);
}

function normalizedAuditEvent(value: unknown): SandboxSecurityAuditEvent {
  const normalized = normalizeSandboxSecurityAuditEvent(value);
  if (normalized === null) throw internalError();
  return normalized;
}

function insertAuditEvent(database: DatabaseSync, value: unknown): void {
  const event = normalizedAuditEvent(value);
  if (event.authorization_scope_id === null || event.capability_id === null) {
    throw internalError();
  }
  const eventJson = JSON.stringify(event);
  const eventBytes = Buffer.byteLength(eventJson, "utf8");
  if (eventBytes < 2 || eventBytes > 65536) throw internalError();
  database
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_id, event_type, visibility_subject_id, authorization_scope_id,
        capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.event_id,
      event.event_type,
      event.subject_id,
      event.authorization_scope_id,
      event.capability_id,
      event.occurred_at,
      eventJson
    );
}

function assertRequestRejectedEvent(
  value: unknown,
  record: Readonly<{
    authorization_scope_id: string;
    capability_id: string;
    subject_id: string;
    request_id: string;
    stage: SandboxSecurityStage;
    policy_profile_id: SandboxSecurityPolicyProfileId;
    composition_binding: string;
  }>,
  rejectionCode: "idempotency_in_progress" | "idempotency_conflict" | "concurrency_limited",
  options: Readonly<{ match_request_context?: boolean }> = {}
): void {
  const event = normalizedAuditEvent(value);
  const matchRequestContext = options.match_request_context !== false;
  if (
    event.event_type !== "request_rejected" ||
    event.authorization_scope_id !== record.authorization_scope_id ||
    event.capability_id !== record.capability_id ||
    event.subject_id !== record.subject_id ||
    event.route_id !== "evaluation" ||
    (matchRequestContext && event.request_id !== record.request_id) ||
    (matchRequestContext && event.stage !== record.stage) ||
    (matchRequestContext && event.policy_profile_id !== record.policy_profile_id) ||
    event.composition_binding !== record.composition_binding ||
    event.rejection_code !== rejectionCode
  ) {
    throw internalError();
  }
}

function assertEvaluationEvent(
  value: unknown,
  record: Readonly<SandboxSecurityIdempotencyRecord>,
  decision: Readonly<SandboxSecurityDecision>,
  eventType: "evaluation_completed" | "evaluation_replayed"
): void {
  const event = normalizedAuditEvent(value);
  if (
    event.event_type !== eventType ||
    event.authorization_scope_id !== record.authorization_scope_id ||
    event.capability_id !== record.capability_id ||
    event.subject_id !== record.subject_id ||
    decision.request_id !== record.request_id ||
    decision.stage !== record.stage ||
    decision.policy_profile_id !== record.policy_profile_id ||
    event.request_id !== decision.request_id ||
    event.stage !== decision.stage ||
    event.policy_profile_id !== decision.policy_profile_id ||
    event.composition_binding !== record.composition_binding
  ) {
    throw internalError();
  }
}

function assertInterruptionEvent(
  value: unknown,
  record: Readonly<SandboxSecurityIdempotencyRecord>,
  allowedCodes: readonly ("engine_error" | "persistence_error" | "startup_recovery")[]
): void {
  const event = normalizedAuditEvent(value);
  if (
    event.event_type !== "evaluation_interrupted" ||
    event.authorization_scope_id !== record.authorization_scope_id ||
    event.capability_id !== record.capability_id ||
    event.subject_id !== record.subject_id ||
    event.request_id !== record.request_id ||
    event.stage !== record.stage ||
    event.policy_profile_id !== record.policy_profile_id ||
    event.composition_binding !== record.composition_binding ||
    !allowedCodes.includes(event.interruption_code)
  ) {
    throw internalError();
  }
}

function assertClaimInput(input: Readonly<SandboxSecurityIdempotencyClaim>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    !AUTHORIZATION_SCOPE_PATTERN.test(input.authorization_scope_id) ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotency_key_hmac) ||
    !FINGERPRINT_PATTERN.test(input.request_fingerprint) ||
    !CAPABILITY_ID_PATTERN.test(input.capability_id) ||
    !SUBJECT_PATTERN.test(input.subject_id) ||
    !REQUEST_ID_PATTERN.test(input.request_id) ||
    !SANDBOX_SECURITY_STAGES.includes(input.stage) ||
    !SANDBOX_SECURITY_POLICY_PROFILE_IDS.includes(input.policy_profile_id) ||
    !COMPOSITION_BINDINGS.includes(input.composition_binding as (typeof COMPOSITION_BINDINGS)[number]) ||
    !isStrictTimestamp(input.now) ||
    !isStrictTimestamp(input.expires_at) ||
    Date.parse(input.expires_at) <= Date.parse(input.now) ||
    typeof input.create_replayed_event !== "function"
  ) {
    throw internalError();
  }
  normalizedAuditEvent(input.in_progress_event);
  normalizedAuditEvent(input.fingerprint_conflict_event);
  const record = {
    authorization_scope_id: input.authorization_scope_id,
    capability_id: input.capability_id,
    subject_id: input.subject_id,
    request_id: input.request_id,
    stage: input.stage,
    policy_profile_id: input.policy_profile_id,
    composition_binding: input.composition_binding
  };
  assertRequestRejectedEvent(
    input.in_progress_event,
    record,
    "idempotency_in_progress"
  );
  assertRequestRejectedEvent(
    input.fingerprint_conflict_event,
    record,
    "idempotency_conflict"
  );
}

function assertTransitionKey(
  authorizationScopeId: string,
  idempotencyKeyHmac: string,
  requestFingerprint: string,
  updatedAt: string
): void {
  if (
    !AUTHORIZATION_SCOPE_PATTERN.test(authorizationScopeId) ||
    !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKeyHmac) ||
    !FINGERPRINT_PATTERN.test(requestFingerprint) ||
    !isStrictTimestamp(updatedAt)
  ) {
    throw internalError();
  }
}

function decisionFromRecord(record: SandboxSecurityIdempotencyRecord): SandboxSecurityDecision {
  if (record.status !== "completed" || record.response_json === null) throw internalError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.response_json);
  } catch {
    throw internalError();
  }
  const decision = normalizeSandboxSecurityDecision(parsed);
  if (decision === null) throw internalError();
  return decision;
}

function deleteExpired(database: DatabaseSync, now: string, limit: 100 | 4096): number {
  const result = database
    .prepare(
      `DELETE FROM sandbox_security_idempotency_records
       WHERE rowid IN (
         SELECT rowid FROM sandbox_security_idempotency_records
         WHERE expires_at <= ?
         ORDER BY expires_at ASC, authorization_scope_id ASC, idempotency_key_hmac ASC
         LIMIT ?
       )`
    )
    .run(now, limit) as { changes?: number };
  return typeof result.changes === "number" ? result.changes : 0;
}

function updateStatus(
  database: DatabaseSync,
  input: Readonly<{
    record: SandboxSecurityIdempotencyRecord;
    status: "in_progress" | "interrupted";
    updated_at: string;
  }>
): void {
  database
    .prepare(
      `UPDATE sandbox_security_idempotency_records
       SET status = ?, response_json = NULL, updated_at = ?
       WHERE authorization_scope_id = ? AND idempotency_key_hmac = ?`
    )
    .run(
      input.status,
      input.updated_at,
      input.record.authorization_scope_id,
      input.record.idempotency_key_hmac
    );
}

function ensureRecordForTransition(
  database: DatabaseSync,
  authorizationScopeId: string,
  idempotencyKeyHmac: string,
  requestFingerprint: string
): SandboxSecurityIdempotencyRecord {
  const record = readRow(database, authorizationScopeId, idempotencyKeyHmac);
  if (
    record === null ||
    record.request_fingerprint !== requestFingerprint ||
    record.status !== "in_progress"
  ) {
    throw internalError();
  }
  return record;
}

export function createSqliteSandboxSecurityIdempotencyRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityIdempotencyRepository {
  if (input === null || typeof input !== "object" || input.database === undefined) {
    throw new TypeError("sandbox security idempotency database is required");
  }
  const { database } = input;

  return {
    claim(claimInput): SandboxSecurityIdempotencyClaimResult {
      assertClaimInput(claimInput);
      try {
        return database.transaction((sqlite) => {
          try {
            deleteExpired(sqlite, claimInput.now, 100);
          } catch {
            throw new SandboxSecurityClaimCleanupError();
          }

          let existing = readRow(
            sqlite,
            claimInput.authorization_scope_id,
            claimInput.idempotency_key_hmac
          );
          if (existing !== null && existing.expires_at <= claimInput.now) {
            try {
              sqlite
                .prepare(
                  `DELETE FROM sandbox_security_idempotency_records
                   WHERE authorization_scope_id = ? AND idempotency_key_hmac = ?`
                )
                .run(
                  claimInput.authorization_scope_id,
                  claimInput.idempotency_key_hmac
                );
            } catch {
              throw internalError();
            }
            existing = null;
          }
          if (existing === null) {
            sqlite
              .prepare(
                `INSERT INTO sandbox_security_idempotency_records(
                  authorization_scope_id, idempotency_key_hmac,
                  request_fingerprint, capability_id, subject_id, request_id,
                  stage, policy_profile_id, composition_binding, status,
                  response_json, created_at, updated_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', NULL, ?, ?, ?)`
              )
              .run(
                claimInput.authorization_scope_id,
                claimInput.idempotency_key_hmac,
                claimInput.request_fingerprint,
                claimInput.capability_id,
                claimInput.subject_id,
                claimInput.request_id,
                claimInput.stage,
                claimInput.policy_profile_id,
                claimInput.composition_binding,
                claimInput.now,
                claimInput.now,
                claimInput.expires_at
              );
            return { kind: "claimed" };
          }

          if (existing.request_fingerprint !== claimInput.request_fingerprint) {
            assertRequestRejectedEvent(
              claimInput.fingerprint_conflict_event,
              existing,
              "idempotency_conflict",
              { match_request_context: false }
            );
            insertAuditEvent(sqlite, claimInput.fingerprint_conflict_event);
            return { kind: "fingerprint_conflict" };
          }
          if (existing.status === "completed") {
            const response = decisionFromRecord(existing);
            const replayedEvent = claimInput.create_replayed_event(response);
            assertEvaluationEvent(replayedEvent, existing, response, "evaluation_replayed");
            insertAuditEvent(sqlite, replayedEvent);
            return { kind: "completed", response };
          }
          if (existing.status === "in_progress") {
            assertRequestRejectedEvent(
              claimInput.in_progress_event,
              existing,
              "idempotency_in_progress"
            );
            insertAuditEvent(sqlite, claimInput.in_progress_event);
            return { kind: "in_progress" };
          }
          updateStatus(sqlite, { record: existing, status: "in_progress", updated_at: claimInput.now });
          return { kind: "claimed" };
        });
      } catch (error) {
        if (error instanceof SandboxSecurityClaimCleanupError) throw error;
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    complete(completionInput): void {
      assertTransitionKey(
        completionInput.authorization_scope_id,
        completionInput.idempotency_key_hmac,
        completionInput.request_fingerprint,
        completionInput.updated_at
      );
      const normalizedDecision = normalizeSandboxSecurityDecision(completionInput.decision);
      if (normalizedDecision === null) throw internalError();
      const responseJson = JSON.stringify(normalizedDecision);
      if (
        Buffer.byteLength(responseJson, "utf8") < 2 ||
        Buffer.byteLength(responseJson, "utf8") > MAX_RESPONSE_BYTES
      ) {
        throw internalError();
      }
      try {
        database.transaction((sqlite) => {
          const record = ensureRecordForTransition(
            sqlite,
            completionInput.authorization_scope_id,
            completionInput.idempotency_key_hmac,
            completionInput.request_fingerprint
          );
          assertEvaluationEvent(
            completionInput.completed_event,
            record,
            normalizedDecision,
            "evaluation_completed"
          );
          sqlite
            .prepare(
              `UPDATE sandbox_security_idempotency_records
               SET status = 'completed', response_json = ?, updated_at = ?
               WHERE authorization_scope_id = ? AND idempotency_key_hmac = ?`
            )
            .run(
              responseJson,
              completionInput.updated_at,
              record.authorization_scope_id,
              record.idempotency_key_hmac
            );
          insertAuditEvent(sqlite, completionInput.completed_event);
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    interrupt(interruptionInput): void {
      assertTransitionKey(
        interruptionInput.authorization_scope_id,
        interruptionInput.idempotency_key_hmac,
        interruptionInput.request_fingerprint,
        interruptionInput.updated_at
      );
      try {
        database.transaction((sqlite) => {
          const record = ensureRecordForTransition(
            sqlite,
            interruptionInput.authorization_scope_id,
            interruptionInput.idempotency_key_hmac,
            interruptionInput.request_fingerprint
          );
          assertInterruptionEvent(interruptionInput.interrupted_event, record, [
            "engine_error",
            "persistence_error"
          ]);
          updateStatus(sqlite, { record, status: "interrupted", updated_at: interruptionInput.updated_at });
          insertAuditEvent(sqlite, interruptionInput.interrupted_event);
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    rejectConcurrency(rejectionInput: SandboxSecurityIdempotencyConcurrencyRejection): void {
      assertTransitionKey(
        rejectionInput.authorization_scope_id,
        rejectionInput.idempotency_key_hmac,
        rejectionInput.request_fingerprint,
        rejectionInput.updated_at
      );
      try {
        database.transaction((sqlite) => {
          const record = ensureRecordForTransition(
            sqlite,
            rejectionInput.authorization_scope_id,
            rejectionInput.idempotency_key_hmac,
            rejectionInput.request_fingerprint
          );
          assertRequestRejectedEvent(
            rejectionInput.rejection_event,
            record,
            "concurrency_limited"
          );
          updateStatus(sqlite, { record, status: "interrupted", updated_at: rejectionInput.updated_at });
          insertAuditEvent(sqlite, rejectionInput.rejection_event);
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    recoverInProgress(input): number {
      if (!isStrictTimestamp(input.now) || typeof input.create_event !== "function") {
        throw internalError();
      }
      try {
        return database.transaction((sqlite) => {
          const rows = sqlite
            .prepare(
              `SELECT authorization_scope_id, idempotency_key_hmac,
                request_fingerprint, capability_id, subject_id, request_id,
                stage, policy_profile_id, composition_binding, status,
                response_json, created_at, updated_at, expires_at
               FROM sandbox_security_idempotency_records
               WHERE status = 'in_progress'
               ORDER BY created_at ASC, authorization_scope_id ASC,
                idempotency_key_hmac ASC`
            )
            .all() as IdempotencyRow[];
          const records = rows.map((row) => {
            const record = normalizeRecord(row);
            if (record === null || record.status !== "in_progress") throw internalError();
            return record;
          });
          for (const record of records) {
            const event = input.create_event(record);
            assertInterruptionEvent(event, record, ["startup_recovery"]);
            updateStatus(sqlite, { record, status: "interrupted", updated_at: input.now });
            insertAuditEvent(sqlite, event);
          }
          return records.length;
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    cleanupExpired(now, limit): number {
      if (!isStrictTimestamp(now) || (limit !== 100 && limit !== 4096)) {
        throw internalError();
      }
      try {
        return database.transaction((sqlite) => deleteExpired(sqlite, now, limit));
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    }
  };
}

export function createSandboxSecurityIdempotencyMaintenance(input: Readonly<{
  repository: SandboxSecurityIdempotencyRepository;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityIdempotencyMaintenance {
  if (
    input === null ||
    typeof input !== "object" ||
    input.repository === undefined ||
    input.runtime === undefined ||
    input.audit_projector === undefined
  ) {
    throw new TypeError("sandbox security idempotency maintenance dependencies are required");
  }

  const startupNow = input.runtime.now();
  input.repository.recoverInProgress({
    now: startupNow,
    create_event: (record) =>
      input.audit_projector.evaluationInterrupted({
        event_id: input.runtime.nextAuditEventId(),
        occurred_at: input.runtime.now(),
        subject_id: record.subject_id,
        authorization_scope_id: record.authorization_scope_id,
        capability_id: record.capability_id,
        request_id: record.request_id,
        stage: record.stage,
        policy_profile_id: record.policy_profile_id,
        composition_binding: record.composition_binding,
        elapsed_ms: 0,
        interruption_code: "startup_recovery"
      })
  });
  input.repository.cleanupExpired(startupNow, 4096);

  let maintenanceState: "healthy" | "degraded" | "closed" = "healthy";
  let interval: Readonly<{ unref(): void; cancel(): void }> | null = null;

  function storageUnavailable(): never {
    throw createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
      audit_rejection_code: "storage_unavailable"
    });
  }

  function assertOpen(): void {
    if (maintenanceState === "closed") storageUnavailable();
  }

  function runCleanup(): void {
    assertOpen();
    try {
      input.repository.cleanupExpired(input.runtime.now(), 4096);
      if (maintenanceState !== "closed") maintenanceState = "healthy";
    } catch {
      if (maintenanceState !== "closed") maintenanceState = "degraded";
      storageUnavailable();
    }
  }

  const scheduledInterval = input.runtime.scheduleInterval(60 * 60 * 1000, () => {
    try {
      runCleanup();
    } catch {
      // The state transition is the observable result of timer failures.
    }
  });
  scheduledInterval.unref();
  interval = scheduledInterval;

  return {
    state: () => maintenanceState,

    assertEvaluationAvailable(): void {
      if (maintenanceState !== "healthy") storageUnavailable();
    },

    claim(claimInput): ReturnType<SandboxSecurityIdempotencyRepository["claim"]> {
      assertOpen();
      if (maintenanceState !== "healthy") storageUnavailable();
      try {
        return input.repository.claim(claimInput);
      } catch (error) {
        if (error instanceof SandboxSecurityClaimCleanupError) {
          maintenanceState = "degraded";
          storageUnavailable();
        }
        throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
      }
    },

    runHourlyCleanup(): void {
      runCleanup();
    },

    runPurgePreCleanup(): void {
      runCleanup();
    },

    close(): void {
      if (maintenanceState === "closed") return;
      maintenanceState = "closed";
      interval?.cancel();
      interval = null;
    }
  };
}
