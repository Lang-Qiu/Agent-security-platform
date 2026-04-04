import type { BaseResult, StaticAnalysisResultDetails } from "../../shared/types/result.ts";
import type { SkillsStaticRuleHit } from "../../shared/types/skills-static-rule-hit.ts";
import type { RiskLevel, RiskSummary, Task } from "../../shared/types/task.ts";

export const STATIC_ANALYSIS_PENDING_SUMMARY = "Task accepted and waiting for engine dispatch";

export const CANONICAL_STATIC_ANALYSIS_RULE_HITS: SkillsStaticRuleHit[] = [
  {
    rule_id: "SA001",
    title: "Shell command reaches an execution sink",
    category: "command_execution",
    severity: "high",
    message: "User-controlled input reaches a shell execution sink",
    file_path: "src/commands.ts",
    line_start: 18,
    line_end: 22,
    code_snippet: "exec(commandInput)",
    recommendation: "Replace shell execution with an allowlisted wrapper",
    source_type: "user_input",
    sink_type: "command_execution",
    tags: ["command", "input-flow"]
  },
  {
    rule_id: "SA002",
    title: "Outbound network request lacks destination allowlist",
    category: "network_access",
    severity: "medium",
    message: "Static analysis found outbound fetch without destination validation",
    file_path: "src/network.ts",
    line_start: 7,
    line_end: 9,
    code_snippet: "fetch(targetUrl)",
    recommendation: "Restrict outbound destinations to an allowlist",
    source_type: "config",
    sink_type: "network_request",
    tags: ["network", "egress"]
  }
];

export const CANONICAL_STATIC_ANALYSIS_DETAILS: StaticAnalysisResultDetails = {
  sample_name: "canonical-skill-package",
  language: "typescript",
  entry_files: ["src/index.ts", "src/network.ts"],
  files_scanned: 4,
  rule_hits: CANONICAL_STATIC_ANALYSIS_RULE_HITS,
  sensitive_capabilities: ["command_execution", "network_access"],
  dependency_summary: {
    manifest_count: 1,
    dependency_count: 4
  }
};

export const CANONICAL_STATIC_ANALYSIS_CREATED_TASK: Task = {
  task_id: "task_static_contract_001",
  task_type: "static_analysis",
  engine_type: "skills_static",
  status: "pending",
  title: "Analyze canonical skill package",
  target: {
    target_type: "skill_package",
    target_value: "samples/skills/canonical-skill-package",
    display_name: "canonical-skill-package"
  },
  parameters: {
    language: "typescript",
    include_paths: ["src/**/*.ts"],
    include_dependencies: true
  },
  risk_level: "info",
  summary: STATIC_ANALYSIS_PENDING_SUMMARY,
  created_at: "2026-04-02T01:00:00Z",
  updated_at: "2026-04-02T01:00:00Z"
};

export function summarizeStaticAnalysisRuleHits(ruleHits: SkillsStaticRuleHit[]): {
  risk_level: RiskLevel;
  total_findings: number;
  info_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  critical_count: number;
} {
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

export function createCanonicalStaticAnalysisSummary(ruleHits: SkillsStaticRuleHit[]): string {
  return `Static analysis completed with ${ruleHits.length} finding${ruleHits.length === 1 ? "" : "s"}`;
}

export function createCanonicalStaticAnalysisFinishedTask(updatedAt: string): Task {
  return {
    ...CANONICAL_STATIC_ANALYSIS_CREATED_TASK,
    status: "finished",
    risk_level: summarizeStaticAnalysisRuleHits(CANONICAL_STATIC_ANALYSIS_RULE_HITS).risk_level,
    summary: createCanonicalStaticAnalysisSummary(CANONICAL_STATIC_ANALYSIS_RULE_HITS),
    updated_at: updatedAt
  };
}

export function createCanonicalStaticAnalysisBaseResult(updatedAt: string): BaseResult<StaticAnalysisResultDetails> {
  return {
    task_id: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.task_id,
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "finished",
    risk_level: summarizeStaticAnalysisRuleHits(CANONICAL_STATIC_ANALYSIS_RULE_HITS).risk_level,
    summary: createCanonicalStaticAnalysisSummary(CANONICAL_STATIC_ANALYSIS_RULE_HITS),
    details: CANONICAL_STATIC_ANALYSIS_DETAILS,
    created_at: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.created_at,
    updated_at: updatedAt
  };
}

export function createCanonicalStaticAnalysisRiskSummary(updatedAt: string): RiskSummary {
  const counts = summarizeStaticAnalysisRuleHits(CANONICAL_STATIC_ANALYSIS_RULE_HITS);

  return {
    task_id: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.task_id,
    task_type: "static_analysis",
    status: "finished",
    risk_level: counts.risk_level,
    summary: createCanonicalStaticAnalysisSummary(CANONICAL_STATIC_ANALYSIS_RULE_HITS),
    total_findings: counts.total_findings,
    info_count: counts.info_count,
    low_count: counts.low_count,
    medium_count: counts.medium_count,
    high_count: counts.high_count,
    critical_count: counts.critical_count,
    updated_at: updatedAt
  };
}
