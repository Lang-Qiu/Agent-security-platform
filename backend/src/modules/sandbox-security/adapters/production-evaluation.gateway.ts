import {
  createSandboxSecurityCanonicalFingerprintService,
  type SandboxSecurityCanonicalFingerprintService,
  type SandboxSecurityEngine,
  type SandboxSecurityEngineStageObservation,
  type SandboxSecurityEvaluationRequest,
  type SandboxSecurityRuntimePorts
} from "../../../../../engines/sandbox/src/security/index.ts";
import {
  createSandboxSecurityProductionEngine
} from "../../../../../engines/sandbox/src/security-production/index.ts";
import {
  normalizeSandboxSecurityEvaluationStreamEvent,
  normalizeSandboxSecurityDecision,
  type SandboxSecurityDecision
} from "../../../../../shared/index.ts";
import type { SandboxSecurityEvaluationGateway } from "../ports/evaluation.gateway.ts";
import type { SandboxSecurityEvaluationStageEvent } from "../ports/evaluation.gateway.ts";
import type {
  SandboxSecurityHmacService,
  SandboxSecurityProductionMode
} from "../sandbox-security.types.ts";
import { createSandboxSecurityServiceError } from "../sandbox-security.errors.ts";
import { clampSandboxSecurityStreamElapsedMs } from "../stream-elapsed.ts";

const FINGERPRINT_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
const STAGE_SEQUENCE = { source: 1, rule: 2, model: 3, judge: 4 } as const;

function mapStageObservation(
  requestId: string,
  observation: SandboxSecurityEngineStageObservation
): SandboxSecurityEvaluationStageEvent {
  const event = observation.stage === "source"
    ? {
        schema_version: "sandbox-security-evaluation-stream.v1",
        event_type: "stage",
        request_id: requestId,
        sequence: 1,
        stage: "source",
        status: "completed",
        delivery: "live",
        result: {
          source_count: observation.source_count,
          tool_request_present: observation.tool_request_present,
          elapsed_ms: clampSandboxSecurityStreamElapsedMs(observation.elapsed_ms)
        }
      }
    : {
        schema_version: "sandbox-security-evaluation-stream.v1",
        event_type: "stage",
        request_id: requestId,
        sequence: STAGE_SEQUENCE[observation.stage],
        stage: observation.stage,
        status: observation.status,
        delivery: "live",
        result: {
          detector_id: observation.detector_id,
          detector_version: observation.detector_version,
          detector_kind: observation.detector_kind,
          obligation: observation.obligation,
          elapsed_ms: clampSandboxSecurityStreamElapsedMs(observation.elapsed_ms),
          ...(observation.error_code ? { error_code: observation.error_code } : {}),
          ...(observation.skip_reason ? { skip_reason: observation.skip_reason } : {})
        }
      };
  const normalized = normalizeSandboxSecurityEvaluationStreamEvent(event);
  if (normalized === null || normalized.event_type !== "stage") throw internalError();
  return normalized;
}

function internalError(): ReturnType<typeof createSandboxSecurityServiceError> {
  return createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_INTERNAL_ERROR"
  });
}

export interface SandboxSecurityProductionEvaluationGatewayPorts {
  create_engine(input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    mode: SandboxSecurityProductionMode;
  }>): Promise<SandboxSecurityEngine>;
  create_canonical_fingerprint(): SandboxSecurityCanonicalFingerprintService;
}

export async function createSandboxSecurityProductionEvaluationGatewayWithPorts(
  input: Readonly<{
    runtime: SandboxSecurityRuntimePorts;
    production_mode: SandboxSecurityProductionMode;
    hmac: SandboxSecurityHmacService;
    ports: SandboxSecurityProductionEvaluationGatewayPorts;
  }>
): Promise<SandboxSecurityEvaluationGateway> {
  const engine = await input.ports.create_engine({
    runtime: input.runtime,
    mode: input.production_mode
  });
  const canonicalFingerprint = input.ports.create_canonical_fingerprint();
  return {
    composition_binding:
      `sandbox-security-production-composition.v1:${input.production_mode}`,
    fingerprint(request: Readonly<SandboxSecurityEvaluationRequest>): string {
      let fingerprint: unknown;
      try {
        fingerprint = canonicalFingerprint.fingerprint(request, input.hmac);
      } catch {
        throw internalError();
      }
      if (typeof fingerprint !== "string" || !FINGERPRINT_PATTERN.test(fingerprint)) {
        throw internalError();
      }
      return fingerprint;
    },
    async evaluate(
      request: Readonly<SandboxSecurityEvaluationRequest>,
      signal?: AbortSignal,
      onStage?: (event: SandboxSecurityEvaluationStageEvent) => void
    ): Promise<Readonly<SandboxSecurityDecision>> {
      let decision: unknown;
      try {
        decision = await engine.evaluate(
          request,
          signal,
          onStage
            ? (observation) => onStage(mapStageObservation(request.submission.request_id, observation))
            : undefined
        );
      } catch {
        throw internalError();
      }
      const normalized = normalizeSandboxSecurityDecision(decision);
      if (normalized === null) {
        throw internalError();
      }
      return normalized;
    }
  };
}

export async function createSandboxSecurityProductionEvaluationGateway(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  hmac: SandboxSecurityHmacService;
  production_mode: SandboxSecurityProductionMode;
}>): Promise<SandboxSecurityEvaluationGateway> {
  return createSandboxSecurityProductionEvaluationGatewayWithPorts({
    ...input,
    ports: {
      create_engine: ({ runtime, mode }) =>
        createSandboxSecurityProductionEngine({ runtime, mode }),
      create_canonical_fingerprint: () =>
        createSandboxSecurityCanonicalFingerprintService()
    }
  });
}
