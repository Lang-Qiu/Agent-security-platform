import type { BaseResult, StaticAnalysisResultDetails } from "../../shared/types/result.ts";
import type { SkillsStaticRuleHit } from "../../shared/types/skills-static-rule-hit.ts";
import type { RiskSummary, Task } from "../../shared/types/task.ts";

export const STATIC_ANALYSIS_PENDING_SUMMARY = "Task accepted and waiting for engine dispatch";

export const CANONICAL_STATIC_ANALYSIS_RULE_HITS: SkillsStaticRuleHit[] = [
  {
    rule_id: "command_execution.shell_exec",
    title: "Shell command reaches an execution sink",
    category: "command_execution",
    severity: "high",
    message: "Potential command execution sink reached",
    file_path: "src/commands.ts",
    line_start: 4,
    line_end: 4,
    code_snippet: "return exec(commandInput);",
    recommendation: "Replace shell execution with an allowlisted wrapper",
    source_type: "user_input",
    sink_type: "command_execution",
    tags: ["command", "input-flow"]
  },
  {
    rule_id: "network_access.outbound_fetch",
    title: "Outbound network request lacks destination allowlist",
    category: "network_access",
    severity: "medium",
    message: "Outbound network request lacks destination allowlist",
    file_path: "src/network.ts",
    line_start: 2,
    line_end: 2,
    code_snippet: "return fetch(targetUrl);",
    recommendation: "Restrict outbound destinations to an allowlist",
    source_type: "config",
    sink_type: "network_request",
    tags: ["network", "egress"]
  }
];

export const CANONICAL_STATIC_ANALYSIS_DETAILS: StaticAnalysisResultDetails = {
  sample_name: "skills-static-real-scan",
  language: "typescript",
  entry_files: ["src/commands.ts", "src/network.ts"],
  files_scanned: 2,
  rule_hits: CANONICAL_STATIC_ANALYSIS_RULE_HITS,
  sensitive_capabilities: ["command_execution", "network_access"],
  dependency_summary: {
    manifests_scanned: 0
  }
};

export const CANONICAL_STATIC_ANALYSIS_STRONG_DETAILS_PROJECTION = {
  sample_name: CANONICAL_STATIC_ANALYSIS_DETAILS.sample_name,
  language: CANONICAL_STATIC_ANALYSIS_DETAILS.language,
  rule_hits: CANONICAL_STATIC_ANALYSIS_RULE_HITS.map((ruleHit) => ({
    rule_id: ruleHit.rule_id,
    severity: ruleHit.severity,
    message: ruleHit.message,
    file_path: ruleHit.file_path,
    line_start: ruleHit.line_start,
    line_end: ruleHit.line_end
  }))
};

export const CANONICAL_STATIC_ANALYSIS_CREATED_TASK: Task = {
  task_id: "task_static_contract_001",
  task_type: "static_analysis",
  engine_type: "skills_static",
  status: "pending",
  title: "Analyze canonical skills-static fixture",
  target: {
    target_type: "skill_package",
    target_value: "tests/fixtures/skills-static-real-scan",
    display_name: "skills-static-real-scan"
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

export const CANONICAL_STATIC_ANALYSIS_COMPLETED_SUMMARY = "Static analysis finished with 2 rule hits";

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
