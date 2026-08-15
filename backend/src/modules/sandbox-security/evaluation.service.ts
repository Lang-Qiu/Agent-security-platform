import { normalizeSandboxSecurityDecision } from "../../../../shared/contracts/sandbox-security.ts";
import { normalizeSandboxSecurityEvaluationStreamEvent } from "../../../../shared/contracts/sandbox-security-api.ts";
import type {
  SandboxSecurityDecision,
  SandboxSecurityRequest
} from "../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityEvaluationStreamEvent } from "../../../../shared/types/sandbox-security-api.ts";
import { createSandboxSecuritySimulationEvaluationRequest } from "./simulation-authority.ts";
import {
  createSandboxSecurityServiceError,
  isSandboxSecurityServiceError
} from "./sandbox-security.errors.ts";
import type { SandboxSecurityEvaluationGateway } from "./ports/evaluation.gateway.ts";
import type { SandboxSecurityIdempotencyRepository } from "./ports/idempotency.repository.ts";
import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityEngineConcurrencyLimiter,
  SandboxSecurityEvaluationService,
  SandboxSecurityHmacService,
  SandboxSecurityIdempotencyClaim,
  SandboxSecurityIdempotencyClaimResult,
  SandboxSecurityIdempotencyMaintenance
} from "./sandbox-security.types.ts";

const FINGERPRINT_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
type SandboxSecuritySubmissionCorrelation = Pick<
  SandboxSecurityRequest,
  "request_id" | "stage" | "policy_profile_id"
>;
type SandboxSecurityEvaluationStageEvent = Extract<
  SandboxSecurityEvaluationStreamEvent,
  { event_type: "stage" }
>;

function internalError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

function serviceErrorOrInternal(error: unknown): never {
  if (isSandboxSecurityServiceError(error)) throw error;
  throw internalError();
}

function strictTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw internalError();
  const normalized = new Date(parsed).toISOString();
  if (normalized !== value) throw internalError();
  return normalized;
}

function elapsedMs(runtime: SandboxSecurityRuntimePort, startedAt: number): number {
  try {
    const elapsed = runtime.monotonicNowMs() - startedAt;
    if (!Number.isFinite(elapsed)) return 0;
    return Math.max(0, Math.min(60000, Math.floor(elapsed)));
  } catch {
    return 0;
  }
}

function normalizeDecisionForSubmission(
  value: unknown,
  submission: Readonly<SandboxSecuritySubmissionCorrelation>
): SandboxSecurityDecision {
  const decision = normalizeSandboxSecurityDecision(value);
  if (
    decision === null ||
    decision.evaluation_mode !== "simulation" ||
    decision.request_id !== submission.request_id ||
    decision.stage !== submission.stage ||
    decision.policy_profile_id !== submission.policy_profile_id
  ) {
    throw internalError();
  }
  return decision;
}

function createStageEmitter(
  requestId: string,
  onStage: (event: SandboxSecurityEvaluationStageEvent) => void
): (event: SandboxSecurityEvaluationStageEvent) => void {
  let expectedSequence = 1;
  return (event) => {
    const normalized = normalizeSandboxSecurityEvaluationStreamEvent(event);
    if (
      normalized === null ||
      normalized.event_type !== "stage" ||
      normalized.request_id !== requestId ||
      normalized.sequence !== expectedSequence ||
      expectedSequence > 4
    ) {
      throw internalError();
    }
    expectedSequence += 1;
    onStage(normalized);
  };
}

function replayStageEvents(
  submission: Readonly<SandboxSecurityRequest>,
  decision: Readonly<SandboxSecurityDecision>,
  emit: (event: SandboxSecurityEvaluationStageEvent) => void
): void {
  emit({
    schema_version: "sandbox-security-evaluation-stream.v1",
    event_type: "stage",
    request_id: submission.request_id,
    sequence: 1,
    stage: "source",
    status: "completed",
    delivery: "replayed",
    result: {
      source_count: submission.content_items.length,
      tool_request_present: submission.tool_request !== undefined,
      elapsed_ms: 0
    }
  });
  const slots = [
    [2, "rule", "rule"],
    [3, "model", "local_model"],
    [4, "judge", "external_judge"]
  ] as const;
  for (const [sequence, stage, detectorKind] of slots) {
    const run = decision.detector_runs.find(
      (candidate) => candidate.detector_kind === detectorKind
    );
    if (run === undefined) throw internalError();
    const event = {
      schema_version: "sandbox-security-evaluation-stream.v1",
      event_type: "stage",
      request_id: submission.request_id,
      sequence,
      stage,
      status: run.status,
      delivery: "replayed",
      result: {
        detector_id: run.detector_id,
        detector_version: run.detector_version,
        detector_kind: run.detector_kind,
        obligation: run.obligation,
        elapsed_ms: run.elapsed_ms,
        ...(run.status === "failed" ||
        run.status === "timeout" ||
        run.status === "invalid_result"
          ? { error_code: run.error_code }
          : {}),
        ...(run.status === "skipped" ? { skip_reason: run.skip_reason } : {})
      }
    };
    const normalized = normalizeSandboxSecurityEvaluationStreamEvent(event);
    if (normalized === null || normalized.event_type !== "stage") throw internalError();
    emit(normalized);
  }
}

function assertFingerprint(value: unknown): asserts value is `hmac-sha256:${string}` {
  if (typeof value !== "string" || !FINGERPRINT_PATTERN.test(value)) {
    throw internalError();
  }
}

function assertDependencies(input: Readonly<{
  authorizer: SandboxSecurityCapabilityAuthenticator;
  hmac: SandboxSecurityHmacService;
  idempotency_repository: SandboxSecurityIdempotencyRepository;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  concurrency: SandboxSecurityEngineConcurrencyLimiter;
  gateway: SandboxSecurityEvaluationGateway;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.authorizer === null ||
    typeof input.authorizer !== "object" ||
    typeof input.authorizer.requireEvaluationGrant !== "function" ||
    input.hmac === null ||
    typeof input.hmac !== "object" ||
    typeof input.hmac.idempotencyKeyHmac !== "function" ||
    input.idempotency_repository === null ||
    typeof input.idempotency_repository !== "object" ||
    typeof input.idempotency_repository.complete !== "function" ||
    typeof input.idempotency_repository.interrupt !== "function" ||
    typeof input.idempotency_repository.rejectConcurrency !== "function" ||
    input.maintenance === null ||
    typeof input.maintenance !== "object" ||
    typeof input.maintenance.claim !== "function" ||
    input.concurrency === null ||
    typeof input.concurrency !== "object" ||
    typeof input.concurrency.tryAcquire !== "function" ||
    input.gateway === null ||
    typeof input.gateway !== "object" ||
    typeof input.gateway.fingerprint !== "function" ||
    typeof input.gateway.evaluate !== "function" ||
    typeof input.gateway.composition_binding !== "string" ||
    input.runtime === null ||
    typeof input.runtime !== "object" ||
    typeof input.runtime.now !== "function" ||
    typeof input.runtime.monotonicNowMs !== "function" ||
    typeof input.runtime.nextAuditEventId !== "function" ||
    input.audit_projector === null ||
    typeof input.audit_projector !== "object" ||
    typeof input.audit_projector.requestRejected !== "function" ||
    typeof input.audit_projector.evaluationCompleted !== "function" ||
    typeof input.audit_projector.evaluationReplayed !== "function" ||
    typeof input.audit_projector.evaluationInterrupted !== "function"
  ) {
    throw new TypeError("Invalid sandbox security evaluation service dependencies");
  }
}

export function createSandboxSecurityEvaluationService(input: Readonly<{
  authorizer: SandboxSecurityCapabilityAuthenticator;
  hmac: SandboxSecurityHmacService;
  idempotency_repository: SandboxSecurityIdempotencyRepository;
  maintenance: SandboxSecurityIdempotencyMaintenance;
  concurrency: SandboxSecurityEngineConcurrencyLimiter;
  gateway: SandboxSecurityEvaluationGateway;
  runtime: SandboxSecurityRuntimePort;
  audit_projector: SandboxSecurityAuditProjector;
}>): SandboxSecurityEvaluationService {
  assertDependencies(input);

  const {
    authorizer,
    hmac,
    idempotency_repository: repository,
    maintenance,
    concurrency,
    gateway,
    runtime,
    audit_projector: projector
  } = input;

  function requestRejectedEvent(
    capability: Readonly<SandboxSecurityAuthorizedCapability>,
    submission: Readonly<SandboxSecuritySubmissionCorrelation>,
    startedAt: number,
    rejectionCode:
      | "idempotency_in_progress"
      | "idempotency_conflict"
      | "concurrency_limited"
  ) {
    return projector.requestRejected({
      event_id: runtime.nextAuditEventId(),
      occurred_at: runtime.now(),
      subject_id: capability.subject_id,
      authorization_scope_id: capability.authorization_scope_id,
      capability_id: capability.capability_id,
      route_id: "evaluation",
      request_id: submission.request_id,
      stage: submission.stage,
      policy_profile_id: submission.policy_profile_id,
      composition_binding: gateway.composition_binding,
      elapsed_ms: elapsedMs(runtime, startedAt),
      rejection_code: rejectionCode
    });
  }

  function interruption(
    capability: Readonly<SandboxSecurityAuthorizedCapability>,
    submission: Readonly<SandboxSecuritySubmissionCorrelation>,
    startedAt: number,
    key: `idem-key:hmac-sha256:${string}`,
    fingerprint: `hmac-sha256:${string}`,
    code: "engine_error" | "persistence_error"
  ): void {
    try {
      repository.interrupt({
        authorization_scope_id: capability.authorization_scope_id,
        idempotency_key_hmac: key,
        request_fingerprint: fingerprint,
        updated_at: runtime.now(),
        interrupted_event: projector.evaluationInterrupted({
          event_id: runtime.nextAuditEventId(),
          occurred_at: runtime.now(),
          subject_id: capability.subject_id,
          authorization_scope_id: capability.authorization_scope_id,
          capability_id: capability.capability_id,
          request_id: submission.request_id,
          stage: submission.stage,
          policy_profile_id: submission.policy_profile_id,
          composition_binding: gateway.composition_binding,
          elapsed_ms: elapsedMs(runtime, startedAt),
          interruption_code: code
        })
      });
    } catch {
      // Interruption is best effort after an Engine or persistence failure.
    }
  }

  return {
    async evaluate(evaluationInput): Promise<Readonly<SandboxSecurityDecision>> {
      const {
        capability,
        submission,
        idempotency_key: rawKey,
        signal,
        on_stage: onStage
      } = evaluationInput;
      const startedAt = runtime.monotonicNowMs();

      try {
        authorizer.requireEvaluationGrant(capability, submission);
      } catch (error) {
        serviceErrorOrInternal(error);
      }

      let evaluationRequest: ReturnType<typeof createSandboxSecuritySimulationEvaluationRequest>;
      try {
        evaluationRequest = createSandboxSecuritySimulationEvaluationRequest(submission);
      } catch {
        throw internalError();
      }
      const capabilitySnapshot: SandboxSecurityAuthorizedCapability = Object.freeze({
        capability_id: capability.capability_id,
        subject_id: capability.subject_id,
        authorization_scope_id: capability.authorization_scope_id,
        scopes: Object.freeze([...capability.scopes]),
        allowed_stages: Object.freeze([...capability.allowed_stages]),
        allowed_policy_profile_ids: Object.freeze([
          ...capability.allowed_policy_profile_ids
        ]),
        issued_at: capability.issued_at,
        expires_at: capability.expires_at
      });
      const submissionCorrelation: SandboxSecuritySubmissionCorrelation = Object.freeze({
        request_id: evaluationRequest.submission.request_id,
        stage: evaluationRequest.submission.stage,
        policy_profile_id: evaluationRequest.submission.policy_profile_id
      });
      const emitStage = onStage
        ? createStageEmitter(submissionCorrelation.request_id, onStage)
        : undefined;

      let fingerprint: `hmac-sha256:${string}`;
      try {
        const value = gateway.fingerprint(evaluationRequest);
        assertFingerprint(value);
        fingerprint = value;
      } catch {
        throw internalError();
      }

      let key: `idem-key:hmac-sha256:${string}`;
      try {
        const value = hmac.idempotencyKeyHmac(rawKey);
        if (typeof value !== "string" || !/^idem-key:hmac-sha256:[a-f0-9]{64}$/.test(value)) {
          throw new TypeError("Invalid idempotency key HMAC");
        }
        key = value;
      } catch {
        throw internalError();
      }
      let now: string;
      let expiresAt: string;
      try {
        now = strictTimestamp(runtime.now());
        expiresAt = new Date(Date.parse(now) + IDEMPOTENCY_RETENTION_MS).toISOString();
      } catch {
        throw internalError();
      }

      let claimResult: SandboxSecurityIdempotencyClaimResult;
      try {
        const claim: SandboxSecurityIdempotencyClaim = {
          authorization_scope_id: capabilitySnapshot.authorization_scope_id,
          idempotency_key_hmac: key,
          request_fingerprint: fingerprint,
          capability_id: capabilitySnapshot.capability_id,
          subject_id: capabilitySnapshot.subject_id,
          request_id: submissionCorrelation.request_id,
          stage: submissionCorrelation.stage,
          policy_profile_id: submissionCorrelation.policy_profile_id,
          composition_binding: gateway.composition_binding,
          now,
          expires_at: expiresAt,
          in_progress_event: requestRejectedEvent(
            capabilitySnapshot,
            submissionCorrelation,
            startedAt,
            "idempotency_in_progress"
          ),
          fingerprint_conflict_event: requestRejectedEvent(
            capabilitySnapshot,
            submissionCorrelation,
            startedAt,
            "idempotency_conflict"
          ),
          create_replayed_event: (decision) => {
            const normalizedDecision = normalizeDecisionForSubmission(
              decision,
              submissionCorrelation
            );
            return projector.evaluationReplayed({
              event_id: runtime.nextAuditEventId(),
              occurred_at: runtime.now(),
              subject_id: capabilitySnapshot.subject_id,
              authorization_scope_id: capabilitySnapshot.authorization_scope_id,
              capability_id: capabilitySnapshot.capability_id,
              composition_binding: gateway.composition_binding,
              elapsed_ms: elapsedMs(runtime, startedAt),
              decision: normalizedDecision
            });
          }
        };
        claimResult = maintenance.claim(claim);
      } catch (error) {
        serviceErrorOrInternal(error);
      }

      let claimKind: SandboxSecurityIdempotencyClaimResult["kind"];
      try {
        if (claimResult === null || typeof claimResult !== "object") {
          throw new TypeError("Invalid idempotency claim result");
        }
        claimKind = claimResult.kind;
        if (
          claimKind !== "claimed" &&
          claimKind !== "completed" &&
          claimKind !== "in_progress" &&
          claimKind !== "fingerprint_conflict"
        ) {
          throw new TypeError("Invalid idempotency claim result kind");
        }
      } catch {
        throw internalError();
      }

      if (claimKind === "completed") {
        const replayed = normalizeDecisionForSubmission(
          (claimResult as Extract<
            SandboxSecurityIdempotencyClaimResult,
            { kind: "completed" }
          >).response,
          submissionCorrelation
        );
        if (emitStage) replayStageEvents(submission, replayed, emitStage);
        return replayed;
      }
      if (claimKind === "in_progress") {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
          audit_rejection_code: "idempotency_in_progress"
        });
      }
      if (claimKind === "fingerprint_conflict") {
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
          audit_rejection_code: "idempotency_conflict"
        });
      }
      if (claimKind !== "claimed") throw internalError();

      let release: (() => void) | null;
      try {
        release = concurrency.tryAcquire();
      } catch {
        interruption(
          capabilitySnapshot,
          submissionCorrelation,
          startedAt,
          key,
          fingerprint,
          "persistence_error"
        );
        throw internalError();
      }
      if (release === null) {
        try {
          repository.rejectConcurrency({
            authorization_scope_id: capabilitySnapshot.authorization_scope_id,
            idempotency_key_hmac: key,
            request_fingerprint: fingerprint,
            updated_at: runtime.now(),
            rejection_event: requestRejectedEvent(
              capabilitySnapshot,
              submissionCorrelation,
              startedAt,
              "concurrency_limited"
            )
          });
        } catch (error) {
          interruption(
            capabilitySnapshot,
            submissionCorrelation,
            startedAt,
            key,
            fingerprint,
            "persistence_error"
          );
          throw internalError();
        }
        throw createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_CONCURRENCY_LIMITED",
          audit_rejection_code: "concurrency_limited"
        });
      }

      let engineValue: unknown;
      let engineFailed = false;
      let releaseFailed = false;
      try {
        engineValue = await gateway.evaluate(evaluationRequest, signal, emitStage);
      } catch {
        engineFailed = true;
      } finally {
        try {
          release();
        } catch {
          releaseFailed = true;
        }
      }

      if (engineFailed || releaseFailed) {
        interruption(
          capabilitySnapshot,
          submissionCorrelation,
          startedAt,
          key,
          fingerprint,
          engineFailed ? "engine_error" : "persistence_error"
        );
        throw internalError();
      }

      let decision: SandboxSecurityDecision;
      try {
        decision = normalizeDecisionForSubmission(engineValue, submissionCorrelation);
      } catch {
        interruption(
          capabilitySnapshot,
          submissionCorrelation,
          startedAt,
          key,
          fingerprint,
          "engine_error"
        );
        throw internalError();
      }

      let completedEvent;
      try {
        completedEvent = projector.evaluationCompleted({
          event_id: runtime.nextAuditEventId(),
          occurred_at: runtime.now(),
          subject_id: capabilitySnapshot.subject_id,
          authorization_scope_id: capabilitySnapshot.authorization_scope_id,
          capability_id: capabilitySnapshot.capability_id,
          composition_binding: gateway.composition_binding,
          elapsed_ms: elapsedMs(runtime, startedAt),
          decision
        });
      } catch {
        interruption(
          capabilitySnapshot,
          submissionCorrelation,
          startedAt,
          key,
          fingerprint,
          "persistence_error"
        );
        throw internalError();
      }

      try {
        repository.complete({
          authorization_scope_id: capabilitySnapshot.authorization_scope_id,
          idempotency_key_hmac: key,
          request_fingerprint: fingerprint,
          updated_at: runtime.now(),
          decision,
          completed_event: completedEvent
        });
      } catch {
        interruption(
          capabilitySnapshot,
          submissionCorrelation,
          startedAt,
          key,
          fingerprint,
          "persistence_error"
        );
        throw internalError();
      }

      return decision;
    }
  };
}
