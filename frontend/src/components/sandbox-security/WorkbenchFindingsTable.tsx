// RISK FINDINGS — a real table, severity-ordered.
//
// Why a table and not the Showcase cascade: this is an operator console. A
// scannable grid puts severity, detector, position and confidence in fixed
// columns so several findings can be compared at a glance, which the reference
// composition also assumes. The Showcase page keeps its cinematic cascade; that
// component is untouched.
//
// Privacy: a subject_ref is a POSITION (source token plus byte range or JSON
// pointer), never content. This component receives no submitted value and the
// summary sentence is derived from `category` alone, so no cell can reconstruct
// a matched snippet.

import { Fragment, useState } from "react";
import { Typography } from "antd";

import type {
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef
} from "../../../../shared/types/sandbox-security";
import { describeSandboxSecurityRiskCategory } from "../../content/sandbox-security-copy";
import { SandboxSecurityValueTag } from "./SandboxSecurityValueTag";
import { detectorShortLabel } from "./detector-id";

const SEVERITY_ORDER: Record<SandboxSecurityFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

/**
 * Shorten a long URI-shaped token from the FRONT, keeping the tail.
 *
 * Real tokens look like `source://sandbox/security/user_input/src-1`: every row
 * shares the long prefix and differs only at the end. CSS `text-overflow`
 * elides the tail — precisely the discriminating part — so all rows render
 * identically. Trimming the head instead keeps rows distinguishable. The
 * disclosure carries every token in full.
 */
function keepTail(token: string, maxChars: number): string {
  return token.length <= maxChars ? token : `…${token.slice(-maxChars)}`;
}

/** Compact position label, e.g. `…user_input/src-1 [128:244]`. Positions only. */
function describePosition(ref: SandboxSecurityFindingSubjectRef): string {
  if (ref.kind === "content_source") {
    const source = keepTail(ref.source_token, 18);
    if (ref.locator.kind === "text_byte_range") {
      return `${source} [${ref.locator.start_byte}:${ref.locator.end_byte}]`;
    }
    if (ref.locator.kind === "json_pointer") {
      return `${source} ${ref.locator.pointer}`;
    }
    return `${source} whole_source`;
  }
  const call = keepTail(ref.call_token, 14);
  if (ref.component === "arguments") {
    const pointer =
      ref.locator.kind === "json_pointer" ? ref.locator.pointer : "whole_arguments";
    return `${call} arguments ${pointer}`;
  }
  return `${call} ${ref.component}`;
}

export interface WorkbenchFindingsTableProps {
  findings: SandboxSecurityFinding[];
}

export function WorkbenchFindingsTable({ findings }: WorkbenchFindingsTableProps) {
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  if (findings.length === 0) {
    return <Typography.Text type="secondary">未产生风险发现。</Typography.Text>;
  }

  const ordered = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <div className="workbench-findings-table__scroll">
      <table className="workbench-findings-table" data-testid="findings-table">
        <caption className="showcase-sr-only">
          风险发现列表，按严重级别排序，仅包含位置引用，不含提交内容。
        </caption>
        <thead>
          <tr>
            <th scope="col" className="workbench-findings-table__num">
              #
            </th>
            <th scope="col">SEVERITY</th>
            <th scope="col">DETECTOR</th>
            <th scope="col">SOURCE</th>
            <th scope="col">FINDING SUMMARY</th>
            <th scope="col" className="workbench-findings-table__conf">
              CONFIDENCE
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((finding, index) => {
            const positions = finding.subject_refs;
            const extraPositions = positions.length - 1;
            const expanded = openFindingId === finding.finding_id;
            const detailId = `finding-detail-${finding.finding_id}`;

            return (
              <Fragment key={finding.finding_id}>
                <tr
                  className="workbench-findings-table__row"
                  data-severity={finding.severity}
                >
                  <td className="workbench-findings-table__num" data-mono="true">
                    {index + 1}
                  </td>
                  <td>
                    <SandboxSecurityValueTag
                      domain="severity"
                      value={finding.severity}
                    />
                  </td>
                  <td
                    data-mono="true"
                    className="workbench-findings-table__detector"
                    title={finding.detector_id}
                  >
                    {detectorShortLabel(finding.detector_id)}
                  </td>
                  <td data-mono="true" className="workbench-findings-table__source">
                    {positions.length > 0 ? describePosition(positions[0]) : "—"}
                    {/* Every finding keeps a disclosure: the fixed columns cannot
                        carry finding_id, reason_code, detector_version, evidence
                        refs, or positions beyond the first. The label counts the
                        hidden positions when there are any. */}
                    <button
                      type="button"
                      className="workbench-findings-table__more"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      onClick={() =>
                        setOpenFindingId(expanded ? null : finding.finding_id)
                      }
                    >
                      {extraPositions > 0 ? `+${extraPositions} 位置` : "详情"}
                    </button>
                  </td>
                  <td className="workbench-findings-table__summary">
                    {/* The category enum renders verbatim beside the sentence so
                        an operator can still correlate the row with backend logs
                        and audit events, per the value-tag convention. */}
                    <SandboxSecurityValueTag
                      domain="category"
                      value={finding.category}
                    />
                    <span className="workbench-findings-table__summary-text">
                      {describeSandboxSecurityRiskCategory(finding.category)}
                    </span>
                  </td>
                  <td className="workbench-findings-table__conf">
                    <span data-mono="true">{finding.confidence.toFixed(2)}</span>
                    <span
                      className="workbench-findings-table__conf-track"
                      aria-hidden="true"
                    >
                      <span
                        className="workbench-findings-table__conf-fill"
                        style={{
                          width: `${Math.min(Math.max(finding.confidence, 0), 1) * 100}%`
                        }}
                      />
                    </span>
                  </td>
                </tr>
                {expanded ? (
                  <tr id={detailId} className="workbench-findings-table__detail">
                    <td colSpan={6}>
                      <dl className="workbench-findings-table__detail-fields">
                        <div>
                          <dt>CATEGORY</dt>
                          <dd data-mono="true">{finding.category}</dd>
                        </div>
                        <div>
                          <dt>REASON CODE</dt>
                          <dd data-mono="true">{finding.reason_code}</dd>
                        </div>
                        <div>
                          <dt>FINDING ID</dt>
                          <dd data-mono="true">{finding.finding_id}</dd>
                        </div>
                        <div>
                          <dt>DETECTOR</dt>
                          <dd data-mono="true">
                            {finding.detector_id}@{finding.detector_version}
                          </dd>
                        </div>
                      </dl>
                      <p className="workbench-findings-table__detail-label">
                        位置引用（仅位置，不含内容）
                      </p>
                      <ul className="workbench-findings-table__positions">
                        {positions.map((ref, refIndex) => (
                          <li key={refIndex} data-mono="true">
                            {describePosition(ref)}
                          </li>
                        ))}
                      </ul>
                      {finding.evidence_refs.length > 0 ? (
                        <>
                          <p className="workbench-findings-table__detail-label">
                            证据引用
                          </p>
                          <ul className="workbench-findings-table__positions">
                            {finding.evidence_refs.map((ref) => (
                              <li key={ref} data-mono="true">
                                {ref}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
