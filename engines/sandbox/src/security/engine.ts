import {
  SandboxSecurityAdapterUnsupportedError,
  type RawLocalDetector,
  type SandboxSecurityRawDetectorSnapshot,
  type SandboxSecuritySanitizer,
  type SanitizedExternalDetector
} from "./detector-contract.ts";
import {
  normalizeSandboxSecurityRawDetectorResult
} from "./detector-output-boundary.ts";
import {
  resolveSandboxSecurityDetectorsForProfile,
  type SandboxSecurityDetectorRegistry
} from "./detector-registry.ts";
import {
  createSandboxSecurityEscalationState,
  type SandboxSecurityEscalationSignal,
  type SandboxSecurityJudgeResolutionEvidence,
  type SandboxSecurityNormalizedJudgeOutcome
} from "./escalation-state.ts";
import {
  materializeSandboxSecurityPublicSubjectTokens,
  publishSandboxSecurityFindings,
  qualifySandboxSecuritySlotEvidence,
  type SandboxSecurityDraftFinding,
  type SandboxSecurityPublicSubjectTokenMap,
  type SandboxSecurityQualificationSubjectMap,
  type SandboxSecurityQualifiedSlotEvidence
} from "./finding-qualification.ts";
import {
  prepareSandboxSecurityInput
} from "./input-boundary.ts";
import {
  deriveSandboxSecurityTrustClass,
  resolveSandboxSecurityProfile,
  type SandboxSecurityDetectorSlotManifest,
  type SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";
import {
  reduceSandboxSecurityPolicy,
  type SandboxSecurityDecisionBearingBudgetPhase,
  type SandboxSecurityDecisionBearingEngineFailure
} from "./policy-reducer.ts";
import {
  createSandboxSecurityRunLedger,
  type SandboxSecurityRunLedger
} from "./run-ledger.ts";
import {
  createSandboxSecurityDeadlineController,
  type SandboxSecurityRuntimePorts
} from "./runtime-deadline.ts";
import {
  deriveSandboxSecurityExternalTokenRegistry,
  normalizeSandboxSecurityExternalDetectorResult,
  validateSandboxSecuritySanitizedJudgePayload
} from "./sanitized-boundary.ts";
import {
  validateSandboxSecurityDecisionSemantics,
  type SandboxSecurityEvaluationEvidenceLedger,
  type SandboxSecurityRoutedObligationRecord,
  type SandboxSecuritySlotEvaluationRecord
} from "./semantic-validator.ts";
import {
  normalizeSandboxSecurityEvaluationRequest,
  type SandboxSecurityEvaluationRequest
} from "./source-authority.ts";
import {
  normalizeSandboxSecurityDecision
} from "../../../../shared/contracts/sandbox-security.ts";
import type {
  SandboxDetectorRun,
  SandboxSecurityDecision,
  SandboxSecurityFinding,
  SandboxSecuritySeverity
} from "../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityEngine {
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    callerSignal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}

const INTERNAL = "sandbox_security_internal_invalid";
const CANCELLED = "sandbox_security_cancelled";
const DECISION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const SEVERITY_RANK: Record<SandboxSecuritySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function throwNamed(name: string, message = name): never {
  const error = new Error(message);
  error.name = name;
  throw error;
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
  if (!Number.isFinite(Date.parse(value))) return false;
  return /Z$|[+-]\d{2}:\d{2}$/.test(value);
}

function entitiesFromDrafts(
  drafts: readonly SandboxSecurityDraftFinding[]
) {
  const entities: Array<
    | { kind: "content_source"; source_handle: string }
    | { kind: "tool_request"; call_handle: string }
  > = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    for (const ref of draft.subject_refs) {
      if (ref.kind === "content_source") {
        const key = `s:${ref.source_handle}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push({
            kind: "content_source",
            source_handle: ref.source_handle
          });
        }
      } else {
        const key = `c:${ref.call_handle}`;
        if (!seen.has(key)) {
          seen.add(key);
          entities.push({
            kind: "tool_request",
            call_handle: ref.call_handle
          });
        }
      }
    }
  }
  return entities as never;
}

function collectEvidenceRefs(
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
  if (engineFailure) {
    const marker = `evidence://sandbox/security/${decisionId}/engine-0001`;
    if (!seen.has(marker)) refs.push(marker);
  }
  return refs;
}

function subjectMapFromSnapshot(
  snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>,
  evaluation_nonce: string
): SandboxSecurityQualificationSubjectMap {
  return deepFreeze({
    evaluation_nonce,
    sources: snapshot.contents.map((content) =>
      Object.freeze({ source_handle: content.source_handle })
    ),
    ...(snapshot.tool_request
      ? {
          tool: Object.freeze({
            call_handle: snapshot.tool_request.call_handle
          })
        }
      : {})
  });
}

function shouldShortCircuit(
  slot: Readonly<SandboxSecurityDetectorSlotManifest>,
  evidence: Readonly<SandboxSecurityQualifiedSlotEvidence>
): boolean {
  const floor = slot.short_circuit_min_severity;
  if (floor === null) return false;
  for (const risk of evidence.accepted_risks) {
    if (SEVERITY_RANK[risk.severity] >= SEVERITY_RANK[floor]) {
      return true;
    }
  }
  return false;
}

export function createSandboxSecurityEngine(deps: {
  registry: SandboxSecurityDetectorRegistry;
  sanitizer?: SandboxSecuritySanitizer;
  runtime: SandboxSecurityRuntimePorts;
}): SandboxSecurityEngine {
  const { registry, sanitizer, runtime } = deps;
  if (!registry || !runtime) {
    throwNamed(INTERNAL);
  }

  return {
    async evaluate(request, callerSignal) {
      if (callerSignal?.aborted) {
        throwNamed(CANCELLED);
      }

      const startedAtMs = runtime.monotonicNowMs();
      if (!Number.isFinite(startedAtMs)) {
        throwNamed(INTERNAL);
      }

      // Budget starts immediately at evaluate entry.
      let deadline = createSandboxSecurityDeadlineController({
        runtime,
        normalWorkBudgetMs: 5000,
        startedAtMs
      });

      const assertNotCancelled = () => {
        if (callerSignal?.aborted) throwNamed(CANCELLED);
      };

      // Pre-ID stages
      let normalized;
      try {
        normalized = normalizeSandboxSecurityEvaluationRequest(request);
      } catch (error) {
        // authority / shared normalize failures are content-free fail-closed
        if (error && typeof error === "object" && "code" in error) {
          throw error;
        }
        throw error;
      }
      assertNotCancelled();
      if (deadline.remainingMs() <= 0) {
        throwNamed(INTERNAL, "pre_id_evaluation_budget_exhausted");
      }

      const prepared = prepareSandboxSecurityInput(normalized);
      assertNotCancelled();
      if (deadline.remainingMs() <= 0) {
        throwNamed(INTERNAL, "pre_id_evaluation_budget_exhausted");
      }

      const profile = resolveSandboxSecurityProfile(prepared.policy_profile_id);
      // recreate deadline with profile budget (always 5000)
      deadline = createSandboxSecurityDeadlineController({
        runtime,
        normalWorkBudgetMs: profile.normal_work_budget_ms,
        startedAtMs
      });

      const runLedger = createSandboxSecurityRunLedger({ profile });
      const resolved = resolveSandboxSecurityDetectorsForProfile(
        registry,
        profile
      );

      const contents = prepared.contents.map((content) =>
        deepFreeze({
          ...content,
          trust_class: deriveSandboxSecurityTrustClass({
            profile,
            evaluation_mode: prepared.evaluation_mode,
            authority_kind: content.authority_kind,
            source_type: content.source_type
          })
        })
      );

      const snapshot: SandboxSecurityRawDetectorSnapshot = deepFreeze({
        request_id: prepared.request_id,
        evaluation_mode: prepared.evaluation_mode,
        stage: prepared.stage,
        profile,
        contents,
        ...(prepared.tool_request
          ? { tool_request: prepared.tool_request }
          : {}),
        canonical_request_sha256: prepared.canonical_projection_sha256
      });

      if (deadline.remainingMs() <= 0) {
        throwNamed(INTERNAL, "pre_id_evaluation_budget_exhausted");
      }

      const decision_id = runtime.nextDecisionId();
      if (
        typeof decision_id !== "string" ||
        !DECISION_ID_PATTERN.test(decision_id)
      ) {
        throwNamed(INTERNAL, "decision_identity_invalid");
      }

      let engineFailure: SandboxSecurityDecisionBearingEngineFailure | null =
        null;
      let budgetPhase: SandboxSecurityDecisionBearingBudgetPhase =
        "detector_execution";

      if (deadline.remainingMs() <= 0) {
        engineFailure = {
          code: "evaluation_budget_exhausted",
          phase: "decision_identity"
        };
      }

      const subject_map = subjectMapFromSnapshot(snapshot, prepared.evaluation_nonce);
      const escalation = createSandboxSecurityEscalationState();
      const slotRecords = new Map<string, SandboxSecuritySlotEvaluationRecord>();
      const draftFindings: SandboxSecurityDraftFinding[] = [];
      let judgeResolution: readonly SandboxSecurityJudgeResolutionEvidence[] =
        [];
      let routedObligationRecords: SandboxSecurityRoutedObligationRecord[] = [];
      let shortCircuited = false;
      let publication: {
        token_map: SandboxSecurityPublicSubjectTokenMap;
        findings: readonly SandboxSecurityFinding[];
      } | null = null;
      let finalizedRuns: readonly SandboxDetectorRun[] | null = null;
      let created_at: string | null = null;
      let completeLedger: SandboxSecurityEvaluationEvidenceLedger | null = null;

      const rawRegistry = {
        evaluation_nonce: prepared.evaluation_nonce,
        content_subjects: snapshot.contents.map((content) => ({
          source_handle: content.source_handle,
          media_type: content.media_type,
          original_utf8_bytes: content.original_utf8_bytes,
          value: content.value
        })),
        ...(snapshot.tool_request
          ? {
              tool_subject: {
                call_handle: snapshot.tool_request.call_handle,
                has_target: snapshot.tool_request.has_target,
                arguments: snapshot.tool_request.arguments
              }
            }
          : {})
      };

      const markSkip = (
        slot: Readonly<SandboxSecurityDetectorSlotManifest>,
        obligation:
          | "profile_required"
          | "runtime_required"
          | "optional_not_selected",
        skip_reason:
          | "optional_not_configured"
          | "optional_not_selected"
          | "routing_not_selected"
          | "risk_short_circuit"
          | "evaluation_terminated"
      ) => {
        runLedger.markSkipped({
          slot_id: slot.slot_id,
          obligation,
          skip_reason,
          elapsed_ms: 0
        });
        slotRecords.set(
          slot.slot_id,
          deepFreeze({
            slot_id: slot.slot_id,
            status: "skipped",
            skip_reason
          })
        );
      };

      const settleMatchedLocal = async (
        slot: Readonly<SandboxSecurityDetectorSlotManifest>,
        detector: RawLocalDetector,
        obligation: "profile_required" | "runtime_required"
      ) => {
        budgetPhase = "detector_execution";
        const started = runtime.monotonicNowMs();
        runLedger.markStarted({
          slot_id: slot.slot_id,
          obligation,
          started_monotonic_ms: started
        });
        const lease = deadline.createDetectorLease({
          slot_timeout_ms: slot.timeout_ms,
          parent_signal: callerSignal
        });
        try {
          let raw;
          try {
            raw = await detector.detect(snapshot, lease.signal);
          } catch (error) {
            const elapsed = Math.max(0, runtime.monotonicNowMs() - started);
            if (lease.termination_reason === "work_budget") {
              engineFailure = {
                code: "evaluation_budget_exhausted",
                phase: "detector_execution"
              };
              runLedger.markTimeout({
                slot_id: slot.slot_id,
                elapsed_ms: elapsed
              });
              slotRecords.set(
                slot.slot_id,
                deepFreeze({ slot_id: slot.slot_id, status: "timeout" })
              );
              return "budget";
            }
            if (lease.termination_reason === "slot_timeout") {
              runLedger.markTimeout({
                slot_id: slot.slot_id,
                elapsed_ms: elapsed
              });
              slotRecords.set(
                slot.slot_id,
                deepFreeze({ slot_id: slot.slot_id, status: "timeout" })
              );
              return "continue";
            }
            if (lease.termination_reason === "caller_cancelled") {
              throwNamed(CANCELLED);
            }
            const code =
              error instanceof SandboxSecurityAdapterUnsupportedError
                ? "adapter_unsupported"
                : "detector_failed";
            runLedger.markFailed({
              slot_id: slot.slot_id,
              elapsed_ms: elapsed,
              error_code: code
            });
            slotRecords.set(
              slot.slot_id,
              deepFreeze({
                slot_id: slot.slot_id,
                status: "failed",
                error_code: code
              })
            );
            return "continue";
          }

          const elapsed = Math.max(0, runtime.monotonicNowMs() - started);
          if (lease.termination_reason === "work_budget") {
            engineFailure = {
              code: "evaluation_budget_exhausted",
              phase: "detector_execution"
            };
            runLedger.markTimeout({
              slot_id: slot.slot_id,
              elapsed_ms: elapsed
            });
            slotRecords.set(
              slot.slot_id,
              deepFreeze({ slot_id: slot.slot_id, status: "timeout" })
            );
            return "budget";
          }
          if (lease.termination_reason === "slot_timeout") {
            runLedger.markTimeout({
              slot_id: slot.slot_id,
              elapsed_ms: elapsed
            });
            slotRecords.set(
              slot.slot_id,
              deepFreeze({ slot_id: slot.slot_id, status: "timeout" })
            );
            return "continue";
          }

          const normalizedResult = normalizeSandboxSecurityRawDetectorResult(
            raw,
            rawRegistry as never
          );
          if (normalizedResult.status === "invalid_result") {
            runLedger.markInvalidResult({
              slot_id: slot.slot_id,
              elapsed_ms: elapsed,
              error_code: normalizedResult.error_code
            });
            slotRecords.set(
              slot.slot_id,
              deepFreeze({
                slot_id: slot.slot_id,
                status: "invalid_result",
                error_code: normalizedResult.error_code
              })
            );
            return "continue";
          }
          if (normalizedResult.status === "no_match") {
            runLedger.markNoMatch({
              slot_id: slot.slot_id,
              elapsed_ms: elapsed
            });
            slotRecords.set(
              slot.slot_id,
              deepFreeze({ slot_id: slot.slot_id, status: "no_match" })
            );
            return "continue";
          }

          // matched: settle then qualify
          runLedger.markMatched({
            slot_id: slot.slot_id,
            elapsed_ms: elapsed
          });
          budgetPhase = "qualification";
          const qualified = qualifySandboxSecuritySlotEvidence({
            slot,
            result: normalizedResult.result,
            decision_id,
            subject_map
          });
          slotRecords.set(
            slot.slot_id,
            deepFreeze({
              slot_id: slot.slot_id,
              status: "matched",
              normalized_result: normalizedResult.result,
              qualified_evidence: qualified
            })
          );
          escalation.addSlotEvidence(qualified);
          for (const draft of qualified.accepted_draft_findings) {
            draftFindings.push(draft);
          }
          return "matched" as const;
        } finally {
          lease.dispose();
        }
      };

      // -------- Detector execution (if budget remains after ID) --------
      if (!engineFailure) {
        const ruleSlot = profile.detector_slots.find(
          (slot) => slot.detector_kind === "rule"
        )!;
        const localSlot = profile.detector_slots.find(
          (slot) => slot.detector_kind === "local_model"
        )!;
        const judgeSlot = profile.detector_slots.find(
          (slot) => slot.detector_kind === "external_judge"
        )!;

        // RULE
        {
          const outcome = await settleMatchedLocal(
            ruleSlot,
            resolved.rule,
            "profile_required"
          );
          if (outcome === "budget") {
            // fall through to epilogue
          } else if (outcome === "matched") {
            const record = slotRecords.get(ruleSlot.slot_id);
            if (record?.status === "matched") {
              shortCircuited = shouldShortCircuit(
                ruleSlot,
                record.qualified_evidence
              );
            }
          }
          if (deadline.remainingMs() <= 0 && !engineFailure) {
            engineFailure = {
              code: "evaluation_budget_exhausted",
              phase: budgetPhase
            };
          }
        }

        // LOCAL
        if (!engineFailure) {
          if (shortCircuited) {
            const obligation =
              localSlot.base_obligation === "profile_required"
                ? "profile_required"
                : "optional_not_selected";
            markSkip(localSlot, obligation, "risk_short_circuit");
          } else if (
            localSlot.base_obligation === "optional" &&
            !resolved.local
          ) {
            markSkip(
              localSlot,
              "optional_not_selected",
              "optional_not_configured"
            );
          } else if (!resolved.local) {
            // profile required missing already fails at resolve
            markSkip(
              localSlot,
              "optional_not_selected",
              "optional_not_configured"
            );
          } else {
            const obligation =
              localSlot.base_obligation === "profile_required"
                ? "profile_required"
                : "runtime_required";
            const outcome = await settleMatchedLocal(
              localSlot,
              resolved.local,
              obligation
            );
            if (outcome === "budget") {
              // epilogue
            }
            if (deadline.remainingMs() <= 0 && !engineFailure) {
              engineFailure = {
                code: "evaluation_budget_exhausted",
                phase: budgetPhase
              };
            }
          }
        }

        // JUDGE
        if (!engineFailure) {
          if (shortCircuited) {
            markSkip(
              judgeSlot,
              "optional_not_selected",
              "risk_short_circuit"
            );
            if (escalation.lifecycle() === "collecting") {
              escalation.closeWithoutJudge();
            }
          } else {
            const signals = escalation.unresolvedSignals();
            if (signals.length === 0) {
              markSkip(
                judgeSlot,
                "optional_not_selected",
                "routing_not_selected"
              );
              escalation.closeWithoutJudge();
            } else if (!resolved.judge) {
              // routed but unavailable
              runLedger.markStarted({
                slot_id: judgeSlot.slot_id,
                obligation: "runtime_required",
                started_monotonic_ms: runtime.monotonicNowMs()
              });
              runLedger.markFailed({
                slot_id: judgeSlot.slot_id,
                elapsed_ms: 0,
                error_code: "detector_unavailable"
              });
              slotRecords.set(
                judgeSlot.slot_id,
                deepFreeze({
                  slot_id: judgeSlot.slot_id,
                  status: "failed",
                  error_code: "detector_unavailable"
                })
              );
              escalation.terminateJudgeAttempt({
                reason: "detector_unavailable"
              });
            } else {
              // route Judge
              const externalRegistry =
                deriveSandboxSecurityExternalTokenRegistry(snapshot);
              const obligations = escalation.materializeRoutedObligations({
                decision_id,
                token_registry: externalRegistry
              });
              routedObligationRecords = obligations.map((obligation) => {
                const signal = signals.find(
                  (item) =>
                    item.category === obligation.category
                );
                return deepFreeze({
                  ...obligation,
                  signal_subject_key: signal?.subject_key ?? "",
                  signal_category: obligation.category
                });
              });

              runLedger.markStarted({
                slot_id: judgeSlot.slot_id,
                obligation: "runtime_required",
                started_monotonic_ms: runtime.monotonicNowMs()
              });

              if (!sanitizer) {
                runLedger.markFailed({
                  slot_id: judgeSlot.slot_id,
                  elapsed_ms: 0,
                  error_code: "external_redaction_failed"
                });
                slotRecords.set(
                  judgeSlot.slot_id,
                  deepFreeze({
                    slot_id: judgeSlot.slot_id,
                    status: "failed",
                    error_code: "external_redaction_failed"
                  })
                );
                escalation.terminateJudgeAttempt({
                  reason: "external_redaction_failed"
                });
              } else {
                budgetPhase = "sanitization";
                const lease = deadline.createDetectorLease({
                  slot_timeout_ms: judgeSlot.timeout_ms,
                  parent_signal: callerSignal
                });
                const started = runtime.monotonicNowMs();
                try {
                  let sanitizedRaw;
                  try {
                    sanitizedRaw = await sanitizer.sanitize(
                      snapshot,
                      obligations,
                      lease.signal
                    );
                  } catch {
                    const elapsed = Math.max(
                      0,
                      runtime.monotonicNowMs() - started
                    );
                    if (lease.termination_reason === "work_budget") {
                      engineFailure = {
                        code: "evaluation_budget_exhausted",
                        phase: "sanitization"
                      };
                      runLedger.markTimeout({
                        slot_id: judgeSlot.slot_id,
                        elapsed_ms: elapsed
                      });
                      slotRecords.set(
                        judgeSlot.slot_id,
                        deepFreeze({
                          slot_id: judgeSlot.slot_id,
                          status: "timeout"
                        })
                      );
                      escalation.terminateJudgeAttempt({
                        reason: "detector_timeout"
                      });
                    } else if (lease.termination_reason === "slot_timeout") {
                      runLedger.markTimeout({
                        slot_id: judgeSlot.slot_id,
                        elapsed_ms: elapsed
                      });
                      slotRecords.set(
                        judgeSlot.slot_id,
                        deepFreeze({
                          slot_id: judgeSlot.slot_id,
                          status: "timeout"
                        })
                      );
                      escalation.terminateJudgeAttempt({
                        reason: "detector_timeout"
                      });
                    } else if (
                      lease.termination_reason === "caller_cancelled"
                    ) {
                      throwNamed(CANCELLED);
                    } else {
                      runLedger.markFailed({
                        slot_id: judgeSlot.slot_id,
                        elapsed_ms: elapsed,
                        error_code: "external_redaction_failed"
                      });
                      slotRecords.set(
                        judgeSlot.slot_id,
                        deepFreeze({
                          slot_id: judgeSlot.slot_id,
                          status: "failed",
                          error_code: "external_redaction_failed"
                        })
                      );
                      escalation.terminateJudgeAttempt({
                        reason: "external_redaction_failed"
                      });
                    }
                    sanitizedRaw = null;
                  }

                  if (sanitizedRaw) {
                    budgetPhase = "boundary_normalization";
                    let validated;
                    try {
                      validated = validateSandboxSecuritySanitizedJudgePayload(
                        sanitizedRaw,
                        externalRegistry,
                        snapshot,
                        obligations
                      );
                    } catch {
                      const elapsed = Math.max(
                        0,
                        runtime.monotonicNowMs() - started
                      );
                      runLedger.markFailed({
                        slot_id: judgeSlot.slot_id,
                        elapsed_ms: elapsed,
                        error_code: "external_redaction_failed"
                      });
                      slotRecords.set(
                        judgeSlot.slot_id,
                        deepFreeze({
                          slot_id: judgeSlot.slot_id,
                          status: "failed",
                          error_code: "external_redaction_failed"
                        })
                      );
                      escalation.terminateJudgeAttempt({
                        reason: "external_redaction_failed"
                      });
                      validated = null;
                    }

                    if (validated) {
                      budgetPhase = "judge_resolution";
                      let externalRaw;
                      try {
                        externalRaw = await (
                          resolved.judge as SanitizedExternalDetector
                        ).detect(validated, lease.signal);
                      } catch (error) {
                        const elapsed = Math.max(
                          0,
                          runtime.monotonicNowMs() - started
                        );
                        if (lease.termination_reason === "work_budget") {
                          engineFailure = {
                            code: "evaluation_budget_exhausted",
                            phase: "judge_resolution"
                          };
                          runLedger.markTimeout({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "timeout"
                            })
                          );
                          escalation.terminateJudgeAttempt({
                            reason: "detector_timeout"
                          });
                        } else if (
                          lease.termination_reason === "slot_timeout"
                        ) {
                          runLedger.markTimeout({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "timeout"
                            })
                          );
                          escalation.terminateJudgeAttempt({
                            reason: "detector_timeout"
                          });
                        } else if (
                          lease.termination_reason === "caller_cancelled"
                        ) {
                          throwNamed(CANCELLED);
                        } else {
                          const code =
                            error instanceof
                            SandboxSecurityAdapterUnsupportedError
                              ? "adapter_unsupported"
                              : "detector_failed";
                          runLedger.markFailed({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed,
                            error_code: code
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "failed",
                              error_code: code
                            })
                          );
                          escalation.terminateJudgeAttempt({
                            reason: "detector_failed"
                          });
                        }
                        externalRaw = null;
                      }

                      if (externalRaw) {
                        const elapsed = Math.max(
                          0,
                          runtime.monotonicNowMs() - started
                        );
                        const extNorm =
                          normalizeSandboxSecurityExternalDetectorResult(
                            externalRaw,
                            externalRegistry,
                            validated
                          );
                        if (extNorm.status === "invalid_result") {
                          runLedger.markInvalidResult({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed,
                            error_code: extNorm.error_code
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "invalid_result",
                              error_code: extNorm.error_code
                            })
                          );
                          const outcome: SandboxSecurityNormalizedJudgeOutcome =
                            {
                              status: "invalid_result",
                              error_code: extNorm.error_code
                            };
                          const applied = escalation.applyJudgeOutcome(outcome);
                          judgeResolution = applied.resolution_evidence;
                          escalation.close();
                        } else if (extNorm.status === "no_match") {
                          runLedger.markNoMatch({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "no_match"
                            })
                          );
                          const applied = escalation.applyJudgeOutcome({
                            status: "no_match",
                            covered_obligation_ids: []
                          });
                          judgeResolution = applied.resolution_evidence;
                          escalation.close();
                        } else {
                          // matched external → qualify with judge slot
                          budgetPhase = "qualification";
                          const qualified =
                            qualifySandboxSecuritySlotEvidence({
                              slot: judgeSlot,
                              result: {
                                candidates: extNorm.result.candidates,
                                clearances: extNorm.result.clearances
                              },
                              decision_id,
                              subject_map
                            });
                          runLedger.markMatched({
                            slot_id: judgeSlot.slot_id,
                            elapsed_ms: elapsed
                          });
                          slotRecords.set(
                            judgeSlot.slot_id,
                            deepFreeze({
                              slot_id: judgeSlot.slot_id,
                              status: "matched",
                              normalized_result: {
                                candidates: extNorm.result.candidates,
                                clearances: extNorm.result.clearances
                              },
                              qualified_evidence: qualified
                            })
                          );
                          const applied = escalation.applyJudgeOutcome({
                            status: "matched",
                            evidence: qualified,
                            covered_obligation_ids: [
                              ...extNorm.covered_obligation_ids
                            ]
                          });
                          judgeResolution = applied.resolution_evidence;
                          for (const draft of applied.accepted_draft_findings) {
                            if (
                              !draftFindings.some(
                                (item) => item.finding_id === draft.finding_id
                              )
                            ) {
                              draftFindings.push(draft);
                            }
                          }
                          // also include accepted drafts from judge evidence
                          for (const draft of qualified.accepted_draft_findings) {
                            if (
                              !draftFindings.some(
                                (item) => item.finding_id === draft.finding_id
                              )
                            ) {
                              draftFindings.push(draft);
                            }
                          }
                          escalation.close();
                        }
                      }
                    }
                  }
                } finally {
                  lease.dispose();
                }
              }
            }
          }
        }

        // Ensure all slots terminal if budget failure mid-flight
        if (engineFailure) {
          for (const slot of profile.detector_slots) {
            if (slotRecords.has(slot.slot_id)) continue;
            const snap = runLedger.snapshot().slots.find(
              (item) => item.slot_id === slot.slot_id
            );
            if (!snap || snap.status === "not_started") {
              const obligation =
                slot.base_obligation === "profile_required"
                  ? "profile_required"
                  : "optional_not_selected";
              markSkip(slot, obligation, "evaluation_terminated");
            } else if (snap.status === "running") {
              runLedger.markTimeout({
                slot_id: slot.slot_id,
                elapsed_ms: 0
              });
              slotRecords.set(
                slot.slot_id,
                deepFreeze({ slot_id: slot.slot_id, status: "timeout" })
              );
            }
          }
          if (
            escalation.lifecycle() === "collecting" ||
            escalation.lifecycle() === "obligations_materialized"
          ) {
            try {
              escalation.terminateJudgeAttempt({
                reason: "evaluation_terminated"
              });
            } catch {
              try {
                escalation.close();
              } catch {
                // ignore
              }
            }
          }
        }
      } else {
        // decision_identity budget exhaustion: zero detectors, Scheme B
        for (const slot of profile.detector_slots) {
          const obligation =
            slot.base_obligation === "profile_required"
              ? "profile_required"
              : "optional_not_selected";
          markSkip(slot, obligation, "evaluation_terminated");
        }
        try {
          escalation.closeWithoutJudge();
        } catch {
          escalation.terminateJudgeAttempt({
            reason: "evaluation_terminated"
          });
        }
      }

      // Ensure escalation closed
      if (escalation.lifecycle() !== "closed") {
        try {
          if (
            escalation.lifecycle() === "collecting" &&
            escalation.unresolvedSignals().length === 0
          ) {
            escalation.closeWithoutJudge();
          } else if (escalation.lifecycle() === "judge_applied") {
            escalation.close();
          } else {
            escalation.terminateJudgeAttempt({
              reason: "evaluation_terminated"
            });
          }
        } catch {
          // best effort
        }
      }

      // Ensure every slot has a record
      for (const slot of profile.detector_slots) {
        if (!slotRecords.has(slot.slot_id)) {
          const snap = runLedger.snapshot().slots.find(
            (item) => item.slot_id === slot.slot_id
          );
          if (snap?.status === "not_started") {
            markSkip(
              slot,
              slot.base_obligation === "profile_required"
                ? "profile_required"
                : "optional_not_selected",
              "evaluation_terminated"
            );
          }
        }
      }

      // Publication
      budgetPhase = "publication";
      if (deadline.remainingMs() <= 0 && !engineFailure) {
        engineFailure = {
          code: "evaluation_budget_exhausted",
          phase: "publication"
        };
      }
      if (!publication) {
        const token_map = materializeSandboxSecurityPublicSubjectTokens({
          decision_id,
          accepted_entities: entitiesFromDrafts(draftFindings)
        });
        const findings = publishSandboxSecurityFindings({
          decision_id,
          draft_findings: draftFindings,
          token_map
        });
        publication = { token_map, findings };
      }

      // attach + finalize
      budgetPhase = "run_finalization";
      if (deadline.remainingMs() <= 0 && !engineFailure) {
        engineFailure = {
          code: "evaluation_budget_exhausted",
          phase: "run_finalization"
        };
      }
      runLedger.attachPublishedFindings(publication.findings);
      finalizedRuns = runLedger.finalize();

      // reduce
      budgetPhase = "reduction";
      if (deadline.remainingMs() <= 0 && !engineFailure) {
        engineFailure = {
          code: "evaluation_budget_exhausted",
          phase: "reduction"
        };
      }
      const unresolved =
        escalation.unresolvedSignals() as readonly SandboxSecurityEscalationSignal[];

      const reduced = reduceSandboxSecurityPolicy({
        stage: prepared.stage,
        evaluation_mode: prepared.evaluation_mode,
        profile,
        findings: publication.findings,
        detector_runs: finalizedRuns,
        unresolved_escalation_signals: unresolved,
        engine_failure: engineFailure
      });

      // created_at once
      budgetPhase = "decision_materialization";
      created_at = runtime.now();
      if (typeof created_at !== "string" || !isStrictIso8601(created_at)) {
        throwNamed(INTERNAL, "runtime_clock_invalid");
      }

      const orderedRecords = profile.detector_slots.map((slot) => {
        const record = slotRecords.get(slot.slot_id);
        if (!record) {
          throwNamed(INTERNAL, "missing_slot_record");
        }
        return record;
      });

      completeLedger = deepFreeze({
        decision_id,
        request_id: prepared.request_id,
        created_at,
        evaluation_mode: prepared.evaluation_mode,
        stage: prepared.stage,
        profile,
        subject_map,
        slot_records: orderedRecords,
        public_subject_token_map: publication.token_map,
        routed_obligations: routedObligationRecords,
        judge_resolution_evidence: judgeResolution,
        published_findings: publication.findings,
        detector_runs: finalizedRuns,
        unresolved_escalation_signals: unresolved,
        engine_failure: engineFailure
      }) as SandboxSecurityEvaluationEvidenceLedger;

      const candidate: SandboxSecurityDecision = {
        schema_version: "sandbox-security-decision.v1",
        decision_id,
        request_id: prepared.request_id,
        evaluation_mode: prepared.evaluation_mode,
        stage: prepared.stage,
        policy_profile_id: profile.profile_id,
        verdict: reduced.verdict,
        action: reduced.action,
        risk_level: reduced.risk_level,
        findings: [...publication.findings],
        detector_runs: [...finalizedRuns],
        evidence_refs: collectEvidenceRefs(
          decision_id,
          publication.findings,
          engineFailure
        ),
        created_at
      };

      const normalizedDecision = normalizeSandboxSecurityDecision(candidate);
      if (!normalizedDecision) {
        throwNamed(INTERNAL, "decision_materialization_invalid");
      }

      try {
        const validated = validateSandboxSecurityDecisionSemantics(
          normalizedDecision,
          completeLedger
        );
        // drop snapshot retention
        void snapshot;
        return deepFreeze(validated);
      } catch {
        // one recovery path
        if (
          engineFailure !== null &&
          (engineFailure as SandboxSecurityDecisionBearingEngineFailure).code ===
            "semantic_validation_failed"
        ) {
          throwNamed(INTERNAL, "semantic_validation_failed");
        }
        const recoveryFailure: SandboxSecurityDecisionBearingEngineFailure = {
          code: "semantic_validation_failed",
          phase: "semantic_validation"
        };
        const recoveryReduced = reduceSandboxSecurityPolicy({
          stage: prepared.stage,
          evaluation_mode: prepared.evaluation_mode,
          profile,
          findings: publication.findings,
          detector_runs: finalizedRuns,
          unresolved_escalation_signals: unresolved,
          engine_failure: recoveryFailure
        });
        const recoveryLedger = deepFreeze({
          ...completeLedger,
          engine_failure: recoveryFailure
        }) as SandboxSecurityEvaluationEvidenceLedger;
        const recoveryCandidate: SandboxSecurityDecision = {
          schema_version: "sandbox-security-decision.v1",
          decision_id,
          request_id: prepared.request_id,
          evaluation_mode: prepared.evaluation_mode,
          stage: prepared.stage,
          policy_profile_id: profile.profile_id,
          verdict: recoveryReduced.verdict,
          action: recoveryReduced.action,
          risk_level: recoveryReduced.risk_level,
          findings: [...publication.findings],
          detector_runs: [...finalizedRuns],
          evidence_refs: collectEvidenceRefs(
            decision_id,
            publication.findings,
            recoveryFailure
          ),
          created_at: created_at!
        };
        const recoveryNormalized =
          normalizeSandboxSecurityDecision(recoveryCandidate);
        if (!recoveryNormalized) {
          throwNamed(INTERNAL, "decision_materialization_invalid");
        }
        try {
          return deepFreeze(
            validateSandboxSecurityDecisionSemantics(
              recoveryNormalized,
              recoveryLedger
            )
          );
        } catch {
          throwNamed(INTERNAL, "semantic_validation_failed");
        }
      }
    }
  };
}
