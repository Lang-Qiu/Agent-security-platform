import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

import { isLocalMotionEnabled } from "./usePointerSpotlight";

export interface MagneticOffsetOptions {
  readonly maxOffsetPx?: number;
}

export interface MagneticOffsetResult<T extends HTMLElement> {
  readonly enabled: boolean;
  readonly ref: RefObject<T | null>;
  readonly onPointerMove: (event: PointerEvent<T>) => void;
  readonly onPointerLeave: () => void;
}

const ZERO_OFFSET = { x: 0, y: 0 } as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function writeOffset(element: HTMLElement, x: number, y: number): void {
  const formatValue = (value: number): string => (value === 0 ? "0" : value.toFixed(3));
  element.style.setProperty("--magnetic-x", `${formatValue(x)}px`);
  element.style.setProperty("--magnetic-y", `${formatValue(y)}px`);
}

export function useMagneticOffset<T extends HTMLElement>(
  options: MagneticOffsetOptions = {}
): MagneticOffsetResult<T> {
  const maxOffsetPx = Math.min(Math.max(options.maxOffsetPx ?? 4, 0), 4);
  const ref = useRef<T | null>(null);
  const [enabled] = useState(() => isLocalMotionEnabled());
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const frameKindRef = useRef<"raf" | "timeout" | null>(null);

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null || typeof window === "undefined") return;
    if (frameKindRef.current === "raf") {
      window.cancelAnimationFrame(frameRef.current);
    } else {
      window.clearTimeout(frameRef.current);
    }
    frameRef.current = null;
    frameKindRef.current = null;
  }, []);

  const reset = useCallback(() => {
    const element = ref.current;
    if (element) writeOffset(element, ZERO_OFFSET.x, ZERO_OFFSET.y);
  }, []);

  const applyPending = useCallback(() => {
    frameRef.current = null;
    frameKindRef.current = null;
    const element = ref.current;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!element || !pending) return;
    writeOffset(element, pending.x, pending.y);
  }, []);

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
      const normalizedX = clamp((event.clientX - rect.left) / width * 2 - 1, -1, 1);
      const normalizedY = clamp((event.clientY - rect.top) / height * 2 - 1, -1, 1);
      pendingRef.current = {
        x: normalizedX * maxOffsetPx,
        y: normalizedY * maxOffsetPx
      };
      queueFrame();
    },
    [enabled, maxOffsetPx, queueFrame]
  );

  const onPointerLeave = useCallback(() => {
    pendingRef.current = ZERO_OFFSET;
    if (!enabled) {
      cancelFrame();
      reset();
      return;
    }
    queueFrame();
  }, [cancelFrame, enabled, queueFrame, reset]);

  useEffect(() => {
    reset();
    return () => {
      cancelFrame();
      pendingRef.current = null;
    };
  }, [cancelFrame, reset]);

  return { enabled, ref, onPointerMove, onPointerLeave };
}
