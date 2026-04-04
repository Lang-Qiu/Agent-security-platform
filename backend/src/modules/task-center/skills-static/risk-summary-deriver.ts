import type { SkillsStaticResultDetails } from "../../../../../shared/types/result.ts";
import type { RiskLevel } from "../../../../../shared/types/task.ts";

export interface StaticAnalysisDerivedRiskSummary {
  risk_level: RiskLevel;
  total_findings: number;
  info_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  critical_count: number;
}

export function deriveStaticAnalysisRiskSummary(
  details: SkillsStaticResultDetails
): StaticAnalysisDerivedRiskSummary {
  const ruleHits = details.rule_hits ?? [];
  const info_count = ruleHits.filter((ruleHit) => ruleHit.severity === "info").length;
  const low_count = ruleHits.filter((ruleHit) => ruleHit.severity === "low").length;
  const medium_count = ruleHits.filter((ruleHit) => ruleHit.severity === "medium").length;
  const high_count = ruleHits.filter((ruleHit) => ruleHit.severity === "high").length;
  const critical_count = ruleHits.filter((ruleHit) => ruleHit.severity === "critical").length;
  const total_findings = ruleHits.length;

  let risk_level: RiskLevel = "info";

  if (critical_count > 0) {
    risk_level = "critical";
  } else if (high_count > 0) {
    risk_level = "high";
  } else if (medium_count > 0) {
    risk_level = "medium";
  } else if (low_count > 0) {
    risk_level = "low";
  }

  return {
    risk_level,
    total_findings,
    info_count,
    low_count,
    medium_count,
    high_count,
    critical_count
  };
}
