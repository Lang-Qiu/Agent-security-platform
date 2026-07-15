export interface SandboxSecurityRuntimePorts {
  now(): string;
  nextDecisionId(): string;
  monotonicNowMs(): number;
  scheduleTimeout(delayMs: number, callback: () => void): () => void;
}

export interface SandboxSecurityDetectorLease {
  readonly signal: AbortSignal;
  readonly effective_timeout_ms: number;
  readonly termination_reason:
    | "slot_timeout"
    | "work_budget"
    | "caller_cancelled"
    | null;

  closeGeneration(): void;
  isGenerationOpen(): boolean;
  dispose(): void;
}

export interface SandboxSecurityDeadlineController {
  remainingMs(): number;

  createDetectorLease(input: Readonly<{
    slot_timeout_ms: number;
    parent_signal?: AbortSignal;
  }>): SandboxSecurityDetectorLease;
}

function internalInvalid(message: string): never {
  const error = new Error(message);
  error.name = "sandbox_security_internal_invalid";
  throw error;
}

export function createSandboxSecurityDeadlineController(input: {
  runtime: SandboxSecurityRuntimePorts;
  normalWorkBudgetMs: number;
  startedAtMs: number;
}): SandboxSecurityDeadlineController {
  const { runtime, normalWorkBudgetMs, startedAtMs } = input;
  if (
    !Number.isFinite(normalWorkBudgetMs) ||
    normalWorkBudgetMs < 0 ||
    !Number.isFinite(startedAtMs)
  ) {
    internalInvalid("sandbox_security_internal_invalid");
  }
  if (
    typeof runtime.now !== "function" ||
    typeof runtime.nextDecisionId !== "function" ||
    typeof runtime.monotonicNowMs !== "function" ||
    typeof runtime.scheduleTimeout !== "function"
  ) {
    internalInvalid("sandbox_security_internal_invalid");
  }

  function remainingMs(): number {
    const now = runtime.monotonicNowMs();
    if (!Number.isFinite(now)) {
      internalInvalid("sandbox_security_internal_invalid");
    }
    return Math.max(0, normalWorkBudgetMs - (now - startedAtMs));
  }

  return {
    remainingMs,
    createDetectorLease(leaseInput) {
      if (
        !leaseInput ||
        typeof leaseInput !== "object" ||
        !Object.hasOwn(leaseInput, "slot_timeout_ms") ||
        typeof leaseInput.slot_timeout_ms !== "number" ||
        !Number.isFinite(leaseInput.slot_timeout_ms) ||
        leaseInput.slot_timeout_ms < 0
      ) {
        internalInvalid("sandbox_security_internal_invalid");
      }

      const remaining = remainingMs();
      const effective_timeout_ms = Math.min(
        leaseInput.slot_timeout_ms,
        remaining
      );
      const controller = new AbortController();
      let generationOpen = true;
      let disposed = false;
      let termination_reason:
        | "slot_timeout"
        | "work_budget"
        | "caller_cancelled"
        | null = null;
      let cancelTimer: (() => void) | null = null;
      let parentListener: (() => void) | null = null;

      const abortWith = (
        reason: "slot_timeout" | "work_budget" | "caller_cancelled"
      ): void => {
        if (disposed || termination_reason !== null) {
          return;
        }
        termination_reason = reason;
        if (!controller.signal.aborted) {
          controller.abort(reason);
        }
      };

      // Parent cancel immediately if already aborted.
      if (leaseInput.parent_signal) {
        const parent = leaseInput.parent_signal;
        if (parent.aborted) {
          abortWith("caller_cancelled");
        } else {
          const onParentAbort = () => {
            if (disposed) return;
            abortWith("caller_cancelled");
          };
          parent.addEventListener("abort", onParentAbort, { once: true });
          parentListener = () => {
            parent.removeEventListener("abort", onParentAbort);
          };
        }
      }

      // Schedule effective timeout. When remaining is 0, schedule immediate.
      const delayMs = effective_timeout_ms;
      try {
        cancelTimer = runtime.scheduleTimeout(delayMs, () => {
          if (disposed || termination_reason !== null) {
            return;
          }
          // work budget wins on simultaneous expiry: if remaining budget is 0
          // at fire time, or effective timeout was constrained by remaining,
          // prefer work_budget when remaining budget is exhausted at callback.
          const remainingNow = remainingMs();
          if (remainingNow <= 0) {
            abortWith("work_budget");
            return;
          }
          // If slot timeout is strictly smaller than remaining at creation, it
          // is a pure slot timeout. If they were equal at creation, work budget
          // wins by locked rule (simultaneous).
          if (leaseInput.slot_timeout_ms >= remaining) {
            // effective was remaining-bound at creation => work budget path
            // simultaneous or budget-limited
            if (leaseInput.slot_timeout_ms === remaining) {
              abortWith("work_budget");
            } else {
              // slot > remaining at creation => budget limited
              abortWith("work_budget");
            }
            return;
          }
          abortWith("slot_timeout");
        });
      } catch {
        internalInvalid("sandbox_security_internal_invalid");
      }
      if (typeof cancelTimer !== "function") {
        internalInvalid("sandbox_security_internal_invalid");
      }

      const lease: SandboxSecurityDetectorLease = {
        get signal() {
          return controller.signal;
        },
        get effective_timeout_ms() {
          return effective_timeout_ms;
        },
        get termination_reason() {
          return termination_reason;
        },
        closeGeneration() {
          generationOpen = false;
        },
        isGenerationOpen() {
          return generationOpen && !disposed;
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          generationOpen = false;
          if (cancelTimer) {
            try {
              cancelTimer();
            } catch {
              // ignore dispose cancel errors
            }
            cancelTimer = null;
          }
          if (parentListener) {
            try {
              parentListener();
            } catch {
              // ignore
            }
            parentListener = null;
          }
        }
      };
      return lease;
    }
  };
}
