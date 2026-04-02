export interface SkillsStaticTraceStep {
  step?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  metadata?: Record<string, unknown>;
}

export type SkillsStaticSeverity = "info" | "low" | "medium" | "high" | "critical";

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
