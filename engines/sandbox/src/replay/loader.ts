import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

import {
  SANDBOX_EVENT_TYPES,
  SANDBOX_POLICY_ACTIONS
} from "../../../../shared/types/sandbox.ts";
import {
  SIMULATED_TOOL_NAMES,
  normalizeSimulatedToolRequest
} from "../simulated-tools/contract.ts";
import type { SimulatedToolRequest } from "../simulated-tools/contract.ts";
import {
  TRACK1_REPLAY_EVIDENCE_REQUIREMENTS,
  TRACK1_SCENARIO_IDS,
  Track1ReplayError
} from "./contract.ts";
import type {
  Track1CaseFixture,
  Track1ScenarioDefinition,
  Track1ScenarioId,
  Track1ReplayScenarioBundle
} from "./contract.ts";

// -- repository root derivation ------------------------------------------

const REPLAY_DIR = import.meta.dirname;
// engines/sandbox/src/replay -> repo root (4 levels up)
const REPO_ROOT = resolve(REPLAY_DIR, "..", "..", "..", "..");

// -- fixed paths ---------------------------------------------------------

const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "samples",
  "track1",
  "scenarios",
  "track1-scenarios.v1.json"
);

function caseDirPath(scenarioId: Track1ScenarioId): string {
  return resolve(REPO_ROOT, "samples", "track1", "cases", scenarioId);
}

// -- closed enums --------------------------------------------------------

const VALID_SCHEMA_VERSION = "track1-case.v1";
const VALID_MANIFEST_VERSION = "track1-scenarios.v1";

const VALID_TEST_CATEGORIES = ["adversarial", "jailbreak", "negative_control"] as const;

const VALID_TOOL_DISPOSITIONS = ["must_not_execute", "not_requested"] as const;

const VALID_SAFETY_MODE = "controlled_research";

const VALID_PROHIBITED_BEHAVIORS = [
  "real credential use",
  "real external API calls",
  "real email delivery",
  "external exfiltration",
  "third-party targeting"
] as const;

const CASE_ID_PATTERN = /^T1-SC-\d{3}-C\d{3}$/;

// -- helpers -------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown
): value is T {
  return isString(value) && (allowed as readonly string[]).includes(value);
}

function hasOnlyKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  return keys.every((k) => (allowed as readonly string[]).includes(k));
}

// -- fixture validation --------------------------------------------------

function validateMemoryEntry(
  value: unknown,
  caseId: string
): asserts value is { memory_id: string; content: string } {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: memory entry must be a plain object`
    );
  }
  if (!hasOnlyKeys(value, ["memory_id", "content"])) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: memory entry must have exactly memory_id and content`
    );
  }
  if (!isNonEmptyString(value.memory_id)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: memory entry memory_id must be a non-empty string`
    );
  }
  if (!isNonEmptyString(value.content)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: memory entry content must be a non-empty string`
    );
  }
}

function validateProposedToolCall(
  value: unknown,
  caseId: string
): asserts value is {
  tool_name: string;
  arguments: Record<string, string | Record<string, string>>;
} {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: proposed_tool_call must be a plain object`
    );
  }
  if (!hasOnlyKeys(value, ["tool_name", "arguments"])) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: proposed_tool_call must have exactly tool_name and arguments`
    );
  }
  if (!isNonEmptyString(value.tool_name)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: proposed_tool_call.tool_name must be a non-empty string`
    );
  }
  if (!isPlainObject(value.arguments)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: proposed_tool_call.arguments must be a plain object`
    );
  }

  // Validate via normalizeSimulatedToolRequest (construct a synthetic request)
  const syntheticRequest: Record<string, unknown> = {
    call_id: `replay-validate-${caseId}`,
    session_id: `replay-session-${caseId}`,
    scenario_id: caseId.slice(0, 9), // T1-SC-NNN (9 chars)
    case_id: caseId,
    tool_name: value.tool_name,
    arguments: value.arguments
  };

  const normalized = normalizeSimulatedToolRequest(syntheticRequest);
  if (!normalized) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: proposed_tool_call failed tool normalization`
    );
  }
}

function validateToolBehavior(
  value: unknown,
  caseId: string
): asserts value is {
  disposition: string;
  tools: string[];
} {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: tool_behavior must be a plain object`
    );
  }
  if (!hasOnlyKeys(value, ["disposition", "tools"])) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: tool_behavior must have exactly disposition and tools`
    );
  }
  if (!isOneOf(VALID_TOOL_DISPOSITIONS, value.disposition)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: tool_behavior.disposition must be must_not_execute or not_requested`
    );
  }
  if (!isStringArray(value.tools)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: tool_behavior.tools must be a string array`
    );
  }
  const seenTools = new Set<string>();
  for (const tool of value.tools) {
    if (!(SIMULATED_TOOL_NAMES as readonly string[]).includes(tool)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: unknown tool in tool_behavior.tools: ${tool}`
      );
    }
    if (seenTools.has(tool)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: duplicate tool in tool_behavior.tools: ${tool}`
      );
    }
    seenTools.add(tool);
  }
}

function validateSafety(
  value: unknown,
  caseId: string
): asserts value is {
  mode: string;
  synthetic_only: boolean;
  network_access: string;
  prohibited_behaviors: string[];
} {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety must be a plain object`
    );
  }
  if (!hasOnlyKeys(value, ["mode", "synthetic_only", "network_access", "prohibited_behaviors"])) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety must have exactly mode, synthetic_only, network_access, prohibited_behaviors`
    );
  }
  if (value.mode !== VALID_SAFETY_MODE) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety.mode must be controlled_research`
    );
  }
  if (value.synthetic_only !== true) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety.synthetic_only must be true`
    );
  }
  if (value.network_access !== "none") {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety.network_access must be none`
    );
  }
  if (!isStringArray(value.prohibited_behaviors)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety.prohibited_behaviors must be a string array`
    );
  }
  if (value.prohibited_behaviors.length !== VALID_PROHIBITED_BEHAVIORS.length) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: safety.prohibited_behaviors must have exactly 5 entries`
    );
  }
  const seen = new Set<string>();
  for (const behavior of value.prohibited_behaviors) {
    if (!(VALID_PROHIBITED_BEHAVIORS as readonly string[]).includes(behavior)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: safety.prohibited_behaviors contains unknown value: ${behavior}`
      );
    }
    if (seen.has(behavior)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: duplicate prohibited_behavior: ${behavior}`
      );
    }
    seen.add(behavior);
  }
}

function validateExpectedOutcome(
  value: unknown,
  caseId: string
): asserts value is {
  model_behavior: string;
  prohibited_model_behaviors: string[];
  policy_action: string;
  tool_behavior: Record<string, unknown>;
  evidence_requirements: string[];
} {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome must be a plain object`
    );
  }
  if (
    !hasOnlyKeys(value, [
      "model_behavior",
      "prohibited_model_behaviors",
      "policy_action",
      "tool_behavior",
      "evidence_requirements"
    ])
  ) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome has unexpected keys`
    );
  }
  if (!isNonEmptyString(value.model_behavior)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome.model_behavior must be a non-empty string`
    );
  }
  if (!isStringArray(value.prohibited_model_behaviors)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome.prohibited_model_behaviors must be a string array`
    );
  }
  if (value.prohibited_model_behaviors.length === 0) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: prohibited_model_behaviors must not be empty`
    );
  }
  for (const behavior of value.prohibited_model_behaviors) {
    if (!isNonEmptyString(behavior)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: prohibited_model_behaviors entries must be non-empty strings`
      );
    }
  }
  if (!isOneOf(SANDBOX_POLICY_ACTIONS, value.policy_action)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome.policy_action must be a valid SandboxPolicyAction`
    );
  }
  validateToolBehavior(value.tool_behavior, caseId);

  if (!isStringArray(value.evidence_requirements)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: expected_outcome.evidence_requirements must be a string array`
    );
  }
  if (value.evidence_requirements.length === 0) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: evidence_requirements must not be empty`
    );
  }
  for (const req of value.evidence_requirements) {
    if (
      !(TRACK1_REPLAY_EVIDENCE_REQUIREMENTS as readonly string[]).includes(req)
    ) {
      throw new Track1ReplayError(
        "unsupported_evidence_requirement",
        `${caseId}: unsupported evidence requirement: ${req}`
      );
    }
  }
}

function validateInput(
  value: unknown,
  caseId: string
): asserts value is {
  user_prompt: string;
  retrieved_content: string[];
  memory_entries: unknown[];
  proposed_tool_call: unknown;
} {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: input must be a plain object`
    );
  }
  if (
    !hasOnlyKeys(value, [
      "user_prompt",
      "retrieved_content",
      "memory_entries",
      "proposed_tool_call"
    ])
  ) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: input has unexpected keys`
    );
  }
  if (!isNonEmptyString(value.user_prompt)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: input.user_prompt must be a non-empty string`
    );
  }
  if (!isStringArray(value.retrieved_content)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: input.retrieved_content must be a string array`
    );
  }
  for (const item of value.retrieved_content) {
    if (!isNonEmptyString(item)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${caseId}: retrieved_content entries must be non-empty strings`
      );
    }
  }
  if (!Array.isArray(value.memory_entries)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: input.memory_entries must be an array`
    );
  }
  for (const entry of value.memory_entries) {
    validateMemoryEntry(entry, caseId);
  }
  // proposed_tool_call can be null or a valid object
  if (value.proposed_tool_call !== null) {
    validateProposedToolCall(value.proposed_tool_call, caseId);
  }
}

// -- cross-field constraints ---------------------------------------------

function validateCrossFieldConstraints(
  fixture: Track1CaseFixture
): void {
  const { case_id, test_category, expected_outcome } = fixture;
  const { policy_action, tool_behavior, evidence_requirements } = expected_outcome;

  // Negative controls: allow + not_requested, tools must be empty
  if (test_category === "negative_control") {
    if (policy_action !== "allow") {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: negative_control must have policy_action allow`
      );
    }
    if (tool_behavior.disposition !== "not_requested") {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: negative_control must have disposition not_requested`
      );
    }
    if (tool_behavior.tools.length !== 0) {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: negative_control must have empty tools array`
      );
    }
  }

  // Non-negative controls: non-allow + must_not_execute
  if (test_category !== "negative_control") {
    if (policy_action === "allow") {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: non-negative control must have non-allow policy_action`
      );
    }
    if (tool_behavior.disposition !== "must_not_execute") {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: non-negative control must have disposition must_not_execute`
      );
    }
  }

  // Evidence uniqueness
  const seenEvidence = new Set<string>();
  for (const req of evidence_requirements) {
    if (seenEvidence.has(req)) {
      throw new Track1ReplayError(
        "case_invalid",
        `${case_id}: duplicate evidence requirement: ${req}`
      );
    }
    seenEvidence.add(req);
  }
}

// -- public API ----------------------------------------------------------

export function parseTrack1CaseFixture(
  value: unknown,
  expectedScenarioId: Track1ScenarioId
): Track1CaseFixture {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError("case_invalid", "case fixture must be a plain object");
  }

  // Reject extra keys at root level
  const rootKeys = [
    "schema_version",
    "case_id",
    "scenario_id",
    "title",
    "case_type",
    "test_category",
    "input",
    "expected_outcome",
    "safety"
  ];
  if (!hasOnlyKeys(value, rootKeys)) {
    throw new Track1ReplayError(
      "case_invalid",
      "case fixture has unexpected root keys"
    );
  }

  // schema_version
  if (value.schema_version !== VALID_SCHEMA_VERSION) {
    throw new Track1ReplayError(
      "case_invalid",
      `expected schema_version ${VALID_SCHEMA_VERSION}, got ${String(value.schema_version)}`
    );
  }

  // case_id
  if (!isNonEmptyString(value.case_id)) {
    throw new Track1ReplayError("case_invalid", "case_id must be a non-empty string");
  }
  if (!CASE_ID_PATTERN.test(value.case_id)) {
    throw new Track1ReplayError(
      "case_invalid",
      `case_id must match T1-SC-NNN-CNNN pattern, got ${value.case_id}`
    );
  }
  const caseId = value.case_id;

  // scenario_id
  if (!isNonEmptyString(value.scenario_id)) {
    throw new Track1ReplayError("case_invalid", `${caseId}: scenario_id must be a non-empty string`);
  }
  if (value.scenario_id !== expectedScenarioId) {
    throw new Track1ReplayError(
      "scenario_mismatch",
      `${caseId}: expected scenario_id ${expectedScenarioId}, got ${value.scenario_id}`
    );
  }

  // case_id must match pattern ^<expectedScenarioId>-C\d{3}$
  const expectedCasePrefix = `${expectedScenarioId}-C`;
  if (!caseId.startsWith(expectedCasePrefix)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: case_id must start with ${expectedScenarioId}-C`
    );
  }

  // title
  if (!isNonEmptyString(value.title)) {
    throw new Track1ReplayError("case_invalid", `${caseId}: title must be a non-empty string`);
  }

  // case_type
  if (!isNonEmptyString(value.case_type)) {
    throw new Track1ReplayError("case_invalid", `${caseId}: case_type must be a non-empty string`);
  }

  // test_category
  if (!isOneOf(VALID_TEST_CATEGORIES, value.test_category)) {
    throw new Track1ReplayError(
      "case_invalid",
      `${caseId}: test_category must be one of adversarial, jailbreak, negative_control`
    );
  }

  // Validate nested objects
  validateInput(value.input, caseId);
  validateExpectedOutcome(value.expected_outcome, caseId);
  validateSafety(value.safety, caseId);

  // Construct the fixture (defensive copy)
  const input = value.input as Record<string, unknown>;
  const expectedOutcome = value.expected_outcome as Record<string, unknown>;
  const toolBehavior = expectedOutcome.tool_behavior as Record<string, unknown>;
  const safety = value.safety as Record<string, unknown>;

  const memoryEntries = (input.memory_entries as unknown[]).map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      memory_id: e.memory_id as string,
      content: e.content as string
    };
  });

  let proposedToolCall = null;
  if (input.proposed_tool_call !== null) {
    const ptc = input.proposed_tool_call as Record<string, unknown>;
    proposedToolCall = {
      tool_name: ptc.tool_name as SimulatedToolRequest["tool_name"],
      arguments: ptc.arguments as Record<string, string | Record<string, string>>
    };
  }

  const fixture: Track1CaseFixture = {
    schema_version: value.schema_version as "track1-case.v1",
    case_id: caseId,
    scenario_id: value.scenario_id as Track1ScenarioId,
    title: value.title as string,
    case_type: value.case_type as string,
    test_category: value.test_category as "adversarial" | "jailbreak" | "negative_control",
    input: {
      user_prompt: input.user_prompt as string,
      retrieved_content: [...(input.retrieved_content as string[])],
      memory_entries: memoryEntries,
      proposed_tool_call: proposedToolCall
    },
    expected_outcome: {
      model_behavior: expectedOutcome.model_behavior as string,
      prohibited_model_behaviors: [
        ...(expectedOutcome.prohibited_model_behaviors as string[])
      ],
      policy_action: expectedOutcome.policy_action as Track1CaseFixture["expected_outcome"]["policy_action"],
      tool_behavior: {
        disposition: toolBehavior.disposition as "must_not_execute" | "not_requested",
        tools: [...(toolBehavior.tools as string[])]
      },
      evidence_requirements: [
        ...(expectedOutcome.evidence_requirements as string[])
      ]
    },
    safety: {
      mode: safety.mode as "controlled_research",
      synthetic_only: safety.synthetic_only as true,
      network_access: safety.network_access as "none",
      prohibited_behaviors: [...(safety.prohibited_behaviors as string[])]
    }
  };

  // Cross-field constraints
  validateCrossFieldConstraints(fixture);

  return fixture;
}

// -- manifest validation -------------------------------------------------

const VALID_SANDBOX_EVENT_TYPES = SANDBOX_EVENT_TYPES as readonly string[];

function validateScenarioDefinition(
  value: unknown
): asserts value is Track1ScenarioDefinition {
  if (!isPlainObject(value)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      "scenario definition must be a plain object"
    );
  }
  if (!isNonEmptyString(value.scenario_id)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      "scenario must have a non-empty scenario_id"
    );
  }
  if (
    !(TRACK1_SCENARIO_IDS as readonly string[]).includes(value.scenario_id)
  ) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `unknown scenario_id: ${String(value.scenario_id)}`
    );
  }
  if (!isNonEmptyString(value.title)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: title must be a non-empty string`
    );
  }

  // attack_script_requirements
  if (!isPlainObject(value.attack_script_requirements)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: attack_script_requirements must be a plain object`
    );
  }
  const asr = value.attack_script_requirements as Record<string, unknown>;
  if (!isNonEmptyString(asr.entrypoint)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: entrypoint must be a non-empty string`
    );
  }
  // Validate entrypoint must exactly match the scenario-bound path
  const expectedEntrypoint = `samples/track1/attack-scripts/${String(value.scenario_id)}/replay.ts`;
  if (asr.entrypoint !== expectedEntrypoint) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: entrypoint must be exactly ${expectedEntrypoint}, got ${String(asr.entrypoint)}`
    );
  }
  if (!isStringArray(asr.required_events)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: required_events must be a string array`
    );
  }
  for (const event of asr.required_events) {
    if (!VALID_SANDBOX_EVENT_TYPES.includes(event)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${value.scenario_id}: unsupported required event: ${event}`
      );
    }
  }
  if (!isStringArray(asr.prohibited_behaviors)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: prohibited_behaviors must be a string array`
    );
  }
  for (const behavior of asr.prohibited_behaviors) {
    if (!(VALID_PROHIBITED_BEHAVIORS as readonly string[]).includes(behavior)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${value.scenario_id}: unsupported prohibited behavior: ${behavior}`
      );
    }
  }

  // simulated_tools
  if (!isStringArray(value.simulated_tools)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: simulated_tools must be a string array`
    );
  }
  for (const tool of value.simulated_tools) {
    if (!(SIMULATED_TOOL_NAMES as readonly string[]).includes(tool)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${value.scenario_id}: unknown simulated tool: ${tool}`
      );
    }
  }

  // expected_policy_actions
  if (!isStringArray(value.expected_policy_actions)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: expected_policy_actions must be a string array`
    );
  }
  for (const action of value.expected_policy_actions) {
    if (!(SANDBOX_POLICY_ACTIONS as readonly string[]).includes(action)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${value.scenario_id}: unknown policy action: ${action}`
      );
    }
  }

  // evidence_requirements
  if (!isStringArray(value.evidence_requirements)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${value.scenario_id}: evidence_requirements must be a string array`
    );
  }
  for (const req of value.evidence_requirements) {
    if (!(TRACK1_REPLAY_EVIDENCE_REQUIREMENTS as readonly string[]).includes(req)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        `${value.scenario_id}: unsupported evidence requirement: ${req}`
      );
    }
  }
}

// -- scenario loading ----------------------------------------------------

function readJsonFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Track1ReplayError("case_not_found", `cannot read file: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Track1ReplayError("case_invalid", `invalid JSON in: ${path}`);
  }
  return parsed;
}

function loadManifest(): Track1ScenarioDefinition[] {
  const raw = readJsonFile(MANIFEST_PATH);

  if (!isPlainObject(raw)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      "manifest must be a plain object"
    );
  }

  if (raw.version !== VALID_MANIFEST_VERSION) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `manifest version must be ${VALID_MANIFEST_VERSION}`
    );
  }

  if (!Array.isArray(raw.scenarios)) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      "manifest must have a scenarios array"
    );
  }

  const scenarios = raw.scenarios as unknown[];
  if (scenarios.length !== 3) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `manifest must have exactly 3 scenarios, got ${scenarios.length}`
    );
  }

  // Check for duplicate scenario IDs
  const ids = scenarios.map((s) => {
    if (!isPlainObject(s) || !isString(s.scenario_id)) {
      throw new Track1ReplayError(
        "manifest_mismatch",
        "each scenario must have a scenario_id"
      );
    }
    return s.scenario_id;
  });
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      "duplicate scenario_id in manifest"
    );
  }

  for (const scenario of scenarios) {
    validateScenarioDefinition(scenario);
  }

  return scenarios as Track1ScenarioDefinition[];
}

function loadCasesForScenario(
  scenarioId: Track1ScenarioId
): Track1CaseFixture[] {
  const dir = caseDirPath(scenarioId);

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Track1ReplayError(
      "case_not_found",
      `case directory not found: ${dir}`
    );
  }

  const jsonFiles = entries
    .filter((e) => e.endsWith(".json"))
    .sort();

  if (jsonFiles.length !== 3) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${scenarioId}: expected 3 case files, found ${jsonFiles.length}`
    );
  }

  const cases = jsonFiles.map((file) => {
    const path = resolve(dir, file);
    const raw = readJsonFile(path);
    return parseTrack1CaseFixture(raw, scenarioId);
  });

  // Check for duplicate case IDs
  const caseIds = cases.map((c) => c.case_id);
  const caseIdSet = new Set(caseIds);
  if (caseIdSet.size !== caseIds.length) {
    throw new Track1ReplayError(
      "manifest_mismatch",
      `${scenarioId}: duplicate case_id found`
    );
  }

  // Sort by case_id
  cases.sort((a, b) => a.case_id.localeCompare(b.case_id));

  return cases;
}

let manifestCache: Track1ScenarioDefinition[] | null = null;

function getManifest(): Track1ScenarioDefinition[] {
  if (!manifestCache) {
    manifestCache = loadManifest();
  }
  return manifestCache;
}

export function loadTrack1ReplayScenario(
  scenarioId: Track1ScenarioId
): Track1ReplayScenarioBundle {
  const manifest = getManifest();
  const scenario = manifest.find((s) => s.scenario_id === scenarioId);

  if (!scenario) {
    throw new Track1ReplayError(
      "case_not_found",
      `scenario not found in manifest: ${scenarioId}`
    );
  }

  const cases = loadCasesForScenario(scenarioId);

  return { scenario, cases };
}
