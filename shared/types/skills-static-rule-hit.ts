export interface SkillsStaticTraceStep {
  step?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  metadata?: Record<string, unknown>;
}

export type SkillsStaticSeverity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Normalized public/static-analysis rule-hit contract.
 *
 * Required fields:
 * - `rule_id`
 * - `severity`
 *
 * Optional fields:
 * - every other field declared below
 *
 * Forbidden fields:
 * - any `engine_private_*` field
 * - `risk_score`
 *
 * Forbidden fields are rejected or stripped by backend normalizers before a
 * rule hit reaches this shared contract.
 */
export interface SkillsStaticRuleHit {
  rule_id: string;
  severity: SkillsStaticSeverity;
  title?: string;
  category?: string;
  message?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  code_snippet?: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  source_type?: string;
  sink_type?: string;
  trace?: SkillsStaticTraceStep[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}
