import type { SkillsStaticRuleHit } from "../types/skills-static-rule-hit.ts";

const validRuleHit: SkillsStaticRuleHit = {
  rule_id: "command_execution.shell_exec",
  severity: "high",
  message: "Potential command execution sink reached",
  file_path: "src/commands.ts"
};

// @ts-expect-error finished/static standardized rule hits must carry a message
const missingMessage: SkillsStaticRuleHit = {
  rule_id: "command_execution.shell_exec",
  severity: "high",
  file_path: "src/commands.ts"
};

// @ts-expect-error finished/static standardized rule hits must carry a file path
const missingFilePath: SkillsStaticRuleHit = {
  rule_id: "command_execution.shell_exec",
  severity: "high",
  message: "Potential command execution sink reached"
};

void validRuleHit;
void missingMessage;
void missingFilePath;
