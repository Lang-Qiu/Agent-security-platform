import { randomBytes as nodeRandomBytes, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";

import type { SandboxSecurityRuntimePort } from "./ports/runtime.ts";
import type { SandboxSecurityProductionMode } from "./sandbox-security.types.ts";

const CONFIGURATION_ERROR = "SANDBOX_SECURITY_CONFIGURATION_INVALID";
const MODES = ["rule_only", "local", "local_and_judge"] as const;
const HMAC_KEY_NAME = "SANDBOX_SECURITY_DEPLOYMENT_HMAC_KEY";
const ADMIN_TOKEN_NAME = "SANDBOX_SECURITY_ADMIN_BOOTSTRAP_TOKEN";
const STORAGE_PATH_NAME = "SANDBOX_SECURITY_STORAGE_PATH";
const MODE_NAME = "SANDBOX_SECURITY_PRODUCTION_MODE";

export interface SandboxSecurityConfiguration {
  storage_path: string;
  deployment_hmac_key: Uint8Array;
  admin_bootstrap_token: string;
  production_mode: SandboxSecurityProductionMode;
}

function invalidConfiguration(): never {
  const error = new Error(CONFIGURATION_ERROR);
  error.name = CONFIGURATION_ERROR;
  (error as Error & { code: string }).code = CONFIGURATION_ERROR;
  throw error;
}

function readEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string
): string | undefined {
  if (environment === null || typeof environment !== "object") {
    return invalidConfiguration();
  }
  const descriptor = Object.getOwnPropertyDescriptor(environment, key);
  if (descriptor === undefined) return undefined;
  if (
    !("value" in descriptor) ||
    (descriptor.value !== undefined && typeof descriptor.value !== "string")
  ) {
    return invalidConfiguration();
  }
  return descriptor.value;
}

function requiredEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string
): string {
  const value = readEnvironmentValue(environment, key);
  if (value === undefined || value.length === 0) return invalidConfiguration();
  return value;
}

function decodeDeploymentKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    return invalidConfiguration();
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    return invalidConfiguration();
  }
  if (
    decoded.byteLength !== 32 ||
    decoded.toString("base64url") !== value
  ) {
    return invalidConfiguration();
  }
  return new Uint8Array(decoded);
}

function validateAdminToken(value: string): string {
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return invalidConfiguration();
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    return invalidConfiguration();
  }
  if (
    decoded.byteLength !== 32 ||
    decoded.toString("base64url") !== value
  ) {
    return invalidConfiguration();
  }
  return value;
}

export function loadSandboxSecurityConfiguration(
  environment: Readonly<Record<string, string | undefined>>
): Readonly<SandboxSecurityConfiguration> {
  const storagePath = requiredEnvironmentValue(environment, STORAGE_PATH_NAME);
  if (!isAbsolute(storagePath) || storagePath.includes("\u0000")) {
    return invalidConfiguration();
  }
  const deploymentKey = decodeDeploymentKey(
    requiredEnvironmentValue(environment, HMAC_KEY_NAME)
  );
  const adminToken = validateAdminToken(
    requiredEnvironmentValue(environment, ADMIN_TOKEN_NAME)
  );
  const productionMode = requiredEnvironmentValue(environment, MODE_NAME);
  if (!MODES.includes(productionMode as SandboxSecurityProductionMode)) {
    return invalidConfiguration();
  }

  return Object.freeze({
    storage_path: storagePath,
    deployment_hmac_key: deploymentKey,
    admin_bootstrap_token: adminToken,
    production_mode: productionMode as SandboxSecurityProductionMode
  });
}

export function createSandboxSecurityNodeRuntimePort(): SandboxSecurityRuntimePort {
  return Object.freeze({
    now: () => new Date().toISOString(),
    monotonicNowMs: () => performance.now(),
    randomBytes: (length: number) => {
      if (!Number.isSafeInteger(length) || length < 0) {
        throw new RangeError("random byte length must be a non-negative safe integer");
      }
      return new Uint8Array(nodeRandomBytes(length));
    },
    nextCapabilityId: () => `capability:${randomUUID()}`,
    nextAuditEventId: () => `audit:${randomUUID()}`,
    nextDecisionId: () => `decision:${randomUUID()}`,
    scheduleTimeout: (delayMs: number, callback: () => void) => {
      let cancelled = false;
      const timer = setTimeout(() => {
        if (!cancelled) callback();
      }, delayMs);
      return () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timer);
      };
    },
    scheduleInterval: (delayMs: number, callback: () => void) => {
      let cancelled = false;
      let unrefCalled = false;
      const timer = setInterval(() => {
        if (!cancelled) callback();
      }, delayMs);
      return {
        unref: () => {
          if (unrefCalled) return;
          unrefCalled = true;
          timer.unref();
        },
        cancel: () => {
          if (cancelled) return;
          cancelled = true;
          clearInterval(timer);
        }
      };
    }
  });
}

export { CONFIGURATION_ERROR as SANDBOX_SECURITY_CONFIGURATION_INVALID };
