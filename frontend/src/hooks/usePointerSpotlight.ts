import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

interface PointerPosition {
  readonly x: number;
  readonly y: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
}

export interface PointerSpotlightOptions {
  readonly maxPlaneOffsetPx?: number;
  readonly maxRotationDeg?: number;
  readonly spotlightSizePx?: number;
}

export interface PointerSpotlightResult<T extends HTMLElement> {
  readonly enabled: boolean;
  readonly ref: RefObject<T | null>;
  readonly onPointerMove: (event: PointerEvent<T>) => void;
  readonly onPointerLeave: () => void;
}

const ZERO_POSITION: PointerPosition = {
  x: 0,
  y: 0,
  normalizedX: 0,
  normalizedY: 0
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatValue = (value: number): string => (value === 0 ? "0" : value.toFixed(3));

export function isLocalMotionEnabled(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const narrow = window.matchMedia("(max-width: 1024px)").matches;
  return !reduced && fine && !coarse && !narrow;
}

function setPositionStyles(
  element: HTMLElement,
  position: PointerPosition,
  maxRotationDeg: number,
  maxPlaneOffsetPx: number,
  spotlightSizePx: number
): void {
  const style = element.style;
  style.setProperty(
    "--hero-rotate-x",
    `${formatValue(-position.normalizedY * maxRotationDeg)}deg`
  );
  style.setProperty(
    "--hero-rotate-y",
    `${formatValue(position.normalizedX * maxRotationDeg)}deg`
  );
  style.setProperty(
    "--hero-plane-x",
    `${formatValue(position.normalizedX * maxPlaneOffsetPx)}px`
  );
  style.setProperty(
    "--hero-plane-y",
    `${formatValue(position.normalizedY * maxPlaneOffsetPx)}px`
  );
  style.setProperty("--hero-spotlight-x", `${position.x.toFixed(1)}px`);
  style.setProperty("--hero-spotlight-y", `${position.y.toFixed(1)}px`);
  style.setProperty("--hero-spotlight-size", `${spotlightSizePx}px`);
}

export function usePointerSpotlight<T extends HTMLElement>(
  options: PointerSpotlightOptions = {}
): PointerSpotlightResult<T> {
  const maxPlaneOffsetPx = Math.min(Math.max(options.maxPlaneOffsetPx ?? 8, 0), 8);
  const maxRotationDeg = Math.min(Math.max(options.maxRotationDeg ?? 1.25, 0), 1.25);
  const spotlightSizePx = Math.min(Math.max(options.spotlightSizePx ?? 320, 0), 320);
  const ref = useRef<T | null>(null);
  const [enabled] = useState(() => isLocalMotionEnabled());
  const pendingRef = useRef<PointerPosition | null>(null);
  const frameRef = useRef<number | null>(null);
  const frameKindRef = useRef<"raf" | "timeout" | null>(null);

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    if (frameKindRef.current === "raf" && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
    } else if (typeof window !== "undefined") {
      window.clearTimeout(frameRef.current);
    }
    frameRef.current = null;
    frameKindRef.current = null;
  }, []);

  const resetStyles = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    setPositionStyles(
      element,
      ZERO_POSITION,
      maxRotationDeg,
      maxPlaneOffsetPx,
      spotlightSizePx
    );
  }, [maxPlaneOffsetPx, maxRotationDeg, spotlightSizePx]);

  const applyPending = useCallback(() => {
    frameRef.current = null;
    frameKindRef.current = null;
    const element = ref.current;
    const position = pendingRef.current;
    pendingRef.current = null;
    if (!element || !position) return;
    setPositionStyles(
      element,
      position,
      maxRotationDeg,
      maxPlaneOffsetPx,
      spotlightSizePx
    );
  }, [maxPlaneOffsetPx, maxRotationDeg, spotlightSizePx]);

  const queueFrame = useCallback(() => {
    if (frameRef.current !== null || typeof window === "undefined") return;
    if (typeof window.requestAnimationFrame === "function") {
      frameKindRef.current = "raf";
      frameRef.current = window.requestAnimationFrame(applyPending);
    } else {
      frameKindRef.current = "timeout";
      frameRef.current = window.setTimeout(applyPending, 16);
    }
  }, [applyPending]);

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      if (!enabled || (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen")) {
        return;
      }
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      const x = clamp(event.clientX - rect.left, 0, width);
      const y = clamp(event.clientY - rect.top, 0, height);
      pendingRef.current = {
        x,
        y,
        normalizedX: clamp((x / width) * 2 - 1, -1, 1),
        normalizedY: clamp((y / height) * 2 - 1, -1, 1)
      };
      queueFrame();
    },
    [enabled, queueFrame]
  );

  const onPointerLeave = useCallback(() => {
    pendingRef.current = ZERO_POSITION;
    if (!enabled) {
      cancelFrame();
      resetStyles();
      return;
    }
    queueFrame();
  }, [cancelFrame, enabled, queueFrame, resetStyles]);

  useEffect(() => {
    resetStyles();
    return () => {
      cancelFrame();
      pendingRef.current = null;
    };
  }, [cancelFrame, resetStyles]);

  return { enabled, ref, onPointerMove, onPointerLeave };
}
