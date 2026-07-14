import assert from "node:assert/strict";
import test from "node:test";

import type {
  SandboxSecurityJsonValue,
  SandboxSecurityRequest
} from "../../../shared/types/sandbox-security.ts";

type AuthorityModule = {
  normalizeSandboxSecurityEvaluationRequest: (
    value: unknown
  ) => Readonly<NormalizedRequest>;
  SandboxSecurityAuthorityError: new (
    code: string,
    message?: string
  ) => Error & { code: string };
};

type NormalizedRequest = {
  readonly submission: SandboxSecurityRequest;
  readonly authoritative_context: {
    schema_version: "sandbox-security-authoritative-context.v1";
    evaluation_mode: "simulation" | "enforcement";
    stage: string;
    policy_profile_id: string;
    sources: readonly unknown[];
    tool_request?: unknown;
  };
  readonly [brand: symbol]: true;
};

async function loadAuthorityModule(): Promise<AuthorityModule> {
  try {
    return (await import(
      "../src/security/source-authority.ts"
    )) as AuthorityModule;
  } catch {
    class SandboxSecurityAuthorityError extends Error {
      code: string;
      constructor(code: string, message = code) {
        super(message);
        this.code = code;
        this.name = "SandboxSecurityAuthorityError";
      }
    }
    return {
      SandboxSecurityAuthorityError,
      normalizeSandboxSecurityEvaluationRequest: () => {
        throw new SandboxSecurityAuthorityError(
          "sandbox_security_source_authority_invalid"
        );
      }
    };
  }
}

const { normalizeSandboxSecurityEvaluationRequest, SandboxSecurityAuthorityError } =
  await loadAuthorityModule();

function makeUserInputSubmission(
  overrides: Record<string, unknown> = {}
): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-user-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-user",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://workbench/user/input"
      }
    ],
    ...overrides
  } as SandboxSecurityRequest;
}

function makeSimulationUserInputEnvelope(
  overrides: {
    submission?: Record<string, unknown>;
    context?: Record<string, unknown>;
    source?: Record<string, unknown>;
  } = {}
) {
  const submission = {
    ...makeUserInputSubmission(),
    ...(overrides.submission ?? {})
  };
  const source = {
    source_id: "src-user",
    authority_kind: "simulation_observation",
    source_type: "user_input",
    media_type: "text/plain",
    value: "hello",
    provenance_ref: "source://workbench/user/input",
    ...(overrides.source ?? {})
  };
  return {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [source],
      ...(overrides.context ?? {})
    }
  };
}

function makeToolSubmission(): SandboxSecurityRequest {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-tool-001",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-model",
        claimed_source_type: "model_output",
        media_type: "text/plain",
        value: "call tool",
        provenance_ref: "source://model/output"
      }
    ],
    tool_request: {
      call_id: "call-1",
      tool_name: "read_file",
      target: "/tmp/x",
      arguments: { path: "/tmp/x", opts: { a: 1, b: 2 } }
    }
  };
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    assert.fail(`expected throw with code ${code}`);
  } catch (error) {
    assert.ok(error instanceof SandboxSecurityAuthorityError);
    assert.equal((error as { code: string }).code, code);
  }
}

test("REQ-SBX-GENERAL-001 accepts an exact simulation context", () => {
  const normalized = normalizeSandboxSecurityEvaluationRequest(
    makeSimulationUserInputEnvelope()
  );
  assert.equal(normalized.submission.request_id, "req-user-001");
  assert.equal(normalized.authoritative_context.evaluation_mode, "simulation");
  assert.equal(normalized.authoritative_context.sources.length, 1);
});

test("REQ-SBX-GENERAL-001 accepts platform control only in enforcement", () => {
  const enforcement = makeSimulationUserInputEnvelope({
    context: { evaluation_mode: "enforcement" },
    source: { authority_kind: "platform_control" }
  });
  const normalized = normalizeSandboxSecurityEvaluationRequest(enforcement);
  assert.equal(normalized.authoritative_context.evaluation_mode, "enforcement");

  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          source: { authority_kind: "platform_control" }
        })
      ),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects equal source ID with different value", () => {
  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          source: { value: "different" }
        })
      ),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects stage profile and tool authority mismatch", () => {
  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          context: { stage: "model_output" }
        })
      ),
    "sandbox_security_authority_mismatch"
  );

  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          context: { policy_profile_id: "sandbox-security-strict.v1" }
        })
      ),
    "sandbox_security_authority_mismatch"
  );

  const toolSubmission = makeToolSubmission();
  const toolEnvelope = {
    submission: toolSubmission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-model",
          authority_kind: "simulation_observation",
          source_type: "model_output",
          media_type: "text/plain",
          value: "call tool",
          provenance_ref: "source://model/output"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "write_file",
        target: "/tmp/x",
        arguments: { path: "/tmp/x", opts: { a: 1, b: 2 } }
      }
    }
  };
  expectCode(
    () => normalizeSandboxSecurityEvaluationRequest(toolEnvelope),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects reordered authoritative observations", () => {
  const submission: SandboxSecurityRequest = {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-model-001",
    stage: "model_output",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-user",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "prompt",
        provenance_ref: "source://user/input"
      },
      {
        source_id: "src-model",
        claimed_source_type: "model_output",
        media_type: "text/plain",
        value: "answer",
        provenance_ref: "source://model/output"
      }
    ]
  };
  const envelope = {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-model",
          authority_kind: "simulation_observation",
          source_type: "model_output",
          media_type: "text/plain",
          value: "answer",
          provenance_ref: "source://model/output"
        },
        {
          source_id: "src-user",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "text/plain",
          value: "prompt",
          provenance_ref: "source://user/input"
        }
      ]
    }
  };
  expectCode(
    () => normalizeSandboxSecurityEvaluationRequest(envelope),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 rejects invalid mode and authority pairs", () => {
  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          context: { evaluation_mode: "enforcement" },
          source: { authority_kind: "simulation_observation" }
        })
      ),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 JSON authority equality uses engine JCS only", () => {
  const jsonValue: SandboxSecurityJsonValue = { b: 1, a: 0 };
  const reordered: SandboxSecurityJsonValue = { a: 0, b: 1 };
  const submission: SandboxSecurityRequest = {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-json-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-json",
        claimed_source_type: "user_input",
        media_type: "application/json",
        value: jsonValue,
        provenance_ref: "source://workbench/json"
      }
    ]
  };
  const envelope = {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-json",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "application/json",
          value: reordered,
          provenance_ref: "source://workbench/json"
        }
      ]
    }
  };
  const normalized = normalizeSandboxSecurityEvaluationRequest(envelope);
  assert.equal(normalized.authoritative_context.sources.length, 1);
});

test("REQ-SBX-GENERAL-001 authority mismatch produces no normalized branded request", () => {
  let branded: unknown;
  try {
    branded = normalizeSandboxSecurityEvaluationRequest(
      makeSimulationUserInputEnvelope({ source: { value: "nope" } })
    );
  } catch (error) {
    assert.ok(error instanceof SandboxSecurityAuthorityError);
    assert.equal(
      (error as { code: string }).code,
      "sandbox_security_authority_mismatch"
    );
    branded = undefined;
  }
  assert.equal(branded, undefined);
});

test("REQ-SBX-GENERAL-001 rejects unknown keys on evaluation request envelope", () => {
  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        ...makeSimulationUserInputEnvelope(),
        extra: true
      }),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects missing authoritative schema_version", () => {
  const envelope = makeSimulationUserInputEnvelope();
  delete (envelope.authoritative_context as { schema_version?: string })
    .schema_version;
  expectCode(
    () => normalizeSandboxSecurityEvaluationRequest(envelope),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects duplicate or malformed source observations", () => {
  const envelope = makeSimulationUserInputEnvelope();
  const source = envelope.authoritative_context.sources[0];
  envelope.authoritative_context.sources = [source, { ...source }];
  // submission still has one item => count mismatch first? duplicate on authority side before match
  // Use two identical authority sources with two submission items same id? better: two authority same id with two content items different ids - invalid
  const submission: SandboxSecurityRequest = {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-dup",
    stage: "model_output",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-a",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "a",
        provenance_ref: "source://a"
      },
      {
        source_id: "src-b",
        claimed_source_type: "model_output",
        media_type: "text/plain",
        value: "b",
        provenance_ref: "source://b"
      }
    ]
  };
  const dup = {
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-a",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "text/plain",
          value: "a",
          provenance_ref: "source://a"
        },
        {
          source_id: "src-a",
          authority_kind: "simulation_observation",
          source_type: "model_output",
          media_type: "text/plain",
          value: "b",
          provenance_ref: "source://b"
        }
      ]
    }
  };
  expectCode(
    () => normalizeSandboxSecurityEvaluationRequest(dup),
    "sandbox_security_source_authority_invalid"
  );

  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest(
        makeSimulationUserInputEnvelope({
          source: { media_type: "text/html" }
        })
      ),
    "sandbox_security_source_authority_invalid"
  );
});

test("REQ-SBX-GENERAL-001 rejects tool presence mismatch between submission and authority", () => {
  const toolSubmission = makeToolSubmission();
  expectCode(
    () =>
      normalizeSandboxSecurityEvaluationRequest({
        submission: toolSubmission,
        authoritative_context: {
          schema_version: "sandbox-security-authoritative-context.v1",
          evaluation_mode: "simulation",
          stage: "tool_request",
          policy_profile_id: "sandbox-security-balanced.v1",
          sources: [
            {
              source_id: "src-model",
              authority_kind: "simulation_observation",
              source_type: "model_output",
              media_type: "text/plain",
              value: "call tool",
              provenance_ref: "source://model/output"
            }
          ]
        }
      }),
    "sandbox_security_authority_mismatch"
  );
});

test("REQ-SBX-GENERAL-001 mints only NormalizedSandboxSecurityEvaluationRequest brand", () => {
  const normalized = normalizeSandboxSecurityEvaluationRequest(
    makeSimulationUserInputEnvelope()
  );
  const brandKeys = Object.getOwnPropertySymbols(normalized);
  assert.equal(brandKeys.length, 1);
  assert.equal(Reflect.get(normalized, brandKeys[0]), true);
});

test("REQ-SBX-GENERAL-001 defensive copy freezes submission and authoritative_context", () => {
  const envelope = makeSimulationUserInputEnvelope();
  const normalized = normalizeSandboxSecurityEvaluationRequest(envelope);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.submission));
  assert.ok(Object.isFrozen(normalized.authoritative_context));
  assert.ok(Object.isFrozen(normalized.submission.content_items));
  assert.ok(Object.isFrozen(normalized.authoritative_context.sources));

  envelope.submission.content_items[0].value = "mutated";
  assert.equal(
    (normalized.submission.content_items[0] as { value: string }).value,
    "hello"
  );
});
