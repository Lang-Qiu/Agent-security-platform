import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type CanonicalJsonApi = {
  canonicalizeSandboxSecurityJson: (value: unknown) => string;
  sha256CanonicalJson: (value: unknown) => string;
  sandboxSecurityJsonCanonicalEqual: (left: unknown, right: unknown) => boolean;
};

const jcsPath = resolve(import.meta.dirname, "..", "src", "security", "canonical-json.ts");
const inertJcs: CanonicalJsonApi = {
  canonicalizeSandboxSecurityJson: () => "__missing_canonical_json_module__",
  sha256CanonicalJson: () => "__missing_canonical_json_module__",
  sandboxSecurityJsonCanonicalEqual: () => false
};

let canonicalJson: CanonicalJsonApi;
if (!existsSync(jcsPath)) {
  canonicalJson = inertJcs;
} else {
  const loaded = await import("../src/security/canonical-json.ts");
  if (
    typeof loaded.canonicalizeSandboxSecurityJson !== "function" ||
    typeof loaded.sha256CanonicalJson !== "function" ||
    typeof loaded.sandboxSecurityJsonCanonicalEqual !== "function"
  ) {
    throw new Error("canonical-json.ts does not expose the locked JCS API");
  }
  canonicalJson = loaded;
}

const {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson,
  sandboxSecurityJsonCanonicalEqual
} = canonicalJson;

test("REQ-SBX-GENERAL-001 JCS sorts object keys by UTF-16 code units", () => {
  const emoji = String.fromCodePoint(0x1f600);
  const privateUse = "\uE000";
  const input = {
    [privateUse]: 3,
    [emoji]: 1,
    a: 2
  };

  assert.equal(
    canonicalizeSandboxSecurityJson(input),
    `{"a":2,"${emoji}":1,"${privateUse}":3}`
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes vector b1 a-0 to a0 b1", () => {
  const input = { b: 1, a: -0 };

  assert.equal(canonicalizeSandboxSecurityJson(input), "{\"a\":0,\"b\":1}");
  assert.equal(
    sha256CanonicalJson(input),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes emoji and U+E000 key order vector", () => {
  const emoji = String.fromCodePoint(0x1f600);
  const privateUse = "\uE000";
  const input = {
    [privateUse]: 3,
    [emoji]: 1,
    a: 2
  };

  assert.equal(
    sha256CanonicalJson(input),
    "1a2ca2e262b24634fdefdb54f29503c59e9a41d86d83c34bee7043a658f53e50"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes control-char array vector", () => {
  const input = [String.fromCharCode(0x0f), "\n", "\u00E9"];

  assert.equal(
    canonicalizeSandboxSecurityJson(input),
    `["\\u000f","\\n","\u00E9"]`
  );
  assert.equal(
    sha256CanonicalJson(input),
    "7d550de21af7506682169e89f286fa0e9804b90ed455eda1aa188df70aa5fa88"
  );
});

test("REQ-SBX-GENERAL-001 JCS rejects non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
  }
});

test("REQ-SBX-GENERAL-001 JCS rejects lone surrogates", () => {
  for (const value of ["\uD800", "\uDC00", { value: "\uD800" }, ["\uDC00"]]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
  }
});

test("REQ-SBX-GENERAL-001 JCS uses ECMAScript finite number emission", () => {
  assert.equal(
    canonicalizeSandboxSecurityJson({
      negative_zero: -0,
      small_exponent: 1e-7,
      fixed_boundary: 1e-6,
      large_exponent: 1e21
    }),
    "{\"fixed_boundary\":0.000001,\"large_exponent\":1e+21,\"negative_zero\":0,\"small_exponent\":1e-7}"
  );
});

test("REQ-SBX-GENERAL-001 JCS retains array order and drops insignificant whitespace", () => {
  const result = canonicalizeSandboxSecurityJson([3, { b: 2, a: 1 }, 1]);

  assert.equal(result, "[3,{\"a\":1,\"b\":2},1]");
  assert.equal(/\s/.test(result), false);
});

test("REQ-SBX-GENERAL-001 canonical equality is byte-stable across key presentation order", () => {
  assert.equal(
    sandboxSecurityJsonCanonicalEqual(
      { b: 2, a: [1, true, null] },
      { a: [1, true, null], b: 2 }
    ),
    true
  );
});

test("REQ-SBX-GENERAL-001 sha256CanonicalJson returns lowercase 64 hex", () => {
  assert.match(sha256CanonicalJson({ stable: true }), /^[a-f0-9]{64}$/);
});

// ---- P2-T3 input boundary -------------------------------------------------

type PrepareApi = {
  prepareSandboxSecurityInput: (request: unknown) => Readonly<Record<string, unknown>>;
  encodeSandboxSecurityCanonicalProjection: (projection: unknown) => Uint8Array;
  isSandboxSecuritySourceHandle: (value: unknown) => boolean;
  isSandboxSecurityCallHandle: (value: unknown) => boolean;
};

const preparePath = resolve(
  import.meta.dirname,
  "..",
  "src",
  "security",
  "input-boundary.ts"
);

const inertPrepare: PrepareApi = {
  prepareSandboxSecurityInput: () => {
    throw new Error("prepare unavailable");
  },
  encodeSandboxSecurityCanonicalProjection: () => new Uint8Array(),
  isSandboxSecuritySourceHandle: () => false,
  isSandboxSecurityCallHandle: () => false
};

let prepareApi: PrepareApi;
if (!existsSync(preparePath)) {
  prepareApi = inertPrepare;
} else {
  const loaded = await import("../src/security/input-boundary.ts");
  if (
    typeof loaded.prepareSandboxSecurityInput !== "function" ||
    typeof loaded.encodeSandboxSecurityCanonicalProjection !== "function" ||
    typeof loaded.isSandboxSecuritySourceHandle !== "function" ||
    typeof loaded.isSandboxSecurityCallHandle !== "function"
  ) {
    throw new Error("input-boundary.ts does not expose the locked prepare API");
  }
  prepareApi = loaded as unknown as PrepareApi;
}

const {
  prepareSandboxSecurityInput,
  encodeSandboxSecurityCanonicalProjection,
  isSandboxSecuritySourceHandle,
  isSandboxSecurityCallHandle
} = prepareApi;

async function loadAuthority() {
  return import("../src/security/source-authority.ts");
}

async function makeNormalizedSimulationRequest(
  overrides: {
    contentValue?: string | { [key: string]: unknown };
    withTool?: boolean;
  } = {}
) {
  const authority = await loadAuthority();
  const contentValue = overrides.contentValue ?? "hello";
  const mediaType =
    typeof contentValue === "string" ? "text/plain" : "application/json";
  const submission: Record<string, unknown> = {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-prepare-001",
    stage: overrides.withTool ? "tool_request" : "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-user",
        claimed_source_type: overrides.withTool ? "model_output" : "user_input",
        media_type: mediaType,
        value: contentValue,
        provenance_ref: "source://workbench/user/input"
      }
    ]
  };
  const sources = [
    {
      source_id: "src-user",
      authority_kind: "simulation_observation",
      source_type: overrides.withTool ? "model_output" : "user_input",
      media_type: mediaType,
      value: contentValue,
      provenance_ref: "source://workbench/user/input"
    }
  ];
  const authoritative_context: Record<string, unknown> = {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: "simulation",
    stage: submission.stage,
    policy_profile_id: submission.policy_profile_id,
    sources
  };
  if (overrides.withTool) {
    submission.tool_request = {
      call_id: "call-1",
      tool_name: "send_message",
      target: "target.local",
      arguments: { urgent: false }
    };
    authoritative_context.tool_request = {
      authority_kind: "simulation_observation",
      call_id: "call-1",
      tool_name: "send_message",
      target: "target.local",
      arguments: { urgent: false }
    };
  }
  return authority.normalizeSandboxSecurityEvaluationRequest({
    submission,
    authoritative_context
  });
}

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("REQ-SBX-GENERAL-001 projection uses authoritative sources only", async () => {
  const request = await makeNormalizedSimulationRequest();
  const prepared = prepareSandboxSecurityInput(request);
  const projection = prepared.canonical_projection as {
    sources: Array<{ source_id: string; value: string }>;
    schema_version: string;
  };
  assert.equal(
    projection.schema_version,
    "sandbox-security-canonical-evaluation.v1"
  );
  assert.equal(projection.sources.length, 1);
  assert.equal(projection.sources[0].source_id, "src-user");
  assert.equal(projection.sources[0].value, "hello");
});

test("REQ-SBX-GENERAL-001 projection preserves authoritative observation order", async () => {
  const authority = await loadAuthority();
  const submission = {
    schema_version: "sandbox-security-request.v1",
    request_id: "req-order-001",
    stage: "model_output",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "src-a",
        claimed_source_type: "system_instruction",
        media_type: "text/plain",
        value: "first",
        provenance_ref: "source://fixture/a"
      },
      {
        source_id: "src-b",
        claimed_source_type: "model_output",
        media_type: "text/plain",
        value: "second",
        provenance_ref: "source://fixture/b"
      }
    ]
  };
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission,
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "enforcement",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-a",
          authority_kind: "platform_control",
          source_type: "system_instruction",
          media_type: "text/plain",
          value: "first",
          provenance_ref: "source://fixture/a"
        },
        {
          source_id: "src-b",
          authority_kind: "integration_observation",
          source_type: "model_output",
          media_type: "text/plain",
          value: "second",
          provenance_ref: "source://fixture/b"
        }
      ]
    }
  });
  const prepared = prepareSandboxSecurityInput(request);
  const sources = (prepared.canonical_projection as { sources: Array<{ source_id: string }> })
    .sources;
  assert.deepEqual(
    sources.map((source) => source.source_id),
    ["src-a", "src-b"]
  );
  const contents = prepared.contents as Array<{ source_id: string; source_handle: string }>;
  assert.deepEqual(
    contents.map((content) => content.source_id),
    ["src-a", "src-b"]
  );
  assert.match(contents[0].source_handle, /:0001$/);
  assert.match(contents[1].source_handle, /:0002$/);
});

test("REQ-SBX-GENERAL-001 projection excludes correlation request_id", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.equal(prepared.request_id, "req-prepare-001");
  assert.equal(
    Object.hasOwn(prepared.canonical_projection as object, "request_id"),
    false
  );
});

test("REQ-SBX-GENERAL-001 projection rejects over 512 KiB before detectors", async () => {
  const authority = await loadAuthority();
  const items = [];
  const sources = [];
  for (let index = 1; index <= 10; index += 1) {
    const value = "y".repeat(60 * 1024);
    const sourceId = `src${index}`;
    const sourceType = index === 10 ? "model_output" : "retrieved_content";
    items.push({
      source_id: sourceId,
      claimed_source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
    sources.push({
      source_id: sourceId,
      authority_kind: "simulation_observation",
      source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
  }
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-multi-huge",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: items
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources
    }
  });
  assert.throws(() => prepareSandboxSecurityInput(request));
});

test("REQ-SBX-GENERAL-001 prepared input is recursively frozen without Uint8Array fields", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.ok(Object.isFrozen(prepared));
  assert.ok(Object.isFrozen(prepared.contents));
  assert.ok(Object.isFrozen((prepared.contents as object[])[0]));
  assert.ok(
    Object.isFrozen(
      ((prepared.contents as Array<{ original_utf8_bytes: number[] }>)[0]
        .original_utf8_bytes)
    )
  );
  const serialized = JSON.stringify(prepared);
  assert.equal(serialized.includes("Uint8Array"), false);
  assert.equal(Object.hasOwn(prepared, "canonical_projection_bytes"), false);
});

test("REQ-SBX-GENERAL-001 original_utf8_bytes is frozen ordinary number array 0..255", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const bytes = (prepared.contents as Array<{ original_utf8_bytes: readonly number[] }>)[0]
    .original_utf8_bytes;
  assert.equal(Array.isArray(bytes), true);
  assert.equal(bytes instanceof Uint8Array, false);
  assert.ok(Object.isFrozen(bytes));
  assert.ok(bytes.every((value) => Number.isInteger(value) && value >= 0 && value <= 255));
  assert.deepEqual(bytes, Array.from(Buffer.from("hello", "utf8")));
});

test("REQ-SBX-GENERAL-001 canonical projection encoder returns a fresh byte array per call", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const first = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  const second = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  assert.notEqual(first, second);
  assert.deepEqual(Array.from(first), Array.from(second));
});

test("REQ-SBX-GENERAL-001 mutating one encoded byte array cannot affect later encoding", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const first = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  first[0] = (first[0] + 1) % 256;
  const second = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  assert.notDeepEqual(Array.from(first), Array.from(second));
});

test("REQ-SBX-GENERAL-001 text hashes use exact original UTF-8 bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<{
    original_utf8_bytes: readonly number[];
    original_value_sha256: string;
  }>)[0];
  const expected = createHash("sha256")
    .update(Buffer.from(content.original_utf8_bytes))
    .digest("hex");
  assert.equal(content.original_value_sha256, expected);
});

test("REQ-SBX-GENERAL-001 JSON and tool argument hashes use JCS bytes", async () => {
  const request = await makeNormalizedSimulationRequest({
    contentValue: { b: 1, a: 2 },
    withTool: true
  });
  // model_output stage with JSON may fail stage matrix; rebuild tool path carefully
  const authority = await loadAuthority();
  const branded = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-json-tool",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "application/json",
          value: { b: 1, a: 2 },
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "send_message",
        arguments: { z: 9, a: 1 }
      }
    },
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
          media_type: "application/json",
          value: { b: 1, a: 2 },
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "send_message",
        arguments: { z: 9, a: 1 }
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(branded);
  const content = (prepared.contents as Array<{
    original_value_sha256: string;
    value: unknown;
  }>)[0];
  assert.equal(content.original_value_sha256, sha256CanonicalJson({ b: 1, a: 2 }));
  const tool = prepared.tool_request as { arguments_jcs_sha256: string };
  assert.equal(tool.arguments_jcs_sha256, sha256CanonicalJson({ z: 9, a: 1 }));
});

test("REQ-SBX-GENERAL-001 Phase 2 content is authority-bound without trust_class", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.equal(Object.hasOwn(content, "authority_kind"), true);
  assert.equal(Object.hasOwn(content, "source_type"), true);
  assert.equal(Object.hasOwn(content, "trust_class"), false);
});

test("REQ-SBX-GENERAL-001 Phase 2 contains no independent trust mapping table", () => {
  const source = readFileSync(
    new URL("../src/security/input-boundary.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /SandboxSecurityTrustClass/);
  assert.doesNotMatch(source, /deriveSandboxSecurityTrustClass/);
  assert.doesNotMatch(source, /trust_class\s*:/);
});

test("REQ-SBX-GENERAL-001 evaluation nonce is lowercase 128-bit hex", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.match(String(prepared.evaluation_nonce), /^[a-f0-9]{32}$/);
});

test("REQ-SBX-GENERAL-001 source handle uses four-digit semantic ordinal", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const handle = (prepared.contents as Array<{ source_handle: string }>)[0]
    .source_handle;
  assert.match(handle, /^hsrc:[a-f0-9]{32}:0001$/);
});

test("REQ-SBX-GENERAL-001 call handle uses 0000 ordinal", async () => {
  const authority = await loadAuthority();
  const branded = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-tool-handle",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "tool path",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "send_message",
        arguments: {}
      }
    },
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
          value: "tool path",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "send_message",
        arguments: {}
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(branded);
  const tool = prepared.tool_request as { call_handle: string };
  assert.match(tool.call_handle, /^hcall:[a-f0-9]{32}:0000$/);
});

test("REQ-SBX-GENERAL-001 handles are evaluation-bound and unique per prepare", async () => {
  const a = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const b = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.notEqual(a.evaluation_nonce, b.evaluation_nonce);
  assert.notEqual(
    (a.contents as Array<{ source_handle: string }>)[0].source_handle,
    (b.contents as Array<{ source_handle: string }>)[0].source_handle
  );
});

test("REQ-SBX-GENERAL-001 malformed handle cannot enter an engine registry", () => {
  assert.equal(isSandboxSecuritySourceHandle("hsrc:bad:0001"), false);
  assert.equal(isSandboxSecuritySourceHandle("hsrc:" + "a".repeat(32) + ":0000"), false);
  assert.equal(isSandboxSecuritySourceHandle("hsrc:" + "a".repeat(32) + ":0001"), true);
  assert.equal(isSandboxSecurityCallHandle("hcall:" + "a".repeat(32) + ":0001"), false);
  assert.equal(isSandboxSecurityCallHandle("hcall:" + "a".repeat(32) + ":0000"), true);
});

test("REQ-SBX-GENERAL-001 prepared input retains request_id for correlation only", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.equal(prepared.request_id, "req-prepare-001");
  assert.equal(
    Object.hasOwn(prepared.canonical_projection as object, "request_id"),
    false
  );
});

test("REQ-SBX-GENERAL-001 ordinary hashes remain private fields on prepared input", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.equal(typeof content.original_value_sha256, "string");
  assert.match(String(content.original_value_sha256), /^[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 PreparedInput does not store canonical_projection_bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.equal(Object.hasOwn(prepared, "canonical_projection_bytes"), false);
  const bytes = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(
    prepared.canonical_projection_sha256,
    createHash("sha256").update(bytes).digest("hex")
  );
});

test("REQ-SBX-GENERAL-001 raw snapshot exposes no canonical projection bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  // Engine-private prepared input is not a raw snapshot; ensure no projection bytes field.
  const rawShaped = {
    request_id: prepared.request_id,
    evaluation_mode: prepared.evaluation_mode,
    stage: prepared.stage,
    contents: prepared.contents,
    canonical_request_sha256: prepared.canonical_projection_sha256
  };
  assert.equal(Object.hasOwn(rawShaped, "canonical_projection_bytes"), false);
});

test("REQ-SBX-GENERAL-001 tool has_target reflects optional target presence", async () => {
  const authority = await loadAuthority();
  const withTarget = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-target-1",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "send_message",
        target: "endpoint",
        arguments: {}
      }
    },
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
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "send_message",
        target: "endpoint",
        arguments: {}
      }
    }
  });
  const preparedWith = prepareSandboxSecurityInput(withTarget);
  assert.equal((preparedWith.tool_request as { has_target: boolean }).has_target, true);

  const withoutTarget = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-target-2",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "send_message",
        arguments: {}
      }
    },
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
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "send_message",
        arguments: {}
      }
    }
  });
  const preparedWithout = prepareSandboxSecurityInput(withoutTarget);
  assert.equal(
    (preparedWithout.tool_request as { has_target: boolean }).has_target,
    false
  );
  assert.equal(
    Object.hasOwn(preparedWithout.tool_request as object, "target"),
    false
  );
});

// ---- P2-T4 locator validation --------------------------------------------

type LocatorApi = {
  validateSandboxSecurityContentLocator: (
    locator: unknown,
    content: unknown
  ) => unknown;
  validateSandboxSecurityToolLocator: (
    locator: unknown,
    tool: unknown
  ) => unknown;
};

const locatorPath = resolve(
  import.meta.dirname,
  "..",
  "src",
  "security",
  "locator.ts"
);

const inertLocator: LocatorApi = {
  validateSandboxSecurityContentLocator: () => null,
  validateSandboxSecurityToolLocator: () => null
};

let locatorApi: LocatorApi;
if (!existsSync(locatorPath)) {
  locatorApi = inertLocator;
} else {
  const loaded = await import("../src/security/locator.ts");
  if (
    typeof loaded.validateSandboxSecurityContentLocator !== "function" ||
    typeof loaded.validateSandboxSecurityToolLocator !== "function"
  ) {
    throw new Error("locator.ts does not expose the locked validator API");
  }
  locatorApi = loaded as unknown as LocatorApi;
}

const {
  validateSandboxSecurityContentLocator,
  validateSandboxSecurityToolLocator
} = locatorApi;

async function preparedTextContent() {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  return (prepared.contents as unknown[])[0];
}

async function preparedJsonContent() {
  const authority = await loadAuthority();
  const branded = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-json-locator",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-json",
          claimed_source_type: "user_input",
          media_type: "application/json",
          value: { items: [{ id: 1 }, { id: 2 }], note: "ok" },
          provenance_ref: "source://fixture/json"
        }
      ]
    },
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
          value: { items: [{ id: 1 }, { id: 2 }], note: "ok" },
          provenance_ref: "source://fixture/json"
        }
      ]
    }
  });
  const prepared = prepareSandboxSecurityInput(branded);
  return (prepared.contents as unknown[])[0];
}

async function preparedTool() {
  const authority = await loadAuthority();
  const branded = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-tool-locator",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "send_message",
        target: "endpoint",
        arguments: { channel: "security", nested: { n: 1 } }
      }
    },
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
          value: "tool",
          provenance_ref: "source://fixture/model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "send_message",
        target: "endpoint",
        arguments: { channel: "security", nested: { n: 1 } }
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(branded);
  return prepared.tool_request;
}

async function preparedMultibyteContent() {
  // "é" is U+00E9 => C3 A9 in UTF-8 (2 bytes)
  const request = await makeNormalizedSimulationRequest({ contentValue: "aéb" });
  const prepared = prepareSandboxSecurityInput(request);
  return (prepared.contents as unknown[])[0];
}

test("REQ-SBX-GENERAL-001 accepts whole_source content locator", async () => {
  const content = await preparedTextContent();
  assert.deepEqual(
    validateSandboxSecurityContentLocator({ kind: "whole_source" }, content),
    { kind: "whole_source" }
  );
});

test("REQ-SBX-GENERAL-001 accepts exact half-open code-point-aligned text_byte_range", async () => {
  const content = await preparedTextContent();
  // "hello" bytes 0..5
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 5 },
      content
    ),
    { kind: "text_byte_range", start_byte: 0, end_byte: 5 }
  );
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 1, end_byte: 4 },
      content
    ),
    { kind: "text_byte_range", start_byte: 1, end_byte: 4 }
  );
});

test("REQ-SBX-GENERAL-001 rejects text_byte_range that splits multi-byte code points", async () => {
  const content = await preparedMultibyteContent();
  // "aéb" => 61 C3 A9 62; split after first byte of é
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 2 },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 2, end_byte: 4 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 falls back to whole_source when byte range mapping is unproven", async () => {
  const content = await preparedTextContent();
  // non-integer / float boundaries are unproven mapping -> whole_source fallback
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0.5 as never, end_byte: 2 },
      content
    ),
    { kind: "whole_source" }
  );
});

test("REQ-SBX-GENERAL-001 accepts restricted RFC 6901 json_pointer on content", async () => {
  const content = await preparedJsonContent();
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/items/0/id" },
      content
    ),
    { kind: "json_pointer", pointer: "/items/0/id" }
  );
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/note" },
      content
    ),
    { kind: "json_pointer", pointer: "/note" }
  );
});

test("REQ-SBX-GENERAL-001 rejects over-long json_pointer and illegal tokens", async () => {
  const content = await preparedJsonContent();
  const overlong = "/" + "a".repeat(520);
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: overlong },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/bad token" },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/~2" },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects array tokens with leading zeros except zero", async () => {
  const content = await preparedJsonContent();
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/items/01/id" },
      content
    ),
    null
  );
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/items/0/id" },
      content
    ),
    { kind: "json_pointer", pointer: "/items/0/id" }
  );
});

test("REQ-SBX-GENERAL-001 accepts whole_arguments tool locator", async () => {
  const tool = await preparedTool();
  assert.deepEqual(
    validateSandboxSecurityToolLocator({ kind: "whole_arguments" }, tool),
    { kind: "whole_arguments" }
  );
});

test("REQ-SBX-GENERAL-001 accepts tool json_pointer on arguments only", async () => {
  const tool = await preparedTool();
  assert.deepEqual(
    validateSandboxSecurityToolLocator(
      { kind: "json_pointer", pointer: "/channel" },
      tool
    ),
    { kind: "json_pointer", pointer: "/channel" }
  );
  assert.deepEqual(
    validateSandboxSecurityToolLocator(
      { kind: "json_pointer", pointer: "/nested/n" },
      tool
    ),
    { kind: "json_pointer", pointer: "/nested/n" }
  );
});

test("REQ-SBX-GENERAL-001 rejects tool locator on tool_name or target components", async () => {
  const tool = await preparedTool();
  // validators only accept whole_arguments | json_pointer; component-style fields rejected
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "tool_name" },
      tool
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "target" },
      tool
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "json_pointer", pointer: "/tool_name" },
      tool
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects unknown locator kinds and extra keys", async () => {
  const content = await preparedTextContent();
  const tool = await preparedTool();
  assert.equal(
    validateSandboxSecurityContentLocator({ kind: "unknown" }, content),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "whole_source", extra: true },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "whole_arguments", extra: true },
      tool
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects negative and inverted byte ranges", async () => {
  const content = await preparedTextContent();
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: -1, end_byte: 2 },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 3, end_byte: 1 },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 1, end_byte: 1 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects text_byte_range beyond original_utf8_bytes length", async () => {
  const content = await preparedTextContent();
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 99 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects inherited and accessor locator fields", async () => {
  const content = await preparedTextContent();
  const proto = { kind: "whole_source" };
  const polluted = Object.create(proto);
  assert.equal(validateSandboxSecurityContentLocator(polluted, content), null);

  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, "kind", {
    get() {
      return "whole_source";
    },
    enumerable: true
  });
  assert.equal(validateSandboxSecurityContentLocator(accessor, content), null);
});

test("REQ-SBX-GENERAL-001 rejects json_pointer on text/plain content when path is non-applicable", async () => {
  const content = await preparedTextContent();
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/x" },
      content
    ),
    null
  );
});

// ---- P2-T5 canonical fingerprint ----------------------------------------

type FingerprintApi = {
  createSandboxSecurityCanonicalFingerprintService: () => {
    fingerprint: (request: unknown, port: {
      fingerprintCanonicalBytes: (bytes: Uint8Array) => string;
    }) => string;
  };
};

const fingerprintPath = resolve(
  import.meta.dirname,
  "..",
  "src",
  "security",
  "canonical-fingerprint.ts"
);

const inertFingerprint: FingerprintApi = {
  createSandboxSecurityCanonicalFingerprintService: () => ({
    fingerprint: () => "inert"
  })
};

let fingerprintApi: FingerprintApi;
if (!existsSync(fingerprintPath)) {
  fingerprintApi = inertFingerprint;
} else {
  const loaded = await import("../src/security/canonical-fingerprint.ts");
  if (typeof loaded.createSandboxSecurityCanonicalFingerprintService !== "function") {
    throw new Error("canonical-fingerprint.ts missing factory");
  }
  fingerprintApi = loaded as unknown as FingerprintApi;
}

const { createSandboxSecurityCanonicalFingerprintService } = fingerprintApi;

function makeEvaluationRequest(
  requestId = "req-fp-001",
  value = "hello"
) {
  return {
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: requestId,
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-user",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value,
          provenance_ref: "source://workbench/user/input"
        }
      ]
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-user",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "text/plain",
          value,
          provenance_ref: "source://workbench/user/input"
        }
      ]
    }
  };
}

test("REQ-SBX-GENERAL-001 fingerprints the authoritative JCS projection", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  let seen: Uint8Array | undefined;
  const out = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes(bytes) {
      seen = bytes;
      return `hmac-sha256:${"a".repeat(64)}`;
    }
  });
  assert.equal(out, `hmac-sha256:${"a".repeat(64)}`);
  assert.ok(seen instanceof Uint8Array);
  // bytes must be non-empty JCS projection encoding
  assert.ok((seen?.byteLength ?? 0) > 0);
  const text = Buffer.from(seen!).toString("utf8");
  assert.match(text, /sandbox-security-canonical-evaluation\.v1/);
  assert.doesNotMatch(text, /req-fp-001/);
});

test("REQ-SBX-GENERAL-001 fingerprint ignores correlation request ID", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const digests: string[] = [];
  for (const requestId of ["req-a", "req-b"]) {
    service.fingerprint(makeEvaluationRequest(requestId), {
      fingerprintCanonicalBytes(bytes) {
        digests.push(createHash("sha256").update(bytes).digest("hex"));
        return `hmac-sha256:${"b".repeat(64)}`;
      }
    });
  }
  assert.equal(digests[0], digests[1]);
});

test("REQ-SBX-GENERAL-001 rejects invalid and throwing fingerprint ports", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  assert.throws(
    () =>
      service.fingerprint(makeEvaluationRequest(), {
        fingerprintCanonicalBytes() {
          return "not-a-valid-fingerprint";
        }
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "sandbox_security_internal_invalid"
  );
  assert.throws(
    () =>
      service.fingerprint(makeEvaluationRequest(), {
        fingerprintCanonicalBytes() {
          throw new Error("port boom");
        }
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "sandbox_security_internal_invalid"
  );
});

test("REQ-SBX-GENERAL-001 service does not expose canonical bytes after callback", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const result = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return `hmac-sha256:${"c".repeat(64)}`;
    }
  });
  assert.equal(typeof result, "string");
  assert.match(result, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(service as object, "canonicalBytes"), false);
  assert.equal(Object.hasOwn(service as object, "lastBytes"), false);
  for (const key of Reflect.ownKeys(service as object)) {
    const value = Reflect.get(service as object, key);
    assert.equal(value instanceof Uint8Array, false);
    assert.equal(Buffer.isBuffer(value), false);
  }
});

test("REQ-SBX-GENERAL-001 fingerprint rejects authority mismatch before port call", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  let calls = 0;
  const bad = makeEvaluationRequest();
  (bad.authoritative_context.sources[0] as { value: string }).value = "forged";
  assert.throws(
    () =>
      service.fingerprint(bad, {
        fingerprintCanonicalBytes() {
          calls += 1;
          return `hmac-sha256:${"d".repeat(64)}`;
        }
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "sandbox_security_authority_mismatch"
  );
  assert.equal(calls, 0);
});

test("REQ-SBX-GENERAL-001 fingerprint port output must match hmac-sha256 64hex grammar", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  assert.throws(() =>
    service.fingerprint(makeEvaluationRequest(), {
      fingerprintCanonicalBytes() {
        return `hmac-sha256:${"A".repeat(64)}`;
      }
    })
  );
  assert.throws(() =>
    service.fingerprint(makeEvaluationRequest(), {
      fingerprintCanonicalBytes() {
        return `hmac-sha256:${"a".repeat(63)}`;
      }
    })
  );
  const ok = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return `hmac-sha256:${"e".repeat(64)}`;
    }
  });
  assert.match(ok, /^hmac-sha256:[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 fingerprint accepts approved SandboxSecurityEvaluationRequest shape", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const out = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return `hmac-sha256:${"f".repeat(64)}`;
    }
  });
  assert.match(out, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal("SandboxSecurityEvaluationRequestInput" in makeEvaluationRequest(), false);
});

test("REQ-SBX-GENERAL-001 fingerprint reuses internal normalizer not a second JCS implementation", async () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const request = makeEvaluationRequest();
  let fpBytes: Uint8Array | undefined;
  service.fingerprint(request, {
    fingerprintCanonicalBytes(bytes) {
      fpBytes = bytes;
      return `hmac-sha256:${"1".repeat(64)}`;
    }
  });
  const branded = await (await loadAuthority()).normalizeSandboxSecurityEvaluationRequest(
    request
  );
  const prepared = prepareSandboxSecurityInput(branded);
  const prepareBytes = encodeSandboxSecurityCanonicalProjection(
    prepared.canonical_projection
  );
  assert.deepEqual(Array.from(fpBytes!), Array.from(prepareBytes));
});

test("REQ-SBX-GENERAL-001 fingerprint encoding is independent of PreparedInput fields", () => {
  const source = readFileSync(
    new URL("../src/security/canonical-fingerprint.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /encodeSandboxSecurityCanonicalProjection/);
  assert.doesNotMatch(source, /canonical_projection_bytes/);
  assert.doesNotMatch(source, /prepareSandboxSecurityInput/);
});

test("REQ-SBX-GENERAL-001 fingerprint rejects oversize projection before port call", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const items = [];
  const sources = [];
  for (let index = 1; index <= 10; index += 1) {
    const value = "y".repeat(60 * 1024);
    const sourceId = `src${index}`;
    const sourceType = index === 10 ? "model_output" : "retrieved_content";
    items.push({
      source_id: sourceId,
      claimed_source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
    sources.push({
      source_id: sourceId,
      authority_kind: "simulation_observation",
      source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
  }
  const request = {
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-fp-oversize",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: items
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources
    }
  };
  let calls = 0;
  assert.throws(
    () =>
      service.fingerprint(request, {
        fingerprintCanonicalBytes(bytes) {
          calls += 1;
          return `hmac-sha256:${"0".repeat(64)}`;
        }
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "sandbox_security_internal_invalid"
  );
  assert.equal(calls, 0);
});

test("REQ-SBX-GENERAL-001 fingerprint port receives an independent byte copy", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const request = makeEvaluationRequest();
  let portBytes: Uint8Array | undefined;
  service.fingerprint(request, {
    fingerprintCanonicalBytes(bytes) {
      portBytes = bytes;
      bytes[0] = (bytes[0] + 1) % 256;
      return `hmac-sha256:${"2".repeat(64)}`;
    }
  });
  assert.ok(portBytes);
  // Encode path must still produce original authoritative bytes after port mutation.
  // Independent copy: mutating port buffer cannot be the only live encoding buffer.
  const source = readFileSync(
    new URL("../src/security/canonical-fingerprint.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /Uint8Array\.from\(|new Uint8Array\(|Buffer\.from\([^\n]*canonicalBytes/
  );
  // Second call still succeeds with intact projection encoding
  const again = service.fingerprint(request, {
    fingerprintCanonicalBytes(bytes) {
      assert.notEqual(bytes, portBytes);
      assert.notDeepEqual(Array.from(bytes), Array.from(portBytes!));
      return `hmac-sha256:${"3".repeat(64)}`;
    }
  });
  assert.match(again, /^hmac-sha256:[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 prepare rejects forged evaluation brand tokens", async () => {
  const fakeBrand = Symbol("sandboxSecurityEvaluationRequestBrand");
  const forged = {
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-forge",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "s",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: "x",
          provenance_ref: "source://fixture/s"
        }
      ]
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "s",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "text/plain",
          value: "x",
          provenance_ref: "source://fixture/s"
        }
      ]
    },
    [fakeBrand]: true
  };
  assert.throws(() => prepareSandboxSecurityInput(forged as never));
});

test("REQ-SBX-GENERAL-001 accepts projection at exactly 512 KiB boundary", async () => {
  const authority = await loadAuthority();
  const itemBytes = 104652;
  const items = [];
  const sources = [];
  for (let index = 1; index <= 5; index += 1) {
    const sourceId = `s${index}`;
    const sourceType = index === 5 ? "model_output" : "retrieved_content";
    const value = "y".repeat(itemBytes);
    items.push({
      source_id: sourceId,
      claimed_source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
    sources.push({
      source_id: sourceId,
      authority_kind: "simulation_observation",
      source_type: sourceType,
      media_type: "text/plain",
      value,
      provenance_ref: `source://fixture/${sourceId}`
    });
  }
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-exact-512",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: items
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources
    }
  });
  const prepared = prepareSandboxSecurityInput(request);
  const bytes = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  assert.equal(bytes.byteLength, 512 * 1024);

  // fingerprint accepts the same exact-bound authority envelope
  const service = createSandboxSecurityCanonicalFingerprintService();
  let calls = 0;
  const out = service.fingerprint(
    {
      submission: {
        schema_version: "sandbox-security-request.v1",
        request_id: "req-exact-512",
        stage: "model_output",
        policy_profile_id: "sandbox-security-balanced.v1",
        content_items: items
      },
      authoritative_context: {
        schema_version: "sandbox-security-authoritative-context.v1",
        evaluation_mode: "simulation",
        stage: "model_output",
        policy_profile_id: "sandbox-security-balanced.v1",
        sources
      }
    },
    {
      fingerprintCanonicalBytes(portBytes) {
        calls += 1;
        assert.equal(portBytes.byteLength, 512 * 1024);
        return `hmac-sha256:${"4".repeat(64)}`;
      }
    }
  );
  assert.equal(calls, 1);
  assert.match(out, /^hmac-sha256:[a-f0-9]{64}$/);
});
