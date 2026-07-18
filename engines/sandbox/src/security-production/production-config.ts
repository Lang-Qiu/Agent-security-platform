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
}>;

export interface SandboxSecurityProductionConfig {
  readonly mode: SandboxSecurityProductionMode;
  readonly summary: SandboxSecurityProductionConfigSummary;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const INVALID_CONFIG_ERROR = "sandbox_security_production_config_invalid";
const OLLAMA_DIGEST_ENV = "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const ENABLE_OPENAI_JUDGE_ENV = "SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE";

interface PrivateConfigState {
  expected_ollama_digest: string | null;
  openai_api_key: string | null;
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

function bindConfigView(
  mode: SandboxSecurityProductionMode,
  summary: SandboxSecurityProductionConfigSummary,
  expectedOllamaDigest: string | null,
  openAiApiKey: string | null
): Readonly<SandboxSecurityProductionConfig> {
  const config = Object.freeze({
    mode,
    summary: Object.freeze(summary)
  });
  PRIVATE_CONFIG_STATES.set(config, {
    expected_ollama_digest: expectedOllamaDigest,
    openai_api_key: openAiApiKey
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
  let openAiApiKey: string | null = null;
  if (mode === "local_and_judge") {
    openAiApiKey = readOwnEnvironmentValue(env, OPENAI_API_KEY_ENV)?.trim() ?? null;
    const enableJudge = readOwnEnvironmentValue(
      env,
      ENABLE_OPENAI_JUDGE_ENV
    )?.trim();
    if (openAiApiKey === null || openAiApiKey === "" || enableJudge !== "1") {
      return invalidConfig();
    }
  }
  const config = bindConfigView(
    mode,
    {
      ollama_configured: true,
      judge_configured: mode === "local_and_judge",
      ollama_digest: digest
    },
    digest,
    openAiApiKey
  );
  openAiApiKey = null;
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
  let openAiApiKey = privateState.openai_api_key;
  privateState.expected_ollama_digest = null;
  privateState.openai_api_key = null;

  try {
    return createSandboxSecurityDefaultHttpTransport({
      expected_ollama_digest: expectedOllamaDigest,
      openai_api_key: openAiApiKey
    });
  } finally {
    openAiApiKey = null;
  }
}
