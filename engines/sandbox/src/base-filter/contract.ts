import type { SandboxPolicyAction } from "../../../../shared/types/sandbox.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import type { SimulatedToolRequest } from "../simulated-tools/contract.ts";

// -- stable constants ------------------------------------------------------

export const TRACK1_FILTER_CONTEXT_SCHEMA_VERSION =
  "track1-filter-context.v1" as const;
export const TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION =
  "track1-base-filter-evaluation.v1" as const;
export const TRACK1_BASE_FILTER_POLICY_ID =
  "policy://track1/base-filter/v1" as const;

// -- source taxonomy -------------------------------------------------------

export type Track1FilterSource =
  | "user_prompt"
  | "retrieved_content"
  | "memory_content"
  | "model_output"
  | "tool_name"
  | "tool_target"
  | "tool_arguments";

export type Track1FilterOperator =
  | "contains_any"
  | "contains_all"
  | "equals_any";

export type Track1FilterCategory =
  | "jailbreak"
  | "prompt_injection"
  | "sensitive_data"
  | "tool_hijacking"
  | "protected_resource"
  | "memory_poisoning"
  | "sensitive_capability";

// -- context envelope ------------------------------------------------------

export interface Track1FilterMemoryEntry {
  memory_id: string;
  content: string;
}

export interface Track1FilterContextEnvelope {
  schema_version: "track1-filter-context.v1";
  user_prompt: string;
  retrieved_content: string[];
  memory_entries: Track1FilterMemoryEntry[];
}

export interface Track1FilterContextInput {
  user_prompt: string;
  retrieved_content: readonly string[];
  memory_entries: readonly Track1FilterMemoryEntry[];
}

// -- rule model ------------------------------------------------------------

export interface Track1FilterCondition {
  source: Track1FilterSource;
  operator: Track1FilterOperator;
  values: string[];
}

export interface Track1FilterRule {
  rule_id: string;
  stages: ("model_output" | "tool_request")[];
  category: Track1FilterCategory;
  action: "deny" | "ask" | "alert";
  reason_code: string;
  reason: string;
  conditions: Track1FilterCondition[];
}

// -- match model -----------------------------------------------------------

export interface Track1FilterMatch {
  rule_id: string;
  stage: "model_output" | "tool_request";
  category: Track1FilterCategory;
  action: "deny" | "ask" | "alert";
  reason_code: string;
}

// -- evaluation input / result ---------------------------------------------

export interface Track1FilterEvaluationInput {
  stage: "model_output" | "tool_request";
  context: Track1FilterContextEnvelope;
  model_output: string;
  tool_request?: SimulatedToolRequest;
}

export interface Track1FilterEvaluationResult {
  action: "allow" | "deny" | "ask" | "alert";
  winner: Track1FilterMatch | null;
  matches: Track1FilterMatch[];
}

// -- case run / evaluation -------------------------------------------------

export type Track1ScenarioId = "T1-SC-001" | "T1-SC-002" | "T1-SC-003";
export type Track1TestCategory = "adversarial" | "jailbreak" | "negative_control";

export interface Track1BaseFilterCaseRun {
  case_id: string;
  scenario_id: Track1ScenarioId;
  test_category: Track1TestCategory;
  expected_action: SandboxPolicyAction;
  result: BaseResult<SandboxRunResultDetails>;
}

export interface Track1BaseFilterCaseEvaluation {
  case_id: string;
  expected_action: SandboxPolicyAction;
  actual_action: SandboxPolicyAction;
  terminal_stage: "model_output" | "tool_request";
  matched_rule_ids: string[];
  passed: boolean;
}

export interface Track1BaseFilterSummary {
  total_cases: number;
  exact_matches: number;
  exact_action_accuracy: number;
  unsafe_case_count: number;
  unsafe_case_recall: number;
  negative_control_count: number;
  negative_control_false_positive_rate: number;
}

export interface Track1BaseFilterDemoReport {
  schema_version: "track1-base-filter-evaluation.v1";
  summary: Track1BaseFilterSummary;
  cases: Track1BaseFilterCaseEvaluation[];
  results: BaseResult<SandboxRunResultDetails>[];
}

// -- error taxonomy --------------------------------------------------------

export type Track1BaseFilterErrorCode =
  | "base_filter_context_invalid"
  | "base_filter_rule_invalid"
  | "base_filter_catalog_invalid"
  | "base_filter_evaluation_invalid"
  | "base_filter_result_invalid";

const ERROR_MESSAGES: Record<Track1BaseFilterErrorCode, string> = {
  base_filter_context_invalid: "Base-filter context is invalid",
  base_filter_rule_invalid: "Base-filter rule is invalid",
  base_filter_catalog_invalid: "Base-filter catalog is invalid",
  base_filter_evaluation_invalid: "Base-filter evaluation is invalid",
  base_filter_result_invalid: "Base-filter result is invalid"
};

export class Track1BaseFilterError extends Error {
  readonly code: Track1BaseFilterErrorCode;

  constructor(code: Track1BaseFilterErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "Track1BaseFilterError";
    this.code = code;
  }
}
