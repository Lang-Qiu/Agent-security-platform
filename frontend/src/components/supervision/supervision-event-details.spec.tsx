import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { SandboxSupervisionEventView } from "../../../shared/types/supervision";
import {
  makeEventView,
  makeSupervisionDetail
} from "../../mocks/supervision";
import { SupervisionEventDetails } from "./SupervisionEventDetails";
import { SupervisionEventTimeline } from "./SupervisionEventTimeline";

const RAW_NARRATIVE_SENTINEL = "RAW_NARRATIVE_SENTINEL_REQ009";

const EVENT_TYPE_LABELS: ReadonlyArray<
  [SandboxSupervisionEventView["event_type"], string]
> = [
  ["model_input", "Model input"],
  ["model_output", "Model output"],
  ["tool_request", "Tool request"],
  ["tool_result", "Tool result"],
  ["policy_decision", "Policy decision"],
  ["memory_write", "Memory write"],
  ["memory_read", "Memory read"]
];

describe("REQ-T1-SUPERVISION-UI-009 supervision event details", () => {
  test.each(EVENT_TYPE_LABELS)(
    "renders %s through a typed safe view",
    (eventType, label) => {
      render(
        <SupervisionEventDetails
          event={makeEventView(eventType)}
          decisions={[]}
          alerts={[]}
          blockedRecords={[]}
        />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  );

  test("never renders producer narrative", () => {
    const event = {
      ...makeEventView("policy_decision"),
      payload: {
        ...makeEventView("policy_decision").payload,
        reason_code: "base_filter_no_match"
      }
    };

    render(
      <SupervisionEventDetails
        event={event}
        decisions={[]}
        alerts={[]}
        blockedRecords={[]}
      />
    );

    expect(screen.queryByText(RAW_NARRATIVE_SENTINEL)).not.toBeInTheDocument();
    expect(screen.getByText("base filter no match")).toBeInTheDocument();
  });

  test("correlates outcomes to subject events", () => {
    const detail = makeSupervisionDetail();
    const subject = detail.events.find(
      (event) => event.event_id === detail.policy_decisions[0].subject_event_id
    )!;

    render(
      <SupervisionEventDetails
        event={subject}
        decisions={detail.policy_decisions}
        alerts={detail.alerts}
        blockedRecords={detail.blocked_records}
      />
    );

    expect(screen.getByText(/deny/i)).toBeInTheDocument();
    expect(screen.getByText(/^blocked$/i)).toBeInTheDocument();
  });

  test("renders refs as text, never as anchors", () => {
    render(
      <SupervisionEventDetails
        event={makeEventView("tool_request")}
        decisions={[]}
        alerts={[]}
        blockedRecords={[]}
      />
    );

    const targetRef = "recipient://reviewer@local.invalid";
    expect(screen.getByText(targetRef)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("provides copy buttons with accessible names for refs", () => {
    render(
      <SupervisionEventDetails
        event={makeEventView("model_input")}
        decisions={[]}
        alerts={[]}
        blockedRecords={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: /copy model ref/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy content ref/i })
    ).toBeInTheDocument();
  });

  test("formats reason_code and category tokens without underscores", () => {
    const event = {
      ...makeEventView("policy_decision"),
      payload: {
        ...makeEventView("policy_decision").payload,
        reason_code: "target_not_approved"
      }
    };

    render(
      <SupervisionEventDetails
        event={event}
        decisions={[]}
        alerts={[]}
        blockedRecords={[]}
      />
    );

    expect(screen.getByText("target not approved")).toBeInTheDocument();
    expect(screen.queryByText("target_not_approved")).not.toBeInTheDocument();
  });
});

describe("REQ-T1-SUPERVISION-UI-009 supervision event timeline", () => {
  test("expands at most one timeline event", async () => {
    render(<SupervisionEventTimeline detail={makeSupervisionDetail()} />);

    const first = screen.getByRole("button", { name: /event 1/i });
    const second = screen.getByRole("button", { name: /event 2/i });

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  test("renders event rows ordered by sequence", () => {
    render(<SupervisionEventTimeline detail={makeSupervisionDetail()} />);

    const buttons = screen.getAllByRole("button", { name: /event \d+/i });
    expect(buttons).toHaveLength(7);
    expect(buttons[0]).toHaveAccessibleName(/event 1/i);
    expect(buttons[6]).toHaveAccessibleName(/event 7/i);
  });

  test("closes expanded event safely when it disappears after refresh", () => {
    const { rerender } = render(
      <SupervisionEventTimeline detail={makeSupervisionDetail()} />
    );

    const first = screen.getByRole("button", { name: /event 1/i });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");

    const refreshed = makeSupervisionDetail();
    refreshed.events = refreshed.events.filter(
      (e) => e.event_id !== "event:model_input"
    );

    rerender(<SupervisionEventTimeline detail={refreshed} />);

    const remaining = screen.getAllByRole("button", { name: /event \d+/i });
    for (const btn of remaining) {
      expect(btn).toHaveAttribute("aria-expanded", "false");
    }
  });
});
