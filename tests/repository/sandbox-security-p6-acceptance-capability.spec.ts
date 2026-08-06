/**
 * Permanent P6 acceptance capability gates.
 *
 * Enforces the disjoint static import graphs of the fixed acceptance authority
 * and the four stage workers so the process-separation guarantees cannot regress
 * silently. Uses the TypeScript AST to read each file's import module specifiers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "../../frontend/node_modules/typescript/lib/typescript.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BENCHMARK_ROOT = resolve(
  REPO_ROOT,
  "scripts/benchmark/sandbox-security"
);

function benchmarkFile(name: string): string {
  return readFileSync(resolve(BENCHMARK_ROOT, name), "utf8");
}

function repositoryFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function importSpecifiers(name: string): readonly string[] {
  const text = benchmarkFile(name);
  const sourceFile = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    `${name} must parse without diagnostics`
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      specifiers.push((node.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

function assertNoSpecifierMatch(
  name: string,
  patterns: readonly RegExp[]
): void {
  const specifiers = importSpecifiers(name);
  for (const specifier of specifiers) {
    for (const pattern of patterns) {
      assert.doesNotMatch(
        specifier,
        pattern,
        `${name} must not import ${specifier}`
      );
    }
  }
}

const PRODUCTION_PATTERN = /security-production/u;
const CORE_SECURITY_PATTERN = /\/security\//u;
const EVALUATOR_PATTERN = /(?:^|\/)evaluate\.ts$/u;
const SEALER_PATTERN = /(?:^|\/)seal\.ts$/u;
const TRUTH_PATTERN = /truth/iu;
const CAPTURE_RUNTIME_PATTERN = /(?:^|\/)capture-live(?:-worker)?\.ts$/u;

test("REQ-SBX-GENERAL-002 acceptance authority imports no production, capture, evaluator, or sealer implementation", () => {
  assertNoSpecifierMatch("accept-live.ts", [
    PRODUCTION_PATTERN,
    CORE_SECURITY_PATTERN,
    EVALUATOR_PATTERN,
    SEALER_PATTERN,
    CAPTURE_RUNTIME_PATTERN,
    /prepare-capture-bundle\.ts$/u,
    /capture-candidate\.ts$/u
  ]);
});

test("REQ-SBX-GENERAL-002 acceptance authority is the sole signing-key reader", () => {
  const keyReaders = [
    "prepare-live-worker.ts",
    "capture-live-worker.ts",
    "evaluate-live-worker.ts",
    "seal-live-worker.ts"
  ];
  for (const worker of keyReaders) {
    assert.doesNotMatch(
      benchmarkFile(worker),
      /loadSandboxSecurityP6AcceptancePrivateKey/u,
      `${worker} must not read the signing key`
    );
    assert.doesNotMatch(
      benchmarkFile(worker),
      /createSandboxSecurityP6AcceptanceReceipt/u,
      `${worker} must not sign receipts`
    );
  }
  assert.match(
    benchmarkFile("accept-live.ts"),
    /loadSandboxSecurityP6AcceptancePrivateKey/u
  );
  assert.match(
    benchmarkFile("accept-live.ts"),
    /createSandboxSecurityP6AcceptanceReceipt/u
  );
});

test("REQ-SBX-GENERAL-002 acceptance authority is the sole credential env-file handoff", () => {
  const source = benchmarkFile("accept-live.ts");
  assert.match(source, /--env-file=/u);
  for (const worker of [
    "prepare-live-worker.ts",
    "capture-live-worker.ts",
    "evaluate-live-worker.ts",
    "seal-live-worker.ts"
  ]) {
    assert.doesNotMatch(
      benchmarkFile(worker),
      /--env-file=/u,
      `${worker} must not perform the credential env-file handoff`
    );
  }
});

test("REQ-SBX-GENERAL-002 prepare worker imports no production, evaluator, or sealer code", () => {
  assertNoSpecifierMatch("prepare-live-worker.ts", [
    PRODUCTION_PATTERN,
    CORE_SECURITY_PATTERN,
    EVALUATOR_PATTERN,
    SEALER_PATTERN,
    CAPTURE_RUNTIME_PATTERN
  ]);
});

test("REQ-SBX-GENERAL-002 capture worker imports no evaluator, sealer, or truth code", () => {
  assertNoSpecifierMatch("capture-live-worker.ts", [
    EVALUATOR_PATTERN,
    SEALER_PATTERN,
    TRUTH_PATTERN
  ]);
});

test("REQ-SBX-GENERAL-002 evaluator worker imports no production, network, or sealer code", () => {
  assertNoSpecifierMatch("evaluate-live-worker.ts", [
    PRODUCTION_PATTERN,
    SEALER_PATTERN
  ]);
  const specifiers = importSpecifiers("evaluate-live-worker.ts");
  for (const specifier of specifiers) {
    assert.doesNotMatch(specifier, /http-transport|node:https?|node:net/u, specifier);
  }
});

test("REQ-SBX-GENERAL-002 sealer worker imports no production, truth-join, or evaluator code", () => {
  assertNoSpecifierMatch("seal-live-worker.ts", [
    PRODUCTION_PATTERN,
    EVALUATOR_PATTERN,
    TRUTH_PATTERN
  ]);
});

test("REQ-SBX-GENERAL-002 capture candidate module stays production-neutral", () => {
  assertNoSpecifierMatch("capture-candidate.ts", [
    PRODUCTION_PATTERN,
    EVALUATOR_PATTERN,
    SEALER_PATTERN
  ]);
});

test("REQ-SBX-GENERAL-002 acceptance gates retain v2 retry sequences and fail-closed policy", () => {
  const capture = benchmarkFile("capture-live.ts");
  const replay = benchmarkFile("replay-hermetic.ts");
  const runbook = repositoryFile(
    "docs/superpowers/2026-07-26-p6-live-acceptance-operator-runbook.md"
  );

  assert.match(capture, /sandbox-security-benchmark-candidate-cassette\.v2/u);
  assert.match(capture, /assertSandboxSecurityBenchmarkAcceptedProviderOutcomes/u);
  assert.match(replay, /sandbox-security-hermetic-replay-input\.v2/u);
  assert.match(replay, /validateAttemptSequence/u);
  assert.match(runbook, /P6 retry amendment/u);
  assert.match(runbook, /exactly one retry/u);
  assert.match(runbook, /connection_failed/u);
  assert.match(runbook, /readiness.*no retry/is);
});

test("REQ-SBX-GENERAL-002 authority never spreads its own environment into workers", () => {
  const source = benchmarkFile("accept-live.ts");
  // The authority must not inherit its own process environment into any worker;
  // it builds each worker's closed environment explicitly.
  assert.doesNotMatch(source, /\.\.\.process\.env/u);
  assert.doesNotMatch(source, /env:\s*process\.env/u);
  for (const builder of [
    "createSandboxSecurityPrepareWorkerEnvironment",
    "createSandboxSecurityCaptureWorkerEnvironment",
    "createSandboxSecurityEvaluateWorkerEnvironment",
    "createSandboxSecuritySealWorkerEnvironment"
  ]) {
    assert.match(source, new RegExp(builder, "u"), builder);
  }
});

test("REQ-SBX-GENERAL-002 authority applies mode-600 hygiene to the credential env file", () => {
  const source = benchmarkFile("accept-live.ts");
  assert.match(source, /assertSandboxSecurityCredentialEnvFile/u);
  assert.match(source, /credential_env_file_mode_invalid/u);
  assert.match(source, /credential_env_file_symlink/u);
});

test("REQ-SBX-GENERAL-002 capture worker enforces the pinned P6 Judge binding profile", () => {
  const specifiers = importSpecifiers("capture-live-worker.ts");
  assert.ok(
    specifiers.some((specifier) => /p6-live-judge-binding\.ts$/u.test(specifier)),
    "capture worker must import the pinned Judge binding profile"
  );
  assert.match(
    benchmarkFile("capture-live-worker.ts"),
    /verifySandboxSecurityP6LiveJudgeBinding/u
  );
});

test("REQ-SBX-GENERAL-002 sealer re-verifies sealed artifacts against the signed evaluation binding", () => {
  const source = benchmarkFile("seal-live-worker.ts");
  assert.match(source, /candidate_tree_sha256/u);
  assert.match(source, /evaluation_report_sha256/u);
  assert.match(source, /benchmark_manifest_sha256/u);
  assert.match(source, /sealed_candidate_binding_mismatch/u);
  assert.match(source, /sealed_report_binding_mismatch/u);
  assert.match(source, /sealed_manifest_binding_mismatch/u);
});

test("REQ-SBX-GENERAL-002 live P6 and hermetic replay use the fixed complete-run policy", () => {
  assert.doesNotMatch(
    benchmarkFile("evaluate-live-worker.ts"),
    /report\.decided !== FIXTURE_COUNT/u
  );
  assert.match(
    benchmarkFile("evaluate-live-worker.ts"),
    /report\.infrastructure_codes\.length !== 0/u
  );
  assert.match(
    benchmarkFile("seal-live-worker.ts"),
    /sealSandboxSecurityCompleteRunCaptureWithReceiptChain/u
  );
  assert.match(
    benchmarkFile("replay-hermetic.ts"),
    /validateCompleteSandboxSecurityLiveEvidence/u
  );
  assert.doesNotMatch(
    benchmarkFile("replay-hermetic.ts"),
    /accepted_metrics\.accepted !== true/u
  );
});

test("REQ-SBX-GENERAL-002 authority binds the prepare and evaluation chain links", () => {
  const source = benchmarkFile("accept-live.ts");
  assert.match(source, /prepare_capture_chain_break/u);
  assert.match(source, /evaluation_receipt_chain_break/u);
});
