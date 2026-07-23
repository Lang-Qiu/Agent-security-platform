import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

type JudgeProtocolId =
  | "openai_responses_v1"
  | "openai_chat_completions_json_v1";

interface JudgeProtocolBinding {
  readonly protocol_id: JudgeProtocolId;
  readonly endpoint_policy_id: "operator_https_fqdn_v1";
  readonly base_url: string;
  readonly endpoint_url: string;
}

type ResolveJudgeProtocol = (
  protocolId: JudgeProtocolId,
  baseUrl: string
) => Readonly<JudgeProtocolBinding>;
type NormalizeJudgeEndpoint = (
  protocolId: JudgeProtocolId,
  endpointUrl: string
) => Readonly<JudgeProtocolBinding>;
type ResolveResponsesJudgeProtocol = (
  baseUrl: string
) => Readonly<JudgeProtocolBinding>;
type NormalizeResponsesJudgeEndpoint = (
  endpointUrl: string
) => Readonly<JudgeProtocolBinding>;

let judgeProtocolIds: readonly JudgeProtocolId[] = [];
let resolveJudgeProtocol: ResolveJudgeProtocol = () => {
  throw new Error("guarded-judge-protocol-adapter-placeholder");
};
let normalizeJudgeEndpoint: NormalizeJudgeEndpoint = () => {
  throw new Error("guarded-judge-protocol-endpoint-placeholder");
};
let resolveResponsesJudgeProtocol: ResolveResponsesJudgeProtocol = () => {
  throw new Error("guarded-responses-protocol-adapter-placeholder");
};
let normalizeResponsesJudgeEndpoint: NormalizeResponsesJudgeEndpoint = () => {
  throw new Error("guarded-responses-protocol-endpoint-placeholder");
};

try {
  const candidate = await import(
    "../src/security-production/judge-protocol-adapter.ts"
  );
  if (Array.isArray(candidate.SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS)) {
    judgeProtocolIds =
      candidate.SANDBOX_SECURITY_JUDGE_PROTOCOL_IDS as readonly JudgeProtocolId[];
  }
  if (typeof candidate.resolveSandboxSecurityJudgeProtocol === "function") {
    resolveJudgeProtocol =
      candidate.resolveSandboxSecurityJudgeProtocol as ResolveJudgeProtocol;
  }
  if (typeof candidate.normalizeSandboxSecurityJudgeEndpoint === "function") {
    normalizeJudgeEndpoint =
      candidate.normalizeSandboxSecurityJudgeEndpoint as NormalizeJudgeEndpoint;
  }
  if (
    typeof candidate.resolveSandboxSecurityOpenAiResponsesJudgeProtocol ===
    "function"
  ) {
    resolveResponsesJudgeProtocol =
      candidate.resolveSandboxSecurityOpenAiResponsesJudgeProtocol as ResolveResponsesJudgeProtocol;
  }
  if (
    typeof candidate.normalizeSandboxSecurityOpenAiResponsesJudgeEndpoint ===
    "function"
  ) {
    normalizeResponsesJudgeEndpoint =
      candidate.normalizeSandboxSecurityOpenAiResponsesJudgeEndpoint as NormalizeResponsesJudgeEndpoint;
  }
} catch (error: unknown) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ERR_MODULE_NOT_FOUND"
  ) {
    throw error;
  }
}

function assertInvalidJudgeProtocol(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "sandbox_security_judge_protocol_invalid");
    assert.equal(error.message, "sandbox_security_judge_protocol_invalid");
    return true;
  });
}

test("REQ-SBX-GENERAL-002 exposes only the two source-controlled Judge protocol IDs", () => {
  assert.deepEqual(judgeProtocolIds, [
    "openai_responses_v1",
    "openai_chat_completions_json_v1"
  ]);
  assert.equal(Object.isFrozen(judgeProtocolIds), true);
});

for (const [protocolId, endpointUrl] of [
  ["openai_responses_v1", "https://us.doro.lol/v1/responses"],
  [
    "openai_chat_completions_json_v1",
    "https://us.doro.lol/v1/chat/completions"
  ]
] as const) {
  test(`REQ-SBX-GENERAL-002 explicit ${protocolId} derives only its canonical endpoint`, () => {
    const binding = resolveJudgeProtocol(
      protocolId,
      " HTTPS://US.DORO.LOL/v1/ "
    );

    assert.deepEqual(binding, {
      protocol_id: protocolId,
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://us.doro.lol/v1",
      endpoint_url: endpointUrl
    });
    assert.equal(Object.isFrozen(binding), true);
  });

  test(`REQ-SBX-GENERAL-002 explicit ${protocolId} normalizes only its canonical endpoint`, () => {
    assert.deepEqual(normalizeJudgeEndpoint(protocolId, endpointUrl), {
      protocol_id: protocolId,
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://us.doro.lol/v1",
      endpoint_url: endpointUrl
    });
  });
}

for (const [protocolId, endpointUrl] of [
  ["openai_responses_v1", "https://us.doro.lol/v1/responses"],
  [
    "openai_chat_completions_json_v1",
    "https://us.doro.lol/v1/chat/completions"
  ]
] as const) {
  for (const [position, paddedEndpointUrl] of [
    ["leading", ` ${endpointUrl}`],
    ["trailing", `${endpointUrl} `]
  ] as const) {
    test(`REQ-SBX-GENERAL-002 ${protocolId} rejects ${position} endpoint whitespace`, () => {
      assertInvalidJudgeProtocol(() =>
        normalizeJudgeEndpoint(protocolId, paddedEndpointUrl)
      );
    });
  }
}

test("REQ-SBX-GENERAL-002 rejects cross-protocol endpoint substitution", () => {
  assertInvalidJudgeProtocol(() =>
    normalizeJudgeEndpoint(
      "openai_chat_completions_json_v1",
      "https://us.doro.lol/v1/responses"
    )
  );
  assertInvalidJudgeProtocol(() =>
    normalizeJudgeEndpoint(
      "openai_responses_v1",
      "https://us.doro.lol/v1/chat/completions"
    )
  );
});

test("REQ-SBX-GENERAL-002 rejects an unknown explicit Judge protocol", () => {
  assertInvalidJudgeProtocol(() =>
    resolveJudgeProtocol(
      "provider_inferred_protocol" as JudgeProtocolId,
      "https://judge.example.test/v1"
    )
  );
});

test("REQ-SBX-GENERAL-002 independent Responses adapter canonicalizes a non-fixed Doro base URL", () => {
  const binding = resolveResponsesJudgeProtocol(" HTTPS://US.DORO.LOL/v1/ ");

  assert.deepEqual(binding, {
    protocol_id: "openai_responses_v1",
    endpoint_policy_id: "operator_https_fqdn_v1",
    base_url: "https://us.doro.lol/v1",
    endpoint_url: "https://us.doro.lol/v1/responses"
  });
  assert.equal(Object.isFrozen(binding), true);
});

test("REQ-SBX-GENERAL-002 independent Responses adapter accepts a compliant non-Doro provider base URL", () => {
  assert.deepEqual(
    resolveResponsesJudgeProtocol("https://judge.example.test/openai/v1"),
    {
      protocol_id: "openai_responses_v1",
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://judge.example.test/openai/v1",
      endpoint_url: "https://judge.example.test/openai/v1/responses"
    }
  );
});

for (const encodedDotSegment of [
  "%2e",
  "%2E",
  ".%2e",
  ".%2E",
  "%2e.",
  "%2E.",
  "%2e%2e",
  "%2e%2E",
  "%2E%2e",
  "%2E%2E"
]) {
  test(`REQ-SBX-GENERAL-002 adapter rejects percent-encoded dot segment ${encodedDotSegment}`, () => {
    assertInvalidJudgeProtocol(() =>
      resolveResponsesJudgeProtocol(
        `https://judge.example.test/operator/base/${encodedDotSegment}/escaped`
      )
    );
  });
}

for (const rawBackslashBaseUrl of [
  "https://judge.example.test/operator\\child",
  "https://judge.example.test/operator\\..\\escaped",
  "https://judge.example.test/operator/child\\..\\escaped",
  "https://judge.example.test\\operator\\child"
]) {
  test(`REQ-SBX-GENERAL-002 adapter rejects raw backslash path ${rawBackslashBaseUrl}`, () => {
    assertInvalidJudgeProtocol(() =>
      resolveResponsesJudgeProtocol(rawBackslashBaseUrl)
    );
  });
}

for (const protocolId of [
  "openai_responses_v1",
  "openai_chat_completions_json_v1"
] as const) {
  for (const rawDelimiterBaseUrl of [
    "https://@judge.example.test/operator/base",
    "https://:@judge.example.test/operator/base",
    "https://judge.example.test/operator/base?",
    "https://judge.example.test/operator/base#"
  ]) {
    test(`REQ-SBX-GENERAL-002 ${protocolId} rejects erased raw delimiter ${rawDelimiterBaseUrl}`, () => {
      assertInvalidJudgeProtocol(() =>
        resolveJudgeProtocol(protocolId, rawDelimiterBaseUrl)
      );
    });
  }
}

test("REQ-SBX-GENERAL-002 adapter preserves valid percent-encoded path data", () => {
  assert.deepEqual(
    resolveResponsesJudgeProtocol(
      "https://judge.example.test/operator/model%20family"
    ),
    {
      protocol_id: "openai_responses_v1",
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://judge.example.test/operator/model%20family",
      endpoint_url:
        "https://judge.example.test/operator/model%20family/responses"
    }
  );
});

function baseUrlWithExactLength(length: number): string {
  const origin = "https://judge.example.test";
  return `${origin}/${"a".repeat(length - origin.length - 1)}`;
}

for (const [protocolId, endpointSuffix] of [
  ["openai_responses_v1", "/responses"],
  ["openai_chat_completions_json_v1", "/chat/completions"]
] as const) {
  test(`REQ-SBX-GENERAL-002 ${protocolId} accepts and renormalizes the exact base and endpoint length bounds`, () => {
    const baseUrl = baseUrlWithExactLength(512);
    const binding = resolveJudgeProtocol(protocolId, baseUrl);

    assert.equal(binding.base_url.length, 512);
    assert.equal(binding.endpoint_url.length, 512 + endpointSuffix.length);
    assert.deepEqual(normalizeJudgeEndpoint(protocolId, binding.endpoint_url), binding);
  });

  test(`REQ-SBX-GENERAL-002 ${protocolId} rejects base and endpoint lengths one byte beyond their bounds`, () => {
    const overlongBaseUrl = baseUrlWithExactLength(513);

    assertInvalidJudgeProtocol(() =>
      resolveJudgeProtocol(protocolId, overlongBaseUrl)
    );
    assertInvalidJudgeProtocol(() =>
      normalizeJudgeEndpoint(
        protocolId,
        `${overlongBaseUrl}${endpointSuffix}`
      )
    );
  });
}

test("REQ-SBX-GENERAL-002 independent Responses adapter accepts only its derived endpoint", () => {
  assert.deepEqual(
    normalizeResponsesJudgeEndpoint("https://us.doro.lol/v1/responses"),
    {
      protocol_id: "openai_responses_v1",
      endpoint_policy_id: "operator_https_fqdn_v1",
      base_url: "https://us.doro.lol/v1",
      endpoint_url: "https://us.doro.lol/v1/responses"
    }
  );
  assertInvalidJudgeProtocol(() =>
    normalizeResponsesJudgeEndpoint("https://us.doro.lol/v1/other")
  );
});

for (const protocolId of [
  "openai_responses_v1",
  "openai_chat_completions_json_v1"
] as const) {
  for (const baseUrl of [
    "http://judge.example.test/v1",
    "https://127.0.0.1/v1",
    "https://[::1]/v1",
    "https://localhost/v1",
    "https://api.localhost/v1",
    "https://user:pass@judge.example.test/v1",
    "https://judge.example.test:8443/v1",
    "https://judge.example.test/v1?target=elsewhere",
    "https://judge.example.test/v1#fragment",
    "https://judge.example.test/v1/%2fescape",
    "https://judge.example.test/v1/%5cescape",
    "https://judge.example.test/v1/./child",
    "https://judge.example.test/v1//child"
  ]) {
    test(`REQ-SBX-GENERAL-002 ${protocolId} preserves rejection of unsafe base URL ${baseUrl}`, () => {
      assertInvalidJudgeProtocol(() =>
        resolveJudgeProtocol(protocolId, baseUrl)
      );
    });
  }
}

test("REQ-SBX-GENERAL-002 protocol resolver remains a pure capability-free module", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "../src/security-production/judge-protocol-adapter.ts",
        import.meta.url
      )
    ),
    "utf8"
  );

  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.doesNotMatch(source, /\b(?:process|fetch|XMLHttpRequest)\b/u);
  assert.doesNotMatch(source, /["']node:/u);
});
