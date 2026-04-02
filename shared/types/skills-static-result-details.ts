import type { SkillsStaticRuleHit } from "./skills-static-rule-hit.ts";

export interface SkillsStaticResultDetails {
  sample_name?: string;
  language?: string;
  entry_files?: string[];
  files_scanned?: number;
  rule_hits?: SkillsStaticRuleHit[];
  sensitive_capabilities?: string[];
  dependency_summary?: Record<string, unknown>;
}
