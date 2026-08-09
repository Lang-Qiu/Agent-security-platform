import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindingsCascade } from "../components/sandbox-security/showcase/FindingsCascade";
import { VerdictHero } from "../components/sandbox-security/showcase/VerdictHero";
import { showcaseDecision } from "../content/sandbox-security-showcase";
import { SandboxSecurityShowcasePage } from "./SandboxSecurityShowcasePage";

// Mirrors the page and the detector chain. Kept as separate constants because
// the flush below must happen in two stages, one per act boundary.
const ARMING_MS = 900;
const REPLAY_WINDOW_MS = 2200;

/**
 * Drives the real animated timeline rather than the reduced-motion shortcut.
 *
 * Motion resolves `prefers-reduced-motion` internally at a point a per-test
 * `window.matchMedia` mock does not reach, so mocking the query is not a
 * reliable way to make this page synchronous. Every act transition is a
 * `setTimeout`, so fake timers give deterministic control over the path a real
 * viewer actually sees. Reduced motion is covered separately by passing the
 * resolved preference to the components that take it as a prop.
 *
 * The flush is deliberately two-stage. The detector chain schedules its own
 * timers inside an effect that only runs once act one has handed over, so those
 * timers do not exist during the first advance. A single large advance would
 * register them at the already-advanced clock and they would never fire.
 */
function runFullSequence() {
  fireEvent.click(screen.getByRole("button", { name: /开始演示/ }));
  // Stage one: hand act one over to the chain, which schedules its replay.
  act(() => {
    vi.advanceTimersByTime(ARMING_MS + 50);
  });
  // Stage two: run the replay out so the chain reports completion.
  act(() => {
    vi.advanceTimersByTime(REPLAY_WINDOW_MS + 500);
  });
}

describe("sandbox security showcase page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("labels the decision as authored demonstration data", () => {
    render(<SandboxSecurityShowcasePage />);
    // The showcase renders a fixture verdict, which the workbench is forbidden
    // from doing. The on-screen provenance label is what keeps that honest, so
    // it is a required element rather than decoration.
    expect(screen.getByText("演示数据")).toBeInTheDocument();
    expect(screen.getByText(/预置演示数据/)).toBeInTheDocument();
  });

  it("claims no verdict before the sequence is released", () => {
    render(<SandboxSecurityShowcasePage />);
    // Gated, not merely transparent: a verdict sitting at opacity 0 would still
    // be announced by a screen reader and still match a text query, asserting a
    // result that has not been produced yet.
    expect(screen.queryByText(showcaseDecision.verdict)).not.toBeInTheDocument();
    expect(screen.queryByText(showcaseDecision.action)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reaches the verdict once the sequence completes", () => {
    render(<SandboxSecurityShowcasePage />);
    runFullSequence();

    // The verdict renders in both the hero and the decision summary, so the
    // assertion is on presence rather than on a single node.
    expect(screen.getAllByText(showcaseDecision.verdict).length).toBeGreaterThan(0);
    expect(screen.getAllByText(showcaseDecision.action).length).toBeGreaterThan(0);
  });

  it("announces the verdict through exactly one live region", () => {
    render(<SandboxSecurityShowcasePage />);
    runFullSequence();

    // Two competing live regions would announce the same verdict twice. The
    // decision summary owns the only one; the hero is deliberately role-free.
    const live = screen.getAllByRole("status");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveAttribute("aria-live", "polite");
    expect(live[0]).toHaveTextContent(showcaseDecision.verdict);
  });

  it("returns to the idle state on reset", () => {
    render(<SandboxSecurityShowcasePage />);
    runFullSequence();
    expect(screen.getAllByText(showcaseDecision.verdict).length).toBeGreaterThan(0);

    // antd inserts a space between the two characters of a two-character CJK
    // button label, so this control's accessible name is "重 置", not "重置".
    fireEvent.click(screen.getByRole("button", { name: /重\s*置/ }));

    expect(screen.queryByText(showcaseDecision.verdict)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("gives every control an accessible name", () => {
    render(<SandboxSecurityShowcasePage />);
    for (const control of screen.getAllByRole("button")) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("writes nothing to browser storage", () => {
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");

    render(<SandboxSecurityShowcasePage />);
    runFullSequence();

    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });
});

describe("showcase findings cascade", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing but a placeholder before release", () => {
    render(
      <FindingsCascade
        findings={showcaseDecision.findings}
        active={false}
        reduceMotion={false}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/演示开始后/)).toBeInTheDocument();
  });

  it("orders findings by severity, worst first", () => {
    render(
      <FindingsCascade
        findings={showcaseDecision.findings}
        active
        reduceMotion={false}
      />
    );
    const rows = screen.getAllByRole("button", { expanded: false });
    // The cascade must draw the eye to the worst result before the rest of the
    // list exists, so critical leads regardless of the engine's array order.
    expect(rows[0]).toHaveAttribute("data-severity", "critical");
  });

  it("expands a finding into a labelled dialog and closes it again", () => {
    render(
      <FindingsCascade
        findings={showcaseDecision.findings}
        active
        reduceMotion={false}
      />
    );
    const firstRow = screen.getAllByRole("button", { expanded: false })[0];
    fireEvent.click(firstRow);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/风险发现详情/);

    fireEvent.click(screen.getByRole("button", { name: /收起详情/ }));
    expect(screen.getAllByRole("button", { expanded: false }).length).toBeGreaterThan(0);
  });

  it("renders position references only, never submitted content", () => {
    render(
      <FindingsCascade
        findings={showcaseDecision.findings}
        active
        reduceMotion={false}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]);

    // A subject_ref is a position (source token plus byte range or JSON
    // pointer). The detail surface has no access to the submitted value, so the
    // rendered locator must remain a position and never a snippet.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("source://sandbox/security/showcase/0001");
    expect(dialog).toHaveTextContent("412");
    expect(dialog).toHaveTextContent("519");
  });
});

describe("showcase verdict hero", () => {
  it("holds a placeholder until the verdict is earned", () => {
    render(
      <VerdictHero decision={showcaseDecision} active={false} reduceMotion={false} />
    );
    expect(screen.queryByText(showcaseDecision.verdict)).not.toBeInTheDocument();
    expect(screen.getByText(/演示开始后/)).toBeInTheDocument();
  });

  it("presents the verdict without a second live region", () => {
    render(<VerdictHero decision={showcaseDecision} active reduceMotion={false} />);
    expect(screen.getByText(showcaseDecision.verdict)).toBeInTheDocument();
    // DecisionSummaryPanel owns the page's only role="status".
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("delivers the same content under reduced motion", () => {
    // Reduced motion is a non-vestibular equivalent, not a loss of information:
    // the verdict and its metrics still arrive, they simply do not travel.
    render(<VerdictHero decision={showcaseDecision} active reduceMotion />);
    expect(screen.getByText(showcaseDecision.verdict)).toBeInTheDocument();
    expect(screen.getByText(showcaseDecision.action)).toBeInTheDocument();
    expect(screen.getByText(showcaseDecision.risk_level)).toBeInTheDocument();
  });
});
