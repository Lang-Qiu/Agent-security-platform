import assert from "node:assert/strict";
import test from "node:test";

import {
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION
} from "../../engines/sandbox/src/security-production/deterministic-sanitizer.ts";
import type {
  SandboxSecurityHttpRequest
} from "../../engines/sandbox/src/security-production/http-transport.ts";
import {
  SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION
} from "../../engines/sandbox/src/security-production/ollama-contract.ts";
import {
  SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION
} from "../../engines/sandbox/src/security-production/openai-judge-contract.ts";
import {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION
} from "../../engines/sandbox/src/security-production/rule-catalog.ts";
import type {
  SandboxSecurityReplayOllamaInventoryResponse,
  SandboxSecurityReplayOllamaResponse,
  SandboxSecurityReplayOpenAIResponse,
  SandboxSecurityReplayTransportOutcome
} from "../../engines/sandbox/src/security-production/provider-outcomes.ts";
import {
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  normalizeSandboxSecurityReplayOllamaResponse,
  normalizeSandboxSecurityReplayOpenAIResponse,
  normalizeSandboxSecurityReplayOutcome
} from "../../engines/sandbox/src/security-production/provider-outcomes.ts";
import {
  hashSandboxSecurityBenchmarkJudgeBinding
} from "../../scripts/benchmark/sandbox-security/contracts.ts";
import type {
  SandboxSecurityReplayInputUnit
} from "../../scripts/benchmark/sandbox-security/replay-transport.ts";
import type {
  SandboxSecurityReplayTransport,
  SandboxSecuritySealedProviderConfig
} from "../../engines/sandbox/src/security-production/benchmark-composition.ts";

const ENCODER = new TextEncoder();
const DIGEST = `sha256:${"a".repeat(64)}`;
const JUDGE_MODEL = "deepseek-v4-flash";

type ReplayFactory = (input: Readonly<{
  qualification: Readonly<{
    inventory: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaInventoryResponse>;
    prewarm: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
  }>;
  inputs: readonly SandboxSecurityReplayInputUnit[];
  sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
}>) => SandboxSecurityReplayTransport;

async function replayFactory(): Promise<ReplayFactory> {
  let module: Record<string, unknown> = {};
  try {
    module = await import("../../scripts/benchmark/sandbox-security/replay-transport.ts") as Record<string, unknown>;
  } catch {
    module = {};
  }
  assert.equal(
    typeof module.createSandboxSecurityReplayTransport,
    "function"
  );
  return module.createSandboxSecurityReplayTransport as ReplayFactory;
}

function responseOutcome<T>(
  response: T,
  normalize: (value: unknown) => T
): SandboxSecurityReplayTransportOutcome<T> {
  return normalizeSandboxSecurityReplayOutcome(
    {
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: response
    },
    normalize
  );
}

function inventory(): SandboxSecurityReplayOllamaInventoryResponse {
  return normalizeSandboxSecurityReplayOllamaInventoryResponse({
    model: "qwen3:8b",
    digest: DIGEST
  });
}

function local(): SandboxSecurityReplayOllamaResponse {
  return normalizeSandboxSecurityReplayOllamaResponse({
    model: "qwen3:8b",
    verified_ollama_digest: DIGEST,
    done: true,
    message: {
      role: "assistant",
      parsed: {
        schema_version: "sandbox-security-local-model.v1",
        status: "no_match",
        candidates: []
      }
    }
  });
}

function judge(): SandboxSecurityReplayOpenAIResponse {
  return normalizeSandboxSecurityReplayOpenAIResponse({
    model: JUDGE_MODEL,
    status: "completed",
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: []
    }
  });
}

function outcomeUnit(
  localOutcome: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse> = responseOutcome(
    local(),
    normalizeSandboxSecurityReplayOllamaResponse
  ),
  judgeOutcome: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOpenAIResponse> = { status: "not_called" }
): SandboxSecurityReplayInputUnit {
  return { ollama: localOutcome, judge: judgeOutcome };
}

function sealedConfig(
  overrides: Partial<SandboxSecuritySealedProviderConfig> = {}
): Readonly<SandboxSecuritySealedProviderConfig> {
  const binding = {
    judge_protocol_id: "openai_responses_v1" as const,
    judge_endpoint_policy_id: "operator_https_fqdn_v1" as const,
    judge_base_url: "https://judge.example.test/v1",
    judge_endpoint_url: "https://judge.example.test/v1/responses",
    judge_requested_model: JUDGE_MODEL,
    judge_resolved_model: JUDGE_MODEL
  };
  return Object.freeze({
    ollama_model: "qwen3:8b" as const,
    ollama_digest: DIGEST,
    ...binding,
    judge_binding_sha256: hashSandboxSecurityBenchmarkJudgeBinding(binding),
    local_prompt_version: SANDBOX_SECURITY_OLLAMA_LOCAL_PROMPT_VERSION,
    local_schema_version: "sandbox-security-local-model.v1" as const,
    judge_prompt_version: SANDBOX_SECURITY_OPENAI_JUDGE_PROMPT_VERSION,
    judge_schema_version: "sandbox-security-judge.v1" as const,
    rule_catalog_version: SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    sanitizer_version: SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION,
    ...overrides
  });
}

function requests(
  signal: AbortSignal,
  operation: "model_inventory" | "chat" | "responses" | "chat_completions"
): SandboxSecurityHttpRequest {
  if (operation === "model_inventory") {
    return {
      provider: "ollama",
      operation,
      signal,
      max_response_bytes: 65536
    };
  }
  const payloadText =
    "BEGIN_SANITIZED_PAYLOAD\n" +
    JSON.stringify({ routed_obligations: [] }) +
    "\nEND_SANITIZED_PAYLOAD";
  const body = ENCODER.encode(
    operation === "chat_completions"
      ? JSON.stringify({
          messages: [
            { role: "system", content: "" },
            { role: "user", content: payloadText }
          ]
        })
      : JSON.stringify({
          input: [
            { role: "system", content: [{ type: "input_text", text: "" }] },
            {
              role: "user",
              content: [{ type: "input_text", text: payloadText }]
            }
          ]
        })
  );
  if (operation === "chat") {
    return {
      provider: "ollama",
      operation,
      body,
      signal,
      max_response_bytes: 65536
    };
  }
  return {
    provider: "openai",
    operation,
    body,
    signal,
    max_response_bytes: 65536
  };
}

function successfulQualification(): Readonly<{
  inventory: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaInventoryResponse>;
  prewarm: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
}> {
  return {
    inventory: responseOutcome(
      inventory(),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    ),
    prewarm: responseOutcome(
      local(),
      normalizeSandboxSecurityReplayOllamaResponse
    )
  };
}

function createTransport(
  factory: ReplayFactory,
  inputOverrides: Partial<{
    qualification: Readonly<{
      inventory: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaInventoryResponse>;
      prewarm: SandboxSecurityReplayTransportOutcome<SandboxSecurityReplayOllamaResponse>;
    }>;
    inputs: readonly SandboxSecurityReplayInputUnit[];
    sealed_config: Readonly<SandboxSecuritySealedProviderConfig>;
  }> = {}
): SandboxSecurityReplayTransport {
  const requestedInputs = inputOverrides.inputs;
  const inputs = requestedInputs === undefined
    ? Array.from({ length: 300 }, () => outcomeUnit())
    : [
        ...requestedInputs,
        ...Array.from(
          { length: Math.max(0, 300 - requestedInputs.length) },
          () => outcomeUnit()
        )
      ];
  return factory({
    qualification: inputOverrides.qualification ?? successfulQualification(),
    inputs,
    sealed_config: inputOverrides.sealed_config ?? sealedConfig()
  });
}

async function qualify(transport: SandboxSecurityReplayTransport): Promise<void> {
  const signal = new AbortController().signal;
  const inventoryResponse = await transport.request(requests(signal, "model_inventory"));
  assert.equal(inventoryResponse.status, 200);
  const prewarmResponse = await transport.request(requests(signal, "chat"));
  assert.equal(prewarmResponse.status, 200);
}

test("REQ-SBX-GENERAL-002 replay transport consumes inventory and prewarm before 300 inputs", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory);
  await qualify(transport);
  const signal = new AbortController().signal;
  for (let index = 0; index < 300; index += 1) {
    transport.beginInput();
    await transport.request(requests(signal, "chat"));
    transport.endInput();
  }
  transport.assertDrained();
});

test("REQ-SBX-GENERAL-002 replay transport rejects wrong and duplicate provider slots", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit(responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse), responseOutcome(judge(), normalizeSandboxSecurityReplayOpenAIResponse))]
  });
  await qualify(transport);
  const signal = new AbortController().signal;
  transport.beginInput();
  await assert.rejects(
    transport.request(requests(signal, "responses")),
    /replay|slot_order|wrong|operation/
  );

  const duplicate = createTransport(factory, {
    inputs: [outcomeUnit()]
  });
  await qualify(duplicate);
  duplicate.beginInput();
  await duplicate.request(requests(signal, "chat"));
  await assert.rejects(
    duplicate.request(requests(signal, "chat")),
    /replay|duplicate|slot/
  );
});

test("REQ-SBX-GENERAL-002 replay transport rejects incomplete qualification before input", async () => {
  const factory = await replayFactory();
  assert.throws(
    () => createTransport(factory, {
      qualification: {
        inventory: successfulQualification().inventory,
        prewarm: { status: "not_called" }
      }
    }),
    /qualification|replay/
  );
});

test("REQ-SBX-GENERAL-002 replay transport waits for recorded signal termination", async () => {
  const factory = await replayFactory();
  const controller = new AbortController();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit({
      status: "signal_termination",
      termination_reason: "slot_timeout"
    })]
  });
  await qualify(transport);
  transport.beginInput();
  const pending = transport.request(requests(controller.signal, "chat"));
  controller.abort("slot_timeout");
  await assert.rejects(pending, { name: "sandbox_security_slot_timeout" });
});

test("REQ-SBX-GENERAL-002 replay transport rejects sealed digest mismatch before provider calls", async () => {
  const factory = await replayFactory();
  assert.throws(
    () => createTransport(factory, {
      sealed_config: sealedConfig({ ollama_digest: `sha256:${"b".repeat(64)}` })
    }),
    /replay.*(digest|sealed|config)/i
  );
});

test("REQ-SBX-GENERAL-002 replay transport accepts a not_called Judge slot when local is consumed", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit()]
  });
  await qualify(transport);
  transport.beginInput();
  const response = await transport.request(
    requests(new AbortController().signal, "chat")
  );
  assert.equal(response.status, 200);
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay transport reconstructs the sealed Judge protocol operation", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit(
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse),
      responseOutcome(judge(), normalizeSandboxSecurityReplayOpenAIResponse)
    )],
    sealed_config: sealedConfig({
      judge_protocol_id: "openai_chat_completions_json_v1",
      judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
      judge_binding_sha256: hashSandboxSecurityBenchmarkJudgeBinding({
        judge_protocol_id: "openai_chat_completions_json_v1",
        judge_endpoint_policy_id: "operator_https_fqdn_v1",
        judge_base_url: "https://judge.example.test/v1",
        judge_endpoint_url: "https://judge.example.test/v1/chat/completions",
        judge_requested_model: JUDGE_MODEL,
        judge_resolved_model: JUDGE_MODEL
      })
    })
  });
  await qualify(transport);
  transport.beginInput();
  await transport.request(requests(new AbortController().signal, "chat"));
  const response = await transport.request(
    requests(new AbortController().signal, "chat_completions")
  );
  assert.equal(response.status, 200);
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay transport fails closed after local or Judge transport errors", async () => {
  const factory = await replayFactory();
  const cases = [
    {
      label: "local",
      inputs: [outcomeUnit({
        status: "transport_error",
        error_code: "connection_failed"
      })]
    },
    {
      label: "judge",
      inputs: [outcomeUnit(
        responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse),
        {
          status: "transport_error",
          error_code: "connection_failed"
        }
      )]
    }
  ] as const;

  for (const scenario of cases) {
    const transport = createTransport(factory, { inputs: scenario.inputs });
    await qualify(transport);
    transport.beginInput();
    if (scenario.label === "judge") {
      await transport.request(
        requests(new AbortController().signal, "chat")
      );
    }
    await assert.rejects(
      transport.request(
        requests(new AbortController().signal, scenario.label === "local" ? "chat" : "responses")
      ),
      /transport_connection_failed/
    );
    assert.throws(
      () => transport.endInput(),
      /failed|state|replay/i,
      `${scenario.label} transport error must permanently fail replay`
    );
  }
});
