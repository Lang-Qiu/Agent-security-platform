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

function inputPipelineOptions(value: unknown): Readonly<{
  transport: SandboxSecurityHttpTransport;
  judge_requested_model: string;
}> {
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
    if (
      keys.length !== 2 ||
      !keys.includes("transport") ||
      !keys.includes("judge_requested_model")
    ) {
      return pipelineInvalid();
    }
    const transportDescriptor = Object.getOwnPropertyDescriptor(value, "transport");
    const modelDescriptor = Object.getOwnPropertyDescriptor(
      value,
      "judge_requested_model"
    );
    if (
      transportDescriptor === undefined ||
      !("value" in transportDescriptor) ||
      transportDescriptor.enumerable !== true ||
      modelDescriptor === undefined ||
      !("value" in modelDescriptor) ||
      modelDescriptor.enumerable !== true ||
      typeof modelDescriptor.value !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(modelDescriptor.value)
    ) {
      return pipelineInvalid();
    }
    return Object.freeze({
      transport: transportDescriptor.value as SandboxSecurityHttpTransport,
      judge_requested_model: modelDescriptor.value
    });
  } catch {
    return pipelineInvalid();
  }
}

export function createSandboxSecurityExternalPipeline(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  judge_requested_model: string;
}>): Readonly<{
  sanitizer: SandboxSecuritySanitizer;
  judge: SanitizedExternalDetector;
}> {
  try {
    const options = inputPipelineOptions(input);
    return Object.freeze({
      sanitizer: createSandboxSecurityDeterministicSanitizer(),
      judge: createSandboxSecurityOpenAiJudgeDetector({
        transport: options.transport,
        judge_requested_model: options.judge_requested_model
      })
    });
  } catch {
    return pipelineInvalid();
  }
}
