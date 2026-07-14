import {
  encodeSandboxSecurityCanonicalProjection,
  type SandboxSecurityCanonicalEvaluationProjection
} from "./input-boundary.ts";
import {
  normalizeSandboxSecurityEvaluationRequest,
  type AuthenticatedSourceObservation,
  type AuthenticatedToolObservation,
  type SandboxSecurityEvaluationRequest
} from "./source-authority.ts";

export interface SandboxSecurityCanonicalFingerprintPort {
  fingerprintCanonicalBytes(canonicalBytes: Uint8Array): string;
}

export interface SandboxSecurityCanonicalFingerprintService {
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    port: SandboxSecurityCanonicalFingerprintPort
  ): string;
}

export class SandboxSecurityFingerprintError extends Error {
  readonly code: "sandbox_security_internal_invalid";
  constructor(message = "sandbox_security_internal_invalid") {
    super(message);
    this.name = "SandboxSecurityFingerprintError";
    this.code = "sandbox_security_internal_invalid";
  }
}

const FINGERPRINT_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;

function cloneSource(
  source: AuthenticatedSourceObservation
): AuthenticatedSourceObservation {
  return {
    source_id: source.source_id,
    authority_kind: source.authority_kind,
    source_type: source.source_type,
    media_type: source.media_type,
    value: source.value,
    provenance_ref: source.provenance_ref
  };
}

function cloneTool(
  tool: AuthenticatedToolObservation
): AuthenticatedToolObservation {
  return {
    authority_kind: tool.authority_kind,
    call_id: tool.call_id,
    tool_name: tool.tool_name,
    arguments: tool.arguments,
    ...(tool.target !== undefined ? { target: tool.target } : {})
  };
}

function buildProjection(
  request: ReturnType<typeof normalizeSandboxSecurityEvaluationRequest>
): SandboxSecurityCanonicalEvaluationProjection {
  return {
    schema_version: "sandbox-security-canonical-evaluation.v1",
    evaluation_mode: request.authoritative_context.evaluation_mode,
    stage: request.authoritative_context.stage,
    policy_profile_id: request.authoritative_context.policy_profile_id,
    sources: request.authoritative_context.sources.map(cloneSource),
    ...(request.authoritative_context.tool_request
      ? { tool_request: cloneTool(request.authoritative_context.tool_request) }
      : {})
  };
}

export function createSandboxSecurityCanonicalFingerprintService(): SandboxSecurityCanonicalFingerprintService {
  return {
    fingerprint(request, port) {
      const normalized = normalizeSandboxSecurityEvaluationRequest(request);
      const projection = buildProjection(normalized);
      const canonicalBytes = encodeSandboxSecurityCanonicalProjection(projection);
      // Independent ephemeral copy for the port.
      const portBytes = Uint8Array.from(canonicalBytes);

      let raw: string;
      try {
        raw = port.fingerprintCanonicalBytes(portBytes);
      } catch {
        throw new SandboxSecurityFingerprintError(
          "sandbox_security_internal_invalid"
        );
      }

      if (typeof raw !== "string" || !FINGERPRINT_PATTERN.test(raw)) {
        throw new SandboxSecurityFingerprintError(
          "sandbox_security_internal_invalid"
        );
      }

      // Drop references intentionally; only the grammar-validated string returns.
      return raw;
    }
  };
}
