// Act two: the detector chain lighting up.
//
// The reveal schedule is derived from each run's real `elapsed_ms`, normalised
// onto a fixed wall-clock window. That matters for honesty as much as for looks:
// the fast rule detectors snap in as a burst, then the chain visibly stalls
// while the local models think, then stalls longer on the external judge that
// times out. The shape of the animation is the shape of the real evaluation
// cost. Nothing here invents progress the engine did not report.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { SandboxDetectorRun } from "../../../../../shared/types/sandbox-security";
import { consolePalette } from "../../../styles/console-theme";
import { CALM_SPRING, MOMENTUM_SPRING } from "./showcase-motion";

/** Wall-clock length of the whole replay, independent of the real total cost. */
const REPLAY_WINDOW_MS = 2200;

export interface DetectorChainProps {
  runs: SandboxDetectorRun[];
  /** Flipped true when act two begins. */
  active: boolean;
  /** Fired once the last detector has landed. */
  onComplete?: () => void;
}

function statusColor(run: SandboxDetectorRun): string {
  switch (run.status) {
    case "matched":
      return consolePalette.severityHigh;
    case "no_match":
      return consolePalette.actionAllow;
    case "failed":
    case "timeout":
    case "invalid_result":
      return consolePalette.severityCritical;
    case "skipped":
      return consolePalette.mutedDim;
    default: {
      const _exhaustive: never = run;
      return _exhaustive;
    }
  }
}

/** Trailing path segment of a detector id, e.g. `instruction-override`. */
function shortName(detectorId: string): string {
  const segments = detectorId.split("/");
  return segments[segments.length - 1] || detectorId;
}

/**
 * Cumulative elapsed cost before each run, normalised to the replay window. A
 * run that cost nothing (skipped) still gets a slot so the chain reads as a
 * complete list of what the policy asked for.
 */
function revealSchedule(runs: SandboxDetectorRun[]): number[] {
  const total = runs.reduce((sum, run) => sum + run.elapsed_ms, 0);
  if (total <= 0) {
    return runs.map((_run, index) => (index / Math.max(runs.length, 1)) * REPLAY_WINDOW_MS);
  }
  let cumulative = 0;
  return runs.map((run) => {
    const at = (cumulative / total) * REPLAY_WINDOW_MS;
    cumulative += run.elapsed_ms;
    return at;
  });
}

export function DetectorChain({ runs, active, onComplete }: DetectorChainProps) {
  const reduceMotion = useReducedMotion();
  const schedule = useMemo(() => revealSchedule(runs), [runs]);
  const [landed, setLanded] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setLanded(0);
      completedRef.current = false;
      return;
    }

    if (reduceMotion) {
      setLanded(runs.length);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const timers = schedule.map((at, index) =>
      window.setTimeout(() => setLanded(index + 1), at)
    );
    const finish = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }, REPLAY_WINDOW_MS + 120);

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.clearTimeout(finish);
    };
    // onComplete is intentionally excluded: it is a stable page callback and
    // including it would restart the replay on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduceMotion, runs.length, schedule]);

  const progress = runs.length > 0 ? landed / runs.length : 0;

  return (
    <div className="showcase-chain">
      {/* The rail fills as the chain advances, so the eye has a single place to
          read "how far along is this". */}
      <div className="showcase-chain__rail" aria-hidden="true">
        <motion.div
          className="showcase-chain__rail-fill"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: progress }}
          transition={reduceMotion ? { duration: 0 } : CALM_SPRING}
        />
      </div>

      <ol className="showcase-chain__list">
        {runs.map((run, index) => {
          const isLanded = index < landed;
          return (
            <motion.li
              key={`${run.detector_id}@${run.detector_version}`}
              className="showcase-chain__item"
              initial={false}
              animate={
                reduceMotion
                  ? { opacity: isLanded ? 1 : 0.25 }
                  : {
                      opacity: isLanded ? 1 : 0.25,
                      x: isLanded ? 0 : -8,
                      scale: isLanded ? 1 : 0.98
                    }
              }
              transition={reduceMotion ? { duration: 0 } : MOMENTUM_SPRING}
            >
              <span
                className="showcase-chain__dot"
                style={{ background: isLanded ? statusColor(run) : "transparent" }}
                aria-hidden="true"
              />
              <span className="showcase-chain__name">{shortName(run.detector_id)}</span>
              <span className="showcase-chain__kind">{run.detector_kind}</span>
              <span className="showcase-chain__status" style={{ color: statusColor(run) }}>
                {run.status}
              </span>
              <span className="showcase-chain__elapsed">{run.elapsed_ms} ms</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
