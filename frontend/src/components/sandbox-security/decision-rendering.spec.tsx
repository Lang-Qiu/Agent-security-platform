import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision,
  SandboxSecurityFinding
} from "../../../../shared/types/sandbox-security";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { DetectorRunTable } from "./DetectorRunTable";
import { FindingsTable } from "./FindingsTable";

const FINDING: SandboxSecurityFinding = {
  finding_id: "finding:1",
  detector_id: "rule.injection",
  detector_version: "1.4.0",
  category: "prompt_injection",
  severity: "critical",
  confidence: 0.94,
  reason_code: "sandbox_security_prompt_injection",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "srctok-1",
      locator: { kind: "text_byte_range", start_byte: 12, end_byte: 48 }
    }
  ],
  evidence_refs: ["evidence:1"]
};

const DECISION: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-strict.v1",
  verdict: "risk_detected",
  action: "deny",
  risk_level: "critical",
  findings: [FINDING],
  detector_runs: [],
  evidence_refs: ["evidence:1"],
  created_at: "2026-08-07T00:00:00.000Z"
};

describe("REQ-SBX-GENERAL-005 decision summary", () => {
  it("announces verdict and action in a live region", () => {
    render(<DecisionSummaryPanel decision={DECISION} />);
    const live = screen.getByRole("status");
    expect(within(live).getByText("risk_detected")).toBeInTheDocument();
    expect(within(live).getByText("deny")).toBeInTheDocument();
  });

  it("labels the decision as simulation and not enforcement", () => {
    render(<DecisionSummaryPanel decision={DECISION} />);
    expect(screen.getByText("simulation")).toBeInTheDocument();
    expect(screen.getByText(/不可用于实际拦截/)).toBeInTheDocument();
  });

  it("renders decision identity in monospace-marked elements", () => {
    const { container } = render(<DecisionSummaryPanel decision={DECISION} />);
    const identity = container.querySelector('[data-mono="true"]');
    expect(identity?.textContent).toContain("decision:1");
  });

  it("explains no_detected_risk as not a safety proof", () => {
    render(
      <DecisionSummaryPanel
        decision={{ ...DECISION, verdict: "no_detected_risk", action: "allow", risk_level: "info", findings: [] }}
      />
    );
    expect(screen.getByText(/并不证明输入安全/)).toBeInTheDocument();
  });
});

describe("DecisionSummaryPanel VerdictHero wrapper", () => {
  it("workbench variant has .workbench-decision-hero class on the panel", () => {
    const { container } = render(
      <DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />
    );
    expect(container.querySelector(".workbench-decision-hero")).not.toBeNull();
  });

  it("shows stage chip above the verdict", () => {
    render(<DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />);
    expect(screen.getByText("user_input")).toBeInTheDocument();
  });

  it("shows policy chip above the verdict", () => {
    render(<DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />);
    expect(screen.getByText("sandbox-security-strict.v1")).toBeInTheDocument();
  });

  it("context chips are wrapped in aria-hidden container", () => {
    const { container } = render(
      <DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />
    );
    const contextChips = container.querySelector(".workbench-decision-hero__context-chips");
    expect(contextChips).not.toBeNull();
    expect(contextChips).toHaveAttribute("aria-hidden", "true");
  });

  it("renders VerdictHero verdict tags when active", () => {
    render(<DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />);
    expect(screen.getAllByText("risk_detected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("deny").length).toBeGreaterThan(0);
  });

  it("meta section has .workbench-decision-hero__meta class", () => {
    const { container } = render(
      <DecisionSummaryPanel decision={DECISION} variant="workbench" active reduceMotion />
    );
    expect(container.querySelector(".workbench-decision-hero__meta")).not.toBeNull();
  });
});

describe("REQ-SBX-GENERAL-005 findings table", () => {
  it("renders category, severity, confidence, and reason code", () => {
    render(<FindingsTable findings={[FINDING]} />);
    expect(screen.getByText("prompt_injection")).toBeInTheDocument();
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("sandbox_security_prompt_injection")).toBeInTheDocument();
    expect(screen.getByText("0.94")).toBeInTheDocument();
  });

  it("renders a byte-range locator as a position, never as content", () => {
    render(<FindingsTable findings={[FINDING]} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  it("renders a json_pointer locator", () => {
    render(
      <FindingsTable
        findings={[
          {
            ...FINDING,
            subject_refs: [
              {
                kind: "content_source",
                source_token: "srctok-1",
                locator: { kind: "json_pointer", pointer: "/messages/0/text" }
              }
            ]
          }
        ]}
      />
    );
    expect(screen.getByText("/messages/0/text")).toBeInTheDocument();
  });

  it("renders a tool_request subject with its component", () => {
    render(
      <FindingsTable
        findings={[
          {
            ...FINDING,
            subject_refs: [
              { kind: "tool_request", call_token: "calltok-1", component: "tool_name" }
            ]
          }
        ]}
      />
    );
    expect(screen.getByText("tool_name")).toBeInTheDocument();
  });

  it("renders an empty state without inventing a finding", () => {
    render(<FindingsTable findings={[]} />);
    expect(screen.getByText(/未产生风险发现/)).toBeInTheDocument();
  });
});

describe("REQ-SBX-GENERAL-005 detector run table", () => {
  const runs: SandboxDetectorRun[] = [
    {
      detector_id: "rule.injection",
      detector_version: "1.4.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 4,
      status: "matched",
      finding_ids: ["finding:1"]
    },
    {
      detector_id: "local.classifier",
      detector_version: "2.0.0",
      detector_kind: "local_model",
      obligation: "runtime_required",
      elapsed_ms: 812,
      status: "timeout",
      error_code: "detector_timeout"
    },
    {
      detector_id: "external.judge",
      detector_version: "1.0.0",
      detector_kind: "external_judge",
      obligation: "optional_not_selected",
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: "optional_not_configured"
    }
  ];

  it("renders the variant-specific field for each status group", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText("finding:1")).toBeInTheDocument();
    expect(screen.getByText("detector_timeout")).toBeInTheDocument();
    expect(screen.getByText("optional_not_configured")).toBeInTheDocument();
  });

  it("renders detector kind and obligation for every run", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText("rule")).toBeInTheDocument();
    expect(screen.getByText("local_model")).toBeInTheDocument();
    expect(screen.getByText("external_judge")).toBeInTheDocument();
    expect(screen.getByText("profile_required")).toBeInTheDocument();
  });

  it("renders elapsed milliseconds for every run", () => {
    render(<DetectorRunTable runs={runs} />);
    expect(screen.getByText(/812/)).toBeInTheDocument();
  });
});

describe("REQ-SBX-WORKBENCH-R2 decision workbench variant", () => {
  it("reserves the decision position before its reveal gate", () => {
    const { rerender } = render(
      <DecisionSummaryPanel
        decision={DECISION}
        variant="workbench"
        active={false}
        reduceMotion={false}
      />
    );
    const panel = screen.getByLabelText("评估决策摘要");
    expect(panel).toHaveAttribute("data-reveal-state", "pending");
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("risk_detected")).not.toBeInTheDocument();

    rerender(
      <DecisionSummaryPanel
        decision={DECISION}
        variant="workbench"
        active
        reduceMotion={false}
      />
    );
    expect(panel).toHaveAttribute("data-reveal-state", "visible");
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("risk_detected")).toBeInTheDocument();
  });

  it("exposes the decision immediately under reduced motion", () => {
    render(
      <DecisionSummaryPanel
        decision={DECISION}
        variant="workbench"
        active={false}
        reduceMotion
      />
    );
    const panel = screen.getByLabelText("评估决策摘要");
    expect(panel).toHaveAttribute("data-reveal-state", "visible");
    expect(panel).not.toHaveAttribute("aria-hidden");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps opaque identities and simulation limits below the hero", () => {
    render(
      <DecisionSummaryPanel
        decision={DECISION}
        variant="workbench"
        active
        reduceMotion
      />
    );
    expect(screen.getByText("decision:1")).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText(/不可用于实际拦截/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
