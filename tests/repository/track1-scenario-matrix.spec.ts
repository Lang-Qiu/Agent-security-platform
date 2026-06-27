import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(repoRoot, "samples/track1/scenarios/track1-scenarios.v1.json");
const matrixPath = resolve(repoRoot, "docs/track1/scenario-acceptance-matrix.md");
const scenarioReadmePath = resolve(repoRoot, "samples/track1/scenarios/README.md");

const stableScenarioContracts = new Map([
  [
    "T1-SC-001",
    {
      attack_class: "prompt_injection_jailbreak",
      report_section: "Track 1 Scenario 1 - Prompt Injection and Jailbreak"
    }
  ],
  [
    "T1-SC-002",
    {
      attack_class: "tool_call_hijacking",
      report_section: "Track 1 Scenario 2 - Tool-Call Hijacking"
    }
  ],
  [
    "T1-SC-003",
    {
      attack_class: "context_memory_poisoning",
      report_section: "Track 1 Scenario 3 - Context and Memory Poisoning"
    }
  ]
]);

const requiredAttackClasses = new Set(
  Array.from(stableScenarioContracts.values(), (scenario) => scenario.attack_class)
);
const requiredScenarioIds = new Set(stableScenarioContracts.keys());
const allowedSimulatedTools = new Set(["send_email", "read_file", "write_file", "call_api"]);
const allowedPolicyActions = new Set(["allow", "deny", "ask", "alert"]);
const requiredProhibitedBehaviors = new Set([
  "real credential use",
  "real external API calls",
  "external exfiltration",
  "third-party targeting",
  "real email delivery"
]);
const prohibitedWeakerBehaviorLabel = ["unapproved", "third-party targeting"].join(" ");
const placeholderPattern = new RegExp(["TB" + "D", "TO" + "DO", "FIX" + "ME", "\\?\\?\\?"].join("|"), "i");

interface Track1ScenarioManifest {
  version: string;
  scenarios: Track1Scenario[];
}

interface Track1Scenario {
  scenario_id: string;
  title: string;
  attack_class: string;
  demo_target: string;
  objective: string;
  research_boundary: string;
  case_requirements: {
    minimum_cases: number;
    required_case_types: string[];
    expected_case_file_pattern: string;
  };
  attack_script_requirements: {
    entrypoint: string;
    required_events: string[];
    prohibited_behaviors: string[];
  };
  simulated_tools: string[];
  expected_policy_actions: string[];
  evidence_requirements: string[];
  report_section: string;
}

function readManifest(): Track1ScenarioManifest {
  assert.ok(existsSync(manifestPath), "Track 1 scenario manifest should exist");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Track1ScenarioManifest;
}

function assertNoPlaceholderText(value: unknown, path: string): void {
  if (typeof value === "string") {
    assert.equal(placeholderPattern.test(value), false, `${path} contains placeholder text`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlaceholderText(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      assertNoPlaceholderText(nestedValue, `${path}.${key}`);
    }
  }
}

function assertIncludesAll(text: string, values: string[], context: string): void {
  for (const value of values) {
    assert.ok(text.includes(value), `${context} should include ${value}`);
  }
}

function assertDoesNotInclude(text: string, value: string, context: string): void {
  assert.equal(text.includes(value), false, `${context} should not include ${value}`);
}

test("REQ-T1-SCENARIO-002 defines the required Track 1 seed attack classes", () => {
  const manifest = readManifest();

  assert.equal(manifest.version, "track1-scenarios.v1");
  assert.ok(Array.isArray(manifest.scenarios));
  assert.ok(manifest.scenarios.length >= 3);

  const classes = new Set(manifest.scenarios.map((scenario) => scenario.attack_class));
  for (const requiredClass of requiredAttackClasses) {
    assert.ok(classes.has(requiredClass), `missing required attack class ${requiredClass}`);
  }

  const scenarioIds = new Set(manifest.scenarios.map((scenario) => scenario.scenario_id));
  for (const requiredScenarioId of requiredScenarioIds) {
    assert.ok(scenarioIds.has(requiredScenarioId), `missing required scenario id ${requiredScenarioId}`);
  }
});

test("REQ-T1-SCENARIO-002 scenarios include safety, replay, policy, and evidence requirements", () => {
  const manifest = readManifest();
  const scenarioIds = new Set<string>();

  for (const scenario of manifest.scenarios) {
    assert.match(scenario.scenario_id, /^T1-SC-\d{3}$/);
    assert.equal(scenarioIds.has(scenario.scenario_id), false, `duplicate scenario id ${scenario.scenario_id}`);
    scenarioIds.add(scenario.scenario_id);

    const expectedScenario = stableScenarioContracts.get(scenario.scenario_id);
    assert.ok(expectedScenario, `unexpected scenario id ${scenario.scenario_id}`);
    assert.equal(scenario.attack_class, expectedScenario.attack_class);
    assert.equal(scenario.report_section, expectedScenario.report_section);

    assert.ok(scenario.title.length > 0);
    assert.ok(scenario.demo_target.includes("OpenClaw") || scenario.demo_target.includes("controlled"));
    assert.ok(scenario.objective.length >= 40);
    assert.ok(scenario.research_boundary.includes("controlled"));
    assert.ok(scenario.case_requirements.minimum_cases >= 3);
    assert.ok(scenario.case_requirements.required_case_types.length >= 3);
    assert.equal(
      scenario.case_requirements.expected_case_file_pattern,
      `samples/track1/cases/${scenario.scenario_id}/*.json`
    );
    assert.match(scenario.case_requirements.expected_case_file_pattern, /^samples\/track1\/cases\/T1-SC-\d{3}\/\*\.json$/);
    assert.equal(
      scenario.attack_script_requirements.entrypoint,
      `samples/track1/attack-scripts/${scenario.scenario_id}/replay.ts`
    );
    assert.match(scenario.attack_script_requirements.entrypoint, /^samples\/track1\/attack-scripts\/T1-SC-\d{3}\/replay\.ts$/);
    assert.ok(scenario.attack_script_requirements.required_events.includes("model_input"));
    assert.ok(scenario.attack_script_requirements.required_events.includes("tool_request"));
    assert.ok(scenario.simulated_tools.length >= 1);
    assert.ok(scenario.evidence_requirements.includes("sandbox_alert"));
    assert.ok(scenario.evidence_requirements.includes("report_evidence_ref"));
    assert.ok(scenario.report_section.startsWith("Track 1 Scenario"));

    for (const requiredBehavior of requiredProhibitedBehaviors) {
      assert.ok(
        scenario.attack_script_requirements.prohibited_behaviors.includes(requiredBehavior),
        `${scenario.scenario_id} missing prohibited behavior ${requiredBehavior}`
      );
    }

    for (const tool of scenario.simulated_tools) {
      assert.ok(allowedSimulatedTools.has(tool), `unsupported simulated tool ${tool}`);
    }

    assert.ok(scenario.expected_policy_actions.length >= 1);
    for (const action of scenario.expected_policy_actions) {
      assert.ok(allowedPolicyActions.has(action), `unsupported policy action ${action}`);
    }
  }

  assertNoPlaceholderText(manifest, "manifest");
});

test("REQ-T1-SCENARIO-002 documents every scenario in the human-readable acceptance matrix", () => {
  const manifest = readManifest();

  assert.ok(existsSync(matrixPath), "Track 1 scenario acceptance matrix should exist");
  assert.ok(existsSync(scenarioReadmePath), "Track 1 scenario README should exist");

  const matrix = readFileSync(matrixPath, "utf8");
  const readme = readFileSync(scenarioReadmePath, "utf8");

  for (const scenario of manifest.scenarios) {
    assert.ok(matrix.includes(scenario.scenario_id), `matrix should include ${scenario.scenario_id}`);
    assert.ok(matrix.includes(scenario.attack_class), `matrix should include ${scenario.attack_class}`);
    assert.ok(matrix.includes(scenario.report_section), `matrix should include ${scenario.report_section}`);
    assertIncludesAll(
      matrix,
      scenario.case_requirements.required_case_types,
      `matrix case requirements for ${scenario.scenario_id}`
    );
    assert.ok(
      matrix.includes(scenario.case_requirements.expected_case_file_pattern),
      `matrix should include ${scenario.case_requirements.expected_case_file_pattern}`
    );
    assert.ok(
      matrix.includes(scenario.attack_script_requirements.entrypoint),
      `matrix should include ${scenario.attack_script_requirements.entrypoint}`
    );
    assertIncludesAll(
      matrix,
      scenario.attack_script_requirements.required_events,
      `matrix attack script events for ${scenario.scenario_id}`
    );
    assertIncludesAll(
      matrix,
      scenario.attack_script_requirements.prohibited_behaviors,
      `matrix prohibited behaviors for ${scenario.scenario_id}`
    );
    assertIncludesAll(matrix, scenario.simulated_tools, `matrix simulated tools for ${scenario.scenario_id}`);
    assertIncludesAll(matrix, scenario.expected_policy_actions, `matrix policy actions for ${scenario.scenario_id}`);
    assertIncludesAll(matrix, scenario.evidence_requirements, `matrix evidence requirements for ${scenario.scenario_id}`);

    assert.ok(readme.includes(scenario.scenario_id), `README should include ${scenario.scenario_id}`);
    assert.ok(
      readme.includes(scenario.case_requirements.expected_case_file_pattern) ||
        readme.includes(`samples/track1/cases/${scenario.scenario_id}/`),
      `README should include ${scenario.case_requirements.expected_case_file_pattern} or the scenario case directory`
    );
    assert.ok(
      readme.includes(scenario.attack_script_requirements.entrypoint),
      `README should include ${scenario.attack_script_requirements.entrypoint}`
    );
  }

  assertIncludesAll(readme, Array.from(requiredProhibitedBehaviors), "README prohibited behaviors");

  for (const requiredHeading of [
    "Scenario Acceptance Matrix",
    "Case Requirements",
    "Attack Script Requirements",
    "Simulated Tools",
    "Expected Policy Actions",
    "Report Evidence"
  ]) {
    assert.ok(matrix.includes(requiredHeading), `matrix should include section ${requiredHeading}`);
  }

  assert.ok(readme.includes("controlled research fixtures"));
  assert.ok(readme.includes("Do not store real credentials"));
  assert.ok(readme.includes("real external API calls"));
  assert.ok(readme.includes("track1-scenarios.v1.json"));
  assertDoesNotInclude(JSON.stringify(manifest), prohibitedWeakerBehaviorLabel, "manifest");
  assertDoesNotInclude(matrix, prohibitedWeakerBehaviorLabel, "matrix");
  assertDoesNotInclude(readme, prohibitedWeakerBehaviorLabel, "README");
  assertNoPlaceholderText(matrix, "matrix");
  assertNoPlaceholderText(readme, "readme");
});
