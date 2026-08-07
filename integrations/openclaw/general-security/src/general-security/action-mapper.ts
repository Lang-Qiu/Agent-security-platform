import {
  SANDBOX_SECURITY_ACTIONS,
  type SandboxSecurityAction
} from "../../../../../shared/index.ts";

export const OPENCLAW_SECURITY_ENFORCEMENT_POINTS = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
] as const;

export type OpenClawSecurityEnforcementPoint =
  (typeof OPENCLAW_SECURITY_ENFORCEMENT_POINTS)[number];

export const OPENCLAW_SECURITY_FAILURE_CODES = [
  "authority_mismatch",
  "correlation_mismatch",
  "unsupported_input",
  "engine_error",
  "engine_timeout",
  "engine_slot_unavailable",
  "barrier_timeout",
  "startup_recovery",
  "request_id_unavailable"
] as const;

export type OpenClawSecurityFailureCode =
  (typeof OPENCLAW_SECURITY_FAILURE_CODES)[number];

export type OpenClawSecurityDecisionInput = Readonly<
  | {
      point: OpenClawSecurityEnforcementPoint;
      action: SandboxSecurityAction;
    }
  | {
      point: OpenClawSecurityEnforcementPoint;
      failure: OpenClawSecurityFailureCode;
    }
>;

export type OpenClawSecurityBarrierResult = Readonly<
  | { outcome: "pass" }
  | {
      outcome: "replace";
      replacement_code:
        | "security_review_required"
        | "sandbox_security_policy_blocked"
        | "sandbox_security_evaluation_unavailable";
      replacement_text: string;
    }
>;

export interface OpenClawSecurityActionMapping {
  readonly barrier: OpenClawSecurityBarrierResult;
  readonly host_outcome: "continued" | "replaced";
  readonly applied_action: SandboxSecurityAction;
}

type RecordValue = Record<string, unknown>;

function invalidAction(): never {
  const error = new Error("invalid OpenClaw security action input");
  error.name = "openclaw_security_action_invalid";
  throw error;
}

function isPlainRecord(value: unknown): value is RecordValue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnDataProperties(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is RecordValue {
  if (!isPlainRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  ) {
    return false;
  }
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

function isEnforcementPoint(value: unknown): value is OpenClawSecurityEnforcementPoint {
  return (
    typeof value === "string" &&
    OPENCLAW_SECURITY_ENFORCEMENT_POINTS.includes(
      value as OpenClawSecurityEnforcementPoint
    )
  );
}

function isAction(value: unknown): value is SandboxSecurityAction {
  return (
    typeof value === "string" &&
    SANDBOX_SECURITY_ACTIONS.includes(value as SandboxSecurityAction)
  );
}

function isFailureCode(value: unknown): value is OpenClawSecurityFailureCode {
  return (
    typeof value === "string" &&
    OPENCLAW_SECURITY_FAILURE_CODES.includes(value as OpenClawSecurityFailureCode)
  );
}

function failClosedAction(
  point: OpenClawSecurityEnforcementPoint
): "ask" | "deny" {
  switch (point) {
    case "before_agent_run":
    case "before_model_output_delivery":
    case "before_message_delivery":
      return "ask";
    case "before_tool_execution":
      return "deny";
    default:
      return assertNever(point);
  }
}

function assertNever(value: never): never {
  return invalidAction();
}

function pass(action: "allow" | "alert"): OpenClawSecurityActionMapping {
  return {
    barrier: { outcome: "pass" },
    host_outcome: "continued",
    applied_action: action
  };
}

function replace(
  replacement_code:
    | "security_review_required"
    | "sandbox_security_policy_blocked"
    | "sandbox_security_evaluation_unavailable",
  replacement_text: string,
  applied_action: "ask" | "deny"
): OpenClawSecurityActionMapping {
  return {
    barrier: { outcome: "replace", replacement_code, replacement_text },
    host_outcome: "replaced",
    applied_action
  };
}

function mapAction(
  action: SandboxSecurityAction
): OpenClawSecurityActionMapping {
  switch (action) {
    case "allow":
    case "alert":
      return pass(action);
    case "ask":
      return replace(
        "security_review_required",
        "Security review required. This action was not completed.",
        "ask"
      );
    case "deny":
      return replace(
        "sandbox_security_policy_blocked",
        "Blocked by sandbox security policy.",
        "deny"
      );
    default:
      return assertNever(action);
  }
}

export function mapDecision(
  input: unknown
): Readonly<OpenClawSecurityActionMapping> {
  try {
    if (!hasExactOwnDataProperties(input, ["point"], ["action", "failure"])) {
      invalidAction();
    }

    const point = input.point;
    if (!isEnforcementPoint(point)) invalidAction();

    const hasAction = Object.hasOwn(input, "action");
    const hasFailure = Object.hasOwn(input, "failure");
    if (hasAction === hasFailure) invalidAction();

    const result = hasAction
      ? (() => {
          if (!hasExactOwnDataProperties(input, ["point", "action"]) ||
              !isAction(input.action)) {
            invalidAction();
          }
          return mapAction(input.action);
        })()
      : (() => {
          if (!hasExactOwnDataProperties(input, ["point", "failure"]) ||
              !isFailureCode(input.failure)) {
            invalidAction();
          }
          const appliedAction = failClosedAction(point);
          return replace(
            "sandbox_security_evaluation_unavailable",
            "Security evaluation unavailable. This action was not completed.",
            appliedAction
          );
        })();

    return deepFreeze(result);
  } catch (error) {
    if (error instanceof Error && error.name === "openclaw_security_action_invalid") {
      throw error;
    }
    invalidAction();
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}
