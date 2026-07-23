import {
  SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES,
  createSandboxSecurityDefaultHttpTransport,
  type SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  resolveSandboxSecurityJudgeProtocol,
  type SandboxSecurityJudgeProtocolId
} from "./judge-protocol-adapter.ts";

export type SandboxSecurityProductionMode =
  | "rule_only"
  | "local"
  | "local_and_judge";

export type SandboxSecurityProductionConfigSummary = Readonly<{
  ollama_configured: boolean;
  judge_configured: boolean;
  ollama_digest?: string;
  judge_protocol_id?: SandboxSecurityJudgeProtocolId;
  judge_endpoint_policy_id?: string;
  judge_base_url?: string;
  judge_endpoint_url?: string;
  judge_requested_model?: string;
}>;

export interface SandboxSecurityProductionConfig {
  readonly mode: SandboxSecurityProductionMode;
  readonly summary: SandboxSecurityProductionConfigSummary;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const JUDGE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const INVALID_CONFIG_ERROR = "sandbox_security_production_config_invalid";
const OLLAMA_DIGEST_ENV = "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST";
const JUDGE_PROTOCOL_ENV = "SANDBOX_SECURITY_JUDGE_PROTOCOL";
const JUDGE_BASE_URL_ENV = "SANDBOX_SECURITY_JUDGE_BASE_URL";
const JUDGE_MODEL_ENV = "SANDBOX_SECURITY_JUDGE_MODEL";
const JUDGE_API_KEY_ENV = "SANDBOX_SECURITY_JUDGE_API_KEY";
const ENABLE_JUDGE_ENV = "SANDBOX_SECURITY_ENABLE_JUDGE";

interface PrivateConfigState {
  expected_ollama_digest: string | null;
  judge_protocol_id: SandboxSecurityJudgeProtocolId | null;
  judge_api_key: string | null;
  judge_endpoint_url: string | null;
}

const PRIVATE_CONFIG_STATES = new WeakMap<
  Readonly<SandboxSecurityProductionConfig>,
  PrivateConfigState
>();

function invalidConfig(): never {
  const error = new Error(INVALID_CONFIG_ERROR);
  error.name = INVALID_CONFIG_ERROR;
  throw error;
}

function readOwnEnvironmentValue(
  env: Readonly<Record<string, string | undefined>>,
  key: string
): string | undefined {
  try {
    if (typeof env !== "object" || env === null) {
      return invalidConfig();
    }
    const descriptor = Object.getOwnPropertyDescriptor(env, key);
    if (descriptor === undefined) {
      return undefined;
    }
    if (
      !("value" in descriptor) ||
      (typeof descriptor.value !== "string" && descriptor.value !== undefined)
    ) {
      return invalidConfig();
    }
    return descriptor.value;
  } catch {
    return invalidConfig();
  }
}

function validateJudgeApiKey(value: string): string {
  if (
    value.length === 0 ||
    value.length > SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    new TextEncoder().encode(value).byteLength >
      SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES
  ) {
    return invalidConfig();
  }
  return value;
}

function bindConfigView(
  mode: SandboxSecurityProductionMode,
  summary: SandboxSecurityProductionConfigSummary,
  expectedOllamaDigest: string | null,
  judgeProtocolId: SandboxSecurityJudgeProtocolId | null,
  judgeApiKey: string | null,
  judgeEndpointUrl: string | null
): Readonly<SandboxSecurityProductionConfig> {
  const config = Object.freeze({
    mode,
    summary: Object.freeze(summary)
  });
  PRIVATE_CONFIG_STATES.set(config, {
    expected_ollama_digest: expectedOllamaDigest,
    judge_protocol_id: judgeProtocolId,
    judge_api_key: judgeApiKey,
    judge_endpoint_url: judgeEndpointUrl
  });
  return config;
}

export function normalizeSandboxSecurityProductionConfigForTest(
  env: Readonly<Record<string, string | undefined>>,
  mode: SandboxSecurityProductionMode
): Readonly<SandboxSecurityProductionConfig> {
  if (mode === "rule_only") {
    return bindConfigView(
      mode,
      {
        ollama_configured: false,
        judge_configured: false
      },
      null,
      null,
      null,
      null
    );
  }
  if (mode !== "local" && mode !== "local_and_judge") {
    return invalidConfig();
  }
  const digest = readOwnEnvironmentValue(env, OLLAMA_DIGEST_ENV)?.trim();
  if (digest === undefined || !SHA256_DIGEST.test(digest)) {
    return invalidConfig();
  }

  let judgeProtocolId: SandboxSecurityJudgeProtocolId | null = null;
  let judgeApiKey: string | null = null;
  let judgeEndpointUrl: string | null = null;
  let judgeSummary: SandboxSecurityProductionConfigSummary = {
    ollama_configured: true,
    judge_configured: false,
    ollama_digest: digest
  };

  if (mode === "local_and_judge") {
    const protocolId = readOwnEnvironmentValue(env, JUDGE_PROTOCOL_ENV);
    const baseUrl = readOwnEnvironmentValue(env, JUDGE_BASE_URL_ENV)?.trim();
    const requestedModel = readOwnEnvironmentValue(env, JUDGE_MODEL_ENV)?.trim();
    const rawKey = readOwnEnvironmentValue(env, JUDGE_API_KEY_ENV);
    const enableJudge = readOwnEnvironmentValue(env, ENABLE_JUDGE_ENV);

    if (
      protocolId === undefined ||
      baseUrl === undefined ||
      requestedModel === undefined ||
      rawKey === undefined ||
      enableJudge !== "1"
    ) {
      return invalidConfig();
    }
    if (
      rawKey.length > SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES
    ) {
      return invalidConfig();
    }
    const normalizedKey = rawKey.trim();
    if (!JUDGE_MODEL.test(requestedModel)) {
      return invalidConfig();
    }

    let binding: ReturnType<typeof resolveSandboxSecurityJudgeProtocol>;
    try {
      binding = resolveSandboxSecurityJudgeProtocol(
        protocolId as SandboxSecurityJudgeProtocolId,
        baseUrl
      );
    } catch {
      return invalidConfig();
    }
    judgeProtocolId = binding.protocol_id;
    judgeApiKey = validateJudgeApiKey(normalizedKey);
    judgeEndpointUrl = binding.endpoint_url;
    judgeSummary = {
      ollama_configured: true,
      judge_configured: true,
      ollama_digest: digest,
      judge_protocol_id: binding.protocol_id,
      judge_endpoint_policy_id: binding.endpoint_policy_id,
      judge_base_url: binding.base_url,
      judge_endpoint_url: binding.endpoint_url,
      judge_requested_model: requestedModel
    };
  }

  const config = bindConfigView(
    mode,
    judgeSummary,
    digest,
    judgeProtocolId,
    judgeApiKey,
    judgeEndpointUrl
  );
  judgeProtocolId = null;
  judgeApiKey = null;
  judgeEndpointUrl = null;
  return config;
}

export function createSandboxSecurityProductionConfig(
  mode: SandboxSecurityProductionMode
): Readonly<SandboxSecurityProductionConfig> {
  return normalizeSandboxSecurityProductionConfigForTest(process.env, mode);
}

export function createSandboxSecurityProductionTransport(
  config: Readonly<SandboxSecurityProductionConfig>
): SandboxSecurityHttpTransport {
  let privateState: PrivateConfigState | undefined;
  try {
    if (
      (typeof config !== "object" && typeof config !== "function") ||
      config === null
    ) {
      return invalidConfig();
    }
    privateState = PRIVATE_CONFIG_STATES.get(config);
  } catch {
    return invalidConfig();
  }
  if (privateState === undefined) {
    return invalidConfig();
  }
  PRIVATE_CONFIG_STATES.delete(config);

  const expectedOllamaDigest = privateState.expected_ollama_digest;
  let judgeProtocolId = privateState.judge_protocol_id;
  let judgeApiKey = privateState.judge_api_key;
  let judgeEndpointUrl = privateState.judge_endpoint_url;
  privateState.expected_ollama_digest = null;
  privateState.judge_protocol_id = null;
  privateState.judge_api_key = null;
  privateState.judge_endpoint_url = null;

  try {
    return createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: expectedOllamaDigest,
      judge_protocol_id: judgeProtocolId,
      judge_api_key: judgeApiKey,
      judge_endpoint_url: judgeEndpointUrl
    });
  } finally {
    judgeProtocolId = null;
    judgeApiKey = null;
    judgeEndpointUrl = null;
  }
}
