import type {
  SandboxSecurityRuntimePorts as SandboxSecurityEngineRuntimePorts
} from "../../../../../engines/sandbox/src/security/index.ts";

export interface SandboxSecurityRuntimePort {
  now(): string;
  monotonicNowMs(): number;
  randomBytes(length: number): Uint8Array;
  nextCapabilityId(): string;
  nextAuditEventId(): string;
  nextDecisionId(): string;
  scheduleTimeout(delayMs: number, callback: () => void): () => void;
  scheduleInterval(
    delayMs: number,
    callback: () => void
  ): Readonly<{ unref(): void; cancel(): void }>;
}

export function toSandboxSecurityEngineRuntime(
  runtime: SandboxSecurityRuntimePort
): SandboxSecurityEngineRuntimePorts {
  const projected: SandboxSecurityEngineRuntimePorts = {
    now: () => runtime.now(),
    nextDecisionId: () => runtime.nextDecisionId(),
    monotonicNowMs: () => runtime.monotonicNowMs(),
    scheduleTimeout: (delayMs, callback) =>
      runtime.scheduleTimeout(delayMs, callback)
  };
  return Object.freeze(projected);
}
