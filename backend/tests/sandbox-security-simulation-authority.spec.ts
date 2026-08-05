import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSandboxSecurityRequest
} from "../../shared/contracts/sandbox-security-request.ts";
import type { SandboxSecurityRequest } from "../../shared/types/sandbox-security.ts";
import type { SandboxSecurityEvaluationRequest } from "../../engines/sandbox/src/security/index.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

function normalizeRequest(value: unknown): SandboxSecurityRequest {
  const normalized = normalizeSandboxSecurityRequest(value);
  assert.ok(normalized, "fixture must be a normalized sandbox security request");
  return normalized;
}

type SimulationAuthorityBuilder = (
  submission: Readonly<SandboxSecurityRequest>
) => Readonly<SandboxSecurityEvaluationRequest>;

function getSimulationAuthorityBuilder(): SimulationAuthorityBuilder {
  const builder = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecuritySimulationEvaluationRequest;
  assert.equal(typeof builder, "function");
  return builder as SimulationAuthorityBuilder;
}

function makeToolSubmission(): SandboxSecurityRequest {
  return normalizeRequest({
    schema_version: "sandbox-security-request.v1",
    request_id: "request_tool_001",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-strict.v1",
    content_items: [
      {
        source_id: "user_1",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "send the report",
        provenance_ref: "source://fixture/user_1"
      },
      {
        source_id: "model_1",
        claimed_source_type: "model_output",
        media_type: "application/json",
        value: {
          action: "send",
          metadata: { channel: "security" }
        },
        provenance_ref: "source://fixture/model_1"
      }
    ],
    tool_request: {
      call_id: "call_1",
      tool_name: "send_report",
      target: "target.local",
      arguments: {
        recipients: ["security@example.test"],
        options: { urgent: false }
      }
    }
  });
}

test("REQ-SBX-GENERAL-003 builds simulation authority from normalized public input", () => {
  const submission = makeToolSubmission();
  const builder = getSimulationAuthorityBuilder();
  const result = builder(submission);

  assert.equal(result.authoritative_context.evaluation_mode, "simulation");
  assert.deepEqual(
    result.authoritative_context.sources.map((source) => source.authority_kind),
    ["simulation_observation", "simulation_observation"]
  );
  assert.equal(
    result.authoritative_context.tool_request?.authority_kind,
    "simulation_observation"
  );
  assert.equal(result.authoritative_context.stage, submission.stage);
  assert.equal(
    result.authoritative_context.policy_profile_id,
    submission.policy_profile_id
  );
  assert.equal(result.authoritative_context.sources.length, 2);
  assert.equal(result.submission.content_items.length, 2);
  assert.deepEqual(
    result.submission.content_items.map((item) => item.source_id),
    ["user_1", "model_1"]
  );
  assert.deepEqual(
    result.authoritative_context.sources.map((source) => source.source_id),
    ["user_1", "model_1"]
  );
  assert.deepEqual(
    result.authoritative_context.sources.map((source) => source.value),
    result.submission.content_items.map((item) => item.value)
  );
  assert.equal(builder.length, 1);
});

test("REQ-SBX-GENERAL-003 defensively clones JSON content and tool arguments", () => {
  const submission = makeToolSubmission();
  const result = getSimulationAuthorityBuilder()(submission) as any;

  const submissionJson = submission.content_items[1].value as any;
  const submissionArguments = submission.tool_request!.arguments as any;
  submissionJson.metadata.channel = "mutated-after-return";
  submissionArguments.options.urgent = true;
  submissionArguments.recipients.push("attacker@example.test");

  assert.equal(
    (result.submission.content_items[1].value as any).metadata.channel,
    "security"
  );
  assert.equal(
    (result.authoritative_context.sources[1].value as any).metadata.channel,
    "security"
  );
  assert.equal(
    (result.submission.tool_request.arguments as any).options.urgent,
    false
  );
  assert.equal(
    (result.authoritative_context.tool_request.arguments as any).options.urgent,
    false
  );
  assert.equal(
    (result.submission.tool_request.arguments as any).recipients.length,
    1
  );
  assert.equal(
    (result.authoritative_context.tool_request.arguments as any).recipients.length,
    1
  );

  (result.submission.content_items[1].value as any).metadata.channel =
    "submission-only";
  (result.submission.tool_request.arguments as any).options.urgent = true;
  assert.equal(
    (result.authoritative_context.sources[1].value as any).metadata.channel,
    "security"
  );
  assert.equal(
    (result.authoritative_context.tool_request.arguments as any).options.urgent,
    false
  );
});

test("REQ-SBX-GENERAL-003 omits optional tool authority when no tool is submitted", () => {
  const submission = normalizeRequest({
    schema_version: "sandbox-security-request.v1",
    request_id: "request_user_001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "user_1",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://fixture/user_1"
      }
    ]
  });
  const result = getSimulationAuthorityBuilder()(submission) as any;

  assert.equal(Object.hasOwn(result.authoritative_context, "tool_request"), false);
  assert.equal(Object.hasOwn(result.submission, "tool_request"), false);
  assert.deepEqual(result.authoritative_context.sources, [
    {
      source_id: "user_1",
      authority_kind: "simulation_observation",
      source_type: "user_input",
      media_type: "text/plain",
      value: "hello",
      provenance_ref: "source://fixture/user_1"
    }
  ]);
});

test("REQ-SBX-GENERAL-003 keeps authority simulation-only and exposes no private brand", () => {
  assert.equal("sandboxSecurityEvaluationRequestBrand" in boundary, false);
  const result = getSimulationAuthorityBuilder()(makeToolSubmission()) as any;
  const contextKeys = Reflect.ownKeys(result.authoritative_context);
  assert.deepEqual(contextKeys, [
    "schema_version",
    "evaluation_mode",
    "stage",
    "policy_profile_id",
    "sources",
    "tool_request"
  ]);
  assert.equal(
    result.authoritative_context.sources.some(
      (source: { authority_kind: string }) =>
        source.authority_kind === "platform_control" ||
        source.authority_kind === "integration_observation"
    ),
    false
  );
  assert.notEqual("platform_control" in result.authoritative_context, true);
  assert.notEqual("integration_observation" in result.authoritative_context, true);
});
