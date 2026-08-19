import { useEffect, useRef, useState, type RefObject } from "react";

export interface LandingInViewResult<T extends HTMLElement> {
  readonly ref: RefObject<T | null>;
  readonly isInView: boolean;
  readonly isMotionEnhancementAvailable: boolean;
}

/**
 * Observes one landing scene and falls back to visible when the enhancement
 * API is unavailable. The state remains local to the mounted route instance.
 */
export function useLandingInView<T extends HTMLElement>(): LandingInViewResult<T> {
  const ref = useRef<T | null>(null);
  const isMotionEnhancementAvailable =
    typeof window !== "undefined" && typeof IntersectionObserver !== "undefined";
  const [isInView, setIsInView] = useState(() => !isMotionEnhancementAvailable);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.15 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isInView, isMotionEnhancementAvailable };
}
