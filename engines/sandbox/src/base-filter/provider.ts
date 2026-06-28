import type {
  MonitorDecisionInput,
  MonitorDecisionProposal,
  MonitorDecisionProvider
} from "../monitoring/contract.ts";
import {
  Track1BaseFilterError,
  TRACK1_BASE_FILTER_POLICY_ID
} from "./contract.ts";
import type {
  Track1FilterRule,
  Track1FilterEvaluationInput,
  Track1FilterMatch
} from "./contract.ts";
import { parseTrack1FilterContext } from "./context-envelope.ts";
import { evaluateTrack1FilterRules } from "./evaluator.ts";
import { TRACK1_BASE_FILTER_RULES } from "./rule-catalog.ts";
import { normalizeTrack1FilterCatalog } from "./context-envelope.ts";

// -- constants ---------------------------------------------------------------

const FILTER_CONTEXT_PREFIX = "filter-context://track1/sha256/";

const NO_MATCH_PROPOSAL: MonitorDecisionProposal = {
  policy_id: TRACK1_BASE_FILTER_POLICY_ID,
  action: "allow",
  reason_code: "base_filter_no_match",
  reason: "No Track 1 base-filter rule matched",
  evidence_refs: ["evidence://track1/base-filter/no-match"]
};

// -- evidence mapping --------------------------------------------------------

function buildEvidenceRefs(matches: readonly Track1FilterMatch[]): string[] {
  const refs = matches.map(
    (m) => `evidence://track1/base-filter/rule/${m.rule_id}`
  );
  return [...new Set(refs)].sort();
}

// -- provider class ----------------------------------------------------------

export class RuleBasedDecisionProvider implements MonitorDecisionProvider {
  #rules: readonly Track1FilterRule[];

  constructor(rules?: readonly Track1FilterRule[]) {
    if (rules !== undefined) {
      this.#rules = normalizeTrack1FilterCatalog([...rules]);
    } else {
      this.#rules = TRACK1_BASE_FILTER_RULES;
    }
  }

  decide(input: Readonly<MonitorDecisionInput>): MonitorDecisionProposal {
    const { stage, model_input, model_output, tool_request } = input;

    // Parse context envelope from model input
    let contextEnvelope;
    if (
      model_input.content_ref.startsWith(FILTER_CONTEXT_PREFIX)
    ) {
      try {
        contextEnvelope = parseTrack1FilterContext(model_input.content);
      } catch (err) {
        if (err instanceof Track1BaseFilterError) {
          throw err;
        }
        throw new Track1BaseFilterError("base_filter_context_invalid");
      }
    } else {
      // Non-filter-context: treat entire model input as user_prompt
      contextEnvelope = {
        schema_version: "track1-filter-context.v1" as const,
        user_prompt: model_input.content,
        retrieved_content: [] as string[],
        memory_entries: [] as { memory_id: string; content: string }[]
      };
    }

    // Build evaluation input
    const evalInput: Track1FilterEvaluationInput = {
      stage,
      context: contextEnvelope,
      model_output: model_output.content,
      ...(tool_request ? { tool_request } : {})
    };

    // Evaluate against rules
    const result = evaluateTrack1FilterRules(evalInput, this.#rules);

    // Map to proposal
    if (result.matches.length === 0) {
      return { ...NO_MATCH_PROPOSAL, evidence_refs: [...NO_MATCH_PROPOSAL.evidence_refs] };
    }

    const winner = result.winner!;
    const evidenceRefs = buildEvidenceRefs(result.matches);

    return {
      policy_id: TRACK1_BASE_FILTER_POLICY_ID,
      action: result.action,
      reason_code: winner.reason_code,
      reason: this.#findRuleReason(winner.rule_id),
      evidence_refs: evidenceRefs
    };
  }

  #findRuleReason(ruleId: string): string {
    const rule = this.#rules.find((r) => r.rule_id === ruleId);
    return rule?.reason ?? "Base filter rule matched";
  }
}
