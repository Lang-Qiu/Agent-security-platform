// DETECTOR EXECUTION — the detector chain as a scannable table.
//
// Every row is one real `SandboxDetectorRun`. Skipped runs stay visible with
// their skip reason rather than being filtered out, because "the policy asked
// for this detector and it did not run" is itself an operator-relevant fact.
//
// The Showcase page keeps `DetectorChain`, whose reveal timing is derived from
// real `elapsed_ms`. Here the same cost is stated numerically in the DURATION
// column, which is the more useful form for comparing runs side by side.

import type { SandboxDetectorRun } from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";

/** Trailing path segment of a detector id, e.g. `instruction-override`. */
function shortName(detectorId: string): string {
  const segments = detectorId.split("/");
  return segments[segments.length - 1] || detectorId;
}

/**
 * The status-specific field, narrowed on `status`: matched/no_match expose
 * `finding_ids`, failed/timeout/invalid_result expose `error_code`, and skipped
 * exposes `skip_reason`.
 */
function describeVariantField(run: SandboxDetectorRun): string {
  switch (run.status) {
    case "matched":
    case "no_match":
      return run.finding_ids.join(", ");
    case "failed":
    case "timeout":
    case "invalid_result":
      return run.error_code;
    case "skipped":
      return run.skip_reason;
    default: {
      const _exhaustive: never = run;
      return _exhaustive;
    }
  }
}

export interface WorkbenchDetectorTableProps {
  runs: SandboxDetectorRun[];
}

export function WorkbenchDetectorTable({ runs }: WorkbenchDetectorTableProps) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="workbench-detector-table__scroll">
      <table className="workbench-detector-table" data-testid="detector-table">
        <caption className="showcase-sr-only">
          检测器执行列表，包含每个检测器的状态、义务与耗时。
        </caption>
        <thead>
          <tr>
            <th scope="col" className="workbench-detector-table__step">
              STEP
            </th>
            <th scope="col">DETECTOR</th>
            <th scope="col">STATUS</th>
            <th scope="col" className="workbench-detector-table__ms">
              DURATION (ms)
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, index) => {
            const variant = describeVariantField(run);
            return (
              <tr
                key={`${run.detector_id}@${run.detector_version}`}
                className="workbench-detector-table__row"
                data-status={run.status}
              >
                <td className="workbench-detector-table__step">
                  <span className="workbench-detector-table__badge" data-mono="true">
                    {index + 1}
                  </span>
                </td>
                <td className="workbench-detector-table__detector">
                  <span data-mono="true">{shortName(run.detector_id)}</span>
                  <span className="workbench-detector-table__meta" data-mono="true">
                    {run.detector_kind} · {run.obligation}
                    {variant === "" ? null : ` · ${variant}`}
                  </span>
                </td>
                <td>
                  <SandboxSecurityValueTag
                    domain="detector_status"
                    value={run.status}
                  />
                </td>
                <td className="workbench-detector-table__ms" data-mono="true">
                  {run.elapsed_ms}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
