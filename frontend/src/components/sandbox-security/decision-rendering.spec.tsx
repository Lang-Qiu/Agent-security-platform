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
