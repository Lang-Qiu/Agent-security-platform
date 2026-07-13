import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import type {
  SandboxDetectorRun,
  SandboxSecurityClaimedSourceType,
  SandboxSecurityDecision,
  SandboxSecurityFinding,
  SandboxSecurityFindingSubjectRef,
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

type SandboxSecurityContractModule = {
  normalizeSandboxSecurityRequest: NormalizeSandboxSecurityRequest;
  normalizeSandboxSecurityFinding: (
    value: unknown
  ) => SandboxSecurityFinding | null;
  normalizeSandboxDetectorRun: (value: unknown) => SandboxDetectorRun | null;
  normalizeSandboxSecurityDecision: (
    value: unknown
  ) => SandboxSecurityDecision | null;
};

const sandboxSecurityContractPath = resolve(
  import.meta.dirname,
  "../contracts/sandbox-security.ts"
);
const sandboxSecurityContractUrl = pathToFileURL(sandboxSecurityContractPath).href;

async function loadSandboxSecurityContract(): Promise<SandboxSecurityContractModule> {
  try {
    return (await import(sandboxSecurityContractUrl)) as SandboxSecurityContractModule;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      "url" in error &&
      error.url === sandboxSecurityContractUrl
    ) {
      return {
        normalizeSandboxSecurityRequest,
        normalizeSandboxSecurityFinding: () => null,
        normalizeSandboxDetectorRun: () => null,
        normalizeSandboxSecurityDecision: () => null
      };
    }

    throw error;
  }
}

function readSandboxSecurityContractSource(): string {
  try {
    return readFileSync(sandboxSecurityContractPath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT" &&
      "path" in error &&
      error.path === sandboxSecurityContractPath
    ) {
      return "";
    }
    throw error;
  }
}

const sandboxSecurityContract = await loadSandboxSecurityContract();
const {
  normalizeSandboxSecurityFinding,
  normalizeSandboxDetectorRun,
  normalizeSandboxSecurityDecision
} = sandboxSecurityContract;

const findingId = `finding:sha256:${"a".repeat(64)}`;
const secondFindingId = `finding:sha256:${"b".repeat(64)}`;

function makeSourceToken(
  decisionId = "decision_001",
  ordinal = "0001"
): string {
  return `source://sandbox/security/${decisionId}/${ordinal}`;
}

function makeCallToken(
  decisionId = "decision_001",
  ordinal = "0001"
): string {
  return `call://sandbox/security/${decisionId}/${ordinal}`;
}

function makeEvidenceRef(
  decisionId = "decision_001",
  suffix = "0001"
): string {
  return `evidence://sandbox/security/${decisionId}/${suffix}`;
}

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    finding_id: findingId,
    detector_id: "detector://sandbox/security/rule/default/v1",
    detector_version: "1.0.0",
    category: "prompt_injection",
    severity: "high",
    confidence: 0.9,
    reason_code: "sandbox_security_prompt_injection",
    subject_refs: [
      {
        kind: "content_source",
        source_token: makeSourceToken(),
        locator: { kind: "whole_source" }
      }
    ],
    evidence_refs: [makeEvidenceRef()],
    ...overrides
  };
}

function makeDetectorRun(overrides: Record<string, unknown> = {}) {
  return {
    detector_id: "detector://sandbox/security/rule/default/v1",
    detector_version: "1.0.0",
    detector_kind: "rule",
    obligation: "profile_required",
    elapsed_ms: 1,
    status: "matched",
    finding_ids: [findingId],
    ...overrides
  };
}

function makeDecision(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision_001",
    request_id: "request_001",
    evaluation_mode: "enforcement",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    verdict: "risk_detected",
    action: "deny",
    risk_level: "high",
    findings: [makeFinding()],
    detector_runs: [makeDetectorRun()],
    evidence_refs: [makeEvidenceRef()],
    created_at: "2026-07-13T12:34:56.789Z",
    ...overrides
  };
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

test("REQ-SBX-GENERAL-001 source_token and call_token accept public grammar at max length", () => {
  const decisionIdAtLimit = "d".repeat(128);
  const finding = makeFinding({
    subject_refs: [
      {
        kind: "content_source",
        source_token: makeSourceToken(decisionIdAtLimit, "0000"),
        locator: { kind: "whole_source" }
      },
      {
        kind: "tool_request",
        call_token: makeCallToken(decisionIdAtLimit, "9999"),
        component: "whole_call"
      }
    ]
  });

  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 source_token and call_token reject illegal characters and over-length", () => {
  const invalidSourceTokens = [
    "source://sandbox/security/decision_001/001",
    "source://sandbox/security/decision_001/00001",
    "source://sandbox/security/.decision/0001",
    "source://sandbox/security/decision/with/slash/0001",
    `source://sandbox/security/${"d".repeat(129)}/0001`,
    "source://sandbox/security/décision/0001",
    "https://sandbox/security/decision_001/0001"
  ];
  for (const sourceToken of invalidSourceTokens) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({
          subject_refs: [
            {
              kind: "content_source",
              source_token: sourceToken,
              locator: { kind: "whole_source" }
            }
          ]
        })
      ),
      null
    );
  }

  const invalidCallTokens = [
    "call://sandbox/security/decision_001/001",
    "call://sandbox/security/decision_001/00001",
    "call://sandbox/security/-decision/0001",
    `call://sandbox/security/${"d".repeat(129)}/0001`,
    "source://sandbox/security/decision_001/0001",
    "call://sandbox/security/decision 001/0001"
  ];
  for (const callToken of invalidCallTokens) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({
          subject_refs: [
            {
              kind: "tool_request",
              call_token: callToken,
              component: "whole_call"
            }
          ]
        })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 finding_id accepts engine public grammar at max length", () => {
  const finding = makeFinding();

  assert.equal(finding.finding_id.length, 79);
  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 finding_id rejects illegal characters and over-length", () => {
  for (const invalidFindingId of [
    `finding:sha256:${"a".repeat(63)}`,
    `finding:sha256:${"a".repeat(65)}`,
    `finding:sha256:${"A".repeat(64)}`,
    `finding:sha256:${"g".repeat(64)}`,
    `finding:sha512:${"a".repeat(64)}`,
    "finding_001"
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({ finding_id: invalidFindingId })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 evidence_ref accepts evidence grammar at max length", () => {
  const decisionIdAtLimit = "e".repeat(128);
  const evidenceRef = makeEvidenceRef(decisionIdAtLimit, "9999");
  const finding = makeFinding({ evidence_refs: [evidenceRef] });

  assert.ok(evidenceRef.length <= 256);
  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 evidence_ref rejects illegal characters and over-length", () => {
  for (const evidenceRef of [
    `evidence://sandbox/security/${"e".repeat(129)}/0001`,
    "evidence://sandbox/security/.decision/0001",
    "evidence://sandbox/security/decision 001/0001",
    "evidence://sandbox/security/decision_001/%001",
    "evidence://sandbox/security/decision_001/abcd",
    "https://sandbox/security/decision_001/0001"
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({ evidence_refs: [evidenceRef] })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 evidence_ref accepts only finding ordinal or engine-0001 grammar", () => {
  for (const suffix of ["0000", "0001", "9999", "engine-0001"]) {
    const finding = makeFinding({ evidence_refs: [makeEvidenceRef("decision_001", suffix)] });
    assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
  }

  for (const suffix of [
    "001",
    "00001",
    "engine-0000",
    "engine-0002",
    "finding-0001",
    "engine0001"
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({ evidence_refs: [makeEvidenceRef("decision_001", suffix)] })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 detector_version accepts version grammar", () => {
  const versionAtLimit = `1.0.0-${"a".repeat(58)}`;
  assert.equal(versionAtLimit.length, 64);

  for (const detectorVersion of ["0.0.0", "1.2.3", "1.2.3-alpha.1", versionAtLimit]) {
    const finding = makeFinding({ detector_version: detectorVersion });
    assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
  }

  for (const detectorVersion of [
    "v1.2.3",
    "1.2",
    "1.2.3-ALPHA",
    `1.0.0-${"a".repeat(59)}`,
    ""
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({ detector_version: detectorVersion })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 detector_id accepts detector URI grammar at max 128", () => {
  const detectorIdAtLimit = `detector://${"a".repeat(64)}/${"b".repeat(52)}`;
  const finding = makeFinding({ detector_id: detectorIdAtLimit });

  assert.equal(detectorIdAtLimit.length, 128);
  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 detector_id rejects illegal characters and over-length", () => {
  for (const detectorId of [
    `detector://${"a".repeat(64)}/${"b".repeat(53)}`,
    `detector://${"a".repeat(65)}/valid`,
    "detector://single-segment",
    "detector://sandbox/security/bad segment",
    "detector://sandbox/security/bad?query",
    "detector:///sandbox/security",
    "https://sandbox/security/rule"
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding({ detector_id: detectorId })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 shared run detector_id is a string and has no Engine type dependency", () => {
  const detectorId: string = "detector://vendor/security/runtime/v9";
  const run = makeDetectorRun({ detector_id: detectorId });
  const normalized = normalizeSandboxDetectorRun(run);

  assert.deepEqual(normalized, run);
  assert.equal(normalized?.detector_id, detectorId);
});

test("REQ-SBX-GENERAL-001 shared normalizer accepts all three built-in detector URI IDs", () => {
  for (const detectorId of [
    "detector://sandbox/security/rule/default/v1",
    "detector://sandbox/security/local/default/v1",
    "detector://sandbox/security/judge/default/v1"
  ]) {
    const run = makeDetectorRun({ detector_id: detectorId });
    assert.deepEqual(normalizeSandboxDetectorRun(run), run);
  }
});

test("REQ-SBX-GENERAL-001 shared normalizer accepts a syntactically valid unknown detector URI", () => {
  const finding = makeFinding({
    detector_id: "detector://third-party/security/custom/v42"
  });

  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 shared normalizer rejects malformed detector URI", () => {
  for (const detectorId of [
    "detector://",
    "detector://one",
    "detector://one//two",
    "DETECTOR://one/two",
    "detector://one/two/",
    "detector://one/twö"
  ]) {
    assert.equal(
      normalizeSandboxDetectorRun(makeDetectorRun({ detector_id: detectorId })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 detector_id shared normalizer does not hard-code slot constants", () => {
  const source = readSandboxSecurityContractSource();
  assert.doesNotMatch(
    source,
    /detector:\/\/sandbox\/security\/(?:rule|local|judge)\/default\/v1/
  );
  assert.notEqual(
    normalizeSandboxDetectorRun(
      makeDetectorRun({ detector_id: "detector://vendor/security/arbitrary/v1" })
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 detector_id shared normalizer does not import profile manifests", () => {
  const source = readSandboxSecurityContractSource();

  assert.doesNotMatch(source, /policy-profiles|profile-manifest|resolveSandboxSecurityProfile/i);
  assert.notEqual(
    normalizeSandboxSecurityFinding(
      makeFinding({ detector_id: "detector://unregistered/security/rule/v1" })
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 shared types do not import engines sandbox security modules", () => {
  const contractSource = readSandboxSecurityContractSource();
  const typesSource = readFileSync(sandboxSecurityTypesPath, "utf8");

  assert.doesNotMatch(contractSource, /(?:from|import\()\s*["'][^"']*engines\//);
  assert.doesNotMatch(typesSource, /(?:from|import\()\s*["'][^"']*engines\//);
  assert.deepEqual(Object.keys(sandboxSecurityContract).sort(), [
    "normalizeSandboxDetectorRun",
    "normalizeSandboxSecurityDecision",
    "normalizeSandboxSecurityFinding",
    "normalizeSandboxSecurityRequest"
  ]);
  assert.strictEqual(
    sandboxSecurityContract.normalizeSandboxSecurityRequest,
    normalizeSandboxSecurityRequest
  );
});

test("REQ-SBX-GENERAL-001 reason_code accepts closed public reason tokens only", () => {
  const categories = [
    "prompt_injection",
    "jailbreak",
    "instruction_override",
    "privilege_escalation",
    "sensitive_data_exposure",
    "tool_hijacking",
    "unsafe_side_effect",
    "memory_poisoning",
    "trust_boundary_violation"
  ] as const;

  for (const category of categories) {
    const finding = makeFinding({
      category,
      reason_code: `sandbox_security_${category}`
    });
    assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
  }

  for (const reasonCode of [
    "sandbox_security_unknown",
    "prompt_injection",
    "SANDBOX_SECURITY_PROMPT_INJECTION",
    ""
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding({ reason_code: reasonCode })),
      null
    );
  }

  for (const confidence of [0, 1]) {
    assert.notEqual(
      normalizeSandboxSecurityFinding(makeFinding({ confidence })),
      null
    );
  }
  for (const confidence of [-0.01, 1.01, NaN, Infinity]) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding({ confidence })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 reason_code type is SandboxSecurityReasonCode", () => {
  const reasonCode: SandboxSecurityReasonCode =
    "sandbox_security_prompt_injection";
  const finding = makeFinding({ reason_code: reasonCode });

  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 ISO timestamps accept real-calendar values and reject invalid dates", () => {
  for (const createdAt of [
    "2024-02-29T23:59:59Z",
    "2026-07-13T12:34:56.789Z",
    "2026-07-13T12:34:56+08:00"
  ]) {
    const decision = makeDecision({ created_at: createdAt });
    assert.deepEqual(normalizeSandboxSecurityDecision(decision), decision);
  }

  for (const createdAt of [
    "2023-02-29T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-07-13T25:00:00Z",
    "2026-07-13",
    "not-a-date"
  ]) {
    assert.equal(
      normalizeSandboxSecurityDecision(makeDecision({ created_at: createdAt })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 subject refs accept 1 and 8 unique refs", () => {
  const oneSubject = makeFinding();
  const eightSubjects = makeFinding({
    subject_refs: Array.from({ length: 8 }, (_, index) => ({
      kind: "content_source",
      source_token: makeSourceToken("decision_001", String(index + 1).padStart(4, "0")),
      locator: { kind: "whole_source" }
    }))
  });

  assert.deepEqual(normalizeSandboxSecurityFinding(oneSubject), oneSubject);
  assert.deepEqual(normalizeSandboxSecurityFinding(eightSubjects), eightSubjects);
});

test("REQ-SBX-GENERAL-001 subject refs reject 0 and 9 refs", () => {
  assert.equal(
    normalizeSandboxSecurityFinding(makeFinding({ subject_refs: [] })),
    null
  );
  assert.equal(
    normalizeSandboxSecurityFinding(
      makeFinding({
        subject_refs: Array.from({ length: 9 }, (_, index) => ({
          kind: "content_source",
          source_token: makeSourceToken(
            "decision_001",
            String(index + 1).padStart(4, "0")
          ),
          locator: { kind: "whole_source" }
        }))
      })
    ),
    null
  );
  assert.equal(
    normalizeSandboxSecurityFinding(
      makeFinding({
        subject_refs: [
          {
            kind: "content_source",
            source_token: makeSourceToken(),
            locator: { kind: "whole_source" }
          },
          {
            locator: { kind: "whole_source" },
            source_token: makeSourceToken(),
            kind: "content_source"
          }
        ]
      })
    ),
    null
  );
});

test("REQ-SBX-GENERAL-001 content locator rejects malformed JSON pointer", () => {
  const pointerAtLimit = `${`/${"a".repeat(64)}`.repeat(7)}/${"b".repeat(56)}`;
  assert.equal(Buffer.byteLength(pointerAtLimit, "utf8"), 512);
  for (const pointer of [
    "/field/tilde/slash/0/10/a.b-c_d",
    pointerAtLimit
  ]) {
    assert.notEqual(
      normalizeSandboxSecurityFinding(
        makeFinding({
          subject_refs: [
            {
              kind: "content_source",
              source_token: makeSourceToken(),
              locator: { kind: "json_pointer", pointer }
            }
          ]
        })
      ),
      null
    );
  }

  for (const pointer of [
    "",
    "field",
    "/",
    "/field//nested",
    "/field/~",
    "/field/~2",
    "/~0",
    "/~1",
    "/field/~0tilde",
    "/field/~1slash",
    "/01",
    "/field with space",
    "/é",
    `/${"a".repeat(65)}`,
    `${pointerAtLimit}b`
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(
        makeFinding({
          subject_refs: [
            {
              kind: "content_source",
              source_token: makeSourceToken(),
              locator: { kind: "json_pointer", pointer }
            }
          ]
        })
      ),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 tool locator rejects component locator mismatch", () => {
  const invalidSubjects = [
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      component: "whole_call",
      locator: { kind: "whole_arguments" }
    },
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      component: "tool_name",
      locator: { kind: "json_pointer", pointer: "/name" }
    },
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      component: "target",
      locator: { kind: "whole_arguments" }
    },
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      component: "arguments"
    },
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      component: "arguments",
      locator: { kind: "whole_source" }
    }
  ];

  for (const subject of invalidSubjects) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding({ subject_refs: [subject] })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 normalizes content and tool finding subjects", () => {
  const finding = makeFinding({
    subject_refs: [
      {
        kind: "content_source",
        source_token: makeSourceToken(),
        locator: { kind: "text_byte_range", start_byte: 0, end_byte: 4 }
      },
      {
        kind: "content_source",
        source_token: makeSourceToken("decision_001", "0002"),
        locator: { kind: "json_pointer", pointer: "/items/0/name" }
      },
      {
        kind: "tool_request",
        call_token: makeCallToken(),
        component: "whole_call"
      },
      {
        kind: "tool_request",
        call_token: makeCallToken("decision_001", "0002"),
        component: "tool_name"
      },
      {
        kind: "tool_request",
        call_token: makeCallToken("decision_001", "0003"),
        component: "target"
      },
      {
        kind: "tool_request",
        call_token: makeCallToken("decision_001", "0004"),
        component: "arguments",
        locator: { kind: "whole_arguments" }
      },
      {
        kind: "tool_request",
        call_token: makeCallToken("decision_001", "0005"),
        component: "arguments",
        locator: { kind: "json_pointer", pointer: "/items/0" }
      }
    ]
  });

  assert.deepEqual(normalizeSandboxSecurityFinding(finding), finding);
});

test("REQ-SBX-GENERAL-001 rejects mixed subject union fields", () => {
  const invalidSubjects = [
    {
      kind: "content_source",
      source_token: makeSourceToken(),
      call_token: makeCallToken(),
      locator: { kind: "whole_source" }
    },
    {
      kind: "tool_request",
      call_token: makeCallToken(),
      source_token: makeSourceToken(),
      component: "whole_call"
    },
    {
      kind: "content_source",
      source_token: makeSourceToken(),
      locator: { kind: "text_byte_range", start_byte: 4, end_byte: 4 }
    },
    {
      kind: "content_source",
      source_token: makeSourceToken(),
      locator: { kind: "text_byte_range", start_byte: -1, end_byte: 4 }
    },
    {
      kind: "content_source",
      source_token: makeSourceToken(),
      locator: { kind: "whole_source", pointer: "/extra" }
    }
  ];

  for (const subject of invalidSubjects) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding({ subject_refs: [subject] })),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 rejects caller IDs hashes and prose in findings", () => {
  for (const extra of [
    { source_id: "source_001" },
    { call_id: "call_001" },
    { raw_content: "secret" },
    { content_hash: "a".repeat(64) },
    { provenance_ref: "source://fixture/item" },
    { snippet: "secret" },
    { reason: "free prose" },
    { message: "provider message" },
    { provider: "external" }
  ]) {
    assert.equal(
      normalizeSandboxSecurityFinding(makeFinding(extra)),
      null
    );
  }

  assert.equal(
    normalizeSandboxSecurityFinding(
      Object.assign(Object.create({ inherited: true }), makeFinding())
    ),
    null
  );

  let getterCalled = false;
  const accessorFinding = makeFinding();
  Object.defineProperty(accessorFinding, "confidence", {
    enumerable: true,
    get() {
      getterCalled = true;
      return 0.9;
    }
  });
  assert.equal(normalizeSandboxSecurityFinding(accessorFinding), null);
  assert.equal(getterCalled, false);

  const symbolFinding = makeFinding() as Record<PropertyKey, unknown>;
  symbolFinding[Symbol("raw")] = "secret";
  assert.equal(normalizeSandboxSecurityFinding(symbolFinding), null);
});

test("REQ-SBX-GENERAL-001 normalizes every detector run branch", () => {
  const runs = [
    makeDetectorRun(),
    makeDetectorRun({ status: "no_match", finding_ids: [] }),
    makeDetectorRun({
      status: "failed",
      error_code: "detector_failed",
      finding_ids: undefined
    }),
    makeDetectorRun({
      status: "timeout",
      error_code: "detector_timeout",
      finding_ids: undefined
    }),
    makeDetectorRun({
      status: "invalid_result",
      error_code: "detector_result_invalid",
      finding_ids: undefined
    }),
    makeDetectorRun({
      status: "skipped",
      skip_reason: "optional_not_selected",
      finding_ids: undefined,
      obligation: "optional_not_selected"
    })
  ];

  for (const run of runs) {
    const branchExactRun = Object.fromEntries(
      Object.entries(run).filter(([, value]) => value !== undefined)
    );
    assert.deepEqual(normalizeSandboxDetectorRun(branchExactRun), branchExactRun);
  }
});

test("REQ-SBX-GENERAL-001 run skip reasons equal the revised closed five-value set", () => {
  const skipReasons = [
    "optional_not_configured",
    "optional_not_selected",
    "routing_not_selected",
    "risk_short_circuit",
    "evaluation_terminated"
  ] as const;

  for (const [index, skipReason] of skipReasons.entries()) {
    const run = {
      detector_id: "detector://sandbox/security/rule/default/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: ["profile_required", "runtime_required", "optional_not_selected"][
        index % 3
      ],
      elapsed_ms: 0,
      status: "skipped",
      skip_reason: skipReason
    };
    assert.deepEqual(normalizeSandboxDetectorRun(run), run);
  }

  for (const skipReason of ["budget_exhausted", "not_selected", ""]) {
    assert.equal(
      normalizeSandboxDetectorRun({
        detector_id: "detector://sandbox/security/rule/default/v1",
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 0,
        status: "skipped",
        skip_reason: skipReason
      }),
      null
    );
  }
});

test("REQ-SBX-GENERAL-001 detector run errors exclude Engine-level budget exhaustion", () => {
  const errorCodes = [
    "detector_unavailable",
    "detector_failed",
    "detector_timeout",
    "detector_result_invalid",
    "detector_content_leak",
    "external_redaction_failed",
    "adapter_unsupported"
  ] as const;

  for (const errorCode of errorCodes) {
    const run = {
      detector_id: "detector://sandbox/security/rule/default/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 2.5,
      status: "failed",
      error_code: errorCode
    };
    assert.deepEqual(normalizeSandboxDetectorRun(run), run);
  }

  assert.equal(
    normalizeSandboxDetectorRun({
      detector_id: "detector://sandbox/security/rule/default/v1",
      detector_version: "1.0.0",
      detector_kind: "rule",
      obligation: "profile_required",
      elapsed_ms: 1,
      status: "failed",
      error_code: "evaluation_budget_exhausted"
    }),
    null
  );
});

test("REQ-SBX-GENERAL-001 rejects illegal run branch fields", () => {
  const invalidRuns = [
    makeDetectorRun({ error_code: "detector_failed" }),
    makeDetectorRun({
      status: "failed",
      error_code: "detector_failed"
    }),
    makeDetectorRun({
      status: "skipped",
      skip_reason: "evaluation_terminated",
      finding_ids: undefined,
      error_code: "detector_failed"
    }),
    makeDetectorRun({ status: "unknown" }),
    makeDetectorRun({ obligation: "required" }),
    makeDetectorRun({ detector_kind: "remote_model" }),
    makeDetectorRun({ elapsed_ms: -1 }),
    makeDetectorRun({ elapsed_ms: NaN }),
    makeDetectorRun({ finding_ids: [findingId, findingId] }),
    makeDetectorRun({ raw_output: "secret" })
  ];

  for (const run of invalidRuns) {
    assert.equal(normalizeSandboxDetectorRun(run), null);
  }

  let getterCalled = false;
  const accessorRun = makeDetectorRun();
  Object.defineProperty(accessorRun, "elapsed_ms", {
    enumerable: true,
    get() {
      getterCalled = true;
      return 1;
    }
  });
  assert.equal(normalizeSandboxDetectorRun(accessorRun), null);
  assert.equal(getterCalled, false);
});

test("REQ-SBX-GENERAL-001 structurally normalizes simulation and enforcement decisions", () => {
  for (const evaluationMode of ["simulation", "enforcement"]) {
    const decision = makeDecision({ evaluation_mode: evaluationMode });
    assert.deepEqual(normalizeSandboxSecurityDecision(decision), decision);
  }

  const decision = makeDecision();
  const normalized = normalizeSandboxSecurityDecision(decision);
  assert.deepEqual(normalized, decision);
  assert.ok(normalized);
  assert.notStrictEqual(normalized, decision);
  assert.notStrictEqual(normalized.findings, decision.findings);
  assert.notStrictEqual(normalized.findings[0], decision.findings[0]);
  assert.notStrictEqual(normalized.findings[0].subject_refs, decision.findings[0].subject_refs);
  assert.notStrictEqual(normalized.detector_runs, decision.detector_runs);
  assert.notStrictEqual(normalized.evidence_refs, decision.evidence_refs);

  const invalidDecisions = [
    makeDecision({ schema_version: "sandbox-security-decision.v2" }),
    makeDecision({ decision_id: ".decision" }),
    makeDecision({ request_id: "request/invalid" }),
    makeDecision({ evaluation_mode: "preview" }),
    makeDecision({ stage: "tool_result" }),
    makeDecision({ policy_profile_id: "sandbox-security-custom.v1" }),
    makeDecision({ verdict: "safe" }),
    makeDecision({ action: "block" }),
    makeDecision({ risk_level: "severe" }),
    makeDecision({ evidence_refs: [makeEvidenceRef(), makeEvidenceRef()] }),
    makeDecision({ findings: [makeFinding(), makeFinding()] }),
    makeDecision({
      detector_runs: [makeDetectorRun(), makeDetectorRun()]
    }),
    makeDecision({ findings: [makeFinding({ confidence: 2 })] }),
    makeDecision({ detector_runs: [makeDetectorRun({ elapsed_ms: -1 })] }),
    makeDecision({ raw_content: "secret" })
  ];
  for (const invalidDecision of invalidDecisions) {
    assert.equal(normalizeSandboxSecurityDecision(invalidDecision), null);
  }

  let getterCalled = false;
  const accessorDecision = makeDecision();
  Object.defineProperty(accessorDecision, "created_at", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "2026-07-13T12:34:56Z";
    }
  });
  assert.equal(normalizeSandboxSecurityDecision(accessorDecision), null);
  assert.equal(getterCalled, false);
});

test("REQ-SBX-GENERAL-001 does not perform engine semantic reduction", () => {
  const contradictoryDecision = makeDecision({
    evaluation_mode: "simulation",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    findings: [makeFinding()],
    detector_runs: [
      {
        detector_id: "detector://unregistered/security/custom/v1",
        detector_version: "1.0.0",
        detector_kind: "external_judge",
        obligation: "optional_not_selected",
        elapsed_ms: 0,
        status: "failed",
        error_code: "detector_timeout"
      }
    ]
  });

  assert.deepEqual(
    normalizeSandboxSecurityDecision(contradictoryDecision),
    contradictoryDecision
  );
});
