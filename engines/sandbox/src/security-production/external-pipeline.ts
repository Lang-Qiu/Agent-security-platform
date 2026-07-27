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
import {
  SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID,
  SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID,
  type SandboxSecurityJudgeProtocolId
} from "./judge-protocol-adapter.ts";

function pipelineInvalid(): never {
  throw new TypeError("sandbox_security_external_pipeline_invalid");
}

function inputPipelineOptions(value: unknown): Readonly<{
  transport: SandboxSecurityHttpTransport;
  judge_protocol_id: SandboxSecurityJudgeProtocolId;
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
      keys.length !== 3 ||
      !keys.includes("transport") ||
      !keys.includes("judge_protocol_id") ||
      !keys.includes("judge_requested_model")
    ) {
      return pipelineInvalid();
    }
    const transportDescriptor = Object.getOwnPropertyDescriptor(value, "transport");
    const protocolDescriptor = Object.getOwnPropertyDescriptor(
      value,
      "judge_protocol_id"
    );
    const modelDescriptor = Object.getOwnPropertyDescriptor(
      value,
      "judge_requested_model"
    );
    if (
      transportDescriptor === undefined ||
      !("value" in transportDescriptor) ||
      transportDescriptor.enumerable !== true ||
      protocolDescriptor === undefined ||
      !("value" in protocolDescriptor) ||
      protocolDescriptor.enumerable !== true ||
      (protocolDescriptor.value !==
        SANDBOX_SECURITY_OPENAI_RESPONSES_PROTOCOL_ID &&
        protocolDescriptor.value !==
          SANDBOX_SECURITY_OPENAI_CHAT_COMPLETIONS_JSON_PROTOCOL_ID) ||
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
      judge_protocol_id:
        protocolDescriptor.value as SandboxSecurityJudgeProtocolId,
      judge_requested_model: modelDescriptor.value
    });
  } catch {
    return pipelineInvalid();
  }
}

export function createSandboxSecurityExternalPipeline(input: Readonly<{
  transport: SandboxSecurityHttpTransport;
  judge_protocol_id: SandboxSecurityJudgeProtocolId;
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
        judge_protocol_id: options.judge_protocol_id,
        judge_requested_model: options.judge_requested_model
      })
    });
  } catch {
    return pipelineInvalid();
  }
}
