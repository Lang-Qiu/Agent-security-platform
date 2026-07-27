/**
 * P6 Stage 3: truth-aware evaluator authority.
 *
 * Starts with every live variable absent. Verifies and consumes the signed
 * capture receipt, evaluates the candidate against corpus truth read through
 * immutable snapshots, writes one exclusive aggregate report, and emits one
 * evaluation_accepted frame. Imports the evaluator and benchmark contracts
 * only — never production detectors, network, or the sealer.
 */

import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSandboxSecurityAcceptanceThresholds,
  writeSandboxSecurityEvaluationReport
} from "./evaluate.ts";
import {
  hashSandboxSecurityBenchmarkTree
} from "./contracts.ts";
import {
  snapshotSandboxSecurityJson
} from "./fs-snapshot.ts";
import { assertSandboxSecurityLiveEnvironmentAbsent } from "./stage-protocol.ts";
import {
  consumeSandboxSecurityP6AcceptanceReceipt,
  hashSandboxSecurityP6AcceptanceReceipt,
  type SandboxSecurityP6AcceptanceCaptureBinding
} from "./p6-acceptance-protocol.ts";

const INVALID = "sandbox_security_evaluate_worker_reject";
const RUN_ID = /^[0-9a-f]{32}$/u;
const MAX_JSON_BYTES = 16 * 1024 * 1024;

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 160 &&
    /^(?:sandbox_security_[a-z_]+_reject|corpus_validation_failed):[a-z0-9_]+(?::[a-z0-9_./:,-]+)?$/u.test(
      message
    )
    ? message
    : `${INVALID}:internal`;
}

function sha256HexOfFile(path: string, realRoot: string): string {
  return snapshotSandboxSecurityJson({
    real_root: realRoot,
    path,
    max_bytes: MAX_JSON_BYTES
  }).sha256_hex;
}

interface EvaluateWorkerOptions {
  readonly corpus_root: string;
  readonly candidate_root: string;
  readonly report_out: string;
  readonly capture_receipt: string;
  readonly run_id: string;
}

function parseArgv(argv: readonly string[]): EvaluateWorkerOptions {
  const values: Record<string, string> = {};
  const flags = [
    "--corpus-root=",
    "--candidate-root=",
    "--report-out=",
    "--capture-receipt=",
    "--run-id="
  ] as const;
  for (const token of argv) {
    const flag = flags.find((candidate) => token.startsWith(candidate));
    if (flag === undefined) fail("unknown_cli_argument");
    values[flag.slice(2, -1)] = token.slice(flag.length);
  }
  const corpusRoot = values["corpus-root"];
  const candidateRoot = values["candidate-root"];
  const reportOut = values["report-out"];
  const captureReceipt = values["capture-receipt"];
  const runId = values["run-id"];
  if (
    corpusRoot === undefined ||
    candidateRoot === undefined ||
    reportOut === undefined ||
    captureReceipt === undefined ||
    runId === undefined
  ) {
    fail("missing_cli_arguments");
  }
  if (!RUN_ID.test(runId)) fail("run_id_invalid");
  return Object.freeze({
    corpus_root: corpusRoot,
    candidate_root: candidateRoot,
    report_out: reportOut,
    capture_receipt: captureReceipt,
    run_id: runId
  });
}

export async function runSandboxSecurityEvaluateWorker(input: Readonly<{
  corpus_root: string;
  candidate_root: string;
  report_out: string;
  capture_receipt_path: string;
  run_id: string;
}>): Promise<Readonly<{
  status: "evaluation_accepted";
  issued_binding: Readonly<Record<string, unknown>>;
}>> {
  assertSandboxSecurityLiveEnvironmentAbsent();

  const captureReceiptPath = resolve(input.capture_receipt_path);
  const captureReceiptSnapshot = snapshotSandboxSecurityJson({
    real_root: resolve(captureReceiptPath, ".."),
    path: captureReceiptPath,
    max_bytes: MAX_JSON_BYTES
  });
  const captureReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    captureReceiptSnapshot.json
  );
  if (captureReceipt.issuer !== "capture" || captureReceipt.run_id !== input.run_id) {
    fail("capture_receipt_binding_invalid");
  }
  const captureBinding =
    captureReceipt.issued_binding as SandboxSecurityP6AcceptanceCaptureBinding;
  const captureReceiptSha256 =
    hashSandboxSecurityP6AcceptanceReceipt(captureReceiptSnapshot.json);

  const corpusRoot = resolve(input.corpus_root);
  const candidateRoot = resolve(input.candidate_root);
  const reportPath = resolve(input.report_out);

  const report = await writeSandboxSecurityEvaluationReport({
    corpus_root: corpusRoot,
    candidate_capture_root: candidateRoot,
    report_path: reportPath
  });
  assertSandboxSecurityAcceptanceThresholds(report);
  if (report.accepted !== true || report.infrastructure_codes.length !== 0) {
    fail("evaluation_not_accepted");
  }
  if (
    report.capture_package_sha256 !== captureBinding.candidate_package_sha256 ||
    report.decisions_tree_sha256 !== captureBinding.decisions_tree_sha256 ||
    report.cassette_tree_sha256 !== captureBinding.cassette_tree_sha256
  ) {
    fail("evaluation_capture_binding_mismatch");
  }
  const candidateTreeSha256 = hashSandboxSecurityBenchmarkTree(candidateRoot);
  if (candidateTreeSha256 !== captureBinding.candidate_tree_sha256) {
    fail("evaluation_candidate_tree_mismatch");
  }

  const reportSha256 = sha256HexOfFile(reportPath, resolve(reportPath, ".."));
  const manifestSha256 = sha256HexOfFile(
    join(corpusRoot, "manifest.json"),
    corpusRoot
  );

  const issuedBinding = Object.freeze({
    capture_receipt_sha256: captureReceiptSha256,
    evaluation_report_sha256: reportSha256,
    benchmark_manifest_sha256: manifestSha256,
    candidate_package_sha256: captureBinding.candidate_package_sha256,
    candidate_tree_sha256: candidateTreeSha256,
    inputs_tree_sha256: captureBinding.inputs_tree_sha256,
    decisions_tree_sha256: captureBinding.decisions_tree_sha256,
    cassette_tree_sha256: captureBinding.cassette_tree_sha256,
    truth_tree_sha256: report.truth_tree_sha256,
    accepted_metrics_sha256: report.accepted_metrics_sha256,
    fixture_count: captureBinding.fixture_count
  });

  return Object.freeze({
    status: "evaluation_accepted" as const,
    issued_binding: issuedBinding
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseArgv(argv);
  const summary = await runSandboxSecurityEvaluateWorker({
    corpus_root: options.corpus_root,
    candidate_root: options.candidate_root,
    report_out: options.report_out,
    capture_receipt_path: options.capture_receipt,
    run_id: options.run_id
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  basename(fileURLToPath(import.meta.url)) === basename(resolve(entrypoint)) &&
  fileURLToPath(import.meta.url) === resolve(entrypoint)
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error_code: safeCliErrorCode(error) })}\n`
    );
    process.exitCode = 1;
  });
}
