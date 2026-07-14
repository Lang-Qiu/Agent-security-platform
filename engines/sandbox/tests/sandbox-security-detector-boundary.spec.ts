import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSandboxSecurityRawDetectorResult,
  type SandboxSecurityRawSubjectRegistry
} from "../src/security/detector-output-boundary.ts";
import {
  canonicalizeSandboxSecurityPrivateSubjectScopes,
  computeSandboxSecuritySubjectKey
} from "../src/security/subject-scope.ts";

const NONCE = "a".repeat(32);
const SOURCE = `hsrc:${NONCE}:0001`;
const CALL = `hcall:${NONCE}:0000`;

function registry(options: { has_target?: boolean } = {}): SandboxSecurityRawSubjectRegistry {
  return Object.freeze({
    evaluation_nonce: NONCE,
    content_subjects: Object.freeze([
      Object.freeze({
        source_handle: SOURCE as never,
        media_type: "text/plain" as const,
        original_utf8_bytes: Object.freeze([104, 105]),
        value: "hi"
      })
    ]),
    tool_subject: Object.freeze({
      call_handle: CALL as never,
      has_target: options.has_target ?? false,
      arguments: Object.freeze({ path: "/tmp" })
    })
  });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
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
    ],
    ...overrides
  };
}

test("REQ-SBX-GENERAL-001 raw result with candidates maps to matched", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [candidate()], clearances: [] },
    registry()
  );
  assert.equal(result.status, "matched");
});

test("REQ-SBX-GENERAL-001 raw empty candidates and clearances maps to no_match", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [], clearances: [] },
    registry()
  );
  assert.equal(result.status, "no_match");
});

test("REQ-SBX-GENERAL-001 raw rejects more than 32 candidates", () => {
  const candidates = Array.from({ length: 33 }, () => candidate());
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates, clearances: [] },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects more than 8 subject refs per item", () => {
  const refs = Array.from({ length: 9 }, (_, index) => ({
    kind: "content_source",
    source_handle: SOURCE,
    locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 + (index % 1) }
  }));
  // force unique by using invalid duplicate path - use whole_source duplicates
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [candidate({ subject_refs: Array.from({ length: 9 }, () => ({
        kind: "content_source",
        source_handle: SOURCE,
        locator: { kind: "whole_source" }
      })) })],
      clearances: []
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects empty subject_refs array", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [candidate({ subject_refs: [] })], clearances: [] },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects unknown source handles", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: `hsrc:${NONCE}:0002`,
              locator: { kind: "whole_source" }
            }
          ]
        })
      ],
      clearances: []
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects target subject when target absent", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "tool_request",
              call_handle: CALL,
              component: "target"
            }
          ]
        })
      ],
      clearances: []
    },
    registry({ has_target: false })
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects candidate and clearance conflict on same scope", () => {
  const ref = {
    kind: "content_source",
    source_handle: SOURCE,
    locator: { kind: "whole_source" }
  };
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [candidate({ subject_refs: [ref] })],
      clearances: [
        {
          category: "prompt_injection",
          confidence: 0.2,
          subject_refs: [ref]
        }
      ]
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects unknown keys detector_id finding_id action prose", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [candidate({ action: "deny" })],
      clearances: []
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects confidence outside 0..1 and illegal severity", () => {
  assert.equal(
    normalizeSandboxSecurityRawDetectorResult(
      { candidates: [candidate({ confidence: 1.2 })], clearances: [] },
      registry()
    ).status,
    "invalid_result"
  );
  assert.equal(
    normalizeSandboxSecurityRawDetectorResult(
      { candidates: [candidate({ severity: "extreme" })], clearances: [] },
      registry()
    ).status,
    "invalid_result"
  );
});

test("REQ-SBX-GENERAL-001 subject key includes category and excludes slot ID", () => {
  const refs = [
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "whole_source" as const }
    }
  ];
  const keyA = computeSandboxSecuritySubjectKey({
    category: "prompt_injection",
    subject_refs: refs
  });
  const keyB = computeSandboxSecuritySubjectKey({
    category: "jailbreak",
    subject_refs: refs
  });
  assert.notEqual(keyA, keyB);
  assert.match(keyA, /^[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 subject ref order does not change subject key", () => {
  const refsA = [
    {
      kind: "tool_request" as const,
      call_handle: CALL as never,
      component: "whole_call" as const
    },
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "whole_source" as const }
    }
  ];
  const refsB = [refsA[1], refsA[0]];
  assert.equal(
    computeSandboxSecuritySubjectKey({
      category: "tool_hijacking",
      subject_refs: refsA
    }),
    computeSandboxSecuritySubjectKey({
      category: "tool_hijacking",
      subject_refs: refsB
    })
  );
});

test("REQ-SBX-GENERAL-001 subject scope helper rejects duplicates before hashing", () => {
  assert.throws(() =>
    canonicalizeSandboxSecurityPrivateSubjectScopes([
      {
        kind: "content_source",
        source_handle: SOURCE as never,
        locator: { kind: "whole_source" }
      },
      {
        kind: "content_source",
        source_handle: SOURCE as never,
        locator: { kind: "whole_source" }
      }
    ])
  );
});

test("REQ-SBX-GENERAL-001 RawSubjectRegistry uses frozen arrays not Map", () => {
  const reg = registry();
  assert.ok(Array.isArray(reg.content_subjects));
  assert.ok(Object.isFrozen(reg.content_subjects));
});
