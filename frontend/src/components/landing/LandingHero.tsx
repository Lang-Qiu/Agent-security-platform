import { Link } from "react-router-dom";

import {
  landingHeroAccessibleSummaryZh,
  landingHeroCopy
} from "../../content/landing-content";
import { useCinematicSequence } from "../../hooks/useCinematicSequence";
import { useLandingInView } from "../../hooks/useLandingInView";
import { useMagneticOffset } from "../../hooks/useMagneticOffset";
import { HeroSecurityWorkbench } from "./HeroSecurityWorkbench";

const dustMarks = ["one", "two", "three", "four", "five", "six"] as const;

function HeroEnvironment() {
  return (
    <div
      className="landing-hero__environment"
      data-depth="z0"
      aria-hidden="true"
    >
      <span className="landing-hero__grid-fragment" />
      <span className="landing-hero__environment-glow" />
      {dustMarks.map((mark) => (
        <span className="landing-hero__dust" data-dust={mark} key={mark} />
      ))}
      <svg
        className="landing-hero__environment-vector"
        viewBox="0 0 520 320"
        role="presentation"
        aria-hidden="true"
      >
        <path d="M4 264h168l76-72h264" />
        <path d="M344 20v88l-56 52" />
      </svg>
    </div>
  );
}

export function LandingHero() {
  const inView = useLandingInView<HTMLElement>();
  const sequence = useCinematicSequence({
    isInView: inView.isInView,
    reducedMotion: inView.isMotionEnhancementAvailable ? undefined : true
  });
  const magnetic = useMagneticOffset<HTMLAnchorElement>();

  return (
    <section
      ref={inView.ref}
      className="landing-hero"
      data-hero-phase={sequence.phase}
      data-in-view={String(inView.isInView)}
      aria-labelledby="landing-hero-title"
    >
      <HeroEnvironment />

      <div
        className="landing-hero__mobile-cue"
        data-testid="hero-next-section-cue"
        aria-hidden="true"
        lang="en"
      >
        <span>01 / Discover</span>
      </div>

      <div className="landing-hero__copy">
        <p className="landing-eyebrow" lang="en">{landingHeroCopy.eyebrow}</p>
        <h1 className="landing-hero__title" id="landing-hero-title" lang="en">
          {landingHeroCopy.headingEn}
        </h1>
        <p className="landing-hero__body">{landingHeroCopy.bodyZh}</p>
        <p className="landing-hero__accessible-summary">{landingHeroAccessibleSummaryZh}</p>
        <div className="landing-actions">
          <Link
            ref={magnetic.ref}
            className="landing-hero__primary-action"
            lang="en"
            to="/console"
            onPointerMove={magnetic.onPointerMove}
            onPointerLeave={magnetic.onPointerLeave}
          >
            {landingHeroCopy.primaryAction}
          </Link>
          <a className="landing-hero__secondary-action" href="#discover" lang="en">
            {landingHeroCopy.secondaryAction}
          </a>
        </div>
        <p className="landing-metadata landing-hero__micro-proof" lang="en">
          {landingHeroCopy.microProof}
        </p>
      </div>

      <div className="landing-hero__product-rail">
        <HeroSecurityWorkbench phase={sequence.phase} />
      </div>
    </section>
  );
}
