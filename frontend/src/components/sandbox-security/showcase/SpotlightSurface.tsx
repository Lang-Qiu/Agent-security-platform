import { useRef, type ReactNode } from "react";
import { motion, useMotionTemplate, useSpring } from "motion/react";

import { SHOWCASE_SPOTLIGHT_SPRING } from "./showcase-motion";

export interface SpotlightSurfaceProps {
  /** Optional extra classes appended after the surface class. */
  className?: string;
  /** Accessible label when the surface is a labelled region. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Magnetic spotlight shell. The pointer position drives two springs (X and Y
 * decomposed independently, because a single spring over a 2D distance desyncs
 * when the axes carry different velocities), and the springs feed a radial
 * gradient through a motion template. The lag between pointer and glow is the
 * point: it reads as a heavy light source being dragged rather than a cursor
 * follower pinned 1:1.
 *
 * The glow layer is `aria-hidden` and `pointer-events: none` — it is pure
 * decoration and must never intercept a click or reach assistive technology.
 * The tint colour comes from a console token, so no colour literal lives here.
 */
export function SpotlightSurface({
  className,
  ariaLabel,
  children
}: SpotlightSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Start off-surface so no glow is painted until the pointer actually arrives.
  const x = useSpring(-1000, SHOWCASE_SPOTLIGHT_SPRING);
  const y = useSpring(-1000, SHOWCASE_SPOTLIGHT_SPRING);

  const glow = useMotionTemplate`radial-gradient(320px circle at ${x}px ${y}px, var(--console-showcase-spotlight), transparent 70%)`;

  return (
    <div
      ref={surfaceRef}
      className={
        className ? `showcase-spotlight ${className}` : "showcase-spotlight"
      }
      aria-label={ariaLabel}
      onPointerMove={(event) => {
        const bounds = surfaceRef.current?.getBoundingClientRect();
        if (!bounds) return;
        x.set(event.clientX - bounds.left);
        y.set(event.clientY - bounds.top);
      }}
      onPointerLeave={() => {
        // Drive the glow off-surface rather than hiding it, so the light
        // retreats along the same path it arrived on.
        x.set(-1000);
        y.set(-1000);
      }}
    >
      <motion.div
        className="showcase-spotlight__glow"
        style={{ background: glow }}
        aria-hidden="true"
      />
      <div className="showcase-spotlight__content">{children}</div>
    </div>
  );
}
