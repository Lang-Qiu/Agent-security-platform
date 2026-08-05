import type { SandboxSecurityAuditRejectionCode } from "./sandbox-security.types.ts";

export class SandboxSecurityClaimCleanupError extends Error {
  readonly code = "SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED" as const;

  constructor() {
    super("SANDBOX_SECURITY_CLAIM_CLEANUP_FAILED");
    this.name = "SandboxSecurityClaimCleanupError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type SandboxSecurityServiceErrorDescriptor =
  | Readonly<{ code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED" }>
  | Readonly<{
      code: "SANDBOX_SECURITY_FORBIDDEN";
      audit_rejection_code:
        | "scope_forbidden"
        | "stage_forbidden"
        | "profile_forbidden";
    }>
  | Readonly<{ code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND" }>
  | Readonly<{
      code: "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID";
      audit_rejection_code: "invalid_request";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT";
      audit_rejection_code: "idempotency_conflict";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS";
      audit_rejection_code: "idempotency_in_progress";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_CONCURRENCY_LIMITED";
      audit_rejection_code: "concurrency_limited";
    }>
  | Readonly<{
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE";
      audit_rejection_code: "storage_unavailable";
    }>
  | Readonly<{ code: "SANDBOX_SECURITY_INTERNAL_ERROR" }>;

const DESCRIPTOR_CODES = new Set<SandboxSecurityServiceErrorDescriptor["code"]>([
  "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED",
  "SANDBOX_SECURITY_FORBIDDEN",
  "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND",
  "SANDBOX_SECURITY_AUDIT_CURSOR_INVALID",
  "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
  "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
  "SANDBOX_SECURITY_CONCURRENCY_LIMITED",
  "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
  "SANDBOX_SECURITY_INTERNAL_ERROR"
]);

const REJECTION_BY_CODE: Readonly<Record<
  Exclude<
    SandboxSecurityServiceErrorDescriptor["code"],
    | "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
    | "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND"
    | "SANDBOX_SECURITY_INTERNAL_ERROR"
  >,
  SandboxSecurityAuditRejectionCode
>> = {
  SANDBOX_SECURITY_FORBIDDEN: "scope_forbidden",
  SANDBOX_SECURITY_AUDIT_CURSOR_INVALID: "invalid_request",
  SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS: "idempotency_in_progress",
  SANDBOX_SECURITY_CONCURRENCY_LIMITED: "concurrency_limited",
  SANDBOX_SECURITY_STORAGE_UNAVAILABLE: "storage_unavailable"
};

function exactOwnKeys(value: object, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function validateDescriptor(
  descriptor: unknown
): asserts descriptor is SandboxSecurityServiceErrorDescriptor {
  if (descriptor === null || typeof descriptor !== "object") {
    throw new TypeError("Invalid sandbox security service error descriptor");
  }

  const candidate = descriptor as Record<string, unknown>;
  const code = candidate.code;
  if (
    typeof code !== "string" ||
    !DESCRIPTOR_CODES.has(code as SandboxSecurityServiceErrorDescriptor["code"])
  ) {
    throw new TypeError("Invalid sandbox security service error descriptor");
  }

  if (code === "SANDBOX_SECURITY_FORBIDDEN") {
    if (
      !exactOwnKeys(candidate, ["code", "audit_rejection_code"]) ||
      !["scope_forbidden", "stage_forbidden", "profile_forbidden"].includes(
        candidate.audit_rejection_code as string
      )
    ) {
      throw new TypeError("Invalid sandbox security service error descriptor");
    }
    return;
  }

  const rejectionCode = (REJECTION_BY_CODE as Record<string, string | undefined>)[code];
  if (rejectionCode !== undefined) {
    if (
      !exactOwnKeys(candidate, ["code", "audit_rejection_code"]) ||
      candidate.audit_rejection_code !== rejectionCode
    ) {
      throw new TypeError("Invalid sandbox security service error descriptor");
    }
    return;
  }

  if (!exactOwnKeys(candidate, ["code"])) {
    throw new TypeError("Invalid sandbox security service error descriptor");
  }
}

export class SandboxSecurityServiceError extends Error {
  readonly code: SandboxSecurityServiceErrorDescriptor["code"];
  readonly audit_rejection_code: SandboxSecurityAuditRejectionCode | null;
  readonly retry_after_seconds: 1 | 60 | null;

  constructor(descriptor: SandboxSecurityServiceErrorDescriptor) {
    super(
      descriptor &&
        typeof descriptor === "object" &&
        "code" in descriptor &&
        typeof descriptor.code === "string"
        ? descriptor.code
        : "INVALID_SANDBOX_SECURITY_SERVICE_ERROR_DESCRIPTOR"
    );
    validateDescriptor(descriptor);
    this.name = "SandboxSecurityServiceError";
    this.code = descriptor.code;
    this.audit_rejection_code =
      "audit_rejection_code" in descriptor
        ? descriptor.audit_rejection_code
        : null;
    this.retry_after_seconds =
      descriptor.code === "SANDBOX_SECURITY_STORAGE_UNAVAILABLE"
        ? 60
        : descriptor.code === "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS" ||
            descriptor.code === "SANDBOX_SECURITY_CONCURRENCY_LIMITED"
          ? 1
          : null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createSandboxSecurityServiceError(
  descriptor: SandboxSecurityServiceErrorDescriptor
): SandboxSecurityServiceError {
  return new SandboxSecurityServiceError(descriptor);
}

export function isSandboxSecurityServiceError(
  error: unknown
): error is SandboxSecurityServiceError {
  return error instanceof SandboxSecurityServiceError;
}
