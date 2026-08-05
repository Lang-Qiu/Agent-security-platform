import type { SandboxSecurityEvaluationRequest } from "../../../../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityDecision } from "../../../../../shared/types/sandbox-security.ts";

export interface SandboxSecurityEvaluationGateway {
  readonly composition_binding: string;
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>
  ): string;
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    signal?: AbortSignal
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
