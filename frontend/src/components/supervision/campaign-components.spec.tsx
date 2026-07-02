// P5-T3 RED: Campaign overview header and fixed agent groups.
//
// Covers:
// - Header progress ("X / 9"), aggregate counts (alerts/blocked/asks/retries),
//   evidence-state markers (fresh-running / fresh-completed / stale), stale
//   retry button, API source tag, no prohibited command labels, no raw content.
// - Agent group: three cases in fixed contract order, one or two attempt
//   entries, Enter/Space selection, ArrowUp/Down roving keyboard, selected
//   state, all four SandboxPolicyAction values, failed case, no nested cards,
//   no raw sentinel.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type {
  Track1CampaignAgentDetail,
  Track1CampaignAttemptSummary,
  Track1CampaignSummary
} from "../../../../shared/types/campaign-supervision";
import {
  makeCampaignDetail,
  makeCampaignSummary
} from "../../mocks/campaign-supervision";
import type {
  CampaignFreshness,
  CampaignSource
} from "../../hooks/useCampaignSupervisionPolling";
import { CampaignAgentGroup } from "./CampaignAgentGroup";
import { CampaignOverviewHeader } from "./CampaignOverviewHeader";

const RAW_SENTINEL = "RAW_NARRATIVE_SENTINEL_REQ_T1_DEMO_010";

// Prohibited command surfaces — campaign mode is read-only.
const PROHIBITED_COMMANDS = [
  "Start campaign",
  "Retry attack",
  "Approve",
  "Reject",
  "Cancel campaign",
  "Edit policy",
  "Acknowledge"
];

function findAgent(
  agentId: "agent:track1:prompt-injection" | "agent:track1:tool-hijack" | "agent:track1:memory-poison"
): Track1CampaignAgentDetail {
  const detail = makeCampaignDetail({ status: "completed" });
  const agent = detail.agents.find((a) => a.agent_id === agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in campaign detail fixture`);
  }
  return agent;
}

function makeRunningAgentWithTwoAttempts(
  agentId: "agent:track1:tool-hijack"
): Track1CampaignAgentDetail {
  // Build an agent where the first case failed first attempt and passed second
  // attempt, demonstrating the two-attempt disclosure path.
  const agent = findAgent(agentId);
  const firstCase = agent.cases[0];
  const expectedAction = firstCase.expected_action;

  const attempt1: Track1CampaignAttemptSummary = {
    ...firstCase.attempts[0],
    attempt_index: 1,
    status: "failed",
    actual_action: expectedAction === "allow" ? "deny" : "allow"
  };
  const attempt2: Track1CampaignAttemptSummary = {
    ...firstCase.attempts[0],
    attempt_id: "attempt:t1-sc-002-c001:2",
    attempt_index: 2,
    session_id: "session:track1:tool-hijack:case-1:attempt-2",
    task_id: "task:track1:tool-hijack:case-1:attempt-2",
    status: "passed",
    actual_action: expectedAction
  };
  firstCase.attempts = [attempt1, attempt2];
  firstCase.attempt_count = 2;
  firstCase.status = "passed";
  firstCase.actual_action = expectedAction;
  return agent;
}

describe("REQ-T1-DEMO-010 CampaignOverviewHeader", () => {
  test("shows progress and aggregate counts in compact band", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({
          status: "running",
          passed_case_count: 4,
          alert_count: 2,
          blocked_count: 3,
          ask_count: 1,
          retry_count: 1
        })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("4 / 9")).toBeInTheDocument();
    expect(
      screen.getByText("2", { selector: "[data-count='alerts']" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("3", { selector: "[data-count='blocked']" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("1", { selector: "[data-count='asks']" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("1", { selector: "[data-count='retries']" })
    ).toBeInTheDocument();
  });

  test("fresh running campaign has data-evidence-state=fresh-running", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByTestId("campaign-overview")).toHaveAttribute(
      "data-evidence-state",
      "fresh-running"
    );
  });

  test("fresh completed campaign has data-evidence-state=fresh-completed", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "completed" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByTestId("campaign-overview")).toHaveAttribute(
      "data-evidence-state",
      "fresh-completed"
    );
  });

  test("stale campaign has data-evidence-state=stale and retry button", () => {
    const onRetry = vi.fn();
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="integration-error"
        freshness="stale"
        onRetry={onRetry}
      />
    );
    expect(screen.getByTestId("campaign-overview")).toHaveAttribute(
      "data-evidence-state",
      "stale"
    );
    const retry = screen.getByRole("button", { name: /Retry campaign data/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("fresh campaign does not show stale retry button", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Retry campaign data/i })
    ).not.toBeInTheDocument();
  });

  test("API source is tagged visibly", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Backend API/i)).toBeInTheDocument();
  });

  test("integration-error source is tagged visibly", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="integration-error"
        freshness="stale"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Integration Error/i)).toBeInTheDocument();
  });

  test("renders campaign status as a typed tag, not raw text", () => {
    render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Running/i)).toBeInTheDocument();
  });

  test("never renders prohibited command labels", () => {
    const { container } = render(
      <CampaignOverviewHeader
        summary={makeCampaignSummary({ status: "running" })}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    const text = container.textContent ?? "";
    for (const command of PROHIBITED_COMMANDS) {
      expect(text).not.toContain(command);
    }
  });

  test("never renders raw narrative sentinel", () => {
    const summary: Track1CampaignSummary = {
      ...makeCampaignSummary({ status: "running" }),
      // Defensive: even if upstream contract somehow leaks raw content, the
      // component must not render it.
      campaign_id: RAW_SENTINEL
    } as Track1CampaignSummary;
    const { container } = render(
      <CampaignOverviewHeader
        summary={summary}
        source="api"
        freshness="fresh"
        onRetry={vi.fn()}
      />
    );
    // campaign_id is rendered as text — sentinel would appear if rendered.
    // (We accept that this test is a contract: campaign_id is shown, so we
    // ensure the rendered text only contains the safe campaign_id from the
    // standard fixture when not tampered.)
    expect(container.textContent).not.toContain(RAW_SENTINEL);
  });
});

describe("REQ-T1-DEMO-010 CampaignAgentGroup", () => {
  test("renders three cases in fixed contract order", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const items = screen.getAllByRole("listitem", {
      name: /T1-SC-002-C00[1-3]/
    });
    expect(items).toHaveLength(3);
    // Exact order: C001, C002, C003.
    expect(items[0]).toHaveAccessibleName(/T1-SC-002-C001/);
    expect(items[1]).toHaveAccessibleName(/T1-SC-002-C002/);
    expect(items[2]).toHaveAccessibleName(/T1-SC-002-C003/);
  });

  test("renders exactly one attempt entry for single-attempt cases", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const attemptButtons = screen.getAllByRole("button", {
      name: /Inspect T1-SC-002-C00\d attempt 1/
    });
    expect(attemptButtons).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /attempt 2/i })
    ).not.toBeInTheDocument();
  });

  test("renders two attempt entries when a case has two attempts", () => {
    const agent = makeRunningAgentWithTwoAttempts("agent:track1:tool-hijack");
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /Inspect T1-SC-002-C001 attempt 1/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Inspect T1-SC-002-C001 attempt 2/ })
    ).toBeInTheDocument();
  });

  test("Enter key on an attempt button selects its session", () => {
    const onSelectSession = vi.fn();
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={onSelectSession}
      />
    );
    const attempt = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    fireEvent.keyDown(attempt, { key: "Enter" });
    expect(onSelectSession).toHaveBeenCalledWith(
      expect.stringMatching(/^session:/)
    );
  });

  test("Space key on an attempt button selects its session", () => {
    const onSelectSession = vi.fn();
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={onSelectSession}
      />
    );
    const attempt = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    fireEvent.keyDown(attempt, { key: " " });
    expect(onSelectSession).toHaveBeenCalledTimes(1);
  });

  test("ArrowDown moves focus to the next attempt button", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const first = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    const second = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C002 attempt 1/
    });
    first.focus();
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
  });

  test("ArrowUp moves focus to the previous attempt button", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const first = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    const second = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C002 attempt 1/
    });
    second.focus();
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(first).toHaveFocus();
  });

  test("Home and End move focus to first and last attempt button", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const first = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    const last = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C003 attempt 1/
    });
    last.focus();
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
  });

  test("selected attempt button has aria-selected=true and tabIndex=0", () => {
    const agent = findAgent("agent:track1:tool-hijack");
    const selectedSessionId = agent.cases[0].attempts[0].session_id;
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={selectedSessionId}
        onSelectSession={vi.fn()}
      />
    );
    const selected = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveAttribute("tabindex", "0");
  });

  test("unselected attempt buttons have tabIndex=-1", () => {
    const agent = findAgent("agent:track1:tool-hijack");
    const selectedSessionId = agent.cases[0].attempts[0].session_id;
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={selectedSessionId}
        onSelectSession={vi.fn()}
      />
    );
    const unselected = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C002 attempt 1/
    });
    expect(unselected).toHaveAttribute("aria-selected", "false");
    expect(unselected).toHaveAttribute("tabindex", "-1");
  });

  test("first attempt button has tabIndex=0 when no selection exists", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const first = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    expect(first).toHaveAttribute("tabindex", "0");
    const second = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C002 attempt 1/
    });
    expect(second).toHaveAttribute("tabindex", "-1");
  });

  test("renders all four SandboxPolicyAction values across cases", () => {
    // Construct an agent whose three cases cover allow, deny, ask, alert.
    const agent = findAgent("agent:track1:tool-hijack");
    agent.cases[0].expected_action = "allow";
    agent.cases[0].attempts[0].actual_action = "allow";
    agent.cases[1].expected_action = "deny";
    agent.cases[1].attempts[0].actual_action = "deny";
    agent.cases[2].expected_action = "ask";
    agent.cases[2].attempts[0].actual_action = "alert";
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(screen.getAllByText(/allow/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deny/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ask/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/alert/i).length).toBeGreaterThan(0);
  });

  test("marks final attempt with a final marker", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    // Final marker is present for each single-attempt case (the only attempt
    // is the final one).
    const finalMarkers = screen.getAllByTestId("attempt-final-marker");
    expect(finalMarkers).toHaveLength(3);
  });

  test("failed case shows failed status tag", () => {
    const agent = findAgent("agent:track1:tool-hijack");
    agent.cases[0].status = "failed";
    agent.cases[0].attempts[0].status = "failed";
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    // Both the case-level status and the attempt-level status render "Failed".
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1);
  });

  test("group has role=group with accessible name referencing the agent id", () => {
    render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(
      screen.getByRole("group", { name: /agent:track1:tool-hijack/i })
    ).toBeInTheDocument();
  });

  test("attempt button stores its session id in a data attribute", () => {
    const agent = findAgent("agent:track1:tool-hijack");
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const firstAttempt = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    const expectedSessionId = agent.cases[0].attempts[0].session_id;
    expect(firstAttempt).toHaveAttribute("data-session-id", expectedSessionId);
  });

  test("clicking an attempt button selects its session", () => {
    const onSelectSession = vi.fn();
    const agent = findAgent("agent:track1:tool-hijack");
    render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={onSelectSession}
      />
    );
    const attempt = screen.getByRole("button", {
      name: /Inspect T1-SC-002-C001 attempt 1/
    });
    fireEvent.click(attempt);
    expect(onSelectSession).toHaveBeenCalledWith(
      agent.cases[0].attempts[0].session_id
    );
  });

  test("never renders prohibited command labels", () => {
    const { container } = render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    const text = container.textContent ?? "";
    for (const command of PROHIBITED_COMMANDS) {
      expect(text).not.toContain(command);
    }
  });

  test("never renders raw narrative sentinel", () => {
    const agent = findAgent("agent:track1:tool-hijack");
    // Tamper with a non-displayed field to prove the component does not
    // surface arbitrary raw content.
    (agent as unknown as { __rawNarrative?: string }).__rawNarrative = RAW_SENTINEL;
    const { container } = render(
      <CampaignAgentGroup
        agent={agent}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain(RAW_SENTINEL);
  });

  test("does not render nested cards (no ant-card descendants)", () => {
    const { container } = render(
      <CampaignAgentGroup
        agent={findAgent("agent:track1:tool-hijack")}
        selectedSessionId={null}
        onSelectSession={vi.fn()}
      />
    );
    expect(container.querySelector(".ant-card")).toBeNull();
  });
});

// Helper test to verify that CampaignOverviewHeader accepts the union source
// type without falling back to a default — this catches typos in the prop.
describe("REQ-T1-DEMO-010 CampaignOverviewHeader prop contract", () => {
  test.each([
    ["api", "fresh"],
    ["api", "stale"],
    ["integration-error", "stale"],
    ["mock", "fresh"]
  ] as const)(
    "accepts source=%s freshness=%s",
    (source: CampaignSource, freshness: CampaignFreshness) => {
      render(
        <CampaignOverviewHeader
          summary={makeCampaignSummary({ status: "running" })}
          source={source}
          freshness={freshness}
          onRetry={vi.fn()}
        />
      );
      expect(screen.getByTestId("campaign-overview")).toBeInTheDocument();
    }
  );
});
