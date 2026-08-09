// Motion vocabulary for the showcase route.
//
// Apple's fluid-interface talks parameterise a spring by damping ratio (how
// much it overshoots) and response (how quickly it reaches the target), not by
// mass/stiffness/damping. Motion's spring API takes `bounce` + `duration`,
// which maps onto the same two ideas: bounce ~= 1 - dampingRatio.
//
// The interesting decision here is that the verdict's spring is derived from
// the decision's own `risk_level`. One code path, but a critical verdict lands
// sharp and slightly overshot while an informational one settles softly. The
// physics carries the severity, so the motion is data-driven rather than a
// uniform flourish bolted onto every result.

import type { SandboxSecurityDecision } from "../../../../../shared/types/sandbox-security";

export interface ShowcaseSpring {
  readonly type: "spring";
  readonly bounce: number;
  readonly duration: number;
}

/** Critically damped. The default for anything that no gesture preceded. */
export const CALM_SPRING: ShowcaseSpring = {
  type: "spring",
  bounce: 0,
  duration: 0.4
};

/** Used where a value is being thrown into place rather than merely appearing. */
export const MOMENTUM_SPRING: ShowcaseSpring = {
  type: "spring",
  bounce: 0.2,
  duration: 0.4
};

/**
 * Spotlight tracking spring. Deliberately slower than CALM_SPRING and expressed
 * in physical terms because it drives a raw MotionValue rather than a transition:
 * the lag between pointer and glow is the effect. A stiffer spring would pin the
 * light 1:1 to the cursor and lose the sense of weight.
 */
export const SHOWCASE_SPOTLIGHT_SPRING = {
  stiffness: 140,
  damping: 22,
  mass: 0.6
} as const;

type RiskLevel = SandboxSecurityDecision["risk_level"];

// damping 0.75 / response 0.25 at the top end: fast and a little past the mark,
// which reads as urgency. damping 1.0 / response 0.5 at the bottom: no
// overshoot at all, which reads as "nothing to see here".
const RISK_SPRING: Record<RiskLevel, ShowcaseSpring> = {
  critical: { type: "spring", bounce: 0.25, duration: 0.25 },
  high: { type: "spring", bounce: 0.15, duration: 0.32 },
  medium: { type: "spring", bounce: 0.1, duration: 0.38 },
  low: { type: "spring", bounce: 0, duration: 0.45 },
  info: { type: "spring", bounce: 0, duration: 0.5 }
};

export function verdictSpring(riskLevel: RiskLevel): ShowcaseSpring {
  return RISK_SPRING[riskLevel];
}

/**
 * Reduced motion is not "no feedback" — it is a non-vestibular equivalent. Every
 * entrance collapses to an instant opacity change with no travel, matching the
 * contract app.css already establishes for `.console-panel`.
 */
export const REDUCED_TRANSITION = { duration: 0 } as const;

export interface EnterProps {
  initial: Record<string, number>;
  animate: Record<string, number>;
  transition: ShowcaseSpring | typeof REDUCED_TRANSITION;
}

/** Rise-and-fade entrance, optionally delayed for a staggered cascade. */
export function enter(
  reduceMotion: boolean,
  options: { delay?: number; travel?: number; spring?: ShowcaseSpring } = {}
): EnterProps {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: REDUCED_TRANSITION
    };
  }
  const { delay = 0, travel = 10, spring = CALM_SPRING } = options;
  return {
    initial: { opacity: 0, y: travel },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring, delay }
  };
}
