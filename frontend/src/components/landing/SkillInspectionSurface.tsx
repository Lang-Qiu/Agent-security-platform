import { useState } from "react";

import {
  landingSkillInspectionCopy,
  landingSkillInspectionEvidence,
  type SkillInspectionEvidenceId
} from "../../content/landing-content";
import type { AnalyzeFocusState } from "../../hooks/useNarrativeSequence";
import { EvidenceTrace } from "./EvidenceTrace";
import { ProductSurfaceFrame } from "./ProductSurfaceFrame";

const layerByEvidence: Readonly<Record<SkillInspectionEvidenceId, "back" | "middle" | "front">> = {
  manifest: "back",
  dependency: "back",
  permission: "middle",
  invocation: "middle",
  reason: "front"
};

export function SkillInspectionSurface({
  automaticFocus
}: {
  readonly automaticFocus: AnalyzeFocusState;
}) {
  const [userSelectedId, setUserSelectedId] =
    useState<SkillInspectionEvidenceId | null>(null);
  const selectedId = userSelectedId ?? automaticFocus;
  const selectedEvidence =
    landingSkillInspectionEvidence.find((evidence) => evidence.id === selectedId) ??
    landingSkillInspectionEvidence[0];

  const selectEvidence = (id: SkillInspectionEvidenceId) => setUserSelectedId(id);

  return (
    <ProductSurfaceFrame
      label={landingSkillInspectionCopy.frameLabel}
      chrome={
        <div className="landing-skill-inspection__chrome" lang="en">
          <div>
            <span>{landingSkillInspectionCopy.chromeLabel}</span>
            <strong>{landingSkillInspectionCopy.outputLabel}</strong>
          </div>
          <span>{landingSkillInspectionCopy.productLabel}</span>
        </div>
      }
    >
      <div
        className="landing-skill-inspection"
        data-selected-inspection={selectedId}
        data-automatic-focus={automaticFocus}
      >
        <div className="landing-skill-inspection__entry" aria-hidden="true">
          <code>{landingSkillInspectionCopy.incomingIdentifier}</code>
          <EvidenceTrace />
        </div>

        <div className="landing-skill-inspection__stack">
          {(["back", "middle", "front"] as const).map((layer) => (
            <div
              className={`landing-skill-inspection__layer landing-skill-inspection__layer--${layer}`}
              data-layer={layer}
              key={layer}
            >
              {landingSkillInspectionEvidence
                .filter((evidence) => layerByEvidence[evidence.id] === layer)
                .map((evidence) => (
                  <article
                    key={evidence.id}
                    className="landing-skill-inspection__pane"
                    data-inspection-pane={evidence.id}
                    data-selected={String(evidence.id === selectedId)}
                    data-testid="inspection-pane"
                  >
                    <header>
                      <div>
                        <span className="landing-metadata">{layer.toUpperCase()} LAYER</span>
                        <h3>{evidence.title}</h3>
                      </div>
                      <button
                        type="button"
                        aria-label={`Inspect ${evidence.title} evidence`}
                        aria-pressed={evidence.id === selectedId}
                        onFocus={() => selectEvidence(evidence.id)}
                        onPointerEnter={() => selectEvidence(evidence.id)}
                        onClick={() => selectEvidence(evidence.id)}
                      >
                        Inspect
                      </button>
                    </header>
                    <code>{evidence.identifier}</code>
                    <p>{evidence.value}</p>
                  </article>
                ))}
            </div>
          ))}
        </div>

        <div
          className="landing-skill-inspection__selection"
          aria-label="Selected inspection definition"
        >
          <span>{landingSkillInspectionCopy.selectedLabel}</span>
          <code>{selectedEvidence.identifier}</code>
          <p data-testid="inspection-selected-definition">
            {selectedEvidence.definition}
          </p>
        </div>

        <div className="landing-skill-inspection__exit" aria-hidden="true">
          <EvidenceTrace />
          <code>{landingSkillInspectionCopy.outgoingIdentifier}</code>
        </div>
      </div>
    </ProductSurfaceFrame>
  );
}
