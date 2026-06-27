import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const casesRoot = resolve(repoRoot, "samples/track1/cases");
const schemaPath = resolve(casesRoot, "track1-case.schema.json");
const readmePath = resolve(casesRoot, "README.md");
const manifestPath = resolve(repoRoot, "samples/track1/scenarios/track1-scenarios.v1.json");
const sprintPath = resolve(repoRoot, "docs/sprint-current.md");
const packagePath = resolve(repoRoot, "package.json");

const allowedCategories = new Set(["adversarial", "jailbreak", "negative_control"]);
const allowedPolicyActions = new Set(["allow", "deny", "ask", "alert"]);
const allowedToolDispositions = new Set(["not_requested", "must_not_execute"]);
const requiredProhibitedBehaviors = [
  "real credential use",
  "real external API calls",
  "real email delivery",
  "external exfiltration",
  "third-party targeting"
];
const placeholderPattern = new RegExp(["TB" + "D", "TO" + "DO", "FIX" + "ME", "\\?\\?\\?"].join("|"), "i");

interface ScenarioManifest {
  scenarios: Scenario[];
}

interface Scenario {
  scenario_id: string;
  case_requirements: {
    minimum_cases: number;
    required_case_types: string[];
  };
  simulated_tools: string[];
  expected_policy_actions: string[];
  evidence_requirements: string[];
}

interface Track1Case {
  schema_version: string;
  case_id: string;
  scenario_id: string;
  title: string;
  case_type: string;
  test_category: string;
  input: {
    user_prompt: string;
    retrieved_content: string[];
    memory_entries: Array<{
      memory_id: string;
      content: string;
    }>;
    proposed_tool_call: null | {
      tool_name: string;
      arguments: Record<string, string>;
    };
  };
  expected_outcome: {
    model_behavior: string;
    prohibited_model_behaviors: string[];
    policy_action: string;
    tool_behavior: {
      disposition: string;
      tools: string[];
    };
    evidence_requirements: string[];
  };
  safety: {
    mode: string;
    synthetic_only: boolean;
    network_access: string;
    prohibited_behaviors: string[];
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
}

function assertNonEmptyString(value: unknown, context: string): asserts value is string {
  assert.equal(typeof value, "string", `${context} should be a string`);
  assert.ok(value.trim().length > 0, `${context} should not be empty`);
}

function assertExactKeys(value: object, expectedKeys: string[], context: string): void {
  assert.deepEqual(sorted(Object.keys(value)), sorted(expectedKeys), `${context} should use only schema-defined fields`);
}

test("REQ-T1-CASESET-003 defines a closed machine-readable case schema", () => {
  assert.ok(existsSync(schemaPath), "Track 1 case schema should exist");

  const schema = readJson<Record<string, any>>(schemaPath);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    sorted(schema.required),
    sorted([
      "schema_version",
      "case_id",
      "scenario_id",
      "title",
      "case_type",
      "test_category",
      "input",
      "expected_outcome",
      "safety"
    ])
  );
  assert.equal(schema.properties.schema_version.const, "track1-case.v1");
  assert.equal(schema.properties.case_id.pattern, "^T1-SC-[0-9]{3}-C[0-9]{3}$");
  assert.deepEqual(sorted(schema.properties.test_category.enum), sorted(allowedCategories));
  assert.equal(schema.$defs.case_input.additionalProperties, false);
  assert.equal(schema.$defs.memory_entry.additionalProperties, false);
  assert.equal(schema.$defs.tool_call.additionalProperties, false);
  assert.equal(schema.$defs.expected_outcome.additionalProperties, false);
  assert.equal(schema.$defs.expected_outcome.properties.tool_behavior.additionalProperties, false);
  assert.equal(schema.$defs.safety.additionalProperties, false);
  assert.deepEqual(
    sorted(schema.$defs.expected_outcome.properties.policy_action.enum),
    sorted(allowedPolicyActions)
  );
  assert.deepEqual(
    sorted(schema.$defs.expected_outcome.properties.tool_behavior.properties.disposition.enum),
    sorted(allowedToolDispositions)
  );
  assert.equal(schema.$defs.safety.properties.mode.const, "controlled_research");
  assert.equal(schema.$defs.safety.properties.synthetic_only.const, true);
  assert.equal(schema.$defs.safety.properties.network_access.const, "none");
  assert.equal(schema.$defs.safety.properties.prohibited_behaviors.minItems, requiredProhibitedBehaviors.length);
  assert.equal(schema.$defs.safety.properties.prohibited_behaviors.uniqueItems, true);
});

test("REQ-T1-CASESET-003 provides nine safe cases covering every scenario case type", () => {
  assert.ok(existsSync(manifestPath), "Track 1 scenario manifest should exist");
  const manifest = readJson<ScenarioManifest>(manifestPath);
  const caseIds = new Set<string>();
  const categories = new Set<string>();
  let totalCases = 0;

  for (const scenario of manifest.scenarios) {
    assert.ok(
      scenario.expected_policy_actions.includes("allow"),
      `${scenario.scenario_id} should allow negative-control expectations`
    );

    const scenarioDirectory = resolve(casesRoot, scenario.scenario_id);
    assert.ok(existsSync(scenarioDirectory), `case directory should exist for ${scenario.scenario_id}`);
    const caseFiles = readdirSync(scenarioDirectory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    assert.equal(caseFiles.length, 3, `${scenario.scenario_id} should provide exactly three seed cases`);
    assert.equal(caseFiles.length, scenario.case_requirements.minimum_cases);

    const representedCaseTypes = new Set<string>();
    for (const caseFile of caseFiles) {
      const fixturePath = resolve(scenarioDirectory, caseFile);
      const fixture = readJson<Track1Case>(fixturePath);
      totalCases += 1;

      assertExactKeys(
        fixture,
        [
          "schema_version",
          "case_id",
          "scenario_id",
          "title",
          "case_type",
          "test_category",
          "input",
          "expected_outcome",
          "safety"
        ],
        fixture.case_id
      );
      assert.equal(fixture.schema_version, "track1-case.v1");
      assert.match(fixture.case_id, new RegExp(`^${scenario.scenario_id}-C[0-9]{3}$`));
      assert.equal(basename(caseFile, ".json"), fixture.case_id);
      assert.equal(caseIds.has(fixture.case_id), false, `duplicate case id ${fixture.case_id}`);
      caseIds.add(fixture.case_id);
      assert.equal(fixture.scenario_id, scenario.scenario_id);
      assertNonEmptyString(fixture.title, `${fixture.case_id}.title`);
      assert.ok(
        scenario.case_requirements.required_case_types.includes(fixture.case_type),
        `${fixture.case_id} has unsupported case type ${fixture.case_type}`
      );
      assert.equal(
        representedCaseTypes.has(fixture.case_type),
        false,
        `${scenario.scenario_id} repeats case type ${fixture.case_type}`
      );
      representedCaseTypes.add(fixture.case_type);
      assert.ok(allowedCategories.has(fixture.test_category), `${fixture.case_id} has invalid test category`);
      categories.add(fixture.test_category);

      assertExactKeys(
        fixture.input,
        ["user_prompt", "retrieved_content", "memory_entries", "proposed_tool_call"],
        `${fixture.case_id}.input`
      );
      assertNonEmptyString(fixture.input.user_prompt, `${fixture.case_id}.input.user_prompt`);
      assert.ok(Array.isArray(fixture.input.retrieved_content));
      assert.ok(Array.isArray(fixture.input.memory_entries));
      for (const memoryEntry of fixture.input.memory_entries) {
        assertExactKeys(memoryEntry, ["memory_id", "content"], `${fixture.case_id}.memory_entry`);
        assertNonEmptyString(memoryEntry.memory_id, `${fixture.case_id}.memory_id`);
        assertNonEmptyString(memoryEntry.content, `${fixture.case_id}.memory_content`);
      }

      const proposedTool = fixture.input.proposed_tool_call;
      if (proposedTool !== null) {
        assertExactKeys(proposedTool, ["tool_name", "arguments"], `${fixture.case_id}.proposed_tool_call`);
        assert.ok(
          scenario.simulated_tools.includes(proposedTool.tool_name),
          `${fixture.case_id} proposes unsupported tool ${proposedTool.tool_name}`
        );
        for (const argumentValue of Object.values(proposedTool.arguments)) {
          assertNonEmptyString(argumentValue, `${fixture.case_id}.tool_argument`);
        }
      }

      assertExactKeys(
        fixture.expected_outcome,
        [
          "model_behavior",
          "prohibited_model_behaviors",
          "policy_action",
          "tool_behavior",
          "evidence_requirements"
        ],
        `${fixture.case_id}.expected_outcome`
      );
      assertNonEmptyString(fixture.expected_outcome.model_behavior, `${fixture.case_id}.model_behavior`);
      assert.ok(fixture.expected_outcome.prohibited_model_behaviors.length > 0);
      assert.ok(
        scenario.expected_policy_actions.includes(fixture.expected_outcome.policy_action),
        `${fixture.case_id} uses policy action outside its scenario contract`
      );
      assert.ok(allowedPolicyActions.has(fixture.expected_outcome.policy_action));
      assertExactKeys(
        fixture.expected_outcome.tool_behavior,
        ["disposition", "tools"],
        `${fixture.case_id}.tool_behavior`
      );
      assert.ok(allowedToolDispositions.has(fixture.expected_outcome.tool_behavior.disposition));
      for (const tool of fixture.expected_outcome.tool_behavior.tools) {
        assert.ok(scenario.simulated_tools.includes(tool), `${fixture.case_id} expects unsupported tool ${tool}`);
      }
      assert.deepEqual(
        sorted(fixture.expected_outcome.evidence_requirements),
        sorted(scenario.evidence_requirements),
        `${fixture.case_id} should inherit scenario evidence requirements`
      );

      if (fixture.test_category === "negative_control") {
        assert.equal(fixture.expected_outcome.policy_action, "allow");
        assert.equal(fixture.expected_outcome.tool_behavior.disposition, "not_requested");
      } else {
        assert.notEqual(fixture.expected_outcome.policy_action, "allow");
        assert.equal(fixture.expected_outcome.tool_behavior.disposition, "must_not_execute");
      }

      assertExactKeys(
        fixture.safety,
        ["mode", "synthetic_only", "network_access", "prohibited_behaviors"],
        `${fixture.case_id}.safety`
      );
      assert.equal(fixture.safety.mode, "controlled_research");
      assert.equal(fixture.safety.synthetic_only, true);
      assert.equal(fixture.safety.network_access, "none");
      assert.deepEqual(sorted(fixture.safety.prohibited_behaviors), sorted(requiredProhibitedBehaviors));

      const serializedFixture = JSON.stringify(fixture);
      assert.equal(placeholderPattern.test(serializedFixture), false, `${fixture.case_id} contains placeholder text`);
      assert.doesNotMatch(serializedFixture, /https?:\/\//i, `${fixture.case_id} should not include network targets`);
    }

    assert.deepEqual(
      sorted(representedCaseTypes),
      sorted(scenario.case_requirements.required_case_types),
      `${scenario.scenario_id} should cover every required case type exactly once`
    );
  }

  assert.equal(totalCases, 9);
  assert.deepEqual(sorted(categories), sorted(allowedCategories));
});

test("REQ-T1-CASESET-003 documents the schema, case index, and safety boundary", () => {
  assert.ok(existsSync(readmePath), "Track 1 case-set README should exist");
  const readme = readFileSync(readmePath, "utf8");
  const manifest = readJson<ScenarioManifest>(manifestPath);
  const sprint = readFileSync(sprintPath, "utf8");

  assert.ok(sprint.includes("REQ-T1-CASESET-003"));
  assert.ok(readme.includes("track1-case.schema.json"));
  assert.ok(readme.includes("controlled research"));
  assert.ok(readme.includes("Attack replay scripts are out of scope"));

  for (const scenario of manifest.scenarios) {
    assert.ok(readme.includes(scenario.scenario_id), `README should include ${scenario.scenario_id}`);
    for (let index = 1; index <= 3; index += 1) {
      const caseId = `${scenario.scenario_id}-C${String(index).padStart(3, "0")}`;
      assert.ok(readme.includes(caseId), `README should include ${caseId}`);
    }
  }

  for (const prohibitedBehavior of requiredProhibitedBehaviors) {
    assert.ok(readme.includes(prohibitedBehavior), `README should include ${prohibitedBehavior}`);
  }
  assert.equal(placeholderPattern.test(readme), false, "README should not contain placeholder text");
});

test("REQ-T1-CASESET-003 is included in the root repository test gate", () => {
  const packageJson = readJson<{ scripts?: Record<string, string> }>(packagePath);
  const repositoryTestCommand = packageJson.scripts?.["test:repo"];

  assertNonEmptyString(repositoryTestCommand, "package.json scripts.test:repo");
  assert.ok(
    repositoryTestCommand.includes("tests/repository/track1-case-set.spec.ts"),
    "test:repo should include the Track 1 case-set contract test"
  );
});
