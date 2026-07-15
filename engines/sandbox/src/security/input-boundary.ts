import { createHash, randomBytes } from "node:crypto";

import {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson
} from "./canonical-json.ts";
import type {
  AuthenticatedSourceObservation,
  AuthenticatedToolObservation,
  NormalizedSandboxSecurityEvaluationRequest,
  SandboxSecurityEvaluationMode
} from "./source-authority.ts";
import { sandboxSecurityEvaluationRequestBrand } from "./source-authority.ts";
import type {
  SandboxSecurityClaimedSourceType,
  SandboxSecurityJsonValue,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityStage
} from "../../../../shared/types/sandbox-security.ts";
import { SANDBOX_SECURITY_MAX_REQUEST_BYTES } from "../../../../shared/types/sandbox-security.ts";

const sandboxSecuritySourceHandleBrand: unique symbol = Symbol(
  "sandboxSecuritySourceHandleBrand"
);
const sandboxSecurityCallHandleBrand: unique symbol = Symbol(
  "sandboxSecurityCallHandleBrand"
);

export type SandboxSecuritySourceHandle = string & {
  readonly [sandboxSecuritySourceHandleBrand]: true;
};
export type SandboxSecurityCallHandle = string & {
  readonly [sandboxSecurityCallHandleBrand]: true;
};

export interface SandboxSecurityCanonicalEvaluationProjection {
  schema_version: "sandbox-security-canonical-evaluation.v1";
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: readonly AuthenticatedSourceObservation[];
  tool_request?: Readonly<AuthenticatedToolObservation>;
}

export interface SandboxSecurityAuthorityBoundContent {
  readonly source_handle: SandboxSecuritySourceHandle;
  readonly source_id: string;
  readonly source_type: SandboxSecurityClaimedSourceType;
  readonly media_type: "text/plain" | "application/json";
  readonly authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  readonly value: string | SandboxSecurityJsonValue;
  readonly provenance_ref: string;
  readonly original_utf8_bytes: readonly number[];
  readonly original_value_sha256: string;
  readonly comparison_value: string | SandboxSecurityJsonValue;
}

export interface SandboxSecurityNormalizedToolRequest {
  readonly call_handle: SandboxSecurityCallHandle;
  readonly call_id: string;
  readonly authority_kind: "integration_observation" | "simulation_observation";
  readonly tool_name: string;
  readonly target?: string;
  readonly arguments: SandboxSecurityJsonValue;
  readonly arguments_jcs_sha256: string;
  readonly has_target: boolean;
}

export interface SandboxSecurityPreparedInput {
  readonly evaluation_nonce: string;
  readonly request_id: string;
  readonly evaluation_mode: SandboxSecurityEvaluationMode;
  readonly stage: SandboxSecurityStage;
  readonly policy_profile_id: SandboxSecurityPolicyProfileId;
  readonly contents: readonly SandboxSecurityAuthorityBoundContent[];
  readonly tool_request?: Readonly<SandboxSecurityNormalizedToolRequest>;
  readonly canonical_projection: Readonly<SandboxSecurityCanonicalEvaluationProjection>;
  readonly canonical_projection_sha256: string;
}

export class SandboxSecurityInputBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxSecurityInputBoundaryError";
  }
}

const SOURCE_HANDLE_PATTERN =
  /^hsrc:[a-f0-9]{32}:(000[1-9]|00[1-5][0-9]|006[0-4])$/;
const CALL_HANDLE_PATTERN = /^hcall:[a-f0-9]{32}:0000$/;
const NONCE_PATTERN = /^[a-f0-9]{32}$/;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return value;
}

function deepCloneJson(value: SandboxSecurityJsonValue): SandboxSecurityJsonValue {
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
  const out: { [key: string]: SandboxSecurityJsonValue } = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = deepCloneJson(nested);
  }
  return out;
}

function nfkcComparisonValue(
  value: SandboxSecurityJsonValue
): SandboxSecurityJsonValue {
  if (typeof value === "string") {
    return value.normalize("NFKC");
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => nfkcComparisonValue(item));
  }
  const out: { [key: string]: SandboxSecurityJsonValue } = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key.normalize("NFKC")] = nfkcComparisonValue(nested);
  }
  return out;
}

function utf8ByteArray(text: string): number[] {
  return Array.from(Buffer.from(text, "utf8"));
}

function sha256Bytes(bytes: Uint8Array | readonly number[]): string {
  const buffer =
    bytes instanceof Uint8Array ? bytes : Buffer.from(Array.from(bytes));
  return createHash("sha256").update(buffer).digest("hex");
}

function mintNonce(): string {
  return randomBytes(16).toString("hex");
}

function formatOrdinal(indexFromOne: number): string {
  return String(indexFromOne).padStart(4, "0");
}

function mintSourceHandle(
  nonce: string,
  ordinalFromOne: number
): SandboxSecuritySourceHandle {
  const handle = `hsrc:${nonce}:${formatOrdinal(ordinalFromOne)}`;
  if (!SOURCE_HANDLE_PATTERN.test(handle)) {
    throw new SandboxSecurityInputBoundaryError("invalid source handle");
  }
  return handle as SandboxSecuritySourceHandle;
}

function mintCallHandle(nonce: string): SandboxSecurityCallHandle {
  const handle = `hcall:${nonce}:0000`;
  if (!CALL_HANDLE_PATTERN.test(handle)) {
    throw new SandboxSecurityInputBoundaryError("invalid call handle");
  }
  return handle as SandboxSecurityCallHandle;
}

export function isSandboxSecuritySourceHandle(
  value: unknown
): value is SandboxSecuritySourceHandle {
  return typeof value === "string" && SOURCE_HANDLE_PATTERN.test(value);
}

export function isSandboxSecurityCallHandle(
  value: unknown
): value is SandboxSecurityCallHandle {
  return typeof value === "string" && CALL_HANDLE_PATTERN.test(value);
}

function cloneSourceObservation(
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
        : deepCloneJson(source.value as SandboxSecurityJsonValue),
    provenance_ref: source.provenance_ref
  };
}

function cloneToolObservation(
  tool: AuthenticatedToolObservation
): AuthenticatedToolObservation {
  return {
    authority_kind: tool.authority_kind,
    call_id: tool.call_id,
    tool_name: tool.tool_name,
    arguments: deepCloneJson(tool.arguments),
    ...(tool.target !== undefined ? { target: tool.target } : {})
  };
}

export function encodeSandboxSecurityCanonicalProjection(
  projection: Readonly<SandboxSecurityCanonicalEvaluationProjection>
): Uint8Array {
  const canonical = canonicalizeSandboxSecurityJson(projection);
  return Buffer.from(canonical, "utf8");
}

function assertBrandedRequest(
  request: Readonly<NormalizedSandboxSecurityEvaluationRequest>
): void {
  if (
    request === null ||
    typeof request !== "object" ||
    Reflect.get(request, sandboxSecurityEvaluationRequestBrand) !== true
  ) {
    throw new SandboxSecurityInputBoundaryError("unbranded evaluation request");
  }
}

export function prepareSandboxSecurityInput(
  request: Readonly<NormalizedSandboxSecurityEvaluationRequest>
): Readonly<SandboxSecurityPreparedInput> {
  assertBrandedRequest(request);

  const evaluation_nonce = mintNonce();
  if (!NONCE_PATTERN.test(evaluation_nonce)) {
    throw new SandboxSecurityInputBoundaryError("invalid evaluation nonce");
  }

  const sources = request.authoritative_context.sources.map(cloneSourceObservation);
  const projection: SandboxSecurityCanonicalEvaluationProjection = {
    schema_version: "sandbox-security-canonical-evaluation.v1",
    evaluation_mode: request.authoritative_context.evaluation_mode,
    stage: request.authoritative_context.stage,
    policy_profile_id: request.authoritative_context.policy_profile_id,
    sources,
    ...(request.authoritative_context.tool_request
      ? {
          tool_request: cloneToolObservation(
            request.authoritative_context.tool_request
          )
        }
      : {})
  };

  const projectionBytes = encodeSandboxSecurityCanonicalProjection(projection);
  if (projectionBytes.byteLength > SANDBOX_SECURITY_MAX_REQUEST_BYTES) {
    throw new SandboxSecurityInputBoundaryError(
      "canonical projection exceeds 512 KiB"
    );
  }

  const contents: SandboxSecurityAuthorityBoundContent[] = sources.map(
    (source, index) => {
      if (source.media_type === "text/plain") {
        const text = source.value as string;
        const original_utf8_bytes = Object.freeze(utf8ByteArray(text));
        return {
          source_handle: mintSourceHandle(evaluation_nonce, index + 1),
          source_id: source.source_id,
          source_type: source.source_type,
          media_type: "text/plain",
          authority_kind: source.authority_kind,
          value: text,
          provenance_ref: source.provenance_ref,
          original_utf8_bytes,
          original_value_sha256: sha256Bytes(original_utf8_bytes),
          comparison_value: text.normalize("NFKC")
        };
      }

      const jsonValue = deepCloneJson(source.value as SandboxSecurityJsonValue);
      const jcs = canonicalizeSandboxSecurityJson(jsonValue);
      const jcsBytes = Buffer.from(jcs, "utf8");
      return {
        source_handle: mintSourceHandle(evaluation_nonce, index + 1),
        source_id: source.source_id,
        source_type: source.source_type,
        media_type: "application/json",
        authority_kind: source.authority_kind,
        value: jsonValue,
        provenance_ref: source.provenance_ref,
        original_utf8_bytes: Object.freeze(Array.from(jcsBytes)),
        original_value_sha256: sha256CanonicalJson(jsonValue),
        comparison_value: nfkcComparisonValue(jsonValue)
      };
    }
  );

  let tool_request: SandboxSecurityNormalizedToolRequest | undefined;
  if (request.authoritative_context.tool_request) {
    const tool = request.authoritative_context.tool_request;
    const args = deepCloneJson(tool.arguments);
    tool_request = {
      call_handle: mintCallHandle(evaluation_nonce),
      call_id: tool.call_id,
      authority_kind: tool.authority_kind,
      tool_name: tool.tool_name,
      arguments: args,
      arguments_jcs_sha256: sha256CanonicalJson(args),
      has_target: tool.target !== undefined,
      ...(tool.target !== undefined ? { target: tool.target } : {})
    };
  }

  const prepared: SandboxSecurityPreparedInput = {
    evaluation_nonce,
    request_id: request.submission.request_id,
    evaluation_mode: request.authoritative_context.evaluation_mode,
    stage: request.authoritative_context.stage,
    policy_profile_id: request.authoritative_context.policy_profile_id,
    contents,
    ...(tool_request ? { tool_request } : {}),
    canonical_projection: projection,
    canonical_projection_sha256: createHash("sha256")
      .update(projectionBytes)
      .digest("hex")
  };

  return deepFreeze(prepared);
}
