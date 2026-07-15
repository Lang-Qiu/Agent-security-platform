import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type {
  SandboxSecurityClaimedSourceType,
  SandboxSecurityJsonValue,
  SandboxSecurityPolicyProfileId,
  SandboxSecurityRequest,
  SandboxSecurityStage
} from "../../../shared/types/sandbox-security.ts";

type AuthorityApi = {
  normalizeSandboxSecurityEvaluationRequest: (
    value: unknown
  ) => unknown;
};

const modulePath = resolve(
  import.meta.dirname,
  "..",
  "src",
  "security",
  "source-authority.ts"
);

const inertFallback: AuthorityApi = {
  normalizeSandboxSecurityEvaluationRequest: () => null
};

let authority: AuthorityApi;
if (!existsSync(modulePath)) {
  authority = inertFallback;
} else {
  const loaded = await import("../src/security/source-authority.ts");
  if (typeof loaded.normalizeSandboxSecurityEvaluationRequest !== "function") {
    throw new Error("source-authority.ts does not expose the locked normalizer");
  }
  authority = loaded;
}

const normalizeSandboxSecurityEvaluationRequest =
  authority.normalizeSandboxSecurityEvaluationRequest;

function makeContent(
  claimedSourceType: SandboxSecurityClaimedSourceType,
  sourceId: string,
  value: string | SandboxSecurityJsonValue = `value-${sourceId}`,
  overrides: Record<string, unknown> = {}
) {
  return {
    source_id: sourceId,
    claimed_source_type: claimedSourceType,
    media_type: typeof value === "string" ? "text/plain" : "application/json",
    value,
    provenance_ref: `source://fixture/${sourceId}`,
    ...overrides
  };
}

function makeUserInputRequest(
  contentItems = [makeContent("user_input", "user_1")],
  overrides: Record<string, unknown> = {}
): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request_user_001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: contentItems,
    ...overrides
  } as SandboxSecurityRequest;
}

function makeModelOutputRequest(
  contentItems = [makeContent("model_output", "model_1")],
  overrides: Record<string, unknown> = {}
): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request_model_001",
    stage: "model_output",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: contentItems,
    ...overrides
  } as SandboxSecurityRequest;
}

function makeToolRequest(
  contentItems = [makeContent("model_output", "model_1")],
  overrides: Record<string, unknown> = {}
): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request_tool_001",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: contentItems,
    tool_request: {
      call_id: "call_1",
      tool_name: "send_message",
      target: "target.local",
      arguments: { urgent: false, channel: "security" }
    },
    ...overrides
  } as SandboxSecurityRequest;
}

type AuthoritySource = {
  source_id: string;
  authority_kind:
    | "platform_control"
    | "integration_observation"
    | "simulation_observation";
  source_type: SandboxSecurityClaimedSourceType;
  media_type: "text/plain" | "application/json";
  value: string | SandboxSecurityJsonValue;
  provenance_ref: string;
};

type AuthorityTool = {
  authority_kind: "integration_observation" | "simulation_observation";
  call_id: string;
  tool_name: string;
  target?: string;
  arguments: SandboxSecurityJsonValue;
};

function sourceFromContent(
  content: ReturnType<typeof makeContent>,
  authorityKind: AuthoritySource["authority_kind"]
): AuthoritySource {
  return {
    source_id: content.source_id,
    authority_kind: authorityKind,
    source_type: content.claimed_source_type,
    media_type: content.media_type,
    value: content.value,
    provenance_ref: content.provenance_ref
  };
}

function makeContext(
  stage: SandboxSecurityStage,
  profile: SandboxSecurityPolicyProfileId,
  sources: readonly AuthoritySource[],
  overrides: Record<string, unknown> = {}
) {
  return {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: "simulation",
    stage,
    policy_profile_id: profile,
    sources,
    ...overrides
  };
}

function makeSimulationEvaluation(
  submission: SandboxSecurityRequest = makeUserInputRequest(),
  sourceOverrides: Record<string, unknown> = {},
  contextOverrides: Record<string, unknown> = {}
) {
  const sources = submission.content_items.map((content) =>
    sourceFromContent(content, "simulation_observation")
  );
  return {
    submission,
    authoritative_context: makeContext(
      submission.stage,
      submission.policy_profile_id,
      sources.map((source) => ({ ...source, ...sourceOverrides })),
      contextOverrides
    )
  };
}

function makeEnforcementEvaluation() {
  const submission = makeModelOutputRequest([
    makeContent("system_instruction", "system_1", "follow policy"),
    makeContent("model_output", "model_1", "model response")
  ]);
  return {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "enforcement",
      stage: "model_output",
      policy_profile_id: submission.policy_profile_id,
      sources: [
        sourceFromContent(submission.content_items[0], "platform_control"),
        sourceFromContent(submission.content_items[1], "integration_observation")
      ]
    }
  };
}

function makeToolEvaluation() {
  const submission = makeToolRequest();
  return {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "tool_request",
      policy_profile_id: submission.policy_profile_id,
      sources: [
        sourceFromContent(submission.content_items[0], "simulation_observation")
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: submission.tool_request!.call_id,
        tool_name: submission.tool_request!.tool_name,
        target: submission.tool_request!.target,
        arguments: submission.tool_request!.arguments
      }
    }
  };
}

function errorCode(error: unknown): unknown {
  return error !== null && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function assertErrorCode(action: () => unknown, expected: string): void {
  assert.throws(action, (error: unknown) => errorCode(error) === expected);
}

test("REQ-SBX-GENERAL-001 accepts an exact simulation context", () => {
  const normalized = normalizeSandboxSecurityEvaluationRequest(
    makeSimulationEvaluation()
  );

  assert.ok(normalized);
  assert.equal(
    (normalized as { submission: SandboxSecurityRequest }).submission.stage,
    "user_input"
  );
});

test("REQ-SBX-GENERAL-001 accepts platform control only in enforcement", () => {
  const enforcement = makeEnforcementEvaluation();
  assert.ok(normalizeSandboxSecurityEvaluationRequest(enforcement));

  const simulation = makeSimulationEvaluation(
    makeModelOutputRequest([
      makeContent("system_instruction", "system_1", "follow policy"),
      makeContent("model_output", "model_1", "model response")
    ]),
    {},
    { sources: undefined }
  );
  (simulation.authoritative_context as Record<string, unknown>).sources = [
    sourceFromContent(
      simulation.submission.content_items[0],
      "platform_control"
    ),
    sourceFromContent(
      simulation.submission.content_items[1],
      "simulation_observation"
    )
  ];
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(simulation),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects equal source ID with different value", () => {
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationEvaluation(makeUserInputRequest(), { value: "forged" })
      ),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects stage profile and tool authority mismatch", () => {
  const valid = makeSimulationEvaluation();
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...valid,
        authoritative_context: {
          ...valid.authoritative_context,
          stage: "model_output"
        }
      }),
    "sandbox_security_authority_mismatch"
  );
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...valid,
        authoritative_context: {
          ...valid.authoritative_context,
          policy_profile_id: "sandbox-security-strict.v1"
        }
      }),
    "sandbox_security_authority_mismatch"
  );

  const tool = makeToolEvaluation();
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...tool,
        authoritative_context: {
          ...tool.authoritative_context,
          tool_request: {
            ...tool.authoritative_context.tool_request,
            tool_name: "different_tool"
          }
        }
      }),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects reordered authoritative observations", () => {
  const valid = makeEnforcementEvaluation();
  const reordered = {
    ...valid,
    authoritative_context: {
      ...valid.authoritative_context,
      sources: [...valid.authoritative_context.sources].reverse()
    }
  };
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(reordered),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects invalid mode and authority pairs", () => {
  const simulation = makeSimulationEvaluation();
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...simulation,
        authoritative_context: {
          ...simulation.authoritative_context,
          sources: [
            {
              ...simulation.authoritative_context.sources[0],
              authority_kind: "integration_observation"
            }
          ]
        }
      }),
    "sandbox_security_source_authority_invalid"
  );

  const enforcement = makeEnforcementEvaluation();
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...enforcement,
        authoritative_context: {
          ...enforcement.authoritative_context,
          sources: enforcement.authoritative_context.sources.map((source) => ({
            ...source,
            authority_kind: "simulation_observation"
          }))
        }
      }),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 JSON authority equality uses engine JCS only", () => {
  const submission = makeUserInputRequest([
    makeContent("user_input", "json_1", { b: 2, a: 1 })
  ]);
  const evaluation = makeSimulationEvaluation(submission);
  evaluation.authoritative_context.sources[0].value = { a: 1, b: 2 };

  const normalized = normalizeSandboxSecurityEvaluationRequest(evaluation);
  assert.ok(normalized);
});

test("REQ-SBX-GENERAL-001 authority mismatch produces no normalized branded request", () => {
  const invalid = makeSimulationEvaluation(makeUserInputRequest(), {
    provenance_ref: "source://fixture/different"
  });
  let result: unknown;
  assertErrorCode(
    () => {
      result = normalizeSandboxSecurityEvaluationRequest(invalid);
    },
    "sandbox_security_authority_mismatch"
  );
  assert.equal(result, undefined);
});

test("REQ-SBX-GENERAL-001 rejects unknown keys on evaluation request envelope", () => {
  const valid = makeSimulationEvaluation();
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...valid,
        unexpected: true
      }),
    "sandbox_security_request_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects missing authoritative schema_version", () => {
  const valid = makeSimulationEvaluation();
  const { schema_version: _ignored, ...missingSchema } =
    valid.authoritative_context;
  assertErrorCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...valid,
        authoritative_context: missingSchema
      }),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects duplicate or malformed source observations", () => {
  const valid = makeEnforcementEvaluation();
  const duplicate = {
    ...valid,
    authoritative_context: {
      ...valid.authoritative_context,
      sources: [
        valid.authoritative_context.sources[0],
        valid.authoritative_context.sources[0]
      ]
    }
  };
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(duplicate),
    "sandbox_security_source_authority_invalid"
  );

  const malformed = {
    ...valid,
    authoritative_context: {
      ...valid.authoritative_context,
      sources: [{ ...valid.authoritative_context.sources[0], source_id: "" }]
    }
  };
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(malformed),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects tool presence mismatch between submission and authority", () => {
  const tool = makeToolEvaluation();
  const absentAuthority = {
    ...tool,
    authoritative_context: {
      ...tool.authoritative_context,
      tool_request: undefined
    }
  };
  delete (absentAuthority.authoritative_context as Record<string, unknown>)
    .tool_request;
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(absentAuthority),
    "sandbox_security_authority_mismatch"
  );

  const noTool = makeSimulationEvaluation(makeModelOutputRequest());
  (noTool.authoritative_context as Record<string, unknown>).tool_request = {
    authority_kind: "simulation_observation",
    call_id: "call_1",
    tool_name: "send_message",
    arguments: {}
  } satisfies AuthorityTool;
  assertErrorCode(
    () => normalizeSandboxSecurityEvaluationRequest(noTool),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 mints only NormalizedSandboxSecurityEvaluationRequest brand", () => {
  const normalized = normalizeSandboxSecurityEvaluationRequest(
    makeSimulationEvaluation()
  ) as Record<PropertyKey, unknown>;
  assert.ok(normalized);

  const symbols = Object.getOwnPropertySymbols(normalized);
  assert.equal(symbols.length, 1);
  assert.equal(normalized[symbols[0]], true);
  assert.equal("SandboxSecurityEvaluationRequestInput" in normalized, false);
  assert.equal("ValidatedSandboxSecurityEvaluationRequest" in normalized, false);
});

test("REQ-SBX-GENERAL-001 defensive copy freezes submission and authoritative_context", () => {
  const submission = makeUserInputRequest([
    makeContent("user_input", "json_1", { nested: { values: [1, 2] } })
  ]);
  const evaluation = makeSimulationEvaluation(submission);
  const normalized = normalizeSandboxSecurityEvaluationRequest(evaluation) as {
    submission: SandboxSecurityRequest;
    authoritative_context: {
      sources: readonly AuthoritySource[];
    };
  };

  assert.notEqual(normalized.submission, submission);
  assert.notEqual(normalized.authoritative_context, evaluation.authoritative_context);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.submission));
  assert.ok(Object.isFrozen(normalized.submission.content_items));
  assert.ok(Object.isFrozen(normalized.submission.content_items[0]));
  assert.ok(Object.isFrozen(normalized.submission.content_items[0].value));
  assert.ok(Object.isFrozen(normalized.authoritative_context));
  assert.ok(Object.isFrozen(normalized.authoritative_context.sources));
  assert.ok(Object.isFrozen(normalized.authoritative_context.sources[0]));

  (submission.content_items[0].value as { nested: { values: number[] } }).nested.values[0] =
    99;
  (evaluation.authoritative_context.sources[0].value as {
    nested: { values: number[] };
  }).nested.values[0] = 88;

  assert.deepEqual(
    (normalized.submission.content_items[0].value as { nested: { values: number[] } })
      .nested.values,
    [1, 2]
  );
  assert.deepEqual(
    (normalized.authoritative_context.sources[0].value as {
      nested: { values: number[] };
    }).nested.values,
    [1, 2]
  );
});
