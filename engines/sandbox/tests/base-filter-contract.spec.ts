import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function resolveSourcePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

// ============================================================================
// Step 1: Module existence (GREEN after file creation)
// ============================================================================

test("contract.ts should exist", () => {
  assert.ok(
    existsSync(resolveSourcePath("../src/base-filter/contract.ts")),
    "contract.ts must exist before tests can import it"
  );
});

test("context-envelope.ts should exist", () => {
  assert.ok(
    existsSync(resolveSourcePath("../src/base-filter/context-envelope.ts")),
    "context-envelope.ts must exist before tests can import it"
  );
});

test("index.ts should exist", () => {
  assert.ok(
    existsSync(resolveSourcePath("../src/base-filter/index.ts")),
    "index.ts must exist before tests can import it"
  );
});

// ============================================================================
// Step 2: Contract and error taxonomy (GREEN after implementation)
// ============================================================================

import {
  TRACK1_FILTER_CONTEXT_SCHEMA_VERSION,
  TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION,
  TRACK1_BASE_FILTER_POLICY_ID,
  Track1BaseFilterError
} from "../src/base-filter/contract.ts";

test("TRACK1_FILTER_CONTEXT_SCHEMA_VERSION is the fixed literal", () => {
  assert.equal(TRACK1_FILTER_CONTEXT_SCHEMA_VERSION, "track1-filter-context.v1");
});

test("TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION is the fixed literal", () => {
  assert.equal(
    TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION,
    "track1-base-filter-evaluation.v1"
  );
});

test("TRACK1_BASE_FILTER_POLICY_ID is the fixed literal", () => {
  assert.equal(TRACK1_BASE_FILTER_POLICY_ID, "policy://track1/base-filter/v1");
});

// -- error taxonomy ---------------------------------------------------------

import type { Track1BaseFilterErrorCode } from "../src/base-filter/contract.ts";

const ALL_BASE_FILTER_ERROR_CODES: readonly Track1BaseFilterErrorCode[] = [
  "base_filter_context_invalid",
  "base_filter_rule_invalid",
  "base_filter_catalog_invalid",
  "base_filter_evaluation_invalid",
  "base_filter_result_invalid"
];

for (const code of ALL_BASE_FILTER_ERROR_CODES) {
  test(`Track1BaseFilterError code="${code}" has correct name, message, and code`, () => {
    const error = new Track1BaseFilterError(code);
    assert.equal(error.name, "Track1BaseFilterError");
    assert.equal(error.code, code);
    // Message must be the fixed static value
    const staticMessages: Record<Track1BaseFilterErrorCode, string> = {
      base_filter_context_invalid: "Base-filter context is invalid",
      base_filter_rule_invalid: "Base-filter rule is invalid",
      base_filter_catalog_invalid: "Base-filter catalog is invalid",
      base_filter_evaluation_invalid: "Base-filter evaluation is invalid",
      base_filter_result_invalid: "Base-filter result is invalid"
    };
    assert.equal(error.message, staticMessages[code]);
  });
}

test("Track1BaseFilterError message contains no sentinel interpolation", () => {
  const error = new Track1BaseFilterError("base_filter_context_invalid");
  // The message must be static — no caller values interpolated
  assert.ok(!error.message.includes("sentinel"));
  assert.ok(!error.message.includes("T1-SC"));
  assert.ok(!error.message.includes("track1_test_secret"));
  assert.ok(!error.message.includes("synthetic marker"));
});

// ============================================================================
// Step 3: Context-input and rule normalizer RED tests
// ============================================================================

// These tests import normalize* functions that do NOT exist yet (RED phase).
// We wrap imports in describe blocks with try/catch to produce clean
// assertion failures, not ERR_MODULE_NOT_FOUND.

let normalizeTrack1FilterContextInput: ((value: unknown) => any) | undefined;
let normalizeTrack1FilterRule: ((value: unknown) => any) | undefined;
let normalizeTrack1FilterCatalog: ((value: unknown) => any) | undefined;

try {
  const mod = await import("../src/base-filter/context-envelope.ts");
  normalizeTrack1FilterContextInput = mod.normalizeTrack1FilterContextInput;
  normalizeTrack1FilterRule = mod.normalizeTrack1FilterRule;
  normalizeTrack1FilterCatalog = mod.normalizeTrack1FilterCatalog;
} catch {
  // Expected RED: exports not yet implemented
}

test("normalizeTrack1FilterContextInput export must exist", () => {
  assert.ok(
    typeof normalizeTrack1FilterContextInput === "function",
    "normalizeTrack1FilterContextInput must be a function"
  );
});

test("normalizeTrack1FilterRule export must exist", () => {
  assert.ok(
    typeof normalizeTrack1FilterRule === "function",
    "normalizeTrack1FilterRule must be a function"
  );
});

test("normalizeTrack1FilterCatalog export must exist", () => {
  assert.ok(
    typeof normalizeTrack1FilterCatalog === "function",
    "normalizeTrack1FilterCatalog must be a function"
  );
});

// -- context input normalizer tests (RED until implementation) --------------

function contextInputTests(): void {
  if (typeof normalizeTrack1FilterContextInput !== "function") return;

  test("normalizeTrack1FilterContextInput rejects non-plain objects", () => {
    assert.equal(normalizeTrack1FilterContextInput(null), null);
    assert.equal(normalizeTrack1FilterContextInput(undefined), null);
    assert.equal(normalizeTrack1FilterContextInput("string"), null);
    assert.equal(normalizeTrack1FilterContextInput(42), null);
    assert.equal(normalizeTrack1FilterContextInput([]), null);
  });

  test("normalizeTrack1FilterContextInput rejects missing keys", () => {
    assert.equal(normalizeTrack1FilterContextInput({}), null);
    assert.equal(
      normalizeTrack1FilterContextInput({ user_prompt: "hello" }),
      null
    );
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: []
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput rejects extra keys", () => {
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: [],
        memory_entries: [],
        extra: "nope"
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput requires non-empty user_prompt", () => {
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "",
        retrieved_content: [],
        memory_entries: []
      }),
      null
    );
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "   ",
        retrieved_content: [],
        memory_entries: []
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput accepts empty retrieved_content and memory_entries", () => {
    const result = normalizeTrack1FilterContextInput({
      user_prompt: "hello",
      retrieved_content: [],
      memory_entries: []
    });
    assert.ok(result !== null);
    assert.deepStrictEqual(result.retrieved_content, []);
    assert.deepStrictEqual(result.memory_entries, []);
  });

  test("normalizeTrack1FilterContextInput rejects non-array retrieved_content", () => {
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: "not-an-array",
        memory_entries: []
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput rejects non-array memory_entries", () => {
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: [],
        memory_entries: "not-an-array"
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput rejects blank memory_id or content", () => {
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: [],
        memory_entries: [{ memory_id: "", content: "ok" }]
      }),
      null
    );
    assert.equal(
      normalizeTrack1FilterContextInput({
        user_prompt: "hello",
        retrieved_content: [],
        memory_entries: [{ memory_id: "ok", content: "   " }]
      }),
      null
    );
  });

  test("normalizeTrack1FilterContextInput returns defensive copy", () => {
    const orig = {
      user_prompt: "hello",
      retrieved_content: ["r1"],
      memory_entries: [{ memory_id: "m1", content: "c1" }]
    };
    const result = normalizeTrack1FilterContextInput(orig);
    assert.ok(result !== null);
    // Mutating original must not affect result
    (orig as any).user_prompt = "mutated";
    orig.retrieved_content.push("r2");
    orig.memory_entries[0].content = "mutated";
    assert.equal(result!.user_prompt, "hello");
    assert.deepStrictEqual(result!.retrieved_content, ["r1"]);
    assert.deepStrictEqual(result!.memory_entries, [{ memory_id: "m1", content: "c1" }]);
  });

  test("normalizeTrack1FilterContextInput result shares no mutable references with input", () => {
    const memEntry = { memory_id: "m1", content: "c1" };
    const input = {
      user_prompt: "hello",
      retrieved_content: ["r1"],
      memory_entries: [memEntry]
    };
    const result = normalizeTrack1FilterContextInput(input);
    assert.ok(result !== null);
    // Mutating result should not affect original
    result!.user_prompt = "mutated";
    result!.retrieved_content.push("extra");
    result!.memory_entries[0].content = "mutated";
    assert.equal(input.user_prompt, "hello");
    assert.equal(input.retrieved_content.length, 1);
    assert.equal(memEntry.content, "c1");
  });
}

// -- rule normalizer tests (RED until implementation) -----------------------

function ruleNormalizerTests(): void {
  if (typeof normalizeTrack1FilterRule !== "function") return;

  const validRule = {
    rule_id: "test-rule",
    stages: ["tool_request"] as const,
    category: "jailbreak" as const,
    action: "deny" as const,
    reason_code: "test_reason",
    reason: "Test reason",
    conditions: [
      {
        source: "user_prompt" as const,
        operator: "contains_any" as const,
        values: ["test"]
      }
    ]
  };

  test("normalizeTrack1FilterRule returns valid rule", () => {
    const result = normalizeTrack1FilterRule(validRule);
    assert.ok(result !== null);
    assert.equal(result.rule_id, "test-rule");
  });

  test("normalizeTrack1FilterRule rejects non-plain objects", () => {
    assert.equal(normalizeTrack1FilterRule(null), null);
    assert.equal(normalizeTrack1FilterRule([]), null);
    assert.equal(normalizeTrack1FilterRule("string"), null);
  });

  test("normalizeTrack1FilterRule rejects extra keys", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, extra: "nope" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects missing keys", () => {
    const { reason, ...withoutReason } = validRule;
    assert.equal(normalizeTrack1FilterRule(withoutReason), null);
  });

  test("normalizeTrack1FilterRule requires non-empty rule_id", () => {
    assert.equal(normalizeTrack1FilterRule({ ...validRule, rule_id: "" }), null);
    assert.equal(normalizeTrack1FilterRule({ ...validRule, rule_id: "  " }), null);
  });

  test("normalizeTrack1FilterRule requires non-empty reason_code and reason", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, reason_code: "" }),
      null
    );
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, reason: "  " }),
      null
    );
  });

  test("normalizeTrack1FilterRule requires at least one stage", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, stages: [] }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects invalid stage values", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, stages: ["invalid"] }),
      null
    );
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        stages: ["model_output", "invalid"]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects duplicate stages", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        stages: ["model_output", "model_output"]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects unsupported category", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, category: "unsupported" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects allow action", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, action: "allow" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects invalid source", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          { source: "invalid", operator: "contains_any", values: ["x"] }
        ]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects invalid operator", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          { source: "user_prompt", operator: "regex", values: ["x"] }
        ]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule requires at least one condition", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, conditions: [] }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects empty condition values", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          { source: "user_prompt", operator: "contains_any", values: [] }
        ]
      }),
      null
    );
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          { source: "user_prompt", operator: "contains_any", values: ["ok", "  "] }
        ]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects duplicate condition values", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          { source: "user_prompt", operator: "contains_any", values: ["dup", "dup"] }
        ]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects case IDs in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "T1-SC-001-C001" }),
      null
    );
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "rule-T1-SC-001" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects scenario IDs in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "T1-SC-003" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects path separators in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "rule/name" }),
      null
    );
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "rule\\name" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects fixture path fragments in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "samples_track1_rule" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects expected_outcome in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "expected_outcome_rule" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects policy_action in rule_id", () => {
    assert.equal(
      normalizeTrack1FilterRule({ ...validRule, rule_id: "policy_action_rule" }),
      null
    );
  });

  test("normalizeTrack1FilterRule rejects executable/predicate values in conditions", () => {
    assert.equal(
      normalizeTrack1FilterRule({
        ...validRule,
        conditions: [
          {
            source: "user_prompt",
            operator: "contains_any",
            values: [(function () { /* noop */ }) as any]
          }
        ]
      }),
      null
    );
  });

  test("normalizeTrack1FilterRule returns defensive copy", () => {
    const rule = { ...validRule };
    const result = normalizeTrack1FilterRule(rule);
    assert.ok(result !== null);
    rule.rule_id = "mutated";
    (rule.conditions[0] as any).values.push("extra");
    assert.equal(result!.rule_id, "test-rule");
    assert.equal(result!.conditions[0].values.length, 1);
  });
}

// -- catalog normalizer tests (RED until implementation) --------------------

function catalogNormalizerTests(): void {
  if (typeof normalizeTrack1FilterCatalog !== "function") return;

  const validRule = {
    rule_id: "rule-a",
    stages: ["tool_request"] as const,
    category: "jailbreak" as const,
    action: "deny" as const,
    reason_code: "test_reason",
    reason: "Test reason",
    conditions: [
      {
        source: "user_prompt" as const,
        operator: "contains_any" as const,
        values: ["test"]
      }
    ]
  };

  test("normalizeTrack1FilterCatalog rejects non-array", () => {
    assert.throws(
      () => normalizeTrack1FilterCatalog(null),
      Track1BaseFilterError
    );
    assert.throws(
      () => normalizeTrack1FilterCatalog({}),
      Track1BaseFilterError
    );
  });

  test("normalizeTrack1FilterCatalog rejects empty array", () => {
    assert.throws(
      () => normalizeTrack1FilterCatalog([]),
      Track1BaseFilterError
    );
  });

  test("normalizeTrack1FilterCatalog rejects invalid member", () => {
    assert.throws(
      () => normalizeTrack1FilterCatalog([{ invalid: true }]),
      Track1BaseFilterError
    );
  });

  test("normalizeTrack1FilterCatalog rejects duplicate rule IDs", () => {
    assert.throws(
      () => normalizeTrack1FilterCatalog([validRule, { ...validRule }]),
      Track1BaseFilterError
    );
  });

  test("normalizeTrack1FilterCatalog returns frozen array", () => {
    const catalog = normalizeTrack1FilterCatalog([validRule]);
    assert.ok(Object.isFrozen(catalog));
    assert.throws(() => { (catalog as any).push("x"); });
  });

  test("normalizeTrack1FilterCatalog member rules are frozen", () => {
    const catalog = normalizeTrack1FilterCatalog([validRule]);
    assert.ok(Object.isFrozen(catalog[0]));
  });

  test("normalizeTrack1FilterCatalog condition arrays are frozen", () => {
    const catalog = normalizeTrack1FilterCatalog([validRule]);
    assert.ok(Object.isFrozen(catalog[0].conditions));
    assert.ok(Object.isFrozen(catalog[0].conditions[0].values));
  });

  test("normalizeTrack1FilterCatalog caller mutation has no effect", () => {
    const mutableRule = { ...validRule, rule_id: "rule-b", conditions: [{ ...validRule.conditions[0], values: ["x"] }] };
    const catalog = normalizeTrack1FilterCatalog([mutableRule]);
    mutableRule.rule_id = "mutated";
    (mutableRule.conditions[0] as any).values.push("extra");
    assert.equal(catalog[0].rule_id, "rule-b");
    assert.equal(catalog[0].conditions[0].values.length, 1);
  });
}

// ============================================================================
// Step 5 & 6: Context serialization and parsing
// ============================================================================

import {
  serializeTrack1FilterContext,
  parseTrack1FilterContext,
  composeTrack1FilterModelRequest
} from "../src/base-filter/context-envelope.ts";

test("serializeTrack1FilterContext produces valid envelope", () => {
  const serialized = serializeTrack1FilterContext({
    user_prompt: "User sentinel",
    retrieved_content: ["Retrieved sentinel"],
    memory_entries: [{ memory_id: "memory-1", content: "Memory sentinel" }]
  });
  assert.ok(typeof serialized === "string");
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.schema_version, "track1-filter-context.v1");
  assert.equal(parsed.user_prompt, "User sentinel");
  assert.deepStrictEqual(parsed.retrieved_content, ["Retrieved sentinel"]);
  assert.deepStrictEqual(parsed.memory_entries, [
    { memory_id: "memory-1", content: "Memory sentinel" }
  ]);
});

test("parseTrack1FilterContext correctly parses serialized envelope", () => {
  const serialized = serializeTrack1FilterContext({
    user_prompt: "User sentinel",
    retrieved_content: ["Retrieved sentinel"],
    memory_entries: [{ memory_id: "memory-1", content: "Memory sentinel" }]
  });
  const envelope = parseTrack1FilterContext(serialized);
  assert.equal(envelope.schema_version, "track1-filter-context.v1");
  assert.equal(envelope.user_prompt, "User sentinel");
  assert.deepStrictEqual(envelope.retrieved_content, ["Retrieved sentinel"]);
  assert.deepStrictEqual(envelope.memory_entries, [
    { memory_id: "memory-1", content: "Memory sentinel" }
  ]);
});

test("serializeTrack1FilterContext rejects invalid input", () => {
  assert.throws(
    () => serializeTrack1FilterContext({} as any),
    Track1BaseFilterError
  );
});

test("parseTrack1FilterContext rejects malformed JSON", () => {
  assert.throws(
    () => parseTrack1FilterContext("not json"),
    Track1BaseFilterError
  );
});

test("parseTrack1FilterContext rejects invalid schema", () => {
  assert.throws(
    () => parseTrack1FilterContext('{"schema_version":"wrong"}'),
    Track1BaseFilterError
  );
});

test("parseTrack1FilterContext rejects missing user_prompt", () => {
  const invalid = JSON.stringify({
    schema_version: "track1-filter-context.v1",
    retrieved_content: [],
    memory_entries: []
  });
  assert.throws(
    () => parseTrack1FilterContext(invalid),
    Track1BaseFilterError
  );
});

test("parseTrack1FilterContext rejects duplicate memory IDs", () => {
  const invalid = JSON.stringify({
    schema_version: "track1-filter-context.v1",
    user_prompt: "hello",
    retrieved_content: [],
    memory_entries: [
      { memory_id: "dup", content: "a" },
      { memory_id: "dup", content: "b" }
    ]
  });
  assert.throws(
    () => parseTrack1FilterContext(invalid),
    Track1BaseFilterError
  );
});

test("composeTrack1FilterModelRequest creates valid model request", () => {
  const input = {
    user_prompt: "User sentinel",
    retrieved_content: ["Retrieved sentinel"],
    memory_entries: [{ memory_id: "memory-1", content: "Memory sentinel" }]
  };
  const request = composeTrack1FilterModelRequest(input);
  assert.ok(typeof request.content === "string");
  assert.ok(typeof request.content_ref === "string");
  // content_ref must match the expected pattern
  assert.match(
    request.content_ref,
    /^filter-context:\/\/track1\/sha256\/[a-f0-9]{64}$/
  );
});

test("composeTrack1FilterModelRequest is deterministic", () => {
  const input = {
    user_prompt: "User sentinel",
    retrieved_content: ["Retrieved sentinel"],
    memory_entries: [{ memory_id: "memory-1", content: "Memory sentinel" }]
  };
  const request1 = composeTrack1FilterModelRequest(input);
  const request2 = composeTrack1FilterModelRequest(input);
  assert.equal(request1.content, request2.content);
  assert.equal(request1.content_ref, request2.content_ref);
});

test("composeTrack1FilterModelRequest caller mutation does not affect serialized request", () => {
  const retrieved = ["Retrieved sentinel"];
  const memEntries = [{ memory_id: "memory-1", content: "Memory sentinel" }];
  const input = {
    user_prompt: "User sentinel",
    retrieved_content: retrieved,
    memory_entries: memEntries
  };
  const request1 = composeTrack1FilterModelRequest(input);
  // Mutate after composition
  retrieved.push("extra");
  memEntries[0].content = "mutated";
  (input as any).user_prompt = "mutated";
  const request2 = composeTrack1FilterModelRequest({
    user_prompt: "User sentinel",
    retrieved_content: ["Retrieved sentinel"],
    memory_entries: [{ memory_id: "memory-1", content: "Memory sentinel" }]
  });
  assert.equal(request1.content, request2.content);
  assert.equal(request1.content_ref, request2.content_ref);
});

test("error messages contain no sentinel content", () => {
  // serialize error
  try {
    serializeTrack1FilterContext({} as any);
    assert.fail("Expected error");
  } catch (err) {
    const msg = String((err as Error).message);
    assert.ok(!msg.includes("sentinel"), "serialize error contains raw sentinel");
    assert.ok(!msg.includes("track1_test_secret"), "serialize error contains raw sentinel");
  }
  // parse error
  try {
    parseTrack1FilterContext("not json");
    assert.fail("Expected error");
  } catch (err) {
    const msg = String((err as Error).message);
    assert.ok(!msg.includes("sentinel"), "parse error contains raw input");
    assert.ok(!msg.includes("track1_test_secret"), "parse error contains raw input");
  }
});

// Run the tests — they will be RED until implementation is added
contextInputTests();
ruleNormalizerTests();
catalogNormalizerTests();
