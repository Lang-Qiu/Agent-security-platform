import type { BaseResult, StaticAnalysisResultDetails } from "../../shared/types/result.ts";
import type { SkillsStaticRuleHit } from "../../shared/types/skills-static-rule-hit.ts";
import type { RiskSummary, Task } from "../../shared/types/task.ts";

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

export const CANONICAL_STATIC_ANALYSIS_COMPLETED_SUMMARY = "Static analysis completed with 2 findings";

export const CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY = {
  risk_level: "high" as const,
  total_findings: 2,
  info_count: 0,
  low_count: 0,
  medium_count: 1,
  high_count: 1,
  critical_count: 0
};

export function createCanonicalStaticAnalysisFinishedTask(updatedAt: string): Task {
  return {
    ...CANONICAL_STATIC_ANALYSIS_CREATED_TASK,
    status: "finished",
    risk_level: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.risk_level,
    summary: CANONICAL_STATIC_ANALYSIS_COMPLETED_SUMMARY,
    updated_at: updatedAt
  };
}

export function createCanonicalStaticAnalysisBaseResult(updatedAt: string): BaseResult<StaticAnalysisResultDetails> {
  return {
    task_id: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.task_id,
    task_type: "static_analysis",
    engine_type: "skills_static",
    status: "finished",
    risk_level: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.risk_level,
    summary: CANONICAL_STATIC_ANALYSIS_COMPLETED_SUMMARY,
    details: CANONICAL_STATIC_ANALYSIS_DETAILS,
    created_at: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.created_at,
    updated_at: updatedAt
  };
}

export function createCanonicalStaticAnalysisRiskSummary(updatedAt: string): RiskSummary {
  return {
    task_id: CANONICAL_STATIC_ANALYSIS_CREATED_TASK.task_id,
    task_type: "static_analysis",
    status: "finished",
    risk_level: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.risk_level,
    summary: CANONICAL_STATIC_ANALYSIS_COMPLETED_SUMMARY,
    total_findings: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.total_findings,
    info_count: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.info_count,
    low_count: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.low_count,
    medium_count: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.medium_count,
    high_count: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.high_count,
    critical_count: CANONICAL_STATIC_ANALYSIS_DERIVED_RISK_SUMMARY.critical_count,
    updated_at: updatedAt
  };
}
