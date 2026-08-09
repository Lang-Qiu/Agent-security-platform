// Findings cascade with a shared-element expansion.
//
// Two Motion capabilities carry this component:
//
// 1. Severity-ordered stagger. Findings arrive critical-first, so the eye is
//    drawn to the worst result before the rest of the list exists.
// 2. `layoutId` shared element. Clicking a row does not fade in a separate
//    modal; the row itself grows into the detail surface and collapses back
//    along the same path on dismiss. Enter and exit share one path, which is
//    the spatial-consistency rule from Apple's fluid-interface talks.
//
// Privacy: a subject_ref is a POSITION (source token + byte range or JSON
// pointer), never content. The detail surface renders those positions verbatim
// and has no access to the submitted value, so there is nothing here that could
// reconstruct a matched snippet.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Typography } from "antd";

import type {
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef
} from "../../../../../shared/types/sandbox-security";
import { SandboxSecurityValueTag } from "../SandboxSecurityValueTag";
import { CALM_SPRING, MOMENTUM_SPRING, REDUCED_TRANSITION } from "./showcase-motion";

const { Text } = Typography;

const SEVERITY_ORDER: Record<SandboxSecurityFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

/** Renders one position reference. Positions only — never content. */
function describePosition(ref: SandboxSecurityFindingSubjectRef): string {
  if (ref.kind === "content_source") {
    if (ref.locator.kind === "text_byte_range") {
      return `${ref.source_token} · 字节 ${ref.locator.start_byte}–${ref.locator.end_byte}`;
    }
    if (ref.locator.kind === "json_pointer") {
      return `${ref.source_token} · ${ref.locator.pointer}`;
    }
    return `${ref.source_token} · whole_source`;
  }
  if (ref.component === "arguments") {
    const pointer =
      ref.locator.kind === "json_pointer" ? ref.locator.pointer : "whole_arguments";
    return `${ref.call_token} · arguments · ${pointer}`;
  }
  return `${ref.call_token} · ${ref.component}`;
}

export interface FindingsCascadeProps {
  findings: SandboxSecurityFinding[];
  /** Whether the cascade has been released. */
  active: boolean;
  reduceMotion: boolean;
}

export function FindingsCascade({
  findings,
  active,
  reduceMotion
}: FindingsCascadeProps) {
  const [openFindingId, setOpenFindingId] = useState<string | null>(null);

  const ordered = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  const openFinding = ordered.find((f) => f.finding_id === openFindingId) ?? null;

  // Same reasoning as VerdictHero: a finding that is present but transparent is
  // still announced by a screen reader and still matched by a text query, which
  // would claim a risk before the replay has produced it.
  if (!active) {
    return (
      <div className="showcase-cascade showcase-cascade--idle">
        <Text type="secondary">演示开始后，风险发现将按严重级别依次展开。</Text>
      </div>
    );
  }

  return (
    <div className="showcase-cascade">
      <ul className="showcase-cascade__list">
        {ordered.map((finding, index) => (
          <li key={finding.finding_id} className="showcase-cascade__item">
            {/* layoutId pairs this row with the expanded surface below, so the
                row itself becomes the detail rather than being replaced by it. */}
            <motion.button
              type="button"
              layoutId={reduceMotion ? undefined : `finding-${finding.finding_id}`}
              className="showcase-cascade__row"
              data-severity={finding.severity}
              aria-expanded={openFindingId === finding.finding_id}
              onClick={() =>
                setOpenFindingId(
                  openFindingId === finding.finding_id ? null : finding.finding_id
                )
              }
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14 }}
              animate={
                active
                  ? reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, x: 0 }
                  : reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -14 }
              }
              transition={
                reduceMotion
                  ? REDUCED_TRANSITION
                  : { ...MOMENTUM_SPRING, delay: index * 0.08 }
              }
            >
              <span className="showcase-cascade__severity-stripe" aria-hidden="true" />
              <SandboxSecurityValueTag domain="severity" value={finding.severity} />
              <SandboxSecurityValueTag domain="category" value={finding.category} />
              <span className="showcase-cascade__confidence">
                置信度 {finding.confidence.toFixed(2)}
              </span>
            </motion.button>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {openFinding ? (
          <>
            {/* Dim to focus: the detail is a modal task, so the surface behind
                it is pushed back rather than left competing for attention. */}
            <motion.div
              className="showcase-cascade__scrim"
              onClick={() => setOpenFindingId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? REDUCED_TRANSITION : { duration: 0.2 }}
            />
            <motion.div
              layoutId={
                reduceMotion ? undefined : `finding-${openFinding.finding_id}`
              }
              className="showcase-cascade__detail console-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`风险发现详情 ${openFinding.category}`}
              transition={reduceMotion ? REDUCED_TRANSITION : CALM_SPRING}
            >
              <div className="showcase-cascade__detail-tags">
                <SandboxSecurityValueTag
                  domain="severity"
                  value={openFinding.severity}
                />
                <SandboxSecurityValueTag
                  domain="category"
                  value={openFinding.category}
                />
              </div>

              <dl className="showcase-cascade__detail-fields">
                <div>
                  <dt>
                    <Text type="secondary">原因码</Text>
                  </dt>
                  <dd data-mono="true">{openFinding.reason_code}</dd>
                </div>
                <div>
                  <dt>
                    <Text type="secondary">检测器</Text>
                  </dt>
                  <dd data-mono="true">
                    {openFinding.detector_id}@{openFinding.detector_version}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Text type="secondary">置信度</Text>
                  </dt>
                  <dd data-mono="true">{openFinding.confidence.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>
                    <Text type="secondary">发现标识</Text>
                  </dt>
                  <dd data-mono="true" className="showcase-cascade__wrap">
                    {openFinding.finding_id}
                  </dd>
                </div>
              </dl>

              <Text type="secondary">位置引用（仅位置，不含内容）</Text>
              <ul className="showcase-cascade__positions">
                {openFinding.subject_refs.map((ref, index) => (
                  <li key={index} data-mono="true" className="showcase-cascade__wrap">
                    {describePosition(ref)}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="showcase-cascade__close"
                onClick={() => setOpenFindingId(null)}
              >
                收起详情
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
