import { createHash } from "node:crypto";
import { isSafeReference } from "./contract.ts";
import type {
  SimulatedToolRequest,
  SimulatedToolResult
} from "../simulated-tools/contract.ts";
import type { SandboxToolResultPayload } from "../../../../shared/types/sandbox.ts";

// -- SHA-256 ---------------------------------------------------------------

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256MonitorValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// -- canonical serialization -----------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCanonicalValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.every((item) => isValidCanonicalValue(item));
  }
  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isValidCanonicalValue(item));
  }
  return false; // undefined, function, bigint, symbol, etc.
}

export function canonicalizeMonitorValue(value: unknown): string {
  if (!isValidCanonicalValue(value)) {
    throw new Error("Value contains unsupported types for canonical serialization");
  }

  // Detect cycles
  const seen = new WeakSet<object>();
  function detectCycles(v: unknown): void {
    if (isPlainObject(v) || Array.isArray(v)) {
      if (seen.has(v as object)) {
        throw new Error("Value contains circular references");
      }
      seen.add(v as object);
      if (Array.isArray(v)) {
        for (const item of v) detectCycles(item);
      } else {
        for (const key of Object.keys(v as Record<string, unknown>).sort()) {
          detectCycles((v as Record<string, unknown>)[key]);
        }
      }
    }
  }
  detectCycles(value);

  return JSON.stringify(value, (key, val) => {
    if (isPlainObject(val) && !Array.isArray(val)) {
      // Sort keys for canonical output
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

// -- frozen snapshots ------------------------------------------------------

export function createFrozenMonitorSnapshot<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value as Readonly<T>;
  }

  // Detect cycles
  const seen = new WeakSet<object>();
  function detectCycles(v: unknown): void {
    if (v !== null && typeof v === "object") {
      if (seen.has(v as object)) {
        throw new Error("Cannot create frozen snapshot of circular structure");
      }
      seen.add(v as object);
      if (Array.isArray(v)) {
        for (const item of v) detectCycles(item);
      } else {
        for (const val of Object.values(v as Record<string, unknown>)) {
          detectCycles(val);
        }
      }
    }
  }
  detectCycles(value);

  function deepFreezeCopy<T>(v: T): Readonly<T> {
    if (v === null || typeof v !== "object") {
      return v as Readonly<T>;
    }
    if (Array.isArray(v)) {
      const frozenArr = v.map((item) => deepFreezeCopy(item));
      return Object.freeze(frozenArr) as unknown as Readonly<T>;
    }
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>)) {
      copy[key] = deepFreezeCopy((v as Record<string, unknown>)[key]);
    }
    return Object.freeze(copy) as unknown as Readonly<T>;
  }

  return deepFreezeCopy(value);
}

// -- tool references -------------------------------------------------------

export function createToolArgumentsRef(request: SimulatedToolRequest): string {
  const canonical = canonicalizeMonitorValue(request.arguments);
  const digest = sha256MonitorValue(canonical);
  return `sha256://${digest}`;
}

export function createToolTargetRef(request: SimulatedToolRequest): string {
  const canonical = canonicalizeMonitorValue(request.arguments);
  const digest = sha256MonitorValue(canonical);
  return `simulated-target://${request.tool_name}/${digest}`;
}

export function createToolResultRef(result: SimulatedToolResult): string {
  // For safe-result refs, hash the canonical result structure
  // excluding raw content/output values
  const safeResult = {
    call_id: result.call_id,
    tool_name: result.tool_name,
    status: result.status
  };
  const canonical = canonicalizeMonitorValue(safeResult);
  const digest = sha256MonitorValue(canonical);
  return `simulated-result://${result.call_id}/${digest}`;
}

// -- sensitive value scanning ----------------------------------------------

export function containsMonitorSensitiveValue(
  value: unknown,
  sensitiveValues: readonly string[]
): boolean {
  if (typeof value === "string") {
    return sensitiveValues.some((sensitive) => value.includes(sensitive));
  }
  if (Array.isArray(value)) {
    return value.some((item) =>
      containsMonitorSensitiveValue(item, sensitiveValues)
    );
  }
  if (isPlainObject(value)) {
    return Object.values(value).some((v) =>
      containsMonitorSensitiveValue(v, sensitiveValues)
    );
  }
  return false;
}

// -- tool result normalization ---------------------------------------------

const SIMULATED_TOOL_NAMES = ["send_email", "read_file", "write_file", "call_api"] as const;
const TOOL_RESULT_STATUSES = ["simulated_success", "rejected"] as const;
const STATE_CHANGES = ["none", "outbox_append", "virtual_file_write"] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeCorrelationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

// Normalizer for simulated tool result payload (shared type)
// Used for intercepted tool results
export function normalizeMonitorToolResultPayload(
  value: unknown
): SandboxToolResultPayload | null {
  if (
    !isPlainObject(value) ||
    Object.keys(value as Record<string, unknown>).length !== 5
  ) {
    return null;
  }

  if (
    !isNonEmptyString(value.call_id) ||
    !isNonEmptyString(value.tool_name) ||
    !isNonEmptyString(value.status) ||
    !isNonEmptyString(value.result_ref) ||
    !isNonEmptyString(value.state_change)
  ) {
    return null;
  }

  if (!(SIMULATED_TOOL_NAMES as readonly string[]).includes(value.tool_name)) {
    return null;
  }

  if (!["success", "rejected", "failed"].includes(value.status)) {
    return null;
  }

  if (!isSafeReference(value.result_ref)) {
    return null;
  }

  if (!STATE_CHANGES.includes(value.state_change)) {
    return null;
  }

  return {
    call_id: value.call_id,
    tool_name: value.tool_name,
    status: value.status as SandboxToolResultPayload["status"],
    result_ref: value.result_ref,
    state_change: value.state_change
  };
}

export function normalizeMonitorToolResult(
  value: unknown,
  expectedRequest: SimulatedToolRequest
): SimulatedToolResult | null {
  if (!isPlainObject(value)) return null;

  // Must have the correlation context fields
  if (
    !isSafeCorrelationId(value.call_id) ||
    !isSafeCorrelationId(value.session_id) ||
    !isNonEmptyString(value.scenario_id) ||
    !isNonEmptyString(value.case_id) ||
    !isNonEmptyString(value.tool_name)
  ) {
    return null;
  }

  // Correlation must match expected request
  if (
    value.call_id !== expectedRequest.call_id ||
    value.session_id !== expectedRequest.session_id ||
    value.scenario_id !== expectedRequest.scenario_id ||
    value.case_id !== expectedRequest.case_id ||
    value.tool_name !== expectedRequest.tool_name
  ) {
    return null;
  }

  // Must have evidence with simulated: true, safe evidence_ref, valid state_change
  if (!isPlainObject(value.evidence)) return null;
  if (value.evidence.simulated !== true) return null;
  if (!isSafeReference(value.evidence.evidence_ref)) return null;
  if (!isNonEmptyString(value.evidence.target_ref)) return null;
  if (!STATE_CHANGES.includes(value.evidence.state_change)) return null;

  // Validate status-specific fields
  const status = value.status;
  if (status === "simulated_success") {
    // Must have exact keys for a success result
    const expectedSuccessKeys = [
      "call_id", "session_id", "scenario_id", "case_id",
      "tool_name", "status", "output", "summary", "evidence"
    ];

    if (!Object.keys(value as Record<string, unknown>).every(
      (k) => expectedSuccessKeys.includes(k)
    ) || expectedSuccessKeys.length !== Object.keys(value as Record<string, unknown>).length) {
      return null;
    }

    if (!isNonEmptyString(value.summary)) return null;

    // Validate tool-specific output shape
    if (!isPlainObject(value.output)) return null;

    switch (value.tool_name) {
      case "send_email": {
        const keys = Object.keys(value.output).sort();
        if (keys.length !== 3) return null;
        if (!isNonEmptyString(value.output.message_id)) return null;
        if (!isNonEmptyString(value.output.recipient)) return null;
        if (!isNonEmptyString(value.output.subject)) return null;
        break;
      }
      case "read_file": {
        const keys = Object.keys(value.output).sort();
        if (keys.length !== 2) return null;
        if (!isNonEmptyString(value.output.path)) return null;
        if (typeof value.output.content !== "string") return null;
        break;
      }
      case "write_file": {
        const keys = Object.keys(value.output).sort();
        if (keys.length !== 2) return null;
        if (!isNonEmptyString(value.output.path)) return null;
        if (typeof value.output.bytes_written !== "number" || !Number.isInteger(value.output.bytes_written)) return null;
        break;
      }
      case "call_api": {
        const keys = Object.keys(value.output).sort();
        if (keys.length !== 4) return null;
        if (!isNonEmptyString(value.output.endpoint)) return null;
        if (value.output.method !== "GET" && value.output.method !== "POST") return null;
        if (typeof value.output.status_code !== "number" || !Number.isInteger(value.output.status_code)) return null;
        if (!isPlainObject(value.output.body)) return null;
        break;
      }
      default:
        return null;
    }

    // Deep copy the result
    return {
      call_id: value.call_id,
      session_id: value.session_id,
      scenario_id: value.scenario_id,
      case_id: value.case_id,
      tool_name: value.tool_name,
      status: "simulated_success",
      summary: value.summary,
      output: JSON.parse(JSON.stringify(value.output)),
      evidence: {
        evidence_ref: value.evidence.evidence_ref,
        simulated: true,
        target_ref: value.evidence.target_ref,
        state_change: value.evidence.state_change
      }
    } as SimulatedToolResult;
  }

  if (status === "rejected") {
    const expectedRejectedKeys = [
      "call_id", "session_id", "scenario_id", "case_id",
      "tool_name", "status", "rejection_code", "summary", "evidence"
    ];

    if (!Object.keys(value as Record<string, unknown>).every(
      (k) => expectedRejectedKeys.includes(k)
    ) || expectedRejectedKeys.length !== Object.keys(value as Record<string, unknown>).length) {
      return null;
    }

    const validRejectionCodes = ["target_not_allowed", "resource_not_found"];
    if (!validRejectionCodes.includes(value.rejection_code)) return null;
    if (!isNonEmptyString(value.summary)) return null;

    return {
      call_id: value.call_id,
      session_id: value.session_id,
      scenario_id: value.scenario_id,
      case_id: value.case_id,
      tool_name: value.tool_name,
      status: "rejected",
      rejection_code: value.rejection_code,
      summary: value.summary,
      evidence: {
        evidence_ref: value.evidence.evidence_ref,
        simulated: true,
        target_ref: value.evidence.target_ref,
        state_change: value.evidence.state_change
      }
    } as SimulatedToolResult;
  }

  return null;
}
