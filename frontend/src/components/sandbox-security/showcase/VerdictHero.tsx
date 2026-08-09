// Act three: the verdict lands.
//
// The single most deliberate decision in this file is that the spring is read
// from the decision's own `risk_level` (see showcase-motion.ts). One code path,
// but a `critical` verdict arrives fast and slightly past the mark while an
// `info` verdict settles without overshoot. The physics carries the severity.
//
// This component intentionally carries NO aria role. DecisionSummaryPanel owns
// the only role="status" on the page, so the verdict is announced exactly once
// rather than twice by two competing live regions.

import { motion } from "motion/react";
import { Typography } from "antd";

import type { SandboxSecurityDecision } from "../../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "../SandboxSecurityValueTag";
import { SpringNumber } from "./SpringNumber";
import { REDUCED_TRANSITION, verdictSpring } from "./showcase-motion";

const { Text } = Typography;

export interface VerdictHeroProps {
  decision: SandboxSecurityDecision;
  /** Whether act three has begun. */
  active: boolean;
  reduceMotion: boolean;
}

export function VerdictHero({ decision, active, reduceMotion }: VerdictHeroProps) {
  const spring = verdictSpring(decision.risk_level);
  const transition = reduceMotion ? REDUCED_TRANSITION : spring;

  const acceptedFindings = decision.findings.length;
  const detectorsRun = decision.detector_runs.filter(
    (run) => run.status !== "skipped"
  ).length;
  const totalElapsedMs = decision.detector_runs.reduce(
    (sum, run) => sum + run.elapsed_ms,
    0
  );

  return (
    <div className="showcase-verdict">
      {/* The ring is pure decoration: it expands and fades once, on the same
          spring as the verdict, so the arrival reads as an impact rather than a
          fade. Hidden from assistive technology. */}
      {!reduceMotion && active ? (
        <motion.span
          aria-hidden="true"
          className="showcase-verdict__pulse"
          data-risk={decision.risk_level}
          initial={{ opacity: 0.55, scale: 0.6 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      ) : null}

      {/* Gated on `active` rather than merely faded to opacity 0. A verdict that
          exists in the DOM before the evaluation has been replayed would be read
          out by a screen reader as a result that has not happened yet, and would
          also be matched by a text query. Absent until earned. */}
      {active ? (
        <>
          <motion.div
            className="showcase-verdict__tags"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
            }
            transition={transition}
          >
            <SandboxSecurityValueTag domain="verdict" value={decision.verdict} />
            <SandboxSecurityValueTag domain="action" value={decision.action} />
            <SandboxSecurityValueTag
              domain="risk_level"
              value={decision.risk_level}
            />
          </motion.div>

          <motion.dl
            className="showcase-verdict__metrics"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={
              reduceMotion ? REDUCED_TRANSITION : { ...spring, delay: 0.12 }
            }
          >
            <div className="showcase-verdict__metric">
              <dt>
                <Text type="secondary">风险发现</Text>
              </dt>
              <dd>
                <SpringNumber value={acceptedFindings} reduceMotion={reduceMotion} />
              </dd>
            </div>
            <div className="showcase-verdict__metric">
              <dt>
                <Text type="secondary">已执行检测器</Text>
              </dt>
              <dd>
                <SpringNumber value={detectorsRun} reduceMotion={reduceMotion} />
              </dd>
            </div>
            <div className="showcase-verdict__metric">
              <dt>
                <Text type="secondary">评估总耗时</Text>
              </dt>
              <dd>
                <SpringNumber
                  value={totalElapsedMs}
                  suffix=" ms"
                  reduceMotion={reduceMotion}
                />
              </dd>
            </div>
          </motion.dl>
        </>
      ) : (
        <div className="showcase-verdict__placeholder">
          <Text type="secondary">演示开始后，判定与关键指标将在此落定。</Text>
        </div>
      )}
    </div>
  );
}
