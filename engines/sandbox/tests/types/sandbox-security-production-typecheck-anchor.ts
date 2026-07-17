import { createSandboxSecurityProductionRuleDetector } from "../../src/security-production/rule-detector.ts";
import type { RawLocalDetector } from "../../src/security/index.ts";

const detector: RawLocalDetector = createSandboxSecurityProductionRuleDetector();
void detector;
