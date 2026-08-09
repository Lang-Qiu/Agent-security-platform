import { Radio } from "antd";

import {
  SANDBOX_SECURITY_POLICY_PROFILE_IDS,
  type SandboxSecurityPolicyProfileId
} from "../../../../shared/types/sandbox-security";

interface PolicyPresentation {
  differentiator: "平衡" | "严格";
  status: string;
}

// Presentation-only facts verified against
// engines/sandbox/src/security/policy-profiles.ts. Do not add budgets,
// timeout numbers, all-detector claims, or a blanket fail-closed guarantee.
const POLICY_PRESENTATION = {
  "sandbox-security-balanced.v1": {
    differentiator: "平衡",
    status: "规则必检 · 本地模型可选 · 高/严重风险短路"
  },
  "sandbox-security-strict.v1": {
    differentiator: "严格",
    status: "规则与本地模型必检 · 中/高/严重风险短路"
  }
} satisfies Record<SandboxSecurityPolicyProfileId, PolicyPresentation>;

export interface PolicySelectorProps {
  policyProfileId: SandboxSecurityPolicyProfileId;
  onPolicyProfileChange: (policyProfileId: SandboxSecurityPolicyProfileId) => void;
}

export function PolicySelector({
  policyProfileId,
  onPolicyProfileChange
}: PolicySelectorProps) {
  return (
    <fieldset>
      <legend className="sandbox-security-legend">策略配置</legend>
      <div className="workbench-policy-selector">
        {SANDBOX_SECURITY_POLICY_PROFILE_IDS.map((option) => {
          const presentation = POLICY_PRESENTATION[option];
          return (
            <Radio
              key={option}
              className={
                policyProfileId === option
                  ? "workbench-policy-card workbench-policy-card--selected"
                  : "workbench-policy-card"
              }
              name="sandbox-security-profile"
              value={option}
              checked={policyProfileId === option}
              onChange={() => onPolicyProfileChange(option)}
            >
              <span className="workbench-policy-card__id" data-mono="true">
                {option}
              </span>{" "}
              <span className="workbench-policy-card__label">
                {presentation.differentiator}
              </span>
            </Radio>
          );
        })}
      </div>
      <p
        className="workbench-policy-status"
        data-testid="security-policy-status"
      >
        <span data-mono="true">POLICY: {policyProfileId}</span>
        <span>{POLICY_PRESENTATION[policyProfileId].status}</span>
      </p>
    </fieldset>
  );
}
