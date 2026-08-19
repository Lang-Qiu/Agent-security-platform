import {
  landingRuntimeCopy,
  runtimeCheckpointOrder,
  runtimeScenario,
  type RuntimeCheckpoint
} from "../../content/landing-content";
import type { RuntimeSequencePhase } from "../../hooks/useCinematicSequence";
import type { RuntimeStageOwner } from "../../hooks/useRuntimeStage";
import { ProductSurfaceFrame } from "./ProductSurfaceFrame";
import { RuntimeStageRail } from "./RuntimeStageRail";

const checkpointRank: Readonly<Record<RuntimeCheckpoint, number>> = {
  resolve: 0,
  detect: 1,
  decide: 2,
  contain: 3
};

function evidenceCount(): string {
  return runtimeScenario.evidenceRefs.length.toString().padStart(2, "0");
}

function detectorStatus(
  checkpoint: RuntimeCheckpoint,
  phase: RuntimeSequencePhase
): "standby" | "evaluating" | "complete" {
  if (phase === "detectors") return "evaluating";
  if (
    checkpointRank[checkpoint] >= checkpointRank.detect ||
    ["evidence", "policy", "decision"].includes(phase)
  ) {
    return "complete";
  }
  return "standby";
}

export function RuntimeDecisionStage({
  checkpoint,
  phase,
  owner,
  isPlaying,
  canReplay,
  sentinelRefs,
  onSelect,
  onReplay
}: {
  readonly checkpoint: RuntimeCheckpoint;
  readonly phase: RuntimeSequencePhase;
  readonly owner: RuntimeStageOwner;
  readonly isPlaying: boolean;
  readonly canReplay: boolean;
  readonly sentinelRefs: Readonly<
    Record<RuntimeCheckpoint, (node: HTMLElement | null) => void>
  >;
  readonly onSelect: (checkpoint: RuntimeCheckpoint) => void;
  readonly onReplay: () => void;
}) {
  const hasDecision =
    checkpointRank[checkpoint] >= checkpointRank.decide &&
    (owner === "direct" || phase === "decision" || phase === "settled");
  const isContained = checkpoint === "contain" && phase === "settled";
  const currentDetectorStatus = detectorStatus(checkpoint, phase);

  return (
    <div className="landing-runtime__story">
      <div className="landing-runtime__scene">
        <ProductSurfaceFrame
          label={landingRuntimeCopy.sceneLabel}
          chrome={
            <div className="landing-runtime__chrome" lang="en">
              <div>
                <span>{landingRuntimeCopy.chromeLabel}</span>
                <h3>{landingRuntimeCopy.sceneLabel}</h3>
              </div>
              <div className="landing-runtime__chrome-meta">
                <span>{landingRuntimeCopy.illustrativeLabel}</span>
                <code>{landingRuntimeCopy.evaluationMode}</code>
                <code>{runtimeScenario.traceId}</code>
              </div>
            </div>
          }
        >
          <div
            className="landing-runtime__workspace"
            data-checkpoint={checkpoint}
            data-phase={phase}
            data-owner={owner}
            lang="en"
          >
            <RuntimeStageRail
              checkpoint={checkpoint}
              isPlaying={isPlaying}
              canSelect={canReplay}
              canReplay={canReplay}
              onSelect={onSelect}
              onReplay={onReplay}
            />

            <div className="landing-runtime__causal-stage">
              <section className="landing-runtime__input" aria-label="Runtime input event">
                <div className="landing-runtime__panel-label">
                  <span>01</span>
                  <strong>{landingRuntimeCopy.inputLabel}</strong>
                </div>
                <code>{runtimeScenario.eventType}</code>
                <dl>
                  <div><dt>actor</dt><dd>{runtimeScenario.actor}</dd></div>
                  <div><dt>target</dt><dd>{runtimeScenario.target}</dd></div>
                  <div><dt>identity</dt><dd>identity_context</dd></div>
                  <div><dt>provenance</dt><dd>skill_provenance</dd></div>
                  <div><dt>scope</dt><dd>tool_scope</dd></div>
                </dl>
              </section>

              <svg
                className="landing-runtime__signal"
                viewBox="0 0 920 350"
                role="presentation"
                aria-hidden="true"
              >
                <path d="M136 175H300M406 175H500M500 175L594 68M500 175H594M500 175l94 107M714 68l90 107M714 175h90M714 282l90-107" />
                <circle cx="500" cy="175" r="7" />
              </svg>
              <span className="landing-runtime__signal-head" aria-hidden="true" />

              <section className="landing-runtime__resolver" aria-label="Trust Resolver">
                <div className="landing-runtime__panel-label">
                  <span>02</span>
                  <strong>{landingRuntimeCopy.resolverLabel}</strong>
                </div>
                <code>declared_scope: {runtimeScenario.declaredScope}</code>
                <code>requested_scope: {runtimeScenario.requestedScope}</code>
                <span className="landing-runtime__resolver-state">context resolved</span>
              </section>

              <section className="landing-runtime__detectors" aria-label="Runtime detectors">
                <div className="landing-runtime__panel-label">
                  <span>03</span>
                  <strong>{landingRuntimeCopy.detectorsLabel}</strong>
                </div>
                <ul>
                  {runtimeScenario.detectors.map((detector) => (
                    <li key={detector} data-detector-status={currentDetectorStatus}>
                      <span aria-hidden="true" />
                      <code>{detector}</code>
                      <strong>{currentDetectorStatus}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="landing-runtime__evidence" aria-label="Runtime evidence convergence">
                <div className="landing-runtime__panel-label">
                  <span>04</span>
                  <strong>{landingRuntimeCopy.evidenceLabel}</strong>
                </div>
                <ol>
                  {runtimeScenario.evidenceRefs.map((evidenceRef) => (
                    <li key={evidenceRef} data-testid="runtime-evidence-ref">
                      <span aria-hidden="true" />
                      <code>{evidenceRef}</code>
                    </li>
                  ))}
                </ol>
              </section>

              <section
                className="landing-runtime__policy"
                data-resolved={String(hasDecision)}
                aria-label="Runtime Policy Gate"
              >
                <div className="landing-runtime__decision-ring" aria-hidden="true" />
                <div className="landing-runtime__panel-label">
                  <span>05</span>
                  <strong>{landingRuntimeCopy.policyLabel}</strong>
                </div>
                <code>{runtimeScenario.policyProfile}</code>
                {hasDecision ? (
                  <div className="landing-runtime__decision-result">
                    <span>evidence_refs: {evidenceCount()}</span>
                    <strong>policy_action: {runtimeScenario.policyAction}</strong>
                    {isContained ? <span>containment: {runtimeScenario.containment}</span> : null}
                  </div>
                ) : (
                  <span className="landing-runtime__policy-pending">
                    {phase === "policy" ? "resolving evidence" : "awaiting evidence"}
                  </span>
                )}
              </section>
            </div>

            <div className="landing-runtime__result-copy" data-visible={String(isContained)}>
              <span lang="zh-CN">{landingRuntimeCopy.resolvedZh}</span>
            </div>
          </div>
        </ProductSurfaceFrame>
      </div>

      <div className="landing-runtime__sentinels" aria-hidden="true">
        {runtimeCheckpointOrder.map((runtimeCheckpoint) => (
          <span
            key={runtimeCheckpoint}
            ref={sentinelRefs[runtimeCheckpoint]}
            data-runtime-sentinel={runtimeCheckpoint}
          />
        ))}
      </div>
    </div>
  );
}
