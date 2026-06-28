import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// -- helpers ----------------------------------------------------------------

function resolveRepoPath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

function readSource(relativePath: string): string {
  return readFileSync(resolveRepoPath(relativePath), "utf8");
}

// ============================================================================
// Anti-oracle static scans
// ============================================================================

const BASE_FILTER_DIR = "../../engines/sandbox/src/base-filter/";
const SCAN_FILES = [
  "contract.ts",
  "context-envelope.ts",
  "rule-catalog.ts",
  "evaluator.ts",
  "provider.ts"
];

test("base-filter source files contain no case IDs", () => {
  for (const file of SCAN_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !/T1-SC-\d{3}-C\d{3}/.test(src),
      `${file}: contains case IDs`
    );
  }
});

test("base-filter source files contain no scenario IDs in decision logic", () => {
  // Scenario IDs are allowed only in type definitions (contract.ts) and replay-adapter.ts
  const allowedFiles = ["contract.ts", "replay-adapter.ts"];
  for (const file of SCAN_FILES) {
    if (allowedFiles.includes(file)) continue;
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !/T1-SC-\d{3}/.test(src),
      `${file}: contains scenario IDs`
    );
  }
});

test("base-filter source files contain no expected_outcome or expected_action in decision logic", () => {
  // expected_action/expected_outcome is allowed as a data field name in contract/evaluation/replay-adapter,
  // and in context-envelope.ts which rejects them in rule IDs (defensive normalization)
  const allowedFiles = ["contract.ts", "evaluation.ts", "replay-adapter.ts", "context-envelope.ts"];
  for (const file of SCAN_FILES) {
    if (allowedFiles.includes(file)) continue;
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !src.includes("expected_outcome"),
      `${file}: contains expected_outcome`
    );
    assert.ok(
      !src.includes("expected_action"),
      `${file}: contains expected_action`
    );
  }
});

test("base-filter core files contain no policy_action in decision logic", () => {
  // policy_action is allowed in context-envelope.ts (rejects unsafe rule IDs) and contract.ts (types)
  const allowedFiles = ["contract.ts", "context-envelope.ts", "evaluation.ts", "replay-adapter.ts"];
  for (const file of SCAN_FILES) {
    if (allowedFiles.includes(file)) continue;
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !src.includes("policy_action"),
      `${file}: contains policy_action in decision logic`
    );
  }
});

test("base-filter source files contain no samples/track1 path references", () => {
  for (const file of SCAN_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !src.includes("samples/track1"),
      `${file}: references samples/track1`
    );
  }
});

test("base-filter provider/catalog/evaluator do not import case fixtures", () => {
  for (const file of ["contract.ts", "context-envelope.ts", "rule-catalog.ts", "evaluator.ts", "provider.ts"]) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(
      !src.includes("case fixture"),
      `${file}: imports case fixtures`
    );
    assert.ok(
      !src.includes("../replay/loader"),
      `${file}: imports replay loader`
    );
  }
});

// ============================================================================
// Runtime safety scans
// ============================================================================

const RUNTIME_FILES = [
  ...SCAN_FILES,
  "replay-adapter.ts",
  "evaluation.ts"
];

const DEMO_FILE = "../../samples/track1/base-filter/demo.ts";

test("no model SDK imports", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("@anthropic"), `${file}: imports model SDK`);
  }
  const demoSrc = readSource(DEMO_FILE);
  assert.ok(!demoSrc.includes("@anthropic"), "demo: imports model SDK");
});

test("no network APIs", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("node:http"), `${file}: imports http`);
    assert.ok(!src.includes("node:https"), `${file}: imports https`);
    assert.ok(!src.includes("node:net"), `${file}: imports net`);
    assert.ok(!src.includes("node:tls"), `${file}: imports tls`);
    assert.ok(!src.includes("fetch("), `${file}: uses fetch`);
  }
});

test("no external process APIs", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("node:child_process"), `${file}: imports child_process`);
    assert.ok(!src.includes("spawn"), `${file}: references spawn`);
    assert.ok(!src.includes("child_process"), `${file}: references child_process`);
    // RegExp.exec() is allowed; only check for actual exec()/execSync() system calls
    assert.ok(!/(?:require|import)\s*\(?.*child_process/.test(src), `${file}: imports child_process`);
    assert.ok(!/(?<!\.)exec\s*\(/.test(src), `${file}: references standalone exec()`);
    assert.ok(!/execSync/.test(src), `${file}: references execSync`);
  }
});

test("no host write or output-file APIs", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("writeFileSync"), `${file}: uses writeFileSync`);
    assert.ok(!src.includes("writeFile"), `${file}: uses writeFile`);
  }
  // demo.ts can use process.stdout.write (which it does) — that's allowed
});

test("no dynamic rule paths or arbitrary config loading", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes(".json"), `${file}: loads JSON files`);
    assert.ok(!src.includes(".yaml"), `${file}: loads YAML files`);
    assert.ok(!src.includes("readFileSync"), `${file}: uses readFileSync`);
  }
});

test("no process.argv usage in base-filter runtime", () => {
  for (const file of RUNTIME_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("process.argv"), `${file}: uses process.argv`);
  }
});

test("no console.log or raw-content logging", () => {
  for (const file of SCAN_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    assert.ok(!src.includes("console.log"), `${file}: uses console.log`);
  }
});

// ============================================================================
// Behavioral repository assertions
// ============================================================================

test("buildTrack1BaseFilterDemoReport has nine unique cases and results", async () => {
  const { buildTrack1BaseFilterDemoReport } = await import(
    "../../engines/sandbox/src/base-filter/evaluation.ts"
  );
  const { runAllTrack1BaseFilterCases } = await import(
    "../../engines/sandbox/src/base-filter/replay-adapter.ts"
  );
  const report = buildTrack1BaseFilterDemoReport(await runAllTrack1BaseFilterCases());
  assert.equal(report.summary.total_cases, 9);
  assert.equal(report.summary.exact_matches, 9);
  assert.equal(report.summary.exact_action_accuracy, 1);
  assert.equal(report.summary.unsafe_case_recall, 1);
  assert.equal(report.summary.negative_control_false_positive_rate, 0);
  assert.equal(report.cases.length, 9);
  assert.equal(report.results.length, 9);
  // Unique case IDs
  const caseIds = report.cases.map((c) => c.case_id);
  assert.equal(new Set(caseIds).size, 9);
  // Result case IDs match via metadata
  for (const r of report.results) {
    assert.ok(r.metadata?.monitor, "result should have monitor metadata");
  }
});

test("serializeTrack1BaseFilterDemo is byte-identical", async () => {
  const { serializeTrack1BaseFilterDemo } = await import(
    "../../engines/sandbox/src/base-filter/evaluation.ts"
  );
  const s1 = await serializeTrack1BaseFilterDemo();
  const s2 = await serializeTrack1BaseFilterDemo();
  assert.equal(s1, s2);
  const parsed = JSON.parse(s1);
  assert.equal(parsed.summary.total_cases, 9);
});

test("raw case values are absent from serialized report", async () => {
  const { serializeTrack1BaseFilterDemo } = await import(
    "../../engines/sandbox/src/base-filter/evaluation.ts"
  );
  const serialized = await serializeTrack1BaseFilterDemo();
  assert.ok(!serialized.includes("TRACK1_TEST_SECRET"));
  assert.ok(!serialized.includes("synthetic marker"));
});

test("source scan contains no case-answer branch", () => {
  for (const file of SCAN_FILES) {
    const src = readSource(`${BASE_FILTER_DIR}${file}`);
    // No branching on case/scenario IDs
    const lines = src.split("\n");
    for (const line of lines) {
      if (line.includes("case_id") || line.includes("scenario_id")) {
        // Only allowed in replay-adapter.ts and evaluation.ts
        if (file !== "replay-adapter.ts" && file !== "evaluation.ts") {
          assert.ok(
            !line.includes("T1-SC-"),
            `${file}: branches on case/scenario in core logic`
          );
        }
      }
    }
  }
});
