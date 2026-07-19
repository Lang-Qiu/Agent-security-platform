import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveSandboxSecurityProfile,
  type SandboxSecuritySanitizedJudgePayload,
  type SandboxSecuritySanitizer
} from "../src/security/index.ts";

const sanitizerModuleUrl = new URL(
  "../src/security-production/deterministic-sanitizer.ts",
  import.meta.url
);

const sanitizerModule: Readonly<{
  SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION:
    "sandbox-security-deterministic-sanitizer.v1";
  createSandboxSecurityDeterministicSanitizer(): SandboxSecuritySanitizer;
}> = existsSync(sanitizerModuleUrl)
  ? await import("../src/security-production/deterministic-sanitizer.ts")
  : {
      SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION:
        "sandbox-security-deterministic-sanitizer.v1" as const,
      createSandboxSecurityDeterministicSanitizer() {
        return {
          async sanitize(snapshot: any, routed_obligations: any) {
            return {
              schema_version: "sandbox-security-sanitized-judge.v1" as const,
              request_token: "inert-request-token",
              stage: snapshot.stage,
              policy_profile_id: snapshot.profile.profile_id,
              sources: snapshot.contents.map((source: any) => ({
                source_token: "inert-source-token",
                source_type: source.source_type,
                media_type: source.media_type,
                sanitized_value: source.value
              })),
              routed_obligations
            } as SandboxSecuritySanitizedJudgePayload;
          }
        };
      }
    };

const NONCE = "a".repeat(32);
const SOURCE_HANDLE = `hsrc:${NONCE}:0001`;
const SOURCE_TOKEN = `etok:src:${NONCE}:0001`;
const OBLIGATION_ID = "obligation://sandbox/security/decision-1/0001";

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

interface SnapshotOptions {
  readonly values?: readonly unknown[];
  readonly stage?: "user_input" | "model_output" | "tool_request";
  readonly tool?: Readonly<{
    arguments: unknown;
    tool_name?: string;
    target?: string;
    has_target?: boolean;
  }>;
  readonly source_overrides?: Readonly<Record<string, unknown>>;
  readonly snapshot_overrides?: Readonly<Record<string, unknown>>;
  readonly freeze?: boolean;
}

function sourceHandle(indexFromOne: number): string {
  return `hsrc:${NONCE}:${String(indexFromOne).padStart(4, "0")}`;
}

function sourceToken(indexFromOne: number): string {
  return `etok:src:${NONCE}:${String(indexFromOne).padStart(4, "0")}`;
}

function makeSnapshot(
  value?: unknown,
  options: SnapshotOptions = {}
) {
  const effectiveValue = arguments.length === 0 ? "Bearer secret-token" : value;
  const values = options.values ?? [effectiveValue];
  const raw = {
    request_id: "request-1",
    evaluation_mode: "simulation" as const,
    stage: options.stage ?? (options.tool ? "tool_request" as const : "user_input" as const),
    profile: resolveSandboxSecurityProfile("sandbox-security-balanced.v1"),
    contents: values.map((sourceValue, index) => ({
        source_handle: sourceHandle(index + 1),
        source_id: `source-${index + 1}`,
        source_type: "user_input" as const,
        media_type: typeof sourceValue === "string" ? "text/plain" as const : "application/json" as const,
        authority_kind: "simulation_observation" as const,
        value: sourceValue,
        provenance_ref: `source://sanitizer/source-${index + 1}`,
        original_utf8_bytes: [1],
        original_value_sha256: "b".repeat(64),
        comparison_value: sourceValue,
        trust_class: "user_supplied" as const,
        ...(index === 0 ? options.source_overrides : {})
      })),
    ...(options.tool
      ? {
          tool_request: {
            call_handle: `hcall:${NONCE}:0000`,
            call_id: "call-1",
            authority_kind: "simulation_observation" as const,
            tool_name: options.tool.tool_name ?? "send_message",
            arguments: options.tool.arguments,
            arguments_jcs_sha256: "d".repeat(64),
            has_target: options.tool.has_target ?? options.tool.target !== undefined,
            ...(options.tool.target !== undefined
              ? { target: options.tool.target }
              : {})
          }
        }
      : {}),
    canonical_request_sha256: "c".repeat(64),
    ...options.snapshot_overrides
  };
  return options.freeze === false ? raw : deepFreeze(raw);
}

function makeObligation(
  indexFromOne = 1,
  overrides: Readonly<Record<string, unknown>> = {}
) {
  return {
    obligation_id:
      indexFromOne === 1
        ? OBLIGATION_ID
        : `obligation://sandbox/security/decision-1/${String(indexFromOne).padStart(4, "0")}`,
    category: "prompt_injection" as const,
    subject_refs: [
      {
        kind: "content_source" as const,
        source_token: sourceToken(indexFromOne),
        locator: { kind: "whole_source" as const }
      }
    ],
    ...overrides
  };
}

function makeObligations(...values: Readonly<Record<string, unknown>>[]) {
  return deepFreeze(values.length === 0 ? [makeObligation()] : values);
}

async function sanitizeWith(
  sanitizer: SandboxSecuritySanitizer,
  snapshot: unknown,
  obligations: unknown = makeObligations(),
  signal: AbortSignal = new AbortController().signal
) {
  return sanitizer.sanitize(snapshot as never, obligations as never, signal);
}

async function sanitize(
  snapshot: unknown,
  obligations: unknown = makeObligations(),
  signal: AbortSignal = new AbortController().signal
) {
  return sanitizeWith(
    sanitizerModule.createSandboxSecurityDeterministicSanitizer(),
    snapshot,
    obligations,
    signal
  );
}

function assertRecursivelyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) {
      assertRecursivelyFrozen(descriptor.value, seen);
    }
  }
}

function assertRecursivelyFresh(left: unknown, right: unknown): void {
  if (left === null || typeof left !== "object") return;
  assert.equal(right !== null && typeof right === "object", true);
  assert.notStrictEqual(left, right);
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right as object);
  assert.deepEqual(leftKeys, rightKeys);
  for (const key of leftKeys) {
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right as object, key);
    assert.equal(leftDescriptor !== undefined && "value" in leftDescriptor, true);
    assert.equal(rightDescriptor !== undefined && "value" in rightDescriptor, true);
    assertRecursivelyFresh(leftDescriptor?.value, rightDescriptor?.value);
  }
}

async function assertExternalRedactionFailure(
  operation: () => Promise<unknown>
): Promise<void> {
  await assert.rejects(operation, (failure: unknown) => {
    assert.equal(failure instanceof Error, true);
    const error = failure as Error & { cause?: unknown };
    assert.equal(error.name, "external_redaction_failed");
    assert.equal(error.message, "external_redaction_failed");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(Object.hasOwn(error, "payload"), false);
    assert.doesNotMatch(
      `${error.name}\n${error.message}\n${
        Object.hasOwn(error, "cause") ? String(error.cause) : ""
      }`,
      /secret|https?:\/\//iu
    );
    return true;
  });
}

test("REQ-SBX-GENERAL-002 sanitizer redacts authorization values", async () => {
  const sourceIdSentinel = "raw-source-id-must-not-enter-judge-payload";
  const payload = await sanitize(
    makeSnapshot("Bearer secret-token", {
      source_overrides: { source_id: sourceIdSentinel }
    })
  );

  assert.equal(payload.sources[0]?.sanitized_value, "[REDACTED_TOKEN]");
  assert.doesNotMatch(JSON.stringify(payload), /Bearer secret-token/u);
  assert.equal(JSON.stringify(payload).includes(sourceIdSentinel), false);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects numeric invalid UTF-16 and non-NFKC source_id without a partial payload", async () => {
  const invalidSourceIds = [123, "\ud800", "source-\u212b"] as const;

  for (const sourceId of invalidSourceIds) {
    const snapshot = makeSnapshot("unused", {
      values: ["safe-first-source", "safe-second-source"],
      freeze: false
    }) as any;
    snapshot.contents[1].source_id = sourceId;
    deepFreeze(snapshot);
    let completedPayload: unknown;

    await assertExternalRedactionFailure(async () => {
      completedPayload = await sanitize(snapshot);
      return completedPayload;
    });
    assert.equal(completedPayload, undefined);
  }
});

test("REQ-SBX-GENERAL-002 sanitizer derives tokens and returns a fresh canonical frozen payload", async () => {
  const sourceJson = deepFreeze({ body: ["first", "second"] });
  const snapshot = makeSnapshot(sourceJson, {
    values: [sourceJson, "second source"],
    tool: {
      arguments: { target: "team@example.com", tool_name: "not-an-identity" },
      target: "https://user:pass@example.com/private?api_key=value"
    }
  });
  const locator = deepFreeze({ kind: "json_pointer" as const, pointer: "/body/0" });
  const obligations = makeObligations(
    makeObligation(1, {
      subject_refs: [
        {
          kind: "content_source" as const,
          source_token: SOURCE_TOKEN,
          locator
        }
      ]
    }),
    makeObligation(2, {
      category: "tool_hijacking",
      subject_refs: [
        {
          kind: "tool_request" as const,
          call_token: `etok:call:${NONCE}:0000`,
          component: "arguments" as const,
          locator: { kind: "whole_arguments" as const }
        }
      ]
    })
  );

  const payload = await sanitize(snapshot, obligations);

  assert.deepEqual(Object.keys(payload), [
    "schema_version",
    "request_token",
    "stage",
    "policy_profile_id",
    "sources",
    "tool_request",
    "routed_obligations"
  ]);
  assert.equal(payload.schema_version, "sandbox-security-sanitized-judge.v1");
  assert.equal(payload.request_token, `etok:req:${NONCE}`);
  assert.deepEqual(
    payload.sources.map((source: any) => source.source_token),
    [sourceToken(1), sourceToken(2)]
  );
  assert.equal(payload.tool_request?.call_token, `etok:call:${NONCE}:0000`);
  assert.equal(
    payload.tool_request?.tool_name_token,
    `etok:tool-name:${NONCE}:0000`
  );
  assert.equal(Object.hasOwn(payload.tool_request ?? {}, "tool_name"), false);
  assert.notStrictEqual(payload.sources, (snapshot as any).contents);
  assert.notStrictEqual(payload.sources[0]?.sanitized_value, sourceJson);
  assert.notStrictEqual(payload.routed_obligations, obligations);
  assert.notStrictEqual(payload.routed_obligations[0], obligations[0]);
  assert.notStrictEqual(payload.routed_obligations[0]?.subject_refs[0], (obligations[0] as any).subject_refs[0]);
  assert.notStrictEqual(
    (payload.routed_obligations[0]?.subject_refs[0] as any).locator,
    locator
  );
  assertRecursivelyFrozen(payload);
});

test("REQ-SBX-GENERAL-002 sanitizer is deterministic and preserves array and source order", async () => {
  const snapshot = makeSnapshot(["third", "first", "second"], {
    values: [["third", "first", "second"], "tail"]
  });
  const first = await sanitize(snapshot);
  const second = await sanitize(snapshot);

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.sources[0]?.sanitized_value, ["third", "first", "second"]);
  assert.deepEqual(
    first.sources.map((source: any) => source.source_token),
    [sourceToken(1), sourceToken(2)]
  );
  assert.notStrictEqual(first, second);
});

test("REQ-SBX-GENERAL-002 sanitizer instance isolates sequential success failure and fresh identity", async () => {
  const instance = sanitizerModule.createSandboxSecurityDeterministicSanitizer();
  const obligations = makeObligations();
  const cleanSnapshot = makeSnapshot({ body: ["Secr3t", { content: "ordinary" }] });

  await sanitizeWith(instance, makeSnapshot({ password: "Secr3t" }), obligations);
  const first = await sanitizeWith(instance, cleanSnapshot, obligations);
  const second = await sanitizeWith(instance, cleanSnapshot, obligations);
  assert.deepEqual(first, second);
  assertRecursivelyFresh(first, second);

  await assertExternalRedactionFailure(() =>
    sanitizeWith(
      instance,
      makeSnapshot({ password: "Secr3t", content: "Secr3t" }),
      obligations
    )
  );
  const afterFailure = await sanitizeWith(instance, cleanSnapshot, obligations);
  assert.deepEqual(second, afterFailure);
  assertRecursivelyFresh(second, afterFailure);
  assertRecursivelyFrozen(afterFailure);
});

test("REQ-SBX-GENERAL-002 sanitizer instance returns recursively fresh concurrent results", async () => {
  const instance = sanitizerModule.createSandboxSecurityDeterministicSanitizer();
  const snapshot = makeSnapshot({ body: ["first", { content: "second" }] });
  const obligations = makeObligations();
  const [left, right] = await Promise.all([
    sanitizeWith(instance, snapshot, obligations),
    sanitizeWith(instance, snapshot, obligations)
  ]);

  assert.deepEqual(left, right);
  assertRecursivelyFresh(left, right);
  assertRecursivelyFrozen(left);
  assertRecursivelyFrozen(right);
});

test("REQ-SBX-GENERAL-002 sanitizer NFKC-normalizes copied content but rejects altered protocol identities", async () => {
  const payload = await sanitize(
    makeSnapshot({ name: "Cafe\u0301", content: "\u2460" })
  );
  assert.deepEqual(payload.sources[0]?.sanitized_value, {
    content: "1",
    name: "Caf\u00e9"
  });

  const badObligations = makeObligations(
    makeObligation(1, {
      subject_refs: [
        {
          kind: "content_source",
          source_token: SOURCE_TOKEN,
          locator: { kind: "json_pointer", pointer: "/\u212b" }
        }
      ]
    })
  );
  await assert.rejects(() => sanitize(makeSnapshot({ name: "ok" }), badObligations));
});

test("REQ-SBX-GENERAL-002 sanitizer ordinalizes unknown keys using UTF-16 code-unit order", async () => {
  const astral = "\u{10000}";
  const bmp = "\uffff";
  const payload = await sanitize(makeSnapshot({ [bmp]: "bmp", [astral]: "astral" }));

  assert.deepEqual(payload.sources[0]?.sanitized_value, {
    field_0001: "astral",
    field_0002: "bmp"
  });
});

test("REQ-SBX-GENERAL-002 sanitizer preserves exactly the safe JSON-key catalog in final UTF-16 order", async () => {
  const safeKeys = [
    "arguments",
    "body",
    "content",
    "endpoint",
    "headers",
    "method",
    "name",
    "path",
    "recipient",
    "subject",
    "target",
    "url"
  ];
  const value = Object.fromEntries([...safeKeys].reverse().map((key) => [key, "ok"]));
  const payload = await sanitize(makeSnapshot(value));

  assert.deepEqual(Object.keys(payload.sources[0]?.sanitized_value as object), safeKeys);
});

test("REQ-SBX-GENERAL-002 sanitizer ordinalizes tool_name value sensitive keys and every header child", async () => {
  const payload = await sanitize(
    makeSnapshot({
      tool_name: "send_message",
      value: "ordinary",
      password: "short",
      headers: {
        name: "visible value",
        authorization: "Bearer header-secret"
      }
    })
  );
  const sanitizedValue = payload.sources[0]?.sanitized_value as any;

  assert.deepEqual(Object.keys(sanitizedValue), [
    "field_0001",
    "field_0002",
    "field_0003",
    "headers"
  ]);
  assert.equal(sanitizedValue.field_0001, "[REDACTED_CREDENTIAL]");
  assert.equal(sanitizedValue.field_0002, "send_message");
  assert.equal(sanitizedValue.field_0003, "ordinary");
  assert.deepEqual(sanitizedValue.headers, {
    field_0001: "[REDACTED_CREDENTIAL]",
    field_0002: "visible value"
  });
});

test("REQ-SBX-GENERAL-002 sanitizer fails closed on NFKC key collisions", async () => {
  await assert.rejects(() =>
    sanitize(makeSnapshot({ "\u212b": "first", "\u00c5": "second" }))
  );
});

test("REQ-SBX-GENERAL-002 sanitizer emits every fixed redaction placeholder", async () => {
  const values = [
    "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    "Bearer short-token",
    "person@example.com",
    "+1 (415) 555-2671",
    "192.168.1.1",
    "{550e8400-e29b-41d4-a716-446655440000}",
    "/home/operator/private.txt",
    "https://example.com/private/path",
    "https://user:pass@example.com/private?api_key=value",
    "aA1!xxxxxxxxxxxxxxxxxxxx"
  ];
  const payload = await sanitize(makeSnapshot(values));
  const placeholders = new Set(
    JSON.stringify(payload).match(/\[REDACTED_[A-Z_]+\]/gu) ?? []
  );

  assert.deepEqual(placeholders, new Set([
    "[REDACTED_CREDENTIAL]",
    "[REDACTED_TOKEN]",
    "[REDACTED_EMAIL]",
    "[REDACTED_PHONE]",
    "[REDACTED_IP]",
    "[REDACTED_IDENTIFIER]",
    "[REDACTED_PATH]",
    "[REDACTED_HOST]",
    "[REDACTED_URL_SECRET]",
    "[REDACTED_HIGH_ENTROPY]"
  ]));
});

test("REQ-SBX-GENERAL-002 sanitizer applies private authorization password and JWT grammars", async () => {
  const payload = await sanitize(
    makeSnapshot({
      body: [
        "-----BEGIN RSA PRIVATE KEY-----\nmaterial\n-----END RSA PRIVATE KEY-----",
        "bEaReR token-value",
        "Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
        "abc.def_-.ghi",
        "Bearer ",
        "abc..ghi"
      ],
      password: "x",
      access_token: "y"
    })
  );
  const value = payload.sources[0]?.sanitized_value as any;

  assert.deepEqual(value.body, [
    "[REDACTED_CREDENTIAL]",
    "[REDACTED_TOKEN]",
    "[REDACTED_CREDENTIAL]",
    "[REDACTED_TOKEN]",
    "Bearer ",
    "abc..ghi"
  ]);
  assert.equal(value.field_0001, "[REDACTED_TOKEN]");
  assert.equal(value.field_0002, "[REDACTED_CREDENTIAL]");
});

test("REQ-SBX-GENERAL-002 sanitizer rejects leftover and mismatched private-key markers", async () => {
  const cases = [
    [
      "-----BEGIN PRIVATE KEY-----",
      "material",
      "-----END PRIVATE KEY-----",
      "tail -----BEGIN PRIVATE KEY-----"
    ].join("\n"),
    [
      "-----BEGIN RSA PRIVATE KEY-----",
      "material",
      "-----END PRIVATE KEY-----"
    ].join("\n")
  ];
  const results = await Promise.allSettled(
    cases.map((value) => sanitize(makeSnapshot(value)))
  );

  assert.deepEqual(
    results.map((result) => result.status),
    cases.map(() => "rejected")
  );
});

test("REQ-SBX-GENERAL-002 sanitizer redacts embedded and multiple sensitive spans in deterministic order", async () => {
  const highEntropy = `aA1!${"x".repeat(20)}`;
  const payload = await sanitize(
    makeSnapshot([
      "Contact person@example.com phone +1 (415) 555-2671 IP 10.20.30.40 UUID 550e8400-e29b-41d4-a716-446655440000 path /var/log/app.log",
      `JWT abc.def_-.ghi key ${highEntropy}`,
      "Auth Bearer alpha-token email operator@example.com IP 192.168.1.1",
      "Open https://user:pass@example.com/private?api_key=value then /srv/private/report.txt"
    ])
  );

  assert.deepEqual(payload.sources[0]?.sanitized_value, [
    "Contact [REDACTED_EMAIL] phone [REDACTED_PHONE] IP [REDACTED_IP] UUID [REDACTED_IDENTIFIER] path [REDACTED_PATH]",
    "JWT [REDACTED_TOKEN] key [REDACTED_HIGH_ENTROPY]",
    "Auth [REDACTED_TOKEN] email [REDACTED_EMAIL] IP [REDACTED_IP]",
    "Open https://[REDACTED_HOST]/[REDACTED_PATH]?[REDACTED_URL_SECRET] then [REDACTED_PATH]"
  ]);
});

test("REQ-SBX-GENERAL-002 sanitizer redacts punctuation and assignment delimited candidates", async () => {
  const payload = await sanitize(
    makeSnapshot([
      "(person@example.com)",
      '"person@example.com"',
      "[operator@example.com]",
      "<10.20.30.40>",
      "`https://example.com/a`",
      "|abc.def_-.ghi|",
      "|+1 (415) 555-2671|",
      "`550e8400-e29b-41d4-a716-446655440000`",
      "`/home/operator/key`",
      "url=https://example.com/a",
      "path=/home/operator/key"
    ])
  );
  const largerTokenPayload = await sanitize(
    makeSnapshot("prefix10.20.30.40suffix")
  );

  assert.deepEqual(payload.sources[0]?.sanitized_value, [
    "([REDACTED_EMAIL])",
    '"[REDACTED_EMAIL]"',
    "[[REDACTED_EMAIL]]",
    "<[REDACTED_IP]>",
    "`https://[REDACTED_HOST]/[REDACTED_PATH]`",
    "|[REDACTED_TOKEN]|",
    "|[REDACTED_PHONE]|",
    "`[REDACTED_IDENTIFIER]`",
    "`[REDACTED_PATH]`",
    "url=https://[REDACTED_HOST]/[REDACTED_PATH]",
    "path=[REDACTED_PATH]"
  ]);
  assert.equal(
    largerTokenPayload.sources[0]?.sanitized_value,
    "prefix10.20.30.40suffix"
  );
});

test("REQ-SBX-GENERAL-002 sanitizer redacts a leading URL and preserves prose continuation", async () => {
  const payload = await sanitize(
    makeSnapshot("https://example.com/a then continue")
  );

  assert.equal(
    payload.sources[0]?.sanitized_value,
    "https://[REDACTED_HOST]/[REDACTED_PATH] then continue"
  );
});

test("REQ-SBX-GENERAL-002 sanitizer rejects an oversized assignment delimited URL candidate", async () => {
  await assert.rejects(() =>
    sanitize(makeSnapshot("url=https://example.com/" + "a".repeat(4097)))
  );
});

test("REQ-SBX-GENERAL-002 sanitizer enforces hex base64 and mixed-token thresholds", async () => {
  const mixed = (length: number) => `aA1!${"x".repeat(length - 4)}`;
  const canonicalBase64Url31 = "a".repeat(30) + "A";
  const values = [
    canonicalBase64Url31,
    "a".repeat(32),
    "a".repeat(33),
    "A".repeat(20),
    "A".repeat(24),
    "A".repeat(28),
    mixed(23),
    mixed(24),
    mixed(25),
    "Z".repeat(24) + "===",
    "aA1bbbbbbbbbbbbbbbbbbbbb==="
  ];
  const payload = await sanitize(makeSnapshot(values));

  assert.deepEqual(payload.sources[0]?.sanitized_value, [
    "[REDACTED_TOKEN]",
    "[REDACTED_TOKEN]",
    "[REDACTED_TOKEN]",
    "A".repeat(20),
    "[REDACTED_TOKEN]",
    "[REDACTED_TOKEN]",
    mixed(23),
    "[REDACTED_HIGH_ENTROPY]",
    "[REDACTED_HIGH_ENTROPY]",
    "Z".repeat(24) + "===",
    "[REDACTED_HIGH_ENTROPY]"
  ]);
});

test("REQ-SBX-GENERAL-002 sanitizer classifies a maximal mixed token containing internal punctuation", async () => {
  const payload = await sanitize(
    makeSnapshot("aA1xxxxxxxxxx]xxxxxxxxxx")
  );

  assert.equal(
    payload.sources[0]?.sanitized_value,
    "[REDACTED_HIGH_ENTROPY]"
  );
});

test("REQ-SBX-GENERAL-002 sanitizer classifies only canonical base64 and base64url tokens", async () => {
  const base64url23 = "A".repeat(23);
  const base64url24 = "A".repeat(24);
  const base64url25 = "A".repeat(25);
  const canonicalStandard = "A".repeat(20) + "AQ==";
  const canonicalStandardWithPathLikeSuffix = "AAAAAAAAAAAAAAAA+/AAAAAA";
  const canonicalAlphabetAbsolutePath = "/home/operator/privateke";
  const nonZeroFourPadBits = "A".repeat(20) + "AR==";
  const nonZeroTwoPadBits = "A".repeat(22) + "B=";
  const interiorPadding = "A".repeat(20) + "=AAA";
  const excessivePadding = "A".repeat(21) + "===";
  const values = [
    base64url23,
    base64url24,
    base64url25,
    canonicalStandard,
    canonicalStandardWithPathLikeSuffix,
    canonicalAlphabetAbsolutePath,
    nonZeroFourPadBits,
    nonZeroTwoPadBits,
    interiorPadding,
    excessivePadding
  ];
  const payloads = await Promise.all(
    values.map((value) => sanitize(makeSnapshot(value)))
  );

  assert.deepEqual(payloads.map((payload) => payload.sources[0]?.sanitized_value), [
    base64url23,
    "[REDACTED_TOKEN]",
    base64url25,
    "[REDACTED_TOKEN]",
    "[REDACTED_TOKEN]",
    "[REDACTED_PATH]",
    nonZeroFourPadBits,
    nonZeroTwoPadBits,
    interiorPadding,
    excessivePadding
  ]);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects secret-like match candidates above 4096 code units", async () => {
  await assert.rejects(() =>
    sanitize(makeSnapshot(`prefix aA1!${"x".repeat(4093)} suffix`))
  );
});

test("REQ-SBX-GENERAL-002 sanitizer redacts conservative email phone IP UUID and path grammars", async () => {
  const values = [
    "person@example.com",
    "bad@@example.com",
    "7654321",
    "+12 (345) 678-9012",
    "123456",
    "1234567890123456",
    "10.20.30.40",
    "192.168.001.1",
    "999.20.30.40",
    "2001:db8::1",
    "fe80::1%eth0",
    "550e8400-e29b-41d4-a716-446655440000",
    "{550e8400-e29b-41d4-a716-446655440000}",
    "/var/log/app.log",
    "~/private/file",
    "~operator/private/file",
    "C:\\Users\\operator\\secret.txt",
    "\\\\server\\share\\secret.txt"
  ];
  const payload = await sanitize(makeSnapshot(values));

  assert.deepEqual(payload.sources[0]?.sanitized_value, [
    "[REDACTED_EMAIL]",
    "bad@@example.com",
    "[REDACTED_PHONE]",
    "[REDACTED_PHONE]",
    "123456",
    "1234567890123456",
    "[REDACTED_IP]",
    "192.168.001.1",
    "999.20.30.40",
    "[REDACTED_IP]",
    "fe80::1%eth0",
    "[REDACTED_IDENTIFIER]",
    "[REDACTED_IDENTIFIER]",
    "[REDACTED_PATH]",
    "[REDACTED_PATH]",
    "[REDACTED_PATH]",
    "[REDACTED_PATH]",
    "[REDACTED_PATH]"
  ]);
});

test("REQ-SBX-GENERAL-002 sanitizer canonicalizes only unambiguous hierarchical URLs", async () => {
  const payload = await sanitize(
    makeSnapshot([
      "https://example.com/a/b",
      "HTTPS://user:pass@example.com:443/a?token=x",
      "custom+v1://[2001:db8::1]/resource"
    ])
  );

  assert.deepEqual(payload.sources[0]?.sanitized_value, [
    "https://[REDACTED_HOST]/[REDACTED_PATH]",
    "HTTPS://[REDACTED_HOST]/[REDACTED_PATH]?[REDACTED_URL_SECRET]",
    "custom+v1://[REDACTED_HOST]/[REDACTED_PATH]"
  ]);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects unsafe URL controls backslashes percent host port and ambiguous forms", async () => {
  const unsafeUrls = [
    "https://example.com/a\\b",
    "https://example.com/%zz",
    "https:///missing-host",
    "https://example.com:bad/path",
    "https://exa mple.com/path",
    `https://example.com/a${String.fromCharCode(1)}b`,
    `https://example.com/${"a".repeat(4097)}`
  ];

  for (const unsafeUrl of unsafeUrls) {
    await assert.rejects(() => sanitize(makeSnapshot(unsafeUrl)));
  }
});

test("REQ-SBX-GENERAL-002 sanitizer defense rejects direct NFKC percent base64 and base64url atom survival", async () => {
  const cases = [
    { password: "secr3t", content: "secr3t" },
    { password: "\uff33ecr3t", content: "Secr3t" },
    { password: "secr3t", content: "%73%65%63%72%33%74" },
    { password: "???~", content: "Pz8/fg==" },
    { password: "???~", content: "Pz8_fg" }
  ];

  for (const [index, value] of cases.entries()) {
    await assert.rejects(
      () => sanitize(makeSnapshot(value)),
      `encoded defense case ${index}`
    );
  }
});

test("REQ-SBX-GENERAL-002 sanitizer defense NFKC-normalizes canonical base64 decoded values", async () => {
  const cases = [
    { password: "Secr3t", content: "77yzZWNyM3Q=" },
    { password: "Secr3t", content: "77yzZWNyM3Q" }
  ];
  const results = await Promise.allSettled(
    cases.map((value) => sanitize(makeSnapshot(value)))
  );

  assert.deepEqual(
    results.map((result) => result.status),
    cases.map(() => "rejected")
  );
});

test("REQ-SBX-GENERAL-002 sanitizer defense rejects complete percent-decoded leaf survival", async () => {
  const cases = [
    { password: "secr3t", content: "%73ecr3t" },
    { password: "secr3t", content: "s%65cr3t" },
    { password: "secr3t", content: "%73%65cr3t" },
    { password: "Secr3t", content: "%EF%BC%B3ecr3t" }
  ];
  const results = await Promise.allSettled(
    cases.map((value) => sanitize(makeSnapshot(value)))
  );

  assert.deepEqual(
    results.map((result) => result.status),
    cases.map(() => "rejected")
  );
});

test("REQ-SBX-GENERAL-002 sanitizer defense rejects malformed UTF-8 percent runs", async () => {
  const cases = [
    { password: "secr3t", content: "%FF%73%65%63%72%33%74" },
    { password: "secr3t", content: "%73%65%63%72%33%74%FF" }
  ];
  const results = await Promise.allSettled(
    cases.map((value) => sanitize(makeSnapshot(value)))
  );

  assert.deepEqual(
    results.map((result) => result.status),
    cases.map(() => "rejected")
  );
});

test("REQ-SBX-GENERAL-002 sanitizer rejects raw redaction placeholder literals", async () => {
  const placeholders = [
    "[REDACTED_CREDENTIAL]",
    "[REDACTED_TOKEN]",
    "[REDACTED_EMAIL]",
    "[REDACTED_PHONE]",
    "[REDACTED_IP]",
    "[REDACTED_IDENTIFIER]",
    "[REDACTED_PATH]",
    "[REDACTED_HOST]",
    "[REDACTED_URL_SECRET]",
    "[REDACTED_HIGH_ENTROPY]"
  ];
  const results = await Promise.allSettled(
    placeholders.map((placeholder) =>
      sanitize(makeSnapshot("literal " + placeholder + " value"))
    )
  );

  assert.deepEqual(
    results.map((result) => result.status),
    placeholders.map(() => "rejected")
  );
});

test("REQ-SBX-GENERAL-002 sanitizer rejects raw redaction placeholder in a JSON pointer", async () => {
  const obligations = makeObligations(
    makeObligation(1, {
      subject_refs: [
        {
          kind: "content_source",
          source_token: SOURCE_TOKEN,
          locator: {
            kind: "json_pointer",
            pointer: "/[REDACTED_TOKEN]"
          }
        }
      ]
    })
  );

  await assert.rejects(() =>
    sanitize(makeSnapshot({ access_token: "TOKEN" }), obligations)
  );
});

test("REQ-SBX-GENERAL-002 sanitizer defense rejects JSON-escaped direct atom survival", async () => {
  const cases = [
    { password: "ab\"cd", content: "ab\"cd" },
    { password: "ab\\cd", content: "ab\\cd" }
  ];
  for (const [index, value] of cases.entries()) {
    await assert.rejects(
      () => sanitize(makeSnapshot(value)),
      `JSON-escaped defense case ${index}`
    );
  }
});

test("REQ-SBX-GENERAL-002 sanitizer defense ignores malformed base64 padding", async () => {
  const payload = await sanitize(
    makeSnapshot({ password: "???~", content: "Pz8/fg===" })
  );
  assert.deepEqual(payload.sources[0]?.sanitized_value, {
    content: "Pz8/fg===",
    field_0001: "[REDACTED_CREDENTIAL]"
  });
});

test("REQ-SBX-GENERAL-002 sanitizer defense ignores sanitizer-generated placeholder spans", async () => {
  const payload = await sanitize(makeSnapshot({ access_token: "TOKEN" }));
  assert.deepEqual(payload.sources[0]?.sanitized_value, {
    field_0001: "[REDACTED_TOKEN]"
  });
});

test("REQ-SBX-GENERAL-002 sanitizer rejects pre-abort non-signals and mid-traversal abort", async () => {
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(() => sanitize(makeSnapshot("ok"), makeObligations(), preAborted.signal));
  await assert.rejects(() => sanitize(makeSnapshot("ok"), makeObligations(), {} as AbortSignal));

  const midAbort = new AbortController();
  let armed = false;
  const target = { content: "ok" };
  const proxied = new Proxy(target, {
    ownKeys(value) {
      if (armed) midAbort.abort();
      return Reflect.ownKeys(value);
    }
  });
  const snapshot = makeSnapshot(proxied);
  armed = true;
  await assert.rejects(() => sanitize(snapshot, makeObligations(), midAbort.signal));
});

test("REQ-SBX-GENERAL-002 sanitizer rejects zero obligations and invalid outer source tool and obligation shapes", async () => {
  await assert.rejects(() => sanitize(makeSnapshot("ok"), deepFreeze([])));
  await assert.rejects(() =>
    sanitize(makeSnapshot("ok", { snapshot_overrides: { unexpected: true } }))
  );
  await assert.rejects(() =>
    sanitize(makeSnapshot("ok", { source_overrides: { unexpected: true } }))
  );
  await assert.rejects(() =>
    sanitize(makeSnapshot("ok", {
      tool: { arguments: {}, target: "target", has_target: false }
    }))
  );
  await assert.rejects(() =>
    sanitize(
      makeSnapshot("ok"),
      makeObligations(makeObligation(1, { unexpected: true }))
    )
  );
  await assert.rejects(() =>
    sanitize(
      makeSnapshot("ok"),
      makeObligations(makeObligation(1, { subject_refs: [] }))
    )
  );
});

test("REQ-SBX-GENERAL-002 sanitizer validates descriptors before reads and rejects inherited symbol and hidden fields", async () => {
  let getterCalls = 0;
  const accessorSnapshot = makeSnapshot("ok", { freeze: false }) as any;
  Object.defineProperty(accessorSnapshot.contents[0], "value", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return "secret";
    }
  });
  deepFreeze(accessorSnapshot);
  await assert.rejects(() => sanitize(accessorSnapshot));
  assert.equal(getterCalls, 0);

  const inherited = Object.create({ inherited: "secret" });
  inherited.content = "ok";
  await assert.rejects(() => sanitize(makeSnapshot(inherited)));

  const symbolValue: Record<string | symbol, unknown> = { content: "ok" };
  symbolValue[Symbol("hidden")] = "secret";
  await assert.rejects(() => sanitize(makeSnapshot(symbolValue)));

  const hiddenValue = { content: "ok" };
  Object.defineProperty(hiddenValue, "hidden", {
    value: "secret",
    enumerable: false
  });
  await assert.rejects(() => sanitize(makeSnapshot(hiddenValue)));
});

test("REQ-SBX-GENERAL-002 sanitizer contains hostile accessor and proxy errors without leaking secrets", async () => {
  const instance = sanitizerModule.createSandboxSecurityDeterministicSanitizer();
  let getterCalls = 0;
  const accessorSnapshot = makeSnapshot("ok", { freeze: false }) as any;
  Object.defineProperty(accessorSnapshot.contents[0], "value", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("secret https://attacker.example/accessor");
    }
  });
  deepFreeze(accessorSnapshot);

  await assertExternalRedactionFailure(() =>
    sanitizeWith(instance, accessorSnapshot)
  );
  assert.equal(getterCalls, 0);

  let proxyTrapCalls = 0;
  const proxySnapshot = new Proxy(makeSnapshot("ok"), {
    ownKeys() {
      proxyTrapCalls += 1;
      throw new Error("secret https://attacker.example/proxy");
    }
  });
  await assertExternalRedactionFailure(() =>
    sanitizeWith(instance, proxySnapshot)
  );
  assert.equal(proxyTrapCalls > 0, true);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects cycles sparse arrays and extra array properties", async () => {
  const cyclic: Record<string, unknown> = { content: "ok" };
  cyclic.body = cyclic;
  await assert.rejects(() => sanitize(makeSnapshot(cyclic)));

  const sparse = new Array(2);
  sparse[1] = "present";
  await assert.rejects(() => sanitize(makeSnapshot(sparse)));

  const extra = ["present"] as unknown[] & { extra?: string };
  extra.extra = "unexpected";
  await assert.rejects(() => sanitize(makeSnapshot(extra)));
});

test("REQ-SBX-GENERAL-002 sanitizer rejects oversized arrays before own-key enumeration", async () => {
  let ownKeysCalls = 0;
  const oversized = new Proxy(Object.freeze(new Array(513)), {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
    }
  });
  const snapshot = makeSnapshot(oversized);
  ownKeysCalls = 0;

  await assert.rejects(() => sanitize(snapshot));
  assert.equal(ownKeysCalls, 0);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects unsupported JSON values and invalid UTF-16", async () => {
  class UnsupportedClass {
    value = "x";
  }
  const nullPrototype = Object.create(null);
  nullPrototype.content = "x";
  const unsupported = [
    undefined,
    1n,
    Symbol("value"),
    () => "value",
    new Date(0),
    nullPrototype,
    new UnsupportedClass(),
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0,
    "\ud800",
    "\udc00"
  ];

  for (const value of unsupported) {
    await assert.rejects(() => sanitize(makeSnapshot(value)));
  }
});

test("REQ-SBX-GENERAL-002 sanitizer enforces local string depth node entry and obligation resource guards", async () => {
  const exactly128Ki = "x ".repeat(64 * 1024);
  const accepted = await sanitize(makeSnapshot(exactly128Ki));
  assert.equal(accepted.sources[0]?.sanitized_value, exactly128Ki);
  await assert.rejects(() => sanitize(makeSnapshot(`${exactly128Ki}x`)));

  const allowedDepth = { body: { content: { name: { path: "ok" } } } };
  await sanitize(makeSnapshot(allowedDepth));
  const excessiveDepth = { body: { content: { name: { path: { target: "too deep" } } } } };
  await assert.rejects(() => sanitize(makeSnapshot(excessiveDepth)));

  await assert.rejects(() =>
    sanitize(makeSnapshot(Array.from({ length: 513 }, () => null)))
  );
  const excessiveNodes = [
    Array.from({ length: 512 }, () => null),
    Array.from({ length: 512 }, () => null),
    Array.from({ length: 512 }, () => null)
  ];
  await assert.rejects(() => sanitize(makeSnapshot(excessiveNodes)));

  const tooManyObligations = Array.from({ length: 65 }, (_, index) =>
    makeObligation(index + 1)
  );
  await assert.rejects(() =>
    sanitize(makeSnapshot("ok"), deepFreeze(tooManyObligations))
  );
});

test("REQ-SBX-GENERAL-002 sanitizer accepts frozen raw byte metadata above the JSON entry cap", async () => {
  const content = "\u754c plain ".repeat(80);
  const originalUtf8Bytes = Array.from(Buffer.from(content, "utf8"));
  assert.equal(originalUtf8Bytes.length > 513, true);
  const payload = await sanitize(
    makeSnapshot(content, {
      source_overrides: {
        original_utf8_bytes: originalUtf8Bytes
      }
    })
  );

  assert.equal(payload.sources[0]?.sanitized_value, content);
});

test("REQ-SBX-GENERAL-002 sanitizer rejects oversized raw byte metadata before own-key enumeration", async () => {
  let ownKeysCalls = 0;
  const oversized = new Proxy(Object.freeze(new Array(128 * 1024 * 4 + 1)), {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
    }
  });
  const snapshot = makeSnapshot("ok", {
    source_overrides: { original_utf8_bytes: oversized }
  });
  ownKeysCalls = 0;

  await assert.rejects(() => sanitize(snapshot));
  assert.equal(ownKeysCalls, 0);
});

test("REQ-SBX-GENERAL-002 sanitizer enforces aggregate input and constructed UTF-8 output resource guards", async () => {
  const chunk = "x ".repeat(50 * 1024);
  await assert.rejects(() =>
    sanitize(makeSnapshot(chunk, { values: [chunk, chunk, chunk, chunk] }))
  );

  const multibyte = "\u754c ".repeat(50 * 1024);
  await assert.rejects(() => sanitize(makeSnapshot(multibyte)));
});

test("REQ-SBX-GENERAL-002 sanitizer clones locator variants and preserves target optionality", async () => {
  const toolSnapshot = makeSnapshot({ body: "ok" }, {
    tool: { arguments: { path: "/private" }, target: "operator@example.com" }
  });
  const obligations = makeObligations(
    makeObligation(1, {
      subject_refs: [
        {
          kind: "content_source",
          source_token: SOURCE_TOKEN,
          locator: { kind: "text_byte_range", start_byte: 0, end_byte: 1 }
        },
        {
          kind: "tool_request",
          call_token: `etok:call:${NONCE}:0000`,
          component: "arguments",
          locator: { kind: "json_pointer", pointer: "/path" }
        }
      ]
    })
  );
  const withTarget = await sanitize(toolSnapshot, obligations);
  assert.equal(withTarget.tool_request?.sanitized_target, "[REDACTED_EMAIL]");
  assert.deepEqual(withTarget.routed_obligations[0]?.subject_refs, (obligations[0] as any).subject_refs);
  assert.notStrictEqual(withTarget.routed_obligations[0]?.subject_refs, (obligations[0] as any).subject_refs);

  const withoutTarget = await sanitize(
    makeSnapshot("ok", { tool: { arguments: {} } }),
    makeObligations(
      makeObligation(1, {
        subject_refs: [
          {
            kind: "tool_request",
            call_token: `etok:call:${NONCE}:0000`,
            component: "whole_call"
          }
        ]
      })
    )
  );
  assert.equal(Object.hasOwn(withoutTarget.tool_request ?? {}, "sanitized_target"), false);
});

test("REQ-SBX-GENERAL-002 sanitizer NFKC-normalizes copied tool target content", async () => {
  const payload = await sanitize(
    makeSnapshot("ok", {
      tool: { arguments: {}, target: "Cafe\u0301" }
    })
  );

  assert.equal(payload.tool_request?.sanitized_target, "Caf\u00e9");
});

test("REQ-SBX-GENERAL-002 sanitizer production module has exact exports imports and zero capabilities", () => {
  assert.equal(
    sanitizerModule.SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION,
    "sandbox-security-deterministic-sanitizer.v1"
  );
  assert.deepEqual(Object.keys(sanitizerModule).sort(), [
    "SANDBOX_SECURITY_DETERMINISTIC_SANITIZER_VERSION",
    "createSandboxSecurityDeterministicSanitizer"
  ]);
  assert.equal(existsSync(sanitizerModuleUrl), true);
  const source = readFileSync(sanitizerModuleUrl, "utf8");
  const imports = [...source.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual([...imports].sort(), [
    "../security/index.ts",
    "../security/sanitized-boundary.ts"
  ]);
  assert.match(
    source,
    /import\s*\{\s*deriveSandboxSecurityExternalTokenRegistry\s*\}\s*from\s*"\.\.\/security\/sanitized-boundary\.ts"/su
  );
  assert.doesNotMatch(
    source,
    /node:|\b(?:fetch|WebSocket|EventSource|process|require|eval|Function)\b|import\s*\(/u
  );
  assert.match(source, /resource guard/iu);
  assert.match(source, /frozen core/iu);
});
