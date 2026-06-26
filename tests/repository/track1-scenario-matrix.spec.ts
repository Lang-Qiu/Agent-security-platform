import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(repoRoot, "samples/track1/scenarios/track1-scenarios.v1.json");

const requiredAttackClasses = new Set([
  "prompt_injection_jailbreak",
  "tool_call_hijacking",
  "context_memory_poisoning"
]);

const requiredScenarioIds = new Set(["T1-SC-001", "T1-SC-002", "T1-SC-003"]);
const allowedPolicyActions = new Set(["allow", "deny", "ask", "alert"]);
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
    assert.ok(scenario.attack_script_requirements.prohibited_behaviors.includes("real credential use"));
    assert.ok(scenario.simulated_tools.length >= 1);
    assert.ok(scenario.evidence_requirements.includes("sandbox_alert"));
    assert.ok(scenario.evidence_requirements.includes("report_evidence_ref"));
    assert.ok(scenario.report_section.startsWith("Track 1 Scenario"));

    assert.ok(scenario.expected_policy_actions.length >= 1);
    for (const action of scenario.expected_policy_actions) {
      assert.ok(allowedPolicyActions.has(action), `unsupported policy action ${action}`);
    }
  }

  assertNoPlaceholderText(manifest, "manifest");
});
