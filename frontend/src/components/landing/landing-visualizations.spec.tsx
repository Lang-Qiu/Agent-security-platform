import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderAppAtRoute } from "../../test/app-test-harness";

interface ObservedTarget {
  readonly callback: IntersectionObserverCallback;
  readonly observer: ControlledIntersectionObserver;
}

const observedTargets = new Map<Element, ObservedTarget>();

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0.15];
  readonly takeRecords = vi.fn(() => []);
  readonly unobserve = vi.fn((target: Element) => observedTargets.delete(target));
  readonly observe = vi.fn((target: Element) => {
    observedTargets.set(target, { callback: this.callback, observer: this });
  });
  readonly disconnect = vi.fn(() => {
    for (const [target, record] of observedTargets) {
      if (record.observer === this) observedTargets.delete(target);
    }
  });

  constructor(private readonly callback: IntersectionObserverCallback) {}
}

function mockMotionPreference(reduced: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function setInView(target: Element, isIntersecting: boolean) {
  const record = observedTargets.get(target);
  if (!record) throw new Error("Expected the narrative section to be observed");

  act(() => {
    record.callback(
      [{ isIntersecting, target } as IntersectionObserverEntry],
      record.observer
    );
  });
}

async function renderLandingRoute({ reduced = false } = {}) {
  vi.useRealTimers();
  mockMotionPreference(reduced);
  const app = await renderAppAtRoute("/");
  await screen.findByRole("main");
  vi.useFakeTimers();
  return app;
}

describe("Landing Discover and Analyze product evidence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    mockMotionPreference(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observedTargets.clear();
  });

  test("keeps complete attack-surface evidence visible while keyboard, pointer, and click share selection", async () => {
    await renderLandingRoute({ reduced: true });
    const discover = document.querySelector<HTMLElement>(".landing-discover")!;
    const scope = within(discover);
    const surface = discover.querySelector<HTMLElement>(".landing-attack-surface")!;
    const evidenceList = scope.getByRole("list", { name: "Attack surface evidence" });

    expect(discover).toHaveAttribute("data-discover-scan", "revealed");
    expect(within(evidenceList).getAllByRole("listitem")).toHaveLength(6);
    for (const label of [
      "Agent service",
      "Framework",
      "Interface",
      "Skill package",
      "External Tool",
      "Exposure"
    ]) {
      expect(within(evidenceList).getByText(label)).toBeVisible();
    }
    for (const identifier of [
      "framework_fingerprint",
      "tool_endpoint",
      "skill_package"
    ]) {
      expect(within(evidenceList).getByText(identifier)).toBeVisible();
    }

    const framework = scope.getByRole("button", {
      name: "Inspect Framework evidence"
    });
    const externalTool = scope.getByRole("button", {
      name: "Inspect External Tool evidence"
    });
    const skillPackage = scope.getByRole("button", {
      name: "Inspect Skill package evidence"
    });

    fireEvent.focus(framework);
    expect(surface).toHaveAttribute("data-selected-evidence", "framework");
    expect(scope.getByTestId("discover-selected-definition")).toHaveTextContent(
      "Framework identity and runtime signature"
    );

    fireEvent.pointerEnter(externalTool);
    expect(surface).toHaveAttribute("data-selected-evidence", "tool");
    expect(scope.getByTestId("discover-selected-definition")).toHaveTextContent(
      "Outbound Tool destination exposed to the Agent"
    );

    fireEvent.click(skillPackage);
    expect(surface).toHaveAttribute("data-selected-evidence", "skill");
    expect(scope.getByTestId("discover-selected-definition")).toHaveTextContent(
      "Installed Skill package connected to the service"
    );
    expect(within(evidenceList).getAllByRole("listitem")).toHaveLength(6);
  });

  test("presents a credible layered Skill inspection without hiding evidence when focus changes", async () => {
    await renderLandingRoute({ reduced: true });
    const analyze = document.querySelector<HTMLElement>(".landing-analyze")!;
    const scope = within(analyze);
    const surface = analyze.querySelector<HTMLElement>(".landing-skill-inspection")!;

    expect(analyze).toHaveAttribute("data-inspection-focus", "reason");
    expect(surface).toHaveAttribute("data-selected-inspection", "reason");
    expect(scope.getByTestId("inspection-selected-definition")).toHaveTextContent(
      "Evidence converges on a tool-scope escalation outcome"
    );
    expect(scope.getByText("Illustrative analysis output")).toBeVisible();
    expect(
      scope.getByText("Product visualization / illustrative scenario")
    ).toBeVisible();
    for (const title of [
      "Manifest",
      "Dependency",
      "Permission boundary",
      "Tool invocation"
    ]) {
      expect(scope.getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
    for (const identifier of [
      "skill_package",
      "dependency",
      "permission_boundary",
      "tool_invocation",
      "reason_code: tool_scope_escalation"
    ]) {
      expect(scope.getAllByText(identifier).length).toBeGreaterThan(0);
    }

    const panes = scope.getAllByTestId("inspection-pane");
    expect(panes).toHaveLength(5);
    fireEvent.focus(
      scope.getByRole("button", { name: "Inspect Permission boundary evidence" })
    );
    expect(surface).toHaveAttribute("data-selected-inspection", "permission");
    expect(scope.getByTestId("inspection-selected-definition")).toHaveTextContent(
      "Declared write boundary exceeds the package's stated purpose"
    );

    fireEvent.pointerEnter(
      scope.getByRole("button", { name: "Inspect Tool invocation evidence" })
    );
    expect(surface).toHaveAttribute("data-selected-inspection", "invocation");
    fireEvent.click(scope.getByRole("button", { name: "Inspect Manifest evidence" }));
    expect(surface).toHaveAttribute("data-selected-inspection", "manifest");
    expect(scope.getAllByTestId("inspection-pane")).toEqual(panes);
    panes.forEach((pane) => expect(pane).toBeVisible());
  });

  test("pauses and resumes each bounded narrative sequence without replaying settled scenes", async () => {
    const app = await renderLandingRoute();
    const discover = document.querySelector<HTMLElement>(".landing-discover")!;
    const analyze = document.querySelector<HTMLElement>(".landing-analyze")!;

    expect(discover).toHaveAttribute("data-discover-scan", "idle");
    expect(analyze).toHaveAttribute("data-inspection-focus", "manifest");

    setInView(discover, true);
    act(() => vi.advanceTimersByTime(0));
    expect(discover).toHaveAttribute("data-discover-scan", "scanning");
    act(() => vi.advanceTimersByTime(350));
    setInView(discover, false);
    expect(discover).toHaveAttribute("data-discover-scan", "paused");
    act(() => vi.advanceTimersByTime(5_000));
    expect(discover).toHaveAttribute("data-discover-scan", "paused");

    setInView(discover, true);
    expect(discover).toHaveAttribute("data-discover-scan", "scanning");
    act(() => vi.advanceTimersByTime(549));
    expect(discover).toHaveAttribute("data-discover-scan", "scanning");
    act(() => vi.advanceTimersByTime(1));
    expect(discover).toHaveAttribute("data-discover-scan", "revealed");
    setInView(discover, false);
    setInView(discover, true);
    act(() => vi.advanceTimersByTime(5_000));
    expect(discover).toHaveAttribute("data-discover-scan", "revealed");

    setInView(analyze, true);
    expect(analyze).toHaveAttribute("data-inspection-focus", "manifest");
    act(() => vi.advanceTimersByTime(75));
    expect(analyze).toHaveAttribute("data-inspection-focus", "dependency");
    act(() => vi.advanceTimersByTime(75));
    expect(analyze).toHaveAttribute("data-inspection-focus", "permission");
    setInView(analyze, false);
    expect(analyze).toHaveAttribute("data-inspection-paused", "true");
    act(() => vi.advanceTimersByTime(1_000));
    expect(analyze).toHaveAttribute("data-inspection-focus", "permission");

    setInView(analyze, true);
    act(() => vi.advanceTimersByTime(75));
    expect(analyze).toHaveAttribute("data-inspection-focus", "invocation");
    act(() => vi.advanceTimersByTime(75));
    expect(analyze).toHaveAttribute("data-inspection-focus", "reason");
    setInView(analyze, false);
    setInView(analyze, true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(analyze).toHaveAttribute("data-inspection-focus", "reason");

    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("starts settled and leaves no timer when reduced motion is requested", async () => {
    const app = await renderLandingRoute({ reduced: true });

    expect(document.querySelector(".landing-discover")).toHaveAttribute(
      "data-discover-scan",
      "revealed"
    );
    expect(document.querySelector(".landing-analyze")).toHaveAttribute(
      "data-inspection-focus",
      "reason"
    );
    expect(vi.getTimerCount()).toBe(0);

    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
