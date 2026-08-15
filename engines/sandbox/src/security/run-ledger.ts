import type {
  SandboxDetectorRun,
  SandboxDetectorRunErrorCode,
  SandboxDetectorRunObligation,
  SandboxDetectorSkipReason,
  SandboxSecurityFinding
} from "../../../../shared/types/sandbox-security.ts";
import type {
  SandboxSecurityDetectorSlotId,
  SandboxSecurityPolicyProfileManifest
} from "./policy-profiles.ts";

export type SandboxDetectorFailedRunErrorCode =
  | "detector_unavailable"
  | "detector_failed"
  | "external_redaction_failed"
  | "adapter_unsupported";

export type SandboxSecurityRunLedgerLifecycle =
  | "open"
  | "findings_attached"
  | "finalized";

export interface SandboxSecurityRunLedgerSlotSnapshot {
  readonly slot_id: SandboxSecurityDetectorSlotId;
  readonly status:
    | "not_started"
    | "skipped"
    | "running"
    | "matched"
    | "no_match"
    | "failed"
    | "timeout"
    | "invalid_result";
  readonly obligation?: SandboxDetectorRunObligation;
  readonly elapsed_ms?: number;
  readonly skip_reason?: SandboxDetectorSkipReason;
  readonly error_code?: SandboxDetectorRunErrorCode;
}

export interface SandboxSecurityRunLedgerSnapshot {
  readonly lifecycle: SandboxSecurityRunLedgerLifecycle;
  readonly slots: readonly SandboxSecurityRunLedgerSlotSnapshot[];
}

export interface SandboxSecurityRunLedger {
  markSkipped(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    obligation: SandboxDetectorRunObligation;
    skip_reason: SandboxDetectorSkipReason;
    elapsed_ms: number;
  }>): void;
  markStarted(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    obligation: SandboxDetectorRunObligation;
    started_monotonic_ms: number;
  }>): void;
  markMatched(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markNoMatch(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markFailed(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code: SandboxDetectorFailedRunErrorCode;
  }>): void;
  markTimeout(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
  }>): void;
  markInvalidResult(input: Readonly<{
    slot_id: SandboxSecurityDetectorSlotId;
    elapsed_ms: number;
    error_code: "detector_result_invalid" | "detector_content_leak";
  }>): void;
  attachPublishedFindings(
    findings: readonly SandboxSecurityFinding[]
  ): void;
  finalize(): readonly SandboxDetectorRun[];
  snapshot(): Readonly<SandboxSecurityRunLedgerSnapshot>;
}

type InternalStatus =
  | "not_started"
  | "skipped"
  | "running"
  | "matched"
  | "no_match"
  | "failed"
  | "timeout"
  | "invalid_result";

interface InternalSlot {
  readonly slot_id: SandboxSecurityDetectorSlotId;
  readonly detector_version: string;
  readonly detector_kind: "rule" | "local_model" | "external_judge";
  status: InternalStatus;
  obligation?: SandboxDetectorRunObligation;
  skip_reason?: SandboxDetectorSkipReason;
  error_code?: SandboxDetectorRunErrorCode;
  elapsed_ms?: number;
  finding_ids: string[];
}

const SKIP_REASONS = new Set<SandboxDetectorSkipReason>([
  "optional_not_configured",
  "optional_not_selected",
  "routing_not_selected",
  "risk_short_circuit",
  "evaluation_terminated"
]);

const FAILED_CODES = new Set<SandboxDetectorFailedRunErrorCode>([
  "detector_unavailable",
  "detector_failed",
  "external_redaction_failed",
  "adapter_unsupported"
]);

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

function isTerminal(status: InternalStatus): boolean {
  return (
    status === "skipped" ||
    status === "matched" ||
    status === "no_match" ||
    status === "failed" ||
    status === "timeout" ||
    status === "invalid_result"
  );
}

export function createSandboxSecurityRunLedger(input: Readonly<{
  profile: Readonly<SandboxSecurityPolicyProfileManifest>;
}>): SandboxSecurityRunLedger {
  if (!input?.profile?.detector_slots?.length) {
    throw new Error("sandbox_security_run_ledger_invalid:profile");
  }

  let lifecycle: SandboxSecurityRunLedgerLifecycle = "open";
  const slots: InternalSlot[] = input.profile.detector_slots.map((slot) => ({
    slot_id: slot.slot_id,
    detector_version: slot.detector_version,
    detector_kind: slot.detector_kind,
    status: "not_started",
    finding_ids: []
  }));
  const byId = new Map(slots.map((slot) => [slot.slot_id, slot]));
  let finalizedRuns: readonly SandboxDetectorRun[] | null = null;
  let frozenSnapshot: Readonly<SandboxSecurityRunLedgerSnapshot> | null = null;

  function requireOpen(): void {
    if (lifecycle === "finalized") {
      throw new Error("sandbox_security_run_ledger_invalid:finalized");
    }
  }

  function requireSlot(slot_id: string): InternalSlot {
    const slot = byId.get(slot_id as SandboxSecurityDetectorSlotId);
    if (!slot) {
      throw new Error("sandbox_security_run_ledger_invalid:unknown_slot");
    }
    return slot;
  }

  function assertElapsed(elapsed_ms: number): void {
    if (typeof elapsed_ms !== "number" || !Number.isFinite(elapsed_ms) || elapsed_ms < 0) {
      throw new Error("sandbox_security_run_ledger_invalid:elapsed");
    }
  }

  function markTerminalFromRunning(
    slot: InternalSlot,
    status: Exclude<InternalStatus, "not_started" | "skipped" | "running">,
    elapsed_ms: number,
    error_code?: SandboxDetectorRunErrorCode
  ): void {
    requireOpen();
    if (slot.status !== "running") {
      throw new Error("sandbox_security_run_ledger_invalid:not_running");
    }
    assertElapsed(elapsed_ms);
    slot.status = status;
    slot.elapsed_ms = elapsed_ms;
    if (error_code) slot.error_code = error_code;
  }

  const api: SandboxSecurityRunLedger = {
    markSkipped(markInput) {
      requireOpen();
      const slot = requireSlot(markInput.slot_id);
      if (slot.status !== "not_started") {
        throw new Error("sandbox_security_run_ledger_invalid:not_not_started");
      }
      if (!SKIP_REASONS.has(markInput.skip_reason)) {
        throw new Error("sandbox_security_run_ledger_invalid:skip_reason");
      }
      assertElapsed(markInput.elapsed_ms);
      slot.status = "skipped";
      slot.obligation = markInput.obligation;
      slot.skip_reason = markInput.skip_reason;
      slot.elapsed_ms = markInput.elapsed_ms;
    },
    markStarted(markInput) {
      requireOpen();
      const slot = requireSlot(markInput.slot_id);
      if (slot.status !== "not_started") {
        throw new Error("sandbox_security_run_ledger_invalid:not_not_started");
      }
      if (
        typeof markInput.started_monotonic_ms !== "number" ||
        !Number.isFinite(markInput.started_monotonic_ms)
      ) {
        throw new Error("sandbox_security_run_ledger_invalid:started");
      }
      slot.status = "running";
      slot.obligation = markInput.obligation;
    },
    markMatched(markInput) {
      markTerminalFromRunning(
        requireSlot(markInput.slot_id),
        "matched",
        markInput.elapsed_ms
      );
    },
    markNoMatch(markInput) {
      markTerminalFromRunning(
        requireSlot(markInput.slot_id),
        "no_match",
        markInput.elapsed_ms
      );
    },
    markFailed(markInput) {
      if (!FAILED_CODES.has(markInput.error_code)) {
        throw new Error("sandbox_security_run_ledger_invalid:error_code");
      }
      markTerminalFromRunning(
        requireSlot(markInput.slot_id),
        "failed",
        markInput.elapsed_ms,
        markInput.error_code
      );
    },
    markTimeout(markInput) {
      markTerminalFromRunning(
        requireSlot(markInput.slot_id),
        "timeout",
        markInput.elapsed_ms
      );
    },
    markInvalidResult(markInput) {
      if (
        markInput.error_code !== "detector_result_invalid" &&
        markInput.error_code !== "detector_content_leak"
      ) {
        throw new Error("sandbox_security_run_ledger_invalid:error_code");
      }
      markTerminalFromRunning(
        requireSlot(markInput.slot_id),
        "invalid_result",
        markInput.elapsed_ms,
        markInput.error_code
      );
    },
    attachPublishedFindings(findings) {
      requireOpen();
      if (lifecycle !== "open") {
        throw new Error("sandbox_security_run_ledger_invalid:attach_once");
      }
      if (!slots.every((slot) => isTerminal(slot.status))) {
        throw new Error("sandbox_security_run_ledger_invalid:slots_not_terminal");
      }
      if (!Array.isArray(findings)) {
        throw new Error("sandbox_security_run_ledger_invalid:findings");
      }

      const seenIds = new Set<string>();
      for (const finding of findings) {
        if (!finding || typeof finding.finding_id !== "string") {
          throw new Error("sandbox_security_run_ledger_invalid:finding");
        }
        if (seenIds.has(finding.finding_id)) {
          throw new Error("sandbox_security_run_ledger_invalid:duplicate_finding");
        }
        seenIds.add(finding.finding_id);
        const slot = byId.get(finding.detector_id as SandboxSecurityDetectorSlotId);
        if (!slot) {
          throw new Error("sandbox_security_run_ledger_invalid:unknown_detector");
        }
        if (slot.status !== "matched") {
          throw new Error("sandbox_security_run_ledger_invalid:non_matched_attachment");
        }
        slot.finding_ids.push(finding.finding_id);
      }
      lifecycle = "findings_attached";
    },
    finalize() {
      if (lifecycle === "finalized") {
        return finalizedRuns!;
      }
      if (lifecycle !== "findings_attached") {
        throw new Error("sandbox_security_run_ledger_invalid:missing_attachment");
      }
      if (!slots.every((slot) => isTerminal(slot.status))) {
        throw new Error("sandbox_security_run_ledger_invalid:non_terminal");
      }

      const runs: SandboxDetectorRun[] = slots.map((slot) => {
        const base = {
          detector_id: slot.slot_id,
          detector_version: slot.detector_version,
          detector_kind: slot.detector_kind,
          obligation: slot.obligation ?? "optional_not_selected",
          elapsed_ms: slot.elapsed_ms ?? 0
        };
        if (slot.status === "matched") {
          return {
            ...base,
            status: "matched" as const,
            finding_ids: [...slot.finding_ids]
          };
        }
        if (slot.status === "no_match") {
          return {
            ...base,
            status: "no_match" as const,
            finding_ids: []
          };
        }
        if (slot.status === "skipped") {
          return {
            ...base,
            status: "skipped" as const,
            skip_reason: slot.skip_reason!
          };
        }
        if (slot.status === "timeout") {
          return {
            ...base,
            status: "timeout" as const,
            error_code: "detector_timeout" as const
          };
        }
        if (slot.status === "invalid_result") {
          return {
            ...base,
            status: "invalid_result" as const,
            error_code: slot.error_code as
              | "detector_result_invalid"
              | "detector_content_leak"
          };
        }
        // failed
        return {
          ...base,
          status: "failed" as const,
          error_code: slot.error_code as SandboxDetectorFailedRunErrorCode
        };
      });

      finalizedRuns = deepFreeze(runs);
      lifecycle = "finalized";
      frozenSnapshot = deepFreeze(api.snapshot());
      return finalizedRuns;
    },
    snapshot() {
      if (lifecycle === "finalized" && frozenSnapshot) {
        return frozenSnapshot;
      }
      return deepFreeze({
        lifecycle,
        slots: slots.map((slot) => ({
          slot_id: slot.slot_id,
          status: slot.status,
          ...(slot.obligation ? { obligation: slot.obligation } : {}),
          ...(slot.elapsed_ms !== undefined ? { elapsed_ms: slot.elapsed_ms } : {}),
          ...(slot.skip_reason ? { skip_reason: slot.skip_reason } : {}),
          ...(slot.error_code ? { error_code: slot.error_code } : {})
        }))
      });
    }
  };

  return api;
}
