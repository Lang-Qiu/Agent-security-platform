import type {
  MonitorDecisionInput,
  MonitorDecisionProposal,
  MonitorDecisionProvider
} from "../../monitoring/contract.ts";
import type {
  SandboxSecurityEngine
} from "../engine.ts";
import type {
  SandboxSecurityEvaluationRequest
} from "../source-authority.ts";
import type {
  SandboxSecurityDecision,
  SandboxSecurityPolicyProfileId
} from "../../../../../shared/types/sandbox-security.ts";

const POLICY_ID = "policy://sandbox/security/monitor-adapter/v1";

function mapReason(decision: Readonly<SandboxSecurityDecision>): {
  reason_code: string;
  reason: string;
  evidence_refs: string[];
} {
  if (decision.verdict === "risk_detected") {
    if (decision.findings.length === 0) {
      throw new Error("sandbox_security_internal_invalid");
    }
    return {
      reason_code: decision.findings[0]!.reason_code,
      reason: "Sandbox security risk detected.",
      evidence_refs: [...decision.evidence_refs]
    };
  }
  if (decision.verdict === "no_detected_risk") {
    return {
      reason_code: "sandbox_security_no_detected_risk",
      reason: "No sandbox security risk was detected.",
      evidence_refs: [...decision.evidence_refs]
    };
  }
  return {
    reason_code: "sandbox_security_evaluation_indeterminate",
    reason: "Sandbox security evaluation was incomplete.",
    evidence_refs: [...decision.evidence_refs]
  };
}

function failClosedProposal(
  stage: MonitorDecisionInput["stage"]
): MonitorDecisionProposal {
  return {
    policy_id: POLICY_ID,
    action: stage === "tool_request" ? "deny" : "ask",
    reason_code: "sandbox_security_internal_invalid",
    reason: "Sandbox security evaluation failed closed.",
    evidence_refs: []
  };
}

export function createSandboxSecurityMonitorDecisionAdapter(
  deps: Readonly<{
    engine: SandboxSecurityEngine;
    policy_profile_id: SandboxSecurityPolicyProfileId;
    buildEvaluationRequest: (
      input: Readonly<MonitorDecisionInput>,
      policyProfileId: SandboxSecurityPolicyProfileId
    ) => Readonly<SandboxSecurityEvaluationRequest>;
  }>
): MonitorDecisionProvider {
  if (!deps?.engine || typeof deps.engine.evaluate !== "function") {
    throw new Error("sandbox_security_monitor_adapter_invalid");
  }
  if (typeof deps.buildEvaluationRequest !== "function") {
    throw new Error("sandbox_security_monitor_adapter_invalid");
  }
  if (
    deps.policy_profile_id !== "sandbox-security-balanced.v1" &&
    deps.policy_profile_id !== "sandbox-security-strict.v1"
  ) {
    throw new Error("sandbox_security_monitor_adapter_invalid");
  }

  return {
    async decide(input) {
      try {
        const request = deps.buildEvaluationRequest(
          input,
          deps.policy_profile_id
        );
        // Enforce mapper consistency and enforcement-only.
        if (
          !request ||
          typeof request !== "object" ||
          !request.submission ||
          !request.authoritative_context
        ) {
          return failClosedProposal(input.stage);
        }
        const { submission, authoritative_context } = request;
        if (
          authoritative_context.evaluation_mode !== "enforcement" ||
          submission.stage !== input.stage ||
          authoritative_context.stage !== input.stage ||
          submission.policy_profile_id !== deps.policy_profile_id ||
          authoritative_context.policy_profile_id !== deps.policy_profile_id
        ) {
          return failClosedProposal(input.stage);
        }

        // One evaluate call only; never pass a caller signal argument.
        const decision = await deps.engine.evaluate(request);
        if (!decision || typeof decision !== "object") {
          return failClosedProposal(input.stage);
        }
        // Never return Engine decision directly; map content-free proposal.
        const mapped = mapReason(decision);
        return {
          policy_id: POLICY_ID,
          action: decision.action,
          reason_code: mapped.reason_code,
          reason: mapped.reason,
          evidence_refs: mapped.evidence_refs
        };
      } catch {
        return failClosedProposal(input.stage);
      }
    }
  };
}
