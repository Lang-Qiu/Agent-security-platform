import {
  createSandboxSecurityCanonicalFingerprintService,
  type SandboxSecurityCanonicalFingerprintService,
  type SandboxSecurityEngine,
  type SandboxSecurityEvaluationRequest,
  type SandboxSecurityRuntimePorts
} from "../../../../../engines/sandbox/src/security/index.ts";
import {
  createSandboxSecurityProductionEngine
} from "../../../../../engines/sandbox/src/security-production/index.ts";
import {
  normalizeSandboxSecurityDecision,
  type SandboxSecurityDecision
} from "../../../../../shared/index.ts";
import type { SandboxSecurityEvaluationGateway } from "../ports/evaluation.gateway.ts";
import type {
  SandboxSecurityHmacService,
  SandboxSecurityProductionMode
} from "../sandbox-security.types.ts";
import { createSandboxSecurityServiceError } from "../sandbox-security.errors.ts";

const FINGERPRINT_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;

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
      signal?: AbortSignal
    ): Promise<Readonly<SandboxSecurityDecision>> {
      let decision: unknown;
      try {
        decision = await engine.evaluate(request, signal);
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
