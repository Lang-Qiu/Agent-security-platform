import { useCallback, useEffect, useRef, useState } from "react";

import type { RuntimeCheckpoint } from "../content/landing-content";

export const heroSequencePhases = [
  "copy",
  "frame",
  "topology",
  "trace",
  "detectors",
  "resolved"
] as const;

export type HeroSequencePhase = (typeof heroSequencePhases)[number];

export interface CinematicSequenceOptions {
  readonly isInView: boolean;
  readonly reducedMotion?: boolean;
}

export interface CinematicSequenceResult {
  readonly phase: HeroSequencePhase;
}

export const runtimeSequencePhases = [
  "input",
  "trust",
  "detectors",
  "evidence",
  "policy",
  "decision",
  "settled"
] as const;

export type RuntimeSequencePhase = (typeof runtimeSequencePhases)[number];
type RuntimeActivePhase = Exclude<RuntimeSequencePhase, "settled">;

export const runtimeTimelineMs = {
  input: 550,
  trust: 1150,
  detectors: 2600,
  evidence: 3500,
  policy: 4550,
  settle: 5400
} as const;

export interface RuntimeCinematicSequenceResult {
  readonly phase: RuntimeSequencePhase;
  readonly isPlaying: boolean;
  readonly playSegment: (checkpoint: RuntimeCheckpoint) => void;
  readonly replay: () => void;
  readonly cancel: () => void;
}

const phaseDelayMs: Readonly<
  Record<Exclude<HeroSequencePhase, "resolved">, number>
> = {
  copy: 420,
  frame: 340,
  topology: 260,
  trace: 220,
  detectors: 560
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function nextPhase(phase: HeroSequencePhase): HeroSequencePhase {
  const index = heroSequencePhases.indexOf(phase);
  return heroSequencePhases[Math.min(index + 1, heroSequencePhases.length - 1)];
}

export function useCinematicSequence({
  isInView,
  reducedMotion
}: CinematicSequenceOptions): CinematicSequenceResult {
  const motionReduced = reducedMotion ?? prefersReducedMotion();
  const motionAvailable = typeof window !== "undefined" && typeof window.setTimeout === "function";
  const initialPhase: HeroSequencePhase =
    motionReduced || !motionAvailable ? "resolved" : "copy";
  const [phase, setPhase] = useState<HeroSequencePhase>(initialPhase);
  const phaseRef = useRef<HeroSequencePhase>(initialPhase);
  const isInViewRef = useRef(isInView);
  const reducedRef = useRef(motionReduced);
  const settledRef = useRef(initialPhase === "resolved");
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
    deadlineRef.current = null;
  };

  const schedule = (delay: number) => {
    if (
      settledRef.current ||
      reducedRef.current ||
      !isInViewRef.current ||
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

      const currentPhase = phaseRef.current;
      const resolvedPhase = nextPhase(currentPhase);
      phaseRef.current = resolvedPhase;
      setPhase(resolvedPhase);

      if (resolvedPhase === "resolved") {
        settledRef.current = true;
        return;
      }

      schedule(phaseDelayMs[resolvedPhase]);
    }, safeDelay);
  };

  useEffect(() => {
    reducedRef.current = motionReduced;
    phaseRef.current = initialPhase;
    settledRef.current = initialPhase === "resolved";
    if (initialPhase === "resolved") {
      clearTimer();
      remainingRef.current = null;
      setPhase("resolved");
    }

    return () => {
      clearTimer();
      settledRef.current = true;
      remainingRef.current = null;
    };
    // The sequence intentionally initializes once for each mounted route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isInViewRef.current = isInView;
    if (settledRef.current || reducedRef.current || !motionAvailable) return;

    if (!isInView) {
      if (timerRef.current !== null && deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
        clearTimer();
      }
      return;
    }

    if (timerRef.current === null) {
      const currentPhase = phaseRef.current;
      if (currentPhase !== "resolved") {
        schedule(remainingRef.current ?? phaseDelayMs[currentPhase]);
        remainingRef.current = null;
      }
    }
  }, [isInView, motionAvailable]);

  return { phase };
}

const runtimePhaseDelayMs: Readonly<
  Record<RuntimeActivePhase, number>
> = {
  input: runtimeTimelineMs.input,
  trust: runtimeTimelineMs.trust - runtimeTimelineMs.input,
  detectors: runtimeTimelineMs.detectors - runtimeTimelineMs.trust,
  evidence: runtimeTimelineMs.evidence - runtimeTimelineMs.detectors,
  policy: runtimeTimelineMs.policy - runtimeTimelineMs.evidence,
  decision: runtimeTimelineMs.settle - runtimeTimelineMs.policy
};

const runtimeSegments: Readonly<
  Record<RuntimeCheckpoint, readonly RuntimeActivePhase[]>
> = {
  resolve: ["input", "trust"],
  detect: ["detectors"],
  decide: ["evidence", "policy"],
  contain: ["decision"]
};

const replaySegment = [
  "input",
  "trust",
  "detectors",
  "evidence",
  "policy",
  "decision"
] as const satisfies readonly RuntimeActivePhase[];

type RuntimePlaybackOwner = "idle" | "segment" | "replay";

export function useRuntimeCinematicSequence({
  isInView,
  reducedMotion
}: CinematicSequenceOptions): RuntimeCinematicSequenceResult {
  const motionReduced = reducedMotion ?? prefersReducedMotion();
  const [phase, setPhase] = useState<RuntimeSequencePhase>("settled");
  const [isPlaying, setIsPlaying] = useState(false);
  const playingRef = useRef(false);
  const playbackOwnerRef = useRef<RuntimePlaybackOwner>("idle");
  const reducedRef = useRef(motionReduced);
  const inViewRef = useRef(isInView);
  inViewRef.current = isInView;
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const pendingPhasesRef = useRef<RuntimeActivePhase[]>([]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    playingRef.current = false;
    playbackOwnerRef.current = "idle";
    pendingPhasesRef.current = [];
    setIsPlaying(false);
    setPhase("settled");
  }, [clearTimer]);

  const schedule = useCallback(function schedulePhase(phase: RuntimeActivePhase) {
    if (
      reducedRef.current ||
      !playingRef.current ||
      (playbackOwnerRef.current === "replay" && !inViewRef.current) ||
      typeof window === "undefined"
    ) {
      return;
    }

    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const nextPhase = pendingPhasesRef.current.shift();
      if (nextPhase === undefined) {
        setPhase("settled");
        playingRef.current = false;
        playbackOwnerRef.current = "idle";
        setIsPlaying(false);
        return;
      }
      setPhase(nextPhase);
      schedulePhase(nextPhase);
    }, Math.max(0, runtimePhaseDelayMs[phase]));
  }, [clearTimer]);

  const startSequence = useCallback((
    phases: readonly RuntimeActivePhase[],
    owner: Exclude<RuntimePlaybackOwner, "idle">
  ) => {
    if (
      phases.length === 0 ||
      reducedRef.current ||
      (owner === "replay" && !inViewRef.current) ||
      typeof window === "undefined"
    ) {
      cancel();
      return;
    }

    clearTimer();
    playbackOwnerRef.current = owner;
    playingRef.current = true;
    pendingPhasesRef.current = phases.slice(1);
    const firstPhase = phases[0];
    setIsPlaying(true);
    setPhase(firstPhase);
    schedule(firstPhase);
  }, [cancel, clearTimer, schedule]);

  const playSegment = useCallback((checkpoint: RuntimeCheckpoint) => {
    if (playbackOwnerRef.current === "replay") return;
    startSequence(runtimeSegments[checkpoint], "segment");
  }, [startSequence]);

  const replay = useCallback(() => {
    if (
      reducedRef.current ||
      !inViewRef.current ||
      typeof window === "undefined"
    ) {
      cancel();
      return;
    }
    startSequence(replaySegment, "replay");
  }, [cancel, startSequence]);

  useEffect(() => {
    if (!isInView && playingRef.current) cancel();
  }, [cancel, isInView]);

  useEffect(() => {
    return () => {
      clearTimer();
      playingRef.current = false;
      playbackOwnerRef.current = "idle";
      pendingPhasesRef.current = [];
    };
  }, [clearTimer]);

  return { phase, isPlaying, playSegment, replay, cancel };
}
