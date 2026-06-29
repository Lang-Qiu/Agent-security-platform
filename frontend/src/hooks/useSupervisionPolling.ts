import { useCallback, useEffect, useRef, useState } from "react";

import type { TaskStatus } from "../../../shared/types/task";
import type {
  SandboxSupervisionOverview,
  SandboxSupervisionSessionDetail
} from "../../../shared/types/supervision";
import type { SupervisionDataResult } from "../services/supervision-service";

export type SupervisionFreshness = "fresh" | "stale";

export interface PollingResourceState<T> {
  data: T | null;
  loading: boolean;
  freshness: SupervisionFreshness;
  lastSuccessAt: string | null;
  error: "unavailable" | "invalid" | null;
}

const DEFAULT_INTERVAL_MS = 3000;

function createEmptyState<T>(): PollingResourceState<T> {
  return {
    data: null,
    loading: true,
    freshness: "fresh",
    lastSuccessAt: null,
    error: null
  };
}

function createIdleState<T>(): PollingResourceState<T> {
  return {
    data: null,
    loading: false,
    freshness: "fresh",
    lastSuccessAt: null,
    error: null
  };
}

export function useSupervisionPolling(input: {
  loadOverview(
    signal: AbortSignal
  ): Promise<SupervisionDataResult<SandboxSupervisionOverview>>;
  loadDetail?: (
    sessionId: string,
    signal: AbortSignal
  ) => Promise<
    SupervisionDataResult<SandboxSupervisionSessionDetail> | null
  >;
  selectedSessionId?: string | null;
  selectedTaskStatus?: TaskStatus | null;
  intervalMs?: 3000;
}): {
  overview: PollingResourceState<SandboxSupervisionOverview>;
  detail: PollingResourceState<SandboxSupervisionSessionDetail>;
  retryOverview(): Promise<void>;
  retryDetail(): Promise<void>;
  refreshNow(): Promise<void>;
} {
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  const selectedSessionId = input.selectedSessionId ?? null;
  const selectedTaskStatus = input.selectedTaskStatus ?? null;

  const [overview, setOverview] = useState<
    PollingResourceState<SandboxSupervisionOverview>
  >(createEmptyState);
  const [detail, setDetail] = useState<
    PollingResourceState<SandboxSupervisionSessionDetail>
  >(createIdleState);

  const overviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const overviewGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);
  const overviewErrorPausedRef = useRef(false);
  const detailErrorPausedRef = useRef(false);
  const isHiddenRef = useRef(false);
  const isUnmountedRef = useRef(false);

  const loadOverviewRef = useRef(input.loadOverview);
  const loadDetailRef = useRef(input.loadDetail);
  const sessionIdRef = useRef(selectedSessionId);
  const taskStatusRef = useRef(selectedTaskStatus);

  loadOverviewRef.current = input.loadOverview;
  loadDetailRef.current = input.loadDetail;
  sessionIdRef.current = selectedSessionId;
  taskStatusRef.current = selectedTaskStatus;

  const scheduleOverviewPollRef = useRef<() => void>(() => {});
  const scheduleDetailPollRef = useRef<() => void>(() => {});

  const pollOverview = useCallback(async () => {
    if (isUnmountedRef.current) return;

    overviewAbortRef.current?.abort();
    const controller = new AbortController();
    overviewAbortRef.current = controller;
    const gen = ++overviewGenerationRef.current;

    setOverview((prev) => ({ ...prev, loading: true }));

    try {
      const result = await loadOverviewRef.current(controller.signal);
      if (gen !== overviewGenerationRef.current) return;
      if (isUnmountedRef.current) return;

      setOverview({
        data: result.data,
        loading: false,
        freshness: "fresh",
        lastSuccessAt: new Date().toISOString(),
        error: null
      });
      overviewErrorPausedRef.current = false;
      scheduleOverviewPollRef.current();
    } catch {
      if (gen !== overviewGenerationRef.current) return;
      if (isUnmountedRef.current) return;

      setOverview((prev) => ({
        ...prev,
        loading: false,
        freshness: "stale",
        error: "unavailable"
      }));
      overviewErrorPausedRef.current = true;
    }
  }, []);

  const pollDetail = useCallback(async () => {
    if (isUnmountedRef.current) return;
    const sessionId = sessionIdRef.current;
    if (!sessionId || !loadDetailRef.current) return;

    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const gen = ++detailGenerationRef.current;

    setDetail((prev) => ({ ...prev, loading: true }));

    try {
      const result = await loadDetailRef.current(sessionId, controller.signal);
      if (gen !== detailGenerationRef.current) return;
      if (isUnmountedRef.current) return;

      if (result === null) {
        setDetail((prev) => ({
          ...prev,
          loading: false,
          freshness: "stale",
          error: "unavailable"
        }));
        detailErrorPausedRef.current = true;
        return;
      }

      setDetail({
        data: result.data,
        loading: false,
        freshness: "fresh",
        lastSuccessAt: new Date().toISOString(),
        error: null
      });
      detailErrorPausedRef.current = false;
      scheduleDetailPollRef.current();
    } catch {
      if (gen !== detailGenerationRef.current) return;
      if (isUnmountedRef.current) return;

      setDetail((prev) => ({
        ...prev,
        loading: false,
        freshness: "stale",
        error: "unavailable"
      }));
      detailErrorPausedRef.current = true;
    }
  }, []);

  const scheduleOverviewPoll = useCallback(() => {
    if (
      isUnmountedRef.current ||
      isHiddenRef.current ||
      overviewErrorPausedRef.current
    ) {
      return;
    }
    if (overviewTimerRef.current) {
      clearTimeout(overviewTimerRef.current);
    }
    overviewTimerRef.current = setTimeout(async () => {
      await pollOverview();
    }, intervalMs);
  }, [intervalMs, pollOverview]);

  const scheduleDetailPoll = useCallback(() => {
    if (
      isUnmountedRef.current ||
      isHiddenRef.current ||
      detailErrorPausedRef.current ||
      taskStatusRef.current !== "running"
    ) {
      return;
    }
    if (detailTimerRef.current) {
      clearTimeout(detailTimerRef.current);
    }
    detailTimerRef.current = setTimeout(async () => {
      await pollDetail();
    }, intervalMs);
  }, [intervalMs, pollDetail]);

  scheduleOverviewPollRef.current = scheduleOverviewPoll;
  scheduleDetailPollRef.current = scheduleDetailPoll;

  const retryOverview = useCallback(async () => {
    overviewGenerationRef.current++;
    overviewAbortRef.current?.abort();
    overviewErrorPausedRef.current = false;
    await pollOverview();
  }, [pollOverview]);

  const retryDetail = useCallback(async () => {
    detailGenerationRef.current++;
    detailAbortRef.current?.abort();
    detailErrorPausedRef.current = false;
    await pollDetail();
  }, [pollDetail]);

  const refreshNow = useCallback(async () => {
    overviewGenerationRef.current++;
    detailGenerationRef.current++;
    overviewAbortRef.current?.abort();
    detailAbortRef.current?.abort();

    if (overviewTimerRef.current) {
      clearTimeout(overviewTimerRef.current);
      overviewTimerRef.current = null;
    }
    if (detailTimerRef.current) {
      clearTimeout(detailTimerRef.current);
      detailTimerRef.current = null;
    }

    overviewErrorPausedRef.current = false;
    detailErrorPausedRef.current = false;

    await pollOverview();
    if (sessionIdRef.current && loadDetailRef.current) {
      await pollDetail();
    }
  }, [pollOverview, pollDetail]);

  useEffect(() => {
    isUnmountedRef.current = false;
    pollOverview();

    const handleVisibilityChange = () => {
      const wasHidden = isHiddenRef.current;
      const nowHidden = document.visibilityState === "hidden";
      isHiddenRef.current = nowHidden;

      if (wasHidden === nowHidden) return;

      if (nowHidden) {
        if (overviewTimerRef.current) {
          clearTimeout(overviewTimerRef.current);
          overviewTimerRef.current = null;
        }
        if (detailTimerRef.current) {
          clearTimeout(detailTimerRef.current);
          detailTimerRef.current = null;
        }
      } else {
        pollOverview();
        if (sessionIdRef.current && taskStatusRef.current === "running") {
          pollDetail();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isUnmountedRef.current = true;
      if (overviewTimerRef.current) {
        clearTimeout(overviewTimerRef.current);
        overviewTimerRef.current = null;
      }
      if (detailTimerRef.current) {
        clearTimeout(detailTimerRef.current);
        detailTimerRef.current = null;
      }
      overviewAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollOverview, pollDetail]);

  useEffect(() => {
    if (!selectedSessionId || !input.loadDetail) {
      detailAbortRef.current?.abort();
      detailGenerationRef.current++;
      setDetail(createIdleState);
      if (detailTimerRef.current) {
        clearTimeout(detailTimerRef.current);
        detailTimerRef.current = null;
      }
      return;
    }

    detailErrorPausedRef.current = false;
    pollDetail();

    return () => {
      if (detailTimerRef.current) {
        clearTimeout(detailTimerRef.current);
        detailTimerRef.current = null;
      }
    };
  }, [selectedSessionId, selectedTaskStatus, input.loadDetail, pollDetail]);

  return {
    overview,
    detail,
    retryOverview,
    retryDetail,
    refreshNow
  };
}
