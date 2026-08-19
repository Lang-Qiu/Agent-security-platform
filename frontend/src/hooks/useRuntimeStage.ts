import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  runtimeCheckpointOrder,
  type RuntimeCheckpoint
} from "../content/landing-content";

export type RuntimeStageOwner = "observer" | "direct" | "replay";

export type RuntimeObserverDirection = "forward" | "reverse";

export interface RuntimeObserverTransition {
  readonly checkpoint: RuntimeCheckpoint;
  readonly direction: RuntimeObserverDirection;
}

export interface RuntimeStageOptions {
  readonly isInView: boolean;
  readonly reducedMotion?: boolean;
  readonly onObserverTransition?: (transition: RuntimeObserverTransition) => void;
}

export interface RuntimeStageResult {
  readonly checkpoint: RuntimeCheckpoint;
  readonly owner: RuntimeStageOwner;
  readonly canReplay: boolean;
  readonly sentinelRefs: Readonly<Record<RuntimeCheckpoint, (node: HTMLElement | null) => void>>;
  readonly selectCheckpoint: (checkpoint: RuntimeCheckpoint) => void;
  readonly startReplay: () => boolean;
  readonly setReplayCheckpoint: (checkpoint: RuntimeCheckpoint) => void;
  readonly finishReplay: () => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function prefersStaticRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 1024px)").matches
  );
}

export function useRuntimeStage({
  isInView,
  reducedMotion,
  onObserverTransition
}: RuntimeStageOptions): RuntimeStageResult {
  const motionReduced = reducedMotion ?? prefersReducedMotion();
  const staticRuntime = prefersStaticRuntime();
  const initialCheckpoint: RuntimeCheckpoint =
    motionReduced || staticRuntime ? "contain" : "resolve";
  const [checkpoint, setCheckpoint] = useState<RuntimeCheckpoint>(initialCheckpoint);
  const [owner, setOwner] = useState<RuntimeStageOwner>("observer");
  const ownerRef = useRef<RuntimeStageOwner>("observer");
  const reducedRef = useRef(motionReduced);
  const staticRef = useRef(staticRuntime);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodesRef = useRef(new Map<RuntimeCheckpoint, HTMLElement>());
  const lastObserverCheckpointRef = useRef<RuntimeCheckpoint | null>(null);
  const observerTransitionRef = useRef(onObserverTransition);
  observerTransitionRef.current = onObserverTransition;

  const updateOwner = useCallback((nextOwner: RuntimeStageOwner) => {
    ownerRef.current = nextOwner;
    setOwner(nextOwner);
  }, []);

  const sentinelRefs = useMemo(() => {
    return Object.fromEntries(
      runtimeCheckpointOrder.map((runtimeCheckpoint) => [
        runtimeCheckpoint,
        (node: HTMLElement | null) => {
          const previous = nodesRef.current.get(runtimeCheckpoint);
          if (previous && previous !== node) observerRef.current?.unobserve(previous);
          if (!node) {
            nodesRef.current.delete(runtimeCheckpoint);
            return;
          }
          nodesRef.current.set(runtimeCheckpoint, node);
          observerRef.current?.observe(node);
        }
      ])
    ) as Record<RuntimeCheckpoint, (node: HTMLElement | null) => void>;
  }, []);

  useEffect(() => {
    if (
      motionReduced ||
      staticRuntime ||
      typeof IntersectionObserver === "undefined"
    ) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (ownerRef.current === "replay") return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) =>
            runtimeCheckpointOrder.find(
              (candidate) => entry.target.getAttribute("data-runtime-sentinel") === candidate
            )
          )
          .filter((candidate): candidate is RuntimeCheckpoint => Boolean(candidate));
        const nextCheckpoint = visible.at(-1);
        if (!nextCheckpoint) return;

        const previousCheckpoint = lastObserverCheckpointRef.current;
        if (previousCheckpoint === nextCheckpoint) return;

        const direction: RuntimeObserverDirection =
          previousCheckpoint === null ||
          runtimeCheckpointOrder.indexOf(nextCheckpoint) >
            runtimeCheckpointOrder.indexOf(previousCheckpoint)
            ? "forward"
            : "reverse";
        lastObserverCheckpointRef.current = nextCheckpoint;
        updateOwner("observer");
        setCheckpoint(nextCheckpoint);
        observerTransitionRef.current?.({ checkpoint: nextCheckpoint, direction });
      },
      { threshold: 0.25 }
    );

    observerRef.current = observer;
    for (const node of nodesRef.current.values()) observer.observe(node);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [motionReduced, staticRuntime, updateOwner]);

  useEffect(() => {
    if (!isInView && ownerRef.current === "replay") updateOwner("observer");
  }, [isInView, updateOwner]);

  const selectCheckpoint = useCallback((nextCheckpoint: RuntimeCheckpoint) => {
    if (reducedRef.current || staticRef.current) return;
    updateOwner("direct");
    lastObserverCheckpointRef.current = nextCheckpoint;
    setCheckpoint(nextCheckpoint);
  }, [updateOwner]);

  const startReplay = useCallback(() => {
    if (reducedRef.current || staticRef.current) return false;
    updateOwner("replay");
    setCheckpoint("resolve");
    return true;
  }, [updateOwner]);

  const setReplayCheckpoint = useCallback((nextCheckpoint: RuntimeCheckpoint) => {
    if (ownerRef.current !== "replay" || reducedRef.current) return;
    setCheckpoint(nextCheckpoint);
  }, []);

  const finishReplay = useCallback(() => {
    if (ownerRef.current !== "replay" || reducedRef.current) return;
    setCheckpoint("contain");
    lastObserverCheckpointRef.current = "contain";
    updateOwner("observer");
  }, [updateOwner]);

  return {
    checkpoint,
    owner,
    canReplay: !motionReduced && !staticRuntime,
    sentinelRefs,
    selectCheckpoint,
    startReplay,
    setReplayCheckpoint,
    finishReplay
  };
}
