import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useLandingInView } from "./useLandingInView";
import { useMagneticOffset } from "./useMagneticOffset";
import {
  analyzeFocusOrder,
  discoverScanPhases,
  useNarrativeSequence
} from "./useNarrativeSequence";
import { usePointerSpotlight } from "./usePointerSpotlight";

let observerCallback: IntersectionObserverCallback | undefined;
let observerInstance: ControlledIntersectionObserver | undefined;

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly takeRecords = vi.fn(() => []);
  readonly unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
    observerInstance = this;
  }
}

function mockMedia({
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

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  };
}

function InViewProbe() {
  const state = useLandingInView<HTMLDivElement>();
  return <div ref={state.ref} data-testid="in-view" data-in-view={state.isInView} />;
}

function PointerProbe({ oversized = false }: { readonly oversized?: boolean }) {
  const spotlight = usePointerSpotlight<HTMLDivElement>(
    oversized
      ? { maxPlaneOffsetPx: 80, maxRotationDeg: 12, spotlightSizePx: 900 }
      : undefined
  );
  const magnetic = useMagneticOffset<HTMLButtonElement>(
    oversized ? { maxOffsetPx: 40 } : undefined
  );
  return (
    <>
      <div
        ref={spotlight.ref}
        data-testid="spotlight"
        onPointerMove={spotlight.onPointerMove}
        onPointerLeave={spotlight.onPointerLeave}
      />
      <button
        ref={magnetic.ref}
        data-testid="magnetic"
        type="button"
        onPointerMove={magnetic.onPointerMove}
        onPointerLeave={magnetic.onPointerLeave}
      />
    </>
  );
}

function NarrativeProbe({
  isInView,
  reduced = false,
  sequence = "discover"
}: {
  readonly isInView: boolean;
  readonly reduced?: boolean;
  readonly sequence?: "discover" | "analyze";
}) {
  const discover = useNarrativeSequence({
    steps: discoverScanPhases,
    stepDurationMs: [0, 900],
    isInView: sequence === "discover" ? isInView : false,
    reducedMotion: sequence === "discover" ? reduced : true
  });
  const analyze = useNarrativeSequence({
    steps: analyzeFocusOrder,
    stepDurationMs: 75,
    isInView: sequence === "analyze" ? isInView : false,
    reducedMotion: sequence === "analyze" ? reduced : true
  });
  const active = sequence === "discover" ? discover : analyze;

  return (
    <div
      data-testid="narrative"
      data-step={active.step}
      data-status={active.status}
    />
  );
}

describe("landing motion hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    mockMedia();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observerCallback = undefined;
    observerInstance = undefined;
  });

  test("observes one node, reports enter and exit, and disconnects on unmount", () => {
    const view = render(<InViewProbe />);
    const node = screen.getByTestId("in-view");

    expect(observerInstance?.observe).toHaveBeenCalledWith(node);
    expect(node).toHaveAttribute("data-in-view", "false");

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observerInstance as unknown as IntersectionObserver
      );
    });
    expect(node).toHaveAttribute("data-in-view", "true");

    act(() => {
      observerCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observerInstance as unknown as IntersectionObserver
      );
    });
    expect(node).toHaveAttribute("data-in-view", "false");

    view.unmount();
    expect(observerInstance?.disconnect).toHaveBeenCalledTimes(1);
  });

  test("batches fine-pointer writes locally and cancels its pending frame", () => {
    const windowListener = vi.spyOn(window, "addEventListener");
    const view = render(<PointerProbe />);
    const spotlight = screen.getByTestId("spotlight");
    const magnetic = screen.getByTestId("magnetic");

    vi.spyOn(spotlight, "getBoundingClientRect").mockReturnValue(rect(100, 100, 800, 600));
    vi.spyOn(magnetic, "getBoundingClientRect").mockReturnValue(rect(100, 100, 240, 48));

    fireEvent.pointerMove(spotlight, { clientX: 900, clientY: 700 });
    fireEvent.pointerMove(magnetic, { clientX: 340, clientY: 148 });
    act(() => vi.advanceTimersByTime(20));

    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-rotate-x"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-rotate-y"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(magnetic.style.getPropertyValue("--magnetic-x"))))
      .toBeLessThanOrEqual(4);
    expect(Math.abs(Number.parseFloat(magnetic.style.getPropertyValue("--magnetic-y"))))
      .toBeLessThanOrEqual(4);
    expect(windowListener.mock.calls.some(([name]) => name === "pointermove")).toBe(false);

    fireEvent.pointerMove(spotlight, { clientX: 900, clientY: 700 });
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("hard-caps oversized pointer configuration at the Hero contract", () => {
    render(<PointerProbe oversized />);
    const spotlight = screen.getByTestId("spotlight");
    const magnetic = screen.getByTestId("magnetic");
    vi.spyOn(spotlight, "getBoundingClientRect").mockReturnValue(rect(0, 0, 800, 600));
    vi.spyOn(magnetic, "getBoundingClientRect").mockReturnValue(rect(0, 0, 240, 48));

    fireEvent.pointerMove(spotlight, { clientX: 800, clientY: 600 });
    fireEvent.pointerMove(magnetic, { clientX: 240, clientY: 48 });
    act(() => vi.advanceTimersByTime(20));

    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-rotate-x"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-rotate-y"))))
      .toBeLessThanOrEqual(1.25);
    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-plane-x"))))
      .toBeLessThanOrEqual(8);
    expect(Math.abs(Number.parseFloat(spotlight.style.getPropertyValue("--hero-plane-y"))))
      .toBeLessThanOrEqual(8);
    expect(spotlight.style.getPropertyValue("--hero-spotlight-size")).toBe("320px");
    expect(Math.abs(Number.parseFloat(magnetic.style.getPropertyValue("--magnetic-x"))))
      .toBeLessThanOrEqual(4);
    expect(Math.abs(Number.parseFloat(magnetic.style.getPropertyValue("--magnetic-y"))))
      .toBeLessThanOrEqual(4);
  });

  test.each([
    ["reduced motion", { reduced: true }],
    ["coarse pointer", { coarse: true }],
    ["narrow viewport", { narrow: true }]
  ] as const)("leaves local variables settled for %s", (_name, preferences) => {
    mockMedia(preferences);
    render(<PointerProbe />);
    const spotlight = screen.getByTestId("spotlight");
    const magnetic = screen.getByTestId("magnetic");

    fireEvent.pointerMove(spotlight, { clientX: 999, clientY: 999 });
    fireEvent.pointerMove(magnetic, { clientX: 999, clientY: 999 });
    act(() => vi.advanceTimersByTime(20));

    expect(spotlight.style.getPropertyValue("--hero-rotate-x")).toBe("0deg");
    expect(spotlight.style.getPropertyValue("--hero-rotate-y")).toBe("0deg");
    expect(magnetic.style.getPropertyValue("--magnetic-x")).toBe("0px");
    expect(magnetic.style.getPropertyValue("--magnetic-y")).toBe("0px");
  });

  test("preserves the Discover timer across pause and never replays after settlement", () => {
    const view = render(<NarrativeProbe isInView={false} />);
    const probe = screen.getByTestId("narrative");

    expect(probe).toHaveAttribute("data-step", "idle");
    expect(probe).toHaveAttribute("data-status", "idle");
    view.rerender(<NarrativeProbe isInView />);
    act(() => vi.advanceTimersByTime(0));
    expect(probe).toHaveAttribute("data-step", "scanning");

    act(() => vi.advanceTimersByTime(350));
    view.rerender(<NarrativeProbe isInView={false} />);
    expect(probe).toHaveAttribute("data-status", "paused");
    act(() => vi.advanceTimersByTime(2_000));
    expect(probe).toHaveAttribute("data-step", "scanning");

    view.rerender(<NarrativeProbe isInView />);
    act(() => vi.advanceTimersByTime(550));
    expect(probe).toHaveAttribute("data-step", "revealed");
    expect(probe).toHaveAttribute("data-status", "settled");
    view.rerender(<NarrativeProbe isInView={false} />);
    view.rerender(<NarrativeProbe isInView />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(probe).toHaveAttribute("data-step", "revealed");

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("initializes the narrative timer after the StrictMode effect replay", () => {
    const view = render(
      <StrictMode>
        <NarrativeProbe isInView />
      </StrictMode>
    );
    const probe = screen.getByTestId("narrative");

    act(() => vi.advanceTimersByTime(0));
    expect(probe).toHaveAttribute("data-step", "scanning");
    act(() => vi.advanceTimersByTime(900));
    expect(probe).toHaveAttribute("data-step", "revealed");
    expect(probe).toHaveAttribute("data-status", "settled");

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("pauses the Analyze focus progression and resumes from the same step", () => {
    const view = render(<NarrativeProbe isInView sequence="analyze" />);
    const probe = screen.getByTestId("narrative");

    expect(probe).toHaveAttribute("data-step", "manifest");
    act(() => vi.advanceTimersByTime(75));
    expect(probe).toHaveAttribute("data-step", "dependency");
    view.rerender(<NarrativeProbe isInView={false} sequence="analyze" />);
    act(() => vi.advanceTimersByTime(500));
    expect(probe).toHaveAttribute("data-step", "dependency");
    expect(probe).toHaveAttribute("data-status", "paused");

    view.rerender(<NarrativeProbe isInView sequence="analyze" />);
    act(() => vi.advanceTimersByTime(225));
    expect(probe).toHaveAttribute("data-step", "reason");
    expect(probe).toHaveAttribute("data-status", "settled");
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each([
    ["Discover", "discover", "revealed"],
    ["Analyze", "analyze", "reason"]
  ] as const)("settles %s immediately for reduced motion", (_name, sequence, finalStep) => {
    const view = render(
      <NarrativeProbe isInView={false} reduced sequence={sequence} />
    );
    const probe = screen.getByTestId("narrative");

    expect(probe).toHaveAttribute("data-step", finalStep);
    expect(probe).toHaveAttribute("data-status", "settled");
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
