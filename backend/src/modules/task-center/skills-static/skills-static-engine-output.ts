export const SKILLS_STATIC_ENGINE_PRIVATE_FIELD_PREFIX = "engine_private_";
export const SKILLS_STATIC_FORBIDDEN_ENGINE_OUTPUT_FIELDS = ["risk_score"] as const;

export interface SkillsStaticEngineOutput {
  sample_name?: unknown;
  language?: unknown;
  entry_files?: unknown;
  files_scanned?: unknown;
  rule_hits?: unknown;
  sensitive_capabilities?: unknown;
  dependency_summary?: unknown;
  [key: string]: unknown;
}
