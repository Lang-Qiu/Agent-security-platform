import type { SandboxSecurityEvaluationRequest } from "../../../../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityDecision } from "../../../../../shared/types/sandbox-security.ts";
import type { SandboxSecurityEvaluationStreamEvent } from "../../../../../shared/types/sandbox-security-api.ts";

export type SandboxSecurityEvaluationStageEvent = Extract<
  SandboxSecurityEvaluationStreamEvent,
  { event_type: "stage" }
>;

export interface SandboxSecurityEvaluationGateway {
  readonly composition_binding: string;
  fingerprint(
    request: Readonly<SandboxSecurityEvaluationRequest>
  ): string;
  evaluate(
    request: Readonly<SandboxSecurityEvaluationRequest>,
    signal?: AbortSignal,
    onStage?: (event: SandboxSecurityEvaluationStageEvent) => void
  ): Promise<Readonly<SandboxSecurityDecision>>;
}
