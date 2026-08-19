// DETECTOR EXECUTION — the evaluation pipeline as a scannable table.
//
// Base view: every row is one real `SandboxDetectorRun`. Skipped runs stay
// visible with their skip reason rather than being filtered out, because "the
// policy asked for this detector and it did not run" is itself an
// operator-relevant fact.
//
// Pipeline view (when `decision` + `requestFacts` are provided): the reference
// panel reads as six sequential steps. The decision contract only carries
// three detector runs, so the surrounding steps — source intake, policy
// reduction, judgment — are derived from the same decision and request facts
// the ExecutionTrace uses. No detector data is fabricated: derived rows carry
// decision facts only, and every real run keeps its true status and cost.
//
// The Showcase page keeps `DetectorChain`, whose reveal timing is derived from
// real `elapsed_ms`. Here the same cost is stated numerically in the DURATION
// column, which is the more useful form for comparing runs side by side.

import type {
  SandboxDetectorRun,
  SandboxSecurityDecision
} from "../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";
import { detectorShortLabel } from "./detector-id";
import type { EvaluationRequestFacts } from "./ExecutionTrace";

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
  /** When present (with requestFacts), render the six-step pipeline view. */
  decision?: SandboxSecurityDecision;
  requestFacts?: EvaluationRequestFacts;
}

interface PipelineRow {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly status: string;
  readonly durationMs: string | null;
  readonly title?: string;
}

function derivePipelineRows(
  runs: readonly SandboxDetectorRun[],
  decision: SandboxSecurityDecision,
  requestFacts: EvaluationRequestFacts
): PipelineRow[] {
  const detectorRows: PipelineRow[] = runs.map((run) => ({
    key: `${run.detector_id}@${run.detector_version}`,
    label: detectorShortLabel(run.detector_id),
    meta: `${run.obligation}${
      describeVariantField(run) === "" ? "" : ` · ${describeVariantField(run)}`
    }`,
    status: run.status,
    durationMs: durationMs(run.elapsed_ms),
    title: run.detector_id
  }));

  const riskDetected = decision.verdict === "risk_detected";
  return [
    {
      key: "sources_bound",
      label: "SOURCE INTAKE",
      meta: `${requestFacts.sourceCount} sources · ${requestFacts.requestBytes} B`,
      status: "no_match",
      durationMs: null
    },
    ...detectorRows,
    {
      key: "policy_reduction",
      label: "POLICY REDUCTION",
      meta: decision.policy_profile_id,
      status: "no_match",
      durationMs: null
    },
    {
      key: "judgment_complete",
      label: "JUDGMENT",
      meta: `${decision.verdict} · ${decision.action} · ${decision.risk_level}`,
      status: riskDetected ? "matched" : "no_match",
      durationMs: null
    }
  ];
}

export function WorkbenchDetectorTable({
  runs,
  decision,
  requestFacts
}: WorkbenchDetectorTableProps) {
  if (runs.length === 0) {
    return null;
  }

  const pipeline =
    decision !== undefined && requestFacts !== undefined
      ? derivePipelineRows(runs, decision, requestFacts)
      : null;

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
          {pipeline !== null
            ? pipeline.map((row, index) => (
                <tr
                  key={row.key}
                  className="workbench-detector-table__row"
                  data-status={row.status}
                  data-step-derived={row.durationMs === null ? "true" : undefined}
                >
                  <td className="workbench-detector-table__step">
                    <span className="workbench-detector-table__badge" data-mono="true">
                      {index + 1}
                    </span>
                  </td>
                  <td className="workbench-detector-table__detector">
                    <span title={row.title ?? row.label}>{row.label}</span>
                    <span className="workbench-detector-table__meta" data-mono="true">
                      {row.meta}
                    </span>
                  </td>
                  <td>
                    <SandboxSecurityValueTag
                      domain="detector_status"
                      value={row.status}
                    />
                  </td>
                  <td className="workbench-detector-table__ms" data-mono="true">
                    {row.durationMs ?? "—"}
                  </td>
                </tr>
              ))
            : runs.map((run, index) => {
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
