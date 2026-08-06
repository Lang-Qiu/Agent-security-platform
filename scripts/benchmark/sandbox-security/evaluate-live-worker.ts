/**
 * P6 Stage 3: truth-aware evaluator authority.
 *
 * Starts with every live variable absent. Verifies and consumes the signed
 * capture receipt, evaluates the candidate against corpus truth read through
 * immutable snapshots, writes one exclusive aggregate report, and emits one
 * complete-run `evaluation_accepted` frame. The frame means the 300-input
 * completeness gate passed; quality remains in the retained metrics. Imports
 * the evaluator and benchmark contracts
 * only — never production detectors, network, or the sealer.
 */

import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  writeSandboxSecurityEvaluationReport,
  type SandboxSecurityBenchmarkEvaluationReport
} from "./evaluate.ts";
import {
  hashSandboxSecurityBenchmarkTree
} from "./contracts.ts";
import {
  assertSandboxSecurityLiveRootBinding,
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

export function assertSandboxSecurityEvaluateWorkerAccepted(
  report: Readonly<SandboxSecurityBenchmarkEvaluationReport>
): void {
  // Live P6 acceptance is a completeness gate. The quality result remains
  // retained in accepted_metrics and is evaluated separately from this gate.
  // The evaluator has already validated the exact 300 decision projections;
  // report.decided is a quality-coverage metric and may include indeterminate
  // model outputs.
  if (report.infrastructure_codes.length !== 0) {
    fail("evaluation_not_accepted");
  }
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
  readonly corpus_dev: string;
  readonly corpus_ino: string;
  readonly capture_parent_root: string;
  readonly capture_parent_dev: string;
  readonly capture_parent_ino: string;
  readonly output_root: string;
  readonly output_dev: string;
  readonly output_ino: string;
  readonly candidate_root: string;
  readonly report_out: string;
  readonly capture_receipt: string;
  readonly receipt_registry: string;
  readonly run_id: string;
}

function parseArgv(argv: readonly string[]): EvaluateWorkerOptions {
  const values: Record<string, string> = {};
  const flags = [
    "--corpus-root=",
    "--corpus-dev=",
    "--corpus-ino=",
    "--capture-parent-root=",
    "--capture-parent-dev=",
    "--capture-parent-ino=",
    "--output-root=",
    "--output-dev=",
    "--output-ino=",
    "--candidate-root=",
    "--report-out=",
    "--capture-receipt=",
    "--receipt-registry=",
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
    values["corpus-dev"] === undefined ||
    values["corpus-ino"] === undefined ||
    values["capture-parent-root"] === undefined ||
    values["capture-parent-dev"] === undefined ||
    values["capture-parent-ino"] === undefined ||
    values["output-root"] === undefined ||
    values["output-dev"] === undefined ||
    values["output-ino"] === undefined ||
    candidateRoot === undefined ||
    reportOut === undefined ||
    captureReceipt === undefined ||
    values["receipt-registry"] === undefined ||
    runId === undefined
  ) {
    fail("missing_cli_arguments");
  }
  if (!RUN_ID.test(runId)) fail("run_id_invalid");
  return Object.freeze({
    corpus_root: corpusRoot,
    corpus_dev: values["corpus-dev"]!,
    corpus_ino: values["corpus-ino"]!,
    capture_parent_root: values["capture-parent-root"]!,
    capture_parent_dev: values["capture-parent-dev"]!,
    capture_parent_ino: values["capture-parent-ino"]!,
    output_root: values["output-root"]!,
    output_dev: values["output-dev"]!,
    output_ino: values["output-ino"]!,
    candidate_root: candidateRoot,
    report_out: reportOut,
    capture_receipt: captureReceipt,
    receipt_registry: values["receipt-registry"]!,
    run_id: runId
  });
}

export async function runSandboxSecurityEvaluateWorker(input: Readonly<{
  corpus_root: string;
  corpus_dev: string;
  corpus_ino: string;
  capture_parent_root: string;
  capture_parent_dev: string;
  capture_parent_ino: string;
  output_root: string;
  output_dev: string;
  output_ino: string;
  candidate_root: string;
  report_out: string;
  capture_receipt_path: string;
  receipt_registry_path: string;
  run_id: string;
}>): Promise<Readonly<{
  status: "evaluation_accepted";
  issued_binding: Readonly<Record<string, unknown>>;
}>> {
  assertSandboxSecurityLiveEnvironmentAbsent();

  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.corpus_root),
    dev: input.corpus_dev,
    ino: input.corpus_ino
  });
  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.capture_parent_root),
    dev: input.capture_parent_dev,
    ino: input.capture_parent_ino
  });
  assertSandboxSecurityLiveRootBinding({
    root: resolve(input.output_root),
    dev: input.output_dev,
    ino: input.output_ino
  });

  const captureReceiptPath = resolve(input.capture_receipt_path);
  const captureReceiptSnapshot = snapshotSandboxSecurityJson({
    real_root: resolve(captureReceiptPath, ".."),
    path: captureReceiptPath,
    max_bytes: MAX_JSON_BYTES
  });
  const captureReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    captureReceiptSnapshot.json,
    {
      consumer: "evaluation",
      registry_path: input.receipt_registry_path
    }
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
  assertSandboxSecurityEvaluateWorkerAccepted(report);
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
    corpus_dev: options.corpus_dev,
    corpus_ino: options.corpus_ino,
    capture_parent_root: options.capture_parent_root,
    capture_parent_dev: options.capture_parent_dev,
    capture_parent_ino: options.capture_parent_ino,
    output_root: options.output_root,
    output_dev: options.output_dev,
    output_ino: options.output_ino,
    candidate_root: options.candidate_root,
    report_out: options.report_out,
    capture_receipt_path: options.capture_receipt,
    receipt_registry_path: options.receipt_registry,
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
