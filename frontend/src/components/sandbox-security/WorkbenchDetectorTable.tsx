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
import { detectorShortLabel } from "./detector-id";

/**
 * Milliseconds as an integer. The engine reports `elapsed_ms` as a float from a
 * monotonic clock (e.g. 82.48789799993392); a duration column showing fourteen
 * decimals is unreadable and implies precision the measurement does not have.
 */
function durationMs(elapsedMs: number): string {
  return Number.isFinite(elapsedMs) ? String(Math.round(elapsedMs)) : "—";
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
                  <span data-mono="true" title={run.detector_id}>
                    {detectorShortLabel(run.detector_id)}
                  </span>
                  {/* `detector_kind` is what the label above already resolves to
                      for stock slots, so repeating it here would waste the only
                      line this cell has. Obligation and the status-specific
                      field are what the label cannot express. */}
                  <span className="workbench-detector-table__meta" data-mono="true">
                    {run.obligation}
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
                  {durationMs(run.elapsed_ms)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
