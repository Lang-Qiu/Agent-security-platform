const evidencePlanes = [
  { index: "01", label: "Discover", identifier: "asset_scan" },
  { index: "02", label: "Analyze", identifier: "skills_static" },
  { index: "03", label: "Contain", identifier: "sandbox" }
] as const;

export function EvidenceRail() {
  return (
    <section className="landing-evidence-rail" aria-label="Security layers">
      <span className="landing-evidence-rail__rule" aria-hidden="true" />
      <ol className="landing-evidence-rail__list">
        {evidencePlanes.map((plane) => (
          <li className="landing-evidence-rail__item" key={plane.identifier}>
            <span className="landing-evidence-rail__index">{plane.index}</span>
            <span className="landing-evidence-rail__label">{plane.label}</span>
            <code>{plane.identifier}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
