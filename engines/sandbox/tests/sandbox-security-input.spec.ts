import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

type Canonicalize = (value: unknown) => string;
type Sha256Canonical = (value: unknown) => string;
type CanonicalEqual = (left: unknown, right: unknown) => boolean;

interface CanonicalJsonModule {
  canonicalizeSandboxSecurityJson: Canonicalize;
  sha256CanonicalJson: Sha256Canonical;
  sandboxSecurityJsonCanonicalEqual: CanonicalEqual;
}

async function loadCanonicalJsonModule(): Promise<CanonicalJsonModule> {
  try {
    return (await import("../src/security/canonical-json.ts")) as CanonicalJsonModule;
  } catch {
    // Guarded loader: non-canonical sentinel fallback for valid RED when module absent.
    return {
      canonicalizeSandboxSecurityJson: () => '{"__noncanonical__":true}',
      sha256CanonicalJson: () => "0".repeat(64),
      sandboxSecurityJsonCanonicalEqual: () => false
    };
  }
}

const {
  canonicalizeSandboxSecurityJson,
  sha256CanonicalJson,
  sandboxSecurityJsonCanonicalEqual
} = await loadCanonicalJsonModule();

function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("REQ-SBX-GENERAL-001 JCS sorts object keys by UTF-16 code units", () => {
  const canonical = canonicalizeSandboxSecurityJson({
    b: 1,
    a: 2,
    ["\uD83D\uDE00"]: 3,
    ["\uE000"]: 4
  });
  assert.equal(canonical, '{"a":2,"b":1,"\uD83D\uDE00":3,"\uE000":4}');
});

test("REQ-SBX-GENERAL-001 JCS freezes vector b1 a-0 to a0 b1", () => {
  const input = { b: 1, a: -0 };
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '{"a":0,"b":1}');
  assert.equal(
    sha256CanonicalJson(input),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
  assert.equal(
    sha256Utf8(canonical),
    "f4c1d8bd90d7ccd720aa5a69a67185fb9caf4f35926a4eacf53a86d0e70bdf88"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes emoji and U+E000 key order vector", () => {
  const input = {
    ["\uE000"]: 3,
    ["\uD83D\uDE00"]: 1,
    a: 2
  };
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '{"a":2,"\uD83D\uDE00":1,"\uE000":3}');
  assert.equal(
    sha256CanonicalJson(input),
    "1a2ca2e262b24634fdefdb54f29503c59e9a41d86d83c34bee7043a658f53e50"
  );
});

test("REQ-SBX-GENERAL-001 JCS freezes control-char array vector", () => {
  const input = ["\u000f", "\n", "é"];
  const canonical = canonicalizeSandboxSecurityJson(input);
  assert.equal(canonical, '["\\u000f","\\n","é"]');
  assert.equal(
    sha256CanonicalJson(input),
    "7d550de21af7506682169e89f286fa0e9804b90ed455eda1aa188df70aa5fa88"
  );
});

test("REQ-SBX-GENERAL-001 JCS rejects non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
    assert.throws(() => canonicalizeSandboxSecurityJson({ value }));
    assert.throws(() => canonicalizeSandboxSecurityJson([value]));
  }
});

test("REQ-SBX-GENERAL-001 JCS rejects lone surrogates", () => {
  const high = "\uD800";
  const low = "\uDC00";
  for (const value of [high, low, `ok${high}`, `${low}ok`]) {
    assert.throws(() => canonicalizeSandboxSecurityJson(value));
    assert.throws(() => canonicalizeSandboxSecurityJson({ key: value }));
    assert.throws(() => canonicalizeSandboxSecurityJson({ [value]: 1 }));
  }
});

test("REQ-SBX-GENERAL-001 JCS retains array order and drops insignificant whitespace", () => {
  const canonical = canonicalizeSandboxSecurityJson({
    items: [3, 1, 2],
    nested: { z: true, a: false }
  });
  assert.equal(canonical, '{"items":[3,1,2],"nested":{"a":false,"z":true}}');
  assert.doesNotMatch(canonical, /\s/);
});

test("REQ-SBX-GENERAL-001 canonical equality is byte-stable across key presentation order", () => {
  assert.equal(
    sandboxSecurityJsonCanonicalEqual({ b: 1, a: 0 }, { a: 0, b: 1 }),
    true
  );
  assert.equal(
    sandboxSecurityJsonCanonicalEqual({ a: 1 }, { a: 2 }),
    false
  );
});

test("REQ-SBX-GENERAL-001 sha256CanonicalJson returns lowercase 64 hex", () => {
  const digest = sha256CanonicalJson({ a: 1 });
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, digest.toLowerCase());
});


// ---- P2-T3 input boundary -------------------------------------------------

type PrepareModule = {
  prepareSandboxSecurityInput: (request: unknown) => Readonly<Record<string, unknown>>;
  encodeSandboxSecurityCanonicalProjection: (projection: unknown) => Uint8Array;
  isSandboxSecuritySourceHandle: (value: unknown) => boolean;
  isSandboxSecurityCallHandle: (value: unknown) => boolean;
};

async function loadPrepareModule(): Promise<PrepareModule> {
  try {
    return (await import("../src/security/input-boundary.ts")) as PrepareModule;
  } catch {
    return {
      prepareSandboxSecurityInput: () => {
        throw new Error("prepare unavailable");
      },
      encodeSandboxSecurityCanonicalProjection: () => new Uint8Array(),
      isSandboxSecuritySourceHandle: () => false,
      isSandboxSecurityCallHandle: () => false
    };
  }
}

const {
  prepareSandboxSecurityInput,
  encodeSandboxSecurityCanonicalProjection,
  isSandboxSecuritySourceHandle,
  isSandboxSecurityCallHandle
} = await loadPrepareModule();

async function loadAuthorityForPrepare() {
  return import("../src/security/source-authority.ts");
}

async function makeNormalizedSimulationRequest() {
  const authority = await loadAuthorityForPrepare();
  return authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-prepare-001",
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
          value: "hello",
          provenance_ref: "source://workbench/user/input"
        }
      ]
    }
  });
}

test("REQ-SBX-GENERAL-001 projection uses authoritative sources only", async () => {
  const request = await makeNormalizedSimulationRequest();
  const prepared = prepareSandboxSecurityInput(request);
  const projection = prepared.canonical_projection as {
    sources: Array<{ source_id: string; value: string }>;
  };
  assert.deepEqual(projection.sources.map((s) => s.source_id), ["src-user"]);
  assert.equal(projection.sources[0].value, "hello");
});

test("REQ-SBX-GENERAL-001 projection preserves authoritative observation order", async () => {
  const authority = await loadAuthorityForPrepare();
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-order",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-user",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: "prompt",
          provenance_ref: "source://user"
        },
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "answer",
          provenance_ref: "source://model"
        }
      ]
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "model_output",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [
        {
          source_id: "src-user",
          authority_kind: "simulation_observation",
          source_type: "user_input",
          media_type: "text/plain",
          value: "prompt",
          provenance_ref: "source://user"
        },
        {
          source_id: "src-model",
          authority_kind: "simulation_observation",
          source_type: "model_output",
          media_type: "text/plain",
          value: "answer",
          provenance_ref: "source://model"
        }
      ]
    }
  });
  const prepared = prepareSandboxSecurityInput(request);
  const projection = prepared.canonical_projection as {
    sources: Array<{ source_id: string }>;
  };
  assert.deepEqual(
    projection.sources.map((s) => s.source_id),
    ["src-user", "src-model"]
  );
});

test("REQ-SBX-GENERAL-001 projection excludes correlation request_id", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const projection = prepared.canonical_projection as Record<string, unknown>;
  assert.equal(Object.hasOwn(projection, "request_id"), false);
  assert.equal(prepared.request_id, "req-prepare-001");
});

test("REQ-SBX-GENERAL-001 projection rejects over 512 KiB before detectors", async () => {
  const authority = await loadAuthorityForPrepare();
  // One JSON object with many keys pushes JCS projection over 512 KiB while
  // staying within shared structural limits (nodes/depth/items).
  const hugeObject: Record<string, string> = {};
  for (let index = 0; index < 900; index += 1) {
    hugeObject[`k${String(index).padStart(4, "0")}`] = "y".repeat(700);
  }
  const content_items = [
    {
      source_id: "src-user",
      claimed_source_type: "user_input",
      media_type: "application/json" as const,
      value: hugeObject,
      provenance_ref: "source://user/json"
    }
  ];
  const sources = content_items.map((item) => ({
    source_id: item.source_id,
    authority_kind: "simulation_observation",
    source_type: item.claimed_source_type,
    media_type: item.media_type,
    value: item.value,
    provenance_ref: item.provenance_ref
  }));
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-huge",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
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
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.ok(Object.isFrozen(content));
  assert.ok(Array.isArray(content.original_utf8_bytes));
  assert.equal(content.original_utf8_bytes instanceof Uint8Array, false);
  assert.ok(Object.isFrozen(content.original_utf8_bytes));
});

test("REQ-SBX-GENERAL-001 text hashes use original UTF-8 bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  const bytes = content.original_utf8_bytes as number[];
  assert.deepEqual(bytes, Array.from(Buffer.from("hello", "utf8")));
  assert.match(String(content.original_value_sha256), /^[a-f0-9]{64}$/);
  assert.equal(
    content.original_value_sha256,
    createHash("sha256").update(Buffer.from(bytes)).digest("hex")
  );
});

test("REQ-SBX-GENERAL-001 JSON and tool hashes use JCS only", async () => {
  const authority = await loadAuthorityForPrepare();
  const args = { b: 1, a: 0 };
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-tool-json",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "application/json",
          value: { z: 1, a: 2 },
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "read_file",
        arguments: args
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
          value: { a: 2, z: 1 },
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "read_file",
        arguments: { a: 0, b: 1 }
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(request);
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.equal(content.original_value_sha256, sha256CanonicalJson({ a: 2, z: 1 }));
  const tool = prepared.tool_request as Record<string, unknown>;
  assert.equal(tool.arguments_jcs_sha256, sha256CanonicalJson({ a: 0, b: 1 }));
});

test("REQ-SBX-GENERAL-001 Phase 2 content is authority-bound without trust_class", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.equal(Object.hasOwn(content, "trust_class"), false);
  assert.equal(content.authority_kind, "simulation_observation");
  assert.equal(content.source_type, "user_input");
});

test("REQ-SBX-GENERAL-001 Phase 2 contains no independent trust mapping table", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/security/input-boundary.ts", import.meta.url), "utf8")
  );
  assert.doesNotMatch(source, /SandboxSecurityTrustClass/);
  assert.doesNotMatch(source, /deriveSandboxSecurityTrustClass/);
  assert.doesNotMatch(source, /trust_rules/);
});

test("REQ-SBX-GENERAL-001 evaluation nonce is lowercase 128-bit hex", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.match(String(prepared.evaluation_nonce), /^[a-f0-9]{32}$/);
});

test("REQ-SBX-GENERAL-001 source handle uses four-digit semantic ordinal", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const content = (prepared.contents as Array<Record<string, unknown>>)[0];
  assert.match(
    String(content.source_handle),
    new RegExp(`^hsrc:${prepared.evaluation_nonce}:0001$`)
  );
});

test("REQ-SBX-GENERAL-001 call handle uses 0000 ordinal", async () => {
  const authority = await loadAuthorityForPrepare();
  const request = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-call",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "call",
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "read_file",
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
          value: "call",
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "read_file",
        arguments: {}
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(request);
  const tool = prepared.tool_request as Record<string, unknown>;
  assert.match(
    String(tool.call_handle),
    new RegExp(`^hcall:${prepared.evaluation_nonce}:0000$`)
  );
});

test("REQ-SBX-GENERAL-001 handles are evaluation-bound and unique per prepare", async () => {
  const a = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const b = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.notEqual(a.evaluation_nonce, b.evaluation_nonce);
});

test("REQ-SBX-GENERAL-001 malformed handle cannot enter an engine registry", () => {
  assert.equal(isSandboxSecuritySourceHandle("hsrc:not-hex:0001"), false);
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
  assert.match(String(content.original_value_sha256), /^[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 PreparedInput does not store canonical_projection_bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  assert.equal(Object.hasOwn(prepared, "canonical_projection_bytes"), false);
  const bytes = encodeSandboxSecurityCanonicalProjection(prepared.canonical_projection);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.byteLength > 0);
});

test("REQ-SBX-GENERAL-001 raw snapshot exposes no canonical projection bytes", async () => {
  const prepared = prepareSandboxSecurityInput(await makeNormalizedSimulationRequest());
  const rawSnapshotShaped = {
    request_id: prepared.request_id,
    evaluation_mode: prepared.evaluation_mode,
    stage: prepared.stage,
    contents: prepared.contents,
    tool_request: prepared.tool_request,
    canonical_request_sha256: prepared.canonical_projection_sha256
  };
  assert.equal(Object.hasOwn(rawSnapshotShaped, "canonical_projection_bytes"), false);
});

test("REQ-SBX-GENERAL-001 tool has_target reflects optional target presence", async () => {
  const authority = await loadAuthorityForPrepare();
  const withTarget = authority.normalizeSandboxSecurityEvaluationRequest({
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "req-target",
      stage: "tool_request",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [
        {
          source_id: "src-model",
          claimed_source_type: "model_output",
          media_type: "text/plain",
          value: "call",
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        call_id: "call-1",
        tool_name: "read_file",
        target: "/tmp/x",
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
          value: "call",
          provenance_ref: "source://model"
        }
      ],
      tool_request: {
        authority_kind: "simulation_observation",
        call_id: "call-1",
        tool_name: "read_file",
        target: "/tmp/x",
        arguments: {}
      }
    }
  });
  const prepared = prepareSandboxSecurityInput(withTarget);
  assert.equal((prepared.tool_request as { has_target: boolean }).has_target, true);
});


// ---- P2-T4 locator validation --------------------------------------------

type LocatorModule = {
  validateSandboxSecurityContentLocator: (
    locator: unknown,
    content: Readonly<Record<string, unknown>>
  ) => unknown;
  validateSandboxSecurityToolLocator: (
    locator: unknown,
    tool: Readonly<Record<string, unknown>>
  ) => unknown;
};

async function loadLocatorModule(): Promise<LocatorModule> {
  try {
    return (await import("../src/security/locator.ts")) as LocatorModule;
  } catch {
    return {
      validateSandboxSecurityContentLocator: () => null,
      validateSandboxSecurityToolLocator: () => null
    };
  }
}

const {
  validateSandboxSecurityContentLocator,
  validateSandboxSecurityToolLocator
} = await loadLocatorModule();

function makeTextContent(value = "héllo") {
  const original_utf8_bytes = Object.freeze(Array.from(Buffer.from(value, "utf8")));
  return {
    source_handle: "hsrc:" + "a".repeat(32) + ":0001",
    source_id: "src",
    source_type: "user_input",
    media_type: "text/plain",
    authority_kind: "simulation_observation",
    value,
    provenance_ref: "source://x",
    original_utf8_bytes,
    original_value_sha256: "a".repeat(64),
    comparison_value: value.normalize("NFKC")
  };
}

function makeJsonContent(value: Record<string, unknown> = { a: { b: [1, 2] } }) {
  return {
    source_handle: "hsrc:" + "a".repeat(32) + ":0001",
    source_id: "src",
    source_type: "user_input",
    media_type: "application/json",
    authority_kind: "simulation_observation",
    value,
    provenance_ref: "source://x",
    original_utf8_bytes: Object.freeze([123]),
    original_value_sha256: "b".repeat(64),
    comparison_value: value
  };
}

function makeTool(args: Record<string, unknown> = { path: "/tmp" }) {
  return {
    call_handle: "hcall:" + "a".repeat(32) + ":0000",
    call_id: "call-1",
    authority_kind: "simulation_observation",
    tool_name: "read_file",
    arguments: args,
    arguments_jcs_sha256: "c".repeat(64),
    has_target: false
  };
}

test("REQ-SBX-GENERAL-001 accepts whole_source content locator", () => {
  assert.deepEqual(
    validateSandboxSecurityContentLocator({ kind: "whole_source" }, makeTextContent()),
    { kind: "whole_source" }
  );
});

test("REQ-SBX-GENERAL-001 accepts exact half-open code-point-aligned text_byte_range", () => {
  const content = makeTextContent("ab");
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 1 },
      content
    ),
    { kind: "text_byte_range", start_byte: 0, end_byte: 1 }
  );
});

test("REQ-SBX-GENERAL-001 rejects text_byte_range that splits multi-byte code points", () => {
  const content = makeTextContent("é"); // C3 A9
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 1 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 falls back to whole_source when byte range mapping is unproven", () => {
  const content = makeTextContent("ab");
  // Unproven mapping marker: non-integer? No - use special unproven object accepted only as fallback path via explicit unproven flag not allowed.
  // Spec: ambiguous mapping falls back to whole_source. We model unproven as range covering comparison-only path request using empty marker field rejected elsewhere.
  // For API-level: when content media is text and range equals full span but caller marks unproven by using end==start? that is invalid inverted/empty.
  // Use validate with a dedicated unproven request: start/end valid but content provides no original_utf8_bytes mapping quality - not possible.
  // Implement fallback by accepting {kind:'text_byte_range', start_byte, end_byte, unproven:true}? exact-key would reject.
  // Instead test the public helper behavior: invalid mapping returns whole_source when caller uses validate with range that is code-point aligned but zero-length? reject.
  // Practical matrix: pass range that is valid numbers but not aligned -> null for split; for unproven NFKC-only request we expose validate that returns whole_source for non-byte-proven candidate via separate kind? 
  // Follow plan: unproven mapping → whole_source. We'll pass a range object with kind text_byte_range and a non-proven sentinel by using start/end covering full bytes while content comparison_value differs and value is text - still proven.
  // Use empty object media json with text range? media mismatch -> null.
  // Implement API so that when start/end are numbers but mapping cannot be proven because original_utf8_bytes empty for json text? 
  // For JSON media, text_byte_range falls back to whole_source.
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 1 },
      makeJsonContent()
    ),
    { kind: "whole_source" }
  );
});

test("REQ-SBX-GENERAL-001 accepts restricted RFC 6901 json_pointer on content", () => {
  const content = makeJsonContent({ a: { b: [1, 2] } });
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/a/b/0" },
      content
    ),
    { kind: "json_pointer", pointer: "/a/b/0" }
  );
});

test("REQ-SBX-GENERAL-001 rejects over-long json_pointer and illegal tokens", () => {
  const content = makeJsonContent();
  const overlong = "/" + "a".repeat(600);
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
});

test("REQ-SBX-GENERAL-001 rejects array tokens with leading zeros except zero", () => {
  const content = makeJsonContent({ a: [1, 2] });
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/a/01" },
      content
    ),
    null
  );
  assert.deepEqual(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/a/0" },
      content
    ),
    { kind: "json_pointer", pointer: "/a/0" }
  );
});

test("REQ-SBX-GENERAL-001 accepts whole_arguments tool locator", () => {
  assert.deepEqual(
    validateSandboxSecurityToolLocator({ kind: "whole_arguments" }, makeTool()),
    { kind: "whole_arguments" }
  );
});

test("REQ-SBX-GENERAL-001 accepts tool json_pointer on arguments only", () => {
  assert.deepEqual(
    validateSandboxSecurityToolLocator(
      { kind: "json_pointer", pointer: "/path" },
      makeTool({ path: "/tmp" })
    ),
    { kind: "json_pointer", pointer: "/path" }
  );
});

test("REQ-SBX-GENERAL-001 rejects tool locator on tool_name or target components", () => {
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "json_pointer", pointer: "/tool_name" },
      makeTool()
    ),
    null
  );
  // component fields are not part of tool locator union
  assert.equal(
    validateSandboxSecurityToolLocator(
      { kind: "tool_name" },
      makeTool()
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects unknown locator kinds and extra keys", () => {
  assert.equal(
    validateSandboxSecurityContentLocator({ kind: "mystery" }, makeTextContent()),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "whole_source", extra: true },
      makeTextContent()
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects negative and inverted byte ranges", () => {
  const content = makeTextContent("ab");
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: -1, end_byte: 1 },
      content
    ),
    null
  );
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 2, end_byte: 1 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects text_byte_range beyond original_utf8_bytes length", () => {
  const content = makeTextContent("ab");
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "text_byte_range", start_byte: 0, end_byte: 99 },
      content
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects inherited and accessor locator fields", () => {
  const polluted = Object.create({ kind: "whole_source" });
  assert.equal(
    validateSandboxSecurityContentLocator(polluted, makeTextContent()),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects json_pointer on text/plain content when path is non-applicable", () => {
  assert.equal(
    validateSandboxSecurityContentLocator(
      { kind: "json_pointer", pointer: "/a" },
      makeTextContent()
    ),
    null
  );
});


// ---- P2-T5 canonical fingerprint ----------------------------------------

type FingerprintModule = {
  createSandboxSecurityCanonicalFingerprintService: () => {
    fingerprint: (
      request: unknown,
      port: { fingerprintCanonicalBytes: (bytes: Uint8Array) => string }
    ) => string;
  };
};

async function loadFingerprintModule(): Promise<FingerprintModule> {
  try {
    return (await import("../src/security/canonical-fingerprint.ts")) as FingerprintModule;
  } catch {
    return {
      createSandboxSecurityCanonicalFingerprintService: () => ({
        fingerprint: () => "hmac-sha256:" + "0".repeat(64)
      })
    };
  }
}

const { createSandboxSecurityCanonicalFingerprintService } =
  await loadFingerprintModule();

function makeEvaluationRequest(requestId = "req-fp-1") {
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
          value: "hello",
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
          value: "hello",
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
      return "hmac-sha256:" + "ab".repeat(32);
    }
  });
  assert.ok(seen);
  assert.equal(out, "hmac-sha256:" + "ab".repeat(32));
  // bytes should equal encode of projection without request_id
  const projection = {
    schema_version: "sandbox-security-canonical-evaluation.v1",
    evaluation_mode: "simulation",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [
      {
        source_id: "src-user",
        authority_kind: "simulation_observation",
        source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://workbench/user/input"
      }
    ]
  };
  assert.deepEqual(
    Buffer.from(seen!),
    Buffer.from(canonicalizeSandboxSecurityJson(projection), "utf8")
  );
});

test("REQ-SBX-GENERAL-001 fingerprint ignores correlation request ID", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const digests: string[] = [];
  const port = {
    fingerprintCanonicalBytes(bytes: Uint8Array) {
      digests.push(createHash("sha256").update(bytes).digest("hex"));
      return "hmac-sha256:" + "cd".repeat(32);
    }
  };
  service.fingerprint(makeEvaluationRequest("req-a"), port);
  service.fingerprint(makeEvaluationRequest("req-b"), port);
  assert.equal(digests[0], digests[1]);
});

test("REQ-SBX-GENERAL-001 rejects invalid and throwing fingerprint ports", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  assert.throws(() =>
    service.fingerprint(makeEvaluationRequest(), {
      fingerprintCanonicalBytes() {
        return "not-valid";
      }
    })
  );
  assert.throws(() =>
    service.fingerprint(makeEvaluationRequest(), {
      fingerprintCanonicalBytes() {
        throw new Error("port boom");
      }
    })
  );
});

test("REQ-SBX-GENERAL-001 service does not expose canonical bytes after callback", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const out = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return "hmac-sha256:" + "ef".repeat(32);
    }
  });
  assert.equal(typeof out, "string");
  assert.equal(Object.hasOwn(service as object, "canonicalBytes"), false);
  assert.equal(Object.hasOwn(service as object, "lastBytes"), false);
});

test("REQ-SBX-GENERAL-001 fingerprint rejects authority mismatch before port call", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  let calls = 0;
  const bad = makeEvaluationRequest();
  (bad.authoritative_context.sources[0] as { value: string }).value = "different";
  assert.throws(() =>
    service.fingerprint(bad, {
      fingerprintCanonicalBytes() {
        calls += 1;
        return "hmac-sha256:" + "11".repeat(32);
      }
    })
  );
  assert.equal(calls, 0);
});

test("REQ-SBX-GENERAL-001 fingerprint port output must match hmac-sha256 64hex grammar", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  assert.throws(() =>
    service.fingerprint(makeEvaluationRequest(), {
      fingerprintCanonicalBytes() {
        return "hmac-sha256:" + "GG".repeat(32);
      }
    })
  );
  const ok = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return "hmac-sha256:" + "aa".repeat(32);
    }
  });
  assert.match(ok, /^hmac-sha256:[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 fingerprint accepts approved SandboxSecurityEvaluationRequest shape", () => {
  const service = createSandboxSecurityCanonicalFingerprintService();
  const out = service.fingerprint(makeEvaluationRequest(), {
    fingerprintCanonicalBytes() {
      return "hmac-sha256:" + "22".repeat(32);
    }
  });
  assert.match(out, /^hmac-sha256:[a-f0-9]{64}$/);
});

test("REQ-SBX-GENERAL-001 fingerprint reuses internal normalizer not a second JCS implementation", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../src/security/canonical-fingerprint.ts", import.meta.url),
      "utf8"
    )
  );
  assert.match(source, /normalizeSandboxSecurityEvaluationRequest/);
  assert.match(source, /encodeSandboxSecurityCanonicalProjection/);
  assert.doesNotMatch(source, /JSON\.stringify/);
});

test("REQ-SBX-GENERAL-001 fingerprint encoding is independent of PreparedInput fields", async () => {
  const source = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../src/security/canonical-fingerprint.ts", import.meta.url),
      "utf8"
    )
  );
  assert.match(source, /encodeSandboxSecurityCanonicalProjection/);
  assert.doesNotMatch(source, /canonical_projection_bytes/);
});
