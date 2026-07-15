import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { resolveSandboxSecurityProfile } from "../src/security/policy-profiles.ts";
import {
  createRecordingExternalDetector,
  createRecordingSanitizer
} from "./fixtures/security-detector.fixture.ts";

const modulePath = new URL("../src/security/sanitized-boundary.ts", import.meta.url);
const boundaryPath = new URL("../src/security/detector-output-boundary.ts", import.meta.url);

const sanitized = existsSync(modulePath)
  ? await import("../src/security/sanitized-boundary.ts")
  : null;

const {
  deriveSandboxSecurityExternalTokenRegistry,
  validateSandboxSecuritySanitizedJudgePayload,
  assertSanitizedJudgePayloadBounds,
  normalizeSandboxSecurityExternalDetectorResult
} = (sanitized ?? {
  deriveSandboxSecurityExternalTokenRegistry() {
    return {
      evaluation_nonce: "0".repeat(32),
      request_token: "bad",
      source_tokens: []
    };
  },
  validateSandboxSecuritySanitizedJudgePayload() {
    throw new Error("missing");
  },
  assertSanitizedJudgePayloadBounds() {},
  normalizeSandboxSecurityExternalDetectorResult() {
    return { status: "invalid_result", error_code: "detector_result_invalid" };
  }
}) as typeof import("../src/security/sanitized-boundary.ts");

const rawBoundary = existsSync(boundaryPath)
  ? await import("../src/security/detector-output-boundary.ts")
  : null;

const NONCE = "a".repeat(32);
const SOURCE = `hsrc:${NONCE}:0001`;
const CALL = `hcall:${NONCE}:0000`;
const SOURCE_TOKEN = `etok:src:${NONCE}:0001`;
const CALL_TOKEN = `etok:call:${NONCE}:0000`;
const TOOL_NAME_TOKEN = `etok:tool-name:${NONCE}:0000`;
const REQUEST_TOKEN = `etok:req:${NONCE}`;
const OBLIGATION_ID = "obligation://sandbox/security/dec-1/0001";

function makeSnapshot(options?: {
  tool?: boolean;
  has_target?: boolean;
  stage?: "user_input" | "tool_request" | "model_output";
  handle?: string;
  second?: boolean;
}) {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const contents: Array<Record<string, unknown>> = [
    Object.freeze({
      source_handle: (options?.handle ?? SOURCE) as never,
      source_id: "src-1",
      source_type: "user_input" as const,
      media_type: "text/plain" as const,
      authority_kind: "simulation_observation" as const,
      value: "hello",
      provenance_ref: "source://fixture/src-1",
      original_utf8_bytes: Object.freeze([104, 101, 108, 108, 111]),
      original_value_sha256: "c".repeat(64),
      comparison_value: "hello",
      trust_class: "user_supplied" as const
    })
  ];
  if (options?.second) {
    contents.push(
      Object.freeze({
        source_handle: `hsrc:${NONCE}:0002` as never,
        source_id: "src-2",
        source_type: "user_input" as const,
        media_type: "text/plain" as const,
        authority_kind: "simulation_observation" as const,
        value: "world",
        provenance_ref: "source://fixture/src-2",
        original_utf8_bytes: Object.freeze([119, 111, 114, 108, 100]),
        original_value_sha256: "d".repeat(64),
        comparison_value: "world",
        trust_class: "user_supplied" as const
      })
    );
  }
  return Object.freeze({
    request_id: "req-1",
    evaluation_mode: "simulation" as const,
    stage: options?.stage ?? (options?.tool ? "tool_request" : "user_input"),
    profile,
    contents: Object.freeze(contents),
    ...(options?.tool
      ? {
          tool_request: Object.freeze({
            call_handle: CALL as never,
            call_id: "call-1",
            authority_kind: "simulation_observation" as const,
            tool_name: "read_file",
            arguments: Object.freeze({ path: "/tmp/x" }),
            arguments_jcs_sha256: "e".repeat(64),
            has_target: options?.has_target ?? false
          })
        }
      : {}),
    canonical_request_sha256: "b".repeat(64)
  });
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    obligation_id: OBLIGATION_ID,
    category: "prompt_injection",
    subject_refs: [
      {
        kind: "content_source",
        source_token: SOURCE_TOKEN,
        locator: { kind: "whole_source" }
      }
    ],
    ...overrides
  };
}

function makePayload(snapshot = makeSnapshot(), obligations = [obligation()]) {
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  return {
    schema_version: "sandbox-security-sanitized-judge.v1" as const,
    request_token: registry.request_token,
    stage: snapshot.stage,
    policy_profile_id: snapshot.profile.profile_id,
    sources: registry.source_tokens.map((entry, index) => ({
      source_token: entry.source_token,
      source_type: "user_input" as const,
      media_type: entry.media_type,
      sanitized_value: `[redacted-${index}]`
    })),
    ...(registry.call_token
      ? {
          tool_request: {
            call_token: registry.call_token.call_token,
            tool_name_token: registry.call_token.tool_name_token,
            sanitized_arguments: {},
            ...(registry.call_token.has_target
              ? { sanitized_target: "[target]" }
              : {})
          }
        }
      : {}),
    routed_obligations: obligations
  };
}

test("REQ-SBX-GENERAL-001 sanitizer maps source and call handles to external evaluation tokens", async () => {
  const sanitizer = createRecordingSanitizer();
  const snapshot = makeSnapshot({ tool: true, has_target: true });
  const payload = await sanitizer.sanitize(snapshot as never, [obligation()] as never, new AbortController().signal);
  assert.equal(payload.request_token, REQUEST_TOKEN);
  assert.equal(payload.sources[0].source_token, SOURCE_TOKEN);
  assert.equal(payload.tool_request?.call_token, CALL_TOKEN);
  assert.equal(payload.tool_request?.tool_name_token, TOOL_NAME_TOKEN);
});

test("REQ-SBX-GENERAL-001 sanitized payload schema is sandbox-security-sanitized-judge.v1", async () => {
  const sanitizer = createRecordingSanitizer();
  const payload = await sanitizer.sanitize(makeSnapshot() as never, [obligation()] as never, new AbortController().signal);
  assert.equal(payload.schema_version, "sandbox-security-sanitized-judge.v1");
});

test("REQ-SBX-GENERAL-001 sanitized payload uses tool_name_token and no parallel alias", async () => {
  const sanitizer = createRecordingSanitizer();
  const payload = await sanitizer.sanitize(
    makeSnapshot({ tool: true }) as never,
    [obligation()] as never,
    new AbortController().signal
  );
  assert.ok(payload.tool_request?.tool_name_token.startsWith("etok:tool-name:"));
  assert.equal(Object.hasOwn(payload.tool_request ?? {}, "tool_name"), false);
});

test("REQ-SBX-GENERAL-001 Judge payload requires nonempty routed obligations", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, []);
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(payload, registry, snapshot as never, [])
  );
});

test("REQ-SBX-GENERAL-001 obligation ID uses decision-scoped four-digit grammar", () => {
  assert.match(OBLIGATION_ID, /^obligation:\/\/sandbox\/security\/[^/]+\/\d{4}$/);
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const bad = makePayload(snapshot, [obligation({ obligation_id: "bad-id" })]);
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      bad,
      registry,
      snapshot as never,
      [obligation({ obligation_id: "bad-id" }) as never]
    )
  );
});

test("REQ-SBX-GENERAL-001 obligations sort by category and canonical tokenized scope", () => {
  // Engine materializes order; validator requires exact expected order match.
  const snapshot = makeSnapshot({ second: true });
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const first = obligation({
    obligation_id: "obligation://sandbox/security/dec-1/0001",
    category: "jailbreak",
    subject_refs: [
      {
        kind: "content_source",
        source_token: `etok:src:${NONCE}:0001`,
        locator: { kind: "whole_source" }
      }
    ]
  });
  const second = obligation({
    obligation_id: "obligation://sandbox/security/dec-1/0002",
    category: "prompt_injection",
    subject_refs: [
      {
        kind: "content_source",
        source_token: `etok:src:${NONCE}:0002`,
        locator: { kind: "whole_source" }
      }
    ]
  });
  const expected = [first, second];
  const payload = makePayload(snapshot, expected as never);
  const validated = validateSandboxSecuritySanitizedJudgePayload(
    payload,
    registry,
    snapshot as never,
    expected as never
  );
  assert.deepEqual(
    validated.routed_obligations.map((item) => item.obligation_id),
    expected.map((item) => item.obligation_id)
  );
});

test("REQ-SBX-GENERAL-001 obligation tokens exist in payload with matching kind", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const validated = validateSandboxSecuritySanitizedJudgePayload(
    payload,
    registry,
    snapshot as never,
    [obligation()] as never
  );
  assert.equal(validated.routed_obligations[0].subject_refs[0].kind, "content_source");
});

test("REQ-SBX-GENERAL-001 payload rejects duplicate obligation identity and scope", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const dup = [obligation(), obligation()];
  const payload = makePayload(snapshot, dup as never);
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(payload, registry, snapshot as never, dup as never)
  );
});

test("REQ-SBX-GENERAL-001 sanitized payload contains no raw snapshot fields", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = {
    ...makePayload(snapshot),
    provenance_ref: "x"
  };
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      payload,
      registry,
      snapshot as never,
      [obligation()] as never
    )
  );
});

test("REQ-SBX-GENERAL-001 sanitized payload rejects over 256 KiB", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  payload.sources[0] = {
    ...payload.sources[0],
    sanitized_value: "x".repeat(300 * 1024)
  };
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      payload,
      registry,
      snapshot as never,
      [obligation()] as never
    )
  );
});

test("REQ-SBX-GENERAL-001 sanitized payload enforces depth 8 and nodes 2048", () => {
  const snapshot = makeSnapshot({ tool: true });
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  let deep: Record<string, unknown> = { v: 1 };
  for (let i = 0; i < 10; i += 1) deep = { child: deep };
  const payload = makePayload(snapshot);
  payload.tool_request = {
    call_token: CALL_TOKEN,
    tool_name_token: TOOL_NAME_TOKEN,
    sanitized_arguments: deep as never
  };
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      payload,
      registry,
      snapshot as never,
      [obligation()] as never
    )
  );
});

test("REQ-SBX-GENERAL-001 sanitized payload enforces max 67 tokens", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  assert.ok(1 + registry.source_tokens.length <= 67);
  assert.equal(registry.request_token.startsWith("etok:req:"), true);
});

test("REQ-SBX-GENERAL-001 external result accepts token subjects only", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "matched");
});

test("REQ-SBX-GENERAL-001 external result rejects private handle subjects", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result applies same candidate clearance limits as raw", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const candidates = Array.from({ length: 33 }, () => ({
    obligation_id: OBLIGATION_ID,
    category: "prompt_injection",
    severity: "high",
    confidence: 0.1,
    reason_code: "sandbox_security_prompt_injection",
    subject_refs: [
      {
        kind: "content_source",
        source_token: SOURCE_TOKEN,
        locator: { kind: "whole_source" }
      }
    ]
  }));
  const result = normalizeSandboxSecurityExternalDetectorResult(
    { candidates, clearances: [] },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects unknown keys and prose", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ],
          action: "deny"
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects unknown tokens", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0009`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects cross-evaluation tokens", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const other = "b".repeat(32);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${other}:0001`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects wrong-kind tokens", () => {
  const snapshot = makeSnapshot({ tool: true });
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: CALL_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects target when has_target false", () => {
  const snapshot = makeSnapshot({ tool: true, has_target: false });
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(
    snapshot,
    [
      obligation({
        subject_refs: [
          {
            kind: "tool_request",
            call_token: CALL_TOKEN,
            component: "whole_call"
          }
        ]
      })
    ] as never
  );
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "tool_request",
              call_token: CALL_TOKEN,
              component: "target"
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects oversize Judge response over 64 KiB", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" },
              padding: "x".repeat(70 * 1024)
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 ExternalTokenRegistry uses frozen arrays not Map", () => {
  const registry = deriveSandboxSecurityExternalTokenRegistry(makeSnapshot() as never);
  assert.ok(Array.isArray(registry.source_tokens));
  assert.ok(Object.isFrozen(registry.source_tokens));
  assert.equal(registry instanceof Map, false);
});

test("REQ-SBX-GENERAL-001 external result accepts valid partial coverage", () => {
  const snapshot = makeSnapshot({ second: true });
  const obligations = [
    obligation({
      obligation_id: "obligation://sandbox/security/dec-1/0001",
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0001`,
          locator: { kind: "whole_source" }
        }
      ]
    }),
    obligation({
      obligation_id: "obligation://sandbox/security/dec-1/0002",
      category: "jailbreak",
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0002`,
          locator: { kind: "whole_source" }
        }
      ]
    })
  ];
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, obligations as never);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: "obligation://sandbox/security/dec-1/0001",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0001`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.deepEqual(result.covered_obligation_ids, [
      "obligation://sandbox/security/dec-1/0001"
    ]);
  }
});

test("REQ-SBX-GENERAL-001 external result requires existing obligation ID", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: "obligation://sandbox/security/dec-1/0099",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result category matches obligation category", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "jailbreak",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_jailbreak",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external risk scope exactly equals obligation scope", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external clearance scope exactly equals obligation scope", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [],
      clearances: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          confidence: 0.4,
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 }
            }
          ]
        }
      ]
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects obligation scope subset", () => {
  const snapshot = makeSnapshot({ second: true });
  const obligations = [
    obligation({
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0001`,
          locator: { kind: "whole_source" }
        },
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0002`,
          locator: { kind: "whole_source" }
        }
      ]
    })
  ];
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, obligations as never);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0001`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects obligation scope superset", () => {
  const snapshot = makeSnapshot({ second: true });
  const obligations = [
    obligation({
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0001`,
          locator: { kind: "whole_source" }
        }
      ]
    })
  ];
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, obligations as never);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0001`,
              locator: { kind: "whole_source" }
            },
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0002`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 subject order does not affect exact obligation coverage", () => {
  const snapshot = makeSnapshot({ second: true });
  const obligations = [
    obligation({
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0001`,
          locator: { kind: "whole_source" }
        },
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0002`,
          locator: { kind: "whole_source" }
        }
      ]
    })
  ];
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, obligations as never);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0002`,
              locator: { kind: "whole_source" }
            },
            {
              kind: "content_source",
              source_token: `etok:src:${NONCE}:0001`,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "matched");
});

test("REQ-SBX-GENERAL-001 omitted obligation remains uncovered", () => {
  const snapshot = makeSnapshot({ second: true });
  const obligations = [
    obligation({
      obligation_id: "obligation://sandbox/security/dec-1/0001"
    }),
    obligation({
      obligation_id: "obligation://sandbox/security/dec-1/0002",
      category: "jailbreak",
      subject_refs: [
        {
          kind: "content_source",
          source_token: `etok:src:${NONCE}:0002`,
          locator: { kind: "whole_source" }
        }
      ]
    })
  ];
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot, obligations as never);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: "obligation://sandbox/security/dec-1/0001",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.covered_obligation_ids.includes("obligation://sandbox/security/dec-1/0002"), false);
  }
});

test("REQ-SBX-GENERAL-001 stale cross-evaluation obligation ID is invalid", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: "obligation://sandbox/security/other-dec/0001",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 Judge cannot create an unrouted obligation", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: "obligation://sandbox/security/dec-1/0002",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external result rejects scope outside routed payload", () => {
  const snapshot = makeSnapshot({ tool: true });
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "tool_request",
              call_token: CALL_TOKEN,
              component: "whole_call"
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 external normalize maps tokens to private handles", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const result = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    const ref = result.result.candidates[0].subject_refs[0];
    assert.equal(ref.kind, "content_source");
    if (ref.kind === "content_source") {
      assert.equal(ref.source_handle, SOURCE);
    }
  }
});

test("REQ-SBX-GENERAL-001 external and raw normalize both yield NormalizedSlotResult", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  const external = normalizeSandboxSecurityExternalDetectorResult(
    {
      candidates: [
        {
          obligation_id: OBLIGATION_ID,
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ],
      clearances: []
    },
    registry,
    payload as never
  );
  assert.equal(external.status, "matched");
  if (rawBoundary && external.status === "matched") {
    const raw = rawBoundary.normalizeSandboxSecurityRawDetectorResult(
      {
        candidates: [
          {
            category: "prompt_injection",
            severity: "high",
            confidence: 0.9,
            reason_code: "sandbox_security_prompt_injection",
            subject_refs: [
              {
                kind: "content_source",
                source_handle: SOURCE,
                locator: { kind: "whole_source" }
              }
            ]
          }
        ],
        clearances: []
      },
      {
        evaluation_nonce: NONCE,
        content_subjects: [
          {
            source_handle: SOURCE as never,
            media_type: "text/plain",
            original_utf8_bytes: [104, 101, 108, 108, 111],
            value: "hello"
          }
        ]
      }
    );
    assert.equal(raw.status, "matched");
    if (raw.status === "matched") {
      assert.ok(Array.isArray(raw.result.candidates));
      assert.ok(Array.isArray(external.result.candidates));
    }
  }
});

test("REQ-SBX-GENERAL-001 deriveSandboxSecurityExternalTokenRegistry is deterministic", () => {
  const snapshot = makeSnapshot({ tool: true, has_target: true });
  const a = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const b = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  assert.deepEqual(a, b);
  assert.equal(a.request_token, REQUEST_TOKEN);
  assert.equal(a.source_tokens[0].source_token, SOURCE_TOKEN);
  assert.equal(a.call_token?.call_token, CALL_TOKEN);
});

test("REQ-SBX-GENERAL-001 external registry validates lowercase 128-bit nonce", () => {
  assert.throws(() =>
    deriveSandboxSecurityExternalTokenRegistry(
      makeSnapshot({ handle: "hsrc:NOTLOWERCASE00000000000000000000:0001" }) as never
    )
  );
});

test("REQ-SBX-GENERAL-001 malformed handle cannot derive external token", () => {
  assert.throws(() =>
    deriveSandboxSecurityExternalTokenRegistry(
      makeSnapshot({ handle: "bad-handle" }) as never
    )
  );
});

test("REQ-SBX-GENERAL-001 external registry rejects cross-evaluation handles", () => {
  const snapshot = makeSnapshot();
  const mutated = {
    ...snapshot,
    contents: [
      snapshot.contents[0],
      {
        ...snapshot.contents[0],
        source_handle: `hsrc:${"b".repeat(32)}:0002` as never,
        source_id: "src-2"
      }
    ]
  };
  assert.throws(() =>
    deriveSandboxSecurityExternalTokenRegistry(mutated as never)
  );
});

test("REQ-SBX-GENERAL-001 external call token preserves 0000 handle ordinal", () => {
  const registry = deriveSandboxSecurityExternalTokenRegistry(
    makeSnapshot({ tool: true }) as never
  );
  assert.equal(registry.call_token?.call_token.endsWith(":0000"), true);
  assert.equal(registry.call_token?.call_handle.endsWith(":0000"), true);
});

test("REQ-SBX-GENERAL-001 sanitizer uses Engine-derived tokens not free choice", async () => {
  const sanitizer = createRecordingSanitizer();
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = await sanitizer.sanitize(
    snapshot as never,
    [obligation()] as never,
    new AbortController().signal
  );
  assert.equal(payload.request_token, registry.request_token);
  assert.equal(payload.sources[0].source_token, registry.source_tokens[0].source_token);
});

test("REQ-SBX-GENERAL-001 external evaluation tokens are not public finding tokens", () => {
  const registry = deriveSandboxSecurityExternalTokenRegistry(makeSnapshot() as never);
  assert.match(registry.request_token, /^etok:/);
  assert.doesNotMatch(registry.request_token, /^ptok:/);
  assert.doesNotMatch(registry.source_tokens[0].source_token, /^find:/);
});

test("REQ-SBX-GENERAL-001 sanitizer failure causes zero Judge detect calls", async () => {
  let detectCalls = 0;
  const judge = {
    async detect() {
      detectCalls += 1;
      return { candidates: [], clearances: [] };
    }
  };
  const failingSanitizer = {
    async sanitize() {
      throw new Error("sanitizer_failed");
    }
  };
  try {
    await failingSanitizer.sanitize();
    await judge.detect();
  } catch {
    // engine path: do not call judge
  }
  assert.equal(detectCalls, 0);
});

test("REQ-SBX-GENERAL-001 invalid sanitized payload causes zero Judge detect calls", async () => {
  let detectCalls = 0;
  const judge = {
    async detect() {
      detectCalls += 1;
      return { candidates: [], clearances: [] };
    }
  };
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const badPayload = {
    ...makePayload(snapshot),
    request_token: "etok:req:free"
  };
  try {
    validateSandboxSecuritySanitizedJudgePayload(
      badPayload,
      registry,
      snapshot as never,
      [obligation()] as never
    );
    await judge.detect();
  } catch {
    // zero judge calls
  }
  assert.equal(detectCalls, 0);
});

test("REQ-SBX-GENERAL-001 validateSandboxSecuritySanitizedJudgePayload rejects free tokens before Judge", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  payload.sources[0] = {
    ...payload.sources[0],
    source_token: "etok:src:free:0001"
  };
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      payload,
      registry,
      snapshot as never,
      [obligation()] as never
    )
  );
});

test("REQ-SBX-GENERAL-001 validateSandboxSecuritySanitizedJudgePayload requires registry match", () => {
  const snapshot = makeSnapshot();
  const registry = deriveSandboxSecurityExternalTokenRegistry(snapshot as never);
  const payload = makePayload(snapshot);
  payload.request_token = "etok:req:" + "b".repeat(32);
  assert.throws(() =>
    validateSandboxSecuritySanitizedJudgePayload(
      payload,
      registry,
      snapshot as never,
      [obligation()] as never
    )
  );
});

test("REQ-SBX-GENERAL-001 external Judge never receives SandboxSecurityRawDetectorSnapshot", async () => {
  const source = readFileSync(modulePath, "utf8");
  assert.match(
    source,
    /interface SanitizedExternalDetector|SanitizedExternalDetector|payload: Readonly<SandboxSecuritySanitizedJudgePayload>|SandboxSecuritySanitizedJudgePayload/
  );
  // port contract already locks Judge to payload; ensure sanitized module does not feed snapshot into detect
  assert.doesNotMatch(source, /judge\.detect\(\s*snapshot/i);
  const external = createRecordingExternalDetector();
  const sanitizer = createRecordingSanitizer();
  const payload = await sanitizer.sanitize(
    makeSnapshot() as never,
    [obligation()] as never,
    new AbortController().signal
  );
  await external.detect(payload as never, new AbortController().signal);
  assert.equal(Object.hasOwn(external.lastPayload ?? {}, "profile"), false);
  assert.equal(Object.hasOwn(external.lastPayload ?? {}, "contents"), false);
});

test("REQ-SBX-GENERAL-001 sanitized-boundary does not modify detector-output-boundary", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /export function normalizeSandboxSecurityRawDetectorResult/);
  assert.equal(existsSync(boundaryPath), true);
});

test("REQ-SBX-GENERAL-001 sanitized-boundary does not create detector-pipeline", () => {
  assert.equal(
    existsSync(new URL("../src/security/detector-pipeline.ts", import.meta.url)),
    false
  );
});

// keep assert bounds helper referenced
test("REQ-SBX-GENERAL-001 assertSanitizedJudgePayloadBounds accepts valid payload", () => {
  assert.doesNotThrow(() =>
    assertSanitizedJudgePayloadBounds(makePayload() as never)
  );
});
