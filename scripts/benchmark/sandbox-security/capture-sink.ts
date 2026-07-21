/**
 * P6-T1: Anonymous capture sink state machine.
 *
 * Records content-free provider outcomes only. No fixture ID, truth, category,
 * severity, verdict, action, metric, or raw provider prose.
 */

import type {
  SandboxSecurityCapturedProviderOutcome,
  SandboxSecurityCaptureSink
} from "../../../engines/sandbox/src/security-production/benchmark-composition.ts";
import type {
  SandboxSecurityReplayTransportOutcome
} from "../../../engines/sandbox/src/security-production/provider-outcomes.ts";

export const SANDBOX_SECURITY_CAPTURE_INPUT_COUNT = 300 as const;

export type SandboxSecurityCaptureSinkState =
  | "qualification_inventory"
  | "qualification_prewarm"
  | "ready"
  | "input_open"
  | "failed"
  | "drained";

export type SandboxSecurityCaptureSlotOutcome =
  SandboxSecurityReplayTransportOutcome<unknown>;

export interface SandboxSecurityCaptureInputUnit {
  readonly ollama: SandboxSecurityCaptureSlotOutcome;
  readonly judge: SandboxSecurityCaptureSlotOutcome;
}

export interface SandboxSecurityCaptureAccumulator {
  readonly state: SandboxSecurityCaptureSinkState;
  readonly qualification_inventory: SandboxSecurityCaptureSlotOutcome | null;
  readonly qualification_prewarm: SandboxSecurityCaptureSlotOutcome | null;
  readonly inputs: readonly SandboxSecurityCaptureInputUnit[];
  readonly closed_input_count: number;
}

const INVALID = "sandbox_security_capture_sink_invalid";
const NOT_CALLED: SandboxSecurityCaptureSlotOutcome = Object.freeze({
  status: "not_called"
});

function fail(code: string = INVALID): never {
  const error = new TypeError(code);
  error.name = INVALID;
  throw error;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    const child = (value as Record<string | symbol, unknown>)[key as string];
    if (child !== null && typeof child === "object") {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value).sort();
  const want = [...expected].sort();
  if (keys.length !== want.length) fail();
  for (let index = 0; index < want.length; index += 1) {
    if (keys[index] !== want[index]) fail();
  }
}

function isSuccessfulOutcome(outcome: unknown): boolean {
  if (!isPlainObject(outcome)) return false;
  return outcome.status === "response";
}

function normalizeSlotOutcome(outcome: unknown): SandboxSecurityCaptureSlotOutcome {
  if (!isPlainObject(outcome)) fail();
  const status = outcome.status;
  if (status === "not_called") {
    exactKeys(outcome, ["status"]);
    return deepFreeze({ status: "not_called" });
  }
  if (status === "response") {
    exactKeys(outcome, [
      "status",
      "http_status",
      "content_type",
      "normalized_response"
    ]);
    if (outcome.http_status !== 200) fail();
    if (outcome.content_type !== "application/json") fail();
    if (!isPlainObject(outcome.normalized_response) && !Array.isArray(outcome.normalized_response)) {
      // normalized_response must be a frozen data object; reject primitives/functions
      if (
        outcome.normalized_response === null ||
        typeof outcome.normalized_response !== "object"
      ) {
        fail();
      }
    }
    // Content-free sink: accept structure but freeze a shallow copy without
    // retaining unexpected methods.
    return deepFreeze({
      status: "response" as const,
      http_status: 200 as const,
      content_type: "application/json" as const,
      normalized_response: deepFreeze(
        JSON.parse(JSON.stringify(outcome.normalized_response)) as unknown
      )
    });
  }
  if (status === "http_error") {
    exactKeys(outcome, ["status", "http_status"]);
    if (
      typeof outcome.http_status !== "number" ||
      !Number.isInteger(outcome.http_status) ||
      outcome.http_status < 100 ||
      outcome.http_status > 599 ||
      outcome.http_status === 200
    ) {
      fail();
    }
    return deepFreeze({
      status: "http_error" as const,
      http_status: outcome.http_status
    });
  }
  if (status === "transport_error") {
    exactKeys(outcome, ["status", "error_code"]);
    if (
      outcome.error_code !== "connection_failed" &&
      outcome.error_code !== "response_too_large" &&
      outcome.error_code !== "provider_response_invalid"
    ) {
      fail();
    }
    return deepFreeze({
      status: "transport_error" as const,
      error_code: outcome.error_code
    });
  }
  if (status === "signal_termination") {
    exactKeys(outcome, ["status", "termination_reason"]);
    if (
      outcome.termination_reason !== "slot_timeout" &&
      outcome.termination_reason !== "work_budget"
    ) {
      fail();
    }
    return deepFreeze({
      status: "signal_termination" as const,
      termination_reason: outcome.termination_reason
    });
  }
  fail();
}

function assertNoOracleFields(value: unknown, depth = 0): void {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoOracleFields(item, depth + 1);
    return;
  }
  for (const key of Object.keys(value as object)) {
    if (
      key === "fixture_id" ||
      key === "primary_category" ||
      key === "ground_truth_severity" ||
      key === "verdict_class" ||
      key === "truth" ||
      key === "metric" ||
      key === "request_id" ||
      key === "OPENAI_API_KEY" ||
      key === "raw_body" ||
      key === "sanitized_content"
    ) {
      fail("sandbox_security_capture_sink_reject:oracle_field");
    }
    assertNoOracleFields((value as Record<string, unknown>)[key], depth + 1);
  }
}

function normalizeCapturedOutcome(
  value: unknown
): Readonly<SandboxSecurityCapturedProviderOutcome> {
  if (!isPlainObject(value)) fail();
  exactKeys(value, ["capture_phase", "provider", "operation", "outcome"]);
  assertNoOracleFields(value);
  const capture_phase = value.capture_phase;
  const provider = value.provider;
  const operation = value.operation;
  const outcome = normalizeSlotOutcome(value.outcome);

  if (
    capture_phase === "qualification" &&
    provider === "ollama" &&
    operation === "model_inventory"
  ) {
    return deepFreeze({
      capture_phase: "qualification",
      provider: "ollama",
      operation: "model_inventory",
      outcome
    }) as Readonly<SandboxSecurityCapturedProviderOutcome>;
  }
  if (
    (capture_phase === "qualification" || capture_phase === "evaluation") &&
    provider === "ollama" &&
    operation === "chat"
  ) {
    return deepFreeze({
      capture_phase,
      provider: "ollama",
      operation: "chat",
      outcome
    }) as Readonly<SandboxSecurityCapturedProviderOutcome>;
  }
  if (
    capture_phase === "evaluation" &&
    provider === "openai" &&
    operation === "responses"
  ) {
    return deepFreeze({
      capture_phase: "evaluation",
      provider: "openai",
      operation: "responses",
      outcome
    }) as Readonly<SandboxSecurityCapturedProviderOutcome>;
  }
  fail();
}

interface OpenInput {
  ollama: SandboxSecurityCaptureSlotOutcome | null;
  judge: SandboxSecurityCaptureSlotOutcome | null;
}

export function createSandboxSecurityCaptureSink(): SandboxSecurityCaptureSink &
  Readonly<{
    snapshot(): Readonly<SandboxSecurityCaptureAccumulator>;
  }> {
  let state: SandboxSecurityCaptureSinkState = "qualification_inventory";
  let qualificationInventory: SandboxSecurityCaptureSlotOutcome | null = null;
  let qualificationPrewarm: SandboxSecurityCaptureSlotOutcome | null = null;
  const inputs: SandboxSecurityCaptureInputUnit[] = [];
  let open: OpenInput | null = null;

  function markFailed(code: string = INVALID): never {
    state = "failed";
    open = null;
    fail(code);
  }

  function snapshot(): Readonly<SandboxSecurityCaptureAccumulator> {
    return deepFreeze({
      state,
      qualification_inventory: qualificationInventory,
      qualification_prewarm: qualificationPrewarm,
      inputs: inputs.map((unit) =>
        deepFreeze({
          ollama: unit.ollama,
          judge: unit.judge
        })
      ),
      closed_input_count: inputs.length
    });
  }

  const sink = {
    beginInput(): void {
      if (state === "failed" || state === "drained") fail();
      if (state !== "ready") {
        markFailed("sandbox_security_capture_sink_reject:begin_before_ready");
      }
      if (open !== null) {
        markFailed("sandbox_security_capture_sink_reject:begin_while_open");
      }
      if (inputs.length >= SANDBOX_SECURITY_CAPTURE_INPUT_COUNT) {
        markFailed("sandbox_security_capture_sink_reject:extra_input");
      }
      open = { ollama: null, judge: null };
      state = "input_open";
    },

    record(raw: Readonly<SandboxSecurityCapturedProviderOutcome>): void {
      if (state === "failed" || state === "drained") fail();
      let outcome: Readonly<SandboxSecurityCapturedProviderOutcome>;
      try {
        outcome = normalizeCapturedOutcome(raw);
      } catch {
        markFailed("sandbox_security_capture_sink_reject:malformed_record");
      }

      if (state === "qualification_inventory") {
        if (
          outcome.capture_phase !== "qualification" ||
          outcome.provider !== "ollama" ||
          outcome.operation !== "model_inventory"
        ) {
          markFailed("sandbox_security_capture_sink_reject:expected_inventory");
        }
        if (!isSuccessfulOutcome(outcome.outcome)) {
          markFailed("sandbox_security_capture_sink_reject:inventory_not_success");
        }
        qualificationInventory = outcome.outcome;
        state = "qualification_prewarm";
        return;
      }

      if (state === "qualification_prewarm") {
        if (
          outcome.capture_phase !== "qualification" ||
          outcome.provider !== "ollama" ||
          outcome.operation !== "chat"
        ) {
          markFailed("sandbox_security_capture_sink_reject:expected_prewarm");
        }
        if (!isSuccessfulOutcome(outcome.outcome)) {
          markFailed("sandbox_security_capture_sink_reject:prewarm_not_success");
        }
        qualificationPrewarm = outcome.outcome;
        state = "ready";
        return;
      }

      if (state === "ready") {
        // Permanently reject qualification after ready; evaluation needs open input.
        if (outcome.capture_phase === "qualification") {
          markFailed("sandbox_security_capture_sink_reject:qualification_after_ready");
        }
        markFailed("sandbox_security_capture_sink_reject:record_outside_input");
      }

      if (state !== "input_open" || open === null) {
        markFailed("sandbox_security_capture_sink_reject:record_outside_input");
      }

      if (outcome.capture_phase !== "evaluation") {
        markFailed("sandbox_security_capture_sink_reject:qualification_during_input");
      }

      if (
        outcome.provider === "ollama" &&
        outcome.operation === "chat"
      ) {
        if (open.ollama !== null) {
          markFailed("sandbox_security_capture_sink_reject:duplicate_ollama");
        }
        open.ollama = outcome.outcome;
        return;
      }

      if (
        outcome.provider === "openai" &&
        outcome.operation === "responses"
      ) {
        if (open.judge !== null) {
          markFailed("sandbox_security_capture_sink_reject:duplicate_judge");
        }
        open.judge = outcome.outcome;
        return;
      }

      markFailed("sandbox_security_capture_sink_reject:wrong_evaluation_slot");
    },

    endInput(): void {
      if (state === "failed" || state === "drained") fail();
      if (state !== "input_open" || open === null) {
        markFailed("sandbox_security_capture_sink_reject:end_without_open");
      }
      const unit = deepFreeze({
        ollama: open.ollama ?? NOT_CALLED,
        judge: open.judge ?? NOT_CALLED
      });
      inputs.push(unit);
      open = null;
      state = "ready";
    },

    assertDrained(): void {
      if (state === "failed") {
        fail("sandbox_security_capture_sink_reject:assert_drained_failed");
      }
      if (state === "drained") {
        fail("sandbox_security_capture_sink_reject:assert_drained_twice");
      }
      if (state === "input_open" || open !== null) {
        fail("sandbox_security_capture_sink_reject:assert_drained_open_input");
      }
      if (
        state !== "ready" ||
        qualificationInventory === null ||
        qualificationPrewarm === null
      ) {
        fail("sandbox_security_capture_sink_reject:assert_drained_incomplete_qualification");
      }
      if (inputs.length !== SANDBOX_SECURITY_CAPTURE_INPUT_COUNT) {
        fail("sandbox_security_capture_sink_reject:assert_drained_input_count");
      }
      state = "drained";
    },

    snapshot
  };

  return Object.freeze(sink);
}
