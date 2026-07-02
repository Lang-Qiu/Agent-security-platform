import { act } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Track1CampaignDetail, Track1CampaignSummary } from "../../../shared/types/campaign-supervision";
import {
  makeCampaignDetail,
  makeCampaignSummary
} from "../mocks/campaign-supervision";
import type { CampaignDataResult } from "../services/campaign-supervision-service";
import {
  useCampaignSupervisionPolling,
  type CampaignSupervisionData
} from "./useCampaignSupervisionPolling";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const CAMPAIGN_A = "campaign:t1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CAMPAIGN_B = "campaign:t1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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

function apiCampaign(
  detail: Track1CampaignDetail,
  summary?: Track1CampaignSummary
): CampaignDataResult<CampaignSupervisionData> {
  const resolvedSummary =
    summary ??
    makeCampaignSummary({
      status: detail.status,
      campaign_id: detail.campaign_id
    });
  return {
    data: {
      summary: resolvedSummary,
      detail
    },
    source: "api",
    error: null
  };
}

function errCampaign(): CampaignDataResult<CampaignSupervisionData> {
  return { data: null, source: "integration-error", error: "unavailable" };
}

function setDocumentVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value
  });
}

function detailWithId(
  campaignId: string,
  status: Track1CampaignDetail["status"] = "running"
): Track1CampaignDetail {
  const base = makeCampaignDetail({ status });
  // Override campaign_id at every level so the normalizer stays valid.
  base.campaign_id = campaignId;
  for (const agent of base.agents) {
    agent.campaign_id = campaignId;
    for (const c of agent.cases) {
      c.campaign_id = campaignId;
      for (const a of c.attempts) {
        a.campaign_id = campaignId;
      }
    }
  }
  return base;
}

describe("REQ-T1-DEMO-010 campaign supervision polling", () => {
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

  test("running campaign polls and completed campaign stops", async () => {
    const loadCampaign = vi
      .fn()
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })))
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "completed" })));

    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({
        campaignId: CAMPAIGN_ID,
        loadCampaign
      })
    );

    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(6000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
    expect(result.current.campaign.data?.summary.status).toBe("completed");
  });

  test("created and validating statuses poll", async () => {
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "validating" }))
    );
    renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
  });

  test("failed campaign stops polling", async () => {
    const loadCampaign = vi
      .fn()
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })))
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "failed" })));
    renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => vi.runOnlyPendingTimersAsync());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
  });

  test("stale campaign pauses until explicit retry", async () => {
    const loadCampaign = vi
      .fn()
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })))
      .mockRejectedValueOnce(new Error("BACKEND_SENTINEL"))
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })));
    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );

    await act(async () => vi.runOnlyPendingTimersAsync());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.campaign.freshness).toBe("stale");
    expect(result.current.campaign.data?.summary.status).toBe("running");
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(loadCampaign).toHaveBeenCalledTimes(2);
    await act(async () => result.current.retry());
    expect(loadCampaign).toHaveBeenCalledTimes(3);
    expect(result.current.campaign.freshness).toBe("fresh");
  });

  test("late campaign A response cannot overwrite campaign B", async () => {
    const deferredA = createDeferred<CampaignDataResult<CampaignSupervisionData>>();
    const detailB = detailWithId(CAMPAIGN_B, "running");
    const loadCampaign = vi.fn((id: string) =>
      id === CAMPAIGN_A
        ? deferredA.promise
        : Promise.resolve(apiCampaign(detailB))
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useCampaignSupervisionPolling({ campaignId: id, loadCampaign }),
      { initialProps: { id: CAMPAIGN_A } }
    );
    // Let campaign A's poll start (deferred, still pending).
    await act(async () => Promise.resolve());
    rerender({ id: CAMPAIGN_B });
    // Let campaign B's poll complete.
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(result.current.campaign.data?.summary.campaign_id).toBe(CAMPAIGN_B);
    // Now resolve A's deferred — it must NOT overwrite B.
    deferredA.resolve(apiCampaign(detailWithId(CAMPAIGN_A, "running")));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(result.current.campaign.data?.summary.campaign_id).toBe(CAMPAIGN_B);
  });

  test("campaign ID change aborts prior request and resets state", async () => {
    const deferredA = createDeferred<CampaignDataResult<CampaignSupervisionData>>();
    const loadCampaign = vi.fn((id: string) =>
      id === CAMPAIGN_A ? deferredA.promise : Promise.resolve(apiCampaign(detailWithId(CAMPAIGN_B)))
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useCampaignSupervisionPolling({ campaignId: id, loadCampaign }),
      { initialProps: { id: CAMPAIGN_A } }
    );
    await act(async () => Promise.resolve());
    const signalA = loadCampaign.mock.calls[0][1] as AbortSignal;
    expect(signalA.aborted).toBe(false);

    rerender({ id: CAMPAIGN_B });
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(signalA.aborted).toBe(true);
    expect(result.current.campaign.data?.summary.campaign_id).toBe(CAMPAIGN_B);
  });

  test("null campaignId does not load and resets state", async () => {
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "running" }))
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useCampaignSupervisionPolling({ campaignId: id, loadCampaign }),
      { initialProps: { id: CAMPAIGN_ID } }
    );
    await act(async () => Promise.resolve());
    expect(result.current.campaign.data).not.toBeNull();

    rerender({ id: null });
    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(1);
    expect(result.current.campaign.data).toBeNull();
    expect(result.current.campaign.loading).toBe(false);
  });

  test("hidden document pauses polling; visible resumes only if not stale", async () => {
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "running" }))
    );
    renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(1);

    await act(async () => {
      setDocumentVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(loadCampaign).toHaveBeenCalledTimes(1);

    await act(async () => {
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(2);
  });

  test("visibility resume does not bypass stale pause", async () => {
    const loadCampaign = vi
      .fn()
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })))
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => vi.runOnlyPendingTimersAsync());
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.campaign.freshness).toBe("stale");
    const staleCalls = loadCampaign.mock.calls.length;

    await act(async () => {
      setDocumentVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(loadCampaign.mock.calls.length).toBe(staleCalls);
    expect(result.current.campaign.freshness).toBe("stale");
  });

  test("integration-error result keeps last successful data and marks stale", async () => {
    const loadCampaign = vi
      .fn()
      .mockResolvedValueOnce(apiCampaign(makeCampaignDetail({ status: "running" })))
      .mockResolvedValueOnce(errCampaign());
    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(result.current.campaign.data).not.toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(result.current.campaign.freshness).toBe("stale");
    expect(result.current.campaign.data?.summary.status).toBe("running");
    expect(result.current.campaign.source).toBe("integration-error");
  });

  test("refreshNow triggers an immediate load without waiting for the timer", async () => {
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "running" }))
    );
    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => Promise.resolve());
    expect(loadCampaign).toHaveBeenCalledTimes(1);
    await act(async () => result.current.refreshNow());
    expect(loadCampaign).toHaveBeenCalledTimes(2);
  });

  test("unmount aborts pending request and schedules no further polls", async () => {
    const deferred = createDeferred<CampaignDataResult<CampaignSupervisionData>>();
    const loadCampaign = vi.fn().mockReturnValueOnce(deferred.promise);
    const { unmount } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => Promise.resolve());
    const signal = loadCampaign.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(loadCampaign).toHaveBeenCalledTimes(1);
  });

  test("one hook instance owns one visibility listener (cleanup on unmount)", async () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "running" }))
    );
    const { unmount } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    const added = addSpy.mock.calls.filter(
      ([event]) => event === "visibilitychange"
    ).length;
    expect(added).toBe(1);

    unmount();
    const removed = removeSpy.mock.calls.filter(
      ([event]) => event === "visibilitychange"
    ).length;
    expect(removed).toBe(1);
  });

  test("initial campaign with no prior data loads immediately with loading=true", async () => {
    const loadCampaign = vi.fn().mockResolvedValue(
      apiCampaign(makeCampaignDetail({ status: "running" }))
    );
    const { result } = renderHook(() =>
      useCampaignSupervisionPolling({ campaignId: CAMPAIGN_ID, loadCampaign })
    );
    expect(result.current.campaign.loading).toBe(true);
    expect(result.current.campaign.data).toBeNull();
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(result.current.campaign.loading).toBe(false);
    expect(result.current.campaign.data).not.toBeNull();
    expect(result.current.campaign.source).toBe("api");
  });
});
