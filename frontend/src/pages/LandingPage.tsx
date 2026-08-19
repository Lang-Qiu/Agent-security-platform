import { useEffect, useRef, type MouseEvent } from "react";

import { useRouteDocumentTitle } from "../app/useRouteDocumentTitle";
import { AttackSurfaceMap } from "../components/landing/AttackSurfaceMap";
import { EvidencePipeline } from "../components/landing/EvidencePipeline";
import { EvidenceRail } from "../components/landing/EvidenceRail";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingCta } from "../components/landing/LandingCta";
import { LandingFooter } from "../components/landing/LandingFooter";
import { LandingNav } from "../components/landing/LandingNav";
import { PlatformLayerStack } from "../components/landing/PlatformLayerStack";
import { RuntimeDecisionStage } from "../components/landing/RuntimeDecisionStage";
import { SectionTypographyBeat } from "../components/landing/SectionTypographyBeat";
import { SkillInspectionSurface } from "../components/landing/SkillInspectionSurface";
import {
  landingAnalyzeOutcomesZh,
  landingAttackSurfaceCopy,
  landingSections,
  landingTypographyBeats,
  type RuntimeCheckpoint,
  type LandingSectionCopy
} from "../content/landing-content";
import { useLandingInView } from "../hooks/useLandingInView";
import {
  useRuntimeCinematicSequence,
  type RuntimeSequencePhase
} from "../hooks/useCinematicSequence";
import {
  analyzeFocusOrder,
  discoverScanPhases,
  useNarrativeSequence,
  type DiscoverScanState
} from "../hooks/useNarrativeSequence";
import { useRuntimeStage } from "../hooks/useRuntimeStage";
import "../styles/landing.css";

const discoverStepDurationsMs = [0, 900] as const;

const runtimeReplayCheckpoint: Readonly<
  Record<RuntimeSequencePhase, RuntimeCheckpoint>
> = {
  input: "resolve",
  trust: "resolve",
  detectors: "detect",
  evidence: "decide",
  policy: "decide",
  decision: "contain",
  settled: "contain"
};

function DiscoverChapter({ section }: { readonly section: LandingSectionCopy }) {
  const inView = useLandingInView<HTMLElement>();
  const sequence = useNarrativeSequence({
    steps: discoverScanPhases,
    stepDurationMs: discoverStepDurationsMs,
    isInView: inView.isInView,
    reducedMotion: inView.isMotionEnhancementAvailable ? undefined : true
  });
  const scanState: DiscoverScanState =
    sequence.status === "paused" ? "paused" : sequence.step;

  return (
    <section
      ref={inView.ref}
      id={section.id}
      className="landing-section landing-discover"
      data-discover-scan={scanState}
      data-narrative-status={sequence.status}
      aria-labelledby="discover-title"
    >
      <div className="landing-discover__layout">
        <div className="landing-discover__copy">
          <p className="landing-eyebrow" lang="en">{section.eyebrow}</p>
          <h2 id="discover-title" lang="en">{section.headingEn}</h2>
          <p>{section.bodyZh}</p>
          <p className="landing-discover__outcome">{landingAttackSurfaceCopy.outcomeZh}</p>
        </div>
        <AttackSurfaceMap scanState={scanState} />
      </div>
    </section>
  );
}

function AnalyzeChapter({ section }: { readonly section: LandingSectionCopy }) {
  const inView = useLandingInView<HTMLElement>();
  const sequence = useNarrativeSequence({
    steps: analyzeFocusOrder,
    stepDurationMs: 75,
    isInView: inView.isInView,
    reducedMotion: inView.isMotionEnhancementAvailable ? undefined : true
  });

  return (
    <section
      ref={inView.ref}
      id={section.id}
      className="landing-section landing-analyze"
      data-inspection-focus={sequence.step}
      data-inspection-paused={String(sequence.status === "paused")}
      data-narrative-status={sequence.status}
      aria-labelledby="analyze-title"
    >
      <div className="landing-analyze__layout">
        <div className="landing-analyze__copy">
          <p className="landing-eyebrow" lang="en">{section.eyebrow}</p>
          <h2 id="analyze-title" lang="en">{section.headingEn}</h2>
          <p>{section.bodyZh}</p>
          <ul className="landing-analyze__outcomes">
            {landingAnalyzeOutcomesZh.map((outcome) => <li key={outcome}>{outcome}</li>)}
          </ul>
        </div>
        <SkillInspectionSurface automaticFocus={sequence.step} />
      </div>
    </section>
  );
}

function RuntimeChapter({ section }: { readonly section: LandingSectionCopy }) {
  const inView = useLandingInView<HTMLElement>();
  const reducedMotion = inView.isMotionEnhancementAvailable ? undefined : true;
  const playback = useRuntimeCinematicSequence({
    isInView: inView.isInView,
    reducedMotion
  });
  const stage = useRuntimeStage({
    isInView: inView.isInView,
    reducedMotion,
    onObserverTransition: ({ checkpoint, direction }) => {
      if (direction === "reverse") {
        playback.cancel();
        return;
      }
      playback.playSegment(checkpoint);
    }
  });

  useEffect(() => {
    if (stage.owner !== "replay") return;
    const replayCheckpoint = runtimeReplayCheckpoint[playback.phase];
    if (playback.phase === "settled") stage.finishReplay();
    else stage.setReplayCheckpoint(replayCheckpoint);
  }, [
    playback.phase,
    stage.finishReplay,
    stage.owner,
    stage.setReplayCheckpoint
  ]);

  const selectCheckpoint = (checkpoint: RuntimeCheckpoint) => {
    playback.cancel();
    stage.selectCheckpoint(checkpoint);
  };

  const replay = () => {
    if (!stage.startReplay()) return;
    playback.replay();
  };

  return (
    <section
      ref={inView.ref}
      id={section.id}
      className="landing-section landing-runtime"
      data-runtime-checkpoint={stage.checkpoint}
      data-runtime-phase={playback.phase}
      data-runtime-owner={stage.owner}
      aria-labelledby="runtime-title"
    >
      <div className="landing-runtime__copy">
        <p className="landing-eyebrow" lang="en">{section.eyebrow}</p>
        <h2 id="runtime-title" lang="en">{section.headingEn}</h2>
        <p>{section.bodyZh}</p>
      </div>
      <RuntimeDecisionStage
        checkpoint={stage.checkpoint}
        phase={playback.phase}
        owner={stage.owner}
        isPlaying={stage.owner === "replay" && playback.isPlaying}
        canReplay={stage.canReplay}
        sentinelRefs={stage.sentinelRefs}
        onSelect={selectCheckpoint}
        onReplay={replay}
      />
    </section>
  );
}

export function LandingPage() {
  useRouteDocumentTitle("Agent Security Platform");
  const mainRef = useRef<HTMLElement>(null);
  const sectionCopy = Object.fromEntries(landingSections.map((section) => [section.id, section]));

  const focusMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  return (
    <div className="landing-page" id="top">
      <a className="landing-skip-link" href="#landing-content" onClick={focusMain}>
        Skip to content
      </a>
      <LandingNav />
      <main ref={mainRef} id="landing-content" lang="zh-CN" tabIndex={-1}>
        <LandingHero />

        <EvidenceRail />

        <SectionTypographyBeat>{landingTypographyBeats[0]}</SectionTypographyBeat>

        <DiscoverChapter section={sectionCopy.discover} />

        <AnalyzeChapter section={sectionCopy.analyze} />

        <RuntimeChapter section={sectionCopy.runtime} />

        <SectionTypographyBeat>{landingTypographyBeats[1]}</SectionTypographyBeat>

        <PlatformLayerStack />
        <EvidencePipeline />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
