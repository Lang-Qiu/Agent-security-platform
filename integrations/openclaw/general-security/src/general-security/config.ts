export const OPENCLAW_SECURITY_AUDIT_PATH =
  "/internal/sandbox/security/enforcement-events" as const;

export const OPENCLAW_SECURITY_DEFAULT_INTERNAL_AUDIT_ORIGIN =
  "http://sandbox-security-backend:3001" as const;

export const OPENCLAW_SECURITY_POLICY_PROFILE_IDS = [
  "sandbox-security-balanced.v1",
  "sandbox-security-strict.v1"
] as const;

export const OPENCLAW_SECURITY_PRODUCTION_MODES = [
  "rule_only",
  "local",
  "local_and_judge"
] as const;

export type OpenClawSecurityPolicyProfileId =
  (typeof OPENCLAW_SECURITY_POLICY_PROFILE_IDS)[number];

export type OpenClawSecurityProductionMode =
  (typeof OPENCLAW_SECURITY_PRODUCTION_MODES)[number];

export interface OpenClawSandboxSecurityConfig {
  readonly policyProfileId: OpenClawSecurityPolicyProfileId;
  readonly productionMode: OpenClawSecurityProductionMode;
  readonly auditEndpoint: string;
  readonly auditCapabilityToken: string;
}

export interface OpenClawSecurityConfigOptions {
  readonly internalAuditOrigins?: readonly string[];
}

const CONFIG_KEYS = [
  "policyProfileId",
  "productionMode",
  "auditEndpoint",
  "auditCapabilityToken"
] as const;

function invalidConfig(): never {
  const error = new Error("invalid OpenClaw security configuration");
  error.name = "openclaw_security_config_invalid";
  throw error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataKeys(
  value: Record<string, unknown>
): value is Record<(typeof CONFIG_KEYS)[number], unknown> {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== CONFIG_KEYS.length ||
    !CONFIG_KEYS.every((key) => ownKeys.includes(key))
  ) {
    return false;
  }

  for (const key of CONFIG_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return false;
    }
  }
  return true;
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeAllowedOrigins(
  origins: readonly string[] | undefined
): ReadonlySet<string> {
  if (origins !== undefined && !Array.isArray(origins)) {
    invalidConfig();
  }

  const normalized = new Set<string>();
  for (const origin of [
    OPENCLAW_SECURITY_DEFAULT_INTERNAL_AUDIT_ORIGIN,
    ...(origins ?? [])
  ]) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin === null) {
      invalidConfig();
    }
    normalized.add(normalizedOrigin);
  }
  return normalized;
}

function normalizeAuditEndpoint(
  value: unknown,
  allowedOrigins: ReadonlySet<string>
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      !allowedOrigins.has(url.origin) ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== OPENCLAW_SECURITY_AUDIT_PATH ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

export function normalizeOpenClawSecurityConfig(
  value: unknown,
  options: Readonly<OpenClawSecurityConfigOptions> = {}
): Readonly<OpenClawSandboxSecurityConfig> {
  if (!isPlainObject(value) || !hasExactOwnDataKeys(value)) {
    invalidConfig();
  }

  const allowedOrigins = normalizeAllowedOrigins(options.internalAuditOrigins);
  if (
    typeof value.policyProfileId !== "string" ||
    !OPENCLAW_SECURITY_POLICY_PROFILE_IDS.includes(
      value.policyProfileId as OpenClawSecurityPolicyProfileId
    ) ||
    typeof value.productionMode !== "string" ||
    !OPENCLAW_SECURITY_PRODUCTION_MODES.includes(
      value.productionMode as OpenClawSecurityProductionMode
    ) ||
    typeof value.auditCapabilityToken !== "string" ||
    !/^sbxcap_v1\.[A-Za-z0-9_-]{43}$/.test(
      value.auditCapabilityToken as string
    )
  ) {
    invalidConfig();
  }

  const auditEndpoint = normalizeAuditEndpoint(
    value.auditEndpoint,
    allowedOrigins
  );
  if (auditEndpoint === null) {
    invalidConfig();
  }

  return deepFreeze({
    policyProfileId: value.policyProfileId as OpenClawSecurityPolicyProfileId,
    productionMode: value.productionMode as OpenClawSecurityProductionMode,
    auditEndpoint,
    auditCapabilityToken: value.auditCapabilityToken as string
  });
}
