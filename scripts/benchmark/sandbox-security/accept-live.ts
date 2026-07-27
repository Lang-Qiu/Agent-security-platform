/**
 * P6 Stage 1: uncredentialed acceptance authority and receipt-signing root.
 *
 * Owns only the fixed launch of the four stage workers and the local Ed25519
 * signing key. It never imports production composition, capture runtime, the
 * evaluator, the sealer, or provider configuration; it receives only bounded,
 * content-free stage summaries and signs the capture and evaluation receipts.
 * The six live variables must be absent from its own environment; credentials
 * reach only the capture worker through a Node `--env-file` argument, and the
 * private key is never inherited by any worker.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSandboxSecurityP6AcceptanceReceipt,
  hashSandboxSecurityP6AcceptanceReceipt,
  loadSandboxSecurityP6AcceptancePrivateKey,
  type SandboxSecurityP6AcceptanceCaptureBinding,
  type SandboxSecurityP6AcceptanceEvaluationBinding
} from "./p6-acceptance-protocol.ts";
import {
  bindSandboxSecurityLiveRoots,
  writeSandboxSecurityExclusiveAtomicFile
} from "./fs-snapshot.ts";
import {
  assertSandboxSecurityLiveEnvironmentAbsent,
  createSandboxSecurityCaptureWorkerEnvironment,
  createSandboxSecurityEvaluateWorkerEnvironment,
  createSandboxSecurityPrepareWorkerEnvironment,
  createSandboxSecuritySealWorkerEnvironment,
  parseSandboxSecurityCaptureStageSummary,
  parseSandboxSecurityEvaluateStageSummary,
  parseSandboxSecurityPrepareStageSummary,
  parseSandboxSecuritySealStageSummary
} from "./stage-protocol.ts";

const INVALID = "sandbox_security_accept_live_reject";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../../..");
const DEFAULT_CORPUS_ROOT = resolve(
  REPOSITORY_ROOT,
  "samples/sandbox-security-benchmark/v1"
);
const PREPARE_WORKER = join(SCRIPT_DIR, "prepare-live-worker.ts");
const CAPTURE_WORKER = join(SCRIPT_DIR, "capture-live-worker.ts");
const EVALUATE_WORKER = join(SCRIPT_DIR, "evaluate-live-worker.ts");
const SEAL_WORKER = join(SCRIPT_DIR, "seal-live-worker.ts");

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function safeCliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return message.length <= 200 &&
    /^(?:sandbox_security_[a-z_]+_(?:reject|invalid)|capture_bundle_(?:invalid|reject)|corpus_validation_failed):[a-z0-9_]+(?::[a-z0-9_./:,-]+)?$/u.test(
      message
    )
    ? message
    : `${INVALID}:internal`;
}

/**
 * Applies the same hygiene to the credential env file as the private key: an
 * absolute, regular, non-symlink, single-hardlink, mode-0600 file. The path is
 * forwarded to the capture worker only as a Node --env-file argument.
 */
function assertSandboxSecurityCredentialEnvFile(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
    fail("credential_env_file_path_invalid");
  }
  let stat;
  try {
    stat = lstatSync(path, { bigint: true });
  } catch {
    fail("credential_env_file_missing");
  }
  if (stat.isSymbolicLink()) fail("credential_env_file_symlink");
  if (!stat.isFile()) fail("credential_env_file_not_regular");
  if (stat.nlink !== 1n) fail("credential_env_file_link_count_invalid");
  if ((stat.mode & 0o7777n) !== 0o600n) fail("credential_env_file_mode_invalid");
  if (stat.size <= 0n || stat.size > 65536n) {
    fail("credential_env_file_size_invalid");
  }
  return path;
}

interface StageRunResult {
  readonly exit_code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runWorker(input: Readonly<{
  worker: string;
  args: readonly string[];
  worker_env: Readonly<Record<string, string>>;
  credential_env_file?: string;
}>): StageRunResult {
  const nodeArgs = ["--experimental-strip-types"];
  if (input.credential_env_file !== undefined) {
    nodeArgs.push(`--env-file=${input.credential_env_file}`);
  }
  nodeArgs.push(input.worker, ...input.args);
  // A fixed closed environment: the authority never spreads its own process
  // environment into a worker, so no variable it inherited can reach any worker.
  // The six live variables reach the capture worker only through the Node
  // --env-file argument above. NOTE: Node applies NODE_OPTIONS found inside an
  // --env-file, so the operator-provided credential env file is a trusted input
  // that must contain only the six live keys (enforced by operator review and
  // documented in the runbook); the authority validates the file's mode and type
  // but does not read its contents, preserving the credential-read boundary.
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...input.worker_env }
  });
  return Object.freeze({
    exit_code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  });
}

export async function runSandboxSecurityAcceptedLiveCapture(input: Readonly<{
  corpus_root: string;
  capture_parent_root: string;
  output_root: string;
  credential_env_file: string;
  acceptance_private_key_path: string;
}>): Promise<Readonly<{
  run_id: string;
  replay_count: number;
  capture_manifest_sha256: string;
  seal_sha256: string;
  replay_tree_sha256: string;
  accepted_metrics_sha256: string;
  capture_receipt_sha256: string;
  evaluation_receipt_sha256: string;
}>> {
  if (!isPlainObject(input)) fail("input_invalid");
  const keys = Object.keys(input).sort();
  if (
    keys.length !== 5 ||
    keys[0] !== "acceptance_private_key_path" ||
    keys[1] !== "capture_parent_root" ||
    keys[2] !== "corpus_root" ||
    keys[3] !== "credential_env_file" ||
    keys[4] !== "output_root"
  ) {
    fail("input_invalid");
  }
  for (const key of keys) {
    if (typeof (input as Record<string, unknown>)[key] !== "string") {
      fail("input_invalid");
    }
  }

  // The authority itself must be uncredentialed; credentials reach only the
  // capture worker through the Node --env-file argument.
  assertSandboxSecurityLiveEnvironmentAbsent();

  const bound = bindSandboxSecurityLiveRoots({
    corpus_root: resolve(input.corpus_root),
    capture_parent_root: resolve(input.capture_parent_root),
    output_root: resolve(input.output_root)
  });
  const corpusRoot = bound.corpus_root.real_path;
  const captureParentRoot = bound.capture_parent_root.real_path;
  const outputRoot = bound.output_root.real_path;

  const privateKey = loadSandboxSecurityP6AcceptancePrivateKey(
    resolve(input.acceptance_private_key_path)
  );
  const credentialEnvFile = assertSandboxSecurityCredentialEnvFile(
    resolve(input.credential_env_file)
  );
  const runId = randomBytes(16).toString("hex");

  const workspace = join(captureParentRoot, `.p6-acceptance-${runId}`);
  mkdirSync(workspace, { mode: 0o700 });
  const descriptorPath = join(workspace, "bundle-descriptor.json");
  const captureReceiptPath = join(workspace, "capture-receipt.json");
  const evaluationReceiptPath = join(workspace, "evaluation-receipt.json");
  const candidateRoot = join(
    captureParentRoot,
    "capture-bundle",
    "capture-output",
    "candidate"
  );
  const reportPath = join(
    captureParentRoot,
    "capture-bundle",
    "capture-output",
    "evaluation-report.json"
  );

  // Stage 1 → prepare worker (uncredentialed, closed environment).
  const prepared = runWorker({
    worker: PREPARE_WORKER,
    args: [
      `--corpus-root=${corpusRoot}`,
      `--capture-parent-root=${captureParentRoot}`,
      `--descriptor-out=${descriptorPath}`
    ],
    worker_env: createSandboxSecurityPrepareWorkerEnvironment()
  });
  const prepareSummary = parseSandboxSecurityPrepareStageSummary(prepared);

  // Stage 2 → credentialed capture worker (six-variable env file only).
  const captured = runWorker({
    worker: CAPTURE_WORKER,
    args: [`--descriptor=${descriptorPath}`],
    worker_env: createSandboxSecurityCaptureWorkerEnvironment(),
    credential_env_file: credentialEnvFile
  });
  const captureSummary = parseSandboxSecurityCaptureStageSummary(captured);
  const captureBinding =
    captureSummary.issued_binding as SandboxSecurityP6AcceptanceCaptureBinding;
  // Bind the prepare → capture chain: the signed capture binding must carry the
  // exact input and code tree hashes the prepare worker reported.
  if (
    captureBinding.inputs_tree_sha256 !== prepareSummary.inputs_tree_sha256 ||
    captureBinding.code_tree_sha256 !== prepareSummary.code_tree_sha256 ||
    captureBinding.fixture_count !== prepareSummary.fixture_count
  ) {
    fail("prepare_capture_chain_break");
  }
  const captureReceipt = createSandboxSecurityP6AcceptanceReceipt({
    issuer: "capture",
    run_id: runId,
    issued_binding: captureBinding,
    private_key: privateKey
  });
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: workspace,
    path: captureReceiptPath,
    data: `${JSON.stringify(captureReceipt, null, 2)}\n`
  });
  const captureReceiptSha256 =
    hashSandboxSecurityP6AcceptanceReceipt(captureReceipt);

  // Stage 3 → truth-aware evaluator (uncredentialed, closed environment).
  const evaluated = runWorker({
    worker: EVALUATE_WORKER,
    args: [
      `--corpus-root=${corpusRoot}`,
      `--candidate-root=${candidateRoot}`,
      `--report-out=${reportPath}`,
      `--capture-receipt=${captureReceiptPath}`,
      `--run-id=${runId}`
    ],
    worker_env: createSandboxSecurityEvaluateWorkerEnvironment()
  });
  const evaluateSummary = parseSandboxSecurityEvaluateStageSummary(evaluated);
  const evaluationBinding =
    evaluateSummary.issued_binding as SandboxSecurityP6AcceptanceEvaluationBinding;
  if (
    evaluationBinding.capture_receipt_sha256 !== captureReceiptSha256 ||
    evaluationBinding.candidate_package_sha256 !==
      captureBinding.candidate_package_sha256 ||
    evaluationBinding.candidate_tree_sha256 !==
      captureBinding.candidate_tree_sha256 ||
    evaluationBinding.inputs_tree_sha256 !== captureBinding.inputs_tree_sha256 ||
    evaluationBinding.decisions_tree_sha256 !==
      captureBinding.decisions_tree_sha256 ||
    evaluationBinding.cassette_tree_sha256 !==
      captureBinding.cassette_tree_sha256
  ) {
    fail("evaluation_receipt_chain_break");
  }
  const evaluationReceipt = createSandboxSecurityP6AcceptanceReceipt({
    issuer: "evaluation",
    run_id: runId,
    issued_binding: evaluateSummary.issued_binding,
    private_key: privateKey
  });
  writeSandboxSecurityExclusiveAtomicFile({
    real_root: workspace,
    path: evaluationReceiptPath,
    data: `${JSON.stringify(evaluationReceipt, null, 2)}\n`
  });
  const evaluationReceiptSha256 =
    hashSandboxSecurityP6AcceptanceReceipt(evaluationReceipt);

  // Stage 4 → truth-blind sealer (uncredentialed, closed environment).
  const sealed = runWorker({
    worker: SEAL_WORKER,
    args: [
      `--corpus-root=${corpusRoot}`,
      `--candidate-root=${candidateRoot}`,
      `--report=${reportPath}`,
      `--output-root=${outputRoot}`,
      `--capture-receipt=${captureReceiptPath}`,
      `--evaluation-receipt=${evaluationReceiptPath}`,
      `--run-id=${runId}`
    ],
    worker_env: createSandboxSecuritySealWorkerEnvironment()
  });
  const sealSummary = parseSandboxSecuritySealStageSummary(sealed);

  return Object.freeze({
    run_id: runId,
    replay_count: sealSummary.replay_count,
    capture_manifest_sha256: sealSummary.capture_manifest_sha256,
    seal_sha256: sealSummary.seal_sha256,
    replay_tree_sha256: sealSummary.replay_tree_sha256,
    accepted_metrics_sha256: evaluationBinding.accepted_metrics_sha256,
    capture_receipt_sha256: captureReceiptSha256,
    evaluation_receipt_sha256: evaluationReceiptSha256
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
  let corpusRoot = DEFAULT_CORPUS_ROOT;
  let captureParentRoot = "";
  let outputRoot = "";
  let credentialEnvFile = "";
  let privateKeyPath = "";

  for (const arg of argv) {
    if (arg.startsWith("--corpus-root=")) {
      corpusRoot = arg.slice("--corpus-root=".length);
    } else if (arg.startsWith("--capture-parent-root=")) {
      captureParentRoot = arg.slice("--capture-parent-root=".length);
    } else if (arg.startsWith("--output-root=")) {
      outputRoot = arg.slice("--output-root=".length);
    } else if (arg.startsWith("--credential-env-file=")) {
      credentialEnvFile = arg.slice("--credential-env-file=".length);
    } else if (arg.startsWith("--acceptance-key=")) {
      privateKeyPath = arg.slice("--acceptance-key=".length);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: env -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST \\",
          "  -u SANDBOX_SECURITY_JUDGE_PROTOCOL -u SANDBOX_SECURITY_JUDGE_BASE_URL \\",
          "  -u SANDBOX_SECURITY_JUDGE_MODEL -u SANDBOX_SECURITY_JUDGE_API_KEY \\",
          "  -u SANDBOX_SECURITY_ENABLE_JUDGE \\",
          "  node --experimental-strip-types accept-live.ts \\",
          "  --capture-parent-root=<fresh-dir> --output-root=<evidence-dir> \\",
          "  --credential-env-file=<mode-600-env> --acceptance-key=<mode-600-key> \\",
          "  [--corpus-root=<corpus>]",
          "Runs prepare, credentialed capture, evaluation, and sealing as four",
          "fixed workers connected by signed Ed25519 receipts."
        ].join("\n") + "\n"
      );
      return;
    } else {
      fail("unknown_argument");
    }
  }

  if (captureParentRoot === "") fail("capture_parent_root_required");
  if (outputRoot === "") fail("output_root_required");
  if (credentialEnvFile === "") fail("credential_env_file_required");
  if (privateKeyPath === "") fail("acceptance_key_required");
  mkdirSync(resolve(captureParentRoot), { recursive: true, mode: 0o700 });
  mkdirSync(resolve(outputRoot), { recursive: true, mode: 0o700 });

  const result = await runSandboxSecurityAcceptedLiveCapture({
    corpus_root: corpusRoot,
    capture_parent_root: captureParentRoot,
    output_root: outputRoot,
    credential_env_file: credentialEnvFile,
    acceptance_private_key_path: privateKeyPath
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
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
