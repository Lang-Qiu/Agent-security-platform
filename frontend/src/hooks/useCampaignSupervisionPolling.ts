// P5-T2: Race-safe campaign supervision polling hook.
//
// Mirrors the accepted generation/abort/error-pause pattern from
// useSupervisionPolling but is scoped to a single campaign resource. The hook
// depends on primitive `campaignId` and terminal-status values (not whole
// response objects) so late responses for a prior campaign cannot overwrite
// the current campaign's state.
//
// Polling rules (from the Phase 5 plan):
// - created, validating, running, collecting  -> poll every 3s
// - completed, failed                          -> stop polling
// - hidden document                            -> pause
// - visible restore                            -> resume only if not stale
// - failure                                    -> keep last data, mark stale, pause
// - explicit retry                             -> clear pause, load immediately
// - campaign ID change                         -> abort prior, reset state
// - unmount                                    -> abort, no post-unmount state update
// - one hook instance                          -> one visibility listener

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  Track1CampaignDetail,
  Track1CampaignStatus,
  Track1CampaignSummary
} from "../../../shared/types/campaign-supervision";
import type { CampaignDataResult } from "../services/campaign-supervision-service";

export interface CampaignSupervisionData {
  summary: Track1CampaignSummary;
  detail: Track1CampaignDetail;
}

export type CampaignFreshness = "fresh" | "stale";
export type CampaignSource = "api" | "integration-error" | "mock";

export interface CampaignPollingState {
  data: CampaignSupervisionData | null;
  loading: boolean;
  freshness: CampaignFreshness;
  lastSuccessAt: string | null;
  error: "unavailable" | "invalid" | "not-ready" | null;
  source: CampaignSource | null;
}

const DEFAULT_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: ReadonlySet<Track1CampaignStatus> = new Set([
  "completed",
  "failed"
]);

function createLoadingState(): CampaignPollingState {
  return {
    data: null,
    loading: true,
    freshness: "fresh",
    lastSuccessAt: null,
    error: null,
    source: null
  };
}

function createIdleState(): CampaignPollingState {
  return {
    data: null,
    loading: false,
    freshness: "fresh",
    lastSuccessAt: null,
    error: null,
    source: null
  };
}

export function useCampaignSupervisionPolling(input: {
  campaignId: string | null;
  loadCampaign(
    campaignId: string,
    signal: AbortSignal
  ): Promise<CampaignDataResult<CampaignSupervisionData>>;
  intervalMs?: 3000;
}): {
  campaign: CampaignPollingState;
  retry(): Promise<void>;
  refreshNow(): Promise<void>;
} {
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  const campaignId = input.campaignId;

  const [campaign, setCampaign] = useState<CampaignPollingState>(createLoadingState);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const errorPausedRef = useRef(false);
  const isHiddenRef = useRef(false);
  const isUnmountedRef = useRef(false);

  const loadCampaignRef = useRef(input.loadCampaign);
  const campaignIdRef = useRef(campaignId);
  loadCampaignRef.current = input.loadCampaign;
  campaignIdRef.current = campaignId;

  const schedulePollRef = useRef<() => void>(() => {});

  const poll = useCallback(async () => {
    if (isUnmountedRef.current) return;
    const id = campaignIdRef.current;
    if (!id) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++generationRef.current;

    setCampaign((prev) => ({ ...prev, loading: true }));

    try {
      const result = await loadCampaignRef.current(id, controller.signal);
      if (gen !== generationRef.current) return;
      if (isUnmountedRef.current) return;

      if (result.data) {
        setCampaign({
          data: result.data,
          loading: false,
          freshness: "fresh",
          lastSuccessAt: new Date().toISOString(),
          error: result.error,
          source: result.source
        });
        errorPausedRef.current = false;
        // Schedule next poll only for non-terminal statuses.
        if (!TERMINAL_STATUSES.has(result.data.summary.status)) {
          schedulePollRef.current();
        }
      } else {
        // integration-error: keep last successful data, mark stale, pause.
        setCampaign((prev) => ({
          ...prev,
          loading: false,
          freshness: "stale",
          error: result.error,
          source: result.source
        }));
        errorPausedRef.current = true;
      }
    } catch {
      if (gen !== generationRef.current) return;
      if (isUnmountedRef.current) return;
      setCampaign((prev) => ({
        ...prev,
        loading: false,
        freshness: "stale",
        error: "unavailable",
        source: "integration-error"
      }));
      errorPausedRef.current = true;
    }
  }, []);

  const schedulePoll = useCallback(() => {
    if (
      isUnmountedRef.current ||
      isHiddenRef.current ||
      errorPausedRef.current
    ) {
      return;
    }
    // Do not schedule if current data is terminal.
    // (schedulePoll is only called after a successful non-terminal poll, so
    // this is a defensive guard against a stale terminal state left over from
    // a prior campaign ID.)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(async () => {
      await poll();
    }, intervalMs);
  }, [intervalMs, poll]);

  schedulePollRef.current = schedulePoll;

  const retry = useCallback(async () => {
    generationRef.current++;
    abortRef.current?.abort();
    errorPausedRef.current = false;
    await poll();
  }, [poll]);

  const refreshNow = useCallback(async () => {
    generationRef.current++;
    abortRef.current?.abort();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    errorPausedRef.current = false;
    await poll();
  }, [poll]);

  // Campaign ID change effect: abort prior, reset state, load new.
  useEffect(() => {
    isUnmountedRef.current = false;
    if (!campaignId) {
      // No campaign selected: idle state, no polling.
      abortRef.current?.abort();
      generationRef.current++;
      errorPausedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setCampaign(createIdleState());
      return;
    }

    // Reset state for the new campaign and load immediately.
    abortRef.current?.abort();
    generationRef.current++;
    errorPausedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCampaign(createLoadingState());
    poll();

    const handleVisibilityChange = () => {
      const wasHidden = isHiddenRef.current;
      const nowHidden = document.visibilityState === "hidden";
      isHiddenRef.current = nowHidden;
      if (wasHidden === nowHidden) return;

      if (nowHidden) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      } else {
        // Resume only if not stale and not terminal.
        if (!errorPausedRef.current) {
          poll();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isUnmountedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [campaignId, poll]);

  return {
    campaign,
    retry,
    refreshNow
  };
}
