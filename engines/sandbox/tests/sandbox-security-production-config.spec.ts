import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { runInNewContext } from "node:vm";
import test from "node:test";

const PRODUCTION_ROOT = fileURLToPath(
  new URL("../src/security-production/", import.meta.url)
);
const PRODUCTION_CONFIG_PATH = join(PRODUCTION_ROOT, "production-config.ts");

function productionTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...productionTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

type ProductionMode = "rule_only" | "local" | "local_and_judge";

interface ConfigView {
  readonly mode: ProductionMode;
  readonly summary: Readonly<Record<string, unknown>>;
}

type NormalizeForTest = (
  env: Readonly<Record<string, string | undefined>>,
  mode: ProductionMode
) => Readonly<ConfigView>;

type CreateProductionConfig = (
  mode: ProductionMode
) => Readonly<ConfigView>;

interface ProductionTransport {
  request(input: unknown): Promise<unknown>;
}

type CreateProductionTransport = (
  config: Readonly<ConfigView>
) => ProductionTransport;

const VALID_DIGEST = `sha256:${"a".repeat(64)}`;
const PRIVATE_API_KEY = "private-judge-key-sentinel";
const RESPONSES_PROTOCOL_ID = "openai_responses_v1";
const CHAT_PROTOCOL_ID = "openai_chat_completions_json_v1";
const DORO_BASE_URL = "https://doro.lol/v1";
const DORO_ENDPOINT_URL = "https://doro.lol/v1/responses";
const US_DORO_BASE_URL = "https://us.doro.lol/v1";
const US_DORO_ENDPOINT_URL = "https://us.doro.lol/v1/responses";
const CHAT_BASE_URL = "https://judge.example.test/openai/v1";
const CHAT_ENDPOINT_URL =
  "https://judge.example.test/openai/v1/chat/completions";
const REQUESTED_MODEL = "gpt-5.4-mini";

function validJudgeEnv(): Record<string, string | undefined> {
  return {
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST,
    SANDBOX_SECURITY_JUDGE_PROTOCOL: RESPONSES_PROTOCOL_ID,
    SANDBOX_SECURITY_JUDGE_BASE_URL: DORO_BASE_URL,
    SANDBOX_SECURITY_JUDGE_MODEL: REQUESTED_MODEL,
    SANDBOX_SECURITY_JUDGE_API_KEY: PRIVATE_API_KEY,
    SANDBOX_SECURITY_ENABLE_JUDGE: "1"
  };
}

function assertInvalidConfig(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "sandbox_security_production_config_invalid");
    assert.equal(error.message, "sandbox_security_production_config_invalid");
    assert.equal(error.message.includes("sentinel"), false);
    return true;
  });
}

let normalizeForTest: NormalizeForTest = (_env, mode) =>
  Object.freeze({
    mode,
    summary: Object.freeze({})
  });
let createProductionConfig: CreateProductionConfig = () => {
  throw new Error("guarded-production-config-placeholder");
};
let createProductionTransport: CreateProductionTransport = () => {
  throw new Error("guarded-production-transport-placeholder");
};

try {
  const candidate = await import(
    "../src/security-production/production-config.ts"
  );
  if (
    typeof candidate.normalizeSandboxSecurityProductionConfigForTest ===
    "function"
  ) {
    normalizeForTest =
      candidate.normalizeSandboxSecurityProductionConfigForTest as NormalizeForTest;
  }
  if (typeof candidate.createSandboxSecurityProductionConfig === "function") {
    createProductionConfig =
      candidate.createSandboxSecurityProductionConfig as CreateProductionConfig;
  }
  if (
    typeof candidate.createSandboxSecurityProductionTransport === "function"
  ) {
    createProductionTransport =
      candidate.createSandboxSecurityProductionTransport as CreateProductionTransport;
  }
} catch (error: unknown) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ERR_MODULE_NOT_FOUND"
  ) {
    throw error;
  }
  // Guarded missing-module RED: behavior assertions fail without hiding defects.
}

const ALLOWLISTED_ENVIRONMENT_NAMES = [
  "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
  "SANDBOX_SECURITY_JUDGE_PROTOCOL",
  "SANDBOX_SECURITY_JUDGE_BASE_URL",
  "SANDBOX_SECURITY_JUDGE_MODEL",
  "SANDBOX_SECURITY_JUDGE_API_KEY",
  "SANDBOX_SECURITY_ENABLE_JUDGE"
] as const;

function withProcessEnvironment<T>(
  values: Readonly<Record<(typeof ALLOWLISTED_ENVIRONMENT_NAMES)[number], string | undefined>>,
  action: () => T
): T {
  const previous = new Map<
    (typeof ALLOWLISTED_ENVIRONMENT_NAMES)[number],
    Readonly<{ present: boolean; value: string | undefined }>
  >();
  for (const key of ALLOWLISTED_ENVIRONMENT_NAMES) {
    previous.set(key, {
      present: Object.prototype.hasOwnProperty.call(process.env, key),
      value: process.env[key]
    });
    const next = values[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  try {
    return action();
  } finally {
    for (const key of ALLOWLISTED_ENVIRONMENT_NAMES) {
      const prior = previous.get(key)!;
      if (!prior.present || prior.value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior.value;
      }
    }
  }
}

test("REQ-SBX-GENERAL-002 rule_only needs no environment values", () => {
  const config = normalizeForTest({}, "rule_only");

  assert.equal(config.mode, "rule_only");
  assert.deepEqual(config.summary, {
    ollama_configured: false,
    judge_configured: false
  });
});

test("REQ-SBX-GENERAL-002 local requires a present trimmed digest", () => {
  assert.throws(() => normalizeForTest({}, "local"));
  assert.throws(() =>
    normalizeForTest(
      { SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: "" },
      "local"
    )
  );
  assert.throws(() =>
    normalizeForTest(
      { SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: " \t\n " },
      "local"
    )
  );

  const config = normalizeForTest(
    { SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: ` \t${VALID_DIGEST}\n ` },
    "local"
  );
  assert.equal(config.mode, "local");
  assert.deepEqual(config.summary, {
    ollama_configured: true,
    judge_configured: false,
    ollama_digest: VALID_DIGEST
  });
});

const INVALID_DIGESTS = Object.freeze({
  "uppercase prefix": `SHA256:${"a".repeat(64)}`,
  "uppercase hex": `sha256:${"A".repeat(64)}`,
  "non-hex character": `sha256:${"a".repeat(63)}g`,
  "63 hex characters": `sha256:${"a".repeat(63)}`,
  "65 hex characters": `sha256:${"a".repeat(65)}`
});

for (const [scenario, digest] of Object.entries(INVALID_DIGESTS)) {
  test(`REQ-SBX-GENERAL-002 local rejects digest with ${scenario}`, () => {
    assert.throws(() =>
      normalizeForTest(
        { SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: digest },
        "local"
      )
    );
  });
}

test("REQ-SBX-GENERAL-002 local_and_judge requires trimmed key exact enable safe base and safe model", () => {
  const invalidEnvironments = [
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_PROTOCOL: undefined },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_PROTOCOL: "" },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_PROTOCOL: ` ${RESPONSES_PROTOCOL_ID} `
    },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_PROTOCOL: "provider_inferred_protocol"
    },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_API_KEY: undefined },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_API_KEY: "" },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_API_KEY: " \t\n " },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_API_KEY: "bad\u0000key" },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_ENABLE_JUDGE: undefined
    },
    { ...validJudgeEnv(), SANDBOX_SECURITY_ENABLE_JUDGE: "" },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_ENABLE_JUDGE: " \t\n "
    },
    { ...validJudgeEnv(), SANDBOX_SECURITY_ENABLE_JUDGE: "true" },
    { ...validJudgeEnv(), SANDBOX_SECURITY_ENABLE_JUDGE: "01" },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_BASE_URL: undefined },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_BASE_URL: "" },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: "https://user:pass@doro.lol/v1"
    },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: "https://doro.lol/v1?x=1"
    },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: "http://doro.lol/v1"
    },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: "https://127.0.0.1/v1"
    },
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: "https://doro.lol:8443/v1"
    },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_MODEL: undefined },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_MODEL: "" },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_MODEL: "-bad" },
    { ...validJudgeEnv(), SANDBOX_SECURITY_JUDGE_MODEL: "a".repeat(129) },
    // Former OpenAI names are not accepted as Judge configuration.
    {
      SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST,
      OPENAI_API_KEY: PRIVATE_API_KEY,
      SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE: "1"
    }
  ];
  for (const env of invalidEnvironments) {
    assert.throws(() => normalizeForTest(env, "local_and_judge"));
  }

  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_API_KEY: ` \t${PRIVATE_API_KEY}\n `,
      SANDBOX_SECURITY_ENABLE_JUDGE: "1",
      SANDBOX_SECURITY_JUDGE_BASE_URL: ` \t${DORO_BASE_URL}\n `,
      SANDBOX_SECURITY_JUDGE_MODEL: ` \t${REQUESTED_MODEL}\n `
    },
    "local_and_judge"
  );
  assert.equal(config.mode, "local_and_judge");
  assert.deepEqual(config.summary, {
    ollama_configured: true,
    judge_configured: true,
    ollama_digest: VALID_DIGEST,
    judge_protocol_id: RESPONSES_PROTOCOL_ID,
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: DORO_BASE_URL,
    judge_endpoint_url: DORO_ENDPOINT_URL,
    judge_requested_model: REQUESTED_MODEL
  });
  assert.equal(JSON.stringify(config).includes(PRIVATE_API_KEY), false);
});

test("REQ-SBX-GENERAL-002 local_and_judge caps Judge keys at 4096 UTF-8 bytes without disclosure", () => {
  const keyMarker = "never-leak-config-key-boundary-";
  const exactKey = `${keyMarker}${"k".repeat(4094 - keyMarker.length)}é`;
  const oversizedKey = `${exactKey}k`;

  assert.equal(new TextEncoder().encode(exactKey).byteLength, 4096);
  assert.equal(new TextEncoder().encode(oversizedKey).byteLength, 4097);
  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_API_KEY: exactKey
    },
    "local_and_judge"
  );
  assert.equal(config.summary.judge_configured, true);
  assert.equal(JSON.stringify(config).includes(keyMarker), false);

  assert.throws(
    () =>
      normalizeForTest(
        {
          ...validJudgeEnv(),
          SANDBOX_SECURITY_JUDGE_API_KEY: oversizedKey
        },
        "local_and_judge"
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "sandbox_security_production_config_invalid");
      assert.equal(error.message, "sandbox_security_production_config_invalid");
      assert.equal(
        `${error.stack ?? ""}${JSON.stringify(error)}`.includes(keyMarker),
        false
      );
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-002 local_and_judge bounds the raw Judge key before whitespace canonicalization", () => {
  const keyMarker = "never-leak-raw-key-boundary";
  const exactRawKey = ` ${keyMarker}${" ".repeat(
    4096 - keyMarker.length - 1
  )}`;
  const oversizedRawKey = `${exactRawKey} `;

  assert.equal(exactRawKey.length, 4096);
  assert.equal(oversizedRawKey.length, 4097);
  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_API_KEY: exactRawKey
    },
    "local_and_judge"
  );
  assert.equal(config.summary.judge_configured, true);
  assert.equal(JSON.stringify(config).includes(keyMarker), false);

  assert.throws(
    () =>
      normalizeForTest(
        {
          ...validJudgeEnv(),
          SANDBOX_SECURITY_JUDGE_API_KEY: oversizedRawKey
        },
        "local_and_judge"
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "sandbox_security_production_config_invalid");
      assert.equal(error.message, "sandbox_security_production_config_invalid");
      assert.equal(
        `${error.stack ?? ""}${JSON.stringify(error)}`.includes(keyMarker),
        false
      );
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-002 production config checks raw Judge key length before trim", () => {
  const source = readFileSync(PRODUCTION_CONFIG_PATH, "utf8");
  const rawKeyRead = source.indexOf(
    "const rawKey = readOwnEnvironmentValue(env, JUDGE_API_KEY_ENV);"
  );
  const rawKeyLimit = source.indexOf(
    "rawKey.length > SANDBOX_SECURITY_JUDGE_API_KEY_MAX_UTF8_BYTES",
    rawKeyRead
  );
  const keyTrim = source.indexOf(
    "const normalizedKey = rawKey.trim();",
    rawKeyLimit
  );
  const utf8Validation = source.indexOf(
    "validateJudgeApiKey(normalizedKey)",
    keyTrim
  );

  assert.ok(rawKeyRead >= 0);
  assert.ok(rawKeyLimit > rawKeyRead);
  assert.ok(keyTrim > rawKeyLimit);
  assert.ok(utf8Validation > keyTrim);
});

test("REQ-SBX-GENERAL-002 local_and_judge canonicalizes a non-fixed Doro base through the independent protocol adapter", () => {
  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_BASE_URL: ` ${US_DORO_BASE_URL}/ `
    },
    "local_and_judge"
  );

  assert.deepEqual(config.summary, {
    ollama_configured: true,
    judge_configured: true,
    ollama_digest: VALID_DIGEST,
    judge_protocol_id: RESPONSES_PROTOCOL_ID,
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: US_DORO_BASE_URL,
    judge_endpoint_url: US_DORO_ENDPOINT_URL,
    judge_requested_model: REQUESTED_MODEL
  });
});

for (const paddedEnableFlag of [" 1", "1 ", "1\n", "\t1"]) {
  test(`REQ-SBX-GENERAL-002 local_and_judge rejects non-exact enable flag ${JSON.stringify(paddedEnableFlag)}`, () => {
    assertInvalidConfig(() =>
      normalizeForTest(
        {
          ...validJudgeEnv(),
          SANDBOX_SECURITY_ENABLE_JUDGE: paddedEnableFlag
        },
        "local_and_judge"
      )
    );
  });
}

test("REQ-SBX-GENERAL-002 local_and_judge exposes the explicit Chat binding without exposing its key", () => {
  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_PROTOCOL: CHAT_PROTOCOL_ID,
      SANDBOX_SECURITY_JUDGE_BASE_URL: `${CHAT_BASE_URL}/`
    },
    "local_and_judge"
  );

  assert.deepEqual(config.summary, {
    ollama_configured: true,
    judge_configured: true,
    ollama_digest: VALID_DIGEST,
    judge_protocol_id: CHAT_PROTOCOL_ID,
    judge_endpoint_policy_id: "operator_https_fqdn_v1",
    judge_base_url: CHAT_BASE_URL,
    judge_endpoint_url: CHAT_ENDPOINT_URL,
    judge_requested_model: REQUESTED_MODEL
  });
  assert.equal(JSON.stringify(config).includes(PRIVATE_API_KEY), false);
});

test("REQ-SBX-GENERAL-002 missing or unknown Judge protocol fails with no default inference or key disclosure", () => {
  for (const protocol of [undefined, "unknown_protocol"] as const) {
    const env = {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_PROTOCOL: protocol,
      SANDBOX_SECURITY_JUDGE_API_KEY: "protocol-private-key-sentinel"
    };

    assertInvalidConfig(() => normalizeForTest(env, "local_and_judge"));
  }
});

test("REQ-SBX-GENERAL-002 invalid Judge errors never expose the private key", () => {
  const env = {
    ...validJudgeEnv(),
    SANDBOX_SECURITY_JUDGE_API_KEY: "error-private-key-sentinel",
    SANDBOX_SECURITY_ENABLE_JUDGE: "0"
  };

  assertInvalidConfig(() => normalizeForTest(env, "local_and_judge"));
});

test("REQ-SBX-GENERAL-002 unknown mode fails safely before environment access", () => {
  const hostileEnvironment = new Proxy<Record<string, string | undefined>>(
    {},
    {
      get() {
        throw new Error("environment-trap-sentinel");
      }
    }
  );

  assertInvalidConfig(() =>
    normalizeForTest(hostileEnvironment, "unknown_mode" as ProductionMode)
  );
});

test("REQ-SBX-GENERAL-002 test environment ignores unknown own inherited and symbol keys", () => {
  let unknownReads = 0;
  const inherited = Object.create(null) as Record<PropertyKey, unknown>;
  Object.defineProperty(inherited, "INHERITED_UNKNOWN", {
    get() {
      unknownReads += 1;
      throw new Error("inherited-unknown-sentinel");
    }
  });
  const env = Object.create(inherited) as Record<PropertyKey, unknown>;
  Object.defineProperties(env, {
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: {
      value: VALID_DIGEST,
      enumerable: true
    },
    ORDINARY_UNRELATED_ENVIRONMENT_VALUE: {
      get() {
        unknownReads += 1;
        throw new Error("ordinary-unknown-sentinel");
      },
      enumerable: true
    },
    SANDBOX_SECURITY_OLLAMA_ENDPOINT: {
      get() {
        unknownReads += 1;
        throw new Error("endpoint-override-sentinel");
      },
      enumerable: true
    },
    SANDBOX_SECURITY_OLLAMA_MODEL: {
      get() {
        unknownReads += 1;
        throw new Error("model-override-sentinel");
      },
      enumerable: true
    }
  });
  Object.defineProperty(env, Symbol("unknown-environment-key"), {
    get() {
      unknownReads += 1;
      throw new Error("symbol-sentinel");
    }
  });

  const config = normalizeForTest(
    env as Readonly<Record<string, string | undefined>>,
    "local"
  );
  assert.equal(config.summary.ollama_digest, VALID_DIGEST);
  assert.equal(unknownReads, 0);
});

test("REQ-SBX-GENERAL-002 rule_only does not inspect a hostile test environment", () => {
  let traps = 0;
  const env = new Proxy<Record<string, string | undefined>>(
    {},
    {
      get() {
        traps += 1;
        throw new Error("rule-only-get-sentinel");
      },
      getOwnPropertyDescriptor() {
        traps += 1;
        throw new Error("rule-only-descriptor-sentinel");
      },
      ownKeys() {
        traps += 1;
        throw new Error("rule-only-own-keys-sentinel");
      }
    }
  );

  assert.deepEqual(normalizeForTest(env, "rule_only").summary, {
    ollama_configured: false,
    judge_configured: false
  });
  assert.equal(traps, 0);
});

test("REQ-SBX-GENERAL-002 local does not read exact Judge environment keys", () => {
  let judgeReads = 0;
  const env = {
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST
  } as Record<string, string | undefined>;
  for (const key of [
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE",
    "OPENAI_API_KEY",
    "SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE"
  ]) {
    Object.defineProperty(env, key, {
      get() {
        judgeReads += 1;
        throw new Error("local-judge-read-sentinel");
      },
      enumerable: true
    });
  }

  assert.equal(
    normalizeForTest(env, "local").summary.ollama_digest,
    VALID_DIGEST
  );
  assert.equal(judgeReads, 0);
});

test("REQ-SBX-GENERAL-002 test environment rejects inherited allowlisted values", () => {
  const env = Object.create({
    SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST
  }) as Readonly<Record<string, string | undefined>>;

  assertInvalidConfig(() => normalizeForTest(env, "local"));
});

test("REQ-SBX-GENERAL-002 test environment never invokes allowlisted accessors", () => {
  let reads = 0;
  const env = {} as Record<string, string | undefined>;
  Object.defineProperty(env, "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST", {
    get() {
      reads += 1;
      throw new Error("allowlisted-accessor-sentinel");
    },
    enumerable: true
  });

  assertInvalidConfig(() => normalizeForTest(env, "local"));
  assert.equal(reads, 0);
});

test("REQ-SBX-GENERAL-002 hostile Proxy test environment fails with a fixed error", () => {
  const env = new Proxy<Record<string, string | undefined>>(
    {},
    {
      get() {
        throw new Error("proxy-get-sentinel");
      },
      getOwnPropertyDescriptor() {
        throw new Error("proxy-descriptor-sentinel");
      }
    }
  );

  assertInvalidConfig(() => normalizeForTest(env, "local"));
});

test("REQ-SBX-GENERAL-002 production factory reads configuration for only the selected mode", () => {
  assert.equal(createProductionConfig.length, 1);

  const ruleOnly = withProcessEnvironment(
    {
      SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: undefined,
      SANDBOX_SECURITY_JUDGE_PROTOCOL: undefined,
      SANDBOX_SECURITY_JUDGE_BASE_URL: undefined,
      SANDBOX_SECURITY_JUDGE_MODEL: undefined,
      SANDBOX_SECURITY_JUDGE_API_KEY: undefined,
      SANDBOX_SECURITY_ENABLE_JUDGE: undefined
    },
    () => createProductionConfig("rule_only")
  );
  assert.deepEqual(ruleOnly.summary, {
    ollama_configured: false,
    judge_configured: false
  });

  const local = withProcessEnvironment(
    {
      SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: ` ${VALID_DIGEST} `,
      SANDBOX_SECURITY_JUDGE_PROTOCOL: undefined,
      SANDBOX_SECURITY_JUDGE_BASE_URL: undefined,
      SANDBOX_SECURITY_JUDGE_MODEL: undefined,
      SANDBOX_SECURITY_JUDGE_API_KEY: undefined,
      SANDBOX_SECURITY_ENABLE_JUDGE: undefined
    },
    () => createProductionConfig("local")
  );
  assert.equal(local.summary.ollama_digest, VALID_DIGEST);

  const judge = withProcessEnvironment(
    {
      SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST: VALID_DIGEST,
      SANDBOX_SECURITY_JUDGE_PROTOCOL: RESPONSES_PROTOCOL_ID,
      SANDBOX_SECURITY_JUDGE_BASE_URL: ` ${DORO_BASE_URL} `,
      SANDBOX_SECURITY_JUDGE_MODEL: ` ${REQUESTED_MODEL} `,
      SANDBOX_SECURITY_JUDGE_API_KEY: ` ${PRIVATE_API_KEY} `,
      SANDBOX_SECURITY_ENABLE_JUDGE: "1"
    },
    () => createProductionConfig("local_and_judge")
  );
  assert.equal(judge.summary.judge_configured, true);
  assert.equal(judge.summary.judge_protocol_id, RESPONSES_PROTOCOL_ID);
  assert.equal(
    judge.summary.judge_endpoint_policy_id,
    "operator_https_fqdn_v1"
  );
  assert.equal(judge.summary.judge_base_url, DORO_BASE_URL);
  assert.equal(judge.summary.judge_endpoint_url, DORO_ENDPOINT_URL);
  assert.equal(judge.summary.judge_requested_model, REQUESTED_MODEL);
  assert.equal(JSON.stringify(judge).includes(PRIVATE_API_KEY), false);
});

test("REQ-SBX-GENERAL-002 config views are fresh deeply frozen exact and credential-free", () => {
  const env = validJudgeEnv();
  const first = normalizeForTest(env, "local_and_judge");
  env.SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST = `sha256:${"b".repeat(64)}`;
  env.SANDBOX_SECURITY_JUDGE_API_KEY = "mutated-private-key-sentinel";
  env.SANDBOX_SECURITY_ENABLE_JUDGE = "0";
  const second = normalizeForTest(validJudgeEnv(), "local_and_judge");

  assert.notEqual(first, second);
  assert.notEqual(first.summary, second.summary);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.summary), true);
  assert.deepEqual(Reflect.ownKeys(first), ["mode", "summary"]);
  assert.deepEqual(Reflect.ownKeys(first.summary), [
    "ollama_configured",
    "judge_configured",
    "ollama_digest",
    "judge_protocol_id",
    "judge_endpoint_policy_id",
    "judge_base_url",
    "judge_endpoint_url",
    "judge_requested_model"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), {
    mode: "local_and_judge",
    summary: {
      ollama_configured: true,
      judge_configured: true,
      ollama_digest: VALID_DIGEST,
      judge_protocol_id: RESPONSES_PROTOCOL_ID,
      judge_endpoint_policy_id: "operator_https_fqdn_v1",
      judge_base_url: DORO_BASE_URL,
      judge_endpoint_url: DORO_ENDPOINT_URL,
      judge_requested_model: REQUESTED_MODEL
    }
  });
  const exposed = `${JSON.stringify(first)}\n${inspect(first)}`;
  assert.equal(exposed.includes(PRIVATE_API_KEY), false);
  assert.equal(exposed.includes("mutated-private-key-sentinel"), false);
  assert.doesNotMatch(exposed, /api_key|enable_openai|OPENAI_API_KEY|transport/i);
});

test("REQ-SBX-GENERAL-002 transport binding rejects non-identical views without consuming the original", () => {
  const config = normalizeForTest(validJudgeEnv(), "local_and_judge");
  const copied = {
    mode: config.mode,
    summary: { ...config.summary }
  } as Readonly<ConfigView>;
  const cloned = structuredClone(config) as Readonly<ConfigView>;
  const proxied = new Proxy(config, {});
  const forged = Object.freeze({
    mode: "local_and_judge",
    summary: Object.freeze({
      ollama_configured: true,
      judge_configured: true,
      ollama_digest: VALID_DIGEST
    })
  }) as Readonly<ConfigView>;
  const otherRealm = runInNewContext(
    `Object.freeze({ mode: "local_and_judge", summary: Object.freeze({ ollama_configured: true, judge_configured: true, ollama_digest: "${VALID_DIGEST}" }) })`
  ) as Readonly<ConfigView>;

  for (const invalidView of [copied, cloned, proxied, forged, otherRealm]) {
    assertInvalidConfig(() => createProductionTransport(invalidView));
  }

  const transport = createProductionTransport(config);
  assert.equal(typeof transport.request, "function");
  assert.equal(Object.isFrozen(transport), true);
  assertInvalidConfig(() => createProductionTransport(config));
});

test("REQ-SBX-GENERAL-002 production tree grants six environment reads only to the config module", () => {
  const sources = productionTypeScriptFiles(PRODUCTION_ROOT).map((path) => ({
    path,
    source: readFileSync(path, "utf8")
  }));
  const environmentReaders = sources.filter(({ source }) =>
    /\bprocess\s*\.\s*env\b/u.test(source)
  );
  assert.deepEqual(
    environmentReaders.map(({ path }) => path),
    [PRODUCTION_CONFIG_PATH]
  );

  const configSource = readFileSync(PRODUCTION_CONFIG_PATH, "utf8");
  const uppercaseStringLiterals = [
    ...configSource.matchAll(/"([A-Z][A-Z0-9_]+)"/gu)
  ].map((match) => match[1]);
  assert.deepEqual(uppercaseStringLiterals, [
    "SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST",
    "SANDBOX_SECURITY_JUDGE_PROTOCOL",
    "SANDBOX_SECURITY_JUDGE_BASE_URL",
    "SANDBOX_SECURITY_JUDGE_MODEL",
    "SANDBOX_SECURITY_JUDGE_API_KEY",
    "SANDBOX_SECURITY_ENABLE_JUDGE"
  ]);
  for (const forbiddenOverride of [
    "SANDBOX_SECURITY_OLLAMA_ENDPOINT",
    "SANDBOX_SECURITY_OLLAMA_MODEL",
    "SANDBOX_SECURITY_OPENAI_ENDPOINT",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_API_KEY",
    "SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE"
  ]) {
    assert.equal(configSource.includes(`"${forbiddenOverride}"`), false);
  }
  assert.doesNotMatch(
    configSource,
    /\b(?:Object\.keys|Object\.entries|Reflect\.ownKeys)\s*\(/u
  );
  assert.doesNotMatch(configSource, /\bconsole\s*\.|process\.(?:stdout|stderr)/u);
  assert.doesNotMatch(configSource, /request_factory/u);
});

test("REQ-SBX-GENERAL-002 source seals key transfer and clears config-owned references", () => {
  const source = readFileSync(PRODUCTION_CONFIG_PATH, "utf8");
  const weakMapDeclaration = source.indexOf("new WeakMap<");
  const deleteBinding = source.indexOf("PRIVATE_CONFIG_STATES.delete(config);");
  const clearBoundKey = source.indexOf("privateState.judge_api_key = null;");
  const bindPrivateProtocol = source.indexOf(
    "judge_protocol_id: judgeProtocolId"
  );
  const clearBoundProtocol = source.indexOf(
    "privateState.judge_protocol_id = null;"
  );
  const readBoundProtocol = source.indexOf(
    "let judgeProtocolId = privateState.judge_protocol_id;"
  );
  const createTransport = source.indexOf(
    "return createSandboxSecurityDefaultHttpTransport({"
  );
  const passPrivateProtocol = source.indexOf(
    "judge_protocol_id: judgeProtocolId",
    createTransport
  );
  const passPrivateKey = source.indexOf(
    "judge_api_key: judgeApiKey",
    createTransport
  );
  const passEndpointUrl = source.indexOf(
    "judge_endpoint_url: judgeEndpointUrl",
    createTransport
  );
  const clearIntermediateProtocol = source.indexOf(
    "judgeProtocolId = null;",
    passPrivateProtocol
  );
  const clearIntermediateKey = source.indexOf(
    "judgeApiKey = null;",
    passPrivateKey
  );

  assert.ok(weakMapDeclaration >= 0);
  assert.ok(deleteBinding > weakMapDeclaration);
  assert.ok(clearBoundKey > deleteBinding);
  assert.ok(bindPrivateProtocol > weakMapDeclaration);
  assert.ok(readBoundProtocol > deleteBinding);
  assert.ok(clearBoundProtocol > deleteBinding);
  assert.ok(createTransport > clearBoundKey);
  assert.ok(createTransport > clearBoundProtocol);
  assert.ok(passPrivateProtocol > createTransport);
  assert.ok(passPrivateKey > createTransport);
  assert.ok(passEndpointUrl > createTransport);
  assert.ok(clearIntermediateProtocol > passPrivateProtocol);
  assert.ok(clearIntermediateKey > passPrivateKey);
});

test("REQ-SBX-GENERAL-002 local_and_judge summary never exposes credential or former OpenAI names", () => {
  const config = normalizeForTest(validJudgeEnv(), "local_and_judge");
  const serialized = `${JSON.stringify(config)}\n${inspect(config)}`;
  assert.equal(serialized.includes(PRIVATE_API_KEY), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
  assert.equal(serialized.includes("SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE"), false);
  assert.equal(serialized.includes("api.openai.com"), false);
  assert.match(serialized, /doro\.lol\/v1\/responses/);
});

test("REQ-SBX-GENERAL-002 transport binding consumes private protocol key and endpoint state once", () => {
  const config = normalizeForTest(validJudgeEnv(), "local_and_judge");
  const transport = createProductionTransport(config);
  assert.equal(typeof transport.request, "function");
  assert.equal(Object.isFrozen(transport), true);
  assertInvalidConfig(() => createProductionTransport(config));
});

test("REQ-SBX-GENERAL-002 valid Chat config creates a protocol-bound transport exactly once", () => {
  const config = normalizeForTest(
    {
      ...validJudgeEnv(),
      SANDBOX_SECURITY_JUDGE_PROTOCOL: CHAT_PROTOCOL_ID,
      SANDBOX_SECURITY_JUDGE_BASE_URL: CHAT_BASE_URL
    },
    "local_and_judge"
  );

  const transport = createProductionTransport(config);
  assert.equal(typeof transport.request, "function");
  assert.equal(Object.isFrozen(transport), true);
  assertInvalidConfig(() => createProductionTransport(config));
});
