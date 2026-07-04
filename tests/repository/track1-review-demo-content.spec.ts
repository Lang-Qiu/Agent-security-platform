import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

const EXPECTED_TOP_LEVEL_KEYS = [
  "schema_version",
  "locale",
  "product",
  "source_notice",
  "review_tour",
  "capabilities",
  "scenarios",
  "metric_bindings",
  "evidence_surfaces",
  "safety_boundary",
  "frequently_asked_questions"
].sort();

const EXPECTED_SCENARIOS = [
  ["T1-SC-001", "agent:track1:prompt-injection"],
  ["T1-SC-002", "agent:track1:tool-hijack"],
  ["T1-SC-003", "agent:track1:memory-poison"]
] as const;

const EXPECTED_METRICS = [
  "agent_count",
  "case_count",
  "attempt_count",
  "retry_count",
  "deny_count",
  "ask_count",
  "allow_count",
  "blocked_count",
  "intercepted_tool_count",
  "executed_simulated_tool_count",
  "real_side_effect_count"
];

function text(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

function content(): Record<string, unknown> {
  return JSON.parse(
    text("samples/track1/review-demo/content.zh-CN.json")
  ) as Record<string, unknown>;
}

function ids(values: Array<Record<string, unknown>>): string[] {
  return values.map((value) => String(value.id));
}

function assertUnique(values: string[], label: string): void {
  assert.equal(new Set(values).size, values.length, label);
}

function collectKeysAndStrings(
  value: unknown,
  keys: string[] = [],
  strings: string[] = []
): { keys: string[]; strings: string[] } {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeysAndStrings(item, keys, strings);
    }
    return { keys, strings };
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeysAndStrings(child, keys, strings);
    }
    return { keys, strings };
  }
  if (typeof value === "string") {
    strings.push(value);
  }
  return { keys, strings };
}

test("REQ-T1-DEMO-010 review content has a closed versioned Chinese catalog", () => {
  const value = content();
  assert.deepEqual(Object.keys(value).sort(), EXPECTED_TOP_LEVEL_KEYS);
  assert.equal(value.schema_version, "track1-review-demo-content.v1");
  assert.equal(value.locale, "zh-CN");

  const product = value.product as Record<string, unknown>;
  assert.equal(product.name, "灵鉴 AgentScope");
  assert.equal(product.tagline, "看见 Agent，守住边界。");

  const sourceNotice = value.source_notice as Record<string, unknown>;
  assert.equal(sourceNotice.label, "受控评审数据 · 非实时云模型验收结果");
  assert.equal(sourceNotice.data_source, "controlled_fixture");
  assert.equal(sourceNotice.accepted_baseline, false);
});

test("REQ-T1-DEMO-010 review tour is five ordered minutes with stable targets", () => {
  const tour = content().review_tour as Array<Record<string, unknown>>;
  assert.equal(tour.length, 5);
  assert.deepEqual(
    tour.map((step) => step.order),
    [1, 2, 3, 4, 5]
  );
  assert.equal(
    tour.reduce(
      (total, step) => total + Number(step.duration_seconds),
      0
    ),
    300
  );
  assertUnique(ids(tour), "review tour ids must be unique");

  for (const step of tour) {
    for (const key of [
      "title",
      "evaluator_question",
      "presenter_guidance",
      "target_surface"
    ]) {
      assert.equal(
        typeof step[key],
        "string",
        `${String(step.id)}.${key}`
      );
      assert.notEqual(String(step[key]).trim(), "", `${String(step.id)}.${key}`);
    }
  }
});

test("REQ-T1-DEMO-010 review scenarios follow the canonical three-agent order", () => {
  const value = content();
  const scenarios = value.scenarios as Array<Record<string, unknown>>;
  const evidenceSurfaceIds = new Set(
    ids(value.evidence_surfaces as Array<Record<string, unknown>>)
  );
  assert.equal(scenarios.length, 3);
  assert.deepEqual(
    scenarios.map((scenario) => [
      scenario.scenario_id,
      scenario.agent_id
    ]),
    EXPECTED_SCENARIOS
  );

  for (const scenario of scenarios) {
    for (const key of [
      "display_name",
      "evaluator_question",
      "controlled_attack_objective",
      "control_mechanism",
      "residual_risk"
    ]) {
      assert.equal(
        typeof scenario[key],
        "string",
        `${String(scenario.scenario_id)}.${key}`
      );
      assert.notEqual(
        String(scenario[key]).trim(),
        "",
        `${String(scenario.scenario_id)}.${key}`
      );
    }
    const surfaces = scenario.evidence_surfaces as string[];
    assert.ok(surfaces.length >= 2);
    assertUnique(surfaces, `${String(scenario.scenario_id)} evidence surfaces`);
    for (const surface of surfaces) {
      assert.equal(
        evidenceSurfaceIds.has(surface),
        true,
        `${String(scenario.scenario_id)} references ${surface}`
      );
    }
  }
});

test("REQ-T1-DEMO-010 review metrics bind labels without embedding result values", () => {
  const metrics = content().metric_bindings as Array<Record<string, unknown>>;
  assert.deepEqual(
    metrics.map((metric) => metric.key),
    EXPECTED_METRICS
  );
  assertUnique(
    metrics.map((metric) => String(metric.key)),
    "metric keys must be unique"
  );

  for (const metric of metrics) {
    assert.deepEqual(Object.keys(metric).sort(), [
      "description",
      "key",
      "label"
    ]);
  }
});

test("REQ-T1-DEMO-010 review content keeps evidence, safety, and FAQ identifiers unique", () => {
  const value = content();
  const capabilities = value.capabilities as Array<Record<string, unknown>>;
  const evidence = value.evidence_surfaces as Array<Record<string, unknown>>;
  const safety = value.safety_boundary as Array<Record<string, unknown>>;
  const faq = value.frequently_asked_questions as Array<Record<string, unknown>>;

  assert.ok(capabilities.length >= 8);
  assert.ok(evidence.length >= 7);
  assert.ok(safety.length >= 7);
  assert.ok(faq.length >= 6);

  assertUnique(ids(capabilities), "capability ids must be unique");
  assertUnique(ids(evidence), "evidence ids must be unique");
  assertUnique(ids(safety), "safety ids must be unique");
  assertUnique(ids(faq), "FAQ ids must be unique");

  assert.equal(
    safety.some((item) =>
      String(item.statement).includes("所有工具副作用均由受控模拟器承载")
    ),
    true
  );
  assert.equal(
    safety.some((item) =>
      String(item.statement).includes("凭据化验收是独立显式门禁")
    ),
    true
  );
});

test("REQ-T1-DEMO-010 review content contains no forged outcome or raw runtime field", () => {
  const { keys, strings } = collectKeysAndStrings(content());
  const keySet = new Set(keys);

  for (const forbiddenKey of [
    "value",
    "actual_action",
    "expected_action",
    "passed",
    "pass_rate",
    "final_pass_count",
    "model_input",
    "model_output",
    "tool_arguments",
    "tool_result",
    "memory_value",
    "chain_of_thought"
  ]) {
    assert.equal(keySet.has(forbiddenKey), false, forbiddenKey);
  }

  const allText = strings.join("\n");
  assert.doesNotMatch(allText, /\b9\s*\/\s*9\b/i);
  assert.doesNotMatch(allText, /https?:\/\//i);
  assert.doesNotMatch(allText, /\bsk-[A-Za-z0-9_-]{8,}\b/);
  assert.match(allText, /占位校验件/);
  assert.match(allText, /不得作为真实评审证据/);
});

test("REQ-T1-DEMO-010 review content is registered in the root repository gate", () => {
  const packageJson = JSON.parse(text("package.json")) as {
    scripts: Record<string, string>;
  };
  assert.match(
    packageJson.scripts["test:repo"],
    /track1-review-demo-content\.spec\.ts/
  );
});
