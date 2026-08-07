export const OPENCLAW_GENERAL_SECURITY_PACKAGE_IDENTITY = Object.freeze({
  packageName: "@agent-security-platform/openclaw-general-security",
  packageVersion: "0.1.0",
  pluginId: "agent-security-sandbox-general",
  pluginVersion: "1.0.0",
  openclawVersion: "2026.6.34"
} as const);

export {
  normalizeOpenClawSecurityConfig,
  OPENCLAW_SECURITY_AUDIT_PATH,
  OPENCLAW_SECURITY_DEFAULT_INTERNAL_AUDIT_ORIGIN,
  OPENCLAW_SECURITY_POLICY_PROFILE_IDS,
  OPENCLAW_SECURITY_PRODUCTION_MODES
} from "./general-security/config.ts";
export type {
  OpenClawSandboxSecurityConfig,
  OpenClawSecurityConfigOptions,
  OpenClawSecurityPolicyProfileId,
  OpenClawSecurityProductionMode
} from "./general-security/config.ts";

export {
  createOpenClawSecurityRuntime,
  createOpenClawSecurityRuntimePorts,
  issueOpenClawSecurityEvaluationRequestId,
  normalizeOpenClawSecurityEvaluationRequestId,
  OPENCLAW_SECURITY_ENGINE_TIMEOUT_MS
} from "./general-security/runtime.ts";
export type {
  OpenClawSecurityEngineFactory,
  OpenClawSecurityEngineFactoryInput,
  OpenClawSecurityEvaluationRequestId,
  OpenClawSecurityEvaluationResult,
  OpenClawSecurityHealth,
  OpenClawSecurityInterruptionCode,
  OpenClawSecurityRequestIdIssueResult,
  OpenClawSecurityRuntime,
  OpenClawSecurityRuntimePorts
} from "./general-security/runtime.ts";

export {
  buildOpenClawSecurityEvaluationRequest
} from "./general-security/authority-builder.ts";
export type {
  OpenClawSecurityAssistantProjection,
  OpenClawSecurityBarrierObservation,
  OpenClawSecurityCorrelation
} from "./general-security/authority-builder.ts";

export * from "./general-security/config.ts";
export * from "./general-security/runtime.ts";
