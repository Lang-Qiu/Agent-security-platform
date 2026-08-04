/**
 * P6 Stage 4: truth-blind sealer authority.
 *
 * Starts with every live variable absent and no truth-read permission. Verifies
 * and consumes both signed Ed25519 receipts, revalidates every binding from
 * snapshots, publishes the immutable evidence, and persists the canonical signed
 * receipt chain beside the seal. Imports the sealer and benchmark contracts
 * only — never production detectors or the evaluator's truth join.
 */

import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sealSandboxSecurityAcceptedCaptureWithReceiptChain } from "./seal.ts";
import { hashSandboxSecurityBenchmarkTree } from "./contracts.ts";
import {
  assertSandboxSecurityLiveRootBinding,
  snapshotSandboxSecurityJson,
} from "./fs-snapshot.ts";
import { assertSandboxSecurityLiveEnvironmentAbsent } from "./stage-protocol.ts";
import {
  consumeSandboxSecurityP6AcceptanceReceipt,
  hashSandboxSecurityP6AcceptanceReceipt,
  normalizeSandboxSecurityP6AcceptanceReceiptChain,
  type SandboxSecurityP6AcceptanceEvaluationBinding
} from "./p6-acceptance-protocol.ts";

const INVALID = "sandbox_security_seal_worker_reject";
const RUN_ID = /^[0-9a-f]{32}$/u;
const MAX_JSON_BYTES = 16 * 1024 * 1024;

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 160 &&
    /^(?:sandbox_security_[a-z_]+_(?:reject|invalid)):[a-z0-9_]+(?::[a-z0-9_./:,-]+)?$/u.test(
      message
    )
    ? message
    : `${INVALID}:internal`;
}

function loadReceiptJson(
  path: string
): Readonly<{ json: unknown; sha256: string }> {
  const resolved = resolve(path);
  const snapshot = snapshotSandboxSecurityJson({
    real_root: resolve(resolved, ".."),
    path: resolved,
    max_bytes: MAX_JSON_BYTES
  });
  return Object.freeze({ json: snapshot.json, sha256: snapshot.sha256_hex });
}

interface SealWorkerOptions {
  readonly corpus_root: string;
  readonly corpus_dev: string;
  readonly corpus_ino: string;
  readonly capture_parent_root: string;
  readonly capture_parent_dev: string;
  readonly capture_parent_ino: string;
  readonly candidate_root: string;
  readonly report: string;
  readonly output_root: string;
  readonly output_dev: string;
  readonly output_ino: string;
  readonly capture_receipt: string;
  readonly capture_receipt_registry: string;
  readonly evaluation_receipt: string;
  readonly evaluation_receipt_registry: string;
  readonly run_id: string;
}

function parseArgv(argv: readonly string[]): SealWorkerOptions {
  const values: Record<string, string> = {};
  const flags = [
    "--corpus-root=",
    "--corpus-dev=",
    "--corpus-ino=",
    "--capture-parent-root=",
    "--capture-parent-dev=",
    "--capture-parent-ino=",
    "--candidate-root=",
    "--report=",
    "--output-root=",
    "--output-dev=",
    "--output-ino=",
    "--capture-receipt=",
    "--capture-receipt-registry=",
    "--evaluation-receipt=",
    "--evaluation-receipt-registry=",
    "--run-id="
  ] as const;
  for (const token of argv) {
    const flag = flags.find((candidate) => token.startsWith(candidate));
    if (flag === undefined) fail("unknown_cli_argument");
    values[flag.slice(2, -1)] = token.slice(flag.length);
  }
  const required = [
    "corpus-root",
    "corpus-dev",
    "corpus-ino",
    "capture-parent-root",
    "capture-parent-dev",
    "capture-parent-ino",
    "candidate-root",
    "report",
    "output-root",
    "output-dev",
    "output-ino",
    "capture-receipt",
    "capture-receipt-registry",
    "evaluation-receipt",
    "evaluation-receipt-registry",
    "run-id"
  ] as const;
  for (const key of required) {
    if (values[key] === undefined) fail("missing_cli_arguments");
  }
  if (!RUN_ID.test(values["run-id"]!)) fail("run_id_invalid");
  return Object.freeze({
    corpus_root: values["corpus-root"]!,
    corpus_dev: values["corpus-dev"]!,
    corpus_ino: values["corpus-ino"]!,
    capture_parent_root: values["capture-parent-root"]!,
    capture_parent_dev: values["capture-parent-dev"]!,
    capture_parent_ino: values["capture-parent-ino"]!,
    candidate_root: values["candidate-root"]!,
    report: values["report"]!,
    output_root: values["output-root"]!,
    output_dev: values["output-dev"]!,
    output_ino: values["output-ino"]!,
    capture_receipt: values["capture-receipt"]!,
    capture_receipt_registry: values["capture-receipt-registry"]!,
    evaluation_receipt: values["evaluation-receipt"]!,
    evaluation_receipt_registry: values["evaluation-receipt-registry"]!,
    run_id: values["run-id"]!
  });
}

export async function runSandboxSecuritySealWorker(input: Readonly<{
  corpus_root: string;
  corpus_dev: string;
  corpus_ino: string;
  capture_parent_root: string;
  capture_parent_dev: string;
  capture_parent_ino: string;
  candidate_root: string;
  report: string;
  output_root: string;
  output_dev: string;
  output_ino: string;
  capture_receipt_path: string;
  capture_receipt_registry_path: string;
  evaluation_receipt_path: string;
  evaluation_receipt_registry_path: string;
  run_id: string;
}>): Promise<Readonly<{
  status: "seal_complete";
  seal_sha256: string;
  capture_manifest_sha256: string;
  replay_tree_sha256: string;
  replay_count: number;
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

  const captureReceiptRaw = loadReceiptJson(input.capture_receipt_path);
  const evaluationReceiptRaw = loadReceiptJson(input.evaluation_receipt_path);
  const captureReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    captureReceiptRaw.json,
    {
      consumer: "seal",
      registry_path: input.capture_receipt_registry_path
    }
  );
  const evaluationReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    evaluationReceiptRaw.json,
    {
      consumer: "seal",
      registry_path: input.evaluation_receipt_registry_path
    }
  );
  if (
    captureReceipt.issuer !== "capture" ||
    evaluationReceipt.issuer !== "evaluation" ||
    captureReceipt.run_id !== input.run_id ||
    evaluationReceipt.run_id !== input.run_id
  ) {
    fail("receipt_chain_invalid");
  }
  const evaluationBinding =
    evaluationReceipt.issued_binding as SandboxSecurityP6AcceptanceEvaluationBinding;
  const captureReceiptSha256 =
    hashSandboxSecurityP6AcceptanceReceipt(captureReceiptRaw.json);
  if (evaluationBinding.capture_receipt_sha256 !== captureReceiptSha256) {
    fail("receipt_chain_break");
  }

  // Re-verify every sealed artifact against the signed evaluation binding from
  // snapshots before publishing. The bindings are cryptographically signed, so a
  // candidate, report, or corpus swapped between evaluation and sealing cannot
  // reach published evidence.
  const corpusRoot = resolve(input.corpus_root);
  const candidateRoot = resolve(input.candidate_root);
  const reportPath = resolve(input.report);
  if (
    hashSandboxSecurityBenchmarkTree(candidateRoot) !==
    evaluationBinding.candidate_tree_sha256
  ) {
    fail("sealed_candidate_binding_mismatch");
  }
  const reportSnapshot = snapshotSandboxSecurityJson({
    real_root: resolve(reportPath, ".."),
    path: reportPath,
    max_bytes: MAX_JSON_BYTES
  });
  if (reportSnapshot.sha256_hex !== evaluationBinding.evaluation_report_sha256) {
    fail("sealed_report_binding_mismatch");
  }
  const manifestSnapshot = snapshotSandboxSecurityJson({
    real_root: corpusRoot,
    path: join(corpusRoot, "manifest.json"),
    max_bytes: MAX_JSON_BYTES
  });
  if (
    manifestSnapshot.sha256_hex !== evaluationBinding.benchmark_manifest_sha256
  ) {
    fail("sealed_manifest_binding_mismatch");
  }

  const evaluationReceiptSha256 =
    hashSandboxSecurityP6AcceptanceReceipt(evaluationReceiptRaw.json);
  const sealResult = await sealSandboxSecurityAcceptedCaptureWithReceiptChain({
    corpus_root: corpusRoot,
    candidate_capture_root: candidateRoot,
    evaluation_report_path: reportPath,
    output_root: resolve(input.output_root),
    receipt_chain_factory: ({
      seal_sha256,
      capture_manifest_sha256,
      replay_tree_sha256
    }) =>
      normalizeSandboxSecurityP6AcceptanceReceiptChain({
        schema_version: "sandbox-security-p6-acceptance-receipt-chain.v1",
        run_id: input.run_id,
        seal_sha256,
        capture_receipt_sha256: captureReceiptSha256,
        evaluation_receipt_sha256: evaluationReceiptSha256,
        capture_binding_sha256: captureReceipt.issued_binding_sha256,
        evaluation_binding_sha256: evaluationReceipt.issued_binding_sha256,
        capture_binding: captureReceipt.issued_binding,
        evaluation_binding: evaluationReceipt.issued_binding,
        evidence_binding: {
          capture_manifest_sha256,
          replay_tree_sha256,
          benchmark_manifest_sha256: evaluationBinding.benchmark_manifest_sha256,
          inputs_tree_sha256: evaluationBinding.inputs_tree_sha256,
          decisions_tree_sha256: evaluationBinding.decisions_tree_sha256,
          cassette_tree_sha256: evaluationBinding.cassette_tree_sha256,
          truth_tree_sha256: evaluationBinding.truth_tree_sha256,
          accepted_metrics_sha256: evaluationBinding.accepted_metrics_sha256,
          fixture_count: evaluationBinding.fixture_count
        },
        capture_receipt: captureReceipt,
        evaluation_receipt: evaluationReceipt
      })
  });

  return Object.freeze({
    status: "seal_complete" as const,
    seal_sha256: sealResult.seal_sha256,
    capture_manifest_sha256: sealResult.capture_manifest_sha256,
    replay_tree_sha256: sealResult.replay_tree_sha256,
    replay_count: sealResult.replay_count
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseArgv(argv);
  const summary = await runSandboxSecuritySealWorker({
    corpus_root: options.corpus_root,
    corpus_dev: options.corpus_dev,
    corpus_ino: options.corpus_ino,
    capture_parent_root: options.capture_parent_root,
    capture_parent_dev: options.capture_parent_dev,
    capture_parent_ino: options.capture_parent_ino,
    candidate_root: options.candidate_root,
    report: options.report,
    output_root: options.output_root,
    output_dev: options.output_dev,
    output_ino: options.output_ino,
    capture_receipt_path: options.capture_receipt,
    capture_receipt_registry_path: options.capture_receipt_registry,
    evaluation_receipt_path: options.evaluation_receipt,
    evaluation_receipt_registry_path: options.evaluation_receipt_registry,
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
