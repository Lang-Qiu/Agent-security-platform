import {
  canonicalizeSandboxSecurityJson
} from "./canonical-json.ts";
import type {
  SandboxSecurityCandidateSubjectRef,
  SandboxSecurityExternalCandidateSubjectRef,
  SandboxSecuritySanitizedJudgeObligation
} from "./detector-contract.ts";
import type {
  SandboxSecurityDetectorSlotId
} from "./policy-profiles.ts";
import type {
  SandboxSecurityDraftFinding,
  SandboxSecurityQualifiedClearance,
  SandboxSecurityQualifiedSlotEvidence,
  SandboxSecurityRoutingRiskEvidence
} from "./finding-qualification.ts";
import type {
  SandboxSecurityExternalTokenRegistry
} from "./sanitized-boundary.ts";
import {
  canonicalizeSandboxSecurityPrivateSubjectScopes
} from "./subject-scope.ts";
import type {
  SandboxSecurityReasonCode,
  SandboxSecurityRiskCategory,
  SandboxSecuritySeverity
} from "../../../../shared/types/sandbox-security.ts";
import {
  SANDBOX_SECURITY_SEVERITIES
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityEscalationSignal {
  readonly category: SandboxSecurityRiskCategory;
  readonly subject_key: string;
  readonly subject_refs: readonly SandboxSecurityCandidateSubjectRef[];
  readonly origin_slot_ids: readonly SandboxSecurityDetectorSlotId[];
  readonly severity: SandboxSecuritySeverity;
  readonly confidence: number;
  readonly reason_code: SandboxSecurityReasonCode;
}

export type SandboxSecurityJudgeResolutionEvidence =
  | {
      readonly kind: "accepted_risk";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
      readonly finding_id: string;
    }
  | {
      readonly kind: "qualified_clearance";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
    }
  | {
      readonly kind: "partial_coverage";
      readonly covered_obligation_ids: readonly string[];
      readonly uncovered_obligation_ids: readonly string[];
    }
  | { readonly kind: "no_match" }
  | {
      readonly kind: "low_confidence_unresolved";
      readonly obligation_id: string;
      readonly category: SandboxSecurityRiskCategory;
      readonly subject_key: string;
    }
  | {
      readonly kind: "invalid_result";
      readonly error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    };

export type SandboxSecurityNormalizedJudgeOutcome =
  | {
      readonly status: "matched";
      readonly evidence: Readonly<SandboxSecurityQualifiedSlotEvidence>;
      readonly covered_obligation_ids: readonly string[];
    }
  | {
      readonly status: "no_match";
      readonly covered_obligation_ids: readonly [];
    }
  | {
      readonly status: "invalid_result";
      readonly error_code:
        | "detector_result_invalid"
        | "detector_content_leak";
    };

export interface SandboxSecurityJudgeApplicationResult {
  readonly resolution_evidence:
    readonly SandboxSecurityJudgeResolutionEvidence[];
  readonly unresolved_signals:
    readonly SandboxSecurityEscalationSignal[];
  readonly accepted_draft_findings:
    readonly SandboxSecurityDraftFinding[];
  readonly covered_obligation_ids: readonly string[];
}

export type SandboxSecurityEscalationLifecycle =
  | "collecting"
  | "obligations_materialized"
  | "judge_applied"
  | "closed";

export type SandboxSecurityJudgeTerminationReason =
  | "risk_short_circuit"
  | "detector_unavailable"
  | "external_redaction_failed"
  | "detector_failed"
  | "detector_timeout"
  | "evaluation_terminated";

export interface SandboxSecurityEscalationState {
  lifecycle(): SandboxSecurityEscalationLifecycle;
  addSlotEvidence(evidence: SandboxSecurityQualifiedSlotEvidence): void;
  unresolvedSignals(): readonly SandboxSecurityEscalationSignal[];
  materializeRoutedObligations(input: {
    readonly decision_id: string;
    readonly token_registry: Readonly<SandboxSecurityExternalTokenRegistry>;
  }): readonly SandboxSecuritySanitizedJudgeObligation[];
  applyJudgeOutcome(
    outcome: Readonly<SandboxSecurityNormalizedJudgeOutcome>
  ): Readonly<SandboxSecurityJudgeApplicationResult>;
  terminateJudgeAttempt(input: Readonly<{
    reason: SandboxSecurityJudgeTerminationReason;
  }>): Readonly<SandboxSecurityJudgeApplicationResult>;
  closeWithoutJudge(): void;
  close(): void;
}

const SEVERITY_RANK: Record<SandboxSecuritySeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

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

function mergeKey(category: string, subject_key: string): string {
  return `${category}::${subject_key}`;
}

function isJudgeSlot(slotId: string): boolean {
  return slotId.includes("/judge/");
}

function mapPrivateRefsToExternal(
  refs: readonly SandboxSecurityCandidateSubjectRef[],
  registry: Readonly<SandboxSecurityExternalTokenRegistry>
): readonly SandboxSecurityExternalCandidateSubjectRef[] {
  const out: SandboxSecurityExternalCandidateSubjectRef[] = [];
  for (const ref of refs) {
    if (ref.kind === "content_source") {
      const entry = registry.source_tokens.find(
        (item) => item.source_handle === ref.source_handle
      );
      if (!entry) {
        throw new Error("sandbox_security_escalation_invalid:source_token");
      }
      out.push({
        kind: "content_source",
        source_token: entry.source_token,
        locator: ref.locator
      });
      continue;
    }
    if (!registry.call_token || registry.call_token.call_handle !== ref.call_handle) {
      throw new Error("sandbox_security_escalation_invalid:call_token");
    }
    if (ref.component === "arguments") {
      out.push({
        kind: "tool_request",
        call_token: registry.call_token.call_token,
        component: "arguments",
        locator: ref.locator
      });
    } else {
      out.push({
        kind: "tool_request",
        call_token: registry.call_token.call_token,
        component: ref.component
      });
    }
  }
  return out;
}

function obligationSortKey(
  obligation: SandboxSecuritySanitizedJudgeObligation
): string {
  const scopes = obligation.subject_refs.map((ref) =>
    canonicalizeSandboxSecurityJson(ref)
  );
  scopes.sort();
  return canonicalizeSandboxSecurityJson({
    category: obligation.category,
    scopes
  });
}

export function createSandboxSecurityEscalationState(): SandboxSecurityEscalationState {
  let lifecycle: SandboxSecurityEscalationLifecycle = "collecting";
  const acceptedByScope = new Map<string, true>();
  const signals = new Map<string, SandboxSecurityEscalationSignal>();
  const acceptedDrafts: SandboxSecurityDraftFinding[] = [];
  let routedObligations: readonly SandboxSecuritySanitizedJudgeObligation[] = [];
  let obligationToSignal = new Map<string, string>();
  let closedUnresolved: readonly SandboxSecurityEscalationSignal[] | null = null;
  let applied = false;
  let terminated = false;

  function assertLifecycle(
    allowed: readonly SandboxSecurityEscalationLifecycle[]
  ): void {
    if (!allowed.includes(lifecycle)) {
      throw new Error(`sandbox_security_escalation_invalid:lifecycle:${lifecycle}`);
    }
  }

  function currentSignals(): SandboxSecurityEscalationSignal[] {
    return [...signals.values()].map((signal) => deepFreeze({ ...signal, origin_slot_ids: [...signal.origin_slot_ids], subject_refs: [...signal.subject_refs] }));
  }

  function addRoutingRisk(risk: SandboxSecurityRoutingRiskEvidence): void {
    const key = mergeKey(risk.category, risk.subject_key);
    if (acceptedByScope.has(key)) {
      return;
    }
    const existing = signals.get(key);
    if (!existing) {
      signals.set(key, {
        category: risk.category,
        subject_key: risk.subject_key,
        subject_refs: risk.subject_refs,
        origin_slot_ids: [risk.source_slot_id],
        severity: risk.severity,
        confidence: risk.confidence,
        reason_code: risk.reason_code
      });
      return;
    }
    const origin = new Set(existing.origin_slot_ids);
    origin.add(risk.source_slot_id);
    const preferNew =
      SEVERITY_RANK[risk.severity] > SEVERITY_RANK[existing.severity] ||
      (SEVERITY_RANK[risk.severity] === SEVERITY_RANK[existing.severity] &&
        risk.confidence > existing.confidence);
    signals.set(key, {
      category: existing.category,
      subject_key: existing.subject_key,
      subject_refs: preferNew ? risk.subject_refs : existing.subject_refs,
      origin_slot_ids: Object.freeze([...origin].sort()) as SandboxSecurityDetectorSlotId[],
      severity: preferNew ? risk.severity : existing.severity,
      confidence: preferNew ? risk.confidence : existing.confidence,
      reason_code: preferNew ? risk.reason_code : existing.reason_code
    });
  }

  const api: SandboxSecurityEscalationState = {
    lifecycle() {
      return lifecycle;
    },
    addSlotEvidence(evidence) {
      assertLifecycle(["collecting"]);
      if (isJudgeSlot(evidence.source_slot_id)) {
        throw new Error("sandbox_security_escalation_invalid:judge_slot_evidence");
      }
      for (const draft of evidence.accepted_draft_findings) {
        acceptedDrafts.push(draft);
        acceptedByScope.set(mergeKey(draft.category, draft.subject_key), true);
        signals.delete(mergeKey(draft.category, draft.subject_key));
      }
      for (const risk of evidence.accepted_risks) {
        acceptedByScope.set(mergeKey(risk.category, risk.subject_key), true);
        signals.delete(mergeKey(risk.category, risk.subject_key));
      }
      for (const risk of evidence.routing_risks) {
        addRoutingRisk(risk);
      }
      // clearances: disagreement only; intentionally ignored for signal create/resolve
      void (evidence.qualified_clearances as readonly SandboxSecurityQualifiedClearance[]);
    },
    unresolvedSignals() {
      if (lifecycle === "closed") {
        return closedUnresolved ?? Object.freeze([]);
      }
      return Object.freeze(currentSignals());
    },
    materializeRoutedObligations(input) {
      assertLifecycle(["collecting"]);
      if ((api as { __materialized?: boolean }).__materialized) {
        throw new Error("sandbox_security_escalation_invalid:obligations_once");
      }
      const unresolved = currentSignals();
      if (unresolved.length === 0) {
        throw new Error("sandbox_security_escalation_invalid:no_signals");
      }
      const paired = unresolved
        .map((signal) => ({
          signal,
          external_refs: mapPrivateRefsToExternal(
            signal.subject_refs,
            input.token_registry
          )
        }))
        .sort((left, right) => {
          const leftKey = obligationSortKey({
            obligation_id: "",
            category: left.signal.category,
            subject_refs: left.external_refs
          });
          const rightKey = obligationSortKey({
            obligation_id: "",
            category: right.signal.category,
            subject_refs: right.external_refs
          });
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
      obligationToSignal = new Map();
      const materialized = paired.map((item, index) => {
        // The sanitizer's OBLIGATION_ID validator forbids ':' in the path
        // segment, but the production runtime mints decision ids as
        // `decision:<uuid>`. Replace ':' so the id satisfies the regex; the
        // obligation_id is used only as an internal correlation key (map key,
        // sanitizer input, judge echo) and is never parsed back into a
        // decision id, so the substitution is safe and keeps it unique.
        const obligationDecisionSegment = input.decision_id.replace(/:/g, "-");
        const obligation_id = `obligation://sandbox/security/${obligationDecisionSegment}/${String(index + 1).padStart(4, "0")}`;
        obligationToSignal.set(
          obligation_id,
          mergeKey(item.signal.category, item.signal.subject_key)
        );
        return deepFreeze({
          obligation_id,
          category: item.signal.category,
          subject_refs: item.external_refs
        });
      });
      routedObligations = Object.freeze(materialized);
      (api as { __materialized?: boolean }).__materialized = true;
      lifecycle = "obligations_materialized";
      return routedObligations;
    },
    applyJudgeOutcome(outcome) {
      assertLifecycle(["obligations_materialized"]);
      if (applied || terminated) {
        throw new Error("sandbox_security_escalation_invalid:outcome_once");
      }
      if (routedObligations.length === 0) {
        throw new Error("sandbox_security_escalation_invalid:no_obligations");
      }
      applied = true;
      const resolution_evidence: SandboxSecurityJudgeResolutionEvidence[] = [];
      const covered = new Set<string>();
      const acceptedFromJudge: SandboxSecurityDraftFinding[] = [];

      if (outcome.status === "no_match") {
        resolution_evidence.push({ kind: "no_match" });
      } else if (outcome.status === "invalid_result") {
        resolution_evidence.push({
          kind: "invalid_result",
          error_code: outcome.error_code
        });
      } else {
        // matched
        for (const id of outcome.covered_obligation_ids) {
          if (!obligationToSignal.has(id)) {
            // outside routed set -> treat as invalid path content
            resolution_evidence.push({
              kind: "invalid_result",
              error_code: "detector_result_invalid"
            });
            continue;
          }
          covered.add(id);
        }
        // routing risks on judge evidence cannot create signals
        if (outcome.evidence.routing_risks.length > 0) {
          // ignore for signal creation
        }
        for (const risk of outcome.evidence.accepted_risks) {
          // resolve matching obligation by category+subject_key
          const key = mergeKey(risk.category, risk.subject_key);
          let matchedObligation: string | undefined;
          for (const [obligationId, signalKey] of obligationToSignal) {
            if (signalKey === key && covered.has(obligationId)) {
              matchedObligation = obligationId;
              break;
            }
          }
          if (!matchedObligation) {
            // low confidence path or unmatched - if covered empty for this risk, ignore signal create
            continue;
          }
          signals.delete(key);
          acceptedDrafts.push(
            outcome.evidence.accepted_draft_findings.find(
              (draft) => draft.finding_id === risk.finding_id
            ) ?? {
              finding_id: risk.finding_id,
              detector_id: risk.source_slot_id,
              detector_version: "1.0.0",
              category: risk.category,
              severity: risk.severity,
              confidence: risk.confidence,
              reason_code: risk.reason_code,
              subject_key: risk.subject_key,
              subject_refs: risk.subject_refs
            }
          );
          acceptedFromJudge.push(
            acceptedDrafts[acceptedDrafts.length - 1]
          );
          resolution_evidence.push({
            kind: "accepted_risk",
            obligation_id: matchedObligation,
            category: risk.category,
            subject_key: risk.subject_key,
            finding_id: risk.finding_id
          });
        }
        for (const clearance of outcome.evidence.qualified_clearances) {
          const key = mergeKey(clearance.category, clearance.subject_key);
          let matchedObligation: string | undefined;
          for (const [obligationId, signalKey] of obligationToSignal) {
            if (signalKey === key && covered.has(obligationId)) {
              matchedObligation = obligationId;
              break;
            }
          }
          if (!matchedObligation) continue;
          signals.delete(key);
          resolution_evidence.push({
            kind: "qualified_clearance",
            obligation_id: matchedObligation,
            category: clearance.category,
            subject_key: clearance.subject_key
          });
        }
        // low-confidence unresolved for covered obligations without accepted/clearance evidence
        for (const obligationId of covered) {
          const already = resolution_evidence.some(
            (item) =>
              (item.kind === "accepted_risk" ||
                item.kind === "qualified_clearance" ||
                item.kind === "low_confidence_unresolved") &&
              "obligation_id" in item &&
              item.obligation_id === obligationId
          );
          if (already) continue;
          const signalKey = obligationToSignal.get(obligationId);
          if (!signalKey) continue;
          const [category, subject_key] = [
            signalKey.split("::")[0],
            signalKey.slice(signalKey.indexOf("::") + 2)
          ];
          resolution_evidence.push({
            kind: "low_confidence_unresolved",
            obligation_id: obligationId,
            category: category as SandboxSecurityRiskCategory,
            subject_key
          });
        }
        const uncovered = routedObligations
          .map((item) => item.obligation_id)
          .filter((id) => !covered.has(id));
        if (covered.size > 0 && uncovered.length > 0) {
          resolution_evidence.push({
            kind: "partial_coverage",
            covered_obligation_ids: Object.freeze([...covered].sort()),
            uncovered_obligation_ids: Object.freeze(uncovered.sort())
          });
        } else if (covered.size === 0 && outcome.evidence.accepted_risks.length === 0 && outcome.evidence.qualified_clearances.length === 0) {
          // matched with empty? treat as no useful coverage
        }
      }

      lifecycle = "judge_applied";
      return deepFreeze({
        resolution_evidence,
        unresolved_signals: currentSignals(),
        accepted_draft_findings: [...acceptedDrafts],
        covered_obligation_ids: Object.freeze(
          outcome.status === "matched"
            ? [...new Set(outcome.covered_obligation_ids)].sort()
            : []
        )
      });
    },
    terminateJudgeAttempt(input) {
      void input.reason;
      assertLifecycle(["collecting", "obligations_materialized"]);
      if (applied || terminated) {
        throw new Error("sandbox_security_escalation_invalid:terminate_once");
      }
      terminated = true;
      lifecycle = "closed";
      closedUnresolved = Object.freeze(currentSignals());
      return deepFreeze({
        resolution_evidence: [],
        unresolved_signals: closedUnresolved,
        accepted_draft_findings: [...acceptedDrafts],
        covered_obligation_ids: []
      });
    },
    closeWithoutJudge() {
      assertLifecycle(["collecting"]);
      if (signals.size > 0) {
        throw new Error("sandbox_security_escalation_invalid:signals_present");
      }
      lifecycle = "closed";
      closedUnresolved = Object.freeze([]);
    },
    close() {
      assertLifecycle(["judge_applied", "collecting", "obligations_materialized"]);
      if (lifecycle === "collecting" && signals.size > 0) {
        throw new Error("sandbox_security_escalation_invalid:close_with_signals");
      }
      if (lifecycle === "obligations_materialized") {
        throw new Error("sandbox_security_escalation_invalid:close_before_outcome");
      }
      lifecycle = "closed";
      closedUnresolved = Object.freeze(currentSignals());
    }
  };

  return api;
}
