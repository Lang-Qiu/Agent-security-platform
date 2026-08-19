import { useEffect, useRef, useState } from "react";

export const discoverScanPhases = ["idle", "scanning", "revealed"] as const;
export type DiscoverScanState = (typeof discoverScanPhases)[number] | "paused";

export const analyzeFocusOrder = [
  "manifest",
  "dependency",
  "permission",
  "invocation",
  "reason"
] as const;
export type AnalyzeFocusState = (typeof analyzeFocusOrder)[number];

export type NarrativeSequenceStatus = "idle" | "running" | "paused" | "settled";

export interface NarrativeSequenceOptions<TStep extends string> {
  readonly steps: readonly [TStep, ...TStep[]];
  readonly stepDurationMs: number | readonly number[];
  readonly isInView: boolean;
  readonly reducedMotion?: boolean;
}

export interface NarrativeSequenceResult<TStep extends string> {
  readonly step: TStep;
  readonly status: NarrativeSequenceStatus;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useNarrativeSequence<TStep extends string>({
  steps,
  stepDurationMs,
  isInView,
  reducedMotion
}: NarrativeSequenceOptions<TStep>): NarrativeSequenceResult<TStep> {
  const motionReduced = reducedMotion ?? prefersReducedMotion();
  const lastIndex = steps.length - 1;
  const initialIndex = motionReduced ? lastIndex : 0;
  const [step, setStep] = useState<TStep>(steps[initialIndex]);
  const [status, setStatus] = useState<NarrativeSequenceStatus>(
    motionReduced ? "settled" : "idle"
  );
  const indexRef = useRef(initialIndex);
  const inViewRef = useRef(isInView);
  const reducedRef = useRef(motionReduced);
  const startedRef = useRef(motionReduced);
  const settledRef = useRef(motionReduced);
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef<number | null>(null);

  const updateStatus = (nextStatus: NarrativeSequenceStatus) => {
    setStatus(nextStatus);
  };

  const clearTimer = () => {
    if (timerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
    deadlineRef.current = null;
  };

  const getStepDuration = (index: number) => {
    if (typeof stepDurationMs === "number") return Math.max(0, stepDurationMs);
    const duration = stepDurationMs[Math.min(index, stepDurationMs.length - 1)] ?? 0;
    return Math.max(0, duration);
  };

  const schedule = (delay: number) => {
    if (
      settledRef.current ||
      reducedRef.current ||
      !inViewRef.current ||
      typeof window === "undefined"
    ) {
      return;
    }

    clearTimer();
    const safeDelay = Math.max(0, delay);
    deadlineRef.current = Date.now() + safeDelay;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      deadlineRef.current = null;
      remainingRef.current = null;

      const nextIndex = Math.min(indexRef.current + 1, lastIndex);
      indexRef.current = nextIndex;
      setStep(steps[nextIndex]);

      if (nextIndex === lastIndex) {
        settledRef.current = true;
        updateStatus("settled");
        return;
      }

      updateStatus("running");
      schedule(getStepDuration(nextIndex));
    }, safeDelay);
  };

  useEffect(() => {
    reducedRef.current = motionReduced;
    settledRef.current = motionReduced;
    startedRef.current = motionReduced;
    indexRef.current = initialIndex;
    remainingRef.current = null;
    setStep(steps[initialIndex]);
    updateStatus(motionReduced ? "settled" : "idle");

    return () => {
      clearTimer();
      settledRef.current = true;
      remainingRef.current = null;
    };
    // The authored sequence is intentionally initialized once per component mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    inViewRef.current = isInView;
    if (settledRef.current || reducedRef.current) return;

    if (!isInView) {
      if (timerRef.current !== null && deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
        clearTimer();
      }
      if (startedRef.current) updateStatus("paused");
      return;
    }

    startedRef.current = true;
    updateStatus("running");
    if (timerRef.current === null) {
      schedule(remainingRef.current ?? getStepDuration(indexRef.current));
      remainingRef.current = null;
    }
    // steps and timing are authored module constants and remain fixed for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView]);

  return { step, status };
}
