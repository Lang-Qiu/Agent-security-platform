import { Track1BaseFilterError } from "./contract.ts";
import type {
  Track1FilterCondition,
  Track1FilterContextEnvelope,
  Track1FilterEvaluationInput,
  Track1FilterEvaluationResult,
  Track1FilterMatch,
  Track1FilterRule
} from "./contract.ts";
import type { SimulatedToolRequest } from "../simulated-tools/contract.ts";
import { normalizeTrack1FilterText } from "./context-envelope.ts";

// -- action ranking ---------------------------------------------------------

const ACTION_RANK: Record<string, number> = {
  allow: 0,
  alert: 1,
  ask: 2,
  deny: 3
} as const;

// -- source accessor helpers -------------------------------------------------

function getSourceValues(
  source: Track1FilterCondition["source"],
  context: Track1FilterContextEnvelope,
  modelOutput: string,
  toolRequest?: SimulatedToolRequest
): string[] {
  switch (source) {
    case "user_prompt":
      return [context.user_prompt];
    case "retrieved_content":
      return [...context.retrieved_content];
    case "memory_content":
      return context.memory_entries.map((m) => m.content);
    case "model_output":
      return [modelOutput];
    case "tool_name":
      return toolRequest ? [toolRequest.tool_name] : [];
    case "tool_target":
      return toolRequest ? [extractToolTarget(toolRequest)] : [];
    case "tool_arguments":
      return toolRequest ? extractToolArguments(toolRequest) : [];
  }
}

function extractToolTarget(request: SimulatedToolRequest): string {
  switch (request.tool_name) {
    case "send_email":
      return request.arguments.recipient;
    case "read_file":
      return request.arguments.path;
    case "write_file":
      return request.arguments.path;
    case "call_api":
      return request.arguments.endpoint;
  }
}

function extractToolArguments(request: SimulatedToolRequest): string[] {
  const args = request.arguments as Record<string, unknown>;
  const leaves: string[] = [];

  function collectLeaves(obj: Record<string, unknown>, prefix: string): void {
    // Reject arrays and non-plain objects
    if (Array.isArray(obj)) {
      throw new Track1BaseFilterError("base_filter_context_invalid");
    }
    const keys = Object.keys(obj).sort(); // sorted property-path order
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string") {
        leaves.push(value);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Reject unexpected prototypes
        if (Object.getPrototypeOf(value) !== Object.prototype) {
          throw new Track1BaseFilterError("base_filter_context_invalid");
        }
        collectLeaves(value as Record<string, unknown>, `${prefix}${key}.`);
      } else {
        // Reject arrays, non-plain objects, unexpected types
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
    }
  }

  // Only collect scalar string leaves that are not the primary target
  // For send_email: skip recipient (it's the target), collect subject, body
  // For read_file/write_file: skip path (it's the target), collect content
  // For call_api: skip endpoint (it's the target), collect body leaves
  switch (request.tool_name) {
    case "send_email": {
      if (typeof args.subject !== "string" || typeof args.body !== "string") {
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
      leaves.push(args.subject);
      leaves.push(args.body);
      break;
    }
    case "read_file": {
      if (typeof args.path !== "string") {
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
      // read_file only has path as argument — no extra leaves
      break;
    }
    case "write_file": {
      if (typeof args.path !== "string" || typeof args.content !== "string") {
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
      leaves.push(args.content);
      break;
    }
    case "call_api": {
      if (typeof args.endpoint !== "string") {
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
      if (args.method !== "GET" && args.method !== "POST") {
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
      if (args.body !== undefined) {
        collectLeaves(args.body as Record<string, unknown>, "");
      }
      break;
    }
  }

  return leaves;
}

// -- condition evaluation ----------------------------------------------------

function evaluateCondition(
  condition: Track1FilterCondition,
  context: Track1FilterContextEnvelope,
  modelOutput: string,
  toolRequest?: SimulatedToolRequest
): boolean {
  const sourceValues = getSourceValues(
    condition.source,
    context,
    modelOutput,
    toolRequest
  );

  const normalizedSourceValues = sourceValues.map(normalizeTrack1FilterText);
  const normalizedTerms = condition.values.map(normalizeTrack1FilterText);

  switch (condition.operator) {
    case "contains_any":
      // One source value contains at least one configured term
      return normalizedSourceValues.some((sv) =>
        normalizedTerms.some((term) => sv.includes(term))
      );
    case "contains_all":
      // One source value contains every configured term (no cross-entry combination)
      return normalizedSourceValues.some((sv) =>
        normalizedTerms.every((term) => sv.includes(term))
      );
    case "equals_any":
      // One complete normalized source value equals a configured value
      return normalizedSourceValues.some((sv) =>
        normalizedTerms.some((term) => sv === term)
      );
  }
}

// -- rule evaluation ---------------------------------------------------------

function evaluateRule(
  rule: Track1FilterRule,
  stage: "model_output" | "tool_request",
  context: Track1FilterContextEnvelope,
  modelOutput: string,
  toolRequest?: SimulatedToolRequest
): boolean {
  // Skip rules not registered for the current stage
  if (!rule.stages.includes(stage)) return false;

  // All conditions must match (AND)
  return rule.conditions.every((condition) =>
    evaluateCondition(condition, context, modelOutput, toolRequest)
  );
}

// -- main evaluation function ------------------------------------------------

export function evaluateTrack1FilterRules(
  input: Track1FilterEvaluationInput,
  rules: readonly Track1FilterRule[]
): Track1FilterEvaluationResult {
  // Validate input
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Track1BaseFilterError("base_filter_evaluation_invalid");
  }
  const { stage, context, model_output, tool_request } = input;
  if (!stage || !context || typeof model_output !== "string") {
    throw new Track1BaseFilterError("base_filter_evaluation_invalid");
  }
  if (stage !== "model_output" && stage !== "tool_request") {
    throw new Track1BaseFilterError("base_filter_evaluation_invalid");
  }

  const matches: Track1FilterMatch[] = [];

  for (const rule of rules) {
    if (evaluateRule(rule, stage, context, model_output, tool_request)) {
      matches.push({
        rule_id: rule.rule_id,
        stage,
        category: rule.category,
        action: rule.action,
        reason_code: rule.reason_code
      });
    }
  }

  if (matches.length === 0) {
    return {
      action: "allow",
      winner: null,
      matches: []
    };
  }

  // Sort matches: highest action rank first, then rule_id ascending
  matches.sort((a, b) => {
    const rankDiff = ACTION_RANK[b.action] - ACTION_RANK[a.action];
    if (rankDiff !== 0) return rankDiff;
    return a.rule_id.localeCompare(b.rule_id);
  });

  return {
    action: matches[0].action,
    winner: matches[0],
    matches
  };
}
