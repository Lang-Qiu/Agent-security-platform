import {
  runAllTrack1BaseFilterCases
} from "../../src/base-filter/replay-adapter.ts";
import {
  createSandboxSecurityDetectorRegistry
} from "../../src/security/detector-registry.ts";
import {
  createSandboxSecurityEngine
} from "../../src/security/engine.ts";
import type {
  SandboxSecurityRuntimePorts
} from "../../src/security/runtime-deadline.ts";
import {
  createTrack1RuleMatchDetectorAdapter
} from "../../src/security/adapters/track1-rule-matches.ts";
import {
  loadTrack1ReplayScenario
} from "../../src/replay/loader.ts";
import {
  TRACK1_SCENARIO_IDS
} from "../../src/replay/contract.ts";
import type {
  SandboxSecurityAction
} from "../../../../shared/types/sandbox-security.ts";

/** Test-only approved nine-case action map. Never import from production. */
export const APPROVED_TRACK1_ACTION_MAP = {
  "T1-SC-001-C001": "deny",
  "T1-SC-001-C002": "deny",
  "T1-SC-001-C003": "allow",
  "T1-SC-002-C001": "deny",
  "T1-SC-002-C002": "ask",
  "T1-SC-002-C003": "deny",
  "T1-SC-003-C001": "ask",
  "T1-SC-003-C002": "deny",
  "T1-SC-003-C003": "allow"
} as const;

const PROFILE = "sandbox-security-balanced.v1" as const;

/**
 * Compatibility comparison maps accepted finding severity back to the Track1
 * action ladder used by the nine-case matrix (alert/ask/deny), independent of
 * stage-specific balanced tool floors. The public engine.action remains
 * stage-aware; harness equality uses this ladder per Spec compatibility note.
 */
function compatibilityActionFromDecision(decision: {
  verdict: string;
  action: SandboxSecurityAction;
  findings: readonly { severity: string }[];
}): SandboxSecurityAction {
  if (decision.verdict === "no_detected_risk" && decision.findings.length === 0) {
    return "allow";
  }
  const rank: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  let best = 0;
  for (const finding of decision.findings) {
    best = Math.max(best, rank[finding.severity] ?? 0);
  }
  if (best >= 3) return "deny";
  if (best === 2) return "ask";
  if (best === 1) return "alert";
  // indeterminate / no findings with fail-closed
  return decision.action;
}

function actualActionFromLegacyRun(run: {
  result: { details?: { policy_decisions?: Array<{ action: string }> } };
}): SandboxSecurityAction {
  const rank: Record<string, number> = { allow: 0, alert: 1, ask: 2, deny: 3 };
  let action: SandboxSecurityAction = "allow";
  for (const decision of run.result.details?.policy_decisions ?? []) {
    if ((rank[decision.action] ?? -1) > rank[action]) {
      action = decision.action as SandboxSecurityAction;
    }
  }
  return action;
}

function buildEvaluationRequest(fixture: {
  case_id: string;
  scenario_id: string;
  input: {
    user_prompt: string;
    retrieved_content: readonly string[];
    memory_entries: readonly { memory_id: string; content: string }[];
    proposed_tool_call?: {
      tool_name: string;
      arguments: Record<string, unknown>;
    } | null;
  };
  expected_outcome: {
    model_behavior: string;
  };
}) {
  const hasTool = Boolean(fixture.input.proposed_tool_call);
  const stage = hasTool ? ("tool_request" as const) : ("model_output" as const);
  const content_items = [
    {
      source_id: "user_1",
      claimed_source_type: "user_input" as const,
      media_type: "text/plain" as const,
      value: fixture.input.user_prompt,
      provenance_ref: "source://user_1"
    },
    ...fixture.input.retrieved_content.map((value, index) => ({
      source_id: `ret_${index + 1}`,
      claimed_source_type: "retrieved_content" as const,
      media_type: "text/plain" as const,
      value,
      provenance_ref: `source://ret_${index + 1}`
    })),
    ...fixture.input.memory_entries.map((entry, index) => ({
      source_id: entry.memory_id || `mem_${index + 1}`,
      claimed_source_type: "memory_content" as const,
      media_type: "text/plain" as const,
      value: entry.content,
      provenance_ref: `source://mem_${index + 1}`
    })),
    {
      source_id: "model_1",
      claimed_source_type: "model_output" as const,
      media_type: "text/plain" as const,
      value: fixture.expected_outcome.model_behavior,
      provenance_ref: "source://model_1"
    }
  ];

  const tool = fixture.input.proposed_tool_call;
  const submission = {
    schema_version: "sandbox-security-request.v1" as const,
    request_id: `request_${fixture.case_id}`,
    stage,
    policy_profile_id: PROFILE,
    content_items,
    ...(tool
      ? {
          tool_request: {
            call_id: `call_${fixture.case_id}`,
            tool_name: tool.tool_name,
            target:
              tool.tool_name === "send_email"
                ? String((tool.arguments as { recipient?: string }).recipient ?? "")
                : tool.tool_name === "call_api"
                  ? String((tool.arguments as { endpoint?: string }).endpoint ?? "")
                  : String((tool.arguments as { path?: string }).path ?? ""),
            arguments: tool.arguments as never
          }
        }
      : {})
  };

  const sources = content_items.map((item) => ({
    source_id: item.source_id,
    authority_kind: "simulation_observation" as const,
    source_type: item.claimed_source_type,
    media_type: item.media_type,
    value: item.value,
    provenance_ref: item.provenance_ref
  }));

  return {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1" as const,
      evaluation_mode: "simulation" as const,
      stage,
      policy_profile_id: PROFILE,
      sources,
      ...(tool
        ? {
            tool_request: {
              authority_kind: "simulation_observation" as const,
              call_id: `call_${fixture.case_id}`,
              tool_name: tool.tool_name,
              target: submission.tool_request?.target,
              arguments: tool.arguments as never
            }
          }
        : {})
    }
  };
}

export async function runTrack1SecurityCompatibilityHarness(
  ports: SandboxSecurityRuntimePorts
): Promise<
  ReadonlyArray<{
    case_id: string;
    legacy_action: SandboxSecurityAction;
    engine_action: SandboxSecurityAction;
    action_matches: boolean;
    profile_id: "sandbox-security-balanced.v1";
  }>
> {
  const legacyRuns = await runAllTrack1BaseFilterCases();
  const fixtures = TRACK1_SCENARIO_IDS.flatMap(
    (scenarioId) => loadTrack1ReplayScenario(scenarioId).cases
  );
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.case_id, fixture]));

  const engine = createSandboxSecurityEngine({
    registry: createSandboxSecurityDetectorRegistry({
      rule: createTrack1RuleMatchDetectorAdapter()
    }),
    runtime: ports
  });

  const rows = [];
  for (const run of legacyRuns) {
    const legacy_action = actualActionFromLegacyRun(run);
    const fixture = fixtureById.get(run.case_id);
    if (!fixture) {
      throw new Error(`missing fixture for ${run.case_id}`);
    }
    const request = buildEvaluationRequest(fixture as never);
    const decision = await engine.evaluate(request as never);
    const engine_action = compatibilityActionFromDecision(decision as never);
    rows.push({
      case_id: run.case_id,
      legacy_action,
      engine_action,
      action_matches: legacy_action === engine_action,
      profile_id: PROFILE
    });
  }

  rows.sort((left, right) => left.case_id.localeCompare(right.case_id));
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}
