import { useState } from "react";

import {
  landingAttackSurfaceCopy,
  landingAttackSurfaceEvidence,
  type AttackSurfaceEvidenceId
} from "../../content/landing-content";
import type { DiscoverScanState } from "../../hooks/useNarrativeSequence";
import { EvidenceTrace } from "./EvidenceTrace";
import { ProductSurfaceFrame } from "./ProductSurfaceFrame";

export function AttackSurfaceMap({
  scanState
}: {
  readonly scanState: DiscoverScanState;
}) {
  const [selectedId, setSelectedId] = useState<AttackSurfaceEvidenceId>("agent");
  const selectedEvidence =
    landingAttackSurfaceEvidence.find((evidence) => evidence.id === selectedId) ??
    landingAttackSurfaceEvidence[0];

  const selectEvidence = (id: AttackSurfaceEvidenceId) => setSelectedId(id);

  return (
    <ProductSurfaceFrame
      label={landingAttackSurfaceCopy.frameLabel}
      chrome={
        <div className="landing-attack-surface__chrome" lang="en">
          <div>
            <span>{landingAttackSurfaceCopy.chromeLabel}</span>
            <h3>{landingAttackSurfaceCopy.frameLabel}</h3>
          </div>
          <span>{landingAttackSurfaceCopy.scenarioLabel}</span>
        </div>
      }
    >
      <div
        className="landing-attack-surface"
        data-scan-state={scanState}
        data-selected-evidence={selectedId}
      >
        <div className="landing-attack-surface__map">
          <span className="landing-attack-surface__coordinate" aria-hidden="true">
            X 38.14 / Y 07.22
          </span>
          <svg
            className="landing-attack-surface__paths"
            viewBox="0 0 640 430"
            role="presentation"
            aria-hidden="true"
          >
            <path d="M318 216L116 88M318 216L514 88M318 216L104 338M318 216L532 338" />
            <path d="M116 88L514 88M104 338L532 338" />
            <circle cx="318" cy="216" r="92" />
          </svg>
          <span className="landing-attack-surface__scan-aperture" aria-hidden="true" />

          <div className="landing-attack-surface__nodes" aria-label="Attack surface nodes">
            {landingAttackSurfaceEvidence.map((evidence) => (
              <button
                key={evidence.id}
                className="landing-attack-surface__node"
                data-node={evidence.id}
                data-selected={String(evidence.id === selectedId)}
                type="button"
                aria-label={`Inspect ${evidence.type} evidence`}
                aria-pressed={evidence.id === selectedId}
                onFocus={() => selectEvidence(evidence.id)}
                onPointerEnter={() => selectEvidence(evidence.id)}
                onClick={() => selectEvidence(evidence.id)}
              >
                <span>{evidence.type}</span>
                <code>{evidence.identifier}</code>
              </button>
            ))}
          </div>

          <div
            className="landing-attack-surface__selection"
            aria-label="Selected evidence definition"
          >
            <span>{landingAttackSurfaceCopy.selectedLabel}</span>
            <code>{selectedEvidence.identifier}</code>
            <p data-testid="discover-selected-definition">
              {selectedEvidence.definition}
            </p>
          </div>
        </div>

        <div className="landing-attack-surface__evidence">
          <span className="landing-metadata" lang="en">
            {landingAttackSurfaceCopy.productLabel}
          </span>
          <ul aria-label={landingAttackSurfaceCopy.evidenceListLabel}>
            {landingAttackSurfaceEvidence.map((evidence, index) => (
              <li key={evidence.id} data-selected={String(evidence.id === selectedId)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{evidence.type}</strong>
                  <code>{evidence.identifier}</code>
                </div>
                <span>{evidence.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="landing-attack-surface__trace" aria-hidden="true">
          <code>{landingAttackSurfaceCopy.handoffIdentifier}</code>
          <EvidenceTrace />
        </div>
      </div>
    </ProductSurfaceFrame>
  );
}
