import type {
  SandboxSecuritySanitizer,
  SanitizedExternalDetector
} from "../security/index.ts";
import {
  createSandboxSecurityDeterministicSanitizer
} from "./deterministic-sanitizer.ts";
import type {
  SandboxSecurityHttpTransport
} from "./http-transport.ts";
import {
  createSandboxSecurityOpenAiJudgeDetector
} from "./openai-judge-detector.ts";

function pipelineInvalid(): never {
  throw new TypeError("sandbox_security_external_pipeline_invalid");
}

function inputTransport(value: unknown): SandboxSecurityHttpTransport {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return pipelineInvalid();
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "transport") {
      return pipelineInvalid();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "transport");
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return pipelineInvalid();
    }
    return descriptor.value as SandboxSecurityHttpTransport;
  } catch {
    return pipelineInvalid();
  }
}

export function createSandboxSecurityExternalPipeline(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
}>): Readonly<{
  sanitizer: SandboxSecuritySanitizer;
  judge: SanitizedExternalDetector;
}> {
  try {
    const transport = inputTransport(input);
    return Object.freeze({
      sanitizer: createSandboxSecurityDeterministicSanitizer(),
      judge: createSandboxSecurityOpenAiJudgeDetector({ transport })
    });
  } catch {
    return pipelineInvalid();
  }
}
