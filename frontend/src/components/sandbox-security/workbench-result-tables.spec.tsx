import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type {
  SandboxDetectorRun,
  SandboxSecurityFinding
} from "../../../../shared/types/sandbox-security";
import { WorkbenchDetectorTable } from "./WorkbenchDetectorTable";
import { WorkbenchFindingsTable } from "./WorkbenchFindingsTable";

const BYTE_RANGE_FINDING: SandboxSecurityFinding = {
  finding_id: "finding:pii-1",
  detector_id: "rule/sensitive-data",
  detector_version: "1.0.0",
  category: "sensitive_data_exposure",
  severity: "high",
  confidence: 0.78,
  reason_code: "sandbox_security_sensitive_data_exposure",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "srctok-1",
      locator: { kind: "text_byte_range", start_byte: 128, end_byte: 244 }
    }
  ],
  evidence_refs: []
};

const MULTI_POSITION_FINDING: SandboxSecurityFinding = {
  finding_id: "finding:priv-1",
  detector_id: "rule/privilege-escalation",
  detector_version: "1.0.0",
  category: "privilege_escalation",
  severity: "medium",
  confidence: 0.63,
  reason_code: "sandbox_security_privilege_escalation",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "srctok-0",
      locator: { kind: "text_byte_range", start_byte: 512, end_byte: 678 }
    },
    {
      kind: "content_source",
      source_token: "srctok-2",
      locator: { kind: "json_pointer", pointer: "/payload/cmd" }
    }
  ],
  evidence_refs: ["evidence:priv-1"]
};

const CRITICAL_FINDING: SandboxSecurityFinding = {
  finding_id: "finding:inj-1",
  detector_id: "rule/prompt-injection",
  detector_version: "2.1.0",
  category: "prompt_injection",
  severity: "critical",
  confidence: 0.94,
  reason_code: "sandbox_security_prompt_injection",
  subject_refs: [
    {
      kind: "content_source",
      source_token: "srctok-3",
      locator: { kind: "whole_source" }
    }
  ],
  evidence_refs: []
};

describe("WorkbenchFindingsTable", () => {
  it("renders a real table with the operator column inventory", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    const table = screen.getByTestId("findings-table");
    expect(table.tagName).toBe("TABLE");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual([
      "#",
      "SEVERITY",
      "DETECTOR",
      "SOURCE",
      "FINDING SUMMARY",
      "CONFIDENCE"
    ]);
  });

  it("renders a byte range as a compact position and never as content", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    expect(screen.getByText("srctok-1 [128:244]")).toBeInTheDocument();
    expect(screen.getByText("0.78")).toBeInTheDocument();
    // This fixture's id is short-form `{kind}/{variant}` with a NON-default
    // variant, so both parts discriminate and both are kept. Contrast the stock
    // registry ids (`.../rule/default/v1`), where the variant is dropped.
    expect(screen.getByText("rule/sensitive-data")).toBeInTheDocument();
  });

  it("keeps the tail of a long source token so rows stay distinguishable", () => {
    // Real tokens share a long prefix and differ only at the end; eliding the
    // tail would render every row identically.
    const longToken: SandboxSecurityFinding = {
      ...BYTE_RANGE_FINDING,
      finding_id: "finding:long-1",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "source://sandbox/security/user_input/src-7",
          locator: { kind: "text_byte_range", start_byte: 10, end_byte: 20 }
        }
      ]
    };
    render(<WorkbenchFindingsTable findings={[longToken]} />);
    const cell = screen.getByText(/src-7 \[10:20\]$/);
    expect(cell).toBeInTheDocument();
    expect(cell.textContent?.startsWith("…")).toBe(true);
    expect(cell.textContent).not.toContain("source://sandbox/security/user");
  });

  it("exposes the full detector id via title while showing the short label", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    expect(screen.getByTitle("rule/sensitive-data")).toBeInTheDocument();
  });

  it("derives the summary sentence from category alone", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    expect(
      screen.getByText("检测到可能导致敏感数据或个人标识外泄的模式。")
    ).toBeInTheDocument();
  });

  it("orders rows critical-first regardless of input order", () => {
    render(
      <WorkbenchFindingsTable
        findings={[MULTI_POSITION_FINDING, CRITICAL_FINDING, BYTE_RANGE_FINDING]}
      />
    );
    const severities = screen
      .getAllByTestId("findings-table")[0]
      .querySelectorAll("tbody tr[data-severity]");
    expect(
      Array.from(severities).map((row) => row.getAttribute("data-severity"))
    ).toEqual(["critical", "high", "medium"]);
  });

  it("keeps extra positions reachable through a disclosure instead of dropping them", () => {
    render(<WorkbenchFindingsTable findings={[MULTI_POSITION_FINDING]} />);
    const toggle = screen.getByRole("button", { name: "+1 位置" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("srctok-2 /payload/cmd")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("srctok-2 /payload/cmd")).toBeInTheDocument();
    expect(screen.getByText("evidence:priv-1")).toBeInTheDocument();
    expect(
      screen.getByText("sandbox_security_privilege_escalation")
    ).toBeInTheDocument();
  });

  it("keeps a disclosure on a single-position finding for its uncolumned fields", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    const toggle = screen.getByRole("button", { name: "详情" });
    fireEvent.click(toggle);
    expect(screen.getByText("finding:pii-1")).toBeInTheDocument();
    expect(screen.getByText("rule/sensitive-data@1.0.0")).toBeInTheDocument();
  });

  it("renders the category enum verbatim so it stays log-correlatable", () => {
    render(<WorkbenchFindingsTable findings={[BYTE_RANGE_FINDING]} />);
    expect(screen.getByText("sensitive_data_exposure")).toBeInTheDocument();
  });

  it("renders an empty state rather than a headerless table", () => {
    render(<WorkbenchFindingsTable findings={[]} />);
    expect(screen.queryByTestId("findings-table")).not.toBeInTheDocument();
    expect(screen.getByText("未产生风险发现。")).toBeInTheDocument();
  });
});

const RUNS: SandboxDetectorRun[] = [
  {
    detector_id: "rule/prompt-injection",
    detector_version: "2.1.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 212,
    status: "matched",
    finding_ids: ["finding:inj-1"]
  },
  {
    detector_id: "local/classifier",
    detector_version: "1.4.0",
    detector_kind: "local_model",
    obligation: "profile_required",
    elapsed_ms: 1200,
    status: "timeout",
    error_code: "detector_timeout"
  },
  {
    detector_id: "external/judge",
    detector_version: "3.0.0",
    detector_kind: "external_judge",
    obligation: "optional_not_selected",
    elapsed_ms: 0,
    status: "skipped",
    skip_reason: "optional_not_selected"
  }
];

describe("WorkbenchDetectorTable", () => {
  it("renders a real table with the execution column inventory", () => {
    render(<WorkbenchDetectorTable runs={RUNS} />);
    const table = screen.getByTestId("detector-table");
    expect(table.tagName).toBe("TABLE");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["STEP", "DETECTOR", "STATUS", "DURATION (ms)"]);
  });

  it("numbers every run and states its real elapsed cost", () => {
    render(<WorkbenchDetectorTable runs={RUNS} />);
    const rows = screen
      .getByTestId("detector-table")
      .querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(screen.getByText("212")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("keeps a skipped run visible with its skip reason", () => {
    render(<WorkbenchDetectorTable runs={RUNS} />);
    const skipped = screen
      .getByTestId("detector-table")
      .querySelector('tbody tr[data-status="skipped"]');
    expect(skipped).not.toBeNull();
    expect(skipped?.textContent).toContain("optional_not_selected");
  });

  it("surfaces an error code for a failed run", () => {
    render(<WorkbenchDetectorTable runs={RUNS} />);
    const timedOut = screen
      .getByTestId("detector-table")
      .querySelector('tbody tr[data-status="timeout"]');
    expect(timedOut?.textContent).toContain("detector_timeout");
  });

  it("renders nothing when the policy ran no detectors", () => {
    const { container } = render(<WorkbenchDetectorTable runs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("rounds a monotonic-clock duration to whole milliseconds", () => {
    // The engine reports elapsed_ms as a float; fourteen decimals is unreadable
    // and implies precision the measurement does not have.
    const floatRun: SandboxDetectorRun = {
      ...RUNS[0],
      elapsed_ms: 82.48789799993392
    };
    render(<WorkbenchDetectorTable runs={[floatRun]} />);
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.queryByText("82.48789799993392")).not.toBeInTheDocument();
  });

  it("names a detector by its kind, skipping the version and default variant", () => {
    // These are the real registry ids, shaped {kind}/{variant}/{version}. Taking
    // the trailing segment yields "v1" on every row; stripping the version and
    // taking the new tail yields "default" on every row. Both carry no
    // information — the kind is what discriminates.
    const stock: SandboxDetectorRun[] = [
      { ...RUNS[0], detector_id: "detector://sandbox/security/rule/default/v1" },
      {
        ...RUNS[0],
        detector_id: "detector://sandbox/security/local/default/v1",
        detector_version: "2.0.0"
      }
    ];
    render(<WorkbenchDetectorTable runs={stock} />);
    expect(screen.getByText("rule")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
    expect(screen.queryByText("v1")).not.toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });

  it("keeps a non-default variant, which does discriminate", () => {
    const tuned: SandboxDetectorRun[] = [
      { ...RUNS[0], detector_id: "detector://sandbox/security/rule/strict/v1" }
    ];
    render(<WorkbenchDetectorTable runs={tuned} />);
    expect(screen.getByText("rule/strict")).toBeInTheDocument();
  });

  it("exposes the full detector id via title", () => {
    const stock: SandboxDetectorRun[] = [
      { ...RUNS[0], detector_id: "detector://sandbox/security/rule/default/v1" }
    ];
    render(<WorkbenchDetectorTable runs={stock} />);
    expect(
      screen.getByTitle("detector://sandbox/security/rule/default/v1")
    ).toBeInTheDocument();
  });
});
