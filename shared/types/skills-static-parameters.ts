export interface SkillsStaticAnalysisParameters {
  language?: string;
  rule_pack?: string;
  include_dependencies?: boolean;
  include_paths?: string[];
  exclude_paths?: string[];
  entry_files?: string[];
  [key: string]: unknown;
}
