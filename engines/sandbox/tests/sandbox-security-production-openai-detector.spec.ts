import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import type {
  SandboxSecurityExternalDetectorResult,
  SandboxSecuritySanitizedJudgePayload,
  SanitizedExternalDetector
} from "../src/security/index.ts";
import {
  createSandboxSecurityOpenAiJudgeRequest
} from "../src/security-production/openai-judge-contract.ts";
import {
  createSandboxSecurityOpenAiChatJudgeRequest
} from "../src/security-production/openai-chat-judge-contract.ts";
import type {
  SandboxSecurityHttpRequest,
  SandboxSecurityHttpResponse,
  SandboxSecurityHttpTransport
} from "../src/security-production/http-transport.ts";
import type {
  SandboxSecurityJudgeProtocolId
} from "../src/security-production/judge-protocol-adapter.ts";

const detectorPath = new URL(
  "../src/security-production/openai-judge-detector.ts",
  import.meta.url
);

interface DetectorModule {
  createSandboxSecurityOpenAiJudgeDetector(input: Readonly<{
    transport: SandboxSecurityHttpTransport;
    judge_protocol_id: SandboxSecurityJudgeProtocolId;
    judge_requested_model: string;
  }>): SanitizedExternalDetector;
}

// Keep RED behavioral while the production module is absent.
const inertDetectorModule: DetectorModule = {
  createSandboxSecurityOpenAiJudgeDetector() {
    return Object.freeze({
      async detect() {
        return Object.freeze({ candidates: [], clearances: [] });
      }
    });
  }
};

const detectorModule: DetectorModule = existsSync(detectorPath)
  ? ((await import("../src/security-production/openai-judge-detector.ts")) as DetectorModule)
  : inertDetectorModule;
const { createSandboxSecurityOpenAiJudgeDetector } = detectorModule;

const ENCODER = new TextEncoder();
const NONCE = "a".repeat(32);
const RAW_PROVIDER_SENTINEL = "RAW_PROVIDER_PROSE_MUST_NOT_LEAK";
const SANITIZED_PAYLOAD_SENTINEL = "SANITIZED_PAYLOAD_MUST_NOT_BE_RETAINED";
const JUDGE_REQUESTED_MODEL = "gpt-5.4-mini";
const RESPONSES_PROTOCOL_ID = "openai_responses_v1" as const;
const CHAT_PROTOCOL_ID = "openai_chat_completions_json_v1" as const;

function sourceToken(ordinal: number): string {
  return `etok:src:${NONCE}:${String(ordinal).padStart(4, "0")}`;
}

function obligationId(decision: string, ordinal: number): string {
  return `obligation://sandbox/security/${decision}/${String(ordinal).padStart(4, "0")}`;
}

function payload(
  decision = "decision-current",
  filler = SANITIZED_PAYLOAD_SENTINEL
): SandboxSecuritySanitizedJudgePayload {
  return {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: `etok:req:${NONCE}`,
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [
      {
        source_token: sourceToken(1),
        source_type: "user_input",
        media_type: "application/json",
        sanitized_value: { message: filler }
      }
    ],
    tool_request: {
      call_token: `etok:call:${NONCE}:0000`,
      tool_name_token: `etok:tool-name:${NONCE}:0000`,
      sanitized_target: "[REDACTED_HOST]",
      sanitized_arguments: { command: "status" }
    },
    routed_obligations: [
      {
        obligation_id: obligationId(decision, 1),
        category: "prompt_injection",
        subject_refs: [
          {
            kind: "content_source",
            source_token: sourceToken(1),
            locator: { kind: "whole_source" }
          }
        ]
      },
      {
        obligation_id: obligationId(decision, 2),
        category: "tool_hijacking",
        subject_refs: [
          {
            kind: "tool_request",
            call_token: `etok:call:${NONCE}:0000`,
            component: "target"
          }
        ]
      },
      {
        obligation_id: obligationId(decision, 3),
        category: "sensitive_data_exposure",
        subject_refs: [
          {
            kind: "content_source",
            source_token: sourceToken(1),
            locator: { kind: "whole_source" }
          }
        ]
      }
    ]
  };
}

type JudgeResult = Readonly<{
  obligation_id: string;
  outcome: "risk" | "clearance";
  confidence: "uncertain" | "probable" | "confident";
  severity: "low" | "medium" | "high" | "critical" | null;
}>;

function judgeResult(
  obligation_id: string,
  outcome: "risk" | "clearance" = "risk",
  confidence: "uncertain" | "probable" | "confident" = "confident",
  severity: "low" | "medium" | "high" | "critical" | null = "high"
): JudgeResult {
  return { obligation_id, outcome, confidence, severity };
}

function responseBody(
  results: readonly Readonly<Record<string, unknown>>[],
  providerSentinel = false
): Uint8Array {
  return ENCODER.encode(JSON.stringify({
    model: "gpt-5.4-mini",
    status: "completed",
    error: null,
    incomplete_details: null,
    ...(providerSentinel ? { id: RAW_PROVIDER_SENTINEL } : {}),
    output: [
      ...(providerSentinel
        ? [{ type: "reasoning", id: RAW_PROVIDER_SENTINEL, summary: [] }]
        : []),
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              schema_version: "sandbox-security-judge.v1",
              obligation_results: results
            })
          }
        ]
      }
    ]
  }));
}

function chatResponseBody(
  results: readonly Readonly<Record<string, unknown>>[],
  providerSentinel = false
): Uint8Array {
  return ENCODER.encode(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      index: 0,
      logprobs: null,
      message: {
        content: JSON.stringify({
          schema_version: "sandbox-security-judge.v1",
          obligation_results: results
        }),
        role: "assistant",
        ...(providerSentinel
          ? { reasoning_content: RAW_PROVIDER_SENTINEL }
          : {})
      }
    }],
    created: 1,
    id: providerSentinel ? RAW_PROVIDER_SENTINEL : "chatcmpl-test",
    model: JUDGE_REQUESTED_MODEL,
    object: "chat.completion",
    system_fingerprint: null,
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2
    }
  }));
}

function jsonResponse(body: Uint8Array): Readonly<SandboxSecurityHttpResponse> {
  return Object.freeze({
    status: 200,
    content_type: "application/json",
    body
  });
}

function transportHarness(
  handler: (
    input: Readonly<SandboxSecurityHttpRequest>
  ) => Promise<Readonly<SandboxSecurityHttpResponse>> | Readonly<SandboxSecurityHttpResponse>
): Readonly<{
  transport: SandboxSecurityHttpTransport;
  calls: SandboxSecurityHttpRequest[];
}> {
  const calls: SandboxSecurityHttpRequest[] = [];
  const transport: SandboxSecurityHttpTransport = Object.freeze({
    async request(input: Readonly<SandboxSecurityHttpRequest>) {
      calls.push(input);
      return handler(input);
    }
  });
  return Object.freeze({ transport, calls });
}

function createResponsesJudgeDetector(
  transport: SandboxSecurityHttpTransport
): SanitizedExternalDetector {
  return createSandboxSecurityOpenAiJudgeDetector({
    transport,
    judge_protocol_id: RESPONSES_PROTOCOL_ID,
    judge_requested_model: JUDGE_REQUESTED_MODEL
  });
}

function assertDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

async function assertDetectorInvalid(
  action: () => Promise<unknown>,
  forbidden: readonly string[] = []
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.equal(
      error instanceof TypeError &&
        error.message === "sandbox_security_openai_judge_detector_invalid",
      true
    );
    const text = String(error);
    for (const sentinel of forbidden) assert.equal(text.includes(sentinel), false);
    return true;
  });
}

test("REQ-SBX-GENERAL-002 Judge detector selects one exact protocol pair without changing candidate mapping", async () => {
  const current = payload();
  const results = [
    judgeResult(current.routed_obligations[0]!.obligation_id, "risk", "uncertain", "low"),
    judgeResult(current.routed_obligations[1]!.obligation_id, "clearance", "probable", null),
    judgeResult(current.routed_obligations[2]!.obligation_id, "risk", "confident", "critical")
  ];
  const expected = {
    candidates: [
      {
        obligation_id: results[0]!.obligation_id,
        category: "prompt_injection",
        severity: "low",
        confidence: 0.6,
        reason_code: "sandbox_security_prompt_injection",
        subject_refs: current.routed_obligations[0]!.subject_refs
      },
      {
        obligation_id: results[2]!.obligation_id,
        category: "sensitive_data_exposure",
        severity: "critical",
        confidence: 0.9,
        reason_code: "sandbox_security_sensitive_data_exposure",
        subject_refs: current.routed_obligations[2]!.subject_refs
      }
    ],
    clearances: [
      {
        obligation_id: results[1]!.obligation_id,
        category: "tool_hijacking",
        confidence: 0.8,
        subject_refs: current.routed_obligations[1]!.subject_refs
      }
    ]
  };
  const scenarios = [
    {
      protocol_id: RESPONSES_PROTOCOL_ID,
      operation: "responses" as const,
      request_body: createSandboxSecurityOpenAiJudgeRequest(current, {
        judge_requested_model: JUDGE_REQUESTED_MODEL
      }).body,
      response_body: responseBody(results)
    },
    {
      protocol_id: CHAT_PROTOCOL_ID,
      operation: "chat_completions" as const,
      request_body: createSandboxSecurityOpenAiChatJudgeRequest(current, {
        judge_requested_model: JUDGE_REQUESTED_MODEL
      }).body,
      response_body: chatResponseBody(results)
    }
  ] as const;

  for (const scenario of scenarios) {
    const harness = transportHarness(() => jsonResponse(scenario.response_body));
    const detector = createSandboxSecurityOpenAiJudgeDetector({
      transport: harness.transport,
      judge_protocol_id: scenario.protocol_id,
      judge_requested_model: JUDGE_REQUESTED_MODEL
    });
    const signal = new AbortController().signal;

    const result = await detector.detect(current, signal);

    assert.equal(harness.calls.length, 1);
    assert.deepEqual(Object.keys(harness.calls[0]!), [
      "provider",
      "operation",
      "body",
      "signal",
      "max_response_bytes"
    ]);
    assert.equal(harness.calls[0]!.provider, "openai");
    assert.equal(harness.calls[0]!.operation, scenario.operation);
    assert.equal(harness.calls[0]!.signal, signal);
    assert.equal(harness.calls[0]!.max_response_bytes, 65_536);
    assert.deepEqual(
      "body" in harness.calls[0]! ? harness.calls[0]!.body : undefined,
      scenario.request_body
    );
    assert.deepEqual(result, expected);
    assertDeepFrozen(result);
  }
});

test("REQ-SBX-GENERAL-002 Judge omission is partial coverage only", async () => {
  const current = payload();
  const second = current.routed_obligations[1]!;
  const harness = transportHarness(() =>
    jsonResponse(responseBody([
      judgeResult(second.obligation_id, "clearance", "uncertain", null)
    ]))
  );
  const detector = createResponsesJudgeDetector(harness.transport);

  const partial = await detector.detect(current, new AbortController().signal);
  assert.deepEqual(partial.candidates, []);
  assert.deepEqual(partial.clearances.map((item) => item.obligation_id), [
    second.obligation_id
  ]);

  const emptyHarness = transportHarness(() => jsonResponse(responseBody([])));
  const empty = await createResponsesJudgeDetector(emptyHarness.transport)
    .detect(current, new AbortController().signal);
  assert.deepEqual(empty, { candidates: [], clearances: [] });
});

test("REQ-SBX-GENERAL-002 Judge detector enforces the inherited 64 KiB request cap before transport", async () => {
  const options = Object.freeze({ judge_requested_model: "gpt-5.4-mini" });
  let low = 0;
  let high = 100_000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    try {
      createSandboxSecurityOpenAiJudgeRequest(
        payload("decision-cap", "x".repeat(middle)),
        options
      );
      low = middle;
    } catch {
      high = middle - 1;
    }
  }
  const accepted = payload("decision-cap", "x".repeat(low));
  const rejected = payload("decision-cap", "x".repeat(low + 1));
  assert.equal(
    createSandboxSecurityOpenAiJudgeRequest(accepted, options).body.byteLength,
    65_536
  );

  const harness = transportHarness(() => jsonResponse(responseBody([])));
  const detector = createResponsesJudgeDetector(harness.transport);
  await detector.detect(accepted, new AbortController().signal);
  await assertDetectorInvalid(() => detector.detect(rejected, new AbortController().signal));
  assert.equal(harness.calls.length, 1);
});

test("REQ-SBX-GENERAL-002 Judge detector rejects the whole malformed or cross-evaluation response", async () => {
  const current = payload();
  const currentId = current.routed_obligations[0]!.obligation_id;
  const invalidResults: readonly Readonly<Record<string, unknown>>[][] = [
    [judgeResult(currentId), judgeResult(currentId)],
    [judgeResult(obligationId("decision-unknown", 1))],
    [judgeResult(obligationId("decision-stale", 1))],
    [judgeResult(obligationId("decision-other-evaluation", 2))],
    [{ obligation_id: currentId, outcome: "risk", confidence: "confident" }],
    [judgeResult(currentId, "clearance", "confident", "high")]
  ];

  for (const items of invalidResults) {
    const harness = transportHarness(() => jsonResponse(responseBody(items)));
    const detector = createResponsesJudgeDetector(harness.transport);
    await assertDetectorInvalid(
      () => detector.detect(current, new AbortController().signal),
      [RAW_PROVIDER_SENTINEL]
    );
    assert.equal(harness.calls.length, 1);
  }
});

test("REQ-SBX-GENERAL-002 Judge detector requires exact HTTP 200 JSON and response byte bounds", async () => {
  const current = payload();
  const base = responseBody([]);
  const boundary = new Uint8Array(65_536);
  boundary.fill(0x20);
  boundary.set(base);
  const accepted = transportHarness(() => jsonResponse(boundary));
  assert.deepEqual(
    await createResponsesJudgeDetector(accepted.transport)
      .detect(current, new AbortController().signal),
    { candidates: [], clearances: [] }
  );

  for (const response of [
    { status: 199, content_type: "application/json", body: base },
    { status: 201, content_type: "application/json", body: base },
    { status: 200, content_type: "text/plain", body: base },
    { status: 200, content_type: null, body: base },
    { status: 200, content_type: "application/json", body: new Uint8Array(65_537) }
  ] as const) {
    const harness = transportHarness(() => response);
    await assertDetectorInvalid(() =>
      createResponsesJudgeDetector(harness.transport)
        .detect(current, new AbortController().signal)
    );
  }
});

test("REQ-SBX-GENERAL-002 Judge detector rejects missing unknown inherited and accessor responses", async () => {
  const current = payload();
  const valid = jsonResponse(responseBody([]));
  let getterCalls = 0;
  const accessorResponse = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(accessorResponse, "status", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(RAW_PROVIDER_SENTINEL);
    }
  });
  Object.defineProperties(accessorResponse, {
    content_type: { enumerable: true, value: "application/json" },
    body: { enumerable: true, value: responseBody([]) }
  });

  for (const response of [
    { status: 200, content_type: "application/json" },
    { ...valid, provider_prose: RAW_PROVIDER_SENTINEL },
    Object.create(valid),
    accessorResponse
  ]) {
    const harness = transportHarness(() => response as never);
    await assertDetectorInvalid(
      () => createResponsesJudgeDetector(harness.transport)
        .detect(current, new AbortController().signal),
      [RAW_PROVIDER_SENTINEL]
    );
  }
  assert.equal(getterCalls, 0);
});

test("REQ-SBX-GENERAL-002 Judge detector requires one exact protocol and rejects open construction input", () => {
  const harness = transportHarness(() => jsonResponse(responseBody([])));
  let getterCalls = 0;
  const accessorInput = {} as Record<string, unknown>;
  Object.defineProperty(accessorInput, "transport", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(RAW_PROVIDER_SENTINEL);
    }
  });
  const accessorTransport = {} as Record<string, unknown>;
  Object.defineProperty(accessorTransport, "request", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(RAW_PROVIDER_SENTINEL);
    }
  });

  for (const input of [
    {},
    {
      transport: harness.transport,
      judge_requested_model: JUDGE_REQUESTED_MODEL
    },
    {
      transport: harness.transport,
      judge_protocol_id: RESPONSES_PROTOCOL_ID
    },
    {
      transport: harness.transport,
      judge_protocol_id: "openai_auto",
      judge_requested_model: JUDGE_REQUESTED_MODEL
    },
    {
      transport: harness.transport,
      judge_protocol_id: RESPONSES_PROTOCOL_ID,
      judge_requested_model: JUDGE_REQUESTED_MODEL,
      unknown: true
    },
    { transport: harness.transport, unknown: true },
    Object.create({ transport: harness.transport }),
    accessorInput,
    { transport: Object.create(harness.transport) },
    { transport: accessorTransport }
  ]) {
    assert.throws(
      () => createSandboxSecurityOpenAiJudgeDetector(input as never),
      {
        name: "TypeError",
        message: "sandbox_security_openai_judge_detector_invalid"
      }
    );
  }
  assert.equal(getterCalls, 0);
});

test("REQ-SBX-GENERAL-002 Judge detector propagates transport abort error and termination identities", async () => {
  const current = payload();
  for (const failure of [
    Object.assign(new Error("sandbox_security_transport_aborted"), {
      name: "sandbox_security_transport_aborted"
    }),
    Object.assign(new Error("sandbox_security_slot_timeout"), {
      name: "sandbox_security_slot_timeout"
    }),
    new Error("RAW_TRANSPORT_ERROR_SENTINEL")
  ]) {
    const harness = transportHarness(() => {
      throw failure;
    });
    await assert.rejects(
      () => createResponsesJudgeDetector(harness.transport)
        .detect(current, new AbortController().signal),
      (error: unknown) => error === failure
    );
    assert.equal(harness.calls.length, 1);
  }
});

test("REQ-SBX-GENERAL-002 Judge detector preserves the exact signal and abort race identity", async () => {
  const current = payload();
  const preAbort = new AbortController();
  const preAbortReason = new Error("sandbox_security_work_budget");
  preAbort.abort(preAbortReason);
  const preHarness = transportHarness(() => jsonResponse(responseBody([])));
  await assert.rejects(
    () => createResponsesJudgeDetector(preHarness.transport)
      .detect(current, preAbort.signal),
    (error: unknown) => error === preAbortReason
  );
  assert.equal(preHarness.calls.length, 0);

  const race = new AbortController();
  const raceReason = new Error("sandbox_security_slot_timeout");
  const raceHarness = transportHarness((input) => {
    assert.equal(input.signal, race.signal);
    race.abort(raceReason);
    return jsonResponse(responseBody([]));
  });
  await assert.rejects(
    () => createResponsesJudgeDetector(raceHarness.transport)
      .detect(current, race.signal),
    (error: unknown) => error === raceReason
  );
  assert.equal(raceHarness.calls.length, 1);
});

test("REQ-SBX-GENERAL-002 Judge detector returns fresh copies without payload or provider prose retention", async () => {
  const current = payload();
  const firstObligation = current.routed_obligations[0]!;
  const harness = transportHarness(() =>
    jsonResponse(responseBody([
      judgeResult(firstObligation.obligation_id)
    ], true))
  );
  const detector = createResponsesJudgeDetector(harness.transport);
  const first = await detector.detect(current, new AbortController().signal);
  const second = await detector.detect(current, new AbortController().signal);

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.candidates, second.candidates);
  assert.notStrictEqual(first.candidates[0]!.subject_refs, firstObligation.subject_refs);
  assert.notStrictEqual(
    first.candidates[0]!.subject_refs[0],
    firstObligation.subject_refs[0]
  );
  const serialized = JSON.stringify(first);
  for (const forbidden of [
    RAW_PROVIDER_SENTINEL,
    SANITIZED_PAYLOAD_SENTINEL,
    "gpt-5.4-mini",
    "output_text",
    "reasoning",
    "usage"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assertDeepFrozen(first);
  assertDeepFrozen(second);
});

test("REQ-SBX-GENERAL-002 Judge detector has no direct capability or frozen-core deep import", () => {
  const source = existsSync(detectorPath) ? readFileSync(detectorPath, "utf8") : "";
  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns|fs|child_process)/);
  assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|process\.getBuiltinModule/);
  assert.doesNotMatch(source, /\b(?:setTimeout|setInterval)\s*\(|AbortSignal\.timeout/);
  assert.doesNotMatch(source, /benchmark|fixture_id|truth|capture_sink|replay_transport/i);
  assert.doesNotMatch(source, /\b(?:console\.|eval\s*\(|Function\s*\(|import\s*\()/);
  assert.doesNotMatch(source, /from\s+["']\.\.\/security\/(?!index\.ts["'])/);
});

void (undefined as unknown as SandboxSecurityExternalDetectorResult);
