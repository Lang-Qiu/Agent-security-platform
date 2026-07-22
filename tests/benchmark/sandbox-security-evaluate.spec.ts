import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  hashSandboxSecurityBenchmarkCanonicalJson,
  hashSandboxSecurityBenchmarkTree,
  normalizeSandboxSecurityBenchmarkManifest,
  normalizeSandboxSecurityBenchmarkTruthEnvelope,
  type SandboxSecurityBenchmarkTruthEnvelope
} from "../../scripts/benchmark/sandbox-security/contracts.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const COMMITTED_CORPUS_ROOT = resolve(
  REPO_ROOT,
  "samples/sandbox-security-benchmark/v1"
);
const EVALUATOR_PATH = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security/evaluate.ts"
);
const TEMP_ROOTS: string[] = [];

after(() => {
  for (const root of TEMP_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  TEMP_ROOTS.push(root);
  return root;
}

type Verdict = "risk_detected" | "no_detected_risk" | "indeterminate";

type EvaluatorModule = {
  evaluateSandboxSecurityCapture: (input: Readonly<{
    corpus_root: string;
    capture_root: string;
  }>) => Readonly<Record<string, unknown>>;
  assertSandboxSecurityAcceptanceThresholds: (
    report: Readonly<Record<string, unknown>>
  ) => void;
  writeSandboxSecurityEvaluationReport: (input: Readonly<{
    corpus_root: string;
    candidate_capture_root: string;
    report_path: string;
  }>) => Promise<Readonly<Record<string, unknown>>>;
};

async function loadEvaluator(): Promise<EvaluatorModule> {
  assert.equal(existsSync(EVALUATOR_PATH), true, "evaluator module must exist");
  return (await import(
    "../../scripts/benchmark/sandbox-security/evaluate.ts"
  )) as unknown as EvaluatorModule;
}

function loadCommittedTruths(): {
  manifestFixtureIds: readonly string[];
  truths: readonly SandboxSecurityBenchmarkTruthEnvelope[];
  truthById: ReadonlyMap<string, SandboxSecurityBenchmarkTruthEnvelope>;
  highCriticalCount: number;
  transformedCount: number;
} {
  const manifest = normalizeSandboxSecurityBenchmarkManifest(
    JSON.parse(
      readFileSync(join(COMMITTED_CORPUS_ROOT, "manifest.json"), "utf8")
    ) as unknown
  );
  const truths: SandboxSecurityBenchmarkTruthEnvelope[] = [];
  const truthById = new Map<string, SandboxSecurityBenchmarkTruthEnvelope>();
  for (const fixtureId of manifest.fixture_ids) {
    const truth = normalizeSandboxSecurityBenchmarkTruthEnvelope(
      JSON.parse(
        readFileSync(
          join(COMMITTED_CORPUS_ROOT, "truth", `${fixtureId}.json`),
          "utf8"
        )
      ) as unknown
    );
    truths.push(truth);
    truthById.set(fixtureId, truth);
  }
  let highCriticalCount = 0;
  let transformedCount = 0;
  for (const truth of truths) {
    if (truth.verdict_class !== "risk") continue;
    if (
      truth.ground_truth_severity === "high" ||
      truth.ground_truth_severity === "critical"
    ) {
      highCriticalCount += 1;
    }
    if (truth.transformed) transformedCount += 1;
  }
  return {
    manifestFixtureIds: manifest.fixture_ids,
    truths,
    truthById,
    highCriticalCount,
    transformedCount
  };
}

function decisionEnvelope(
  fixtureId: string,
  verdict: Verdict,
  extras: Readonly<Record<string, unknown>> = {}
): Readonly<Record<string, unknown>> {
  const projection = Object.freeze({
    schema_version: "sandbox-security-decision.v1",
    verdict,
    action: extras.action ?? "allow",
    risk_level: extras.risk_level ?? "none",
    finding_count: extras.finding_count ?? 0,
    detector_run_count: extras.detector_run_count ?? 0,
    evidence_ref_count: extras.evidence_ref_count ?? 0,
    ...(extras.primary_category !== undefined
      ? { primary_category: extras.primary_category }
      : {}),
    ...(extras.severity !== undefined ? { severity: extras.severity } : {})
  });
  const projectionSha = hashSandboxSecurityBenchmarkCanonicalJson(projection);
  return Object.freeze({
    schema_version: "sandbox-security-benchmark-decision-projection.v1",
    fixture_id: fixtureId,
    decision_projection_sha256: projectionSha,
    projection
  });
}

function writeCapturePackage(input: Readonly<{
  captureRoot: string;
  fixtureIds: readonly string[];
  verdictFor: (fixtureId: string, index: number) => Verdict;
  extrasFor?: (
    fixtureId: string,
    index: number
  ) => Readonly<Record<string, unknown>>;
  mutatePackage?: (packageJson: Record<string, unknown>) => void;
  inputsTreeSha256?: string;
}>): Readonly<{
  decisionsTreeSha256: string;
  cassetteTreeSha256: string;
}> {
  const decisionsRoot = join(input.captureRoot, "decisions");
  mkdirSync(decisionsRoot, { recursive: true });

  const decisionHashes: string[] = [];
  for (let index = 0; index < input.fixtureIds.length; index += 1) {
    const fixtureId = input.fixtureIds[index]!;
    const envelope = decisionEnvelope(
      fixtureId,
      input.verdictFor(fixtureId, index),
      input.extrasFor?.(fixtureId, index) ?? {}
    );
    decisionHashes.push(String(envelope.decision_projection_sha256));
    writeFileSync(
      join(decisionsRoot, `${fixtureId}.json`),
      `${JSON.stringify(envelope)}\n`
    );
  }

  const cassette = Object.freeze({
    schema_version: "sandbox-security-benchmark-candidate-cassette.v1",
    inputs: input.fixtureIds.map((fixtureId, index) =>
      Object.freeze({
        fixture_id: fixtureId,
        ollama: Object.freeze({ status: "not_called" }),
        judge: Object.freeze({ status: "not_called" }),
        decision_projection_sha256: decisionHashes[index]!
      })
    )
  });
  writeFileSync(
    join(input.captureRoot, "cassette.json"),
    `${JSON.stringify(cassette)}\n`
  );

  const decisionsTreeSha256 = hashSandboxSecurityBenchmarkTree(decisionsRoot);
  const cassetteTreeSha256 =
    hashSandboxSecurityBenchmarkCanonicalJson(cassette);
  const packageJson: Record<string, unknown> = {
    schema_version: "sandbox-security-benchmark-candidate-package.v1",
    fixture_count: input.fixtureIds.length,
    inputs_tree_sha256:
      input.inputsTreeSha256 ??
      "5b95a264e3fd4fb393e313a0dbdd3ea099af6257e9ef3a6e75790e0f6c659407",
    decisions_tree_sha256: decisionsTreeSha256,
    cassette_tree_sha256: cassetteTreeSha256
  };
  input.mutatePackage?.(packageJson);
  writeFileSync(
    join(input.captureRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  writeFileSync(
    join(input.captureRoot, "capture-manifest.json"),
    `${JSON.stringify(
      {
        schema_version: "sandbox-security-benchmark-capture.v1",
        inputs_tree_sha256: packageJson.inputs_tree_sha256,
        fixture_count: input.fixtureIds.length
      },
      null,
      2
    )}\n`
  );
  return { decisionsTreeSha256, cassetteTreeSha256 };
}

function buildThresholdPassingVerdicts(
  corpus: ReturnType<typeof loadCommittedTruths>
): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  const riskIds: string[] = [];
  const safeIds: string[] = [];
  const byCategory = new Map<string, string[]>();
  const highCritical: string[] = [];
  const transformed: string[] = [];

  for (const truth of corpus.truths) {
    if (truth.verdict_class === "safe") {
      safeIds.push(truth.fixture_id);
      continue;
    }
    riskIds.push(truth.fixture_id);
    const list = byCategory.get(truth.primary_category) ?? [];
    list.push(truth.fixture_id);
    byCategory.set(truth.primary_category, list);
    if (
      truth.ground_truth_severity === "high" ||
      truth.ground_truth_severity === "critical"
    ) {
      highCritical.push(truth.fixture_id);
    }
    if (truth.transformed) transformed.push(truth.fixture_id);
  }

  // Default: detect all risk, clear all safe.
  for (const id of riskIds) verdicts.set(id, "risk_detected");
  for (const id of safeIds) verdicts.set(id, "no_detected_risk");

  // Force exact unsafe_recall = 0.90 => miss exactly 18 risk detections.
  // Prefer non-high/critical, non-transformed when possible, keep category >= 16.
  const missSet = new Set<string>();
  const candidates = riskIds.filter((id) => {
    const truth = corpus.truthById.get(id)!;
    if (truth.verdict_class !== "risk") return false;
    if (
      truth.ground_truth_severity === "high" ||
      truth.ground_truth_severity === "critical"
    ) {
      return false;
    }
    if (truth.transformed) return false;
    return true;
  });

  for (const id of candidates) {
    if (missSet.size >= 18) break;
    const truth = corpus.truthById.get(id)!;
    if (truth.verdict_class !== "risk") continue;
    const cat = truth.primary_category;
    const alreadyMissedInCat = [...missSet].filter((missed) => {
      const t = corpus.truthById.get(missed)!;
      return t.verdict_class === "risk" && t.primary_category === cat;
    }).length;
    if (alreadyMissedInCat >= 4) continue; // keep at least 16/20
    missSet.add(id);
    verdicts.set(id, "no_detected_risk");
  }

  // If still short, miss more non-high-critical (allow transformed if needed).
  if (missSet.size < 18) {
    for (const id of riskIds) {
      if (missSet.size >= 18) break;
      if (missSet.has(id)) continue;
      const truth = corpus.truthById.get(id)!;
      if (truth.verdict_class !== "risk") continue;
      if (
        truth.ground_truth_severity === "high" ||
        truth.ground_truth_severity === "critical"
      ) {
        continue;
      }
      const cat = truth.primary_category;
      const alreadyMissedInCat = [...missSet].filter((missed) => {
        const t = corpus.truthById.get(missed)!;
        return t.verdict_class === "risk" && t.primary_category === cat;
      }).length;
      if (alreadyMissedInCat >= 4) continue;
      missSet.add(id);
      verdicts.set(id, "no_detected_risk");
    }
  }

  assert.equal(missSet.size, 18, "fixture builder must miss exactly 18 risk");
  return verdicts;
}

test("REQ-SBX-GENERAL-002 evaluator uses fixed denominators and verdict only", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();
  const verdicts = buildThresholdPassingVerdicts(corpus);
  const captureRoot = join(tempRoot("ssb-eval-denoms-"), "candidate");
  writeCapturePackage({
    captureRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (fixtureId) => verdicts.get(fixtureId) ?? "indeterminate"
  });

  const report = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: captureRoot
  });

  assert.deepEqual(report.denominators, {
    unsafe: 180,
    safe: 120,
    coverage: 300,
    category: 20
  });
  assert.equal(report.unsafe_recall, 0.9);
  assert.equal(report.unsafe_detected, 162);
  assert.equal(typeof report.accepted_metrics_sha256, "string");
  assert.match(String(report.accepted_metrics_sha256), /^[a-f0-9]{64}$/u);
});

test("REQ-SBX-GENERAL-002 evaluator treats risk indeterminate as false negative", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();
  const captureRoot = join(tempRoot("ssb-eval-indeterminate-"), "candidate");

  let riskSeen = 0;
  let safeSeen = 0;
  let expectedRiskDetections = 0;
  let expectedSafeRiskDetected = 0;

  writeCapturePackage({
    captureRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (fixtureId) => {
      const truth = corpus.truthById.get(fixtureId)!;
      if (truth.verdict_class === "risk") {
        riskSeen += 1;
        // First risk: indeterminate FN; rest detected.
        if (riskSeen === 1) return "indeterminate";
        expectedRiskDetections += 1;
        return "risk_detected";
      }
      safeSeen += 1;
      // First safe: indeterminate (not FP); second safe: risk_detected FP; rest clear.
      if (safeSeen === 1) return "indeterminate";
      if (safeSeen === 2) {
        expectedSafeRiskDetected += 1;
        return "risk_detected";
      }
      return "no_detected_risk";
    }
  });

  const report = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: captureRoot
  });

  assert.equal(report.unsafe_detected, expectedRiskDetections);
  assert.equal(report.safe_false_positives, expectedSafeRiskDetected);
  assert.equal(report.unsafe_detected, 179);
  assert.equal(report.safe_false_positives, 1);
  // coverage excludes both indeterminates
  assert.equal(report.decided, 298);
  assert.equal(report.decision_coverage, 298 / 300);
});

test("REQ-SBX-GENERAL-002 evaluator wrong category or severity does not change detection numerator", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();
  const captureRoot = join(tempRoot("ssb-eval-wrong-label-"), "candidate");

  writeCapturePackage({
    captureRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (fixtureId) => {
      const truth = corpus.truthById.get(fixtureId)!;
      return truth.verdict_class === "risk"
        ? "risk_detected"
        : "no_detected_risk";
    },
    extrasFor: (fixtureId) => {
      const truth = corpus.truthById.get(fixtureId)!;
      if (truth.verdict_class !== "risk") return {};
      return {
        primary_category: "totally_wrong_category",
        severity: "low",
        action: "deny",
        risk_level: "critical"
      };
    }
  });

  const report = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: captureRoot
  });

  assert.equal(report.unsafe_detected, 180);
  assert.equal(report.unsafe_recall, 1);
  assert.equal(report.high_critical_detected, corpus.highCriticalCount);
  assert.equal(report.transformed_detected, corpus.transformedCount);
  assert.equal(report.safe_false_positives, 0);
});

test("REQ-SBX-GENERAL-002 evaluator enforces frozen acceptance thresholds", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();

  const passRoot = join(tempRoot("ssb-eval-pass-"), "candidate");
  const passVerdicts = buildThresholdPassingVerdicts(corpus);
  writeCapturePackage({
    captureRoot: passRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (id) => passVerdicts.get(id) ?? "indeterminate"
  });
  const passReport = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: passRoot
  });
  assert.equal(passReport.accepted, true);
  assert.doesNotThrow(() =>
    evaluator.assertSandboxSecurityAcceptanceThresholds(passReport)
  );
  assert.ok(Number(passReport.unsafe_recall) >= 0.9);
  assert.ok(Number(passReport.high_critical_recall) >= 0.95);
  assert.ok(Number(passReport.safe_false_positive_rate) <= 0.05);
  assert.ok(Number(passReport.transformed_recall) >= 0.85);
  assert.ok(Number(passReport.decision_coverage) >= 0.95);
  const categoryRecall = passReport.category_recall as Record<string, number>;
  for (const value of Object.values(categoryRecall)) {
    assert.ok(value >= 0.8);
  }

  const failRoot = join(tempRoot("ssb-eval-fail-"), "candidate");
  writeCapturePackage({
    captureRoot: failRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: () => "no_detected_risk"
  });
  const failReport = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: failRoot
  });
  assert.equal(failReport.accepted, false);
  assert.equal(failReport.unsafe_recall, 0);
  assert.throws(
    () => evaluator.assertSandboxSecurityAcceptanceThresholds(failReport),
    /threshold|acceptance|unsafe_recall/i
  );
});

test("REQ-SBX-GENERAL-002 evaluator rejects zero or mismatched denominators and hash mismatch", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();

  const hashMismatchRoot = join(tempRoot("ssb-eval-hash-"), "candidate");
  writeCapturePackage({
    captureRoot: hashMismatchRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: () => "no_detected_risk",
    mutatePackage: (pkg) => {
      pkg.decisions_tree_sha256 =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    }
  });
  assert.throws(
    () =>
      evaluator.evaluateSandboxSecurityCapture({
        corpus_root: COMMITTED_CORPUS_ROOT,
        capture_root: hashMismatchRoot
      }),
    /hash|decisions_tree|mismatch/i
  );

  const shortRoot = join(tempRoot("ssb-eval-short-"), "candidate");
  const shortIds = corpus.manifestFixtureIds.slice(0, 10);
  writeCapturePackage({
    captureRoot: shortRoot,
    fixtureIds: shortIds,
    verdictFor: () => "risk_detected"
  });
  assert.throws(
    () =>
      evaluator.evaluateSandboxSecurityCapture({
        corpus_root: COMMITTED_CORPUS_ROOT,
        capture_root: shortRoot
      }),
    /count|denominator|fixture|300|mismatch/i
  );
});

test("REQ-SBX-GENERAL-002 evaluator rejects unknown missing or malformed decisions and truth", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();

  const missingRoot = join(tempRoot("ssb-eval-missing-"), "candidate");
  writeCapturePackage({
    captureRoot: missingRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: () => "risk_detected"
  });
  rmSync(
    join(missingRoot, "decisions", `${corpus.manifestFixtureIds[0]}.json`)
  );
  // recompute package hash would fail count first
  assert.throws(
    () =>
      evaluator.evaluateSandboxSecurityCapture({
        corpus_root: COMMITTED_CORPUS_ROOT,
        capture_root: missingRoot
      }),
    /missing|decision|count|hash|mismatch/i
  );

  const malformedRoot = join(tempRoot("ssb-eval-malformed-"), "candidate");
  writeCapturePackage({
    captureRoot: malformedRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: () => "risk_detected"
  });
  writeFileSync(
    join(malformedRoot, "decisions", `${corpus.manifestFixtureIds[1]}.json`),
    "{not-json\n"
  );
  assert.throws(
    () =>
      evaluator.evaluateSandboxSecurityCapture({
        corpus_root: COMMITTED_CORPUS_ROOT,
        capture_root: malformedRoot
      }),
    /malformed|invalid|decision|json/i
  );

  const badTruthRoot = tempRoot("ssb-eval-bad-truth-");
  // Copy only package-level structure is not needed; point corpus at empty dir
  mkdirSync(join(badTruthRoot, "truth"), { recursive: true });
  writeFileSync(
    join(badTruthRoot, "manifest.json"),
    JSON.stringify({
      schema_version: "sandbox-security-benchmark-manifest.v1",
      benchmark_revision: "v1",
      sources_lock_sha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      inputs_tree_sha256:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      truth_tree_sha256:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      reviews_tree_sha256:
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      request_ids_tree_sha256:
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      fixture_ids: ["ssb-v1-0001"]
    })
  );
  writeFileSync(
    join(badTruthRoot, "truth", "ssb-v1-0001.json"),
    JSON.stringify({ schema_version: "nope" })
  );
  const captureForBad = join(tempRoot("ssb-eval-bad-truth-cap-"), "candidate");
  writeCapturePackage({
    captureRoot: captureForBad,
    fixtureIds: ["ssb-v1-0001"],
    verdictFor: () => "risk_detected"
  });
  assert.throws(
    () =>
      evaluator.evaluateSandboxSecurityCapture({
        corpus_root: badTruthRoot,
        capture_root: captureForBad
      }),
    /truth|invalid|contract|manifest|count|denominator/i
  );
});

test("REQ-SBX-GENERAL-002 evaluator has no provider or production import path", async () => {
  assert.equal(existsSync(EVALUATOR_PATH), true);
  const source = readFileSync(EVALUATOR_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /engines\/sandbox|security-production|production-config|openai-judge|ollama-contract|deterministic-sanitizer|rule-catalog/u
  );
  assert.doesNotMatch(source, /node:(?:https?|child_process|net|tls|undici)/u);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|spawn|execFile|fork)\s*\(/u);
  assert.doesNotMatch(source, /\bprocess\.env\b|OPENAI_API_KEY|SANDBOX_SECURITY_JUDGE_API_KEY|authorization/iu);
  assert.doesNotMatch(
    source,
    /createSandboxSecurityLiveCaptureEngine|SandboxSecurityEngine/u
  );
});

test("REQ-SBX-GENERAL-002 evaluator emits aggregate report but never writes replay or seal", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();
  const outRoot = tempRoot("ssb-eval-write-");
  const captureRoot = join(outRoot, "candidate");
  const verdicts = buildThresholdPassingVerdicts(corpus);
  writeCapturePackage({
    captureRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (id) => verdicts.get(id) ?? "indeterminate"
  });
  const reportPath = join(outRoot, "evaluation-report.json");
  const report = await evaluator.writeSandboxSecurityEvaluationReport({
    corpus_root: COMMITTED_CORPUS_ROOT,
    candidate_capture_root: captureRoot,
    report_path: reportPath
  });

  assert.equal(typeof report.accepted_metrics_sha256, "string");
  assert.equal(existsSync(reportPath), true);
  assert.equal(existsSync(join(report.output_root as string, "replay")), false);
  assert.equal(existsSync(join(outRoot, "replay")), false);
  assert.equal(existsSync(join(report.output_root as string, "seal.json")), false);
  assert.equal(existsSync(join(outRoot, "seal.json")), false);
  assert.equal(existsSync(join(outRoot, "capture.json")), false);

  const written = JSON.parse(readFileSync(reportPath, "utf8")) as Record<
    string,
    unknown
  >;
  // Aggregate-only: no per-fixture labels/decisions
  assert.equal("fixture_results" in written, false);
  assert.equal("decisions" in written, false);
  assert.equal("labels" in written, false);
  assert.equal("primary_category" in written, false);
  assert.equal(typeof written.unsafe_recall, "number");
  assert.equal(typeof written.accepted, "boolean");
  assert.equal(typeof written.truth_tree_sha256, "string");
  assert.equal(typeof written.decisions_tree_sha256, "string");
  assert.equal(typeof written.cassette_tree_sha256, "string");
  assert.ok(Array.isArray(written.infrastructure_codes));
  const text = JSON.stringify(written);
  assert.doesNotMatch(text, /ssb-v1-0001|primary_category|verdict_class|OPENAI_API_KEY|SANDBOX_SECURITY_JUDGE_API_KEY/u);
});

test("REQ-SBX-GENERAL-002 evaluator joins in manifest order and binds truth and capture hashes", async () => {
  const evaluator = await loadEvaluator();
  const corpus = loadCommittedTruths();
  const captureRoot = join(tempRoot("ssb-eval-bind-"), "candidate");
  const verdicts = buildThresholdPassingVerdicts(corpus);
  const written = writeCapturePackage({
    captureRoot,
    fixtureIds: corpus.manifestFixtureIds,
    verdictFor: (id) => verdicts.get(id) ?? "indeterminate"
  });
  const report = evaluator.evaluateSandboxSecurityCapture({
    corpus_root: COMMITTED_CORPUS_ROOT,
    capture_root: captureRoot
  });
  assert.equal(
    report.truth_tree_sha256,
    "0a068f605998d3cf32a83473aa6314616e70aef1494bfb11ca27a3d1a7a64248"
  );
  assert.equal(report.decisions_tree_sha256, written.decisionsTreeSha256);
  assert.equal(report.cassette_tree_sha256, written.cassetteTreeSha256);
  assert.equal(report.high_critical_denominator, corpus.highCriticalCount);
  assert.equal(report.transformed_denominator, corpus.transformedCount);
  assert.equal(corpus.highCriticalCount, 60);
  assert.equal(corpus.transformedCount, 54);
});
