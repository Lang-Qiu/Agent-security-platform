import { ReloadOutlined } from "@ant-design/icons";

import {
  runtimeCheckpointOrder,
  type RuntimeCheckpoint
} from "../../content/landing-content";

const checkpointLabels: Readonly<Record<RuntimeCheckpoint, string>> = {
  resolve: "Resolve context",
  detect: "Evaluate detectors",
  decide: "Resolve policy",
  contain: "Contain action"
};

export function RuntimeStageRail({
  checkpoint,
  isPlaying,
  canSelect,
  canReplay,
  onSelect,
  onReplay
}: {
  readonly checkpoint: RuntimeCheckpoint;
  readonly isPlaying: boolean;
  readonly canSelect: boolean;
  readonly canReplay: boolean;
  readonly onSelect: (checkpoint: RuntimeCheckpoint) => void;
  readonly onReplay: () => void;
}) {
  return (
    <div className="landing-runtime__stage-controls">
      <div className="landing-runtime__stage-rail" aria-label="Runtime sequence checkpoints">
        {runtimeCheckpointOrder.map((item, index) => (
          <button
            key={item}
            type="button"
            aria-label={checkpointLabels[item]}
            aria-pressed={checkpoint === item}
            disabled={!canSelect}
            onClick={() => onSelect(item)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item}</strong>
          </button>
        ))}
      </div>
      <button
        className="landing-runtime__replay"
        type="button"
        aria-label="Replay security decision"
        data-playing={String(isPlaying)}
        disabled={!canReplay}
        onClick={onReplay}
      >
        <ReloadOutlined aria-hidden="true" />
        <span>
          {!canReplay
            ? "Static sequence"
            : isPlaying
              ? "Restart sequence"
              : "Replay sequence"}
        </span>
      </button>
    </div>
  );
}
