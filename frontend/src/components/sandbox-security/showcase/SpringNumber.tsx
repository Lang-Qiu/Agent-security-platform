// A number that springs to its target instead of snapping to it.
//
// Accessibility note: the animated digits are decorative — mid-flight they show
// a value that is not yet true. So the visible span is aria-hidden and the real
// value is exposed once, as text, to assistive technology. A screen reader
// therefore always reads the settled truth and never an interpolated frame.

import { useEffect, useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "motion/react";

export interface SpringNumberProps {
  value: number;
  /** Decimal places to render. Defaults to 0 (integers). */
  precision?: number;
  /** Rendered verbatim after the number, inside the same aria-hidden span. */
  suffix?: string;
  /** Text handed to assistive technology. Defaults to the formatted value. */
  ariaLabel?: string;
  className?: string;
  /**
   * Overrides the internal media-query read. A parent that already resolved the
   * preference passes it down so every number in one orchestrated sequence makes
   * the same decision from the same value.
   */
  reduceMotion?: boolean;
}

export function SpringNumber({
  value,
  precision = 0,
  suffix = "",
  ariaLabel,
  className,
  reduceMotion: reduceMotionOverride
}: SpringNumberProps) {
  // Hook is called unconditionally; the override only wins when supplied.
  const systemReduceMotion = useReducedMotion();
  const reduceMotion = reduceMotionOverride ?? systemReduceMotion ?? false;
  const nodeRef = useRef<HTMLSpanElement>(null);

  // A soft, non-overshooting spring: a counter that bounced past its target and
  // came back would read as a glitch rather than as motion.
  const spring = useSpring(reduceMotion ? value : 0, {
    bounce: 0,
    duration: 0.9
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useMotionValueEvent(spring, "change", (latest) => {
    const node = nodeRef.current;
    if (!node) return;
    node.textContent = `${latest.toFixed(precision)}${suffix}`;
  });

  const settled = `${value.toFixed(precision)}${suffix}`;

  return (
    <>
      <span
        ref={nodeRef}
        aria-hidden="true"
        className={className}
        // Rendered so the settled value is correct before the first frame and
        // after any reduced-motion short-circuit.
      >
        {reduceMotion ? settled : `${(0).toFixed(precision)}${suffix}`}
      </span>
      <span className="showcase-sr-only">{ariaLabel ?? settled}</span>
    </>
  );
}
