import {
  landingHeroDetectorRows,
  landingHeroEvidenceRows
} from "../../content/landing-content";
import {
  usePointerSpotlight,
  type PointerSpotlightResult
} from "../../hooks/usePointerSpotlight";
import type { HeroSequencePhase } from "../../hooks/useCinematicSequence";

export interface HeroSecurityWorkbenchProps {
  readonly phase: HeroSequencePhase;
}

function formatEvidenceCount(count: number): string {
  return count.toString().padStart(2, "0");
}

function TopologyGraphic() {
  return (
    <svg
      className="landing-hero__topology-lines"
      viewBox="0 0 620 310"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M32 155H184L278 74H420L586 155" />
      <path d="M184 155l94 81h142l166-81" />
      <path d="M278 74v162" />
    </svg>
  );
}

function DetectorList() {
  return (
    <ul className="landing-hero__detector-list" aria-label="Detector paths">
      {landingHeroDetectorRows.map((detector) => (
        <li key={detector.identifier} className="landing-hero__detector-row">
          <span className="landing-hero__status-dot" aria-hidden="true" />
          <code>{detector.identifier}</code>
          <span className="landing-hero__detector-state">evidence path</span>
        </li>
      ))}
    </ul>
  );
}

function EvidenceList() {
  return (
    <ol className="landing-hero__evidence-list" aria-label="Authored evidence rows">
      {landingHeroEvidenceRows.map((row, index) => (
        <li
          className="landing-hero__evidence-row"
          data-testid="hero-evidence-row"
          key={row.identifier}
        >
          <span className="landing-hero__evidence-index">{formatEvidenceCount(index + 1)}</span>
          <code>{row.identifier}</code>
          <span>{row.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function HeroSecurityWorkbench({ phase }: HeroSecurityWorkbenchProps) {
  const spotlight: PointerSpotlightResult<HTMLDivElement> = usePointerSpotlight();
  const state = phase === "resolved" ? "RESOLVED" : "EVALUATING";

  return (
    <div
      ref={spotlight.ref}
      className="landing-hero__scene"
      data-hero-phase={phase}
      onPointerMove={spotlight.onPointerMove}
      onPointerLeave={spotlight.onPointerLeave}
    >
      <figure
        className="landing-hero__frame"
        data-depth="z1"
        lang="en"
        aria-labelledby="hero-workbench-title"
      >
        <figcaption className="landing-hero__chrome">
          <div className="landing-hero__chrome-title">
            <span className="landing-hero__chrome-kicker">AGENT SECURITY EVALUATION SURFACE</span>
            <h2 id="hero-workbench-title">Illustrative security evaluation</h2>
          </div>
          <div className="landing-hero__chrome-meta">
            <code>runtime_interaction/trace-0142</code>
            <code>sequence_offset: 00 &gt; 06</code>
            <span className="landing-hero__chrome-state" data-state={state.toLowerCase()}>
              {state}
            </span>
          </div>
        </figcaption>

        <div className="landing-hero__workbench-body">
          <div
            className="landing-hero__topology"
            role="group"
            aria-label="Decision topology"
          >
            <TopologyGraphic />
            <div className="landing-hero__topology-node landing-hero__topology-node--agent">
              <span>Agent</span>
              <code>input</code>
            </div>
            <div className="landing-hero__topology-node landing-hero__topology-node--skill">
              <span>Skill</span>
              <code>provenance</code>
            </div>
            <div className="landing-hero__topology-node landing-hero__topology-node--tool">
              <span>Tool</span>
              <code>scope</code>
            </div>
            <div className="landing-hero__topology-node landing-hero__topology-node--runtime">
              <span>Runtime</span>
              <code>policy</code>
            </div>
            <div className="landing-hero__topology-node landing-hero__topology-node--decision">
              <span>Decision</span>
              <code>containment</code>
            </div>
          </div>

          <section className="landing-hero__evidence-panel" aria-labelledby="hero-evidence-title">
            <div className="landing-hero__panel-heading">
              <span className="landing-hero__panel-index">01</span>
              <h3 id="hero-evidence-title">Evidence chain</h3>
            </div>
            <EvidenceList />
          </section>

          <section className="landing-hero__detectors" aria-labelledby="hero-detectors-title">
            <div className="landing-hero__panel-heading">
              <span className="landing-hero__panel-index">02</span>
              <h3 id="hero-detectors-title">Detectors</h3>
            </div>
            <DetectorList />
          </section>
        </div>
      </figure>

      <div className="landing-hero__foreground" data-depth="z2">
        <div
          className="landing-hero__evidence-count"
          role="group"
          aria-label="Evidence count"
        >
          <span>Evidence</span>
          <code>evidence_count: {formatEvidenceCount(landingHeroEvidenceRows.length)}</code>
        </div>
        <div className="landing-hero__risk" role="group" aria-label="Risk signal">
          <span className="landing-hero__risk-label">Risk signal</span>
          <code>reason_code: tool_scope_escalation</code>
        </div>
        <div className="landing-hero__decision" role="group" aria-label="Policy decision">
          <span className="landing-hero__decision-label">Policy gate</span>
          <strong>policy_action: deny</strong>
          <span>containment: active</span>
        </div>
      </div>
    </div>
  );
}
