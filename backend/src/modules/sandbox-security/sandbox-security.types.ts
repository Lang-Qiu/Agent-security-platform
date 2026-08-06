import type {
  SandboxSecurityEvaluationRequest
} from "../../../../engines/sandbox/src/security/index.ts";
import type {
  SandboxSecurityDecision,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRequest,
  SandboxSecurityStage
} from "../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityAuditEvent,
  SandboxSecurityAuditPage,
  SandboxSecurityCapabilityScope
} from "../../../../shared/types/sandbox-security-api.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityScope,
  SandboxSecurityProductionCompositionBinding
} from "../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type {
  OpenClawEnforcementAuditAck,
  SandboxSecurityEnforcementAuditRequest
} from "../../../../shared/types/sandbox-security-enforcement-audit.ts";
import type {
  SandboxSecurityEnforcementAuditCapabilityIssueRequest,
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord,
  SandboxSecurityEnforcementAuditAuthorizedCapability
} from "./dto/enforcement-audit-capability.ts";

export type {
  SandboxSecurityAuditEvent,
  SandboxSecurityAuditPage,
  SandboxSecurityCapabilityScope,
  SandboxSecurityEvaluationRequest,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRequest,
  SandboxSecurityStage,
  SandboxSecurityDecision
};
export type {
  SandboxSecurityEnforcementAuditCapabilityIssueRequest,
  SandboxSecurityEnforcementAuditCapabilityIssueResult,
  SandboxSecurityEnforcementAuditCapabilityPersistenceRecord,
  SandboxSecurityEnforcementAuditAuthorizedCapability
};

export type SandboxSecurityPrivateCapabilityScope =
  | SandboxSecurityCapabilityScope
  | SandboxSecurityEnforcementAuditCapabilityScope;

export interface SandboxSecurityEnforcementAuditCapabilityRecord {
  schema_version:
    "sandbox-security-enforcement-audit-capability-record.v1";
  capability_id: string;
  subject_id: string;
  scopes: [SandboxSecurityEnforcementAuditCapabilityScope];
  allowed_stages: ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: [SandboxSecurityPolicyProfileId];
  composition_binding: SandboxSecurityProductionCompositionBinding;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export type SandboxSecurityProductionMode =
  | "rule_only"
  | "local"
  | "local_and_judge";

export interface SandboxSecurityAuditCursorFields {
  subject_id: string;
  authorization_scope_id: string;
  occurred_at: string;
  event_id: string;
}

export interface SandboxSecurityAuditPurgeResult {
  schema_version: "sandbox-security-audit-purge-result.v1";
  retention_days: 90;
  deleted_count: number;
  has_more: boolean;
}

export interface SandboxSecurityHmacService {
  deploymentKeyId(): string;
  authorizationScopeId(
    scopeSeed: Uint8Array,
    productionMode: SandboxSecurityProductionMode
  ): string;
  idempotencyKeyHmac(idempotencyKey: string): `idem-key:hmac-sha256:${string}`;
  fingerprintCanonicalBytes(
    canonicalBytes: Uint8Array
  ): `hmac-sha256:${string}`;
  encodeAuditCursor(input: Readonly<SandboxSecurityAuditCursorFields>): string;
  decodeAuditCursor(
    cursor: string,
    expected: Readonly<{
      subject_id: string;
      authorization_scope_id: string;
    }>
  ): Readonly<SandboxSecurityAuditCursorFields> | null;
}

export interface SandboxSecurityCapabilityAuditIdentity {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export type SandboxSecurityCapabilityAuthenticationResult =
  | Readonly<{
      kind: "authorized";
      capability: SandboxSecurityAuthorizedCapability;
    }>
  | Readonly<{
      kind: "known_denied";
      rejection_code: "capability_expired" | "capability_revoked";
      audit_identity: SandboxSecurityCapabilityAuditIdentity;
    }>
  | Readonly<{ kind: "unknown" }>;

export interface SandboxSecurityCapabilityAuthenticator {
  authenticateToken(token: string): SandboxSecurityCapabilityAuthenticationResult;
  requireScope(
    capability: SandboxSecurityAuthorizedCapability,
    scope: SandboxSecurityCapabilityScope
  ): void;
  requireEvaluationGrant(
    capability: SandboxSecurityAuthorizedCapability,
    submission: SandboxSecurityRequest
  ): void;
  authenticateAdministrator(token: string): void;
}

export type SandboxSecurityLimitResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retry_after_seconds: number }>;

export interface SandboxSecurityTokenBucket {
  consume(monotonicNowMs: number): SandboxSecurityLimitResult;
}

export interface SandboxSecurityEngineConcurrencyLimiter {
  tryAcquire(): (() => void) | null;
  activeCount(): number;
}

export interface SandboxSecurityCapabilityLimiterRegistry {
  consume(
    capability: Readonly<SandboxSecurityAuthorizedCapability>
  ): SandboxSecurityLimitResult;
  remove(capabilityId: string): void;
  size(): number;
}

export interface SandboxSecurityIdempotencyRecord {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  capability_id: string;
  subject_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  status: "in_progress" | "completed" | "interrupted";
  response_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface SandboxSecurityIdempotencyClaim {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  capability_id: string;
  subject_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  now: string;
  expires_at: string;
  in_progress_event: Readonly<SandboxSecurityAuditEvent>;
  fingerprint_conflict_event: Readonly<SandboxSecurityAuditEvent>;
  create_replayed_event(
    decision: Readonly<SandboxSecurityDecision>
  ): Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyCompletion {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  decision: Readonly<SandboxSecurityDecision>;
  completed_event: Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyInterruption {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  interrupted_event: Readonly<SandboxSecurityAuditEvent>;
}

export interface SandboxSecurityIdempotencyConcurrencyRejection {
  authorization_scope_id: string;
  idempotency_key_hmac: `idem-key:hmac-sha256:${string}`;
  request_fingerprint: `hmac-sha256:${string}`;
  updated_at: string;
  rejection_event: Readonly<SandboxSecurityAuditEvent>;
}

export type SandboxSecurityIdempotencyClaimResult =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "completed"; response: SandboxSecurityDecision }>
  | Readonly<{ kind: "in_progress" }>
  | Readonly<{ kind: "fingerprint_conflict" }>;

export interface SandboxSecurityCapabilityPersistenceRecord {
  capability_id: string;
  subject_id: string;
  token_digest: `sha256:${string}`;
  scope_seed: Uint8Array;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SandboxSecurityCapabilityIssueRequest {
  schema_version: "sandbox-security-capability-issue-request.v1";
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  ttl_seconds?: number;
}

export interface SandboxSecurityNormalizedCapabilityIssueRequest
  extends Omit<SandboxSecurityCapabilityIssueRequest, "ttl_seconds"> {
  ttl_seconds: number;
}

export interface SandboxSecurityCapabilityIssueResult {
  schema_version: "sandbox-security-capability-issue-result.v1";
  capability_id: string;
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  bearer_token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: null;
}

export interface SandboxSecurityCapabilityPublicRecord {
  schema_version: "sandbox-security-capability-record.v1";
  capability_id: string;
  subject_id: string;
  scopes: SandboxSecurityCapabilityScope[];
  allowed_stages: SandboxSecurityStage[];
  allowed_policy_profile_ids: SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SandboxSecurityAuthorizedCapability {
  capability_id: string;
  subject_id: string;
  authorization_scope_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export type SandboxSecurityPrivateCapabilityPersistenceRecord =
  | SandboxSecurityCapabilityPersistenceRecord
  | SandboxSecurityEnforcementAuditCapabilityPersistenceRecord;

export type SandboxSecurityPrivateAuthorizedCapability =
  | SandboxSecurityAuthorizedCapability
  | SandboxSecurityEnforcementAuditAuthorizedCapability;

export type SandboxSecurityEnforcementAuditCapabilityAuthenticationResult =
  | Readonly<{
      kind: "authorized";
      capability: SandboxSecurityEnforcementAuditAuthorizedCapability;
    }>
  | Readonly<{
      kind: "known_denied";
      rejection_code: "capability_expired" | "capability_revoked";
      audit_identity: SandboxSecurityEnforcementAuditAuthorizedCapability;
    }>
  | Readonly<{ kind: "unknown" }>;

export interface SandboxSecurityEnforcementAuditAuthenticator {
  authenticateEnforcementAuditToken(
    token: string
  ): SandboxSecurityEnforcementAuditCapabilityAuthenticationResult;
  requireEnforcementAuditGrant(
    capability: SandboxSecurityEnforcementAuditAuthorizedCapability,
    context: Readonly<{
      stage: SandboxSecurityStage;
      policy_profile_id: SandboxSecurityPolicyProfileId;
      composition_binding: SandboxSecurityProductionCompositionBinding;
    }>
  ): SandboxSecurityEnforcementAuditAuthorizedCapability;
}

export interface SandboxSecurityEvaluationAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  composition_binding: string;
  elapsed_ms: number;
  decision: Readonly<SandboxSecurityDecision>;
}

export interface SandboxSecurityInterruptionAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  request_id: string;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  composition_binding: string;
  elapsed_ms: number;
  interruption_code: "engine_error" | "persistence_error" | "startup_recovery";
}

export type SandboxSecurityAuditRejectionCode =
  | "capability_expired"
  | "capability_revoked"
  | "scope_forbidden"
  | "stage_forbidden"
  | "profile_forbidden"
  | "capability_rate_limited"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "concurrency_limited"
  | "storage_unavailable"
  | "invalid_request"
  | "body_too_large"
  | "body_timeout"
  | "unsupported_media_type";

export interface SandboxSecurityRejectionAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  route_id: "evaluation" | "audit_read";
  request_id: string | null;
  stage: SandboxSecurityStage | null;
  policy_profile_id: SandboxSecurityPolicyProfileId | null;
  composition_binding: string;
  elapsed_ms: number;
  rejection_code: SandboxSecurityAuditRejectionCode;
}

export interface SandboxSecurityCapabilityIssuedAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  scopes: readonly SandboxSecurityCapabilityScope[];
  allowed_stages: readonly SandboxSecurityStage[];
  allowed_policy_profile_ids: readonly SandboxSecurityPolicyProfileId[];
  issued_at: string;
  expires_at: string;
}

export interface SandboxSecurityCapabilityRevokedAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  revoked_at: string;
}

export interface SandboxSecurityAuditReadAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: string;
  authorization_scope_id: string;
  capability_id: string;
  returned_count: number;
  next_cursor_present: boolean;
  elapsed_ms: number;
}

export interface SandboxSecurityAuditPurgeAuditInput {
  event_id: string;
  occurred_at: string;
  subject_id: "system:bootstrap-admin";
  retention_days: 90;
  deleted_count: number;
  has_more: boolean;
  elapsed_ms: number;
}

export interface SandboxSecurityCapabilityService {
  issue(
    request: Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>
  ): Readonly<SandboxSecurityCapabilityIssueResult>;
  issueEnforcementAudit(
    request: Readonly<SandboxSecurityEnforcementAuditCapabilityIssueRequest>
  ): Readonly<SandboxSecurityEnforcementAuditCapabilityIssueResult>;
  revoke(
    capabilityId: string
  ): Readonly<SandboxSecurityCapabilityPublicRecord | SandboxSecurityEnforcementAuditCapabilityRecord>;
}

export interface SandboxSecurityEnforcementAuditCapabilityService {
  issueEnforcementAudit(
    request: Readonly<SandboxSecurityEnforcementAuditCapabilityIssueRequest>
  ): Readonly<SandboxSecurityEnforcementAuditCapabilityIssueResult>;
}

export interface OpenClawEnforcementAuditIdentity {
  subject_id: string;
  capability_id: string;
  authorization_scope_id: string;
}

export interface SandboxSecurityEnforcementAuditService {
  appendEnforcementEvent(
    request: Readonly<SandboxSecurityEnforcementAuditRequest>,
    identity: Readonly<OpenClawEnforcementAuditIdentity>
  ): Promise<Readonly<OpenClawEnforcementAuditAck>>;
}

export interface SandboxSecurityAuditService {
  list(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    cursor?: string;
    limit: number;
  }>): Readonly<SandboxSecurityAuditPage>;
  purgeExpired(): Readonly<SandboxSecurityAuditPurgeResult>;
}

export interface SandboxSecurityEvaluationService {
  evaluate(input: Readonly<{
    capability: SandboxSecurityAuthorizedCapability;
    idempotency_key: string;
    submission: SandboxSecurityRequest;
    signal?: AbortSignal;
  }>): Promise<Readonly<SandboxSecurityDecision>>;
}

export interface SandboxSecurityAuditProjector {
  evaluationCompleted(input: Readonly<SandboxSecurityEvaluationAuditInput>): SandboxSecurityAuditEvent;
  evaluationReplayed(input: Readonly<SandboxSecurityEvaluationAuditInput>): SandboxSecurityAuditEvent;
  evaluationInterrupted(input: Readonly<SandboxSecurityInterruptionAuditInput>): SandboxSecurityAuditEvent;
  requestRejected(input: Readonly<SandboxSecurityRejectionAuditInput>): SandboxSecurityAuditEvent;
  capabilityIssued(input: Readonly<SandboxSecurityCapabilityIssuedAuditInput>): SandboxSecurityAuditEvent;
  capabilityRevoked(input: Readonly<SandboxSecurityCapabilityRevokedAuditInput>): SandboxSecurityAuditEvent;
  auditRead(input: Readonly<SandboxSecurityAuditReadAuditInput>): SandboxSecurityAuditEvent;
  auditPurged(input: Readonly<SandboxSecurityAuditPurgeAuditInput>): SandboxSecurityAuditEvent;
}

export interface SandboxSecurityIdempotencyMaintenance {
  state(): "healthy" | "degraded" | "closed";
  assertEvaluationAvailable(): void;
  claim(input: Readonly<SandboxSecurityIdempotencyClaim>): SandboxSecurityIdempotencyClaimResult;
  runHourlyCleanup(): void;
  runPurgePreCleanup(): void;
  close(): void;
}
