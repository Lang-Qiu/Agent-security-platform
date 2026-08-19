import { act, fireEvent, screen, within } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppProviders } from "../../app/AppProviders";
import { renderAppAtRoute } from "../../test/app-test-harness";

const observedTargets = new Map<
  Element,
  {
    readonly callback: IntersectionObserverCallback;
    readonly observer: ControlledIntersectionObserver;
  }
>();

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  disconnect = vi.fn(() => {
    for (const [target, record] of observedTargets) {
      if (record.observer === this) observedTargets.delete(target);
    }
  });
  observe = vi.fn((target: Element) => {
    observedTargets.set(target, { callback: this.callback, observer: this });
  });
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();

  constructor(private readonly callback: IntersectionObserverCallback) {}
}

function setHeroInView(isIntersecting: boolean) {
  const hero = document.querySelector(".landing-hero");
  const record = hero ? observedTargets.get(hero) : undefined;
  if (!hero || !record) throw new Error("Expected the Hero to be observed");

  act(() => {
    record.callback(
      [{ isIntersecting, target: hero } as IntersectionObserverEntry],
      record.observer
    );
  });
}

function mockInteractionPreferences({
  coarse = false,
  narrow = false,
  reduced = false
}: {
  readonly coarse?: boolean;
  readonly narrow?: boolean;
  readonly reduced?: boolean;
} = {}) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reduced
      : query.includes("pointer: coarse")
        ? coarse
        : query.includes("pointer: fine")
          ? !coarse
          : query.includes("max-width: 1024px")
            ? narrow
            : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

async function renderHeroRoute() {
  vi.useRealTimers();
  const app = await renderAppAtRoute("/");
  await screen.findByRole("main");
  vi.useFakeTimers();
  setHeroInView(false);
  setHeroInView(true);
  return app;
}

describe("Landing cinematic product Hero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    mockInteractionPreferences();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observedTargets.clear();
  });

  test("presents the approved promise, actions, and complete illustrative security evidence", async () => {
    await renderHeroRoute();
    const hero = document.querySelector<HTMLElement>(".landing-hero");
    expect(hero).not.toBeNull();

    const scope = within(hero!);
    const headline = scope.getByRole("heading", {
      level: 1,
      name: "Secure every decision your agents make."
    });
    expect(headline).toBeVisible();
    expect(headline).toHaveClass("landing-hero__title");
    expect(
      scope.getByText(
        "从发现暴露面，到分析执行能力，再到运行时监管，为 Agent、Skills 与 Tool Interactions 建立一条可追溯的安全证据链。"
      )
    ).toBeVisible();
    const primaryAction = scope.getByRole("link", { name: "Launch Security Console" });
    const secondaryAction = scope.getByRole("link", { name: "Explore the platform" });
    expect(primaryAction).toHaveAttribute("href", "/console");
    expect(primaryAction).toHaveAttribute("lang", "en");
    expect(secondaryAction).toHaveAttribute("href", "#discover");
    expect(secondaryAction).toHaveAttribute("lang", "en");
    const workbenchHeading = scope.getByRole("heading", {
      level: 2,
      name: "Illustrative security evaluation"
    });
    expect(workbenchHeading).toBeVisible();
    expect(workbenchHeading.closest("figure")).toHaveAttribute("lang", "en");
    expect(scope.getByRole("heading", { level: 3, name: "Evidence chain" })).toBeVisible();
    expect(scope.getByRole("heading", { level: 3, name: "Detectors" })).toBeVisible();
    expect(scope.getByText("runtime_interaction/trace-0142")).toBeVisible();
    const evidenceCount = scope.getByText("evidence_count: 06");
    expect(evidenceCount).toBeVisible();
    expect(scope.getAllByTestId("hero-evidence-row")).toHaveLength(6);
    for (const evidence of [
      "identity_context",
      "skill_provenance",
      "tool_scope",
      "prompt_context",
      "dependency_signal",
      "requested_action"
    ]) {
      expect(scope.getByText(evidence)).toBeVisible();
    }
    expect(scope.getByText("rule_detector")).toBeVisible();
    expect(scope.getByText("local_model")).toBeVisible();
    expect(scope.getByText("external_judge")).toBeVisible();
    expect(scope.getByText("reason_code: tool_scope_escalation")).toBeVisible();
    expect(scope.getByText("policy_action: deny")).toBeVisible();
    expect(scope.getByText("containment: active")).toBeVisible();
    expect(scope.getByText(/示意 Agent 安全评估/)).toBeInTheDocument();
    expect(hero).toHaveTextContent("ASSET DISCOVERY / STATIC ANALYSIS / RUNTIME SECURITY");
    expect(hero?.textContent).not.toMatch(
      /\bLIVE\b|\b(?:confidence|latency|last_seen|updated_at)\b|\b\d+(?:ms|seconds?)\b/i
    );

    const decorativeVectors = hero?.querySelectorAll("svg");
    expect(decorativeVectors?.length).toBeGreaterThan(0);
    decorativeVectors?.forEach((vector) => expect(vector).toHaveAttribute("aria-hidden", "true"));
    expect(hero?.querySelectorAll(".landing-hero__dust")).toHaveLength(6);
    expect(hero?.querySelector(".landing-hero__environment")).toHaveAttribute("data-depth", "z0");
    expect(hero?.querySelector(".landing-hero__frame")).toHaveAttribute("data-depth", "z1");
    expect(hero?.querySelector(".landing-hero__foreground")).toHaveAttribute("data-depth", "z2");
    const mobileCue = scope.getByTestId("hero-next-section-cue");
    expect(mobileCue).toHaveTextContent("01 / Discover");
    expect(mobileCue.children).toHaveLength(1);
    expect(mobileCue).toHaveAttribute("aria-hidden", "true");
    for (const groupName of [
      "Decision topology",
      "Evidence count",
      "Risk signal",
      "Policy decision"
    ]) {
      expect(scope.getByRole("group", { name: groupName })).toBeVisible();
    }
    expect(scope.queryAllByRole("complementary")).toHaveLength(0);
  });

  test("keeps the derived evidence count in the Z2 decision composition", async () => {
    await renderHeroRoute();
    const hero = document.querySelector<HTMLElement>(".landing-hero")!;
    const frame = hero.querySelector<HTMLElement>(".landing-hero__frame");
    const foreground = hero.querySelector<HTMLElement>(".landing-hero__foreground");
    const evidenceCount = within(hero).getByText("evidence_count: 06");

    expect(frame).not.toContainElement(foreground);
    expect(frame).not.toContainElement(evidenceCount);
    expect(foreground).toContainElement(evidenceCount);
  });

  test("starts settled when IntersectionObserver motion enhancement is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.useRealTimers();
    const app = await renderAppAtRoute("/");
    await screen.findByRole("main");
    vi.useFakeTimers();

    const hero = document.querySelector<HTMLElement>(".landing-hero")!;
    expect(hero).toHaveAttribute("data-hero-phase", "resolved");
    expect(within(hero).getByText("RESOLVED")).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);

    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("pauses its mount-local entrance out of view and resumes without replay", async () => {
    const app = await renderHeroRoute();
    const hero = document.querySelector<HTMLElement>(".landing-hero")!;

    expect(hero).toHaveAttribute("data-hero-phase", "copy");
    expect(hero).toHaveAttribute("data-in-view", "true");
    act(() => vi.advanceTimersByTime(1050));
    expect(hero).toHaveAttribute("data-hero-phase", "trace");
    expect(within(hero).getByText("EVALUATING")).toBeVisible();

    app.rerender(
      <AppProviders>
        <RouterProvider router={app.router} />
      </AppProviders>
    );
    expect(document.querySelector(".landing-hero")).toBe(hero);
    expect(hero).toHaveAttribute("data-hero-phase", "trace");

    setHeroInView(false);
    expect(hero).toHaveAttribute("data-in-view", "false");
    act(() => vi.advanceTimersByTime(5000));
    expect(hero).toHaveAttribute("data-hero-phase", "trace");

    setHeroInView(true);
    act(() => vi.advanceTimersByTime(1200));
    expect(hero).toHaveAttribute("data-hero-phase", "resolved");
    expect(within(hero).getByText("RESOLVED")).toBeVisible();
    setHeroInView(false);
    setHeroInView(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(hero).toHaveAttribute("data-hero-phase", "resolved");

    app.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const remounted = await renderHeroRoute();
    expect(document.querySelector(".landing-hero")).toHaveAttribute("data-hero-phase", "copy");
    expect(within(document.querySelector<HTMLElement>(".landing-hero")!).getByText("EVALUATING")).toBeVisible();
    remounted.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("writes bounded CSS variables only from fine-pointer events local to the Hero", async () => {
    const addWindowListener = vi.spyOn(window, "addEventListener");
    await renderHeroRoute();
    const hero = document.querySelector<HTMLElement>(".landing-hero")!;
    const surface = hero.querySelector<HTMLElement>(".landing-hero__scene")!;
    const primaryAction = within(hero).getByRole("link", {
      name: "Launch Security Console"
    });

    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      bottom: 700,
      height: 600,
      left: 100,
      right: 900,
      top: 100,
      width: 800,
      x: 100,
      y: 100,
      toJSON: () => ({})
    });
    vi.spyOn(primaryAction, "getBoundingClientRect").mockReturnValue({
      bottom: 160,
      height: 48,
      left: 100,
      right: 340,
      top: 112,
      width: 240,
      x: 100,
      y: 112,
      toJSON: () => ({})
    });

    fireEvent.pointerMove(surface, { clientX: 900, clientY: 700 });
    fireEvent.pointerMove(primaryAction, { clientX: 340, clientY: 160 });
    act(() => vi.advanceTimersByTime(20));

    expect(Math.abs(Number.parseFloat(surface.style.getPropertyValue("--hero-rotate-x"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(surface.style.getPropertyValue("--hero-rotate-y"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(surface.style.getPropertyValue("--hero-plane-x"))))
      .toBeLessThanOrEqual(8);
    expect(Math.abs(Number.parseFloat(surface.style.getPropertyValue("--hero-plane-y"))))
      .toBeLessThanOrEqual(8);
    expect(surface.style.getPropertyValue("--hero-spotlight-x")).toMatch(/px$/);
    expect(surface.style.getPropertyValue("--hero-spotlight-y")).toMatch(/px$/);
    expect(Math.abs(Number.parseFloat(primaryAction.style.getPropertyValue("--magnetic-x"))))
      .toBeLessThanOrEqual(4);
    expect(Math.abs(Number.parseFloat(primaryAction.style.getPropertyValue("--magnetic-y"))))
      .toBeLessThanOrEqual(4);
    expect(addWindowListener.mock.calls.some(([eventName]) => eventName === "pointermove"))
      .toBe(false);

    fireEvent.pointerLeave(surface);
    fireEvent.pointerLeave(primaryAction);
    act(() => vi.advanceTimersByTime(20));
    expect(surface.style.getPropertyValue("--hero-rotate-x")).toBe("0deg");
    expect(surface.style.getPropertyValue("--hero-rotate-y")).toBe("0deg");
    expect(primaryAction.style.getPropertyValue("--magnetic-x")).toBe("0px");
    expect(primaryAction.style.getPropertyValue("--magnetic-y")).toBe("0px");
  });

  test.each([
    ["reduced motion", { reduced: true }],
    ["coarse pointer", { coarse: true }],
    ["1024px-or-narrow viewport", { narrow: true }]
  ] as const)("disables pointer response for %s", async (_scenario, preferences) => {
    mockInteractionPreferences(preferences);
    await renderHeroRoute();
    const hero = document.querySelector<HTMLElement>(".landing-hero")!;
    const surface = hero.querySelector<HTMLElement>(".landing-hero__scene")!;
    const primaryAction = within(hero).getByRole("link", {
      name: "Launch Security Console"
    });

    fireEvent.pointerMove(surface, { clientX: 1200, clientY: 900 });
    fireEvent.pointerMove(primaryAction, { clientX: 1200, clientY: 900 });
    act(() => vi.advanceTimersByTime(20));

    if ("reduced" in preferences && preferences.reduced) {
      expect(hero).toHaveAttribute("data-hero-phase", "resolved");
      expect(within(hero).getByText("RESOLVED")).toBeVisible();
    }
    expect(surface.style.getPropertyValue("--hero-rotate-x")).toBe("0deg");
    expect(surface.style.getPropertyValue("--hero-rotate-y")).toBe("0deg");
    expect(surface.style.getPropertyValue("--hero-plane-x")).toBe("0px");
    expect(surface.style.getPropertyValue("--hero-plane-y")).toBe("0px");
    expect(primaryAction.style.getPropertyValue("--magnetic-x")).toBe("0px");
    expect(primaryAction.style.getPropertyValue("--magnetic-y")).toBe("0px");
  });
});
