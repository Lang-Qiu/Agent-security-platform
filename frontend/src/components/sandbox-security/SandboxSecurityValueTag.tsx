import { Tag } from "antd";

import { consolePalette } from "../../styles/console-theme";

export type SandboxSecurityValueTagDomain =
  | "verdict"
  | "action"
  | "severity"
  | "risk_level"
  | "category"
  | "stage"
  | "profile"
  | "detector_status"
  | "audit_event_type";

export interface SandboxSecurityValueTagProps {
  domain: SandboxSecurityValueTagDomain;
  value: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  low: consolePalette.severityLow,
  medium: consolePalette.severityMedium,
  high: consolePalette.severityHigh,
  critical: consolePalette.severityCritical
};

const RISK_LEVEL_COLOR: Record<string, string> = {
  info: consolePalette.severityInfo,
  ...SEVERITY_COLOR
};

const ACTION_COLOR: Record<string, string> = {
  allow: consolePalette.actionAllow,
  alert: consolePalette.severityHigh,
  ask: consolePalette.accent,
  deny: consolePalette.actionDeny
};

const VERDICT_COLOR: Record<string, string> = {
  no_detected_risk: consolePalette.actionAllow,
  risk_detected: consolePalette.actionDeny,
  indeterminate: consolePalette.muted
};

function resolveColor(domain: SandboxSecurityValueTagDomain, value: string): string {
  switch (domain) {
    case "severity":
      return SEVERITY_COLOR[value] ?? consolePalette.muted;
    case "risk_level":
      return RISK_LEVEL_COLOR[value] ?? consolePalette.muted;
    case "action":
      return ACTION_COLOR[value] ?? consolePalette.muted;
    case "verdict":
      return VERDICT_COLOR[value] ?? consolePalette.muted;
    case "category":
      return consolePalette.accent;
    case "stage":
    case "profile":
    case "detector_status":
    case "audit_event_type":
      return consolePalette.muted;
    default: {
      const _exhaustive: never = domain;
      return _exhaustive;
    }
  }
}

/**
 * Presentational tag that renders a backend contract value verbatim in English
 * (so an operator can correlate it with backend logs and audit rows) with a
 * semantic colour drawn from the Phase 1 console token module. No hex literal
 * lives in this file; the value text is never transformed into Chinese.
 */
export function SandboxSecurityValueTag({ domain, value }: SandboxSecurityValueTagProps) {
  const color = resolveColor(domain, value);
  const extraProps: Record<string, string> = {};
  if (domain === "severity") {
    extraProps["data-severity"] = value;
  }
  return (
    <Tag
      color={color}
      data-domain={domain}
      {...extraProps}
      style={{ fontFamily: "var(--console-mono)" }}
    >
      {value}
    </Tag>
  );
}
