import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type {
  SandboxSecurityClaimedSourceType,
  SandboxSecurityReasonCode,
  SandboxSecurityRequest
} from "../types/sandbox-security.ts";

type SandboxSecurityRuntimeModule = {
  SANDBOX_SECURITY_STAGES: readonly string[];
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES: readonly string[];
  SANDBOX_SECURITY_RISK_CATEGORIES: readonly string[];
  SANDBOX_SECURITY_POLICY_PROFILE_IDS: readonly string[];
  SANDBOX_SECURITY_SEVERITIES: readonly string[];
  SANDBOX_SECURITY_VERDICTS: readonly string[];
  SANDBOX_SECURITY_ACTIONS: readonly string[];
  SANDBOX_SECURITY_MAX_TEXT_BYTES: number;
  SANDBOX_SECURITY_MAX_REQUEST_BYTES: number;
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS: number;
  SANDBOX_SECURITY_MAX_JSON_DEPTH: number;
  SANDBOX_SECURITY_MAX_JSON_NODES: number;
};

const sandboxSecurityTypesPath = resolve(
  import.meta.dirname,
  "../types/sandbox-security.ts"
);
const sandboxSecurityTypesUrl = pathToFileURL(sandboxSecurityTypesPath).href;

const inertSandboxSecurityRuntime: SandboxSecurityRuntimeModule = {
  SANDBOX_SECURITY_STAGES: [],
  SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES: [],
  SANDBOX_SECURITY_RISK_CATEGORIES: [],
  SANDBOX_SECURITY_POLICY_PROFILE_IDS: [],
  SANDBOX_SECURITY_SEVERITIES: [],
  SANDBOX_SECURITY_VERDICTS: [],
  SANDBOX_SECURITY_ACTIONS: [],
  SANDBOX_SECURITY_MAX_TEXT_BYTES: 0,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES: 0,
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS: 0,
  SANDBOX_SECURITY_MAX_JSON_DEPTH: 0,
  SANDBOX_SECURITY_MAX_JSON_NODES: 0
};

async function loadSandboxSecurityRuntime(): Promise<SandboxSecurityRuntimeModule> {
  try {
    return (await import(sandboxSecurityTypesUrl)) as SandboxSecurityRuntimeModule;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      "url" in error &&
      error.url === sandboxSecurityTypesUrl
    ) {
      return inertSandboxSecurityRuntime;
    }

    throw error;
  }
}

const sandboxSecurity = await loadSandboxSecurityRuntime();

type NormalizeSandboxSecurityRequest = (
  value: unknown
) => SandboxSecurityRequest | null;

type SandboxSecurityRequestModule = {
  normalizeSandboxSecurityRequest: NormalizeSandboxSecurityRequest;
};

const sandboxSecurityRequestPath = resolve(
  import.meta.dirname,
  "../contracts/sandbox-security-request.ts"
);
const sandboxSecurityRequestUrl = pathToFileURL(sandboxSecurityRequestPath).href;

async function loadSandboxSecurityRequestModule(): Promise<SandboxSecurityRequestModule> {
  try {
    return (await import(sandboxSecurityRequestUrl)) as SandboxSecurityRequestModule;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      "url" in error &&
      error.url === sandboxSecurityRequestUrl
    ) {
      return { normalizeSandboxSecurityRequest: () => null };
    }

    throw error;
  }
}

const { normalizeSandboxSecurityRequest } =
  await loadSandboxSecurityRequestModule();

function makeContentItem(
  claimedSourceType: SandboxSecurityClaimedSourceType,
  ordinal: number | string = 1,
  overrides: Record<string, unknown> = {}
) {
  const suffix = `${claimedSourceType}_${ordinal}`;
  return {
    source_id: suffix,
    claimed_source_type: claimedSourceType,
    media_type: "text/plain",
    value: `content-${ordinal}`,
    provenance_ref: `source://fixture/${suffix}`,
    ...overrides
  };
}

function makeUserInputRequest(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request_001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [makeContentItem("user_input")],
    ...overrides
  };
}

function makeModelOutputRequest(overrides: Record<string, unknown> = {}) {
  return makeUserInputRequest({
    request_id: "request_model_001",
    stage: "model_output",
    content_items: [makeContentItem("model_output")],
    ...overrides
  });
}

function makeToolRequest(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "sandbox-security-request.v1",
    request_id: "request_tool_001",
    stage: "tool_request",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [makeContentItem("model_output")],
    tool_request: {
      call_id: "call_001",
      tool_name: "send_message",
      target: "reviewer@local.invalid",
      arguments: { channel: "security-review", urgent: false }
    },
    ...overrides
  };
}

function makeToolRequestWithToolOverrides(
  toolOverrides: Record<string, unknown>,
  requestOverrides: Record<string, unknown> = {}
) {
  const request = makeToolRequest();
  return {
    ...request,
    tool_request: { ...request.tool_request, ...toolOverrides },
    ...requestOverrides
  };
}

function makeJsonUserInputRequest(value: unknown) {
  return makeUserInputRequest({
    content_items: [
      makeContentItem("user_input", 1, {
        media_type: "application/json",
        value
      })
    ]
  });
}

function makeProvenanceAtLength(
  scheme: "source" | "platform" | "retrieval" | "memory",
  targetLength: number
): string {
  let result = `${scheme}://`;
  let remaining = targetLength - result.length;

  while (remaining > 0) {
    const separator = result.endsWith("://") ? "" : "/";
    const segmentLength = Math.min(64, remaining - separator.length);
    if (segmentLength < 1) {
      throw new Error("target provenance length cannot satisfy the grammar");
    }
    result += `${separator}${"a".repeat(segmentLength)}`;
    remaining = targetLength - result.length;
  }

  return result;
}

function makeNestedJson(containerDepth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < containerDepth; index += 1) {
    value = [value];
  }
  return value;
}

test("REQ-SBX-GENERAL-001 exports closed public security constants", () => {
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_STAGES, [
    "user_input",
    "model_output",
    "tool_request"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_CLAIMED_SOURCE_TYPES, [
    "system_instruction",
    "developer_instruction",
    "user_input",
    "retrieved_content",
    "memory_content",
    "model_output"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_RISK_CATEGORIES, [
    "prompt_injection",
    "jailbreak",
    "instruction_override",
    "privilege_escalation",
    "sensitive_data_exposure",
    "tool_hijacking",
    "unsafe_side_effect",
    "memory_poisoning",
    "trust_boundary_violation"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_POLICY_PROFILE_IDS, [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_SEVERITIES, [
    "low",
    "medium",
    "high",
    "critical"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_VERDICTS, [
    "no_detected_risk",
    "risk_detected",
    "indeterminate"
  ]);
  assert.deepEqual(sandboxSecurity.SANDBOX_SECURITY_ACTIONS, [
    "allow",
    "alert",
    "ask",
    "deny"
  ]);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_TEXT_BYTES, 128 * 1024);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_REQUEST_BYTES, 512 * 1024);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_CONTENT_ITEMS, 64);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_JSON_DEPTH, 12);
  assert.equal(sandboxSecurity.SANDBOX_SECURITY_MAX_JSON_NODES, 4096);
});

test("REQ-SBX-GENERAL-001 exports SandboxSecurityReasonCode closed catalog", () => {
  const expected = [
    "sandbox_security_prompt_injection",
    "sandbox_security_jailbreak",
    "sandbox_security_instruction_override",
    "sandbox_security_privilege_escalation",
    "sandbox_security_sensitive_data_exposure",
    "sandbox_security_tool_hijacking",
    "sandbox_security_unsafe_side_effect",
    "sandbox_security_memory_poisoning",
    "sandbox_security_trust_boundary_violation"
  ] as const satisfies readonly SandboxSecurityReasonCode[];

  type ExpectedReasonCode = (typeof expected)[number];
  type ReasonCodeCatalogIsExact =
    SandboxSecurityReasonCode extends ExpectedReasonCode
      ? ExpectedReasonCode extends SandboxSecurityReasonCode
        ? true
        : false
      : false;
  const reasonCodeCatalogIsExact: ReasonCodeCatalogIsExact = true;

  assert.equal(reasonCodeCatalogIsExact, true);
  assert.equal(expected.length, 9);
});

test("REQ-SBX-GENERAL-001 request_id accepts valid grammar at max length", () => {
  const request = makeUserInputRequest({ request_id: "r".repeat(128) });

  assert.deepEqual(normalizeSandboxSecurityRequest(request), request);
});

test("REQ-SBX-GENERAL-001 request_id rejects empty leading separator and over-length", () => {
  for (const requestId of [
    "",
    ".request",
    "_request",
    ":request",
    "-request",
    "r".repeat(129),
    "requést"
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(makeUserInputRequest({ request_id: requestId })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 source_id accepts valid grammar at max length", () => {
  const request = makeUserInputRequest({
    content_items: [
      makeContentItem("user_input", 1, { source_id: "s".repeat(128) })
    ]
  });

  assert.deepEqual(normalizeSandboxSecurityRequest(request), request);
});

test("REQ-SBX-GENERAL-001 source_id rejects empty leading separator and over-length", () => {
  for (const sourceId of [
    "",
    ".source",
    "_source",
    ":source",
    "-source",
    "s".repeat(129),
    "source-é"
  ]) {
    const request = makeUserInputRequest({
      content_items: [makeContentItem("user_input", 1, { source_id: sourceId })]
    });
    assert.equal(normalizeSandboxSecurityRequest(request), null);
  }
});

test("REQ-SBX-GENERAL-001 call_id accepts valid grammar at max length", () => {
  const request = makeToolRequestWithToolOverrides({ call_id: "c".repeat(128) });

  assert.deepEqual(normalizeSandboxSecurityRequest(request), request);
});

test("REQ-SBX-GENERAL-001 call_id rejects empty leading separator and over-length", () => {
  for (const callId of [
    "",
    ".call",
    "_call",
    ":call",
    "-call",
    "c".repeat(129),
    "call-é"
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeToolRequestWithToolOverrides({ call_id: callId })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 tool_name accepts valid grammar at max length", () => {
  const request = makeToolRequestWithToolOverrides({
    tool_name: `t${"o".repeat(127)}`
  });

  assert.deepEqual(normalizeSandboxSecurityRequest(request), request);
});

test("REQ-SBX-GENERAL-001 tool_name rejects leading digit empty and over-length", () => {
  for (const toolName of [
    "",
    "9tool",
    "_tool",
    `t${"o".repeat(128)}`,
    "töol"
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeToolRequestWithToolOverrides({ tool_name: toolName })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 target rejects C0 C1 CR LF and NUL", () => {
  const targetAtLimit = `${"界".repeat(341)}a`;
  assert.equal(Buffer.byteLength(targetAtLimit, "utf8"), 1024);
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeToolRequestWithToolOverrides({ target: targetAtLimit })
    ),
    null
  );

  for (const target of [
    "has\u0000nul",
    "has\u0001c0",
    "has\u001fc0",
    "has\u007fc1",
    "has\u0080c1",
    "has\u009fc1",
    "has\rreturn",
    "has\nlinefeed",
    "\ud800",
    "\udc00",
    "界".repeat(342)
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeToolRequestWithToolOverrides({ target })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 provenance_ref accepts allowed schemes at max length", () => {
  for (const scheme of ["source", "platform", "retrieval", "memory"] as const) {
    const provenanceRef = makeProvenanceAtLength(scheme, 256);
    const request = makeUserInputRequest({
      content_items: [
        makeContentItem("user_input", 1, { provenance_ref: provenanceRef })
      ]
    });

    assert.equal(provenanceRef.length, 256);
    assert.deepEqual(normalizeSandboxSecurityRequest(request), request);
  }
});

test("REQ-SBX-GENERAL-001 provenance_ref rejects query fragment userinfo and encoding", () => {
  const invalidProvenanceRefs = [
    "source://fixture/item?query=true",
    "source://fixture/item#fragment",
    "source://user@fixture/item",
    "source://fixture/percent%20encoded",
    "file://fixture/item",
    "source://",
    makeProvenanceAtLength("source", 257)
  ];

  for (const provenanceRef of invalidProvenanceRefs) {
    const request = makeUserInputRequest({
      content_items: [
        makeContentItem("user_input", 1, { provenance_ref: provenanceRef })
      ]
    });
    assert.equal(normalizeSandboxSecurityRequest(request), null);
  }
});

test("REQ-SBX-GENERAL-001 schema_version accepts only sandbox-security-request.v1", () => {
  assert.notEqual(normalizeSandboxSecurityRequest(makeUserInputRequest()), null);

  for (const schemaVersion of [
    "sandbox-security-request.v0",
    "sandbox-security-request.v2",
    "SANDBOX-SECURITY-REQUEST.V1",
    ""
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({ schema_version: schemaVersion })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 policy_profile_id accepts only built-in public IDs", () => {
  for (const profileId of [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]) {
    assert.notEqual(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({ policy_profile_id: profileId })
      ),
      null
    );
  }

  for (const profileId of [
    "sandbox-security-balanced.v2",
    "sandbox-security-custom.v1",
    ""
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({ policy_profile_id: profileId })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 claimed_source_type rejects unknown values", () => {
  const request = makeUserInputRequest({
    content_items: [
      makeContentItem("user_input", 1, {
        claimed_source_type: "trusted_system_instruction"
      })
    ]
  });

  assert.equal(normalizeSandboxSecurityRequest(request), null);
});

test("REQ-SBX-GENERAL-001 normalizes an exact user-input request", () => {
  const request = makeUserInputRequest();
  const normalized = normalizeSandboxSecurityRequest(request);

  assert.deepEqual(normalized, request);
  assert.ok(normalized);
  assert.notStrictEqual(normalized, request);
  assert.notStrictEqual(normalized.content_items, request.content_items);
  assert.notStrictEqual(normalized.content_items[0], request.content_items[0]);
  assert.equal(Object.hasOwn(normalized, "trust_class"), false);
  assert.equal(Object.hasOwn(normalized.content_items[0], "trust_class"), false);
});

test("REQ-SBX-GENERAL-001 rejects caller trust and unknown request keys", () => {
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ trust_class: "platform_control" })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(makeUserInputRequest({ raw_content: "secret" })),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({
        content_items: [
          makeContentItem("user_input", 1, { trust_class: "trusted" })
        ]
      })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeToolRequestWithToolOverrides({ authority_kind: "integration_observation" })
    ),
    null
  );

  const missingRequestId = makeUserInputRequest();
  delete (missingRequestId as Record<string, unknown>).request_id;
  assert.equal(normalizeSandboxSecurityRequest(missingRequestId), null);

  const missingContentValue = makeContentItem("user_input");
  delete (missingContentValue as Record<string, unknown>).value;
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: [missingContentValue] })
    ),
    null
  );

  const missingArguments = { ...makeToolRequest().tool_request };
  delete (missingArguments as Record<string, unknown>).arguments;
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeToolRequest({ tool_request: missingArguments })
    ),
    null
  );

  const symbolRequest = makeUserInputRequest() as Record<PropertyKey, unknown>;
  symbolRequest[Symbol("unknown")] = true;
  assert.equal(normalizeSandboxSecurityRequest(symbolRequest), null);

  const symbolContent = makeContentItem("user_input") as Record<PropertyKey, unknown>;
  symbolContent[Symbol("unknown")] = true;
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: [symbolContent] })
    ),
    null
  );

  const symbolTool = {
    ...makeToolRequest().tool_request
  } as Record<PropertyKey, unknown>;
  symbolTool[Symbol("unknown")] = true;
  assert.equal(
    normalizeSandboxSecurityRequest(makeToolRequest({ tool_request: symbolTool })),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects inherited and accessor request fields", () => {
  assert.equal(
    normalizeSandboxSecurityRequest(Object.create(makeUserInputRequest())),
    null
  );

  const inheritedContent = Object.assign(
    Object.create({ inherited: true }),
    makeContentItem("user_input")
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: [inheritedContent] })
    ),
    null
  );

  const inheritedTool = Object.assign(
    Object.create({ inherited: true }),
    makeToolRequest().tool_request
  );
  assert.equal(
    normalizeSandboxSecurityRequest(makeToolRequest({ tool_request: inheritedTool })),
    null
  );

  let requestGetterCalled = false;
  const accessorRequest = makeUserInputRequest();
  Object.defineProperty(accessorRequest, "request_id", {
    enumerable: true,
    get() {
      requestGetterCalled = true;
      return "request_accessor";
    }
  });
  assert.equal(normalizeSandboxSecurityRequest(accessorRequest), null);
  assert.equal(requestGetterCalled, false);

  let contentGetterCalled = false;
  const accessorContent = makeContentItem("user_input");
  Object.defineProperty(accessorContent, "value", {
    enumerable: true,
    get() {
      contentGetterCalled = true;
      return "content";
    }
  });
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: [accessorContent] })
    ),
    null
  );
  assert.equal(contentGetterCalled, false);

  let toolGetterCalled = false;
  const accessorTool = { ...makeToolRequest().tool_request };
  Object.defineProperty(accessorTool, "arguments", {
    enumerable: true,
    get() {
      toolGetterCalled = true;
      return {};
    }
  });
  assert.equal(
    normalizeSandboxSecurityRequest(makeToolRequest({ tool_request: accessorTool })),
    null
  );
  assert.equal(toolGetterCalled, false);

  const nonEnumerableRequest = makeUserInputRequest();
  Object.defineProperty(nonEnumerableRequest, "request_id", {
    configurable: true,
    enumerable: false,
    value: "request_hidden",
    writable: true
  });
  assert.equal(normalizeSandboxSecurityRequest(nonEnumerableRequest), null);
});

test("REQ-SBX-GENERAL-001 enforces the three stage source matrices", () => {
  assert.notEqual(normalizeSandboxSecurityRequest(makeUserInputRequest()), null);
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeModelOutputRequest({
        content_items: [
          makeContentItem("system_instruction"),
          makeContentItem("developer_instruction"),
          makeContentItem("user_input"),
          makeContentItem("retrieved_content"),
          makeContentItem("memory_content"),
          makeContentItem("model_output")
        ]
      })
    ),
    null
  );
  assert.notEqual(normalizeSandboxSecurityRequest(makeToolRequest()), null);

  const invalidRequests = [
    makeUserInputRequest({ content_items: [] }),
    makeUserInputRequest({ content_items: [makeContentItem("model_output")] }),
    makeUserInputRequest({ tool_request: makeToolRequest().tool_request }),
    makeModelOutputRequest({
      content_items: [
        makeContentItem("model_output", 1),
        makeContentItem("model_output", 2)
      ]
    }),
    makeModelOutputRequest({
      content_items: [
        makeContentItem("model_output"),
        makeContentItem("user_input", 1),
        makeContentItem("user_input", 2)
      ]
    }),
    makeModelOutputRequest({ tool_request: makeToolRequest().tool_request }),
    makeToolRequest({ tool_request: undefined }),
    makeToolRequest({ content_items: [makeContentItem("user_input")] }),
    makeUserInputRequest({
      content_items: [
        makeContentItem("user_input"),
        makeContentItem("system_instruction", 1),
        makeContentItem("system_instruction", 2)
      ]
    }),
    makeUserInputRequest({
      content_items: [
        makeContentItem("user_input"),
        makeContentItem("developer_instruction", 1),
        makeContentItem("developer_instruction", 2)
      ]
    }),
    makeUserInputRequest({
      content_items: [
        makeContentItem("user_input"),
        ...Array.from({ length: 33 }, (_, index) =>
          makeContentItem("retrieved_content", index + 1)
        )
      ]
    }),
    makeUserInputRequest({
      content_items: [
        makeContentItem("user_input"),
        ...Array.from({ length: 33 }, (_, index) =>
          makeContentItem("memory_content", index + 1)
        )
      ]
    })
  ];

  for (const request of invalidRequests) {
    assert.equal(normalizeSandboxSecurityRequest(request), null);
  }
});

test("REQ-SBX-GENERAL-001 rejects duplicate source IDs and malformed provenance", () => {
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({
        content_items: [
          makeContentItem("user_input", 1, { source_id: "duplicate" }),
          makeContentItem("retrieved_content", 1, { source_id: "duplicate" })
        ]
      })
    ),
    null
  );

  for (const provenanceRef of [
    "source://fixture/item?query=true",
    "source://fixture/item#fragment",
    "source://user@fixture/item",
    "source://fixture/item%20encoded",
    "https://fixture/item"
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({
          content_items: [
            makeContentItem("user_input", 1, { provenance_ref: provenanceRef })
          ]
        })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 enforces text item depth node and count boundaries", () => {
  for (const textLength of [128 * 1024 - 1, 128 * 1024]) {
    assert.notEqual(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({
          content_items: [
            makeContentItem("user_input", 1, { value: "a".repeat(textLength) })
          ]
        })
      ),
      null
    );
  }
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({
        content_items: [
          makeContentItem("user_input", 1, { value: "a".repeat(128 * 1024 + 1) })
        ]
      })
    ),
    null
  );

  const jsonStringAtLimit = "j".repeat(128 * 1024);
  assert.notEqual(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(jsonStringAtLimit)),
    null
  );
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeToolRequestWithToolOverrides({
        arguments: { nested: jsonStringAtLimit }
      })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest({ nested: `${jsonStringAtLimit}j` })
    ),
    null
  );

  const multibyteAtLimit = `${"界".repeat(43690)}aa`;
  const multibyteAboveLimit = `${multibyteAtLimit}a`;
  assert.equal(Buffer.byteLength(multibyteAtLimit, "utf8"), 128 * 1024);
  assert.equal(Buffer.byteLength(multibyteAboveLimit, "utf8"), 128 * 1024 + 1);
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({
        content_items: [
          makeContentItem("user_input", 1, { value: multibyteAtLimit })
        ]
      })
    ),
    null
  );
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(multibyteAtLimit)
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({
        content_items: [
          makeContentItem("user_input", 1, { value: multibyteAboveLimit })
        ]
      })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(multibyteAboveLimit)
    ),
    null
  );

  const belowItemLimit = [
    makeContentItem("user_input"),
    ...Array.from({ length: 31 }, (_, index) =>
      makeContentItem("retrieved_content", index + 1)
    ),
    ...Array.from({ length: 31 }, (_, index) =>
      makeContentItem("memory_content", index + 1)
    )
  ];
  const atItemLimit = [
    makeContentItem("user_input"),
    ...Array.from({ length: 32 }, (_, index) =>
      makeContentItem("retrieved_content", index + 1)
    ),
    ...Array.from({ length: 31 }, (_, index) =>
      makeContentItem("memory_content", index + 1)
    )
  ];
  const aboveItemLimit = [
    makeContentItem("user_input"),
    ...Array.from({ length: 32 }, (_, index) =>
      makeContentItem("retrieved_content", index + 1)
    ),
    ...Array.from({ length: 32 }, (_, index) =>
      makeContentItem("memory_content", index + 1)
    )
  ];
  assert.equal(belowItemLimit.length, 63);
  assert.equal(atItemLimit.length, 64);
  assert.equal(aboveItemLimit.length, 65);
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: belowItemLimit })
    ),
    null
  );
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: atItemLimit })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: aboveItemLimit })
    ),
    null
  );

  assert.notEqual(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(makeNestedJson(11))),
    null
  );
  assert.notEqual(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(makeNestedJson(12))),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(makeNestedJson(13))),
    null
  );

  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(Array.from({ length: 4094 }, () => null))
    ),
    null
  );
  assert.notEqual(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(Array.from({ length: 4095 }, () => null))
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(Array.from({ length: 4096 }, () => null))
    ),
    null
  );

  const contentItemArrayOperations = {
    ownKeys: 0,
    nonLengthDescriptors: 0
  };
  const instrumentedAboveItemLimit = new Proxy(aboveItemLimit, {
    ownKeys(target) {
      contentItemArrayOperations.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      if (key !== "length") {
        contentItemArrayOperations.nonLengthDescriptors += 1;
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });

  const jsonArrayOperations = {
    ownKeys: 0,
    nonLengthDescriptors: 0
  };
  const instrumentedAboveNodeLimit = new Proxy(
    Array.from({ length: 4096 }, () => null),
    {
      ownKeys(target) {
        jsonArrayOperations.ownKeys += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        if (key !== "length") {
          jsonArrayOperations.nonLengthDescriptors += 1;
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    }
  );

  assert.equal(
    normalizeSandboxSecurityRequest(
      makeUserInputRequest({ content_items: instrumentedAboveItemLimit })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(instrumentedAboveNodeLimit)
    ),
    null
  );
  assert.deepEqual(
    {
      content_items: contentItemArrayOperations,
      json_value: jsonArrayOperations
    },
    {
      content_items: { ownKeys: 0, nonLengthDescriptors: 0 },
      json_value: { ownKeys: 0, nonLengthDescriptors: 0 }
    }
  );
});

test("REQ-SBX-GENERAL-001 rejects lone surrogate in text values", () => {
  for (const value of ["paired-\ud83d\ude00", "plain-text"]) {
    assert.notEqual(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({
          content_items: [makeContentItem("user_input", 1, { value })]
        })
      ),
      null
    );
  }

  for (const value of ["lone-high-\ud800", "lone-low-\udc00"]) {
    assert.equal(
      normalizeSandboxSecurityRequest(
        makeUserInputRequest({
          content_items: [makeContentItem("user_input", 1, { value })]
        })
      ),
      null
    );
    assert.equal(
      normalizeSandboxSecurityRequest(makeJsonUserInputRequest({ value })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 rejects non-finite numbers sparse arrays and cycles in JSON", () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, 1n, Symbol("json")]) {
    assert.equal(
      normalizeSandboxSecurityRequest(makeJsonUserInputRequest(value)),
      null
    );
  }

  const sparse = new Array(2);
  sparse[1] = "present";
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(sparse)),
    null
  );

  const selfCycle: Record<string, unknown> = {};
  selfCycle.self = selfCycle;
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(selfCycle)),
    null
  );

  const leftCycle: Record<string, unknown> = {};
  const rightCycle: Record<string, unknown> = { left: leftCycle };
  leftCycle.right = rightCycle;
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(leftCycle)),
    null
  );

  let jsonGetterCalled = false;
  const accessorJson: Record<string, unknown> = {};
  Object.defineProperty(accessorJson, "secret", {
    enumerable: true,
    get() {
      jsonGetterCalled = true;
      return "secret";
    }
  });
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(accessorJson)),
    null
  );
  assert.equal(jsonGetterCalled, false);

  assert.equal(
    normalizeSandboxSecurityRequest(
      makeJsonUserInputRequest(Object.create(null) as object)
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(new Date(0))),
    null
  );
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest({ invalid: () => true })),
    null
  );

  const symbolKeyJson = { valid: true } as Record<PropertyKey, unknown>;
  symbolKeyJson[Symbol("invalid")] = true;
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(symbolKeyJson)),
    null
  );

  const hiddenJson: Record<string, unknown> = { visible: true };
  Object.defineProperty(hiddenJson, "hidden", {
    enumerable: false,
    value: true
  });
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(hiddenJson)),
    null
  );

  const extendedArray = ["valid"] as unknown[] & { extra?: string };
  extendedArray.extra = "invalid";
  assert.equal(
    normalizeSandboxSecurityRequest(makeJsonUserInputRequest(extendedArray)),
    null
  );

  const repeated = { nested: ["original"] };
  const request = makeToolRequestWithToolOverrides({
    arguments: { left: repeated, right: repeated }
  });
  const normalized = normalizeSandboxSecurityRequest(request);
  assert.ok(normalized?.tool_request);
  const normalizedArguments = normalized.tool_request.arguments as {
    left: { nested: string[] };
    right: { nested: string[] };
  };
  assert.notStrictEqual(normalized, request);
  assert.notStrictEqual(normalized.tool_request, request.tool_request);
  assert.notStrictEqual(normalizedArguments.left, repeated);
  assert.notStrictEqual(normalizedArguments.right, repeated);
  assert.notStrictEqual(normalizedArguments.left, normalizedArguments.right);
  assert.notStrictEqual(normalizedArguments.left.nested, repeated.nested);
  repeated.nested[0] = "mutated";
  assert.deepEqual(normalizedArguments.left, { nested: ["original"] });
  assert.deepEqual(normalizedArguments.right, { nested: ["original"] });
});

test("REQ-SBX-GENERAL-001 rejects prototype pollution keys in JSON objects", () => {
  const ownProto: Record<string, unknown> = { safe: true };
  Object.defineProperty(ownProto, "__proto__", {
    enumerable: true,
    value: { polluted: true }
  });

  for (const value of [
    ownProto,
    { prototype: { polluted: true } },
    { constructor: { polluted: true } },
    { nested: ownProto },
    [{ nested: { constructor: "polluted" } }]
  ]) {
    assert.equal(
      normalizeSandboxSecurityRequest(makeJsonUserInputRequest(value)),
      null
    );
  }
});
