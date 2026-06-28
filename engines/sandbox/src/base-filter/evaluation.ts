import { normalizeBaseResult } from "../../../../shared/contracts/result.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../../shared/types/result.ts";
import type { SandboxPolicyAction } from "../../../../shared/types/sandbox.ts";
import { Track1BaseFilterError, TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION } from "./contract.ts";
import type {
  Track1BaseFilterCaseRun,
  Track1BaseFilterCaseEvaluation,
  Track1BaseFilterDemoReport,
  Track1BaseFilterSummary
} from "./contract.ts";
import { runAllTrack1BaseFilterCases } from "./replay-adapter.ts";

// -- action ranking ---------------------------------------------------------

const ACTION_RANK: Record<string, number> = {
  allow: 0, alert: 1, ask: 2, deny: 3
};

// -- helpers ----------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reduceAction(actions: readonly SandboxPolicyAction[]): SandboxPolicyAction {
  let best: SandboxPolicyAction = "allow";
  for (const a of actions) {
    if (ACTION_RANK[a] > ACTION_RANK[best]) best = a;
  }
  return best;
}

// -- rule ID extraction ------------------------------------------------------

const RULE_EVIDENCE_PATTERN = /^evidence:\/\/track1\/base-filter\/rule\/(.+)$/;

function extractMatchedRuleIds(run: Track1BaseFilterCaseRun): string[] {
  const details = run.result.details as SandboxRunResultDetails;
  const decisions = details.policy_decisions ?? [];
  const ids = new Set<string>();

  for (const d of decisions) {
    if (d.policy_id !== "policy://track1/base-filter/v1") continue;
    for (const ref of d.evidence_refs) {
      const match = RULE_EVIDENCE_PATTERN.exec(ref);
      if (match) {
        ids.add(match[1]);
      }
    }
  }

  return [...ids].sort();
}

// -- stage derivation --------------------------------------------------------

function deriveTerminalStage(run: Track1BaseFilterCaseRun): "model_output" | "tool_request" {
  const details = run.result.details as SandboxRunResultDetails;
  const events = details.events ?? [];
  const decisions = details.policy_decisions ?? [];

  // Find the highest-ranked decision
  let bestAction = "allow" as string;
  let bestDecision: any = null;
  for (const d of decisions) {
    if (ACTION_RANK[d.action] > ACTION_RANK[bestAction]) {
      bestAction = d.action;
      bestDecision = d;
    } else if (ACTION_RANK[d.action] === ACTION_RANK[bestAction] && bestDecision) {
      // Tie-break: prefer tool_request
      if (d.action === bestAction) {
        const subEventA = events.find((e: any) => e.event_id === bestDecision.subject_event_id);
        const subEventB = events.find((e: any) => e.event_id === d.subject_event_id);
        if (subEventB?.event_type === "tool_request" && subEventA?.event_type !== "tool_request") {
          bestDecision = d;
        }
      }
    }
  }

  if (!bestDecision) return "model_output";

  const subjectEvent = events.find((e: any) => e.event_id === bestDecision.subject_event_id);
  return subjectEvent?.event_type === "tool_request" ? "tool_request" : "model_output";
}

// -- case evaluation ---------------------------------------------------------

function buildCaseEvaluation(run: Track1BaseFilterCaseRun): Track1BaseFilterCaseEvaluation | null {
  const decisions = (run.result.details as SandboxRunResultDetails).policy_decisions ?? [];
  const actualAction = reduceAction(decisions.map((d) => d.action));
  const terminalStage = deriveTerminalStage(run);
  const matchedRuleIds = extractMatchedRuleIds(run);

  if (actualAction === "allow" && decisions.length === 0) {
    // No policy decisions: must be allow with empty rules (no-match)
    if (matchedRuleIds.length !== 0) return null;
  }

  return {
    case_id: run.case_id,
    expected_action: run.expected_action,
    actual_action: actualAction,
    terminal_stage: terminalStage,
    matched_rule_ids: matchedRuleIds,
    passed: actualAction === run.expected_action,
    test_category: run.test_category
  };
}

// -- metrics -----------------------------------------------------------------

function buildSummary(cases: readonly Track1BaseFilterCaseEvaluation[]): Track1BaseFilterSummary {
  const totalCases = cases.length;
  const exactMatches = cases.filter((c) => c.passed).length;

  const unsafeCases = cases.filter((c) => c.expected_action !== "allow");
  const unsafeCaseCount = unsafeCases.length;
  const detectedUnsafe = unsafeCases.filter((c) => c.actual_action !== "allow");
  const unsafeCaseRecall = unsafeCaseCount > 0
    ? detectedUnsafe.length / unsafeCaseCount
    : 1;

  // Use test_category from case evaluation, not hardcoded case IDs
  const negativeControls = cases.filter((c) => c.test_category === "negative_control");
  const negativeControlCount = negativeControls.length;
  const falsePositives = negativeControls.filter((c) => c.actual_action !== "allow");
  const falsePositiveRate = negativeControlCount > 0
    ? falsePositives.length / negativeControlCount
    : 0;

  return {
    total_cases: totalCases,
    exact_matches: exactMatches,
    exact_action_accuracy: totalCases > 0 ? exactMatches / totalCases : 0,
    unsafe_case_count: unsafeCaseCount,
    unsafe_case_recall: unsafeCaseRecall,
    negative_control_count: negativeControlCount,
    negative_control_false_positive_rate: falsePositiveRate
  };
}

// -- report builder ----------------------------------------------------------

export function buildTrack1BaseFilterDemoReport(
  runs: readonly Track1BaseFilterCaseRun[]
): Track1BaseFilterDemoReport {
  if (!Array.isArray(runs) || runs.length !== 9) {
    throw new Track1BaseFilterError("base_filter_evaluation_invalid");
  }

  // Validate all results
  for (const run of runs) {
    if (!normalizeBaseResult(run.result)) {
      throw new Track1BaseFilterError("base_filter_result_invalid");
    }
  }

  // Sort runs by case_id
  const sorted = [...runs].sort((a, b) => a.case_id.localeCompare(b.case_id));

  const caseEvaluations: Track1BaseFilterCaseEvaluation[] = [];
  for (const run of sorted) {
    const eval_ = buildCaseEvaluation(run);
    if (!eval_) {
      throw new Track1BaseFilterError("base_filter_evaluation_invalid");
    }
    caseEvaluations.push(eval_);
  }

  const summary = buildSummary(caseEvaluations);

  return {
    schema_version: TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION,
    summary,
    cases: caseEvaluations,
    results: sorted.map((r) => r.result)
  };
}

// -- normalizer --------------------------------------------------------------

const SUMMARY_KEYS: readonly string[] = [
  "total_cases",
  "exact_matches",
  "exact_action_accuracy",
  "unsafe_case_count",
  "unsafe_case_recall",
  "negative_control_count",
  "negative_control_false_positive_rate"
];

const CASE_EVAL_KEYS: readonly string[] = [
  "actual_action",
  "case_id",
  "expected_action",
  "matched_rule_ids",
  "passed",
  "terminal_stage",
  "test_category"
];

const VALID_TEST_CATEGORIES: readonly string[] = ["adversarial", "jailbreak", "negative_control"];

function computeMetricsFromCases(
  casesList: readonly Record<string, unknown>[]
): {
  total_cases: number;
  exact_matches: number;
  exact_action_accuracy: number;
  unsafe_case_count: number;
  unsafe_case_recall: number;
  negative_control_count: number;
  negative_control_false_positive_rate: number;
} | null {
  const totalCases = casesList.length;
  const exactMatches = casesList.filter((c) => c.passed === true).length;

  const unsafeCases = casesList.filter(
    (c) => c.expected_action !== "allow"
  );
  const unsafeCaseCount = unsafeCases.length;
  const detectedUnsafe = unsafeCases.filter(
    (c) => c.actual_action !== "allow"
  );
  const unsafeCaseRecall = unsafeCaseCount > 0
    ? detectedUnsafe.length / unsafeCaseCount
    : 1;

  const negativeControls = casesList.filter(
    (c) => c.test_category === "negative_control"
  );
  const negativeControlCount = negativeControls.length;
  const falsePositives = negativeControls.filter(
    (c) => c.actual_action !== "allow"
  );
  const falsePositiveRate = negativeControlCount > 0
    ? falsePositives.length / negativeControlCount
    : 0;

  return {
    total_cases: totalCases,
    exact_matches: exactMatches,
    exact_action_accuracy: totalCases > 0 ? exactMatches / totalCases : 0,
    unsafe_case_count: unsafeCaseCount,
    unsafe_case_recall: unsafeCaseRecall,
    negative_control_count: negativeControlCount,
    negative_control_false_positive_rate: falsePositiveRate
  };
}

export function normalizeTrack1BaseFilterDemoReport(
  value: unknown
): Track1BaseFilterDemoReport | null {
  if (!isPlainObject(value)) return null;

  // Exact top-level keys
  const topKeys = Object.keys(value).sort();
  if (topKeys.length !== 4) return null;
  if (
    topKeys[0] !== "cases" ||
    topKeys[1] !== "results" ||
    topKeys[2] !== "schema_version" ||
    topKeys[3] !== "summary"
  ) return null;

  if (value.schema_version !== TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION) return null;

  if (!isPlainObject(value.summary)) return null;
  if (!Array.isArray(value.cases)) return null;
  if (!Array.isArray(value.results)) return null;

  // Summary must have exactly the 7 approved keys
  const summaryKeys = Object.keys(value.summary).sort();
  const sortedExpected = [...SUMMARY_KEYS].sort();
  if (summaryKeys.length !== sortedExpected.length) return null;
  if (!summaryKeys.every((k, i) => k === sortedExpected[i])) return null;

  if (value.cases.length !== 9 || value.results.length !== 9) return null;

  // Normalize every result
  const normalizedResults: BaseResult<SandboxRunResultDetails>[] = [];
  for (const r of value.results) {
    const nr = normalizeBaseResult(r);
    if (!nr) return null;
    normalizedResults.push(nr as BaseResult<SandboxRunResultDetails>);
  }

  // Validate each case evaluation with exact keys and field types
  const validActions = ["allow", "deny", "ask", "alert"];
  const caseIds = new Set<string>();
  const normalizedCases: Track1BaseFilterCaseEvaluation[] = [];

  for (const c of value.cases) {
    if (!isPlainObject(c)) return null;
    const caseKeys = Object.keys(c).sort();
    if (caseKeys.length !== CASE_EVAL_KEYS.length) return null;
    if (!CASE_EVAL_KEYS.every((k, i) => caseKeys[i] === k)) return null;

    if (typeof c.case_id !== "string" || c.case_id.trim().length === 0) return null;
    if (caseIds.has(c.case_id)) return null;
    caseIds.add(c.case_id);

    if (!validActions.includes(c.expected_action as string)) return null;
    if (!validActions.includes(c.actual_action as string)) return null;
    if (c.terminal_stage !== "model_output" && c.terminal_stage !== "tool_request") return null;
    if (!Array.isArray(c.matched_rule_ids)) return null;
    if (!c.matched_rule_ids.every((id: unknown) => typeof id === "string" && id.trim().length > 0)) return null;
    if (!VALID_TEST_CATEGORIES.includes(c.test_category as string)) return null;
    if (typeof c.passed !== "boolean") return null;
    if (c.passed !== (c.expected_action === c.actual_action)) return null;

    // Verify matched_rule_ids are sorted and unique
    const ids = c.matched_rule_ids as string[];
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] <= ids[i - 1]) return null;
    }
    if (new Set(ids).size !== ids.length) return null;

    normalizedCases.push({
      case_id: c.case_id,
      expected_action: c.expected_action,
      actual_action: c.actual_action,
      terminal_stage: c.terminal_stage,
      matched_rule_ids: [...ids],
      test_category: c.test_category,
      passed: c.passed
    } as Track1BaseFilterCaseEvaluation);
  }

  // Validate summary numeric values
  const s = value.summary as Record<string, unknown>;
  if (typeof s.total_cases !== "number" || s.total_cases !== 9) return null;
  if (typeof s.exact_matches !== "number" || !Number.isFinite(s.exact_matches)) return null;
  if (typeof s.exact_action_accuracy !== "number" || !Number.isFinite(s.exact_action_accuracy)) return null;
  if (typeof s.unsafe_case_count !== "number" || !Number.isFinite(s.unsafe_case_count)) return null;
  if (typeof s.unsafe_case_recall !== "number" || !Number.isFinite(s.unsafe_case_recall)) return null;
  if (typeof s.negative_control_count !== "number" || !Number.isFinite(s.negative_control_count)) return null;
  if (typeof s.negative_control_false_positive_rate !== "number" || !Number.isFinite(s.negative_control_false_positive_rate)) return null;

  // Validate all rate values in [0, 1]
  for (const k of ["exact_action_accuracy", "unsafe_case_recall", "negative_control_false_positive_rate"]) {
    const v = s[k] as number;
    if (v < 0 || v > 1) return null;
  }

  // Recompute all metrics from cases and verify they match the claimed summary
  const recomputed = computeMetricsFromCases(normalizedCases as unknown as Record<string, unknown>[]);
  if (!recomputed) return null;
  if (s.total_cases !== recomputed.total_cases) return null;
  if (s.exact_matches !== recomputed.exact_matches) return null;
  if (s.exact_action_accuracy !== recomputed.exact_action_accuracy) return null;
  if (s.unsafe_case_count !== recomputed.unsafe_case_count) return null;
  if (s.unsafe_case_recall !== recomputed.unsafe_case_recall) return null;
  if (s.negative_control_count !== recomputed.negative_control_count) return null;
  if (s.negative_control_false_positive_rate !== recomputed.negative_control_false_positive_rate) return null;

  // Verify 1:1 case/result correlation by case_id
  const resultCaseIds = new Set<string>();
  for (const r of normalizedResults) {
    const details = r.details as SandboxRunResultDetails;
    // Extract case_id from session events
    let foundCaseId: string | undefined;
    if (details.events) {
      for (const evt of details.events) {
        if (evt.case_id) { foundCaseId = evt.case_id; break; }
      }
    }
    if (foundCaseId) resultCaseIds.add(foundCaseId);
  }
  if (resultCaseIds.size !== caseIds.size) return null;
  for (const cid of caseIds) {
    if (!resultCaseIds.has(cid)) return null;
  }

  // Return defensive copies only
  return {
    schema_version: TRACK1_BASE_FILTER_EVALUATION_SCHEMA_VERSION,
    summary: {
      total_cases: s.total_cases,
      exact_matches: s.exact_matches,
      exact_action_accuracy: s.exact_action_accuracy,
      unsafe_case_count: s.unsafe_case_count,
      unsafe_case_recall: s.unsafe_case_recall,
      negative_control_count: s.negative_control_count,
      negative_control_false_positive_rate: s.negative_control_false_positive_rate
    },
    cases: normalizedCases,
    results: normalizedResults
  };
}

// -- serialization -----------------------------------------------------------

export async function serializeTrack1BaseFilterDemo(): Promise<string> {
  const runs = await runAllTrack1BaseFilterCases();
  const report = buildTrack1BaseFilterDemoReport(runs);
  const validated = normalizeTrack1BaseFilterDemoReport(report);
  if (!validated) {
    throw new Track1BaseFilterError("base_filter_evaluation_invalid");
  }
  return JSON.stringify(validated);
}

// -- demo ports and executor ------------------------------------------------

export interface Track1BaseFilterDemoPorts {
  run(): Promise<Track1BaseFilterDemoReport>;
  writeStdout(value: string): void;
  writeStderr(value: string): void;
  setExitCode(value: number): void;
}

export async function executeTrack1BaseFilterDemo(
  ports: Track1BaseFilterDemoPorts
): Promise<void> {
  try {
    const report = await ports.run();
    // Validate the report before writing
    const validated = normalizeTrack1BaseFilterDemoReport(report);
    if (!validated) {
      throw new Track1BaseFilterError("base_filter_evaluation_invalid");
    }
    const serialized = JSON.stringify(validated);
    ports.writeStdout(serialized);
  } catch (err: unknown) {
    if (err instanceof Track1BaseFilterError) {
      ports.writeStderr(`${err.code}: ${err.message}\n`);
      ports.setExitCode(1);
    } else {
      // All other errors (including unknown objects with code/message) must
      // emit only the fixed safe message — never leak arbitrary error text.
      ports.writeStderr("base_filter_evaluation_invalid: Unexpected base-filter demo failure\n");
      ports.setExitCode(1);
    }
  }
}
