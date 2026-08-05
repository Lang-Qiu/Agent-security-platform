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
type ReplayAttemptOutcome<T> = Exclude<
  SandboxSecurityReplayTransportOutcome<T>,
  { readonly status: "not_called" }
>;
type ReplayResponseOutcome<T> = Extract<
  SandboxSecurityReplayTransportOutcome<T>,
  { readonly status: "response" }
>;
type ReplayAttemptSequence<T> = readonly ReplayAttemptOutcome<T>[];

type ReplayFactory = (input: Readonly<{
  qualification: Readonly<{
    inventory: ReplayAttemptSequence<SandboxSecurityReplayOllamaInventoryResponse>;
    prewarm: ReplayAttemptSequence<SandboxSecurityReplayOllamaResponse>;
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
): ReplayResponseOutcome<T> {
  const outcome = normalizeSandboxSecurityReplayOutcome(
    {
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: response
    },
    normalize
  );
  if (outcome.status !== "response") {
    throw new Error("test_response_outcome_invalid");
  }
  return outcome;
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
  localAttempts: ReplayAttemptSequence<SandboxSecurityReplayOllamaResponse> = [
    responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
  ],
  judgeAttempts: ReplayAttemptSequence<SandboxSecurityReplayOpenAIResponse> = []
): SandboxSecurityReplayInputUnit {
  return { ollama: localAttempts, judge: judgeAttempts };
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
  inventory: ReplayAttemptSequence<SandboxSecurityReplayOllamaInventoryResponse>;
  prewarm: ReplayAttemptSequence<SandboxSecurityReplayOllamaResponse>;
}> {
  return {
    inventory: [responseOutcome(
      inventory(),
      normalizeSandboxSecurityReplayOllamaInventoryResponse
    )],
    prewarm: [responseOutcome(
      local(),
      normalizeSandboxSecurityReplayOllamaResponse
    )]
  };
}

function createTransport(
  factory: ReplayFactory,
  inputOverrides: Partial<{
    qualification: Readonly<{
      inventory: ReplayAttemptSequence<SandboxSecurityReplayOllamaInventoryResponse>;
      prewarm: ReplayAttemptSequence<SandboxSecurityReplayOllamaResponse>;
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

test("REQ-SBX-GENERAL-002 v2 replay exposes a local connection failure then consumes exactly one same-request retry", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
    ])]
  });
  await qualify(transport);
  transport.beginInput();
  const request = requests(new AbortController().signal, "chat");

  await assert.rejects(
    transport.request(request),
    { name: "sandbox_security_transport_connection_failed" }
  );
  const response = await transport.request(request);
  assert.equal(response.status, 200);
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay treats a singleton local connection failure as final", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" }
    ])]
  });
  await qualify(transport);
  transport.beginInput();
  await assert.rejects(
    transport.request(requests(new AbortController().signal, "chat")),
    { name: "sandbox_security_transport_connection_failed" }
  );
  assert.throws(() => transport.endInput(), /failed|state|replay/i);
  assert.throws(() => transport.assertDrained(), /failed|state|replay/i);
});

test("REQ-SBX-GENERAL-002 replay qualification sequences consume inventory and prewarm retries in order", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    qualification: {
      inventory: [
        { status: "transport_error", error_code: "connection_failed" },
        responseOutcome(
          inventory(),
          normalizeSandboxSecurityReplayOllamaInventoryResponse
        )
      ],
      prewarm: [
        { status: "transport_error", error_code: "connection_failed" },
        responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
      ]
    }
  });
  const signal = new AbortController().signal;
  const inventoryRequest = requests(signal, "model_inventory");
  const prewarmRequest = requests(signal, "chat");

  await assert.rejects(
    transport.request(inventoryRequest),
    { name: "sandbox_security_transport_connection_failed" }
  );
  assert.equal((await transport.request(inventoryRequest)).status, 200);
  await assert.rejects(
    transport.request(prewarmRequest),
    { name: "sandbox_security_transport_connection_failed" }
  );
  assert.equal((await transport.request(prewarmRequest)).status, 200);

  transport.beginInput();
  await transport.request(requests(signal, "chat"));
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay transport rejects wrong and duplicate provider slots", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit(
      [responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)],
      [responseOutcome(judge(), normalizeSandboxSecurityReplayOpenAIResponse)]
    )]
  });
  await qualify(transport);
  const signal = new AbortController().signal;
  transport.beginInput();
  await assert.rejects(
    transport.request(requests(signal, "responses")),
    /replay|slot_order|wrong|operation/
  );

  const duplicate = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
    ])]
  });
  await qualify(duplicate);
  duplicate.beginInput();
  const duplicateRequest = requests(signal, "chat");
  await assert.rejects(duplicate.request(duplicateRequest), /connection_failed/);
  await duplicate.request(duplicateRequest);
  await assert.rejects(
    duplicate.request(duplicateRequest),
    /replay|duplicate|slot/
  );
});

test("REQ-SBX-GENERAL-002 replay transport rejects incomplete qualification before input", async () => {
  const factory = await replayFactory();
  assert.throws(
    () => createTransport(factory, {
      qualification: {
        inventory: successfulQualification().inventory,
        prewarm: []
      }
    }),
    /qualification|replay/
  );
});

test("REQ-SBX-GENERAL-002 replay treats empty attempt sequences as not_called", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([], [])]
  });
  await qualify(transport);
  transport.beginInput();
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay rejects embedded not_called, extra attempts, invalid retry first outcomes, and invalid qualification sequences", async () => {
  const factory = await replayFactory();
  const response = responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse);
  const invalidUnits = [
    {
      label: "embedded not_called",
      unit: {
        ollama: [{ status: "not_called" }],
        judge: []
      }
    },
    {
      label: "more than two attempts",
      unit: {
        ollama: [
          { status: "transport_error", error_code: "connection_failed" },
          response,
          response
        ],
        judge: []
      }
    },
    {
      label: "non-retryable first attempt",
      unit: {
        ollama: [response, response],
        judge: []
      }
    }
  ] as const;

  for (const scenario of invalidUnits) {
    assert.throws(
      () => createTransport(factory, {
        inputs: [scenario.unit as unknown as SandboxSecurityReplayInputUnit]
      }),
      /attempt|outcome|replay/i,
      scenario.label
    );
  }

  assert.throws(
    () => createTransport(factory, {
      qualification: {
        inventory: [{ status: "not_called" }] as never,
        prewarm: successfulQualification().prewarm
      }
    }),
    /attempt|qualification|outcome|replay/i
  );
});

test("REQ-SBX-GENERAL-002 replay rejects non-dense or extended attempt arrays", async () => {
  const factory = await replayFactory();
  const response = responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse);
  const customPrototype = [response];
  Object.setPrototypeOf(customPrototype, Object.create(Array.prototype));
  const sparse = new Array(1);
  const extraProperty = [response];
  Object.defineProperty(extraProperty, "extra", {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true
  });
  const extraSymbol = [response];
  Object.defineProperty(extraSymbol, Symbol("extra"), {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true
  });
  const enumerableLength = new Proxy([response], {
    getOwnPropertyDescriptor(target, property) {
      if (property === "length") {
        return {
          configurable: false,
          enumerable: true,
          value: 1,
          writable: true
        };
      }
      return Object.getOwnPropertyDescriptor(target, property);
    }
  });
  const variants = [
    ["custom prototype", customPrototype],
    ["sparse", sparse],
    ["extra property", extraProperty],
    ["extra symbol", extraSymbol],
    ["invalid length descriptor", enumerableLength]
  ] as const;

  for (const [label, sequence] of variants) {
    assert.throws(
      () => createTransport(factory, {
        inputs: [{
          ollama: sequence,
          judge: []
        } as unknown as SandboxSecurityReplayInputUnit]
      }),
      /replay|attempt_sequence|outcome/i,
      label
    );
  }
});

test("REQ-SBX-GENERAL-002 replay validates length descriptor flags and accepts frozen sequences", async () => {
  const factory = await replayFactory();
  const response = responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse);
  const frozenTransport = createTransport(factory, {
    inputs: [{
      ollama: Object.freeze([response]),
      judge: []
    }]
  });
  await qualify(frozenTransport);
  frozenTransport.beginInput();
  await frozenTransport.request(requests(new AbortController().signal, "chat"));
  frozenTransport.endInput();

  const originalDescriptor = Object.getOwnPropertyDescriptor;
  const invalidDescriptors = [
    {
      label: "enumerable length",
      descriptor: {
        configurable: false,
        enumerable: true,
        value: 1,
        writable: true
      }
    },
    {
      label: "configurable length",
      descriptor: {
        configurable: true,
        enumerable: false,
        value: 1,
        writable: true
      }
    },
    {
      label: "non-boolean writable length",
      descriptor: {
        configurable: false,
        enumerable: false,
        value: 1,
        writable: "mutable" as unknown as boolean
      }
    }
  ] as const;

  for (const variant of invalidDescriptors) {
    const invalidLength = [response];
    Object.getOwnPropertyDescriptor = ((target: object, property: PropertyKey) => {
      if (target === invalidLength && property === "length") {
        return variant.descriptor;
      }
      return originalDescriptor(target, property);
    }) as typeof Object.getOwnPropertyDescriptor;
    try {
      assert.throws(
        () => createTransport(factory, {
          inputs: [{
            ollama: invalidLength,
            judge: []
          } as unknown as SandboxSecurityReplayInputUnit]
        }),
        /attempt_sequence_invalid/,
        variant.label
      );
    } finally {
      Object.getOwnPropertyDescriptor = originalDescriptor;
    }
  }
});

test("REQ-SBX-GENERAL-002 replay rejects endInput with an unconsumed retry and rejects a changed retry operation", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
    ])]
  });
  await qualify(transport);
  transport.beginInput();
  await assert.rejects(
    transport.request(requests(new AbortController().signal, "chat")),
    /connection_failed/
  );
  assert.throws(
    () => transport.endInput(),
    /attempt|missing|drain|state|replay/i
  );

  const changedOperation = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
    ])]
  });
  await qualify(changedOperation);
  changedOperation.beginInput();
  await assert.rejects(
    changedOperation.request(requests(new AbortController().signal, "chat")),
    /connection_failed/
  );
  await assert.rejects(
    changedOperation.request(requests(new AbortController().signal, "responses")),
    /operation|slot|retry|replay/i
  );
  assert.throws(() => changedOperation.endInput(), /failed|state|replay/i);
});

test("REQ-SBX-GENERAL-002 replay rejects a changed retry body or request identity", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)
    ])]
  });
  await qualify(transport);
  transport.beginInput();
  const firstRequest = requests(new AbortController().signal, "chat");
  await assert.rejects(transport.request(firstRequest), /connection_failed/);
  const changedRequest = {
    ...firstRequest,
    body: ENCODER.encode("different-request-body")
  };
  await assert.rejects(
    transport.request(changedRequest),
    /body|identity|request|retry|replay/i
  );
  assert.throws(() => transport.endInput(), /failed|state|replay/i);
});

test("REQ-SBX-GENERAL-002 replay transport waits for recorded signal termination", async () => {
  const factory = await replayFactory();
  const controller = new AbortController();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([{
      status: "signal_termination",
      termination_reason: "slot_timeout"
    }])]
  });
  await qualify(transport);
  transport.beginInput();
  const pending = transport.request(requests(controller.signal, "chat"));
  controller.abort("slot_timeout");
  await assert.rejects(pending, { name: "sandbox_security_slot_timeout" });
});

test("REQ-SBX-GENERAL-002 replay transport rejects sealed binding mismatch before provider calls", async () => {
  const factory = await replayFactory();
  assert.throws(
    () => createTransport(factory, {
      sealed_config: sealedConfig({ judge_binding_sha256: "b".repeat(64) })
    }),
    /replay.*(binding|sealed|config)/i
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
      [responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)],
      [responseOutcome(judge(), normalizeSandboxSecurityReplayOpenAIResponse)]
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

test("REQ-SBX-GENERAL-002 replay exposes a Judge connection failure then consumes one same-operation retry", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit(
      [responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)],
      [
        { status: "transport_error", error_code: "connection_failed" },
        responseOutcome(judge(), normalizeSandboxSecurityReplayOpenAIResponse)
      ]
    )]
  });
  await qualify(transport);
  transport.beginInput();
  const signal = new AbortController().signal;
  await transport.request(requests(signal, "chat"));
  const judgeRequest = requests(signal, "responses");
  await assert.rejects(
    transport.request(judgeRequest),
    { name: "sandbox_security_transport_connection_failed" }
  );
  assert.equal((await transport.request(judgeRequest)).status, 200);
  transport.endInput();
});

test("REQ-SBX-GENERAL-002 replay treats a singleton Judge connection failure as final", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit(
      [responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)],
      [{ status: "transport_error", error_code: "connection_failed" }]
    )]
  });
  await qualify(transport);
  transport.beginInput();
  const signal = new AbortController().signal;
  await transport.request(requests(signal, "chat"));
  await assert.rejects(
    transport.request(requests(signal, "responses")),
    { name: "sandbox_security_transport_connection_failed" }
  );
  assert.throws(() => transport.endInput(), /failed|state|replay/i);
  assert.throws(() => transport.assertDrained(), /failed|state|replay/i);
});

test("REQ-SBX-GENERAL-002 replay permanently fails after a non-retryable final error", async () => {
  const factory = await replayFactory();
  const transport = createTransport(factory, {
    inputs: [outcomeUnit([
      { status: "transport_error", error_code: "connection_failed" },
      { status: "transport_error", error_code: "response_too_large" }
    ])]
  });
  await qualify(transport);
  transport.beginInput();
  const request = requests(new AbortController().signal, "chat");
  await assert.rejects(transport.request(request), /connection_failed/);
  await assert.rejects(transport.request(request), /response_too_large/);
  assert.throws(() => transport.endInput(), /failed|state|replay/i);
});

test("REQ-SBX-GENERAL-002 replay transport fails closed after local or Judge transport errors", async () => {
  const factory = await replayFactory();
  const cases = [
    {
      label: "local",
      inputs: [outcomeUnit([{
        status: "transport_error",
        error_code: "connection_failed"
      }, {
        status: "transport_error",
        error_code: "response_too_large"
      }])]
    },
    {
      label: "judge",
      inputs: [outcomeUnit(
        [responseOutcome(local(), normalizeSandboxSecurityReplayOllamaResponse)],
        [{
          status: "transport_error",
          error_code: "connection_failed"
        }, {
          status: "transport_error",
          error_code: "response_too_large"
        }]
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
