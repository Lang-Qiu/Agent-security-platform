import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const catalogPath = new URL(
  "../src/security-production/rule-catalog.ts",
  import.meta.url
);

const OPERATOR_NAMES = [
  "text_contains_token",
  "text_contains_phrase",
  "text_ordered_sequence",
  "json_key_present",
  "json_string_contains",
  "tool_name_equals",
  "target_scheme_equals",
  "argument_key_present",
  "cross_source_ordered_sequence"
] as const;

type OperatorName = (typeof OPERATOR_NAMES)[number];
type CatalogRecord = Readonly<Record<string, unknown>>;
type CatalogModule = {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION: string;
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG: readonly CatalogRecord[];
  validateSandboxSecurityProductionRuleCatalog(
    value: unknown
  ): readonly CatalogRecord[];
};

const inertCatalogModule: CatalogModule = {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION: "missing",
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG: [
    {
      rule_id: "sandbox_security_rule_inert_v1",
      category: "prompt_injection",
      reason_code: "sandbox_security_prompt_injection",
      supported_stages: ["user_input"],
      supported_source_types: ["user_input"],
      severity: "high",
      confidence: 0.8,
      subject_strategy: "whole_source",
      expression: {
        match: "all",
        conditions: [
          { operator: "text_contains_token", tokens: ["ignore"], comparison: "nfkc_casefold" }
        ]
      }
    }
  ],
  validateSandboxSecurityProductionRuleCatalog(value: unknown) {
    return value as readonly CatalogRecord[];
  }
};

const catalogModule: CatalogModule = existsSync(catalogPath)
  ? ((await import("../src/security-production/rule-catalog.ts")) as unknown as CatalogModule)
  : inertCatalogModule;

const {
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
  SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG,
  validateSandboxSecurityProductionRuleCatalog
} = catalogModule;

function condition(operator: OperatorName): Record<string, unknown> {
  switch (operator) {
    case "text_contains_token":
      return { operator, tokens: ["ignore"], comparison: "nfkc_casefold" };
    case "text_contains_phrase":
      return { operator, phrases: ["developer mode"], comparison: "nfkc_casefold" };
    case "text_ordered_sequence":
      return { operator, sequence: ["ignore", "instructions"], comparison: "nfkc_casefold" };
    case "json_key_present":
      return { operator, keys: ["password"], comparison: "nfkc_exact" };
    case "json_string_contains":
      return { operator, values: ["send credentials"], comparison: "nfkc_casefold" };
    case "tool_name_equals":
      return { operator, names: ["delete_file"], comparison: "nfkc_exact" };
    case "target_scheme_equals":
      return { operator, schemes: ["file"], comparison: "nfkc_casefold" };
    case "argument_key_present":
      return { operator, keys: ["sudo"], comparison: "nfkc_exact" };
    case "cross_source_ordered_sequence":
      return { operator, sequence: ["use", "tool"], comparison: "nfkc_casefold" };
  }
}

function descriptor(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    rule_id: "sandbox_security_rule_test_v1",
    category: "prompt_injection",
    reason_code: "sandbox_security_prompt_injection",
    supported_stages: ["user_input"],
    supported_source_types: ["user_input"],
    severity: "high",
    confidence: 0.8,
    subject_strategy: "whole_source",
    expression: {
      match: "all",
      conditions: [condition("text_contains_token")]
    },
    ...overrides
  };
}

function descriptorForOperator(operator: OperatorName): Record<string, unknown> {
  const operatorSpecific =
    operator === "tool_name_equals"
      ? {
          supported_stages: ["tool_request"],
          supported_source_types: ["model_output"],
          subject_strategy: "tool_name"
        }
      : operator === "target_scheme_equals"
        ? {
            supported_stages: ["tool_request"],
            supported_source_types: ["model_output"],
            subject_strategy: "target"
          }
        : operator === "argument_key_present"
          ? {
              supported_stages: ["tool_request"],
              supported_source_types: ["model_output"],
              subject_strategy: "whole_arguments"
            }
          : operator === "cross_source_ordered_sequence"
            ? { subject_strategy: "ordered_sources" }
            : {};
  return descriptor({
    rule_id: `sandbox_security_rule_${operator}_v1`,
    expression: { match: "all", conditions: [condition(operator)] },
    ...operatorSpecific
  });
}

function validateOne(value: unknown): readonly CatalogRecord[] {
  return validateSandboxSecurityProductionRuleCatalog([value]);
}

function catalogOperatorNames(): OperatorName[] {
  return SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.flatMap((rule) => {
    const expression = rule.expression as { conditions?: readonly CatalogRecord[] } | undefined;
    return (expression?.conditions ?? []).map(
      (item) => item.operator as OperatorName
    );
  });
}

test("REQ-SBX-GENERAL-002 catalog accepts every closed v1 operator", () => {
  assert.deepEqual(
    [...new Set(catalogOperatorNames())].sort(),
    [...OPERATOR_NAMES].sort()
  );

  for (const operator of OPERATOR_NAMES) {
    assert.doesNotThrow(() => validateOne(descriptorForOperator(operator)));
  }
});

test("REQ-SBX-GENERAL-002 catalog version and prompt injection reason mapping are stable", () => {
  assert.equal(
    SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG_VERSION,
    "sandbox-security-rule-catalog.v1"
  );
  const promptInjectionRule = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.find(
    (rule) => rule.category === "prompt_injection"
  );
  assert.equal(
    promptInjectionRule?.reason_code,
    "sandbox_security_prompt_injection"
  );
});

test("REQ-SBX-GENERAL-002 accepted prompt injection and jailbreak rules require attack-specific signals", () => {
  const promptInjectionRule = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.find(
    (rule) => rule.category === "prompt_injection"
  );
  const jailbreakRule = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.find(
    (rule) => rule.category === "jailbreak"
  );
  assert.ok(promptInjectionRule);
  assert.ok(jailbreakRule);

  const promptExpression = promptInjectionRule.expression as {
    match: unknown;
    conditions: readonly CatalogRecord[];
  };
  assert.equal(promptInjectionRule.confidence, 0.8);
  assert.equal(promptExpression.match, "all");
  assert.deepEqual(promptExpression.conditions, [
    {
      operator: "text_contains_token",
      tokens: ["ignore"],
      comparison: "nfkc_casefold"
    },
    {
      operator: "text_contains_token",
      tokens: ["previous"],
      comparison: "nfkc_casefold"
    },
    {
      operator: "text_contains_token",
      tokens: ["instructions"],
      comparison: "nfkc_casefold"
    }
  ]);

  const jailbreakExpression = jailbreakRule.expression as {
    match: unknown;
    conditions: readonly CatalogRecord[];
  };
  assert.equal(jailbreakExpression.match, "all");
  assert.deepEqual(jailbreakExpression.conditions, [
    {
      operator: "text_contains_phrase",
      phrases: ["developer mode"],
      comparison: "nfkc_casefold"
    },
    {
      operator: "text_contains_phrase",
      phrases: ["bypass safety restrictions"],
      comparison: "nfkc_casefold"
    }
  ]);
});

test("REQ-SBX-CHINESE-RISK-RULES catalog exposes four user-input Chinese attack rules", () => {
  const expected = new Map([
    ["sandbox_security_prompt_injection_chinese_v1", "prompt_injection"],
    ["sandbox_security_jailbreak_chinese_v1", "jailbreak"],
    ["sandbox_security_sensitive_data_chinese_v1", "sensitive_data_exposure"],
    ["sandbox_security_privilege_escalation_chinese_v1", "privilege_escalation"]
  ] as const);

  for (const [ruleId, category] of expected) {
    const rule = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.find(
      (item) => item.rule_id === ruleId
    );
    assert.ok(rule, ruleId);
    assert.equal(rule.category, category);
    assert.equal(rule.reason_code, `sandbox_security_${category}`);
    assert.deepEqual(rule.supported_stages, ["user_input"]);
    assert.deepEqual(rule.supported_source_types, [
      "user_input",
      "retrieved_content",
      "memory_content"
    ]);
    assert.equal(rule.severity, "high");
    assert.equal(rule.confidence, 0.8);
    assert.equal(rule.subject_strategy, "whole_source");
    assert.equal(rule.expression.match, "all");
    assert.equal(rule.expression.conditions.length, 2);
    assert.ok(
      rule.expression.conditions.every(
        (condition) => condition.operator === "text_contains_phrase"
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 broad structural and tool indicators remain routing heuristics", () => {
  const heuristicOperators = new Set([
    "json_key_present",
    "json_string_contains",
    "tool_name_equals",
    "target_scheme_equals",
    "argument_key_present",
    "cross_source_ordered_sequence"
  ]);
  const heuristicRules = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.filter(
    (rule) => {
      const expression = rule.expression as {
        conditions?: readonly CatalogRecord[];
      };
      return (expression.conditions ?? []).some((conditionRecord) =>
        heuristicOperators.has(String(conditionRecord.operator))
      );
    }
  );
  assert.equal(heuristicRules.length, 6);
  for (const rule of heuristicRules) {
    assert.equal(
      rule.confidence,
      0.6,
      `${String(rule.rule_id)} must remain routing-only`
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog descriptors and expressions use exact keys", () => {
  for (const rule of SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG) {
    assert.deepEqual(Object.keys(rule).sort(), [
      "category",
      "confidence",
      "expression",
      "reason_code",
      "rule_id",
      "severity",
      "subject_strategy",
      "supported_source_types",
      "supported_stages"
    ]);
    assert.deepEqual(
      Object.keys(rule.expression as object).sort(),
      ["conditions", "match"]
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog accepts one and eight expression conditions", () => {
  assert.doesNotThrow(() => validateOne(descriptor()));
  assert.doesNotThrow(() =>
    validateOne(
      descriptor({
        expression: {
          match: "any",
          conditions: Array.from({ length: 8 }, () =>
            condition("text_contains_token")
          )
        }
      })
    )
  );
});

test("REQ-SBX-GENERAL-002 catalog expressions reject unknown, missing, inherited, and accessor fields", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [condition("text_contains_token")],
            unexpected: true
          }
        })
      ),
    TypeError
  );

  assert.throws(
    () =>
      validateOne(
        descriptor({ expression: { conditions: [condition("text_contains_token")] } })
      ),
    TypeError
  );

  const inherited = Object.assign(Object.create({ match: "all" }), {
    conditions: [condition("text_contains_token")]
  });
  assert.throws(() => validateOne(descriptor({ expression: inherited })), TypeError);

  const accessor = {
    conditions: [condition("text_contains_token")]
  } as Record<string, unknown>;
  Object.defineProperty(accessor, "match", {
    enumerable: true,
    get() {
      return "all";
    }
  });
  assert.throws(() => validateOne(descriptor({ expression: accessor })), TypeError);
});

test("REQ-SBX-GENERAL-002 catalog rejects zero and nine expression conditions", () => {
  for (const count of [0, 9]) {
    assert.throws(() =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: Array.from({ length: count }, () =>
              condition("text_contains_token")
            )
          }
        })
      ),
      TypeError
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects unsupported stage and source combinations", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({
          supported_stages: ["user_input"],
          supported_source_types: ["model_output"]
        })
      ),
    TypeError
  );
  assert.throws(
    () => validateOne(descriptor({ supported_stages: ["unknown_stage"] })),
    TypeError
  );
  assert.throws(
    () =>
      validateOne(descriptor({ supported_source_types: ["unknown_source_type"] })),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog accepts the frozen core stage and source matrix", () => {
  const historicalSourceTypes = [
    "system_instruction",
    "developer_instruction",
    "user_input",
    "retrieved_content",
    "memory_content"
  ];
  assert.doesNotThrow(() =>
    validateOne(
      descriptor({
        supported_stages: ["user_input"],
        supported_source_types: historicalSourceTypes
      })
    )
  );

  for (const stage of ["model_output", "tool_request"]) {
    assert.doesNotThrow(() =>
      validateOne(
        descriptor({
          rule_id: `sandbox_security_rule_${stage}_matrix_v1`,
          supported_stages: [stage],
          supported_source_types: [...historicalSourceTypes, "model_output"]
        })
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 production catalog covers every stage and category", () => {
  const modelOutputRules = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.filter(
    (rule) =>
      (rule.supported_stages as readonly string[]).includes("model_output")
  );
  const stages = new Set(
    SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.flatMap(
      (rule) => rule.supported_stages as readonly string[]
    )
  );
  const categories = new Set(
    SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.map((rule) => rule.category)
  );
  assert.deepEqual([...stages].sort(), [
    "model_output",
    "tool_request",
    "user_input"
  ]);
  assert.deepEqual([...categories].sort(), [
    "instruction_override",
    "jailbreak",
    "memory_poisoning",
    "privilege_escalation",
    "prompt_injection",
    "sensitive_data_exposure",
    "tool_hijacking",
    "trust_boundary_violation",
    "unsafe_side_effect"
  ]);
  assert.ok(
    modelOutputRules.some((rule) =>
      (rule.supported_source_types as readonly string[]).includes("model_output")
    )
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects any stage unsupported by an operator", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({
          supported_stages: ["user_input", "tool_request"],
          subject_strategy: "tool_name",
          expression: {
            match: "all",
            conditions: [condition("tool_name_equals")]
          }
        })
      ),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 tool-field rules use exact tool applicability", () => {
  const toolStrategies = new Set(["tool_name", "target", "whole_arguments"]);
  const toolRules = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.filter((rule) =>
    toolStrategies.has(String(rule.subject_strategy))
  );
  assert.equal(toolRules.length, 3);
  for (const rule of toolRules) {
    assert.deepEqual(rule.supported_stages, ["tool_request"]);
    assert.deepEqual(rule.supported_source_types, ["model_output"]);
  }

  const crossSourceRule = SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG.find(
    (rule) => rule.subject_strategy === "ordered_sources"
  );
  assert.ok(crossSourceRule);
  assert.deepEqual(crossSourceRule.supported_stages, ["tool_request"]);
  assert.deepEqual(crossSourceRule.supported_source_types, [
    "user_input",
    "retrieved_content"
  ]);
});

test("REQ-SBX-GENERAL-002 validator rejects inconsistent tool-field source applicability", () => {
  for (const operator of [
    "tool_name_equals",
    "target_scheme_equals",
    "argument_key_present"
  ] as const) {
    const invalidRule = descriptorForOperator(operator);
    invalidRule.supported_source_types = ["user_input"];
    assert.throws(() => validateOne(invalidRule), TypeError);
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects duplicate rule IDs", () => {
  const first = descriptor();
  const second = descriptor({ severity: "critical" });
  assert.throws(
    () => validateSandboxSecurityProductionRuleCatalog([first, second]),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects shared descriptor references", () => {
  const sharedDescriptor = descriptor();
  assert.throws(
    () =>
      validateSandboxSecurityProductionRuleCatalog([
        sharedDescriptor,
        sharedDescriptor
      ]),
    {
      name: "TypeError",
      message: /cyclic or aliased/u
    }
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects shared condition references", () => {
  const sharedCondition = condition("text_contains_token");
  assert.throws(
    () =>
      validateSandboxSecurityProductionRuleCatalog([
        descriptor({
          rule_id: "sandbox_security_rule_alias_condition_first_v1",
          expression: { match: "all", conditions: [sharedCondition] }
        }),
        descriptor({
          rule_id: "sandbox_security_rule_alias_condition_second_v1",
          expression: { match: "all", conditions: [sharedCondition] }
        })
      ]),
    {
      name: "TypeError",
      message: /cyclic or aliased/u
    }
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects shared operator value arrays", () => {
  const sharedTokens = ["ignore"];
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens: sharedTokens,
                comparison: "nfkc_casefold"
              },
              {
                operator: "text_contains_token",
                tokens: sharedTokens,
                comparison: "nfkc_casefold"
              }
            ]
          }
        })
      ),
    {
      name: "TypeError",
      message: /cyclic or aliased/u
    }
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects category and reason mismatch", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({ reason_code: "sandbox_security_tool_hijacking" })
      ),
    TypeError
  );
  assert.throws(
    () => validateOne(descriptor({ category: "unknown_category" })),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog accepts only fixed confidence values", () => {
  for (const confidence of [0.6, 0.8, 1]) {
    assert.doesNotThrow(() =>
      validateOne(
        descriptor({
          rule_id: `sandbox_security_rule_confidence_${String(confidence).replace(".", "_")}_v1`,
          confidence
        })
      )
    );
  }
  assert.throws(() => validateOne(descriptor({ confidence: 0.9 })), TypeError);
});

test("REQ-SBX-GENERAL-002 catalog accepts all severities and rejects unknown severity", () => {
  for (const severity of ["low", "medium", "high", "critical"]) {
    assert.doesNotThrow(() =>
      validateOne(
        descriptor({
          rule_id: `sandbox_security_rule_severity_${severity}_v1`,
          severity
        })
      )
    );
  }
  assert.throws(
    () => validateOne(descriptor({ severity: "unknown_severity" })),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects invalid subject strategies", () => {
  assert.throws(
    () => validateOne(descriptor({ subject_strategy: "dynamic_locator" })),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects unknown and missing descriptor fields", () => {
  assert.throws(
    () => validateOne(descriptor({ unexpected: "field" })),
    TypeError
  );
  const { reason_code: _reasonCode, ...missingReason } = descriptor();
  assert.throws(() => validateOne(missingReason), TypeError);
});

test("REQ-SBX-GENERAL-002 catalog rejects inherited and accessor descriptor fields", () => {
  const inherited = Object.assign(
    Object.create({ rule_id: "sandbox_security_rule_inherited_v1" }),
    descriptor({ rule_id: undefined })
  );
  delete inherited.rule_id;
  assert.throws(() => validateOne(inherited), TypeError);

  const accessor = descriptor();
  Object.defineProperty(accessor, "severity", {
    enumerable: true,
    get() {
      return "high";
    }
  });
  assert.throws(() => validateOne(accessor), TypeError);
});

test("REQ-SBX-GENERAL-002 catalog rejects unknown, missing, inherited, and accessor condition fields", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              { ...condition("text_contains_token"), unexpected: true }
            ]
          }
        })
      ),
    TypeError
  );

  const missing = condition("text_contains_token");
  delete missing.tokens;
  assert.throws(
    () =>
      validateOne(
        descriptor({ expression: { match: "all", conditions: [missing] } })
      ),
    TypeError
  );

  const inherited = Object.assign(
    Object.create({ operator: "text_contains_token" }),
    { tokens: ["ignore"], comparison: "nfkc_casefold" }
  );
  assert.throws(
    () =>
      validateOne(
        descriptor({ expression: { match: "all", conditions: [inherited] } })
      ),
    TypeError
  );

  const accessor = condition("text_contains_token");
  Object.defineProperty(accessor, "tokens", {
    enumerable: true,
    get() {
      return ["ignore"];
    }
  });
  assert.throws(
    () =>
      validateOne(
        descriptor({ expression: { match: "all", conditions: [accessor] } })
      ),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects an accessor operator before schema dispatch", () => {
  let accessed = false;
  const accessor = condition("text_contains_token");
  Object.defineProperty(accessor, "operator", {
    enumerable: true,
    get() {
      accessed = true;
      return "text_contains_token";
    }
  });
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: { match: "all", conditions: [accessor] }
        })
      ),
    TypeError
  );
  assert.equal(accessed, false);
});

test("REQ-SBX-GENERAL-002 catalog rejects sparse catalog, condition, and value arrays", () => {
  const sparseCatalog = Array(2);
  sparseCatalog[0] = descriptor();
  assert.throws(
    () => validateSandboxSecurityProductionRuleCatalog(sparseCatalog),
    TypeError
  );

  const sparseConditions = Array(2);
  sparseConditions[0] = condition("text_contains_token");
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: { match: "all", conditions: sparseConditions }
        })
      ),
    TypeError
  );

  const sparseTokens = Array(2);
  sparseTokens[0] = "ignore";
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens: sparseTokens,
                comparison: "nfkc_casefold"
              }
            ]
          }
        })
      ),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog accepts one and eight operator strings", () => {
  for (const tokens of [
    ["ignore"],
    Array.from({ length: 8 }, (_, index) => `token${index}`)
  ]) {
    assert.doesNotThrow(() =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens,
                comparison: "nfkc_casefold"
              }
            ]
          }
        })
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects zero and nine operator strings", () => {
  for (const tokens of [[], Array.from({ length: 9 }, (_, index) => `t${index}`)]) {
    assert.throws(
      () =>
        validateOne(
          descriptor({
            expression: {
              match: "all",
              conditions: [
                {
                  operator: "text_contains_token",
                  tokens,
                  comparison: "nfkc_casefold"
                }
              ]
            }
          })
        ),
      TypeError
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects unsafe or non-NFKC operator strings", () => {
  for (const token of [" x", "x\u0000", "x".repeat(257), "ｅｖｉｌ"]) {
    assert.throws(
      () =>
        validateOne(
          descriptor({
            expression: {
              match: "all",
              conditions: [
                {
                  operator: "text_contains_token",
                  tokens: [token],
                  comparison: "nfkc_casefold"
                }
              ]
            }
          })
        ),
      TypeError
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects control surrogate and format code points", () => {
  for (const token of [
    "safe\u0085text",
    "safe\ud800text",
    "safe\udc00text",
    "safe\u202etext"
  ]) {
    assert.throws(
      () =>
        validateOne(
          descriptor({
            expression: {
              match: "all",
              conditions: [
                {
                  operator: "text_contains_token",
                  tokens: [token],
                  comparison: "nfkc_casefold"
                }
              ]
            }
          })
        ),
      TypeError
    );
  }

  for (const token of ["安全检查", "مرحبا", "café"]) {
    assert.doesNotThrow(() =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens: [token],
                comparison: "nfkc_casefold"
              }
            ]
          }
        })
      )
    );
  }
});

test("REQ-SBX-GENERAL-002 catalog rejects unsupported operators and comparisons", () => {
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [{ operator: "regex", pattern: ".*" }]
          }
        })
      ),
    TypeError
  );
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens: ["ignore"],
                comparison: "locale_dynamic"
              }
            ]
          }
        })
      ),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog rejects nested callbacks, regex values, and cycles", () => {
  for (const invalidValue of [() => true, /ignore/u]) {
    assert.throws(
      () =>
        validateOne(
          descriptor({
            expression: {
              match: "all",
              conditions: [
                {
                  operator: "text_contains_token",
                  tokens: [invalidValue],
                  comparison: "nfkc_casefold"
                }
              ]
            }
          })
        ),
      TypeError
    );
  }

  const cyclicTokens: unknown[] = ["ignore"];
  cyclicTokens.push(cyclicTokens);
  assert.throws(
    () =>
      validateOne(
        descriptor({
          expression: {
            match: "all",
            conditions: [
              {
                operator: "text_contains_token",
                tokens: cyclicTokens,
                comparison: "nfkc_casefold"
              }
            ]
          }
        })
      ),
    TypeError
  );
});

test("REQ-SBX-GENERAL-002 catalog recursively freezes its entire object graph", () => {
  const seen = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) {
      return;
    }
    seen.add(value);
    assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      assert.ok(property && "value" in property, `${path}.${String(key)} must be data`);
      visit(property.value, `${path}.${String(key)}`);
    }
  };
  visit(SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG, "catalog");

  const nestedValues = (
    SANDBOX_SECURITY_PRODUCTION_RULE_CATALOG[0]?.expression as {
      conditions?: readonly Record<string, unknown>[];
    }
  )?.conditions?.[0];
  const firstArray = Object.values(nestedValues ?? {}).find(Array.isArray) as
    | readonly string[]
    | undefined;
  assert.ok(firstArray);
  assert.throws(() => {
    (firstArray as string[])[0] = "mutated";
  }, TypeError);
});

test("REQ-SBX-GENERAL-002 catalog source contains no benchmark oracle inventory", () => {
  const source = existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "";
  assert.doesNotMatch(
    source,
    /\b(?:fixture_id|source_id|dataset_source|record_ref|seed_record(?:_ref)?|verdict_class|ground_truth(?:_severity)?|truth_label|transformation_kind|expected_action|replay_key)\b/iu
  );
  assert.doesNotMatch(
    source,
    /sandbox-security-benchmark|AgentDojo|ToolEmu|prompt-injections|OpenAssistant\/oasst1/iu
  );
});
