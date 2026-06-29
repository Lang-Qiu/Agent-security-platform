import { act } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SandboxSupervisionOverview, SandboxSupervisionSessionDetail } from "../../../shared/types/supervision";
import type { SupervisionDataResult } from "../services/supervision-service";
import { makeSupervisionDetail, makeSupervisionOverview } from "../mocks/supervision";
import { useSupervisionPolling } from "./useSupervisionPolling";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeOverviewResult(): SupervisionDataResult<SandboxSupervisionOverview> {
  return {
    data: makeSupervisionOverview(),
    source: "api"
  };
}

function makeDetailResult(
  sessionId: string
): SupervisionDataResult<SandboxSupervisionSessionDetail> {
  const base = makeSupervisionDetail();
  return {
    data: {
      ...base,
      summary: { ...base.summary, session_id: sessionId }
    },
    source: "api"
  };
}

function setDocumentVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value
  });
}

describe("REQ-T1-SUPERVISION-UI-009 polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("polls fresh overview every 3000ms without overlap", async () => {
    const deferred = createDeferred<
      SupervisionDataResult<SandboxSupervisionOverview>
    >();
    const loadOverview = vi
      .fn()
      .mockResolvedValueOnce(makeOverviewResult())
      .mockReturnValueOnce(deferred.promise);

    renderHook(() => useSupervisionPolling({ loadOverview }));
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    await act(async () => vi.advanceTimersByTimeAsync(3000));

    expect(loadOverview).toHaveBeenCalledTimes(2);
    await act(async () => {
      deferred.resolve(makeOverviewResult());
    });
  });

  test("pauses while hidden and refreshes immediately when visible", async () => {
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    renderHook(() => useSupervisionPolling({ loadOverview }));
    await act(async () => Promise.resolve());

    await act(async () => {
      setDocumentVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadOverview).toHaveBeenCalledTimes(1);

    await act(async () => {
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => Promise.resolve());
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });

  test("keeps the last snapshot stale and waits for manual retry", async () => {
    const loadOverview = vi
      .fn()
      .mockResolvedValueOnce(makeOverviewResult())
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(makeOverviewResult());
    const { result } = renderHook(() =>
      useSupervisionPolling({ loadOverview })
    );

    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.overview.freshness).toBe("stale");

    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadOverview).toHaveBeenCalledTimes(2);

    await act(async () => result.current.retryOverview());
    expect(result.current.overview.freshness).toBe("fresh");
  });

  test("last-success timestamp changes only on valid success", async () => {
    const loadOverview = vi
      .fn()
      .mockResolvedValueOnce(makeOverviewResult())
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(makeOverviewResult());
    const { result } = renderHook(() =>
      useSupervisionPolling({ loadOverview })
    );

    await act(async () => Promise.resolve());
    const firstSuccessAt = result.current.overview.lastSuccessAt;
    expect(firstSuccessAt).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.overview.lastSuccessAt).toBe(firstSuccessAt);
    expect(result.current.overview.freshness).toBe("stale");

    await act(async () => result.current.retryOverview());
    expect(result.current.overview.lastSuccessAt).not.toBe(firstSuccessAt);
  });

  test("detail polls only for task_status === running", async () => {
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    const loadDetail = vi.fn().mockResolvedValue(makeDetailResult("session:A"));
    renderHook(() =>
      useSupervisionPolling({
        loadOverview,
        loadDetail,
        selectedSessionId: "session:A",
        selectedTaskStatus: "running"
      })
    );

    await act(async () => Promise.resolve());
    expect(loadDetail).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadDetail).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadDetail).toHaveBeenCalledTimes(3);
  });

  test("terminal detail never schedules", async () => {
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    const loadDetail = vi.fn().mockResolvedValue(makeDetailResult("session:A"));
    renderHook(() =>
      useSupervisionPolling({
        loadOverview,
        loadDetail,
        selectedSessionId: "session:A",
        selectedTaskStatus: "blocked"
      })
    );

    await act(async () => Promise.resolve());
    expect(loadDetail).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadDetail).toHaveBeenCalledTimes(1);
  });

  test("stale detail pauses independently from fresh overview", async () => {
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    const loadDetail = vi
      .fn()
      .mockResolvedValueOnce(makeDetailResult("session:A"))
      .mockRejectedValueOnce(new Error("detail offline"))
      .mockResolvedValueOnce(makeDetailResult("session:A"));
    const { result } = renderHook(() =>
      useSupervisionPolling({
        loadOverview,
        loadDetail,
        selectedSessionId: "session:A",
        selectedTaskStatus: "running"
      })
    );

    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.detail.freshness).toBe("stale");
    expect(result.current.overview.freshness).toBe("fresh");

    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadOverview).toHaveBeenCalledTimes(4);
    expect(loadDetail).toHaveBeenCalledTimes(2);

    await act(async () => result.current.retryDetail());
    expect(result.current.detail.freshness).toBe("fresh");
  });

  test("selected-session change aborts prior request", async () => {
    const deferredA = createDeferred<
      SupervisionDataResult<SandboxSupervisionSessionDetail>
    >();
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    const loadDetail = vi
      .fn()
      .mockReturnValueOnce(deferredA.promise)
      .mockResolvedValueOnce(makeDetailResult("session:B"));
    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) =>
        useSupervisionPolling({
          loadOverview,
          loadDetail,
          selectedSessionId: sessionId,
          selectedTaskStatus: "running"
        }),
      { initialProps: { sessionId: "session:A" } }
    );

    await act(async () => Promise.resolve());
    expect(loadDetail).toHaveBeenCalledTimes(1);
    const signalA = loadDetail.mock.calls[0][1] as AbortSignal;
    expect(signalA.aborted).toBe(false);

    rerender({ sessionId: "session:B" });
    await act(async () => Promise.resolve());

    expect(signalA.aborted).toBe(true);
    expect(loadDetail).toHaveBeenCalledTimes(2);
    expect(loadDetail.mock.calls[1][0]).toBe("session:B");
  });

  test("late prior response cannot replace current detail", async () => {
    const deferredA = createDeferred<
      SupervisionDataResult<SandboxSupervisionSessionDetail>
    >();
    const detailA = makeDetailResult("session:A");
    const detailB = makeDetailResult("session:B");
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    const loadDetail = vi
      .fn()
      .mockReturnValueOnce(deferredA.promise)
      .mockResolvedValueOnce(detailB);
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) =>
        useSupervisionPolling({
          loadOverview,
          loadDetail,
          selectedSessionId: sessionId,
          selectedTaskStatus: "running"
        }),
      { initialProps: { sessionId: "session:A" } }
    );

    await act(async () => Promise.resolve());
    rerender({ sessionId: "session:B" });
    await act(async () => Promise.resolve());
    expect(result.current.detail.data?.summary.session_id).toBe("session:B");

    deferredA.resolve(detailA);
    await act(async () => Promise.resolve());
    expect(result.current.detail.data?.summary.session_id).toBe("session:B");
  });

  test("manual refresh aborts and replaces the current request", async () => {
    const deferredInitial = createDeferred<
      SupervisionDataResult<SandboxSupervisionOverview>
    >();
    const loadOverview = vi
      .fn()
      .mockReturnValueOnce(deferredInitial.promise)
      .mockResolvedValueOnce(makeOverviewResult());
    const { result } = renderHook(() =>
      useSupervisionPolling({ loadOverview })
    );

    await act(async () => Promise.resolve());
    const initialSignal = loadOverview.mock.calls[0][0] as AbortSignal;
    expect(initialSignal.aborted).toBe(false);

    await act(async () => result.current.refreshNow());
    expect(initialSignal.aborted).toBe(true);
    expect(loadOverview).toHaveBeenCalledTimes(2);
    expect(result.current.overview.data).not.toBeNull();
  });

  test("unmount clears timers and aborts requests", async () => {
    const deferred = createDeferred<
      SupervisionDataResult<SandboxSupervisionOverview>
    >();
    const loadOverview = vi.fn().mockReturnValueOnce(deferred.promise);
    const { unmount } = renderHook(() =>
      useSupervisionPolling({ loadOverview })
    );

    await act(async () => Promise.resolve());
    const signal = loadOverview.mock.calls[0][0] as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadOverview).toHaveBeenCalledTimes(1);
  });

  test("repeated visibility events do not duplicate timers", async () => {
    const loadOverview = vi.fn().mockResolvedValue(makeOverviewResult());
    renderHook(() => useSupervisionPolling({ loadOverview }));
    await act(async () => Promise.resolve());

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });
});
