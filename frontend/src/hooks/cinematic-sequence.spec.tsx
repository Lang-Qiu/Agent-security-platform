import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  heroSequencePhases,
  runtimeTimelineMs,
  useCinematicSequence,
  useRuntimeCinematicSequence,
  type CinematicSequenceOptions
} from "./useCinematicSequence";
import { useRuntimeStage } from "./useRuntimeStage";

function mockReducedMotion(reduced: boolean) {
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

describe("useCinematicSequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("plays finite phases once, pauses remaining delay, and resumes after re-entry", () => {
    const { result, rerender, unmount } = renderHook(
      (options: CinematicSequenceOptions) => useCinematicSequence(options),
      { initialProps: { isInView: true } }
    );

    expect(heroSequencePhases).toEqual([
      "copy",
      "frame",
      "topology",
      "trace",
      "detectors",
      "resolved"
    ]);
    expect(result.current.phase).toBe("copy");

    act(() => vi.advanceTimersByTime(300));
    expect(result.current.phase).toBe("copy");
    rerender({ isInView: false });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase).toBe("copy");

    rerender({ isInView: true });
    act(() => vi.advanceTimersByTime(119));
    expect(result.current.phase).toBe("copy");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.phase).toBe("frame");

    act(() => vi.advanceTimersByTime(340 + 260 + 220 + 560));
    expect(result.current.phase).toBe("resolved");
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.phase).toBe("resolved");
    expect(vi.getTimerCount()).toBe(0);

    rerender({ isInView: false });
    rerender({ isInView: true });
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.phase).toBe("resolved");

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("settles immediately and never schedules when reduced motion is requested", () => {
    const { result, rerender } = renderHook(
      (options: CinematicSequenceOptions) => useCinematicSequence(options),
      { initialProps: { isInView: false, reducedMotion: true } }
    );

    expect(result.current.phase).toBe("resolved");
    expect(vi.getTimerCount()).toBe(0);
    rerender({ isInView: true, reducedMotion: true });
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.phase).toBe("resolved");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("fresh hook mounts replay from copy without storage state", () => {
    const first = renderHook(() =>
      useCinematicSequence({ isInView: true })
    );
    act(() => vi.advanceTimersByTime(420));
    expect(first.result.current.phase).toBe("frame");
    first.unmount();

    const second = renderHook(() =>
      useCinematicSequence({ isInView: true })
    );
    expect(second.result.current.phase).toBe("copy");
    second.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("plays the Runtime causal timeline once and cancels it out of view", () => {
    const runtime = renderHook(
      (options: CinematicSequenceOptions) => useRuntimeCinematicSequence(options),
      { initialProps: { isInView: true } }
    );

    expect(runtimeTimelineMs).toEqual({
      input: 550,
      trust: 1150,
      detectors: 2600,
      evidence: 3500,
      policy: 4550,
      settle: 5400
    });
    expect(runtime.result.current.phase).toBe("settled");

    act(() => runtime.result.current.replay());
    expect(runtime.result.current.phase).toBe("input");
    act(() => vi.advanceTimersByTime(550));
    expect(runtime.result.current.phase).toBe("trust");
    act(() => vi.advanceTimersByTime(600));
    expect(runtime.result.current.phase).toBe("detectors");
    act(() => vi.advanceTimersByTime(1450));
    expect(runtime.result.current.phase).toBe("evidence");
    act(() => vi.advanceTimersByTime(900));
    expect(runtime.result.current.phase).toBe("policy");
    act(() => vi.advanceTimersByTime(1050));
    expect(runtime.result.current.phase).toBe("decision");
    act(() => vi.advanceTimersByTime(850));
    expect(runtime.result.current.phase).toBe("settled");
    expect(runtime.result.current.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => runtime.result.current.replay());
    act(() => vi.advanceTimersByTime(1200));
    runtime.rerender({ isInView: false });
    expect(runtime.result.current.phase).toBe("settled");
    expect(runtime.result.current.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    runtime.rerender({ isInView: true });
    act(() => runtime.result.current.playSegment("resolve"));
    expect(vi.getTimerCount()).toBe(1);
    runtime.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("plays only the selected Runtime segment and cancels obsolete segment timers", () => {
    const runtime = renderHook(
      (options: CinematicSequenceOptions) => useRuntimeCinematicSequence(options),
      { initialProps: { isInView: true } }
    );

    act(() => runtime.result.current.playSegment("resolve"));
    expect(runtime.result.current.phase).toBe("input");
    act(() => vi.advanceTimersByTime(400));

    act(() => runtime.result.current.playSegment("detect"));
    expect(runtime.result.current.phase).toBe("detectors");
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1_450));
    expect(runtime.result.current.phase).toBe("settled");
    expect(vi.getTimerCount()).toBe(0);

    act(() => runtime.result.current.playSegment("decide"));
    expect(runtime.result.current.phase).toBe("evidence");
    act(() => vi.advanceTimersByTime(900));
    expect(runtime.result.current.phase).toBe("policy");
    act(() => vi.advanceTimersByTime(1_050));
    expect(runtime.result.current.phase).toBe("settled");

    act(() => runtime.result.current.playSegment("contain"));
    expect(runtime.result.current.phase).toBe("decision");
    runtime.rerender({ isInView: false });
    expect(runtime.result.current.phase).toBe("settled");
    expect(runtime.result.current.isPlaying).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    runtime.unmount();
  });

  test("accepts a visible sentinel segment before the section visibility render", () => {
    const runtime = renderHook(
      (options: CinematicSequenceOptions) => useRuntimeCinematicSequence(options),
      { initialProps: { isInView: false } }
    );

    act(() => runtime.result.current.playSegment("resolve"));
    runtime.rerender({ isInView: true });
    expect(runtime.result.current.phase).toBe("input");
    expect(runtime.result.current.isPlaying).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    runtime.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("keeps direct, replay, and reduced Runtime stage authority deterministic", () => {
    const stage = renderHook(() =>
      useRuntimeStage({ isInView: true, reducedMotion: false })
    );

    expect(stage.result.current.checkpoint).toBe("resolve");
    expect(stage.result.current.owner).toBe("observer");
    act(() => stage.result.current.selectCheckpoint("detect"));
    expect(stage.result.current.checkpoint).toBe("detect");
    expect(stage.result.current.owner).toBe("direct");
    act(() => expect(stage.result.current.startReplay()).toBe(true));
    expect(stage.result.current.checkpoint).toBe("resolve");
    expect(stage.result.current.owner).toBe("replay");
    act(() => stage.result.current.setReplayCheckpoint("decide"));
    expect(stage.result.current.checkpoint).toBe("decide");
    act(() => stage.result.current.finishReplay());
    expect(stage.result.current.checkpoint).toBe("contain");
    expect(stage.result.current.owner).toBe("observer");
    stage.unmount();

    const reduced = renderHook(() =>
      useRuntimeStage({ isInView: true, reducedMotion: true })
    );
    expect(reduced.result.current.checkpoint).toBe("contain");
    act(() => expect(reduced.result.current.startReplay()).toBe(false));
    act(() => reduced.result.current.selectCheckpoint("resolve"));
    expect(reduced.result.current.checkpoint).toBe("contain");
    reduced.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
