import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const providerOutcomesPath = new URL(
  "../src/security-production/provider-outcomes.ts",
  import.meta.url
);

type ProviderOutcomesModule = {
  normalizeSandboxSecurityReplayOutcome<T>(
    value: unknown,
    normalizeResponse: (value: unknown) => T
  ): unknown;
  normalizeSandboxSecurityReplayOllamaInventoryResponse(value: unknown): unknown;
  normalizeSandboxSecurityReplayOllamaResponse(value: unknown): unknown;
  normalizeSandboxSecurityReplayOpenAIResponse(value: unknown): unknown;
};

const inertProviderOutcomesModule: ProviderOutcomesModule = {
  normalizeSandboxSecurityReplayOutcome(value) {
    return value;
  },
  normalizeSandboxSecurityReplayOllamaInventoryResponse(value) {
    return value;
  },
  normalizeSandboxSecurityReplayOllamaResponse(value) {
    return value;
  },
  normalizeSandboxSecurityReplayOpenAIResponse(value) {
    return value;
  }
};

const providerOutcomesModule: ProviderOutcomesModule = existsSync(providerOutcomesPath)
  ? ((await import("../src/security-production/provider-outcomes.ts")) as ProviderOutcomesModule)
  : inertProviderOutcomesModule;

const {
  normalizeSandboxSecurityReplayOutcome,
  normalizeSandboxSecurityReplayOllamaInventoryResponse,
  normalizeSandboxSecurityReplayOllamaResponse,
  normalizeSandboxSecurityReplayOpenAIResponse
} = providerOutcomesModule;

const DIGEST = `sha256:${"a".repeat(64)}`;

function inventory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "qwen3:8b",
    digest: DIGEST,
    ...overrides
  };
}

function contentRef(sourceOrdinal = 1): Record<string, unknown> {
  return {
    kind: "content_source",
    source_ordinal: sourceOrdinal,
    component: "whole_source"
  };
}

function toolRef(component = "whole_call"): Record<string, unknown> {
  return {
    kind: "tool_request",
    component
  };
}

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "prompt_injection",
    severity: "high",
    confidence: "confident",
    subject_refs: [contentRef()],
    ...overrides
  };
}

function ollama(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    model: "qwen3:8b",
    verified_ollama_digest: DIGEST,
    done: true,
    message: {
      role: "assistant",
      parsed: {
        schema_version: "sandbox-security-local-model.v1",
        status: "matched",
        candidates: [candidate()]
      }
    },
    ...overrides
  };
}

function obligation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    obligation_ordinal: 1,
    outcome: "risk",
    confidence: "probable",
    severity: "medium",
    ...overrides
  };
}

function openAi(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "gpt-5.6-terra",
    status: "completed",
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: [obligation()]
    },
    ...overrides
  };
}

function response(normalizedResponse: unknown): Record<string, unknown> {
  return {
    status: "response",
    http_status: 200,
    content_type: "application/json",
    normalized_response: normalizedResponse
  };
}

function normalizeInventoryOutcome(value: unknown): unknown {
  return normalizeSandboxSecurityReplayOutcome(
    value,
    normalizeSandboxSecurityReplayOllamaInventoryResponse
  );
}

function normalizeOllamaOutcome(value: unknown): unknown {
  return normalizeSandboxSecurityReplayOutcome(
    value,
    normalizeSandboxSecurityReplayOllamaResponse
  );
}

function normalizeOpenAiOutcome(value: unknown): unknown {
  return normalizeSandboxSecurityReplayOutcome(
    value,
    normalizeSandboxSecurityReplayOpenAIResponse
  );
}

function assertRecursivelyFrozen(value: unknown, path = "root"): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  assert.equal(Object.isFrozen(value), true, `${path} must be recursively frozen`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertRecursivelyFrozen(descriptor.value, `${path}.${String(key)}`);
    }
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertFixedProviderOutcomeInvalid(
  action: () => void,
  forbidden: readonly string[]
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof TypeError);
  assert.equal(thrown.message, "sandbox_security_provider_outcome_invalid");
  const serialized = JSON.stringify({
    name: thrown.name,
    message: thrown.message,
    stack: thrown.stack ?? ""
  });
  for (const secret of forbidden) {
    assert.equal(serialized.includes(secret), false);
  }
}

test("REQ-SBX-GENERAL-002 replay outcomes accept only the five closed branches", () => {
  const inventoryOutcome = normalizeInventoryOutcome(response(inventory()));
  const ollamaOutcome = normalizeOllamaOutcome(response(ollama()));
  const openAiOutcome = normalizeOpenAiOutcome(response(openAi()));

  assert.deepEqual(normalizeInventoryOutcome({ status: "not_called" }), {
    status: "not_called"
  });
  assert.deepEqual(inventoryOutcome, response(inventory()));
  assert.deepEqual(ollamaOutcome, response(ollama()));
  assert.deepEqual(openAiOutcome, response(openAi()));
  assert.deepEqual(normalizeInventoryOutcome({ status: "http_error", http_status: 404 }), {
    status: "http_error",
    http_status: 404
  });
  for (const error_code of [
    "connection_failed",
    "response_too_large",
    "provider_response_invalid"
  ]) {
    assert.deepEqual(normalizeInventoryOutcome({ status: "transport_error", error_code }), {
      status: "transport_error",
      error_code
    });
  }
  for (const termination_reason of ["slot_timeout", "work_budget"]) {
    assert.deepEqual(
      normalizeInventoryOutcome({ status: "signal_termination", termination_reason }),
      { status: "signal_termination", termination_reason }
    );
  }
  assertRecursivelyFrozen(ollamaOutcome);
});

test("REQ-SBX-GENERAL-002 replay outcome rejects every open or malformed branch", () => {
  const invalid = [
    {},
    { status: "unknown" },
    { status: "not_called", http_status: 200 },
    { status: "response", http_status: 201, content_type: "application/json", normalized_response: inventory() },
    { status: "response", http_status: 200, content_type: "text/plain", normalized_response: inventory() },
    { status: "http_error", http_status: 200 },
    { status: "transport_error", error_code: "timeout" },
    { status: "signal_termination", termination_reason: "caller_abort" }
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeInventoryOutcome(value));
  }
});

test("REQ-SBX-GENERAL-002 concrete inventory normalizer contains hostile getPrototypeOf errors", () => {
  const secret = "prototype-secret-provider-prose";
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error(secret);
      }
    }
  );

  assertFixedProviderOutcomeInvalid(
    () => normalizeSandboxSecurityReplayOllamaInventoryResponse(hostile),
    [secret, "provider-prose"]
  );
});

test("REQ-SBX-GENERAL-002 outcome normalizer contains hostile ownKeys errors", () => {
  const secret = "own-keys-secret-provider-prose";
  const hostile = new Proxy(
    { status: "not_called" },
    {
      ownKeys() {
        throw new Error(secret);
      }
    }
  );

  assertFixedProviderOutcomeInvalid(
    () =>
      normalizeSandboxSecurityReplayOutcome(
        hostile,
        normalizeSandboxSecurityReplayOllamaInventoryResponse
      ),
    [secret, "provider-prose"]
  );
});

test("REQ-SBX-GENERAL-002 outcome normalizer contains hostile descriptor errors", () => {
  const secret = "descriptor-secret-provider-prose";
  const hostileInventory = new Proxy(
    inventory(),
    {
      getOwnPropertyDescriptor() {
        throw new Error(secret);
      }
    }
  );

  assertFixedProviderOutcomeInvalid(
    () => normalizeInventoryOutcome(response(hostileInventory)),
    [secret, "provider-prose"]
  );
});

test("REQ-SBX-GENERAL-002 concrete inventory normalizer contains revoked proxy errors", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();

  assertFixedProviderOutcomeInvalid(
    () => normalizeSandboxSecurityReplayOllamaInventoryResponse(proxy),
    ["revoked", "proxy"]
  );
});

test("REQ-SBX-GENERAL-002 replay response accepts only concrete content-free normalizer identities", () => {
  const identity = (value: unknown) => value;
  const wrappedInventory = (value: unknown) =>
    normalizeSandboxSecurityReplayOllamaInventoryResponse(value);
  const rawResponse = response({ body: "raw", truth: "secret" });

  assert.throws(() =>
    normalizeSandboxSecurityReplayOutcome(rawResponse, identity)
  );
  assert.throws(() =>
    normalizeSandboxSecurityReplayOutcome(rawResponse, wrappedInventory)
  );
});

test("REQ-SBX-GENERAL-002 replay outcome restricts HTTP error status to non-200 HTTP integers", () => {
  for (const http_status of [100, 199, 201, 599]) {
    assert.deepEqual(
      normalizeInventoryOutcome({ status: "http_error", http_status }),
      { status: "http_error", http_status }
    );
  }
  for (const http_status of [99, 600, 200, 200.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() =>
      normalizeInventoryOutcome({ status: "http_error", http_status })
    );
  }
});

test("REQ-SBX-GENERAL-002 replay outcome rejects missing unknown inherited accessor symbol and nonenumerable keys", () => {
  const inherited = Object.create({ status: "not_called" }) as Record<string, unknown>;
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, "status", {
    enumerable: true,
    get() {
      return "not_called";
    }
  });
  const symbol = { status: "not_called", [Symbol("extra")]: "forbidden" };
  const nonenumerable: Record<string, unknown> = {};
  Object.defineProperty(nonenumerable, "status", {
    enumerable: false,
    value: "not_called"
  });

  for (const value of [
    {},
    { status: "not_called", extra: true },
    inherited,
    accessor,
    symbol,
    nonenumerable
  ]) {
    assert.throws(() => normalizeInventoryOutcome(value));
  }
});

test("REQ-SBX-GENERAL-002 response normalizers reject malformed nested records", () => {
  const inheritedDigest = Object.create({ digest: DIGEST }) as Record<string, unknown>;
  inheritedDigest.model = "qwen3:8b";
  const accessorCandidate = candidate();
  Object.defineProperty(accessorCandidate, "severity", {
    enumerable: true,
    get() {
      return "high";
    }
  });
  const symbolObligation = obligation();
  Object.defineProperty(symbolObligation, Symbol("forbidden"), {
    enumerable: true,
    value: true
  });

  for (const value of [
    { model: "qwen3:8b" },
    inventory({ body: "raw provider body" }),
    inheritedDigest,
    ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [accessorCandidate] } } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [symbolObligation] } })
  ]) {
    const normalizer =
      value === inheritedDigest || "digest" in value
        ? normalizeSandboxSecurityReplayOllamaInventoryResponse
        : "message" in value
          ? normalizeSandboxSecurityReplayOllamaResponse
          : normalizeSandboxSecurityReplayOpenAIResponse;
    assert.throws(() => normalizer(value));
  }
});

test("REQ-SBX-GENERAL-002 response normalizers reject sparse aliased and cyclic values", () => {
  const sparseRefs = [contentRef()];
  sparseRefs.length = 2;
  const sharedRef = contentRef();
  const aliasedCandidates = [
    candidate({ subject_refs: [sharedRef] }),
    candidate({ category: "jailbreak", subject_refs: [sharedRef] })
  ];
  const cyclicCandidate = candidate();
  (cyclicCandidate.subject_refs as unknown[]).push(cyclicCandidate);

  assert.throws(() =>
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [candidate({ subject_refs: sparseRefs })] } } })
    )
  );
  assert.throws(() =>
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: aliasedCandidates } } })
    )
  );
  assert.throws(() =>
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [cyclicCandidate] } } })
    )
  );
});

test("REQ-SBX-GENERAL-002 replay inventory and Ollama responses require normalized immutable digests", () => {
  for (const digest of [
    "sha256:" + "A".repeat(64),
    "sha256:" + "a".repeat(63),
    "sha256:" + "g".repeat(64),
    "sha512:" + "a".repeat(64),
    DIGEST + " "
  ]) {
    assert.throws(() => normalizeSandboxSecurityReplayOllamaInventoryResponse(inventory({ digest })));
    assert.throws(() => normalizeSandboxSecurityReplayOllamaResponse(ollama({ verified_ollama_digest: digest })));
  }
});

test("REQ-SBX-GENERAL-002 Ollama response enforces status cardinality and candidate boundaries", () => {
  const noMatch = ollama({
    message: {
      role: "assistant",
      parsed: {
        schema_version: "sandbox-security-local-model.v1",
        status: "no_match",
        candidates: []
      }
    }
  });
  const maximumCandidates = Array.from({ length: 32 }, (_, index) =>
    candidate({ category: index % 2 === 0 ? "prompt_injection" : "jailbreak", subject_refs: [contentRef(index + 1)] })
  );
  const matchedMaximum = ollama({
    message: {
      role: "assistant",
      parsed: {
        schema_version: "sandbox-security-local-model.v1",
        status: "matched",
        candidates: maximumCandidates
      }
    }
  });

  assert.deepEqual(normalizeSandboxSecurityReplayOllamaResponse(noMatch), noMatch);
  assert.deepEqual(normalizeSandboxSecurityReplayOllamaResponse(matchedMaximum), matchedMaximum);
  for (const value of [
    ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "no_match", candidates: [candidate()] } } }),
    ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [] } } }),
    ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: Array.from({ length: 33 }, () => candidate()) } } })
  ]) {
    assert.throws(() => normalizeSandboxSecurityReplayOllamaResponse(value));
  }
});

test("REQ-SBX-GENERAL-002 Ollama candidates enforce exact closed subjects and reference bounds", () => {
  const eightRefs = [
    contentRef(1),
    contentRef(2),
    contentRef(3),
    contentRef(4),
    contentRef(5),
    toolRef("whole_call"),
    toolRef("tool_name"),
    toolRef("arguments")
  ];
  assert.deepEqual(
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [candidate({ subject_refs: eightRefs })] } } })
    ),
    ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [candidate({ subject_refs: eightRefs })] } } })
  );

  const invalidCandidates = [
    candidate({ category: "other" }),
    candidate({ severity: "none" }),
    candidate({ confidence: "certain" }),
    candidate({ subject_refs: [] }),
    candidate({ subject_refs: Array.from({ length: 9 }, (_, index) => contentRef(index + 1)) }),
    candidate({ subject_refs: [contentRef(0)] }),
    candidate({ subject_refs: [contentRef(65)] }),
    candidate({ subject_refs: [contentRef(1.5)] }),
    candidate({ subject_refs: [toolRef("body")] })
  ];
  for (const invalidCandidate of invalidCandidates) {
    assert.throws(() =>
      normalizeSandboxSecurityReplayOllamaResponse(
        ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [invalidCandidate] } } })
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 Ollama response rejects duplicate references and exact duplicate candidates", () => {
  const duplicateRef = contentRef(1);
  const duplicateCandidate = candidate();
  const duplicateCandidateCopy = clone(duplicateCandidate);

  assert.throws(() =>
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [candidate({ subject_refs: [duplicateRef, clone(duplicateRef)] })] } } })
    )
  );
  assert.throws(() =>
    normalizeSandboxSecurityReplayOllamaResponse(
      ollama({ message: { role: "assistant", parsed: { schema_version: "sandbox-security-local-model.v1", status: "matched", candidates: [duplicateCandidate, duplicateCandidateCopy] } } })
    )
  );
});

test("REQ-SBX-GENERAL-002 Ollama candidate uniqueness ignores severity confidence and subject order", () => {
  const original = candidate({
    subject_refs: [contentRef(1), toolRef("target")]
  });
  const severityConfidenceVariant = candidate({
    severity: "low",
    confidence: "uncertain",
    subject_refs: [contentRef(1), toolRef("target")]
  });
  const reorderedSubjects = candidate({
    severity: "critical",
    confidence: "probable",
    subject_refs: [toolRef("target"), contentRef(1)]
  });

  for (const candidates of [
    [original, severityConfidenceVariant],
    [original, reorderedSubjects]
  ]) {
    assert.throws(() =>
      normalizeSandboxSecurityReplayOllamaResponse(
        ollama({
          message: {
            role: "assistant",
            parsed: {
              schema_version: "sandbox-security-local-model.v1",
              status: "matched",
              candidates
            }
          }
        })
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 OpenAI response enforces bounded unique obligations and outcome severity consistency", () => {
  const empty = openAi({
    parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [] }
  });
  const maximum = openAi({
    parsed: {
      schema_version: "sandbox-security-judge.v1",
      obligation_results: Array.from({ length: 32 }, (_, index) =>
        obligation({
          obligation_ordinal: index + 1,
          outcome: index % 2 === 0 ? "risk" : "clearance",
          severity: index % 2 === 0 ? "critical" : null
        })
      )
    }
  });

  assert.deepEqual(normalizeSandboxSecurityReplayOpenAIResponse(empty), empty);
  assert.deepEqual(normalizeSandboxSecurityReplayOpenAIResponse(maximum), maximum);
  const invalid = [
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: Array.from({ length: 33 }, (_, index) => obligation({ obligation_ordinal: index + 1 })) } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [obligation({ obligation_ordinal: 0 })] } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [obligation({ obligation_ordinal: 32.5 })] } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [obligation({ obligation_ordinal: 1 }), obligation({ obligation_ordinal: 1, outcome: "clearance", severity: null })] } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [obligation({ severity: null })] } }),
    openAi({ parsed: { schema_version: "sandbox-security-judge.v1", obligation_results: [obligation({ outcome: "clearance", severity: "low" })] } })
  ];
  for (const value of invalid) {
    assert.throws(() => normalizeSandboxSecurityReplayOpenAIResponse(value));
  }
});

test("REQ-SBX-GENERAL-002 OpenAI response permits structural obligation ordinals through 999", () => {
  for (const obligation_ordinal of [33, 999]) {
    const input = openAi({
      parsed: {
        schema_version: "sandbox-security-judge.v1",
        obligation_results: [obligation({ obligation_ordinal })]
      }
    });
    assert.deepEqual(normalizeSandboxSecurityReplayOpenAIResponse(input), input);
  }
  assert.throws(() =>
    normalizeSandboxSecurityReplayOpenAIResponse(
      openAi({
        parsed: {
          schema_version: "sandbox-security-judge.v1",
          obligation_results: [obligation({ obligation_ordinal: 1000 })]
        }
      })
    )
  );
});

test("REQ-SBX-GENERAL-002 provider outcomes defensively copy and recursively freeze every response node", () => {
  const input = response(ollama());
  const output = normalizeOllamaOutcome(input) as {
    normalized_response: {
      message: {
        role: string;
        parsed: { candidates: Array<{ subject_refs: Array<{ source_ordinal: number }> }> };
      };
    };
  };

  const inputResponse = input.normalized_response as {
    message: {
      role: string;
      parsed: { candidates: Array<{ subject_refs: Array<{ source_ordinal: number }> }> };
    };
  };
  inputResponse.message.role = "user";
  const sourceRef = inputResponse.message.parsed.candidates[0]!.subject_refs[0]!;
  sourceRef.source_ordinal = 64;

  assert.equal(output.normalized_response.message.role, "assistant");
  assert.equal(output.normalized_response.message.parsed.candidates[0]!.subject_refs[0]!.source_ordinal, 1);
  assertRecursivelyFrozen(output);
  assert.throws(() => {
    output.normalized_response.message.parsed.candidates[0]!.subject_refs[0]!.source_ordinal = 2;
  });
});

test("REQ-SBX-GENERAL-002 provider outcomes never retain forbidden content-bearing vocabulary", () => {
  const forbiddenKeys = [
    "request",
    "body",
    "prose",
    "id",
    "usage",
    "headers",
    "authorization",
    "secret",
    "fixture_id",
    "truth",
    "error_message"
  ];
  for (const key of forbiddenKeys) {
    assert.throws(() =>
      normalizeInventoryOutcome({
        ...response(inventory()),
        [key]: "content that must never persist"
      })
    );
  }
  assert.throws(() =>
    normalizeInventoryOutcome({
      status: "transport_error",
      error_code: "connection_failed",
      message: "provider body must not survive"
    })
  );

  const serialized = JSON.stringify(normalizeOllamaOutcome(response(ollama())));
  assert.doesNotMatch(
    serialized,
    /"(?:request|body|prose|id|usage|headers|authorization|secret|fixture_id|truth|error_message)"/i
  );
});
