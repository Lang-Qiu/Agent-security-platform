import { canonicalizeSandboxSecurityJson } from "./canonical-json.ts";
import type {
  SandboxSecuritySanitizedJudgeObligation
} from "./detector-contract.ts";
import type {
  SandboxSecurityNormalizedSlotResult
} from "./detector-output-boundary.ts";
import {
  createSandboxSecurityEscalationState,
  type SandboxSecurityJudgeResolutionEvidence,
  type SandboxSecurityEscalationSignal
} from "./escalation-state.ts";
import {
  qualifySandboxSecuritySlotEvidence,
  validateSandboxSecurityPublication,
  type SandboxSecurityDraftFinding,
  type SandboxSecurityPublicSubjectTokenMap,
  type SandboxSecurityQualificationSubjectMap,
  type SandboxSecurityQualifiedSlotEvidence
} from "./finding-qualification.ts";
import type {
  SandboxSecurityDetectorSlotId,
  SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";
import {
  isDecisionBearingEngineFailure,
  reduceSandboxSecurityPolicy,
  type SandboxSecurityDecisionBearingEngineFailure
} from "./policy-reducer.ts";
import type {
  SandboxDetectorRun,
  SandboxDetectorSkipReason,
  SandboxSecurityDecision,
  SandboxSecurityFinding,
  SandboxSecurityRiskCategory,
  SandboxSecurityStage
} from "../../../../shared/types/sandbox-security.ts";

export type { SandboxSecurityJudgeResolutionEvidence };

export type SandboxSecuritySlotEvaluationRecord =
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "matched";
      readonly normalized_result: Readonly<SandboxSecurityNormalizedSlotResult>;
      readonly qualified_evidence: Readonly<SandboxSecurityQualifiedSlotEvidence>;
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "no_match";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "invalid_result";
      readonly error_code: "detector_result_invalid" | "detector_content_leak";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "failed";
      readonly error_code:
        | "detector_unavailable"
        | "detector_failed"
        | "external_redaction_failed"
        | "adapter_unsupported";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "timeout";
    }
  | {
      readonly slot_id: SandboxSecurityDetectorSlotId;
      readonly status: "skipped";
      readonly skip_reason: SandboxDetectorSkipReason;
    };

export interface SandboxSecurityRoutedObligationRecord
  extends SandboxSecuritySanitizedJudgeObligation {
  readonly signal_subject_key: string;
  readonly signal_category: SandboxSecurityRiskCategory;
}

export interface SandboxSecurityEvaluationEvidenceLedger {
  readonly decision_id: string;
  readonly request_id: string;
  readonly created_at: string;
  readonly evaluation_mode: "simulation" | "enforcement";
  readonly stage: SandboxSecurityStage;
  readonly profile: Readonly<SandboxSecurityPolicyProfileManifest>;
  readonly subject_map: Readonly<SandboxSecurityQualificationSubjectMap>;
  readonly slot_records: readonly SandboxSecuritySlotEvaluationRecord[];
  readonly public_subject_token_map: Readonly<SandboxSecurityPublicSubjectTokenMap>;
  readonly routed_obligations: readonly SandboxSecurityRoutedObligationRecord[];
  readonly judge_resolution_evidence: readonly SandboxSecurityJudgeResolutionEvidence[];
  readonly published_findings: readonly SandboxSecurityFinding[];
  readonly detector_runs: readonly SandboxDetectorRun[];
  readonly unresolved_escalation_signals: readonly SandboxSecurityEscalationSignal[];
  readonly engine_failure: Readonly<SandboxSecurityDecisionBearingEngineFailure> | null;
}

const SEMANTIC_ERROR = "sandbox_security_semantic_invalid";

function fail(detail: string): never {
  throw new Error(`${SEMANTIC_ERROR}:${detail}`);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function isStrictIso8601(value: string): boolean {
  if (typeof value !== "string" || value.length < 20) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  // Require timezone designator Z or offset.
  return /Z$|[+-]\d{2}:\d{2}$/.test(value);
}

function equalJson(left: unknown, right: unknown): boolean {
  return (
    canonicalizeSandboxSecurityJson(left) ===
    canonicalizeSandboxSecurityJson(right)
  );
}

function assertRecordShape(
  record: SandboxSecuritySlotEvaluationRecord
): void {
  const keys = Object.keys(record).sort();
  switch (record.status) {
    case "matched":
      if (keys.join("|") !== "normalized_result|qualified_evidence|slot_id|status") {
        fail("matched_record_shape");
      }
      return;
    case "no_match":
      if (keys.join("|") !== "slot_id|status") fail("no_match_record_shape");
      return;
    case "invalid_result":
    case "failed":
      if (keys.join("|") !== "error_code|slot_id|status") {
        fail(`${record.status}_record_shape`);
      }
      return;
    case "timeout":
      if (keys.join("|") !== "slot_id|status") fail("timeout_record_shape");
      return;
    case "skipped":
      if (keys.join("|") !== "skip_reason|slot_id|status") {
        fail("skipped_record_shape");
      }
      return;
    default:
      fail("unknown_record_status");
  }
}

function assertRunMatchesRecord(
  run: SandboxDetectorRun,
  record: SandboxSecuritySlotEvaluationRecord
): void {
  if (run.status !== record.status) {
    fail("record_status_run_status_mismatch");
  }
  if (record.status === "matched" || record.status === "no_match") {
    if ("error_code" in run || "skip_reason" in run) {
      fail("matched_run_has_terminal_fields");
    }
    return;
  }
  if (record.status === "timeout") {
    if (!("error_code" in run) || run.error_code !== "detector_timeout") {
      fail("timeout_without_detector_timeout");
    }
    return;
  }
  if (record.status === "skipped") {
    if (!("skip_reason" in run) || run.skip_reason !== record.skip_reason) {
      fail("skip_reason_mismatch");
    }
    return;
  }
  if (record.status === "failed" || record.status === "invalid_result") {
    if (!("error_code" in run) || run.error_code !== record.error_code) {
      fail("error_code_mismatch");
    }
  }
}

function collectExpectedEvidenceRefs(
  decisionId: string,
  findings: readonly SandboxSecurityFinding[],
  engineFailure: Readonly<SandboxSecurityDecisionBearingEngineFailure> | null
): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    for (const ref of finding.evidence_refs) {
      if (!seen.has(ref)) {
        seen.add(ref);
        refs.push(ref);
      }
    }
  }
  if (engineFailure !== null) {
    const marker = `evidence://sandbox/security/${decisionId}/engine-0001`;
    if (!seen.has(marker)) {
      refs.push(marker);
    }
  }
  return refs;
}

function assertJudgeResolutionConsistency(
  ledger: Readonly<SandboxSecurityEvaluationEvidenceLedger>
): void {
  const obligationIds = new Set(
    ledger.routed_obligations.map((item) => item.obligation_id)
  );
  for (const obligation of ledger.routed_obligations) {
    if (obligation.signal_category !== obligation.category) {
      fail("routed_obligation_category_mismatch");
    }
    if (typeof obligation.signal_subject_key !== "string" || obligation.signal_subject_key.length === 0) {
      fail("routed_obligation_subject_key");
    }
  }

  for (const evidence of ledger.judge_resolution_evidence) {
    if (evidence.kind === "accepted_risk" || evidence.kind === "qualified_clearance" || evidence.kind === "low_confidence_unresolved") {
      if (!obligationIds.has(evidence.obligation_id)) {
        fail("judge_resolution_unknown_obligation");
      }
    }
    if (evidence.kind === "partial_coverage") {
      for (const id of evidence.covered_obligation_ids) {
        if (!obligationIds.has(id)) fail("partial_coverage_unknown_covered");
      }
      for (const id of evidence.uncovered_obligation_ids) {
        if (!obligationIds.has(id)) fail("partial_coverage_unknown_uncovered");
      }
    }
  }
}

function assertUnresolvedSignals(
  ledger: Readonly<SandboxSecurityEvaluationEvidenceLedger>,
  decision: Readonly<SandboxSecurityDecision>
): void {
  // Decision does not carry unresolved signals; ledger is authority.
  // Ensure array is dense ordinary data and freezes after compare via reducer path.
  if (!Array.isArray(ledger.unresolved_escalation_signals)) {
    fail("unresolved_signals_shape");
  }
  void decision;
}

export function validateSandboxSecurityDecisionSemantics(
  decision: Readonly<SandboxSecurityDecision>,
  ledger: Readonly<SandboxSecurityEvaluationEvidenceLedger>
): Readonly<SandboxSecurityDecision> {
  if (!decision || typeof decision !== "object") {
    fail("decision_required");
  }
  if (!ledger || typeof ledger !== "object") {
    fail("ledger_required");
  }

  if (decision.decision_id !== ledger.decision_id) {
    fail("decision_id_mismatch");
  }
  if (decision.request_id !== ledger.request_id) {
    fail("request_id_mismatch");
  }
  if (decision.evaluation_mode !== ledger.evaluation_mode) {
    fail("evaluation_mode_mismatch");
  }
  if (decision.stage !== ledger.stage) {
    fail("stage_mismatch");
  }
  if (decision.policy_profile_id !== ledger.profile.profile_id) {
    fail("profile_mismatch");
  }
  if (decision.created_at !== ledger.created_at) {
    fail("created_at_mismatch");
  }
  if (!isStrictIso8601(ledger.created_at)) {
    fail("created_at_invalid");
  }

  if (ledger.engine_failure !== null) {
    if (!isDecisionBearingEngineFailure(ledger.engine_failure)) {
      fail("terminal_engine_failure");
    }
  }

  const slots = ledger.profile.detector_slots;
  if (ledger.slot_records.length !== slots.length) {
    fail("slot_record_count");
  }
  if (ledger.detector_runs.length !== slots.length) {
    fail("detector_run_count");
  }
  if (decision.detector_runs.length !== slots.length) {
    fail("decision_run_count");
  }

  const recomputedDrafts: SandboxSecurityDraftFinding[] = [];
  const seenFindingIds = new Set<string>();
  const findingIdsBySlot = new Map<string, string[]>();

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const record = ledger.slot_records[index]!;
    const run = ledger.detector_runs[index]!;
    const decisionRun = decision.detector_runs[index]!;

    assertRecordShape(record);

    if (record.slot_id !== slot.slot_id) {
      fail("slot_record_order");
    }
    if (run.detector_id !== slot.slot_id) {
      fail("run_detector_id");
    }
    if (run.detector_version !== slot.detector_version) {
      fail("run_detector_version");
    }
    if (run.detector_kind !== slot.detector_kind) {
      fail("run_detector_kind");
    }
    if (!equalJson(run, decisionRun)) {
      fail("decision_run_mismatch");
    }

    assertRunMatchesRecord(run, record);

    if (record.status === "matched") {
      if (!record.normalized_result || !record.qualified_evidence) {
        fail("matched_missing_normalized");
      }
      if (record.qualified_evidence.source_slot_id !== slot.slot_id) {
        fail("missing_source_slot_id");
      }

      let recomputed: SandboxSecurityQualifiedSlotEvidence;
      try {
        recomputed = qualifySandboxSecuritySlotEvidence({
          slot,
          result: record.normalized_result,
          decision_id: ledger.decision_id,
          subject_map: ledger.subject_map
        });
      } catch {
        fail("qualification_recompute_failed");
      }

      if (!equalJson(recomputed, record.qualified_evidence)) {
        fail("qualified_evidence_cache_mismatch");
      }

      for (const draft of recomputed.accepted_draft_findings) {
        if (seenFindingIds.has(draft.finding_id)) {
          fail("duplicate_finding_id");
        }
        seenFindingIds.add(draft.finding_id);
        recomputedDrafts.push(draft);
        const list = findingIdsBySlot.get(slot.slot_id) ?? [];
        list.push(draft.finding_id);
        findingIdsBySlot.set(slot.slot_id, list);
      }
    } else {
      if ("normalized_result" in record || "qualified_evidence" in record) {
        fail("non_matched_has_evidence");
      }
      if ("error_code" in record && record.status !== "failed" && record.status !== "invalid_result") {
        fail("unexpected_error_code");
      }
    }
  }

  // Recompute unresolved escalation signals from non-judge matched slot evidence.
  // When Judge was not routed/applied, ledger unresolved must match exactly.
  const escalation = createSandboxSecurityEscalationState();
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const record = ledger.slot_records[index]!;
    if (record.status !== "matched") continue;
    if (slot.detector_kind === "external_judge") continue;
    const recomputed = qualifySandboxSecuritySlotEvidence({
      slot,
      result: record.normalized_result,
      decision_id: ledger.decision_id,
      subject_map: ledger.subject_map
    });
    escalation.addSlotEvidence(recomputed);
  }

  if (
    ledger.routed_obligations.length === 0 &&
    ledger.judge_resolution_evidence.length === 0
  ) {
    const expectedUnresolved = escalation.unresolvedSignals();
    if (!equalJson(expectedUnresolved, ledger.unresolved_escalation_signals)) {
      fail("unresolved_signal_set_mismatch");
    }
  } else {
    // Judge path: every remaining unresolved signal must still be explainable
    // from pre-judge escalation state (forged signals not present in recomputed).
    const preJudge = escalation.unresolvedSignals();
    const preKeys = new Set(
      preJudge.map((signal) => `${signal.category}\0${signal.subject_key}`)
    );
    for (const signal of ledger.unresolved_escalation_signals) {
      const key = `${signal.category}\0${signal.subject_key}`;
      if (!preKeys.has(key)) {
        fail("forged_unresolved_signal");
      }
    }
  }

  // Duplicate detector IDs across runs already impossible if one-per-slot, but
  // defend against forged run arrays of equal length with swapped IDs already
  // checked above. Extra uniqueness:
  const runIds = ledger.detector_runs.map((run) => run.detector_id);
  if (new Set(runIds).size !== runIds.length) {
    fail("duplicate_run_detector_ids");
  }

  // Publication verify only (no second commit).
  try {
    validateSandboxSecurityPublication({
      decision_id: ledger.decision_id,
      draft_findings: recomputedDrafts,
      actual_token_map: ledger.public_subject_token_map,
      actual_findings: ledger.published_findings
    });
  } catch {
    fail("publication_verify_failed");
  }

  if (!equalJson(ledger.published_findings, decision.findings)) {
    fail("decision_findings_mismatch");
  }

  // Finding ownership: each finding must belong to a matched producer run
  // present in profile slots; detector_id must match a selected slot.
  const slotIds = new Set(slots.map((slot) => slot.slot_id));
  for (const finding of decision.findings) {
    if (!slotIds.has(finding.detector_id as SandboxSecurityDetectorSlotId)) {
      fail("finding_detector_not_in_profile");
    }
    const run = ledger.detector_runs.find(
      (item) => item.detector_id === finding.detector_id
    );
    if (!run) {
      fail("finding_detector_not_in_runs");
    }
    if (run.status !== "matched") {
      fail("finding_from_non_matched_run");
    }
    if (run.detector_version !== finding.detector_version) {
      fail("finding_version_mismatch");
    }
    if (run.status === "matched") {
      if (!run.finding_ids.includes(finding.finding_id)) {
        fail("finding_not_attached_to_run");
      }
    }
    // Shared detector_id grammar is not closed-slot authority: only selected
    // profile slots are accepted (checked via slotIds above).
    if (finding.finding_id.startsWith("etok:")) {
      fail("etok_finding_id");
    }
    for (const ref of finding.subject_refs) {
      const text = JSON.stringify(ref);
      if (text.includes("etok:")) fail("etok_subject");
    }
  }

  // Matched run finding_ids must exactly match recomputed drafts for that slot
  // (order may be publication order overall; per-run list is set equality + order
  // as attached by engine).
  for (const run of ledger.detector_runs) {
    if (run.status !== "matched") continue;
    const expected = findingIdsBySlot.get(run.detector_id) ?? [];
    if (!equalJson([...run.finding_ids].sort(), [...expected].sort())) {
      fail("run_finding_ids_mismatch");
    }
  }

  assertJudgeResolutionConsistency(ledger);
  assertUnresolvedSignals(ledger, decision);

  // Unresolved forgery: decision does not embed unresolved, but reducer uses
  // ledger unresolved + runs. Compare reducer against decision.
  let reduced: ReturnType<typeof reduceSandboxSecurityPolicy>;
  try {
    reduced = reduceSandboxSecurityPolicy({
      stage: ledger.stage,
      evaluation_mode: ledger.evaluation_mode,
      profile: ledger.profile,
      findings: ledger.published_findings,
      detector_runs: ledger.detector_runs,
      unresolved_escalation_signals: ledger.unresolved_escalation_signals,
      engine_failure: ledger.engine_failure
    });
  } catch {
    fail("reducer_recompute_failed");
  }

  if (decision.verdict !== reduced.verdict) fail("verdict_mismatch");
  if (decision.action !== reduced.action) fail("action_mismatch");
  if (decision.risk_level !== reduced.risk_level) fail("risk_level_mismatch");

  if (decision.verdict === "risk_detected" && decision.action === "allow") {
    fail("risk_detected_with_allow");
  }
  if (decision.verdict === "no_detected_risk" && decision.findings.length > 0) {
    fail("no_detected_risk_with_findings");
  }
  if (decision.verdict === "indeterminate") {
    const unresolvedRequired = ledger.detector_runs.some((run) => {
      const required =
        run.obligation === "profile_required" ||
        run.obligation === "runtime_required";
      return (
        required &&
        (run.status === "failed" ||
          run.status === "timeout" ||
          run.status === "invalid_result")
      );
    });
    if (
      ledger.unresolved_escalation_signals.length === 0 &&
      !unresolvedRequired &&
      ledger.engine_failure === null
    ) {
      fail("indeterminate_without_unresolved");
    }
  }

  const expectedEvidence = collectExpectedEvidenceRefs(
    ledger.decision_id,
    decision.findings,
    ledger.engine_failure
  );
  if (!equalJson(decision.evidence_refs, expectedEvidence)) {
    fail("evidence_refs_flatten");
  }
  if (ledger.engine_failure !== null) {
    const marker = `evidence://sandbox/security/${ledger.decision_id}/engine-0001`;
    if (!decision.evidence_refs.includes(marker)) {
      fail("missing_engine_0001");
    }
  } else if (
    decision.evidence_refs.some((ref) => ref.endsWith("/engine-0001"))
  ) {
    fail("forged_engine_0001");
  }

  return deepFreeze(decision);
}
