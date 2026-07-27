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

import {
  sealSandboxSecurityAcceptedCapture
} from "./seal.ts";
import { hashSandboxSecurityBenchmarkTree } from "./contracts.ts";
import {
  snapshotSandboxSecurityJson,
  writeSandboxSecurityExclusiveAtomicFile
} from "./fs-snapshot.ts";
import { assertSandboxSecurityLiveEnvironmentAbsent } from "./stage-protocol.ts";
import {
  consumeSandboxSecurityP6AcceptanceReceipt,
  hashSandboxSecurityP6AcceptanceReceipt,
  type SandboxSecurityP6AcceptanceEvaluationBinding
} from "./p6-acceptance-protocol.ts";

const INVALID = "sandbox_security_seal_worker_reject";
const RUN_ID = /^[0-9a-f]{32}$/u;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const RECEIPT_CHAIN_SCHEMA_VERSION =
  "sandbox-security-p6-acceptance-receipt-chain.v1" as const;

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
  readonly candidate_root: string;
  readonly report: string;
  readonly output_root: string;
  readonly capture_receipt: string;
  readonly evaluation_receipt: string;
  readonly run_id: string;
}

function parseArgv(argv: readonly string[]): SealWorkerOptions {
  const values: Record<string, string> = {};
  const flags = [
    "--corpus-root=",
    "--candidate-root=",
    "--report=",
    "--output-root=",
    "--capture-receipt=",
    "--evaluation-receipt=",
    "--run-id="
  ] as const;
  for (const token of argv) {
    const flag = flags.find((candidate) => token.startsWith(candidate));
    if (flag === undefined) fail("unknown_cli_argument");
    values[flag.slice(2, -1)] = token.slice(flag.length);
  }
  const required = [
    "corpus-root",
    "candidate-root",
    "report",
    "output-root",
    "capture-receipt",
    "evaluation-receipt",
    "run-id"
  ] as const;
  for (const key of required) {
    if (values[key] === undefined) fail("missing_cli_arguments");
  }
  if (!RUN_ID.test(values["run-id"]!)) fail("run_id_invalid");
  return Object.freeze({
    corpus_root: values["corpus-root"]!,
    candidate_root: values["candidate-root"]!,
    report: values["report"]!,
    output_root: values["output-root"]!,
    capture_receipt: values["capture-receipt"]!,
    evaluation_receipt: values["evaluation-receipt"]!,
    run_id: values["run-id"]!
  });
}

export async function runSandboxSecuritySealWorker(input: Readonly<{
  corpus_root: string;
  candidate_root: string;
  report: string;
  output_root: string;
  capture_receipt_path: string;
  evaluation_receipt_path: string;
  run_id: string;
}>): Promise<Readonly<{
  status: "seal_complete";
  seal_sha256: string;
  capture_manifest_sha256: string;
  replay_tree_sha256: string;
  replay_count: number;
}>> {
  assertSandboxSecurityLiveEnvironmentAbsent();

  const captureReceiptRaw = loadReceiptJson(input.capture_receipt_path);
  const evaluationReceiptRaw = loadReceiptJson(input.evaluation_receipt_path);
  const captureReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    captureReceiptRaw.json
  );
  const evaluationReceipt = consumeSandboxSecurityP6AcceptanceReceipt(
    evaluationReceiptRaw.json
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

  const sealResult = await sealSandboxSecurityAcceptedCapture({
    corpus_root: corpusRoot,
    candidate_capture_root: candidateRoot,
    evaluation_report_path: reportPath,
    output_root: resolve(input.output_root)
  });

  const outputRoot = resolve(input.output_root);
  const sealSnapshot = snapshotSandboxSecurityJson({
    real_root: outputRoot,
    path: join(outputRoot, "seal.json"),
    max_bytes: MAX_JSON_BYTES
  });
  const replayTreeSha256 = hashSandboxSecurityBenchmarkTree(
    join(outputRoot, "replay")
  );

  const receiptChain = {
    schema_version: RECEIPT_CHAIN_SCHEMA_VERSION,
    run_id: input.run_id,
    seal_sha256: sealSnapshot.sha256_hex,
    capture_receipt_sha256: captureReceiptSha256,
    evaluation_receipt_sha256:
      hashSandboxSecurityP6AcceptanceReceipt(evaluationReceiptRaw.json),
    capture_receipt: captureReceipt,
    evaluation_receipt: evaluationReceipt
  };
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: outputRoot,
    path: join(outputRoot, "receipt-chain.json"),
    data: `${JSON.stringify(receiptChain, null, 2)}\n`
  });

  return Object.freeze({
    status: "seal_complete" as const,
    seal_sha256: sealSnapshot.sha256_hex,
    capture_manifest_sha256: sealResult.capture_manifest_sha256,
    replay_tree_sha256: replayTreeSha256,
    replay_count: sealResult.replay_count
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  const options = parseArgv(argv);
  const summary = await runSandboxSecuritySealWorker({
    corpus_root: options.corpus_root,
    candidate_root: options.candidate_root,
    report: options.report,
    output_root: options.output_root,
    capture_receipt_path: options.capture_receipt,
    evaluation_receipt_path: options.evaluation_receipt,
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
