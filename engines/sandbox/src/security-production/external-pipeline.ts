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
  validateSandboxSecurityOpenAiJudgePromptProfile,
  type SandboxSecurityOpenAiJudgePromptProfile
} from "./openai-judge-contract.ts";
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
  judge_prompt_profile?: SandboxSecurityOpenAiJudgePromptProfile;
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
      keys.length < 3 ||
      keys.length > 4 ||
      !keys.includes("transport") ||
      !keys.includes("judge_protocol_id") ||
      !keys.includes("judge_requested_model") ||
      keys.some((key) =>
        key !== "transport" &&
        key !== "judge_protocol_id" &&
        key !== "judge_requested_model" &&
        key !== "judge_prompt_profile"
      )
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
    const promptProfileDescriptor = Object.getOwnPropertyDescriptor(
      value,
      "judge_prompt_profile"
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
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(modelDescriptor.value) ||
      (promptProfileDescriptor !== undefined &&
        (!("value" in promptProfileDescriptor) ||
          promptProfileDescriptor.enumerable !== true))
    ) {
      return pipelineInvalid();
    }
    return Object.freeze({
      transport: transportDescriptor.value as SandboxSecurityHttpTransport,
      judge_protocol_id:
        protocolDescriptor.value as SandboxSecurityJudgeProtocolId,
      judge_requested_model: modelDescriptor.value,
      ...(promptProfileDescriptor === undefined
        ? {}
        : {
            judge_prompt_profile: validateSandboxSecurityOpenAiJudgePromptProfile(
              promptProfileDescriptor.value
            )
          })
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
        judge_requested_model: options.judge_requested_model,
        ...(options.judge_prompt_profile === undefined
          ? {}
          : { judge_prompt_profile: options.judge_prompt_profile })
      })
    });
  } catch {
    return pipelineInvalid();
  }
}
