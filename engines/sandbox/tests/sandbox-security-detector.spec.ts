import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT,
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT,
  SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES,
  SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES,
  SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_TOKENS,
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM,
  SandboxSecurityAdapterUnsupportedError,
  type SandboxSecurityRawDetectorSnapshot,
  type SandboxSecurityRiskCandidate,
  type SandboxSecuritySanitizedJudgePayload
} from "../src/security/detector-contract.ts";
import { resolveSandboxSecurityProfile } from "../src/security/policy-profiles.ts";
import {
  createRecordingExternalDetector,
  createRecordingRawLocalDetector,
  createRecordingSanitizer
} from "./fixtures/security-detector.fixture.ts";

function makeSnapshot(): SandboxSecurityRawDetectorSnapshot {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  return {
    request_id: "req-det-1",
    evaluation_mode: "simulation",
    stage: "user_input",
    profile,
    contents: [
      {
        source_handle: ("hsrc:" + "a".repeat(32) + ":0001") as never,
        source_id: "src-user",
        source_type: "user_input",
        media_type: "text/plain",
        authority_kind: "simulation_observation",
        value: "hello",
        provenance_ref: "source://user",
        original_utf8_bytes: Object.freeze([104, 101, 108, 108, 111]),
        original_value_sha256: "a".repeat(64),
        comparison_value: "hello",
        trust_class: "user_supplied"
      }
    ],
    canonical_request_sha256: "b".repeat(64)
  };
}

test("REQ-SBX-GENERAL-001 recording raw detector receives frozen handles", async () => {
  const detector = createRecordingRawLocalDetector();
  const snapshot = Object.freeze(makeSnapshot());
  await detector.detect(snapshot, AbortSignal.abort ? new AbortController().signal : (undefined as never));
  assert.deepEqual(detector.evidence.source_handles, [
    "hsrc:" + "a".repeat(32) + ":0001"
  ]);
  assert.ok(detector.lastSnapshot?.profile);
});

test("REQ-SBX-GENERAL-001 recording external detector receives sanitized tokens only", async () => {
  const sanitizer = createRecordingSanitizer();
  const external = createRecordingExternalDetector();
  const payload = await sanitizer.sanitize(makeSnapshot(), [], new AbortController().signal);
  await external.detect(payload, new AbortController().signal);
  assert.ok(external.evidence.source_tokens.every((token) => token.startsWith("tok-")));
  assert.equal(external.evidence.source_handles.length, 0);
});

test("REQ-SBX-GENERAL-001 candidate contracts contain no action identity evidence or prose", () => {
  const candidate: SandboxSecurityRiskCandidate = {
    category: "prompt_injection",
    severity: "high",
    confidence: 0.9,
    reason_code: "sandbox_security_prompt_injection",
    subject_refs: [
      {
        kind: "content_source",
        source_handle: "hsrc:" + "a".repeat(32) + ":0001",
        locator: { kind: "whole_source" }
      }
    ]
  };
  assert.equal(Object.hasOwn(candidate, "action"), false);
  assert.equal(Object.hasOwn(candidate, "raw_content"), false);
  assert.equal(Object.hasOwn(candidate, "prose"), false);
});

test("REQ-SBX-GENERAL-001 exports every fixed detector output limit", () => {
  assert.equal(SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT, 32);
  assert.equal(SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT, 32);
  assert.equal(SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM, 8);
  assert.equal(SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES, 64 * 1024);
  assert.equal(SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES, 256 * 1024);
  assert.equal(SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH, 8);
  assert.equal(SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES, 2048);
  assert.equal(SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES, 64 * 1024);
  assert.equal(SANDBOX_SECURITY_MAX_SANITIZED_TOKENS, 67);
});

test("REQ-SBX-GENERAL-001 recording fixtures retain only content-free evidence", async () => {
  const detector = createRecordingRawLocalDetector();
  await detector.detect(makeSnapshot(), new AbortController().signal);
  const serialized = JSON.stringify(detector.evidence);
  assert.doesNotMatch(serialized, /hello/);
  assert.doesNotMatch(serialized, /source:\/\//);
});

test("REQ-SBX-GENERAL-001 RawLocalDetector.detect requires SandboxSecurityRawDetectorSnapshot", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>/);
});

test("REQ-SBX-GENERAL-001 SanitizedExternalDetector.detect requires sanitized payload only", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /detect\(\s*payload: Readonly<SandboxSecuritySanitizedJudgePayload>/
  );
});

test("REQ-SBX-GENERAL-001 sanitizer receives exact routed obligations before signal", async () => {
  const sanitizer = createRecordingSanitizer();
  const obligations = [
    {
      obligation_id: "ob-1",
      category: "prompt_injection" as const,
      subject_refs: [
        {
          kind: "content_source" as const,
          source_token: "tok-src-0001",
          locator: { kind: "whole_source" as const }
        }
      ]
    }
  ];
  await sanitizer.sanitize(makeSnapshot(), obligations, new AbortController().signal);
  assert.deepEqual(sanitizer.lastObligations, obligations);
});

test("REQ-SBX-GENERAL-001 sanitized Judge payload requires routed_obligations", () => {
  const payload: SandboxSecuritySanitizedJudgePayload = {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: "tok-req-0001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [],
    routed_obligations: []
  };
  assert.ok(Array.isArray(payload.routed_obligations));
});

test("REQ-SBX-GENERAL-001 sanitized tool payload exposes tool_name_token only", async () => {
  const sanitizer = createRecordingSanitizer();
  const snapshot = makeSnapshot();
  const withTool: SandboxSecurityRawDetectorSnapshot = {
    ...snapshot,
    stage: "tool_request",
    tool_request: {
      call_handle: ("hcall:" + "a".repeat(32) + ":0000") as never,
      call_id: "call-1",
      authority_kind: "simulation_observation",
      tool_name: "read_file",
      arguments: {},
      arguments_jcs_sha256: "c".repeat(64),
      has_target: false
    }
  };
  const payload = await sanitizer.sanitize(withTool, [], new AbortController().signal);
  assert.equal(payload.tool_request?.tool_name_token.startsWith("tok-tool-"), true);
  assert.equal(Object.hasOwn(payload.tool_request ?? {}, "tool_name"), false);
});

test("REQ-SBX-GENERAL-001 external candidates and clearances require obligation_id", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /interface SandboxSecurityExternalRiskCandidate[\s\S]*obligation_id/);
  assert.match(
    source,
    /interface SandboxSecurityExternalCategoryClearance[\s\S]*obligation_id/
  );
});

test("REQ-SBX-GENERAL-001 risk candidate requires SandboxSecurityReasonCode", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /reason_code: SandboxSecurityReasonCode/);
});

test("REQ-SBX-GENERAL-001 SandboxSecurityRawDetectorSnapshot has exact locked fields", () => {
  const snapshot = makeSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "canonical_request_sha256",
    "contents",
    "evaluation_mode",
    "profile",
    "request_id",
    "stage"
  ].sort());
});

test("REQ-SBX-GENERAL-001 RawDetectorSnapshot carries full frozen profile manifest not policy_profile_id", () => {
  const snapshot = makeSnapshot();
  assert.equal(Object.hasOwn(snapshot, "policy_profile_id"), false);
  assert.equal(snapshot.profile.profile_id, "sandbox-security-balanced.v1");
  assert.ok(Object.isFrozen(snapshot.profile));
});

test("REQ-SBX-GENERAL-001 RawDetectorSnapshot content trust comes from resolved profile", () => {
  const snapshot = makeSnapshot();
  assert.equal(snapshot.contents[0].trust_class, "user_supplied");
});

test("REQ-SBX-GENERAL-001 RawDetectorSnapshot does not redefine NormalizedContent fields", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /SandboxSecurityNormalizedContent/);
  assert.doesNotMatch(source, /interface SandboxSecurityNormalizedContent/);
});

test("REQ-SBX-GENERAL-001 RawDetectorSnapshot exposes no canonical projection bytes", () => {
  const snapshot = makeSnapshot();
  assert.equal(Object.hasOwn(snapshot, "canonical_projection_bytes"), false);
});

test("REQ-SBX-GENERAL-001 detector-contract does not export detector-pipeline", () => {
  const source = readFileSync(
    new URL("../src/security/detector-contract.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /detector-pipeline/);
});

test("REQ-SBX-GENERAL-001 adapter unsupported error has exact content-free code", () => {
  const error = new SandboxSecurityAdapterUnsupportedError();
  assert.equal(error.code, "adapter_unsupported");
  assert.equal(error.message, "sandbox_security_adapter_unsupported");
  assert.ok(error instanceof SandboxSecurityAdapterUnsupportedError);
});

test("REQ-SBX-GENERAL-001 adapter unsupported error rejects lookalike identity", () => {
  const lookalike = {
    code: "adapter_unsupported",
    message: "sandbox_security_adapter_unsupported",
    name: "SandboxSecurityAdapterUnsupportedError"
  };
  assert.equal(lookalike instanceof SandboxSecurityAdapterUnsupportedError, false);
});
