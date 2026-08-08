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

export {
  mapDecision,
  OPENCLAW_SECURITY_ENFORCEMENT_POINTS,
  OPENCLAW_SECURITY_FAILURE_CODES
} from "./general-security/action-mapper.ts";
export type {
  OpenClawSecurityActionMapping,
  OpenClawSecurityBarrierResult,
  OpenClawSecurityDecisionInput,
  OpenClawSecurityEnforcementPoint,
  OpenClawSecurityFailureCode
} from "./general-security/action-mapper.ts";

export {
  createOpenClawSecurityAuditClient
} from "./general-security/audit-client.ts";
export type {
  OpenClawSecurityAuditAppendResult,
  OpenClawSecurityAuditClient,
  OpenClawSecurityAuditFailureCode,
  OpenClawSecurityAuditTransport,
  OpenClawSecurityScheduleTimeout
} from "./general-security/audit-client.ts";

export {
  createOpenClawSecurityPlugin,
  OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA,
  OPENCLAW_SECURITY_HOOK_NAMES,
  OPENCLAW_SECURITY_HOOK_PRIORITY,
  OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA,
  OPENCLAW_SECURITY_HOOK_TIMEOUT_MS,
  OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA
} from "./general-security/plugin.ts";
export type {
  OpenClawSecurityHookEnvelope,
  OpenClawSecurityHookName,
  OpenClawSecurityOpaqueRunState,
  OpenClawSecurityPlugin,
  OpenClawSecurityPluginApi
} from "./general-security/plugin.ts";

export * from "./general-security/config.ts";
export * from "./general-security/runtime.ts";

export {
  OPENCLAW_SECURITY_RUNTIME_PLUGIN_ID,
  OPENCLAW_SECURITY_RUNTIME_PROBE_COMMAND,
  OPENCLAW_SECURITY_RUNTIME_PROBE_RESULT_KEYS,
  OPENCLAW_SECURITY_RUNTIME_PROBE_SCHEMA,
  OPENCLAW_SECURITY_RUNTIME_VERSION,
  resolveNestedOpenClawCli,
  runOpenClawSecurityRuntimeProbe,
  verifyProductionRuntimeIdentity
} from "./general-security/runtime-probe.ts";
export type {
  OpenClawSecurityRuntimeProbeDynamicResult,
  OpenClawSecurityRuntimeProbeOptions,
  OpenClawSecurityRuntimeProbeResult
} from "./general-security/runtime-probe.ts";

import {
  buildJsonPluginConfigSchema,
  definePluginEntry
} from "openclaw/plugin-sdk/plugin-entry";
import { createOpenClawSecurityRuntimePorts } from "./general-security/runtime.ts";
import {
  createOpenClawSecurityPlugin as createOpenClawSecurityPluginImplementation,
  OPENCLAW_SECURITY_HOOK_NAMES as OPENCLAW_SECURITY_HOOK_NAMES_IMPLEMENTATION,
  OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA as OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA_IMPLEMENTATION
} from "./general-security/plugin.ts";

const GENERAL_SECURITY_CONFIG_SCHEMA = buildJsonPluginConfigSchema({
  type: "object",
  additionalProperties: false,
  required: [
    "policyProfileId",
    "productionMode",
    "auditEndpoint",
    "auditCapabilityToken"
  ],
  properties: {
    policyProfileId: { type: "string" },
    productionMode: { type: "string" },
    auditEndpoint: { type: "string" },
    auditCapabilityToken: { type: "string", writeOnly: true }
  }
});

// OpenClaw registration is synchronous. The security Engine is initialized
// once behind the four synchronous hook registrations and every invocation
// awaits the same initialization promise before delegating to the typed
// plugin handlers.
const GENERAL_SECURITY_RUNTIME_ENTRY = definePluginEntry({
  id: "agent-security-sandbox-general",
  name: "Agent Security Sandbox General",
  description: "Final OpenClaw sandbox security barriers.",
  configSchema: GENERAL_SECURITY_CONFIG_SCHEMA,
  register(api: unknown) {
    if (
      api === null ||
      typeof api !== "object" ||
      typeof (api as { on?: unknown }).on !== "function"
    ) {
      throw new Error("openclaw security typed hook API unavailable");
    }
    const hostApi = api as {
      readonly pluginConfig?: unknown;
      readonly on: (
        name: (typeof import("./general-security/plugin.ts").OPENCLAW_SECURITY_HOOK_NAMES)[number],
        handler: (event: unknown, context: unknown) => Promise<unknown>,
        options: Readonly<{ priority: 1000; timeoutMs: 10000 }>
      ) => void;
    };
    const handlers = new Map<
      string,
      (event: unknown, context: unknown) => Promise<unknown>
    >();
    const runtimePorts = createOpenClawSecurityRuntimePorts();
    const auditTransport = {
      post: async (input: {
        url: string;
        bearer_token: string;
        body: Uint8Array;
        signal: AbortSignal;
      }) => {
        const response = await fetch(input.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.bearer_token}`,
            "content-type": "application/json"
          },
          body: input.body as BodyInit,
          signal: input.signal
        });
        return {
          status: response.status,
          body: new Uint8Array(await response.arrayBuffer())
        };
      }
    };
    const pluginReady = createOpenClawSecurityPluginImplementation({
      config: hostApi.pluginConfig ?? {},
      runtime_ports: runtimePorts,
      audit_transport: auditTransport
    }).then((plugin) => {
      plugin.register({
        on: (
          name: string,
          handler: (event: unknown, context: unknown) => Promise<unknown>
        ) => {
          handlers.set(name, handler);
        }
      });
      return plugin;
    });
    for (const name of OPENCLAW_SECURITY_HOOK_NAMES_IMPLEMENTATION) {
      hostApi.on(
        name,
        async (event, context) => {
          try {
            await pluginReady;
            const handler = handlers.get(name);
            if (handler === undefined) throw new Error("security hook handler unavailable");
            return await handler(event, context);
          } catch {
            return {
              schema_version: OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA_IMPLEMENTATION,
              correlation: {
                runId: "runtime-probe-failure",
                sessionKey: "runtime-probe-failure",
                callId: null
              },
              health: { enforcement: "failed", audit: "degraded" },
              barrier: {
                outcome: "replace",
                replacement_code: "sandbox_security_evaluation_unavailable",
                replacement_text:
                  "Security evaluation unavailable. This action was not completed."
              }
            };
          }
        },
        Object.freeze({ priority: 1000, timeoutMs: 10000 })
      );
    }
  }
});

export default GENERAL_SECURITY_RUNTIME_ENTRY;
