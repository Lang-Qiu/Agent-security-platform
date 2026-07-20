export {
  createSandboxSecurityProductionRuleDetector
} from "./rule-detector.ts";
export {
  createSandboxSecurityDeterministicSanitizer
} from "./deterministic-sanitizer.ts";

import type {
  SandboxSecurityEngine,
  SandboxSecurityRuntimePorts
} from "../security/index.ts";
import {
  createSandboxSecurityProductionComposition
} from "./composition.ts";

export async function createSandboxSecurityProductionEngine(input: Readonly<{
  runtime: SandboxSecurityRuntimePorts;
  mode: "rule_only" | "local" | "local_and_judge";
}>): Promise<SandboxSecurityEngine> {
  return createSandboxSecurityProductionComposition(input);
}
