import { Link } from "react-router-dom";

import { landingFinalCta, landingHeroCopy } from "../../content/landing-content";

export function LandingCta() {
  return (
    <section
      className="landing-final-cta"
      aria-label="Ready to evaluate"
    >
      <p className="landing-eyebrow" lang="en">{landingFinalCta.eyebrow}</p>
      <h2 id="landing-final-cta-title" lang="en">{landingFinalCta.headingEn}</h2>
      <p>{landingFinalCta.bodyZh}</p>
      <div className="landing-final-cta__actions">
        <Link className="landing-final-cta__primary" to="/console">
          {landingHeroCopy.primaryAction}
        </Link>
        <a className="landing-final-cta__secondary" href="#runtime">
          Explore Runtime
        </a>
      </div>
    </section>
  );
}
