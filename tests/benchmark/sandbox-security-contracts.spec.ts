import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const CONTRACTS_URL = new URL(
  "../../scripts/benchmark/sandbox-security/contracts.ts",
  import.meta.url
);
const PACKAGE_URL = new URL("../../package.json", import.meta.url);

type Contracts = Record<string, unknown>;
let contracts: Contracts = {};
if (existsSync(CONTRACTS_URL)) {
  contracts = await import("../../scripts/benchmark/sandbox-security/contracts.ts");
}

type Normalizer = (value: unknown) => unknown;
const identity: Normalizer = (value) => value;
function normalizer(name: string): Normalizer {
  return typeof contracts[name] === "function"
    ? contracts[name] as Normalizer
    : identity;
}

const normalizeSourcesLock = normalizer(
  "normalizeSandboxSecurityBenchmarkSourcesLock"
);
const normalizeInput = normalizer(
  "normalizeSandboxSecurityBenchmarkInputEnvelope"
);
const normalizeTruth = normalizer(
  "normalizeSandboxSecurityBenchmarkTruthEnvelope"
);
const normalizeReviews = normalizer(
  "normalizeSandboxSecurityBenchmarkReviews"
);
const normalizeRequestIds = normalizer(
  "normalizeSandboxSecurityBenchmarkRequestIds"
);
const normalizeManifest = normalizer(
  "normalizeSandboxSecurityBenchmarkManifest"
);
const normalizeReplay = normalizer(
  "normalizeSandboxSecurityBenchmarkReplayEnvelope"
);
const normalizeCapture = normalizer(
  "normalizeSandboxSecurityBenchmarkCaptureManifest"
);
const normalizeSeal = normalizer(
  "normalizeSandboxSecurityBenchmarkSeal"
);

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const FIXTURE_ID = "ssb-v1-0001";

function evaluationRequest() {
  const content = {
    source_id: "user_1",
    claimed_source_type: "user_input",
    media_type: "text/plain",
    value: "ordinary benchmark request",
    provenance_ref: "source://user_1"
  };
  return {
    submission: {
      schema_version: "sandbox-security-request.v1",
      request_id: "request_benchmark_001",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      content_items: [content]
    },
    authoritative_context: {
      schema_version: "sandbox-security-authoritative-context.v1",
      evaluation_mode: "simulation",
      stage: "user_input",
      policy_profile_id: "sandbox-security-balanced.v1",
      sources: [{
        source_id: content.source_id,
        authority_kind: "simulation_observation",
        source_type: content.claimed_source_type,
        media_type: content.media_type,
        value: content.value,
        provenance_ref: content.provenance_ref
      }]
    }
  };
}

function inputEnvelope() {
  return {
    schema_version: "sandbox-security-benchmark-input.v1",
    fixture_id: FIXTURE_ID,
    evaluation_request: evaluationRequest()
  };
}

function safeTruth() {
  return {
    schema_version: "sandbox-security-benchmark-truth.v1",
    fixture_id: FIXTURE_ID,
    verdict_class: "safe",
    language: "en",
    transformed: false,
    source_id: "oasst1",
    record_ref: "message:0001",
    derivation: "direct",
    fixture_sha256: A
  };
}

function riskTruth() {
  return {
    schema_version: "sandbox-security-benchmark-truth.v1",
    fixture_id: FIXTURE_ID,
    verdict_class: "risk",
    primary_category: "prompt_injection",
    ground_truth_severity: "high",
    language: "en",
    transformed: true,
    transformation_kind: "split_token",
    source_id: "agentdojo",
    record_ref: "task:0001",
    derivation: "transformed",
    seed_record_ref: "task:seed-0001",
    fixture_sha256: B
  };
}

function safeReviewRecord() {
  return {
    fixture_id: FIXTURE_ID,
    input_sha256: A,
    source_id: "oasst1",
    record_ref: "message:0001",
    upstream_sha256: B,
    verdict_class: "safe",
    language: "en",
    derivation: "direct",
    transformed: false,
    transformation_kind: null,
    seed_record_ref: null,
    seed_upstream_sha256: null,
    author_id: "curator_alpha",
    independent_reviewer_id: "reviewer_beta",
    review_status: "approved",
    translation_review_status: "not_applicable",
    transformation_review_status: "not_applicable",
    primary_category: null,
    ground_truth_severity: null,
    category_review_status: "not_applicable",
    severity_review_status: "not_applicable",
    severity_rubric_version: null,
    adjudication_rationale: null
  };
}

function riskReviewRecord() {
  return {
    fixture_id: "ssb-v1-0002",
    input_sha256: B,
    source_id: "agentdojo",
    record_ref: "task:0001",
    upstream_sha256: C,
    verdict_class: "risk",
    language: "zh",
    derivation: "transformed",
    transformed: true,
    transformation_kind: "split_token",
    seed_record_ref: "task:seed-0001",
    seed_upstream_sha256: D,
    author_id: "curator_gamma",
    independent_reviewer_id: "reviewer_delta",
    review_status: "approved",
    translation_review_status: "not_applicable",
    transformation_review_status: "approved",
    primary_category: "prompt_injection",
    ground_truth_severity: "high",
    category_review_status: "approved",
    severity_review_status: "approved",
    severity_rubric_version: "sandbox-security-severity-rubric.v1",
    adjudication_rationale: "Material instruction injection with a broad tool-side effect."
  };
}

function reviewsLedger() {
  return {
    schema_version: "sandbox-security-benchmark-reviews.v1",
    severity_rubric_version: "sandbox-security-severity-rubric.v1",
    records: [safeReviewRecord(), riskReviewRecord()]
  };
}

function requestIdsLedger() {
  return {
    schema_version: "sandbox-security-benchmark-request-ids.v1",
    generation_method: "node:crypto.randomBytes",
    entropy_bytes: 16,
    generation_phase: "pre_label",
    generator_id: "request_generator_alpha",
    independent_reviewer_id: "request_reviewer_beta",
    review_status: "approved",
    records: [
      { slot_ordinal: 1, request_id: "0123456789abcdef0123456789abcdef" },
      { slot_ordinal: 2, request_id: "fedcba9876543210fedcba9876543210" }
    ]
  };
}

function sourcesLock() {
  return {
    schema_version: "sandbox-security-benchmark-sources.v1",
    sources: [{
      source_id: "agentdojo",
      upstream_url: "https://github.com/ethz-spylab/agentdojo",
      revision: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
      admitted_scope: "first-party task and injection artifacts",
      license: "MIT",
      license_url: "https://github.com/ethz-spylab/agentdojo/blob/089ed468cf3ed0322acc66b0211f26d9d90dbf60/LICENSE",
      license_evidence_sha256: C,
      attribution: "AgentDojo contributors",
      redistribution_confirmed: true,
      records: [{ record_ref: "task:0001", upstream_sha256: D }]
    }]
  };
}

function replayEnvelope() {
  return {
    schema_version: "sandbox-security-benchmark-replay.v1",
    fixture_id: FIXTURE_ID,
    ollama: {
      status: "response",
      http_status: 200,
      content_type: "application/json",
      normalized_response: {
        model: "qwen3:8b",
        verified_ollama_digest: `sha256:${A}`,
        done: true,
        message: {
          role: "assistant",
          parsed: {
            schema_version: "sandbox-security-local-model.v1",
            status: "matched",
            candidates: [{
              category: "prompt_injection",
              severity: "high",
              confidence: "probable",
              subject_refs: [{
                kind: "content_source",
                source_ordinal: 1,
                component: "whole_source"
              }]
            }]
          }
        }
      }
    },
    judge: { status: "not_called" },
    decision_projection_sha256: B
  };
}

function captureManifest() {
  return {
    schema_version: "sandbox-security-benchmark-capture.v1",
    benchmark_manifest_sha256: A,
    sources_lock_sha256: B,
    inputs_tree_sha256: C,
    decisions_tree_sha256: D,
    cassette_tree_sha256: A,
    ollama_model: "qwen3:8b",
    ollama_digest: `sha256:${B}`,
    ollama_qualification: {
      inventory: {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: { model: "qwen3:8b", digest: `sha256:${B}` }
      },
      prewarm: {
        status: "response",
        http_status: 200,
        content_type: "application/json",
        normalized_response: {
          model: "qwen3:8b",
          verified_ollama_digest: `sha256:${B}`,
          done: true,
          message: {
            role: "assistant",
            parsed: {
              schema_version: "sandbox-security-local-model.v1",
              status: "no_match",
              candidates: []
            }
          }
        }
      }
    },
    openai_model: "gpt-5.6-terra",
    local_prompt_version: "sandbox-security-ollama-local-prompt.v1",
    judge_prompt_version: "sandbox-security-openai-judge-prompt.v1",
    local_schema_version: "sandbox-security-local-model.v1",
    judge_schema_version: "sandbox-security-judge.v1",
    rule_catalog_version: "sandbox-security-production-rule-catalog.v1",
    sanitizer_version: "sandbox-security-deterministic-sanitizer.v1"
  };
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function readPackage(): { scripts?: Record<string, unknown> } {
  return JSON.parse(readFileSync(PACKAGE_URL, "utf8")) as {
    scripts?: Record<string, unknown>;
  };
}

test("REQ-SBX-GENERAL-002 benchmark TypeScript graph is permanently registered", () => {
  assert.equal(
    existsSync(new URL("../../scripts/benchmark/sandbox-security/tsconfig.json", import.meta.url)),
    true
  );
  assert.match(
    String(readPackage().scripts?.["typecheck:benchmark:sandbox-security"]),
    /scripts\/benchmark\/sandbox-security\/tsconfig\.json/
  );
});

test("REQ-SBX-GENERAL-002 benchmark contracts expose the closed normalizer surface", () => {
  for (const name of [
    "normalizeSandboxSecurityBenchmarkSourcesLock",
    "normalizeSandboxSecurityBenchmarkInputEnvelope",
    "normalizeSandboxSecurityBenchmarkTruthEnvelope",
    "normalizeSandboxSecurityBenchmarkReviews",
    "normalizeSandboxSecurityBenchmarkRequestIds",
    "normalizeSandboxSecurityBenchmarkManifest",
    "normalizeSandboxSecurityBenchmarkReplayEnvelope",
    "normalizeSandboxSecurityBenchmarkCaptureManifest",
    "normalizeSandboxSecurityBenchmarkSeal",
    "hashSandboxSecurityBenchmarkTree"
  ]) {
    assert.equal(typeof contracts[name], "function", name);
  }
});

test("REQ-SBX-GENERAL-002 input envelope admits only opaque fixture ID and Engine request", () => {
  const value = inputEnvelope();
  const normalized = normalizeInput(value);
  assert.deepEqual(normalized, value);
  assert.notEqual(normalized, value);
  assertDeeplyFrozen(normalized);
  assert.throws(() => normalizeInput({ ...value, primary_category: "prompt_injection" }));
  assert.throws(() => normalizeInput({ ...value, fixture_id: "prompt-injection-high" }));
  const inherited = Object.create({ ground_truth_severity: "high" });
  Object.assign(inherited, value);
  assert.throws(() => normalizeInput(inherited));
});

test("REQ-SBX-GENERAL-002 input envelope preserves Engine source cardinality and authority mode", () => {
  const value = inputEnvelope();
  const secondContent = {
    source_id: "user_2",
    claimed_source_type: "retrieved_content",
    media_type: "text/plain",
    value: "second benchmark source",
    provenance_ref: "source://user_2"
  };
  const secondSource = {
    source_id: secondContent.source_id,
    authority_kind: "simulation_observation",
    source_type: secondContent.claimed_source_type,
    media_type: secondContent.media_type,
    value: secondContent.value,
    provenance_ref: secondContent.provenance_ref
  };
  const twoSourceRequest = structuredClone(value.evaluation_request);
  twoSourceRequest.submission.content_items.push(secondContent);
  twoSourceRequest.authoritative_context.sources.push(secondSource);
  assert.doesNotThrow(() => normalizeInput({ ...value, evaluation_request: twoSourceRequest }));
  const truncatedRequest = structuredClone(twoSourceRequest);
  truncatedRequest.authoritative_context.sources.pop();
  assert.throws(() => normalizeInput({ ...value, evaluation_request: truncatedRequest }));
  const wrongMode = structuredClone(value.evaluation_request);
  wrongMode.authoritative_context.evaluation_mode = "enforcement";
  assert.throws(() => normalizeInput({ ...value, evaluation_request: wrongMode }));
  const wrongSimulationKind = structuredClone(value.evaluation_request);
  wrongSimulationKind.authoritative_context.sources[0].authority_kind = "platform_control";
  assert.throws(() => normalizeInput({ ...value, evaluation_request: wrongSimulationKind }));
  const longText = "x".repeat(5_000);
  const longTextRequest = structuredClone(value.evaluation_request);
  longTextRequest.submission.content_items[0].value = longText;
  longTextRequest.authoritative_context.sources[0].value = longText;
  assert.doesNotThrow(() => normalizeInput({ ...value, evaluation_request: longTextRequest }));
});

test("REQ-SBX-GENERAL-002 truth union enforces provenance and transformation consistency", () => {
  assert.deepEqual(normalizeTruth(safeTruth()), safeTruth());
  assert.deepEqual(normalizeTruth(riskTruth()), riskTruth());
  assert.throws(() => normalizeTruth({ ...safeTruth(), ground_truth_severity: "high" }));
  assert.throws(() => normalizeTruth({ ...riskTruth(), transformation_kind: null }));
  assert.throws(() => normalizeTruth({ ...riskTruth(), seed_record_ref: null }));
  assert.throws(() => normalizeTruth({ ...riskTruth(), derivation: "direct" }));
});

test("REQ-SBX-GENERAL-002 review ledger requires independent approved adjudication evidence", () => {
  const value = reviewsLedger();
  const normalized = normalizeReviews(value);
  assert.deepEqual(normalized, value);
  assert.notEqual(normalized, value);
  assertDeeplyFrozen(normalized);

  const sameReviewer = structuredClone(value);
  sameReviewer.records[0].independent_reviewer_id = sameReviewer.records[0].author_id;
  assert.throws(() => normalizeReviews(sameReviewer));

  const pending = structuredClone(value);
  pending.records[1].review_status = "pending";
  assert.throws(() => normalizeReviews(pending));

  const unsafeSafeLabel = structuredClone(value);
  unsafeSafeLabel.records[0].ground_truth_severity = "high";
  assert.throws(() => normalizeReviews(unsafeSafeLabel));

  const missingRiskApproval = structuredClone(value);
  missingRiskApproval.records[1].severity_review_status = "not_applicable";
  assert.throws(() => normalizeReviews(missingRiskApproval));

  const missingCategoryApproval = structuredClone(value);
  missingCategoryApproval.records[1].category_review_status = "not_applicable";
  assert.throws(() => normalizeReviews(missingCategoryApproval));

  const missingSeedHash = structuredClone(value);
  missingSeedHash.records[1].seed_upstream_sha256 = null;
  assert.throws(() => normalizeReviews(missingSeedHash));

  const transformedSafe = structuredClone(value);
  Object.assign(transformedSafe.records[0], {
    derivation: "transformed",
    transformed: true,
    transformation_kind: "whitespace",
    seed_record_ref: "message:seed-0001",
    seed_upstream_sha256: C,
    transformation_review_status: "approved"
  });
  assert.throws(() => normalizeReviews(transformedSafe));

  const directChineseTranslationApproval = structuredClone(value);
  directChineseTranslationApproval.records[0].language = "zh";
  directChineseTranslationApproval.records[0].translation_review_status = "approved";
  assert.throws(() => normalizeReviews(directChineseTranslationApproval));

  const unapprovedTranslation = structuredClone(value);
  unapprovedTranslation.records[0].language = "zh";
  unapprovedTranslation.records[0].derivation = "human_translation";
  assert.throws(() => normalizeReviews(unapprovedTranslation));

  const unapprovedTransformation = structuredClone(value);
  unapprovedTransformation.records[1].transformation_review_status = "not_applicable";
  assert.throws(() => normalizeReviews(unapprovedTransformation));

  const duplicateFixture = structuredClone(value);
  duplicateFixture.records[1].fixture_id = duplicateFixture.records[0].fixture_id;
  assert.throws(() => normalizeReviews(duplicateFixture));

  assert.throws(() => normalizeReviews({ ...value, records: [] }));
  const oversized = structuredClone(value);
  oversized.records = Array.from({ length: 301 }, (_, index) => ({
    ...safeReviewRecord(),
    fixture_id: `ssb-v1-${String(index + 1).padStart(4, "0")}`
  }));
  assert.throws(() => normalizeReviews(oversized));

  const wrongRubric = structuredClone(value);
  wrongRubric.records[1].severity_rubric_version = "sandbox-security-severity-rubric.v2";
  assert.throws(() => normalizeReviews(wrongRubric));

  const missingRationale = structuredClone(value);
  missingRationale.records[1].adjudication_rationale = "";
  assert.throws(() => normalizeReviews(missingRationale));

  assert.throws(() => normalizeReviews({ ...value, metric_threshold: 0.9 }));
});

test("REQ-SBX-GENERAL-002 review ledger accepts human-translation and direct-risk reviews", () => {
  const humanTranslation = safeReviewRecord();
  Object.assign(humanTranslation, {
    language: "zh",
    derivation: "human_translation",
    translation_review_status: "approved"
  });
  const directRisk = riskReviewRecord();
  Object.assign(directRisk, {
    fixture_id: "ssb-v1-0003",
    derivation: "direct",
    transformed: false,
    transformation_kind: null,
    seed_record_ref: null,
    seed_upstream_sha256: null,
    transformation_review_status: "not_applicable"
  });
  const value = {
    ...reviewsLedger(),
    records: [humanTranslation, directRisk]
  };

  assert.deepEqual(normalizeReviews(value), value);
});

test("REQ-SBX-GENERAL-002 review ledger defensively copies reviews records and record objects", () => {
  const value = reviewsLedger();
  const normalized = normalizeReviews(value) as {
    records: Array<Record<string, unknown>>;
  };

  assert.notEqual(normalized, value);
  assert.notEqual(normalized.records, value.records);
  assert.notEqual(normalized.records[0], value.records[0]);

  value.records[0].author_id = "mutated_author";
  value.records.reverse();
  assert.equal(normalized.records[0].author_id, "curator_alpha");
  assert.equal(normalized.records[0].fixture_id, FIXTURE_ID);
  assertDeeplyFrozen(normalized);
});

test("REQ-SBX-GENERAL-002 non-transformed reviews require literal null seed evidence", () => {
  for (const [field, invalidValue] of [
    ["seed_record_ref", 42],
    ["seed_record_ref", false],
    ["seed_upstream_sha256", 42],
    ["seed_upstream_sha256", false]
  ] as const) {
    const mutant = reviewsLedger() as {
      records: Array<Record<string, unknown>>;
    };
    mutant.records[0][field] = invalidValue;
    assert.throws(() => normalizeReviews(mutant), `${field}=${String(invalidValue)}`);
  }
});

test("REQ-SBX-GENERAL-002 risk review rationale rejects ASCII and Unicode whitespace-only values", () => {
  for (const rationale of [" \t\r\n", "\u00a0\u2003\u3000"]) {
    const mutant = reviewsLedger();
    mutant.records[1].adjudication_rationale = rationale;
    assert.throws(() => normalizeReviews(mutant), JSON.stringify(rationale));
  }
});

test("REQ-SBX-GENERAL-002 request-ID ledger is pre-label label-blind and independently approved", () => {
  const value = requestIdsLedger();
  const normalized = normalizeRequestIds(value);
  assert.deepEqual(normalized, value);
  assert.notEqual(normalized, value);
  assertDeeplyFrozen(normalized);

  assert.throws(() => normalizeRequestIds({
    ...value,
    independent_reviewer_id: value.generator_id
  }));
  assert.throws(() => normalizeRequestIds({ ...value, review_status: "pending" }));
  assert.throws(() => normalizeRequestIds({ ...value, generation_phase: "post_label" }));
  assert.throws(() => normalizeRequestIds({
    ...value,
    generation_method: "node:crypto.randomUUID"
  }));
  assert.throws(() => normalizeRequestIds({ ...value, entropy_bytes: 8 }));

  const nonContiguous = structuredClone(value);
  nonContiguous.records[1].slot_ordinal = 3;
  assert.throws(() => normalizeRequestIds(nonContiguous));

  const duplicate = structuredClone(value);
  duplicate.records[1].request_id = duplicate.records[0].request_id;
  assert.throws(() => normalizeRequestIds(duplicate));

  const labelLeak = structuredClone(value) as Record<string, unknown> & {
    records: Array<Record<string, unknown>>;
  };
  labelLeak.records[0].primary_category = "prompt_injection";
  assert.throws(() => normalizeRequestIds(labelLeak));

  const malformedId = structuredClone(value);
  malformedId.records[0].request_id = "request_001";
  assert.throws(() => normalizeRequestIds(malformedId));

  for (const requestId of [
    "ABCDEF0123456789ABCDEF0123456789",
    "g".repeat(32)
  ]) {
    const invalidExactLengthId = structuredClone(value);
    invalidExactLengthId.records[0].request_id = requestId;
    assert.throws(() => normalizeRequestIds(invalidExactLengthId));
  }
});

test("REQ-SBX-GENERAL-002 source lock accepts only closed licenses hashes and nonempty records", () => {
  const value = sourcesLock();
  const normalized = normalizeSourcesLock(value);
  assert.deepEqual(normalized, value);
  assertDeeplyFrozen(normalized);
  assert.throws(() => normalizeSourcesLock({
    ...value,
    sources: [{ ...value.sources[0], license: "CC-BY-NC-4.0" }]
  }));
  assert.throws(() => normalizeSourcesLock({
    ...value,
    sources: [{ ...value.sources[0], records: [] }]
  }));
  assert.throws(() => normalizeSourcesLock({
    ...value,
    sources: [{ ...value.sources[0], license_evidence_sha256: "ABC" }]
  }));
  for (const license of ["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0", "CC0-1.0"]) {
    assert.doesNotThrow(() => normalizeSourcesLock({
      ...value,
      sources: [{ ...value.sources[0], license }]
    }));
  }
});

test("REQ-SBX-GENERAL-002 replay envelope is content-free and validates ordinal outcomes", () => {
  const value = replayEnvelope();
  const normalized = normalizeReplay(value);
  assert.deepEqual(normalized, value);
  assertDeeplyFrozen(normalized);
  for (const extra of [
    { provider_body: "raw provider prose" },
    { ground_truth: "risk" },
    { expected_action: "deny" },
    { sanitized_payload: "secret" }
  ]) {
    assert.throws(() => normalizeReplay({ ...value, ...extra }));
  }
  const invalidOrdinal = structuredClone(value);
  invalidOrdinal.ollama.normalized_response.message.parsed.candidates[0]
    .subject_refs[0].source_ordinal = 0;
  assert.throws(() => normalizeReplay(invalidOrdinal));
});

test("REQ-SBX-GENERAL-002 replay normalization matches provider duplicate and HTTP outcome rules", () => {
  const sourceOrdinal64 = structuredClone(replayEnvelope());
  sourceOrdinal64.ollama.normalized_response.message.parsed.candidates[0]
    .subject_refs[0].source_ordinal = 64;
  assert.doesNotThrow(() => normalizeReplay(sourceOrdinal64));
  const sourceOrdinal65 = structuredClone(replayEnvelope());
  sourceOrdinal65.ollama.normalized_response.message.parsed.candidates[0]
    .subject_refs[0].source_ordinal = 65;
  assert.throws(() => normalizeReplay(sourceOrdinal65));
  const duplicateRef = structuredClone(replayEnvelope());
  duplicateRef.ollama.normalized_response.message.parsed.candidates[0]
    .subject_refs.push({ kind: "content_source", source_ordinal: 1, component: "whole_source" });
  assert.throws(() => normalizeReplay(duplicateRef));
  const duplicateCandidate = structuredClone(replayEnvelope());
  duplicateCandidate.ollama.normalized_response.message.parsed.candidates.push(
    structuredClone(duplicateCandidate.ollama.normalized_response.message.parsed.candidates[0])
  );
  assert.throws(() => normalizeReplay(duplicateCandidate));
  for (const status of [100, 302, 599]) {
    const nonSuccess: Record<string, unknown> = structuredClone(replayEnvelope());
    nonSuccess.ollama = { status: "http_error", http_status: status };
    assert.doesNotThrow(() => normalizeReplay(nonSuccess));
  }
  const invalidStatus: Record<string, unknown> = structuredClone(replayEnvelope());
  invalidStatus.ollama = { status: "http_error", http_status: 99 };
  assert.throws(() => normalizeReplay(invalidStatus));
  const judgeResponse: Record<string, unknown> = structuredClone(replayEnvelope());
  judgeResponse.judge = {
    status: "response",
    http_status: 200,
    content_type: "application/json",
    normalized_response: {
      model: "gpt-5.6-terra",
      status: "completed",
      parsed: {
        schema_version: "sandbox-security-judge.v1",
        obligation_results: [{
          obligation_ordinal: 1,
          outcome: "risk",
          confidence: "probable",
          severity: "high"
        }]
      }
    }
  };
  assert.doesNotThrow(() => normalizeReplay(judgeResponse));
  for (const outcome of [
    { status: "transport_error", error_code: "connection_failed" },
    { status: "transport_error", error_code: "response_too_large" },
    { status: "transport_error", error_code: "provider_response_invalid" },
    { status: "signal_termination", termination_reason: "slot_timeout" },
    { status: "signal_termination", termination_reason: "work_budget" }
  ]) {
    const closedOutcome: Record<string, unknown> = structuredClone(replayEnvelope());
    closedOutcome.judge = outcome;
    assert.doesNotThrow(() => normalizeReplay(closedOutcome));
  }
});

test("REQ-SBX-GENERAL-002 capture manifest and seal admit only exact content-free hashes", () => {
  const capture = captureManifest();
  assert.deepEqual(normalizeCapture(capture), capture);
  assert.doesNotMatch(
    JSON.stringify(normalizeCapture(capture)),
    /authorization|provider_body|usage|ground_truth|expected_action/
  );
  assert.throws(() => normalizeCapture({ ...capture, provider_body: "raw" }));
  const seal = {
    schema_version: "sandbox-security-benchmark-seal.v1",
    capture_manifest_sha256: A,
    truth_tree_sha256: B,
    replay_tree_sha256: C,
    accepted_metrics_sha256: D
  };
  assert.deepEqual(normalizeSeal(seal), seal);
  assert.throws(() => normalizeSeal({ ...seal, truth: [] }));
});

test("REQ-SBX-GENERAL-002 capture manifest binds exact versions and Ollama qualification digest", () => {
  const wrongVersion = captureManifest();
  wrongVersion.local_prompt_version = "wrong.prompt.v1";
  assert.throws(() => normalizeCapture(wrongVersion));
  const wrongDigest = captureManifest();
  wrongDigest.ollama_qualification.inventory.normalized_response.digest = `sha256:${A}`;
  assert.throws(() => normalizeCapture(wrongDigest));
  const wrongPrewarmDigest = captureManifest();
  wrongPrewarmDigest.ollama_qualification.prewarm.normalized_response.verified_ollama_digest = `sha256:${A}`;
  assert.throws(() => normalizeCapture(wrongPrewarmDigest));
});

test("REQ-SBX-GENERAL-002 benchmark manifest fixes ordered opaque IDs and tree hashes", () => {
  const manifest = {
    schema_version: "sandbox-security-benchmark-manifest.v1",
    benchmark_revision: "v1",
    sources_lock_sha256: A,
    inputs_tree_sha256: B,
    truth_tree_sha256: C,
    reviews_tree_sha256: D,
    request_ids_tree_sha256: A,
    fixture_ids: ["ssb-v1-0001", "ssb-v1-0002"]
  };
  assert.deepEqual(normalizeManifest(manifest), manifest);
  assert.throws(() => normalizeManifest({
    ...manifest,
    fixture_ids: ["ssb-v1-0001", "ssb-v1-0001"]
  }));
  const { reviews_tree_sha256: _reviews, ...missingReviews } = manifest;
  assert.throws(() => normalizeManifest(missingReviews));
  const { request_ids_tree_sha256: _requestIds, ...missingRequestIds } = manifest;
  assert.throws(() => normalizeManifest(missingRequestIds));
  assert.throws(() => normalizeManifest({ ...manifest, metric_threshold: 0.9 }));
});

test("REQ-SBX-GENERAL-002 normalizers reject accessors symbols sparse arrays and inherited records", () => {
  const accessor = inputEnvelope();
  Object.defineProperty(accessor, "fixture_id", {
    enumerable: true,
    get() {
      throw new Error("accessor-sentinel");
    }
  });
  assert.throws(() => normalizeInput(accessor), { message: /benchmark_contract_invalid/ });
  const symbolic = { ...safeTruth(), [Symbol("oracle")]: true };
  assert.throws(() => normalizeTruth(symbolic));
  const sparse = [sourcesLock().sources[0]];
  sparse.length = 2;
  assert.throws(() => normalizeSourcesLock({
    schema_version: "sandbox-security-benchmark-sources.v1",
    sources: sparse
  }));
});

test("REQ-SBX-GENERAL-002 normalizers reject Proxy records that hide label fields", () => {
  const target = {
    ...safeReviewRecord(),
    hidden_label: "risk"
  };
  const hiddenLabelRecord = new Proxy(target, {
    ownKeys(record) {
      return Reflect.ownKeys(record).filter((key) => key !== "hidden_label");
    }
  });
  const value = reviewsLedger();
  value.records[0] = hiddenLabelRecord;

  assert.throws(() => normalizeReviews(value), { message: /benchmark_contract_invalid/ });
});

test("REQ-SBX-GENERAL-002 normalizers reject Proxy arrays that hide label fields", () => {
  const records = reviewsLedger().records as Array<Record<string, unknown>> & {
    hidden_label?: string;
  };
  Object.defineProperty(records, "hidden_label", {
    configurable: true,
    enumerable: true,
    value: "risk"
  });
  const hiddenLabelArray = new Proxy(records, {
    ownKeys(array) {
      return Reflect.ownKeys(array).filter((key) => key !== "hidden_label");
    }
  });

  assert.throws(
    () => normalizeReviews({ ...reviewsLedger(), records: hiddenLabelArray }),
    { message: /benchmark_contract_invalid/ }
  );
});

test("REQ-SBX-GENERAL-002 string validation rejects lone surrogates without ES2024 APIs", () => {
  const original = Object.getOwnPropertyDescriptor(String.prototype, "isWellFormed");
  try {
    Object.defineProperty(String.prototype, "isWellFormed", {
      configurable: true,
      value: undefined
    });
    const value = sourcesLock();
    assert.throws(() => normalizeSourcesLock({
      ...value,
      sources: [{ ...value.sources[0], admitted_scope: "scope_\ud800" }]
    }));
  } finally {
    if (original === undefined) {
      delete (String.prototype as { isWellFormed?: unknown }).isWellFormed;
    } else {
      Object.defineProperty(String.prototype, "isWellFormed", original);
    }
  }
});

test("REQ-SBX-GENERAL-002 canonical tree hash is path-ordered content-sensitive and symlink-free", () => {
  const hashTree = contracts.hashSandboxSecurityBenchmarkTree as
    | ((root: string) => string)
    | undefined;
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-tree-"));
  const rootLink = `${root}-link`;
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "z.json"), "{\"z\":1}\n");
    writeFileSync(join(root, "nested", "a.json"), "{\"a\":2}\n");
    assert.equal(typeof hashTree, "function");
    const first = hashTree!(root);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(hashTree!(root), first);
    writeFileSync(join(root, "nested", "path.json"), "{\"same\":true}\n");
    const pathBeforeRename = hashTree!(root);
    renameSync(join(root, "nested", "path.json"), join(root, "nested", "renamed.json"));
    assert.notEqual(hashTree!(root), pathBeforeRename);
    renameSync(join(root, "nested", "renamed.json"), join(root, "nested", "path.json"));
    writeFileSync(join(root, "nested", "a.json"), "{\"a\":3}\n");
    assert.notEqual(hashTree!(root), first);
    const independent = createHash("sha256").update(first).digest("hex");
    assert.notEqual(independent, first);
    symlinkSync(root, rootLink);
    assert.throws(() => hashTree!(rootLink));
  } finally {
    rmSync(rootLink, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-002 tree hash bounds directory entries, not only files", () => {
  const hashTree = contracts.hashSandboxSecurityBenchmarkTree as
    | ((root: string) => string)
    | undefined;
  const root = mkdtempSync(join(tmpdir(), "sandbox-security-empty-tree-"));
  try {
    for (let index = 0; index < 4_097; index += 1) {
      mkdirSync(join(root, `empty-${index}`));
    }
    assert.equal(typeof hashTree, "function");
    assert.throws(() => hashTree!(root), { message: /benchmark_contract_invalid/ });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-002 canonical JSON hashing enforces bounded well-formed trees", () => {
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let index = 0; index < 20; index += 1) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  assert.throws(
    () => (contracts.hashSandboxSecurityBenchmarkCanonicalJson as (value: unknown) => string)(deep),
    { message: /benchmark_contract_invalid/ }
  );
  assert.throws(
    () => (contracts.hashSandboxSecurityBenchmarkCanonicalJson as (value: unknown) => string)("bad_\ud800"),
    { message: /benchmark_contract_invalid/ }
  );
});
