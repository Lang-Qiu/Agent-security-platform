// Sandbox security evaluation showcase.
//
// A presentation surface, deliberately separate from /sandbox-security/workbench.
// The workbench is forbidden from ever rendering a fixture verdict ("a security
// verdict must never be simulated by fixture data"), so the orchestrated
// three-act reveal lives here instead, on its own route, with its own authored
// decision and an on-screen provenance label.
//
// The page holds no capability token, submits nothing, and reads no storage. It
// is a replay of one authored decision.
//
// Structure of the sequence:
//   Act 1 (arming)    — the payload seals into a bounded packet
//   Act 2 (detecting) — the detector chain replays real per-detector elapsed_ms
//   Act 3 (verdict)   — the verdict lands on a spring derived from risk_level,
//                       then the findings cascade in severity order
//
// Reduced motion short-circuits the whole timeline to its end state: everything
// present, nothing travelling.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Button, Tag, Typography } from "antd";

import { DecisionSummaryPanel } from "../components/sandbox-security/DecisionSummaryPanel";
import { DetectorRunTable } from "../components/sandbox-security/DetectorRunTable";
import { DetectorChain } from "../components/sandbox-security/showcase/DetectorChain";
import { FindingsCascade } from "../components/sandbox-security/showcase/FindingsCascade";
import { SpotlightSurface } from "../components/sandbox-security/showcase/SpotlightSurface";
import { SpringNumber } from "../components/sandbox-security/showcase/SpringNumber";
import { VerdictHero } from "../components/sandbox-security/showcase/VerdictHero";
import { CALM_SPRING, enter, MOMENTUM_SPRING } from "../components/sandbox-security/showcase/showcase-motion";
import {
  showcaseActCopy,
  showcaseDecision,
  showcasePayloadSummary,
  showcaseProvenanceNotice
} from "../content/sandbox-security-showcase";

const { Paragraph, Text, Title } = Typography;

type Act = "idle" | "arming" | "detecting" | "verdict";

/** How long act one holds before the detector chain begins. */
const ARMING_MS = 900;

export function SandboxSecurityShowcasePage() {
  const reduceMotion = useReducedMotion() ?? false;
  const [act, setAct] = useState<Act>("idle");
  const armingTimerRef = useRef<number | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: pageRef });
  // Parallax: the header drifts up slightly faster than the page scrolls, so the
  // layers separate in depth. Kept small — a large travel would fight reading.
  const headerY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const headerOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0.55]);

  useEffect(() => {
    return () => {
      if (armingTimerRef.current !== null) {
        window.clearTimeout(armingTimerRef.current);
      }
    };
  }, []);

  const startSequence = () => {
    if (armingTimerRef.current !== null) {
      window.clearTimeout(armingTimerRef.current);
      armingTimerRef.current = null;
    }

    // Reduced motion gets the end state directly: the same information, none of
    // the vestibular travel.
    if (reduceMotion) {
      setAct("verdict");
      return;
    }

    setAct("arming");
    armingTimerRef.current = window.setTimeout(() => setAct("detecting"), ARMING_MS);
  };

  const reset = () => {
    if (armingTimerRef.current !== null) {
      window.clearTimeout(armingTimerRef.current);
      armingTimerRef.current = null;
    }
    setAct("idle");
  };

  const started = act !== "idle";
  const chainActive = act === "detecting" || act === "verdict";
  const verdictActive = act === "verdict";
  const totalPayloadBytes = showcasePayloadSummary.reduce(
    (sum, item) => sum + item.bytes,
    0
  );

  return (
    <div className="sandbox-security-showcase-page" ref={pageRef}>
      <motion.header
        className="showcase-header"
        style={reduceMotion ? undefined : { y: headerY, opacity: headerOpacity }}
      >
        <Text className="eyebrow">沙箱安全 · 评估演示</Text>
        <Title level={1} className="showcase-header__title">
          一次评估的全过程
        </Title>
        <Paragraph type="secondary" className="showcase-header__body">
          从负载封装到检测器链执行，再到判定落定。下方时序取自该次评估中每个检测器的真实耗时。
        </Paragraph>
        <div className="showcase-header__provenance">
          <Tag color="gold">{showcaseProvenanceNotice.label}</Tag>
          <Text type="secondary">{showcaseProvenanceNotice.summary}</Text>
        </div>
        <div className="showcase-header__controls">
          <Button type="primary" onClick={startSequence}>
            {started ? "重播演示" : "开始演示"}
          </Button>
          <Button onClick={reset} disabled={!started}>
            重置
          </Button>
        </div>
      </motion.header>

      {/* Act one — the payload seals. */}
      <SpotlightSurface className="showcase-act" ariaLabel={showcaseActCopy.arming.title}>
        <ActHeading
          eyebrow={showcaseActCopy.arming.eyebrow}
          title={showcaseActCopy.arming.title}
          body={showcaseActCopy.arming.body}
          reduceMotion={reduceMotion}
        />
        <div className="showcase-payload">
          {showcasePayloadSummary.map((item, index) => (
            <motion.div
              key={item.source_id}
              className="showcase-payload__item"
              initial={false}
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : started
                    ? { opacity: 1, scale: 0.97, y: 0 }
                    : { opacity: 0.7, scale: 1, y: 0 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { ...CALM_SPRING, delay: index * 0.05 }
              }
            >
              <span className="showcase-payload__id" data-mono="true">
                {item.source_id}
              </span>
              <span className="showcase-payload__type">{item.claimed_source_type}</span>
              <span className="showcase-payload__media" data-mono="true">
                {item.media_type}
              </span>
              <span className="showcase-payload__bytes" data-mono="true">
                {item.bytes} B
              </span>
            </motion.div>
          ))}
          <motion.div
            className="showcase-payload__seal"
            initial={false}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : started
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0, scale: 0.9 }
            }
            transition={reduceMotion ? { duration: 0 } : MOMENTUM_SPRING}
          >
            <Text type="secondary">封装总计</Text>
            <SpringNumber
              value={started ? totalPayloadBytes : 0}
              suffix=" B"
              reduceMotion={reduceMotion}
              className="showcase-payload__seal-value"
            />
          </motion.div>
        </div>
      </SpotlightSurface>

      {/* Act two — the detector chain. */}
      <SpotlightSurface
        className="showcase-act"
        ariaLabel={showcaseActCopy.detecting.title}
      >
        <ActHeading
          eyebrow={showcaseActCopy.detecting.eyebrow}
          title={showcaseActCopy.detecting.title}
          body={showcaseActCopy.detecting.body}
          reduceMotion={reduceMotion}
        />
        <DetectorChain
          runs={showcaseDecision.detector_runs}
          active={chainActive}
          onComplete={() => setAct("verdict")}
        />
      </SpotlightSurface>

      {/* Act three — the verdict and the findings cascade. */}
      <SpotlightSurface
        className="showcase-act showcase-act--verdict"
        ariaLabel={showcaseActCopy.verdict.title}
      >
        <ActHeading
          eyebrow={showcaseActCopy.verdict.eyebrow}
          title={showcaseActCopy.verdict.title}
          body={showcaseActCopy.verdict.body}
          reduceMotion={reduceMotion}
        />
        <VerdictHero
          decision={showcaseDecision}
          active={verdictActive}
          reduceMotion={reduceMotion}
        />
        <FindingsCascade
          findings={showcaseDecision.findings}
          active={verdictActive}
          reduceMotion={reduceMotion}
        />
      </SpotlightSurface>

      {/* The same presentational components the workbench uses, so the showcase
          ends on the real surfaces rather than a parallel mock of them.
          DecisionSummaryPanel owns the only role="status" on this page. */}
      {verdictActive ? (
        <>
          <motion.div {...enter(reduceMotion, { delay: 0.05 })}>
            <DecisionSummaryPanel decision={showcaseDecision} />
          </motion.div>
          <motion.section
            className="console-panel"
            {...enter(reduceMotion, { delay: 0.12 })}
          >
            <Title level={4}>检测器执行明细</Title>
            <DetectorRunTable runs={showcaseDecision.detector_runs} />
          </motion.section>
        </>
      ) : null}
    </div>
  );
}

interface ActHeadingProps {
  eyebrow: string;
  title: string;
  body: string;
  reduceMotion: boolean;
}

function ActHeading({ eyebrow, title, body, reduceMotion }: ActHeadingProps) {
  return (
    <motion.div className="showcase-act__heading" {...enter(reduceMotion)}>
      <Text className="showcase-act__eyebrow">{eyebrow}</Text>
      <Title level={2} className="showcase-act__title">
        {title}
      </Title>
      <Paragraph type="secondary" className="showcase-act__body">
        {body}
      </Paragraph>
    </motion.div>
  );
}
