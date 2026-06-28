import type {
  SandboxPolicyAction,
  SandboxPolicyDecision
} from "../../../../shared/types/sandbox.ts";
import type {
  SimulatedToolRequest,
  SimulatedToolResult
} from "../simulated-tools/contract.ts";
import type { SandboxToolResultPayload } from "../../../../shared/types/sandbox.ts";

// -- stable constants ------------------------------------------------------

export const TRACK1_MONITOR_SCHEMA_VERSION = "track1-monitor.v1" as const;

// -- lifecycle -------------------------------------------------------------

export type MonitorLifecycleState = "open" | "sealed" | "finalized";

// -- decision stage --------------------------------------------------------

export type MonitorDecisionStage = "model_output" | "tool_request";

// -- session context -------------------------------------------------------

export interface MonitorSessionContext {
  task_id: string;
  session_id: string;
  model_ref: string;
  scenario_id?: string;
  case_id?: string;
}

// -- runtime ports ---------------------------------------------------------

export interface MonitorRuntimePorts {
  now(): string;
  nextId(kind: string): string;
}

// -- model middleware ------------------------------------------------------

export interface MonitorModelRequest {
  content: string;
  content_ref: string;
}

export interface MonitorModelResponse {
  content: string;
  content_ref: string;
}

export interface MonitoredModelOutcome {
  response: MonitorModelResponse;
  decision: SandboxPolicyDecision;
  can_continue: boolean;
}

export type MonitorModelNext = (
  request: MonitorModelRequest
) => MonitorModelResponse | Promise<MonitorModelResponse>;

// -- tool middleware -------------------------------------------------------

export interface MonitorToolDecisionContext {
  model_input: MonitorModelRequest;
  model_output: MonitorModelResponse;
}

export type MonitorToolNext = (
  request: SimulatedToolRequest
) => SimulatedToolResult | Promise<SimulatedToolResult>;

export type MonitoredToolOutcome =
  | {
      disposition: "executed";
      action: "allow" | "alert";
      decision: SandboxPolicyDecision;
      result: SimulatedToolResult;
    }
  | {
      disposition: "intercepted";
      action: "deny" | "ask";
      decision: SandboxPolicyDecision;
      result: SandboxToolResultPayload;
    };

// -- decision provider -----------------------------------------------------

export interface MonitorDecisionInput {
  stage: MonitorDecisionStage;
  session: Readonly<MonitorSessionContext>;
  subject_event_id: string;
  model_input: Readonly<MonitorModelRequest>;
  model_output: Readonly<MonitorModelResponse>;
  tool_request?: Readonly<SimulatedToolRequest>;
}

export interface MonitorDecisionProposal {
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  reason: string;
  evidence_refs: string[];
}

export interface MonitorDecisionProvider {
  decide(
    input: Readonly<MonitorDecisionInput>
  ): MonitorDecisionProposal | Promise<MonitorDecisionProposal>;
}

// -- fail-closed proposal --------------------------------------------------

const _failClosedEvidenceRefs: readonly string[] = Object.freeze(["evidence://track1/monitor/provider-failure"]);

export const MONITOR_FAIL_CLOSED_PROPOSAL: Readonly<MonitorDecisionProposal> = Object.freeze({
  policy_id: "policy://track1/monitor-fail-closed",
  action: "deny",
  reason_code: "decision_provider_failed",
  reason: "Decision provider failed closed",
  evidence_refs: _failClosedEvidenceRefs
});

// -- metadata --------------------------------------------------------------

export interface Track1MonitorMetadata {
  schema_version: "track1-monitor.v1";
  model_call_count: number;
  tool_call_count: number;
  decision_count: number;
  executed_tool_count: number;
  intercepted_tool_count: number;
  provider_failure_count: number;
}

// -- error taxonomy --------------------------------------------------------

export type Track1MonitorErrorCode =
  | "monitor_context_invalid"
  | "monitor_model_request_invalid"
  | "monitor_model_response_invalid"
  | "monitor_tool_request_invalid"
  | "monitor_decision_invalid"
  | "monitor_model_failed"
  | "monitor_tool_failed"
  | "monitor_state_invalid"
  | "monitor_session_empty"
  | "monitor_result_invalid";

const ERROR_MESSAGES: Record<Track1MonitorErrorCode, string> = {
  monitor_context_invalid: "Monitor context is invalid",
  monitor_model_request_invalid: "Monitor model request is invalid",
  monitor_model_response_invalid: "Monitor model response is invalid",
  monitor_tool_request_invalid: "Monitor tool request is invalid",
  monitor_decision_invalid: "Monitor decision provider is invalid",
  monitor_model_failed: "Monitored model callback failed",
  monitor_tool_failed: "Monitored tool callback failed",
  monitor_state_invalid: "Monitor session state is invalid",
  monitor_session_empty: "Monitor session has no model call",
  monitor_result_invalid: "Monitor result is invalid"
};

export class Track1MonitorError extends Error {
  readonly code: Track1MonitorErrorCode;

  constructor(code: Track1MonitorErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "Track1MonitorError";
    this.code = code;
  }
}

// -- safe reference validation ---------------------------------------------

const SAFE_REF_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>"{}|\\^`\x00-\x1f\x7f?&#]+$/;

export function isSafeReference(value: unknown): value is string {
  return typeof value === "string" && SAFE_REF_PATTERN.test(value);
}

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

const SCENARIO_ID_PATTERN = /^T1-SC-\d{3}$/;

export function isScenarioId(value: unknown): value is string {
  return typeof value === "string" && SCENARIO_ID_PATTERN.test(value);
}

export function isCaseId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Must start with a valid scenario ID prefix followed by -C and 3 digits
  return /^T1-SC-\d{3}-C\d{3}$/.test(value);
}

// -- guard helpers ---------------------------------------------------------

const SANDBOX_POLICY_ACTIONS: readonly SandboxPolicyAction[] = ["allow", "deny", "ask", "alert"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function hasOptionalString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || isNonEmptyString(value[key]);
}

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function allUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

// -- normalizers -----------------------------------------------------------

export function normalizeMonitorSessionContext(
  value: unknown
): MonitorSessionContext | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["task_id", "session_id", "model_ref"]) &&
    !hasExactKeys(value, ["task_id", "session_id", "model_ref", "scenario_id"]) &&
    !hasExactKeys(value, ["task_id", "session_id", "model_ref", "scenario_id", "case_id"]) &&
    !hasExactKeys(value, ["task_id", "session_id", "model_ref", "case_id"])
  ) {
    return null;
  }

  if (
    !isCorrelationId(value.task_id) ||
    !isCorrelationId(value.session_id) ||
    !isSafeReference(value.model_ref)
  ) {
    return null;
  }

  const result: MonitorSessionContext = {
    task_id: value.task_id,
    session_id: value.session_id,
    model_ref: value.model_ref
  };

  if ("scenario_id" in value && isNonEmptyString(value.scenario_id)) {
    if (!isScenarioId(value.scenario_id)) return null;
    result.scenario_id = value.scenario_id;
  }

  if ("case_id" in value && isNonEmptyString(value.case_id)) {
    if (!isCaseId(value.case_id)) return null;
    // case_id must begin with scenario_id prefix
    if (result.scenario_id) {
      if (!value.case_id.startsWith(result.scenario_id + "-C")) return null;
    } else {
      // scenario_id is required when case_id is present
      return null;
    }
    result.case_id = value.case_id;
  }

  return result;
}

export function normalizeMonitorModelRequest(
  value: unknown
): MonitorModelRequest | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["content", "content_ref"]) ||
    !isNonEmptyString(value.content) ||
    !isSafeReference(value.content_ref)
  ) {
    return null;
  }

  return {
    content: value.content,
    content_ref: value.content_ref
  };
}

export function normalizeMonitorModelResponse(
  value: unknown
): MonitorModelResponse | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["content", "content_ref"]) ||
    !isNonEmptyString(value.content) ||
    !isSafeReference(value.content_ref)
  ) {
    return null;
  }

  return {
    content: value.content,
    content_ref: value.content_ref
  };
}

export function normalizeMonitorDecisionProposal(
  value: unknown
): MonitorDecisionProposal | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "policy_id",
      "action",
      "reason_code",
      "reason",
      "evidence_refs"
    ]) ||
    !isSafeReference(value.policy_id) ||
    !isOneOf(SANDBOX_POLICY_ACTIONS, value.action) ||
    !isNonEmptyString(value.reason_code) ||
    !isNonEmptyString(value.reason) ||
    !isNonEmptyStringArray(value.evidence_refs)
  ) {
    return null;
  }

  // All evidence entries must be safe references
  if (!value.evidence_refs.every((ref: string) => isSafeReference(ref))) {
    return null;
  }

  // Evidence must be unique
  if (!allUnique(value.evidence_refs)) {
    return null;
  }

  return {
    policy_id: value.policy_id,
    action: value.action,
    reason_code: value.reason_code,
    reason: value.reason,
    evidence_refs: [...value.evidence_refs]
  };
}

export function normalizeMonitorRuntimePorts(
  value: unknown
): MonitorRuntimePorts | null {
  if (!isPlainObject(value)) return null;

  if (!hasExactKeys(value, ["now", "nextId"])) return null;

  if (typeof value.now !== "function" || typeof value.nextId !== "function") {
    return null;
  }

  return {
    now: value.now as () => string,
    nextId: value.nextId as (kind: string) => string
  };
}
