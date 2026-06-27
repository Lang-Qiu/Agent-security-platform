import type { BaseResult } from "../../../../shared/types/result.ts";
import type { SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import type { SandboxPolicyAction } from "../../../../shared/types/sandbox.ts";
import type { SimulatedToolName } from "../simulated-tools/contract.ts";

// -- scenario identity ---------------------------------------------------

export const TRACK1_SCENARIO_IDS = [
  "T1-SC-001",
  "T1-SC-002",
  "T1-SC-003"
] as const;

export type Track1ScenarioId = (typeof TRACK1_SCENARIO_IDS)[number];

// -- evidence vocabulary -------------------------------------------------

export const TRACK1_REPLAY_EVIDENCE_REQUIREMENTS = [
  "prompt_sample_ref",
  "filter_decision",
  "policy_decision",
  "tool_request_ref",
  "memory_entry_ref",
  "sandbox_alert",
  "blocked_record",
  "report_evidence_ref"
] as const;

export type Track1ReplayEvidenceRequirement =
  (typeof TRACK1_REPLAY_EVIDENCE_REQUIREMENTS)[number];

// -- case classification -------------------------------------------------

export type Track1TestCategory = "adversarial" | "jailbreak" | "negative_control";

export type Track1ToolDisposition = "must_not_execute" | "not_requested";

// -- error taxonomy ------------------------------------------------------

export type Track1ReplayErrorCode =
  | "case_not_found"
  | "case_invalid"
  | "scenario_mismatch"
  | "manifest_mismatch"
  | "unsupported_evidence_requirement"
  | "unsafe_tool_execution_requested"
  | "replay_result_invalid";

export class Track1ReplayError extends Error {
  readonly code: Track1ReplayErrorCode;

  constructor(code: Track1ReplayErrorCode, message: string) {
    super(message);
    this.name = "Track1ReplayError";
    this.code = code;
  }
}

// -- evidence check materialization --------------------------------------

export interface Track1ReplayEvidenceCheck {
  requirement: Track1ReplayEvidenceRequirement;
  observation: "present" | "absent";
  evidence_ref: string;
}

// -- replay metadata (attached to result.metadata.replay) -----------------

export interface Track1ReplayMetadata {
  schema_version: "track1-replay.v1";
  scenario_id: Track1ScenarioId;
  case_id: string;
  test_category: Track1TestCategory;
  expected_policy_action: SandboxPolicyAction;
  evidence_checks: Track1ReplayEvidenceCheck[];
}

// -- case fixture shape --------------------------------------------------

export interface Track1CaseFixtureMemoryEntry {
  memory_id: string;
  content: string;
}

export interface Track1CaseFixtureProposedToolCall {
  tool_name: SimulatedToolName;
  arguments: Record<string, string | Record<string, string>>;
}

export interface Track1CaseFixtureToolBehavior {
  disposition: Track1ToolDisposition;
  tools: SimulatedToolName[];
}

export interface Track1CaseFixtureInput {
  user_prompt: string;
  retrieved_content: string[];
  memory_entries: Track1CaseFixtureMemoryEntry[];
  proposed_tool_call: Track1CaseFixtureProposedToolCall | null;
}

export interface Track1CaseFixtureExpectedOutcome {
  model_behavior: string;
  prohibited_model_behaviors: string[];
  policy_action: SandboxPolicyAction;
  tool_behavior: Track1CaseFixtureToolBehavior;
  evidence_requirements: Track1ReplayEvidenceRequirement[];
}

export interface Track1CaseFixtureSafety {
  mode: "controlled_research";
  synthetic_only: true;
  network_access: "none";
  prohibited_behaviors: string[];
}

export interface Track1CaseFixture {
  schema_version: "track1-case.v1";
  case_id: string;
  scenario_id: Track1ScenarioId;
  title: string;
  case_type: string;
  test_category: Track1TestCategory;
  input: Track1CaseFixtureInput;
  expected_outcome: Track1CaseFixtureExpectedOutcome;
  safety: Track1CaseFixtureSafety;
}

// -- scenario definition consumed by replay -------------------------------

export interface Track1ScenarioDefinition {
  scenario_id: Track1ScenarioId;
  title: string;
  attack_class: string;
  objective: string;
  research_boundary: string;
  attack_script_requirements: {
    entrypoint: string;
    required_events: string[];
    prohibited_behaviors: string[];
  };
  simulated_tools: string[];
  expected_policy_actions: string[];
  evidence_requirements: string[];
}

// -- loader bundle -------------------------------------------------------

export interface Track1ReplayScenarioBundle {
  scenario: Track1ScenarioDefinition;
  cases: Track1CaseFixture[];
}

// -- entrypoint ports ----------------------------------------------------

export interface Track1ReplayEntrypointPorts {
  run(
    scenarioId: Track1ScenarioId
  ): BaseResult<SandboxRunResultDetails>[];
  writeStdout(value: string): void;
  writeStderr(value: string): void;
  setExitCode(value: number): void;
}
