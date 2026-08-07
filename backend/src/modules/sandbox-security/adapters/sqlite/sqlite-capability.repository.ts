import type { DatabaseSync } from "node:sqlite";

import { normalizeSandboxSecurityAuditEvent } from "../../../../../../shared/contracts/sandbox-security-api.ts";
import { normalizeSandboxSecurityEnforcementAuditEvent } from "../../../../../../shared/contracts/sandbox-security-enforcement-audit.ts";
import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  SANDBOX_SECURITY_STAGES
} from "../../../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityCapabilityScope
} from "../../../../../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityIssuedEvent,
  SandboxSecurityProductionCompositionBinding
} from "../../../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type {
  SandboxSecurityCapabilityRepository,
  SandboxSecurityEnforcementAuditCapabilityRepository
} from "../../ports/capability.repository.ts";
import type { SqliteSandboxSecurityDatabase } from "../../ports/sqlite-database.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../../sandbox-security.errors.ts";
import type {
  SandboxSecurityCapabilityPersistenceRecord,
  SandboxSecurityPrivateCapabilityPersistenceRecord
} from "../../sandbox-security.types.ts";
import type { SandboxSecurityEnforcementAuditCapabilityPersistenceRecord } from "../../dto/enforcement-audit-capability.ts";

const CAPABILITY_ID_PATTERN =
  /^capability:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const TOKEN_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const AUTHORIZATION_SCOPE_PATTERN = /^authscope:hmac-sha256:[0-9a-f]{64}$/;
const UTC_MILLISECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const CAPABILITY_SCOPES = [
  "sandbox_security:evaluate",
  "sandbox_security:audit:read"
] as const satisfies readonly SandboxSecurityCapabilityScope[];
const ENFORCEMENT_SCOPE = "sandbox_security:enforcement:audit:write" as const;
const COMPOSITION_BINDINGS = [
  "sandbox-security-production-composition.v1:rule_only",
  "sandbox-security-production-composition.v1:local",
  "sandbox-security-production-composition.v1:local_and_judge"
] as const satisfies readonly SandboxSecurityProductionCompositionBinding[];
const ENFORCEMENT_EVENT_SCHEMA = "sandbox-security-enforcement-audit-event.v1" as const;
const LEGACY_EVENT_SCHEMA = "sandbox-security-audit-event.v1" as const;

type PlainRecord = Record<string, unknown>;

function isOwnEnumerableDataRecord(value: unknown): value is PlainRecord {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is PlainRecord {
  if (!isOwnEnumerableDataRecord(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isStrictUtcMillisecondTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeCatalogArray<const T extends readonly string[]>(
  value: unknown,
  catalog: T,
  allowEmpty: boolean
): T[number][] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return null;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    (!allowEmpty && lengthDescriptor.value < 1)
  ) {
    return null;
  }
  const supplied = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return null;
    }
    const item = descriptor.value;
    if (typeof item !== "string" || !catalog.includes(item) || supplied.has(item)) {
      return null;
    }
    supplied.add(item);
  }
  return catalog.filter((item) => supplied.has(item)) as T[number][];
}

function normalizeScopeSeed(value: unknown): Uint8Array | null {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) return null;
  return new Uint8Array(value);
}

function normalizePersistenceRecord(
  value: unknown,
  expectedDigest: `sha256:${string}` | null = null
): SandboxSecurityCapabilityPersistenceRecord | null {
  const keys = [
    "capability_id",
    "subject_id",
    "token_digest",
    "scope_seed",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "issued_at",
    "expires_at",
    "revoked_at"
  ] as const;
  if (!hasExactKeys(value, keys)) return null;
  if (
    typeof value.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value.capability_id) ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    typeof value.token_digest !== "string" ||
    !TOKEN_DIGEST_PATTERN.test(value.token_digest) ||
    (expectedDigest !== null && value.token_digest !== expectedDigest) ||
    !isStrictUtcMillisecondTimestamp(value.issued_at) ||
    !isStrictUtcMillisecondTimestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.issued_at) ||
    (value.revoked_at !== null && !isStrictUtcMillisecondTimestamp(value.revoked_at)) ||
    (value.revoked_at !== null && Date.parse(value.revoked_at) < Date.parse(value.issued_at))
  ) {
    return null;
  }
  const scopeSeed = normalizeScopeSeed(value.scope_seed);
  const scopes = normalizeCatalogArray(value.scopes, CAPABILITY_SCOPES, false);
  const stages = normalizeCatalogArray(value.allowed_stages, SANDBOX_SECURITY_STAGES, true);
  const profiles = normalizeCatalogArray(
    value.allowed_policy_profile_ids,
    SANDBOX_SECURITY_POLICY_PROFILE_IDS,
    true
  );
  if (scopeSeed === null || scopes === null || stages === null || profiles === null) {
    return null;
  }
  const evaluate = scopes.includes("sandbox_security:evaluate");
  if (evaluate !== (stages.length > 0 && profiles.length > 0)) return null;
  if (!evaluate && (stages.length !== 0 || profiles.length !== 0)) return null;
  return {
    capability_id: value.capability_id,
    subject_id: value.subject_id,
    token_digest: value.token_digest as `sha256:${string}`,
    scope_seed: scopeSeed,
    scopes,
    allowed_stages: stages,
    allowed_policy_profile_ids: profiles,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at
  };
}

function normalizeEnforcementPersistenceRecord(
  value: unknown,
  expectedDigest: `sha256:${string}` | null = null
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord | null {
  const keys = [
    "capability_id",
    "subject_id",
    "token_digest",
    "scope_seed",
    "scopes",
    "allowed_stages",
    "allowed_policy_profile_ids",
    "composition_binding",
    "issued_at",
    "expires_at",
    "revoked_at"
  ] as const;
  if (!hasExactKeys(value, keys)) return null;
  if (
    typeof value.capability_id !== "string" ||
    !CAPABILITY_ID_PATTERN.test(value.capability_id) ||
    typeof value.subject_id !== "string" ||
    !SUBJECT_PATTERN.test(value.subject_id) ||
    typeof value.token_digest !== "string" ||
    !TOKEN_DIGEST_PATTERN.test(value.token_digest) ||
    (expectedDigest !== null && value.token_digest !== expectedDigest) ||
    !(value.scope_seed instanceof Uint8Array) ||
    value.scope_seed.byteLength !== 32 ||
    typeof value.composition_binding !== "string" ||
    !COMPOSITION_BINDINGS.includes(value.composition_binding as SandboxSecurityProductionCompositionBinding) ||
    !isStrictUtcMillisecondTimestamp(value.issued_at) ||
    !isStrictUtcMillisecondTimestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.issued_at) ||
    (value.revoked_at !== null && !isStrictUtcMillisecondTimestamp(value.revoked_at)) ||
    (value.revoked_at !== null && Date.parse(value.revoked_at) < Date.parse(value.issued_at))
  ) {
    return null;
  }
  const scopes = normalizeCatalogArray(value.scopes, [ENFORCEMENT_SCOPE] as const, false);
  const stages = normalizeCatalogArray(value.allowed_stages, SANDBOX_SECURITY_STAGES, false);
  const profiles = normalizeCatalogArray(
    value.allowed_policy_profile_ids,
    SANDBOX_SECURITY_POLICY_PROFILE_IDS,
    false
  );
  if (
    scopes === null ||
    scopes.length !== 1 ||
    stages === null ||
    stages.length !== SANDBOX_SECURITY_STAGES.length ||
    stages.some((stage, index) => stage !== SANDBOX_SECURITY_STAGES[index]) ||
    profiles === null ||
    profiles.length !== 1
  ) {
    return null;
  }
  return {
    capability_id: value.capability_id,
    subject_id: value.subject_id,
    token_digest: value.token_digest as `sha256:${string}`,
    scope_seed: new Uint8Array(value.scope_seed),
    scopes: [ENFORCEMENT_SCOPE],
    allowed_stages: [...SANDBOX_SECURITY_STAGES],
    allowed_policy_profile_ids: [profiles[0]!],
    composition_binding: value.composition_binding as SandboxSecurityProductionCompositionBinding,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at
  };
}

function cloneRecord(
  record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
): SandboxSecurityCapabilityPersistenceRecord {
  return {
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    token_digest: record.token_digest,
    scope_seed: new Uint8Array(record.scope_seed),
    scopes: [...record.scopes],
    allowed_stages: [...record.allowed_stages],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids],
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function cloneEnforcementRecord(
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord {
  return {
    capability_id: record.capability_id,
    subject_id: record.subject_id,
    token_digest: record.token_digest,
    scope_seed: new Uint8Array(record.scope_seed),
    scopes: [ENFORCEMENT_SCOPE],
    allowed_stages: [...SANDBOX_SECURITY_STAGES],
    allowed_policy_profile_ids: [...record.allowed_policy_profile_ids] as [typeof SANDBOX_SECURITY_POLICY_PROFILE_IDS[number]],
    composition_binding: record.composition_binding,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at
  };
}

function normalizeInputRecord(
  value: Readonly<SandboxSecurityCapabilityPersistenceRecord>
): SandboxSecurityCapabilityPersistenceRecord {
  const normalized = normalizePersistenceRecord(value);
  if (normalized === null || normalized.revoked_at !== null) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return normalized;
}

function normalizedEvent(value: unknown): SandboxSecurityAuditEvent {
  const normalized = normalizeSandboxSecurityAuditEvent(value);
  if (normalized === null) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return normalized;
}

function normalizedEnforcementCapabilityIssuedEvent(
  value: unknown
): SandboxSecurityEnforcementAuditCapabilityIssuedEvent {
  const normalized = normalizeSandboxSecurityEnforcementAuditEvent(value);
  if (normalized === null || normalized.event_type !== "capability_issued") {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return normalized;
}

function assertCapabilityIssuedEvent(
  event: SandboxSecurityAuditEvent,
  record: Readonly<SandboxSecurityCapabilityPersistenceRecord>
): Extract<SandboxSecurityAuditEvent, { event_type: "capability_issued" }> {
  if (
    event.event_type !== "capability_issued" ||
    event.subject_id !== record.subject_id ||
    event.capability_id !== record.capability_id ||
    event.authorization_scope_id === null ||
    !AUTHORIZATION_SCOPE_PATTERN.test(event.authorization_scope_id) ||
    event.issued_at !== record.issued_at ||
    event.expires_at !== record.expires_at ||
    event.scopes.length !== record.scopes.length ||
    event.scopes.some((scope, index) => scope !== record.scopes[index]) ||
    event.allowed_stages.length !== record.allowed_stages.length ||
    event.allowed_stages.some((stage, index) => stage !== record.allowed_stages[index]) ||
    event.allowed_policy_profile_ids.length !== record.allowed_policy_profile_ids.length ||
    event.allowed_policy_profile_ids.some(
      (profile, index) => profile !== record.allowed_policy_profile_ids[index]
    )
  ) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return event;
}

function assertEnforcementCapabilityIssuedEvent(
  event: SandboxSecurityEnforcementAuditCapabilityIssuedEvent,
  record: Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord>
): SandboxSecurityEnforcementAuditCapabilityIssuedEvent {
  if (
    event.event_id.length === 0 ||
    event.subject_id !== record.subject_id ||
    event.capability_id !== record.capability_id ||
    !AUTHORIZATION_SCOPE_PATTERN.test(event.authorization_scope_id) ||
    event.scopes.length !== 1 ||
    event.scopes[0] !== ENFORCEMENT_SCOPE ||
    event.allowed_stages.length !== SANDBOX_SECURITY_STAGES.length ||
    event.allowed_stages.some((stage, index) => stage !== SANDBOX_SECURITY_STAGES[index]) ||
    event.allowed_policy_profile_ids.length !== 1 ||
    event.allowed_policy_profile_ids[0] !== record.allowed_policy_profile_ids[0] ||
    event.composition_binding !== record.composition_binding ||
    event.occurred_at !== record.issued_at ||
    event.issued_at !== record.issued_at ||
    event.expires_at !== record.expires_at
  ) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return event;
}

function assertCapabilityRevokedEvent(
  event: SandboxSecurityAuditEvent,
  record: Readonly<Pick<
    SandboxSecurityCapabilityPersistenceRecord,
    "subject_id" | "capability_id" | "revoked_at"
  >>
): Extract<SandboxSecurityAuditEvent, { event_type: "capability_revoked" }> {
  if (
    event.event_type !== "capability_revoked" ||
    event.subject_id !== record.subject_id ||
    event.capability_id !== record.capability_id ||
    event.authorization_scope_id === null ||
    !AUTHORIZATION_SCOPE_PATTERN.test(event.authorization_scope_id) ||
    record.revoked_at === null ||
    event.revoked_at !== record.revoked_at
  ) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  return event;
}

function insertAuditEvent(database: DatabaseSync, event: SandboxSecurityAuditEvent): void {
  const normalized = normalizedEvent(event);
  if (
    normalized.authorization_scope_id === null ||
    normalized.capability_id === null ||
    !AUTHORIZATION_SCOPE_PATTERN.test(normalized.authorization_scope_id)
  ) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  const eventJson = JSON.stringify(normalized);
  if (Buffer.byteLength(eventJson, "utf8") < 2 || Buffer.byteLength(eventJson, "utf8") > 65536) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  database
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_schema, event_id, event_type, visibility_subject_id, authorization_scope_id,
        capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      LEGACY_EVENT_SCHEMA,
      normalized.event_id,
      normalized.event_type,
      normalized.subject_id,
      normalized.authorization_scope_id,
      normalized.capability_id,
      normalized.occurred_at,
      eventJson
    );
}

function insertEnforcementCapabilityIssuedEvent(
  database: DatabaseSync,
  event: SandboxSecurityEnforcementAuditCapabilityIssuedEvent
): void {
  const eventJson = JSON.stringify(event);
  if (
    typeof eventJson !== "string" ||
    Buffer.byteLength(eventJson, "utf8") < 2 ||
    Buffer.byteLength(eventJson, "utf8") > 65536
  ) {
    throw createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
  }
  database
    .prepare(
      `INSERT INTO sandbox_security_audit_events(
        event_schema, event_id, event_type, visibility_subject_id,
        authorization_scope_id, capability_id, occurred_at, event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ENFORCEMENT_EVENT_SCHEMA,
      event.event_id,
      event.event_type,
      event.subject_id,
      event.authorization_scope_id,
      event.capability_id,
      event.occurred_at,
      eventJson
    );
}

interface CapabilityRow {
  capability_id?: unknown;
  subject_id?: unknown;
  token_digest?: unknown;
  scope_seed?: unknown;
  issued_at?: unknown;
  expires_at?: unknown;
  revoked_at?: unknown;
}

function readEnforcementComposition(
  database: DatabaseSync,
  capabilityId: string
): SandboxSecurityProductionCompositionBinding | null {
  const row = database
    .prepare(
      `SELECT event_schema, event_json
       FROM sandbox_security_audit_events
       WHERE event_schema = ? AND event_type = 'capability_issued'
         AND capability_id = ?
       ORDER BY occurred_at ASC, event_id ASC
       LIMIT 1`
    )
    .get(ENFORCEMENT_EVENT_SCHEMA, capabilityId) as {
      event_schema?: unknown;
      event_json?: unknown;
    } | undefined;
  if (
    row === undefined ||
    row.event_schema !== ENFORCEMENT_EVENT_SCHEMA ||
    typeof row.event_json !== "string"
  ) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.event_json);
  } catch {
    throw internalError();
  }
  const event = normalizedEnforcementCapabilityIssuedEvent(parsed);
  return COMPOSITION_BINDINGS.includes(event.composition_binding)
    ? event.composition_binding
    : null;
}

function readRecordByRow(
  database: DatabaseSync,
  row: CapabilityRow | undefined,
  expectedDigest: `sha256:${string}` | null
): SandboxSecurityPrivateCapabilityPersistenceRecord | null {
  if (row === undefined) return null;
  const capabilityId = row.capability_id;
  if (typeof capabilityId !== "string") return null;
  const scopeRows = database
    .prepare(
      "SELECT scope FROM sandbox_security_capability_scopes WHERE capability_id = ?"
    )
    .all(capabilityId) as Array<{ scope?: unknown }>;
  const stageRows = database
    .prepare(
      "SELECT stage FROM sandbox_security_capability_stages WHERE capability_id = ?"
    )
    .all(capabilityId) as Array<{ stage?: unknown }>;
  const profileRows = database
    .prepare(
      "SELECT policy_profile_id FROM sandbox_security_capability_profiles WHERE capability_id = ?"
    )
    .all(capabilityId) as Array<{ policy_profile_id?: unknown }>;
  const candidate = {
    capability_id: row.capability_id,
    subject_id: row.subject_id,
    token_digest: row.token_digest,
    scope_seed: row.scope_seed,
    scopes: scopeRows.map((child) => child.scope),
    allowed_stages: stageRows.map((child) => child.stage),
    allowed_policy_profile_ids: profileRows.map((child) => child.policy_profile_id),
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at
  };
  const hasPrivateScope = scopeRows.some((child) => child.scope === ENFORCEMENT_SCOPE);
  if (hasPrivateScope) {
    const compositionBinding = readEnforcementComposition(database, capabilityId);
    if (compositionBinding === null) return null;
    return normalizeEnforcementPersistenceRecord(
      { ...candidate, composition_binding: compositionBinding },
      expectedDigest
    );
  }
  return normalizePersistenceRecord(candidate, expectedDigest);
}

function readByDigest(
  database: DatabaseSync,
  tokenDigest: `sha256:${string}`
): SandboxSecurityPrivateCapabilityPersistenceRecord | null {
  const row = database
    .prepare(
      `SELECT capability_id, subject_id, token_digest, scope_seed,
        issued_at, expires_at, revoked_at
       FROM sandbox_security_capabilities
       WHERE token_digest = ?`
    )
    .get(tokenDigest) as CapabilityRow | undefined;
  return readRecordByRow(database, row, tokenDigest);
}

function readPublicByDigest(
  database: DatabaseSync,
  tokenDigest: `sha256:${string}`
): SandboxSecurityCapabilityPersistenceRecord | null {
  const record = readByDigest(database, tokenDigest);
  return record !== null && !("composition_binding" in record) ? record : null;
}

function readEnforcementByDigest(
  database: DatabaseSync,
  tokenDigest: `sha256:${string}`
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord | null {
  const record = readByDigest(database, tokenDigest);
  return record !== null && "composition_binding" in record ? record : null;
}

function readById(
  database: DatabaseSync,
  capabilityId: string
): SandboxSecurityPrivateCapabilityPersistenceRecord | null {
  const row = database
    .prepare(
      `SELECT capability_id, subject_id, token_digest, scope_seed,
        issued_at, expires_at, revoked_at
       FROM sandbox_security_capabilities
       WHERE capability_id = ?`
    )
    .get(capabilityId) as CapabilityRow | undefined;
  return readRecordByRow(database, row, null);
}

function readPublicById(
  database: DatabaseSync,
  capabilityId: string
): SandboxSecurityCapabilityPersistenceRecord | null {
  const record = readById(database, capabilityId);
  return record !== null && !("composition_binding" in record) ? record : null;
}

function readEnforcementById(
  database: DatabaseSync,
  capabilityId: string
): SandboxSecurityEnforcementAuditCapabilityPersistenceRecord | null {
  const record = readById(database, capabilityId);
  return record !== null && "composition_binding" in record ? record : null;
}

function internalError(): SandboxSecurityServiceError {
  return createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_INTERNAL_ERROR" });
}

export function createSqliteSandboxSecurityCapabilityRepository(input: Readonly<{
  database: SqliteSandboxSecurityDatabase;
}>): SandboxSecurityCapabilityRepository & SandboxSecurityEnforcementAuditCapabilityRepository {
  if (
    input === null ||
    typeof input !== "object" ||
    input.database === null ||
    typeof input.database !== "object" ||
    typeof input.database.transaction !== "function" ||
    typeof input.database.read !== "function"
  ) {
    throw new TypeError("Invalid sandbox security capability repository input");
  }

  const database = input.database;
  const repository: SandboxSecurityCapabilityRepository & SandboxSecurityEnforcementAuditCapabilityRepository = {
    issueEnforcementAuditWithAudit(record, event): void {
      let normalizedRecord: SandboxSecurityEnforcementAuditCapabilityPersistenceRecord;
      let normalizedIssuedEvent: SandboxSecurityEnforcementAuditCapabilityIssuedEvent;
      try {
        const normalizedCandidate = normalizeEnforcementPersistenceRecord(record);
        if (normalizedCandidate === null || normalizedCandidate.revoked_at !== null) {
          throw internalError();
        }
        normalizedRecord = normalizedCandidate;
        normalizedIssuedEvent = assertEnforcementCapabilityIssuedEvent(
          normalizedEnforcementCapabilityIssuedEvent(event),
          normalizedRecord
        );
        database.transaction((sqlite) => {
          sqlite
            .prepare(
              `INSERT INTO sandbox_security_capabilities(
                capability_id, subject_id, token_digest, scope_seed,
                issued_at, expires_at, revoked_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              normalizedRecord.capability_id,
              normalizedRecord.subject_id,
              normalizedRecord.token_digest,
              Buffer.from(normalizedRecord.scope_seed),
              normalizedRecord.issued_at,
              normalizedRecord.expires_at,
              normalizedRecord.revoked_at
            );
          for (const scope of normalizedRecord.scopes) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, scope);
          }
          for (const stage of normalizedRecord.allowed_stages) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, stage);
          }
          for (const profile of normalizedRecord.allowed_policy_profile_ids) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, profile);
          }
          insertEnforcementCapabilityIssuedEvent(sqlite, normalizedIssuedEvent);
        });
      } catch (error) {
        if (isSandboxSecurityServiceError(error)) throw error;
        throw internalError();
      }
    },

    issueWithAudit(record, event): void {
      let normalizedRecord: SandboxSecurityCapabilityPersistenceRecord;
      let normalizedIssuedEvent: Extract<
        SandboxSecurityAuditEvent,
        { event_type: "capability_issued" }
      >;
      try {
        normalizedRecord = normalizeInputRecord(record);
        normalizedIssuedEvent = assertCapabilityIssuedEvent(normalizedEvent(event), normalizedRecord);
        database.transaction((sqlite) => {
          sqlite
            .prepare(
              `INSERT INTO sandbox_security_capabilities(
                capability_id, subject_id, token_digest, scope_seed,
                issued_at, expires_at, revoked_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              normalizedRecord.capability_id,
              normalizedRecord.subject_id,
              normalizedRecord.token_digest,
              Buffer.from(normalizedRecord.scope_seed),
              normalizedRecord.issued_at,
              normalizedRecord.expires_at,
              normalizedRecord.revoked_at
            );
          for (const scope of normalizedRecord.scopes) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_scopes(capability_id, scope) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, scope);
          }
          for (const stage of normalizedRecord.allowed_stages) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_stages(capability_id, stage) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, stage);
          }
          for (const profile of normalizedRecord.allowed_policy_profile_ids) {
            sqlite
              .prepare(
                "INSERT INTO sandbox_security_capability_profiles(capability_id, policy_profile_id) VALUES (?, ?)"
              )
              .run(normalizedRecord.capability_id, profile);
          }
          insertAuditEvent(sqlite, normalizedIssuedEvent);
        });
      } catch {
        throw internalError();
      }
    },

    findEnforcementAuditByTokenDigest(tokenDigest): Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord> | null {
      if (typeof tokenDigest !== "string" || !TOKEN_DIGEST_PATTERN.test(tokenDigest)) {
        return null;
      }
      try {
        const record = database.read((sqlite) => readEnforcementByDigest(sqlite, tokenDigest));
        if (record === null) return null;
        return cloneEnforcementRecord(record);
      } catch {
        throw internalError();
      }
    },

    findByTokenDigest(tokenDigest): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null {
      if (typeof tokenDigest !== "string" || !TOKEN_DIGEST_PATTERN.test(tokenDigest)) {
        return null;
      }
      try {
        const record = database.read((sqlite) => readPublicByDigest(sqlite, tokenDigest));
        if (record === null) return null;
        return cloneRecord(record);
      } catch {
        throw internalError();
      }
    },

    revokeEnforcementAudit(input): Readonly<SandboxSecurityEnforcementAuditCapabilityPersistenceRecord> | null {
      if (
        input === null ||
        typeof input !== "object" ||
        typeof input.capability_id !== "string" ||
        !CAPABILITY_ID_PATTERN.test(input.capability_id) ||
        !isStrictUtcMillisecondTimestamp(input.revoked_at)
      ) {
        throw internalError();
      }
      if (!COMPOSITION_BINDINGS.includes(input.composition_binding)) {
        throw internalError();
      }
      try {
        const result = database.transaction((sqlite) => {
          const current = readEnforcementById(sqlite, input.capability_id);
          if (current === null) return null;
          if (current.composition_binding !== input.composition_binding) {
            throw internalError();
          }
          if (current.revoked_at !== null) {
            return cloneEnforcementRecord(current);
          }
          const next = normalizeEnforcementPersistenceRecord(
            { ...current, revoked_at: input.revoked_at },
            current.token_digest
          );
          if (next === null) throw internalError();
          sqlite
            .prepare(
              "UPDATE sandbox_security_capabilities SET revoked_at = ? WHERE capability_id = ? AND revoked_at IS NULL"
            )
            .run(next.revoked_at, next.capability_id);
          return cloneEnforcementRecord(next);
        });
        return result;
      } catch (error) {
        if (
          isSandboxSecurityServiceError(error) &&
          error.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
        ) {
          throw error;
        }
        throw internalError();
      }
    },

    revokeWithAudit(input): Readonly<SandboxSecurityCapabilityPersistenceRecord> | null {
      if (
        input === null ||
        typeof input !== "object" ||
        typeof input.capability_id !== "string" ||
        !CAPABILITY_ID_PATTERN.test(input.capability_id) ||
        !isStrictUtcMillisecondTimestamp(input.revoked_at) ||
        typeof input.create_event !== "function"
      ) {
        throw internalError();
      }
      try {
        const result = database.transaction((sqlite) => {
          const current = readPublicById(sqlite, input.capability_id);
          if (current === null) return null;
          if (current.revoked_at !== null) return cloneRecord(current);
          const next = normalizePersistenceRecord(
            { ...current, revoked_at: input.revoked_at },
            current.token_digest
          );
          if (next === null) throw internalError();
          const event = assertCapabilityRevokedEvent(
            normalizedEvent(input.create_event(cloneRecord(next))),
            next
          );
          sqlite
            .prepare(
              "UPDATE sandbox_security_capabilities SET revoked_at = ? WHERE capability_id = ? AND revoked_at IS NULL"
            )
            .run(next.revoked_at, next.capability_id);
          insertAuditEvent(sqlite, event);
          return cloneRecord(next);
        });
        return result;
      } catch (error) {
        if (
          isSandboxSecurityServiceError(error) &&
          error.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
        ) {
          throw error;
        }
        throw internalError();
      }
    }
  };
  return repository;
}
