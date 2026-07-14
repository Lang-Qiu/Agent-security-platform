import { normalizeSandboxSecurityRequest } from "../../../../shared/contracts/sandbox-security.ts";
import type {
  SandboxSecurityClaimedSourceType,
  SandboxSecurityJsonValue,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRequest,
  SandboxSecurityStage,
  SandboxSecuritySubmittedContentItem,
  SandboxSecurityToolRequest
} from "../../../../shared/types/sandbox-security.ts";
import { sandboxSecurityJsonCanonicalEqual } from "./canonical-json.ts";

export type SandboxSecurityEvaluationMode = "simulation" | "enforcement";

export type SandboxSecurityAuthorityKind =
  | "platform_control"
  | "integration_observation"
  | "simulation_observation";

export interface AuthenticatedSourceObservation {
  source_id: string;
  authority_kind: SandboxSecurityAuthorityKind;
  source_type: SandboxSecurityClaimedSourceType;
  media_type: "text/plain" | "application/json";
  value: string | SandboxSecurityJsonValue;
  provenance_ref: string;
}

export interface AuthenticatedToolObservation {
  authority_kind: "integration_observation" | "simulation_observation";
  call_id: string;
  tool_name: string;
  target?: string;
  arguments: SandboxSecurityJsonValue;
}

export interface SandboxSecurityAuthoritativeEvaluationContext {
  schema_version: "sandbox-security-authoritative-context.v1";
  evaluation_mode: SandboxSecurityEvaluationMode;
  stage: SandboxSecurityStage;
  policy_profile_id: SandboxSecurityPolicyProfileId;
  sources: readonly AuthenticatedSourceObservation[];
  tool_request?: Readonly<AuthenticatedToolObservation>;
}

export interface SandboxSecurityEvaluationRequest {
  submission: Readonly<SandboxSecurityRequest>;
  authoritative_context: Readonly<SandboxSecurityAuthoritativeEvaluationContext>;
}

export const sandboxSecurityEvaluationRequestBrand: unique symbol = Symbol(
  "sandboxSecurityEvaluationRequestBrand"
);

export type NormalizedSandboxSecurityEvaluationRequest = {
  readonly submission: SandboxSecurityRequest;
  readonly authoritative_context: SandboxSecurityAuthoritativeEvaluationContext;
  readonly [sandboxSecurityEvaluationRequestBrand]: true;
};

export class SandboxSecurityAuthorityError extends Error {
  readonly code:
    | "sandbox_security_authority_mismatch"
    | "sandbox_security_source_authority_invalid";

  constructor(
    code:
      | "sandbox_security_authority_mismatch"
      | "sandbox_security_source_authority_invalid",
    message = code
  ) {
    super(message);
    this.name = "SandboxSecurityAuthorityError";
    this.code = code;
  }
}

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): value is PlainRecord {
  if (!isPlainRecord(value)) {
    return false;
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

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
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
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

function cloneSubmission(request: SandboxSecurityRequest): SandboxSecurityRequest {
  const contentItems = request.content_items.map((item) => {
    if (item.media_type === "text/plain") {
      return {
        source_id: item.source_id,
        claimed_source_type: item.claimed_source_type,
        media_type: "text/plain" as const,
        value: item.value,
        provenance_ref: item.provenance_ref
      };
    }
    return {
      source_id: item.source_id,
      claimed_source_type: item.claimed_source_type,
      media_type: "application/json" as const,
      value: deepCloneJson(item.value as SandboxSecurityJsonValue),
      provenance_ref: item.provenance_ref
    };
  });

  if (!request.tool_request) {
    return {
      schema_version: "sandbox-security-request.v1",
      request_id: request.request_id,
      stage: request.stage,
      policy_profile_id: request.policy_profile_id,
      content_items: contentItems
    };
  }

  const tool: SandboxSecurityToolRequest = {
    call_id: request.tool_request.call_id,
    tool_name: request.tool_request.tool_name,
    arguments: deepCloneJson(request.tool_request.arguments),
    ...(request.tool_request.target !== undefined
      ? { target: request.tool_request.target }
      : {})
  };

  return {
    schema_version: "sandbox-security-request.v1",
    request_id: request.request_id,
    stage: request.stage,
    policy_profile_id: request.policy_profile_id,
    content_items: contentItems,
    tool_request: tool
  };
}

function valuesEqual(
  mediaType: "text/plain" | "application/json",
  left: string | SandboxSecurityJsonValue,
  right: string | SandboxSecurityJsonValue
): boolean {
  if (mediaType === "text/plain") {
    return typeof left === "string" && typeof right === "string" && left === right;
  }
  return sandboxSecurityJsonCanonicalEqual(left, right);
}

function isAuthorityKind(value: unknown): value is SandboxSecurityAuthorityKind {
  return (
    value === "platform_control" ||
    value === "integration_observation" ||
    value === "simulation_observation"
  );
}

function isMode(value: unknown): value is SandboxSecurityEvaluationMode {
  return value === "simulation" || value === "enforcement";
}

function isMediaType(value: unknown): value is "text/plain" | "application/json" {
  return value === "text/plain" || value === "application/json";
}

function authorityAllowedForMode(
  mode: SandboxSecurityEvaluationMode,
  kind: SandboxSecurityAuthorityKind
): boolean {
  if (mode === "simulation") {
    return kind === "simulation_observation";
  }
  // enforcement: platform_control and integration_observation only
  return kind === "platform_control" || kind === "integration_observation";
}

function parseSourceObservation(
  value: unknown
): AuthenticatedSourceObservation | null {
  if (
    !hasExactOwnDataProperties(value, [
      "source_id",
      "authority_kind",
      "source_type",
      "media_type",
      "value",
      "provenance_ref"
    ]) ||
    typeof value.source_id !== "string" ||
    !isAuthorityKind(value.authority_kind) ||
    typeof value.source_type !== "string" ||
    !isMediaType(value.media_type) ||
    typeof value.provenance_ref !== "string"
  ) {
    return null;
  }

  if (value.media_type === "text/plain") {
    if (typeof value.value !== "string") {
      return null;
    }
    return {
      source_id: value.source_id,
      authority_kind: value.authority_kind,
      source_type: value.source_type as SandboxSecurityClaimedSourceType,
      media_type: "text/plain",
      value: value.value,
      provenance_ref: value.provenance_ref
    };
  }

  // application/json - structural acceptance; equality uses JCS later
  return {
    source_id: value.source_id,
    authority_kind: value.authority_kind,
    source_type: value.source_type as SandboxSecurityClaimedSourceType,
    media_type: "application/json",
    value: deepCloneJson(value.value as SandboxSecurityJsonValue),
    provenance_ref: value.provenance_ref
  };
}

function parseToolObservation(
  value: unknown
): AuthenticatedToolObservation | null {
  if (
    !hasExactOwnDataProperties(
      value,
      ["authority_kind", "call_id", "tool_name", "arguments"],
      ["target"]
    ) ||
    (value.authority_kind !== "integration_observation" &&
      value.authority_kind !== "simulation_observation") ||
    typeof value.call_id !== "string" ||
    typeof value.tool_name !== "string"
  ) {
    return null;
  }

  return {
    authority_kind: value.authority_kind,
    call_id: value.call_id,
    tool_name: value.tool_name,
    arguments: deepCloneJson(value.arguments as SandboxSecurityJsonValue),
    ...(Object.hasOwn(value, "target")
      ? { target: value.target as string }
      : {})
  };
}

function parseAuthoritativeContext(
  value: unknown
): SandboxSecurityAuthoritativeEvaluationContext {
  if (
    !hasExactOwnDataProperties(
      value,
      [
        "schema_version",
        "evaluation_mode",
        "stage",
        "policy_profile_id",
        "sources"
      ],
      ["tool_request"]
    ) ||
    value.schema_version !== "sandbox-security-authoritative-context.v1" ||
    !isMode(value.evaluation_mode) ||
    typeof value.stage !== "string" ||
    typeof value.policy_profile_id !== "string" ||
    !Array.isArray(value.sources)
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_source_authority_invalid"
    );
  }

  const sources: AuthenticatedSourceObservation[] = [];
  const seen = new Set<string>();
  for (const item of value.sources) {
    const parsed = parseSourceObservation(item);
    if (parsed === null || seen.has(parsed.source_id)) {
      throw new SandboxSecurityAuthorityError(
        "sandbox_security_source_authority_invalid"
      );
    }
    if (!authorityAllowedForMode(value.evaluation_mode, parsed.authority_kind)) {
      throw new SandboxSecurityAuthorityError(
        "sandbox_security_source_authority_invalid"
      );
    }
    seen.add(parsed.source_id);
    sources.push(parsed);
  }

  let tool_request: AuthenticatedToolObservation | undefined;
  if (Object.hasOwn(value, "tool_request")) {
    const parsedTool = parseToolObservation(value.tool_request);
    if (parsedTool === null) {
      throw new SandboxSecurityAuthorityError(
        "sandbox_security_source_authority_invalid"
      );
    }
    if (!authorityAllowedForMode(value.evaluation_mode, parsedTool.authority_kind)) {
      throw new SandboxSecurityAuthorityError(
        "sandbox_security_source_authority_invalid"
      );
    }
    // tool observation never uses platform_control (type-level), already checked
    tool_request = parsedTool;
  }

  return {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: value.evaluation_mode,
    stage: value.stage as SandboxSecurityStage,
    policy_profile_id: value.policy_profile_id as SandboxSecurityPolicyProfileId,
    sources,
    ...(tool_request ? { tool_request } : {})
  };
}

function assertContentMatch(
  item: SandboxSecuritySubmittedContentItem,
  source: AuthenticatedSourceObservation
): void {
  if (
    item.source_id !== source.source_id ||
    item.claimed_source_type !== source.source_type ||
    item.media_type !== source.media_type ||
    item.provenance_ref !== source.provenance_ref ||
    !valuesEqual(item.media_type, item.value, source.value)
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_authority_mismatch"
    );
  }
}

function assertToolMatch(
  submissionTool: SandboxSecurityToolRequest | undefined,
  authorityTool: AuthenticatedToolObservation | undefined
): void {
  const submissionPresent = submissionTool !== undefined;
  const authorityPresent = authorityTool !== undefined;
  if (submissionPresent !== authorityPresent) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_authority_mismatch"
    );
  }
  if (!submissionTool || !authorityTool) {
    return;
  }
  if (
    submissionTool.call_id !== authorityTool.call_id ||
    submissionTool.tool_name !== authorityTool.tool_name ||
    (submissionTool.target ?? undefined) !== (authorityTool.target ?? undefined) ||
    !sandboxSecurityJsonCanonicalEqual(
      submissionTool.arguments,
      authorityTool.arguments
    )
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_authority_mismatch"
    );
  }
}

export function normalizeSandboxSecurityEvaluationRequest(
  value: unknown
): Readonly<NormalizedSandboxSecurityEvaluationRequest> {
  if (
    !hasExactOwnDataProperties(value, ["submission", "authoritative_context"])
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_source_authority_invalid"
    );
  }

  const submission = normalizeSandboxSecurityRequest(value.submission);
  if (submission === null) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_source_authority_invalid"
    );
  }

  const authoritative_context = parseAuthoritativeContext(
    value.authoritative_context
  );

  if (
    submission.stage !== authoritative_context.stage ||
    submission.policy_profile_id !== authoritative_context.policy_profile_id
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_authority_mismatch"
    );
  }

  if (
    submission.content_items.length !== authoritative_context.sources.length
  ) {
    throw new SandboxSecurityAuthorityError(
      "sandbox_security_authority_mismatch"
    );
  }

  for (let index = 0; index < submission.content_items.length; index += 1) {
    assertContentMatch(
      submission.content_items[index],
      authoritative_context.sources[index]
    );
  }

  assertToolMatch(submission.tool_request, authoritative_context.tool_request);

  const clonedSubmission = cloneSubmission(submission);
  const clonedContext: SandboxSecurityAuthoritativeEvaluationContext = {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: authoritative_context.evaluation_mode,
    stage: authoritative_context.stage,
    policy_profile_id: authoritative_context.policy_profile_id,
    sources: authoritative_context.sources.map((source) => ({
      source_id: source.source_id,
      authority_kind: source.authority_kind,
      source_type: source.source_type,
      media_type: source.media_type,
      value:
        source.media_type === "text/plain"
          ? source.value
          : deepCloneJson(source.value as SandboxSecurityJsonValue),
      provenance_ref: source.provenance_ref
    })),
    ...(authoritative_context.tool_request
      ? {
          tool_request: {
            authority_kind: authoritative_context.tool_request.authority_kind,
            call_id: authoritative_context.tool_request.call_id,
            tool_name: authoritative_context.tool_request.tool_name,
            arguments: deepCloneJson(
              authoritative_context.tool_request.arguments
            ),
            ...(authoritative_context.tool_request.target !== undefined
              ? { target: authoritative_context.tool_request.target }
              : {})
          }
        }
      : {})
  };

  const branded = {
    submission: deepFreeze(clonedSubmission),
    authoritative_context: deepFreeze(clonedContext),
    [sandboxSecurityEvaluationRequestBrand]: true as const
  };

  return deepFreeze(branded) as Readonly<NormalizedSandboxSecurityEvaluationRequest>;
}
