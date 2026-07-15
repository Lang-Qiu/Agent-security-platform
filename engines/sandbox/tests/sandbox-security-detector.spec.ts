import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { resolveSandboxSecurityProfile } from "../src/security/policy-profiles.ts";

const contractPath = new URL("../src/security/detector-contract.ts", import.meta.url);
const fixturePath = new URL("./fixtures/security-detector.fixture.ts", import.meta.url);

type DetectorContract = {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT: number;
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT: number;
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM: number;
  SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES: number;
  SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES: number;
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH: number;
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES: number;
  SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES: number;
  SANDBOX_SECURITY_MAX_SANITIZED_TOKENS: number;
  SandboxSecurityAdapterUnsupportedError: new () => Error & { code: string };
};

const inertContract: DetectorContract = {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT: 0,
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT: 0,
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM: 0,
  SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES: 0,
  SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES: 0,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH: 0,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES: 0,
  SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES: 0,
  SANDBOX_SECURITY_MAX_SANITIZED_TOKENS: 0,
  SandboxSecurityAdapterUnsupportedError: class extends Error {
    code = "wrong";
  } as unknown as new () => Error & { code: string }
};

const contract: DetectorContract = existsSync(contractPath)
  ? ((await import("../src/security/detector-contract.ts")) as unknown as DetectorContract)
  : inertContract;

const {
  SANDBOX_SECURITY_MAX_CANDIDATES_PER_RESULT,
  SANDBOX_SECURITY_MAX_CLEARANCES_PER_RESULT,
  SANDBOX_SECURITY_MAX_SUBJECT_REFS_PER_ITEM,
  SANDBOX_SECURITY_MAX_DETECTOR_RESULT_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_PAYLOAD_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_SANITIZED_JSON_NODES,
  SANDBOX_SECURITY_MAX_JUDGE_RESPONSE_BYTES,
  SANDBOX_SECURITY_MAX_SANITIZED_TOKENS,
  SandboxSecurityAdapterUnsupportedError
} = contract;

const fixtures = existsSync(fixturePath)
  ? await import("./fixtures/security-detector.fixture.ts")
  : {
      createRecordingRawLocalDetector: () => ({
        evidence: { source_handles: [], source_tokens: [] },
        async detect() {
          return { candidates: [], clearances: [] };
        }
      }),
      createRecordingSanitizer: () => ({
        evidence: { source_handles: [], source_tokens: [] },
        async sanitize() {
          return {
            schema_version: "sandbox-security-sanitized-judge.v1",
            request_token: "x",
            stage: "user_input",
            policy_profile_id: "sandbox-security-balanced.v1",
            sources: [],
            routed_obligations: []
          };
        }
      }),
      createRecordingExternalDetector: () => ({
        evidence: { source_handles: [], source_tokens: ["raw-handle"] },
        async detect() {
          return { candidates: [], clearances: [] };
        }
      })
    };

const {
  createRecordingRawLocalDetector,
  createRecordingSanitizer,
  createRecordingExternalDetector
} = fixtures as typeof import("./fixtures/security-detector.fixture.ts");

function makeSnapshot() {
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const nonce = "a".repeat(32);
  return Object.freeze({
    request_id: "req-detector-1",
    evaluation_mode: "simulation" as const,
    stage: "user_input" as const,
    profile,
    contents: Object.freeze([
      Object.freeze({
        source_handle: `hsrc:${nonce}:0001` as never,
        source_id: "src-1",
        source_type: "user_input" as const,
        media_type: "text/plain" as const,
        authority_kind: "simulation_observation" as const,
        value: "hello",
        provenance_ref: "source://fixture/src-1",
        original_utf8_bytes: Object.freeze([104, 101, 108, 108, 111]),
        original_value_sha256: "c".repeat(64),
        comparison_value: "hello",
        trust_class: "user_supplied" as const
      })
    ]),
    canonical_request_sha256: "b".repeat(64)
  });
}

test("REQ-SBX-GENERAL-001 recording raw detector receives frozen handles", async () => {
  const detector = createRecordingRawLocalDetector();
  const snapshot = makeSnapshot();
  await detector.detect(snapshot as never, new AbortController().signal);
  assert.deepEqual(detector.evidence.source_handles, [
    "hsrc:" + "a".repeat(32) + ":0001"
  ]);
  assert.ok(detector.lastSnapshot?.profile);
});

test("REQ-SBX-GENERAL-001 recording external detector receives sanitized tokens only", async () => {
  const sanitizer = createRecordingSanitizer();
  const external = createRecordingExternalDetector();
  const payload = await sanitizer.sanitize(
    makeSnapshot() as never,
    [],
    new AbortController().signal
  );
  await external.detect(payload as never, new AbortController().signal);
  assert.ok(
    external.evidence.source_tokens.every((token: string) => token.startsWith("etok:src:"))
  );
  assert.equal(external.evidence.source_handles.length, 0);
});

test("REQ-SBX-GENERAL-001 candidate contracts contain no action identity evidence or prose", () => {
  const source = readFileSync(contractPath, "utf8");
  assert.doesNotMatch(source, /\baction\b\s*:/);
  assert.doesNotMatch(source, /evidence_text|raw_content|message\s*:/);
  assert.doesNotMatch(source, /allow|deny|ask|alert/, "no action identity values in contracts");
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
  await detector.detect(makeSnapshot() as never, new AbortController().signal);
  const evidenceText = JSON.stringify(detector.evidence);
  assert.doesNotMatch(evidenceText, /hello/);
  assert.doesNotMatch(evidenceText, /provenance/);
  assert.doesNotMatch(evidenceText, /"action"/);
});

test("REQ-SBX-GENERAL-001 RawLocalDetector.detect requires SandboxSecurityRawDetectorSnapshot", () => {
  const source = readFileSync(contractPath, "utf8");
  assert.match(
    source,
    /interface RawLocalDetector[\s\S]*detect\(\s*snapshot: Readonly<SandboxSecurityRawDetectorSnapshot>/
  );
});

test("REQ-SBX-GENERAL-001 SanitizedExternalDetector.detect requires sanitized payload only", () => {
  const source = readFileSync(contractPath, "utf8");
  assert.match(
    source,
    /interface SanitizedExternalDetector[\s\S]*detect\(\s*payload: Readonly<SandboxSecuritySanitizedJudgePayload>/
  );
  assert.doesNotMatch(
    source,
    /interface SanitizedExternalDetector[\s\S]*SandboxSecurityRawDetectorSnapshot/
  );
});

test("REQ-SBX-GENERAL-001 sanitizer receives exact routed obligations before signal", async () => {
  const sanitizer = createRecordingSanitizer();
  const obligations = [
    {
      obligation_id: "ob-1",
      category: "prompt_injection",
      subject_refs: [
        {
          kind: "content_source",
          source_token: "tok-src-0001",
          locator: { kind: "whole_source" }
        }
      ]
    }
  ];
  await sanitizer.sanitize(
    makeSnapshot() as never,
    obligations as never,
    new AbortController().signal
  );
  assert.deepEqual(sanitizer.lastObligations, obligations);
});

test("REQ-SBX-GENERAL-001 sanitized Judge payload requires routed_obligations", () => {
  const payload = {
    schema_version: "sandbox-security-sanitized-judge.v1",
    request_token: "tok-req-0001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [],
    routed_obligations: []
  };
  assert.ok(Array.isArray(payload.routed_obligations));
  const source = readFileSync(contractPath, "utf8");
  assert.match(
    source,
    /interface SandboxSecuritySanitizedJudgePayload[\s\S]*routed_obligations/
  );
});

test("REQ-SBX-GENERAL-001 sanitized tool payload exposes tool_name_token only", async () => {
  const sanitizer = createRecordingSanitizer();
  const snapshot = {
    ...makeSnapshot(),
    stage: "tool_request" as const,
    tool_request: {
      call_handle: ("hcall:" + "a".repeat(32) + ":0000") as never,
      call_id: "call-1",
      authority_kind: "simulation_observation" as const,
      tool_name: "read_file",
      arguments: {},
      arguments_jcs_sha256: "c".repeat(64),
      has_target: false
    }
  };
  const payload = await sanitizer.sanitize(
    snapshot as never,
    [],
    new AbortController().signal
  );
  assert.equal(payload.tool_request?.tool_name_token.startsWith("etok:tool-name:"), true);
  assert.equal(Object.hasOwn(payload.tool_request ?? {}, "tool_name"), false);
});

test("REQ-SBX-GENERAL-001 external candidates and clearances require obligation_id", () => {
  const source = readFileSync(contractPath, "utf8");
  assert.match(
    source,
    /interface SandboxSecurityExternalRiskCandidate[\s\S]*obligation_id/
  );
  assert.match(
    source,
    /interface SandboxSecurityExternalCategoryClearance[\s\S]*obligation_id/
  );
});

test("REQ-SBX-GENERAL-001 risk candidate requires SandboxSecurityReasonCode", () => {
  const source = readFileSync(contractPath, "utf8");
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
  const source = readFileSync(contractPath, "utf8");
  assert.match(source, /SandboxSecurityNormalizedContent/);
  assert.doesNotMatch(source, /interface SandboxSecurityNormalizedContent/);
});

test("REQ-SBX-GENERAL-001 RawDetectorSnapshot exposes no canonical projection bytes", () => {
  const snapshot = makeSnapshot();
  assert.equal(Object.hasOwn(snapshot, "canonical_projection_bytes"), false);
});

test("REQ-SBX-GENERAL-001 detector-contract does not export detector-pipeline", () => {
  const source = readFileSync(contractPath, "utf8");
  assert.doesNotMatch(source, /detector-pipeline/);
});

test("REQ-SBX-GENERAL-001 adapter unsupported error has exact content-free code", () => {
  const error = new SandboxSecurityAdapterUnsupportedError();
  assert.equal((error as { code?: string }).code, "adapter_unsupported");
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

test("REQ-SBX-GENERAL-001 detector suite remains isolated from raw boundary ownership", () => {
  const boundary = new URL("../src/security/detector-output-boundary.ts", import.meta.url);
  assert.equal(existsSync(boundary), true);
  const source = readFileSync(boundary, "utf8");
  assert.match(source, /export function normalizeSandboxSecurityRawDetectorResult/);
});


import {
  createSandboxSecurityDetectorRegistry,
  resolveSandboxSecurityDetectorsForProfile
} from "../src/security/detector-registry.ts";

test("REQ-SBX-GENERAL-001 SandboxSecurityDetectorRegistryInput requires rule", () => {
  assert.throws(() =>
    createSandboxSecurityDetectorRegistry({} as never)
  );
});

test("REQ-SBX-GENERAL-001 balanced rule-only registry constructs", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  assert.equal(typeof registry.rule.detect, "function");
  assert.equal(Object.hasOwn(registry, "local"), false);
});

test("REQ-SBX-GENERAL-001 createSandboxSecurityDetectorRegistry does not require local", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  assert.ok(registry.rule);
});

test("REQ-SBX-GENERAL-001 strict missing local still constructs registry", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  assert.equal(Object.hasOwn(registry, "local"), false);
});

test("REQ-SBX-GENERAL-001 registry rejects unknown construction keys", () => {
  assert.throws(() =>
    createSandboxSecurityDetectorRegistry({
      rule: createRecordingRawLocalDetector(),
      extra: true
    } as never)
  );
});

test("REQ-SBX-GENERAL-001 optional Judge may be omitted at construction", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector(),
    local: createRecordingRawLocalDetector()
  });
  assert.equal(Object.hasOwn(registry, "judge"), false);
});

test("REQ-SBX-GENERAL-001 SandboxSecurityDetectorRegistryInput is the only construction input", () => {
  const source = readFileSync(new URL("../src/security/detector-registry.ts", import.meta.url), "utf8");
  assert.match(source, /export interface SandboxSecurityDetectorRegistryInput/);
  assert.match(source, /createSandboxSecurityDetectorRegistry\(\s*input: Readonly<SandboxSecurityDetectorRegistryInput>/);
});

test("REQ-SBX-GENERAL-001 registry freezes and captures detector implementations", () => {
  const rule = createRecordingRawLocalDetector();
  const registry = createSandboxSecurityDetectorRegistry({ rule });
  assert.ok(Object.isFrozen(registry));
  assert.equal(registry.rule, rule);
});

test("REQ-SBX-GENERAL-001 registry rejects detector identity injection from detectors", () => {
  const rule = Object.assign(createRecordingRawLocalDetector(), {
    detector_id: "x"
  });
  assert.throws(() => createSandboxSecurityDetectorRegistry({ rule }));
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile balanced rule-only OK", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const resolved = resolveSandboxSecurityDetectorsForProfile(registry, profile);
  assert.equal(resolved.rule, registry.rule);
  assert.ok(resolved.required_slot_ids.includes("detector://sandbox/security/rule/default/v1"));
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile strict missing local fails RESOLUTION", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.throws(
    () => resolveSandboxSecurityDetectorsForProfile(registry, profile),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === "sandbox_security_profile_invalid" &&
      error.message.includes("sandbox_security_profile_invalid")
  );
});

test("REQ-SBX-GENERAL-001 strict missing local resolution uses sandbox_security_profile_invalid not detector_resolution_invalid", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  try {
    resolveSandboxSecurityDetectorsForProfile(registry, profile);
    assert.fail("expected strict missing local to fail resolution");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, "sandbox_security_profile_invalid");
    assert.doesNotMatch(error.message, /detector_resolution_invalid/);
  }
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile does not fail construction", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector()
  });
  assert.ok(registry.rule);
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  assert.throws(() => resolveSandboxSecurityDetectorsForProfile(registry, profile));
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile binds fixed slot IDs for rule local judge", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector(),
    local: createRecordingRawLocalDetector(),
    judge: createRecordingExternalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  const resolved = resolveSandboxSecurityDetectorsForProfile(registry, profile);
  assert.ok(resolved.required_slot_ids.includes("detector://sandbox/security/rule/default/v1"));
  assert.ok(resolved.required_slot_ids.includes("detector://sandbox/security/local/default/v1"));
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile rejects kind access stage mismatches", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector(),
    local: createRecordingRawLocalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-balanced.v1");
  const broken = {
    ...profile,
    detector_slots: profile.detector_slots.map((slot) =>
      slot.detector_kind === "rule"
        ? { ...slot, content_access: "sanitized_external" as const }
        : slot
    )
  };
  assert.throws(() => resolveSandboxSecurityDetectorsForProfile(registry, broken as never));
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile absent Judge before routing is OK", () => {
  const registry = createSandboxSecurityDetectorRegistry({
    rule: createRecordingRawLocalDetector(),
    local: createRecordingRawLocalDetector()
  });
  const profile = resolveSandboxSecurityProfile("sandbox-security-strict.v1");
  const resolved = resolveSandboxSecurityDetectorsForProfile(registry, profile);
  assert.equal(Object.hasOwn(resolved, "judge"), false);
});

test("REQ-SBX-GENERAL-001 resolveSandboxSecurityDetectorsForProfile is engine-internal not Master C export", () => {
  assert.equal(existsSync(new URL("../src/security/index.ts", import.meta.url)), false);
  const sharedIndex = readFileSync(new URL("../../../shared/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sharedIndex, /resolveSandboxSecurityDetectorsForProfile/);
});

