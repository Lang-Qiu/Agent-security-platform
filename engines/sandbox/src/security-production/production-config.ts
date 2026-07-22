import {
  createSandboxSecurityDefaultHttpTransport,
  type SandboxSecurityHttpTransport
} from "./http-transport.ts";

export type SandboxSecurityProductionMode =
  | "rule_only"
  | "local"
  | "local_and_judge";

export type SandboxSecurityProductionConfigSummary = Readonly<{
  ollama_configured: boolean;
  judge_configured: boolean;
  ollama_digest?: string;
  judge_provider_id?: string;
  judge_base_url?: string;
  judge_responses_url?: string;
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
const JUDGE_BASE_URL_ENV = "SANDBOX_SECURITY_JUDGE_BASE_URL";
const JUDGE_MODEL_ENV = "SANDBOX_SECURITY_JUDGE_MODEL";
const JUDGE_API_KEY_ENV = "SANDBOX_SECURITY_JUDGE_API_KEY";
const ENABLE_JUDGE_ENV = "SANDBOX_SECURITY_ENABLE_JUDGE";

const JUDGE_PROVIDER_ALLOWLIST = Object.freeze([
  Object.freeze({
    provider_id: "doro",
    base_url: "https://doro.lol/v1",
    responses_url: "https://doro.lol/v1/responses"
  })
]);

interface PrivateConfigState {
  expected_ollama_digest: string | null;
  judge_api_key: string | null;
  judge_responses_url: string | null;
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

function resolveAllowlistedJudgeProvider(
  baseUrl: string
): (typeof JUDGE_PROVIDER_ALLOWLIST)[number] {
  for (const entry of JUDGE_PROVIDER_ALLOWLIST) {
    if (entry.base_url === baseUrl) {
      return entry;
    }
  }
  return invalidConfig();
}

function validateJudgeApiKey(value: string): string {
  if (value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    return invalidConfig();
  }
  return value;
}

function bindConfigView(
  mode: SandboxSecurityProductionMode,
  summary: SandboxSecurityProductionConfigSummary,
  expectedOllamaDigest: string | null,
  judgeApiKey: string | null,
  judgeResponsesUrl: string | null
): Readonly<SandboxSecurityProductionConfig> {
  const config = Object.freeze({
    mode,
    summary: Object.freeze(summary)
  });
  PRIVATE_CONFIG_STATES.set(config, {
    expected_ollama_digest: expectedOllamaDigest,
    judge_api_key: judgeApiKey,
    judge_responses_url: judgeResponsesUrl
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

  let judgeApiKey: string | null = null;
  let judgeResponsesUrl: string | null = null;
  let judgeSummary: SandboxSecurityProductionConfigSummary = {
    ollama_configured: true,
    judge_configured: false,
    ollama_digest: digest
  };

  if (mode === "local_and_judge") {
    const baseUrl = readOwnEnvironmentValue(env, JUDGE_BASE_URL_ENV)?.trim();
    const requestedModel = readOwnEnvironmentValue(env, JUDGE_MODEL_ENV)?.trim();
    const rawKey = readOwnEnvironmentValue(env, JUDGE_API_KEY_ENV)?.trim();
    const enableJudge = readOwnEnvironmentValue(env, ENABLE_JUDGE_ENV)?.trim();

    if (
      baseUrl === undefined ||
      requestedModel === undefined ||
      rawKey === undefined ||
      enableJudge !== "1"
    ) {
      return invalidConfig();
    }
    if (!JUDGE_MODEL.test(requestedModel)) {
      return invalidConfig();
    }

    const provider = resolveAllowlistedJudgeProvider(baseUrl);
    judgeApiKey = validateJudgeApiKey(rawKey);
    judgeResponsesUrl = provider.responses_url;
    judgeSummary = {
      ollama_configured: true,
      judge_configured: true,
      ollama_digest: digest,
      judge_provider_id: provider.provider_id,
      judge_base_url: provider.base_url,
      judge_responses_url: provider.responses_url,
      judge_requested_model: requestedModel
    };
  }

  const config = bindConfigView(
    mode,
    judgeSummary,
    digest,
    judgeApiKey,
    judgeResponsesUrl
  );
  judgeApiKey = null;
  judgeResponsesUrl = null;
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
  let judgeApiKey = privateState.judge_api_key;
  let judgeResponsesUrl = privateState.judge_responses_url;
  privateState.expected_ollama_digest = null;
  privateState.judge_api_key = null;
  privateState.judge_responses_url = null;

  try {
    return createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: expectedOllamaDigest,
      judge_api_key: judgeApiKey,
      judge_responses_url: judgeResponsesUrl
    });
  } finally {
    judgeApiKey = null;
    judgeResponsesUrl = null;
  }
}
