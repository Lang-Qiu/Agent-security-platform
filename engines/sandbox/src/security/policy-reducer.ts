import type {
  SandboxDetectorRun,
  SandboxSecurityAction,
  SandboxSecurityFinding,
  SandboxSecuritySeverity,
  SandboxSecurityStage,
  SandboxSecurityVerdict
} from "../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityEscalationSignal
} from "./escalation-state.ts";
import type {
  SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";

export type SandboxSecurityDecisionBearingBudgetPhase =
  | "decision_identity"
  | "detector_execution"
  | "sanitization"
  | "boundary_normalization"
  | "qualification"
  | "judge_resolution"
  | "publication"
  | "run_finalization"
  | "reduction"
  | "decision_materialization"
  | "semantic_validation";

export type SandboxSecurityDecisionBearingEngineFailure =
  | {
      readonly code: "evaluation_budget_exhausted";
      readonly phase: SandboxSecurityDecisionBearingBudgetPhase;
    }
  | {
      readonly code: "semantic_validation_failed";
      readonly phase: "semantic_validation";
    };

export type SandboxSecurityTerminalEngineErrorCode =
  | "decision_identity_invalid"
  | "runtime_clock_invalid"
  | "decision_materialization_invalid"
  | "pre_id_evaluation_budget_exhausted";

export type SandboxSecurityEngineFailureCode =
  | SandboxSecurityDecisionBearingEngineFailure["code"]
  | SandboxSecurityTerminalEngineErrorCode;

export type SandboxSecurityEngineFailurePhase =
  | "normalization"
  | "authority"
  | "input_preparation"
  | "profile_resolution"
  | "trust_derivation"
  | "snapshot_construction"
  | SandboxSecurityDecisionBearingBudgetPhase;

export type SandboxSecurityEngineFailure =
  SandboxSecurityDecisionBearingEngineFailure;

export interface SandboxSecurityPolicyReducerInput {
  readonly stage: SandboxSecurityStage;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly findings: readonly SandboxSecurityFinding[];
  readonly detector_runs: readonly SandboxDetectorRun[];
  readonly unresolved_escalation_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly engine_failure: Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}

const ACTION_RANK: Record<SandboxSecurityAction, number> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
};

const SEVERITY_RANK: Record<SandboxSecuritySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const BUDGET_PHASES = new Set<SandboxSecurityDecisionBearingBudgetPhase>([
  "decision_identity",
  "detector_execution",
  "sanitization",
  "boundary_normalization",
  "qualification",
  "judge_resolution",
  "publication",
  "run_finalization",
  "reduction",
  "decision_materialization",
  "semantic_validation"
]);

const PRE_ID_PHASES = new Set([
  "normalization",
  "authority",
  "input_preparation",
  "profile_resolution",
  "trust_derivation",
  "snapshot_construction"
]);

function maxAction(
  left: SandboxSecurityAction,
  right: SandboxSecurityAction
): SandboxSecurityAction {
  return ACTION_RANK[left] >= ACTION_RANK[right] ? left : right;
}

function maxSeverity(
  left: SandboxSecuritySeverity | "info",
  right: SandboxSecuritySeverity
): SandboxSecuritySeverity | "info" {
  if (left === "info") return right;
  return SEVERITY_RANK[left] >= SEVERITY_RANK[right] ? left : right;
}

function highestAcceptedSeverity(
  findings: readonly SandboxSecurityFinding[]
): SandboxSecuritySeverity | null {
  let best: SandboxSecuritySeverity | null = null;
  for (const finding of findings) {
    if (!best || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[best]) {
      best = finding.severity;
    }
  }
  return best;
}

function actionForAcceptedSeverity(
  profile: Readonly<SandboxSecurityPolicyProfileManifest>,
  stage: SandboxSecurityStage,
  severity: SandboxSecuritySeverity
): SandboxSecurityAction {
  const matrix = profile.action_matrix;
  if (severity === "critical") return matrix.accepted_critical[stage];
  if (severity === "high") return matrix.accepted_high[stage];
  if (severity === "medium") return matrix.accepted_medium[stage];
  return matrix.accepted_low[stage];
}

function hasUnresolvedRequiredRuns(
  runs: readonly SandboxDetectorRun[]
): boolean {
  for (const run of runs) {
    const required =
      run.obligation === "profile_required" ||
      run.obligation === "runtime_required";
    if (!required) continue;
    if (
      run.status === "failed" ||
      run.status === "timeout" ||
      run.status === "invalid_result"
    ) {
      return true;
    }
  }
  return false;
}

function assertValidEngineFailure(
  failure: Readonly<SandboxSecurityDecisionBearingEngineFailure> | null
): void {
  if (failure === null) return;
  if (failure.code === "evaluation_budget_exhausted") {
    if (!BUDGET_PHASES.has(failure.phase)) {
      throw new Error("sandbox_security_reducer_invalid:budget_phase");
    }
    if (PRE_ID_PHASES.has(failure.phase as never)) {
      throw new Error("sandbox_security_reducer_invalid:pre_id_budget");
    }
    return;
  }
  if (failure.code === "semantic_validation_failed") {
    if (failure.phase !== "semantic_validation") {
      throw new Error("sandbox_security_reducer_invalid:semantic_phase");
    }
    return;
  }
  throw new Error("sandbox_security_reducer_invalid:failure_code");
}

export function isDecisionBearingEngineFailure(
  value: unknown
): value is SandboxSecurityDecisionBearingEngineFailure {
  if (!value || typeof value !== "object") return false;
  const record = value as { code?: unknown; phase?: unknown };
  if (record.code === "evaluation_budget_exhausted") {
    return typeof record.phase === "string" && BUDGET_PHASES.has(record.phase as never);
  }
  if (record.code === "semantic_validation_failed") {
    return record.phase === "semantic_validation";
  }
  return false;
}

export function reduceSandboxSecurityPolicy(
  input: Readonly<SandboxSecurityPolicyReducerInput>
): {
  verdict: SandboxSecurityVerdict;
  action: SandboxSecurityAction;
  risk_level: "info" | SandboxSecuritySeverity;
} {
  if (!input || typeof input !== "object") {
    throw new Error("sandbox_security_reducer_invalid:input");
  }
  const keys = Object.keys(input).sort();
  const expected = [
    "detector_runs",
    "engine_failure",
    "evaluation_mode",
    "findings",
    "profile",
    "stage",
    "unresolved_escalation_signals"
  ];
  if (keys.join("|") !== expected.join("|")) {
    throw new Error("sandbox_security_reducer_invalid:shape");
  }
  if (
    Object.hasOwn(input as object, "unresolved_required") ||
    Object.hasOwn(input as object, "qualified_clearances") ||
    Object.hasOwn(input as object, "raw_snapshot")
  ) {
    throw new Error("sandbox_security_reducer_invalid:forbidden_field");
  }

  assertValidEngineFailure(input.engine_failure);

  const stage = input.stage;
  const findings = input.findings;
  const unresolvedSignals = input.unresolved_escalation_signals.length > 0;
  const unresolvedRequiredRuns = hasUnresolvedRequiredRuns(input.detector_runs);
  const unresolved = unresolvedSignals || unresolvedRequiredRuns;
  const highest = highestAcceptedSeverity(findings);
  const matrix = input.profile.action_matrix;

  let action: SandboxSecurityAction = matrix.no_finding_all_resolved[stage];
  let verdict: SandboxSecurityVerdict = "no_detected_risk";
  let risk_level: "info" | SandboxSecuritySeverity = "info";

  if (highest) {
    action = actionForAcceptedSeverity(input.profile, stage, highest);
    verdict = "risk_detected";
    risk_level = highest;
  }

  if (unresolved) {
    const unresolvedAction = matrix.unresolved_required[stage];
    action = maxAction(action, unresolvedAction);
    if (!highest) {
      verdict = "indeterminate";
      risk_level = stage === "tool_request" ? "high" : "medium";
    } else {
      // findings + unresolved: risk_detected remains; risk floor by indeterminate
      const floor: SandboxSecuritySeverity =
        stage === "tool_request" ? "high" : "medium";
      risk_level = maxSeverity(risk_level, floor) as SandboxSecuritySeverity;
      // risk_detected never allow already ensured by maxAction with unresolved
    }
  }

  if (input.engine_failure) {
    verdict = "indeterminate";
    const failureAction = matrix.unresolved_required[stage];
    // at least ask/deny by stage via unresolved matrix
    action = maxAction(action, failureAction);
    const floor: SandboxSecuritySeverity =
      stage === "tool_request" ? "high" : "medium";
    if (highest) {
      risk_level = maxSeverity(highest, floor) as SandboxSecuritySeverity;
    } else {
      risk_level = floor;
    }
  }

  if (verdict === "risk_detected" && action === "allow") {
    action = "alert";
  }

  return { verdict, action, risk_level };
}
