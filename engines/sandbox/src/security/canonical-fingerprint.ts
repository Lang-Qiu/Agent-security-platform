import type { SandboxSecurityEvaluationRequest } from "./source-authority.ts";
import { normalizeSandboxSecurityEvaluationRequest } from "./source-authority.ts";
import {
  encodeSandboxSecurityCanonicalProjection,
  type SandboxSecurityCanonicalEvaluationProjection
} from "./input-boundary.ts";
import type {
  AuthenticatedSourceObservation,
  AuthenticatedToolObservation
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

function deepCloneJson(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneJson(item));
  }
  if (typeof value === "object") {
    const out: { [key: string]: unknown } = {};
    for (const [key, nested] of Object.entries(value as object)) {
      out[key] = deepCloneJson(nested);
    }
    return out;
  }
  return value;
}

function cloneSource(
  source: AuthenticatedSourceObservation
): AuthenticatedSourceObservation {
  return {
    source_id: source.source_id,
    authority_kind: source.authority_kind,
    source_type: source.source_type,
    media_type: source.media_type,
    value:
      source.media_type === "text/plain"
        ? source.value
        : (deepCloneJson(source.value) as AuthenticatedSourceObservation["value"]),
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
    arguments: deepCloneJson(tool.arguments) as AuthenticatedToolObservation["arguments"],
    ...(tool.target !== undefined ? { target: tool.target } : {})
  };
}

function buildAuthoritativeProjection(
  request: ReturnType<typeof normalizeSandboxSecurityEvaluationRequest>
): SandboxSecurityCanonicalEvaluationProjection {
  const sources = request.authoritative_context.sources.map(cloneSource);
  return {
    schema_version: "sandbox-security-canonical-evaluation.v1",
    evaluation_mode: request.authoritative_context.evaluation_mode,
    stage: request.authoritative_context.stage,
    policy_profile_id: request.authoritative_context.policy_profile_id,
    sources,
    ...(request.authoritative_context.tool_request
      ? { tool_request: cloneTool(request.authoritative_context.tool_request) }
      : {})
  };
}

export function createSandboxSecurityCanonicalFingerprintService(): SandboxSecurityCanonicalFingerprintService {
  return {
    fingerprint(request, port) {
      // Authority validation first; mismatch throws before any port call.
      const normalized = normalizeSandboxSecurityEvaluationRequest(request);
      const projection = buildAuthoritativeProjection(normalized);
      const canonicalBytes = encodeSandboxSecurityCanonicalProjection(projection);

      let output: string;
      try {
        output = port.fingerprintCanonicalBytes(canonicalBytes);
      } catch {
        throw new SandboxSecurityFingerprintError();
      }

      if (typeof output !== "string" || !FINGERPRINT_PATTERN.test(output)) {
        throw new SandboxSecurityFingerprintError();
      }

      // Drop references by leaving function scope; return string only.
      return output;
    }
  };
}
