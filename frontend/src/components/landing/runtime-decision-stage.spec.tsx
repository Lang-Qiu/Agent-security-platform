import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { runtimeCheckpointOrder } from "../../content/landing-content";
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
  readonly thresholds = [0.25];
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

function mockMotionPreference({
  reduced,
  staticTablet = false
}: {
  readonly reduced: boolean;
  readonly staticTablet?: boolean;
}) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reduced
      : query === "(max-width: 1024px)"
        ? staticTablet
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

function setObserved(target: Element, isIntersecting: boolean) {
  const record = observedTargets.get(target);
  if (!record) throw new Error("Expected Runtime target to be observed");
  act(() => {
    record.callback(
      [{ isIntersecting, target } as IntersectionObserverEntry],
      record.observer
    );
  });
}

function setRuntimeInView(isIntersecting: boolean) {
  const runtime = document.querySelector<HTMLElement>(".landing-runtime");
  if (!runtime) throw new Error("Expected Runtime chapter");
  setObserved(runtime, isIntersecting);
}

function seekCheckpoint(checkpoint: (typeof runtimeCheckpointOrder)[number]) {
  const sentinel = document.querySelector<HTMLElement>(
    `[data-runtime-sentinel="${checkpoint}"]`
  );
  if (!sentinel) throw new Error(`Expected ${checkpoint} sentinel`);
  setObserved(sentinel, true);
}

async function renderRuntimeRoute({
  reduced = false,
  staticTablet = false
}: {
  readonly reduced?: boolean;
  readonly staticTablet?: boolean;
} = {}) {
  vi.useRealTimers();
  mockMotionPreference({ reduced, staticTablet });
  const app = await renderAppAtRoute("/");
  await screen.findByRole("main");
  const runtime = document.querySelector<HTMLElement>(".landing-runtime");
  if (!runtime) throw new Error("Expected Runtime chapter");
  await waitFor(() => expect(observedTargets.has(runtime)).toBe(true));
  if (!reduced && !staticTablet) {
    await waitFor(() => {
      for (const checkpoint of runtimeCheckpointOrder) {
        const sentinel = document.querySelector(
          `[data-runtime-sentinel="${checkpoint}"]`
        );
        expect(sentinel && observedTargets.has(sentinel)).toBe(true);
      }
    });
  }
  vi.useFakeTimers();
  return app;
}

describe("Landing Runtime causal decision stage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    mockMotionPreference({ reduced: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observedTargets.clear();
  });

  test("maps each observer checkpoint to one stable, truthful security state", async () => {
    await renderRuntimeRoute();
    const runtime = document.querySelector<HTMLElement>(".landing-runtime")!;
    const scope = within(runtime);

    expect(runtimeCheckpointOrder).toEqual(["resolve", "detect", "decide", "contain"]);
    expect(scope.getByText("RUNTIME DECISION")).toBeVisible();
    expect(scope.getByText("ILLUSTRATIVE SEQUENCE")).toBeVisible();
    expect(scope.getByText("evaluation_mode: simulation")).toBeVisible();
    expect(scope.getByText("sandbox-security-balanced.v1")).toBeVisible();
    expect(scope.getAllByTestId("runtime-evidence-ref")).toHaveLength(3);
    expect(runtime.textContent).not.toMatch(
      /\bLIVE\b|current time|throughput|confidence|latency|engine data/i
    );

    setRuntimeInView(true);
    seekCheckpoint("resolve");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "resolve");
    expect(runtime).toHaveAttribute("data-runtime-phase", "input");
    expect(scope.getByText("identity_context")).toBeVisible();
    expect(scope.getByText("skill_provenance")).toBeVisible();
    expect(scope.getByText("tool_scope")).toBeVisible();
    expect(scope.queryByText("policy_action: deny")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_150));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    for (const detector of ["rule_detector", "local_model", "external_judge"]) {
      const row = scope.getByText(detector).closest("li");
      expect(row).toHaveAttribute("data-detector-status", "standby");
    }

    seekCheckpoint("detect");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(runtime).toHaveAttribute("data-runtime-phase", "detectors");
    for (const detector of ["rule_detector", "local_model", "external_judge"]) {
      const row = scope.getByText(detector).closest("li");
      expect(row).toHaveAttribute("data-detector-status", "evaluating");
    }
    act(() => vi.advanceTimersByTime(1_450));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    for (const detector of ["rule_detector", "local_model", "external_judge"]) {
      const row = scope.getByText(detector).closest("li");
      expect(row).toHaveAttribute("data-detector-status", "complete");
    }
    expect(scope.queryByText("policy_action: deny")).not.toBeInTheDocument();

    seekCheckpoint("decide");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "decide");
    expect(runtime).toHaveAttribute("data-runtime-phase", "evidence");
    expect(scope.queryByText("policy_action: deny")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(900));
    expect(runtime).toHaveAttribute("data-runtime-phase", "policy");
    expect(scope.queryByText("policy_action: deny")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_050));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(scope.getByText("evidence_refs: 03")).toBeVisible();
    expect(scope.getByText("policy_action: deny")).toBeVisible();

    seekCheckpoint("contain");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "decision");
    expect(scope.queryByText("containment: active")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(850));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(scope.getByText("containment: active")).toBeVisible();
  });

  test("plays forward observer-owned segments and reverse-seeks without causal playback", async () => {
    await renderRuntimeRoute();
    const runtime = document.querySelector<HTMLElement>(".landing-runtime")!;
    const scope = within(runtime);
    setRuntimeInView(true);

    seekCheckpoint("resolve");
    expect(runtime).toHaveAttribute("data-runtime-phase", "input");
    expect(scope.getByText("Replay sequence")).toBeVisible();
    act(() => vi.advanceTimersByTime(550));
    expect(runtime).toHaveAttribute("data-runtime-phase", "trust");
    act(() => vi.advanceTimersByTime(600));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");

    seekCheckpoint("detect");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(runtime).toHaveAttribute("data-runtime-phase", "detectors");
    act(() => vi.advanceTimersByTime(1_450));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");

    seekCheckpoint("decide");
    expect(runtime).toHaveAttribute("data-runtime-phase", "evidence");
    act(() => vi.advanceTimersByTime(900));
    expect(runtime).toHaveAttribute("data-runtime-phase", "policy");
    act(() => vi.advanceTimersByTime(1_050));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");

    seekCheckpoint("contain");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "decision");
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(850));
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);

    seekCheckpoint("contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);

    seekCheckpoint("detect");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);

    seekCheckpoint("detect");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("renders the complete static decision at the non-sticky tablet breakpoint", async () => {
    await renderRuntimeRoute({ staticTablet: true });
    const runtime = document.querySelector<HTMLElement>(".landing-runtime")!;
    const scope = within(runtime);

    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(scope.getByText("policy_action: deny")).toBeVisible();
    expect(scope.getByText("containment: active")).toBeVisible();
    expect(scope.getByRole("button", { name: "Replay security decision" })).toBeDisabled();
    const resolve = scope.getByRole("button", { name: "Resolve context" });
    expect(resolve).toBeDisabled();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(resolve);
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
  });

  test("gives direct stage selection priority and makes Replay the sole sequence owner", async () => {
    const app = await renderRuntimeRoute();
    const runtime = document.querySelector<HTMLElement>(".landing-runtime")!;
    const scope = within(runtime);
    setRuntimeInView(true);

    seekCheckpoint("resolve");
    expect(runtime).toHaveAttribute("data-runtime-phase", "input");
    fireEvent.click(scope.getByRole("button", { name: "Evaluate detectors" }));
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(runtime).toHaveAttribute("data-runtime-owner", "direct");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    act(() => vi.runOnlyPendingTimers());
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(runtime).toHaveAttribute("data-runtime-owner", "direct");
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(scope.getByRole("button", { name: "Replay security decision" }));
    expect(runtime).toHaveAttribute("data-runtime-owner", "replay");
    expect(runtime).toHaveAttribute("data-runtime-phase", "input");
    act(() => vi.advanceTimersByTime(550));
    expect(runtime).toHaveAttribute("data-runtime-phase", "trust");
    seekCheckpoint("contain");
    expect(runtime).toHaveAttribute("data-runtime-owner", "replay");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "resolve");
    expect(runtime).toHaveAttribute("data-runtime-phase", "trust");
    act(() => vi.advanceTimersByTime(600));
    expect(runtime).toHaveAttribute("data-runtime-phase", "detectors");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "detect");
    expect(scope.queryByText("policy_action: deny")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_450));
    expect(runtime).toHaveAttribute("data-runtime-phase", "evidence");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "decide");
    act(() => vi.advanceTimersByTime(900));
    expect(runtime).toHaveAttribute("data-runtime-phase", "policy");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "decide");
    act(() => vi.advanceTimersByTime(1_050));
    expect(runtime).toHaveAttribute("data-runtime-phase", "decision");
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");

    fireEvent.click(scope.getByRole("button", { name: "Resolve policy" }));
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "decide");
    expect(runtime).toHaveAttribute("data-runtime-owner", "direct");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    act(() => vi.runOnlyPendingTimers());
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "decide");
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(scope.getByRole("button", { name: "Replay security decision" }));
    act(() => vi.advanceTimersByTime(5_399));
    expect(runtime).not.toHaveAttribute("data-runtime-phase", "settled");
    act(() => vi.advanceTimersByTime(1));
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(scope.getByRole("button", { name: "Replay security decision" }));
    act(() => vi.advanceTimersByTime(1_200));
    setRuntimeInView(false);
    expect(runtime).toHaveAttribute("data-runtime-owner", "observer");
    expect(vi.getTimerCount()).toBe(0);
    app.unmount();
    expect(observedTargets.size).toBe(0);
  });

  test("settles reduced motion at contain and keeps Replay static", async () => {
    const app = await renderRuntimeRoute({ reduced: true });
    const runtime = document.querySelector<HTMLElement>(".landing-runtime")!;
    const scope = within(runtime);

    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(scope.getByText("policy_action: deny")).toBeVisible();
    expect(scope.getByText("containment: active")).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);

    const replay = scope.getByRole("button", { name: "Replay security decision" });
    expect(replay).toBeDisabled();
    fireEvent.click(replay);
    act(() => vi.advanceTimersByTime(10_000));
    expect(runtime).toHaveAttribute("data-runtime-checkpoint", "contain");
    expect(runtime).toHaveAttribute("data-runtime-phase", "settled");
    expect(vi.getTimerCount()).toBe(0);
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
