import assert from "node:assert/strict";
import {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson
} from "../src/security/canonical-json.ts";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { createFrozenRawSubjectRegistry } from "./fixtures/security-detector.fixture.ts";

const boundaryPath = new URL("../src/security/detector-output-boundary.ts", import.meta.url);
const scopePath = new URL("../src/security/subject-scope.ts", import.meta.url);

const boundary = existsSync(boundaryPath)
  ? await import("../src/security/detector-output-boundary.ts")
  : {
      normalizeSandboxSecurityRawDetectorResult() {
        return { status: "invalid_result", error_code: "detector_result_invalid" };
      }
    };

const scope = existsSync(scopePath)
  ? await import("../src/security/subject-scope.ts")
  : {
      canonicalizeSandboxSecurityPrivateSubjectScopes() {
        throw new Error("missing");
      },
      computeSandboxSecuritySubjectKey() {
        return "0".repeat(64);
      }
    };

const {
  normalizeSandboxSecurityRawDetectorResult
} = boundary as typeof import("../src/security/detector-output-boundary.ts");
const {
  canonicalizeSandboxSecurityPrivateSubjectScopes,
  computeSandboxSecuritySubjectKey
} = scope as typeof import("../src/security/subject-scope.ts");

const NONCE = "a".repeat(32);
const SOURCE = `hsrc:${NONCE}:0001`;
const CALL = `hcall:${NONCE}:0000`;
const OTHER_NONCE = "b".repeat(32);

function registry(options?: { has_target?: boolean; media_type?: "text/plain" | "application/json"; value?: unknown; bytes?: number[] }) {
  const media_type = options?.media_type ?? "text/plain";
  const value = options?.value ?? "hello";
  const original_utf8_bytes = Object.freeze(
    options?.bytes ?? Array.from(Buffer.from(String(value), "utf8"))
  );
  const content = Object.freeze({
    source_handle: SOURCE as never,
    media_type,
    original_utf8_bytes,
    value: value as never
  });
  const tool = Object.freeze({
    call_handle: CALL as never,
    has_target: options?.has_target ?? true,
    arguments: Object.freeze({ path: "/tmp/x" })
  });
  return Object.freeze({
    evaluation_nonce: NONCE,
    content_subjects: Object.freeze([content]),
    tool_subject: tool
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
  if (result.status === "matched") {
    assert.equal(result.result.candidates.length, 1);
    assert.equal(result.result.clearances.length, 0);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.result.candidates), true);
  }
});

test("REQ-SBX-GENERAL-001 raw empty candidates and clearances maps to no_match", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [], clearances: [] },
    registry()
  );
  assert.equal(result.status, "no_match");
});

test("REQ-SBX-GENERAL-001 raw rejects more than 32 candidates", () => {
  const candidates = Array.from({ length: 33 }, (_, index) =>
    candidate({
      subject_refs: [
        {
          kind: "content_source",
          source_handle: SOURCE,
          locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 + (index % 4) }
        }
      ]
    })
  );
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates, clearances: [] },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects more than 32 clearances", () => {
  const clearances = Array.from({ length: 33 }, (_, index) => ({
    category: "prompt_injection",
    confidence: 0.1,
    subject_refs: [
      {
        kind: "content_source",
        source_handle: SOURCE,
        locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 + (index % 4) }
      }
    ]
  }));
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [], clearances },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects more than 8 subject refs per item", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: Array.from({ length: 9 }, () => ({
            kind: "content_source",
            source_handle: SOURCE,
            locator: { kind: "whole_source" }
          }))
        })
      ],
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

test("REQ-SBX-GENERAL-001 raw rejects duplicate subject refs inside one item", () => {
  const ref = {
    kind: "content_source",
    source_handle: SOURCE,
    locator: { kind: "whole_source" }
  };
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [candidate({ subject_refs: [ref, ref] })], clearances: [] },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects canonical result larger than 64 KiB", () => {
  const huge = "x".repeat(70 * 1024);
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "whole_source" },
              padding: huge
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

test("REQ-SBX-GENERAL-001 raw rejects same-scope candidate and clearance", () => {
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

test("REQ-SBX-GENERAL-001 raw rejects wrong-kind handles", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: CALL,
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

test("REQ-SBX-GENERAL-001 raw rejects cross-evaluation handles", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: `hsrc:${OTHER_NONCE}:0001`,
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

test("REQ-SBX-GENERAL-001 raw rejects malformed 128-bit nonce handles", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: "hsrc:not-a-nonce:0001",
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

test("REQ-SBX-GENERAL-001 raw rejects source handle outside four-digit 0001 to 0064", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: `hsrc:${NONCE}:0000`,
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

test("REQ-SBX-GENERAL-001 raw rejects call handle without 0000 ordinal", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "tool_request",
              call_handle: `hcall:${NONCE}:0001`,
              component: "whole_call"
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

test("REQ-SBX-GENERAL-001 raw rejects invalid UTF-8 byte range locator", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "text_byte_range", start_byte: 0, end_byte: 99 }
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

test("REQ-SBX-GENERAL-001 raw rejects invalid JSON pointer locator", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "json_pointer", pointer: "/missing" }
            }
          ]
        })
      ],
      clearances: []
    },
    registry({ media_type: "application/json", value: { ok: true } })
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects duplicate scope inside one item", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "whole_source" }
            },
            {
              kind: "content_source",
              source_handle: SOURCE,
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

test("REQ-SBX-GENERAL-001 raw rejects reason_code outside SandboxSecurityReasonCode", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [candidate({ reason_code: "not_a_reason" })],
      clearances: []
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw rejects duplicate clearance uniqueness key in one slot", () => {
  const ref = {
    kind: "content_source",
    source_handle: SOURCE,
    locator: { kind: "whole_source" }
  };
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [],
      clearances: [
        {
          category: "prompt_injection",
          confidence: 0.9,
          subject_refs: [ref]
        },
        {
          category: "prompt_injection",
          confidence: 0.1,
          subject_refs: [ref]
        }
      ]
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});

test("REQ-SBX-GENERAL-001 raw allows distinct multi-ref clearance sets that share a scope", () => {
  const multiRegistry = {
    evaluation_nonce: NONCE,
    content_subjects: Object.freeze([
      Object.freeze({
        source_handle: SOURCE,
        media_type: "text/plain" as const,
        original_utf8_bytes: Object.freeze([104, 101, 108, 108, 111]),
        value: "hello"
      }),
      Object.freeze({
        source_handle: `hsrc:${NONCE}:0002`,
        media_type: "text/plain" as const,
        original_utf8_bytes: Object.freeze([119, 111, 114, 108, 100]),
        value: "world"
      })
    ])
  };
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [],
      clearances: [
        {
          category: "prompt_injection",
          confidence: 0.9,
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "whole_source" }
            },
            {
              kind: "content_source",
              source_handle: `hsrc:${NONCE}:0002`,
              locator: { kind: "whole_source" }
            }
          ]
        },
        {
          category: "prompt_injection",
          confidence: 0.8,
          subject_refs: [
            {
              kind: "content_source",
              source_handle: SOURCE,
              locator: { kind: "whole_source" }
            }
          ]
        }
      ]
    },
    multiRegistry as never
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.result.clearances.length, 2);
  }
});


test("REQ-SBX-GENERAL-001 raw rejects non-finite confidence as invalid_result not throw", () => {
  for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.doesNotThrow(() => {
      const result = normalizeSandboxSecurityRawDetectorResult(
        {
          candidates: [candidate({ confidence })],
          clearances: []
        },
        registry()
      );
      assert.equal(result.status, "invalid_result");
    });
  }
});

test("REQ-SBX-GENERAL-001 raw candidate uniqueness key includes reason_code", () => {
  const ref = {
    kind: "content_source",
    source_handle: SOURCE,
    locator: { kind: "whole_source" }
  };
  // paired reason_code is determined by category; duplicate category+reason+scope rejects
  const duplicate = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          category: "prompt_injection",
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [ref]
        }),
        candidate({
          category: "prompt_injection",
          reason_code: "sandbox_security_prompt_injection",
          severity: "medium",
          confidence: 0.8,
          subject_refs: [ref]
        })
      ],
      clearances: []
    },
    registry()
  );
  assert.equal(duplicate.status, "invalid_result");

  // different categories (hence different reason_codes) on same scope remain distinct keys
  const distinct = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          category: "prompt_injection",
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [ref]
        }),
        candidate({
          category: "jailbreak",
          reason_code: "sandbox_security_jailbreak",
          severity: "medium",
          confidence: 0.8,
          subject_refs: [ref]
        })
      ],
      clearances: []
    },
    registry()
  );
  assert.equal(distinct.status, "matched");
  if (distinct.status === "matched") {
    assert.equal(distinct.result.candidates.length, 2);
  }
});

test("REQ-SBX-GENERAL-001 raw rejects mismatched reason_code category pairing", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    {
      candidates: [
        candidate({
          category: "prompt_injection",
          reason_code: "sandbox_security_jailbreak"
        })
      ],
      clearances: []
    },
    registry()
  );
  assert.equal(result.status, "invalid_result");
});


test("REQ-SBX-GENERAL-001 raw result boundary does not call Judge or sanitizer", () => {
  const source = readFileSync(new URL("../src/security/detector-output-boundary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SanitizedExternalDetector|SandboxSecuritySanitizer|sanitize\(|Judge/);
});

test("REQ-SBX-GENERAL-001 RawSubjectRegistry uses frozen arrays not Map", () => {
  const reg = registry();
  assert.ok(Array.isArray(reg.content_subjects));
  assert.ok(Object.isFrozen(reg.content_subjects));
  assert.equal(reg instanceof Map, false);
  const fromFixture = createFrozenRawSubjectRegistry();
  assert.ok(Array.isArray(fromFixture.content_subjects));
  assert.ok(Object.isFrozen(fromFixture.content_subjects));
});

test("REQ-SBX-GENERAL-001 raw registry original_utf8_bytes are frozen number arrays", () => {
  const reg = registry();
  assert.ok(Object.isFrozen(reg.content_subjects[0].original_utf8_bytes));
  assert.equal(typeof reg.content_subjects[0].original_utf8_bytes[0], "number");
});

test("REQ-SBX-GENERAL-001 raw normalize yields NormalizedSlotResult private handles", () => {
  const result = normalizeSandboxSecurityRawDetectorResult(
    { candidates: [candidate()], clearances: [] },
    registry()
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    const ref = result.result.candidates[0].subject_refs[0];
    assert.equal(ref.kind, "content_source");
    if (ref.kind === "content_source") {
      assert.match(ref.source_handle, /^hsrc:/);
    }
  }
});

test("REQ-SBX-GENERAL-001 normalizeSandboxSecurityRawDetectorResult is engine-internal only", () => {
  assert.equal(existsSync(new URL("../src/security/index.ts", import.meta.url)), false);
});

test("REQ-SBX-GENERAL-001 canonical private scope preserves exact locator/component", () => {
  const scopes = canonicalizeSandboxSecurityPrivateSubjectScopes([
    {
      kind: "content_source",
      source_handle: SOURCE as never,
      locator: { kind: "text_byte_range", start_byte: 0, end_byte: 2 }
    },
    {
      kind: "tool_request",
      call_handle: CALL as never,
      component: "tool_name"
    }
  ]);
  assert.equal(scopes.length, 2);
  const content = scopes.find((s) => s.kind === "content_source");
  assert.ok(content && content.kind === "content_source");
  if (content && content.kind === "content_source") {
    assert.deepEqual(content.locator, {
      kind: "text_byte_range",
      start_byte: 0,
      end_byte: 2
    });
  }
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
  ] as const;
  const refsB = [refsA[1], refsA[0]];
  assert.equal(
    computeSandboxSecuritySubjectKey({
      category: "tool_hijacking",
      subject_refs: [...refsA]
    }),
    computeSandboxSecuritySubjectKey({
      category: "tool_hijacking",
      subject_refs: [...refsB]
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

test("REQ-SBX-GENERAL-001 subject_key hashes Spec subjects field not scopes", () => {
  const refs = [
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "whole_source" as const }
    }
  ];
  const subjects = canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  const expected = sha256CanonicalJson({
    category: "prompt_injection",
    subjects
  });
  const wrongField = sha256CanonicalJson({
    category: "prompt_injection",
    scopes: subjects
  });
  const actual = computeSandboxSecuritySubjectKey({
    category: "prompt_injection",
    subject_refs: refs
  });
  assert.equal(actual, expected);
  assert.notEqual(actual, wrongField);
});

test("REQ-SBX-GENERAL-001 subject_key JCS payload uses subjects key name", () => {
  const refs = [
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "whole_source" as const }
    }
  ];
  const subjects = canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  const payload = canonicalizeSandboxSecurityJson({
    category: "tool_hijacking",
    subjects
  });
  assert.match(payload, /"subjects"/);
  assert.doesNotMatch(payload, /"scopes"/);
  assert.equal(
    computeSandboxSecuritySubjectKey({
      category: "tool_hijacking",
      subject_refs: refs
    }),
    sha256CanonicalJson({
      category: "tool_hijacking",
      subjects
    })
  );
});

test("REQ-SBX-GENERAL-001 private subject scopes sort by UTF-16 code units not localeCompare", () => {
  // Spec subject identity is JCS over sorted private scopes. Sorting must be
  // locale-independent so the same refs yield one subject_key across runtimes.
  const refs = [
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "json_pointer" as const, pointer: "/path" }
    },
    {
      kind: "content_source" as const,
      source_handle: SOURCE as never,
      locator: { kind: "json_pointer" as const, pointer: "/Path" }
    }
  ];
  const scopes = canonicalizeSandboxSecurityPrivateSubjectScopes(refs);
  const identities = scopes.map((scope) => canonicalizeSandboxSecurityJson(scope));
  const codeUnitOrder = [...identities].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  const localeOrder = [...identities].sort((left, right) =>
    left.localeCompare(right)
  );
  assert.notDeepEqual(
    codeUnitOrder,
    localeOrder,
    "fixture must distinguish localeCompare from code-unit order"
  );
  assert.deepEqual(identities, codeUnitOrder);
  assert.equal(
    computeSandboxSecuritySubjectKey({
      category: "prompt_injection",
      subject_refs: refs
    }),
    sha256CanonicalJson({
      category: "prompt_injection",
      subjects: scopes
    })
  );
  // Reverse input order must still canonicalize to code-unit order.
  const reversed = canonicalizeSandboxSecurityPrivateSubjectScopes([
    refs[1],
    refs[0]
  ]);
  assert.deepEqual(
    reversed.map((scope) => canonicalizeSandboxSecurityJson(scope)),
    codeUnitOrder
  );
});

test("REQ-SBX-GENERAL-001 subject scope helpers are engine-internal and never exported", () => {
  assert.equal(existsSync(new URL("../src/security/index.ts", import.meta.url)), false);
  const sharedIndex = readFileSync(new URL("../../../shared/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sharedIndex, /canonicalizeSandboxSecurityPrivateSubjectScopes/);
  assert.doesNotMatch(sharedIndex, /normalizeSandboxSecurityRawDetectorResult/);
});
