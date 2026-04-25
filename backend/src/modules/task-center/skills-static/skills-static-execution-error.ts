import { DomainError } from "../../../common/errors/domain-error.ts";

export type SkillsStaticProvider = "mock" | "semgrep";

export type SkillsStaticExecutionPhase =
  | "provider_selection"
  | "runner"
  | "mapper"
  | "normalizer"
  | "deriver";

export type SkillsStaticExecutionReason =
  | "unsupported_provider"
  | "invalid_provider_config"
  | "binary_missing"
  | "ruleset_missing"
  | "target_missing"
  | "exit_non_zero"
  | "output_invalid_json"
  | "timeout"
  | "mapping_failed"
  | "normalization_failed"
  | "derivation_failed";

function createFailureSummary(phase: SkillsStaticExecutionPhase): string {
  switch (phase) {
    case "provider_selection":
      return "Static analysis failed during provider selection";
    case "runner":
      return "Static analysis failed during engine execution";
    case "mapper":
      return "Static analysis failed during result mapping";
    case "normalizer":
      return "Static analysis failed during result normalization";
    case "deriver":
      return "Static analysis failed during risk summary derivation";
    default:
      return "Static analysis failed";
  }
}

export class SkillsStaticExecutionError extends DomainError {
  provider: string;
  phase: SkillsStaticExecutionPhase;
  reason: SkillsStaticExecutionReason;
  detail?: string;
  cause?: unknown;

  constructor(options: {
    provider: string;
    phase: SkillsStaticExecutionPhase;
    reason: SkillsStaticExecutionReason;
    detail?: string;
    cause?: unknown;
  }) {
    super(createFailureSummary(options.phase), "SKILLS_STATIC_EXECUTION_FAILED", 500);
    this.provider = options.provider;
    this.phase = options.phase;
    this.reason = options.reason;
    this.detail = options.detail;
    this.cause = options.cause;
  }
}

export function isSkillsStaticExecutionError(error: unknown): error is SkillsStaticExecutionError {
  return error instanceof SkillsStaticExecutionError;
}

export function toSkillsStaticExecutionError(
  error: unknown,
  options: {
    provider: string;
    phase: SkillsStaticExecutionPhase;
    reason: SkillsStaticExecutionReason;
    detail?: string;
  }
): SkillsStaticExecutionError {
  if (isSkillsStaticExecutionError(error)) {
    return error;
  }

  return new SkillsStaticExecutionError({
    ...options,
    cause: error
  });
}

export function summarizeSkillsStaticExecutionError(error: SkillsStaticExecutionError): string {
  return `${error.phase}:${error.reason}`;
}
